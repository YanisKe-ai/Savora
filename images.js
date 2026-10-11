/* Datei -> zwei komprimierte Blobs (Vollbild + Thumbnail), Skalierung ueber Canvas.
   Grenzen (Audit B07): Dateigroesse, Gesamtpixel des Originals und laengste Kante der Ergebnisse sind begrenzt, damit ein
   riesiges oder verzerrtes Bild den Speicher nicht sprengt. Fehler tragen eine verstaendliche Meldung (userMessage);
   die Eingabedatei bleibt immer unveraendert. Transparenz wird bewusst auf Creme abgeflacht (JPEG kennt keine), nicht schwarz. */
const IMG_MAX_FILE_BYTES = 40 * 1024 * 1024;
const IMG_MAX_SOURCE_PIXELS = 60 * 1000 * 1000;   // 60 Megapixel: darueber droht dem Canvas der Speicher auszugehen
const IMG_MAX_EDGE_FULL = 1600;                   // laengste Kante des Vollbilds (frueher war nur die Breite begrenzt)
const IMG_FLAT_BACKGROUND = '#F7F4EE';

function imageError(message, name) { const e = new Error(message); e.name = name || 'ImageError'; e.userMessage = message; return e; }

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let url = '';
    const done = () => { if (url) { try { URL.revokeObjectURL(url); } catch (e) { /* ignorieren */ } url = ''; } };   // in jedem Ausgang freigeben, auch bei Fehlern
    try { url = URL.createObjectURL(file); } catch (e) { reject(imageError('Dieses Foto kann nicht gelesen werden. Wähle ein Bild im Format JPEG, PNG oder WebP.')); return; }
    img.onload = () => { done(); resolve(img); };
    img.onerror = () => { done(); reject(imageError('Dieses Foto kann nicht gelesen werden. Wähle ein Bild im Format JPEG, PNG oder WebP.')); };
    img.src = url;
  });
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => {
    try { canvas.toBlob((b) => resolve(b), 'image/jpeg', quality); } catch (e) { resolve(null); }
  });
}

async function scaleToBlob(img, maxW, maxEdge, quality) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  if (!(w > 0 && h > 0)) throw imageError('Dieses Foto hat keine lesbare Grösse.');
  const scale = Math.min(1, maxW / w, maxEdge / Math.max(w, h));   // Breite wie bisher UND laengste Kante begrenzen, Seitenverhaeltnis bleibt
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw imageError('Das Foto kann auf diesem Gerät nicht verkleinert werden.');
  ctx.fillStyle = IMG_FLAT_BACKGROUND;
  ctx.fillRect(0, 0, canvas.width, canvas.height);   // Transparenz flach auf Creme
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await canvasToBlob(canvas, quality);
  canvas.width = canvas.height = 0;   // Speicher des Canvas sofort freigeben
  if (!blob || !blob.size) throw imageError('Das Foto konnte nicht verkleinert werden. Versuche ein anderes Bild oder ein kleineres Format.');
  return blob;
}

async function processImageFile(file) {
  if (!file || typeof file.size !== 'number') throw imageError('Dieses Foto kann nicht gelesen werden. Wähle ein Bild im Format JPEG, PNG oder WebP.');
  if (file.type && !/^image\//i.test(file.type)) throw imageError('Das ist keine Bilddatei. Wähle ein Bild im Format JPEG, PNG oder WebP.');
  if (file.size > IMG_MAX_FILE_BYTES) throw imageError(`Dieses Foto ist zu gross (${Math.round(file.size / 1048576)} MB, erlaubt sind ${Math.round(IMG_MAX_FILE_BYTES / 1048576)} MB). Wähle ein kleineres Bild.`);
  const img = await loadImageFromFile(file);
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  if (w * h > IMG_MAX_SOURCE_PIXELS) throw imageError(`Dieses Foto hat zu viele Bildpunkte (${w} × ${h}). Wähle ein kleineres Bild.`);
  const [fullBlob, thumbBlob] = await Promise.all([
    scaleToBlob(img, 1200, IMG_MAX_EDGE_FULL, 0.82),
    scaleToBlob(img, 320, 640, 0.8),
  ]);
  return { fullBlob, thumbBlob, mime: 'image/jpeg' };
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/* ---------- Lazy-Bilder aus IndexedDB ----------
   Platzhalter mit data-lazy-img werden erst geladen, wenn sie in die Naehe des sichtbaren Bereichs
   kommen (IntersectionObserver, 300 px Vorlauf). Das Hero-Bild der Detailseite startet sofort.
   - Hoechstens LAZY_IMG_PARALLEL IndexedDB-Lesevorgaenge gleichzeitig.
   - Jeder Aufruf von hydrateLazyImages() startet eine neue Generation: Ergebnisse einer aelteren
     Generation (veraltete Ansicht) oder fuer nicht mehr verbundene Knoten werden verworfen.
   - Object-URLs gehoeren zum erzeugten <img>; sie werden freigegeben, sobald das Bild nicht mehr im
     Dokument steht (beim naechsten Aufruf bzw. nach jedem geladenen Bild) oder beim Fehler. */
const LAZY_IMG_PARALLEL = 3;
const LAZY_IMG_MARGIN = '300px';
const lazyImgUrls = new Map();   // <img> -> object: URL
let lazyImgGeneration = 0;
let lazyImgObserver = null;
let lazyImgQueue = [];
let lazyImgActive = 0;

function releaseDetachedImageObjectUrls() {
  for (const [img, url] of lazyImgUrls) {
    if (!img.isConnected) { URL.revokeObjectURL(url); lazyImgUrls.delete(img); }
  }
}
/* Gibt ALLE gemerkten URLs frei (z.B. fuer Tests). Bilder im Dokument verlieren dabei ihre Quelle. */
function revokeActiveImageObjectUrls() {
  for (const url of lazyImgUrls.values()) URL.revokeObjectURL(url);
  lazyImgUrls.clear();
}

async function loadLazyImageNode(node, gen) {
  if (gen !== lazyImgGeneration || !node.isConnected) return;
  const imageId = node.dataset.imageId;
  const kind = node.dataset.lazyImg; // 'thumb' | 'full'
  try {
    const record = await dbGetImage(imageId);
    if (gen !== lazyImgGeneration || !node.isConnected || !record) return;   // veraltet: nichts in eine neue Ansicht schreiben
    const blob = kind === 'thumb' && record.thumbBlob ? record.thumbBlob : record.blob;
    const url = URL.createObjectURL(blob);
    const img = document.createElement('img');
    img.alt = node.dataset.imgAlt || '';
    img.className = node.dataset.imgClass || '';
    if (node.style.cssText) img.style.cssText = node.style.cssText;
    img.addEventListener('error', () => { URL.revokeObjectURL(url); lazyImgUrls.delete(img); }, { once: true });
    lazyImgUrls.set(img, url);
    img.src = url;
    node.replaceWith(img);
  } catch (e) { /* Bild bleibt Platzhalter, kein Absturz */ }
}

function pumpLazyImageQueue() {
  while (lazyImgActive < LAZY_IMG_PARALLEL && lazyImgQueue.length) {
    const job = lazyImgQueue.shift();
    if (job.gen !== lazyImgGeneration) continue;
    lazyImgActive++;
    loadLazyImageNode(job.node, job.gen).finally(() => {
      lazyImgActive--;
      releaseDetachedImageObjectUrls();
      pumpLazyImageQueue();
    });
  }
}

function hydrateLazyImages() {
  const gen = ++lazyImgGeneration;   // macht alle laufenden und wartenden Auftraege der alten Ansicht ungueltig
  if (lazyImgObserver) { lazyImgObserver.disconnect(); lazyImgObserver = null; }
  lazyImgQueue = [];
  releaseDetachedImageObjectUrls();
  const nodes = document.querySelectorAll('[data-lazy-img]');
  if (!nodes.length) return;
  const enqueue = (node, front) => {
    const job = { node, gen };
    if (front) lazyImgQueue.unshift(job); else lazyImgQueue.push(job);
    pumpLazyImageQueue();
  };
  if (typeof IntersectionObserver === 'undefined') { nodes.forEach((n) => enqueue(n)); return; }
  lazyImgObserver = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      lazyImgObserver.unobserve(e.target);
      enqueue(e.target);
    }
  }, { rootMargin: LAZY_IMG_MARGIN });
  for (const node of nodes) {
    if ((node.dataset.imgClass || '') === 'hero-img') enqueue(node, true);   // Hero-Bild: sofort, nicht erst nach Beobachtung
    else lazyImgObserver.observe(node);
  }
}
