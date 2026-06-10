import Capacitor
import UIKit

/// Custom bridge controller so in-app Capacitor plugins can register with the bridge.
class MainViewController: CAPBridgeViewController {

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(SolarrayGeofencePlugin())
    }
}
