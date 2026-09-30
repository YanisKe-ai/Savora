/* ---------- Aktionen fuer den Feast x Bloom Umbau ----------
   Wird am Anfang von dispatchAction() (ui.js) aufgerufen. Gibt true zurueck, wenn die Aktion hier
   vollstaendig erledigt wurde; false laesst den bestehenden Handler in ui.js weiterlaufen. */

/* ---------- Dirty-Guard und Entwurf ---------- */
function formDirtySnapshot(recipe) {
  const copy = { ...recipe }; delete copy.updatedAt; delete copy._importSummary;
  return JSON.stringify(copy);
}
function isFormDirty() {
  if (state.view !== 'form' || !state.editingRecipe || !state.editingRecipeSnapshot) return false;
  if (!document.getElementById('f-title')) return false;
  return formDirtySnapshot(collectFormData()) !== state.editingRecipeSnapshot;
}
function confirmDiscardIfDirty() {
  if (!isFormDirty()) return true;
  const ok = window.confirm('Ungespeicherte Änderungen verwerfen? Ein Entwurf bleibt bis zum nächsten Speichern erhalten.');
  return ok;
}
function takeFormSnapshot() {
  if (document.getElementById('f-title')) state.editingRecipeSnapshot = formDirtySnapshot(collectFormData());
}
function openForm(recipe) {
  state.modal = null;
  state.editingRecipe = recipe;
  state.formStep = 0;
  state.draftRestored = false;
  state.draftBannerDismissed = false;
  state.view = 'form';
  render();
  takeFormSnapshot(); // Formular rendert synchron (siehe state.js), DOM ist hier vorhanden
}

let draftSaveTimer = null;
document.addEventListener('input', (e) => {
  if (state.view !== 'form' || !e.target.closest || !e.target.closest('#recipeForm')) return;
  clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(() => {
    if (state.view !== 'form' || !document.getElementById('f-title')) return;
    const r = collectFormData();
    const isNew = !state.recipes.some(x => x.id === r.id);
    if (isFormDirty()) saveRecipeDraft(r, isNew);
  }, 700);
});

/* Einmalig registrierte, delegierte change-Listener (kein erneutes Binden pro Render). */
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.matches && t.matches('[data-plan-day]')) {
    const k = t.dataset.planDay;
    if (t.checked) state.planSelectedDays.add(k); else state.planSelectedDays.delete(k);
    const btn = document.querySelector('[data-action="mealplan-to-shopping"]');
    if (btn) render();
    return;
  }
  if (state.view === 'cookbook' && t.matches) {
    const cfg = getCookbookConfig();
    if (t.matches('[data-cb-field]')) cfg[t.dataset.cbField] = t.value.trim();
    else if (t.matches('[data-cb-chapter]')) { const c = cfg.chapters.find(x => x.id === t.dataset.cbChapter); if (c) c.name = t.value.trim() || c.name; }
    else if (t.matches('[data-cb-item-chapter]')) { const it = cfg.items.find(x => x.recipeId === t.dataset.cbItemChapter); if (it) it.chapterId = t.value; }
    else return;
    saveCookbookConfig(cfg);
    render();
  }
});

function readPlanMeal() {
  const custom = document.getElementById('planMealCustom');
  const v = custom ? custom.value.trim() : '';
  return v || (state.modal && state.modal.meal) || '';
}
function currentWeekDays() { return Array.from({ length: 7 }, (_, i) => fmtDateKey(addDays(state.weekStart, i))); }
function replaceModal(modal) { state.modal = modal; render(); }
function parseShoppingInput(text) {
  const m = text.match(/^\s*([\d.,/½¼¾⅓⅔]+)\s*([A-Za-zäöüÄÖÜ.]+)?\s+(.+)$/);
  if (!m) return { name: text.trim(), amount: '', unit: '' };
  const amount = parseAmount(m[1]);
  if (amount === null) return { name: text.trim(), amount: '', unit: '' };
  const unitCandidate = m[2] || '';
  const knownUnit = unitCandidate && (normalizeUnit(unitCandidate) || /^(stk|stück|prise|bund|pkg|pack|dose|el|tl|becher|zehe|zehen)\.?$/i.test(unitCandidate));
  if (knownUnit) return { name: m[3].trim(), amount, unit: unitCandidate };
  return { name: ((unitCandidate ? unitCandidate + ' ' : '') + m[3]).trim(), amount, unit: '' };
}

async function handleActionV2(action, id, el, e) {
  switch (action) {
    /* ----- Navigation mit Schutz vor Datenverlust ----- */
    case 'back':
    case 'nav-tab':
      if (state.view === 'form') {
        if (!confirmDiscardIfDirty()) return true;
        clearRecipeDraft();
        state.editingRecipeSnapshot = null;
      }
      if (state.view === 'cookmode' && !state.cookFinished) saveCookProgress();
      return false;

    /* ----- Uebersicht ----- */
    case 'focus-search': {
      const input = document.getElementById('searchInput');
      if (!input) return true;
      if (input.getBoundingClientRect().top < 0) window.scrollTo(0, 0); // bewusste Nutzeraktion
      focusWithoutScroll(input);
      return true;
    }
    case 'set-collection':
      state.favOnly = false;
      state.activeCollection = id || 'all';
      render();
      return true;
    case 'set-home-layout':
      state.homeLayout = id === 'list' ? 'list' : 'grid';
      try { localStorage.setItem(HOME_LAYOUT_KEY, state.homeLayout); } catch (err) {}
      render();
      return true;
    case 'clear-all-filters':
      state.activeFilters.dietary.clear(); state.activeFilters.category.clear(); state.activeFilters.time.clear();
      state.favOnly = false; state.activeTag = null; state.activeCollection = 'all';
      if (state.modal) closeModal(); else render();
      return true;
    case 'open-recipe':
      if (state.activeRecipeId !== id) state.detailTab = 'ingredients';
      return false;

    /* ----- Rezeptdetail ----- */
    case 'set-detail-tab': {
      // Nur umblenden, nicht neu rendern. Das neue Panel bekommt mindestens die Hoehe des alten,
      // damit ein kuerzeres Panel die Scrollposition nicht nach oben klemmt.
      const oldPanel = document.querySelector('.tab-panel:not([hidden])');
      const newPanel = document.getElementById('panel-' + id);
      if (!newPanel) { state.detailTab = id; render(); return true; }
      const prevH = oldPanel ? oldPanel.offsetHeight : 0;
      state.detailTab = id;
      const dm = document.querySelector('.detail-main'); if (dm) dm.dataset.tab = id;   // breites Layout richtet sich danach
      document.querySelectorAll('.tab-panel').forEach(p => { p.hidden = p !== newPanel; });
      document.querySelectorAll('.tab-v2[role="tab"]').forEach(t => {
        const on = t.dataset.id === id;
        t.classList.toggle('is-active', on); t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
      });
      if (prevH) newPanel.style.minHeight = prevH + 'px';
      return true;
    }
    case 'toggle-ingredient-check': {
      const idx = parseInt(el.dataset.idx, 10);
      const set = checkedSetFor(id);
      if (set.has(idx)) set.delete(idx); else set.add(idx);
      const on = set.has(idx);
      SavoraNative.haptic('light');
      document.querySelectorAll(`[data-action="toggle-ingredient-check"][data-id="${id}"][data-idx="${idx}"]`).forEach(b => { b.classList.toggle('is-checked', on); b.setAttribute('aria-checked', String(on)); });
      const p = loadCookProgress();
      if (state.view === 'cookmode' || (p && p.recipeId === id)) { const prev = state.activeRecipeId; state.activeRecipeId = id; saveCookProgress(); state.activeRecipeId = prev; }
      return true;
    }
    case 'reset-ingredient-checks':
      checkedSetFor(id).clear();
      render();
      return true;
    case 'open-detail-menu':
      openModal({ type: 'detail-menu', recipeId: id }, '[data-action="open-detail-menu"]');
      return true;
    case 'edit-recipe': {
      const r = state.recipes.find(x => x.id === id);
      if (!r) return true;
      openForm(JSON.parse(JSON.stringify(r)));
      return true;
    }
    case 'new-recipe':
      openForm(emptyRecipe());
      return true;
    case 'duplicate-recipe': {
      const r = state.recipes.find(x => x.id === id);
      if (!r) return true;
      const copy = JSON.parse(JSON.stringify(r));
      copy.id = uid();
      copy.title = (r.title || 'Rezept') + ' (Kopie)';
      copy.createdAt = Date.now(); copy.updatedAt = Date.now();
      copy.favorite = false; copy.cookCount = 0; delete copy.lastCookedAt; copy.cookLog = [];
      if (r.imageId) {
        // Eigenes Bild fuer die Kopie, damit Loeschen des Originals die Kopie nicht beschaedigt.
        try {
          const img = await dbGetImage(r.imageId);
          if (img) { const newId = uid(); await dbPutImage({ ...img, id: newId }); copy.imageId = newId; }
        } catch (err) { /* Bild optional, Rezept trotzdem duplizieren */ }
      }
      await dbPut(copy);
      await loadRecipes();
      state.modal = null;
      state.activeRecipeId = copy.id;
      state.detailTab = 'ingredients';
      render();
      showToast('Rezept dupliziert');
      return true;
    }
    case 'add-to-cookbook': {
      const cfg = getCookbookConfig();
      if (!cfg.items.some(it => it.recipeId === id)) cfg.items.push({ recipeId: id, chapterId: '' });
      saveCookbookConfig(cfg);
      closeModal();
      showToast('Im Kochbuch aufgenommen');
      return true;
    }
    case 'open-collections-modal':
      replaceModal({ type: 'collections', recipeId: id });
      return true;
    case 'toggle-recipe-collection': {
      const r = state.recipes.find(x => x.id === id);
      const col = el.dataset.col;
      r.collections = Array.isArray(r.collections) ? r.collections : [];
      r.collections = r.collections.includes(col) ? r.collections.filter(c => c !== col) : r.collections.concat(col);
      await dbPut(r); // updatedAt bewusst unveraendert: Einsortieren ist keine Rezeptbearbeitung
      render();
      return true;
    }
    case 'create-collection': {
      const input = document.getElementById('newCollectionName');
      const name = input ? input.value.trim() : '';
      if (!name) { showToast('Bitte einen Namen eingeben'); return true; }
      const cols = getCollections();
      const existing = cols.find(c => c.name.toLowerCase() === name.toLowerCase());
      const col = existing || { id: 'col_' + Date.now().toString(36), name };
      if (!existing) { cols.push(col); saveCollections(cols); }
      const r = state.recipes.find(x => x.id === id);
      if (r) { r.collections = Array.isArray(r.collections) ? r.collections : []; if (!r.collections.includes(col.id)) r.collections.push(col.id); await dbPut(r); }
      render();
      return true;
    }
    case 'open-plan-recipe':
      replaceModal({ type: 'plan-recipe', recipeId: id, meal: '' });
      return true;

    /* ----- Notizen ----- */
    case 'open-note-modal':
      openModal({ type: 'note', recipeId: id }, `[data-action="open-note-modal"][data-id="${id}"]`);
      return true;
    case 'save-note': {
      const r = state.recipes.find(x => x.id === id);
      const text = (document.getElementById('noteText') || {}).value || '';
      const dated = (document.getElementById('noteDated') || {}).checked;
      if (!text.trim()) { showToast('Die Notiz ist leer'); return true; }
      if (dated) {
        r.cookLog = Array.isArray(r.cookLog) ? r.cookLog : [];
        r.cookLog.push({ id: uid(), date: Date.now(), text: text.trim() });
      } else {
        r.notes = r.notes ? r.notes.trim() + '\n\n' + text.trim() : text.trim();
        r.updatedAt = Date.now();
      }
      await dbPut(r);
      state.detailTab = 'notes';
      closeModal();
      showToast('Notiz gespeichert');
      return true;
    }
    case 'delete-cook-note': {
      const r = state.recipes.find(x => x.id === id);
      if (!window.confirm('Diese Notiz löschen?')) return true;
      r.cookLog = (r.cookLog || []).filter(n => n.id !== el.dataset.note);
      await dbPut(r);
      render();
      return true;
    }

    /* ----- Kochmodus ----- */
    case 'start-cook': {
      const r = state.recipes.find(x => x.id === id);
      if (!r) return true;
      const p = loadCookProgress();
      state.activeRecipeId = id;
      state.cookFinished = false;
      state.cookAllSteps = false;
      state.cookShowAllIngredients = false;
      if (p && p.recipeId === id) {
        state.cookStepIndex = Math.min(p.step || 0, Math.max(0, cookSteps(r).length - 1));
        state.checkedIngredients[id] = new Set(p.checked || []);
        Object.entries(p.timers || {}).forEach(([tid, t]) => {
          if (state.timers[tid] && state.timers[tid].running) return;
          if (t.running && t.endTime) {
            const remaining = Math.max(0, Math.round((t.endTime - Date.now()) / 1000));
            if (remaining > 0) { state.timers[tid] = { total: t.total, remaining, endTime: t.endTime, running: false, done: false }; startTimer(tid, t.total); }
            else state.timers[tid] = { total: t.total, remaining: 0, running: false, done: true };
          } else {
            state.timers[tid] = { total: t.total, remaining: t.remaining, running: false, done: !!t.done };
          }
        });
        if (state.cookStepIndex > 0) setTimeout(() => showToast(`Fortgesetzt bei Schritt ${state.cookStepIndex + 1}`, 'info'), 50);
      } else {
        state.cookStepIndex = 0;
      }
      state.view = 'cookmode';
      render();
      saveCookProgress();
      speakCurrentStepIfEnabled();
      state.wakeLockUnsupported = !('wakeLock' in navigator) && !SavoraNative.isNative;
      await requestWakeLock();
      if (state.view === 'cookmode') render();
      return true;
    }
    case 'cook-font':
      state.cookScale = ((state.cookScale || 0) + 1) % 3;
      try { localStorage.setItem('savora-cook-scale', String(state.cookScale)); } catch (err) {}
      SavoraNative.haptic('light');
      render();
      showToast('Schrift: ' + ['Normal', 'Gross', 'Sehr gross'][state.cookScale]);
      return true;
    case 'timer-plus':
      timerPlusMinute(el.dataset.timer);
      return true;
    case 'cook-goto-timer':
    case 'cook-goto':
      state.cookStepIndex = parseInt(el.dataset.idx, 10) || 0;
      state.cookAllSteps = false;
      saveCookProgress();
      render();
      speakCurrentStepIfEnabled();
      return true;
    case 'backup-nudge-dismiss':
      try { localStorage.setItem(BACKUP_NUDGE_KEY, String(Date.now() + 7 * 86400000)); } catch (err) {}
      render();
      return true;
    case 'set-show-nutrition':
      state.showNutrition = el.dataset.value === '1';
      try { localStorage.setItem('savora-show-nutrition', state.showNutrition ? '1' : '0'); } catch (err) {}
      if (!state.showNutrition && state.detailTab === 'nutrition') state.detailTab = 'ingredients';
      render();
      return true;
    case 'cook-toggle-all-steps':
      state.cookAllSteps = !state.cookAllSteps;
      render();
      return true;
    case 'cook-toggle-all-ings':
      state.cookShowAllIngredients = !state.cookShowAllIngredients;
      render();
      return true;
    case 'toggle-timer':
      setTimeout(saveCookProgress, 0); // nach dem Start/Stop durch den bestehenden Handler sichern
      return false;
    case 'exit-cook':
      if (!state.cookFinished) saveCookProgress();
      state.cookProgressHandled = true; // popstate soll den eben gesicherten Stand nicht ueberschreiben
      releaseWakeLock();
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      Object.values(state.timers).forEach(t => { if (t.intervalId) clearInterval(t.intervalId); t.intervalId = null; t.running = false; });
      state.timers = {}; SavoraNative.cancelAllTimers();
      state.cookFinished = false;
      history.back();
      return true;
    case 'cook-complete': {
      const r = state.recipes.find(x => x.id === id);
      const note = ((document.getElementById('cookRunNote') || {}).value || '').trim();
      r.cookCount = (r.cookCount || 0) + 1;
      r.lastCookedAt = Date.now();
      if (note) { r.cookLog = Array.isArray(r.cookLog) ? r.cookLog : []; r.cookLog.push({ id: uid(), date: Date.now(), text: note }); }
      await dbPut(r);
      clearCookProgress();
      checkedSetFor(r.id).clear();
      releaseWakeLock();
      Object.values(state.timers).forEach(t => { if (t.intervalId) clearInterval(t.intervalId); });
      state.timers = {}; SavoraNative.cancelAllTimers();
      state.cookFinished = false;
      state.cookStepIndex = 0;
      state.cookProgressHandled = true;
      showToast('Als gekocht gespeichert');
      history.back();
      return true;
    }

    case 'cook-edit-step-ings':
      openModal({ type: 'step-ings', stepIndex: parseInt(el.dataset.idx, 10) }, '[data-action="cook-edit-step-ings"]');
      return true;
    case 'save-step-ings': case 'reset-step-ings': {
      const r = state.recipes.find(x => x.id === state.activeRecipeId);
      const step = r && (r.steps || [])[parseInt(el.dataset.idx, 10)];
      if (!step) { closeModal(); return true; }
      if (action === 'reset-step-ings') delete step.ingredientRefs;
      else {
        const chosen = Array.from(document.querySelectorAll('[data-step-ing]:checked')).map(x => parseInt(x.dataset.stepIng, 10));
        // Zutaten erhalten nur dann eine feste ID, wenn sie zugeordnet werden (additiv, Mengen unveraendert).
        step.ingredientRefs = chosen.map(idx => { const ing = r.ingredients[idx]; if (!ing.id) ing.id = 'ing_' + uid(); return 'id:' + ing.id; });
      }
      await dbPut(r);
      closeModal();
      showToast(action === 'reset-step-ings' ? 'Wieder automatischer Vorschlag' : 'Zuordnung gespeichert');
      return true;
    }
    case 'fix-diet-conflict': {
      const r = state.recipes.find(x => x.id === id);
      const conflicts = dietConflicts(r);
      if (!conflicts.length) return true;
      const labels = conflicts.map(c => c.label === 'vegan' ? 'Vegan' : 'Vegetarisch').join(' und ');
      if (!window.confirm(`Kennzeichnung „${labels}“ bei „${r.title}“ entfernen? Die Zutaten bleiben unverändert.`)) return true;
      const drop = new Set(conflicts.map(c => c.label));
      r.diet = (r.diet || []).filter(d => !drop.has(d));
      const f = dietFindings(r);
      if (f.meat.length && !r.diet.includes('fleisch')) r.diet.push('fleisch');
      if (f.fish.length && !r.diet.includes('fisch')) r.diet.push('fisch');
      r.updatedAt = Date.now();
      await dbPut(r);
      render();
      showToast('Kennzeichnung korrigiert');
      return true;
    }

    /* ----- Einkauf ----- */
    case 'add-to-shopping': {
      const r = state.recipes.find(x => x.id === id);
      if (!r) return true;
      const items = shoppingSelectionFor(r, currentServings(r));
      if (!items.length) { showToast('Dieses Rezept hat noch keine Zutaten'); return true; }
      openModal({ type: 'shop-select', items }, `[data-action="add-to-shopping"][data-id="${id}"]`);
      return true;
    }
    case 'open-shop-from-recipes':
      openModal({ type: 'pick-recipes', selected: [] }, '[data-action="open-shop-from-recipes"]');
      return true;
    case 'confirm-pick-recipes': {
      const ids = Array.from(document.querySelectorAll('[data-pick-recipe]:checked')).map(x => x.dataset.pickRecipe);
      if (!ids.length) { showToast('Bitte mindestens ein Rezept wählen'); return true; }
      const items = ids.flatMap(rid => { const r = state.recipes.find(x => x.id === rid); return r ? shoppingSelectionFor(r, r.servings || 1) : []; });
      replaceModal({ type: 'shop-select', items });
      return true;
    }
    case 'mealplan-to-shopping': {
      const week = currentWeekDays();
      const chosen = week.filter(k => state.planSelectedDays.has(k));
      const days = chosen.length ? chosen : week;
      const items = [];
      days.forEach(k => planEntriesFor(k).forEach((entry, n) => {
        const r = state.recipes.find(x => x.id === entry.recipeId);
        if (!r) return;
        shoppingSelectionFor(r, entry.servings || r.servings || 1).forEach(it => items.push({ ...it, key: `${k}-${n}-${it.key}` }));
      }));
      if (!items.length) { showToast('Keine geplanten Rezepte mit Zutaten'); return true; }
      openModal({ type: 'shop-select', items }, '[data-action="mealplan-to-shopping"]');
      return true;
    }
    case 'confirm-shop-select': {
      const m = state.modal;
      if (!m || m.type !== 'shop-select') return true;
      const on = new Set(Array.from(document.querySelectorAll('[data-shop-key]:checked')).map(x => x.dataset.shopKey));
      const selection = m.items.filter(it => on.has(it.key));
      const { added, merged } = await addSelectionToShopping(selection);
      state.shopping.sort((a, b) => a.name.localeCompare(b.name, 'de'));
      closeModal();
      showToast(selection.length ? `${added} neu, ${merged} zusammengeführt` : 'Nichts ausgewählt');
      return true;
    }
    case 'add-shopping-item-manual': {
      const input = document.getElementById('shoppingAddInput');
      const text = input ? input.value.trim() : '';
      if (!text) return true;
      const parsed = parseShoppingInput(text);
      const item = { id: uid(), name: parsed.name, amount: parsed.amount, unit: parsed.unit, checked: false, recipeId: null, createdAt: Date.now(), sources: [] };
      await dbPutShopping(item);
      state.shopping.push(item);
      render();
      const fresh = document.getElementById('shoppingAddInput');
      if (fresh) focusWithoutScroll(fresh);
      return true;
    }
    case 'open-shop-item':
      openModal({ type: 'shop-item', itemId: id }, `[data-action="open-shop-item"][data-id="${id}"]`);
      return true;
    case 'save-shop-item': {
      const item = state.shopping.find(x => x.id === id);
      if (!item) { closeModal(); return true; }
      const rawAmount = document.getElementById('shopEditAmount').value.trim();
      const pa = parseAmount(rawAmount);
      item.amount = rawAmount === '' ? '' : (pa !== null ? pa : rawAmount);
      item.unit = document.getElementById('shopEditUnit').value.trim();
      item.name = document.getElementById('shopEditName').value.trim() || item.name;
      item.section = document.getElementById('shopEditSection').value;
      await dbPutShopping(item);
      closeModal();
      return true;
    }
    case 'toggle-shop-have': {
      const item = state.shopping.find(x => x.id === id);
      item.have = !item.have;
      await dbPutShopping(item);
      closeModal();
      return true;
    }
    case 'split-shop-item': {
      const item = state.shopping.find(x => x.id === id);
      if (!item || !Array.isArray(item.sources) || item.sources.length < 2) return true;
      for (const s of item.sources) {
        const part = { id: uid(), name: item.name, amount: s.amount, unit: s.unit || '', checked: false, recipeId: s.recipeId || null, createdAt: Date.now(), sources: [s], separate: true };
        if (item.section) part.section = item.section;
        await dbPutShopping(part);
      }
      await dbDeleteShopping(item.id);
      await loadShopping();
      closeModal();
      showToast('Zusammenführung getrennt');
      return true;
    }
    case 'delete-shopping-item':
      await dbDeleteShopping(id);
      await loadShopping();
      if (state.modal) closeModal(); else render();
      return true;
    case 'share-shopping': {
      const open = state.shopping.filter(i => !i.checked && !i.have);
      const bySection = {};
      open.forEach(i => { const s = shopSectionFor(i); (bySection[s] = bySection[s] || []).push(i); });
      const lines = [];
      SHOP_SECTIONS.filter(s => bySection[s]).forEach(s => {
        lines.push(s);
        bySection[s].forEach(i => lines.push(`- ${i.amount !== '' && i.amount != null ? (typeof i.amount === 'number' ? kitchenAmount(i.amount, i.unit) : i.amount) + (i.unit ? ' ' + i.unit : '') + ' ' : ''}${i.name}`));
        lines.push('');
      });
      const text = lines.join('\n').trim() || 'Einkaufsliste ist leer';
      try {
        if (SavoraNative.isNative) { await SavoraNative.shareText('Einkaufsliste', text); return true; }
        if (navigator.share) { await navigator.share({ title: 'Einkaufsliste', text }); return true; }
      } catch (err) { if (SavoraNative.isCancel(err) || (err && err.name === 'AbortError')) return true; }
      try { await navigator.clipboard.writeText(text); showToast('Einkaufsliste kopiert'); }
      catch (err) { showToast('Teilen wird hier nicht unterstützt', 'error'); }
      return true;
    }

    /* ----- Wochenplan ----- */
    case 'open-day-picker':
      openModal({ type: 'pick-recipe', date: el.dataset.date, meal: '' }, `[data-action="open-day-picker"][data-date="${el.dataset.date}"]`);
      return true;
    case 'set-plan-meal':
      if (state.modal) { state.modal.meal = state.modal.meal === id ? '' : id; const c = document.getElementById('planMealCustom'); if (c) c.value = ''; render(); }
      return true;
    case 'assign-mealplan-recipe': {
      const date = el.dataset.date;
      const entries = planEntriesFor(date).slice();
      entries.push({ id: uid(), recipeId: id, meal: readPlanMeal(), servings: null });
      await savePlanEntries(date, entries);
      const fromDetail = state.modal && state.modal.type === 'plan-recipe';
      closeModal();
      if (fromDetail) showToast('Im Wochenplan eingetragen');
      return true;
    }
    case 'open-plan-entry':
      openModal({ type: 'plan-entry', date: el.dataset.date, entryId: id, meal: (planEntriesFor(el.dataset.date).find(x => x.id === id) || {}).meal || '' }, `[data-action="open-plan-entry"][data-id="${id}"]`);
      return true;
    case 'plan-entry-servings': {
      const m = state.modal;
      const entries = planEntriesFor(m.date).map(x => ({ ...x }));
      const entry = entries.find(x => x.id === m.entryId);
      const r = state.recipes.find(x => x.id === entry.recipeId) || { servings: 1 };
      entry.servings = Math.max(1, (entry.servings || r.servings || 1) + parseInt(el.dataset.delta, 10));
      await savePlanEntries(m.date, entries);
      render();
      return true;
    }
    case 'save-plan-entry': {
      const m = state.modal;
      const meal = readPlanMeal();
      const target = (document.getElementById('planMoveDay') || {}).value || m.date;
      let entries = planEntriesFor(m.date).map(x => ({ ...x }));
      const entry = entries.find(x => x.id === m.entryId);
      if (!entry) { closeModal(); return true; }
      entry.meal = meal;
      if (target !== m.date) {
        entries = entries.filter(x => x.id !== entry.id);
        await savePlanEntries(m.date, entries);
        const targetEntries = planEntriesFor(target).map(x => ({ ...x }));
        targetEntries.push(entry);
        await savePlanEntries(target, targetEntries);
      } else {
        await savePlanEntries(m.date, entries);
      }
      closeModal();
      return true;
    }
    case 'remove-plan-entry': {
      const m = state.modal;
      await savePlanEntries(m.date, planEntriesFor(m.date).filter(x => x.id !== m.entryId));
      closeModal();
      return true;
    }

    /* ----- Kochbuch-Designer ----- */
    case 'cb-add-chapter': {
      const input = document.getElementById('cbNewChapter');
      const name = input ? input.value.trim() : '';
      if (!name) { showToast('Bitte einen Kapitelnamen eingeben'); return true; }
      const cfg = getCookbookConfig();
      cfg.chapters.push({ id: 'ch_' + Date.now().toString(36), name });
      saveCookbookConfig(cfg); render();
      return true;
    }
    case 'cb-delete-chapter': {
      const cfg = getCookbookConfig();
      cfg.chapters = cfg.chapters.filter(c => c.id !== id);
      cfg.items.forEach(it => { if (it.chapterId === id) it.chapterId = ''; });
      saveCookbookConfig(cfg); render();
      return true;
    }
    case 'cb-move-chapter': case 'cb-move-item': {
      const cfg = getCookbookConfig();
      const list = action === 'cb-move-chapter' ? cfg.chapters : cfg.items;
      const i = list.findIndex(x => (x.id || x.recipeId) === id);
      const j = i + parseInt(el.dataset.delta, 10);
      if (i < 0 || j < 0 || j >= list.length) return true;
      [list[i], list[j]] = [list[j], list[i]];
      saveCookbookConfig(cfg); render();
      const again = document.querySelector(`[data-action="${action}"][data-id="${id}"][data-delta="${el.dataset.delta}"]:not([disabled])`) || document.querySelector(`[data-action="${action}"][data-id="${id}"]:not([disabled])`);
      if (again) focusWithoutScroll(again);
      return true;
    }
    case 'cb-remove-item': case 'cb-add-item': {
      const cfg = getCookbookConfig();
      if (action === 'cb-remove-item') cfg.items = cfg.items.filter(it => it.recipeId !== id);
      else if (!cfg.items.some(it => it.recipeId === id)) cfg.items.push({ recipeId: id, chapterId: '' });
      saveCookbookConfig(cfg); render();
      return true;
    }
    case 'cb-add-all': {
      const cfg = getCookbookConfig();
      state.recipes.forEach(r => { if (!cfg.items.some(it => it.recipeId === r.id)) cfg.items.push({ recipeId: r.id, chapterId: '' }); });
      saveCookbookConfig(cfg); render();
      return true;
    }

    /* ----- Gefuehrte Erfassung ----- */
    case 'form-goto-step': {
      state.editingRecipe = collectFormData();
      state.formStep = parseInt(el.dataset.idx, 10) || 0;
      render();
      const stepper = document.querySelector('.form-stepper');
      if (stepper && stepper.getBoundingClientRect().top < 0) window.scrollTo(0, 0); // Seitenwechsel im Formular
      return true;
    }
    case 'add-ingredient-group': {
      state.editingRecipe = collectFormData();
      const n = new Set(state.editingRecipe.ingredients.map(i => i.group).filter(Boolean)).size + 1;
      state.editingRecipe.ingredients.push({ amount: '', unit: '', name: '', group: n === 1 && !state.editingRecipe.ingredients.some(i => i.group) ? 'Gruppe 1' : `Gruppe ${n}` });
      render();
      return true;
    }
    case 'remove-ingredient-group': {
      const row = el.closest('[data-group-row]');
      if (row) row.remove();
      state.editingRecipe = collectFormData();
      render();
      return true;
    }
    case 'remove-ingredient': {
      // DOM-basiert entfernen: Indizes im Formular koennen nach dem Umwandeln alter Kopfzeilen
      // von den Array-Indizes abweichen.
      const row = el.closest('[data-ing-row]');
      if (row) row.remove();
      state.editingRecipe = collectFormData();
      if (!state.editingRecipe.ingredients.length) state.editingRecipe.ingredients.push({ amount: '', unit: '', name: '' });
      render();
      return true;
    }
    case 'convert-ingredient-row': {
      const row = el.closest('[data-ing-row]');
      const pos = Array.from(document.querySelectorAll('#ingRows [data-ing-row]')).indexOf(row);
      state.editingRecipe = collectFormData();
      const ing = state.editingRecipe.ingredients[pos];
      if (!ing) return true;
      const converted = autoConvertIngredient(ing);
      if (converted === ing || (converted.amount === ing.amount && converted.unit === ing.unit)) showToast('Einheit ist bereits passend oder nicht umrechenbar');
      else state.editingRecipe.ingredients[pos] = { ...ing, ...converted };
      render();
      return true;
    }
    case 'restore-draft': {
      const d = loadRecipeDraft();
      if (d && d.recipe) {
        state.editingRecipe = d.recipe;
        state.formStep = d.formStep || 0;
        state.draftRestored = true;
        render();
      }
      return true;
    }
    case 'discard-draft':
      clearRecipeDraft();
      state.draftBannerDismissed = true;
      render();
      return true;
    case 'save-recipe':
      clearRecipeDraft();
      state.editingRecipeSnapshot = null;
      return false;
    case 'do-paste-import':
      // Nach dem Import landet der Entwurf im Formular; Snapshot danach, damit ein Verlassen ohne
      // Speichern nachfragt (der Importtext ist dann schon Nutzerarbeit).
      setTimeout(() => { if (state.view === 'form') { state.formStep = 0; state.editingRecipeSnapshot = '__import__'; } }, 0);
      return false;
    default:
      return typeof handleCloudAction === 'function' ? handleCloudAction(action, id, el, e) : false;
  }
}

/* Tastaturbedienung der Rezept-Tabs (Pfeiltasten, Pos1/Ende) gemaess WAI-ARIA Tabs-Muster. */
document.addEventListener('keydown', (e) => {
  const tab = e.target && e.target.closest ? e.target.closest('.tab-v2[role="tab"]') : null;
  if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  const tabs = Array.from(document.querySelectorAll('.tab-v2[role="tab"]'));
  let i = tabs.indexOf(tab);
  if (e.key === 'ArrowLeft') i = (i - 1 + tabs.length) % tabs.length;
  else if (e.key === 'ArrowRight') i = (i + 1) % tabs.length;
  else if (e.key === 'Home') i = 0; else i = tabs.length - 1;
  e.preventDefault();
  tabs[i].click();
  focusWithoutScroll(tabs[i]);
});
