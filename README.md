# Solarray Reminders

Angular 22 mobile-first starter for todos, reminders, and location-aware prompts.

## Stack

- Angular `^22.0.0`
- Tailwind CSS `^4.3.0`
- PrimeIcons and PrimeNG are included for app icons/components.
- Firebase-ready setup for Auth, Firestore, local notifications, and future Cloud Messaging.

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
2. Enable Firestore, Authentication, and Cloud Messaging.
3. Add the web app config to `src/environments/environment.ts`.
4. Generate a Cloud Messaging web push certificate and add the VAPID key to the same file.
5. Build locally when needed:

```bash
npm run build
```

## Automatic Server Deploys

Solarray is hosted on the VPS through Portainer/Traefik using `docker-compose.yml`.
The GitHub Actions workflow builds the Docker image and pushes it to GitHub
Container Registry on every push to `main`.

To make deploys automatic:

1. In Portainer, open the `solarray` stack and create/copy its update webhook URL.
2. In GitHub, open the repo settings and add an Actions secret named
   `PORTAINER_WEBHOOK_URL`.
3. Paste the Portainer webhook URL as the secret value.
4. Push to `main`.

After that, the flow is:

```text
push to main -> GitHub builds image -> GHCR gets latest -> Portainer redeploys -> test on phone
```

## Important Mobile Note

Web push and geolocation are browser-controlled. A PWA can request notification permission and watch location while open, but reliable background geofencing usually needs a native shell such as Capacitor plus native Android/iOS location APIs. This project is structured so the web app can later be wrapped with Capacitor without throwing away the Angular work.
