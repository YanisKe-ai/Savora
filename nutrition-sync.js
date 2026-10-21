/* ---------- Naehrwerte: Zuordnungen reisen mit dem Rezept (v0.86, Gerätewechsel) ----------
   Gelernte Zuordnungen (nutritionMatches) und eigene Lebensmittel (customFoods) liegen nur lokal in IndexedDB.
   Damit ein zweites Geraet dieselben Naehrwerte rechnet, steht pro Rezept ein optionales Feld
     recipe.nutritionMap = { [normalisierter Zutatenname]: { foodId, source, name, customFood?, updatedAt } }
   Es reist mit dem normalen Rezept-Abgleich (cloud.js, kind 'recipe') und beim Teilen mit, nie in die Bibliothek.
   Eintrag mit deleted: true (foodId null) = Zuordnung bewusst zurueckgesetzt (Grabstein, damit die Zusammenfuehrung
   sie nicht wiederbelebt).
   Zusammenfuehren: pro Eintrag gewinnt der neuere (updatedAt). Damit kein Speichern einer veralteten Kopie
   (Editor, anderes Geraet) Eintraege loescht, haengt sich diese Datei vor cloud.js an dbPut: vor jedem Speichern
   werden die gespeicherten Eintraege mit den neuen zusammengefuehrt. cloud.js uebernimmt Cloud-Daten ueber
   dieselbe (umhuellte) Funktion; gingen dabei lokale Eintraege sonst verloren, wird das Rezept neu vorgemerkt.
   Alte Rezepte ohne Feld bleiben unveraendert gueltig. */

const NUTRITION_SYNC_MAX_ENTRIES = 500;
const NUTRITION_SYNC_BACKFILL_KEY = 'savora-nutrition-map-backfill';   // { v, done, lastId }
const NUTRITION_SYNC_BACKFILL_LIMIT = 150;                               // Rezepte pro Start (Rest beim naechsten Start)
const NUTRITION_SYNC_BACKFILL_DELAY = 2500;                              // ms nach dem Laden, blockiert den Start nicht

function nsNorm(s) {
  if (typeof s !== 'string') return '';
  try { return typeof normalizeIngredientText === 'function' ? normalizeIngredientText(s) : s.trim().toLowerCase(); } catch (e) { return s.trim().toLowerCase(); }
}
function nsNum(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
function nsSourceOf(foodId) {
  const id = String(foodId || '');
  return id.startsWith('custom-') ? 'custom' : id.startsWith('off-') ? 'off' : 'swiss';
}

/* Kopie eines eigenen Lebensmittels fuers Rezept: nur Werte, die zum Rechnen noetig sind (null bleibt null). */
function nsCustomFoodCopy(food) {
  if (!food || typeof food !== 'object' || typeof food.id !== 'string' || !food.id.startsWith('custom-')) return null;
  const n = {};
  const src = food.nutrientsPer100g && typeof food.nutrientsPer100g === 'object' ? food.nutrientsPer100g : {};
  Object.keys(src).slice(0, 80).forEach(k => { if (/^[A-Za-z0-9_]{1,40}$/.test(k)) n[k] = nsNum(src[k]); });
  const out = { id: food.id.slice(0, 120), name: String(food.name || '').slice(0, 300), nutrientsPer100g: n, density: nsNum(food.density) };
  if (typeof food.category === 'string' && food.category) out.category = food.category.slice(0, 100);
  if (typeof food.brand === 'string' && food.brand) out.brand = food.brand.slice(0, 100);
  if (nsNum(food.updatedAt) !== null) out.updatedAt = food.updatedAt;
  return out;
}
/* Mitgereiste Kopie -> Lebensmittel-Objekt im selben Format wie saveCustomFood (fehlende Naehrstoffe = null). */
function nsFoodFromCopy(copy) {
  if (!copy || typeof copy.id !== 'string') return null;
  const base = typeof emptyNutrients === 'function' ? emptyNutrients() : {};
  return {
    id: copy.id, source: 'custom', sourceId: copy.id, name: copy.name || '', language: 'de', synonyms: [],
    category: copy.category || null, brand: copy.brand || null, barcode: null,
    density: nsNum(copy.density), nutrientsPer100g: Object.assign(base, copy.nutrientsPer100g || {}),
    updatedAt: nsNum(copy.updatedAt) || Date.now(),
  };
}

function nsEntrySame(a, b) {
  if (!a || !b) return !a && !b;
  if (!!a.deleted !== !!b.deleted || (a.foodId || null) !== (b.foodId || null)) return false;
  return JSON.stringify(a.customFood || null) === JSON.stringify(b.customFood || null);
}

/* Zwei Karten zusammenfuehren: pro Schluessel gewinnt der neuere Eintrag (Gleichstand: incoming).
   Ergebnis { map, changedVsIncoming } . changedVsIncoming = das Ergebnis weicht von incoming ab. */
function nutritionSyncMergeMaps(incoming, stored) {
  const inc = incoming && typeof incoming === 'object' && !Array.isArray(incoming) ? incoming : {};
  const sto = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  const map = Object.assign({}, inc);
  let changed = false;
  Object.keys(sto).forEach(k => {
    const s = sto[k], i = inc[k];
    if (!s || typeof s !== 'object') return;
    if (!i || (Number(s.updatedAt) || 0) > (Number(i.updatedAt) || 0)) {
      if (!nsEntrySame(i, s)) { map[k] = s; changed = true; }
    }
  });
  return { map, changedVsIncoming: changed };
}

/* Gespeichertes Rezept direkt lesen (ohne alle Rezepte zu laden). */
async function nsGetStoredRecipe(id) {
  if (id === undefined || id === null || typeof openDB !== 'function') return null;
  const db = await openDB();
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('recipes', 'readonly');
      const req = tx.objectStore('recipes').get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch (e) { resolve(null); }
  });
}

/* Nach dem Uebernehmen von Cloud-Daten (cloud.applyingRemote) darf cloudMark nicht sofort laufen.
   Lokale Eintraege, die beim Zusammenfuehren erhalten blieben, werden danach hochgeladen. */
const nsRemarkIds = new Set();
let nsRemarkTimer = null;
function nsApplyingRemote() { try { return typeof cloud !== 'undefined' && !!cloud.applyingRemote; } catch (e) { return false; } }
function nsScheduleRemark(id) {
  nsRemarkIds.add(String(id));
  if (nsRemarkTimer) return;
  const tick = () => {
    if (nsApplyingRemote()) { nsRemarkTimer = setTimeout(tick, 200); return; }
    nsRemarkTimer = null;
    const ids = Array.from(nsRemarkIds); nsRemarkIds.clear();
    if (typeof cloudMark === 'function') ids.forEach(x => { try { cloudMark('recipe', x, false); } catch (e) {} });
  };
  nsRemarkTimer = setTimeout(tick, 0);
}

/* dbPut umhuellen (vor cloud.js geladen, darum auch der Weg, auf dem Cloud-Rezepte gespeichert werden). */
(function nsWrapDbPut() {
  if (typeof window === 'undefined') return;
  const orig = window.dbPut;
  if (typeof orig !== 'function' || orig.__nsMerge) return;
  const wrapped = async function (recipe) {
    if (recipe && typeof recipe === 'object' && recipe.id !== undefined && recipe.id !== null) {
      try {
        const stored = await nsGetStoredRecipe(recipe.id);
        if (stored && stored.nutritionMap && typeof stored.nutritionMap === 'object') {
          const m = nutritionSyncMergeMaps(recipe.nutritionMap, stored.nutritionMap);
          if (m.changedVsIncoming) {
            recipe.nutritionMap = m.map;
            if (nsApplyingRemote()) nsScheduleRemark(recipe.id);
          }
        }
      } catch (e) { /* Zusammenfuehren ist ein Zusatz: Speichern darf daran nie scheitern */ }
    }
    return orig.apply(this, arguments);
  };
  wrapped.__nsMerge = true;
  window.dbPut = wrapped;
})();

/* Eigene Lebensmittel aus dem Rezept lokal anlegen, falls die ID fehlt (vorhandene werden nie ueberschrieben). */
const nsEnsuring = new Map();
function nsEnsureCustomFoodLocal(copy) {
  if (!copy || typeof copy.id !== 'string' || !copy.id.startsWith('custom-')) return Promise.resolve(false);
  if (nsEnsuring.has(copy.id)) return nsEnsuring.get(copy.id);
  const p = (async () => {
    if (typeof dbGetAllCustomFoods !== 'function' || typeof dbPutCustomFood !== 'function') return false;
    const all = await dbGetAllCustomFoods();
    if (all.some(f => f && f.id === copy.id)) return false;
    const food = nsFoodFromCopy(copy);
    if (!food) return false;
    await dbPutCustomFood(food);
    return true;
  })().catch(() => false);
  nsEnsuring.set(copy.id, p);
  return p;
}

/* Zuordnung aus dem Rezept lesen. Synchron (await ist trotzdem moeglich).
   normalizedIngredient: ein Schluessel oder eine Liste moeglicher Schluessel.
   Ergebnis: { foodId, source, name, updatedAt, customFood? } | null . customFood ist ein vollstaendiges
   Lebensmittel-Objekt (Format wie saveCustomFood). Fehlt es lokal, wird es im Hintergrund angelegt. */
function nutritionSyncLookup(recipe, normalizedIngredient) {
  const map = recipe && recipe.nutritionMap;
  if (!map || typeof map !== 'object' || Array.isArray(map)) return null;
  const raw = Array.isArray(normalizedIngredient) ? normalizedIngredient : [normalizedIngredient];
  const keys = [];
  raw.forEach(k => { if (typeof k === 'string' && k) { if (!keys.includes(k)) keys.push(k); const n = nsNorm(k); if (n && !keys.includes(n)) keys.push(n); } });
  for (const k of keys) {
    if (!Object.prototype.hasOwnProperty.call(map, k)) continue;
    const e = map[k];
    if (!e || typeof e !== 'object') continue;
    if (e.deleted || typeof e.foodId !== 'string' || !e.foodId) return null;   // bewusst zurueckgesetzt
    const out = { foodId: e.foodId, source: e.source || nsSourceOf(e.foodId), name: e.name || '', updatedAt: Number(e.updatedAt) || 0 };
    if (e.customFood && e.customFood.id === e.foodId) {
      out.customFood = nsFoodFromCopy(e.customFood);
      nsEnsureCustomFoodLocal(e.customFood);
    }
    return out;
  }
  return null;
}

/* Bestaetigte Zuordnung im Rezept merken (nach dem Speichern der globalen Zuordnung aufrufen).
   matchObj: { foodId } bzw. ein Lebensmittel { id, name } bzw. { food }. null/ohne foodId = Zuordnung zuruecksetzen.
   Speichert ueber dbPut (wie der Editor, loest den Cloud-Abgleich aus), aendert nur nutritionMap, kein render().
   Schreibt nur bei echter Aenderung. Ergebnis: { changed: boolean } . */
async function nutritionSyncRemember(recipeId, normalizedIngredient, matchObj, customFoodOrNull) {
  const key = typeof normalizedIngredient === 'string' ? normalizedIngredient.trim() : '';
  if (recipeId === undefined || recipeId === null || !key || key.length > 300) return { changed: false };
  const stored = await nsGetStoredRecipe(recipeId);
  if (!stored) return { changed: false };   // Bibliothek-Vorschau o. ae.: nicht im Kochbuch, nichts schreiben
  const m = matchObj && typeof matchObj === 'object' ? matchObj : null;
  const food = m && m.food && typeof m.food === 'object' ? m.food : null;
  const foodId = m ? (m.foodId || (food && food.id) || (m.id && !m.normalizedIngredient ? m.id : null)) : null;
  let entry;
  if (typeof foodId === 'string' && foodId) {
    entry = { foodId: foodId.slice(0, 120), source: nsSourceOf(foodId), name: String((food && food.name) || (m && m.name) || (customFoodOrNull && customFoodOrNull.name) || '').slice(0, 300), updatedAt: Date.now() };
    if (entry.source === 'custom') {
      let cf = customFoodOrNull && customFoodOrNull.id === foodId ? customFoodOrNull : (food && food.id === foodId ? food : null);
      if (!cf && typeof dbGetAllCustomFoods === 'function') { try { cf = (await dbGetAllCustomFoods()).find(f => f && f.id === foodId) || null; } catch (e) { cf = null; } }
      const copy = nsCustomFoodCopy(cf);
      if (copy) { entry.customFood = copy; if (!entry.name) entry.name = copy.name; }
    }
  } else {
    entry = { foodId: null, deleted: true, updatedAt: Date.now() };
  }
  const old = stored.nutritionMap && typeof stored.nutritionMap === 'object' && !Array.isArray(stored.nutritionMap) ? stored.nutritionMap : {};
  const prev = old[key];
  if (entry.deleted ? (!prev || prev.deleted) : nsEntrySame(prev, entry) && (prev.name || '') === entry.name) return { changed: false };
  if (!prev && Object.keys(old).length >= NUTRITION_SYNC_MAX_ENTRIES) return { changed: false };
  const next = Object.assign({}, stored, { nutritionMap: Object.assign({}, old, { [key]: entry }) });
  await dbPut(next);
  nsPatchState(recipeId, next.nutritionMap);
  return { changed: true };
}

/* Zuordnung im Rezept entfernen (Matcher ruft das beim Zuruecksetzen auf). Gleicher Speicherweg wie Remember.
   Der Eintrag wird zum Grabstein { foodId: null, deleted: true, updatedAt }: fuer Lookup ist er weg (null), und die
   Zusammenfuehrung mit einem anderen Geraet belebt die alte Zuordnung nicht wieder. Ohne Eintrag: nichts schreiben. */
async function nutritionSyncForget(recipeId, normalizedIngredient) {
  return nutritionSyncRemember(recipeId, normalizedIngredient, null, null);
}

/* Speicherstand im Arbeitsspeicher nachfuehren, ohne neu zu zeichnen. */
function nsPatchState(recipeId, map) {
  try {
    if (typeof state === 'undefined' || !Array.isArray(state.recipes)) return;
    const r = state.recipes.find(x => x && x.id === recipeId);
    if (r) r.nutritionMap = map;
  } catch (e) {}
}

/* Schluessel einer Zutat wie in matchIngredients/matchIngredient (bereinigter Kern zuerst). */
function nutritionSyncKeysFor(ing) {
  if (!ing || typeof ing.name !== 'string' || !ing.name.trim()) return [];
  let name = ing.name;
  try { if (typeof nutPrepareIngredient === 'function') name = (nutPrepareIngredient(ing) || ing).name || ing.name; } catch (e) {}
  let cleaned = '';
  try { cleaned = typeof nutCleanIngredientName === 'function' ? nutCleanIngredientName(name).name : ''; } catch (e) {}
  return [nsNorm(cleaned || name), nsNorm(name), nsNorm(ing.name)].filter((k, i, a) => k && a.indexOf(k) === i);
}

/* Einmalige, additive Uebernahme der lokalen Zuordnungen in die Rezepte (pro Geraet einmal, begrenzt pro Start).
   Traegt nur ein, wo im Rezept noch nichts steht. recipe.updatedAt bleibt unveraendert (Reihenfolge der Liste). */
async function nutritionSyncBackfillOnce(opts) {
  opts = opts || {};
  let flag = null;
  try { flag = JSON.parse(localStorage.getItem(NUTRITION_SYNC_BACKFILL_KEY) || 'null'); } catch (e) { flag = null; }
  if (flag && flag.done && !opts.force) return { skipped: true, written: 0 };
  const setFlag = (v) => { try { localStorage.setItem(NUTRITION_SYNC_BACKFILL_KEY, JSON.stringify(Object.assign({ v: 1 }, v))); } catch (e) {} };
  if (typeof dbGetAll !== 'function' || typeof dbGetAllNutritionMatches !== 'function') return { skipped: true, written: 0 };
  const [matches, customs] = await Promise.all([dbGetAllNutritionMatches().catch(() => []), typeof dbGetAllCustomFoods === 'function' ? dbGetAllCustomFoods().catch(() => []) : []]);
  if (!matches.length && !customs.length) { setFlag({ done: true }); return { skipped: false, written: 0 }; }
  const matchBy = new Map(matches.filter(x => x && x.foodId && x.normalizedIngredient).map(x => [x.normalizedIngredient, x]));
  const customById = new Map(customs.filter(f => f && f.id).map(f => [f.id, f]));
  const customByName = new Map(customs.filter(f => f && f.name).map(f => [nsNorm(f.name), f]));
  const limit = opts.limit || NUTRITION_SYNC_BACKFILL_LIMIT;
  const all = (await dbGetAll()).filter(r => r && r.id !== undefined && r.id !== null).sort((a, b) => String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);
  const start = flag && flag.lastId !== undefined ? all.findIndex(r => String(r.id) > String(flag.lastId)) : 0;
  const todo = start < 0 ? [] : all.slice(start, start + limit);
  let written = 0;
  for (const r of todo) {
    const add = {};
    const old = r.nutritionMap && typeof r.nutritionMap === 'object' && !Array.isArray(r.nutritionMap) ? r.nutritionMap : {};
    (Array.isArray(r.ingredients) ? r.ingredients : []).forEach(ing => {
      if (!ing || (typeof isIngredientHeaderRow === 'function' && isIngredientHeaderRow(ing))) return;
      const keys = nutritionSyncKeysFor(ing);
      if (!keys.length || keys.some(k => old[k] || add[k])) return;
      let foodId = null, how = null;
      for (const k of keys) { const mm = matchBy.get(k); if (mm) { foodId = mm.foodId; how = mm; break; } }
      let cf = null;
      if (!foodId) { cf = customByName.get(keys[0]) || null; if (cf) foodId = cf.id; }
      if (!foodId) return;
      const at = Number(how && how.updatedAt) || 1;   // alter Zeitstempel: neuere Zuordnungen anderer Geraete gewinnen
      const entry = { foodId, source: nsSourceOf(foodId), name: '', updatedAt: at };
      if (entry.source === 'custom') {
        const copy = nsCustomFoodCopy(cf || customById.get(foodId));
        if (copy) { entry.customFood = copy; entry.name = copy.name; }
      }
      add[keys[0]] = entry;
    });
    if (Object.keys(add).length && Object.keys(old).length + Object.keys(add).length <= NUTRITION_SYNC_MAX_ENTRIES) {
      const next = Object.assign({}, r, { nutritionMap: Object.assign({}, add, old) });
      try { await dbPut(next); nsPatchState(r.id, next.nutritionMap); written++; } catch (e) { /* naechster Start */ }
    }
    await new Promise(res => setTimeout(res, 0));   // anderen Arbeiten Vortritt lassen
  }
  const finished = start < 0 || start + limit >= all.length;
  setFlag(finished ? { done: true } : { done: false, lastId: todo.length ? todo[todo.length - 1].id : (flag && flag.lastId) });
  return { skipped: false, written, done: finished };
}

if (typeof window !== 'undefined' && !window.__SAVORA_NO_NUTRITION_BACKFILL) {
  window.addEventListener('load', () => {
    setTimeout(() => { nutritionSyncBackfillOnce().catch(err => console.warn('Nährwert-Zuordnungen nicht übernommen', err)); }, NUTRITION_SYNC_BACKFILL_DELAY);
  });
}
