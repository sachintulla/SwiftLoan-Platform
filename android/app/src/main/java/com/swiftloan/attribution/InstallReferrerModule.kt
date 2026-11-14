package com.swiftloan.attribution

import android.annotation.SuppressLint
import android.content.pm.ApplicationInfo
import android.os.Build
import android.provider.Settings
import com.android.installreferrer.api.InstallReferrerClient
import com.android.installreferrer.api.InstallReferrerStateListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeMap

/**
 * Google Play Install Referrer — the deterministic half of install attribution.
 *
 * When the visitor reached Play through our /dl link, the server put the click id in the
 * store URL's `referrer` parameter; Play hands it back here on first launch. Resolves null
 * when there is nothing to report (sideloaded APK, no Play, API unavailable) — never rejects,
 * so JS can simply fall back to the IP-window match.
 */
class InstallReferrerModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "InstallReferrer"

  @ReactMethod
  fun getInstallReferrer(promise: Promise) {
    var settled = false
    fun settle(value: String?) {
      if (settled) return
      settled = true
      promise.resolve(value)
    }
    try {
      val client = InstallReferrerClient.newBuilder(reactApplicationContext).build()
      client.startConnection(object : InstallReferrerStateListener {
        override fun onInstallReferrerSetupFinished(responseCode: Int) {
          try {
            if (responseCode == InstallReferrerClient.InstallReferrerResponse.OK) {
              settle(client.installReferrer.installReferrer)
            } else {
              settle(null)
            }
          } catch (_: Exception) {
            settle(null)
          } finally {
            try { client.endConnection() } catch (_: Exception) {}
          }
        }

        override fun onInstallReferrerServiceDisconnected() = settle(null)
      })
    } catch (_: Exception) {
      settle(null)
    }
  }

  /**
   * What the server needs to count this install once per phone (server/src/lib/installDedup.ts):
   *  - deviceId: ANDROID_ID. Unique per phone AND per app signing key, so it survives uninstall + reinstall
   *    (only a factory reset changes it). It is NOT the advertising ID; the server stores only a hash of it.
   *  - installer: the package that installed the app (com.android.vending = Google Play; none = sideloaded APK).
   *  - debug: a development build, never counted as a user install.
   * Never rejects: a field it cannot read is null.
   */
  @SuppressLint("HardwareIds")
  @ReactMethod
  fun getInstallInfo(promise: Promise) {
    val ctx = reactApplicationContext
    val out = WritableNativeMap()
    fun safe(block: () -> String?): String? = try { block() } catch (_: Exception) { null }
    out.putString("deviceId", safe { Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ANDROID_ID) })
    out.putString("installer", safe {
      val pm = ctx.packageManager
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) pm.getInstallSourceInfo(ctx.packageName).installingPackageName
      else @Suppress("DEPRECATION") pm.getInstallerPackageName(ctx.packageName)
    })
    out.putBoolean("debug", (ctx.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0)
    out.putString("appVersion", safe { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName })
    out.putString("buildNumber", safe {
      val info = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode.toString() else @Suppress("DEPRECATION") info.versionCode.toString()
    })
    out.putString("model", safe { "${Build.MANUFACTURER} ${Build.MODEL}".trim() })
    promise.resolve(out)
  }
}
