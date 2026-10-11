/* Datei -> zwei komprimierte Blobs (Vollbild + Thumbnail), Skalierung ueber Canvas. */
function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { resolve(img); URL.revokeObjectURL(url); };
    img.onerror = reject;
    img.src = url;
  });
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', quality));
}

async function scaleToBlob(img, maxW, quality) {
  const scale = Math.min(1, maxW / img.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvasToBlob(canvas, quality);
}

async function processImageFile(file) {
  const img = await loadImageFromFile(file);
  const [fullBlob, thumbBlob] = await Promise.all([
    scaleToBlob(img, 1200, 0.82),
    scaleToBlob(img, 320, 0.8),
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
