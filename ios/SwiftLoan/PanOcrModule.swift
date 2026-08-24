import Foundation
import Vision
import UIKit
import React

/// On-device OCR for the PAN-card photo. Uses Apple's Vision framework so the
/// card image never leaves the device — we only return the recognized text and
/// the JS layer extracts the PAN number from it.
@objc(PanOcrModule)
class PanOcrModule: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc(recognize:resolver:rejecter:)
  func recognize(_ path: String,
                 resolver resolve: @escaping RCTPromiseResolveBlock,
                 rejecter reject: @escaping RCTPromiseRejectBlock) {
    let clean = path.hasPrefix("file://") ? String(path.dropFirst(7)) : path
    guard let image = UIImage(contentsOfFile: clean), let cg = image.cgImage else {
      reject("no_image", "Could not load image at \(clean)", nil)
      return
    }
    let request = VNRecognizeTextRequest { req, err in
      if let err = err {
        reject("ocr_error", err.localizedDescription, err)
        return
      }
      let observations = (req.results as? [VNRecognizedTextObservation]) ?? []
      let text = observations
        .compactMap { $0.topCandidates(1).first?.string }
        .joined(separator: "\n")
      resolve(text)
    }
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    let handler = VNImageRequestHandler(cgImage: cg, options: [:])
    DispatchQueue.global(qos: .userInitiated).async {
      do { try handler.perform([request]) }
      catch { reject("ocr_perform", error.localizedDescription, error) }
    }
  }
}
