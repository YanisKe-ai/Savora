/* ---------- Nutrition: UI (Implementierungsauftrag Teil C, Punkt 24-25, 70-75) ----------
   Eigene Datei statt Erweiterung von views.js/ui.js, da beide bereits ~600 Zeilen haben
   und die Nutrition-UI ein klar abgegrenzter Themenblock ist (gleiche Begruendung wie die
   Aufteilung von nutrition-swiss/-units/-matcher/-calculator in Phase 1+2).

   Architektur-Hinweis: Savora rendert bei jedem render() komplett neu (kein Diffing), ausser
   fuer Bilder, die per data-lazy-img nachgeladen werden (siehe images.js). Die Nutrition-Karte
   in der Detailansicht folgt demselben Lazy-Muster (data-lazy-nutrition), da das Ergebnis aus
   IndexedDB async geladen werden muss und der erste Render synchron bleiben soll. */

/* ---------- v0.86: Anzeige «schlicht, klar, nicht störend» ----------
   Kurzzeile im Rezeptkopf, ruhige Tabelle im Reiter (LIV-Reihenfolge), Teilsumme bei teilweise erkannten Zutaten.
   Rundung: formatNutrient/formatNutrientRange aus nutrition-model.js (Vertrag RECHNUNG); fehlt die Funktion, gilt
   dieselbe Regel lokal (nutUiFormat). App und PDF nutzen beide nutValueText, darum runden sie gleich. */

/* Gleiche Regel wie formatNutrient (Plan 6): kcal/kJ ganz; g ab 10 ganz, darunter eine Stelle, >0 und <0,1 «< 0,1»;
   Salz unter 1 g zwei Stellen; Dezimalkomma. null bleibt null (unbekannt ist nie 0). */
function nutUiFormatLocal(value, key) {
  if (value === null || value === undefined || typeof value !== 'number' || !isFinite(value)) return null;
  const def = (typeof NUTRIENT_KEYS !== 'undefined' && NUTRIENT_KEYS[key]) || {};
  const comma = (n) => String(n).replace('.', ',');
  if (value <= 0) return '0';
  if (def.unit === 'kcal' || def.unit === 'kJ') return comma(Math.round(value));
  if (key === 'salt' && value < 1) return value < 0.01 ? '< 0,01' : comma(Math.round(value * 100) / 100);
  if (value >= 10) return comma(Math.round(value));
  if (value < 0.1) return '< 0,1';
  return comma(Math.round(value * 10) / 10);
}
function nutUiFormat(value, key) {
  if (typeof formatNutrient === 'function') { try { return formatNutrient(value, key); } catch (e) { /* lokale Regel */ } }
  return nutUiFormatLocal(value, key);
}
function nutUiFormatRange(min, max, key) {
  if (typeof formatNutrientRange === 'function') { try { return formatNutrientRange(min, max, key); } catch (e) { /* lokale Regel */ } }
  const a = nutUiFormatLocal(min, key), b = nutUiFormatLocal(max, key);
  if (a === null || b === null) return a === null ? b : a;
  return a === b ? a : a + '–' + b;
}

/* Wert oder Spanne als Text («9–11»), ohne Einheit; null wenn nichts bekannt.
   mode: 'portion' | '100g' | 'total'. factor: nur für «Gesamtes Rezept» (folgt den eingestellten Portionen, F6). */
function nutValueText(result, mode, key, factor) {
  if (!result) return null;
  const f = Number(factor) > 0 ? Number(factor) : 1;
  const exactSrc = mode === '100g' ? result.nutrientsPer100g : mode === 'total' ? result.nutrientsTotal : result.nutrientsPerPortion;
  const rangeSrc = mode === '100g' ? result.nutrientsPer100gRange : mode === 'total' ? result.nutrientsTotalRange : result.nutrientsPerPortionRange;
  const v = exactSrc ? exactSrc[key] : null;
  if (typeof v === 'number' && isFinite(v)) return nutUiFormat(v * f, key);
  const r = rangeSrc ? rangeSrc[key] : null;
  if (result.rangeUsed && r && typeof r.min === 'number' && typeof r.max === 'number') return nutUiFormatRange(r.min * f, r.max * f, key);
  return null;
}

/* ---------- Bezugsbasis (v0.83) ----------
   Eine Quelle fuer App, Einkaufsvorschau und PDF: nutritionBasis(recipe) aus recipe-model.js.
   Gesamtertrag (1 Glas) und unbekannter Ertrag zeigen Werte fuer das gesamte Rezept; es wird keine Portion erfunden. */
function nutBasisFor(recipe, result) {
  const b = typeof nutritionBasis === 'function' ? nutritionBasis(recipe) : { kind: result && result.needsServings ? 'total' : 'portion', label: result && result.needsServings ? 'für das gesamte Rezept' : 'pro Portion' };
  if (result && (result.needsServings || result.wholeRecipe) && b.kind !== 'total') return { kind: 'total', divisor: 1, label: 'für das gesamte Rezept' };
  return b;
}
// Faktor für «Gesamtes Rezept»: eingestellte Portionen / Rezeptportionen (pro Portion bleibt gleich)
function nutUiScale(recipe) {
  if (!recipe || typeof servingsFactor !== 'function' || typeof currentServings !== 'function') return 1;
  const f = servingsFactor(recipe, currentServings(recipe));
  return Number(f) > 0 ? f : 1;
}

/* Einheitliche Zählung (Plan 5). Vertrag: result.coverage/partial/enoughForEstimate (RECHNUNG). Fehlt das Feld,
   wird es aus matchedCount/relevantCount/unresolvedIngredients/unquantified abgeleitet (Zutat ohne Menge = fehlt). */
function nutUiCoverage(result) {
  if (!result) return null;
  const c = result.coverage;
  let counted, total, missing;
  if (!c && result.relevantCount === undefined && result.matchedCount === undefined) {
    return { counted: null, total: null, missing: [], partial: false, enough: true };   // altes/handgebautes Ergebnis ohne Zählung
  }
  if (typeof nutritionCoverageOf === 'function') {   // Vertrag RECHNUNG: dieselbe Zählung wie nutritionStatusFor und der Zuordnen-Dialog
    const k = nutritionCoverageOf(result);
    counted = k.counted; total = k.total;
    missing = (k.missing || []).map((m) => typeof m === 'string' ? { name: m } : (m || {})).filter((m) => m.name);
    const enough0 = total > 0 && counted / total >= 0.5;
    return { counted, total, missing, partial: counted < total, enough: enough0 };
  }
  if (c && typeof c.total === 'number') {
    counted = Number(c.counted) || 0; total = c.total;
    missing = (c.missing || []).map((m) => typeof m === 'string' ? { name: m } : (m || {})).filter((m) => m.name);
  } else {
    const unq = result.unquantified || [];
    total = (Number(result.relevantCount) || 0) + unq.length;
    counted = Number(result.matchedCount) || 0;
    missing = (result.unresolvedIngredients || []).map((u) => ({ name: u.name, reason: u.reason })).concat(unq.map((n) => ({ name: n, reason: 'no-amount' })));
  }
  const partial = typeof result.partial === 'boolean' ? result.partial : counted < total;
  const enough = typeof result.enoughForEstimate === 'boolean' ? result.enoughForEstimate : (total > 0 && counted / total >= 0.5);
  return { counted, total, missing, partial, enough };
}

function nutUiHasIngredients(recipe) {
  const list = typeof nutritionIngredientsFor === 'function' ? nutritionIngredientsFor(recipe) : (recipe.ingredients || []);
  return list.some((i) => i && i.name && String(i.name).trim());
}

/* Anzeigezustand aus Status + Ergebnis:
   full | partial (≥ Hälfte, Teilsumme) | few (zu wenig) | empty | none (nie berechnet) | stale | failed */
function nutUiView(recipe, st) {
  const status = st ? st.status : 'not-calculated';
  const result = st ? st.result : null;
  if (status === 'failed') return { kind: 'failed', result: null, cov: null };
  if (status === 'not-calculated' || !result) return { kind: 'none', result: null, cov: null };
  if (status === 'stale') return { kind: 'stale', result, cov: null };
  const cov = nutUiCoverage(result);
  if (status === 'empty' || cov.total === 0) return { kind: 'empty', result, cov };
  if (!cov.enough) return { kind: 'few', result, cov };
  if (cov.partial || status === 'partial') return { kind: 'partial', result, cov: Object.assign({}, cov, { partial: true }) };
  return { kind: 'full', result, cov };
}

/* ---------- Zwischenspeicher: ruhiges Neuzeichnen ohne «Wird geladen» und ohne Layoutsprung ----------
   Savora zeichnet bei jedem render() alles neu. Der letzte bekannte Stand je Rezept wird synchron gezeigt,
   hydrateNutritionCards prüft danach asynchron und ersetzt nur, wenn sich etwas geändert hat. Nur Anzeige-Cache. */
const NUT_UI_CACHE = new Map();
let nutUiWarmed = false;
function nutUiSig(recipe) {
  const ings = (recipe.ingredients || []).map((i) => [i && i.amount, i && i.unit, i && i.name]);
  return JSON.stringify([ings, recipe.servings, recipe.servingMode || '', recipe.yieldLabel || '', recipe.nutritionFinishedWeight || null, recipe.nutritionMap || null]);
}
function nutUiCached(recipe) {
  const c = recipe && NUT_UI_CACHE.get(recipe.id);
  return c && c.sig === nutUiSig(recipe) ? c.st : null;
}
function nutUiRemember(recipe, st) {
  if (!recipe || !st || st.status === 'failed' || st.status === 'not-calculated' || st.status === 'stale') return;
  NUT_UI_CACHE.set(recipe.id, { sig: nutUiSig(recipe), st });
}
function nutUiCacheClear(recipeId) { if (recipeId) NUT_UI_CACHE.delete(recipeId); else NUT_UI_CACHE.clear(); }
// Einmal pro Sitzung im Leerlauf die gespeicherten Ergebnisse lesen (nur lesen, nichts rechnen), damit die Kurzzeile
// beim Öffnen eines Rezepts sofort dasteht.
function nutUiPrewarm() {
  if (nutUiWarmed || !state.showNutrition || !(state.recipes || []).length || typeof nutritionStatusFor !== 'function') return;
  nutUiWarmed = true;
  const run = async () => {
    for (const r of state.recipes.slice(0, 400)) {
      if (nutUiCached(r)) continue;
      try { nutUiRemember(r, await nutritionStatusFor(r)); } catch (e) { /* nur Vorrat */ }
    }
  };
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 400));
  idle(() => { run(); });
}

/* ---------- Kurzzeile unter den Zutaten (Plan 1 und 3) ----------
   «ca. 520 kcal · 24 g Eiweiss · 58 g Kohlenhydrate · 21 g Fett pro Portion», bei Teilsumme «mind.».
   Nur bei vollen oder teilweisen Werten, sonst gar nichts (kein Leerzustand im Lesemodus). */
const NUT_LINE_KEYS = [['energyKcal', ''], ['protein', 'Eiweiss'], ['carbohydrates', 'Kohlenhydrate'], ['fat', 'Fett']];
function nutUiLineText(recipe, view) {
  if (!view || (view.kind !== 'full' && view.kind !== 'partial')) return null;
  const b = nutBasisFor(recipe, view.result);
  const mode = b.kind === 'total' ? 'total' : 'portion';
  const f = mode === 'total' ? nutUiScale(recipe) : 1;
  const items = NUT_LINE_KEYS.map(([k, lab]) => {
    const v = nutValueText(view.result, mode, k, f);
    return v === null ? null : `${v}\u00a0${NUTRIENT_KEYS[k].unit}${lab ? ' ' + lab : ''}`;
  }).filter(Boolean);
  if (!items.length) return null;
  return { prefix: view.kind === 'partial' ? 'mind.' : 'ca.', items, basis: b.label };
}
function nutUiLineHtml(recipe, view) {
  const t = nutUiLineText(recipe, view);
  if (!t) return '';
  const parts = t.items.map((s, i) => `<span class="nut-line-item">${i === 0 ? t.prefix + '\u00a0' : ''}${escapeHtml(s)}</span>`).join('<span class="nut-line-sep" aria-hidden="true"> · </span>');
  return `<button type="button" class="nut-line" data-nut-line data-recipe-id="${escapeAttr(recipe.id)}" data-action="nutrition-show-tab" data-id="${escapeAttr(recipe.id)}"><span class="nut-line-text">${parts} <span class="nut-line-basis">${escapeHtml(t.basis)}</span></span><span class="sr-only">. Alle Nährwerte ansehen</span></button>`;
}
// Platz im Kopf: mit bekanntem Stand sofort die Zeile; sonst eine reservierte, leere Fläche (kein Verschieben beim Nachladen)
function nutritionLineSlot(recipe) {
  if (!state.showNutrition || !recipe) return '';
  const st = nutUiCached(recipe);
  if (st) return nutUiLineHtml(recipe, nutUiView(recipe, st));
  if (!nutUiHasIngredients(recipe)) return '';
  return `<div class="nut-line nut-line--pending" data-nut-line data-recipe-id="${escapeAttr(recipe.id)}" aria-hidden="true"></div>`;
}

/* ---------- Reiter «Nährwerte» (Plan 2, 3, 4, 10) ---------- */
const NUT_TABLE_ROWS = [
  { key: 'energyKcal', label: 'Energie' },
  { key: 'fat', label: 'Fett' },
  { key: 'saturatedFat', label: 'davon gesättigte Fettsäuren', sub: true },
  { key: 'carbohydrates', label: 'Kohlenhydrate' },
  { key: 'sugars', label: 'davon Zucker', sub: true },
  { key: 'fiber', label: 'Nahrungsfasern' },
  { key: 'protein', label: 'Eiweiss' },
  { key: 'salt', label: 'Salz' },
];
const NUT_SERVINGS_HINT = 'Es fehlt die Angabe, was das Rezept ergibt. Darum gelten die Werte für das ganze Rezept.';
const NUT_MISSING_HINT = 'Ein «–» heisst: Wert unbekannt, nicht 0.';
const NUT_FOOT = 'Aus den Zutaten berechnet, Richtwerte.';

/* Bezüge: pro Portion/Stück (nicht bei Gesamtertrag), gesamtes Rezept, pro 100 g nur mit gewogenem Endgewicht */
function nutDetailModes(recipe, result) {
  const b = nutBasisFor(recipe, result);
  const modes = [];
  if (b.kind !== 'total') modes.push({ id: 'portion', label: b.kind === 'piece' ? 'Pro Stück' : 'Pro Portion' });
  modes.push({ id: 'total', label: 'Gesamtes Rezept' });
  if (result && result.finishedWeight > 0) modes.push({ id: '100g', label: 'Pro 100 g' });
  return modes;
}
function nutUiMode(recipe, result) {
  const modes = nutDetailModes(recipe, result);
  return modes.some((m) => m.id === state.nutritionDetailMode) ? state.nutritionDetailMode : modes[0].id;
}
function nutUiCaption(recipe, result, mode) {
  if (mode === '100g') return 'Nährwerte pro 100 g';
  if (mode === 'portion') return 'Nährwerte ' + nutBasisFor(recipe, result).label;
  const known = typeof yieldKnown === 'function' ? yieldKnown(recipe) : Number(recipe.servings) > 0;
  const n = typeof currentServings === 'function' ? currentServings(recipe) : recipe.servings;
  const lab = known && typeof servingLabel === 'function' ? servingLabel(recipe, n) : '';
  return 'Nährwerte für das gesamte Rezept' + (lab ? ` (${lab})` : '');
}
function nutUiMissingNote(cov) {
  const names = cov.missing.map((m) => m.name).filter(Boolean);
  const n = Math.max(names.length, (cov.total || 0) - (cov.counted || 0));
  if (names.length && names.length <= 2 && n <= 2) return `Ohne ${names.join(' und ')} gerechnet. Die Werte sind eher etwas zu tief.`;
  return `${n} Zutaten fehlen in der Rechnung. Die Werte sind eher zu tief.`;
}
function nutUiMatchBtn(recipe, cls) {
  return `<button type="button" class="${cls || 'text-btn'} nut-match-btn" data-action="nutrition-open-match" data-id="${escapeAttr(recipe.id)}">Zutaten zuordnen</button>`;
}
function nutUiValuesPanel(recipe, view) {
  const result = view.result;
  const mode = nutUiMode(recipe, result);
  const f = mode === 'total' ? nutUiScale(recipe) : 1;
  const val = (key) => nutValueText(result, mode, key, f);
  let dash = false;
  const rows = NUT_TABLE_ROWS.map((row) => {
    const v = val(row.key);
    if (v === null) dash = true;
    const kj = row.key === 'energyKcal' && v !== null ? val('energyKj') : null;
    return `<tr class="${row.sub ? 'is-sub' : ''}"><th scope="row">${row.label}</th><td>${v === null ? '–' : escapeHtml(v) + '\u00a0' + NUTRIENT_KEYS[row.key].unit}${kj !== null ? `<span class="nut-kj"> · ${escapeHtml(kj)}\u00a0kJ</span>` : ''}</td></tr>`;
  }).join('');
  // Weitere Werte (Mineralstoffe, Vitamine) nur mit bekanntem Wert, kein Meer aus Strichen
  const mainKeys = new Set(NUT_TABLE_ROWS.map((r) => r.key).concat(['energyKj']));
  const extra = Object.keys(NUTRIENT_KEYS).filter((k) => !mainKeys.has(k)).map((k) => ({ k, v: val(k) })).filter((x) => x.v !== null);
  const modes = nutDetailModes(recipe, result);
  const caption = nutUiCaption(recipe, result, mode);
  const hasSource = result.sourceDataVersions && Object.keys(result.sourceDataVersions).length > 0;
  const approx = result.approximations || [];
  const foot = NUT_FOOT + (result.rangeUsed ? ' Menge als Bereich angegeben, Ergebnis als Spanne.' : '') + (dash ? ' ' + NUT_MISSING_HINT : '');
  return `
    <table class="nut-table">
      <caption class="nut-caption">${escapeHtml(caption)}</caption>
      <tbody>${rows}</tbody>
    </table>
    ${view.kind === 'partial' ? `<p class="nut-note">${escapeHtml(nutUiMissingNote(view.cov))} ${nutUiMatchBtn(recipe)}</p>` : ''}
    ${result.needsServings ? `<p class="nut-note">${NUT_SERVINGS_HINT} <button type="button" class="text-btn" data-action="edit-recipe" data-id="${escapeAttr(recipe.id)}">Ertrag ergänzen</button></p>` : ''}
    <p class="nut-foot">${escapeHtml(foot)}</p>
    <details class="nut-more" data-nut-more ${state.nutritionMoreOpen ? 'open' : ''}>
      <summary>Mehr Werte und Optionen</summary>
      <div class="nut-more-body">
        ${modes.length > 1 ? `<div class="nutrition-segmented nut-modes" role="radiogroup" aria-label="Bezug der Nährwerte">
          ${modes.map((m) => `<button type="button" role="radio" aria-checked="${mode === m.id}" class="${mode === m.id ? 'active' : ''}" data-action="nutrition-set-mode" data-mode="${m.id}">${m.label}</button>`).join('')}
        </div>` : ''}
        ${extra.length ? `<table class="nut-table nut-table--extra"><caption class="sr-only">Weitere Nährwerte</caption><tbody>${extra.map((x) => `<tr><th scope="row">${NUTRIENT_KEYS[x.k].label}</th><td>${escapeHtml(x.v)}\u00a0${NUTRIENT_KEYS[x.k].unit}</td></tr>`).join('')}</tbody></table>` : ''}
        <div class="field nutrition-weight-field">
          <label for="nutritionFinishedWeight">Gewicht nach dem Kochen (g, optional)</label>
          <input type="number" min="1" inputmode="decimal" id="nutritionFinishedWeight" value="${recipe.nutritionFinishedWeight || ''}" aria-describedby="nutritionFinishedWeightHint">
          <p class="hint-line" id="nutritionFinishedWeightHint">Für Werte pro 100 g. Beim Kochen verdampft Wasser, darum zählt das Gewicht des fertigen Gerichts.</p>
        </div>
        <div class="nut-more-actions">
          <button type="button" class="ghost-btn nutrition-weight-save" data-action="nutrition-save-finished-weight" data-id="${escapeAttr(recipe.id)}">Gewicht speichern</button>
          ${nutUiMatchBtn(recipe)}
        </div>
        ${approx.length ? `<p class="nut-foot">Ähnliches Lebensmittel verwendet: ${approx.map((a) => escapeHtml(a.name) + ' (wie ' + escapeHtml(String(a.food || '').split(',')[0]) + ')').join(', ')}</p>` : ''}
        ${hasSource ? `<p class="nut-foot">Quelle: ${escapeHtml(nutritionSourceLabel(result.sourceDataVersions))}. Keine medizinische Aussage.</p>` : ''}
      </div>
    </details>`;
}
function nutUiPanelHtml(recipe, view) {
  switch (view.kind) {
    case 'full': case 'partial': return nutUiValuesPanel(recipe, view);
    case 'few': return `<p class="nut-state">Zu wenige Zutaten erkannt für eine Schätzung.</p>
      <p class="nut-foot">${view.cov.counted} von ${view.cov.total} Zutaten erkannt.</p>${nutUiMatchBtn(recipe, 'outline-btn')}`;
    case 'empty': return nutUiHasIngredients(recipe)
      ? `<p class="nut-state">Keine Zutat lässt sich berechnen.</p><p class="nut-foot">Wasser, Salz und Gewürze in kleinen Mengen zählen nicht.</p>${nutUiMatchBtn(recipe, 'outline-btn')}`
      : `<p class="nut-state">Noch keine Zutaten.</p><p class="nut-foot">Nährwerte werden aus den Zutaten berechnet.</p>`;
    case 'stale': return `<p class="nut-state">Die Nährwerte sind nicht aktuell.</p>${nutUiMatchBtn(recipe, 'outline-btn')}`;
    case 'failed': return `<p class="nut-state">Die Nährwerte konnten nicht gelesen werden.</p>`;
    default: return `<p class="nut-state">Noch nicht berechnet.</p><button type="button" class="outline-btn" data-action="nutrition-open-match" data-id="${escapeAttr(recipe.id)}">Nährwerte berechnen</button>`;
  }
}
/* Inhalt des Reiters aus einem Ergebnis (auch für Tests und Vorschau). Ohne Ergebnis: «Noch nicht berechnet». */
function nutritionCompactInner(recipe, result) {
  return nutUiPanelHtml(recipe, nutUiView(recipe, result ? { status: 'calculated', result } : null));
}

/* Platzhalter im Reiter. Mit bekanntem Stand sofort fertig gezeichnet, sonst kurz «Wird geladen …». */
function nutritionCardSection(recipeId) {
  const recipe = (state.recipes || []).find((r) => r.id === recipeId);
  const st = recipe ? nutUiCached(recipe) : null;
  if (st) return `<div class="nutrition-section"><div data-lazy-nutrition data-recipe-id="${escapeAttr(recipeId)}" class="nut-panel">${nutUiPanelHtml(recipe, nutUiView(recipe, st))}</div></div>`;
  return `<div class="nutrition-section">
    <div data-lazy-nutrition data-recipe-id="${escapeAttr(recipeId)}" class="nut-panel nutrition-card-loading">
      <span class="nutrition-loading-text">Wird geladen …</span>
    </div>
  </div>`;
}

const NUT_UI_BOUND = new WeakSet();
function nutUiBindToggle(node) {
  node.querySelectorAll('[data-nut-more]').forEach((d) => { if (NUT_UI_BOUND.has(d)) return; NUT_UI_BOUND.add(d); d.addEventListener('toggle', () => { state.nutritionMoreOpen = d.open; }); });
}

/* Wird aus ui.js/bindEvents nach jedem render() aufgerufen (gleiches Muster wie hydrateLazyImages).
   Füllt Reiter und Kurzzeile, ohne einen vollen render() auszulösen. Ersetzt nur, wenn sich etwas ändert. */
async function hydrateNutritionCards() {
  const nodes = Array.from(document.querySelectorAll('[data-lazy-nutrition], [data-nut-line]'));
  const ids = Array.from(new Set(nodes.map((n) => n.dataset.recipeId)));
  for (const recipeId of ids) {
    const recipe = state.recipes.find((r) => r.id === recipeId);
    if (!recipe) continue;
    let view;
    try {
      let st = await nutritionStatusFor(recipe);
      // Nichts berechnet oder veraltet: automatisch still neu rechnen (lokal, Millisekunden), kein Zwischenschritt
      if (st.status === 'not-calculated' || st.status === 'stale') {
        try { await recalculateAndStoreNutrition(recipe); st = await nutritionStatusFor(recipe); } catch (e) { console.warn('Automatische Berechnung fehlgeschlagen', e); }
      }
      nutUiRemember(recipe, st);
      view = nutUiView(recipe, st);
    } catch (err) {
      console.warn('Die Nährwerte konnten nicht geladen werden.', err);
      view = { kind: 'failed', result: null, cov: null };
    }
    document.querySelectorAll(`[data-lazy-nutrition][data-recipe-id="${cssAttrNut(recipeId)}"]`).forEach((node) => {
      const tpl = document.createElement('template'); tpl.innerHTML = nutUiPanelHtml(recipe, view);
      const wasLoading = node.classList.contains('nutrition-card-loading');
      node.classList.remove('nutrition-card-loading');
      if (!wasLoading && node.innerHTML === tpl.innerHTML) { nutUiBindToggle(node); return; }   // unverändert: nichts ersetzen (Fokus, offenes «Mehr» bleiben)
      node.innerHTML = tpl.innerHTML;
      node.querySelectorAll('[data-action]').forEach((el) => el.addEventListener('click', onAction));
      nutUiBindToggle(node);
    });
    document.querySelectorAll(`[data-nut-line][data-recipe-id="${cssAttrNut(recipeId)}"]`).forEach((slot) => {
      const html = nutUiLineHtml(recipe, view);
      if (!html) { slot.remove(); return; }
      const tpl = document.createElement('template'); tpl.innerHTML = html.trim();
      const btn = tpl.content.firstElementChild;
      const pending = slot.classList.contains('nut-line--pending');
      if (!pending && slot.textContent === btn.textContent) return;
      if (pending) btn.classList.add('nut-line--in');
      slot.replaceWith(btn);
      btn.addEventListener('click', onAction);
    });
  }
  nutUiPrewarm();
}
function cssAttrNut(v) { return String(v).replace(/["\\]/g, '\\$&'); }

/* ---------- Matching-Screen (Punkt 71-73) ---------- */
/* v86: gleiche Zählung wie Reiter und PDF (nutritionCoverageOf, Vertrag RECHNUNG). Probe-Rechnung ohne Speichern. */
async function nutMatchCoverage(recipe) {
  if (!recipe || typeof calculateRecipeNutrition !== 'function') return null;
  try { const res = await calculateRecipeNutrition(recipe); const c = nutUiCoverage(res); return c && c.total !== null ? c : null; } catch (e) { return null; }
}
function nutMatchCoverageText(cov, sure, all) {
  if (cov) return cov.total ? `${cov.counted} von ${cov.total} Zutaten eingerechnet` : 'Keine berechenbaren Zutaten';
  return `${sure} von ${all} Zutaten erkannt`;
}
function nutritionStatusIcon(status) {
  if (status === 'matched') return `<span class="nutrition-status-icon ok">${ICONS.check}</span>`;
  if (status === 'uncertain') return `<span class="nutrition-status-icon warn">!</span>`;
  return `<span class="nutrition-status-icon unknown">?</span>`;
}

function nutritionMatchRow(item) {
  const name = escapeHtml(item.ingredient.name);
  const foodName = item.food ? escapeHtml(item.food.name) : (item.skipped === 'nonCaloric' ? 'Wird nicht mitgerechnet (enthält keine Nährwerte)' : item.skipped === 'negligible' ? 'Gewürz oder Triebmittel, in dieser Menge vernachlässigbar' : null);
  const prepHint = item.preparation ? `<span class="nutrition-prep-hint">${ICONS.sparkle} Zubereitung erkannt: ${escapeHtml(item.preparation.label)}</span>` : '';
  if (item.status === 'matched') {
    return `<li class="nutrition-match-item">
      ${nutritionStatusIcon('matched')}
      <div class="nutrition-match-text">
        <span class="nutrition-match-ingredient">${name}</span>
        <span class="nutrition-match-food">${foodName}</span>
        ${prepHint}
      </div>
      <button type="button" class="nutrition-match-change" data-action="nutrition-select-ingredient" data-name="${name}" aria-label="Zuordnung für ${name} ändern">Ändern</button>
    </li>`;
  }
  const statusText = item.status === 'uncertain' ? (foodName ? 'Vielleicht: ' + foodName : 'Unsicher') : 'Nicht erkannt';
  const alts = (item.candidates || []).filter((f) => f && f.id).slice(0, 3);
  const chips = alts.length ? `<div class="nutrition-suggest-row" role="group" aria-label="Vorschläge für ${name}">${alts.map((f) => `<button type="button" class="nutrition-suggest" data-action="nutrition-confirm-match" data-name="${name}" data-food-id="${escapeHtml(f.id)}">${escapeHtml(f.name.length > 34 ? f.name.slice(0, 33) + '…' : f.name)}</button>`).join('')}</div>` : '';
  return `<li>
    <button type="button" class="nutrition-match-item nutrition-match-item-action" data-action="nutrition-select-ingredient" data-name="${name}" aria-label="${name}, ${statusText} — antippen um Lebensmittel zuzuordnen">
      ${nutritionStatusIcon(item.status)}
      <div class="nutrition-match-text">
        <span class="nutrition-match-ingredient">${name}</span>
        <span class="nutrition-match-food">${statusText}</span>
        ${prepHint}
      </div>
      ${ICONS.chevronRight}
    </button>
    ${chips}
  </li>`;
}

function nutritionMatchStage(recipe) {
  const items = state.nutritionMatchItems;
  const sureCount = items.filter((i) => i.status === 'matched').length;
  const reviewItems = items.filter((i) => i.status !== 'matched');
  return `
    <h2 class="modal-title" id="nutrition-modal-title">Zutaten zuordnen</h2>
    <p class="nutrition-modal-subtitle">${nutMatchCoverageText(state.nutritionMatchCov, sureCount, items.length)}</p>
    ${reviewItems.some((i) => i.status === 'uncertain' && i.food) ? `<button type="button" class="outline-btn nutrition-accept-all" data-action="nutrition-accept-suggestions">Alle Vorschläge übernehmen</button>` : ''}
    ${reviewItems.length ? `<ul class="nutrition-match-list">${reviewItems.map(nutritionMatchRow).join('')}</ul>` : ''}
    ${sureCount ? `<details class="nutrition-sure-details">
      <summary>${sureCount} sicher erkannte Zutat${sureCount === 1 ? '' : 'en'} anzeigen</summary>
      <ul class="nutrition-match-list">${items.filter((i) => i.status === 'matched').map(nutritionMatchRow).join('')}</ul>
    </details>` : ''}
    ${!items.length ? `<p class="nutrition-empty-text">Keine berechenbaren Zutaten gefunden.</p>` : ''}
    <div class="form-actions">
      <button type="button" class="ghost-btn" data-action="close-modal">Abbrechen</button>
      <button type="button" class="primary-btn" data-action="nutrition-apply" data-id="${escapeAttr(recipe.id)}">Übernehmen</button>
    </div>
  `;
}

/* ---------- Manuelle Auswahl (Punkt 72) ---------- */
function nutritionFoodCandidateRow(food, targetName) {
  return `<li>
    <button type="button" class="nutrition-candidate-item" data-action="nutrition-confirm-match" data-name="${escapeHtml(targetName)}" data-food-id="${escapeHtml(food.id)}" aria-label="${escapeHtml(food.name)} für ${escapeHtml(targetName)} übernehmen">
      <span class="nutrition-candidate-name">${escapeHtml(food.name)}</span>
      <span class="nutrition-candidate-source">${food.source === 'custom' ? 'Eigenes Lebensmittel' : food.source === 'open-food-facts' ? 'Open Food Facts (früher zugeordnet)' : 'CH-Nährwertdatenbank'}</span>
    </button>
  </li>`;
}

function nutritionSelectStage(recipe) {
  const target = state.nutritionSelectTarget;
  const results = state.nutritionSearchResults || [];
  return `
    <h2 class="modal-title" id="nutrition-modal-title">Lebensmittel für „${escapeHtml(target)}“</h2>
    <div class="field" style="margin-bottom:10px;">
      <input type="text" id="nutritionSearchInput" placeholder="Lebensmittel suchen …" value="${escapeHtml(state.nutritionSearchQuery || '')}" autocomplete="off">
    </div>
    ${results.length ? `<ul class="nutrition-match-list">${results.map((f) => nutritionFoodCandidateRow(f, target)).join('')}</ul>`
      : `<p class="nutrition-empty-text">${state.nutritionSearchQuery ? 'Keine Treffer in deinen Lebensmitteln.' : 'Suchbegriff eingeben oder unten ein eigenes Lebensmittel anlegen.'}</p>`}
    <div class="nutrition-select-actions">
      <button type="button" class="add-row-btn" data-action="nutrition-open-custom" data-name="${escapeHtml(target)}">${ICONS.plus} Eigenes Lebensmittel erstellen</button>
    </div>
    <div class="form-actions">
      <button type="button" class="ghost-btn" data-action="nutrition-back-to-match">Zurück</button>
    </div>
  `;
}

/* ---------- Eigenes Lebensmittel (Punkt 9, 72) ---------- */
function nutritionCustomStage() {
  const target = state.nutritionSelectTarget;
  const field = (id, label, unit) => `<div class="field" style="margin-bottom:10px;">
    <label for="${escapeAttr(id)}">${label}${unit ? ` (${unit})` : ''}</label>
    <input type="text" inputmode="decimal" id="${escapeAttr(id)}" placeholder="0">
  </div>`;
  return `
    <h2 class="modal-title" id="nutrition-modal-title">Eigenes Lebensmittel</h2>
    <p class="nutrition-modal-subtitle">Werte pro 100 g — unbekannte Felder leer lassen.</p>
    <div class="field"><label for="cf-name">Name</label><input type="text" id="cf-name" value="${escapeHtml(target || '')}"></div>
    <div class="field-row">
      ${field('cf-kcal', 'Energie', 'kcal')}
      ${field('cf-protein', 'Protein', 'g')}
      ${field('cf-carbs', 'Kohlenhydrate', 'g')}
    </div>
    <div class="field-row">
      ${field('cf-sugars', 'davon Zucker', 'g')}
      ${field('cf-fat', 'Fett', 'g')}
      ${field('cf-satfat', 'davon gesättigt', 'g')}
    </div>
    <div class="field-row">
      ${field('cf-fiber', 'Ballaststoffe', 'g')}
      ${field('cf-salt', 'Salz', 'g')}
    </div>
    <div class="form-actions">
      <button type="button" class="ghost-btn" data-action="nutrition-back-to-match">Abbrechen</button>
      <button type="button" class="primary-btn" data-action="nutrition-save-custom">Speichern</button>
    </div>
  `;
}

/* ---------- Root-Dispatch fuer den Matching-Modal (type: 'nutrition') ---------- */
function nutritionModal(recipe) {
  if (!state.modal || state.modal.type !== 'nutrition' || state.modal.recipeId !== recipe.id) return '';
  const stage = state.modal.stage || 'match';
  const inner = stage === 'select' ? nutritionSelectStage(recipe)
    : stage === 'custom' ? nutritionCustomStage()
    : nutritionMatchStage(recipe);
  return `<div class="modal-backdrop" data-action="close-modal">
    <div class="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="nutrition-modal-title" tabindex="-1" data-stop-click>
      ${inner}
    </div>
  </div>`;
}

/* Debounchte Suche im Auswahldialog — gleiches Prinzip wie der bestehende globale
   Such-Input (searchInput) in ui.js, nur auf searchAllFoods() statt Rezeptsuche. */
function bindNutritionSearchInput() {
  const input = document.getElementById('nutritionSearchInput');
  if (!input) return;
  let timer = null;
  input.addEventListener('input', (e) => {
    state.nutritionSearchQuery = e.target.value;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      state.nutritionSearchResults = await searchAllFoods(state.nutritionSearchQuery, 15);
      renderKeepFocus('nutritionSearchInput');
    }, 200);
  });
}
