/* ---------- PDF-Export-UI (Implementierungsauftrag Punkt 59, 65) ----------
   Zwischenschritt vor dem eigentlichen PDF-Export: Nährwerte-Umfang waehlen, dann eine Vorschau
   zeigen, bevor die Datei tatsaechlich heruntergeladen wird — statt wie zuvor sofort beim Klick
   auf den Export-Button die Datei zu erzeugen und direkt herunterzuladen. */

async function defaultPdfNutritionDetail(target, recipeId) {
  try {
    if (target === 'single') {
      const result = await dbGetNutritionResult(recipeId);
      return result ? 'compact' : 'off';
    }
    // Kochbuch: reicht, wenn IRGENDEIN Rezept bereits Naehrwerte hat, dass der Umfang-Schalter
    // sinnvoll auf "kompakt" vorbelegt ist — Rezepte ohne Ergebnis zeigen ohnehin keine Box.
    for (const r of state.recipes) {
      if (await dbGetNutritionResult(r.id)) return 'compact';
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
    <p class="nutrition-modal-subtitle">Nährwerte im PDF</p>
    <div class="nutrition-segmented" role="tablist" style="margin-bottom:20px;">
      <button role="tab" aria-selected="${level === 'off'}" class="${level === 'off' ? 'active' : ''}" data-action="pdf-export-set-detail" data-level="off">Aus</button>
      <button role="tab" aria-selected="${level === 'compact'}" class="${level === 'compact' ? 'active' : ''}" data-action="pdf-export-set-detail" data-level="compact">Kompakt</button>
      <button role="tab" aria-selected="${level === 'full'}" class="${level === 'full' ? 'active' : ''}" data-action="pdf-export-set-detail" data-level="full">Vollständig</button>
    </div>
    <div class="form-actions">
      <button class="ghost-btn" data-action="close-modal" style="flex:1;">Abbrechen</button>
      <button class="primary-btn" data-action="pdf-export-build" style="flex:1;justify-content:center;">${ICONS.pdf} PDF erstellen</button>
    </div>
  `;
}

function pdfExportBuildingStage() {
  return `
    <h3 class="modal-title">PDF wird erstellt …</h3>
    <p class="nutrition-empty-text">Das kann bei vielen Rezepten oder grossen Fotos einen Moment dauern.</p>
  `;
}

function pdfExportPreviewStage() {
  const m = state.modal;
  return `
    <h3 class="modal-title" id="pdf-export-title">Vorschau</h3>
    <div class="pdf-preview-frame-wrap">
      <iframe class="pdf-preview-frame" src="${m.previewUrl}" title="PDF-Vorschau"></iframe>
    </div>
    <div class="form-actions">
      <button class="ghost-btn" data-action="pdf-export-back" style="flex:1;">Zurück</button>
      <button class="primary-btn" data-action="pdf-export-download" style="flex:1;justify-content:center;">${ICONS.download} Herunterladen</button>
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
    <div class="modal-sheet pdf-export-sheet" role="dialog" aria-modal="true" aria-labelledby="pdf-export-title" tabindex="-1" onclick="event.stopPropagation()">
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
