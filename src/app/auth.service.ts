import { Injectable, computed, signal } from '@angular/core';
import {
  User,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from 'firebase/auth';

import { getFirebaseApp } from './firebase-app';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = getAuth(getFirebaseApp());
  private resolveReady!: () => void;

  readonly user = signal<User | null>(null);
  readonly isAuthenticated = computed(() => this.user() !== null);
  readonly ready = new Promise<void>((resolve) => {
    this.resolveReady = resolve;
  });

  constructor() {
    onAuthStateChanged(this.auth, (user) => {
      this.user.set(user);
      this.resolveReady();
    });
  }

  async login(email: string, password: string): Promise<void> {
    await signInWithEmailAndPassword(this.auth, email.trim(), password);
  }

  async signup(name: string, email: string, password: string): Promise<void> {
    const credential = await createUserWithEmailAndPassword(this.auth, email.trim(), password);
    const trimmedName = name.trim();
    if (trimmedName) {
      await updateProfile(credential.user, { displayName: trimmedName });
    }
  }

  async logout(): Promise<void> {
    await signOut(this.auth);
  }
}

export function authErrorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? '';

  switch (code) {
    case 'auth/invalid-email':
      return 'That email address looks invalid.';
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'Email or password is incorrect.';
    case 'auth/email-already-in-use':
      return 'An account already exists with that email.';
    case 'auth/weak-password':
      return 'Choose a password with at least 6 characters.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Try again in a moment.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
