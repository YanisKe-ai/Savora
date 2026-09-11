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

  const hash = pdfLayoutHash((recipe.id || '') + '|' + Math.round(density));
  let choice = candidates[hash % candidates.length];
  if (previousLayout && choice === previousLayout && candidates.length > 1) {
    choice = candidates[(hash + 1) % candidates.length];
  }
  return choice;
}
