self.addEventListener('push', (event) => {
  const payload = event.data?.json?.() ?? {};
  const title = payload.notification?.title ?? 'Solarray reminder';
  const options = {
    body: payload.notification?.body ?? 'You have something waiting.',
    icon: '/icons/icon-192.svg',
    badge: '/icons/icon-192.svg',
    data: payload.data ?? {}
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
