package com.swiftloan.panocr

import android.net.Uri
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.io.File

/**
 * On-device OCR for the PAN-card photo using ML Kit's on-device Latin text
 * recognizer. The image never leaves the device — we return the recognized
 * text and the JS layer extracts the PAN number from it.
 */
class PanOcrModule(rc: ReactApplicationContext) : ReactContextBaseJavaModule(rc) {
  override fun getName() = "PanOcrModule"

  @ReactMethod
  fun recognize(path: String, promise: Promise) {
    try {
      val uri: Uri = when {
        path.startsWith("file://") || path.startsWith("content://") -> Uri.parse(path)
        else -> Uri.fromFile(File(path))
      }
      val image = InputImage.fromFilePath(reactApplicationContext, uri)
      val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
      recognizer.process(image)
        .addOnSuccessListener { promise.resolve(it.text) }
        .addOnFailureListener { promise.reject("ocr_error", it.message, it) }
    } catch (e: Exception) {
      promise.reject("ocr_exception", e.message, e)
    }
  }
}
