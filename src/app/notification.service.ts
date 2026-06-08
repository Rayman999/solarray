import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  readonly permission = signal<NotificationPermission>(this.currentPermission());
  private readonly registration = this.registerWorker();

  async requestPermission(): Promise<void> {
    if (!('Notification' in window)) {
      this.permission.set('denied');
      return;
    }

    const result = await Notification.requestPermission();
    this.permission.set(result);
  }

  async showLocal(title: string, body: string): Promise<void> {
    if (this.permission() !== 'granted') {
      return;
    }

    const registration = await this.registration;
    if (registration) {
      await registration.showNotification(title, {
        body,
        icon: '/icons/icon-192.svg',
        badge: '/icons/icon-192.svg'
      });
      return;
    }

    new Notification(title, { body, icon: '/icons/icon-192.svg' });
  }

  private currentPermission(): NotificationPermission {
    return 'Notification' in window ? Notification.permission : 'denied';
  }

  private async registerWorker(): Promise<ServiceWorkerRegistration | null> {
    if (!('serviceWorker' in navigator)) {
      return null;
    }

    return navigator.serviceWorker.register('/firebase-messaging-sw.js');
  }
}
