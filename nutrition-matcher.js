/* ---------- Nutrition: Matching-Engine (Implementierungsauftrag Punkt 8-9, 14, 72-73) ----------
   Prioritaet bei der Zuordnung eines Zutatentexts zu einem Lebensmittel:
     1. Eigenes Lebensmittel (customFoods) — hoechste Prioritaet (Punkt 9)
     2. Bereits bestaetigte Zuordnung (nutritionMatches) — Savora lernt aus Korrekturen (Punkt 8)
     3. Schweizer Naehrwertdatenbank (automatische Suche, Punkt 2.1)
   Status pro Zutat (Punkt 14):
     "matched"   — sicher erkannt (bestaetigt ODER eindeutiger Treffer)
     "uncertain" — mehrere/unsichere Kandidaten, Nutzer sollte pruefen
     "unmatched" — kein Treffer, Nutzer muss auswaehlen oder eigenes Lebensmittel anlegen */

const NUTRITION_MATCH_SCORE_CONFIDENT = 55; // ab diesem Score (neue Stamm-Skala) gilt ein Treffer als "matched"
const NUTRITION_MATCH_SCORE_MIN = 15;       // darunter wird gar kein Kandidat mehr vorgeschlagen

/* Alltags-/Umgangsbegriffe, die nicht wortgleich mit der BLV-Nomenklatur sind und daher auch
   mit Stamm-Matching nicht gefunden wuerden (z.B. "Poulet" statt "Poulet, Brust, ...", "Ei"
   statt "Hühnerei"). Bewusst klein und kuratiert — erweitert die SUCHANFRAGE, erfindet keine
   Naehrwerte. Deckt die in Punkt 77 geforderten Testfaelle ab. */
const INGREDIENT_ALIAS_HINTS = {
  'ei': 'hühnerei',
  'eier': 'hühnerei',
  'pouletbrust': 'poulet brust',
  'hähnchenbrust': 'poulet brust',
  'hühnerbrust': 'poulet brust',
  'chicken breast': 'poulet brust',
  'hackfleisch': 'gehacktes',
  'pasta': 'teigwaren',
  'spaghetti': 'teigwaren',
  'nudeln': 'teigwaren',
  'penne': 'teigwaren',
};

function expandIngredientQuery(rawName) {
  const normalized = normalizeIngredientText(rawName);
  return INGREDIENT_ALIAS_HINTS[normalized] || null;
}

async function findFoodById(id) {
  if (!id) return null;
  if (id.startsWith('custom-')) {
    const all = await dbGetAllCustomFoods();
    return all.find((f) => f.id === id) || null;
  }
  if (id.startsWith('off-')) {
    return dbGetNutritionFood(id); // Open-Food-Facts-Treffer liegen direkt in IndexedDB (kein In-Memory-Cache noetig, selten mehrfach abgefragt)
  }
  return getSwissFoodById(id);
}

/* Durchsucht Custom Foods (einfache Substring-Suche, i.d.R. wenige Eintraege). */
async function searchCustomFoods(query, limit = 10) {
  const q = normalizeIngredientText(query);
  if (!q) return [];
  const all = await dbGetAllCustomFoods();
  return all
    .filter((f) => normalizeIngredientText(f.name).includes(q))
    .slice(0, limit);
}

/* Fuer den manuellen Auswahldialog (Punkt 72): Custom Foods zuerst, dann Schweizer DB. */
async function searchAllFoods(query, limit = 20) {
  const [custom, swiss] = await Promise.all([
    searchCustomFoods(query, limit),
    searchSwissFoods(query, limit),
  ]);
  return [...custom, ...swiss].slice(0, limit);
}

/* Kernfunktion: ordnet einen einzelnen Zutatennamen einem Lebensmittel zu. `steps` (optional)
   sind die Zubereitungsschritte des Rezepts — wird eine Zubereitungsart erkannt (Punkt 21),
   fliesst sie als zusaetzliches Suchwort ein (praeziserer Treffer, siehe nutrition-preparation.js). */
async function matchIngredient(rawName, steps) {
  const normalized = normalizeIngredientText(rawName);
  if (!normalized) {
    return { normalized, status: 'unmatched', food: null, candidates: [], confirmed: false, preparation: null };
  }
  const preparation = steps ? detectIngredientPreparation(rawName, steps) : null;

  // 1) Bestaetigte Zuordnung hat Vorrang vor jeder automatischen Suche.
  const confirmed = await dbGetNutritionMatch(normalized);
  if (confirmed && confirmed.foodId) {
    const food = await findFoodById(confirmed.foodId);
    if (food) return { normalized, status: 'matched', food, candidates: [food], confirmed: true, preparation };
  }

  // 2) Eigene Lebensmittel vor der generischen Datenbank.
  const customHits = await searchCustomFoods(rawName, 5);
  if (customHits.length) {
    const exact = customHits.find((f) => normalizeIngredientText(f.name) === normalized);
    if (exact) return { normalized, status: 'matched', food: exact, candidates: customHits, confirmed: false, preparation };
  }

  // 3) Schweizer Naehrwertdatenbank — bei bekannten Alltagsbegriffen (Punkt 77) zusaetzlich
  //    mit der erweiterten Anfrage suchen, da die BLV-Nomenklatur oft anders lautet
  //    (z.B. "Poulet, Brust, ..." statt "Pouletbrust", "Hühnerei" statt "Ei").
  const aliasExpansion = expandIngredientQuery(rawName);
  const baseQuery = aliasExpansion || rawName;
  // Erkannte Zubereitung als Zusatzwort anhaengen (Punkt 15/21) — nutzt dieselbe Wortstamm-
  // Suche wie z.B. "Reis trocken" vs. "Reis gekocht" (siehe nutrition-swiss.js), macht das
  // Matching praeziser statt es zu ersetzen: ohne Treffer greift die normale Suche weiter unten.
  const searchQuery = preparation ? baseQuery + ' ' + preparation.method : baseQuery;
  let swissHits = await searchSwissFoods(searchQuery, 8);
  if (preparation && !swissHits.length) swissHits = await searchSwissFoods(baseQuery, 8); // Zubereitung fand nichts -> normale Suche als Fallback
  const candidates = [...customHits, ...swissHits];
  if (!candidates.length) {
    return { normalized, status: 'unmatched', food: null, candidates: [], confirmed: false, preparation };
  }
  const top = swissHits[0];
  const topScore = top ? scoreNameMatch(searchQuery, top.name) : -1;
  if (topScore >= NUTRITION_MATCH_SCORE_CONFIDENT) {
    return { normalized, status: 'matched', food: top, candidates, confirmed: false, preparation };
  }
  return { normalized, status: 'uncertain', food: candidates[0], candidates, confirmed: false, preparation };
}

/* Ordnet mehrere Zutaten in einem Rutsch zu (fuer den Matching-Screen, Punkt 71). */
async function matchIngredients(ingredients, steps) {
  const results = [];
  for (const ing of ingredients) {
    const result = await matchIngredient(ing.name, steps);
    results.push({ ingredient: ing, ...result });
  }
  return results;
}

/* Nutzer bestaetigt/aendert eine Zuordnung manuell (Punkt 72-73) — wird ab sofort bevorzugt. */
async function confirmIngredientMatch(rawName, foodId) {
  const normalized = normalizeIngredientText(rawName);
  if (!normalized) return null;
  const match = { normalizedIngredient: normalized, foodId, confirmedByUser: true, updatedAt: Date.now() };
  await dbPutNutritionMatch(match);
  return match;
}

/* Nutzer setzt eine gelernte Zuordnung zurueck (Punkt 73: "muss spaeter zuruecksetzen koennen"). */
async function resetIngredientMatch(rawName) {
  const normalized = normalizeIngredientText(rawName);
  if (!normalized) return;
  await dbDeleteNutritionMatch(normalized);
}

/* ---------- Custom Foods (Punkt 9) ---------- */
function createCustomFoodId() {
  return 'custom-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

/* Erstellt/aktualisiert ein eigenes Lebensmittel im selben normalisierten Format wie
   die Schweizer Datenquelle. `nutrientsPer100g` sollte vollstaendig mit emptyNutrients()
   vorbefuellt uebergeben werden, damit fehlende Felder null bleiben statt zu fehlen. */
async function saveCustomFood(data) {
  const id = data.id || createCustomFoodId();
  const food = {
    id,
    source: 'custom',
    sourceId: id,
    name: (data.name || '').trim(),
    language: 'de',
    synonyms: data.synonyms || [],
    category: data.category || null,
    brand: data.brand || null,
    barcode: data.barcode || null,
    density: typeof data.density === 'number' ? data.density : null,
    nutrientsPer100g: { ...emptyNutrients(), ...(data.nutrientsPer100g || {}) },
    updatedAt: Date.now(),
  };
  await dbPutCustomFood(food);
  return food;
}

async function deleteCustomFood(id) {
  await dbDeleteCustomFood(id);
}
