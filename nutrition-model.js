/* ---------- Nutrition: gemeinsames Datenmodell ----------
   Diese Datei definiert nur das Vokabular (Nährstoff-Keys, Einheiten, Labels,
   Confidence-Level) und ein paar reine Normalisierungs-Helfer. Keine DB-Zugriffe,
   keine UI — wird von nutrition-swiss.js, dem künftigen nutrition-matcher.js und
   nutrition-calculator.js gemeinsam genutzt.

   WICHTIG: ein fehlender Nährwert ist immer null, NIE 0. 0 bedeutet "gemessen und
   tatsächlich null", null bedeutet "keine Daten vorhanden". Diese Unterscheidung
   darf an keiner Stelle verloren gehen (siehe Implementierungsauftrag Punkt 5). */

/* Kategorien + Reihenfolge fuer die Detailansicht (Phase 3). Einheit ist die
   Einheit von nutrientsPer100g[key] (bezogen auf 100 g essbaren Anteil). */
const NUTRIENT_KEYS = {
  energyKcal:          { label: 'Energie',                unit: 'kcal', group: 'energy' },
  energyKj:             { label: 'Energie',                unit: 'kJ',   group: 'energy' },
  protein:               { label: 'Protein',                unit: 'g',    group: 'macro' },
  carbohydrates:         { label: 'Kohlenhydrate',           unit: 'g',    group: 'macro' },
  sugars:                { label: 'davon Zucker',            unit: 'g',    group: 'macro' },
  fiber:                  { label: 'Ballaststoffe',           unit: 'g',    group: 'macro' },
  fat:                    { label: 'Fett',                    unit: 'g',    group: 'macro' },
  saturatedFat:           { label: 'davon gesättigte Fettsäuren', unit: 'g', group: 'macro' },
  monounsaturatedFat:     { label: 'einfach ungesättigt',      unit: 'g',    group: 'macro' },
  polyunsaturatedFat:     { label: 'mehrfach ungesättigt',     unit: 'g',    group: 'macro' },
  salt:                   { label: 'Salz',                    unit: 'g',    group: 'mineral' },
  sodium:                 { label: 'Natrium',                 unit: 'mg',   group: 'mineral' },
  potassium:              { label: 'Kalium',                  unit: 'mg',   group: 'mineral' },
  calcium:                { label: 'Calcium',                 unit: 'mg',   group: 'mineral' },
  magnesium:              { label: 'Magnesium',                unit: 'mg',   group: 'mineral' },
  phosphorus:              { label: 'Phosphor',                 unit: 'mg',   group: 'mineral' },
  iron:                    { label: 'Eisen',                    unit: 'mg',   group: 'mineral' },
  iodide:                  { label: 'Jod',                      unit: 'µg',   group: 'mineral' },
  zinc:                    { label: 'Zink',                     unit: 'mg',   group: 'mineral' },
  selenium:                { label: 'Selen',                    unit: 'µg',   group: 'mineral' },
  vitaminA:                { label: 'Vitamin A',                unit: 'µg',   group: 'vitamin' },
  vitaminB1:                { label: 'Vitamin B1',               unit: 'mg',   group: 'vitamin' },
  vitaminB2:                { label: 'Vitamin B2',               unit: 'mg',   group: 'vitamin' },
  vitaminB6:                { label: 'Vitamin B6',               unit: 'mg',   group: 'vitamin' },
  vitaminB12:                { label: 'Vitamin B12',              unit: 'µg',   group: 'vitamin' },
  vitaminC:                  { label: 'Vitamin C',                unit: 'mg',   group: 'vitamin' },
  vitaminD:                  { label: 'Vitamin D',                unit: 'µg',   group: 'vitamin' },
  vitaminE:                  { label: 'Vitamin E',                unit: 'mg',   group: 'vitamin' },
  vitaminK:                  { label: 'Vitamin K',                unit: 'µg',   group: 'vitamin' }, // in CH-Datenbank nicht erfasst -> immer null
  folate:                    { label: 'Folat',                    unit: 'µg',   group: 'vitamin' },
  niacinEquivalent:          { label: 'Niacinäquivalent',          unit: 'mg',   group: 'vitamin' },
};

/* Kompakte Nutrition-Karte (Rezeptdetail, Punkt 24) zeigt nur diese Auswahl. */
const NUTRITION_COMPACT_KEYS = ['energyKcal', 'protein', 'carbohydrates', 'fat', 'fiber'];

/* Confidence-Level (Punkt 22) — nur Farbe reicht nicht, Text ist Pflicht. */
const NUTRITION_CONFIDENCE = {
  high:   { label: 'Hohe Genauigkeit',   order: 3 },
  medium: { label: 'Mittlere Genauigkeit', order: 2 },
  low:    { label: 'Grobe Schätzung',     order: 1 },
};

/* ---------- Quellenangabe (Reparatur-Auftrag Punkt 3) ----------
   Sammelt ALLE tatsaechlich fuer ein Rezept verwendeten Naehrwertquellen, nicht nur Swiss-FCD —
   sonst zeigt die PDF-Quellenzeile bei einer rein per Barcode oder als Custom Food erfassten
   Zutat faelschlich "Berechnete Durchschnittswerte" statt der echten Quelle. */
function buildSourceDataVersions(sourcesUsedSet) {
  const versions = {};
  if (sourcesUsedSet.has(SWISS_FCD_SOURCE)) versions[SWISS_FCD_SOURCE] = SWISS_FCD_VERSION;
  if (sourcesUsedSet.has('open-food-facts')) versions['open-food-facts'] = true;
  if (sourcesUsedSet.has('custom')) versions['custom'] = true;
  return versions;
}

/* Gemeinsam von nutrition-ui.js und pdf-templates.js genutzt, damit App-Anzeige und PDF nie
   auseinanderlaufen. Nennt jede tatsaechlich beteiligte Quelle, in fester Reihenfolge. */
function nutritionSourceLabel(sourceDataVersions) {
  if (!sourceDataVersions) return 'Berechnete Durchschnittswerte';
  const parts = [];
  if (sourceDataVersions[SWISS_FCD_SOURCE]) parts.push('Schweizer Nährwertdatenbank V' + sourceDataVersions[SWISS_FCD_SOURCE]);
  if (sourceDataVersions['open-food-facts']) parts.push('Open Food Facts');
  if (sourceDataVersions['custom']) parts.push('eigene Angaben');
  return parts.length ? parts.join(' · ') : 'Berechnete Durchschnittswerte';
}

/* Leeres, vollständig-null Nährwert-Objekt (Grundgerüst, jeder Key vorhanden). */
function emptyNutrients() {
  const out = {};
  for (const key of Object.keys(NUTRIENT_KEYS)) out[key] = null;
  return out;
}

/* Normalisiert eine Zutatenbezeichnung fuer Matching/Caching-Keys:
   Kleinschreibung, Umlaute bleiben (deutsches Matching), Mehrfach-Leerzeichen weg,
   Satzzeichen am Rand weg. Bewusst KEINE Steminierung — Variante C matcht ueber
   Synonyme in den Datenquellen, nicht ueber Sprachheuristik. */
function normalizeIngredientText(raw) {
  if (!raw) return '';
  return String(raw)
    .toLowerCase()
    .normalize('NFC')
    .replace(/[.,;:!?"'()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Trennt den eigentlichen Zutatennamen von Klammerzusaetzen: "Ei (verquirlen)", "Mehl (+ etwas zum Ausrollen)",
   "(ca. 1 gestrichener TL) Salz", "Petersilie [frisch]". Zum Zuordnen und Rechnen zaehlt nur der Name ohne Klammern.
   Der Klammertext wird zurueckgegeben (z. B. fuer "optional"), das Rezept selbst bleibt unveraendert.
   Eine nicht geschlossene Klammer ("Mehl (+ etwas") gilt bis zum Ende als Zusatz. */
function nutCleanIngredientName(raw) {
  let s = String(raw == null ? '' : raw);
  const removed = [];
  const re = /\([^()]*\)|\[[^\[\]]*\]/;
  for (let guard = 0; guard < 20; guard++) {
    const m = re.exec(s);
    if (!m) break;
    removed.push(m[0].slice(1, -1).trim());
    s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length);
  }
  const open = s.search(/[(\[]/);
  if (open >= 0) { removed.push(s.slice(open + 1).trim()); s = s.slice(0, open); }
  s = s.replace(/[)\]]/g, ' ').replace(/\s+/g, ' ').replace(/\s+([,;:])/g, '$1').replace(/^[\s,;:\-–]+|[\s,;:\-–]+$/g, '').trim();
  return { name: s, bracketText: removed.filter(Boolean).join(' ') };
}

/* Rundet fuer die Anzeige, ohne Scheingenauigkeit vorzutaeuschen (Punkt 26). */
function roundNutrientForDisplay(value) {
  if (value === null || value === undefined || isNaN(value)) return null;
  if (value >= 100) return Math.round(value);
  if (value >= 10) return Math.round(value * 10) / 10;
  return Math.round(value * 100) / 100;
}

/* Zerlegt einen normalisierten Text in Wort-Tokens (fuer das Matching, Punkt 8/14). */
function tokenizeText(normalized) {
  return (normalized || '').split(' ').filter(Boolean);
}

/* Sehr einfache Suffix-Reduktion fuer deutsche Substantive (Plural/Deklination), NUR fuer
   Matching-Zwecke (nicht fuer Anzeige!). Bewusst grob: Ziel ist, dass z.B. "Tomate" und
   "Tomaten" oder "Reis"+"trocken" und "trockener Reis" denselben Stamm ergeben — keine
   linguistisch korrekte Grundform. Kurze Woerter (<=5 Zeichen) bleiben unangetastet, um sie
   nicht kaputtzukuerzen (z.B. "Reis", "Milch" bleiben "Reis"/"Milch"). */
const GERMAN_NOUN_SUFFIXES = ['nen', 'en', 'er', 'es', 'em', 'e', 'n', 's'];
function stemDe(word) {
  if (!word || word.length <= 5) return word;
  for (const suf of GERMAN_NOUN_SUFFIXES) {
    if (word.endsWith(suf) && word.length - suf.length >= 3) {
      return word.slice(0, word.length - suf.length);
    }
  }
  return word;
}

/* ---------- Einheitliche Anzeige-Rundung fuer App und PDF (v0.86, F5) ----------
   Liefert den Zahlentext mit Dezimalkomma OHNE Einheit, oder null (kein Wert, nie "0").
   kcal/kJ ganzzahlig. Gramm: ab 10 ganz, ab 0,1 eine Nachkommastelle, darunter "< 0,1"; Salz unter 1 g zwei Stellen.
   mg/µg: ab 10 ganz, ab 1 eine Stelle, ab 0,01 zwei Stellen, darunter "< 0,01". Gemessene 0 bleibt "0". */
function nutUnitOfKey(key) {
  if (key === 'kcal' || key === 'kJ' || key === 'g' || key === 'mg' || key === 'µg') return key;
  return (typeof NUTRIENT_KEYS !== 'undefined' && NUTRIENT_KEYS[key]) ? NUTRIENT_KEYS[key].unit : 'g';
}
function nutRoundByRule(value, key) {
  const unit = nutUnitOfKey(key);
  const v = Math.abs(value);
  if (unit === 'kcal' || unit === 'kJ') return { n: Math.round(value), d: 0 };
  if (v === 0) return { n: 0, d: 0 };
  if (unit === 'g') {
    if (key === 'salt' && v < 1) {
      if (v < 0.01) return { lt: '0,01' };
      const r = Math.round(value * 100) / 100;
      if (Math.abs(r) >= 1) return { n: Math.round(value * 10) / 10, d: 1 };
      return { n: r, d: 2 };
    }
    if (v < 0.1) return { lt: '0,1' };
    if (v < 10) { const r = Math.round(value * 10) / 10; return Math.abs(r) >= 10 ? { n: Math.round(value), d: 0 } : { n: r, d: 1 }; }
    return { n: Math.round(value), d: 0 };
  }
  if (v < 0.01) return { lt: '0,01' };
  if (v < 1) { const r = Math.round(value * 100) / 100; return Math.abs(r) >= 1 ? { n: Math.round(value * 10) / 10, d: 1 } : { n: r, d: 2 }; }
  if (v < 10) { const r = Math.round(value * 10) / 10; return Math.abs(r) >= 10 ? { n: Math.round(value), d: 0 } : { n: r, d: 1 }; }
  return { n: Math.round(value), d: 0 };
}
function formatNutrient(value, key) {
  if (value === null || value === undefined || typeof value !== 'number' || !isFinite(value)) return null;
  const r = nutRoundByRule(value, key);
  if (r.lt) return '< ' + r.lt;
  return r.n.toFixed(r.d).replace('.', ',');
}
/* Spanne gleich gerundet: "9–11". Fallen beide Grenzen auf denselben Text, kommt ein Einzelwert. */
function formatNutrientRange(min, max, key) {
  const a = formatNutrient(min, key), b = formatNutrient(max, key);
  if (a === null && b === null) return null;
  if (a === null) return b;
  if (b === null) return a;
  if (a === b) return a;
  if (a.charAt(0) === '<') return 'bis ' + b;
  return a + '–' + b;
}

/* Salz aus Natrium ableiten (F10): Salz = Natrium × 2,5 (Natrium in mg, Salz in g). Nur wenn Natrium bekannt ist.
   Die Datenbank rundet Salz auf 0,1 g; eine 0 bei vorhandenem Natrium ist also "unter 0,05 g", kein Messwert 0. */
function nutSaltFromSodium(per100) {
  if (!per100) return null;
  const na = per100.sodium;
  if (typeof na !== 'number' || !isFinite(na)) return null;
  const salt = per100.salt;
  if (salt === null || salt === undefined || (salt === 0 && na > 0)) return Math.round(na * 2.5) / 1000;
  return null;
}
