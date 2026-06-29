import Foundation
import Capacitor
import CoreLocation

@objc(LocationPermissionPlugin)
public class LocationPermissionPlugin: CAPPlugin, CLLocationManagerDelegate {

    private let manager = CLLocationManager()
    private var savedCall: CAPPluginCall?

    override public func load() {
        manager.delegate = self
    }

    @objc func requestAlways(_ call: CAPPluginCall) {
        savedCall = call

        DispatchQueue.main.async {
            self.manager.requestAlwaysAuthorization()
        }

        // Resolve immediately — the dialog is async and we check state after
        // We can't block until the user responds to the dialog
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            call.resolve()
            self.savedCall = nil
        }
    }
}
