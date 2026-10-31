/* v0.94 Schnellmenü: lange auf ein Rezept drücken (Handy), Rechtsklick (Mac/Windows) oder Kontextmenü-Taste bzw. Umschalt+F10
   (Tastatur) öffnet ein kleines Menü direkt an der Karte, wie das Kontextmenü auf dem iPhone.
   Gilt für alle Rezept-Karten der Rezeptliste (data-action="open-recipe" unter .view-home), nicht im Auswahlmodus.
   Die Einträge rufen die bestehenden Aktionen auf (dispatchAction); Dialoge (Löschen, Planen, Teilen, Sammlung, Notiz)
   zeichnet qmModalHostHtml() auch ausserhalb der Rezeptseite. */
const QM_HOLD_MS = 420;          // so lange halten, bis das Menü aufgeht (iOS liegt bei rund 0,5 s)
const QM_MOVE_TOL = 10;          // so weit darf der Finger wandern, ohne dass es als Scrollen gilt
let qmTimer = null, qmStart = null, qmSwallowClick = false, qmOpenState = null;

function qmEnabled() { return state.view === 'home' && !(typeof hvSelecting === 'function' && hvSelecting()) && !state.modal; }
function qmCardFrom(t) {
  const el = t && t.closest ? t.closest('[data-action="open-recipe"][data-id]') : null;
  return el && el.closest('#app') && !el.closest('.qm-layer') ? el : null;
}
function qmRecipe(id) { return state.recipes.find(r => r.id === id) || null; }

function qmItems(r) {
  const I = (k, alt) => ICONS[k] || ICONS[alt] || '';
  const items = [
    { a: 'toggle-fav', icon: r.favorite ? I('bookmarkFilled', 'heart') : I('bookmark', 'heartOutline'), label: r.favorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten' },
    { a: 'start-cook', icon: I('chef'), label: 'Jetzt kochen', hide: !(r.steps || []).length },
    { a: 'open-plan-recipe', icon: I('calendar'), label: 'Zum Wochenplan' },
    { a: 'add-to-shopping', icon: I('cart'), label: 'Auf die Einkaufsliste', hide: !(r.ingredients || []).length },
    { a: 'rcol-open', icon: I('folder', 'book'), label: 'Zu Sammlung hinzufügen', hide: !(typeof orgOk === 'function' && orgOk()) },
    { sep: true },
    { a: 'edit-recipe', icon: I('edit'), label: 'Bearbeiten' },
    { a: 'open-share-menu', icon: I('share'), label: 'Teilen' },
    { a: 'duplicate-recipe', icon: I('copy'), label: 'Duplizieren' },
    { sep: true },
    { a: 'confirm-delete', icon: I('trash'), label: 'Löschen', danger: true },
  ];
  return items.filter(x => !x.hide);
}

function qmMenuHtml(r) {
  const items = qmItems(r).map(x => x.sep ? '<div class="qm-sep" role="separator"></div>'
    : `<button type="button" class="qm-item${x.danger ? ' qm-item--danger' : ''}" role="menuitem" tabindex="-1" data-qm="${x.a}"><span class="qm-label">${escapeHtml(x.label)}</span><span class="qm-icon" aria-hidden="true">${x.icon}</span></button>`).join('');
  return `<div class="qm-menu" role="menu" aria-label="Schnellzugriff für ${escapeAttr(r.title || 'Rezept')}">${items}</div>`;
}

/* ---------- Öffnen und Schliessen ---------- */
function qmOpen(card, viaKeyboard) {
  if (qmOpenState || !qmEnabled()) return;
  const r = qmRecipe(card.dataset.id);
  if (!r) return;
  const visual = card.closest('.rcard, .rrow') || card;   // Vorschau zeigt die ganze Karte (mit Merk-Knopf)
  const rect = visual.getBoundingClientRect();
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const layer = document.createElement('div');
  layer.className = 'qm-layer';
  layer.innerHTML = `<div class="qm-scrim" data-qm-close></div>${qmMenuHtml(r)}`;
  // Vorschau: Kopie der Karte an genau derselben Stelle, hebt sich leicht ab (wie das iPhone-Kontextmenü)
  const W = document.documentElement.clientWidth, H = window.innerHeight;
  const showPreview = rect.height < H * 0.45 && rect.width > 0;
  let preview = null;
  if (showPreview) {
    preview = visual.cloneNode(true);
    preview.removeAttribute('data-action'); preview.removeAttribute('id'); preview.removeAttribute('aria-label');
    preview.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    preview.querySelectorAll('[data-action]').forEach(n => n.removeAttribute('data-action'));
    preview.setAttribute('aria-hidden', 'true'); preview.setAttribute('tabindex', '-1'); preview.setAttribute('inert', '');
    const wrap = document.createElement('div');
    wrap.className = 'qm-preview';
    Object.assign(wrap.style, { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px' });
    wrap.appendChild(preview);
    layer.appendChild(wrap);
    preview = wrap;
  }
  document.body.appendChild(layer);
  const menu = layer.querySelector('.qm-menu');
  // Platz suchen: unter der Karte, sonst darüber, sonst Karte und Menü gemeinsam ins Bild schieben
  const gap = 12, pad = 16, mh = menu.offsetHeight, mw = menu.offsetWidth;
  let shift = 0, below = true;
  if (preview) {
    if (rect.bottom + gap + mh <= H - pad) below = true;
    else if (rect.top - gap - mh >= pad) below = false;
    else { below = true; shift = Math.max(pad, Math.min(rect.top, H - pad - mh - gap - rect.height)) - rect.top; }
  }
  const left = Math.max(pad, Math.min(rect.left + (rect.width > mw * 1.4 ? 12 : 0), W - pad - mw));
  const top = !preview ? Math.max(pad, (H - mh) / 2) : below ? rect.bottom + shift + gap : rect.top - gap - mh;
  Object.assign(menu.style, { left: left + 'px', top: top + 'px' });
  const originX = Math.max(0, Math.min(mw, rect.left + Math.min(rect.width, 80) / 2 - left));
  menu.style.transformOrigin = `${originX}px ${below ? 0 : mh}px`;
  if (preview && shift) preview.style.setProperty('--qm-shift', shift + 'px');
  card.classList.remove('qm-pressing');
  visual.classList.add('qm-source');
  qmOpenState = { layer, card, visual, id: r.id, prevFocus: document.activeElement, viaKeyboard };
  if (typeof lockBodyScroll === 'function') lockBodyScroll(window.scrollY);
  // Auf das nächste Bild warten, dann einblenden (CSS-Übergänge starten vom Ausgangszustand)
  requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add('is-open')));
  if (!reduce && navigator.vibrate) { try { navigator.vibrate(8); } catch (e) {} }   // Android: kurzer Ruck; iPhone-Browser kennt das nicht
  layer.addEventListener('click', qmLayerClick);
  layer.addEventListener('keydown', qmKeydown);
  // Fokus ins Menü: Tastatur auf den ersten Eintrag, Finger/Maus auf das Menü selbst (kein Fokusrahmen auf einem Eintrag)
  const first = menu.querySelector('.qm-item');
  if (viaKeyboard && first) first.focus({ preventScroll: true });
  else { menu.setAttribute('tabindex', '-1'); menu.focus({ preventScroll: true }); }
  if (typeof announceLive === 'function') announceLive('Schnellzugriff geöffnet. Pfeiltasten zum Wählen, Escape zum Schliessen.');
}

function qmClose(opts) {
  const s = qmOpenState;
  if (!s) return;
  qmOpenState = null;
  const { layer, card, visual } = s;
  const instant = opts && opts.instant;
  // Karte sofort wieder sichtbar machen (die Vorschau liegt beim Ausblenden noch darüber), sonst nimmt sie keinen Fokus an
  visual.classList.remove('qm-source');
  const done = () => layer.remove();
  if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
  if (instant) done();
  else {
    layer.classList.remove('is-open'); layer.classList.add('is-closing');
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(done, reduce ? 120 : 200);
  }
  if (!(opts && opts.keepFocus) && card.isConnected) { try { card.focus({ preventScroll: true }); } catch (e) {} }
}

function qmLayerClick(e) {
  if (e.target.closest('[data-qm-close]')) { qmClose(); return; }
  const btn = e.target.closest('[data-qm]');
  if (!btn || !qmOpenState) return;
  const action = btn.dataset.qm, id = qmOpenState.id, card = qmOpenState.card;
  qmClose({ instant: true, keepFocus: true });
  qmRun(action, id, card);
}

async function qmRun(action, id, card) {
  const sel = `[data-action="open-recipe"][data-id="${(window.CSS && CSS.escape) ? CSS.escape(id) : id}"]`;
  if (action === 'open-share-menu') {
    // Teilen hat viele Unterwege (Freunde, PDF, Veröffentlichen), die auf der Rezeptseite zuhause sind:
    // Rezept öffnen und dort das Teilen-Menü zeigen
    await qmDispatch('open-recipe', id);
    if (state.view === 'detail') openModal({ type: 'share-menu', recipeId: id }, `[data-action="open-share-menu"][data-id="${(window.CSS && CSS.escape) ? CSS.escape(id) : id}"]`);
    return;
  }
  const modalTypes = { 'confirm-delete': 'delete', 'open-plan-recipe': 'plan-recipe' };
  if (modalTypes[action]) {
    // Dialoge öffnen über openModal (eigener Zurück-Eintrag); Fokus kehrt danach auf die Karte zurück
    const m = { type: modalTypes[action], recipeId: id, fromQuick: true };
    if (action === 'open-plan-recipe') m.meal = '';
    openModal(m, sel);
    return;
  }
  await qmDispatch(action, id);
  if (action === 'toggle-fav') {
    const r = qmRecipe(id);
    if (r && typeof showToast === 'function') showToast(r.favorite ? 'Zu Favoriten hinzugefügt' : 'Aus Favoriten entfernt');
  }
}
/* Bestehende Aktion ausführen, als wäre ihr Knopf gedrückt worden */
async function qmDispatch(action, id) {
  const el = document.createElement('button');
  el.dataset.action = action; el.dataset.id = id;
  const fake = { currentTarget: el, target: el, stopPropagation() {}, preventDefault() {} };
  try { await dispatchAction(action, id, el, fake); }
  catch (err) { if (typeof showToast === 'function') showToast('Das hat nicht geklappt. Versuche es noch einmal.', 'error'); }
}

function qmKeydown(e) {
  if (!qmOpenState) return;
  const items = Array.from(qmOpenState.layer.querySelectorAll('.qm-item'));
  const i = items.indexOf(document.activeElement);   // -1, solange das Menü selbst den Fokus hat: Pfeil runter springt auf den ersten
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); qmClose(); }
  else if (e.key === 'Tab') { e.preventDefault(); qmClose(); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i <= 0 ? items.length : i) - 1].focus(); }
  else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
  else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
}

/* ---------- Gesten ---------- */
function qmCancelHold() {
  clearTimeout(qmTimer); qmTimer = null;
  if (qmStart && qmStart.vis) qmStart.vis.classList.remove('qm-pressing');
  qmStart = null;
}
document.addEventListener('pointerdown', (e) => {
  if (qmOpenState || e.button > 0 || !qmEnabled()) return;
  const card = qmCardFrom(e.target);
  if (!card || e.target.closest('button:not([data-action="open-recipe"]), a, input')) return;   // Merk-Knopf in der Karte bleibt ein normaler Knopf
  if (e.pointerType === 'mouse') return;   // Maus: Rechtsklick (contextmenu) statt langes Drücken
  qmStart = { x: e.clientX, y: e.clientY, card: card, vis: card.closest('.rcard, .rrow') || card, id: e.pointerId };
  qmStart.vis.classList.add('qm-pressing');
  qmTimer = setTimeout(() => {
    const c = qmStart && qmStart.card;
    if (qmStart) qmStart.vis.classList.remove('qm-pressing');
    qmTimer = null; qmStart = null;
    if (!c || !c.isConnected) return;
    qmSwallowClick = true;
    qmOpen(c, false);
  }, QM_HOLD_MS);
}, { passive: true });
document.addEventListener('pointermove', (e) => {
  if (!qmStart || e.pointerId !== qmStart.id) return;
  if (Math.hypot(e.clientX - qmStart.x, e.clientY - qmStart.y) > QM_MOVE_TOL) qmCancelHold();
}, { passive: true });
['pointerup', 'pointercancel'].forEach(t => document.addEventListener(t, () => { if (qmStart) qmCancelHold(); }, { passive: true }));
window.addEventListener('scroll', () => { if (qmStart) qmCancelHold(); }, { passive: true });
// Der Klick nach dem langen Drücken öffnet das Rezept nicht
document.addEventListener('click', (e) => {
  if (!qmSwallowClick) return;
  qmSwallowClick = false;
  if (qmCardFrom(e.target)) { e.preventDefault(); e.stopPropagation(); }
}, true);
// Rechtsklick (Mac/Windows) und das native Kontextmenü (Android nach langem Drücken): eigenes Menü statt Browsermenü
document.addEventListener('contextmenu', (e) => {
  const card = qmCardFrom(e.target);
  if (!card || !qmEnabled() && !qmOpenState) return;
  e.preventDefault();
  if (qmOpenState) return;
  qmCancelHold();
  qmOpen(card, false);
});
// Tastatur: Kontextmenü-Taste oder Umschalt+F10 auf einer fokussierten Karte
document.addEventListener('keydown', (e) => {
  if (qmOpenState) return;
  if (!(e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey))) return;
  const card = qmCardFrom(document.activeElement);
  if (!card || !qmEnabled()) return;
  e.preventDefault();
  qmOpen(card, true);
});
window.addEventListener('resize', () => { if (qmOpenState) qmClose({ instant: true }); });
window.addEventListener('popstate', () => { if (qmOpenState) qmClose({ instant: true }); });

/* Dialoge aus dem Schnellmenü auch auf der Rezeptliste zeigen (sonst zeichnet sie nur die Rezeptseite). */
function qmModalHostHtml() {
  const m = state.modal;
  // «Zu Sammlung hinzufügen» setzt kein fromQuick (bestehende Aktion); auf der Rezeptliste zeichnet sonst niemand den Dialog
  if (m && m.type === 'rcol' && state.view === 'home' && typeof rcolModalHtml === 'function') return rcolModalHtml();
  if (!m || !m.fromQuick || state.view === 'detail') return '';
  const r = qmRecipe(m.recipeId);
  if (!r) return '';
  if (m.type === 'delete' && typeof deleteModal === 'function') return deleteModal(r);
  if (m.type === 'plan-recipe' && typeof planRecipeModal === 'function') return planRecipeModal();
  return '';
}
