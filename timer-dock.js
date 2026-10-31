/* v95 Timer überall: kleine schwebende Anzeige (Pille) für laufende und fertige Koch-Timer ausserhalb des Kochmodus.
   Liegt als eigenes Element an document.body (render() ersetzt #app komplett). Aktualisiert wird sie
   - über timerDockUpdate() (aufgerufen von refreshCookTimerBar in cookmode.js bei Start, Ablauf, +1 Min.),
   - über einen MutationObserver auf #app (jedes render(), also jeder Ansichtswechsel),
   - über ein eigenes Sekunden-Intervall, solange die Pille sichtbar ist (ohne render()). */
(function () {
  'use strict';
  const MAX_NAME = 40;
  const ANCHORS = '.bottom-nav, .home-add-bar, .cb-step-footer, .form-actions--sticky, .update-card, .select-bar, .rp-foot';
  let dock = null, mainBtn = null, okBtn = null, nameEl = null, timeEl = null, moreEl = null, iconEl = null;
  let visible = false, hideTimer = null, tickIv = null, raf = 0;
  let lastLabel = '', lastBottom = null;
  const announced = new Set();

  function metaFor(id, t) {
    if (t && t.meta && t.meta.recipeId) return t.meta;
    let best = null;
    (state.recipes || []).forEach(r => { if (id.indexOf(r.id + '-') === 0 && (!best || r.id.length > best.id.length)) best = r; });
    if (!best) return null;
    const m = /^(\d+)-/.exec(id.slice(best.id.length + 1));
    return { recipeId: best.id, stepIdx: m ? parseInt(m[1], 10) : 0, label: best.title || '' };
  }
  function entries() {
    const out = [];
    Object.keys(state.timers || {}).forEach(id => {
      const t = state.timers[id];
      if (!t) return;
      if (!(t.running || (t.done && !t.ack))) return;
      const meta = metaFor(id, t);
      if (!meta) return;
      const remaining = t.running && t.endTime ? Math.max(0, Math.round((t.endTime - Date.now()) / 1000)) : (t.remaining || 0);
      out.push({ id, t, meta, remaining, done: !!t.done && !t.running });
    });
    // Fertige zuerst, dann der nächste ablaufende
    out.sort((a, b) => (a.done === b.done ? a.remaining - b.remaining : (a.done ? -1 : 1)));
    return out;
  }
  function shortName(e) {
    let n = String(e.meta.label || '').trim();
    if (!n) n = 'Schritt ' + ((e.meta.stepIdx || 0) + 1);
    if (n.length > MAX_NAME) { n = n.slice(0, MAX_NAME).replace(/\s+\S*$/, '') || n.slice(0, MAX_NAME); }
    return n;
  }
  function speakRemaining(sec) {
    if (sec < 60) return 'weniger als eine Minute';
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const parts = [];
    if (h) parts.push(h + (h === 1 ? ' Stunde' : ' Stunden'));
    if (m || !h) parts.push(m + (m === 1 ? ' Minute' : ' Minuten'));
    if (!h && s) parts.push(s + (s === 1 ? ' Sekunde' : ' Sekunden'));
    return parts.join(' ');
  }
  function build() {
    if (dock) return;
    dock = document.createElement('div');
    dock.id = 'timerDock'; dock.className = 'timer-dock'; dock.hidden = true;
    dock.setAttribute('role', 'group'); dock.setAttribute('aria-label', 'Laufender Timer');
    dock.innerHTML = `<button type="button" class="timer-dock-main">
        <span class="timer-dock-icon" aria-hidden="true"></span>
        <b class="timer-dock-time" aria-hidden="true"></b>
        <span class="timer-dock-name" aria-hidden="true"></span>
        <span class="timer-dock-more" aria-hidden="true" hidden></span>
      </button>
      <button type="button" class="timer-dock-ok" hidden aria-label="Timer bestätigen und ausblenden">OK</button>`;
    document.body.appendChild(dock);
    mainBtn = dock.querySelector('.timer-dock-main'); okBtn = dock.querySelector('.timer-dock-ok');
    iconEl = dock.querySelector('.timer-dock-icon'); timeEl = dock.querySelector('.timer-dock-time');
    nameEl = dock.querySelector('.timer-dock-name'); moreEl = dock.querySelector('.timer-dock-more');
    if (typeof ICONS !== 'undefined' && ICONS.timer) iconEl.innerHTML = ICONS.timer;
    mainBtn.addEventListener('click', goToCook);
    okBtn.addEventListener('click', ackAll);
  }
  function ackAll() {
    Object.keys(state.timers || {}).forEach(id => { const t = state.timers[id]; if (t && t.done && !t.running) t.ack = true; });
    if (typeof cookAlarmStop === 'function') cookAlarmStop();
    update();
  }
  async function goToCook() {
    const list = entries(); if (!list.length) return;
    const e = list[0], rid = e.meta.recipeId;
    const r = (state.recipes || []).find(x => x.id === rid);
    if (!r || typeof dispatchAction !== 'function') return;
    let step = e.meta.stepIdx || 0;
    if (typeof cookSteps === 'function') step = Math.min(step, Math.max(0, cookSteps(r).length - 1));
    // Gespeicherten Fortschritt (Haken, Timer) behalten, nur den Schritt auf den des Timers setzen
    let hadProgress = false;
    try {
      const p = typeof loadCookProgress === 'function' ? loadCookProgress() : null;
      if (p && p.recipeId === rid && typeof writeJsonKey === 'function' && typeof COOK_PROGRESS_KEY !== 'undefined') { p.step = step; writeJsonKey(COOK_PROGRESS_KEY, p); hadProgress = true; }
    } catch (err) { hadProgress = false; }
    const b = document.createElement('button'); b.dataset.id = rid;
    await dispatchAction('start-cook', rid, b, null);
    if (!hadProgress && state.view === 'cookmode') {
      state.cookMise = false; state.cookStepIndex = step;
      if (typeof saveCookProgress === 'function') saveCookProgress();
      render();
    }
  }
  function anchorBottom() {
    // Abstand von unten: über allem, was unten fest sitzt (Navigation, Hinzufügen-Leiste, Fussleisten). Ab 900 px (Seitenleiste) unten rechts.
    const H = window.innerHeight, W = window.innerWidth;
    if (W >= 900) return 24;
    let top = H;
    document.querySelectorAll(ANCHORS).forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.width >= W * 0.5 && r.bottom > H * 0.5 && r.top < top && r.top > 0) top = r.top;
    });
    return Math.round(H - top + 12);
  }
  function setVisible(on) {
    if (on === visible) return;
    visible = on;
    clearTimeout(hideTimer);
    if (on) {
      dock.hidden = false;
      void dock.offsetWidth;   // Ausgangszustand zeichnen, damit die Bewegung läuft
      dock.classList.add('is-in');
      if (!tickIv) tickIv = setInterval(update, 1000);
    } else {
      dock.classList.remove('is-in');
      hideTimer = setTimeout(() => { if (!visible) dock.hidden = true; }, 220);
      if (tickIv) { clearInterval(tickIv); tickIv = null; }
    }
  }
  function update() {
    raf = 0;
    build();
    const inCook = state.view === 'cookmode';
    const list = inCook ? [] : entries();
    // Ansage einmal beim Ablauf (im Kochmodus meldet sich die Tomatenleiste selbst)
    Object.keys(state.timers || {}).forEach(id => {
      const t = state.timers[id];
      if (!t || !t.done || t.running) return;
      const key = id + '@' + (t.endTime || 0);
      if (announced.has(key)) return;
      announced.add(key);
      if (!inCook && !t.ack && typeof announceLive === 'function') {
        const m = metaFor(id, t);
        if (m) announceLive('Timer ' + shortName({ meta: m }) + ' ist fertig.', true);
      }
    });
    if (!list.length) { setVisible(false); return; }
    const e = list[0];
    const more = list.length - 1;
    const name = shortName(e);
    dock.classList.toggle('is-done', e.done);
    timeEl.textContent = e.done ? '' : fmtClock(e.remaining);
    timeEl.hidden = e.done;
    nameEl.textContent = e.done ? 'Fertig: ' + name : name;
    moreEl.hidden = more <= 0; moreEl.textContent = more > 0 ? '+' + more : '';
    okBtn.hidden = !list.some(x => x.done);
    const stepTxt = e.meta.label ? ', Schritt ' + ((e.meta.stepIdx || 0) + 1) : '';
    const label = (e.done ? 'Timer ' + name + stepTxt + ' ist fertig' : 'Timer ' + name + stepTxt + ', noch ' + speakRemaining(e.remaining))
      + (more > 0 ? ', plus ' + more + (more === 1 ? ' weiterer Timer' : ' weitere Timer') : '') + ', zum Kochmodus';
    if (label !== lastLabel) { lastLabel = label; mainBtn.setAttribute('aria-label', label); }
    const bottom = anchorBottom();
    if (bottom !== lastBottom) { lastBottom = bottom; dock.style.bottom = bottom + 'px'; }
    setVisible(true);
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(update); }
  window.timerDockUpdate = schedule;

  function init() {
    build();
    const app = document.getElementById('app');
    if (app) new MutationObserver(schedule).observe(app, { childList: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    document.addEventListener('click', (ev) => {   // «Fertig» in der Tomatenleiste bestätigt auch die Pille
      const b = ev.target.closest && ev.target.closest('[data-cook-alarm="ok"]');
      if (b) setTimeout(() => { Object.keys(state.timers || {}).forEach(id => { const t = state.timers[id]; if (t && t.done && !t.running) t.ack = true; }); update(); }, 0);
    });
    update();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
