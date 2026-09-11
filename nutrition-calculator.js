/* ---------- Nutrition: Berechnungsengine (Implementierungsauftrag Punkt 16-23) ---------- */

const NUTRITION_CALC_VERSION = 1;

/* Zeilen, die erkennbar keine berechenbare Menge tragen ("Salz nach Geschmack", "etwas
   Butter", "eine Handvoll Nüsse", ...) fliessen NICHT als Fehler, sondern als bewusst
   ausgeschlossen in die Berechnung ein — sie duerfen keine erfundenen Grammwerte erzeugen
   (Punkt 78 "Unknown Tests"). Erkennung ueber den Zutatentext, nicht ueber amount/unit
   allein, da z.B. "Pfeffer nach Geschmack" oft ganz ohne amount/unit-Felder erfasst wird. */
const QUALITATIVE_AMOUNT_PATTERN = /nach\s+geschmack|nach\s+belieben|ein(e)?\s+schuss|etwas\b|eine\s+handvoll|prise\s*$/i;

function isQualitativeIngredient(ing) {
  const amt = parseAmount(ing.amount);
  if (amt !== null && !isNaN(amt)) return false; // hat eine konkrete Zahl -> nicht qualitativ
  return QUALITATIVE_AMOUNT_PATTERN.test(ing.name || '') || QUALITATIVE_AMOUNT_PATTERN.test(ing.amount || '');
}

/* Einfacher, stabiler Hash ueber die berechnungsrelevanten Zutatendaten (fuer
   "Naehrwerte veraltet"-Erkennung, Punkt 23) — bewusst kein Crypto-Hash, nur
   Aenderungserkennung noetig. */
function hashIngredientsForNutrition(ingredients, servings) {
  const relevant = (ingredients || []).map((i) => `${i.amount}|${i.unit}|${(i.name || '').trim().toLowerCase()}`).join(';');
  const input = relevant + '::' + servings;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return 'h' + hash.toString(36);
}

function addNutrientContribution(totals, known, food, grams) {
  for (const key of Object.keys(NUTRIENT_KEYS)) {
    const per100 = food.nutrientsPer100g ? food.nutrientsPer100g[key] : null;
    if (per100 === null || per100 === undefined) continue; // fehlender Wert bleibt fehlend, wird nicht als 0 gezaehlt
    const contribution = (per100 * grams) / 100;
    totals[key] = (totals[key] || 0) + contribution;
    known[key] = true;
  }
}

/* Berechnet die Naehrwerte eines Rezepts. `recipe` braucht mindestens { ingredients, servings }.
   Optional: recipe.nutritionFinishedWeight (Gramm, Punkt 18) fuer ein exaktes "pro 100g".
   Ruft KEINE UI-Funktionen auf und speichert NICHTS in der DB — das macht der Aufrufer
   (siehe recalculateAndStoreNutrition), damit diese Funktion auch fuer Vorschau/Tests
   ohne Nebenwirkungen nutzbar ist. */
async function calculateRecipeNutrition(recipe) {
  const ingredients = recipe.ingredients || [];
  const servings = Number(recipe.servings) > 0 ? Number(recipe.servings) : 1;

  const totals = {};
  const known = {};
  let totalWeightGrams = 0;
  let matchedCount = 0;
  let estimatedCount = 0;
  let unresolvedCount = 0;
  let relevantCount = 0;
  const unresolvedIngredients = [];
  const sourcesUsed = new Set();

  for (const ing of ingredients) {
    if (!ing || !ing.name || !ing.name.trim()) continue;
    if (isQualitativeIngredient(ing)) continue; // bewusst ausgeschlossen, kein Fehler

    const ingredientInfo = normalizeIngredientPhrase(ing.name);
    // Punkt 42: optionale Zutaten ("nach Belieben", "wer mag", ...) NICHT automatisch in die
    // Naehrwerte einrechnen, solange unklar ist, ob sie tatsaechlich verwendet wurden — genauso
    // bewusst ausgeschlossen wie eine vage Mengenangabe, kein Fehler/Confidence-Abzug.
    if (ingredientInfo.optional) continue;
    relevantCount++;

    const match = await matchIngredient(ing.name, recipe.steps);
    if (match.status === 'unmatched' || !match.food) {
      unresolvedCount++;
      unresolvedIngredients.push({ name: ing.name, reason: 'not-found' });
      continue;
    }

    const grams = resolveIngredientGrams(ing, match.food);
    if (grams.grams === null) {
      unresolvedCount++;
      unresolvedIngredients.push({ name: ing.name, reason: grams.reason });
      continue;
    }
    if (match.status === 'uncertain') {
      unresolvedCount++;
      unresolvedIngredients.push({ name: ing.name, reason: 'uncertain-match', candidate: match.food.name });
      // Trotzdem NICHT in die Summe aufnehmen — ein unsicherer Match soll die Zahl nicht verfaelschen.
      continue;
    }

    matchedCount++;
    if (grams.estimated) estimatedCount++;
    totalWeightGrams += grams.grams;
    addNutrientContribution(totals, known, match.food, grams.grams);
    sourcesUsed.add(match.food.source);
  }

  // Fehlende Naehrwerte bleiben null statt 0 (Punkt 5/26), auch in der Summe.
  const nutrientsTotal = {};
  for (const key of Object.keys(NUTRIENT_KEYS)) {
    nutrientsTotal[key] = known[key] ? totals[key] : null;
  }

  const finishedWeight = typeof recipe.nutritionFinishedWeight === 'number' && recipe.nutritionFinishedWeight > 0
    ? recipe.nutritionFinishedWeight
    : null;
  const per100Base = finishedWeight || (totalWeightGrams > 0 ? totalWeightGrams : null);
  const per100Estimated = !finishedWeight;

  const nutrientsPerPortion = {};
  const nutrientsPer100g = {};
  for (const key of Object.keys(NUTRIENT_KEYS)) {
    const total = nutrientsTotal[key];
    nutrientsPerPortion[key] = total === null ? null : roundNutrientForDisplay(total / servings);
    nutrientsPer100g[key] = (total === null || !per100Base) ? null : roundNutrientForDisplay((total / per100Base) * 100);
  }

  // Confidence (Punkt 22): nur Farbe reicht nicht — konkrete Begruendung mitliefern.
  let confidence = 'high';
  if (unresolvedCount > 0) confidence = 'low';
  else if (estimatedCount > 0 || per100Estimated) confidence = 'medium';

  const confidenceDetail = relevantCount === 0
    ? 'Keine berechenbaren Zutaten gefunden.'
    : `${matchedCount}/${relevantCount} Zutaten eindeutig erkannt` +
      (estimatedCount > 0 ? `, ${estimatedCount} Stückgewicht geschätzt` : '') +
      (unresolvedCount > 0 ? `, ${unresolvedCount} ungeklärt` : '') +
      (per100Estimated ? ', Fertiggewicht geschätzt' : ', Fertiggewicht bekannt');

  return {
    recipeId: recipe.id,
    nutritionCalcVersion: NUTRITION_CALC_VERSION,
    ingredientHash: hashIngredientsForNutrition(ingredients, servings),
    sourceDataVersions: sourcesUsed.has('swiss-fcd') ? { 'swiss-fcd': SWISS_FCD_VERSION } : {},
    calculatedAt: Date.now(),
    servings,
    totalWeight: totalWeightGrams > 0 ? roundNutrientForDisplay(totalWeightGrams) : null,
    finishedWeight,
    per100Estimated,
    confidence,
    confidenceDetail,
    matchedCount,
    estimatedCount,
    unresolvedCount,
    relevantCount,
    unresolvedIngredients,
    nutrientsTotal,
    nutrientsPerPortion,
    nutrientsPer100g,
  };
}

/* Berechnet und speichert das Ergebnis in nutritionResults (Punkt 23 "versionieren"). */
async function recalculateAndStoreNutrition(recipe) {
  const result = await calculateRecipeNutrition(recipe);
  await dbPutNutritionResult(result);
  return result;
}

/* Liefert das gespeicherte Ergebnis, aber nur wenn es noch zum aktuellen Rezeptstand passt
   (sonst null -> Aufrufer weiss "Naehrwerte veraltet, neu berechnen" ist noetig, Punkt 23). */
async function getFreshNutritionResult(recipe) {
  const stored = await dbGetNutritionResult(recipe.id);
  if (!stored) return null;
  const servings = Number(recipe.servings) > 0 ? Number(recipe.servings) : 1;
  const currentHash = hashIngredientsForNutrition(recipe.ingredients || [], servings);
  if (stored.ingredientHash !== currentHash) return null;
  return stored;
}
