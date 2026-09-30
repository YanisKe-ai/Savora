/* ---------- PDF-Export-UI (Implementierungsauftrag Punkt 59, 65) ----------
   Zwischenschritt vor dem eigentlichen PDF-Export: Nährwerte-Umfang waehlen, dann eine Vorschau
   zeigen, bevor die Datei tatsaechlich heruntergeladen wird — statt wie zuvor sofort beim Klick
   auf den Export-Button die Datei zu erzeugen und direkt herunterzuladen. */

async function defaultPdfNutritionDetail(target, recipeId) {
  if (!state.showNutrition) return 'off';
  try {
    if (target === 'single') {
      const rec = state.recipes.find((x) => x.id === recipeId);
      const st = rec ? await nutritionStatusFor(rec) : { status: 'not-calculated' };
      return st.status === 'calculated' ? 'compact' : 'off';
    }
    // Kochbuch: reicht, wenn IRGENDEIN Rezept bereits Naehrwerte hat, dass der Umfang-Schalter
    // sinnvoll auf "kompakt" vorbelegt ist — Rezepte ohne Ergebnis zeigen ohnehin keine Box.
    for (const r of state.recipes) {
      if ((await nutritionStatusFor(r)).status === 'calculated') return 'compact';
    }
    return 'off';
  } catch (e) {
    return 'off';
  }
}

function pdfExportOptionsStage() {
  const m = state.modal;
  const level = m.nutritionDetail;
  const title = m.target === 'cookbook' ? 'Kochbuch als PDF exportieren' : 'Als PDF exportieren';
  return `
    <h3 class="modal-title" id="pdf-export-title">${title}</h3>
    <p class="nutrition-modal-subtitle">Vorlage</p>
    <div class="pdf-tpl-choice" role="radiogroup" aria-label="PDF-Vorlage">
      ${Object.values(PDF_TEMPLATES).map((t) => `<button type="button" role="radio" aria-checked="${m.template === t.id}" class="pdf-tpl-opt ${m.template === t.id ? 'active' : ''}" data-action="pdf-export-set-template" data-id="${t.id}"><span class="pdf-tpl-swatch pdf-tpl-swatch-${t.id.toLowerCase()}" aria-hidden="true"></span><b>${t.id} · ${t.name}</b><small>${t.hint}</small></button>`).join('')}
    </div>
    ${state.showNutrition ? `    <p class="nutrition-modal-subtitle">Nährwerte im PDF</p>
    <div class="nutrition-segmented" role="radiogroup" aria-label="Nährwerte-Detailgrad">
      <button role="radio" aria-checked="${level === 'off'}" class="${level === 'off' ? 'active' : ''}" data-action="pdf-export-set-detail" data-level="off">Aus</button>
      <button role="radio" aria-checked="${level === 'compact'}" class="${level === 'compact' ? 'active' : ''}" data-action="pdf-export-set-detail" data-level="compact">Kompakt</button>
      <button role="radio" aria-checked="${level === 'full'}" class="${level === 'full' ? 'active' : ''}" data-action="pdf-export-set-detail" data-level="full">Erweitert</button>
    </div>` : ''}
    <div class="form-actions">
      <button class="ghost-btn" data-action="close-modal">Abbrechen</button>
      <button class="primary-btn" data-action="pdf-export-build">${ICONS.pdf} PDF erstellen</button>
    </div>
  `;
}

function pdfExportBuildingStage() {
  return `
    <h3 class="modal-title">PDF wird erstellt …</h3>
    <p class="nutrition-empty-text">Das kann bei vielen Rezepten oder grossen Fotos einen Moment dauern.</p>
  `;
}

/* Punkt 2 (Direkter Update-Prompt): Vorschau soll auf Mobile eigenstaendiger Fullscreen-Screen
   sein statt kleinem Modal, und Teilen muss denselben bereits erzeugten Blob nutzen statt das
   PDF ein zweites Mal (evtl. anders) zu rendern. */
function pdfExportPreviewStage() {
  const m = state.modal;
  const canShare = SavoraNative.isNative || (typeof navigator !== 'undefined' && !!navigator.share);
  return `
    <div class="pdf-preview-header">
      <h3 class="modal-title" id="pdf-export-title">Vorschau</h3>
      <span class="pdf-preview-meta" aria-live="polite">${m.pageCount ? m.pageCount + (m.pageCount === 1 ? ' Seite' : ' Seiten') : ''}${m.template ? ' · Vorlage ' + m.template : ''}</span>
      ${pdfPreviewUsesCanvas() ? `<span class="pdf-zoom"><button class="icon-btn" data-action="pdf-zoom" data-id="out" aria-label="Verkleinern" ${(m.zoom || 1) <= 1 ? 'disabled' : ''}>−</button><button class="icon-btn" data-action="pdf-zoom" data-id="in" aria-label="Vergrössern" ${(m.zoom || 1) >= 3 ? 'disabled' : ''}>+</button></span>` : ''}
      <button class="icon-btn pdf-preview-close" data-action="pdf-export-back" aria-label="Vorschau schliessen, zurück zu den Optionen">${ICONS.back}</button>
    </div>
    <div class="pdf-preview-frame-wrap">
      ${pdfPreviewUsesCanvas()
        ? `<div class="pdf-pages" id="pdfPages" style="--pdf-zoom:${m.zoom || 1}" tabindex="0" aria-label="PDF-Vorschau: ${escapeHtml(m.filename || 'Savora-PDF')}"></div>`
        : `<iframe class="pdf-preview-frame" src="${m.previewUrl}" title="PDF-Vorschau: ${escapeHtml(m.filename || 'Savora-PDF')}"></iframe>`}
    </div>
    <div class="form-actions pdf-preview-actions">
      ${canShare ? `<button class="primary-btn" data-action="pdf-export-share" aria-label="PDF teilen">${ICONS.share} Teilen</button>
      <button class="ghost-btn" data-action="pdf-export-download" aria-label="PDF herunterladen">${ICONS.download} Speichern</button>`
      : `<button class="primary-btn" data-action="pdf-export-download" aria-label="PDF herunterladen">${ICONS.download} Herunterladen</button>`}
    </div>
  `;
}

function pdfExportModal() {
  if (!state.modal || state.modal.type !== 'pdf-export') return '';
  const stage = state.modal.stage || 'options';
  const inner = stage === 'building' ? pdfExportBuildingStage()
    : stage === 'preview' ? pdfExportPreviewStage()
    : pdfExportOptionsStage();
  return `<div class="modal-backdrop" data-action="${stage === 'preview' ? 'noop' : 'close-modal'}">
    <div class="modal-sheet pdf-export-sheet ${stage === 'preview' ? 'pdf-preview-fullscreen' : ''}" role="dialog" aria-modal="true" aria-labelledby="pdf-export-title" tabindex="-1" onclick="event.stopPropagation()">
      ${inner}
    </div>
  </div>`;
}

/* Muss beim Schliessen/Verlassen der Vorschau aufgerufen werden, sonst bleibt der Blob-URL
   (und damit der PDF-Blob im Speicher) unnoetig bestehen. */
function revokePdfPreviewUrl() {
  if (state.modal && state.modal.type === 'pdf-export' && state.modal.previewUrl) {
    URL.revokeObjectURL(state.modal.previewUrl);
  }
}
