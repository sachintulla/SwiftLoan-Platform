package com.swiftloan.push

import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import com.brandkinesis.BrandKinesis
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Receives FCM messages and hands Upshot ones to the Upshot SDK.
 *
 * This has to exist, and it has to be native.
 *
 * Neither the Upshot AAR nor react-native-upshotsdk declares a
 * FirebaseMessagingService — the only MESSAGING_EVENT receiver in the merged
 * manifest is Firebase's own base class at priority -500, which auto-displays
 * `notification`-type payloads and silently drops data-only ones. Upshot sends
 * its rich push as data-only (everything hangs off the `bk` key), so without
 * this class those notifications arrive at the device and are thrown away.
 *
 * It cannot live in JS: `onMessageReceived` fires when the app is killed or
 * backgrounded, when there is no React context and no JS running at all. A
 * JS-side handler would only ever work while the app happened to be open, which
 * is precisely when push matters least.
 */
class SwiftLoanMessagingService : FirebaseMessagingService() {

  companion object {
    private const val TAG = "SwiftLoanPush"

    /** Upshot keys every one of its payloads with `bk`. */
    private const val UPSHOT_KEY = "bk"
  }

  /**
   * A rotated token must reach Upshot or the device silently stops receiving
   * push. The SDK fetches the token itself at init, but only at init — rotation
   * afterwards is ours to report.
   */
  override fun onNewToken(token: String) {
    super.onNewToken(token)
    try {
      val bk = BrandKinesis.getBKInstance() ?: return
      val info = Bundle().apply { putString("gcmId", token) }
      bk.setUserInfoBundle(info, null)
      Log.d(TAG, "FCM token forwarded to Upshot")
    } catch (e: Exception) {
      Log.w(TAG, "could not forward FCM token: ${e.message}")
    }
  }

  override fun onMessageReceived(message: RemoteMessage) {
    super.onMessageReceived(message)

    val data = message.data
    if (data.isEmpty()) return

    // Anything without `bk` is not ours to render. Returning lets the default
    // Firebase handling deal with it rather than swallowing another sender's
    // notification.
    if (!data.containsKey(UPSHOT_KEY)) {
      Log.d(TAG, "non-Upshot push ignored")
      return
    }

    try {
      val bk = BrandKinesis.getBKInstance()
      if (bk == null) {
        // The SDK has not authenticated yet in this process. Dropping is
        // correct: rendering without it would produce an untracked notification
        // that reports no open or click back to Upshot.
        Log.w(TAG, "Upshot not initialised — push dropped")
        return
      }

      val bundle = Bundle().apply { data.forEach { (k, v) -> putString(k, v) } }
      applySmallIcon(bundle)

      val allowForeground = metaData()?.getBoolean("UpshotAllowForegroundPush", false) ?: false
      bk.buildEnhancedPushNotification(applicationContext, bundle, allowForeground)
      Log.d(TAG, "Upshot push rendered")
    } catch (e: Exception) {
      Log.w(TAG, "failed to render Upshot push: ${e.message}")
    }
  }

  private fun metaData(): Bundle? = try {
    packageManager.getApplicationInfo(packageName, PackageManager.GET_META_DATA).metaData
  } catch (e: PackageManager.NameNotFoundException) {
    null
  }

  /**
   * Without an explicit small icon Android renders a grey square on API 21+,
   * so this is a visible-quality issue rather than a nicety.
   */
  private fun applySmallIcon(bundle: Bundle) {
    val md = metaData() ?: return
    val iconName = md.getString("UpshotPushSmallIcon") ?: return
    val resId = resources.getIdentifier(iconName, "drawable", packageName)
    if (resId > 0) bundle.putInt(BrandKinesis.BK_LOLLIPOP_NOTIFICATION_ICON, resId)
    val color = md.getInt("UpshotPushSmallIconColor", 0)
    if (color != 0) bundle.putInt(BrandKinesis.BK_LOLLIPOP_NOTIFICATION_ICON_BG_COLOR, color)
  }
}
