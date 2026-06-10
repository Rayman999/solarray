package net.lluminaa.solarray;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingEvent;

import org.json.JSONObject;

import java.util.List;

/**
 * Woken by the OS on geofence entry — including when the app process is dead.
 * Posts the reminder notification entirely natively, no WebView required.
 */
public class GeofenceReceiver extends BroadcastReceiver {

    private static final String CHANNEL_ID = "solarray-places";

    @Override
    public void onReceive(Context context, Intent intent) {
        GeofencingEvent event = GeofencingEvent.fromIntent(intent);
        if (event == null || event.hasError()) {
            return;
        }

        if (event.getGeofenceTransition() != Geofence.GEOFENCE_TRANSITION_ENTER) {
            return;
        }

        List<Geofence> triggered = event.getTriggeringGeofences();
        if (triggered == null) {
            return;
        }

        ensureChannel(context);
        for (Geofence geofence : triggered) {
            JSONObject fence = GeofenceStore.find(context, geofence.getRequestId());
            String title = fence != null ? fence.optString("title", "Solarray reminder") : "Solarray reminder";
            String body = fence != null ? fence.optString("body", "You arrived at a saved place.") : "You arrived at a saved place.";
            notifyArrival(context, geofence.getRequestId(), title, body);
        }
    }

    private void notifyArrival(Context context, String id, String title, String body) {
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        PendingIntent contentIntent = null;
        if (launch != null) {
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            contentIntent = PendingIntent.getActivity(context, id.hashCode(), launch, flags);
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(context.getApplicationInfo().icon)
                .setContentTitle(title)
                .setContentText(body)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setDefaults(NotificationCompat.DEFAULT_ALL);
        if (contentIntent != null) {
            builder.setContentIntent(contentIntent);
        }

        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(Math.abs(id.hashCode()), builder.build());
        }
    }

    private void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) {
            return;
        }

        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Place reminders",
                NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Alerts when you arrive at a saved place.");
        manager.createNotificationChannel(channel);
    }
}
