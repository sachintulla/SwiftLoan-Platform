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
  private var isCaptureSetup = false
  private var playChunks = 0  // diagnostics: count playback chunks actually scheduled
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

  /// Bridges JS's vlog() (src/voice/log.ts) to the unified logging system —
  /// this was never implemented on iOS, so every voice-pipeline diagnostic
  /// (POST call, WS open, RECV messages, TOOL CALL, response latency) was
  /// silently a no-op here even though the identical Android nativeLog() has
  /// been in place all along. Read on a real device with:
  ///   log stream --device --predicate 'eventMessage contains "VoiceJS"'
  @objc func nativeLog(_ msg: String) {
    #if DEBUG
    NSLog("VoiceJS: %@", msg)
    #endif
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

  /// Installs the capture converter + input tap exactly once — and ONLY from
  /// startCapture, i.e. after the session is in .playAndRecord and active, so the
  /// input format is the real mic format (not a playback-only/nil format). The
  /// converter is created once and kept alive so start/stop never deallocate an
  /// object the audio render thread's tap callback might still be using.
  private func setupCaptureIfNeeded() {
    guard !isCaptureSetup else { return }
    let input = engine.inputNode
    let inputFormat = input.outputFormat(forBus: 0)
    // The iOS Simulator (especially x86 under Rosetta on Apple Silicon) can report
    // an invalid input format (0 Hz / 0 channels) before the mic is actually ready.
    // Installing a tap or building a converter with that format triggers an
    // uncatchable NSException (require: format.sampleRate/channelCount) → SIGABRT on
    // this queue. Bail WITHOUT marking setup done so the next startCapture retries
    // once the format is valid, instead of crashing.
    guard inputFormat.channelCount > 0, inputFormat.sampleRate > 0 else {
      NSLog("[VoiceAudioModule] input format not ready (%.0fHz, %u ch) — skipping tap install; will retry", inputFormat.sampleRate, inputFormat.channelCount)
      return
    }
    guard let conv = AVAudioConverter(from: inputFormat, to: targetFormat) else {
      NSLog("[VoiceAudioModule] could not create AVAudioConverter for the input format")
      return
    }
    converter = conv
    input.installTap(onBus: 0, bufferSize: 1024, format: inputFormat) { [weak self] buffer, _ in
      self?.handleCapturedBuffer(buffer, inputFormat: inputFormat)
    }
    isCaptureSetup = true
  }

  @objc func startCapture(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    // Diagnostic timing only — a real session took ~6.9s to resolve this call
    // (observed live: it didn't resolve until AFTER the agent's first response
    // audio had already arrived), with no visibility into which specific
    // AVAudioSession/AVAudioEngine step was actually slow. Each step below is
    // timestamped so the next test pinpoints the real bottleneck instead of
    // guessing between category switch, session activation, and engine start.
    let t0 = Date()
    func mark(_ label: String) {
      #if DEBUG
      NSLog("[VoiceAudioModule] startCapture timing: %@ at +%.3fs", label, Date().timeIntervalSince(t0))
      #endif
    }
    audioQueue.async { [weak self] in
      guard let self = self else { return }
      mark("dispatched onto audioQueue")
      do {
        let session = AVAudioSession.sharedInstance()
        #if targetEnvironment(simulator)
        // The iOS Simulator (x86 under Rosetta on Apple Silicon) crashes with
        // SIGILL inside AVAudioEngine's input-chain init (GetInputFormat) when the
        // mic node is added to the graph — there is no real mic to initialize.
        // Run playback-only there so Ruby's voice still works and the app doesn't
        // abort; real mic capture is only meaningful on a device anyway.
        try session.setCategory(.playback, mode: .voiceChat, options: [.defaultToSpeaker])
        mark("setCategory done")
        try session.setActive(true)
        mark("setActive done")
        self.ensurePlayerAttached()
        mark("ensurePlayerAttached done")
        if !self.engine.isRunning {
          self.engine.prepare()
          mark("engine.prepare done")
          try self.engine.start()
          mark("engine.start done")
        }
        self.isCapturing = false
        resolve(nil)
        mark("resolved")
        #else
        try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker])
        mark("setCategory done")
        try session.setActive(true)
        mark("setActive done")

        self.setupCaptureIfNeeded()
        mark("setupCaptureIfNeeded done")
        self.ensurePlayerAttached()
        mark("ensurePlayerAttached done")
        if !self.engine.isRunning {
          self.engine.prepare()
          mark("engine.prepare done")
          try self.engine.start()
          mark("engine.start done")
        }
        self.isCapturing = true
        resolve(nil)
        mark("resolved")
        #endif
      } catch {
        mark("threw: \(error.localizedDescription)")
        reject("start_capture_failed", error.localizedDescription, error)
      }
    }
  }

  @objc func stopCapture() {
    audioQueue.async { [weak self] in
      guard let self = self, self.isCapturing else { return }
      self.isCapturing = false
      // Fully stop (not pause) so the next startCapture's engine.start() cleanly
      // resumes mic input — after pause(), input-tap delivery doesn't reliably
      // resume on iOS. The tap + converter stay installed (never deallocated), so
      // this is safe. Only stop when Ruby isn't mid-playback, so ending capture
      // doesn't cut off her voice.
      if !self.playerNode.isPlaying {
        self.engine.stop()
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
    // Diagnostic timing only, first chunk of a session only — mirrors the same
    // instrumentation added to startCapture, to see whether THIS call (queued
    // on the same serial audioQueue as startCapture) is what's actually
    // blocking the mic for several seconds on a real device, rather than
    // startCapture's own AVAudioSession calls.
    let isFirstChunk = playChunks == 0
    let t0 = Date()
    func mark(_ label: String) {
      #if DEBUG
      guard isFirstChunk else { return }
      NSLog("[VoiceAudioModule] playChunkImpl timing: %@ at +%.3fs", label, Date().timeIntervalSince(t0))
      #endif
    }
    let session = AVAudioSession.sharedInstance()
    if !session.isOtherAudioPlaying {
      #if targetEnvironment(simulator)
      // Playback-only in the Simulator (see startCapture) — the record category +
      // input node crash AVAudioEngine there.
      try? session.setCategory(.playback, mode: .voiceChat, options: [.defaultToSpeaker])
      #else
      try? session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker])
      #endif
    }
    mark("setCategory done")
    try? session.setActive(true)
    mark("setActive done")

    // Ensure the playback node is attached (never installs the input tap — that
    // only happens in startCapture, once the session is in record mode).
    ensurePlayerAttached()
    mark("ensurePlayerAttached done")
    if !engine.isRunning {
      engine.prepare()
      mark("engine.prepare done")
      do {
        try engine.start()
        mark("engine.start done")
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
    // Sparse diagnostics: confirm playback chunks arrive + the output route/volume.
    playChunks += 1
    if playChunks == 1 || playChunks % 100 == 0 {
      let out = session.currentRoute.outputs.first?.portType.rawValue ?? "NONE"
      NSLog("[VoiceAudioModule] playChunk #\(playChunks) frames=\(frameCount) engineRunning=\(engine.isRunning) playing=\(playerNode.isPlaying) cat=\(session.category.rawValue) vol=\(session.outputVolume) outputs=\(session.currentRoute.outputs.count) route=\(out)")
    }
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
