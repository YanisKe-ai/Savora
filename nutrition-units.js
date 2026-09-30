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
  piece: ['stück', 'stk', 'stk.', 'piece', 'pieces', 'sprig', 'sprigs', 'stalk', 'stalks', 'head', 'heads', 'stange', 'stangen', 'blatt', 'blätter', 'kopf', 'köpfe', 'knolle', 'knollen', 'zweig', 'zweige', 'stiel', 'stiele', 'stängel', 'kugel', 'kugeln', 'ecke', 'ecken'],
  clove: ['zehe', 'zehen', 'clove', 'cloves'],
  slice: ['scheibe', 'scheiben', 'slice', 'slices'],
  pinch: ['prise', 'prisen', 'pinch', 'dash', 'msp', 'messerspitze', 'messerspitzen'],
  handful: ['handvoll', 'handful'],
  splash: ['schuss', 'spritzer'],
  bunch: ['bund', 'bd', 'bündel', 'bunch'],
  cube: ['würfel', 'würfeli'],
  pack: ['package', 'packages', 'päckchen', 'päckli', 'paeckli', 'paeckchen', 'pck', 'pk', 'pkg', 'packung', 'packungen', 'beutel'],
  container: ['dose', 'dosen', 'can', 'cans', 'jar', 'jars', 'glas', 'gläser', 'flasche', 'flaschen', 'becher', 'tube'],
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
  { match: 'süsskartoffel', grams: 250, unit: 'piece' },
  { match: 'paprika', grams: 160, unit: 'piece' },
  { match: 'schweinsfilet', grams: 300, unit: 'piece' },
  { match: 'schweinefilet', grams: 300, unit: 'piece' },
  { match: 'rindsfilet', grams: 250, unit: 'piece' },
  { match: 'zwiebel', grams: 110, unit: 'piece' },
  { match: 'lammkotelett', grams: 120, unit: 'piece' },
  { match: 'schweinskotelett', grams: 180, unit: 'piece' },
  { match: 'schweinekotelett', grams: 180, unit: 'piece' },
  { match: 'kotelett', grams: 170, unit: 'piece' },
  { match: 'entenbrust', grams: 250, unit: 'piece' },
  { match: 'entenbrü', grams: 250, unit: 'piece' },
  { match: 'rippli', grams: 200, unit: 'piece' },
  { match: 'tintenfisch', grams: 300, unit: 'piece' },
  { match: 'ganzes poulet', grams: 1200, unit: 'piece' },
  { match: 'poulet ganz', grams: 1200, unit: 'piece' },
  { match: 'brathähnchen', grams: 1200, unit: 'piece' },
  { match: 'mandarine', grams: 70, unit: 'piece' },
  { match: 'clementine', grams: 70, unit: 'piece' },
  { match: 'aprikose', grams: 45, unit: 'piece' },
  { match: 'zwetschge', grams: 40, unit: 'piece' },
  { match: 'pflaume', grams: 40, unit: 'piece' },
  { match: 'melone', grams: 1000, unit: 'piece' },
  { match: 'kopfsalat', grams: 250, unit: 'piece' },
  { match: 'blätterteig', grams: 275, unit: 'piece' },
  { match: 'pizzateig', grams: 250, unit: 'piece' },
  { match: 'mürbeteig', grams: 230, unit: 'piece' },
  { match: 'bier', grams: 330, unit: 'piece' },
  { match: 'maiskolben', grams: 200, unit: 'piece' },
  { match: 'kirsche', grams: 8, unit: 'piece' },
  { match: 'traube', grams: 6, unit: 'piece' },
  { match: 'nektarine', grams: 140, unit: 'piece' },
  { match: 'pfirsich', grams: 150, unit: 'piece' },
  { match: 'wassermelone', grams: 3000, unit: 'piece' },
  { match: 'tofu', grams: 200, unit: 'piece' },
  { match: 'feige', grams: 50, unit: 'piece' },
  { match: 'sardelle', grams: 4, unit: 'piece' },
  { match: 'tortilla', grams: 40, unit: 'piece' },
  { match: 'frühlingszwiebel', grams: 15, unit: 'piece' },
  { match: 'lauchzwiebel', grams: 15, unit: 'piece' },
  { match: 'knoblauchzehe', grams: 5, unit: 'piece' },
  { match: 'eigelb', grams: 18, unit: 'piece' },
  { match: 'eiweiss', grams: 35, unit: 'piece' },
  { match: 'eiweiß', grams: 35, unit: 'piece' },
  { match: 'ei', grams: 53, unit: 'piece', wholeWordOnly: true, alsoMatch: ['eier'] },
  { match: 'zwiebel', grams: 110, unit: 'piece' },
  { match: 'schalotte', grams: 25, unit: 'piece' },
  { match: 'zitrone', grams: 58, unit: 'piece' },
  { match: 'limette', grams: 44, unit: 'piece' },
  { match: 'apfel', grams: 180, unit: 'piece' },
  { match: 'äpfel', grams: 180, unit: 'piece' },
  { match: 'birnen', grams: 180, unit: 'piece' },
  { match: 'banane', grams: 120, unit: 'piece' },
  { match: 'kartoffel', grams: 150, unit: 'piece' },
  { match: 'tomate', grams: 123, unit: 'piece' },
  { match: 'karotte', grams: 61, unit: 'piece' },
  { match: 'rüebli', grams: 61, unit: 'piece' },
  { match: 'peperoni', grams: 120, unit: 'piece' },
  { match: 'avocado', grams: 170, unit: 'piece' },
  { match: 'zucchetti', grams: 200, unit: 'piece' },
  { match: 'zucchini', grams: 200, unit: 'piece' },
  { match: 'aubergine', grams: 250, unit: 'piece' },
  { match: 'gurke', grams: 300, unit: 'piece' },
  { match: 'broccoli', grams: 350, unit: 'piece' },
  { match: 'brokkoli', grams: 350, unit: 'piece' },
  { match: 'blumenkohl', grams: 600, unit: 'piece' },
  { match: 'stangensellerie', grams: 45, unit: 'piece' },
  { match: 'sellerie', grams: 400, unit: 'piece' },
  { match: 'lauch', grams: 200, unit: 'piece' },
  { match: 'porree', grams: 200, unit: 'piece' },
  { match: 'rande', grams: 100, unit: 'piece' },
  { match: 'kohlrabi', grams: 200, unit: 'piece' },
  { match: 'fenchel', grams: 250, unit: 'piece' },
  { match: 'süsskartoffel', grams: 250, unit: 'piece' },
  { match: 'chili', grams: 15, unit: 'piece' },
  { match: 'ingwer', grams: 25, unit: 'piece' },
  { match: 'knoblauch', grams: 45, unit: 'piece' },
  { match: 'birne', grams: 180, unit: 'piece' },
  { match: 'kiwi', grams: 75, unit: 'piece' },
  { match: 'kabis', grams: 1000, unit: 'piece' },
  { match: 'rotkohl', grams: 1000, unit: 'piece' },
  { match: 'pouletschenkel', grams: 150, unit: 'piece' },
  { match: 'pouletkeule', grams: 200, unit: 'piece' },
  { match: 'orange', grams: 200, unit: 'piece' },
  { match: 'pfirsich', grams: 150, unit: 'piece' },
  { match: 'mango', grams: 300, unit: 'piece' },
  { match: 'brötchen', grams: 60, unit: 'piece' },
  { match: 'semmel', grams: 60, unit: 'piece' },
  { match: 'weggli', grams: 60, unit: 'piece' },
  { match: 'pouletbrust', grams: 160, unit: 'piece' },
  { match: 'pouletbrü', grams: 160, unit: 'piece' },
  { match: 'poulet brust', grams: 160, unit: 'piece' },
  { match: 'hähnchenbrust', grams: 160, unit: 'piece' },
  { match: 'schnitzel', grams: 120, unit: 'piece' },
  { match: 'würstchen', grams: 50, unit: 'piece' },
  { match: 'wienerli', grams: 50, unit: 'piece' },
  { match: 'bratwurst', grams: 120, unit: 'piece' },
  { match: 'cervelat', grams: 100, unit: 'piece' },
  { match: 'tortilla', grams: 40, unit: 'piece' },
  { match: 'champignon', grams: 20, unit: 'piece' },
  { match: 'cherrytomate', grams: 15, unit: 'piece' },
  { match: 'mozzarella', grams: 125, unit: 'piece' },
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

/* Gebinde-/Bundgewichte (geschaetzt, gaengige Packungsgroessen). Key = Teil des Zutatennamens. */
const PACK_WEIGHT_TABLE = {
  container: [['joghurt', 180], ['sahne', 200], ['rahm', 200], ['crème fraîche', 150], ['quark', 250], ['passata', 700], ['bouillon', 200], ['fond', 400], ['tomate', 400], ['mais', 285], ['bohne', 240], ['kichererbse', 240], ['linse', 240], ['erbse', 250], ['thon', 112], ['thunfisch', 112], ['kokos', 400], ['champignon', 230], ['ananas', 340], ['mandarine', 175], ['sardine', 90], ['maroni', 200]],
  pack: [['joghurt', 180], ['sahne', 200], ['rahm', 200], ['passata', 700], ['backpulver', 15], ['vanillezucker', 8], ['vanillin', 1], ['trockenhefe', 7], ['hefe', 7], ['puddingpulver', 40], ['gelatine', 10], ['butter', 250], ['mozzarella', 125], ['blätterteig', 250], ['pizzateig', 250], ['mürbeteig', 250], ['teig', 250], ['mascarpone', 250], ['quark', 250], ['frischkäse', 200], ['speck', 150], ['tofu', 200], ['spinat', 450], ['rahm', 200], ['sahne', 200], ['sauerrahm', 180]],
  bunch: [['petersilie', 50], ['schnittlauch', 25], ['basilikum', 30], ['koriander', 30], ['dill', 30], ['minze', 30], ['rucola', 100], ['radieschen', 150], ['frühlingszwiebel', 120], ['lauchzwiebel', 120], ['rüebli', 400], ['karotte', 400], ['spargel', 500], ['mangold', 400], ['thymian', 15], ['rosmarin', 15]],
  cube: [['hefe', 42], ['bouillon', 10], ['brühe', 10], ['fond', 10]],
};
const BUNCH_DEFAULT_GRAMS = 30; // Kraeuterbund, falls der Name nichts Genaueres verraet

function lookupPackWeight(kind, normalizedName) {
  const list = PACK_WEIGHT_TABLE[kind] || [];
  for (const [key, grams] of list) if (normalizedName.includes(key)) return grams;
  return kind === 'bunch' ? BUNCH_DEFAULT_GRAMS : null;
}

/* Richtdichten (g/ml) fuer Loeffel-/Tassen-/dl-Angaben, wenn die Datenbank keine Dichte liefert.
   Standard-Kuechenwerte, immer als "geschaetzt" gekennzeichnet. Reihenfolge: spezifisch vor allgemein. */
const DENSITY_HINTS = [
  [/tomate|passata|tomaten/, 1.03],
  [/paniermehl|semmelbrösel/, 0.45], [/puderzucker|staubzucker/, 0.55], [/zucker/, 0.85], [/kochsalz|\bsalz\b/, 1.2],
  [/haferflocken/, 0.35], [/kakaopulver|kakao/, 0.45], [/milchpulver/, 0.5], [/stärke/, 0.6], [/weizenmehl|dinkelmehl|roggenmehl|mehl/, 0.55],
  [/reis|griess|couscous|bulgur|quinoa|hirse/, 0.8], [/linse|kichererbse|bohne/, 0.8],
  [/mandel|haselnuss|baumnuss|erdnuss|cashew|pinienkern|kerne|samen|sesam|chia|leinsamen/, 0.5],
  [/paprika \(gewürz\)|zimt|kurkuma|curry|muskat|pfeffer|gewürz/, 0.45], [/rosine|getrocknet/, 0.65],
  [/reibkäse|parmesan|sbrinz/, 0.4],
  [/honig|sirup|agave|ahorn|melasse|dicksaft/, 1.4], [/tomatenpüree|tomatenmark/, 1.1], [/ketchup|sojasauce|worcester/, 1.15],
  [/mayonnaise/, 0.95], [/erdnussbutter|hummus|konfitüre|senf/, 1.1],
  [/butter|margarine|schmalz|kokosfett/, 0.95],
  [/öl\b|öl,|^öl/, 0.92],
  [/rahm|sahne|mascarpone|frischkäse|quark|joghurt|milch|kefir|buttermilch|saft|bouillon|wein|bier|essig|wasser|sauce|suppe|branntwein|likör|rum|kaffee|tee/, 1.03],
];
function estimateDensity(food, normalizedName) {
  const hay = ((food && food.name ? food.name.toLowerCase() : '') + ' | ' + (normalizedName || '')).toLowerCase();
  for (const [re, d] of DENSITY_HINTS) if (re.test(hay)) return d;
  return null;
}

/* Milliliter pro Einheit: nutzt die im Rechner gewaehlten Loeffelmasse (Schweiz: TL 5 ml, EL 15 ml, Tasse 250 ml). */
function nutMlPerUnit(kind) {
  try {
    if (typeof ucVolumeTable === 'function') {
      const t = ucVolumeTable();
      const map = { tsp: t.tsp, tbsp: t.tbsp, cup: t.cup };
      if (map[kind]) return map[kind];
    }
  } catch (e) { /* Rueckfall auf die festen Werte unten */ }
  return NUTRITION_VOLUME_TO_ML[kind];
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
    const ml = amt * nutMlPerUnit(unitKind);
    const dbDensity = food && typeof food.density === 'number' ? food.density : null;
    if (dbDensity !== null) return { grams: ml * dbDensity, estimated: false, needsConfirmation: false, reason: null };
    const guess = estimateDensity(food, normalizedName);
    if (guess === null) return { grams: null, estimated: false, needsConfirmation: true, reason: 'volume-needs-density' };
    return { grams: ml * guess, estimated: true, needsConfirmation: false, reason: 'estimated-density' };
  }

  if (unitKind === 'piece' || unitKind === 'clove' || unitKind === 'slice') {
    const pieceGrams = lookupPieceWeight(normalizedName, unitKind);
    if (pieceGrams === null) {
      return { grams: null, estimated: false, needsConfirmation: true, reason: 'unknown-piece-weight' };
    }
    return { grams: amt * pieceGrams, estimated: true, needsConfirmation: false, reason: 'estimated-piece-weight' };
  }

  if (unitKind === 'pinch') return { grams: amt * 0.4, estimated: true, needsConfirmation: false, reason: 'estimated-pinch' };
  if (unitKind === 'handful') return { grams: amt * 30, estimated: true, needsConfirmation: false, reason: 'estimated-handful' };
  if (unitKind === 'splash') return { grams: amt * 10, estimated: true, needsConfirmation: false, reason: 'estimated-splash' };
  if (unitKind === 'bunch' || unitKind === 'pack' || unitKind === 'cube' || unitKind === 'container') {
    const w = lookupPackWeight(unitKind, normalizedName);
    if (w !== null) return { grams: amt * w, estimated: true, needsConfirmation: false, reason: 'estimated-pack-weight' };
    return { grams: null, estimated: false, needsConfirmation: true, reason: unitKind === 'container' || unitKind === 'pack' ? 'container-unit' : 'unknown-unit' };
  }

  return { grams: null, estimated: false, needsConfirmation: true, reason: 'unknown-unit' };
}
