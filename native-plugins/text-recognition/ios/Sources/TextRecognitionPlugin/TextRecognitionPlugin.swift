import Foundation
import Capacitor
import Vision
import UIKit

/// Liest Text aus einem Foto (Apple Vision, laeuft komplett auf dem Geraet, nichts wird uebertragen).
/// JS: Capacitor.Plugins.TextRecognition.recognize({ image: "<Base64 eines JPEG oder PNG>" }) -> { text: "..." }
@objc(TextRecognitionPlugin)
public class TextRecognitionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TextRecognitionPlugin"
    public let jsName = "TextRecognition"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "recognize", returnType: CAPPluginReturnPromise)
    ]

    @objc public func recognize(_ call: CAPPluginCall) {
        guard let base64 = call.getString("image"),
              let data = Data(base64Encoded: base64, options: .ignoreUnknownCharacters),
              let image = UIImage(data: data),
              let cgImage = image.cgImage else {
            call.reject("Das Bild konnte nicht gelesen werden.")
            return
        }
        let request = VNRecognizeTextRequest { request, error in
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            let observations = (request.results as? [VNRecognizedTextObservation]) ?? []
            // Von oben nach unten, bei gleicher Hoehe von links nach rechts
            let sorted = observations.sorted { a, b in
                if abs(a.boundingBox.midY - b.boundingBox.midY) < 0.012 { return a.boundingBox.minX < b.boundingBox.minX }
                return a.boundingBox.midY > b.boundingBox.midY
            }
            let lines = sorted.compactMap { $0.topCandidates(1).first?.string }
            call.resolve(["text": lines.joined(separator: "\n")])
        }
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        let wanted = ["de-DE", "en-US"]
        if let supported = try? request.supportedRecognitionLanguages() {
            let usable = wanted.filter { supported.contains($0) }
            if !usable.isEmpty { request.recognitionLanguages = usable }
        }
        DispatchQueue.global(qos: .userInitiated).async {
            let handler = VNImageRequestHandler(cgImage: cgImage, orientation: TextRecognitionPlugin.orientation(image.imageOrientation), options: [:])
            do { try handler.perform([request]) } catch { call.reject(error.localizedDescription) }
        }
    }

    private static func orientation(_ o: UIImage.Orientation) -> CGImagePropertyOrientation {
        switch o {
        case .up: return .up
        case .down: return .down
        case .left: return .left
        case .right: return .right
        case .upMirrored: return .upMirrored
        case .downMirrored: return .downMirrored
        case .leftMirrored: return .leftMirrored
        case .rightMirrored: return .rightMirrored
        @unknown default: return .up
        }
    }
}
