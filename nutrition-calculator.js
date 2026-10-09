/* ---------- Nutrition: Berechnungsengine (Implementierungsauftrag Punkt 16-23) ---------- */

const NUTRITION_CALC_VERSION = 3;   // 2: Zuordnung ueber Alias-Tabelle, Richtdichten; 3: Mengenbereiche als Spanne, keine stille Portion 1; aeltere Ergebnisse gelten als veraltet

/* Zeilen, die erkennbar keine berechenbare Menge tragen ("Salz nach Geschmack", "etwas
   Butter", "eine Handvoll Nüsse", ...) fliessen NICHT als Fehler, sondern als bewusst
   ausgeschlossen in die Berechnung ein — sie duerfen keine erfundenen Grammwerte erzeugen
   (Punkt 78 "Unknown Tests"). Erkennung ueber den Zutatentext, nicht ueber amount/unit
   allein, da z.B. "Pfeffer nach Geschmack" oft ganz ohne amount/unit-Felder erfasst wird. */
const QUALITATIVE_AMOUNT_PATTERN = /nach\s+geschmack|nach\s+belieben|ein(e)?\s+schuss|etwas\b|eine\s+handvoll|prise\s*$/i;

/* Kleinstmenge eines Gewuerzes/Triebmittels? (Prise, Messerspitze, bis 1 EL/3 TL, bis 10 g, ohne Menge) */
function isNegligibleAmount(ing) {
  const q = qtyFromIngredient(ing);
  if (!qtyIsNumeric(q)) return true;
  const amt = q.max;   // bei einem Bereich zaehlt die Obergrenze: nur vernachlaessigbar, wenn auch sie es ist
  const kind = normalizeNutritionUnit(ing.unit);
  if (kind === 'g') return amt <= NUTRITION_NEGLIGIBLE_MAX_GRAMS;
  if (kind === 'tsp') return amt <= 3;
  if (kind === 'tbsp') return amt <= 1;
  if (kind === 'pinch' || kind === 'splash') return true;
  if (kind === 'pack' || kind === 'piece' || kind === 'clove' || kind === 'bunch' || kind === 'handful' || String(ing.unit || '').trim() === '') return amt <= 5;
  return false;
}

function isQualitativeIngredient(ing) {
  if (qtyIsNumeric(qtyFromIngredient(ing))) return false; // hat eine konkrete Zahl oder einen Bereich -> nicht qualitativ
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
const nutRound = (v) => roundNutrientForDisplay(v);

/* Berechnet die Naehrwerte eines Rezepts. `recipe` braucht mindestens { ingredients, servings }.
   Optional: recipe.nutritionFinishedWeight (Gramm, Punkt 18) fuer ein exaktes "pro 100g".
   Ruft KEINE UI-Funktionen auf und speichert NICHTS in der DB — das macht der Aufrufer
   (siehe recalculateAndStoreNutrition), damit diese Funktion auch fuer Vorschau/Tests
   ohne Nebenwirkungen nutzbar ist. */
async function calculateRecipeNutrition(recipe) {
  // Gruppentitel wie "Teig:" sind keine Zutaten und duerfen nicht als "ungeklaert" zaehlen.
  const ingredients = (recipe.ingredients || []).filter(i => !(typeof isIngredientHeaderRow === 'function' && isIngredientHeaderRow(i)));
  const needsServings = !(Number(recipe.servings) > 0);   // unbekannte Ausbeute: keine stille 1, keine Pro-Portion-Werte
  const servings = needsServings ? 1 : Number(recipe.servings);   // nur fuer den Hash (stabil zu frueher); wird nie als Teiler benutzt, wenn needsServings

  const totals = {};      // Untergrenze (= exakter Wert, solange kein Bereich im Spiel ist)
  const totalsMax = {};   // Obergrenze
  const known = {};
  let totalWeightGrams = 0;
  let totalWeightMax = 0;
  let rangeCount = 0;
  let matchedCount = 0;
  let estimatedCount = 0;
  let unresolvedCount = 0;
  let skippedCount = 0;
  const unquantified = [];
  const approximations = [];
  let relevantCount = 0;
  const unresolvedIngredients = [];
  const sourcesUsed = new Set();

  for (const rawIng of ingredients) {
    if (!rawIng || !rawIng.name || !rawIng.name.trim()) continue;
    const ing = Object.assign({}, rawIng, nutPrepareIngredient(rawIng));   // Import-Formen zusammenfassen (Saft von 1/2 Zitrone, Becher (200 ml) ...)
    if (isQualitativeIngredient(ing)) continue; // bewusst ausgeschlossen, kein Fehler

    const ingredientInfo = normalizeIngredientPhrase(ing.name);
    // Punkt 42: optionale Zutaten ("nach Belieben", "wer mag", ...) NICHT automatisch in die
    // Naehrwerte einrechnen, solange unklar ist, ob sie tatsaechlich verwendet wurden — genauso
    // bewusst ausgeschlossen wie eine vage Mengenangabe, kein Fehler/Confidence-Abzug.
    if (ingredientInfo.optional || /^\s*(optional|evtl\.?|eventuell|wer mag)\b/i.test(ing.name)) continue;

    let match = await matchIngredient(ing.name, recipe.steps);
    if (match.skipped) {
      // Wasser und Gewuerze in Kleinstmengen: nicht mitrechnen, kein Fehler. Grosse Mengen eines
      // Gewuerz-Begriffs (z.B. 100 g Kraeuter) werden dagegen normal gesucht.
      if (match.skipped === 'negligible' && !isNegligibleAmount(ing)) match = await matchIngredient(ing.name, recipe.steps, { ignoreNegligible: true });
      else { skippedCount++; continue; }
    }
    // Ohne Mengenangabe laesst sich nichts berechnen: transparent auflisten statt das ganze Ergebnis zu blockieren
    if (!qtyIsNumeric(qtyFromIngredient(ing))) {
      // Nur echte, erkannte Zutaten auflisten; Fliesstext-Zeilen ("Alles mischen") und Gewuerze ohne Menge werden still uebergangen
      if (match.food && (match.viaAlias || match.confirmed || String(ing.name).trim().split(/\s+/).length <= 3) && !/\b(salz|pfeffer|muskat|gewürz\w*|kräuter\w*|zimt|curry\w*|paprikapulver)\b/i.test(ing.name)) unquantified.push(ing.name);
      continue;
    }
    relevantCount++;
    if (match.status === 'unmatched' || !match.food) {
      unresolvedCount++;
      unresolvedIngredients.push({ name: ing.name, reason: 'not-found' });
      continue;
    }

    const grams = resolveIngredientGrams(ing, match.food);
    const gMin = grams.range ? grams.gramsMin : grams.grams;
    const gMax = grams.range ? grams.gramsMax : grams.grams;
    if (gMin === null || gMin === undefined || gMax === null || gMax === undefined) {
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
    if (match.approx && match.food) approximations.push({ name: ing.name, food: match.food.name });
    if (grams.estimated) estimatedCount++;
    if (grams.range) rangeCount++;
    totalWeightGrams += gMin;
    totalWeightMax += gMax;
    addNutrientContribution(totals, known, match.food, gMin);
    addNutrientContribution(totalsMax, {}, match.food, gMax);
    sourcesUsed.add(match.food.source);
  }

  // Fehlende Naehrwerte bleiben null statt 0 (Punkt 5/26), auch in der Summe.
  const rangeUsed = rangeCount > 0;
  const finishedWeight = typeof recipe.nutritionFinishedWeight === 'number' && recipe.nutritionFinishedWeight > 0
    ? recipe.nutritionFinishedWeight
    : null;
  const per100Estimated = !finishedWeight;
  const wMin = finishedWeight || (totalWeightGrams > 0 ? totalWeightGrams : null);
  const wMax = finishedWeight || (totalWeightMax > 0 ? totalWeightMax : null);

  const nutrientsTotal = {}, nutrientsPerPortion = {}, nutrientsPer100g = {};
  const nutrientsTotalRange = {}, nutrientsPerPortionRange = {}, nutrientsPer100gRange = {};
  // Spanne nur, wenn sie nach dem Runden tatsaechlich eine ist; sonst ist der Wert exakt.
  const span = (lo, hi) => {
    if (lo === null || hi === null || lo === undefined || hi === undefined) return { exact: null, range: null };
    const a = nutRound(lo), b = nutRound(hi);
    if (!rangeUsed || a === b) return { exact: a, range: rangeUsed ? { min: a, max: a } : null };
    return { exact: null, range: { min: Math.min(a, b), max: Math.max(a, b) } };
  };
  for (const key of Object.keys(NUTRIENT_KEYS)) {
    const lo = known[key] ? totals[key] : null;
    const hi = known[key] ? totalsMax[key] : null;
    const t = span(lo, hi);
    nutrientsTotal[key] = lo === null ? null : (rangeUsed ? t.exact : lo);   // bei echter Spanne null, kein Pseudo-Exaktwert
    nutrientsTotalRange[key] = t.range;
    const p = needsServings ? { exact: null, range: null } : span(lo === null ? null : lo / servings, hi === null ? null : hi / servings);
    nutrientsPerPortion[key] = p.exact;
    nutrientsPerPortionRange[key] = p.range;
    // pro 100 g: konservative Einhuellende (Untergrenze durch groesstes Gewicht, Obergrenze durch kleinstes)
    const h = (lo === null || !wMin || !wMax) ? { exact: null, range: null } : span((lo / wMax) * 100, (hi / wMin) * 100);
    nutrientsPer100g[key] = h.exact;
    nutrientsPer100gRange[key] = h.range;
  }
  if (!rangeUsed) {
    for (const key of Object.keys(NUTRIENT_KEYS)) { nutrientsTotalRange[key] = null; nutrientsPerPortionRange[key] = null; nutrientsPer100gRange[key] = null; }
  }

  // Confidence (Punkt 22): nur Farbe reicht nicht — konkrete Begruendung mitliefern.
  let confidence = 'high';
  if (unresolvedCount > 0) confidence = (relevantCount > 0 && unresolvedCount / relevantCount <= 0.25) ? 'medium' : 'low';   // eine einzelne Lücke macht die Zahl nicht wertlos
  else if (estimatedCount > 0 || per100Estimated || rangeUsed) confidence = 'medium';

  if ((unquantified.length || approximations.length) && confidence === 'high') confidence = 'medium';
  const confidenceDetail = relevantCount === 0
    ? 'Keine berechenbaren Zutaten gefunden.'
    : `${matchedCount}/${relevantCount} Zutaten eindeutig erkannt` +
      (estimatedCount > 0 ? `, bei ${estimatedCount} die Menge geschätzt (Stück, Löffel oder Packung)` : '') +
      (skippedCount > 0 ? `, ${skippedCount} nicht mitgerechnet (Wasser, Gewürze)` : '') +
      (approximations.length > 0 ? `, ${approximations.length} mit ähnlichem Lebensmittel angenähert` : '') +
      (unquantified.length > 0 ? `, ${unquantified.length} ohne Mengenangabe nicht eingerechnet` : '') +
      (unresolvedCount > 0 ? `, ${unresolvedCount} ungeklärt` : '') +
      (rangeCount > 0 ? `, bei ${rangeCount} Zutat${rangeCount === 1 ? '' : 'en'} Mengenbereich: Ergebnis als Spanne` : '') +
      (needsServings ? ', Ausbeute unbekannt: keine Pro-Portion-Werte' : '') +
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
    servings: needsServings ? null : servings,
    needsServings,
    rangeUsed,
    totalWeight: totalWeightGrams > 0 ? roundNutrientForDisplay(totalWeightGrams) : null,
    totalWeightMax: rangeUsed && totalWeightMax > 0 ? roundNutrientForDisplay(totalWeightMax) : null,
    finishedWeight,
    per100Estimated,
    confidence,
    confidenceDetail,
    matchedCount,
    estimatedCount,
    unresolvedCount,
    relevantCount,
    unresolvedIngredients,
    unquantified,
    approximations,
    complete: unresolvedCount === 0 && relevantCount > 0,
    nutrientsTotal,
    nutrientsPerPortion,
    nutrientsPer100g,
    nutrientsTotalRange: rangeUsed ? nutrientsTotalRange : {},
    nutrientsPerPortionRange: rangeUsed ? nutrientsPerPortionRange : {},
    nutrientsPer100gRange: rangeUsed ? nutrientsPer100gRange : {},
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
