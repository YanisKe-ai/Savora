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

/* Kernfunktion: ordnet einen einzelnen Zutatennamen einem Lebensmittel zu. Nutzt zuerst den
   Ingredient-Intelligence-Normalizer (ingredient-normalizer.js, Master-Prompt Teil B/C), um
   z.B. "100 g weiche Butter" auf den Kern "Butter" + Deskriptor "weich" zu reduzieren, bevor
   ueberhaupt gesucht wird. `steps` (optional) sind die Zubereitungsschritte des Rezepts — wird
   daraus eine Zubereitungsart erkannt (Punkt 21), fliesst sie NUR ein, wenn die Zutatenzeile
   selbst noch keinen expliziten ernaehrungsrelevanten Zustand nennt (die explizite Angabe in
   der Zutat selbst hat Vorrang vor der aus dem Fliesstext erratenen). */
async function matchIngredient(rawName, steps) {
  const normalized = normalizeIngredientText(rawName);
  if (!normalized) {
    return { normalized, status: 'unmatched', food: null, candidates: [], confirmed: false, preparation: null, ingredientInfo: null };
  }
  const ingredientInfo = normalizeIngredientPhrase(rawName);
  const preparation = (!ingredientInfo.nutritionRelevantStates.length && steps)
    ? detectIngredientPreparation(rawName, steps)
    : null;

  // 1) Bestaetigte Zuordnung hat Vorrang vor jeder automatischen Suche. Bewusst weiterhin ueber
  //    den vollen Originaltext normalisiert (nicht den bereinigten Kern) — eine einmal vom
  //    Nutzer bestaetigte Zeile soll exakt wiedererkannt werden (Punkt 89).
  const confirmed = await dbGetNutritionMatch(normalized);
  if (confirmed && confirmed.foodId) {
    const food = await findFoodById(confirmed.foodId);
    if (food) return { normalized, status: 'matched', food, candidates: [food], confirmed: true, preparation, ingredientInfo };
  }

  // 2) Eigene Lebensmittel vor der generischen Datenbank.
  const customHits = await searchCustomFoods(rawName, 5);
  if (customHits.length) {
    const exact = customHits.find((f) => normalizeIngredientText(f.name) === normalized);
    if (exact) return { normalized, status: 'matched', food: exact, candidates: customHits, confirmed: false, preparation, ingredientInfo };
  }

  // 3) Schweizer Naehrwertdatenbank — Suchbegriff ist der vom Normalizer bereinigte Kern
  //    (+ erhaltene ernaehrungsrelevante Zustaende, Punkt 78), nicht der rohe Zutatentext.
  //    Bekannte Alltagsbegriffe (Punkt 77) werden zusaetzlich auf den KERN angewendet — das
  //    behebt nebenbei einen Fall, den die reine Rohtext-Version nicht abdeckte: "Eier,
  //    verquirlt" hat als Rohtext keinen exakten Alias-Treffer, der bereinigte Kern "eier" schon.
  const canonicalBase = ingredientInfo.searchQuery || normalized;
  const aliasExpansion = expandIngredientQuery(ingredientInfo.canonicalIngredient || rawName) || expandIngredientQuery(rawName);
  const baseQuery = aliasExpansion || canonicalBase;
  // Erkannte Zubereitung aus den Schritten als Zusatzwort anhaengen (Punkt 15/21) — nur wenn
  // oben kein expliziter Zustand aus der Zutatenzeile selbst vorlag.
  const searchQuery = preparation ? baseQuery + ' ' + preparation.method : baseQuery;
  let scoredHits = await searchSwissFoodsWithScores(searchQuery, 8);
  if (searchQuery !== baseQuery && !scoredHits.length) scoredHits = await searchSwissFoodsWithScores(baseQuery, 8);
  // Letzter Fallback: falls die Normalisierung fuer einen (noch) unbekannten Begriff zu
  // aggressiv war, zur Sicherheit auch den unveraenderten Rohtext probieren.
  if (!scoredHits.length && normalizeIngredientText(searchQuery) !== normalized) {
    scoredHits = await searchSwissFoodsWithScores(rawName, 8);
  }
  const swissHits = scoredHits.map((s) => s.food);
  const candidates = [...customHits, ...swissHits];
  if (!candidates.length) {
    return { normalized, status: 'unmatched', food: null, candidates: [], confirmed: false, preparation, ingredientInfo };
  }
  const top = swissHits[0];
  // Der tatsaechlich ermittelte Score (inkl. Synonym-/EN-Bonus) wird wiederverwendet statt ihn
  // ueber food.name allein neu zu berechnen — sonst ginge ein Treffer ueber ein offizielles
  // BLV-Synonym (z.B. "Butter" -> "Vorzugsbutter") als "unsicher" statt "sicher" durch.
  const topScore = scoredHits.length ? scoredHits[0].score : -1;
  if (topScore >= NUTRITION_MATCH_SCORE_CONFIDENT) {
    return { normalized, status: 'matched', food: top, candidates, confirmed: false, preparation, ingredientInfo };
  }
  return { normalized, status: 'uncertain', food: candidates[0], candidates, confirmed: false, preparation, ingredientInfo };
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
