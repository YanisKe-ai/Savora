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

/* Registry fuer aktive object: URLs, damit sie beim naechsten Render sauber freigegeben werden
   (sonst haeufen sich pro Render neue Blob-URLs im Speicher an). */
let activeImageObjectUrls = [];

function revokeActiveImageObjectUrls() {
  activeImageObjectUrls.forEach((u) => URL.revokeObjectURL(u));
  activeImageObjectUrls = [];
}

async function hydrateLazyImages() {
  const nodes = document.querySelectorAll('[data-lazy-img]');
  if (!nodes.length) return;
  revokeActiveImageObjectUrls();
  for (const node of nodes) {
    const imageId = node.dataset.imageId;
    const kind = node.dataset.lazyImg; // 'thumb' | 'full'
    try {
      const record = await dbGetImage(imageId);
      if (!record) continue;
      const blob = kind === 'thumb' && record.thumbBlob ? record.thumbBlob : record.blob;
      const url = URL.createObjectURL(blob);
      activeImageObjectUrls.push(url);
      const img = document.createElement('img');
      img.src = url;
      img.alt = node.dataset.imgAlt || '';
      img.className = node.dataset.imgClass || '';
      if (node.style.cssText) img.style.cssText = node.style.cssText;
      node.replaceWith(img);
    } catch (e) { /* Bild bleibt Platzhalter, kein Absturz */ }
  }
}
