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

const TAB_VIEWS = ['home', 'mealplan', 'shopping', 'cookbooks', 'more'];
const DAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/* ---------- Navigation ----------
   Genau fuenf Punkte: Rezepte, Wochenplan, Einkauf, Kochbuecher und Mehr (Route 'more').
   Bis 899 px liegt die Leiste unten (Handy und Tablet hochkant), ab 900 px als Seitenleiste; der letzte Punkt heisst ueberall «Mehr».
   Ein Zahnrad im Kopf gibt es nicht mehr. «Mehr» bleibt auf allen Unterseiten (Einstellungen, Freunde & Rezepte, Rechner, Hilfe, Ueber Savora) aktiv. */
function navTabActive(view) {
  const v = state.view;
  if (view === 'home') return v === 'home' || v === 'detail' || v === 'discover' || v === 'lib-detail' || v === 'lib-profile' || v === 'lib-publish';
  if (view === 'cookbooks') return v === 'cookbooks' || v === 'cookbook';
  if (view === 'more') return isMoreSectionView(v);
  return v === view;
}
/* Handy-Layout (unter 768 px): Startseite als Rezeptliste. Tablet und Desktop behalten ihre bisherige Startseite. */
const PHONE_QUERY = '(max-width: 767px)';
function isPhoneLayout() { return !!(window.matchMedia && matchMedia(PHONE_QUERY).matches); }
function bottomNav() {
  const tabs = [
    { view: 'home', icon: ICONS.bookOpen, label: 'Rezepte' },
    { view: 'mealplan', icon: ICONS.calendar, label: 'Wochenplan' },
    { view: 'shopping', icon: ICONS.cart, label: 'Einkauf' },
    { view: 'cookbooks', icon: ICONS.books, label: 'Kochbücher' },
    { view: 'more', icon: ICONS.menu, label: 'Mehr', cls: 'nav-settings' },
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

/* v84: kam man über «Passt dazu» von Rezept A, heisst die Zurück-Taste «Zurück zu <Titel A>» (A steht in history.state.linkPrev) */
function linkBackLabel() {
  const hs = history.state, prev = hs && hs.view === 'detail' && hs.activeRecipeId === state.activeRecipeId && hs.linkPrev ? state.recipes.find(x => x.id === hs.linkPrev) : null;
  return prev && prev.title ? `Zurück zu ${prev.title}` : 'Zurück';
}

function topbar(title, opts = {}) {
  const left = opts.back
    ? `<button class="icon-btn" data-action="back" aria-label="${escapeAttr(opts.backLabel || 'Zurück')}">${ICONS.back}</button>`
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
  // v84: zuerst der gewaehlte Bereich (Alle, Favoriten, Ohne Sammlung, Freunde, eigene Sammlung), dann Suche, Filter, Sortierung
  let list = hvScopeList(hvScope(), recipes);
  if (state.query.trim()) list = list.filter(r => recipeMatchesQuery(r, state.query));
  if (state.activeTag) list = list.filter(r => (r.tags || []).includes(state.activeTag));
  if (state.favOnly) list = list.filter(r => r.favorite);
  const { dietary, category, time, more, tags } = f;
  // Vegetarisch schliesst vegan ein (vegan ist immer auch vegetarisch); sonst keine stillen Zusatzklassifikationen
  if (dietary.size) list = list.filter(r => { const bad = new Set(dietConflicts(r).map(c => c.label)); return (r.diet || []).some(d => !bad.has(d) && (dietary.has(d) || (d === 'vegan' && dietary.has('vegetarisch')))); });
  if (category.size) list = list.filter(r => categoryFilterMatches(r, category));
  if (time.size) list = list.filter(r => timeBucketsFor(r.timeMinutes).some(b => time.has(b)));
  if (more && more.has('rating4')) list = list.filter(r => recipeRating(r) >= 4);   // v90: ab 4 Sternen
  if (more && more.size) { const ids = Array.from(more).filter(id => id !== 'rating4'); if (ids.length) list = list.filter(r => ids.some(id => hvScopeList(id, [r]).length)); }
  if (tags && tags.size) list = list.filter(r => (r.tags || []).some(t => tags.has(t)));
  return hvSortRecipes(list, state.sortBy);
}

/* Weitere Merkmale: nur Kochzustaende (v84: Sammlungen und «Rezepte von Freunden» stehen in der Sammlungsauswahl). */
function moreFilterOptions() {
  const opts = [{ id: 'uncooked', label: 'Noch nicht gekocht' }, { id: 'rating4', label: 'Ab 4 Sternen' }];
  if (state.recipes.some(isFrequentlyCooked) || state.activeFilters.more.has('frequent')) opts.push({ id: 'frequent', label: 'Häufig gekocht' });
  return opts;
}
function moreFilterLabel(id) {
  const o = moreFilterOptions().find(x => x.id === id);
  if (o) return o.label;
  return ({ quick: 'Schnell', veggie: 'Vegetarisch', favorites: 'Favoriten' })[id] || hvScopeLabel(id);
}
function appliedFilterLabels() {
  const f = filterSpec(), out = [];
  f.dietary.forEach(id => out.push(categoryLabelFor(id)));
  f.category.forEach(id => out.push(categoryLabelFor(id)));
  f.time.forEach(id => out.push((TIME_BUCKET_OPTIONS.find(t => t.id === id) || {}).label || id));
  f.more.forEach(id => out.push(moreFilterLabel(id)));
  f.tags.forEach(t => out.push(t));
  if (state.activeTag) out.push(state.activeTag);
  return out;   // v84: der Bereich (Sammlung) steht im Titel, nicht in der Filterzusammenfassung
}
/* «Zurücksetzen» setzt nur Filter zurück, nie den gewählten Bereich (Sammlung, Favoriten). */
function resetExtraFilters() {
  const f = filterSpec();
  f.dietary.clear(); f.category.clear(); f.time.clear(); f.more.clear(); f.tags.clear();
  state.activeTag = null;
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
  return draft;
}
function filterDraft() {
  if (!state.modal || state.modal.type !== 'filter-sheet') return null;
  if (!state.modal.draft) state.modal.draft = newFilterDraft();
  return state.modal.draft;
}
function filterOptionHtml(type, dim, id, label, checked, extra) {
  const wide = String(label || '').split(/\s+/).some(w => w.length > 11);   // v89 B: lange Wörter («Meeresfrüchte») ohne Silbentrennung: Option über die ganze Breite
  return `<label class="fs-opt ${extra ? 'fs-opt--extra' : ''}${wide ? ' fs-opt--wide' : ''}"><input class="fs-input" type="${type}" ${type === 'radio' ? 'name="fs-time"' : ''} data-fs-dim="${dim}" value="${escapeHtml(id)}" ${checked ? 'checked' : ''}><span class="fs-mark" aria-hidden="true">${ICONS.check}</span><span class="fs-text">${escapeHtml(label)}</span></label>`;
}
function filterGroupHtml(key, title, inner, opts) {
  const id = `filter-group-${key}`;
  const o = opts || {};
  // Viele Optionen (v0.83): zuerst die ersten FS_VISIBLE, Rest aufklappbar. Gewählte ausgeblendete Optionen bleiben sichtbar (CSS :has), die Auswahl bleibt beim Zuklappen.
  const more = o.extraCount ? `<button type="button" class="text-btn fs-more-toggle" data-fs-toggle="${escapeAttr(key)}" aria-expanded="${o.open ? 'true' : 'false'}" aria-controls="fs-opts-${escapeAttr(key)}">${o.open ? 'Weniger zeigen' : `Alle ${o.total} anzeigen`}</button>` : '';
  return `<fieldset class="fs-group ${o.extraCount && !o.open ? 'is-collapsed' : ''}" data-fs-group="${escapeAttr(key)}"><legend class="filter-group-title fs-legend" id="${escapeAttr(id)}">${title}</legend>${o.hint ? `<p class="fs-hint">${o.hint}</p>` : ''}<div class="fs-opts" id="fs-opts-${escapeAttr(key)}">${inner}</div>${more}</fieldset>`;
}
const FS_VISIBLE = 8;
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
    <div class="modal-sheet filter-sheet" role="dialog" aria-modal="true" aria-labelledby="filter-sheet-title" tabindex="-1" data-stop-click>
      <div class="sheet-handle" aria-hidden="true"></div>
      <div class="fs-head">
        <h2 class="fs-title" id="filter-sheet-title">Rezepte filtern</h2>
        <button type="button" class="fs-close" data-action="close-modal" aria-label="Schliessen">${ICONS.x}</button>
      </div>
      <div class="fs-body">
        ${filterGroupHtml('dietary', 'Ernährung', dietaryOptions.map(o => filterOptionHtml('checkbox', 'dietary', o.key, o.label, d.dietary.has(o.key))).join(''))}
        ${filterGroupHtml('meal', 'Mahlzeit', MEAL_TYPE_OPTIONS.map(o => filterOptionHtml('checkbox', 'category', o.id, o.label, d.category.has(o.id))).join(''))}
        ${filterGroupHtml('dish', 'Gerichtart', DISH_TYPE_OPTIONS.map((o, i) => filterOptionHtml('checkbox', 'category', o.id, o.label, d.category.has(o.id), i >= FS_VISIBLE)).join(''), { extraCount: Math.max(0, DISH_TYPE_OPTIONS.length - FS_VISIBLE), total: DISH_TYPE_OPTIONS.length, open: !!state.modal.dishOpen })}
        ${filterGroupHtml('time', 'Gesamtzeit', filterOptionHtml('radio', 'time', '', 'Beliebig', timeNone) + TIME_BUCKET_OPTIONS.map(o => filterOptionHtml('radio', 'time', o.id, o.label, d.time.has(o.id))).join(''), { hint: 'Gesamtzeit inklusive Warte- und Ruhezeiten. Rezepte ohne Zeitangabe erscheinen bei einer Zeitauswahl nicht.' })}
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
    sheet.addEventListener('click', (e) => {
      const t = e.target.closest && e.target.closest('.fs-more-toggle');
      if (!t || !state.modal) return;
      const grp = t.closest('.fs-group');
      const open = grp.classList.contains('is-collapsed');
      grp.classList.toggle('is-collapsed', !open);
      state.modal.dishOpen = open;
      t.setAttribute('aria-expanded', String(open));
      t.textContent = open ? 'Weniger zeigen' : `Alle ${grp.querySelectorAll('.fs-opt').length} anzeigen`;
    });
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
      // v84: Favoriten sind ein Bereich der Sammlungsauswahl, die Sortierung aendert den Bereich nie
      if (!HV_SORT_OPTIONS.some(o => o.id === sel.value)) return;
      state.sortBy = sel.value;
      try { localStorage.setItem(SORT_KEY, state.sortBy); } catch (err) {}
      motionFlipRecipes(render);   // Karten gleiten an ihre neue Stelle (Bewegung M1)
    });
  }
  // v84: die Leiste «Alle / Favoriten» gibt es nicht mehr; motionSegInit findet keine .seg und löst dann nur seinen Beobachter.
  if (typeof motionSegInit === 'function') motionSegInit();
  hvAnnounceCount();
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
/* v89: Platzhalter fuer Rezepte ohne Foto: Kachel mit dem Anfangsbuchstaben in Lilita One auf zartem Tomatenton
   (ersetzt das graue Buchsymbol). cls = Bildklasse der Stelle (z. B. 'rrow-img rrow-ph'), Groesse kommt von dort. */
function recipeInitialLetter(r) {
  const m = String((r && r.title) || '').match(/\p{L}|\p{N}/u);
  return m ? m[0].toLocaleUpperCase('de-CH') : '';
}
function recipeInitialHtml(r, cls) {
  const ch = recipeInitialLetter(r);
  return `<span class="${escapeAttr(cls)} ph-initial" aria-hidden="true">${ch ? `<span class="ph-initial-letter">${escapeHtml(ch)}</span>` : ICONS.bookOpen}</span>`;
}
function recipeMetaLine(r, full) {
  const parts = [];
  const ct = timeInfo(r).cardText;   // Zeitbasis ueberall: Gesamtzeit (timeMinutes)
  if (ct) parts.push(ct);
  if (full && yieldKnown(r)) parts.push(servingLabel(r, r.servings));   // «4 Portionen», «12 Stück», «1 Glas»
  return parts.join(' · ');
}
/* v90: Bewertung 1 bis 5 Sterne. Gültig sind nur ganze Zahlen 1 bis 5, alles andere heisst «nicht bewertet». */
function recipeRating(r) {
  const n = r && Number(r.rating);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 0;
}
function ratingStarSvg(filled) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/></svg>`;
}
function ratingBlockHtml(r) {
  const cur = recipeRating(r);
  const star = (n) => `<button type="button" class="rate-star ${n <= cur ? 'is-on' : ''}" role="radio" aria-checked="${n === cur ? 'true' : 'false'}" tabindex="${(cur ? n === cur : n === 1) ? '0' : '-1'}" data-action="rate-recipe" data-id="${escapeAttr(r.id)}" data-val="${n}" aria-label="${n} von 5 Sternen">${ratingStarSvg(n <= cur)}</button>`;
  return `<section class="rating-block" aria-labelledby="rating-h-${escapeAttr(r.id)}">
    <h2 class="rating-title" id="rating-h-${escapeAttr(r.id)}">Deine Bewertung</h2>
    <div class="rating-row" role="radiogroup" aria-labelledby="rating-h-${escapeAttr(r.id)}" data-rating-group>${[1, 2, 3, 4, 5].map(star).join('')}</div>
    <p class="rating-hint" id="rating-hint" role="status" aria-live="polite">${cur ? `${cur} von 5 Sternen. Tippe den gleichen Stern nochmal an, um die Bewertung zu entfernen.` : 'Noch nicht bewertet.'}</p>
  </section>`;
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
    const time = timeInfo(r).cardText ? `<span class="rcard-meta rcard-meta--time" title="Gesamtzeit">${ICONS.clock}<span>${timeInfo(r).cardText}</span></span>` : '';
    return `<article class="rcard rcard--phone${hvPickedCls(r)}" data-flip-id="${escapeAttr(r.id)}">
    <button type="button" class="rcard-main" ${hvMainAttrs(r, title)}>${hvPickMark(r)}
      ${photo ? recipeImageHtml(r, 'rcard-img', 'thumb') : recipeInitialHtml(r, 'rcard-img rcard-ph')}
      <span class="rcard-body">
        <span class="rcard-title">${titleHl}</span>${searchIngredientHitHtml(r, state.query)}
        ${time}
      </span>
    </button>
    ${favButton(r, 'rcard-fav')}
  </article>`;
  }
  // v91.15: ohne Foto dieselbe Kartenform wie mit Foto, Anfangsbuchstabe als Bild (wie auf dem Handy)
  return `<article class="rcard ${photo ? '' : 'rcard--initial'}${hvPickedCls(r)}" data-flip-id="${escapeAttr(r.id)}">
    <button type="button" class="rcard-main" ${hvMainAttrs(r, title)}>${hvPickMark(r)}
      ${photo ? recipeImageHtml(r, 'rcard-img', 'thumb') : recipeInitialHtml(r, 'rcard-img rcard-ph')}
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
    const time = timeInfo(r).cardText ? `<span class="rrow-meta rrow-meta--time" title="Gesamtzeit">${ICONS.clock}<span>${timeInfo(r).cardText}</span></span>` : '';
    return `<article class="rrow rrow--phone${hvPickedCls(r)}" data-flip-id="${escapeAttr(r.id)}">
    <button type="button" class="rrow-main" ${hvMainAttrs(r, title)}>${hvPickMark(r)}
      ${photo ? recipeImageHtml(r, 'rrow-img', 'thumb') : recipeInitialHtml(r, 'rrow-img rrow-ph')}
      <span class="rrow-body">
        <span class="rrow-title">${titleHl}</span>${searchIngredientHitHtml(r, state.query)}
        ${time}
      </span>
    </button>
    ${favButton(r, 'rrow-fav')}
  </article>`;
  }
  return `<article class="rrow ${photo ? '' : 'rrow--text'}${hvPickedCls(r)}" data-flip-id="${escapeAttr(r.id)}">
    <button type="button" class="rrow-main" ${hvMainAttrs(r, escapeHtml(r.title || 'Ohne Titel'))}>${hvPickMark(r)}
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
/* v91.15: als Karte mit Bild (oder Anfangsbuchstabe), Titel und Zeit; mehrere Einträge nebeneinander zum Wischen */
function todayPlannedHtml() {
  const items = plannedItemsFor(fmtDateKey(new Date()));
  if (!items.length) return '';
  const label = (e) => {
    if (isNoteEntry(e)) return `<span class="today-note">${escapeHtml(e.text)}</span>`;
    const r = state.recipes.find(x => x.id === e.recipeId);
    if (!r) return '';
    const img = hasPhoto(r) ? recipeImageHtml(r, 'today-thumb', 'thumb') : recipeInitialHtml(r, 'today-thumb today-thumb--ph');
    const time = timeInfo(r).cardText;
    return `<button type="button" class="today-link today-card" data-action="open-recipe" data-id="${escapeAttr(r.id)}">${img}<span class="today-text"><span class="today-kicker">Heute</span><span class="today-title">${escapeHtml(r.title || 'Ohne Titel')}</span>${time ? `<span class="today-meta">${ICONS.clock}${escapeHtml(time)}</span>` : ''}</span><span class="today-go" aria-hidden="true">${ICONS.chevronRight}</span></button>`;
  };
  return `<section class="today-planned" aria-label="Heute geplant"><span class="today-label sr-only">Heute geplant</span><div class="today-cards">${items.map(label).join('')}</div></section>`;
}
/* v91.15: Favoriten als Karussell zum Seitwärtswischen (nur ohne Suche, Filter und Auswahl, in «Alle Rezepte») */
function favRailHtml() {
  const favs = state.recipes.filter(r => r && r.favorite).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 12);
  if (!favs.length) return '';
  const card = (r, i) => `<li class="fav-rail-item" style="--i:${Math.min(i, 8)}"><button type="button" class="fav-rail-card" data-action="open-recipe" data-id="${escapeAttr(r.id)}">${hasPhoto(r) ? recipeImageHtml(r, 'fav-rail-img', 'thumb') : recipeInitialHtml(r, 'fav-rail-img fav-rail-ph')}<span class="fav-rail-title">${escapeHtml(r.title || 'Ohne Titel')}</span></button></li>`;
  return `<section class="fav-rail" aria-labelledby="fav-rail-h"><h2 class="fav-rail-h" id="fav-rail-h">Favoriten <span class="fav-rail-count">${favs.length}</span></h2><ul class="fav-rail-list">${favs.map(card).join('')}</ul></section>`;
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
/* ===== v84 Übersicht: Sammlungsauswahl, Auswahlmodus, Sammlungen verwalten, Sortierung =====
   Daten nur über org.js (Helfer DATEN). Fehlt org.js (alter Zwischenspeicher), greift ein Rückfall auf das alte
   Modell (savora-collections + recipe.collections), damit nichts kaputt wirkt.
   Bereich = state.activeCollection: 'all' | 'favorites' | 'none' (Ohne Sammlung) | 'friends' | <Sammlungs-ID>.
   Eine Sammlung zur Zeit; Suche und Filter wirken innerhalb des Bereichs. */
const HV_COLORS = [{ id: 'tomato', label: 'Tomate' }, { id: 'sage', label: 'Salbei' }, { id: 'mustard', label: 'Senf' }, { id: 'plum', label: 'Pflaume' }, { id: 'lake', label: 'See' }, { id: 'earth', label: 'Erde' }];
const HV_ICONS = ['folder', 'heart', 'leaf', 'clock', 'timer', 'chef', 'pot', 'fish', 'apple', 'scale', 'sparkle', 'calendar', 'sun', 'book'];
const HV_ICON_LABELS = { folder: 'Ordner', heart: 'Herz', leaf: 'Blatt', clock: 'Uhr', timer: 'Timer', chef: 'Kochmütze', pot: 'Topf', fish: 'Fisch', apple: 'Apfel', scale: 'Waage', sparkle: 'Funkeln', calendar: 'Kalender', sun: 'Sonne', book: 'Buch' };
const HV_SEARCH_MIN = 8;          // Suche in der Auswahl ab 8 eigenen Sammlungen (wie FS_VISIBLE / RP_CB_MIN)
const HV_NAME_MAX = 60;
const HV_PSEUDO = ['all', 'favorites', 'quick', 'veggie', 'uncooked', 'frequent'];
const HV_SORT_OPTIONS = [
  { id: 'updated', label: 'Zuletzt bearbeitet', short: 'Bearbeitet' },
  { id: 'added', label: 'Zuletzt hinzugefügt', short: 'Neueste' },
  { id: 'az', label: 'A bis Z', short: 'A bis Z' },
  { id: 'time', label: 'Kürzeste Gesamtzeit', short: 'Schnellste' },
  { id: 'cooked', label: 'Zuletzt gekocht', short: 'Gekocht' },
  { id: 'rating', label: 'Beste Bewertung', short: 'Bewertung' },
];

function hvOrg() { return typeof orgCollections === 'function'; }
function hvColors() { return (typeof ORG_COLORS !== 'undefined' && Array.isArray(ORG_COLORS) && ORG_COLORS.length) ? ORG_COLORS : HV_COLORS; }
function hvIcons() { return ((typeof ORG_ICONS !== 'undefined' && Array.isArray(ORG_ICONS) && ORG_ICONS.length) ? ORG_ICONS : HV_ICONS).filter(k => ICONS[k]); }
function hvCollections() {
  if (hvOrg()) { try { return orgCollections() || []; } catch (e) { return []; } }
  return getCollections().filter(c => c && c.id && c.id !== 'friends').map((c, i) => ({ id: c.id, name: String(c.name || ''), color: '', icon: 'folder', order: i }));
}
function hvCollection(id) {
  if (!id) return null;
  if (typeof orgCollection === 'function') { try { return orgCollection(id); } catch (e) { return null; } }
  return hvCollections().find(c => c.id === id) || null;
}
function hvRecipeIdsIn(id) {
  if (typeof orgRecipeIdsIn === 'function') { try { return orgRecipeIdsIn(id) || new Set(); } catch (e) { return new Set(); } }
  return new Set(state.recipes.filter(r => (r.collections || []).includes(id)).map(r => r.id));
}
function hvCounts() {
  if (typeof orgCounts === 'function') { try { return orgCounts() || new Map(); } catch (e) { /* Rückfall unten */ } }
  const m = new Map(); hvCollections().forEach(c => m.set(c.id, hvRecipeIdsIn(c.id).size)); return m;
}
function hvCollectionIdsOf(rid) {
  if (typeof orgCollectionIdsOf === 'function') { try { return orgCollectionIdsOf(rid) || []; } catch (e) { return []; } }
  const own = new Set(hvCollections().map(c => c.id)); const r = state.recipes.find(x => x.id === rid);
  return r ? (r.collections || []).filter(c => own.has(c)) : [];
}
function hvInNoCollection(r) {
  if (typeof orgInNoCollection === 'function') { try { return !!orgInNoCollection(r); } catch (e) { /* Rückfall unten */ } }
  return !hvCollectionIdsOf(r.id).length;   // Systemmarke 'friends' zählt nie als Sammlung
}
function hvIsFriendRecipe(r) { return (r.collections || []).includes('friends'); }
function hvColorVar(color) { return hvColors().some(c => c.id === color) ? `var(--org-c-${color}, var(--text-soft))` : 'var(--text-soft)'; }
function hvIconKey(icon) { return hvIcons().includes(icon) ? icon : 'folder'; }
function hvColIco(c, cls) { return `<span class="col-ico ${cls || ''}" style="--c:${hvColorVar(c && c.color)}" aria-hidden="true">${ICONS[hvIconKey(c && c.icon)]}</span>`; }
function hvNorm(s) { return typeof searchNorm === 'function' ? searchNorm(String(s || '')) : String(s || '').toLowerCase(); }
function hvCleanName(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
function hvRecipeWord(n) { return n === 1 ? '1 Rezept' : `${n} Rezepte`; }

/* Aktiver Bereich. Alte Einstiege (state.favOnly) gelten als «Favoriten». Ungültige Bereiche (z. B. Sammlung auf
   einem anderen Gerät gelöscht) fallen still auf «Alle Rezepte» zurück: kein leerer, kaputter Zustand. */
function hvScope() {
  let s = state.activeCollection || 'all';
  if (state.favOnly && s === 'all') return 'favorites';
  if (!HV_PSEUDO.includes(s) && s !== 'none' && s !== 'friends' && !hvCollection(s)) { s = 'all'; state.activeCollection = 'all'; }
  if (s === 'none' && !hvCollections().length) { s = 'all'; state.activeCollection = 'all'; }
  return s;
}
function hvScopeList(scope, recipes) {
  if (!scope || HV_PSEUDO.includes(scope)) return recipesInCollection(scope || 'all', recipes);
  if (scope === 'none') return recipes.filter(hvInNoCollection);
  if (scope === 'friends') return recipes.filter(hvIsFriendRecipe);
  const ids = hvRecipeIdsIn(scope);
  return recipes.filter(r => ids.has(r.id));
}
function hvScopeLabel(scope) {
  const sys = { all: 'Alle Rezepte', favorites: 'Favoriten', none: 'Ohne Sammlung', friends: 'Rezepte von Freunden', quick: 'Schnell', veggie: 'Vegetarisch', uncooked: 'Noch nicht gekocht', frequent: 'Häufig gekocht' };
  if (sys[scope]) return sys[scope];
  const c = hvCollection(scope);
  return c ? c.name : 'Alle Rezepte';
}

/* ---------- Sortierung ---------- */
/* «Zuletzt hinzugefügt»: createdAt, sonst die Zeit aus der ID (uid(): r_<ms base36>_…), sonst ans Ende. */
function hvAddedAt(r) {
  const c = Number(r && r.createdAt);
  if (c > 0) return c;
  const m = /^r_([0-9a-z]+)_/.exec(String((r && r.id) || ''));
  if (m) { const t = parseInt(m[1], 36); if (t > 946684800000 && t < Date.now() + 864e5) return t; }
  return 0;
}
function hvSortRecipes(list, by) {
  if (by === 'rating') {   // v90: beste zuerst, ohne Bewertung am Ende, dann zuletzt bewertet, dann Titel
    return list.slice().sort((a, b) => {
      const x = recipeRating(a), y = recipeRating(b);
      if (!x !== !y) return x ? -1 : 1;
      return (y - x) || ((b.ratedAt || 0) - (a.ratedAt || 0)) || String(a.title || '').localeCompare(String(b.title || ''), 'de', { sensitivity: 'base' });
    });
  }
  if (by !== 'added') return sortRecipes(list, by);   // 'time': ohne Zeitangabe ans Ende (unverändert)
  const title = (r) => String(r.title || '');
  return list.slice().sort((a, b) => {
    const x = hvAddedAt(a), y = hvAddedAt(b);
    if (!x !== !y) return x ? -1 : 1;
    return (y - x) || title(a).localeCompare(title(b), 'de', { sensitivity: 'base' });
  });
}
/* Hinweis unter der Ergebniszeile, nur wenn die Sortierung Rezepte ohne Wert ans Ende stellt */
function hvSortHint(list) {
  if (list.length < 2) return '';
  const some = (fn) => list.some(fn) && !list.every(fn);
  if (state.sortBy === 'time' && some(r => !(r.timeMinutes > 0))) return 'Rezepte ohne Zeitangabe stehen am Ende.';
  if (state.sortBy === 'cooked' && some(r => !r.lastCookedAt)) return 'Noch nie gekochte Rezepte stehen am Ende.';
  if (state.sortBy === 'rating' && some(r => !recipeRating(r))) return 'Rezepte ohne Bewertung stehen am Ende.';
  if (state.sortBy === 'added' && some(r => !hvAddedAt(r))) return 'Rezepte ohne bekanntes Datum stehen am Ende.';
  return '';
}

/* ---------- Ergebniszeile ---------- */
function hvFiltered() { return !!(state.query.trim() || activeStructuredFilterCount() || state.activeTag); }
function hvCountWords(n, total, filtered) {
  if (!filtered) return hvRecipeWord(n);
  return `${n} von ${total} Rezepten`;
}
// Volltext (auch für Screenreader und Live-Region): «High Protein · 5 von 12 Rezepten»
function hvCountText(scope, n, total, filtered) {
  const words = hvCountWords(n, total, filtered);
  return scope === 'all' ? words : `${hvScopeLabel(scope)} · ${words}`;
}
let hvLastCount = null, hvCountTimer = null;
/* Höfliche Ansage, wenn sich Bereich oder Treffer ändern; beim Tippen erst nach einer Pause (nicht bei jedem Tastendruck). */
function hvAnnounceCount() {
  if (state.view !== 'home') { hvLastCount = null; clearTimeout(hvCountTimer); return; }
  if (state.modal) return;
  const read = () => { const h = document.getElementById('all-h'); return h ? h.textContent.replace(/\s+/g, ' ').trim() : ''; };
  if (hvLastCount === null) { hvLastCount = read(); return; }
  clearTimeout(hvCountTimer);
  hvCountTimer = setTimeout(() => {
    if (state.view !== 'home' || state.modal) return;
    const text = read();
    if (text && text !== hvLastCount) announceLive(text);
    hvLastCount = text;
  }, document.activeElement && document.activeElement.id === 'searchInput' ? 700 : 60);
}

/* ---------- Auswahlmodus ---------- */
function hvSelecting() { return !!(state.selectMode && state.view === 'home'); }
function hvPickedCls(r) { return hvSelecting() && state.selectMode.ids.has(r.id) ? ' is-picked' : ''; }
function hvMainAttrs(r, titleEsc) {
  if (!hvSelecting()) return `data-action="open-recipe" data-id="${escapeAttr(r.id)}" aria-label="${titleEsc} öffnen"`;
  const on = state.selectMode.ids.has(r.id);
  return `data-action="sel-toggle" data-id="${escapeAttr(r.id)}" role="checkbox" aria-checked="${on}" aria-label="${titleEsc} auswählen"`;
}
function hvPickMark(r) {
  if (!hvSelecting()) return '';
  return `<span class="check-box sel-mark ${state.selectMode.ids.has(r.id) ? 'is-on' : ''}" aria-hidden="true">${ICONS.check}</span>`;
}
function hvSelectBarHtml(list, scope) {
  const sm = state.selectMode;
  const ids = Array.from(sm.ids).filter(id => state.recipes.some(r => r.id === id));
  const visible = new Set(list.map(r => r.id));
  const n = ids.length, hidden = ids.filter(id => !visible.has(id)).length;
  const status = !n ? 'Keine Rezepte ausgewählt' : hidden ? `${n} ausgewählt, ${hidden} davon ausgeblendet` : `${hvRecipeWord(n)} ausgewählt`;
  const allHits = list.length && list.every(r => sm.ids.has(r.id));
  const target = sm.target ? hvCollection(sm.target) : null;
  const own = hvCollection(scope);
  const allBtn = list.length ? `<button type="button" class="text-btn select-all" data-action="sel-all">${allHits ? 'Auswahl aufheben' : `Alle ${list.length} auswählen`}</button>` : '';
  const actions = target
    ? `<button type="button" class="primary-btn" data-action="sel-add-target" data-id="${escapeAttr(target.id)}" ${n ? '' : 'disabled'}>Zu «${escapeHtml(target.name)}» hinzufügen</button>`
    : `<button type="button" class="primary-btn" data-action="sel-add" ${n ? '' : 'disabled'}>Zu Sammlung hinzufügen</button>${own ? `<button type="button" class="ghost-btn" data-action="sel-remove" data-id="${escapeAttr(own.id)}" ${n ? '' : 'disabled'}>Aus Sammlung entfernen</button>` : ''}`;
  return `<div class="select-bar ${!target && own ? 'select-bar--two' : ''}" role="region" aria-label="Auswahl">
    <div class="select-bar-row"><p class="select-bar-status" role="status" id="selStatus">${escapeHtml(status)}</p>${allBtn}</div>
    <div class="select-bar-actions">${actions}</div>
  </div>`;
}

/* ---------- Kopf: Auswahlknopf ---------- */
function hvPickButtonHtml(scope, phone, inert) {
  const label = hvScopeLabel(scope);
  const c = hvCollection(scope);
  if (phone) {
    return `<button type="button" class="view-pick col-pick-title" id="colPickBtn" data-action="open-col-pick" aria-haspopup="dialog" aria-label="Sammlung wählen, aktuell: ${escapeAttr(label)}" ${inert ? 'inert' : ''}>
      <span class="inline-pick-text">${escapeHtml(label)}</span>${ICONS.arrowDown}
    </button>`;
  }
  const lead = c ? `<span class="col-dot" style="--c:${hvColorVar(c.color)}" aria-hidden="true"></span>` : (scope === 'favorites' ? ICONS.bookmark : ICONS.folder);
  return `<button type="button" class="col-pick-btn ${c ? 'is-active' : ''}" id="colPickBtn" data-action="open-col-pick" aria-haspopup="dialog" aria-label="Sammlung wählen, aktuell: ${escapeAttr(label)}" title="${escapeAttr(label)}">${lead}<span class="col-pick-btn-text">${escapeHtml(label)}</span>${ICONS.arrowDown}</button>`;
}

/* ---------- Leerzustände je Bereich (§1.5) ---------- */
function hvEmptyHtml(scope, total) {
  const name = hvScopeLabel(scope), own = hvCollection(scope);
  const box = (icon, title, text, btns) => `<div class="empty-state hv-empty">${icon}<h2>${title}</h2><p>${text}</p><div class="empty-actions">${btns}</div></div>`;
  const allBtn = (cls) => `<button type="button" class="${cls}" data-action="set-col-scope" data-id="all">Alle Rezepte zeigen</button>`;
  if (!total) {
    if (own) return box(ICONS.folder, 'Noch keine Rezepte in dieser Sammlung.', `Füge Rezepte hinzu, die zu «${escapeHtml(name)}» passen.`,
      `<button type="button" class="primary-btn" data-action="sel-start-add" data-id="${escapeAttr(own.id)}">${ICONS.plus} Rezepte hinzufügen</button>${allBtn('ghost-btn')}`);
    if (scope === 'favorites') return box(ICONS.bookmark, 'Noch keine Favoriten', 'Tippe in einem Rezept auf das Lesezeichen, um es hier zu sammeln.', allBtn('primary-btn'));
    if (scope === 'none') return box(ICONS.folder, 'Alle Rezepte sind einsortiert', 'Jedes Rezept gehört zu mindestens einer deiner Sammlungen.', allBtn('primary-btn'));
    return box(ICONS.user || ICONS.folder, 'Keine Rezepte in diesem Bereich', 'Hier gibt es gerade keine Rezepte.', allBtn('primary-btn'));
  }
  const q = state.query.trim(), qShort = q.length > 40 ? q.slice(0, 40) + '…' : q;
  const filters = activeStructuredFilterCount() + (state.activeTag ? 1 : 0);
  if (q && !filters) return box(ICONS.search, `Keine Treffer für „${escapeHtml(qShort)}“`, `In «${escapeHtml(name)}» gibt es kein passendes Rezept.`,
    `<button type="button" class="primary-btn" data-action="clear-search">Suche löschen</button><button type="button" class="ghost-btn" data-action="set-col-scope" data-id="all" data-keep-query="1">In allen Rezepten suchen</button>`);
  return box(ICONS.filter, 'Keine passenden Rezepte', `In «${escapeHtml(name)}» passt kein Rezept zu Suche und Filtern.`,
    `<button type="button" class="primary-btn" data-action="reset-extra-filters">Filter zurücksetzen</button><button type="button" class="ghost-btn" data-action="open-filter-sheet">Filter ändern</button>`);
}

function homeView() {
  const phone = isPhoneLayout();
  const scope = hvScope();
  const scopeAll = hvScopeList(scope, state.recipes);
  const list = applyAllFilters(state.recipes);
  const filterCount = activeStructuredFilterCount() + (state.activeTag ? 1 : 0);
  const labels = appliedFilterLabels();
  const summary = labels.length > 3 ? labels.slice(0, 3).join(' · ') + ` · + ${labels.length - 3} weitere` : labels.join(' · ');
  const selecting = hvSelecting();
  const sortCur = HV_SORT_OPTIONS.find(o => o.id === state.sortBy) || HV_SORT_OPTIONS[0];
  const sortOptions = HV_SORT_OPTIONS.map(o => `<option value="${escapeAttr(o.id)}" ${sortCur.id === o.id ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('');
  const filterBtn = `<button type="button" class="filter-btn ${filterCount ? 'is-active' : ''}" ${filterCount ? `data-count="${filterCount}"` : ''} ${phone && state.searchOpen ? 'inert' : ''} data-action="open-filter-sheet" aria-haspopup="dialog">${ICONS.sliders}<span class="filter-btn-text">Filter${filterCount ? ' · ' + filterCount : ''}</span></button>`;
  const selBtn = list.length || selecting ? `<button type="button" class="text-btn sel-mode-btn" id="selModeBtn" data-action="${selecting ? 'sel-end' : 'sel-start'}" ${selecting ? 'aria-pressed="true"' : ''}>${selecting ? 'Fertig' : 'Auswählen'}</button>` : '';
  const filtered = hvFiltered();
  const n = list.length, total = scopeAll.length;
  const countFull = hvCountText(scope, n, total, filtered);
  const prefix = scope === 'all' ? '' : `${escapeHtml(hvScopeLabel(scope))} · `;
  // Zahl als Zähler (tickerHtml) wie bisher; Bereichsname auf dem Handy nur für Screenreader (er steht im Titel)
  const countInner = (filtered ? `${tickerHtml(n, 'count')} von ${total} Rezepten` : `${tickerHtml(n, 'count')} Rezept${n === 1 ? '' : 'e'}`);
  const resultLine = `<h2 class="result-line" id="all-h" data-count-text="${escapeAttr(countFull)}">${prefix ? (phone ? `<span class="sr-only">${prefix}</span>` : prefix) : ''}${countInner}</h2>`;
  const sortHint = hvSortHint(list);
  const own = hvCollection(scope);
  const addToCol = !phone && own && !selecting && total ? `<button type="button" class="text-btn hv-add-recipes" data-action="sel-start-add" data-id="${escapeAttr(own.id)}">${ICONS.plus} Rezepte hinzufügen</button>` : '';

  let content;
  if (!state.recipes.length) content = emptyState();
  else if (!list.length) {
    const tools = phone ? `<div class="result-row result-row--phone result-row--tools-only"><div class="result-tools">${selecting ? selBtn : ''}${layoutToggleHtml(state.homeLayoutChosen ? (state.homeLayout === 'grid' ? 'grid' : 'list') : 'list', 'layout-toggle--phone')}${filterBtn}</div></div>` : (selecting ? `<div class="result-row">${selBtn}</div>` : '');
    content = tools + (scope === 'all' ? emptyFilterState() : hvEmptyHtml(scope, total));
  } else if (phone) {
    /* Handy: Liste ist Standard; «N Rezepte · Sortierung» als ruhige Zeile, rechts Auswählen, Liste/Raster und Filter */
    const pl = state.homeLayoutChosen ? (state.homeLayout === 'grid' ? 'grid' : 'list') : 'list';
    const items = pl === 'grid' ? `<div class="rgrid rgrid--phone">${list.map(r => recipeCard(r, true)).join('')}</div>` : `<div class="rlist rlist--phone">${list.map(r => recipeRow(r, true)).join('')}</div>`;
    content = `
      <section class="home-section" aria-labelledby="all-h">
        <div class="result-row result-row--phone">
          <div class="result-info">
            ${selBtn ? `<div class="hv-count-line">${resultLine}${selBtn}</div>` : resultLine}
            <span class="result-dot" aria-hidden="true">·</span>
            <div class="inline-pick sort-inline">
              <span class="inline-pick-text">${escapeHtml(sortCur.label)}</span><span class="inline-pick-short" aria-hidden="true">${escapeHtml(sortCur.short || sortCur.label)}</span>${ICONS.arrowDown}
              <select class="inline-pick-select sort-select" id="sortSelect" aria-label="Sortierung">${sortOptions}</select>
            </div>
          </div>
          <div class="result-tools">${layoutToggleHtml(pl, 'layout-toggle--phone')}${filterBtn}</div>
        </div>
        ${sortHint ? `<p class="hint-line hv-sort-hint">${escapeHtml(sortHint)}</p>` : ''}
        ${items}
      </section>`;
  } else {
    const items = state.homeLayout === 'list' ? `<div class="rlist">${list.map(r => recipeRow(r)).join('')}</div>` : `<div class="rgrid">${list.map(r => recipeCard(r)).join('')}</div>`;
    content = `
      <section class="home-section" aria-labelledby="all-h">
        <div class="result-row">
          ${resultLine}${addToCol}
          <label class="sort-pick"><span class="sort-pick-label">Sortierung</span>
            <select class="sort-select" id="sortSelect">${sortOptions}</select>
          </label>
          ${selBtn}
          ${layoutToggleHtml(state.homeLayout)}
        </div>
        ${sortHint ? `<p class="hint-line hv-sort-hint">${escapeHtml(sortHint)}</p>` : ''}
        ${items}
      </section>`;
  }

  /* Handy: Suche als runder Knopf neben dem Titel; geoeffnet liegt das Feld ueber der Zeile (kein Springen der Liste), die Zeile dahinter ist inert */
  const searchOpen = !!state.searchOpen, searchEnter = !!state.searchEnter; state.searchEnter = false;
  const hasQuery = !!state.query.trim();
  const searching = searchOpen || hasQuery;   // v89 B: bei aktiver Suche «Heute geplant» und Sicherungshinweis ausblenden
  const searchBtn = `<button type="button" class="search-btn ${hasQuery ? 'is-active' : ''}" id="searchBtn" data-action="open-search" aria-label="Suchen" aria-expanded="${searchOpen}" aria-controls="searchPop" ${searchOpen ? 'inert' : ''}>${ICONS.search}</button>`;
  const searchPop = searchOpen ? `<div class="search-pop ${searchEnter ? 'is-entering' : ''}" id="searchPop" role="search">
      ${ICONS.search}
      <label for="searchInput" class="sr-only">Rezepte suchen</label>
      <input class="search-input" id="searchInput" type="search" enterkeyhint="search" placeholder="Rezepte suchen …" value="${escapeHtml(state.query)}" autocomplete="off">
      <button type="button" class="search-close" data-action="close-search" data-id="${hasQuery ? 'clear' : 'keep'}" aria-label="${hasQuery ? 'Suche löschen und schliessen' : 'Suche schliessen'}">${ICONS.x}</button>
    </div>` : '';
  /* v84: Sammlungsauswahl statt «Alle / Favoriten»: Handy im Titel, Desktop als Knopf neben «Filter» */
  const filterBar = !state.recipes.length ? '' : (phone
    ? `<div class="filter-bar filter-bar--phone">
          ${hvPickButtonHtml(scope, true, searchOpen)}
          ${searchBtn}
          ${searchPop}
        </div>`
    : `<div class="filter-bar">
          ${hvPickButtonHtml(scope, false)}
          ${filterBtn}
        </div>`);

  return `
    <div class="home-head ${phone ? 'home-head--phone' : ''}">
      ${phone ? topbar('', { cls: 'topbar--home topbar--center' }) : topbar('', { cls: 'topbar--home', actions: `<button class="round-btn round-btn--accent" data-action="open-add-menu" aria-label="Rezept hinzufügen">${ICONS.plus}</button>` })}
      <section class="home-head-body" aria-label="Suche und Filter">
        ${phone ? '<h1 class="sr-only">Deine Rezepte</h1>' : pageTitle('Deine Rezepte', typeof recipesSwitchHtml === 'function' ? recipesSwitchHtml() : '')}
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
    <main class="has-tabbar home-main ${phone && state.recipes.length ? 'home-main--addbar' : ''} ${selecting ? 'is-selecting' : ''}">
      ${phone && typeof recipesSwitchHtml === 'function' ? recipesSwitchHtml() : ''}
      ${searching ? '' : todayPlannedHtml()}
      ${/* v91.15 (Nutzerwunsch): keine Sicherungserinnerung mehr auf der Startseite; «Mehr» zeigt «Sicherung fehlt» oder «Sicherung alt» */ ''}
      ${!hasQuery && !selecting && scope === 'all' && !filterCount ? favRailHtml() : ''}
      <div class="home-add-sentinel" aria-hidden="true"></div>
      ${content}
      ${selecting && !phone ? hvSelectBarHtml(list, scope) : ''}
    </main>
    ${phone && state.recipes.length ? (selecting ? `<div class="home-add-bar home-sel-bar">${hvSelectBarHtml(list, scope)}</div>` : `<div class="home-add-bar"><button type="button" class="home-add-btn" data-action="open-add-menu" aria-label="Rezept hinzufügen">${ICONS.plus}<span class="home-add-label">Rezept hinzufügen</span></button></div>`) : ''}
    ${bottomNav()}
    ${filterSheetModal()}
    ${addMenuModal()}
    ${hvModalHtml()}
  `;
}

/* ---------- Dialoge der Übersicht ---------- */
function hvModalHtml() {
  const m = state.modal;
  if (!m) return '';
  switch (m.type) {
    case 'col-pick': return colPickModal(m);
    case 'col-edit': return colEditModal(m);
    case 'col-manage': return colManageModal(m);
    case 'col-delete': return colDeleteModal(m);
    case 'col-batch': return colBatchModal(m);
    default: return '';
  }
}
function hvMatchesQuery(c, q) { return !q || hvNorm(c.name).includes(hvNorm(q)); }
function hvSearchHtml(id, value, label) {
  return `<div class="rp-search hv-search" role="search">
    <label for="${id}" class="sr-only">${escapeHtml(label)}</label>
    <span class="rp-search-icon" aria-hidden="true">${ICONS.search}</span>
    <input type="search" id="${id}" class="rp-search-input" placeholder="Sammlung suchen" value="${escapeAttr(value || '')}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">
  </div>`;
}

/* Sammlungsauswahl (§1.2). Liste separat, damit die Suche nur sie neu aufbaut (kein render(), Cursor bleibt). */
function colPickListHtml(m) {
  const scope = hvScope(), cols = hvCollections(), counts = hvCounts();
  const q = (m.query || '').trim();
  const row = (id, icon, name, count, hint) => {
    const on = scope === id;
    return `<li><button type="button" class="menu-item col-pick-item ${on ? 'is-current' : ''}" data-action="set-col-scope" data-id="${escapeAttr(id)}" ${on ? 'aria-current="true"' : ''}>
      ${icon}<span class="col-pick-name"><span class="col-pick-label">${escapeHtml(name)}</span>${hint ? `<span class="menu-item-hint">${escapeHtml(hint)}</span>` : ''}<span class="sr-only">, ${escapeHtml(hvRecipeWord(count))}</span></span>
      <span class="col-count" aria-hidden="true">${count}</span><span class="col-check" aria-hidden="true">${on ? ICONS.check : ''}</span>
    </button></li>`;
  };
  let sys = '';
  if (!q) {
    sys += row('all', `<span class="col-ico" aria-hidden="true">${ICONS.bookOpen}</span>`, 'Alle Rezepte', state.recipes.length);
    sys += row('favorites', `<span class="col-ico" aria-hidden="true">${ICONS.bookmark}</span>`, 'Favoriten', state.recipes.filter(r => r.favorite).length);
    if (cols.length) sys += row('none', `<span class="col-ico col-ico--muted" aria-hidden="true">${ICONS.folder}</span>`, 'Ohne Sammlung', state.recipes.filter(hvInNoCollection).length);
    const fr = state.recipes.filter(hvIsFriendRecipe).length;
    if (fr || scope === 'friends') sys += row('friends', `<span class="col-ico" aria-hidden="true">${ICONS.user || ICONS.folder}</span>`, 'Rezepte von Freunden', fr, 'Von Freunden erhalten');
  }
  const hits = cols.filter(c => hvMatchesQuery(c, q));
  let own = '';
  if (!cols.length) own = `<p class="hint-line col-pick-empty">Mit eigenen Sammlungen ordnest du Rezepte nach deinen Themen, zum Beispiel Meal Prep oder Für Gäste.</p>`;
  else if (!hits.length) own = `<div class="col-pick-nohit"><p><strong>Keine Sammlung gefunden für «${escapeHtml(q)}».</strong></p>
      <div class="col-pick-nohit-actions"><button type="button" class="outline-btn outline-btn--small" data-action="col-new" data-name="${escapeAttr(hvCleanName(q).slice(0, HV_NAME_MAX))}">${ICONS.plus} Sammlung «${escapeHtml(q)}» erstellen</button>
      <button type="button" class="text-btn" data-action="col-pick-clear">Suche löschen</button></div></div>`;
  else own = `<p class="menu-group-title" id="colPickOwnH">Deine Sammlungen</p><ul class="col-pick-list" role="list" aria-labelledby="colPickOwnH">${hits.map(c => row(c.id, hvColIco(c), c.name, counts.get(c.id) || 0)).join('')}</ul>`;
  return (sys ? `<ul class="col-pick-list col-pick-list--sys" role="list" aria-label="Bereiche">${sys}</ul>` : '') + own;
}
function colPickModal(m) {
  const cols = hvCollections();
  const search = cols.length >= HV_SEARCH_MIN ? hvSearchHtml('colPickSearch', m.query, 'Sammlungen durchsuchen') : '';
  const a = m.anchor;
  const body = `${search}<div id="colPickList">${colPickListHtml(m)}</div>`;
  const foot = `<div class="rp-actions col-pick-foot"><button type="button" class="outline-btn" data-action="col-new">${ICONS.plus} Neue Sammlung</button>${cols.length ? '<button type="button" class="text-btn" data-action="col-manage">Sammlungen verwalten</button>' : ''}</div>`;
  const html = rpSheetHtml({ id: 'colPickTitle', title: 'Sammlung wählen', body, foot, cls: `rp-sheet--colpick ${a ? 'rp-sheet--anchored' : ''}` });
  return a ? html.replace('class="modal-sheet rp-sheet', `style="--anchor-x:${Math.round(a.x)}px;--anchor-y:${Math.round(a.y)}px;--anchor-h:${Math.round(a.h)}px" class="modal-sheet rp-sheet`) : html;
}

/* Neue Sammlung / Sammlung bearbeiten (§1.4, §4). Entwurf liegt im Dialogzustand (m.name, m.color, m.icon). */
function hvSwatchesHtml(m) {
  const cur = m.color || '';
  const opt = (id, label) => `<label class="col-swatch ${id ? '' : 'col-swatch--none'}"><input type="radio" class="col-radio" name="colColor" value="${escapeAttr(id)}" ${cur === id ? 'checked' : ''} aria-label="${escapeAttr(label)}"><span class="col-swatch-dot" style="--c:${id ? hvColorVar(id) : 'transparent'}" aria-hidden="true">${ICONS.check}</span></label>`;
  return `<fieldset class="rp-group col-fieldset"><legend class="rp-label">Farbe <span class="rp-optional">(optional)</span></legend>
    <div class="col-swatches">${opt('', 'Keine')}${hvColors().map(c => opt(c.id, c.label)).join('')}</div></fieldset>`;
}
function hvIconsHtml(m) {
  const cur = hvIconKey(m.icon);
  return `<fieldset class="rp-group col-fieldset"><legend class="rp-label">Symbol <span class="rp-optional">(optional)</span></legend>
    <div class="col-icons">${hvIcons().map(k => `<label class="col-icon-opt"><input type="radio" class="col-radio" name="colIcon" value="${escapeAttr(k)}" ${cur === k ? 'checked' : ''} aria-label="${escapeAttr(HV_ICON_LABELS[k] || k)}"><span class="col-icon-face" aria-hidden="true">${ICONS[k]}</span></label>`).join('')}</div></fieldset>`;
}
function hvNameCountHtml(len) { return len >= 50 ? `${len} von ${HV_NAME_MAX} Zeichen` : ''; }
function colEditModal(m) {
  const edit = m.mode === 'edit';
  const name = m.name != null ? m.name : '';
  const err = m.error || '';
  const errHtml = err ? `<div class="col-err" id="colNameErr" role="alert"><p class="field-error">${escapeHtml(err)}</p>${m.existingId ? `<button type="button" class="text-btn" data-action="col-use-existing" data-id="${escapeAttr(m.existingId)}">Bestehende Sammlung verwenden</button>` : ''}</div>` : '';
  const body = `<div class="field col-name-field">
      <label for="colName">Name</label>
      <input id="colName" type="text" maxlength="${HV_NAME_MAX}" autocomplete="off" enterkeyhint="done" placeholder="z. B. Meal Prep" value="${escapeAttr(name)}" ${err ? 'aria-invalid="true" aria-describedby="colNameErr"' : ''}>
      <p class="fs-hint col-name-count" id="colNameCount" aria-live="polite">${hvNameCountHtml(name.length)}</p>
      ${errHtml}
    </div>
    ${hvSwatchesHtml(m)}
    ${hvIconsHtml(m)}
    ${edit ? `<button type="button" class="text-btn text-btn--danger rp-remove" data-action="col-delete" data-id="${escapeAttr(m.id)}">${ICONS.trash} Sammlung löschen</button>` : ''}`;
  const foot = `<div class="rp-actions"><button type="button" class="ghost-btn" data-action="col-edit-cancel">Abbrechen</button><button type="button" class="primary-btn" data-action="col-save">${edit ? 'Speichern' : 'Sammlung erstellen'}</button></div>`;
  return rpSheetHtml({ id: 'colEditTitle', title: edit ? 'Sammlung bearbeiten' : 'Neue Sammlung', body, foot, cls: 'rp-sheet--coledit' });
}

/* Sammlungen verwalten (§4): Umbenennen/Farbe/Symbol über die Zeile, Reihenfolge mit Hoch/Runter (kein Ziehen nötig) */
function colManageModal(m) {
  const cols = hvCollections(), counts = hvCounts();
  const rows = cols.map((c, i) => {
    const k = counts.get(c.id) || 0;
    return `<li class="col-manage-row" data-col-row="${escapeAttr(c.id)}">
      <button type="button" class="col-manage-main" data-action="col-edit" data-id="${escapeAttr(c.id)}">${hvColIco(c)}<span class="col-manage-text"><span class="col-manage-name">${escapeHtml(c.name)}</span><span class="menu-item-hint">${k ? hvRecipeWord(k) : 'Leer'}</span></span><span class="sr-only">, bearbeiten</span></button>
      <div class="col-manage-move">
        <button type="button" class="icon-btn" data-action="col-move" data-id="${escapeAttr(c.id)}" data-dir="-1" aria-label="${escapeAttr(c.name)} nach oben" ${i === 0 ? 'disabled' : ''}>${ICONS.arrowUp}</button>
        <button type="button" class="icon-btn" data-action="col-move" data-id="${escapeAttr(c.id)}" data-dir="1" aria-label="${escapeAttr(c.name)} nach unten" ${i === cols.length - 1 ? 'disabled' : ''}>${ICONS.arrowDown}</button>
      </div>
    </li>`;
  }).join('');
  const body = cols.length ? `<ul class="col-manage-list" role="list">${rows}</ul>` : `<p class="hint-line">Du hast noch keine Sammlung.</p>`;
  const foot = `<div class="rp-actions"><button type="button" class="outline-btn" data-action="col-new" data-from="manage">${ICONS.plus} Neue Sammlung</button><button type="button" class="primary-btn" data-action="close-modal">Fertig</button></div>`;
  return rpSheetHtml({ id: 'colManageTitle', title: 'Sammlungen verwalten', sub: cols.length === 1 ? '1 Sammlung' : `${cols.length} Sammlungen`, body, foot, cls: 'rp-sheet--colmanage' });
}
function colDeleteModal(m) {
  const c = hvCollection(m.id);
  if (!c) return '';
  const k = hvCounts().get(c.id) || 0;
  return `<div class="modal-backdrop" data-action="close-modal">
    <div class="modal-sheet col-delete-sheet" role="dialog" aria-modal="true" aria-labelledby="colDelTitle" aria-describedby="colDelText" tabindex="-1" data-stop-click>
      <div class="sheet-handle" aria-hidden="true"></div>
      <h2 class="modal-title" id="colDelTitle">Sammlung löschen?</h2>
      <p id="colDelText"><strong>Deine Rezepte bleiben erhalten.</strong></p>
      <p class="hint-line">Nur die Sammlung «${escapeHtml(c.name)}»${k ? ` und ihre Zuordnung zu ${k === 1 ? '1 Rezept' : k + ' Rezepten'}` : ''} ${k ? 'werden' : 'wird'} entfernt.</p>
      <div class="rp-actions col-delete-actions">
        <button type="button" class="ghost-btn" data-action="col-delete-cancel" data-id="${escapeAttr(c.id)}">Abbrechen</button>
        <button type="button" class="primary-btn kd-danger-btn" data-action="col-delete-confirm" data-id="${escapeAttr(c.id)}">Sammlung löschen</button>
      </div>
    </div>
  </div>`;
}

/* Mehrere Rezepte: «Zu Sammlung hinzufügen» (§3.4). Alle Haken starten leer; nur fehlende Paare werden ergänzt. */
function colBatchListHtml(m) {
  const ids = Array.from((state.selectMode && state.selectMode.ids) || []).filter(id => state.recipes.some(r => r.id === id));
  const cols = hvCollections(), q = (m.query || '').trim();
  const hits = cols.filter(c => hvMatchesQuery(c, q));
  if (!cols.length) return `<p class="hint-line">Du hast noch keine Sammlung.</p>`;
  if (!hits.length) return `<p class="hint-line"><strong>Keine Sammlung gefunden für «${escapeHtml(q)}».</strong></p>`;
  const checked = m.checked || new Set();
  return `<ul class="rp-list col-batch-list" id="colBatchList" aria-label="Deine Sammlungen">${hits.map(c => {
    const inSet = hvRecipeIdsIn(c.id);
    const have = ids.filter(id => inSet.has(id)).length;
    const all = ids.length && have === ids.length;
    const on = all || checked.has(c.id);
    const meta = all ? (ids.length === 1 ? 'Schon enthalten' : `Alle ${ids.length} schon enthalten`) : have ? `${have} von ${ids.length} schon enthalten` : '';
    return `<li class="rp-row ${on ? 'is-selected' : ''} ${all ? 'is-disabled' : ''}"><label class="rp-item">
      <input type="checkbox" class="rp-input col-batch-input" data-col="${escapeAttr(c.id)}" ${on ? 'checked' : ''} ${all ? 'disabled' : ''}>
      ${hvColIco(c)}<span class="rp-item-text"><span class="rp-item-title">${escapeHtml(c.name)}</span>${meta ? `<span class="rp-item-meta">${escapeHtml(meta)}</span>` : ''}</span>
      <span class="rp-mark" aria-hidden="true">${ICONS.check}</span></label></li>`;
  }).join('')}</ul>`;
}
function colBatchModal(m) {
  const ids = Array.from((state.selectMode && state.selectMode.ids) || []).filter(id => state.recipes.some(r => r.id === id));
  const cols = hvCollections();
  const search = cols.length >= HV_SEARCH_MIN ? hvSearchHtml('colBatchSearch', m.query, 'Sammlungen durchsuchen') : '';
  const err = m.error ? `<div class="col-err" id="colNewErr" role="alert"><p class="field-error">${escapeHtml(m.error)}</p>${m.existingId ? `<button type="button" class="text-btn" data-action="col-batch-use" data-id="${escapeAttr(m.existingId)}">Bestehende Sammlung verwenden</button>` : ''}</div>` : '';
  const inline = (m.newOpen || !cols.length)
    ? `<div class="inline-add col-inline-add"><label for="colNewInline" class="sr-only">Name der neuen Sammlung</label><input id="colNewInline" type="text" maxlength="${HV_NAME_MAX}" placeholder="Name der Sammlung" autocomplete="off" enterkeyhint="done" value="${escapeAttr(m.newName || '')}" ${m.error ? 'aria-invalid="true" aria-describedby="colNewErr"' : ''}><button type="button" class="outline-btn outline-btn--small" data-action="col-batch-create">Erstellen</button></div>${err}`
    : `<button type="button" class="text-btn col-inline-open" data-action="col-batch-new">${ICONS.plus} Neue Sammlung</button>`;
  const n = (m.checked || new Set()).size;
  const body = `${search}<div id="colBatchWrap">${colBatchListHtml(m)}</div>${inline}`;
  const foot = `<p class="rp-count" id="colBatchCount" aria-live="polite">${n ? (n === 1 ? '1 Sammlung gewählt' : `${n} Sammlungen gewählt`) : 'Noch keine Sammlung gewählt'}</p>
    <div class="rp-actions"><button type="button" class="ghost-btn" data-action="close-modal">Abbrechen</button><button type="button" class="primary-btn" data-action="col-batch-apply" ${n ? '' : 'disabled'}>Hinzufügen</button></div>`;
  return rpSheetHtml({ id: 'colBatchTitle', title: 'Zu Sammlung hinzufügen', sub: `${hvRecipeWord(ids.length)} ausgewählt`, body, foot, cls: 'rp-sheet--colbatch' });
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
  // «Menge anpassen» rechnet nur die Anzeige um; das gespeicherte Rezept bleibt unveraendert (Bearbeiten ist eine eigene Aktion).
  const scaled = !unknownYield && servings !== r.servings;
  return `${unknownYield ? `<div class="amount-row amount-row--unknown">
      <span class="amount-row-label">Ergibt: unbekannt</span>
      <span class="hint-line">Es gelten die Originalmengen. Mit einer Ertragsangabe kannst du die Menge anpassen.</span>
      <button type="button" class="outline-btn outline-btn--small" data-action="edit-recipe" data-id="${escapeAttr(r.id)}">Ertrag ergänzen</button>
    </div>` : `<div class="amount-row">
      <span class="amount-row-label" id="amount-label-${escapeAttr(r.id)}">Menge anpassen</span>
      <div class="stepper" role="group" aria-labelledby="amount-label-${escapeAttr(r.id)}">
        <button type="button" data-action="serv-dec" data-id="${escapeAttr(r.id)}" aria-label="Weniger"${servings <= yieldStep(r) ? ' disabled' : ''}>${ICONS.minus}</button>
        <span class="stepper-value" aria-live="polite">${escapeHtml(servingLabel(r, servings))}</span>
        <button type="button" data-action="serv-inc" data-id="${escapeAttr(r.id)}" aria-label="Mehr">${ICONS.plus}</button>
      </div>
    </div>`}
    ${scaled ? `<p class="hint-line amount-scaled-hint">Angepasst. Das Rezept selbst bleibt bei ${escapeHtml(servingLabel(r, r.servings))}. <button type="button" class="text-btn" data-action="serv-reset" data-id="${escapeAttr(r.id)}">Original</button></p>` : ''}
    ${groups.length ? groups.map(g => `<section class="ing-group">
      ${showTitles ? `<h3 class="ing-group-title">${escapeHtml(g.title)}</h3>` : ''}
      <ul class="ing-list">
        ${g.ingredients.map(i => {
          const isChecked = checked.has(i._index);
          // v86.1: Menge steckt im Namen («½ TL Backpulver», Mengenfeld leer): nur für die Anzeige in Menge und Name teilen, Daten bleiben unverändert
          const sp = (!String(i.amount || '').trim() && !String(i.unit || '').trim() && typeof parseIngredientLine === 'function') ? parseIngredientLine(String(i.name || '')) : null;
          const shown = sp && sp.amount && sp.name ? Object.assign({}, i, { amount: sp.amount, unit: sp.unit || '', name: sp.name }) : i;
          const amt = scaledAmountLine(shown, factor);
          return `<li><button type="button" class="ing-check ${isChecked ? 'is-checked' : ''}" data-action="toggle-ingredient-check" data-id="${escapeAttr(r.id)}" data-idx="${i._index}" role="checkbox" aria-checked="${isChecked}">
            <span class="check-box" aria-hidden="true">${ICONS.check}</span>
            <span class="ing-amount">${escapeHtml(amt)}</span>
            <span class="ing-name">${highlightHtml(shown.name, state.query)}</span>
          </button></li>`;
        }).join('')}
      </ul>
    </section>`).join('') : `<p class="hint-line">Noch keine Zutaten erfasst.</p>`}
    ${checked.size ? `<button class="text-btn" data-action="reset-ingredient-checks" data-id="${escapeAttr(r.id)}">Häkchen zurücksetzen</button>` : ''}
    ${typeof nutritionLineSlot === 'function' ? nutritionLineSlot(r) : ''}`;   // v86: Nährwert-Kurzzeile direkt unter den Zutaten, die erste Zutat bleibt ohne Scrollen sichtbar
}
function stepsPanel(r) {
  const entries = stepEntries(r);
  if (!entries.length) return `<p class="hint-line">Noch keine Zubereitungsschritte erfasst.</p>`;
  let n = 0;
  const sections = entries.some(e => e.heading);
  const titleTag = sections ? 'h4' : 'h3';   // Abschnitt (h3) > Schrittüberschrift
  // Schrittüberschrift separat, Text darunter. «Überschrift: Text» in einem Schritt wird nur in der Anzeige getrennt (stepDisplayParts, recipe-check.js).
  return `<ol class="step-list-v2">${entries.map(e => {
    if (e.heading) return `<li class="step-heading"><h3>${escapeHtml(String(e.text).trim().replace(/:$/, ''))}</h3></li>`;
    const parts = typeof stepDisplayParts === 'function' ? stepDisplayParts(e.text) : { title: '', text: e.text };
    return `<li class="step-item ${parts.title ? 'has-title' : ''}"><span class="step-no" aria-hidden="true">${++n}</span><div class="step-body"><span class="sr-only">Schritt ${n}: </span>${parts.title ? `<${titleTag} class="step-title">${escapeHtml(parts.title)}</${titleTag}>` : ''}<p>${escapeHtml(parts.text)}</p></div></li>`;
  }).join('')}</ol>${typeof cookLastCookedHtml === 'function' ? cookLastCookedHtml(r) : ''}`;
}
function notesPanel(r) {
  const log = (r.cookLog || []).filter(n => n && String(n.text || '').trim()).sort((a, b) => (b.date || 0) - (a.date || 0));   // v89: Kocheinträge ohne Notiz sind nur Verlauf
  return `${typeof cookLastCookedHtml === 'function' ? cookLastCookedHtml(r) : ''}${r.notes ? `<div class="note-card"><h3 class="note-card-title">Notiz</h3><p>${escapeHtml(r.notes)}</p></div>` : ''}
    ${log.map(n => `<div class="note-card note-card--dated">
      <div class="note-card-head"><span class="note-date">${new Date(n.date).toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
      <button class="icon-btn icon-btn--small" data-action="delete-cook-note" data-id="${escapeAttr(r.id)}" data-note="${escapeHtml(n.id)}" aria-label="Notiz vom ${new Date(n.date).toLocaleDateString('de-CH')} löschen">${ICONS.trash}</button></div>
      <p>${escapeHtml(n.text)}</p></div>`).join('')}
    <button class="ghost-btn" data-action="open-note-modal" data-id="${escapeAttr(r.id)}">${ICONS.plus} Notiz hinzufügen</button>`;
}
function nutritionPanel(r) {
  return nutritionCardSection(r.id);   // v86: kein grünes Hinweisband mehr, der Reiter selbst nennt «Richtwerte» einmal
}
/* v89: Rezeptaktionen. Volle Beschriftung fuer Screenreader und breite Ansichten, Kurzbeschriftung fuer den
   kompakten Kopf auf niedrigen Handys (CSS blendet um, beide Texte bleiben im DOM, der Knopfname ist immer der volle Text). */
function detailToolHtml(r, action, icon, label, short, extra) {
  return `<button type="button" class="tool-action" data-action="${action}" data-id="${escapeAttr(r.id)}" aria-label="${escapeAttr(label)}"${extra || ''}>${icon}<span class="tool-label">${escapeHtml(label)}</span><span class="tool-label-short" aria-hidden="true">${escapeHtml(short)}</span></button>`;
}
function detailView() {
  const r = state.recipes.find(x => x.id === state.activeRecipeId);
  if (!r) { state.view = 'home'; return homeView(); }
  const servings = currentServings(r);
  const hasNotes = !!(r.notes || (r.cookLog || []).some(n => n && String(n.text || '').trim()));
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
  // Ertrag zuerst und gross («Für 4 Portionen», «Ergibt 1 Glas»); darunter eine kompakte Zeitzeile mit klar benannten Zeiten
  // («30 Min. Gesamtzeit · 1 Std. Ruhen»). Nichts wird summiert: Arbeitsschritte koennen parallel laufen.
  const tInfo = timeInfo(r);
  const extraTimes = tInfo.text ? [tInfo.text] : [];
  const facts = [yieldText(r, servings), r.difficulty || ''].filter(Boolean);
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
  // Rezeptbibliothek und Freunde-Versand: Rollen getrennt anzeigen (Quelle, Autor in der Bibliothek, Absender), siehe recipe-origin.js
  const originHtml = (r.publicOrigin && typeof recipeOriginHtml === 'function') ? recipeOriginHtml(r) : '';
  const source = (!originHtml && !sourceText && !tagChips.length) ? '' : `<div class="source-row">${originHtml || (sourceText ? `<p class="source-line">${sourceText}</p>` : '')}${tagChips.length ? `<span class="source-chips">${tagChips.slice(0, 2).map(t => `<span class="source-chip">${escapeHtml(t)}</span>`).join('')}</span>` : ''}</div>`;
  const conflictBox = conflicts.length ? `<div class="diet-warning" role="note">
      <strong>Kennzeichnung prüfen</strong>
      <p>${conflicts.map(c => `Als <b>${c.label === 'vegan' ? 'vegan' : 'vegetarisch'}</b> markiert, enthält aber: ${escapeHtml(Array.from(new Set(c.items)).slice(0, 4).join(', '))}${new Set(c.items).size > 4 ? ' …' : ''}.`).join(' ')}</p>
      <div class="diet-warning-actions"><button class="outline-btn outline-btn--small" data-action="fix-diet-conflict" data-id="${escapeAttr(r.id)}">Kennzeichnung entfernen</button><button class="text-btn" data-action="edit-recipe" data-id="${escapeAttr(r.id)}">Bearbeiten</button></div>
    </div>` : '';
  return `
    ${topbar(r.title || 'Rezept', { back: true, backLabel: linkBackLabel(), plainTitle: 'Rezept', cls: 'topbar--detail', actions: `<button class="icon-btn" data-action="open-detail-menu" data-id="${escapeAttr(r.id)}" aria-label="Weitere Aktionen" aria-haspopup="dialog">${ICONS.more}</button>` })}
    <main class="has-tabbar detail-main ${hero ? 'has-hero' : 'no-hero'}" data-tab="${tab}">
      ${hero}
      <div class="detail-cols"><div class="detail-col detail-col--info">
      <div class="detail-head">
        <div class="detail-title-row">
          <h1 class="detail-title-v2 ${(r.title || '').length > 34 ? 'is-long' : ''} ${(r.title || '').length > 70 ? 'is-xlong' : ''}">${escapeHtml(r.title || 'Ohne Titel')}</h1>
          ${favButton(r, 'detail-fav')}
        </div>
        <p class="detail-meta-v2">${facts.map(f => `<span class="fact">${escapeHtml(f)}</span>`).join('')}${extraTimes.length ? `<span class="fact detail-times">${ICONS.clock}<span>${extraTimes.map(escapeHtml).join(' · ')}</span></span>` : ''}</p>
      </div>
      <button class="primary-btn primary-btn--block cook-start-inline" data-action="start-cook" data-id="${escapeAttr(r.id)}">${ICONS.play} Kochen starten</button>
      <div class="detail-tools" role="group" aria-label="Weitere Aktionen zum Rezept">
        ${detailToolHtml(r, 'add-to-shopping', ICONS.cart, 'Auf die Einkaufsliste', 'Einkauf')}
        ${detailToolHtml(r, 'open-plan-recipe', ICONS.calendar, 'Zum Wochenplan', 'Planen')}
        ${detailToolHtml(r, 'edit-recipe', ICONS.edit, 'Bearbeiten', 'Bearbeiten')}
        ${detailToolHtml(r, 'open-share-menu', ICONS.share, 'Teilen', 'Teilen', ' aria-haspopup="dialog"')}
      </div>
      ${wide ? source + rcolTagsHtml(r) : ''}
      ${conflictBox}
      <div class="detail-aside-ing" role="region" aria-label="Zutaten">${wide ? `<h2 class="sr-only">Zutaten</h2>` + ingHtml : ''}</div>
      </div><div class="detail-col detail-col--content">
      <div class="tabbar-v2" role="tablist" aria-label="Rezeptinhalt" data-tab-count="${tabs.length}">
        ${tabs.map(t => `<button role="tab" id="tab-${t.id}" class="tab-v2 ${tab === t.id ? 'is-active' : ''}" aria-selected="${tab === t.id}" aria-controls="panel-${t.id}" tabindex="${tab === t.id ? '0' : '-1'}" data-action="set-detail-tab" data-id="${escapeAttr(t.id)}">${t.label}</button>`).join('')}
      </div>
      ${tabs.map(t => `<div class="tab-panel" id="panel-${t.id}" role="tabpanel" aria-labelledby="tab-${t.id}" ${tab === t.id ? '' : 'hidden'}><h2 class="sr-only">${t.label}</h2>${panelHtml[t.id]}</div>`).join('')}
      ${!wide && (source || rcolTagsHtml(r)) ? `<div class="detail-meta-below">${source}${rcolTagsHtml(r)}</div>` : ''}
      ${ratingBlockHtml(r)}
      ${pairingSectionHtml(r)}
      ${recipeCheckHtml(r)}
      </div></div>
    </main>
    ${bottomNav()}
    ${state.modal && state.modal.type === 'delete' ? deleteModal(r) : ''}
    ${state.modal && state.modal.type === 'detail-menu' ? detailMenuModal(r) : ''}
    ${state.modal && state.modal.type === 'share-menu' ? shareMenuModal(r) : ''}
    ${state.modal && state.modal.type === 'note' ? noteModal(r) : ''}
    ${rcolModalHtml()}
    ${linkModalsHtml(r)}
    ${state.modal && state.modal.type === 'shop-select' ? shopSelectModal() : ''}
    ${state.modal && state.modal.type === 'plan-recipe' ? planRecipeModal() : ''}
    ${nutritionModal(r)}
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
    <div class="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="${escapeAttr(id)}" tabindex="-1" data-stop-click>
      <div class="sheet-handle" aria-hidden="true"></div>
      <h2 class="modal-title" id="${escapeAttr(id)}">${escapeHtml(title)}</h2>
      ${body}
    </div>
  </div>`;
}
/* Teilen (v0.83): drei getrennte Wege, nie vermischt. Öffentlicher Link nur, wenn das Rezept veröffentlicht ist. */
function recipePublishedPub(r) {
  try { const p = typeof libPublicationForRecipe === 'function' ? libPublicationForRecipe(r.id) : null; return p && p.status === 'published' ? p : null; } catch (e) { return null; }
}
function shareMenuItemsHtml(r, inMenu) {
  const item = (action, icon, label, hint) => `<button type="button" class="menu-item ${hint ? 'menu-item--hint' : ''}" data-action="${action}" data-id="${escapeAttr(r.id)}">${icon}<span class="menu-item-text"><span>${label}</span>${hint ? `<span class="menu-item-hint">${hint}</span>` : ''}</span></button>`;
  const pub = recipePublishedPub(r);
  return item('share-open-send', ICONS.user || ICONS.share, 'An Freunde senden', 'Privat, nur an Freunde in Savora')
    + (pub ? item('share-public-link', ICONS.link, 'Öffentlichen Link teilen', 'Link zur Veröffentlichung in der Rezeptbibliothek') : '')
    + (typeof libPublishMenuItemHtml === 'function' && !r.publicOrigin ? libPublishMenuItemHtml(r) : '')
    + (inMenu ? '' : item('share-recipe', ICONS.pdf, 'Als PDF exportieren'));   // im Menü steht «Als PDF exportieren» schon oben
}
function shareMenuModal(r) {
  return sheet('share-menu-title', 'Teilen', `<div class="menu-list share-menu">${shareMenuItemsHtml(r)}</div>`);
}
function detailMenuModal(r) {
  const item = (action, icon, label, extra) => `<button type="button" class="menu-item ${extra || ''}" data-action="${action}" data-id="${escapeAttr(r.id)}">${icon}<span>${label}</span></button>`;
  return sheet('detail-menu-title', r.title || 'Rezept', `<div class="menu-list">
    ${item('edit-recipe', ICONS.edit, 'Bearbeiten')}
    ${item('duplicate-recipe', ICONS.copy, 'Duplizieren')}
    ${item('export-pdf', ICONS.pdf, 'Als PDF exportieren')}
    ${item('add-to-cookbook', ICONS.bookOpen, 'Zum Kochbuch hinzufügen')}
    ${rcolMenuItemHtml(r)}
    ${linksOk() ? item('link-open', ICONS.link, 'Rezept verknüpfen') : ''}
    ${item('open-plan-recipe', ICONS.calendar, 'Zum Wochenplan')}
    ${item('open-note-modal', ICONS.note, 'Notiz hinzufügen')}
    <p class="menu-group-title" role="presentation">Teilen</p>
    ${shareMenuItemsHtml(r, true)}
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
/* ===== v84 Rezept: Sammlungen am Rezept und «Passt dazu» =====
   Daten nur ueber org.js (orgCollections, orgCollectionIdsOf, orgSetMembership, orgCreateCollection, orgLinksOf,
   orgLinkCreate, orgLinkNote, orgLinkRemove, orgUndo). Fehlt org.js, erscheinen die Teile nicht (typeof-Rueckfall).
   Sammlungen sind privat und getrennt von den Rezeptmerkmalen (source-chip); Verknuepfungen sind kein Rezeptinhalt. */
function orgOk() { return typeof orgCollections === 'function' && typeof orgCollectionIdsOf === 'function' && typeof orgSetMembership === 'function'; }
function linksOk() { return typeof orgLinksOf === 'function' && typeof orgLinkCreate === 'function'; }
function rcolSafeColor(c) { return String((c && c.color) || '').replace(/[^a-z0-9-]/gi, ''); }
function rcolDotHtml(c) {
  const col = rcolSafeColor(c);
  return `<span class="col-dot" aria-hidden="true"${col ? ` style="--c: var(--org-c-${col})"` : ''}></span>`;
}
// Eigene Sammlungen eines Rezepts in der Reihenfolge der Sammlungsliste
function rcolCollectionsOf(recipeId) {
  if (!orgOk()) return [];
  let ids;
  try { ids = new Set(orgCollectionIdsOf(recipeId) || []); } catch (e) { return []; }
  return (orgCollections() || []).filter(c => c && ids.has(c.id));
}
function rcolMenuItemHtml(r) {
  if (!orgOk()) return '';
  const cols = rcolCollectionsOf(r.id);
  const hint = !cols.length ? '' : cols.length <= 2 ? 'In ' + cols.map(c => c.name).join(', ') : `In ${cols.length} Sammlungen`;
  return `<button type="button" class="menu-item ${hint ? 'menu-item--hint' : ''}" data-action="rcol-open" data-id="${escapeAttr(r.id)}">${ICONS.folder}<span class="menu-item-text"><span>Zu Sammlungen hinzufügen</span>${hint ? `<span class="menu-item-hint">${escapeHtml(hint)}</span>` : ''}</span></button>`;
}
/* Rezeptansicht: dezente Umriss-Pillen (max. 3, dann «+ N weitere»), nie im PDF, Versand oder in der Bibliothek */
const RCOL_TAGS_MAX = 3;
function rcolTagsHtml(r) {
  const cols = rcolCollectionsOf(r.id);
  if (!cols.length) return '';
  const more = cols.length - RCOL_TAGS_MAX;
  return `<div class="col-tags" role="group" aria-label="Deine Sammlungen">${cols.map((c, i) => `<button type="button" class="col-tag" data-action="rcol-scope" data-id="${escapeAttr(c.id)}" aria-label="Sammlung ${escapeAttr(c.name)} öffnen"${i >= RCOL_TAGS_MAX ? ' hidden' : ''}>${rcolDotHtml(c)}<span class="col-tag-name">${escapeHtml(c.name)}</span></button>`).join('')}${more > 0 ? `<button type="button" class="text-btn col-tags-more" data-col-tags-more aria-expanded="false">+ ${more} weitere</button>` : ''}</div>`;
}

/* ---------- Dialog «Zu Sammlungen hinzufügen» (Modaltyp 'rcol', auch aus anderen Ansichten: openModal({ type: 'rcol', recipeId })) ----------
   Entwurf im Modal (draft), gespeichert wird erst mit «Speichern». Suche filtert nur die Anzeige, Haken bleiben. */
const RCOL_SEARCH_MIN = 6;
function rcolModalState() {
  const m = state.modal;
  if (!m || m.type !== 'rcol') return null;
  if (!Array.isArray(m.draft)) {
    const cur = rcolCollectionsOf(m.recipeId).map(c => c.id);
    m.orig = cur.slice(); m.draft = cur.slice(); m.query = m.query || '';
    if (!(orgOk() && orgCollections().length)) m.newOpen = true;   // noch keine Sammlung: Feld gleich offen
  }
  return m;
}
function rcolVisible(m) {
  const q = typeof searchNorm === 'function' ? searchNorm(m.query || '') : String(m.query || '').toLowerCase();
  const all = orgOk() ? orgCollections() : [];
  if (!q.trim()) return all;
  const toks = q.split(' ').filter(Boolean);
  return all.filter(c => { const hay = typeof searchNorm === 'function' ? searchNorm(c.name || '') : String(c.name || '').toLowerCase(); return toks.every(t => hay.includes(t)); });
}
function rcolListInnerHtml(m) {
  const all = orgOk() ? orgCollections() : [];
  if (!all.length) return `<li class="rp-empty rcol-empty"><p>Du hast noch keine Sammlung.</p></li>`;
  const list = rcolVisible(m);
  if (!list.length) return `<li class="rp-empty"><p><strong>Keine Sammlung gefunden für «${escapeHtml((m.query || '').trim())}».</strong></p><button type="button" class="outline-btn outline-btn--small" data-rcol-clear>Suche löschen</button></li>`;
  const draft = new Set(m.draft);
  return list.map(c => {
    const on = draft.has(c.id);
    return `<li class="rp-row ${on ? 'is-selected' : ''}"><label class="rp-item">
      <input type="checkbox" class="rp-input" data-rcol-pick="${escapeAttr(c.id)}" ${on ? 'checked' : ''}>
      ${rcolDotHtml(c)}
      <span class="rp-item-text"><span class="rp-item-title">${escapeHtml(c.name)}</span></span>
      <span class="rp-mark" aria-hidden="true">${ICONS.check}</span></label></li>`;
  }).join('');
}
function rcolHiddenText(m) {
  const shown = new Set(rcolVisible(m).map(c => c.id));
  const n = m.draft.filter(id => !shown.has(id)).length;
  if (!n) return '';
  return n === 1 ? '1 ausgewählte Sammlung ist durch die Suche ausgeblendet.' : `${n} ausgewählte Sammlungen sind durch die Suche ausgeblendet.`;
}
function rcolCountText(m) {
  const live = new Set((orgOk() ? orgCollections() : []).map(c => c.id));
  const n = m.draft.filter(id => live.has(id)).length;
  return n ? `${n} ${n === 1 ? 'Sammlung' : 'Sammlungen'} ausgewählt` : 'Keine Sammlung ausgewählt';
}
function rcolNewHtml(m) {
  if (!m.newOpen) return `<button type="button" class="text-btn rcol-new-btn" data-action="rcol-new" data-id="${escapeAttr(m.recipeId)}">${ICONS.plus}<span>Neue Sammlung</span></button>`;
  const err = m.newError === 'empty' ? 'Gib der Sammlung einen Namen.'
    : m.newError === 'too_long' ? 'Der Name ist zu lang. Höchstens 60 Zeichen.'
    : m.newError === 'duplicate' ? 'Diese Sammlung gibt es bereits.'
    : m.newError ? 'Die Sammlung konnte nicht gespeichert werden. Der Gerätespeicher ist vielleicht voll. Versuche es nochmals.' : '';
  return `<div class="rcol-add">
    <div class="inline-add">
      <label for="colNewInline" class="sr-only">Name der neuen Sammlung</label>
      <input id="colNewInline" type="text" maxlength="60" placeholder="Name der Sammlung" autocomplete="off" enterkeyhint="done" value="${escapeAttr(m.newName || '')}"${err ? ' aria-invalid="true" aria-describedby="rcolErr"' : ''}>
      <button type="button" class="outline-btn outline-btn--small" data-action="rcol-create" data-id="${escapeAttr(m.recipeId)}">Erstellen</button>
    </div>
    ${err ? `<p class="fs-hint rcol-err" id="rcolErr" role="alert">${escapeHtml(err)}${m.newError === 'duplicate' && m.existingId ? ` <button type="button" class="text-btn rcol-use" data-action="rcol-use-existing" data-id="${escapeAttr(m.existingId)}">Bestehende Sammlung verwenden</button>` : ''}</p>` : ''}
  </div>`;
}
function rcolModalHtml() {
  const m = rcolModalState();
  if (!m || !orgOk()) return '';
  const r = state.recipes.find(x => x.id === m.recipeId);
  if (!r) return '';
  const many = orgCollections().length >= RCOL_SEARCH_MIN;
  const body = `${many ? `<div class="rp-search" role="search">
      <label for="rcolSearch" class="sr-only">Sammlung suchen</label>
      <span class="rp-search-icon" aria-hidden="true">${ICONS.search || ''}</span>
      <input type="search" id="rcolSearch" class="rp-search-input" placeholder="Sammlung suchen" value="${escapeAttr(m.query || '')}" autocomplete="off" spellcheck="false" enterkeyhint="search" aria-controls="rcolList">
    </div>` : ''}
    <p class="rp-count" id="rcolHidden" aria-live="polite">${escapeHtml(rcolHiddenText(m))}</p>
    <ul class="rp-list rcol-list" id="rcolList" aria-label="Deine Sammlungen">${rcolListInnerHtml(m)}</ul>
    <div class="rcol-new">${rcolNewHtml(m)}</div>`;
  const foot = `<p class="rp-count" id="rcolCount" role="status" aria-live="polite">${escapeHtml(rcolCountText(m))}</p>
    <div class="rp-actions"><button type="button" class="ghost-btn" data-action="close-modal">Abbrechen</button><button type="button" class="primary-btn" data-action="rcol-save" data-id="${escapeAttr(r.id)}">Speichern</button></div>`;
  return rpSheetHtml({ id: 'rcol-title', title: 'Zu Sammlungen hinzufügen', sub: r.title || 'Ohne Titel', subId: 'rcol-sub', body, foot, cls: 'rp-sheet--rcol' });
}
function rcolRefresh(focusId) {
  const m = rcolModalState();
  const ul = document.getElementById('rcolList');
  if (!m || !ul) return;
  ul.innerHTML = rcolListInnerHtml(m);
  const h = document.getElementById('rcolHidden'); if (h) h.textContent = rcolHiddenText(m);
  const c = document.getElementById('rcolCount'); if (c) c.textContent = rcolCountText(m);
  if (focusId) { const inp = ul.querySelector(`[data-rcol-pick="${cssAttr(focusId)}"]`); if (inp) focusWithoutScroll(inp); }
}

/* ---------- «Passt dazu» in der Rezeptansicht ---------- */
const PAIRING_MAX = 4;
const LINK_STATUS_ORDER = { ok: 0, pending: 1, gone: 2 };
function linkListFor(recipeId) {
  if (!linksOk()) return [];
  let list;
  try { list = (orgLinksOf(recipeId) || []).slice(); } catch (e) { return []; }
  // Ziel inzwischen weg (z. B. gerade geloescht, Rueckgaengig-Frist): nie eine kaputte, anklickbare Karte
  list = list.filter(l => l && l.otherId && l.otherId !== recipeId).map(l => (l.status === 'ok' && !state.recipes.some(x => x.id === l.otherId)) ? Object.assign({}, l, { status: 'gone' }) : l);
  return list.map((l, i) => [l, i]).sort((a, b) => ((LINK_STATUS_ORDER[a[0].status] ?? 2) - (LINK_STATUS_ORDER[b[0].status] ?? 2)) || a[1] - b[1]).map(x => x[0]);
}
function linkOtherTitle(l) {
  const o = l && l.status === 'ok' ? state.recipes.find(x => x.id === l.otherId) : null;
  return o ? (o.title || 'Ohne Titel') : 'Verknüpftes Rezept';
}
function pairingCardHtml(r, l, hide, idx) {
  const o = l.status === 'ok' ? state.recipes.find(x => x.id === l.otherId) : null;
  const title = linkOtherTitle(l);
  const time = o ? timeInfo(o).cardText : '';
  const status = o ? '' : l.status === 'pending' ? 'Noch nicht verfügbar' : 'Nicht mehr vorhanden';
  const noteId = l.note ? `pairing-note-${idx}` : '';
  const media = o && hasPhoto(o) ? recipeImageHtml(o, 'pairing-img', 'thumb') : (o ? recipeInitialHtml(o, 'pairing-img pairing-ph') : `<span class="pairing-img pairing-ph" aria-hidden="true">${ICONS.bookOpen}</span>`);
  const body = `<span class="pairing-body"><span class="pairing-title">${escapeHtml(title)}</span>${time ? `<span class="pairing-meta">${ICONS.clock}<span>${escapeHtml(time)}</span></span>` : ''}${status ? `<span class="pairing-meta pairing-status">${status}</span>` : ''}${l.note ? `<span class="pairing-note" id="${noteId}">${escapeHtml(l.note)}</span>` : ''}</span>`;
  const main = o
    ? `<button type="button" class="pairing-main" data-action="open-linked-recipe" data-id="${escapeAttr(o.id)}" data-from="${escapeAttr(r.id)}" data-link-key="${escapeAttr(l.key)}" aria-label="${escapeAttr(title)} öffnen"${noteId ? ` aria-describedby="${noteId}"` : ''}>${media}${body}</button>`
    : `<div class="pairing-main" aria-disabled="true" data-link-key="${escapeAttr(l.key)}">${media}${body}</div>`;
  return `<li class="pairing-card ${o ? '' : 'is-off'}"${hide ? ' hidden' : ''}>${main}<button type="button" class="icon-btn pairing-menu-btn" data-action="link-menu" data-id="${escapeAttr(l.key)}" aria-label="Aktionen für ${escapeAttr(title)}" aria-haspopup="dialog">${ICONS.moreH}</button></li>`;
}
function pairingSectionHtml(r) {
  const links = linkListFor(r.id);
  if (!links.length) return '';   // ohne Verknuepfung keine leere Flaeche; Einstieg dann ueber das Menue
  const many = links.length > PAIRING_MAX;
  return `<section class="pairing" aria-labelledby="pairing-h">
    <div class="pairing-head"><h2 class="section-title" id="pairing-h">Passt dazu</h2><button type="button" class="text-btn pairing-add" data-action="link-open" data-id="${escapeAttr(r.id)}">${ICONS.plus}<span>Verknüpfen</span></button></div>
    <ul class="pairing-list" id="pairingList">${links.map((l, i) => pairingCardHtml(r, l, i >= PAIRING_MAX, i)).join('')}</ul>
    ${many ? `<button type="button" class="text-btn pairing-more" data-pairing-more aria-expanded="false" aria-controls="pairingList">Alle ${links.length} anzeigen</button>` : ''}
  </section>`;
}

/* ---------- Dialog «Rezept verknüpfen» (Modaltyp 'link-recipe') ---------- */
const LINK_NOTE_MAX = 200;
function linkPickState() {
  const m = state.modal;
  if (!m || m.type !== 'link-recipe') return null;
  if (!Array.isArray(m.sel)) { m.sel = []; m.query = m.query || ''; m.note = m.note || ''; }
  return m;
}
function linkLinkedSet(recipeId) { return new Set(linkListFor(recipeId).map(l => l.otherId)); }
function linkCandidates(m) { return state.recipes.filter(x => x.id !== m.recipeId); }   // eigenes Rezept nie waehlbar
function linkListInnerHtml(m) {
  const cands = linkCandidates(m);
  if (!cands.length) return `<li class="rp-empty"><p>Du hast noch kein anderes Rezept zum Verknüpfen.</p></li>`;
  const list = typeof rpFilter === 'function' ? rpFilter(cands, m.query || '') : cands;
  if (!list.length) return `<li class="rp-empty"><p><strong>Kein Rezept gefunden für «${escapeHtml((m.query || '').trim())}».</strong> Prüfe die Schreibweise oder suche nach einer Kategorie.</p><button type="button" class="outline-btn outline-btn--small" data-link-clear>Suche löschen</button></li>`;
  const linked = linkLinkedSet(m.recipeId), sel = new Set(m.sel);
  return list.map(x => {
    const done = linked.has(x.id), on = done || sel.has(x.id);
    const meta = done ? 'Schon verknüpft' : timeInfo(x).cardText;
    return `<li class="rp-row ${on ? 'is-selected' : ''} ${done ? 'is-linked' : ''}"><label class="rp-item">
      <input type="checkbox" class="rp-input" data-link-pick="${escapeAttr(x.id)}" ${on ? 'checked' : ''} ${done ? 'disabled' : ''}>
      ${recipeImageHtml(x, 'picker-thumb', 'thumb')}
      <span class="rp-item-text"><span class="rp-item-title">${escapeHtml(x.title || 'Ohne Titel')}</span>${meta ? `<span class="rp-item-meta">${escapeHtml(meta)}</span>` : ''}</span>
      <span class="rp-mark" aria-hidden="true">${ICONS.check}</span></label></li>`;
  }).join('');
}
function linkSelected(m) {
  const linked = linkLinkedSet(m.recipeId);
  return m.sel.filter(id => id !== m.recipeId && !linked.has(id) && state.recipes.some(x => x.id === id));
}
function linkCountText(m) {
  const n = linkSelected(m).length;
  const q = (m.query || '').trim();
  const parts = [];
  if (q) { const hits = typeof rpFilter === 'function' ? rpFilter(linkCandidates(m), q).length : 0; parts.push(hits === 1 ? '1 Treffer' : `${hits} Treffer`); }
  parts.push(n ? `${n} ${n === 1 ? 'Rezept' : 'Rezepte'} ausgewählt` : 'Noch kein Rezept ausgewählt');
  return parts.join(' · ');
}
function linkSaveLabel(n) { return n > 1 ? `${n} Rezepte verknüpfen` : 'Verknüpfen'; }
function linkPickModalHtml(r) {
  const m = linkPickState();
  if (!m) return '';
  const n = linkSelected(m).length;
  const body = `<div class="rp-search" role="search">
      <label for="linkSearch" class="sr-only">Rezepte durchsuchen</label>
      <span class="rp-search-icon" aria-hidden="true">${ICONS.search || ''}</span>
      <input type="search" id="linkSearch" class="rp-search-input" placeholder="Rezept oder Kategorie suchen" value="${escapeAttr(m.query || '')}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" aria-controls="linkList" aria-describedby="linkCount">
    </div>
    <ul class="rp-list" id="linkList" aria-label="Deine Rezepte">${linkListInnerHtml(m)}</ul>`;
  const note = m.noteOpen
    ? `<div class="field link-note-field"><label for="linkNote">Notiz zur Kombination <span class="rp-optional">(optional)</span></label>
        <input id="linkNote" type="text" maxlength="${LINK_NOTE_MAX}" placeholder="z. B. Sauce kurz vor dem Servieren dazugeben" value="${escapeAttr(m.note || '')}" autocomplete="off" aria-describedby="linkNoteHint">
        <p class="fs-hint" id="linkNoteHint">${n > 1 ? 'Gilt für alle gewählten Rezepte und erscheint jeweils bei beiden.' : 'Erscheint bei beiden Rezepten.'}</p></div>`
    : `<button type="button" class="text-btn link-note-toggle" data-action="link-note-toggle" data-id="${escapeAttr(r.id)}">${ICONS.plus}<span>Notiz zur Kombination hinzufügen</span></button>`;
  const foot = `<p class="rp-count" id="linkCount" role="status" aria-live="polite">${escapeHtml(linkCountText(m))}</p>
    ${note}
    <div class="rp-actions"><button type="button" class="ghost-btn" data-action="close-modal">Abbrechen</button><button type="button" class="primary-btn" data-action="link-save" data-id="${escapeAttr(r.id)}" ${n ? '' : 'disabled'}>${linkSaveLabel(n)}</button></div>`;
  return rpSheetHtml({ id: 'link-title', title: 'Rezept verknüpfen', sub: `Mit «${r.title || 'Ohne Titel'}»`, subId: 'link-sub', body, foot, cls: 'rp-sheet--link' });
}
function linkPickRefresh(focusId) {
  const m = linkPickState();
  const ul = document.getElementById('linkList');
  if (!m || !ul) return;
  ul.innerHTML = linkListInnerHtml(m);
  if (typeof hydrateLazyImages === 'function') hydrateLazyImages();
  linkPickStatus();
  if (focusId) { const inp = ul.querySelector(`[data-link-pick="${cssAttr(focusId)}"]`); if (inp) focusWithoutScroll(inp); }
}
function linkPickStatus() {
  const m = linkPickState();
  if (!m) return;
  const n = linkSelected(m).length;
  const c = document.getElementById('linkCount'); if (c) c.textContent = linkCountText(m);
  const go = document.querySelector('[data-action="link-save"]'); if (go) { go.disabled = !n; go.textContent = linkSaveLabel(n); }
  const hint = document.getElementById('linkNoteHint'); if (hint) hint.textContent = n > 1 ? 'Gilt für alle gewählten Rezepte und erscheint jeweils bei beiden.' : 'Erscheint bei beiden Rezepten.';
}

/* ---------- Kartenmenue und Notiz ---------- */
function linkFind(recipeId, key) { return linkListFor(recipeId).find(l => l.key === key) || null; }
function linkMenuModalHtml(r) {
  const m = state.modal;
  const l = linkFind(r.id, m.key);
  if (!l) return '';
  const ok = l.status === 'ok';
  const btn = (action, id, icon, label, extra, hint) => `<button type="button" class="menu-item ${extra || ''}" data-action="${action}" data-id="${escapeAttr(id)}">${icon}<span class="menu-item-text"><span>${label}</span>${hint ? `<span class="menu-item-hint">${hint}</span>` : ''}</span></button>`;
  return sheet('link-menu-title', linkOtherTitle(l), `<div class="menu-list">
    ${ok ? btn('link-menu-open', l.otherId, ICONS.bookOpen, 'Öffnen') : ''}
    ${ok ? btn('link-note-edit', l.key, ICONS.note || ICONS.edit, l.note ? 'Notiz bearbeiten' : 'Notiz hinzufügen') : ''}
    ${btn('link-remove', l.key, ICONS.trash, 'Verknüpfung entfernen', 'menu-item--danger menu-item--hint', 'Beide Rezepte bleiben erhalten')}
  </div>`);
}
function linkNoteModalHtml(r) {
  const m = state.modal;
  const l = linkFind(r.id, m.key);
  if (!l) return '';
  return sheet('link-note-title', 'Notiz zur Kombination', `
    <p class="hint-line">${escapeHtml(r.title || 'Ohne Titel')} und ${escapeHtml(linkOtherTitle(l))}</p>
    <div class="field"><label for="linkNoteEdit" class="sr-only">Notiz zur Kombination</label>
    <textarea id="linkNoteEdit" rows="3" maxlength="${LINK_NOTE_MAX}" aria-describedby="linkNoteEditHint" placeholder="z. B. Sauce kurz vor dem Servieren dazugeben">${escapeHtml(l.note || '')}</textarea>
    <p class="fs-hint" id="linkNoteEditHint">Erscheint bei beiden Rezepten.</p></div>
    <div class="form-actions"><button type="button" class="ghost-btn" data-action="close-modal">Abbrechen</button><button type="button" class="primary-btn" data-action="link-note-save" data-id="${escapeAttr(l.key)}">Speichern</button></div>`);
}
function linkModalsHtml(r) {
  const t = state.modal && state.modal.type;
  if (!linksOk() || !r) return '';
  if (t === 'link-recipe') return linkPickModalHtml(r);
  if (t === 'link-menu') return linkMenuModalHtml(r);
  if (t === 'link-note') return linkNoteModalHtml(r);
  return '';
}

/* ---------- Teilaktualisierung (ohne render: Cursor, Fokus und Scroll bleiben) ---------- */
document.addEventListener('input', (e) => {
  const t = e.target, m = state.modal;
  if (!t || !m) return;
  if (t.id === 'rcolSearch' && m.type === 'rcol') { m.query = t.value; if (!e.isComposing) rcolRefresh(); }
  else if (t.id === 'colNewInline' && m.type === 'rcol') m.newName = t.value;
  else if (t.id === 'linkSearch' && m.type === 'link-recipe') { m.query = t.value; if (!e.isComposing) linkPickRefresh(); }
  else if (t.id === 'linkNote' && m.type === 'link-recipe') m.note = t.value;
});
document.addEventListener('compositionend', (e) => {
  const t = e.target, m = state.modal;
  if (!t || !m) return;
  if (t.id === 'rcolSearch' && m.type === 'rcol') { m.query = t.value; rcolRefresh(); }
  if (t.id === 'linkSearch' && m.type === 'link-recipe') { m.query = t.value; linkPickRefresh(); }
});
document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (!t || e.key !== 'Enter') return;
  if (t.id === 'rcolSearch' || t.id === 'linkSearch' || t.id === 'linkNote') { e.preventDefault(); return; }   // Enter sendet nichts ab
  if (t.id === 'colNewInline') { e.preventDefault(); const b = document.querySelector('[data-action="rcol-create"]'); if (b) b.click(); }
});
document.addEventListener('change', (e) => {
  const t = e.target, m = state.modal;
  if (!t || !m || !t.dataset) return;
  if (t.dataset.rcolPick && m.type === 'rcol') {
    const id = t.dataset.rcolPick;
    m.draft = t.checked ? Array.from(new Set(m.draft.concat(id))) : m.draft.filter(x => x !== id);
    const li = t.closest('.rp-row'); if (li) li.classList.toggle('is-selected', t.checked);
    const c = document.getElementById('rcolCount'); if (c) c.textContent = rcolCountText(m);
  } else if (t.dataset.linkPick && m.type === 'link-recipe') {
    const id = t.dataset.linkPick;
    m.sel = t.checked ? Array.from(new Set(m.sel.concat(id))) : m.sel.filter(x => x !== id);
    const li = t.closest('.rp-row'); if (li) li.classList.toggle('is-selected', t.checked);
    linkPickStatus();
  }
});
document.addEventListener('click', (e) => {
  const t = e.target && e.target.closest ? e.target : null;
  if (!t) return;
  if (t.closest('[data-rcol-clear]') && state.modal && state.modal.type === 'rcol') {
    state.modal.query = ''; const s = document.getElementById('rcolSearch'); if (s) { s.value = ''; focusWithoutScroll(s); } rcolRefresh(); return;
  }
  if (t.closest('[data-link-clear]') && state.modal && state.modal.type === 'link-recipe') {
    state.modal.query = ''; const s = document.getElementById('linkSearch'); if (s) { s.value = ''; focusWithoutScroll(s); } linkPickRefresh(); return;
  }
  const more = t.closest('[data-col-tags-more], [data-pairing-more]');
  if (more) {
    // Aufklappen ohne Neuaufbau; Fokus auf den ersten bisher verborgenen Eintrag
    const box = more.hasAttribute('data-pairing-more') ? document.getElementById('pairingList') : more.closest('.col-tags');
    const hidden = box ? Array.from(box.querySelectorAll(more.hasAttribute('data-pairing-more') ? ':scope > .pairing-card[hidden]' : ':scope > .col-tag[hidden]')) : [];
    hidden.forEach(x => { x.hidden = false; });
    more.setAttribute('aria-expanded', 'true'); more.hidden = true;
    const first = hidden[0] && (hidden[0].matches('button') ? hidden[0] : hidden[0].querySelector('button'));
    if (first) focusWithoutScroll(first);
  }
}, true);

/* ---------- Auswahl-Sheet: Zutaten in den Einkauf ---------- */
function shopSelectModal() {
  const m = state.modal;
  const byRecipe = {};
  m.items.forEach(it => { (byRecipe[it.recipeId] = byRecipe[it.recipeId] || []).push(it); });
  const multi = Object.keys(byRecipe).length > 1;
  const dupCount = m.items.filter(it => it.dup).length;
  return sheet('shop-select-title', 'In den Einkauf übernehmen', `
    ${m.pickBack ? `<button type="button" class="text-btn shop-back-btn" data-action="shop-back-to-pick">${ICONS.chevronLeft}<span>Zurück zur Auswahl</span></button>` : ''}
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
        ${r.lastCookedAt ? `<p class="cook-finish-last">Zuletzt gekocht am ${escapeHtml(new Date(r.lastCookedAt).toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' }))}</p>` : ''}
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
  if (state.cookMise && idx !== 0) state.cookMise = false;   // Sprung zu einem anderen Schritt beendet die Vorbereitung
  if (state.cookMise && idx === 0 && !state.cookAllSteps && typeof cookMiseView === 'function') {   // v89: Vorbereitung vor Schritt 1
    return `<div class="cookmode-overlay cook-v2 cook-v2--mise cook-scale-${state.cookScale || 0}" role="main" aria-label="Kochmodus">
      <div class="cookmode-top">
        <button class="icon-btn" data-action="exit-cook" aria-label="Kochmodus verlassen">${ICONS.x}</button>
        <span class="cook-stepcount cook-stepcount--text">Vorbereitung</span>
        <span class="cook-top-spacer"></span>
      </div>
      <div class="cook-title-line"><span class="cook-title-text">${escapeHtml(r.title)}</span></div>
      <div class="cookmode-body">${cookMiseView(r)}</div>
      <div class="cookmode-nav">
        <button data-action="cook-mise-done">Überspringen</button>
        <button class="primary" data-action="cook-mise-done">Los geht's</button>
      </div>
    </div>`;
  }
  const step = steps[idx] || { text: 'Für dieses Rezept sind noch keine Schritte erfasst.' };
  const isLast = idx >= total - 1;
  const match = step._sourceIndex !== undefined ? stepIngredientMatch(r, step) : { items: [], fixed: false, ambiguous: false };
  const stepIngs = match.items;
  const groupsById = new Map(); getIngredientGroups(r).forEach(g => g.ingredients.forEach(i => groupsById.set(i._index, g.title)));
  const shownIngs = state.cookShowAllIngredients ? realIngredients(r).map(i => { const idx = r.ingredients.indexOf(i); return { ...i, _index: idx, _group: groupsById.get(idx) }; }) : stepIngs;
  const showGroups = hasNamedGroups(r);
  const factor = servingsFactor(r, currentServings(r));
  const ingChips = shownIngs.map(i => `<button type="button" class="cook-ing ${checked.has(i._index) ? 'is-checked' : ''} ${i._ambiguous ? 'is-ambiguous' : ''}" data-action="toggle-ingredient-check" data-id="${escapeAttr(r.id)}" data-idx="${i._index}" role="checkbox" aria-checked="${checked.has(i._index)}"><span class="check-box" aria-hidden="true">${ICONS.check}</span>${(a => a ? `<span class="cook-ing-amt">${escapeHtml(a)}</span>` : '')(scaledAmountLine(i, factor))} <span class="cook-ing-name">${escapeHtml(i.name)}</span>${showGroups && i._group && (i._ambiguous || state.cookShowAllIngredients) ? `<span class="cook-ing-group">${escapeHtml(i._group)}</span>` : ''}</button>`).join('');
  const matchNote = state.cookShowAllIngredients ? '' : match.fixed ? 'Von dir festgelegt' : match.ambiguous ? 'Vorschlag, nicht eindeutig' : (stepIngs.length ? 'Vorschlag' : '');
  const body = state.cookAllSteps
    ? `${typeof cookVoiceButtonHtml === 'function' ? `<div class="cook-voicectl-row">${cookVoiceButtonHtml()}</div>` : ''}<ol class="cook-all-steps">${steps.map((s, n) => `<li>${s._section ? `<div class="cook-section">${escapeHtml(s._section)}</div>` : ''}<button class="cook-all-step ${n === idx ? 'is-current' : ''}" data-action="cook-goto" data-idx="${n}"><span class="step-no">${n + 1}</span><span>${escapeHtml(s.text)}</span></button></li>`).join('')}</ol>`
    : `<div class="cook-step-card">
        ${step._section ? `<div class="cook-section">${escapeHtml(step._section)}</div>` : ''}
        <div class="cookmode-steptext">${renderStepWithTimers(step.text, idx)}</div>
        ${typeof cookTimerStartButtons === 'function' ? cookTimerStartButtons(step.text, idx) : ''}
      </div>
      <div class="cook-ings">
        <div class="cook-ings-head"><span>${state.cookShowAllIngredients ? 'Alle Zutaten' : (stepIngs.length ? 'Für diesen Schritt' : 'Keine Zutat im Schritt erkannt')}${matchNote ? ` <span class="cook-match-note">· ${matchNote}</span>` : ''}</span></div>
        ${ingChips ? `<div class="cook-ing-list">${ingChips}</div>` : ''}
        <div class="cook-ings-actions cook-ings-actions--below">${!state.cookShowAllIngredients && step._sourceIndex !== undefined ? `<button class="text-btn cook-ings-btn" data-action="cook-edit-step-ings" data-idx="${step._sourceIndex}">Anpassen</button>` : ''}<button class="text-btn cook-ings-btn" data-action="cook-toggle-all-ings">${state.cookShowAllIngredients ? 'Nur dieser Schritt' : 'Alle Zutaten'}</button></div>
      </div>`;
  const refModal = state.modal && state.modal.type === 'step-ings' ? stepIngredientsModal(r, state.modal.stepIndex) : '';
  const linkModal = typeof cookLinkModalHtml === 'function' ? cookLinkModalHtml(r) : '';   // v84: «Passt dazu» nur als Vorschau
  const scaleLabel = ['Normal', 'Gross', 'Sehr gross'][state.cookScale || 0];
  return `${refModal}${linkModal}<div class="cookmode-overlay cook-v2 cook-scale-${state.cookScale || 0}" role="main" aria-label="Kochmodus">
    <div class="cookmode-top">
      <button class="icon-btn" data-action="exit-cook" aria-label="Kochmodus verlassen">${ICONS.x}</button>
      <span class="cook-stepcount"><span aria-hidden="true"><b>${idx + 1}</b>/${total}</span><span class="cookmode-progress sr-only" aria-live="polite">Schritt ${idx + 1} von ${total}</span></span>
      <div class="cook-top-actions">
        <button class="icon-btn cook-font-btn" data-action="cook-font" aria-label="Schriftgrösse ändern, aktuell ${scaleLabel}"><span aria-hidden="true">Aa</span></button>
        <button class="icon-btn ${state.cookAllSteps ? 'is-active' : ''}" data-action="cook-toggle-all-steps" aria-pressed="${state.cookAllSteps}" aria-label="Alle Schritte anzeigen">${ICONS.listSteps}</button>
        <button class="cook-pill-btn cook-read-btn ${state.voiceEnabled ? 'is-on' : ''}" data-action="toggle-voice" aria-pressed="${!!state.voiceEnabled}">${state.voiceEnabled ? ICONS.volume : ICONS.volumeOff}<span>Vorlesen</span></button>
      </div>
    </div>
    <div class="cook-progress" aria-hidden="true"><span style="width:${Math.round(((idx + 1) / total) * 100)}%"></span></div>
    <div class="cook-title-line"><span class="cook-title-text">${escapeHtml(r.title)}</span>${typeof cookLinksButtonHtml === 'function' ? cookLinksButtonHtml(r) : ''}${state.wakeLock ? `<span class="wakelock-chip">${ICONS.sun} Bildschirm bleibt an</span>` : (state.wakeLockUnsupported ? `<span class="wakelock-chip wakelock-chip--off">Bildschirm kann ausgehen</span>` : '')}</div>
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
    <div class="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="step-ings-title" tabindex="-1" data-stop-click>
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
    ${topbar('Einkauf', { actions: items.length ? `<button class="icon-btn" data-action="share-shopping" aria-label="Liste teilen oder kopieren">${ICONS.share}</button><button class="icon-btn" data-action="open-shop-menu" aria-label="Weitere Aktionen zur Einkaufsliste" aria-haspopup="dialog">${ICONS.moreH}</button>` : '' })}
    <main class="has-tabbar shop-main">
      ${pageTitle('Einkaufsliste')}
      ${typeof householdSwitchHtml === 'function' ? householdSwitchHtml() : ''}
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
    ${state.modal && state.modal.type === 'shop-menu' ? shopMenuModal() : ''}
    ${state.modal && state.modal.type === 'shop-clear-confirm' ? shopClearConfirmModal() : ''}
  `;
}
/* v89 B: «Alles löschen» liegt im «…»-Menü und braucht eine Bestätigung. Die Aktion selbst (clear-all-shopping, mit Rückgängig) bleibt. */
function shopMenuModal() {
  const n = state.shopping.length;
  const done = state.shopping.filter(i => i.checked).length;
  return sheet('shop-menu-title', 'Einkaufsliste', `
    <div class="menu-list">
      <button class="menu-item" data-action="share-shopping">${ICONS.share}<span>Liste teilen oder kopieren</span></button>
      ${done ? `<button class="menu-item" data-action="clear-checked-shopping">${ICONS.check}<span>Erledigte entfernen (${done})</span></button>` : ''}
      <button class="menu-item menu-item--danger" data-action="shop-clear-ask" ${n ? '' : 'disabled'}>${ICONS.trash}<span>Ganze Liste löschen</span></button>
    </div>`);
}
function shopClearConfirmModal() {
  const n = state.shopping.length;
  return sheet('shop-clear-title', 'Ganze Liste löschen?', `
    <p class="hint-line shop-clear-text">${n === 1 ? '1 Eintrag wird' : `Alle ${n} Einträge werden`} von der Einkaufsliste entfernt. Direkt danach kannst du das noch rückgängig machen.</p>
    <div class="form-actions"><button class="ghost-btn" data-action="close-modal">Abbrechen</button><button class="primary-btn kd-danger-btn" data-action="clear-all-shopping">Liste löschen</button></div>`);
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
// Einkauf «Aus Rezepten»: Suche, Mehrfachauswahl mit Menge je Rezept, danach die Vorschau (shopSelectModal)
function pickRecipesModal() {
  const m = state.modal;
  m.rpPicker = true; m.rpMulti = true;
  if (!Array.isArray(m.rpSel)) m.rpSel = Array.isArray(m.selected) ? m.selected.slice() : [];
  const n = rpSelected(m).length;
  return rpSheetHtml({ id: 'pick-recipes-title', title: 'Aus Rezepten zur Einkaufsliste', sub: 'Wähle Rezepte und Mengen. Danach siehst du die Zutaten und wählst, was du brauchst.', cls: 'rp-sheet--shop',
    body: `${state.recipes.length ? rpSearchHtml(m) : ''}${rpListHtml(m, 'Rezepte')}`,
    foot: `<p class="rp-count" id="rpCount" role="status" aria-live="polite">${escapeHtml(rpCountText(m))}</p>
      <div class="rp-actions"><button type="button" class="ghost-btn" data-action="close-modal">Abbrechen</button><button type="button" class="primary-btn" data-action="confirm-pick-recipes" data-rp-confirm>${n ? `Zur Vorschau (${n} ${n === 1 ? 'Rezept' : 'Rezepte'})` : 'Zur Vorschau'}</button></div>` });
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
        <button class="plan-entry-main" data-action="open-recipe" data-id="${escapeAttr(r.id)}" data-plan-date="${escapeAttr(key)}" data-plan-entry="${escapeAttr(e.id)}">
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
      ${recipeCount ? `<div class="plan-day-foot"><label class="day-select"><input type="checkbox" data-plan-day="${escapeAttr(key)}" ${selected ? 'checked' : ''}> <span class="day-select-text">Zutaten dieses Tages einkaufen</span></label></div>` : ''}
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
      ${typeof handleIcsAction === 'function' && weekHasEntries ? `<button type="button" class="outline-btn outline-btn--block plan-ics-btn" data-action="mealplan-ics">${ICONS.calendar} In Kalender</button>` : ''}
      <button class="primary-btn primary-btn--block" data-action="mealplan-to-shopping" ${weekHasEntries ? '' : 'disabled'}>${ICONS.cart} ${selCount ? `Zutaten von ${selCount} Tag${selCount === 1 ? '' : 'en'} einkaufen` : 'Zutaten der Woche einkaufen'}</button>
    </main>
    ${bottomNav()}
    ${state.modal && state.modal.type === 'pick-recipe' ? recipePickerModal() : ''}
    ${state.modal && state.modal.type === 'plan-entry' ? planEntryModal() : ''}
    ${state.modal && state.modal.type === 'shop-select' ? shopSelectModal() : ''}
  `;
}
// Mahlzeit fuer neue Eintraege: optional; eine eigene Bezeichnung erst ueber «Andere Bezeichnung»
function planMealPicker(m) {
  const custom = m.mealCustom || (m.meal && !MEAL_SLOTS.some(x => x.id === m.meal) ? m.meal : '');
  const other = !!(m.mealOther || custom);
  return `<fieldset class="rp-group">
      <legend class="rp-label">Mahlzeit <span class="rp-optional">(optional)</span></legend>
      <div class="chip-row chip-row--wrap rp-chips rp-meal-chips" role="radiogroup" aria-label="Mahlzeit">
        ${MEAL_SLOTS.map(x => `<button type="button" class="chip ${m.meal === x.id && !other ? 'chip--active' : ''}" role="radio" aria-checked="${m.meal === x.id && !other}" data-action="set-plan-meal" data-id="${escapeAttr(x.id)}">${x.label}</button>`).join('')}
        <button type="button" class="chip ${other ? 'chip--active' : ''}" role="radio" aria-checked="${other}" data-action="plan-meal-other">Andere Mahlzeit</button>
      </div>
      ${other ? `<div class="field rp-field"><label for="planMealCustom">Name der Mahlzeit</label><input id="planMealCustom" type="text" maxlength="40" placeholder="z. B. Znüni oder Gäste" autocomplete="off" enterkeyhint="done" value="${escapeAttr(custom)}"></div>` : ''}
    </fieldset>`;
}
// Wochenplan: Planungsdialog fuer einen Tag. Umschalter «Rezept» / «Ohne Rezept», nie alles gleichzeitig.
function recipePickerModal() {
  const m = state.modal;
  m.rpPicker = true; m.rpMulti = false;
  const [y, mo, d] = m.date.split('-').map(Number);
  const labelDate = new Date(y, mo - 1, d).toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' });
  const mode = m.planMode === 'note' ? 'note' : 'recipe';
  const seg = `<div class="rp-seg" role="radiogroup" aria-label="Rezept oder Eintrag ohne Rezept wählen">
      <button type="button" class="rp-seg-btn" role="radio" aria-checked="${mode === 'recipe'}" data-action="plan-mode" data-id="recipe">Rezept</button>
      <button type="button" class="rp-seg-btn" role="radio" aria-checked="${mode === 'note'}" data-action="plan-mode" data-id="note">Ohne Rezept</button>
    </div>`;
  const recipePart = `${state.recipes.length ? rpSearchHtml(m) : ''}${rpListHtml(m, 'Rezepte')}`;
  const notePart = `<div class="rp-note">
      <p class="rp-label" id="planQuickLabel">Schnell eintragen</p>
      <div class="chip-row chip-row--wrap rp-chips" role="group" aria-labelledby="planQuickLabel">
        <button type="button" class="chip" data-action="add-plan-note" data-note="Reste">Reste essen</button>
        <button type="button" class="chip" data-action="add-plan-note" data-note="Auswärts">Auswärts essen</button>
      </div>
      <div class="field rp-field"><label for="planNoteInput">Eigene Notiz</label>
        <input id="planNoteInput" type="text" maxlength="${PLAN_NOTE_MAX}" placeholder="z. B. Pizza bei Anna" autocomplete="off" enterkeyhint="done" value="${escapeAttr(m.noteDraft || '')}"></div>
    </div>`;
  const foot = mode === 'recipe'
    ? `<p class="rp-count" id="rpCount" role="status" aria-live="polite">${escapeHtml(rpCountText(m))}</p>
       <div id="rpPlanQty">${rpPlanQtyHtml(m)}</div>
       <div class="rp-actions"><button type="button" class="ghost-btn" data-action="close-modal">Abbrechen</button><button type="button" class="primary-btn" data-action="plan-commit-recipe" data-date="${escapeAttr(m.date)}">Zum Wochenplan hinzufügen</button></div>`
    : `<div class="rp-actions"><button type="button" class="ghost-btn" data-action="close-modal">Abbrechen</button><button type="button" class="primary-btn" data-action="add-plan-note">Notiz hinzufügen</button></div>`;
  return rpSheetHtml({ id: 'picker-modal-title', title: 'Zum Wochenplan', sub: labelDate, subId: 'picker-modal-date', cls: 'rp-sheet--plan',
    body: `${planMealPicker(m)}${seg}<div class="rp-pane" data-plan-mode="${mode}">${mode === 'recipe' ? recipePart : notePart}</div>`, foot });
}
// v0.83.1: Bestehenden Eintrag bearbeiten, im gleichen Dialoggeruest wie «Zum Wochenplan» (recipe-picker.js):
// Schliessen-Symbol, Abbrechen, Mahlzeit optional mit «Andere Mahlzeit», Menge mit Schrittweite des Ertrags.
// Die Menge wird erst mit «Speichern» uebernommen; Abbrechen, Escape und Schliessen verwerfen sie.
function planEntryModal() {
  const m = state.modal;
  const e = planEntriesFor(m.date).find(x => x.id === m.entryId);
  if (!e) return '';
  m.rpPicker = true; m.rpMulti = false;
  const [y, mo, d] = m.date.split('-').map(Number);
  const labelDate = new Date(y, mo - 1, d).toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' });
  const days = Array.from({ length: 7 }, (_, i) => addDays(state.weekStart, i));
  const moveTo = m.moveDraft || m.date;   // gemerkte Auswahl, falls der Dialog neu aufgebaut wird (Mahlzeit gewechselt)
  const moveSel = `<div class="field rp-field"><label for="planMoveDay">Verschieben auf</label><select id="planMoveDay">${days.map((dd, i) => { const k = fmtDateKey(dd); return `<option value="${escapeAttr(k)}" ${k === moveTo ? 'selected' : ''}>${WEEKDAY_LABELS[i]}, ${dd.getDate()}. ${MONTH_LABELS[dd.getMonth()]}</option>`; }).join('')}</select></div>`;
  const remove = `<button type="button" class="text-btn text-btn--danger rp-remove" data-action="remove-plan-entry">${ICONS.trash || ''}<span>Aus dem Wochenplan entfernen</span></button>`;
  const foot = `<div class="rp-actions"><button type="button" class="ghost-btn" data-action="close-modal">Abbrechen</button><button type="button" class="primary-btn" data-action="save-plan-entry">Speichern</button></div>`;
  if (isNoteEntry(e)) {
    return rpSheetHtml({ id: 'plan-entry-title', title: 'Notiz bearbeiten', sub: labelDate, subId: 'plan-entry-date', cls: 'rp-sheet--plan rp-sheet--entry',
      body: `<div class="field rp-field"><label for="planNoteEdit">Notiz</label><input id="planNoteEdit" type="text" maxlength="${PLAN_NOTE_MAX}" value="${escapeAttr(m.noteEditDraft !== undefined ? m.noteEditDraft : (e.text || ''))}" autocomplete="off" enterkeyhint="done"></div>
        ${planMealPicker(m)}${moveSel}${remove}`, foot });
  }
  const r = state.recipes.find(x => x.id === e.recipeId) || { id: e.recipeId, title: '', servings: 0 };
  if (!m.rpQty) m.rpQty = (e.servings > 0 && yieldKnown(r)) ? { [r.id]: Number(e.servings) } : {};
  const qty = yieldKnown(r)
    ? `<div class="rp-group"><div class="rp-qty-line"><span class="rp-qty-label">Menge für diesen Tag</span>${rpStepperHtml(r, rpQtyFor(m, r))}</div>
       <p class="rp-qty-hint">Das Rezept selbst bleibt bei ${escapeHtml(servingLabel(r, r.servings || 0))}.</p></div>`
    : `<p class="rp-qty-hint">Bei diesem Rezept fehlt die Angabe, was es ergibt. Für diesen Tag gelten die Originalmengen. Ergänze die Angabe im Rezept, um die Menge anzupassen.</p>`;
  return rpSheetHtml({ id: 'plan-entry-title', title: r.title || 'Eintrag', sub: labelDate, subId: 'plan-entry-date', cls: 'rp-sheet--plan rp-sheet--entry',
    body: `${qty}${planMealPicker(m)}${moveSel}${remove}`, foot });
}
// Aus der Rezeptdetailansicht (auch nach «Speichern und planen» in der Bibliothek, dann mit der lokalen ID):
// Mahlzeit und Menge waehlen, dann den Tag der aktuellen Woche antippen.
function planRecipeModal() {
  const m = state.modal;
  m.rpPicker = true; m.rpMulti = false;
  const r = state.recipes.find(x => x.id === m.recipeId);
  const days = Array.from({ length: 7 }, (_, i) => addDays(getMonday(new Date()), i));
  const todayKey = fmtDateKey(new Date());
  const qty = r && yieldKnown(r) ? `<div class="rp-qty-line"><span class="rp-qty-label">Menge</span>${rpStepperHtml(r, rpQtyFor(m, r))}</div>` : '';
  return rpSheetHtml({ id: 'plan-recipe-title', title: 'Zum Wochenplan', sub: r ? (r.title || 'Ohne Titel') : '', cls: 'rp-sheet--plan',
    body: `${planMealPicker(m)}${qty}
      <p class="rp-label" id="planDayLabel">Tag wählen</p>
      <div class="menu-list" role="group" aria-labelledby="planDayLabel">${days.map((d, i) => { const k = fmtDateKey(d); return `<button type="button" class="menu-item" data-action="assign-mealplan-recipe" data-date="${k}" data-id="${escapeAttr(m.recipeId)}">${ICONS.calendar}<span>${WEEKDAY_LABELS[i]}, ${d.getDate()}. ${MONTH_LABELS[d.getMonth()]}${k === todayKey ? ' <span class="plan-today">Heute</span>' : ''}</span></button>`; }).join('')}</div>`,
    foot: `<div class="rp-actions"><button type="button" class="ghost-btn" data-action="close-modal">Abbrechen</button></div>` });
}

/* Vorlagenwaehler (Radiogruppe, Tastatur und Touch) und Vorschau aus derselben Layoutdefinition wie der Export */
function coverPickerHtml(cfg) { return ceEditorHtml(cfg); }   // Cover-Editor: cover-editor.js
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
function cookbookStepFooter(step, cfg) {
  const n = cfg && Array.isArray(cfg.items) ? cfg.items.length : 0;
  const status = step === 1 ? `<span class="cb-footer-status">${n ? cookbookPlural(n, 'Rezept', 'Rezepte') + ' im Kochbuch' : 'Noch kein Rezept im Kochbuch'}</span>` : '<span></span>';
  return `<div class="cb-step-footer">
    ${step > 1 ? `<button class="ghost-btn" data-action="cb-step" data-id="${step - 1}">${ICONS.chevronLeft} Zurück</button>` : status}
    ${step < 3 ? `<button class="primary-btn" data-action="cb-step" data-id="${step + 1}" aria-label="Weiter zu «${COOKBOOK_STEPS[step].label}»">Weiter ${ICONS.chevronRight}</button>` : ''}
  </div>`;
}
/* v85: eine Zeile je Rezept (Nummer, Name, Pfeile, Menü). Nummer in PDF-Reihenfolge; Pfeile tauschen innerhalb der Gruppe. */
function cookbookItemRowHtml(r, it, pos, k, n, cfg) {
  const t = r.title || 'Ohne Titel';
  const id = escapeAttr(r.id);
  const cur = cookbookItemChapterKnown(cfg, it) ? it.chapterId : '';
  const sel = cfg.chapters.length ? `<select class="cb-item-chapter" aria-label="Kapitel für ${escapeAttr(t)}" data-cb-item-chapter="${id}"><option value="">Ohne Kapitel</option>${cfg.chapters.map(c => `<option value="${escapeAttr(c.id)}" ${cur === c.id ? 'selected' : ''}>${escapeHtml(c.name || 'Ohne Namen')}</option>`).join('')}</select>` : '';
  return `<li class="cb-item" data-cb-row="${id}">
    <span class="cb-item-no" aria-hidden="true">${pos}</span>
    <span class="cb-item-title">${escapeHtml(t)}</span>
    <span class="cb-item-actions">${sel}
      <button type="button" class="icon-btn icon-btn--small" data-action="cb-move-item" data-id="${id}" data-delta="-1" ${k === 0 ? 'disabled' : ''} aria-label="${escapeAttr(t)} nach oben">${ICONS.arrowUp}</button>
      <button type="button" class="icon-btn icon-btn--small" data-action="cb-move-item" data-id="${id}" data-delta="1" ${k === n - 1 ? 'disabled' : ''} aria-label="${escapeAttr(t)} nach unten">${ICONS.arrowDown}</button>
      <button type="button" class="icon-btn icon-btn--small" data-action="cb-item-menu" data-id="${id}" aria-haspopup="dialog" aria-label="Weitere Aktionen für «${escapeAttr(t)}»">${ICONS.moreH}</button>
    </span></li>`;
}
function cookbookBookSectionHtml(cfg, missing) {
  const byId = Object.fromEntries(state.recipes.map(r => [r.id, r]));
  const total = state.recipes.length;
  const n = cfg.items.length;
  const groups = cookbookItemGroups(cfg);
  const named = cfg.chapters.length > 0;
  let pos = 0;
  const list = groups.map((g, gi) => {
    const title = named ? `<h3 class="cb-group-title" id="cbGroup${gi}">${escapeHtml(g.chapter ? (g.chapter.name || 'Ohne Namen') : 'Ohne Kapitel')} <span class="cb-group-n">· ${g.items.length}</span></h3>` : '';
    const rows = g.items.map((it, k) => { pos += 1; return cookbookItemRowHtml(byId[it.recipeId], it, pos, k, g.items.length, cfg); }).join('');
    return `${title}<ul class="cb-list" ${named ? `aria-labelledby="cbGroup${gi}"` : 'aria-label="Rezepte im Kochbuch"'}>${rows}</ul>`;
  }).join('');
  const count = !total ? 'Du hast noch keine Rezepte. Lege zuerst Rezepte an, dann kannst du sie hier auswählen.'
    : `${n} von ${total} ${total === 1 ? 'Rezept' : 'Rezepten'}.${n ? ' So erscheinen sie im PDF.' : ''}`;
  const jump = missing.length ? `<button type="button" class="text-btn cb-jump" data-action="cb-jump-more">${missing.length === 1 ? '1 weiteres Rezept' : `${missing.length} weitere Rezepte`} ${ICONS.arrowDown}</button>` : '';
  const bulk = total && n ? `<div class="cb-bulk">${jump}<button type="button" class="text-btn cb-clear" data-action="cb-clear-all">Alle entfernen</button></div>` : '';
  const empty = total && !n ? `<div class="cb-empty"><p class="hint-line">Noch kein Rezept im Kochbuch. Nimm unten Rezepte auf.</p><div class="cb-bulk"><button type="button" class="outline-btn outline-btn--small" data-action="cb-add-all">Alle aufnehmen</button>${jump}</div></div>` : '';
  return `<section class="panel cb-book" aria-labelledby="cbStepTitle">
      <h2 class="section-title" id="cbStepTitle" tabindex="-1">Im Kochbuch</h2>
      <p class="hint-line cb-count" id="cbSelCount" aria-live="polite">${count}</p>
      ${bulk}${empty}${list}
    </section>`;
}
function cookbookMoreSectionHtml(cfg, missing) {
  if (!missing.length) return '';
  const showAddAll = cfg.items.length > 0;   // bei leerem Buch steht «Alle aufnehmen» schon oben (nur einmal)
  return `<section class="panel cb-more" id="cbMore" aria-labelledby="cbMoreTitle">
      <h2 class="section-title" id="cbMoreTitle" tabindex="-1">Weitere Rezepte <span class="cb-group-n">· ${missing.length}</span></h2>
      <p class="hint-line cb-count">Noch nicht im Kochbuch.</p>
      <div class="cb-bulk cb-bulk--add">
        ${showAddAll ? '<button type="button" class="outline-btn outline-btn--small" data-action="cb-add-all">Alle aufnehmen</button>' : ''}
        ${typeof cbColButtonHtml === 'function' ? cbColButtonHtml() : ''}
      </div>
      ${typeof rpCookbookSearchHtml === 'function' ? rpCookbookSearchHtml(missing.length) : ''}
      <ul class="cb-list cb-list--out" aria-labelledby="cbMoreTitle">${missing.map(r => `<li class="cb-item cb-item--out"><span class="cb-item-title">${escapeHtml(r.title || 'Ohne Titel')}</span><button type="button" class="outline-btn outline-btn--small cb-add-one" data-action="cb-add-item" data-id="${escapeAttr(r.id)}" aria-label="${escapeAttr(r.title || 'Ohne Titel')} ins Kochbuch aufnehmen">${ICONS.plus}<span class="cb-add-label">Aufnehmen</span></button></li>`).join('')}</ul>
    </section>`;
}
function cookbookChaptersSectionHtml(cfg) {
  const rows = cfg.chapters.map((c) => {
    const n = cfg.items.filter(it => it.chapterId === c.id).length;
    const id = escapeAttr(c.id);
    return `<li class="cb-chapter"><input type="text" class="cb-chapter-name" aria-label="Name des Kapitels" data-cb-chapter="${id}" value="${escapeAttr(c.name)}" autocomplete="off">
      <span class="cb-chapter-n">${cookbookChapterCountText(n)}</span>
      <button type="button" class="icon-btn icon-btn--small" data-action="cb-chapter-menu" data-id="${id}" aria-haspopup="dialog" aria-label="Weitere Aktionen für Kapitel «${escapeAttr(c.name || 'Ohne Namen')}»">${ICONS.moreH}</button></li>`;
  }).join('');
  return `<section class="panel cb-chapters" aria-labelledby="cbChaptersTitle">
      <h2 class="section-title" id="cbChaptersTitle" tabindex="-1">Kapitel</h2>
      ${rows ? `<ul class="cb-chapter-list" aria-labelledby="cbChaptersTitle">${rows}</ul>` : '<p class="hint-line">Mit Kapiteln gliederst du das Buch, zum Beispiel in Vorspeisen und Desserts. Ohne Kapitel stehen alle Rezepte in einer Liste.</p>'}
      <div class="inline-add"><label for="cbNewChapter" class="sr-only">Name des neuen Kapitels</label><input type="text" id="cbNewChapter" placeholder="Neues Kapitel, z. B. Desserts" autocomplete="off" enterkeyhint="done"><button type="button" class="outline-btn" data-action="cb-add-chapter">Kapitel hinzufügen</button></div>
      ${cfg.chapters.length ? `<label class="check-row cb-chapter-pages"><input type="checkbox" data-cb-flag="chapterPages" aria-describedby="cbChapterPagesHint" ${cfg.chapterPages ? 'checked' : ''}> <span>Kapitelseiten</span></label>
      <p class="hint-line cb-check-hint" id="cbChapterPagesHint">Jedes Kapitel beginnt auf einer eigenen Seite. Sonst stehen die Kapitel nur im Inhaltsverzeichnis.</p>` : ''}
    </section>`;
}
function cookbookStepSelect(cfg) {
  const inBook = new Set(cfg.items.map(it => it.recipeId));
  const missing = state.recipes.filter(r => !inBook.has(r.id));
  return `
      ${cookbookBookSectionHtml(cfg, missing)}
      ${cookbookMoreSectionHtml(cfg, missing)}
      ${cookbookChaptersSectionHtml(cfg)}`;
}
function cookbookPageStyleChoice(cfg) {
  const cur = pdfNormTpl(cfg.pdfTemplate || pdfDefaultTemplateId());   // alte IDs A/B/C gelten als pur/prise-pop
  return `<div class="pdf-tpl-choice" role="radiogroup" aria-label="Seitenstil der Rezepte">
      ${Object.values(PDF_TEMPLATES).map(t => `<button type="button" role="radio" aria-checked="${cur === t.id}" class="pdf-tpl-opt ${cur === t.id ? 'active' : ''}" data-action="cb-page-style" data-id="${escapeAttr(t.id)}"><span class="pdf-tpl-swatch pdf-tpl-swatch-${t.id.toLowerCase()}" aria-hidden="true"></span><b>${t.name}</b><small>${t.hint}</small></button>`).join('')}
    </div>`;
}
/* 0.83.1: Satz unter «Name», passend zur Wahl, wo der Name gedruckt wird */
function cookbookNameWhereText(author, pn) {
  if (!author) return 'Kein Name eingetragen. Im PDF erscheint kein Name.';
  const n = `«${escapeHtml(author)}»`;
  if (pn === 'cover') return `${n} steht nur auf dem Titelblatt.`;
  if (pn === 'footer') return `${n} steht nur in der Fusszeile jeder Rezeptseite. Im Editor oben bleibt er sichtbar, damit du ihn bearbeiten kannst.`;
  if (pn === 'none') return `${n} bleibt gespeichert, wird aber nicht gedruckt. Im Editor oben bleibt er sichtbar, damit du ihn bearbeiten kannst.`;
  return `${n} steht auf dem Titelblatt und in der Fusszeile jeder Rezeptseite.`;
}
/* v85: Schritt «Gestalten» in zwei Teilen (Segment «Titelblatt | Rezeptseiten»). Zustand state.cbDesignPart, nur im Speicher.
   Titelblatt = Cover-Editor (cover-editor.js), Rezeptseiten = Seitenstil, Name im PDF, Nährwerte. */
const COOKBOOK_DESIGN_PARTS = [{ id: 'cover', label: 'Titelblatt' }, { id: 'pages', label: 'Rezeptseiten' }];
const COOKBOOK_STYLE_SHORT = { 'pur': 'Ruhig und hell, spart Tinte.', 'prise-pop': 'Rote Titel, gelbe Zutaten.' };   // Kurztext nur hier; PDF-Dialog nutzt weiter PDF_TEMPLATES.hint
function cookbookDesignPart() { return state.cbDesignPart === 'pages' ? 'pages' : 'cover'; }
function cookbookPartTabs(part) {
  return `<div class="cb-parts" role="tablist" aria-label="Was du gestaltest">${COOKBOOK_DESIGN_PARTS.map(t => {
    const on = t.id === part;
    return `<button type="button" class="cb-part-tab" role="tab" id="cbPartTab-${t.id}" aria-selected="${on}" aria-controls="cbPart-${t.id}" tabindex="${on ? 0 : -1}" data-action="cb-design-part" data-id="${t.id}">${t.label}</button>`;
  }).join('')}</div>`;
}
/* Satz unter «Name im PDF»: kurz, ohne Verweis «oben» (Name und Wahl stehen jetzt beisammen) */
function cookbookNameWhereShort(author, pn) {
  if (!author) return 'Kein Name eingetragen. Im PDF erscheint kein Name.';
  const n = `«${escapeHtml(author)}»`;
  if (pn === 'cover') return `${n} steht nur auf dem Titelblatt.`;
  if (pn === 'footer') return `${n} steht nur in der Fusszeile jeder Rezeptseite.`;
  if (pn === 'none') return `${n} bleibt gespeichert, wird aber nicht gedruckt.`;
  return `${n} steht auf dem Titelblatt und in der Fusszeile jeder Rezeptseite.`;
}
function cookbookPageStyleCards(cfg) {
  const cur = pdfNormTpl(cfg.pdfTemplate || pdfDefaultTemplateId());   // alte IDs A/B/C gelten als pur/prise-pop
  return `<div class="pdf-tpl-choice" role="radiogroup" aria-labelledby="cbStyleTitle">
      ${Object.values(PDF_TEMPLATES).map(t => `<button type="button" role="radio" aria-checked="${cur === t.id}" class="pdf-tpl-opt ${cur === t.id ? 'active' : ''}" data-action="cb-page-style" data-id="${escapeAttr(t.id)}"><span class="pdf-tpl-swatch pdf-tpl-swatch-${t.id.toLowerCase()}" aria-hidden="true"></span><b>${t.name}</b><small>${COOKBOOK_STYLE_SHORT[t.id] || t.hint}</small></button>`).join('')}
    </div>`;
}
function cookbookPagesPart(cfg) {
  const nut = cookbookPdfNutrition(cfg);
  const pn = cookbookPrintName(cfg);
  const author = String(cfg.author || '').trim();
  const sender = String(state.senderName || '').trim();
  return `<section class="cb-part cb-part--pages" id="cbPart-pages" role="tabpanel" aria-labelledby="cbPartTab-pages">
      <div class="cb-pgroup">
        <h3 class="cb-pgroup-title" id="cbStyleTitle">Seitenstil</h3>
        ${cookbookPageStyleCards(cfg)}
      </div>
      <div class="cb-pdf-opts">
        <section class="cb-pgroup cb-opt" aria-labelledby="cbPdfOptsTitle">
          <div class="cb-pgroup-head">
            <h3 class="cb-pgroup-title" id="cbPdfOptsTitle">Name im PDF</h3>
            <button type="button" class="text-btn cb-name-edit" data-action="cb-design-part" data-id="cover" data-focus="cbAuthor">${author ? 'Name ändern' : 'Name eintragen'}</button>
          </div>
          <p class="cb-name-where" id="cbNameWhere">${cookbookNameWhereShort(author, pn)}</p>
          ${!author && sender ? `<button type="button" class="outline-btn outline-btn--small cb-name-sender" data-action="cb-use-sender-name">«${escapeHtml(sender)}» als Name eintragen</button>` : ''}
          <p class="cb-plabel" id="cbPrintNameLabel">Wo soll der Name stehen?</p>
          <div class="cb-print-name" role="radiogroup" aria-labelledby="cbPrintNameLabel">
            ${COOKBOOK_PRINT_NAME.map(v => `<label class="check-line"><input type="radio" name="cbPrintName" value="${v}" data-cb-print-name ${pn === v ? 'checked' : ''}> <span>${COOKBOOK_PRINT_NAME_LABEL[v]}</span></label>`).join('')}
          </div>
        </section>
        ${state.showNutrition ? `<section class="cb-pgroup cb-opt" aria-labelledby="cbNutLabel">
          <h3 class="cb-pgroup-title" id="cbNutLabel">Nährwerte</h3>
          <div class="nutrition-segmented" role="radiogroup" aria-labelledby="cbNutLabel" aria-describedby="cbNutHint">
            ${COOKBOOK_NUTRITION_LEVELS.map(l => `<button type="button" role="radio" aria-checked="${nut === l}" class="${nut === l ? 'active' : ''}" data-action="cb-pdf-nutrition" data-level="${l}">${COOKBOOK_NUTRITION_LABEL[l]}</button>`).join('')}
          </div>
          <p class="hint-line" id="cbNutHint">Nur bei Rezepten mit berechneten Nährwerten.</p>
        </section>` : ''}
      </div>
    </section>`;
}
function cookbookStepDesign(cfg) {
  const part = cookbookDesignPart();
  return `
      <div class="cb-design" data-part="${part}">
        <h2 class="sr-only" id="cbStepTitle" tabindex="-1">Gestalten</h2>
        ${cookbookPartTabs(part)}
        ${part === 'cover'
          ? `<section class="cb-part cb-part--cover" id="cbPart-cover" role="tabpanel" aria-labelledby="cbPartTab-cover">${coverPickerHtml(cfg)}<button type="button" class="cb-part-next" data-action="cb-design-part" data-id="pages"><span class="cb-part-next-text"><b>Weiter mit Rezeptseiten</b><small>Seitenstil, Name im PDF, Nährwerte</small></span>${ICONS.chevronRight}</button></section>`
          : cookbookPagesPart(cfg)}
      </div>`;
}
/* Teil wechseln: ungespeicherte Eingaben des Cover-Editors zuerst sichern, dann neu zeichnen.
   focusId: Element im neuen Teil (z. B. 'cbAuthor'); sonst bleibt der Fokus auf dem Reiter. */
function cookbookOpenPart(part, focusId, opts) {
  opts = opts || {};
  const next = part === 'pages' ? 'pages' : 'cover';
  if (typeof ceFlush === 'function') ceFlush();
  const changed = cookbookDesignPart() !== next;
  state.cbDesignPart = next;
  if (focusId === 'cbAuthor' && typeof ce !== 'undefined' && ce) ce.tab = 'text';   // Namensfeld liegt im Reiter «Texte»
  if (next === 'pages') document.documentElement.style.scrollPaddingTop = '';   // Polster der angehefteten Vorschau gilt nur im Teil «Titelblatt»
  if (state.view !== 'cookbook' || (parseInt(state.cookbookStep, 10) || 1) !== 2) return;
  if (changed || focusId) render();
  const wrap = document.querySelector('.cb-design');
  const panel = document.getElementById('cbPart-' + next);
  if (changed && panel && panel.animate && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) {
    panel.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 160, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
  }
  const target = focusId && document.getElementById(focusId);
  if (target) {
    // zwei Bilder warten: erst dann steht das Polster der angehefteten Vorschau (scrollPaddingTop); Feld mittig im freien Bereich darunter
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const t = document.getElementById(focusId); if (!t) return;
      t.focus({ preventScroll: true });
      const pad = parseInt(document.documentElement.style.scrollPaddingTop, 10) || 0, r = t.getBoundingClientRect();
      window.scrollBy(0, r.top - (pad + Math.max(0, (window.innerHeight - pad - r.height) / 3)));
    }));
    return;
  }
  const tab = document.getElementById('cbPartTab-' + next);
  if (tab && opts.focusTab !== false) focusWithoutScroll(tab);
  // Segment im Bild halten (z. B. nach «Weiter mit Rezeptseiten» am Ende des langen Titelblatts)
  if (wrap) requestAnimationFrame(() => {   // nach dem Zeichnen messen (die Seite wird beim Wechsel deutlich kuerzer)
    const w = document.querySelector('.cb-design'); if (!w) return;
    const tb = document.querySelector('.topbar'), top = tb && /sticky|fixed/.test(getComputedStyle(tb).position) ? tb.getBoundingClientRect().height : 0;
    const r = w.getBoundingClientRect();
    if (r.top < top || r.top > window.innerHeight * 0.5) window.scrollBy(0, r.top - top - 16);
  });
}
/* Ein Prüfhinweis mit Ziel (Rezept prüfen, Cover bearbeiten, Kapitel bearbeiten). v85: Stufe nur für Hilfstechnik als Text,
   sichtbar über die Gruppe; Rezepthinweise als Name plus Grund, ein Knopf pro Rezept. */
function cookbookHintHtml(h) {
  const lvl = { error: 'Fehler', check: 'Prüfen', info: 'Info' }[h.level] || 'Info';
  const t = h.target;
  const btn = t ? `<button type="button" class="outline-btn outline-btn--small cb-hint-go" data-action="${escapeAttr(t.action)}" ${t.id != null ? `data-id="${escapeAttr(t.id)}"` : ''}>${escapeHtml(t.label)}</button>` : '';
  const details = h.kind === 'empty-chapters' && h.names && h.names.length
    ? `<details class="cb-hint-details"><summary>${ICONS.chevronRight}<span>Leere Kapitel anzeigen</span></summary><ul>${h.names.map(n => `<li>${escapeHtml(n || 'Ohne Namen')}</li>`).join('')}</ul><p class="hint-line">Die Kapitel bleiben im Kochbuch erhalten. Sobald du ihnen Rezepte zuordnest, erscheinen sie im PDF.</p></details>` : '';
  const text = h.kind === 'recipe'
    ? `<p class="cb-hint-text cb-hint-text--recipe"><b>${escapeHtml(h.name)}</b> <span>${escapeHtml(h.reasons.join(', '))}</span></p>`
    : `<p class="cb-hint-text">${escapeHtml(h.text)}</p>`;
  const icon = h.level !== 'check' ? `<span class="cb-hint-icon" aria-hidden="true">${ICONS.info}</span>` : '';
  return `<li class="cb-warn cb-warn--${h.level === 'check' ? 'warn' : h.level}" data-level="${h.level}">${icon}<div class="cb-hint-body"><span class="cb-hint-level sr-only">${lvl}:</span>${text}${details}</div>${btn ? `<div class="cb-hint-acts">${btn}</div>` : ''}</li>`;
}
/* Prüfung gruppiert nach Stufe (Reihenfolge Fehler, Prüfen, Info bleibt über alle Listen erhalten) */
function cookbookHintsHtml(hints) {
  if (!hints.length) return `<p class="cb-all-ok">${ICONS.check}<span>Alles bereit. Keine Hinweise.</span></p>`;
  const groups = [['error', 'Muss behoben werden'], ['check', 'Bitte ansehen'], ['info', 'Gut zu wissen']];
  return groups.map(([lvl, title]) => {
    const hs = hints.filter(h => h.level === lvl);
    if (!hs.length) return '';
    const hid = 'cbHints-' + lvl;
    return `<h4 class="cb-hints-title" id="${hid}">${title}${lvl === 'check' ? ` <span class="cb-group-n">· ${hs.length}</span>` : ''}</h4>
      <ul class="cb-warnings cb-warnings--${lvl}" aria-labelledby="${hid}">${hs.map(cookbookHintHtml).join('')}</ul>`;
  }).join('');
}
function cookbookStepPreview(cfg) {
  const hints = cookbookReview(cfg);
  const sum = cookbookSummary(cfg);
  const cv = cfg.cover || coverSanitizeConfig(null, true);
  const layout = coverLayout(coverInputFromConfig(cfg));
  const tplId = cookbookPdfTemplate(cfg);
  const tplName = (coverTemplateById(cv.templateId) || {}).name || '';
  const coverName = cv.v === COVER_SCHEMA_V2 && cv.mode === 'custom' ? 'Eigenes Cover' : tplName;
  const n = cfg.items.length;
  const book = cookbookActiveBook();
  const last = cookbookLastBuildFor(book.id);
  const byId = Object.fromEntries(state.recipes.map(r => [r.id, r]));
  const recipes = cookbookOrderedSections(cfg).flatMap(s => s.recipes);
  const pagesList = last && Object.keys(last.pages).length ? `<div class="cb-pages">
      <h3 class="sub-title">Seiten im letzten PDF (${escapeHtml(cookbookPdfTemplateName(last.template))}, ${cookbookPlural(last.pageCount, 'Seite', 'Seiten')})</h3>
      <ul class="cb-pages-list">${recipes.filter(r => last.pages[r.id]).map(r => `<li><span>${escapeHtml((byId[r.id] || r).title || 'Ohne Titel')}</span><span class="cb-pages-n">${cookbookPlural(last.pages[r.id], 'Seite', 'Seiten')}</span></li>`).join('')}</ul>
      <p class="hint-line">Die Seiten siehst du in der PDF-Vorschau. Sie wird dafür neu erstellt.</p>
    </div>` : '';
  const nut = cookbookPdfNutrition(cfg);
  const author = String(cfg.author || '').trim();
  return `
      <section class="panel cb-final">
        <h2 class="section-title" id="cbStepTitle" tabindex="-1">Vorschau &amp; PDF</h2>
        <div class="cb-final-grid">
          <div class="cover-preview" aria-label="Vorschau des Titelblatts">${coverPreviewHtml(layout)}</div>
          <div class="cb-summary-wrap"><dl class="cb-summary">
            <div><dt>Inhalt</dt><dd id="cbSummaryText">${escapeHtml(sum.text)}</dd></div>
            <div><dt>Titelblatt</dt><dd>${escapeHtml(coverName)}</dd></div>
            <div><dt>Seitenstil</dt><dd>${escapeHtml(cookbookPdfTemplateName(tplId))}</dd></div>
            <div><dt>Name</dt><dd${author ? '' : ' class="is-empty"'}>${author ? escapeHtml(author) : 'nicht eingetragen'}</dd></div>
            ${author ? `<div><dt>Name im PDF</dt><dd id="cbSummaryPrintName">${COOKBOOK_PRINT_NAME_LABEL[cookbookPrintName(cfg)]}</dd></div>` : ''}
            ${state.showNutrition ? `<div><dt>Nährwerte</dt><dd>${COOKBOOK_NUTRITION_LABEL[nut]}</dd></div>` : ''}
          </dl>
          <button type="button" class="text-btn cb-summary-edit" data-action="cb-step" data-id="2">Gestaltung ändern</button></div>
        </div>
        <div class="cb-review">
          <h3 class="sub-title" id="cbHintsTitle">Prüfung</h3>
          ${cookbookHintsHtml(hints)}
        </div>
        <div class="cb-export-bar"><button class="primary-btn primary-btn--block" data-action="export-cookbook" ${n ? '' : 'disabled aria-describedby="cbHints-error"'}>${ICONS.pdf} PDF-Vorschau erstellen</button></div>
        <p class="hint-line cb-export-hint">Inhaltsverzeichnis und Seitenzahlen kommen automatisch dazu. Du siehst das PDF zuerst als Vorschau.</p>
        ${pagesList}
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
      ${cookbookStepFooter(step, cfg)}
    </main>
    ${bottomNav()}
    ${pdfExportModal()}
    ${ceModalHtml()}
    ${typeof cbColModalHtml === 'function' ? cbColModalHtml() : ''}
    ${typeof cookbookEditorModals === 'function' ? cookbookEditorModals() : ''}
  `;
}

/* ---------- Gefuehrte Rezepterfassung ---------- */
const FORM_STEPS = ['Basis', 'Kategorien', 'Zutaten', 'Zubereitung', 'Kontrolle'];
function ingredientRow(i, idx) {
  const n = idx + 1;
  // v89: jede Zutat ist eine eigene Karte, der Name steht zuerst und breit; Menge und Einheit darunter.
  // Mengenfeld ohne inputmode=decimal: «½», «1/2» und Bereiche wie «2-3» muessen tippbar bleiben. Schnellknoepfe erscheinen nur beim Bearbeiten der Zeile.
  const quick = (val, label, aria) => `<button type="button" class="ing-quick-btn" data-action="ing-quick-amount" data-val="${escapeAttr(val)}" aria-label="${escapeAttr(aria)}" data-keep-focus>${label}</button>`;
  return `<div class="repeat-row ing-row" data-ing-row="${idx}">
    <div class="field ing-name"><input type="text" placeholder="Zutat, z. B. Mehl" aria-label="Zutat ${n}, Name" class="ing-name-input" autocomplete="off" enterkeyhint="next" value="${escapeHtml(i.name || '')}"></div>
    <div class="field ing-amount"><input type="text" placeholder="Menge" aria-label="Zutat ${n}, Menge" class="ing-amount-input" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="next" value="${escapeHtml(String(i.amount ?? ''))}"></div>
    <div class="field ing-unit"><input type="text" placeholder="Einheit" aria-label="Zutat ${n}, Einheit" class="ing-unit-input" autocomplete="off" enterkeyhint="next" value="${escapeHtml(i.unit || '')}"></div>
    <div class="ing-quick" role="group" aria-label="Menge von Zutat ${n} schnell eingeben">${quick('½', '½', 'Halb einfügen')}${quick('¼', '¼', 'Viertel einfügen')}${quick('-', 'bis', 'Bereich einfügen, z. B. 2-3')}</div>
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
        <p class="form-step-caption" aria-hidden="true">Schritt ${step + 1} von ${FORM_STEPS.length}: <strong>${escapeHtml(FORM_STEPS[step])}</strong></p>
        <section class="form-step ${step === 0 ? 'is-active' : ''}" data-form-step="0" aria-label="Basis">
          <div class="field"><label for="f-title">Titel</label><input type="text" id="f-title" value="${escapeHtml(r.title)}" placeholder="z.B. Zitronen-Risotto"></div>
          <div class="field"><label for="f-image">Foto</label>
            <div class="image-drop" id="imgDrop">
              ${recipeSafeImage(r) ? `<img src="${escapeHtml(recipeSafeImage(r))}" alt="">` : recipeSafeImageId(r) ? `<div data-lazy-img="full" data-image-id="${escapeHtml(recipeSafeImageId(r))}" class="image-drop-placeholder">${ICONS.chef}</div>` : `<div class="image-drop-placeholder">${ICONS.chef}<span>Foto auswählen</span></div>`}
              <input type="file" accept="image/*" id="f-image" aria-label="Foto auswählen">
            </div></div>
          <div class="field-row field-row--2">
            <div class="field"><label for="f-serving-mode">Ertrag</label><select id="f-serving-mode" aria-describedby="f-yield-hint" data-change-fn="formYieldModeChanged"><option value="portions" ${servingMode(r) === 'portions' ? 'selected' : ''}>Portionen</option><option value="pieces" ${servingMode(r) === 'pieces' ? 'selected' : ''}>Stück</option><option value="total" ${servingMode(r) === 'total' ? 'selected' : ''}>Gesamtertrag (z. B. 1 Glas)</option></select></div>
            <div class="field"><label for="f-servings">Anzahl</label><input type="number" id="f-servings" min="1" value="${Number(r.servings) > 0 ? r.servings : ''}" placeholder="${Number(r.servings) > 0 ? '' : 'unbekannt'}"></div>
          </div>
          <div class="field" id="f-yield-label-field"${servingMode(r) === 'portions' ? ' hidden' : ''}><label for="f-yield-label">Bezeichnung</label><input type="text" id="f-yield-label" maxlength="40" value="${escapeAttr(servingMode(r) === 'portions' ? '' : (r.yieldLabel || ''))}" placeholder="${servingMode(r) === 'total' ? 'z. B. Glas, ml, Blech' : 'z. B. Cookies, Stück'}"></div>
          <p class="hint-line" id="f-yield-hint">${escapeHtml(formYieldHint(servingMode(r)))}</p>
          <div class="field-row field-row--2">
            <div class="field"><label for="f-time">Gesamtzeit (Min.)</label><input type="number" id="f-time" min="0" value="${r.timeMinutes > 0 ? r.timeMinutes : ''}" placeholder="${r.timeMinutes > 0 ? '' : 'unbekannt'}"></div>
            <div class="field"><label for="f-difficulty">Schwierigkeit</label><select id="f-difficulty">${['', 'Einfach', 'Mittel', 'Anspruchsvoll'].map(d => `<option value="${escapeAttr(d)}" ${(r.difficulty || '') === d ? 'selected' : ''}>${d || 'Keine Angabe'}</option>`).join('')}</select></div>
          </div>
          <details class="field-more"${(r.prepMinutes || r.restMinutes || r.cookMinutes) ? ' open' : ''}><summary>Weitere Zeitangaben (optional)</summary>
            <div class="field-row field-row--3">
              <div class="field"><label for="f-prep">Vorbereitung (Min.)</label><input type="number" id="f-prep" min="0" value="${r.prepMinutes || ''}"></div>
              <div class="field"><label for="f-cook">Garen oder Backen (Min.)</label><input type="number" id="f-cook" min="0" value="${r.cookMinutes || ''}"></div>
              <div class="field"><label for="f-rest">Ruhen oder Abkühlen (Min.)</label><input type="number" id="f-rest" min="0" value="${r.restMinutes || ''}"></div>
            </div>
            <p class="hint-line">Gesamtzeit heisst: vom Start bis zum Servieren. Sie wird nicht automatisch addiert, weil Schritte parallel laufen können. Leere Felder bleiben unbekannt.</p>
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
            <div class="tag-input-row" id="tagInputRow">${(r.tags || []).map(t => `<span class="tag-pill">${escapeHtml(t)}<button data-action="remove-tag" data-tag="${escapeHtml(t)}" aria-label="Schlagwort ${escapeHtml(t)} entfernen">${ICONS.x}</button></span>`).join('')}<span class="tag-add"><input type="text" id="f-tag-new" placeholder="Neues Schlagwort" enterkeyhint="done" autocomplete="off" aria-describedby="f-tag-hint"><button type="button" class="outline-btn outline-btn--small tag-add-btn" data-action="add-tag">${ICONS.plus} Hinzufügen</button></span></div>
            <div class="field-hint" id="f-tag-hint">Eigene Stichwörter zum Wiederfinden, z.B. Familienrezept, Für Gäste, Von Oma.</div></div>
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
            ${(() => { const iss = typeof recipeQualityIssues === 'function' ? recipeQualityIssues(r) : []; return iss.length ? `<h3 class="sub-title">Hinweise</h3><div class="recipe-check recipe-check--form">${recipeCheckListHtml(r, iss, true)}</div><p class="hint-line">Nichts wird automatisch geändert. Nach dem Speichern kannst du Vorschläge auf der Rezeptseite einzeln übernehmen.</p>` : ''; })()}
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
  const portions = Number(r.servings) > 0 ? yieldText(r) : '';
  const meta = [portions, timeInfo(r).cardText ? timeInfo(r).cardText + ' Gesamtzeit' : '', r.difficulty || ''].filter(Boolean);
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
