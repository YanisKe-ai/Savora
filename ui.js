/* ---------- Toast + Live Region (Screenreader-Ansagen) ---------- */
function announceLive(msg, assertive) {
  const region = document.getElementById(assertive ? 'liveRegionAssertive' : 'liveRegion');
  if (!region) return;
  region.textContent = '';
  requestAnimationFrame(() => { region.textContent = msg; });
}

let toastTimer = null;

function showToast(msg, type = 'success', assertive = false) {
  state.toastMsg = msg;
  const existing = document.querySelector('.toast:not(.toast-undo)');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'error' ? ' toast-error' : '');
  el.textContent = msg;
  document.body.appendChild(el);
  announceLive(msg, assertive || type === 'error');
  clearTimeout(toastTimer);
  const duration = type === 'error' ? 5500 : type === 'info' ? 4000 : 2500;
  toastTimer = setTimeout(() => { el.classList.add('is-leaving'); setTimeout(() => el.remove(), 160); }, duration);   // Ausgang kurz und gleichgerichtet zum Eingang
}

let undoState = null; // { timer, el, onExpire }

function showUndoToast(msg, onUndo, onExpire) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  if (undoState) { clearTimeout(undoState.timer); undoState.onExpire(); undoState = null; }
  const el = document.createElement('div');
  el.className = 'toast toast-undo';
  el.innerHTML = `<span>${escapeHtml(msg)}</span><button type="button" class="toast-undo-btn">Rückgängig</button>`;
  document.body.appendChild(el);
  announceLive(msg, false);
  const timer = setTimeout(() => { el.remove(); undoState = null; onExpire(); }, 5000);
  el.querySelector('.toast-undo-btn').addEventListener('click', () => {
    clearTimeout(timer);
    el.remove();
    undoState = null;
    onUndo();
  });
  undoState = { timer, el, onExpire };
}

/* ---------- Form data collection ---------- */
function collectFormData() {
  const r = state.editingRecipe;
  r.title = document.getElementById('f-title').value.trim() || 'Ohne Titel';
  r.servings = parseInt(document.getElementById('f-servings').value) || 0;   // leer = Ausbeute unbekannt (nie still 1)
  r.timeMinutes = parseInt(document.getElementById('f-time').value) || 0;
  r.difficulty = document.getElementById('f-difficulty').value;
  // Weitere Zeitangaben sind optional und additiv: leer = unbekannt (Feld wird entfernt, nichts erfunden)
  [['f-prep', 'prepMinutes'], ['f-rest', 'restMinutes'], ['f-cook', 'cookMinutes']].forEach(([elId, key]) => {
    const el = document.getElementById(elId);
    if (!el) return;
    const v = parseInt(el.value, 10);
    if (v > 0) r[key] = v; else delete r[key];
  });
  r.notes = document.getElementById('f-notes').value;
  // Zutaten in DOM-Reihenfolge lesen: Gruppenzeilen setzen das group-Feld der folgenden Zutaten.
  // Unbekannte Zusatzfelder einer bestehenden Zutat (z.B. note, optional) bleiben erhalten.
  const prevIngredients = r.ingredients || [];
  let currentGroup = '';
  r.ingredients = [];
  document.querySelectorAll('#ingRows [data-ing-row], #ingRows [data-group-row]').forEach(row => {
    if (row.hasAttribute('data-group-row')) { currentGroup = row.querySelector('.group-name-input').value.trim(); return; }
    const prev = prevIngredients[parseInt(row.dataset.ingRow, 10)];
    const base = prev && !isIngredientHeaderRow(prev) ? { ...prev } : {};
    base.amount = row.querySelector('.ing-amount-input').value.trim();
    base.unit = row.querySelector('.ing-unit-input').value.trim();
    base.name = row.querySelector('.ing-name-input').value.trim();
    if (currentGroup) base.group = currentGroup; else delete base.group;
    delete base.isGroupHeader;
    r.ingredients.push(base);
  });
  const modeEl = document.getElementById('f-serving-mode');
  if (modeEl) r.servingMode = modeEl.value === 'pieces' ? 'pieces' : 'portions';
  if (r.servingMode !== 'pieces') delete r.yieldLabel;   // Bezeichnung (z. B. Schälchen) gilt nur fuer Stueck
  r.steps = Array.from(document.querySelectorAll('#stepRows [data-step-row]')).map(row => ({
    text: row.querySelector('.step-text-input').value.trim(),
  }));
  r.updatedAt = Date.now();
  return r;
}

let modalTriggerSelector = null;
let searchDebounceTimer = null; // Modulebene: ein Timer aus einem frueheren Render-Zyklus wird sicher abgebrochen

/* Zentrale Modal-Oeffnen-/Schliessen-Logik, von ALLEN Schliesswegen gemeinsam genutzt
   (Escape, Abbrechen-Button, Backdrop, erfolgreiche Aktion) — vorher hatte Escape einen
   eigenen, abweichenden Pfad ohne Fokus-Rueckgabe.
   Wichtig: Savora rendert bei jedem render() das komplette #app-innerHTML neu (kein
   Diffing) — eine direkt gehaltene Elementreferenz waere direkt nach dem oeffnenden
   render() schon veraltet. Deshalb wird ein CSS-Selektor gespeichert und der Ausloeser
   nach dem Schliessen frisch im neuen DOM wiedergefunden. */
/* ---------- Punkt 1 (Interaction-Stability-Auftrag): zentrale Focus-API ----------
   Ersetzt jeden programmatischen .focus()-Aufruf. Ohne preventScroll bringt der Browser das
   fokussierte Element aktiv in den sichtbaren Bereich — genau das erzeugte die ungewollten
   Scroll-Spruenge bei Modal-Schliessen, Fokus-Trap und Suche. Der try/catch-Fallback greift nur
   fuer sehr alte Browser ohne { preventScroll }-Unterstuetzung. */
function focusWithoutScroll(el, opts) {
  if (!el) return;
  const x = window.scrollX, y = window.scrollY;
  try {
    el.focus(Object.assign({ preventScroll: true }, opts));
  } catch (e) {
    el.focus();
    window.scrollTo(x, y);
  }
}

function openModal(modal, triggerSelector) {
  modalTriggerSelector = triggerSelector || null;
  state.modal = modal;
  render();
}
function closeModal() {
  stopNutritionBarcodeCamera(); // Kamera darf nie weiterlaufen, wenn das Modal verlassen wird
  revokePdfPreviewUrl(); // Blob-URL der PDF-Vorschau freigeben, sonst haengt der Blob im Speicher
  // Punkt 5: ueber history.back() statt direktem state.modal=null, damit der beim Oeffnen
  // gepushte History-Eintrag korrekt konsumiert wird (sonst haengt ein stiller Eintrag im
  // Stapel, den ein spaeterer Browser-/Geraete-Zurueck-Druck faelschlich nochmal abarbeitet).
  // Die Fokus-Rueckgabe an den Ausloeser passiert danach im zentralen popstate-Handler
  // (state.js), da render() dort erst asynchron nach dem Popstate-Event laeuft.
  history.back();
}

function onModalEscape(e) {
  if (e.key === 'Escape' && state.modal) {
    e.preventDefault();
    closeModal();
    return;
  }
  if (e.key === 'Tab' && state.modal) {
    const modal = document.querySelector('.modal-sheet');
    if (!modal) return;
    const focusables = Array.from(modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
      .filter((el) => !el.disabled && el.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0], last = focusables[focusables.length - 1];
    // Fokus-Falle: Tab/Shift+Tab kreist innerhalb des Dialogs, statt auf die
    // dahinterliegende Seite auszubrechen.
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); focusWithoutScroll(last); }
    else if (e.shiftKey && !modal.contains(document.activeElement)) { e.preventDefault(); focusWithoutScroll(last); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); focusWithoutScroll(first); }
    else if (!e.shiftKey && !modal.contains(document.activeElement)) { e.preventDefault(); focusWithoutScroll(first); }
  }
}

function bindEvents() {
  App.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', onAction);
  });
  if (state.view === 'cookmode') bindCookSwipe();
  if (typeof bindSheetDrag === 'function') bindSheetDrag();
  hydrateLazyImages();
  hydrateNutritionCards();
  bindNutritionSearchInput();

  const modalSheet = document.querySelector('.modal-sheet');
  if (modalSheet) {
    focusWithoutScroll(modalSheet);
    document.addEventListener('keydown', onModalEscape);
  } else {
    document.removeEventListener('keydown', onModalEscape);
  }

  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    clearTimeout(searchDebounceTimer);
    searchInput.addEventListener('input', (e) => {
      state.query = e.target.value;
      // Punkt 2: der Sprung entsteht hier nicht durch render()/focus() (die sind bereits mit
      // preventScroll abgesichert), sondern durch natives Browser-Verhalten, das ein fokussiertes
      // Eingabefeld beim Tippen aktiv in den sichtbaren Bereich scrollt, sobald es (z.B. hinter
      // der sticky Topbar) ausserhalb des Viewports liegt. requestAnimationFrame faengt genau das
      // im naechsten Frame wieder ab, bevor es sichtbar wird.
      const y = window.scrollY;
      requestAnimationFrame(() => { if (window.scrollY !== y) window.scrollTo(0, y); });
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => renderKeepFocus('searchInput'), 120);
    });
  }
  const restoreInput = document.getElementById('restoreFileInput');
  if (restoreInput) {
    restoreInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) restoreBackupFromFile(file);
      restoreInput.value = '';
    });
  }

  if (typeof ucBindInputs === 'function') ucBindInputs();   // Masseinheiten-Rechner (unit-converter.js)
  if (typeof ingPasteBind === 'function') ingPasteBind();   // Zutaten einfuegen (ingredient-paste.js)
  if (typeof bindPhotoScan === 'function') bindPhotoScan();   // Foto scannen (nur iOS-App)
  if (typeof bindPdfPreview === 'function') bindPdfPreview();   // PDF-Vorschau mit PDF.js (pdf-preview.js)
  const stepper = document.querySelector('.form-stepper');
  const stepAct = stepper && stepper.querySelector('.is-active');
  if (stepper && stepAct) {   // aktiver Schritt sichtbar machen (auf sehr schmalen Handys scrollt die Leiste)
    stepper.scrollLeft += (stepAct.getBoundingClientRect().left - stepper.getBoundingClientRect().left) - (stepper.clientWidth - stepAct.offsetWidth) / 2;
  }

  const tagNew = document.getElementById('f-tag-new');
  if (tagNew) {
    tagNew.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && tagNew.value.trim()) {
        e.preventDefault();
        state.editingRecipe = collectFormData();
        if (!state.editingRecipe.tags.includes(tagNew.value.trim())) state.editingRecipe.tags.push(tagNew.value.trim());
        render();
      }
    });
  }
  const shoppingAddInput = document.getElementById('shoppingAddInput');
  if (shoppingAddInput) {
    shoppingAddInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && shoppingAddInput.value.trim()) {
        e.preventDefault();
        onAction({ currentTarget: document.querySelector('[data-action="add-shopping-item-manual"]') });
      }
    });
  }
  const imgInput = document.getElementById('f-image');
  if (imgInput) {
    imgInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      state.editingRecipe = collectFormData();
      const oldImageId = state.editingRecipe.imageId;
      try {
        const { fullBlob, thumbBlob, mime } = await processImageFile(file);
        const id = uid();
        await dbPutImage({ id, blob: fullBlob, thumbBlob, mime });
        if (oldImageId) dbDeleteImage(oldImageId).catch(() => {});
        state.editingRecipe.imageId = id;
        state.editingRecipe.image = null;
      } catch (err) {
        showToast('Foto konnte nicht verarbeitet werden', 'error');
      }
      render();
    });
  }
}

function renderKeepFocus(id) {
  const el = document.getElementById(id);
  const pos = el ? el.selectionStart : null;
  render();
  const el2 = document.getElementById(id);
  if (el2) { focusWithoutScroll(el2); if (pos !== null) el2.setSelectionRange(pos, pos); }
}

/* Punkt 11 (Interaction-Stability-Auftrag): schuetzt Aktionen, bei denen ein Doppel-Tap waehrend
   der laufenden async-Operation eine doppelte Datenbank-/PDF-/Backup-Operation ausloesen wuerde
   (z.B. zweimal "Speichern" antippen, bevor der erste dbPut() zurueckkommt). Global statt pro
   Element gesperrt, weil zu jedem Zeitpunkt ohnehin nur eine dieser Aktionen sinnvoll aktiv sein
   kann (ein Editor, ein PDF-Export-Modal, ein Backup-Vorgang). */
const ASYNC_GUARDED_ACTIONS = new Set([
  'save-recipe', 'export-backup', 'pdf-export-build', 'pdf-export-download', 'pdf-export-share',
  'nutrition-confirm-match', 'nutrition-accept-suggestions', 'nutrition-save-custom', 'nutrition-barcode-lookup',
  'duplicate-recipe', 'rc-apply', 'confirm-shop-select', 'cook-complete', 'save-note',
]);
const busyActions = new Set();

async function onAction(e) {
  const el = e.currentTarget;
  const action = el.dataset.action;
  const id = el.dataset.id;

  if (ASYNC_GUARDED_ACTIONS.has(action)) {
    if (busyActions.has(action)) return; // laeuft bereits — Rapid-Tap wird ignoriert, kein Doppel-Write
    busyActions.add(action);
    el.setAttribute('aria-busy', 'true');
  }
  try {
    await dispatchAction(action, id, el, e);
  } finally {
    if (ASYNC_GUARDED_ACTIONS.has(action)) busyActions.delete(action);
  }
}

async function dispatchAction(action, id, el, e) {
  if (typeof handleActionV2 === 'function' && await handleActionV2(action, id, el, e)) return;
  switch (action) {
    case 'new-recipe':
      state.modal = null;
      state.editingRecipe = emptyRecipe();
      state.view = 'form';
      render();
      break;
    case 'open-add-menu':
      openModal({ type: 'add-menu' }, '.fab');
      break;
    case 'open-paste-import':
      state.modal = null;
      state.view = 'paste-import';
      render();
      break;
    case 'open-photo-scan': {   // Import-Bildschirm oeffnen und gleich die Fotoauswahl zeigen
      state.modal = null;
      state.view = 'paste-import';
      render();
      let scanTries = 0;   // render() kann per View Transition verzoegert sein: kurz warten, bis das Feld da ist
      const openScan = () => {
        const scanInput = document.getElementById('ocrInput');
        if (scanInput) scanInput.click();
        else if (++scanTries < 20) setTimeout(openScan, 50);
      };
      openScan();
      break;
    }
    case 'edit-recipe':
      state.editingRecipe = JSON.parse(JSON.stringify(state.recipes.find(r => r.id === id)));
      state.view = 'form';
      render();
      break;
    case 'save-recipe': {
      if (state.savingRecipe) break;   // Mehrfachklick: nur ein Speichern
      const titleEl = document.getElementById('f-title');
      if (titleEl && !titleEl.value.trim()) {
        // Pflichtfeld: nicht still "Ohne Titel" speichern, sondern am Feld erklaeren
        if (state.formStep > 0) { const b0 = document.querySelector('[data-action="form-goto-step"][data-idx="0"]'); if (b0) b0.click(); }
        const t = document.getElementById('f-title');
        if (t) {
          t.setAttribute('aria-invalid', 'true'); t.setAttribute('aria-describedby', 'f-title-err');
          if (!document.getElementById('f-title-err')) t.insertAdjacentHTML('afterend', '<div class="field-error" id="f-title-err" role="alert">Gib dem Rezept einen Titel.</div>');
          t.addEventListener('input', () => { t.removeAttribute('aria-invalid'); const e = document.getElementById('f-title-err'); if (e) e.remove(); }, { once: true });
          t.focus();
        }
        break;
      }
      state.savingRecipe = true;
      try {
      const r = collectFormData();
      r.ingredients = r.ingredients.filter(i => i.name);
      r.steps = r.steps.filter(s => s.text);
      if (!r.ingredients.length) r.ingredients = [{ amount: '', unit: '', name: '' }];
      if (!r.steps.length) r.steps = [{ text: '' }];
      delete r._importSummary; delete r._import; // nur Anzeigehilfen, gehoeren nicht in die Datenbank
      await dbPut(r);
      await loadRecipes();
      state.activeRecipeId = r.id;
      state.view = 'detail';
      render();
      showToast('Rezept gespeichert');
      } finally { state.savingRecipe = false; }
      break;
    }
    case 'open-recipe': {
      const cardImg = el.querySelector('.recipe-card-img');
      if (cardImg) cardImg.style.viewTransitionName = 'recipe-hero-img';
      state.activeRecipeId = id;
      state.view = 'detail';
      // Punkt 4: kein manuelles scrollTo mehr hier — render() setzt bei echtem View-Wechsel
      // selbst und zum richtigen Zeitpunkt (nach dem DOM-Tausch, nicht davor) auf Position 0,
      // sonst wuerde die View-Transition-Momentaufnahme der "alten" Seite faelschlich schon
      // oben zeigen statt an der tatsaechlichen Scrollposition.
      render();
      break;
    }
    case 'back':
      // Punkt 5: nutzt denselben Mechanismus wie der echte Browser-/Geraete-Zurueck (history.back()
      // + der zentrale popstate-Handler in state.js), statt eine zweite, parallele Logik zu
      // pflegen, die mit der History leicht auseinanderlaufen wuerde.
      history.back();
      break;
    case 'toggle-fav': {
      e.stopPropagation();
      const r = state.recipes.find(x => x.id === id);
      r.favorite = !r.favorite;
      await dbPut(r);
      render();
      break;
    }
    case 'filter-tag':
      state.activeTag = el.dataset.tag || null;
      render();
      break;
    case 'toggle-fav-filter':
      state.favOnly = !state.favOnly;
      render();
      break;
    case 'open-filter-sheet':
      openModal({ type: 'filter-sheet' }, `[data-action="open-filter-sheet"]`);
      break;
    case 'toggle-filter': {
      const dim = el.dataset.dim, fid = el.dataset.id;
      const set = state.activeFilters[dim];
      if (set.has(fid)) set.delete(fid); else set.add(fid);
      render();
      break;
    }
    case 'remove-active-filter': {
      const dim = el.dataset.dim, fid = el.dataset.id;
      state.activeFilters[dim].delete(fid);
      render();
      break;
    }
    case 'clear-all-filters':
      state.activeFilters.dietary.clear();
      state.activeFilters.category.clear();
      state.activeFilters.time.clear();
      state.favOnly = false;
      closeModal(); // rendert bereits selbst — kein zusaetzliches render() noetig (Punkt 6)
      break;
    case 'confirm-delete':
      openModal({ type: 'delete', recipeId: id }, `[data-action="confirm-delete"][data-id="${id}"]`);
      break;
    case 'close-modal':
      closeModal();
      break;
    case 'delete-recipe': {
      const recipeToDelete = state.recipes.find(x => x.id === id);
      if (!recipeToDelete) break;
      state.recipes = state.recipes.filter(x => x.id !== id);
      state.modal = null;
      state.view = 'home';
      render();
      showUndoToast(
        `„${recipeToDelete.title}“ gelöscht`,
        () => { state.recipes.push(recipeToDelete); state.recipes.sort((a, b) => b.updatedAt - a.updatedAt); render(); },
        async () => { await dbDelete(id); if (recipeToDelete.imageId) dbDeleteImage(recipeToDelete.imageId).catch(() => {}); }
      );
      break;
    }
    case 'open-ing-paste':
      state.editingRecipe = collectFormData();
      state.modal = { type: 'ing-paste', text: '' };
      render();
      break;
    case 'ing-paste-apply':
      ingPasteApply();
      break;
    case 'add-ingredient':
      state.editingRecipe = collectFormData();
      state.editingRecipe.ingredients.push({ amount: '', unit: '', name: '' });
      render();
      break;
    case 'remove-ingredient':
      state.editingRecipe = collectFormData();
      state.editingRecipe.ingredients.splice(parseInt(el.dataset.idx), 1);
      if (!state.editingRecipe.ingredients.length) state.editingRecipe.ingredients.push({ amount: '', unit: '', name: '' });
      render();
      break;
    case 'add-step':
      state.editingRecipe = collectFormData();
      state.editingRecipe.steps.push({ text: '' });
      render();
      break;
    case 'remove-step':
      state.editingRecipe = collectFormData();
      state.editingRecipe.steps.splice(parseInt(el.dataset.idx), 1);
      if (!state.editingRecipe.steps.length) state.editingRecipe.steps.push({ text: '' });
      render();
      break;
    case 'remove-tag':
      state.editingRecipe = collectFormData();
      state.editingRecipe.tags = state.editingRecipe.tags.filter(t => t !== el.dataset.tag);
      render();
      break;
    case 'toggle-diet': {
      state.editingRecipe = collectFormData();
      const dk = el.dataset.diet;
      state.editingRecipe.diet = state.editingRecipe.diet || [];
      state.editingRecipe.suppressedTags = state.editingRecipe.suppressedTags || [];
      if (state.editingRecipe.diet.includes(dk)) {
        state.editingRecipe.diet = state.editingRecipe.diet.filter(x => x !== dk);
        if (!state.editingRecipe.suppressedTags.includes(dk)) state.editingRecipe.suppressedTags.push(dk);
      } else {
        state.editingRecipe.diet.push(dk);
        state.editingRecipe.suppressedTags = state.editingRecipe.suppressedTags.filter(x => x !== dk);
      }
      render();
      break;
    }
    case 'toggle-category': {
      state.editingRecipe = collectFormData();
      const ck = el.dataset.category;
      state.editingRecipe.categoryTags = state.editingRecipe.categoryTags || [];
      state.editingRecipe.suppressedTags = state.editingRecipe.suppressedTags || [];
      if (state.editingRecipe.categoryTags.includes(ck)) {
        state.editingRecipe.categoryTags = state.editingRecipe.categoryTags.filter(x => x !== ck);
        if (!state.editingRecipe.suppressedTags.includes(ck)) state.editingRecipe.suppressedTags.push(ck);
      } else {
        state.editingRecipe.categoryTags.push(ck);
        state.editingRecipe.suppressedTags = state.editingRecipe.suppressedTags.filter(x => x !== ck);
      }
      render();
      break;
    }
    case 'reanalyze-categories': {
      state.editingRecipe = collectFormData();
      const classification = classifyRecipe(state.editingRecipe);
      applyClassification(state.editingRecipe, classification, { minConfidence: 'medium' });
      render();
      showToast('Kategorien-Vorschläge aktualisiert');
      break;
    }
    case 'serv-inc': case 'serv-dec': {
      const r = state.recipes.find(x => x.id === id);
      const current = state.servingsOverride[id] || r.lastServings || r.servings || 1;
      const next = Math.max(1, current + (action === 'serv-inc' ? 1 : -1));
      state.servingsOverride[id] = next;
      r.lastServings = next;
      await dbPut(r);
      render();
      break;
    }
    case 'start-cook':
      state.activeRecipeId = id;
      state.cookStepIndex = 0;
      state.cookFinished = false;
      state.view = 'cookmode';
      render();
      speakCurrentStepIfEnabled();
      await requestWakeLock();
      break;
    case 'toggle-voice':
      state.voiceEnabled = !state.voiceEnabled;
      if (!state.voiceEnabled && 'speechSynthesis' in window) window.speechSynthesis.cancel();
      render();
      if (state.voiceEnabled) speakCurrentStepIfEnabled();
      break;
    case 'cook-next':
      SavoraNative.haptic('light');
      cookGoNext();
      break;
    case 'cook-prev':
      SavoraNative.haptic('light');
      cookGoPrev();
      break;
    case 'cook-finish':
      state.cookFinished = true;
      render();
      break;
    case 'exit-cook':
      releaseWakeLock();
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      Object.values(state.timers).forEach(t => { if (t.intervalId) clearInterval(t.intervalId); });
      state.timers = {}; SavoraNative.cancelAllTimers();
      state.cookFinished = false;
      history.back(); // Punkt 5: einheitlich ueber history statt eigener state.view-Zuweisung
      break;
    case 'toggle-timer': {
      const id = el.dataset.timerId;
      const seconds = parseInt(el.dataset.seconds);
      const t = state.timers[id];
      if (!t || (!t.running && !t.done)) startTimer(id, seconds);
      else if (t.done) { delete state.timers[id]; render(); }
      break;
    }
    case 'export-pdf':
      openModal({ type: 'pdf-export', target: 'single', recipeId: id, stage: 'options', template: pdfDefaultTemplateId(), nutritionDetail: await defaultPdfNutritionDetail('single', id) }, `[data-action="export-pdf"][data-id="${id}"]`);
      break;
    case 'export-cookbook':
      openModal({ type: 'pdf-export', target: 'cookbook', stage: 'options', template: (getCookbookConfig().pdfTemplate || pdfDefaultTemplateId()), nutritionDetail: await defaultPdfNutritionDetail('cookbook') }, `[data-action="export-cookbook"]`);
      break;
    case 'export-backup':
      downloadBackup();
      break;
    case 'trigger-restore':
      document.getElementById('restoreFileInput').click();
      break;
    case 'share-recipe':
      // Punkt 2: identischer Ablauf wie 'export-pdf' — ein Rezept hat nur noch EINEN PDF-Weg,
      // nicht zwei verschiedene (vorher: 'Teilen' ging direkt an navigator.share vorbei an
      // jeder Vorschau, 'Als PDF exportieren' zeigte eine Vorschau — inkonsistent).
      openModal({ type: 'pdf-export', target: 'single', recipeId: id, stage: 'options', template: pdfDefaultTemplateId(), nutritionDetail: await defaultPdfNutritionDetail('single', id) }, `[data-action="share-recipe"][data-id="${id}"]`);
      break;
    case 'save-profile-fields': {
      const titleInput = document.getElementById('f-cookbook-title');
      const nameInput = document.getElementById('f-sender-name');
      state.cookbookTitle = titleInput ? titleInput.value.trim() : state.cookbookTitle;
      state.senderName = nameInput ? nameInput.value.trim() : state.senderName;
      localStorage.setItem(COOKBOOK_TITLE_KEY, state.cookbookTitle);
      localStorage.setItem(SENDER_NAME_KEY, state.senderName);
      showToast('Gespeichert');
      break;
    }
    case 'open-settings':
      state.view = 'settings';
      render();
      break;
    case 'nav-tab':
      state.view = el.dataset.view;
      render();
      break;
    case 'goto-view':
      state.modal = null;
      state.view = el.dataset.view;
      render();
      break;
    case 'open-shopping':
      state.view = 'shopping';
      render();
      break;
    case 'open-mealplan':
      state.view = 'mealplan';
      render();
      break;
    case 'week-prev':
      state.weekStart = addDays(state.weekStart, -7);
      render();
      break;
    case 'week-next':
      state.weekStart = addDays(state.weekStart, 7);
      render();
      break;
    case 'open-day-picker':
      openModal({ type: 'pick-recipe', date: el.dataset.date }, `[data-action="open-day-picker"][data-date="${el.dataset.date}"]`);
      break;
    case 'assign-mealplan-recipe': {
      const date = el.dataset.date;
      const rid = el.dataset.id;
      const list = state.mealplan[date] || [];
      if (!list.includes(rid)) list.push(rid);
      state.mealplan[date] = list;
      await dbPutMealplanDay({ date, recipeIds: list });
      closeModal();
      break;
    }
    case 'remove-mealplan-recipe': {
      const date = el.dataset.date;
      const rid = el.dataset.id;
      const list = (state.mealplan[date] || []).filter(x => x !== rid);
      state.mealplan[date] = list;
      await dbPutMealplanDay({ date, recipeIds: list });
      render();
      break;
    }
    case 'mealplan-to-shopping': {
      const days = Array.from({ length: 7 }, (_, i) => addDays(state.weekStart, i));
      const ids = new Set();
      days.forEach(d => (state.mealplan[fmtDateKey(d)] || []).forEach(rid => ids.add(rid)));
      for (const rid of ids) {
        const r = state.recipes.find(x => x.id === rid);
        if (r) await addRecipeIngredientsToShopping(r, r.servings || 1);
      }
      await loadShopping();
      showToast(ids.size ? 'Einkaufsliste aktualisiert' : 'Keine Rezepte in dieser Woche');
      render();
      break;
    }
    case 'add-to-shopping': {
      const r = state.recipes.find(x => x.id === id);
      const servings = state.servingsOverride[id] || r.lastServings || r.servings || 1;
      await addRecipeIngredientsToShopping(r, servings);
      await loadShopping();
      showToast('Zur Einkaufsliste hinzugefügt');
      render();
      break;
    }
    case 'toggle-shopping-item': {
      const item = state.shopping.find(s => s.id === id);
      item.checked = !item.checked;
      await dbPutShopping(item);
      render();
      break;
    }
    case 'add-shopping-item-manual': {
      const input = document.getElementById('shoppingAddInput');
      const name = input ? input.value.trim() : '';
      if (!name) break;
      const item = { id: uid(), name, amount: '', unit: '', checked: false, recipeId: null, createdAt: Date.now() };
      await dbPutShopping(item);
      state.shopping.push(item);
      render();
      // Fokus nach dem Re-Render zurueck ins Eingabefeld, damit man mehrere Artikel
      // hintereinander eintippen kann ohne jedes Mal neu hinzutippen zu muessen.
      const freshInput = document.getElementById('shoppingAddInput');
      if (freshInput) focusWithoutScroll(freshInput);
      break;
    }
    case 'delete-shopping-item':
      await dbDeleteShopping(id);
      await loadShopping();
      render();
      break;
    case 'clear-checked-shopping':
      for (const i of state.shopping.filter(s => s.checked)) await dbDeleteShopping(i.id);
      await loadShopping();
      render();
      break;
    case 'clear-all-shopping':
      for (const i of state.shopping) await dbDeleteShopping(i.id);
      await loadShopping();
      render();
      break;
    case 'set-theme': {
      const nextTheme = el.dataset.theme;
      const applyThemeChange = () => {
        state.theme = nextTheme;
        localStorage.setItem(THEME_KEY, state.theme);
        applyTheme();
        render();
      };
      // Absicherung gegen ueberlappende View-Transitions: wer schnell zwischen zwei
      // Theme-Optionen tippt, bevor die vorherige Kreis-Animation fertig ist, sollte
      // trotzdem sofort das neue Theme bekommen, statt dass die Animation haengen bleibt.
      if (document.startViewTransition && !prefersReducedMotion() && !state._themeTransitionActive) {
        const x = e.clientX, y = e.clientY;
        const endRadius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
        document.documentElement.classList.add('theme-transitioning');
        state._themeTransitionActive = true;
        const finishUp = () => {
          document.documentElement.classList.remove('theme-transitioning');
          state._themeTransitionActive = false;
        };
        const transition = document.startViewTransition(applyThemeChange);
        transition.ready.then(() => {
          document.documentElement.animate(
            { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`] },
            { duration: 550, easing: 'cubic-bezier(.4,0,.2,1)', pseudoElement: '::view-transition-new(root)' }
          );
        }).catch(() => {});
        transition.finished.then(finishUp).catch(finishUp);
      } else {
        applyThemeChange();
      }
      break;
    }
    case 'set-unit-system':
      state.unitSystem = el.dataset.system;
      localStorage.setItem(UNIT_KEY, state.unitSystem);
      render();
      break;
    case 'open-unitconverter':
      state.view = 'unitconverter';
      render();
      break;
    case 'uc-tab':
      ucSwitchTab(el.dataset.id);
      render();
      break;
    case 'uc-quick':
      state.ucAmount = el.dataset.value;
      render();
      break;
    case 'uc-defs':
      try { localStorage.setItem(UC_KEY, el.dataset.id); } catch (err) {}
      render();
      break;
    case 'uc-temp-row':
      state.ucUnit = 'c'; state.ucAmount = el.dataset.c;
      render();
      break;
    case 'convert-ingredient-row': {
      state.editingRecipe = collectFormData();
      const idx = parseInt(el.dataset.idx);
      const ing = state.editingRecipe.ingredients[idx];
      const converted = autoConvertIngredient(ing);
      if (converted === ing || (converted.amount === ing.amount && converted.unit === ing.unit)) {
        showToast('Einheit ist bereits passend oder nicht umrechenbar');
      } else {
        state.editingRecipe.ingredients[idx] = converted;
      }
      render();
      break;
    }
    case 'do-paste-import': {
      const text = document.getElementById('pasteText').value.trim();
      const errBox = document.getElementById('pasteError');
      const showErr = (html) => { if (errBox) { errBox.innerHTML = html; errBox.hidden = false; errBox.focus(); } };
      if (errBox) { errBox.hidden = true; errBox.innerHTML = ''; }
      if (!text) { showErr('<p>Bitte zuerst Text einfügen.</p>'); break; }
      // Strukturiertes Rezept-JSON (Version 1) wird erkannt und durch dieselbe Validierung und Vorschau geführt wie Freitext
      if (typeof looksLikeRecipeJson === 'function' && looksLikeRecipeJson(text)) {
        const res = parseRecipeJson(text);
        if (!res.ok) { showErr(`<p><strong>Das Rezept-JSON konnte nicht übernommen werden.</strong></p><ul>${res.errors.map(e => `<li>${escapeHtml(e.message)}</li>`).join('')}</ul>`); break; }
        state.editingRecipe = res.recipe;
        state.formStep = 0;
        state.view = 'form';
        render();
        showToast('Entwurf aus JSON erstellt, bitte prüfen');
        break;
      }
      state.editingRecipe = parseFreeTextRecipe(text);
      state.formStep = 0;
      state.view = 'form';
      render();
      showToast('Entwurf erstellt, bitte prüfen');
      break;
    }
    /* ---------- Importvorschau: gezielte Korrekturen (aendern nur den Entwurf, speichern nichts) ---------- */
    case 'import-split-ing': case 'import-ing-remove': case 'import-ing-to-step': {
      const idx = parseInt(el.dataset.idx, 10);
      const r = collectFormData();
      const ing = r.ingredients[idx];
      if (!ing) break;
      if (action === 'import-split-ing') {
        const full = [ing.amount, ing.unit, ing.name].map(x => String(x == null ? '' : x).trim()).filter(Boolean).join(' ');
        const rows = importSplitIngredientLine(full).map(t => parseIngredientLine(t)).filter(p => p && String(p.name || '').trim()).map(p => ({ amount: p.amount, unit: p.unit, name: p.name, ...(ing.group ? { group: ing.group } : {}) }));
        if (rows.length > 1) r.ingredients.splice(idx, 1, ...rows);
      } else if (action === 'import-ing-remove') {
        r.ingredients.splice(idx, 1);
      } else {
        r.ingredients.splice(idx, 1);
        const last = r.steps.length ? r.steps[r.steps.length - 1] : null;
        if (last && !String(last.text || '').trim()) last.text = ing.name; else r.steps.push({ text: ing.name });
      }
      if (!r.ingredients.length) r.ingredients = [{ amount: '', unit: '', name: '' }];
      state.editingRecipe = importRefresh(r);
      render();
      break;
    }
    case 'import-unassigned-note': case 'import-unassigned-step': {
      const r = collectFormData();
      const lines = (r._import && r._import.unassigned) || [];
      if (lines.length) {
        if (action === 'import-unassigned-note') r.notes = [String(r.notes || '').trim(), lines.join('\n')].filter(Boolean).join('\n\n');
        else { const last = r.steps.length ? r.steps[r.steps.length - 1] : null; lines.forEach(l => { if (last && !String(last.text || '').trim() && lines.indexOf(l) === 0) last.text = l; else r.steps.push({ text: l }); }); }
        r._import.unassigned = [];
      }
      state.editingRecipe = importRefresh(r);
      render();
      break;
    }
    case 'import-next-recipe': {
      const r = state.editingRecipe;
      const rest = r && r._import ? r._import.otherRecipeText : '';
      if (!rest) break;
      state.editingRecipe = parseFreeTextRecipe(rest);
      state.formStep = 0;
      render();
      showToast('Zweites Rezept als Entwurf geöffnet. Das erste ist nicht gespeichert.');
      break;
    }

    /* ---------- Nutrition (Punkt 70-75) ---------- */
    case 'nutrition-open-match': {
      const r = state.recipes.find(x => x.id === id);
      if (!r) break;
      const relevant = (r.ingredients || []).filter(i => i.name && i.name.trim() && !isIngredientHeaderRow(i) && !isQualitativeIngredient(i));
      state.nutritionMatchItems = await matchIngredients(relevant, r.steps);
      openModal({ type: 'nutrition', recipeId: id, stage: 'match' }, `[data-action="nutrition-open-match"][data-id="${id}"]`);
      break;
    }
    case 'nutrition-select-ingredient': {
      const name = el.dataset.name;
      state.nutritionSelectTarget = name;
      state.nutritionSearchQuery = '';
      const existing = state.nutritionMatchItems.find(it => it.ingredient.name === name);
      state.nutritionSearchResults = (existing && existing.candidates) || [];
      state.modal.stage = 'select';
      render();
      break;
    }
    case 'nutrition-back-to-match':
      state.modal.stage = 'match';
      render();
      break;
    case 'nutrition-accept-suggestions': {
      const rr = state.recipes.find(x => x.id === state.modal.recipeId);
      for (const it of state.nutritionMatchItems) if (it.status === 'uncertain' && it.food && it.food.id) await confirmIngredientMatch(it.ingredient.name, it.food.id);
      state.nutritionMatchItems = await matchIngredients(state.nutritionMatchItems.map(it => it.ingredient), rr && rr.steps);
      state.modal.stage = 'match';
      render();
      showToast('Vorschläge übernommen');
      break;
    }
    case 'nutrition-confirm-match': {
      const name = el.dataset.name, foodId = el.dataset.foodId;
      await confirmIngredientMatch(name, foodId);
      const rCM = state.recipes.find(x => x.id === state.modal.recipeId);
      const idx = state.nutritionMatchItems.findIndex(it => it.ingredient.name === name);
      if (idx > -1) state.nutritionMatchItems[idx] = { ingredient: state.nutritionMatchItems[idx].ingredient, ...(await matchIngredient(name, rCM && rCM.steps)) };
      state.modal.stage = 'match';
      render();
      showToast('Zuordnung gespeichert');
      break;
    }
    case 'nutrition-reset-match': {
      const name = el.dataset.name;
      await resetIngredientMatch(name);
      const rRM = state.recipes.find(x => x.id === state.modal.recipeId);
      const idx = state.nutritionMatchItems.findIndex(it => it.ingredient.name === name);
      if (idx > -1) state.nutritionMatchItems[idx] = { ingredient: state.nutritionMatchItems[idx].ingredient, ...(await matchIngredient(name, rRM && rRM.steps)) };
      render();
      break;
    }
    case 'nutrition-open-custom':
      state.nutritionSelectTarget = el.dataset.name;
      state.modal.stage = 'custom';
      render();
      break;
    case 'nutrition-save-custom': {
      const name = state.nutritionSelectTarget;
      const val = (fid) => { const node = document.getElementById(fid); return node ? node.value : ''; };
      const num = (fid) => { const n = parseFloat(val(fid).replace(',', '.')); return isNaN(n) ? null : n; };
      const food = await saveCustomFood({
        name: val('cf-name').trim() || name,
        nutrientsPer100g: {
          energyKcal: num('cf-kcal'), protein: num('cf-protein'), carbohydrates: num('cf-carbs'),
          sugars: num('cf-sugars'), fat: num('cf-fat'), saturatedFat: num('cf-satfat'),
          fiber: num('cf-fiber'), salt: num('cf-salt'),
        },
      });
      await confirmIngredientMatch(name, food.id);
      const rCF = state.recipes.find(x => x.id === state.modal.recipeId);
      const idx = state.nutritionMatchItems.findIndex(it => it.ingredient.name === name);
      if (idx > -1) state.nutritionMatchItems[idx] = { ingredient: state.nutritionMatchItems[idx].ingredient, ...(await matchIngredient(name, rCF && rCF.steps)) };
      state.modal.stage = 'match';
      render();
      showToast('Eigenes Lebensmittel gespeichert');
      break;
    }
    case 'nutrition-apply': {
      const r = state.recipes.find(x => x.id === (state.modal && state.modal.recipeId));
      if (!r) break;
      await recalculateAndStoreNutrition(r);
      closeModal();
      showToast('Nährwerte berechnet');
      break;
    }
    case 'nutrition-open-detail': {
      const r = state.recipes.find(x => x.id === id);
      if (!r) break;
      state._nutritionDetailResult = await dbGetNutritionResult(r.id);
      openModal({ type: 'nutrition-detail', recipeId: id }, `[data-action="nutrition-open-detail"][data-id="${id}"]`);
      break;
    }
    case 'nutrition-set-mode':
      state.nutritionDetailMode = el.dataset.mode;
      render();
      break;
    case 'nutrition-save-finished-weight': {
      const r = state.recipes.find(x => x.id === id);
      if (!r) break;
      const raw = document.getElementById('nutritionFinishedWeight').value;
      const num = parseFloat((raw || '').replace(',', '.'));
      r.nutritionFinishedWeight = (!isNaN(num) && num > 0) ? num : null;
      await dbPut(r);
      state._nutritionDetailResult = await recalculateAndStoreNutrition(r);
      render();
      showToast('Fertiggewicht gespeichert');
      break;
    }

    /* ---------- Nutrition: Open Food Facts Barcode (Punkt 27-29) ---------- */
    case 'nutrition-open-barcode':
      state.nutritionSelectTarget = el.dataset.name || state.nutritionSelectTarget;
      state.nutritionBarcodeStatus = 'idle';
      state.nutritionBarcodeProduct = null;
      state.nutritionBarcodeInput = '';
      state.modal.stage = 'barcode';
      render();
      break;
    case 'nutrition-start-camera':
      await startNutritionBarcodeCamera();
      break;
    case 'nutrition-barcode-lookup': {
      const code = (document.getElementById('nutritionBarcodeManual').value || '').trim();
      stopNutritionBarcodeCamera();
      state.nutritionBarcodeInput = code;
      await lookupBarcodeAndRender(code);
      break;
    }
    case 'nutrition-close-barcode':
      stopNutritionBarcodeCamera();
      state.modal.stage = 'select';
      render();
      break;

    /* ---------- PDF-Export-Vorschau (Punkt 59, 65) ---------- */
    case 'noop':
      break;
    case 'rc-apply': {
      const ok = await applyRecipeFix(id, el.dataset.issue);
      showToast(ok ? 'Vorschlag übernommen' : 'Der Vorschlag passt nicht mehr');
      render();
      break;
    }
    case 'pdf-zoom': {   // Vorschau (Canvas-Modus) vergroessern/verkleinern
      const m = state.modal; if (!m) break;
      const z = Math.max(1, Math.min(3, (m.zoom || 1) + (id === 'in' ? 0.5 : -0.5)));
      m.zoom = z;
      const box = document.getElementById('pdfPages');
      if (box) { box.style.setProperty('--pdf-zoom', String(z)); box.querySelectorAll('canvas').forEach((c) => { c.width = 0; c.height = 0; c.remove(); }); renderPdfPreview(m.previewBlob, box); }
      break;
    }
    case 'pdf-export-set-template':
      state.modal.template = id;
      pdfRememberTemplate(id);
      render();
      break;
    case 'pdf-export-set-detail':
      state.modal.nutritionDetail = el.dataset.level;
      render();
      break;
    case 'pdf-export-build': {
      state.modal.stage = 'building';
      render();
      const m = state.modal;
      let result = null;
      try {
        const opts = { template: m.template };
        result = m.target === 'cookbook'
          ? await buildCookbookPdf(m.nutritionDetail, opts)
          : await buildSinglePdf(m.recipeId, m.nutritionDetail, opts);
      } catch (err) {
        console.warn('PDF-Erstellung fehlgeschlagen', err);
        result = null;
      }
      // waehrend des Builds kann das Modal geschlossen/gewechselt worden sein: Ergebnis dann verwerfen
      if (state.modal !== m) return;
      if (!result) {
        showToast('PDF konnte nicht erstellt werden. Deine Rezepte sind unverändert.', 'error');
        m.stage = 'options';
        render();
        break;
      }
      m.previewBlob = result.blob;
      m.pageCount = result.blob.pageCount || 0;
      m.zoom = 1;
      m.filename = result.filename;
      m.previewUrl = URL.createObjectURL(result.blob);
      m.stage = 'preview';
      render();
      break;
    }
    case 'pdf-export-back':
      revokePdfPreviewUrl();
      state.modal.previewUrl = null;
      state.modal.previewBlob = null;
      state.modal.stage = 'options';
      render();
      break;
    case 'pdf-export-download':
      triggerPdfDownload(state.modal.previewBlob, state.modal.filename);
      closeModal();
      if (!SavoraNative.isNative) showToast('PDF heruntergeladen');   // in der iOS-App erscheint stattdessen das Teilen-Fenster
      break;
    case 'pdf-export-share': {
      // Punkt 2: nutzt exakt denselben bereits erzeugten Blob wie Vorschau/Download — kein
      // erneutes, moeglicherweise abweichendes Rendern.
      const blob = state.modal.previewBlob;
      const filename = state.modal.filename || 'savora.pdf';
      if (SavoraNative.isNative) {
        try { await SavoraNative.shareFile(blob, filename, filename); }
        catch (err) { if (!SavoraNative.isCancel(err)) showToast('Teilen nicht möglich', 'error'); }
        break;
      }
      try {
        const file = new File([blob], filename, { type: 'application/pdf' });
        if (navigator.canShare && !navigator.canShare({ files: [file] })) {
          throw new Error('share-files-not-supported');
        }
        await navigator.share({ files: [file], title: filename });
      } catch (err) {
        if (err && err.name === 'AbortError') break; // Nutzer hat den Teilen-Dialog selbst abgebrochen
        // Fallback: Web-Share-API existiert, aber Datei-Teilen wird nicht unterstuetzt oder
        // ist fehlgeschlagen — dieselbe Datei stattdessen herunterladen (Punkt 2: "Fallback:
        // Download/Speichern"), keine externe Upload-Vorschau.
        triggerPdfDownload(blob, filename);
        showToast('Teilen nicht möglich, PDF wurde stattdessen heruntergeladen', 'info');
      }
      break;
    }
  }
}
