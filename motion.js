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

/* ---------- Weiche Kante unter den Kopfleisten erst beim Scrollen ----------
   is-scrolled: Kopf hat Inhalt darunter. fs-more-below: unter der unteren Leiste liegt noch Inhalt. Der Verlauf mit Unschaerfe
   (CSS-Block «Feinschliff») blendet nur ein, wenn wirklich gescrollt wurde. */
function updateScrollEdge() {
  const y = window.scrollY || document.documentElement.scrollTop || 0;
  const root = document.documentElement;
  root.classList.toggle('is-scrolled', y > 2);
  const more = y > 2 && (y + window.innerHeight) < (root.scrollHeight - 2);
  root.classList.toggle('fs-more-below', more);
}

/* ---------- Feinschliff: Number Ticker ----------
   Zaehlt eine Zahl in 420 ms (ease-out) von 0 auf den Endwert hoch. Der Text der Zahl bleibt die ganze Zeit der Endwert
   (Bildschirmleser, Breite, Layout); die laufende Zahl liegt nur als aria-hidden-Schicht darueber. Pro Ansicht und Schluessel
   nur einmal: Neuzeichnen (Suche tippen, Portionen aendern) zaehlt nicht erneut. Bei Reduced Motion bleibt alles statisch. */
const _tickSeen = new Set();          // pro Ansicht
const _tickSeenSession = new Set();   // pro App-Start (Einkauf-Zaehler)
let _tickView = null;
function initTickers(root) {
  const viewKey = (state.view || '') + '|' + (state.activeRecipeId || '');
  if (_tickView !== viewKey) { _tickView = viewKey; _tickSeen.clear(); }
  const scope = root || document;
  const nodes = scope.querySelectorAll ? scope.querySelectorAll('.tick[data-tick]:not([data-tick-done])') : [];
  nodes.forEach(el => {
    el.setAttribute('data-tick-done', '1');
    const seen = el.dataset.tickScope === 'session' ? _tickSeenSession : _tickSeen;
    const key = el.dataset.tickKey;
    if (!key || seen.has(key)) return;
    seen.add(key);
    if (prefersReducedMotion() || document.hidden || !el.offsetParent) return;
    const target = parseFloat(el.dataset.tick), dec = parseInt(el.dataset.dec || '0', 10);
    if (!(target > 0)) return;
    const fmt = (v) => v.toFixed(dec).replace('.', ',');
    el.style.setProperty('--tick-color', getComputedStyle(el).color);   // die laufende Zahl liegt als CSS-Inhalt (nicht im Text, nicht für Bildschirmleser) darüber
    el.dataset.live = fmt(0);
    el.classList.add('is-ticking');
    const DUR = 420, t0 = performance.now();
    let done = false;
    const finish = () => { if (done) return; done = true; el.classList.remove('is-ticking'); el.removeAttribute('data-live'); el.style.removeProperty('--tick-color'); };
    const step = (now) => {
      if (done) return;
      if (!el.isConnected) { finish(); return; }
      const p = Math.min(1, (now - t0) / DUR);
      el.dataset.live = fmt(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step); else finish();
    };
    requestAnimationFrame(step);
    setTimeout(finish, DUR + 150);   // Rueckfall, falls der Tab im Hintergrund keine Frames zeichnet
  });
}

/* ---------- Feinschliff: Text Highlighter ----------
   Der Wisch laeuft nur, wenn Treffer neu erscheinen (Suche beginnt), nicht bei jedem Tastendruck oder Neuzeichnen. */
let _hlShown = false;
function initHighlights() {
  const marks = document.querySelectorAll('mark.hl');
  if (!marks.length) { if (!(state.query || '').trim()) _hlShown = false; return; }
  if (!_hlShown && !prefersReducedMotion()) marks.forEach(m => m.classList.add('hl-wipe'));
  _hlShown = true;
}

/* ---------- Einmalige Einrichtung ---------- */
(function initMotion() {
  // iOS: ohne touchstart-Listener zeigt WebKit keinen :active-Zustand (kein Drueck-Feedback)
  document.addEventListener('touchstart', () => {}, { passive: true });
  window.addEventListener('scroll', updateScrollEdge, { passive: true });
  window.addEventListener('resize', updateScrollEdge, { passive: true });
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

/* ---------- Bewegung M1: Layout-Übergänge mit FLIP, gleitende Auswahlfläche ----------
   Werte aus MOTION_TOKENS.json (Startwerte des Bewegungsauftrags). Ein zentraler Helfer für Rezeptkarten
   (Filter/Sortierung/Suche) und «Erledigte nach unten»; render() bleibt der globale DOM-Tausch.
   Regeln: Die Aktion selbst läuft immer sofort und synchron (fn), die Bewegung ist nur eine Ergänzung danach.
   Identität kommt aus stabilen IDs (Rezept-/Artikel-ID, Map statt Selektor-Interpolation). Erst alle alten
   Positionen lesen, dann DOM tauschen, dann alle neuen lesen, dann gesammelt animieren (nur transform/opacity,
   Web Animations ohne fill, also keine Stilreste). Eine neue Aktion bricht die laufende Bewegung desselben Kanals
   ab und startet von der aktuell SICHTBAREN Position (getBoundingClientRect enthält das laufende transform).
   Jede Animation gehört einem Kanal und einer Transaktion: Aufräumen einer alten Transaktion berührt keine neuere.
   Reduced Motion (auch beim Umschalten während der Sitzung), verdeckter Tab oder fehlende Web Animations:
   sofort der Endzustand. Entfernte Karten verschwinden ohne Overlay: die Liste hat sofort ihre Endgeometrie,
   es gibt keine doppelten, bedienbaren oder vorgelesenen Karten. */
const MOTION = Object.freeze({
  ease: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  layout: 220,       // recipeReorder.duration
  fade: 140,         // recipeReorder.enterExitDuration
  enterY: 6,         // recipeReorder.enterTranslateY
  select: 180,       // selectionIndicator.duration
  shop: 220,         // shoppingExplicitSort.duration
  margin: 160,       // Vorlauf über/unter dem sichtbaren Bereich (px)
  maxMoving: 36,     // mehr bewegte Karten: nur kurz einblenden statt alles gleichzeitig verschieben
});
const _motionRuns = new Map();   // Kanal -> { tx, anims: Set<Animation> }
let _motionTx = 0;

function motionSupported() { return typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function'; }
function motionAllowed() { return motionSupported() && !motionReduced() && !document.hidden; }

/* Bricht alle Bewegungen eines Kanals ab (Endzustand sofort, weil ohne fill). cancel() lehnt finished ab: abgefangen in motionTrack. */
function motionCancel(channel) {
  const run = _motionRuns.get(channel);
  if (!run) return;
  _motionRuns.delete(channel);
  run.anims.forEach(a => { try { a.cancel(); } catch (e) { /* bereits beendet */ } });
}
function motionCancelAll() { Array.from(_motionRuns.keys()).forEach(motionCancel); }
function motionTrack(channel, tx, anim) {
  let run = _motionRuns.get(channel);
  if (!run || run.tx !== tx) { if (run) motionCancel(channel); run = { tx, anims: new Set() }; _motionRuns.set(channel, run); }
  run.anims.add(anim);
  const done = () => {
    const cur = _motionRuns.get(channel);
    if (cur && cur.tx === tx) { cur.anims.delete(anim); if (!cur.anims.size) _motionRuns.delete(channel); }
  };
  anim.finished.then(done, done);
  return anim;
}

/* FLIP um eine synchrone DOM-Änderung (meist render()).
   cfg: items (Selektor), key(el) -> stabile ID, group(el) -> Layoutkennung (andere Gruppe = keine Bewegung,
   z.B. Raster <-> Liste), duration, fadeNew: [{ items, key }] für neu erscheinende Begleiter (Abschnittstitel). */
function motionFlip(channel, fn, cfg) {
  const tx = ++_motionTx;
  const animate = motionAllowed();
  const group = cfg.group || (() => '');
  const first = new Map(), firstExtra = new Set();
  if (animate) {
    const vh = window.innerHeight, m = MOTION.margin;
    document.querySelectorAll(cfg.items).forEach(el => {
      const k = cfg.key(el);
      if (!k || first.has(k)) return;
      const r = el.getBoundingClientRect();
      first.set(k, { x: r.left, y: r.top, g: group(el), vis: r.bottom > -m && r.top < vh + m });
    });
    (cfg.fadeNew || []).forEach((f, i) => document.querySelectorAll(f.items).forEach(el => firstExtra.add(i + '|' + f.key(el))));
  }
  motionCancel(channel);
  fn();
  if (!animate || !motionAllowed()) return;
  const vh = window.innerHeight, m = MOTION.margin;
  const moves = [], enters = [], seen = new Set();
  document.querySelectorAll(cfg.items).forEach(el => {
    const k = cfg.key(el);
    if (!k || seen.has(k)) return;
    seen.add(k);
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return;   // unsichtbar (display:none)
    const vis = r.bottom > -m && r.top < vh + m;
    const f = first.get(k);
    if (f) {
      if (f.g !== group(el)) return;
      const dx = f.x - r.left, dy = f.y - r.top;
      if ((Math.abs(dx) < 1 && Math.abs(dy) < 1) || (!vis && !f.vis)) return;
      moves.push({ el, dx, dy, vis });
    } else if (vis) enters.push(el);
  });
  (cfg.fadeNew || []).forEach((f, i) => document.querySelectorAll(f.items).forEach(el => {
    if (firstExtra.has(i + '|' + f.key(el))) return;
    const r = el.getBoundingClientRect();
    if (r.bottom > -m && r.top < vh + m) enters.push(el);
  }));
  const many = moves.length > MOTION.maxMoving;
  const dur = cfg.duration || MOTION.layout;
  const fadeIn = [{ opacity: 0, transform: `translateY(${MOTION.enterY}px)` }, { opacity: 1, transform: 'none' }];
  moves.forEach(({ el, dx, dy, vis }) => {
    if (many) { if (vis) motionTrack(channel, tx, el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MOTION.fade, easing: MOTION.ease })); return; }
    motionTrack(channel, tx, el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: dur, easing: MOTION.ease }));
  });
  enters.forEach(el => motionTrack(channel, tx, el.animate(fadeIn, { duration: MOTION.fade, easing: MOTION.ease })));
}

/* Rezeptkarten der Startseite (Raster und Liste, Handy und gross): Identität = Rezept-ID */
const MOTION_RECIPE_FLIP = {
  items: '[data-flip-id]',
  key: (el) => el.getAttribute('data-flip-id'),
  group: (el) => (el.parentElement ? el.parentElement.className : ''),
  duration: MOTION.layout,
};
function motionFlipRecipes(fn) {
  if (state.view !== 'home') { fn(); return; }
  motionFlip('recipes', fn, MOTION_RECIPE_FLIP);
}

/* Einkauf: nur «Erledigte nach unten». Identität = Artikel-ID; neu erscheinende Abschnittstitel blenden kurz ein. */
const MOTION_SHOP_FLIP = {
  items: '.shop-row[data-id]',
  key: (el) => el.getAttribute('data-id'),
  duration: MOTION.shop,
  fadeNew: [
    { items: '.shop-section-title', key: (el) => el.textContent.trim() },
    { items: '.shopping-all-checked', key: () => 'all' },
  ],
};
function motionFlipShopping(fn) { motionFlip('shop', fn, MOTION_SHOP_FLIP); }

/* ---------- Gleitende Auswahlfläche bei «Alle / Favoriten» ----------
   Eine aria-hidden Fläche (.seg-thumb) liegt hinter dem aktiven Knopf; Lage und Breite kommen aus dem
   tatsächlichen Knopf (offsetLeft/Width, unabhängig von :active-Skalierung). render() baut die Leiste neu: die
   alte Lage wird VOR dem Tausch gelesen (motionSegRect) und danach von dort zur neuen geführt. Erste Anzeige,
   Schriftladen, Drehen und Grössenwechsel setzen die Fläche ohne Bewegung neu. aria-pressed bleibt die Semantik,
   der Haken (::before) zusätzlich zur Farbe bleibt sichtbar. */
let _segRO = null, _segObserved = null, _segKey = '';
function motionSegKey(seg) { return Array.from(seg.querySelectorAll('.seg-btn')).map(b => b.offsetLeft + ':' + b.offsetWidth + ':' + b.offsetHeight + ':' + b.getAttribute('aria-pressed')).join('|'); }
function motionSegPlace(seg) {
  const thumb = seg && seg.querySelector(':scope > .seg-thumb');
  const btn = seg && seg.querySelector('.seg-btn[aria-pressed="true"]');
  if (!thumb) return null;
  if (!btn || !btn.offsetWidth) { thumb.hidden = true; seg.classList.remove('has-thumb'); return null; }
  thumb.hidden = false;
  thumb.style.width = btn.offsetWidth + 'px';
  thumb.style.height = btn.offsetHeight + 'px';
  thumb.style.transform = `translate(${btn.offsetLeft}px, ${btn.offsetTop}px)`;
  seg.classList.add('has-thumb');
  _segKey = motionSegKey(seg);
  return thumb;
}
function motionSegInit() {
  const seg = document.querySelector('.filter-bar .seg');
  if (!seg) { if (_segRO) { _segRO.disconnect(); _segObserved = null; } return; }
  let thumb = seg.querySelector(':scope > .seg-thumb');
  if (!thumb) {
    thumb = document.createElement('span');
    thumb.className = 'seg-thumb';
    thumb.setAttribute('aria-hidden', 'true');
    seg.insertBefore(thumb, seg.firstChild);
  }
  motionSegPlace(seg);
  if (_segObserved !== seg && typeof ResizeObserver === 'function') {
    if (!_segRO) _segRO = new ResizeObserver(() => {
      const s = _segObserved;
      if (!s || !s.isConnected || motionSegKey(s) === _segKey) return;   // nur echte Grössenwechsel (Drehen, Schrift, Fenster)
      motionCancel('seg'); motionSegPlace(s);
    });
    _segRO.disconnect();
    _segObserved = seg;
    _segRO.observe(seg);
    seg.querySelectorAll('.seg-btn').forEach(b => _segRO.observe(b));
  }
}
/* Sichtbare Lage der Fläche (inkl. laufender Bewegung), relativ zur Leiste */
function motionSegRect() {
  const seg = document.querySelector('.filter-bar .seg');
  const thumb = seg && seg.querySelector(':scope > .seg-thumb');
  if (!thumb || thumb.hidden) return null;
  const a = seg.getBoundingClientRect(), b = thumb.getBoundingClientRect();
  return { x: b.left - a.left - seg.clientLeft, y: b.top - a.top - seg.clientTop, w: b.width };
}
/* Nach dem Tausch: von der alten zur neuen Lage gleiten (180 ms); Breitenunterschied über width der Fläche, nie über den Text */
function motionSegSlide(prev) {
  motionCancel('seg');
  const seg = document.querySelector('.filter-bar .seg');
  const thumb = motionSegPlace(seg);
  if (!thumb || !prev || !motionAllowed()) return;
  const btn = seg.querySelector('.seg-btn[aria-pressed="true"]');
  const to = { x: btn.offsetLeft, y: btn.offsetTop, w: btn.offsetWidth };
  if (Math.abs(prev.x - to.x) < 1 && Math.abs(prev.w - to.w) < 1) return;
  const tx = ++_motionTx;
  motionTrack('seg', tx, thumb.animate([
    { transform: `translate(${prev.x}px, ${to.y}px)`, width: prev.w + 'px' },
    { transform: `translate(${to.x}px, ${to.y}px)`, width: to.w + 'px' },
  ], { duration: MOTION.select, easing: MOTION.ease }));
}

(function initMotionM1() {
  // Reduced Motion während der Sitzung eingeschaltet: laufende Bewegungen sofort beenden (Endzustand)
  try {
    const mq = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => { if (mq.matches) motionCancelAll(); };
    if (mq && mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq && mq.addListener) mq.addListener(onChange);
  } catch (e) { /* ohne matchMedia: nichts zu tun */ }
  // Hintergrund-Tab: nichts weiter animieren
  document.addEventListener('visibilitychange', () => { if (document.hidden) motionCancelAll(); });
  // Schrift geladen: Knopfbreiten können sich ändern, Auswahlfläche neu messen (ohne Bewegung)
  try { if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { const s = document.querySelector('.filter-bar .seg'); if (s) motionSegPlace(s); }); } catch (e) {}
})();
