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
  updateTimerChipDOM(id);
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
  const labelEl = document.querySelector(`[data-timer-label="${id}"]`);
  if (labelEl) labelEl.textContent = fmtClock(t.remaining);
  const chipEl = document.querySelector(`[data-timer-id="${id}"]`);
  if (chipEl) {
    chipEl.classList.toggle('running', t.running);
    chipEl.classList.toggle('done', t.done);
    if (t.done) chipEl.innerHTML = `${ICONS.check}<span data-timer-label="${id}">${fmtClock(0)}</span>`;
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
function currentCookRecipe() { return state.recipes.find(x => x.id === state.activeRecipeId); }

function cookGoNext() {
  const r = currentCookRecipe();
  if (!r) return;
  const steps = r.steps || [];
  if (state.cookStepIndex < steps.length - 1) { state.cookStepIndex++; render(); speakCurrentStepIfEnabled(); }
}

function cookGoPrev() {
  if (state.cookStepIndex > 0) { state.cookStepIndex--; render(); speakCurrentStepIfEnabled(); }
}

function speakCurrentStepIfEnabled() {
  if (!state.voiceEnabled || !('speechSynthesis' in window)) return;
  const r = currentCookRecipe();
  if (!r) return;
  const step = (r.steps || [])[state.cookStepIndex];
  if (!step || !step.text) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(step.text);
  utter.lang = 'de-DE';
  utter.rate = 0.98;
  window.speechSynthesis.speak(utter);
}

function bindCookSwipe() {
  const overlay = document.querySelector('.cookmode-overlay');
  if (!overlay) return;
  let startX = null, startY = null;
  overlay.addEventListener('touchstart', (e) => {
    if (!e.touches || !e.touches[0]) return;
    startX = e.touches[0].clientX; startY = e.touches[0].clientY;
  }, { passive: true });
  overlay.addEventListener('touchend', (e) => {
    if (startX === null || !e.changedTouches || !e.changedTouches[0]) return;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    startX = null;
    if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    if (dx < 0) cookGoNext(); else cookGoPrev();
  }, { passive: true });
}
