/* v90: Vorrat «Was kann ich kochen?»
   Der Nutzer traegt ein, was er zuhause hat. Savora zeigt Rezepte, sortiert nach wenigsten fehlenden Zutaten.

   Speicher: IndexedDB-Store «pantry» (db.js, H1). Fehlt er (alter Stand), faellt dieser Teil auf localStorage zurueck.
   Datensatz: { id, name, canonical, always, updatedAt }  (id aus dem Kernnamen, damit zwei Geraete dasselbe zusammenfuehren)
   Interne Markierung: { id: 'p-seeded', meta: true } = Grundausstattung wurde schon einmal angelegt (wird nie angezeigt).

   Schnittstellen:
     pantryView(), handlePantryAction(action, id, el, e)       Route 'pantry', Aktionen data-action="pantry-*"
     pantrySyncAll()          alle Datensaetze (async, fuer den ersten Abgleich)
     pantrySyncRead(id)       ein Datensatz oder null (async)
     pantrySyncApply(rec, deleted)   fremden Stand uebernehmen (async); der neuere updatedAt gewinnt
     pantryCanon(name), pantryMatches(opts), pantryItemCovers(canon, itemCanon) */

const PANTRY_LS_KEY = 'savora-pantry-fallback';
const PANTRY_SEED_ID = 'p-seeded';
const PANTRY_ALWAYS_DEFAULT = ['Salz', 'Pfeffer', 'Wasser', 'Öl'];

const pantryState = { items: [], loaded: false, loading: null };

/* ---------- Namen ---------- */
function pantryCanon(name) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  let c = '';
  try { c = normalizeIngredientPhrase(raw).canonicalIngredient || ''; } catch (e) { c = ''; }
  return (c || raw).toLowerCase().replace(/\s+/g, ' ').trim();
}
function pantryId(canon) {
  return 'p-' + String(canon).replace(/[^a-z0-9äöüéèàç]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}
/* Deckt ein Vorratseintrag (itemCanon) eine Zutat (ingCanon) ab? Singular/Plural wie in der Einkaufsliste,
   zusaetzlich Ei/Eier und «Öl» als Familie (Olivenöl, Rapsöl). */
function pantryItemCovers(ingCanon, itemCanon) {
  const a = String(ingCanon || '').trim(), b = String(itemCanon || '').trim();
  if (!a || !b) return false;
  if (typeof ingredientNamesMatch === 'function' && ingredientNamesMatch(a, b)) return true;
  if (a + 'er' === b || b + 'er' === a) return true;
  if (b === 'öl' || b === 'oel') return a.split(' ').some(w => /(ö|oe)l$/.test(w));
  return false;
}

/* ---------- Speicher ---------- */
function pantryHasStore() {
  return typeof dbGetAllPantry === 'function' && typeof dbPutPantry === 'function' && typeof dbDeletePantry === 'function';
}
async function pantryStoreAvailable() {
  if (!pantryHasStore()) return false;
  try { const db = await openDB(); return !!(db && db.objectStoreNames.contains('pantry')); } catch (e) { return false; }
}
async function pantryReadAll() {
  if (await pantryStoreAvailable()) { try { return await dbGetAllPantry(); } catch (e) { /* weiter mit Ersatz */ } }
  return readJsonKey(PANTRY_LS_KEY, []);
}
async function pantryWrite(rec) {
  if (await pantryStoreAvailable()) { await dbPutPantry(rec); return; }
  const all = readJsonKey(PANTRY_LS_KEY, []).filter(x => x.id !== rec.id);
  all.push(rec);
  if (!writeJsonKey(PANTRY_LS_KEY, all) && typeof storageFullWarn === 'function') storageFullWarn('pantry');
}
async function pantryErase(id) {
  if (await pantryStoreAvailable()) { await dbDeletePantry(id); return; }
  writeJsonKey(PANTRY_LS_KEY, readJsonKey(PANTRY_LS_KEY, []).filter(x => x.id !== id));
}
function pantryMark(id, deleted) {
  if (typeof cloudMark === 'function') { try { cloudMark('pantry', id, deleted); } catch (e) { /* Abgleich ist optional */ } }
}
function pantryVisible() { return pantryState.items.filter(x => x && !x.meta && x.name); }

async function pantryLoad(force) {
  if (pantryState.loaded && !force) return pantryState.items;
  if (pantryState.loading) return pantryState.loading;
  pantryState.loading = (async () => {
    let all = await pantryReadAll();
    // Grundausstattung (Salz, Pfeffer, Wasser, Öl) einmalig anlegen; wer sie abwaehlt, behaelt das so (Markierung bleibt)
    if (!all.some(x => x.id === PANTRY_SEED_ID) && !all.some(x => !x.meta)) {
      const now = Date.now();
      const seeds = PANTRY_ALWAYS_DEFAULT.map(n => { const canon = pantryCanon(n); return { id: pantryId(canon), name: n, canonical: canon, always: true, updatedAt: now }; });
      seeds.push({ id: PANTRY_SEED_ID, meta: true, updatedAt: now });
      for (const s of seeds) { await pantryWrite(s); pantryMark(s.id, false); }
      all = all.concat(seeds);
    }
    pantryState.items = all;
    pantryState.loaded = true;
    pantryState.loading = null;
    return all;
  })();
  return pantryState.loading;
}
function pantryRerender() {
  if (typeof state !== 'undefined' && state.view === 'pantry' && typeof render === 'function') render(true);
}

/* ---------- Abgleich mit der Cloud (Datenart pantry) ---------- */
async function pantrySyncAll() { return (await pantryReadAll()).filter(x => x && x.id); }
async function pantrySyncRead(id) { return (await pantryReadAll()).find(x => x.id === id) || null; }
async function pantrySyncApply(rec, deleted) {
  if (!rec || !rec.id) return false;
  const local = (await pantryReadAll()).find(x => x.id === rec.id);
  if (deleted) { if (local) await pantryErase(rec.id); }
  else {
    if (local && Number(local.updatedAt || 0) > Number(rec.updatedAt || 0)) return false;   // lokal neuer: behalten
    await pantryWrite(rec);
  }
  pantryState.loaded = false;
  await pantryLoad(true);
  pantryRerender();
  return true;
}

/* ---------- Aenderungen ---------- */
async function pantryAdd(text) {
  const names = String(text || '').split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
  let added = 0;
  await pantryLoad();
  for (const name of names.slice(0, 30)) {
    const canon = pantryCanon(name.slice(0, 60));
    if (!canon) continue;
    if (pantryVisible().some(x => x.canonical === canon || (pantryItemCovers(canon, x.canonical) && pantryItemCovers(x.canonical, canon)))) continue;   // auch Zwiebel = Zwiebeln
    const rec = { id: pantryId(canon), name: name.slice(0, 60), canonical: canon, always: false, updatedAt: Date.now() };
    await pantryWrite(rec);
    pantryMark(rec.id, false);
    pantryState.items = pantryState.items.filter(x => x.id !== rec.id).concat(rec);
    added++;
  }
  return added;
}
async function pantryRemove(id) {
  await pantryLoad();
  await pantryErase(id);
  pantryMark(id, true);
  pantryState.items = pantryState.items.filter(x => x.id !== id);
}
async function pantryToggleAlways(id) {
  await pantryLoad();
  const it = pantryState.items.find(x => x.id === id);
  if (!it || it.meta) return;
  const rec = { ...it, always: !it.always, updatedAt: Date.now() };
  await pantryWrite(rec);
  pantryMark(id, false);
  pantryState.items = pantryState.items.map(x => x.id === id ? rec : x);
}

/* ---------- Treffer ---------- */
/* Zutaten eines Rezepts, die zaehlen: keine Gruppentitel, nichts Optionales. */
function pantryNeeded(recipe) {
  const out = [];
  (recipe.ingredients || []).forEach(ing => {
    if (!ing || !String(ing.name || '').trim()) return;
    if (typeof isIngredientHeaderRow === 'function' && isIngredientHeaderRow(ing)) return;
    let info = null;
    try { info = normalizeIngredientPhrase(ing.name); } catch (e) { info = null; }
    if (info && info.optional) return;
    if (/\boptional\b|nach belieben|zum (garnieren|servieren|bestreuen)/i.test(String(ing.name)) && !(info && info.canonicalIngredient)) return;
    out.push({ ing, canon: (info && info.canonicalIngredient) || String(ing.name).trim().toLowerCase() });
  });
  return out;
}

/* pantryMatches({ recipes, items }): sortiert nach fehlenden Zutaten (wenige zuerst), dann Anteil vorhanden, dann Titel.
   Rezepte, von denen nichts im Vorrat steckt (ausser «Immer da»), erscheinen nicht. */
function pantryMatches(opts) {
  opts = opts || {};
  const recipes = opts.recipes || (typeof state !== 'undefined' ? state.recipes : []) || [];
  const items = (opts.items || pantryVisible()).filter(x => x && x.canonical);
  const out = [];
  recipes.forEach(r => {
    const need = pantryNeeded(r);
    if (!need.length) return;
    const missing = [];
    let have = 0, realHave = 0;
    need.forEach(n => {
      const hit = items.find(it => pantryItemCovers(n.canon, it.canonical));
      if (hit) { have++; if (!hit.always) realHave++; } else missing.push(n);
    });
    if (!realHave) return;
    out.push({ recipe: r, total: need.length, have, missing: missing.map(m => String(m.ing.name).trim()), missingIngredients: missing.map(m => m.ing), ratio: have / need.length });
  });
  out.sort((a, b) => (a.missing.length - b.missing.length) || (b.ratio - a.ratio)
    || String(a.recipe.title || '').localeCompare(String(b.recipe.title || ''), 'de'));
  return out;
}

/* ---------- Ansicht ---------- */
/* v91.13: Vorrat als Chips (kompakt), «Immer da» eingeklappt, passende Rezepte als Katalog mit Foto, Füllbalken und
   sanftem Erscheinen (gestaffelt, bei reduzierter Bewegung ohne). Klassen pantry-item/-card/-status bleiben für Tests und Aktionen. */
function pantryItemRow(it) {
  const n = escapeHtml(it.name);
  return `<li class="pantry-item${it.always ? ' pantry-item--always' : ''}">
    <span class="pantry-name">${n}</span>
    <button type="button" class="pantry-always ${it.always ? 'is-on' : ''}" data-action="pantry-always" data-id="${escapeAttr(it.id)}" aria-pressed="${it.always ? 'true' : 'false'}" aria-label="${n}: immer da" title="Immer da">${ICONS.check}</button>
    <button type="button" class="pantry-remove" data-action="pantry-remove" data-id="${escapeAttr(it.id)}" aria-label="${n} entfernen">${ICONS.x}</button>
  </li>`;
}
function pantryMatchCard(m, i) {
  const r = m.recipe;
  const ready = m.missing.length === 0;
  const pct = Math.round((m.have / Math.max(1, m.total)) * 100);
  const img = (typeof recipeImageHtml === 'function' && recipeImageHtml(r, 'pantry-cat-img', 'card'))
    || (typeof recipeInitialHtml === 'function' ? recipeInitialHtml(r, 'pantry-cat-img pantry-cat-ph') : '<span class="pantry-cat-img pantry-cat-ph"></span>');
  const badge = ready ? '<span class="pantry-cat-badge pantry-cat-badge--ready">Alles da</span>'
    : `<span class="pantry-cat-badge">${m.missing.length === 1 ? '1 fehlt' : `${m.missing.length} fehlen`}</span>`;
  const status = ready
    ? `<p class="pantry-status pantry-status--ready">Alles da</p>`
    : `<p class="pantry-status">${m.missing.length === 1 ? 'Es fehlt' : 'Es fehlen'}: ${m.missing.map(escapeHtml).join(', ')}</p>`;
  return `<li class="pantry-card${ready ? ' pantry-card--ready' : ''}" style="--i:${Math.min(i || 0, 10)}">
    <button type="button" class="pantry-card-main" data-action="open-recipe" data-id="${escapeAttr(r.id)}">
      <span class="pantry-cat-media">${img}${badge}</span>
      <span class="pantry-card-title">${escapeHtml(r.title || 'Ohne Titel')}</span>
      <span class="pantry-meter" role="img" aria-label="${m.have} von ${m.total} Zutaten da"><span class="pantry-meter-fill" style="--p:${pct / 100}"></span></span>
      <span class="pantry-card-count">${m.have} von ${m.total} Zutaten da</span>
    </button>
    ${status}
    ${m.missing.length ? `<button type="button" class="pantry-shop" data-action="pantry-shop" data-id="${escapeAttr(r.id)}" aria-label="Fehlendes für ${escapeAttr(r.title || 'dieses Rezept')} einkaufen">${ICONS.cart}<span>Einkaufen</span></button>` : ''}
  </li>`;
}
function pantryView() {
  if (!pantryState.loaded) {
    pantryLoad().then(pantryRerender).catch(() => { pantryState.loaded = true; pantryRerender(); });
  }
  const items = pantryVisible().slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'de'));
  const own = items.filter(x => !x.always), always = items.filter(x => x.always);
  const matches = pantryState.loaded ? pantryMatches() : [];
  const ready = matches.filter(m => !m.missing.length).length;
  const resultHtml = !pantryState.loaded ? '<p class="settings-hint">Lädt …</p>'
    : !own.length ? '<p class="settings-hint">Trag oben ein, was du zuhause hast. Dann zeigt dir Savora passende Rezepte.</p>'
    : !matches.length ? '<p class="settings-hint">Zu deinem Vorrat passt noch kein Rezept. Trag mehr ein oder speichere weitere Rezepte.</p>'
    : `<ul class="pantry-list pantry-catalog" aria-label="Passende Rezepte">${matches.map(pantryMatchCard).join('')}</ul>`;
  return `
    ${topbar('Vorrat', { back: true })}
    <main class="has-tabbar pantry-main">
      <p class="settings-hint pantry-intro">Was hast du zuhause? Savora zeigt dir, was du damit kochen kannst. Wische seitwärts durch die Rezepte.</p>
      <div class="inline-add pantry-add">
        <label for="pantryInput" class="sr-only">Zutat im Vorrat, mehrere mit Komma</label>
        <input id="pantryInput" type="text" maxlength="200" placeholder="z. B. Rüebli, Zwiebeln, Reis" autocomplete="off" enterkeyhint="done">
        <button type="button" class="primary-btn" data-action="pantry-add">Hinzufügen</button>
      </div>
      <h2 class="pantry-h pantry-h--cat">Was kann ich kochen?${matches.length ? ` <span class="pantry-h-count">${ready ? `${ready} sofort` : `${matches.length} Rezepte`}</span>` : ''}</h2>
      ${resultHtml}
      ${own.length ? `<h2 class="pantry-h">Dein Vorrat <span class="pantry-h-count">${own.length}</span></h2><ul class="pantry-items pantry-chips">${own.map(pantryItemRow).join('')}</ul>` : ''}
      <details class="pantry-always-box"${pantryState.alwaysOpen ? ' open' : ''}>
        <summary><span>Immer da</span><span class="pantry-h-count">${always.length}</span></summary>
        <p class="settings-hint">Das zählt nie als fehlend. Tippe auf das Häkchen, um etwas abzuwählen.</p>
        ${always.length ? `<ul class="pantry-items pantry-chips">${always.map(pantryItemRow).join('')}</ul>` : '<p class="settings-hint">Nichts als «Immer da» markiert.</p>'}
      </details>
    </main>
    ${bottomNav()}
  `;
}

/* ---------- Aktionen ---------- */
async function pantrySubmitInput() {
  const input = document.getElementById('pantryInput');
  const text = input ? input.value : '';
  if (!String(text).trim()) { if (input) input.focus(); return; }
  const n = await pantryAdd(text);
  if (!n) showToast('Schon im Vorrat');
  pantryRerender();
  const again = document.getElementById('pantryInput');
  if (again) again.focus();
}
async function pantryShopMissing(recipeId) {
  const r = (state.recipes || []).find(x => x.id === recipeId);
  if (!r) return;
  const m = pantryMatches().find(x => x.recipe.id === recipeId);
  if (!m || !m.missingIngredients.length) { showToast('Es fehlt nichts'); return; }
  if (typeof addRecipeIngredientsToShopping !== 'function') return;
  const copy = { ...r, ingredients: m.missingIngredients };
  await addRecipeIngredientsToShopping(copy, r.servings);
  showToast(m.missingIngredients.length === 1 ? '1 Zutat zur Einkaufsliste hinzugefügt' : `${m.missingIngredients.length} Zutaten zur Einkaufsliste hinzugefügt`);
}
async function handlePantryAction(action, id, el) {
  switch (action) {
    case 'pantry-add': await pantrySubmitInput(); return true;
    case 'pantry-remove': await pantryRemove(id); pantryRerender(); return true;
    case 'pantry-always': await pantryToggleAlways(id); pantryRerender(); return true;
    case 'pantry-shop': await pantryShopMissing(id); return true;
    default: return false;
  }
}
// «Immer da» bleibt nach dem Neuzeichnen offen, wenn man es geöffnet hat
document.addEventListener('toggle', (e) => { if (e.target && e.target.classList && e.target.classList.contains('pantry-always-box')) pantryState.alwaysOpen = e.target.open; }, true);
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.isComposing || !e.target || e.target.id !== 'pantryInput') return;
  e.preventDefault();
  pantrySubmitInput();
});
