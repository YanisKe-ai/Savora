/* ---------- IndexedDB layer ---------- */
const DB_NAME = 'savora-db';

const DB_VERSION = 5;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error('IndexedDB wird von diesem Browser nicht unterstützt.')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('recipes')) {
        const store = db.createObjectStore('recipes', { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains('shopping')) {
        db.createObjectStore('shopping', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('mealplan')) {
        db.createObjectStore('mealplan', { keyPath: 'date' });
      }
      if (!db.objectStoreNames.contains('images')) {
        // Bilder ab jetzt als Blob statt als Data-URL im Rezeptobjekt — spart RAM/IndexedDB-
        // Overhead bei vielen Rezepten. Bestehende Rezepte mit alter r.image-Data-URL werden
        // NICHT zwangsmigriert (kein Risiko fuer vorhandene Fotos), sondern weiterhin direkt
        // angezeigt; nur neu hochgeladene Fotos nutzen ab sofort diesen Store.
        db.createObjectStore('images', { keyPath: 'id' });
      }
      /* ---------- Nutrition-Stores (Savora Nutrition C, ab DB_VERSION 5) ----------
         Rein additiv — bestehende Stores/Daten bleiben unberuehrt, alte Backups
         bleiben importierbar (siehe backup.js). */
      if (!db.objectStoreNames.contains('nutritionFoods')) {
        // Gecachte Lebensmittel aus allen Quellen (Schweizer DB, spaeter Open Food
        // Facts/USDA). id ist praefixiert pro Quelle (z.B. "swiss-10533"), daher
        // global eindeutig.
        const foods = db.createObjectStore('nutritionFoods', { keyPath: 'id' });
        foods.createIndex('source', 'source');
      }
      if (!db.objectStoreNames.contains('nutritionMatches')) {
        // Gelernte Zuordnungen: normalisierte Zutatenbezeichnung -> bestaetigtes
        // Lebensmittel. keyPath = normalizedIngredient, dadurch pro Text eindeutig.
        db.createObjectStore('nutritionMatches', { keyPath: 'normalizedIngredient' });
      }
      if (!db.objectStoreNames.contains('nutritionResults')) {
        // Berechnete Naehrwerte pro Rezept (versioniert, siehe Punkt 23). Ein Eintrag
        // pro Rezept, keyPath = recipeId.
        db.createObjectStore('nutritionResults', { keyPath: 'recipeId' });
      }
      if (!db.objectStoreNames.contains('customFoods')) {
        // Vom Nutzer selbst angelegte Lebensmittel (Punkt 9), gleiches normalisiertes
        // Format wie nutritionFoods, source: "custom".
        db.createObjectStore('customFoods', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('nutritionMeta')) {
        // Kleine Metadaten-Ablage, z.B. ob/welche Version der Schweizer Datenbank
        // bereits in nutritionFoods eingespielt wurde. keyPath = key.
        db.createObjectStore('nutritionMeta', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        // Ein anderer Tab/Fenster fuehrt ein DB-Upgrade durch — diese Verbindung schliessen,
        // damit das Upgrade dort nicht haengen bleibt (verhindert stillen Deadlock).
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error || new Error('IndexedDB konnte nicht geöffnet werden.'));
    req.onblocked = () => reject(new Error('Datenbank-Update blockiert — bitte alle anderen Savora-Tabs/-Fenster schliessen und neu laden.'));
  });
  return dbPromise;
}

async function dbGetAllMealplan() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('mealplan', 'readonly');
    const req = tx.objectStore('mealplan').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbPutMealplanDay(entry) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('mealplan', 'readwrite');
    tx.objectStore('mealplan').put(entry);
    tx.oncomplete = () => resolve(entry);
    tx.onerror = () => reject(tx.error);
  });
}

async function dbGetAllShopping() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('shopping', 'readonly');
    const req = tx.objectStore('shopping').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbPutShopping(item) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('shopping', 'readwrite');
    tx.objectStore('shopping').put(item);
    tx.oncomplete = () => resolve(item);
    tx.onerror = () => reject(tx.error);
  });
}

async function dbDeleteShopping(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('shopping', 'readwrite');
    tx.objectStore('shopping').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ---------- Bilder-Store: Fotos als Blob statt Data-URL im Rezeptobjekt ---------- */
async function dbPutImage(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('images', 'readwrite');
    tx.objectStore('images').put(record);
    tx.oncomplete = () => resolve(record);
    tx.onerror = () => reject(tx.error);
  });
}

async function dbGetImage(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('images', 'readonly');
    const req = tx.objectStore('images').get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function dbDeleteImage(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('images', 'readwrite');
    tx.objectStore('images').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbGetAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('recipes', 'readonly');
    const req = tx.objectStore('recipes').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(recipe) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('recipes', 'readwrite');
    tx.objectStore('recipes').put(recipe);
    tx.oncomplete = () => resolve(recipe);
    tx.onerror = () => reject(tx.error);
  });
}

async function dbDelete(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('recipes', 'readwrite');
    tx.objectStore('recipes').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ---------- Nutrition-Stores: nutritionFoods ---------- */
async function dbGetAllNutritionFoods() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('nutritionFoods', 'readonly');
    const req = tx.objectStore('nutritionFoods').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbCountNutritionFoods() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('nutritionFoods', 'readonly');
    const req = tx.objectStore('nutritionFoods').count();
    req.onsuccess = () => resolve(req.result || 0);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetNutritionFood(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('nutritionFoods', 'readonly');
    const req = tx.objectStore('nutritionFoods').get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

// Bulk-Insert in einer Transaktion (z.B. 1216 Eintraege beim ersten Seeding der
// Schweizer Datenbank) — deutlich schneller als 1216 Einzel-Transaktionen.
async function dbPutNutritionFoodsBulk(foods) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('nutritionFoods', 'readwrite');
    const store = tx.objectStore('nutritionFoods');
    for (const food of foods) store.put(food);
    tx.oncomplete = () => resolve(foods.length);
    tx.onerror = () => reject(tx.error);
  });
}

async function dbDeleteNutritionFoodsBySource(source) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('nutritionFoods', 'readwrite');
    const store = tx.objectStore('nutritionFoods');
    const idx = store.index('source');
    const req = idx.openCursor(IDBKeyRange.only(source));
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) { cursor.delete(); cursor.continue(); }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ---------- Nutrition-Stores: nutritionMatches (gelernte Zuordnungen) ---------- */
async function dbGetAllNutritionMatches() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('nutritionMatches', 'readonly');
    const req = tx.objectStore('nutritionMatches').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetNutritionMatch(normalizedIngredient) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('nutritionMatches', 'readonly');
    const req = tx.objectStore('nutritionMatches').get(normalizedIngredient);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function dbPutNutritionMatch(match) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('nutritionMatches', 'readwrite');
    tx.objectStore('nutritionMatches').put(match);
    tx.oncomplete = () => resolve(match);
    tx.onerror = () => reject(tx.error);
  });
}

async function dbDeleteNutritionMatch(normalizedIngredient) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('nutritionMatches', 'readwrite');
    tx.objectStore('nutritionMatches').delete(normalizedIngredient);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ---------- Nutrition-Stores: nutritionResults (Rezept-Naehrwerte) ---------- */
async function dbGetAllNutritionResults() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('nutritionResults', 'readonly');
    const req = tx.objectStore('nutritionResults').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetNutritionResult(recipeId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('nutritionResults', 'readonly');
    const req = tx.objectStore('nutritionResults').get(recipeId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function dbPutNutritionResult(result) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('nutritionResults', 'readwrite');
    tx.objectStore('nutritionResults').put(result);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  });
}

async function dbDeleteNutritionResult(recipeId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('nutritionResults', 'readwrite');
    tx.objectStore('nutritionResults').delete(recipeId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ---------- Nutrition-Stores: customFoods (eigene Lebensmittel) ---------- */
async function dbGetAllCustomFoods() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('customFoods', 'readonly');
    const req = tx.objectStore('customFoods').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbPutCustomFood(food) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('customFoods', 'readwrite');
    tx.objectStore('customFoods').put(food);
    tx.oncomplete = () => resolve(food);
    tx.onerror = () => reject(tx.error);
  });
}

async function dbDeleteCustomFood(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('customFoods', 'readwrite');
    tx.objectStore('customFoods').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ---------- Nutrition-Stores: nutritionMeta (kleine Metadaten-Ablage) ---------- */
async function dbGetNutritionMeta(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('nutritionMeta', 'readonly');
    const req = tx.objectStore('nutritionMeta').get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : null);
    req.onerror = () => reject(req.error);
  });
}

async function dbPutNutritionMeta(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('nutritionMeta', 'readwrite');
    tx.objectStore('nutritionMeta').put({ key, value });
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
  });
}
