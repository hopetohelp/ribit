package com.hopetohelp.ribit

import java.io.ByteArrayOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import javax.net.ssl.HttpsURLConnection
import org.json.JSONException
import org.json.JSONObject

internal data class AndroidRelease(val versionCode: Int, val versionName: String, val minSdk: Int) {
    companion object {
        const val STORE_URL = "https://ribit.hopetohelp.net/android"
        private const val CATALOG_URL = "https://ribit.hopetohelp.net/api/android/latest"
        private const val MAX_RESPONSE_BYTES = 4096
        private val versionPattern = Regex("[0-9]+\\.[0-9]+\\.[0-9]+")

        fun latest(): AndroidRelease? {
            val connection = try {
                URL(CATALOG_URL).openConnection() as HttpsURLConnection
            } catch (_: IOException) {
                return null
            }
            try {
                connection.connectTimeout = 5000
                connection.readTimeout = 5000
                connection.instanceFollowRedirects = false
                connection.useCaches = false
                connection.setRequestProperty("Accept", "application/json")
                if (connection.responseCode != HttpURLConnection.HTTP_OK) return null
                val json = connection.inputStream.use { input ->
                    val response = ByteArrayOutputStream()
                    val buffer = ByteArray(1024)
                    while (true) {
                        val length = input.read(buffer)
                        if (length == -1) break
                        if (response.size() + length > MAX_RESPONSE_BYTES) return null
                        response.write(buffer, 0, length)
                    }
                    JSONObject(response.toString("UTF-8"))
                }
                val release = AndroidRelease(
                    json.getInt("versionCode"),
                    json.getString("versionName"),
                    json.getInt("minSdk"),
                )
                return release.takeIf {
                    it.versionCode > 0 && versionPattern.matches(it.versionName) && it.minSdk > 0
                }
            } catch (_: IOException) {
                return null
            } catch (_: JSONException) {
                return null
            } finally {
                connection.disconnect()
            }
        }
    }
}
