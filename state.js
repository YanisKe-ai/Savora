/* ---------- App state ---------- */
const state = {
  view: 'home', // home | detail | form | cookmode | settings
  recipes: [],
  activeRecipeId: null,
  editingRecipe: null,
  query: '',
  activeTag: null,
  favOnly: false,
  cookStepIndex: 0,
  cookFinished: false,
  wakeLock: null,
  toastMsg: null,
  modal: null, // { type: 'delete'|'import', recipeId }
  servingsOverride: {},
  theme: localStorage.getItem(THEME_KEY) || 'auto',
  unitSystem: localStorage.getItem(UNIT_KEY) || 'metric',
  cookbookTitle: localStorage.getItem(COOKBOOK_TITLE_KEY) || '',
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
  nutritionBarcodeStatus: 'idle', // 'idle' | 'looking-up' | 'found' | 'not-found' | 'offline' | 'error' | 'invalid'
  nutritionBarcodeProduct: null,
  nutritionBarcodeInput: '',
  // Filter-/Kategoriensystem (Master-Prompt Teil I): mehrere Dimensionen, innerhalb einer
  // Dimension ODER, zwischen Dimensionen UND (Punkt 107). Als Sets, damit Mehrfachauswahl
  // pro Dimension moeglich ist.
  activeFilters: { dietary: new Set(), category: new Set(), time: new Set() },
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

function lockBodyScroll() {
  bodyScrollLockY = window.scrollY;
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
const HISTORY_DRILLDOWN_VIEWS = new Set(['detail', 'form', 'cookmode', 'unitconverter', 'paste-import']);
function isHistoryDrilldownView(view) {
  return HISTORY_DRILLDOWN_VIEWS.has(view) || view.indexOf('settings-') === 0;
}
function navHistorySnapshot() {
  return { view: state.view, modalType: state.modal ? state.modal.type : null, activeRecipeId: state.activeRecipeId };
}
window.addEventListener('popstate', (e) => {
  const wasModalOpen = !!state.modal;
  state.modal = null;
  if (!wasModalOpen) {
    // Kein Modal offen -> ein echter Drill-Down-Schritt wird zurueckgenommen (der Regelfall
    // beim Browser-/Geraete-Zurueck). e.state beschreibt den Eintrag, zu dem gerade
    // zurueckgekehrt wird (von replaceState/pushState an der jeweiligen Stelle gesetzt).
    if (e.state) {
      state.view = e.state.view;
      state.activeRecipeId = e.state.activeRecipeId || null;
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
function render(skipHistoryPush) {
  const prevView = lastRenderedView;
  const viewChanged = state.view !== prevView;
  const hadModal = bodyScrollLockY !== null;
  const hasModal = !!state.modal;

  if (viewChanged && prevView && !hadModal && typeof TAB_VIEWS !== 'undefined' && TAB_VIEWS.includes(prevView)) {
    scrollMemory[prevView] = window.scrollY;
  }
  // Waehrend der Hintergrund gesperrt ist, liest window.scrollY nur noch 0 (body ist fixed) —
  // das waere keine sinnvolle Position zum Erhalten, deshalb hier bewusst ausgeklammert.
  const preservedY = (!viewChanged && !hadModal) ? window.scrollY : null;
  // Punkt 6: render() ersetzt bei JEDEM Aufruf das komplette #app-innerHTML, auch das
  // .modal-sheet-Element selbst — dessen eigener scrollTop (z.B. beim Scrollen durch die
  // Filter-Optionen) ginge dadurch bei jedem einzelnen Filter-Toggle verloren. Bleibt dasselbe
  // Modal ueber den Render-Aufruf hinweg bestehen, wird sein scrollTop separat gemerkt.
  const existingModalSheet = document.querySelector('.modal-sheet');
  const preservedModalScrollTop = (hasModal && existingModalSheet) ? existingModalSheet.scrollTop : null;
  lastRenderedView = state.view;

  const applyScroll = () => {
    if (hasModal) return; // Hintergrund bleibt gesperrt, eigenes Scrollen ist hier nicht relevant
    if (!viewChanged) {
      if (preservedY !== null) window.scrollTo(0, preservedY);
    } else if (typeof TAB_VIEWS !== 'undefined' && TAB_VIEWS.includes(state.view) && scrollMemory[state.view] != null) {
      window.scrollTo(0, scrollMemory[state.view]);
    } else {
      window.scrollTo(0, 0);
    }
  };

  const update = () => {
    App.innerHTML = viewFor(state.view);
    bindEvents();
    // Erst entsperren (stellt die gemerkte Position wieder her), DANN die normale
    // Scroll-Entscheidung anwenden — sonst wuerde applyScroll auf der noch gesperrten,
    // nicht scrollbaren Seite operieren.
    if (!hasModal && hadModal) unlockBodyScroll();
    applyScroll();
    // Faengt ein natives Browser-Verhalten ab, das NACH einem Klick auf ein gerade per
    // innerHTML entferntes/ersetztes Element eigenstaendig noch einmal scrollt.
    requestAnimationFrame(applyScroll);
    if (hasModal && !hadModal) lockBodyScroll();
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
        if (isHistoryDrilldownView(state.view)) history.pushState(navHistorySnapshot(), '');
        else history.replaceState(navHistorySnapshot(), '');
      }
    }
  };
  if (viewChanged && document.startViewTransition && !prefersReducedMotion()) {
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

async function loadMealplan() {
  const rows = await dbGetAllMealplan();
  state.mealplan = {};
  rows.forEach(r => { state.mealplan[r.date] = r.recipeIds || []; });
}

function emptyRecipe() {
  return {
    id: uid(), title: '', image: null, servings: 4, timeMinutes: 30, difficulty: 'Mittel',
    tags: [], diet: [], categoryTags: [], suppressedTags: [], ingredients: [{ amount: '', unit: '', name: '' }], steps: [{ text: '' }],
    notes: '', favorite: false, source: null, createdAt: Date.now(), updatedAt: Date.now(),
    // Punkt 50: Datenmodell vorbereitet, auch ohne eigene UI zum Setzen — {x:0.5,y:0.5} entspricht
    // exakt dem bisherigen Verhalten (object-fit:cover schneidet mittig), aendert also nichts an
    // bestehenden Rezepten, macht die Angabe aber PDF-seitig bereits nutzbar (siehe pdf-templates.js).
    focalPoint: { x: 0.5, y: 0.5 },
  };
}
