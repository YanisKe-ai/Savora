/* ---------- Nutrition: UI (Implementierungsauftrag Teil C, Punkt 24-25, 70-75) ----------
   Eigene Datei statt Erweiterung von views.js/ui.js, da beide bereits ~600 Zeilen haben
   und die Nutrition-UI ein klar abgegrenzter Themenblock ist (gleiche Begruendung wie die
   Aufteilung von nutrition-swiss/-units/-matcher/-calculator in Phase 1+2).

   Architektur-Hinweis: Savora rendert bei jedem render() komplett neu (kein Diffing), ausser
   fuer Bilder, die per data-lazy-img nachgeladen werden (siehe images.js). Die Nutrition-Karte
   in der Detailansicht folgt demselben Lazy-Muster (data-lazy-nutrition), da das Ergebnis aus
   IndexedDB async geladen werden muss und der erste Render synchron bleiben soll. */

/* ---------- Kompakte Karte (Punkt 24) — Platzhalter + Nachladen ---------- */
function nutritionCardSection(recipeId) {
  return `<div class="nutrition-section">
    <h2 class="section-heading">${ICONS.apple} Nährwerte</h2>
    <div data-lazy-nutrition data-recipe-id="${recipeId}" class="nutrition-card nutrition-card-loading">
      <span class="nutrition-loading-text">Wird geladen …</span>
    </div>
  </div>`;
}

function confidenceBadgeClass(confidence) {
  return confidence === 'high' ? 'high' : confidence === 'medium' ? 'medium' : 'low';
}

function nutritionCompactInner(recipe, result) {
  if (!result) {
    return `
      <p class="nutrition-empty-text">Noch nicht berechnet.</p>
      <button class="primary-btn" data-action="nutrition-open-match" data-id="${recipe.id}">${ICONS.apple} Nährwerte automatisch berechnen</button>
    `;
  }
  const rows = NUTRITION_COMPACT_KEYS.map((key) => {
    const def = NUTRIENT_KEYS[key];
    const val = result.nutrientsPerPortion[key];
    return `<div class="nutrition-compact-stat">
      <span class="nutrition-compact-value">${val === null ? '–' : val}${val === null ? '' : ' ' + def.unit}</span>
      <span class="nutrition-compact-label">${def.label}</span>
    </div>`;
  }).join('');
  const conf = NUTRITION_CONFIDENCE[result.confidence] || NUTRITION_CONFIDENCE.low;
  return `
    <div class="nutrition-compact-heading">
      <span class="nutrition-confidence-badge tone-${confidenceBadgeClass(result.confidence)}">${conf.label}</span>
      ${result.unresolvedCount > 0 ? `<button class="nutrition-review-link" data-action="nutrition-open-match" data-id="${recipe.id}">${result.unresolvedCount} Zutat${result.unresolvedCount === 1 ? '' : 'en'} prüfen</button>` : ''}
    </div>
    <div class="nutrition-compact-grid">${rows}</div>
    <div class="nutrition-compact-actions">
      <button class="nutrition-detail-link" data-action="nutrition-open-detail" data-id="${recipe.id}">Alle Nährwerte ${ICONS.chevronRight}</button>
      <button class="nutrition-recalc-link" data-action="nutrition-open-match" data-id="${recipe.id}">${ICONS.swap} Neu berechnen</button>
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
      const result = await getFreshNutritionResult(recipe);
      node.classList.remove('nutrition-card-loading');
      if (!result) {
        // Entweder nie berechnet, oder veraltet (Zutaten/Portionen geaendert seit letzter Berechnung).
        const stored = await dbGetNutritionResult(recipe.id);
        node.innerHTML = stored ? `
          <p class="nutrition-empty-text">${ICONS.sparkle} Zutaten haben sich geändert — Nährwerte sind veraltet.</p>
          <button class="primary-btn" data-action="nutrition-open-match" data-id="${recipe.id}">${ICONS.swap} Neu berechnen</button>
        ` : nutritionCompactInner(recipe, null);
      } else {
        node.innerHTML = nutritionCompactInner(recipe, result);
      }
      node.querySelectorAll('[data-action]').forEach((el) => el.addEventListener('click', onAction));
    } catch (err) {
      console.warn('Nutrition-Karte konnte nicht geladen werden.', err);
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
  const foodName = item.food ? escapeHtml(item.food.name) : null;
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
  </li>`;
}

function nutritionMatchStage(recipe) {
  const items = state.nutritionMatchItems;
  const sureCount = items.filter((i) => i.status === 'matched').length;
  const reviewItems = items.filter((i) => i.status !== 'matched');
  return `
    <h3 class="modal-title" id="nutrition-modal-title">Nährwerte vorbereiten</h3>
    <p class="nutrition-modal-subtitle">${sureCount} von ${items.length} Zutaten erkannt</p>
    ${reviewItems.length ? `<ul class="nutrition-match-list">${reviewItems.map(nutritionMatchRow).join('')}</ul>` : ''}
    ${sureCount ? `<details class="nutrition-sure-details">
      <summary>${sureCount} sicher erkannte Zutat${sureCount === 1 ? '' : 'en'} anzeigen</summary>
      <ul class="nutrition-match-list">${items.filter((i) => i.status === 'matched').map(nutritionMatchRow).join('')}</ul>
    </details>` : ''}
    ${!items.length ? `<p class="nutrition-empty-text">Keine berechenbaren Zutaten gefunden.</p>` : ''}
    <div class="form-actions">
      <button class="ghost-btn" data-action="close-modal" style="flex:1;">Abbrechen</button>
      <button class="primary-btn" data-action="nutrition-apply" data-id="${recipe.id}" style="flex:1;justify-content:center;">Übernehmen</button>
    </div>
  `;
}

/* ---------- Manuelle Auswahl (Punkt 72) ---------- */
function nutritionFoodCandidateRow(food, targetName) {
  return `<li>
    <button type="button" class="nutrition-candidate-item" data-action="nutrition-confirm-match" data-name="${escapeHtml(targetName)}" data-food-id="${escapeHtml(food.id)}" aria-label="${escapeHtml(food.name)} für ${escapeHtml(targetName)} übernehmen">
      <span class="nutrition-candidate-name">${escapeHtml(food.name)}</span>
      <span class="nutrition-candidate-source">${food.source === 'custom' ? 'Eigenes Lebensmittel' : 'CH-Nährwertdatenbank'}</span>
    </button>
  </li>`;
}

function nutritionSelectStage(recipe) {
  const target = state.nutritionSelectTarget;
  const results = state.nutritionSearchResults || [];
  return `
    <h3 class="modal-title" id="nutrition-modal-title">Lebensmittel für „${escapeHtml(target)}"</h3>
    <div class="field" style="margin-bottom:10px;">
      <input type="text" id="nutritionSearchInput" placeholder="Lebensmittel suchen …" value="${escapeHtml(state.nutritionSearchQuery || '')}" autocomplete="off">
    </div>
    ${results.length ? `<ul class="nutrition-match-list">${results.map((f) => nutritionFoodCandidateRow(f, target)).join('')}</ul>`
      : `<p class="nutrition-empty-text">${state.nutritionSearchQuery ? 'Keine Treffer in deinen Lebensmitteln.' : 'Suchbegriff eingeben, Barcode scannen oder unten ein eigenes Lebensmittel anlegen.'}</p>`}
    <div class="nutrition-select-actions">
      <button class="add-row-btn" data-action="nutrition-open-barcode" data-name="${escapeHtml(target)}">${ICONS.scale} Barcode scannen (Open Food Facts)</button>
      <button class="add-row-btn" data-action="nutrition-open-custom" data-name="${escapeHtml(target)}">${ICONS.plus} Eigenes Lebensmittel erstellen</button>
    </div>
    <div class="form-actions">
      <button class="ghost-btn" data-action="nutrition-back-to-match" style="flex:1;">Zurück</button>
    </div>
  `;
}

/* ---------- Barcode-Scan (Punkt 27) ---------- */
let nutritionCameraStream = null;
let nutritionCameraRAF = null;
let nutritionBarcodeDetector = null;

function nutritionCameraSupported() {
  return typeof window.BarcodeDetector !== 'undefined';
}

function stopNutritionBarcodeCamera() {
  if (nutritionCameraRAF) { cancelAnimationFrame(nutritionCameraRAF); nutritionCameraRAF = null; }
  if (nutritionCameraStream) { nutritionCameraStream.getTracks().forEach((t) => t.stop()); nutritionCameraStream = null; }
}

async function lookupBarcodeAndRender(code) {
  state.nutritionBarcodeStatus = 'looking-up';
  render();
  const { status, food } = await fetchOffProductByBarcode(code);
  state.nutritionBarcodeStatus = status;
  state.nutritionBarcodeProduct = food;
  render();
}

async function startNutritionBarcodeCamera() {
  const video = document.getElementById('nutritionBarcodeVideo');
  if (!video || !nutritionCameraSupported()) return;
  try {
    nutritionCameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch (err) {
    showToast('Kamerazugriff nicht möglich — bitte Barcode manuell eingeben', 'error');
    return;
  }
  video.srcObject = nutritionCameraStream;
  await video.play().catch(() => {});
  nutritionBarcodeDetector = nutritionBarcodeDetector || new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });

  const scanFrame = async () => {
    if (!nutritionCameraStream) return; // Kamera inzwischen gestoppt (Modal geschlossen/gewechselt)
    try {
      const codes = await nutritionBarcodeDetector.detect(video);
      if (codes.length) {
        const value = codes[0].rawValue;
        stopNutritionBarcodeCamera();
        state.nutritionBarcodeInput = value;
        await lookupBarcodeAndRender(value);
        return;
      }
    } catch (err) { /* einzelner Frame darf fehlschlagen, naechster Versuch folgt */ }
    nutritionCameraRAF = requestAnimationFrame(scanFrame);
  };
  nutritionCameraRAF = requestAnimationFrame(scanFrame);
}

function nutritionBarcodeStage() {
  const supported = nutritionCameraSupported();
  const status = state.nutritionBarcodeStatus;
  const product = state.nutritionBarcodeProduct;
  const statusMessages = {
    'not-found': 'Kein Produkt mit diesem Barcode gefunden.',
    offline: 'Keine Internetverbindung — Barcode-Suche nicht möglich.',
    error: 'Open Food Facts ist momentan nicht erreichbar.',
    invalid: 'Das sieht nicht nach einem gültigen Barcode aus (6–14 Ziffern).',
  };
  return `
    <h3 class="modal-title" id="nutrition-modal-title">Barcode scannen</h3>
    ${supported ? `
      <div class="nutrition-camera-wrap">
        <video id="nutritionBarcodeVideo" playsinline muted></video>
      </div>
      <button class="ghost-btn" data-action="nutrition-start-camera" style="width:100%;margin-bottom:12px;">${ICONS.scale} Kamera starten</button>
    ` : `<p class="nutrition-hint-text">Dein Browser unterstützt keine automatische Barcode-Erkennung — bitte den Barcode manuell eingeben.</p>`}
    <div class="field">
      <label for="nutritionBarcodeManual">Barcode manuell eingeben</label>
      <input type="text" inputmode="numeric" id="nutritionBarcodeManual" placeholder="z.B. 7612345678901" value="${escapeHtml(state.nutritionBarcodeInput || '')}">
    </div>
    <button class="primary-btn" data-action="nutrition-barcode-lookup" style="width:100%;justify-content:center;margin-bottom:14px;">Suchen</button>

    ${status === 'looking-up' ? `<p class="nutrition-empty-text">Suche läuft …</p>` : ''}
    ${statusMessages[status] ? `<p class="nutrition-hint-text">${statusMessages[status]}</p>` : ''}
    ${status === 'found' && product ? `
      <div class="nutrition-candidate-item" style="cursor:default;margin-bottom:14px;">
        <span class="nutrition-candidate-name">${escapeHtml(product.name)}</span>
        <span class="nutrition-candidate-source">${product.brand ? escapeHtml(product.brand) + ' · ' : ''}Open Food Facts</span>
      </div>
      <button class="primary-btn" data-action="nutrition-confirm-match" data-name="${escapeHtml(state.nutritionSelectTarget)}" data-food-id="${escapeHtml(product.id)}" style="width:100%;justify-content:center;margin-bottom:14px;">Übernehmen</button>
    ` : ''}
    <div class="form-actions">
      <button class="ghost-btn" data-action="nutrition-close-barcode" style="flex:1;">Zurück</button>
    </div>
  `;
}

/* ---------- Eigenes Lebensmittel (Punkt 9, 72) ---------- */
function nutritionCustomStage() {
  const target = state.nutritionSelectTarget;
  const field = (id, label, unit) => `<div class="field" style="margin-bottom:10px;">
    <label for="${id}">${label}${unit ? ` (${unit})` : ''}</label>
    <input type="text" inputmode="decimal" id="${id}" placeholder="0">
  </div>`;
  return `
    <h3 class="modal-title" id="nutrition-modal-title">Eigenes Lebensmittel</h3>
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
      <button class="ghost-btn" data-action="nutrition-back-to-match" style="flex:1;">Abbrechen</button>
      <button class="primary-btn" data-action="nutrition-save-custom" style="flex:1;justify-content:center;">Speichern</button>
    </div>
  `;
}

/* ---------- Root-Dispatch fuer den Matching-Modal (type: 'nutrition') ---------- */
function nutritionModal(recipe) {
  if (!state.modal || state.modal.type !== 'nutrition' || state.modal.recipeId !== recipe.id) return '';
  const stage = state.modal.stage || 'match';
  const inner = stage === 'select' ? nutritionSelectStage(recipe)
    : stage === 'custom' ? nutritionCustomStage()
    : stage === 'barcode' ? nutritionBarcodeStage()
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

function nutritionValueFor(result, key) {
  const mode = state.nutritionDetailMode;
  const src = mode === '100g' ? result.nutrientsPer100g : mode === 'total' ? result.nutrientsTotal : result.nutrientsPerPortion;
  return src[key];
}

function nutritionDetailGroup(group, result) {
  const keys = Object.keys(NUTRIENT_KEYS).filter((k) => NUTRIENT_KEYS[k].group === group.key);
  const rows = keys.map((key) => {
    const def = NUTRIENT_KEYS[key];
    const val = nutritionValueFor(result, key);
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
        <h3 class="modal-title">Nährwerte</h3>
        <p class="nutrition-empty-text">Noch nicht berechnet.</p>
        <button class="ghost-btn" data-action="close-modal" style="width:100%;">Schliessen</button>
      </div>
    </div>`;
  }
  const conf = NUTRITION_CONFIDENCE[result.confidence] || NUTRITION_CONFIDENCE.low;
  const mode = state.nutritionDetailMode;
  const hasRealSource = result.sourceDataVersions && Object.keys(result.sourceDataVersions).length > 0;
  const sourceLabel = hasRealSource ? nutritionSourceLabel(result.sourceDataVersions) : null;
  return `<div class="modal-backdrop" data-action="close-modal">
    <div class="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="nutrition-detail-title" tabindex="-1" onclick="event.stopPropagation()">
      <h3 class="modal-title" id="nutrition-detail-title">Nährwerte</h3>
      <div class="nutrition-segmented" role="tablist">
        <button role="tab" aria-selected="${mode === 'portion'}" class="${mode === 'portion' ? 'active' : ''}" data-action="nutrition-set-mode" data-mode="portion">Pro Portion</button>
        <button role="tab" aria-selected="${mode === '100g'}" class="${mode === '100g' ? 'active' : ''}" data-action="nutrition-set-mode" data-mode="100g">Pro 100 g</button>
        <button role="tab" aria-selected="${mode === 'total'}" class="${mode === 'total' ? 'active' : ''}" data-action="nutrition-set-mode" data-mode="total">Gesamt</button>
      </div>
      <div class="nutrition-confidence-line">
        <span class="nutrition-confidence-badge tone-${confidenceBadgeClass(result.confidence)}">${conf.label}</span>
        <span class="nutrition-confidence-detail">${escapeHtml(result.confidenceDetail)}</span>
      </div>
      ${mode === '100g' && result.per100Estimated ? `<p class="nutrition-hint-text">Fertiggewicht nicht bekannt — Werte pro 100 g sind geschätzt (aus Zutatengewicht).</p>` : ''}
      <div class="field" style="margin:14px 0;">
        <label for="nutritionFinishedWeight">Fertiggewicht (g, optional — für genauere „Pro 100 g"-Werte)</label>
        <input type="number" min="1" id="nutritionFinishedWeight" value="${recipe.nutritionFinishedWeight || ''}" placeholder="z.B. ${result.totalWeight || ''}">
      </div>
      <button class="ghost-btn" data-action="nutrition-save-finished-weight" data-id="${recipe.id}" style="width:100%;margin-bottom:14px;">Fertiggewicht speichern</button>
      ${NUTRITION_GROUP_ORDER.map((g) => nutritionDetailGroup(g, result)).join('')}
      ${sourceLabel ? `<p class="nutrition-source-line">${ICONS.book} ${escapeHtml(sourceLabel)}</p>` : ''}
      <p class="nutrition-disclaimer">Berechnete Nährwerte sind Durchschnitts- bzw. Schätzwerte und können je nach Produkt, Zubereitung und tatsächlicher Menge abweichen. Keine medizinische Aussage.</p>
      <div class="form-actions">
        <button class="ghost-btn" data-action="nutrition-open-match" data-id="${recipe.id}" style="flex:1;">Zuordnung bearbeiten</button>
        <button class="primary-btn" data-action="close-modal" style="flex:1;justify-content:center;">Schliessen</button>
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
