import { Injectable, computed, inject, signal } from '@angular/core';

import { NotificationService } from './notification.service';
import { Reminder } from './reminder.model';
import { ReminderStore } from './reminder-store.service';

interface Coordinates {
  latitude: number;
  longitude: number;
}

@Injectable({ providedIn: 'root' })
export class LocationReminderService {
  private readonly store = inject(ReminderStore);
  private readonly notifications = inject(NotificationService);
  private watchId?: number;

  readonly currentPosition = signal<Coordinates | null>(null);
  readonly isWatching = signal(false);
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

  start(): void {
    if (!('geolocation' in navigator)) {
      this.error.set('Location is not available on this device.');
      return;
    }

    this.watchId = navigator.geolocation.watchPosition(
      async ({ coords }) => {
        this.currentPosition.set({
          latitude: coords.latitude,
          longitude: coords.longitude
        });
        await this.notifyNearby();
      },
      (error) => this.error.set(error.message),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 }
    );
    this.isWatching.set(true);
  }

  stop(): void {
    if (this.watchId !== undefined) {
      navigator.geolocation.clearWatch(this.watchId);
    }
    this.isWatching.set(false);
  }

  private async notifyNearby(): Promise<void> {
    for (const reminder of this.nearbyReminders()) {
      await this.notifications.showLocal(reminder.title, reminder.notes || 'You are near this reminder.');
    }
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
