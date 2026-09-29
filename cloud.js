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

const cloud = { syncing: false, lastError: null, timer: null, applyingRemote: false, pendingAgain: false };

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
  cloudStoreTokenResponse(await res.json());
  await cloudPrepareFirstSync();
  return true;
}
async function cloudAuthSignUp(email, password) {
  const res = await cloudFetch('/auth/v1/signup?redirect_to=' + encodeURIComponent(CLOUD_SITE_URL), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }, false);
  const data = await res.json();
  if (data.access_token) { cloudStoreTokenResponse(data); await cloudPrepareFirstSync(); return 'signed-in'; }
  return 'confirm';
}
async function cloudAuthResetPassword(email) {
  await cloudFetch('/auth/v1/recover?redirect_to=' + encodeURIComponent(CLOUD_SITE_URL), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }, false);
}
async function cloudAuthUpdatePassword(password) {
  await cloudFetch('/auth/v1/user', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
}
async function cloudAuthSignOut() {
  try { await cloudFetch('/auth/v1/logout', { method: 'POST' }); } catch (e) { /* offline abmelden geht trotzdem */ }
  cloudSetSession(null);
  // Beim naechsten Anmelden wird neu zusammengefuehrt; lokale Daten bleiben auf dem Geraet.
  [CLOUD_QUEUE_KEY, CLOUD_META_KEY, CLOUD_CURSOR_KEY, CLOUD_LAST_KEY].forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
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

/* ---------- Aenderungen erfassen ---------- */
function cloudQueue() { return readJsonKey(CLOUD_QUEUE_KEY, {}); }
function cloudMeta() { return readJsonKey(CLOUD_META_KEY, {}); }
function cloudMark(kind, id, deleted, changedAt) {
  if (!cloudSignedIn() || cloud.applyingRemote || id === undefined || id === null) return;
  const key = kind + '|' + id;
  const q = cloudQueue(); const m = cloudMeta();
  const at = changedAt || Date.now();
  q[key] = { kind, id: String(id), deleted: !!deleted, at };
  m[key] = at;
  writeJsonKey(CLOUD_QUEUE_KEY, q); writeJsonKey(CLOUD_META_KEY, m);
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
// Einstellungen, die geraeteuebergreifend Sinn ergeben (Darstellung bleibt pro Geraet).
const CLOUD_SETTING_KEYS = { collections: COLLECTIONS_KEY, cookbookConfig: COOKBOOK_CONFIG_KEY, cookbookTitle: COOKBOOK_TITLE_KEY, senderName: SENDER_NAME_KEY };
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
  const q = cloudQueue(); const m = cloudMeta();
  const add = (kind, id, at) => { const key = kind + '|' + id; if (!q[key]) { q[key] = { kind, id: String(id), deleted: false, at }; m[key] = at; } };
  (await dbGetAll()).forEach(r => add('recipe', r.id, r.updatedAt || r.createdAt || 1));
  (await dbGetAllMealplan()).forEach(d => add('mealplan', d.date, 1));
  (await dbGetAllShopping()).forEach(s => add('shopping', s.id, s.createdAt || 1));
  const imageIds = new Set((await dbGetAll()).map(r => r.imageId).filter(Boolean));
  imageIds.forEach(id => add('image', id, 1));
  Object.entries(CLOUD_SETTING_KEYS).forEach(([name, key]) => { const v = localStorage.getItem(key); if (v && v !== '[]' && v !== '""') add('setting', name, 1); });
  writeJsonKey(CLOUD_QUEUE_KEY, q); writeJsonKey(CLOUD_META_KEY, m);
}

/* ---------- Abgleich ---------- */
function cloudScheduleSync(delay) {
  if (!cloudSignedIn()) return;
  clearTimeout(cloud.timer);
  cloud.timer = setTimeout(() => cloudSyncNow(), delay || 0);
}
async function cloudReadLocal(kind, id) {
  if (kind === 'recipe') return (await dbGetAll()).find(r => r.id === id) || null;
  if (kind === 'mealplan') return (await dbGetAllMealplan()).find(d => d.date === id) || null;
  if (kind === 'shopping') return (await dbGetAllShopping()).find(s => s.id === id) || null;
  if (kind === 'setting') { const v = localStorage.getItem(CLOUD_SETTING_KEYS[id]); return v === null ? null : { value: v }; }
  return null;
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
  cloud.applyingRemote = true;
  try { await (cloudOrig.dbPutImage || dbPutImage)({ id, blob, thumbBlob, mime: blob.type || 'image/jpeg' }); }
  finally { cloud.applyingRemote = false; }
}

async function cloudPush() {
  const q = cloudQueue();
  const entries = Object.entries(q);
  if (!entries.length) return 0;
  const rows = [];
  const imageJobs = [];
  for (const [key, e] of entries) {
    if (e.kind === 'image') { imageJobs.push([key, e]); continue; }
    const local = e.deleted ? null : await cloudReadLocal(e.kind, e.id);
    rows.push({ user_id: cloudUserId(), kind: e.kind, id: e.id, data: local, deleted: e.deleted || !local, client_updated_at: e.at });
  }
  for (let i = 0; i < rows.length; i += 200) {
    await cloudFetch('/rest/v1/savora_records?on_conflict=user_id,kind,id', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows.slice(i, i + 200)),
    });
  }
  for (const [key, e] of imageJobs) {
    try { await cloudPushImage(e.id, e.deleted); }
    catch (err) { if (err.offline) throw err; if (err.status !== 404) console.warn('Bild-Abgleich', e.id, err.message); }
  }
  // Nur entfernen, was waehrend des Hochladens nicht erneut geaendert wurde.
  const now = cloudQueue();
  entries.forEach(([key, e]) => { if (now[key] && now[key].at === e.at) delete now[key]; });
  writeJsonKey(CLOUD_QUEUE_KEY, now);
  return rows.length + imageJobs.length;
}

async function cloudApplyRemote(row) {
  const key = row.kind + '|' + row.id;
  const localAt = cloudMeta()[key] || 0;
  const pending = cloudQueue()[key];
  if (pending && pending.at > row.client_updated_at) return false; // lokaler Stand ist neuer und wird hochgeladen
  if (localAt > row.client_updated_at) return false;
  cloud.applyingRemote = true;
  try {
    if (row.kind === 'recipe') {
      if (row.deleted) await cloudOrig.dbDelete(row.id);
      else {
        await cloudOrig.dbPut(row.data);
        if (row.data && row.data.imageId && !(await dbGetImage(row.data.imageId))) {
          try { await cloudFetchImage(row.data.imageId); } catch (e) { /* Bild folgt beim naechsten Abgleich */ }
        }
      }
    } else if (row.kind === 'mealplan') {
      if (row.deleted || !row.data) await cloudOrig.dbPutMealplanDay({ date: row.id, recipeIds: [], entries: [] });
      else await cloudOrig.dbPutMealplanDay(row.data);
    } else if (row.kind === 'shopping') {
      if (row.deleted) await cloudOrig.dbDeleteShopping(row.id);
      else await cloudOrig.dbPutShopping(row.data);
    } else if (row.kind === 'setting') {
      const lsKey = CLOUD_SETTING_KEYS[row.id];
      if (lsKey && row.data && typeof row.data.value === 'string') {
        cloudOrigSetItem.call(localStorage, lsKey, row.data.value);
        if (row.id === 'cookbookTitle') state.cookbookTitle = row.data.value;
        if (row.id === 'senderName') state.senderName = row.data.value;
      }
    }
  } finally { cloud.applyingRemote = false; }
  const m = cloudMeta(); m[key] = row.client_updated_at; writeJsonKey(CLOUD_META_KEY, m);
  return true;
}

async function cloudPull() {
  let cursor = readJsonKey(CLOUD_CURSOR_KEY, null);
  let changed = 0;
  for (let page = 0; page < 50; page++) {
    // 5 Sekunden Ueberlappung: gleichzeitig abgeschlossene Schreibvorgaenge werden sicher erfasst,
    // doppelt gelesene Zeilen sind unschaedlich (gleicher Zeitstempel wird uebersprungen).
    let q = '/rest/v1/savora_records?select=kind,id,data,deleted,client_updated_at,server_updated_at&order=server_updated_at.asc&limit=500';
    if (cursor) q += '&server_updated_at=gt.' + encodeURIComponent(new Date(new Date(cursor).getTime() - 5000).toISOString());
    const rows = await (await cloudFetch(q)).json();
    let maxCursor = cursor;
    for (const row of rows) {
      if (await cloudApplyRemote(row)) changed++;
      if (!maxCursor || row.server_updated_at > maxCursor) maxCursor = row.server_updated_at;
    }
    const advanced = maxCursor !== cursor;
    cursor = maxCursor;
    if (cursor) writeJsonKey(CLOUD_CURSOR_KEY, cursor);
    if (rows.length < 500 || !advanced) break;
  }
  if (!cursor) writeJsonKey(CLOUD_CURSOR_KEY, new Date(0).toISOString());
  return changed;
}

async function cloudSyncNow(opts = {}) {
  if (!cloudSignedIn()) return { ok: false, reason: 'signed-out' };
  if (cloud.syncing) { cloud.pendingAgain = true; return { ok: false, reason: 'busy' }; }
  if (navigator.onLine === false) { cloud.lastError = 'Offline. Änderungen werden später übertragen.'; cloudRefreshStatus(); return { ok: false, reason: 'offline' }; }
  cloud.syncing = true; cloudRefreshStatus();
  let changed = 0;
  try {
    await cloudPush();
    changed = await cloudPull();
    await cloudPush(); // was beim Pull als lokal neuer erkannt wurde
    cloud.lastError = null;
    writeJsonKey(CLOUD_LAST_KEY, Date.now());
  } catch (e) {
    cloud.lastError = e.message || 'Abgleich fehlgeschlagen';
    if (e.status === 401) cloud.lastError = 'Sitzung abgelaufen. Bitte neu anmelden.';
  } finally {
    cloud.syncing = false;
  }
  if (changed) await cloudReloadState();
  cloudRefreshStatus();
  if (cloud.pendingAgain) { cloud.pendingAgain = false; cloudScheduleSync(500); }
  return { ok: !cloud.lastError, changed };
}
// Nach eingehenden Aenderungen neu laden, aber nie mitten in einer Bearbeitung oder im Kochmodus
// neu zeichnen (sonst gingen Eingaben verloren oder die Ansicht wuerde springen).
async function cloudReloadState() {
  await loadRecipes(); await loadShopping(); await loadMealplan();
  state.cookbookTitle = localStorage.getItem(COOKBOOK_TITLE_KEY) || '';
  if (state.view === 'form' || state.view === 'cookmode' || state.modal) return;
  render();
}
function cloudRefreshStatus() {
  const el = document.getElementById('cloudStatus');
  if (el) el.innerHTML = cloudStatusHtml();
}
function cloudStatusHtml() {
  const pending = Object.keys(cloudQueue()).length;
  const last = readJsonKey(CLOUD_LAST_KEY, null);
  if (cloud.syncing) return `<span class="sync-dot sync-dot--busy"></span>Wird abgeglichen …`;
  if (cloud.lastError) return `<span class="sync-dot sync-dot--warn"></span>${escapeHtml(cloud.lastError)}`;
  const when = last ? new Date(last).toLocaleString('de-CH', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'noch nie';
  return `<span class="sync-dot sync-dot--ok"></span>Zuletzt abgeglichen: ${escapeHtml(when)}${pending ? ` · ${pending} Änderung${pending === 1 ? '' : 'en'} ausstehend` : ''}`;
}

/* ---------- Konto loeschen ---------- */
async function cloudDeleteAccount() {
  const uidPrefix = cloudUserId();
  // 1. Bilder entfernen (Storage verwaltet Dateien getrennt von der Datenbank)
  for (let round = 0; round < 20; round++) {
    const list = await (await cloudFetch(`/storage/v1/object/list/${CLOUD_BUCKET}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: uidPrefix, limit: 1000, offset: 0 }) })).json();
    const names = (list || []).filter(o => o && o.name && o.id !== null).map(o => `${uidPrefix}/${o.name}`);
    if (!names.length) break;
    await cloudFetch(`/storage/v1/object/${CLOUD_BUCKET}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: names }) });
  }
  // 2. Datensaetze und Konto
  await cloudFetch('/rest/v1/rpc/savora_delete_account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  cloudSetSession(null);
  [CLOUD_QUEUE_KEY, CLOUD_META_KEY, CLOUD_CURSOR_KEY, CLOUD_LAST_KEY].forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
}

/* ---------- Ausloeser ---------- */
window.addEventListener('online', () => cloudScheduleSync(300));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') cloudScheduleSync(300); });
setInterval(() => { if (document.visibilityState === 'visible') cloudScheduleSync(0); }, 90 * 1000);
function cloudStartup() {
  const redirect = cloudHandleRedirect();
  if (redirect) cloudCompleteRedirect(redirect);
  else if (cloudSignedIn()) cloudScheduleSync(800);
}

/* ---------- Oberflaeche ---------- */
function settingsSyncView() {
  const s = cloudSession();
  let body;
  if (s && s.user) {
    body = `<div class="settings-group"><div class="settings-group-card settings-group-card--padded">
        <p class="settings-hint settings-hint--none">Angemeldet als <strong>${escapeHtml(s.user.email || '')}</strong></p>
        <p class="sync-status" id="cloudStatus" role="status" aria-live="polite">${cloudStatusHtml()}</p>
        <button class="primary-btn primary-btn--block" data-action="cloud-sync-now">Jetzt abgleichen</button>
      </div></div>
      <div class="settings-group"><div class="settings-group-card settings-group-card--padded">
        <p class="settings-hint">Deine Rezepte, Fotos, der Wochenplan, die Einkaufsliste, Sammlungen und die Kochbuch-Auswahl werden auf allen Geräten abgeglichen, auf denen du angemeldet bist. Darstellung und Masseinheiten bleiben pro Gerät.</p>
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
        <p class="settings-hint">Löscht dein Konto und alle Daten in der Cloud endgültig. Die Rezepte auf diesem Gerät bleiben erhalten.</p>
        <button class="ghost-btn danger-btn primary-btn--block" data-action="cloud-delete-account">Konto und Cloud-Daten löschen</button>
      </div></div>`;
  } else {
    const mode = state.cloudMode || 'signin';
    body = `<div class="settings-group"><div class="settings-group-card settings-group-card--padded">
        <p class="settings-hint">Mit einem Konto sind deine Rezepte auf iPhone, Laptop und Tablet gleich und sind auch auf einem neuen Gerät sofort da. Die Synchronisation ersetzt keine Sicherung. Ohne Anmeldung bleibt alles wie bisher nur auf diesem Gerät.</p>
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
  return settingsDetailShell('Synchronisation', body) + (state.modal && state.modal.type === 'cloud-new-password' ? cloudNewPasswordModal() : '');
}
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
  if (!cloudSignedIn()) return 'Aus';
  return Object.keys(cloudQueue()).length ? 'Änderungen ausstehend' : 'An';
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
      if (Object.keys(cloudQueue()).length && !window.confirm('Es gibt noch nicht übertragene Änderungen. Trotzdem abmelden? Sie bleiben auf diesem Gerät.')) return true;
      await cloudAuthSignOut(); state.cloudMode = 'signin'; render(); showToast('Abgemeldet. Deine Daten bleiben auf diesem Gerät.');
      return true;
    case 'cloud-delete-account': {
      const typed = window.prompt('Konto und alle Cloud-Daten endgültig löschen? Zum Bestätigen LÖSCHEN eintippen.');
      if (!typed || typed.trim().toUpperCase() !== 'LÖSCHEN') return true;
      try { await cloudDeleteAccount(); render(); showToast('Konto gelöscht. Die Rezepte auf diesem Gerät bleiben erhalten.'); }
      catch (e) { showToast(e.message, 'error'); }
      return true;
    }
    default: return false;
  }
}
