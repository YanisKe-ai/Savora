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
  toastTimer = setTimeout(() => el.remove(), duration);
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
  r.servings = parseInt(document.getElementById('f-servings').value) || 1;
  r.timeMinutes = parseInt(document.getElementById('f-time').value) || 0;
  r.difficulty = document.getElementById('f-difficulty').value;
  r.notes = document.getElementById('f-notes').value;
  r.ingredients = Array.from(document.querySelectorAll('#ingRows [data-ing-row]')).map(row => ({
    amount: row.querySelector('.ing-amount-input').value.trim(),
    unit: row.querySelector('.ing-unit-input').value.trim(),
    name: row.querySelector('.ing-name-input').value.trim(),
  }));
  r.steps = Array.from(document.querySelectorAll('#stepRows [data-step-row]')).map(row => ({
    text: row.querySelector('.step-text-input').value.trim(),
  }));
  r.updatedAt = Date.now();
  return r;
}

let modalTriggerSelector = null;

/* Zentrale Modal-Oeffnen-/Schliessen-Logik, von ALLEN Schliesswegen gemeinsam genutzt
   (Escape, Abbrechen-Button, Backdrop, erfolgreiche Aktion) — vorher hatte Escape einen
   eigenen, abweichenden Pfad ohne Fokus-Rueckgabe.
   Wichtig: Savora rendert bei jedem render() das komplette #app-innerHTML neu (kein
   Diffing) — eine direkt gehaltene Elementreferenz waere direkt nach dem oeffnenden
   render() schon veraltet. Deshalb wird ein CSS-Selektor gespeichert und der Ausloeser
   nach dem Schliessen frisch im neuen DOM wiedergefunden. */
function openModal(modal, triggerSelector) {
  modalTriggerSelector = triggerSelector || null;
  state.modal = modal;
  render();
}
function closeModal() {
  stopNutritionBarcodeCamera(); // Kamera darf nie weiterlaufen, wenn das Modal verlassen wird
  revokePdfPreviewUrl(); // Blob-URL der PDF-Vorschau freigeben, sonst haengt der Blob im Speicher
  state.modal = null;
  render();
  const trigger = modalTriggerSelector && document.querySelector(modalTriggerSelector);
  if (trigger && document.contains(trigger) && typeof trigger.focus === 'function') {
    trigger.focus();
  }
  modalTriggerSelector = null;
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
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (e.shiftKey && !modal.contains(document.activeElement)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!e.shiftKey && !modal.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  }
}

function bindEvents() {
  App.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', onAction);
  });
  if (state.view === 'cookmode') bindCookSwipe();
  hydrateLazyImages();
  hydrateNutritionCards();
  bindNutritionSearchInput();

  const modalSheet = document.querySelector('.modal-sheet');
  if (modalSheet) {
    modalSheet.focus();
    document.addEventListener('keydown', onModalEscape);
  } else {
    document.removeEventListener('keydown', onModalEscape);
  }

  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    let searchDebounceTimer = null;
    searchInput.addEventListener('input', (e) => {
      state.query = e.target.value;
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

  const ucAmount = document.getElementById('ucAmount');
  const ucUnit = document.getElementById('ucUnit');
  const updateUc = () => {
    state.ucAmount = ucAmount.value;
    state.ucUnit = ucUnit.value;
    document.getElementById('ucResults').innerHTML = unitConverterResultsHtml();
  };
  if (ucAmount) ucAmount.addEventListener('input', updateUc);
  if (ucUnit) ucUnit.addEventListener('change', updateUc);

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
  if (el2) { el2.focus(); if (pos !== null) el2.setSelectionRange(pos, pos); }
}

async function onAction(e) {
  const el = e.currentTarget;
  const action = el.dataset.action;
  const id = el.dataset.id;

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
    case 'edit-recipe':
      state.editingRecipe = JSON.parse(JSON.stringify(state.recipes.find(r => r.id === id)));
      state.view = 'form';
      render();
      break;
    case 'save-recipe': {
      const r = collectFormData();
      r.ingredients = r.ingredients.filter(i => i.name);
      r.steps = r.steps.filter(s => s.text);
      if (!r.ingredients.length) r.ingredients = [{ amount: '', unit: '', name: '' }];
      if (!r.steps.length) r.steps = [{ text: '' }];
      delete r._importSummary; // nur eine Anzeigehilfe, gehoert nicht in die Datenbank
      await dbPut(r);
      await loadRecipes();
      state.activeRecipeId = r.id;
      state.view = 'detail';
      render();
      showToast('Rezept gespeichert');
      break;
    }
    case 'open-recipe': {
      const cardImg = el.querySelector('.recipe-card-img');
      if (cardImg) cardImg.style.viewTransitionName = 'recipe-hero-img';
      state.activeRecipeId = id;
      state.view = 'detail';
      window.scrollTo(0, 0);
      render();
      break;
    }
    case 'back': {
      state.modal = null;
      const v = state.view;
      if (v === 'form' && state.activeRecipeId) state.view = 'detail';
      else if (v === 'unitconverter') state.view = 'settings';
      else if (v.indexOf('settings-') === 0) state.view = 'settings';
      else if (v === 'paste-import') state.view = 'home';
      else state.view = 'home';
      render();
      break;
    }
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
      closeModal();
      render();
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
        `„${recipeToDelete.title}" gelöscht`,
        () => { state.recipes.push(recipeToDelete); state.recipes.sort((a, b) => b.updatedAt - a.updatedAt); render(); },
        async () => { await dbDelete(id); if (recipeToDelete.imageId) dbDeleteImage(recipeToDelete.imageId).catch(() => {}); }
      );
      break;
    }
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
      cookGoNext();
      break;
    case 'cook-prev':
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
      state.timers = {};
      state.cookFinished = false;
      state.view = 'detail';
      render();
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
      openModal({ type: 'pdf-export', target: 'single', recipeId: id, stage: 'options', nutritionDetail: await defaultPdfNutritionDetail('single', id) }, `[data-action="export-pdf"][data-id="${id}"]`);
      break;
    case 'export-cookbook':
      openModal({ type: 'pdf-export', target: 'cookbook', stage: 'options', nutritionDetail: await defaultPdfNutritionDetail('cookbook') }, `[data-action="export-cookbook"]`);
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
      openModal({ type: 'pdf-export', target: 'single', recipeId: id, stage: 'options', nutritionDetail: await defaultPdfNutritionDetail('single', id) }, `[data-action="share-recipe"][data-id="${id}"]`);
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
      if (freshInput) freshInput.focus();
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
      if (!text) { showToast('Bitte zuerst Text einfügen'); break; }
      state.editingRecipe = parseFreeTextRecipe(text);
      state.view = 'form';
      render();
      showToast('Entwurf erstellt — bitte prüfen');
      break;
    }

    /* ---------- Nutrition (Punkt 70-75) ---------- */
    case 'nutrition-open-match': {
      const r = state.recipes.find(x => x.id === id);
      if (!r) break;
      const relevant = (r.ingredients || []).filter(i => i.name && i.name.trim() && !isQualitativeIngredient(i));
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
    case 'pdf-export-set-detail':
      state.modal.nutritionDetail = el.dataset.level;
      render();
      break;
    case 'pdf-export-build': {
      state.modal.stage = 'building';
      render();
      const m = state.modal;
      const result = m.target === 'cookbook'
        ? await buildCookbookPdf(m.nutritionDetail)
        : await buildSinglePdf(m.recipeId, m.nutritionDetail);
      if (!result) {
        showToast('PDF konnte nicht erstellt werden', 'error');
        state.modal.stage = 'options';
        render();
        break;
      }
      state.modal.previewBlob = result.blob;
      state.modal.filename = result.filename;
      state.modal.previewUrl = URL.createObjectURL(result.blob);
      state.modal.stage = 'preview';
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
      showToast('PDF heruntergeladen');
      break;
    case 'pdf-export-share': {
      // Punkt 2: nutzt exakt denselben bereits erzeugten Blob wie Vorschau/Download — kein
      // erneutes, moeglicherweise abweichendes Rendern.
      const blob = state.modal.previewBlob;
      const filename = state.modal.filename || 'savora.pdf';
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
