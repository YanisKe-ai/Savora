/* ---------- Init ---------- */
function renderStorageError(err) {
  const splash = document.getElementById('splash');
  if (splash) splash.remove();
  App.innerHTML = `
    <div class="topbar"><div class="topbar-left"><div class="brand"><img src="logo-mark.png" alt="Savora" class="brand-logo"><span class="brand-name">Savora</span></div></div></div>
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
  const el = document.createElement('div');
  el.id = 'updateBanner';
  el.className = 'toast toast-undo';
  el.innerHTML = `<span>Neue Version verfügbar</span><button type="button" class="toast-undo-btn">Aktualisieren</button>`;
  document.body.appendChild(el);
  el.querySelector('.toast-undo-btn').addEventListener('click', () => {
    if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  });
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
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
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
      setTimeout(() => splash.remove(), 1150);
    }, 900);
    return;
  }
  // Wiederholter Start: Daten sind schon da, also nur eine kurze, spuerbare aber nicht
  // kuenstlich verlaengerte Uebergangsanimation (Punkt 11: 300-600ms Zielkorridor).
  splash.classList.add('hide-fast');
  setTimeout(() => splash.remove(), 350);
}

(async function init() {
  try {
    await loadRecipes();
    await loadShopping();
    await loadMealplan();
    render();
    if ('serviceWorker' in navigator) {
      registerServiceWorkerWithUpdatePrompt();
    }
    runSplashSequence();
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
