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
      this.unsubscribeReminders = onSnapshot(remindersQuery, (snapshot) => {
        this.remindersSignal.set(snapshot.docs.map(toReminder));
      });
    });
  }

  add(reminder: Omit<Reminder, 'id' | 'createdAt' | 'completed'>): void {
    const user = this.auth.user();
    if (!user) {
      return;
    }

    const id = crypto.randomUUID();
    void setDoc(doc(this.collectionFor(user.uid), id), {
      ...reminder,
      completed: false,
      createdAt: new Date().toISOString()
    });
  }

  toggle(id: string): void {
    const user = this.auth.user();
    const reminder = this.reminders().find((candidate) => candidate.id === id);
    if (!user || !reminder) {
      return;
    }

    void updateDoc(doc(this.collectionFor(user.uid), id), { completed: !reminder.completed });
  }

  remove(id: string): void {
    const user = this.auth.user();
    if (!user) {
      return;
    }

    void deleteDoc(doc(this.collectionFor(user.uid), id));
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
