package net.lluminaa.solarray;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Persists the synced geofence definitions so the BroadcastReceiver (which may run
 * without the app process / WebView) and the boot receiver can read them natively.
 */
final class GeofenceStore {

    private static final String PREFS = "solarray_geofences";
    private static final String KEY = "geofences";

    private GeofenceStore() {}

    static void save(Context context, JSONArray geofences) {
        prefs(context).edit().putString(KEY, geofences.toString()).apply();
    }

    static JSONArray load(Context context) {
        String raw = prefs(context).getString(KEY, "[]");
        try {
            return new JSONArray(raw);
        } catch (JSONException error) {
            return new JSONArray();
        }
    }

    static JSONObject find(Context context, String id) {
        JSONArray geofences = load(context);
        for (int index = 0; index < geofences.length(); index += 1) {
            JSONObject fence = geofences.optJSONObject(index);
            if (fence != null && id.equals(fence.optString("id"))) {
                return fence;
            }
        }
        return null;
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
