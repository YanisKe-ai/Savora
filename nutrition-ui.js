/* ---------- Nutrition: UI (Implementierungsauftrag Teil C, Punkt 24-25, 70-75) ----------
   Eigene Datei statt Erweiterung von views.js/ui.js, da beide bereits ~600 Zeilen haben
   und die Nutrition-UI ein klar abgegrenzter Themenblock ist (gleiche Begruendung wie die
   Aufteilung von nutrition-swiss/-units/-matcher/-calculator in Phase 1+2).

   Architektur-Hinweis: Savora rendert bei jedem render() komplett neu (kein Diffing), ausser
   fuer Bilder, die per data-lazy-img nachgeladen werden (siehe images.js). Die Nutrition-Karte
   in der Detailansicht folgt demselben Lazy-Muster (data-lazy-nutrition), da das Ergebnis aus
   IndexedDB async geladen werden muss und der erste Render synchron bleiben soll. */

/* Zahlen mit Dezimalkomma (Schweizer/deutsche Schreibweise) */
function nutFmt(v) { return String(v).replace('.', ','); }

/* Wert oder Spanne als Text ("120–170"), ohne Einheit; null wenn nichts bekannt.
   mode: 'portion' | '100g' | 'total'. Bei einer Spanne gibt es bewusst keinen Exaktwert. */
function nutValueText(result, mode, key) {
  const exactSrc = mode === '100g' ? result.nutrientsPer100g : mode === 'total' ? result.nutrientsTotal : result.nutrientsPerPortion;
  const rangeSrc = mode === '100g' ? result.nutrientsPer100gRange : mode === 'total' ? result.nutrientsTotalRange : result.nutrientsPerPortionRange;
  const v = roundNutrientForDisplay(exactSrc ? exactSrc[key] : null);
  if (v !== null) return nutFmt(v);
  const r = rangeSrc ? rangeSrc[key] : null;
  if (result.rangeUsed && r && r.min !== r.max) return nutFmt(roundNutrientForDisplay(r.min)) + '–' + nutFmt(roundNutrientForDisplay(r.max));
  return null;
}
const NUT_RANGE_HINT = 'Menge als Bereich angegeben, Ergebnis als Spanne.';
const NUT_SERVINGS_HINT = 'Es fehlt die Angabe, wie viel das Rezept ergibt. Deshalb stehen hier Werte für das gesamte Rezept.';
const NUT_MISSING_HINT = '– heisst: Wert nicht bekannt, weil er für die berücksichtigten Zutaten fehlt. Er wird nicht als 0 gezählt.';
function nutritionResultHints(result) {
  return (result.rangeUsed ? `<p class="nutrition-hint-text">${NUT_RANGE_HINT}</p>` : '') + (result.needsServings ? `<p class="nutrition-hint-text">${NUT_SERVINGS_HINT}</p>` : '');
}

/* ---------- Bezugsbasis (v0.83) ----------
   Eine Quelle fuer App, Einkaufsvorschau und PDF: nutritionBasis(recipe) aus recipe-model.js.
   Gesamtertrag (1 Glas) und unbekannter Ertrag zeigen Werte fuer das gesamte Rezept; es wird keine Portion erfunden. */
function nutBasisFor(recipe, result) {
  const b = typeof nutritionBasis === 'function' ? nutritionBasis(recipe) : { kind: result && result.needsServings ? 'total' : 'portion', label: result && result.needsServings ? 'für das gesamte Rezept' : 'pro Portion' };
  if (result && (result.needsServings || result.wholeRecipe) && b.kind !== 'total') return { kind: 'total', divisor: 1, label: 'für das gesamte Rezept' };
  return b;
}
// Ueberschrift: «Geschätzte Nährwerte für das gesamte Rezept» | «… pro Portion» | «… pro Stück»
function nutBasisHeading(recipe, result) { return 'Geschätzte Nährwerte ' + nutBasisFor(recipe, result).label; }
// Nachvollziehbare Angabe statt einer Genauigkeitsstufe: «6 von 7 Zutaten berücksichtigt»
function nutCoverageText(result) {
  const total = result.relevantCount || 0;
  if (!total) return 'Keine berechenbare Zutat';
  return `${result.matchedCount || 0} von ${total} Zutat${total === 1 ? '' : 'en'} berücksichtigt`;
}
// Farbe der Angabe folgt dem Anteil berücksichtigter Zutaten (nicht einer abstrakten Genauigkeitsstufe)
function nutCoverageTone(result) {
  const total = result.relevantCount || 0, ok = result.matchedCount || 0;
  if (!total) return 'low';
  return ok >= total ? 'high' : ok / total >= 0.75 ? 'medium' : 'low';
}
// Zusatzzeile bei Gesamtertrag: Bezug offenlegen, ohne eine Portion zu erfinden
function nutBasisNote(recipe, result) {
  const info = typeof yieldInfo === 'function' ? yieldInfo(recipe) : null;
  if (info && info.kind === 'total' && !(result && result.needsServings)) return `Bezug: ${typeof yieldText === 'function' ? yieldText(recipe) : ''}. Eine Portion ist nicht festgelegt.`;
  return '';
}

/* ---------- Kompakte Karte (Punkt 24) — Platzhalter + Nachladen ---------- */
function nutritionCardSection(recipeId) {
  return `<div class="nutrition-section">
    <div data-lazy-nutrition data-recipe-id="${escapeAttr(recipeId)}" class="nutrition-card nutrition-card-loading">
      <span class="nutrition-loading-text">Wird geladen …</span>
    </div>
  </div>`;
}

/* Zutatenstatus fuer die Transparenz der Schaetzung: erkannt, unklar, fehlende Menge. */
function nutritionIngredientStatus(recipe, result) {
  const list = result.unresolvedIngredients || [];
  const missing = list.filter(u => u.reason && u.reason !== 'not-found' && u.reason !== 'uncertain-match');
  const unclear = list.filter(u => u.reason === 'not-found' || u.reason === 'uncertain-match');
  const matched = result.matchedCount || 0;
  const reasonText = (u) => u.reason === 'uncertain-match' ? `unsicher${u.candidate ? ', evtl. ' + escapeHtml(u.candidate) : ''}` : u.reason === 'not-found' ? 'nicht gefunden' : u.reason === 'no-name' ? 'Zutatenname fehlt (nur ein Hinweis in Klammern)' : 'Menge fehlt oder nicht umrechenbar';
  return `<div class="nutri-status">
    <div class="nutri-status-row">
      <span class="nutri-pill nutri-pill--ok">${matched} erkannt</span>
      ${unclear.length ? `<span class="nutri-pill nutri-pill--warn">${unclear.length} unklar</span>` : ''}
      ${missing.length ? `<span class="nutri-pill nutri-pill--warn">${missing.length} ohne Menge</span>` : ''}
    </div>
    ${(result.approximations || []).length ? `<p class="nutrition-hint-text">Ähnliches Lebensmittel verwendet: ${(result.approximations || []).map(a => escapeHtml(a.name) + ' (wie ' + escapeHtml(a.food.split(',')[0]) + ')').join(', ')}</p>` : ''}
    ${(result.unquantified || []).length ? `<p class="nutrition-hint-text">Ohne Mengenangabe nicht eingerechnet: ${(result.unquantified || []).map(escapeHtml).join(', ')}</p>` : ''}
    ${list.length ? `<details class="nutri-status-details"><summary>Nicht eingerechnet (${list.length})</summary><ul>${list.map(u => `<li><strong>${escapeHtml(u.name)}</strong>: ${reasonText(u)}</li>`).join('')}</ul>
      <button class="text-btn" data-action="nutrition-open-match" data-id="${escapeAttr(recipe.id)}">Zuordnung korrigieren</button></details>` : ''}
  </div>`;
}

/* Unvollstaendig: KEINE Portionswerte zeigen (eine Teilsumme wuerde wie ein vollstaendiger Wert wirken). */
function nutritionIncompleteInner(recipe, result) {
  const total = result.relevantCount || 0;
  return `
    <p class="nutrition-empty-text"><strong>Unvollständig berechnet:</strong> ${result.matchedCount || 0} von ${total} Zutaten konnten eingerechnet werden. Eine Portionssumme wäre daher zu niedrig und wird nicht angezeigt.</p>
    ${nutritionIngredientStatus(recipe, result)}
    <div class="nutrition-compact-actions">
      <button class="primary-btn" data-action="nutrition-open-match" data-id="${escapeAttr(recipe.id)}">${ICONS.apple} Zutaten zuordnen</button>
    </div>`;
}

function confidenceBadgeClass(confidence) {
  return confidence === 'high' ? 'high' : confidence === 'medium' ? 'medium' : 'low';
}

function nutritionCompactInner(recipe, result) {
  if (!result) {
    return `
      <p class="nutrition-empty-text">Noch nicht berechnet.</p>
      <button class="primary-btn" data-action="nutrition-open-match" data-id="${escapeAttr(recipe.id)}">Nährwerte berechnen</button>
    `;
  }
  const cmode = nutBasisFor(recipe, result).kind === 'total' ? 'total' : 'portion';   // Gesamtertrag oder Ausbeute unbekannt: Gesamtwerte statt Pro-Portion
  let anyMissing = false;
  const rows = NUTRITION_COMPACT_KEYS.map((key) => {
    const def = NUTRIENT_KEYS[key];
    const val = nutValueText(result, cmode, key);
    if (val === null) anyMissing = true;
    return `<div class="nutrition-compact-stat">
      <span class="nutrition-compact-value">${val === null ? '–' : tickerHtml(val, 'nut-' + recipe.id + '-' + key)}${val === null ? '' : ' ' + def.unit}</span>
      <span class="nutrition-compact-label">${def.label}</span>
    </div>`;
  }).join('');
  const note = nutBasisNote(recipe, result);
  return `
    <h3 class="nutrition-basis-title">${escapeHtml(nutBasisHeading(recipe, result))}</h3>
    ${note ? `<p class="nutrition-basis-note">${escapeHtml(note)}</p>` : ''}
    <div class="nutrition-compact-heading">
      <span class="nutrition-confidence-badge nutrition-coverage tone-${nutCoverageTone(result)}">${escapeHtml(nutCoverageText(result))}</span>
      ${result.unresolvedCount > 0 ? `<button class="nutrition-review-link" data-action="nutrition-open-match" data-id="${escapeAttr(recipe.id)}">${result.unresolvedCount} Zutat${result.unresolvedCount === 1 ? '' : 'en'} prüfen</button>` : ''}
    </div>
    <div class="nutrition-compact-grid">${rows}</div>
    ${anyMissing ? `<p class="nutrition-hint-text">${NUT_MISSING_HINT}</p>` : ''}
    ${nutritionResultHints(result)}
    ${nutritionIngredientStatus(recipe, result)}
    <div class="nutrition-compact-actions">
      <button class="nutrition-detail-link" data-action="nutrition-open-detail" data-id="${escapeAttr(recipe.id)}">Alle Nährwerte ${ICONS.chevronRight}</button>
      <button class="nutrition-recalc-link" data-action="nutrition-open-match" data-id="${escapeAttr(recipe.id)}">${ICONS.swap} Neu berechnen</button>
    </div>
  `;
}

/* Wird aus ui.js/bindEvents nach jedem render() aufgerufen (gleiches Muster wie
   hydrateLazyImages in images.js). Ersetzt den Platzhalter-Inhalt, OHNE einen vollen
   render() auszuloesen — die Nutzung von IndexedDB-Daten darf den ersten Render nicht
   blockieren. */
async function hydrateNutritionCards() {
  const nodes = document.querySelectorAll('[data-lazy-nutrition]');
  for (const node of nodes) {
    const recipeId = node.dataset.recipeId;
    const recipe = state.recipes.find((r) => r.id === recipeId);
    if (!recipe) continue;
    try {
      let st = await nutritionStatusFor(recipe);
      // Nichts berechnet oder veraltet: automatisch neu rechnen (lokal, dauert Millisekunden), damit man keinen Zwischenschritt braucht
      if (st.status === 'not-calculated' || st.status === 'stale') {
        try { await recalculateAndStoreNutrition(recipe); st = await nutritionStatusFor(recipe); } catch (e) { console.warn('Automatische Berechnung fehlgeschlagen', e); }
      }
      node.classList.remove('nutrition-card-loading');
      if (st.status === 'not-calculated') node.innerHTML = nutritionCompactInner(recipe, null);
      else if (st.status === 'stale') node.innerHTML = `
          <p class="nutrition-empty-text">${ICONS.sparkle} Die Nährwerte sind veraltet (Zutaten, Portionen oder die Berechnung haben sich geändert). Bitte neu berechnen.</p>
          <button class="primary-btn" data-action="nutrition-open-match" data-id="${escapeAttr(recipe.id)}">${ICONS.swap} Neu berechnen</button>`;
      else if (st.status === 'failed') node.innerHTML = `<p class="nutrition-empty-text">Die Nährwerte konnten nicht gelesen werden.</p>`;
      else if (st.status === 'incomplete') node.innerHTML = nutritionIncompleteInner(recipe, st.result);
      else node.innerHTML = nutritionCompactInner(recipe, st.result);
      node.querySelectorAll('[data-action]').forEach((el) => el.addEventListener('click', onAction));
      if (typeof initTickers === 'function') initTickers(node);
    } catch (err) {
      console.warn('Die Nährwert-Karte konnte nicht geladen werden.', err);
      node.classList.remove('nutrition-card-loading');
      node.innerHTML = `<p class="nutrition-empty-text">Nährwerte konnten nicht geladen werden.</p>`;
    }
  }
}

/* ---------- Matching-Screen (Punkt 71-73) ---------- */
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
    <h2 class="modal-title" id="nutrition-modal-title">Nährwerte vorbereiten</h2>
    <p class="nutrition-modal-subtitle">${sureCount} von ${items.length} Zutaten erkannt</p>
    ${reviewItems.some((i) => i.status === 'uncertain' && i.food) ? `<button type="button" class="outline-btn nutrition-accept-all" data-action="nutrition-accept-suggestions">Alle Vorschläge übernehmen</button>` : ''}
    ${reviewItems.length ? `<ul class="nutrition-match-list">${reviewItems.map(nutritionMatchRow).join('')}</ul>` : ''}
    ${sureCount ? `<details class="nutrition-sure-details">
      <summary>${sureCount} sicher erkannte Zutat${sureCount === 1 ? '' : 'en'} anzeigen</summary>
      <ul class="nutrition-match-list">${items.filter((i) => i.status === 'matched').map(nutritionMatchRow).join('')}</ul>
    </details>` : ''}
    ${!items.length ? `<p class="nutrition-empty-text">Keine berechenbaren Zutaten gefunden.</p>` : ''}
    <div class="form-actions">
      <button class="ghost-btn" data-action="close-modal">Abbrechen</button>
      <button class="primary-btn" data-action="nutrition-apply" data-id="${escapeAttr(recipe.id)}">Übernehmen</button>
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
      <button class="add-row-btn" data-action="nutrition-open-custom" data-name="${escapeHtml(target)}">${ICONS.plus} Eigenes Lebensmittel erstellen</button>
    </div>
    <div class="form-actions">
      <button class="ghost-btn" data-action="nutrition-back-to-match">Zurück</button>
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
      <button class="ghost-btn" data-action="nutrition-back-to-match">Abbrechen</button>
      <button class="primary-btn" data-action="nutrition-save-custom">Speichern</button>
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
    <div class="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="nutrition-modal-title" tabindex="-1" onclick="event.stopPropagation()">
      ${inner}
    </div>
  </div>`;
}

/* ---------- Vollstaendige Detailansicht (Punkt 25) ---------- */
const NUTRITION_GROUP_ORDER = [
  { key: 'energy', label: 'Energie' },
  { key: 'macro', label: 'Makronährstoffe' },
  { key: 'mineral', label: 'Mineralstoffe' },
  { key: 'vitamin', label: 'Vitamine' },
];

function nutritionValueFor(result, key, mode) {
  return nutValueText(result, mode || state.nutritionDetailMode, key);
}
/* Angebotene Bezuege der Detailansicht. Pro 100 g nur mit gewogenem Endgewicht: das Zutatengewicht ist bei gekochten
   oder reduzierten Rezepten nicht das Endgewicht (Wasser verdampft). Gesamtertrag: kein «pro Portion». */
function nutDetailModes(recipe, result) {
  const whole = nutBasisFor(recipe, result).kind === 'total';
  const piece = nutBasisFor(recipe, result).kind === 'piece';
  const modes = [];
  if (!whole) modes.push({ id: 'portion', label: piece ? 'Pro Stück' : 'Pro Portion' });
  modes.push({ id: 'total', label: 'Gesamtes Rezept' });
  if (result && result.finishedWeight > 0) modes.push({ id: '100g', label: 'Pro 100 g' });
  return modes;
}

function nutritionDetailGroup(group, result, mode) {
  const keys = Object.keys(NUTRIENT_KEYS).filter((k) => NUTRIENT_KEYS[k].group === group.key);
  const rows = keys.map((key) => {
    const def = NUTRIENT_KEYS[key];
    // F07: alle Ansichten gleich runden (Gesamt zeigte sonst Gleitkomma-Reste wie 22.648500000000006).
    const val = nutritionValueFor(result, key, mode);
    return `<div class="nutrition-nutrient-row">
      <span>${def.label}</span>
      <span>${val === null ? '–' : val + ' ' + def.unit}</span>
    </div>`;
  }).join('');
  return `<div class="nutrition-group">
    <h4 class="nutrition-group-title">${group.label}</h4>
    ${rows}
  </div>`;
}

function nutritionDetailModal(recipe, result) {
  if (!state.modal || state.modal.type !== 'nutrition-detail' || state.modal.recipeId !== recipe.id) return '';
  if (!result) {
    return `<div class="modal-backdrop" data-action="close-modal">
      <div class="modal-sheet" role="dialog" aria-modal="true" tabindex="-1" onclick="event.stopPropagation()">
        <h2 class="modal-title">Nährwerte</h2>
        <p class="nutrition-empty-text">Noch nicht berechnet.</p>
        <button class="ghost-btn" data-action="close-modal" style="width:100%;">Schliessen</button>
      </div>
    </div>`;
  }
  const modes = nutDetailModes(recipe, result);
  const mode = modes.some((m) => m.id === state.nutritionDetailMode) ? state.nutritionDetailMode : modes[0].id;
  const modeHeading = mode === '100g' ? 'Geschätzte Nährwerte pro 100 g' : mode === 'total' ? 'Geschätzte Nährwerte für das gesamte Rezept' : nutBasisHeading(recipe, result);
  const note = nutBasisNote(recipe, result);
  const hasRealSource = result.sourceDataVersions && Object.keys(result.sourceDataVersions).length > 0;
  const sourceLabel = hasRealSource ? nutritionSourceLabel(result.sourceDataVersions) : null;
  return `<div class="modal-backdrop" data-action="close-modal">
    <div class="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="nutrition-detail-title" tabindex="-1" onclick="event.stopPropagation()">
      <h2 class="modal-title" id="nutrition-detail-title">Nährwerte</h2>
      ${modes.length > 1 ? `<div class="nutrition-segmented" role="radiogroup" aria-label="Bezug der Nährwerte">
        ${modes.map((m) => `<button role="radio" aria-checked="${mode === m.id}" class="${mode === m.id ? 'active' : ''}" data-action="nutrition-set-mode" data-mode="${m.id}">${m.label}</button>`).join('')}
      </div>` : ''}
      <p class="nutrition-basis-title">${escapeHtml(modeHeading)}</p>
      ${note ? `<p class="nutrition-basis-note">${escapeHtml(note)}</p>` : ''}
      <div class="nutrition-confidence-line">
        <span class="nutrition-confidence-badge nutrition-coverage tone-${nutCoverageTone(result)}">${escapeHtml(nutCoverageText(result))}</span>
        <span class="nutrition-confidence-detail">${escapeHtml(result.confidenceDetail)}</span>
      </div>
      ${nutritionResultHints(result)}
      <p class="nutrition-hint-text">${NUT_MISSING_HINT}</p>
      <div class="field" style="margin:14px 0;">
        <label for="nutritionFinishedWeight">Gewicht nach dem Kochen (g, optional)</label>
        <input type="number" min="1" id="nutritionFinishedWeight" value="${recipe.nutritionFinishedWeight || ''}" aria-describedby="nutritionFinishedWeightHint">
        <p class="hint-line" id="nutritionFinishedWeightHint">Nur mit dem gewogenen Endgewicht gibt es Werte pro 100 g. Beim Kochen verdampft Wasser, deshalb gilt das Gewicht der Zutaten nicht als Endgewicht.</p>
      </div>
      <button class="ghost-btn" data-action="nutrition-save-finished-weight" data-id="${escapeAttr(recipe.id)}" style="width:100%;margin-bottom:14px;">Gewicht speichern</button>
      ${NUTRITION_GROUP_ORDER.map((g) => nutritionDetailGroup(g, result, mode)).join('')}
      ${sourceLabel ? `<p class="nutrition-source-line">${ICONS.book} ${escapeHtml(sourceLabel)}</p>` : ''}
      <p class="nutrition-disclaimer">Geschätzte Werte. Je nach Zutaten und Mengen können sie abweichen. Keine medizinische Aussage und keine Grundlage für Entscheidungen bei Allergien oder Unverträglichkeiten.</p>
      <div class="form-actions">
        <button class="ghost-btn" data-action="nutrition-open-match" data-id="${escapeAttr(recipe.id)}">Zuordnung bearbeiten</button>
        <button class="primary-btn" data-action="close-modal">Schliessen</button>
      </div>
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
