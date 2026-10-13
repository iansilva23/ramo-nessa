// Compartilhado pelos dois apps. Sincronizar com prepare_web_push.mjs.
const sdkRoot = 'https://www.gstatic.com/firebasejs/13.0.0/';
const base = new URL('./', import.meta.url);
const leaseKey = 'ramo.push.owner:' + base.pathname;
const owner = crypto.randomUUID();
let generation = 0;
let active = null;
let sdkPromise;
let registration;
let messaging;
let offMessage;
let serial = Promise.resolve();

function configured() {
  const c = globalThis.ramoPushConfig;
  return c && c.appId?.includes(':web:') && c.apiKey && c.projectId &&
    /^\d+$/.test(c.messagingSenderId) && /^[A-Za-z0-9_-]{87}$/.test(c.vapidKey);
}
function status() {
  if (!configured()) return 'unconfigured';
  if (!isSecureContext || base.origin !== location.origin) return 'insecure';
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios && !matchMedia('(display-mode: standalone)').matches && !navigator.standalone) return 'install';
  if (!('Notification' in globalThis) || !('PushManager' in globalThis) ||
      !navigator.serviceWorker || !navigator.locks) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'prompt';
  return active?.registered && ownsLease() ? 'ready' : 'granted';
}
function ownsLease() {
  try { return localStorage.getItem(leaseKey) === owner; } catch { return false; }
}
function valid(context, epoch) { return active === context && generation === epoch; }
function enqueue(task) {
  const next = serial.then(() => navigator.locks.request(leaseKey, task));
  serial = next.catch(() => {});
  return next;
}
async function sdk() {
  sdkPromise ??= Promise.all([
    import(sdkRoot + 'firebase-app.js'), import(sdkRoot + 'firebase-messaging.js'),
  ]).then(([app, push]) => ({ ...app, ...push }));
  return sdkPromise;
}
async function initialize() {
  const api = await sdk();
  if (!(await api.isSupported())) throw new Error('unsupported');
  const { vapidKey: _publicKey, ...config } = globalThis.ramoPushConfig;
  const appName = 'ramo-push-' + base.pathname.replaceAll('/', '-');
  const app = api.getApps().find(item => item.name === appName) ?? api.initializeApp(config, appName);
  messaging ??= api.getMessaging(app);
  registration ??= await navigator.serviceWorker.register(new URL('ramo_push_worker.js', base), {
    scope: new URL('push-scope/', base).href,
  });
  // O escopo de push não substitui nem controla o cache/service worker Flutter.
  if (!registration.active) await new Promise((resolve, reject) => {
    const worker = registration.installing ?? registration.waiting;
    if (!worker) { reject(new Error('worker')); return; }
    const timer = setTimeout(() => reject(new Error('worker-timeout')), 15000);
    const check = () => {
      if (worker.state === 'activated') { clearTimeout(timer); resolve(); }
      else if (worker.state === 'redundant') { clearTimeout(timer); reject(new Error('worker')); }
    };
    worker.addEventListener('statechange', check);
    check();
  });
  return api;
}
async function register(context, epoch) {
  if (!valid(context, epoch) || !ownsLease() || !context.pushToken) return false;
  const preference = context.preference;
  const abort = new AbortController();
  context.abort = abort;
  const timer = setTimeout(() => abort.abort(), 10000);
  try {
    const response = await fetch(new URL('/v1/notifications/device', base), {
      method: 'PUT', credentials: 'omit', redirect: 'error', cache: 'no-store',
      signal: abort.signal,
      headers: { authorization: 'Bearer ' + context.accessToken, 'content-type': 'application/json' },
      body: JSON.stringify({ platform: 'web', provider: 'fcm', token: context.pushToken,
        notificationPreference: preference }),
    });
    if (!response.ok) return false;
    const result = await response.json();
    const ok = result.device?.enabled === true && result.device?.platform === 'web' &&
      result.device?.provider === 'fcm' && result.device?.notificationPreference === preference;
    if (valid(context, epoch)) context.registered = ok;
    return ok && valid(context, epoch);
  } finally { clearTimeout(timer); if (context.abort === abort) context.abort = null; }
}
function clearActive() {
  generation++;
  active?.abort?.abort();
  active = null;
  offMessage?.(); offMessage = null;
}
function start(args) {
  const accessToken = String(args.accessToken ?? '').trim();
  let core;
  try { core = new URL(args.baseUrl, location.href); } catch { return Promise.resolve(false); }
  if (core.origin !== base.origin || core.username || core.password || accessToken.length < 20 ||
      !['important', 'all'].includes(args.preference)) return Promise.resolve(false);
  const currentStatus = status();
  if (['unconfigured', 'insecure', 'install', 'unsupported', 'denied'].includes(currentStatus)) return Promise.resolve(false);
  // Este prompt acontece antes de qualquer await/import, no toque da tela Flutter.
  const permission = Notification.permission === 'granted'
    ? Promise.resolve('granted')
    : args.requestPermission ? Notification.requestPermission() : Promise.resolve('default');
  const previous = active;
  const epoch = ++generation;
  previous?.abort?.abort();
  const context = { accessToken, preference: args.preference, pushToken: null, registered: false, abort: null };
  active = context;
  return permission.then(grant => {
    if (grant !== 'granted' || !valid(context, epoch)) return false;
    return enqueue(async () => {
      if (!valid(context, epoch)) return false;
      const api = await initialize();
      if (!valid(context, epoch)) return false;
      const previousOwner = localStorage.getItem(leaseKey);
      const rotate = (previousOwner && previousOwner !== owner) ||
        (previous && previous.accessToken !== accessToken);
      localStorage.setItem(leaseKey, owner);
      // Troca de conta/aba: invalida a assinatura anterior antes de usar o novo Bearer.
      if (rotate) await api.deleteToken(messaging);
      if (!valid(context, epoch) || !ownsLease()) return false;
      context.pushToken = await api.getToken(messaging, {
        vapidKey: globalThis.ramoPushConfig.vapidKey, serviceWorkerRegistration: registration,
      });
      if (typeof context.pushToken !== 'string' || context.pushToken.length < 20) return false;
      const ok = await register(context, epoch);
      if (!valid(context, epoch)) return false;
      offMessage?.();
      offMessage = api.onMessage(messaging, payload => {
        if (!valid(context, epoch) || !ownsLease() || !context.registered) return;
        const data = payload.data ?? {};
        if (!data.title || !data.body) return;
        void registration.showNotification(String(data.title).slice(0, 120), {
          body: String(data.body).slice(0, 500), icon: new URL('icons/Icon-192.png', base).href,
          tag: 'ramo-' + String(data.type ?? 'notice').slice(0, 80),
          data: { ramo: true },
        }).catch(() => {});
      });
      return ok;
    });
  }).catch(() => false);
}
function setPreference(preference) {
  if (!['important', 'all'].includes(preference)) return Promise.resolve(false);
  const context = active;
  if (!context) return Promise.resolve(false);
  context.preference = preference;
  const epoch = generation;
  return enqueue(() => register(context, epoch)).catch(() => false);
}
function stop() {
  const context = active;
  const owned = ownsLease();
  clearActive();
  if (!context || !owned || !navigator.locks) return Promise.resolve();
  return enqueue(async () => {
    if (!ownsLease()) return;
    try {
      await fetch(new URL('/v1/notifications/device', base), {
        method: 'DELETE', credentials: 'omit', redirect: 'error', cache: 'no-store',
        headers: { authorization: 'Bearer ' + context.accessToken },
        signal: AbortSignal.timeout(10000),
      });
    } catch { /* O logout do Core também desativa a sessão/dispositivo. */ }
    try { if (messaging) await (await sdk()).deleteToken(messaging); } catch {}
    if (ownsLease()) localStorage.removeItem(leaseKey);
    // Remove avisos já exibidos deste worker, sem tocar no outro aplicativo.
    try { for (const item of await registration?.getNotifications() ?? []) item.close(); } catch {}
  }).catch(() => {});
}
addEventListener('storage', event => {
  if (event.key === leaseKey && event.newValue !== owner) clearActive();
});
globalThis.ramoWebPush = Object.freeze({ start, setPreference, stop, status });
