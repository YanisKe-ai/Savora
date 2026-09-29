/* ---------- Savora Datenmodell-Adapter (Feast x Bloom Umbau) ----------
   Grundsatz: KEINE Migration bestehender Datensaetze. Alle neuen Felder sind optional und
   werden erst geschrieben, wenn der Nutzer etwas aendert. Alte Datensaetze werden beim Lesen
   ueber die Adapter unten interpretiert, ihr Rohinhalt bleibt unangetastet. Deshalb bleibt auch
   DB_VERSION unveraendert (5): es gibt keinen neuen Store und keinen neuen Index.

   Neue, optionale Felder:
   - recipe.servingMode        'portions' | 'pieces' (fehlt = 'portions')
   - ingredient.group          Name der Zutatengruppe (fehlt = Gruppe "Zutaten")
   - recipe.cookCount          wie oft im Kochmodus abgeschlossen (fehlt = 0)
   - recipe.lastCookedAt       Zeitstempel des letzten Abschlusses
   - recipe.cookLog            [{ id, date, text }] datierte Kochnotizen
   - recipe.collections        [collectionId] eigene Sammlungen
   - mealplan-Record.entries   [{ id, recipeId, meal, servings }] (recipeIds bleibt synchron)
   - shopping-Item.have        "Bereits vorhanden"
   - shopping-Item.sources     [{ recipeId, title, amount, unit }] Quellbezug fuer Trennen
   - shopping-Item.section     manuell gesetzter Einkaufsbereich
   Neue localStorage-Schluessel (alle mit Praefix savora-): siehe Konstanten. */

const COLLECTIONS_KEY = 'savora-collections';
const COOK_PROGRESS_KEY = 'savora-cook-progress';
const RECIPE_DRAFT_KEY = 'savora-recipe-draft';
const HOME_LAYOUT_KEY = 'savora-home-layout';
const COOKBOOK_CONFIG_KEY = 'savora-cookbook-config';

function readJsonKey(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
}
function writeJsonKey(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
}

/* ---------- Zutatengruppen ---------- */
// Eine alte Abschnittszeile wie "Teig:" oder "Fuer die Fuellung:" ohne Menge/Einheit gilt beim
// LESEN als Gruppentitel. Der Rohdatensatz bleibt unveraendert, bis der Nutzer das Rezept selbst
// bearbeitet und speichert.
function isIngredientHeaderRow(i) {
  if (!i) return false;
  if (i.isGroupHeader) return true;
  const name = String(i.name || '').trim();
  const hasAmount = String(i.amount ?? '').trim() !== '';
  return !!name && !hasAmount && !String(i.unit || '').trim() && /:\s*$/.test(name) && name.length <= 60;
}
function headerTitle(i) {
  return String(i.name || '').trim().replace(/:\s*$/, '').replace(/^f(ü|ue)r (den|die|das)\s+/i, (m) => m).trim();
}
function realIngredients(r) {
  return (r.ingredients || []).filter(i => i && String(i.name || '').trim() && !isIngredientHeaderRow(i));
}
// Liefert die Struktur aus dem Masterprompt (ingredientGroups) als Lese-Adapter.
// _index zeigt auf die Position im Original-Array (fuer Abhaken/Skalieren).
function getIngredientGroups(r) {
  const groups = [];
  let current = null;
  const ensure = (title) => {
    if (!current || current.title !== title) {
      current = { id: 'g' + groups.length, title, ingredients: [] };
      groups.push(current);
    }
    return current;
  };
  (r.ingredients || []).forEach((i, idx) => {
    if (!i) return;
    if (isIngredientHeaderRow(i)) { current = null; ensure(headerTitle(i)); return; }
    if (!String(i.name || '').trim()) return;
    const title = (i.group && String(i.group).trim()) || (current ? current.title : 'Zutaten');
    ensure(title).ingredients.push({ ...i, _index: idx });
  });
  return groups.filter(g => g.ingredients.length);
}
function hasNamedGroups(r) {
  const g = getIngredientGroups(r);
  return g.length > 1 || (g.length === 1 && g[0].title !== 'Zutaten');
}

/* ---------- Portionen / Stueck ---------- */
function servingMode(r) { return r && r.servingMode === 'pieces' ? 'pieces' : 'portions'; }
function currentServings(r) {
  return state.servingsOverride[r.id] || r.lastServings || r.servings || 1;
}
function servingLabel(r, n) {
  if (servingMode(r) === 'pieces') return `${n} Stück`;
  return `${n} ${n === 1 ? 'Portion' : 'Portionen'}`;
}
function servingShort(r, n) {
  return servingMode(r) === 'pieces' ? `${n} Stück` : `${n} Port.`;
}
// Kuechenrundung: Grossmengen in g/ml auf sinnvolle Schritte, sonst Brueche via fmtAmount.
// Rechnet immer vom Originalwert, nie von einem bereits skalierten Wert.
function kitchenAmount(value, unit) {
  if (value === null || value === undefined || isNaN(value)) return '';
  const u = (unit || '').trim().toLowerCase();
  if (['g', 'ml', 'gramm'].includes(u)) {
    if (value >= 1000) return fmtAmount(Math.round(value / 10) * 10);
    if (value >= 100) return fmtAmount(Math.round(value / 5) * 5);
    if (value >= 10) return fmtAmount(Math.round(value));
  }
  return fmtAmount(value);
}
function scaledAmountText(i, factor) {
  const pa = parseAmount(i.amount);
  if (pa === null) return String(i.amount || '').trim(); // freie Angaben ("etwas") nie erfinden
  return kitchenAmount(pa * factor, i.unit);
}

/* ---------- Sammlungen ---------- */
function getCollections() { return readJsonKey(COLLECTIONS_KEY, []); }
function saveCollections(list) { writeJsonKey(COLLECTIONS_KEY, list); }
function isUncooked(r) { return !(r.cookCount > 0); }
function isFrequentlyCooked(r) { return (r.cookCount || 0) >= 3; }
function recipesInCollection(key, recipes) {
  if (!key || key === 'all') return recipes;
  if (key === 'favorites') return recipes.filter(r => r.favorite);
  if (key === 'uncooked') return recipes.filter(isUncooked);
  if (key === 'frequent') return recipes.filter(isFrequentlyCooked);
  return recipes.filter(r => (r.collections || []).includes(key));
}

/* ---------- Kochfortschritt (lokal, ueberlebt versehentliches Schliessen) ---------- */
function loadCookProgress() { return readJsonKey(COOK_PROGRESS_KEY, null); }
function saveCookProgress() {
  const r = state.recipes.find(x => x.id === state.activeRecipeId);
  if (!r) return;
  const timers = {};
  Object.entries(state.timers || {}).forEach(([id, t]) => {
    if (id.indexOf(r.id + '-') !== 0) return;
    timers[id] = { total: t.total, remaining: t.remaining, endTime: t.endTime, running: !!t.running, done: !!t.done };
  });
  const checked = Array.from((state.checkedIngredients && state.checkedIngredients[r.id]) || []);
  writeJsonKey(COOK_PROGRESS_KEY, { recipeId: r.id, step: state.cookStepIndex || 0, checked, timers, savedAt: Date.now() });
}
function clearCookProgress() { try { localStorage.removeItem(COOK_PROGRESS_KEY); } catch (e) {} }
function checkedSetFor(recipeId) {
  state.checkedIngredients = state.checkedIngredients || {};
  if (!state.checkedIngredients[recipeId]) state.checkedIngredients[recipeId] = new Set();
  return state.checkedIngredients[recipeId];
}
// Zutaten, die im Schritttext namentlich vorkommen (konservativ, nur Woerter ab 4 Zeichen).
function ingredientsForStep(r, stepText) {
  const text = ' ' + String(stepText || '').toLowerCase().replace(/[^a-zäöüßéèàç0-9\s-]/gi, ' ') + ' ';
  const out = [];
  (r.ingredients || []).forEach((i, idx) => {
    if (!i || isIngredientHeaderRow(i)) return;
    const core = String(i.name || '').toLowerCase().replace(/\(.*?\)/g, ' ').split(',')[0];
    const words = core.split(/[\s-]+/).map(w => w.replace(/[^a-zäöüßéèàç]/g, '')).filter(w => w.length >= 4);
    const hit = words.some(w => {
      const stem = w.length > 5 ? w.slice(0, w.length - 1) : w;
      return text.includes(' ' + stem) || text.includes(stem);
    });
    if (hit) out.push({ ...i, _index: idx });
  });
  return out;
}

/* ---------- Entwurf ---------- */
function loadRecipeDraft() { return readJsonKey(RECIPE_DRAFT_KEY, null); }
function saveRecipeDraft(recipe, isNew) {
  const copy = JSON.parse(JSON.stringify(recipe));
  delete copy._importSummary;
  writeJsonKey(RECIPE_DRAFT_KEY, { recipe: copy, isNew: !!isNew, formStep: state.formStep || 0, savedAt: Date.now() });
}
function clearRecipeDraft() { try { localStorage.removeItem(RECIPE_DRAFT_KEY); } catch (e) {} }

/* ---------- Wochenplan-Eintraege ---------- */
const MEAL_SLOTS = [
  { id: 'breakfast', label: 'Frühstück' },
  { id: 'lunch', label: 'Mittagessen' },
  { id: 'dinner', label: 'Abendessen' },
];
function mealLabel(meal) {
  const m = MEAL_SLOTS.find(x => x.id === meal);
  return m ? m.label : (meal || 'Ohne Zuordnung');
}
// Alte Records ({date, recipeIds}) werden als Eintraege ohne Mahlzeit gelesen.
function planEntriesFor(dateKey) {
  const rec = (state.mealplanRecords || {})[dateKey];
  if (rec && Array.isArray(rec.entries)) return rec.entries;
  return (state.mealplan[dateKey] || []).map((rid, n) => ({ id: `${dateKey}-${n}-${rid}`, recipeId: rid, meal: '', servings: null }));
}
async function savePlanEntries(dateKey, entries) {
  const existing = (state.mealplanRecords || {})[dateKey] || {};
  const record = { ...existing, date: dateKey, entries, recipeIds: entries.map(e => e.recipeId) };
  state.mealplanRecords = state.mealplanRecords || {};
  state.mealplanRecords[dateKey] = record;
  state.mealplan[dateKey] = record.recipeIds;
  await dbPutMealplanDay(record);
}

/* ---------- Einkaufsbereiche ---------- */
const SHOP_SECTIONS = ['Gemüse und Früchte', 'Kühlregal', 'Fleisch und Fisch', 'Backzutaten', 'Vorrat', 'Sonstiges'];
const LEGACY_CATEGORY_TO_SECTION = {
  'Obst & Gemüse': 'Gemüse und Früchte', 'Milchprodukte & Eier': 'Kühlregal', 'Tiefkühl': 'Kühlregal',
  'Fleisch & Fisch': 'Fleisch und Fisch', 'Getreide & Backwaren': 'Backzutaten',
  'Konserven & Trockenware': 'Vorrat', 'Gewürze & Öle': 'Vorrat', 'Getränke': 'Sonstiges', 'Sonstiges': 'Sonstiges',
};
function shopSectionFor(item) {
  if (item.section && SHOP_SECTIONS.includes(item.section)) return item.section;
  const legacy = typeof categorizeIngredient === 'function' ? categorizeIngredient(item.name) : 'Sonstiges';
  return LEGACY_CATEGORY_TO_SECTION[legacy] || 'Sonstiges';
}

/* Fuegt eine vorbereitete Auswahl {name, amount, unit, recipeId, title} der Einkaufsliste hinzu.
   Zusammengefuehrt wird nur bei gleichem Namen (inkl. einfachem Plural) UND kompatibler Einheit,
   sonst entsteht eine eigene Zeile. Quellen bleiben pro Beitrag erhalten, damit der Nutzer eine
   Zusammenfuehrung wieder trennen kann. Gruppentitel kommen hier gar nicht erst an. */
async function addSelectionToShopping(selection) {
  let added = 0, merged = 0;
  for (const s of selection) {
    if (!s.name || isIngredientHeaderRow(s)) continue;
    const amount = typeof s.amount === 'number' ? s.amount : '';
    const canonical = normalizeUnit(s.unit);
    const source = { recipeId: s.recipeId || null, title: s.title || '', amount, unit: s.unit || '' };
    const match = typeof amount === 'number' ? state.shopping.find(x => {
      if (x.checked || x.have || typeof x.amount !== 'number') return false;
      if (!ingredientNamesMatch(x.name, s.name)) return false;
      const xc = normalizeUnit(x.unit);
      if (canonical && xc) return unitDimension(canonical) === unitDimension(xc);
      if (!canonical && !xc) return (x.unit || '').trim().toLowerCase() === (s.unit || '').trim().toLowerCase();
      return false;
    }) : null;
    if (match) {
      let add = amount;
      const mc = normalizeUnit(match.unit);
      if (canonical && mc && canonical !== mc) {
        const conv = convertAmountExplicit(amount, canonical, mc);
        if (conv === null) { await pushNewShoppingItem(s, amount, source); added++; continue; }
        add = conv;
      }
      if (!Array.isArray(match.sources)) {
        match.sources = [{ recipeId: match.recipeId || null, title: '', amount: match.amount, unit: match.unit || '' }];
      }
      match.amount = Math.round((match.amount + add) * 100) / 100;
      match.sources.push(source);
      await dbPutShopping(match);
      merged++;
    } else {
      await pushNewShoppingItem(s, amount, source);
      added++;
    }
  }
  return { added, merged };
}
async function pushNewShoppingItem(s, amount, source) {
  const item = { id: uid(), name: s.name, amount, unit: s.unit || '', checked: false, recipeId: s.recipeId || null, createdAt: Date.now(), sources: [source] };
  await dbPutShopping(item);
  state.shopping.push(item);
}
// Baut die Vorschau-Liste fuer das Auswahl-Sheet (ein Rezept, mehrere oder Wochenplan).
function shoppingSelectionFor(recipe, servings) {
  const factor = (servings || recipe.servings || 1) / (recipe.servings || 1);
  return realIngredients(recipe).map((i, n) => {
    const pa = parseAmount(i.amount);
    return {
      key: `${recipe.id}-${n}`, recipeId: recipe.id, title: recipe.title || '', name: i.name.trim(),
      amount: pa !== null ? Math.round(pa * factor * 100) / 100 : '', unit: i.unit || '',
      group: i.group || '', selected: true,
    };
  });
}

/* ---------- Kochbuch-Konfiguration ---------- */
function getCookbookConfig() {
  const cfg = readJsonKey(COOKBOOK_CONFIG_KEY, null);
  const ids = new Set(state.recipes.map(r => r.id));
  if (!cfg) {
    // Ohne gespeicherte Auswahl verhaelt sich der Export wie bisher: alle Rezepte.
    return { title: state.cookbookTitle || '', subtitle: '', coverRecipeId: '', chapters: [], items: state.recipes.map(r => ({ recipeId: r.id, chapterId: '' })), isDefault: true };
  }
  cfg.items = (cfg.items || []).filter(it => ids.has(it.recipeId));
  cfg.chapters = cfg.chapters || [];
  return cfg;
}
function saveCookbookConfig(cfg) {
  const copy = { ...cfg }; delete copy.isDefault;
  writeJsonKey(COOKBOOK_CONFIG_KEY, copy);
}
// Reihenfolge fuer den Export: Kapitel in ihrer Reihenfolge, Rezepte ohne Kapitel am Ende.
function cookbookOrderedSections(cfg) {
  const byId = Object.fromEntries(state.recipes.map(r => [r.id, r]));
  const sections = cfg.chapters.map(c => ({ chapter: c, recipes: cfg.items.filter(it => it.chapterId === c.id).map(it => byId[it.recipeId]).filter(Boolean) }));
  const loose = cfg.items.filter(it => !it.chapterId || !cfg.chapters.some(c => c.id === it.chapterId)).map(it => byId[it.recipeId]).filter(Boolean);
  if (loose.length) sections.push({ chapter: null, recipes: loose });
  return sections.filter(s => s.recipes.length);
}
function cookbookWarnings(cfg) {
  const warnings = [];
  const byId = Object.fromEntries(state.recipes.map(r => [r.id, r]));
  if (!cfg.items.length) warnings.push({ level: 'error', text: 'Es ist noch kein Rezept ausgewählt.' });
  cfg.items.forEach(it => {
    const r = byId[it.recipeId]; if (!r) return;
    const t = r.title || 'Ohne Titel';
    if (!realIngredients(r).length) warnings.push({ level: 'warn', text: `„${t}“ hat keine Zutaten.` });
    if (!(r.steps || []).some(s => (s.text || '').trim())) warnings.push({ level: 'warn', text: `„${t}“ hat keine Zubereitungsschritte.` });
    if ((r.steps || []).length > 12 || realIngredients(r).length > 22) warnings.push({ level: 'info', text: `„${t}“ ist lang und wird über mehrere Seiten gesetzt.` });
    if (!r.image && !r.imageId) warnings.push({ level: 'info', text: `„${t}“ hat kein Foto, die Seite wird ohne Bild gestaltet.` });
  });
  cfg.chapters.forEach(c => { if (!cfg.items.some(it => it.chapterId === c.id)) warnings.push({ level: 'info', text: `Kapitel „${c.name}“ ist leer und wird übersprungen.` }); });
  if (cfg.coverRecipeId) {
    const r = byId[cfg.coverRecipeId];
    if (!r || (!r.image && !r.imageId)) warnings.push({ level: 'warn', text: 'Das gewählte Titelbild ist nicht mehr verfügbar.' });
  }
  return warnings;
}
