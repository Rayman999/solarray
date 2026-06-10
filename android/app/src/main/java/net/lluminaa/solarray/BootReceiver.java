package net.lluminaa.solarray;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Android drops all geofences on reboot; re-register the stored set so place
 * reminders survive a restart without the user ever opening the app.
 */
public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            GeofenceRegistrar.register(context);
        }
    }
}
