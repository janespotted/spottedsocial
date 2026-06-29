import UIKit
import Capacitor
import WebKit

class SpottedBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(SpottedCameraPlugin())
        bridge?.registerPluginInstance(LocationPermissionPlugin())
    }

    override func viewDidLoad() {
        super.viewDidLoad()

        guard let webView = webView else { return }

        // Disable swipe-back gesture
        webView.allowsBackForwardNavigationGestures = false

        // ── Performance optimizations ──

        // GPU-accelerated rendering
        webView.isOpaque = true
        webView.scrollView.decelerationRate = .normal

        // Match native scroll feel
        webView.scrollView.showsVerticalScrollIndicator = false
        webView.scrollView.showsHorizontalScrollIndicator = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never

        // Reduce input focus latency — disable content inset adjustments
        // that cause the webview to re-layout on keyboard show
        webView.scrollView.keyboardDismissMode = .interactive

        // Prevent long-press callout menus on links/images
        webView.allowsLinkPreview = false

        // Enable hardware acceleration hints
        webView.layer.drawsAsynchronously = true
    }
}
