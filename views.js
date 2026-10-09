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
    case 'settings-licenses': return settingsLicensesView();
    case 'settings-nutrition': return settingsNutritionView();
    case 'paste-import': return pasteImportView();
    case 'shopping': return shoppingView();
    case 'mealplan': return mealplanView();
    case 'unitconverter': return unitConverterView();
    case 'cookbook': return cookbookDesignerView();
    case 'settings-sync': return settingsSyncView();
    default: return homeView();
  }
}


// "Mehr" bleibt in der Tab-Leiste aktiv markiert, solange man sich in einer Settings-Detailseite
// oder im davon erreichten Masseinheiten-Rechner befindet (Settings/Mehr-Redesign, Teil A).
function isMoreSectionView(view) {
  return view === 'settings' || view.indexOf('settings-') === 0 || view === 'unitconverter' || view === 'cookbook';
}



/* Zentrale Filterlogik (Punkt 107-109): Suchtext/Favoriten/freier Tag wie bisher, zusaetzlich
   die drei neuen Dimensionen — innerhalb einer Dimension ODER, zwischen Dimensionen UND. Arbeitet
   ausschliesslich auf bereits geladenen state.recipes, keine Zusatzabfragen (Punkt 119). */
function timeBucketsFor(minutes) {
  if (!minutes || minutes <= 0) return [];
  return TIME_BUCKET_OPTIONS.filter((b) => minutes <= b.max).map((b) => b.id);
}


function activeStructuredFilterCount() {
  const { dietary, category, time } = state.activeFilters;
  return dietary.size + category.size + time.size;
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
        ${SavoraNative.canRecognizeText() ? `<button type="button" class="add-menu-option" data-action="open-photo-scan">
          <span class="add-menu-option-icon">${ICONS.camera}</span>
          <span class="add-menu-option-text">
            <strong>Foto scannen</strong>
            <span>Buchseite oder Zettel fotografieren</span>
          </span>
        </button>` : ''}
      </div>
    </div>
  </div>`;
}

function activeFilterCount() {
  const f = state.activeFilters || {};
  return ((f.dietary && f.dietary.size) || 0) + ((f.category && f.category.size) || 0) + ((f.time && f.time.size) || 0) + (state.favOnly ? 1 : 0) + (state.activeTag ? 1 : 0) + (state.activeCollection && state.activeCollection !== 'all' ? 1 : 0);
}
function emptyFilterState() {
  const q = (state.query || '').trim();
  const hasFilters = typeof activeFilterCount === 'function' ? activeFilterCount() > 0 : true;
  if (q) {
    return `<div class="empty-state">
    ${ICONS.search}
    <h2>Keine Treffer für „${escapeHtml(q.length > 40 ? q.slice(0, 40) + '…' : q)}“</h2>
    <p>Prüfe die Schreibweise oder suche nach einer Zutat oder einem Stichwort.${hasFilters ? ' Aktive Filter schränken die Suche zusätzlich ein.' : ''}</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
      ${hasFilters ? `<button class="ghost-btn" data-action="open-filter-sheet">${ICONS.filter} Filter ändern</button>` : ''}
      <button class="primary-btn" data-action="clear-search">Suche löschen</button>
    </div>
  </div>`;
  }
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
  // Eindeutige ID je Gruppe (Mahlzeit und Gericht teilen sich dieselbe Filterdimension).
  const headingId = `filter-group-${groupId}-${String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return `<div class="filter-group">
    <h3 class="filter-group-title" id="${headingId}">${title}</h3>
    <div class="filter-checkbox-row" role="group" aria-labelledby="${headingId}">
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





function deleteModal(r) {
  return `<div class="modal-backdrop" data-action="close-modal">
    <div class="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="delete-modal-title" tabindex="-1" onclick="event.stopPropagation()">
      <h3 class="modal-title" id="delete-modal-title">Rezept löschen?</h3>
      <p style="font-size:14px;color:var(--text-muted);">„${escapeHtml(r.title)}“ wird endgültig aus deinem Kochbuch entfernt.</p>
      <div class="form-actions">
        <button class="ghost-btn" data-action="close-modal">Abbrechen</button>
        <button class="primary-btn" style="background:var(--danger);color:#fff;flex:1;justify-content:center;" data-action="delete-recipe" data-id="${r.id}">Löschen</button>
      </div>
    </div>
  </div>`;
}

function importSummaryBanner(s, r) {
  if (!s) return '';
  const STATE = { ok: 'Erkannt', check: 'Bitte prüfen', missing: 'Fehlt' };
  const row = (st, label, text) => `<li class="import-row import-row--${st}"><span class="import-state import-state--${st}">${STATE[st]}</span><span class="import-label">${label}</span><span class="import-text">${text}</span></li>`;
  const issues = s.issues || [];
  const has = (field, levels) => issues.some(x => x.field === field && (!levels || levels.includes(x.level)));
  const yieldText = r && yieldKnown(r) ? servingLabel(r, r.servings) : '';
  const rows = [
    row(s.titleFound ? 'ok' : 'missing', 'Titel', s.titleFound ? escapeHtml(r ? r.title : '') : 'Bitte eintragen.'),
    row(s.ingredientCount === 0 ? 'missing' : (has('ingredients') ? 'check' : 'ok'), 'Zutaten', `${s.ingredientCount} erkannt${s.groupCount ? `, ${s.groupCount} Gruppe${s.groupCount === 1 ? '' : 'n'}` : ''}${(s.noAmount || []).length ? `. Ohne Menge: ${escapeHtml(s.noAmount.join(', '))}` : ''}`),
    row(s.stepCount === 0 ? 'missing' : (has('steps') ? 'check' : 'ok'), 'Schritte', `${s.stepCount} erkannt${s.methodSteps ? `, davon ${s.methodSteps} mit alternativen Garmethoden` : ''}`),
    row(s.servingsFound ? (has('servings') ? 'check' : 'ok') : 'missing', 'Ausbeute', s.servingsFound ? escapeHtml(yieldText) : 'Unbekannt. Originalmengen, kein Skalieren.'),
    row(s.timeFound ? 'ok' : 'missing', 'Zeit', s.timeFound ? `${r ? r.timeMinutes : ''} Min.` : 'Nicht angegeben, bleibt leer.'),
    s.notesFound ? row('ok', 'Notizen', 'Hinweise und Utensilien stehen in den Notizen, nicht in den Zutaten.') : '',
    s.dietFound ? row('check', 'Ernährung', 'Als Vorschlag erkannt, bitte gegenprüfen.') : '',
    s.categoryFound ? row('check', 'Gerichtstyp', 'Als Vorschlag erkannt, bitte gegenprüfen.') : '',
    (s.lowConfidenceHints || []).length ? row('check', 'Unsicher', `${s.lowConfidenceHints.map(h => escapeHtml(categoryLabelFor(h.id))).join(', ')}: bitte manuell prüfen`) : '',
  ].filter(Boolean).join('');
  const ACTIONS = { 'import-split-ing': 'Aufteilen', 'import-ing-remove': 'Zeile entfernen', 'import-ing-to-step': 'Als Schritt übernehmen', 'import-next-recipe': 'Weiteres Rezept bearbeiten' };
  const issueHtml = issues.filter(x => !['yield', 'time'].includes(x.id)).map(x => {
    const uns = x.id === 'unassigned' && r && r._import ? `<ul class="import-unassigned">${r._import.unassigned.map(l => `<li>${escapeHtml(l)}</li>`).join('')}</ul><span class="import-actions"><button type="button" class="text-btn" data-action="import-unassigned-note">Als Notiz übernehmen</button><button type="button" class="text-btn" data-action="import-unassigned-step">Als Schritt übernehmen</button></span>` : '';
    const act = x.action ? `<button type="button" class="text-btn" data-action="${x.action}" data-idx="${x.index == null ? '' : x.index}">${ACTIONS[x.action] || 'Anwenden'}</button>` : '';
    return `<li class="import-issue"><span class="import-state import-state--${x.level}">${x.level === 'missing' ? 'Fehlt' : 'Bitte prüfen'}</span><span class="import-text">${escapeHtml(x.text)}${x.original ? ` <q class="import-orig">${escapeHtml(x.original)}</q>` : ''}</span>${act}${uns}</li>`;
  }).join('');
  const raw = r && r._import && r._import.raw ? `<details class="import-raw"><summary>Originaltext anzeigen</summary><pre>${escapeHtml(r._import.raw)}</pre></details>` : '';
  return `<section class="import-summary" aria-labelledby="import-sum-title">
    <h2 class="import-summary-title" id="import-sum-title">${ICONS.sparkle} Entwurf erkannt: bitte kurz prüfen</h2>
    <ul class="import-rows">${rows}</ul>
    ${issueHtml ? `<ul class="import-issues" aria-label="Zu prüfen">${issueHtml}</ul>` : ''}
    ${raw}
    <p class="hint-line">Gespeichert wird erst, wenn du auf „Speichern“ tippst.</p>
  </section>`;
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
    ${topbar('Einstellungen')}
    <main class="has-tabbar settings-page">
      ${pageTitle('Einstellungen')}
      ${settingsGroup('Mein Kochbuch', settingsRow({ icon: ICONS.book, title: 'Kochbuch & Profil', summary: cookbookSummary, view: 'settings-profile' }))}
      ${settingsGroup('App', [
        settingsRow({ icon: ICONS.moon, title: 'Darstellung', summary: themeLabel, view: 'settings-display' }),
        settingsRow({ icon: ICONS.ruler, title: 'Masseinheiten', summary: unitLabel, view: 'settings-units' }),
        settingsRow({ icon: ICONS.info, title: 'Nährwerte', summary: state.showNutrition ? 'An' : 'Aus', view: 'settings-nutrition' }),
      ].join(''))}
      ${settingsGroup('Daten &amp; Export', [
        settingsRow({ icon: ICONS.cloud, title: 'Synchronisation', summary: cloudSettingsSummary(), view: 'settings-sync' }),
        settingsRow({ icon: ICONS.download, title: 'Sicherung &amp; Wiederherstellung', view: 'settings-backup' }),
        settingsRow({ icon: ICONS.pdf, title: 'Kochbuch gestalten und als PDF', action: 'goto-view', view: 'cookbook' }),
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

function settingsNutritionView() {
  const body = `
    <div class="settings-group">
      <div class="settings-group-card settings-group-card--padded">
        <p class="settings-hint">Savora schätzt Nährwerte aus den Zutaten. Wenn du sie nicht brauchst, blendest du Reiter und PDF-Option aus. Berechnete Werte bleiben gespeichert und erscheinen wieder, sobald du sie einschaltest.</p>
        <div class="theme-switch" role="radiogroup" aria-label="Nährwerte anzeigen">
          <button class="theme-opt ${state.showNutrition ? 'active' : ''}" data-action="set-show-nutrition" data-value="1" role="radio" aria-checked="${state.showNutrition}">Anzeigen</button>
          <button class="theme-opt ${!state.showNutrition ? 'active' : ''}" data-action="set-show-nutrition" data-value="0" role="radio" aria-checked="${!state.showNutrition}">Ausblenden</button>
        </div>
      </div>
    </div>`;
  return settingsDetailShell('Nährwerte', body);
}

function settingsProfileView() {
  const body = `
    <div class="settings-group">
      <div class="settings-group-card settings-group-card--padded">
        <p class="settings-hint">Der Kochbuch-Titel erscheint unter dem Logo auf der Startseite und auf dem Deckblatt beim PDF-Export.</p>
        <div class="field" style="margin-bottom:14px;">
          <label for="f-cookbook-title">Kochbuch-Titel</label>
          <input type="text" id="f-cookbook-title" placeholder="z.B. Küche von Familie Muster" value="${escapeHtml(state.cookbookTitle)}">
        </div>
        <p class="settings-hint">Dein Name wird angehängt, wenn du ein Rezept mit jemandem teilst, damit der Empfänger sieht, von wem es kommt.</p>
        <div class="field" style="margin-bottom:14px;">
          <label for="f-sender-name">Dein Name</label>
          <input type="text" id="f-sender-name" placeholder="z.B. Anna" value="${escapeHtml(state.senderName)}">
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
      <div class="settings-group-title">Sicherung</div>
      <div class="settings-group-card settings-group-card--padded">
        <p class="settings-hint">${typeof cloudSignedIn === 'function' && cloudSignedIn()
          ? 'Deine Daten liegen auf diesem Gerät und werden zusätzlich über die Synchronisation mit deinen anderen Geräten abgeglichen. Der Abgleich ist keine Sicherung: löschst du etwas, verschwindet es überall. Eine Sicherungsdatei hält einen festen Stand fest, zu dem du zurückkehren kannst.'
          : 'Deine Daten liegen nur auf diesem Gerät. Erstelle regelmässig eine Sicherung, damit bei einem Gerätewechsel oder gelöschten Browserdaten nichts verloren geht. Unter „Synchronisation“ kannst du zusätzlich einen Abgleich mit deinen anderen Geräten einrichten.'}</p>
        ${(!SavoraNative.isNative && state.storagePersisted === false) ? '<p class="settings-hint settings-hint--warn">Dein Browser hat den Speicher nicht als dauerhaft freigegeben und kann ihn bei Platzmangel räumen. Erstelle deshalb regelmässig eine Sicherung.</p>' : ''}
        <button class="primary-btn" data-action="export-backup">${ICONS.download} Sicherung erstellen</button>
        <p class="settings-hint settings-hint--top">Letzte Sicherung: ${escapeHtml(lastBackupLabel)}</p>
      </div>
    </div>
    <div class="settings-group">
      <div class="settings-group-title">Wiederherstellen</div>
      <div class="settings-group-card settings-group-card--padded">
        <button class="ghost-btn" data-action="trigger-restore">${ICONS.upload} Sicherung importieren</button>
        <input type="file" id="restoreFileInput" accept="application/json" style="display:none;">
        <p class="settings-hint settings-hint--top">„Sicherung importieren“ ist für deine eigenen Sicherungen gedacht. Ein von dir geteiltes Rezept kommt bei anderen als fertige PDF-Datei an: die lässt sich ansehen, ausdrucken oder weiterschicken, aber nicht zurück in Savora einspielen.</p>
        <div id="backupStatus"></div>
      </div>
    </div>`;
  return settingsDetailShell('Sicherung', body);
}

function settingsHelpView() {
  return settingsDetailShell('Hilfe & Feedback', legalHelpHtml());
}
function settingsPrivacyView() {
  return settingsDetailShell('Datenschutz', legalPrivacyHtml());
}
function settingsTermsView() {
  return settingsDetailShell('Nutzungsbedingungen', legalTermsHtml());
}
function settingsSourcesView() {
  return settingsDetailShell('Datenquellen', legalSourcesHtml());
}
function settingsLicensesView() {
  return settingsDetailShell('Lizenzen', legalLicensesHtml());
}
function settingsAboutView() {
  return settingsDetailShell('Über Savora', legalAboutHtml());
}
/* Punkt 12/13: eigener, dedizierter Screen statt Accordion-Textarea in den Settings. Wird ueber
   die FAB (addMenuModal) erreicht, nicht ueber "Mehr". */
function pasteImportView() {
  const body = `
    <div class="settings-group">
      <div class="settings-group-card settings-group-card--padded">
        <p class="settings-hint">Bildunterschrift eines Instagram-/TikTok-Posts, eine WhatsApp-Nachricht, kopierter Rezepttext einer Webseite oder eine eigene Notiz einfügen. Savora erkennt Titel, Zutaten und Schritte automatisch, du prüfst den Entwurf danach kurz, bevor du speicherst.</p>
        ${SavoraNative.canRecognizeText() ? `<div class="ocr-box">
          <label class="ghost-btn ocr-btn" for="ocrInput">${ICONS.camera} Foto scannen</label>
          <input type="file" id="ocrInput" class="ocr-input" accept="image/*" aria-label="Foto von einem Rezept aufnehmen oder auswählen">
          <p class="hint-line">Buchseite, Zettel oder Bildschirm fotografieren. Die Texterkennung läuft auf deinem Gerät, das Foto wird nicht gespeichert.</p>
          <div id="ocrStatus" class="ocr-status" role="status" aria-live="polite"></div>
        </div>` : ''}
        <div class="field field--tight">
          <textarea id="pasteText" class="paste-import-textarea" placeholder="Rezepttext hier einfügen …"></textarea>
        </div>
        <div id="pasteError" class="import-error" role="alert" tabindex="-1" hidden></div>
        <button class="primary-btn" data-action="do-paste-import">${ICONS.fileText} Rezept-Entwurf erstellen</button>
      </div>
    </div>`;
  return `
    ${topbar('Aus Text importieren', { back: true })}
    <main class="has-tabbar settings-page">${body}</main>
  `;
}
