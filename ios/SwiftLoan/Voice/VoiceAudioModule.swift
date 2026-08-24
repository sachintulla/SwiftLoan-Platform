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
  // Tracks whether the AVAudioSession is already active in our category, so
  // playChunkImpl (called once per ~50-100ms audio chunk) doesn't re-run
  // setCategory/setActive on every single chunk — that constant reconfiguration
  // was audible as the playback level "wobbling" during a call. Cleared on
  // route changes so a genuinely new route (e.g. a Bluetooth headset connecting
  // mid-call) still gets a fresh setCategory/setActive.
  private var sessionConfigured = false
  // All AVAudioEngine mutations run on this serial queue so JS calls
  // (startCapture / playChunk / stopCapture / purgePlayback) can never interleave
  // with each other and race the engine — the cause of intermittent SIGABRTs on
  // the RN TurboModule queue when the FAB is tapped/toggled quickly.
  private let audioQueue = DispatchQueue(label: "com.swiftloan.voiceaudio")

  override static func requiresMainQueueSetup() -> Bool { true }
  override func supportedEvents() -> [String]! { ["onAudioChunk", "onAudioLevel"] }
  override func startObserving() { hasListeners = true }
  override func stopObserving() { hasListeners = false }

  override init() {
    super.init()
    // A route change (e.g. a Bluetooth headset connecting/disconnecting mid-call)
    // needs the session re-armed on the next chunk rather than trusting the stale
    // "already configured" flag — without this, connecting a headset mid-session
    // kept output on the speaker until the next full stop/start.
    NotificationCenter.default.addObserver(
      self, selector: #selector(handleRouteChange(_:)),
      name: AVAudioSession.routeChangeNotification, object: nil)
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
  }

  @objc private func handleRouteChange(_ note: Notification) {
    // Only react to reasons that mean the actual input/output DEVICE changed.
    // Bluetooth accessories fire this notification constantly for reasons that
    // change nothing about which device is active — codec/link renegotiation
    // shows up as .routeConfigurationChange, and our own setCategory calls can
    // themselves surface as .categoryChange — and tearing down + restarting the
    // engine in response to those was itself further route churn the OS reacts
    // to, i.e. a feedback loop. That's what was popping the iOS volume HUD
    // repeatedly after the previous fix, not fixing anything.
    guard let info = note.userInfo,
          let reasonValue = info[AVAudioSessionRouteChangeReasonKey] as? UInt,
          let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue) else { return }
    NSLog("[VoiceAudioModule] routeChangeNotification reason=%ld", reasonValue)
    switch reason {
    case .newDeviceAvailable, .oldDeviceUnavailable:
      break
    default:
      return
    }
    NSLog("[VoiceAudioModule] route change is a real device change — rebuilding capture graph")
    audioQueue.async { [weak self] in
      guard let self = self else { return }
      let wasCapturing = self.isCapturing
      self.resetCaptureGraph()
      guard wasCapturing else { return }
      // A route change mid-call (e.g. turning Bluetooth off while talking) must
      // not leave the mic permanently dead for the rest of the session — rebuild
      // immediately against the new route's format. Best-effort: if this fails,
      // the next manual startCapture (via the retry in startCapture below) will
      // still recover it.
      do {
        try self.performStartCapture(mark: { _ in })
      } catch {
        NSLog("[VoiceAudioModule] route-change recovery failed: \(error.localizedDescription)")
      }
    }
  }

  /// Tears down the capture graph (tap + converter + engine) so the next
  /// performStartCapture() rebuilds it from scratch against whatever the
  /// current input route's format actually is. Needed because the tap/converter
  /// are otherwise built once and cached for the module's lifetime (see
  /// setupCaptureIfNeeded) — after a route change (e.g. Bluetooth HFP's 16kHz
  /// mono vs the built-in mic's 48kHz), that stale pair no longer matches the
  /// real input node and engine.start() throws -10868
  /// (AUGraphParser::InitializeActiveNodesInInputChain) on every subsequent
  /// call, effectively killing the mic until the app is relaunched.
  private func resetCaptureGraph() {
    if isCaptureSetup {
      engine.inputNode.removeTap(onBus: 0)
      isCaptureSetup = false
      converter = nil
    }
    if engine.isRunning {
      engine.stop()
    }
    sessionConfigured = false
  }

  // AVAudioSessionErrorInsufficientPriority ('!pri') — the OS refuses to grant
  // the audio session because something else already holds it at a higher
  // priority and won't yield (most commonly an active phone/FaceTime call,
  // which iOS never interrupts for a third-party app, by design). Surfaced as
  // its own reject code so the JS side can show an accurate "can't use voice
  // during a call" message instead of the generic failure text — on iOS,
  // NSError.localizedDescription for this is just "Session activation
  // failed", indistinguishable by message text alone from other
  // AVAudioSession errors.
  private static let insufficientPriorityCode = 561017449 // '!pri'

  private func rejectCode(for error: NSError) -> String {
    if error.domain == NSOSStatusErrorDomain, error.code == Self.insufficientPriorityCode {
      return "session_busy"
    }
    return "start_capture_failed"
  }

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
    // The actual echo-cancellation switch. AVAudioSession's `mode: .voiceChat`
    // (see performStartCapture) only tunes system-level routing/ducking — it
    // does NOT enable real acoustic echo cancellation for a custom
    // AVAudioEngine graph. Confirmed live: without this, conversation-text
    // showed the agent's own sentences transcribed back nearly verbatim as
    // "user" speech (e.g. agent said "...can you tap 'Continue with English'
    // on your own screen so we can proceed?" and the very next "user" message
    // was that same sentence almost word-for-word) — the mic was picking up
    // the speaker's own output essentially uncancelled, not just leaking a
    // little residual echo. setVoiceProcessingEnabled swaps the input node
    // for Apple's Voice-Processing I/O unit, which correlates against the
    // engine's own render output to actually cancel it.
    if !input.isVoiceProcessingEnabled {
      do {
        try input.setVoiceProcessingEnabled(true)
      } catch {
        NSLog("[VoiceAudioModule] setVoiceProcessingEnabled failed: \(error.localizedDescription)")
      }
    }
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
        try self.performStartCapture(mark: mark)
        resolve(nil)
        mark("resolved")
      } catch {
        let nsErr = error as NSError
        mark("first attempt threw: \(error.localizedDescription) domain=\(nsErr.domain) code=\(nsErr.code) userInfo=\(nsErr.userInfo)")
        // One automatic recovery attempt: a stale tap/converter left over from a
        // route change that raced this call (or any other transient
        // AVAudioEngine hiccup) can make the very first attempt fail even though
        // the hardware is fine. Tear the whole capture graph down and rebuild it
        // fresh once before giving up — this is what turns "mic dead until the
        // app is relaunched" into "self-heals the next time the FAB is tapped".
        self.resetCaptureGraph()
        do {
          try self.performStartCapture(mark: mark)
          resolve(nil)
          mark("resolved after retry")
        } catch {
          let nsErr2 = error as NSError
          mark("retry threw: \(error.localizedDescription) domain=\(nsErr2.domain) code=\(nsErr2.code) userInfo=\(nsErr2.userInfo)")
          reject(self.rejectCode(for: nsErr2), error.localizedDescription, error)
        }
      }
    }
  }

  /// The actual capture-graph setup, factored out of startCapture so both the
  /// first attempt and the one automatic retry (see startCapture) — as well as
  /// handleRouteChange's mid-call recovery — share identical logic.
  private func performStartCapture(mark: (String) -> Void) throws {
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
    ensurePlayerAttached()
    mark("ensurePlayerAttached done")
    if !engine.isRunning {
      engine.prepare()
      mark("engine.prepare done")
      try engine.start()
      mark("engine.start done")
    }
    isCapturing = false
    #else
    // .allowBluetooth (HFP, needed for mic input over a headset) and
    // .allowBluetoothA2DP (higher-quality output-only profile) must both be
    // listed or iOS won't offer a connected Bluetooth device as a route
    // candidate at all in .playAndRecord — it was silently speaker-only
    // before this, regardless of what was paired/connected.
    // .defaultToSpeaker only wins when nothing else is already routed, so it
    // stays as the fallback when no Bluetooth accessory is connected.
    try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetooth, .allowBluetoothA2DP])
    mark("setCategory done")
    try session.setActive(true)
    mark("setActive done")
    sessionConfigured = true

    setupCaptureIfNeeded()
    mark("setupCaptureIfNeeded done")
    ensurePlayerAttached()
    mark("ensurePlayerAttached done")
    if !engine.isRunning {
      engine.prepare()
      mark("engine.prepare done")
      try engine.start()
      mark("engine.start done")
    }
    isCapturing = true
    #endif
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
    // Only re-run setCategory/setActive when the session isn't already ours to
    // begin with (first chunk of a session, or after a route change cleared the
    // flag) — re-issuing these on every chunk (previously gated only on
    // `!session.isOtherAudioPlaying`, which is true for our OWN playback too)
    // re-negotiated the audio route dozens of times a second and was audible as
    // the playback level wobbling during a call.
    if !sessionConfigured, !session.isOtherAudioPlaying {
      #if targetEnvironment(simulator)
      // Playback-only in the Simulator (see startCapture) — the record category +
      // input node crash AVAudioEngine there.
      try? session.setCategory(.playback, mode: .voiceChat, options: [.defaultToSpeaker])
      #else
      try? session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetooth, .allowBluetoothA2DP])
      #endif
      try? session.setActive(true)
      sessionConfigured = true
    }
    mark("setCategory done")
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
