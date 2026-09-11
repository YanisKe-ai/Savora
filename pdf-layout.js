/* ---------- PDF Editorial Engine: Bild-Fitting & Layout-Auswahl (Punkt 33-52, 67, 80) ----------
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

/* ---------- 50-52: Layout-Auswahl ----------
   Layouts (siehe pdf-templates.js fuer die HTML-Umsetzung):
   hero, split-left, split-right, floating, full-statement, typography (kein Foto) */
const PDF_LAYOUTS = ['hero', 'split-left', 'split-right', 'floating', 'full-statement'];

// Stabiler, einfacher String-Hash (keine Kryptographie noetig) fuer die deterministische Auswahl —
// derselbe Rezept-Stand ergibt IMMER dasselbe Layout (Punkt 51), aendert sich der Inhalt
// (recipeId + Bild + grobe Textmenge fliessen ein), darf sich auch das Layout aendern.
function pdfLayoutHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function contentDensity(recipe) {
  const ingCount = (recipe.ingredients || []).filter((i) => i.name && i.name.trim()).length;
  const stepChars = (recipe.steps || []).reduce((sum, s) => sum + ((s.text || '').length), 0);
  return ingCount + stepChars / 90; // grobe Gewichtung: ~90 Zeichen Zubereitungstext ~= 1 Zutat an "Platzbedarf"
}

/* Ermittelt die fuer ein Bild-Seitenverhaeltnis grundsaetzlich sinnvollen Layout-Kandidaten
   (Punkt 43-48) — die eigentliche Auswahl daraus ist deterministisch, nicht zufaellig-chaotisch
   (Punkt 51). */
function candidateLayoutsForAspect(aspect, density, resolutionOk) {
  // Punkt 41: reicht die Aufloesung fuer ein grossflaechiges Layout nicht, wird IMMER das
  // kleinste Bild-Layout gewaehlt (Floating, 62mm-Box) statt ein Foto in einem grossen Rahmen
  // hochzuskalieren — unabhaengig vom Seitenverhaeltnis. Das war zuvor ein echter Bug: ein
  // 400px breites Bild landete trotzdem im 210mm-breiten Hero-Layout.
  if (!resolutionOk) return ['floating'];
  if (aspect === 'wide-landscape' || aspect === 'landscape') {
    const list = ['hero'];
    if (density < 9) list.push('full-statement'); // Punkt 47: nur bei kurzem Rezept + gutem Foto
    return list;
  }
  if (aspect === 'portrait' || aspect === 'very-tall-portrait') return ['split-left', 'split-right'];
  if (aspect === 'square') return ['floating', 'split-left', 'split-right'];
  return ['hero'];
}

/* ---------- Reparatur-Auftrag Teil C/D: echte Hoehenmessung statt Annahme ----------
   1mm entspricht bei CSS-mm-Einheiten immer 96/25.4 Referenzpixeln (Browser-Standard,
   unabhaengig von Geraet/Zoom) — deshalb ist eine DOM-Messung in Pixeln zuverlaessig in
   mm umrechenbar, ohne echtes Rendering/Druckvorschau zu brauchen (Punkt 39). */
const MM_PX = 96 / 25.4;
const PAGE_HEIGHT_MM = 297;
const PAGE_FIT_TOLERANCE_MM = 2; // Rundungstoleranz, keine Ausrede fuer Ueberlauf

let _pdfProbeEl = null;
function pdfMeasureProbe() {
  if (!_pdfProbeEl || !document.body.contains(_pdfProbeEl)) {
    _pdfProbeEl = document.createElement('div');
    _pdfProbeEl.id = 'pdfMeasureProbe';
    // Punkt 39: unsichtbar rendern (ausserhalb des Sichtbereichs, nicht display:none — sonst
    // liefert der Browser 0 als Hoehe), tatsaechliche Hoehe messen, danach wieder leeren.
    _pdfProbeEl.style.cssText = 'position:fixed;left:-9999px;top:0;width:210mm;';
    document.body.appendChild(_pdfProbeEl);
  }
  return _pdfProbeEl;
}

/* Muss erst NACH document.fonts.ready aufgerufen werden (Punkt 124-125) — sonst misst man mit
   dem Fallback-Font, waehlt anhand dessen ein Layout, und der Text verschiebt sich, sobald Baloo 2
   nachlaedt ("verbotener Ablauf", Punkt 125). Die Aufrufer in pdf.js stellen das sicher. */
function measureSectionHeightMm(html) {
  const probe = pdfMeasureProbe();
  probe.innerHTML = html;
  const el = probe.firstElementChild;
  const heightMm = el ? el.scrollHeight / MM_PX : 0;
  probe.innerHTML = '';
  return heightMm;
}

function cleanupPdfMeasureProbe() {
  if (_pdfProbeEl && _pdfProbeEl.parentNode) _pdfProbeEl.parentNode.removeChild(_pdfProbeEl);
  _pdfProbeEl = null;
}

function candidateFitsOnePage(html) {
  return measureSectionHeightMm(html) <= PAGE_HEIGHT_MM + PAGE_FIT_TOLERANCE_MM;
}

/* ---------- 49: Crop-Limit ----------
   fitImageToFrame() lieferte den Crop-Anteil bisher nur zur Dokumentation, ohne dass er irgendwo
   die Layoutwahl beeinflusste (toter Wert). Wird jetzt als Sicherheitsnetz genutzt: nur wenn ein
   Cover-Crop wirklich extrem waere (z.B. eine sehr schmale Bildaufloesung mit einem stark
   abweichenden Seitenverhaeltnis, das durch classifyAspectRatio grob in einen Eimer faellt, der
   fuer dieses konkrete Bild trotzdem schlecht passt), wird der Kandidat verworfen — bewusst ein
   hoher Schwellenwert, damit normale Portrait-/Quadrat-Fotos in Split/Floating (deren Rahmen
   inhaerent schmal bzw. quadratisch sind) NICHT faelschlich abgelehnt werden. */
const PDF_LAYOUT_FRAME_MM = {
  hero: { w: 210, h: 115 },
  'split-left': { w: 88, h: 297 },
  'split-right': { w: 88, h: 297 },
  floating: { w: 62, h: 62 },
  'full-statement': { w: 210, h: 150 },
};
const MAX_ACCEPTABLE_CROP = 0.75;

function cropFractionForLayout(layoutName, sourceWidth, sourceHeight) {
  const frame = PDF_LAYOUT_FRAME_MM[layoutName];
  if (!frame || !sourceWidth || !sourceHeight) return 0;
  return fitImageToFrame(sourceWidth, sourceHeight, frame.w, frame.h, 'cover').crop;
}

/* Haupteinstiegspunkt. `previousLayout` (optional) ist das zuletzt vergebene Layout beim
   Kochbuch-Export (Punkt 52) — bei mehreren moeglichen Kandidaten wird eine Wiederholung
   vermieden, damit aufeinanderfolgende Seiten nicht identisch wirken. */
function selectPdfLayout(recipe, imageDims, previousLayout) {
  if (!imageDims || !imageDims.width || !imageDims.height) return 'typography'; // Punkt 49
  const aspect = classifyAspectRatio(imageDims.width, imageDims.height);
  const density = contentDensity(recipe);
  // 45-48% Seitenbreite typische Bildframe-Breite in den Split-/Hero-Layouts -> grober Richtwert
  // fuer die Aufloesungspruefung; bei "full-statement" ist das Bild praktisch seitenfuellend.
  const resolutionOk = imageResolutionSufficientForFrame(imageDims.width, 210);
  let candidates = candidateLayoutsForAspect(aspect, density, resolutionOk);
  if (!candidates.length) candidates = ['hero'];

  // Punkt 49: extremen Crop verwerfen, aber nie auf null Kandidaten enden — im Zweifel den mit
  // dem geringsten Crop-Anteil behalten, statt gar kein Foto-Layout mehr anzubieten.
  const withCrop = candidates.map((c) => ({ name: c, crop: cropFractionForLayout(c, imageDims.width, imageDims.height) }));
  const acceptable = withCrop.filter((c) => c.crop <= MAX_ACCEPTABLE_CROP).map((c) => c.name);
  candidates = acceptable.length ? acceptable : [withCrop.slice().sort((a, b) => a.crop - b.crop)[0].name];

  const hash = pdfLayoutHash((recipe.id || '') + '|' + Math.round(density));
  let choice = candidates[hash % candidates.length];
  if (previousLayout && choice === previousLayout && candidates.length > 1) {
    choice = candidates[(hash + 1) % candidates.length];
  }
  return choice;
}
