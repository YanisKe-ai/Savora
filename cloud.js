/* ---------- Savora Cloud: Anmeldung und geraeteuebergreifende Synchronisation ----------
   Grundsaetze:
   - Offline-first: IndexedDB bleibt die Quelle fuer die App. Die Cloud ist ein Abgleich, kein Muss.
   - Ohne Anmeldung passiert NICHTS: kein Netzwerkverkehr, kein Verhalten wie bisher veraendert.
   - Konflikte: der neueste Stand gewinnt (Zeitstempel pro Datensatz). Die Datenbank erzwingt das
     zusaetzlich selbst (siehe Trigger savora_touch_server_time), damit ein lange offline
     gewesenes Geraet keine neueren Daten ueberschreibt.
   - Loeschungen werden als Grabstein (deleted=true) uebertragen, damit andere Geraete sie
     nachvollziehen.
   - Kein externes Paket: schlanke fetch-Aufrufe gegen die dokumentierten Supabase-Schnittstellen
     (Auth, REST, Storage). Funktioniert unveraendert auch in einer spaeteren Capacitor-App.
   Die Anmeldung ist bewusst ein eigener Baustein (cloudAuth*), damit spaeter weitere
   Anmeldewege (Code per E-Mail, Apple) ohne Umbau des Abgleichs moeglich sind. */

const CLOUD_URL = window.SAVORA_CLOUD_URL_OVERRIDE || 'https://npvhdgaxhbmblykiztnn.supabase.co';
const CLOUD_KEY = window.SAVORA_CLOUD_KEY_OVERRIDE || 'sb_publishable_riUaccfqttUEkD6KwwHRig_mqGn-_9b';
const CLOUD_BUCKET = 'savora-images';
const CLOUD_SESSION_KEY = 'savora-cloud-session';
const CLOUD_QUEUE_KEY = 'savora-sync-queue';
const CLOUD_META_KEY = 'savora-sync-meta';
const CLOUD_CURSOR_KEY = 'savora-sync-cursor';
const CLOUD_LAST_KEY = 'savora-sync-last';
const CLOUD_SITE_URL = 'https://yaniske-ai.github.io/Savora/';
// Geschlossene Testphase: Konten werden auf Einladung angelegt. Auf true setzen, sobald ein eigener
// Mail-Dienst eingerichtet und die Registrierung in Supabase wieder offen ist.
const CLOUD_SIGNUP_OPEN = false;
const CLOUD_CLOSED_BETA_TEXT = 'Savora ist in einer geschlossenen Testphase. Frag nach einem Zugang.';

const cloud = { syncing: false, lastError: null, timer: null, applyingRemote: false, pendingAgain: false, gen: 0 };
// Eigene Datenarten der Organisation (org.js): Sammlung, Zuordnung, Verknuepfung. Sie brauchen die Datenbank-Migration paket47.
const CLOUD_ORG_KINDS = ['collection', 'membership', 'pairing'];
function cloudIsOrgKind(kind) { return CLOUD_ORG_KINDS.includes(kind); }
/* Generationszaehler: Anmelden, Abmelden und Konto loeschen erhoehen ihn. Ein laufender Abgleich merkt sich Generation und
   Konto beim Start und schreibt nichts mehr (Daten, Meta, Cursor, Warteschlange), sobald sich eines davon geaendert hat. */
function cloudSyncCtx() { return { gen: cloud.gen, uid: cloudUserId() }; }
function cloudCtxValid(ctx) { return !ctx || typeof ctx !== 'object' || (ctx.gen === cloud.gen && ctx.uid === cloudUserId()); }   // ohne Kontext (alte Aufrufe) keine Pruefung
function cloudCheckCtx(ctx) { if (!cloudCtxValid(ctx)) throw Object.assign(new Error('Abgleich nach Kontowechsel verworfen'), { stale: true }); }

/* ---------- Kleine Helfer ---------- */
function cloudSession() { return readJsonKey(CLOUD_SESSION_KEY, null); }
function cloudSetSession(s) { if (s) writeJsonKey(CLOUD_SESSION_KEY, s); else { try { localStorage.removeItem(CLOUD_SESSION_KEY); } catch (e) {} } }
function cloudSignedIn() { const s = cloudSession(); return !!(s && s.access_token && s.user && s.user.id); }
function cloudUserId() { const s = cloudSession(); return s && s.user ? s.user.id : null; }
function cloudErrorText(body, status) {
  const code = body && (body.error_code || body.code || body.error);
  const msg = body && (body.msg || body.message || body.error_description) || '';
  if (code === 'invalid_credentials' || /invalid login/i.test(msg)) return 'E-Mail oder Passwort stimmt nicht.';
  if (code === 'email_not_confirmed' || /not confirmed/i.test(msg)) return 'Bitte zuerst den Link in der Bestätigungs-E-Mail antippen.';
  if (code === 'user_already_exists' || /already registered/i.test(msg)) return 'Für diese E-Mail gibt es schon ein Konto. Bitte anmelden.';
  if (code === 'weak_password' || /password/i.test(msg) && /least|weak|short/i.test(msg)) return 'Das Passwort ist zu schwach. Mindestens 8 Zeichen verwenden.';
  if (code === 'signup_disabled' || /signups not allowed/i.test(msg)) return CLOUD_CLOSED_BETA_TEXT;
  if (status === 429 || /rate limit/i.test(msg)) return 'Zu viele Versuche. Bitte in ein paar Minuten nochmals.';
  if (status === 0) return 'Keine Verbindung zum Internet.';
  return msg || `Unbekannter Fehler (${status}).`;
}

async function cloudFetch(path, opts = {}, needsAuth = true) {
  const headers = Object.assign({ apikey: CLOUD_KEY }, opts.headers || {});
  if (needsAuth) {
    const token = await cloudAccessToken();
    if (!token) throw Object.assign(new Error('Nicht angemeldet'), { status: 401 });
    headers.Authorization = 'Bearer ' + token;
  }
  let res;
  try { res = await fetch(CLOUD_URL + path, Object.assign({}, opts, { headers })); }
  catch (e) { throw Object.assign(new Error('Keine Verbindung zum Internet.'), { status: 0, offline: true }); }
  if (!res.ok) {
    let body = null; try { body = await res.json(); } catch (e) {}
    const err = new Error(cloudErrorText(body, res.status)); err.status = res.status; err.body = body;
    throw err;
  }
  return res;
}

/* ---------- Anmeldung ---------- */
function cloudStoreTokenResponse(data) {
  const expiresAt = data.expires_at || Math.floor(Date.now() / 1000) + (data.expires_in || 3600);
  cloudSetSession({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: expiresAt, user: { id: data.user.id, email: data.user.email } });
}
let cloudRefreshPromise = null;
async function cloudAccessToken() {
  const s = cloudSession();
  if (!s) return null;
  if (s.expires_at - 60 > Date.now() / 1000) return s.access_token;
  if (!cloudRefreshPromise) {
    cloudRefreshPromise = (async () => {
      try {
        const res = await cloudFetch('/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh_token }) }, false);
        cloudStoreTokenResponse(await res.json());
      } catch (e) {
        // Refresh-Token ungueltig (z.B. Konto geloescht oder abgemeldet): Sitzung beenden, lokale Daten bleiben.
        if (e.status === 400 || e.status === 401 || e.status === 403) cloudSetSession(null);
        throw e;
      } finally { cloudRefreshPromise = null; }
    })();
  }
  await cloudRefreshPromise;
  const fresh = cloudSession();
  return fresh ? fresh.access_token : null;
}
async function cloudAuthSignIn(email, password) {
  const res = await cloudFetch('/auth/v1/token?grant_type=password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }, false);
  cloud.gen++;
  cloudStoreTokenResponse(await res.json());
  if (typeof libReset === 'function') libReset();   // Verwaltungsdaten eines frueheren Kontos verwerfen
  if (typeof libDraftAdoptLocal === 'function') libDraftAdoptLocal();   // vor der Anmeldung begonnene Entwuerfe diesem Konto zuordnen
  await cloudPrepareFirstSync();
  if (typeof libStartup === 'function') setTimeout(() => { libLoadMine(); libLoadPubProfile(); libModCheck(); }, 500);
  return true;
}
async function cloudAuthSignUp(email, password) {
  const res = await cloudFetch('/auth/v1/signup?redirect_to=' + encodeURIComponent(CLOUD_SITE_URL), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }, false);
  const data = await res.json();
  if (data.access_token) { cloud.gen++; cloudStoreTokenResponse(data); await cloudPrepareFirstSync(); return 'signed-in'; }
  return 'confirm';
}
async function cloudAuthResetPassword(email) {
  await cloudFetch('/auth/v1/recover?redirect_to=' + encodeURIComponent(CLOUD_SITE_URL), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }, false);
}
async function cloudAuthUpdatePassword(password) {
  await cloudFetch('/auth/v1/user', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
}
async function cloudAuthSignOut() {
  cloud.gen++;   // ab hier schreibt ein noch laufender Abgleich nichts mehr
  try { await cloudFetch('/auth/v1/logout', { method: 'POST' }); } catch (e) { /* offline abmelden geht trotzdem */ }
  cloud.gen++;
  cloudSetSession(null);
  if (typeof shareReset === 'function') shareReset();
  if (typeof libReset === 'function') libReset();
  // Beim naechsten Anmelden wird neu zusammengefuehrt; lokale Daten bleiben auf dem Geraet.
  [CLOUD_QUEUE_KEY, CLOUD_META_KEY, CLOUD_CURSOR_KEY, CLOUD_LAST_KEY].forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
  cloudStateReset();
}
// Nach Klick auf Bestaetigungs- oder Passwort-Link landet die Seite mit Tokens im URL-Fragment.
function cloudHandleRedirect() {
  const hash = location.hash || '';
  if (!/access_token=/.test(hash)) {
    if (/error_description=/.test(hash)) {
      const p = new URLSearchParams(hash.slice(1));
      setTimeout(() => showToast(p.get('error_description') || 'Link ungültig oder abgelaufen', 'error'), 400);
      history.replaceState(history.state, '', location.pathname + location.search);
    }
    return null;
  }
  const p = new URLSearchParams(hash.slice(1));
  const type = p.get('type');
  const data = { access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), expires_in: Number(p.get('expires_in')) || 3600, expires_at: Number(p.get('expires_at')) || 0 };
  history.replaceState(history.state, '', location.pathname + location.search);
  return { type, data };
}
async function cloudCompleteRedirect(r) {
  if (!r) return;
  try {
    const res = await fetch(CLOUD_URL + '/auth/v1/user', { headers: { apikey: CLOUD_KEY, Authorization: 'Bearer ' + r.data.access_token } });
    if (!res.ok) throw new Error('Link ungültig');
    const user = await res.json();
    cloud.gen++;
    cloudStoreTokenResponse({ ...r.data, user });
    await cloudPrepareFirstSync();
    if (r.type === 'recovery') {
      state.view = 'settings-sync';
      state.modal = { type: 'cloud-new-password' };
      render();
    } else {
      showToast('E-Mail bestätigt. Du bist angemeldet.');
      cloudSyncNow();
    }
  } catch (e) {
    showToast('Der Link ist ungültig oder abgelaufen.', 'error');
  }
}

/* ---------- Abgleich-Zustand: Warteschlange, Meta, Basis (v0.90 in IndexedDB) ----------
   Bis v0.89 lagen Warteschlange und Meta als JSON in localStorage (wenige MB, bei vielen Rezepten schnell voll). Ab v0.90
   liegen sie im Store syncState (ein Eintrag je Schluessel: 'q|kind|id', 'm|kind|id', 'b|kind|id'), mit einem Spiegel im
   Speicher: Lesen bleibt synchron, Schreiben wird gebuendelt und kurz danach in EINER Transaktion gespeichert.
   Einmalige Migration in cloudStateLoad(): alte localStorage-Werte werden uebernommen (groesseres at gewinnt) und NICHT
   geloescht; danach savora-sync-store = 'idb'. Klappt IndexedDB nicht, bleibt alles wie bisher in localStorage.
   Vormerkungen vor dem Laden landen im Spiegel und werden beim Laden gemischt (neuere gewinnen). */
const CLOUD_STORE_FLAG_KEY = 'savora-sync-store';
const cloudState = {
  mode: (() => { try { return localStorage.getItem(CLOUD_STORE_FLAG_KEY) === 'idb' ? 'idb' : 'ls'; } catch (e) { return 'ls'; } })(),
  loaded: false, loading: null,
  q: {}, m: {}, b: {},        // Spiegel: Warteschlange, Meta (letzter bekannter Zeitstempel), Basis-Hash (Inhalt beim letzten Abgleich)
  dirty: new Map(),           // 'q|key' -> Wert oder undefined (= loeschen), noch nicht gespeichert
  timer: null, retry: 0,
};
function cloudStateIdb() { return cloudState.mode === 'idb'; }
function cloudQueue() { return cloudStateIdb() ? Object.assign({}, cloudState.q) : readJsonKey(CLOUD_QUEUE_KEY, {}); }
function cloudMeta() { return cloudStateIdb() ? Object.assign({}, cloudState.m) : readJsonKey(CLOUD_META_KEY, {}); }
function cloudQueueGet(key) { return cloudStateIdb() ? cloudState.q[key] : cloudQueue()[key]; }
function cloudMetaGet(key) { return cloudStateIdb() ? cloudState.m[key] : cloudMeta()[key]; }
function cloudQueueCount() { return Object.keys(cloudStateIdb() ? cloudState.q : cloudQueue()).length; }
function cloudBaseGet(key) { return cloudState.b[key]; }
// updates: { key: Wert } (undefined = Eintrag entfernen). Rueckgabe false, wenn localStorage voll war.
function cloudStateSet(part, updates) {
  const keys = Object.keys(updates || {});
  if (!keys.length) return true;
  if (part === 'b' || cloudStateIdb()) {
    const obj = cloudState[part];
    keys.forEach(k => {
      const v = updates[k];
      if (v === undefined) delete obj[k]; else obj[k] = v;
      if (cloudStateIdb()) cloudState.dirty.set(part + '|' + k, v);
    });
    cloudStateSchedule();
    return true;
  }
  const lsKey = part === 'q' ? CLOUD_QUEUE_KEY : CLOUD_META_KEY;
  const obj = readJsonKey(lsKey, {});
  keys.forEach(k => { const v = updates[k]; if (v === undefined) delete obj[k]; else obj[k] = v; });
  return writeJsonKey(lsKey, obj);
}
function cloudQueuePut(updates) { return cloudStateSet('q', updates); }
function cloudMetaPut(updates) { return cloudStateSet('m', updates); }
function cloudBasePut(updates) { return cloudStateSet('b', updates); }
function cloudStateSchedule() {
  if (!cloudState.loaded || cloudState.timer || !cloudState.dirty.size) return;
  cloudState.timer = setTimeout(() => { cloudState.timer = null; cloudStateFlush(); }, 40);
}
async function cloudStateFlush() {
  if (cloudState.timer) { clearTimeout(cloudState.timer); cloudState.timer = null; }
  if (!cloudState.loaded || !cloudStateIdb() || !cloudState.dirty.size) return true;
  const items = [...cloudState.dirty]; cloudState.dirty = new Map();
  const puts = [], dels = [];
  items.forEach(([k, v]) => { if (v === undefined) dels.push(k); else puts.push({ key: k, v }); });
  try { await dbApplySyncState(puts, dels); cloudState.retry = 0; return true; }
  catch (e) {
    // Nichts verlieren: nicht gespeicherte Eintraege zurueck, sofern inzwischen nichts Neueres vorgemerkt ist
    items.forEach(([k, v]) => { if (!cloudState.dirty.has(k)) cloudState.dirty.set(k, v); });
    cloudState.retry = Math.min(6, cloudState.retry + 1);
    console.warn('Abgleich-Zustand nicht gespeichert', e && e.name);
    setTimeout(cloudStateSchedule, 1000 * Math.pow(2, cloudState.retry));
    return false;
  }
}
function cloudStateSplit(recs) {
  const out = { q: {}, m: {}, b: {} };
  (recs || []).forEach(r => {
    if (!r || typeof r.key !== 'string' || r.key.length < 3 || r.key[1] !== '|') return;
    const part = r.key[0];
    if (out[part]) out[part][r.key.slice(2)] = r.v;
  });
  return out;
}
// Groesseres at gewinnt (Warteschlange), groesserer Zeitstempel gewinnt (Meta). Gibt die geaenderten Schluessel zurueck.
function cloudStateMergeInto(target, src, part, changed) {
  Object.entries(src || {}).forEach(([k, v]) => {
    if (part === 'q') {
      if (!v || typeof v !== 'object' || !v.kind) return;
      const cur = target.q[k];
      if (!cur || (Number(v.at) || 0) > (Number(cur.at) || 0)) { target.q[k] = v; changed.set('q|' + k, v); }
    } else if (part === 'm') {
      if (typeof v !== 'number') return;
      if (!(k in target.m) || v > target.m[k]) { target.m[k] = v; changed.set('m|' + k, v); }
    }
  });
}
// Laedt den Zustand aus IndexedDB (einmal je Sitzung), migriert bei Bedarf aus localStorage. true = IndexedDB aktiv.
function cloudStateLoad() {
  if (cloudState.loaded) return Promise.resolve(true);
  if (cloudState.loading) return cloudState.loading;
  cloudState.loading = (async () => {
    let loaded;
    try { loaded = cloudStateSplit(await dbGetAllSyncState()); }
    catch (e) { console.warn('Abgleich-Zustand: IndexedDB nicht verfuegbar, bleibe bei localStorage', e && e.name); cloudState.loading = null; return false; }
    if (!cloudStateIdb()) {
      // Einmalige Migration aus localStorage (alte Werte bleiben stehen)
      const changed = new Map();
      cloudStateMergeInto(loaded, readJsonKey(CLOUD_QUEUE_KEY, {}), 'q', changed);
      cloudStateMergeInto(loaded, readJsonKey(CLOUD_META_KEY, {}), 'm', changed);
      try { await dbApplySyncState([...changed].map(([key, v]) => ({ key, v })), []); }
      catch (e) { console.warn('Abgleich-Zustand: Migration fehlgeschlagen, bleibe bei localStorage', e && e.name); cloudState.loading = null; return false; }
      // Waehrend des Schreibens hinzugekommene Vormerkungen (noch in localStorage) synchron nachziehen
      const late = new Map();
      cloudStateMergeInto(loaded, readJsonKey(CLOUD_QUEUE_KEY, {}), 'q', late);
      cloudStateMergeInto(loaded, readJsonKey(CLOUD_META_KEY, {}), 'm', late);
      // Was in localStorage inzwischen fehlt, wurde dort hochgeladen und entfernt: hier ebenso entfernen
      const lsQ = readJsonKey(CLOUD_QUEUE_KEY, {});
      Object.keys(loaded.q).forEach(k => { if (changed.has('q|' + k) && !(k in lsQ)) { delete loaded.q[k]; late.set('q|' + k, undefined); } });
      try { cloudOrigSetItem.call(localStorage, CLOUD_STORE_FLAG_KEY, 'idb'); }
      catch (e) { cloudState.loading = null; return false; }
      cloudState.mode = 'idb';
      cloudState.q = loaded.q; cloudState.m = loaded.m;
      Object.keys(loaded.b).forEach(k => { if (!(k in cloudState.b)) cloudState.b[k] = loaded.b[k]; });
      late.forEach((v, k) => cloudState.dirty.set(k, v));
    } else {
      // Vormerkungen vor dem Laden (nur im Spiegel) mit dem Gespeicherten mischen: neuere gewinnen
      const early = cloudState.dirty; cloudState.dirty = new Map();
      early.forEach((v, k) => {
        const part = k[0], key = k.slice(2);
        if (part === 'q') {
          if (v === undefined) { delete loaded.q[key]; cloudState.dirty.set(k, v); return; }
          const cur = loaded.q[key];
          if (!cur || (Number(v.at) || 0) >= (Number(cur.at) || 0)) { loaded.q[key] = v; cloudState.dirty.set(k, v); }
        } else if (part === 'm') {
          if (v === undefined) { delete loaded.m[key]; cloudState.dirty.set(k, v); return; }
          if (!(key in loaded.m) || v >= loaded.m[key]) { loaded.m[key] = v; cloudState.dirty.set(k, v); }
        } else if (part === 'b') {
          if (v === undefined) delete loaded.b[key]; else loaded.b[key] = v;
          cloudState.dirty.set(k, v);
        }
      });
      cloudState.q = loaded.q; cloudState.m = loaded.m; cloudState.b = loaded.b;
    }
    cloudState.loaded = true;
    cloudStateSchedule();
    return true;
  })();
  return cloudState.loading;
}
// Abmelden / Konto loeschen: Abgleich-Zustand leeren (lokale Rezepte bleiben)
function cloudStateReset() {
  if (cloudState.timer) { clearTimeout(cloudState.timer); cloudState.timer = null; }
  cloudState.q = {}; cloudState.m = {}; cloudState.b = {};
  cloudState.dirty = new Map();
  if (typeof dbClearSyncState === 'function') dbClearSyncState().catch(e => console.warn('Abgleich-Zustand nicht geleert', e && e.name));
}
// Beim Verlassen der Seite sofort speichern
window.addEventListener('pagehide', () => { cloudStateFlush(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') cloudStateFlush(); });

/* ---------- Aenderungen erfassen ---------- */
function cloudMark(kind, id, deleted, changedAt) {
  if (!cloudSignedIn() || cloud.applyingRemote || id === undefined || id === null) return;
  const key = kind + '|' + id;
  const at = changedAt || Date.now();
  cloudQueuePut({ [key]: { kind, id: String(id), deleted: !!deleted, at } });
  cloudMetaPut({ [key]: at });
  cloudScheduleSync(1500);
}
// Viele Vormerkungen auf einmal (org.js im Sammelschreiben): Warteschlange und Meta nur einmal schreiben.
// list: [[kind, id, deleted, changedAt], ...]
function cloudMarkMany(list) {
  if (!cloudSignedIn() || cloud.applyingRemote || !Array.isArray(list) || !list.length) return;
  const q = {}, m = {};
  let n = 0;
  list.forEach(([kind, id, deleted, changedAt]) => {
    if (id === undefined || id === null) return;
    const key = kind + '|' + id;
    const at = changedAt || Date.now();
    q[key] = { kind, id: String(id), deleted: !!deleted, at };
    m[key] = at; n++;
  });
  if (!n) return;
  cloudQueuePut(q); cloudMetaPut(m);
  cloudScheduleSync(1500);
}
// Originale merken und die schreibenden DB-Funktionen umhuellen. Aufrufer merken davon nichts.
const cloudOrig = {};
function cloudWrap(name, after) {
  const orig = window[name];
  if (typeof orig !== 'function' || orig.__cloudWrapped) return;
  cloudOrig[name] = orig;
  const wrapped = async function (...args) { const r = await orig.apply(this, args); try { after(...args); } catch (e) {} return r; };
  wrapped.__cloudWrapped = true;
  window[name] = wrapped;
}
cloudWrap('dbPut', (r) => cloudMark('recipe', r && r.id, false));
cloudWrap('dbDelete', (id) => cloudMark('recipe', id, true));
cloudWrap('dbPutMealplanDay', (rec) => cloudMark('mealplan', rec && rec.date, false));
cloudWrap('dbPutShopping', (item) => cloudMark('shopping', item && item.id, false));
cloudWrap('dbDeleteShopping', (id) => cloudMark('shopping', id, true));
cloudWrap('dbPutImage', (rec) => cloudMark('image', rec && rec.id, false));
cloudWrap('dbDeleteImage', (id) => cloudMark('image', id, true));
// Vorrat (v0.90): eigene Datenart 'pantry'. pantry.js merkt selbst per cloudMark('pantry', id, deleted) vor (keine Umhuellung hier).
// Eigene Einkaufsliste lesen, auch wenn household.js die Einkaufsfunktionen auf die Haushaltsliste umleitet
function cloudOwnShoppingAll() {
  return (typeof hhOrig !== 'undefined' && hhOrig && typeof hhOrig.dbGetAllShopping === 'function') ? hhOrig.dbGetAllShopping() : dbGetAllShopping();
}
// Einstellungen, die geraeteuebergreifend Sinn ergeben (Darstellung bleibt pro Geraet).
const CLOUD_SETTING_KEYS = { collections: COLLECTIONS_KEY, cookbookConfig: COOKBOOK_CONFIG_KEY, cookbookTitle: COOKBOOK_TITLE_KEY, cookbooks: COOKBOOK_PROJECTS_KEY, senderName: SENDER_NAME_KEY };
const cloudOrigSetItem = Storage.prototype.setItem;
Storage.prototype.setItem = function (k, v) {
  cloudOrigSetItem.call(this, k, v);
  if (this !== window.localStorage) return;
  const name = Object.keys(CLOUD_SETTING_KEYS).find(n => CLOUD_SETTING_KEYS[n] === k);
  if (name) cloudMark('setting', name, false);
};

// Erstes Anmelden auf einem Geraet: alles Lokale einmal zum Abgleich vormerken. Als Zeitstempel
// dient die letzte Bearbeitung, damit ein in der Cloud neuerer Stand nicht ueberschrieben wird.
async function cloudPrepareFirstSync() {
  if (readJsonKey(CLOUD_CURSOR_KEY, null)) return;
  await cloudStateLoad();
  const q = {}, m = {};
  const add = (kind, id, at, deleted) => { const key = kind + '|' + id; if (!q[key] && !cloudQueueGet(key)) { q[key] = { kind, id: String(id), deleted: !!deleted, at }; m[key] = at; } };
  const recipes = await dbGetAll();
  recipes.forEach(r => add('recipe', r.id, r.updatedAt || r.createdAt || 1));
  // Zuletzt geloeschte Rezepte als Grabstein mit Papierkorb-Daten (andere Geraete legen sie in ihren Papierkorb)
  const live = new Set(recipes.map(r => r.id));
  try { (await dbGetAllRecipeTrash()).forEach(t => { if (t && t.id && !live.has(t.id)) add('recipe', t.id, t.deletedAt || 1, true); }); } catch (e) { /* Store fehlt: nichts vormerken */ }
  (await dbGetAllMealplan()).forEach(d => add('mealplan', d.date, 1));
  (await cloudOwnShoppingAll()).forEach(s => add('shopping', s.id, s.createdAt || 1));
  const imageIds = new Set(recipes.map(r => r.imageId).filter(Boolean));
  imageIds.forEach(id => add('image', id, 1));
  if (typeof coverImageIdsInUse === 'function') coverImageIdsInUse().forEach(id => add('image', id, 1));   // eigene Cover-Bilder gehen denselben Bildweg
  Object.entries(CLOUD_SETTING_KEYS).forEach(([name, key]) => { const v = localStorage.getItem(key); if (v && v !== '[]' && v !== '""') add('setting', name, 1); });
  // Sammlungen, Zuordnungen, Verknuepfungen (inkl. Grabsteinen) mit ihrem Konfliktwert; reine Bestandsuebernahmen bleiben lokal
  if (typeof orgSyncAll === 'function') orgSyncAll().forEach(e => add(e.kind, e.id, e.at, e.deleted));
  // Vorrat
  try { (await cloudPantryAll()).forEach(e => add('pantry', e.id, e.at || 1, e.deleted)); } catch (e) { /* Vorrat nicht verfuegbar */ }
  cloudQueuePut(q); cloudMetaPut(m);
}

/* ---------- Abgleich ---------- */
function cloudScheduleSync(delay) {
  if (!cloudSignedIn()) return;
  clearTimeout(cloud.timer);
  cloud.timer = setTimeout(() => cloudSyncNow(), delay || 0);
}
async function cloudReadLocal(kind, id) {
  if (kind === 'recipe') return await dbGetRecipe(id);
  if (kind === 'mealplan') return (await dbGetAllMealplan()).find(d => d.date === id) || null;
  if (kind === 'shopping') return (await cloudOwnShoppingAll()).find(s => s.id === id) || null;
  if (kind === 'setting') { const v = localStorage.getItem(CLOUD_SETTING_KEYS[id]); return v === null ? null : { value: v }; }
  if (cloudIsOrgKind(kind) && typeof orgSyncRead === 'function') return orgSyncRead(kind, id);
  if (kind === 'pantry') return await cloudPantryRead(id);
  return null;
}

/* ---------- Vorrat als eigene Datenart (v0.90) ----------
   pantry.js liefert die Hooks pantrySyncRead(id) (Datensatz oder null), pantrySyncApply(rec, deleted) (neuerer updatedAt
   gewinnt) und pantrySyncAll() (alle Datensaetze, auch den Marker 'p-seeded');
   sonst gelten die einfachen Standardwege hier. Abgleich in eigenen Bloecken: fehlt die Datenbank-Erweiterung auf dem
   Server, bleiben die Eintraege in der Warteschlange und der uebrige Abgleich laeuft weiter. */
const CLOUD_SOLO_KINDS = ['pantry'];
function cloudIsSoloKind(kind) { return CLOUD_SOLO_KINDS.includes(kind); }
function cloudPantryValid(data, id) {
  return !!data && typeof data === 'object' && !Array.isArray(data) && data.id === id && typeof data.name === 'string' && data.name.length <= 300
    && (data.canonical === undefined || data.canonical === null || (typeof data.canonical === 'string' && data.canonical.length <= 300));
}
async function cloudPantryRead(id) {
  if (typeof pantrySyncRead === 'function') return await pantrySyncRead(id);
  return typeof dbGetPantry === 'function' ? await dbGetPantry(id) : null;
}
async function cloudPantryAll() {
  const list = typeof pantrySyncAll === 'function' ? await pantrySyncAll() : (typeof dbGetAllPantry === 'function' ? await dbGetAllPantry() : []);
  return (Array.isArray(list) ? list : []).filter(p => p && p.id).map(p => ({ id: p.id, at: Number(p.updatedAt) || 1, deleted: !!p.deleted }));
}
async function cloudPantryApply(id, data, deleted) {
  const rec = data && typeof data === 'object' && !Array.isArray(data) ? Object.assign({}, data, { id }) : { id };
  if (typeof pantrySyncApply === 'function') return await pantrySyncApply(rec, !!deleted);
  if (deleted) { await dbDeletePantry(id); return true; }
  if (!cloudPantryValid(rec, id)) { console.warn('Cloud-Vorrat nicht uebernommen', id); return false; }
  await dbPutPantry(rec);
  return true;
}

/* ---------- Konflikte bei Rezepten (v0.90) ----------
   Basis = Inhalts-Hash beim letzten Abgleich. Haben seither BEIDE Seiten den Inhalt geaendert (und verschieden), bleibt die
   Verliererseite der Zeitregel zusaetzlich als eigenes Rezept «… (Kopie von <Geraet>)» erhalten. Nur Metadaten (Bewertung,
   Favorit, Kochzaehler …) zaehlen nicht als Inhalt; bei der Bewertung gewinnt das neuere ratedAt. Ohne Basis (erster
   Abgleich) entsteht nie eine Kopie. */
const CLOUD_RECIPE_META_FIELDS = ['updatedAt', 'rating', 'ratedAt', 'favorite', 'lastCookedAt', 'cookCount', 'cookLog', 'collections', 'collectionIds', 'syncDevice'];
function recipeContentHash(r) {
  if (!r || typeof r !== 'object') return null;
  const c = {};
  Object.keys(r).forEach(k => { if (!CLOUD_RECIPE_META_FIELDS.includes(k)) c[k] = r[k]; });
  return stableHash(c);
}
function cloudRatedNewer(a, b) { return !!a && !!b && (Number(a.ratedAt) || 0) > (Number(b.ratedAt) || 0); }
async function cloudConflictCopy(recipe, device, hash) {
  const id = 'k-' + stableHash(String(recipe.id) + hash);
  if (await dbGetRecipe(id)) return null;   // schon angelegt (gleicher Konflikt, deterministische ID)
  const now = Date.now();
  const copy = JSON.parse(JSON.stringify(recipe));
  const suffix = ` (Kopie von ${String(device || 'anderem Gerät').slice(0, 40)})`;
  copy.id = id;
  copy.title = String(recipe.title || 'Rezept').slice(0, 500 - suffix.length) + suffix;
  copy.conflictOf = recipe.id; copy.conflictAt = now;
  copy.createdAt = copy.createdAt || now; copy.updatedAt = now;
  delete copy.syncDevice;
  const was = cloud.applyingRemote; cloud.applyingRemote = false;
  try { await dbPut(copy); }   // normal vormerken: die Kopie geht auf alle Geraete
  finally { cloud.applyingRemote = was; }
  return copy;
}

/* ---------- Zuletzt geloescht: Cloud-Teil (v0.90) ----------
   Ein geloeschtes Rezept geht als Grabstein (deleted=true) MIT data = { trash: { deletedAt, recipe } } in die Cloud.
   Aeltere App-Versionen loeschen es wie bisher; neuere legen es in ihren Papierkorb. Ein Grabstein ohne data
   (Papierkorb geleert oder aeltere Version) loescht endgueltig, samt Bild, wenn kein anderes Rezept es nutzt. */
async function cloudTrashPayload(id) {
  if (typeof dbGetRecipeTrash !== 'function') return null;
  const t = await dbGetRecipeTrash(id);
  if (!t || !t.recipe) return null;
  return { trash: { deletedAt: t.deletedAt || Date.now(), recipe: t.recipe } };
}
async function recipeImageInUse(imageId, exceptRecipeId) {
  if (!imageId) return false;
  if ((await dbGetAll()).some(r => r && r.id !== exceptRecipeId && r.imageId === imageId)) return true;
  if (typeof dbGetAllRecipeTrash === 'function' && (await dbGetAllRecipeTrash()).some(t => t && t.id !== exceptRecipeId && (t.imageId === imageId || (t.recipe && t.recipe.imageId === imageId)))) return true;
  if (typeof coverImageIdsInUse === 'function' && coverImageIdsInUse().includes(imageId)) return true;
  return false;
}
// Fuer ui.js (Loeschen nach Ablauf des Rueckgaengig-Fensters): zuerst in den Papierkorb, dann loeschen. Das Bild bleibt.
async function recipeTrashOnDelete(recipe) {
  if (!recipe || !recipe.id) return null;
  const entry = { id: recipe.id, recipe: JSON.parse(JSON.stringify(recipe)), deletedAt: Date.now(), imageId: recipe.imageId || null };
  await dbPutRecipeTrash(entry);   // schlaegt das fehl (Speicher voll), bleibt das Rezept bestehen
  await dbDelete(recipe.id);       // Abgleich: Grabstein mit Papierkorb-Daten
  return entry;
}
// Fuer trash.js (Wiederherstellen): Rezept mit neuem updatedAt zurueck, Papierkorb-Eintrag weg.
async function recipeTrashRestoreCore(id) {
  const t = await dbGetRecipeTrash(id);
  if (!t || !t.recipe) return null;
  const recipe = Object.assign(JSON.parse(JSON.stringify(t.recipe)), { id: t.id, updatedAt: Date.now() });
  await dbPut(recipe);             // Abgleich: wieder vorhanden (neuer als der Grabstein)
  await dbDeleteRecipeTrash(id);
  return recipe;
}
// Fuer trash.js (endgueltig loeschen, auch trashPurge nach 30 Tagen): Grabstein ohne Daten, Bild weg, wenn ungenutzt.
async function recipeTrashFinalDelete(id) {
  const t = await dbGetRecipeTrash(id);
  if (!t) return false;
  await dbDeleteRecipeTrash(id);
  if (await dbGetRecipe(id)) return true;   // inzwischen wieder ein lebendes Rezept: nur den Eintrag entfernen
  cloudMark('recipe', id, true);            // ohne Papierkorb-Eintrag sendet cloudPush data = null: endgueltig
  const img = t.imageId || (t.recipe && t.recipe.imageId);
  if (img && !(await recipeImageInUse(img, id))) await dbDeleteImage(img);   // umhuellt: Bild auch in der Cloud loeschen
  return true;
}
function cloudImagePath(id, thumb) { return `${cloudUserId()}/${encodeURIComponent(id)}${thumb ? '-thumb' : ''}`; }
async function cloudPushImage(id, deleted) {
  if (deleted) {
    await cloudFetch(`/storage/v1/object/${CLOUD_BUCKET}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [cloudImagePath(id), cloudImagePath(id, true)] }) });
    return;
  }
  const img = await dbGetImage(id);
  if (!img || !img.blob) return;
  const upload = (blob, thumb) => cloudFetch(`/storage/v1/object/${CLOUD_BUCKET}/${cloudImagePath(id, thumb)}`, { method: 'POST', headers: { 'Content-Type': img.mime || blob.type || 'image/jpeg', 'x-upsert': 'true', 'cache-control': '31536000' }, body: blob });
  await upload(img.blob, false);
  if (img.thumbBlob) await upload(img.thumbBlob, true);
}
async function cloudFetchImage(id) {
  const get = async (thumb) => { const res = await cloudFetch(`/storage/v1/object/authenticated/${CLOUD_BUCKET}/${cloudImagePath(id, thumb)}`); return res.blob(); };
  const blob = await get(false);
  let thumbBlob = null; try { thumbBlob = await get(true); } catch (e) { thumbBlob = blob; }
  const isCover = typeof id === 'string' && id.startsWith('cover-');
  if (isCover && !/^image\/(jpeg|png|webp)$/.test(blob.type || '')) throw new Error('Ungueltiges Cover-Bild');   // Daten von aussen: nur Bildformate der App
  cloud.applyingRemote = true;
  try { await (cloudOrig.dbPutImage || dbPutImage)(isCover ? { id, blob, thumbBlob, mime: blob.type, kind: 'cover' } : { id, blob, thumbBlob, mime: blob.type || 'image/jpeg' }); }
  finally { cloud.applyingRemote = false; }
}
/* Cover-Bilder, die ein Kochbuch nennt, aber lokal fehlen (Einstellung kam per Abgleich, das Bild folgt): nachladen. Ein noch nicht
   hochgeladenes Bild (404) wird fruehestens nach 5 Minuten erneut angefragt. */
const cloudCoverMissing = new Map();   // ID -> Zeitpunkt des letzten Fehlversuchs
async function cloudFetchMissingCoverImages() {
  if (typeof coverImageIdsInUse !== 'function') return 0;
  let n = 0;
  for (const id of coverImageIdsInUse()) {
    if (Date.now() - (cloudCoverMissing.get(id) || 0) < 300000) continue;
    try { if (await dbGetImage(id)) continue; await cloudFetchImage(id); n++; }
    catch (e) { if (e && e.offline) throw e; cloudCoverMissing.set(id, Date.now()); }
  }
  return n;
}

async function cloudPush(ctx) {
  cloudCheckCtx(ctx);
  const q = cloudQueue();
  const entries = Object.entries(q);
  if (!entries.length) return 0;
  const rows = [];
  const orgRows = [];
  const soloRows = [];
  const imageJobs = [];
  const failed = new Set();
  const pushedHash = {};   // Rezept-Schluessel -> Inhalts-Hash des gesendeten Stands (Basis, wenn der Server ihn annimmt)
  const device = savoraDeviceName();
  for (const [key, e] of entries) {
    if (e.kind === 'image') { imageJobs.push([key, e]); continue; }
    let local;
    if (e.kind === 'recipe' && e.deleted) local = await cloudTrashPayload(e.id);   // Papierkorb-Daten mitschicken
    // Org-Grabsteine mit Daten senden (Name, Farbe, Symbol), damit ein neues Geraet die ID-Regel anwenden kann
    else local = e.deleted && !cloudIsOrgKind(e.kind) ? null : await cloudReadLocal(e.kind, e.id);
    if (e.kind === 'recipe' && !e.deleted && local) {
      pushedHash[key] = recipeContentHash(local);
      local = Object.assign({}, local, { syncDevice: device });
    }
    const row = { user_id: cloudUserId(), kind: e.kind, id: e.id, data: local, deleted: e.deleted || !local, client_updated_at: e.at };
    (cloudIsOrgKind(e.kind) ? orgRows : cloudIsSoloKind(e.kind) ? soloRows : rows).push(row);
  }
  const send = (block, representation) => cloudFetch('/rest/v1/savora_records?on_conflict=user_id,kind,id' + (representation ? '&select=kind,id,client_updated_at' : ''), {
    method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=' + (representation ? 'representation' : 'minimal') },
    body: JSON.stringify(block),
  });
  const baseUpdates = {};
  for (let i = 0; i < rows.length; i += 200) {
    cloudCheckCtx(ctx);
    const block = rows.slice(i, i + 200);
    const res = await send(block, true);
    // Antwort zeigt den Stand nach dem Schreiben: gleicher Zeitstempel = angenommen (aelterer Stand wird vom Server verworfen)
    let back = null; try { back = await res.json(); } catch (e) { back = null; }
    if (Array.isArray(back)) {
      const sent = new Map(block.map(r => [r.kind + '|' + r.id, r]));
      back.forEach(b => {
        if (!b || b.kind !== 'recipe') return;
        const k = b.kind + '|' + b.id, r = sent.get(k);
        if (!r || Number(b.client_updated_at) !== Number(r.client_updated_at)) return;
        baseUpdates[k] = r.deleted ? undefined : pushedHash[k];
      });
    }
  }
  // Organisation und Vorrat in eigenen Bloecken: lehnt der Server sie ab (Migration fehlt), bleiben sie in der Warteschlange
  // und der uebrige Abgleich (Rezepte, Plan, Einkauf) laeuft trotzdem.
  for (const [group, label] of [[orgRows, 'Sammlungen/Verknuepfungen'], [soloRows, 'Vorrat']]) {
    for (let i = 0; i < group.length; i += 200) {
      cloudCheckCtx(ctx);
      const block = group.slice(i, i + 200);
      try { await send(block, false); }
      catch (err) {
        if (err.offline || err.status === 401) throw err;
        console.warn(label + ' nicht abgeglichen', err.status, err.message);
        block.forEach(r => failed.add(r.kind + '|' + r.id));
      }
    }
  }
  for (const [key, e] of imageJobs) {
    try { await cloudPushImage(e.id, e.deleted); }
    catch (err) { if (err.offline) throw err; if (err.status !== 404) console.warn('Bild-Abgleich', e.id, err.message); }
  }
  // Nur entfernen, was waehrend des Hochladens nicht erneut geaendert wurde.
  cloudCheckCtx(ctx);
  const done = {};
  entries.forEach(([key, e]) => { const cur = cloudQueueGet(key); if (!failed.has(key) && cur && cur.at === e.at) done[key] = undefined; });
  cloudQueuePut(done);
  // Basis nur fuer Rezepte, die seither nicht erneut geaendert wurden
  const base = {};
  Object.keys(baseUpdates).forEach(k => { if (!cloudQueueGet(k)) base[k] = baseUpdates[k]; });
  cloudBasePut(base);
  return rows.length + imageJobs.length;
}

// Organisations-Datensaetze uebernehmen (synchron, eine Seite landet gesammelt in einem Schreibvorgang je Schluessel).
function cloudApplyOrgRows(rows, ctx) {
  if (!rows.length || typeof orgSyncApply !== 'function') return 0;
  cloudCheckCtx(ctx);
  let n = 0;
  const meta = cloudMeta(), queue = cloudQueue(), metaUpdates = {}, remark = [];
  const run = () => rows.forEach(row => {
    const key = row.kind + '|' + row.id;
    const pending = queue[key];
    const known = key in metaUpdates ? metaUpdates[key] : (meta[key] || 0);
    if (pending && pending.at > row.client_updated_at) return;   // lokaler Stand ist neuer und wird hochgeladen
    if (known > row.client_updated_at) return;
    let res;
    cloud.applyingRemote = true;
    try { res = orgSyncApply(row.kind, row.id, row.data, !!row.deleted, row.client_updated_at); }
    finally { cloud.applyingRemote = false; }
    if (res.invalid) { console.warn('Cloud-Datensatz nicht uebernommen', row.kind, row.id); return; }
    // Lokaler Stand neuer, aber nicht vorgemerkt (z. B. nach dem Nachholen): erneut hochladen
    if (res.localNewer) { if (!pending) remark.push([row.kind, row.id, res.localAt]); return; }
    metaUpdates[key] = row.client_updated_at;
    if (res.applied) n++;
  });
  if (typeof orgBatch === 'function') orgBatch(run); else run();
  cloudMetaPut(metaUpdates);
  remark.forEach(([kind, id, at]) => { const local = orgSyncRead(kind, id); cloudMark(kind, id, !local || !!local.deleted, at); });
  return n;
}
// Rezept aus der Cloud uebernehmen: Zeitregel wie bisher, dazu Papierkorb und Konflikt-Kopien (v0.90).
async function cloudApplyRecipe(row, ctx) {
  const key = 'recipe|' + row.id;
  const pending = cloudQueueGet(key);
  const localAt = cloudMetaGet(key) || 0;
  const base = cloudBaseGet(key);   // undefined = unbekannt (erster Abgleich): nie eine Kopie
  // Cloud-Stand vorbereiten. Daten von aussen: erst pruefen (Typen, IDs, Bildquelle), ungueltige Rezepte nicht uebernehmen
  let remote = null, remoteDevice = '';
  if (!row.deleted) {
    if (row.data && typeof row.data.syncDevice === 'string') remoteDevice = row.data.syncDevice.slice(0, 40);
    const checked = validateRecipe(row.data);
    if (!checked.ok) { console.warn('Cloud-Rezept nicht uebernommen', row.id, checked.errors.slice(0, 3)); return false; }
    remote = checked.recipe; delete remote.syncDevice;
    if (remote.id === undefined || remote.id === null) remote.id = row.id;
  }
  const remoteHash = remote ? recipeContentHash(remote) : null;
  const local = await dbGetRecipe(row.id);
  const localHash = local ? recipeContentHash(local) : null;
  const known = base !== undefined;

  // 1. Lokaler Stand ist neuer und wird hochgeladen: der Cloud-Stand verliert.
  if (pending && pending.at > row.client_updated_at) {
    let changed = false;
    if (known && remote && remoteHash !== base) {
      if (local && !pending.deleted && localHash !== base && localHash !== remoteHash) {
        // beide geaendert: den Cloud-Stand als Kopie behalten
        if (await cloudConflictCopy(remote, remoteDevice || 'anderem Gerät', remoteHash)) changed = true;
        cloudBasePut({ [key]: remoteHash });
      } else if (pending.deleted && typeof dbGetRecipeTrash === 'function') {
        // hier geloescht, anderswo geaendert: den geaenderten Stand im Papierkorb aufbewahren (wird mit hochgeladen)
        const t = await dbGetRecipeTrash(row.id);
        if (t) { await dbPutRecipeTrash(Object.assign({}, t, { recipe: remote, imageId: remote.imageId || t.imageId || null })); cloudBasePut({ [key]: remoteHash }); changed = true; }
      }
    } else if (remote && local && localHash === remoteHash) cloudBasePut({ [key]: localHash });
    // Bewertung: das neuere ratedAt gewinnt auch hier (der ausstehende Upload nimmt sie mit)
    if (remote && local && !pending.deleted && cloudRatedNewer(remote, local)) {
      cloudCheckCtx(ctx);
      await cloudOrig.dbPut(Object.assign({}, local, { rating: remote.rating === undefined ? null : remote.rating, ratedAt: remote.ratedAt }));
      changed = true;
    }
    return changed;
  }
  if (localAt > row.client_updated_at) return false;
  cloudCheckCtx(ctx);

  // 2. Der Cloud-Stand gewinnt.
  let remark = false, changed = false;
  const localChanged = !!local && known && localHash !== base;   // lokal seit dem letzten Abgleich geaendert
  cloud.applyingRemote = true;
  try {
    if (row.deleted) {
      const tr = row.data && typeof row.data === 'object' && row.data.trash && typeof row.data.trash === 'object' ? row.data.trash : null;
      let keep = null, deletedAt = Date.now();
      if (tr) {
        // In den Papierkorb. Lokal geaendert: den lokalen Stand aufbewahren, sonst den mitgeschickten
        const checked = tr.recipe ? validateRecipe(tr.recipe) : null;
        if (checked && checked.ok) { keep = checked.recipe; delete keep.syncDevice; keep.id = row.id; }
        if (local && (localChanged || !keep)) keep = local;
        if (Number.isFinite(Number(tr.deletedAt)) && Number(tr.deletedAt) > 0) deletedAt = Number(tr.deletedAt);
        else deletedAt = row.client_updated_at || deletedAt;
      } else if (localChanged) {
        keep = local;   // endgueltig geloescht, aber hier ungesehen geaendert: 30 Tage im Papierkorb behalten
      }
      if (keep && typeof dbPutRecipeTrash === 'function') {
        await dbPutRecipeTrash({ id: row.id, recipe: keep, deletedAt, imageId: keep.imageId || null });   // zuerst sichern
        if (local) await cloudOrig.dbDelete(row.id);
        changed = true;
      } else {
        // endgueltig: Rezept, Papierkorb-Eintrag und Bild (wenn kein anderes Rezept es nutzt)
        const t = typeof dbGetRecipeTrash === 'function' ? await dbGetRecipeTrash(row.id) : null;
        if (local) await cloudOrig.dbDelete(row.id);
        if (t) await dbDeleteRecipeTrash(row.id);
        const img = (local && local.imageId) || (t && (t.imageId || (t.recipe && t.recipe.imageId)));
        if (img && !(await recipeImageInUse(img, row.id))) await (cloudOrig.dbDeleteImage || dbDeleteImage)(img);
        changed = !!(local || t);
      }
      cloudBasePut({ [key]: undefined });
    } else {
      // Ueberschreiben. Beide Seiten seit der Basis verschieden geaendert: den lokalen Stand als Kopie behalten
      if (localChanged && remoteHash !== base && localHash !== remoteHash) await cloudConflictCopy(local, savoraDeviceName(), localHash);
      let toStore = remote;
      if (local && cloudRatedNewer(local, remote)) { toStore = Object.assign({}, remote, { rating: local.rating === undefined ? null : local.rating, ratedAt: local.ratedAt }); remark = true; }
      await cloudOrig.dbPut(toStore);
      changed = true;
      // anderswo wiederhergestellt: Papierkorb-Eintrag entfernen (das Bild bleibt, das Rezept nutzt es)
      if (typeof dbGetRecipeTrash === 'function' && await dbGetRecipeTrash(row.id)) await dbDeleteRecipeTrash(row.id);
      cloudBasePut({ [key]: recipeContentHash(toStore) });
      if (toStore.imageId && !(await dbGetImage(toStore.imageId))) {
        try { await cloudFetchImage(toStore.imageId); } catch (e) { /* Bild folgt beim naechsten Abgleich */ }
      }
    }
  } finally { cloud.applyingRemote = false; }
  cloudMetaPut({ [key]: row.client_updated_at });
  if (remark) cloudMark('recipe', row.id, false);   // zusammengefuehrte Bewertung hochladen
  return changed;
}
async function cloudApplyRemote(row, ctx) {
  cloudCheckCtx(ctx);
  if (cloudIsOrgKind(row.kind)) return cloudApplyOrgRows([row], ctx) > 0;
  if (row.kind === 'recipe') return cloudApplyRecipe(row, ctx);
  const key = row.kind + '|' + row.id;
  const localAt = cloudMetaGet(key) || 0;
  const pending = cloudQueueGet(key);
  if (pending && pending.at > row.client_updated_at) return false; // lokaler Stand ist neuer und wird hochgeladen
  if (localAt > row.client_updated_at) return false;
  let legacyMerge = false;
  cloud.applyingRemote = true;
  try {
    if (row.kind === 'pantry') {
      // Vorrat: ein Fehler hier darf den uebrigen Abgleich nie blockieren
      try { if ((await cloudPantryApply(row.id, row.data, !!row.deleted || !row.data)) === false) return false; }
      catch (e) { console.warn('Vorrat nicht uebernommen', row.id, e && e.message); return false; }
    } else if (row.kind === 'mealplan') {
      if (row.deleted || !row.data) await cloudOrig.dbPutMealplanDay({ date: row.id, recipeIds: [], entries: [] });
      else await cloudOrig.dbPutMealplanDay(row.data);
    } else if (row.kind === 'shopping') {
      if (row.deleted) await cloudOrig.dbDeleteShopping(row.id);
      else await cloudOrig.dbPutShopping(row.data);
    } else if (row.kind === 'setting') {
      const lsKey = CLOUD_SETTING_KEYS[row.id];
      // Kochbuch-Projekte nur uebernehmen, wenn der Wert ein lesbares Projekt-Objekt ist (nie einen kaputten Stand einspielen)
      const valid = row.id !== 'cookbooks' || (() => { try { return !!cookbookSanitizeStore(JSON.parse(row.data.value)); } catch (e) { return false; } })();
      if (lsKey && valid && row.data && typeof row.data.value === 'string') {
        // Stil-IDs von aelteren Geraeten (A/B/C) auf pur/prise-pop abbilden, bevor sie lokal landen
        const value = row.id === 'cookbooks' ? cookbookNormalizeStoreText(row.data.value, true) : row.id === 'cookbookConfig' ? cookbookNormalizeStoreText(row.data.value, false) : row.data.value;
        cloudOrigSetItem.call(localStorage, lsKey, value);
        // Sammlungsliste (Projektion, ggf. von einem Geraet mit aelterer Version): neue IDs ins Modell uebernehmen, nichts verwerfen
        // Nur hochladen, wenn die zusammengefuehrte Liste inhaltlich abweicht (Reihenfolge zaehlt nicht), sonst Pingpong
        if (row.id === 'collections' && typeof orgEnsureLegacy === 'function') {
          orgEnsureLegacy();
          const merged = localStorage.getItem(lsKey);
          legacyMerge = typeof orgProjectionSame === 'function' ? !orgProjectionSame(merged, value) : merged !== value;
        }
        if (row.id === 'cookbookTitle') state.cookbookTitle = row.data.value;
        if (row.id === 'senderName') state.senderName = row.data.value;
      }
    }
  } finally { cloud.applyingRemote = false; }
  cloudMetaPut({ [key]: row.client_updated_at });
  if (legacyMerge) cloudMark('setting', 'collections', false);   // zusammengefuehrte Liste fuer aeltere Geraete hochladen
  return true;
}
/* Einmaliges Nachholen der Organisations-Datensaetze ohne Cursor: Ein Geraet mit aelterer Version hat solche Zeilen
   schon gezogen, aber nicht verstanden (Meta gesetzt, Cursor weiter). Nach dem Update werden sie hier nachgeholt. */
async function cloudOrgCatchUp(ctx) {
  cloudCheckCtx(ctx);
  const del = {};
  Object.keys(cloudMeta()).forEach(k => { if (cloudIsOrgKind(k.split('|')[0])) del[k] = undefined; });
  cloudMetaPut(del);
  let changed = 0;
  for (let page = 0; page < 200; page++) {
    const q = `/rest/v1/savora_records?select=kind,id,data,deleted,client_updated_at,server_updated_at&kind=in.(${CLOUD_ORG_KINDS.join(',')})&order=server_updated_at.asc,kind.asc,id.asc&limit=1000&offset=${page * 1000}`;
    const rows = await (await cloudFetch(q)).json();
    cloudCheckCtx(ctx);
    changed += cloudApplyOrgRows(rows.filter(r => cloudIsOrgKind(r.kind)), ctx);
    if (rows.length < 1000) break;
  }
  cloudCheckCtx(ctx);
  if (typeof orgMetaSet === 'function') orgMetaSet('catchUpDone', true);
  return changed;
}

async function cloudPull(ctx) {
  cloudCheckCtx(ctx);
  let cursor = readJsonKey(CLOUD_CURSOR_KEY, null);
  let changed = 0;
  for (let page = 0; page < 50; page++) {
    // 5 Sekunden Ueberlappung: gleichzeitig abgeschlossene Schreibvorgaenge werden sicher erfasst,
    // doppelt gelesene Zeilen sind unschaedlich (gleicher Zeitstempel wird uebersprungen).
    let q = '/rest/v1/savora_records?select=kind,id,data,deleted,client_updated_at,server_updated_at&order=server_updated_at.asc&limit=500';
    if (cursor) q += '&server_updated_at=gt.' + encodeURIComponent(new Date(new Date(cursor).getTime() - 5000).toISOString());
    const rows = await (await cloudFetch(q)).json();
    cloudCheckCtx(ctx);   // Antwort eines frueheren Kontos: verwerfen
    let maxCursor = cursor;
    const orgRows = [];
    for (const row of rows) {
      if (cloudIsOrgKind(row.kind)) orgRows.push(row);
      else if (await cloudApplyRemote(row, ctx)) changed++;
      if (!maxCursor || row.server_updated_at > maxCursor) maxCursor = row.server_updated_at;
    }
    changed += cloudApplyOrgRows(orgRows, ctx);   // eine Seite Sammlungen/Zuordnungen in einem Schreibvorgang
    const advanced = maxCursor !== cursor;
    cursor = maxCursor;
    cloudCheckCtx(ctx);
    if (cursor) writeJsonKey(CLOUD_CURSOR_KEY, cursor);
    if (rows.length < 500 || !advanced) break;
  }
  cloudCheckCtx(ctx);
  if (!cursor) writeJsonKey(CLOUD_CURSOR_KEY, new Date(0).toISOString());
  return changed;
}

async function cloudSyncNow(opts = {}) {
  if (!cloudSignedIn()) return { ok: false, reason: 'signed-out' };
  if (cloud.syncing) { cloud.pendingAgain = true; return { ok: false, reason: 'busy' }; }
  if (navigator.onLine === false) { cloud.lastError = 'Offline. Änderungen werden später übertragen.'; cloudRefreshStatus(); return { ok: false, reason: 'offline' }; }
  cloud.syncing = true; cloudRefreshStatus();
  let changed = 0;
  const ctx = cloudSyncCtx();
  try {
    await cloudStateLoad();   // Warteschlange und Meta aus IndexedDB (einmalig; ohne IndexedDB weiter mit localStorage)
    await cloudPush(ctx);
    const hadCursor = !!readJsonKey(CLOUD_CURSOR_KEY, null);
    const needCatchUp = hadCursor && typeof orgMetaGet === 'function' && !orgMetaGet('catchUpDone');
    changed = await cloudPull(ctx);
    if (needCatchUp) changed += await cloudOrgCatchUp(ctx);
    else if (!hadCursor && typeof orgMetaSet === 'function') { cloudCheckCtx(ctx); orgMetaSet('catchUpDone', true); }   // voller Abzug enthaelt schon alles
    await cloudFetchMissingCoverImages();
    await cloudPush(ctx); // was beim Pull als lokal neuer erkannt wurde
    cloudCheckCtx(ctx);
    cloud.lastError = null;
    writeJsonKey(CLOUD_LAST_KEY, Date.now());
  } catch (e) {
    if (e && e.stale) cloud.lastError = null;   // Kontowechsel waehrend des Abgleichs: still verwerfen
    else {
      cloud.lastError = e.message || 'Abgleich fehlgeschlagen';
      if (e.status === 401) cloud.lastError = 'Sitzung abgelaufen. Bitte neu anmelden.';
    }
  } finally {
    cloud.syncing = false;
  }
  if (changed && cloudCtxValid(ctx)) await cloudReloadState();
  cloudRefreshStatus();
  if (!cloudCtxValid(ctx) && cloudSignedIn()) cloud.pendingAgain = true;   // neues Konto: gleich frisch abgleichen
  if (cloud.pendingAgain) { cloud.pendingAgain = false; cloudScheduleSync(500); }
  if (!cloudCtxValid(ctx)) return { ok: false, reason: 'stale', changed: 0 };
  return { ok: !cloud.lastError, changed };
}
// Nach eingehenden Aenderungen neu laden, aber nie mitten in einer Bearbeitung oder im Kochmodus
// neu zeichnen (sonst gingen Eingaben verloren oder die Ansicht wuerde springen).
async function cloudReloadState() {
  await loadRecipes(); await loadShopping(); await loadMealplan();
  state.cookbookTitle = localStorage.getItem(COOKBOOK_TITLE_KEY) || '';
  if (state.view === 'form' || state.view === 'cookmode' || state.modal) return;
  const ae = document.activeElement;
  if (state.view === 'cookbook' && ae && ae.matches && ae.matches('input, textarea, select')) return;   // Texte im Kochbuch-Editor nicht unter den Fingern neu zeichnen
  render();
}
function cloudRefreshStatus() {
  const el = document.getElementById('cloudStatus');
  if (el) el.innerHTML = cloudStatusHtml();
}
function cloudStatusHtml() {
  const pending = cloudQueueCount();
  const last = readJsonKey(CLOUD_LAST_KEY, null);
  if (cloud.syncing) return `<span class="sync-dot sync-dot--busy"></span>Wird abgeglichen …`;
  if (cloud.lastError) return `<span class="sync-dot sync-dot--warn"></span>${escapeHtml(cloud.lastError)}`;
  const when = last ? new Date(last).toLocaleString('de-CH', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'noch nie';
  return `<span class="sync-dot sync-dot--ok"></span>Zuletzt abgeglichen: ${escapeHtml(when)}${pending ? ` · ${pending} Änderung${pending === 1 ? '' : 'en'} ausstehend` : ''}`;
}

/* ---------- Konto loeschen ---------- */
async function cloudDeleteAccount() {
  const uidPrefix = cloudUserId();
  // 0. Rezeptbibliothek: zuerst alle Veroeffentlichungen zurueckziehen (sofort nicht mehr oeffentlich), dann die oeffentlichen
  //    Bilder loeschen. Bricht etwas ab, entfernt savora_delete_account Profil und Veroeffentlichungen trotzdem vollstaendig;
  //    uebrig gebliebene Bilddateien sind ohne Veroeffentlichung nicht mehr lesbar.
  try {
    await cloudFetch('/rest/v1/rpc/savora_pub_withdraw_all', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    for (let round = 0; round < 20; round++) {
      const items = [];
      const walk = async (prefix) => {
        const list = await (await cloudFetch('/storage/v1/object/list/savora-public', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix, limit: 1000, offset: 0 }) })).json();
        for (const o of (list || [])) { if (!o || !o.name) continue; if (o.id === null) await walk(`${prefix}/${o.name}`); else items.push(`${prefix}/${o.name}`); }
      };
      await walk(uidPrefix);
      if (!items.length) break;
      await cloudFetch('/storage/v1/object/savora-public', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: items }) });
    }
  } catch (e) { if (e && e.offline) throw e; /* Bibliothek nicht eingerichtet oder Bilder schon weg: weiter */ }
  // 1. Bilder entfernen (Storage verwaltet Dateien getrennt von der Datenbank)
  for (let round = 0; round < 20; round++) {
    const list = await (await cloudFetch(`/storage/v1/object/list/${CLOUD_BUCKET}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: uidPrefix, limit: 1000, offset: 0 }) })).json();
    const names = (list || []).filter(o => o && o.name && o.id !== null).map(o => `${uidPrefix}/${o.name}`);
    if (!names.length) break;
    await cloudFetch(`/storage/v1/object/${CLOUD_BUCKET}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: names }) });
  }
  // 2. Datensaetze und Konto
  await cloudFetch('/rest/v1/rpc/savora_delete_account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  cloud.gen++;
  cloudSetSession(null);
  if (typeof libReset === 'function') libReset();
  [CLOUD_QUEUE_KEY, CLOUD_META_KEY, CLOUD_CURSOR_KEY, CLOUD_LAST_KEY].forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
  cloudStateReset();
}

/* ---------- Ausloeser ---------- */
window.addEventListener('online', () => cloudScheduleSync(300));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') cloudScheduleSync(300); });
setInterval(() => { if (document.visibilityState === 'visible') cloudScheduleSync(0); }, 90 * 1000);
function cloudStartup() {
  if (cloudSignedIn()) cloudStateLoad();   // vor dem ersten Abgleich laden (cloudSyncNow wartet ohnehin darauf)
  const redirect = cloudHandleRedirect();
  if (redirect) cloudCompleteRedirect(redirect);
  else if (cloudSignedIn()) cloudScheduleSync(800);
}

/* ---------- Oberflaeche ---------- */
function cloudAccountSectionHtml() {
  const s = cloudSession();
  let body;
  if (s && s.user) {
    body = `<div class="settings-group"><div class="settings-group-card settings-group-card--padded">
        <p class="settings-hint settings-hint--none">Angemeldet als <strong>${escapeHtml(s.user.email || '')}</strong></p>
        <p class="sync-status" id="cloudStatus" role="status" aria-live="polite">${cloudStatusHtml()}</p>
        <button class="primary-btn primary-btn--block" data-action="cloud-sync-now">Jetzt abgleichen</button>
      </div></div>
      <div class="settings-group"><div class="settings-group-card settings-group-card--padded">
        <p class="settings-hint">Deine Rezepte, Fotos, der Wochenplan, die Einkaufsliste, Sammlungen und die Kochbuch-Auswahl werden auf allen Geräten abgeglichen, auf denen du angemeldet bist. Design und Mengenangaben bleiben pro Gerät.</p>
        <button class="ghost-btn primary-btn--block" data-action="cloud-sign-out">Abmelden</button>
        <p class="settings-hint settings-hint--top">Beim Abmelden bleiben deine Daten auf diesem Gerät erhalten.</p>
      </div></div>
      <div class="settings-group"><div class="settings-group-title">Passwort ändern</div><div class="settings-group-card settings-group-card--padded">
        <div class="field"><label for="cloudNewPassword">Neues Passwort</label><input type="password" id="cloudNewPassword" autocomplete="new-password" minlength="8"></div>
        <div class="field"><label for="cloudNewPassword2">Neues Passwort wiederholen</label><input type="password" id="cloudNewPassword2" autocomplete="new-password" minlength="8"></div>
        <p class="cloud-error" id="cloudError" role="alert"></p>
        <button class="ghost-btn primary-btn--block" data-action="cloud-save-password">Passwort speichern</button>
      </div></div>
      <div class="settings-group"><div class="settings-group-title">Konto</div><div class="settings-group-card settings-group-card--padded">
        <p class="settings-hint">Löscht dein Konto und alle Daten in der Cloud endgültig, auch dein öffentliches Profil und deine Veröffentlichungen in der Rezeptbibliothek. Kopien, die andere schon gespeichert haben, bleiben bei ihnen. Die Rezepte auf diesem Gerät bleiben erhalten.</p>
        <button class="ghost-btn danger-btn primary-btn--block" data-action="cloud-delete-account">Konto und Cloud-Daten löschen</button>
      </div></div>`;
  } else {
    const mode = state.cloudMode || 'signin';
    body = `<div class="settings-group"><div class="settings-group-card settings-group-card--padded">
        <p class="settings-hint">Mit einem Konto sind deine Rezepte auf iPhone, Laptop und Tablet gleich und auch auf einem neuen Gerät sofort da. Der Abgleich ersetzt keine Sicherung. Ohne Anmeldung bleibt alles wie bisher nur auf diesem Gerät.</p>
        <div class="field"><label for="cloudEmail">E-Mail</label><input type="email" id="cloudEmail" autocomplete="username" inputmode="email" autocapitalize="off" spellcheck="false" value="${escapeHtml(state.cloudEmail || '')}"></div>
        ${mode !== 'reset' ? `<div class="field"><label for="cloudPassword">Passwort</label><input type="password" id="cloudPassword" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" minlength="8"></div>` : ''}
        ${mode === 'signup' ? `<p class="settings-hint">Mindestens 8 Zeichen. Tipp: vom iPhone im iCloud-Schlüsselbund speichern lassen.</p>` : ''}
        <p class="cloud-error" id="cloudError" role="alert"></p>
        <button class="primary-btn primary-btn--block" data-action="${mode === 'signup' ? 'cloud-sign-up' : mode === 'reset' ? 'cloud-reset' : 'cloud-sign-in'}">${mode === 'signup' ? 'Konto erstellen' : mode === 'reset' ? 'Link zum Zurücksetzen senden' : 'Anmelden'}</button>
        <div class="cloud-links">
          ${mode !== 'signin' ? `<button class="text-btn" data-action="cloud-mode" data-id="signin">Zurück zur Anmeldung</button>` : `${CLOUD_SIGNUP_OPEN ? `<button class="text-btn" data-action="cloud-mode" data-id="signup">Konto erstellen</button>` : ''}<button class="text-btn" data-action="cloud-mode" data-id="reset">Passwort vergessen?</button>`}
        </div>
      </div></div>
      ${CLOUD_SIGNUP_OPEN ? '' : `<p class="settings-hint beta-note">${ICONS.info} Noch kein Zugang? ${escapeHtml(CLOUD_CLOSED_BETA_TEXT)}</p>`}
      <p class="settings-hint">Gespeichert wird in Zürich (Supabase). Nur du hast Zugriff auf deine Daten.</p>`;
  }
  return body;
}
function settingsSyncView() { return settingsDataView('sync'); }
function cloudNewPasswordModal() {
  return sheet('cloud-pw-title', 'Neues Passwort festlegen', `
    <div class="field"><label for="cloudNewPassword">Neues Passwort</label><input type="password" id="cloudNewPassword" autocomplete="new-password" minlength="8"></div>
    <p class="cloud-error" id="cloudError" role="alert"></p>
    <div class="form-actions"><button class="primary-btn" data-action="cloud-save-password">Speichern</button></div>`);
}
function cloudShowError(msg) {
  const el = document.getElementById('cloudError');
  if (el) el.textContent = msg; else showToast(msg, 'error');
}
function cloudSettingsSummary() {
  if (!cloudSignedIn()) return 'Nicht angemeldet';
  return cloudQueueCount() ? 'Änderungen ausstehend' : 'An';
}

async function handleCloudAction(action, id, el) {
  switch (action) {
    case 'cloud-mode':
      state.cloudEmail = (document.getElementById('cloudEmail') || {}).value || state.cloudEmail || '';
      state.cloudMode = id; render();
      return true;
    case 'cloud-sign-in': case 'cloud-sign-up': case 'cloud-reset': {
      const email = ((document.getElementById('cloudEmail') || {}).value || '').trim();
      const password = (document.getElementById('cloudPassword') || {}).value || '';
      state.cloudEmail = email;
      if (!/^\S+@\S+\.\S+$/.test(email)) { cloudShowError('Bitte eine gültige E-Mail eingeben.'); return true; }
      if (action !== 'cloud-reset' && password.length < (action === 'cloud-sign-up' ? 8 : 1)) { cloudShowError(action === 'cloud-sign-up' ? 'Das Passwort braucht mindestens 8 Zeichen.' : 'Bitte das Passwort eingeben.'); return true; }
      el.disabled = true; el.setAttribute('aria-busy', 'true');
      try {
        if (action === 'cloud-sign-in') {
          await cloudAuthSignIn(email, password);
          // Rueckkehr zur beabsichtigten Aktion (z. B. Veroeffentlichen); der Entwurf liegt kontogebunden im Speicher
          if (typeof lib !== 'undefined' && lib.returnTo && lib.returnTo.view) {
            const ret = lib.returnTo; lib.returnTo = null;
            if (ret.view === 'lib-publish' && ret.recipeId && typeof libOpenPublish === 'function') { libOpenPublish(ret.recipeId, ret.publicationId ? { publicationId: ret.publicationId, expectedVersion: ret.expectedVersion } : undefined); showToast('Angemeldet. Der Abgleich startet.'); await cloudSyncNow(); return true; }
            state.view = ret.view;
          }
          render(); showToast('Angemeldet. Der Abgleich startet.');
          await cloudSyncNow(); render();
        } else if (action === 'cloud-sign-up') {
          const r = await cloudAuthSignUp(email, password);
          if (r === 'confirm') { state.cloudMode = 'signin'; render(); showToast('Fast geschafft: Bitte den Link in der E-Mail antippen, dann hier anmelden.', 'info'); }
          else { render(); await cloudSyncNow(); render(); }
        } else {
          await cloudAuthResetPassword(email);
          state.cloudMode = 'signin'; render(); showToast('Falls ein Konto existiert, ist eine E-Mail unterwegs.', 'info');
        }
      } catch (e) { cloudShowError(e.message); }
      finally { if (document.contains(el)) { el.disabled = false; el.removeAttribute('aria-busy'); } }
      return true;
    }
    case 'cloud-save-password': {
      const pw = (document.getElementById('cloudNewPassword') || {}).value || '';
      const pw2El = document.getElementById('cloudNewPassword2');
      if (pw.length < 8) { cloudShowError('Das Passwort braucht mindestens 8 Zeichen.'); return true; }
      if (pw2El && pw2El.value !== pw) { cloudShowError('Die beiden Passwörter stimmen nicht überein.'); return true; }
      el.disabled = true;
      try {
        await cloudAuthUpdatePassword(pw);
        const fromLink = state.modal && state.modal.type === 'cloud-new-password';
        state.view = 'settings-sync';
        if (fromLink) { state.modal = null; render(); } else render();
        showToast('Passwort geändert. Beim nächsten Anmelden das neue verwenden.');
        cloudSyncNow();
      } catch (e) { cloudShowError(e.message); }
      finally { if (document.contains(el)) el.disabled = false; }
      return true;
    }
    case 'cloud-sync-now': {
      const r = await cloudSyncNow();
      if (r.ok) showToast(r.changed ? `${r.changed} Änderung${r.changed === 1 ? '' : 'en'} übernommen` : 'Alles aktuell');
      render();
      return true;
    }
    case 'cloud-sign-out':
      if (cloudQueueCount() && !window.confirm('Es gibt noch nicht übertragene Änderungen. Trotzdem abmelden? Sie bleiben auf diesem Gerät.')) return true;
      await cloudAuthSignOut(); state.cloudMode = 'signin'; render(); showToast('Abgemeldet. Deine Daten bleiben auf diesem Gerät.');
      return true;
    case 'cloud-delete-account': {
      const typed = window.prompt('Konto und alle Cloud-Daten endgültig löschen? Zum Bestätigen LÖSCHEN eintippen.');
      if (!typed || typed.trim().toUpperCase() !== 'LÖSCHEN') return true;
      try { await cloudDeleteAccount(); render(); showToast('Konto gelöscht. Die Rezepte auf diesem Gerät bleiben erhalten.'); }
      catch (e) { showToast(e.message, 'error'); }
      return true;
    }
    default: return typeof handleShareAction === 'function' ? handleShareAction(action, id, el) : false;
  }
}
