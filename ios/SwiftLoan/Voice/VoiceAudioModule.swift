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
  private var isCapturing = false
  private var hasListeners = false
  private var playerAttached = false

  override static func requiresMainQueueSetup() -> Bool { true }
  override func supportedEvents() -> [String]! { ["onAudioChunk"] }
  override func startObserving() { hasListeners = true }
  override func stopObserving() { hasListeners = false }

  @objc func requestMicPermission(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    AVAudioSession.sharedInstance().requestRecordPermission { granted in
      resolve(granted)
    }
  }

  @objc func startCapture(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    do {
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetooth])
      try session.setActive(true)

      let input = engine.inputNode
      let inputFormat = input.outputFormat(forBus: 0)
      converter = AVAudioConverter(from: inputFormat, to: targetFormat)

      input.installTap(onBus: 0, bufferSize: 1024, format: inputFormat) { [weak self] buffer, _ in
        self?.handleCapturedBuffer(buffer, inputFormat: inputFormat)
      }

      if !engine.isRunning {
        try engine.start()
      }
      isCapturing = true
      resolve(nil)
    } catch {
      reject("start_capture_failed", error.localizedDescription, error)
    }
  }

  @objc func stopCapture() {
    guard isCapturing else { return }
    engine.inputNode.removeTap(onBus: 0)
    isCapturing = false
    if !playerNode.isPlaying {
      engine.stop()
    }
  }

  @objc func playChunk(_ base64: String) {
    guard let data = Data(base64Encoded: base64) else { return }
    let frameCount = UInt32(data.count / 2) // 16-bit samples
    guard frameCount > 0, let buffer = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: frameCount) else { return }
    buffer.frameLength = frameCount
    data.withUnsafeBytes { raw in
      if let base = raw.bindMemory(to: Int16.self).baseAddress {
        buffer.int16ChannelData?[0].update(from: base, count: Int(frameCount))
      }
    }

    if !engine.isRunning {
      try? engine.start()
    }
    if !playerAttached {
      engine.attach(playerNode)
      engine.connect(playerNode, to: engine.mainMixerNode, format: targetFormat)
      playerAttached = true
    }
    if !playerNode.isPlaying {
      playerNode.play()
    }
    playerNode.scheduleBuffer(buffer, completionHandler: nil)
  }

  @objc func purgePlayback() {
    playerNode.stop()
  }

  // NOTE: emits whatever the input tap + converter produce per callback rather
  // than re-slicing into exact 640-sample (40ms) frames — simpler for a first
  // pass, and the backend just needs a continuous PCM16/16kHz mono stream, not
  // fixed-size frames. Revisit if the backend turns out to expect exact framing.
  private func handleCapturedBuffer(_ buffer: AVAudioPCMBuffer, inputFormat: AVAudioFormat) {
    guard hasListeners, let converter = converter else { return }

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
