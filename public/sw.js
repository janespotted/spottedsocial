// Service Worker for Web Push Notifications

self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: data.tag || 'spotted-notification',
    data: {
      url: data.url || '/',
      type: data.type,
    },
    requireInteraction: data.requireInteraction || false,
    vibrate: [100, 50, 100],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Spotted', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const notificationType = event.notification.data?.type;
  let urlToOpen = event.notification.data?.url || '/';
  
  // Handle daily nudge deep links
  if (notificationType === 'daily_nudge_first') {
    urlToOpen = '/?nudge=first';
  } else if (notificationType === 'daily_nudge_second') {
    urlToOpen = '/?nudge=second';
  }
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Check if there's already a window/tab open
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(urlToOpen);
            return client.focus();
          }
        }
        // If no window open, open a new one
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Handle service worker installation
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Handle service worker activation
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});
