/* ---------- Automatische Rezeptklassifikation (Master-Prompt Teil I, Punkt 93-101, 117) ----------
   Leitet Ernaehrungsform, Mahlzeit und Gerichtstyp aus Titel, Zutaten, Tags und Zubereitung ab —
   mit Confidence pro Kategorie (Punkt 101) und expliziten False-Positive-Schutzregeln (Punkt 98,
   121), die den bereits vorhandenen Ingredient-Normalizer wiederverwenden (ingredient-
   normalizer.js) statt eigene Woerterlisten doppelt zu pflegen: "Erdnussbutter"/"Hafermilch"/
   "vegane Butter" bleiben dort bereits als eigenstaendige, geschuetzte Lebensmittel erhalten und
   loesen dadurch hier automatisch KEINEN Tierprodukt-Treffer aus. */

/* ---------- Fleisch/Fisch-Indikatoren (Punkt 96) ---------- */
const MEAT_INDICATOR_WORDS = new Set([
  'rindfleisch', 'rind', 'poulet', 'huhn', 'haehnchen', 'hähnchen', 'pouletbrust', 'huehnerbrust', 'hühnerbrust',
  'schweinefleisch', 'schwein', 'schweinsfilet', 'schweinefilet', 'kalbfleisch', 'kalb', 'lamm', 'lammfleisch',
  'hackfleisch', 'rinderhackfleisch', 'speck', 'speckwuerfeli', 'schinken', 'rohschinken', 'kochschinken',
  'salami', 'salsiz', 'mortadella', 'prosciutto', 'buendnerfleisch', 'bündnerfleisch', 'chorizo', 'cervelat',
  'wurst', 'bratwurst', 'geflügel', 'gefluegel', 'ente', 'gans', 'wild', 'hirsch', 'reh', 'bacon', 'poulardenbrust',
  'putenbrust', 'pute', 'truthahn',
]);
const FISH_INDICATOR_WORDS = new Set([
  'lachs', 'rauchlachs', 'thunfisch', 'dorsch', 'forelle', 'crevetten', 'garnelen', 'muscheln', 'tintenfisch',
  'fisch', 'fischfilet', 'seelachs', 'kabeljau', 'sardine', 'hering', 'makrele', 'scampi', 'hummer', 'krebs',
  'fischsauce', 'fischfond', 'kaviar', 'surimi',
]);

/* ---------- Milch/Ei/Honig/Gelatine (Punkt 98-99) ---------- */
const NON_VEGAN_ANIMAL_WORDS = new Set([
  'milch', 'vollmilch', 'magermilch', 'halbfettmilch', 'buttermilch', 'rahm', 'sahne', 'vollrahm', 'halbrahm', 'doppelrahm',
  'butter', 'kaese', 'käse', 'joghurt', 'griechischer joghurt', 'quark', 'magerquark', 'skyr', 'mascarpone', 'ricotta',
  'creme fraiche', 'crème fraîche', 'frischkaese', 'frischkäse', 'doppelrahmfrischkaese', 'doppelrahmfrischkäse',
  'huettenkaese', 'hüttenkäse', 'ei', 'eier', 'eigelb', 'eiweiss', 'honig',
]);
const GELATINE_WORDS = new Set(['gelatine']);

/* ---------- Bouillon/Fond-Sonderfall (Punkt 97) ---------- */
const PLANT_STOCK_WORDS = new Set(['gemuesebouillon', 'gemüsebouillon', 'gemuesefond', 'gemüsefond', 'gemuesebruehe', 'gemüsebrühe']);
const ANIMAL_STOCK_WORDS = new Set(['huehnerbouillon', 'hühnerbouillon', 'rinderfond', 'rinderbouillon', 'fischfond', 'fleischbruehe', 'fleischbrühe', 'kalbsfond', 'poulet fond', 'hühnerfond', 'huehnerfond']);
const UNQUALIFIED_STOCK_WORDS = new Set(['bouillon', 'fond', 'bruehe', 'brühe']);

/* Prueft, ob EINE der Woerter aus `wordSet` als vollstaendiges Token oder als vollstaendiger
   normalisierter Zutatenkern vorkommt — NIE als Substring, damit z.B. "Erdnussbutter" nicht
   wegen "butter" anschlaegt (Punkt 121). Nutzt den Ingredient-Normalizer, damit geschuetzte
   zusammengesetzte Lebensmittel (Hafermilch, vegane Butter, Sojajoghurt, ...) automatisch schon
   dort ausgeschlossen sind. WICHTIG: bei einer geschuetzten MEHRWORT-Verbindung (z.B. "vegane
   butter") wird NIE wortweise zerlegt geprueft — sonst wuerde "butter" als einzelnes Token
   innerhalb der eigentlich geschuetzten Phrase faelschlich wieder anschlagen. */
function ingredientMatchesWordSet(info, wordSet) {
  const canonical = (info.canonicalIngredient || '').trim();
  if (!canonical) return false;
  if (wordSet.has(canonical)) return true;
  if (info.protected) return false; // geschuetzte Mehrwort-Verbindung bleibt als Ganzes geschuetzt
  return canonical.split(' ').some((tok) => wordSet.has(tok));
}

function classifyIngredientsForDiet(recipe) {
  let hasMeat = false, hasFish = false, hasNonVeganAnimal = false, hasGelatine = false;
  let hasUnqualifiedStock = false;
  for (const ing of (recipe.ingredients || [])) {
    if (!ing || !ing.name || !ing.name.trim()) continue;
    const info = normalizeIngredientPhrase(ing.name);
    if (!info.canonicalIngredient) continue;
    if (ingredientMatchesWordSet(info, MEAT_INDICATOR_WORDS)) hasMeat = true;
    if (ingredientMatchesWordSet(info, FISH_INDICATOR_WORDS)) hasFish = true;
    if (ingredientMatchesWordSet(info, NON_VEGAN_ANIMAL_WORDS)) hasNonVeganAnimal = true;
    if (ingredientMatchesWordSet(info, GELATINE_WORDS)) hasGelatine = true;
    // Bouillon/Fond: Gemuese-Variante ist unproblematisch, Fleisch/Fisch-Variante blockiert,
    // eine unqualifizierte Nennung ("Bouillon", "Fond") wird NICHT als pflanzlich angenommen
    // (Punkt 97 "nicht raten"), reduziert aber nur die Sicherheit statt hart zu blockieren.
    if (ingredientMatchesWordSet(info, PLANT_STOCK_WORDS)) { /* unproblematisch */ }
    else if (ingredientMatchesWordSet(info, ANIMAL_STOCK_WORDS)) { hasMeat = true; }
    else if (ingredientMatchesWordSet(info, UNQUALIFIED_STOCK_WORDS)) { hasUnqualifiedStock = true; }
  }
  return { hasMeat, hasFish, hasNonVeganAnimal, hasGelatine, hasUnqualifiedStock };
}

/* ---------- Dimension A: Ernaehrung/Protein (Punkt 95-99) ----------
   Rueckgabe: Array von { id, confidence } — id ist einer der DIET_OPTIONS-Keys. */
function classifyDietary(recipe) {
  const { hasMeat, hasFish, hasNonVeganAnimal, hasGelatine, hasUnqualifiedStock } = classifyIngredientsForDiet(recipe);
  const results = [];
  if (hasMeat) results.push({ id: 'fleisch', confidence: 'high' });
  if (hasFish) results.push({ id: 'fisch', confidence: 'high' });
  if (!hasMeat && !hasFish) {
    const vegetarianOk = !hasGelatine;
    const veganOk = !hasNonVeganAnimal && !hasGelatine;
    // Unqualifizierte Bouillon/Fond-Nennung: Vegetarisch bleibt moeglich, aber nur mit
    // mittlerer statt hoher Sicherheit — Vegan wird bei Unsicherheit NICHT behauptet.
    if (veganOk && !hasUnqualifiedStock) results.push({ id: 'vegan', confidence: 'high' });
    if (vegetarianOk) results.push({ id: 'vegetarisch', confidence: hasUnqualifiedStock ? 'medium' : 'high' });
  }
  return results;
}

/* ---------- Dimension B/C: Mahlzeit & Gerichtstyp (Punkt 100-101) ----------
   Signale: Titel (staerkstes Signal fuer Gerichtstyp), Zutaten, bestehende Tags. Confidence
   niedriger, wenn nur ein schwaches/indirektes Signal vorliegt (z.B. Zeitpunkt-Ambivalenz bei
   Punkt 126 "Spaghetti Carbonara kann auch mittags gegessen werden"). */
const DISH_TYPE_KEYWORDS = [
  { id: 'pasta', words: ['pasta', 'spaghetti', 'penne', 'fusilli', 'teigwaren', 'lasagne', 'tagliatelle', 'ravioli', 'gnocchi', 'carbonara'] },
  { id: 'rice-dish', words: ['risotto', 'paella', 'reispfanne', 'nasi goreng'] },
  { id: 'soup', words: ['suppe', 'cremesuppe', 'consommé', 'minestrone'] },
  { id: 'salad', words: ['salat'] },
  { id: 'sandwich', words: ['sandwich', 'wrap', 'club sandwich', 'burrito'] },
  { id: 'pizza', words: ['pizza', 'flammkuchen'] },
  { id: 'gratin', words: ['gratin', 'auflauf', 'überbacken', 'ueberbacken'] },
  { id: 'stew', words: ['eintopf', 'gulasch', 'ragout'] },
  { id: 'curry', words: ['curry'] },
  { id: 'bowl', words: ['bowl'] },
  { id: 'burger', words: ['burger'] },
  { id: 'bread', words: ['brot', 'gebäck', 'gebaeck', 'weggli', 'zopf', 'brötchen', 'broetchen'] },
  { id: 'cake', words: ['kuchen', 'torte', 'muffin', 'brownie', 'cupcake'] },
  { id: 'sauce', words: ['sauce', 'dip', 'pesto', 'chutney'] },
  { id: 'drink', words: ['smoothie', 'shake', 'getränk', 'getraenk', 'cocktail', 'limonade'] },
];
const BAKING_HINT_WORDS = ['backen', 'backofen', 'backpapier', 'kuchenform', 'backform'];
const MEAL_TITLE_KEYWORDS = [
  { id: 'breakfast', words: ['frühstück', 'fruehstueck', 'porridge', 'overnight oats', 'müesli', 'muesli', 'pancake', 'pfannkuchen', 'rührei', 'ruehrei'] },
  { id: 'brunch', words: ['brunch'] },
  { id: 'dessert', words: ['dessert', 'nachspeise', 'kuchen', 'torte', 'creme', 'crème', 'mousse', 'tiramisu', 'pudding'] },
  { id: 'snack', words: ['snack', 'fingerfood'] },
];

function textContainsWord(haystackLower, word) {
  const pattern = new RegExp('(^|[^a-zäöüß])' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=[^a-zäöüß]|$)', 'i');
  return pattern.test(haystackLower);
}

function classifyMealAndDish(recipe) {
  const titleLower = (recipe.title || '').toLowerCase();
  const ingredientNames = (recipe.ingredients || []).map((i) => (i.name || '').toLowerCase()).join(' ');
  const stepsText = (recipe.steps || []).map((s) => (s.text || '').toLowerCase()).join(' ');
  const tagsLower = (recipe.tags || []).map((t) => t.toLowerCase());

  const results = [];

  // Gerichtstyp: Titel ist das staerkste Signal (hohe Sicherheit), Zutaten/Tags als
  // Bestaetigung mit mittlerer Sicherheit, wenn der Titel selbst nichts hergibt.
  for (const { id, words } of DISH_TYPE_KEYWORDS) {
    const inTitle = words.some((w) => textContainsWord(titleLower, w));
    const inTagsOrIngredients = words.some((w) => tagsLower.includes(w) || textContainsWord(ingredientNames, w));
    if (inTitle) results.push({ id, confidence: 'high' });
    else if (inTagsOrIngredients) results.push({ id, confidence: 'medium' });
  }
  // "Backen" als Gerichtstyp zusätzlich über Zubereitungs-Signalwörter (Punkt 100),
  // unabhängig vom Titel — z.B. "Brot"/"Kuchen" haben das ohnehin schon über den Titel.
  if (!results.some((r) => r.id === 'bread' || r.id === 'cake')) {
    if (BAKING_HINT_WORDS.some((w) => textContainsWord(stepsText, w) || textContainsWord(titleLower, w))) {
      results.push({ id: 'baking', confidence: 'medium' });
    }
  }

  // Mahlzeit: bewusst zurueckhaltender als Gerichtstyp (Punkt 126 — "Abendessen" nur bei
  // ausreichender Sicherheit, da viele Gerichte zeitlich nicht eindeutig sind). Nur klare
  // Signalwoerter (Fruehstueck/Dessert/Snack/Brunch) werden automatisch gesetzt; Mittag/Abend
  // wird NICHT geraten, wenn der Text selbst keinen Hinweis gibt.
  for (const { id, words } of MEAL_TITLE_KEYWORDS) {
    if (words.some((w) => textContainsWord(titleLower, w))) results.push({ id, confidence: 'high' });
  }

  return results;
}

/* Haupteinstieg: liefert ALLE automatisch erkannten Kategorien (Ernaehrung getrennt, Mahlzeit+
   Gerichtstyp kombiniert, da recipe.categoryTags beide gemeinsam speichert). Wendet auf Wunsch
   einen Mindest-Confidence-Filter an (Punkt 101: "bei schwachen Kategorien nicht blind setzen"). */
function classifyRecipe(recipe) {
  const dietary = classifyDietary(recipe);
  const category = classifyMealAndDish(recipe);
  return { dietary, category };
}

/* Wendet eine Klassifikation additiv auf ein Rezept an: bestehende manuelle Eintraege bleiben
   IMMER erhalten, vom Nutzer bewusst entfernte Kategorien (recipe.suppressedTags) werden NICHT
   erneut hinzugefuegt (Punkt 102, 122). Nur high/medium-Confidence-Treffer werden uebernommen —
   low-Confidence-Vorschlaege muesste der Aufrufer separat anzeigen, ohne sie zu speichern. */
function applyClassification(recipe, classification, { minConfidence = 'medium' } = {}) {
  const rank = { high: 3, medium: 2, low: 1 };
  const threshold = rank[minConfidence] || 2;
  const suppressed = new Set(recipe.suppressedTags || []);

  const dietIds = new Set(recipe.diet || []);
  for (const { id, confidence } of classification.dietary) {
    if (rank[confidence] >= threshold && !suppressed.has(id)) dietIds.add(id);
  }
  recipe.diet = Array.from(dietIds);

  const categoryIds = new Set(recipe.categoryTags || []);
  for (const { id, confidence } of classification.category) {
    if (rank[confidence] >= threshold && !suppressed.has(id)) categoryIds.add(id);
  }
  recipe.categoryTags = Array.from(categoryIds);

  return recipe;
}

/* Fuer die Import-Vorschau (Punkt 114): liefert zusaetzlich die NICHT uebernommenen
   Low-Confidence-Vorschlaege, damit sie als "? Vorschlag, bitte pruefen" angezeigt werden
   koennen, ohne sie automatisch zu setzen. */
function lowConfidenceSuggestions(classification) {
  return [...classification.dietary, ...classification.category].filter((c) => c.confidence === 'low');
}
