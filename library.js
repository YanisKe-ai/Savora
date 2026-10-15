/* ---------- Savora Rezeptbibliothek: Daten und Logik ----------
   Grundsaetze (siehe docs/BIBLIOTHEK.md und supabase/paket45-bibliothek.sql):
   - Oeffentlich ist nur, was bewusst veroeffentlicht wurde. Private Rezepte, Bilder, Freunde und Konto bleiben privat.
   - Oeffentliche Rezepte leben in einem eigenen Zustand (lib), nie in state.recipes. Oeffentliche IDs landen nie in
     Wochenplan, Einkauf oder Kochbuechern: alles Lokale laeuft ueber ensurePersonalRecipe() und die lokale Rezept-ID.
   - Die oeffentliche Nutzlast wird Feld fuer Feld gebaut (libDraftFromRecipe), nie als Kopie des privaten Rezepts.
     Der Server baut sie nochmals strikt neu (savora_lib_clean).
   - Unbekannte Zeit oder Menge bleibt null. Allergie-Angaben werden nie veroeffentlicht.
   - Lesen geht ohne Konto. Schreiben nur angemeldet; die Berechtigung prueft der Server, nicht dieser Code.
   - Nichts wird im Hintergrund oder spaeter automatisch veroeffentlicht (keine Warteschlange). */

const LIB_TERMS_VERSION = 'bibliothek-2026-10-15';
const LIB_PAGE = 24;
const LIB_BUCKET = 'savora-public';
const LIB_PUBLIC_DIETS = ['vegan', 'vegetarisch', 'fleisch', 'fisch'];
const LIB_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LIB_PUBLIC_ID_RE = /^[a-z0-9]{12}$/;
const LIB_MEAL_IDS = new Set(['breakfast', 'brunch', 'lunch', 'dinner', 'snack', 'dessert']);
const LIB_OFFLINE_TEXT = 'Zum Entdecken brauchst du eine Internetverbindung. Deine gespeicherten Rezepte sind weiterhin verfügbar.';

function libEmptyFilters() { return { quick: false, veg: false, maxMinutes: null, diet: [], categories: [] }; }
const lib = {
  gen: 0,
  discover: { q: '', filters: libEmptyFilters(), sort: 'newest', items: [], cursor: null, total: 0, capped: false, status: 'idle', moreStatus: 'idle', error: null, seq: 0, ctrl: null, timer: null, key: null },
  detail: { id: null, status: 'idle', pub: null, error: null },
  profile: { publicId: null, status: 'idle', data: null, items: [], cursor: null, moreStatus: 'idle' },
  mine: { status: 'idle', items: [], error: null, loadedAt: 0 },
  pubProfile: { status: 'idle', data: undefined, error: null },
  mod: { allowed: false, checked: false, status: 'idle', reports: [], filter: 'open', error: null },
  publish: null,
  returnTo: null,
  cache: new Map(),     // Publikations-ID -> { pub, at }
  signed: new Map(),    // Speicherpfad -> { url, exp }
  saving: new Map(),    // Publikations-ID -> laufendes ensurePersonalRecipe
};
state.recipesTab = state.recipesTab || 'mine';

/* ---------- Fehler und Server ---------- */
function libErr(message, extra) { return Object.assign(new Error(message), extra || {}); }
function libErrText(e) {
  if (!e) return 'Das hat nicht geklappt. Bitte nochmals versuchen.';
  if (e.offline) return 'Keine Verbindung zum Internet. Bitte später nochmals versuchen.';
  if (e.needsLogin || e.status === 401) return 'Bitte melde dich an, um fortzufahren.';
  const m = String(e.message || '');
  if (/^KONFLIKT:\s*/.test(m)) return m.replace(/^KONFLIKT:\s*/, '');
  // Nur eigene, deutsche Meldungen der Datenbankfunktionen zeigen, nie technische Rohfehler
  if (m && !/relation|column|function|syntax|violates|permission denied|JWT|PGRST|null value|duplicate key/i.test(m) && m.length < 240) return m;
  return 'Das hat nicht geklappt. Bitte nochmals versuchen.';
}
const LIB_PUBLIC_RPCS = new Set(['savora_lib_search', 'savora_lib_get', 'savora_lib_profile']);
async function libApi(name, args, opts) {
  opts = opts || {};
  const isPublic = LIB_PUBLIC_RPCS.has(name);
  const signedIn = typeof cloudSignedIn === 'function' && cloudSignedIn();
  if (!isPublic && !signedIn) throw libErr('Bitte melde dich an.', { needsLogin: true, status: 401 });
  const call = (auth) => cloudFetch('/rest/v1/rpc/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args || {}), signal: opts.signal }, auth);
  let res;
  try {
    res = await call(signedIn);
  } catch (e) {
    if (opts.signal && opts.signal.aborted) throw libErr('abgebrochen', { aborted: true });
    // Abgelaufene Sitzung: Oeffentliches darf trotzdem gelesen werden
    if (isPublic && signedIn && (e.status === 401 || e.status === 403)) res = await call(false);
    else {
      if (/^KONFLIKT:/.test(String(e.message || ''))) e.conflict = true;
      throw e;
    }
  }
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}
function libRefresh(kind) {
  if (typeof libViewsRefresh === 'function') { libViewsRefresh(kind); return; }
  const views = { discover: ['discover'], detail: ['lib-detail'], profile: ['lib-profile'], mine: ['lib-mine', 'more'], pubprofile: ['lib-pubprofile', 'more', 'lib-publish'], mod: ['lib-mod', 'more'], publish: ['lib-publish'] }[kind] || [];
  if (!views.includes(state.view) || state.modal) return;
  const a = document.activeElement;
  if (a && /^(INPUT|TEXTAREA)$/.test(a.tagName)) return;
  render();
}

/* ---------- Normalisierung (Suche und Anzeige) ---------- */
function libNorm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, ' ').trim();
}
function libStr(v, max) { return typeof v === 'string' ? v.trim().slice(0, max) : ''; }
function libInt(v, min, max) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !isFinite(n)) return null;
  const r = Math.round(n);
  return r >= min && r <= max ? r : null;
}
function libSafeUrl(u) {
  if (typeof u !== 'string') return '';
  const s = u.trim();
  if (!/^https?:\/\/[^\s"'<>\\`]+$/i.test(s) || s.length > 500) return '';
  try { const x = new URL(s); return (x.protocol === 'https:' || x.protocol === 'http:') && x.hostname ? s : ''; } catch (e) { return ''; }
}
/* Oeffentliche Rezeptdaten fuer die Anzeige: gleiche Regeln wie savora_lib_clean, defensiv. Liefert ein gueltiges Objekt oder null. */
function libNormalizePublic(j) {
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
  const title = libStr(j.title, 200);
  if (!title) return null;
  const ings = (Array.isArray(j.ingredients) ? j.ingredients : []).slice(0, 300).filter(i => i && typeof i === 'object' && !Array.isArray(i)).map(i => {
    const o = { amount: typeof i.amount === 'number' && isFinite(i.amount) ? i.amount : libStr(i.amount == null ? '' : String(i.amount), 40), unit: libStr(i.unit, 40), name: libStr(i.name, 300) };
    const g = libStr(i.group, 100); if (g) o.group = g;
    if (i.isGroupHeader === true) o.isGroupHeader = true;
    return o;
  }).filter(i => i.name);
  const steps = (Array.isArray(j.steps) ? j.steps : []).slice(0, 200).map(s => ({ text: libStr(s && typeof s === 'object' ? s.text : s, 4000) })).filter(s => s.text);
  const src = j.source && typeof j.source === 'object' ? j.source : {};
  return {
    v: 1, title,
    servings: libInt(j.servings, 1, 10000),
    servingMode: j.servingMode === 'pieces' ? 'pieces' : 'portions',
    yieldLabel: libStr(j.yieldLabel, 40),
    timeMinutes: libInt(j.timeMinutes, 1, 100000),
    prepMinutes: libInt(j.prepMinutes, 1, 100000),
    cookMinutes: libInt(j.cookMinutes, 1, 100000),
    restMinutes: libInt(j.restMinutes, 1, 100000),
    difficulty: libStr(j.difficulty, 30),
    diet: (Array.isArray(j.diet) ? j.diet : []).filter(d => LIB_PUBLIC_DIETS.includes(d)),
    categories: (Array.isArray(j.categories) ? j.categories : []).filter(c => typeof c === 'string' && /^[a-z0-9-]{1,30}$/.test(c)).slice(0, 12),
    ingredients: ings, steps,
    tips: libStr(j.tips, 2000),
    source: { url: libSafeUrl(src.url), text: libStr(src.text, 200) },
  };
}
/* Privates Rezept -> oeffentlicher Entwurf. Felder werden einzeln aufgebaut; Notizen, Favorit, Kochverlauf, Sammlungen,
   Schlagwoerter, Naehrwert-Zuordnungen und Allergie-Angaben gehen nie mit. Tipps nur, wenn bewusst geschrieben. */
function libDraftFromRecipe(r, opts) {
  opts = opts || {};
  const conflicts = new Set((typeof dietConflicts === 'function' ? dietConflicts(r) : []).map(c => c.label));
  const knownCats = new Set([].concat(typeof MEAL_TYPE_OPTIONS !== 'undefined' ? MEAL_TYPE_OPTIONS : [], typeof DISH_TYPE_OPTIONS !== 'undefined' ? DISH_TYPE_OPTIONS : []).map(o => o.id));
  const pieces = r.servingMode === 'pieces';
  const ingredients = (Array.isArray(r.ingredients) ? r.ingredients : []).filter(i => i && typeof i === 'object' && String(i.name || '').trim()).map(i => {
    const o = { amount: typeof i.amount === 'number' && isFinite(i.amount) ? i.amount : String(i.amount == null ? '' : i.amount).trim().slice(0, 40), unit: String(i.unit || '').trim().slice(0, 40), name: String(i.name || '').trim().slice(0, 300) };
    const g = String(i.group || '').trim().slice(0, 100); if (g) o.group = g;
    if (i.isGroupHeader === true) o.isGroupHeader = true;
    return o;
  });
  const src = typeof r.source === 'string' ? r.source.trim() : '';
  const srcUrl = libSafeUrl(src);
  let diet = (r.diet || []).filter(d => LIB_PUBLIC_DIETS.includes(d) && !conflicts.has(d));
  if (diet.includes('vegan') && !diet.includes('vegetarisch')) diet = diet.concat('vegetarisch');   // vegan ist immer auch vegetarisch
  return {
    v: 1,
    title: String(r.title || '').trim().slice(0, 200),
    servings: typeof yieldKnown === 'function' && yieldKnown(r) ? libInt(r.servings, 1, 10000) : null,
    servingMode: pieces ? 'pieces' : 'portions',
    yieldLabel: pieces ? String(r.yieldLabel || '').trim().slice(0, 40) : '',
    timeMinutes: libInt(r.timeMinutes, 1, 100000),
    prepMinutes: libInt(r.prepMinutes, 1, 100000),
    cookMinutes: libInt(r.cookMinutes, 1, 100000),
    restMinutes: libInt(r.restMinutes, 1, 100000),
    difficulty: String(r.difficulty || '').trim().slice(0, 30),
    diet: Array.from(new Set(diet)),
    categories: (r.categoryTags || []).filter(c => knownCats.has(c)).slice(0, 12),
    ingredients,
    steps: (Array.isArray(r.steps) ? r.steps : []).map(s => ({ text: String(s && typeof s === 'object' ? s.text || '' : s || '').trim().slice(0, 4000) })).filter(s => s.text),
    tips: String(opts.tips || '').trim().slice(0, 2000),
    source: srcUrl ? { url: srcUrl, text: '' } : { url: '', text: src.slice(0, 200) },
  };
}
/* Pruefung vor dem Veroeffentlichen. Fehler sperren, Hinweise nicht. «Salz nach Geschmack» ist gueltig, unbekannte Zeit auch. */
function libValidateDraft(d, recipe) {
  const errors = [], warnings = [];
  if (!d || !d.title) errors.push({ field: 'title', message: 'Das Rezept braucht einen Titel.' });
  if (recipe && String(recipe.title || '').trim().length > 200) errors.push({ field: 'title', message: 'Der Titel ist zu lang (höchstens 200 Zeichen).' });
  if (!d || d.servings == null) errors.push({ field: 'servings', message: 'Gib an, wie viel das Rezept ergibt (Portionen oder Stück).' });
  const real = d ? d.ingredients.filter(i => !i.isGroupHeader && !(typeof isIngredientHeaderRow === 'function' && isIngredientHeaderRow(i))) : [];
  if (!real.length) errors.push({ field: 'ingredients', message: 'Füge mindestens eine Zutat hinzu.' });
  if (d && d.ingredients.length > 300) errors.push({ field: 'ingredients', message: 'Zu viele Zutaten (höchstens 300).' });
  if (!d || !d.steps.length) errors.push({ field: 'steps', message: 'Füge mindestens einen Zubereitungsschritt hinzu.' });
  if (d && d.steps.length > 200) errors.push({ field: 'steps', message: 'Zu viele Schritte (höchstens 200).' });
  if (recipe && (recipe.steps || []).some(s => String((s && s.text) || '').length > 4000)) errors.push({ field: 'steps', message: 'Ein Schritt ist zu lang (höchstens 4000 Zeichen). Teile ihn im Editor auf.' });
  if (recipe && (recipe.ingredients || []).some(i => i && String(i.name || '').length > 300)) errors.push({ field: 'ingredients', message: 'Eine Zutat ist zu lang (höchstens 300 Zeichen).' });
  if (d && d.tips.length >= 2000) warnings.push({ field: 'tips', message: 'Die Kochtipps wurden auf 2000 Zeichen gekürzt.' });
  if (d && d.timeMinutes == null) warnings.push({ field: 'time', message: 'Zeit unbekannt. Das ist erlaubt; das Rezept erscheint dann nicht im Filter «Bis 30 Min.».' });
  const missing = typeof qtyMissingIngredients === 'function' ? qtyMissingIngredients(real) : [];
  if (missing.length) warnings.push({ field: 'ingredients', message: missing.length === 1 ? '1 Zutat hat keine Mengenangabe.' : `${missing.length} Zutaten haben keine Mengenangabe.` });
  if (recipe && (recipe.diet || []).some(x => !LIB_PUBLIC_DIETS.includes(x))) warnings.push({ field: 'diet', message: 'Angaben wie glutenfrei, laktosefrei oder nussfrei werden nicht veröffentlicht.' });
  return { ok: !errors.length, errors, warnings };
}
/* Oeffentliche Veroeffentlichung -> lokales Rezept (ohne id und imageId). Gueltige Struktur bleibt erhalten. */
function libRecipeFromPublication(pub) {
  const p = libNormalizePublic(pub && pub.recipe);
  if (!p) return null;
  const author = (pub && pub.author) || {};
  const now = Date.now();
  const r = {
    title: p.title, image: null,
    servings: p.servings || 0, servingMode: p.servingMode, timeMinutes: p.timeMinutes,
    difficulty: p.difficulty, tags: [], diet: p.diet.slice(), categoryTags: p.categories.slice(), suppressedTags: [],
    ingredients: p.ingredients.map(i => Object.assign({}, i)), steps: p.steps.map(s => ({ text: s.text })),
    notes: '', favorite: false, source: p.source.url || p.source.text || null,
    createdAt: now, updatedAt: now, focalPoint: { x: 0.5, y: 0.5 },
    publicOrigin: {
      publicationId: pub.id,
      authorPublicId: LIB_PUBLIC_ID_RE.test(author.public_id || '') ? author.public_id : undefined,
      authorName: libStr(author.display_name, 40),
      savedVersion: libInt(pub.version, 1, 1e9) || 1,
      savedAt: now,
      url: libShareLink('recipe', pub.id),
      imagePending: false,
    },
  };
  if (p.servingMode === 'pieces' && p.yieldLabel) r.yieldLabel = p.yieldLabel;
  ['prepMinutes', 'cookMinutes', 'restMinutes'].forEach(k => { if (p[k]) r[k] = p[k]; });
  if (!r.publicOrigin.authorPublicId) delete r.publicOrigin.authorPublicId;
  if (p.tips) r.publicTips = p.tips;
  if (!r.ingredients.length) r.ingredients = [{ amount: '', unit: '', name: '' }];
  if (!r.steps.length) r.steps = [{ text: '' }];
  return r;
}

/* ---------- Bilder (signierte, kurzlebige Adressen) ---------- */
function libImgSrc(path) {
  const hit = path && lib.signed.get(path);
  return hit && hit.exp > Date.now() ? hit.url : '';
}
async function libSignedUrls(paths) {
  const out = new Map();
  const need = [];
  (paths || []).filter(p => typeof p === 'string' && p).forEach(p => {
    const hit = lib.signed.get(p);
    if (hit && hit.exp - 300000 > Date.now()) out.set(p, hit.url); else if (!need.includes(p)) need.push(p);
  });
  for (let i = 0; i < need.length; i += 50) {
    const chunk = need.slice(i, i + 50);
    const signedIn = typeof cloudSignedIn === 'function' && cloudSignedIn();
    let res;
    try { res = await cloudFetch(`/storage/v1/object/sign/${LIB_BUCKET}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 3600, paths: chunk }) }, signedIn); }
    catch (e) { if (signedIn && (e.status === 401 || e.status === 403)) res = await cloudFetch(`/storage/v1/object/sign/${LIB_BUCKET}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 3600, paths: chunk }) }, false); else throw e; }
    const list = await res.json();
    (Array.isArray(list) ? list : []).forEach(x => {
      if (!x || x.error || typeof x.signedURL !== 'string' || !/^\/object\/sign\//.test(x.signedURL)) return;
      const url = CLOUD_URL + '/storage/v1' + x.signedURL;
      lib.signed.set(x.path, { url, exp: Date.now() + 3500 * 1000 });
      out.set(x.path, url);
    });
  }
  return out;
}
function libPrefetchImages(paths, kind) {
  const missing = (paths || []).filter(p => p && !libImgSrc(p));
  if (!missing.length) return;
  libSignedUrls(missing).then(() => libRefresh(kind)).catch(() => { /* Bilder sind optional: Platzhalter bleibt */ });
}

/* ---------- Entdecken: Suche, Filter, Sortierung, Nachladen ---------- */
function libFilterPayload(f) {
  return { quick: !!f.quick, veg: !!f.veg, max_minutes: f.maxMinutes || null, diet: f.diet.slice(), categories: f.categories.slice() };
}
function libDiscoverKey() { const d = lib.discover; return JSON.stringify([libNorm(d.q), libFilterPayload(d.filters), d.sort]); }
function libIsOffline() { return typeof navigator !== 'undefined' && navigator.onLine === false; }
async function libSearch(opts) {
  opts = opts || {};
  const d = lib.discover;
  const key = libDiscoverKey();
  if (!opts.force && d.key === key && d.status === 'ready') return;
  const seq = ++d.seq;
  if (d.ctrl) { try { d.ctrl.abort(); } catch (e) {} }
  if (libIsOffline()) { d.status = 'offline'; d.items = d.key === key ? d.items : []; libRefresh('discover'); return; }
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  d.ctrl = ctrl;
  d.status = 'loading'; d.error = null; d.moreStatus = 'idle';
  libRefresh('discover');
  try {
    const res = await libApi('savora_lib_search', { p_query: d.q.trim().slice(0, 100), p_filters: libFilterPayload(d.filters), p_sort: d.sort, p_cursor: null, p_limit: LIB_PAGE }, { signal: ctrl && ctrl.signal });
    if (seq !== d.seq) return;   // veraltete Antwort verwerfen
    d.items = Array.isArray(res && res.items) ? res.items : [];
    d.cursor = res && res.next_cursor ? res.next_cursor : null;
    d.total = Number(res && res.total) || 0; d.capped = !!(res && res.total_capped);
    d.status = 'ready'; d.key = key;
    libPrefetchImages(d.items.map(c => c.thumb_path || c.image_path), 'discover');
  } catch (e) {
    if (seq !== d.seq || e.aborted) return;
    d.status = e.offline ? 'offline' : 'error'; d.error = libErrText(e);
  } finally { if (seq === d.seq) d.ctrl = null; }
  libRefresh('discover');
}
async function libLoadMore() {
  const d = lib.discover;
  if (!d.cursor || d.moreStatus === 'loading' || d.status !== 'ready') return;
  const seq = d.seq, key = d.key;
  d.moreStatus = 'loading'; libRefresh('discover');
  try {
    const res = await libApi('savora_lib_search', { p_query: d.q.trim().slice(0, 100), p_filters: libFilterPayload(d.filters), p_sort: d.sort, p_cursor: d.cursor, p_limit: LIB_PAGE });
    if (seq !== d.seq || key !== d.key) return;
    const seen = new Set(d.items.map(x => x.id));
    const fresh = (Array.isArray(res && res.items) ? res.items : []).filter(x => x && !seen.has(x.id));
    d.items = d.items.concat(fresh);
    d.cursor = res && res.next_cursor ? res.next_cursor : null;
    d.moreStatus = 'idle';
    libPrefetchImages(fresh.map(c => c.thumb_path || c.image_path), 'discover');
  } catch (e) {
    if (seq !== d.seq) return;
    d.moreStatus = 'error'; d.error = libErrText(e);   // sichtbare Ergebnisse bleiben
  }
  libRefresh('discover');
}
function libSetQuery(q) {
  lib.discover.q = String(q || '').slice(0, 100);
  clearTimeout(lib.discover.timer);
  lib.discover.timer = setTimeout(() => libSearch(), 250);
}
function libSetFilter(patch) { Object.assign(lib.discover.filters, patch || {}); libSearch(); }
function libSetFilters(f) { lib.discover.filters = Object.assign(libEmptyFilters(), f || {}); libSearch(); }
function libResetFilters() { lib.discover.filters = libEmptyFilters(); libSearch(); }
function libSetSort(s) { lib.discover.sort = s === 'quickest' ? 'quickest' : 'newest'; libSearch(); }
function libFilterLabel(kind, id) {
  if (kind === 'diet') { const o = (typeof DIET_OPTIONS !== 'undefined' ? DIET_OPTIONS : []).find(x => x.key === id); return o ? o.label : id; }
  if (kind === 'cat') { const o = [].concat(typeof MEAL_TYPE_OPTIONS !== 'undefined' ? MEAL_TYPE_OPTIONS : [], typeof DISH_TYPE_OPTIONS !== 'undefined' ? DISH_TYPE_OPTIONS : []).find(x => x.id === id); return o ? o.label : id; }
  return id;
}
function libFiltersActive() {
  const f = lib.discover.filters, out = [];
  if (f.quick) out.push({ key: 'quick', label: 'Bis 30 Min.' });
  if (f.veg) out.push({ key: 'veg', label: 'Vegetarisch' });
  if (f.maxMinutes) out.push({ key: 'max', label: `Bis ${f.maxMinutes} Min.` });
  f.diet.forEach(x => out.push({ key: 'diet:' + x, label: libFilterLabel('diet', x) }));
  f.categories.forEach(x => out.push({ key: 'cat:' + x, label: libFilterLabel('cat', x) }));
  return out;
}
function libRemoveFilter(key) {
  const f = lib.discover.filters;
  if (key === 'quick') f.quick = false;
  else if (key === 'veg') f.veg = false;
  else if (key === 'max') f.maxMinutes = null;
  else if (key.startsWith('diet:')) f.diet = f.diet.filter(x => x !== key.slice(5));
  else if (key.startsWith('cat:')) f.categories = f.categories.filter(x => x !== key.slice(4));
  libSearch();
}
function libEnterDiscover() {
  state.recipesTab = 'discover';
  if (lib.discover.status === 'idle' || (lib.discover.status === 'offline' && !libIsOffline())) setTimeout(() => libSearch({ force: true }), 0);
}

/* ---------- Detail und Profil ---------- */
async function libFetchPub(id, opts) {
  opts = opts || {};
  const hit = lib.cache.get(id);
  if (hit && !opts.fresh && Date.now() - hit.at < 120000) return hit.pub;
  const pub = await libApi('savora_lib_get', { p_id: id });
  if (pub && pub.id) lib.cache.set(id, { pub, at: Date.now() });
  else lib.cache.delete(id);
  return pub && pub.id ? pub : null;
}
function libOpenDetail(id, opts) {
  opts = opts || {};
  if (!LIB_UUID_RE.test(String(id || ''))) return;
  const sameId = lib.detail.id === id;
  lib.detail = { id, status: sameId && lib.detail.pub ? 'ready' : 'loading', pub: sameId ? lib.detail.pub : null, error: null };
  if (!opts.noRender) { state.modal = null; state.view = 'lib-detail'; render(); }
  libLoadDetail(id);
}
async function libLoadDetail(id) {
  const gen = lib.gen;
  if (libIsOffline()) { if (lib.detail.id === id && !lib.detail.pub) { lib.detail.status = 'offline'; libRefresh('detail'); } return; }
  try {
    const pub = await libFetchPub(id, { fresh: true });
    if (lib.detail.id !== id || gen !== lib.gen) return;
    if (!pub || !libNormalizePublic(pub.recipe)) { lib.detail.status = 'missing'; lib.detail.pub = null; }
    else { lib.detail.status = 'ready'; lib.detail.pub = pub; libPrefetchImages([pub.image_path, pub.author && pub.author.avatar_path], 'detail'); }
  } catch (e) {
    if (lib.detail.id !== id) return;
    if (!lib.detail.pub) { lib.detail.status = e.offline ? 'offline' : 'error'; lib.detail.error = libErrText(e); }
  }
  libRefresh('detail');
}
function libOpenProfile(publicId, opts) {
  opts = opts || {};
  if (!LIB_PUBLIC_ID_RE.test(String(publicId || ''))) return;
  const same = lib.profile.publicId === publicId && lib.profile.data;
  if (!same) lib.profile = { publicId, status: 'loading', data: null, items: [], cursor: null, moreStatus: 'idle' };
  if (!opts.noRender) { state.modal = null; state.view = 'lib-profile'; render(); }
  libLoadProfile(publicId, false);
}
async function libLoadProfile(publicId, more) {
  const p = lib.profile;
  if (libIsOffline()) { if (!p.data) { p.status = 'offline'; libRefresh('profile'); } return; }
  if (more) { if (!p.cursor || p.moreStatus === 'loading') return; p.moreStatus = 'loading'; libRefresh('profile'); }
  try {
    const res = await libApi('savora_lib_profile', { p_public_id: publicId, p_cursor: more ? p.cursor : null });
    if (lib.profile.publicId !== publicId) return;
    if (!res || !res.profile) { p.status = 'missing'; p.data = null; p.items = []; }
    else {
      p.data = res.profile; p.status = 'ready';
      const items = Array.isArray(res.items) ? res.items : [];
      if (more) { const seen = new Set(p.items.map(x => x.id)); p.items = p.items.concat(items.filter(x => !seen.has(x.id))); } else p.items = items;
      p.cursor = res.next_cursor || null; p.moreStatus = 'idle';
      libPrefetchImages(items.map(c => c.thumb_path || c.image_path).concat(res.profile.avatar_path || []), 'profile');
    }
  } catch (e) {
    if (lib.profile.publicId !== publicId) return;
    if (more) p.moreStatus = 'error'; else if (!p.data) p.status = e.offline ? 'offline' : 'error';
    p.error = libErrText(e);
  }
  libRefresh('profile');
}
function libLoadProfileMore() { if (lib.profile.publicId) libLoadProfile(lib.profile.publicId, true); }

/* ---------- Persoenliche Kopien ---------- */
function libCopiesOf(publicationId) {
  return (state.recipes || []).filter(r => r && r.publicOrigin && r.publicOrigin.publicationId === publicationId).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}
async function libFindCopyInDb(publicationId) {
  const all = await dbGetAll();
  return all.filter(r => r && r.publicOrigin && r.publicOrigin.publicationId === publicationId).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0] || null;
}
async function libEncode(blob, maxEdge, quality) {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  if (bmp.close) bmp.close();
  const toBlob = (type, q) => new Promise(res => c.toBlob(b => res(b), type, q));
  let out = await toBlob('image/webp', quality || 0.82);
  if (!out || out.type !== 'image/webp') out = await toBlob('image/jpeg', 0.85);   // Neukodierung entfernt Metadaten (EXIF, Ort)
  if (!out) throw libErr('Das Foto konnte nicht vorbereitet werden.');
  return { blob: out, ext: out.type === 'image/webp' ? 'webp' : 'jpg' };
}
async function libImportImage(path) {
  const urls = await libSignedUrls([path]);
  const url = urls.get(path);
  if (!url) throw libErr('Bild nicht verfügbar');
  let res;
  try { res = await fetch(url); } catch (e) { throw libErr('Keine Verbindung zum Internet.', { offline: true }); }
  if (!res.ok) throw libErr('Bild nicht verfügbar');
  const blob = await res.blob();
  if (!/^image\/(jpeg|webp|png)$/.test(blob.type || '')) throw libErr('Ungültiges Bild');
  const p = await processImageFile(blob);   // gleiche Grenzen und Ausrichtung wie eigene Fotos
  const imageId = uid();
  await dbPutImage({ id: imageId, blob: p.fullBlob, thumbBlob: p.thumbBlob, mime: p.mime });
  return imageId;
}
/* Zentrale Integration: oeffentliches Rezept -> vorhandene oder neue persoenliche Kopie -> lokale ID.
   Gleichzeitige Aufrufe im Tab werden zusammengefuehrt, zwischen Tabs schuetzt eine Sperre (Web Locks). */
function ensurePersonalRecipe(publicationId, opts) {
  opts = opts || {};
  if (!LIB_UUID_RE.test(String(publicationId || ''))) return Promise.reject(libErr('Ungültiges Rezept.'));
  if (!opts.forceNew && lib.saving.has(publicationId)) return lib.saving.get(publicationId);
  const run = async () => {
    if (!opts.forceNew) {
      const existing = await libFindCopyInDb(publicationId);
      if (existing) {
        if (!state.recipes.some(r => r.id === existing.id)) await loadRecipes();
        return { recipeId: existing.id, created: false, imageFailed: !!(existing.publicOrigin && existing.publicOrigin.imagePending) };
      }
    }
    const pub = await libFetchPub(publicationId, { fresh: true });
    if (!pub) throw libErr('Dieses Rezept ist nicht mehr öffentlich verfügbar.', { missing: true });
    const recipe = libRecipeFromPublication(pub);
    if (!recipe) throw libErr('Dieses Rezept ist nicht lesbar und wurde nicht gespeichert.');
    recipe.id = uid();
    let imageFailed = false;
    if (pub.image_path) {
      try { recipe.imageId = await libImportImage(pub.image_path); }
      catch (e) { imageFailed = true; recipe.publicOrigin.imagePending = true; }
    }
    const checked = validateRecipe(recipe);
    if (!checked.ok) throw libErr('Dieses Rezept ist nicht lesbar und wurde nicht gespeichert.');
    await dbPut(checked.recipe);
    await loadRecipes();
    return { recipeId: checked.recipe.id, created: true, imageFailed };
  };
  const locked = () => (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) ? navigator.locks.request('savora-lib-save-' + publicationId, run) : run();
  const p = locked().finally(() => { if (lib.saving.get(publicationId) === p) lib.saving.delete(publicationId); });
  if (!opts.forceNew) lib.saving.set(publicationId, p);
  return p;
}
function libSaveExtraCopy(publicationId) { return ensurePersonalRecipe(publicationId, { forceNew: true }); }
async function libRetryImage(recipeId) {
  const r = state.recipes.find(x => x.id === recipeId);
  if (!r || !r.publicOrigin) return false;
  const pub = await libFetchPub(r.publicOrigin.publicationId, { fresh: true });
  const next = Object.assign({}, r, { publicOrigin: Object.assign({}, r.publicOrigin, { imagePending: false }), updatedAt: Date.now() });
  if (pub && pub.image_path) next.imageId = await libImportImage(pub.image_path);
  await dbPut(next);
  await loadRecipes();
  return true;
}
/* Bewusstes Uebernehmen einer neuen Version: Inhalt wird ersetzt, persoenliches bleibt. Einkaufsposten bleiben unveraendert. */
const LIB_CONTENT_KEYS = ['title', 'servings', 'servingMode', 'yieldLabel', 'timeMinutes', 'prepMinutes', 'cookMinutes', 'restMinutes', 'difficulty', 'diet', 'categoryTags', 'ingredients', 'steps', 'source', 'publicTips'];
async function libUpdateCopy(recipeId, pub) {
  const r = state.recipes.find(x => x.id === recipeId);
  if (!r || !r.publicOrigin || !pub || r.publicOrigin.publicationId !== pub.id) throw libErr('Diese Kopie gehört nicht zu diesem Rezept.');
  const fresh = libRecipeFromPublication(pub);
  if (!fresh) throw libErr('Die neue Version ist nicht lesbar.');
  const next = Object.assign({}, r);
  LIB_CONTENT_KEYS.forEach(k => { if (fresh[k] === undefined) delete next[k]; else next[k] = fresh[k]; });
  next.publicOrigin = Object.assign({}, r.publicOrigin, { savedVersion: fresh.publicOrigin.savedVersion, savedAt: Date.now(), authorName: fresh.publicOrigin.authorName || r.publicOrigin.authorName, url: fresh.publicOrigin.url });
  next.updatedAt = Date.now();
  let imageFailed = false;
  if (pub.image_path) {
    try { next.imageId = await libImportImage(pub.image_path); next.publicOrigin.imagePending = false; }
    catch (e) { imageFailed = true; }   // bisheriges Bild bleibt
  }
  const checked = validateRecipe(next);
  if (!checked.ok) throw libErr('Die neue Version ist nicht lesbar.');
  await dbPut(checked.recipe);
  // Rezeptbezogene Zwischenstaende gezielt verwerfen (Inhalt hat sich geaendert)
  if (state.checkedIngredients) delete state.checkedIngredients[recipeId];
  try { if (typeof dbDeleteNutritionResult === 'function') await dbDeleteNutritionResult(recipeId); } catch (e) { /* Cache, wird neu berechnet */ }
  try { const cp = typeof loadCookProgress === 'function' ? loadCookProgress() : null; if (cp && cp.recipeId === recipeId) clearCookProgress(); } catch (e) {}
  if (r.imageId && r.imageId !== checked.recipe.imageId && !state.recipes.some(x => x.id !== recipeId && x.imageId === r.imageId)) { try { await dbDeleteImage(r.imageId); } catch (e) {} }
  await loadRecipes();
  return { recipeId, imageFailed };
}

/* ---------- Teilen, Links, Start ---------- */
function libShareLink(kind, id) {
  const base = typeof CLOUD_SITE_URL === 'string' ? CLOUD_SITE_URL : 'https://yaniske-ai.github.io/Savora/';
  return base + (kind === 'profile' ? '?profil=' : '?rezept=') + encodeURIComponent(id);
}
async function libCopyText(text, okMsg) {
  try { await navigator.clipboard.writeText(text); showToast(okMsg || 'Link kopiert'); return 'copied'; }
  catch (e) { window.prompt('Zum Kopieren markieren:', text); return 'prompt'; }
}
async function libShareNative(url, title) {
  if (navigator.share) {
    try { await navigator.share({ title: title || 'Savora', url }); return 'shared'; }
    catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }   // Abbrechen ist kein Fehler
  }
  return libCopyText(url, 'Link kopiert');
}
/* Direktaufruf ?rezept=<id> oder ?profil=<id>: Ansicht oeffnen (auch ohne Anmeldung). Andere Parameter (?freund=, Auth) bleiben. */
function libHandleStartLink() {
  try {
    const u = new URL(location.href);
    const rid = (u.searchParams.get('rezept') || '').toLowerCase();
    const pid = (u.searchParams.get('profil') || '').toLowerCase();
    if (LIB_UUID_RE.test(rid)) { state.view = 'lib-detail'; libOpenDetail(rid, { noRender: true }); return true; }
    if (LIB_PUBLIC_ID_RE.test(pid)) { state.view = 'lib-profile'; libOpenProfile(pid, { noRender: true }); return true; }
  } catch (e) { /* ungueltige Adresse */ }
  return false;
}
/* Adresse passend zur Ansicht (fuer Neuladen und Teilen). Nur die eigenen Parameter werden gesetzt oder entfernt. */
function libUrlFor(view) {
  try {
    const u = new URL(location.href);
    u.searchParams.delete('rezept'); u.searchParams.delete('profil');
    if (view === 'lib-detail' && lib.detail.id) u.searchParams.set('rezept', lib.detail.id);
    if (view === 'lib-profile' && lib.profile.publicId) u.searchParams.set('profil', lib.profile.publicId);
    const s = u.searchParams.toString();
    return u.pathname + (s ? '?' + s : '') + u.hash;
  } catch (e) { return undefined; }
}
function libHistoryFields() { return { recipesTab: state.recipesTab, libId: lib.detail.id, libProfile: lib.profile.publicId }; }
function libRestoreFromHistory(s) {
  if (!s) return;
  if (s.recipesTab) state.recipesTab = s.recipesTab;
  if (s.view === 'lib-detail' && s.libId && s.libId !== lib.detail.id) libOpenDetail(s.libId, { noRender: true });
  else if (s.view === 'lib-detail' && s.libId) libLoadDetail(s.libId);
  if (s.view === 'lib-profile' && s.libProfile && s.libProfile !== lib.profile.publicId) libOpenProfile(s.libProfile, { noRender: true });
  if (s.view === 'discover') libEnterDiscover();
}

/* ---------- Kontogebundene Entwuerfe (nur lokal, nie automatisch veroeffentlicht) ---------- */
function libDraftKey() { return 'savora-lib-drafts:' + ((typeof cloudUserId === 'function' && cloudUserId()) || 'local'); }
function libDraftAll() { const v = readJsonKey(libDraftKey(), {}); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function libDraftGet(recipeId) { return libDraftAll()[recipeId] || null; }
function libDraftSet(recipeId, patch) {
  const all = libDraftAll();
  all[recipeId] = Object.assign({}, all[recipeId] || {}, patch || {}, { updatedAt: Date.now() });
  writeJsonKey(libDraftKey(), all);
  return all[recipeId];
}
// Entwuerfe, die ohne Anmeldung begonnen wurden, gehen nach der Anmeldung nicht verloren (nur an dieses Konto, einmalig)
function libDraftAdoptLocal() {
  const localKey = 'savora-lib-drafts:local';
  const local = readJsonKey(localKey, null);
  if (!local || typeof local !== 'object' || !cloudUserId()) return;
  const all = libDraftAll();
  Object.keys(local).forEach(k => { if (!all[k]) all[k] = local[k]; });
  writeJsonKey(libDraftKey(), all);
  try { localStorage.removeItem(localKey); } catch (e) {}
}
function libDraftClear(recipeId) { const all = libDraftAll(); delete all[recipeId]; writeJsonKey(libDraftKey(), all); }

/* ---------- Veroeffentlichen und verwalten (nur angemeldet) ---------- */
function libRandHex(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return Array.from(a, b => b.toString(16).padStart(2, '0')).join(''); }
function libUuid() { return crypto.randomUUID ? crypto.randomUUID() : libRandHex(4) + '-' + libRandHex(2) + '-4' + libRandHex(2).slice(1) + '-a' + libRandHex(2).slice(1) + '-' + libRandHex(6); }
async function libUpload(path, blob) {
  try {
    await cloudFetch(`/storage/v1/object/${LIB_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`, { method: 'POST', headers: { 'Content-Type': blob.type, 'cache-control': '3600' }, body: blob });
  } catch (e) {
    // Gleicher Name schon vorhanden (Wiederholung nach Zeitueberschreitung): gilt als hochgeladen
    if (e.status === 409 || /exists|Duplicate/i.test(String(e.message || ''))) return;
    throw e;
  }
}
/* Ablauf: Bilder vorbereiten und hochladen, dann in EINEM Aufruf veroeffentlichen. Scheitert etwas, bleibt die bisherige
   Fassung (bzw. nichts) oeffentlich. Request-ID und Dateinamen bleiben fuer Wiederholungen gleich (keine Dubletten). */
async function libPublish(o) {
  const recipe = o.recipe, draft = o.draft;
  if (!cloudSignedIn()) throw libErr('Bitte melde dich an.', { needsLogin: true });
  if (libIsOffline()) throw libErr('Keine Verbindung zum Internet. Dein Rezept wurde nicht veröffentlicht.', { offline: true });
  const check = libValidateDraft(draft, recipe);
  if (!check.ok) throw libErr(check.errors[0].message);
  const gen = lib.gen, me = cloudUserId();
  const saved = libDraftGet(recipe.id) || {};
  const pubId = o.publicationId || (LIB_UUID_RE.test(saved.pendingPubId || '') ? saved.pendingPubId : libUuid());
  const requestId = saved.requestId && saved.requestFor === pubId + ':' + (o.expectedVersion || 0) ? saved.requestId : libUuid();
  libDraftSet(recipe.id, { pendingPubId: o.publicationId ? undefined : pubId, requestId, requestFor: pubId + ':' + (o.expectedVersion || 0) });
  let imagePath = null, thumbPath = null;
  if (o.includePhoto && recipe.imageId) {
    if (typeof o.onProgress === 'function') o.onProgress('image');
    const img = await dbGetImage(recipe.imageId);
    if (!img || !img.blob) throw libErr('Das Foto ist auf diesem Gerät nicht verfügbar. Veröffentliche ohne Foto oder lade das Foto zuerst.');
    const full = await libEncode(img.blob, 1600, 0.82), thumb = await libEncode(img.blob, 480, 0.78);
    const tag = requestId.replace(/-/g, '').slice(0, 12);
    imagePath = `${me}/${pubId}/full-${tag}.${full.ext}`; thumbPath = `${me}/${pubId}/thumb-${tag}.${thumb.ext}`;
    await libUpload(imagePath, full.blob);
    await libUpload(thumbPath, thumb.blob);
    if (gen !== lib.gen) throw libErr('Das Konto wurde gewechselt. Nichts wurde veröffentlicht.');
  }
  if (typeof o.onProgress === 'function') o.onProgress('publish');
  const res = await libApi('savora_pub_publish', {
    p_request_id: requestId, p_publication_id: pubId, p_expected_version: o.expectedVersion || null,
    p_recipe: draft, p_image_path: imagePath, p_thumb_path: thumbPath, p_source_local_id: String(recipe.id).slice(0, 120),
    p_terms_version: LIB_TERMS_VERSION, p_terms_accepted: o.termsAccepted === true,
  });
  if (gen !== lib.gen) throw libErr('Das Konto wurde gewechselt.');
  libDraftClear(recipe.id);
  lib.cache.delete(pubId);
  lib.discover.key = null;   // Entdecken beim naechsten Oeffnen frisch laden
  libLoadMine();
  return res;
}
async function libWithdraw(id) {
  const gen = lib.gen;
  const res = await libApi('savora_pub_withdraw', { p_id: id });
  if (gen !== lib.gen) return res;
  lib.cache.delete(id);
  lib.discover.items = lib.discover.items.filter(x => x.id !== id);
  lib.profile.items = lib.profile.items.filter(x => x.id !== id);
  if (lib.detail.id === id) { lib.detail.status = 'missing'; lib.detail.pub = null; }
  const m = lib.mine.items.find(x => x.id === id); if (m) m.status = 'withdrawn';
  libLoadMine();
  return res;
}
async function libLoadMine() {
  if (!cloudSignedIn()) { lib.mine = { status: 'signedout', items: [], error: null, loadedAt: 0 }; return; }
  const gen = lib.gen;
  if (lib.mine.status !== 'ready') lib.mine.status = 'loading';
  try {
    const items = await libApi('savora_pub_mine');
    if (gen !== lib.gen) return;
    lib.mine = { status: 'ready', items: Array.isArray(items) ? items : [], error: null, loadedAt: Date.now() };
    libPrefetchImages(lib.mine.items.map(x => x.thumb_path), 'mine');
  } catch (e) {
    if (gen !== lib.gen) return;
    lib.mine.error = libErrText(e);
    if (lib.mine.status !== 'ready') lib.mine.status = e.offline ? 'offline' : 'error';
  }
  libRefresh('mine');
}
// Veroeffentlichung zu einem eigenen Rezept (lokale ID): veroeffentlicht vor gesperrt vor zurueckgezogen
function libPublicationForRecipe(recipeId) {
  const rank = { published: 0, blocked: 1, withdrawn: 2 };
  return lib.mine.items.filter(x => x.source_local_id === recipeId).sort((a, b) => (rank[a.status] - rank[b.status]) || String(b.updated_at).localeCompare(String(a.updated_at)))[0] || null;
}
async function libLoadPubProfile() {
  if (!cloudSignedIn()) { lib.pubProfile = { status: 'signedout', data: undefined, error: null }; return null; }
  const gen = lib.gen;
  if (lib.pubProfile.status !== 'ready') lib.pubProfile.status = 'loading';
  try {
    const p = await libApi('savora_pub_profile_get');
    if (gen !== lib.gen) return null;
    lib.pubProfile = { status: 'ready', data: p || null, error: null };
    if (p && p.avatar_path) libPrefetchImages([p.avatar_path], 'pubprofile');
  } catch (e) {
    if (gen !== lib.gen) return null;
    lib.pubProfile.error = libErrText(e);
    if (lib.pubProfile.status !== 'ready') lib.pubProfile.status = e.offline ? 'offline' : 'error';
  }
  libRefresh('pubprofile');
  return lib.pubProfile.data;
}
async function libSavePubProfile(o) {
  const gen = lib.gen, me = cloudUserId();
  const cur = lib.pubProfile.data || {};
  let avatar = o.removeAvatar ? null : (cur.avatar_path || null);
  if (o.avatarBlob) {
    const enc = await libEncode(o.avatarBlob, 512, 0.8);
    avatar = `${me}/avatar-${libRandHex(6)}.${enc.ext}`;
    await libUpload(avatar, enc.blob);
  }
  const p = await libApi('savora_pub_profile_set', { p_name: String(o.name || '').trim(), p_bio: String(o.bio || '').trim(), p_avatar_path: avatar });
  if (gen !== lib.gen) throw libErr('Das Konto wurde gewechselt.');
  lib.pubProfile = { status: 'ready', data: p, error: null };
  if (p && p.avatar_path) libPrefetchImages([p.avatar_path], 'pubprofile');
  return p;
}
async function libDeletePubProfile() {
  await libApi('savora_pub_profile_delete');
  lib.pubProfile = { status: 'ready', data: null, error: null };
}
async function libReport(id, reason, comment) {
  return libApi('savora_lib_report', { p_id: id, p_reason: reason, p_comment: String(comment || '').trim().slice(0, 500) || null });
}
function libCanReport() { return typeof cloudSignedIn === 'function' && cloudSignedIn(); }

/* ---------- Moderation (Rechte prueft ausschliesslich der Server) ---------- */
async function libModCheck() {
  if (!cloudSignedIn()) { lib.mod.allowed = false; lib.mod.checked = true; return false; }
  const gen = lib.gen;
  try { const ok = await libApi('savora_mod_is'); if (gen === lib.gen) { lib.mod.allowed = ok === true; lib.mod.checked = true; } }
  catch (e) { /* bleibt verborgen */ }
  return lib.mod.allowed;
}
async function libModLoad(status) {
  const gen = lib.gen;
  lib.mod.filter = status || lib.mod.filter || 'open';
  lib.mod.status = 'loading'; libRefresh('mod');
  try {
    const rows = await libApi('savora_mod_reports', { p_status: lib.mod.filter });
    if (gen !== lib.gen) return;
    lib.mod.reports = Array.isArray(rows) ? rows : []; lib.mod.status = 'ready'; lib.mod.error = null;
  } catch (e) { if (gen === lib.gen) { lib.mod.status = 'error'; lib.mod.error = libErrText(e); } }
  libRefresh('mod');
}
async function libModAction(publicationId, action, note) { const r = await libApi('savora_mod_action', { p_publication_id: publicationId, p_action: action, p_note: note || null }); lib.cache.delete(publicationId); lib.discover.key = null; return r; }
async function libModCloseReport(reportId, note) { return libApi('savora_mod_close_report', { p_report_id: reportId, p_note: note || null }); }
async function libModBan(publicationId, banned, note) { return libApi('savora_mod_ban', { p_publication_id: publicationId, p_banned: !!banned, p_note: note || null }); }
async function libModPreview(publicationId) { return libApi('savora_mod_get', { p_id: publicationId }); }

/* ---------- Abmelden, Kontowechsel ---------- */
function libReset() {
  lib.gen++;
  lib.mine = { status: 'idle', items: [], error: null, loadedAt: 0 };
  lib.pubProfile = { status: 'idle', data: undefined, error: null };
  lib.mod = { allowed: false, checked: false, status: 'idle', reports: [], filter: 'open', error: null };
  lib.publish = null; lib.returnTo = null;
  lib.saving.clear();
  // Oeffentliche Lesedaten bleiben gueltig; signierte Bildadressen eines Kontos werden verworfen
  lib.signed.clear();
}
function libStartup() {
  if (cloudSignedIn()) setTimeout(() => { libLoadMine(); libLoadPubProfile(); libModCheck(); }, 2000);
  window.addEventListener('online', () => { if (state.view === 'discover' && lib.discover.status === 'offline') libSearch({ force: true }); if (state.view === 'lib-detail' && lib.detail.status === 'offline') libLoadDetail(lib.detail.id); });
  window.addEventListener('offline', () => { if (state.view === 'discover' && lib.discover.status !== 'ready') { lib.discover.status = 'offline'; libRefresh('discover'); } });
}
