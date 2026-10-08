import Foundation
import AudioToolbox
import React

/// Short UI sound effects (typing ticks, taps, toggles, the agent's cues).
///
/// JS hands each sound over once as a base64 WAV (src/feedback/soundData.ts); it is written to
/// the caches directory and registered as a System Sound, which is the low-latency path for
/// short clips and — unlike an AVAudioPlayer — never changes the app's AVAudioSession, so it
/// cannot disturb the voice agent's mic/playback setup. Follows the ringer switch, as UI sounds
/// should.
@objc(UiSoundModule)
class UiSoundModule: NSObject {
  private var ids: [String: SystemSoundID] = [:]
  private let queue = DispatchQueue(label: "ai.swiftloan.uisound")

  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc(load:base64Wav:)
  func load(_ name: String, base64Wav: String) {
    queue.async {
      if self.ids[name] != nil { return }
      guard let data = Data(base64Encoded: base64Wav),
            let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first?
              .appendingPathComponent("ui_sounds", isDirectory: true) else { return }
      do {
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent("\(name).wav")
        try data.write(to: url, options: .atomic)
        var sid: SystemSoundID = 0
        if AudioServicesCreateSystemSoundID(url as CFURL, &sid) == kAudioServicesNoError {
          self.ids[name] = sid
        }
      } catch {
        NSLog("[UiSound] load(%@) failed: %@", name, error.localizedDescription)
      }
    }
  }

  /// System Sounds have no per-play volume; the clips are mastered at the intended level.
  @objc(play:volume:)
  func play(_ name: String, volume: Double) {
    queue.async {
      if let sid = self.ids[name] { AudioServicesPlaySystemSound(sid) }
    }
  }
}
