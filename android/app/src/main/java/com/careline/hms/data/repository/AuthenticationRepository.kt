package com.careline.hms.data.repository

import android.content.SharedPreferences
import com.careline.hms.data.local.TokenManager
import com.careline.hms.data.remote.*
import javax.inject.Inject
import javax.inject.Named
import javax.inject.Singleton

/**
 * AuthenticationRepository integrates with Retrofit (HmsApiService), WebSocket live sync
 * (HmsWebSocketClient), and encrypted storage powered by androidx.security:security-crypto
 * (EncryptedSharedPreferences + AES256_GCM MasterKey provided via Hilt AuthModule) to handle
 * token storage, login, registration, session restoration, token refresh, and logout workflows.
 */
@Singleton
class AuthenticationRepository @Inject constructor(
    private val api: HmsApiService,
    private val tokenManager: TokenManager,
    private val wsClient: HmsWebSocketClient,
    @Named("auth_encrypted_prefs") private val encryptedPrefs: SharedPreferences
) {
    suspend fun login(identifier: String, password: String): Result<UserDto> = runCatching {
        val res = api.login(LoginRequest(identifier.trim(), password, remember = true))
        persistAuthenticatedSession(res.token, res.refreshToken, res.user)
        wsClient.connect()
        res.user
    }

    suspend fun registerPatient(request: RegisterPatientRequest): Result<UserDto> = runCatching {
        val res = api.registerPatient(request)
        persistAuthenticatedSession(res.token, res.refreshToken, res.user)
        wsClient.connect()
        res.user
    }

    suspend fun restoreSession(): Result<UserDto?> = runCatching {
        val currentToken = tokenManager.getAccessToken()
        val refreshToken = tokenManager.getRefreshToken()
        if (currentToken.isNullOrBlank() && refreshToken.isNullOrBlank()) {
            return@runCatching null
        }
        val user = try {
            api.getCurrentUser().user
        } catch (_: Exception) {
            if (refreshToken.isNullOrBlank()) {
                clearLocalSession()
                return@runCatching null
            }
            val refreshed = api.refreshToken(RefreshTokenRequest(refreshToken))
            persistAuthenticatedSession(refreshed.token, refreshed.refreshToken, refreshed.user)
            refreshed.user
        }
        wsClient.connect()
        user
    }

    suspend fun refreshSession(): Result<UserDto> = runCatching {
        val refresh = tokenManager.getRefreshToken()
            ?: throw IllegalStateException("No encrypted refresh token available")
        val res = api.refreshToken(RefreshTokenRequest(refresh))
        persistAuthenticatedSession(res.token, res.refreshToken, res.user)
        res.user
    }

    suspend fun requestPasswordReset(email: String): Result<String> = runCatching {
        api.forgotPassword(ForgotPasswordRequest(email.trim())).message ?: "Reset code sent."
    }

    suspend fun logout() {
        runCatching { api.logout() }
        wsClient.disconnect()
        clearLocalSession()
    }

    fun hasStoredSession(): Boolean = !tokenManager.getAccessToken().isNullOrBlank()
    fun getAccessToken(): String? = tokenManager.getAccessToken()
    fun getRole(): String? = tokenManager.getRole()
    fun getLastIdentifier(): String? = encryptedPrefs.getString(KEY_LAST_IDENTIFIER, null)

    private fun persistAuthenticatedSession(accessToken: String, refreshToken: String?, user: UserDto) {
        tokenManager.saveSession(accessToken, refreshToken, user.role)
        encryptedPrefs.edit()
            .putString(KEY_LAST_IDENTIFIER, user.email)
            .putString(KEY_USER_CODE, user.userCode)
            .putLong(KEY_USER_ID, user.id)
            .apply()
    }

    private fun clearLocalSession() {
        tokenManager.clearSession()
        encryptedPrefs.edit().clear().apply()
    }

    private companion object {
        const val KEY_LAST_IDENTIFIER = "last_identifier"
        const val KEY_USER_CODE = "user_code"
        const val KEY_USER_ID = "user_id"
    }
}
