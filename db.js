/* ---------- IndexedDB layer ---------- */
const DB_NAME = 'savora-db';

const DB_VERSION = 4;

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
