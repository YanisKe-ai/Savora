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
  const importUrl = document.getElementById('importUrl');
  if (importUrl) importUrl.addEventListener('keydown', (e) => { if (e.key === 'Enter') importFromUrl(importUrl.value.trim()); });

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
      state.editingRecipe = emptyRecipe();
      state.view = 'form';
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
    case 'back':
      state.modal = null;
      state.view = (state.view === 'form' && state.activeRecipeId) ? 'detail'
        : state.view === 'unitconverter' ? 'settings'
        : 'home';
      render();
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
      if (state.editingRecipe.diet.includes(dk)) {
        state.editingRecipe.diet = state.editingRecipe.diet.filter(x => x !== dk);
      } else {
        state.editingRecipe.diet.push(dk);
      }
      render();
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
      exportSinglePdf(id);
      break;
    case 'export-cookbook':
      exportCookbookPdf();
      break;
    case 'export-backup':
      downloadBackup();
      break;
    case 'trigger-restore':
      document.getElementById('restoreFileInput').click();
      break;
    case 'share-recipe':
      shareRecipe(id);
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
    case 'toggle-settings-section': {
      const key = el.dataset.key;
      const nowOpen = !state.settingsOpen.has(key);
      if (nowOpen) state.settingsOpen.add(key); else state.settingsOpen.delete(key);
      const body = document.getElementById('sec-' + key);
      if (body) { body.classList.toggle('open', nowOpen); body.toggleAttribute('hidden', !nowOpen); }
      el.classList.toggle('open', nowOpen);
      el.setAttribute('aria-expanded', nowOpen ? 'true' : 'false');
      return; // kein Re-Render — bewahrt unbestätigte Eingaben in anderen Feldern
    }
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
      if (document.startViewTransition && !prefersReducedMotion()) {
        const x = e.clientX, y = e.clientY;
        const endRadius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
        document.documentElement.classList.add('theme-transitioning');
        const transition = document.startViewTransition(applyThemeChange);
        transition.ready.then(() => {
          document.documentElement.animate(
            { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`] },
            { duration: 550, easing: 'cubic-bezier(.4,0,.2,1)', pseudoElement: '::view-transition-new(root)' }
          );
        });
        transition.finished.then(() => document.documentElement.classList.remove('theme-transitioning'));
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
    case 'do-import': {
      const url = document.getElementById('importUrl').value.trim();
      if (url) importFromUrl(url);
      break;
    }
    case 'focus-paste-import': {
      const ta = document.getElementById('pasteText');
      if (ta) { ta.focus(); ta.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' }); }
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
  }
}
