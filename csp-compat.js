/* v90: Ersatz fuer Inline-Ereignisattribute (onclick=, onerror=, onload=, onsubmit=, onchange=),
   damit die Inhaltsrichtlinie (CSP) ohne 'unsafe-inline' fuer Skripte auskommt.
   Als erstes App-Skript laden (defer), vor dem ersten Zeichnen.

   Markierungen im HTML:
   - data-stop-click             Klick steigt nicht weiter auf (wie onclick="event.stopPropagation()"),
                                 z. B. das Blatt eines Fensters, damit ein Tipp darin den Hintergrund nicht schliesst.
   - data-img-remove-on-error    Bild entfernt sich, wenn es nicht laedt (wie onerror="this.remove()").
   - data-img-loaded             Bild bekommt nach dem Laden die Klasse is-loaded (wie onload="this.classList.add('is-loaded')").
   - data-no-submit              Formular wird nie abgeschickt (wie onsubmit="return false").
   - data-change-fn="<Name>"     Beim Aendern wird die freigegebene Funktion mit dem Element aufgerufen
                                 (wie onchange="<Name>(this)"); nur Namen aus CSP_CHANGE_FNS. */
(function () {
  'use strict';
  var CSP_CHANGE_FNS = ['formYieldModeChanged'];
  var bound = typeof WeakSet === 'function' ? new WeakSet() : null;
  function stop(e) { e.stopPropagation(); }
  function bindStop(root) {
    if (!root || !root.querySelectorAll) return;
    var list = root.querySelectorAll('[data-stop-click]');
    for (var i = 0; i < list.length; i++) bindOne(list[i]);
    if (root.hasAttribute && root.hasAttribute('data-stop-click')) bindOne(root);
  }
  function bindOne(el) {
    if (bound) { if (bound.has(el)) return; bound.add(el); }
    else { if (el.__savoraStop) return; el.__savoraStop = 1; }
    el.addEventListener('click', stop);   // am Element selbst: Knoepfe darin reagieren zuerst, wie beim Inline-Attribut
  }
  function imgDone(img) {
    if (img.hasAttribute('data-img-loaded')) img.classList.add('is-loaded');
  }
  function imgFailed(img) {
    if (img.hasAttribute('data-img-remove-on-error')) img.remove();
  }
  // «load» und «error» steigen nicht auf; in der Capture-Phase am Dokument kommen sie trotzdem an.
  document.addEventListener('load', function (e) {
    var t = e.target; if (t && t.tagName === 'IMG') imgDone(t);
  }, true);
  document.addEventListener('error', function (e) {
    var t = e.target; if (t && t.tagName === 'IMG') imgFailed(t);
  }, true);
  document.addEventListener('submit', function (e) {
    var f = e.target; if (f && f.hasAttribute && f.hasAttribute('data-no-submit')) e.preventDefault();
  }, true);
  document.addEventListener('change', function (e) {
    var t = e.target; if (!t || !t.getAttribute) return;
    var name = t.getAttribute('data-change-fn');
    if (name && CSP_CHANGE_FNS.indexOf(name) >= 0 && typeof window[name] === 'function') window[name](t);
  }, true);   // Capture: auch ein change-Ereignis ohne bubbles (wie frueher onchange am Element) kommt an
  // Bilder, die schon fertig (oder kaputt) waren, bevor dieses Skript lief
  function sweepImages(root) {
    if (!root || !root.querySelectorAll) return;
    var imgs = root.querySelectorAll('img[data-img-loaded], img[data-img-remove-on-error]');
    for (var i = 0; i < imgs.length; i++) {
      var im = imgs[i];
      if (!im.complete) continue;
      if (im.naturalWidth > 0) imgDone(im); else if (im.getAttribute('src')) imgFailed(im);
    }
  }
  function start() {
    bindStop(document.body); sweepImages(document.body);
    if (typeof MutationObserver !== 'function') return;
    new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var added = records[i].addedNodes;
        for (var j = 0; j < added.length; j++) { if (added[j].nodeType === 1) bindStop(added[j]); }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  window.cspBindStopClick = bindStop;   // fuer Stellen, die ausserhalb des Body zeichnen (Tests)
})();
