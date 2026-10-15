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
const share = { gen: 0, sending: false, fetchedAt: 0, profile: undefined, connections: [], inbox: [], count: 0, loading: false, error: null, previewId: null, previewImage: null, timer: null, ui: {} };

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
/* Profil-Zustand (explizit): 'signedout' | 'loading' | 'ready' | 'absent' | 'error'.
   share.profile hat drei Bedeutungen: undefined = noch nicht (erfolgreich) geladen, null = Server bestaetigt: kein Profil,
   Objekt = Profil. Ob «undefined» gerade laedt oder gescheitert ist, steht in share.error. «absent» gilt NUR bei bestaetigtem null. */
function shareProfileState() {
  if (!cloudSignedIn()) return 'signedout';
  if (share.profile === undefined) return share.error ? 'error' : 'loading';
  return share.profile ? 'ready' : 'absent';
}
// Stoesst das Laden an, wenn angemeldet und noch nichts geladen wurde (und kein Fehler wartet).
function shareEnsureLoaded() {
  if (cloudSignedIn() && share.profile === undefined && !share.loading && !share.error) setTimeout(shareRefresh, 0);
}
async function shareRefresh() {
  if (!cloudSignedIn() || share.loading) return;
  share.loading = true;
  const gen = share.gen;
  try {
    await shareFlushDone();
    // Einzeln auswerten: ein Fehler bei Posteingang oder Verbindungen darf ein erfolgreich geladenes Profil nicht verwerfen.
    const [p, c, i] = await Promise.allSettled([shareRpc('savora_profile_get'), shareRpc('savora_connections_list'), shareRpc('savora_inbox')]);
    if (gen !== share.gen) return;   // zwischendurch abgemeldet oder Konto gewechselt: Antwort verwerfen
    const hidden = new Set(shareDoneIds());
    if (p.status === 'fulfilled') share.profile = p.value || null;
    if (c.status === 'fulfilled') share.connections = c.value || [];
    if (i.status === 'fulfilled') share.inbox = (i.value || []).filter(x => !hidden.has(x.id));
    share.count = share.connections.filter(x => x.state === 'incoming').length + share.inbox.length;
    const bad = [p, c, i].find(x => x.status === 'rejected');
    share.error = bad ? shareErrText(bad.reason) : null;
  } catch (e) { if (gen === share.gen) share.error = shareErrText(e); }
  finally { if (gen === share.gen) { share.loading = false; share.fetchedAt = Date.now(); } }
  if (gen === share.gen) shareRerender();
}
const SHARE_VIEWS = ['settings-share', 'settings-share-preview', 'settings', 'more', 'friends', 'friends-profile', 'friends-add'];
function shareRerender() {
  if (state.modal) return;
  if (!SHARE_VIEWS.includes(state.view || '')) return;
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
    if (state.view === 'settings' || state.view === 'more') shareRerender();
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
      if (cloudSignedIn()) { state.view = 'friends-add'; render(); shareRefresh(); }
      else showToast('Melde dich an (Mehr, Einstellungen, Mein Konto), um die Einladung anzunehmen.', 'info');
    }, 800);
  } catch (e) { /* ungueltige Adresse: ignorieren */ }
}
function shareReset() {
  share.gen++; share.loading = false; share.sending = false;
  share.fetchedAt = 0; share.profile = undefined; share.connections = []; share.inbox = []; share.count = 0; share.error = null; share.previewId = null; share.previewImage = null; share.ui = {};
  try { localStorage.removeItem(SHARE_DONE_KEY); sessionStorage.removeItem(SHARE_INVITE_KEY); } catch (e) {}
}
/* Kurzer, echter Zustandstext fuer die Zeile «Freunde & Rezepte» auf «Mehr». Kein «Einrichten», solange ein fehlendes
   Profil nicht bestaetigt ist (siehe shareProfileState). Loest bei Bedarf das Laden aus. */
function friendsSummary() {
  const st = shareProfileState();
  if (st === 'signedout') return 'Nicht angemeldet';
  if (st === 'loading') { shareEnsureLoaded(); return 'Profil wird geladen …'; }
  if (st === 'error') return 'Profil konnte nicht geladen werden.';
  if (st === 'absent') return 'Profil einrichten';
  const n = share.inbox.length, req = share.connections.filter(c => c.state === 'incoming').length, f = share.connections.filter(c => c.state === 'connected').length;
  const parts = [];
  if (n) parts.push(n === 1 ? '1 neues Rezept' : `${n} neue Rezepte`);
  if (req) parts.push(req === 1 ? '1 Anfrage' : `${req} Anfragen`);
  if (parts.length) return parts.join(', ');
  return f ? (f === 1 ? '1 Freund' : `${f} Freunde`) : '@' + share.profile.handle;
}
// Zahl der neuen Rezepte und offenen Anfragen (nur echte Daten), z. B. fuer ein Abzeichen auf «Mehr».
function friendsBadgeCount() { return cloudSignedIn() ? share.count : 0; }
function shareSettingsSummary() { return friendsSummary(); }

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
  // Herkunft aus der Rezeptbibliothek: nur gepruefte, oeffentliche Angaben uebernehmen (Autor bleibt Autor, der Absender steht in sharedBy).
  // savedVersion/savedAt/imagePending gehoeren zur Kopie des Absenders und werden nicht uebernommen; die Adresse wird lokal gebaut.
  delete r.publicOrigin; delete r.publicTips;
  const po = o.publicOrigin ? valPublicOrigin(o.publicOrigin, 'receive').origin : null;
  if (po) r.publicOrigin = po;
  const tips = shareStr(o.publicTips, VAL_MAX_PUBLIC_TIPS);
  if (tips) r.publicTips = tips;
  if (fromHandle) r.sharedBy = fromHandle;
  return r;
}
function shareBuildPayload(recipe) {
  const o = shareClean(recipe) || {};
  SHARE_DROP_KEYS.forEach(k => { delete o[k]; });
  // Herkunft nur mit den oeffentlichen Angaben senden (nie savedAt, savedVersion, imagePending oder eine gespeicherte Adresse)
  delete o.publicOrigin; delete o.publicTips;
  const po = recipe && recipe.publicOrigin ? valPublicOrigin(recipe.publicOrigin, 'send').origin : null;
  if (po) o.publicOrigin = po;
  const tips = recipe ? shareStr(recipe.publicTips, VAL_MAX_PUBLIC_TIPS) : '';
  if (tips) o.publicTips = tips;
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
function shareWhoLines(x) { return `<span class="fr-name">${escapeHtml(shareName(x))}</span>${x.display_name ? `<span class="tl-sub">@${escapeHtml(x.handle)}</span>` : ''}`; }
// Konto-Seite fuer die Anmeldung: «Mein Konto» (settings-account), solange sie fehlt die bisherige Seite.
function shareSignInView() { return typeof settingsAccountView === 'function' ? 'settings-account' : 'settings-sync'; }
const SHARE_PROFILE_RE = /^[a-z0-9_]{3,24}$/;   // gleiche Regel wie in supabase/paket36-teilen.sql (savora_profile_set)

/* Gemeinsame Huelle fuer Zustaende ohne fertiges Profil: abgemeldet, laedt, Ladefehler. Gibt '' zurueck, wenn das Profil
   geladen ist (ready oder bestaetigt absent). Beim Laden nie «Profil einrichten», beim Fehler keine Neuanlage nahelegen. */
function shareGateHtml() {
  const st = shareProfileState();
  if (st === 'signedout') {
    return `<div class="tl-card tl-card--intro">
      <h2 class="tl-h tl-h--card">Rezepte mit Freunden austauschen</h2>
      <p>Dafür brauchst du ein Konto. Dann kannst du Rezepte direkt an Freunde in Savora senden und von ihnen empfangen.</p>
      <p class="tl-hint">Niemand sieht dein Kochbuch. Es kommt nur an, was du selbst sendest.</p>
      <button class="primary-btn primary-btn--block" data-action="goto-view" data-view="${shareSignInView()}">Zur Anmeldung</button>
    </div>`;
  }
  if (st === 'loading') { shareEnsureLoaded(); return '<p class="tl-loading" role="status">Profil wird geladen …</p>'; }
  if (st === 'error') {
    return `<div class="tl-card" role="alert"><p><strong>Profil konnte nicht geladen werden.</strong></p>${share.error ? `<p class="tl-hint">${escapeHtml(share.error)}</p>` : ''}<button class="ghost-btn primary-btn--block" data-action="share-refresh">Erneut versuchen</button></div>`;
  }
  return '';
}
function shareProfileForm(p) {
  return `<div class="field"><label for="shareHandle">Benutzername</label><input type="text" id="shareHandle" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="25" ${p ? `value="${escapeHtml(p.handle)}"` : 'placeholder="z. B. yanis_kocht"'} aria-describedby="shareHandleHint"><p class="tl-hint" id="shareHandleHint">Deine eindeutige Kennung, mit der Freunde dich finden. 3 bis 24 Zeichen: Kleinbuchstaben, Zahlen und Unterstrich.</p></div>
    <div class="field"><label for="shareName">Sichtbarer Name (freiwillig)</label><input type="text" id="shareName" autocomplete="off" maxlength="40" ${p ? `value="${escapeHtml(p.display_name || '')}"` : 'placeholder="z. B. Yanis"'} aria-describedby="shareNameHint"><p class="tl-hint" id="shareNameHint">Diesen Namen sehen deine Freunde zusätzlich zum Benutzernamen. Leer lassen ist in Ordnung.</p></div>
    <p class="fr-status" id="shareStatus" role="status">${share.ui.savedAt && Date.now() - share.ui.savedAt < 8000 ? 'Profil gespeichert.' : ''}</p>
    <p class="cloud-error" id="shareError" role="alert"></p>
    <button class="primary-btn primary-btn--block" data-action="share-profile-save">${p ? 'Profil speichern' : 'Profil erstellen'}</button>`;
}
function frNav(title, sub, view) {
  return `<button type="button" class="fr-nav" data-action="goto-view" data-view="${view}"><span class="fr-nav-text"><span class="fr-name">${title}</span><span class="tl-sub">${sub}</span></span><span class="fr-chev" aria-hidden="true">${ICONS.chevronRight}</span></button>`;
}
function frSection(id, title, count, inner) {
  return `<section class="fr-sec" aria-labelledby="fr-h-${id}"><h2 class="tl-h" id="fr-h-${id}">${title}${count ? `<span class="tl-badge" aria-label="${count} neu">${count}</span>` : ''}</h2>${inner}</section>`;
}
function shareModals() { return shareSendModal() + sharePickModal() + shareManageModal() + shareCodeResetModal(); }

const SHARE_TABS = [['inbox', 'Empfangen'], ['send', 'Senden'], ['friends', 'Freunde']];

/* Hauptansicht «Freunde & Rezepte» mit den Reitern Empfangen, Senden, Freunde. */
function friendsView() {
  const st = shareProfileState();
  let body = shareGateHtml();
  if (!body && st === 'absent') {
    body = `<div class="tl-card tl-card--intro"><h2 class="tl-h tl-h--card">Profil einrichten</h2><p>Mit deinem Benutzernamen finden dich Freunde. Dein Kochbuch bleibt privat.</p>${shareProfileForm(null)}</div>`;
  } else if (!body) {
    body = friendsReadyHtml();
  }
  return settingsDetailShell('Freunde & Rezepte', `<div class="tl fr">${body}</div>`) + shareModals();
}
function friendsReadyHtml() {
  const p = share.profile;
  const incoming = share.connections.filter(c => c.state === 'incoming');
  const connected = share.connections.filter(c => c.state === 'connected');
  const outgoing = share.connections.filter(c => c.state === 'outgoing');
  const blocked = share.connections.filter(c => c.state === 'blocked');
  if (!share.loading && Date.now() - share.fetchedAt > 2000) setTimeout(shareRefresh, 0);   // beim Oeffnen frisch laden
  const tab = ['inbox', 'send', 'friends'].includes(share.ui.tab) ? share.ui.tab : 'inbox';
  const counts = { inbox: share.inbox.length, send: 0, friends: incoming.length };
  const offlineBanner = share.error ? `<div class="tl-banner" role="status"><span>${escapeHtml(share.error)} Du siehst den Stand von vorhin.</span><button class="text-btn" data-action="share-refresh">Erneut versuchen</button></div>` : '';
  const tabs = `<div class="tl-tabs" role="tablist" aria-label="Freunde und Rezepte">${SHARE_TABS.map(([id, label]) => `<button type="button" role="tab" class="tl-tab" id="tl-tab-${id}" aria-selected="${tab === id}" aria-controls="tl-panel" tabindex="${tab === id ? 0 : -1}" data-action="share-tab" data-id="${id}">${label}${counts[id] ? `<span class="tl-badge" aria-label="${counts[id]} neu">${counts[id]}</span>` : ''}</button>`).join('')}</div>`;
  let panel;
  if (tab === 'inbox') {
    const note = incoming.length ? `<div class="tl-banner fr-note"><span>${incoming.length === 1 ? '1 offene Anfrage wartet' : `${incoming.length} offene Anfragen warten`} auf dich.</span><button class="text-btn" data-action="share-tab" data-id="friends">Anfragen ansehen</button></div>` : '';
    const rows = share.inbox.map(s => `<li class="tl-row tl-row--inbox">${shareAvatar({ display_name: s.from_name, handle: s.from_handle })}<div class="tl-row-text"><span class="share-title">${escapeHtml(s.title)}</span><span class="tl-sub">von ${shareWho({ display_name: s.from_name, handle: s.from_handle })}</span>${s.message ? `<span class="share-msg">„${escapeHtml(s.message)}“</span>` : ''}</div><div class="tl-row-actions"><button class="primary-btn primary-btn--small" data-action="share-open-preview" data-id="${escapeAttr(s.id)}" aria-label="Ansehen: ${escapeHtml(s.title)} von ${escapeHtml(shareName({ display_name: s.from_name, handle: s.from_handle }))}">Ansehen</button></div></li>`).join('');
    panel = note + (share.inbox.length
      ? frSection('inbox', 'Erhaltene Rezepte', share.inbox.length, `<ul class="tl-list tl-card">${rows}</ul>`)
      : `<div class="tl-card tl-card--quiet"><p>Noch keine neuen Rezepte. Hier erscheinen Rezepte, die dir Freunde senden.</p><button class="ghost-btn primary-btn--small" data-action="share-tab" data-id="friends">Freunde ansehen</button></div>`);
  } else if (tab === 'send') {
    panel = connected.length
      ? frSection('send', 'Rezept senden', 0, `<div class="tl-card"><p class="tl-hint tl-hint--flush">Wähle ein Rezept und einen Freund. Dein Original bleibt unverändert.</p><ol class="tl-steps fr-steps"><li>Rezept wählen</li><li>Freund wählen</li><li>«Rezept senden» tippen</li></ol><button class="primary-btn primary-btn--block" data-action="share-pick-open">${SHARE_SVG.send} Rezept wählen</button></div>`)
      : frSection('send', 'Rezept senden', 0, `<div class="tl-card tl-card--quiet"><p class="tl-hint tl-hint--flush">Wähle ein Rezept und einen Freund. Dein Original bleibt unverändert.</p><p class="tl-lead">Zum Senden brauchst du einen Freund.</p><button class="primary-btn primary-btn--small" data-action="goto-view" data-view="friends-add">${SHARE_SVG.plus} Freund hinzufügen</button></div>`);
  } else {
    const friendRows = connected.map(c => `<li class="fr-row">${shareAvatar(c)}<div class="fr-row-text">${shareWhoLines(c)}</div><button class="ghost-btn primary-btn--small" data-action="friend-manage" data-id="${escapeAttr(c.handle)}" aria-label="Verwalten: ${escapeHtml(shareName(c))}">Verwalten</button></li>`).join('');
    const friendsSec = frSection('friends', 'Deine Freunde', 0, connected.length
      ? `<ul class="fr-list">${friendRows}</ul>`
      : `<div class="tl-card tl-card--quiet"><p>Noch keine Freunde in Savora. Füge jemanden über «Freund hinzufügen» hinzu.</p></div>`);
    const reqIn = incoming.map(c => `<li class="fr-row fr-row--stack">${shareAvatar(c)}<div class="fr-row-text">${shareWhoLines(c)}<span class="tl-sub">möchte sich mit dir verbinden</span></div><div class="fr-actions">
        <button class="primary-btn primary-btn--small" data-action="share-respond" data-id="${escapeAttr(c.handle)}" data-answer="accept" aria-label="Anfrage von ${escapeHtml(shareName(c))} annehmen">Annehmen</button>
        <button class="ghost-btn primary-btn--small" data-action="share-respond" data-id="${escapeAttr(c.handle)}" data-answer="decline" aria-label="Anfrage von ${escapeHtml(shareName(c))} ablehnen">Ablehnen</button>
        <button class="text-btn text-btn--quiet" data-action="share-respond" data-id="${escapeAttr(c.handle)}" data-answer="block" aria-label="${escapeHtml(shareName(c))} blockieren">Blockieren</button></div></li>`).join('');
    const reqOut = outgoing.map(c => `<li class="fr-row">${shareAvatar(c)}<div class="fr-row-text">${shareWhoLines(c)}<span class="tl-sub">Wartet auf Bestätigung</span></div><button class="text-btn" data-action="share-remove" data-id="${escapeAttr(c.handle)}" aria-label="Anfrage an ${escapeHtml(shareName(c))} zurückziehen">Zurückziehen</button></li>`).join('');
    const blockedRows = blocked.map(c => `<li class="fr-row">${shareAvatar(c)}<div class="fr-row-text">${shareWhoLines(c)}<span class="tl-sub">Blockiert</span></div><button class="text-btn" data-action="share-remove" data-id="${escapeAttr(c.handle)}" aria-label="${escapeHtml(shareName(c))} entsperren">Entsperren</button></li>`).join('');
    const reqSec = frSection('req', 'Anfragen', incoming.length,
      (incoming.length ? `<h3 class="fr-sub">Eingehend</h3><ul class="fr-list">${reqIn}</ul>` : '')
      + (outgoing.length ? `<h3 class="fr-sub">Ausgehend</h3><ul class="fr-list">${reqOut}</ul>` : '')
      + (blocked.length ? `<h3 class="fr-sub">Blockiert</h3><ul class="fr-list">${blockedRows}</ul>` : '')
      + (incoming.length || outgoing.length ? '' : '<div class="tl-card tl-card--quiet"><p>Keine offenen Anfragen.</p></div>'));
    const addSec = frSection('add', 'Freund hinzufügen', 0, `<div class="fr-list fr-list--nav">${frNav('Freund hinzufügen', 'Profilname, Einladungscode oder Link', 'friends-add')}</div>`);
    const profSec = frSection('profile', 'Dein Auftritt', 0, `<div class="fr-list fr-list--nav">${frNav('Profil bearbeiten', `@${escapeHtml(p.handle)}${p.display_name ? ' · ' + escapeHtml(p.display_name) : ''}`, 'friends-profile')}</div>`);
    panel = friendsSec + reqSec + addSec + profSec;
  }
  return `${offlineBanner}${tabs}<div id="tl-panel" role="tabpanel" aria-labelledby="tl-tab-${tab}" class="tl-panel">${panel}</div>`;
}
function settingsShareView() { return friendsView(); }   // alter Name, alte Routen (settings-share) bleiben gueltig

/* Profil bearbeiten: Benutzername (@Kennung) und sichtbarer Name auf einer Seite. */
function friendsProfileView() {
  const st = shareProfileState();
  let body = shareGateHtml();
  if (!body) {
    body = `<div class="tl-card"><p class="tl-hint tl-hint--flush">${st === 'absent' ? 'Mit deinem Benutzernamen finden dich Freunde. Dein Kochbuch bleibt privat.' : 'Das sehen deine Freunde von dir. Dein Kochbuch bleibt privat.'}</p>${shareProfileForm(share.profile)}</div>`;
  }
  return settingsDetailShell(st === 'absent' ? 'Profil einrichten' : 'Profil bearbeiten', `<div class="tl fr">${body}</div>`) + shareModals();
}

/* Freund hinzufuegen: Profilname oder Code eingeben, eigenen Code und Link zeigen. Der Code steht NUR hier. */
function friendsAddView() {
  const st = shareProfileState();
  let body = shareGateHtml();
  if (!body && st === 'absent') {
    body = `<div class="tl-card tl-card--intro"><h2 class="tl-h tl-h--card">Zuerst ein Profil einrichten</h2><p>Freunde finden dich über deinen Benutzernamen. Richte ihn ein, dann kannst du Freunde hinzufügen.</p><button class="primary-btn primary-btn--block" data-action="goto-view" data-view="friends-profile">Profil einrichten</button></div>`;
  } else if (!body) {
    const p = share.profile;
    const prefill = sessionStorage.getItem(SHARE_INVITE_KEY) || '';
    body = `${prefill ? '<div class="tl-banner fr-note" role="status"><span>Einladung erkannt. Prüfe den Code und sende die Anfrage.</span></div>' : ''}
      ${frSection('enter', 'Per Profilname oder Code', 0, `<div class="tl-card"><div class="field"><label for="shareTarget">Profilname oder Einladungscode</label><input type="text" id="shareTarget" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="@name oder SAV-XXXX-XXXX" value="${escapeHtml(prefill)}"></div>
        <p class="cloud-error" id="shareConnectError" role="alert"></p>
        <button class="primary-btn primary-btn--block" data-action="share-connect">Anfrage senden</button>
        <p class="tl-hint">Die andere Person muss bestätigen. Erst dann könnt ihr euch Rezepte senden.</p></div>`)}
      ${frSection('code', 'Dein Einladungscode', 0, `<div class="tl-card"><p class="tl-hint tl-hint--flush">Gib diesen Code oder Link weiter. Wer ihn hat, kann dir eine Anfrage schicken. Du entscheidest, ob du sie annimmst.</p>
        <p class="share-code" aria-label="Dein Einladungscode">${escapeHtml(p.invite_code)}</p>
        <div class="share-row-actions share-row-actions--wrap">
          <button class="ghost-btn primary-btn--small" data-action="share-copy-link">${ICONS.link} Einladungslink kopieren</button>
          <button class="ghost-btn primary-btn--small" data-action="share-copy-code">${ICONS.copy} Code kopieren</button>
        </div>
        <hr class="tl-rule">
        <p class="tl-hint tl-hint--flush">Ein neuer Code macht den bisherigen Code und alle bisherigen Links ungültig. Bestehende Freunde bleiben verbunden.</p>
        <button class="text-btn" data-action="share-invite-reset">Neuen Einladungscode erzeugen</button></div>`)}`;
  }
  return settingsDetailShell('Freund hinzufügen', `<div class="tl fr">${body}</div>`) + shareModals();
}

/* Reiter per Tastatur: Pfeil links/rechts, Pos1, Ende wechseln und aktivieren den Reiter (rollender tabindex). */
document.addEventListener('keydown', e => {
  const t = e.target;
  if (!t || !t.classList || !t.classList.contains('tl-tab') || e.altKey || e.ctrlKey || e.metaKey) return;
  const tabs = Array.from(t.parentElement.querySelectorAll('[role="tab"]'));
  const i = tabs.indexOf(t);
  let n;
  if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
  else if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
  else if (e.key === 'Home') n = 0;
  else if (e.key === 'End') n = tabs.length - 1;
  else return;
  e.preventDefault();
  const id = tabs[n].dataset.id;
  share.ui.tab = id; render();
  const focusTab = () => { const nt = document.getElementById('tl-tab-' + id); if (nt && document.activeElement !== nt) focusWithoutScroll(nt); };
  focusTab(); setTimeout(focusTab, 30);   // sofort (schnelle Tastenfolge) und nochmals, falls der DOM-Tausch spaeter fertig wird
});

function shareFindInbox(id) { return share.inbox.find(x => x.id === id) || null; }
function settingsSharePreviewView() {
  const item = shareFindInbox(share.previewId);
  if (!item) { return settingsDetailShell('Rezept ansehen', '<div class="tl tl--prev"><div class="tl-card"><p>Dieses Rezept ist nicht mehr da. Vielleicht hast du es schon übernommen oder abgelehnt.</p><button class="ghost-btn primary-btn--block" data-action="share-back-inbox">Zurück zu Empfangen</button></div></div>'); }
  const r = shareRecipeFromPayload(item.recipe, item.from_handle);
  const meta = [timeInfo(r).cardText, yieldText(r, r.servings), r.difficulty || ''].filter(Boolean);
  const ings = r.ingredients.filter(i => (i.name || '').trim());
  const body = `
    <div class="tl tl--prev share-preview">
      <div class="tl-prev-head">
        <p class="share-from">Von ${shareWho({ display_name: item.from_name, handle: item.from_handle })}</p>
        ${r.publicOrigin ? `<p class="share-from share-origin">${escapeHtml(r.publicOrigin.authorName ? 'Aus der Rezeptbibliothek, von ' + r.publicOrigin.authorName : 'Aus der Savora-Rezeptbibliothek')}</p>` : ''}
        ${item.message ? `<p class="share-msg share-msg--box">„${escapeHtml(item.message)}“</p>` : ''}
        ${share.previewImage ? `<img class="share-preview-img" src="${escapeHtml(share.previewImage)}" alt="${escapeHtml(r.title)}">` : ''}
        <h2 class="detail-title-v2">${escapeHtml(r.title)}</h2>
        <p class="detail-meta-v2">${meta.map(escapeHtml).join(' • ')}</p>
        <div class="share-preview-actions">
          <button class="primary-btn primary-btn--block" data-action="share-accept" data-id="${escapeAttr(item.id)}">${ICONS.check} In meine Rezepte übernehmen</button>
          <button class="ghost-btn primary-btn--block" data-action="share-accept" data-mode="keep" data-id="${escapeAttr(item.id)}">In «Rezepte von Freunden» behalten</button>
          <button class="ghost-btn primary-btn--block" data-action="share-decline" data-id="${escapeAttr(item.id)}">Ablehnen</button>
          <p class="tl-hint">Das ist nur eine Vorschau. Beim Übernehmen bekommst du eine eigene Kopie, der Absender wird vermerkt, und das Original bleibt unverändert. «In Rezepte von Freunden behalten» legt die Kopie zusätzlich in diese Kategorie (Filter auf der Rezepte-Seite). Ablehnen löscht das Rezept aus deinem Eingang.</p>
        </div>
      </div>
      <div class="tl-prev-body">
        <h3 class="share-sub">Zutaten</h3>
        <ul class="share-list">${ings.map(i => `<li>${escapeHtml(ingredientText(i))}</li>`).join('') || '<li>Keine Zutaten</li>'}</ul>
        <h3 class="share-sub">Zubereitung</h3>
        <ol class="share-list">${r.steps.filter(s => s.text).map(s => `<li>${escapeHtml(s.text).replace(/\n/g, '<br>')}</li>`).join('') || '<li>Keine Schritte</li>'}</ol>
        ${r.publicTips ? `<h3 class="share-sub">Kochtipps aus der Rezeptbibliothek</h3><p>${escapeHtml(r.publicTips).replace(/\n/g, '<br>')}</p>` : ''}
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
function shareSendModal() {
  if (!state.modal || state.modal.type !== 'share-send') return '';
  const r = state.recipes.find(x => x.id === state.modal.recipeId);
  if (!r) return '';
  const onSharePage = state.view === 'friends' || state.view === 'settings-share';
  const toPage = (label, view) => `<button class="primary-btn" data-action="${onSharePage && view === 'friends' ? 'close-modal' : 'goto-view'}" data-view="${view}">${label}</button>`;
  const st = shareProfileState();
  let inner;
  if (st === 'signedout') {
    inner = `<p class="settings-hint settings-hint--none">Zum Senden brauchst du ein Konto. Dann kannst du Rezepte direkt an Freunde in Savora senden.</p><div class="form-actions"><button class="primary-btn" data-action="goto-view" data-view="${shareSignInView()}">Zur Anmeldung</button></div>`;
  } else if (st === 'loading') {
    shareEnsureLoaded();
    inner = '<p class="settings-hint settings-hint--none" role="status">Profil wird geladen …</p>';
  } else if (st === 'error') {
    inner = `<p class="settings-hint settings-hint--none" role="alert">Profil konnte nicht geladen werden.${share.error ? ' ' + escapeHtml(share.error) : ''}</p><div class="form-actions"><button class="primary-btn" data-action="share-refresh">Erneut versuchen</button></div>`;
  } else if (st === 'absent') {
    inner = `<p class="settings-hint settings-hint--none">Lege zuerst dein Profil an. Danach kannst du Freunde hinzufügen.</p><div class="form-actions">${toPage('Profil einrichten', 'friends-profile')}</div>`;
  } else {
    const people = share.connections.filter(c => c.state === 'connected');
    inner = people.length ? `
      <fieldset class="share-people"><legend class="tl-lead">Wem möchtest du es senden?</legend>
        ${people.map(c => `<label class="share-person"><input type="radio" name="shareTo" value="${escapeAttr(c.handle)}" ${share.ui.sendTo === c.handle ? 'checked' : ''}><span>${shareWho(c)}</span></label>`).join('')}
      </fieldset>
      <div class="field"><label for="shareMessage">Nachricht (freiwillig)</label><textarea id="shareMessage" maxlength="200" rows="2" placeholder="z. B. Probier das mal!"></textarea></div>
      <p class="cloud-error" id="shareError" role="alert"></p>
      <div class="form-actions"><button class="primary-btn" data-action="share-send" data-id="${escapeAttr(r.id)}">Rezept senden</button><button class="ghost-btn" data-action="close-modal">Abbrechen</button></div>`
      : `<p class="settings-hint settings-hint--none">Du hast noch keine Freunde in Savora. Füge zuerst einen Freund hinzu.</p><div class="form-actions">${toPage('Freund hinzufügen', 'friends-add')}</div>`;
  }
  const change = state.modal.from === 'pick' ? ` <button type="button" class="text-btn" data-action="share-pick-open">Anderes Rezept</button>` : '';
  return sheet('share-send-title', 'Rezept senden', `<p class="settings-hint settings-hint--none">„${escapeHtml(r.title || 'Rezept')}“ wird als Kopie gesendet. Dein Original bleibt unverändert. Gesendet wird erst, wenn du «Rezept senden» tippst. Mitgesendet werden Zutaten, Zubereitung und deine Notizen.${change}</p>${inner}`);
}

/* Pro Freund: Rezept senden, Freundschaft entfernen, blockieren. Die Folgen stehen vor der Aktion. */
function shareManageModal() {
  if (!state.modal || state.modal.type !== 'friend-manage') return '';
  const c = share.connections.find(x => x.handle === state.modal.handle && x.state === 'connected');
  if (!c) return '';
  const n = escapeHtml(shareName(c)), h = escapeAttr(c.handle);
  return sheet('friend-manage-title', shareName(c), `
    ${c.display_name ? `<p class="settings-hint settings-hint--none">@${escapeHtml(c.handle)}</p>` : ''}
    <div class="menu-list"><button class="menu-item" data-action="friend-send" data-id="${h}">${SHARE_SVG.send}<span>Rezept an ${n} senden</span></button></div>
    <h3 class="fr-sub">Freundschaft beenden</h3>
    <p class="tl-hint tl-hint--flush"><strong>Entfernen:</strong> Ihr könnt euch keine Rezepte mehr senden. Noch nicht übernommene Rezepte zwischen euch werden gelöscht. Was du schon übernommen hast, bleibt bei dir. Du kannst später wieder eine Anfrage senden.</p>
    <button class="ghost-btn primary-btn--block" data-action="share-remove" data-id="${h}">Freundschaft entfernen</button>
    <p class="tl-hint"><strong>Blockieren:</strong> Wie Entfernen, und ${n} kann dir danach nichts mehr senden. Du kannst die Sperre unter «Anfragen» aufheben.</p>
    <button class="ghost-btn primary-btn--block" data-action="share-respond" data-id="${h}" data-answer="block">${n} blockieren</button>
    <div class="form-actions"><button class="text-btn" data-action="close-modal">Schliessen</button></div>`);
}
function shareCodeResetModal() {
  if (!state.modal || state.modal.type !== 'friend-code-reset') return '';
  return sheet('friend-code-title', 'Neuen Einladungscode erzeugen?', `
    <p class="settings-hint settings-hint--none">Dein bisheriger Code und alle bisherigen Einladungslinks funktionieren danach nicht mehr. Wer sie noch hat, kann dir damit keine Anfrage mehr senden. Bestehende Freunde bleiben verbunden.</p>
    <p class="cloud-error" id="shareResetError" role="alert"></p>
    <div class="form-actions"><button class="primary-btn" data-action="share-invite-reset-confirm">Neuen Code erzeugen</button><button class="ghost-btn" data-action="close-modal">Abbrechen</button></div>`);
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
    case 'share-back-inbox': share.ui.tab = 'inbox'; state.view = 'friends'; render(); return true;
    case 'share-profile-save': {
      if (share.saving) return true;
      const h = (((document.getElementById('shareHandle') || {}).value || '').trim().replace(/^@+/, '')).toLowerCase();
      const n = (((document.getElementById('shareName') || {}).value) || '').trim();
      if (!SHARE_PROFILE_RE.test(h)) { shareShowError('Der Benutzername braucht 3 bis 24 Zeichen: Kleinbuchstaben, Zahlen oder Unterstrich.'); return true; }
      if (n.length > 40) { shareShowError('Der sichtbare Name ist zu lang (höchstens 40 Zeichen).'); return true; }
      share.saving = true; el.disabled = true; el.setAttribute('aria-busy', 'true');
      const st = document.getElementById('shareStatus'); if (st) st.textContent = 'Wird gespeichert …';
      const err = document.getElementById('shareError'); if (err) err.textContent = '';
      try {
        const saved = await shareRpc('savora_profile_set', { p_handle: h, p_name: n });
        if (saved) share.profile = saved;
        share.error = null; share.ui.savedAt = Date.now();
        render(); showToast('Profil gespeichert'); shareRefresh();
      } catch (e) {
        if (st) st.textContent = '';
        shareShowError(e && e.offline ? 'Keine Verbindung zum Internet. Dein Profil wurde nicht gespeichert. Bitte später nochmals versuchen.' : shareErrText(e));
      } finally { share.saving = false; if (document.contains(el)) { el.disabled = false; el.removeAttribute('aria-busy'); } }
      return true;
    }
    case 'share-copy-link': if (share.profile) await shareCopy(shareInviteLink(share.profile), 'Einladungslink kopiert'); return true;
    case 'share-copy-code': if (share.profile) await shareCopy(share.profile.invite_code, 'Code kopiert'); return true;
    case 'share-invite-reset': openModal({ type: 'friend-code-reset' }); return true;   // erst warnen und bestaetigen lassen
    case 'share-invite-reset-confirm': {
      if (share.busyReset) return true;
      share.busyReset = true; el.disabled = true;
      try { share.profile = await shareRpc('savora_invite_reset'); closeModal(); showToast('Neuer Code erzeugt'); }
      catch (e) { shareShowError(shareErrText(e), 'shareResetError'); }
      finally { share.busyReset = false; if (document.contains(el)) el.disabled = false; }
      return true;
    }
    case 'share-connect': {
      const t = ((document.getElementById('shareTarget') || {}).value || '').trim();
      if (!t) { shareShowError('Bitte einen Profilnamen oder Code eingeben.', 'shareConnectError'); return true; }
      el.disabled = true;
      try {
        const r = await shareRpc('savora_connect', { p_target: t });
        sessionStorage.removeItem(SHARE_INVITE_KEY);
        showToast(r.state === 'connected' ? `Verbunden mit ${shareName(r)}` : `Anfrage an ${shareName(r)} gesendet`);
        share.ui.tab = 'friends'; state.view = 'friends'; render();
        shareRefresh();
      } catch (e) { shareShowError(shareErrText(e), 'shareConnectError'); }
      finally { if (document.contains(el)) el.disabled = false; }
      return true;
    }
    case 'share-respond': {
      const answer = el.dataset.answer;
      if (answer === 'block' && !window.confirm('Dieses Profil blockieren? Es kann dir dann nichts mehr senden.')) return true;
      try {
        await shareRpc('savora_respond', { p_handle: id, p_action: answer });
        if (state.modal && state.modal.type === 'friend-manage') closeModal();
        await shareRefresh(); render(); showToast(answer === 'accept' ? 'Verbunden' : answer === 'block' ? 'Blockiert' : 'Anfrage abgelehnt');
      } catch (e) { showToast(shareErrText(e), 'error'); }
      return true;
    }
    case 'share-remove': {
      const c = share.connections.find(x => x.handle === id);
      const text = c && c.state === 'connected' ? `Freundschaft mit ${shareName(c)} entfernen? Ihr könnt euch dann keine Rezepte mehr senden. Noch nicht übernommene Rezepte zwischen euch werden gelöscht.` : null;
      if (text && !window.confirm(text)) return true;
      try {
        await shareRpc('savora_remove', { p_handle: id });
        if (state.modal && state.modal.type === 'friend-manage') closeModal();
        await shareRefresh(); render();
        showToast(c && c.state === 'connected' ? 'Freundschaft entfernt' : c && c.state === 'blocked' ? 'Entsperrt' : 'Anfrage zurückgezogen');
      } catch (e) { showToast(shareErrText(e), 'error'); }
      return true;
    }
    case 'friend-manage': openModal({ type: 'friend-manage', handle: id }); return true;
    case 'friend-send': share.ui.sendTo = id; state.modal = { type: 'share-pick' }; render(); setTimeout(() => { const q = document.getElementById('sharePickQ'); if (q && window.matchMedia('(pointer: fine)').matches) q.focus(); }, 50); return true;
    case 'share-open-send': {
      share.ui.sendTo = null;
      openModal({ type: 'share-send', recipeId: id });
      if (cloudSignedIn() && share.profile === undefined) shareRefresh().then(() => { if (state.modal && state.modal.type === 'share-send') render(); });
      return true;
    }
    case 'share-send': {
      if (share.sending) return true;   // Doppelsenden verhindern (zusaetzlich zur globalen Sperre in ui.js)
      const r = state.recipes.find(x => x.id === id);
      const to = document.querySelector('input[name="shareTo"]:checked');
      if (!r || !to) { shareShowError('Bitte zuerst einen Empfänger wählen.'); return true; }
      const msg = ((document.getElementById('shareMessage') || {}).value || '').trim();
      share.sending = true; el.disabled = true;
      try {
        const image = await shareImageDataUrl(r);
        await shareRpc('savora_send', { p_handle: to.value, p_recipe: shareBuildPayload(r), p_image: image, p_message: msg || null });
        const c = share.connections.find(x => x.handle === to.value);
        share.ui.sendTo = null;
        closeModal();
        setTimeout(() => showToast(`Rezept an ${c ? shareName(c) : '@' + to.value} gesendet`), 50);
      } catch (e) { shareShowError(e.offline ? 'Keine Verbindung zum Internet. Dein Rezept wurde nicht gesendet. Bitte später nochmals versuchen.' : 'Nicht gesendet: ' + shareErrText(e)); }
      finally { share.sending = false; if (document.contains(el)) el.disabled = false; }
      return true;
    }
    case 'share-pick-open': if (!(state.modal && state.modal.type === 'share-send')) share.ui.sendTo = null; openModal({ type: 'share-pick' }); setTimeout(() => { const q = document.getElementById('sharePickQ'); if (q && window.matchMedia('(pointer: fine)').matches) q.focus(); }, 50); return true;
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
