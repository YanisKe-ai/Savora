/* ---------- Bewegung M2: Cover-Wechsel ohne Flackern, Kochbuch-Schritte ruhig wechseln ----------
   Geladen NACH cover-editor.js (vor ui.js / actions-v2.js). Eigene kleine Helfer, bis der zentrale Helfer
   (motion.js, Bewegung M1) sie uebernimmt. Tokens aus MOTION_TOKENS.json (coverCrossfade, cookbookStep).

   Grundsaetze
   - Animation ist nur Zugabe: Zustand, Speichern, Fokus und DOM-Tausch passieren sofort und synchron.
     Nichts wartet auf animation.finished.
   - Nur opacity und transform. Keine Dauer ueber 220 ms. Easing cubic-bezier(0.2, 0.8, 0.2, 1).
   - Bewegung reduzieren (beim Start und waehrend der Sitzung), verborgener Tab oder fehlende
     Web Animations API: sofort der Endzustand.
   - Ein laufender Uebergang wird bei jedem neuen Wechsel kontrolliert beendet (Eigentuemer-Token);
     abgelehnte finished-Promises werden abgefangen (keine unhandledrejection).

   Cover (Punkt 2)
   - Die sichtbare Vorschau ist immer canvas.ce-canvas (gleiches Element, gleiche Zeichenfunktion coverDraw
     wie der Export). Bei einem diskreten Wechsel (Vorlage, Art, Bild) zeichnet cePaint das neue Cover
     vollstaendig in eine zweite, unsichtbare Ebene, erst wenn Schrift und Bilder geladen sind.
     motionCoverSwap blendet diese Ebene als Ganzes (Hintergrund, Text, Logo zusammen) in 180 ms ueber das
     alte Bild und uebertraegt sie danach in die Hauptebene. Die Zusatzebene wird danach entfernt und ihr
     Speicher freigegeben (width/height 0).
   - Welche Arbeit aktuell ist, entscheidet allein das Token des Editors (ce.paintTok). Hier gibt es nur
     den Besitzer der Zusatzebene (_mcSwap), damit ein spaeteres Aufraeumen keinen neueren Wechsel trifft.

   Kochbuch-Schritte (Punkt 5)
   - motionCookbookStep(von, nach, renderFn): sichtbaren Inhalt (ohne Schrittleiste und Fussleiste) als
     nicht bedienbare Kopie festhalten (aria-hidden, inert, ohne IDs), renderFn() sofort ausfuehren,
     Kopie in 90 ms ausblenden, neuen Inhalt in 160 ms (Start nach 60 ms) von 12 px rechts (rueckwaerts:
     links) einblenden. Gesamt 220 ms. Keine View Transition (gleiche Ansicht). */

const MC_EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const MC_COVER_MS = 180;
const MC_STEP = { outMs: 90, inMs: 160, inDelay: 60, x: 12, outX: 6 };

function mcReduced() { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
function mcCanAnimate(el) { return !!(el && typeof el.animate === 'function') && !mcReduced() && document.visibilityState !== 'hidden'; }
function mcQuiet(anim) { if (anim && anim.finished && anim.finished.catch) anim.finished.catch(() => {}); return anim; }
function mcRelease(c) { if (c) { try { c.width = 0; c.height = 0; } catch (e) { /* egal */ } if (c.parentNode) c.parentNode.removeChild(c); } }

/* ---------- Cover: zwei gepufferte Ebenen ---------- */
let _mcSwap = null;   // { cv, next, anim }

/* Laufende Ueberblendung sofort abschliessen: neues Bild steht danach in der Hauptebene. */
function motionCoverCommit() {
  const s = _mcSwap; if (!s) return;
  _mcSwap = null;
  if (s.anim) { try { s.anim.cancel(); } catch (e) { /* egal */ } }
  if (s.cv && s.cv.isConnected && s.next) {
    if (s.cv.width !== s.next.width) s.cv.width = s.next.width;
    if (s.cv.height !== s.next.height) s.cv.height = s.next.height;
    const x = s.cv.getContext('2d'); x.clearRect(0, 0, s.cv.width, s.cv.height); x.drawImage(s.next, 0, 0);
  }
  mcRelease(s.next);
}

/* next: fertig gezeichnetes Canvas (gleiche Pixelgroesse wie die Vorschau). Ohne Animation wird sofort uebernommen. */
function motionCoverSwap(cv, next) {
  motionCoverCommit();
  if (!cv || !next) { mcRelease(next); return; }
  _mcSwap = { cv, next, anim: null };
  if (!mcCanAnimate(next) || !cv.parentNode) { motionCoverCommit(); return; }
  next.className = 'ce-canvas-next';
  next.setAttribute('aria-hidden', 'true');
  next.setAttribute('data-motion-layer', 'cover');
  cv.after(next);   // ueber dem alten Bild, unter der Bedienebene
  const s = _mcSwap;
  s.anim = mcQuiet(next.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MC_COVER_MS, easing: MC_EASE, fill: 'both' }));
  s.anim.onfinish = () => { if (_mcSwap === s) motionCoverCommit(); };
}
function motionCoverBusy() { return !!_mcSwap; }

/* ---------- Kochbuch-Schritte ---------- */
let _mcStep = { tok: 0, ghost: null, anims: [], main: null, at: 0 };

function mcStepFinish() {
  const s = _mcStep;
  s.anims.forEach((a) => { try { a.cancel(); } catch (e) { /* egal */ } });
  s.anims = [];
  if (s.ghost) { s.ghost.querySelectorAll('canvas').forEach(c => { c.width = 0; c.height = 0; }); s.ghost.remove(); s.ghost = null; }
  if (s.main) { s.main.classList.remove('cb-anim'); s.main = null; }
}
function mcStepContent(main) {
  return main ? Array.from(main.children).filter(n => !n.classList.contains('cb-steps') && !n.classList.contains('cb-step-footer') && !n.hasAttribute('data-motion-ghost')) : [];
}
/* Doppelklick auf Weiter/Zurueck (gleiche Stelle, neuer Knopf) soll keinen Schritt ueberspringen */
function motionStepIgnore(el, e) {
  if (!el || !el.closest || !el.closest('.cb-step-footer')) return false;
  if (e && e.detail >= 2) return true;
  return !!(e && e.detail >= 1 && Date.now() - _mcStep.at < 300);
}

function motionCookbookStep(from, to, renderFn) {
  const tok = ++_mcStep.tok;
  mcStepFinish();
  _mcStep.at = Date.now();
  const oldMain = document.querySelector('main.cookbook-main');
  const dir = to > from ? 1 : to < from ? -1 : 0;
  const anim = dir !== 0 && mcCanAnimate(oldMain);
  let ghost = null, oldW = 0;
  if (anim) {
    const parts = mcStepContent(oldMain);
    if (parts.length) {
      oldW = parts[0].offsetWidth;
      ghost = document.createElement('div');
      ghost.className = 'cb-step-ghost';
      ghost.setAttribute('aria-hidden', 'true'); ghost.setAttribute('data-motion-ghost', '');
      ghost.inert = true; ghost.setAttribute('inert', '');
      parts.forEach((p) => {
        const c = p.cloneNode(true);
        // Gezeichnete Vorschauen mitnehmen, alles andere stumm: keine IDs, nichts fokussierbar
        const src = p.querySelectorAll('canvas'), dst = c.querySelectorAll('canvas');
        dst.forEach((d, i) => { const o = src[i]; try { if (o && o.width && o.height) { d.width = o.width; d.height = o.height; d.getContext('2d').drawImage(o, 0, 0); } } catch (e) { /* leer lassen */ } });
        c.querySelectorAll('[id]').forEach(n => n.removeAttribute('id')); c.removeAttribute('id');
        c.querySelectorAll('[aria-live], [role="status"], [role="alert"]').forEach(n => { n.removeAttribute('aria-live'); n.removeAttribute('role'); });
        c.querySelectorAll('[name]').forEach(n => n.removeAttribute('name'));
        ghost.appendChild(c);
      });
    }
  }
  renderFn();   // sofort und synchron: Zustand, DOM, Fokus haengen nie an der Animation
  if (!anim || tok !== _mcStep.tok) { if (ghost) ghost.remove(); return; }
  const main = document.querySelector('main.cookbook-main');
  const parts = mcStepContent(main);
  if (!main || !parts.length || !mcCanAnimate(main)) return;
  _mcStep.main = main; main.classList.add('cb-anim');
  const opts = (d, delay) => ({ duration: d, delay: delay || 0, easing: MC_EASE, fill: 'backwards' });
  if (ghost) {
    const top = parts[0].offsetTop, left = parts[0].offsetLeft;
    ghost.style.top = top + 'px'; ghost.style.left = left + 'px'; ghost.style.width = (oldW || parts[0].offsetWidth) + 'px';
    ghost.style.maxHeight = Math.max(0, main.clientHeight - top) + 'px';
    main.appendChild(ghost); _mcStep.ghost = ghost;
    _mcStep.anims.push(mcQuiet(ghost.animate([{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: `translateX(${-dir * MC_STEP.outX}px)` }], { duration: MC_STEP.outMs, easing: MC_EASE, fill: 'forwards' })));
  }
  parts.forEach((p) => {
    _mcStep.anims.push(mcQuiet(p.animate([{ opacity: 0, transform: `translateX(${dir * MC_STEP.x}px)` }, { opacity: 1, transform: 'translateX(0)' }], opts(MC_STEP.inMs, MC_STEP.inDelay))));
  });
  // Gemeinsamer, fester Start ab Ende des Neuzeichnens: sonst wartet Chrome bei Compositor-Animationen ein bis drei Frames
  // auf die Startmeldung (auf langsamen Rechnern mehr), und der Wechsel endet spuerbar spaeter als 220 ms.
  const start = document.timeline && document.timeline.currentTime != null ? performance.now() : null;
  if (start != null) _mcStep.anims.forEach((a) => { try { a.startTime = start; } catch (e) { /* Browser setzt selbst */ } });
  const last = _mcStep.anims[_mcStep.anims.length - 1];
  last.finished.then(() => { if (tok === _mcStep.tok) mcStepFinish(); }, () => {});
}

/* Bewegung reduzieren waehrend der Sitzung, Tab verborgen, Seite verlassen: sofort Endzustand */
(function () {
  const done = () => { motionCoverCommit(); mcStepFinish(); };
  try {
    const mq = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
    if (mq) { if (mq.addEventListener) mq.addEventListener('change', () => { if (mq.matches) done(); }); else if (mq.addListener) mq.addListener(() => { if (mq.matches) done(); }); }
  } catch (e) { /* ohne matchMedia: nichts zu tun */ }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') done(); });
  window.addEventListener('pagehide', done);
})();
