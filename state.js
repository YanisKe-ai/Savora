/* ---------- App state ---------- */
const state = {
  view: 'home', // home | detail | form | cookmode | settings
  recipes: [],
  activeRecipeId: null,
  editingRecipe: null,
  query: '',
  searchOpen: false,   // Handy: Suchfeld geöffnet (nur Anzeige, wird nicht gespeichert)
  activeTag: null,
  favOnly: false,
  cookStepIndex: 0,
  cookFinished: false,
  wakeLock: null,
  toastMsg: null,
  modal: null, // { type: 'delete'|'import', recipeId }
  servingsOverride: {},
  theme: loadStoredTheme(),
  unitSystem: localStorage.getItem(UNIT_KEY) || 'metric',
  sortBy: (() => { try { const v = localStorage.getItem('savora-sort'); return ['updated', 'added', 'az', 'cooked', 'time'].includes(v) ? v : 'updated'; } catch (e) { return 'updated'; } })(),
  showNutrition: (() => { try { return localStorage.getItem('savora-show-nutrition') !== '0'; } catch (e) { return true; } })(),
  cookScale: (() => { try { return Math.max(0, Math.min(2, parseInt(localStorage.getItem('savora-cook-scale') || '0', 10) || 0)); } catch (e) { return 0; } })(),
  cookbookTitle: localStorage.getItem(COOKBOOK_TITLE_KEY) || '',
  cookbookStep: 1,   // Schritt im Kochbuch-Editor: 1 Rezepte auswaehlen, 2 Gestalten, 3 Vorschau und PDF
  senderName: localStorage.getItem(SENDER_NAME_KEY) || '',
  lastBackupAt: localStorage.getItem(LAST_BACKUP_KEY) || null,
  timers: {}, // id -> { remaining, total, running, done, intervalId }
  voiceEnabled: false,
  shopping: [],
  mealplan: {}, // dateKey -> [recipeId, ...]
  weekStart: getMonday(new Date()),
  // Nutrition C (siehe nutrition-*.js): Zwischenzustand fuer den Matching-Screen,
  // bewusst ausserhalb von state.recipes, da rein UI-transient.
  nutritionMatchItems: [],
  nutritionSelectTarget: null,
  nutritionSearchQuery: '',
  nutritionSearchResults: [],
  nutritionDetailMode: 'portion', // 'portion' | '100g' | 'total'
  // Filter-/Kategoriensystem (Master-Prompt Teil I): mehrere Dimensionen, innerhalb einer
  // Dimension ODER, zwischen Dimensionen UND (Punkt 107). Als Sets, damit Mehrfachauswahl
  // pro Dimension moeglich ist.
  activeFilters: { dietary: new Set(), category: new Set(), time: new Set(), more: new Set(), tags: new Set() },
  // Feast x Bloom Umbau: reine UI-Zustaende, nichts davon wird ungefragt gespeichert.
  activeCollection: 'all',       // 'all' | 'favorites' | 'uncooked' | 'frequent' | <Sammlungs-ID>; v84 zusaetzlich 'none' (Ohne Sammlung), 'friends'. Nur Sitzung: Start immer bei «Alle Rezepte»
  selectMode: null,              // v84 Auswahlmodus der Übersicht: { ids: Set<recipeId>, target: Sammlungs-ID|null } (nur Sitzung)
  homeLayoutChosen: (function () { try { const v = localStorage.getItem('savora-home-layout'); return v === 'grid' || v === 'list'; } catch (e) { return false; } })(),
  homeLayout: (function () { try { return localStorage.getItem('savora-home-layout') || 'grid'; } catch (e) { return 'grid'; } })(),
  detailTab: 'ingredients',      // 'ingredients' | 'steps' | 'nutrition' | 'notes'
  formStep: 0,                   // gefuehrte Erfassung, 0..4
  checkedIngredients: {},        // recipeId -> Set(index), temporaerer Kochfortschritt
  cookAllSteps: false,
  cookShowAllIngredients: false,
  planSelectedDays: new Set(),
  mealplanRecords: {},           // dateKey -> vollstaendiger Record inkl. unbekannter Felder
};

const systemDarkQuery = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;

function applyTheme() {
  const root = document.documentElement;
  if (state.theme === 'auto') {
    const systemIsDark = systemDarkQuery ? systemDarkQuery.matches : false;
    root.setAttribute('data-theme', systemIsDark ? 'dark' : 'light');
  } else {
    root.setAttribute('data-theme', state.theme);
  }
  syncThemeChrome(root.getAttribute('data-theme'));
}
/* Browserleiste (theme-color) und iOS-Statusleiste passen sich dem gewaehlten Modus an, nicht dem des Systems:
   Wer in der App "Dunkel" waehlt, waehrend das Telefon hell ist, soll keine dunkle Uhr auf dunklem Grund sehen. */
const THEME_CHROME = { light: '#F7F4EE', dark: '#1B1A17' };
function syncThemeChrome(theme) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_CHROME[theme] || THEME_CHROME.light);
  if (typeof SavoraNative !== 'undefined') SavoraNative.setStatusBarDark(theme === 'dark');
}

applyTheme();

// Live-Reaktion, wenn das Betriebssystem waehrend geoeffneter App zwischen Hell/Dunkel wechselt
// (nur wirksam, solange der Nutzer explizit "System" gewaehlt hat — eine manuelle Wahl wird nie ueberschrieben).
if (systemDarkQuery) {
  systemDarkQuery.addEventListener('change', () => {
    if (state.theme === 'auto') applyTheme();
  });
}

let lastRenderedView = null;
// Punkt 4 (Interaction-Stability-Auftrag): Scrollposition je Haupttab merken, damit z.B.
// Home -> Detail -> Zurueck wieder an derselben Stelle landet, statt oben zu beginnen.
const scrollMemory = {};
// Punkt 3: Body-Scroll-Lock waehrend ein Modal offen ist. null = nicht gesperrt, sonst die
// Scrollposition, zu der beim Entsperren zurueckgekehrt wird.
let bodyScrollLockY = null;

function lockBodyScroll(y) {
  bodyScrollLockY = (typeof y === 'number') ? y : window.scrollY;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${bodyScrollLockY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';
}
function unlockBodyScroll() {
  const y = bodyScrollLockY;
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.width = '';
  if (y !== null) window.scrollTo(0, y);
  bodyScrollLockY = null;
}

function prefersReducedMotion() {
  return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* Punkt 5 (Interaction-Stability-Auftrag): Browser/PWA-Back soll app-typisch funktionieren
   (zuerst Modal schliessen, dann eine Drill-Down-Ansicht verlassen), nicht die App/den Tab
   verlassen. Push nur fuer echte "Bildschirmwechsel" (Modal-Oeffnen, Drill-Down-Views) — nicht
   fuer jeden Filter-Toggle oder Tab-Wechsel (Tabs sind gleichrangig, kein Stapel).
   history.scrollRestoration='manual', weil Savora die Scrollposition bereits selbst verwaltet
   (siehe scrollMemory oben) — der Browser wuerde sich sonst mit einer eigenen, an dieser
   dynamisch aufgebauten Seite ohnehin nicht zuverlaessig treffenden Restauration einmischen. */
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
const HISTORY_DRILLDOWN_VIEWS = new Set(['detail', 'form', 'cookmode', 'unitconverter', 'paste-import', 'cookbook', 'lib-detail', 'lib-profile', 'lib-publish', 'lib-mine', 'lib-pubprofile', 'lib-mod']);
function isHistoryDrilldownView(view) {
  return HISTORY_DRILLDOWN_VIEWS.has(view) || view === 'settings' || view.indexOf('settings-') === 0 || view.indexOf('friends') === 0;
}
/* Scrollposition merken: die fuenf Hauptseiten immer; Unterseiten von «Mehr» nur fuer den Rueckweg (Zurueck stellt
   die Position wieder her, ein neuer Aufruf startet oben). */
function remembersScroll(view) {
  if (view === 'discover' || view === 'lib-profile') return true;   // Rueckkehr zur Suche bzw. zum Profil an dieselbe Stelle
  return (typeof TAB_VIEWS !== 'undefined' && TAB_VIEWS.includes(view)) || (typeof isMoreSectionView === 'function' && isMoreSectionView(view));
}
function navHistorySnapshot() {
  const snap = { view: state.view, modalType: state.modal ? state.modal.type : null, activeRecipeId: state.activeRecipeId };
  // v84: Rezeptansicht merkt Reiter und Scrollstand (Rueckweg zwischen verknuepften Rezepten)
  if (state.view === 'detail') { snap.detailTab = state.detailTab; snap.scrollY = bodyScrollLockY !== null ? bodyScrollLockY : window.scrollY; }
  // Rezeptbibliothek: nur IDs und kompakte Zustaende, nie Rezeptdaten (siehe library.js)
  if (typeof libHistoryFields === 'function') Object.assign(snap, libHistoryFields());
  return snap;
}
// Adresse passend zur Ansicht: ?rezept=<id> bzw. ?profil=<id> fuer Neuladen und Teilen (andere Parameter bleiben)
function navHistoryUrl() { return typeof libUrlFor === 'function' ? libUrlFor(state.view) : undefined; }
window.addEventListener('popstate', (e) => {
  if (state.view === 'form' && typeof isFormDirty === 'function' && isFormDirty()) {
    if (!window.confirm('Ungespeicherte Änderungen verwerfen?')) {
      history.pushState(navHistorySnapshot(), '', navHistoryUrl());
      return;
    }
    if (typeof clearRecipeDraft === 'function') clearRecipeDraft();
  }
  // Geraete-/Browser-Zurueck aus dem Kochmodus: Stand sichern. Kam der Wechsel ueber den
  // Schliessen-Button oder den Abschluss, wurde das dort schon erledigt.
  if (state.view === 'cookmode' && !state.cookProgressHandled && !state.cookFinished && typeof saveCookProgress === 'function') saveCookProgress();
  state.cookProgressHandled = false;
  const wasModalOpen = !!state.modal;
  state.modal = null;
  let restoreFocusSel = null;
  if (!wasModalOpen) {
    // Kein Modal offen -> ein echter Drill-Down-Schritt wird zurueckgenommen (der Regelfall
    // beim Browser-/Geraete-Zurueck). e.state beschreibt den Eintrag, zu dem gerade
    // zurueckgekehrt wird (von replaceState/pushState an der jeweiligen Stelle gesetzt).
    if (e.state) {
      // v84: Rezept -> Rezept (verknuepft): Reiter, Scrollstand und Fokus der Ausgangskarte wiederherstellen
      if (state.view === 'detail' && e.state.view === 'detail') {
        if (e.state.detailTab) state.detailTab = e.state.detailTab;
        if (typeof e.state.scrollY === 'number') state.pendingScrollY = e.state.scrollY;
        restoreFocusSel = e.state.focusSel || null;
      }
      state.view = e.state.view;
      state.activeRecipeId = e.state.activeRecipeId || null;
      if (typeof libRestoreFromHistory === 'function') libRestoreFromHistory(e.state);
    } else {
      state.view = 'home';
    }
  }
  // War ein Modal offen, bleibt die dahinterliegende View unveraendert (Punkt 5: "Back
  // schliesst zuerst Modal, dann Detail/Settings-Unterseite, bevor die App verlassen wird").
  // render(true): unterdrueckt den History-Push fuer GENAU diesen Aufruf. Wichtig: das ist ein
  // Parameter, keine geteilte Modul-Variable — render() kann intern ueber
  // document.startViewTransition() ASYNCHRON zu Ende laufen (der DOM-Umbau passiert dann erst
  // im naechsten Frame), eine gemeinsame Variable waere zu diesem spaeteren Zeitpunkt laengst
  // wieder zurueckgesetzt und haette den Push bei jedem Zurueck-Schritt erneut ausgeloest —
  // genau der Fehler, der hier zunaechst auftrat und mit einem echten Test aufgedeckt wurde.
  render(true);
  if (restoreFocusSel) {
    let el = null;
    try { el = App.querySelector(restoreFocusSel); } catch (err) { el = null; }
    if (el) focusWithoutScroll(el);
  }
  if (wasModalOpen && typeof modalTriggerSelector !== 'undefined') {
    const trigger = modalTriggerSelector && document.querySelector(modalTriggerSelector);
    if (trigger && document.contains(trigger) && typeof trigger.focus === 'function') {
      focusWithoutScroll(trigger);
    }
    modalTriggerSelector = null;
  }
});

/* Punkt 2/6/7/8: der Kern des Interaktions-Instabilitaets-Problems war, dass JEDE kleine Aktion
   (Favorit, Filter, Suche, Portionen, Zutat hinzufuegen...) ueber denselben globalen render()
   lief, der #app komplett neu aufbaut — UND danach kommentarlos entweder oben begann oder die
   Browser-Standardclamping der Scrollposition zuschlug, sobald sich die Inhaltshoehe aenderte.
   Statt jede einzelne Aktion auf gezielte DOM-Mutation umzubauen (grosser, riskanter Umbau ohne
   Geraetetests), wird der Effekt hier zentral an der Wurzel behoben: bleibt die View gleich
   (der Normalfall bei fast allen lokalen Aktionen), wird die Fensterposition exakt erhalten.
   Nur ein echter View-Wechsel darf die Position aendern — und dann gezielt: Haupttabs merken
   sich ihre letzte Position (Punkt 4), alles andere (Detail, Formular, Kochmodus, Settings-
   Unterseiten) startet bewusst oben, wie im Auftrag verlangt.

   Punkt 3: Body-Scroll-Lock ist hier zentral verdrahtet, NICHT nur in openModal/closeModal —
   an mehreren Stellen im Code wird state.modal direkt auf null gesetzt (z.B. 'back',
   'new-recipe', 'goto-view'), ohne ueber closeModal() zu laufen. Nur eine zentrale Pruefung
   bei jedem render() erfasst zuverlaessig JEDEN Fall, in dem sich die Modal-Praesenz aendert. */
/* Paket 37: Fokus ueber render() hinweg erhalten. render() ersetzt das ganze DOM; ohne diese Sicherung
   verliert jedes Feld (Formular, Kochbuch-Editor, Text-Import, Freunde) beim Neuzeichnen Fokus und Cursor.
   Das Element wird ueber id, data-Attribute oder Klasse plus Index wiedergefunden. */
function focusFingerprint(el) {
  if (!el || el === document.body || !App.contains(el)) return null;
  const fp = { tag: el.tagName.toLowerCase() };
  if (el.id) fp.id = el.id;
  else {
    const attrs = Array.from(el.attributes).filter(a => /^data-/.test(a.name) && a.value.length < 80).map(a => `[${a.name}="${String(a.value).replace(/["\\]/g, '\\$&')}"]`).join('');
    if (attrs) fp.sel = el.tagName.toLowerCase() + attrs;
    else if (el.className && typeof el.className === 'string') { fp.sel = el.tagName.toLowerCase() + '.' + el.className.trim().split(/\s+/).join('.'); }
    else return null;
    try { fp.idx = Array.from(App.querySelectorAll(fp.sel)).indexOf(el); } catch (e) { return null; }
    if (fp.idx < 0) return null;
  }
  if (typeof el.selectionStart === 'number') { try { fp.s = el.selectionStart; fp.e = el.selectionEnd; fp.d = el.selectionDirection; } catch (e) { /* Typ ohne Auswahl */ } }
  return fp;
}
function restoreFocusFingerprint(fp) {
  if (!fp) return;
  let el = null;
  try { el = fp.id ? document.getElementById(fp.id) : App.querySelectorAll(fp.sel)[fp.idx]; } catch (e) { return; }
  if (!el || el === document.activeElement || el.disabled) return;
  window.__restoringFocus = true;
  focusWithoutScroll(el);
  window.__restoringFocus = false;
  if (fp.s != null && typeof el.setSelectionRange === 'function') { try { el.setSelectionRange(fp.s, fp.e, fp.d || 'none'); } catch (e) { /* nicht kritisch */ } }
}

function render(skipHistoryPush) {
  const prevView = lastRenderedView;
  const viewChanged = state.view !== prevView;
  const hadModal = bodyScrollLockY !== null;
  const hasModal = !!state.modal;
  const focusFp = (!viewChanged && !(hasModal && !hadModal) && !(hadModal && !hasModal)) ? focusFingerprint(document.activeElement) : null;

  if (viewChanged && prevView && !hadModal && remembersScroll(prevView)) {
    scrollMemory[prevView] = window.scrollY;
  }
  // Waehrend der Hintergrund gesperrt ist, liest window.scrollY nur noch 0 (body ist fixed) —
  // das waere keine sinnvolle Position zum Erhalten, deshalb hier bewusst ausgeklammert.
  const preservedY = (!viewChanged && !hadModal) ? window.scrollY : null;
  // Position VOR dem DOM-Tausch merken: danach kann der Browser sie kurzzeitig auf 0 geklemmt haben,
  // dann waere der Hintergrund nach dem Schliessen eines Fensters ganz oben (Sprung).
  const yBeforeLock = (hasModal && !hadModal && !viewChanged) ? window.scrollY : null;
  // Punkt 6: render() ersetzt bei JEDEM Aufruf das komplette #app-innerHTML, auch das
  // .modal-sheet-Element selbst — dessen eigener scrollTop (z.B. beim Scrollen durch die
  // Filter-Optionen) ginge dadurch bei jedem einzelnen Filter-Toggle verloren. Bleibt dasselbe
  // Modal ueber den Render-Aufruf hinweg bestehen, wird sein scrollTop separat gemerkt.
  const existingModalSheet = document.querySelector('.modal-sheet');
  const preservedModalScrollTop = (hasModal && existingModalSheet) ? existingModalSheet.scrollTop : null;
  lastRenderedView = state.view;
  // v84: gezielte Scrollposition (verknuepftes Rezept oben, Rueckweg an die alte Stelle). Gilt fuer diesen
  // Aufruf samt rAF-Nachlauf, damit der Nachlauf sie nicht mit der alten Position ueberschreibt.
  const targetY = (typeof state.pendingScrollY === 'number' && !hasModal) ? state.pendingScrollY : null;
  state.pendingScrollY = null;

  const applyScroll = () => {
    if (hasModal) return; // Hintergrund bleibt gesperrt, eigenes Scrollen ist hier nicht relevant
    if (targetY !== null) { window.scrollTo(0, targetY); return; }
    if (!viewChanged) {
      if (preservedY !== null) window.scrollTo(0, preservedY);
    } else if (scrollMemory[state.view] != null && ((typeof TAB_VIEWS !== 'undefined' && TAB_VIEWS.includes(state.view)) || (skipHistoryPush && remembersScroll(state.view)))) {
      window.scrollTo(0, scrollMemory[state.view]);
    } else {
      window.scrollTo(0, 0);
    }
  };

  const update = () => {
    App.innerHTML = viewFor(state.view);
    bindEvents();
    // Fenster faehrt nur beim Oeffnen ein (nicht bei jedem Neuzeichnen, waehrend es offen ist)
    if (hasModal && !hadModal) { const sh = document.querySelector('.modal-sheet'); if (sh) sh.classList.add('sheet-enter'); }
    // Erst entsperren (stellt die gemerkte Position wieder her), DANN die normale
    // Scroll-Entscheidung anwenden — sonst wuerde applyScroll auf der noch gesperrten,
    // nicht scrollbaren Seite operieren.
    if (!hasModal && hadModal) unlockBodyScroll();
    applyScroll();
    // Nach einem Seitenwechsel innerhalb von «Mehr» steht der Fokus auf dem Seitentitel (Screenreader, Tastatur);
    // der Titel scrollt dabei nicht.
    if (viewChanged && !hasModal && !hadModal && typeof isMoreSectionView === 'function' && isMoreSectionView(state.view)) {
      const h = App.querySelector('main h1, header h1');
      if (h) { h.setAttribute('tabindex', '-1'); focusWithoutScroll(h); }
    }
    // Faengt ein natives Browser-Verhalten ab, das NACH einem Klick auf ein gerade per
    // innerHTML entferntes/ersetztes Element eigenstaendig noch einmal scrollt.
    requestAnimationFrame(() => { applyScroll(); if (typeof updateScrollEdge === 'function') updateScrollEdge(); if (typeof coverFitPreviews === 'function') coverFitPreviews(); });
    if (hasModal && !hadModal) lockBodyScroll(yBeforeLock);
    restoreFocusFingerprint(focusFp);
    if (preservedModalScrollTop !== null) {
      const newModalSheet = document.querySelector('.modal-sheet');
      if (newModalSheet) newModalSheet.scrollTop = preservedModalScrollTop;
    }
    // Punkt 5: History-Eintrag NACH dem DOM-Update setzen, aber nur fuer echte Bildschirm-
    // wechsel (Modal-Oeffnen, Drill-Down-View) und nie bei einer Wiederherstellung durch
    // popstate selbst (suppressHistoryPush), sonst waechst der Stack bei jedem Zurueck weiter.
    // Tab-Wechsel (Home/Wochenplan/Einkauf/Mehr) sind gleichrangig, kein Drill-Down — der
    // AKTUELLE Eintrag wird nur aktualisiert (replaceState), damit ein spaeterer Drill-Down-
    // Push korrekt zu genau diesem Tab zurueckfuehrt, statt einen eigenen Stapel-Eintrag zu
    // erzeugen (das wuerde bei jedem Tab-Tap einen Back-Schritt aufbauen, den niemand erwartet).
    if (!skipHistoryPush) {
      if (hasModal && !hadModal) {
        history.pushState(navHistorySnapshot(), '');
      } else if (viewChanged) {
        const url = navHistoryUrl();
        // Wechselt eine Aktion direkt aus einem offenen Modal in eine andere Ansicht (z.B.
        // Overflow-Menue -> Bearbeiten), wird der Modal-Eintrag ERSETZT statt ein weiterer
        // gestapelt: sonst braucht "Zurueck" danach zwei Schritte.
        if (hadModal) history.replaceState(navHistorySnapshot(), '', url);
        else if (isHistoryDrilldownView(state.view)) history.pushState(navHistorySnapshot(), '', url);
        else history.replaceState(navHistorySnapshot(), '', url);
      }
    } else if (viewChanged) {
      // Zurueck/Vorwaerts: Adresse an die wiederhergestellte Ansicht anpassen (ohne neuen Eintrag)
      const url = navHistoryUrl();
      if (url && url !== location.pathname + location.search + location.hash) history.replaceState(history.state, '', url);
    }
  };
  // Formular und Kochmodus ohne View-Transition: der DOM-Tausch muss dort sofort und synchron
  // abgeschlossen sein (Entwurfs-/Dirty-Schnappschuss, Fortschritts-Wiederherstellung).
  const NO_TRANSITION_VIEWS = new Set(['form', 'cookmode']);
  // Richtung des Seitenwechsels: tiefer hinein = von rechts, zurueck = nach rechts hinaus, Reiter = Ueberblendung
  if (viewChanged) {
    const depth = (v) => (['home', 'discover', 'mealplan', 'shopping', 'cookbooks', 'more'].includes(v) ? 0 : v === 'cookmode' ? 2 : 1);
    const a = depth(prevView || 'home'), b = depth(state.view);
    document.documentElement.dataset.navDir = b > a ? 'forward' : b < a ? 'back' : 'fade';
  }
  if (viewChanged && document.startViewTransition && !prefersReducedMotion() && !NO_TRANSITION_VIEWS.has(state.view)) {
    document.startViewTransition(update);
  } else {
    update();
  }
}

const App = document.getElementById('app');

/* ---------- Data actions ---------- */
async function loadRecipes() {
  state.recipes = (await dbGetAll()).sort((a, b) => b.updatedAt - a.updatedAt);
}

async function loadShopping() {
  state.shopping = (await dbGetAllShopping()).sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/* F01-Migration (einmalig, additiv, mit Sicherung): Wochenplan-Tage ohne keyVersion wurden mit dem
   alten UTC-Schluessel gespeichert. Ihr Inhalt wird auf den Tag gelegt, der beim Planen angezeigt
   wurde. Der alte Datensatz bleibt erhalten (leer, mit Verweis movedTo und Originalinhalt in
   beforeMigration), sodass nichts verloren geht und ein Rueckbau moeglich bleibt. */
async function migrateLegacyMealplanKeys(rows) {
  const legacy = rows.filter(r => r && r.date && !r.keyVersion);
  if (!legacy.length) return false;
  try {
    if (!localStorage.getItem('savora-mealplan-backup-v1')) localStorage.setItem('savora-mealplan-backup-v1', JSON.stringify({ savedAt: Date.now(), rows: legacy }));
  } catch (e) { /* Speicher voll: Migration trotzdem additiv, Original bleibt im Datensatz */ }
  const byDate = Object.fromEntries(rows.map(r => [r.date, r]));
  for (const old of legacy) {
    const entries = Array.isArray(old.entries) ? old.entries : (old.recipeIds || []).map((rid, n) => ({ id: `${old.date}-${n}-${rid}`, recipeId: rid, meal: '', servings: null }));
    const target = legacyUtcKeyToLocal(old.date);
    if (target === old.date || !entries.length) {
      await dbPutMealplanDay({ ...old, keyVersion: 2 });
      continue;
    }
    const existing = byDate[target] && byDate[target].keyVersion ? byDate[target] : null;
    const merged = (existing && Array.isArray(existing.entries) ? existing.entries : []).slice();
    entries.forEach(e => { if (!merged.some(x => x.id === e.id)) merged.push(e); });
    const moved = { ...(existing || {}), date: target, entries: merged, recipeIds: merged.map(e => e.recipeId), keyVersion: 2 };
    await dbPutMealplanDay(moved);
    byDate[target] = moved;
    await dbPutMealplanDay({ ...old, entries: [], recipeIds: [], keyVersion: 2, movedTo: target, beforeMigration: { entries, recipeIds: old.recipeIds || [] } });
  }
  return true;
}

async function loadMealplan() {
  let rows = await dbGetAllMealplan();
  if (await migrateLegacyMealplanKeys(rows)) rows = await dbGetAllMealplan();
  state.mealplan = {};
  state.mealplanRecords = {};
  rows.forEach(r => {
    state.mealplanRecords[r.date] = r; // kompletter Record, damit beim Speichern nichts verloren geht
    state.mealplan[r.date] = Array.isArray(r.entries) ? r.entries.filter(e => e && e.recipeId).map(e => e.recipeId) : (r.recipeIds || []);   // Notizeintraege haben kein Rezept
  });
}

function emptyRecipe() {
  return {
    id: uid(), title: '', image: null, servings: 4, timeMinutes: 30, difficulty: '',
    tags: [], diet: [], categoryTags: [], suppressedTags: [], ingredients: [{ amount: '', unit: '', name: '' }], steps: [{ text: '' }],
    notes: '', favorite: false, source: null, createdAt: Date.now(), updatedAt: Date.now(),
    // Punkt 50: Datenmodell vorbereitet, auch ohne eigene UI zum Setzen — {x:0.5,y:0.5} entspricht
    // exakt dem bisherigen Verhalten (object-fit:cover schneidet mittig), aendert also nichts an
    // bestehenden Rezepten, macht die Angabe aber PDF-seitig bereits nutzbar (siehe pdf-templates.js).
    focalPoint: { x: 0.5, y: 0.5 },
  };
}
