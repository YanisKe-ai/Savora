/* ---------- Views ---------- */
/* Seiten, die der Router nur dann zeigt, wenn ihre Funktion geladen ist (settings-konto.js, share.js). Fehlt sie
   noch (Zwischenstand), faellt die Route auf die bisherige Ansicht zurueck, statt den Router zu brechen. */
function viewIfDefined(fn, fallback) {
  return typeof fn === 'function' ? fn() : fallback();
}

function viewFor(view) {
  switch (view) {
    case 'home': return homeView();
    case 'detail': return detailView();
    case 'form': return formView();
    case 'cookmode': return cookModeView();
    /* Mehr und Einstellungen */
    case 'more': return moreView();
    case 'settings': return settingsView();
    case 'settings-account': return viewIfDefined(typeof settingsAccountView === 'function' ? settingsAccountView : null, () => settingsDataView('sync'));
    case 'settings-sync':
    case 'settings-data': return viewIfDefined(typeof settingsSyncView === 'function' ? settingsSyncView : null, () => settingsDataView('sync'));
    case 'settings-backup': return viewIfDefined(typeof settingsBackupView === 'function' ? settingsBackupView : null, () => settingsDataView('backup'));
    case 'settings-offline': return viewIfDefined(typeof settingsOfflineView === 'function' ? settingsOfflineView : null, () => settingsDataView('backup'));
    case 'settings-display': return settingsDisplayView();
    case 'settings-cooking':
    case 'settings-units':
    case 'settings-nutrition': return settingsCookingView();
    case 'settings-help': return settingsHelpView();
    case 'settings-privacy': return settingsPrivacyView();
    case 'settings-terms': return settingsTermsView();
    case 'settings-sources': return settingsSourcesView();
    case 'settings-about': return settingsAboutView();
    case 'settings-licenses': return settingsLicensesView();
    /* Freunde & Rezepte (share.js). Die alten Namen 'settings-share' und 'settings-profile' bleiben als Verweise gueltig. */
    case 'friends':
    case 'settings-share': return viewIfDefined(typeof friendsView === 'function' ? friendsView : null, () => settingsShareView());
    case 'friends-profile':
    case 'settings-profile': return viewIfDefined(typeof friendsProfileView === 'function' ? friendsProfileView : null, () => settingsProfileView());
    case 'friends-add': return viewIfDefined(typeof friendsAddView === 'function' ? friendsAddView : null, () => settingsShareView());
    case 'settings-share-preview': return typeof settingsSharePreviewView === 'function' ? settingsSharePreviewView() : viewIfDefined(typeof friendsView === 'function' ? friendsView : null, () => homeView());
    case 'paste-import': return pasteImportView();
    case 'shopping': return shoppingView();
    case 'mealplan': return mealplanView();
    case 'unitconverter': return unitConverterView();
    case 'cookbook': return cookbookDesignerView();
    case 'cookbooks': return cookbooksView();
    /* Rezeptbibliothek (library-views.js, library-publish.js). Fehlt eine Datei (z. B. alter Zwischenspeicher), bleibt die Startseite. */
    case 'discover': return viewIfDefined(typeof discoverView === 'function' ? discoverView : null, () => homeView());
    case 'lib-detail': return viewIfDefined(typeof libDetailView === 'function' ? libDetailView : null, () => homeView());
    case 'lib-profile': return viewIfDefined(typeof libProfileView === 'function' ? libProfileView : null, () => homeView());
    case 'lib-publish': return viewIfDefined(typeof libPublishView === 'function' ? libPublishView : null, () => homeView());
    case 'lib-mine': return viewIfDefined(typeof libMineView === 'function' ? libMineView : null, () => moreView());
    case 'lib-pubprofile': return viewIfDefined(typeof libPubProfileView === 'function' ? libPubProfileView : null, () => moreView());
    case 'lib-mod': return viewIfDefined(typeof libModView === 'function' ? libModView : null, () => moreView());
    default: return homeView();
  }
}


/* «Mehr» bleibt in der Navigation aktiv markiert auf allen Unterseiten dieser Gruppe: Mehr selbst, Einstellungen
   mit allen Detailseiten, Freunde & Rezepte, Rechner, Hilfe, Über Savora und ihre Rechtstexte. */
function isMoreSectionView(view) {
  view = String(view || '');
  return view === 'more' || view === 'settings' || view.indexOf('settings-') === 0 || view.indexOf('friends') === 0 || view === 'unitconverter' || view === 'lib-mine' || view === 'lib-pubprofile' || view === 'lib-mod';
}

/* Die sechs Einstellungsseiten fuer die lokale Abschnittsnavigation neben den Details (Tablet und Desktop).
   Alte Routen zaehlen zur jeweils neuen Seite. */
const SETTINGS_SECTIONS = [
  { group: 'Konto &amp; Daten', views: [
    { view: 'settings-account', label: 'Mein Konto', also: [] },
    { view: 'settings-sync', label: 'Geräteabgleich', also: ['settings-data'] },
    { view: 'settings-backup', label: 'Sicherung &amp; Wiederherstellung', also: [] },
  ] },
  { group: 'App anpassen', views: [
    { view: 'settings-display', label: 'Darstellung', also: [] },
    { view: 'settings-cooking', label: 'Kochen &amp; Mengen', also: ['settings-units', 'settings-nutrition'] },
    { view: 'settings-offline', label: 'Ohne Internet', also: [] },
  ] },
];
function settingsSectionOf(view) {
  for (const g of SETTINGS_SECTIONS) for (const v of g.views) if (v.view === view || v.also.indexOf(view) >= 0) return v.view;
  return null;
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
  return dietary.size + category.size + time.size + ((state.activeFilters.more && state.activeFilters.more.size) || 0) + ((state.activeFilters.tags && state.activeFilters.tags.size) || 0);
}


// Punkt 12/13: Textimport ist keine Einstellung, sondern gehoert in den Erstellungs-Fluss.
// Die FAB oeffnet deshalb dieses kleine Auswahlmenu statt direkt ein leeres Rezept zu erstellen.
function addMenuModal() {
  if (!state.modal || state.modal.type !== 'add-menu') return '';
  return `<div class="modal-backdrop" data-action="close-modal">
    <div class="modal-sheet add-menu-sheet" role="dialog" aria-modal="true" aria-labelledby="add-menu-title" tabindex="-1" onclick="event.stopPropagation()">
      <h2 class="modal-title" id="add-menu-title">Rezept hinzufügen</h2>
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
  return activeStructuredFilterCount() + (state.favOnly ? 1 : 0) + (state.activeTag ? 1 : 0) + (state.activeCollection && state.activeCollection !== 'all' ? 1 : 0);
}
function emptyFilterState() {
  const q = (state.query || '').trim();
  const extra = activeFilterCount() - (state.favOnly ? 1 : 0);   // zusaetzliche Filter ohne Alle/Favoriten
  const qShort = q.length > 40 ? q.slice(0, 40) + '…' : q;
  if (q && extra <= 0 && !state.favOnly) {
    return `<div class="empty-state">
    ${ICONS.search}
    <h2>Keine Treffer für „${escapeHtml(qShort)}“</h2>
    <p>Prüfe die Schreibweise oder suche nach einer Zutat oder einem Stichwort.</p>
    <div class="empty-actions">
      <button class="primary-btn" data-action="clear-search">Suche löschen</button>
    </div>
  </div>`;
  }
  let hint = 'Ändere die Auswahl oder setze die Filter zurück.';
  if (q && (extra > 0 || state.favOnly)) hint = `Die Suche nach „${escapeHtml(qShort)}“ und die Auswahl schränken sich gegenseitig ein.`;
  else if (state.favOnly && extra <= 0) hint = 'Du hast noch keine Favoriten markiert.';
  return `<div class="empty-state">
    ${ICONS.filter}
    <h2>Keine passenden Rezepte</h2>
    <p>${hint}</p>
    <div class="empty-actions">
      ${extra > 0 ? `<button class="primary-btn" data-action="reset-extra-filters">Filter zurücksetzen</button>` : (state.favOnly ? `<button class="primary-btn" data-action="set-fav-mode" data-id="all">Alle Rezepte anzeigen</button>` : '')}
      ${q ? `<button class="ghost-btn" data-action="clear-search">Suche löschen</button>` : ''}
      ${extra > 0 || state.favOnly ? `<button class="ghost-btn" data-action="open-filter-sheet">Filter ändern</button>` : ''}
    </div>
  </div>`;
}

function deleteModal(r) {
  return `<div class="modal-backdrop" data-action="close-modal">
    <div class="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="delete-modal-title" tabindex="-1" onclick="event.stopPropagation()">
      <h2 class="modal-title" id="delete-modal-title">Rezept löschen?</h2>
      <p style="font-size:14px;color:var(--text-muted);">„${escapeHtml(r.title)}“ wird endgültig aus deinem Kochbuch entfernt.</p>
      ${(() => {
        const pub = typeof libPublicationForRecipe === 'function' ? libPublicationForRecipe(r.id) : null;
        if (!pub || pub.status !== 'published') return '';
        // Veroeffentlichung und privates Rezept sind getrennt: ausdruecklich waehlen, nichts vorausgewaehlt
        return `<fieldset class="del-pub" id="delPub" data-pub-id="${escapeAttr(pub.id)}"><legend class="del-pub-legend">Dieses Rezept ist in der Rezeptbibliothek veröffentlicht.</legend>
          <label class="check-line"><input type="radio" name="delPubChoice" value="keep"> Veröffentlichung bestehen lassen</label>
          <label class="check-line"><input type="radio" name="delPubChoice" value="withdraw"> Veröffentlichung zurückziehen</label>
          <p class="hint-line">Kopien, die andere schon gespeichert haben, bleiben in jedem Fall bei ihnen.</p>
          <p class="cloud-error" id="delPubError" role="alert"></p></fieldset>`;
      })()}
      <div class="form-actions">
        <button class="ghost-btn" data-action="close-modal">Abbrechen</button>
        <button class="primary-btn" style="background:var(--danger);color:#fff;flex:1;justify-content:center;" data-action="delete-recipe" data-id="${escapeAttr(r.id)}">Löschen</button>
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
    return `<button type="button" class="timer-chip ${cls}" data-timer-id="${escapeAttr(id)}" data-seconds="${seg.seconds}" data-action="toggle-timer" aria-label="${t && t.done ? 'Timer fertig' : t && t.running ? 'Timer läuft, ' + fmtClock(t.remaining) + ' verbleiben' : 'Timer starten, ' + fmtClock(seg.seconds)}">${t && t.done ? ICONS.check : ICONS.timer}<span data-timer-label="${escapeAttr(id)}">${label}</span></button>`;
  }).join('');
}





/* ---------- «Mehr» und «Einstellungen» ----------
   «Mehr» (Route 'more') bündelt zusätzliche Funktionen: Austauschen, Werkzeuge, Verwalten. Nur echte Präferenzen
   und die Verwaltung liegen unter «Einstellungen» (Route 'settings'). Jede Zeile öffnet eine eigene Seite;
   «Zurück» nutzt den Browserverlauf (siehe onAction 'back' in ui.js). Zeilen: Titel, darunter höchstens
   ein bis zwei kurze Zeilen mit dem echten aktuellen Wert, Pfeil nur bei Navigation. */
Object.assign(ICONS, {
  user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>`,
  sync: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 0 0-14.3-4.6L4 8.5"/><path d="M4 4v4.5h4.5"/><path d="M4 13a8 8 0 0 0 14.3 4.6L20 15.5"/><path d="M20 20v-4.5h-4.5"/></svg>`,
  wifi: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1"/></svg>`,
  pot: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11h16v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z"/><path d="M2 11h2M20 11h2"/><path d="M9 7V5M15 7V5"/></svg>`,
});

function settingsRow(opts) {
  const { icon, title, summary, view, action, danger, badge, nav } = opts;
  const attr = view ? `data-action="goto-view" data-view="${view}"` : `data-action="${action}"`;
  const showArrow = !!(view || nav);
  return `<button type="button" class="settings-row ${danger ? 'settings-row-danger' : ''}" ${attr}>
    <span class="settings-row-icon" aria-hidden="true">${icon}</span>
    <span class="settings-row-text">
      <span class="settings-row-title">${title}</span>
      ${summary ? `<span class="settings-row-summary">${escapeHtml(summary)}</span>` : ''}
    </span>
    ${badge ? `<span class="settings-row-badge">${escapeHtml(badge)}</span>` : ''}
    ${showArrow ? `<span class="settings-row-chevron" aria-hidden="true">${ICONS.chevronRight}</span>` : ''}
  </button>`;
}

function settingsGroup(label, rowsHtml) {
  return `<div class="settings-group">
    <h2 class="settings-group-title">${label}</h2>
    <div class="settings-group-card">${rowsHtml}</div>
  </div>`;
}

/* Lokale Abschnittsnavigation der sechs Einstellungsseiten. Sichtbar erst ab 900 px (CSS), auf dem Handy bleibt
   die Seite einspaltig und «Zurück» führt zur Einstellungs-Übersicht. */
function settingsSubnavHtml(current) {
  return `<nav class="settings-subnav" aria-label="Einstellungen">${SETTINGS_SECTIONS.map(g => `
    <div class="settings-subnav-group">
      <div class="settings-subnav-title">${g.group}</div>
      ${g.views.map(v => `<button type="button" class="settings-subnav-item${v.view === current ? ' active' : ''}" data-action="goto-view" data-view="${v.view}"${v.view === current ? ' aria-current="page"' : ''}>${v.label}</button>`).join('')}
    </div>`).join('')}</nav>`;
}

/* Rahmen einer Detailseite: Kopf mit Zurück und Seitentitel (h1), Inhalt in begrenzter Breite. Gehört die Seite
   zu den sechs Einstellungsseiten, steht ab 900 px die Abschnittsnavigation links daneben. */
function settingsDetailShell(title, bodyHtml, cls) {
  const sec = settingsSectionOf(state.view);
  if (sec) {
    const extra = cls ? ' ' + String(cls).replace(/\bsettings-page--cols\b/g, '').trim() : '';
    return `
      ${topbar(title, { back: true })}
      <main class="has-tabbar settings-page settings-page--split${extra}">
        ${settingsSubnavHtml(sec)}
        <div class="settings-main">${bodyHtml}</div>
      </main>
      ${bottomNav()}
    `;
  }
  return `
    ${topbar(title, { back: true })}
    <main class="has-tabbar settings-page${cls ? ' ' + cls : ''}">${bodyHtml}</main>
    ${bottomNav()}
  `;
}

/* «Mehr»: die Einstiegsseite der fünften Navigationsstelle. Der Zähler an «Freunde & Rezepte» kommt nur aus
   echten Daten (share.count: neue empfangene Rezepte und Anfragen), nie aus Beispielzahlen. */
function moreFriendsBadge() {
  const n = (typeof share !== 'undefined' && share && Number(share.count)) || 0;
  return n > 0 ? `${n} neu` : '';
}
/* Abgemeldet: Vorgabetext. Angemeldet: echter Zustand aus share.js (Profil, neue Rezepte, Anfragen, Freunde). */
function moreFriendsSummary() {
  try { if (typeof cloudSignedIn === 'function' && cloudSignedIn() && typeof friendsSummary === 'function') return friendsSummary(); } catch (e) { /* Vorgabetext */ }
  return 'Empfangene Rezepte und Kontakte';
}
function moreView() {
  return `
    ${topbar('Mehr')}
    <main class="has-tabbar settings-page settings-page--list">
      ${pageTitle('Mehr')}
      ${settingsGroup('Austauschen',
        settingsRow({ icon: ICONS.share, title: 'Freunde &amp; Rezepte', summary: moreFriendsSummary(), view: 'friends', badge: moreFriendsBadge() }))}
      ${typeof libMoreRowsHtml === 'function' ? settingsGroup('Rezeptbibliothek', libMoreRowsHtml()) : ''}
      ${settingsGroup('Werkzeuge',
        settingsRow({ icon: ICONS.scale, title: 'Einheiten umrechnen', summary: 'Gewicht, Volumen, Temperatur und Zutaten', view: 'unitconverter' }))}
      ${settingsGroup('Verwalten', [
        settingsRow({ icon: ICONS.settings, title: 'Einstellungen', summary: 'Konto, Daten und App anpassen', view: 'settings' }),
        settingsRow({ icon: ICONS.lifeBuoy, title: 'Hilfe &amp; Kontakt', summary: 'Antworten und Unterstützung', view: 'settings-help' }),
        settingsRow({ icon: ICONS.info, title: 'Über Savora', summary: 'Version, Datenschutz und Lizenzen', view: 'settings-about' }),
      ].join(''))}
    </main>
    ${bottomNav()}
    ${pdfExportModal()}
  `;
}

/* Kurze, echte Werte für die Untertitel der Einstellungen. */
function settingsAccountSummary() {
  if (typeof cloudSignedIn !== 'function' || !cloudSignedIn()) return 'Nicht angemeldet';
  let email = '';
  try { const s = cloudSession(); email = (s && s.user && s.user.email) || ''; } catch (e) { /* ohne E-Mail */ }
  return email ? `Angemeldet als ${email}` : 'Angemeldet';
}
function settingsSyncSummary() {
  if (typeof cloudSignedIn !== 'function' || !cloudSignedIn()) return 'Zum Abgleichen anmelden';
  if (typeof cloud !== 'undefined' && cloud.syncing) return 'Wird abgeglichen …';
  if (typeof cloud !== 'undefined' && cloud.lastError) return 'Abgleich fehlgeschlagen';
  try { if (Object.keys(cloudQueue()).length) return 'Änderungen warten auf den Abgleich'; } catch (e) { /* unbekannt */ }
  let last = null;
  try { last = readJsonKey(CLOUD_LAST_KEY, null); } catch (e) { /* unbekannt */ }
  if (!last) return 'Noch nicht abgeglichen';
  return `Zuletzt abgeglichen: ${new Date(last).toLocaleString('de-CH', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
}
function settingsBackupSummary() {
  if (!state.lastBackupAt) return 'Noch keine Sicherung heruntergeladen';
  const d = new Date(state.lastBackupAt);
  return isNaN(d) ? 'Noch keine Sicherung heruntergeladen' : `Letzte Sicherung: ${d.toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' })}`;
}
function settingsThemeLabel() {
  return state.theme === 'light' ? 'Hell' : state.theme === 'dark' ? 'Dunkel' : 'Wie dein Gerät';
}
function settingsUnitLabel() {
  return state.unitSystem === 'metric' ? 'Gramm und Milliliter' : 'US-Masse (Cups, Unzen)';
}

/* «Einstellungen»: genau sechs Seiten in zwei Gruppen. */
function settingsView() {
  const offline = (typeof navigator !== 'undefined' && navigator.onLine === false) ? 'Du bist gerade offline' : 'Verfügbarkeit prüfen';
  const body = `
      ${settingsGroup('Konto &amp; Daten', [
        settingsRow({ icon: ICONS.user, title: 'Mein Konto', summary: settingsAccountSummary(), view: 'settings-account' }),
        settingsRow({ icon: ICONS.sync, title: 'Geräteabgleich', summary: settingsSyncSummary(), view: 'settings-sync' }),
        settingsRow({ icon: ICONS.download, title: 'Sicherung &amp; Wiederherstellung', summary: settingsBackupSummary(), view: 'settings-backup' }),
      ].join(''))}
      ${settingsGroup('App anpassen', [
        settingsRow({ icon: ICONS.moon, title: 'Darstellung', summary: settingsThemeLabel(), view: 'settings-display' }),
        settingsRow({ icon: ICONS.pot, title: 'Kochen &amp; Mengen', summary: `${settingsUnitLabel()}, Nährwerte ${state.showNutrition ? 'sichtbar' : 'ausgeblendet'}`, view: 'settings-cooking' }),
        settingsRow({ icon: ICONS.wifi, title: 'Ohne Internet', summary: offline, view: 'settings-offline' }),
      ].join(''))}`;
  return `
    ${topbar('Einstellungen', { back: true })}
    <main class="has-tabbar settings-page settings-page--list">${body}</main>
    ${bottomNav()}
  `;
}

/* Kopf eines Abschnitts auf einer Seite: Überschrift und (optional) ein Satz. */
function settingsSectionHead(title, lead) {
  return `<div class="settings-section-head"><h2 class="settings-section-h">${title}</h2>${lead ? `<p class="settings-section-lead">${lead}</p>` : ''}</div>`;
}

/* «Darstellung»: der einzige Ort für das Farbschema. Die Auswahl wirkt sofort (Aktion 'set-theme' in ui.js) und
   bleibt unter THEME_KEY gespeichert. Der gewählte Eintrag ist durch Haken, fette Schrift und aria-checked
   erkennbar, nicht nur durch die Farbe. */
function settingsDisplayView() {
  const t = state.theme;
  const opt = (id, label, icon) => `<button type="button" class="theme-opt ${t === id ? 'active' : ''}" data-action="set-theme" data-theme="${id}" role="radio" aria-checked="${t === id}">${icon}<span class="theme-opt-label">${label}</span>${t === id ? '<span class="theme-opt-state" aria-hidden="true">Ausgewählt</span>' : ''}</button>`;
  const body = `
    <div class="settings-group">
      <h2 class="settings-group-title" id="themeLabel">Farbschema</h2>
      <div class="settings-group-card settings-group-card--padded">
        <div class="theme-switch theme-switch--stack" role="radiogroup" aria-labelledby="themeLabel">
          ${opt('light', 'Hell', ICONS.sun)}${opt('dark', 'Dunkel', ICONS.moon)}${opt('auto', 'Wie dein Gerät', ICONS.auto)}
        </div>
        <p class="settings-hint settings-hint--top">Die Auswahl gilt sofort und bleibt auf diesem Gerät gespeichert. Bei «Wie dein Gerät» folgt Savora der Einstellung deines Geräts.</p>
      </div>
    </div>`;
  return settingsDetailShell('Darstellung', body);
}

/* «Kochen & Mengen»: Einheiten beim Import und Nährwerte anzeigen.
   Wirkung der Einheiten laut Code: autoConvertIngredient (units.js) rechnet beim Import neuer Rezepte aus Text
   (recipe-import.js, parsers.js) und beim Umrechnen einer einzelnen Zutat im Rezeptformular. Gespeicherte Rezepte
   werden nie rückwirkend verändert. «Nährwerte anzeigen» blendet nur die Anzeige (Reiter, PDF-Option) aus, die
   gespeicherten Werte bleiben unangetastet. */
function settingsCookingView() {
  const on = !!state.showNutrition;
  const unitOpt = (id, label) => `<button type="button" class="theme-opt ${state.unitSystem === id ? 'active' : ''}" data-action="set-unit-system" data-system="${id}" role="radio" aria-checked="${state.unitSystem === id}"><span class="theme-opt-label">${label}</span>${state.unitSystem === id ? '<span class="theme-opt-state" aria-hidden="true">Ausgewählt</span>' : ''}</button>`;
  const body = `
    <div class="settings-group">
      <h2 class="settings-group-title" id="unitLabel">Einheiten beim Import</h2>
      <div class="settings-group-card settings-group-card--padded">
        <div class="theme-switch theme-switch--stack" role="radiogroup" aria-labelledby="unitLabel">
          ${unitOpt('metric', 'Gramm und Milliliter')}${unitOpt('imperial', 'US-Masse (Cups, Unzen)')}
        </div>
        <p class="settings-hint settings-hint--top">Wird beim Import neuer Rezepte und beim Umrechnen einer Zutat im Rezeptformular verwendet. Gespeicherte Rezepte bleiben unverändert.</p>
      </div>
    </div>
    <div class="settings-group">
      <h2 class="settings-group-title">Anzeige</h2>
      <div class="settings-group-card">
        <div class="settings-switch-row">
          <span class="settings-row-text">
            <span class="settings-row-title" id="nutritionLabel">Nährwerte anzeigen</span>
            <span class="settings-row-summary" id="nutritionDesc">In Rezepten und im PDF-Export. Gespeicherte Werte bleiben erhalten.</span>
          </span>
          <button type="button" class="switch" role="switch" aria-checked="${on}" aria-labelledby="nutritionLabel" aria-describedby="nutritionDesc" data-action="set-show-nutrition" data-value="${on ? '0' : '1'}"><span class="switch-state">${on ? 'An' : 'Aus'}</span><span class="switch-knob" aria-hidden="true"></span></button>
        </div>
      </div>
      <p class="settings-hint settings-hint--note">Nährwerte sind geschätzte Werte. Je nach Zutaten und Mengen können sie abweichen.</p>
    </div>`;
  return settingsDetailShell('Kochen & Mengen', body);
}

/* Absendername: freiwillig, wird heute nirgends automatisch ausgegeben (weder PDF noch Teilen).
   Der Abschnitt ist als eigene Seite erreichbar (nicht mehr im Freundesbereich); der Export-Dialog schlaegt den Wert vor. */
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
        <p class="settings-hint">Gedacht für Dateien, die du hier unter „Sicherung speichern“ gespeichert hast. Rezepte von Freunden kommen direkt in Savora an (unter „Freunde &amp; Rezepte“). Ein als PDF weitergegebenes Rezept lässt sich nicht in Savora einspielen.</p>
        <div id="backupStatus"></div>
      </div>
    </div>${typeof offlineSectionHtml === 'function' ? offlineSectionHtml() : ''}`;
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
  return settingsDetailShell('Hilfe & Kontakt', legalHelpHtml());
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
  return settingsDetailShell('Über Savora', legalAboutHtml());
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
