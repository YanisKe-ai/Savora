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
   dargestellt statt als 0 (dieselbe Regel wie in der App-UI). `detailLevel`: 'compact' (5
   Kernwerte) oder 'full' (zusaetzlich Zucker, gesaettigte Fettsaeuren, Salz — Punkt 59). */
function pdfNutritionBox(result, detailLevel) {
  if (!result) return '';
  const per = result.nutrientsPerPortion;
  const row = (key, label) => {
    const def = NUTRIENT_KEYS[key];
    const v = per[key];
    return `<span>${label || def.label} <strong>${v === null ? '–' : v + ' ' + def.unit}</strong></span>`;
  };
  const sourceLabel = nutritionSourceLabel(result.sourceDataVersions);
  const extraRow = detailLevel === 'full'
    ? `<div class="pdf-nutrition-row pdf-nutrition-row-extra">${row('sugars', 'Zucker')}${row('saturatedFat', 'ges. Fett')}${row('salt')}</div>`
    : '';
  return `<div class="pdf-nutrition-box pdf-safe-break">
    <div class="pdf-nutrition-title">Nährwerte · pro Portion</div>
    <div class="pdf-nutrition-row">
      ${row('energyKcal')}${row('protein')}${row('carbohydrates', 'Kohlenh.')}${row('fat')}${row('fiber', 'Ballaststoffe')}
    </div>
    ${extraRow}
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

/* Punkt 50: nutzt recipe.focalPoint, falls vorhanden (Datenmodell-Vorbereitung, siehe
   emptyRecipe() in state.js) — ohne gesetzten Fokuspunkt entspricht das exakt dem bisherigen
   mittigen Crop, aendert also nichts am Aussehen bestehender Rezepte. */
function pdfImgTag(imgUrl, recipe) {
  const fp = recipe && recipe.focalPoint;
  const x = fp && typeof fp.x === 'number' ? Math.round(fp.x * 100) : 50;
  const y = fp && typeof fp.y === 'number' ? Math.round(fp.y * 100) : 50;
  return `<img src="${imgUrl}" class="pdf-img-cover" style="object-position:${x}% ${y}%;">`;
}

/* ---------- Layout A: Cinematic Hero — Foto oben (35-45% der Seite), Inhalt darunter ---------- */
function pdfLayoutHero(recipe, imgUrl, result, factor, nutritionDetail) {
  return `<section class="pdf-page-recipe pdf-layout-hero">
    <div class="pdf-hero-photo">${pdfImgTag(imgUrl, recipe)}</div>
    <div class="pdf-hero-body">
      <div class="pdf-header">${pdfHeaderTag(recipe)}</div>
      <h1 class="pdf-title">${escapeHtml(recipe.title)}</h1>
      ${pdfMetaLine(recipe)}
      <div class="pdf-cols">
        <div>${pdfIngredientsList(recipe, factor)}</div>
        <div>${pdfStepsList(recipe)}${pdfNotesBlock(recipe)}</div>
      </div>
      ${pdfNutritionBox(result, nutritionDetail)}
    </div>
    <div class="pdf-footer">Savora · Dein Kochbuch</div>
  </section>`;
}

/* ---------- Layout B/C: Editorial Split (Foto links oder rechts, Punkt 44-45) ---------- */
function pdfLayoutSplit(recipe, imgUrl, result, factor, side, nutritionDetail) {
  const photo = `<div class="pdf-split-photo">${pdfImgTag(imgUrl, recipe)}</div>`;
  const body = `<div class="pdf-split-body">
      <div class="pdf-header">${pdfHeaderTag(recipe)}</div>
      <h1 class="pdf-title pdf-title-split">${escapeHtml(recipe.title)}</h1>
      ${pdfMetaLine(recipe)}
      ${pdfIngredientsList(recipe, factor)}
      ${pdfStepsList(recipe)}
      ${pdfNotesBlock(recipe)}
      ${pdfNutritionBox(result, nutritionDetail)}
    </div>`;
  return `<section class="pdf-page-recipe pdf-layout-split pdf-layout-split-${side}">
    ${side === 'left' ? photo + body : body + photo}
    <div class="pdf-footer pdf-footer-split">Savora · Dein Kochbuch</div>
  </section>`;
}

/* ---------- Layout D: Floating Photo — Foto neben Zutaten, gut fuer quadratische/kleine Bilder ---------- */
function pdfLayoutFloating(recipe, imgUrl, result, factor, nutritionDetail) {
  return `<section class="pdf-page-recipe pdf-layout-floating">
    <div class="pdf-header">${pdfHeaderTag(recipe)}</div>
    <h1 class="pdf-title">${escapeHtml(recipe.title)}</h1>
    ${pdfMetaLine(recipe)}
    <div class="pdf-floating-wrap">
      <div class="pdf-floating-photo">${pdfImgTag(imgUrl, recipe)}</div>
      <div class="pdf-floating-ing">${pdfIngredientsList(recipe, factor)}</div>
    </div>
    ${pdfStepsList(recipe)}
    ${pdfNotesBlock(recipe)}
    ${pdfNutritionBox(result, nutritionDetail)}
    <div class="pdf-footer">Savora · Dein Kochbuch</div>
  </section>`;
}

/* ---------- Layout E: Full Photo Statement — grossflaechiges Foto, kurzer Text darunter ---------- */
function pdfLayoutFullStatement(recipe, imgUrl, result, factor, nutritionDetail) {
  return `<section class="pdf-page-recipe pdf-layout-full-statement">
    <div class="pdf-statement-photo">${pdfImgTag(imgUrl, recipe)}
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
      ${pdfNutritionBox(result, nutritionDetail)}
    </div>
    <div class="pdf-footer">Savora · Dein Kochbuch</div>
  </section>`;
}

/* ---------- Layout G: Typography — kein Foto, eigenstaendige Textseite statt Platzhalter (Punkt 49) ---------- */
function pdfLayoutTypography(recipe, result, factor, nutritionDetail) {
  return `<section class="pdf-page-recipe pdf-layout-typography">
    <div class="pdf-header">${pdfHeaderTag(recipe)}</div>
    <h1 class="pdf-title pdf-title-typography">${escapeHtml(recipe.title)}</h1>
    ${pdfMetaLine(recipe)}
    <div class="pdf-typo-rule"></div>
    <div class="pdf-cols">
      <div>${pdfIngredientsList(recipe, factor)}</div>
      <div>${pdfStepsList(recipe)}${pdfNotesBlock(recipe)}</div>
    </div>
    ${pdfNutritionBox(result, nutritionDetail)}
    <div class="pdf-footer">Savora · Dein Kochbuch</div>
  </section>`;
}

/* ---------- Layout F/G: Long Recipe + echte Fortsetzungsseiten (Reparatur-Auftrag Teil F) ----------
   Wird nur verwendet, wenn eine echte DOM-Messung (pdf-layout.js) zeigt, dass ein Rezept nicht
   auf eine A4-Seite passt. Bewusst EINSPALTIG statt pdf-cols: eine zweispaltige Seite laesst sich
   nicht sauber an einer beliebigen Stelle umbrechen, ohne dass eine Spalte staerker gefuellt ist
   als die andere — Punkt 76 sieht dieses Layout ausdruecklich als eigenstaendig vor, nicht als
   Fehlerfall. Die Fortsetzungs-Kennzeichnung ist hier echter HTML-Text im neuen Seiten-Template,
   nie nachtraeglich auf ein fertiges Canvas gemalt (Punkt 34/58) — kann sich deshalb strukturell
   nicht mit Inhalt ueberlagern. */
function pdfIngredientItemsHtml(recipe, factor) {
  return (recipe.ingredients || []).filter((i) => i.name && i.name.trim()).map((i) => {
    const pa = parseAmount(i.amount);
    const amount = pa !== null ? `<strong>${fmtAmount(pa * factor)}${i.unit ? ' ' + escapeHtml(i.unit) : ''}</strong> ` : '';
    return `<li>${amount}${escapeHtml(i.name)}</li>`;
  });
}

function pdfStepItemsHtml(recipe) {
  return (recipe.steps || []).filter((s) => s.text && s.text.trim()).map((s) => `<li>${escapeHtml(s.text)}</li>`);
}

/* Baut EINE Long-Recipe-Seite aus einer bereits vorbereiteten Liste von Bloecken (siehe
   buildLongRecipePages in pdf.js). `imgUrl` nur auf Seite 1 gesetzt (Punkt 45: Hero-Foto gehoert
   zu Seite 1, wird bei Fortsetzung nicht wiederholt/fortgesetzt — Punkt 53). */
function pdfLongRecipeSection(recipe, imgUrl, bodyHtml, isContinuation) {
  const header = isContinuation
    ? `<div class="pdf-continuation-tag">${escapeHtml(recipe.title)} · Fortsetzung</div>`
    : `<div class="pdf-header">${pdfHeaderTag(recipe)}</div><h1 class="pdf-title">${escapeHtml(recipe.title)}</h1>${pdfMetaLine(recipe)}`;
  const photo = (!isContinuation && imgUrl) ? `<div class="pdf-long-photo">${pdfImgTag(imgUrl, recipe)}</div>` : '';
  return `<section class="pdf-page-recipe pdf-layout-long ${isContinuation ? 'pdf-layout-continuation' : ''}">
    ${photo}
    <div class="pdf-long-body">
      ${header}
      ${bodyHtml}
    </div>
    <div class="pdf-footer">Savora · Dein Kochbuch</div>
  </section>`;
}

/* Gruppiert aufeinanderfolgende Bloecke gleichen Typs unter einer gemeinsamen Ueberschrift, auch
   wenn die Gruppe ueber mehrere Seiten laeuft (Punkt 55: Zutatenblock zusammenhalten, wo moeglich,
   bei Fortsetzung klare eigene Ueberschrift). Zubereitungsschritte behalten ihre echte Nummer
   ueber die gesamte Fortsetzung hinweg (Punkt 54) — via CSS counter-reset, da die Nummern-Kreise
   per ::before/counter gerendert werden, nicht ueber das HTML-Attribut ol-start. */
function pdfRenderBlockGroups(sliceBlocks, allBlocks, sliceStartIdx) {
  let html = '';
  let i = 0;
  while (i < sliceBlocks.length) {
    const type = sliceBlocks[i].type;
    let j = i;
    while (j < sliceBlocks.length && sliceBlocks[j].type === type) j++;
    const group = sliceBlocks.slice(i, j);
    const globalStart = sliceStartIdx + i;
    const isContinuationOfType = allBlocks.slice(0, globalStart).some((b) => b.type === type);
    if (type === 'ing') {
      html += `<div class="pdf-ing-title">Zutaten${isContinuationOfType ? ' · Fortsetzung' : ''}</div><ul class="pdf-ing-list">${group.map((b) => b.html).join('')}</ul>`;
    } else if (type === 'step') {
      const stepsBefore = allBlocks.slice(0, globalStart).filter((b) => b.type === 'step').length;
      html += `<div class="pdf-steps-title">Zubereitung${isContinuationOfType ? ' · Fortsetzung' : ''}</div><ol class="pdf-step-list" style="counter-reset: pstep ${stepsBefore};">${group.map((b) => b.html).join('')}</ol>`;
    } else {
      html += group.map((b) => b.html).join('');
    }
    i = j;
  }
  return html;
}

/* Haupteinstieg: waehlt Layout deterministisch und baut das passende HTML. `imgDims` ist
   {width,height} des Originalbilds oder null (kein Foto -> Layout G, Punkt 49). */
function buildRecipePdfSection(recipe, imgUrl, imgDims, result, previousLayout, nutritionDetail) {
  const factor = 1; // PDF-Export nutzt immer die Basisportionen des Rezepts, keine Live-Skalierung
  if (!imgUrl || !imgDims) return { html: pdfLayoutTypography(recipe, result, factor, nutritionDetail), layout: 'typography' };
  const layout = selectPdfLayout(recipe, imgDims, previousLayout);
  const builders = {
    hero: () => pdfLayoutHero(recipe, imgUrl, result, factor, nutritionDetail),
    'split-left': () => pdfLayoutSplit(recipe, imgUrl, result, factor, 'left', nutritionDetail),
    'split-right': () => pdfLayoutSplit(recipe, imgUrl, result, factor, 'right', nutritionDetail),
    floating: () => pdfLayoutFloating(recipe, imgUrl, result, factor, nutritionDetail),
    'full-statement': () => pdfLayoutFullStatement(recipe, imgUrl, result, factor, nutritionDetail),
  };
  const build = builders[layout] || builders.hero;
  return { html: build(), layout };
}
