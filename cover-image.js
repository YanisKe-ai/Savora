/* ---------- Cover-Bilder: Import, Speicherung, Laden, Aufraeumen (Paket C4) ----------
   FESTE SCHNITTSTELLE (siehe cover-model.js, Datenform cfg.cover.image = { id, fit, cx, cy, zoom, w, h }). Alles global und async.
     coverImageImport(file, bookKey)  -> Promise<{ id, w, h }>   prueft, dreht nach EXIF, skaliert (hoechstens 2480 px lange Kante, nie gestreckt, nie
                                         vergroessert), speichert im Store 'images' ({ id, blob, thumbBlob, mime, kind: 'cover', w, h }), schreibt NICHTS in cfg.
                                         w/h = Pixel des GESPEICHERTEN Bildes (das Bild, das coverImageLoad liefert). Fehler tragen .userMessage (fertiger deutscher Text).
     coverImageLoad(id)               -> Promise<ImageBitmap|HTMLCanvasElement|null>   Cache fuer hoechstens 2 Bilder; Aufrufer duerfen das Ergebnis NICHT close()n
                                         (es kann aus dem Cache nochmals geliefert werden). Fehler oder unbekannte ID -> null.
     coverImageRemove(id[, { force }]) -> Promise<void>   loescht nur IDs mit Praefix 'cover-' (nie Rezeptbilder). Ist die ID noch in einem Kochbuch gespeichert
                                         (z. B. nach «Duplizieren» geteilt), bleibt das Bild erhalten, ausser force: true.
     coverImageIdsInUse()             -> string[]   Cover-Bild-IDs aus ALLEN Kochbuch-Projekten (fuer Sicherung, Abgleich, Aufraeumen)
     coverImageGc()                   -> Promise<number>   NUR manuell: loescht Cover-Bilder, die in keinem Kochbuch mehr stehen. Nie automatisch.
     coverImageSyncNote()             -> string|''   ehrlicher Hinweis, wenn Bilder (noch) nicht zwischen Geraeten abgeglichen werden
   Cover-Bilder werden von den Loeschroutinen fuer Rezeptbilder nie beruehrt: sie loeschen nur ihre eigenen Rezept-imageId. */
const COVER_IMG_PREFIX = 'cover-';
const COVER_IMG_MAX_EDGE = 2480;
const COVER_IMG_THUMB_EDGE = 320;
const COVER_IMG_MAX_BYTES = 25 * 1024 * 1024;
const COVER_IMG_MAX_PIXELS = 40 * 1000 * 1000;
const COVER_IMG_MSG_FORMAT = 'Dieses Format wird nicht unterstützt. Speichere das Bild als JPEG oder PNG.';
const COVER_IMG_MSG_CORRUPT = 'Dieses Bild kann nicht gelesen werden. Die Datei ist vermutlich beschädigt. Wähle ein anderes Bild.';

function coverImageError(message) { const e = new Error(message); e.name = 'CoverImageError'; e.userMessage = message; return e; }

/* Format und Pixelmasse aus dem Dateikopf (ohne Decodierung). fmt: 'jpeg'|'png'|'webp'|'other'|'unknown'. w/h = 0, wenn nicht lesbar. */
function coverImageParseHeader(buf) {
  const v = new DataView(buf), n = v.byteLength, out = { fmt: 'unknown', w: 0, h: 0 };
  const tag = (o, s) => { if (o + s.length > n) return false; for (let i = 0; i < s.length; i++) if (v.getUint8(o + i) !== s.charCodeAt(i)) return false; return true; };
  if (n >= 4 && v.getUint8(0) === 0xFF && v.getUint8(1) === 0xD8 && v.getUint8(2) === 0xFF) {
    out.fmt = 'jpeg';
    let off = 2;
    while (off + 4 <= n) {
      if (v.getUint8(off) !== 0xFF) break;
      const m = v.getUint8(off + 1);
      if (m === 0xFF) { off += 1; continue; }
      if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { off += 2; continue; }
      if (m === 0xD9 || m === 0xDA) break;
      const len = v.getUint16(off + 2);
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC && off + 9 <= n) { out.h = v.getUint16(off + 5); out.w = v.getUint16(off + 7); break; }
      off += 2 + len;
    }
  } else if (n >= 24 && v.getUint8(0) === 0x89 && tag(1, 'PNG')) {
    out.fmt = 'png'; out.w = v.getUint32(16); out.h = v.getUint32(20);
  } else if (n >= 16 && tag(0, 'RIFF') && tag(8, 'WEBP')) {
    out.fmt = 'webp';
    if (tag(12, 'VP8X') && n >= 30) { out.w = 1 + (v.getUint8(24) | (v.getUint8(25) << 8) | (v.getUint8(26) << 16)); out.h = 1 + (v.getUint8(27) | (v.getUint8(28) << 8) | (v.getUint8(29) << 16)); }
    else if (tag(12, 'VP8L') && n >= 25) { const b = v.getUint32(21, true); out.w = (b & 0x3FFF) + 1; out.h = ((b >> 14) & 0x3FFF) + 1; }
    else if (tag(12, 'VP8 ') && n >= 30) { out.w = v.getUint16(26, true) & 0x3FFF; out.h = v.getUint16(28, true) & 0x3FFF; }
  } else if (n >= 12 && tag(4, 'ftyp')) out.fmt = 'other';   // HEIC, HEIF, AVIF
  return out;
}
async function coverImageReadHeader(file) {
  let info = coverImageParseHeader(await file.slice(0, 524288).arrayBuffer());
  if (info.fmt === 'jpeg' && !info.w && file.size > 524288) info = coverImageParseHeader(await file.arrayBuffer());   // grosse Vorschaubilder im Kopf: ganze Datei (hoechstens 25 MB) nach dem Massblock durchsuchen
  return info;
}

function coverImageSafeKey(bookKey) { return String(bookKey == null ? 'buch' : bookKey).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'buch'; }
function coverImageNewId(bookKey) { return COVER_IMG_PREFIX + coverImageSafeKey(bookKey) + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

/* Quelle auf Zielmasse zeichnen und als Blob liefern. mime: 'image/png'|'image/jpeg'|'image/webp' */
async function coverImageScaleBlob(source, longEdge, mime, quality) {
  const { src, w, h, manual } = source;   // w/h = Masse nach der Drehung
  const k = Math.min(1, longEdge / Math.max(w, h));   // nie vergroessern, Seitenverhaeltnis bleibt
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * k)); canvas.height = Math.max(1, Math.round(h * k));
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw coverImageError('Das Bild kann auf diesem Gerät nicht verarbeitet werden. Versuche ein kleineres Bild.');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    const kx = canvas.width / w, ky = canvas.height / h;
    if (manual > 1) drawOriented(ctx, src, manual >= 5 ? h : w, manual >= 5 ? w : h, manual, Math.min(kx, ky));
    else ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
    const blob = await canvasToBlobAs(canvas, mime, quality);
    if (!blob) throw coverImageError('Das Bild konnte nicht verkleinert werden. Versuche ein anderes oder kleineres Bild.');
    return { blob, w: canvas.width, h: canvas.height };
  } finally { canvas.width = canvas.height = 0; }   // Speicher sofort freigeben
}

async function coverImageImport(file, bookKey) {
  if (!file || typeof file.size !== 'number' || typeof file.slice !== 'function') throw coverImageError(COVER_IMG_MSG_CORRUPT);
  if (file.size === 0) throw coverImageError('Die Datei ist leer. Wähle ein anderes Bild.');
  const declared = String(file.type || '').toLowerCase();
  let head;
  try { head = await coverImageReadHeader(file); } catch (e) { throw coverImageError(COVER_IMG_MSG_CORRUPT); }
  const supported = head.fmt === 'jpeg' || head.fmt === 'png' || head.fmt === 'webp';
  if (!supported) {
    // erkannt als anderes Format (HEIC, AVIF, Text ...) oder unlesbar: Textdatei mit Bild-Endung gilt als beschaedigt, alles andere als nicht unterstuetzt
    const claimsOk = /^image\/(jpeg|png|webp)$/.test(declared);
    throw coverImageError(claimsOk && head.fmt === 'unknown' ? COVER_IMG_MSG_CORRUPT : COVER_IMG_MSG_FORMAT);
  }
  if (file.size > COVER_IMG_MAX_BYTES) throw coverImageError(`Diese Datei ist zu gross (${Math.round(file.size / 1048576)} MB). Erlaubt sind höchstens 25 MB. Verkleinere das Bild und versuche es erneut.`);
  const tail = new Uint8Array(await file.slice(Math.max(0, file.size - 4096)).arrayBuffer());   // abgeschnittene Dateien erkennen: JPEG endet mit FFD9, PNG mit IEND
  const hasEnd = head.fmt === 'jpeg' ? tail.some((b, i) => b === 0xFF && tail[i + 1] === 0xD9) : head.fmt === 'png' ? String.fromCharCode.apply(null, tail).includes('IEND') : true;
  if (!hasEnd) throw coverImageError(COVER_IMG_MSG_CORRUPT);
  const overPixels = (w, h) => w * h > COVER_IMG_MAX_PIXELS;
  const pixelMsg = (w, h) => `Dieses Bild hat zu viele Bildpunkte (${Math.round(w * h / 1e6)} Megapixel). Erlaubt sind höchstens 40 Megapixel. Verkleinere das Bild und versuche es erneut.`;
  if (head.w && head.h && overPixels(head.w, head.h)) throw coverImageError(pixelMsg(head.w, head.h));   // vor der Decodierung: schuetzt den Speicher
  let source;
  try { source = await loadImageSource(file); } catch (e) { throw coverImageError(COVER_IMG_MSG_CORRUPT); }
  try {
    if (!(source.w > 0 && source.h > 0)) throw coverImageError(COVER_IMG_MSG_CORRUPT);
    if (overPixels(source.w, source.h)) throw coverImageError(pixelMsg(source.w, source.h));   // Kopf war nicht lesbar: nach der Decodierung, vor dem Zeichnen
    let mime = head.fmt === 'png' ? 'image/png' : head.fmt === 'jpeg' ? 'image/jpeg' : ((await webpEncodingSupported()) ? 'image/webp' : 'image/png');   // PNG bleibt PNG (Transparenz), WebP nie flach in JPEG
    const q = 0.9;
    const full = await coverImageScaleBlob(source, COVER_IMG_MAX_EDGE, mime, q);
    const thumb = await coverImageScaleBlob(source, COVER_IMG_THUMB_EDGE, mime, 0.8);
    const id = coverImageNewId(bookKey);
    try { await dbPutImage({ id, blob: full.blob, thumbBlob: thumb.blob, mime, kind: 'cover', w: full.w, h: full.h }); }
    catch (e) { throw coverImageError(e && e.name === 'QuotaExceededError' ? 'Das Bild wurde nicht gespeichert: Der Speicher des Geräts ist voll.' : 'Das Bild konnte nicht gespeichert werden. Versuche es erneut.'); }
    return { id, w: full.w, h: full.h };
  } finally { if (source.src && source.src.close) { try { source.src.close(); } catch (e) { /* ignorieren */ } } }
}

/* ---------- Laden mit kleinem Cache ---------- */
const COVER_IMG_CACHE_MAX = 2;
const _coverImgCache = new Map();   // id -> drawable (Einfuegereihenfolge = Benutzungsreihenfolge)
const _coverImgInflight = new Map();
function coverImageCacheDrop(id) { _coverImgCache.delete(id); }
async function coverImageDecode(blob) {
  if (typeof createImageBitmap === 'function') { try { return await createImageBitmap(blob); } catch (e) { /* weiter mit <img> */ } }
  return new Promise((resolve) => {
    let url = '';
    try { url = URL.createObjectURL(blob); } catch (e) { resolve(null); return; }
    const img = new Image();
    img.onload = () => {
      try { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0); resolve(c); }
      catch (e) { resolve(null); } finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}
async function coverImageLoad(id) {
  if (typeof id !== 'string' || !id.startsWith(COVER_IMG_PREFIX)) return null;
  if (_coverImgCache.has(id)) { const hit = _coverImgCache.get(id); _coverImgCache.delete(id); _coverImgCache.set(id, hit); return hit; }
  if (_coverImgInflight.has(id)) return _coverImgInflight.get(id);
  const job = (async () => {
    try {
      const rec = await dbGetImage(id);
      if (!rec || !rec.blob) return null;
      const bmp = await coverImageDecode(rec.blob);
      if (!bmp) return null;
      _coverImgCache.set(id, bmp);
      while (_coverImgCache.size > COVER_IMG_CACHE_MAX) _coverImgCache.delete(_coverImgCache.keys().next().value);   // aeltestes verwerfen (nicht close(): es kann gerade gezeichnet werden)
      return bmp;
    } catch (e) { return null; }
    finally { _coverImgInflight.delete(id); }
  })();
  _coverImgInflight.set(id, job);
  return job;
}

/* ---------- Verweise, Loeschen, Aufraeumen ---------- */
function coverImageIdsInUse() {
  const ids = new Set();
  try {
    cookbookBooks().forEach((b) => {
      const im = b && b.config && b.config.cover && b.config.cover.image;
      if (im && typeof im.id === 'string' && im.id.startsWith(COVER_IMG_PREFIX)) ids.add(im.id);
    });
  } catch (e) { /* ohne lesbare Kochbuecher: nichts als «in Gebrauch» behaupten */ }
  return Array.from(ids);
}
async function coverImageRemove(id, opts) {
  if (typeof id !== 'string' || !id.startsWith(COVER_IMG_PREFIX)) return;   // Rezeptbilder und fremde IDs nie anfassen
  if (!(opts && opts.force) && coverImageIdsInUse().includes(id)) return;   // noch in einem Kochbuch gespeichert (z. B. kopiertes Kochbuch)
  coverImageCacheDrop(id);
  await dbDeleteImage(id);
}
async function coverImageStoredIds() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction('images', 'readonly').objectStore('images').getAllKeys();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}
async function coverImageGc() {
  const used = new Set(coverImageIdsInUse());
  let n = 0;
  for (const id of await coverImageStoredIds()) {
    if (typeof id === 'string' && id.startsWith(COVER_IMG_PREFIX) && !used.has(id)) { coverImageCacheDrop(id); await dbDeleteImage(id); n++; }
  }
  return n;
}

/* Cover-Bilder gehen ueber den bestehenden Bildweg (cloud.js) an alle Geraete, sobald ein Konto angemeldet ist. */
function coverImageSyncNote() {
  try { if (typeof cloudSignedIn === 'function' && cloudSignedIn()) return ''; } catch (e) { /* ohne Cloud-Modul: Hinweis */ }
  return 'Eigene Bilder liegen auf diesem Gerät und in der Sicherungsdatei. Mit einem Savora-Konto werden sie auf deine Geräte übertragen.';
}
