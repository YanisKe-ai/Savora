/* Datei -> zwei komprimierte Blobs (Vollbild + Thumbnail), Skalierung ueber Canvas.
   Grenzen (Audit B07): Dateigroesse, Gesamtpixel des Originals und laengste Kante der Ergebnisse sind begrenzt, damit ein
   riesiges oder verzerrtes Bild den Speicher nicht sprengt. Fehler tragen eine verstaendliche Meldung (userMessage);
   die Eingabedatei bleibt immer unveraendert. Transparenz wird bewusst auf Creme abgeflacht (JPEG kennt keine), nicht schwarz. */
const IMG_MAX_FILE_BYTES = 40 * 1024 * 1024;
const IMG_MAX_SOURCE_PIXELS = 60 * 1000 * 1000;   // 60 Megapixel: darueber droht dem Canvas der Speicher auszugehen
const IMG_MAX_EDGE_FULL = 1600;                   // laengste Kante des Vollbilds (frueher war nur die Breite begrenzt)
const IMG_FLAT_BACKGROUND = '#F7F4EE';

function imageError(message, name) { const e = new Error(message); e.name = name || 'ImageError'; e.userMessage = message; return e; }

const IMG_READ_ERROR = 'Dieses Foto kann nicht gelesen werden. Wähle ein Bild im Format JPEG, PNG oder WebP.';

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let url = '';
    const done = () => { if (url) { try { URL.revokeObjectURL(url); } catch (e) { /* ignorieren */ } url = ''; } };   // in jedem Ausgang freigeben, auch bei Fehlern
    try { url = URL.createObjectURL(file); } catch (e) { reject(imageError(IMG_READ_ERROR)); return; }
    img.onload = () => { done(); resolve(img); };
    img.onerror = () => { done(); reject(imageError(IMG_READ_ERROR)); };
    img.src = url;
  });
}

/* JPEG-Kopf lesen: EXIF-Ausrichtung (1 bis 8) und ungedrehte Rohmasse aus dem SOF-Block.
   Alles andere (PNG, WebP, kein EXIF, defekte Daten) ergibt Ausrichtung 1 und ohne Masse. */
async function readJpegInfo(file) {
  const info = { orient: 1, width: 0, height: 0 };
  try {
    if (!file || typeof file.slice !== 'function') return info;
    const buf = await file.slice(0, 262144).arrayBuffer();
    const v = new DataView(buf);
    if (v.byteLength < 12 || v.getUint16(0) !== 0xFFD8) return info;
    let off = 2;
    while (off + 4 <= v.byteLength) {
      const marker = v.getUint16(off);
      if ((marker & 0xFF00) !== 0xFF00) break;
      if (marker === 0xFFDA || marker === 0xFFD9) break;
      const len = v.getUint16(off + 2);
      if (marker === 0xFFE1 && off + 10 <= v.byteLength && v.getUint32(off + 4) === 0x45786966) {   // "Exif"
        const t = off + 10;
        const little = v.getUint16(t) === 0x4949;
        if (little || v.getUint16(t) === 0x4D4D) {
          const ifd = t + v.getUint32(t + 4, little);
          if (ifd + 2 <= v.byteLength) {
            const n = v.getUint16(ifd, little);
            for (let k = 0; k < n && ifd + 2 + k * 12 + 12 <= v.byteLength; k++) {
              const e = ifd + 2 + k * 12;
              if (v.getUint16(e, little) === 0x0112) { const o = v.getUint16(e + 8, little); if (o >= 1 && o <= 8) info.orient = o; break; }
            }
          }
        }
      } else if (marker >= 0xFFC0 && marker <= 0xFFCF && marker !== 0xFFC4 && marker !== 0xFFC8 && marker !== 0xFFCC && off + 9 <= v.byteLength) {   // SOFn
        info.height = v.getUint16(off + 5); info.width = v.getUint16(off + 7);
        break;
      }
      off += 2 + len;
    }
  } catch (e) { /* Foto ohne lesbaren Kopf gilt als nicht gedreht */ }
  return info;
}
async function readExifOrientation(file) { return (await readJpegInfo(file)).orient; }

/* Quelle fuer das Zeichnen laden, mit korrekt gedrehter Ausrichtung.
   1. createImageBitmap mit imageOrientation 'from-image' (dreht selbst), sonst <img> (moderne Browser drehen nach EXIF).
   2. Ist die Ausrichtung 5 bis 8 und liefert der Browser trotzdem die ungedrehten Rohmasse (aus dem JPEG-Kopf), drehen wir
      beim Zeichnen von Hand (manual). Der Browser-Fall bleibt unveraendert. */
async function loadImageSource(file) {
  const head = await readJpegInfo(file);
  let src = null;
  if (typeof createImageBitmap === 'function') {
    try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { src = null; }
  }
  if (!src) src = await loadImageFromFile(file);
  let w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
  let manual = 1;
  if (head.orient >= 5 && head.width > 0 && head.height > 0 && head.width !== head.height && w === head.width && h === head.height) {
    manual = head.orient; w = head.height; h = head.width;   // Rohdaten unverdreht: Masse nach der Drehung sind vertauscht
  }
  return { src, w, h, manual };
}

/* Quelle mit EXIF-Ausrichtung o (1 bis 8) in den Bereich (0,0,cw,ch) zeichnen; sw/sh sind die ungedrehten Rohmasse. */
function drawOriented(ctx, src, sw, sh, o, k) {
  ctx.save();
  ctx.scale(k, k);
  switch (o) {
    case 2: ctx.transform(-1, 0, 0, 1, sw, 0); break;
    case 3: ctx.transform(-1, 0, 0, -1, sw, sh); break;
    case 4: ctx.transform(1, 0, 0, -1, 0, sh); break;
    case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
    case 6: ctx.transform(0, 1, -1, 0, sh, 0); break;
    case 7: ctx.transform(0, -1, -1, 0, sh, sw); break;
    case 8: ctx.transform(0, -1, 1, 0, 0, sw); break;
    default: break;
  }
  ctx.drawImage(src, 0, 0, sw, sh);
  ctx.restore();
}

/* WebP nur, wenn der Browser es sicher kodiert (Safari liefert bei 'image/webp' stillschweigend PNG). Ergebnis wird gemerkt. */
let imgWebpSupport = null;
function webpEncodingSupported() {
  if (imgWebpSupport) return imgWebpSupport;
  imgWebpSupport = new Promise((resolve) => {
    try {
      const c = document.createElement('canvas'); c.width = c.height = 2;
      const ctx = c.getContext('2d'); if (ctx) { ctx.fillStyle = IMG_FLAT_BACKGROUND; ctx.fillRect(0, 0, 2, 2); }
      c.toBlob((b) => resolve(!!(b && b.type === 'image/webp' && b.size > 0)), 'image/webp', 0.8);
    } catch (e) { resolve(false); }
  });
  return imgWebpSupport;
}

function canvasToBlobAs(canvas, mime, quality) {
  return new Promise((resolve) => {
    try { canvas.toBlob((b) => resolve(b && b.size && b.type === mime ? b : null), mime, quality); } catch (e) { resolve(null); }
  });
}
async function canvasToBlob(canvas, quality) {
  if (await webpEncodingSupported()) { const w = await canvasToBlobAs(canvas, 'image/webp', quality); if (w) return w; }   // WebP, sonst JPEG
  return canvasToBlobAs(canvas, 'image/jpeg', quality);
}

async function scaleToBlob(source, maxW, maxEdge, quality) {
  const { src, w, h, manual } = source;   // w/h = Masse nach der Drehung
  if (!(w > 0 && h > 0)) throw imageError('Dieses Foto hat keine lesbare Grösse.');
  const scale = Math.min(1, maxW / w, maxEdge / Math.max(w, h));   // Breite wie bisher UND laengste Kante begrenzen, Seitenverhaeltnis bleibt
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw imageError('Das Foto kann auf diesem Gerät nicht verkleinert werden.');
  ctx.fillStyle = IMG_FLAT_BACKGROUND;
  ctx.fillRect(0, 0, canvas.width, canvas.height);   // Transparenz flach auf Creme
  if (manual > 1) drawOriented(ctx, src, manual >= 5 ? h : w, manual >= 5 ? w : h, manual, scale);
  else ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  const blob = await canvasToBlob(canvas, quality);
  canvas.width = canvas.height = 0;   // Speicher des Canvas sofort freigeben
  if (!blob || !blob.size) throw imageError('Das Foto konnte nicht verkleinert werden. Versuche ein anderes Bild oder ein kleineres Format.');
  return blob;
}

async function processImageFile(file) {
  if (!file || typeof file.size !== 'number') throw imageError(IMG_READ_ERROR);
  if (file.type && !/^image\//i.test(file.type)) throw imageError('Das ist keine Bilddatei. Wähle ein Bild im Format JPEG, PNG oder WebP.');
  if (file.size > IMG_MAX_FILE_BYTES) throw imageError(`Dieses Foto ist zu gross (${Math.round(file.size / 1048576)} MB, erlaubt sind ${Math.round(IMG_MAX_FILE_BYTES / 1048576)} MB). Wähle ein kleineres Bild.`);
  let source;
  try { source = await loadImageSource(file); } catch (e) { throw (e && e.userMessage) ? e : imageError(IMG_READ_ERROR); }
  try {
    if (source.w * source.h > IMG_MAX_SOURCE_PIXELS) throw imageError(`Dieses Foto hat zu viele Bildpunkte (${source.w} × ${source.h}). Wähle ein kleineres Bild.`);
    const [fullBlob, thumbBlob] = await Promise.all([
      scaleToBlob(source, 1200, IMG_MAX_EDGE_FULL, 0.82),
      scaleToBlob(source, 320, 640, 0.8),
    ]);
    return { fullBlob, thumbBlob, mime: fullBlob.type || 'image/jpeg' };
  } finally { if (source.src && source.src.close) { try { source.src.close(); } catch (e) { /* ignorieren */ } } }
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
