/* ---------- Bewegung und Gefuehl (nach Apples Designregeln, uebertragen aufs Web) ----------
   - Springs statt fester Dauer: unterbrechbar, starten immer beim aktuellen Wert, uebernehmen die
     Fingergeschwindigkeit (damping 1.0 = kein Ueberschwingen, 0.8 nur nach Schwung).
   - Wischen im Kochmodus und Ziehen an Fenstern folgen dem Finger 1:1, mit ~10 px Schwelle,
     Gummiband an Grenzen und Schwung-Projektion beim Loslassen.
   - Drueck-Feedback auf iOS: WebKit zeigt :active nur, wenn ein touchstart-Listener existiert.
   - Weiche Kante unter den Kopfleisten erst beim Scrollen (statt harter 1-px-Linie).
   - Systemschriftgroesse (Dynamic Type) auf iPhone/iPad: Grundgroesse folgt der Einstellung.
   Bei "Bewegung reduzieren" springen alle Wechsel ohne Animation. */

function motionReduced() {
  return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/* Feder nach Apples Parametern: response (Sekunden bis zum Ziel), damping (1 = kritisch gedaempft).
   Liefert ein Objekt mit stop(), value und velocity, damit eine neue Geste mitten im Lauf uebernehmen kann. */
function springAnimate(opts) {
  const to = opts.to, response = opts.response || 0.35, damping = opts.damping == null ? 1 : opts.damping;
  const k = Math.pow((2 * Math.PI) / response, 2), c = (4 * Math.PI * damping) / response;
  let x = opts.from, v = opts.velocity || 0, last = null, raf = 0, stopped = false;
  const step = (now) => {
    if (stopped) return;
    const dt = last === null ? 1 / 60 : Math.min(0.034, (now - last) / 1000);
    last = now;
    for (let i = 0; i < 4; i++) { const h = dt / 4; const a = -k * (x - to) - c * v; v += a * h; x += v * h; }
    if (Math.abs(x - to) < 0.5 && Math.abs(v) < 10) { x = to; v = 0; opts.onUpdate(x); if (opts.onDone) opts.onDone(); return; }
    opts.onUpdate(x);
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return { stop() { stopped = true; cancelAnimationFrame(raf); }, get value() { return x; }, get velocity() { return v; } };
}

/* Gummiband: je weiter ueber die Grenze, desto weniger folgt das Element (Konstante 0.55). */
function rubberband(overshoot, dimension, constant) {
  const c = constant || 0.55;
  return (overshoot * dimension * c) / (dimension + c * Math.abs(overshoot));
}

/* Wohin eine Geste mit dieser Geschwindigkeit (px/s) ausrollen wuerde (Apples Projektionsformel). */
function projectMomentum(velocity, decelerationRate) {
  const d = decelerationRate || 0.998;
  return ((velocity / 1000) * d) / (1 - d);
}

/* Geschwindigkeit aus den letzten Zeigerpositionen (px/s) */
function velocityFromHistory(hist, key) {
  if (hist.length < 2) return 0;
  const a = hist[0], b = hist[hist.length - 1];
  const dt = (b.t - a.t) / 1000;
  return dt > 0 ? (b[key] - a[key]) / dt : 0;
}

/* ---------- Kochmodus: Schritt folgt dem Finger ---------- */
let _cookEnterFrom = 0;   // nach einem Wechsel: neuer Schritt kommt von dieser Seite (-1 links, 1 rechts)
function bindCookSwipeMotion() {
  const overlay = document.querySelector('.cookmode-overlay');
  const body = overlay && overlay.querySelector('.cookmode-body');
  if (!overlay || !body || overlay.dataset.swipeBound) return;
  overlay.dataset.swipeBound = '1';
  const W = () => overlay.clientWidth || 360;
  const set = (x) => {
    body.style.transform = x ? `translate3d(${x}px,0,0)` : '';
    body.style.opacity = x ? String(Math.max(0.4, 1 - (Math.abs(x) / W()) * 0.6)) : '';
  };
  // Neuer Schritt nach einem Wisch: aus der Wischrichtung einfahren (gleicher Weg wie beim Herausgehen)
  if (_cookEnterFrom && !motionReduced()) {
    const from = _cookEnterFrom * W() * 0.28;
    _cookEnterFrom = 0;
    set(from);
    springAnimate({ from, to: 0, response: 0.35, damping: 1, onUpdate: set });
  }
  _cookEnterFrom = 0;
  let sx = 0, sy = 0, base = 0, active = false, dragging = false, hist = [], anim = null, justDragged = false;
  const steps = () => { const r = typeof currentCookRecipe === 'function' ? currentCookRecipe() : null; return r ? cookSteps(r).length : 1; };
  overlay.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('input, textarea, select, .cook-timerbar')) return;
    sx = e.clientX; sy = e.clientY; active = true; dragging = false; hist = [{ x: e.clientX, t: e.timeStamp }];
    if (anim) { base = anim.value; anim.stop(); anim = null; } else base = 0;   // Unterbrechen: beim aktuellen Wert weitermachen
  });
  overlay.addEventListener('pointermove', (e) => {
    if (!active) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (!dragging) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { active = false; return; }   // senkrecht: scrollen lassen
      if (Math.abs(dx) < 10) return;                                                       // Schwelle gegen Fehlausloesung
      dragging = true;
      try { overlay.setPointerCapture(e.pointerId); } catch (err) { /* nicht kritisch */ }
    }
    hist.push({ x: e.clientX, t: e.timeStamp }); if (hist.length > 6) hist.shift();
    let x = base + dx;
    const first = state.cookStepIndex <= 0, last = state.cookStepIndex >= steps() - 1;
    if ((x > 0 && first) || (x < 0 && last)) x = rubberband(x, W());
    set(x);
  });
  const finish = () => {
    if (!active) return;
    active = false;
    if (!dragging) return;
    justDragged = true; setTimeout(() => { justDragged = false; }, 50);
    const x = parseFloat((body.style.transform.match(/translate3d\(([-\d.]+)px/) || [])[1] || '0');
    const v = velocityFromHistory(hist, 'x');
    const projected = x + projectMomentum(v);
    const first = state.cookStepIndex <= 0, last = state.cookStepIndex >= steps() - 1;
    const goNext = projected < -W() * 0.35 && !last;
    const goPrev = projected > W() * 0.35 && !first;
    if (goNext || goPrev) {
      const target = goNext ? -W() : W();
      const commit = () => { _cookEnterFrom = goNext ? 1 : -1; if (goNext) cookGoNext(); else cookGoPrev(); };
      if (motionReduced()) { set(0); commit(); return; }
      anim = springAnimate({ from: x, to: target, velocity: v, response: 0.28, damping: 1, onUpdate: set, onDone: () => { anim = null; commit(); } });
    } else {
      anim = motionReduced() ? (set(0), null) : springAnimate({ from: x, to: 0, velocity: v, response: 0.35, damping: 1, onUpdate: set, onDone: () => { anim = null; } });
    }
  };
  overlay.addEventListener('pointerup', finish);
  overlay.addEventListener('pointercancel', finish);
  // Nach einem Wisch darf kein Knopf unter dem Finger ausgeloest werden
  overlay.addEventListener('click', (e) => { if (justDragged) { e.stopPropagation(); e.preventDefault(); } }, true);
}

/* ---------- Fenster (Sheets) mit Ziehleiste: nach unten ziehen schliesst ---------- */
function bindSheetDrag() {
  if (window.matchMedia && matchMedia('(min-width: 640px)').matches) return;   // auf grossen Bildschirmen sind es Dialoge
  document.querySelectorAll('.modal-sheet').forEach((sheet) => {
    if (sheet.dataset.dragBound || !sheet.querySelector('.sheet-handle')) return;
    sheet.dataset.dragBound = '1';
    const backdrop = sheet.closest('.modal-backdrop');
    let sy = 0, active = false, dragging = false, hist = [], anim = null, base = 0;
    const H = () => sheet.offsetHeight || 400;
    const set = (y) => {
      sheet.style.transform = y ? `translate3d(0,${y}px,0)` : '';
      if (backdrop) backdrop.style.backgroundColor = y > 0 ? `rgba(30,12,51,${(0.42 * Math.max(0, 1 - y / H())).toFixed(3)})` : '';
    };
    sheet.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const top = sheet.getBoundingClientRect().top;
      const onHandle = !!e.target.closest('.sheet-handle');
      const nearTop = e.clientY - top < 56 && sheet.scrollTop <= 0 && !e.target.closest('button, a, input, textarea, select, label');
      if (!onHandle && !nearTop) return;
      sy = e.clientY; active = true; dragging = false; hist = [{ y: e.clientY, t: e.timeStamp }];
      if (anim) { base = anim.value; anim.stop(); anim = null; } else base = 0;
    });
    sheet.addEventListener('pointermove', (e) => {
      if (!active) return;
      const dy = e.clientY - sy;
      if (!dragging) { if (Math.abs(dy) < 8) return; dragging = true; try { sheet.setPointerCapture(e.pointerId); } catch (err) {} }
      hist.push({ y: e.clientY, t: e.timeStamp }); if (hist.length > 6) hist.shift();
      let y = base + dy;
      if (y < 0) y = rubberband(y, H());   // nach oben: weicher Widerstand
      set(y);
    });
    const finish = () => {
      if (!active) return;
      active = false;
      if (!dragging) return;
      const y = parseFloat((sheet.style.transform.match(/translate3d\(0,\s*([-\d.]+)px/) || [])[1] || '0');
      const v = velocityFromHistory(hist, 'y');
      const projected = y + projectMomentum(v);
      if (projected > H() * 0.4) {
        const close = () => { if (state.modal) closeModal(); };
        if (motionReduced()) { close(); return; }
        anim = springAnimate({ from: y, to: H(), velocity: v, response: 0.3, damping: 1, onUpdate: set, onDone: () => { anim = null; close(); } });
      } else {
        anim = motionReduced() ? (set(0), null) : springAnimate({ from: y, to: 0, velocity: v, response: 0.3, damping: 0.8, onUpdate: set, onDone: () => { anim = null; set(0); } });
      }
    };
    sheet.addEventListener('pointerup', finish);
    sheet.addEventListener('pointercancel', finish);
  });
}

/* ---------- Weiche Kante unter den Kopfleisten erst beim Scrollen ---------- */
function updateScrollEdge() {
  const on = (window.scrollY || document.documentElement.scrollTop || 0) > 2;
  document.documentElement.classList.toggle('is-scrolled', on);
}

/* ---------- Einmalige Einrichtung ---------- */
(function initMotion() {
  // iOS: ohne touchstart-Listener zeigt WebKit keinen :active-Zustand (kein Drueck-Feedback)
  document.addEventListener('touchstart', () => {}, { passive: true });
  window.addEventListener('scroll', updateScrollEdge, { passive: true });
  // Dynamic Type: auf Apple-Geraeten die Systemschriftgroesse als Grundgroesse uebernehmen (Standard 17 pt = 16 px Basis)
  try {
    const probe = document.createElement('span');
    probe.style.font = '-apple-system-body';
    if (probe.style.font) {
      probe.style.position = 'absolute'; probe.style.visibility = 'hidden';
      document.documentElement.appendChild(probe);
      const size = parseFloat(getComputedStyle(probe).fontSize);
      probe.remove();
      if (size > 0) {
        const base = Math.min(24, Math.max(14, (16 * size) / 17));
        if (Math.abs(base - 16) > 0.2) document.documentElement.style.fontSize = base.toFixed(2) + 'px';
      }
    }
  } catch (e) { /* Rueckfall: Browserstandard */ }
})();
