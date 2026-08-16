import Foundation
import AVFoundation
import React

/// Native audio module for the voice-command agent: mic capture (converted to
/// 16kHz mono PCM16, base64-encoded, emitted as JS events) and streaming
/// playback of incoming PCM16 chunks. Replaces @ello/agent-sdk's browser-only
/// audio/capture.ts + audio/playback.ts (Web Audio API has no RN equivalent).
@objc(VoiceAudioModule)
class VoiceAudioModule: RCTEventEmitter {
  private let engine = AVAudioEngine()
  private let playerNode = AVAudioPlayerNode()
  private var converter: AVAudioConverter?
  private let targetFormat = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: true)!
  // AVAudioPlayerNode is happiest with a standard non-interleaved Float32 format;
  // connecting/scheduling in interleaved Int16 makes -[AVAudioPlayerNode play]
  // abort (SIGABRT in AVAudioPlayerNodeImpl::StartImpl). We convert incoming
  // PCM16 chunks to this format before scheduling.
  private let playbackFormat = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 16000, channels: 1, interleaved: false)!
  private var isCapturing = false
  private var hasListeners = false
  private var playerAttached = false
  // The converter + input tap are created ONCE and kept alive for the module's
  // lifetime. Re-creating them per startCapture deallocated an AVAudioConverter
  // that an in-flight tap callback (on the audio render thread) was still using —
  // a use-after-free that crashed (SIGILL in AVAudioConverter dealloc) on rapid
  // start/stop. Start/stop now only toggle the engine, never rebuild the graph.
  private var isGraphSetup = false
  // All AVAudioEngine mutations run on this serial queue so JS calls
  // (startCapture / playChunk / stopCapture / purgePlayback) can never interleave
  // with each other and race the engine — the cause of intermittent SIGABRTs on
  // the RN TurboModule queue when the FAB is tapped/toggled quickly.
  private let audioQueue = DispatchQueue(label: "com.swiftloan.voiceaudio")

  override static func requiresMainQueueSetup() -> Bool { true }
  override func supportedEvents() -> [String]! { ["onAudioChunk", "onAudioLevel"] }
  override func startObserving() { hasListeners = true }
  override func stopObserving() { hasListeners = false }

  @objc func requestMicPermission(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    AVAudioSession.sharedInstance().requestRecordPermission { granted in
      resolve(granted)
    }
  }

  /// Attaches + connects the playback node into the engine graph exactly once.
  /// This MUST happen before the engine is first started — attaching/connecting a
  /// node to an already-running engine and then calling play() aborts with
  /// "player started when in disconnected state". Idempotent.
  private func ensurePlayerAttached() {
    guard !playerAttached else { return }
    engine.attach(playerNode)
    engine.connect(playerNode, to: engine.mainMixerNode, format: playbackFormat)
    playerAttached = true
  }

  /// Builds the capture converter + input tap and attaches the player node —
  /// exactly once, ever. Kept alive for the module's lifetime so start/stop never
  /// deallocate an object the audio render thread might still be touching.
  private func setupGraphIfNeeded() {
    guard !isGraphSetup else { return }
    let input = engine.inputNode
    let inputFormat = input.outputFormat(forBus: 0)
    converter = AVAudioConverter(from: inputFormat, to: targetFormat)
    input.installTap(onBus: 0, bufferSize: 1024, format: inputFormat) { [weak self] buffer, _ in
      self?.handleCapturedBuffer(buffer, inputFormat: inputFormat)
    }
    ensurePlayerAttached()
    isGraphSetup = true
  }

  @objc func startCapture(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    audioQueue.async { [weak self] in
      guard let self = self else { return }
      do {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetooth])
        try session.setActive(true)

        self.setupGraphIfNeeded()
        if !self.engine.isRunning {
          self.engine.prepare()
          try self.engine.start()
        }
        self.isCapturing = true
        resolve(nil)
      } catch {
        reject("start_capture_failed", error.localizedDescription, error)
      }
    }
  }

  @objc func stopCapture() {
    audioQueue.async { [weak self] in
      guard let self = self, self.isCapturing else { return }
      self.isCapturing = false
      // Pause (don't stop/teardown) and leave the tap + converter installed — the
      // tap callback drops chunks while !isCapturing. Only pause when Ruby isn't
      // mid-playback, so stopping the mic doesn't cut off her voice.
      if !self.playerNode.isPlaying {
        self.engine.pause()
      }
    }
  }

  @objc func playChunk(_ base64: String) {
    audioQueue.async { [weak self] in
      guard let self = self else { return }
      self.playChunkImpl(base64)
    }
  }

  private func playChunkImpl(_ base64: String) {
    guard let data = Data(base64Encoded: base64) else { return }
    let frameCount = UInt32(data.count / 2) // 16-bit samples
    guard frameCount > 0,
          let buffer = AVAudioPCMBuffer(pcmFormat: playbackFormat, frameCapacity: frameCount),
          let out = buffer.floatChannelData?[0] else { return }
    buffer.frameLength = frameCount
    // Convert interleaved PCM16 → Float32 (-1.0...1.0) into the playback buffer,
    // accumulating energy so we can emit a normalised "speaking" level to JS
    // (drives the on-device talking animation — no external lip-sync service).
    var sumSq: Float = 0
    data.withUnsafeBytes { raw in
      if let base = raw.bindMemory(to: Int16.self).baseAddress {
        for i in 0..<Int(frameCount) {
          let s = Float(base[i]) / 32768.0
          out[i] = s
          sumSq += s * s
        }
      }
    }
    if hasListeners, frameCount > 0 {
      let rms = (sumSq / Float(frameCount)).squareRoot()
      // Speech RMS is small; scale up and clamp to 0…1 for a lively mouth.
      let level = min(1.0, rms * 3.2)
      sendEvent(withName: "onAudioLevel", body: ["level": level])
    }

    // Playback may begin before/without capture, so make sure the session is
    // active for output first.
    let session = AVAudioSession.sharedInstance()
    if !session.isOtherAudioPlaying {
      try? session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetooth])
    }
    try? session.setActive(true)

    // Ensure the graph exists (player attached) — set up once, never rebuilt.
    setupGraphIfNeeded()
    if !engine.isRunning {
      engine.prepare()
      do {
        try engine.start()
      } catch {
        NSLog("[VoiceAudioModule] engine start failed: \(error.localizedDescription)")
        return
      }
    }
    // Only play once we're certain the engine is running and the node connected.
    guard engine.isRunning else { return }
    if !playerNode.isPlaying {
      playerNode.play()
    }
    playerNode.scheduleBuffer(buffer, completionHandler: nil)
  }

  @objc func purgePlayback() {
    audioQueue.async { [weak self] in
      self?.playerNode.stop()
      if self?.hasListeners == true { self?.sendEvent(withName: "onAudioLevel", body: ["level": 0]) }
    }
  }

  // NOTE: emits whatever the input tap + converter produce per callback rather
  // than re-slicing into exact 640-sample (40ms) frames — simpler for a first
  // pass, and the backend just needs a continuous PCM16/16kHz mono stream, not
  // fixed-size frames. Revisit if the backend turns out to expect exact framing.
  private func handleCapturedBuffer(_ buffer: AVAudioPCMBuffer, inputFormat: AVAudioFormat) {
    // The tap stays installed for the module's lifetime; drop chunks whenever a
    // session isn't actively capturing (paused between sessions).
    guard isCapturing, hasListeners, let converter = converter else { return }

    let ratio = targetFormat.sampleRate / inputFormat.sampleRate
    let outCapacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 16
    guard let outBuffer = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: outCapacity) else { return }

    var error: NSError?
    converter.convert(to: outBuffer, error: &error) { _, outStatus in
      outStatus.pointee = .haveData
      return buffer
    }
    if error != nil { return }

    guard let channelData = outBuffer.int16ChannelData, outBuffer.frameLength > 0 else { return }
    let byteCount = Int(outBuffer.frameLength) * 2
    let data = Data(bytes: channelData[0], count: byteCount)
    sendEvent(withName: "onAudioChunk", body: ["base64": data.base64EncodedString()])
  }
}
