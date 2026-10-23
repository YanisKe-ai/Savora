/* ---------- IndexedDB layer ---------- */
const DB_NAME = 'savora-db';

const DB_VERSION = 6;   // 6 (v0.90): syncState, recipeTrash, pantry, householdItems, householdQueue (rein additiv)

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
        // Facts). id ist praefixiert pro Quelle (z.B. "swiss-10533"), daher
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
      /* ---------- v0.90 (DB_VERSION 6), rein additiv ---------- */
      // Abgleich-Zustand (Warteschlange, Meta, Basis-Hashes fuer Konflikte), keyPath = key
      if (!db.objectStoreNames.contains('syncState')) db.createObjectStore('syncState', { keyPath: 'key' });
      // Zuletzt geloeschte Rezepte {id, recipe, deletedAt, imageId}
      if (!db.objectStoreNames.contains('recipeTrash')) db.createObjectStore('recipeTrash', { keyPath: 'id' });
      // Vorrat {id, name, canonical, always, updatedAt}
      if (!db.objectStoreNames.contains('pantry')) db.createObjectStore('pantry', { keyPath: 'id' });
      // Gemeinsame Haushaltsliste: Eintraege und ausstehende Aenderungen (eigene Liste bleibt im Store shopping)
      if (!db.objectStoreNames.contains('householdItems')) db.createObjectStore('householdItems', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('householdQueue')) db.createObjectStore('householdQueue', { keyPath: 'id' });
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
  dbPromise.catch(() => { dbPromise = null; });   // fehlgeschlagenes Öffnen nicht dauerhaft merken: der nächste Versuch darf neu öffnen
  return dbPromise;
}

/* Schreibfehler einer Transaktion: bei vollem Speicher (QuotaExceededError, oft nur als onabort) einmal deutlich warnen. */
function dbTxFail(tx, reject) {
  const err = tx.error || new Error('Speichern fehlgeschlagen.');
  if (err && (err.name === 'QuotaExceededError' || /quota/i.test(err.message || '')) && typeof storageFullWarn === 'function') {
    try { storageFullWarn('db'); } catch (e) {}
  }
  reject(err);
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
    tx.onerror = tx.onabort = () => dbTxFail(tx, reject);   // bei vollem Speicher bricht die Transaktion ab (onabort), ohne dass onerror kommt
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
    tx.onerror = tx.onabort = () => dbTxFail(tx, reject);   // bei vollem Speicher bricht die Transaktion ab (onabort), ohne dass onerror kommt
  });
}

async function dbDeleteShopping(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('shopping', 'readwrite');
    tx.objectStore('shopping').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => dbTxFail(tx, reject);   // bei vollem Speicher bricht die Transaktion ab (onabort), ohne dass onerror kommt
  });
}

/* ---------- Bilder-Store: Fotos als Blob statt Data-URL im Rezeptobjekt ---------- */
async function dbPutImage(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('images', 'readwrite');
    tx.objectStore('images').put(record);
    tx.oncomplete = () => resolve(record);
    tx.onerror = tx.onabort = () => dbTxFail(tx, reject);   // bei vollem Speicher bricht die Transaktion ab (onabort), ohne dass onerror kommt
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
    tx.onerror = tx.onabort = () => dbTxFail(tx, reject);   // bei vollem Speicher bricht die Transaktion ab (onabort), ohne dass onerror kommt
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
    tx.onerror = tx.onabort = () => dbTxFail(tx, reject);   // bei vollem Speicher bricht die Transaktion ab (onabort), ohne dass onerror kommt
  });
}

async function dbDelete(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('recipes', 'readwrite');
    tx.objectStore('recipes').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => dbTxFail(tx, reject);   // bei vollem Speicher bricht die Transaktion ab (onabort), ohne dass onerror kommt
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
    tx.onerror = tx.onabort = () => dbTxFail(tx, reject);   // bei vollem Speicher bricht die Transaktion ab (onabort), ohne dass onerror kommt
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
    tx.onerror = tx.onabort = () => dbTxFail(tx, reject);   // bei vollem Speicher bricht die Transaktion ab (onabort), ohne dass onerror kommt
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
    tx.onerror = tx.onabort = () => dbTxFail(tx, reject);   // bei vollem Speicher bricht die Transaktion ab (onabort), ohne dass onerror kommt
  });
}

async function dbDeleteNutritionMatch(normalizedIngredient) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('nutritionMatches', 'readwrite');
    tx.objectStore('nutritionMatches').delete(normalizedIngredient);
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => dbTxFail(tx, reject);   // bei vollem Speicher bricht die Transaktion ab (onabort), ohne dass onerror kommt
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
    tx.onerror = tx.onabort = () => dbTxFail(tx, reject);   // bei vollem Speicher bricht die Transaktion ab (onabort), ohne dass onerror kommt
  });
}

async function dbDeleteNutritionResult(recipeId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('nutritionResults', 'readwrite');
    tx.objectStore('nutritionResults').delete(recipeId);
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => dbTxFail(tx, reject);   // bei vollem Speicher bricht die Transaktion ab (onabort), ohne dass onerror kommt
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
    tx.onerror = tx.onabort = () => dbTxFail(tx, reject);   // bei vollem Speicher bricht die Transaktion ab (onabort), ohne dass onerror kommt
  });
}

async function dbDeleteCustomFood(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('customFoods', 'readwrite');
    tx.objectStore('customFoods').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => dbTxFail(tx, reject);   // bei vollem Speicher bricht die Transaktion ab (onabort), ohne dass onerror kommt
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
    tx.onerror = tx.onabort = () => dbTxFail(tx, reject);   // bei vollem Speicher bricht die Transaktion ab (onabort), ohne dass onerror kommt
  });
}

/* ---------- v0.90-Stores (DB_VERSION 6): je getAll/get/put/delete/clear ---------- */
async function dbGetAllSyncState() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncState', 'readonly');
    const req = tx.objectStore('syncState').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetSyncState(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncState', 'readonly');
    const req = tx.objectStore('syncState').get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function dbPutSyncState(rec) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncState', 'readwrite');
    tx.objectStore('syncState').put(rec);
    tx.oncomplete = () => resolve(rec);
    tx.onerror = tx.onabort = () => dbTxFail(tx, reject);
  });
}

async function dbDeleteSyncState(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncState', 'readwrite');
    tx.objectStore('syncState').delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => dbTxFail(tx, reject);
  });
}

async function dbClearSyncState() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncState', 'readwrite');
    tx.objectStore('syncState').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => dbTxFail(tx, reject);
  });
}

async function dbGetAllRecipeTrash() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('recipeTrash', 'readonly');
    const req = tx.objectStore('recipeTrash').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetRecipeTrash(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('recipeTrash', 'readonly');
    const req = tx.objectStore('recipeTrash').get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function dbPutRecipeTrash(rec) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('recipeTrash', 'readwrite');
    tx.objectStore('recipeTrash').put(rec);
    tx.oncomplete = () => resolve(rec);
    tx.onerror = tx.onabort = () => dbTxFail(tx, reject);
  });
}

async function dbDeleteRecipeTrash(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('recipeTrash', 'readwrite');
    tx.objectStore('recipeTrash').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => dbTxFail(tx, reject);
  });
}

async function dbClearRecipeTrash() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('recipeTrash', 'readwrite');
    tx.objectStore('recipeTrash').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => dbTxFail(tx, reject);
  });
}

async function dbGetAllPantry() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pantry', 'readonly');
    const req = tx.objectStore('pantry').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetPantry(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pantry', 'readonly');
    const req = tx.objectStore('pantry').get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function dbPutPantry(rec) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pantry', 'readwrite');
    tx.objectStore('pantry').put(rec);
    tx.oncomplete = () => resolve(rec);
    tx.onerror = tx.onabort = () => dbTxFail(tx, reject);
  });
}

async function dbDeletePantry(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pantry', 'readwrite');
    tx.objectStore('pantry').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => dbTxFail(tx, reject);
  });
}

async function dbClearPantry() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pantry', 'readwrite');
    tx.objectStore('pantry').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => dbTxFail(tx, reject);
  });
}

async function dbGetAllHouseholdItems() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('householdItems', 'readonly');
    const req = tx.objectStore('householdItems').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetHouseholdItem(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('householdItems', 'readonly');
    const req = tx.objectStore('householdItems').get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function dbPutHouseholdItem(rec) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('householdItems', 'readwrite');
    tx.objectStore('householdItems').put(rec);
    tx.oncomplete = () => resolve(rec);
    tx.onerror = tx.onabort = () => dbTxFail(tx, reject);
  });
}

async function dbDeleteHouseholdItem(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('householdItems', 'readwrite');
    tx.objectStore('householdItems').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => dbTxFail(tx, reject);
  });
}

async function dbClearHouseholdItems() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('householdItems', 'readwrite');
    tx.objectStore('householdItems').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => dbTxFail(tx, reject);
  });
}

async function dbGetAllHouseholdQueue() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('householdQueue', 'readonly');
    const req = tx.objectStore('householdQueue').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetHouseholdQueue(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('householdQueue', 'readonly');
    const req = tx.objectStore('householdQueue').get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function dbPutHouseholdQueue(rec) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('householdQueue', 'readwrite');
    tx.objectStore('householdQueue').put(rec);
    tx.oncomplete = () => resolve(rec);
    tx.onerror = tx.onabort = () => dbTxFail(tx, reject);
  });
}

async function dbDeleteHouseholdQueue(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('householdQueue', 'readwrite');
    tx.objectStore('householdQueue').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => dbTxFail(tx, reject);
  });
}

async function dbClearHouseholdQueue() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('householdQueue', 'readwrite');
    tx.objectStore('householdQueue').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => dbTxFail(tx, reject);
  });
}

/* Mehrere Abgleich-Eintraege in EINER Transaktion schreiben (cloud.js buendelt Warteschlange und Meta). */
async function dbPutSyncStateMany(records) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncState', 'readwrite');
    const store = tx.objectStore('syncState');
    for (const r of records) store.put(r);
    tx.oncomplete = () => resolve(records.length);
    tx.onerror = tx.onabort = () => dbTxFail(tx, reject);
  });
}
