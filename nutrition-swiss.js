/* ---------- Nutrition-Quelle: Schweizer Naehrwertdatenbank (swiss-fcd) ----------
   Primaere Datenquelle fuer generische Lebensmittel (Implementierungsauftrag Teil A,
   Punkt 2.1). Echte, offiziell downloadbare Daten des BLV — Version 7.1 (2026),
   1216 generische Lebensmittel, aus swiss-fcd-data.json (siehe convert_swiss_fcd.py
   fuer die Konvertierung aus der offiziellen Excel-Quelldatei).

   Ablauf:
   1. Beim ersten Start (oder nach einer neuen Version) wird swiss-fcd-data.json
      einmalig per fetch geladen und in den Store "nutritionFoods" geschrieben.
   2. Ab dann laeuft jede Suche/jeder Zugriff ausschliesslich gegen IndexedDB —
      kein erneuter fetch, funktioniert vollstaendig offline.

   Attribution (muss ueberall angezeigt werden, wo Werte aus dieser Quelle
   verwendet werden — Punkt 2.1 "Attribution" / Punkt 30 "Quellenanzeige"):
   "Schweizer Nährwertdatenbank, Bundesamt für Lebensmittelsicherheit und
    Veterinärwesen BLV" */

const SWISS_FCD_SOURCE = 'swiss-fcd';
const SWISS_FCD_VERSION = '7.1';
const SWISS_FCD_LABEL = 'Schweizer Nährwertdatenbank, Bundesamt für Lebensmittelsicherheit und Veterinärwesen BLV';
const SWISS_FCD_META_KEY = 'swiss-fcd-seeded-version';

let swissSeedPromise = null;

/* Laedt die Rohdaten nach (bzw. spielt sie neu ein), falls noch keine oder eine
   veraltete Version in der DB liegt. Mehrfacher Aufruf ist sicher (dedupliziert
   ueber swissSeedPromise, damit nicht mehrere Tabs/Aufrufe gleichzeitig laden). */
function ensureSwissDataSeeded() {
  if (swissSeedPromise) return swissSeedPromise;
  swissSeedPromise = (async () => {
    let seededVersion = null;
    try {
      seededVersion = await dbGetNutritionMeta(SWISS_FCD_META_KEY);
    } catch (err) {
      console.warn('Nutrition: Meta-Abfrage fehlgeschlagen, versuche trotzdem zu seeden.', err);
    }
    if (seededVersion === SWISS_FCD_VERSION) return { seeded: false, count: 0, reason: 'already-current' };

    const res = await fetch('./swiss-fcd-data.json');
    if (!res.ok) throw new Error('Schweizer Nährwertdatenbank konnte nicht geladen werden (' + res.status + ').');
    const payload = await res.json();
    const foods = (payload.foods || []).map((f) => ({ ...f, source: SWISS_FCD_SOURCE }));

    // Falls zuvor eine aeltere Version eingespielt war: erst sauber entfernen,
    // damit keine veralteten/entfernten Eintraege stehen bleiben.
    if (seededVersion) await dbDeleteNutritionFoodsBySource(SWISS_FCD_SOURCE);

    await dbPutNutritionFoodsBulk(foods);
    await dbPutNutritionMeta(SWISS_FCD_META_KEY, SWISS_FCD_VERSION);
    return { seeded: true, count: foods.length, reason: seededVersion ? 'version-update' : 'initial' };
  })().catch((err) => {
    swissSeedPromise = null; // bei Fehler erneuten Versuch beim naechsten Aufruf erlauben
    throw err;
  });
  return swissSeedPromise;
}

/* In-Memory-Cache der geladenen Lebensmittel fuer schnelle Suche ohne wiederholte
   IndexedDB-Zugriffe pro Tastenanschlag. Wird nach dem Seeding einmal befuellt. */
let swissFoodsCache = null;

async function getSwissFoodsCached() {
  if (swissFoodsCache) return swissFoodsCache;
  await ensureSwissDataSeeded();
  const all = await dbGetAllNutritionFoods();
  swissFoodsCache = all.filter((f) => f.source === SWISS_FCD_SOURCE);
  return swissFoodsCache;
}

/* Wort-/Stamm-basierte Relevanzbewertung (statt reinem Substring) — behandelt Plural/Deklination
   (z.B. "Tomaten" vs. "Tomate, roh") und mehrere Suchwoerter unabhaengig von ihrer Reihenfolge
   ("Reis trocken" soll "Reis poliert, trocken" finden). Gibt -1 zurueck, wenn kein Wortstamm
   uebereinstimmt (kein Zufallstreffer ueber gemeinsame Buchstaben). */
function scoreNameMatch(query, candidateName) {
  const qNorm = normalizeIngredientText(query);
  const cNorm = normalizeIngredientText(candidateName);
  if (!qNorm || !cNorm) return -1;
  if (qNorm === cNorm) return 100;
  const qTokens = tokenizeText(qNorm);
  const cTokens = tokenizeText(cNorm);
  if (!qTokens.length || !cTokens.length) return -1;
  const qStems = qTokens.map(stemDe);
  const cStems = cTokens.map(stemDe);
  const matched = qStems.filter((qs) => cStems.includes(qs)).length;
  const coverage = matched / qStems.length;
  if (coverage === 0) return -1;
  const headMatch = qStems[0] === cStems[0];
  let score = coverage * 55;
  if (headMatch) score += 35;
  score -= Math.min(cTokens.length, 10) * 0.3; // knappere/generischere Namen leicht bevorzugen
  return score;
}

/* Sucht ueber Name (DE), Synonyme (DE) und englischen Namen als Fallback — der beste der drei
   Scores pro Lebensmittel zaehlt. */
/* Wie searchSwissFoods(), gibt aber zusaetzlich den tatsaechlich ermittelten Score pro Treffer
   zurueck (inkl. Synonym-/EN-Bonus) — wichtig fuer Aufrufer wie matchIngredient(), die sonst den
   Score anhand von food.name allein neu berechnen wuerden und dabei einen Synonym-Treffer
   verlieren wuerden (Bug: "Butter" fand ueber das offizielle BLV-Synonym "Vorzugsbutter" mit
   Score 100, wurde aber bei der Neuberechnung ueber den Eigennamen als "unsicher" eingestuft). */
async function searchSwissFoodsWithScores(query, limit = 20) {
  const q = normalizeIngredientText(query);
  if (!q) return [];
  const foods = await getSwissFoodsCached();
  const scored = [];
  for (const f of foods) {
    let best = scoreNameMatch(q, f.name);
    for (const syn of f.synonyms || []) best = Math.max(best, scoreNameMatch(q, syn));
    if (f.nameEn) best = Math.max(best, scoreNameMatch(q, f.nameEn) - 15); // EN nur als schwaecherer Fallback
    if (best >= NUTRITION_MATCH_SCORE_MIN_DEFAULT) scored.push({ food: f, score: best });
  }
  scored.sort((a, b) => b.score - a.score || a.food.name.length - b.food.name.length);
  return scored.slice(0, limit);
}

async function searchSwissFoods(query, limit = 20) {
  const scored = await searchSwissFoodsWithScores(query, limit);
  return scored.map((s) => s.food);
}

const NUTRITION_MATCH_SCORE_MIN_DEFAULT = 15;

async function getSwissFoodById(id) {
  const foods = await getSwissFoodsCached();
  return foods.find((f) => f.id === id) || null;
}
