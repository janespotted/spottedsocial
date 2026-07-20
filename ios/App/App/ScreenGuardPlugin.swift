import Foundation
import Capacitor
import UIKit

@objc(ScreenGuardPlugin)
public class ScreenGuardPlugin: CAPPlugin {

    private var secureField: UITextField?
    private var brandedOverlay: UIView?
    private var isSetUp = false

    /// One-time setup: create a hidden secure text field and reparent the window's
    /// layer inside the text field's layer so the OS treats the entire window as
    /// secure content when isSecureTextEntry is true.
    ///
    /// A branded overlay (dark purple + S logo) sits directly on the window OUTSIDE
    /// the secure canvas layer. During normal use the app content renders on top of
    /// it. In screenshots/recordings the canvas-layer content is hidden, revealing
    /// the branded overlay instead of a black screen.
    ///
    /// Protection starts OFF — callers toggle via enable()/disable().
    private func setUp() {
        guard !isSetUp else { return }
        guard let window = bridge?.webView?.window ?? UIApplication.shared.windows.first else { return }

        // --- Branded overlay (visible in screenshots when protection is on) ---
        let overlay = UIView()
        overlay.isUserInteractionEnabled = false

        // Gradient background: #1a0f2e → #110a24
        let gradient = CAGradientLayer()
        gradient.colors = [
            UIColor(red: 0x1a/255.0, green: 0x0f/255.0, blue: 0x2e/255.0, alpha: 1).cgColor,
            UIColor(red: 0x11/255.0, green: 0x0a/255.0, blue: 0x24/255.0, alpha: 1).cgColor
        ]
        gradient.startPoint = CGPoint(x: 0.5, y: 0)
        gradient.endPoint = CGPoint(x: 0.5, y: 1)
        overlay.layer.addSublayer(gradient)

        // S logo centered
        let logoView = UIImageView(image: UIImage(named: "ScreenGuardLogo"))
        logoView.contentMode = .scaleAspectFit
        logoView.translatesAutoresizingMaskIntoConstraints = false
        overlay.addSubview(logoView)

        overlay.isHidden = true  // hidden until enable() is called
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

        // Size gradient layer on layout
        overlay.layoutIfNeeded()
        gradient.frame = overlay.bounds
        // Keep gradient in sync with rotation/resize
        let observer = overlay.observe(\.bounds, options: [.new]) { view, _ in
            gradient.frame = view.bounds
        }
        objc_setAssociatedObject(overlay, "gradientObserver", observer, .OBJC_ASSOCIATION_RETAIN)

        brandedOverlay = overlay

        // --- Secure text field (hides canvas-layer content in screenshots) ---
        let field = UITextField()
        field.isSecureTextEntry = false
        field.isUserInteractionEnabled = false
        field.frame = .zero

        window.addSubview(field)

        if let canvasLayer = field.layer.sublayers?.first {
            // Move ALL existing window sublayers (except the field itself and
            // the branded overlay) into the canvas layer so they are protected.
            for sublayer in window.layer.sublayers ?? [] where sublayer !== field.layer && sublayer !== overlay.layer {
                canvasLayer.addSublayer(sublayer)
            }
        }

        field.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            field.topAnchor.constraint(equalTo: window.topAnchor),
            field.bottomAnchor.constraint(equalTo: window.bottomAnchor),
            field.leadingAnchor.constraint(equalTo: window.leadingAnchor),
            field.trailingAnchor.constraint(equalTo: window.trailingAnchor)
        ])

        secureField = field
        isSetUp = true
    }

    @objc func enable(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.setUp()
            self?.secureField?.isSecureTextEntry = true
            self?.brandedOverlay?.isHidden = false
            call.resolve()
        }
    }

    @objc func disable(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.secureField?.isSecureTextEntry = false
            self?.brandedOverlay?.isHidden = true
            call.resolve()
        }
    }
}
