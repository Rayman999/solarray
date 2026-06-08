import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  readonly permission = signal<NotificationPermission>(this.currentPermission());
  private readonly registration = this.resolveWorker();

  async requestPermission(): Promise<void> {
    if (!('Notification' in window)) {
      this.permission.set('denied');
      return;
    }

    const result = await Notification.requestPermission();
    this.permission.set(result);
  }

  async showLocal(title: string, body: string): Promise<void> {
    if (!(await this.canNotify())) {
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

  async showTaskAdded(title: string): Promise<void> {
    await this.showLocal('Reminder saved', title || 'Your reminder is ready.');
  }

  async showTaskCompleted(title: string): Promise<void> {
    await this.showLocal('Task completed', title || 'Nice, that one is done.');
  }

  async showTest(): Promise<void> {
    await this.showLocal('Solarray notifications are on', 'Your phone can show reminders from this app.');
  }

  private currentPermission(): NotificationPermission {
    return 'Notification' in window ? Notification.permission : 'denied';
  }

  private async canNotify(): Promise<boolean> {
    if (!('Notification' in window)) {
      this.permission.set('denied');
      return false;
    }

    this.permission.set(Notification.permission);
    return Notification.permission === 'granted';
  }

  private async resolveWorker(): Promise<ServiceWorkerRegistration | null> {
    if (!('serviceWorker' in navigator)) {
      return null;
    }

    return Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 2500))
    ]);
  }
}
