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
        settingsRow({ icon: ICONS.cloud, title: 'Synchronisation', summary: cloudSettingsSummary(), view: 'settings-sync' }),
        settingsRow({ icon: ICONS.download, title: 'Backup &amp; Wiederherstellung', view: 'settings-backup' }),
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
      <p class="settings-hint">Deine Rezepte, Fotos und Notizen bleiben ausschliesslich lokal auf diesem Gerät (IndexedDB). Ohne Anmeldung verlassen sie das Gerät nie.</p>
      <p class="settings-hint">Nur wenn du dich unter „Synchronisation“ anmeldest, werden Rezepte, Fotos, Wochenplan, Einkaufsliste, Sammlungen und Kochbuch-Auswahl verschlüsselt übertragen und in deinem privaten Bereich bei Supabase in Zürich gespeichert, damit sie auf deinen anderen Geräten erscheinen. Nur dein Konto hat Zugriff. Du kannst Konto und Cloud-Daten jederzeit in der App löschen.</p>
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
