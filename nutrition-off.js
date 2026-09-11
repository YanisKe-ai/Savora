/* ---------- Nutrition-Quelle: Open Food Facts (Implementierungsauftrag Punkt 3, 27-29) ----------
   Ergaenzung fuer Markenprodukte/Barcodes — die Schweizer Datenbank (nutrition-swiss.js) bleibt
   fuer generische Lebensmittel die bevorzugte Quelle (Prioritaet siehe nutrition-matcher.js).

   Zwei echte, offiziell dokumentierte Endpunkte (Stand: manuell live gegen die Produktiv-API
   getestet, siehe Implementierungsbericht):
   - Barcode-Lookup: GET https://world.openfoodfacts.org/api/v3/product/{barcode}.json
     (stabil, Teil der offiziellen API v3)
   - Textsuche: GET https://search.openfoodfacts.org/search?q=...
     (Search-a-licious, das offizielle Nachfolgeprojekt der alten /cgi/search.pl-Suche, die laut
     OFF-eigener Doku aktuell abgeschaltet ist. Search-a-licious ist selbst noch Beta — Fehler
     werden deshalb bewusst weich behandelt statt die App zu blockieren, siehe Punkt 74.)

   Privatsphaere (Punkt 29): es wird NIE ein ganzes Rezept an OFF gesendet, ausschliesslich der
   Suchbegriff bzw. der Barcode selbst. Lizenz: Open Database License — Attribution "Open Food
   Facts" ist Pflicht (Punkt 30), siehe OFF_ATTRIBUTION unten.

   Wichtig: Browser duerfen den User-Agent-Header nicht per fetch() ueberschreiben (von der
   Fetch-Spezifikation verbotener Header) — die von OFF empfohlene eigene User-Agent-Kennzeichnung
   ist im Browser-Kontext technisch nicht moeglich und wird deshalb bewusst ausgelassen. */

const OFF_PRODUCT_BASE = 'https://world.openfoodfacts.org/api/v3/product/';

// Freitextsuche ist bewusst DEAKTIVIERT: search.openfoodfacts.org (Search-a-licious) sendet
// keinen Access-Control-Allow-Origin-Header, ein Browser-Fetch von einer anderen Origin
// (GitHub Pages) wird deshalb IMMER von der CORS-Policy blockiert — unabhaengig vom Code hier.
// Die alte Legacy-Suche (world.openfoodfacts.org/cgi/search.pl, die CORS haette) ist zusaetzlich
// serverseitig global abgeschaltet (HTTP 503, offiziell bestaetigt). Live gegen die Produktiv-API
// getestet (siehe Implementierungsbericht) — beides reproduzierbar, kein Savora-seitiger Fehler.
// Der Barcode-Lookup unten ist davon nicht betroffen: world.openfoodfacts.org sendet dort korrekt
// "Access-Control-Allow-Origin: *". Sollte OFF die Suche kuenftig CORS-faehig machen, reicht es,
// OFF_SEARCH_ENABLED auf true zu setzen.
const OFF_SEARCH_ENABLED = false;
const OFF_SEARCH_BASE = 'https://search.openfoodfacts.org/search';
const OFF_ATTRIBUTION = 'Open Food Facts (openfoodfacts.org), lizenziert unter der Open Database License';

// Mapping OFF-"nutriments"-Feldnamen (pro 100g) -> Savoras normalisierte Nutrient-Keys.
// Nur Felder, die OFF tatsaechlich konsistent liefert — alles andere bleibt bewusst weg,
// damit fehlende Werte null bleiben statt geraten zu werden.
const OFF_NUTRIENT_FIELD_MAP = {
  'energy-kcal_100g': 'energyKcal',
  'energy-kj_100g': 'energyKj',
  'proteins_100g': 'protein',
  'carbohydrates_100g': 'carbohydrates',
  'sugars_100g': 'sugars',
  'fat_100g': 'fat',
  'saturated-fat_100g': 'saturatedFat',
  'fiber_100g': 'fiber',
  'salt_100g': 'salt',
  'sodium_100g': 'sodium',
  'potassium_100g': 'potassium',
  'calcium_100g': 'calcium',
  'magnesium_100g': 'magnesium',
  'phosphorus_100g': 'phosphorus',
  'iron_100g': 'iron',
  'zinc_100g': 'zinc',
  'iodine_100g': 'iodide',
  'selenium_100g': 'selenium',
  'vitamin-a_100g': 'vitaminA',
  'vitamin-b1_100g': 'vitaminB1',
  'vitamin-b2_100g': 'vitaminB2',
  'vitamin-b6_100g': 'vitaminB6',
  'vitamin-b12_100g': 'vitaminB12',
  'vitamin-b9_100g': 'folate',
  'vitamin-c_100g': 'vitaminC',
  'vitamin-d_100g': 'vitaminD',
  'vitamin-e_100g': 'vitaminE',
  'vitamin-k_100g': 'vitaminK',
};

// OFF liefert Mineralstoffe/Vitamine in kg statt g/mg/µg -> auf unsere Einheiten (siehe
// NUTRIENT_KEYS) umrechnen. Fehlt ein Faktor, wird der Rohwert unveraendert uebernommen.
const OFF_UNIT_SCALE = {
  sodium: 1000, potassium: 1000, calcium: 1000, magnesium: 1000, phosphorus: 1000, iron: 1000, zinc: 1000, // g -> mg
  iodide: 1e6, selenium: 1e6, vitaminA: 1e6, vitaminB12: 1e6, folate: 1e6, vitaminD: 1e6, vitaminK: 1e6, // g -> µg
  vitaminB1: 1000, vitaminB2: 1000, vitaminB6: 1000, vitaminC: 1000, vitaminE: 1000, // g -> mg
};

function normalizeOffProduct(raw, barcode) {
  const p = raw.product || raw;
  const nutriments = p.nutriments || {};
  const nutrientsPer100g = emptyNutrients();
  for (const [offField, key] of Object.entries(OFF_NUTRIENT_FIELD_MAP)) {
    const v = nutriments[offField];
    if (typeof v !== 'number' || isNaN(v)) continue;
    const scale = OFF_UNIT_SCALE[key];
    nutrientsPer100g[key] = scale ? v * scale : v;
  }
  const name = p.product_name_de || p.product_name || p.generic_name || ('Produkt ' + barcode);
  return {
    id: 'off-' + barcode,
    source: 'open-food-facts',
    sourceId: barcode,
    barcode,
    name,
    language: p.product_name_de ? 'de' : 'en',
    synonyms: [],
    category: (p.categories || '').split(',')[0] || null,
    brand: p.brands || null,
    density: null, // OFF liefert keine verlaessliche Dichte -> nie erfinden
    nutrientsPer100g,
    retrievedAt: Date.now(),
  };
}

/* Barcode-Lookup. Gibt { status, food } zurueck — status ist 'found' | 'not-found' | 'offline' | 'error',
   NIE ein throw fuer die erwartbaren Faelle (Punkt 74 "Barcode nicht gefunden", "API offline"). */
async function fetchOffProductByBarcode(barcode) {
  const code = String(barcode || '').trim();
  if (!/^\d{6,14}$/.test(code)) return { status: 'invalid', food: null };
  if (navigator.onLine === false) return { status: 'offline', food: null };

  const fields = ['code', 'product_name', 'product_name_de', 'generic_name', 'brands', 'categories', 'quantity', 'nutriments'].join(',');
  let res;
  try {
    res = await fetch(OFF_PRODUCT_BASE + encodeURIComponent(code) + '.json?fields=' + fields);
  } catch (err) {
    return { status: 'offline', food: null };
  }
  // WICHTIG: OFF antwortet bei unbekanntem Barcode mit HTTP 404, aber einem aussagekraeftigen
  // JSON-Body (status: "failure", result.id: "product_not_found") — der Body wird deshalb IMMER
  // gelesen, nicht nur bei res.ok. Nur bei einem 5xx-Serverfehler oder kaputtem JSON gilt "error".
  let data;
  try {
    data = await res.json();
  } catch (err) {
    return { status: res.ok ? 'error' : (res.status >= 500 ? 'error' : 'not-found'), food: null };
  }
  if (data.status === 'failure' || !data.product) return { status: 'not-found', food: null };
  if (!res.ok) return { status: 'error', food: null };

  const food = normalizeOffProduct(data, code);
  // Lokal cachen (Punkt 28 offline-first: einmal abgerufene Produkte bleiben offline verfuegbar).
  try { await dbPutNutritionFoodsBulk([food]); } catch (err) { /* Cache-Fehler duerfen die Anzeige nicht blockieren */ }
  return { status: 'found', food };
}

/* Textsuche ueber Search-a-licious (Beta). Schlaegt die Suche fehl (Netzwerk, 5xx, unerwartetes
   Format), wird das NIE als Absturz sichtbar — der Aufrufer bekommt ein leeres Ergebnis mit
   erklaerendem Status und kann z.B. "Online-Suche momentan nicht verfuegbar" anzeigen. */
async function searchOffProducts(query, limit = 10) {
  if (!OFF_SEARCH_ENABLED) return { status: 'disabled', results: [] };
  const q = (query || '').trim();
  if (!q) return { status: 'empty', results: [] };
  if (navigator.onLine === false) return { status: 'offline', results: [] };

  const params = new URLSearchParams({ q, page_size: String(limit), fields: 'code,product_name,product_name_de,brands' });
  let res;
  try {
    res = await fetch(OFF_SEARCH_BASE + '?' + params.toString());
  } catch (err) {
    return { status: 'unavailable', results: [] };
  }
  if (!res.ok) return { status: 'unavailable', results: [] };
  let data;
  try {
    data = await res.json();
  } catch (err) {
    return { status: 'unavailable', results: [] };
  }
  const hits = Array.isArray(data.hits) ? data.hits : [];
  const results = hits
    .filter((h) => h.code)
    .map((h) => ({
      id: 'off-' + h.code,
      source: 'open-food-facts',
      sourceId: h.code,
      barcode: h.code,
      name: h.product_name_de || h.product_name || ('Produkt ' + h.code),
      brand: (h.brands && h.brands[0]) || null,
      // Noch keine Naehrwerte hier — die Suche liefert nur Metadaten, die vollen Werte
      // kommen erst beim Bestaetigen per fetchOffProductByBarcode (weniger Daten pro Zeile).
    }));
  return { status: 'ok', results };
}
