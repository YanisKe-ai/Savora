/* ---------- Zuletzt geloescht (v0.90) ----------
   Ein geloeschtes Rezept liegt 30 Tage im Store recipeTrash (samt Bild) und kann zurueckgeholt werden.
   Die Cloud-Logik (Grabstein mit Papierkorb-Daten, endgueltiges Loeschen, Bild-Schutz) steckt in cloud.js:
   recipeTrashOnDelete, recipeTrashRestoreCore, recipeTrashFinalDelete. Diese Datei ist Oberflaeche und Aufraeumen. */
const TRASH_DAYS = 30;
const TRASH_MS = TRASH_DAYS * 86400000;
const trashState = { items: [], loaded: false, sig: '', checkedAt: 0 };

function trashSorted(list) { return list.slice().sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0)); }
async function trashLoad() {
  if (typeof dbGetAllRecipeTrash !== 'function') { trashState.loaded = true; return trashState.items; }
  const all = (await dbGetAllRecipeTrash()).filter(t => t && t.id && t.recipe);
  trashState.items = trashSorted(all);
  trashState.loaded = true;
  return trashState.items;
}
function trashCount() { return trashState.items.length; }
function trashRerender() {
  if (typeof render !== 'function') return;
  if (state.view === 'trash' || state.view === 'more') render();
}

/* Eintrag anlegen (ohne das Rezept zu loeschen). Normalerweise ruft ui.js recipeTrashOnDelete auf, das beides tut. */
async function trashPut(recipe) {
  if (!recipe || !recipe.id) return null;
  const entry = { id: recipe.id, recipe: JSON.parse(JSON.stringify(recipe)), deletedAt: Date.now(), imageId: recipe.imageId || null };
  await dbPutRecipeTrash(entry);
  await trashLoad();
  return entry;
}

async function trashRestore(id) {
  const recipe = await recipeTrashRestoreCore(id);
  if (!recipe) return null;
  if (!state.recipes.some(x => x.id === recipe.id)) state.recipes.push(recipe);
  state.recipes.sort((a, b) => b.updatedAt - a.updatedAt);
  await trashLoad();
  return recipe;
}

async function trashDeleteForever(id) {
  const ok = await recipeTrashFinalDelete(id);
  await trashLoad();
  return ok;
}

/* Beim Start: Eintraege aelter als 30 Tage endgueltig loeschen (Grabstein ohne Daten, Bild weg, wenn ungenutzt). */
async function trashPurge(now) {
  const t = now || Date.now();
  const items = await trashLoad();
  let n = 0;
  for (const it of items) {
    if ((it.deletedAt || 0) + TRASH_MS <= t) {
      try { if (await recipeTrashFinalDelete(it.id)) n++; } catch (e) { /* naechster Start versucht es wieder */ }
    }
  }
  if (n) await trashLoad();
  return n;
}

function trashDaysLeft(it, now) {
  return Math.max(0, Math.ceil(((it.deletedAt || 0) + TRASH_MS - (now || Date.now())) / 86400000));
}
function trashLeftText(it, now) {
  const d = trashDaysLeft(it, now);
  return d <= 0 ? 'läuft heute ab' : d === 1 ? 'noch 1 Tag' : `noch ${d} Tage`;
}

function trashRowHtml(it) {
  const r = it.recipe || {};
  const title = escapeHtml(r.title || 'Ohne Titel');
  return `<li class="trash-item">
    <div class="trash-info">
      <p class="trash-title">${title}</p>
      <p class="trash-meta">${escapeHtml(trashLeftText(it))}</p>
    </div>
    <div class="trash-actions">
      <button type="button" class="outline-btn trash-restore" data-action="trash-restore" data-id="${escapeAttr(it.id)}" aria-label="${title} wiederherstellen">Wiederherstellen</button>
      <button type="button" class="text-btn trash-forever" data-action="trash-forever" data-id="${escapeAttr(it.id)}" aria-label="${title} endgültig löschen">Endgültig löschen</button>
    </div>
  </li>`;
}

function trashConfirmModal() {
  const it = trashState.items.find(x => x.id === state.modal.id);
  const title = escapeHtml((it && it.recipe && it.recipe.title) || 'Rezept');
  return `<div class="modal-backdrop" data-action="close-modal">
    <div class="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="trash-confirm-title" tabindex="-1" data-stop-click>
      <h2 class="modal-title" id="trash-confirm-title">Endgültig löschen?</h2>
      <p class="trash-confirm-text">„${title}“ wird mit dem Foto gelöscht. Das lässt sich nicht rückgängig machen.</p>
      <div class="form-actions">
        <button class="ghost-btn" data-action="close-modal">Abbrechen</button>
        <button class="primary-btn kd-danger-btn trash-confirm-btn" data-action="trash-forever-confirm" data-id="${escapeAttr(state.modal.id)}">Endgültig löschen</button>
      </div>
    </div>
  </div>`;
}

function trashView() {
  // Beim Betreten (und hoechstens alle 2 s) den Stand neu lesen: der Abgleich kann Eintraege von anderen Geraeten gebracht haben
  const now = Date.now();
  if (!trashState.loaded || now - trashState.checkedAt > 2000) {
    trashState.checkedAt = now;
    const before = trashState.items.map(t => t.id + ':' + t.deletedAt).join('|');
    trashLoad().then(() => { if (trashState.items.map(t => t.id + ':' + t.deletedAt).join('|') !== before || !trashState.sig) { trashState.sig = '1'; trashRerender(); } }).catch(() => {});
  }
  const items = trashState.items;
  const body = !trashState.loaded ? '<p class="settings-hint">Lädt …</p>'
    : items.length
      ? `<p class="settings-hint trash-intro">Gelöschte Rezepte bleiben ${TRASH_DAYS} Tage hier, samt Foto. Danach werden sie endgültig gelöscht.</p><ul class="trash-list" aria-label="Zuletzt gelöschte Rezepte">${items.map(trashRowHtml).join('')}</ul>`
      : `<div class="empty-state trash-empty">${ICONS.trash}<h2>Nichts gelöscht</h2><p>Gelöschte Rezepte findest du hier und kannst sie ${TRASH_DAYS} Tage lang zurückholen.</p></div>`;
  return `
    ${topbar('Papierkorb', { back: true })}
    <main class="has-tabbar settings-page trash-main">
      ${pageTitle('Papierkorb')}
      ${body}
    </main>
    ${bottomNav()}
    ${state.modal && state.modal.type === 'trash-confirm' ? trashConfirmModal() : ''}
  `;
}

async function handleTrashAction(action, id, el) {
  switch (action) {
    case 'trash-restore': {
      const it = trashState.items.find(x => x.id === id);
      const title = (it && it.recipe && it.recipe.title) || 'Rezept';
      const r = await trashRestore(id);
      if (!r) { showToast('Das Rezept ist nicht mehr da', 'error'); await trashLoad(); render(); return true; }
      showToast(`„${title}“ ist wieder da`);
      render();
      return true;
    }
    case 'trash-forever':
      openModal({ type: 'trash-confirm', id }, `[data-action="trash-forever"][data-id="${cssAttr(id)}"]`);
      return true;
    case 'trash-forever-confirm': {
      state.modal = null;
      await trashDeleteForever(id);
      showToast('Endgültig gelöscht');
      render();
      return true;
    }
    default: return false;
  }
}

// Start: Stand laden, danach (ohne den Start zu bremsen) Altes aufraeumen
trashLoad().then(trashRerender).catch(() => {});   // Anzahl fuer «Mehr»
setTimeout(() => { trashPurge().then(() => { trashRerender(); }).catch(() => {}); }, 2500);
