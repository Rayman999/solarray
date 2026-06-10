import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { NotificationService } from './notification.service';
import { Reminder } from './reminder.model';
import { ReminderStore } from './reminder-store.service';

interface Coordinates {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
}

const LOCATION_WATCH_KEY = 'solarray.locationWatchPreferred';

@Injectable({ providedIn: 'root' })
export class LocationReminderService {
  private readonly store = inject(ReminderStore);
  private readonly notifications = inject(NotificationService);
  private watchId?: number;
  private dueInterval?: number;
  private readonly notifiedLocationIds = new Set<string>();
  private readonly notifiedDueIds = new Set<string>();

  readonly currentPosition = signal<Coordinates | null>(null);
  readonly isWatching = signal(false);
  readonly preferredWatching = signal(readPreferredWatching());
  readonly error = signal('');
  readonly nearbyReminders = computed(() => {
    const position = this.currentPosition();
    if (!position) {
      return [];
    }

    return this.store.locationReminders().filter((reminder) => {
      if (!reminder.location) {
        return false;
      }

      return distanceInMeters(position, reminder.location) <= reminder.location.radiusMeters;
    });
  });

  constructor() {
    // Psychology: prompt at context. Time reminders are checked quietly in the background while the app is open.
    this.dueInterval = window.setInterval(() => void this.notifyDueReminders(), 30_000);

    effect(() => {
      const reminders = this.store.openReminders();
      const openIds = new Set(reminders.map((reminder) => reminder.id));

      for (const id of this.notifiedLocationIds) {
        if (!openIds.has(id)) {
          this.notifiedLocationIds.delete(id);
        }
      }

      for (const id of this.notifiedDueIds) {
        if (!openIds.has(id)) {
          this.notifiedDueIds.delete(id);
        }
      }

      void this.notifyDueReminders();
      void this.notifyNearby();
    });
  }

  start(remember = true): void {
    if (!('geolocation' in navigator)) {
      this.error.set('Location is not available on this device.');
      return;
    }

    if (this.isWatching()) {
      return;
    }

    if (remember) {
      this.setPreferredWatching(true);
    }

    this.watchId = navigator.geolocation.watchPosition(
      async ({ coords }) => {
        this.error.set('');
        this.currentPosition.set({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracyMeters: coords.accuracy
        });
        await this.notifyNearby();
      },
      (error) => this.error.set(error.message),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 }
    );
    this.isWatching.set(true);
  }

  stop(remember = true): void {
    if (this.watchId !== undefined) {
      navigator.geolocation.clearWatch(this.watchId);
    }
    this.watchId = undefined;
    if (remember) {
      this.setPreferredWatching(false);
    }
    this.isWatching.set(false);
  }

  resumePreferredWatch(): void {
    if (this.preferredWatching()) {
      this.start(false);
    }
  }

  useCurrentPosition(): Promise<Coordinates> {
    if (!('geolocation' in navigator)) {
      this.error.set('Location is not available on this device.');
      return Promise.reject(new Error('Location is not available on this device.'));
    }

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          const position = {
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracyMeters: coords.accuracy
          };
          this.error.set('');
          this.currentPosition.set(position);
          resolve(position);
        },
        (error) => {
          this.error.set(error.message);
          reject(error);
        },
        { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 }
      );
    });
  }

  private async notifyNearby(): Promise<void> {
    const nearbyIds = new Set(this.nearbyReminders().map((reminder) => reminder.id));

    for (const id of this.notifiedLocationIds) {
      if (!nearbyIds.has(id)) {
        this.notifiedLocationIds.delete(id);
      }
    }

    for (const reminder of this.nearbyReminders()) {
      if (this.notifiedLocationIds.has(reminder.id)) {
        continue;
      }

      this.notifiedLocationIds.add(reminder.id);
      await this.notifications.showLocal(
        reminder.title,
        reminder.location ? `You are near ${reminder.location.label}.` : reminder.notes || 'You are near this reminder.'
      );
    }
  }

  private async notifyDueReminders(): Promise<void> {
    const now = Date.now();

    for (const reminder of this.store.openReminders()) {
      if (reminder.kind === 'location' || this.notifiedDueIds.has(reminder.id)) {
        continue;
      }

      const dueTime = new Date(reminder.dueAt).getTime();
      if (!Number.isFinite(dueTime) || dueTime > now) {
        continue;
      }

      this.notifiedDueIds.add(reminder.id);
      await this.notifications.showLocal(reminder.title, reminder.notes || 'This reminder is due now.');
    }
  }

  private setPreferredWatching(value: boolean): void {
    this.preferredWatching.set(value);
    try {
      window.localStorage.setItem(LOCATION_WATCH_KEY, value ? '1' : '0');
    } catch {
      // Ignore storage failures; the active watch still works for the current session.
    }
  }
}

function readPreferredWatching(): boolean {
  try {
    return window.localStorage.getItem(LOCATION_WATCH_KEY) === '1';
  } catch {
    return false;
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
