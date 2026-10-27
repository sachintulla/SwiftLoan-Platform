/*
 * PLACEHOLDER — replace with the service worker Upshot provides (Upshot console > Push Settings > Web; the SDK
 * registers it as "./upshot-service-worker.js"). This minimal version only shows a notification and opens its link,
 * so it does NOT report delivery / click events to Upshot. It is not loaded unless NEXT_PUBLIC_UPSHOT_WEB_PUSH=true.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { body: event.data && event.data.text() }; }
  const n = d.notification || d;
  event.waitUntil(
    self.registration.showNotification(n.title || 'SwiftLoan', {
      body: n.body || n.message || '',
      icon: n.icon || '/icon.png',
      data: { url: n.url || n.deeplink || (d.data && d.data.url) || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(self.clients.openWindow(url));
});
