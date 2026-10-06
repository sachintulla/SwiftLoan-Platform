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
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
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
// A 40ms chunk counts as speech (and is boosted) only when its peak is above this
// (~1.8% of full scale). It used to be TARGET/MAX_GAIN (~1,125), which sat above soft
// speech on some phones (peaks ~1,000 in live calls), so Ello's volume gate never saw
// the user speak. Room noise on the same phone peaks at 200-450.
private const val AGC_SPEECH_PEAK = 600
// While the agent's own audio is playing, plus this long after it ends, the mic is NOT
// boosted: what it picks up then is mostly the speaker's echo, and boosting it made it
// look like the user talking, so Ello cut the agent off (barge-in) after ~0.8s. A real
// interruption is loud enough to pass unboosted, and the mic itself is never muted.
private const val AGENT_ECHO_TAIL_MS = 500L
// Frames of agent audio (at 16 kHz) the speaker track needs before it starts playing: 3,200 = 200 ms.
private const val START_THRESHOLD_FRAMES = 3200
// Envelope smoothing so gain rides the recent loudness instead of jumping per chunk.
private const val AGC_ENVELOPE_DECAY = 0.85
// Per-chunk (40ms) release of the boost once input drops below speech level.
// Without it the gain stayed at whatever the last utterance set (observed holding
// ~2x for over a minute of silence), so room noise was sent boosted. 0.95/chunk
// returns an 8x boost to 1x in about a second.
private const val AGC_QUIET_RELEASE = 0.95

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
   */
  private fun logAudioState() {
    try {
      val am = audioManager
      dlog(
        "audio state: mode=${am.mode} musicVol=${am.getStreamVolume(AudioManager.STREAM_MUSIC)}/" +
          "${am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)} " +
          "voiceCallVol=${am.getStreamVolume(AudioManager.STREAM_VOICE_CALL)}/" +
          "${am.getStreamMaxVolume(AudioManager.STREAM_VOICE_CALL)}",
      )
    } catch (e: Exception) {
      Log.e("VoiceAudioModule", "logAudioState failed: ${e.message}")
    }
  }

  /**
   * Puts capture AND playback on the same voice-call audio lane so the
   * platform's hardware AEC actually engages — it only cancels echo when it
   * can see the playback stream as its own reference signal, which requires
   * both sides to be in MODE_IN_COMMUNICATION together (confirmed on-device:
   * with playback on USAGE_MEDIA instead, dumpsys reported "Enable Aec: 0" for
   * our capture stream despite AcousticEchoCanceler.create() reporting
   * enabled=true — the effect was attached but never actually fed a reference).
   *
   * MODE_IN_COMMUNICATION defaults routing to the earpiece, so speakerphone is
   * forced on explicitly — this app is held at arm's length, not to the ear.
   * A connected Bluetooth headset/earbuds is preferred over that forced
   * speaker when present — confirmed live: with a BT device connected, the
   * unconditional speaker pick below used to win every time, so the agent
   * kept talking out of the phone's own speaker/mic instead of the paired
   * headset the user was actually wearing.
   *
   * Previously avoided: measured drop in mic peaks (~14500 -> ~600) in this
   * mode. That drop is compensated for by always running the software AGC
   * below (previously it only engaged when there was no hardware AGC).
   */
  private fun enterCallAudioMode() {
    try {
      val am = audioManager
      am.mode = AudioManager.MODE_IN_COMMUNICATION
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        // setCommunicationDevice() is the unified API 31+ routing call — it
        // supersedes the legacy isBluetoothScoOn/isSpeakerphoneOn pair and
        // establishes the SCO link itself when a Bluetooth device is chosen,
        // so no separate startBluetoothSco() call is needed here. Only
        // devices actually connected right now appear in this list, so
        // preferring TYPE_BLUETOOTH_SCO here is exactly "use the headset the
        // user has on", falling back to the speaker when none is connected.
        val devices = am.availableCommunicationDevices
        val bluetooth = devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO }
        val speaker = devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
        val device = bluetooth ?: speaker
        val set = device?.let { am.setCommunicationDevice(it) } ?: false
        dlog("enterCallAudioMode: setCommunicationDevice(${if (bluetooth != null) "bluetooth" else "speaker"}) ok=$set")
      } else {
        // Legacy path (< API 31, minSdkVersion 24): no availableCommunicationDevices
        // API to detect a connected Bluetooth device without the extra
        // BluetoothHeadset profile-proxy plumbing, so this keeps the
        // original speaker-only behavior — a real gap on these older OS
        // versions, but a shrinking, low-priority slice of real devices.
        @Suppress("DEPRECATION")
        am.isSpeakerphoneOn = true
        dlog("enterCallAudioMode: isSpeakerphoneOn=true (legacy)")
      }
    } catch (e: Exception) {
      Log.e("VoiceAudioModule", "enterCallAudioMode failed: ${e.message}")
    }
  }

  private fun exitCallAudioMode() {
    try {
      val am = audioManager
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        am.clearCommunicationDevice()
      } else {
        @Suppress("DEPRECATION")
        am.isSpeakerphoneOn = false
      }
      am.mode = AudioManager.MODE_NORMAL
    } catch (e: Exception) {
      Log.e("VoiceAudioModule", "exitCallAudioMode failed: ${e.message}")
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
    enterCallAudioMode()
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
       // The whole capture loop runs on this raw background thread. Any uncaught
       // throwable here (a read error, or the JS event-emitter interop throwing
       // under the New Architecture) would otherwise propagate to the thread's
       // default handler and HARD-CRASH the app. Wrap it so a failure stops
       // capture cleanly instead of taking the process down.
       try {
        val chunk = ShortArray(CHUNK_SAMPLES)
        var chunkCount = 0
        var totalBytesSent = 0L
        var envelope = 0.0
        var lastGain = 1.0
        var gainState = 1.0
        // Always level in software: MODE_IN_COMMUNICATION's own mic calibration
        // (not just the AutomaticGainControl effect) measurably quiets the input
        // on some devices, so hardware AGC being present isn't sufficient here.
        val needSoftwareAgc = true
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
              if (SystemClock.elapsedRealtime() < agentAudioEndsAtMs + AGENT_ECHO_TAIL_MS) {
                // Agent is talking: pass the mic through untouched and drop any boost.
                envelope = 0.0
                gainState = AGC_MIN_GAIN
              } else if (maxAbs > AGC_SPEECH_PEAK) {
                // Speech-level input: track its loudness and aim the gain at it.
                envelope = max(maxAbs.toDouble(), envelope * AGC_ENVELOPE_DECAY)
                gainState = (AGC_TARGET_PEAK / envelope).coerceIn(AGC_MIN_GAIN, AGC_MAX_GAIN)
              } else {
                // Quiet / ambient: let the boost relax back toward unity instead of
                // holding the last utterance's gain (which amplified background noise).
                envelope *= AGC_ENVELOPE_DECAY
                gainState = max(AGC_MIN_GAIN, gainState * AGC_QUIET_RELEASE)
              }
              gain = gainState
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
            try {
              reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("onAudioChunk", params)
            } catch (e: Throwable) {
              // Emitting to JS can throw (e.g. context tearing down, or interop
              // edge cases under bridgeless). Skip this chunk rather than crash.
              Log.e("VoiceAudioModule", "emit(onAudioChunk) failed: ${e.message}")
            }
            chunkCount++
            totalBytesSent += bytes.size
            // ~once/second (25 chunks @ 40ms): proves real PCM is flowing, and
            // maxAbs vs the int16 ceiling (32767) shows whether it's silence or live sound.
            if (chunkCount % 25 == 0) {
              dlog(
                "capture alive: chunks=$chunkCount totalBytes=$totalBytesSent " +
                  "rawPeak=$maxAbs/32767 gain=${"%.2f".format(lastGain)} " +
                  "sentPeak=${minOf(32767, (maxAbs * lastGain).toInt())} " +
                  "agentQueuedMs=${agentQueuedMs()} track=${audioTrack?.playState} ${playbackDebug()}",
              )
            }
          } else if (read < 0) {
            Log.e("VoiceAudioModule", "AudioRecord.read() returned error code $read")
          }
        }
        dlog("capture loop exited, total chunks=$chunkCount")
       } catch (t: Throwable) {
        // Never let the capture thread crash the whole app.
        Log.e("VoiceAudioModule", "capture thread aborted: ${t.message}", t)
        isRecording = false
       }
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
    agentAudioEndsAtMs = 0L
    framesWritten = 0L
    audioTrack?.let {
      try { it.stop(); it.release() } catch (_: Exception) {}
    }
    audioTrack = null
    exitCallAudioMode()
  }

  private var playChunkCount = 0

  // When the audio queued so far will have finished playing (elapsedRealtime ms).
  @Volatile private var agentAudioEndsAtMs = 0L
  // PCM16 frames handed to the AudioTrack since it was created/flushed — compared with its
  // playback head to tell how much agent audio is still waiting to be heard.
  @Volatile private var framesWritten = 0L

  private fun playbackDebug(): String {
    val track = audioTrack ?: return "head=- written=$framesWritten"
    return try {
      "head=${track.playbackHeadPosition} written=$framesWritten underruns=${track.underrunCount}"
    } catch (_: Exception) {
      "head=? written=$framesWritten"
    }
  }

  private fun agentQueuedMs(): Long {
    val track = audioTrack ?: return 0
    return try {
      max(0L, (framesWritten - track.playbackHeadPosition.toLong()) * 1000 / SAMPLE_RATE)
    } catch (_: Exception) {
      0L
    }
  }

  @ReactMethod
  fun playChunk(base64: String) {
    try {
      val bytes = Base64.decode(base64, Base64.NO_WRAP)
      val track = ensurePlaybackTrack()
      val written = track.write(bytes, 0, bytes.size)
      if (track.playState != AudioTrack.PLAYSTATE_PLAYING) track.play()
      // 16 kHz mono PCM16 = 32 bytes per millisecond.
      val nowMs = SystemClock.elapsedRealtime()
      // A chunk arriving after a pause is the start of a new agent utterance: log it with how
      // much earlier audio is still queued, so "the agent spoke but I heard nothing" can be
      // checked (queued audio that never drains = playback stuck).
      if (nowMs > agentAudioEndsAtMs + 400) {
        dlog("agent utterance START (first chunk ${bytes.size} bytes, queuedMs=${agentQueuedMs()}, track=${track.playState})")
      }
      agentAudioEndsAtMs = max(agentAudioEndsAtMs, nowMs) + bytes.size / 32
      framesWritten += written / 2
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        kickHandler.removeCallbacks(kickRunnable)
        kickHeadAtPost = track.playbackHeadPosition
        kickHandler.postDelayed(kickRunnable, 400)
      }
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
          // USAGE_VOICE_COMMUNICATION so playback shares the same audio lane as
          // capture (see enterCallAudioMode) — the platform's hardware AEC only
          // treats this stream as its echo-reference signal when both sides are
          // in the voice-communication path together. Speakerphone is forced on
          // in enterCallAudioMode so this still comes out the loud speaker, not
          // the earpiece. Never _SIGNALLING: that's for DTMF tones and is
          // silently inaudible outside a real telephony call.
          .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
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
    // A streaming AudioTrack does not start (or restart after an underrun) until the audio
    // written reaches its "start threshold", which defaults to the WHOLE buffer (64KB = ~2s).
    // Any agent sentence shorter than that — "Shall we get started?" is ~1.4s — was written to
    // the track and then never played until the NEXT sentence filled the buffer, so the user
    // heard it seconds late or not at all (live log: written=94080, head frozen at 71360 for
    // 19s with the track "PLAYING"). Start after ~200ms of audio instead.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      try {
        track.setStartThresholdInFrames(START_THRESHOLD_FRAMES)
      } catch (e: Exception) {
        Log.w("VoiceAudioModule", "setStartThresholdInFrames failed: ${e.message}")
      }
    }
    dlog("playback track created: bufferFrames=${track.bufferSizeInFrames} startThreshold=${if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) track.startThresholdInFrames else -1}")
    audioTrack = track
    return track
  }

  // Android < 12 has no start-threshold API: if the track has not moved ~400ms after the last
  // chunk, top it up with silence so the buffer fills and the real audio plays out.
  private val kickHandler = Handler(Looper.getMainLooper())
  private var kickHeadAtPost = -1
  private val kickRunnable = Runnable {
    val track = audioTrack ?: return@Runnable
    try {
      val head = track.playbackHeadPosition
      val queuedFrames = framesWritten - head
      if (queuedFrames > 0 && head == kickHeadAtPost) {
        val padFrames = (track.bufferSizeInFrames - queuedFrames).toInt()
        if (padFrames > 0) {
          track.write(ByteArray(padFrames * 2), 0, padFrames * 2)
          framesWritten += padFrames
          dlog("playback not started with $queuedFrames frames queued — padded $padFrames frames of silence")
        }
      }
    } catch (_: Exception) {
    }
  }

  @ReactMethod
  fun purgePlayback() {
    agentAudioEndsAtMs = 0L
    framesWritten = 0L
    // Release the track instead of pause/flush/play on the same one: in a live call the reused
    // track kept reporting PLAYING while its playback head stopped moving after a barge-in
    // purge, leaving ~1.5s of the agent's next sentence queued and never played. The next
    // playChunk() builds a fresh track (ensurePlaybackTrack) and starts it.
    audioTrack?.let {
      try {
        it.pause()
        it.flush()
        it.release()
      } catch (_: Exception) {
      }
    }
    audioTrack = null
  }
}
