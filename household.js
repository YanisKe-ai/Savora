/* ---------- Savora 0.90: gemeinsame Haushaltsliste (Einkauf) ----------
   Grundsaetze:
   - Nur mit Konto und nur zwischen verbundenen Freunden (share.js). Server: supabase/paket48-haushalt.sql.
   - Die eigene Einkaufsliste (Store shopping) bleibt unangetastet. Ist die gemeinsame Liste gewaehlt, leitet diese Datei
     dbGetAllShopping/dbPutShopping/dbDeleteShopping auf die Stores householdItems und householdQueue um. Alle
     Aufrufer (Einkauf, Rezepte, Wochenplan) merken davon nichts. Die Originale stehen in hhOrig (cloud.js liest die
     eigene Liste fuer den persoenlichen Abgleich ueber hhOrig.dbGetAllShopping).
   - Abgleich: Abfrage alle 8 s, solange der Einkauf sichtbar ist, sonst alle 90 s, dazu bei online/sichtbar.
     Abzug mit 5 s Ueberlappung. Pro Eintrag gewinnt der neuere Stand (Server entscheidet, Gleichstand: Loeschen gewinnt).
     Lokal ausstehende Aenderungen werden nie von einem aelteren Abzug ueberschrieben.
   - Ende oder Verlassen: offene Eintraege wandern in die eigene Liste, mit Meldung.
   - Fehlt die Serverfunktion (404) oder fehlen die lokalen Stores, ist die Funktion unsichtbar. */

const HH_META_KEY = 'savora-hh';
const HH_STORE_ITEMS = 'householdItems';
const HH_STORE_QUEUE = 'householdQueue';
const HH_OVERLAP_MS = 5000;
const HH_FAST_MS = 8000;
const HH_SLOW_MS = 90 * 1000;
const HH_STATE_MS = 30 * 1000;
const HH_MAX_BYTES = 3900;   // Server: hoechstens 4000 Byte pro Eintrag
const hh = { state: null, unsupported: false, storesOk: null, storesPromise: null, syncing: false, again: false, timer: null,
  lastSync: 0, lastState: 0, error: null, offline: false, gen: 0, busy: false, dirty: false, lastOkAt: 0 };

/* ---------- Lokale Ablage ---------- */
function hhMeta() { const m = readJsonKey(HH_META_KEY, null); return m && typeof m === 'object' ? m : {}; }
function hhSetMeta(m) { writeJsonKey(HH_META_KEY, m); }
// Gemeinsame Liste gewaehlt (ohne Pruefung der Stores, synchron)?
function hhWanted() {
  if (hh.unsupported || hh.storesOk === false) return false;
  if (typeof cloudSignedIn !== 'function' || !cloudSignedIn()) return false;
  const m = hhMeta();
  return !!(m.id && m.uid === cloudUserId() && m.mode !== 'own');
}
function hhMember() { const m = hhMeta(); return !!(m.id && typeof cloudSignedIn === 'function' && cloudSignedIn() && m.uid === cloudUserId()); }
function hhAvailable() { return !hh.unsupported && hh.storesOk !== false && typeof cloudSignedIn === 'function' && cloudSignedIn(); }

// Prueft einmal, ob db.js die Stores householdItems und householdQueue anlegt (ab DB_VERSION 6, H1).
function hhStoresReady() {
  if (hh.storesOk !== null) return Promise.resolve(hh.storesOk);
  if (!hh.storesPromise) {
    hh.storesPromise = openDB().then(db => { hh.storesOk = db.objectStoreNames.contains(HH_STORE_ITEMS) && db.objectStoreNames.contains(HH_STORE_QUEUE); return hh.storesOk; })
      .catch(() => { hh.storesPromise = null; return false; });
  }
  return hh.storesPromise;
}
// Transaktion ueber einen oder mehrere eigene Stores; fehlt ein Store, gibt es einen sauberen Fehler (hhNoStore).
async function hhDbTx(stores, mode) {
  const list = [].concat(stores);
  const db = await openDB();
  if (!list.every(s => db.objectStoreNames.contains(s))) { hh.storesOk = false; throw Object.assign(new Error('Speicher für die gemeinsame Liste fehlt.'), { hhNoStore: true }); }
  return db.transaction(list, mode || 'readonly');
}
function hhTxDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => {
      const e = tx.error || new Error('Speichern fehlgeschlagen.');
      if (e && e.name === 'QuotaExceededError' && typeof storageFullWarn === 'function') storageFullWarn('household');
      reject(e);
    };
  });
}
function hhReq(req) { return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
async function hhAllRecords(store, hid) {
  const tx = await hhDbTx(store, 'readonly');
  const all = await hhReq(tx.objectStore(store).getAll());
  return (all || []).filter(r => r && r.hh === hid);
}
async function hhItemsLive(hid) { return (await hhAllRecords(HH_STORE_ITEMS, hid)).filter(r => !r.deleted && r.data).map(r => r.data); }
async function hhClearLocal(hid) {
  const tx = await hhDbTx([HH_STORE_ITEMS, HH_STORE_QUEUE], 'readwrite');
  const done = hhTxDone(tx);
  for (const s of [HH_STORE_ITEMS, HH_STORE_QUEUE]) {
    const store = tx.objectStore(s);
    const all = await hhReq(store.getAll());
    (all || []).forEach(r => { if (!hid || r.hh === hid) store.delete(r.id); });
  }
  await done;
}
// Eine lokale Aenderung schreiben und zum Senden vormerken (eine Transaktion fuer beide Stores).
async function hhWrite(id, data, deleted) {
  const hid = hhMeta().id;
  const at = Date.now();
  const tx = await hhDbTx([HH_STORE_ITEMS, HH_STORE_QUEUE], 'readwrite');
  tx.objectStore(HH_STORE_ITEMS).put({ id: String(id), hh: hid, data: deleted ? null : JSON.parse(JSON.stringify(data)), deleted: !!deleted, at });
  tx.objectStore(HH_STORE_QUEUE).put({ id: String(id), hh: hid, at });
  await hhTxDone(tx);
  hhSchedule(1200);
}

/* ---------- Umleitung der Einkaufslisten-Funktionen ---------- */
const hhOrig = { dbGetAllShopping: window.dbGetAllShopping, dbPutShopping: window.dbPutShopping, dbDeleteShopping: window.dbDeleteShopping };
window.dbGetAllShopping = async function () {
  if (hhWanted() && await hhStoresReady()) return hhItemsLive(hhMeta().id);
  return hhOrig.dbGetAllShopping.apply(this, arguments);
};
window.dbPutShopping = async function (item) {
  if (hhWanted() && await hhStoresReady() && item && item.id !== undefined) { await hhWrite(item.id, item, false); return item; }
  return hhOrig.dbPutShopping.apply(this, arguments);
};
window.dbDeleteShopping = async function (id) {
  if (hhWanted() && await hhStoresReady()) { await hhWrite(id, null, true); return; }
  return hhOrig.dbDeleteShopping.apply(this, arguments);
};

/* ---------- Server ---------- */
async function hhRpc(name, args) {
  try {
    const res = await cloudFetch('/rest/v1/rpc/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args || {}) });
    const txt = await res.text();
    hh.offline = false;
    return txt ? JSON.parse(txt) : null;
  } catch (e) {
    if (e && e.status === 404) { hh.unsupported = true; hhStop(); }   // Paket 48 nicht eingespielt: Funktion ausblenden
    if (e && e.offline) hh.offline = true;
    throw e;
  }
}
function hhErrText(e) { return e && e.offline ? 'Keine Verbindung zum Internet.' : (e && e.message) || 'Das hat nicht geklappt. Bitte nochmals versuchen.'; }

// Eintrag fuer den Server kuerzen: zu viele Quellen (viele Rezepte zusammengefuehrt) zuerst, sonst null (bleibt lokal).
function hhRowData(data) {
  if (!data) return null;
  let d = data;
  if (JSON.stringify(d).length > HH_MAX_BYTES && Array.isArray(d.sources)) d = Object.assign({}, d, { sources: d.sources.slice(0, 5) });
  if (new TextEncoder().encode(JSON.stringify(d)).length > HH_MAX_BYTES) return null;
  return d;
}
async function hhPush(hid) {
  for (let round = 0; round < 10; round++) {
    const queue = (await hhAllRecords(HH_STORE_QUEUE, hid)).sort((a, b) => a.at - b.at).slice(0, 200);
    if (!queue.length) return;
    const items = new Map((await hhAllRecords(HH_STORE_ITEMS, hid)).map(r => [r.id, r]));
    const rows = [];
    const skipped = [];
    queue.forEach(q => {
      const r = items.get(q.id);
      if (!r) { skipped.push(q); return; }
      if (r.deleted) { rows.push({ id: q.id, data: null, deleted: true, client_updated_at: q.at }); return; }
      const data = hhRowData(r.data);
      if (!data) { skipped.push(q); return; }
      rows.push({ id: q.id, data, deleted: false, client_updated_at: q.at });
    });
    if (rows.length) await hhRpc('savora_hh_push', { p_household: hid, p_rows: rows });
    // Gesendetes aus der Warteschlange nehmen, aber nur, wenn es seither nicht nochmals geaendert wurde
    const tx = await hhDbTx([HH_STORE_QUEUE, HH_STORE_ITEMS], 'readwrite');
    const done = hhTxDone(tx);
    const qs = tx.objectStore(HH_STORE_QUEUE), is = tx.objectStore(HH_STORE_ITEMS);
    for (const q of queue) {
      const cur = await hhReq(qs.get(q.id));
      if (cur && cur.at === q.at) {
        qs.delete(q.id);
        const it = items.get(q.id);
        if (it && it.deleted && it.at === q.at) is.delete(q.id);   // Grabstein ist beim Server angekommen
      }
    }
    await done;
    if (queue.length < 200) return;
  }
}
async function hhPull(hid) {
  const meta = hhMeta();
  const initial = !meta.cursor;
  const since = initial ? null : new Date(Date.parse(meta.cursor) - HH_OVERLAP_MS).toISOString();
  const res = await hhRpc('savora_hh_pull', { p_household: hid, p_since: since });
  if (hhMeta().id !== hid) return 0;   // inzwischen verlassen
  const rows = (res && Array.isArray(res.rows)) ? res.rows : [];
  const tx = await hhDbTx([HH_STORE_ITEMS, HH_STORE_QUEUE], 'readwrite');
  const done = hhTxDone(tx);
  const is = tx.objectStore(HH_STORE_ITEMS), qs = tx.objectStore(HH_STORE_QUEUE);
  let changed = 0, maxSrv = meta.cursor || null;
  const seen = new Set();
  for (const row of rows) {
    if (!row || typeof row.id !== 'string') continue;
    seen.add(row.id);
    if (!maxSrv || Date.parse(row.server_updated_at) > Date.parse(maxSrv)) maxSrv = row.server_updated_at;
    const cu = Number(row.client_updated_at) || 0;
    const q = await hhReq(qs.get(row.id));
    const local = await hhReq(is.get(row.id));
    if (q && q.hh === hid) {
      const localDeleted = !!(local && local.deleted);
      if (q.at > cu || (q.at === cu && localDeleted && !row.deleted)) continue;   // eigene, neuere Aenderung wartet: behalten
      qs.delete(row.id);
    }
    if (local && local.hh === hid && local.at === cu && !!local.deleted === !!row.deleted) continue;   // schon bekannt (Ueberlappung)
    if (row.deleted) { if (local) { is.delete(row.id); changed++; } continue; }
    if (!row.data || typeof row.data !== 'object') continue;
    const data = Object.assign({}, row.data, { id: row.id });
    is.put({ id: row.id, hh: hid, data, deleted: false, at: cu });
    changed++;
  }
  if (initial) {   // erster Abzug: lokale Reste ohne Server-Gegenstueck und ohne ausstehende Aenderung entfernen
    const all = await hhReq(is.getAll());
    for (const r of (all || [])) {
      if (r.hh !== hid || seen.has(r.id)) continue;
      const q = await hhReq(qs.get(r.id));
      if (!q) { is.delete(r.id); changed++; }
    }
  }
  await done;
  const m = hhMeta();
  if (m.id === hid) { m.cursor = maxSrv || (res && res.server_time) || null; hhSetMeta(m); }
  return changed;
}

/* ---------- Zustand und Abgleich ---------- */
async function hhRefreshState() {
  const gen = hh.gen;
  const res = await hhRpc('savora_hh_state');
  if (gen !== hh.gen) return;
  hh.lastState = Date.now();
  await hhApplyState(res);
}
// Server-Zustand uebernehmen: Kontowechsel, Beitritt, Ende erkennen.
async function hhApplyState(res, opts) {
  opts = opts || {};
  const before = JSON.stringify(hh.state);
  hh.state = res && typeof res === 'object' ? res : { household: null, invites: [] };
  let switched = false;
  const uidNow = cloudUserId();
  let meta = hhMeta();
  if (meta.uid && meta.uid !== uidNow) {   // anderes Konto auf diesem Geraet: fremde Liste still entfernen, nichts uebernehmen
    if (meta.id) { try { await hhClearLocal(meta.id); } catch (e) {} }
    meta = {};
  }
  meta.uid = uidNow;
  hhSetMeta(meta);
  const sh = hh.state.household;
  const sid = sh ? sh.id : null;
  if (meta.id && meta.id !== sid) { await hhEndLocal(meta.id, opts.left ? 'left' : 'ended'); meta = hhMeta(); switched = true; }
  if (sid && meta.id !== sid) {
    meta.id = sid; meta.cursor = null; meta.mode = 'household';
    hhSetMeta(meta);
    if (await hhStoresReady()) { try { await hhClearLocal(sid); } catch (e) {} }
    await hhAfterListSwitch();
    switched = true;
  }
  if (!switched && JSON.stringify(hh.state) !== before) hhRerender();   // nur bei echter Aenderung neu zeichnen
}
// Ende (aufgeloest, entfernt) oder Verlassen: offene Eintraege in die eigene Liste uebernehmen, dann lokal aufraeumen.
async function hhEndLocal(hid, why) {
  let moved = 0;
  try {
    if (await hhStoresReady()) {
      const items = (await hhItemsLive(hid)).filter(i => i && !i.checked && (i.name || '').trim());
      const own = await hhOrig.dbGetAllShopping();
      const key = i => [(i.name || '').trim().toLowerCase(), String(i.amount || ''), String(i.amountMax || ''), (i.unit || '').trim().toLowerCase()].join('|');
      const have = new Set(own.filter(i => !i.checked).map(key));
      for (const it of items) {
        if (have.has(key(it))) continue;
        const copy = Object.assign({}, it, { id: uid(), createdAt: Date.now() });
        await hhOrig.dbPutShopping(copy);
        have.add(key(it)); moved++;
      }
      await hhClearLocal(hid);
    }
  } catch (e) { /* Uebernahme ist ein Zusatz: die eigene Liste bleibt in jedem Fall unberuehrt */ }
  const m = hhMeta();
  if (m.id === hid) { m.id = null; m.cursor = null; m.mode = 'own'; hhSetMeta(m); }
  await hhAfterListSwitch();
  const tail = moved ? (moved === 1 ? ' 1 offener Eintrag ist jetzt in deiner Liste.' : ` ${moved} offene Einträge sind jetzt in deiner Liste.`) : '';
  if (typeof showToast === 'function') showToast((why === 'left' ? 'Du hast die gemeinsame Liste verlassen.' : 'Die gemeinsame Liste wurde beendet.') + tail, 'info');
  return moved;
}
async function hhAfterListSwitch() {
  if (typeof loadShopping === 'function') { try { await loadShopping(); } catch (e) {} }
  if (state.shopStay) state.shopStay.clear();
  hhRerender(true);
}
function hhShoppingVisible() { return typeof state !== 'undefined' && state.view === 'shopping' && document.visibilityState === 'visible'; }
function hhRerender(force) {
  if (typeof render !== 'function' || typeof state === 'undefined') return;
  const views = ['shopping', 'friends', 'settings-share', 'more'];
  if (!views.includes(state.view || '')) return;
  if (state.modal && !force) return;
  if (state.modal && state.view === 'shopping') { hh.dirty = true; return; }   // nie ein offenes Fenster wegzeichnen
  const a = document.activeElement;
  if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) { hh.dirty = true; return; }
  hh.dirty = false;
  render();
}
document.addEventListener('focusout', () => { if (hh.dirty) setTimeout(() => hhRerender(), 150); });

async function hhSync(opts) {
  opts = opts || {};
  if (!hhAvailable()) return { ok: false };
  if (hh.syncing) { hh.again = true; return { ok: false, busy: true }; }
  hh.syncing = true;
  const gen = hh.gen;
  let changed = 0;
  try {
    if (opts.state || !hhMember() || Date.now() - hh.lastState > HH_STATE_MS) await hhRefreshState();
    if (gen !== hh.gen) return { ok: false };
    const m = hhMeta();
    const sh = hh.state && hh.state.household;
    if (m.id && sh && sh.id === m.id && sh.active && await hhStoresReady()) {
      await hhPush(m.id);
      changed = await hhPull(m.id);
      hh.lastOkAt = Date.now();
    }
    hh.error = null;
  } catch (e) {
    hh.error = hh.unsupported ? null : hhErrText(e);
    if (e && /Kein Zugriff/.test(e.message || '')) hh.lastState = 0;   // pausiert oder entfernt: Zustand gleich neu holen
  } finally {
    hh.syncing = false; hh.lastSync = Date.now();
  }
  if (changed && hhWanted() && gen === hh.gen) {
    if (typeof loadShopping === 'function') await loadShopping();
    hhRerender();
  } else if (state.view === 'shopping') hhUpdateStatus();
  if (hh.again) { hh.again = false; setTimeout(() => hhSync(), 300); }
  return { ok: !hh.error, changed };
}
function hhUpdateStatus() {
  const el = document.getElementById('hhStatus');
  if (el) el.textContent = hhStatusText();
}
function hhSchedule(delay) {
  clearTimeout(hh.timer);
  if (hh.unsupported) return;
  hh.timer = setTimeout(hhTick, delay === undefined ? HH_FAST_MS : delay);
}
function hhStop() { clearTimeout(hh.timer); hh.timer = null; }
// Ein Takt alle 8 s; gearbeitet wird alle 8 s, solange der Einkauf sichtbar ist, sonst alle 90 s.
async function hhTick() {
  try {
    if (hhAvailable() && document.visibilityState === 'visible') {
      const due = hhShoppingVisible() ? HH_FAST_MS : HH_SLOW_MS;
      if (Date.now() - hh.lastSync >= due - 500) await hhSync();
    }
  } finally { hhSchedule(HH_FAST_MS); }
}
function hhReset() {
  hh.gen++; hh.state = null; hh.error = null; hh.lastState = 0; hh.lastSync = 0; hh.syncing = false; hh.again = false;
}
function hhStartup() {
  hhStoresReady();
  if (hhAvailable()) setTimeout(() => hhSync({ state: true }), 1800);
  hhSchedule(HH_FAST_MS);
}
window.addEventListener('online', () => { if (hhAvailable()) setTimeout(() => hhSync(), 400); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && hhAvailable()) setTimeout(() => hhSync(), 700); });
if (document.readyState === 'complete') setTimeout(hhStartup, 0); else window.addEventListener('load', () => setTimeout(hhStartup, 0));

/* ---------- Oberflaeche ---------- */
function hhName(x) { return x.display_name || '@' + x.handle; }
function hhOthers() {
  const sh = hh.state && hh.state.household;
  return sh ? (sh.members || []).filter(x => !x.is_me) : [];
}
function hhInvites() { return (hh.state && Array.isArray(hh.state.invites)) ? hh.state.invites : []; }
function hhInviteCount() { return hhAvailable() && !hhMember() ? hhInvites().length : 0; }
function hhStatusText() {
  const sh = hh.state && hh.state.household;
  if (sh && !sh.active) return 'Pausiert: Nicht mehr alle Personen sind miteinander verbunden. Änderungen bleiben auf diesem Gerät.';
  if (hh.offline) return 'Offline. Änderungen werden abgeglichen, sobald du wieder Internet hast.';
  if (hh.error) return hh.error;
  if (!hh.lastOkAt) return 'Wird abgeglichen …';
  return 'Abgeglichen um ' + new Date(hh.lastOkAt).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
}
function hhInviteRowHtml(inv) {
  const who = inv.from_name || (inv.from_handle ? '@' + inv.from_handle : 'Jemand');
  const n = Number(inv.members) || 1;
  return `<li class="hh-invite">
    <div class="hh-invite-text"><span><strong>${escapeHtml(who)}</strong> lädt dich zur gemeinsamen Einkaufsliste ein.</span><span class="tl-sub">${n === 1 ? '1 Person' : `${n} Personen`} · Deine eigene Liste bleibt erhalten.</span></div>
    <div class="hh-invite-actions">
      <button type="button" class="primary-btn primary-btn--small" data-action="hh-accept" data-id="${escapeAttr(inv.household_id)}" aria-label="Einladung von ${escapeAttr(who)} annehmen">Annehmen</button>
      <button type="button" class="ghost-btn primary-btn--small" data-action="hh-decline" data-id="${escapeAttr(inv.household_id)}" aria-label="Einladung von ${escapeAttr(who)} ablehnen">Ablehnen</button>
    </div></li>`;
}
// Einladungen fuer den Reiter «Empfangen» (share.js).
function hhInboxHtml() {
  if (!hhAvailable() || hhMember()) return '';
  const inv = hhInvites();
  if (!inv.length) return '';
  return `<section class="fr-sec hh-inbox" aria-labelledby="fr-h-hh"><h2 class="tl-h" id="fr-h-hh">Gemeinsame Einkaufsliste<span class="tl-badge" aria-label="${inv.length} neu">${inv.length}</span></h2><ul class="tl-list tl-card hh-invites">${inv.map(hhInviteRowHtml).join('')}</ul></section>`;
}
// Kopf der Einkaufsliste: Umschalter «Meine Liste» / «Gemeinsam», Status, Mitglieder, Verlassen; ohne Haushalt nur Einladungen.
function householdSwitchHtml() {
  if (!hhAvailable()) return '';
  if (Date.now() - hh.lastSync > HH_FAST_MS && !hh.syncing) setTimeout(() => hhSync(), 0);   // beim Oeffnen des Einkaufs gleich abgleichen
  if (!hhMember()) {
    const inv = hhInvites();
    return inv.length ? `<div class="hh-box" role="region" aria-label="Einladung zur gemeinsamen Liste"><ul class="hh-invites">${inv.map(hhInviteRowHtml).join('')}</ul></div>` : '';
  }
  const shared = hhWanted();
  const others = hhOthers();
  const active = others.filter(x => x.status === 'active');
  const invited = others.filter(x => x.status === 'invited');
  const names = active.map(hhName);
  const label = names.length ? 'Mit ' + (names.length <= 2 ? names.join(' und ') : names.slice(0, 2).join(', ') + ` und ${names.length - 2} weiteren`) : (invited.length ? 'Wartet auf Zusage' : 'Nur du');
  const members = others.map(x => `<li><span class="hh-m-name">${escapeHtml(hhName(x))}</span><span class="tl-sub">${x.status === 'invited' ? 'Eingeladen' : x.connected === false ? 'Nicht mit dir verbunden' : x.is_owner ? 'Hat die Liste gestartet' : 'Macht mit'}</span></li>`).join('');
  return `<div class="hh-box" role="region" aria-label="Gemeinsame Einkaufsliste">
    <div class="seg hh-seg" role="group" aria-label="Welche Liste anzeigen">
      <button type="button" class="seg-btn" data-action="hh-mode" data-id="own" aria-pressed="${!shared}">Meine Liste</button>
      <button type="button" class="seg-btn" data-action="hh-mode" data-id="household" aria-pressed="${shared}">Gemeinsam</button>
    </div>
    ${shared ? `<p class="hh-line"><span class="hh-with">${escapeHtml(label)}</span> · <span id="hhStatus" role="status">${escapeHtml(hhStatusText())}</span></p>` : '<p class="hh-line">Deine eigene Liste. Die gemeinsame Liste bleibt, wie sie ist.</p>'}
    <details class="hh-details"><summary>Personen und Einstellungen</summary>
      ${members ? `<ul class="hh-members">${members}</ul>` : '<p class="tl-hint tl-hint--flush">Noch niemand hat zugesagt.</p>'}
      <p class="tl-hint">Weitere Personen lädst du unter Freunde ein (Freund wählen, «Einkaufsliste teilen»).</p>
      <button type="button" class="ghost-btn primary-btn--small" data-action="hh-leave">Gemeinsame Liste verlassen</button>
    </details>
  </div>`;
}
// Knopf im Fenster «Verwalten» eines Freundes (share.js).
function hhFriendButtonHtml(handle, name) {
  if (!hhAvailable()) return '';
  const sh = hh.state && hh.state.household;
  const m = sh && (sh.members || []).find(x => x.handle === handle);
  if (m) return `<p class="tl-hint hh-friend-note">${m.status === 'invited' ? `${escapeHtml(name)} ist zur gemeinsamen Einkaufsliste eingeladen.` : `Ihr teilt die Einkaufsliste.`}</p>`;
  return `<button class="menu-item" data-action="hh-invite" data-id="${escapeAttr(handle)}">${typeof ICONS !== 'undefined' && ICONS.cart ? ICONS.cart : ''}<span>Einkaufsliste mit ${escapeHtml(name)} teilen</span></button>`;
}

async function handleHouseholdAction(action, id, el) {
  if (!/^hh-/.test(action || '')) return false;
  if (hh.busy && action !== 'hh-mode') return true;
  const lock = () => { hh.busy = true; if (el) el.disabled = true; };
  const unlock = () => { hh.busy = false; if (el && document.contains(el)) el.disabled = false; };
  switch (action) {
    case 'hh-mode': {
      const m = hhMeta();
      if (!m.id) return true;
      m.mode = id === 'own' ? 'own' : 'household';
      hhSetMeta(m);
      await hhAfterListSwitch();
      if (m.mode === 'household') hhSync();
      return true;
    }
    case 'hh-invite': {
      lock();
      try {
        const res = await hhRpc('savora_hh_invite', { p_handle: id });
        await hhApplyState(res);
        if (state.modal && state.modal.type === 'friend-manage') closeModal();
        const c = (typeof share !== 'undefined' ? share.connections : []).find(x => x.handle === id);
        showToast(`Einladung an ${c ? hhName(c) : '@' + id} gesendet. Die gemeinsame Liste findest du im Einkauf.`);
        hhSync();
      } catch (e) { showToast(hh.unsupported ? 'Die gemeinsame Einkaufsliste ist noch nicht verfügbar.' : hhErrText(e), 'error'); }
      finally { unlock(); }
      return true;
    }
    case 'hh-accept': {
      lock();
      try {
        const res = await hhRpc('savora_hh_accept', { p_household: id });
        await hhApplyState(res);
        const others = hhOthers().filter(x => x.status === 'active').map(hhName);
        showToast(others.length ? `Du teilst jetzt die Einkaufsliste mit ${others.join(', ')}.` : 'Du teilst jetzt die Einkaufsliste.');
        await hhSync();
      } catch (e) { showToast(hhErrText(e), 'error'); }
      finally { unlock(); }
      return true;
    }
    case 'hh-decline': {
      lock();
      try { await hhApplyState(await hhRpc('savora_hh_decline', { p_household: id })); showToast('Einladung abgelehnt'); }
      catch (e) { showToast(hhErrText(e), 'error'); }
      finally { unlock(); }
      return true;
    }
    case 'hh-leave': {
      if (!window.confirm('Gemeinsame Liste verlassen? Offene Einträge kommen in deine eigene Liste. Die anderen behalten die gemeinsame Liste.')) return true;
      const hid = hhMeta().id;
      lock();
      try {
        try { if (hid && await hhStoresReady()) await hhPush(hid); } catch (e) { /* offen Gebliebenes wird lokal uebernommen */ }
        const res = await hhRpc('savora_hh_leave');
        if (hid) await hhEndLocal(hid, 'left');
        await hhApplyState(res);
      } catch (e) { showToast(hhErrText(e), 'error'); }
      finally { unlock(); }
      return true;
    }
    case 'hh-refresh': await hhSync({ state: true }); hhRerender(); return true;
    default: return false;
  }
}
