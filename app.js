/* ---------- Init ---------- */
function renderStorageError(err) {
  const splash = document.getElementById('splash');
  if (splash) splash.remove();
  App.innerHTML = `
    <div class="topbar"><div class="topbar-left"><div class="brand-v2">${wordmarkSvg('top-wordmark', 'Savora')}</div></div></div>
    <main style="display:flex;align-items:center;justify-content:center;min-height:70vh;">
      <div class="empty-state" style="max-width:340px;">
        ${ICONS.trash}
        <h2>Speicher konnte nicht geöffnet werden</h2>
        <p>${escapeHtml(err && err.message ? err.message : 'Unbekannter Speicherfehler.')} Savora konnte den lokalen Speicher gerade nicht öffnen. Deine Daten werden dadurch nicht automatisch gelöscht. Schliesse andere Tabs oder prüfe den Speicherplatz und versuche es erneut.</p>
        <button class="primary-btn" data-action="retry-init">${ICONS.swap} Erneut versuchen</button>
      </div>
    </main>
  `;
  document.querySelectorAll('[data-action="retry-init"]').forEach(el => el.addEventListener('click', () => location.reload()));
}

/* ---------- Kontrollierter Service-Worker-Update-Flow ---------- */
function showUpdateBanner(registration) {
  const existing = document.getElementById('updateBanner');
  if (existing) existing.remove();
  /* v85: gut sichtbare Karte über der Navigation statt kleinem Toast. Eigene Klasse (nicht .toast), damit
     ein Rückgängig-Hinweis sie nicht verdrängt. Id und .toast-undo-btn bleiben (Tests, bestehende Abläufe). */
  const el = document.createElement('section');
  el.id = 'updateBanner';
  el.className = 'update-card';
  el.setAttribute('aria-labelledby', 'updateCardTitle');
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-describedby', 'updateCardText');
  el.innerHTML = `
    <div class="update-card-glow" aria-hidden="true"></div>
    <div class="update-card-icon" aria-hidden="true">${typeof ICONS !== 'undefined' && ICONS.sparkle ? ICONS.sparkle : ''}</div>
    <div class="update-card-body">
      <p class="update-card-kicker"><span class="update-card-dot" aria-hidden="true"></span><span id="updateCardVersion">Update bereit</span></p>
      <h2 class="update-card-title" id="updateCardTitle">Neue Version von Savora</h2>
      <p class="update-card-text" id="updateCardText">Tippe auf «Jetzt aktualisieren». Deine Rezepte, Pläne und Kochbücher bleiben erhalten.</p>
    </div>
    <div class="update-card-actions">
      <button type="button" class="update-card-later">Später</button>
      <button type="button" class="toast-undo-btn update-card-btn">Jetzt aktualisieren</button>
    </div>`;
  document.body.appendChild(el);
  // Neue Versionsnummer anzeigen, wenn erreichbar (ohne Cache); sonst bleibt «Update bereit»
  fetch('VERSION?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.text() : '').then(v => {
    v = String(v || '').trim();
    const slot = document.getElementById('updateCardVersion');
    if (slot && /^\d+\.\d+\.\d+$/.test(v)) slot.textContent = `Version ${v} ist da`;
  }).catch(() => {});
  const btn = el.querySelector('.update-card-btn');
  btn.addEventListener('click', () => {
    // Wartet kein neuer Worker (mehr), einfach neu laden statt einen gesperrten Knopf zu hinterlassen
    if (!registration.waiting) { location.reload(); return; }
    btn.disabled = true; btn.setAttribute('aria-busy', 'true'); btn.textContent = 'Wird aktualisiert …';
    el.classList.add('is-updating');
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  });
  // «Später»: Karte für diese Sitzung schliessen; beim nächsten Start erscheint sie wieder
  el.querySelector('.update-card-later').addEventListener('click', () => {
    el.remove();
    if (typeof showToast === 'function') showToast('Das Update wird beim nächsten Öffnen von Savora angeboten.', 'info');
  });
  if (typeof announceLive === 'function') announceLive('Neue Version von Savora bereit. Jetzt aktualisieren oder später.', false);
}

function registerServiceWorkerWithUpdatePrompt() {
  navigator.serviceWorker.register('sw.js').then((registration) => {
    // Falls beim Laden bereits ein Worker wartet (z.B. Tab war offen, waehrend ein
    // Update installiert wurde).
    if (registration.waiting && navigator.serviceWorker.controller) showUpdateBanner(registration);

    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        // "installed" + bereits ein aktiver Controller vorhanden = echtes Update,
        // nicht die allererste Installation (dafuer gaebe es noch keinen Controller).
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateBanner(registration);
        }
      });
    });
  }).catch(() => {});

  let reloaded = false;
  // Nur bei einem echten Update neu laden. Beim allerersten Besuch uebernimmt der Service Worker
  // die Seite ebenfalls (controllerchange), ein Neuladen wuerde dann mitten in die erste Nutzung
  // (z.B. eine Anmeldung) fahren.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    if (reloaded) return;
    reloaded = true;
    reloadWhenSafe();
  });
}

/* Neue Version kontrolliert uebernehmen: Steckt der Nutzer gerade im Rezept-Editor mit
   ungespeicherten Aenderungen, wird zuerst der Entwurf gesichert und erst neu geladen, wenn der
   Editor verlassen oder gespeichert wurde. Der Entwurf geht in keinem Fall verloren. */
function updateHasUnsavedWork() {
  return state.view === 'form' && typeof isFormDirty === 'function' && !!document.getElementById('f-title') && isFormDirty();
}
function reloadWhenSafe() {
  if (!updateHasUnsavedWork()) { location.reload(); return; }
  try {
    const r = collectFormData();
    saveRecipeDraft(r, !state.recipes.some((x) => x.id === r.id));
  } catch (e) { /* Entwurf wird ohnehin laufend gesichert */ }
  if (typeof showToast === 'function') showToast('Neue Version bereit. Sie wird aktiv, sobald du das Rezept speicherst oder verlässt.', 'info');
  const timer = setInterval(() => {
    if (updateHasUnsavedWork()) return;
    clearInterval(timer);
    location.reload();
  }, 1500);
}

/* ---------- Offline-Verfuegbarkeit ----------
   Die App-Dateien sind nach der Installation sofort offline da. Grosse optionale Dateien (Cover in
   Vollaufloesung, Naehrwertdaten, PDF-Vorschau) kommen beim ersten Gebrauch oder gesammelt ueber
   "Fuer offline vorbereiten". "Offline verfuegbar" erscheint erst, wenn der Service Worker alle
   benoetigten Dateien im Cache bestaetigt hat. */
const offlineState = { phase: 'unknown', done: 0, total: 0, cached: 0, all: 0 };   // unknown | checking | ready | partial | preparing | error | unsupported

function offlineWorker() {
  return (navigator.serviceWorker && navigator.serviceWorker.controller) || null;
}
function offlineAsk(type, onMsg) {
  return new Promise((resolve, reject) => {
    const w = offlineWorker();
    if (!w) { reject(new Error('no-controller')); return; }
    const ch = new MessageChannel();
    const timer = setTimeout(() => reject(new Error('timeout')), 120000);
    ch.port1.onmessage = (e) => {
      const d = e.data || {};
      if (d.type === 'progress') { if (onMsg) onMsg(d); return; }
      clearTimeout(timer); resolve(d);
    };
    w.postMessage({ type }, [ch.port2]);
  });
}
function offlineApply(d) {
  offlineState.all = d.total || 0; offlineState.cached = d.cached || 0;
  offlineState.phase = d.ready ? 'ready' : 'partial';
}
async function offlineCheck() {
  if (!('serviceWorker' in navigator) || SavoraNative.isNative) { offlineState.phase = 'unsupported'; offlineRefreshUi(); return; }
  offlineState.phase = 'checking'; offlineRefreshUi();
  try { offlineApply(await offlineAsk('OFFLINE_STATUS')); }
  catch (e) { offlineState.phase = 'unknown'; }
  offlineRefreshUi();
}
async function offlinePrepare() {
  if (offlineState.phase === 'preparing') return;
  offlineState.phase = 'preparing'; offlineState.done = 0; offlineState.total = 0; offlineRefreshUi();
  try {
    const d = await offlineAsk('PREPARE_OFFLINE', (p) => { offlineState.done = p.done; offlineState.total = p.total; offlineRefreshUi(); });
    offlineApply(d);
  } catch (e) { offlineState.phase = 'error'; }
  offlineRefreshUi();
}
function offlineStatusText() {
  switch (offlineState.phase) {
    case 'ready': return 'Für offline verfügbar: App, Cover und Nährwertdaten sind auf diesem Gerät gespeichert.';
    case 'partial': return 'Teilweise offline verfügbar: Die App läuft ohne Internet. Cover in voller Auflösung, Nährwertdaten und PDF-Export laden beim ersten Gebrauch oder über „Für offline vorbereiten“.';
    case 'preparing': return `Wird vorbereitet${offlineState.total ? ` (${offlineState.done} von ${offlineState.total})` : ''} …`;
    case 'checking': return 'Wird geprüft …';
    case 'error': return 'Die Vorbereitung hat nicht geklappt. Prüfe deine Verbindung und versuche es erneut.';
    case 'unsupported': return 'Auf diesem Gerät ist die Offline-Vorbereitung nicht nötig oder nicht möglich.';
    default: return 'Der Stand wird nach dem ersten vollständigen Start angezeigt.';
  }
}
function offlineSectionHtml() {
  if (offlineState.phase === 'unknown') setTimeout(offlineCheck, 0);
  const busy = offlineState.phase === 'preparing' || offlineState.phase === 'checking';
  const canPrepare = offlineState.phase === 'partial' || offlineState.phase === 'error';
  return `<div class="settings-group">
      <div class="settings-group-title">Offline verfügbar</div>
      <div class="settings-group-card settings-group-card--padded">
        <p class="settings-hint settings-hint--none" id="offlineStatusText" role="status">${escapeHtml(offlineStatusText())}</p>
        <button class="ghost-btn" id="offlinePrepareBtn" data-action="offline-prepare" ${canPrepare ? '' : 'style="display:none"'} ${busy ? 'disabled' : ''}>Für offline vorbereiten</button>
      </div>
    </div>`;
}
function offlineRefreshUi() {
  const t = document.getElementById('offlineStatusText');
  if (t) t.textContent = offlineStatusText();
  const b = document.getElementById('offlinePrepareBtn');
  if (b) { b.style.display = (offlineState.phase === 'partial' || offlineState.phase === 'error' || offlineState.phase === 'preparing') ? '' : 'none'; b.disabled = offlineState.phase === 'preparing'; }
}

/* ---------- Splash-Übergang: Logo löst sich langsam auf ----------
   Punkt 11 (Reparatur-Auftrag): vorher lief IMMER die volle ~2s-Sequenz, obwohl die App-Daten
   (loadRecipes/loadShopping/loadMealplan) zu diesem Zeitpunkt schon fertig geladen sind — reine
   kuenstliche Verzoegerung. Beim allerersten Start bleibt die volle Markensequenz (einmaliger
   guter erster Eindruck), ab dem zweiten Start ist es nur noch ein kurzer, echter Uebergang.
   Reduced Motion bekommt ueberhaupt keine Wartezeit, nur ein sofortiges Ausblenden. */
const SPLASH_SEEN_KEY = 'savora-splash-seen';
function runSplashSequence() {
  const splash = document.getElementById('splash');
  const wordEl = document.querySelector('.splash-word');
  if (!splash) return;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const firstLaunch = !localStorage.getItem(SPLASH_SEEN_KEY);
  try { localStorage.setItem(SPLASH_SEEN_KEY, '1'); } catch (e) { /* Privates Fenster o.ae. — dann eben jedes Mal firstLaunch */ }

  if (reduceMotion) {
    splash.remove();
    return;
  }
  if (firstLaunch) {
    requestAnimationFrame(() => { if (wordEl) wordEl.classList.add('show'); });
    setTimeout(() => {
      splash.classList.add('hide');
      setTimeout(() => splash.remove(), 480);
    }, 380);
    return;
  }
  // Wiederholter Start: Daten sind schon da, also nur eine kurze, spuerbare aber nicht
  // kuenstlich verlaengerte Uebergangsanimation (Punkt 11: 300-600ms Zielkorridor).
  splash.classList.add('hide-fast');
  setTimeout(() => splash.remove(), 350);
}

/* ---------- Mobile Keyboard / Visual Viewport (Punkt 9, Interaction-Stability-Auftrag) ----------
   Fixed positionierte Elemente (Bottom-Nav, FAB, PDF-Preview-Actions) bleiben auf iOS/Android
   beim Oeffnen der Bildschirmtastatur oft am Layout-Viewport haengen, statt sich an der
   sichtbaren Flaeche auszurichten — dadurch koennen sie ein gerade fokussiertes Eingabefeld
   verdecken. CSS allein (dvh) loest das fuer FIXED Elemente nicht zuverlaessig, deshalb hier
   gezielt die VisualViewport-API: waehrend die Tastatur sichtbar ist, werden Bottom-Nav/FAB/
   PDF-Preview-Actions ausgeblendet, statt zu riskieren, dass sie ein Eingabefeld ueberdecken.
   Schwellenwert 150px, um ein normales Ein-/Ausblenden der Adressleiste beim Scrollen nicht
   faelschlich als Tastatur zu werten (das aendert die Hoehe meist nur um 40-60px). */
function setupVisualViewportKeyboardHandling() {
  if (!window.visualViewport) return;
  const vv = window.visualViewport;
  let keyboardOpen = false;
  const check = () => {
    const shrink = window.innerHeight - vv.height;
    const isOpen = shrink > 150;
    if (isOpen !== keyboardOpen) {
      keyboardOpen = isOpen;
      document.body.classList.toggle('keyboard-open', isOpen);
    }
  };
  vv.addEventListener('resize', check);
  check();
}
// Ergaenzt die Sichtbarkeits-Steuerung: ein fokussiertes Eingabefeld in einem scrollbaren
// Container (z.B. langes Formular, Modal) wird nach dem Aufklappen der Tastatur aktiv sichtbar
// gehalten, statt sich auf das oft unzuverlaessige automatische Verhalten mobiler Browser zu
// verlassen.
document.addEventListener('focusin', (e) => {
  const el = e.target;
  if (window.__restoringFocus) return;   // Fokus nach render() wiederhergestellt: nicht scrollen
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
    setTimeout(() => {
      if (!el.isConnected) return;
      const r = el.getBoundingClientRect(), vh = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
      if (r.top >= 56 && r.bottom <= vh - 8) return;   // schon sichtbar: kein Scrollsprung
      el.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }, 300);
  }
});

// Breitenwechsel (z.B. iPad drehen): die Rezeptseite ordnet die Zutaten neu an
if (window.matchMedia) matchMedia('(min-width: 900px)').addEventListener('change', () => { if (state.view === 'detail') render(); });   // Breitenwechsel (z.B. iPad drehen): die Rezeptseite ordnet die Zutaten neu an
// Handy-Startseite (unter 768 px) und Tablet-Startseite sind zwei Anordnungen: beim Ueberschreiten der Grenze neu zeichnen
if (window.matchMedia) matchMedia(PHONE_QUERY).addEventListener('change', () => { if (state.view === 'home') render(); });

/* Speicher als "dauerhaft" anfragen: Browser und iOS raeumen ihn dann nicht bei knappem Speicherplatz.
   Kein Dialog, die Antwort ist nur ein Hinweis (der Browser darf ablehnen). */
if (navigator.storage && typeof navigator.storage.persist === 'function') {
  navigator.storage.persist().then((granted) => { state.storagePersisted = !!granted; }).catch(() => {});
}

(async function init() {
  try {
    setupVisualViewportKeyboardHandling();
    await loadRecipes();
    await loadShopping();
    await loadMealplan();
    // Oeffentlicher Link (?rezept= / ?profil=): Ansicht direkt oeffnen, darunter «Entdecken» als Rueckweg in der App
    const libStart = typeof libHandleStartLink === 'function' && libHandleStartLink();
    if (libStart) {
      const target = state.view;
      state.recipesTab = 'discover';
      history.replaceState({ view: 'discover', recipesTab: 'discover' }, '', libUrlFor('discover'));
      history.pushState(navHistorySnapshot(), '', libUrlFor(target));
      lastRenderedView = null;
    }
    render(libStart);
    if (typeof libStartup === 'function') libStartup();
    if ('serviceWorker' in navigator && !SavoraNative.isNative) {
      registerServiceWorkerWithUpdatePrompt();
    }
    runSplashSequence();
    if (typeof cloudStartup === 'function') cloudStartup();
    if (typeof shareStartup === 'function') shareStartup();
    // Schweizer Naehrwertdatenbank im Hintergrund einspielen (einmalig, danach nur
    // noch aus IndexedDB) — blockiert bewusst nicht den ersten Render.
    ensureSwissDataSeeded().catch((err) => {
      console.warn('Nutrition: Schweizer Datenbank konnte nicht geladen werden.', err);
    });
  } catch (err) {
    console.error('Savora Initialisierungsfehler:', err);
    renderStorageError(err);
  }
})();
