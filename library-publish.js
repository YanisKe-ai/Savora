/* ---------- Rezeptbibliothek: Veröffentlichen, Meine Veröffentlichungen, Öffentliches Profil, Moderation ----------
   Nur Oberfläche. Daten und Serverzugriffe liegen in library.js (lib, libDraftFromRecipe, libValidateDraft, libPublish,
   libWithdraw, libLoadMine, libLoadPubProfile, libSavePubProfile, libPublicationForRecipe, libModLoad, libModAction,
   libModCloseReport, libModBan, libDraftGet/Set/Clear, libShareLink, libShareNative, libOpenDetail).
   Grundsätze:
   - Öffentlich wird nur, was im Ablauf bewusst bestätigt wurde. Private Notizen werden nie automatisch zu Kochtipps.
   - Nichts wird vorgetäuscht: Erfolg erst nach Serverantwort, bei Fehlern bleiben Eingaben erhalten.
   - Offline wird nichts in eine Warteschlange gelegt. Der Entwurf bleibt lokal (kontogebunden über libDraftKey).
   - Konto gewechselt (lib.gen geändert): alte Antworten werden verworfen, Verwaltungsansichten geleert.
   Routen: lib-publish, lib-mine, lib-pubprofile, lib-mod. Aktionen: lib-pub-*, lib-mine-*, lib-prof-*, lib-mod-*. */

const LP_ICONS = {
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z"/></svg>',
  person: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3"/><path d="M6.5 18.5a6.5 6.5 0 0 1 11 0"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10c-4-1.7-7-5.5-7-10V6z"/></svg>',
  ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  problem: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 6.5v7"/><circle cx="12" cy="17.5" r="0.6" fill="currentColor"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M7 12h10"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3"/><path d="M7.5 7.5L12 3l4.5 4.5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>',
  image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5L5 20"/></svg>',
};

const LP_STEPS = [{ n: 1, label: 'Rezept prüfen' }, { n: 2, label: 'Vorschau' }, { n: 3, label: 'Veröffentlichen', short: 'Veröffent&shy;lichen' }];
const LP_TIPS_MAX = 2000;
const LP_NAME_MAX = 40;
const LP_BIO_MAX = 160;
const LP_NOTE_MAX = 500;
const LP_REASONS = { spam: 'Spam', foreign: 'Fremde Inhalte', problematic: 'Problematische Inhalte', other: 'Anderer Grund' };
const LP_PUBLIC_DIETS = ['vegan', 'vegetarisch', 'fleisch', 'fisch'];
const LP_NET_TEXT = 'Keine Verbindung zum Internet. Bitte später nochmals versuchen.';
const LP_OFFLINE = 'Du bist offline. Zum Veröffentlichen brauchst du eine Internetverbindung. Dein Entwurf bleibt auf diesem Gerät gespeichert.';

/* UI-Zustand dieser Datei. Gehört zum Konto (gen): bei Kontowechsel wird alles verworfen. */
const libPub = {
  gen: null,
  busy: false, phase: '', error: null, conflict: false, fieldErrors: null, rightsError: false, rights: false,
  success: null,                         // { recipeId, id, title }
  mine: { state: 'idle', items: [], error: null, at: 0 },
  prof: { state: 'idle', error: null, at: 0 },
  form: null,                            // { name, bio, avatarBlob, avatarUrl, removeAvatar, suggested, error, saving, savedAt }
  mod: { state: 'idle', status: 'open', items: [], error: null },
  modalBusy: false, modalError: '',
  tipsTimer: null,
};

/* ---------- Hilfen ---------- */
function lpGen() { return (typeof lib !== 'undefined' && lib && typeof lib.gen === 'number') ? lib.gen : 0; }
function lpSync() {
  const g = lpGen();
  if (libPub.gen === g) return;
  libPub.gen = g;
  libPub.busy = false; libPub.phase = ''; libPub.error = null; libPub.conflict = false; libPub.fieldErrors = null;
  libPub.rights = false; libPub.rightsError = false; libPub.success = null;
  libPub.mine = { state: 'idle', items: [], error: null, at: 0 };
  libPub.prof = { state: 'idle', error: null, at: 0 };
  lpFormReset();
  libPub.mod = { state: 'idle', status: 'open', items: [], error: null };
  libPub.modalBusy = false; libPub.modalError = '';
}
function lpSignedIn() { try { return typeof cloudSignedIn === 'function' && cloudSignedIn(); } catch (e) { return false; } }
function lpOffline() { return typeof navigator !== 'undefined' && navigator.onLine === false; }
function lpErrText(e, fallback) {
  if (e && e.offline) return 'Keine Verbindung zum Internet. Bitte später nochmals versuchen.';
  const m = e && e.message ? String(e.message).replace(/^KONFLIKT:\s*/, '') : '';
  // Nur verständliche Texte zeigen: keine Rohfehler mit Tabellen- oder Funktionsnamen
  if (!m || /savora_|relation|column|syntax|function |violates|PGRST|JWT|fetch|network|TypeError|undefined|null/i.test(m)) return fallback || 'Das hat nicht geklappt. Bitte nochmals versuchen.';
  return m;
}
function lpFmtDate(v) {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d) ? '' : d.toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' });
}
function lpFmtMinutes(m) {
  const n = Number(m);
  if (!(n > 0)) return '';
  if (n < 60) return `${n} Min.`;
  const h = Math.floor(n / 60), r = n % 60;
  return r ? `${h} Std. ${r} Min.` : `${h} Std.`;
}
function lpRecipe(id) { return (state.recipes || []).find(r => r.id === id) || null; }
function lpHasOwnPhoto(r) {
  if (!r) return false;
  try { return !!(typeof recipeSafeImageId === 'function' ? recipeSafeImageId(r) : r.imageId); } catch (e) { return !!r.imageId; }
}
function lpLocalImageId(r) {
  try { return typeof recipeSafeImageId === 'function' ? recipeSafeImageId(r) : (r && r.imageId) || null; } catch (e) { return null; }
}
function lpDraftGet(recipeId) { try { return (typeof libDraftGet === 'function' && libDraftGet(recipeId)) || null; } catch (e) { return null; } }
function lpDraftSet(recipeId, patch) { try { if (typeof libDraftSet === 'function' && recipeId) libDraftSet(recipeId, patch); } catch (e) { /* Entwurf ist Komfort, kein Muss */ } }
function lpDraftClear(recipeId) { try { if (typeof libDraftClear === 'function' && recipeId) libDraftClear(recipeId); } catch (e) { /* nicht kritisch */ } }
function lpPublicationFor(recipeId) {
  try { return (typeof libPublicationForRecipe === 'function' && libPublicationForRecipe(recipeId)) || null; } catch (e) { return null; }
}
function lpProfileData() {
  const p = (typeof lib !== 'undefined' && lib && lib.pubProfile) ? lib.pubProfile.data : undefined;
  return p === undefined ? undefined : (p || null);
}
function lpModAllowed() { return !!(typeof lib !== 'undefined' && lib && lib.mod && lib.mod.allowed); }
function lpRerender(views) {
  if (state.modal) return;
  if (views && !views.includes(state.view)) return;
  const a = document.activeElement;
  // Nie mitten in einer Eingabe neu zeichnen (Cursor, Bildschirmtastatur)
  if (a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.type !== 'checkbox' && a.type !== 'file') { libPub.dirty = true; return; }
  render();
}
document.addEventListener('focusout', () => { if (libPub.dirty) { libPub.dirty = false; setTimeout(() => lpRerender(['lib-publish', 'lib-mine', 'lib-pubprofile', 'lib-mod', 'more']), 150); } });

/* ---------- Laden (mit Konto-Generation, veraltete Antworten werden verworfen) ---------- */
async function lpLoadProfile(force) {
  lpSync();
  if (!lpSignedIn() || typeof libLoadPubProfile !== 'function') return;
  if (libPub.prof.state === 'loading') return;
  if (!force && libPub.prof.state === 'ready' && Date.now() - libPub.prof.at < 30000) return;
  const gen = lpGen();
  libPub.prof.state = 'loading'; libPub.prof.error = null;
  try {
    await libLoadPubProfile();
    if (gen !== lpGen()) return;
    // library.js wirft nicht, sondern setzt lib.pubProfile.status ('ready' | 'error' | 'offline' | 'signedout')
    const st = lib.pubProfile ? lib.pubProfile.status : 'error';
    if (st === 'ready') { libPub.prof.state = 'ready'; libPub.prof.at = Date.now(); }
    else { libPub.prof.state = 'error'; libPub.prof.error = st === 'offline' ? 'offline' : lpErrText({ message: lib.pubProfile && lib.pubProfile.error }, 'Das öffentliche Profil konnte nicht geladen werden.'); }
  } catch (e) {
    if (gen !== lpGen()) return;
    libPub.prof.state = 'error'; libPub.prof.error = e && e.offline ? 'offline' : lpErrText(e, 'Das öffentliche Profil konnte nicht geladen werden.');
  }
  lpRerender(['lib-publish', 'lib-pubprofile', 'lib-mine', 'more']);
}
async function lpLoadMine(force) {
  lpSync();
  if (!lpSignedIn() || typeof libLoadMine !== 'function') return;
  if (libPub.mine.state === 'loading') return;
  if (!force && libPub.mine.state === 'ready' && Date.now() - libPub.mine.at < 15000) return;
  const gen = lpGen();
  libPub.mine.state = 'loading'; libPub.mine.error = null;
  try {
    await libLoadMine();
    if (gen !== lpGen()) return;
    const m = lib.mine || {};
    libPub.mine.items = Array.isArray(m.items) ? m.items : [];
    if (m.status === 'ready') { libPub.mine.state = 'ready'; libPub.mine.at = Date.now(); libPub.mine.error = m.error ? (m.error === LP_NET_TEXT ? 'offline' : m.error) : null; }
    else { libPub.mine.state = 'error'; libPub.mine.error = m.status === 'offline' ? 'offline' : lpErrText({ message: m.error }, 'Deine Veröffentlichungen konnten nicht geladen werden.'); }
  } catch (e) {
    if (gen !== lpGen()) return;
    libPub.mine.state = 'error'; libPub.mine.error = e && e.offline ? 'offline' : lpErrText(e, 'Deine Veröffentlichungen konnten nicht geladen werden.');
  }
  lpRerender(['lib-publish', 'lib-mine', 'lib-pubprofile', 'more']);
}
async function lpLoadMod(force) {
  lpSync();
  if (!lpSignedIn() || !lpModAllowed() || typeof libModLoad !== 'function') return;
  if (libPub.mod.state === 'loading' && !force) return;
  const gen = lpGen(), status = libPub.mod.status;
  libPub.mod.state = 'loading'; libPub.mod.error = null;
  try {
    await libModLoad(status);
    if (gen !== lpGen() || status !== libPub.mod.status) return;
    const m = lib.mod || {};
    if (m.status === 'ready') { libPub.mod.items = Array.isArray(m.reports) ? m.reports : []; libPub.mod.state = 'ready'; }
    else { libPub.mod.state = 'error'; libPub.mod.error = lpOffline() ? 'offline' : lpErrText({ message: m.error }, 'Die Meldungen konnten nicht geladen werden.'); }
  } catch (e) {
    if (gen !== lpGen()) return;
    libPub.mod.state = 'error'; libPub.mod.error = e && e.offline ? 'offline' : lpErrText(e, 'Die Meldungen konnten nicht geladen werden.');
  }
  lpRerender(['lib-mod']);
}
function lpMineItems() { return (lib.mine && lib.mine.status === 'ready' && Array.isArray(lib.mine.items)) ? lib.mine.items : libPub.mine.items; }
function lpPublishedCount() { return lpMineItems().filter(x => x && x.status === 'published' && !x.blocked).length; }

/* ---------- Gemeinsame Bausteine ---------- */
function lpCard(inner, cls, attrs) { return `<div class="tl-card lp-card ${cls || ''}" ${attrs || ''}>${inner}</div>`; }
function lpSignInCard(text) {
  return lpCard(`<h2 class="tl-h tl-h--card">Anmeldung nötig</h2><p>${text}</p>
    <button type="button" class="primary-btn primary-btn--block" data-action="lib-pub-signin">Zur Anmeldung</button>`, 'tl-card--intro');
}
function lpOfflineCard(text) {
  return lpCard(`<p class="lp-state-title">Keine Internetverbindung</p><p class="tl-hint tl-hint--flush">${text}</p>
    <button type="button" class="ghost-btn primary-btn--block" data-action="lib-pub-retry">Erneut versuchen</button>`, 'lp-card--state', 'role="status"');
}
function lpErrorCard(text, action) {
  return lpCard(`<p class="lp-state-title">${escapeHtml(text)}</p>
    <button type="button" class="ghost-btn primary-btn--block" data-action="${action}">Erneut versuchen</button>`, 'lp-card--state', 'role="alert"');
}
function lpLoading(text) { return `<p class="tl-loading lp-loading" role="status"><span class="lp-spinner" aria-hidden="true"></span>${text}</p>`; }

/* ---------- Einstieg am eigenen Rezept ---------- */
function libPublishMenuItemHtml(recipe) {
  if (!recipe || recipe.publicOrigin) return '';   // persönliche Kopien aus der Bibliothek werden nicht erneut veröffentlicht
  const pub = lpPublicationFor(recipe.id);
  if (pub && (pub.status === 'blocked' || pub.blocked)) return '';
  const label = pub && pub.status === 'published' ? 'Veröffentlichung aktualisieren' : 'In der Rezeptbibliothek veröffentlichen';
  return `<button type="button" class="menu-item" data-action="lib-pub-open" data-id="${escapeAttr(recipe.id)}">${LP_ICONS.globe}<span>${label}</span></button>`;
}

/* Öffnet den Ablauf. Ohne Angabe wird eine bestehende Veröffentlichung dieses Rezepts erkannt (Aktualisieren). */
function libOpenPublish(recipeId, opts) {
  lpSync();
  const o = opts || {};
  const r = lpRecipe(recipeId);
  const saved = lpDraftGet(recipeId) || {};
  const pub = o.publicationId ? null : lpPublicationFor(recipeId);
  const usable = pub && !(pub.status === 'blocked' || pub.blocked) ? pub : null;
  lib.publish = {
    recipeId,
    step: o.step || (saved.step >= 1 && saved.step <= 2 ? saved.step : 1),   // Schritt 3 nie direkt: Rechte werden jedes Mal neu bestätigt
    publicationId: o.publicationId || (usable && usable.id) || null,
    expectedVersion: o.expectedVersion != null ? o.expectedVersion : (usable ? usable.version : null),
    tips: typeof saved.tips === 'string' ? saved.tips.slice(0, LP_TIPS_MAX) : '',
    includePhoto: typeof saved.includePhoto === 'boolean' ? saved.includePhoto : lpHasOwnPhoto(r),
  };
  libPub.success = null; libPub.error = null; libPub.conflict = false; libPub.fieldErrors = null; libPub.rights = false; libPub.rightsError = false;
  state.modal = null;
  state.view = 'lib-publish';
  render();
  // Bestehende Veröffentlichung erst nach dem Laden sicher bekannt: dann nachtragen (nur wenn nicht schon gesetzt)
  if (lpSignedIn() && !o.publicationId && libPub.mine.state !== 'ready') {
    lpLoadMine().then(() => {
      const p = lib.publish;
      if (!p || p.recipeId !== recipeId || p.publicationId) return;
      const found = lpPublicationFor(recipeId);
      if (found && !(found.status === 'blocked' || found.blocked)) { p.publicationId = found.id; p.expectedVersion = found.version; lpRerender(['lib-publish']); }
    });
  }
}
function lpPub() {
  if (typeof lib === 'undefined') return null;
  if (!lib.publish) lib.publish = { recipeId: null, step: 1, publicationId: null, expectedVersion: null, tips: '', includePhoto: false };
  return lib.publish;
}

/* ---------- Entwurf und Prüfung ---------- */
function lpBuildDraft(r, p) {
  const includePhoto = !!(p.includePhoto && lpHasOwnPhoto(r));
  let draft = null;
  try { draft = libDraftFromRecipe(r, { tips: p.tips || '', includePhoto }); } catch (e) { draft = null; }
  let check = { ok: false, errors: [{ field: 'recipe', message: 'Dieses Rezept kann gerade nicht geprüft werden.' }], warnings: [] };
  if (draft) { try { check = libValidateDraft(draft, r) || check; } catch (e) { /* bleibt ungültig */ } }
  return { draft, check, includePhoto };
}
// Fehler und Hinweise je Prüfpunkt (Feldnamen aus libValidateDraft; unbekannte Felder landen unter «Rezept»)
const LP_FIELD_GROUP = { title: 'title', servings: 'yield', servingMode: 'yield', yieldLabel: 'yield', ingredients: 'ingredients', steps: 'steps',
  time: 'time', timeMinutes: 'time', prepMinutes: 'time', cookMinutes: 'time', restMinutes: 'time', difficulty: 'time',
  diet: 'tags', categories: 'tags', image: 'photo', photo: 'photo', source: 'source', tips: 'tips' };
function lpGroupOf(field) {
  const f = String(field || '').split(/[.[]/)[0];
  return LP_FIELD_GROUP[f] || 'recipe';
}
function lpMessagesFor(list, group) {
  return (list || []).filter(x => x && lpGroupOf(x.field) === group).map(x => String(x.message || '')).filter(Boolean);
}

function lpCheckItem(key, status, title, value, extra) {
  const label = status === 'ok' ? 'In Ordnung' : status === 'problem' ? 'Bitte prüfen' : 'Hinweis';
  const errId = status === 'problem' ? ` aria-describedby="lp-err-${key}"` : '';
  return `<li class="lp-check lp-check--${status}" data-check="${key}"${errId}>
    <span class="lp-check-icon" aria-hidden="true">${status === 'ok' ? LP_ICONS.ok : status === 'problem' ? LP_ICONS.problem : LP_ICONS.info}</span>
    <div class="lp-check-body">
      <p class="lp-check-title">${title}<span class="sr-only">: ${label}</span></p>
      ${value ? `<p class="lp-check-value">${value}</p>` : ''}
      ${extra || ''}
    </div>
  </li>`;
}
function lpErrLines(key, msgs) {
  return msgs.length ? `<p class="lp-field-error" id="lp-err-${key}">${msgs.map(escapeHtml).join(' ')}</p>` : '';
}

function lpStepper(step) {
  return `<nav class="lp-steps" aria-label="Schritte zum Veröffentlichen"><ol>${LP_STEPS.map(t => {
    const cur = t.n === step, done = t.n < step;
    return `<li class="lp-step ${cur ? 'is-current' : ''} ${done ? 'is-done' : ''}">${done
      ? `<button type="button" data-action="lib-pub-step" data-id="${t.n}" aria-label="Schritt ${t.n} von 3: ${t.label}, erledigt. Zurück zu diesem Schritt">`
      : `<span class="lp-step-box" ${cur ? 'aria-current="step"' : ''} aria-label="Schritt ${t.n} von 3: ${t.label}${cur ? ', aktuell' : ''}">`}<span class="lp-step-no" aria-hidden="true">${done ? LP_ICONS.ok : t.n}</span><span class="lp-step-label" aria-hidden="true">${t.short || t.label}</span>${done ? '</button>' : '</span>'}</li>`;
  }).join('')}</ol></nav>`;
}

function lpStep1Html(r, p, built) {
  const { draft, check } = built;
  const d = draft || {};
  const errs = libPub.fieldErrors || [];   // erst nach «Weiter» angezeigt; vorher nur der neutrale Zustand
  const shown = check.errors || [];   // Prüfpunkte sind keine Eingaben: Probleme gleich zeigen, die Zusammenfassung erst nach «Weiter»
  const st = (group, okCond, neutral) => lpMessagesFor(shown, group).length ? 'problem' : okCond ? 'ok' : (neutral ? 'neutral' : 'problem');
  const items = [];

  // Titel
  items.push(lpCheckItem('title', lpMessagesFor(shown, 'title').length || (libPub.fieldErrors && !d.title) ? 'problem' : (d.title ? 'ok' : 'neutral'), 'Titel',
    d.title ? escapeHtml(d.title) : 'Noch kein Titel', lpErrLines('title', lpMessagesFor(shown, 'title').length ? lpMessagesFor(shown, 'title') : (libPub.fieldErrors && !d.title ? ['Ein Titel ist nötig.'] : []))));

  // Ergibt
  const yieldTxt = d.servings > 0 ? escapeHtml(d.servingMode === 'pieces' ? `${d.servings} ${d.yieldLabel || 'Stück'}` : `${d.servings} ${d.servings === 1 ? 'Portion' : 'Portionen'}`) : 'Nicht angegeben';
  items.push(lpCheckItem('yield', st('yield', d.servings > 0, true), 'Ergibt', yieldTxt, lpErrLines('yield', lpMessagesFor(shown, 'yield'))));

  // Zutaten
  const ings = (d.ingredients || []).filter(i => i && !i.isGroupHeader && String(i.name || '').trim());
  const qualitative = ings.filter(i => { try { return qtyIngredientStatus(i) === 'qualitative'; } catch (e) { return false; } });
  const ingTxt = ings.length ? `${ings.length} ${ings.length === 1 ? 'Zutat' : 'Zutaten'}` : 'Noch keine Zutaten';
  const ingExtra = (qualitative.length ? `<p class="lp-check-note">Angaben wie «${escapeHtml(qualitative[0].name)}» sind erlaubt.</p>` : '')
    + lpMessagesFor(check.warnings, 'ingredients').map(m => `<p class="lp-check-note">${escapeHtml(m)}</p>`).join('')
    + lpErrLines('ingredients', lpMessagesFor(shown, 'ingredients').length ? lpMessagesFor(shown, 'ingredients') : (libPub.fieldErrors && !ings.length ? ['Mindestens eine Zutat ist nötig.'] : []));
  items.push(lpCheckItem('ingredients', (lpMessagesFor(shown, 'ingredients').length || (libPub.fieldErrors && !ings.length)) ? 'problem' : ings.length ? 'ok' : 'neutral', 'Zutaten', ingTxt, ingExtra));

  // Zubereitung
  const steps = (d.steps || []).filter(s => s && String(s.text || '').trim());
  const stepTxt = steps.length ? `${steps.length} ${steps.length === 1 ? 'Schritt' : 'Schritte'}` : 'Noch keine Schritte';
  items.push(lpCheckItem('steps', (lpMessagesFor(shown, 'steps').length || (libPub.fieldErrors && !steps.length)) ? 'problem' : steps.length ? 'ok' : 'neutral', 'Zubereitung', stepTxt,
    lpErrLines('steps', lpMessagesFor(shown, 'steps').length ? lpMessagesFor(shown, 'steps') : (libPub.fieldErrors && !steps.length ? ['Mindestens ein Schritt ist nötig.'] : []))));

  // Zeit (unbekannt ist erlaubt, nie als 0)
  const timeParts = [d.timeMinutes > 0 ? `Gesamtzeit ${lpFmtMinutes(d.timeMinutes)}` : 'Zeit unbekannt'];
  if (d.prepMinutes > 0) timeParts.push(`Vorbereitung ${lpFmtMinutes(d.prepMinutes)}`);
  if (d.cookMinutes > 0) timeParts.push(`Garen ${lpFmtMinutes(d.cookMinutes)}`);
  if (d.restMinutes > 0) timeParts.push(`Ruhen ${lpFmtMinutes(d.restMinutes)}`);
  items.push(lpCheckItem('time', st('time', d.timeMinutes > 0, true), 'Zeitangaben', escapeHtml(timeParts.join(' · ')),
    (d.timeMinutes > 0 ? '' : '<p class="lp-check-note">Das ist erlaubt. Die Zeit wird nicht geschätzt.</p>') + lpErrLines('time', lpMessagesFor(shown, 'time'))));

  // Kategorie und Ernährungsweise (freiwillig, nur öffentliche Werte)
  const tagLabels = (d.diet || []).filter(x => LP_PUBLIC_DIETS.includes(x)).map(categoryLabelFor).concat((d.categories || []).map(categoryLabelFor));
  const hadAllergy = (r.diet || []).some(x => ['glutenfrei', 'laktosefrei', 'nussfrei'].includes(x));
  items.push(lpCheckItem('tags', st('tags', tagLabels.length, true), 'Kategorie und Ernährungsweise',
    tagLabels.length ? escapeHtml(tagLabels.join(', ')) : 'Keine Angabe (freiwillig)',
    `<p class="lp-check-note">${hadAllergy ? 'Deine Allergieangaben (glutenfrei, laktosefrei, nussfrei) werden nicht veröffentlicht.' : 'Allergieangaben werden nie veröffentlicht.'}</p>` + lpErrLines('tags', lpMessagesFor(shown, 'tags'))));

  // Foto (freiwillig, nur eigenes Foto)
  const own = lpHasOwnPhoto(r);
  const photoCtl = own ? `<label class="lp-switch"><input type="checkbox" role="switch" id="lpIncludePhoto" data-lp-photo ${built.includePhoto ? 'checked' : ''} aria-describedby="lpPhotoHint"><span class="lp-switch-track" aria-hidden="true"><span class="lp-switch-thumb"></span></span><span class="lp-switch-label">Foto mitveröffentlichen</span></label>
      <p class="lp-check-note" id="lpPhotoHint">Veröffentliche nur Fotos, die du selbst gemacht hast oder verwenden darfst.</p>` : '';
  items.push(lpCheckItem('photo', st('photo', own && built.includePhoto, true), 'Foto',
    own ? (built.includePhoto ? 'Dein Foto wird mitveröffentlicht.' : 'Ohne Foto') : 'Ohne Foto. Dieses Rezept hat kein eigenes Foto.', photoCtl + lpErrLines('photo', lpMessagesFor(shown, 'photo'))));

  // Quelle (freiwillig)
  const src = d.source || {};
  const srcTxt = src.url ? escapeHtml(typeof domainFromUrl === 'function' ? domainFromUrl(src.url) : src.url) : src.text ? escapeHtml(src.text) : 'Keine Quelle angegeben';
  items.push(lpCheckItem('source', st('source', src.url || src.text, true), 'Quelle', srcTxt,
    '<p class="lp-check-note">Eine Quellenangabe ist keine Erlaubnis. Veröffentliche fremde Rezepte nur, wenn du das darfst.</p>' + lpErrLines('source', lpMessagesFor(shown, 'source'))));

  const general = lpMessagesFor(shown, 'recipe');
  const tipsMsgs = lpMessagesFor(shown, 'tips');
  const tips = p.tips || '';
  const tipsDescr = ['lpTipsHint', 'lpTipsCount'].concat(tipsMsgs.length ? ['lp-err-tips'] : []).join(' ');
  const hasNotes = !!String(r.notes || '').trim();
  const summaryErr = libPub.fieldErrors && !check.ok
    ? `<div class="lp-summary-error" role="alert" id="lpSummaryError" tabindex="-1"><p><strong>Bitte prüfe die markierten Punkte.</strong></p>${general.length ? `<p>${general.map(escapeHtml).join(' ')}</p>` : ''}<p>Titel, Zutaten und Zubereitung änderst du im Rezept selbst.</p>
        <button type="button" class="ghost-btn primary-btn--small" data-action="edit-recipe" data-id="${escapeAttr(r.id)}">Rezept bearbeiten</button></div>` : '';
  void errs;
  return `
    <section class="lp-section" aria-labelledby="lpCheckH">
      <h2 class="lp-h" id="lpCheckH">Rezept prüfen</h2>
      <p class="lp-lead">Das wird öffentlich. Private Felder wie Notizen, Favoriten, Kochverlauf und Sammlungen bleiben bei dir.</p>
      ${summaryErr}
      <ul class="lp-checklist">${items.join('')}</ul>
    </section>
    <section class="lp-section" aria-label="Öffentliche Kochtipps">
      <div class="field lp-field lp-field--tips">
        <label for="lpTips">Öffentliche Kochtipps (freiwillig)</label>
        <textarea id="lpTips" rows="4" maxlength="${LP_TIPS_MAX}" data-lp-tips aria-describedby="${tipsDescr}"${tipsMsgs.length ? ' aria-invalid="true"' : ''} placeholder="z. B. Schmeckt am nächsten Tag noch besser.">${escapeHtml(tips)}</textarea>
        <div class="lp-field-foot"><p class="tl-hint tl-hint--flush" id="lpTipsHint">Deine privaten Notizen werden nicht veröffentlicht.</p><span class="lp-count" id="lpTipsCount" aria-live="polite">${tips.length} / ${LP_TIPS_MAX}</span></div>
        ${lpErrLines('tips', tipsMsgs)}
        ${hasNotes ? `<button type="button" class="text-btn lp-notes-btn" data-action="lib-pub-notes" data-id="${escapeAttr(r.id)}">Notizen als Vorlage einfügen</button>` : ''}
      </div>
    </section>
    <div class="lp-footer">
      <button type="button" class="ghost-btn" data-action="edit-recipe" data-id="${escapeAttr(r.id)}">Rezept bearbeiten</button>
      <button type="button" class="primary-btn" data-action="lib-pub-step" data-id="2">Weiter zur Vorschau</button>
    </div>`;
}

/* ---------- Öffentliche Darstellung (Vorschau) ---------- */
function lpPreviewHtml(pubLike, opts) {
  // Bevorzugt die öffentliche Detaildarstellung aus library-views.js (UI-A), damit Vorschau und Veröffentlichung gleich aussehen
  if (typeof libPublicRecipeHtml === 'function') {
    try {
      const h = libPublicRecipeHtml(pubLike, Object.assign({ preview: true, titleTag: 'h2', linkAuthor: false, localImageSrc: pubLike.localImageSrc || '' }, opts || {}));
      if (h) return (pubLike.image_path || pubLike.localImageSrc) ? h : `<p class="lp-nophoto">${LP_ICONS.image}<span>Ohne Foto</span></p>${h}`;
    } catch (e) { /* eigene Darstellung */ }
  }
  const d = pubLike.recipe || {};
  const imgId = pubLike.localImageId;
  const facts = [d.timeMinutes > 0 ? lpFmtMinutes(d.timeMinutes) : 'Zeit unbekannt',
    d.servings > 0 ? (d.servingMode === 'pieces' ? `Ergibt ${d.servings} ${d.yieldLabel || 'Stück'}` : `Ergibt ${d.servings} ${d.servings === 1 ? 'Portion' : 'Portionen'}`) : 'Ergibt: offen',
    d.difficulty || ''].filter(Boolean);
  const extra = [d.prepMinutes > 0 ? `Vorbereitung ${lpFmtMinutes(d.prepMinutes)}` : '', d.cookMinutes > 0 ? `Garen ${lpFmtMinutes(d.cookMinutes)}` : '', d.restMinutes > 0 ? `Ruhen ${lpFmtMinutes(d.restMinutes)}` : ''].filter(Boolean);
  const chips = (d.diet || []).filter(x => LP_PUBLIC_DIETS.includes(x) && !(x === 'vegetarisch' && (d.diet || []).includes('vegan'))).map(categoryLabelFor).concat((d.categories || []).map(categoryLabelFor));
  let groups = [];
  try { groups = getIngredientGroups({ ingredients: d.ingredients || [] }); } catch (e) { groups = [{ title: 'Zutaten', ingredients: (d.ingredients || []).filter(i => i && !i.isGroupHeader) }]; }
  const showTitles = groups.length > 1 || (groups[0] && groups[0].title !== 'Zutaten');
  const amount = (i) => { try { return scaledAmountLine(i, 1); } catch (e) { return [i.amount, i.unit].filter(x => x !== '' && x != null).join(' '); } };
  let entries = [];
  try { entries = stepEntries({ steps: d.steps || [] }); } catch (e) { entries = (d.steps || []).map(s => ({ text: s.text, heading: false })); }
  let n = 0;
  const src = d.source || {};
  const srcHtml = src.url
    ? `Quelle: <a href="${escapeAttr(src.url)}" target="_blank" rel="noopener noreferrer nofollow">${escapeHtml(src.text || (typeof domainFromUrl === 'function' ? domainFromUrl(src.url) : src.url))}</a>`
    : src.text ? `Quelle: ${escapeHtml(src.text)}` : '';
  const author = (pubLike.author && pubLike.author.display_name) || '';
  return `<article class="lp-public" aria-labelledby="lpPubTitle">
    ${pubLike.imageUrl
      ? `<div class="lp-public-hero"><img class="lp-public-img" src="${escapeAttr(pubLike.imageUrl)}" alt="${escapeAttr(d.title || '')}" loading="lazy"></div>`
      : imgId
      ? `<div class="lp-public-hero"><div class="lp-public-img placeholder" data-lazy-img="full" data-image-id="${escapeAttr(imgId)}" data-img-class="lp-public-img" data-img-alt="${escapeAttr(d.title || '')}"></div></div>`
      : `<p class="lp-nophoto">${LP_ICONS.image}<span>Ohne Foto</span></p>`}
    <div class="lp-public-head">
      <h3 class="lp-public-title" id="lpPubTitle">${escapeHtml(d.title || 'Ohne Titel')}</h3>
      ${author ? `<p class="lp-public-author">Von ${escapeHtml(author)}</p>` : ''}
      <p class="detail-meta-v2 lp-public-facts">${facts.map(f => `<span class="fact">${escapeHtml(f)}</span>`).join('')}</p>
      ${extra.length ? `<p class="detail-times">${extra.map(escapeHtml).join(' · ')}</p>` : ''}
      ${chips.length ? `<p class="lp-public-chips">${chips.map(c => `<span class="source-chip">${escapeHtml(c)}</span>`).join('')}</p>` : ''}
    </div>
    <section class="lp-public-sec" aria-label="Zutaten">
      <h4 class="lp-public-h">Zutaten</h4>
      ${groups.map(g => `<div class="ing-group">${showTitles ? `<h5 class="ing-group-title">${escapeHtml(g.title)}</h5>` : ''}
        <ul class="lp-ing-list">${g.ingredients.map(i => `<li><span class="ing-amount">${escapeHtml(amount(i))}</span><span class="ing-name">${escapeHtml(i.name)}</span></li>`).join('')}</ul></div>`).join('')}
    </section>
    <section class="lp-public-sec" aria-label="Zubereitung">
      <h4 class="lp-public-h">Zubereitung</h4>
      <ol class="step-list-v2">${entries.map(e => e.heading
        ? `<li class="step-heading"><h5>${escapeHtml(String(e.text).trim().replace(/:$/, ''))}</h5></li>`
        : `<li><span class="step-no" aria-hidden="true">${++n}</span><p>${escapeHtml(e.text)}</p></li>`).join('')}</ol>
    </section>
    ${d.tips ? `<section class="lp-public-sec" aria-label="Kochtipps"><h4 class="lp-public-h">Kochtipps</h4><p class="lp-public-tips">${escapeHtml(d.tips)}</p></section>` : ''}
    ${srcHtml ? `<p class="source-line lp-public-source">${srcHtml}</p>` : ''}
  </article>`;
}

/* Eigenes Foto für die Vorschau: aus IndexedDB laden, als Objekt-URL zwischenspeichern (ein Bild zur Zeit). */
function lpPreviewImageSrc(imageId) {
  if (!imageId) return '';
  const c = libPub.previewImg;
  if (c && c.id === imageId) return c.url || '';
  if (c && c.url) { try { URL.revokeObjectURL(c.url); } catch (e) { /* nicht kritisch */ } }
  libPub.previewImg = { id: imageId, url: '' };
  Promise.resolve(typeof dbGetImage === 'function' ? dbGetImage(imageId) : null).then(img => {
    const cur = libPub.previewImg;
    if (!cur || cur.id !== imageId || !img || !img.blob) return;
    cur.url = URL.createObjectURL(img.blob);
    lpRerender(['lib-publish']);
  }).catch(() => {});
  return '';
}
function lpStep2Html(r, p, built) {
  const prof = lpProfileData() || {};
  const pubLike = {
    id: p.publicationId || null, version: p.expectedVersion || null, recipe: built.draft || {},
    author: { public_id: prof.public_id || '', display_name: prof.display_name || '', bio: prof.bio || '', avatar_path: prof.avatar_path || null },
    image_path: null, thumb_path: null, published_at: null, preview: true,
    localImageId: built.includePhoto ? lpLocalImageId(r) : null,
  };
  pubLike.localImageSrc = pubLike.localImageId ? lpPreviewImageSrc(pubLike.localImageId) : '';
  return `
    <section class="lp-section" aria-labelledby="lpPrevH">
      <h2 class="lp-h" id="lpPrevH">Vorschau</h2>
      <p class="lp-lead">So sehen andere dein Rezept. Private Notizen, Favoriten und Kochverlauf sind nicht dabei.</p>
      <div class="lp-preview-frame">${lpPreviewHtml(pubLike)}</div>
    </section>
    <div class="lp-footer lp-footer--3">
      <button type="button" class="ghost-btn" data-action="lib-pub-step" data-id="1">Zurück zur Prüfung</button>
      <button type="button" class="text-btn" data-action="edit-recipe" data-id="${escapeAttr(r.id)}">Rezept bearbeiten</button>
      <button type="button" class="primary-btn" data-action="lib-pub-step" data-id="3">Weiter zur Bestätigung</button>
    </div>`;
}

function lpStep3Html(r, p, built) {
  const isUpdate = !!p.publicationId;
  const err = libPub.error;
  return `
    <section class="lp-section" aria-labelledby="lpConfH">
      <h2 class="lp-h" id="lpConfH">${isUpdate ? 'Veröffentlichung aktualisieren' : 'Veröffentlichen'}</h2>
      <div class="lp-facts-box">
        <p><strong>Dein Rezept wird öffentlich sichtbar. Andere können es in ihre persönliche Sammlung übernehmen.</strong></p>
        <ul class="lp-bullets">
          <li>Andere dürfen ihre Kopie bearbeiten und privat verwenden, zum Beispiel im eigenen Kochbuch.</li>
          <li>Eine kommerzielle Nutzung erlaubst du damit nicht.</li>
          <li>Wenn du die Veröffentlichung später zurückziehst, bleiben bereits gespeicherte persönliche Kopien bei anderen erhalten.</li>
          ${isUpdate ? '<li>Die öffentliche Fassung wird durch diese neue Fassung ersetzt. Dein privates Rezept bleibt unverändert.</li>' : '<li>Dein privates Rezept bleibt unverändert und getrennt von der öffentlichen Fassung.</li>'}
        </ul>
        <p class="tl-hint tl-hint--flush">${built.includePhoto ? 'Dein Foto wird mitveröffentlicht.' : 'Das Rezept wird ohne Foto veröffentlicht.'}</p>
      </div>
      <div class="lp-rights ${libPub.rightsError ? 'is-invalid' : ''}">
        <label class="lp-rights-label"><input type="checkbox" id="lpRights" data-lp-rights ${libPub.rights ? 'checked' : ''}${libPub.rightsError ? ' aria-invalid="true" aria-describedby="lpRightsErr"' : ''}>
          <span>Ich habe die Rechte an Text und Fotos dieses Rezepts oder darf sie veröffentlichen.</span></label>
        ${libPub.rightsError ? '<p class="lp-field-error" id="lpRightsErr">Bitte bestätige zuerst die Rechte.</p>' : ''}
      </div>
      <p class="lp-progress" id="lpProgress" role="status" aria-live="polite">${libPub.busy ? `<span class="lp-spinner" aria-hidden="true"></span>${escapeHtml(libPub.phase || 'Wird veröffentlicht …')}` : ''}</p>
      ${err ? `<div class="lp-summary-error" role="alert" id="lpPublishError" tabindex="-1"><p><strong>${libPub.conflict ? 'Diese Veröffentlichung wurde inzwischen geändert.' : 'Nicht veröffentlicht.'}</strong></p><p>${escapeHtml(err)}</p>
        ${libPub.conflict ? '<button type="button" class="ghost-btn primary-btn--small" data-action="lib-pub-reload">Neu laden</button>' : ''}</div>` : ''}
    </section>
    <div class="lp-footer">
      <button type="button" class="ghost-btn" data-action="lib-pub-step" data-id="2" ${libPub.busy ? 'disabled' : ''}>Zurück zur Vorschau</button>
      <button type="button" class="primary-btn lp-publish-btn" data-action="lib-pub-submit" ${libPub.busy ? 'aria-busy="true" aria-disabled="true"' : ''}>${isUpdate ? 'Aktualisieren' : 'Veröffentlichen'}</button>
    </div>`;
}

function lpSuccessHtml(r) {
  const s = libPub.success;
  return lpCard(`<span class="lp-success-mark" aria-hidden="true">${LP_ICONS.ok}</span>
    <h2 class="lp-h lp-success-h" id="lpSuccessH" tabindex="-1">${s.updated ? 'Deine Veröffentlichung ist aktualisiert.' : 'Dein Rezept ist veröffentlicht.'}</h2>
    <p class="tl-hint tl-hint--flush">${escapeHtml(s.title || '')}</p>
    <div class="lp-success-actions">
      <button type="button" class="primary-btn" data-action="lib-pub-view" data-id="${escapeAttr(s.id)}">Rezept ansehen</button>
      <button type="button" class="ghost-btn" data-action="lib-pub-share" data-id="${escapeAttr(s.id)}">${LP_ICONS.share} Link teilen</button>
    </div>
    <button type="button" class="text-btn lp-success-back" data-action="lib-pub-done" data-id="${escapeAttr(r ? r.id : '')}">Zurück zum Rezept</button>`, 'lp-success', 'role="status"');
}

/* Vorbedingungen. Gibt HTML zurück, wenn der Ablauf (noch) nicht starten kann, sonst ''. */
function lpPublishGate(r) {
  if (r.publicOrigin) return lpCard('<p class="lp-state-title">Diese Kopie stammt aus der Rezeptbibliothek.</p><p class="tl-hint tl-hint--flush">Persönliche Kopien veröffentlichter Rezepte können nicht erneut veröffentlicht werden.</p>', 'lp-card--state');
  if (lpOffline()) return lpOfflineCard(LP_OFFLINE);
  if (!lpSignedIn()) return lpSignInCard('Zum Veröffentlichen brauchst du ein Konto. Dein Entwurf bleibt gespeichert und du kommst nach der Anmeldung hierher zurück.');
  const ps = libPub.prof.state;
  if (ps === 'idle' && lpProfileData() === undefined) { setTimeout(() => lpLoadProfile(), 0); return lpLoading('Öffentliches Profil wird geprüft …'); }
  if (ps === 'loading' && lpProfileData() === undefined) return lpLoading('Öffentliches Profil wird geprüft …');
  if (ps === 'error' && lpProfileData() === undefined) return libPub.prof.error === 'offline' ? lpOfflineCard(LP_OFFLINE) : lpErrorCard(libPub.prof.error, 'lib-pub-retry');
  const prof = lpProfileData();
  if (!prof) {
    return lpCard(`<h2 class="tl-h tl-h--card">Zuerst ein öffentliches Profil einrichten</h2>
      <p>Veröffentlichte Rezepte erscheinen mit deinem öffentlichen Anzeigenamen. Dein Freunde-Profil, deine E-Mail und dein Einladungscode bleiben privat.</p>
      <button type="button" class="primary-btn primary-btn--block" data-action="lib-pub-profile">Öffentliches Profil einrichten</button>
      <p class="tl-hint">Danach kommst du hierher zurück. Dein Entwurf bleibt gespeichert.</p>`, 'tl-card--intro');
  }
  if (prof.publishing_blocked) {
    return lpCard('<p class="lp-state-title">Veröffentlichen ist für dein Konto gesperrt.</p><p class="tl-hint tl-hint--flush">Die Moderation hat deine Veröffentlichungsrechte gesperrt. Deine privaten Rezepte sind davon nicht betroffen.</p>', 'lp-card--state', 'role="status"');
  }
  return '';
}

function lpPickerHtml() {
  const own = (state.recipes || []).filter(r => r && !r.publicOrigin).slice().sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'de'));
  if (!own.length) {
    return lpCard(`<h2 class="tl-h tl-h--card">Noch kein eigenes Rezept</h2><p>Veröffentlichen kannst du eigene Rezepte. Erstelle zuerst ein Rezept.</p>
      <button type="button" class="primary-btn primary-btn--block" data-action="new-recipe">Rezept erstellen</button>`, 'tl-card--intro');
  }
  return `<section class="lp-section" aria-labelledby="lpPickH">
    <h2 class="lp-h" id="lpPickH">Welches Rezept möchtest du veröffentlichen?</h2>
    <p class="lp-lead">Danach prüfst du es und siehst eine Vorschau. Nichts wird öffentlich, bevor du bestätigst.</p>
    <ul class="lp-list lp-pick">${own.map(r => {
      const pub = lpPublicationFor(r.id);
      const note = pub && pub.status === 'published' ? 'Bereits veröffentlicht' : pub && (pub.status === 'blocked' || pub.blocked) ? 'Gesperrt' : lpDraftGet(r.id) ? 'Entwurf vorhanden' : '';
      const blocked = pub && (pub.status === 'blocked' || pub.blocked);
      return `<li><button type="button" class="lp-pick-btn" data-action="lib-pub-open" data-id="${escapeAttr(r.id)}" ${blocked ? 'disabled' : ''}><span class="lp-row-title">${escapeHtml(r.title || 'Ohne Titel')}</span>${note ? `<span class="lp-row-sub">${escapeHtml(note)}</span>` : ''}<span class="lp-pick-chev" aria-hidden="true">${ICONS.chevronRight}</span></button></li>`;
    }).join('')}</ul>
  </section>`;
}
/* Einstieg ohne Rezept (z. B. leere Bibliothek): Rezeptauswahl als eigene Seite */
function libStartPublish() {
  lpSync();
  lib.publish = { recipeId: null, step: 1, publicationId: null, expectedVersion: null, tips: '', includePhoto: false, pick: true };
  libPub.success = null; libPub.error = null;
  state.modal = null; state.view = 'lib-publish'; render();
  if (lpSignedIn() && libPub.mine.state === 'idle') lpLoadMine();
}
function libPublishView() {
  lpSync();
  const p = lpPub();
  if (p && p.pick && !p.recipeId) return settingsDetailShell('Rezept veröffentlichen', `<div class="lp lp--publish">${lpPickerHtml()}</div>`) + lpModals();
  const r = p && lpRecipe(p.recipeId);
  if (!r) {
    return settingsDetailShell('Veröffentlichen', `<div class="lp">${lpCard('<p class="lp-state-title">Dieses Rezept ist auf diesem Gerät nicht vorhanden.</p><button type="button" class="ghost-btn primary-btn--block" data-action="back">Zurück</button>', 'lp-card--state')}</div>`) + lpModals();
  }
  if (libPub.success && libPub.success.recipeId === r.id) {
    const title = libPub.success.updated ? 'Veröffentlichung aktualisieren' : 'Veröffentlichen';
    return settingsDetailShell(title, `<div class="lp lp--publish">${lpSuccessHtml(r)}</div>`) + lpModals();
  }
  const title = p.publicationId ? 'Veröffentlichung aktualisieren' : 'Veröffentlichen';
  const gate = lpPublishGate(r);
  const head = `<p class="lp-recipe-name"><span class="lp-recipe-label">Rezept</span> ${escapeHtml(r.title || 'Ohne Titel')}</p>`;
  if (gate) return settingsDetailShell(title, `<div class="lp lp--publish">${head}${gate}</div>`) + lpModals();
  let step = [1, 2, 3].includes(Number(p.step)) ? Number(p.step) : 1;
  const built = lpBuildDraft(r, p);
  // Rezept inzwischen ungültig (z. B. im Editor geändert oder alter Entwurf): Vorschau und Bestätigung erst nach erfolgreicher Prüfung
  if (step > 1 && !built.check.ok) { step = 1; p.step = 1; }
  const body = step === 1 ? lpStep1Html(r, p, built) : step === 2 ? lpStep2Html(r, p, built) : lpStep3Html(r, p, built);
  return settingsDetailShell(title, `<div class="lp lp--publish" data-lp-step="${step}">${head}${lpStepper(step)}<div class="lp-step-body">${body}</div></div>`) + lpModals();
}

/* Eingaben im Ablauf: ohne Neuaufbau speichern (Cursor bleibt), Entwurf verzögert sichern */
document.addEventListener('input', (e) => {
  const t = e.target;
  if (!t || !t.matches) return;
  if (t.matches('[data-lp-tips]')) {
    const p = lpPub(); if (!p) return;
    p.tips = String(t.value || '').slice(0, LP_TIPS_MAX);
    const c = document.getElementById('lpTipsCount'); if (c) c.textContent = `${p.tips.length} / ${LP_TIPS_MAX}`;
    clearTimeout(libPub.tipsTimer);
    const rid = p.recipeId;
    libPub.tipsTimer = setTimeout(() => lpDraftSet(rid, { tips: p.tips, includePhoto: !!p.includePhoto, step: p.step }), 300);
  } else if (t.matches('[data-lp-prof-name], [data-lp-prof-bio]')) {
    lpFormFromDom(); lpUpdateProfilePreview();
  }
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (!t || !t.matches) return;
  if (t.matches('[data-lp-photo]')) {
    const p = lpPub(); if (!p) return;
    p.includePhoto = !!t.checked;
    lpDraftSet(p.recipeId, { tips: p.tips, includePhoto: p.includePhoto, step: p.step });
    render();
  } else if (t.matches('[data-lp-rights]')) {
    libPub.rights = !!t.checked;
    if (libPub.rights && libPub.rightsError) { libPub.rightsError = false; render(); }
  } else if (t.matches('[data-lp-avatar]')) {
    lpPickAvatar(t);
  }
});

async function lpSubmit(el) {
  const p = lpPub();
  const r = p && lpRecipe(p.recipeId);
  if (!r || libPub.busy) return;   // Doppelklickschutz
  if (!libPub.rights) { libPub.rightsError = true; render(); const c = document.getElementById('lpRights'); if (c) focusWithoutScroll(c); return; }
  if (lpOffline()) { libPub.error = LP_OFFLINE; libPub.conflict = false; render(); return; }
  if (!lpSignedIn()) { render(); return; }
  const built = lpBuildDraft(r, p);
  if (!built.draft || !built.check.ok) { p.step = 1; libPub.fieldErrors = built.check.errors || []; render(); lpFocusSummary(); return; }
  const gen = lpGen();
  libPub.busy = true; libPub.error = null; libPub.conflict = false;
  libPub.phase = built.includePhoto ? 'Foto wird vorbereitet …' : 'Wird veröffentlicht …';
  render();
  const btn = document.querySelector('.lp-publish-btn'); if (btn) focusWithoutScroll(btn);
  const onProgress = (phase) => {
    if (gen !== lpGen() || !libPub.busy) return;
    libPub.phase = phase === 'image' || phase === 'upload' ? 'Foto wird vorbereitet …' : 'Wird veröffentlicht …';
    const pr = document.getElementById('lpProgress');
    if (pr) pr.innerHTML = `<span class="lp-spinner" aria-hidden="true"></span>${escapeHtml(libPub.phase)}`;
  };
  try {
    const res = await libPublish({ recipe: r, draft: built.draft, publicationId: p.publicationId || null, expectedVersion: p.publicationId ? p.expectedVersion : null, includePhoto: built.includePhoto, termsAccepted: libPub.rights === true, onProgress });
    if (gen !== lpGen()) return;   // Konto gewechselt: nichts mehr anzeigen
    const id = res && res.id;
    libPub.success = { recipeId: r.id, id, title: (built.draft && built.draft.title) || r.title || '', updated: !!p.publicationId };
    p.publicationId = id || p.publicationId; p.expectedVersion = res && res.version != null ? res.version : p.expectedVersion;
    libPub.rights = false;
    lpDraftClear(r.id);   // library.js räumt ebenfalls auf; doppelt schadet nicht
    libPub.mine.at = 0;   // library.js lädt die Liste selbst neu; hier nur als veraltet markieren
  } catch (e) {
    if (gen !== lpGen()) return;
    libPub.conflict = !!(e && (e.conflict || /^KONFLIKT:/.test(String(e.message || ''))));
    libPub.error = libPub.conflict ? 'Lade sie neu und prüfe die Änderungen. Deine Eingaben bleiben erhalten.' : e && e.offline ? LP_OFFLINE : lpErrText(e, 'Das Rezept konnte nicht veröffentlicht werden. Bitte nochmals versuchen.');
  } finally {
    if (gen === lpGen()) { libPub.busy = false; libPub.phase = ''; }
  }
  if (gen !== lpGen()) return;
  render();
  if (libPub.success) { const h = document.getElementById('lpSuccessH'); if (h) focusWithoutScroll(h); announceLive(libPub.success.updated ? 'Deine Veröffentlichung ist aktualisiert.' : 'Dein Rezept ist veröffentlicht.'); }
  else { const box = document.getElementById('lpPublishError'); if (box) focusWithoutScroll(box); }
  void el;
}
function lpFocusSummary() {
  requestAnimationFrame(() => { const s = document.getElementById('lpSummaryError'); if (s) focusWithoutScroll(s); });
}
function lpGoStep(n) {
  const p = lpPub();
  const r = p && lpRecipe(p.recipeId);
  if (!r || libPub.busy) return;
  n = Math.max(1, Math.min(3, Number(n) || 1));
  if (n > 1) {
    const built = lpBuildDraft(r, p);
    if (!built.check.ok) { p.step = 1; libPub.fieldErrors = built.check.errors || []; lpDraftSet(r.id, { tips: p.tips, includePhoto: !!p.includePhoto, step: 1 }); render(); lpFocusSummary(); return; }
  }
  libPub.fieldErrors = null; libPub.error = null; libPub.conflict = false; libPub.rightsError = false;
  if (n !== 3) libPub.rights = false;
  p.step = n;
  lpDraftSet(r.id, { tips: p.tips, includePhoto: !!p.includePhoto, step: Math.min(n, 2) });
  render();
  window.scrollTo(0, 0);
  requestAnimationFrame(() => { const h = document.querySelector('.lp-step-body .lp-h'); if (h) { h.setAttribute('tabindex', '-1'); focusWithoutScroll(h); } });
}

/* ---------- Meine Veröffentlichungen ---------- */
function lpStatusBadge(status) {
  const map = { published: ['Öffentlich', 'is-pub'], withdrawn: ['Zurückgezogen', 'is-off'], blocked: ['Gesperrt', 'is-blocked'], draft: ['Entwurf', 'is-draft'] };
  const [label, cls] = map[status] || [status, ''];
  return `<span class="lp-badge ${cls}">${escapeHtml(label)}</span>`;
}
function lpMineRow(x, kind) {
  const title = escapeHtml(x.title || 'Ohne Titel');
  const id = escapeAttr(x.id || '');
  let sub = '', actions = '';
  if (kind === 'draft') {
    sub = `Lokaler Entwurf, Schritt ${Math.min(2, Number(x.step) || 1)} von 3`;
    actions = `<button type="button" class="primary-btn primary-btn--small" data-action="lib-mine-draft-open" data-id="${id}" aria-label="Weiter bearbeiten: ${title}">Weiter bearbeiten</button>
      <button type="button" class="text-btn" data-action="lib-mine-draft-discard" data-id="${id}" aria-label="Entwurf verwerfen: ${title}">Entwurf verwerfen</button>`;
  } else if (kind === 'published') {
    sub = [x.published_at ? `Veröffentlicht am ${lpFmtDate(x.published_at)}` : 'Veröffentlicht', x.version > 1 ? `Version ${x.version}` : ''].filter(Boolean).join(' · ');
    actions = `<button type="button" class="ghost-btn primary-btn--small" data-action="lib-mine-view" data-id="${id}" aria-label="Ansehen: ${title}">Ansehen</button>
      <button type="button" class="ghost-btn primary-btn--small" data-action="lib-mine-update" data-id="${id}" aria-label="Aktualisieren: ${title}">Aktualisieren</button>
      <button type="button" class="text-btn" data-action="lib-mine-withdraw" data-id="${id}" aria-label="Zurückziehen: ${title}">Zurückziehen</button>`;
  } else if (kind === 'withdrawn') {
    sub = x.withdrawn_at ? `Zurückgezogen am ${lpFmtDate(x.withdrawn_at)}` : 'Zurückgezogen';
    actions = `<button type="button" class="ghost-btn primary-btn--small" data-action="lib-mine-republish" data-id="${id}" aria-label="Erneut veröffentlichen: ${title}">Erneut veröffentlichen</button>`;
  } else {
    sub = 'Von der Moderation ausgeblendet. Du kannst sie nicht erneut veröffentlichen.';
  }
  const missing = (kind === 'published' || kind === 'withdrawn') && x.source_local_id && !lpRecipe(x.source_local_id);
  return `<li class="lp-row">
    <div class="lp-row-text"><span class="lp-row-title">${title}</span><span class="lp-row-sub">${kind !== 'draft' ? lpStatusBadge(kind) : lpStatusBadge('draft')}<span>${escapeHtml(sub)}</span></span>
    ${missing ? '<span class="lp-row-note">Das ursprüngliche Rezept ist auf diesem Gerät nicht vorhanden.</span>' : ''}</div>
    ${actions ? `<div class="lp-row-actions">${actions}</div>` : ''}
  </li>`;
}
function lpSection(id, title, count, inner, lead) {
  return `<section class="lp-sec" aria-labelledby="lp-h-${id}"><h2 class="lp-sec-h" id="lp-h-${id}">${title}${count ? ` <span class="lp-count-pill">${count}</span>` : ''}</h2>${lead ? `<p class="tl-hint tl-hint--flush lp-sec-lead">${lead}</p>` : ''}${inner}</section>`;
}
function lpLocalDrafts() {
  const out = [];
  (state.recipes || []).forEach(r => {
    if (r.publicOrigin) return;
    const d = lpDraftGet(r.id);
    if (d && typeof d === 'object') out.push({ id: r.id, title: r.title, step: d.step, updatedAt: d.updatedAt || 0 });
  });
  return out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}
function libMineView() {
  lpSync();
  let body;
  const drafts = lpSignedIn() ? lpLocalDrafts() : [];
  const draftsSec = drafts.length ? lpSection('drafts', 'Entwürfe', drafts.length, `<ul class="lp-list">${drafts.map(d => lpMineRow(d, 'draft')).join('')}</ul>`, 'Nur auf diesem Gerät gespeichert und nicht öffentlich.') : '';
  if (!lpSignedIn()) {
    body = lpSignInCard('Melde dich an, um deine veröffentlichten Rezepte zu sehen und zu verwalten.');
  } else {
    const st = libPub.mine.state;
    if (st === 'idle') setTimeout(() => lpLoadMine(), 0);
    const items = lpMineItems();
    if ((st === 'idle' || st === 'loading') && !items.length) body = draftsSec + lpLoading('Veröffentlichungen werden geladen …');
    else if (st === 'error' && !items.length) body = draftsSec + (libPub.mine.error === 'offline' || lpOffline() ? lpOfflineCard('Deine Veröffentlichungen siehst du, sobald du wieder online bist. Deine Rezepte auf diesem Gerät sind nicht betroffen.') : lpErrorCard(libPub.mine.error, 'lib-mine-retry'));
    else {
      const pub = items.filter(x => x.status === 'published' && !x.blocked);
      const wd = items.filter(x => x.status === 'withdrawn' && !x.blocked);
      const bl = items.filter(x => x.status === 'blocked' || x.blocked);
      const banner = libPub.mine.error ? `<div class="tl-banner" role="status"><span>${escapeHtml(libPub.mine.error === 'offline' ? 'Keine Verbindung. Du siehst den Stand von vorhin.' : libPub.mine.error)}</span><button type="button" class="text-btn" data-action="lib-mine-retry">Erneut versuchen</button></div>` : '';
      if (!pub.length && !wd.length && !bl.length && !drafts.length) {
        body = banner + lpCard(`<h2 class="tl-h tl-h--card">Noch nichts veröffentlicht</h2>
          <p>Öffne eines deiner Rezepte und wähle im Menü «In der Rezeptbibliothek veröffentlichen».</p>
          <button type="button" class="ghost-btn primary-btn--block" data-action="nav-tab" data-view="home">Zu meinen Rezepten</button>`, 'tl-card--quiet');
      } else {
        body = banner + draftsSec
          + (pub.length ? lpSection('pub', 'Veröffentlicht', pub.length, `<ul class="lp-list">${pub.map(x => lpMineRow(x, 'published')).join('')}</ul>`) : '')
          + (wd.length ? lpSection('wd', 'Zurückgezogen', wd.length, `<ul class="lp-list">${wd.map(x => lpMineRow(x, 'withdrawn')).join('')}</ul>`, 'Nicht mehr öffentlich. Gespeicherte Kopien bei anderen bleiben erhalten.') : '')
          + (bl.length ? lpSection('bl', 'Gesperrt', bl.length, `<ul class="lp-list">${bl.map(x => lpMineRow(x, 'blocked')).join('')}</ul>`) : '');
      }
    }
  }
  return settingsDetailShell('Veröffentlichungen', `<div class="lp lp--mine">${body}<p class="lp-status" id="lpMineStatus" role="status"></p></div>`) + lpModals();
}
function lpMineFind(id) { return lpMineItems().find(x => x && x.id === id) || null; }
function lpOpenFromMine(id) {
  const x = lpMineFind(id);
  if (!x) return;
  const r = x.source_local_id && lpRecipe(x.source_local_id);
  if (!r) { showToast('Das ursprüngliche Rezept ist auf diesem Gerät nicht vorhanden. Aktualisieren geht nur mit dem eigenen Rezept.', 'info'); return; }
  if (x.status === 'blocked' || x.blocked) return;
  libOpenPublish(r.id, { publicationId: x.id, expectedVersion: x.version, step: 1 });
}

/* ---------- Öffentliches Profil ---------- */
function lpFormReset() {
  if (libPub.form && libPub.form.avatarUrl) { try { URL.revokeObjectURL(libPub.form.avatarUrl); } catch (e) { /* nicht kritisch */ } }
  libPub.form = null;
}
function lpFormEnsure() {
  if (libPub.form) return libPub.form;
  const prof = lpProfileData();
  let name = prof ? prof.display_name || '' : '', suggested = false;
  if (!prof) {
    // Vorschlag aus dem Freunde-Profil, nur vorausgefüllt: öffentlich wird er erst mit «Speichern»
    try { const fp = typeof share !== 'undefined' && share && share.profile; if (fp && fp.display_name) { name = String(fp.display_name).slice(0, LP_NAME_MAX); suggested = true; } } catch (e) { /* ohne Vorschlag */ }
  }
  libPub.form = { name, bio: prof ? prof.bio || '' : '', avatarBlob: null, avatarUrl: null, removeAvatar: false, suggested, error: '', nameError: '', saving: false, savedAt: 0, signedAvatar: null };
  return libPub.form;
}
function lpFormFromDom() {
  const f = lpFormEnsure();
  const n = document.getElementById('lpProfName'), b = document.getElementById('lpProfBio');
  if (n) f.name = String(n.value || '').slice(0, LP_NAME_MAX);
  if (b) f.bio = String(b.value || '').slice(0, LP_BIO_MAX);
  if (n && f.nameError && f.name.trim()) { f.nameError = ''; n.removeAttribute('aria-invalid'); const er = document.getElementById('lpProfNameErr'); if (er) er.textContent = ''; }
  const bc = document.getElementById('lpProfBioCount'); if (bc) bc.textContent = `${f.bio.length} / ${LP_BIO_MAX}`;
}
function lpAvatarSrc(f, prof) {
  if (f.avatarUrl) return f.avatarUrl;
  if (f.removeAvatar || !prof || !prof.avatar_path) return '';
  if (f.signedAvatar && f.signedAvatar.path === prof.avatar_path) return f.signedAvatar.url;
  if (typeof libSignedUrls === 'function' && !f.signedLoading && !lpOffline()) {
    f.signedLoading = true;
    const gen = lpGen(), path = prof.avatar_path;
    Promise.resolve(libSignedUrls([path])).then(m => {
      if (gen !== lpGen() || !libPub.form) return;
      const url = m && (m.get ? m.get(path) : m[path]);
      if (url) { libPub.form.signedAvatar = { path, url }; lpRerender(['lib-pubprofile']); }
    }).catch(() => {}).finally(() => { if (libPub.form) libPub.form.signedLoading = false; });
  }
  return '';
}
function lpAvatarHtml(name, src, cls) {
  const letter = (String(name || '').trim().charAt(0) || '?').toUpperCase();
  return src ? `<img class="lp-avatar ${cls || ''}" src="${escapeAttr(src)}" alt="" width="64" height="64">` : `<span class="lp-avatar lp-avatar--letter ${cls || ''}" aria-hidden="true">${escapeHtml(letter)}</span>`;
}
function lpProfilePreviewHtml(f, prof, count) {
  const src = lpAvatarSrc(f, prof);
  const name = f.name.trim();
  return `<div class="lp-prof-preview" aria-labelledby="lpPrevProfH">
    <h2 class="lp-sec-h" id="lpPrevProfH">So sehen andere dein Profil</h2>
    <div class="lp-prof-card" id="lpProfPreview">
      <span class="lp-prof-avatar-slot">${lpAvatarHtml(name, src)}</span>
      <div class="lp-prof-card-text">
        <p class="lp-prof-card-name" data-lp-prev-name>${name ? escapeHtml(name) : '<span class="lp-muted">Dein Anzeigename</span>'}</p>
        <p class="lp-prof-card-bio" data-lp-prev-bio ${f.bio.trim() ? '' : 'hidden'}>${escapeHtml(f.bio.trim())}</p>
        <p class="lp-prof-card-meta">${count === 1 ? '1 veröffentlichtes Rezept' : `${count} veröffentlichte Rezepte`}</p>
      </div>
    </div>
  </div>`;
}
function lpUpdateProfilePreview() {
  const f = libPub.form; if (!f) return;
  const n = document.querySelector('[data-lp-prev-name]'), b = document.querySelector('[data-lp-prev-bio]');
  const name = f.name.trim();
  if (n) n.innerHTML = name ? escapeHtml(name) : '<span class="lp-muted">Dein Anzeigename</span>';
  if (b) { b.textContent = f.bio.trim(); b.hidden = !f.bio.trim(); }
  const letter = document.querySelector('#lpProfPreview .lp-avatar--letter');
  if (letter) letter.textContent = (name.charAt(0) || '?').toUpperCase();
}
async function lpPickAvatar(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  const f = lpFormEnsure();
  lpFormFromDom();
  f.error = '';
  try {
    const p = await processImageFile(file);
    if (f.avatarUrl) { try { URL.revokeObjectURL(f.avatarUrl); } catch (e) { /* nicht kritisch */ } }
    f.avatarBlob = p.thumbBlob || p.fullBlob;
    f.avatarUrl = URL.createObjectURL(f.avatarBlob);
    f.removeAvatar = false;
  } catch (e) {
    f.error = (e && e.userMessage) || 'Dieses Bild kann nicht verwendet werden. Wähle ein anderes.';
  }
  render();
  const btn = document.querySelector('[data-action="lib-prof-avatar"]'); if (btn) focusWithoutScroll(btn);
}
function libPubProfileView() {
  lpSync();
  const explain = `<section class="lp-sec" aria-labelledby="lpVisH">
      <h2 class="lp-sec-h" id="lpVisH">Was ist öffentlich?</h2>
      <div class="lp-vis">
        <div class="lp-vis-col lp-vis-col--pub"><h3 class="lp-vis-h">${LP_ICONS.globe}<span>Öffentlich</span></h3>
          <ul><li>Anzeigename</li><li>Profilbild (freiwillig)</li><li>Kurzer Text (freiwillig)</li><li>Rezepte, die du veröffentlichst</li></ul></div>
        <div class="lp-vis-col"><h3 class="lp-vis-h">${LP_ICONS.shield}<span>Bleibt privat</span></h3>
          <ul><li>E-Mail-Adresse</li><li>Benutzername für Freunde</li><li>Einladungscode</li><li>Freunde und Anfragen</li><li>Posteingang</li><li>Alle nicht veröffentlichten Rezepte</li></ul></div>
      </div>
      <p class="tl-hint">Dein Freunde-Profil wird nicht automatisch öffentlich.</p>
    </section>`;
  let body;
  if (!lpSignedIn()) body = lpSignInCard('Für ein öffentliches Profil brauchst du ein Konto.') + explain;
  else {
    const ps = libPub.prof.state;
    if (ps === 'idle' && lpProfileData() === undefined) setTimeout(() => lpLoadProfile(), 0);
    if (libPub.mine.state === 'idle') setTimeout(() => lpLoadMine(), 0);
    const prof = lpProfileData();
    if (prof === undefined && (ps === 'idle' || ps === 'loading')) body = lpLoading('Öffentliches Profil wird geladen …') + explain;
    else if (prof === undefined && ps === 'error') body = (libPub.prof.error === 'offline' || lpOffline() ? lpOfflineCard('Dein öffentliches Profil kannst du bearbeiten, sobald du wieder online bist.') : lpErrorCard(libPub.prof.error, 'lib-prof-retry')) + explain;
    else body = lpProfileFormHtml(prof || null) + explain;
  }
  return settingsDetailShell('Öffentliches Profil', `<div class="lp lp--profile">${body}</div>`) + lpModals();
}
function lpProfileFormHtml(prof) {
  const f = lpFormEnsure();
  const count = lpPublishedCount();
  const src = lpAvatarSrc(f, prof);
  const hasAvatar = !!src || (!!(prof && prof.avatar_path) && !f.removeAvatar);
  const nameDescr = ['lpProfNameHint'].concat(f.nameError ? ['lpProfNameErr'] : []).join(' ');
  const saved = f.savedAt && Date.now() - f.savedAt < 8000;
  return `
    ${lpProfilePreviewHtml(f, prof, count)}
    <section class="lp-sec" aria-labelledby="lpProfFormH">
      <h2 class="lp-sec-h" id="lpProfFormH">${prof ? 'Profil bearbeiten' : 'Öffentliches Profil einrichten'}</h2>
      <div class="tl-card lp-card">
        <div class="field lp-field">
          <label for="lpProfName">Anzeigename</label>
          <input type="text" id="lpProfName" data-lp-prof-name maxlength="${LP_NAME_MAX}" autocomplete="nickname" value="${escapeAttr(f.name)}" aria-describedby="${nameDescr}"${f.nameError ? ' aria-invalid="true"' : ''} required>
          <p class="tl-hint" id="lpProfNameHint">${f.suggested && !prof ? 'Vorschlag aus deinem Freunde-Profil. Öffentlich wird er erst, wenn du speicherst.' : 'Erscheint bei deinen veröffentlichten Rezepten. Höchstens 40 Zeichen.'}</p>
          <p class="lp-field-error" id="lpProfNameErr">${escapeHtml(f.nameError || '')}</p>
        </div>
        <div class="field lp-field">
          <label for="lpProfBio">Kurzer Text (freiwillig)</label>
          <textarea id="lpProfBio" data-lp-prof-bio rows="3" maxlength="${LP_BIO_MAX}" aria-describedby="lpProfBioCount">${escapeHtml(f.bio)}</textarea>
          <div class="lp-field-foot"><span></span><span class="lp-count" id="lpProfBioCount">${f.bio.length} / ${LP_BIO_MAX}</span></div>
        </div>
        <div class="field lp-field">
          <span class="field-label" id="lpAvatarLabel">Profilbild (freiwillig)</span>
          <div class="lp-avatar-row">
            ${lpAvatarHtml(f.name, src, 'lp-avatar--small')}
            <label class="ghost-btn primary-btn--small lp-file-btn" data-action="lib-prof-avatar" tabindex="-1">
              <input type="file" accept="image/jpeg,image/png,image/webp" data-lp-avatar class="lp-file-input" aria-labelledby="lpAvatarLabel lpAvatarBtnText">
              <span id="lpAvatarBtnText">${hasAvatar ? 'Anderes Bild wählen' : 'Bild wählen'}</span></label>
            ${hasAvatar ? '<button type="button" class="text-btn" data-action="lib-prof-avatar-remove">Bild entfernen</button>' : ''}
          </div>
          <p class="tl-hint">Verwende nur ein Bild, das du veröffentlichen darfst.</p>
        </div>
        <p class="lp-announce">${LP_ICONS.globe}<span>Änderungen sind sofort öffentlich sichtbar.</span></p>
        <p class="lp-field-error" id="lpProfError" role="alert">${escapeHtml(f.error || '')}</p>
        <p class="fr-status" id="lpProfStatus" role="status">${f.saving ? 'Wird gespeichert …' : saved ? 'Öffentliches Profil gespeichert.' : ''}</p>
        <button type="button" class="primary-btn primary-btn--block" data-action="lib-prof-save" ${f.saving ? 'aria-busy="true" aria-disabled="true"' : ''}>${prof ? 'Änderungen veröffentlichen' : 'Öffentliches Profil einrichten'}</button>
      </div>
    </section>
    ${prof ? `<section class="lp-sec" aria-labelledby="lpProfMoreH">
      <h2 class="lp-sec-h" id="lpProfMoreH">Profil teilen und entfernen</h2>
      <div class="tl-card lp-card">
        <button type="button" class="ghost-btn primary-btn--block lp-btn-icon" data-action="lib-prof-share">${LP_ICONS.share} Link zum Profil teilen</button>
        <hr class="tl-rule">
        ${count > 0
          ? `<p class="tl-hint tl-hint--flush">Solange Rezepte veröffentlicht sind, kann das öffentliche Profil nicht entfernt werden. Ziehe zuerst deine Veröffentlichungen zurück.</p>
             <button type="button" class="text-btn" data-action="goto-view" data-view="lib-mine">Meine Veröffentlichungen</button>`
          : '<button type="button" class="text-btn lp-danger" data-action="lib-prof-delete">Öffentliches Profil entfernen</button>'}
      </div>
    </section>` : ''}
    ${libPub.pendingReturn ? '' : ''}`;
}
async function lpSaveProfile(el) {
  const f = lpFormEnsure();
  if (f.saving) return;
  lpFormFromDom();
  const name = f.name.trim();
  if (!name) { f.nameError = 'Bitte gib einen Anzeigenamen ein.'; render(); const n = document.getElementById('lpProfName'); if (n) focusWithoutScroll(n); return; }
  if (name.length > LP_NAME_MAX) { f.nameError = 'Der Anzeigename ist zu lang (höchstens 40 Zeichen).'; render(); return; }
  if (lpOffline()) { f.error = 'Keine Verbindung zum Internet. Dein Profil wurde nicht gespeichert.'; render(); return; }
  const gen = lpGen();
  f.saving = true; f.error = ''; f.nameError = '';
  render();
  try {
    const res = await libSavePubProfile({ name, bio: f.bio.trim(), avatarBlob: f.avatarBlob || null, removeAvatar: !!f.removeAvatar });
    if (gen !== lpGen()) return;
    if (res && typeof res === 'object' && typeof lib !== 'undefined' && lib.pubProfile) lib.pubProfile.data = res;
    libPub.prof.state = 'ready'; libPub.prof.at = Date.now();
    if (f.avatarUrl) { try { URL.revokeObjectURL(f.avatarUrl); } catch (e) { /* nicht kritisch */ } }
    libPub.form = null;
    const nf = lpFormEnsure(); nf.savedAt = Date.now();
    // Kam der Nutzer aus dem Veröffentlichen-Ablauf, geht es dort weiter
    const ret = typeof lib !== 'undefined' && lib.returnTo;
    if (ret && ret.view === 'lib-publish' && ret.recipeId && lpRecipe(ret.recipeId)) {
      lib.returnTo = null;
      showToast('Öffentliches Profil gespeichert');
      libOpenPublish(ret.recipeId, ret.publicationId ? { publicationId: ret.publicationId, expectedVersion: ret.expectedVersion } : undefined);
      return;
    }
    render();
    showToast('Öffentliches Profil gespeichert');
  } catch (e) {
    if (gen !== lpGen()) return;
    f.saving = false;
    f.error = e && e.offline ? 'Keine Verbindung zum Internet. Dein Profil wurde nicht gespeichert.' : lpErrText(e, 'Dein Profil konnte nicht gespeichert werden. Bitte nochmals versuchen.');
    render();
    const er = document.getElementById('lpProfError'); if (er) focusWithoutScroll(er);
  } finally { if (libPub.form) libPub.form.saving = false; }
  void el;
}

/* ---------- Moderation ---------- */
function lpPubStatusLabel(s) { return s === 'published' ? 'Öffentlich' : s === 'blocked' ? 'Ausgeblendet' : s === 'withdrawn' ? 'Zurückgezogen' : (s || 'Unbekannt'); }
function lpModRow(x) {
  const rid = escapeAttr(x.report_id || ''), pid = escapeAttr(x.publication_id || '');
  const title = escapeHtml(x.pub_title || 'Ohne Titel');
  const open = x.status !== 'closed';
  return `<li class="lp-mod-item">
    <div class="lp-mod-head"><span class="lp-row-title">${title}</span>${lpStatusBadge(x.pub_status === 'blocked' ? 'blocked' : x.pub_status === 'withdrawn' ? 'withdrawn' : 'published').replace(/>([^<]*)<\/span>$/, `>${escapeHtml(lpPubStatusLabel(x.pub_status))}</span>`)}</div>
    <dl class="lp-mod-meta">
      <div><dt>Grund</dt><dd>${escapeHtml(LP_REASONS[x.reason] || x.reason || 'Unbekannt')}</dd></div>
      ${x.comment ? `<div><dt>Kommentar</dt><dd class="lp-mod-comment">${escapeHtml(x.comment)}</dd></div>` : ''}
      <div><dt>Gemeldet am</dt><dd>${escapeHtml(lpFmtDate(x.created_at) || 'Unbekannt')}</dd></div>
      <div><dt>Autor</dt><dd>${escapeHtml(x.author_name || 'Unbekannt')}</dd></div>
      ${x.open_reports > 1 ? `<div><dt>Offene Meldungen</dt><dd>${Number(x.open_reports) || 0}</dd></div>` : ''}
    </dl>
    <div class="lp-row-actions lp-mod-actions">
      <button type="button" class="ghost-btn primary-btn--small" data-action="lib-mod-review" data-id="${pid}" aria-label="Rezept prüfen: ${title}">Rezept prüfen</button>
      ${x.pub_status === 'published' ? `<button type="button" class="ghost-btn primary-btn--small" data-action="lib-mod-ask" data-id="${rid}" data-kind="hide" aria-label="Ausblenden: ${title}">Ausblenden</button>` : ''}
      ${x.pub_status === 'blocked' ? `<button type="button" class="ghost-btn primary-btn--small" data-action="lib-mod-ask" data-id="${rid}" data-kind="restore" aria-label="Wieder freigeben: ${title}">Wieder freigeben</button>` : ''}
      ${open ? `<button type="button" class="ghost-btn primary-btn--small" data-action="lib-mod-ask" data-id="${rid}" data-kind="close" aria-label="Meldung abschliessen: ${title}">Meldung abschliessen</button>` : ''}
      <button type="button" class="text-btn lp-danger" data-action="lib-mod-ask" data-id="${rid}" data-kind="ban" aria-label="Veröffentlichungsrechte des Autors sperren: ${title}">Veröffentlichungsrechte sperren</button>
    </div>
  </li>`;
}
function libModView() {
  lpSync();
  let body;
  if (!lpSignedIn() || !lpModAllowed()) {
    body = lpCard('<p class="lp-state-title">Kein Zugriff</p><p class="tl-hint tl-hint--flush">Dieser Bereich ist nur für die Moderation.</p>', 'lp-card--state');
  } else {
    const m = libPub.mod;
    if (m.state === 'idle') setTimeout(() => lpLoadMod(), 0);
    const seg = `<div class="lp-seg" role="group" aria-label="Meldungen filtern">
      <button type="button" class="lp-seg-btn" data-action="lib-mod-filter" data-id="open" aria-pressed="${m.status === 'open'}">Offen</button>
      <button type="button" class="lp-seg-btn" data-action="lib-mod-filter" data-id="closed" aria-pressed="${m.status === 'closed'}">Abgeschlossen</button></div>`;
    let list;
    if (m.state === 'idle' || m.state === 'loading') list = lpLoading('Meldungen werden geladen …');
    else if (m.state === 'error') list = m.error === 'offline' || lpOffline() ? lpOfflineCard('Die Moderation braucht eine Internetverbindung.') : lpErrorCard(m.error, 'lib-mod-retry');
    else if (!m.items.length) list = lpCard(`<p>${m.status === 'open' ? 'Keine offenen Meldungen.' : 'Keine abgeschlossenen Meldungen.'}</p>`, 'tl-card--quiet');
    else list = `<ul class="lp-mod-list">${m.items.map(lpModRow).join('')}</ul>`;
    body = `<p class="tl-hint tl-hint--flush lp-sec-lead">Die meldende Person wird nicht angezeigt. Jede Aktion wird mit Notiz protokolliert.</p>${seg}${list}`;
  }
  return settingsDetailShell('Moderation', `<div class="lp lp--mod">${body}</div>`) + lpModals();
}

/* ---------- Dialoge (sheet/openModal-Muster: Fokusfalle, Escape, Fokusrückgabe in ui.js) ---------- */
const LP_MOD_TEXT = {
  hide: { title: 'Rezept ausblenden?', text: 'Das Rezept verschwindet aus Suche, Profil und Detailansicht. Der Autor sieht es als gesperrt und kann es nicht erneut veröffentlichen.', btn: 'Ausblenden' },
  restore: { title: 'Wieder freigeben?', text: 'Das Rezept wird wieder öffentlich sichtbar.', btn: 'Wieder freigeben' },
  close: { title: 'Meldung abschliessen?', text: 'Die Meldung wird als erledigt markiert. Am Rezept ändert sich nichts.', btn: 'Meldung abschliessen' },
  ban: { title: 'Veröffentlichungsrechte sperren?', text: 'Der Autor dieses Rezepts kann danach keine Rezepte mehr veröffentlichen oder aktualisieren. Bestehende Veröffentlichungen bleiben, bis du sie ausblendest.', btn: 'Rechte sperren' },
};
function lpModals() {
  const m = state.modal;
  if (!m || typeof m.type !== 'string' || m.type.indexOf('lib-pub-') !== 0) return '';
  const err = `<p class="cloud-error" id="lpModalError" role="alert">${escapeHtml(libPub.modalError || '')}</p>`;
  const busy = libPub.modalBusy ? ' aria-busy="true" aria-disabled="true"' : '';
  if (m.type === 'lib-pub-withdraw') {
    const x = lpMineFind(m.id);
    return sheet('lpWithdrawTitle', 'Veröffentlichung zurückziehen?', `
      ${x ? `<p class="lp-modal-subject">${escapeHtml(x.title || '')}</p>` : ''}
      <ul class="lp-bullets">
        <li>Das Rezept verschwindet aus der Suche, aus deinem öffentlichen Profil und aus der öffentlichen Detailansicht.</li>
        <li>Bereits gespeicherte persönliche Kopien bei anderen bleiben erhalten.</li>
        <li>Dein privates Rezept bleibt unverändert. Du kannst es später erneut veröffentlichen.</li>
      </ul>
      ${err}
      <div class="form-actions"><button type="button" class="ghost-btn" data-action="close-modal">Abbrechen</button><button type="button" class="primary-btn" data-action="lib-mine-withdraw-confirm" data-id="${escapeAttr(m.id)}"${busy}>${libPub.modalBusy ? 'Wird zurückgezogen …' : 'Zurückziehen'}</button></div>`);
  }
  if (m.type === 'lib-pub-discard') {
    return sheet('lpDiscardTitle', 'Entwurf verwerfen?', `
      <p class="settings-hint settings-hint--none">Deine Kochtipps und Einstellungen für die Veröffentlichung werden auf diesem Gerät gelöscht. Dein Rezept bleibt unverändert.</p>
      <div class="form-actions"><button type="button" class="ghost-btn" data-action="close-modal">Abbrechen</button><button type="button" class="primary-btn" data-action="lib-mine-draft-discard-confirm" data-id="${escapeAttr(m.id)}">Verwerfen</button></div>`);
  }
  if (m.type === 'lib-pub-profdelete') {
    return sheet('lpProfDelTitle', 'Öffentliches Profil entfernen?', `
      <p class="settings-hint settings-hint--none">Dein Anzeigename, Profilbild und Kurztext sind danach nicht mehr öffentlich. Links zu deinem Profil funktionieren nicht mehr. Dein Freunde-Profil und deine Rezepte bleiben unverändert.</p>
      ${err}
      <div class="form-actions"><button type="button" class="ghost-btn" data-action="close-modal">Abbrechen</button><button type="button" class="primary-btn" data-action="lib-prof-delete-confirm"${busy}>${libPub.modalBusy ? 'Wird entfernt …' : 'Profil entfernen'}</button></div>`);
  }
  if (m.type === 'lib-pub-modpreview') {
    const pub = libPub.modPreview;
    if (!pub) return '';
    const rec = typeof libNormalizePublic === 'function' ? libNormalizePublic(pub.recipe) : pub.recipe;
    const imageUrl = pub.image_path && typeof libImgSrc === 'function' ? libImgSrc(pub.image_path) : '';
    const html = rec ? lpPreviewHtml({ id: pub.id, version: pub.version, recipe: rec, author: pub.author || {}, image_path: pub.image_path || null, imageUrl, preview: true }, { moderation: true })
      : '<p class="settings-hint">Der Inhalt dieser Veröffentlichung ist nicht lesbar.</p>';
    return sheet('lpModPrevTitle', 'Rezept prüfen', `
      ${pub.status && pub.status !== 'published' ? `<p class="lp-modal-subject">${lpStatusBadge(pub.status === 'blocked' ? 'blocked' : 'withdrawn')}</p>` : ''}
      <div class="lp-preview-frame lp-preview-frame--modal">${html}</div>
      <div class="form-actions"><button type="button" class="ghost-btn" data-action="close-modal">Schliessen</button></div>`);
  }
  if (m.type === 'lib-pub-mod') {
    const t = LP_MOD_TEXT[m.kind] || LP_MOD_TEXT.close;
    const x = libPub.mod.items.find(i => i.report_id === m.id);
    return sheet('lpModTitle', t.title, `
      ${x ? `<p class="lp-modal-subject">${escapeHtml(x.pub_title || '')}</p>` : ''}
      <p class="settings-hint settings-hint--none">${t.text}</p>
      <div class="field lp-field"><label for="lpModNote">Notiz für das Protokoll</label>
        <textarea id="lpModNote" rows="3" maxlength="${LP_NOTE_MAX}" aria-describedby="lpModNoteHint"></textarea>
        <p class="tl-hint" id="lpModNoteHint">Nur für die Moderation sichtbar. Höchstens ${LP_NOTE_MAX} Zeichen.</p></div>
      ${err}
      <div class="form-actions"><button type="button" class="ghost-btn" data-action="close-modal">Abbrechen</button><button type="button" class="primary-btn" data-action="lib-mod-confirm" data-id="${escapeAttr(m.id)}" data-kind="${escapeAttr(m.kind)}"${busy}>${t.btn}</button></div>`);
  }
  return '';
}
function lpModalOpen(modal) { libPub.modalBusy = false; libPub.modalError = ''; openModal(modal); }
function lpModalError(msg) {
  libPub.modalError = msg;
  const el = document.getElementById('lpModalError');
  if (el) el.textContent = msg; else showToast(msg, 'error');
}

/* ---------- Zeilen für «Mehr» ---------- */
function libMoreRowsHtml() {
  lpSync();
  const signed = lpSignedIn();
  if (signed && libPub.mine.state === 'idle') setTimeout(() => lpLoadMine(), 0);
  if (signed && libPub.prof.state === 'idle' && lpProfileData() === undefined) setTimeout(() => lpLoadProfile(), 0);
  if (signed && lib.mod && !lib.mod.checked && !libPub.modChecking && typeof libModCheck === 'function') {
    libPub.modChecking = true;
    const gen = lpGen();
    Promise.resolve(libModCheck()).then(ok => { if (gen === lpGen() && ok) lpRerender(['more']); }).catch(() => {}).finally(() => { libPub.modChecking = false; });
  }
  let mineSum = 'Eigene Rezepte öffentlich teilen';
  if (!signed) mineSum = 'Zum Veröffentlichen anmelden';
  else if (libPub.mine.state === 'ready') { const n = lpPublishedCount(); mineSum = n ? `${n} veröffentlicht` : 'Noch nichts veröffentlicht'; }
  let profSum = 'Nicht eingerichtet';
  const prof = lpProfileData();
  if (!signed) profSum = 'Nicht angemeldet';
  else if (prof) profSum = prof.display_name || 'Eingerichtet';
  else if (prof === undefined) profSum = libPub.prof.state === 'error' ? 'Zurzeit nicht abrufbar' : 'Wird geladen …';
  const rows = [
    settingsRow({ icon: LP_ICONS.globe, title: 'Meine Veröffentlichungen', summary: mineSum, view: 'lib-mine' }),
    settingsRow({ icon: LP_ICONS.person, title: 'Öffentliches Profil', summary: profSum, view: 'lib-pubprofile' }),
  ];
  if (signed && lpModAllowed()) rows.push(settingsRow({ icon: LP_ICONS.shield, title: 'Moderation', summary: 'Meldungen prüfen', view: 'lib-mod' }));
  return rows.join('');   // views.js legt die Gruppe «Rezeptbibliothek» selbst darum
}

/* ---------- Aktionen ---------- */
async function handleLibraryPublishAction(action, id, el) {
  if (typeof action !== 'string' || !/^lib-(pub|mine|prof|mod)-/.test(action)) return false;
  lpSync();
  const p = lpPub();
  switch (action) {
    case 'lib-pub-open': libOpenPublish(id); return true;
    case 'lib-pub-start': if (id && lpRecipe(id)) libOpenPublish(id); else libStartPublish(); return true;
    case 'lib-pub-step': lpGoStep(id); return true;
    case 'lib-pub-submit': await lpSubmit(el); return true;
    case 'lib-pub-retry':
      libPub.prof.state = 'idle'; libPub.prof.error = null;
      if (lib.pubProfile && lib.pubProfile.data === undefined) { /* nichts */ }
      render(); lpLoadProfile(true); return true;
    case 'lib-pub-signin': {
      // Rückkehrziel merken, Entwurf bleibt (kontogebunden) gespeichert
      if (p && p.recipeId) { lib.returnTo = { view: 'lib-publish', recipeId: p.recipeId, publicationId: p.publicationId || null, expectedVersion: p.expectedVersion }; lpDraftSet(p.recipeId, { tips: p.tips || '', includePhoto: !!p.includePhoto, step: Math.min(Number(p.step) || 1, 2) }); }
      else lib.returnTo = { view: state.view };
      state.modal = null; state.view = typeof shareSignInView === 'function' ? shareSignInView() : 'settings-account'; render();
      return true;
    }
    case 'lib-pub-profile': {
      if (p && p.recipeId) { lib.returnTo = { view: 'lib-publish', recipeId: p.recipeId, publicationId: p.publicationId || null, expectedVersion: p.expectedVersion }; lpDraftSet(p.recipeId, { tips: p.tips || '', includePhoto: !!p.includePhoto, step: Math.min(Number(p.step) || 1, 2) }); }
      state.modal = null; state.view = 'lib-pubprofile'; render();
      return true;
    }
    case 'lib-pub-notes': {
      const r = lpRecipe(id); if (!r || !p) return true;
      const notes = String(r.notes || '').trim(); if (!notes) return true;
      const ta = document.getElementById('lpTips');
      const cur = ta ? ta.value : (p.tips || '');
      if (cur.trim() && !window.confirm('Die Notizen werden unter deinen bisherigen Kochtipps eingefügt. Fortfahren?')) return true;
      p.tips = (cur.trim() ? cur.replace(/\s+$/, '') + '\n\n' : '') + notes;
      p.tips = p.tips.slice(0, LP_TIPS_MAX);
      lpDraftSet(p.recipeId, { tips: p.tips, includePhoto: !!p.includePhoto, step: p.step });
      render();
      const t2 = document.getElementById('lpTips'); if (t2) { focusWithoutScroll(t2); try { t2.setSelectionRange(t2.value.length, t2.value.length); } catch (e) { /* nicht kritisch */ } }
      announceLive('Notizen eingefügt. Prüfe den Text, bevor du ihn veröffentlichst.');
      return true;
    }
    case 'lib-pub-reload': {
      // Konflikt: aktuelle Version holen, dann Vorschau erneut prüfen lassen
      libPub.error = null; libPub.conflict = false;
      await lpLoadMine(true);
      if (p && p.publicationId) { const x = lpMineFind(p.publicationId); if (x) p.expectedVersion = x.version; }
      libPub.rights = false;
      if (p) p.step = 2;
      render();
      showToast('Neu geladen. Prüfe die Vorschau und veröffentliche erneut.', 'info');
      return true;
    }
    case 'lib-pub-view': if (typeof libOpenDetail === 'function') libOpenDetail(id); return true;
    case 'lib-pub-share': {
      const url = typeof libShareLink === 'function' ? libShareLink('rezept', id) : '';
      if (url && typeof libShareNative === 'function') await libShareNative(url, (libPub.success && libPub.success.title) || 'Rezept');
      return true;
    }
    case 'lib-pub-done': {
      libPub.success = null;
      if (lpRecipe(id)) { state.activeRecipeId = id; state.view = 'detail'; } else state.view = 'home';
      state.modal = null; render();
      return true;
    }

    case 'lib-mine-retry': libPub.mine.state = 'idle'; render(); lpLoadMine(true); return true;
    case 'lib-mine-view': if (typeof libOpenDetail === 'function') libOpenDetail(id); return true;
    case 'lib-mine-update':
    case 'lib-mine-republish': lpOpenFromMine(id); return true;
    case 'lib-mine-draft-open': {
      const d = lpDraftGet(id) || {};
      libOpenPublish(id, { step: Math.min(Number(d.step) || 1, 2) });
      return true;
    }
    case 'lib-mine-draft-discard': lpModalOpen({ type: 'lib-pub-discard', id }); return true;
    case 'lib-mine-draft-discard-confirm': lpDraftClear(id); closeModal(); setTimeout(() => showToast('Entwurf verworfen'), 50); return true;
    case 'lib-mine-withdraw': lpModalOpen({ type: 'lib-pub-withdraw', id }); return true;
    case 'lib-mine-withdraw-confirm': {
      if (libPub.modalBusy) return true;
      if (lpOffline()) { lpModalError('Keine Verbindung zum Internet. Die Veröffentlichung wurde nicht zurückgezogen.'); return true; }
      const gen = lpGen();
      libPub.modalBusy = true; libPub.modalError = ''; render();
      try {
        await libWithdraw(id);
        if (gen !== lpGen()) return true;
        // Erst nach Serverantwort als zurückgezogen zeigen
        const x = lpMineFind(id); if (x) { x.status = 'withdrawn'; x.withdrawn_at = Date.now(); }
        libPub.modalBusy = false;
        closeModal();
        setTimeout(() => showToast('Veröffentlichung zurückgezogen'), 50);
        lpLoadMine(true);
      } catch (e) {
        if (gen !== lpGen()) return true;
        libPub.modalBusy = false; render();
        lpModalError(e && e.offline ? 'Keine Verbindung zum Internet. Die Veröffentlichung wurde nicht zurückgezogen.' : lpErrText(e, 'Die Veröffentlichung konnte nicht zurückgezogen werden. Sie ist weiterhin öffentlich.'));
      }
      return true;
    }

    case 'lib-prof-retry': libPub.prof.state = 'idle'; render(); lpLoadProfile(true); return true;
    case 'lib-prof-save': await lpSaveProfile(el); return true;
    case 'lib-prof-avatar': return true;   // Label öffnet die Dateiauswahl selbst
    case 'lib-prof-avatar-remove': {
      const f = lpFormEnsure(); lpFormFromDom();
      if (f.avatarUrl) { try { URL.revokeObjectURL(f.avatarUrl); } catch (e) { /* nicht kritisch */ } }
      f.avatarBlob = null; f.avatarUrl = null; f.removeAvatar = true;
      render();
      const b = document.querySelector('.lp-file-input'); if (b) focusWithoutScroll(b);
      announceLive('Profilbild entfernt. Speichere, damit es öffentlich wirkt.');
      return true;
    }
    case 'lib-prof-share': {
      const prof = lpProfileData();
      if (!prof || !prof.public_id) return true;
      const url = typeof libShareLink === 'function' ? libShareLink('profile', prof.public_id) : '';
      if (url && typeof libShareNative === 'function') await libShareNative(url, prof.display_name || 'Savora');
      return true;
    }
    case 'lib-prof-delete':
      if (lpPublishedCount() > 0) { showToast('Ziehe zuerst deine Veröffentlichungen zurück.', 'info'); return true; }
      lpModalOpen({ type: 'lib-pub-profdelete' }); return true;
    case 'lib-prof-delete-confirm': {
      if (libPub.modalBusy) return true;
      const gen = lpGen();
      libPub.modalBusy = true; render();
      try {
        if (typeof libDeletePubProfile === 'function') await libDeletePubProfile();
        else await libApi('savora_pub_profile_delete', {});
        if (gen !== lpGen()) return true;
        if (lib.pubProfile) lib.pubProfile.data = null;
        libPub.prof.state = 'ready'; libPub.prof.at = Date.now();
        lpFormReset();
        libPub.modalBusy = false;
        closeModal();
        setTimeout(() => showToast('Öffentliches Profil entfernt'), 50);
      } catch (e) {
        if (gen !== lpGen()) return true;
        libPub.modalBusy = false; render();
        lpModalError(lpErrText(e, 'Das öffentliche Profil konnte nicht entfernt werden.'));
      }
      return true;
    }

    case 'lib-mod-retry': libPub.mod.state = 'idle'; render(); lpLoadMod(true); return true;
    case 'lib-mod-filter':
      if (id !== 'open' && id !== 'closed') return true;
      libPub.mod.status = id; libPub.mod.items = []; libPub.mod.state = 'idle'; render(); lpLoadMod(true);
      return true;
    case 'lib-mod-review': {
      // Auch ausgeblendete Rezepte prüfen: libModPreview liefert die Publikation unabhängig vom Status
      if (typeof libModPreview !== 'function') { if (typeof libOpenDetail === 'function') libOpenDetail(id); return true; }
      if (libPub.modalBusy) return true;
      const gen = lpGen();
      try {
        const pub = await libModPreview(id);
        if (gen !== lpGen()) return true;
        if (!pub) { showToast('Dieses Rezept ist nicht mehr vorhanden.', 'info'); return true; }
        libPub.modPreview = pub;
        lpModalOpen({ type: 'lib-pub-modpreview', id });
        if (pub.image_path && typeof libSignedUrls === 'function') {
          libSignedUrls([pub.image_path]).then(() => { if (state.modal && state.modal.type === 'lib-pub-modpreview' && state.modal.id === id) render(); }).catch(() => {});
        }
      } catch (e) { if (gen === lpGen()) showToast(lpErrText(e, 'Das Rezept konnte nicht geladen werden.'), 'error'); }
      return true;
    }
    case 'lib-mod-ask': lpModalOpen({ type: 'lib-pub-mod', id, kind: el && el.dataset ? el.dataset.kind : 'close' }); return true;
    case 'lib-mod-confirm': {
      if (libPub.modalBusy) return true;
      const kind = el && el.dataset ? el.dataset.kind : '';
      const x = libPub.mod.items.find(i => i.report_id === id);
      if (!x || !LP_MOD_TEXT[kind]) return true;
      const note = String(((document.getElementById('lpModNote') || {}).value) || '').trim().slice(0, LP_NOTE_MAX);
      const gen = lpGen();
      libPub.modalBusy = true; libPub.modalError = '';
      if (el) { el.setAttribute('aria-busy', 'true'); el.setAttribute('aria-disabled', 'true'); }
      try {
        if (kind === 'hide' || kind === 'restore') await libModAction(x.publication_id, kind, note);
        else if (kind === 'close') await libModCloseReport(x.report_id, note);
        else if (kind === 'ban') await libModBan(x.publication_id, true, note);
        if (gen !== lpGen()) return true;
        libPub.modalBusy = false;
        closeModal();
        setTimeout(() => showToast(kind === 'hide' ? 'Rezept ausgeblendet' : kind === 'restore' ? 'Rezept wieder freigegeben' : kind === 'close' ? 'Meldung abgeschlossen' : 'Veröffentlichungsrechte gesperrt'), 50);
        lpLoadMod(true);
      } catch (e) {
        if (gen !== lpGen()) return true;
        libPub.modalBusy = false;
        if (el && document.contains(el)) { el.removeAttribute('aria-busy'); el.removeAttribute('aria-disabled'); }
        lpModalError(lpErrText(e, 'Die Aktion hat nicht geklappt. Es wurde nichts geändert.'));
      }
      return true;
    }
    default: return false;
  }
}
