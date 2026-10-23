/* v90: Farbschema vor dem ersten Bild setzen (bisher Inline-Skript in index.html; fuer die
   Inhaltsrichtlinie CSP ohne 'unsafe-inline' ausgelagert). Synchron im <head> laden, nicht defer,
   sonst blitzt beim Start kurz das helle Schema auf. */
(function () {
  try {
    var t = localStorage.getItem('savora-theme');
    if (t === 'amoled') t = 'dark';
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}

  /* PDF-Seitenstile laden nicht blockierend (media="print") und gelten danach fuer alle Medien.
     Ersetzt onload="this.media='all'" am <link data-print-css>. «load» steigt nicht auf, wird
     aber in der Capture-Phase am Dokument gesehen; zur Sicherheit spaetestens beim Seiten-«load». */
  function allMedia(l) { if (l && l.media !== 'all') l.media = 'all'; }
  document.addEventListener('load', function (e) {
    var t = e.target;
    if (t && t.tagName === 'LINK' && t.hasAttribute('data-print-css')) allMedia(t);
  }, true);
  window.addEventListener('load', function () {
    var ls = document.querySelectorAll('link[data-print-css]');
    for (var i = 0; i < ls.length; i++) allMedia(ls[i]);
  });
})();
