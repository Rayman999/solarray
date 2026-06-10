import { effect, inject, Injectable, signal } from '@angular/core';
import { Capacitor, registerPlugin } from '@capacitor/core';

import { ReminderStore } from './reminder-store.service';

interface NativeGeofence {
  id: string;
  title: string;
  body: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

interface SolarrayGeofencePlugin {
  sync(options: { geofences: NativeGeofence[] }): Promise<{ count: number }>;
}

// Custom in-app plugin (android/.../GeofencePlugin.java and ios/App/App/SolarrayGeofence.swift).
// Registers reminders as OS-level geofences, so the system itself wakes the app and posts the
// notification — even after a force-quit or reboot, which the in-app watcher cannot survive.
const SolarrayGeofence = registerPlugin<SolarrayGeofencePlugin>('SolarrayGeofence');

// Both iOS region monitoring and Android geofencing cap out around 20/100 slots; stay safely under.
const MAX_GEOFENCES = 20;

@Injectable({ providedIn: 'root' })
export class NativeGeofenceService {
  private readonly store = inject(ReminderStore);
  private lastSyncKey = '';

  readonly available = signal(Capacitor.isNativePlatform());
  readonly registeredCount = signal(0);

  constructor() {
    // Mirror open place reminders into OS geofences whenever they change.
    effect(() => {
      const reminders = this.store.locationReminders();
      if (!this.available()) {
        return;
      }

      const geofences: NativeGeofence[] = reminders
        .filter((reminder) => reminder.location)
        .slice(0, MAX_GEOFENCES)
        .map((reminder) => ({
          id: reminder.id,
          title: reminder.title,
          body: `You are near ${reminder.location!.label}.`,
          latitude: reminder.location!.latitude,
          longitude: reminder.location!.longitude,
          radiusMeters: reminder.location!.radiusMeters
        }));

      const syncKey = JSON.stringify(geofences);
      if (syncKey === this.lastSyncKey) {
        return;
      }

      this.lastSyncKey = syncKey;
      void this.push(geofences);
    });
  }

  private async push(geofences: NativeGeofence[]): Promise<void> {
    try {
      const result = await SolarrayGeofence.sync({ geofences });
      this.registeredCount.set(result.count);
    } catch {
      // Plugin missing (browser/dev build) — the in-app watcher still covers the running app.
      this.registeredCount.set(0);
    }
  }
}
