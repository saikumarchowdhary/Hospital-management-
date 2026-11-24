package com.careline.hms.data.local

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class TokenManager @Inject constructor(
    @ApplicationContext context: Context
) {
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs = EncryptedSharedPreferences.create(
        context,
        "careline_hms_secure_prefs",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    @Volatile
    private var memoryToken: String? = null

    fun saveSession(accessToken: String, refreshToken: String?, role: String) {
        memoryToken = accessToken
        prefs.edit()
            .putString(KEY_ACCESS, accessToken)
            .putString(KEY_REFRESH, refreshToken)
            .putString(KEY_ROLE, role)
            .apply()
    }

    fun getAccessToken(): String? = memoryToken ?: prefs.getString(KEY_ACCESS, null)
    fun getRefreshToken(): String? = prefs.getString(KEY_REFRESH, null)
    fun getRole(): String? = prefs.getString(KEY_ROLE, null)

    fun clearSession() {
        memoryToken = null
        prefs.edit().clear().apply()
    }

    private companion object {
        const val KEY_ACCESS = "access_token"
        const val KEY_REFRESH = "refresh_token"
        const val KEY_ROLE = "user_role"
    }
}
