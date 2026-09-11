/* ---------- PDF Editorial Engine: HTML-Templates (Punkt 43-49, 54-60) ----------
   Gemeinsame Bausteine (Meta, Zutaten, Zubereitung, Nutrition-Box) werden von allen Layouts
   genutzt, damit Typografie/Farben/Nummerierung ueberall identisch bleiben (Punkt 82) — nur
   Bildposition/-groesse und Spaltenaufteilung unterscheiden sich zwischen den Layouts. */

function pdfMetaLine(recipe) {
  const parts = [];
  if (recipe.timeMinutes) parts.push(recipe.timeMinutes + ' Min.');
  parts.push((recipe.servings || 1) + ' Portionen');
  if (recipe.difficulty) parts.push(escapeHtml(recipe.difficulty));
  return `<div class="pdf-meta">${parts.join(' · ')}</div>`;
}

function pdfIngredientsList(recipe, factor) {
  return `<div class="pdf-ing-title">Zutaten</div>
    <ul class="pdf-ing-list">
      ${(recipe.ingredients || []).filter((i) => i.name && i.name.trim()).map((i) => `<li class="pdf-safe-break"><strong>${(() => { const pa = parseAmount(i.amount); return pa !== null ? fmtAmount(pa * factor) + (i.unit ? ' ' + escapeHtml(i.unit) : '') : ''; })()}</strong> ${escapeHtml(i.name)}</li>`).join('')}
    </ul>`;
}

function pdfStepsList(recipe) {
  return `<div class="pdf-steps-title">Zubereitung</div>
    <ol class="pdf-step-list">
      ${(recipe.steps || []).filter((s) => s.text && s.text.trim()).map((s) => `<li class="pdf-safe-break">${escapeHtml(s.text)}</li>`).join('')}
    </ol>`;
}

/* Kompakte Nutrition-Box (Punkt 58-60) — bewusst zurueckhaltend, keine Fitness-App-Kacheln.
   `result` kommt bereits berechnet aus nutrition-calculator.js; fehlende Werte werden als "–"
   dargestellt statt als 0 (dieselbe Regel wie in der App-UI). */
function pdfNutritionBox(result) {
  if (!result) return '';
  const per = result.nutrientsPerPortion;
  const row = (key, label) => {
    const def = NUTRIENT_KEYS[key];
    const v = per[key];
    return `<span>${label || def.label} <strong>${v === null ? '–' : v + ' ' + def.unit}</strong></span>`;
  };
  const sourceLabel = result.sourceDataVersions && result.sourceDataVersions['swiss-fcd']
    ? 'Schweizer Nährwertdatenbank V' + result.sourceDataVersions['swiss-fcd'] : 'Berechnete Durchschnittswerte';
  return `<div class="pdf-nutrition-box pdf-safe-break">
    <div class="pdf-nutrition-title">Nährwerte · pro Portion</div>
    <div class="pdf-nutrition-row">
      ${row('energyKcal')}${row('protein')}${row('carbohydrates', 'Kohlenh.')}${row('fat')}${row('fiber', 'Ballaststoffe')}
    </div>
    <div class="pdf-nutrition-source">${escapeHtml(sourceLabel)} — Schätzwerte, keine medizinische Aussage.</div>
  </div>`;
}

function pdfNotesBlock(recipe) {
  if (!recipe.notes) return '';
  return `<div class="pdf-notes pdf-safe-break"><div class="pdf-steps-title">Notizen</div><p>${escapeHtml(recipe.notes)}</p></div>`;
}

function pdfHeaderTag(recipe) {
  return escapeHtml((recipe.tags || [])[0] || 'Savora');
}

/* ---------- Layout A: Cinematic Hero — Foto oben (35-45% der Seite), Inhalt darunter ---------- */
function pdfLayoutHero(recipe, imgUrl, result, factor) {
  return `<section class="pdf-page-recipe pdf-layout-hero">
    <div class="pdf-hero-photo"><img src="${imgUrl}" class="pdf-img-cover"></div>
    <div class="pdf-hero-body">
      <div class="pdf-header">${pdfHeaderTag(recipe)}</div>
      <h1 class="pdf-title">${escapeHtml(recipe.title)}</h1>
      ${pdfMetaLine(recipe)}
      <div class="pdf-cols">
        <div>${pdfIngredientsList(recipe, factor)}</div>
        <div>${pdfStepsList(recipe)}${pdfNotesBlock(recipe)}</div>
      </div>
      ${pdfNutritionBox(result)}
    </div>
    <div class="pdf-footer">Savora · Dein Kochbuch</div>
  </section>`;
}

/* ---------- Layout B/C: Editorial Split (Foto links oder rechts, Punkt 44-45) ---------- */
function pdfLayoutSplit(recipe, imgUrl, result, factor, side) {
  const photo = `<div class="pdf-split-photo"><img src="${imgUrl}" class="pdf-img-cover"></div>`;
  const body = `<div class="pdf-split-body">
      <div class="pdf-header">${pdfHeaderTag(recipe)}</div>
      <h1 class="pdf-title pdf-title-split">${escapeHtml(recipe.title)}</h1>
      ${pdfMetaLine(recipe)}
      ${pdfIngredientsList(recipe, factor)}
      ${pdfStepsList(recipe)}
      ${pdfNotesBlock(recipe)}
      ${pdfNutritionBox(result)}
    </div>`;
  return `<section class="pdf-page-recipe pdf-layout-split pdf-layout-split-${side}">
    ${side === 'left' ? photo + body : body + photo}
    <div class="pdf-footer pdf-footer-split">Savora · Dein Kochbuch</div>
  </section>`;
}

/* ---------- Layout D: Floating Photo — Foto neben Zutaten, gut fuer quadratische/kleine Bilder ---------- */
function pdfLayoutFloating(recipe, imgUrl, result, factor) {
  return `<section class="pdf-page-recipe pdf-layout-floating">
    <div class="pdf-header">${pdfHeaderTag(recipe)}</div>
    <h1 class="pdf-title">${escapeHtml(recipe.title)}</h1>
    ${pdfMetaLine(recipe)}
    <div class="pdf-floating-wrap">
      <div class="pdf-floating-photo"><img src="${imgUrl}" class="pdf-img-cover"></div>
      <div class="pdf-floating-ing">${pdfIngredientsList(recipe, factor)}</div>
    </div>
    ${pdfStepsList(recipe)}
    ${pdfNotesBlock(recipe)}
    ${pdfNutritionBox(result)}
    <div class="pdf-footer">Savora · Dein Kochbuch</div>
  </section>`;
}

/* ---------- Layout E: Full Photo Statement — grossflaechiges Foto, kurzer Text darunter ---------- */
function pdfLayoutFullStatement(recipe, imgUrl, result, factor) {
  return `<section class="pdf-page-recipe pdf-layout-full-statement">
    <div class="pdf-statement-photo"><img src="${imgUrl}" class="pdf-img-cover">
      <div class="pdf-statement-overlay">
        <h1 class="pdf-title pdf-title-statement">${escapeHtml(recipe.title)}</h1>
        ${pdfMetaLine(recipe)}
      </div>
    </div>
    <div class="pdf-statement-body">
      <div class="pdf-cols">
        <div>${pdfIngredientsList(recipe, factor)}</div>
        <div>${pdfStepsList(recipe)}${pdfNotesBlock(recipe)}</div>
      </div>
      ${pdfNutritionBox(result)}
    </div>
    <div class="pdf-footer">Savora · Dein Kochbuch</div>
  </section>`;
}

/* ---------- Layout G: Typography — kein Foto, eigenstaendige Textseite statt Platzhalter (Punkt 49) ---------- */
function pdfLayoutTypography(recipe, result, factor) {
  return `<section class="pdf-page-recipe pdf-layout-typography">
    <div class="pdf-header">${pdfHeaderTag(recipe)}</div>
    <h1 class="pdf-title pdf-title-typography">${escapeHtml(recipe.title)}</h1>
    ${pdfMetaLine(recipe)}
    <div class="pdf-typo-rule"></div>
    <div class="pdf-cols">
      <div>${pdfIngredientsList(recipe, factor)}</div>
      <div>${pdfStepsList(recipe)}${pdfNotesBlock(recipe)}</div>
    </div>
    ${pdfNutritionBox(result)}
    <div class="pdf-footer">Savora · Dein Kochbuch</div>
  </section>`;
}

/* Haupteinstieg: waehlt Layout deterministisch und baut das passende HTML. `imgDims` ist
   {width,height} des Originalbilds oder null (kein Foto -> Layout G, Punkt 49). */
function buildRecipePdfSection(recipe, imgUrl, imgDims, result, previousLayout) {
  const factor = 1; // PDF-Export nutzt immer die Basisportionen des Rezepts, keine Live-Skalierung
  if (!imgUrl || !imgDims) return { html: pdfLayoutTypography(recipe, result, factor), layout: 'typography' };
  const layout = selectPdfLayout(recipe, imgDims, previousLayout);
  const builders = {
    hero: () => pdfLayoutHero(recipe, imgUrl, result, factor),
    'split-left': () => pdfLayoutSplit(recipe, imgUrl, result, factor, 'left'),
    'split-right': () => pdfLayoutSplit(recipe, imgUrl, result, factor, 'right'),
    floating: () => pdfLayoutFloating(recipe, imgUrl, result, factor),
    'full-statement': () => pdfLayoutFullStatement(recipe, imgUrl, result, factor),
  };
  const build = builders[layout] || builders.hero;
  return { html: build(), layout };
}
