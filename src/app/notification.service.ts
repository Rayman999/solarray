import { Injectable, signal } from '@angular/core';

const NOTIFICATION_ICON = '/icons/icon-192.png';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  readonly permission = signal<NotificationPermission>(this.currentPermission());
  readonly status = signal('');
  readonly error = signal('');
  private readonly registration = this.resolveWorker();

  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      this.permission.set('denied');
      this.report('This device/browser is not exposing web notifications.', 'error');
      return false;
    }

    const result = await Notification.requestPermission();
    this.permission.set(result);
    if (result !== 'granted') {
      this.report(`Notifications are ${result}. Enable Solarray in iPhone Settings > Notifications.`, 'error');
      return false;
    }

    this.report('Notifications granted.', 'success');
    return true;
  }

  async showLocal(title: string, body: string): Promise<boolean> {
    if (!(await this.canNotify())) {
      return false;
    }

    try {
      const registration = await this.registration;
      if (registration) {
        await registration.showNotification(title, {
          body,
          icon: NOTIFICATION_ICON,
          badge: NOTIFICATION_ICON
        });
        this.report('Notification sent.', 'success');
        return true;
      }

      new Notification(title, { body, icon: NOTIFICATION_ICON });
      this.report('Notification sent.', 'success');
      return true;
    } catch (error) {
      const message = (error as { message?: string } | null)?.message ?? 'Could not show notification.';
      this.report(message, 'error');
      return false;
    }
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
      this.report('This device/browser is not exposing web notifications.', 'error');
      return false;
    }

    this.permission.set(Notification.permission);
    if (Notification.permission !== 'granted') {
      this.report(`Notifications are ${Notification.permission}. Tap the bell first.`, 'error');
      return false;
    }

    return true;
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

  private report(message: string, tone: 'success' | 'error'): void {
    this.status.set(message);
    this.error.set(tone === 'error' ? message : '');
    window.dispatchEvent(
      new CustomEvent('solarray-reminder-status', {
        detail: {
          tone,
          message
        }
      })
    );
  }
}
