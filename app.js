/* ---------- Init ---------- */
function renderStorageError(err) {
  const splash = document.getElementById('splash');
  if (splash) splash.remove();
  App.innerHTML = `
    <div class="topbar"><div class="topbar-left"><div class="brand"><img src="icon-96.png" alt="Savora" class="brand-logo"><span class="brand-name">Savora</span></div></div></div>
    <main style="display:flex;align-items:center;justify-content:center;min-height:70vh;">
      <div class="empty-state" style="max-width:340px;">
        ${ICONS.trash}
        <h2>Speicher konnte nicht geöffnet werden</h2>
        <p>${escapeHtml(err && err.message ? err.message : 'Unbekannter Speicherfehler.')} Das passiert z.B. im privaten Browserfenster oder wenn der Gerätespeicher knapp ist. Deine bereits gespeicherten Rezepte sind davon nicht betroffen.</p>
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

/* ---------- Splash-Übergang: Logo löst sich langsam auf ---------- */
function runSplashSequence() {
  const splash = document.getElementById('splash');
  const wordEl = document.querySelector('.splash-word');
  if (!splash) return;
  requestAnimationFrame(() => { if (wordEl) wordEl.classList.add('show'); });
  setTimeout(() => {
    splash.classList.add('hide');
    setTimeout(() => splash.remove(), 1150);
  }, 900);
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
  } catch (err) {
    console.error('Savora Initialisierungsfehler:', err);
    renderStorageError(err);
  }
})();
