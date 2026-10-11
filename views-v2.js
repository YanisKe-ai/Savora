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
  books: `${SVG_OPEN}<rect x="4" y="3" width="16" height="5" rx="1.5"/><rect x="4" y="10" width="16" height="5" rx="1.5"/><rect x="4" y="17" width="16" height="4" rx="1.5"/></svg>`,
  menu: `${SVG_OPEN}<path d="M4 7h16M4 12h16M4 17h16"/></svg>`,
  bookOpen: `${SVG_OPEN}<path d="M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2z"/><path d="M22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z"/></svg>`,
});

const TAB_VIEWS = ['home', 'mealplan', 'shopping', 'cookbooks', 'settings'];
const DAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/* ---------- Navigation ----------
   Genau fuenf Punkte: Rezepte, Wochenplan, Einkauf, Kochbuecher und Mehr (= die bestehende Einstellungsseite).
   Bis 899 px liegt die Leiste unten (Handy und Tablet hochkant), ab 900 px als Seitenleiste, dort heisst der letzte Punkt «Einstellungen».
   Ein Zahnrad im Kopf gibt es nicht mehr. «Mehr» bleibt auf allen Unterseiten der Einstellungen aktiv. */
function navTabActive(view) {
  const v = state.view;
  if (view === 'home') return v === 'home' || v === 'detail';
  if (view === 'cookbooks') return v === 'cookbooks' || v === 'cookbook';
  if (view === 'settings') return isMoreSectionView(v) && v !== 'cookbook';
  return v === view;
}
/* Handy-Layout (unter 768 px): Startseite als Rezeptliste. Tablet und Desktop behalten ihre bisherige Startseite. */
const PHONE_QUERY = '(max-width: 767px)';
function isCompactNav() { return !!(window.matchMedia && matchMedia('(max-width: 899px)').matches); }   // untere Leiste: der letzte Punkt heisst «Mehr», darueber «Einstellungen»
function isPhoneLayout() { return !!(window.matchMedia && matchMedia(PHONE_QUERY).matches); }
function bottomNav() {
  const tabs = [
    { view: 'home', icon: ICONS.bookOpen, label: 'Rezepte' },
    { view: 'mealplan', icon: ICONS.calendar, label: 'Wochenplan' },
    { view: 'shopping', icon: ICONS.cart, label: 'Einkauf' },
    { view: 'cookbooks', icon: ICONS.books, label: 'Kochbücher' },
    { view: 'settings', icon: ICONS.menu, label: isCompactNav() ? 'Mehr' : 'Einstellungen', cls: 'nav-settings' },
  ];
  const openCount = state.shopping.filter(i => !i.checked && !i.have).length;
  const btn = (t) => {
    const active = navTabActive(t.view);
    const badge = t.view === 'shopping' && openCount ? `<span class="nav-badge" aria-hidden="true">${openCount > 99 ? '99+' : tickerHtml(openCount, 'nav-badge', 'session')}</span>` : '';
    return `<button type="button" data-action="nav-tab" data-view="${t.view}" class="${t.cls || ''} ${active ? 'active' : ''}" ${active ? 'aria-current="page"' : ''}>
      <span class="nav-icon" aria-hidden="true">${t.icon}${badge}</span><span class="nav-label">${t.label}</span>
    </button>`;
  };
  return `<nav class="bottom-nav" aria-label="Hauptnavigation">
    <div class="nav-brand" aria-hidden="true">${wordmarkSvg('nav-wordmark')}</div>
    ${tabs.map(btn).join('')}
  </nav>`;
}

// Kompakte App-Bar fuer Unterseiten (Zurueck, Titel, Aktionen). Wird auch von den
// Einstellungsseiten in views.js verwendet, deshalb gleiche Signatur wie bisher.
/* Kopfzeile: nur die Savora-Wortmarke (Pfad-SVG), ohne Symbol; klar getrennt vom Seitentitel darunter */
function brandLockup() {
  return `<div class="brand-v2">${wordmarkSvg('top-wordmark', 'Savora')}</div>`;
}

function topbar(title, opts = {}) {
  const left = opts.back
    ? `<button class="icon-btn" data-action="back" aria-label="Zurück">${ICONS.back}</button>`
    : brandLockup();
  return `<header class="topbar ${opts.back ? 'topbar--sub' : ''} ${opts.cls || ''}">
    <div class="topbar-left">${left}${opts.back ? (opts.plainTitle ? `<span class="topbar-title">${escapeHtml(opts.plainTitle)}</span>` : `<h1 class="topbar-title">${escapeHtml(title)}</h1>`) : ''}</div>
    <div class="topbar-actions">${opts.actions || ''}</div>
  </header>`;
}

function pageTitle(title, actions) {
  return `<div class="page-title-row"><h1 class="page-title">${escapeHtml(title)}</h1>${actions || ''}</div>`;
}

/* ---------- Filter ---------- */
function filterSpec() {
  const f = state.activeFilters;
  return { dietary: f.dietary, category: f.category, time: f.time, more: f.more || (f.more = new Set()), tags: f.tags || (f.tags = new Set()) };
}
/* Gerichtart-Filter (D01): Mahlzeit und Gericht sind zwei fachliche Gruppen. Beide liegen weiter im
   gemeinsamen Feld recipe.categoryTags und in einer gemeinsamen Auswahlmenge (state.activeFilters.category),
   die Gruppe ergibt sich aus der ID. Logik: innerhalb einer Gruppe ODER (Frühstück oder Mittagessen),
   zwischen Mahlzeit und Gericht UND (Mahlzeit Abendessen und Gericht Pasta), wie zwischen allen anderen
   Gruppen. Nur eine der beiden Gruppen gewählt: gilt allein.
   Migration von Altfiltern: Die Auswahl wird nicht umgeschrieben, damit nichts verloren geht. IDs, die
   weder Mahlzeit noch Gericht sind (ältere oder importierte Werte), zählen zur Gruppe Gericht, sodass sie
   weiterhin treffen und nie stillschweigend Treffer ausschliessen. Eine früher gemischte Auswahl
   (Mahlzeit und Gericht zusammen, damals ODER) wird jetzt als UND gelesen; sie ist im Fenster sichtbar
   und mit «Zurücksetzen» schnell zu ändern. Rezeptdaten bleiben unverändert. */
const MEAL_FILTER_IDS = new Set(MEAL_TYPE_OPTIONS.map(o => o.id));
function splitCategorySelection(set) {
  const meal = new Set(), dish = new Set();
  set.forEach(id => { (MEAL_FILTER_IDS.has(id) ? meal : dish).add(id); });
  return { meal, dish };
}
function categoryFilterMatches(r, set) {
  const tags = r.categoryTags || [];
  const g = splitCategorySelection(set);
  const ok = (grp) => !grp.size || tags.some(c => grp.has(c));
  return ok(g.meal) && ok(g.dish);
}

/* Zentrale Filterlogik: innerhalb einer Gruppe ODER, zwischen Gruppen UND. Mit `spec` (Entwurf im Filterfenster)
   wird nur die Auswahl ersetzt; Suche, Alle/Favoriten und Sortierung kommen immer aus dem state. */
function applyAllFilters(recipes, spec) {
  const f = spec || filterSpec();
  let list = recipesInCollection(state.activeCollection, recipes);
  if (state.query.trim()) list = list.filter(r => recipeMatchesQuery(r, state.query));
  if (state.activeTag) list = list.filter(r => (r.tags || []).includes(state.activeTag));
  if (state.favOnly) list = list.filter(r => r.favorite);
  const { dietary, category, time, more, tags } = f;
  if (dietary.size) list = list.filter(r => { const bad = new Set(dietConflicts(r).map(c => c.label)); return (r.diet || []).some(d => dietary.has(d) && !bad.has(d)); });
  if (category.size) list = list.filter(r => categoryFilterMatches(r, category));
  if (time.size) list = list.filter(r => timeBucketsFor(r.timeMinutes).some(b => time.has(b)));
  if (more && more.size) { const ids = Array.from(more); list = list.filter(r => ids.some(id => recipesInCollection(id, [r]).length)); }
  if (tags && tags.size) list = list.filter(r => (r.tags || []).some(t => tags.has(t)));
  return sortRecipes(list, state.sortBy);
}

/* Weitere Merkmale: nur, was die Daten wirklich hergeben (Kochzaehler, eigene Sammlungen). */
function moreFilterOptions() {
  const opts = [{ id: 'uncooked', label: 'Noch nicht gekocht' }];
  if (state.recipes.some(isFrequentlyCooked) || state.activeFilters.more.has('frequent')) opts.push({ id: 'frequent', label: 'Häufig gekocht' });
  getCollections().forEach(c => opts.push({ id: c.id, label: c.name }));
  return opts;
}
function moreFilterLabel(id) {
  const o = moreFilterOptions().find(x => x.id === id);
  if (o) return o.label;
  return ({ quick: 'Schnell', veggie: 'Vegetarisch', favorites: 'Favoriten' })[id] || id;
}
function appliedFilterLabels() {
  const f = filterSpec(), out = [];
  f.dietary.forEach(id => out.push(categoryLabelFor(id)));
  f.category.forEach(id => out.push(categoryLabelFor(id)));
  f.time.forEach(id => out.push((TIME_BUCKET_OPTIONS.find(t => t.id === id) || {}).label || id));
  f.more.forEach(id => out.push(moreFilterLabel(id)));
  f.tags.forEach(t => out.push(t));
  if (state.activeTag) out.push(state.activeTag);
  if (state.activeCollection && state.activeCollection !== 'all' && state.activeCollection !== 'favorites') out.push(moreFilterLabel(state.activeCollection));
  return out;
}
function resetExtraFilters() {
  const f = filterSpec();
  f.dietary.clear(); f.category.clear(); f.time.clear(); f.more.clear(); f.tags.clear();
  state.activeTag = null; state.activeCollection = 'all';
}

/* ---------- Filterfenster mit Entwurf ---------- */
function newFilterDraft() {
  const f = filterSpec();
  const draft = { dietary: new Set(f.dietary), category: new Set(f.category), time: new Set(), more: new Set(f.more), tags: new Set(f.tags) };
  // Zeit ist Einzelauswahl: bei mehreren gespeicherten Bereichen gilt der weiteste (die Bereiche umfassen einander)
  const best = TIME_BUCKET_OPTIONS.filter(b => f.time.has(b.id)).sort((x, y) => y.max - x.max)[0];
  if (best) draft.time.add(best.id);
  // Aeltere Einzelfilter in die sichtbare Auswahl uebernehmen, damit nichts unsichtbar wirkt
  if (state.activeTag) draft.tags.add(state.activeTag);
  if (state.activeCollection && state.activeCollection !== 'all' && state.activeCollection !== 'favorites') draft.more.add(state.activeCollection);
  return draft;
}
function filterDraft() {
  if (!state.modal || state.modal.type !== 'filter-sheet') return null;
  if (!state.modal.draft) state.modal.draft = newFilterDraft();
  return state.modal.draft;
}
function filterOptionHtml(type, dim, id, label, checked) {
  return `<label class="fs-opt"><input class="fs-input" type="${type}" ${type === 'radio' ? 'name="fs-time"' : ''} data-fs-dim="${dim}" value="${escapeHtml(id)}" ${checked ? 'checked' : ''}><span class="fs-mark" aria-hidden="true">${ICONS.check}</span><span class="fs-text">${escapeHtml(label)}</span></label>`;
}
function filterGroupHtml(key, title, inner) {
  const id = `filter-group-${key}`;
  return `<fieldset class="fs-group"><legend class="filter-group-title fs-legend" id="${escapeAttr(id)}">${title}</legend><div class="fs-opts">${inner}</div></fieldset>`;
}
function filterCountLabel(n) { return `${n} Rezept${n === 1 ? '' : 'e'} anzeigen`; }
function filterStatusText(n) { return n === 0 ? 'Keine passenden Rezepte. Ändere die Auswahl oder setze sie zurück.' : (n === 1 ? '1 passendes Rezept' : `${n} passende Rezepte`); }

function filterSheetModal() {
  if (!state.modal || state.modal.type !== 'filter-sheet') return '';
  const d = filterDraft();
  const n = applyAllFilters(state.recipes, d).length;
  const dietaryOptions = DIET_OPTIONS.filter(o => o.tone === 'diet' || o.tone === 'protein');
  const tags = Array.from(new Set(state.recipes.flatMap(r => r.tags || []))).sort((a, b) => a.localeCompare(b, 'de'));
  const timeNone = d.time.size === 0;
  return `<div class="modal-backdrop" data-action="close-modal">
    <div class="modal-sheet filter-sheet" role="dialog" aria-modal="true" aria-labelledby="filter-sheet-title" tabindex="-1" onclick="event.stopPropagation()">
      <div class="sheet-handle" aria-hidden="true"></div>
      <div class="fs-head">
        <h2 class="fs-title" id="filter-sheet-title">Rezepte filtern</h2>
        <button type="button" class="fs-close" data-action="close-modal" aria-label="Schliessen">${ICONS.x}</button>
      </div>
      <div class="fs-body">
        ${filterGroupHtml('dietary', 'Ernährung', dietaryOptions.map(o => filterOptionHtml('checkbox', 'dietary', o.key, o.label, d.dietary.has(o.key))).join(''))}
        ${filterGroupHtml('meal', 'Mahlzeit', MEAL_TYPE_OPTIONS.map(o => filterOptionHtml('checkbox', 'category', o.id, o.label, d.category.has(o.id))).join(''))}
        ${filterGroupHtml('dish', 'Gericht', DISH_TYPE_OPTIONS.map(o => filterOptionHtml('checkbox', 'category', o.id, o.label, d.category.has(o.id))).join(''))}
        ${filterGroupHtml('time', 'Zubereitungszeit', filterOptionHtml('radio', 'time', '', 'Beliebig', timeNone) + TIME_BUCKET_OPTIONS.map(o => filterOptionHtml('radio', 'time', o.id, o.label, d.time.has(o.id))).join(''))}
        ${filterGroupHtml('more', 'Weitere Merkmale', moreFilterOptions().map(o => filterOptionHtml('checkbox', 'more', o.id, o.label, d.more.has(o.id))).join(''))}
        ${tags.length ? filterGroupHtml('tags', 'Eigene Schlagwörter', tags.map(t => filterOptionHtml('checkbox', 'tags', t, t, d.tags.has(t))).join('')) : ''}
      </div>
      <div class="fs-foot">
        <p class="fs-status ${n === 0 ? 'is-empty' : ''}" role="status" aria-live="polite">${filterStatusText(n)}</p>
        <div class="fs-actions">
          <button type="button" class="ghost-btn fs-reset" data-action="fs-reset">Zurücksetzen</button>
          <button type="button" class="primary-btn fs-apply" data-action="fs-apply">${filterCountLabel(n)}</button>
        </div>
      </div>
    </div>
  </div>`;
}
/* Aenderungen im Fenster aktualisieren nur die Anzeige, ohne das Fenster neu zu bauen (Scrollstand und Fokus bleiben). */
function syncFilterSheet() {
  const sheet = document.querySelector('.filter-sheet'), d = filterDraft();
  if (!sheet || !d) return;
  sheet.querySelectorAll('.fs-input').forEach(inp => {
    const set = d[inp.dataset.fsDim];
    inp.checked = inp.type === 'radio' && inp.value === '' ? set.size === 0 : set.has(inp.value);
  });
  const n = applyAllFilters(state.recipes, d).length;
  const st = sheet.querySelector('.fs-status'), ap = sheet.querySelector('.fs-apply');
  if (st) { st.textContent = filterStatusText(n); st.classList.toggle('is-empty', n === 0); }
  if (ap) ap.textContent = filterCountLabel(n);
}
function bindFilterSheet() {
  const sheet = document.querySelector('.filter-sheet');
  if (sheet && !sheet.dataset.fsBound) {
    sheet.dataset.fsBound = '1';
    sheet.addEventListener('change', (e) => {
      const inp = e.target.closest && e.target.closest('.fs-input');
      const d = filterDraft();
      if (!inp || !d) return;
      const set = d[inp.dataset.fsDim];
      if (inp.type === 'radio') { set.clear(); if (inp.value) set.add(inp.value); }
      else if (inp.checked) set.add(inp.value); else set.delete(inp.value);
      syncFilterSheet();
    });
  }
  const sel = document.getElementById('sortSelect');
  if (sel && !sel.dataset.bound) {
    sel.dataset.bound = '1';
    sel.addEventListener('change', () => {
      if (sel.value === '__fav') { state.favOnly = true; state.activeCollection = 'all'; render(); return; }
      if (isPhoneLayout()) { state.favOnly = false; if (state.activeCollection === 'favorites') state.activeCollection = 'all'; }
      state.sortBy = sel.value;
      try { localStorage.setItem(SORT_KEY, state.sortBy); } catch (err) {}
      render();
    });
  }
}

/* ---------- Rezeptuebersicht ---------- */
/* Rezepte ohne Foto bekommen KEINE Bildflaeche und keinen Buchstaben: Karte und Zeile sind rein typografisch
   (Salbei-Flaeche, Titel in Lilita One, Meta darunter), siehe .rcard--text und .rrow--text. Nur waehrend ein gespeichertes
   Foto noch geladen wird (imageId), steht kurz eine ruhige, leere Flaeche in derselben Groesse. */
function placeholderInner() { return ''; }
function placeholderClass() { return ''; }
function hasPhoto(r) { return !!(recipeSafeImage(r) || recipeSafeImageId(r)); }
function recipeImageHtml(r, cls, size) {
  const src = recipeSafeImage(r), imgId = recipeSafeImageId(r);
  if (src) return `<img class="${escapeHtml(cls)}" src="${escapeHtml(src)}" alt="" loading="lazy">`;
  if (imgId) return `<div class="${escapeHtml(cls)} placeholder" data-lazy-img="${escapeHtml(size)}" data-image-id="${escapeHtml(imgId)}" data-img-class="${escapeHtml(cls)}"></div>`;
  if (cls === 'plan-thumb' || cls === 'picker-thumb') return `<div class="${cls} placeholder"></div>`;   // kleine Vorschau in Listen: ruhige Flaeche, kein Buchstabe
  return '';
}
function recipeMetaLine(r, full) {
  const parts = [];
  if (r.timeMinutes) parts.push(`${r.timeMinutes} Min.`);
  if (full && r.servings) parts.push(servingMode(r) === 'pieces' ? `${r.servings} Stück` : `${r.servings} ${r.servings === 1 ? 'Portion' : 'Portionen'}`);
  return parts.join(' · ');
}
function favButton(r, extraCls) {
  return `<button type="button" class="fav-toggle ${extraCls || ''} ${r.favorite ? 'is-active' : ''}" data-action="toggle-fav" data-id="${escapeAttr(r.id)}" aria-pressed="${r.favorite ? 'true' : 'false'}" aria-label="${r.favorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}">${r.favorite ? ICONS.bookmarkFilled : ICONS.bookmark}</button>`;
}
function recipeCard(r, phone) {
  const photo = hasPhoto(r);
  const title = escapeHtml(r.title || 'Ohne Titel');
  const titleHl = highlightHtml(r.title || 'Ohne Titel', state.query);
  if (phone === true) {
    /* Handy-Raster: Foto 4:3 (oder ruhiger Platzhalter), Titel, Zeit nur wenn bekannt, Favoritenknopf als Geschwister (kein verschachtelter Knopf) */
    const time = r.timeMinutes > 0 ? `<span class="rcard-meta rcard-meta--time">${ICONS.clock}<span>${r.timeMinutes} Min.</span></span>` : '';
    return `<article class="rcard rcard--phone">
    <button type="button" class="rcard-main" data-action="open-recipe" data-id="${escapeAttr(r.id)}" aria-label="${title} öffnen">
      ${photo ? recipeImageHtml(r, 'rcard-img', 'thumb') : `<span class="rcard-img rcard-ph" aria-hidden="true">${ICONS.bookOpen}</span>`}
      <span class="rcard-body">
        <span class="rcard-title">${titleHl}</span>${searchIngredientHitHtml(r, state.query)}
        ${time}
      </span>
    </button>
    ${favButton(r, 'rcard-fav')}
  </article>`;
  }
  return `<article class="rcard ${photo ? '' : 'rcard--text'}">
    <button type="button" class="rcard-main" data-action="open-recipe" data-id="${escapeAttr(r.id)}" aria-label="${title} öffnen">
      ${photo ? recipeImageHtml(r, 'rcard-img', 'thumb') : ''}
      <span class="rcard-body">
        <span class="rcard-title">${titleHl}</span>${searchIngredientHitHtml(r, state.query)}
        <span class="rcard-meta">${escapeHtml(recipeMetaLine(r, false))}</span>
      </span>
    </button>
    ${favButton(r, 'rcard-fav')}
  </article>`;
}
function recipeRow(r, phone) {
  const photo = hasPhoto(r);
  if (phone) {
    /* Handy-Liste: quadratisches Foto (oder ruhiger Platzhalter), Titel, Zeit nur wenn bekannt, eigener Favoritenknopf als Geschwister (kein verschachtelter Knopf) */
    const title = escapeHtml(r.title || 'Ohne Titel');
    const titleHl = highlightHtml(r.title || 'Ohne Titel', state.query);
    const time = r.timeMinutes > 0 ? `<span class="rrow-meta rrow-meta--time">${ICONS.clock}<span>${r.timeMinutes} Min.</span></span>` : '';
    return `<article class="rrow rrow--phone">
    <button type="button" class="rrow-main" data-action="open-recipe" data-id="${escapeAttr(r.id)}" aria-label="${title} öffnen">
      ${photo ? recipeImageHtml(r, 'rrow-img', 'thumb') : `<span class="rrow-img rrow-ph" aria-hidden="true">${ICONS.bookOpen}</span>`}
      <span class="rrow-body">
        <span class="rrow-title">${titleHl}</span>${searchIngredientHitHtml(r, state.query)}
        ${time}
      </span>
    </button>
    ${favButton(r, 'rrow-fav')}
  </article>`;
  }
  return `<article class="rrow ${photo ? '' : 'rrow--text'}">
    <button type="button" class="rrow-main" data-action="open-recipe" data-id="${escapeAttr(r.id)}" aria-label="${escapeHtml(r.title || 'Ohne Titel')} öffnen">
      ${photo ? recipeImageHtml(r, 'rrow-img', 'thumb') : ''}
      <span class="rrow-body">
        <span class="rrow-title">${highlightHtml(r.title || 'Ohne Titel', state.query)}</span>${searchIngredientHitHtml(r, state.query)}
        <span class="rrow-meta">${escapeHtml(recipeMetaLine(r, true))}${isUncooked(r) ? ' · noch nicht gekocht' : ''}</span>
      </span>
    </button>
    ${favButton(r, 'rrow-fav')}
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
// Zeile "Heute geplant": erscheint nur, wenn fuer heute wirklich etwas im Wochenplan steht.
function todayPlannedHtml() {
  const items = plannedItemsFor(fmtDateKey(new Date()));
  if (!items.length) return '';
  const label = (e) => {
    if (isNoteEntry(e)) return `<span class="today-note">${escapeHtml(e.text)}</span>`;
    const r = state.recipes.find(x => x.id === e.recipeId);
    return `<button type="button" class="today-link" data-action="open-recipe" data-id="${escapeAttr(r.id)}">${escapeHtml(r.title || 'Ohne Titel')}</button>`;
  };
  return `<section class="today-planned" aria-label="Heute geplant"><span class="today-label">Heute geplant</span>${items.map(label).join('')}</section>`;
}
/* Ansicht Liste/Raster: gleicher Speicherort wie bisher (savora-home-layout). Handy: ohne gespeicherte Wahl bleibt es die Liste. */
function layoutToggleHtml(layout, cls) {
  /* Handy (cls gesetzt): unter 360 px zeigt CSS statt der zwei Knöpfe EINEN Wechsel-Knopf (Symbol der anderen Ansicht) */
  const single = cls ? `<button type="button" class="layout-single" data-action="set-home-layout" data-id="${layout === 'list' ? 'grid' : 'list'}" aria-label="${layout === 'list' ? 'Zur Rasteransicht wechseln' : 'Zur Listenansicht wechseln'}">${layout === 'list' ? ICONS.grid : ICONS.list}</button>` : '';
  return `<div class="layout-toggle ${cls || ''}" role="group" aria-label="Darstellung">
            <button type="button" class="icon-toggle ${layout !== 'list' ? 'is-active' : ''}" data-action="set-home-layout" data-id="grid" aria-pressed="${layout !== 'list'}" aria-label="Rasteransicht">${ICONS.grid}</button>
            <button type="button" class="icon-toggle ${layout === 'list' ? 'is-active' : ''}" data-action="set-home-layout" data-id="list" aria-pressed="${layout === 'list'}" aria-label="Listenansicht">${ICONS.list}</button>
            ${single}
          </div>`;
}
function homeView() {
  const phone = isPhoneLayout();
  const list = applyAllFilters(state.recipes);
  const filterCount = activeStructuredFilterCount() + (state.activeTag ? 1 : 0) + (state.activeCollection && state.activeCollection !== 'all' && state.activeCollection !== 'favorites' ? 1 : 0);
  const labels = appliedFilterLabels();
  const summary = labels.length > 3 ? labels.slice(0, 3).join(' · ') + ` · + ${labels.length - 3} weitere` : labels.join(' · ');
  const favOnly = !!(state.favOnly || state.activeCollection === 'favorites');
  /* Handy: «Nur Favoriten» steht als letzte Option in der Sortierung (Auswahl = state.favOnly, Sortierung bleibt gemerkt) */
  const sortLabel = phone && favOnly ? 'Nur Favoriten' : (SORT_OPTIONS.find(o => o.id === state.sortBy) || SORT_OPTIONS[0]).label;
  const sortOptions = SORT_OPTIONS.map(o => `<option value="${escapeAttr(o.id)}" ${state.sortBy === o.id && !(phone && favOnly) ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')
    + (phone ? `<option value="__fav" ${favOnly ? 'selected' : ''}>Nur Favoriten</option>` : '');
  const filterBtn = `<button type="button" class="filter-btn ${filterCount ? 'is-active' : ''}" ${filterCount ? `data-count="${filterCount}"` : ''} ${phone && state.searchOpen ? 'inert' : ''} data-action="open-filter-sheet" aria-haspopup="dialog">${ICONS.sliders}<span class="filter-btn-text">Filter${filterCount ? ' · ' + filterCount : ''}</span></button>`;

  let content;
  if (!state.recipes.length) content = emptyState();
  else if (!list.length) content = (phone ? `<div class="result-row result-row--phone result-row--tools-only"><div class="result-tools">${layoutToggleHtml(state.homeLayoutChosen ? (state.homeLayout === 'grid' ? 'grid' : 'list') : 'list', 'layout-toggle--phone')}${filterBtn}</div></div>` : '') + emptyFilterState();
  else {
    const n = list.length;
    if (phone) {
      /* Handy: Liste ist Standard; «N Rezepte · Sortierung» als ruhige Zeile, rechts der kompakte Umschalter Liste/Raster */
      const pl = state.homeLayoutChosen ? (state.homeLayout === 'grid' ? 'grid' : 'list') : 'list';
      const items = pl === 'grid' ? `<div class="rgrid rgrid--phone">${list.map(r => recipeCard(r, true)).join('')}</div>` : `<div class="rlist rlist--phone">${list.map(r => recipeRow(r, true)).join('')}</div>`;
      content = `
      <section class="home-section" aria-labelledby="all-h">
        <div class="result-row result-row--phone">
          <div class="result-info">
            <h2 class="result-line" id="all-h">${tickerHtml(n, 'count')} Rezept${n === 1 ? '' : 'e'}</h2>
            <span class="result-dot" aria-hidden="true">·</span>
            <div class="inline-pick sort-inline">
              <span class="inline-pick-text">${escapeHtml(sortLabel)}</span>${ICONS.arrowDown}
              <select class="inline-pick-select sort-select" id="sortSelect" aria-label="Sortierung">${sortOptions}</select>
            </div>
          </div>
          <div class="result-tools">${layoutToggleHtml(pl, 'layout-toggle--phone')}${filterBtn}</div>
        </div>
        ${items}
      </section>`;
    } else {
      const items = state.homeLayout === 'list' ? `<div class="rlist">${list.map(r => recipeRow(r)).join('')}</div>` : `<div class="rgrid">${list.map(recipeCard).join('')}</div>`;
      content = `
      <section class="home-section" aria-labelledby="all-h">
        <div class="result-row">
          <h2 class="result-line" id="all-h">${tickerHtml(n, 'count')} Rezept${n === 1 ? '' : 'e'}</h2>
          <label class="sort-pick"><span class="sort-pick-label">Sortierung</span>
            <select class="sort-select" id="sortSelect">${sortOptions}</select>
          </label>
          ${layoutToggleHtml(state.homeLayout)}
        </div>
        ${items}
      </section>`;
    }
  }

  /* Handy: Suche als runder Knopf neben «Filter»; geoeffnet liegt das Feld ueber der Zeile (kein Springen der Liste), die Zeile dahinter ist inert */
  const searchOpen = !!state.searchOpen, searchEnter = !!state.searchEnter; state.searchEnter = false;
  const hasQuery = !!state.query.trim();
  const searchBtn = `<button type="button" class="search-btn ${hasQuery ? 'is-active' : ''}" id="searchBtn" data-action="open-search" aria-label="Suchen" aria-expanded="${searchOpen}" aria-controls="searchPop" ${searchOpen ? 'inert' : ''}>${ICONS.search}</button>`;
  const searchPop = searchOpen ? `<div class="search-pop ${searchEnter ? 'is-entering' : ''}" id="searchPop" role="search">
      ${ICONS.search}
      <label for="searchInput" class="sr-only">Rezepte suchen</label>
      <input class="search-input" id="searchInput" type="search" enterkeyhint="search" placeholder="Rezepte suchen …" value="${escapeHtml(state.query)}" autocomplete="off">
      <button type="button" class="search-close" data-action="close-search" data-id="${hasQuery ? 'clear' : 'keep'}" aria-label="${hasQuery ? 'Suche löschen und schliessen' : 'Suche schliessen'}">${ICONS.x}</button>
    </div>` : '';
  const filterBar = !state.recipes.length ? '' : (phone
    ? `<div class="filter-bar filter-bar--phone">
          <div class="view-pick" ${searchOpen ? 'inert' : ''}>
            <span class="inline-pick-text">Alle Rezepte</span>
          </div>
          ${searchBtn}
          ${searchPop}
        </div>`
    : `<div class="filter-bar">
          <div class="seg" role="group" aria-label="Anzeige">
            <button type="button" class="seg-btn" data-action="set-fav-mode" data-id="all" aria-pressed="${!favOnly}">Alle</button>
            <button type="button" class="seg-btn" data-action="set-fav-mode" data-id="fav" aria-pressed="${favOnly}">Favoriten</button>
          </div>
          ${filterBtn}
        </div>`);

  return `
    <div class="home-head ${phone ? 'home-head--phone' : ''}">
      ${phone ? topbar('', { cls: 'topbar--home topbar--center' }) : topbar('', { cls: 'topbar--home', actions: `<button class="round-btn round-btn--accent" data-action="open-add-menu" aria-label="Rezept hinzufügen">${ICONS.plus}</button>` })}
      <section class="home-head-body" aria-label="Suche und Filter">
        ${phone ? '<h1 class="sr-only">Deine Rezepte</h1>' : pageTitle('Deine Rezepte')}
        ${phone ? '' : `<div class="search-field">
          ${ICONS.search}
          <label for="searchInput" class="sr-only">Rezepte suchen</label>
          <input class="search-input" id="searchInput" type="search" enterkeyhint="search" placeholder="${phone ? 'Rezepte suchen …' : 'Rezepte suchen'}" value="${escapeHtml(state.query)}" autocomplete="off">
        </div>`}
        ${filterBar}
        ${filterCount ? `<div class="filter-summary">
          <p class="filter-summary-text"><span class="sr-only">Aktive Filter: </span>${escapeHtml(summary)}</p>
          <button type="button" class="filter-summary-reset" data-action="reset-extra-filters">Zurücksetzen</button>
        </div>` : ''}
      </section>
    </div>
    <main class="has-tabbar home-main ${phone && state.recipes.length ? 'home-main--addbar' : ''}">
      ${todayPlannedHtml()}
      ${(() => { const n = backupNudgeInfo(); return n ? `<div class="nudge-card" role="note">
        <p class="nudge-text">${n.never ? 'Noch keine Sicherung' : 'Letzte Sicherung vor ' + n.days + ' Tagen'}</p>
        <div class="nudge-actions"><button class="text-btn" data-action="goto-view" data-view="settings-backup">Sichern</button><button class="text-btn text-btn--quiet" data-action="backup-nudge-dismiss">Später</button></div></div>` : ''; })()}
      ${content}
    </main>
    ${phone && state.recipes.length ? `<div class="home-add-bar"><button type="button" class="home-add-btn" data-action="open-add-menu">${ICONS.plus}<span>Rezept hinzufügen</span></button></div>` : ''}
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
  const factor = servingsFactor(r, servings);
  const unknownYield = !yieldKnown(r);
  const checked = checkedSetFor(r.id);
  const groups = getIngredientGroups(r);
  const showTitles = groups.length > 1 || (groups[0] && groups[0].title !== 'Zutaten');
  return `${unknownYield ? `<div class="amount-row amount-row--unknown">
      <span class="amount-row-label">Menge</span>
      <span class="hint-line">Ergibt: nicht angegeben, es gelten die Originalmengen.</span>
      <button class="outline-btn outline-btn--small" data-action="edit-recipe" data-id="${escapeAttr(r.id)}">Angabe ergänzen</button>
    </div>` : `<div class="amount-row">
      <span class="amount-row-label">Menge</span>
      <div class="stepper" role="group" aria-label="Menge anpassen">
        <button data-action="serv-dec" data-id="${escapeAttr(r.id)}" aria-label="Weniger">${ICONS.minus}</button>
        <span class="stepper-value" aria-live="polite">${escapeHtml(servingLabel(r, servings))}</span>
        <button data-action="serv-inc" data-id="${escapeAttr(r.id)}" aria-label="Mehr">${ICONS.plus}</button>
      </div>
    </div>`}
    ${!unknownYield && servings !== (r.servings || 1) ? `<p class="hint-line">Original: ${escapeHtml(servingLabel(r, r.servings || 1))}. Mengen werden immer vom Original berechnet.</p>` : ''}
    ${groups.length ? groups.map(g => `<section class="ing-group">
      ${showTitles ? `<h3 class="ing-group-title">${escapeHtml(g.title)}</h3>` : ''}
      <ul class="ing-list">
        ${g.ingredients.map(i => {
          const isChecked = checked.has(i._index);
          const amt = scaledAmountLine(i, factor);
          return `<li><button type="button" class="ing-check ${isChecked ? 'is-checked' : ''}" data-action="toggle-ingredient-check" data-id="${escapeAttr(r.id)}" data-idx="${i._index}" role="checkbox" aria-checked="${isChecked}">
            <span class="check-box" aria-hidden="true">${ICONS.check}</span>
            <span class="ing-amount">${escapeHtml(amt)}</span>
            <span class="ing-name">${highlightHtml(i.name, state.query)}</span>
          </button></li>`;
        }).join('')}
      </ul>
    </section>`).join('') : `<p class="hint-line">Noch keine Zutaten erfasst.</p>`}
    ${checked.size ? `<button class="text-btn" data-action="reset-ingredient-checks" data-id="${escapeAttr(r.id)}">Häkchen zurücksetzen</button>` : ''}`;
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
      <button class="icon-btn icon-btn--small" data-action="delete-cook-note" data-id="${escapeAttr(r.id)}" data-note="${escapeHtml(n.id)}" aria-label="Notiz vom ${new Date(n.date).toLocaleDateString('de-CH')} löschen">${ICONS.trash}</button></div>
      <p>${escapeHtml(n.text)}</p></div>`).join('')}
    <button class="ghost-btn" data-action="open-note-modal" data-id="${escapeAttr(r.id)}">${ICONS.plus} Notiz hinzufügen</button>`;
}
function nutritionPanel(r) {
  let html = nutritionCardSection(r.id);
  if (servingMode(r) === 'pieces') html = html.replace(/pro Portion/g, 'pro Stück').replace(/Pro Portion/g, 'Pro Stück');
  return `<p class="estimate-note">${ICONS.info} Geschätzte Werte. Je nach Zutaten und Mengen können sie abweichen. Fehlende oder unklare Mengen fliessen nicht als exakte Werte ein.</p>${html}`;
}
function detailView() {
  const r = state.recipes.find(x => x.id === state.activeRecipeId);
  if (!r) { state.view = 'home'; return homeView(); }
  const servings = currentServings(r);
  const hasNotes = !!(r.notes || (r.cookLog || []).length);
  const wide = !!(window.matchMedia && matchMedia('(min-width: 900px)').matches);   // breit: Zutaten stehen links (Seitenspalte) statt im Reiter, nie doppelt im DOM
  const tabs = [
    { id: 'ingredients', label: 'Zutaten' },
    { id: 'steps', label: 'Zubereitung' },
  ];
  if (wide) tabs.shift();   // kein versteckter Reiter, den die Tastatur nicht erreicht
  if (state.showNutrition) tabs.push({ id: 'nutrition', label: 'Nährwerte' });
  if (hasNotes) tabs.push({ id: 'notes', label: 'Notizen' });
  const tab = tabs.some(t => t.id === state.detailTab) ? state.detailTab : tabs[0].id;
  // Alle Panels liegen im DOM, der Tabwechsel blendet nur um (kein Neuaufbau, kein Scrollsprung).
  const ingHtml = ingredientsPanel(r);
  const panelHtml = { ingredients: wide ? '' : ingHtml, steps: stepsPanel(r), nutrition: state.showNutrition ? nutritionPanel(r) : '', notes: hasNotes ? notesPanel(r) : '' };
  // Mit Foto: Bild unverzerrt (cover). Ohne Foto: kein Bildband, der Kopf ist rein typografisch (Titel gross in Lilita One).
  const heroSrc = recipeSafeImage(r), heroImgId = recipeSafeImageId(r);
  const hero = heroSrc
    ? `<div class="hero"><img class="hero-img" src="${escapeHtml(heroSrc)}" alt="${escapeHtml(r.title || '')}" style="view-transition-name: recipe-hero-img;"></div>`
    : heroImgId
      ? `<div class="hero"><div class="hero-img placeholder" data-lazy-img="full" data-image-id="${escapeHtml(heroImgId)}" data-img-class="hero-img" data-img-alt="${escapeHtml(r.title || '')}" style="view-transition-name: recipe-hero-img;"></div></div>`
      : '';
  const extraTimes = [r.prepMinutes ? `Vorbereitungszeit ${r.prepMinutes} Min.` : '', r.restMinutes ? `Ruhen ${r.restMinutes} Min.` : '', r.cookMinutes ? `Garen/Backen ${r.cookMinutes} Min.` : ''].filter(Boolean);
  // Zeit und Menge zuerst und gross; Teilzeiten (Vorbereitungszeit, Ruhen, Garen) leiser in einer zweiten Zeile
  const facts = [r.timeMinutes ? `${r.timeMinutes} Min.` : '', yieldKnown(r) ? `Ergibt ${servingLabel(r, servings)}` : 'Ergibt: offen', r.difficulty || ''].filter(Boolean);
  const sourceText = r.sharedBy
    ? `${ICONS.sparkle}<span>Geteilt von ${escapeHtml(r.sharedBy)}</span>`
    : r.source && !/^https?:\/\//i.test(r.source) ? `${ICONS.link}<span>Quelle: ${escapeHtml(r.source)}</span>`   // freier Quellentext (kein Link)
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
      <div class="diet-warning-actions"><button class="outline-btn outline-btn--small" data-action="fix-diet-conflict" data-id="${escapeAttr(r.id)}">Kennzeichnung entfernen</button><button class="text-btn" data-action="edit-recipe" data-id="${escapeAttr(r.id)}">Bearbeiten</button></div>
    </div>` : '';
  return `
    ${topbar(r.title || 'Rezept', { back: true, plainTitle: 'Rezept', cls: 'topbar--detail', actions: `<button class="icon-btn" data-action="open-detail-menu" data-id="${escapeAttr(r.id)}" aria-label="Weitere Aktionen" aria-haspopup="dialog">${ICONS.more}</button>` })}
    <main class="has-tabbar detail-main ${hero ? 'has-hero' : 'no-hero'}" data-tab="${tab}">
      ${hero}
      <div class="detail-cols"><div class="detail-col detail-col--info">
      <div class="detail-head">
        <div class="detail-title-row">
          <h1 class="detail-title-v2 ${(r.title || '').length > 34 ? 'is-long' : ''} ${(r.title || '').length > 70 ? 'is-xlong' : ''}">${escapeHtml(r.title || 'Ohne Titel')}</h1>
          ${favButton(r, 'detail-fav')}
        </div>
        <p class="detail-meta-v2">${facts.map(f => `<span class="fact">${escapeHtml(f)}</span>`).join('')}</p>
        ${extraTimes.length ? `<p class="detail-times">${extraTimes.map(escapeHtml).join(' · ')}</p>` : ''}
      </div>
      <button class="primary-btn primary-btn--block cook-start-inline" data-action="start-cook" data-id="${escapeAttr(r.id)}">${ICONS.play} Kochen starten</button>
      <div class="detail-tools" role="group" aria-label="Weitere Aktionen zum Rezept">
        <button type="button" class="tool-action" data-action="add-to-shopping" data-id="${escapeAttr(r.id)}">${ICONS.cart}<span>Einkaufen</span></button>
        <button type="button" class="tool-action" data-action="open-plan-recipe" data-id="${escapeAttr(r.id)}">${ICONS.calendar}<span>Planen</span></button>
        <button type="button" class="tool-action" data-action="edit-recipe" data-id="${escapeAttr(r.id)}">${ICONS.edit}<span>Bearbeiten</span></button>
        <button type="button" class="tool-action" data-action="share-recipe" data-id="${escapeAttr(r.id)}">${ICONS.share}<span>Teilen</span></button>
      </div>
      ${source}
      ${conflictBox}
      <div class="detail-aside-ing" role="region" aria-label="Zutaten">${wide ? `<h2 class="sr-only">Zutaten</h2>` + ingHtml : ''}</div>
      </div><div class="detail-col detail-col--content">
      <div class="tabbar-v2" role="tablist" aria-label="Rezeptinhalt">
        ${tabs.map(t => `<button role="tab" id="tab-${t.id}" class="tab-v2 ${tab === t.id ? 'is-active' : ''}" aria-selected="${tab === t.id}" aria-controls="panel-${t.id}" tabindex="${tab === t.id ? '0' : '-1'}" data-action="set-detail-tab" data-id="${escapeAttr(t.id)}">${t.label}</button>`).join('')}
      </div>
      ${tabs.map(t => `<div class="tab-panel" id="panel-${t.id}" role="tabpanel" aria-labelledby="tab-${t.id}" ${tab === t.id ? '' : 'hidden'}><h2 class="sr-only">${t.label}</h2>${panelHtml[t.id]}</div>`).join('')}
      ${recipeCheckHtml(r)}
      </div></div>
    </main>
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
    ${shareSendModal()}
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
    <div class="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="${escapeAttr(id)}" tabindex="-1" onclick="event.stopPropagation()">
      <div class="sheet-handle" aria-hidden="true"></div>
      <h2 class="modal-title" id="${escapeAttr(id)}">${escapeHtml(title)}</h2>
      ${body}
    </div>
  </div>`;
}
function detailMenuModal(r) {
  const item = (action, icon, label, extra) => `<button class="menu-item ${extra || ''}" data-action="${action}" data-id="${escapeAttr(r.id)}">${icon}<span>${label}</span></button>`;
  return sheet('detail-menu-title', r.title || 'Rezept', `<div class="menu-list">
    ${item('edit-recipe', ICONS.edit, 'Bearbeiten')}
    ${item('duplicate-recipe', ICONS.copy, 'Duplizieren')}
    ${item('export-pdf', ICONS.pdf, 'Als PDF exportieren')}
    ${item('share-recipe', ICONS.share, 'Teilen')}
    ${item('share-open-send', ICONS.link, 'An Freund in Savora senden')}
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
    <div class="form-actions"><button class="ghost-btn" data-action="close-modal">Abbrechen</button><button class="primary-btn" data-action="save-note" data-id="${escapeAttr(r.id)}">Speichern</button></div>`);
}
function collectionsModal(r) {
  const cols = getCollections();
  return sheet('col-title', 'Sammlungen', `
    <div class="menu-list">
      ${cols.length ? cols.map(c => {
        const on = (r.collections || []).includes(c.id);
        return `<button class="menu-item" data-action="toggle-recipe-collection" data-id="${escapeAttr(r.id)}" data-col="${escapeHtml(c.id)}" role="checkbox" aria-checked="${on}"><span class="check-box ${on ? 'is-on' : ''}" aria-hidden="true">${ICONS.check}</span><span>${escapeHtml(c.name)}</span></button>`;
      }).join('') : '<p class="hint-line">Noch keine eigene Sammlung angelegt.</p>'}
    </div>
    <div class="inline-add">
      <label for="newCollectionName" class="sr-only">Neue Sammlung</label>
      <input id="newCollectionName" type="text" placeholder="Neue Sammlung, z.B. Sonntagsküche">
      <button class="primary-btn" data-action="create-collection" data-id="${escapeAttr(r.id)}">Sammlung erstellen</button>
    </div>`);
}

/* ---------- Auswahl-Sheet: Zutaten in den Einkauf ---------- */
function shopSelectModal() {
  const m = state.modal;
  const byRecipe = {};
  m.items.forEach(it => { (byRecipe[it.recipeId] = byRecipe[it.recipeId] || []).push(it); });
  const multi = Object.keys(byRecipe).length > 1;
  const dupCount = m.items.filter(it => it.dup).length;
  return sheet('shop-select-title', 'In den Einkauf übernehmen', `
    <p class="hint-line">Wähle, was du wirklich brauchst. Gleiche Zutaten mit passender Einheit werden zusammengeführt.</p>
    ${dupCount ? `<p class="hint-line shop-dup-hint" role="status">Schon auf der Einkaufsliste: ${dupCount} Zutat${dupCount === 1 ? '' : 'en'}. Sie sind abgewählt; setze einen Haken, um sie trotzdem nochmals hinzuzufügen.</p>` : ''}
    <div class="shop-select-list">
      ${Object.entries(byRecipe).map(([rid, list]) => `
        ${multi ? `<h4 class="shop-select-recipe">${escapeHtml(list[0].title)}</h4>` : ''}
        ${list.map(it => `<label class="shop-select-row ${it.dup ? 'is-dup' : ''}"><input type="checkbox" data-shop-key="${escapeHtml(it.key)}" ${it.selected ? 'checked' : ''}>
          <span class="ing-amount">${it.amount !== '' ? escapeHtml(shopAmountLine(it)) : escapeHtml(it.unit || '')}</span>
          <span class="ing-name">${escapeHtml(it.name)}${it.dup ? ' <span class="shop-dup-tag">schon auf der Liste</span>' : ''}</span></label>`).join('')}
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
        <button class="primary" data-action="cook-complete" data-id="${escapeAttr(r.id)}">Als gekocht speichern</button>
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
  const factor = servingsFactor(r, currentServings(r));
  const ingChips = shownIngs.map(i => `<button type="button" class="cook-ing ${checked.has(i._index) ? 'is-checked' : ''} ${i._ambiguous ? 'is-ambiguous' : ''}" data-action="toggle-ingredient-check" data-id="${escapeAttr(r.id)}" data-idx="${i._index}" role="checkbox" aria-checked="${checked.has(i._index)}"><span class="check-box" aria-hidden="true">${ICONS.check}</span>${escapeHtml(scaledAmountLine(i, factor))} ${escapeHtml(i.name)}${showGroups && i._group && (i._ambiguous || state.cookShowAllIngredients) ? `<span class="cook-ing-group">${escapeHtml(i._group)}</span>` : ''}</button>`).join('');
  const matchNote = state.cookShowAllIngredients ? '' : match.fixed ? 'Von dir festgelegt' : match.ambiguous ? 'Vorschlag, nicht eindeutig' : (stepIngs.length ? 'Vorschlag' : '');
  const body = state.cookAllSteps
    ? `<ol class="cook-all-steps">${steps.map((s, n) => `<li>${s._section ? `<div class="cook-section">${escapeHtml(s._section)}</div>` : ''}<button class="cook-all-step ${n === idx ? 'is-current' : ''}" data-action="cook-goto" data-idx="${n}"><span class="step-no">${n + 1}</span><span>${escapeHtml(s.text)}</span></button></li>`).join('')}</ol>`
    : `<div class="cook-step-card">
        ${step._section ? `<div class="cook-section">${escapeHtml(step._section)}</div>` : ''}
        <div class="cookmode-steptext">${renderStepWithTimers(step.text, idx)}</div>
      </div>
      <div class="cook-ings">
        <div class="cook-ings-head"><span>${state.cookShowAllIngredients ? 'Alle Zutaten' : (stepIngs.length ? 'Für diesen Schritt' : 'Keine Zutat im Schritt erkannt')}${matchNote ? ` <span class="cook-match-note">· ${matchNote}</span>` : ''}</span>
          <span class="cook-ings-actions">${!state.cookShowAllIngredients && step._sourceIndex !== undefined ? `<button class="text-btn cook-ings-btn" data-action="cook-edit-step-ings" data-idx="${step._sourceIndex}">Anpassen</button>` : ''}<button class="text-btn cook-ings-btn" data-action="cook-toggle-all-ings">${state.cookShowAllIngredients ? 'Nur dieser Schritt' : 'Alle Zutaten'}</button></span></div>
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
    <div class="cook-title-line"><span class="cook-title-text">${escapeHtml(r.title)}</span>${state.wakeLock ? `<span class="wakelock-chip">${ICONS.sun} Bildschirm bleibt an</span>` : (state.wakeLockUnsupported ? `<span class="wakelock-chip wakelock-chip--off">Bildschirm kann ausgehen</span>` : '')}</div>
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
      <h2 class="modal-title" id="step-ings-title">Zutaten für diesen Schritt</h2>
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
  const amount = i.amount !== '' && i.amount !== undefined && i.amount !== null ? escapeHtml(shopAmountLine(i)) : (i.unit ? escapeHtml(i.unit) : '');
  return `<div class="shop-row ${i.checked ? 'is-checked' : ''}" data-id="${escapeAttr(i.id)}">
    <button class="shop-check" data-action="toggle-shopping-item" data-id="${escapeAttr(i.id)}" role="checkbox" aria-checked="${!!i.checked}" aria-label="${escapeHtml(i.name)}"><span class="check-box" aria-hidden="true">${ICONS.check}</span></button>
    <div class="shop-text">
      <span class="shop-name">${amount ? `<strong>${amount}</strong> ` : ''}${escapeHtml(i.name)}</span>
      ${recipeTitles.length ? `<span class="shop-source">aus: ${escapeHtml(recipeTitles.join(', '))}</span>` : ''}
    </div>
    <button class="icon-btn icon-btn--small" data-action="open-shop-item" data-id="${escapeAttr(i.id)}" aria-label="${escapeHtml(i.name)} bearbeiten">${ICONS.moreH}</button>
  </div>`;
}
function shoppingView() {
  const items = state.shopping;
  const stay = state.shopStay || (state.shopStay = new Set());   // gerade abgehakt: bleibt an seiner Stelle, bis die Ansicht neu betreten wird
  const open = items.filter(i => (!i.checked && !i.have) || (i.checked && stay.has(i.id) && !i.have));
  const have = items.filter(i => i.have && (!i.checked || stay.has(i.id)));
  const done = items.filter(i => i.checked && !stay.has(i.id));
  const stayChecked = items.filter(i => i.checked && stay.has(i.id)).length;
  const grouped = {};
  open.forEach(i => { const s = shopSectionFor(i); (grouped[s] = grouped[s] || []).push(i); });
  const sections = SHOP_SECTIONS.filter(s => grouped[s]).map(s => `<section class="shop-section"><h2 class="shop-section-title">${escapeHtml(s)}</h2>${grouped[s].map(shoppingItemRow).join('')}</section>`).join('');
  const item = state.modal && state.modal.type === 'shop-item' ? state.shopping.find(x => x.id === state.modal.itemId) : null;
  return `
    ${topbar('Einkauf', { actions: items.length ? `<button class="icon-btn" data-action="share-shopping" aria-label="Liste teilen oder kopieren">${ICONS.share}</button><button class="icon-btn" data-action="clear-all-shopping" aria-label="Ganze Einkaufsliste leeren">${ICONS.trash}</button>` : '' })}
    <main class="has-tabbar shop-main">
      ${pageTitle('Einkaufsliste')}
      <div class="shop-add">
        <label for="shoppingAddInput" class="sr-only">Eigene Zutat hinzufügen</label>
        <input type="text" id="shoppingAddInput" placeholder="Eigene Zutat, z.B. 2 l Milch" enterkeyhint="done" autocomplete="off">
        <button class="round-btn round-btn--accent" data-action="add-shopping-item-manual" aria-label="Hinzufügen">${ICONS.plus}</button>
      </div>
      <div class="shop-quick"><button class="outline-btn" data-action="open-shop-from-recipes">${ICONS.book} Aus Rezepten</button><button class="outline-btn" data-action="nav-tab" data-view="mealplan">${ICONS.calendar} Aus Wochenplan</button></div>
      ${!items.length ? `<div class="empty-state">${ICONS.cart}<h2>Deine Einkaufsliste ist leer</h2><p>Übernimm Zutaten aus einem Rezept oder dem Wochenplan, oder tippe oben eine eigene Zutat ein.</p></div>` : `
        <button class="ghost-btn shop-sortdown" data-action="sort-checked-down" ${stayChecked ? '' : 'disabled'}>Erledigte nach unten</button>
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
      <div class="field"><label for="shopEditAmount">Menge</label><input type="text" id="shopEditAmount" inputmode="decimal" value="${escapeHtml(i.amount === '' || i.amount == null ? '' : qtyToStored(shopQty(i)) || String(i.amount))}"></div>
      <div class="field"><label for="shopEditUnit">Einheit</label><input type="text" id="shopEditUnit" value="${escapeHtml(i.unit || '')}"></div>
      <div class="field"><label for="shopEditSection">Bereich</label><select id="shopEditSection">${SHOP_SECTIONS.map(s => `<option ${shopSectionFor(i) === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label for="shopEditName">Bezeichnung</label><input type="text" id="shopEditName" value="${escapeHtml(i.name)}"></div>
    ${canSplit ? `<p class="hint-line">Zusammengeführt aus ${i.sources.length} Einträgen: ${escapeHtml(i.sources.map(s => `${s.amount !== '' ? shopAmountLine(s) : (s.unit || '')} ${s.title ? '(' + s.title + ')' : ''}`.trim()).join(', '))}</p>` : ''}
    <div class="menu-list">
      <button class="menu-item" data-action="toggle-shop-have" data-id="${escapeAttr(i.id)}">${ICONS.box}<span>${i.have ? 'Doch noch einkaufen' : 'Bereits vorhanden'}</span></button>
      ${canSplit ? `<button class="menu-item" data-action="split-shop-item" data-id="${escapeAttr(i.id)}">${ICONS.split}<span>Zusammenführung trennen</span></button>` : ''}
      <button class="menu-item menu-item--danger" data-action="delete-shopping-item" data-id="${escapeAttr(i.id)}">${ICONS.trash}<span>Entfernen</span></button>
    </div>
    <div class="form-actions"><button class="ghost-btn" data-action="close-modal">Abbrechen</button><button class="primary-btn" data-action="save-shop-item" data-id="${escapeAttr(i.id)}">Speichern</button></div>`);
}
function pickRecipesModal() {
  const sel = state.modal.selected || [];
  return sheet('pick-recipes-title', 'Rezepte wählen', `
    <div class="picker-list">
      ${state.recipes.map(r => `<label class="shop-select-row"><input type="checkbox" data-pick-recipe="${escapeAttr(r.id)}" ${sel.includes(r.id) ? 'checked' : ''}><span class="ing-name">${escapeHtml(r.title || 'Ohne Titel')}</span><span class="ing-amount">${escapeHtml(servingShort(r, r.servings || 1))}</span></label>`).join('') || '<p class="hint-line">Noch keine Rezepte vorhanden.</p>'}
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
  const isCurrentWeek = days.some(d => fmtDateKey(d) === todayKey);
  const weekEnd = days[6];
  const label = state.weekStart.getMonth() === weekEnd.getMonth()
    ? `${state.weekStart.getDate()}. – ${weekEnd.getDate()}. ${MONTH_LABELS[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`
    : `${state.weekStart.getDate()}. ${MONTH_LABELS[state.weekStart.getMonth()]} – ${weekEnd.getDate()}. ${MONTH_LABELS[weekEnd.getMonth()]}`;
  let weekHasEntries = false;
  const order = ['breakfast', 'lunch', 'dinner'];
  const dayCards = days.map((d, idx) => {
    const key = fmtDateKey(d);
    const entries = plannedItemsFor(key);   // Rezepte (vorhandene) und Notizen; leere Tage sind erlaubt
    const recipeCount = entries.filter(e => !isNoteEntry(e)).length;
    if (recipeCount) weekHasEntries = true;
    const selected = state.planSelectedDays.has(key);
    const sorted = entries.slice().sort((a, b) => { const ia = order.indexOf(a.meal), ib = order.indexOf(b.meal); return (ia < 0 ? 9 : ia) - (ib < 0 ? 9 : ib); });
    const isToday = key === todayKey;
    const dayName = WEEKDAY_LABELS[idx];
    const dayDate = `${d.getDate()}. ${MONTH_LABELS[d.getMonth()]}`;
    const rows = sorted.map(e => {
      if (isNoteEntry(e)) {
        return `<div class="plan-entry plan-entry--note">
          <button class="plan-entry-main" data-action="open-plan-entry" data-date="${escapeAttr(key)}" data-id="${escapeHtml(e.id)}" aria-label="Notiz ${escapeHtml(e.text)} bearbeiten">
            <span class="plan-entry-text">${e.meal ? `<span class="plan-meal">${escapeHtml(mealLabel(e.meal))}</span>` : ''}<span class="plan-title">${escapeHtml(e.text)}</span></span>
          </button>
        </div>`;
      }
      const r = state.recipes.find(x => x.id === e.recipeId);
      const servings = e.servings || r.servings || 0;
      const thumb = hasPhoto(r) ? recipeImageHtml(r, 'plan-thumb', 'thumb') : '';   // ohne Foto keine Platzhalterflaeche
      return `<div class="plan-entry ${thumb ? 'has-thumb' : ''}">
        <button class="plan-entry-main" data-action="open-recipe" data-id="${escapeAttr(r.id)}">
          ${thumb}
          <span class="plan-entry-text">${e.meal ? `<span class="plan-meal">${escapeHtml(mealLabel(e.meal))}</span>` : ''}<span class="plan-title">${escapeHtml(r.title || 'Ohne Titel')}</span><span class="plan-servings">${escapeHtml(servingLabel(r, servings))}</span></span>
        </button>
        <button class="icon-btn icon-btn--small" data-action="open-plan-entry" data-date="${escapeAttr(key)}" data-id="${escapeHtml(e.id)}" aria-label="Eintrag ${escapeHtml(r.title || '')} bearbeiten">${ICONS.moreH}</button>
      </div>`;
    }).join('');
    return `<section class="plan-day ${isToday ? 'is-today' : ''} ${entries.length ? '' : 'is-empty'}" aria-labelledby="day-${key}" ${isToday ? 'aria-current="date"' : ''}>
      <div class="plan-day-info">
        <h2 class="plan-day-title" id="day-${key}"><span class="plan-day-name">${dayName}</span> <span class="plan-day-date">${dayDate}</span>${isToday ? ' <span class="plan-today">Heute</span>' : ''}</h2>
        ${entries.length ? '' : '<p class="plan-empty">Nichts geplant</p>'}
      </div>
      <button type="button" class="plan-add" data-action="open-day-picker" data-date="${escapeAttr(key)}" aria-label="Rezept planen, ${dayName} ${dayDate}">${ICONS.plus}<span class="plan-add-label">Rezept planen</span></button>
      ${entries.length ? `<div class="plan-list">${rows}</div>` : ''}
      ${recipeCount ? `<div class="plan-day-foot"><label class="day-select"><input type="checkbox" data-plan-day="${escapeAttr(key)}" ${selected ? 'checked' : ''}> Einkaufen</label></div>` : ''}
    </section>`;
  }).join('');
  const selCount = Array.from(state.planSelectedDays).filter(k => days.some(d => fmtDateKey(d) === k)).length;
  return `
    ${topbar('Wochenplan')}
    <main class="has-tabbar plan-main">
      ${pageTitle('Wochenplan')}
      <div class="week-nav">
        <button data-action="week-prev" aria-label="Vorherige Woche">${ICONS.chevronLeft}</button>
        <div class="week-nav-mid">
          <span class="week-nav-label" id="weekNavLabel" tabindex="-1">${label}</span>
          <button type="button" class="week-today" data-action="week-today" aria-label="Zur aktuellen Woche, heute" ${isCurrentWeek ? 'disabled' : ''}>Heute</button>
        </div>
        <button data-action="week-next" aria-label="Nächste Woche">${ICONS.chevronRight}</button>
      </div>
      <div class="plan-week">${dayCards}</div>
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
      ${MEAL_SLOTS.map(m => `<button type="button" class="chip ${current === m.id ? 'chip--active' : ''}" role="radio" aria-checked="${current === m.id}" data-action="set-plan-meal" data-id="${escapeAttr(m.id)}">${m.label}</button>`).join('')}
    </div>
    <div class="field"><label for="planMealCustom">Eigene Bezeichnung (optional)</label><input id="planMealCustom" type="text" placeholder="z.B. Znüni oder Gäste" value="${escapeHtml(isCustom ? current : (customValue || ''))}"></div>`;
}
function recipePickerModal() {
  const m = state.modal;
  const [y, mo, d] = m.date.split('-').map(Number);
  const labelDate = new Date(y, mo - 1, d).toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' });
  return sheet('picker-modal-title', `Planen für ${labelDate}`, `
    ${mealSlotChooser(m.meal || '')}
    <div class="plan-quick" role="group" aria-label="Ohne Rezept eintragen">
      <h4 class="plan-quick-title">Ohne Rezept</h4>
      <div class="chip-row chip-row--wrap">
        <button type="button" class="chip" data-action="add-plan-note" data-note="Reste">Reste</button>
        <button type="button" class="chip" data-action="add-plan-note" data-note="Auswärts">Auswärts</button>
      </div>
      <div class="plan-note-row">
        <label for="planNoteInput" class="sr-only">Eigene Notiz</label>
        <input id="planNoteInput" type="text" maxlength="${PLAN_NOTE_MAX}" placeholder="Eigene Notiz, z. B. Pizza bei Anna" autocomplete="off" enterkeyhint="done" value="${escapeHtml(m.noteDraft || '')}">
        <button type="button" class="outline-btn" data-action="add-plan-note">Eintragen</button>
      </div>
    </div>
    <h4 class="plan-quick-title">Rezept wählen</h4>
    <div class="picker-list">
      ${state.recipes.map(r => `<button class="picker-item" data-action="assign-mealplan-recipe" data-date="${escapeAttr(m.date)}" data-id="${escapeAttr(r.id)}">${recipeImageHtml(r, 'picker-thumb', 'thumb')}<span>${escapeHtml(r.title || 'Ohne Titel')}</span></button>`).join('')}
    </div>`);
}
function planEntryModal() {
  const m = state.modal;
  const e = planEntriesFor(m.date).find(x => x.id === m.entryId);
  if (!e) return '';
  const moveSel = (days) => `<div class="field"><label for="planMoveDay">Verschieben auf</label><select id="planMoveDay">${days.map((d, i) => { const k = fmtDateKey(d); return `<option value="${escapeAttr(k)}" ${k === m.date ? 'selected' : ''}>${WEEKDAY_LABELS[i]}, ${d.getDate()}. ${MONTH_LABELS[d.getMonth()]}</option>`; }).join('')}</select></div>`;
  if (isNoteEntry(e)) {
    const wk = Array.from({ length: 7 }, (_, i) => addDays(state.weekStart, i));
    return sheet('plan-entry-title', 'Notiz', `
      <div class="field"><label for="planNoteEdit">Notiz</label><input id="planNoteEdit" type="text" maxlength="${PLAN_NOTE_MAX}" value="${escapeHtml(e.text || '')}" autocomplete="off"></div>
      ${mealSlotChooser(e.meal || '')}
      ${moveSel(wk)}
      <div class="form-actions">
        <button class="ghost-btn danger-btn" data-action="remove-plan-entry">Entfernen</button>
        <button class="primary-btn" data-action="save-plan-entry">Speichern</button>
      </div>`);
  }
  const r = state.recipes.find(x => x.id === e.recipeId) || { title: '', servings: 1 };
  const servings = e.servings || r.servings || 0;
  const days = Array.from({ length: 7 }, (_, i) => addDays(state.weekStart, i));
  return sheet('plan-entry-title', r.title || 'Eintrag', `
    ${yieldKnown(r) || e.servings > 0 ? `<div class="amount-row"><span class="amount-row-label">Menge für diesen Termin</span>
      <div class="stepper"><button data-action="plan-entry-servings" data-delta="-1" aria-label="Weniger">${ICONS.minus}</button><span class="stepper-value">${escapeHtml(servingLabel(r, servings))}</span><button data-action="plan-entry-servings" data-delta="1" aria-label="Mehr">${ICONS.plus}</button></div></div>
    <p class="hint-line">Das Rezept selbst bleibt bei ${escapeHtml(servingLabel(r, r.servings || 0))}.</p>` : `<p class="hint-line">Bei diesem Rezept fehlt die Angabe, wie viel es ergibt. Für diesen Termin gelten die Originalmengen. Ergänze die Angabe im Rezept, um zu skalieren.</p>`}
    ${mealSlotChooser(e.meal || '')}
    <div class="field"><label for="planMoveDay">Verschieben auf</label><select id="planMoveDay">${days.map((d, i) => { const k = fmtDateKey(d); return `<option value="${escapeAttr(k)}" ${k === m.date ? 'selected' : ''}>${WEEKDAY_LABELS[i]}, ${d.getDate()}. ${MONTH_LABELS[d.getMonth()]}</option>`; }).join('')}</select></div>
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
    <div class="menu-list">${days.map((d, i) => `<button class="menu-item" data-action="assign-mealplan-recipe" data-date="${fmtDateKey(d)}" data-id="${escapeAttr(m.recipeId)}">${ICONS.calendar}<span>${WEEKDAY_LABELS[i]}, ${d.getDate()}. ${MONTH_LABELS[d.getMonth()]}</span></button>`).join('')}</div>`);
}

/* Vorlagenwaehler (Radiogruppe, Tastatur und Touch) und Vorschau aus derselben Layoutdefinition wie der Export */
function coverPickerHtml(cfg) {
  const cv = cfg.cover || coverSanitizeConfig(null, true);
  const layout = coverLayout({ templateId: cv.templateId, title: cfg.title, name: cfg.author, slogan: cfg.subtitle, date: cv.date, showDate: cv.showDate, logo: cfg.showLogo !== false });
  const warn = layout.warnings.length ? `<ul class="cb-warnings" role="alert">${layout.warnings.map(w => `<li class="cb-warn cb-warn--error">${escapeHtml(w.message)}</li>`).join('')}</ul>` : '';
  const sig = JSON.stringify([cfg.title, cfg.subtitle, cfg.author, cv, cfg.showLogo]);
  return `<div class="cover-picker" data-sig="${escapeHtml(sig)}">
    <div class="cover-grid" role="radiogroup" aria-label="Titelblatt wählen">${COVER_TEMPLATES.map(t => `<button type="button" class="cover-opt ${t.id === layout.templateId ? 'is-active' : ''}" role="radio" aria-checked="${t.id === layout.templateId}" data-action="cb-cover-template" data-id="${escapeAttr(t.id)}" aria-label="${escapeHtml(t.name)}"><img src="${coverThumbUrl(t.id)}" alt="" loading="lazy" width="130" height="185"><span class="cover-opt-name">${escapeHtml(t.name)}</span>${t.id === layout.templateId ? `<span class="cover-opt-check" aria-hidden="true">${ICONS.check}</span>` : ''}</button>`).join('')}</div>
    <div class="cover-preview" aria-label="Vorschau des Titelblatts">${coverPreviewHtml(layout)}</div>
    ${warn}
  </div>`;
}
function coverPreviewHtml(layout) { return `<canvas class="cv-canvas" width="794" height="1123" role="img" aria-label="Vorschau des Titelblatts" data-layout="${escapeHtml(JSON.stringify(layout))}"></canvas>`; }

/* ---------- Kochbuch-Editor: ein Ablauf in drei Schritten ----------
   1 Rezepte auswaehlen (Auswahl, Reihenfolge, Kapitel), 2 Gestalten (Titelblatt, Texte, Datum, Seitenstil), 3 Vorschau und PDF.
   Der Schritt steht in state.cookbookStep; die Daten stehen im aktiven Kochbuch-Projekt (cookbooks.js). */
const COOKBOOK_STEPS = [{ n: 1, label: 'Rezepte auswählen' }, { n: 2, label: 'Gestalten' }, { n: 3, label: 'Vorschau & PDF' }];
function cookbookStepper(step) {
  return `<nav class="cb-steps" aria-label="Schritte beim Gestalten des Kochbuchs"><ol>${COOKBOOK_STEPS.map(t => {
    const cur = t.n === step;
    return `<li class="cb-step ${cur ? 'is-current' : ''} ${t.n < step ? 'is-done' : ''}"><button type="button" data-action="cb-step" data-id="${t.n}" ${cur ? 'aria-current="step"' : ''} aria-label="Schritt ${t.n} von 3: ${t.label}${t.n < step ? ', erledigt' : ''}"><span class="cb-step-no" aria-hidden="true">${t.n < step ? ICONS.check : t.n}</span><span class="cb-step-label">${t.label}</span></button></li>`;
  }).join('')}</ol></nav>`;
}
function cookbookStepFooter(step) {
  return `<div class="cb-step-footer">
    ${step > 1 ? `<button class="ghost-btn" data-action="cb-step" data-id="${step - 1}">${ICONS.chevronLeft} Zurück</button>` : '<span></span>'}
    ${step < 3 ? `<button class="primary-btn" data-action="cb-step" data-id="${step + 1}" aria-label="Weiter zu «${COOKBOOK_STEPS[step].label}»">Weiter ${ICONS.chevronRight}</button>` : ''}
  </div>`;
}
function cookbookStepSelect(cfg) {
  const byId = Object.fromEntries(state.recipes.map(r => [r.id, r]));
  const inBook = new Set(cfg.items.map(it => it.recipeId));
  const missing = state.recipes.filter(r => !inBook.has(r.id));
  return `
      <section class="panel">
        <h2 class="section-title" id="cbStepTitle" tabindex="-1">Rezepte auswählen</h2>
        <p class="hint-line" id="cbSelCount" aria-live="polite">${cfg.items.length} von ${state.recipes.length} ${state.recipes.length === 1 ? 'Rezept' : 'Rezepten'} im Kochbuch.${state.recipes.length ? ' Die Reihenfolge hier ist die Reihenfolge im Buch.' : ''}</p>
        ${state.recipes.length ? `<div class="cb-bulk">
          ${missing.length ? '<button class="outline-btn outline-btn--small" data-action="cb-add-all">Alle aufnehmen</button>' : ''}
          ${cfg.items.length ? '<button class="text-btn" data-action="cb-clear-all">Alle entfernen</button>' : ''}
        </div>` : '<p class="hint-line">Du hast noch keine Rezepte. Lege zuerst Rezepte an, dann kannst du sie hier auswählen.</p>'}
        ${cfg.items.map((it, n) => { const r = byId[it.recipeId]; return `<div class="cb-item">
          <span class="cb-item-no">${n + 1}</span>
          <span class="cb-item-title">${escapeHtml(r.title || 'Ohne Titel')}</span>
          ${cfg.chapters.length ? `<select aria-label="Kapitel für ${escapeHtml(r.title || '')}" data-cb-item-chapter="${escapeAttr(r.id)}"><option value="">Ohne Kapitel</option>${cfg.chapters.map(c => `<option value="${escapeHtml(c.id)}" ${it.chapterId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}</select>` : ''}
          <span class="cb-item-actions">
            <button class="icon-btn icon-btn--small" data-action="cb-move-item" data-id="${escapeAttr(r.id)}" data-delta="-1" ${n === 0 ? 'disabled' : ''} aria-label="${escapeHtml(r.title || '')} nach oben">${ICONS.arrowUp}</button>
            <button class="icon-btn icon-btn--small" data-action="cb-move-item" data-id="${escapeAttr(r.id)}" data-delta="1" ${n === cfg.items.length - 1 ? 'disabled' : ''} aria-label="${escapeHtml(r.title || '')} nach unten">${ICONS.arrowDown}</button>
            <button class="icon-btn icon-btn--small" data-action="cb-remove-item" data-id="${escapeAttr(r.id)}" aria-label="${escapeHtml(r.title || '')} aus dem Kochbuch nehmen">${ICONS.x}</button>
          </span></div>`; }).join('')}
        ${missing.length ? `<h3 class="sub-title">Nicht im Kochbuch</h3>${missing.map(r => `<div class="cb-item cb-item--out"><span class="cb-item-title">${escapeHtml(r.title || 'Ohne Titel')}</span><button class="outline-btn outline-btn--small" data-action="cb-add-item" data-id="${escapeAttr(r.id)}" aria-label="${escapeHtml(r.title || 'Ohne Titel')} ins Kochbuch aufnehmen">${ICONS.plus} Aufnehmen</button></div>`).join('')}` : ''}
      </section>
      <section class="panel">
        <h2 class="section-title">Kapitel</h2>
        ${cfg.chapters.map((c, n) => `<div class="cb-chapter"><input type="text" aria-label="Kapitelname" data-cb-chapter="${escapeHtml(c.id)}" value="${escapeHtml(c.name)}">
          <button class="icon-btn icon-btn--small" data-action="cb-move-chapter" data-id="${escapeHtml(c.id)}" data-delta="-1" ${n === 0 ? 'disabled' : ''} aria-label="Kapitel nach oben">${ICONS.arrowUp}</button>
          <button class="icon-btn icon-btn--small" data-action="cb-move-chapter" data-id="${escapeHtml(c.id)}" data-delta="1" ${n === cfg.chapters.length - 1 ? 'disabled' : ''} aria-label="Kapitel nach unten">${ICONS.arrowDown}</button>
          <button class="icon-btn icon-btn--small" data-action="cb-delete-chapter" data-id="${escapeHtml(c.id)}" aria-label="Kapitel ${escapeHtml(c.name)} löschen">${ICONS.trash}</button></div>`).join('') || '<p class="hint-line">Ohne Kapitel erscheinen alle Rezepte in einer Liste.</p>'}
        ${cfg.chapters.length ? `<label class="check-row"><input type="checkbox" data-cb-flag="chapterPages" ${cfg.chapterPages ? 'checked' : ''}> <span>Eigene Seite vor jedem Kapitel (sonst nur im Inhaltsverzeichnis)</span></label>` : ''}
        <div class="inline-add"><label for="cbNewChapter" class="sr-only">Name des neuen Kapitels</label><input type="text" id="cbNewChapter" placeholder="Neues Kapitel, z. B. Hauptgänge"><button class="primary-btn" data-action="cb-add-chapter">Kapitel hinzufügen</button></div>
      </section>`;
}
function cookbookPageStyleChoice(cfg) {
  const cur = cfg.pdfTemplate && PDF_TEMPLATES[cfg.pdfTemplate] ? cfg.pdfTemplate : pdfDefaultTemplateId();
  return `<div class="pdf-tpl-choice" role="radiogroup" aria-label="Seitenstil der Rezepte">
      ${Object.values(PDF_TEMPLATES).map(t => `<button type="button" role="radio" aria-checked="${cur === t.id}" class="pdf-tpl-opt ${cur === t.id ? 'active' : ''}" data-action="cb-page-style" data-id="${escapeAttr(t.id)}"><span class="pdf-tpl-swatch pdf-tpl-swatch-${t.id.toLowerCase()}" aria-hidden="true"></span><b>${t.name}</b><small>${t.hint}</small></button>`).join('')}
    </div>`;
}
function cookbookStepDesign(cfg) {
  return `
      <section class="panel">
        <h2 class="section-title" id="cbStepTitle" tabindex="-1">Titelblatt</h2>
        ${coverPickerHtml(cfg)}
        <div class="field"><label for="cbTitle">Titel des Kochbuchs</label><input type="text" id="cbTitle" data-cb-field="title" value="${escapeHtml(cfg.title || '')}" autocomplete="off"></div>
        <div class="field"><label for="cbSubtitle">Untertitel oder Slogan</label><input type="text" id="cbSubtitle" data-cb-field="subtitle" value="${escapeHtml(cfg.subtitle || '')}" autocomplete="off"></div>
        <div class="field"><label for="cbAuthor">Name auf dem Cover</label><input type="text" id="cbAuthor" data-cb-field="author" value="${escapeHtml(cfg.author || '')}" autocomplete="off"></div>
        <p class="hint-line">Alle drei Felder sind freiwillig. Was leer bleibt, wird nicht gedruckt. Der Name erscheint auch in der Fusszeile der Rezeptseiten.</p>
        <div class="field-row field-row--2">
          <div class="field"><label for="cbDate">Veröffentlichungsdatum</label><input type="date" id="cbDate" data-cb-cover-date value="${escapeHtml((cfg.cover && cfg.cover.date) || '')}"></div>
          <label class="check-row"><input type="checkbox" data-cb-cover-flag="showDate" ${cfg.cover && cfg.cover.showDate === false ? '' : 'checked'}> <span>Datum auf dem Titelblatt zeigen</span></label>
        </div>
        <label class="check-row"><input type="checkbox" data-cb-flag="showLogo" ${cfg.showLogo === false ? '' : 'checked'}> <span>Savora-Wortmarke oben rechts auf dem Titelblatt</span></label>
      </section>
      <section class="panel">
        <h2 class="section-title">Seitenstil der Rezepte</h2>
        <p class="hint-line">Gilt für alle Rezeptseiten dieses Kochbuchs. Das Titelblatt oben ist davon unabhängig.</p>
        ${cookbookPageStyleChoice(cfg)}
      </section>`;
}
function cookbookStepPreview(cfg) {
  const warnings = cookbookWarnings(cfg);
  const cv = cfg.cover || coverSanitizeConfig(null, true);
  const layout = coverLayout({ templateId: cv.templateId, title: cfg.title, name: cfg.author, slogan: cfg.subtitle, date: cv.date, showDate: cv.showDate, logo: cfg.showLogo !== false });
  const tpl = pdfTemplateById(cfg.pdfTemplate || pdfDefaultTemplateId());
  const tplName = (coverTemplateById(cv.templateId) || {}).name || '';
  const n = cfg.items.length;
  return `
      <section class="panel cb-final">
        <h2 class="section-title" id="cbStepTitle" tabindex="-1">Vorschau &amp; PDF</h2>
        <div class="cb-final-grid">
          <div class="cover-preview" aria-label="Vorschau des Titelblatts">${coverPreviewHtml(layout)}</div>
          <dl class="cb-summary">
            <div><dt>Rezepte</dt><dd>${n} ${n === 1 ? 'Rezept' : 'Rezepte'}${cfg.chapters.length ? `, ${cfg.chapters.length} ${cfg.chapters.length === 1 ? 'Kapitel' : 'Kapitel'}` : ''}</dd></div>
            <div><dt>Titelblatt</dt><dd>${escapeHtml(tplName)}</dd></div>
            <div><dt>Seitenstil</dt><dd>${escapeHtml(tpl.name)}</dd></div>
          </dl>
        </div>
        <h3 class="sub-title">Prüfung</h3>
        ${warnings.length ? `<ul class="cb-warnings">${warnings.map(w => `<li class="cb-warn cb-warn--${w.level}">${escapeHtml(w.text)}</li>`).join('')}</ul>` : '<p class="hint-line">Keine Auffälligkeiten gefunden.</p>'}
        <p class="hint-line">Inhaltsverzeichnis und Seitenzahlen werden automatisch erstellt.</p>
        <button class="primary-btn primary-btn--block" data-action="export-cookbook" ${n ? '' : 'disabled'}>${ICONS.pdf} PDF-Vorschau erstellen</button>
      </section>`;
}
function cookbookDesignerView() {
  coverEnsureConfig();   // legt Titelblatt-Daten (inkl. heutigem Datum bei neuen Projekten) einmalig an
  const cfg = getCookbookConfig();
  const book = cookbookActiveBook();
  const step = Math.min(3, Math.max(1, parseInt(state.cookbookStep, 10) || 1));
  return `
    ${topbar(book.name, { back: true, cls: 'topbar--book' })}
    <main class="has-tabbar cookbook-main" data-cb-step="${step}">
      ${cookbookStepper(step)}
      ${step === 1 ? cookbookStepSelect(cfg) : step === 2 ? cookbookStepDesign(cfg) : cookbookStepPreview(cfg)}
      ${cookbookStepFooter(step)}
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
  const chipSet = (label, id, options, keyOf, labelOf, action, dataAttr, activeList) => `<div class="field"><span class="field-label" id="${escapeAttr(id)}">${label}</span>
    <div class="diet-select-row" role="group" aria-labelledby="${escapeAttr(id)}">${options.map(o => { const k = keyOf(o); const on = (activeList || []).includes(k); return `<button type="button" class="diet-select-chip ${on ? 'active' : ''}" data-action="${action}" data-${dataAttr}="${k}" aria-pressed="${on}">${on ? ICONS.check : ''}${labelOf(o)}</button>`; }).join('')}</div></div>`;
  const realCount = realIngredients(r).length;
  const missingAmounts = qtyMissingIngredients(realIngredients(r)).length;
  const stepCount = (r.steps || []).filter(s => (s.text || '').trim()).length;
  return `
    ${topbar(isNew ? 'Neues Rezept' : 'Rezept bearbeiten', { back: true, actions: `<button class="text-btn text-btn--strong" data-action="save-recipe">Speichern</button>` })}
    <main class="form-main">
      <div class="form-page" id="recipeForm">
        ${showDraft ? `<div class="draft-banner" role="status"><span>Es gibt einen ungespeicherten Entwurf vom ${new Date(draft.savedAt).toLocaleString('de-CH', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}.</span>
          <span class="draft-actions"><button class="text-btn" data-action="discard-draft">Verwerfen</button><button class="outline-btn outline-btn--small" data-action="restore-draft">Wiederherstellen</button></span></div>` : ''}
        ${importSummaryBanner(r._importSummary, r)}
        <nav class="form-stepper" aria-label="Erfassungsschritte">
          ${FORM_STEPS.map((s, n) => `<button type="button" class="form-step-btn ${n === step ? 'is-active' : ''} ${n < step ? 'is-done' : ''}" data-action="form-goto-step" data-idx="${n}" aria-current="${n === step ? 'step' : 'false'}"><span class="form-step-no">${n + 1}</span><span class="form-step-label">${s}</span></button>`).join('')}
        </nav>
        <section class="form-step ${step === 0 ? 'is-active' : ''}" data-form-step="0" aria-label="Basis">
          <div class="field"><label for="f-title">Titel</label><input type="text" id="f-title" value="${escapeHtml(r.title)}" placeholder="z.B. Zitronen-Risotto"></div>
          <div class="field"><label for="f-image">Foto</label>
            <div class="image-drop" id="imgDrop">
              ${recipeSafeImage(r) ? `<img src="${escapeHtml(recipeSafeImage(r))}" alt="">` : recipeSafeImageId(r) ? `<div data-lazy-img="full" data-image-id="${escapeHtml(recipeSafeImageId(r))}" class="image-drop-placeholder">${ICONS.chef}</div>` : `<div class="image-drop-placeholder">${ICONS.chef}<span>Foto auswählen</span></div>`}
              <input type="file" accept="image/*" id="f-image" aria-label="Foto auswählen">
            </div></div>
          <div class="field-row field-row--2">
            <div class="field"><label for="f-servings">Menge</label><input type="number" id="f-servings" min="1" value="${Number(r.servings) > 0 ? r.servings : ''}" placeholder="${Number(r.servings) > 0 ? '' : 'unbekannt'}"></div>
            <div class="field"><label for="f-serving-mode">Einheit</label><select id="f-serving-mode"><option value="portions" ${servingMode(r) === 'portions' ? 'selected' : ''}>Portionen</option><option value="pieces" ${servingMode(r) === 'pieces' ? 'selected' : ''}>Stück</option></select></div>
          </div>
          <div class="field-row field-row--2">
            <div class="field"><label for="f-time">Zeit (Min.)</label><input type="number" id="f-time" min="0" value="${r.timeMinutes > 0 ? r.timeMinutes : ''}" placeholder="${r.timeMinutes > 0 ? '' : 'unbekannt'}"></div>
            <div class="field"><label for="f-difficulty">Schwierigkeit</label><select id="f-difficulty">${['', 'Einfach', 'Mittel', 'Anspruchsvoll'].map(d => `<option value="${escapeAttr(d)}" ${(r.difficulty || '') === d ? 'selected' : ''}>${d || 'Keine Angabe'}</option>`).join('')}</select></div>
          </div>
          <details class="field-more"${(r.prepMinutes || r.restMinutes || r.cookMinutes) ? ' open' : ''}><summary>Weitere Zeitangaben (optional)</summary>
            <div class="field-row field-row--3">
              <div class="field"><label for="f-prep">Vorbereitungszeit (Min.)</label><input type="number" id="f-prep" min="0" value="${r.prepMinutes || ''}"></div>
              <div class="field"><label for="f-rest">Ruhen (Min.)</label><input type="number" id="f-rest" min="0" value="${r.restMinutes || ''}"></div>
              <div class="field"><label for="f-cook">Garen/Backen (Min.)</label><input type="number" id="f-cook" min="0" value="${r.cookMinutes || ''}"></div>
            </div>
            <p class="hint-line">Nur ausfüllen, was du sicher weisst. Leere Felder bleiben unbekannt und werden nicht erfunden.</p>
          </details>
        </section>
        <section class="form-step ${step === 1 ? 'is-active' : ''}" data-form-step="1" aria-label="Kategorien">
          ${chipSet('Ernährungsform', 'diet-group-label', DIET_OPTIONS.filter(d => d.tone === 'diet'), d => d.key, d => d.label, 'toggle-diet', 'diet', r.diet)}
          ${chipSet('Fleisch / Fisch', 'protein-group-label', DIET_OPTIONS.filter(d => d.tone === 'protein'), d => d.key, d => d.label, 'toggle-diet', 'diet', r.diet)}
          <p class="settings-hint">Hinweise wie „frei von“ bitte immer selbst prüfen, keine medizinische Zusicherung.</p>
          ${chipSet('Hinweise / Frei von', 'free-group-label', DIET_OPTIONS.filter(d => d.tone === 'free'), d => d.key, d => d.label, 'toggle-diet', 'diet', r.diet)}
          ${chipSet('Mahlzeit', 'meal-group-label', MEAL_TYPE_OPTIONS, m => m.id, m => m.label, 'toggle-category', 'category', r.categoryTags)}
          ${chipSet('Gericht', 'dish-group-label', DISH_TYPE_OPTIONS, d => d.id, d => d.label, 'toggle-category', 'category', r.categoryTags)}
          <button type="button" class="ghost-btn" data-action="reanalyze-categories">${ICONS.sparkle} Kategorien automatisch vorschlagen</button>
          <div class="field field--spaced"><label for="f-tag-new">Eigene Schlagwörter</label>
            <div class="tag-input-row" id="tagInputRow">${(r.tags || []).map(t => `<span class="tag-pill">${escapeHtml(t)}<button data-action="remove-tag" data-tag="${escapeHtml(t)}" aria-label="Schlagwort ${escapeHtml(t)} entfernen">${ICONS.x}</button></span>`).join('')}<input type="text" id="f-tag-new" placeholder="Schlagwort + Enter"></div>
            <div class="field-hint">Eigene Stichwörter zum Wiederfinden, z.B. Familienrezept, Für Gäste, Von Oma.</div></div>
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
            ${(() => { const iss = typeof recipeQualityIssues === 'function' ? recipeQualityIssues(r) : []; return iss.length ? `<h3 class="sub-title">Hinweise</h3><ul class="review-list">${iss.map(i => `<li class="warn">${escapeHtml(i.text)}</li>`).join('')}</ul><p class="hint-line">Nichts wird automatisch geändert. Nach dem Speichern kannst du Vorschläge auf der Rezeptseite einzeln übernehmen.</p>` : ''; })()}
          </div>
          ${!isNew ? `<button type="button" class="text-btn danger-link" data-action="confirm-delete" data-id="${escapeAttr(r.id)}">${ICONS.trash} Rezept löschen</button>` : ''}
        </section>
        <div class="form-actions form-actions--sticky">
          ${step > 0 ? `<button class="ghost-btn" data-action="form-goto-step" data-idx="${step - 1}">Zurück</button>` : `<button class="ghost-btn" data-action="back">Abbrechen</button>`}
          ${step < FORM_STEPS.length - 1 ? `<button class="primary-btn" data-action="form-goto-step" data-idx="${step + 1}">Weiter</button>` : `<button class="primary-btn" data-action="save-recipe">Rezept speichern</button>`}
        </div>
      </div>
      ${formAsideHtml(r)}
    </main>
    ${state.modal && state.modal.type === 'delete' ? deleteModal(r) : ''}
    ${state.modal && state.modal.type === 'ing-paste' ? ingPasteModal() : ''}
  `;
}
/* Seitenspalte im Editor (Paket 42): Vorschau des Rezepts aus den eingegebenen Daten, nur ab Laptopbreite sichtbar.
   Sie wird beim Tippen ohne Neuaufbau aktualisiert (updateFormAside in actions-v2.js). */
function formAsideBodyHtml(r) {
  const title = (r.title || '').trim();
  const portions = Number(r.servings) > 0 ? servingLabel(r, r.servings) : '';
  const meta = [portions, r.timeMinutes > 0 ? `${r.timeMinutes} Min.` : '', r.difficulty || ''].filter(Boolean);
  const ings = realIngredients(r).length;
  const missing = qtyMissingIngredients(realIngredients(r)).length;
  const steps = (r.steps || []).filter(s => (s.text || '').trim()).length;
  const labels = [];
  (r.diet || []).forEach(dk => { const d = DIET_OPTIONS.find(o => o.key === dk); if (d) labels.push(d.label); });
  (r.categoryTags || []).forEach(c => labels.push(categoryLabelFor(c)));
  const tags = (r.tags || []).filter(Boolean);
  return `<h2 class="form-aside-title">${escapeHtml(title && title !== 'Ohne Titel' ? title : 'Noch ohne Titel')}</h2>
    <p class="form-aside-meta">${meta.length ? escapeHtml(meta.join(' · ')) : 'Menge und Zeit noch offen'}</p>
    <ul class="form-aside-facts">
      <li>${ings} Zutat${ings === 1 ? '' : 'en'}${missing ? `, davon ${missing} ohne Menge` : ''}</li>
      <li>${steps} Zubereitungsschritt${steps === 1 ? '' : 'e'}</li>
      ${labels.length ? `<li>${escapeHtml(labels.join(', '))}</li>` : ''}
      ${tags.length ? `<li>Schlagwörter: ${escapeHtml(tags.join(', '))}</li>` : ''}
    </ul>`;
}
function formAsideHtml(r) {
  const photo = recipeSafeImage(r)
    ? `<img class="form-aside-img" src="${escapeHtml(recipeSafeImage(r))}" alt="">`
    : recipeSafeImageId(r) ? `<div class="form-aside-img placeholder" data-lazy-img="full" data-image-id="${escapeHtml(recipeSafeImageId(r))}" data-img-class="form-aside-img" data-img-alt=""></div>` : '';
  return `<aside class="form-aside" id="formAside" aria-label="Vorschau des Rezepts">
    ${photo ? `<div class="form-aside-photo">${photo}</div>` : ''}
    <div class="form-aside-body" id="formAsideBody">${formAsideBodyHtml(r)}</div>
  </aside>`;
}
