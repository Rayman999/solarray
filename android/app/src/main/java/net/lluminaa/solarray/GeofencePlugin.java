package net.lluminaa.solarray;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;

/**
 * Bridge for the web app: receives the current set of place reminders and hands
 * them to the OS geofencing engine via {@link GeofenceRegistrar}.
 */
@CapacitorPlugin(name = "SolarrayGeofence")
public class GeofencePlugin extends Plugin {

    @PluginMethod
    public void sync(PluginCall call) {
        JSArray geofences = call.getArray("geofences");
        JSONArray stored = new JSONArray();

        if (geofences != null) {
            for (int index = 0; index < geofences.length(); index += 1) {
                try {
                    stored.put(geofences.get(index));
                } catch (JSONException error) {
                    // Skip malformed entries; the rest still register.
                }
            }
        }

        GeofenceStore.save(getContext(), stored);
        int count = GeofenceRegistrar.register(getContext());

        JSObject result = new JSObject();
        result.put("count", count);
        call.resolve(result);
    }
}
