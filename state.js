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
  timers: {}, // id -> { remaining, total, running, done, intervalId }
  voiceEnabled: false,
  shopping: [],
  mealplan: {}, // dateKey -> [recipeId, ...]
  weekStart: getMonday(new Date()),
  settingsOpen: new Set(),
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

function prefersReducedMotion() {
  return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function render() {
  const viewChanged = state.view !== lastRenderedView;
  lastRenderedView = state.view;
  const update = () => { App.innerHTML = viewFor(state.view); bindEvents(); };
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
    tags: [], diet: [], ingredients: [{ amount: '', unit: '', name: '' }], steps: [{ text: '' }],
    notes: '', favorite: false, source: null, createdAt: Date.now(), updatedAt: Date.now(),
  };
}
