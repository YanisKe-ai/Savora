/* ---------- Views ---------- */
function viewFor(view) {
  switch (view) {
    case 'home': return homeView();
    case 'detail': return detailView();
    case 'form': return formView();
    case 'cookmode': return cookModeView();
    case 'settings': return settingsView();
    case 'settings-display': return settingsDisplayView();
    case 'settings-units': return settingsDisplayView();
    case 'settings-profile': return settingsProfileView();
    case 'settings-data': return settingsDataView('sync');
    case 'settings-backup': return settingsDataView('backup');
    case 'settings-help': return settingsHelpView();
    case 'settings-privacy': return settingsPrivacyView();
    case 'settings-terms': return settingsTermsView();
    case 'settings-sources': return settingsSourcesView();
    case 'settings-about': return settingsAboutView();
    case 'settings-licenses': return settingsLicensesView();
    case 'settings-nutrition': return settingsDisplayView();
    case 'paste-import': return pasteImportView();
    case 'shopping': return shoppingView();
    case 'mealplan': return mealplanView();
    case 'unitconverter': return unitConverterView();
    case 'cookbook': return cookbookDesignerView();
    case 'cookbooks': return cookbooksView();
    case 'settings-sync': return settingsDataView('sync');
    case 'settings-share': return settingsShareView();
    case 'settings-share-preview': return settingsSharePreviewView();
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
  // Teilzeiten bleiben getrennt stehen (nie addiert); gleiche Bezeichnungen wie in der Rezeptansicht
  const partTimes = r ? [r.prepMinutes ? `Vorbereitungszeit ${r.prepMinutes} Min.` : '', r.restMinutes ? `Ruhen ${r.restMinutes} Min.` : '', r.cookMinutes ? `Garen/Backen ${r.cookMinutes} Min.` : ''].filter(Boolean) : [];
  const yieldText = r && yieldKnown(r) ? servingLabel(r, r.servings) : '';
  const rows = [
    row(s.titleFound ? 'ok' : 'missing', 'Titel', s.titleFound ? escapeHtml(r ? r.title : '') : 'Bitte eintragen.'),
    row(s.ingredientCount === 0 ? 'missing' : (has('ingredients') ? 'check' : 'ok'), 'Zutaten', `${s.ingredientCount} erkannt${s.groupCount ? `, ${s.groupCount} Gruppe${s.groupCount === 1 ? '' : 'n'}` : ''}${(s.noAmount || []).length ? `. Ohne Menge: ${escapeHtml(s.noAmount.join(', '))}` : ''}`),
    row(s.stepCount === 0 ? 'missing' : (has('steps') ? 'check' : 'ok'), 'Schritte', `${s.stepCount} erkannt${s.methodSteps ? `, davon ${s.methodSteps} mit alternativen Garmethoden` : ''}`),
    row(s.servingsFound ? (has('servings') ? 'check' : 'ok') : 'missing', 'Ergibt', s.servingsFound ? escapeHtml(yieldText) : 'Nicht angegeben. Die Mengen bleiben wie im Original.'),
    row(s.timeFound || partTimes.length ? 'ok' : 'missing', 'Zeit', s.timeFound ? `${r ? r.timeMinutes : ''} Min.${partTimes.length ? ` (${partTimes.join(', ')})` : ''}` : partTimes.length ? `${partTimes.join(', ')}. Keine Gesamtzeit angegeben, es wird nichts zusammengerechnet.` : 'Nicht angegeben, bleibt leer.'),
    r && r.source ? row('ok', 'Quelle', escapeHtml(String(r.source))) : '',
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
    <h2 class="import-summary-title" id="import-sum-title">${ICONS.sparkle} Rezept prüfen</h2>
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

function settingsDetailShell(title, bodyHtml, cls) {
  return `
    ${topbar(title, { back: true })}
    <main class="has-tabbar settings-page${cls ? ' ' + cls : ''}">${bodyHtml}</main>
    ${bottomNav()}
  `;
}

function settingsView() {
  const t = state.theme;
  const themeLabel = t === 'light' ? 'Hell' : t === 'dark' ? 'Dunkel' : t === 'amoled' ? 'Schwarz' : 'Wie dein Gerät';
  const unitLabel = state.unitSystem === 'metric' ? 'Gramm und Milliliter' : 'US-Masse (Cups, Unzen)';

  return `
    ${topbar('Einstellungen')}
    <main class="has-tabbar settings-page settings-page--home">
      ${pageTitle('Einstellungen')}
      ${settingsGroup('Deine Daten', [
        settingsRow({ icon: ICONS.cloud, title: 'Konto und Sicherung', summary: cloudSettingsSummary(), view: 'settings-data' }),
        settingsRow({ icon: ICONS.share, title: 'Freunde &amp; Rezepte senden', summary: shareSettingsSummary(), view: 'settings-share' }),
      ].join(''))}
      ${settingsGroup('Anzeige &amp; Einheiten', [
        settingsRow({ icon: ICONS.moon, title: 'Anzeige', summary: `${themeLabel}, ${unitLabel}`, view: 'settings-display' }),
        settingsRow({ icon: ICONS.scale, title: 'Masseinheiten-Rechner', action: 'open-unitconverter' }),
      ].join(''))}
      ${settingsGroup('Hilfe &amp; Infos', [
        settingsRow({ icon: ICONS.lifeBuoy, title: 'Hilfe erhalten', view: 'settings-help' }),
        settingsRow({ icon: ICONS.info, title: 'Über Savora', view: 'settings-about' }),
      ].join(''))}
    </main>
    ${bottomNav()}
    ${pdfExportModal()}
  `;
}

/* Kopf eines Abschnitts auf einer zusammengelegten Seite: Überschrift und (optional) ein Satz, der
   den Unterschied zum Nachbarabschnitt erklärt. */
function settingsSectionHead(title, lead) {
  return `<div class="settings-section-head"><h2 class="settings-section-h">${title}</h2>${lead ? `<p class="settings-section-lead">${lead}</p>` : ''}</div>`;
}

function settingsThemeBodyHtml() {
  const t = state.theme;
  return `
    <div class="settings-group">
      <div class="settings-group-card settings-group-card--padded">
        <p class="settings-hint">Dunkel eignet sich besonders gut zum Kochen am Abend.</p>
        <div class="theme-switch theme-switch--grid" role="radiogroup" aria-label="Helles oder dunkles Design">
          <button class="theme-opt ${t === 'light' ? 'active' : ''}" data-action="set-theme" data-theme="light" role="radio" aria-checked="${t === 'light'}">${ICONS.sun} Hell</button>
          <button class="theme-opt ${t === 'dark' ? 'active' : ''}" data-action="set-theme" data-theme="dark" role="radio" aria-checked="${t === 'dark'}">${ICONS.moon} Dunkel</button>
          <button class="theme-opt ${t === 'amoled' ? 'active' : ''}" data-action="set-theme" data-theme="amoled" role="radio" aria-checked="${t === 'amoled'}">${ICONS.moon} Schwarz</button>
          <button class="theme-opt ${t === 'auto' ? 'active' : ''}" data-action="set-theme" data-theme="auto" role="radio" aria-checked="${t === 'auto'}">${ICONS.auto} Wie dein Gerät</button>
        </div>
        <p class="settings-hint settings-hint--top">Schwarz: vollständig schwarzer Hintergrund für OLED-Displays.</p>
      </div>
    </div>`;
}

function settingsUnitsBodyHtml() {
  return `
    <div class="settings-group">
      <div class="settings-group-card settings-group-card--padded">
        <p class="settings-hint">Beim Import aus Text rechnet Savora die Mengen in diese Einheiten um. Du kannst jede Menge danach selbst ändern.</p>
        <div class="theme-switch" role="radiogroup" aria-label="Mengenangaben">
          <button class="theme-opt ${state.unitSystem === 'metric' ? 'active' : ''}" data-action="set-unit-system" data-system="metric" role="radio" aria-checked="${state.unitSystem === 'metric'}">Gramm und Milliliter</button>
          <button class="theme-opt ${state.unitSystem === 'imperial' ? 'active' : ''}" data-action="set-unit-system" data-system="imperial" role="radio" aria-checked="${state.unitSystem === 'imperial'}">US-Masse (Cups, Unzen)</button>
        </div>
      </div>
    </div>`;
}

function settingsNutritionBodyHtml() {
  return `
    <div class="settings-group">
      <div class="settings-group-card settings-group-card--padded">
        <p class="settings-hint">Geschätzte Werte. Je nach Zutaten und Mengen können sie abweichen.</p>
        <p class="settings-hint">Wenn du sie nicht brauchst, blendest du Reiter und PDF-Option aus. Berechnete Werte bleiben gespeichert und erscheinen wieder, sobald du sie einschaltest.</p>
        <div class="theme-switch" role="radiogroup" aria-label="Nährwerte anzeigen">
          <button class="theme-opt ${state.showNutrition ? 'active' : ''}" data-action="set-show-nutrition" data-value="1" role="radio" aria-checked="${state.showNutrition}">Anzeigen</button>
          <button class="theme-opt ${!state.showNutrition ? 'active' : ''}" data-action="set-show-nutrition" data-value="0" role="radio" aria-checked="${!state.showNutrition}">Ausblenden</button>
        </div>
      </div>
    </div>`;
}

/* Eine Seite «Anzeige» für Design, Mengenangaben und Nährwerte. Die alten Ansichtsnamen
   'settings-units' und 'settings-nutrition' zeigen dieselbe Seite. */
function settingsDisplayView() {
  const body = settingsSectionHead('Helles oder dunkles Design') + settingsThemeBodyHtml()
    + settingsSectionHead('Mengenangaben') + settingsUnitsBodyHtml()
    + settingsSectionHead('Nährwerte') + settingsNutritionBodyHtml();
  return settingsDetailShell('Anzeige', body, 'settings-page--cols');
}

/* Absendername: freiwillig, wird heute nirgends automatisch ausgegeben (weder PDF noch Teilen).
   Der Abschnitt steht in «Freunde & Rezepte senden» und ist auch als eigene Seite erreichbar. */
function senderNameSectionHtml() {
  return `<div class="settings-group">
    <div class="settings-group-title">Name beim Teilen (freiwillig)</div>
    <div class="settings-group-card settings-group-card--padded">
      <p class="settings-hint settings-hint--none">Wird nur gedruckt, wenn du ihn selbst im Kochbuch oder beim Teilen einschaltest.</p>
      <div class="field" style="margin-bottom:14px;">
        <label for="f-sender-name">Dein Name</label>
        <input type="text" id="f-sender-name" placeholder="z.B. Anna" value="${escapeHtml(state.senderName)}">
      </div>
      <button class="primary-btn" data-action="save-profile-fields">${ICONS.check} Speichern</button>
    </div>
  </div>`;
}

function settingsProfileView() {
  return settingsDetailShell('Name beim Teilen', senderNameSectionHtml());
}

/* Verhalten laut restoreBackupFromFile (backup.js): Es wird nur ergänzt. Vorhandene Rezepte bleiben
   unverändert, inhaltlich gleiche Rezepte werden nicht doppelt angelegt, nichts wird gelöscht. */
const RESTORE_EXPLAIN = 'Die Rezepte aus der Datei werden zu deinen vorhandenen Rezepten hinzugefügt. Was du schon hast, bleibt unverändert und wird nicht ersetzt. Rezepte, die genau so schon da sind, werden nicht doppelt angelegt. Einkaufsliste und Wochenplan werden ebenfalls ergänzt.';

function settingsBackupSectionHtml() {
  const lastBackupLabel = state.lastBackupAt
    ? new Date(state.lastBackupAt).toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Noch keine Sicherung gespeichert';
  return `
    <div class="settings-group">
      <div class="settings-group-card settings-group-card--padded">
        <p class="settings-hint settings-hint--none">Speichere eine Kopie deiner Rezepte als Datei.</p>
        <p class="settings-hint">${typeof cloudSignedIn === 'function' && cloudSignedIn()
          ? 'Du bist mit einem Konto angemeldet: Deine Rezepte liegen in deinem Profil und sind auf jedem Gerät da, auch nach einer Neuinstallation. Du musst keine Sicherung erstellen. Eine Sicherungsdatei ist nur optional, wenn du einen festen Stand aufbewahren möchtest. Der Abgleich ersetzt das nicht ganz: löschst du ein Rezept, verschwindet es überall.'
          : 'Deine Daten liegen nur auf diesem Gerät. Speichere regelmässig eine Sicherung, damit bei einem Gerätewechsel oder gelöschten Browserdaten nichts verloren geht. Im Abschnitt „Auf mehreren Geräten“ kannst du zusätzlich einen Abgleich mit deinen anderen Geräten einrichten. Der Abgleich ersetzt keine Sicherung.'}</p>
        ${(!SavoraNative.isNative && state.storagePersisted === false && !(typeof cloudSignedIn === 'function' && cloudSignedIn())) ? '<p class="settings-hint settings-hint--warn">Dein Browser hat den Speicher nicht als dauerhaft freigegeben und kann ihn bei Platzmangel räumen. Speichere deshalb regelmässig eine Sicherung.</p>' : ''}
        <button class="primary-btn" data-action="export-backup">${ICONS.download} Sicherung speichern</button>
        <p class="settings-hint settings-hint--top">Letzte Sicherung: ${escapeHtml(lastBackupLabel)}</p>
      </div>
    </div>
    <div class="settings-group">
      <div class="settings-group-title">Wiederherstellen</div>
      <div class="settings-group-card settings-group-card--padded">
        <button class="ghost-btn" data-action="trigger-restore">${ICONS.upload} Aus Sicherung wiederherstellen</button>
        <input type="file" id="restoreFileInput" accept="application/json" style="display:none;">
        <p class="settings-hint settings-hint--top">${RESTORE_EXPLAIN}</p>
        <p class="settings-hint">Gedacht für Dateien, die du hier unter „Sicherung speichern“ gespeichert hast. Rezepte von Freunden kommen direkt in Savora an (unter „Freunde &amp; Rezepte senden“). Ein als PDF weitergegebenes Rezept lässt sich nicht in Savora einspielen.</p>
        <div id="backupStatus"></div>
      </div>
    </div>`;
}

/* Eine Seite «Konto und Sicherung». 'settings-sync' (Konto zuerst) und 'settings-backup'
   (Sicherungskopie zuerst) zeigen dieselbe Seite, damit alle bisherigen Verweise weiter stimmen. */
function settingsDataView(first) {
  const sync = settingsSectionHead('Auf mehreren Geräten', 'Gleicht deine Rezepte laufend mit deinem Konto ab, damit sie auf jedem Gerät gleich sind.')
    + (typeof cloudAccountSectionHtml === 'function' ? cloudAccountSectionHtml() : '');
  const backup = settingsSectionHead('Sicherungskopie', 'Eine Datei zum Aufbewahren: ein fester Stand deiner Rezepte, unabhängig von deinem Konto.')
    + settingsBackupSectionHtml();
  const body = first === 'backup' ? backup + sync : sync + backup;
  return settingsDetailShell('Konto und Sicherung', body, 'settings-page--cols')
    + (state.modal && state.modal.type === 'cloud-new-password' && typeof cloudNewPasswordModal === 'function' ? cloudNewPasswordModal() : '');
}


function settingsHelpView() {
  return settingsDetailShell('Hilfe erhalten', legalHelpHtml(), 'settings-page--cols');
}
function settingsPrivacyView() {
  return settingsDetailShell('Datenschutz', legalPrivacyHtml());
}
function settingsTermsView() {
  return settingsDetailShell('Nutzungsbedingungen', legalTermsHtml());
}
function settingsSourcesView() {
  return settingsDetailShell('Datenquellen und Lizenzen', legalSourcesHtml());
}
function settingsLicensesView() {
  return settingsDetailShell('Lizenzen', legalLicensesHtml());
}
function settingsAboutView() {
  return settingsDetailShell('Über Savora', legalAboutHtml(), 'settings-page--cols');
}
/* Punkt 12/13: eigener, dedizierter Screen statt Accordion-Textarea in den Settings. Wird ueber
   die FAB (addMenuModal) erreicht, nicht ueber "Mehr". */
function pasteImportView() {
  const body = `
    <div class="settings-group">
      <div class="settings-group-card settings-group-card--padded">
        <p class="settings-hint">Füge einen Rezepttext ein, zum Beispiel eine Bildunterschrift, eine Nachricht oder Text von einer Webseite. Savora erkennt Titel, Zutaten und Schritte. Du prüfst das Rezept, bevor es gespeichert wird.</p>
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
  // Hilfespalte: nur auf breiten Bildschirmen sichtbar (Paket 42); beschreibt, was recipe-import.js wirklich erkennt
  const help = `<aside class="import-help" aria-label="Was Savora erkennt">
      <h2 class="import-help-h">Das erkennt Savora</h2>
      <ul class="import-help-list">
        <li><b>Titel.</b> Die erste Zeile über den Zutaten.</li>
        <li><b>Zutaten.</b> Zeilen unter der Überschrift «Zutaten», mit Menge und Einheit.</li>
        <li><b>Zubereitung.</b> Nummerierte Schritte oder der Text unter «Zubereitung» oder «Anleitung».</li>
        <li><b>Portionen und Zeit.</b> Zum Beispiel «Für 4 Personen» oder «Vorbereitung: 15 Minuten».</li>
      </ul>
      <p class="import-help-note">Was Savora nicht sicher zuordnen kann, zeigt es dir zum Prüfen. Es wird nichts erfunden und nichts gespeichert, bevor du den Entwurf bestätigst.</p>
      <h3 class="import-help-h import-help-h--sub">Beispiel</h3>
      <pre class="import-example">Gemüsesuppe

Zutaten:
200 g Karotten
1 Zwiebel

Zubereitung:
1. Gemüse schneiden.
2. 20 Minuten kochen.

Für 4 Personen, 30 Minuten</pre>
    </aside>`;
  return `
    ${topbar('Aus Text importieren', { back: true })}
    <main class="has-tabbar settings-page import-page"><div class="import-layout">${body}${help}</div></main>
  `;
}
