import Foundation
import Capacitor
import UIKit

@objc(ScreenGuardPlugin)
public class ScreenGuardPlugin: CAPPlugin {

    private var secureField: UITextField?
    private var brandedOverlay: UIView?
    private var isSetUp = false

    private func setUp() {
        guard !isSetUp else { return }
        guard let window = bridge?.webView?.window ?? UIApplication.shared.windows.first else {
            NSLog("[ScreenGuard] No window found")
            return
        }

        NSLog("[ScreenGuard] setUp — window: %@, sublayers: %d, subviews: %d",
              String(describing: window),
              window.layer.sublayers?.count ?? 0,
              window.subviews.count)

        // --- Branded overlay (visible in screenshots when protection is on) ---
        let overlay = UIView()
        overlay.isUserInteractionEnabled = false

        let gradient = CAGradientLayer()
        gradient.colors = [
            UIColor(red: 0x1a/255.0, green: 0x0f/255.0, blue: 0x2e/255.0, alpha: 1).cgColor,
            UIColor(red: 0x11/255.0, green: 0x0a/255.0, blue: 0x24/255.0, alpha: 1).cgColor
        ]
        gradient.startPoint = CGPoint(x: 0.5, y: 0)
        gradient.endPoint = CGPoint(x: 0.5, y: 1)
        overlay.layer.addSublayer(gradient)

        let logoView = UIImageView(image: UIImage(named: "ScreenGuardLogo"))
        logoView.contentMode = .scaleAspectFit
        logoView.translatesAutoresizingMaskIntoConstraints = false
        overlay.addSubview(logoView)

        overlay.isHidden = true
        window.addSubview(overlay)

        overlay.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            overlay.topAnchor.constraint(equalTo: window.topAnchor),
            overlay.bottomAnchor.constraint(equalTo: window.bottomAnchor),
            overlay.leadingAnchor.constraint(equalTo: window.leadingAnchor),
            overlay.trailingAnchor.constraint(equalTo: window.trailingAnchor),
            logoView.centerXAnchor.constraint(equalTo: overlay.centerXAnchor),
            logoView.centerYAnchor.constraint(equalTo: overlay.centerYAnchor),
            logoView.widthAnchor.constraint(equalToConstant: 80),
            logoView.heightAnchor.constraint(equalToConstant: 80)
        ])

        overlay.layoutIfNeeded()
        gradient.frame = overlay.bounds
        let observer = overlay.observe(\.bounds, options: [.new]) { view, _ in
            gradient.frame = view.bounds
        }
        objc_setAssociatedObject(overlay, "gradientObserver", observer, .OBJC_ASSOCIATION_RETAIN)

        brandedOverlay = overlay

        // --- Secure text field ---
        let field = UITextField()
        field.isSecureTextEntry = true
        field.isUserInteractionEnabled = false

        // The field needs a non-zero size for iOS to fully instantiate the
        // secure container layer hierarchy.
        field.frame = window.bounds
        window.addSubview(field)

        // Force layout so the _UITextLayoutCanvasView is created
        field.layoutIfNeeded()

        NSLog("[ScreenGuard] field.layer.sublayers: %@",
              String(describing: field.layer.sublayers?.map { String(describing: type(of: $0)) }))

        // Find the secure canvas layer — it's the internal layer that iOS
        // excludes from screen capture.
        guard let canvasLayer = field.layer.sublayers?.first else {
            NSLog("[ScreenGuard] ERROR: no canvas layer found, bailing out")
            field.removeFromSuperview()
            return
        }

        NSLog("[ScreenGuard] canvasLayer: %@ (%@)",
              String(describing: canvasLayer),
              String(describing: type(of: canvasLayer)))

        // Snapshot the current sublayers before we start moving things
        let layersToMove = (window.layer.sublayers ?? []).filter {
            $0 !== field.layer && $0 !== overlay.layer
        }

        NSLog("[ScreenGuard] Moving %d sublayers into canvas", layersToMove.count)

        for sublayer in layersToMove {
            canvasLayer.addSublayer(sublayer)
        }

        // Protection starts off
        field.isSecureTextEntry = false

        // Now switch to auto layout
        field.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            field.topAnchor.constraint(equalTo: window.topAnchor),
            field.bottomAnchor.constraint(equalTo: window.bottomAnchor),
            field.leadingAnchor.constraint(equalTo: window.leadingAnchor),
            field.trailingAnchor.constraint(equalTo: window.trailingAnchor)
        ])

        secureField = field
        isSetUp = true

        NSLog("[ScreenGuard] setUp complete — isSetUp=true, secureField=%@",
              String(describing: secureField))
    }

    @objc func enable(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.setUp()
            NSLog("[ScreenGuard] enable — secureField: %@, isSetUp: %d",
                  String(describing: self.secureField), self.isSetUp ? 1 : 0)
            self.secureField?.isSecureTextEntry = true
            self.brandedOverlay?.isHidden = false
            call.resolve()
        }
    }

    @objc func disable(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            NSLog("[ScreenGuard] disable")
            self?.secureField?.isSecureTextEntry = false
            self?.brandedOverlay?.isHidden = true
            call.resolve()
        }
    }
}
