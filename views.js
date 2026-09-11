/* ---------- Views ---------- */
function viewFor(view) {
  switch (view) {
    case 'home': return homeView();
    case 'detail': return detailView();
    case 'form': return formView();
    case 'cookmode': return cookModeView();
    case 'settings': return settingsView();
    case 'shopping': return shoppingView();
    case 'mealplan': return mealplanView();
    case 'unitconverter': return unitConverterView();
    default: return homeView();
  }
}

const TAB_VIEWS = ['home', 'mealplan', 'shopping', 'settings'];

function bottomNav() {
  const tabs = [
    { view: 'home', icon: ICONS.book, label: 'Rezepte' },
    { view: 'mealplan', icon: ICONS.calendar, label: 'Wochenplan' },
    { view: 'shopping', icon: ICONS.cart, label: 'Einkauf' },
    { view: 'settings', icon: ICONS.settings, label: 'Mehr' },
  ];
  return `<nav class="bottom-nav" aria-label="Hauptnavigation">
    ${tabs.map(t => { const active = state.view === t.view; return `<button data-action="nav-tab" data-view="${t.view}" class="${active ? 'active' : ''}" ${active ? 'aria-current="page"' : ''}>
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

function homeView() {
  const tags = Array.from(new Set(state.recipes.flatMap(r => r.tags || []).concat(state.recipes.length ? [] : [])));
  const shownTags = tags.length ? tags : [];
  let list = state.recipes;
  const isFiltered = !!(state.query.trim() || state.activeTag || state.favOnly);
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

  let grid;
  if (!list.length) {
    grid = emptyState();
  } else if (!isFiltered && list.length > 1) {
    const [featured, ...rest] = list;
    grid = `<div class="recipe-grid">${recipeCard(featured, { featured: true })}${rest.map(r => recipeCard(r)).join('')}</div>`;
  } else {
    grid = `<div class="recipe-grid">${list.map(r => recipeCard(r)).join('')}</div>`;
  }

  return `
    ${topbar('Savora')}
    <main class="has-tabbar">
      <div class="search-row">
        <div class="search-input-wrap">
          ${ICONS.search}
          <label for="searchInput" class="sr-only">Rezepte durchsuchen</label>
          <input class="search-input" id="searchInput" type="text" placeholder="Rezepte, Zutaten, Tags durchsuchen…" value="${escapeHtml(state.query)}" aria-label="Rezepte, Zutaten, Tags durchsuchen">
        </div>
        <button class="icon-btn" style="background:var(--card-bg);color:${state.favOnly ? 'var(--accent)' : 'var(--text-muted)'};border:1px solid var(--border);" data-action="toggle-fav-filter" aria-label="Nur Favoriten">${state.favOnly ? ICONS.heart : ICONS.heartOutline}</button>
      </div>
      ${state.favOnly ? `<p style="font-size:12.5px;color:var(--text-muted);margin:-8px 0 14px;">Nur Favoriten werden angezeigt.</p>` : ''}
      ${shownTags.length ? `<div class="tag-row">
        <button class="tag-chip ${!state.activeTag ? 'active' : ''}" data-action="filter-tag" data-tag="">Alle</button>
        ${shownTags.map(t => `<button class="tag-chip ${state.activeTag === t ? 'active' : ''}" data-action="filter-tag" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('')}
      </div>` : ''}
      ${grid}
    </main>
    <button class="fab" data-action="new-recipe" aria-label="Neues Rezept">${ICONS.plus}</button>
    ${bottomNav()}
  `;
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
  return `<div class="recipe-card ${featured ? 'recipe-card--featured' : ''}" data-action="open-recipe" data-id="${r.id}" role="button" tabindex="0">
    ${img}
    <button class="fav-btn${r.favorite ? ' fav-btn--active' : ''}" data-action="toggle-fav" data-id="${r.id}" aria-label="${r.favorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}" aria-pressed="${r.favorite ? 'true' : 'false'}">${r.favorite ? ICONS.heart : ICONS.heartOutline}</button>
    <div class="recipe-card-body">
      ${featured ? `<div class="recipe-card-eyebrow">Zuletzt bearbeitet</div>` : ''}
      <div class="recipe-card-title">${escapeHtml(r.title || 'Ohne Titel')}</div>
      <div class="recipe-card-meta">
        ${r.timeMinutes ? `<span>${r.timeMinutes} Min.</span>` : ''}
        ${r.servings ? `<span>${r.servings} Port.</span>` : ''}
      </div>
    </div>
  </div>`;
}

function detailView() {
  const r = state.recipes.find(x => x.id === state.activeRecipeId);
  if (!r) { state.view = 'home'; return homeView(); }
  const servings = state.servingsOverride[r.id] || r.lastServings || r.servings || 1;
  const factor = servings / (r.servings || 1);
  const img = r.image
    ? `<img class="detail-hero-img" src="${r.image}" alt="" style="view-transition-name: recipe-hero-img;">`
    : r.imageId
      ? `<div class="detail-hero-img placeholder" data-lazy-img="full" data-image-id="${r.imageId}" data-img-class="detail-hero-img" style="view-transition-name: recipe-hero-img;">${ICONS.chef}</div>`
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
        <button class="primary-btn" data-action="start-cook" data-id="${r.id}" style="flex:1;">${ICONS.play} Kochmodus starten</button>
        <button class="detail-icon-action" data-action="add-to-shopping" data-id="${r.id}" aria-label="Zur Einkaufsliste" title="Zur Einkaufsliste">${ICONS.cart}</button>
        <button class="detail-icon-action" data-action="share-recipe" data-id="${r.id}" aria-label="Rezept teilen" title="Rezept teilen">${ICONS.share}</button>
      </div>
      ${r.sharedBy ? `<div class="source-line">${ICONS.sparkle} Geteilt von ${escapeHtml(r.sharedBy)}</div>` : r.source ? `<div class="source-line">${ICONS.link} Importiert von <a href="${escapeHtml(r.source)}" target="_blank" rel="noopener">${escapeHtml(domainFromUrl(r.source))}</a></div>` : `<div class="source-line">${ICONS.book} Aus deinem eigenen Kochbuch</div>`}
      ${(r.diet || []).length ? `<div class="diet-badge-row">${r.diet.map(dk => { const d = DIET_OPTIONS.find(o => o.key === dk); return d ? `<span class="diet-badge tone-${d.tone}">${ICONS[d.icon]}${d.label}</span>` : ''; }).join('')}</div>` : ''}
      ${(r.tags || []).length ? `<div class="detail-tags">${r.tags.map(t => `<span class="tag-chip">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
      <div class="detail-columns">
        <div>
          <h3 class="section-heading">Zutaten</h3>
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
          <h3 class="section-heading">Zubereitung</h3>
          <ol class="step-list">
            ${(r.steps || []).map((s, idx) => `<li class="step-item">
              <span class="step-num">${idx + 1}</span>
              <span class="step-text">${escapeHtml(s.text)}</span>
            </li>`).join('')}
          </ol>
          ${r.notes ? `<h3 class="section-heading" style="margin-top:24px;">Notizen</h3><div class="notes-box">${escapeHtml(r.notes)}</div>` : ''}
        </div>
      </div>
    </main>
    ${bottomNav()}
    ${state.modal && state.modal.type === 'delete' ? deleteModal(r) : ''}
  `;
}

function deleteModal(r) {
  return `<div class="modal-backdrop" data-action="close-modal">
    <div class="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="delete-modal-title" tabindex="-1" onclick="event.stopPropagation()">
      <h3 class="modal-title" id="delete-modal-title">Rezept löschen?</h3>
      <p style="font-size:14px;color:var(--text-muted);">„${escapeHtml(r.title)}" wird endgültig aus deinem Kochbuch entfernt.</p>
      <div class="form-actions">
        <button class="ghost-btn" data-action="close-modal" style="flex:1;">Abbrechen</button>
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
  </div>`;
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
                ? `<div data-lazy-img="full" data-image-id="${r.imageId}" style="padding:10px 0;">${ICONS.chef}</div>`
                : `<div style="padding:10px 0;">${ICONS.chef}<div style="margin-top:6px;">Foto auswählen</div></div>`}
            <input type="file" accept="image/*" id="f-image" aria-label="Foto auswählen">
          </div>
        </div>
        <div class="field-row" style="margin-bottom:18px;">
          <div class="field" style="margin-bottom:0;"><label for="f-servings">Portionen</label><input type="number" id="f-servings" min="1" value="${r.servings}"></div>
          <div class="field" style="margin-bottom:0;"><label for="f-time">Zeit (Min.)</label><input type="number" id="f-time" min="0" value="${r.timeMinutes}"></div>
          <div class="field" style="margin-bottom:0;"><label for="f-difficulty">Schwierigkeit</label>
            <select id="f-difficulty">
              ${['Einfach','Mittel','Anspruchsvoll'].map(d => `<option ${r.difficulty === d ? 'selected' : ''}>${d}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="field">
          <label id="diet-group-label">Ernährungsform / Allergene</label>
          <div class="diet-select-row" role="group" aria-labelledby="diet-group-label">
            ${DIET_OPTIONS.map(d => `<button type="button" class="diet-select-chip ${((r.diet)||[]).includes(d.key) ? 'active' : ''}" data-action="toggle-diet" data-diet="${d.key}" aria-pressed="${((r.diet)||[]).includes(d.key) ? 'true' : 'false'}">${ICONS[d.icon]}${d.label}</button>`).join('')}
          </div>
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
  return `<div class="repeat-row ing-row" data-ing-row="${idx}">
    <div class="field ing-name"><input type="text" placeholder="Zutat" class="ing-name-input" value="${escapeHtml(i.name || '')}"></div>
    <div class="ing-row-meta">
      <div class="field ing-amount"><input type="text" inputmode="decimal" placeholder="Menge" class="ing-amount-input" value="${escapeHtml(String(i.amount ?? ''))}"></div>
      <div class="field ing-unit"><input type="text" placeholder="Einheit" class="ing-unit-input" value="${escapeHtml(i.unit || '')}"></div>
      <button type="button" class="ing-convert-btn" data-action="convert-ingredient-row" data-idx="${idx}" title="In dein Masseinheiten-System umrechnen" aria-label="Menge in dein Masseinheiten-System umrechnen">${ICONS.swap}</button>
      <button class="repeat-row-remove" data-action="remove-ingredient" data-idx="${idx}" aria-label="Zutat entfernen">${ICONS.trash}</button>
    </div>
  </div>`;
}

function stepRow(s, idx) {
  return `<div class="repeat-row" data-step-row="${idx}">
    <div class="step-num-badge">${idx + 1}</div>
    <div class="field"><textarea class="step-text-input" placeholder="Was ist zu tun?" style="min-height:44px;">${escapeHtml(s.text || '')}</textarea></div>
    <button class="repeat-row-remove" data-action="remove-step" data-idx="${idx}" aria-label="Schritt entfernen">${ICONS.trash}</button>
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
    <button class="shopping-check ${i.checked ? 'checked' : ''}" data-action="toggle-shopping-item" data-id="${i.id}">${i.checked ? ICONS.check : ''}</button>
    <div class="shopping-item-text">${i.amount ? `<span class="shopping-item-amount">${escapeHtml(String(i.amount))}${i.unit ? ' ' + escapeHtml(i.unit) : ''}</span>` : ''}${escapeHtml(i.name)}</div>
    <button class="shopping-item-del" data-action="delete-shopping-item" data-id="${i.id}" aria-label="Eintrag entfernen">${ICONS.x}</button>
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
        ${open.length ? openHtml : `<p style="text-align:center;color:var(--text-muted);font-size:14px;padding:20px 0;display:flex;align-items:center;justify-content:center;gap:6px;"><span class="icon-inline" style="width:16px;height:16px;">${ICONS.sparkle}</span>Alles abgehakt</p>`}
        ${checked.length ? `<div class="shopping-group-title">Erledigt</div><div>${checked.map(row).join('')}</div>
          <button class="ghost-btn" style="margin-top:16px;width:100%;justify-content:center;" data-action="clear-checked-shopping">Abgehakte entfernen</button>` : ''}
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

function settingsSection(key, icon, title, bodyHtml, opts = {}) {
  const isOpen = state.settingsOpen.has(key);
  return `<div class="settings-section">
    <button type="button" class="settings-section-header ${isOpen ? 'open' : ''}" data-action="toggle-settings-section" data-key="${key}" aria-expanded="${isOpen ? 'true' : 'false'}" aria-controls="sec-${key}">
      <span class="icon-inline settings-section-icon" aria-hidden="true">${icon}</span>
      <span class="settings-section-title">${title}</span>
      ${opts.badge || ''}
      <span class="icon-inline settings-chevron" aria-hidden="true">${ICONS.chevronRight}</span>
    </button>
    <div class="settings-section-body ${isOpen ? 'open' : ''}" id="sec-${key}" ${isOpen ? '' : 'hidden'}>${bodyHtml}</div>
  </div>`;
}

function settingsView() {
  const t = state.theme;
  const themeLabel = t === 'light' ? 'Hell' : t === 'dark' ? 'Dunkel' : t === 'amoled' ? 'Schwarz' : 'System';
  const unitLabel = state.unitSystem === 'metric' ? 'Metrisch' : 'Imperial';

  const displayBody = `
    <p class="settings-hint">Dunkel eignet sich besonders gut zum Kochen am Abend. Schwarz spart zusätzlich Akku auf OLED-Bildschirmen.</p>
    <div class="theme-switch theme-switch--grid">
      <button class="theme-opt ${t === 'light' ? 'active' : ''}" data-action="set-theme" data-theme="light">${ICONS.sun} Hell</button>
      <button class="theme-opt ${t === 'dark' ? 'active' : ''}" data-action="set-theme" data-theme="dark">${ICONS.moon} Dunkel</button>
      <button class="theme-opt ${t === 'amoled' ? 'active' : ''}" data-action="set-theme" data-theme="amoled">${ICONS.moon} Schwarz</button>
      <button class="theme-opt ${t === 'auto' ? 'active' : ''}" data-action="set-theme" data-theme="auto">${ICONS.auto} System</button>
    </div>`;

  const unitsBody = `
    <p class="settings-hint">Beim Importieren von Rezepten (Web oder Text) werden Mengen automatisch in dein bevorzugtes System umgerechnet. Du kannst jede Menge danach trotzdem frei anpassen.</p>
    <div class="theme-switch" style="margin-bottom:12px;">
      <button class="theme-opt ${state.unitSystem === 'metric' ? 'active' : ''}" data-action="set-unit-system" data-system="metric">Metrisch (g, ml)</button>
      <button class="theme-opt ${state.unitSystem === 'imperial' ? 'active' : ''}" data-action="set-unit-system" data-system="imperial">Imperial (oz, cup)</button>
    </div>
    <button class="ghost-btn" data-action="open-unitconverter">${ICONS.ruler} Masseinheiten-Rechner öffnen</button>`;

  const importBody = `
    <p class="settings-hint">Rezept-Blog-Link einfügen — funktioniert bei den meisten Seiten (nutzt deren strukturierte Rezeptdaten).</p>
    <div class="field" style="margin-bottom:10px;">
      <input type="text" id="importUrl" placeholder="https://beispiel.de/rezept/…">
    </div>
    <button class="primary-btn" data-action="do-import">${ICONS.link} Importieren</button>
    <div id="importStatus"></div>
    <div class="settings-divider"></div>
    <p class="settings-hint">Oder: Bildunterschrift eines Instagram-/TikTok-Posts (oder anderen Rezepttext) einfügen. Savora erkennt Titel, Zutaten und Schritte automatisch — du prüfst den Entwurf danach kurz, bevor du speicherst. Ein vollautomatischer Import direkt aus der App würde ein bezahltes Server-Backend brauchen; das ist (noch) nicht eingebaut.</p>
    <div class="field" style="margin-bottom:10px;">
      <textarea id="pasteText" placeholder="Bildunterschrift hier einfügen …" style="min-height:110px;"></textarea>
    </div>
    <button class="primary-btn" data-action="do-paste-import">${ICONS.sparkle} Rezept-Entwurf erstellen</button>`;

  const dataBody = `
    <p class="settings-hint">Alle Rezepte als PDF im Kochbuch-Layout, ein Rezept pro Seite, mit Titelseite und Inhaltsverzeichnis.</p>
    <button class="ghost-btn" data-action="export-cookbook">${ICONS.pdf} Als PDF exportieren</button>
    <div class="settings-divider"></div>
    <p class="settings-hint">Savora speichert alles nur auf diesem Gerät. Lade regelmässig eine Sicherung herunter, damit bei einem Gerätewechsel oder gelöschten Browserdaten nichts verloren geht.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="primary-btn" data-action="export-backup">${ICONS.download} Sicherung herunterladen</button>
      <button class="ghost-btn" data-action="trigger-restore">${ICONS.upload} Datei einspielen</button>
      <input type="file" id="restoreFileInput" accept="application/json" style="display:none;">
    </div>
    <p class="settings-hint" style="margin-top:8px;">„Datei einspielen" versteht sowohl eigene Sicherungen als auch einzelne Rezepte, die dir jemand über „Teilen" in der Rezept-Detailansicht geschickt hat.</p>
    <div id="backupStatus"></div>`;

  const aboutBody = `<p class="settings-hint" style="margin:0;">Savora speichert dein Kochbuch lokal auf diesem Gerät. Deine Rezepte verlassen dein Gerät nicht, ausser du exportierst sie selbst.</p>`;

  const profileBody = `
    <p class="settings-hint">Der Kochbuch-Titel erscheint unter dem Logo auf der Startseite und auf dem Deckblatt beim PDF-Export.</p>
    <div class="field" style="margin-bottom:14px;">
      <label for="f-cookbook-title">Kochbuch-Titel</label>
      <input type="text" id="f-cookbook-title" placeholder="z.B. Yanis' Küche" value="${escapeHtml(state.cookbookTitle)}">
    </div>
    <p class="settings-hint">Dein Name wird angehängt, wenn du ein Rezept mit jemandem teilst, damit der Empfänger sieht, von wem es kommt.</p>
    <div class="field" style="margin-bottom:10px;">
      <label for="f-sender-name">Dein Name</label>
      <input type="text" id="f-sender-name" placeholder="z.B. Yanis" value="${escapeHtml(state.senderName)}">
    </div>
    <button class="ghost-btn" data-action="save-profile-fields">${ICONS.check} Speichern</button>`;

  return `
    ${topbar('Einstellungen')}
    <main class="has-tabbar">
      ${settingsSection('display', ICONS.moon, 'Darstellung', displayBody, { badge: `<span class="settings-section-badge">${themeLabel}</span>` })}
      ${settingsSection('units', ICONS.ruler, 'Masseinheiten', unitsBody, { badge: `<span class="settings-section-badge">${unitLabel}</span>` })}
      ${settingsSection('profile', ICONS.sparkle, 'Kochbuch & Name', profileBody)}
      ${settingsSection('import', ICONS.link, 'Rezepte importieren', importBody)}
      ${settingsSection('data', ICONS.download, 'Exportieren & sichern', dataBody)}
      ${settingsSection('about', ICONS.book, 'Über Savora', aboutBody)}
    </main>
    ${bottomNav()}
  `;
}
