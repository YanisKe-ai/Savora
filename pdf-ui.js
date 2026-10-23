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
      return (st.status === 'calculated' || st.status === 'partial') ? 'compact' : 'off';
    }
    // Kochbuch: reicht, wenn IRGENDEIN Rezept bereits Naehrwerte hat, dass der Umfang-Schalter
    // sinnvoll auf "kompakt" vorbelegt ist — Rezepte ohne Ergebnis zeigen ohnehin keine Box.
    for (const r of state.recipes) {
      const s2 = (await nutritionStatusFor(r)).status; if (s2 === 'calculated' || s2 === 'partial') return 'compact';
    }
    return 'off';
  } catch (e) {
    return 'off';
  }
}

/* Vorlagen-ID normalisieren: pdf-templates.js (pdfNormalizeTemplateId) liefert immer «pur» oder «prise-pop».
   Solange diese Funktion fehlt (Zwischenstand), bleibt die ID unveraendert. */
function pdfNormTpl(id) { return typeof pdfNormalizeTemplateId === 'function' ? pdfNormalizeTemplateId(id) : id; }

/* «Name im PDF»: Vorschlag aus dem gespeicherten Namen (state.senderName), pro Export aenderbar, nie automatisch eingeschaltet.
   Im Kochbuch gilt der vorhandene Name auf dem Titelblatt (cfg.author), der schon heute gedruckt wird; der Wert hier gilt nur fuer diesen Export
   und wird weder gespeichert noch mit dem Freundesprofil abgeglichen. */
function pdfExportEnsureFields(m) {
  if (m.fieldsReady) return;
  m.fieldsReady = true;
  m.template = pdfNormTpl(m.template);
  const sender = String(state.senderName || '').trim();
  if (m.target === 'cookbook') {
    let author = '';
    try { author = String(getCookbookConfig().author || '').trim(); } catch (e) { author = ''; }
    m.printName = !!author; m.pdfName = author || sender;
  } else { m.printName = false; m.pdfName = sender; }
}
function pdfExportNameValue(m) { return m.printName ? String(m.pdfName || '').replace(/\s+/g, ' ').trim() : ''; }
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t && t.id === 'pdfNameInput' && state.modal && state.modal.type === 'pdf-export') state.modal.pdfName = t.value;
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t && t.id === 'pdfNamePrint' && state.modal && state.modal.type === 'pdf-export') state.modal.printName = !!t.checked;
});

/* Zwei Stile als Auswahl (Optionen) und als Umschalter in der Vorschau */
function pdfStyleOptionsHtml(m, label) {
  const cur = pdfNormTpl(m.template);
  return `<div class="pdf-tpl-choice" role="radiogroup" aria-label="${label}">
      ${Object.values(PDF_TEMPLATES).map((t) => `<button type="button" role="radio" aria-checked="${cur === t.id}" class="pdf-tpl-opt ${cur === t.id ? 'active' : ''}" data-action="pdf-export-set-template" data-id="${escapeAttr(t.id)}"><span class="pdf-tpl-swatch pdf-tpl-swatch-${escapeAttr(String(t.id).toLowerCase())}" aria-hidden="true"></span><b>${escapeHtml(t.name)}</b><small>${escapeHtml(t.hint)}</small></button>`).join('')}
    </div>`;
}
function pdfStyleSwitchHtml(m) {
  const cur = pdfNormTpl(m.template);
  return `<div class="pdf-style-switch" role="radiogroup" aria-label="Seitenstil">
      ${Object.values(PDF_TEMPLATES).map((t) => `<button type="button" role="radio" aria-checked="${cur === t.id}" class="${cur === t.id ? 'active' : ''}" data-action="pdf-export-set-template" data-id="${escapeAttr(t.id)}">${escapeHtml(t.name)}</button>`).join('')}
    </div>`;
}
function pdfNameFieldHtml(m) {
  const cb = m.target === 'cookbook';
  return `<div class="pdf-name-field">
      <div class="field"><label for="pdfNameInput">Name im PDF (freiwillig)</label><input type="text" id="pdfNameInput" maxlength="80" autocomplete="off" placeholder="z. B. Anna" value="${escapeHtml(m.pdfName || '')}" aria-describedby="pdfNameHint"></div>
      <label class="check-row"><input type="checkbox" id="pdfNamePrint" ${m.printName ? 'checked' : ''}> <span>Name im PDF drucken</span></label>
      <p class="hint-line" id="pdfNameHint">${cb ? 'Erscheint auf dem Titelblatt und in der Fusszeile.' : 'Erscheint in der Fusszeile.'} Gedruckt wird er nur, wenn du ihn ankreuzt. Er gilt nur für dieses PDF und wird nicht geteilt.</p>
    </div>`;
}

function pdfExportOptionsStage() {
  const m = state.modal;
  pdfExportEnsureFields(m);
  const level = m.nutritionDetail;
  const title = m.target === 'cookbook' ? 'Kochbuch als PDF exportieren' : 'Als PDF exportieren';
  return `
    <h2 class="modal-title" id="pdf-export-title">${title}</h2>
    <p class="nutrition-modal-subtitle">Seitenstil</p>
    ${pdfStyleOptionsHtml(m, 'Seitenstil')}
    ${pdfNameFieldHtml(m)}
    ${state.showNutrition ? `    <p class="nutrition-modal-subtitle pdf-nutri-label">Nährwerte im PDF</p>
    <div class="nutrition-segmented" role="radiogroup" aria-label="Nährwerte-Detailgrad">
      <button role="radio" aria-checked="${level === 'off'}" class="${level === 'off' ? 'active' : ''}" data-action="pdf-export-set-detail" data-level="off">Aus</button>
      <button role="radio" aria-checked="${level === 'compact'}" class="${level === 'compact' ? 'active' : ''}" data-action="pdf-export-set-detail" data-level="compact">Kompakt</button>
      <button role="radio" aria-checked="${level === 'full'}" class="${level === 'full' ? 'active' : ''}" data-action="pdf-export-set-detail" data-level="full">Erweitert</button>
    </div>` : ''}
    <p class="hint-line pdf-preview-hint">Du siehst das fertige PDF in der Vorschau und kannst dort zwischen den beiden Stilen wechseln.</p>
    <div class="form-actions pdf-export-footer">
      <button class="ghost-btn" data-action="close-modal">Abbrechen</button>
      <button class="primary-btn" data-action="pdf-export-build">${ICONS.pdf} PDF erstellen</button>
    </div>
  `;
}

/* Stil waehlen: merkt ihn (und im Kochbuch im Stilfeld des Kochbuchs). In der Vorschau wird das PDF mit dem anderen Stil neu erzeugt. */
async function pdfExportSetTemplate(id) {
  const m = state.modal;
  if (!m || m.type !== 'pdf-export') return;
  const next = pdfNormTpl(id);
  if (!PDF_TEMPLATES[next]) return;
  const changed = pdfNormTpl(m.template) !== next;
  m.template = next;
  // v83: Im Kochbuch ist der Wechsel in der Vorschau nur ein Vergleich. Gespeichert wird erst mit «… fürs Kochbuch übernehmen».
  if (m.target !== 'cookbook') pdfRememberTemplate(next);
  if (m.stage === 'preview' && changed) { await pdfExportBuildAction(); return; }
  render();
  const again = document.querySelector(`[data-action="pdf-export-set-template"][data-id="${cssAttr(next)}"]`);
  if (again && typeof focusWithoutScroll === 'function') focusWithoutScroll(again);
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
  // nur bei genau zwei Seiten und wenn die Seitenplanung (plannedPages) ebenfalls zwei Seiten gemeldet hat
  return m.target === 'single' && m.pageCount === 2 && m.plannedPages === 2 ? 'Dieses Rezept erhält zwei Seiten, damit alles gut lesbar bleibt.' : '';
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
  // v83: Die bisher sichtbare Vorschau bleibt als Rueckfall erhalten (Abbrechen zeigt sie wieder), bis die neue fertig ist.
  pdfExportReleasePrev(m);
  m.prev = m.previewBlob ? { blob: m.previewBlob, url: m.previewUrl, template: m.shownTemplate, pageCount: m.pageCount, plannedPages: m.plannedPages, filename: m.filename } : null;
  pdfExportAbort(); m.previewUrl = null; m.previewBlob = null; m.errorText = '';
  const tpl = pdfNormTpl(m.template);
  const ctrl = new AbortController(); const run = { ctrl, t0: Date.now() }; _pdfExportRun = run;
  m.stage = 'building';
  render();
  let result = null;
  try {
    // Kochbuch: Name kommt aus der Kochbuch-Konfiguration (Feld «Name» des Titelblatts), deshalb hier kein author
    const opts = { template: tpl, author: m.target === 'cookbook' ? undefined : pdfExportNameValue(m), signal: ctrl.signal, onProgress: (p) => pdfExportShowProgress(m, p) };
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
  pdfExportReleasePrev(m);
  m.previewBlob = result.blob;
  m.shownTemplate = tpl;   // Stil der sichtbaren, fertigen Vorschau (Download = genau diese Datei)
  // echte Seitenzahlen pro Rezept nur fuer den Stil des Kochbuchs merken (ein Vergleich mit dem anderen Stil aendert die Zusammenfassung nicht)
  if (m.target === 'cookbook' && typeof cookbookRememberBuild === 'function' && tpl === cookbookPdfTemplate(getCookbookConfig())) { try { cookbookRememberBuild(result.blob, tpl); } catch (e) { /* nur Anzeige */ } }
  m.pageCount = result.blob.pageCount || 0;
  m.plannedPages = result.blob.plannedPages || 0;
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
  const m = state.modal;
  if (!m || m.type !== 'pdf-export') return;
  if (m.target === 'cookbook') {
    // v83: kein Optionsschritt im Kochbuch. Gab es schon eine fertige Vorschau, erscheint sie wieder (mit ihrem Stil), sonst zurueck zur Seite.
    if (m.prev) { Object.assign(m, { previewBlob: m.prev.blob, previewUrl: m.prev.url, template: m.prev.template, shownTemplate: m.prev.template, pageCount: m.prev.pageCount, plannedPages: m.prev.plannedPages, filename: m.prev.filename, prev: null, stage: 'preview' }); render(); }
    else closeModal();
    return;
  }
  m.stage = 'options'; render();
}
function pdfExportReleasePrev(m) {
  if (m && m.prev && m.prev.url) { try { URL.revokeObjectURL(m.prev.url); } catch (e) { /* schon frei */ } }
  if (m) m.prev = null;
}
/* v83: Kochbuch-PDF direkt aus der gespeicherten Konfiguration erstellen (kein zweiter Dialog mit denselben Optionen) */
async function pdfExportStartCookbook() {
  if (_pdfExportRun) return;
  const cfg = getCookbookConfig();
  const o = cookbookExportOptions(cfg);
  openModal({ type: 'pdf-export', target: 'cookbook', stage: 'building', template: o.template, nutritionDetail: o.nutritionDetail, fieldsReady: true }, '[data-action="export-cookbook"]');
  await pdfExportBuildAction();
}
/* v83: im Vergleich gezeigten Stil als Seitenstil des Kochbuchs speichern */
function pdfExportAdoptTemplate() {
  const m = state.modal;
  if (!m || m.type !== 'pdf-export' || m.target !== 'cookbook' || !m.shownTemplate) return;
  const cfg = getCookbookConfig();
  cfg.pdfTemplate = m.shownTemplate;
  saveCookbookConfig(cfg); pdfRememberTemplate(m.shownTemplate);
  if (m.previewBlob) { try { cookbookRememberBuild(m.previewBlob, m.shownTemplate); } catch (e) { /* nur Anzeige */ } }
  render();
  showToast(`Seitenstil «${cookbookPdfTemplateName(m.shownTemplate)}» fürs Kochbuch gespeichert`);
  const sw = document.querySelector('.pdf-style-switch [aria-checked="true"]'); if (sw && typeof focusWithoutScroll === 'function') focusWithoutScroll(sw);
}
function pdfExportCompareNote(m) {
  if (m.target !== 'cookbook' || !m.shownTemplate) return '';
  const proj = cookbookPdfTemplate(getCookbookConfig());
  const shown = cookbookPdfTemplateName(m.shownTemplate), projName = cookbookPdfTemplateName(proj);
  if (proj === m.shownTemplate) return `<p class="pdf-info-line pdf-compare" id="pdfCompareNote">Seitenstil des Kochbuchs: ${escapeHtml(projName)}. Hier vergleichst du nur Stile. Das Kochbuch bleibt unverändert.</p>`;
  return `<div class="pdf-info-line pdf-compare pdf-compare--diff" id="pdfCompareNote" role="status"><p>Vergleich: Du siehst «${escapeHtml(shown)}». Das Kochbuch verwendet «${escapeHtml(projName)}».</p><button type="button" class="outline-btn outline-btn--small" data-action="pdf-export-adopt-template">«${escapeHtml(shown)}» fürs Kochbuch übernehmen</button></div>`;
}

/* Punkt 2 (Direkter Update-Prompt): Vorschau soll auf Mobile eigenstaendiger Fullscreen-Screen
   sein statt kleinem Modal, und Teilen muss denselben bereits erzeugten Blob nutzen statt das
   PDF ein zweites Mal (evtl. anders) zu rendern. */
function pdfExportPreviewStage() {
  const m = state.modal;
  const canShare = SavoraNative.isNative || (typeof navigator !== 'undefined' && !!navigator.share);
  return `
    <div class="pdf-preview-header">
      <button type="button" class="ghost-btn pdf-preview-close" data-action="pdf-export-back" aria-label="${m.target === 'cookbook' ? 'Zurück zum Kochbuch' : 'Zurück zu den Optionen'}">${ICONS.back} Zurück</button>
      <h2 class="modal-title" id="pdf-export-title">Vorschau</h2>
      <span class="pdf-preview-meta" aria-live="polite">${m.pageCount ? m.pageCount + (m.pageCount === 1 ? ' Seite' : ' Seiten') : ''}</span>
      ${pdfPreviewUsesCanvas() ? `<span class="pdf-zoom"><button class="icon-btn" data-action="pdf-zoom" data-id="out" aria-label="Verkleinern" ${(m.zoom || 1) <= 1 ? 'disabled' : ''}>−</button><button class="icon-btn" data-action="pdf-zoom" data-id="in" aria-label="Vergrössern" ${(m.zoom || 1) >= 3 ? 'disabled' : ''}>+</button></span>` : ''}
    </div>
    ${pdfStyleSwitchHtml(m)}
    ${pdfExportCompareNote(m)}
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
    <div class="modal-sheet pdf-export-sheet ${stage === 'preview' ? 'pdf-preview-fullscreen' : ''}" role="dialog" aria-modal="true" aria-labelledby="pdf-export-title" tabindex="-1" data-stop-click>
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
  if (state.modal && state.modal.type === 'pdf-export') pdfExportReleasePrev(state.modal);
}
