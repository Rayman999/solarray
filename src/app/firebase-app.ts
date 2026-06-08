import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { Firestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

import { environment } from '../environments/environment';

let firestore: Firestore | undefined;

export function getFirebaseApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(environment.firebase);
}

export function getFirebaseFirestore(): Firestore {
  if (!firestore) {
    // Persistent cache lets the reminder list keep working (and queue writes) while offline on a phone.
    firestore = initializeFirestore(getFirebaseApp(), {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });
  }

  return firestore;
}
