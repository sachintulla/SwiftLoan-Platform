package com.swiftloan.uisound

import android.media.AudioAttributes
import android.media.SoundPool
import android.util.Base64
import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.util.concurrent.ConcurrentHashMap

private const val TAG = "UiSound"

/**
 * Short UI sound effects (typing ticks, taps, toggles, the agent's cues).
 *
 * JS hands over each sound once as a base64 WAV (see src/feedback/soundData.ts);
 * it is written to the cache dir and loaded into a SoundPool, which gives
 * low-latency, overlapping playback — a MediaPlayer cannot keep up with a
 * typing tick every 30 ms. Played as UI "sonification", never on the voice
 * stream, so it does not touch the agent's call audio.
 */
class UiSoundModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val ids = ConcurrentHashMap<String, Int>()
  private val ready = ConcurrentHashMap.newKeySet<Int>()

  private val pool: SoundPool by lazy {
    SoundPool.Builder()
      .setMaxStreams(6)
      .setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build(),
      )
      .build()
      .also { sp -> sp.setOnLoadCompleteListener { _, id, status -> if (status == 0) ready.add(id) } }
  }

  override fun getName() = "UiSound"

  @ReactMethod
  fun load(name: String, base64Wav: String) {
    try {
      if (ids.containsKey(name)) return
      val dir = File(reactContext.cacheDir, "ui_sounds").apply { mkdirs() }
      val file = File(dir, "$name.wav")
      file.writeBytes(Base64.decode(base64Wav, Base64.DEFAULT))
      ids[name] = pool.load(file.absolutePath, 1)
    } catch (e: Exception) {
      Log.w(TAG, "load($name) failed: ${e.message}")
    }
  }

  @ReactMethod
  fun play(name: String, volume: Double) {
    val id = ids[name] ?: return
    if (!ready.contains(id)) return
    val v = volume.toFloat().coerceIn(0f, 1f)
    pool.play(id, v, v, 1, 0, 1f)
  }

  override fun invalidate() {
    try {
      pool.release()
    } catch (_: Exception) {
    }
    super.invalidate()
  }
}
