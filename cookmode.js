function startTimer(id, totalSeconds) {
  if (state.timers[id] && state.timers[id].running) return;
  const existing = state.timers[id];
  if (existing && existing.intervalId) clearInterval(existing.intervalId);
  const remainingSeconds = existing ? existing.remaining : totalSeconds;
  const t = {
    remaining: remainingSeconds,
    total: totalSeconds,
    endTime: Date.now() + remainingSeconds * 1000, // Zeitquelle: absolute Endzeit, nicht Herunterzaehlen
    running: true,
    done: false,
    intervalId: null,
  };
  state.timers[id] = t;
  t.intervalId = setInterval(() => tickTimer(id), 1000);
  SavoraNative.haptic('medium');
  if (SavoraNative.isNative) {   // Benachrichtigung, falls das Telefon gesperrt ist
    const rec = (state.recipes || []).find((x) => x.id === state.activeRecipeId);
    SavoraNative.scheduleTimer(id, t.endTime, rec && rec.title);
  }
  updateTimerChipDOM(id);
  refreshCookTimerBar();
}

function tickTimer(id) {
  const t = state.timers[id];
  if (!t || !t.running) return;
  t.remaining = Math.max(0, Math.round((t.endTime - Date.now()) / 1000));
  if (t.remaining <= 0) {
    t.remaining = 0;
    t.running = false;
    t.done = true;
    clearInterval(t.intervalId);
    t.intervalId = null;
    finishTimerFeedback();
    SavoraNative.cancelTimer(id);   // App ist im Vordergrund: die App meldet selbst, keine doppelte Meldung
    SavoraNative.haptic('success');
    refreshCookTimerBar();
  }
  updateTimerChipDOM(id);
}

function resyncRunningTimers() {
  // setInterval wird im Hintergrund/bei gesperrtem Screen gedrosselt — beim Zurueckkommen
  // sofort anhand der absoluten Endzeit neu berechnen, statt auf den naechsten Tick zu warten.
  Object.keys(state.timers).forEach(id => { if (state.timers[id].running) tickTimer(id); });
}

function updateTimerChipDOM(id) {
  const t = state.timers[id];
  if (!t) return;
  document.querySelectorAll(`[data-timer-label="${cssAttr(id)}"]`).forEach(el => { el.textContent = fmtClock(t.remaining); });   // Chip im Text und Eintrag in der Timer-Leiste
  const chipEl = document.querySelector(`[data-timer-id="${cssAttr(id)}"]`);
  if (chipEl) {
    chipEl.classList.toggle('running', t.running);
    chipEl.classList.toggle('done', t.done);
    if (t.done) chipEl.innerHTML = `${ICONS.check}<span data-timer-label="${escapeAttr(id)}">${fmtClock(0)}</span>`;
  }
}

function finishTimerFeedback() {
  try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {}
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 880;
    o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    o.start(); o.stop(ctx.currentTime + 0.55);
  } catch (e) {}
  showToast('Timer fertig', 'success', true);
}

/* ---------- Cook mode: wake lock ---------- */
async function requestWakeLock() {
  if (SavoraNative.isNative) { state.wakeLock = await SavoraNative.keepAwake(); return; }
  try {
    if ('wakeLock' in navigator) {
      state.wakeLock = await navigator.wakeLock.request('screen');
      state.wakeLock.addEventListener('release', () => { state.wakeLock = null; });
    }
  } catch (e) { state.wakeLock = null; }
}

function releaseWakeLock() {
  if (state.wakeLock) { state.wakeLock.release().catch(() => {}); state.wakeLock = null; }
}

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible') {
    resyncRunningTimers();
    if (state.view === 'cookmode' && !state.wakeLock) await requestWakeLock();
  }
});

/* ---------- Event binding ---------- */
/* ---------- Kochmodus: Navigation & Sprachausgabe ---------- */
// Leere Schritte werden im Kochmodus uebersprungen (gleiche Liste wie in cookModeView).
function cookSteps(r) {
  // Zwischentitel ("Speck vorbereiten:") sind keine eigenen Kochschritte; sie erscheinen als
  // Ueberschrift ueber dem folgenden Schritt. Der gespeicherte Rezepttext bleibt unveraendert.
  let section = '';
  const out = [];
  stepEntries(r).forEach(e => {
    if (e.heading) { section = String(e.text).trim().replace(/:$/, ''); return; }
    if (typeof pdfClassifyStepText === 'function' && pdfClassifyStepText(e.text) === 'source') return;   // Quellenangabe ist kein Kochschritt (Rezepttext bleibt unveraendert)
    let shownText = e.step.text;
    // «Titel: Satz» wie in der Rezeptansicht als Ueberschrift zeigen (nur Anzeige, gespeicherter Text bleibt)
    if (!section && typeof stepDisplayParts === 'function') {
      const parts = stepDisplayParts(e.text);
      if (parts.title) { section = parts.title; shownText = parts.text; }
    }
    out.push(Object.assign({}, e.step, { text: shownText, _section: section, _sourceIndex: e.sourceIndex }));
    section = '';
  });
  return out;
}

function currentCookRecipe() { return state.recipes.find(x => x.id === state.activeRecipeId); }

function cookGoNext() {
  const r = currentCookRecipe();
  if (!r) return;
  const steps = cookSteps(r);
  if (state.cookStepIndex < steps.length - 1) { state.cookStepIndex++; if (typeof saveCookProgress === 'function') saveCookProgress(); render(); speakCurrentStepIfEnabled(); }
}

function cookGoPrev() {
  if (state.cookStepIndex > 0) { state.cookStepIndex--; if (typeof saveCookProgress === 'function') saveCookProgress(); render(); speakCurrentStepIfEnabled(); }
}

function speakCurrentStepIfEnabled() {
  if (!state.voiceEnabled || !('speechSynthesis' in window)) return;
  const r = currentCookRecipe();
  if (!r) return;
  const step = cookSteps(r)[state.cookStepIndex];
  if (!step || !step.text) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(step.text);
  utter.lang = 'de-DE';
  utter.rate = 0.98;
  window.speechSynthesis.speak(utter);
}

function bindCookSwipe() {
  // Wischen folgt dem Finger 1:1 und rollt mit Schwung aus (siehe motion.js)
  if (typeof bindCookSwipeMotion === 'function') bindCookSwipeMotion();
}

/* ---------- Kochmodus: Timer-Leiste (alle laufenden Timer, auch von anderen Schritten) ---------- */
function cookTimerEntries(r) {
  const prefix = r.id + '-';
  return Object.keys(state.timers).filter(id => id.indexOf(prefix) === 0 && (state.timers[id].running || state.timers[id].done)).map(id => {
    const step = parseInt(id.slice(prefix.length), 10);
    return { id, step: isNaN(step) ? 0 : step, t: state.timers[id] };
  }).sort((a, b) => a.step - b.step);
}
function cookTimerBarHtml(r) {
  const items = cookTimerEntries(r);
  if (!items.length) return '';
  return items.map(({ id, step, t }) => `<div class="cook-timer-item ${t.done ? 'is-done' : ''}" data-timer-bar="${escapeHtml(id)}">
      <button type="button" class="cook-timer-go" data-action="cook-goto-timer" data-idx="${step}" aria-label="Zu Schritt ${step + 1} springen">
        <span class="cook-timer-step">Schritt ${step + 1}</span><b data-timer-label="${escapeHtml(id)}">${fmtClock(t.remaining)}</b></button>
      <button type="button" class="cook-timer-plus" data-action="timer-plus" data-timer="${escapeHtml(id)}" aria-label="Eine Minute dazugeben">+1 Min.</button>
    </div>`).join('');
}
function refreshCookTimerBar() {
  const box = document.getElementById('cookTimerBar');
  if (!box) return;
  const r = state.recipes.find(x => x.id === state.activeRecipeId);
  if (!r) return;
  box.innerHTML = cookTimerBarHtml(r);
  box.hidden = !box.innerHTML.trim();
  box.querySelectorAll('[data-action]').forEach(b => b.addEventListener('click', onAction));
}
/* Eine Minute dazugeben: laeuft der Timer, verlaengert er sich, ist er abgelaufen, startet er neu */
function timerPlusMinute(id) {
  const t = state.timers[id];
  if (!t) return;
  if (t.done || !t.running) {
    t.done = false; t.running = true; t.remaining = 60; t.total = Math.max(t.total || 0, 60); t.endTime = Date.now() + 60000;
    if (t.intervalId) clearInterval(t.intervalId);
    t.intervalId = setInterval(() => tickTimer(id), 1000);
  } else {
    t.endTime += 60000; t.remaining += 60; t.total = (t.total || 0) + 60;
  }
  if (SavoraNative.isNative) {
    SavoraNative.cancelTimer(id);
    const rec = (state.recipes || []).find((x) => x.id === state.activeRecipeId);
    SavoraNative.scheduleTimer(id, t.endTime, rec && rec.title);
  }
  SavoraNative.haptic('light');
  updateTimerChipDOM(id);
  refreshCookTimerBar();
  setTimeout(saveCookProgress, 0);
}

/* ---------- v84 Rezept: «Passt dazu» im Kochmodus ----------
   Nur eine Lesevorschau: aendert nie activeRecipeId, cookStepIndex, Haken, Timer oder den gespeicherten
   Kochfortschritt und markiert nichts als gekocht. Zurueck/Escape schliesst nur die Vorschau. */
function cookLinkTargets(recipeId) {
  return typeof linkListFor === 'function' ? linkListFor(recipeId).filter(l => l.status === 'ok') : [];
}
function cookLinksButtonHtml(r) {
  const n = cookLinkTargets(r.id).length;
  if (!n) return '';
  return `<button type="button" class="cook-links-btn" data-action="cook-links" data-id="${escapeAttr(r.id)}" aria-haspopup="dialog">${ICONS.link}<span>Passt dazu (${n})</span></button>`;
}
function cookLinkOpen(otherId) {
  if (!cookLinkTargets(state.activeRecipeId).some(l => l.otherId === otherId)) return;
  const m = { type: 'link-preview', otherId, fromList: !!(state.modal && state.modal.type === 'link-list') };
  if (state.modal) replaceModal(m); else openModal(m, '[data-action="cook-links"]');
}
function cookLinkSheet(id, title, body) {
  return `<div class="modal-backdrop modal-backdrop--top" data-action="close-modal">
    <div class="modal-sheet cook-link-sheet" role="dialog" aria-modal="true" aria-labelledby="${id}" tabindex="-1" onclick="event.stopPropagation()">
      <div class="sheet-handle" aria-hidden="true"></div>
      <div class="rp-head"><div class="rp-head-text"><h2 class="rp-title" id="${id}">${escapeHtml(title)}</h2></div>
        <button type="button" class="rp-close" data-action="close-modal" aria-label="Schliessen">${ICONS.x}</button></div>
      ${body}
    </div>
  </div>`;
}
function cookLinkPreviewHtml(r) {
  const m = state.modal;
  const l = cookLinkTargets(r.id).find(x => x.otherId === m.otherId);
  const o = l && state.recipes.find(x => x.id === l.otherId);
  if (!o) return '';
  const facts = [yieldKnown(o) ? yieldText(o, o.servings) : '', timeInfo(o).text].filter(Boolean);
  const showTitles = hasNamedGroups(o);
  const ings = getIngredientGroups(o).map(g => `${showTitles && g.title ? `<h4 class="cook-link-group">${escapeHtml(g.title)}</h4>` : ''}<ul class="cook-link-ings">${g.ingredients.map(i => { const amt = scaledAmountLine(i, 1); return `<li>${amt ? `<span class="ing-amount">${escapeHtml(amt)}</span> ` : ''}<span class="ing-name">${escapeHtml(i.name)}</span></li>`; }).join('')}</ul>`).join('');
  let n = 0;
  const steps = stepEntries(o).map(e => e.heading
    ? `<li class="cook-link-heading">${escapeHtml(String(e.text).trim().replace(/:$/, ''))}</li>`
    : `<li class="cook-link-step"><span class="step-no" aria-hidden="true">${++n}</span><p><span class="sr-only">Schritt ${n}: </span>${escapeHtml(e.text)}</p></li>`).join('');
  const back = m.fromList && cookLinkTargets(r.id).length > 1 ? `<button type="button" class="ghost-btn" data-action="cook-link-list">Zur Liste</button>` : '';
  return cookLinkSheet('cook-link-title', o.title || 'Ohne Titel', `<div class="cook-link-body">
      ${facts.length ? `<p class="cook-link-facts">${escapeHtml(facts.join(' · '))}</p>` : ''}
      ${l.note ? `<p class="cook-link-note">${escapeHtml(l.note)}</p>` : ''}
      <h3 class="cook-link-h">Zutaten</h3>
      <p class="fs-hint">Originalmengen des Rezepts</p>
      ${ings || '<p class="hint-line">Keine Zutaten erfasst.</p>'}
      <h3 class="cook-link-h">Zubereitung</h3>
      ${steps ? `<ol class="cook-link-steps">${steps}</ol>` : '<p class="hint-line">Noch keine Zubereitungsschritte erfasst.</p>'}
    </div>
    <div class="form-actions cook-link-actions">${back}<button type="button" class="primary-btn" data-action="close-modal">Schliessen</button></div>`);
}
function cookLinkListHtml(r) {
  const links = cookLinkTargets(r.id);
  if (!links.length) return '';
  return cookLinkSheet('cook-links-title', 'Passt dazu', `<p class="hint-line">Zum Nachlesen. Dein Kochfortschritt und die Timer laufen weiter.</p>
    <ul class="cook-link-list">${links.map(l => {
      const o = state.recipes.find(x => x.id === l.otherId);
      const time = timeInfo(o).cardText;
      return `<li><button type="button" class="menu-item cook-link-item" data-action="cook-link-preview" data-id="${escapeAttr(o.id)}">${hasPhoto(o) ? recipeImageHtml(o, 'picker-thumb', 'thumb') : `<span class="picker-thumb pairing-ph" aria-hidden="true">${ICONS.bookOpen}</span>`}<span class="menu-item-text"><span>${escapeHtml(o.title || 'Ohne Titel')}</span>${time || l.note ? `<span class="menu-item-hint">${escapeHtml([time, l.note].filter(Boolean).join(' · '))}</span>` : ''}</span></button></li>`;
    }).join('')}</ul>`);
}
function cookLinkModalHtml(r) {
  const t = state.modal && state.modal.type;
  if (t === 'link-preview') return cookLinkPreviewHtml(r);
  if (t === 'link-list') return cookLinkListHtml(r);
  return '';
}
