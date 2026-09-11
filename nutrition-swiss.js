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

/* Einfache, robuste Substring-Suche ueber Name/Synonyme (DE) + englischen Namen als
   Fallback. Kein Fuzzy-Matching hier — das gehoert in nutrition-matcher.js (Phase 2),
   diese Funktion ist bewusst simpel und dient v.a. dem manuellen Auswahldialog
   (Punkt 72) und dem Testen von Phase 1. */
async function searchSwissFoods(query, limit = 20) {
  const q = normalizeIngredientText(query);
  if (!q) return [];
  const foods = await getSwissFoodsCached();
  const scored = [];
  for (const f of foods) {
    const name = normalizeIngredientText(f.name);
    const nameEn = normalizeIngredientText(f.nameEn || '');
    const synonyms = (f.synonyms || []).map(normalizeIngredientText);
    let score = -1;
    if (name === q) score = 100;
    else if (name.startsWith(q)) score = 80;
    else if (name.includes(q)) score = 60;
    else if (synonyms.some((s) => s === q)) score = 70;
    else if (synonyms.some((s) => s.includes(q))) score = 50;
    else if (nameEn.startsWith(q)) score = 40;
    else if (nameEn.includes(q)) score = 20;
    if (score >= 0) scored.push({ food: f, score });
  }
  scored.sort((a, b) => b.score - a.score || a.food.name.length - b.food.name.length);
  return scored.slice(0, limit).map((s) => s.food);
}

async function getSwissFoodById(id) {
  const foods = await getSwissFoodsCached();
  return foods.find((f) => f.id === id) || null;
}
