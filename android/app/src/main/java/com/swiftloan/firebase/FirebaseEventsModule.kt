package com.swiftloan.firebase

import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.firebase.analytics.FirebaseAnalytics

/**
 * Logs one named funnel event to Firebase Analytics (src/analytics/firebase.ts).
 * Names only, never parameters: no amounts, lender, PAN or user data leave the app this way.
 * Never throws: with no google-services.json (FirebaseApp not initialised) it just does nothing.
 */
class FirebaseEventsModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "SwiftLoanFirebase"

  @ReactMethod
  fun logEvent(name: String) {
    try {
      FirebaseAnalytics.getInstance(reactApplicationContext.applicationContext).logEvent(name, null)
    } catch (t: Throwable) {
      Log.w("SwiftLoan", "Firebase event skipped: $name", t)
    }
  }
}
