/* ---------- Savora Views, Feast x Bloom ----------
   Ersetzt Uebersicht, Detail, Kochmodus, Einkauf, Wochenplan und Formular aus views.js.
   Einstellungsseiten, Import, Einheiten-Rechner und alle Modals aus views.js/pdf-ui.js/
   nutrition-ui.js bleiben unveraendert in Gebrauch. */

const SVG_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
Object.assign(ICONS, {
  grid: `${SVG_OPEN}<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`,
  list: `${SVG_OPEN}<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></svg>`,
  more: `${SVG_OPEN}<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/></svg>`,
  moreH: `${SVG_OPEN}<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg>`,
  home: `${SVG_OPEN}<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/></svg>`,
  arrowUp: `${SVG_OPEN}<path d="m18 15-6-6-6 6"/></svg>`,
  arrowDown: `${SVG_OPEN}<path d="m6 9 6 6 6-6"/></svg>`,
  copy: `${SVG_OPEN}<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>`,
  note: `${SVG_OPEN}<path d="M4 4h16v12l-4 4H4z"/><path d="M16 20v-4h4"/><path d="M8 9h8M8 13h5"/></svg>`,
  folder: `${SVG_OPEN}<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`,
  minus: `${SVG_OPEN}<path d="M5 12h14"/></svg>`,
  listSteps: `${SVG_OPEN}<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h1M4 12h1M4 18h1"/></svg>`,
  split: `${SVG_OPEN}<path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M21 3 14 10"/><path d="m3 3 7 7"/><path d="M12 14v7"/></svg>`,
  box: `${SVG_OPEN}<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/></svg>`,
  bookmark: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6.5 3.5h11a1 1 0 0 1 1 1V21l-6.5-4.6L5.5 21V4.5a1 1 0 0 1 1-1z"/></svg>`,
  bookmarkFilled: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6.5 3.5h11a1 1 0 0 1 1 1V21l-6.5-4.6L5.5 21V4.5a1 1 0 0 1 1-1z"/></svg>`,
  sliders: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/></svg>`,
  homeFilled: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M3.2 10.4 12 3l8.8 7.4V20a1.2 1.2 0 0 1-1.2 1.2h-4.4v-5.7a1.2 1.2 0 0 0-1.2-1.2h-4a1.2 1.2 0 0 0-1.2 1.2v5.7H4.4A1.2 1.2 0 0 1 3.2 20z"/></svg>`,
  cloud: `${SVG_OPEN}<path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 9.2 4.5 4.5 0 0 0 7 18z"/></svg>`,
  bookOpen: `${SVG_OPEN}<path d="M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2z"/><path d="M22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z"/></svg>`,
});

const TAB_VIEWS = ['home', 'mealplan', 'shopping', 'settings'];
const DAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/* ---------- Navigation ---------- */
function bottomNav() {
  const tabs = [
    { view: 'home', icon: ICONS.home, iconActive: ICONS.homeFilled, label: 'Rezepte' },
    { view: 'mealplan', icon: ICONS.calendar, label: 'Wochenplan' },
    { view: 'shopping', icon: ICONS.cart, label: 'Einkauf' },
    { view: 'settings', icon: ICONS.moreH, label: 'Mehr' },
  ];
  const openCount = state.shopping.filter(i => !i.checked && !i.have).length;
  return `<nav class="bottom-nav" aria-label="Hauptnavigation">
    ${tabs.map(t => {
      const active = t.view === 'settings' ? isMoreSectionView(state.view) : (t.view === 'home' ? ['home', 'detail'].includes(state.view) : state.view === t.view);
      const badge = t.view === 'shopping' && openCount ? `<span class="nav-badge" aria-hidden="true">${openCount > 99 ? '99+' : openCount}</span>` : '';
      return `<button data-action="nav-tab" data-view="${t.view}" class="${active ? 'active' : ''}" ${active ? 'aria-current="page"' : ''}>
        <span class="nav-icon" aria-hidden="true">${active && t.iconActive ? t.iconActive : t.icon}${badge}</span><span class="nav-label">${t.label}</span>
      </button>`;
    }).join('')}
  </nav>`;
}

// Kompakte App-Bar fuer Unterseiten (Zurueck, Titel, Aktionen). Wird auch von den
// Einstellungsseiten in views.js verwendet, deshalb gleiche Signatur wie bisher.
function topbar(title, opts = {}) {
  const left = opts.back
    ? `<button class="icon-btn" data-action="back" aria-label="Zurück">${ICONS.back}</button>`
    : `<div class="brand-v2"><span class="brand-word">savora</span></div>`;
  return `<header class="topbar ${opts.back ? 'topbar--sub' : ''} ${opts.cls || ''}">
    <div class="topbar-left">${left}${opts.back ? `<h1 class="topbar-title">${escapeHtml(title)}</h1>` : ''}</div>
    <div class="topbar-actions">${opts.actions || ''}</div>
  </header>`;
}

function pageTitle(title, actions) {
  return `<div class="page-title-row"><h1 class="page-title">${escapeHtml(title)}</h1>${actions || ''}</div>`;
}

/* ---------- Filter ---------- */
function applyAllFilters(recipes) {
  let list = recipesInCollection(state.activeCollection, recipes);
  if (state.query.trim()) {
    const q = state.query.trim().toLowerCase();
    list = list.filter(r =>
      (r.title || '').toLowerCase().includes(q) ||
      (r.ingredients || []).some(i => (i.name || '').toLowerCase().includes(q)) ||
      (r.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }
  if (state.activeTag) list = list.filter(r => (r.tags || []).includes(state.activeTag));
  if (state.favOnly) list = list.filter(r => r.favorite);
  const { dietary, category, time } = state.activeFilters;
  if (dietary.size) list = list.filter(r => { const bad = new Set(dietConflicts(r).map(c => c.label)); return (r.diet || []).some(d => dietary.has(d) && !bad.has(d)); });
  if (category.size) list = list.filter(r => (r.categoryTags || []).some(c => category.has(c)));
  if (time.size) list = list.filter(r => timeBucketsFor(r.timeMinutes).some(b => time.has(b)));
  return list;
}

function collectionChips() {
  const chips = [{ id: 'all', label: 'Alle' }, { id: 'quick', label: 'Schnell' }, { id: 'veggie', label: 'Vegetarisch' }, { id: 'favorites', label: 'Favoriten' }, { id: 'uncooked', label: 'Noch nicht gekocht' }];
  if (state.recipes.some(isFrequentlyCooked)) chips.push({ id: 'frequent', label: 'Häufig gekocht' });
  getCollections().forEach(c => chips.push({ id: c.id, label: c.name }));
  const current = state.favOnly ? 'favorites' : state.activeCollection;
  return chips.map(c => `<button type="button" class="chip ${current === c.id ? 'chip--active' : ''}" data-action="set-collection" data-id="${escapeHtml(c.id)}" aria-pressed="${current === c.id}">${escapeHtml(c.label)}</button>`).join('');
}

function filterSheetModal() {
  if (!state.modal || state.modal.type !== 'filter-sheet') return '';
  const { dietary, category, time } = state.activeFilters;
  const resultCount = applyAllFilters(state.recipes).length;
  const dietaryOptions = DIET_OPTIONS.filter(d => d.tone === 'diet' || d.tone === 'protein').map(d => ({ id: d.key, label: d.label }));
  const tags = Array.from(new Set(state.recipes.flatMap(r => r.tags || []))).sort((a, b) => a.localeCompare(b, 'de'));
  return `<div class="modal-backdrop" data-action="close-modal">
    <div class="modal-sheet filter-sheet" role="dialog" aria-modal="true" aria-labelledby="filter-sheet-title" tabindex="-1" onclick="event.stopPropagation()">
      <div class="sheet-handle" aria-hidden="true"></div>
      <h3 class="modal-title" id="filter-sheet-title">Filter</h3>
      ${filterCheckboxGroup('Ernährung', 'dietary', dietaryOptions, dietary, o => o.id, o => o.label)}
      ${filterCheckboxGroup('Mahlzeit', 'category', MEAL_TYPE_OPTIONS, category, o => o.id, o => o.label)}
      ${filterCheckboxGroup('Gericht', 'category', DISH_TYPE_OPTIONS, category, o => o.id, o => o.label)}
      ${filterCheckboxGroup('Zeit', 'time', TIME_BUCKET_OPTIONS, time, o => o.id, o => o.label)}
      ${tags.length ? `<div class="filter-group">
        <h3 class="filter-group-title" id="filter-group-tags">Tags</h3>
        <div class="filter-checkbox-row" role="group" aria-labelledby="filter-group-tags">
          ${tags.map(t => `<button type="button" class="filter-checkbox ${state.activeTag === t ? 'active' : ''}" data-action="filter-tag" data-tag="${escapeHtml(state.activeTag === t ? '' : t)}" aria-pressed="${state.activeTag === t}"><span class="filter-checkbox-box" aria-hidden="true">${state.activeTag === t ? ICONS.check : ''}</span>${escapeHtml(t)}</button>`).join('')}
        </div>
      </div>` : ''}
      <div class="form-actions">
        <button class="ghost-btn" data-action="clear-all-filters">Zurücksetzen</button>
        <button class="primary-btn" data-action="close-modal">${resultCount} Rezept${resultCount === 1 ? '' : 'e'} anzeigen</button>
      </div>
    </div>
  </div>`;
}

/* ---------- Rezeptuebersicht ---------- */
/* Platzhalter fuer Rezepte ohne Foto: Anfangsbuchstabe auf einem Farbverlauf. Die Farbe ergibt sich
   stabil aus der Rezept-ID (6 Farben, siehe .ph-0 bis .ph-5), wechselt also nie beim Neuladen. */
function placeholderInner(r) {
  const ch = (String(r.title || '').trim().match(/[A-Za-zÀ-ÿ0-9]/) || ['·'])[0].toUpperCase();
  return `<span class="ph-letter" aria-hidden="true">${escapeHtml(ch)}</span>`;
}
function placeholderClass(r) {
  let h = 0; const s = String(r.id || r.title || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return 'ph-' + (h % 6);
}
function recipeImageHtml(r, cls, size) {
  if (r.image) return `<img class="${cls}" src="${r.image}" alt="" loading="lazy">`;
  if (r.imageId) return `<div class="${cls} placeholder ${placeholderClass(r)}" data-lazy-img="${size}" data-image-id="${r.imageId}" data-img-class="${cls}">${placeholderInner(r)}</div>`;
  return `<div class="${cls} placeholder ${placeholderClass(r)}">${placeholderInner(r)}</div>`;
}
function recipeMetaLine(r, full) {
  const parts = [];
  if (r.timeMinutes) parts.push(`${r.timeMinutes} Min.`);
  if (full && r.servings) parts.push(servingMode(r) === 'pieces' ? `${r.servings} Stück` : `${r.servings} ${r.servings === 1 ? 'Portion' : 'Portionen'}`);
  return parts.join('  •  ');
}
function favButton(r, extraCls) {
  return `<button type="button" class="fav-toggle ${extraCls || ''} ${r.favorite ? 'is-active' : ''}" data-action="toggle-fav" data-id="${r.id}" aria-pressed="${r.favorite ? 'true' : 'false'}" aria-label="${r.favorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}">${r.favorite ? ICONS.bookmarkFilled : ICONS.bookmark}</button>`;
}
function recipeCard(r) {
  return `<article class="rcard">
    <button type="button" class="rcard-main" data-action="open-recipe" data-id="${r.id}" aria-label="${escapeHtml(r.title || 'Ohne Titel')} öffnen">
      ${recipeImageHtml(r, 'rcard-img', 'thumb')}
      <span class="rcard-body">
        <span class="rcard-title">${escapeHtml(r.title || 'Ohne Titel')}</span>
        <span class="rcard-meta">${escapeHtml(recipeMetaLine(r, false))}</span>
      </span>
    </button>
    ${favButton(r, 'rcard-fav')}
  </article>`;
}
function recipeRow(r) {
  return `<article class="rrow">
    <button type="button" class="rrow-main" data-action="open-recipe" data-id="${r.id}" aria-label="${escapeHtml(r.title || 'Ohne Titel')} öffnen">
      ${recipeImageHtml(r, 'rrow-img', 'thumb')}
      <span class="rrow-body">
        <span class="rrow-title">${escapeHtml(r.title || 'Ohne Titel')}</span>
        <span class="rrow-meta">${escapeHtml(recipeMetaLine(r, true))}${isUncooked(r) ? ' · noch nicht gekocht' : ''}</span>
      </span>
    </button>
    ${favButton(r, 'rrow-fav')}
  </article>`;
}
function recentCard(r) {
  return `<article class="recent-card">
    <button type="button" class="recent-main" data-action="open-recipe" data-id="${r.id}" aria-label="${escapeHtml(r.title || 'Ohne Titel')} öffnen">
      ${recipeImageHtml(r, 'recent-img', 'thumb')}
      <span class="recent-body">
        <span class="recent-title">${escapeHtml(r.title || 'Ohne Titel')}</span>
        <span class="recent-meta">${escapeHtml(recipeMetaLine(r, true))}</span>
      </span>
    </button>
    ${favButton(r, 'recent-fav')}
  </article>`;
}
function emptyState() {
  return `<div class="empty-state">
    ${ICONS.bookOpen}
    <h2>Dein Kochbuch ist noch leer</h2>
    <p>Trag dein erstes Rezept ein oder übernimm eines aus einem kopierten Text.</p>
    <div class="empty-actions">
      <button class="primary-btn" data-action="new-recipe">${ICONS.plus} Erstes Rezept eintragen</button>
      <button class="ghost-btn" data-action="open-paste-import">${ICONS.sparkle} Aus Text importieren</button>
    </div>
    <ol class="empty-steps" aria-label="So geht es weiter">
      <li><b>Rezepte sammeln.</b> Von Hand eintragen oder Text aus WhatsApp, Instagram und Webseiten einfügen.</li>
      <li><b>Woche planen.</b> Rezepte auf Tage legen, die Einkaufsliste entsteht daraus.</li>
      <li><b>Kochen.</b> Im Kochmodus siehst du einen Schritt nach dem anderen, mit Timern.</li>
    </ol>
  </div>`;
}
function homeView() {
  const list = applyAllFilters(state.recipes);
  const filterCount = activeStructuredFilterCount() + (state.activeTag ? 1 : 0);
  const collectionActive = state.favOnly || (state.activeCollection && state.activeCollection !== 'all');
  const isFiltered = !!(state.query.trim() || filterCount || collectionActive);
  const chips = [];
  state.activeFilters.dietary.forEach(id => chips.push({ dim: 'dietary', id, label: categoryLabelFor(id) }));
  state.activeFilters.category.forEach(id => chips.push({ dim: 'category', id, label: categoryLabelFor(id) }));
  state.activeFilters.time.forEach(id => chips.push({ dim: 'time', id, label: (TIME_BUCKET_OPTIONS.find(t => t.id === id) || {}).label || id }));

  let content;
  if (!state.recipes.length) content = emptyState();
  else if (!list.length) content = emptyFilterState();
  else {
    const recent = (!isFiltered && state.recipes.length >= 4) ? state.recipes[0] : null; // state.recipes ist nach updatedAt sortiert; erst ab 4 Rezepten, sonst doppelt es die Liste darunter
    const items = state.homeLayout === 'list' ? `<div class="rlist">${list.map(recipeRow).join('')}</div>` : `<div class="rgrid">${list.map(recipeCard).join('')}</div>`;
    content = `
      ${recent ? `<section class="home-section" aria-labelledby="recent-h"><h2 class="section-title" id="recent-h">Zuletzt bearbeitet</h2>${recentCard(recent)}</section>` : ''}
      <section class="home-section" aria-labelledby="all-h">
        <div class="section-title-row">
          <h2 class="section-title" id="all-h">${isFiltered ? `${list.length} Treffer` : 'Alle Rezepte'}</h2>
          <div class="layout-toggle" role="group" aria-label="Darstellung">
            <button type="button" class="icon-toggle ${state.homeLayout !== 'list' ? 'is-active' : ''}" data-action="set-home-layout" data-id="grid" aria-pressed="${state.homeLayout !== 'list'}" aria-label="Rasteransicht">${ICONS.grid}</button>
            <button type="button" class="icon-toggle ${state.homeLayout === 'list' ? 'is-active' : ''}" data-action="set-home-layout" data-id="list" aria-pressed="${state.homeLayout === 'list'}" aria-label="Listenansicht">${ICONS.list}</button>
          </div>
        </div>
        ${items}
      </section>`;
  }

  return `
    <header class="topbar topbar--home">
      <div class="topbar-left"><div class="brand-v2"><span class="brand-word">savora</span></div></div>
      <div class="topbar-actions">
        <button class="round-btn" data-action="focus-search" aria-label="Suchen">${ICONS.search}</button>
        <button class="round-btn round-btn--accent" data-action="open-add-menu" aria-label="Rezept hinzufügen">${ICONS.plus}</button>
      </div>
    </header>
    <main class="has-tabbar home-main">
      ${state.cookbookTitle ? `<p class="page-eyebrow">${escapeHtml(state.cookbookTitle)}</p>` : ''}
      ${pageTitle('Deine Rezepte')}
      <div class="search-field">
        ${ICONS.search}
        <label for="searchInput" class="sr-only">Rezepte, Zutaten, Tags durchsuchen</label>
        <input class="search-input" id="searchInput" type="search" enterkeyhint="search" placeholder="Rezepte, Zutaten, Tags durchsuchen …" value="${escapeHtml(state.query)}" autocomplete="off">
      </div>
      ${(() => { const n = backupNudgeInfo(); return n ? `<div class="nudge-card" role="note">
        <div class="nudge-text"><b>${n.never ? 'Noch keine Sicherung' : 'Letzte Sicherung vor ' + n.days + ' Tagen'}</b><span>Sichere deine Rezepte, damit bei einem Gerätewechsel nichts verloren geht.</span></div>
        <div class="nudge-actions"><button class="outline-btn outline-btn--small" data-action="goto-view" data-view="settings-backup">Sichern</button><button class="text-btn" data-action="backup-nudge-dismiss">Später</button></div></div>` : ''; })()}
      ${state.recipes.length ? `<div class="chip-row" role="group" aria-label="Sammlungen">
        ${collectionChips()}
        <button type="button" class="chip chip--icon ${filterCount ? 'chip--active' : ''}" data-action="open-filter-sheet" aria-label="Weitere Filter${filterCount ? ', ' + filterCount + ' aktiv' : ''}">${ICONS.sliders}${filterCount ? `<span class="chip-count">${filterCount}</span>` : ''}</button>
      </div>` : ''}
      ${(chips.length || state.activeTag) ? `<div class="chip-row chip-row--active">
        ${state.activeTag ? `<button class="chip chip--removable" data-action="filter-tag" data-tag="">${escapeHtml(state.activeTag)} ${ICONS.x}</button>` : ''}
        ${chips.map(c => `<button class="chip chip--removable" data-action="remove-active-filter" data-dim="${c.dim}" data-id="${escapeHtml(c.id)}" aria-label="Filter ${escapeHtml(c.label)} entfernen">${escapeHtml(c.label)} ${ICONS.x}</button>`).join('')}
        <button class="chip chip--ghost" data-action="clear-all-filters">Alle löschen</button>
      </div>` : ''}
      ${content}
    </main>
    ${bottomNav()}
    ${filterSheetModal()}
    ${addMenuModal()}
  `;
}

/* ---------- Rezeptdetail ---------- */
function dietChipsHtml(r) {
  const out = [];
  (r.diet || []).forEach(dk => {
    const d = DIET_OPTIONS.find(o => o.key === dk);
    if (!d || (dk === 'vegetarisch' && r.diet.includes('vegan'))) return;
    out.push(`<span class="meta-chip">${ICONS[d.icon] || ''}${escapeHtml(d.label)}</span>`);
  });
  (r.categoryTags || []).forEach(c => out.push(`<span class="meta-chip meta-chip--soft">${escapeHtml(categoryLabelFor(c))}</span>`));
  (r.tags || []).forEach(t => out.push(`<span class="meta-chip meta-chip--soft">#${escapeHtml(t)}</span>`));
  return out.length ? `<div class="meta-chip-row">${out.join('')}</div>` : '';
}
function ingredientsPanel(r) {
  const servings = currentServings(r);
  const factor = servings / (r.servings || 1);
  const checked = checkedSetFor(r.id);
  const groups = getIngredientGroups(r);
  const showTitles = groups.length > 1 || (groups[0] && groups[0].title !== 'Zutaten');
  return `<div class="amount-row">
      <span class="amount-row-label">Menge</span>
      <div class="stepper" role="group" aria-label="Menge anpassen">
        <button data-action="serv-dec" data-id="${r.id}" aria-label="Weniger">${ICONS.minus}</button>
        <span class="stepper-value" aria-live="polite">${escapeHtml(servingLabel(r, servings))}</span>
        <button data-action="serv-inc" data-id="${r.id}" aria-label="Mehr">${ICONS.plus}</button>
      </div>
    </div>
    ${servings !== (r.servings || 1) ? `<p class="hint-line">Original: ${escapeHtml(servingLabel(r, r.servings || 1))}. Mengen werden immer vom Original berechnet.</p>` : ''}
    ${groups.length ? groups.map(g => `<section class="ing-group">
      ${showTitles ? `<h3 class="ing-group-title">${escapeHtml(g.title)}</h3>` : ''}
      <ul class="ing-list">
        ${g.ingredients.map(i => {
          const isChecked = checked.has(i._index);
          const amt = scaledAmountText(i, factor);
          return `<li><button type="button" class="ing-check ${isChecked ? 'is-checked' : ''}" data-action="toggle-ingredient-check" data-id="${r.id}" data-idx="${i._index}" role="checkbox" aria-checked="${isChecked}">
            <span class="check-box" aria-hidden="true">${ICONS.check}</span>
            <span class="ing-amount">${escapeHtml(amt)}${amt && i.unit ? ' ' + escapeHtml(i.unit) : (!amt && i.unit ? escapeHtml(i.unit) : '')}</span>
            <span class="ing-name">${escapeHtml(i.name)}</span>
          </button></li>`;
        }).join('')}
      </ul>
    </section>`).join('') : `<p class="hint-line">Noch keine Zutaten erfasst.</p>`}
    ${checked.size ? `<button class="text-btn" data-action="reset-ingredient-checks" data-id="${r.id}">Häkchen zurücksetzen</button>` : ''}`;
}
function stepsPanel(r) {
  const entries = stepEntries(r);
  if (!entries.length) return `<p class="hint-line">Noch keine Zubereitungsschritte erfasst.</p>`;
  let n = 0;
  return `<ol class="step-list-v2">${entries.map(e => e.heading
    ? `<li class="step-heading"><h3>${escapeHtml(String(e.text).trim().replace(/:$/, ''))}</h3></li>`
    : `<li><span class="step-no" aria-hidden="true">${++n}</span><p>${escapeHtml(e.text)}</p></li>`).join('')}</ol>`;
}
function notesPanel(r) {
  const log = (r.cookLog || []).slice().sort((a, b) => (b.date || 0) - (a.date || 0));
  return `${r.notes ? `<div class="note-card"><h3 class="note-card-title">Notiz</h3><p>${escapeHtml(r.notes)}</p></div>` : ''}
    ${log.map(n => `<div class="note-card note-card--dated">
      <div class="note-card-head"><span class="note-date">${new Date(n.date).toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
      <button class="icon-btn icon-btn--small" data-action="delete-cook-note" data-id="${r.id}" data-note="${escapeHtml(n.id)}" aria-label="Notiz vom ${new Date(n.date).toLocaleDateString('de-CH')} löschen">${ICONS.trash}</button></div>
      <p>${escapeHtml(n.text)}</p></div>`).join('')}
    <button class="ghost-btn" data-action="open-note-modal" data-id="${r.id}">${ICONS.plus} Notiz hinzufügen</button>`;
}
function nutritionPanel(r) {
  let html = nutritionCardSection(r.id);
  if (servingMode(r) === 'pieces') html = html.replace(/pro Portion/g, 'pro Stück').replace(/Pro Portion/g, 'Pro Stück');
  return `<p class="estimate-note">${ICONS.info} Schätzung auf Basis der erkannten Zutaten. Fehlende oder unklare Mengen fliessen nicht als exakte Werte ein.</p>${html}`;
}
function detailView() {
  const r = state.recipes.find(x => x.id === state.activeRecipeId);
  if (!r) { state.view = 'home'; return homeView(); }
  const servings = currentServings(r);
  const hasNotes = !!(r.notes || (r.cookLog || []).length);
  const tabs = [
    { id: 'ingredients', label: 'Zutaten' },
    { id: 'steps', label: 'Zubereitung' },
  ];
  if (state.showNutrition) tabs.push({ id: 'nutrition', label: 'Nährwerte' });
  if (hasNotes) tabs.push({ id: 'notes', label: 'Notizen' });
  const tab = tabs.some(t => t.id === state.detailTab) ? state.detailTab : 'ingredients';
  // Alle Panels liegen im DOM, der Tabwechsel blendet nur um (kein Neuaufbau, kein Scrollsprung).
  const wide = !!(window.matchMedia && matchMedia('(min-width: 900px)').matches);   // breit: Zutaten stehen links (Seitenspalte) statt im Reiter, nie doppelt im DOM
  const ingHtml = ingredientsPanel(r);
  const panelHtml = { ingredients: wide ? '' : ingHtml, steps: stepsPanel(r), nutrition: state.showNutrition ? nutritionPanel(r) : '', notes: hasNotes ? notesPanel(r) : '' };
  const hero = r.image
    ? `<img class="hero-img" src="${r.image}" alt="${escapeHtml(r.title || '')}" style="view-transition-name: recipe-hero-img;">`
    : r.imageId
      ? `<div class="hero-img placeholder" data-lazy-img="full" data-image-id="${r.imageId}" data-img-class="hero-img" data-img-alt="${escapeHtml(r.title || '')}" style="view-transition-name: recipe-hero-img;">${placeholderInner(r)}</div>`
      : `<div class="hero-img placeholder ${placeholderClass(r)}" style="view-transition-name: recipe-hero-img;">${placeholderInner(r)}</div>`;
  const meta = [r.timeMinutes ? `${r.timeMinutes} Min.` : '', servingMode(r) === 'pieces' ? `${servings} Stück` : servingLabel(r, servings), r.difficulty || ''].filter(Boolean);
  const sourceText = r.sharedBy
    ? `${ICONS.sparkle}<span>Geteilt von ${escapeHtml(r.sharedBy)}</span>`
    : r.source ? `${ICONS.link}<span>Quelle: <a href="${escapeHtml(r.source)}" target="_blank" rel="noopener">${escapeHtml(domainFromUrl(r.source))}</a></span>`
    : textSourceHint(r) ? `${ICONS.link}<span>Quelle: ${escapeHtml(textSourceHint(r))}</span>` : '';   // eigene Rezepte: keine Zeile
  const tagChips = [];
  const conflicts = dietConflicts(r);
  const conflictLabels = new Set(conflicts.map(c => c.label));
  (r.diet || []).forEach(dk => { const d = DIET_OPTIONS.find(o => o.key === dk); if (d && !conflictLabels.has(dk) && !(dk === 'vegetarisch' && r.diet.includes('vegan'))) tagChips.push(d.label); });
  (r.categoryTags || []).forEach(c => tagChips.push(categoryLabelFor(c)));
  const source = (!sourceText && !tagChips.length) ? '' : `<div class="source-row">${sourceText ? `<p class="source-line">${sourceText}</p>` : ''}${tagChips.length ? `<span class="source-chips">${tagChips.slice(0, 2).map(t => `<span class="source-chip">${escapeHtml(t)}</span>`).join('')}</span>` : ''}</div>`;
  const conflictBox = conflicts.length ? `<div class="diet-warning" role="note">
      <strong>Kennzeichnung prüfen</strong>
      <p>${conflicts.map(c => `Als <b>${c.label === 'vegan' ? 'vegan' : 'vegetarisch'}</b> markiert, enthält aber: ${escapeHtml(Array.from(new Set(c.items)).slice(0, 4).join(', '))}${new Set(c.items).size > 4 ? ' …' : ''}.`).join(' ')}</p>
      <div class="diet-warning-actions"><button class="outline-btn outline-btn--small" data-action="fix-diet-conflict" data-id="${r.id}">Kennzeichnung entfernen</button><button class="text-btn" data-action="edit-recipe" data-id="${r.id}">Bearbeiten</button></div>
    </div>` : '';
  return `
    ${topbar(r.title || 'Rezept', { back: true, cls: 'topbar--detail', actions: `<button class="icon-btn" data-action="open-detail-menu" data-id="${r.id}" aria-label="Weitere Aktionen" aria-haspopup="dialog">${ICONS.more}</button>` })}
    <main class="has-tabbar detail-main" data-tab="${tab}">
      <div class="hero">${hero}</div>
      <div class="detail-cols"><div class="detail-col detail-col--info">
      <div class="detail-head">
        <div class="detail-title-row">
          <h2 class="detail-title-v2">${escapeHtml(r.title || 'Ohne Titel')}</h2>
          ${favButton(r, 'detail-fav')}
        </div>
        <p class="detail-meta-v2">${meta.map(escapeHtml).join('<span class="meta-sep" aria-hidden="true">•</span>')}</p>
      </div>
      <div class="detail-tools">
        <button class="outline-btn outline-btn--small" data-action="add-to-shopping" data-id="${r.id}">${ICONS.cart} Einkauf</button>
        <button class="outline-btn outline-btn--small" data-action="share-recipe" data-id="${r.id}">${ICONS.share} Teilen</button>
      </div>
      ${source}
      ${conflictBox}
      <div class="detail-aside-ing" aria-label="Zutaten">${wide ? ingHtml : ''}</div>
      </div><div class="detail-col detail-col--content">
      <div class="tabbar-v2" role="tablist" aria-label="Rezeptinhalt">
        ${tabs.map(t => `<button role="tab" id="tab-${t.id}" class="tab-v2 ${tab === t.id ? 'is-active' : ''}" aria-selected="${tab === t.id}" aria-controls="panel-${t.id}" tabindex="${tab === t.id ? '0' : '-1'}" data-action="set-detail-tab" data-id="${t.id}">${t.label}</button>`).join('')}
      </div>
      ${tabs.map(t => `<div class="tab-panel" id="panel-${t.id}" role="tabpanel" aria-labelledby="tab-${t.id}" ${tab === t.id ? '' : 'hidden'}>${panelHtml[t.id]}</div>`).join('')}
      </div></div>
    </main>
    <div class="cook-bar"><button class="primary-btn primary-btn--block" data-action="start-cook" data-id="${r.id}">${ICONS.play} Kochmodus starten</button></div>
    ${bottomNav()}
    ${state.modal && state.modal.type === 'delete' ? deleteModal(r) : ''}
    ${state.modal && state.modal.type === 'detail-menu' ? detailMenuModal(r) : ''}
    ${state.modal && state.modal.type === 'note' ? noteModal(r) : ''}
    ${state.modal && state.modal.type === 'collections' ? collectionsModal(r) : ''}
    ${state.modal && state.modal.type === 'shop-select' ? shopSelectModal() : ''}
    ${state.modal && state.modal.type === 'plan-recipe' ? planRecipeModal() : ''}
    ${nutritionModal(r)}
    ${nutritionDetailModal(r, state._nutritionDetailResult)}
    ${pdfExportModal()}
  `;
}
// Eine im Rezepttext vermerkte Quelle ("Quelle: kookmutsjes.com") wird angezeigt statt der
// Aussage "Aus deinem eigenen Kochbuch". Der Rezepttext selbst bleibt unveraendert.
function textSourceHint(r) {
  const hay = [r.notes || ''].concat((r.steps || []).map(s => s.text || '')).join('\n');
  const m = hay.match(/Quelle\s*:\s*([^\n]{2,80})/i);
  return m ? m[1].trim().replace(/[.\s]+$/, '') : '';
}
function sheet(id, title, body) {
  return `<div class="modal-backdrop" data-action="close-modal">
    <div class="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="${id}" tabindex="-1" onclick="event.stopPropagation()">
      <div class="sheet-handle" aria-hidden="true"></div>
      <h3 class="modal-title" id="${id}">${escapeHtml(title)}</h3>
      ${body}
    </div>
  </div>`;
}
function detailMenuModal(r) {
  const item = (action, icon, label, extra) => `<button class="menu-item ${extra || ''}" data-action="${action}" data-id="${r.id}">${icon}<span>${label}</span></button>`;
  return sheet('detail-menu-title', r.title || 'Rezept', `<div class="menu-list">
    ${item('edit-recipe', ICONS.edit, 'Bearbeiten')}
    ${item('duplicate-recipe', ICONS.copy, 'Duplizieren')}
    ${item('export-pdf', ICONS.pdf, 'Als PDF exportieren')}
    ${item('share-recipe', ICONS.share, 'Teilen')}
    ${item('add-to-cookbook', ICONS.bookOpen, 'Zum Kochbuch hinzufügen')}
    ${item('open-collections-modal', ICONS.folder, 'Zu Sammlung hinzufügen')}
    ${item('open-plan-recipe', ICONS.calendar, 'In den Wochenplan')}
    ${item('open-note-modal', ICONS.note, 'Notiz hinzufügen')}
    ${item('confirm-delete', ICONS.trash, 'Löschen', 'menu-item--danger')}
  </div>`);
}
function noteModal(r) {
  return sheet('note-title', 'Notiz hinzufügen', `
    <div class="field"><label for="noteText">Notiz zu „${escapeHtml(r.title || 'Rezept')}“</label>
    <textarea id="noteText" rows="4" placeholder="z.B. Beim nächsten Mal weniger Salz"></textarea></div>
    <label class="check-line"><input type="checkbox" id="noteDated" checked> Mit heutigem Datum als Kochnotiz speichern</label>
    <p class="hint-line">Ohne Datum wird der Text an die allgemeine Rezeptnotiz angehängt.</p>
    <div class="form-actions"><button class="ghost-btn" data-action="close-modal">Abbrechen</button><button class="primary-btn" data-action="save-note" data-id="${r.id}">Speichern</button></div>`);
}
function collectionsModal(r) {
  const cols = getCollections();
  return sheet('col-title', 'Sammlungen', `
    <div class="menu-list">
      ${cols.length ? cols.map(c => {
        const on = (r.collections || []).includes(c.id);
        return `<button class="menu-item" data-action="toggle-recipe-collection" data-id="${r.id}" data-col="${escapeHtml(c.id)}" role="checkbox" aria-checked="${on}"><span class="check-box ${on ? 'is-on' : ''}" aria-hidden="true">${ICONS.check}</span><span>${escapeHtml(c.name)}</span></button>`;
      }).join('') : '<p class="hint-line">Noch keine eigene Sammlung angelegt.</p>'}
    </div>
    <div class="inline-add">
      <label for="newCollectionName" class="sr-only">Neue Sammlung</label>
      <input id="newCollectionName" type="text" placeholder="Neue Sammlung, z.B. Sonntagsküche">
      <button class="primary-btn" data-action="create-collection" data-id="${r.id}">Anlegen</button>
    </div>`);
}

/* ---------- Auswahl-Sheet: Zutaten in den Einkauf ---------- */
function shopSelectModal() {
  const m = state.modal;
  const byRecipe = {};
  m.items.forEach(it => { (byRecipe[it.recipeId] = byRecipe[it.recipeId] || []).push(it); });
  const multi = Object.keys(byRecipe).length > 1;
  return sheet('shop-select-title', 'In den Einkauf übernehmen', `
    <p class="hint-line">Wähle, was du wirklich brauchst. Gleiche Zutaten mit passender Einheit werden zusammengeführt.</p>
    <div class="shop-select-list">
      ${Object.entries(byRecipe).map(([rid, list]) => `
        ${multi ? `<h4 class="shop-select-recipe">${escapeHtml(list[0].title)}</h4>` : ''}
        ${list.map(it => `<label class="shop-select-row"><input type="checkbox" data-shop-key="${escapeHtml(it.key)}" ${it.selected ? 'checked' : ''}>
          <span class="ing-amount">${it.amount !== '' ? escapeHtml(kitchenAmount(it.amount, it.unit)) + (it.unit ? ' ' + escapeHtml(it.unit) : '') : escapeHtml(it.unit || '')}</span>
          <span class="ing-name">${escapeHtml(it.name)}</span></label>`).join('')}
      `).join('')}
    </div>
    <div class="form-actions"><button class="ghost-btn" data-action="close-modal">Abbrechen</button><button class="primary-btn" data-action="confirm-shop-select">Hinzufügen</button></div>`);
}

/* ---------- Kochmodus ---------- */
function cookModeView() {
  const r = state.recipes.find(x => x.id === state.activeRecipeId);
  if (!r) { state.view = 'home'; return homeView(); }
  const steps = cookSteps(r);
  const checked = checkedSetFor(r.id);
  if (state.cookFinished) {
    return `<div class="cookmode-overlay cook-v2" role="main" aria-label="Kochmodus">
      <div class="cookmode-top"><button class="icon-btn" data-action="exit-cook" aria-label="Kochmodus verlassen">${ICONS.x}</button><span></span><span class="cook-top-spacer"></span></div>
      <div class="cookmode-body cook-finish-v2">
        ${ICONS.sparkle}
        <h2>Guten Appetit.</h2>
        <p>${escapeHtml(r.title)} ist fertig.</p>
        <div class="field cook-note-field"><label for="cookRunNote">Notiz zu diesem Kochdurchgang (optional)</label>
          <textarea id="cookRunNote" rows="3" placeholder="z.B. 15 Minuten länger backen"></textarea></div>
      </div>
      <div class="cookmode-nav">
        <button data-action="exit-cook">Später</button>
        <button class="primary" data-action="cook-complete" data-id="${r.id}">Als gekocht speichern</button>
      </div>
    </div>`;
  }
  const total = Math.max(steps.length, 1);
  const idx = Math.min(state.cookStepIndex, total - 1);
  const step = steps[idx] || { text: 'Für dieses Rezept sind noch keine Schritte erfasst.' };
  const isLast = idx >= total - 1;
  const match = step._sourceIndex !== undefined ? stepIngredientMatch(r, step) : { items: [], fixed: false, ambiguous: false };
  const stepIngs = match.items;
  const groupsById = new Map(); getIngredientGroups(r).forEach(g => g.ingredients.forEach(i => groupsById.set(i._index, g.title)));
  const shownIngs = state.cookShowAllIngredients ? realIngredients(r).map(i => { const idx = r.ingredients.indexOf(i); return { ...i, _index: idx, _group: groupsById.get(idx) }; }) : stepIngs;
  const showGroups = hasNamedGroups(r);
  const factor = currentServings(r) / (r.servings || 1);
  const ingChips = shownIngs.map(i => `<button type="button" class="cook-ing ${checked.has(i._index) ? 'is-checked' : ''} ${i._ambiguous ? 'is-ambiguous' : ''}" data-action="toggle-ingredient-check" data-id="${r.id}" data-idx="${i._index}" role="checkbox" aria-checked="${checked.has(i._index)}"><span class="check-box" aria-hidden="true">${ICONS.check}</span>${escapeHtml(scaledAmountText(i, factor))}${i.unit ? ' ' + escapeHtml(i.unit) : ''} ${escapeHtml(i.name)}${showGroups && i._group && (i._ambiguous || state.cookShowAllIngredients) ? `<span class="cook-ing-group">${escapeHtml(i._group)}</span>` : ''}</button>`).join('');
  const matchNote = state.cookShowAllIngredients ? '' : match.fixed ? 'Von dir festgelegt' : match.ambiguous ? 'Vorschlag, nicht eindeutig' : (stepIngs.length ? 'Vorschlag' : '');
  const body = state.cookAllSteps
    ? `<ol class="cook-all-steps">${steps.map((s, n) => `<li>${s._section ? `<div class="cook-section">${escapeHtml(s._section)}</div>` : ''}<button class="cook-all-step ${n === idx ? 'is-current' : ''}" data-action="cook-goto" data-idx="${n}"><span class="step-no">${n + 1}</span><span>${escapeHtml(s.text)}</span></button></li>`).join('')}</ol>`
    : `<div class="cook-step-card">
        ${step._section ? `<div class="cook-section">${escapeHtml(step._section)}</div>` : ''}
        <div class="cookmode-steptext">${renderStepWithTimers(step.text, idx)}</div>
      </div>
      <div class="cook-ings">
        <div class="cook-ings-head"><span>${state.cookShowAllIngredients ? 'Alle Zutaten' : (stepIngs.length ? 'Für diesen Schritt' : 'Keine Zutat im Schritt erkannt')}${matchNote ? ` <span class="cook-match-note">· ${matchNote}</span>` : ''}</span>
          <span class="cook-ings-actions">${!state.cookShowAllIngredients && step._sourceIndex !== undefined ? `<button class="text-btn" data-action="cook-edit-step-ings" data-idx="${step._sourceIndex}">Anpassen</button>` : ''}<button class="text-btn" data-action="cook-toggle-all-ings">${state.cookShowAllIngredients ? 'Nur dieser Schritt' : 'Alle Zutaten'}</button></span></div>
        ${ingChips ? `<div class="cook-ing-list">${ingChips}</div>` : ''}
      </div>`;
  const refModal = state.modal && state.modal.type === 'step-ings' ? stepIngredientsModal(r, state.modal.stepIndex) : '';
  const scaleLabel = ['Normal', 'Gross', 'Sehr gross'][state.cookScale || 0];
  return `${refModal}<div class="cookmode-overlay cook-v2 cook-scale-${state.cookScale || 0}" role="main" aria-label="Kochmodus">
    <div class="cookmode-top">
      <button class="icon-btn" data-action="exit-cook" aria-label="Kochmodus verlassen">${ICONS.x}</button>
      <span class="cookmode-progress" aria-live="polite">Schritt ${idx + 1} von ${total}</span>
      <div class="cook-top-actions">
        <button class="icon-btn cook-font-btn" data-action="cook-font" aria-label="Schriftgrösse ändern, aktuell ${scaleLabel}"><span aria-hidden="true">Aa</span></button>
        <button class="icon-btn ${state.cookAllSteps ? 'is-active' : ''}" data-action="cook-toggle-all-steps" aria-pressed="${state.cookAllSteps}" aria-label="Alle Schritte anzeigen">${ICONS.listSteps}</button>
        <button class="icon-btn" data-action="toggle-voice" aria-pressed="${!!state.voiceEnabled}" aria-label="Schritte vorlesen">${state.voiceEnabled ? ICONS.volume : ICONS.volumeOff}</button>
      </div>
    </div>
    <div class="cook-progress" aria-hidden="true"><span style="width:${Math.round(((idx + 1) / total) * 100)}%"></span></div>
    <div class="cook-title-line">${escapeHtml(r.title)}${state.wakeLock ? `<span class="wakelock-chip">${ICONS.sun} Bildschirm bleibt an</span>` : (state.wakeLockUnsupported ? `<span class="wakelock-chip wakelock-chip--off">Bildschirm kann ausgehen</span>` : '')}</div>
    <div class="cookmode-body">${body}</div>
    <div class="cook-timerbar" id="cookTimerBar" role="group" aria-label="Laufende Timer" ${cookTimerBarHtml(r) ? '' : 'hidden'}>${cookTimerBarHtml(r)}</div>
    <div class="cookmode-nav">
      <button data-action="cook-prev" ${idx === 0 ? 'disabled' : ''}>Zurück</button>
      <button class="primary" data-action="${isLast ? 'cook-finish' : 'cook-next'}">${isLast ? 'Fertig' : 'Weiter'}</button>
    </div>
  </div>`;
}

function stepIngredientsModal(r, stepIndex) {
  const step = (r.steps || [])[stepIndex];
  if (!step) return '';
  const current = new Set(stepIngredientMatch(r, step).items.map(i => i._index));
  const groups = getIngredientGroups(r);
  const showTitles = hasNamedGroups(r);
  return `<div class="modal-backdrop modal-backdrop--top" data-action="close-modal">
    <div class="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="step-ings-title" tabindex="-1" onclick="event.stopPropagation()">
      <div class="sheet-handle" aria-hidden="true"></div>
      <h3 class="modal-title" id="step-ings-title">Zutaten für diesen Schritt</h3>
      <p class="hint-line">„${escapeHtml(String(step.text).slice(0, 90))}${String(step.text).length > 90 ? ' …' : ''}“</p>
      <div class="shop-select-list">
        ${groups.map(g => `${showTitles ? `<h4 class="shop-select-recipe">${escapeHtml(g.title)}</h4>` : ''}${g.ingredients.map(i => `<label class="shop-select-row"><input type="checkbox" data-step-ing="${i._index}" ${current.has(i._index) ? 'checked' : ''}><span class="ing-amount">${escapeHtml(String(i.amount || ''))}${i.unit ? ' ' + escapeHtml(i.unit) : ''}</span><span class="ing-name">${escapeHtml(i.name)}</span></label>`).join('')}`).join('')}
      </div>
      <p class="hint-line">Deine Auswahl wird gespeichert und ersetzt den automatischen Vorschlag. Mengen und Text bleiben unverändert.</p>
      <div class="form-actions">
        ${Array.isArray(step.ingredientRefs) ? `<button class="ghost-btn" data-action="reset-step-ings" data-idx="${stepIndex}">Automatisch</button>` : `<button class="ghost-btn" data-action="close-modal">Abbrechen</button>`}
        <button class="primary-btn" data-action="save-step-ings" data-idx="${stepIndex}">Speichern</button>
      </div>
    </div>
  </div>`;
}

/* ---------- Einkauf ---------- */
function shoppingItemRow(i) {
  const recipeTitles = Array.from(new Set((i.sources || []).map(s => s.title || (state.recipes.find(r => r.id === s.recipeId) || {}).title).filter(Boolean)));
  const amount = i.amount !== '' && i.amount !== undefined && i.amount !== null ? `${escapeHtml(typeof i.amount === 'number' ? kitchenAmount(i.amount, i.unit) : String(i.amount))}${i.unit ? ' ' + escapeHtml(i.unit) : ''}` : (i.unit ? escapeHtml(i.unit) : '');
  return `<div class="shop-row ${i.checked ? 'is-checked' : ''}">
    <button class="shop-check" data-action="toggle-shopping-item" data-id="${i.id}" role="checkbox" aria-checked="${!!i.checked}" aria-label="${escapeHtml(i.name)}"><span class="check-box" aria-hidden="true">${ICONS.check}</span></button>
    <div class="shop-text">
      <span class="shop-name">${amount ? `<strong>${amount}</strong> ` : ''}${escapeHtml(i.name)}</span>
      ${recipeTitles.length ? `<span class="shop-source">${recipeTitles.length > 1 ? 'aus ' + recipeTitles.length + ' Rezepten: ' : 'aus '}${escapeHtml(recipeTitles.join(', '))}</span>` : ''}
    </div>
    <button class="icon-btn icon-btn--small" data-action="open-shop-item" data-id="${i.id}" aria-label="${escapeHtml(i.name)} bearbeiten">${ICONS.moreH}</button>
  </div>`;
}
function shoppingView() {
  const items = state.shopping;
  const open = items.filter(i => !i.checked && !i.have);
  const have = items.filter(i => !i.checked && i.have);
  const done = items.filter(i => i.checked);
  const grouped = {};
  open.forEach(i => { const s = shopSectionFor(i); (grouped[s] = grouped[s] || []).push(i); });
  const sections = SHOP_SECTIONS.filter(s => grouped[s]).map(s => `<section class="shop-section"><h2 class="shop-section-title">${escapeHtml(s)}</h2>${grouped[s].map(shoppingItemRow).join('')}</section>`).join('');
  const item = state.modal && state.modal.type === 'shop-item' ? state.shopping.find(x => x.id === state.modal.itemId) : null;
  return `
    ${topbar('Einkauf', { actions: items.length ? `<button class="icon-btn" data-action="share-shopping" aria-label="Liste teilen oder kopieren">${ICONS.share}</button><button class="icon-btn" data-action="clear-all-shopping" aria-label="Ganze Einkaufsliste leeren">${ICONS.trash}</button>` : '' })}
    <main class="has-tabbar">
      ${pageTitle('Einkaufsliste')}
      <div class="shop-add">
        <label for="shoppingAddInput" class="sr-only">Eigene Zutat hinzufügen</label>
        <input type="text" id="shoppingAddInput" placeholder="Eigene Zutat, z.B. 2 l Milch" enterkeyhint="done" autocomplete="off">
        <button class="round-btn round-btn--accent" data-action="add-shopping-item-manual" aria-label="Hinzufügen">${ICONS.plus}</button>
      </div>
      <div class="shop-quick"><button class="outline-btn" data-action="open-shop-from-recipes">${ICONS.book} Aus Rezepten</button><button class="outline-btn" data-action="nav-tab" data-view="mealplan">${ICONS.calendar} Aus dem Wochenplan</button></div>
      ${!items.length ? `<div class="empty-state">${ICONS.cart}<h2>Deine Einkaufsliste ist leer</h2><p>Übernimm Zutaten aus einem Rezept oder dem Wochenplan, oder tippe oben eine eigene Zutat ein.</p></div>` : `
        ${open.length ? sections : `<p class="shopping-all-checked">${ICONS.sparkle} Alles erledigt</p>`}
        ${have.length ? `<section class="shop-section shop-section--have"><h2 class="shop-section-title">Bereits vorhanden</h2>${have.map(shoppingItemRow).join('')}</section>` : ''}
        ${done.length ? `<section class="shop-section shop-section--done"><h2 class="shop-section-title">Erledigt</h2>${done.map(shoppingItemRow).join('')}
          <button class="ghost-btn shopping-clear-checked-btn" data-action="clear-checked-shopping">Erledigte entfernen</button></section>` : ''}`}
    </main>
    ${bottomNav()}
    ${item ? shopItemModal(item) : ''}
    ${state.modal && state.modal.type === 'pick-recipes' ? pickRecipesModal() : ''}
    ${state.modal && state.modal.type === 'shop-select' ? shopSelectModal() : ''}
  `;
}
function shopItemModal(i) {
  const canSplit = Array.isArray(i.sources) && i.sources.length > 1;
  return sheet('shop-item-title', i.name, `
    <div class="field-row field-row--3">
      <div class="field"><label for="shopEditAmount">Menge</label><input type="text" id="shopEditAmount" inputmode="decimal" value="${escapeHtml(i.amount === '' || i.amount == null ? '' : String(typeof i.amount === 'number' ? fmtAmount(i.amount) : i.amount))}"></div>
      <div class="field"><label for="shopEditUnit">Einheit</label><input type="text" id="shopEditUnit" value="${escapeHtml(i.unit || '')}"></div>
      <div class="field"><label for="shopEditSection">Bereich</label><select id="shopEditSection">${SHOP_SECTIONS.map(s => `<option ${shopSectionFor(i) === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label for="shopEditName">Bezeichnung</label><input type="text" id="shopEditName" value="${escapeHtml(i.name)}"></div>
    ${canSplit ? `<p class="hint-line">Zusammengeführt aus ${i.sources.length} Einträgen: ${escapeHtml(i.sources.map(s => `${s.amount !== '' ? fmtAmount(s.amount) : ''} ${s.unit || ''} ${s.title ? '(' + s.title + ')' : ''}`.trim()).join(', '))}</p>` : ''}
    <div class="menu-list">
      <button class="menu-item" data-action="toggle-shop-have" data-id="${i.id}">${ICONS.box}<span>${i.have ? 'Doch noch einkaufen' : 'Bereits vorhanden'}</span></button>
      ${canSplit ? `<button class="menu-item" data-action="split-shop-item" data-id="${i.id}">${ICONS.split}<span>Zusammenführung trennen</span></button>` : ''}
      <button class="menu-item menu-item--danger" data-action="delete-shopping-item" data-id="${i.id}">${ICONS.trash}<span>Entfernen</span></button>
    </div>
    <div class="form-actions"><button class="ghost-btn" data-action="close-modal">Abbrechen</button><button class="primary-btn" data-action="save-shop-item" data-id="${i.id}">Speichern</button></div>`);
}
function pickRecipesModal() {
  const sel = state.modal.selected || [];
  return sheet('pick-recipes-title', 'Rezepte wählen', `
    <div class="picker-list">
      ${state.recipes.map(r => `<label class="shop-select-row"><input type="checkbox" data-pick-recipe="${r.id}" ${sel.includes(r.id) ? 'checked' : ''}><span class="ing-name">${escapeHtml(r.title || 'Ohne Titel')}</span><span class="ing-amount">${escapeHtml(servingShort(r, r.servings || 1))}</span></label>`).join('') || '<p class="hint-line">Noch keine Rezepte vorhanden.</p>'}
    </div>
    <div class="form-actions"><button class="ghost-btn" data-action="close-modal">Abbrechen</button><button class="primary-btn" data-action="confirm-pick-recipes">Weiter</button></div>`);
}

/* ---------- Wochenplan ---------- */
function mealplanView() {
  if (!state.recipes.length) {
    return `${topbar('Wochenplan')}
      <main class="has-tabbar">${pageTitle('Wochenplan')}<div class="empty-state">${ICONS.calendar}<h2>Noch keine Rezepte für den Wochenplan</h2><p>Trag zuerst ein paar Rezepte ein, dann kannst du sie hier auf die Tage verteilen.</p><button class="primary-btn" data-action="new-recipe">${ICONS.plus} Erstes Rezept eintragen</button></div></main>${bottomNav()}`;
  }
  const days = Array.from({ length: 7 }, (_, i) => addDays(state.weekStart, i));
  const todayKey = fmtDateKey(new Date());
  const weekEnd = days[6];
  const label = state.weekStart.getMonth() === weekEnd.getMonth()
    ? `${state.weekStart.getDate()}. – ${weekEnd.getDate()}. ${MONTH_LABELS[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`
    : `${state.weekStart.getDate()}. ${MONTH_LABELS[state.weekStart.getMonth()]} – ${weekEnd.getDate()}. ${MONTH_LABELS[weekEnd.getMonth()]}`;
  let weekHasEntries = false;
  const dayCards = days.map((d, idx) => {
    const key = fmtDateKey(d);
    const entries = planEntriesFor(key).filter(e => state.recipes.some(r => r.id === e.recipeId));
    if (entries.length) weekHasEntries = true;
    const selected = state.planSelectedDays.has(key);
    const order = ['breakfast', 'lunch', 'dinner'];
    const sorted = entries.slice().sort((a, b) => { const ia = order.indexOf(a.meal), ib = order.indexOf(b.meal); return (ia < 0 ? 9 : ia) - (ib < 0 ? 9 : ib); });
    return `<section class="day-card ${key === todayKey ? 'is-today' : ''}" aria-labelledby="day-${key}">
      <div class="day-card-head">
        <h2 class="day-card-title" id="day-${key}">${WEEKDAY_LABELS[idx]} <span class="day-card-date">${d.getDate()}. ${MONTH_LABELS[d.getMonth()]}</span></h2>
        ${entries.length ? `<label class="day-select"><input type="checkbox" data-plan-day="${key}" ${selected ? 'checked' : ''}> Einkaufen</label>` : ''}
      </div>
      ${sorted.map(e => {
        const r = state.recipes.find(x => x.id === e.recipeId);
        const servings = e.servings || r.servings || 1;
        return `<div class="plan-entry">
          <button class="plan-entry-main" data-action="open-recipe" data-id="${r.id}">
            ${recipeImageHtml(r, 'plan-thumb', 'thumb')}
            <span class="plan-entry-text">${e.meal ? `<span class="plan-meal">${escapeHtml(mealLabel(e.meal))}</span>` : ''}<span class="plan-title">${escapeHtml(r.title || 'Ohne Titel')}</span><span class="plan-servings">${escapeHtml(servingLabel(r, servings))}</span></span>
          </button>
          <button class="icon-btn icon-btn--small" data-action="open-plan-entry" data-date="${key}" data-id="${escapeHtml(e.id)}" aria-label="Eintrag ${escapeHtml(r.title || '')} bearbeiten">${ICONS.moreH}</button>
        </div>`;
      }).join('')}
      <button class="day-add-btn" data-action="open-day-picker" data-date="${key}">${ICONS.plus} Rezept planen</button>
    </section>`;
  }).join('');
  const selCount = Array.from(state.planSelectedDays).filter(k => days.some(d => fmtDateKey(d) === k)).length;
  return `
    ${topbar('Wochenplan')}
    <main class="has-tabbar">
      ${pageTitle('Wochenplan')}
      <div class="week-nav">
        <button data-action="week-prev" aria-label="Vorherige Woche">${ICONS.chevronLeft}</button>
        <span class="week-nav-label">${label}</span>
        <button data-action="week-next" aria-label="Nächste Woche">${ICONS.chevronRight}</button>
      </div>
      ${dayCards}
      <button class="primary-btn primary-btn--block" data-action="mealplan-to-shopping" ${weekHasEntries ? '' : 'disabled'}>${ICONS.cart} ${selCount ? `Zutaten von ${selCount} Tag${selCount === 1 ? '' : 'en'} einkaufen` : 'Zutaten der Woche einkaufen'}</button>
    </main>
    ${bottomNav()}
    ${state.modal && state.modal.type === 'pick-recipe' ? recipePickerModal() : ''}
    ${state.modal && state.modal.type === 'plan-entry' ? planEntryModal() : ''}
    ${state.modal && state.modal.type === 'shop-select' ? shopSelectModal() : ''}
  `;
}
function mealSlotChooser(current, customValue) {
  const isCustom = current && !MEAL_SLOTS.some(m => m.id === current);
  return `<div class="chip-row chip-row--wrap" role="radiogroup" aria-label="Mahlzeit">
      ${MEAL_SLOTS.map(m => `<button type="button" class="chip ${current === m.id ? 'chip--active' : ''}" role="radio" aria-checked="${current === m.id}" data-action="set-plan-meal" data-id="${m.id}">${m.label}</button>`).join('')}
    </div>
    <div class="field"><label for="planMealCustom">Eigene Bezeichnung (optional)</label><input id="planMealCustom" type="text" placeholder="z.B. Znüni oder Gäste" value="${escapeHtml(isCustom ? current : (customValue || ''))}"></div>`;
}
function recipePickerModal() {
  const m = state.modal;
  const [y, mo, d] = m.date.split('-').map(Number);
  const labelDate = new Date(y, mo - 1, d).toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' });
  return sheet('picker-modal-title', `Planen für ${labelDate}`, `
    ${mealSlotChooser(m.meal || '')}
    <div class="picker-list">
      ${state.recipes.map(r => `<button class="picker-item" data-action="assign-mealplan-recipe" data-date="${m.date}" data-id="${r.id}">${recipeImageHtml(r, 'picker-thumb', 'thumb')}<span>${escapeHtml(r.title || 'Ohne Titel')}</span></button>`).join('')}
    </div>`);
}
function planEntryModal() {
  const m = state.modal;
  const e = planEntriesFor(m.date).find(x => x.id === m.entryId);
  if (!e) return '';
  const r = state.recipes.find(x => x.id === e.recipeId) || { title: '', servings: 1 };
  const servings = e.servings || r.servings || 1;
  const days = Array.from({ length: 7 }, (_, i) => addDays(state.weekStart, i));
  return sheet('plan-entry-title', r.title || 'Eintrag', `
    <div class="amount-row"><span class="amount-row-label">Menge für diesen Termin</span>
      <div class="stepper"><button data-action="plan-entry-servings" data-delta="-1" aria-label="Weniger">${ICONS.minus}</button><span class="stepper-value">${escapeHtml(servingLabel(r, servings))}</span><button data-action="plan-entry-servings" data-delta="1" aria-label="Mehr">${ICONS.plus}</button></div></div>
    <p class="hint-line">Das Rezept selbst bleibt bei ${escapeHtml(servingLabel(r, r.servings || 1))}.</p>
    ${mealSlotChooser(e.meal || '')}
    <div class="field"><label for="planMoveDay">Verschieben auf</label><select id="planMoveDay">${days.map((d, i) => { const k = fmtDateKey(d); return `<option value="${k}" ${k === m.date ? 'selected' : ''}>${WEEKDAY_LABELS[i]}, ${d.getDate()}. ${MONTH_LABELS[d.getMonth()]}</option>`; }).join('')}</select></div>
    <div class="form-actions">
      <button class="ghost-btn danger-btn" data-action="remove-plan-entry">Entfernen</button>
      <button class="primary-btn" data-action="save-plan-entry">Speichern</button>
    </div>`);
}
// Aus der Rezeptdetailansicht: Rezept einem Tag der aktuellen Woche zuordnen.
function planRecipeModal() {
  const m = state.modal;
  const days = Array.from({ length: 7 }, (_, i) => addDays(getMonday(new Date()), i));
  return sheet('plan-recipe-title', 'In den Wochenplan', `
    ${mealSlotChooser(m.meal || '')}
    <div class="menu-list">${days.map((d, i) => `<button class="menu-item" data-action="assign-mealplan-recipe" data-date="${fmtDateKey(d)}" data-id="${m.recipeId}">${ICONS.calendar}<span>${WEEKDAY_LABELS[i]}, ${d.getDate()}. ${MONTH_LABELS[d.getMonth()]}</span></button>`).join('')}</div>`);
}

/* ---------- Kochbuch-Designer ---------- */
function cookbookDesignerView() {
  const cfg = getCookbookConfig();
  const byId = Object.fromEntries(state.recipes.map(r => [r.id, r]));
  const inBook = new Set(cfg.items.map(it => it.recipeId));
  const missing = state.recipes.filter(r => !inBook.has(r.id));
  const warnings = cookbookWarnings(cfg);
  const withImage = state.recipes.filter(r => r.image || r.imageId);
  return `
    ${topbar('Kochbuch gestalten', { back: true })}
    <main class="has-tabbar cookbook-main">
      <section class="panel">
        <h2 class="section-title">1. Titel und Cover</h2>
        <div class="field"><label for="cbTitle">Titel</label><input type="text" id="cbTitle" data-cb-field="title" value="${escapeHtml(cfg.title || '')}" placeholder="${escapeHtml(state.cookbookTitle || 'Mein persönliches Kochbuch')}"></div>
        <div class="field"><label for="cbSubtitle">Untertitel</label><input type="text" id="cbSubtitle" data-cb-field="subtitle" value="${escapeHtml(cfg.subtitle || '')}" placeholder="z.B. Lieblingsrezepte 2026"></div>
        <div class="field"><label for="cbCover">Titelbild</label><select id="cbCover" data-cb-field="coverRecipeId"><option value="">Ohne Bild (nur Logo)</option>${withImage.map(r => `<option value="${r.id}" ${cfg.coverRecipeId === r.id ? 'selected' : ''}>${escapeHtml(r.title || 'Ohne Titel')}</option>`).join('')}</select></div>
      </section>
      <section class="panel">
        <h2 class="section-title">2. Kapitel</h2>
        ${cfg.chapters.map((c, n) => `<div class="cb-chapter"><input type="text" aria-label="Kapitelname" data-cb-chapter="${escapeHtml(c.id)}" value="${escapeHtml(c.name)}">
          <button class="icon-btn icon-btn--small" data-action="cb-move-chapter" data-id="${escapeHtml(c.id)}" data-delta="-1" ${n === 0 ? 'disabled' : ''} aria-label="Kapitel nach oben">${ICONS.arrowUp}</button>
          <button class="icon-btn icon-btn--small" data-action="cb-move-chapter" data-id="${escapeHtml(c.id)}" data-delta="1" ${n === cfg.chapters.length - 1 ? 'disabled' : ''} aria-label="Kapitel nach unten">${ICONS.arrowDown}</button>
          <button class="icon-btn icon-btn--small" data-action="cb-delete-chapter" data-id="${escapeHtml(c.id)}" aria-label="Kapitel ${escapeHtml(c.name)} löschen">${ICONS.trash}</button></div>`).join('') || '<p class="hint-line">Ohne Kapitel erscheinen alle Rezepte in einer Liste.</p>'}
        <div class="inline-add"><label for="cbNewChapter" class="sr-only">Neues Kapitel</label><input type="text" id="cbNewChapter" placeholder="Neues Kapitel, z.B. Hauptgänge"><button class="primary-btn" data-action="cb-add-chapter">Anlegen</button></div>
      </section>
      <section class="panel">
        <h2 class="section-title">3. Rezepte und Reihenfolge</h2>
        ${cfg.items.map((it, n) => { const r = byId[it.recipeId]; return `<div class="cb-item">
          <span class="cb-item-no">${n + 1}</span>
          <span class="cb-item-title">${escapeHtml(r.title || 'Ohne Titel')}</span>
          ${cfg.chapters.length ? `<select aria-label="Kapitel für ${escapeHtml(r.title || '')}" data-cb-item-chapter="${r.id}"><option value="">Ohne Kapitel</option>${cfg.chapters.map(c => `<option value="${escapeHtml(c.id)}" ${it.chapterId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}</select>` : ''}
          <span class="cb-item-actions">
            <button class="icon-btn icon-btn--small" data-action="cb-move-item" data-id="${r.id}" data-delta="-1" ${n === 0 ? 'disabled' : ''} aria-label="${escapeHtml(r.title || '')} nach oben">${ICONS.arrowUp}</button>
            <button class="icon-btn icon-btn--small" data-action="cb-move-item" data-id="${r.id}" data-delta="1" ${n === cfg.items.length - 1 ? 'disabled' : ''} aria-label="${escapeHtml(r.title || '')} nach unten">${ICONS.arrowDown}</button>
            <button class="icon-btn icon-btn--small" data-action="cb-remove-item" data-id="${r.id}" aria-label="${escapeHtml(r.title || '')} aus dem Kochbuch nehmen">${ICONS.x}</button>
          </span></div>`; }).join('')}
        ${missing.length ? `<h3 class="sub-title">Nicht im Kochbuch</h3>${missing.map(r => `<div class="cb-item cb-item--out"><span class="cb-item-title">${escapeHtml(r.title || 'Ohne Titel')}</span><button class="outline-btn outline-btn--small" data-action="cb-add-item" data-id="${r.id}">${ICONS.plus} Aufnehmen</button></div>`).join('')}
          <button class="text-btn" data-action="cb-add-all">Alle aufnehmen</button>` : ''}
      </section>
      <section class="panel">
        <h2 class="section-title">4. Prüfung</h2>
        ${warnings.length ? `<ul class="cb-warnings">${warnings.map(w => `<li class="cb-warn cb-warn--${w.level}">${escapeHtml(w.text)}</li>`).join('')}</ul>` : '<p class="hint-line">Keine Auffälligkeiten gefunden.</p>'}
        <p class="hint-line">Das Inhaltsverzeichnis mit echten Seitenzahlen wird automatisch erstellt.</p>
        <button class="primary-btn primary-btn--block" data-action="export-cookbook" ${cfg.items.length ? '' : 'disabled'}>${ICONS.pdf} Vorschau erstellen</button>
      </section>
    </main>
    ${bottomNav()}
    ${pdfExportModal()}
  `;
}

/* ---------- Gefuehrte Rezepterfassung ---------- */
const FORM_STEPS = ['Basis', 'Kategorien', 'Zutaten', 'Zubereitung', 'Kontrolle'];
function ingredientRow(i, idx) {
  const n = idx + 1;
  // Reihenfolge wie im Rezept: Menge, Einheit, Name (schmal: Menge/Einheit oben, Name darunter)
  return `<div class="repeat-row ing-row" data-ing-row="${idx}">
    <div class="field ing-amount"><input type="text" inputmode="decimal" placeholder="Menge" aria-label="Zutat ${n}, Menge" class="ing-amount-input" value="${escapeHtml(String(i.amount ?? ''))}"></div>
    <div class="field ing-unit"><input type="text" placeholder="Einheit" aria-label="Zutat ${n}, Einheit" class="ing-unit-input" value="${escapeHtml(i.unit || '')}"></div>
    <div class="field ing-name"><input type="text" placeholder="Zutat" aria-label="Zutat ${n}, Name" class="ing-name-input" value="${escapeHtml(i.name || '')}"></div>
    <div class="ing-row-actions">
      <button type="button" class="ing-convert-btn" data-action="convert-ingredient-row" data-idx="${idx}" aria-label="Menge von Zutat ${n} in dein Masseinheiten-System umrechnen">${ICONS.swap}</button>
      <button class="repeat-row-remove" data-action="remove-ingredient" data-idx="${idx}" aria-label="Zutat ${n} entfernen">${ICONS.trash}</button>
    </div>
  </div>`;
}
function groupHeaderRow(title, idx) {
  return `<div class="group-row" data-group-row="${idx}">
    <label class="sr-only" for="grp-${idx}">Gruppenname</label>
    <input id="grp-${idx}" class="group-name-input" type="text" value="${escapeHtml(title)}" placeholder="Gruppenname, z.B. Teig">
    <button class="repeat-row-remove" data-action="remove-ingredient-group" data-idx="${idx}" aria-label="Gruppe ${escapeHtml(title)} auflösen">${ICONS.x}</button>
  </div>`;
}
// Editor-Liste: alte Kopfzeilen ("Teig:") und group-Felder werden als echte Gruppenzeilen gezeigt.
function editorIngredientRows(r) {
  let lastGroup = null; let html = ''; let g = 0;
  (r.ingredients || []).forEach((i, idx) => {
    if (isIngredientHeaderRow(i)) { lastGroup = headerTitle(i); html += groupHeaderRow(lastGroup, g++); return; }
    const grp = i.group ? String(i.group) : null;
    if (grp && grp !== lastGroup) { lastGroup = grp; html += groupHeaderRow(grp, g++); }
    html += ingredientRow(i, idx);
  });
  return html;
}
function formView() {
  const r = state.editingRecipe;
  const isNew = !state.recipes.some(x => x.id === r.id);
  const step = Math.max(0, Math.min(state.formStep || 0, FORM_STEPS.length - 1));
  const draft = loadRecipeDraft();
  const showDraft = draft && !state.draftBannerDismissed && draft.recipe && ((isNew && draft.isNew) || (!isNew && draft.recipe.id === r.id)) && draft.savedAt > (r.updatedAt || 0) - 1000 && !state.draftRestored;
  const chipSet = (label, id, options, keyOf, labelOf, action, dataAttr, activeList) => `<div class="field"><span class="field-label" id="${id}">${label}</span>
    <div class="diet-select-row" role="group" aria-labelledby="${id}">${options.map(o => { const k = keyOf(o); const on = (activeList || []).includes(k); return `<button type="button" class="diet-select-chip ${on ? 'active' : ''}" data-action="${action}" data-${dataAttr}="${k}" aria-pressed="${on}">${on ? ICONS.check : ''}${labelOf(o)}</button>`; }).join('')}</div></div>`;
  const realCount = realIngredients(r).length;
  const missingAmounts = realIngredients(r).filter(i => parseAmount(i.amount) === null).length;
  const stepCount = (r.steps || []).filter(s => (s.text || '').trim()).length;
  return `
    ${topbar(isNew ? 'Neues Rezept' : 'Rezept bearbeiten', { back: true, actions: `<button class="text-btn text-btn--strong" data-action="save-recipe">Speichern</button>` })}
    <main class="form-main">
      <div class="form-page" id="recipeForm">
        ${showDraft ? `<div class="draft-banner" role="status"><span>Es gibt einen ungespeicherten Entwurf vom ${new Date(draft.savedAt).toLocaleString('de-CH', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}.</span>
          <span class="draft-actions"><button class="text-btn" data-action="discard-draft">Verwerfen</button><button class="outline-btn outline-btn--small" data-action="restore-draft">Wiederherstellen</button></span></div>` : ''}
        ${importSummaryBanner(r._importSummary)}
        <nav class="form-stepper" aria-label="Erfassungsschritte">
          ${FORM_STEPS.map((s, n) => `<button type="button" class="form-step-btn ${n === step ? 'is-active' : ''} ${n < step ? 'is-done' : ''}" data-action="form-goto-step" data-idx="${n}" aria-current="${n === step ? 'step' : 'false'}"><span class="form-step-no">${n + 1}</span><span class="form-step-label">${s}</span></button>`).join('')}
        </nav>
        <section class="form-step ${step === 0 ? 'is-active' : ''}" data-form-step="0" aria-label="Basis">
          <div class="field"><label for="f-title">Titel</label><input type="text" id="f-title" value="${escapeHtml(r.title)}" placeholder="z.B. Zitronen-Risotto"></div>
          <div class="field"><label for="f-image">Foto</label>
            <div class="image-drop" id="imgDrop">
              ${r.image ? `<img src="${r.image}" alt="">` : r.imageId ? `<div data-lazy-img="full" data-image-id="${r.imageId}" class="image-drop-placeholder">${ICONS.chef}</div>` : `<div class="image-drop-placeholder">${ICONS.chef}<span>Foto auswählen</span></div>`}
              <input type="file" accept="image/*" id="f-image" aria-label="Foto auswählen">
            </div></div>
          <div class="field-row field-row--2">
            <div class="field"><label for="f-servings">Menge</label><input type="number" id="f-servings" min="1" value="${r.servings}"></div>
            <div class="field"><label for="f-serving-mode">Einheit</label><select id="f-serving-mode"><option value="portions" ${servingMode(r) === 'portions' ? 'selected' : ''}>Portionen</option><option value="pieces" ${servingMode(r) === 'pieces' ? 'selected' : ''}>Stück</option></select></div>
          </div>
          <div class="field-row field-row--2">
            <div class="field"><label for="f-time">Zeit (Min.)</label><input type="number" id="f-time" min="0" value="${r.timeMinutes}"></div>
            <div class="field"><label for="f-difficulty">Schwierigkeit</label><select id="f-difficulty">${['Einfach', 'Mittel', 'Anspruchsvoll'].map(d => `<option ${r.difficulty === d ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
          </div>
        </section>
        <section class="form-step ${step === 1 ? 'is-active' : ''}" data-form-step="1" aria-label="Kategorien">
          ${chipSet('Ernährungsform', 'diet-group-label', DIET_OPTIONS.filter(d => d.tone === 'diet'), d => d.key, d => d.label, 'toggle-diet', 'diet', r.diet)}
          ${chipSet('Fleisch / Fisch', 'protein-group-label', DIET_OPTIONS.filter(d => d.tone === 'protein'), d => d.key, d => d.label, 'toggle-diet', 'diet', r.diet)}
          <p class="settings-hint">Hinweise wie „frei von“ bitte immer selbst prüfen, keine medizinische Zusicherung.</p>
          ${chipSet('Hinweise / Frei von', 'free-group-label', DIET_OPTIONS.filter(d => d.tone === 'free'), d => d.key, d => d.label, 'toggle-diet', 'diet', r.diet)}
          ${chipSet('Mahlzeit', 'meal-group-label', MEAL_TYPE_OPTIONS, m => m.id, m => m.label, 'toggle-category', 'category', r.categoryTags)}
          ${chipSet('Gericht', 'dish-group-label', DISH_TYPE_OPTIONS, d => d.id, d => d.label, 'toggle-category', 'category', r.categoryTags)}
          <button type="button" class="ghost-btn" data-action="reanalyze-categories">${ICONS.sparkle} Kategorien automatisch vorschlagen</button>
          <div class="field field--spaced"><label for="f-tag-new">Tags</label>
            <div class="tag-input-row" id="tagInputRow">${(r.tags || []).map(t => `<span class="tag-pill">${escapeHtml(t)}<button data-action="remove-tag" data-tag="${escapeHtml(t)}" aria-label="Tag ${escapeHtml(t)} entfernen">${ICONS.x}</button></span>`).join('')}<input type="text" id="f-tag-new" placeholder="Tag + Enter"></div>
            <div class="field-hint">z.B. ${ALL_TAGS_SEED.slice(0, 4).join(', ')} …</div></div>
        </section>
        <section class="form-step ${step === 2 ? 'is-active' : ''}" data-form-step="2" aria-label="Zutaten">
          <p class="hint-line">Mit Gruppen teilst du Zutaten z.B. in „Teig“ und „Füllung“. Gruppentitel landen nie in der Einkaufsliste.</p>
          <div id="ingRows" role="group" aria-label="Zutaten">${editorIngredientRows(r)}</div>
          <div class="row-actions"><button class="add-row-btn" data-action="add-ingredient">${ICONS.plus} Zutat</button><button class="add-row-btn" data-action="add-ingredient-group">${ICONS.folder} Gruppe</button><button class="add-row-btn" data-action="open-ing-paste">${ICONS.list} Mehrere einfügen</button></div>
        </section>
        <section class="form-step ${step === 3 ? 'is-active' : ''}" data-form-step="3" aria-label="Zubereitung">
          <div id="stepRows" role="group" aria-label="Zubereitungsschritte">${(r.steps || []).map((s, idx) => stepRow(s, idx)).join('')}</div>
          <button class="add-row-btn" data-action="add-step">${ICONS.plus} Schritt hinzufügen</button>
        </section>
        <section class="form-step ${step === 4 ? 'is-active' : ''}" data-form-step="4" aria-label="Notizen und Kontrolle">
          <div class="field"><label for="f-notes">Notizen (optional)</label><textarea id="f-notes" placeholder="Eigene Anmerkungen, Variationen …">${escapeHtml(r.notes || '')}</textarea></div>
          <div class="review-box" id="reviewBox">
            <h3 class="sub-title">Kontrolle</h3>
            <ul class="review-list">
              <li class="${(r.title || '').trim() ? 'ok' : 'warn'}">${(r.title || '').trim() ? 'Titel vorhanden' : 'Titel fehlt'}</li>
              <li class="${realCount ? 'ok' : 'warn'}">${realCount} Zutat${realCount === 1 ? '' : 'en'}${missingAmounts ? `, davon ${missingAmounts} ohne Mengenangabe` : ''}</li>
              <li class="${stepCount ? 'ok' : 'warn'}">${stepCount} Zubereitungsschritt${stepCount === 1 ? '' : 'e'}</li>
            </ul>
          </div>
        </section>
        <div class="form-actions form-actions--sticky">
          ${step > 0 ? `<button class="ghost-btn" data-action="form-goto-step" data-idx="${step - 1}">Zurück</button>` : (!isNew ? `<button class="ghost-btn danger-btn" data-action="confirm-delete" data-id="${r.id}">Löschen</button>` : '')}
          ${step < FORM_STEPS.length - 1 ? `<button class="primary-btn" data-action="form-goto-step" data-idx="${step + 1}">Weiter</button>` : `<button class="primary-btn" data-action="save-recipe">Rezept speichern</button>`}
        </div>
      </div>
    </main>
    ${state.modal && state.modal.type === 'delete' ? deleteModal(r) : ''}
    ${state.modal && state.modal.type === 'ing-paste' ? ingPasteModal() : ''}
  `;
}
