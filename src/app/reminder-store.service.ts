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
  private unsubscribeReminders?: Unsubscribe;

  readonly reminders = this.remindersSignal.asReadonly();
  readonly error = signal('');
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
        this.remindersSignal.set([]);
        return;
      }

      const remindersQuery = query(this.collectionFor(user.uid), orderBy('createdAt', 'desc'));
      this.unsubscribeReminders = onSnapshot(
        remindersQuery,
        (snapshot) => {
          this.error.set('');
          this.remindersSignal.set(snapshot.docs.map(toReminder));
        },
        () => this.error.set('Could not sync reminders. Check Firestore rules and your connection.')
      );
    });
  }

  add(reminder: Omit<Reminder, 'id' | 'createdAt' | 'completed'>): string | null {
    const user = this.auth.user();
    if (!user) {
      this.error.set('Sign in before adding reminders.');
      return null;
    }

    const id = crypto.randomUUID();
    const nextReminder: Reminder = {
      ...reminder,
      id,
      completed: false,
      createdAt: new Date().toISOString()
    };

    this.remindersSignal.update((reminders) => [nextReminder, ...reminders]);
    void setDoc(doc(this.collectionFor(user.uid), id), nextReminder)
      .then(() => {
        this.error.set('');
      })
      .catch(() => {
        this.remindersSignal.update((reminders) => reminders.filter((candidate) => candidate.id !== id));
        this.error.set('Could not save that reminder. Try again in a moment.');
      });

    return id;
  }

  toggle(id: string): Reminder | null {
    const user = this.auth.user();
    const reminder = this.reminders().find((candidate) => candidate.id === id);
    if (!user || !reminder) {
      this.error.set('Could not find that reminder.');
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
      .catch(() => {
        this.remindersSignal.update((reminders) =>
          reminders.map((candidate) => (candidate.id === id ? reminder : candidate))
        );
        this.error.set('Could not update that reminder. Try again in a moment.');
      });

    return updatedReminder;
  }

  remove(id: string): void {
    const user = this.auth.user();
    if (!user) {
      this.error.set('Sign in before deleting reminders.');
      return;
    }

    const previous = this.reminders();
    this.remindersSignal.set(previous.filter((reminder) => reminder.id !== id));

    void deleteDoc(doc(this.collectionFor(user.uid), id))
      .then(() => {
      this.error.set('');
      })
      .catch(() => {
        this.remindersSignal.set(previous);
        this.error.set('Could not delete that reminder. Try again in a moment.');
      });
  }

  private collectionFor(uid: string) {
    return collection(this.db, 'users', uid, 'reminders');
  }
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
