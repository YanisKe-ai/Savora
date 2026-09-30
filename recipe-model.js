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
  const range = /^\s*([\d.,\/½¼¾⅓⅔ ]+?)\s*[-–]\s*([\d.,\/½¼¾⅓⅔ ]+?)\s*$/.exec(String(i.amount == null ? '' : i.amount));
  if (range) {   // Bereich "2-3": beide Grenzen skalieren, nie nur die untere
    const lo = parseAmount(range[1]), hi = parseAmount(range[2]);
    if (lo !== null && hi !== null) return kitchenAmount(lo * factor, i.unit) + '-' + kitchenAmount(hi * factor, i.unit);
  }
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
  if (key === 'quick') return recipes.filter(r => r.timeMinutes > 0 && r.timeMinutes <= 30);
  // Widerspruechlich gekennzeichnete Rezepte (z.B. "vegan" mit Speck) erscheinen nicht im Ernaehrungsfilter.
  if (key === 'veggie') return recipes.filter(r => (r.diet || []).some(d => d === 'vegetarisch' || d === 'vegan') && !dietConflicts(r).length);
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
/* ---------- Zutaten je Kochschritt (F03) ----------
   Heuristik mit Wortgrenzen statt Teilstring-Suche, damit auch kurze Namen ("Ei") gefunden werden,
   ohne dass "Ei" in "Eis" oder "weich" hineinpasst. Zusammengesetzte Woerter liefern zusaetzlich
   ihren Grundbegriff (Trockenhefe -> Hefe, Weissmehl -> Mehl, Rinderhackfleisch -> Hackfleisch).
   Gibt es dieselbe Zutat in mehreren Gruppen (z.B. Salz im Teig und in der Fuellung), entscheidet
   die Gruppe, zu der die uebrigen eindeutig erkannten Zutaten des Schritts gehoeren. Bleibt es
   unklar, werden alle Kandidaten gezeigt und als mehrdeutig markiert. Eine vom Nutzer
   festgelegte Zuordnung (step.ingredientRefs) hat immer Vorrang. */
const STEP_BASE_WORDS = ['hefe', 'mehl', 'salz', 'zucker', 'pfeffer', 'milch', 'butter', 'oel', 'öl', 'kaese', 'käse',
  'fleisch', 'hackfleisch', 'sauce', 'sosse', 'soße', 'rahm', 'sahne', 'wasser', 'essig', 'senf', 'honig', 'teig', 'nudeln',
  'reis', 'speck', 'schinken', 'zwiebel', 'knoblauch', 'tomaten', 'tomate', 'kartoffeln', 'kartoffel', 'bouillon', 'bruehe',
  'brühe', 'schokolade', 'nuesse', 'nüsse', 'mandeln', 'joghurt', 'quark', 'pulver', 'sesam', 'eier', 'ei'];
const STEP_STOP_WORDS = new Set(['und', 'oder', 'mit', 'ohne', 'fuer', 'für', 'frisch', 'frische', 'frischer', 'gross', 'groß', 'grosse',
  'klein', 'kleine', 'gerieben', 'geriebener', 'gehackt', 'fein', 'grob', 'lauwarm', 'warm', 'kalt', 'weich', 'geschmolzen',
  'ungesalzen', 'gesalzen', 'etwas', 'nach', 'belieben', 'am', 'stueck', 'stück', 'optional', 'alternativ', 'ca', 'zum', 'die',
  'der', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'aus', 'von', 'bis', 'je', 'plus', 'mühle', 'muehle']);
const STEP_ADJECTIVES = new Set(['duenne', 'dünne', 'lange', 'kurze', 'grosse', 'große', 'kleine', 'reife', 'mittelgross', 'gross', 'größe', 'groesse', 'alternativ', 'gerieben', 'geriebenen', 'frisch', 'gehackt', 'gehackte', 'verquirlt']);
const INGREDIENT_SYNONYMS = { eier: ['ei'], ei: ['eier', 'eigelb', 'eiweiss'], hackfleisch: ['hack'], sahne: ['rahm'], rahm: ['sahne'],
  zwiebelpulver: ['zwiebelpulver'], knoblauchzehe: ['knoblauch'], knoblauchzehen: ['knoblauch'] };
function stepWordTokens(text) {
  return String(text || '').toLowerCase().replace(/[^a-zäöüßéèàç0-9]+/gi, ' ').split(' ').filter(Boolean);
}
// Alte Importe haben manchmal das Lebensmittel im Einheitenfeld ("1" | "Ei" | "(gross)").
const COUNT_UNIT_WORDS = new Set(['stk', 'stk.', 'stück', 'stueck', 'prise', 'prisen', 'pk', 'pck', 'pack', 'packung', 'päckchen', 'bund', 'dose', 'dosen',
  'el', 'tl', 'becher', 'zehe', 'zehen', 'scheibe', 'scheiben', 'tasse', 'tassen', 'glas', 'msp', 'handvoll', 'tropfen', 'blatt', 'blätter', 'cm', 'wuerfel', 'würfel', 'schuss', 'spritzer', 'stange', 'stangen', 'kopf', 'knolle']);
function isMeasureUnit(u) {
  const s = String(u || '').trim().toLowerCase();
  if (!s) return true;
  if (typeof normalizeUnit === 'function' && normalizeUnit(s)) return true;
  return COUNT_UNIT_WORDS.has(s) || /^(g|kg|mg|ml|cl|dl|l)$/.test(s);
}
function ingredientText(i) {
  return (isMeasureUnit(i.unit) ? '' : String(i.unit) + ' ') + String(i.name || '');
}
function ingredientKeywords(i) {
  const raw = ingredientText(i).toLowerCase();
  let core = raw.replace(/\([^)]*\)/g, ' ').split(',')[0];
  if (!core.trim()) core = raw.replace(/[()]/g, ' ');
  // Aus Klammern nur Nomen (im Deutschen gross geschrieben), z.B. "(alternativ Bauchspeck oder Bacon)".
  const paren = (ingredientText(i).match(/\(([^)]*)\)/g) || []).join(' ').split(/[^A-Za-zÄÖÜäöüßéèàç]+/).filter(w => /^[A-ZÄÖÜ]/.test(w)).join(' ').toLowerCase();
  const words = stepWordTokens(core).filter(w => w.length >= 2 && !STEP_STOP_WORDS.has(w) && !/^\d/.test(w))
    .concat(stepWordTokens(paren).filter(w => w.length >= 5 && !STEP_STOP_WORDS.has(w) && !STEP_ADJECTIVES.has(w)));
  const keys = new Set();
  words.forEach(w => {
    keys.add(w);
    STEP_BASE_WORDS.forEach(b => { if (w.length > b.length + 2 && w.endsWith(b)) keys.add(b); });
    (INGREDIENT_SYNONYMS[w] || []).forEach(s => keys.add(s));
  });
  return Array.from(keys);
}
function tokenMatchesKeyword(tok, key) {
  if (tok === key) return true;
  if (key.length <= 2) return ['er', 'ern'].some(s => tok === key + s); // Ei -> Eier, Eiern, aber nicht Eis
  if (tok.length >= 4 && (tok === key + 'n' || tok === key + 'en' || tok === key + 'e' || tok === key + 's' || tok === key + 'er' || tok === key + 'es')) return true;
  if (key.length >= 4 && tok.length >= 4 && (key === tok + 'n' || key === tok + 'en' || key === tok + 'e' || key === tok + 's')) return true;
  if (key.length >= 5 && tok.length >= key.length + 3 && tok.endsWith(key)) return true; // Cayennepfeffer -> Pfeffer
  if (tok.length >= 5 && key.length >= tok.length + 3 && key.startsWith(tok)) return true; // Paprika -> Paprikapulver
  return false;
}
function ingredientIdentity(i, idx) { return i && i.id ? 'id:' + i.id : 'idx:' + idx; }
function stepIngredientMatch(r, step) {
  const all = [];
  (r.ingredients || []).forEach((i, idx) => { if (i && String(i.name || '').trim() && !isIngredientHeaderRow(i)) all.push({ ...i, _index: idx }); });
  const groupOf = new Map();
  getIngredientGroups(r).forEach(g => g.ingredients.forEach(i => groupOf.set(i._index, g.title)));
  // 1. Festgelegte Zuordnung
  if (step && Array.isArray(step.ingredientRefs)) {
    const refs = new Set(step.ingredientRefs);
    return { items: all.filter(i => refs.has(ingredientIdentity(i, i._index))).map(i => ({ ...i, _group: groupOf.get(i._index) })), fixed: true, ambiguous: false };
  }
  const tokens = stepWordTokens(step && step.text);
  if (!tokens.length) return { items: [], fixed: false, ambiguous: false };
  const hits = all.filter(i => ingredientKeywords(i).some(k => tokens.some(t => tokenMatchesKeyword(t, k))));
  // 2. Gleichnamige Zutaten aus verschiedenen Gruppen aufloesen
  const byName = {};
  hits.forEach(i => { const k = ingredientKeywords(i)[0] || i.name.toLowerCase(); (byName[k] = byName[k] || []).push(i); });
  const unique = Object.values(byName).filter(list => list.length === 1).map(list => list[0]);
  const votes = {};
  unique.forEach(i => { const g = groupOf.get(i._index); if (g) votes[g] = (votes[g] || 0) + 1; });
  tokens.forEach(t => Object.keys(votes).concat(getIngredientGroups(r).map(g => g.title)).forEach(g => { if (stepWordTokens(g).some(w => w.length >= 4 && tokenMatchesKeyword(t, w))) votes[g] = (votes[g] || 0) + 2; }));
  const ranked = Object.entries(votes).sort((a, b) => b[1] - a[1]);
  const winner = ranked.length && (ranked.length === 1 || ranked[0][1] > ranked[1][1]) ? ranked[0][0] : null;
  let ambiguous = false;
  const items = [];
  Object.values(byName).forEach(list => {
    if (list.length === 1) { items.push(list[0]); return; }
    // Beschreibende Woerter ("verquirlt") entscheiden zuerst, dann die Gruppe des Schritts.
    const described = list.filter(i => stepWordTokens(String(i.name).split(',').slice(1).join(' ') + ' ' + (String(i.name).match(/\(([^)]*)\)/) || ['', ''])[1]).some(w => w.length >= 5 && tokens.some(t => t === w || (t.length >= 6 && w.length >= 6 && t.slice(0, 6) === w.slice(0, 6)))));
    if (described.length === 1) { items.push(described[0]); return; }
    const inWinner = winner ? list.filter(i => groupOf.get(i._index) === winner) : [];
    if (inWinner.length === 1) { items.push(inWinner[0]); return; }
    ambiguous = true;
    list.forEach(i => items.push(i));
  });
  items.sort((a, b) => a._index - b._index);
  return { items: items.map(i => ({ ...i, _group: groupOf.get(i._index), _ambiguous: ambiguous && (byName[ingredientKeywords(i)[0]] || []).length > 1 })), fixed: false, ambiguous };
}
// Kompatibel zur bisherigen Signatur (Text statt Schritt-Objekt)
function ingredientsForStep(r, stepOrText) {
  const step = typeof stepOrText === 'string' ? { text: stepOrText } : stepOrText;
  return stepIngredientMatch(r, step).items;
}

/* ---------- Zwischenueberschriften in Schritten (F11) ----------
   Alte Rezepte enthalten Zeilen wie "Speck vorbereiten" als eigenen Schritt. Sie werden nur in der
   ANZEIGE als Zwischentitel ohne Nummer dargestellt; der gespeicherte Text bleibt unveraendert. */
function isHeadingStep(text, nextText) {
  const t = String(text || '').trim();
  if (!t || !nextText) return false;
  if (t.length > 42 || /[.!?;]$/.test(t) || /\d/.test(t)) return false;
  if (/:.+/.test(t)) return false; // "Tipp: Text" ist Inhalt, kein Titel
  return t.replace(/:$/, '').split(/\s+/).length <= 5;
}
function stepEntries(r) {
  const steps = (r.steps || []).filter(s => s && String(s.text || '').trim());
  const out = [];
  steps.forEach((s, i) => {
    const heading = isHeadingStep(s.text, steps[i + 1] && steps[i + 1].text);
    out.push({ step: s, text: s.text, heading, sourceIndex: (r.steps || []).indexOf(s) });
  });
  return out;
}

/* ---------- Ernaehrungskennzeichnung pruefen (F02) ----------
   Vergleicht die gespeicherte Kennzeichnung mit erkennbaren Zutaten. Aendert NICHTS am Rezept;
   liefert nur Hinweise, die in der Oberflaeche angezeigt und bewusst korrigiert werden koennen. */
const DIET_CHECK_MEAT = ['fleisch', 'hackfleisch', 'speck', 'bauchspeck', 'bacon', 'pancetta', 'guanciale', 'schinken', 'salami', 'wurst', 'chorizo',
  'prosciutto', 'lardo', 'coppa', 'pastrami', 'poulet', 'huhn', 'hähnchen', 'haehnchen', 'rind', 'schwein', 'kalb', 'lamm', 'ente', 'pute',
  'truthahn', 'wild', 'hirsch', 'reh', 'cervelat', 'mortadella', 'kebab', 'gelatine'];
const DIET_CHECK_FISH = ['fisch', 'lachs', 'thunfisch', 'sardelle', 'sardellen', 'anchovis', 'crevetten', 'garnelen', 'muscheln', 'scampi', 'kaviar',
  'dorsch', 'kabeljau', 'forelle', 'hering', 'makrele', 'tintenfisch', 'surimi', 'fischsauce'];
const DIET_CHECK_ANIMAL = ['ei', 'eier', 'eigelb', 'eiweiss', 'eiklar', 'milch', 'butter', 'butterschmalz', 'ghee', 'rahm', 'sahne', 'sauerrahm', 'schmand',
  'käse', 'kaese', 'parmesan', 'pecorino', 'grana', 'mozzarella', 'feta', 'gruyère', 'gruyere', 'emmentaler', 'sbrinz', 'cheddar', 'gorgonzola',
  'burrata', 'ricotta', 'mascarpone', 'quark', 'joghurt', 'jogurt', 'honig', 'crème', 'creme', 'kondensmilch', 'molke', 'schmelzkäse'];
function dietFindings(r) {
  const found = { meat: [], fish: [], animal: [] };
  const plantQualifier = /(vegan|pflanzlich|hafer|soja|mandel|kokos|reis-?milch|erbsen)/i;
  realIngredients(r).forEach(i => {
    const toks = stepWordTokens(ingredientText(i));
    const has = (list) => toks.some(t => list.some(w => t === w || (w.length >= 4 && t.length > w.length + 2 && t.endsWith(w)) || (w === 'ei' && (t === 'eier' || t === 'eiern'))));
    if (has(DIET_CHECK_MEAT)) found.meat.push(i.name);
    else if (has(DIET_CHECK_FISH)) found.fish.push(i.name);
    else if (has(DIET_CHECK_ANIMAL) && !plantQualifier.test(i.name)) found.animal.push(i.name);
  });
  return found;
}
function dietConflicts(r) {
  const diet = r.diet || [];
  if (!diet.includes('vegan') && !diet.includes('vegetarisch')) return [];
  const f = dietFindings(r);
  const out = [];
  if (diet.includes('vegan') && (f.meat.length || f.fish.length || f.animal.length)) out.push({ label: 'vegan', items: f.meat.concat(f.fish, f.animal) });
  if (diet.includes('vegetarisch') && (f.meat.length || f.fish.length)) out.push({ label: 'vegetarisch', items: f.meat.concat(f.fish) });
  return out;
}

/* ---------- Zahleneingaben (F04) ----------
   Strenger Parser fuer Eingabefelder: akzeptiert 0,5 / 0.5 / 1/2 / 1 1/2 / ½ / 1½ / 1'000.
   Gibt { value } oder { error } zurueck, nie stillschweigend 0. */
function parseQuantityInput(raw) {
  const s = String(raw === undefined || raw === null ? '' : raw).trim().replace(/[’']/g, '');
  if (!s) return { error: 'Bitte eine Menge eingeben.' };
  const glyph = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
  let m;
  if ((m = /^(\d+)\s*([¼½¾⅓⅔⅛])$/.exec(s))) return { value: parseInt(m[1], 10) + glyph[m[2]] };
  if (glyph[s] !== undefined) return { value: glyph[s] };
  if ((m = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(s))) return Number(m[3]) ? { value: parseInt(m[1], 10) + Number(m[2]) / Number(m[3]) } : { error: 'Division durch null ist nicht möglich.' };
  if ((m = /^(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)$/.exec(s))) { const d = Number(m[2].replace(',', '.')); return d ? { value: Number(m[1].replace(',', '.')) / d } : { error: 'Division durch null ist nicht möglich.' }; }
  if (/^\d+(?:[.,]\d+)?$/.test(s)) return { value: Number(s.replace(',', '.')) };
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(s)) return { value: Number(s.replace(/\./g, '').replace(',', '.')) };
  return { error: 'Das ist keine gültige Zahl. Beispiele: 0,5 oder 1/2.' };
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
  const record = { ...existing, date: dateKey, entries, recipeIds: entries.map(e => e.recipeId), keyVersion: 2 };
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
  if (cfg.items.length > 40) warnings.push({ level: 'warn', text: `Ein Kochbuch mit ${cfg.items.length} Rezepten braucht beim Erstellen einige Minuten und viel Speicher. Teile es bei Bedarf in mehrere Bücher auf.` });
  cfg.items.forEach(it => {
    const r = byId[it.recipeId]; if (!r) return;
    const t = r.title || 'Ohne Titel';
    if (!realIngredients(r).length) warnings.push({ level: 'warn', text: `„${t}“ hat keine Zutaten.` });
    if (!(r.steps || []).some(s => (s.text || '').trim())) warnings.push({ level: 'warn', text: `„${t}“ hat keine Zubereitungsschritte.` });
    if ((r.steps || []).length > 12 || realIngredients(r).length > 22) warnings.push({ level: 'info', text: `„${t}“ ist lang und wird über mehrere Seiten gesetzt.` });
    if (!r.image && !r.imageId) warnings.push({ level: 'info', text: `„${t}“ hat kein Foto, die Seite wird ohne Bild gestaltet.` });
    if (typeof recipeIssuesSummary === 'function') { const w = recipeIssuesSummary(r); if (w) warnings.push({ level: 'info', text: w }); }
  });
  cfg.chapters.forEach(c => { if (!cfg.items.some(it => it.chapterId === c.id)) warnings.push({ level: 'info', text: `Kapitel „${c.name}“ ist leer und wird übersprungen.` }); });
  if (cfg.coverRecipeId) {
    const r = byId[cfg.coverRecipeId];
    if (!r || (!r.image && !r.imageId)) warnings.push({ level: 'warn', text: 'Das gewählte Titelbild ist nicht mehr verfügbar.' });
  }
  return warnings;
}
