import { Injectable, computed, effect, inject, signal } from '@angular/core';
import {
  DocumentData,
  QueryDocumentSnapshot,
  Unsubscribe,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc
} from 'firebase/firestore';

import { AuthService } from './auth.service';
import { getFirebaseFirestore } from './firebase-app';
import { Reminder } from './reminder.model';

@Injectable({ providedIn: 'root' })
export class ReminderStore {
  private readonly auth = inject(AuthService);
  private readonly db = getFirebaseFirestore();
  private readonly remindersSignal = signal<Reminder[]>([]);
  private readonly pendingWrites = new Map<string, Reminder>();
  private unsubscribeReminders?: Unsubscribe;

  readonly reminders = this.remindersSignal.asReadonly();
  readonly error = signal('');
  readonly syncState = signal<'idle' | 'listening' | 'synced' | 'error'>('idle');
  readonly openReminders = computed(() => this.reminders().filter((reminder) => !reminder.completed));
  readonly completedReminders = computed(() => this.reminders().filter((reminder) => reminder.completed));
  readonly locationReminders = computed(() => this.openReminders().filter((reminder) => reminder.location));

  constructor() {
    // Psychology: object permanence. Reminders follow the signed-in account, so the list is identical on phone and desktop.
    effect(() => {
      const user = this.auth.user();
      this.unsubscribeReminders?.();
      this.unsubscribeReminders = undefined;

      if (!user) {
        this.syncState.set('idle');
        this.remindersSignal.set([]);
        return;
      }

      this.syncState.set('listening');
      const remindersQuery = query(this.collectionFor(user.uid), orderBy('createdAt', 'desc'));
      this.unsubscribeReminders = onSnapshot(
        remindersQuery,
        (snapshot) => {
          const syncedReminders = snapshot.docs.map(toReminder);
          const syncedIds = new Set(syncedReminders.map((reminder) => reminder.id));

          for (const id of syncedIds) {
            this.pendingWrites.delete(id);
          }

          const pendingReminders = Array.from(this.pendingWrites.values()).filter((reminder) => !syncedIds.has(reminder.id));

          this.error.set('');
          this.syncState.set('synced');
          this.remindersSignal.set([...pendingReminders, ...syncedReminders]);
        },
        (error) => {
          console.error('Solarray reminder sync failed', error);
          this.syncState.set('error');
          this.reportError('Could not sync reminders. Check Firestore rules and your connection.', error);
        }
      );
    });
  }

  add(reminder: Reminder): boolean {
    const user = this.auth.user();
    if (!user) {
      this.reportError('Sign in before adding reminders.');
      return false;
    }

    this.pendingWrites.set(reminder.id, reminder);
    this.remindersSignal.update((reminders) =>
      reminders.some((candidate) => candidate.id === reminder.id)
        ? reminders.map((candidate) => (candidate.id === reminder.id ? reminder : candidate))
        : [reminder, ...reminders]
    );
    void setDoc(doc(this.collectionFor(user.uid), reminder.id), toFirestoreReminder(reminder))
      .then(() => {
        this.error.set('');
      })
      .catch((error) => {
        console.error('Solarray reminder save failed', error);
        this.pendingWrites.delete(reminder.id);
        this.remindersSignal.update((reminders) => reminders.filter((candidate) => candidate.id !== reminder.id));
        this.reportError('Could not save that reminder. Try again in a moment.', error);
      });

    return true;
  }

  toggle(id: string): Reminder | null {
    const user = this.auth.user();
    const reminder = this.reminders().find((candidate) => candidate.id === id);
    if (!user || !reminder) {
      this.reportError('Could not find that reminder.');
      return null;
    }

    const completed = !reminder.completed;
    const updatedReminder = { ...reminder, completed };
    this.remindersSignal.update((reminders) =>
      reminders.map((candidate) => (candidate.id === id ? updatedReminder : candidate))
    );

    void updateDoc(doc(this.collectionFor(user.uid), id), { completed })
      .then(() => {
        this.error.set('');
      })
      .catch((error) => {
        console.error('Solarray reminder update failed', error);
        this.remindersSignal.update((reminders) =>
          reminders.map((candidate) => (candidate.id === id ? reminder : candidate))
        );
        this.reportError('Could not update that reminder. Try again in a moment.', error);
      });

    return updatedReminder;
  }

  remove(id: string): void {
    const user = this.auth.user();
    if (!user) {
      this.reportError('Sign in before deleting reminders.');
      return;
    }

    const previous = this.reminders();
    this.remindersSignal.set(previous.filter((reminder) => reminder.id !== id));

    void deleteDoc(doc(this.collectionFor(user.uid), id))
      .then(() => {
      this.error.set('');
      })
      .catch((error) => {
        console.error('Solarray reminder delete failed', error);
        this.remindersSignal.set(previous);
        this.reportError('Could not delete that reminder. Try again in a moment.', error);
      });
  }

  private collectionFor(uid: string) {
    return collection(this.db, 'users', uid, 'reminders');
  }

  private reportError(message: string, error?: unknown): void {
    const code = (error as { code?: string } | null)?.code;
    const messageWithCode = code ? `${message} (${code})` : message;
    this.error.set(messageWithCode);
    window.dispatchEvent(
      new CustomEvent('solarray-reminder-status', {
        detail: {
          tone: 'error',
          message: messageWithCode
        }
      })
    );
  }
}

function toFirestoreReminder(reminder: Reminder): Record<string, unknown> {
  const data: Record<string, unknown> = {
    id: reminder.id,
    title: reminder.title,
    notes: reminder.notes,
    kind: reminder.kind,
    dueAt: reminder.dueAt,
    completed: reminder.completed,
    createdAt: reminder.createdAt
  };

  if (reminder.location) {
    data['location'] = reminder.location;
  }

  return data;
}

function toReminder(snapshot: QueryDocumentSnapshot<DocumentData>): Reminder {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    title: data['title'] ?? '',
    notes: data['notes'] ?? '',
    kind: data['kind'] ?? 'todo',
    dueAt: data['dueAt'] ?? new Date().toISOString(),
    completed: data['completed'] ?? false,
    location: data['location'] ?? undefined,
    createdAt: data['createdAt'] ?? new Date().toISOString()
  };
}
