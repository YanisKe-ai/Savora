/* ---------- Rezeptbibliothek: Ansichten ----------
   Entdecken (Suche, Schnellfilter, Filterfenster, Rasterkarten), öffentliche Detailansicht, Meldefenster und
   öffentliches Profil. Daten und Logik liegen in library.js (lib, libSearch, ensurePersonalRecipe ...).
   Grundsätze:
   - Öffentliche Rezepte leben nur in `lib`, nie in state.recipes. Lokale Aktionen (Wochenplan, Einkauf, Kochbuch,
     Kochen) laufen immer über ensurePersonalRecipe(publicationId) und danach über die bestehenden Handler
     (dispatchAction aus ui.js), damit es keine zweite Logik gibt.
   - Während der Eingabe im Suchfeld wird nur der Ergebnisbereich (#libResults) neu gesetzt: Fokus und Cursor bleiben.
   - Bilder: nur Speicherpfade; libImgSrc(path) liefert die signierte URL aus dem Cache oder ''. Ohne URL steht
     eine Platzhalterfläche derselben Grösse (keine Layoutsprünge). */

const LIB_TIME_CHOICES = [15, 30, 45, 60, 90];
const LIB_DIET_LABELS = { vegan: 'Vegan', vegetarisch: 'Vegetarisch', fleisch: 'Fleisch', fisch: 'Fisch' };
const LIB_REPORT_REASONS = [
  { id: 'spam', label: 'Spam' },
  { id: 'foreign', label: 'Fremde Inhalte' },
  { id: 'problematic', label: 'Problematische Inhalte' },
  { id: 'other', label: 'Anderer Grund' },
];
const LIB_ICON_SAVE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>';
const LIB_ICON_SAVED = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
const LIB_ICON_FLAG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/></svg>';
const LIB_ICON_USER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';
const LIB_ICON_OFFLINE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 9.2 4.5 4.5 0 0 0 7 18z"/><path d="M3 3l18 18"/></svg>';

/* ---------- Zugriff auf den Datenzustand (defensiv, eine Stelle zum Anpassen) ---------- */
function libHas(name) { return typeof window[name] === 'function'; }
function libState() { return (typeof lib !== 'undefined' && lib) ? lib : {}; }
function libDisc() { return libState().discover || {}; }
function libDiscFilters() {
  const f = libDisc().filters || {};
  const max = f.maxMinutes != null ? f.maxMinutes : (f.max_minutes != null ? f.max_minutes : null);
  return { quick: !!f.quick, veg: !!f.veg, maxMinutes: max, diet: Array.isArray(f.diet) ? f.diet.slice() : [], categories: Array.isArray(f.categories) ? f.categories.slice() : [] };
}
function libDiscItems() { const d = libDisc(); return Array.isArray(d.items) ? d.items : []; }
function libDiscNext() { const d = libDisc(); return d.cursor || d.nextCursor || null; }
function libDiscQuery() { const d = libDisc(); return String(d.q != null ? d.q : (d.query || '')); }
function libDiscCapped() { const d = libDisc(); return !!(d.capped || d.totalCapped); }
function libDiscMoreStatus() { const d = libDisc(); return d.moreStatus || d.loadMoreStatus || 'idle'; }
function libDiscSort() { return libDisc().sort === 'quickest' ? 'quickest' : 'newest'; }
function libIsOffline() { return typeof navigator !== 'undefined' && navigator.onLine === false; }
function libImg(path) { if (!path) return ''; try { return libHas('libImgSrc') ? (libImgSrc(path) || '') : ''; } catch (e) { return ''; } }
function libCopies(id) { try { return libHas('libCopiesOf') ? (libCopiesOf(id) || []) : []; } catch (e) { return []; } }
function libPublicDiets() {
  const src = (typeof LIB_PUBLIC_DIETS !== 'undefined' && Array.isArray(LIB_PUBLIC_DIETS)) ? LIB_PUBLIC_DIETS : ['vegan', 'vegetarisch', 'fleisch', 'fisch'];
  return src.map(x => typeof x === 'string' ? { id: x, label: LIB_DIET_LABELS[x] || x } : { id: x.id || x.key, label: x.label || LIB_DIET_LABELS[x.id || x.key] || (x.id || x.key) });
}
function libCategoryLabel(id) {
  const o = MEAL_TYPE_OPTIONS.concat(DISH_TYPE_OPTIONS).find(x => x.id === id);
  return o ? o.label : (typeof categoryLabelFor === 'function' ? categoryLabelFor(id) : id);
}
function libRecipeCountText(n, capped) {
  if (capped) return `Mehr als ${n} Rezepte`;
  return `${n} Rezept${n === 1 ? '' : 'e'}`;
}
/* Nutzerfreundliche Fehlermeldung, nie Rohfehler. Server-Texte (HTTP 400, P0001) sind laut Vertrag bereits für Nutzer formuliert. */
function libErrorText(err, fallback) {
  if (err && (err.offline || libIsOffline())) return 'Keine Internetverbindung. Versuche es erneut, sobald du online bist.';
  if (err && err.userMessage) return String(err.userMessage);
  if (err && err.status === 400 && err.message && !/[_{}]|savora_|sql|relation|function/i.test(err.message)) return String(err.message).replace(/^KONFLIKT:\s*/, '');
  return fallback;
}

/* ---------- Umschalter «Meine Rezepte · Entdecken» ---------- */
function recipesSwitchHtml() {
  const discover = state.view === 'discover';
  const btn = (action, label, on) => `<button type="button" class="lib-switch-btn ${on ? 'is-on' : ''}" data-action="${action}" ${on ? 'aria-current="page"' : ''}>${label}</button>`;
  return `<nav class="lib-switch" aria-label="Rezepte">
    ${btn('lib-tab-mine', 'Meine Rezepte', !discover)}
    ${btn('lib-tab-discover', 'Entdecken', discover)}
  </nav>`;
}

/* ---------- Rezeptkarte ---------- */
function libMediaHtml(path, cls, w, h, alt) {
  const src = libImg(path);
  return `<span class="${cls}" aria-hidden="${alt ? 'false' : 'true'}">
    <span class="lib-ph">${ICONS.bookOpen}</span>
    ${src ? `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt || '')}" width="${w}" height="${h}" loading="lazy" decoding="async" onload="this.classList.add('is-loaded')" onerror="this.remove()">` : ''}
  </span>`;
}
function libCardHtml(card) {
  if (!card || !card.id) return '';
  const id = String(card.id);
  const title = String(card.title || 'Ohne Titel');
  const author = card.author && card.author.display_name ? String(card.author.display_name) : '';
  const mins = Number(card.total_minutes);
  const time = mins > 0 ? `<span class="lcard-meta">${ICONS.clock}<span>${mins} Min.</span></span>` : '';
  const saved = libCopies(id).length > 0;
  const tid = 'lct-' + id.replace(/[^a-zA-Z0-9-]/g, '');
  const save = saved
    ? `<button type="button" class="lcard-save is-saved" data-action="lib-open-copy" data-id="${escapeAttr(id)}" aria-label="${escapeAttr(title)}: gespeichert, in meinen Rezepten öffnen">${LIB_ICON_SAVED}<span>Gespeichert</span></button>`
    : `<button type="button" class="lcard-save" data-action="lib-save" data-id="${escapeAttr(id)}" aria-label="${escapeAttr(title)} in meine Rezepte speichern">${LIB_ICON_SAVE}<span>Speichern</span></button>`;
  return `<li class="lcard-item"><article class="lcard" data-lib-card="${escapeAttr(id)}" aria-labelledby="${tid}">
    <button type="button" class="lcard-main" data-action="lib-open" data-id="${escapeAttr(id)}">
      ${libMediaHtml(card.thumb_path || card.image_path, 'lcard-media', 480, 360, '')}
      <span class="lcard-body">
        <span class="lcard-title" id="${tid}">${escapeHtml(title)}</span>
        ${time}
        ${author ? `<span class="lcard-author">von ${escapeHtml(author)}</span>` : ''}
      </span>
    </button>
    <div class="lcard-foot">${save}</div>
  </article></li>`;
}
function libSkeletonCards(n) {
  let out = '';
  for (let i = 0; i < n; i++) out += `<li class="lcard-item"><div class="lcard lcard--skel"><span class="lcard-media"></span><span class="lcard-body"><span class="lib-skel-line"></span><span class="lib-skel-line lib-skel-line--short"></span></span><div class="lcard-foot"><span class="lib-skel-btn"></span></div></div></li>`;
  return out;
}

/* ---------- Entdecken ---------- */
function libSheetFilterCount(f) {
  f = f || libDiscFilters();
  return f.categories.length + f.diet.length + (f.maxMinutes ? 1 : 0);
}
function libActiveChips() {
  if (libHas('libFiltersActive')) {
    try {
      return (libFiltersActive() || []).filter(c => c && c.key !== 'quick' && c.key !== 'veg').map(c => ({ key: String(c.key), label: String(c.label || c.key) }));
    } catch (e) { /* Rückfall unten */ }
  }
  const f = libDiscFilters(), out = [];
  f.categories.forEach(id => out.push({ key: 'cat:' + id, label: libCategoryLabel(id) }));
  if (f.maxMinutes) out.push({ key: 'max', label: `Bis ${f.maxMinutes} Min.` });
  f.diet.forEach(id => out.push({ key: 'diet:' + id, label: LIB_DIET_LABELS[id] || id }));
  return out;
}
function libFiltersAny() {
  const f = libDiscFilters();
  return !!(f.quick || f.veg || libSheetFilterCount(f) || libActiveChips().length);
}
function libSortHtml() {
  const s = libDiscSort();
  return `<label class="lib-sort"><span class="sr-only">Sortierung</span>
    <select class="lib-sort-select" id="libSortSelect">
      <option value="newest" ${s === 'newest' ? 'selected' : ''}>Neueste</option>
      <option value="quickest" ${s === 'quickest' ? 'selected' : ''}>Kürzeste Gesamtzeit</option>
    </select>${ICONS.arrowDown}</label>`;
}
function libStateBlock(icon, title, text, actions, role) {
  return `<div class="lib-state" ${role ? `role="${role}"` : ''}>
    <span class="lib-state-icon" aria-hidden="true">${icon}</span>
    <h2 class="lib-state-title">${escapeHtml(title)}</h2>
    ${text ? `<p class="lib-state-text">${escapeHtml(text)}</p>` : ''}
    ${actions ? `<div class="lib-state-actions">${actions}</div>` : ''}
  </div>`;
}
function libEmptyActions() {
  const signed = typeof cloudSignedIn === 'function' && cloudSignedIn();
  if (!signed) return `<button type="button" class="primary-btn" data-action="goto-view" data-view="settings-account">Anmelden</button>`;
  if (!state.recipes.length) return `<button type="button" class="primary-btn" data-action="new-recipe">${ICONS.plus} Rezept erstellen</button>`;
  return `<button type="button" class="primary-btn" data-action="lib-tab-mine">Eigenes Rezept veröffentlichen</button>`;
}
function libResultsHtml() {
  const d = libDisc(), items = libDiscItems();
  const status = d.status || 'idle';
  const offline = status === 'offline' || (libIsOffline() && !items.length);
  if (offline && !items.length) {
    return libStateBlock(LIB_ICON_OFFLINE, 'Keine Internetverbindung', 'Zum Entdecken brauchst du eine Internetverbindung. Deine gespeicherten Rezepte sind weiterhin verfügbar.',
      `<button type="button" class="primary-btn" data-action="lib-tab-mine">Meine Rezepte öffnen</button><button type="button" class="ghost-btn" data-action="lib-retry">Erneut versuchen</button>`);
  }
  if (status === 'error' && !items.length) {
    return libStateBlock(ICONS.info, 'Die Rezepte konnten nicht geladen werden.', '', `<button type="button" class="primary-btn" data-action="lib-retry">Erneut versuchen</button>`, 'alert');
  }
  if ((status === 'loading' || status === 'idle') && !items.length) {
    return `<div class="lib-result-row" aria-hidden="true"><span class="lib-skel-line lib-skel-line--count"></span></div>
      <ul class="lib-grid" aria-hidden="true">${libSkeletonCards(6)}</ul>
      <p class="sr-only" role="status">Rezepte werden geladen.</p>`;
  }
  if (!items.length) {
    const searching = !!libDiscQuery().trim() || libFiltersAny();
    if (!searching) {
      return libStateBlock(ICONS.bookOpen, 'Hier entsteht die Savora-Rezeptbibliothek.', 'Veröffentliche ein eigenes Rezept und teile es mit anderen.', libEmptyActions());
    }
    return `<h2 class="sr-only" id="libResultsH">Ergebnisse</h2>` + libStateBlock(ICONS.search, 'Keine passenden Rezepte gefunden.', 'Versuche einen anderen Suchbegriff oder passe die Filter an.',
      libFiltersAny() ? `<button type="button" class="ghost-btn" data-action="lib-filter-clear-all">Filter zurücksetzen</button>` : '');
  }
  const total = Number(d.total) >= items.length ? Number(d.total) : items.length;
  const capped = libDiscCapped();
  const busy = status === 'loading';
  const more = libDiscMoreStatus();
  const next = libDiscNext();
  const moreHtml = more === 'error'
    ? `<div class="lib-more lib-more--error" role="alert"><p>Weitere Rezepte konnten nicht geladen werden.</p><button type="button" class="ghost-btn" data-action="lib-load-more">Erneut versuchen</button></div>`
    : next ? `<div class="lib-more"><button type="button" class="ghost-btn lib-more-btn" data-action="lib-load-more" ${more === 'loading' ? 'aria-busy="true" aria-disabled="true"' : ''}>${more === 'loading' ? 'Lädt …' : 'Mehr laden'}</button></div>` : '';
  return `<div class="lib-result-row">
      <h2 class="lib-result-line" id="libResultsH">${escapeHtml(libRecipeCountText(total, capped))}</h2>
      ${libSortHtml()}
    </div>
    <ul class="lib-grid ${busy ? 'is-stale' : ''}" ${busy ? 'aria-busy="true"' : ''} aria-labelledby="libResultsH">${items.map(libCardHtml).join('')}</ul>
    ${moreHtml}`;
}
function libQuickHtml() {
  const f = libDiscFilters();
  const n = libSheetFilterCount(f);
  const q = (action, label, on) => `<button type="button" class="lib-qf ${on ? 'is-on' : ''}" data-action="${action}" aria-pressed="${on}">${on ? `<span class="lib-qf-check" aria-hidden="true">${LIB_ICON_SAVED}</span>` : ''}${label}</button>`;
  const chips = libActiveChips();
  return `<div class="lib-quick" role="group" aria-label="Schnellfilter">
      ${q('lib-filter-quick', 'Bis 30 Min.', f.quick)}
      ${q('lib-filter-veg', 'Vegetarisch', f.veg)}
      <button type="button" class="lib-qf lib-qf--more ${n ? 'is-on' : ''}" data-action="lib-filter-open" aria-haspopup="dialog">${ICONS.sliders}<span>Filter${n ? ' · ' + n : ''}</span></button>
    </div>
    ${chips.length ? `<ul class="lib-chips" aria-label="Aktive Filter">
      ${chips.map(c => `<li><button type="button" class="lib-chip" data-action="lib-chip-remove" data-id="${escapeAttr(c.key)}" aria-label="Filter ${escapeAttr(c.label)} entfernen"><span>${escapeHtml(c.label)}</span>${ICONS.x}</button></li>`).join('')}
      ${chips.length > 1 ? `<li><button type="button" class="lib-chip lib-chip--reset" data-action="lib-filter-clear-all">Alle entfernen</button></li>` : ''}
    </ul>` : ''}`;
}
function discoverView() {
  const phone = typeof isPhoneLayout === 'function' && isPhoneLayout();
  const q = libDiscQuery();
  libScheduleBind();
  return `
    <div class="home-head lib-head ${phone ? 'home-head--phone' : ''}">
      ${topbar('', { cls: 'topbar--home' + (phone ? ' topbar--center' : '') })}
      <section class="home-head-body lib-head-body" aria-label="Suche und Filter">
        ${phone ? `<h1 class="sr-only">Entdecken</h1><div class="filter-bar filter-bar--phone"><div class="view-pick"><span class="inline-pick-text">Entdecken</span></div></div>` : pageTitle('Entdecken')}
        ${recipesSwitchHtml()}
        <div class="search-field lib-search" role="search">
          ${ICONS.search}
          <label for="libSearchInput" class="sr-only">Rezepte oder Zutaten suchen</label>
          <input class="search-input" id="libSearchInput" type="search" enterkeyhint="search" placeholder="Rezepte oder Zutaten suchen" value="${escapeAttr(q)}" autocomplete="off" spellcheck="false">
          <button type="button" class="lib-search-clear" data-action="lib-search-clear" aria-label="Suche löschen" ${q ? '' : 'hidden'}>${ICONS.x}</button>
        </div>
        <div id="libQuick">${libQuickHtml()}</div>
      </section>
    </div>
    <main class="has-tabbar home-main lib-main">
      <div id="libResults" class="lib-results">${libResultsHtml()}</div>
    </main>
    ${bottomNav()}
    ${libFilterSheet()}
  `;
}

/* ---------- Filterfenster (Entwurf, erst beim Anwenden suchen) ---------- */
function libNewFilterDraft() {
  const f = libDiscFilters();
  return { categories: new Set(f.categories), diet: new Set(f.diet), veg: f.veg, max: f.quick ? 30 : (f.maxMinutes || null) };
}
function libFilterDraft() {
  if (!state.modal || state.modal.type !== 'lib-filter') return null;
  if (!state.modal.draft) state.modal.draft = libNewFilterDraft();
  return state.modal.draft;
}
function libDraftCount(d) { return d.categories.size + d.diet.size + (d.veg ? 1 : 0) + (d.max ? 1 : 0); }
function libDraftStatus(d) { const n = libDraftCount(d); return n === 0 ? 'Keine Filter gewählt' : (n === 1 ? '1 Filter gewählt' : `${n} Filter gewählt`); }
function libFsOpt(type, dim, value, label, checked) {
  return `<label class="fs-opt"><input class="fs-input lib-fs-input" type="${type}" ${type === 'radio' ? 'name="lib-fs-time"' : ''} data-lib-dim="${dim}" value="${escapeAttr(value)}" ${checked ? 'checked' : ''}><span class="fs-mark" aria-hidden="true">${ICONS.check}</span><span class="fs-text">${escapeHtml(label)}</span></label>`;
}
function libFsGroup(key, title, inner) {
  return `<fieldset class="fs-group"><legend class="filter-group-title fs-legend" id="lib-fg-${key}">${escapeHtml(title)}</legend><div class="fs-opts">${inner}</div></fieldset>`;
}
function libFilterSheet() {
  const d = libFilterDraft();
  if (!d) return '';
  const diets = libPublicDiets();
  return `<div class="modal-backdrop" data-action="close-modal">
    <div class="modal-sheet filter-sheet lib-filter-sheet" role="dialog" aria-modal="true" aria-labelledby="lib-filter-title" tabindex="-1" onclick="event.stopPropagation()">
      <div class="sheet-handle" aria-hidden="true"></div>
      <div class="fs-head">
        <h2 class="fs-title" id="lib-filter-title">Rezepte filtern</h2>
        <button type="button" class="fs-close" data-action="close-modal" aria-label="Schliessen">${ICONS.x}</button>
      </div>
      <div class="fs-body">
        ${libFsGroup('meal', 'Gerichtart: Mahlzeit', MEAL_TYPE_OPTIONS.map(o => libFsOpt('checkbox', 'cat', o.id, o.label, d.categories.has(o.id))).join(''))}
        ${libFsGroup('dish', 'Gerichtart: Gericht', DISH_TYPE_OPTIONS.map(o => libFsOpt('checkbox', 'cat', o.id, o.label, d.categories.has(o.id))).join(''))}
        ${libFsGroup('time', 'Maximale Gesamtzeit', libFsOpt('radio', 'max', '', 'Beliebig', !d.max) + LIB_TIME_CHOICES.map(m => libFsOpt('radio', 'max', String(m), `Bis ${m} Min.`, d.max === m)).join(''))}
        ${libFsGroup('diet', 'Ernährungsweise', diets.map(o => o.id === 'vegetarisch'
          ? libFsOpt('checkbox', 'veg', 'veg', 'Vegetarisch (mit vegan)', d.veg)
          : libFsOpt('checkbox', 'diet', o.id, o.label, d.diet.has(o.id))).join(''))}
        <p class="lib-fs-hint">Rezepte ohne Zeitangabe erscheinen nur, wenn keine maximale Gesamtzeit gewählt ist.</p>
      </div>
      <div class="fs-foot">
        <p class="fs-status" role="status" aria-live="polite">${libDraftStatus(d)}</p>
        <div class="fs-actions">
          <button type="button" class="ghost-btn fs-reset" data-action="lib-filter-reset">Zurücksetzen</button>
          <button type="button" class="primary-btn fs-apply" data-action="lib-filter-apply">Rezepte anzeigen</button>
        </div>
      </div>
    </div>
  </div>`;
}
function libSyncFilterSheet() {
  const sheetEl = document.querySelector('.lib-filter-sheet'), d = libFilterDraft();
  if (!sheetEl || !d) return;
  sheetEl.querySelectorAll('.lib-fs-input').forEach(inp => {
    const dim = inp.dataset.libDim;
    if (dim === 'cat') inp.checked = d.categories.has(inp.value);
    else if (dim === 'diet') inp.checked = d.diet.has(inp.value);
    else if (dim === 'veg') inp.checked = !!d.veg;
    else if (dim === 'max') inp.checked = inp.value === '' ? !d.max : Number(inp.value) === d.max;
  });
  const st = sheetEl.querySelector('.fs-status'); if (st) st.textContent = libDraftStatus(d);
}
/* Entwurf → Filter des Servers. Die Zeit hat eine sichtbare Auswahl: 30 Min. entspricht dem Schnellfilter «Bis 30 Min.». */
function libDraftToFilters(d) {
  return { categories: Array.from(d.categories), diet: Array.from(d.diet), veg: !!d.veg, quick: d.max === 30, maxMinutes: d.max && d.max !== 30 ? d.max : null };
}

/* ---------- Öffentliche Detailansicht ---------- */
function libDetail() { return libState().detail || {}; }
function libDetailRecipe(pub) {
  if (!pub || !pub.recipe) return null;
  try { if (libHas('libNormalizePublic')) return libNormalizePublic(pub.recipe); } catch (e) { return null; }
  return pub.recipe;
}
function libPubUrl(id) {
  if (libHas('libShareLink')) { try { return libShareLink('recipe', id); } catch (e) { /* Rückfall */ } }
  return (typeof CLOUD_SITE_URL !== 'undefined' ? CLOUD_SITE_URL : location.origin + location.pathname) + '?rezept=' + encodeURIComponent(id);
}
function libIngredientsHtml(rec) {
  const groups = getIngredientGroups({ ingredients: rec.ingredients || [] });
  if (!groups.length) return `<p class="hint-line">Keine Zutaten angegeben.</p>`;
  const showTitles = groups.length > 1 || groups[0].title !== 'Zutaten';
  return groups.map(g => `<section class="ing-group">
    ${showTitles ? `<h3 class="ing-group-title">${escapeHtml(g.title)}</h3>` : ''}
    <ul class="ing-list lib-ing-list">${g.ingredients.map(i => `<li><span class="ing-amount">${escapeHtml(scaledAmountLine(i, 1))}</span><span class="ing-name">${escapeHtml(i.name)}</span></li>`).join('')}</ul>
  </section>`).join('');
}
function libStepsHtml(rec) {
  const entries = stepEntries({ steps: rec.steps || [] });
  if (!entries.length) return `<p class="hint-line">Keine Zubereitungsschritte angegeben.</p>`;
  let n = 0;
  return `<ol class="step-list-v2">${entries.map(e => e.heading
    ? `<li class="step-heading"><h3>${escapeHtml(String(e.text).trim().replace(/:$/, ''))}</h3></li>`
    : `<li><span class="step-no" aria-hidden="true">${++n}</span><p>${escapeHtml(e.text)}</p></li>`).join('')}</ol>`;
}
function libSourceHtml(src) {
  if (!src) return '';
  const url = String(src.url || '').trim(), text = String(src.text || '').trim();
  if (/^https:\/\/[^\s]+$/i.test(url)) {
    const label = text || (typeof domainFromUrl === 'function' ? domainFromUrl(url) : url);
    return `<p class="lib-meta-line">${ICONS.link}<span>Ursprüngliche Quelle: <a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a></span></p>`;
  }
  return text ? `<p class="lib-meta-line">${ICONS.link}<span>Ursprüngliche Quelle: ${escapeHtml(text)}</span></p>` : '';
}
function libDetailActionsHtml(id, saved) {
  const item = (then, icon, label) => `<button type="button" class="menu-item" data-action="lib-save-and" data-then="${then}" data-id="${escapeAttr(id)}">${icon}<span>${label}</span></button>`;
  return `<div class="lib-actions menu-list" role="group" aria-label="${saved ? 'Mit deiner Kopie' : 'Speichern und weiter'}">
    ${item('plan', ICONS.calendar, saved ? 'Zum Wochenplan hinzufügen' : 'Speichern und zum Wochenplan hinzufügen')}
    ${item('shop', ICONS.cart, saved ? 'Einkaufen' : 'Speichern und einkaufen')}
    ${item('cookbook', ICONS.bookOpen, saved ? 'Zum Kochbuch hinzufügen' : 'Speichern und zum Kochbuch hinzufügen')}
    ${item('cook', ICONS.play, saved ? 'Kochen starten' : 'Speichern und kochen')}
    <button type="button" class="menu-item" data-action="lib-share-link" data-id="${escapeAttr(id)}">${ICONS.share}<span>Link teilen</span></button>
  </div>`;
}
function libDetailNoticesHtml(id, pub, copies) {
  const out = [];
  const newest = copies[0];
  const origin = newest && newest.publicOrigin;
  if (origin && origin.imagePending) {
    out.push(`<div class="lib-notice" role="status"><p>Das Rezept wurde gespeichert. Das Bild konnte noch nicht übernommen werden.</p><button type="button" class="outline-btn outline-btn--small" data-action="lib-retry-image" data-id="${escapeAttr(newest.id)}">Bild erneut laden</button></div>`);
  }
  if (origin && Number(origin.savedVersion) > 0 && Number(pub.version) > Number(origin.savedVersion)) {
    out.push(`<div class="lib-notice"><p>Für dieses Rezept gibt es eine neue Version.</p><button type="button" class="outline-btn outline-btn--small" data-action="lib-compare" data-id="${escapeAttr(id)}" aria-haspopup="dialog">Vergleichen</button></div>`);
  }
  if (copies.length > 1) {
    out.push(`<div class="lib-notice"><p>Du hast ${copies.length} Kopien dieses Rezepts.</p><button type="button" class="outline-btn outline-btn--small" data-action="lib-open-copy" data-id="${escapeAttr(id)}">Neueste öffnen</button></div>`);
  }
  return out.join('');
}
function libDetailShell(inner, title) {
  return `${topbar(title || 'Rezept', { back: true, plainTitle: 'Rezept', cls: 'topbar--detail' })}
    <main class="has-tabbar lib-detail-main lib-detail-main--state">${inner}</main>
    ${bottomNav()}`;
}
function libDetailView() {
  const det = libDetail();
  const status = det.status || 'loading';
  libScheduleBind();
  if (status === 'loading') {
    return libDetailShell(`<div class="lib-detail-skel" aria-hidden="true"><span class="lib-skel-block"></span><span class="lib-skel-line lib-skel-line--title"></span><span class="lib-skel-line"></span><span class="lib-skel-line lib-skel-line--short"></span></div><p class="sr-only" role="status">Rezept wird geladen.</p>`);
  }
  if (status === 'offline') {
    return libDetailShell(libStateBlock(LIB_ICON_OFFLINE, 'Keine Internetverbindung', 'Zum Entdecken brauchst du eine Internetverbindung. Deine gespeicherten Rezepte sind weiterhin verfügbar.',
      `<button type="button" class="primary-btn" data-action="lib-retry">Erneut versuchen</button>${libCopies(det.id).length ? `<button type="button" class="ghost-btn" data-action="lib-open-copy" data-id="${escapeAttr(det.id)}">In meinen Rezepten öffnen</button>` : ''}`));
  }
  if (status === 'error') {
    return libDetailShell(libStateBlock(ICONS.info, 'Das Rezept konnte nicht geladen werden.', '', `<button type="button" class="primary-btn" data-action="lib-retry">Erneut versuchen</button>`, 'alert'));
  }
  const pub = det.pub;
  const rec = status === 'ready' ? libDetailRecipe(pub) : null;
  if (!rec) {
    return libDetailShell(libStateBlock(ICONS.bookOpen, 'Dieses Rezept ist nicht mehr öffentlich verfügbar.', libCopies(det.id).length ? 'Deine gespeicherte Kopie bleibt in Meine Rezepte erhalten.' : '',
      `<button type="button" class="primary-btn" data-action="lib-tab-discover">Weitere Rezepte entdecken</button>${libCopies(det.id).length ? `<button type="button" class="ghost-btn" data-action="lib-open-copy" data-id="${escapeAttr(det.id)}">In meinen Rezepten öffnen</button>` : ''}`));
  }
  const id = String(pub.id || det.id);
  const copies = libCopies(id);
  const saved = copies.length > 0;
  const title = String(rec.title || 'Ohne Titel');
  const primary = saved
    ? `<p class="lib-saved-note" role="note">${LIB_ICON_SAVED}<span>In Meine Rezepte gespeichert</span></p><button type="button" class="primary-btn primary-btn--block" data-action="lib-open-copy" data-id="${escapeAttr(id)}">In meinen Rezepten öffnen</button>`
    : `<button type="button" class="primary-btn primary-btn--block" data-action="lib-save" data-id="${escapeAttr(id)}">${LIB_ICON_SAVE} In meine Rezepte speichern</button>`;
  return `
    ${topbar(title, { back: true, plainTitle: 'Rezept', cls: 'topbar--detail', actions: `<button type="button" class="icon-btn" data-action="lib-share-link" data-id="${escapeAttr(id)}" aria-label="Link teilen">${ICONS.share}</button><button type="button" class="icon-btn" data-action="lib-detail-menu" data-id="${escapeAttr(id)}" aria-label="Weitere Aktionen" aria-haspopup="dialog">${ICONS.more}</button>` })}
    <main class="has-tabbar detail-main lib-detail-main">
      ${libPublicRecipeHtml(pub, { actionsHtml: primary + libDetailNoticesHtml(id, pub, copies) + libDetailActionsHtml(id, saved) })}
    </main>
    ${bottomNav()}
    ${libDetailModals(id, pub, rec, title)}
  `;
}
/* Öffentliche Rezeptdarstellung ohne eigene Aktionen. Auch für die Vorschau beim Veröffentlichen (library-publish.js).
   pubLike: { id?, recipe, author?: { public_id, display_name }, image_path?, thumb_path? }
   opts: { actionsHtml: HTML unter dem Kopf (nur Detailansicht), localImageSrc: Bildquelle ohne Speicherpfad (Vorschau),
           titleTag: 'h1' (Standard) oder 'h2', linkAuthor: true (Standard; false in der Vorschau) } */
function libPublicRecipeHtml(pubLike, opts) {
  opts = opts || {};
  const rec = libDetailRecipe(pubLike);
  if (!rec) return '';
  const tag = opts.titleTag === 'h2' ? 'h2' : 'h1';
  const sub = tag === 'h1' ? 'h2' : 'h3';
  const subsub = tag === 'h1' ? 'h3' : 'h4';
  const title = String(rec.title || 'Ohne Titel');
  const author = pubLike.author || {};
  const authorName = String(author.display_name || '');
  const heroPath = pubLike.image_path || pubLike.thumb_path;
  let hero = '';
  if (heroPath) hero = `<div class="hero lib-hero">${libMediaHtml(heroPath, 'lib-hero-media', 1600, 1067, title)}</div>`;
  else if (opts.localImageSrc) hero = `<div class="hero lib-hero"><span class="lib-hero-media"><span class="lib-ph">${ICONS.bookOpen}</span><img class="is-loaded" src="${escapeAttr(opts.localImageSrc)}" alt="${escapeAttr(title)}" width="1600" height="1067"></span></div>`;
  const yieldRec = { servings: rec.servings, servingMode: rec.servingMode, yieldLabel: rec.yieldLabel };
  const facts = [rec.timeMinutes > 0 ? `${rec.timeMinutes} Min.` : '', yieldKnown(yieldRec) ? `Ergibt ${servingLabel(yieldRec, rec.servings)}` : 'Ergibt: offen', rec.difficulty || ''].filter(Boolean);
  const extraTimes = [rec.prepMinutes ? `Vorbereitungszeit ${rec.prepMinutes} Min.` : '', rec.restMinutes ? `Ruhen ${rec.restMinutes} Min.` : '', rec.cookMinutes ? `Garen/Backen ${rec.cookMinutes} Min.` : ''].filter(Boolean);
  const chips = (rec.diet || []).filter(x => !(x === 'vegetarisch' && (rec.diet || []).includes('vegan'))).map(x => LIB_DIET_LABELS[x] || x).concat((rec.categories || []).map(libCategoryLabel)).slice(0, 4);
  const tips = String(rec.tips || '').trim();
  const linkAuthor = opts.linkAuthor !== false && author.public_id;
  const uid = 'lpr' + Math.random().toString(36).slice(2, 7);
  const ingH = libIngredientsHtml(rec).replace(/<h3 class="ing-group-title">/g, `<${subsub} class="ing-group-title">`).replace(/<\/h3>/g, `</${subsub}>`);
  const stepsH = libStepsHtml(rec).replace(/<h3>/g, `<${subsub}>`).replace(/<\/h3>/g, `</${subsub}>`);
  return `<div class="lib-recipe ${hero ? 'has-hero' : 'no-hero'}">
      ${hero}
      <div class="lib-detail-cols">
        <div class="lib-detail-info">
          <div class="detail-head">
            <${tag} class="detail-title-v2 ${title.length > 34 ? 'is-long' : ''} ${title.length > 70 ? 'is-xlong' : ''}">${escapeHtml(title)}</${tag}>
            <p class="detail-meta-v2">${facts.map(f => `<span class="fact">${escapeHtml(f)}</span>`).join('')}</p>
            ${extraTimes.length ? `<p class="detail-times">${extraTimes.map(escapeHtml).join(' · ')}</p>` : ''}
          </div>
          <div class="lib-byline">
            ${authorName ? `<p class="lib-meta-line">${LIB_ICON_USER}<span>Von ${linkAuthor ? `<button type="button" class="lib-author-link" data-action="lib-open-profile" data-id="${escapeAttr(author.public_id)}">${escapeHtml(authorName)}</button>` : escapeHtml(authorName)}</span></p>` : ''}
            ${libSourceHtml(rec.source)}
            ${chips.length ? `<p class="lib-tags">${chips.map(c => `<span class="source-chip">${escapeHtml(c)}</span>`).join('')}</p>` : ''}
          </div>
          ${opts.actionsHtml || ''}
          <section class="lib-section lib-section--ing" aria-labelledby="${uid}-ing">
            <${sub} class="lib-section-title" id="${uid}-ing">Zutaten</${sub}>
            ${!yieldKnown(yieldRec) ? `<p class="hint-line">Ergibt: nicht angegeben, es gelten die Originalmengen.</p>` : ''}
            ${ingH}
          </section>
        </div>
        <div class="lib-detail-content">
          <section class="lib-section" aria-labelledby="${uid}-steps">
            <${sub} class="lib-section-title" id="${uid}-steps">Zubereitung</${sub}>
            ${stepsH}
          </section>
          ${tips ? `<section class="lib-section" aria-labelledby="${uid}-tips"><div class="note-card lib-tips"><${sub} class="note-card-title" id="${uid}-tips">Tipps von ${escapeHtml(authorName || 'der Person, die es veröffentlicht hat')}</${sub}><p>${escapeHtml(tips)}</p></div></section>` : ''}
        </div>
      </div>
    </div>`;
}
function libDetailModals(id, pub, rec, title) {
  const m = state.modal;
  if (!m) return '';
  if (m.type === 'lib-detail-menu') {
    const author = pub.author || {};
    return sheet('lib-menu-title', title, `<div class="menu-list">
      ${author.public_id ? `<button type="button" class="menu-item" data-action="lib-open-profile" data-id="${escapeAttr(author.public_id)}">${LIB_ICON_USER}<span>Profil ansehen</span></button>` : ''}
      <button type="button" class="menu-item" data-action="lib-share-link" data-id="${escapeAttr(id)}">${ICONS.share}<span>Link teilen</span></button>
      <button type="button" class="menu-item" data-action="lib-report-open" data-id="${escapeAttr(id)}">${LIB_ICON_FLAG}<span>Rezept melden</span></button>
    </div>`);
  }
  if (m.type === 'lib-report') return libReportSheet();
  if (m.type === 'lib-compare') return libCompareSheet(id, pub, rec);
  /* Nach «Speichern und …»: bestehende Fenster der lokalen Kopie (gleiche Funktionen wie in der Rezeptdetailansicht) */
  if (m.type === 'plan-recipe' && typeof planRecipeModal === 'function') return planRecipeModal();
  if (m.type === 'shop-select' && typeof shopSelectModal === 'function') return shopSelectModal();
  return '';
}

/* ---------- Gegenüberstellung neue Version ---------- */
function libIngNames(list) {
  const real = typeof isIngredientHeaderRow === 'function' ? (list || []).filter(i => i && !isIngredientHeaderRow(i)) : (list || []).filter(i => i && !i.isGroupHeader);
  return real.filter(i => String(i.name || '').trim()).map(i => String(i.name).trim());
}
function libCompareSheet(id, pub, rec) {
  const copy = libCopies(id)[0];
  if (!copy) return '';
  const norm = s => s.toLocaleLowerCase('de-CH').replace(/\s+/g, ' ');
  const oldNames = libIngNames(copy.ingredients), newNames = libIngNames(rec.ingredients);
  const oldSet = new Set(oldNames.map(norm)), newSet = new Set(newNames.map(norm));
  const added = newNames.filter(n => !oldSet.has(norm(n)));
  const removed = oldNames.filter(n => !newSet.has(norm(n)));
  const yOld = yieldKnown(copy) ? servingLabel(copy, copy.servings) : 'offen';
  const yNewRec = { servings: rec.servings, servingMode: rec.servingMode, yieldLabel: rec.yieldLabel };
  const yNew = yieldKnown(yNewRec) ? servingLabel(yNewRec, rec.servings) : 'offen';
  const tOld = copy.timeMinutes > 0 ? `${copy.timeMinutes} Min.` : 'unbekannt';
  const tNew = rec.timeMinutes > 0 ? `${rec.timeMinutes} Min.` : 'unbekannt';
  const sOld = (copy.steps || []).filter(s => s && String(s.text || '').trim()).length;
  const sNew = (rec.steps || []).filter(s => s && String(s.text || '').trim()).length;
  const row = (label, a, b) => `<div class="lib-cmp-row ${a === b ? '' : 'is-changed'}"><dt>${label}</dt><dd><span class="lib-cmp-old"><span class="sr-only">Deine Kopie: </span>${escapeHtml(a)}</span><span class="lib-cmp-arrow" aria-hidden="true">→</span><span class="lib-cmp-new"><span class="sr-only">Neue Version: </span>${escapeHtml(b)}</span>${a === b ? '<span class="lib-cmp-same">unverändert</span>' : ''}</dd></div>`;
  const list = (items) => items.length ? `<ul class="lib-cmp-list">${items.slice(0, 12).map(n => `<li>${escapeHtml(n)}</li>`).join('')}${items.length > 12 ? `<li>und ${items.length - 12} weitere</li>` : ''}</ul>` : '<p class="lib-cmp-none">keine</p>';
  return sheet('lib-cmp-title', 'Neue Version vergleichen', `
    <p class="hint-line">Links steht deine Kopie, rechts die neue öffentliche Version.</p>
    <dl class="lib-cmp">
      ${row('Titel', String(copy.title || ''), String(rec.title || ''))}
      ${row('Ergibt', yOld, yNew)}
      ${row('Gesamtzeit', tOld, tNew)}
      ${row('Schritte', String(sOld), String(sNew))}
    </dl>
    <div class="lib-cmp-ings">
      <h3>Zutaten hinzugefügt</h3>${list(added)}
      <h3>Zutaten entfernt</h3>${list(removed)}
    </div>
    <p class="hint-line">Beim Aktualisieren bleiben deine Notizen, Favoriten, Sammlungen und dein Kochverlauf erhalten. Eigene Änderungen an Zutaten und Schritten werden ersetzt.</p>
    <div class="lib-cmp-actions">
      <button type="button" class="primary-btn" data-action="lib-update-copy" data-id="${escapeAttr(id)}">Meine Kopie aktualisieren</button>
      <button type="button" class="ghost-btn" data-action="lib-extra-copy" data-id="${escapeAttr(id)}">Als zusätzliche Kopie speichern</button>
      <button type="button" class="text-btn" data-action="close-modal">Abbrechen</button>
    </div>`);
}

/* ---------- Meldefenster ---------- */
function libReportSheet() {
  const m = state.modal || {};
  const id = m.publicationId || libDetail().id;
  if (m.sent) {
    return sheet('lib-report-title', 'Rezept melden', `<div class="lib-report-done" role="status"><span class="lib-state-icon" aria-hidden="true">${LIB_ICON_SAVED}</span><p>Danke. Wir sehen uns die Meldung an.</p></div>
      <div class="form-actions"><button type="button" class="primary-btn" data-action="close-modal">Schliessen</button></div>`);
  }
  const canReport = libHas('libCanReport') ? !!libCanReport() : (typeof cloudSignedIn === 'function' && cloudSignedIn());
  if (!canReport) {
    const email = (typeof LEGAL !== 'undefined' && LEGAL.email) ? String(LEGAL.email) : '';
    const url = libPubUrl(id);
    const mail = email && email.charAt(0) !== '[' ? `mailto:${email}?subject=${encodeURIComponent('Rezept melden: ' + url)}` : '';
    return sheet('lib-report-title', 'Rezept melden', `
      <p class="lib-report-text">Zum Melden in der App brauchst du ein Savora-Konto. Du kannst uns das Rezept auch per E-Mail melden.</p>
      <p class="hint-line">Die Person, die das Rezept veröffentlicht hat, erfährt nicht, wer es gemeldet hat.</p>
      <div class="lib-report-actions">
        ${mail ? `<a class="primary-btn lib-btn-link" href="${escapeAttr(mail)}">E-Mail schreiben</a>` : ''}
        <button type="button" class="ghost-btn" data-action="goto-view" data-view="settings-account">Anmelden</button>
        <button type="button" class="text-btn" data-action="close-modal">Abbrechen</button>
      </div>`);
  }
  const reason = m.reason || '';
  const comment = m.comment || '';
  return sheet('lib-report-title', 'Rezept melden', `
    <fieldset class="lib-report-reasons" aria-describedby="${m.error ? 'lib-report-err' : ''}">
      <legend class="lib-report-legend">Was stimmt mit diesem Rezept nicht?</legend>
      ${LIB_REPORT_REASONS.map(r => `<label class="lib-radio"><input type="radio" name="lib-report-reason" value="${r.id}" ${reason === r.id ? 'checked' : ''}><span>${r.label}</span></label>`).join('')}
      ${m.error ? `<p class="field-error" id="lib-report-err" role="alert">${escapeHtml(m.error)}</p>` : ''}
    </fieldset>
    <div class="field lib-report-field">
      <label for="libReportComment">Kommentar (freiwillig)</label>
      <textarea id="libReportComment" rows="3" maxlength="500" aria-describedby="libReportCount">${escapeHtml(comment)}</textarea>
      <p class="lib-count" id="libReportCount" aria-live="polite">${comment.length} von 500 Zeichen</p>
    </div>
    <p class="hint-line">Die Person, die das Rezept veröffentlicht hat, erfährt nicht, wer es gemeldet hat.</p>
    <div class="form-actions"><button type="button" class="ghost-btn" data-action="close-modal">Abbrechen</button><button type="button" class="primary-btn" data-action="lib-report-send" data-id="${escapeAttr(id)}">Meldung senden</button></div>`);
}

/* ---------- Öffentliches Profil ---------- */
function libProf() { return libState().profile || {}; }
function libProfData() {
  const p = libProf();
  const data = p.data && typeof p.data === 'object' ? p.data : null;
  return {
    profile: data && data.profile ? data.profile : data,   // library.js: data = Profil { public_id, display_name, bio, avatar_path }
    items: Array.isArray(p.items) ? p.items : [],
    next: p.cursor || null,
    more: p.moreStatus || 'idle',
  };
}
function libProfileView() {
  const p = libProf();
  const status = p.status || 'loading';
  libScheduleBind();
  const shell = (inner) => `${topbar('Profil', { back: true, plainTitle: 'Profil', cls: 'topbar--detail' })}<main class="has-tabbar lib-profile-main">${inner}</main>${bottomNav()}`;
  if (status === 'loading') return shell(`<div class="lib-profile-head" aria-hidden="true"><span class="lib-avatar lib-skel-block"></span><span class="lib-skel-line lib-skel-line--title"></span></div><ul class="lib-grid" aria-hidden="true">${libSkeletonCards(4)}</ul><p class="sr-only" role="status">Profil wird geladen.</p>`);
  if (status === 'offline') return shell(libStateBlock(LIB_ICON_OFFLINE, 'Keine Internetverbindung', 'Zum Entdecken brauchst du eine Internetverbindung. Deine gespeicherten Rezepte sind weiterhin verfügbar.', `<button type="button" class="primary-btn" data-action="lib-retry">Erneut versuchen</button>`));
  if (status === 'error') return shell(libStateBlock(ICONS.info, 'Das Profil konnte nicht geladen werden.', '', `<button type="button" class="primary-btn" data-action="lib-retry">Erneut versuchen</button>`, 'alert'));
  const d = libProfData();
  if (status === 'missing' || !d.profile) return shell(libStateBlock(LIB_ICON_USER, 'Dieses Profil ist nicht öffentlich verfügbar.', '', `<button type="button" class="primary-btn" data-action="lib-tab-discover">Weitere Rezepte entdecken</button>`));
  const pr = d.profile;
  const name = String(pr.display_name || 'Ohne Namen');
  const avatar = libImg(pr.avatar_path);
  const initial = name.trim().charAt(0).toLocaleUpperCase('de-CH');
  const moreHtml = d.more === 'error'
    ? `<div class="lib-more lib-more--error" role="alert"><p>Weitere Rezepte konnten nicht geladen werden.</p><button type="button" class="ghost-btn" data-action="lib-load-more" data-scope="profile">Erneut versuchen</button></div>`
    : (d.next && libHas('libLoadProfileMore')) ? `<div class="lib-more"><button type="button" class="ghost-btn lib-more-btn" data-action="lib-load-more" data-scope="profile" ${d.more === 'loading' ? 'aria-busy="true" aria-disabled="true"' : ''}>${d.more === 'loading' ? 'Lädt …' : 'Mehr laden'}</button></div>` : '';
  return shell(`
    <header class="lib-profile-head">
      <span class="lib-avatar" aria-hidden="true">${avatar ? `<img src="${escapeAttr(avatar)}" alt="" width="160" height="160" onerror="this.remove()">` : ''}<span class="lib-avatar-initial">${escapeHtml(initial)}</span></span>
      <div class="lib-profile-text">
        <h1 class="lib-profile-name">${escapeHtml(name)}</h1>
        ${pr.bio ? `<p class="lib-profile-bio">${escapeHtml(pr.bio)}</p>` : ''}
      </div>
    </header>
    <section aria-labelledby="lib-prof-h">
      <h2 class="lib-result-line" id="lib-prof-h">Veröffentlichte Rezepte</h2>
      ${d.items.length ? `<ul class="lib-grid">${d.items.map(libCardHtml).join('')}</ul>${moreHtml}` : `<p class="hint-line">Noch keine veröffentlichten Rezepte.</p>`}
    </section>`);
}

/* ---------- Aktualisieren nach Datenwechsel (von library.js aufgerufen) ---------- */
function libPatchResults() {
  const area = document.getElementById('libResults');
  if (!area) return false;
  area.innerHTML = libResultsHtml();
  area.querySelectorAll('[data-action]').forEach(el => el.addEventListener('click', onAction));
  libBindSort();
  return true;
}
const LIB_REFRESH_VIEWS = { discover: ['discover'], detail: ['lib-detail'], profile: ['lib-profile'], mine: ['lib-mine', 'more'], pubprofile: ['lib-pubprofile', 'more', 'lib-publish'], mod: ['lib-mod', 'more'], publish: ['lib-publish'] };
function libViewsRefresh(kind) {
  const views = LIB_REFRESH_VIEWS[kind] || [];
  if (!views.includes(state.view)) return;
  const a = document.activeElement;
  if (kind === 'discover') {
    /* Während der Eingabe im Suchfeld nur den Ergebnisbereich neu setzen: Fokus und Cursor bleiben */
    if (!state.modal && a && a.id === 'libSearchInput' && libPatchResults()) { libAnnounceResults(); return; }
    render();
    libAnnounceResults();
    return;
  }
  if (kind === 'detail' || kind === 'profile') { render(); return; }
  /* Verwaltungsansichten (library-publish.js): wie bisher nicht neu aufbauen, solange ein Fenster offen ist oder getippt wird */
  if (state.modal || (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
  render();
}
let libLastAnnounce = '';
function libAnnounceResults() {
  const d = libDisc();
  let msg = '';
  if (d.status === 'ready') msg = libDiscItems().length ? libRecipeCountText(Number(d.total) || libDiscItems().length, libDiscCapped()) + ' gefunden' : 'Keine passenden Rezepte gefunden.';
  else if (d.status === 'error') msg = 'Die Rezepte konnten nicht geladen werden.';
  else if (d.status === 'offline') msg = 'Keine Internetverbindung.';
  const key = msg + '|' + libDiscQuery() + '|' + libDiscItems().length;
  if (msg && key !== libLastAnnounce && typeof announceLive === 'function') { libLastAnnounce = key; announceLive(msg); }
}

/* ---------- Ereignisse nach dem Neuaufbau ----------
   render() setzt #app synchron und ruft danach bindEvents(); die Mikroaufgabe läuft direkt danach. */
let libBindQueued = false;
function libScheduleBind() {
  if (libBindQueued) return;
  libBindQueued = true;
  queueMicrotask(() => { libBindQueued = false; libBindViews(); });
}
function libBindSort() {
  const sel = document.getElementById('libSortSelect');
  if (!sel || sel.dataset.libBound) return;
  sel.dataset.libBound = '1';
  sel.addEventListener('change', () => { if (libHas('libSetSort')) libSetSort(sel.value === 'quickest' ? 'quickest' : 'newest'); });
}
function libBindViews() {
  const input = document.getElementById('libSearchInput');
  if (input && !input.dataset.libBound) {
    input.dataset.libBound = '1';
    const push = () => {
      const y = window.scrollY;
      requestAnimationFrame(() => { if (window.scrollY !== y) window.scrollTo(0, y); });
      const clr = document.querySelector('.lib-search-clear'); if (clr) clr.hidden = !input.value;
      if (libHas('libSetQuery')) libSetQuery(input.value);
    };
    input.addEventListener('input', (e) => { if (e.isComposing) return; push(); });
    input.addEventListener('compositionend', push);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); if (typeof isPhoneLayout === 'function' && isPhoneLayout()) input.blur(); }
    });
  }
  libBindSort();
  const fs = document.querySelector('.lib-filter-sheet');
  if (fs && !fs.dataset.libBound) {
    fs.dataset.libBound = '1';
    fs.addEventListener('change', (e) => {
      const inp = e.target.closest && e.target.closest('.lib-fs-input');
      const d = libFilterDraft();
      if (!inp || !d) return;
      const dim = inp.dataset.libDim;
      if (dim === 'cat') { if (inp.checked) d.categories.add(inp.value); else d.categories.delete(inp.value); }
      else if (dim === 'diet') { if (inp.checked) d.diet.add(inp.value); else d.diet.delete(inp.value); }
      else if (dim === 'veg') d.veg = inp.checked;
      else if (dim === 'max') d.max = inp.value ? Number(inp.value) : null;
      libSyncFilterSheet();
    });
  }
  const rs = document.querySelector('.lib-report-reasons');
  if (rs && !rs.dataset.libBound) {
    rs.dataset.libBound = '1';
    rs.addEventListener('change', (e) => { if (e.target.name === 'lib-report-reason' && state.modal) { state.modal.reason = e.target.value; state.modal.error = ''; const er = document.getElementById('lib-report-err'); if (er) er.remove(); } });
  }
  const ta = document.getElementById('libReportComment');
  if (ta && !ta.dataset.libBound) {
    ta.dataset.libBound = '1';
    ta.addEventListener('input', () => {
      if (state.modal) state.modal.comment = ta.value;
      const c = document.getElementById('libReportCount'); if (c) c.textContent = `${ta.value.length} von 500 Zeichen`;
    });
  }
}

/* ---------- Aktionen ---------- */
const libBusy = new Set();
async function libGuard(key, el, fn) {
  if (libBusy.has(key)) return;
  libBusy.add(key);
  if (el) el.setAttribute('aria-busy', 'true');
  try { await fn(); }
  finally { libBusy.delete(key); if (el && el.isConnected) el.removeAttribute('aria-busy'); }
}
function libFocusSel(sel) {
  const el = sel && document.querySelector(sel);
  if (el && typeof focusWithoutScroll === 'function') focusWithoutScroll(el);
}
function libImageFailedToast(recipeId) {
  showToast('Das Rezept wurde gespeichert. Das Bild konnte noch nicht übernommen werden.', 'info', false, {
    actionLabel: 'Bild erneut laden', duration: 9000,
    onAction: () => libRetryImageNow(recipeId),
  });
}
async function libRetryImageNow(recipeId) {
  try {
    const ok = libHas('libRetryImage') ? await libRetryImage(recipeId) : false;
    if (ok) showToast('Bild übernommen.');
    else showToast('Das Bild konnte noch nicht übernommen werden. Versuche es später erneut.', 'error');
  } catch (err) { showToast(libErrorText(err, 'Das Bild konnte noch nicht übernommen werden. Versuche es später erneut.'), 'error'); }
  if (state.view === 'lib-detail' || state.view === 'discover' || state.view === 'lib-profile') render();
}
/* Speichert (oder findet) die persönliche Kopie. Gibt das Ergebnis zurück oder null bei Fehler (Meldung bereits gezeigt). */
async function libEnsure(id) {
  if (!libHas('ensurePersonalRecipe')) { showToast('Speichern ist gerade nicht möglich.', 'error'); return null; }
  try {
    const r = await ensurePersonalRecipe(id);
    if (!r || !r.recipeId) throw new Error('kein Ergebnis');
    if (r.imageFailed) libImageFailedToast(r.recipeId);
    else if (r.created) showToast('In Meine Rezepte gespeichert.');
    return r;
  } catch (err) {
    showToast(libErrorText(err, 'Das Rezept konnte nicht gespeichert werden. Versuche es erneut.'), 'error', true);
    return null;
  }
}
/* Führt eine bestehende lokale Aktion mit der lokalen Rezept-ID aus (gleiche Handler wie in der Rezeptdetailansicht). */
async function libRunLocal(action, recipeId, el) {
  if (typeof dispatchAction !== 'function') return;
  if (action === 'add-to-cookbook') {
    /* Der bestehende Handler schliesst danach ein Fenster (history.back). Ohne offenes Fenster würde das die Seite
       verlassen; deshalb vorher einen Fenster-Eintrag setzen, den der Handler wieder abräumt. */
    state.modal = { type: 'lib-pending' };
    history.pushState(typeof navHistorySnapshot === 'function' ? navHistorySnapshot() : {}, '');
  }
  await dispatchAction(action, recipeId, el, null);
}
const LIB_THEN_ACTIONS = { plan: 'open-plan-recipe', shop: 'add-to-shopping', cookbook: 'add-to-cookbook', cook: 'start-cook' };

async function handleLibraryViewAction(action, id, el) {
  if (!action || action.indexOf('lib-') !== 0) return false;
  switch (action) {
    case 'lib-tab-mine':
      state.recipesTab = 'mine';
      state.modal = null;
      state.view = 'home';
      render();
      return true;
    case 'lib-tab-discover': {
      state.recipesTab = 'discover';
      state.modal = null;
      state.view = 'discover';
      if (libHas('libEnterDiscover')) libEnterDiscover();
      else if (libHas('libSearch') && (!libDisc().status || libDisc().status === 'idle')) libSearch({ force: true });
      render();
      return true;
    }
    case 'lib-search-clear': {
      const input = document.getElementById('libSearchInput');
      if (input) input.value = '';
      if (el) el.hidden = true;
      if (libHas('libSetQuery')) libSetQuery('');
      if (input) focusWithoutScroll(input);
      return true;
    }
    case 'lib-filter-quick': {
      const f = libDiscFilters();
      if (libHas('libSetFilter')) libSetFilter(f.quick ? { quick: false } : { quick: true, maxMinutes: null });
      return true;
    }
    case 'lib-filter-veg': {
      const f = libDiscFilters();
      if (libHas('libSetFilter')) libSetFilter({ veg: !f.veg });
      return true;
    }
    case 'lib-filter-open':
      openModal({ type: 'lib-filter', draft: libNewFilterDraft() }, '[data-action="lib-filter-open"]');
      return true;
    case 'lib-filter-reset': {
      const d = libFilterDraft();
      if (d) { d.categories.clear(); d.diet.clear(); d.veg = false; d.max = null; libSyncFilterSheet(); }
      return true;
    }
    case 'lib-filter-apply': {
      const d = libFilterDraft();
      if (d) { if (libHas('libSetFilters')) libSetFilters(libDraftToFilters(d)); else if (libHas('libSetFilter')) libSetFilter(libDraftToFilters(d)); }
      closeModal();
      return true;
    }
    case 'lib-filter-clear-all':
      if (libHas('libResetFilters')) libResetFilters();
      else if (libHas('libSetFilter')) libSetFilter({ quick: false, veg: false, maxMinutes: null, diet: [], categories: [] });
      libFocusSel('#libSearchInput');
      return true;
    case 'lib-chip-remove': {
      const key = String(id || '');
      if (libHas('libRemoveFilter')) libRemoveFilter(key);
      else if (libHas('libSetFilter')) {
        const f = libDiscFilters();
        if (key === 'max') libSetFilter({ maxMinutes: null });
        else if (key.indexOf('cat:') === 0) libSetFilter({ categories: f.categories.filter(c => c !== key.slice(4)) });
        else if (key.indexOf('diet:') === 0) libSetFilter({ diet: f.diet.filter(c => c !== key.slice(5)) });
      }
      /* Fokus nicht verlieren: zum nächsten Chip, sonst zum Filterknopf */
      libFocusSel(document.querySelector('.lib-chip') ? '.lib-chip' : '[data-action="lib-filter-open"]');
      return true;
    }
    case 'lib-load-more':
      await libGuard('more', el, async () => {
        const profile = el && el.dataset.scope === 'profile';
        const before = profile ? libProfData().items.length : libDiscItems().length;
        try {
          if (profile) { if (libHas('libLoadProfileMore')) await libLoadProfileMore(); }
          else if (libHas('libLoadMore')) await libLoadMore();
        } catch (err) { /* Zustand zeigt den Fehler, sichtbare Ergebnisse bleiben */ }
        const cards = document.querySelectorAll('.lib-grid .lcard-main');
        if (cards.length > before) { focusWithoutScroll(cards[before]); announceLive(`${cards.length - before} weitere Rezepte geladen`); }
      });
      return true;
    case 'lib-retry':
      if (state.view === 'lib-detail' && libHas('libOpenDetail')) libOpenDetail(libDetail().id);
      else if (state.view === 'lib-profile' && libHas('libOpenProfile')) libOpenProfile(libProf().publicId);
      else if (libHas('libSearch')) libSearch({ force: true });
      return true;
    case 'lib-open':
      if (libHas('libOpenDetail')) libOpenDetail(id);
      return true;
    case 'lib-open-profile':
      state.modal = null;
      if (libHas('libOpenProfile')) libOpenProfile(id);
      return true;
    case 'lib-detail-menu':
      openModal({ type: 'lib-detail-menu', publicationId: id }, '[data-action="lib-detail-menu"]');
      return true;
    case 'lib-save':
      await libGuard('save:' + id, el, async () => {
        const inCard = !!(el && el.closest('.lcard'));
        const r = await libEnsure(id);
        if (!r) return;
        if (state.modal) state.modal = null;
        render();
        libFocusSel(inCard ? `[data-lib-card="${cssAttr(id)}"] .lcard-save` : '.lib-detail-main [data-action="lib-open-copy"]');
      });
      return true;
    case 'lib-save-and': {
      const then = el && el.dataset.then;
      const local = LIB_THEN_ACTIONS[then];
      if (!local) return true;
      await libGuard('save:' + id, el, async () => {
        const r = await libEnsure(id);
        if (!r) return;
        state.activeRecipeId = r.recipeId;
        await libRunLocal(local, r.recipeId, el);
      });
      return true;
    }
    case 'lib-open-copy': {
      const copy = libCopies(id)[0];
      if (!copy) { showToast('Die Kopie wurde nicht gefunden.', 'error'); return true; }
      state.modal = null;
      state.activeRecipeId = copy.id;
      state.detailTab = 'ingredients';
      state.view = 'detail';
      render();
      return true;
    }
    case 'lib-share-link': {
      const pub = libDetail().pub;
      const title = pub && pub.recipe ? String(pub.recipe.title || '') : '';
      const url = libPubUrl(id);
      if (state.modal && state.modal.type === 'lib-detail-menu') closeModal();
      try {
        if (libHas('libShareNative')) await libShareNative(url, title);
        else if (navigator.clipboard) { await navigator.clipboard.writeText(url); showToast('Link kopiert.'); }
      } catch (err) {
        if (!err || err.name !== 'AbortError') showToast('Der Link konnte nicht geteilt werden.', 'error');
      }
      return true;
    }
    case 'lib-report-open':
      state.modal = { type: 'lib-report', publicationId: id, reason: '', comment: '' };
      render();
      return true;
    case 'lib-report-send': {
      const m = state.modal;
      if (!m || m.type !== 'lib-report') return true;
      const checked = document.querySelector('input[name="lib-report-reason"]:checked');
      const ta = document.getElementById('libReportComment');
      m.reason = checked ? checked.value : '';
      m.comment = ta ? ta.value.slice(0, 500) : '';
      if (!m.reason) {
        m.error = 'Wähle einen Grund aus.';
        render();
        libFocusSel('input[name="lib-report-reason"]');
        return true;
      }
      await libGuard('report', el, async () => {
        try {
          if (libHas('libReport')) await libReport(m.publicationId || id, m.reason, m.comment.trim());
          else await libApi('savora_lib_report', { p_id: m.publicationId || id, p_reason: m.reason, p_comment: m.comment.trim() });
          if (state.modal === m) { m.sent = true; m.error = ''; render(); libFocusSel('.lib-report-done ~ .form-actions .primary-btn'); }
        } catch (err) {
          m.error = libErrorText(err, 'Die Meldung konnte nicht gesendet werden. Versuche es erneut.');
          if (state.modal === m) { render(); libFocusSel('#lib-report-err'); }
        }
      });
      return true;
    }
    case 'lib-compare':
      openModal({ type: 'lib-compare', publicationId: id }, '[data-action="lib-compare"]');
      return true;
    case 'lib-update-copy': {
      const pub = libDetail().pub, copy = libCopies(id)[0];
      if (!pub || !copy) { closeModal(); return true; }
      await libGuard('update:' + id, el, async () => {
        try {
          const r = libHas('libUpdateCopy') ? await libUpdateCopy(copy.id, pub) : null;
          closeModal();
          if (r && r.imageFailed) showToast('Deine Kopie ist aktualisiert. Das neue Bild konnte noch nicht übernommen werden.', 'info');
          else showToast('Deine Kopie ist aktualisiert.');
        } catch (err) { showToast(libErrorText(err, 'Die Kopie konnte nicht aktualisiert werden. Deine Kopie bleibt unverändert.'), 'error', true); }
      });
      return true;
    }
    case 'lib-extra-copy':
      await libGuard('extra:' + id, el, async () => {
        try {
          const r = libHas('libSaveExtraCopy') ? await libSaveExtraCopy(id) : null;
          closeModal();
          if (r && r.imageFailed) libImageFailedToast(r.recipeId);
          else showToast('Als zusätzliche Kopie gespeichert.');
        } catch (err) { showToast(libErrorText(err, 'Die Kopie konnte nicht gespeichert werden. Versuche es erneut.'), 'error', true); }
      });
      return true;
    case 'lib-retry-image':
      await libGuard('img:' + id, el, () => libRetryImageNow(id));
      return true;
    default:
      return false;
  }
}
