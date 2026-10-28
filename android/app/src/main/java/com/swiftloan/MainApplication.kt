package com.swiftloan

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.swiftloan.voice.VoiceAudioPackage
import com.swiftloan.panocr.PanOcrPackage
import com.swiftloan.uisound.UiSoundPackage
import com.swiftloan.attribution.InstallReferrerPackage
import com.swiftloan.meta.MetaSdkInitPackage
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
          add(PanOcrPackage())
          add(UiSoundPackage())
          add(InstallReferrerPackage())
          add(MetaSdkInitPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
    forwardFcmTokenToUpshot()
  }

  /**
   * Fetch the FCM registration token and hand it to Upshot at startup.
   *
   * Upshot only learns the token two other ways: its own fetch at init (which does
   * not reliably reach the dashboard — devices showed "Device Push Token missing"),
   * and SwiftLoanMessagingService.onNewToken, which fires only on ROTATION, not on a
   * normal launch. So the initial token was never reported. We forward it the same
   * way onNewToken does — setUserInfoBundle({gcmId}) — but the SDK may not be
   * authenticated yet at onCreate (getBKInstance() == null), so retry briefly until
   * it is. In debug we also log the token (there is no JS getter) so a push can be
   * addressed to the handset; release builds never write it to logcat.
   */
  private fun forwardFcmTokenToUpshot() {
    try {
      com.google.firebase.messaging.FirebaseMessaging.getInstance().token
        .addOnCompleteListener { task ->
          if (!task.isSuccessful) {
            android.util.Log.w("SwiftLoanPush", "FCM token fetch failed: ${task.exception?.message}")
            return@addOnCompleteListener
          }
          val token = task.result
          if (token.isNullOrBlank()) return@addOnCompleteListener
          if (BuildConfig.DEBUG) android.util.Log.i("SwiftLoanPush", "FCM_TOKEN=$token")
          sendTokenToUpshot(token, 0)
        }
    } catch (e: Exception) {
      android.util.Log.w("SwiftLoanPush", "FCM token unavailable: ${e.message}")
    }
  }

  /** Forward once the SDK is authenticated; retry up to ~15s, then give up (onNewToken still covers rotation). */
  private fun sendTokenToUpshot(token: String, attempt: Int) {
    val bk = com.brandkinesis.BrandKinesis.getBKInstance()
    if (bk == null) {
      if (attempt >= 10) {
        android.util.Log.w("SwiftLoanPush", "Upshot not ready after retries; initial token not forwarded")
        return
      }
      android.os.Handler(android.os.Looper.getMainLooper())
        .postDelayed({ sendTokenToUpshot(token, attempt + 1) }, 1500)
      return
    }
    try {
      val info = android.os.Bundle().apply { putString("gcmId", token) }
      bk.setUserInfoBundle(info, null)
      android.util.Log.d("SwiftLoanPush", "FCM token forwarded to Upshot at startup")
    } catch (e: Exception) {
      android.util.Log.w("SwiftLoanPush", "could not forward FCM token at startup: ${e.message}")
    }
  }
}
