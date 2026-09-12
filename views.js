/* ---------- Views ---------- */
function viewFor(view) {
  switch (view) {
    case 'home': return homeView();
    case 'detail': return detailView();
    case 'form': return formView();
    case 'cookmode': return cookModeView();
    case 'settings': return settingsView();
    case 'settings-display': return settingsDisplayView();
    case 'settings-units': return settingsUnitsView();
    case 'settings-profile': return settingsProfileView();
    case 'settings-backup': return settingsBackupView();
    case 'settings-help': return settingsHelpView();
    case 'settings-privacy': return settingsPrivacyView();
    case 'settings-terms': return settingsTermsView();
    case 'settings-sources': return settingsSourcesView();
    case 'settings-about': return settingsAboutView();
    case 'paste-import': return pasteImportView();
    case 'shopping': return shoppingView();
    case 'mealplan': return mealplanView();
    case 'unitconverter': return unitConverterView();
    default: return homeView();
  }
}

const TAB_VIEWS = ['home', 'mealplan', 'shopping', 'settings'];

// "Mehr" bleibt in der Tab-Leiste aktiv markiert, solange man sich in einer Settings-Detailseite
// oder im davon erreichten Masseinheiten-Rechner befindet (Settings/Mehr-Redesign, Teil A).
function isMoreSectionView(view) {
  return view === 'settings' || view.indexOf('settings-') === 0 || view === 'unitconverter';
}

function bottomNav() {
  const tabs = [
    { view: 'home', icon: ICONS.book, label: 'Rezepte' },
    { view: 'mealplan', icon: ICONS.calendar, label: 'Wochenplan' },
    { view: 'shopping', icon: ICONS.cart, label: 'Einkauf' },
    { view: 'settings', icon: ICONS.settings, label: 'Mehr' },
  ];
  return `<nav class="bottom-nav" aria-label="Hauptnavigation">
    ${tabs.map(t => { const active = t.view === 'settings' ? isMoreSectionView(state.view) : state.view === t.view; return `<button data-action="nav-tab" data-view="${t.view}" class="${active ? 'active' : ''}" ${active ? 'aria-current="page"' : ''}>
      <span aria-hidden="true">${t.icon}</span><span>${t.label}</span>
    </button>`; }).join('')}
  </nav>`;
}

function topbar(title, opts = {}) {
  const isBrand = !opts.back && (title === 'Savora' || !title);
  const nameClass = isBrand ? 'brand-name' : 'brand-name brand-name--plain';
  const backBtn = opts.back ? `<button class="icon-btn" data-action="back" aria-label="Zurück">${ICONS.back}</button>` : `<div class="brand">
      <img src="logo-mark.png" alt="Savora" class="brand-logo">
      <span class="${nameClass}">${escapeHtml(title || 'Savora')}</span>
    </div>`;
  return `<div class="topbar">
    <div class="topbar-left">${backBtn}${opts.back ? `<span class="topbar-title">${escapeHtml(title)}</span>` : ''}</div>
    <div class="topbar-actions">${opts.actions || ''}</div>
  </div>`;
}

/* Zentrale Filterlogik (Punkt 107-109): Suchtext/Favoriten/freier Tag wie bisher, zusaetzlich
   die drei neuen Dimensionen — innerhalb einer Dimension ODER, zwischen Dimensionen UND. Arbeitet
   ausschliesslich auf bereits geladenen state.recipes, keine Zusatzabfragen (Punkt 119). */
function timeBucketsFor(minutes) {
  if (!minutes || minutes <= 0) return [];
  return TIME_BUCKET_OPTIONS.filter((b) => minutes <= b.max).map((b) => b.id);
}

function applyAllFilters(recipes) {
  let list = recipes;
  if (state.query.trim()) {
    const q = state.query.trim().toLowerCase();
    list = list.filter(r =>
      r.title.toLowerCase().includes(q) ||
      (r.ingredients || []).some(i => (i.name || '').toLowerCase().includes(q)) ||
      (r.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }
  if (state.activeTag) list = list.filter(r => (r.tags || []).includes(state.activeTag));
  if (state.favOnly) list = list.filter(r => r.favorite);
  const { dietary, category, time } = state.activeFilters;
  if (dietary.size) list = list.filter(r => (r.diet || []).some(d => dietary.has(d)));
  if (category.size) list = list.filter(r => (r.categoryTags || []).some(c => category.has(c)));
  if (time.size) list = list.filter(r => timeBucketsFor(r.timeMinutes).some(b => time.has(b)));
  return list;
}

function activeStructuredFilterCount() {
  const { dietary, category, time } = state.activeFilters;
  return dietary.size + category.size + time.size;
}

function homeView() {
  const tags = Array.from(new Set(state.recipes.flatMap(r => r.tags || []).concat(state.recipes.length ? [] : [])));
  const shownTags = tags.length ? tags : [];
  const list = applyAllFilters(state.recipes);
  const filterCount = activeStructuredFilterCount();
  const isFiltered = !!(state.query.trim() || state.activeTag || state.favOnly || filterCount);

  let grid;
  if (!list.length && state.recipes.length && (isFiltered)) {
    grid = emptyFilterState();
  } else if (!list.length) {
    grid = emptyState();
  } else if (!isFiltered && list.length > 1) {
    const [featured, ...rest] = list;
    grid = `<div class="recipe-grid">${recipeCard(featured, { featured: true })}${rest.map(r => recipeCard(r)).join('')}</div>`;
  } else {
    grid = `<div class="recipe-grid">${list.map(r => recipeCard(r)).join('')}</div>`;
  }

  const activeFilterChips = [];
  state.activeFilters.dietary.forEach(id => activeFilterChips.push({ dim: 'dietary', id, label: categoryLabelFor(id) }));
  state.activeFilters.category.forEach(id => activeFilterChips.push({ dim: 'category', id, label: categoryLabelFor(id) }));
  state.activeFilters.time.forEach(id => activeFilterChips.push({ dim: 'time', id, label: TIME_BUCKET_OPTIONS.find(t => t.id === id)?.label || id }));

  return `
    ${topbar('Savora')}
    <main class="has-tabbar">
      <div class="search-row">
        <div class="search-input-wrap">
          ${ICONS.search}
          <label for="searchInput" class="sr-only">Rezepte durchsuchen</label>
          <input class="search-input" id="searchInput" type="text" placeholder="Rezepte, Zutaten, Tags durchsuchen…" value="${escapeHtml(state.query)}" aria-label="Rezepte, Zutaten, Tags durchsuchen">
        </div>
        <button class="icon-btn icon-btn-outlined has-badge ${filterCount ? 'active' : ''}" data-action="open-filter-sheet" aria-label="Filter${filterCount ? ' (' + filterCount + ' aktiv)' : ''}">${ICONS.filter}${filterCount ? `<span class="filter-count-badge">${filterCount}</span>` : ''}</button>
        <button class="icon-btn icon-btn-outlined ${state.favOnly ? 'active' : ''}" data-action="toggle-fav-filter" aria-label="Nur Favoriten">${state.favOnly ? ICONS.heart : ICONS.heartOutline}</button>
      </div>
      ${(activeFilterChips.length || state.favOnly) ? `<div class="tag-row active-filter-row">
        ${state.favOnly ? `<button class="tag-chip active" data-action="toggle-fav-filter">${ICONS.heart} Favoriten ${ICONS.x}</button>` : ''}
        ${activeFilterChips.map(c => `<button class="tag-chip active" data-action="remove-active-filter" data-dim="${c.dim}" data-id="${escapeHtml(c.id)}">${escapeHtml(c.label)} ${ICONS.x}</button>`).join('')}
        <button class="tag-chip" data-action="clear-all-filters">Alle löschen</button>
      </div>` : ''}
      ${shownTags.length ? `<div class="tag-row">
        <button class="tag-chip ${!state.activeTag ? 'active' : ''}" data-action="filter-tag" data-tag="">Alle</button>
        ${shownTags.map(t => `<button class="tag-chip ${state.activeTag === t ? 'active' : ''}" data-action="filter-tag" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('')}
      </div>` : ''}
      ${grid}
    </main>
    <button class="fab" data-action="open-add-menu" aria-label="Rezept hinzufügen">${ICONS.plus}</button>
    ${bottomNav()}
    ${filterSheetModal()}
    ${addMenuModal()}
  `;
}

// Punkt 12/13: Textimport ist keine Einstellung, sondern gehoert in den Erstellungs-Fluss.
// Die FAB oeffnet deshalb dieses kleine Auswahlmenu statt direkt ein leeres Rezept zu erstellen.
function addMenuModal() {
  if (!state.modal || state.modal.type !== 'add-menu') return '';
  return `<div class="modal-backdrop" data-action="close-modal">
    <div class="modal-sheet add-menu-sheet" role="dialog" aria-modal="true" aria-labelledby="add-menu-title" tabindex="-1" onclick="event.stopPropagation()">
      <h3 class="modal-title" id="add-menu-title">Rezept hinzufügen</h3>
      <div class="add-menu-options">
        <button type="button" class="add-menu-option" data-action="new-recipe">
          <span class="add-menu-option-icon">${ICONS.edit}</span>
          <span class="add-menu-option-text">
            <strong>Rezept erstellen</strong>
            <span>Leeres Rezept von Hand eintragen</span>
          </span>
        </button>
        <button type="button" class="add-menu-option" data-action="open-paste-import">
          <span class="add-menu-option-icon">${ICONS.sparkle}</span>
          <span class="add-menu-option-text">
            <strong>Aus Text importieren</strong>
            <span>Bildunterschrift, Nachricht oder kopierter Text</span>
          </span>
        </button>
      </div>
    </div>
  </div>`;
}

function emptyFilterState() {
  return `<div class="empty-state">
    ${ICONS.filter}
    <h2>Keine Rezepte passen zu diesen Filtern</h2>
    <p>Versuch es mit weniger Filtern oder einer anderen Kombination.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
      <button class="ghost-btn" data-action="open-filter-sheet">${ICONS.filter} Filter ändern</button>
      <button class="primary-btn" data-action="clear-all-filters">Alle Filter löschen</button>
    </div>
  </div>`;
}

/* ---------- Filter-Sheet (Punkt 104-107, 118) ---------- */
function filterCheckboxGroup(title, groupId, options, activeSet, getId, getLabel) {
  return `<div class="filter-group">
    <h3 class="filter-group-title" id="filter-group-${groupId}">${title}</h3>
    <div class="filter-checkbox-row" role="group" aria-labelledby="filter-group-${groupId}">
      ${options.map(o => {
        const id = getId(o), label = getLabel(o);
        const active = activeSet.has(id);
        return `<button type="button" class="filter-checkbox ${active ? 'active' : ''}" data-action="toggle-filter" data-dim="${groupId}" data-id="${escapeHtml(id)}" aria-pressed="${active}">
          <span class="filter-checkbox-box" aria-hidden="true">${active ? ICONS.check : ''}</span>${escapeHtml(label)}
        </button>`;
      }).join('')}
    </div>
  </div>`;
}

function filterSheetModal() {
  if (!state.modal || state.modal.type !== 'filter-sheet') return '';
  const { dietary, category, time } = state.activeFilters;
  const resultCount = applyAllFilters(state.recipes).length;
  const dietaryOptions = DIET_OPTIONS.filter(d => d.tone === 'diet' || d.tone === 'protein').map(d => ({ id: d.key, label: d.label }));
  return `<div class="modal-backdrop" data-action="close-modal">
    <div class="modal-sheet filter-sheet" role="dialog" aria-modal="true" aria-labelledby="filter-sheet-title" tabindex="-1" onclick="event.stopPropagation()">
      <h3 class="modal-title" id="filter-sheet-title">Filter</h3>
      ${filterCheckboxGroup('Ernährung', 'dietary', dietaryOptions, dietary, o => o.id, o => o.label)}
      ${filterCheckboxGroup('Mahlzeit', 'category', MEAL_TYPE_OPTIONS, category, o => o.id, o => o.label)}
      ${filterCheckboxGroup('Gericht', 'category', DISH_TYPE_OPTIONS, category, o => o.id, o => o.label)}
      ${filterCheckboxGroup('Zeit', 'time', TIME_BUCKET_OPTIONS, time, o => o.id, o => o.label)}
      <div class="form-actions">
        <button class="ghost-btn" data-action="clear-all-filters">Zurücksetzen</button>
        <button class="primary-btn" data-action="close-modal">${resultCount} Rezept${resultCount === 1 ? '' : 'e'} anzeigen</button>
      </div>
    </div>
  </div>`;
}

function emptyState() {
  const hasAny = state.recipes.length > 0;
  return `<div class="empty-state">
    ${ICONS.book}
    <h2>${hasAny ? 'Keine Treffer' : 'Dein Kochbuch ist noch leer'}</h2>
    <p>${hasAny ? 'Versuch eine andere Suche oder wähle kein Tag aus.' : 'Trag dein erstes Rezept ein und leg damit dein persönliches Kochbuch an.'}</p>
    ${!hasAny ? `<button class="primary-btn" data-action="new-recipe">${ICONS.plus} Erstes Rezept eintragen</button>` : ''}
  </div>`;
}

function recipeCard(r, opts = {}) {
  const featured = !!opts.featured;
  const img = r.image
    ? `<img class="recipe-card-img" src="${r.image}" alt="">`
    : r.imageId
      ? `<div class="recipe-card-img placeholder" data-lazy-img="thumb" data-image-id="${r.imageId}" data-img-class="recipe-card-img">${ICONS.chef}</div>`
      : `<div class="recipe-card-img placeholder">${ICONS.chef}</div>`;
  // Echtes <button> fuers Oeffnen statt div[role=button] — der Favoriten-Button steht
  // daneben (Geschwister-Element), nicht mehr darin verschachtelt: ein Button darf laut
  // HTML-Spezifikation kein weiteres interaktives Element enthalten (Screenreader/Tastatur-
  // Verhalten sonst inkonsistent).
  return `<article class="recipe-card ${featured ? 'recipe-card--featured' : ''}">
    <button type="button" class="recipe-card-main" data-action="open-recipe" data-id="${r.id}" aria-label="${escapeHtml(r.title || 'Ohne Titel')} öffnen">
      ${img}
      <div class="recipe-card-body">
        ${featured ? `<div class="recipe-card-eyebrow">Zuletzt bearbeitet</div>` : ''}
        <div class="recipe-card-title">${escapeHtml(r.title || 'Ohne Titel')}</div>
        <div class="recipe-card-meta">
          ${r.timeMinutes ? `<span>${r.timeMinutes} Min.</span>` : ''}
          ${r.servings ? `<span>${r.servings} Port.</span>` : ''}
        </div>
      </div>
    </button>
    <button class="fav-btn${r.favorite ? ' fav-btn--active' : ''}" data-action="toggle-fav" data-id="${r.id}" aria-label="${r.favorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}" aria-pressed="${r.favorite ? 'true' : 'false'}">${r.favorite ? ICONS.heart : ICONS.heartOutline}</button>
  </article>`;
}

function detailView() {
  const r = state.recipes.find(x => x.id === state.activeRecipeId);
  if (!r) { state.view = 'home'; return homeView(); }
  const servings = state.servingsOverride[r.id] || r.lastServings || r.servings || 1;
  const factor = servings / (r.servings || 1);
  const img = r.image
    ? `<img class="detail-hero-img" src="${r.image}" alt="${escapeHtml(r.title || '')}" style="view-transition-name: recipe-hero-img;">`
    : r.imageId
      ? `<div class="detail-hero-img placeholder" data-lazy-img="full" data-image-id="${r.imageId}" data-img-class="detail-hero-img" data-img-alt="${escapeHtml(r.title || '')}" style="view-transition-name: recipe-hero-img;">${ICONS.chef}</div>`
      : `<div class="detail-hero-img placeholder" style="view-transition-name: recipe-hero-img;">${ICONS.chef}</div>`;

  return `
    ${topbar(r.title, { back: true, actions: `
      <button class="icon-btn" data-action="edit-recipe" data-id="${r.id}" aria-label="Rezept bearbeiten">${ICONS.edit}</button>
      <button class="icon-btn" data-action="export-pdf" data-id="${r.id}" aria-label="Als PDF exportieren">${ICONS.pdf}</button>
      <button class="icon-btn" data-action="confirm-delete" data-id="${r.id}" aria-label="Rezept löschen">${ICONS.trash}</button>
    ` })}
    <main class="has-tabbar">
      <div class="detail-hero">
        ${img}
        <div class="detail-hero-overlay">
          <h1 class="detail-title">${escapeHtml(r.title || 'Ohne Titel')}</h1>
          <div class="detail-meta">
            ${r.timeMinutes ? `<span>${ICONS.clock}${r.timeMinutes} Min.</span>` : ''}
            <span>${ICONS.serving}${servings} Portionen</span>
            ${r.difficulty ? `<span>${ICONS.chef}${escapeHtml(r.difficulty)}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="detail-actions">
        <button class="primary-btn" data-action="start-cook" data-id="${r.id}">${ICONS.play} Kochmodus starten</button>
        <button class="detail-icon-action" data-action="add-to-shopping" data-id="${r.id}" aria-label="Zur Einkaufsliste" title="Zur Einkaufsliste">${ICONS.cart}</button>
        <button class="detail-icon-action" data-action="share-recipe" data-id="${r.id}" aria-label="Rezept teilen" title="Rezept teilen">${ICONS.share}</button>
      </div>
      ${r.sharedBy ? `<div class="source-line">${ICONS.sparkle} Geteilt von ${escapeHtml(r.sharedBy)}</div>` : r.source ? `<div class="source-line">${ICONS.link} Importiert von <a href="${escapeHtml(r.source)}" target="_blank" rel="noopener">${escapeHtml(domainFromUrl(r.source))}</a></div>` : `<div class="source-line">${ICONS.book} Aus deinem eigenen Kochbuch</div>`}
      ${(r.diet || []).length ? (() => {
        const badge = (dk) => { const d = DIET_OPTIONS.find(o => o.key === dk); return d ? `<span class="diet-badge tone-${d.tone}">${ICONS[d.icon]}${d.label}</span>` : ''; };
        const dietBadges = r.diet.filter(dk => DIET_OPTIONS.find(o => o.key === dk)?.tone === 'diet' && !(dk === 'vegetarisch' && r.diet.includes('vegan')));
        const proteinBadges = r.diet.filter(dk => DIET_OPTIONS.find(o => o.key === dk)?.tone === 'protein');
        const freeBadges = r.diet.filter(dk => DIET_OPTIONS.find(o => o.key === dk)?.tone === 'free');
        return `<div class="diet-badge-row">
          ${dietBadges.map(badge).join('')}${proteinBadges.map(badge).join('')}
          ${(dietBadges.length || proteinBadges.length) && freeBadges.length ? '<span class="diet-badge-divider" aria-hidden="true"></span>' : ''}
          ${freeBadges.map(badge).join('')}
        </div>`;
      })() : ''}
      ${(r.tags || []).length ? `<div class="detail-tags">${r.tags.map(t => `<span class="tag-chip">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
      <div class="detail-columns">
        <div>
          <h2 class="section-heading">Zutaten</h2>
          <div class="servings-control">
            <button data-action="serv-dec" data-id="${r.id}" aria-label="Weniger Portionen">–</button>
            <span>${servings} Portionen</span>
            <button data-action="serv-inc" data-id="${r.id}" aria-label="Mehr Portionen">+</button>
          </div>
          <ul class="ingredient-list">
            ${(r.ingredients || []).map(i => `<li>
              <span class="ingredient-amount">${(() => { const pa = parseAmount(i.amount); return pa !== null ? fmtAmount(pa * factor) + (i.unit ? ' ' + escapeHtml(i.unit) : '') : ''; })()}</span>
              <span class="ingredient-name">${escapeHtml(i.name)}</span>
            </li>`).join('')}
          </ul>
        </div>
        <div>
          <h2 class="section-heading">Zubereitung</h2>
          <ol class="step-list">
            ${(r.steps || []).map((s, idx) => `<li class="step-item">
              <span class="step-num">${idx + 1}</span>
              <span class="step-text">${escapeHtml(s.text)}</span>
            </li>`).join('')}
          </ol>
          ${r.notes ? `<h2 class="section-heading" style="margin-top:24px;">Notizen</h2><div class="notes-box">${escapeHtml(r.notes)}</div>` : ''}
        </div>
      </div>
      ${nutritionCardSection(r.id)}
    </main>
    ${bottomNav()}
    ${state.modal && state.modal.type === 'delete' ? deleteModal(r) : ''}
    ${nutritionModal(r)}
    ${nutritionDetailModal(r, state._nutritionDetailResult)}
    ${pdfExportModal()}
  `;
}

function deleteModal(r) {
  return `<div class="modal-backdrop" data-action="close-modal">
    <div class="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="delete-modal-title" tabindex="-1" onclick="event.stopPropagation()">
      <h3 class="modal-title" id="delete-modal-title">Rezept löschen?</h3>
      <p style="font-size:14px;color:var(--text-muted);">„${escapeHtml(r.title)}" wird endgültig aus deinem Kochbuch entfernt.</p>
      <div class="form-actions">
        <button class="ghost-btn" data-action="close-modal">Abbrechen</button>
        <button class="primary-btn" style="background:var(--danger);color:#fff;flex:1;justify-content:center;" data-action="delete-recipe" data-id="${r.id}">Löschen</button>
      </div>
    </div>
  </div>`;
}

function importSummaryBanner(s) {
  if (!s) return '';
  const row = (ok, label) => `<div class="import-summary-row ${ok ? 'ok' : 'warn'}">${ok ? ICONS.check : ICONS.x}<span>${label}</span></div>`;
  return `<div class="import-summary">
    <div class="import-summary-title">${ICONS.sparkle} Automatisch erkannt — bitte kurz prüfen</div>
    ${row(s.titleFound, s.titleFound ? 'Titel erkannt' : 'Titel nicht erkannt — bitte eintragen')}
    ${row(s.ingredientCount > 0, s.ingredientCount + ' Zutat' + (s.ingredientCount === 1 ? '' : 'en') + ' erkannt')}
    ${row(s.stepCount > 0, s.stepCount + ' Zubereitungsschritt' + (s.stepCount === 1 ? '' : 'e') + ' erkannt')}
    ${row(s.servingsFound, s.servingsFound ? 'Portionen erkannt' : 'Portionen nicht erkannt — Standardwert eingetragen')}
    ${row(s.timeFound, s.timeFound ? 'Zeit erkannt' : 'Zeit nicht erkannt — Standardwert eingetragen')}
    ${s.dietFound ? row(true, 'Ernährungsform automatisch erkannt — bitte gegenprüfen') : ''}
    ${s.notesFound ? row(true, 'Notizen/Tipps automatisch erkannt und abgetrennt') : ''}
    ${s.categoryFound ? row(true, 'Mahlzeit/Gerichtstyp automatisch erkannt — bitte gegenprüfen') : ''}
    ${(s.lowConfidenceHints || []).length ? `<div class="import-summary-row warn">${ICONS.x}<span>Unsicher: ${s.lowConfidenceHints.map(h => categoryLabelFor(h.id)).join(', ')} — bitte manuell prüfen</span></div>` : ''}
  </div>`;
}

/* Findet die deutsche Beschriftung zu einer Kategorie-ID ueber alle Options-Listen hinweg
   (Diet/Meal/Dish) — fuer Anzeigezwecke in der Import-Vorschau und im Filter-System. */
function categoryLabelFor(id) {
  const diet = DIET_OPTIONS.find((o) => o.key === id);
  if (diet) return diet.label;
  const meal = MEAL_TYPE_OPTIONS.find((o) => o.id === id);
  if (meal) return meal.label;
  const dish = DISH_TYPE_OPTIONS.find((o) => o.id === id);
  if (dish) return dish.label;
  return id;
}

function formView() {
  const r = state.editingRecipe;
  const isNew = !state.recipes.some(x => x.id === r.id);
  return `
    ${topbar(isNew ? 'Neues Rezept' : 'Rezept bearbeiten', { back: true })}
    <main>
      <div class="form-page">
        ${importSummaryBanner(r._importSummary)}
        <div class="field">
          <label for="f-title">Titel</label>
          <input type="text" id="f-title" value="${escapeHtml(r.title)}" placeholder="z.B. Zitronen-Risotto">
        </div>
        <div class="field">
          <label for="f-image">Foto</label>
          <div class="image-drop" id="imgDrop">
            ${r.image
              ? `<img src="${r.image}" alt="">`
              : r.imageId
                ? `<div data-lazy-img="full" data-image-id="${r.imageId}" class="image-drop-placeholder">${ICONS.chef}</div>`
                : `<div class="image-drop-placeholder">${ICONS.chef}<div style="margin-top:6px;">Foto auswählen</div></div>`}
            <input type="file" accept="image/*" id="f-image" aria-label="Foto auswählen">
          </div>
        </div>
        <div class="field-row">
          <div class="field"><label for="f-servings">Portionen</label><input type="number" id="f-servings" min="1" value="${r.servings}"></div>
          <div class="field"><label for="f-time">Zeit (Min.)</label><input type="number" id="f-time" min="0" value="${r.timeMinutes}"></div>
          <div class="field"><label for="f-difficulty">Schwierigkeit</label>
            <select id="f-difficulty">
              ${['Einfach','Mittel','Anspruchsvoll'].map(d => `<option ${r.difficulty === d ? 'selected' : ''}>${d}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="field">
          <label id="diet-group-label">Ernährungsform</label>
          <div class="diet-select-row" role="group" aria-labelledby="diet-group-label">
            ${DIET_OPTIONS.filter(d => d.tone === 'diet').map(d => `<button type="button" class="diet-select-chip ${((r.diet)||[]).includes(d.key) ? 'active' : ''}" data-action="toggle-diet" data-diet="${d.key}" aria-pressed="${((r.diet)||[]).includes(d.key) ? 'true' : 'false'}">${((r.diet)||[]).includes(d.key) ? ICONS.check : ICONS[d.icon]}${d.label}</button>`).join('')}
          </div>
        </div>
        <div class="field">
          <label id="protein-group-label">Fleisch / Fisch</label>
          <div class="diet-select-row" role="group" aria-labelledby="protein-group-label">
            ${DIET_OPTIONS.filter(d => d.tone === 'protein').map(d => `<button type="button" class="diet-select-chip ${((r.diet)||[]).includes(d.key) ? 'active' : ''}" data-action="toggle-diet" data-diet="${d.key}" aria-pressed="${((r.diet)||[]).includes(d.key) ? 'true' : 'false'}">${((r.diet)||[]).includes(d.key) ? ICONS.check : ICONS[d.icon]}${d.label}</button>`).join('')}
          </div>
        </div>
        <div class="field">
          <label id="free-group-label">Hinweise / Frei von</label>
          <p class="settings-hint">Automatisch erkannte Angaben bitte immer selbst prüfen, keine medizinische Zusicherung.</p>
          <div class="diet-select-row" role="group" aria-labelledby="free-group-label">
            ${DIET_OPTIONS.filter(d => d.tone === 'free').map(d => `<button type="button" class="diet-select-chip ${((r.diet)||[]).includes(d.key) ? 'active' : ''}" data-action="toggle-diet" data-diet="${d.key}" aria-pressed="${((r.diet)||[]).includes(d.key) ? 'true' : 'false'}">${((r.diet)||[]).includes(d.key) ? ICONS.check : ICONS[d.icon]}${d.label}</button>`).join('')}
          </div>
        </div>
        <div class="field">
          <label id="meal-group-label">Mahlzeit</label>
          <div class="diet-select-row" role="group" aria-labelledby="meal-group-label">
            ${MEAL_TYPE_OPTIONS.map(m => `<button type="button" class="diet-select-chip ${((r.categoryTags)||[]).includes(m.id) ? 'active' : ''}" data-action="toggle-category" data-category="${m.id}" aria-pressed="${((r.categoryTags)||[]).includes(m.id) ? 'true' : 'false'}">${((r.categoryTags)||[]).includes(m.id) ? ICONS.check : ''}${m.label}</button>`).join('')}
          </div>
        </div>
        <div class="field">
          <label id="dish-group-label">Gericht</label>
          <div class="diet-select-row" role="group" aria-labelledby="dish-group-label">
            ${DISH_TYPE_OPTIONS.map(d => `<button type="button" class="diet-select-chip ${((r.categoryTags)||[]).includes(d.id) ? 'active' : ''}" data-action="toggle-category" data-category="${d.id}" aria-pressed="${((r.categoryTags)||[]).includes(d.id) ? 'true' : 'false'}">${((r.categoryTags)||[]).includes(d.id) ? ICONS.check : ''}${d.label}</button>`).join('')}
          </div>
          <button type="button" class="ghost-btn" data-action="reanalyze-categories" style="margin-top:10px;">${ICONS.sparkle} Kategorien automatisch vorschlagen</button>
        </div>
        <div class="field">
          <label for="f-tag-new">Tags</label>
          <div class="tag-input-row" id="tagInputRow">
            ${(r.tags || []).map(t => `<span class="tag-pill">${escapeHtml(t)}<button data-action="remove-tag" data-tag="${escapeHtml(t)}" aria-label="Tag ${escapeHtml(t)} entfernen">${ICONS.x}</button></span>`).join('')}
            <input type="text" id="f-tag-new" placeholder="Tag + Enter">
          </div>
          <div class="field-hint">z.B. ${ALL_TAGS_SEED.slice(0,4).join(', ')} …</div>
        </div>
        <div class="field">
          <span id="ing-group-label" style="font-size:13px;font-weight:600;color:var(--text);display:block;margin-bottom:6px;">Zutaten</span>
          <div id="ingRows" role="group" aria-labelledby="ing-group-label">
            ${(r.ingredients || []).map((i, idx) => ingredientRow(i, idx)).join('')}
          </div>
          <button class="add-row-btn" data-action="add-ingredient">${ICONS.plus} Zutat hinzufügen</button>
        </div>
        <div class="field">
          <span id="step-group-label" style="font-size:13px;font-weight:600;color:var(--text);display:block;margin-bottom:6px;">Zubereitung</span>
          <div id="stepRows" role="group" aria-labelledby="step-group-label">
            ${(r.steps || []).map((s, idx) => stepRow(s, idx)).join('')}
          </div>
          <button class="add-row-btn" data-action="add-step">${ICONS.plus} Schritt hinzufügen</button>
        </div>
        <div class="field">
          <label for="f-notes">Notizen (optional)</label>
          <textarea id="f-notes" placeholder="Eigene Anmerkungen, Variationen …">${escapeHtml(r.notes || '')}</textarea>
        </div>
        <div class="form-actions">
          ${!isNew ? `<button class="ghost-btn danger-btn" data-action="delete-recipe" data-id="${r.id}">Löschen</button>` : ''}
          <button class="primary-btn" data-action="save-recipe">Rezept speichern</button>
        </div>
      </div>
    </main>
  `;
}

function ingredientRow(i, idx) {
  const n = idx + 1;
  return `<div class="repeat-row ing-row" data-ing-row="${idx}">
    <div class="field ing-name"><input type="text" placeholder="Zutat" aria-label="Zutat ${n} – Name" class="ing-name-input" value="${escapeHtml(i.name || '')}"></div>
    <div class="ing-row-meta">
      <div class="field ing-amount"><input type="text" inputmode="decimal" placeholder="Menge" aria-label="Zutat ${n} – Menge" class="ing-amount-input" value="${escapeHtml(String(i.amount ?? ''))}"></div>
      <div class="field ing-unit"><input type="text" placeholder="Einheit" aria-label="Zutat ${n} – Einheit" class="ing-unit-input" value="${escapeHtml(i.unit || '')}"></div>
      <button type="button" class="ing-convert-btn" data-action="convert-ingredient-row" data-idx="${idx}" title="In dein Masseinheiten-System umrechnen" aria-label="Menge von Zutat ${n} in dein Masseinheiten-System umrechnen">${ICONS.swap}</button>
      <button class="repeat-row-remove" data-action="remove-ingredient" data-idx="${idx}" aria-label="Zutat ${n} entfernen">${ICONS.trash}</button>
    </div>
  </div>`;
}

function stepRow(s, idx) {
  const n = idx + 1;
  return `<div class="repeat-row" data-step-row="${idx}">
    <div class="step-num-badge" aria-hidden="true">${n}</div>
    <div class="field"><textarea class="step-text-input" placeholder="Was ist zu tun?" aria-label="Schritt ${n}">${escapeHtml(s.text || '')}</textarea></div>
    <button class="repeat-row-remove" data-action="remove-step" data-idx="${idx}" aria-label="Schritt ${n} entfernen">${ICONS.trash}</button>
  </div>`;
}

function renderStepWithTimers(text, stepIdx) {
  const segments = parseStepSegments(text);
  return segments.map(seg => {
    if (seg.type === 'text') return escapeHtml(seg.value);
    const id = `${state.activeRecipeId}-${stepIdx}-${seg.key}`;
    const t = state.timers[id];
    const label = t ? fmtClock(t.remaining) : seg.value;
    const cls = t && t.done ? 'done' : (t && t.running ? 'running' : '');
    return `<button type="button" class="timer-chip ${cls}" data-timer-id="${id}" data-seconds="${seg.seconds}" data-action="toggle-timer" aria-label="${t && t.done ? 'Timer fertig' : t && t.running ? 'Timer läuft, ' + fmtClock(t.remaining) + ' verbleiben' : 'Timer starten, ' + fmtClock(seg.seconds)}">${t && t.done ? ICONS.check : ICONS.timer}<span data-timer-label="${id}">${label}</span></button>`;
  }).join('');
}

function cookModeView() {
  const r = state.recipes.find(x => x.id === state.activeRecipeId);
  if (!r) { state.view = 'home'; return homeView(); }
  const steps = r.steps || [];

  if (state.cookFinished) {
    return `<div class="cookmode-overlay">
      <div class="cookmode-top">
        <button class="icon-btn" data-action="exit-cook" aria-label="Kochmodus verlassen">${ICONS.x}</button>
        <span></span><span style="width:38px;"></span>
      </div>
      <div class="cookmode-body">
        <div class="cook-finish">
          ${ICONS.sparkle}
          <h2>Guten Appetit.</h2>
          <p>${escapeHtml(r.title)} ist fertig. Lass es dir schmecken.</p>
        </div>
      </div>
      <div class="cookmode-nav">
        <button class="primary" style="max-width:280px;" data-action="exit-cook">Zurück zum Rezept</button>
      </div>
    </div>`;
  }

  const idx = Math.min(state.cookStepIndex, steps.length - 1);
  const step = steps[idx] || { text: '' };
  const isLast = idx === steps.length - 1;
  return `<div class="cookmode-overlay">
    <div class="cookmode-top">
      <button class="icon-btn" data-action="exit-cook" aria-label="Kochmodus verlassen">${ICONS.x}</button>
      <span class="cookmode-progress">Schritt ${idx + 1} / ${steps.length}</span>
      <div style="display:flex;align-items:center;gap:8px;">
        <button class="icon-btn" data-action="toggle-voice" aria-label="Schritte vorlesen" title="Schritte vorlesen">${state.voiceEnabled ? ICONS.volume : ICONS.volumeOff}</button>
        ${state.wakeLock ? `<span class="wakelock-chip">${ICONS.sun} An</span>` : ''}
      </div>
    </div>
    <div class="cookmode-body">
      <div class="cookmode-stepnum">${escapeHtml(r.title)}</div>
      <div class="cookmode-steptext">${renderStepWithTimers(step.text, idx)}</div>
    </div>
    <div class="cookmode-nav">
      <button data-action="cook-prev" ${idx === 0 ? 'disabled' : ''}>Zurück</button>
      <button class="primary" data-action="${isLast ? 'cook-finish' : 'cook-next'}">${isLast ? 'Fertig' : 'Weiter'}</button>
    </div>
  </div>`;
}

function shoppingView() {
  const items = state.shopping;
  const open = items.filter(i => !i.checked);
  const checked = items.filter(i => i.checked);
  const row = (i) => `<div class="shopping-item ${i.checked ? 'checked' : ''}">
    <button class="shopping-check ${i.checked ? 'checked' : ''}" data-action="toggle-shopping-item" data-id="${i.id}"
      aria-pressed="${i.checked ? 'true' : 'false'}"
      aria-label="${escapeHtml(i.name)}${i.checked ? ', erledigt. Als offen markieren' : ', offen. Als erledigt markieren'}">${i.checked ? ICONS.check : ''}</button>
    <div class="shopping-item-text">${i.amount ? `<span class="shopping-item-amount">${escapeHtml(String(i.amount))}${i.unit ? ' ' + escapeHtml(i.unit) : ''}</span>` : ''}${escapeHtml(i.name)}</div>
    <button class="shopping-item-del" data-action="delete-shopping-item" data-id="${i.id}" aria-label="${escapeHtml(i.name)} entfernen">${ICONS.x}</button>
  </div>`;

  const grouped = {};
  open.forEach(i => { const cat = categorizeIngredient(i.name); (grouped[cat] = grouped[cat] || []).push(i); });
  const openHtml = CATEGORY_ORDER
    .filter(cat => grouped[cat] && grouped[cat].length)
    .map(cat => `<div class="shopping-group-title">${cat}</div><div>${grouped[cat].map(row).join('')}</div>`)
    .join('');

  return `
    ${topbar('Einkaufsliste', { actions: items.length ? `<button class="icon-btn" data-action="clear-all-shopping" aria-label="Ganze Einkaufsliste leeren">${ICONS.trash}</button>` : '' })}
    <main class="has-tabbar">
      <div class="shopping-add-row">
        <label for="shoppingAddInput" class="sr-only">Artikel zur Einkaufsliste hinzufügen</label>
        <input type="text" id="shoppingAddInput" placeholder="Artikel hinzufügen, z.B. Küchenrolle…">
        <button class="icon-btn" data-action="add-shopping-item-manual" aria-label="Hinzufügen">${ICONS.plus}</button>
      </div>
      ${!items.length ? `<div class="empty-state">${ICONS.cart}<h2>Deine Einkaufsliste ist leer</h2><p>Tippe oben einen Artikel ein oder öffne ein Rezept und tippe auf „Zur Einkaufsliste".</p></div>` : `
        ${open.length ? openHtml : `<p class="shopping-all-checked"><span class="icon-inline shopping-all-checked-icon">${ICONS.sparkle}</span>Alles abgehakt</p>`}
        ${checked.length ? `<div class="shopping-group-title">Erledigt</div><div>${checked.map(row).join('')}</div>
          <button class="ghost-btn shopping-clear-checked-btn" data-action="clear-checked-shopping">Abgehakte entfernen</button>` : ''}
      `}
    </main>
    ${bottomNav()}
  `;
}

function mealplanView() {
  if (!state.recipes.length) {
    return `
      ${topbar('Wochenplan')}
      <main class="has-tabbar">
        <div class="empty-state">
          ${ICONS.calendar}
          <h2>Noch keine Rezepte für den Wochenplan</h2>
          <p>Trag zuerst ein paar Rezepte in dein Kochbuch ein, dann kannst du sie hier auf die Tage verteilen.</p>
          <button class="primary-btn" data-action="new-recipe">${ICONS.plus} Erstes Rezept eintragen</button>
        </div>
      </main>
      ${bottomNav()}
    `;
  }
  const days = Array.from({ length: 7 }, (_, i) => addDays(state.weekStart, i));
  const todayKey = fmtDateKey(new Date());
  const weekEnd = days[6];
  const sameMonth = state.weekStart.getMonth() === weekEnd.getMonth();
  const label = sameMonth
    ? `${state.weekStart.getDate()}. – ${weekEnd.getDate()}. ${MONTH_LABELS[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`
    : `${state.weekStart.getDate()}. ${MONTH_LABELS[state.weekStart.getMonth()]} – ${weekEnd.getDate()}. ${MONTH_LABELS[weekEnd.getMonth()]}`;

  const weekRecipeIds = new Set();
  days.forEach(d => (state.mealplan[fmtDateKey(d)] || []).forEach(id => weekRecipeIds.add(id)));

  const dayCards = days.map((d, idx) => {
    const key = fmtDateKey(d);
    const ids = state.mealplan[key] || [];
    const isToday = key === todayKey;
    const chips = ids.map(id => {
      const r = state.recipes.find(x => x.id === id);
      if (!r) return '';
      return `<div class="day-recipe-chip"><span>${escapeHtml(r.title)}</span><button data-action="remove-mealplan-recipe" data-date="${key}" data-id="${id}" aria-label="Rezept von diesem Tag entfernen">${ICONS.x}</button></div>`;
    }).join('');
    return `<div class="day-card ${isToday ? 'is-today' : ''}">
      <div class="day-card-head">
        <span class="day-card-title">${WEEKDAY_LABELS[idx]}</span>
        <span class="day-card-date">${d.getDate()}. ${MONTH_LABELS[d.getMonth()]}</span>
      </div>
      ${chips}
      <button class="day-add-btn" data-action="open-day-picker" data-date="${key}">${ICONS.plus} Rezept hinzufügen</button>
    </div>`;
  }).join('');

  return `
    ${topbar('Wochenplan')}
    <main class="has-tabbar">
      <div class="week-nav">
        <button data-action="week-prev" aria-label="Vorherige Woche">${ICONS.chevronLeft}</button>
        <span class="week-nav-label">${label}</span>
        <button data-action="week-next" aria-label="Nächste Woche">${ICONS.chevronRight}</button>
      </div>
      ${dayCards}
      <button class="primary-btn" style="width:100%;justify-content:center;margin-top:8px;" data-action="mealplan-to-shopping" ${weekRecipeIds.size ? '' : 'disabled'}>${ICONS.cart} Einkaufsliste für diese Woche</button>
    </main>
    ${bottomNav()}
    ${state.modal && state.modal.type === 'pick-recipe' ? recipePickerModal() : ''}
  `;
}

function recipePickerModal() {
  const items = state.recipes.length
    ? state.recipes.map(r => `<button class="picker-item" data-action="assign-mealplan-recipe" data-date="${state.modal.date}" data-id="${r.id}">
        ${r.image ? `<img src="${r.image}" alt="">` : ''}
        <span>${escapeHtml(r.title)}</span>
      </button>`).join('')
    : `<p style="font-size:13.5px;color:var(--text-muted);">Noch keine Rezepte im Kochbuch.</p>`;
  const [y, m, d] = state.modal.date.split('-').map(Number);
  const labelDate = new Date(y, m - 1, d).toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' });
  return `<div class="modal-backdrop" data-action="close-modal">
    <div class="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="picker-modal-title" tabindex="-1" onclick="event.stopPropagation()">
      <h3 class="modal-title" id="picker-modal-title">Rezept für ${labelDate}</h3>
      <div class="picker-list">${items}</div>
    </div>
  </div>`;
}

function unitConverterUnitOptions(selected) {
  const groups = [
    { label: 'Gewicht', units: ['g', 'kg', 'oz', 'lb'] },
    { label: 'Volumen', units: ['ml', 'l', 'tsp', 'tbsp', 'cup', 'floz'] },
  ];
  return groups.map(g => `<optgroup label="${g.label}">${g.units.map(u => `<option value="${u}" ${u === selected ? 'selected' : ''}>${UNIT_LABELS[u]}</option>`).join('')}</optgroup>`).join('');
}

function unitConverterResultsHtml() {
  const amount = parseFloat(state.ucAmount);
  const unit = state.ucUnit;
  const dim = unitDimension(unit);
  if (!dim || isNaN(amount)) return `<p style="font-size:13.5px;color:var(--text-muted);">Menge eingeben, um Umrechnungen zu sehen.</p>`;
  const table = dim === 'weight' ? WEIGHT_TABLE : VOLUME_TABLE;
  const others = Object.keys(table).filter(u => u !== unit);
  return `<div class="uc-result-list">${others.map(u => {
    const val = convertAmountExplicit(amount, unit, u);
    return `<div class="uc-result-row"><span class="uc-result-value">${val}</span><span class="uc-result-unit">${UNIT_LABELS[u]}</span></div>`;
  }).join('')}</div>`;
}

function unitConverterView() {
  if (state.ucAmount === undefined) state.ucAmount = '100';
  if (state.ucUnit === undefined) state.ucUnit = 'g';
  return `
    ${topbar('Masseinheiten-Rechner', { back: true })}
    <main class="has-tabbar">
      <div class="uc-input-row">
        <input type="text" inputmode="decimal" id="ucAmount" value="${escapeHtml(state.ucAmount)}">
        <select id="ucUnit">${unitConverterUnitOptions(state.ucUnit)}</select>
      </div>
      <div id="ucResults">${unitConverterResultsHtml()}</div>
    </main>
    ${bottomNav()}
  `;
}

/* ---------- "Mehr" (frueher "Einstellungen") — Redesign, Teil A ----------
   Ersetzt die Accordion-Wand durch klar gruppierte Zeilen (Settings Rows). Einstellungen,
   Aktionen und Informationen stehen in eigenen Gruppen, nicht mehr gleichrangig nebeneinander.
   Komplexere Bereiche oeffnen eine eigene Detailseite (eigener state.view-Eintrag) statt eines
   aufklappbaren Bereichs — Zurueck-Navigation siehe onAction 'back' in ui.js. */
function settingsRow(opts) {
  const { icon, title, summary, view, action, danger } = opts;
  const attr = view ? `data-action="goto-view" data-view="${view}"` : `data-action="${action}"`;
  return `<button type="button" class="settings-row ${danger ? 'settings-row-danger' : ''}" ${attr}>
    <span class="settings-row-icon" aria-hidden="true">${icon}</span>
    <span class="settings-row-title">${title}</span>
    ${summary ? `<span class="settings-row-summary">${escapeHtml(summary)}</span>` : ''}
    <span class="settings-row-chevron" aria-hidden="true">${ICONS.chevronRight}</span>
  </button>`;
}

function settingsGroup(label, rowsHtml) {
  return `<div class="settings-group">
    <div class="settings-group-title">${label}</div>
    <div class="settings-group-card">${rowsHtml}</div>
  </div>`;
}

function settingsDetailShell(title, bodyHtml) {
  return `
    ${topbar(title, { back: true })}
    <main class="has-tabbar settings-page">${bodyHtml}</main>
    ${bottomNav()}
  `;
}

function settingsView() {
  const t = state.theme;
  const themeLabel = t === 'light' ? 'Hell' : t === 'dark' ? 'Dunkel' : t === 'amoled' ? 'Schwarz' : 'System';
  const unitLabel = state.unitSystem === 'metric' ? 'Metrisch' : 'Imperial';
  const cookbookSummary = state.cookbookTitle || 'Nicht festgelegt';

  return `
    ${topbar('Mehr')}
    <main class="has-tabbar settings-page">
      ${settingsGroup('Mein Kochbuch', settingsRow({ icon: ICONS.book, title: 'Kochbuch & Profil', summary: cookbookSummary, view: 'settings-profile' }))}
      ${settingsGroup('App', [
        settingsRow({ icon: ICONS.moon, title: 'Darstellung', summary: themeLabel, view: 'settings-display' }),
        settingsRow({ icon: ICONS.ruler, title: 'Masseinheiten', summary: unitLabel, view: 'settings-units' }),
      ].join(''))}
      ${settingsGroup('Daten &amp; Export', [
        settingsRow({ icon: ICONS.download, title: 'Backup &amp; Wiederherstellung', view: 'settings-backup' }),
        settingsRow({ icon: ICONS.pdf, title: 'Kochbuch als PDF', action: 'export-cookbook' }),
      ].join(''))}
      ${settingsGroup('Werkzeuge', settingsRow({ icon: ICONS.scale, title: 'Masseinheiten-Rechner', action: 'open-unitconverter' }))}
      ${settingsGroup('Hilfe &amp; Informationen', [
        settingsRow({ icon: ICONS.lifeBuoy, title: 'Hilfe &amp; Feedback', view: 'settings-help' }),
        settingsRow({ icon: ICONS.shield, title: 'Datenschutz', view: 'settings-privacy' }),
        settingsRow({ icon: ICONS.fileText, title: 'Nutzungsbedingungen', view: 'settings-terms' }),
        settingsRow({ icon: ICONS.database, title: 'Datenquellen', view: 'settings-sources' }),
        settingsRow({ icon: ICONS.info, title: 'Über Savora', view: 'settings-about' }),
      ].join(''))}
    </main>
    ${bottomNav()}
    ${pdfExportModal()}
  `;
}

function settingsDisplayView() {
  const t = state.theme;
  const body = `
    <div class="settings-group">
      <div class="settings-group-card settings-group-card--padded">
        <p class="settings-hint">Dunkel eignet sich besonders gut zum Kochen am Abend.</p>
        <div class="theme-switch theme-switch--grid" role="radiogroup" aria-label="Darstellung">
          <button class="theme-opt ${t === 'light' ? 'active' : ''}" data-action="set-theme" data-theme="light" role="radio" aria-checked="${t === 'light'}">${ICONS.sun} Hell</button>
          <button class="theme-opt ${t === 'dark' ? 'active' : ''}" data-action="set-theme" data-theme="dark" role="radio" aria-checked="${t === 'dark'}">${ICONS.moon} Dunkel</button>
          <button class="theme-opt ${t === 'amoled' ? 'active' : ''}" data-action="set-theme" data-theme="amoled" role="radio" aria-checked="${t === 'amoled'}">${ICONS.moon} Schwarz</button>
          <button class="theme-opt ${t === 'auto' ? 'active' : ''}" data-action="set-theme" data-theme="auto" role="radio" aria-checked="${t === 'auto'}">${ICONS.auto} System</button>
        </div>
        <p class="settings-hint settings-hint--top">Schwarz: vollständig schwarzer Hintergrund für OLED-Displays.</p>
      </div>
    </div>`;
  return settingsDetailShell('Darstellung', body);
}

function settingsUnitsView() {
  const body = `
    <div class="settings-group">
      <div class="settings-group-card settings-group-card--padded">
        <p class="settings-hint">Beim Importieren von Rezepten aus Text werden Mengen automatisch in dein bevorzugtes System umgerechnet. Du kannst jede Menge danach trotzdem frei anpassen.</p>
        <div class="theme-switch" role="radiogroup" aria-label="Masseinheiten">
          <button class="theme-opt ${state.unitSystem === 'metric' ? 'active' : ''}" data-action="set-unit-system" data-system="metric" role="radio" aria-checked="${state.unitSystem === 'metric'}">Metrisch (g, ml)</button>
          <button class="theme-opt ${state.unitSystem === 'imperial' ? 'active' : ''}" data-action="set-unit-system" data-system="imperial" role="radio" aria-checked="${state.unitSystem === 'imperial'}">Imperial (oz, cup)</button>
        </div>
      </div>
    </div>`;
  return settingsDetailShell('Masseinheiten', body);
}

function settingsProfileView() {
  const body = `
    <div class="settings-group">
      <div class="settings-group-card settings-group-card--padded">
        <p class="settings-hint">Der Kochbuch-Titel erscheint unter dem Logo auf der Startseite und auf dem Deckblatt beim PDF-Export.</p>
        <div class="field" style="margin-bottom:14px;">
          <label for="f-cookbook-title">Kochbuch-Titel</label>
          <input type="text" id="f-cookbook-title" placeholder="z.B. Yanis' Küche" value="${escapeHtml(state.cookbookTitle)}">
        </div>
        <p class="settings-hint">Dein Name wird angehängt, wenn du ein Rezept mit jemandem teilst, damit der Empfänger sieht, von wem es kommt.</p>
        <div class="field" style="margin-bottom:14px;">
          <label for="f-sender-name">Dein Name</label>
          <input type="text" id="f-sender-name" placeholder="z.B. Yanis" value="${escapeHtml(state.senderName)}">
        </div>
        <button class="primary-btn" data-action="save-profile-fields">${ICONS.check} Speichern</button>
      </div>
    </div>`;
  return settingsDetailShell('Kochbuch & Profil', body);
}

function settingsBackupView() {
  const lastBackupLabel = state.lastBackupAt
    ? new Date(state.lastBackupAt).toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Noch keine Sicherung erstellt';
  const body = `
    <div class="settings-group">
      <div class="settings-group-title">Backup</div>
      <div class="settings-group-card settings-group-card--padded">
        <p class="settings-hint">Savora speichert alles nur auf diesem Gerät. Erstelle regelmässig eine Sicherung, damit bei einem Gerätewechsel oder gelöschten Browserdaten nichts verloren geht.</p>
        <button class="primary-btn" data-action="export-backup">${ICONS.download} Backup erstellen</button>
        <p class="settings-hint settings-hint--top">Letztes Backup: ${escapeHtml(lastBackupLabel)}</p>
      </div>
    </div>
    <div class="settings-group">
      <div class="settings-group-title">Wiederherstellen</div>
      <div class="settings-group-card settings-group-card--padded">
        <button class="ghost-btn" data-action="trigger-restore">${ICONS.upload} Backup importieren</button>
        <input type="file" id="restoreFileInput" accept="application/json" style="display:none;">
        <p class="settings-hint settings-hint--top">„Backup importieren" ist für deine eigenen Sicherungen gedacht. Ein von dir geteiltes Rezept kommt bei anderen als fertige PDF-Datei an: die lässt sich ansehen, ausdrucken oder weiterschicken, aber nicht zurück in Savora einspielen.</p>
        <div id="backupStatus"></div>
      </div>
    </div>`;
  return settingsDetailShell('Backup & Wiederherstellung', body);
}

function settingsHelpView() {
  const body = `<div class="settings-group"><div class="settings-group-card settings-group-card--padded">
    <p class="settings-hint settings-hint--none">Fragen oder Feedback zu Savora kannst du direkt an die Person richten, von der du die App erhalten hast.</p>
  </div></div>`;
  return settingsDetailShell('Hilfe & Feedback', body);
}

function settingsPrivacyView() {
  const body = `<div class="settings-group">
    <div class="settings-group-card settings-group-card--padded">
      <p class="settings-hint">Deine Rezepte, Fotos und Notizen bleiben ausschliesslich lokal auf diesem Gerät (IndexedDB). Savora hat keinen eigenen Server und schickt diese Daten nirgendwohin.</p>
      <p class="settings-hint">Eine Ausnahme: Wenn du ein Produkt per Barcode suchst und die Schweizer Nährwertdatenbank keinen Treffer hat, fragt Savora Open Food Facts online ab. Dabei werden nur die dafür nötigen Such-/Barcode-Daten an diesen Dienst übertragen, keine anderen Rezeptdaten.</p>
      <p class="settings-hint settings-hint--none">Exportierst oder teilst du ein Rezept selbst, verlässt genau diese Datei dein Gerät, sonst nichts. Diese Seite wird für die Beta-Version noch ausführlicher vorbereitet.</p>
    </div>
  </div>`;
  return settingsDetailShell('Datenschutz', body);
}

function settingsTermsView() {
  const body = `<div class="settings-group"><div class="settings-group-card settings-group-card--padded">
    <p class="settings-hint settings-hint--none">Diese Seite wird für die Beta-Version vorbereitet.</p>
  </div></div>`;
  return settingsDetailShell('Nutzungsbedingungen', body);
}

function settingsSourcesView() {
  const body = `<div class="settings-group">
    <div class="settings-group-title">Schweizer Nährwertdatenbank</div>
    <div class="settings-group-card settings-group-card--padded">
      <p class="settings-hint settings-hint--none">Primärquelle für die meisten Zutaten, herausgegeben vom Bundesamt für Lebensmittelsicherheit und Veterinärwesen (BLV). Lokal in Savora eingebettet, funktioniert offline.</p>
    </div>
  </div>
  <div class="settings-group">
    <div class="settings-group-title">Open Food Facts</div>
    <div class="settings-group-card settings-group-card--padded">
      <p class="settings-hint settings-hint--none">Wird nur genutzt, wenn du ein Produkt per Barcode scannst und es in der Schweizer Datenbank nicht vorkommt. Ein offenes, community-gepflegtes Projekt: Angaben stammen von Herstellern und Nutzer_innen und können lückenhaft oder ungenau sein. Benötigt eine Internetverbindung.</p>
    </div>
  </div>
  <div class="settings-group">
    <div class="settings-group-title">USDA (FoodData Central)</div>
    <div class="settings-group-card settings-group-card--padded">
      <p class="settings-hint settings-hint--none">Als zusätzliche Quelle vorbereitet, aber deaktiviert: eine sichere Anbindung würde einen eigenen Server erfordern, der API-Schlüssel schützt, statt sie im Browser offenzulegen. Wird erst aktiviert, wenn ein solches Backend existiert.</p>
    </div>
  </div>
  <div class="settings-group">
    <div class="settings-group-title">Eigene Angaben</div>
    <div class="settings-group-card settings-group-card--padded">
      <p class="settings-hint settings-hint--none">Selbst erfasste Custom Foods und von dir bestätigte Zuordnungen haben Vorrang vor automatischen Treffern aus den Datenbanken oben.</p>
    </div>
  </div>
  <div class="settings-group">
    <div class="settings-group-card settings-group-card--padded">
      <p class="settings-hint settings-hint--none">Alle Werte sind Schätzungen ohne medizinische Zusicherung. Ein fehlender Wert wird als "–" angezeigt, nie als 0: das würde fälschlich "gemessen und tatsächlich null" statt "keine Daten vorhanden" bedeuten.</p>
    </div>
  </div>`;
  return settingsDetailShell('Datenquellen', body);
}

function settingsAboutView() {
  const body = `<div class="settings-group"><div class="settings-group-card settings-group-card--padded" style="text-align:center;">
    <img src="logo-mark.png" alt="" style="width:56px;height:56px;margin:4px auto 12px;">
    <h2 style="font-family:var(--font-display);margin:0 0 4px;">Savora</h2>
    <p class="settings-hint settings-hint--none">Dein persönliches digitales Kochbuch.</p>
  </div></div>`;
  return settingsDetailShell('Über Savora', body);
}

/* Punkt 12/13: eigener, dedizierter Screen statt Accordion-Textarea in den Settings. Wird ueber
   die FAB (addMenuModal) erreicht, nicht ueber "Mehr". */
function pasteImportView() {
  const body = `
    <div class="settings-group">
      <div class="settings-group-card settings-group-card--padded">
        <p class="settings-hint">Bildunterschrift eines Instagram-/TikTok-Posts, eine WhatsApp-Nachricht, kopierter Rezepttext einer Webseite oder eine eigene Notiz einfügen. Savora erkennt Titel, Zutaten und Schritte automatisch, du prüfst den Entwurf danach kurz, bevor du speicherst.</p>
        <div class="field field--tight">
          <textarea id="pasteText" class="paste-import-textarea" placeholder="Rezepttext hier einfügen …"></textarea>
        </div>
        <button class="primary-btn" data-action="do-paste-import">${ICONS.sparkle} Rezept-Entwurf erstellen</button>
      </div>
    </div>`;
  return `
    ${topbar('Aus Text importieren', { back: true })}
    <main class="has-tabbar settings-page">${body}</main>
  `;
}
