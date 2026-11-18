package com.hopetohelp.ribit.ui

import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

internal val Ink = Color(0xFF182E24)
internal val Paper = Color(0xFFF5F6F0)
internal val Sage = Color(0xFFCEE6C6)
internal val Moss = Color(0xFF315B44)
internal val Clay = Color(0xFFA64E33)
internal val Muted = Color(0xFF516359)
internal val Border = Color(0xFFD6DED4)

private val colors = lightColorScheme(
    primary = Moss,
    onPrimary = Color.White,
    primaryContainer = Sage,
    onPrimaryContainer = Ink,
    secondary = Clay,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFF5DFD3),
    onSecondaryContainer = Color(0xFF512C20),
    background = Paper,
    onBackground = Ink,
    surface = Color(0xFFFCFDF8),
    onSurface = Ink,
    surfaceVariant = Color(0xFFE8EFE2),
    onSurfaceVariant = Muted,
    outline = Color(0xFF78887D),
    outlineVariant = Border,
    error = Color(0xFF9D301E),
)

private val type = Typography(
    displaySmall = Typography().displaySmall.copy(
        fontWeight = FontWeight.Bold,
        fontFeatureSettings = "tnum",
        letterSpacing = (-0.8).sp,
    ),
    headlineMedium = Typography().headlineMedium.copy(
        fontWeight = FontWeight.Bold,
        letterSpacing = (-0.45).sp,
    ),
    titleLarge = Typography().titleLarge.copy(fontWeight = FontWeight.SemiBold),
    titleMedium = Typography().titleMedium.copy(fontWeight = FontWeight.SemiBold),
    labelLarge = Typography().labelLarge.copy(fontWeight = FontWeight.SemiBold),
)

@Composable
fun RibitTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = colors, typography = type, content = content)
}

internal fun Modifier.focusRing(radius: Int = 24): Modifier = composed {
    var focused by remember { mutableStateOf(false) }
    onFocusChanged { focused = it.hasFocus }
        .border(2.dp, if (focused) Clay else Color.Transparent, RoundedCornerShape(radius.dp))
}
