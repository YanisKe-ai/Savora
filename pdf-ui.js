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
    <h2 class="modal-title" id="pdf-export-title">${title}</h2>
    ${m.target === 'cookbook'
      ? `<p class="nutrition-modal-subtitle">Seitenstil der Rezepte</p>
    <p class="pdf-style-fixed" id="pdfStyleFixed"><b>${escapeHtml(pdfTemplateById(m.template).name)}</b> <span class="hint-line">Den Seitenstil änderst du im Kochbuch unter «Gestalten».</span></p>`
      : `<p class="nutrition-modal-subtitle">Seitenstil</p>
    <div class="pdf-tpl-choice" role="radiogroup" aria-label="Seitenstil">
      ${Object.values(PDF_TEMPLATES).map((t) => `<button type="button" role="radio" aria-checked="${m.template === t.id}" class="pdf-tpl-opt ${m.template === t.id ? 'active' : ''}" data-action="pdf-export-set-template" data-id="${escapeAttr(t.id)}"><span class="pdf-tpl-swatch pdf-tpl-swatch-${t.id.toLowerCase()}" aria-hidden="true"></span><b>${t.name}</b><small>${t.hint}</small></button>`).join('')}
    </div>`}
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
    <h2 class="modal-title" id="pdf-export-title">PDF wird erstellt …</h2>
    <div class="pdf-progress" id="pdfProgressBar" role="progressbar" aria-labelledby="pdf-export-title" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div>
    <p class="pdf-progress-text" id="pdfProgressText" role="status" aria-live="polite">Wird vorbereitet …</p>
    <p class="nutrition-empty-text">Das kann bei vielen Rezepten oder grossen Fotos einen Moment dauern.</p>
    <div class="form-actions"><button class="ghost-btn" data-action="pdf-export-cancel">Abbrechen</button></div>
  `;
}

function pdfExportErrorStage() {
  const m = state.modal;
  return `
    <h2 class="modal-title" id="pdf-export-title">PDF konnte nicht erstellt werden</h2>
    <p class="nutrition-empty-text pdf-error-text" role="alert">${escapeHtml(m.errorText || 'Deine Rezepte sind unverändert. Versuche es noch einmal.')}</p>
    <div class="form-actions">
      <button class="ghost-btn" data-action="pdf-export-back">Zurück</button>
      <button class="primary-btn" data-action="pdf-export-build">Erneut versuchen</button>
    </div>
  `;
}

/* Seitenzahl in Worten fuer die Erklaerung bei mehrseitigen Rezepten */
function pdfPageCountWord(n) { return ({ 2: 'zwei', 3: 'drei', 4: 'vier', 5: 'fünf', 6: 'sechs', 7: 'sieben', 8: 'acht' })[n] || String(n); }
function pdfMultiPageNote(m) {
  return m.target === 'single' && m.pageCount > 1 ? `Dieses Rezept erhält ${pdfPageCountWord(m.pageCount)} Seiten, damit alles gut lesbar bleibt.` : '';
}

/* ---------- Ablauf: erzeugen -> Vorschau -> Download (immer dieselben Bytes) ----------
   Das PDF wird genau einmal erzeugt. Vorschau, Herunterladen und Teilen verwenden dasselbe Blob-Objekt
   (state.modal.previewBlob). Ein laufender Export kann abgebrochen werden (Abbrechen, Dialog schliessen);
   ein zweiter Start waehrend des Laufs wird ignoriert. */
let _pdfExportRun = null;
function pdfExportAbort() {
  if (_pdfExportRun) { try { _pdfExportRun.ctrl.abort(); } catch (e) { /* schon beendet */ } _pdfExportRun = null; }
}
function pdfExportShowProgress(m, p) {
  if (state.modal !== m || m.stage !== 'building') return;
  const single = m.target !== 'cookbook';
  let frac = 0, text = 'Wird vorbereitet …';
  if (p.label === 'plan') { frac = (single ? 0.3 : 0.4) * (p.done / Math.max(1, p.total)); text = single ? 'Seiten werden gesetzt …' : `Rezept ${Math.min(p.total, p.done + 1)} von ${p.total} wird gesetzt …`; }
  else if (p.label === 'render') { frac = (single ? 0.3 : 0.4) + (single ? 0.7 : 0.6) * (p.done / Math.max(1, p.total)); text = p.done >= p.total ? 'Datei wird abgeschlossen …' : `Seite ${p.done + 1} von ${p.total} wird erstellt …`; }
  const bar = document.getElementById('pdfProgressBar'), txt = document.getElementById('pdfProgressText');
  if (bar) { bar.setAttribute('aria-valuenow', String(Math.round(frac * 100))); const f = bar.firstElementChild; if (f) f.style.width = Math.round(frac * 100) + '%'; }
  if (txt) txt.textContent = text;
}
async function pdfExportBuildAction() {
  const m = state.modal;
  if (!m || m.type !== 'pdf-export') return;
  if (_pdfExportRun) return;   // doppelter Start
  revokePdfPreviewUrl(); m.previewUrl = null; m.previewBlob = null; m.errorText = '';
  const ctrl = new AbortController(); const run = { ctrl, t0: Date.now() }; _pdfExportRun = run;
  m.stage = 'building';
  render();
  let result = null;
  try {
    const opts = { template: m.template, signal: ctrl.signal, onProgress: (p) => pdfExportShowProgress(m, p) };
    result = m.target === 'cookbook'
      ? await buildCookbookPdf(m.nutritionDetail, opts)
      : await buildSinglePdf(m.recipeId, m.nutritionDetail, opts);
  } catch (err) {
    if (err && err.aborted) result = undefined;   // vom Nutzer abgebrochen
    else { console.warn('PDF-Erstellung fehlgeschlagen', err); result = null; m.errorText = err && err.userMessage ? err.userMessage : ''; }
  }
  if (_pdfExportRun === run) _pdfExportRun = null;
  // abgebrochen oder Dialog gewechselt/geschlossen: Ergebnis verwerfen
  if (result === undefined || ctrl.signal.aborted || state.modal !== m) return;
  if (!result) {
    m.stage = 'error';
    render();
    return;
  }
  m.previewBlob = result.blob;
  m.pageCount = result.blob.pageCount || 0;
  m.zoom = 1;
  m.filename = result.filename;
  m.previewUrl = URL.createObjectURL(result.blob);
  m.stage = 'preview';
  render();
}
function pdfExportCancelAction() {
  // Ein Doppelklick auf «PDF erstellen» trifft sonst gleich den neuen «Abbrechen»-Knopf an derselben Stelle
  if (_pdfExportRun && Date.now() - _pdfExportRun.t0 < 700) return;
  pdfExportAbort();
  if (state.modal && state.modal.type === 'pdf-export') { state.modal.stage = 'options'; render(); }
}

/* Punkt 2 (Direkter Update-Prompt): Vorschau soll auf Mobile eigenstaendiger Fullscreen-Screen
   sein statt kleinem Modal, und Teilen muss denselben bereits erzeugten Blob nutzen statt das
   PDF ein zweites Mal (evtl. anders) zu rendern. */
function pdfExportPreviewStage() {
  const m = state.modal;
  const canShare = SavoraNative.isNative || (typeof navigator !== 'undefined' && !!navigator.share);
  return `
    <div class="pdf-preview-header">
      <button class="ghost-btn pdf-preview-close" data-action="pdf-export-back" aria-label="Vorschau schliessen, zurück zu den Optionen">${ICONS.back} Zurück</button>
      <h2 class="modal-title" id="pdf-export-title">Vorschau</h2>
      <span class="pdf-preview-meta" aria-live="polite">${m.pageCount ? m.pageCount + (m.pageCount === 1 ? ' Seite' : ' Seiten') : ''}${m.template ? ' · ' + escapeHtml(pdfTemplateById(m.template).name) : ''}</span>
      ${pdfPreviewUsesCanvas() ? `<span class="pdf-zoom"><button class="icon-btn" data-action="pdf-zoom" data-id="out" aria-label="Verkleinern" ${(m.zoom || 1) <= 1 ? 'disabled' : ''}>−</button><button class="icon-btn" data-action="pdf-zoom" data-id="in" aria-label="Vergrössern" ${(m.zoom || 1) >= 3 ? 'disabled' : ''}>+</button></span>` : ''}
    </div>
    ${pdfMultiPageNote(m) ? `<p class="pdf-info-line" id="pdfMultiPageNote">${pdfMultiPageNote(m)}</p>` : ''}
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
    : stage === 'error' ? pdfExportErrorStage()
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
  pdfExportAbort();   // beim Schliessen oder Zurueckgehen auch einen noch laufenden Export beenden
  if (state.modal && state.modal.type === 'pdf-export' && state.modal.previewUrl) {
    URL.revokeObjectURL(state.modal.previewUrl);
  }
}
