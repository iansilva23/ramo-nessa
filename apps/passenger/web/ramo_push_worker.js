// Worker de push isolado por aplicativo. Nunca recebe credenciais do Core.
const appBase = new URL('./', self.location.href);
self.addEventListener('notificationclick', event => {
  event.stopImmediatePropagation();
  event.notification.close();
  // Ignorar URLs/ações do payload; abrir o app, que revalida sessão e oferta.
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => client.url.startsWith(appBase.href));
    if (existing) return existing.focus();
    return self.clients.openWindow(appBase.href);
  })());
});
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
importScripts(new URL('ramo_push_config.js', appBase).href);
if (self.ramoPushConfig) {
  importScripts('https://www.gstatic.com/firebasejs/13.0.0/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/13.0.0/firebase-messaging-compat.js');
  const { vapidKey: _publicKey, ...config } = self.ramoPushConfig;
  firebase.initializeApp(config);
  firebase.messaging().onBackgroundMessage(payload => {
    // O Core usa data-only; notification é exibida automaticamente pelo SDK.
    if (payload.notification) return;
    const data = payload.data ?? {};
    if (!data.title || !data.body) return;
    return self.registration.showNotification(String(data.title).slice(0, 120), {
      body: String(data.body).slice(0, 500),
      icon: new URL('icons/Icon-192.png', appBase).href,
      tag: 'ramo-' + String(data.type ?? 'notice').slice(0, 80),
      data: { ramo: true },
    });
  });
}
