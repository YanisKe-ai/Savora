/* ---------- Nutrition: Mengen- & Einheitenumrechnung (Implementierungsauftrag Punkt 11-13) ----------
   Eigenstaendige Schicht fuer die Nutrition Engine — greift NICHT in units.js ein (das bleibt
   unveraendert fuer Rezeptanzeige/-skalierung), da hier zusaetzliche Einheiten und eine strengere
   "niemals erfundene Werte"-Regel gelten als dort. Wo sinnvoll werden dieselben Grundwerte wie in
   units.js verwendet (g/kg/ml/l/TL/EL/Cup/fl.oz), nur ergaenzt um cl/dl und Stueckeinheiten.

   Zentrale Regel (Punkt 12): eine Volumeneinheit wird NIEMALS automatisch wie Wasser behandelt.
   Masse = Volumen × Dichte — nur wenn eine Dichte aus der Datenquelle vorliegt. Keine erfundenen
   Dichtewerte (bestaetigt an echten Daten: die Schweizer DB liefert `density` nur dort, wo eine
   verlaessliche Dichte bekannt ist, z.B. Honig 1.43 g/ml — fuer Mehl, Zucker etc. bewusst null). */

const NUTRITION_WEIGHT_TO_GRAMS = { g: 1, kg: 1000, mg: 0.001, oz: 28.3495, lb: 453.592 };
const NUTRITION_VOLUME_TO_ML = { ml: 1, cl: 10, dl: 100, l: 1000, tsp: 4.92892, tbsp: 14.7868, cup: 236.588, floz: 29.5735 };

const NUTRITION_UNIT_ALIASES = {
  g: ['g', 'gr', 'gramm', 'gramme'],
  kg: ['kg', 'kilo', 'kilogramm'],
  mg: ['mg', 'milligramm'],
  oz: ['oz', 'ounce', 'ounces', 'unze', 'unzen'],
  lb: ['lb', 'lbs', 'pound', 'pounds', 'pfund'],
  ml: ['ml', 'milliliter', 'millilitre'],
  cl: ['cl', 'zentiliter'],
  dl: ['dl', 'deziliter'],
  l: ['l', 'liter', 'litre'],
  tsp: ['tl', 'tsp', 'teelöffel', 'teaspoon', 'teaspoons'],
  tbsp: ['el', 'tbsp', 'esslöffel', 'tablespoon', 'tablespoons'],
  cup: ['cup', 'cups', 'tasse', 'tassen'],
  floz: ['floz', 'fl.oz', 'flooz', 'fluidounce', 'fluidounces'],
  // Stueck-/Gebindeeinheiten haben keinen festen Umrechnungsfaktor — sie brauchen entweder ein
  // Stueckgewicht (piece) oder muessen vom Nutzer bestaetigt werden (container).
  piece: ['stück', 'stk', 'stk.', 'stange', 'blatt', 'blätter'],
  clove: ['zehe', 'zehen'],
  slice: ['scheibe', 'scheiben'],
  pinch: ['prise', 'prisen'],
  container: ['dose', 'dosen', 'packung', 'packungen', 'päckchen', 'glas', 'gläser', 'beutel'],
};

function normalizeNutritionUnit(raw) {
  if (!raw) return null;
  const s = String(raw).toLowerCase().replace(/\.$/, '').trim();
  for (const [canonical, aliases] of Object.entries(NUTRITION_UNIT_ALIASES)) {
    if (aliases.includes(s)) return canonical;
  }
  return null;
}

/* Geschaetzte essbare Durchschnittsgewichte (Punkt 13) — Standard-Referenzwerte
   (vergleichbar mit gaengigen Kuechentabellen), IMMER als "geschätzt" gekennzeichnet
   und vom Nutzer korrigierbar (Custom Food / manuelle Korrektur, Phase 3-UI).
   Key = Substring, der im normalisierten Zutatennamen gesucht wird (erste Übereinstimmung
   gewinnt, daher spezifischere Begriffe vor allgemeinen einsortiert). */
const PIECE_WEIGHT_TABLE = [
  { match: 'ei', grams: 53, unit: 'piece', wholeWordOnly: true, alsoMatch: ['eier'] },
  { match: 'zwiebel', grams: 110, unit: 'piece' },
  { match: 'schalotte', grams: 25, unit: 'piece' },
  { match: 'zitrone', grams: 58, unit: 'piece' },
  { match: 'limette', grams: 44, unit: 'piece' },
  { match: 'apfel', grams: 180, unit: 'piece' },
  { match: 'banane', grams: 120, unit: 'piece' },
  { match: 'kartoffel', grams: 150, unit: 'piece' },
  { match: 'tomate', grams: 123, unit: 'piece' },
  { match: 'karotte', grams: 61, unit: 'piece' },
  { match: 'rüebli', grams: 61, unit: 'piece' },
  { match: 'peperoni', grams: 120, unit: 'piece' },
  { match: 'avocado', grams: 170, unit: 'piece' },
  { match: 'brot', grams: 30, unit: 'slice' },
  { match: 'toast', grams: 25, unit: 'slice' },
  { match: 'käse', grams: 20, unit: 'slice' },
];

// "Zehe" als Einheit bedeutet in deutschsprachigen Rezepten so gut wie immer Knoblauch —
// unabhaengig davon, ob der Zutatentext selbst "Knoblauch" enthaelt (z.B. nur "Zehe" als
// Einheit + "Knoblauch" als Name, ohne dass "zehe" im Namen vorkommt).
const CLOVE_DEFAULT_GRAMS = 5;

function lookupPieceWeight(normalizedName, unitKind) {
  if (unitKind === 'clove') return CLOVE_DEFAULT_GRAMS;
  for (const entry of PIECE_WEIGHT_TABLE) {
    if (entry.unit !== unitKind) continue;
    if (entry.wholeWordOnly) {
      const words = [entry.match, ...(entry.alsoMatch || [])];
      const pattern = new RegExp(`(^|\\s)(${words.join('|')})(\\s|$)`);
      if (pattern.test(normalizedName)) return entry.grams;
    } else if (normalizedName.includes(entry.match)) {
      return entry.grams;
    }
  }
  return null;
}

/* Kernfunktion: rechnet eine Zutatenzeile + (optional) passendes Lebensmittel in Gramm um.
   Gibt NIE einen erfundenen Wert zurueck — wenn keine verlaessliche Umrechnung moeglich ist,
   kommt grams:null + needsConfirmation:true zurueck (siehe Punkt 74 "wichtige Fehlerfaelle"). */
function resolveIngredientGrams(ing, food) {
  const amt = parseAmount(ing.amount);
  if (amt === null || isNaN(amt)) {
    return { grams: null, estimated: false, needsConfirmation: true, reason: 'no-amount' };
  }
  const canonical = normalizeNutritionUnit(ing.unit);
  const normalizedName = normalizeIngredientText(ing.name);

  // Kein Einheitentext, aber eine Zahl -> in der Regel gemeint als Stueckzahl ("2 Eier").
  const unitKind = canonical || (String(ing.unit || '').trim() === '' ? 'piece' : null);

  if (unitKind && NUTRITION_WEIGHT_TO_GRAMS[unitKind] !== undefined) {
    return { grams: amt * NUTRITION_WEIGHT_TO_GRAMS[unitKind], estimated: false, needsConfirmation: false, reason: null };
  }

  if (unitKind && NUTRITION_VOLUME_TO_ML[unitKind] !== undefined) {
    const density = food && typeof food.density === 'number' ? food.density : null;
    if (density === null) {
      return { grams: null, estimated: false, needsConfirmation: true, reason: 'volume-needs-density' };
    }
    const ml = amt * NUTRITION_VOLUME_TO_ML[unitKind];
    return { grams: ml * density, estimated: false, needsConfirmation: false, reason: null };
  }

  if (unitKind === 'piece' || unitKind === 'clove' || unitKind === 'slice') {
    const pieceGrams = lookupPieceWeight(normalizedName, unitKind);
    if (pieceGrams === null) {
      return { grams: null, estimated: false, needsConfirmation: true, reason: 'unknown-piece-weight' };
    }
    return { grams: amt * pieceGrams, estimated: true, needsConfirmation: false, reason: 'estimated-piece-weight' };
  }

  // Dose/Packung/Prise/unbekannte Einheit: keine verlaessliche generische Umrechnung.
  return { grams: null, estimated: false, needsConfirmation: true, reason: unitKind === 'container' ? 'container-unit' : 'unknown-unit' };
}
