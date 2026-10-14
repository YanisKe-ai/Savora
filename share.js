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
const share = { fetchedAt: 0, profile: undefined, connections: [], inbox: [], count: 0, loading: false, error: null, previewId: null, previewImage: null, timer: null, ui: {} };

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
  } catch (e) { share.error = shareErrText(e); }
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
  share.fetchedAt = 0; share.profile = undefined; share.connections = []; share.inbox = []; share.count = 0; share.error = null; share.previewId = null; share.previewImage = null; share.ui = {};
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
const SHARE_OFFLINE_TEXT = 'Keine Verbindung zum Internet. Zum Teilen brauchst du Internet. Deine Rezepte sind davon nicht betroffen.';
function shareErrText(e) { return e && e.offline ? SHARE_OFFLINE_TEXT : (e && e.message) || 'Das hat nicht geklappt. Bitte nochmals versuchen.'; }
function shareInviteLink(p) { return CLOUD_SITE_URL + '?freund=' + encodeURIComponent(p.invite_code); }
function shareName(x) { return x.display_name || '@' + x.handle; }
function shareWho(x) { return `<strong>${escapeHtml(shareName(x))}</strong>${x.display_name ? ` <span class="share-handle">@${escapeHtml(x.handle)}</span>` : ''}`; }

const SHARE_SVG = {
  inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'
};
function shareAvatar(x) { return `<span class="tl-avatar" aria-hidden="true">${escapeHtml((shareName(x).replace(/^@/, '').charAt(0) || '?').toUpperCase())}</span>`; }
function shareFold(key, title, meta, inner, defaultOpen) {
  const open = share.ui[key] !== undefined ? share.ui[key] : !!defaultOpen;
  return `<details class="tl-fold" data-ui="${key}"${open ? ' open' : ''}><summary><span class="tl-fold-title">${title}</span>${meta ? `<span class="tl-fold-meta">${meta}</span>` : ''}<span class="tl-fold-chev" aria-hidden="true">${ICONS.chevronRight}</span></summary><div class="tl-fold-body">${inner}</div></details>`;
}
function shareSection(id, title, count, inner, extraCls) {
  return `<section class="tl-sec${extraCls ? ' ' + extraCls : ''}" aria-labelledby="tl-h-${id}"><h2 class="tl-h" id="tl-h-${id}">${title}${count ? `<span class="tl-badge" aria-label="${count} neu">${count}</span>` : ''}</h2>${inner}</section>`;
}
function shareProfileFields(p, saveLabel, btnCls) {
  return `<div class="field"><label for="shareHandle">Profilname</label><input type="text" id="shareHandle" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="24" ${p ? `value="${escapeHtml(p.handle)}"` : 'placeholder="z. B. yanis_kocht"'} aria-describedby="shareHandleHint"><p class="tl-hint" id="shareHandleHint">3 bis 24 Zeichen: Kleinbuchstaben, Zahlen und Unterstrich.</p></div>
    <div class="field"><label for="shareName">Anzeigename (freiwillig)</label><input type="text" id="shareName" autocomplete="off" maxlength="40" ${p ? `value="${escapeHtml(p.display_name || '')}"` : 'placeholder="z. B. Yanis"'}></div>
    <p class="cloud-error" id="shareError" role="alert"></p>
    <button class="${btnCls}" data-action="share-profile-save">${saveLabel}</button>`;
}

function shareAsideHtml() {
  return `<aside class="tl-aside" aria-label="So funktioniert das Teilen"><h2 class="tl-h">So funktioniert es</h2><ol class="tl-steps"><li>Konto und Profilnamen einrichten.</li><li>Freunde per Profilname oder Code hinzufügen. Sie bestätigen die Anfrage.</li><li>Ein Rezept wählen, einen Freund wählen, senden. Das Rezept kommt als Kopie an, und dein Original bleibt unverändert.</li><li>Empfangene Rezepte erst ansehen, dann übernehmen oder ablehnen.</li></ol></aside>`;
}
function settingsShareView() {
  let body;
  let wide = false;
  let intro = false;
  if (!cloudSignedIn()) {
    intro = true;
    body = `<div class="tl-card tl-card--intro">
      <h2 class="tl-h tl-h--card">Rezepte mit Freunden austauschen</h2>
      <p>Dafür brauchst du ein Konto. Dann kannst du Rezepte direkt an Freunde in Savora senden und von ihnen empfangen.</p>
      <p class="tl-hint">Niemand sieht dein Kochbuch. Es kommt nur an, was du selbst sendest.</p>
      <button class="primary-btn primary-btn--block" data-action="goto-view" data-view="settings-sync">Zur Anmeldung</button>
    </div>`;
  } else if (share.profile === undefined) {
    if (!share.loading && !share.error) setTimeout(shareRefresh, 0);
    body = share.error
      ? `<div class="tl-card" role="alert"><p>${escapeHtml(share.error)}</p><button class="ghost-btn primary-btn--block" data-action="share-refresh">Nochmals versuchen</button></div>`
      : `<p class="tl-loading" role="status">Wird geladen …</p>`;
  } else if (!share.profile) {
    intro = true;
    body = `<div class="tl-card tl-card--intro">
      <h2 class="tl-h tl-h--card">Profil einrichten</h2>
      <p>Mit deinem Profilnamen finden dich Freunde. Dein Kochbuch bleibt privat.</p>
      ${shareProfileFields(null, 'Profil erstellen', 'primary-btn primary-btn--block')}
    </div>`;
  } else {
    wide = true;
    const p = share.profile;
    const incoming = share.connections.filter(c => c.state === 'incoming');
    const connected = share.connections.filter(c => c.state === 'connected');
    const outgoing = share.connections.filter(c => c.state === 'outgoing');
    const blocked = share.connections.filter(c => c.state === 'blocked');
    const hasFriends = connected.length > 0;
    if (!share.loading && Date.now() - share.fetchedAt > 2000) setTimeout(shareRefresh, 0);   // beim Oeffnen frisch laden
    const prefill = sessionStorage.getItem(SHARE_INVITE_KEY) || '';
    const row = (x, inner, actions) => `<li class="tl-row">${shareAvatar(x)}<div class="tl-row-text">${inner}</div>${actions ? `<div class="tl-row-actions">${actions}</div>` : ''}</li>`;

    const offlineBanner = share.error ? `<div class="tl-banner" role="status"><span>${escapeHtml(share.error)} Du siehst den Stand von vorhin.</span><button class="text-btn" data-action="share-refresh">Nochmals versuchen</button></div>` : '';

    const inboxCards = share.inbox.map(s => `<li class="tl-row tl-row--inbox">${shareAvatar({ display_name: s.from_name, handle: s.from_handle })}<div class="tl-row-text"><span class="share-title">${escapeHtml(s.title)}</span><span class="tl-sub">von ${shareWho({ display_name: s.from_name, handle: s.from_handle })}</span>${s.message ? `<span class="share-msg">„${escapeHtml(s.message)}“</span>` : ''}</div><div class="tl-row-actions"><button class="primary-btn primary-btn--small" data-action="share-open-preview" data-id="${escapeAttr(s.id)}" aria-label="Ansehen: ${escapeHtml(s.title)} von ${escapeHtml(shareName({ display_name: s.from_name, handle: s.from_handle }))}">Ansehen</button></div></li>`).join('');
    const inboxSec = share.inbox.length
      ? shareSection('inbox', 'Posteingang', share.inbox.length, `<ul class="tl-list tl-card">${inboxCards}</ul>`)
      : hasFriends ? shareSection('inbox', 'Posteingang', 0, `<div class="tl-card tl-card--quiet"><p>Nichts Neues. Rezepte, die dir Freunde senden, erscheinen hier. Du kannst sie ansehen, bevor du sie übernimmst.</p></div>`) : '';

    const reqSec = incoming.length ? shareSection('req', 'Anfragen', incoming.length, `<ul class="tl-list tl-card">${incoming.map(c => `<li class="tl-row tl-row--req">${shareAvatar(c)}<div class="tl-row-text"><span class="tl-name">${shareWho(c)}</span><span class="tl-sub">möchte sich mit dir verbinden</span></div><div class="tl-row-actions">
        <button class="primary-btn primary-btn--small" data-action="share-respond" data-id="${escapeAttr(c.handle)}" data-answer="accept" aria-label="Anfrage von ${escapeHtml(shareName(c))} annehmen">Annehmen</button>
        <button class="ghost-btn primary-btn--small" data-action="share-respond" data-id="${escapeAttr(c.handle)}" data-answer="decline" aria-label="Anfrage von ${escapeHtml(shareName(c))} ablehnen">Ablehnen</button>
        <button class="text-btn text-btn--quiet" data-action="share-respond" data-id="${escapeAttr(c.handle)}" data-answer="block" aria-label="${escapeHtml(shareName(c))} blockieren">Blockieren</button></div></li>`).join('')}</ul>`) : '';

    const sendSec = hasFriends ? `<section class="tl-sec tl-sec--send" aria-label="Rezept senden"><div class="tl-card tl-card--action">
        <div><h2 class="tl-h tl-h--card">Rezept senden</h2><p class="tl-hint tl-hint--flush">Wähle ein Rezept und einen Freund. Dein Original bleibt unverändert.</p></div>
        <button class="primary-btn" data-action="share-pick-open">${SHARE_SVG.send} Rezept wählen</button></div></section>` : '';

    const addForm = `<div class="field"><label for="shareTarget">Profilname oder Einladungscode</label><input type="text" id="shareTarget" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="@name oder SAV-XXXX-XXXX" value="${escapeHtml(prefill)}"></div>
      <p class="cloud-error" id="shareConnectError" role="alert"></p>
      <button class="primary-btn primary-btn--block" data-action="share-connect">Anfrage senden</button>
      <p class="tl-hint">Die andere Person muss bestätigen. Erst dann könnt ihr euch Rezepte senden.</p>`;
    const friendList = (connected.length || outgoing.length) ? `<ul class="tl-list tl-card">
        ${connected.map(c => row(c, `<span class="tl-name">${shareWho(c)}</span>`, '')).join('')}
        ${outgoing.map(c => row(c, `<span class="tl-name">${shareWho(c)}</span><span class="tl-sub">Anfrage wartet auf Bestätigung</span>`, `<button class="text-btn" data-action="share-remove" data-id="${escapeAttr(c.handle)}" aria-label="Anfrage an ${escapeHtml(shareName(c))} zurückziehen">Zurückziehen</button>`)).join('')}
      </ul>` : '';
    const firstTime = `<div class="tl-card tl-card--quiet"><p class="tl-lead">Noch keine Freunde in Savora.</p><ol class="tl-steps"><li>Füge einen Freund per Profilname oder Code hinzu.</li><li>Die Person bestätigt deine Anfrage.</li><li>Danach könnt ihr euch Rezepte senden.</li></ol></div>`;
    const manageInner = `<ul class="tl-list">
        ${connected.map(c => row(c, `<span class="tl-name">${shareWho(c)}</span>`, `<button class="text-btn text-btn--danger" data-action="share-remove" data-id="${escapeAttr(c.handle)}" aria-label="Verbindung mit ${escapeHtml(shareName(c))} entfernen">Entfernen</button>`)).join('')}
        ${blocked.map(c => row(c, `<span class="tl-name">${shareWho(c)}</span><span class="tl-sub">Blockiert</span>`, `<button class="text-btn" data-action="share-remove" data-id="${escapeAttr(c.handle)}" aria-label="${escapeHtml(shareName(c))} entsperren">Entsperren</button>`)).join('')}
      </ul>`;
    const friendsSec = shareSection('friends', 'Freunde', 0,
      (connected.length ? `<div class="tl-avatars">${avatarCirclesHtml(connected.map(c => shareName(c)), 5)}</div>` : '')
      + (hasFriends || outgoing.length ? friendList : firstTime)
      + shareFold('add', `${SHARE_SVG.plus} Freund hinzufügen`, '', addForm, !hasFriends && !outgoing.length || !!prefill)
      + (connected.length || blocked.length ? shareFold('manage', 'Freunde verwalten', '', manageInner, false) : ''));

    const profileInner = `<p class="tl-lead">Dein Einladungscode</p>
      <p class="share-code" aria-label="Dein Einladungscode">${escapeHtml(p.invite_code)}</p>
      <div class="share-row-actions share-row-actions--wrap">
        <button class="ghost-btn primary-btn--small" data-action="share-copy-link">${ICONS.link} Einladungslink kopieren</button>
        <button class="ghost-btn primary-btn--small" data-action="share-copy-code">${ICONS.copy} Code kopieren</button>
      </div>
      <p class="tl-hint">Wer deinen Code oder Link hat, kann dir eine Anfrage schicken. Du entscheidest, ob du sie annimmst.</p>
      <hr class="tl-rule">
      ${shareProfileFields(p, 'Profil speichern', 'ghost-btn primary-btn--block')}
      <button class="text-btn" data-action="share-invite-reset">Neuen Einladungscode erzeugen</button>`;
    const profileSec = shareSection('profile', 'Mein Profil', 0, shareFold('profile', 'Einladungscode und Profil', `<span class="share-handle">@${escapeHtml(p.handle)}</span>`, profileInner, !hasFriends && !outgoing.length));

    const newCount = share.inbox.length + incoming.length;
    const tab = ['inbox', 'send', 'friends'].includes(share.ui.tab) ? share.ui.tab : (prefill ? 'friends' : newCount || hasFriends ? 'inbox' : 'friends');
    const tabBtn = (id, label, count) => `<button type="button" role="tab" class="tl-tab" id="tl-tab-${id}" aria-selected="${tab === id}" aria-controls="tl-panel" data-action="share-tab" data-id="${id}">${label}${count ? `<span class="tl-badge" aria-label="${count} neu">${count}</span>` : ''}</button>`;
    const tabs = `<div class="tl-tabs" role="tablist" aria-label="Teilen">${tabBtn('inbox', 'Posteingang', newCount)}${tabBtn('send', 'Senden', 0)}${tabBtn('friends', 'Freunde', 0)}</div>`;
    const noFriendsSend = `<div class="tl-card tl-card--quiet"><p class="tl-lead">Zum Senden brauchst du einen Freund.</p><p class="tl-hint tl-hint--flush">Füge zuerst jemanden hinzu. Danach kannst du ihm Rezepte schicken.</p><button class="primary-btn" data-action="share-tab" data-id="friends">${SHARE_SVG.plus} Freund hinzufügen</button></div>`;
    const panel = tab === 'inbox'
      ? (reqSec + inboxSec || `<div class="tl-card tl-card--quiet"><p>Nichts Neues. Rezepte und Anfragen von Freunden erscheinen hier.</p></div>`)
      : tab === 'send' ? (sendSec || noFriendsSend)
      : friendsSec + profileSec + senderNameSectionHtml();
    body = `${offlineBanner}${tabs}<div id="tl-panel" role="tabpanel" aria-labelledby="tl-tab-${tab}" class="tl-panel">${panel}</div>`;
  }
  return settingsDetailShell('Rezepte mit anderen teilen', `<div class="tl${wide ? ' tl--wide' : ''}${intro ? ' tl--intro' : ''}">${intro ? `<div class="tl-intro-grid"><div>${body}</div>${shareAsideHtml()}</div>` : body}${wide ? '' : senderNameSectionHtml()}</div>`) + shareSendModal() + sharePickModal();
}

function shareFindInbox(id) { return share.inbox.find(x => x.id === id) || null; }
function settingsSharePreviewView() {
  const item = shareFindInbox(share.previewId);
  if (!item) { return settingsDetailShell('Rezept ansehen', '<div class="tl tl--prev"><div class="tl-card"><p>Dieses Rezept ist nicht mehr da. Vielleicht hast du es schon übernommen oder abgelehnt.</p><button class="ghost-btn primary-btn--block" data-action="goto-view" data-view="settings-share">Zurück zum Posteingang</button></div></div>'); }
  const r = shareRecipeFromPayload(item.recipe, item.from_handle);
  const meta = [r.timeMinutes ? `${r.timeMinutes} Min.` : '', yieldKnown(r) ? servingLabel(r, r.servings) : 'Ergibt: offen', r.difficulty || ''].filter(Boolean);
  const ings = r.ingredients.filter(i => (i.name || '').trim());
  const body = `
    <div class="tl tl--prev share-preview">
      <div class="tl-prev-head">
        <p class="share-from">Von ${shareWho({ display_name: item.from_name, handle: item.from_handle })}</p>
        ${item.message ? `<p class="share-msg share-msg--box">„${escapeHtml(item.message)}“</p>` : ''}
        ${share.previewImage ? `<img class="share-preview-img" src="${escapeHtml(share.previewImage)}" alt="${escapeHtml(r.title)}">` : ''}
        <h2 class="detail-title-v2">${escapeHtml(r.title)}</h2>
        <p class="detail-meta-v2">${meta.map(escapeHtml).join(' • ')}</p>
        <div class="share-preview-actions">
          <button class="primary-btn primary-btn--block" data-action="share-accept" data-id="${escapeAttr(item.id)}">${ICONS.check} Ins Kochbuch übernehmen</button>
          <button class="ghost-btn primary-btn--block" data-action="share-accept" data-mode="keep" data-id="${escapeAttr(item.id)}">In «Rezepte von Freunden» behalten</button>
          <button class="ghost-btn primary-btn--block" data-action="share-decline" data-id="${escapeAttr(item.id)}">Ablehnen</button>
          <p class="tl-hint">Das ist nur eine Vorschau. Beim Übernehmen bekommst du eine eigene Kopie. In «Rezepte von Freunden» behalten legt sie in diese Kategorie (Filter auf der Rezepte-Seite). Ablehnen löscht das Rezept aus deinem Posteingang.</p>
        </div>
      </div>
      <div class="tl-prev-body">
        <h3 class="share-sub">Zutaten</h3>
        <ul class="share-list">${ings.map(i => `<li>${escapeHtml(ingredientText(i))}</li>`).join('') || '<li>Keine Zutaten</li>'}</ul>
        <h3 class="share-sub">Zubereitung</h3>
        <ol class="share-list">${r.steps.filter(s => s.text).map(s => `<li>${escapeHtml(s.text).replace(/\n/g, '<br>')}</li>`).join('') || '<li>Keine Schritte</li>'}</ol>
        ${r.notes ? `<h3 class="share-sub">Notizen</h3><p>${escapeHtml(r.notes).replace(/\n/g, '<br>')}</p>` : ''}
      </div>
    </div>`;
  return settingsDetailShell('Rezept ansehen', body);
}

/* Schritt 1 des Sendens (von der Teilen-Seite aus): Rezept wählen. Schritt 2 ist das Fenster «Rezept senden» (Freund wählen, senden). */
function sharePickList(q) {
  const norm = s => String(s || '').toLowerCase();
  const all = state.recipes.filter(r => !q || norm(r.title).includes(norm(q.trim())));
  const shown = all.slice(0, 30);
  if (!shown.length) return `<p class="tl-hint tl-hint--flush">${state.recipes.length ? 'Kein Rezept gefunden.' : 'Du hast noch keine Rezepte.'}</p>`;
  return `<ul class="tl-pick-list">${shown.map(r => `<li><button type="button" class="tl-pick" data-action="share-pick" data-id="${escapeAttr(r.id)}"><span class="tl-pick-title">${escapeHtml(r.title || 'Rezept')}</span><span class="tl-fold-chev" aria-hidden="true">${ICONS.chevronRight}</span></button></li>`).join('')}</ul>${all.length > shown.length ? `<p class="tl-hint">${all.length - shown.length} weitere. Suche genauer, um sie zu finden.</p>` : ''}`;
}
function sharePickModal() {
  if (!state.modal || state.modal.type !== 'share-pick') return '';
  return sheet('share-pick-title', 'Welches Rezept senden?', `<div class="tl-pick-wrap"><div class="field"><label for="sharePickQ">Rezept suchen</label><input type="search" id="sharePickQ" autocomplete="off" spellcheck="false" placeholder="Titel eingeben …"></div><div id="sharePickList">${sharePickList('')}</div></div>`);
}
document.addEventListener('input', e => {
  if (e.target && e.target.id === 'sharePickQ') { const l = document.getElementById('sharePickList'); if (l) { l.innerHTML = sharePickList(e.target.value); l.querySelectorAll('[data-action]').forEach(el => el.addEventListener('click', onAction)); } }
});
document.addEventListener('toggle', e => {
  const k = e.target && e.target.dataset && e.target.dataset.ui;
  if (k && e.target.classList.contains('tl-fold')) share.ui[k] = e.target.open;
}, true);

function shareSendModal() {
  if (!state.modal || state.modal.type !== 'share-send') return '';
  const r = state.recipes.find(x => x.id === state.modal.recipeId);
  if (!r) return '';
  const onSharePage = state.view === 'settings-share';
  const toPage = (label) => `<button class="primary-btn" data-action="${onSharePage ? 'close-modal' : 'goto-view'}" data-view="settings-share">${label}</button>`;
  let inner;
  if (!cloudSignedIn()) {
    inner = `<p class="settings-hint settings-hint--none">Zum Senden brauchst du ein Konto. Dann kannst du Rezepte direkt an Freunde in Savora senden.</p><div class="form-actions"><button class="primary-btn" data-action="goto-view" data-view="settings-sync">Zur Anmeldung</button></div>`;
  } else if (share.profile === undefined) {
    inner = `<p class="settings-hint settings-hint--none" role="status">${share.error ? escapeHtml(share.error) : 'Wird geladen …'}</p>${share.error ? '<div class="form-actions"><button class="primary-btn" data-action="share-refresh">Nochmals versuchen</button></div>' : ''}`;
  } else if (!share.profile) {
    inner = `<p class="settings-hint settings-hint--none">Lege zuerst dein Profil an. Danach kannst du Freunde hinzufügen.</p><div class="form-actions">${toPage('Profil einrichten')}</div>`;
  } else {
    const people = share.connections.filter(c => c.state === 'connected');
    inner = people.length ? `
      <fieldset class="share-people"><legend class="tl-lead">Wem möchtest du es senden?</legend>
        ${people.map((c, i) => `<label class="share-person"><input type="radio" name="shareTo" value="${escapeAttr(c.handle)}" ${i === 0 ? 'checked' : ''}><span>${shareWho(c)}</span></label>`).join('')}
      </fieldset>
      <div class="field"><label for="shareMessage">Nachricht (freiwillig)</label><textarea id="shareMessage" maxlength="200" rows="2" placeholder="z. B. Probier das mal!"></textarea></div>
      <p class="cloud-error" id="shareError" role="alert"></p>
      <div class="form-actions"><button class="primary-btn" data-action="share-send" data-id="${escapeAttr(r.id)}">Senden</button><button class="ghost-btn" data-action="close-modal">Abbrechen</button></div>`
      : `<p class="settings-hint settings-hint--none">Du hast noch keine Freunde in Savora. Füge zuerst einen Freund hinzu.</p><div class="form-actions">${toPage('Freund hinzufügen')}</div>`;
  }
  const change = state.modal.from === 'pick' ? ` <button type="button" class="text-btn" data-action="share-pick-open">Anderes Rezept</button>` : '';
  return sheet('share-send-title', 'Rezept senden', `<p class="settings-hint settings-hint--none">„${escapeHtml(r.title || 'Rezept')}“ wird als Kopie gesendet. Dein Original bleibt unverändert.${change}</p>${inner}`);
}

function shareShowError(msg, id) {
  const el = document.getElementById(id || 'shareError');
  if (el) el.textContent = msg; else showToast(msg, 'error');
}
async function shareCopy(text, okMsg) {
  try { await navigator.clipboard.writeText(text); showToast(okMsg); }
  catch (e) { window.prompt('Zum Kopieren markieren:', text); }
}

async function handleShareAction(action, id, el) {
  switch (action) {
    case 'share-tab': share.ui.tab = id; render(); return true;
    case 'share-refresh': share.error = null; await shareRefresh(); return true;
    case 'share-profile-save': {
      const h = (document.getElementById('shareHandle') || {}).value || '';
      const n = (document.getElementById('shareName') || {}).value || '';
      el.disabled = true;
      try { share.profile = await shareRpc('savora_profile_set', { p_handle: h, p_name: n }); render(); showToast('Profil gespeichert'); shareRefresh(); }
      catch (e) { shareShowError(shareErrText(e)); }
      finally { if (document.contains(el)) el.disabled = false; }
      return true;
    }
    case 'share-copy-link': if (share.profile) await shareCopy(shareInviteLink(share.profile), 'Einladungslink kopiert'); return true;
    case 'share-copy-code': if (share.profile) await shareCopy(share.profile.invite_code, 'Code kopiert'); return true;
    case 'share-invite-reset':
      if (!window.confirm('Neuen Code erzeugen? Der alte Code und Link funktionieren dann nicht mehr.')) return true;
      try { share.profile = await shareRpc('savora_invite_reset'); render(); showToast('Neuer Code erzeugt'); } catch (e) { showToast(shareErrText(e), 'error'); }
      return true;
    case 'share-connect': {
      const t = ((document.getElementById('shareTarget') || {}).value || '').trim();
      if (!t) { shareShowError('Bitte einen Profilnamen oder Code eingeben.', 'shareConnectError'); return true; }
      el.disabled = true;
      try {
        const r = await shareRpc('savora_connect', { p_target: t });
        sessionStorage.removeItem(SHARE_INVITE_KEY);
        showToast(r.state === 'connected' ? `Verbunden mit ${shareName(r)}` : `Anfrage an ${shareName(r)} gesendet`);
        share.ui.add = false;
        await shareRefresh(); render();
      } catch (e) { shareShowError(shareErrText(e), 'shareConnectError'); }
      finally { if (document.contains(el)) el.disabled = false; }
      return true;
    }
    case 'share-respond': {
      const answer = el.dataset.answer;
      if (answer === 'block' && !window.confirm('Dieses Profil blockieren? Es kann dir dann nichts mehr senden.')) return true;
      try { await shareRpc('savora_respond', { p_handle: id, p_action: answer }); await shareRefresh(); render(); showToast(answer === 'accept' ? 'Verbunden' : answer === 'block' ? 'Blockiert' : 'Anfrage abgelehnt'); }
      catch (e) { showToast(shareErrText(e), 'error'); }
      return true;
    }
    case 'share-remove': {
      const c = share.connections.find(x => x.handle === id);
      const text = c && c.state === 'connected' ? 'Verbindung entfernen? Ihr könnt euch dann keine Rezepte mehr senden.' : null;
      if (text && !window.confirm(text)) return true;
      try { await shareRpc('savora_remove', { p_handle: id }); await shareRefresh(); render(); }
      catch (e) { showToast(shareErrText(e), 'error'); }
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
      } catch (e) { shareShowError(e.offline ? 'Keine Verbindung zum Internet. Dein Rezept wurde nicht gesendet. Bitte später nochmals versuchen.' : shareErrText(e)); }
      finally { if (document.contains(el)) el.disabled = false; }
      return true;
    }
    case 'share-pick-open': openModal({ type: 'share-pick' }); setTimeout(() => { const q = document.getElementById('sharePickQ'); if (q && window.matchMedia('(pointer: fine)').matches) q.focus(); }, 50); return true;
    case 'share-pick': openModal({ type: 'share-send', recipeId: id, from: 'pick' }); return true;
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
      const checkedShare = validateRecipe(recipe);
      if (!checkedShare.ok) { shareShowError('Dieses Rezept ist nicht lesbar und wurde nicht übernommen: ' + checkedShare.errors.slice(0, 2).join('; ')); return true; }
      Object.assign(recipe, checkedShare.recipe);
      const keepInFriends = el && el.dataset && el.dataset.mode === 'keep';
      if (keepInFriends) recipe.collections = Array.from(new Set((recipe.collections || []).concat('friends')));
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
      showToast(keepInFriends ? 'In «Rezepte von Freunden» gespeichert' : 'Rezept übernommen');
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
