package com.swiftloan.voice

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.AutomaticGainControl
import android.media.audiofx.NoiseSuppressor
import android.os.Build
import android.util.Base64
import android.util.Log
import androidx.core.content.ContextCompat
import com.swiftloan.BuildConfig
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlin.math.max

private const val SAMPLE_RATE = 16000
private const val CHUNK_SAMPLES = 640 // 40ms @ 16kHz

// Software automatic gain control, used ONLY when the device exposes no hardware
// AutomaticGainControl. The browser's getUserMedia guarantees autoGainControl;
// this substitutes for that missing device capability so the audio we hand Ello is
// levelled the same way a browser client's would be. It is not VAD or
// turn-detection logic — those belong to Ello, which owns speech-boundary
// decisions; our only job is to deliver faithful, well-levelled 16kHz PCM16.
//
// (A client-side noise gate previously lived here to force turns to close faster.
// It was removed: silencing audio is a VAD workaround, it risks clipping speech
// onsets, and the platform NoiseSuppressor now handles the ambient floor in DSP.)
private const val AGC_TARGET_PEAK = 9000
private const val AGC_MAX_GAIN = 8.0
private const val AGC_MIN_GAIN = 1.0
// Envelope smoothing so gain rides the recent loudness instead of jumping per chunk.
private const val AGC_ENVELOPE_DECAY = 0.85

/**
 * Native audio module for the voice-command agent: mic capture (16kHz mono
 * PCM16, base64-encoded, emitted as JS events) and streaming playback of
 * incoming PCM16 chunks. Replaces @ello/agent-sdk's browser-only
 * audio/capture.ts + audio/playback.ts (Web Audio API has no RN equivalent).
 */
class VoiceAudioModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "VoiceAudioModule"

  @Volatile private var isRecording = false
  private var recordThread: Thread? = null
  private var audioRecord: AudioRecord? = null
  private var audioTrack: AudioTrack? = null
  private var aec: AcousticEchoCanceler? = null
  private var noiseSuppressor: NoiseSuppressor? = null
  private var hardwareAgc: AutomaticGainControl? = null

  /**
   * Attaches the platform voice-processing effects to the capture session — the
   * direct equivalents of the browser's getUserMedia
   * {echoCancellation, noiseSuppression, autoGainControl}.
   *
   * AEC is the one that matters most: the loudspeaker feeds back into the mic, and
   * without cancellation the agent's own voice is streamed back as if the user were
   * talking, so server-side barge-in cuts the agent off mid-sentence and it falls
   * silent. Cancelling the echo here (rather than muting the mic while the agent
   * speaks) keeps the mic live, so the user can still interrupt at any time.
   */
  private fun attachVoiceEffects(sessionId: Int) {
    try {
      if (AcousticEchoCanceler.isAvailable()) {
        aec = AcousticEchoCanceler.create(sessionId)?.also { it.enabled = true }
        dlog("AEC attached, enabled=${aec?.enabled}")
      } else {
        Log.w("VoiceAudioModule", "AEC NOT available on this device — echo may cause self-interruption")
      }
      if (NoiseSuppressor.isAvailable()) {
        noiseSuppressor = NoiseSuppressor.create(sessionId)?.also { it.enabled = true }
        dlog("NoiseSuppressor attached, enabled=${noiseSuppressor?.enabled}")
      }
      if (AutomaticGainControl.isAvailable()) {
        hardwareAgc = AutomaticGainControl.create(sessionId)?.also { it.enabled = true }
        dlog("Hardware AGC attached, enabled=${hardwareAgc?.enabled}")
      } else {
        dlog("No hardware AGC — software AGC will carry the levelling")
      }
    } catch (e: Exception) {
      Log.e("VoiceAudioModule", "attachVoiceEffects failed: ${e.message}")
    }
  }

  private fun releaseVoiceEffects() {
    try {
      aec?.release(); noiseSuppressor?.release(); hardwareAgc?.release()
    } catch (_: Exception) {
    }
    aec = null; noiseSuppressor = null; hardwareAgc = null
  }

  /** Debug-only logging. Compiled out of release builds so a shipped app doesn't
   *  narrate the user's call into logcat. Genuine errors still use Log.e. */
  private fun dlog(msg: String) {
    if (BuildConfig.DEBUG) Log.d("VoiceAudioModule", msg)
  }

  private val audioManager: AudioManager
    get() = reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager

  /**
   * Logs the media-stream volume so an inaudible-agent report can be checked
   * against the actual device level.
   *
   * NOTE: deliberately does NOT set MODE_IN_COMMUNICATION. Measured on-device,
   * communication mode engaged aggressive AEC/noise-suppression that dropped mic
   * peaks from ~14500 to ~600 — the agent then couldn't hear the user at all.
   * Playback audibility is instead achieved with USAGE_MEDIA (see
   * ensurePlaybackTrack), which plays out the loudspeaker at media volume and
   * leaves the capture path untouched.
   */
  private fun logAudioState() {
    try {
      val am = audioManager
      dlog(
        "audio state: mode=${am.mode} musicVol=${am.getStreamVolume(AudioManager.STREAM_MUSIC)}/" +
          "${am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)}",
      )
    } catch (e: Exception) {
      Log.e("VoiceAudioModule", "logAudioState failed: ${e.message}")
    }
  }

  /**
   * Bridges JS-side logging into logcat. Necessary because under the New
   * Architecture (bridgeless) `console.log` does not stream to logcat, which
   * otherwise makes the whole JS half of the voice pipeline invisible on-device.
   * Read with: adb logcat -s VoiceJS:D
   */
  @ReactMethod
  fun nativeLog(msg: String) {
    if (BuildConfig.DEBUG) Log.d("VoiceJS", msg)
  }

  // Required by RN's NativeEventEmitter (JS side wraps this module in one) even
  // though actual emission goes straight through RCTDeviceEventEmitter below —
  // without these no-ops, NativeEventEmitter logs an "addListener" warning.
  @ReactMethod
  fun addListener(eventName: String) {}

  @ReactMethod
  fun removeListeners(count: Int) {}

  @ReactMethod
  fun requestMicPermission(promise: Promise) {
    val granted = ContextCompat.checkSelfPermission(reactApplicationContext, Manifest.permission.RECORD_AUDIO) ==
      PackageManager.PERMISSION_GRANTED
    promise.resolve(granted)
  }

  @ReactMethod
  fun startCapture(promise: Promise) {
    if (ContextCompat.checkSelfPermission(reactApplicationContext, Manifest.permission.RECORD_AUDIO) !=
      PackageManager.PERMISSION_GRANTED
    ) {
      promise.reject("permission_denied", "RECORD_AUDIO permission not granted")
      return
    }
    logAudioState()
    try {
      val minBuf = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
      val bufferSize = max(minBuf, CHUNK_SAMPLES * 2 * 4)
      val record = AudioRecord(
        MediaRecorder.AudioSource.VOICE_COMMUNICATION,
        SAMPLE_RATE,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
        bufferSize,
      )
      audioRecord = record
      // Must attach before recording starts so the effects are in the chain.
      attachVoiceEffects(record.audioSessionId)
      record.startRecording()
      isRecording = true
      dlog("startCapture: AudioRecord.startRecording() OK, minBuf=$minBuf")

      val thread = Thread {
        val chunk = ShortArray(CHUNK_SAMPLES)
        var chunkCount = 0
        var totalBytesSent = 0L
        var envelope = 0.0
        var lastGain = 1.0
        // Only level in software when the device gave us no hardware AGC.
        val needSoftwareAgc = hardwareAgc == null
        while (isRecording) {
          val read = record.read(chunk, 0, CHUNK_SAMPLES)
          if (read > 0) {
            var maxAbs = 0
            for (i in 0 until read) {
              val a = kotlin.math.abs(chunk[i].toInt())
              if (a > maxAbs) maxAbs = a
            }

            // Levelling only — every sample is forwarded. Deciding what counts as
            // speech, when a turn ends, and when to barge in is Ello's job; we do
            // not gate, trim or withhold audio, so its VAD sees the real signal.
            val gain: Double
            if (needSoftwareAgc) {
              // Envelope-tracked gain (not per-chunk) so it doesn't pump between
              // syllables; every sample is hard-limited against wrap-around.
              if (maxAbs > AGC_TARGET_PEAK / AGC_MAX_GAIN) {
                envelope = max(maxAbs.toDouble(), envelope * AGC_ENVELOPE_DECAY)
              }
              gain = if (envelope > 1.0) {
                (AGC_TARGET_PEAK / envelope).coerceIn(AGC_MIN_GAIN, AGC_MAX_GAIN)
              } else {
                AGC_MIN_GAIN
              }
            } else {
              gain = 1.0
            }
            lastGain = gain

            val bytes = ByteArray(read * 2)
            for (i in 0 until read) {
              var s = if (gain == 1.0) chunk[i].toInt() else (chunk[i] * gain).toInt()
              if (s > 32767) s = 32767 else if (s < -32768) s = -32768
              bytes[i * 2] = (s and 0xFF).toByte()
              bytes[i * 2 + 1] = ((s shr 8) and 0xFF).toByte()
            }
            val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
            val params = Arguments.createMap().apply { putString("base64", base64) }
            reactApplicationContext
              .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
              .emit("onAudioChunk", params)
            chunkCount++
            totalBytesSent += bytes.size
            // ~once/second (25 chunks @ 40ms): proves real PCM is flowing, and
            // maxAbs vs the int16 ceiling (32767) shows whether it's silence or live sound.
            if (chunkCount % 25 == 0) {
              dlog(
                "capture alive: chunks=$chunkCount totalBytes=$totalBytesSent " +
                  "rawPeak=$maxAbs/32767 gain=${"%.2f".format(lastGain)} " +
                  "sentPeak=${minOf(32767, (maxAbs * lastGain).toInt())}",
              )
            }
          } else if (read < 0) {
            Log.e("VoiceAudioModule", "AudioRecord.read() returned error code $read")
          }
        }
        dlog("capture loop exited, total chunks=$chunkCount")
      }
      recordThread = thread
      thread.start()
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("start_capture_failed", e.message, e)
    }
  }

  @ReactMethod
  fun stopCapture() {
    isRecording = false
    recordThread?.join(200)
    recordThread = null
    audioRecord?.let {
      try {
        it.stop()
      } catch (_: Exception) {
      }
      it.release()
    }
    audioRecord = null
    releaseVoiceEffects()
    playChunkCount = 0
  }

  private var playChunkCount = 0

  @ReactMethod
  fun playChunk(base64: String) {
    try {
      val bytes = Base64.decode(base64, Base64.NO_WRAP)
      val track = ensurePlaybackTrack()
      val written = track.write(bytes, 0, bytes.size)
      if (track.playState != AudioTrack.PLAYSTATE_PLAYING) track.play()
      playChunkCount++
      // Periodic only — one line per chunk floods logcat during a live call.
      // A short write (written < size) means the track is backed up, so always log that.
      if (playChunkCount <= 3 || playChunkCount % 50 == 0 || written < bytes.size) {
        dlog(
          "playChunk #$playChunkCount: bytes=${bytes.size} written=$written playState=${track.playState}",
        )
      }
    } catch (e: Exception) {
      Log.e("VoiceAudioModule", "playChunk failed: ${e.message}")
    }
  }

  private fun ensurePlaybackTrack(): AudioTrack {
    audioTrack?.let { return it }
    val minBuf = AudioTrack.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
    val track = AudioTrack.Builder()
      .setAudioAttributes(
        AudioAttributes.Builder()
          // USAGE_MEDIA -> STREAM_MUSIC -> loudspeaker at media volume, which the
          // volume rocker controls. Chosen over USAGE_VOICE_COMMUNICATION because
          // the latter defaults to the earpiece and needs MODE_IN_COMMUNICATION to
          // reach the speaker — and that mode cripples mic sensitivity (see
          // logAudioState). Never _SIGNALLING: that's for DTMF tones and is
          // silently inaudible outside a real telephony call.
          .setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
          .build(),
      )
      .setAudioFormat(
        AudioFormat.Builder()
          .setSampleRate(SAMPLE_RATE)
          .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
          .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
          .build(),
      )
      // The server streams ~200ms per chunk (~6.4KB), not 40ms like our capture
      // side — confirmed against live traffic (format=pcm_16000, b64len≈8536).
      // Size for several of those so write() doesn't block mid-utterance.
      .setBufferSizeInBytes(max(minBuf, 64 * 1024))
      .setTransferMode(AudioTrack.MODE_STREAM)
      .build()
    audioTrack = track
    return track
  }

  @ReactMethod
  fun purgePlayback() {
    audioTrack?.let {
      try {
        it.pause()
        it.flush()
        it.play()
      } catch (_: Exception) {
      }
    }
  }
}
