/* ---------- Masseinheiten: Normalisierung & Umrechnung ---------- */
const WEIGHT_TABLE = { g: 1, kg: 1000, oz: 28.3495, lb: 453.592 };

const VOLUME_TABLE = { ml: 1, l: 1000, tsp: 4.92892, tbsp: 14.7868, cup: 236.588, floz: 29.5735 };

const METRIC_UNITS = new Set(['g', 'kg', 'ml', 'l']);

const IMPERIAL_UNITS = new Set(['oz', 'lb', 'cup', 'floz']);

const UNIT_ALIASES = {
  g: ['g', 'gr', 'gramm', 'gramme'],
  kg: ['kg', 'kilo', 'kilogramm'],
  oz: ['oz', 'ounce', 'ounces', 'unze', 'unzen'],
  lb: ['lb', 'lbs', 'pound', 'pounds', 'pfund'],
  ml: ['ml', 'milliliter', 'millilitre'],
  l: ['l', 'liter', 'litre'],
  tsp: ['tl', 'tsp', 'teelöffel', 'teaspoon', 'teaspoons'],
  tbsp: ['el', 'tbsp', 'esslöffel', 'tablespoon', 'tablespoons'],
  cup: ['cup', 'cups', 'tasse', 'tassen'],
  floz: ['floz', 'fl.oz', 'flooz', 'fluidounce', 'fluidounces'],
};

const UNIT_LABELS = { g: 'g', kg: 'kg', oz: 'oz', lb: 'lb', ml: 'ml', l: 'l', tsp: 'TL', tbsp: 'EL', cup: 'Cup', floz: 'fl. oz' };

function normalizeUnit(raw) {
  if (!raw) return null;
  const s = raw.toLowerCase().replace(/\.$/, '').trim();
  for (const [canonical, aliases] of Object.entries(UNIT_ALIASES)) {
    if (aliases.includes(s)) return canonical;
  }
  return null;
}

function roundNice(v) {
  if (v >= 100) return Math.round(v);
  if (v >= 10) return Math.round(v * 10) / 10;
  return Math.round(v * 100) / 100;
}

function unitDimension(canonical) {
  if (WEIGHT_TABLE[canonical]) return 'weight';
  if (VOLUME_TABLE[canonical]) return 'volume';
  return null;
}

function convertToSystem(amount, canonicalUnit, targetSystem) {
  const dim = unitDimension(canonicalUnit);
  if (!dim || typeof amount !== 'number' || isNaN(amount)) return null;
  if (targetSystem === 'metric' && METRIC_UNITS.has(canonicalUnit)) return null;
  if (targetSystem === 'imperial' && IMPERIAL_UNITS.has(canonicalUnit)) return null;
  if (!METRIC_UNITS.has(canonicalUnit) && !IMPERIAL_UNITS.has(canonicalUnit)) return null; // TL/EL bleiben unangetastet
  const table = dim === 'weight' ? WEIGHT_TABLE : VOLUME_TABLE;
  const base = amount * table[canonicalUnit];
  const candidates = dim === 'weight'
    ? (targetSystem === 'metric' ? ['kg', 'g'] : ['lb', 'oz'])
    : (targetSystem === 'metric' ? ['l', 'ml'] : ['cup', 'floz']);
  for (const u of candidates) {
    const val = base / table[u];
    if (val >= 1) return { amount: roundNice(val), unit: u };
  }
  const last = candidates[candidates.length - 1];
  return { amount: roundNice(base / table[last]), unit: last };
}

function convertAmountExplicit(amount, fromCanonical, toCanonical) {
  const dimFrom = unitDimension(fromCanonical), dimTo = unitDimension(toCanonical);
  if (!dimFrom || dimFrom !== dimTo) return null;
  const table = dimFrom === 'weight' ? WEIGHT_TABLE : VOLUME_TABLE;
  return roundNice((amount * table[fromCanonical]) / table[toCanonical]);
}

function autoConvertIngredient(ing) {
  const amt = parseAmount(ing.amount);
  const canonical = normalizeUnit(ing.unit);
  if (amt === null || isNaN(amt) || !canonical) return ing;
  const result = convertToSystem(amt, canonical, state.unitSystem);
  if (!result) return ing;
  return { ...ing, amount: result.amount, unit: UNIT_LABELS[result.unit] };
}
