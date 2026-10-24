/* Savora Service Worker
   - CACHE_SHELL: App-Grundgerüst (HTML/CSS/JS-Module/Icons/Font). v89: cache-first. Die Schale wird bei
     der Installation vollstaendig und am HTTP-Cache vorbei geladen; danach startet die App ohne Netz-Wartezeit
     und immer aus einem zueinander passenden Satz Dateien. Neue Versionen kommen ausschliesslich ueber eine
     neue SW_VERSION: der neue Worker installiert eine frische Schale, wartet, und die Karte «Jetzt
     aktualisieren» schaltet um. Fehlt eine Datei im Cache, wird sie aus dem Netz geholt und nachgetragen.
   - CACHE_RUNTIME: alles andere — stale-while-revalidate mit Obergrenze.
   - CACHE_DATA: grosse optionale Dateien (Cover in Vollaufloesung, Naehrwertdatei, PDF-Vorschau).
     Sie gehoeren NICHT zur Installation: Fehlen oder Scheitern darf die App-Installation nie
     verhindern. Sie werden beim ersten Gebrauch geladen (danach cache-first) oder auf Wunsch
     ueber PREPARE_OFFLINE gesammelt vorbereitet.
   - Antworten werden nur gecacht, wenn sie wirklich die erwartete Datei sind (Status 200, kein
     HTML anstelle von JS/CSS/Bild). Eine Fehlerseite ersetzt nie eine funktionierende Datei.
   - Aufraeumen beim Aktivieren betrifft ausschliesslich Caches mit dem Savora-Praefix, nie
     fremde Caches desselben Origins.
   - Kontrollierter Update-Flow: kein automatisches skipWaiting. Ein neuer Worker wartet, bis
     die Seite per postMessage({type:'SKIP_WAITING'}) explizit zustimmt.
*/
const SW_VERSION = 'v118-mehrkompakt';
const CACHE_SHELL = 'savora-shell-' + SW_VERSION;
const CACHE_RUNTIME = 'savora-runtime-' + SW_VERSION;
const CACHE_DATA = 'savora-data-' + SW_VERSION;
const CACHE_PREFIX = 'savora-';   // Namensraum aller eigenen Caches (alte Versionen eingeschlossen)
// Optionale, grosse Dateien (rund 13 MB Cover in Vollaufloesung plus Naehrwertdatei, dazu die
// PDF-Vorschau-Bibliothek). Nicht Teil der Installation: cache-first nach dem ersten Abruf, oder
// gesammelt per PREPARE_OFFLINE. Die kleinen Cover-Vorschaubilder stehen in SHELL_ASSETS.
const OPTIONAL_ASSETS = [
  './assets/profilbilder/01-pasta-pose.webp',
  './assets/profilbilder/02-monsieur-croissant.webp',
  './assets/profilbilder/03-espresso.webp',
  './assets/profilbilder/04-nase-fuer-geschmack.webp',
  './assets/profilbilder/05-olivenkennerin.webp',
  './assets/profilbilder/06-haende-fuers-handwerk.webp',
  './assets/profilbilder/07-kuechenkritik.webp',
  './assets/profilbilder/08-pfeffermuehle.webp',
  './assets/profilbilder/09-das-letzte-wort.webp',
  './assets/profilbilder/10-geschmacksexplosion.webp',
  './assets/profilbilder/11-oktopus-dirigent.webp',
  './assets/profilbilder/12-pilz-punk.webp',
  './swiss-fcd-data.json',
  './vendor/pdfjs/pdf.min.js',
  './vendor/pdfjs/pdf.worker.min.js',
  './assets/covers/01-pop.png',
  './assets/covers/02-lieblingsbuch.png',
  './assets/covers/03-tomate.png',
  './assets/covers/04-salbei.png',
  './assets/covers/05-nachtkueche.png',
  './assets/covers/06-citrus.png',
  './assets/covers/07-bistro.png',
  './assets/covers/08-garten.png',
  './assets/covers/09-sonnenkueche.png',
  './assets/covers/10-ofenglueck.png',
  './assets/covers/11-pasta-band.png',
  './assets/covers/12-geschmacksschichten.png',
  './assets/covers/13-scherenschnitt-tafel.png',
  './assets/covers/14-eine-prise.png',
  './assets/covers/15-tischrunde.png',
];
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-96.png',
  './icon-32.png',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './icon-192-maskable.png',
  './icon-512-maskable.png',
  './assets/logo/savora-app-icon-180.png',
  './assets/logo/savora-app-icon-maskable.svg',
  './assets/logo/savora-app-icon.svg',
  './assets/logo/savora-favicon-16.png',
  './assets/logo/savora-favicon-32.png',
  './assets/logo/savora-favicon-dark.svg',
  './assets/logo/savora-favicon.svg',
  './assets/logo/savora-symbol-dark.svg',
  './assets/logo/savora-symbol-light.svg',
  './assets/logo/savora-symbol-mono.svg',
  './assets/logo/savora-wortmarke-dark.svg',
  './assets/logo/savora-wortmarke-light.svg',
  './public-sans.woff2',
  './lilita-one.woff2',
  './baloo2.woff2',
  './sofia-sans-extra-condensed.woff2',
  './roboto.woff2',
  './archivo.woff2',
  './styles.css',
  './styles-v2.css',
  './pdf-print.css',
  './theme-init.js',
  './csp-compat.js',
  './icons.js',
  './db.js',
  './nutrition-model.js',
  './ingredient-normalizer.js',
  './classification.js',
  './nutrition-units.js',
  './nutrition-swiss.js',
  './nutrition-aliases.js',
  './nutrition-sync.js',
  './nutrition-matcher.js',
  './nutrition-preparation.js',
  './nutrition-calculator.js',
  './images.js',
  './quantity.js',
  './cover.js',
  './cover-editor.js',
  './motion-cover.js',
  './cover-image.js',
  './cover-model.js',
  './assets/covers/thumbs/01-pop.jpg',
  './assets/covers/thumbs/02-lieblingsbuch.jpg',
  './assets/covers/thumbs/03-tomate.jpg',
  './assets/covers/thumbs/04-salbei.jpg',
  './assets/covers/thumbs/05-nachtkueche.jpg',
  './assets/covers/thumbs/06-citrus.jpg',
  './assets/covers/thumbs/07-bistro.jpg',
  './assets/covers/thumbs/08-garten.jpg',
  './assets/covers/thumbs/09-sonnenkueche.jpg',
  './assets/covers/thumbs/10-ofenglueck.jpg',
  './assets/covers/thumbs/11-pasta-band.jpg',
  './assets/covers/thumbs/12-geschmacksschichten.jpg',
  './assets/covers/thumbs/13-scherenschnitt-tafel.jpg',
  './assets/covers/thumbs/14-eine-prise.jpg',
  './assets/covers/thumbs/15-tischrunde.jpg',
  './utils.js',
  './validate.js',
  './legal.js',
  './native.js',
  './units.js',
  './shopping.js',
  './state.js',
  './recipe-model.js',
  './cookbooks.js',
  './recipe-check.js',
  './parsers.js',
  './recipe-json.js',
  './recipe-import.js',
  './ingredient-paste.js',
  './views.js',
  './views-v2.js',
  './unit-converter.js',
  './cookmode.js',
  './jspdf.umd.min.js',
  './html2canvas.min.js',
  './pdf-layout.js',
  './pdf-templates.js',
  './pdf.js',
  './pdf-ui.js',
  './pdf-preview.js',
  './pdf-model.js',
  './backup.js',
  './motion.js',
  './ui.js',
  './actions-v2.js',
  './cloud.js',
  './trash.js',
  './household.js',
  './share.js',
  './recipe-picker.js',
  './mealplan-ics.js',
  './pantry.js',
  './org.js',
  './library.js',
  './library-views.js',
  './library-publish.js',
  './recipe-origin.js',
  './settings-konto.js',
  './nutrition-ui.js',
  './app.js',
  './vendor/fonts/carlito-regular.woff2',
  './vendor/fonts/carlito-bold.woff2',
  './vendor/fonts/source-serif-4-400.woff2',
  './vendor/fonts/source-serif-4-400i.woff2',
  './vendor/fonts/source-serif-4-600.woff2',
];
const RUNTIME_MAX_ENTRIES = 60;

/* Nur eine echte, vollstaendige Antwort auf die erwartete Datei darf in einen Cache.
   Fehlerseiten (404/5xx), Teilantworten, undurchsichtige Antworten und HTML anstelle von
   JS/CSS/Bild/Schrift (z.B. ein Weiterleitungs-Fallback) werden verworfen. */
function isExpectedResponse(url, res) {
  if (!res || res.status !== 200 || res.type === 'opaque' || res.type === 'error') return false;
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  const p = url.pathname;
  const isDocument = p.endsWith('/') || p.endsWith('.html');
  if (isDocument) return ct.includes('text/html');
  return !ct.includes('text/html');
}

/* Installation: alle Shell-Dateien muessen vorhanden und gueltig sein, sonst scheitert die
   Installation als Ganzes. Die bisherige Version samt ihren Caches bleibt dann unberuehrt
   (der neue Cache hat einen eigenen, versionierten Namen) und offline weiter nutzbar. */
async function precacheShell() {
  const cache = await caches.open(CACHE_SHELL);
  try {
    await Promise.all(SHELL_ASSETS.map(async (asset) => {
      const req = new Request(asset, { cache: 'reload' });   // am HTTP-Cache vorbei: keine Mischung aus alten und neuen Dateien
      const res = await fetch(req);
      if (!isExpectedResponse(new URL(req.url), res)) throw new Error('Ungueltige Antwort fuer ' + asset + ' (' + res.status + ')');
      await cache.put(req, res);
    }));
  } catch (err) {
    await caches.delete(CACHE_SHELL);   // kein halb gefuellter Cache dieser Version
    throw err;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheShell());
});

/* Raeumt nur eigene, veraltete Caches auf: Namensraum "savora-" ausser den drei aktuellen.
   Fremde Caches desselben Origins (andere Projekte) bleiben unberuehrt. */
function isOwnStaleCache(name) {
  return name.startsWith(CACHE_PREFIX) && name !== CACHE_SHELL && name !== CACHE_RUNTIME && name !== CACHE_DATA;
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter(isOwnStaleCache).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Offline-Stand: sind ALLE benoetigten Dateien (Shell plus optionale grosse Dateien) im Cache? */
async function offlineStatus() {
  const shell = await caches.open(CACHE_SHELL);
  const data = await caches.open(CACHE_DATA);
  const missing = [];
  await Promise.all([
    ...SHELL_ASSETS.map(async (a) => { if (!(await shell.match(a))) missing.push(a); }),
    ...OPTIONAL_ASSETS.map(async (a) => { if (!(await data.match(a))) missing.push(a); }),
  ]);
  const total = SHELL_ASSETS.length + OPTIONAL_ASSETS.length;
  return { ready: missing.length === 0, total, cached: total - missing.length, missing: missing.sort() };
}

/* Explizite Offline-Vorbereitung: holt fehlende optionale Dateien (3 gleichzeitig) und meldet
   den Fortschritt. Einzelne Fehler brechen nicht ab, sie bleiben in "missing" sichtbar. */
async function prepareOffline(port) {
  const data = await caches.open(CACHE_DATA);
  const todo = [];
  for (const a of OPTIONAL_ASSETS) if (!(await data.match(a))) todo.push(a);
  let done = 0;
  const queue = todo.slice();
  const worker = async () => {
    while (queue.length) {
      const a = queue.shift();
      try {
        const res = await fetch(new Request(a, { cache: 'reload' }));
        if (isExpectedResponse(new URL(res.url || a, self.location.href), res)) await data.put(a, res);
      } catch (e) { /* bleibt fehlend, Wiederholen moeglich */ }
      done++;
      port.postMessage({ type: 'progress', done, total: todo.length });
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  port.postMessage(Object.assign({ type: 'done' }, await offlineStatus()));
}

self.addEventListener('message', (event) => {
  const d = event.data;
  if (!d) return;
  if (d.type === 'SKIP_WAITING') self.skipWaiting();
  else if (d.type === 'OFFLINE_STATUS' && event.ports[0]) event.waitUntil(offlineStatus().then((st) => event.ports[0].postMessage(Object.assign({ type: 'done' }, st))));
  else if (d.type === 'PREPARE_OFFLINE' && event.ports[0]) event.waitUntil(prepareOffline(event.ports[0]));
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

function isStaticDataRequest(url) {
  if (url.origin !== self.location.origin) return false;
  return OPTIONAL_ASSETS.some((a) => url.pathname.endsWith(a.replace('./', '')));
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Cloud-Abgleich nie aus dem Cache beantworten: sonst saehe ein Geraet veraltete Daten.
  if (url.hostname.endsWith('.supabase.co')) return;

  if (isStaticDataRequest(url)) {
    // Cache-first nach dem ersten Abruf; nur gueltige Antworten werden gespeichert.
    event.respondWith(
      caches.open(CACHE_DATA).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const res = await fetch(event.request);
        if (isExpectedResponse(url, res)) cache.put(event.request, res.clone());
        return res;
      })
    );
    return;
  }

  if (event.request.mode === 'navigate' || isShellRequest(url)) {
    // v89 cache-first. Nur in den eigenen Shell-Cache lesen/schreiben (nie in fremde Caches schauen).
    // Navigation: Startadressen mit Parametern (?rezept=, ?profil=, ?aktion=, Teilen) bekommen dieselbe App-Seite.
    const isNav = event.request.mode === 'navigate';
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_SHELL);
      const cached = await cache.match(event.request, isNav && isShellRequest(url) ? { ignoreSearch: true } : undefined);
      if (cached) return cached;
      try {
        const res = await fetch(event.request);
        // Nur eine echte Shell-Datei nachtragen (keine fremde Seite wie p.html, keine Fehlerseite)
        if (isShellRequest(url) && !url.search && isExpectedResponse(url, res)) await cache.put(event.request, res.clone());
        return res;
      } catch (err) {
        if (isNav) { const page = await cache.match('./index.html'); if (page) return page; }
        return Response.error();
      }
    })());
    return;
  }

  event.respondWith(
    caches.open(CACHE_RUNTIME).then(async (cache) => {
      const cached = await cache.match(event.request);
      const networkPromise = fetch(event.request)
        .then((res) => {
          if (res && res.status === 200 && res.type !== 'opaque') {
            cache.put(event.request, res.clone());
            trimRuntimeCache();
          }
          return res;
        })
        .catch(() => cached || Response.error());
      return cached || networkPromise;
    })
  );
});
