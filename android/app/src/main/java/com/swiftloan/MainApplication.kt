package com.swiftloan

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.swiftloan.voice.VoiceAudioPackage
import com.upshotreactlibrary.UpshotApplication

/**
 * Extends UpshotApplication rather than android.app.Application.
 *
 * This is required, not cosmetic. UpshotApplication.onCreate() is the only place
 * its static `application` field is assigned, and initialiseBrandKinesis() is
 * called with that value. Extending plain Application left it null, so every
 * init failed with "Invalid parameters" — the SDK loaded and ran but could never
 * authenticate. UpshotApplication also registers the notification channel and
 * the foreground/background listener that re-inits the SDK on resume.
 */
class MainApplication : UpshotApplication(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
          add(VoiceAudioPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
    logFcmTokenInDebug()
  }

  /**
   * Debug-only: print the FCM registration token.
   *
   * There is no way to read the token from JS (the RN Upshot module exposes no
   * getter), and without it a push cannot be addressed to this handset — so
   * verifying push end-to-end is otherwise impossible. Gated on BuildConfig.DEBUG
   * so a release build never writes a device token to logcat, where any app with
   * READ_LOGS could harvest it.
   */
  private fun logFcmTokenInDebug() {
    if (!BuildConfig.DEBUG) return
    try {
      com.google.firebase.messaging.FirebaseMessaging.getInstance().token
        .addOnCompleteListener { task ->
          if (task.isSuccessful) {
            android.util.Log.i("SwiftLoanPush", "FCM_TOKEN=${task.result}")
          } else {
            android.util.Log.w("SwiftLoanPush", "FCM token fetch failed: ${task.exception?.message}")
          }
        }
    } catch (e: Exception) {
      android.util.Log.w("SwiftLoanPush", "FCM token unavailable: ${e.message}")
    }
  }
}
