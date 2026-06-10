import { Injectable, effect, inject, signal } from '@angular/core';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type {
  BackgroundGeolocationPlugin,
  CallbackError,
  Location
} from '@capacitor-community/background-geolocation';

import { Reminder } from './reminder.model';
import { ReminderStore } from './reminder-store.service';

interface Coordinates {
  latitude: number;
  longitude: number;
}

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');
const NATIVE_WATCHER_KEY = 'solarray.nativeLocationWatcherId';
const NATIVE_NOTIFIED_KEY = 'solarray.nativeLocationNotifiedIds';

@Injectable({ providedIn: 'root' })
export class NativeLocationService {
  private readonly store = inject(ReminderStore);
  private watcherId = readString(NATIVE_WATCHER_KEY);
  private insideLocationIds = new Set<string>();
  private readonly notifiedLocationIds = new Set(readStringList(NATIVE_NOTIFIED_KEY));

  readonly available = signal(Capacitor.isNativePlatform());
  readonly isWatching = signal(Boolean(this.watcherId));
  readonly status = signal('');
  readonly error = signal('');

  constructor() {
    effect(() => {
      if (!this.available()) {
        return;
      }

      const openIds = new Set(this.store.openReminders().map((reminder) => reminder.id));
      let changed = false;

      for (const id of this.notifiedLocationIds) {
        if (!openIds.has(id)) {
          this.notifiedLocationIds.delete(id);
          changed = true;
        }
      }

      if (changed) {
        this.persistNotifiedIds();
      }
    });
  }

  async start(): Promise<boolean> {
    if (!this.available()) {
      this.status.set('Native background location is available in the installed app.');
      return false;
    }

    if (this.isWatching()) {
      return true;
    }

    const notificationsGranted = await this.requestNotificationPermission();
    if (!notificationsGranted) {
      this.error.set('Native notification permission is needed for place reminders.');
      return false;
    }

    try {
      const watcherId = await BackgroundGeolocation.addWatcher(
        {
          backgroundTitle: 'Solarray place reminders',
          backgroundMessage: 'Watching for nearby reminders.',
          requestPermissions: true,
          stale: false,
          distanceFilter: 25
        },
        (position?: Location, error?: CallbackError) => {
          void this.handleWatcherUpdate(position, error);
        }
      );

      this.watcherId = watcherId;
      this.isWatching.set(true);
      this.error.set('');
      this.status.set('Native background location armed.');
      writeString(NATIVE_WATCHER_KEY, watcherId);
      return true;
    } catch (error) {
      const message = errorMessage(error, 'Could not start native background location.');
      this.error.set(message);
      this.status.set(message);
      return false;
    }
  }

  async stop(remember = true): Promise<void> {
    const watcherId = this.watcherId;
    this.watcherId = undefined;
    this.isWatching.set(false);
    this.insideLocationIds.clear();

    if (remember) {
      removeString(NATIVE_WATCHER_KEY);
    }

    if (!watcherId || !this.available()) {
      this.status.set('Native background location paused.');
      return;
    }

    try {
      await BackgroundGeolocation.removeWatcher({ id: watcherId });
      this.error.set('');
      this.status.set('Native background location paused.');
    } catch (error) {
      const message = errorMessage(error, 'Could not stop native background location.');
      this.error.set(message);
      this.status.set(message);
    }
  }

  async showTestNotification(): Promise<boolean> {
    if (!this.available()) {
      return false;
    }

    if (!(await this.requestNotificationPermission())) {
      return false;
    }

    await LocalNotifications.schedule({
      notifications: [
        {
          id: notificationIdFromReminderId('solarray-test'),
          title: 'Solarray notifications are on',
          body: 'Native reminders can alert you from the installed app.'
        }
      ]
    });
    this.status.set('Native notification sent.');
    return true;
  }

  private async handleWatcherUpdate(position?: Location, error?: CallbackError): Promise<void> {
    if (error) {
      const message = error.message || error.code || 'Native location failed.';
      this.error.set(message);
      this.status.set(message);

      if (error.code === 'NOT_AUTHORIZED') {
        await BackgroundGeolocation.openSettings();
      }
      return;
    }

    if (!position) {
      return;
    }

    this.error.set('');
    this.status.set('Native location updated.');
    await this.notifyNearby({
      latitude: position.latitude,
      longitude: position.longitude
    });
  }

  private async notifyNearby(position: Coordinates): Promise<void> {
    const nearbyIds = new Set<string>();

    for (const reminder of this.store.locationReminders()) {
      if (!reminder.location) {
        continue;
      }

      const isNearby = distanceInMeters(position, reminder.location) <= reminder.location.radiusMeters;
      if (!isNearby) {
        continue;
      }

      nearbyIds.add(reminder.id);
      if (this.insideLocationIds.has(reminder.id) || this.notifiedLocationIds.has(reminder.id)) {
        continue;
      }

      this.insideLocationIds.add(reminder.id);
      this.notifiedLocationIds.add(reminder.id);
      this.persistNotifiedIds();
      await this.notifyReminder(reminder);
    }

    this.insideLocationIds = nearbyIds;
  }

  private async notifyReminder(reminder: Reminder): Promise<void> {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: notificationIdFromReminderId(reminder.id),
          title: reminder.title,
          body: reminder.location ? `You are near ${reminder.location.label}.` : reminder.notes || 'You are near this reminder.',
          extra: {
            reminderId: reminder.id
          }
        }
      ]
    });
    this.status.set('Place reminder notification sent.');
  }

  private async requestNotificationPermission(): Promise<boolean> {
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') {
      return true;
    }

    const requested = await LocalNotifications.requestPermissions();
    return requested.display === 'granted';
  }

  private persistNotifiedIds(): void {
    writeString(NATIVE_NOTIFIED_KEY, JSON.stringify([...this.notifiedLocationIds]));
  }
}

function distanceInMeters(origin: Coordinates, target: NonNullable<Reminder['location']>): number {
  const earthRadius = 6_371_000;
  const lat1 = toRadians(origin.latitude);
  const lat2 = toRadians(target.latitude);
  const deltaLat = toRadians(target.latitude - origin.latitude);
  const deltaLon = toRadians(target.longitude - origin.longitude);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadius * c;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function notificationIdFromReminderId(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) | 0;
  }

  return Math.abs(hash) || 1;
}

function readString(key: string): string | undefined {
  try {
    return window.localStorage.getItem(key) || undefined;
  } catch {
    return undefined;
  }
}

function writeString(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Native watching still runs for the current app process if storage is unavailable.
  }
}

function removeString(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing else to clean up.
  }
}

function readStringList(key: string): string[] {
  const value = readString(key);
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return (error as { message?: string } | null)?.message || fallback;
}
