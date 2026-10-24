package com.swiftloan.meta

import android.util.Log
import com.facebook.FacebookSdk
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Starts the native Meta SDK once JS has set the app id + client token (src/analytics/meta.ts).
 *
 * Why this exists: the SDK's own startup provider tries to initialise at launch, but the client
 * token is only known to JS, so that attempt fails (and is swallowed) and the SDK stays
 * uninitialised. Loading react-native-fbsdk-next then crashes the app at launch ("The SDK has
 * not been initialized"). Calling sdkInitialize() here, after setClientToken(), fixes that.
 * com.facebook.sdk.AutoInitEnabled is false, so this does NOT start data collection — that
 * still waits for FBSettings.initializeSDK() from JS.
 */
class MetaSdkInitModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "MetaSdkInit"

  /**
   * Synchronous on purpose: JS->native async calls are batched and flushed after the current JS
   * tick, but loading react-native-fbsdk-next instantiates its native modules immediately, so an
   * async init would run too late. Returns whether the SDK is initialised; JS leaves Meta off if not.
   */
  @ReactMethod(isBlockingSynchronousMethod = true)
  fun start(appId: String, clientToken: String): Boolean =
    try {
      FacebookSdk.setApplicationId(appId)
      FacebookSdk.setClientToken(clientToken)
      FacebookSdk.sdkInitialize(reactApplicationContext.applicationContext)
      FacebookSdk.isInitialized()
    } catch (t: Throwable) {
      Log.w("SwiftLoan", "Meta SDK init skipped", t)
      false
    }
}
