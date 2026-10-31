/* v0.94 Schnellmenü: lange auf ein Rezept drücken (Handy), Rechtsklick (Mac/Windows) oder Kontextmenü-Taste bzw. Umschalt+F10
   (Tastatur) öffnet ein kleines Menü direkt an der Karte, wie das Kontextmenü auf dem iPhone.
   Gilt für alle Rezept-Karten der Rezeptliste (data-action="open-recipe" unter .view-home), nicht im Auswahlmodus.
   Die Einträge rufen die bestehenden Aktionen auf (dispatchAction); Dialoge (Löschen, Planen, Teilen, Sammlung, Notiz)
   zeichnet qmModalHostHtml() auch ausserhalb der Rezeptseite. */
const QM_HOLD_MS = 420;          // so lange halten, bis das Menü aufgeht (iOS liegt bei rund 0,5 s)
const QM_MOVE_TOL = 10;          // so weit darf der Finger wandern, ohne dass es als Scrollen gilt
let qmTimer = null, qmStart = null, qmSwallowUntil = 0, qmOpenState = null;

function qmEnabled() {
  if (state.modal) return false;
  if (state.view === 'mealplan') return true;   // v95: auch im Wochenplan
  return state.view === 'home' && !(typeof hvSelecting === 'function' && hvSelecting());
}
const QM_VISUAL = '.rcard, .rrow, .plan-entry';   // Element, das sich beim Halten abhebt (ganze Karte bzw. ganzer Plan-Eintrag)
function qmCardFrom(t) {
  const el = t && t.closest ? t.closest('[data-action="open-recipe"][data-id]') : null;
  if (el && state.view === 'mealplan' && !el.dataset.planEntry) return null;   // im Wochenplan nur geplante Rezepte
  return el && el.closest('#app') && !el.closest('.qm-layer') ? el : null;
}
function qmRecipe(id) { return state.recipes.find(r => r.id === id) || null; }

function qmItems(r, plan) {
  const I = (k, alt) => ICONS[k] || ICONS[alt] || '';
  if (plan) return [   // v95: geplanter Eintrag im Wochenplan
    { a: 'start-cook', icon: I('chef'), label: 'Jetzt kochen', hide: !(r.steps || []).length },
    { a: 'add-to-shopping', icon: I('cart'), label: 'Auf die Einkaufsliste', hide: !(r.ingredients || []).length },
    { sep: true },
    { a: 'qm-plan-edit', icon: I('calendar'), label: 'Verschieben' },
    { a: 'qm-plan-again', icon: I('copy'), label: 'Morgen nochmals' },
    { sep: true },
    { a: 'qm-plan-remove', icon: I('trash'), label: 'Aus dem Plan entfernen', danger: true },
  ].filter(x => !x.hide);
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

function qmMenuHtml(r, plan) {
  const items = qmItems(r, plan).map(x => x.sep ? '<div class="qm-sep" role="separator"></div>'
    : `<button type="button" class="qm-item${x.danger ? ' qm-item--danger' : ''}" role="menuitem" tabindex="-1" data-qm="${x.a}"><span class="qm-label">${escapeHtml(x.label)}</span><span class="qm-icon" aria-hidden="true">${x.icon}</span></button>`).join('');
  return `<div class="qm-menu" role="menu" aria-label="Schnellzugriff für ${escapeAttr(r.title || 'Rezept')}">${items}</div>`;
}

/* ---------- Öffnen und Schliessen ---------- */
function qmOpen(card, viaKeyboard, byHold) {
  if (qmOpenState || !qmEnabled()) return;
  const r = qmRecipe(card.dataset.id);
  if (!r) return;
  if (byHold) qmSwallowUntil = Date.now() + 1000;
  document.documentElement.classList.add('qm-holding');
  try { const sel = window.getSelection && window.getSelection(); if (sel && sel.rangeCount) sel.removeAllRanges(); } catch (e) {}   // falls das iPhone schon etwas markiert hat   // der Klick nach dem Loslassen öffnet das Rezept nicht
  const visual = card.closest(QM_VISUAL) || card;
  const plan = card.dataset.planEntry ? { date: card.dataset.planDate, entryId: card.dataset.planEntry } : null;   // Vorschau zeigt die ganze Karte (mit Merk-Knopf)
  // Erst sperren, dann messen: bei klassischen Scrollleisten (Windows) rückt das Layout beim Sperren
  if (typeof lockBodyScroll === 'function') lockBodyScroll(window.scrollY);
  const rect = visual.getBoundingClientRect();
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const layer = document.createElement('div');
  layer.className = 'qm-layer';
  layer.innerHTML = `<div class="qm-scrim" data-qm-close></div>${qmMenuHtml(r, plan)}`;
  // Vorschau: Kopie der Karte an genau derselben Stelle, hebt sich leicht ab (wie das iPhone-Kontextmenü)
  const W = document.documentElement.clientWidth, H = window.innerHeight;
  const showPreview = rect.height < H * 0.45 && rect.width > 0 && rect.top >= 0 && rect.bottom <= H;   // nur, wenn die Karte ganz sichtbar ist
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
  const top0 = !preview ? Math.max(pad, (H - mh) / 2) : below ? rect.bottom + shift + gap : rect.top - gap - mh;
  const top = Math.max(pad, Math.min(top0, H - pad - mh));   // nie ausserhalb des Bildschirms (z. B. Karte halb verdeckt)
  Object.assign(menu.style, { left: left + 'px', top: top + 'px' });
  const originX = Math.max(0, Math.min(mw, rect.left + Math.min(rect.width, 80) / 2 - left));
  menu.style.transformOrigin = `${originX}px ${below ? 0 : mh}px`;
  if (preview && shift) preview.style.setProperty('--qm-shift', shift + 'px');
  card.classList.remove('qm-pressing');
  visual.classList.add('qm-source');
  // byHold: nach langem Drücken folgt beim Loslassen oft ein Klick auf die Abdeckung; der darf das Menü nicht gleich schliessen
  qmOpenState = { layer, card, visual, id: r.id, plan, viaKeyboard, byHold: !!byHold, W };
  ['pointerdown', 'keydown'].forEach(t => layer.addEventListener(t, () => { if (qmOpenState) qmOpenState.byHold = false; }));
  layer.addEventListener('keydown', () => { if (qmOpenState) qmOpenState.viaKeyboard = true; });   // Tastatur benutzt: Fokus kehrt danach auf die Karte zurück
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
  document.documentElement.classList.remove('qm-holding');
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
  // Fokus nur bei Tastaturbedienung auf die Karte zurück; mit dem Finger bliebe sonst ein Fokusrahmen auf der Karte stehen (iPhone)
  if (s.viaKeyboard && !(opts && opts.keepFocus) && card.isConnected) { try { card.focus({ preventScroll: true }); } catch (e) {} }
  else if (document.activeElement && layer.contains(document.activeElement)) document.activeElement.blur();
}

function qmLayerClick(e) {
  // Klick vom Loslassen des Fingers nach dem langen Drücken: darunter liegt die Abdeckung oder sogar ein Eintrag
  // (wenn die Karte zum Platzmachen verschoben wurde). Erst ein neuer Tipp im Menü zählt.
  if (qmOpenState && qmOpenState.byHold) { qmOpenState.byHold = false; return; }
  if (e.target.closest('[data-qm-close]')) { qmClose(); return; }
  const btn = e.target.closest('[data-qm]');
  if (!btn || !qmOpenState) return;
  const action = btn.dataset.qm, id = qmOpenState.id, kb = qmOpenState.viaKeyboard, plan = qmOpenState.plan;
  qmClose({ instant: true, keepFocus: true });
  if (plan && action.startsWith('qm-plan-')) qmRunPlan(action, plan, kb);
  else qmRun(action, id, kb);
}

async function qmRun(action, id, kb) {
  // Nach einem Dialog kehrt der Fokus nur bei Tastaturbedienung auf die Karte zurück (sonst Fokusrahmen auf dem iPhone)
  const sel = kb ? `[data-action="open-recipe"][data-id="${(window.CSS && CSS.escape) ? CSS.escape(id) : id}"]` : null;
  if (action === 'open-share-menu') {
    // Teilen hat viele Unterwege (Freunde, PDF, Veröffentlichen), die auf der Rezeptseite zuhause sind:
    // Rezept öffnen und dort das Teilen-Menü zeigen
    await qmDispatch('open-recipe', id);
    await new Promise(f => requestAnimationFrame(() => requestAnimationFrame(f)));   // Rezeptseite (samt Übergang) erst fertig zeichnen
    if (state.view === 'detail') openModal({ type: 'share-menu', recipeId: id }, kb ? `[data-action="open-share-menu"][data-id="${(window.CSS && CSS.escape) ? CSS.escape(id) : id}"]` : null);
    return;
  }
  if (action === 'rcol-open') { openModal({ type: 'rcol', recipeId: id }, sel); return; }
  const modalTypes = { 'confirm-delete': 'delete', 'open-plan-recipe': 'plan-recipe' };
  if (modalTypes[action]) {
    // Dialoge öffnen über openModal (eigener Zurück-Eintrag); Fokus kehrt danach auf die Karte zurück
    const m = { type: modalTypes[action], recipeId: id, fromQuick: true };
    if (action === 'open-plan-recipe') m.meal = '';
    openModal(m, sel);
    return;
  }
  await qmDispatch(action, id);
  if (state.modal && typeof modalTriggerSelector !== 'undefined') modalTriggerSelector = sel;   // z. B. Einkauf: der Knopf aus der Aktion existiert auf der Liste nicht
  if (action === 'toggle-fav') {
    const r = qmRecipe(id);
    if (r && typeof showToast === 'function') showToast(r.favorite ? 'Zu Favoriten hinzugefügt' : 'Aus Favoriten entfernt');
  }
}
/* v95: Aktionen für einen Eintrag im Wochenplan */
async function qmRunPlan(action, plan, kb) {
  const sel = kb ? `.plan-entry-main[data-plan-entry="${(window.CSS && CSS.escape) ? CSS.escape(plan.entryId) : plan.entryId}"]` : null;
  const entries = planEntriesFor(plan.date).map(x => ({ ...x }));
  const entry = entries.find(x => x.id === plan.entryId);
  if (!entry) return;
  const r = qmRecipe(entry.recipeId);
  const name = (r && r.title) || 'Rezept';
  if (action === 'qm-plan-edit') {
    // bestehender Dialog: anderer Tag, andere Mahlzeit, Portionen
    openModal({ type: 'plan-entry', date: plan.date, entryId: plan.entryId, meal: entry.meal || '' }, sel);
    return;
  }
  if (action === 'qm-plan-again') {
    const [y, m, d] = String(plan.date).split('-').map(Number);
    const next = fmtDateKey(addDays(new Date(y, m - 1, d), 1));
    const prevNext = planEntriesFor(next).map(x => ({ ...x }));
    await savePlanEntries(next, prevNext.concat([{ id: uid(), recipeId: entry.recipeId, meal: entry.meal || '', servings: entry.servings || null }]));
    render();
    showToast(`„${name}“ auch morgen eingeplant`, 'success', false, { actionLabel: 'Rückgängig', duration: 8000, onAction: async () => {
      await savePlanEntries(next, prevNext); if (state.view === 'mealplan') render(); } });
    return;
  }
  if (action === 'qm-plan-remove') {
    // gleich wie «Entfernen» im Eintragsdialog, mit Rückgängig statt Rückfrage
    const prev = planEntriesFor(plan.date).map(x => ({ ...x }));
    await savePlanEntries(plan.date, prev.filter(x => x.id !== plan.entryId));
    render();
    showToast(`„${name}“ entfernt`, 'success', false, { actionLabel: 'Rückgängig', duration: 8000, onAction: async () => {
      await savePlanEntries(plan.date, prev); if (state.view === 'mealplan') render(); } });
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
  if (!qmOpenState) document.documentElement.classList.remove('qm-holding');
}
document.addEventListener('pointerdown', (e) => {
  if (qmStart) qmCancelHold();   // zweiter Finger: altes Halten abbrechen
  if (qmOpenState || e.button > 0 || !e.isPrimary || !qmEnabled()) return;
  const card = qmCardFrom(e.target);
  if (!card || e.target.closest('button:not([data-action="open-recipe"]), a, input')) return;   // Merk-Knopf in der Karte bleibt ein normaler Knopf
  if (e.pointerType === 'mouse') return;   // Maus: Rechtsklick (contextmenu) statt langes Drücken
  qmStart = { x: e.clientX, y: e.clientY, card: card, vis: card.closest(QM_VISUAL) || card, id: e.pointerId };
  qmStart.vis.classList.add('qm-pressing');
  document.documentElement.classList.add('qm-holding');   // iPhone: keine Markier-Lupe während des Haltens
  qmTimer = setTimeout(() => {
    const c = qmStart && qmStart.card;
    if (qmStart) qmStart.vis.classList.remove('qm-pressing');
    qmTimer = null; qmStart = null;
    document.documentElement.classList.remove('qm-holding');   // qmOpen setzt die Klasse wieder, falls das Menü aufgeht
    if (!c || !c.isConnected) return;
    qmOpen(c, false, true);
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
  if (!qmSwallowUntil) return;
  const live = Date.now() < qmSwallowUntil;
  qmSwallowUntil = 0;   // gilt nur für den einen Klick direkt nach dem Loslassen
  if (live && qmCardFrom(e.target)) { e.preventDefault(); e.stopPropagation(); }
}, true);
// Rechtsklick (Mac/Windows) und das native Kontextmenü (Android nach langem Drücken): eigenes Menü statt Browsermenü
document.addEventListener('contextmenu', (e) => {
  if (qmOpenState || (e.target.closest && e.target.closest('.qm-layer'))) { e.preventDefault(); return; }   // Android: kommt nach unserem Timer
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
// Nur bei echter Grössenänderung schliessen (Drehen, Fenster), nicht wenn die Adressleiste ein- oder ausfährt
window.addEventListener('resize', () => { if (qmOpenState && Math.abs(document.documentElement.clientWidth - qmOpenState.W) > 1) qmClose({ instant: true }); });
window.addEventListener('popstate', () => { if (qmOpenState) qmClose({ instant: true }); });

/* Dialoge aus dem Schnellmenü auch auf der Rezeptliste zeigen (sonst zeichnet sie nur die Rezeptseite). */
function qmModalHostHtml() {
  const m = state.modal;
  // «Zu Sammlung hinzufügen» setzt kein fromQuick (bestehende Aktion); auf der Rezeptliste zeichnet sonst niemand den Dialog
  if (m && m.type === 'rcol' && state.view === 'home' && typeof rcolModalHtml === 'function') return rcolModalHtml();
  // «Auf die Einkaufsliste» öffnet die Zutatenauswahl; die Rezeptliste zeichnet sie sonst nicht
  if (m && m.type === 'shop-select' && state.view === 'home' && typeof shopSelectModal === 'function') return shopSelectModal();
  if (!m || !m.fromQuick || state.view === 'detail') return '';
  const r = qmRecipe(m.recipeId);
  if (!r) return '';
  if (m.type === 'delete' && typeof deleteModal === 'function') return deleteModal(r);
  if (m.type === 'plan-recipe' && typeof planRecipeModal === 'function') return planRecipeModal();
  return '';
}
