import Capacitor
import CoreLocation
import UserNotifications

/// Owns CoreLocation region monitoring for place reminders. iOS keeps these regions alive
/// at the OS level and relaunches the app for entry events — even after force-quit or reboot —
/// as long as location permission is set to Always. The notification is posted natively here,
/// so the WebView never needs to load for a reminder to fire.
final class GeofenceManager: NSObject, CLLocationManagerDelegate {

    static let shared = GeofenceManager()

    private let manager = CLLocationManager()
    private let metadataKey = "solarray.geofence.metadata"
    private var activated = false

    /// Must run during app launch so a region-triggered relaunch has a delegate to deliver to.
    func activate() {
        guard !activated else { return }
        activated = true
        manager.delegate = self
    }

    func sync(_ fences: [[String: Any]]) -> Int {
        activate()

        var metadata: [String: [String: String]] = [:]
        let incomingIds = Set(fences.compactMap { $0["id"] as? String })

        // Drop regions for reminders that were completed or deleted.
        for region in manager.monitoredRegions where !incomingIds.contains(region.identifier) {
            manager.stopMonitoring(for: region)
        }

        var count = 0
        // iOS allows at most 20 monitored regions per app.
        for fence in fences.prefix(20) {
            guard let id = fence["id"] as? String,
                  let latitude = fence["latitude"] as? Double,
                  let longitude = fence["longitude"] as? Double else { continue }

            let radius = (fence["radiusMeters"] as? Double) ?? 250
            metadata[id] = [
                "title": (fence["title"] as? String) ?? "Solarray reminder",
                "body": (fence["body"] as? String) ?? "You arrived at a saved place."
            ]

            let region = CLCircularRegion(
                center: CLLocationCoordinate2D(latitude: latitude, longitude: longitude),
                radius: min(max(radius, 100), manager.maximumRegionMonitoringDistance),
                identifier: id
            )
            region.notifyOnEntry = true
            region.notifyOnExit = false
            manager.startMonitoring(for: region)
            count += 1
        }

        UserDefaults.standard.set(metadata, forKey: metadataKey)
        return count
    }

    func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        let stored = UserDefaults.standard.dictionary(forKey: metadataKey)
        let info = stored?[region.identifier] as? [String: String]

        let content = UNMutableNotificationContent()
        content.title = info?["title"] ?? "Solarray reminder"
        content.body = info?["body"] ?? "You arrived at a saved place."
        content.sound = .default

        let request = UNNotificationRequest(
            identifier: "solarray-geofence-\(region.identifier)",
            content: content,
            trigger: nil
        )
        UNUserNotificationCenter.current().add(request)
    }

    func locationManager(_ manager: CLLocationManager, monitoringDidFailFor region: CLRegion?, withError error: Error) {
        // Monitoring failures are non-fatal; the in-app watcher still covers the running app.
    }
}

@objc(SolarrayGeofencePlugin)
public class SolarrayGeofencePlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "SolarrayGeofencePlugin"
    public let jsName = "SolarrayGeofence"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise)
    ]

    @objc func sync(_ call: CAPPluginCall) {
        let fences = (call.getArray("geofences") ?? []).compactMap { $0 as? [String: Any] }
        DispatchQueue.main.async {
            let count = GeofenceManager.shared.sync(fences)
            call.resolve(["count": count])
        }
    }
}
