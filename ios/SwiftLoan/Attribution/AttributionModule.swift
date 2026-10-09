import Foundation
import UIKit
import React

/// iOS half of install attribution: reads the click token our /dl page copied to the clipboard
/// before sending the visitor to TestFlight / the App Store.
///
/// Privacy: only a value starting with our own prefix is ever returned (and then cleared), so
/// nothing else on the clipboard leaves the device. `hasStrings` is checked first because it
/// does not trigger the "pasted from…" banner; the real read happens once, on first launch.
@objc(AttributionModule)
class AttributionModule: NSObject {
  private static let prefix = "swiftloan-ref:"

  @objc static func requiresMainQueueSetup() -> Bool { true }

  @objc(readClipboardToken:rejecter:)
  func readClipboardToken(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      let board = UIPasteboard.general
      guard board.hasStrings, let value = board.string,
            value.lowercased().hasPrefix(AttributionModule.prefix) else {
        resolve(nil)
        return
      }
      board.string = "" // one-time use: don't leave the token behind
      resolve(value)
    }
  }
}
