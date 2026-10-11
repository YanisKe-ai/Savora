/* ---------- Savora Teilen: Rezepte an verbundene Profile senden ----------
   Grundsaetze:
   - Nur mit Konto (cloud.js). Ohne Anmeldung passiert nichts, kein Netzwerkverkehr.
   - Nichts wird automatisch geteilt: Man sieht nie das Kochbuch eines anderen, nur was einem aktiv
     gesendet wird. Gesendet werden kann nur zwischen bestaetigten Verbindungen.
   - Empfangen heisst: erst ansehen (Vorschau), dann uebernehmen. Uebernehmen legt eine eigene
     Kopie mit neuer ID an (sofort nutzbar: skalieren, Einkauf, Kochmodus), Ablehnen verwirft.
   - Alle Server-Zugriffe laufen ueber geprueefte Datenbankfunktionen (supabase/paket36-teilen.sql).
   - Gesendete Daten werden vor dem Uebernehmen bereinigt (Whitelist fuer Persoenliches, Tiefenlimit),
     weil sie von einem anderen Konto stammen. */

const SHARE_DONE_KEY = 'savora-share-done';
const SHARE_INVITE_KEY = 'savora-share-invite';
const SHARE_DROP_KEYS = ['id', 'favorite', 'cookCount', 'lastCookedAt', 'cookLog', 'createdAt', 'updatedAt', 'imageId', 'image', 'collections', 'collectionIds', 'sharedBy'];
const SHARE_MAX_IMAGE_CHARS = 1400000;
const share = { fetchedAt: 0, profile: undefined, connections: [], inbox: [], count: 0, loading: false, error: null, previewId: null, previewImage: null, timer: null };

/* ---------- Server ---------- */
async function shareRpc(name, args) {
  const res = await cloudFetch('/rest/v1/rpc/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args || {}) });
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}
function shareDoneIds() { return readJsonKey(SHARE_DONE_KEY, []); }
async function shareFlushDone() {
  const ids = shareDoneIds();
  if (!ids.length) return;
  const left = [];
  for (const id of ids) { try { await shareRpc('savora_share_done', { p_id: id }); } catch (e) { if (e.offline) left.push(id); } }
  writeJsonKey(SHARE_DONE_KEY, left);
}
async function shareRefresh() {
  if (!cloudSignedIn() || share.loading) return;
  share.loading = true;
  try {
    await shareFlushDone();
    const [profile, connections, inbox] = await Promise.all([shareRpc('savora_profile_get'), shareRpc('savora_connections_list'), shareRpc('savora_inbox')]);
    const hidden = new Set(shareDoneIds());
    share.profile = profile || null;
    share.connections = connections || [];
    share.inbox = (inbox || []).filter(x => !hidden.has(x.id));
    share.count = share.connections.filter(c => c.state === 'incoming').length + share.inbox.length;
    share.error = null;
  } catch (e) { share.error = e.message || 'Laden fehlgeschlagen'; }
  finally { share.loading = false; share.fetchedAt = Date.now(); }
  shareRerender();
}
function shareRerender() {
  const v = state.view || '';
  if (state.modal) return;
  if (v !== 'settings-share' && v !== 'settings-share-preview' && v !== 'settings') return;
  const a = document.activeElement;
  if (a && /^(INPUT|TEXTAREA)$/.test(a.tagName)) { share.dirty = true; return; }   // nie mitten in einer Eingabe neu zeichnen, wird danach nachgeholt
  share.dirty = false;
  render();
}
document.addEventListener('focusout', () => { if (share.dirty) setTimeout(shareRerender, 150); });
async function shareCheckCount() {
  if (!cloudSignedIn() || document.visibilityState !== 'visible') return;
  try {
    const n = Number(await shareRpc('savora_inbox_count'));
    if (n > share.count) {
      showToast(n === 1 ? 'Neu: 1 Rezept oder Anfrage wartet auf dich' : `Neu: ${n} Rezepte oder Anfragen warten auf dich`, 'info');
      await shareRefresh();
    } else if (n !== share.count) share.count = n;
    if (state.view === 'settings') shareRerender();
  } catch (e) { /* offline oder abgemeldet: still */ }
}
function shareStartup() {
  shareHandleInviteLink();
  if (cloudSignedIn()) setTimeout(() => shareRefresh(), 1500);
  clearInterval(share.timer);
  share.timer = setInterval(shareCheckCount, 90 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(shareCheckCount, 600); });
}
function shareHandleInviteLink() {
  try {
    const u = new URL(location.href);
    const code = u.searchParams.get('freund');
    if (!code) return;
    u.searchParams.delete('freund');
    history.replaceState(history.state, '', u.pathname + (u.search || '') + u.hash);
    if (!/^SAV-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(code)) return;
    sessionStorage.setItem(SHARE_INVITE_KEY, code.toUpperCase());
    setTimeout(() => {
      if (cloudSignedIn()) { state.view = 'settings-share'; render(); shareRefresh(); }
      else showToast('Melde dich an (Einstellungen, Konto und Sicherung), um die Einladung anzunehmen.', 'info');
    }, 800);
  } catch (e) { /* ungueltige Adresse: ignorieren */ }
}
function shareReset() {
  share.fetchedAt = 0; share.profile = undefined; share.connections = []; share.inbox = []; share.count = 0; share.error = null; share.previewId = null; share.previewImage = null;
  try { localStorage.removeItem(SHARE_DONE_KEY); sessionStorage.removeItem(SHARE_INVITE_KEY); } catch (e) {}
}
function shareSettingsSummary() {
  if (!cloudSignedIn()) return 'Konto nötig';
  if (share.count > 0) return `${share.count} neu`;
  return share.profile ? '@' + share.profile.handle : 'Einrichten';
}

/* ---------- Bereinigung ---------- */
// Tiefenkopie nur mit harmlosen JSON-Werten: kein Prototyp-Zugriff, begrenzte Tiefe und Laenge.
function shareClean(v, depth) {
  depth = depth || 0;
  if (v === null || typeof v === 'boolean') return v;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v === 'string') return v.slice(0, 20000);
  if (depth > 5) return null;
  if (Array.isArray(v)) return v.slice(0, 500).map(x => shareClean(x, depth + 1));
  if (typeof v === 'object') {
    const out = {};
    Object.keys(v).slice(0, 80).forEach(k => { if (k !== '__proto__' && k !== 'constructor' && k !== 'prototype') out[k] = shareClean(v[k], depth + 1); });
    return out;
  }
  return null;
}
function shareStr(v, max) { return typeof v === 'string' ? v.trim().slice(0, max) : ''; }
function shareStrList(v) { return Array.isArray(v) ? v.filter(x => typeof x === 'string').map(x => x.trim().slice(0, 60)).filter(Boolean).slice(0, 40) : []; }
// Eingehendes (oder zu sendendes) Rezept in ein sauberes, lokales Rezept umwandeln. Neue ID, nichts Persoenliches.
function shareRecipeFromPayload(payload, fromHandle) {
  const o = shareClean(payload) || {};
  SHARE_DROP_KEYS.forEach(k => { delete o[k]; });
  const r = Object.assign(emptyRecipe(), o);
  r.id = uid();
  r.title = shareStr(o.title, 200) || 'Rezept';
  r.servings = Number.isFinite(Number(o.servings)) && Number(o.servings) >= 0 ? Number(o.servings) : 0;
  r.timeMinutes = Number.isFinite(Number(o.timeMinutes)) && Number(o.timeMinutes) >= 0 ? Number(o.timeMinutes) : 0;
  r.difficulty = shareStr(o.difficulty, 30);
  r.notes = shareStr(o.notes, 20000);
  r.tags = shareStrList(o.tags); r.diet = shareStrList(o.diet); r.categoryTags = shareStrList(o.categoryTags); r.suppressedTags = shareStrList(o.suppressedTags);
  r.ingredients = (Array.isArray(o.ingredients) ? o.ingredients : []).filter(i => i && typeof i === 'object' && !Array.isArray(i)).map(i => {
    const out = Object.assign({}, i);
    out.name = shareStr(i.name, 300);
    out.unit = shareStr(i.unit, 40);
    out.amount = (typeof i.amount === 'number' && isFinite(i.amount)) ? i.amount : shareStr(i.amount, 40);
    return out;
  });
  if (!r.ingredients.length) r.ingredients = [{ amount: '', unit: '', name: '' }];
  r.steps = (Array.isArray(o.steps) ? o.steps : []).map(s => ({ text: shareStr(s && typeof s === 'object' ? s.text : s, 4000) })).filter(s => s.text);
  if (!r.steps.length) r.steps = [{ text: '' }];
  r.source = (typeof o.source === 'string' && /^https?:\/\/\S+$/i.test(o.source.trim())) ? o.source.trim().slice(0, 500) : null;
  r.favorite = false; r.cookCount = 0; r.cookLog = [];
  r.createdAt = Date.now(); r.updatedAt = Date.now();
  if (fromHandle) r.sharedBy = fromHandle;
  return r;
}
function shareBuildPayload(recipe) {
  const o = shareClean(recipe) || {};
  SHARE_DROP_KEYS.forEach(k => { delete o[k]; });
  return o;
}
async function shareImageDataUrl(recipe) {
  if (!recipe.imageId) return null;
  try {
    const img = await dbGetImage(recipe.imageId);
    if (!img || !img.blob) return null;
    let url = await blobToDataUrl(img.blob);
    if (url.length > SHARE_MAX_IMAGE_CHARS && img.thumbBlob) url = await blobToDataUrl(img.thumbBlob);
    if (url.length > SHARE_MAX_IMAGE_CHARS) return null;
    return /^data:image\/(jpeg|png|webp);base64,/.test(url) ? url : null;
  } catch (e) { return null; }
}

/* ---------- Oberflaeche ---------- */
function shareInviteLink(p) { return CLOUD_SITE_URL + '?freund=' + encodeURIComponent(p.invite_code); }
function shareName(x) { return x.display_name || '@' + x.handle; }
function shareWho(x) { return `<strong>${escapeHtml(shareName(x))}</strong>${x.display_name ? ` <span class="share-handle">@${escapeHtml(x.handle)}</span>` : ''}`; }

function settingsShareView() {
  let body;
  if (!cloudSignedIn()) {
    body = `<div class="settings-group"><div class="settings-group-card settings-group-card--padded">
      <p class="settings-hint settings-hint--none">Mit einem Konto kannst du Rezepte direkt an Freunde in Savora senden und von ihnen bekommen. Niemand sieht dein Kochbuch, es kommt nur an, was du aktiv sendest.</p>
      <button class="primary-btn primary-btn--block" data-action="goto-view" data-view="settings-sync">Zur Anmeldung</button>
    </div></div>`;
  } else if (share.profile === undefined) {
    if (!share.loading && !share.error) setTimeout(shareRefresh, 0);
    body = `<p class="settings-hint">${share.error ? escapeHtml(share.error) : 'Wird geladen …'}</p>${share.error ? '<button class="ghost-btn primary-btn--block" data-action="share-refresh">Nochmals versuchen</button>' : ''}`;
  } else if (!share.profile) {
    body = `<div class="settings-group"><div class="settings-group-title">Dein Profil</div><div class="settings-group-card settings-group-card--padded">
      <p class="settings-hint settings-hint--none">Lege einen Profilnamen fest, unter dem dich Freunde finden. Dein Kochbuch bleibt privat.</p>
      <div class="field"><label for="shareHandle">Profilname</label><input id="shareHandle" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="24" placeholder="z. B. yanis_kocht"></div>
      <div class="field"><label for="shareName">Anzeigename (optional)</label><input id="shareName" autocomplete="off" maxlength="40" placeholder="z. B. Yanis"></div>
      <p class="cloud-error" id="shareError" role="alert"></p>
      <button class="primary-btn primary-btn--block" data-action="share-profile-save">Profil erstellen</button>
      <p class="settings-hint settings-hint--top">3 bis 24 Zeichen: Kleinbuchstaben, Zahlen und Unterstrich.</p>
    </div></div>`;
  } else {
    const p = share.profile;
    const incoming = share.connections.filter(c => c.state === 'incoming');
    const connected = share.connections.filter(c => c.state === 'connected');
    const outgoing = share.connections.filter(c => c.state === 'outgoing');
    const blocked = share.connections.filter(c => c.state === 'blocked');
    if (!share.loading && Date.now() - share.fetchedAt > 2000) setTimeout(shareRefresh, 0);   // beim Oeffnen frisch laden
    const prefill = sessionStorage.getItem(SHARE_INVITE_KEY) || '';
    const row = (inner, actions) => `<div class="share-row"><div class="share-row-text">${inner}</div><div class="share-row-actions">${actions}</div></div>`;
    body = `
    ${share.inbox.length ? `<div class="settings-group"><div class="settings-group-title">Posteingang</div><div class="settings-group-card settings-group-card--padded">
      ${share.inbox.map(s => row(`${shareWho({ display_name: s.from_name, handle: s.from_handle })} schickt dir<br><span class="share-title">${escapeHtml(s.title)}</span>${s.message ? `<br><span class="share-msg">„${escapeHtml(s.message)}“</span>` : ''}`,
        `<button class="primary-btn primary-btn--small" data-action="share-open-preview" data-id="${s.id}">Ansehen</button>`)).join('')}
    </div></div>` : ''}
    ${incoming.length ? `<div class="settings-group"><div class="settings-group-title">Anfragen</div><div class="settings-group-card settings-group-card--padded">
      ${incoming.map(c => row(`${shareWho(c)} möchte sich mit dir verbinden`,
        `<button class="primary-btn primary-btn--small" data-action="share-respond" data-id="${c.handle}" data-answer="accept">Annehmen</button><button class="ghost-btn primary-btn--small" data-action="share-respond" data-id="${c.handle}" data-answer="decline">Ablehnen</button><button class="text-btn" data-action="share-respond" data-id="${c.handle}" data-answer="block">Blockieren</button>`)).join('')}
    </div></div>` : ''}
    <div class="settings-group"><div class="settings-group-title">Freund hinzufügen</div><div class="settings-group-card settings-group-card--padded">
      <div class="field"><label for="shareTarget">Profilname oder Einladungscode</label><input id="shareTarget" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="@name oder SAV-XXXX-XXXX" value="${escapeHtml(prefill)}"></div>
      <p class="cloud-error" id="shareError" role="alert"></p>
      <button class="primary-btn primary-btn--block" data-action="share-connect">Anfrage senden</button>
      <p class="settings-hint settings-hint--top">Die andere Person muss deine Anfrage bestätigen. Erst dann könnt ihr euch Rezepte senden.</p>
    </div></div>
    <div class="settings-group"><div class="settings-group-title">Verbindungen</div><div class="settings-group-card settings-group-card--padded">
      ${connected.length || outgoing.length || blocked.length ? '' : '<p class="settings-hint settings-hint--none">Noch niemand verbunden.</p>'}
      ${connected.map(c => row(shareWho(c), `<button class="text-btn" data-action="share-remove" data-id="${c.handle}">Entfernen</button>`)).join('')}
      ${outgoing.map(c => row(`${shareWho(c)}<br><span class="share-msg">Anfrage wartet auf Bestätigung</span>`, `<button class="text-btn" data-action="share-remove" data-id="${c.handle}">Zurückziehen</button>`)).join('')}
      ${blocked.map(c => row(`${shareWho(c)}<br><span class="share-msg">Blockiert</span>`, `<button class="text-btn" data-action="share-remove" data-id="${c.handle}">Entsperren</button>`)).join('')}
    </div></div>
    <div class="settings-group"><div class="settings-group-title">Dein Profil</div><div class="settings-group-card settings-group-card--padded">
      <p class="settings-hint settings-hint--none">${shareWho(p)}</p>
      <p class="share-code" aria-label="Dein Einladungscode">${escapeHtml(p.invite_code)}</p>
      <div class="share-row-actions share-row-actions--wrap">
        <button class="ghost-btn primary-btn--small" data-action="share-copy-link">${ICONS.link} Einladungslink kopieren</button>
        <button class="ghost-btn primary-btn--small" data-action="share-copy-code">${ICONS.copy} Code kopieren</button>
      </div>
      <p class="settings-hint settings-hint--top">Wer deinen Code oder Link hat, kann dir eine Anfrage schicken. Du entscheidest, ob du sie annimmst.</p>
      <div class="field"><label for="shareHandle">Profilname</label><input id="shareHandle" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="24" value="${escapeHtml(p.handle)}"></div>
      <div class="field"><label for="shareName">Anzeigename</label><input id="shareName" autocomplete="off" maxlength="40" value="${escapeHtml(p.display_name || '')}"></div>
      <p class="cloud-error" id="shareError" role="alert"></p>
      <button class="ghost-btn primary-btn--block" data-action="share-profile-save">Profil speichern</button>
      <button class="text-btn" data-action="share-invite-reset">Neuen Einladungscode erzeugen</button>
    </div></div>`;
  }
  return settingsDetailShell('Rezepte mit anderen teilen', body + senderNameSectionHtml(), 'settings-page--cols');
}

function shareFindInbox(id) { return share.inbox.find(x => x.id === id) || null; }
function settingsSharePreviewView() {
  const item = shareFindInbox(share.previewId);
  if (!item) { return settingsDetailShell('Rezept ansehen', '<p class="settings-hint">Dieses Rezept ist nicht mehr da.</p><button class="ghost-btn primary-btn--block" data-action="goto-view" data-view="settings-share">Zurück</button>'); }
  const r = shareRecipeFromPayload(item.recipe, item.from_handle);
  const meta = [r.timeMinutes ? `${r.timeMinutes} Min.` : '', yieldKnown(r) ? servingLabel(r, r.servings) : 'Ergibt: offen', r.difficulty || ''].filter(Boolean);
  const ings = r.ingredients.filter(i => (i.name || '').trim());
  const body = `
    <div class="share-preview">
      <p class="share-from">Von ${shareWho({ display_name: item.from_name, handle: item.from_handle })}</p>
      ${item.message ? `<p class="share-msg share-msg--box">„${escapeHtml(item.message)}“</p>` : ''}
      ${share.previewImage ? `<img class="share-preview-img" src="${share.previewImage}" alt="${escapeHtml(r.title)}">` : ''}
      <h2 class="detail-title-v2">${escapeHtml(r.title)}</h2>
      <p class="detail-meta-v2">${meta.map(escapeHtml).join(' • ')}</p>
      <h3 class="share-sub">Zutaten</h3>
      <ul class="share-list">${ings.map(i => `<li>${escapeHtml(ingredientText(i))}</li>`).join('') || '<li>Keine Zutaten</li>'}</ul>
      <h3 class="share-sub">Zubereitung</h3>
      <ol class="share-list">${r.steps.filter(s => s.text).map(s => `<li>${escapeHtml(s.text).replace(/\n/g, '<br>')}</li>`).join('') || '<li>Keine Schritte</li>'}</ol>
      ${r.notes ? `<h3 class="share-sub">Notizen</h3><p>${escapeHtml(r.notes).replace(/\n/g, '<br>')}</p>` : ''}
      <div class="share-preview-actions">
        <button class="primary-btn primary-btn--block" data-action="share-accept" data-id="${item.id}">${ICONS.check} Ins Kochbuch übernehmen</button>
        <button class="ghost-btn primary-btn--block" data-action="share-decline" data-id="${item.id}">Ablehnen</button>
      </div>
    </div>`;
  return settingsDetailShell('Rezept ansehen', body);
}

function shareSendModal() {
  if (!state.modal || state.modal.type !== 'share-send') return '';
  const r = state.recipes.find(x => x.id === state.modal.recipeId);
  if (!r) return '';
  let inner;
  if (!cloudSignedIn()) {
    inner = `<p class="settings-hint settings-hint--none">Zum Senden brauchst du ein Konto.</p><div class="form-actions"><button class="primary-btn" data-action="goto-view" data-view="settings-sync">Zur Anmeldung</button></div>`;
  } else if (!share.profile) {
    inner = `<p class="settings-hint settings-hint--none">Lege zuerst dein Profil an und verbinde dich mit einem Freund.</p><div class="form-actions"><button class="primary-btn" data-action="goto-view" data-view="settings-share">Zu Freunde &amp; Rezepte</button></div>`;
  } else {
    const people = share.connections.filter(c => c.state === 'connected');
    inner = people.length ? `
      <fieldset class="share-people"><legend class="sr-only">Empfänger</legend>
        ${people.map((c, i) => `<label class="share-person"><input type="radio" name="shareTo" value="${c.handle}" ${i === 0 ? 'checked' : ''}><span>${shareWho(c)}</span></label>`).join('')}
      </fieldset>
      <div class="field"><label for="shareMessage">Nachricht (optional)</label><textarea id="shareMessage" maxlength="200" rows="2" placeholder="z. B. Probier das mal!"></textarea></div>
      <p class="cloud-error" id="shareError" role="alert"></p>
      <div class="form-actions"><button class="primary-btn" data-action="share-send" data-id="${r.id}">Senden</button><button class="ghost-btn" data-action="close-modal">Abbrechen</button></div>`
      : `<p class="settings-hint settings-hint--none">Du bist noch mit niemandem verbunden. Füge zuerst einen Freund hinzu.</p><div class="form-actions"><button class="primary-btn" data-action="goto-view" data-view="settings-share">Freund hinzufügen</button></div>`;
  }
  return sheet('share-send-title', 'Rezept senden', `<p class="settings-hint settings-hint--none">„${escapeHtml(r.title || 'Rezept')}“ wird als Kopie gesendet. Dein Original bleibt unverändert.</p>${inner}`);
}

function shareShowError(msg) {
  const el = document.getElementById('shareError');
  if (el) el.textContent = msg; else showToast(msg, 'error');
}
async function shareCopy(text, okMsg) {
  try { await navigator.clipboard.writeText(text); showToast(okMsg); }
  catch (e) { window.prompt('Zum Kopieren markieren:', text); }
}

async function handleShareAction(action, id, el) {
  switch (action) {
    case 'share-refresh': share.error = null; await shareRefresh(); return true;
    case 'share-profile-save': {
      const h = (document.getElementById('shareHandle') || {}).value || '';
      const n = (document.getElementById('shareName') || {}).value || '';
      el.disabled = true;
      try { share.profile = await shareRpc('savora_profile_set', { p_handle: h, p_name: n }); render(); showToast('Profil gespeichert'); shareRefresh(); }
      catch (e) { shareShowError(e.message); }
      finally { if (document.contains(el)) el.disabled = false; }
      return true;
    }
    case 'share-copy-link': if (share.profile) await shareCopy(shareInviteLink(share.profile), 'Einladungslink kopiert'); return true;
    case 'share-copy-code': if (share.profile) await shareCopy(share.profile.invite_code, 'Code kopiert'); return true;
    case 'share-invite-reset':
      if (!window.confirm('Neuen Code erzeugen? Der alte Code und Link funktionieren dann nicht mehr.')) return true;
      try { share.profile = await shareRpc('savora_invite_reset'); render(); showToast('Neuer Code erzeugt'); } catch (e) { showToast(e.message, 'error'); }
      return true;
    case 'share-connect': {
      const t = ((document.getElementById('shareTarget') || {}).value || '').trim();
      if (!t) { shareShowError('Bitte einen Profilnamen oder Code eingeben.'); return true; }
      el.disabled = true;
      try {
        const r = await shareRpc('savora_connect', { p_target: t });
        sessionStorage.removeItem(SHARE_INVITE_KEY);
        showToast(r.state === 'connected' ? `Verbunden mit ${shareName(r)}` : `Anfrage an ${shareName(r)} gesendet`);
        await shareRefresh(); render();
      } catch (e) { shareShowError(e.message); }
      finally { if (document.contains(el)) el.disabled = false; }
      return true;
    }
    case 'share-respond': {
      const answer = el.dataset.answer;
      if (answer === 'block' && !window.confirm('Dieses Profil blockieren? Es kann dir dann nichts mehr senden.')) return true;
      try { await shareRpc('savora_respond', { p_handle: id, p_action: answer }); await shareRefresh(); render(); showToast(answer === 'accept' ? 'Verbunden' : answer === 'block' ? 'Blockiert' : 'Anfrage abgelehnt'); }
      catch (e) { showToast(e.message, 'error'); }
      return true;
    }
    case 'share-remove': {
      const c = share.connections.find(x => x.handle === id);
      const text = c && c.state === 'connected' ? 'Verbindung entfernen? Ihr könnt euch dann keine Rezepte mehr senden.' : null;
      if (text && !window.confirm(text)) return true;
      try { await shareRpc('savora_remove', { p_handle: id }); await shareRefresh(); render(); }
      catch (e) { showToast(e.message, 'error'); }
      return true;
    }
    case 'share-open-send': {
      openModal({ type: 'share-send', recipeId: id });
      if (cloudSignedIn() && share.profile === undefined) shareRefresh().then(() => { if (state.modal && state.modal.type === 'share-send') render(); });
      return true;
    }
    case 'share-send': {
      const r = state.recipes.find(x => x.id === id);
      const to = document.querySelector('input[name="shareTo"]:checked');
      if (!r || !to) { shareShowError('Bitte einen Empfänger wählen.'); return true; }
      const msg = ((document.getElementById('shareMessage') || {}).value || '').trim();
      el.disabled = true;
      try {
        const image = await shareImageDataUrl(r);
        await shareRpc('savora_send', { p_handle: to.value, p_recipe: shareBuildPayload(r), p_image: image, p_message: msg || null });
        const c = share.connections.find(x => x.handle === to.value);
        closeModal();
        setTimeout(() => showToast(`Rezept an ${c ? shareName(c) : '@' + to.value} gesendet`), 50);
      } catch (e) { shareShowError(e.offline ? 'Keine Verbindung zum Internet. Bitte später nochmals.' : e.message); }
      finally { if (document.contains(el)) el.disabled = false; }
      return true;
    }
    case 'share-open-preview': {
      share.previewId = id; share.previewImage = null;
      state.view = 'settings-share-preview'; render();
      const item = shareFindInbox(id);
      if (item && item.has_image) {
        try { const url = await shareRpc('savora_share_image', { p_id: id }); if (share.previewId === id && typeof url === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(url)) { share.previewImage = url; shareRerender(); } }
        catch (e) { /* Bild optional */ }
      }
      return true;
    }
    case 'share-accept': {
      const item = shareFindInbox(id);
      if (!item) return true;
      const recipe = shareRecipeFromPayload(item.recipe, item.from_handle);
      try {
        if (item.has_image) {
          const url = share.previewId === id && share.previewImage ? share.previewImage : await shareRpc('savora_share_image', { p_id: id });
          if (typeof url === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(url)) {
            const blob = await (await fetch(url)).blob();
            const p = await processImageFile(blob);
            const imageId = uid();
            await dbPutImage({ id: imageId, blob: p.fullBlob, thumbBlob: p.thumbBlob, mime: p.mime });
            recipe.imageId = imageId;
          }
        }
      } catch (e) { /* Rezept ist wichtiger als das Bild */ }
      await dbPut(recipe);
      await loadRecipes();
      writeJsonKey(SHARE_DONE_KEY, shareDoneIds().concat(id));
      share.inbox = share.inbox.filter(x => x.id !== id); share.count = Math.max(0, share.count - 1);
      shareFlushDone();
      state.activeRecipeId = recipe.id; state.detailTab = 'ingredients'; state.view = 'detail';
      render();
      showToast('Rezept übernommen');
      return true;
    }
    case 'share-decline': {
      if (!window.confirm('Dieses Rezept ablehnen? Es wird gelöscht.')) return true;
      writeJsonKey(SHARE_DONE_KEY, shareDoneIds().concat(id));
      share.inbox = share.inbox.filter(x => x.id !== id); share.count = Math.max(0, share.count - 1);
      shareFlushDone();
      history.back();
      showToast('Abgelehnt');
      return true;
    }
    default: return false;
  }
}
