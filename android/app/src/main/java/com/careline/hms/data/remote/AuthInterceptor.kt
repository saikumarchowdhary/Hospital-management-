package com.careline.hms.data.remote

import com.careline.hms.data.local.TokenManager
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject

class AuthInterceptor @Inject constructor(
    private val tokenManager: TokenManager
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val builder = chain.request().newBuilder()
            .header("X-Requested-With", "MediCore-HMS")
            .header("Accept", "application/json")

        val token = tokenManager.getAccessToken()
        if (!token.isNullOrBlank()) {
            builder.header("Authorization", "Bearer $token")
        }
        return chain.proceed(builder.build())
    }
}
