package com.careline.hms.di

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.careline.hms.data.local.TokenManager
import com.careline.hms.data.remote.HmsApiService
import com.careline.hms.data.remote.HmsWebSocketClient
import com.careline.hms.data.repository.AuthenticationRepository
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Named
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AuthModule {

    @Provides
    @Singleton
    fun provideMasterKey(@ApplicationContext context: Context): MasterKey {
        return MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
    }

    @Provides
    @Singleton
    @Named("auth_encrypted_prefs")
    fun provideAuthEncryptedSharedPreferences(
        @ApplicationContext context: Context,
        masterKey: MasterKey
    ): SharedPreferences {
        return EncryptedSharedPreferences.create(
            context,
            "careline_hms_auth_meta",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    @Provides
    @Singleton
    fun provideAuthenticationRepository(
        api: HmsApiService,
        tokenManager: TokenManager,
        wsClient: HmsWebSocketClient,
        @Named("auth_encrypted_prefs") encryptedPrefs: SharedPreferences
    ): AuthenticationRepository {
        return AuthenticationRepository(
            api = api,
            tokenManager = tokenManager,
            wsClient = wsClient,
            encryptedPrefs = encryptedPrefs
        )
    }
}
