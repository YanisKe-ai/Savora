/* ---------- Nutrition: Berechnungsengine (Implementierungsauftrag Punkt 16-23) ---------- */

const NUTRITION_CALC_VERSION = 2;   // 2: Zuordnung ueber Alias-Tabelle, Richtdichten; Ergebnisse aus Version 1 gelten als veraltet

/* Zeilen, die erkennbar keine berechenbare Menge tragen ("Salz nach Geschmack", "etwas
   Butter", "eine Handvoll Nüsse", ...) fliessen NICHT als Fehler, sondern als bewusst
   ausgeschlossen in die Berechnung ein — sie duerfen keine erfundenen Grammwerte erzeugen
   (Punkt 78 "Unknown Tests"). Erkennung ueber den Zutatentext, nicht ueber amount/unit
   allein, da z.B. "Pfeffer nach Geschmack" oft ganz ohne amount/unit-Felder erfasst wird. */
const QUALITATIVE_AMOUNT_PATTERN = /nach\s+geschmack|nach\s+belieben|ein(e)?\s+schuss|etwas\b|eine\s+handvoll|prise\s*$/i;

/* Kleinstmenge eines Gewuerzes/Triebmittels? (Prise, Messerspitze, bis 1 EL/3 TL, bis 10 g, ohne Menge) */
function isNegligibleAmount(ing) {
  const amt = parseAmount(ing.amount);
  if (amt === null || isNaN(amt)) return true;
  const kind = normalizeNutritionUnit(ing.unit);
  if (kind === 'g') return amt <= NUTRITION_NEGLIGIBLE_MAX_GRAMS;
  if (kind === 'tsp') return amt <= 3;
  if (kind === 'tbsp') return amt <= 1;
  if (kind === 'pinch' || kind === 'splash') return true;
  if (kind === 'pack' || kind === 'piece' || kind === 'clove' || kind === 'bunch' || kind === 'handful' || String(ing.unit || '').trim() === '') return amt <= 5;
  return false;
}

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
  // Gruppentitel wie "Teig:" sind keine Zutaten und duerfen nicht als "ungeklaert" zaehlen.
  const ingredients = (recipe.ingredients || []).filter(i => !(typeof isIngredientHeaderRow === 'function' && isIngredientHeaderRow(i)));
  const servings = Number(recipe.servings) > 0 ? Number(recipe.servings) : 1;

  const totals = {};
  const known = {};
  let totalWeightGrams = 0;
  let matchedCount = 0;
  let estimatedCount = 0;
  let unresolvedCount = 0;
  let skippedCount = 0;
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

    let match = await matchIngredient(ing.name, recipe.steps);
    if (match.skipped) {
      // Wasser und Gewuerze in Kleinstmengen: nicht mitrechnen, kein Fehler. Grosse Mengen eines
      // Gewuerz-Begriffs (z.B. 100 g Kraeuter) werden dagegen normal gesucht.
      if (match.skipped === 'negligible' && !isNegligibleAmount(ing)) match = await matchIngredient(ing.name, recipe.steps, { ignoreNegligible: true });
      else { skippedCount++; continue; }
    }
    relevantCount++;
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
  if (unresolvedCount > 0) confidence = (relevantCount > 0 && unresolvedCount / relevantCount <= 0.25) ? 'medium' : 'low';   // eine einzelne Lücke macht die Zahl nicht wertlos
  else if (estimatedCount > 0 || per100Estimated) confidence = 'medium';

  const confidenceDetail = relevantCount === 0
    ? 'Keine berechenbaren Zutaten gefunden.'
    : `${matchedCount}/${relevantCount} Zutaten eindeutig erkannt` +
      (estimatedCount > 0 ? `, bei ${estimatedCount} die Menge geschätzt (Stück, Löffel oder Packung)` : '') +
      (skippedCount > 0 ? `, ${skippedCount} nicht mitgerechnet (Wasser, Gewürze)` : '') +
      (unresolvedCount > 0 ? `, ${unresolvedCount} ungeklärt` : '') +
      (per100Estimated ? ', Fertiggewicht geschätzt' : ', Fertiggewicht bekannt');

  return {
    recipeId: recipe.id,
    nutritionCalcVersion: NUTRITION_CALC_VERSION,
    ingredientHash: hashIngredientsForNutrition(ingredients, servings),
    // Punkt 3 (Reparatur-Auftrag): vorher wurden nur Swiss-FCD-Quellen im Ergebnis behalten —
    // war eine Zutat ausschliesslich per Open-Food-Facts-Barcode oder als Custom Food erfasst,
    // verschwand das komplett und die Quellenzeile zeigte faelschlich "Berechnete
    // Durchschnittswerte" statt der tatsaechlich verwendeten Quelle.
    sourceDataVersions: buildSourceDataVersions(sourcesUsed),
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
    complete: unresolvedCount === 0 && relevantCount > 0,
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
  if ((stored.nutritionCalcVersion || 1) < NUTRITION_CALC_VERSION) return null;   // mit aelterer Berechnung erstellt
  return stored;
}

/* Einheitlicher Status fuer App, Vorschau und PDF:
     not-calculated  nie berechnet (nicht dasselbe wie 0)
     calculated      aktuell und alle relevanten Zutaten eingerechnet
     incomplete      aktuell, aber Zutaten fehlen -> keine Portionssumme anzeigen
     stale           Zutaten/Portionen geaendert oder mit aelterer Berechnung erstellt
     failed          Speicher nicht lesbar */
async function nutritionStatusFor(recipe) {
  let stored = null;
  try { stored = await dbGetNutritionResult(recipe.id); } catch (e) { return { status: 'failed', result: null }; }
  if (!stored) return { status: 'not-calculated', result: null };
  const servings = Number(recipe.servings) > 0 ? Number(recipe.servings) : 1;
  const hashOk = stored.ingredientHash === hashIngredientsForNutrition(recipe.ingredients || [], servings);
  if (!hashOk || (stored.nutritionCalcVersion || 1) < NUTRITION_CALC_VERSION) return { status: 'stale', result: stored };
  const complete = stored.relevantCount > 0 && !(stored.unresolvedCount > 0);
  return { status: complete ? 'calculated' : 'incomplete', result: stored };
}
