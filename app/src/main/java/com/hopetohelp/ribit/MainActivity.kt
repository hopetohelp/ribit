package com.hopetohelp.ribit

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.lifecycle.viewmodel.compose.viewModel
import com.hopetohelp.ribit.ui.RibitApp
import com.hopetohelp.ribit.ui.RibitTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val scrim = 0xFFF5F6F0.toInt()
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.light(scrim, scrim),
            navigationBarStyle = SystemBarStyle.light(scrim, 0xFF254638.toInt()),
        )
        setContent {
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                RibitTheme { RibitApp(viewModel()) }
            }
        }
    }
}
