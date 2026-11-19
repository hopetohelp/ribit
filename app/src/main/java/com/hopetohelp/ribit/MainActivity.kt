package com.hopetohelp.ribit

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.net.Uri
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.net.toUri
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.lifecycleScope
import androidx.webkit.WebViewAssetLoader
import com.hopetohelp.ribit.data.CalculationStore
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.json.JSONObject

class MainActivity : ComponentActivity() {
    private lateinit var appView: WebView
    private val store by lazy { CalculationStore(applicationContext) }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        applyTheme(false)

        val assets = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        appView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.setSupportMultipleWindows(false)
            settings.mediaPlaybackRequiresUserGesture = true
            if (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) {
                WebView.setWebContentsDebuggingEnabled(true)
            }

            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                    return assets.shouldInterceptRequest(request.url)
                        ?: WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", emptyMap(), ByteArray(0).inputStream())
                }

                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    if (request.isForMainFrame) openExternal(request.url, request.hasGesture())
                    return true
                }

                @Deprecated("Used by Android 6")
                override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
                    openExternal(url.toUri(), true)
                    return true
                }
            }
            addJavascriptInterface(LocalDevice(), "RibitDevice")
        }
        setContentView(appView)
        ViewCompat.setOnApplyWindowInsetsListener(appView) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, keyboard.bottom))
            WindowInsetsCompat.CONSUMED
        }
        ViewCompat.requestApplyInsets(appView)
        if (savedInstanceState == null || appView.restoreState(savedInstanceState) == null) {
            appView.loadUrl(APP_URL)
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                appView.evaluateJavascript("Boolean(window.Ribit && window.Ribit.back())") { handled ->
                    if (handled != "true" && !isFinishing) finish()
                }
            }
        })
    }

    override fun onSaveInstanceState(outState: Bundle) {
        appView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        appView.removeJavascriptInterface("RibitDevice")
        (appView.parent as? ViewGroup)?.removeView(appView)
        appView.destroy()
        super.onDestroy()
    }

    private fun applyTheme(dark: Boolean) {
        val light = 0xfffafbff.toInt()
        val graphite = 0xff13191a.toInt()
        val style = if (dark) SystemBarStyle.dark(graphite) else SystemBarStyle.light(light, graphite)
        enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
        if (::appView.isInitialized) appView.setBackgroundColor(if (dark) graphite else light)
    }

    private fun openExternal(uri: Uri, gesture: Boolean) {
        val approved = (uri.scheme == "https" && uri.host == "ribit.hopetohelp.net") ||
            uri.toString() == "mailto:hopetohelp.il@gmail.com"
        if (!gesture || !approved) return
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (_: ActivityNotFoundException) {
            // The app still displays the address when no handler is installed.
        }
    }

    private inner class LocalDevice {
        @JavascriptInterface
        fun exit() {
            runOnUiThread { if (!isFinishing) finish() }
        }

        @JavascriptInterface
        fun theme(dark: Boolean) {
            runOnUiThread { if (!isDestroyed) applyTheme(dark) }
        }

        @JavascriptInterface
        fun send(message: String) {
            val request = runCatching { Json.decodeFromString<JsonObject>(message) }.getOrNull() ?: return
            val id = request["id"]?.jsonPrimitive?.content ?: return
            val method = request["method"]?.jsonPrimitive?.content ?: return
            val data = request["data"]?.jsonObject ?: return
            lifecycleScope.launch {
                val response = try {
                    val result = withContext(Dispatchers.IO) { handleRequest(method, data) }
                    buildJsonObject { put("ok", true); put("result", result) }
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (_: Exception) {
                    buildJsonObject { put("ok", false) }
                }
                if (!isDestroyed) {
                    val safeId = JSONObject.quote(id)
                    val safeResponse = JSONObject.quote(response.toString())
                    appView.evaluateJavascript("window.RibitStorage.receive($safeId, $safeResponse)", null)
                }
            }
        }
    }

    private suspend fun handleRequest(method: String, data: JsonObject) = when (method) {
        "list" -> Json.encodeToJsonElement(
            kotlinx.serialization.builtins.ListSerializer(com.hopetohelp.ribit.data.SavedSummary.serializer()),
            store.summaries.first(),
        )
        "load" -> {
            val item = store.load(data.getValue("id").jsonPrimitive.content)
            if (item == null) JsonNull
            else buildJsonObject { put("title", item.first); put("calculation", item.second) }
        }
        "save" -> {
            val id = data["id"]?.jsonPrimitive?.contentOrNull
            val title = data.getValue("title").jsonPrimitive.content.trim()
            val calculation = data.getValue("calculation").jsonObject
            val count = calculation.getValue("plans").jsonArray.size
            val format = calculation["modelVersion"]?.jsonPrimitive?.intOrNull ?: 1
            require(title.isNotBlank() && title.length <= 80 && count in 1..2 && format in 1..2)
            JsonPrimitive(store.save(id, title, count, calculation))
        }
        "remove" -> {
            store.remove(data.getValue("id").jsonPrimitive.content)
            JsonNull
        }
        else -> error("Unsupported storage action")
    }

    private companion object {
        const val APP_URL = "https://appassets.androidplatform.net/assets/app.html"
    }
}
