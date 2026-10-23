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

/* ---------- v89: Startadressen aus dem App-Symbol (Verknuepfungen) und «Teilen an Savora» ----------
   manifest.json: shortcuts ?aktion=einkauf|wochenplan|neu, share_target (GET) ?share_title=&share_text=&share_url=.
   Es wird nichts aus dem Netz geladen: geteilter Text und Link landen im Textimport, der Link als Quelle.
   Die Parameter werden vor dem ersten Zeichnen aus der Adresse entfernt (Neuladen wiederholt die Aktion nicht). */
const APP_START_PARAMS = ['aktion', 'share_title', 'share_text', 'share_url'];
function appReadStartParams() {
  let u;
  try { u = new URL(location.href); } catch (e) { return null; }
  const get = (k) => String(u.searchParams.get(k) || '').trim();
  const action = get('aktion').toLowerCase();
  const share = { title: get('share_title'), text: get('share_text'), url: get('share_url') };
  if (!action && !share.title && !share.text && !share.url) return null;
  APP_START_PARAMS.forEach((k) => u.searchParams.delete(k));
  const s = u.searchParams.toString();
  try { history.replaceState(history.state, '', u.pathname + (s ? '?' + s : '') + u.hash); } catch (e) { /* Adresse bleibt */ }
  if (share.title || share.text || share.url) return { kind: 'share', share };
  if (action === 'einkauf' || action === 'wochenplan' || action === 'neu') return { kind: action };
  return null;
}
/* Nur http(s)-Links gelten als Quelle; fehlt ein eigener Link, wird der erste Link im Text genommen */
function appShareSourceUrl(share) {
  const ok = (v) => { try { const x = new URL(v); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : ''; } catch (e) { return ''; } };
  if (share.url && ok(share.url)) return ok(share.url);
  const m = String(share.text || '').match(/https?:\/\/[^\s<>"']+/i);
  return m ? ok(m[0]) : '';
}
function appShareText(share, url) {
  const parts = [];
  if (share.title && !String(share.text || '').includes(share.title)) parts.push(share.title);
  if (share.text) parts.push(share.text);
  let text = parts.join('\n\n');
  if (url && !text.includes(url)) text = text ? text + '\n\nQuelle: ' + url : 'Quelle: ' + url;
  return text;
}
function appOpenShared(share) {
  const url = appShareSourceUrl(share);
  // Bevorzugt die Funktion des Textimports (ui.js), sonst der bestehende Import-Bildschirm mit vorbefuelltem Feld
  if (typeof openTextImport === 'function') { openTextImport({ text: [share.title, share.text].filter(Boolean).join('\n\n'), url, title: share.title || '' }); return; }
  if (typeof dispatchAction !== 'function') return;
  dispatchAction('open-paste-import', null, null, null);
  const text = appShareText(share, url);
  let tries = 0;
  const fill = () => {
    const ta = document.getElementById('pasteText');
    if (!ta) { if (++tries < 40) setTimeout(fill, 50); return; }
    if (!ta.value) { ta.value = text; ta.dispatchEvent(new Event('input', { bubbles: true })); }
    if (typeof showToast === 'function') showToast('Geteilter Text eingefügt. Prüfe ihn und tippe auf «Rezept-Entwurf erstellen».', 'info');
  };
  fill();
}
/* Vor dem ersten Zeichnen: Ansicht fuer Verknuepfungen setzen. Gibt die Nacharbeit nach render() zurueck. */
function appApplyStart(start) {
  if (!start) return null;
  if (start.kind === 'einkauf') { state.view = 'shopping'; return null; }
  if (start.kind === 'wochenplan') { state.view = 'mealplan'; return null; }
  return () => {
    if (start.kind === 'neu' && typeof dispatchAction === 'function') dispatchAction('new-recipe', null, null, null);
    else if (start.kind === 'share') appOpenShared(start.share);
  };
}

/* Schweizer Naehrwertdatei (rund 130 KB) erst nach dem ersten Bild laden: sie konkurriert sonst beim Kaltstart mit
   den App-Dateien. Jede Abfrage wartet ohnehin selbst auf ensureSwissDataSeeded() (gemeinsames Versprechen). */
function appSeedSwissLater() {
  const run = () => ensureSwissDataSeeded().catch((err) => {
    console.warn('Nutrition: Schweizer Datenbank konnte nicht geladen werden.', err);
  });
  // 2 s nach dem Laden, dann im Leerlauf: der erste Bildschirm (inkl. grösstem Element) steht dann sicher
  const idle = () => setTimeout(() => (typeof requestIdleCallback === 'function' ? requestIdleCallback(run, { timeout: 2500 }) : run()), 2000);
  if (document.readyState === 'complete') idle(); else window.addEventListener('load', idle, { once: true });
}

(async function init() {
  try {
    setupVisualViewportKeyboardHandling();
    // v89: die drei Speicherbereiche unabhaengig voneinander und gleichzeitig lesen
    await Promise.all([loadRecipes(), loadShopping(), loadMealplan()]);
    // Oeffentlicher Link (?rezept= / ?profil=): Ansicht direkt oeffnen, darunter «Entdecken» als Rueckweg in der App
    const libStart = typeof libHandleStartLink === 'function' && libHandleStartLink();
    if (libStart) {
      const target = state.view;
      state.recipesTab = 'discover';
      history.replaceState({ view: 'discover', recipesTab: 'discover' }, '', libUrlFor('discover'));
      history.pushState(navHistorySnapshot(), '', libUrlFor(target));
      lastRenderedView = null;
    }
    // v89: Verknuepfung/Teilen hat Vorrang vor der letzten Stelle; ein oeffentlicher Link vor beidem
    const startParams = appReadStartParams();
    const afterStart = libStart ? null : appApplyStart(startParams);
    const restored = (libStart || startParams || typeof navRestoreLastView !== 'function') ? null : navRestoreLastView();
    // Darunter liegt ein sauberer Rueckweg (Startseite bzw. Kochbuecher); render() legt die Ansicht darauf
    if (restored) { try { history.replaceState({ view: restored.view === 'cookbook' ? 'cookbooks' : 'home', modalType: null, activeRecipeId: null }, ''); } catch (e) { /* ohne Rueckweg */ } }
    render(libStart);
    if (afterStart) afterStart();
    if (restored && restored.cookRecipeId && typeof dispatchAction === 'function') {
      // Kochmodus ueber die bestehende Aktion: setzt den gespeicherten Schritt, Timer und abgehakte Zutaten fort
      const el = document.createElement('button'); el.dataset.id = restored.cookRecipeId;
      dispatchAction('start-cook', restored.cookRecipeId, el, null);
    }
    if (typeof libStartup === 'function') libStartup();
    if ('serviceWorker' in navigator && !SavoraNative.isNative) {
      registerServiceWorkerWithUpdatePrompt();
    }
    runSplashSequence();
    if (typeof cloudStartup === 'function') cloudStartup();
    if (typeof shareStartup === 'function') shareStartup();
    // Schweizer Naehrwertdatenbank im Hintergrund einspielen (einmalig, danach nur
    // noch aus IndexedDB): v89 erst nach dem Laden der Seite, im Leerlauf.
    appSeedSwissLater();
  } catch (err) {
    console.error('Savora Initialisierungsfehler:', err);
    renderStorageError(err);
  }
})();
