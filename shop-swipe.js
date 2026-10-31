/* v95: Wischen in der Einkaufsliste (nur Touch/Stift). Nach rechts = abhaken bzw. Haken entfernen (wie der Haken-Knopf),
   nach links = entfernen (wie «Entfernen» im Menü, mit «Rückgängig» aus delete-shopping-item).
   Abkürzung, kein Ersatz: alle Aktionen bleiben über Knöpfe erreichbar. Maus/Trackpad wischt nicht.
   Delegation am document, weil render() die Liste bei jeder Änderung neu aufbaut. Animiert wird nur transform/opacity
   (beim Löschen zusätzlich kurz die Höhe der Lücke). */
(function () {
  'use strict';
  const SLOP = 10;              // ab so vielen px entscheidet sich die Richtung
  const THRESHOLD = 0.35;       // Anteil der Zeilenbreite, ab dem die Aktion auslöst
  const FLICK_V = 0.5;          // px pro ms: schneller Wisch löst auch unter der Schwelle aus ...
  const FLICK_MIN = 40;         // ... aber erst ab dieser Strecke
  const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
  let g = null;                 // laufende Geste
  let suppressClickUntil = 0;

  const reduced = () => { try { return typeof prefersReducedMotion === 'function' ? prefersReducedMotion() : matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const fg = (row) => row.querySelector(':scope > .shop-row-fg');
  const layer = (row, kind) => row.querySelector(':scope > .shop-swipe-bg--' + kind);

  function offsetOf(row) {
    const f = fg(row); if (!f) return 0;
    const m = getComputedStyle(f).transform;
    if (!m || m === 'none') return 0;
    try { return new DOMMatrixReadOnly(m).m41; } catch (e) { return 0; }
  }
  function paint(row, x, w) {
    const f = fg(row); if (!f) return;
    f.style.transform = x ? `translate3d(${x}px,0,0)` : '';
    const kind = x > 0 ? 'ok' : 'del';
    row.classList.toggle('is-swipe-ok', x > 0);
    row.classList.toggle('is-swipe-del', x < 0);
    const l = layer(row, kind);
    if (l) { const ic = l.firstElementChild; if (ic) ic.style.opacity = String(Math.min(1, Math.abs(x) / 40)); }
  }
  function armed(row, x, w) {
    const on = Math.abs(x) >= w * THRESHOLD;
    const l = layer(row, x > 0 ? 'ok' : 'del');
    row.classList.toggle('is-armed', on);
    return on;
  }
  function endState(row) {
    row.classList.remove('is-swiping', 'is-swipe-ok', 'is-swipe-del', 'is-armed');
    const f = fg(row); if (f) { f.style.transition = ''; f.style.transform = ''; }
    row.querySelectorAll(':scope > .shop-swipe-bg > svg').forEach(s => { s.style.opacity = ''; });
  }
  function springBack(row, from) {
    const f = fg(row); if (!f) return;
    if (reduced() || !from) { endState(row); return; }
    f.style.transition = 'none';
    f.style.transform = `translate3d(${from}px,0,0)`;
    void f.offsetWidth;
    f.style.transition = `transform 320ms ${EASE}`;
    f.style.transform = 'translate3d(0,0,0)';
    let done = false;
    const fin = () => { if (done) return; done = true; f.removeEventListener('transitionend', fin); endState(row); };
    f.addEventListener('transitionend', fin);
    setTimeout(fin, 420);
  }
  function run(action, row) {
    const id = row.dataset.id;
    try { const r = dispatchAction(action, id, row, null); if (r && r.catch) r.catch(() => {}); } catch (e) { /* Aktion fehlgeschlagen: Liste bleibt, wie sie ist */ }
  }
  function commitCheck(row, from) {
    run('toggle-shopping-item', row);
    springBack(row, from);
  }
  function commitDelete(row, from, dir) {
    const f = fg(row);
    const go = () => run('delete-shopping-item', row);
    if (!f || reduced()) { go(); return; }
    row.dataset.swipeGone = '1';
    const w = row.getBoundingClientRect().width;
    const h = row.getBoundingClientRect().height;
    f.style.transition = `transform 200ms ${EASE}`;
    f.style.transform = `translate3d(${dir * w}px,0,0)`;
    setTimeout(() => {
      row.style.minHeight = '0';
      row.style.overflow = 'hidden';
      let a = null;
      try { a = row.animate([{ height: h + 'px', opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 180, easing: EASE, fill: 'forwards' }); } catch (e) { /* ohne WAAPI: direkt */ }
      if (a) a.onfinish = go; else go();
      setTimeout(() => { if (row.isConnected && row.dataset.swipeGone) { delete row.dataset.swipeGone; } }, 1500);
    }, 190);
  }

  function onDown(e) {
    if (g || (e.pointerType !== 'touch' && e.pointerType !== 'pen')) return;
    if (e.isPrimary === false) return;
    const row = e.target && e.target.closest && e.target.closest('.shop-row');
    if (!row || !row.closest('.shop-main') || row.dataset.swipeGone) return;
    if (state && state.modal) return;
    g = { id: e.pointerId, row, x0: e.clientX, y0: e.clientY, base: offsetOf(row), mode: 'wait', w: row.getBoundingClientRect().width || 320, hist: [{ t: e.timeStamp, x: e.clientX }], armed: false, x: 0 };
    if (g.base) { g.mode = 'drag'; g.x0 -= 0; }   // Zeile war noch auf dem Rückweg: sofort wieder greifbar
  }
  function onMove(e) {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    if (g.mode === 'wait') {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      if (Math.abs(dy) > Math.abs(dx) * 0.8) { g = null; return; }   // eher senkrecht: Seite scrollt normal
      g.mode = 'drag';
      g.row.classList.add('is-swiping');
      const f = fg(g.row); if (f) f.style.transition = 'none';
      try { g.row.setPointerCapture(e.pointerId); } catch (err) { /* synthetische Zeiger */ }
    } else if (g.row.classList.contains('is-swiping') === false) {
      g.row.classList.add('is-swiping');
      const f = fg(g.row); if (f) f.style.transition = 'none';
      try { g.row.setPointerCapture(e.pointerId); } catch (err) {}
    }
    let x = g.base + dx;
    const lim = g.w * 0.85;
    if (Math.abs(x) > lim) x = Math.sign(x) * (lim + (Math.abs(x) - lim) * 0.25);   // sanfter Widerstand am Rand
    g.x = x;
    g.hist.push({ t: e.timeStamp, x: e.clientX });
    if (g.hist.length > 6) g.hist.shift();
    paint(g.row, x, g.w);
    const on = armed(g.row, x, g.w);
    if (on && !g.armed) { try { if (navigator.vibrate) navigator.vibrate(8); } catch (err) {} }
    g.armed = on;
  }
  function velocity() {
    const h = g.hist; if (h.length < 2) return 0;
    const a = h[0], b = h[h.length - 1];
    const dt = b.t - a.t; return dt > 0 ? (b.x - a.x) / dt : 0;
  }
  function onUp(e, cancelled) {
    if (!g || e.pointerId !== g.id) return;
    const { row, x, w } = g;
    const swiping = row.classList.contains('is-swiping');
    const v = velocity();
    g = null;
    if (!swiping) return;
    suppressClickUntil = performance.now() + 450;   // ein Wisch darf keinen Klick auslösen
    try { row.releasePointerCapture(e.pointerId); } catch (err) {}
    if (cancelled || !x) { springBack(row, x); return; }
    const dir = Math.sign(x);
    const far = Math.abs(x) >= w * THRESHOLD;
    const flick = Math.abs(x) >= FLICK_MIN && Math.abs(v) > FLICK_V && Math.sign(v) === dir;
    if (far || flick) {
      if (dir > 0) commitCheck(row, x); else commitDelete(row, x, -1);
    } else springBack(row, x);
  }

  document.addEventListener('pointerdown', onDown, { passive: true });
  document.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerup', (e) => onUp(e, false), { passive: true });
  document.addEventListener('pointercancel', (e) => onUp(e, true), { passive: true });
  document.addEventListener('click', (e) => {
    if (performance.now() < suppressClickUntil && e.target && e.target.closest && e.target.closest('.shop-row')) { e.stopPropagation(); e.preventDefault(); }
  }, true);
})();
