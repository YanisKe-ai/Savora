/* ---------- Savora Organisation: eigene Sammlungen, Zuordnungen und «Passt dazu» (0.84) ----------
   Grundsaetze (siehe Vertrag v84):
   - Lokal in localStorage, kein IndexedDB-Upgrade. Vier Schluessel:
       savora-org-collections  { [colId]: { id, name, color, icon, order, createdAt, updatedAt, deleted } }
       savora-org-memberships  { ['colId|recipeId']: { c, r, updatedAt, deleted } }
       savora-org-links        { ['idA~idB']: { a, b, type:'pairing', note, createdAt, updatedAt, deleted } }   (a < b, reiner Stringvergleich)
       savora-org-meta         { v, clock, legacyAt, catchUpDone }
   - Jede Beziehung ist ein eigener Datensatz: Zuordnungen zweier Geraete zu verschiedenen Sammlungen bleiben beide erhalten.
   - Konfliktregel je Datensatz: hybride logische Uhr orgClock() = max(Date.now(), letzter bekannter Wert + 1).
     Fuer den Abgleich gilt client_updated_at = updatedAt * 2 + (aktiv ? 1 : 0): der spaetere Stand gewinnt,
     bei exakt gleicher Zeit gewinnt «Hinzufuegen» (deterministisch, vom Server-Trigger mit erzwungen).
   - Grabsteine (deleted:true) bleiben dauerhaft. Wiederbelebung nur durch eine neue bewusste Aktion.
   - Bestand: savora-collections ([{id,name}]) und recipe.collections werden GELESEN und idempotent uebernommen
     (Datensaetze mit updatedAt 1, jeder echte Stand gewinnt). Nichts wird geloescht, recipe.collections nie veraendert.
     savora-collections wird als Projektion der aktiven Sammlungen weiter GESCHRIEBEN (fuer aeltere App-Staende).
   - 'friends' ist eine Systemmarke im Rezept (Rezepte von Freunden), keine Nutzersammlung.
   - Nichts davon liegt im Rezeptobjekt: Bibliothek, Freunde-Versand und Einzelrezept-Export geben es nie weiter. */

const ORG_COLLECTIONS_KEY = 'savora-org-collections';
const ORG_MEMBERSHIPS_KEY = 'savora-org-memberships';
const ORG_LINKS_KEY = 'savora-org-links';
const ORG_META_KEY = 'savora-org-meta';
const ORG_LEGACY_KEY = 'savora-collections';   // = COLLECTIONS_KEY in recipe-model.js (Projektion fuer alte Geraete)
const ORG_FRIENDS_ID = 'friends';
const ORG_NAME_MAX = 60;
const ORG_NOTE_MAX = 200;
const ORG_ID_RE = /^[A-Za-z0-9_.:@-]{1,120}$/;
const ORG_KINDS = ['collection', 'membership', 'pairing'];

const ORG_COLORS = [
  { id: 'tomato', label: 'Tomate' },
  { id: 'sage', label: 'Salbei' },
  { id: 'mustard', label: 'Senf' },
  { id: 'plum', label: 'Pflaume' },
  { id: 'lake', label: 'See' },
  { id: 'earth', label: 'Erde' },
];
const ORG_ICONS = ['folder', 'heart', 'leaf', 'clock', 'timer', 'chef', 'pot', 'fish', 'apple', 'scale', 'sparkle', 'calendar', 'sun', 'book'];

const org = {
  cols: null, mems: null, links: null, meta: null,   // Zwischenspeicher der vier Schluessel (null = neu lesen)
  ver: 0,                                             // erhoeht sich bei jeder Aenderung
  idx: null, idxVer: -1,                              // abgeleitete Verzeichnisse
  legacySig: null,                                    // letzter Stand der Bestandsuebernahme
  undo: new Map(), undoSeq: 0,
  subs: new Set(), notifyQueued: false,
  batch: 0, dirty: new Set(), writeFailed: false,      // Sammelschreiben (viele Datensaetze, ein Schreibvorgang je Schluessel)
};

/* ---------- Speicher ---------- */
function orgReadKey(key, fallback) {
  try { const raw = localStorage.getItem(key); const v = raw ? JSON.parse(raw) : null; return v && typeof v === 'object' && !Array.isArray(v) ? v : fallback; } catch (e) { return fallback; }
}
function orgWriteKey(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
}
function orgLoad() {
  if (!org.cols) org.cols = orgReadKey(ORG_COLLECTIONS_KEY, {});
  if (!org.mems) org.mems = orgReadKey(ORG_MEMBERSHIPS_KEY, {});
  if (!org.links) org.links = orgReadKey(ORG_LINKS_KEY, {});
  if (!org.meta) org.meta = Object.assign({ v: 1, clock: 0, legacyAt: 0, catchUpDone: false }, orgReadKey(ORG_META_KEY, {}));
}
// Zwischenspeicher verwerfen (anderer Tab, Wiederherstellung, Tests). Liest beim naechsten Zugriff neu.
function orgReload() {
  org.cols = org.mems = org.links = org.meta = null;
  org.ver++; org.legacySig = null;
  orgNotify();
}
function orgSaveMeta() { orgLoad(); org.dirty.add('meta'); if (!org.batch) orgFlush(); }
function orgFlush() {
  orgLoad();
  let ok = true;
  org.dirty.forEach(k => {
    if (k === 'meta') ok = orgWriteKey(ORG_META_KEY, org.meta) && ok;
    else { ok = orgWriteKey(ORG_STORE[k].key, ORG_STORE[k].get()) && ok; if (k === 'collection') orgWriteProjection(); }
  });
  org.dirty.clear();
  if (!ok) org.writeFailed = true;
  return ok;
}
// Mehrere Aenderungen gesammelt schreiben (z. B. 200 Zuordnungen oder ein Abgleich). Verschachtelbar.
function orgBatch(fn) {
  org.batch++;
  try { return fn(); } finally { org.batch--; if (!org.batch) orgFlush(); }
}
function orgBatchBegin() { org.batch++; }
function orgBatchEnd() { if (org.batch > 0) org.batch--; if (!org.batch) orgFlush(); }
function orgMetaGet(name) { orgLoad(); return org.meta[name]; }
function orgMetaSet(name, value) { orgLoad(); org.meta[name] = value; orgSaveMeta(); }
const ORG_STORE = {
  collection: { key: ORG_COLLECTIONS_KEY, get: () => org.cols },
  membership: { key: ORG_MEMBERSHIPS_KEY, get: () => org.mems },
  pairing: { key: ORG_LINKS_KEY, get: () => org.links },
};
function orgStore(kind) { orgLoad(); return ORG_STORE[kind].get(); }
// Schreibt einen Datensatz. mark=true: fuer den Abgleich vormerken (nur bei echten lokalen Aenderungen).
function orgPut(kind, key, rec, mark) {
  orgLoad();
  const store = ORG_STORE[kind].get();
  store[key] = rec;
  org.dirty.add(kind);
  const ok = org.batch ? true : orgFlush();
  org.ver++;
  if (mark && typeof cloudMark === 'function') cloudMark(kind, key, !!rec.deleted, orgEnc(rec));
  orgNotify();
  return ok;
}

/* ---------- Uhr und Konfliktwert ---------- */
function orgClock() {
  orgLoad();
  const c = Math.max(Date.now(), (Number(org.meta.clock) || 0) + 1);
  org.meta.clock = c; orgSaveMeta();
  return c;
}
function orgSeeClock(c) { orgLoad(); if (Number.isFinite(c) && c > (Number(org.meta.clock) || 0)) { org.meta.clock = c; orgSaveMeta(); } }
function orgActive(rec) { return !!rec && !rec.deleted; }
function orgEnc(rec) { return rec ? (Number(rec.updatedAt) || 0) * 2 + (rec.deleted ? 0 : 1) : -1; }

/* ---------- Abonnement ---------- */
function orgOnChange(fn) { if (typeof fn === 'function') org.subs.add(fn); return () => org.subs.delete(fn); }
function orgNotify() {
  if (org.notifyQueued) return;
  org.notifyQueued = true;
  const run = () => { org.notifyQueued = false; org.subs.forEach(fn => { try { fn(); } catch (e) { console.warn('orgOnChange', e); } }); };
  if (typeof queueMicrotask === 'function') queueMicrotask(run); else Promise.resolve().then(run);
}
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e && [ORG_COLLECTIONS_KEY, ORG_MEMBERSHIPS_KEY, ORG_LINKS_KEY, ORG_META_KEY].includes(e.key)) orgReload();
  });
}

/* ---------- Namen und IDs ---------- */
function orgCleanName(name) { return String(name == null ? '' : name).replace(/\s+/g, ' ').trim(); }
function orgNameKey(name) { return orgCleanName(name).toLocaleLowerCase('de-CH'); }
function orgSlug(name) {
  const s = orgCleanName(name).toLocaleLowerCase('de-CH').replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/g, '');
  return s || 'sammlung';
}
function orgValidColor(c) { return ORG_COLORS.some(x => x.id === c) ? c : null; }
function orgValidIcon(i) { return ORG_ICONS.includes(i) ? i : null; }
function orgTimeFromId(id) {
  const m = /^(?:col|r)_([0-9a-z]{6,10})(?:_|$)/.exec(String(id || ''));
  if (!m) return null;
  const t = parseInt(m[1], 36);
  return t > 1262304000000 && t < 4102444800000 ? t : null;   // 2010 bis 2100
}
// Neue Sammlungs-ID aus dem Namen. Belegt (auch Grabstein mit anderem Namen) → Suffix -2, -3.
// Ein Grabstein mit GLEICHEM Namen wird wiederverwendet (zwei Geraete, die offline denselben Namen anlegen, treffen sich).
function orgNewCollectionId(name, opts = {}) {
  const base = 'col_' + orgSlug(name);
  const key = orgNameKey(name);
  const cols = orgStore('collection');
  for (let n = 1; n < 10000; n++) {
    const id = n === 1 ? base : `${base}-${n}`;
    const rec = cols[id];
    if (!rec) return id;
    if (!opts.freeOnly && rec.deleted && orgNameKey(rec.name) === key) return id;
  }
  return 'col_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function orgLinkKey(a, b) { a = String(a); b = String(b); return a < b ? `${a}~${b}` : `${b}~${a}`; }
function orgMemKey(c, r) { return `${c}|${r}`; }

/* ---------- Bestand uebernehmen (idempotent, nichts loeschen) ---------- */
function orgRecipes() { return (typeof state !== 'undefined' && state && Array.isArray(state.recipes)) ? state.recipes : []; }
function orgEnsureLegacy() {
  orgLoad();
  let raw = null; try { raw = localStorage.getItem(ORG_LEGACY_KEY); } catch (e) {}
  const recs = orgRecipes();
  const sig = org.legacySig;
  if (sig && sig.raw === raw && sig.recs === recs && sig.len === recs.length && sig.ver === org.ver) return;
  let changedCols = false, changedMems = false;
  // 1. Sammlungsliste (auch von aelteren Geraeten per Abgleich): nur unbekannte IDs ergaenzen.
  let list = []; try { list = JSON.parse(raw || '[]'); } catch (e) { list = []; }
  if (Array.isArray(list)) {
    const firstRun = !Object.keys(org.cols).length;
    let maxOrder = Object.values(org.cols).reduce((m, c) => Math.max(m, Number(c.order) || 0), -1);
    list.forEach((it, i) => {
      if (!it || typeof it !== 'object') return;
      const id = String(it.id || '');
      if (!ORG_ID_RE.test(id) || id === ORG_FRIENDS_ID || org.cols[id]) return;
      const name = orgCleanName(it.name).slice(0, ORG_NAME_MAX) || 'Sammlung';
      org.cols[id] = { id, name, color: orgValidColor(it.color), icon: orgValidIcon(it.icon), order: firstRun ? i : ++maxOrder, createdAt: orgTimeFromId(id), updatedAt: 1, deleted: false };
      if (firstRun) maxOrder = Math.max(maxOrder, i);
      changedCols = true;
    });
  }
  // 2. recipe.collections: Paare ohne jeden Datensatz (weder aktiv noch Grabstein) als Zuordnung uebernehmen.
  recs.forEach(r => {
    if (!r || !Array.isArray(r.collections) || !ORG_ID_RE.test(String(r.id || ''))) return;
    r.collections.forEach(c => {
      if (typeof c !== 'string' || c === ORG_FRIENDS_ID || !orgActive(org.cols[c])) return;
      const key = orgMemKey(c, r.id);
      if (org.mems[key]) return;
      org.mems[key] = { c, r: r.id, updatedAt: 1, deleted: false };
      changedMems = true;
    });
  });
  if (changedCols) org.dirty.add('collection');
  if (changedMems) org.dirty.add('membership');
  if ((changedCols || changedMems) && !org.batch) orgFlush();
  if (changedCols || changedMems) { org.ver++; orgNotify(); }
  if (!org.meta.legacyAt) { org.meta.legacyAt = Date.now(); orgSaveMeta(); }
  orgWriteProjection();
  try { raw = localStorage.getItem(ORG_LEGACY_KEY); } catch (e) {}
  org.legacySig = { raw, recs, len: recs.length, ver: org.ver };
}
// Projektion fuer aeltere App-Staende: nur aktive Sammlungen, in Nutzerreihenfolge. Nur schreiben, wenn sich etwas aendert
// (sonst Abgleich-Pingpong zwischen Geraeten).
function orgWriteProjection() {
  const list = orgSortedCollections().map(c => ({ id: c.id, name: c.name, color: c.color || null, icon: c.icon || null, order: c.order }));
  const text = JSON.stringify(list);
  let cur = null; try { cur = localStorage.getItem(ORG_LEGACY_KEY); } catch (e) {}
  if (cur === text) return;
  if (!list.length && (cur === null || cur === '[]')) return;
  try { localStorage.setItem(ORG_LEGACY_KEY, text); } catch (e) {}
  if (org.legacySig) org.legacySig.raw = text;
}

/* ---------- Verzeichnisse ---------- */
function orgSortedCollections() {
  orgLoad();
  return Object.values(org.cols).filter(orgActive).sort((a, b) => (a.order - b.order) || ((a.createdAt || 0) - (b.createdAt || 0)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
function orgIndex() {
  orgEnsureLegacy();
  if (org.idx && org.idxVer === org.ver) return org.idx;
  const cols = orgSortedCollections();
  const pos = new Map(cols.map((c, i) => [c.id, i]));
  const byRecipe = new Map(), byCol = new Map();
  cols.forEach(c => byCol.set(c.id, new Set()));
  Object.values(org.mems).forEach(m => {
    if (!orgActive(m) || !pos.has(m.c)) return;
    byCol.get(m.c).add(m.r);
    if (!byRecipe.has(m.r)) byRecipe.set(m.r, []);
    byRecipe.get(m.r).push(m.c);
  });
  byRecipe.forEach(list => list.sort((x, y) => pos.get(x) - pos.get(y)));
  const linksBy = new Map();
  Object.entries(org.links).forEach(([key, l]) => {
    if (!orgActive(l)) return;
    [[l.a, l.b], [l.b, l.a]].forEach(([x, y]) => { if (!linksBy.has(x)) linksBy.set(x, []); linksBy.get(x).push({ key, otherId: y, l }); });
  });
  org.idx = { cols, byRecipe, byCol, linksBy };
  org.idxVer = org.ver;
  return org.idx;
}
function orgExistingIds() {
  const recs = orgRecipes();
  if (org.exist && org.exist.recs === recs && org.exist.len === recs.length) return org.exist.set;
  const set = new Set(recs.map(r => r && r.id));
  org.exist = { recs, len: recs.length, set };
  return set;
}

/* ---------- Sammlungen: lesen ---------- */
function orgCollections() { return orgIndex().cols.map(c => Object.assign({}, c)); }
function orgCollection(id) { orgLoad(); const c = org.cols[id]; return orgActive(c) ? Object.assign({}, c) : null; }
function orgCollectionIdsOf(recipeId) { return (orgIndex().byRecipe.get(recipeId) || []).slice(); }
function orgRecipeIdsIn(colId) {
  const set = orgIndex().byCol.get(colId);
  if (!set) return new Set();
  const exist = orgExistingIds();
  return new Set([...set].filter(id => exist.has(id)));
}
function orgCounts() {
  const idx = orgIndex(); const exist = orgExistingIds(); const out = new Map();
  idx.cols.forEach(c => { let n = 0; idx.byCol.get(c.id).forEach(id => { if (exist.has(id)) n++; }); out.set(c.id, n); });
  return out;
}
function orgInNoCollection(recipe) {
  const id = recipe && typeof recipe === 'object' ? recipe.id : recipe;
  return !(orgIndex().byRecipe.get(id) || []).length;
}

/* ---------- Rueckgaengig ---------- */
function orgUndoBegin() { return { changes: [] }; }
function orgRemember(tx, kind, key) {
  if (tx.changes.some(c => c.kind === kind && c.key === key)) return;
  const prev = orgStore(kind)[key];
  tx.changes.push({ kind, key, prev: prev ? Object.assign({}, prev) : null });
}
function orgUndoCommit(tx) {
  if (!tx.changes.length) return null;
  const token = 'orgundo-' + (++org.undoSeq);
  org.undo.set(token, tx.changes);
  if (org.undo.size > 50) org.undo.delete(org.undo.keys().next().value);
  return token;
}
function orgUndoCount(token) { const c = org.undo.get(token); return c ? c.length : 0; }
// Stellt den Stand vor der Aktion wieder her (als neue Aenderung mit frischer Uhr, damit es auch auf anderen Geraeten gilt).
function orgUndo(token) {
  const changes = org.undo.get(token);
  if (!changes) return false;
  org.undo.delete(token);
  orgBatch(() => changes.slice().reverse().forEach(({ kind, key, prev }) => {
    const cur = orgStore(kind)[key];
    const at = orgClock();
    if (prev) orgPut(kind, key, Object.assign({}, prev, { updatedAt: at }), true);
    else if (cur && !cur.deleted) orgPut(kind, key, Object.assign({}, cur, { deleted: true, updatedAt: at }), true);
  }));
  return true;
}

/* ---------- Sammlungen: aendern ---------- */
function orgCheckName(name, exceptId) {
  const clean = orgCleanName(name);
  if (!clean) return { ok: false, error: 'empty' };
  if (clean.length > ORG_NAME_MAX) return { ok: false, error: 'too_long' };
  const key = orgNameKey(clean);
  const dup = orgSortedCollections().find(c => c.id !== exceptId && orgNameKey(c.name) === key);
  if (dup) return { ok: false, error: 'duplicate', existingId: dup.id };
  return { ok: true, name: clean };
}
function orgCreateCollection({ name, color, icon } = {}) {
  orgEnsureLegacy();
  const chk = orgCheckName(name);
  if (!chk.ok) return chk;
  const id = orgNewCollectionId(chk.name);
  const revived = !!org.cols[id];
  const at = orgClock();
  const maxOrder = orgSortedCollections().reduce((m, c) => Math.max(m, Number(c.order) || 0), -1);
  const ok = orgPut('collection', id, { id, name: chk.name, color: orgValidColor(color), icon: orgValidIcon(icon), order: Math.floor(maxOrder) + 1, createdAt: at, updatedAt: at, deleted: false }, true);
  if (!ok) return { ok: false, error: 'storage' };
  // Neu angelegt mit der ID einer frueher geloeschten gleichnamigen Sammlung: alte Zuordnungen nicht wiederbeleben.
  if (revived) orgBatch(() => Object.entries(org.mems).forEach(([key, m]) => { if (m.c === id && orgActive(m)) orgPut('membership', key, Object.assign({}, m, { deleted: true, updatedAt: orgClock() }), true); }));
  return { ok: true, id };
}
function orgUpdateCollection(id, patch = {}) {
  orgEnsureLegacy();
  const cur = org.cols[id];
  if (!orgActive(cur)) return { ok: false, error: 'not_found' };
  const next = Object.assign({}, cur);
  if (patch.name !== undefined) {
    const chk = orgCheckName(patch.name, id);
    if (!chk.ok) return chk;
    next.name = chk.name;
  }
  if (patch.color !== undefined) next.color = orgValidColor(patch.color);
  if (patch.icon !== undefined) next.icon = orgValidIcon(patch.icon);
  if (next.name === cur.name && next.color === cur.color && next.icon === cur.icon) return { ok: true, unchanged: true };
  next.updatedAt = orgClock();
  return orgPut('collection', id, next, true) ? { ok: true } : { ok: false, error: 'storage' };
}
// Verschiebt um eine Position. Nur der verschobene Datensatz aendert sich (Ordnungswert zwischen den neuen Nachbarn).
function orgMoveCollection(id, dir) {
  const list = orgSortedCollections();
  const i = list.findIndex(c => c.id === id);
  const j = i + (dir < 0 ? -1 : 1);
  if (i < 0 || j < 0 || j >= list.length) return false;
  const rest = list.filter(c => c.id !== id);
  const before = rest[j - 1], after = rest[j];
  let order;
  if (!before) order = after.order - 1;
  else if (!after) order = before.order + 1;
  else order = (before.order + after.order) / 2;
  if (!Number.isFinite(order) || (before && order <= before.order) || (after && order >= after.order)) {
    // Genauigkeit erschoepft: alle neu durchnummerieren (selten)
    rest.splice(j, 0, list[i]);
    orgBatch(() => rest.forEach((c, k) => { if (c.order !== k) orgPut('collection', c.id, Object.assign({}, org.cols[c.id], { order: k, updatedAt: orgClock() }), true); }));
    return true;
  }
  orgPut('collection', id, Object.assign({}, org.cols[id], { order, updatedAt: orgClock() }), true);
  return true;
}
// Grabstein; die Zuordnungen bleiben gespeichert, werden aber beim Lesen ausgeblendet (Rueckgaengig bringt alles zurueck).
function orgDeleteCollection(id) {
  orgEnsureLegacy();
  const cur = org.cols[id];
  if (!orgActive(cur)) return null;
  const tx = orgUndoBegin();
  orgRemember(tx, 'collection', id);
  orgPut('collection', id, Object.assign({}, cur, { deleted: true, updatedAt: orgClock() }), true);
  return orgUndoCommit(tx);
}

/* ---------- Zuordnungen ---------- */
function orgSetMem(tx, recipeId, colId, on) {
  const key = orgMemKey(colId, recipeId);
  const cur = org.mems[key];
  if (orgActive(cur) === !!on) return false;
  if (!on && !cur) return false;
  if (tx) orgRemember(tx, 'membership', key);
  orgPut('membership', key, { c: colId, r: recipeId, updatedAt: orgClock(), deleted: !on }, true);
  return true;
}
function orgSetMembership(recipeId, colId, on) {
  orgEnsureLegacy();
  if (!ORG_ID_RE.test(String(recipeId || '')) || !orgActive(org.cols[colId])) return null;
  const tx = orgUndoBegin();
  orgSetMem(tx, String(recipeId), colId, on);
  return orgUndoCommit(tx);
}
// Aendert nur die genannte Beziehung (Sammlung colId) fuer die genannten Rezepte. Andere Zuordnungen bleiben unberuehrt.
// Rueckgabe: Rueckgaengig-Token oder null, wenn sich nichts geaendert hat.
function orgApply(recipeIds, colId, mode) {
  orgEnsureLegacy();
  if (!orgActive(org.cols[colId]) || (mode !== 'add' && mode !== 'remove')) return null;
  const tx = orgUndoBegin();
  orgBatch(() => [...new Set(recipeIds || [])].forEach(rid => { if (ORG_ID_RE.test(String(rid || ''))) orgSetMem(tx, String(rid), colId, mode === 'add'); }));
  return orgUndoCommit(tx);
}

/* ---------- Verknuepfungen «Passt dazu» ---------- */
function orgLinkTargetStatus(id) {
  if (orgExistingIds().has(id)) return 'ok';
  const pending = (typeof state !== 'undefined' && state && state.pendingDeletes) || null;
  if (pending && pending.has && pending.has(id)) return 'gone';
  const signedIn = typeof cloudSignedIn === 'function' && cloudSignedIn();
  if (signedIn && typeof cloudMeta === 'function' && !cloudMeta()['recipe|' + id]) return 'pending';
  return 'gone';
}
function orgLinksOf(recipeId) {
  const list = (orgIndex().linksBy.get(recipeId) || []).map(({ key, otherId, l }) => ({ key, otherId, note: l.note || '', status: orgLinkTargetStatus(otherId), createdAt: l.createdAt || 0 }));
  const rank = { ok: 0, pending: 1, gone: 2 };
  return list.sort((x, y) => (rank[x.status] - rank[y.status]) || (x.createdAt - y.createdAt) || (x.key < y.key ? -1 : 1));
}
function orgCleanNote(note) { return String(note == null ? '' : note).replace(/\s+/g, ' ').trim().slice(0, ORG_NOTE_MAX); }
function orgLinkCreate(idA, idB, note) {
  orgLoad();
  idA = String(idA || ''); idB = String(idB || '');
  if (idA === idB) return { ok: false, error: 'self' };
  const exist = orgExistingIds();
  if (!ORG_ID_RE.test(idA) || !ORG_ID_RE.test(idB) || !exist.has(idA) || !exist.has(idB)) return { ok: false, error: 'missing' };
  const key = orgLinkKey(idA, idB);
  if (orgActive(org.links[key])) return { ok: false, error: 'exists', key };
  const [a, b] = key.split('~');
  const at = orgClock();
  const tx = orgUndoBegin(); orgRemember(tx, 'pairing', key);
  const ok = orgPut('pairing', key, { a, b, type: 'pairing', note: orgCleanNote(note), createdAt: at, updatedAt: at, deleted: false }, true);
  return ok ? { ok: true, key, undoToken: orgUndoCommit(tx) } : { ok: false, error: 'storage' };
}
function orgLinkNote(key, note) {
  orgLoad();
  const cur = org.links[key];
  if (!orgActive(cur)) return { ok: false, error: 'not_found' };
  const clean = orgCleanNote(note);
  if (clean === (cur.note || '')) return { ok: true, unchanged: true };
  return orgPut('pairing', key, Object.assign({}, cur, { note: clean, updatedAt: orgClock() }), true) ? { ok: true } : { ok: false, error: 'storage' };
}
function orgLinkRemove(key) {
  orgLoad();
  const cur = org.links[key];
  if (!orgActive(cur)) return null;
  const tx = orgUndoBegin(); orgRemember(tx, 'pairing', key);
  orgPut('pairing', key, Object.assign({}, cur, { deleted: true, updatedAt: orgClock() }), true);
  return orgUndoCommit(tx);
}

/* ---------- Sicherung ---------- */
// Nur aktive Daten (Grabsteine werden nicht gesichert). Zuordnungen nur zu aktiven Sammlungen.
function orgExport() {
  const idx = orgIndex();
  const active = new Set(idx.cols.map(c => c.id));
  return {
    v: 1,
    collections: idx.cols.map(c => ({ id: c.id, name: c.name, color: c.color || null, icon: c.icon || null, order: c.order, createdAt: c.createdAt || null })),
    memberships: Object.values(org.mems).filter(m => orgActive(m) && active.has(m.c)).map(m => ({ c: m.c, r: m.r })),
    links: Object.values(org.links).filter(orgActive).map(l => ({ a: l.a, b: l.b, note: l.note || '', createdAt: l.createdAt || null })),
  };
}
// Wiederherstellen mit ID-Abbildung. data: { collections, memberships?, links?, legacy? }
//   legacy = [{c, r}] aus recipes[].collections der Sicherung (Sicherungs-IDs). Fehlt data.memberships (alte Sicherung),
//   werden diese Paare als Zuordnungen uebernommen; sonst nur als «schon entschieden» vermerkt, damit die Bestandsuebernahme
//   veraltete recipe.collections nicht wiederbelebt.
// recipeIdMap: { altId: neueId } (oder Map); fehlende/null = Ziel fehlt bzw. mehrdeutig → ueberspringen und melden.
// Bestehende Grabsteine werden nicht wiederbelebt; wiederholtes Einspielen erzeugt keine Dubletten.
function orgImport(data, recipeIdMap, colIdMap) {
  orgLoad();
  // Zuerst: rohe Sammlungs-IDs der wiederhergestellten Rezepte als entschieden vermerken (lokal, Uhr 0, nie abgeglichen).
  // So uebernimmt die Bestandsuebernahme keine veralteten oder fremden Paare aus recipe.collections.
  const rmap = (id) => { const v = recipeIdMap instanceof Map ? recipeIdMap.get(id) : (recipeIdMap || {})[id]; return typeof v === 'string' && v ? v : null; };
  let suppressed = false;
  (data && Array.isArray(data.legacy) ? data.legacy : []).forEach(p => {
    if (!p || typeof p.c !== 'string' || typeof p.r !== 'string' || p.c === ORG_FRIENDS_ID) return;
    const r2 = rmap(p.r); if (!r2) return;
    const key = orgMemKey(p.c, r2);
    if (org.mems[key]) return;
    org.mems[key] = { c: p.c, r: r2, updatedAt: 0, deleted: true };
    suppressed = true;
  });
  if (suppressed) { org.dirty.add('membership'); org.ver++; if (!org.batch) orgFlush(); }
  orgEnsureLegacy();
  return orgBatch(() => orgImportInner(data, recipeIdMap, colIdMap));
}
function orgImportInner(data, recipeIdMap, colIdMap) {
  const rmap = (id) => { const v = recipeIdMap instanceof Map ? recipeIdMap.get(id) : (recipeIdMap || {})[id]; return typeof v === 'string' && v ? v : null; };
  const cmap = new Map(colIdMap instanceof Map ? colIdMap : Object.entries(colIdMap || {}));
  const rep = {
    collections: { added: 0, mapped: 0, invalid: 0 },
    memberships: { added: 0, existed: 0, missing: 0, removed: 0 },
    links: { added: 0, existed: 0, missing: 0, self: 0, removed: 0 },
    colIdMap: {},
  };
  const d = data && typeof data === 'object' ? data : {};
  // 1. Sammlungen
  (Array.isArray(d.collections) ? d.collections : []).forEach(c => {
    if (!c || typeof c !== 'object') { rep.collections.invalid++; return; }
    const id = String(c.id || '');
    const name = orgCleanName(c.name).slice(0, ORG_NAME_MAX);
    if (!ORG_ID_RE.test(id) || id === ORG_FRIENDS_ID || !name) { rep.collections.invalid++; return; }
    if (cmap.has(id) && orgActive(org.cols[cmap.get(id)])) { rep.collections.mapped++; return; }
    const key = orgNameKey(name);
    const local = org.cols[id];
    if (orgActive(local) && orgNameKey(local.name) === key) { cmap.set(id, id); rep.collections.mapped++; return; }
    const same = orgSortedCollections().find(x => orgNameKey(x.name) === key);
    if (same) { cmap.set(id, same.id); rep.collections.mapped++; return; }
    const newId = local ? orgNewCollectionId(name, { freeOnly: true }) : id;
    const at = orgClock();
    const maxOrder = orgSortedCollections().reduce((m, x) => Math.max(m, Number(x.order) || 0), -1);
    orgPut('collection', newId, { id: newId, name, color: orgValidColor(c.color), icon: orgValidIcon(c.icon), order: Math.floor(maxOrder) + 1, createdAt: Number(c.createdAt) || at, updatedAt: at, deleted: false }, true);
    cmap.set(id, newId); rep.collections.added++;
  });
  cmap.forEach((v, k) => { rep.colIdMap[k] = v; });
  // 2. Zuordnungen
  const legacy = (Array.isArray(d.legacy) ? d.legacy : []).filter(p => p && typeof p.c === 'string' && typeof p.r === 'string' && p.c !== ORG_FRIENDS_ID);
  const hasNew = Array.isArray(d.memberships);
  const addMem = (p) => {
    const c2 = cmap.get(p.c) || null, r2 = rmap(p.r);
    if (!c2 || !r2 || !orgActive(org.cols[c2])) { rep.memberships.missing++; return; }
    const key = orgMemKey(c2, r2); const cur = org.mems[key];
    if (orgActive(cur)) { rep.memberships.existed++; return; }
    if (cur && cur.updatedAt > 0) { rep.memberships.removed++; return; }   // bewusst entfernt: nicht wiederbeleben
    orgPut('membership', key, { c: c2, r: r2, updatedAt: orgClock(), deleted: false }, true);
    rep.memberships.added++;
  };
  const seen = new Set();
  (hasNew ? d.memberships : legacy).forEach(p => {
    if (!p || typeof p.c !== 'string' || typeof p.r !== 'string') return;
    const k = p.c + '|' + p.r; if (seen.has(k)) return; seen.add(k);
    addMem(p);
  });
  // 3. Verknuepfungen (beide Enden abbilden, danach neu kanonisieren)
  (Array.isArray(d.links) ? d.links : []).forEach(l => {
    if (!l || typeof l.a !== 'string' || typeof l.b !== 'string') { rep.links.missing++; return; }
    const a2 = rmap(l.a), b2 = rmap(l.b);
    if (!a2 || !b2) { rep.links.missing++; return; }
    if (a2 === b2) { rep.links.self++; return; }
    const key = orgLinkKey(a2, b2); const cur = org.links[key];
    const note = orgCleanNote(l.note);
    if (orgActive(cur)) {
      if (!cur.note && note) orgPut('pairing', key, Object.assign({}, cur, { note, updatedAt: orgClock() }), true);
      rep.links.existed++; return;
    }
    if (cur && cur.updatedAt > 0) { rep.links.removed++; return; }
    const [a, b] = key.split('~'); const at = orgClock();
    orgPut('pairing', key, { a, b, type: 'pairing', note, createdAt: Number(l.createdAt) || at, updatedAt: at, deleted: false }, true);
    rep.links.added++;
  });
  orgNotify();
  return rep;
}

/* ---------- Abgleich (fuer cloud.js) ---------- */
function orgSyncKinds() { return ORG_KINDS.slice(); }
// Lokaler Datensatz fuer den Upload (null = unbekannt).
function orgSyncRead(kind, id) {
  if (!ORG_STORE[kind]) return null;
  const rec = orgStore(kind)[id];
  return rec ? Object.assign({}, rec) : null;
}
function orgSyncLocalAt(kind, id) { return ORG_STORE[kind] ? orgEnc(orgStore(kind)[id]) : -1; }
// Alle lokalen Datensaetze fuer das erste Anmelden: [{kind, id, deleted, at}] (Uebernahmen mit Uhr <= 1 bleiben lokal).
function orgSyncAll() {
  orgEnsureLegacy();
  const out = [];
  ORG_KINDS.forEach(kind => Object.entries(orgStore(kind)).forEach(([id, rec]) => { if (rec && rec.updatedAt > 1) out.push({ kind, id, deleted: !!rec.deleted, at: orgEnc(rec) }); }));
  return out;
}
function orgSyncValidate(kind, id, data, deleted) {
  id = String(id || '');
  const d = data && typeof data === 'object' ? data : {};
  if (kind === 'collection') {
    if (!ORG_ID_RE.test(id) || id === ORG_FRIENDS_ID) return null;
    if (deleted) return { id, name: orgCleanName(d.name).slice(0, ORG_NAME_MAX), color: orgValidColor(d.color), icon: orgValidIcon(d.icon), order: Number.isFinite(d.order) ? d.order : 0, createdAt: Number(d.createdAt) || null, deleted: true };
    const name = orgCleanName(d.name);
    if (!name || name.length > ORG_NAME_MAX || (d.id !== undefined && d.id !== id)) return null;
    return { id, name, color: orgValidColor(d.color), icon: orgValidIcon(d.icon), order: Number.isFinite(d.order) ? d.order : 0, createdAt: Number(d.createdAt) || null, deleted: false };
  }
  if (kind === 'membership') {
    const parts = id.split('|');
    if (parts.length !== 2 || !ORG_ID_RE.test(parts[0]) || !ORG_ID_RE.test(parts[1]) || parts[0] === ORG_FRIENDS_ID) return null;
    if (!deleted && ((d.c !== undefined && d.c !== parts[0]) || (d.r !== undefined && d.r !== parts[1]))) return null;
    return { c: parts[0], r: parts[1], deleted: !!deleted };
  }
  if (kind === 'pairing') {
    const parts = id.split('~');
    if (parts.length !== 2 || !ORG_ID_RE.test(parts[0]) || !ORG_ID_RE.test(parts[1]) || !(parts[0] < parts[1])) return null;
    if (!deleted && ((d.a !== undefined && d.a !== parts[0]) || (d.b !== undefined && d.b !== parts[1]))) return null;
    if (d.note !== undefined && d.note !== null && typeof d.note !== 'string') return null;
    return { a: parts[0], b: parts[1], type: 'pairing', note: orgCleanNote(d.note), createdAt: Number(d.createdAt) || null, deleted: !!deleted };
  }
  return null;
}
// Fernstand uebernehmen. at = client_updated_at (Uhr * 2 + aktiv). Rueckgabe { applied, localNewer, invalid }.
function orgSyncApply(kind, id, data, deleted, at) {
  if (!ORG_STORE[kind]) return { applied: false, invalid: true };
  at = Number(at);
  if (!Number.isFinite(at) || at < 0) return { applied: false, invalid: true };
  const rec = orgSyncValidate(kind, id, data, deleted);
  if (!rec) return { applied: false, invalid: true };
  const store = orgStore(kind);
  const cur = store[id];
  const localEnc = orgEnc(cur);
  const clock = Math.floor(at / 2);
  orgSeeClock(clock);
  if (localEnc > at) return { applied: false, localNewer: true, localAt: localEnc };
  if (localEnc === at) return { applied: false };
  rec.updatedAt = clock;
  if (kind === 'collection' && rec.deleted && cur) {   // Grabstein ohne Daten: lokalen Namen behalten (fuer die ID-Regel)
    rec.name = rec.name || cur.name; rec.color = rec.color || cur.color || null; rec.icon = rec.icon || cur.icon || null;
    rec.order = Number.isFinite(cur.order) ? cur.order : rec.order; rec.createdAt = rec.createdAt || cur.createdAt || null;
  }
  if (kind === 'pairing' && cur) rec.createdAt = rec.createdAt || cur.createdAt || null;
  if (kind === 'pairing' && rec.deleted && cur && !rec.note) rec.note = cur.note || '';
  orgPut(kind, id, rec, false);
  return { applied: true };
}
