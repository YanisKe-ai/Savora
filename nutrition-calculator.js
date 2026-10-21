/* ---------- Nutrition: Berechnungsengine (Implementierungsauftrag Punkt 16-23) ---------- */

const NUTRITION_CALC_VERSION = 5;   // 5 (v0.86): Abdeckung coverage/partial, Salz aus Natrium, Bouillon-Konzentrat, "ca. 200", Frischepruefung mit Zuordnungen; 4: Klammerzusaetze zaehlen nicht zum Zutatennamen, Altbestand "1/2 Zwiebel" mit Name "(fein geraspelt)";  2: Zuordnung ueber Alias-Tabelle, Richtdichten; 3: Mengenbereiche als Spanne, keine stille Portion 1; aeltere Ergebnisse gelten als veraltet

/* Zeilen, die erkennbar keine berechenbare Menge tragen ("Salz nach Geschmack", "etwas
   Butter", "eine Handvoll Nüsse", ...) fliessen NICHT als Fehler, sondern als bewusst
   ausgeschlossen in die Berechnung ein — sie duerfen keine erfundenen Grammwerte erzeugen
   (Punkt 78 "Unknown Tests"). Erkennung ueber den Zutatentext, nicht ueber amount/unit
   allein, da z.B. "Pfeffer nach Geschmack" oft ganz ohne amount/unit-Felder erfasst wird. */
const QUALITATIVE_AMOUNT_PATTERN = /nach\s+geschmack|nach\s+belieben|ein(e)?\s+schuss|etwas\b|eine\s+handvoll|prise\s*$/i;

/* Kleinstmenge eines Gewuerzes/Triebmittels? (Prise, Messerspitze, bis 1 EL/3 TL, bis 10 g, ohne Menge) */
function isNegligibleAmount(ing) {
  const q = qtyFromIngredientLoose(ing);
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
  if (qtyIsNumeric(qtyFromIngredientLoose(ing))) return false; // hat eine konkrete Zahl oder einen Bereich -> nicht qualitativ
  return QUALITATIVE_AMOUNT_PATTERN.test(ing.name || '') || QUALITATIVE_AMOUNT_PATTERN.test(ing.bracketText || '') || QUALITATIVE_AMOUNT_PATTERN.test(ing.amount || '');
}

/* Einfacher, stabiler Hash ueber die berechnungsrelevanten Zutatendaten (fuer
   "Naehrwerte veraltet"-Erkennung, Punkt 23) — bewusst kein Crypto-Hash, nur
   Aenderungserkennung noetig. */
function hashIngredientsForNutrition(ingredients, servings, mode) {
  const relevant = (ingredients || []).map((i) => `${i.amount}|${i.unit}|${(i.name || '').trim().toLowerCase()}`).join(';');
  // Ertragsart (v0.83): nur 'total' geht in den Hash ein. Portionen und Stueck rechnen gleich (Gesamt / Anzahl), ihre
  // gespeicherten Ergebnisse bleiben gueltig; ein Wechsel zu Gesamtertrag (z. B. 1 Portion -> 1 Glas) macht sie ungueltig.
  const input = relevant + '::' + servings + (mode === 'total' ? '::total' : '');
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return 'h' + hash.toString(36);
}

function addNutrientContribution(totals, known, food, grams) {
  const derivedSalt = typeof nutSaltFromSodium === 'function' ? nutSaltFromSodium(food.nutrientsPer100g) : null;   // F10: Salz fehlt, Natrium bekannt
  for (const key of Object.keys(NUTRIENT_KEYS)) {
    let per100 = food.nutrientsPer100g ? food.nutrientsPer100g[key] : null;
    if (key === 'salt' && derivedSalt !== null) per100 = derivedSalt;
    if (per100 === null || per100 === undefined) continue; // fehlender Wert bleibt fehlend, wird nicht als 0 gezaehlt
    const contribution = (per100 * grams) / 100;
    totals[key] = (totals[key] || 0) + contribution;
    known[key] = true;
  }
}
const nutRound = (v) => roundNutrientForDisplay(v);

/* Hash des aktuellen Rezeptstands: dieselben Zutaten (ohne Gruppentitel) und dieselbe Ausbeute wie beim Berechnen.
   Vorher wurden beim Pruefen die Gruppentitel mitgezaehlt; Rezepte mit Zutatengruppen galten dadurch immer als veraltet. */
function nutritionIngredientsFor(recipe) {
  return (recipe.ingredients || []).filter(i => !(typeof isIngredientHeaderRow === 'function' && isIngredientHeaderRow(i)));
}
function nutritionHashFor(recipe) {
  const servings = Number(recipe.servings) > 0 ? Number(recipe.servings) : 1;
  return hashIngredientsForNutrition(nutritionIngredientsFor(recipe), servings, recipe.servingMode);
}

/* v0.86 (F2-F4): weitere Ausloeser fuer "veraltet". Der Zutaten-Hash oben bleibt unveraendert (alte Ergebnisse
   und Tests rechnen damit); zusaetzlich gibt es einen Frische-Schluessel und eine Signatur der Zuordnungen. */
function nutStableStringify(v) {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return '[' + v.map(nutStableStringify).join(',') + ']';
  if (typeof v === 'object') return '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ':' + nutStableStringify(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
function nutHashString(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i++) hash = (hash * 31 + input.charCodeAt(i)) | 0;
  return 'h' + hash.toString(36);
}
/* Rezeptfelder ausser den Zutaten: recipe.nutritionMap (Sync), Gewicht nach dem Kochen, Datenbank-Version, Schritte (Zubereitung). */
function nutritionFreshnessKey(recipe) {
  const fw = typeof recipe.nutritionFinishedWeight === 'number' && recipe.nutritionFinishedWeight > 0 ? recipe.nutritionFinishedWeight : '';
  const steps = (recipe.steps || []).map((st) => (typeof st === 'string' ? st : (st && st.text) || '')).join('\n');
  const db = typeof SWISS_FCD_VERSION !== 'undefined' ? SWISS_FCD_VERSION : '';
  return nutHashString(nutStableStringify(recipe.nutritionMap || null) + '|' + fw + '|' + db + '|' + steps);
}
/* Signatur der gelernten globalen Zuordnungen und eigenen Lebensmittel, die fuer die Zutaten dieses Rezepts gelten.
   Aendert sich eine Zuordnung oder die Werte eines eigenen Lebensmittels, passt die Signatur nicht mehr: veraltet. */
async function nutritionMatchSignature(recipe) {
  const parts = [];
  let customs = [];
  try { customs = typeof dbGetAllCustomFoods === 'function' ? (await dbGetAllCustomFoods()) || [] : []; } catch (e) { customs = []; }
  const customById = new Map(customs.map((f) => [f.id, f]));
  const customStamp = (f) => f.id + '@' + (f.updatedAt || '') + ':' + nutHashString(nutStableStringify(f.nutrientsPer100g || null) + '|' + (f.density == null ? '' : f.density));
  for (const rawIng of nutritionIngredientsFor(recipe)) {
    if (!rawIng || !rawIng.name || !String(rawIng.name).trim()) continue;
    const prepared = typeof nutPrepareIngredient === 'function' ? nutPrepareIngredient(rawIng) : rawIng;
    const keys = typeof nutMatchKeysFor === 'function' ? nutMatchKeysFor(prepared.name, rawIng.name) : [normalizeIngredientText(prepared.name)];
    for (const key of keys) {
      let m = null;
      try { m = typeof dbGetNutritionMatch === 'function' ? await dbGetNutritionMatch(key) : null; } catch (e) { m = null; }
      if (m && m.foodId) { const cf = customById.get(m.foodId); parts.push(key + '=' + m.foodId + (cf ? '/' + customStamp(cf) : '')); break; }
    }
    const norm = normalizeIngredientText(nutCleanIngredientName(prepared.name).name || prepared.name);
    for (const f of customs) if (normalizeIngredientText(f.name) === norm) parts.push(norm + '~' + customStamp(f));
  }
  return nutHashString(parts.join(';'));
}

/* Berechnet die Naehrwerte eines Rezepts. `recipe` braucht mindestens { ingredients, servings }.
   Optional: recipe.nutritionFinishedWeight (Gramm, Punkt 18) fuer ein exaktes "pro 100g".
   Ruft KEINE UI-Funktionen auf und speichert NICHTS in der DB — das macht der Aufrufer
   (siehe recalculateAndStoreNutrition), damit diese Funktion auch fuer Vorschau/Tests
   ohne Nebenwirkungen nutzbar ist. */
async function calculateRecipeNutrition(recipe) {
  // Gruppentitel wie "Teig:" sind keine Zutaten und duerfen nicht als "ungeklaert" zaehlen.
  const ingredients = nutritionIngredientsFor(recipe);
  const needsServings = !(Number(recipe.servings) > 0);   // unbekannte Ausbeute: keine stille 1, keine Pro-Portion-Werte
  const servings = needsServings ? 1 : Number(recipe.servings);   // nur fuer den Hash (stabil zu frueher); wird nie als Teiler benutzt, wenn needsServings
  // Gesamtertrag (z. B. 1 Glas, v0.83): keine Werte pro Glas oder pro Loeffel erfinden, Bezug ist das ganze Rezept.
  const wholeRecipe = needsServings || recipe.servingMode === 'total';

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
  const missing = [];   // v0.86 coverage.missing: [{ name, reason }]
  const sourcesUsed = new Set();

  for (const rawIng of ingredients) {
    if (!rawIng || !rawIng.name || !rawIng.name.trim()) continue;
    const ing = Object.assign({}, rawIng, nutPrepareIngredient(rawIng));   // Import-Formen zusammenfassen (Saft von 1/2 Zitrone, Becher (200 ml) ...)
    if (isQualitativeIngredient(ing)) continue; // bewusst ausgeschlossen, kein Fehler

    const ingredientInfo = normalizeIngredientPhrase(ing.name);
    // Punkt 42: optionale Zutaten ("nach Belieben", "wer mag", ...) NICHT automatisch in die
    // Naehrwerte einrechnen, solange unklar ist, ob sie tatsaechlich verwendet wurden — genauso
    // bewusst ausgeschlossen wie eine vage Mengenangabe, kein Fehler/Confidence-Abzug.
    if (ingredientInfo.optional || OPTIONAL_MARKER_PATTERNS.some((p) => p.test(ing.bracketText || '')) || /^\s*(optional|evtl\.?|eventuell|wer mag)\b/i.test(ing.name) || /^\s*(optional|evtl\.?|eventuell|wer mag)\b/i.test(ing.bracketText || '')) continue;

    if (!String(ing.name || '').trim()) {
      // Nach dem Entfernen der Klammern bleibt kein Zutatenname (nur ein Hinweis): mit Menge ehrlich als nicht berechenbar melden, nie still weglassen
      if (qtyIsNumeric(qtyFromIngredientLoose(ing))) { relevantCount++; unresolvedCount++; unresolvedIngredients.push({ name: String(rawIng.name).trim(), reason: 'no-name' }); missing.push({ name: String(rawIng.name).trim(), reason: 'no-name' }); }
      continue;
    }

    let match = await matchIngredient(ing.name, recipe.steps, { originalName: rawIng.name, recipe });
    if (match.skipped) {
      // Wasser und Gewuerze in Kleinstmengen: nicht mitrechnen, kein Fehler. Grosse Mengen eines
      // Gewuerz-Begriffs (z.B. 100 g Kraeuter) werden dagegen normal gesucht.
      if (match.skipped === 'negligible' && !isNegligibleAmount(ing)) match = await matchIngredient(ing.name, recipe.steps, { ignoreNegligible: true, originalName: rawIng.name, recipe });
      else { skippedCount++; continue; }
    }
    // Ohne Mengenangabe laesst sich nichts berechnen: transparent auflisten statt das ganze Ergebnis zu blockieren
    if (!qtyIsNumeric(qtyFromIngredientLoose(ing))) {
      // Nur echte, erkannte Zutaten auflisten; Fliesstext-Zeilen ("Alles mischen") und Gewuerze ohne Menge werden still uebergangen
      if (match.food && (match.viaAlias || match.confirmed || String(ing.name).trim().split(/\s+/).length <= 3) && !/\b(salz|pfeffer|muskat|gewürz\w*|kräuter\w*|zimt|curry\w*|paprikapulver)\b/i.test(ing.name)) {
        unquantified.push(ing.name);
        missing.push({ name: ing.name, reason: 'no-amount' });   // v0.86: einheitliche Zaehlung, eine erkannte Zutat ohne Menge "fehlt"
      }
      continue;
    }
    relevantCount++;
    if (match.status === 'unmatched' || !match.food) {
      unresolvedCount++;
      unresolvedIngredients.push({ name: ing.name, reason: 'not-found' });
      missing.push({ name: ing.name, reason: 'not-found' });
      continue;
    }

    const grams = resolveIngredientGrams(ing, match.food);
    const gMin = grams.range ? grams.gramsMin : grams.grams;
    const gMax = grams.range ? grams.gramsMax : grams.grams;
    if (gMin === null || gMin === undefined || gMax === null || gMax === undefined) {
      unresolvedCount++;
      unresolvedIngredients.push({ name: ing.name, reason: grams.reason });
      missing.push({ name: ing.name, reason: grams.reason || 'no-grams' });
      continue;
    }
    if (match.status === 'uncertain') {
      unresolvedCount++;
      unresolvedIngredients.push({ name: ing.name, reason: 'uncertain-match', candidate: match.food.name });
      missing.push({ name: ing.name, reason: 'uncertain-match' });
      // Trotzdem NICHT in die Summe aufnehmen — ein unsicherer Match soll die Zahl nicht verfaelschen.
      continue;
    }

    matchedCount++;
    if ((match.approx || grams.concentrate) && match.food) approximations.push({ name: ing.name, food: match.food.name + (grams.concentrate ? ' (aus Konzentrat umgerechnet)' : '') });
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
    const p = wholeRecipe ? { exact: null, range: null } : span(lo === null ? null : lo / servings, hi === null ? null : hi / servings);
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

  // v0.86: eine Zaehlung fuer Karte, Dialog und PDF. Erkannte Zutaten ohne Menge zaehlen als fehlend.
  const noAmountCount = missing.filter((m) => m.reason === 'no-amount').length;
  relevantCount += noAmountCount;
  unresolvedCount += noAmountCount;
  const coverage = { counted: matchedCount, total: matchedCount + missing.length, missing };
  const partial = coverage.counted < coverage.total;
  const enoughForEstimate = coverage.total > 0 && coverage.counted / coverage.total >= 0.5;

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
      (unresolvedCount - noAmountCount > 0 ? `, ${unresolvedCount - noAmountCount} ungeklärt` : '') +
      (rangeCount > 0 ? `, bei ${rangeCount} Zutat${rangeCount === 1 ? '' : 'en'} Mengenbereich: Ergebnis als Spanne` : '') +
      (needsServings ? '. Die Angabe, was das Rezept ergibt, fehlt. Darum gibt es keine Werte pro Portion' : wholeRecipe ? ', Gesamtertrag: Werte für das gesamte Rezept' : '') +
      (per100Estimated ? ', Fertiggewicht geschätzt' : ', Fertiggewicht bekannt');

  return {
    recipeId: recipe.id,
    nutritionCalcVersion: NUTRITION_CALC_VERSION,
    ingredientHash: nutritionHashFor(recipe),
    freshnessKey: nutritionFreshnessKey(recipe),
    matchSignature: await nutritionMatchSignature(recipe),
    // Bezugsbasis laut Ertrag (v0.83): 'portion' | 'piece' | 'total'. Gesamtertrag und unbekannter Ertrag: ganzes Rezept.
    basis: typeof nutritionBasis === 'function' ? nutritionBasis(recipe).kind : (needsServings ? 'total' : 'portion'),
    // Punkt 3 (Reparatur-Auftrag): vorher wurden nur Swiss-FCD-Quellen im Ergebnis behalten —
    // war eine Zutat ausschliesslich per Open-Food-Facts-Barcode oder als Custom Food erfasst,
    // verschwand das komplett und die Quellenzeile zeigte faelschlich "Berechnete
    // Durchschnittswerte" statt der tatsaechlich verwendeten Quelle.
    sourceDataVersions: buildSourceDataVersions(sourcesUsed),
    calculatedAt: Date.now(),
    servings: needsServings ? null : servings,
    needsServings,
    wholeRecipe,   // true: nur Werte fuer das gesamte Rezept (Ertrag unbekannt oder Gesamtertrag)
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
    coverage,
    partial,
    enoughForEstimate,
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
  if (stored.ingredientHash !== nutritionHashFor(recipe)) return null;
  if ((stored.nutritionCalcVersion || 1) < NUTRITION_CALC_VERSION) return null;   // mit aelterer Berechnung erstellt
  if (!(await nutritionStoredIsFresh(stored, recipe))) return null;
  return stored;
}

/* Frische-Schluessel und Zuordnungs-Signatur pruefen (nur wenn das Ergebnis sie hat; Ergebnisse vor v0.86 sind ohnehin veraltet). */
async function nutritionStoredIsFresh(stored, recipe) {
  if (stored.freshnessKey !== undefined && stored.freshnessKey !== nutritionFreshnessKey(recipe)) return false;
  if (stored.matchSignature !== undefined) {
    let sig = null;
    try { sig = await nutritionMatchSignature(recipe); } catch (e) { sig = null; }
    if (sig !== null && sig !== stored.matchSignature) return false;
  }
  return true;
}

/* Abdeckung eines gespeicherten Ergebnisses (auch fuer aeltere oder in Tests veraenderte Ergebnisse ohne coverage). */
function nutritionCoverageOf(result) {
  if (!result) return { counted: 0, total: 0, missing: [] };
  const total = Math.max(0, Number(result.relevantCount) || 0);
  const counted = Math.max(0, total - Math.max(0, Number(result.unresolvedCount) || 0));
  const missing = result.coverage && Array.isArray(result.coverage.missing) ? result.coverage.missing : (result.unresolvedIngredients || []);
  return { counted, total, missing: counted === total ? [] : missing };
}

/* Einheitlicher Status fuer App, Vorschau und PDF:
     not-calculated  nie berechnet (nicht dasselbe wie 0)
     calculated      aktuell und alle relevanten Zutaten eingerechnet
     partial         aktuell, mind. die Haelfte eingerechnet: Werte als Untergrenze zeigen ("mind.")
     incomplete      aktuell, weniger als die Haelfte eingerechnet -> keine Zahlen zeigen
     empty           keine relevanten Zutaten (z. B. Rezept ohne Zutaten), nie "0 von 0"
     stale           Zutaten/Portionen geaendert oder mit aelterer Berechnung erstellt
     failed          Speicher nicht lesbar */
async function nutritionStatusFor(recipe) {
  let stored = null;
  try { stored = await dbGetNutritionResult(recipe.id); } catch (e) { return { status: 'failed', result: null }; }
  if (!stored) return { status: 'not-calculated', result: null };
  const hashOk = stored.ingredientHash === nutritionHashFor(recipe);
  if (!hashOk || (stored.nutritionCalcVersion || 1) < NUTRITION_CALC_VERSION) return { status: 'stale', result: stored };
  if (!(await nutritionStoredIsFresh(stored, recipe))) return { status: 'stale', result: stored };
  const cov = nutritionCoverageOf(stored);
  if (cov.total === 0) return { status: 'empty', result: stored };
  if (cov.counted === cov.total) return { status: 'calculated', result: stored };
  return { status: cov.counted / cov.total >= 0.5 ? 'partial' : 'incomplete', result: stored };
}
