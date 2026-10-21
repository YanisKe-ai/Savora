/* ---------- Aktionen fuer den Feast x Bloom Umbau ----------
   Wird am Anfang von dispatchAction() (ui.js) aufgerufen. Gibt true zurueck, wenn die Aktion hier
   vollstaendig erledigt wurde; false laesst den bestehenden Handler in ui.js weiterlaufen. */

/* ---------- Dirty-Guard und Entwurf ---------- */
function formDirtySnapshot(recipe) {
  const copy = { ...recipe }; delete copy.updatedAt; delete copy._importSummary; delete copy._import;
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

/* Vorschau-Spalte im Editor (Paket 42): bei jeder Eingabe aus den echten Formulardaten neu füllen, ohne den Fokus anzutasten */
function updateFormAside() {
  const body = document.getElementById('formAsideBody');
  if (!body || state.view !== 'form' || !document.getElementById('f-title') || body.offsetParent === null) return;
  body.innerHTML = formAsideBodyHtml(collectFormData());
}
document.addEventListener('input', (e) => { if (e.target.closest && e.target.closest('#recipeForm')) updateFormAside(); });
document.addEventListener('change', (e) => { if (e.target.closest && e.target.closest('#recipeForm')) updateFormAside(); });

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

/* Enter im Namensfeld speichert (Kochbuch anlegen oder umbenennen) */
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !e.target || e.target.id !== 'cbNameInput' || e.isComposing) return;
  e.preventDefault();
  const b = document.querySelector('[data-action="cb-name-save"]'); if (b) b.click();
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
    // Titelblatt-Eingaben (Texte, Datum, Logo) behandelt cover-editor.js
    if (t.closest && t.closest('.cover-picker')) return;
    if (t.matches('[data-cb-flag]')) cfg[t.dataset.cbFlag] = !!t.checked;
    else if (t.matches('[data-cb-print-name]')) {   // 0.83.1: wo der Name gedruckt wird (author bleibt unveraendert)
      if (!COOKBOOK_PRINT_NAME.includes(t.value)) return;
      if (typeof ceFlush === 'function') ceFlush();   // ungespeicherte Eingaben im Cover-Editor zuerst sichern
      const fresh = getCookbookConfig();
      fresh.printName = t.value; saveCookbookConfig(fresh); render();
      const again = document.querySelector(`[data-cb-print-name][value="${cssAttr(t.value)}"]`); if (again) focusWithoutScroll(again);
      return;
    }
    else if (t.matches('[data-cb-field]')) cfg[t.dataset.cbField] = t.value.trim();
    else if (t.matches('[data-cb-chapter]')) { const c = cfg.chapters.find(x => x.id === t.dataset.cbChapter); if (c) c.name = t.value.trim() || c.name; }
    else if (t.matches('[data-cb-item-chapter]')) { const it = cfg.items.find(x => x.recipeId === t.dataset.cbItemChapter); if (it) it.chapterId = t.value; }
    else return;
    saveCookbookConfig(cfg);
    render();
  }
});

// Planungsdialog: Eingaben vor einem Neuaufbau im Dialogzustand merken (Notiz, eigene Bezeichnung)
function planCaptureDrafts(m) {
  if (!m) return;
  const ni = document.getElementById('planNoteInput'); if (ni) m.noteDraft = ni.value;
  const c = document.getElementById('planMealCustom'); if (c) m.mealCustom = c.value;
  const ne = document.getElementById('planNoteEdit'); if (ne) m.noteEditDraft = ne.value;   // Eintrag bearbeiten
  const mv = document.getElementById('planMoveDay'); if (mv) m.moveDraft = mv.value;
}
// Menge fuer den Eintrag: nur eine vom Rezept abweichende Menge wird gespeichert (sonst null wie bisher)
function planServingsFromModal(m, r) {
  const q = m && m.rpQty ? Number(m.rpQty[r.id]) : 0;
  return (q > 0 && yieldKnown(r) && q !== Number(r.servings)) ? q : null;
}
function readPlanMeal() {
  const custom = document.getElementById('planMealCustom');
  const v = custom ? custom.value.trim() : '';
  return v || (state.modal && state.modal.meal) || '';
}
/* Rueckgaengig fuer Einkaufsaktionen: Zustand vorher sichern, im Toast exakt wiederherstellen */
function shopUndoOpts(snap) {
  return { actionLabel: 'Rückgängig', duration: 8000, onAction: async () => {
    await shoppingRestore(snap);
    state.shopStay = new Set();
    if (state.view === 'shopping') render();
    showToast('Wiederhergestellt');
  } };
}
// Markiert Auswahlzeilen, die dieselbe Quelle (Rezept bzw. Wochenplan-Eintrag) schon auf der Liste haben: sie sind vorab abgewaehlt.
function markShoppingDuplicates(items) {
  const keys = shoppingSourceKeys();
  items.forEach(it => { if (it.ref && keys.has(shoppingSourceKey(it.ref, it.name))) { it.dup = true; it.selected = false; } });
  return items.filter(it => it.dup).length;
}
/* Abhaken: sofort, ohne Neuaufbau der Liste. Die Zeile bleibt an ihrer Stelle (state.shopStay), bis die Ansicht neu
   betreten oder «Erledigte nach unten» getippt wird. */
async function toggleShoppingItem(id) {
  const item = state.shopping.find(x => x.id === id);
  if (!item) return true;
  const wasChecked = !!item.checked;
  item.checked = !wasChecked;
  state.shopStay = state.shopStay || new Set();
  state.shopStay.add(id);
  const row = document.querySelector(`.shop-row[data-id="${cssAttr(id)}"]`);
  if (row) {   // unmittelbare Rueckmeldung am Element, ohne Neuaufbau (kein Springen, Fokus bleibt)
    row.classList.toggle('is-checked', item.checked);
    const cb = row.querySelector('.shop-check'); if (cb) cb.setAttribute('aria-checked', String(item.checked));
    updateShopCounts();
  } else render();
  await dbPutShopping(item);
  showToast(`„${item.name}“ ${item.checked ? 'abgehakt' : 'wieder offen'}`, 'success', false, { actionLabel: 'Rückgängig', duration: 6000, onAction: async () => {
    item.checked = wasChecked; await dbPutShopping(item);
    if (state.view === 'shopping') { const r2 = document.querySelector(`.shop-row[data-id="${cssAttr(id)}"]`); if (r2) { r2.classList.toggle('is-checked', item.checked); const c2 = r2.querySelector('.shop-check'); if (c2) c2.setAttribute('aria-checked', String(item.checked)); updateShopCounts(); } else render(); }
  } });
  return true;
}
function updateShopCounts() {
  const open = state.shopping.filter(i => !i.checked && !i.have).length;
  const b = document.querySelector('.nav-badge'); if (b) { b.textContent = open > 99 ? '99+' : String(open); b.hidden = !open; }
  const stayChecked = state.shopping.filter(i => i.checked && (state.shopStay || new Set()).has(i.id)).length;
  const btn = document.querySelector('[data-action="sort-checked-down"]'); if (btn) btn.disabled = !stayChecked;
}
function currentWeekDays() { return Array.from({ length: 7 }, (_, i) => fmtDateKey(addDays(state.weekStart, i))); }
function replaceModal(modal) { state.modal = modal; render(); }
function parseShoppingInput(text) {
  // Gleicher Zeilen-Parser wie beim Import: "2 l Milch", "200-300 g Hack", "½ Bund Petersilie"
  const p = typeof qtyParseLine === 'function' ? qtyParseLine(text) : null;
  if (!p || (p.kind !== 'exact' && p.kind !== 'range')) return { name: text.trim(), amount: '', unit: '' };
  const q = parseQuantity(p.amount, p.unit);
  const f = shopFieldsFromQty(q);
  return { name: p.name, amount: f.amount, ...(f.amountMax !== undefined ? { amountMax: f.amountMax } : {}), unit: p.unit };
}

/* v84 Rezept: Detail -> verknuepftes Detail mit eigenem Verlaufseintrag.
   Der Eintrag des Ausgangsrezepts bekommt Reiter, Scrollstand und die ausloesende Karte (fuer Zurueck);
   ist das Ziel genau das vorherige Rezept (A -> B -> A), geht es zurueck statt einen Eintrag zu stapeln.
   Die Mengenansicht (state.servingsOverride) ist pro Rezept-ID und bleibt dabei unberuehrt. */
function linkNavigate(toId) {
  if (state.linkNavBusy) return;
  const fromId = state.activeRecipeId;
  if (!toId || toId === fromId || state.view !== 'detail' || !state.recipes.some(x => x.id === toId)) return;
  const cur = history.state || {};
  if (cur.view === 'detail' && cur.linkPrev === toId) { history.back(); return; }
  state.linkNavBusy = true;
  setTimeout(() => { state.linkNavBusy = false; }, 350);   // doppelter Klick auf dieselbe Karte nur einmal
  history.replaceState(Object.assign({}, cur, navHistorySnapshot(), {
    detailTab: state.detailTab, scrollY: window.scrollY, linkPrev: cur.linkPrev || null,
    focusSel: `[data-action="open-linked-recipe"][data-id="${cssAttr(toId)}"]`,
  }), '', navHistoryUrl());
  state.activeRecipeId = toId;
  state.detailTab = 'ingredients';
  state.pendingScrollY = 0;   // render() wendet das in applyScroll an (auch im rAF-Nachlauf)
  history.pushState(Object.assign(navHistorySnapshot(), { detailTab: 'ingredients', scrollY: 0, linkPrev: fromId }), '', navHistoryUrl());   // vor render: Topbar liest linkPrev (Zurück zu <Titel>)
  render(true);
  const h = App.querySelector('.detail-title-v2');
  if (h) { h.setAttribute('tabindex', '-1'); focusWithoutScroll(h); }
}

/* v84: Eintrag eines verknuepften Rezepts (hat linkPrev) aktuell halten, damit Browser-Vorwaerts nach Zurueck
   Reiter und Scrollstand wieder findet (ein nicht mehr aktueller Eintrag laesst sich nicht nachtragen). */
function linkSyncEntry() {
  const cur = history.state;
  if (state.view !== 'detail' || state.modal || !cur || cur.view !== 'detail' || !cur.linkPrev || cur.activeRecipeId !== state.activeRecipeId) return;
  try { history.replaceState(Object.assign({}, cur, { detailTab: state.detailTab, scrollY: window.scrollY }), ''); } catch (err) { /* Verlauf nicht beschreibbar */ }
}
let linkSyncTimer = 0;
window.addEventListener('scroll', () => { clearTimeout(linkSyncTimer); linkSyncTimer = setTimeout(linkSyncEntry, 120); }, { passive: true });

async function handleActionV2(action, id, el, e) {
  switch (action) {
    /* ----- Navigation mit Schutz vor Datenverlust ----- */
    case 'ce-reset-confirm': ceResetCover(); closeModal(); return true;   // Cover-Editor (cover-editor.js)
    case 'back':
    case 'nav-tab':
      state.shopStay = new Set();   // Einkauf neu betreten: Abgehaktes wandert nach unten
      state.selectMode = null;      // v84: Auswahlmodus endet beim Verlassen der Übersicht
      if (state.view === 'form') {
        if (!confirmDiscardIfDirty()) return true;
        clearRecipeDraft();
        state.editingRecipeSnapshot = null;
      }
      if (state.view === 'cookmode' && !state.cookFinished) saveCookProgress();
      return false;

    /* ----- Uebersicht ----- */
    case 'open-search': {
      state.searchOpen = true; state.searchEnter = true;
      render();
      const input = document.getElementById('searchInput');
      if (input) focusWithoutScroll(input);
      return true;
    }
    case 'close-search': {
      state.searchOpen = false;
      if (id === 'clear') state.query = '';
      motionFlipRecipes(render);
      const btn = document.getElementById('searchBtn');
      if (btn) focusWithoutScroll(btn);
      return true;
    }
    case 'focus-search': {
      const input = document.getElementById('searchInput');
      if (!input) return true;
      if (input.getBoundingClientRect().top < 0) window.scrollTo(0, 0); // bewusste Nutzeraktion
      focusWithoutScroll(input);
      return true;
    }
    case 'set-collection':
    case 'set-fav-mode':
      // v84: aeltere Einstiegsstellen leiten auf den Bereich der Sammlungsauswahl um (eine Sammlung zur Zeit)
      state.favOnly = false;
      state.activeCollection = action === 'set-fav-mode' ? (id === 'fav' ? 'favorites' : 'all') : (id || 'all');
      if (state.modal) closeModal(); else motionFlipRecipes(render);
      return true;
    case 'reset-extra-filters':
      resetExtraFilters();
      motionFlipRecipes(render);
      return true;
    case 'fs-reset': {
      const d = filterDraft();
      if (d) { ['dietary', 'category', 'time', 'more', 'tags'].forEach(k => d[k].clear()); syncFilterSheet(); }
      return true;
    }
    case 'fs-apply': {
      const d = filterDraft();
      if (d) {
        const f = state.activeFilters;
        ['dietary', 'category', 'time', 'more', 'tags'].forEach(k => { f[k] = new Set(d[k]); });
        state.activeTag = null;   // v84: der Bereich (Sammlung, Favoriten) bleibt, Filter wirken darin
      }
      closeModal();   // Neuaufbau erst nach popstate (asynchron): hier keine Kartenbewegung, das Fenster deckt die Liste ab
      return true;
    }
    case 'set-home-layout':
      state.homeLayout = id === 'list' ? 'list' : 'grid'; state.homeLayoutChosen = true;
      try { localStorage.setItem(HOME_LAYOUT_KEY, state.homeLayout); } catch (err) {}
      render();
      return true;
    case 'clear-search':
      state.query = ''; motionFlipRecipes(render);
      return true;
    case 'clear-all-filters':
      resetExtraFilters();
      state.favOnly = false;
      if (state.modal) closeModal(); else motionFlipRecipes(render);
      return true;
    /* ----- v84 Übersicht: Sammlungsauswahl, Verwalten, Auswahlmodus (hvHandleAction unten) ----- */
    case 'open-col-pick': case 'set-col-scope': case 'col-pick-clear': case 'col-new': case 'col-manage': case 'col-edit':
    case 'col-edit-cancel': case 'col-save': case 'col-use-existing': case 'col-move': case 'col-delete': case 'col-delete-cancel':
    case 'col-delete-confirm': case 'col-batch-new': case 'col-batch-create': case 'col-batch-use': case 'col-batch-apply':
    case 'sel-start': case 'sel-end': case 'sel-toggle': case 'sel-all': case 'sel-add': case 'sel-remove': case 'sel-start-add': case 'sel-add-target':
      return hvHandleAction(action, id, el, e);
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
      linkSyncEntry();
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
      document.querySelectorAll(`[data-action="toggle-ingredient-check"][data-id="${cssAttr(id)}"][data-idx="${idx}"]`).forEach(b => { b.classList.toggle('is-checked', on); b.setAttribute('aria-checked', String(on)); });
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
      // Die Kopie ist ein eigenes Rezept: keine Bestands-IDs und keine Systemmarke uebernehmen (sonst lebt eine veraltete
      // Zuordnung aus recipe.collections wieder auf). Die aktuellen Sammlungen folgen unten ueber org.js.
      copy.collections = []; delete copy.collectionIds;
      if (r.imageId) {
        // Eigenes Bild fuer die Kopie, damit Loeschen des Originals die Kopie nicht beschaedigt.
        try {
          const img = await dbGetImage(r.imageId);
          if (img) { const newId = uid(); await dbPutImage({ ...img, id: newId }); copy.imageId = newId; }
        } catch (err) { /* Bild optional, Rezept trotzdem duplizieren */ }
      }
      await dbPut(copy);
      await loadRecipes();
      if (typeof orgApply === 'function' && typeof orgCollectionIdsOf === 'function') {
        try { orgCollectionIdsOf(r.id).forEach(c => orgApply([copy.id], c, 'add')); } catch (err) { /* Sammlungen optional, Rezept ist dupliziert */ }
      }
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
    /* ----- v84 Rezept: Sammlungen am Rezept (Dialog «Zu Sammlungen hinzufügen», Modaltyp 'rcol') ----- */
    case 'open-collections-modal':   // alter Name, gleicher Dialog
    case 'rcol-open': {
      if (!orgOk() || !state.recipes.some(x => x.id === id)) return true;
      if (state.modal) replaceModal({ type: 'rcol', recipeId: id });
      else openModal({ type: 'rcol', recipeId: id }, `[data-action="${action}"][data-id="${escapeAttr(id)}"]`);
      if (state.modal && state.modal.newOpen) { const inp = document.getElementById('colNewInline'); if (inp) focusWithoutScroll(inp); }
      return true;
    }
    case 'rcol-new': {
      const m = rcolModalState(); if (!m) return true;
      m.newOpen = true; m.newError = null;
      render();
      const inp = document.getElementById('colNewInline'); if (inp) focusWithoutScroll(inp);
      return true;
    }
    case 'rcol-create': {
      const m = rcolModalState(); if (!m) return true;
      const inp = document.getElementById('colNewInline');
      const name = (inp ? inp.value : m.newName || '').trim();
      m.newName = inp ? inp.value : m.newName;
      let res;
      if (!name) res = { ok: false, error: 'empty' };
      else { try { res = orgCreateCollection({ name }); } catch (err) { res = { ok: false, error: 'storage' }; } }
      if (res && res.ok) {
        m.draft = Array.from(new Set(m.draft.concat(res.id)));
        m.newOpen = false; m.newName = ''; m.newError = null; m.existingId = null; m.query = '';
        render();
        rcolRefresh(res.id);   // neue Sammlung angehakt, Fokus auf ihre Checkbox
        announceLive(`Sammlung «${name}» erstellt.`);
      } else {
        m.newError = (res && res.error) || 'storage'; m.existingId = res && res.existingId;
        render();
        const again = document.getElementById('colNewInline'); if (again) focusWithoutScroll(again);
      }
      return true;
    }
    case 'rcol-use-existing': {
      const m = rcolModalState(); if (!m) return true;
      m.draft = Array.from(new Set(m.draft.concat(id)));
      m.newOpen = false; m.newName = ''; m.newError = null; m.existingId = null; m.query = '';
      render();
      rcolRefresh(id);
      return true;
    }
    case 'rcol-save': {
      const m = rcolModalState(); if (!m) return true;
      const rid = m.recipeId;
      const live = new Set(orgCollections().map(c => c.id));
      const before = new Set(rcolCollectionsOf(rid).map(c => c.id));
      const after = new Set(m.draft.filter(c => live.has(c)));
      const added = Array.from(after).filter(c => !before.has(c));
      const removed = Array.from(before).filter(c => !after.has(c));
      closeModal();
      if (!added.length && !removed.length) return true;   // ohne Aenderung nur schliessen
      try {
        // Speicherfehler meldet org.js als { ok:false }: wie eine Ausnahme behandeln (bisher Geschriebenes zuruecknehmen)
        const done = [];
        const set = (c, on) => { const res = orgSetMembership(rid, c, on); if (res && res.ok === false) throw new Error(res.error || 'storage'); done.push([c, on]); };
        try { added.forEach(c => set(c, true)); removed.forEach(c => set(c, false)); }
        catch (e) { done.reverse().forEach(([c, on]) => { try { orgSetMembership(rid, c, !on); } catch (x) {} }); throw e; }
      } catch (err) { showToast('Die Sammlungen konnten nicht gespeichert werden. Der Gerätespeicher ist vielleicht voll. Versuche es nochmals.', 'error', true); return true; }
      // Rueckgaengig stellt nur fuer dieses Rezept die vorherige Menge wieder her (nur die geaenderten Zuordnungen)
      showUndoToast('Sammlungen aktualisiert.', () => {
        added.forEach(c => orgSetMembership(rid, c, false));
        removed.forEach(c => orgSetMembership(rid, c, true));
        if (!state.modal) render();
      }, () => {});
      if (!state.modal) render();
      return true;
    }
    case 'rcol-scope': {
      // Pille in der Rezeptansicht: Meine Rezepte mit dieser Sammlung
      if (typeof orgScopeOpen === 'function') { orgScopeOpen(id); return true; }
      state.modal = null;
      state.activeCollection = id; state.favOnly = false;
      state.view = 'home';
      render();
      return true;
    }

    /* ----- v84 Rezept: «Passt dazu» ----- */
    case 'link-open': {
      if (!linksOk() || !state.recipes.some(x => x.id === id)) return true;
      const m = { type: 'link-recipe', recipeId: id };
      if (state.modal) replaceModal(m);
      else openModal(m, el && el.classList.contains('pairing-add') ? '.pairing-add' : `[data-action="link-open"][data-id="${escapeAttr(id)}"]`);
      return true;
    }
    case 'link-note-toggle': {
      const m = linkPickState(); if (!m) return true;
      m.noteOpen = true;
      render();
      const inp = document.getElementById('linkNote'); if (inp) focusWithoutScroll(inp);
      return true;
    }
    case 'link-save': {
      const m = linkPickState(); if (!m) return true;
      const ids = linkSelected(m);
      if (!ids.length) return true;
      const note = String((document.getElementById('linkNote') || {}).value ?? m.note ?? '').trim().slice(0, LINK_NOTE_MAX);
      const made = [], keys = [];
      ids.forEach(b => { let res; try { res = orgLinkCreate(m.recipeId, b, note); } catch (err) { res = null; } if (res && res.ok) { made.push(b); keys.push(res.key); } });
      if (!made.length) { showToast('Die Verknüpfung konnte nicht gespeichert werden. Versuche es nochmals.', 'error', true); return true; }
      const first = made[0];
      modalTriggerSelector = `[data-action="open-linked-recipe"][data-id="${cssAttr(first)}"]`;   // Fokus danach auf die neue Karte
      closeModal();
      const one = state.recipes.find(x => x.id === first);
      showUndoToast(made.length === 1 ? `Mit «${(one && one.title) || 'Rezept'}» verknüpft.` : `${made.length} Rezepte verknüpft.`, () => {
        keys.forEach(k => { if (k) orgLinkRemove(k); });
        if (!state.modal) render();
      }, () => {});
      return true;
    }
    case 'link-menu':
      openModal({ type: 'link-menu', key: id, recipeId: state.activeRecipeId }, `[data-action="link-menu"][data-id="${escapeAttr(id)}"]`);
      return true;
    case 'link-menu-open': {
      // Erst das Menue schliessen (eigener Verlaufseintrag), danach wie die Karte navigieren
      window.addEventListener('popstate', () => { linkNavigate(id); }, { once: true });
      closeModal();
      return true;
    }
    case 'link-note-edit':
      replaceModal({ type: 'link-note', key: id, recipeId: state.activeRecipeId });
      { const t = document.getElementById('linkNoteEdit'); if (t) focusWithoutScroll(t); }
      return true;
    case 'link-note-save': {
      const t = document.getElementById('linkNoteEdit');
      const note = (t ? t.value : '').trim().slice(0, LINK_NOTE_MAX);
      const had = linkFind(state.activeRecipeId, id);
      try { orgLinkNote(id, note); } catch (err) { showToast('Die Notiz konnte nicht gespeichert werden. Versuche es nochmals.', 'error', true); return true; }
      modalTriggerSelector = `[data-action="link-menu"][data-id="${cssAttr(id)}"]`;
      closeModal();
      showToast(note ? 'Notiz gespeichert.' : (had && had.note ? 'Notiz entfernt.' : 'Notiz gespeichert.'));
      return true;
    }
    case 'link-remove': {
      const rid = state.activeRecipeId;
      const list = linkListFor(rid);
      const i = list.findIndex(l => l.key === id);
      if (i < 0) { if (state.modal) closeModal(); return true; }
      let token;
      try { token = orgLinkRemove(id); } catch (err) { showToast('Die Verknüpfung konnte nicht entfernt werden. Versuche es nochmals.', 'error', true); return true; }
      const next = list[i + 1] || list[i - 1];
      // Fokus: naechste Karte, sonst «Weitere Aktionen» (der Abschnitt verschwindet mit der letzten Verknuepfung)
      const sel = next ? (next.status === 'ok' ? `[data-action="open-linked-recipe"][data-id="${cssAttr(next.otherId)}"]` : `[data-action="link-menu"][data-id="${cssAttr(next.key)}"]`) : '[data-action="open-detail-menu"]';
      if (state.modal) { modalTriggerSelector = sel; closeModal(); }
      else { render(); const f = document.querySelector(sel); if (f) focusWithoutScroll(f); }
      showUndoToast('Verknüpfung entfernt. Beide Rezepte bleiben erhalten.', () => {
        if (typeof orgUndo === 'function' && token) orgUndo(token);
        if (!state.modal) render();
      }, () => {});
      return true;
    }
    case 'open-linked-recipe':
      if (state.view === 'cookmode') { cookLinkOpen(id); return true; }   // im Kochmodus nie ein voller Wechsel
      linkNavigate(id);
      return true;

    /* ----- v84 Rezept: «Passt dazu» im Kochmodus (nur Vorschau, Kochfortschritt und Timer bleiben) ----- */
    case 'cook-links': {
      const ok = cookLinkTargets(state.activeRecipeId);
      if (!ok.length) return true;
      if (ok.length === 1) openModal({ type: 'link-preview', otherId: ok[0].otherId }, '[data-action="cook-links"]');
      else openModal({ type: 'link-list' }, '[data-action="cook-links"]');
      return true;
    }
    case 'cook-link-preview':
      cookLinkOpen(id);
      return true;
    case 'cook-link-list':
      replaceModal({ type: 'link-list' });
      return true;

    case 'open-plan-recipe':
      replaceModal({ type: 'plan-recipe', recipeId: id, meal: '' });
      return true;

    /* ----- Notizen ----- */
    case 'open-note-modal':
      openModal({ type: 'note', recipeId: id }, `[data-action="open-note-modal"][data-id="${escapeAttr(id)}"]`);
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
    case 'set-sort':
      state.sortBy = el.dataset.id;
      try { localStorage.setItem(SORT_KEY, state.sortBy); } catch (err) {}
      render();
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
      markShoppingDuplicates(items);
      openModal({ type: 'shop-select', items }, `[data-action="add-to-shopping"][data-id="${escapeAttr(id)}"]`);
      return true;
    }
    case 'open-shop-from-recipes':
      openModal({ type: 'pick-recipes', selected: [], rpPicker: true, rpMulti: true, rpSel: [], rpQuery: '', rpQty: {} }, '[data-action="open-shop-from-recipes"]');
      return true;
    case 'confirm-pick-recipes': {
      // Auswahl aus dem Dialogzustand (bleibt auch fuer gerade ausgefilterte Rezepte erhalten), Menge je Rezept
      const pm = state.modal;
      const ids = typeof rpSelected === 'function' ? rpSelected(pm) : Array.from(document.querySelectorAll('[data-pick-recipe]:checked')).map(x => x.dataset.pickRecipe);
      if (!ids.length) { showToast('Wähle mindestens ein Rezept für die Einkaufsliste aus.'); const s = document.getElementById('rpSearch'); if (s) focusWithoutScroll(s); return true; }
      const items = ids.flatMap(rid => { const r = state.recipes.find(x => x.id === rid); return r ? shoppingSelectionFor(r, (typeof rpQtyFor === 'function' ? rpQtyFor(pm, r) : 0) || r.servings || 1) : []; });
      markShoppingDuplicates(items);
      // Auswahl merken, damit «Zurück zur Auswahl» Rezepte, Mengen und Suche wiederherstellt
      replaceModal({ type: 'shop-select', items, pickBack: { rpSel: ids.slice(), rpQty: Object.assign({}, pm.rpQty || {}), rpQuery: pm.rpQuery || '', rpScope: pm.rpScope || 'all' } });
      return true;
    }
    case 'shop-back-to-pick': {   // Vorschau -> zurueck in die Rezeptauswahl, ohne etwas zu uebernehmen
      const back = state.modal && state.modal.type === 'shop-select' ? state.modal.pickBack : null;
      if (!back) return true;
      replaceModal({ type: 'pick-recipes', selected: [], rpPicker: true, rpMulti: true, rpSel: back.rpSel.slice(), rpQty: Object.assign({}, back.rpQty), rpQuery: back.rpQuery, rpScope: back.rpScope || 'all' });
      const go = document.querySelector('[data-rp-confirm]'); if (go) focusWithoutScroll(go);
      return true;
    }
    case 'mealplan-to-shopping': {
      const week = currentWeekDays();
      const chosen = week.filter(k => state.planSelectedDays.has(k));
      const days = chosen.length ? chosen : week;
      const items = [];
      days.forEach(k => planEntriesFor(k).forEach((entry, n) => {
        if (isNoteEntry(entry) || !entry.recipeId) return;   // Notizen (Reste, Auswaerts ...) haben keine Zutaten
        const r = state.recipes.find(x => x.id === entry.recipeId);
        if (!r) return;
        shoppingSelectionFor(r, entry.servings || r.servings || 1, `${k}:${entry.id}`).forEach(it => items.push({ ...it, key: `${k}-${n}-${it.key}` }));
      }));
      if (!items.length) { showToast('Keine geplanten Rezepte mit Zutaten'); return true; }
      markShoppingDuplicates(items);
      openModal({ type: 'shop-select', items }, '[data-action="mealplan-to-shopping"]');
      return true;
    }
    case 'confirm-shop-select': {
      const m = state.modal;
      if (!m || m.type !== 'shop-select') return true;
      const on = new Set(Array.from(document.querySelectorAll('[data-shop-key]:checked')).map(x => x.dataset.shopKey));
      const selection = m.items.filter(it => on.has(it.key));
      if (!selection.length) {
        closeModal();
        showToast(m.items.length && m.items.every(it => it.dup) ? 'Nichts Neues hinzugefügt, alles war schon auf der Liste' : 'Nichts ausgewählt');
        return true;
      }
      const snap = shoppingSnapshot();
      const { added, merged } = await addSelectionToShopping(selection);
      state.shopping.sort((a, b) => a.name.localeCompare(b.name, 'de'));
      closeModal();
      const n = added + merged;
      showToast(`${n} Zutat${n === 1 ? '' : 'en'} hinzugefügt${merged ? ` (${merged} zusammengeführt)` : ''}`, 'success', false, shopUndoOpts(snap));
      return true;
    }
    case 'add-shopping-item-manual': {
      const input = document.getElementById('shoppingAddInput');
      const text = input ? input.value.trim() : '';
      if (!text) return true;
      const parsed = parseShoppingInput(text);
      const item = { id: uid(), name: parsed.name, amount: parsed.amount, ...(parsed.amountMax !== undefined ? { amountMax: parsed.amountMax } : {}), unit: parsed.unit, checked: false, recipeId: null, createdAt: Date.now(), sources: [], manual: true };
      await dbPutShopping(item);
      state.shopping.push(item);
      render();
      const fresh = document.getElementById('shoppingAddInput');
      if (fresh) focusWithoutScroll(fresh);
      return true;
    }
    case 'open-shop-item':
      openModal({ type: 'shop-item', itemId: id }, `[data-action="open-shop-item"][data-id="${escapeAttr(id)}"]`);
      return true;
    case 'save-shop-item': {
      const item = state.shopping.find(x => x.id === id);
      if (!item) { closeModal(); return true; }
      const rawAmount = document.getElementById('shopEditAmount').value.trim();
      const eq = parseQuantity(rawAmount, document.getElementById('shopEditUnit').value.trim());
      const before = [item.amount, item.amountMax, item.unit, item.name].join('|');
      delete item.amountMax;
      if (rawAmount === '') item.amount = '';
      else if (eq.kind === 'exact') item.amount = eq.min;
      else if (eq.kind === 'range') { item.amount = eq.min; item.amountMax = eq.max; }
      else item.amount = rawAmount;   // Text oder Mehrdeutiges bleibt wie eingegeben
      item.unit = document.getElementById('shopEditUnit').value.trim();
      item.name = document.getElementById('shopEditName').value.trim() || item.name;
      item.section = document.getElementById('shopEditSection').value;
      if ([item.amount, item.amountMax, item.unit, item.name].join('|') !== before) item.edited = true;   // von Hand geaendert: wird beim Zusammenfuehren nie ueberschrieben
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
        const part = { id: uid(), name: item.name, amount: s.amount, ...(s.amountMax ? { amountMax: s.amountMax } : {}), unit: s.unit || '', checked: false, recipeId: s.recipeId || null, createdAt: Date.now(), sources: [s], separate: true };
        if (item.section) part.section = item.section;
        await dbPutShopping(part);
      }
      await dbDeleteShopping(item.id);
      await loadShopping();
      closeModal();
      showToast('Zusammenführung getrennt');
      return true;
    }
    case 'delete-shopping-item': {
      const snap = shoppingSnapshot();
      const gone = state.shopping.find(x => x.id === id);
      await dbDeleteShopping(id);
      await loadShopping();
      if (state.modal) closeModal(); else render();
      showToast(`„${gone ? gone.name : 'Zutat'}“ entfernt`, 'success', false, shopUndoOpts(snap));
      return true;
    }
    case 'toggle-shopping-item': return toggleShoppingItem(id);
    case 'clear-checked-shopping': {
      const n = state.shopping.filter(s => s.checked).length;
      if (!n) return true;
      const snap = shoppingSnapshot();
      for (const i of state.shopping.filter(s => s.checked)) await dbDeleteShopping(i.id);
      await loadShopping();
      state.shopStay = new Set();
      render();
      showToast(n === 1 ? '1 erledigte Zutat entfernt' : `${n} erledigte Zutaten entfernt`, 'success', false, shopUndoOpts(snap));
      return true;
    }
    case 'clear-all-shopping': {
      if (!state.shopping.length) return true;
      const snap = shoppingSnapshot();
      for (const i of state.shopping) await dbDeleteShopping(i.id);
      await loadShopping();
      state.shopStay = new Set();
      render();
      showToast('Liste geleert', 'success', false, shopUndoOpts(snap));
      return true;
    }
    case 'sort-checked-down': {
      // Einzige Einkaufsaktion mit Bewegung: Zeilen gleiten nach dem Neuaufbau an ihren Platz (220 ms, ohne Staffelung).
      // Der Knopf ist danach deaktiviert; der Fokus geht dann an den Titel «Erledigt» (wohin die Artikel gewandert sind), ohne Scrollen.
      const hadFocus = document.activeElement && document.activeElement.closest && document.activeElement.closest('[data-action="sort-checked-down"]');
      state.shopStay = new Set();
      motionFlipShopping(render);
      if (hadFocus) {
        const btn = document.querySelector('[data-action="sort-checked-down"]');
        if (btn && !btn.disabled) focusWithoutScroll(btn);
        else {
          const t = document.querySelector('.shop-section--done .shop-section-title') || document.querySelector('.shop-main .page-title');
          if (t) { t.setAttribute('tabindex', '-1'); focusWithoutScroll(t); }
        }
      }
      return true;
    }
    case 'share-shopping': {
      const open = state.shopping.filter(i => !i.checked && !i.have);
      const bySection = {};
      open.forEach(i => { const s = shopSectionFor(i); (bySection[s] = bySection[s] || []).push(i); });
      const lines = [];
      SHOP_SECTIONS.filter(s => bySection[s]).forEach(s => {
        lines.push(s);
        bySection[s].forEach(i => lines.push(`- ${i.amount !== '' && i.amount != null ? shopAmountLine(i) + ' ' : ''}${i.name}`));
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
      openModal({ type: 'pick-recipe', date: el.dataset.date, meal: '', planMode: 'recipe', rpPicker: true, rpMulti: false, rpSel: [], rpQuery: '', rpQty: {} }, `[data-action="open-day-picker"][data-date="${escapeAttr(el.dataset.date)}"]`);
      return true;
    case 'set-plan-meal':
      if (state.modal) {
        planCaptureDrafts(state.modal);
        const wasOther = !!state.modal.mealOther;
        state.modal.meal = (state.modal.meal === id && !wasOther) ? '' : id;
        state.modal.mealOther = false; state.modal.mealCustom = '';
        const c = document.getElementById('planMealCustom'); if (c) c.value = '';
        render();
      }
      return true;
    case 'plan-meal-other': {   // eigene Mahlzeitbezeichnung erst auf Wunsch zeigen
      const m = state.modal;
      if (!m) return true;
      planCaptureDrafts(m);
      if (m.mealOther || document.getElementById('planMealCustom')) { m.mealOther = false; m.mealCustom = ''; m.meal = ''; render(); return true; }
      m.mealOther = true; m.meal = '';
      render();
      const c = document.getElementById('planMealCustom'); if (c) focusWithoutScroll(c);
      return true;
    }
    case 'plan-mode': {   // Umschalter «Rezept» / «Ohne Rezept»
      const m = state.modal;
      if (!m || m.type !== 'pick-recipe') return true;
      planCaptureDrafts(m);
      m.planMode = id === 'note' ? 'note' : 'recipe';
      render();
      const b = document.querySelector(`[data-action="plan-mode"][data-id="${m.planMode}"]`); if (b) focusWithoutScroll(b);
      return true;
    }
    case 'plan-commit-recipe': {
      const m = state.modal;
      if (!m || m.type !== 'pick-recipe') return true;
      const rid = (typeof rpSelected === 'function' ? rpSelected(m) : [])[0];
      const r = rid ? state.recipes.find(x => x.id === rid) : null;
      if (!r) { showToast('Wähle zuerst ein Rezept aus, dann kannst du es zum Wochenplan hinzufügen.'); const s = document.getElementById('rpSearch'); if (s) focusWithoutScroll(s); return true; }
      planCaptureDrafts(m);
      const date = m.date;
      const entries = planEntriesFor(date).slice();
      entries.push({ id: uid(), recipeId: r.id, meal: readPlanMeal(), servings: planServingsFromModal(m, r) });
      await savePlanEntries(date, entries);
      closeModal();
      showToast(`„${r.title || 'Rezept'}“ eingetragen`);
      return true;
    }
    case 'assign-mealplan-recipe': {
      const date = el.dataset.date;
      const entries = planEntriesFor(date).slice();
      const pr = state.recipes.find(x => x.id === id);
      entries.push({ id: uid(), recipeId: id, meal: readPlanMeal(), servings: pr && state.modal ? planServingsFromModal(state.modal, pr) : null });
      await savePlanEntries(date, entries);
      const fromDetail = state.modal && state.modal.type === 'plan-recipe';
      closeModal();
      if (fromDetail) showToast('Im Wochenplan eingetragen');
      return true;
    }
    case 'add-plan-note': {   // Eintrag ohne Rezept: «Reste», «Auswaerts» oder eigene Kurznotiz (max. 60 Zeichen)
      const m = state.modal;
      if (!m || m.type !== 'pick-recipe') return true;
      const quick = el.dataset.note;
      const input = document.getElementById('planNoteInput');
      const text = String(quick || (input ? input.value : '')).replace(/\s+/g, ' ').trim().slice(0, PLAN_NOTE_MAX);
      if (!text) { showToast('Bitte eine kurze Notiz eingeben'); if (input) focusWithoutScroll(input); return true; }
      const date = m.date;
      const entries = planEntriesFor(date).slice();
      const meal = readPlanMeal();
      entries.push({ id: uid(), type: 'note', text, ...(meal ? { meal } : {}) });
      await savePlanEntries(date, entries);
      closeModal();
      showToast(`„${text}“ eingetragen`);
      return true;
    }
    case 'open-plan-entry':
      openModal({ type: 'plan-entry', date: el.dataset.date, entryId: id, meal: (planEntriesFor(el.dataset.date).find(x => x.id === id) || {}).meal || '' }, `[data-action="open-plan-entry"][data-id="${escapeAttr(id)}"]`);
      return true;
    case 'save-plan-entry': {
      const m = state.modal;
      const meal = readPlanMeal();
      const target = (document.getElementById('planMoveDay') || {}).value || m.date;
      let entries = planEntriesFor(m.date).map(x => ({ ...x }));
      const entry = entries.find(x => x.id === m.entryId);
      if (!entry) { closeModal(); return true; }
      const prevSource = planEntriesFor(m.date).map(x => ({ ...x })), prevTarget = planEntriesFor(target).map(x => ({ ...x }));
      entry.meal = meal;
      if (!isNoteEntry(entry) && m.rpQty) {   // Menge aus dem gemeinsamen Mengenwahler; nur eine Aenderung wird gespeichert
        const r = state.recipes.find(x => x.id === entry.recipeId);
        const q = Number(m.rpQty[entry.recipeId]);
        if (r && yieldKnown(r) && q > 0 && q !== Number(entry.servings || r.servings)) entry.servings = q;
      }
      if (isNoteEntry(entry)) {
        const ne = document.getElementById('planNoteEdit');
        const t = ne ? ne.value.replace(/\s+/g, ' ').trim().slice(0, PLAN_NOTE_MAX) : entry.text;
        if (t) entry.text = t;
        if (!meal) delete entry.meal;
      }
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
      if (target !== m.date) showToast('Eintrag verschoben', 'success', false, { actionLabel: 'Rückgängig', duration: 8000, onAction: async () => {
        await savePlanEntries(m.date, prevSource); if (target !== m.date) await savePlanEntries(target, prevTarget); if (state.view === 'mealplan') render(); } });
      return true;
    }
    case 'remove-plan-entry': {
      const m = state.modal;
      const prev = planEntriesFor(m.date).map(x => ({ ...x }));
      const gone = prev.find(x => x.id === m.entryId);
      await savePlanEntries(m.date, prev.filter(x => x.id !== m.entryId));
      closeModal();
      const r = gone && !isNoteEntry(gone) ? state.recipes.find(x => x.id === gone.recipeId) : null;
      showToast(`„${gone ? (isNoteEntry(gone) ? gone.text : (r ? r.title : 'Eintrag')) : 'Eintrag'}“ entfernt`, 'success', false, { actionLabel: 'Rückgängig', duration: 8000, onAction: async () => {
        await savePlanEntries(m.date, prev); if (state.view === 'mealplan') render(); } });
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
      const again = document.querySelector(`[data-action="${action}"][data-id="${cssAttr(id)}"][data-delta="${el.dataset.delta}"]:not([disabled])`) || document.querySelector(`[data-action="${action}"][data-id="${cssAttr(id)}"]:not([disabled])`);
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
    case 'cb-from-col': cbColOpen(); return true;
    case 'cb-col-pick': cbColPick(id); return true;
    case 'cb-col-back': cbColBack(); return true;
    case 'cb-col-confirm': cbColConfirm(); return true;
    case 'cb-clear-all': {   // nimmt nur die Auswahl zurueck; Rezepte bleiben unveraendert erhalten
      const cfg = getCookbookConfig();
      cfg.items = [];
      saveCookbookConfig(cfg); render();
      return true;
    }
    case 'cb-page-style': {
      id = pdfNormTpl(id);   // pdf-ui.js: alte IDs A/B/C -> pur/prise-pop
      if (!PDF_TEMPLATES[id]) return true;
      const cfg = getCookbookConfig();
      cfg.pdfTemplate = id;
      saveCookbookConfig(cfg); pdfRememberTemplate(id); render();
      const again = document.querySelector(`[data-action="cb-page-style"][data-id="${cssAttr(id)}"]`); if (again) focusWithoutScroll(again);
      return true;
    }
    case 'cb-pdf-nutrition': {   // v83: Nährwerte im PDF gehören zur Konfiguration des Kochbuchs (eine Stelle für alle Exporte)
      const level = el.dataset.level;
      if (!COOKBOOK_NUTRITION_LEVELS.includes(level)) return true;
      const cfg = getCookbookConfig();
      cfg.pdfNutrition = level;
      saveCookbookConfig(cfg); render();
      const again = document.querySelector(`[data-action="cb-pdf-nutrition"][data-level="${cssAttr(level)}"]`); if (again) focusWithoutScroll(again);
      return true;
    }
    case 'cb-use-sender-name': case 'cb-clear-name': {   // v83: Name auf Titelblatt und Fusszeile = Feld «Name» des Titelblatts
      if (typeof ceFlush === 'function') ceFlush();   // ungespeicherte Eingaben im Cover-Editor zuerst sichern
      const cfg = getCookbookConfig();
      // 0.83.1: «Keinen Namen im PDF zeigen» ist jetzt die Wahl «Nicht drucken»: der Name bleibt gespeichert
      if (action === 'cb-use-sender-name') cfg.author = String(state.senderName || '').trim(); else cfg.printName = 'none';
      saveCookbookConfig(cfg); render();
      showToast(action === 'cb-clear-name' ? 'Name im PDF entfernt' : 'Name fürs PDF eingetragen');
      return true;
    }
    case 'cb-design-part': {   // v85: Teil in Schritt 2 wechseln (Titelblatt | Rezeptseiten); speichert offene Cover-Eingaben zuerst
      cookbookOpenPart(id, el && el.dataset.focus);
      return true;
    }
    case 'cb-step': {
      // Bewegung M2 (motion-cover.js): Doppelklick auf Weiter/Zurueck ueberspringt keinen Schritt; Inhalt wechselt ruhig, Logik sofort
      if (typeof motionStepIgnore === 'function' && motionStepIgnore(el, e)) return true;
      const n = Math.min(3, Math.max(1, parseInt(id, 10) || 1));
      const from = Math.min(3, Math.max(1, parseInt(state.cookbookStep, 10) || 1));
      state.cookbookStep = n;
      // v85: aus Schritt 1 und aus dem Prüfhinweis «Cover bearbeiten» zuerst das Titelblatt; «Gestaltung ändern» behält den letzten Teil
      if (n === 2 && (from === 1 || (el && el.classList && el.classList.contains('cb-hint-go')))) state.cbDesignPart = 'cover';
      const go = () => { render(); window.scrollTo(0, 0); const h = document.getElementById('cbStepTitle'); if (h) focusWithoutScroll(h); };
      if (typeof motionCookbookStep === 'function' && state.view === 'cookbook') motionCookbookStep(from, n, go); else go();
      return true;
    }

    /* ----- Kochbuch-Projekte (Ansicht «Kochbücher») ----- */
    case 'cb-new':
      openModal({ type: 'cb-name', mode: 'new', value: '' }, '[data-action="cb-new"]');
      setTimeout(() => { const i = document.getElementById('cbNameInput'); if (i) { i.setAttribute('placeholder', cookbookDefaultNewName()); i.focus(); } }, 30);
      return true;
    case 'cb-rename': {
      const b = cookbookById(id); if (!b) return true;
      openModal({ type: 'cb-name', mode: 'rename', id, value: b.name }, `[data-action="cb-menu"][data-id="${escapeAttr(id)}"]`);   // v83: Umbenennen steht im Menü der Karte
      setTimeout(() => { const i = document.getElementById('cbNameInput'); if (i) { i.focus(); i.select(); } }, 30);
      return true;
    }
    case 'cb-name-save': {
      const m = state.modal; if (!m || m.type !== 'cb-name') return true;
      const input = document.getElementById('cbNameInput');
      const value = input ? input.value : '';
      if (m.mode === 'rename') {
        if (!cookbookCleanName(value)) { m.value = value; m.error = 'Bitte gib dem Kochbuch einen Namen.'; render(); setTimeout(() => { const i = document.getElementById('cbNameInput'); if (i) i.focus(); }, 30); return true; }
        cookbookRename(m.id, value);
        closeModal();
        showToast('Kochbuch umbenannt');
        return true;
      }
      cookbookCreate(value);   // leerer Name: «Kochbuch 2», «Kochbuch 3» ...; Titel, Untertitel und Name bleiben leer
      state.modal = null; state.cookbookStep = 1; state.view = 'cookbook';
      render();
      return true;
    }
    case 'cb-open':
      if (!cookbookSetActive(id)) return true;
      state.cookbookStep = 1; state.view = 'cookbook';
      render();
      return true;
    case 'cb-menu':   // v83: seltene Aktionen (Umbenennen, Duplizieren, Löschen) im Menü der Karte
      if (!cookbookById(id)) return true;
      openModal({ type: 'cb-menu', id }, `[data-action="cb-menu"][data-id="${escapeAttr(id)}"]`);
      return true;
    case 'cb-duplicate': {
      const copy = cookbookDuplicate(id); if (!copy) return true;
      if (state.modal && state.modal.type === 'cb-menu') closeModal(); else render();
      showToast('Kochbuch dupliziert');
      const again = document.querySelector(`[data-action="cb-open"][data-id="${cssAttr(copy.id)}"]`); if (again) focusWithoutScroll(again);
      return true;
    }
    case 'cb-delete':
      if (cookbookBooks().length <= 1) { showToast('Mindestens ein Kochbuch bleibt bestehen'); return true; }
      openModal({ type: 'cb-delete', id }, `[data-action="cb-menu"][data-id="${escapeAttr(id)}"]`);
      return true;
    case 'cb-delete-confirm':
      if (cookbookDelete(id)) { closeModal(); showToast('Kochbuch gelöscht. Deine Rezepte sind unverändert.'); }
      else showToast('Mindestens ein Kochbuch bleibt bestehen');
      return true;

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
      // Der Entwurf wird erst nach erfolgreichem Speichern gelöscht (siehe ui.js), damit bei einem Speicherfehler nichts verloren geht
      state.editingRecipeSnapshot = null;
      return false;
    case 'do-paste-import':
      // Nach dem Import landet der Entwurf im Formular; Snapshot danach, damit ein Verlassen ohne
      // Speichern nachfragt (der Importtext ist dann schon Nutzerarbeit).
      setTimeout(() => { if (state.view === 'form') { state.formStep = 0; state.editingRecipeSnapshot = '__import__'; } }, 0);
      return false;
    default:
      if (typeof handleLibraryViewAction === 'function' && await handleLibraryViewAction(action, id, el, e)) return true;
      if (typeof handleLibraryPublishAction === 'function' && await handleLibraryPublishAction(action, id, el, e)) return true;
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

/* v85: Segment «Titelblatt | Rezeptseiten» (Reiterliste): Pfeiltasten, Pos1/Ende wechseln den Teil */
document.addEventListener('keydown', (e) => {
  const tab = e.target && e.target.closest ? e.target.closest('.cb-part-tab[role="tab"]') : null;
  if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
  const tabs = Array.from(document.querySelectorAll('.cb-part-tab[role="tab"]'));
  let i = tabs.indexOf(tab);
  if (e.key === 'ArrowLeft') i = (i - 1 + tabs.length) % tabs.length;
  else if (e.key === 'ArrowRight') i = (i + 1) % tabs.length;
  else if (e.key === 'Home') i = 0; else i = tabs.length - 1;
  e.preventDefault();
  cookbookOpenPart(tabs[i].dataset.id);
});
/* v85: «Im Cover bearbeiten» (data-cover-edit, cover-editor.js) oeffnet Schritt 2; der Cover-Editor steht nur im Teil «Titelblatt».
   Laeuft in der Einfangphase, also vor coverOpenEditor. */
document.addEventListener('click', (e) => {
  const b = e.target && e.target.closest && e.target.closest('[data-cover-edit]');
  if (b && !b.disabled) { if (typeof ceFlush === 'function') ceFlush(); state.cbDesignPart = 'cover'; }
}, true);

/* Paket 37: Pfeiltasten in Auswahlgruppen (role="radiogroup", z. B. Titelblatt-Vorlagen, Sortierung, Mahlzeit, Design).
   Pfeile bewegen den Fokus und waehlen; Enter und Leertaste waehlen das fokussierte Element (native Buttons). */
document.addEventListener('keydown', (e) => {
  const k = e.key;
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(k) || e.altKey || e.ctrlKey || e.metaKey) return;
  const radio = e.target && e.target.closest ? e.target.closest('[role="radio"]') : null;
  const group = radio && radio.closest('[role="radiogroup"]');
  if (!group) return;
  const items = Array.from(group.querySelectorAll('[role="radio"]')).filter(x => !x.disabled && x.offsetParent !== null);
  let i = items.indexOf(radio);
  if (i < 0) return;
  if (k === 'ArrowLeft' || k === 'ArrowUp') i = (i - 1 + items.length) % items.length;
  else if (k === 'ArrowRight' || k === 'ArrowDown') i = (i + 1) % items.length;
  else if (k === 'Home') i = 0; else i = items.length - 1;
  e.preventDefault();
  focusWithoutScroll(items[i]);
  items[i].click();   // render() stellt den Fokus am neuen Element wieder her
});

/* ===== v84 Übersicht: Aktionen für Sammlungsauswahl, Verwalten und Auswahlmodus =====
   Schreibzugriffe nur über org.js (Helfer DATEN). Fehlt org.js, greift ein Rückfall auf das alte Modell
   (savora-collections + recipe.collections), damit die Oberfläche nie kaputt wirkt. */
function hvErrText(code) {
  return ({
    empty: 'Gib der Sammlung einen Namen.',
    too_long: `Der Name darf höchstens ${HV_NAME_MAX} Zeichen haben.`,
    duplicate: 'Diese Sammlung gibt es bereits.',
  })[code] || 'Die Sammlung konnte nicht gespeichert werden. Der Gerätespeicher ist vielleicht voll. Versuche es nochmals.';
}
function hvNameKey(s) { return hvCleanName(s).toLocaleLowerCase('de-CH'); }
function hvFindDuplicate(name, exceptId) {
  const k = hvNameKey(name);
  const c = hvCollections().find(x => x.id !== exceptId && hvNameKey(x.name) === k);
  return c ? c.id : null;
}
function hvCreateCollection(data) {
  const name = hvCleanName(data.name);
  if (!name) return { ok: false, error: 'empty' };
  if (name.length > HV_NAME_MAX) return { ok: false, error: 'too_long' };
  if (typeof orgCreateCollection === 'function') return orgCreateCollection({ name, color: data.color || '', icon: data.icon || 'folder' });
  const dup = hvFindDuplicate(name);
  if (dup) return { ok: false, error: 'duplicate', existingId: dup };
  const cols = getCollections();
  const id = 'col_' + Date.now().toString(36);
  cols.push({ id, name }); saveCollections(cols);
  return { ok: true, id };
}
function hvUpdateCollection(id, patch) {
  const p = Object.assign({}, patch);
  if ('name' in p) {
    p.name = hvCleanName(p.name);
    if (!p.name) return { ok: false, error: 'empty' };
    if (p.name.length > HV_NAME_MAX) return { ok: false, error: 'too_long' };
    const dup = hvFindDuplicate(p.name, id);   // reine Gross-/Kleinänderung derselben Sammlung ist erlaubt
    if (dup) return { ok: false, error: 'duplicate', existingId: dup };
  }
  if (typeof orgUpdateCollection === 'function') return orgUpdateCollection(id, p) || { ok: true };
  const cols = getCollections(); const c = cols.find(x => x.id === id);
  if (!c) return { ok: false, error: 'missing' };
  if (p.name) c.name = p.name;
  saveCollections(cols);
  return { ok: true };
}
function hvMoveCollection(id, dir) {
  if (typeof orgMoveCollection === 'function') return orgMoveCollection(id, dir);
  const cols = getCollections(); const i = cols.findIndex(x => x.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= cols.length) return;
  [cols[i], cols[j]] = [cols[j], cols[i]]; saveCollections(cols);
}
function hvDeleteCollection(id) {
  if (typeof orgDeleteCollection === 'function') return orgDeleteCollection(id);
  saveCollections(getCollections().filter(x => x.id !== id));   // Rückfall: Zuordnungen im Rezept bleiben (unsichtbar), nichts gelöscht
  return null;
}
async function hvApply(ids, colId, mode) {
  if (typeof orgApply === 'function') {
    const res = await orgApply(ids, colId, mode);
    if (res && res.ok === false) throw new Error(res.error || 'storage');   // Aufrufer zeigen den Speicherfehler-Text
    return res;
  }
  const changed = [];
  for (const rid of ids) {
    const r = state.recipes.find(x => x.id === rid); if (!r) continue;
    const cur = Array.isArray(r.collections) ? r.collections : [];
    const has = cur.includes(colId);
    if ((mode === 'add') === has) continue;
    changed.push({ id: rid, before: cur.slice() });
    r.collections = mode === 'add' ? cur.concat(colId) : cur.filter(c => c !== colId);
    await dbPut(r);   // updatedAt bewusst unverändert: Einsortieren ist keine Rezeptbearbeitung
  }
  return { hvLegacy: changed };
}
async function hvUndo(token) {
  if (!token) return;
  if (token.hvLegacy) {
    for (const ch of token.hvLegacy) { const r = state.recipes.find(x => x.id === ch.id); if (r) { r.collections = ch.before; await dbPut(r); } }
    return;
  }
  if (typeof orgUndo === 'function') await orgUndo(token);
}
function hvFocus(sel) { requestAnimationFrame(() => { const el = document.querySelector(sel); if (el) focusWithoutScroll(el); }); }
function hvFocusNow(sel) { const el = document.querySelector(sel); if (el) focusWithoutScroll(el); return !!el; }
function hvBindActions(root) { if (root) root.querySelectorAll('[data-action]').forEach(b => b.addEventListener('click', onAction)); }
function hvSelIds() { return Array.from((state.selectMode && state.selectMode.ids) || []).filter(id => state.recipes.some(r => r.id === id)); }

/* Auswahlmodus: Einstieg pusht einen History-Eintrag, damit Geräte-Zurück den Modus beendet */
function hvStartSelect(target) {
  state.selectMode = { ids: new Set(), target: target || null };
  history.pushState(Object.assign(navHistorySnapshot(), { selectMode: true }), '');
  render();
  hvFocusNow('#selModeBtn');
  announceLive(target ? `Auswahl gestartet. Wähle Rezepte für «${hvScopeLabel(target)}».` : 'Auswahl gestartet. Tippe Rezepte an, um sie auszuwählen.');
}
function hvEndSelect() {
  if (!state.selectMode) return;
  if (history.state && history.state.selectMode) { history.back(); return; }   // popstate unten beendet den Modus
  state.selectMode = null;
  render();
  hvFocusNow('#selModeBtn');
}
window.addEventListener('popstate', (e) => {
  if (!state.selectMode || (e.state && e.state.selectMode)) return;
  state.selectMode = null;
  if (state.view !== 'home') return;
  render(true);
  hvFocusNow('#selModeBtn');
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !hvSelecting() || state.modal || e.isComposing) return;
  const t = e.target;
  if (t && t.matches && t.matches('input, textarea, select')) return;   // Escape im Suchfeld gehört dem Feld
  e.preventDefault();
  hvEndSelect();
});
/* Haken setzen ohne Neuaufbau: Karten, Leiste und Zähler werden direkt nachgeführt (Fokus und Scroll bleiben) */
function hvRefreshSelection() {
  const sm = state.selectMode; if (!sm) return;
  document.querySelectorAll('.home-main [data-action="sel-toggle"]').forEach(b => {
    const on = sm.ids.has(b.dataset.id);
    b.setAttribute('aria-checked', String(on));
    const mark = b.querySelector('.sel-mark'); if (mark) mark.classList.toggle('is-on', on);
    const card = b.closest('[data-flip-id]'); if (card) card.classList.toggle('is-picked', on);
  });
  const bar = document.querySelector('.select-bar');
  if (bar) {
    const focusAct = document.activeElement && bar.contains(document.activeElement) ? document.activeElement.dataset.action : null;
    const tmp = document.createElement('div');
    tmp.innerHTML = hvSelectBarHtml(applyAllFilters(state.recipes), hvScope());
    const fresh = tmp.firstElementChild;
    bar.replaceWith(fresh);
    hvBindActions(fresh);
    if (focusAct) { const f = fresh.querySelector(`[data-action="${focusAct}"]`); if (f && !f.disabled) focusWithoutScroll(f); }
  }
}
/* Teilaktualisierung der Listen in Dialogen (Suche, Haken): kein render(), Cursor bleibt */
function hvRefreshPickList() {
  const m = state.modal, box = document.getElementById('colPickList');
  if (!m || m.type !== 'col-pick' || !box) return;
  box.innerHTML = colPickListHtml(m); hvBindActions(box);
}
function hvRefreshBatch(focusCol) {
  const m = state.modal, box = document.getElementById('colBatchWrap');
  if (!m || m.type !== 'col-batch' || !box) return;
  box.innerHTML = colBatchListHtml(m);
  const n = m.checked.size;
  const c = document.getElementById('colBatchCount'); if (c) c.textContent = n ? (n === 1 ? '1 Sammlung gewählt' : `${n} Sammlungen gewählt`) : 'Noch keine Sammlung gewählt';
  const go = document.querySelector('[data-action="col-batch-apply"]'); if (go) go.disabled = !n;
  if (focusCol) { const inp = box.querySelector(`[data-col="${cssAttr(focusCol)}"]`); if (inp) focusWithoutScroll(inp); }
}
document.addEventListener('input', (e) => {
  const t = e.target, m = state.modal;
  if (!t || !m) return;
  if (t.id === 'colPickSearch' && m.type === 'col-pick') { m.query = t.value; if (!e.isComposing) hvRefreshPickList(); }
  else if (t.id === 'colBatchSearch' && m.type === 'col-batch') { m.query = t.value; if (!e.isComposing) hvRefreshBatch(); }
  else if (t.id === 'colName' && m.type === 'col-edit') {
    m.name = t.value;
    const c = document.getElementById('colNameCount'); if (c) c.textContent = hvNameCountHtml(t.value.length);
  } else if (t.id === 'colNewInline' && m.type === 'col-batch') m.newName = t.value;
});
document.addEventListener('change', (e) => {
  const t = e.target, m = state.modal;
  if (!t || !m) return;
  if (t.name === 'colColor' && m.type === 'col-edit') m.color = t.value;
  else if (t.name === 'colIcon' && m.type === 'col-edit') m.icon = t.value;
  else if (t.id === 'colName' && m.type === 'col-edit') {
    // Dublette schon beim Verlassen des Feldes melden (sonst erst beim Absenden)
    const dup = hvCleanName(t.value) ? hvFindDuplicate(t.value, m.mode === 'edit' ? m.id : null) : null;
    if (dup && !m.existingId) { m.error = hvErrText('duplicate'); m.existingId = dup; render(); }
    else if (!dup && m.existingId) { m.error = ''; m.existingId = null; render(); }
  } else if (t.classList && t.classList.contains('col-batch-input') && m.type === 'col-batch') {
    if (t.checked) m.checked.add(t.dataset.col); else m.checked.delete(t.dataset.col);
    hvRefreshBatch(t.dataset.col);
  }
});
document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (e.key !== 'Enter' || !t || e.isComposing) return;
  if (t.id === 'colPickSearch' || t.id === 'colBatchSearch') { e.preventDefault(); return; }   // Enter sendet nichts ab
  if (t.id === 'colName') { e.preventDefault(); const b = document.querySelector('[data-action="col-save"]'); if (b) b.click(); }
  else if (t.id === 'colNewInline') { e.preventDefault(); const b = document.querySelector('[data-action="col-batch-create"]'); if (b) b.click(); }
});
/* Datenänderungen (auch aus dem Abgleich) zeichnen die Übersicht neu, aber nie mitten in einem offenen Dialog */
(function hvSubscribe() {
  const sub = () => {
    if (typeof orgOnChange !== 'function') return;
    let queued = false;
    orgOnChange(() => {
      if (queued) return; queued = true;
      requestAnimationFrame(() => { queued = false; if (state.view === 'home' && !state.modal && !hvSelecting()) render(); });
    });
  };
  if (document.readyState === 'complete') setTimeout(sub, 0); else window.addEventListener('load', sub);
})();

function hvColEditModal(c, from) {
  return { type: 'col-edit', mode: 'edit', id: c.id, name: c.name, startName: c.name, color: c.color || '', icon: c.icon || 'folder', from: from || 'manage' };
}
function hvPickAnchor() {
  if (!(window.innerWidth >= 900)) return null;
  const b = document.getElementById('colPickBtn'); if (!b) return null;
  const r = b.getBoundingClientRect(), w = Math.min(360, window.innerWidth - 32);
  const x = Math.max(16, Math.min(r.left, window.innerWidth - w - 16)), y = r.bottom + 8, h = window.innerHeight - y - 16;
  return h >= 280 ? { x, y, h } : null;   // passt sie unten nicht hin: mittig wie ab 640 px
}

async function hvHandleAction(action, id, el, e) {
  const m = state.modal;
  switch (action) {
    /* ----- Sammlungsauswahl ----- */
    case 'open-col-pick':
      openModal({ type: 'col-pick', query: '', anchor: hvPickAnchor() }, '#colPickBtn');
      return true;
    case 'set-col-scope': {
      state.favOnly = false;
      state.activeCollection = id || 'all';
      if (m) closeModal();   // Fokus kehrt im popstate-Handler zum Auslöser zurück
      else { motionFlipRecipes(render); hvFocusNow('#colPickBtn'); }
      return true;
    }
    case 'col-pick-clear':
      if (m) m.query = '';
      { const s = document.getElementById('colPickSearch'); if (s) { s.value = ''; focusWithoutScroll(s); } }
      hvRefreshPickList();
      return true;

    /* ----- Neue Sammlung / bearbeiten ----- */
    case 'col-new': {
      const from = el.dataset.from || (m && m.type === 'col-manage' ? 'manage' : 'pick');
      const next = { type: 'col-edit', mode: 'new', from, name: hvCleanName(el.dataset.name || '').slice(0, HV_NAME_MAX), color: '', icon: 'folder' };
      if (m) replaceModal(next); else openModal(next);
      hvFocusNow('#colName');
      return true;
    }
    case 'col-manage':
      replaceModal({ type: 'col-manage' });
      return true;
    case 'col-edit': {
      const c = hvCollection(id); if (!c) return true;
      replaceModal(hvColEditModal(c));
      hvFocusNow('#colName');
      return true;
    }
    case 'col-edit-cancel':
      if (m && (m.mode === 'edit' || m.from === 'manage')) {
        const back = m.id;
        replaceModal({ type: 'col-manage' });
        if (!(back && hvFocusNow(`[data-action="col-edit"][data-id="${cssAttr(back)}"]`))) hvFocusNow('.col-manage-sheet, .rp-sheet--colmanage');
      } else closeModal();
      return true;
    case 'col-save': {
      if (!m || m.type !== 'col-edit') return true;
      const inp = document.getElementById('colName');
      const name = inp ? inp.value : (m.name || '');
      m.name = name;
      let res;
      try {
        res = m.mode === 'edit'
          ? hvUpdateCollection(m.id, { name, color: m.color || '', icon: hvIconKey(m.icon) })
          : hvCreateCollection({ name, color: m.color || '', icon: hvIconKey(m.icon) });
      } catch (err) { res = { ok: false, error: 'storage' }; }
      if (!res || !res.ok) {
        m.error = hvErrText(res && res.error); m.existingId = (res && res.error === 'duplicate' && res.existingId) || null;
        render(); hvFocusNow('#colName');
        return true;
      }
      m.error = ''; m.existingId = null;
      const clean = hvCleanName(name);
      if (m.mode === 'edit') {
        showToast(hvCleanName(m.startName) === clean ? 'Sammlung gespeichert.' : 'Sammlung umbenannt.');
        const back = m.id;
        replaceModal({ type: 'col-manage' });
        hvFocusNow(`[data-action="col-edit"][data-id="${cssAttr(back)}"]`);
        return true;
      }
      showToast(`Sammlung «${clean}» erstellt.`);
      if (m.from === 'manage') {
        replaceModal({ type: 'col-manage' });
        hvFocusNow(`[data-action="col-edit"][data-id="${cssAttr(res.id)}"]`);
      } else {
        state.favOnly = false; state.activeCollection = res.id;
        closeModal();
      }
      return true;
    }
    case 'col-use-existing':
      state.favOnly = false; state.activeCollection = id;
      closeModal();
      return true;

    /* ----- Verwalten: Reihenfolge, Löschen ----- */
    case 'col-move': {
      const dir = Number(el.dataset.dir) < 0 ? -1 : 1;
      hvMoveCollection(id, dir);
      render();
      const cols = hvCollections(), pos = cols.findIndex(c => c.id === id);
      const same = document.querySelector(`[data-action="col-move"][data-id="${cssAttr(id)}"][data-dir="${dir}"]`);
      const other = document.querySelector(`[data-action="col-move"][data-id="${cssAttr(id)}"][data-dir="${-dir}"]`);
      if (same && !same.disabled) focusWithoutScroll(same); else if (other) focusWithoutScroll(other);
      if (pos >= 0) announceLive(`${cols[pos].name} ist jetzt auf Platz ${pos + 1} von ${cols.length}.`);
      return true;
    }
    case 'col-delete':
      if (!hvCollection(id)) return true;
      replaceModal({ type: 'col-delete', id, back: m && m.type === 'col-edit' ? Object.assign({}, m) : null });
      hvFocusNow('[data-action="col-delete-cancel"]');
      return true;
    case 'col-delete-cancel':
      if (m && m.back) { replaceModal(m.back); hvFocusNow('[data-action="col-delete"]'); }
      else { replaceModal({ type: 'col-manage' }); hvFocusNow(`[data-action="col-edit"][data-id="${cssAttr(id)}"]`); }
      return true;
    case 'col-delete-confirm': {
      const c = hvCollection(id); if (!c) return true;
      const before = hvCollections(), idx = before.findIndex(x => x.id === id);
      const wasActive = state.activeCollection === id;
      let token = null;
      try { token = hvDeleteCollection(id); } catch (err) { showToast(hvErrText('storage'), 'error'); return true; }
      if (wasActive) state.activeCollection = 'all';
      replaceModal({ type: 'col-manage' });
      const rest = hvCollections();
      const next = rest[Math.min(idx, rest.length - 1)];
      if (!(next && hvFocusNow(`[data-action="col-edit"][data-id="${cssAttr(next.id)}"]`))) hvFocusNow('[data-action="col-new"]');
      const msg = wasActive ? 'Sammlung gelöscht. Du siehst jetzt alle Rezepte.' : `Sammlung «${c.name}» gelöscht.`;
      if (token) {
        showUndoToast(msg, async () => {
          await hvUndo(token);
          if (wasActive && hvCollection(id)) state.activeCollection = id;
          render();
          showToast('Sammlung wiederhergestellt.');
        }, () => {});
      } else showToast(msg);
      return true;
    }

    /* ----- Batch «Zu Sammlung hinzufügen» ----- */
    case 'col-batch-new':
      if (!m) return true;
      m.newOpen = true; render(); hvFocusNow('#colNewInline');
      return true;
    case 'col-batch-create': {
      if (!m || m.type !== 'col-batch') return true;
      const inp = document.getElementById('colNewInline');
      const name = inp ? inp.value : (m.newName || '');
      m.newName = name;
      let res;
      try { res = hvCreateCollection({ name }); } catch (err) { res = { ok: false, error: 'storage' }; }
      if (!res || !res.ok) {
        m.error = hvErrText(res && res.error); m.existingId = (res && res.error === 'duplicate' && res.existingId) || null;
        render(); hvFocusNow('#colNewInline');
        return true;
      }
      m.checked.add(res.id); m.newOpen = false; m.newName = ''; m.error = ''; m.existingId = null; m.query = '';
      render();
      hvFocusNow(`.col-batch-input[data-col="${cssAttr(res.id)}"]`);
      announceLive(`Sammlung «${hvCleanName(name)}» erstellt und gewählt.`);
      return true;
    }
    case 'col-batch-use':
      if (!m || m.type !== 'col-batch') return true;
      m.checked.add(id); m.newOpen = false; m.newName = ''; m.error = ''; m.existingId = null; m.query = '';
      render();
      hvFocusNow(`.col-batch-input[data-col="${cssAttr(id)}"]`);
      return true;
    case 'col-batch-apply': {
      if (!m || m.type !== 'col-batch' || !m.checked.size) return true;
      const ids = hvSelIds();
      const cols = Array.from(m.checked).map(hvCollection).filter(Boolean);
      const tokens = [], touched = [], newRecipes = new Set(); let added = 0;
      try {
        for (const c of cols) {
          const inSet = hvRecipeIdsIn(c.id);
          const missing = ids.filter(rid => !inSet.has(rid));
          if (!missing.length) continue;
          tokens.push(await hvApply(missing, c.id, 'add'));
          added += missing.length; touched.push(c); missing.forEach(rid => newRecipes.add(rid));
        }
      } catch (err) {
        for (const t of tokens.slice().reverse()) { try { await hvUndo(t); } catch (e) {} }   // nichts Halbes stehen lassen
        showToast(hvErrText('storage'), 'error'); return true;
      }
      closeModal();   // Auswahlmodus bleibt mit derselben Auswahl offen
      if (!tokens.length) { showToast(cols.length === 1 ? `Alle ausgewählten Rezepte waren schon in «${cols[0].name}».` : 'Alle ausgewählten Rezepte waren schon in diesen Sammlungen.'); return true; }
      const msg = touched.length === 1 ? `${hvRecipeWord(added)} zu «${touched[0].name}» hinzugefügt.` : `${hvRecipeWord(newRecipes.size)} zu ${touched.length} Sammlungen hinzugefügt.`;
      showUndoToast(msg, async () => { for (const t of tokens.reverse()) await hvUndo(t); if (state.view === 'home' && !state.modal) render(); showToast('Rückgängig gemacht.'); }, () => {});
      return true;
    }

    /* ----- Auswahlmodus ----- */
    case 'sel-start':
      if (!hvSelecting()) hvStartSelect(null);
      return true;
    case 'sel-start-add':
      if (!hvCollection(id)) return true;
      state.favOnly = false; state.activeCollection = 'all';
      if (hvSelecting()) { state.selectMode.target = id; render(); hvFocusNow('#selModeBtn'); }
      else hvStartSelect(id);
      return true;
    case 'sel-end':
      hvEndSelect();
      return true;
    case 'sel-toggle': {
      if (!state.selectMode) return true;
      const ids = state.selectMode.ids;
      if (ids.has(id)) ids.delete(id); else ids.add(id);
      hvRefreshSelection();
      return true;
    }
    case 'sel-all': {
      if (!state.selectMode) return true;
      const list = applyAllFilters(state.recipes), ids = state.selectMode.ids;
      if (list.length && list.every(r => ids.has(r.id))) list.forEach(r => ids.delete(r.id));   // «Auswahl aufheben»: nur sichtbare Treffer, Ausgeblendete bleiben gewählt
      else list.forEach(r => ids.add(r.id));                             // nur aktuelle Such-/Filtertreffer
      hvRefreshSelection();
      announceLive((document.getElementById('selStatus') || {}).textContent || '');
      return true;
    }
    case 'sel-add':
      if (!hvSelIds().length) return true;
      openModal({ type: 'col-batch', checked: new Set(), query: '', newOpen: false }, '[data-action="sel-add"]');
      return true;
    case 'sel-add-target': {
      const c = hvCollection(id), ids = hvSelIds();
      if (!c || !ids.length) return true;
      const inSet = hvRecipeIdsIn(c.id), missing = ids.filter(rid => !inSet.has(rid));
      let token = null;
      try { if (missing.length) token = await hvApply(missing, c.id, 'add'); } catch (err) { showToast(hvErrText('storage'), 'error'); return true; }
      state.favOnly = false; state.activeCollection = c.id;
      hvEndSelect();
      if (!token) { showToast(`Alle ausgewählten Rezepte waren schon in «${c.name}».`); return true; }
      showUndoToast(`${hvRecipeWord(missing.length)} zu «${c.name}» hinzugefügt.`, async () => { await hvUndo(token); if (state.view === 'home' && !state.modal) motionFlipRecipes(render); showToast('Rückgängig gemacht.'); }, () => {});
      return true;
    }
    case 'sel-remove': {
      const c = hvCollection(id); if (!c) return true;
      const inSet = hvRecipeIdsIn(c.id), ids = hvSelIds().filter(rid => inSet.has(rid));
      if (!ids.length) { showToast(`Keines der ausgewählten Rezepte ist in «${c.name}».`); return true; }
      let token;
      try { token = await hvApply(ids, c.id, 'remove'); } catch (err) { showToast(hvErrText('storage'), 'error'); return true; }
      state.selectMode.ids.clear();
      motionFlipRecipes(render);
      hvFocusNow('#selModeBtn');
      showUndoToast(`${hvRecipeWord(ids.length)} aus «${c.name}» entfernt. Die Rezepte bleiben erhalten.`, async () => { await hvUndo(token); if (state.view === 'home' && !state.modal) motionFlipRecipes(render); showToast('Rückgängig gemacht.'); }, () => {});
      return true;
    }
  }
  return false;
}
