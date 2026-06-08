# Solarray Reminders

Angular 22 mobile-first starter for todos, reminders, and location-aware prompts.

## Stack

- Angular `^22.0.0`
- Tailwind CSS `^4.3.0`
- PrimeIcons are included for app icons. PrimeNG components should be added when the Angular 22-compatible PrimeNG v22 release is available.
- Firebase-ready setup for free Hosting, Firestore, Auth, and Cloud Messaging.

## Requirements

Angular 22 requires Node.js `^22.22.3`, `^24.15.0`, or `^26.0.0`, TypeScript `>=6.0.0 <6.1.0`, and RxJS `^6.5.3 || ^7.4.0`.

## Run

```bash
npm install
npm start
```

Then open `http://localhost:4200`.

When PrimeNG v22 is published:

```bash
npm install primeng @primeuix/themes
```

## Firebase Setup

1. Create a Firebase project on the Spark/free plan.
2. Enable Hosting, Firestore, Authentication, and Cloud Messaging.
3. Add the web app config to `src/environments/environment.ts`.
4. Generate a Cloud Messaging web push certificate and add the VAPID key to the same file.
5. Build and deploy:

```bash
npm run build
npx firebase-tools login
npx firebase-tools init
npm run firebase:deploy
```

## Important Mobile Note

Web push and geolocation are browser-controlled. A PWA can request notification permission and watch location while open, but reliable background geofencing usually needs a native shell such as Capacitor plus native Android/iOS location APIs. This project is structured so the web app can later be wrapped with Capacitor without throwing away the Angular work.
