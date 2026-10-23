package com.swiftloan.attribution

import com.android.installreferrer.api.InstallReferrerClient
import com.android.installreferrer.api.InstallReferrerStateListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

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
}
