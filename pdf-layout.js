/* ---------- PDF-Layoutgrundlagen: Bildmasse, Aufloesung, Hoehenmessung ----------
   (Die fruehere Layout-Auswahl hero/split/floating der alten Vorlagen A/B/C ist entfernt; die Seiten entstehen in pdf.js/pdf-templates.js.)
   Reine Berechnungsfunktionen, keine DOM-/html2canvas-Abhaengigkeit — daher direkt mit
   Playwright testbar (siehe Implementierungsbericht: Testmatrix aus Punkt 80 durchlaufen). Die
   tatsaechliche Bilddarstellung im gerenderten PDF-HTML nutzt CSS object-fit (contain/cover),
   was der Browser garantiert ohne Verzerrung rendert — fitImageToFrame() berechnet trotzdem die
   echten Masse, weil das Ergebnis (v.a. der Crop-Anteil) die LAYOUTWAHL steuert (Punkt 38: zu
   aggressiver Crop -> anderes Layout statt zu viel Bildinformation zu verlieren). */

/* ---------- 34/67: Bildmasse berechnen, OHNE je Breite/Hoehe unabhaengig zu verzerren ----------
   mode 'contain': ganzes Bild sichtbar, ggf. Weissraum (Punkt 37).
   mode 'cover': Rahmen fuellt sich komplett, ueberschuss wird collateral gecroppt (Punkt 37).
   Beide Modi leiten renderWidth/renderHeight aus EINEM Skalierungsfaktor ab, der die
   Quell-Seitenverhaeltnis-Relation erhaelt — eine Verzerrung ist dadurch strukturell ausgeschlossen. */
function fitImageToFrame(sourceWidth, sourceHeight, frameWidth, frameHeight, mode) {
  if (!sourceWidth || !sourceHeight || !frameWidth || !frameHeight) {
    return { renderWidth: frameWidth || 0, renderHeight: frameHeight || 0, offsetX: 0, offsetY: 0, crop: 0 };
  }
  const sourceAR = sourceWidth / sourceHeight;
  const frameAR = frameWidth / frameHeight;
  let renderWidth, renderHeight;

  if (mode === 'cover') {
    if (sourceAR > frameAR) { renderHeight = frameHeight; renderWidth = frameHeight * sourceAR; }
    else { renderWidth = frameWidth; renderHeight = frameWidth / sourceAR; }
  } else { // 'contain' (Default)
    if (sourceAR > frameAR) { renderWidth = frameWidth; renderHeight = frameWidth / sourceAR; }
    else { renderHeight = frameHeight; renderWidth = frameHeight * sourceAR; }
  }

  const offsetX = (frameWidth - renderWidth) / 2;
  const offsetY = (frameHeight - renderHeight) / 2;

  // Crop-Anteil (nur bei 'cover' > 0): welcher Flaechenanteil des Quellbilds faellt aus dem
  // sichtbaren Rahmen heraus? 0 = nichts wird abgeschnitten, 1 = theoretisch alles.
  const visibleWFrac = Math.min(1, frameWidth / renderWidth);
  const visibleHFrac = Math.min(1, frameHeight / renderHeight);
  const crop = mode === 'cover' ? 1 - (visibleWFrac * visibleHFrac) : 0;

  return { renderWidth, renderHeight, offsetX, offsetY, crop };
}

/* ---------- 35: Seitenverhaeltnis-Klassifizierung ---------- */
function classifyAspectRatio(width, height) {
  if (!width || !height) return 'unknown';
  const ar = width / height;
  if (ar < 0.55) return 'very-tall-portrait';
  if (ar < 0.85) return 'portrait';
  if (ar <= 1.15) return 'square';
  if (ar <= 1.65) return 'landscape';
  return 'wide-landscape';
}

/* ---------- 41: Aufloesung fuer ein grosses Layout ausreichend? ----------
   Effektive DPI beim Zieldruckmass (mm) — unter MIN_PRINT_DPI wird ein kleineres Bildlayout
   gewaehlt statt aggressiv hochzuskalieren. 150 DPI ist der uebliche Schwellenwert fuer noch
   akzeptablen Fotodruck (300 DPI ist "gestochen scharf", darunter faengt es an, weich zu wirken;
   unter 100 DPI sichtbar pixelig) — bewusst kein erfundener Wert, sondern Standard-Druckmass. */
const MIN_PRINT_DPI = 100;
function imageResolutionSufficientForFrame(sourceWidth, frameWidthMm) {
  if (!sourceWidth || !frameWidthMm) return false;
  const dpi = sourceWidth / (frameWidthMm / 25.4);
  return dpi >= MIN_PRINT_DPI;
}

/* ---------- Reparatur-Auftrag Teil C/D: echte Hoehenmessung statt Annahme ----------
   1mm entspricht bei CSS-mm-Einheiten immer 96/25.4 Referenzpixeln (Browser-Standard,
   unabhaengig von Geraet/Zoom) — deshalb ist eine DOM-Messung in Pixeln zuverlaessig in
   mm umrechenbar, ohne echtes Rendering/Druckvorschau zu brauchen (Punkt 39). */
const MM_PX = 96 / 25.4;
const PAGE_HEIGHT_MM = 297;
/* Nur noch Subpixel-Rundung (0,3 mm). Vorher 2 mm: Seiten bis 299 mm galten als «passt», das Raster war
   dann bis zu 2 mm hoeher als die A4-Seite und der untere Rand (Fusszeile) wurde im PDF abgeschnitten. */
const PAGE_FIT_TOLERANCE_MM = 0.3;
/* v87: zusaetzliche Reserve der Planung in mm (Standard 0). pdf.js erhoeht sie nur fuer ein Rezept, dessen Seite im Druckbereich
   trotz Planung hoeher als A4 war, und plant es dann neu (statt die Seite im Raster zu schneiden). */
let PDF_FIT_SAFETY_MM = 0;
/* v87: Textvergroesserung des Browsers abschalten. Ursache der zu grossen Schrift (Analyse Punkt 2): Safari auf dem iPhone vergroessert
   Fliesstext in Bloecken, die breiter als der Bildschirm sind (Text-Autosizing). Die PDF-Seiten sind 210 mm = 794 px breit, das iPhone
   390 px: Zubereitung und Notizen wurden mit etwa 1,5-facher Schrift gemessen und teils auch so gerastert. WebKit laesst Bloecke mit
   fester Hoehe aus, darum waren nur die Seiten gross, die nicht in 297 mm passten (keine feste Hoehe, pdf.js pdfRasterizeSection).
   text-size-adjust: 100% schaltet das fuer Messflaeche, Druckbereich und den html2canvas-Klon ab; auf dem Mac/Chrome ohne Wirkung.
   v88: Gilt fuer JEDE Messung im Druckbereich, auch die Nachmessung pdfOverflowByRecipe (pdf.js) vor dem Rastern. Dort fehlte es:
   Safari mass den Fliesstext mit 22 bis 24 px statt 14,67 px, plante mit falscher Reserve neu und brach alle Rezepte zu frueh um. */
const PDF_NO_AUTOSIZE_CSS = '-webkit-text-size-adjust:100%;text-size-adjust:100%;';
function pdfNoAutosize(el) {
  if (!el || !el.style) return;
  el.style.setProperty('-webkit-text-size-adjust', '100%');
  el.style.setProperty('text-size-adjust', '100%');
}

let _pdfProbeEl = null;
function pdfMeasureProbe() {
  if (!_pdfProbeEl || !document.body.contains(_pdfProbeEl)) {
    _pdfProbeEl = document.createElement('div');
    _pdfProbeEl.id = 'pdfMeasureProbe';
    // Punkt 39: unsichtbar rendern (ausserhalb des Sichtbereichs, nicht display:none — sonst
    // liefert der Browser 0 als Hoehe), tatsaechliche Hoehe messen, danach wieder leeren.
    _pdfProbeEl.style.cssText = 'position:fixed;left:-9999px;top:0;width:210mm;' + PDF_NO_AUTOSIZE_CSS;
    document.body.appendChild(_pdfProbeEl);
  }
  return _pdfProbeEl;
}

/* Kopf-/Fusszeilentexte kontrolliert begrenzen statt per CSS-overflow abzuschneiden: hoechstens
   maxLines Zeilen, sonst am Wortende mit «…» kuerzen (der vollstaendige Titel steht am Rezeptanfang). */
function pdfClampText(el, maxLines) {
  if (!el || !el.textContent) return;
  const cs = getComputedStyle(el);
  const lh = parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) || 12) * 1.3;
  const limit = lh * maxLines + 1;
  if (el.getBoundingClientRect().height <= limit) return;
  const full = el.dataset.fullText || el.textContent;
  el.dataset.fullText = full;
  let lo = 1, hi = full.length, best = 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    el.textContent = full.slice(0, mid).trimEnd() + '…';
    if (el.getBoundingClientRect().height <= limit) { best = mid; lo = mid + 1; } else hi = mid - 1;
  }
  let cut = full.slice(0, best);
  const sp = cut.lastIndexOf(' ');
  if (sp > best * 0.6) cut = cut.slice(0, sp);
  el.textContent = cut.replace(/[\s,.;:\/\-–·]+$/, '') + '…';
  el.title = full;
}
function pdfClampFrameText(root) {
  if (!root || !root.querySelectorAll) return;
  root.querySelectorAll('.pv-foot span, .pv-cont-head > span').forEach((e) => pdfClampText(e, 2));
}

/* Hilfsfunktion: HTML in die Messfläche setzen, fn(Seitenelement) ausfuehren, Flaeche leeren. */
function pdfWithProbe(html, fn) {
  const probe = pdfMeasureProbe();
  probe.innerHTML = html;
  const el = probe.firstElementChild;
  let out = null;
  try { out = el ? fn(el, probe) : null; } finally { probe.innerHTML = ''; }
  return out;
}

/* Muss erst NACH document.fonts.ready aufgerufen werden (Punkt 124-125) — sonst misst man mit
   dem Fallback-Font, waehlt anhand dessen ein Layout, und der Text verschiebt sich, sobald Baloo 2
   nachlaedt ("verbotener Ablauf", Punkt 125). Die Aufrufer in pdf.js stellen das sicher.
   Gemessen wird die echte (gebrochene) Inhaltshoehe der Seite OHNE Mindesthoehe: Seitenrand oben, Inhalt
   und der reservierte Fussbereich unten (padding-bottom). Passt sie in 297 mm, passt der Inhalt in den
   Hauptbereich. Kein scrollHeight (ganzzahlig gerundet). */
function measureSectionHeightMm(html) {
  return pdfWithProbe(html, (el) => {
    el.style.minHeight = '0';
    pdfClampFrameText(el);
    return el.getBoundingClientRect().height / MM_PX;
  }) || 0;
}

function cleanupPdfMeasureProbe() {
  if (_pdfProbeEl && _pdfProbeEl.parentNode) _pdfProbeEl.parentNode.removeChild(_pdfProbeEl);
  _pdfProbeEl = null;
}

function candidateFitsOnePage(html) {
  return measureSectionHeightMm(html) <= PAGE_HEIGHT_MM + PAGE_FIT_TOLERANCE_MM - PDF_FIT_SAFETY_MM;
}
