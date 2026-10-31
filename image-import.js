/* ---------- Rezepte aus Fotos importieren ----------
   Liest Text aus Fotos lokal: in der iOS-App mit der Texterkennung von iOS, sonst mit Tesseract (vendor/tesseract,
   erst beim ersten Bedarf geladen). Das Foto wird weder gespeichert noch übertragen.
   Alles kommt aus eigenen Dateien (CSP: worker-src 'self', kein blob:-Worker, kein fremder Server). */
const IMAGE_IMPORT_MAX_BYTES = 30 * 1024 * 1024;
const IMAGE_IMPORT_MAX_SIDE = 2200;        // längste Seite nach dem Verkleinern
const IMAGE_IMPORT_IDLE_MS = 2 * 60 * 1000; // Worker nach 2 Minuten ohne Nutzung beenden
const IMAGE_IMPORT_DIR = 'vendor/tesseract/';
let _imgWorkerPromise = null, _imgIdleTimer = null, _imgProgress = null, _imgQueue = Promise.resolve();

function imageUrl(name) { return new URL(IMAGE_IMPORT_DIR + name, document.baseURI).href; }
function imageHasSimd() {
  try { return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])); } catch (e) { return false; }
}
function imageLoadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = () => resolve(); s.onerror = () => { s.remove(); reject(new Error('script-load-failed')); };
    document.head.appendChild(s);
  });
}
// Worker einmal starten und wiederverwenden. Die Kern-Datei wird selbst gewählt (nur simd-lstm und lstm liegen bereit).
function imageGetWorker() {
  if (_imgIdleTimer) { clearTimeout(_imgIdleTimer); _imgIdleTimer = null; }
  if (!_imgWorkerPromise) {
    _imgWorkerPromise = (async () => {
      if (typeof Tesseract === 'undefined') await imageLoadScript(imageUrl('tesseract.min.js'));
      const w = await Tesseract.createWorker('deu', 1, {
        workerPath: imageUrl('worker.min.js'),
        corePath: imageUrl(imageHasSimd() ? 'tesseract-core-simd-lstm.wasm.js' : 'tesseract-core-lstm.wasm.js'),
        langPath: new URL(IMAGE_IMPORT_DIR, document.baseURI).href,
        gzip: true, workerBlobURL: false, cacheMethod: 'none',
        logger: (m) => {
          if (!_imgProgress || !m) return;
          if (m.status === 'recognizing text') _imgProgress('read', m.progress || 0);
          else if (/loading|initializ/i.test(m.status || '')) _imgProgress('load', m.progress || 0);
        },
      });
      return w;
    })().catch((e) => { _imgWorkerPromise = null; throw e; });
  }
  return _imgWorkerPromise;
}
function imageScheduleIdle() {
  if (_imgIdleTimer) clearTimeout(_imgIdleTimer);
  _imgIdleTimer = setTimeout(imageReleaseWorker, IMAGE_IMPORT_IDLE_MS);
}
async function imageReleaseWorker() {
  if (_imgIdleTimer) { clearTimeout(_imgIdleTimer); _imgIdleTimer = null; }
  const p = _imgWorkerPromise; _imgWorkerPromise = null;
  if (p) { try { (await p).terminate(); } catch (e) { /* egal */ } }
}

// Bild laden (EXIF-Drehung beachten), verkleinern, auf weissen Grund, Graustufen mit Kontrastdehnung. Gibt ein PNG-Blob zurück.
async function imagePrepare(file) {
  let bmp = null, img = null, url = null;
  try {
    if (typeof createImageBitmap === 'function') {
      try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
      catch (e) { try { bmp = await createImageBitmap(file); } catch (e2) { bmp = null; } }
    }
    let w, h, src;
    if (bmp) { w = bmp.width; h = bmp.height; src = bmp; }
    else {
      url = URL.createObjectURL(file);
      img = new Image(); img.decoding = 'async'; img.src = url;
      await img.decode();   // Browser wendet die EXIF-Drehung selbst an (image-orientation: from-image ist Standard)
      w = img.naturalWidth; h = img.naturalHeight; src = img;
    }
    if (!w || !h) throw new Error('empty-image');
    let scale = Math.min(1, IMAGE_IMPORT_MAX_SIDE / Math.max(w, h));
    if (Math.max(w, h) < 1000) scale = Math.min(2, 1000 / Math.max(w, h));   // sehr kleine Bilder etwas vergrössern
    const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch);   // Transparenz => weiss
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, cw, ch);
    const data = ctx.getImageData(0, 0, cw, ch), px = data.data, hist = new Uint32Array(256);
    for (let i = 0; i < px.length; i += 4) { const g = (px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8; px[i] = g; hist[g]++; }
    const total = cw * ch; let acc = 0, lo = 0, hi = 255;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * 0.01) { lo = v; break; } }
    acc = 0;
    for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= total * 0.01) { hi = v; break; } }
    const span = Math.max(1, hi - lo), stretch = hi - lo >= 40;   // bei kaum Kontrast nicht dehnen (Rauschen)
    for (let i = 0; i < px.length; i += 4) {
      let g = px[i]; if (stretch) g = Math.max(0, Math.min(255, ((g - lo) * 255) / span));
      px[i] = px[i + 1] = px[i + 2] = g; px[i + 3] = 255;
    }
    ctx.putImageData(data, 0, 0);
    return await new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('toBlob')), 'image/png'));
  } finally {
    if (bmp && bmp.close) bmp.close();
    if (url) URL.revokeObjectURL(url);
  }
}

// OCR-Text aufräumen: trimmen, Leerzeilen, Silbentrennung, Aufzählungszeichen, typische Mengenfehler
function imageCleanText(raw) {
  let rows = String(raw || '').replace(/\r\n?/g, '\n').replace(/[  -​﻿]/g, ' ').replace(/­/g, '').split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim());
  const out = [];
  rows.forEach(r => {
    const prev = out.length ? out[out.length - 1] : '';
    if (prev && r && /\p{L}-$/u.test(prev) && /^\p{Ll}/u.test(r) && !/^(?:und|oder|bzw|sowie|resp)\b/i.test(r)) out[out.length - 1] = prev.slice(0, -1) + r;
    else out.push(r);
  });
  const UNIT = '(?:mg|g|kg|dl|cl|ml|l|EL|TL|Prise|Prisen|Stk\\.?|Stück|Zehen?|Bund|Dose|Dosen|Pck\\.?|Päckchen|Becher|Msp\\.?)';
  const text = out.map(r => r
    .replace(/^(?:[•·▪▫◦●○■□‣⁃∙»›]|[*~](?=\s))\s*/, '- ')
    .replace(/^[–—+]\s+/, '- ')
    .replace(/(^|[-\s])%(?=\s*(?:TL|EL|dl|l|g|Prise)\b)/g, '$1½')                                              // «% TL» => «½ TL» (OCR liest ½ oft als %)
    .replace(/(\d[\d.,/]*\s*)d[iI|!1](?=\s|$)/g, '$1dl')                                                      // «2 di» => «2 dl»
    .replace(new RegExp('^(- )?[lI|](?=\\s*' + UNIT + '\\b)', ''), (m, d) => (d || '') + '1')                      // «l EL» => «1 EL»
    .replace(new RegExp('(^|[^\\p{L}\\d])[lI|]\\s+(?=' + UNIT + '\\b)', 'gu'), (m, b) => b + '1 ')
    .replace(new RegExp('(^|[^\\p{L}\\d])[Oo]([.,]\\d+)\\s*(?=' + UNIT + '\\b)', 'gu'), (m, b, d) => b + '0' + d + ' ')   // «O,5 l» => «0,5 l»
  ).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif|tiff?)$/i;
function imageLooksLikeImage(f) { return /^image\//i.test(f.type || '') || IMAGE_EXT_RE.test(f.name || ''); }
function imageIsHeic(f) { return /heic|heif/i.test(f.type || '') || /\.(heic|heif)$/i.test(f.name || ''); }

// Liest mehrere Fotos. Gibt nie eine Ausnahme nach aussen.
async function imageImportRead(files, opts) {
  const list = !files ? [] : (files.length !== undefined && typeof files !== 'string' && !(files instanceof Blob) ? Array.from(files) : [files]);
  const onProgress = (opts && typeof opts.onProgress === 'function') ? opts.onProgress : () => {};
  const res = { ok: false, error: null, results: [], text: '', weak: false };
  const count = list.length;
  if (!count) { res.error = 'not-image'; return res; }
  const run = async () => {
    const native = typeof SavoraNative !== 'undefined' && SavoraNative.canRecognizeText && SavoraNative.canRecognizeText();
    const confs = [];
    for (let index = 0; index < count; index++) {
      const f = list[index], r = { name: String(f.name || ''), text: '', confidence: null, error: null };
      res.results.push(r);
      const say = (phase, progress) => { try { onProgress({ phase, index, count, progress: Math.max(0, Math.min(1, +progress || 0)) }); } catch (e) { /* egal */ } };
      if (!imageLooksLikeImage(f)) { r.error = 'not-image'; continue; }
      if (f.size > IMAGE_IMPORT_MAX_BYTES) { r.error = 'too-large'; continue; }
      try {
        if (native) {
          say('read', 0);
          r.text = imageCleanText(await SavoraNative.recognizeText(f));
          say('read', 1);
        } else {
          let blob;
          try { blob = await imagePrepare(f); } catch (e) { r.error = imageIsHeic(f) ? 'unsupported' : 'load-failed'; continue; }
          say('load', 0);
          _imgProgress = (phase, p) => say(phase, p);
          let worker;
          try { worker = await imageGetWorker(); } catch (e) { r.error = 'load-failed'; continue; }
          say('read', 0);
          const out = await worker.recognize(blob);
          r.text = imageCleanText(out && out.data && out.data.text);
          r.confidence = out && out.data && typeof out.data.confidence === 'number' ? out.data.confidence : null;
          if (r.confidence !== null) confs.push(r.confidence);
          say('read', 1);
        }
      } catch (e) {
        r.error = 'load-failed';
        if (!native) await imageReleaseWorker();   // kaputten Worker nicht weiterverwenden
      }
    }
    _imgProgress = null;
    if (!native) imageScheduleIdle();
    const good = res.results.filter(r => !r.error);
    res.text = good.map(r => r.text).filter(Boolean).join('\n\n');
    res.ok = good.length > 0;
    if (!res.ok) res.error = res.results[0].error || 'load-failed';
    const chars = res.text.replace(/\s/g, '').length;
    const avg = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : null;
    res.weak = res.ok && (chars < 40 || (avg !== null && avg < 60));
  };
  // Aufrufe nacheinander abarbeiten (ein Worker)
  const turn = _imgQueue.then(run, run);
  _imgQueue = turn.catch(() => {});
  try { await turn; } catch (e) { res.ok = false; res.error = 'load-failed'; }
  return res;
}
