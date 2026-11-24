package com.careline.hms.data.remote

import com.careline.hms.BuildConfig
import com.careline.hms.data.local.TokenManager
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton

data class WsEvent(
    val eventType: String,
    val title: String? = null,
    val message: String? = null
)

@Singleton
class HmsWebSocketClient @Inject constructor(
    private val okHttpClient: OkHttpClient,
    private val tokenManager: TokenManager
) {
    private var webSocket: WebSocket? = null
    private val _events = MutableSharedFlow<WsEvent>(extraBufferCapacity = 32)
    val events: SharedFlow<WsEvent> = _events

    fun connect() {
        val token = tokenManager.getAccessToken() ?: return
        disconnect()
        val request = Request.Builder()
            .url("${BuildConfig.WS_BASE_URL}?token=$token")
            .build()

        webSocket = okHttpClient.newWebSocket(request, object : WebSocketListener() {
            override fun onMessage(webSocket: WebSocket, text: String) {
                runCatching {
                    val json = JSONObject(text)
                    val type = json.optString("eventType", "unknown")
                    val title = json.optString("title", "").ifBlank { null }
                    val msg = json.optString("message", "").ifBlank { null }
                    _events.tryEmit(WsEvent(type, title, msg))
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                _events.tryEmit(WsEvent("connection:error", "Live Sync Offline", t.message))
            }
        })
    }

    fun disconnect() {
        webSocket?.close(1000, "Session ended")
        webSocket = null
    }
}
