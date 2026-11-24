package com.careline.hms.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val CareLineColors = lightColorScheme(
    primary = Color(0xFF1E5EFF),
    onPrimary = Color.White,
    secondary = Color(0xFF4F46E5),
    onSecondary = Color.White,
    background = Color(0xFFF8FAFC),
    surface = Color.White,
    onSurface = Color(0xFF0F172A),
    error = Color(0xFFDC2626)
)

@Composable
fun CareLineTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = CareLineColors,
        content = content
    )
}
