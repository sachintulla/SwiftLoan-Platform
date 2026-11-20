import Foundation
import UIKit
import Security
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

  /// What the server needs to count this install once per phone (server/src/lib/installDedup.ts):
  ///  - deviceId: a random id kept in the Keychain, which iOS keeps after the app is deleted, so a reinstall on the
  ///    same iPhone is recognised. "ThisDeviceOnly": never synced or restored to another phone. Not the IDFA.
  ///  - installer: "app_store" or "testflight" (from the receipt name); nil for Xcode/dev builds.
  /// Never rejects: a field it cannot read is nil.
  @objc(getInstallInfo:rejecter:)
  func getInstallInfo(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    var debug = false
    #if DEBUG
    debug = true
    #endif
    let info = Bundle.main.infoDictionary ?? [:]
    let receipt = Bundle.main.appStoreReceiptURL?.lastPathComponent
    let installer: String? = receipt == "sandboxReceipt" ? "testflight" : (receipt == "receipt" ? "app_store" : nil)
    resolve([
      "deviceId": AttributionModule.keychainDeviceId() as Any,
      "installer": installer as Any,
      "debug": debug,
      "appVersion": info["CFBundleShortVersionString"] as Any,
      "buildNumber": info["CFBundleVersion"] as Any,
      "model": AttributionModule.machineModel() as Any,
    ])
  }

  private static let keychainService = "ai.swiftloan.install"
  private static let keychainAccount = "device-id"

  /// Read the id from the Keychain, or make and store one the first time.
  private static func keychainDeviceId() -> String? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keychainService,
      kSecAttrAccount as String: keychainAccount,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var item: CFTypeRef?
    if SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
       let data = item as? Data, let id = String(data: data, encoding: .utf8), !id.isEmpty {
      return id
    }
    let id = UUID().uuidString
    let add: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keychainService,
      kSecAttrAccount as String: keychainAccount,
      kSecValueData as String: Data(id.utf8),
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    ]
    let status = SecItemAdd(add as CFDictionary, nil)
    return status == errSecSuccess || status == errSecDuplicateItem ? id : nil
  }

  /// The hardware model, e.g. "iPhone15,2" (UIDevice only says "iPhone").
  private static func machineModel() -> String? {
    var sys = utsname()
    uname(&sys)
    let model = withUnsafeBytes(of: &sys.machine) { raw in
      String(decoding: raw.prefix { $0 != 0 }, as: UTF8.self)
    }
    return model.isEmpty ? nil : model
  }
}
