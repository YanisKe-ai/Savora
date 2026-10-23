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
  cookAudioUnlock();   // v89: Ton jetzt (beim Tippen) freischalten, sonst bleibt er auf dem iPhone am Ende stumm
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
    finishTimerFeedback(id);
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
  const chipEl = document.querySelector(`.timer-chip[data-timer-id="${cssAttr(id)}"]`);
  if (chipEl) {
    chipEl.classList.toggle('running', t.running);
    chipEl.classList.toggle('done', t.done);
    if (t.done) chipEl.innerHTML = `${ICONS.check}<span data-timer-label="${escapeAttr(id)}">${fmtClock(0)}</span>`;
  }
  // v89: grosser Timer-Knopf unter dem Schritt zeigt denselben Zustand
  document.querySelectorAll(`.cook-timer-start[data-timer-id="${cssAttr(id)}"]`).forEach(b => {
    const was = b.dataset.state, now = t.done ? 'done' : (t.running ? 'running' : 'idle');
    if (was === now) return;
    b.dataset.state = now;
    b.innerHTML = cookTimerStartInner(id, parseInt(b.dataset.seconds, 10) || t.total || 0);
    b.setAttribute('aria-label', cookTimerStartLabel(id, parseInt(b.dataset.seconds, 10) || t.total || 0));
  });
}

/* ---------- v89 Kochmodus: grosser Timer-Knopf unter dem Schritt ---------- */
function cookDurationShort(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  if (sec < 60) return `${sec} Sek.`;
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (s) return fmtClock(sec);
  if (h) return m ? `${h} Std. ${m} Min.` : `${h} Std.`;
  return `${m} Min.`;
}
function cookTimerStartLabel(id, seconds) {
  const t = state.timers[id];
  if (t && t.done) return `Timer ${cookDurationShort(seconds)} ist fertig, tippen zum Zurücksetzen`;
  if (t && t.running) return `Timer ${cookDurationShort(seconds)} läuft`;
  return `Timer ${cookDurationShort(seconds)} starten`;
}
function cookTimerStartInner(id, seconds) {
  const t = state.timers[id];
  if (t && t.done) return `${ICONS.check}<span>Timer fertig</span>`;
  if (t && t.running) return `${ICONS.timer}<span>Läuft</span><b data-timer-label="${escapeAttr(id)}">${fmtClock(t.remaining)}</b>`;
  return `${ICONS.timer}<span>Timer ${escapeHtml(cookDurationShort(seconds))} starten</span>`;
}
function cookTimerStartButtons(text, stepIdx) {
  const segs = (typeof parseStepSegments === 'function' ? parseStepSegments(String(text || '')) : []).filter(s => s.type === 'timer' && s.seconds > 0);
  if (!segs.length) return '';
  return `<div class="cook-timer-starts">${segs.map(seg => {
    const id = `${state.activeRecipeId}-${stepIdx}-${seg.key}`;
    const t = state.timers[id];
    const st = t && t.done ? 'done' : (t && t.running ? 'running' : 'idle');
    return `<button type="button" class="cook-timer-start" data-state="${st}" data-timer-id="${escapeAttr(id)}" data-seconds="${seg.seconds}" data-action="toggle-timer" aria-label="${escapeAttr(cookTimerStartLabel(id, seg.seconds))}">${cookTimerStartInner(id, seg.seconds)}</button>`;
  }).join('')}</div>`;
}

/* ---------- v89 Kochmodus: Timer-Ende ----------
   Ton wiederholt sich (hoechstens 2 Minuten), bis «Fertig» getippt wird. Bildschirmbreite Tomatenleiste oben,
   Vibration wo moeglich. Die Leiste liegt ausserhalb von #app, damit sie ein render() ueberlebt. */
let _cookAudio = null, _cookAlarm = null;
const COOK_ALARM_MAX_MS = 120000;
function cookAudioUnlock() {
  try {
    if (!_cookAudio) { const C = window.AudioContext || window.webkitAudioContext; if (C) _cookAudio = new C(); }
    if (_cookAudio && _cookAudio.state === 'suspended') _cookAudio.resume().catch(() => {});
  } catch (e) { _cookAudio = null; }
}
function cookAlarmBeep() {
  try {
    cookAudioUnlock();
    const ctx = _cookAudio; if (!ctx) return;
    [[880, 0], [1175, 0.22], [880, 0.6], [1175, 0.82]].forEach(([f, at]) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      o.connect(g); g.connect(ctx.destination);
      const t0 = ctx.currentTime + at;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
      o.start(t0); o.stop(t0 + 0.22);
    });
  } catch (e) {}
  try { if (navigator.vibrate) navigator.vibrate([300, 120, 300]); } catch (e) {}
}
function cookAlarmText() {
  if (!_cookAlarm) return '';
  const steps = Array.from(_cookAlarm.ids).map(id => { const m = /-(\d+)-[^-]*$/.exec(id); return m ? parseInt(m[1], 10) + 1 : null; }).filter(Boolean).sort((a, b) => a - b);
  if (!steps.length) return 'Ein Timer ist abgelaufen.';
  return steps.length === 1 ? `Schritt ${steps[0]} ist bereit.` : `Schritte ${steps.join(', ')} sind bereit.`;
}
function cookAlarmRender() {
  if (!_cookAlarm) return;
  let el = document.getElementById('cookAlarm');
  const fresh = !el;
  if (fresh) {
    el = document.createElement('div');
    el.id = 'cookAlarm'; el.className = 'cook-alarm';
    el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-labelledby', 'cookAlarmTitle'); el.setAttribute('aria-describedby', 'cookAlarmText');
    el.innerHTML = `<div class="cook-alarm-inner">
        <div class="cook-alarm-copy"><strong id="cookAlarmTitle">Timer fertig</strong><span id="cookAlarmText"></span></div>
        <div class="cook-alarm-actions">
          <button type="button" class="cook-alarm-plus" data-cook-alarm="plus">+1 Min.</button>
          <button type="button" class="cook-alarm-ok" data-cook-alarm="ok">Fertig</button>
        </div>
      </div>`;
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cook-alarm]'); if (!b) return;
      const ids = _cookAlarm ? Array.from(_cookAlarm.ids) : [];
      cookAlarmStop();
      if (b.dataset.cookAlarm === 'plus') ids.forEach(id => { if (state.timers[id]) timerPlusMinute(id); });
    });
    document.body.appendChild(el);
  }
  el.querySelector('#cookAlarmText').textContent = cookAlarmText();
  if (fresh) { const ok = el.querySelector('.cook-alarm-ok'); try { ok.focus({ preventScroll: true }); } catch (e) {} }
}
function cookAlarmStart(id) {
  if (!_cookAlarm) {
    _cookAlarm = { ids: new Set(), started: Date.now(), iv: null };
    cookAlarmBeep();
    _cookAlarm.iv = setInterval(() => {
      if (!_cookAlarm) return;
      if (Date.now() - _cookAlarm.started > COOK_ALARM_MAX_MS) { clearInterval(_cookAlarm.iv); _cookAlarm.iv = null; return; }   // Ton hoert auf, die Leiste bleibt bis «Fertig»
      cookAlarmBeep();
    }, 2000);
  }
  if (id) _cookAlarm.ids.add(id);
  cookAlarmRender();
}
function cookAlarmStop() {
  if (_cookAlarm && _cookAlarm.iv) clearInterval(_cookAlarm.iv);
  _cookAlarm = null;
  try { if (navigator.vibrate) navigator.vibrate(0); } catch (e) {}
  const el = document.getElementById('cookAlarm');
  if (el) el.remove();
}
function finishTimerFeedback(id) {
  cookAlarmStart(id);
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
  if (state.cookMise && !state.cookStepIndex) { cookMiseDone(); return; }   // v89: aus der Vorbereitung geht «weiter» zu Schritt 1
  const steps = cookSteps(r);
  if (state.cookStepIndex < steps.length - 1) { state.cookStepIndex++; if (typeof saveCookProgress === 'function') saveCookProgress(); render(); speakCurrentStepIfEnabled(); }
}

function cookGoPrev() {
  if (state.cookMise && !state.cookStepIndex) return;
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
  bindCookTapZones();
}

/* ---------- v89 Kochmodus: Mise en place (Vorbereitung vor Schritt 1) ----------
   Eigene Haken (nur im Speicher): «bereitgelegt» ist etwas anderes als «im Schritt verwendet». */
function cookMiseDone() {
  state.cookMise = false;
  state.cookStepIndex = 0;
  if (typeof saveCookProgress === 'function') saveCookProgress();
  render();
  speakCurrentStepIfEnabled();
}
function cookMiseToggle(el) {
  state.cookMiseChecked = state.cookMiseChecked || {};
  const rid = state.activeRecipeId, idx = parseInt(el.dataset.idx, 10);
  const set = state.cookMiseChecked[rid] || (state.cookMiseChecked[rid] = new Set());
  if (set.has(idx)) set.delete(idx); else set.add(idx);
  const on = set.has(idx);
  el.classList.toggle('is-checked', on);
  el.setAttribute('aria-checked', String(on));
  SavoraNative.haptic('light');
  const r = currentCookRecipe();
  const total = r ? realIngredients(r).length : 0;
  const c = document.getElementById('cookMiseCount');
  if (c) c.textContent = `${set.size} von ${total} bereit`;
}
function cookMiseView(r) {
  const set = (state.cookMiseChecked && state.cookMiseChecked[r.id]) || new Set();
  const factor = servingsFactor(r, currentServings(r));
  const ings = realIngredients(r);
  const tiles = ings.map(i => {
    const idx = r.ingredients.indexOf(i);
    const amt = scaledAmountLine(i, factor);
    const on = set.has(idx);
    return `<button type="button" class="cook-mise-tile ${on ? 'is-checked' : ''}" data-action="cook-mise-toggle" data-idx="${idx}" role="checkbox" aria-checked="${on}"><span class="check-box" aria-hidden="true">${ICONS.check}</span>${amt ? `<span class="cook-mise-amt">${escapeHtml(amt)}</span>` : ''}<span class="cook-mise-name">${escapeHtml(i.name)}</span></button>`;
  }).join('');
  return `<div class="cook-mise">
      <h2 class="cook-mise-title">Alles bereit?</h2>
      <p class="cook-mise-hint">Lege die Zutaten bereit und hake sie ab. <span id="cookMiseCount">${set.size} von ${ings.length} bereit</span></p>
      <div class="cook-mise-grid">${tiles}</div>
      <p class="cook-mise-tip">Tipp: Beim Kochen rechts tippen geht weiter, links zurück.</p>
      ${cookVoiceSupported() ? `<div class="cook-voicectl-row">${cookVoiceButtonHtml()}<span>Freihändig mit «weiter», «zurück» und «Timer».</span></div>` : ''}
    </div>`;
}

/* ---------- v89 Kochmodus: freihändig weiter ----------
   Antippen der rechten Hälfte = weiter, linke Hälfte = zurück. Nicht auf Knöpfen, Links, Feldern
   oder wenn Text markiert ist. Nach einem Wisch blockiert motion.js den Klick (preventDefault). */
function bindCookTapZones() {
  const body = document.querySelector('.cook-v2 .cookmode-body');
  if (!body || body.dataset.tapBound || state.cookFinished || state.cookAllSteps || state.cookMise) return;
  body.dataset.tapBound = '1';
  body.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button > 0) return;
    // composedPath statt closest: ein Knopf kann seinen Inhalt waehrend des Klicks neu zeichnen (Timer), dann haengt e.target nicht mehr im Baum
    const skip = 'button, a, input, textarea, select, label, [data-action], [role="checkbox"]';
    if (!e.target.isConnected || e.composedPath().some(n => n.nodeType === 1 && n !== body && n.matches && n.matches(skip))) return;
    const sel = window.getSelection ? String(window.getSelection()) : '';
    if (sel.trim()) return;
    const box = body.getBoundingClientRect();
    if (!box.width) return;
    const right = (e.clientX - box.left) > box.width / 2;
    SavoraNative.haptic('light');
    if (right) cookGoNext(); else cookGoPrev();
  });
}

/* ---------- v89 Kochmodus: Sprachsteuerung «weiter», «zurück», «Timer» ----------
   Nur wenn der Browser Spracherkennung hat, nur bei offenem Kochmodus und nur, wenn eingeschaltet. */
let _cookRec = null;
if (typeof ICONS === 'object' && !ICONS.mic) ICONS.mic = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>`;
function cookVoiceSupported() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }
function cookVoiceHandle(raw) {
  if (state.view !== 'cookmode') { state.cookVoiceControl = false; cookVoiceStop(); return; }   // Kochmodus verlassen (auch per Zurück-Geste)
  if (state.cookFinished) return;
  if ('speechSynthesis' in window && window.speechSynthesis.speaking) return;   // nicht auf das eigene Vorlesen reagieren
  const t = String(raw || '').toLowerCase().trim();
  if (!t || t.split(/\s+/).length > 3) return;   // nur kurze Befehle, keine ganzen Sätze
  if (/\b(weiter|nächster|naechster|next)\b/.test(t)) { SavoraNative.haptic('light'); cookGoNext(); return; }
  if (/\b(zurück|zurueck|zurick)\b/.test(t)) { SavoraNative.haptic('light'); cookGoPrev(); return; }
  if (/\b(fertig|stopp|stop)\b/.test(t) && _cookAlarm) { cookAlarmStop(); return; }
  if (/\b(timer|wecker)\b/.test(t)) {
    const b = Array.from(document.querySelectorAll('.cook-timer-start')).find(x => x.dataset.state === 'idle');
    if (b) b.click();
  }
}
function cookVoiceStart() {
  if (!cookVoiceSupported() || _cookRec) return;
  const C = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec;
  try { rec = new C(); } catch (e) { return; }
  rec.lang = 'de-CH'; rec.continuous = true; rec.interimResults = false; rec.maxAlternatives = 1;
  rec.onresult = (ev) => { const res = ev.results[ev.results.length - 1]; if (res && res[0]) cookVoiceHandle(res[0].transcript); };
  rec.onerror = (ev) => {
    if (ev && (ev.error === 'not-allowed' || ev.error === 'service-not-allowed')) {
      state.cookVoiceControl = false; _cookRec = null;
      showToast('Mikrofon nicht erlaubt. Sprachsteuerung ist aus.');
      if (state.view === 'cookmode') render();
    }
  };
  rec.onend = () => {
    if (_cookRec !== rec) return;
    _cookRec = null;
    if (state.cookVoiceControl && state.view === 'cookmode' && document.visibilityState === 'visible') setTimeout(cookVoiceStart, 300);
  };
  _cookRec = rec;
  try { rec.start(); } catch (e) { _cookRec = null; }
}
function cookVoiceStop() {
  const rec = _cookRec; _cookRec = null;
  if (rec) { try { rec.onend = null; rec.abort(); } catch (e) {} }
}
function cookVoiceButtonHtml() {
  if (!cookVoiceSupported()) return '';
  const on = !!state.cookVoiceControl;
  return `<button type="button" class="cook-pill-btn cook-voicectl-btn ${on ? 'is-on' : ''}" data-action="cook-voice-control" aria-pressed="${on}">${ICONS.mic}<span>Sprachsteuerung</span></button>`;
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') cookVoiceStop();
  else if (state.cookVoiceControl && state.view === 'cookmode') cookVoiceStart();
});

/* ---------- v89 Rezeptdetail: dezent «Zuletzt gekocht am …» ---------- */
function cookLastCookedHtml(r) {
  if (!r || !r.lastCookedAt) return '';
  const d = new Date(r.lastCookedAt).toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' });
  const n = r.cookCount || 0;
  return `<p class="cook-last-line">Zuletzt gekocht am ${escapeHtml(d)}${n > 1 ? ` · ${n}-mal gekocht` : ''}</p>`;
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
