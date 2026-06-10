package net.lluminaa.solarray;

import android.Manifest;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingClient;
import com.google.android.gms.location.GeofencingRequest;
import com.google.android.gms.location.LocationServices;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Registers the stored geofences with Google Play Services. The OS owns them from
 * that point: it wakes {@link GeofenceReceiver} on entry even if the app was killed.
 */
final class GeofenceRegistrar {

    private GeofenceRegistrar() {}

    static int register(Context context) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            return 0;
        }

        GeofencingClient client = LocationServices.getGeofencingClient(context);
        PendingIntent pendingIntent = pendingIntent(context);

        // Replace the whole set: completed/deleted reminders fall away, new ones arm.
        client.removeGeofences(pendingIntent);

        JSONArray stored = GeofenceStore.load(context);
        List<Geofence> geofences = new ArrayList<>();
        for (int index = 0; index < stored.length(); index += 1) {
            JSONObject fence = stored.optJSONObject(index);
            if (fence == null) {
                continue;
            }

            String id = fence.optString("id");
            double latitude = fence.optDouble("latitude", Double.NaN);
            double longitude = fence.optDouble("longitude", Double.NaN);
            double radius = fence.optDouble("radiusMeters", 250);
            if (id.isEmpty() || Double.isNaN(latitude) || Double.isNaN(longitude)) {
                continue;
            }

            geofences.add(new Geofence.Builder()
                    .setRequestId(id)
                    .setCircularRegion(latitude, longitude, (float) Math.max(radius, 100))
                    .setExpirationDuration(Geofence.NEVER_EXPIRE)
                    .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER)
                    .build());
        }

        if (geofences.isEmpty()) {
            return 0;
        }

        GeofencingRequest request = new GeofencingRequest.Builder()
                .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER)
                .addGeofences(geofences)
                .build();

        try {
            client.addGeofences(request, pendingIntent);
        } catch (SecurityException error) {
            return 0;
        }

        return geofences.size();
    }

    private static PendingIntent pendingIntent(Context context) {
        Intent intent = new Intent(context, GeofenceReceiver.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // Geofencing fills in event data, so the PendingIntent must stay mutable.
            flags |= PendingIntent.FLAG_MUTABLE;
        }
        return PendingIntent.getBroadcast(context, 8451, intent, flags);
    }
}
