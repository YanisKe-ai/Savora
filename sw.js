/* Savora Service Worker
   - CACHE_SHELL: App-Grundgerüst (HTML/Manifest/Icons) — network-first, damit online
     immer die neueste Version geladen wird, offline greift der Cache als Fallback.
   - CACHE_RUNTIME: alles andere (z.B. Google Fonts) — stale-while-revalidate mit
     Obergrenze, damit der Cache nicht unbegrenzt wächst.
   - Kontrollierter Update-Flow: kein automatisches skipWaiting mehr. Ein neuer Worker
     wartet, bis die Seite per postMessage({type:'SKIP_WAITING'}) explizit zustimmt
     (siehe index.html: zeigt dafür einen "Neue Version verfügbar"-Hinweis an).
*/
const SW_VERSION = 'v1'; // nur noch fuer den Cache-NAMEN relevant, nicht mehr fuer Update-Erkennung
const CACHE_SHELL = 'savora-shell-' + SW_VERSION;
const CACHE_RUNTIME = 'savora-runtime-' + SW_VERSION;
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-96.png',
  './icon-192.png',
  './icon-512.png',
  './fonts/baloo2.woff2',
];
const RUNTIME_MAX_ENTRIES = 60;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_SHELL).then((cache) => cache.addAll(SHELL_ASSETS)));
  // Bewusst KEIN self.skipWaiting() hier — siehe Kommentar oben.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_SHELL && k !== CACHE_RUNTIME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

async function trimRuntimeCache() {
  const cache = await caches.open(CACHE_RUNTIME);
  const keys = await cache.keys();
  const excess = keys.length - RUNTIME_MAX_ENTRIES;
  for (let i = 0; i < excess; i++) await cache.delete(keys[i]);
}

function isShellRequest(url) {
  if (url.origin !== self.location.origin) return false;
  return SHELL_ASSETS.some((a) => {
    const clean = a.replace('./', '');
    return clean === '' ? (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html')) : url.pathname.endsWith(clean);
  });
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  if (event.request.mode === 'navigate' || isShellRequest(url)) {
    // App-Shell: network-first — online immer frisch, offline Cache-Fallback.
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_SHELL).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Alles andere (z.B. Google Fonts): stale-while-revalidate mit Groessenbegrenzung.
  event.respondWith(
    caches.open(CACHE_RUNTIME).then(async (cache) => {
      const cached = await cache.match(event.request);
      const networkPromise = fetch(event.request)
        .then((res) => {
          cache.put(event.request, res.clone());
          trimRuntimeCache();
          return res;
        })
        .catch(() => cached);
      return cached || networkPromise;
    })
  );
});
