/* ---------- PDF-Export (Reparatur-Auftrag: semantische Pagination statt Canvas-Slicing) ----------
   Rendert weiterhin NICHT ueber window.print() (Safari-Randproblem, siehe Historie), sondern
   per html2canvas + jsPDF — aber die Seitenaufteilung passiert jetzt VOR dem Rendern, anhand
   echter DOM-Hoehenmessung (pdf-layout.js: measureSectionHeightMm/candidateFitsOnePage), nicht
   mehr danach per blindem Pixel-Schnitt alle 297mm. Jede <section> in #printRoot entspricht
   dadurch garantiert genau einer PDF-Seite; renderSectionsToPdf schneidet nur noch als
   Sicherheitsnetz (siehe dort), nicht mehr im Regelfall. */

/* Direkter Update-Prompt, Punkt 1: scale=2 (192 DPI) ergab bei kleiner Schrift bei starkem Zoom
   sichtbar weichere Kanten als scale=3 (288 DPI) — mit echten Testseiten verglichen (gleicher
   Bildausschnitt, gleiche Zielgroesse). scale=4 (384 DPI) brachte keinen wahrnehmbaren Gewinn
   mehr, nur ~50% mehr Dateigroesse on top von scale=3. PNG statt JPEG fuer reine Textseiten
   wurde ebenfalls gemessen und verglichen (siehe ABSCHLUSSBERICHT) — kein sichtbarer Vorteil bei
   Qualitaet 0.92-0.95, dafuer teils GRÖSSERE Dateien als JPEG, deshalb bewusst nicht eingesetzt. */
const PDF_RENDER_SCALE = 3;
const PDF_JPEG_QUALITY = 0.95;

async function resolveRecipeImageDataUrl(r) {
  const safeSrc = recipeSafeImage(r);
  if (safeSrc) return safeSrc;
  if (recipeSafeImageId(r)) {
    try {
      const record = await dbGetImage(recipeSafeImageId(r));
      if (record && record.blob) return await blobToDataUrl(record.blob);
    } catch (e) { /* Bild wird im PDF einfach weggelassen */ }
  }
  return null;
}

/* Echte Pixelmasse eines Bildes ermitteln (Grundlage der Layoutwahl, Punkt 35) — bewusst ueber
   ein Image-Element statt Annahmen zu treffen, da Data-URLs/Blobs ihre Ausgangsaufloesung nicht
   im String tragen. */
function getImageDimensions(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    const t = setTimeout(() => resolve(null), 8000);   // haengt ein Bild, wird es weggelassen statt den Export aufzuhalten
    img.onload = () => { clearTimeout(t); resolve(img.naturalWidth && img.naturalHeight ? { width: img.naturalWidth, height: img.naturalHeight } : null); };
    img.onerror = () => { clearTimeout(t); resolve(null); };
    img.src = dataUrl;
  });
}

/* Punkt 124-125: Fonts MUESSEN geladen sein, bevor irgendetwas gemessen ODER final gerendert
   wird — sonst misst man mit dem Fallback-Font, waehlt anhand dessen ein Layout/eine Fortsetzung,
   und der Text verschiebt sich, sobald Baloo 2 nachlaedt ("verbotener Ablauf" laut Auftrag).
   Deshalb steht dieser await jetzt ganz am Anfang jedes Export-Vorgangs, nicht mehr erst kurz vor
   html2canvas. Zusaetzlich wird explizit auf die tatsaechlich benoetigten Schnitte gewartet. */
async function ensureFontsReadyForPdf() {
  if (!(document.fonts && document.fonts.ready)) return;
  await document.fonts.ready;
  try {
    // Nur die Schriften des gewaehlten Stils (Pur: Carlito, Prise Pop: Lilita One und Public Sans), alle lokal
    const list = (PDF_CTX && PDF_CTX.tpl && PDF_CTX.tpl.fonts) || [];
    await Promise.all(list.map((f) => document.fonts.load(f)));
  } catch (e) { /* Font-API-Eigenheiten je Browser — document.fonts.ready ist die harte Garantie */ }
}

/* ---------- PDF-Bibliotheken bei Bedarf laden ----------
   jsPDF und html2canvas stehen nicht mehr als Script-Tags in index.html (rund 560 KB weniger beim
   Start). Sie werden beim ersten Export (oder beim Oeffnen des Export-Fensters) ueber EINE gemeinsame
   Promise geladen, in fester Reihenfolge: zuerst jsPDF, dann html2canvas (beide setzen nur ein
   globales Objekt, hängen aber nicht voneinander ab). Beide Dateien gehoeren zur App-Shell und sind
   deshalb nach der Installation auch offline im Cache. Fehler setzen die Promise zurueck, ein neuer
   Versuch ("Erneut versuchen") laedt dann frisch. */
const PDF_LIB_FILES = ['jspdf.umd.min.js', 'html2canvas.min.js'];
const PDF_LIB_TIMEOUT_MS = 20000;
let pdfLibsPromise = null;
let pdfLibLoadCount = 0;   // fuer Tests: wie oft wurde wirklich geladen

function pdfLibsReady() { return !!(window.jspdf && window.jspdf.jsPDF && typeof window.html2canvas === 'function'); }

function pdfLoadScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    let done = false;
    const finish = (err) => {
      if (done) return; done = true; clearTimeout(timer);
      el.onload = el.onerror = null;
      if (err) { el.remove(); reject(err); } else resolve();
    };
    const timer = setTimeout(() => finish(new Error('timeout')), PDF_LIB_TIMEOUT_MS);
    el.onload = () => finish();
    el.onerror = () => finish(new Error('load'));
    el.src = src;
    document.head.appendChild(el);
  });
}

function pdfLibError(cause) {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const msg = offline
    ? 'Für den PDF-Export fehlen Dateien und du bist offline. Verbinde dich einmal mit dem Internet und versuche es erneut.'
    : (cause && cause.message === 'timeout'
      ? 'Das Laden der PDF-Werkzeuge dauert zu lange. Prüfe deine Verbindung und versuche es erneut.'
      : 'Die PDF-Werkzeuge konnten nicht geladen werden. Prüfe deine Verbindung und versuche es erneut.');
  return Object.assign(new Error('pdf-libs'), { userMessage: msg });
}

function ensurePdfLibs() {
  if (pdfLibsReady()) return Promise.resolve();
  if (pdfLibsPromise) return pdfLibsPromise;
  pdfLibLoadCount++;
  pdfLibsPromise = (async () => {
    for (const f of PDF_LIB_FILES) {
      if (f.startsWith('jspdf') ? (window.jspdf && window.jspdf.jsPDF) : typeof window.html2canvas === 'function') continue;
      await pdfLoadScript(f);
    }
    if (!pdfLibsReady()) throw new Error('load');
  })().catch((err) => { pdfLibsPromise = null; throw pdfLibError(err); });
  return pdfLibsPromise;
}
/* Beim Oeffnen des Export-Fensters im Hintergrund anstossen; Fehler zeigt erst der eigentliche Export. */
function pdfWarmUp() { ensurePdfLibs().catch(() => {}); }

/* ---------- Abbruch, Reihenfolge, Hilfen ---------- */

/* Exporte laufen nacheinander (gemeinsame Messflaeche und #printRoot): ein zweiter Start wartet,
   statt den ersten zu zerstoeren. */
let _pdfChain = Promise.resolve();
function pdfExclusive(fn) {
  const run = _pdfChain.then(fn, fn);
  _pdfChain = run.catch(() => {});
  return run;
}
function pdfAbortError() { return Object.assign(new Error('abort'), { aborted: true }); }
function pdfCheckAbort(opts) { if (opts && opts.signal && opts.signal.aborted) throw pdfAbortError(); }
function pdfProgress(opts, done, total, label) { try { if (opts && typeof opts.onProgress === 'function') opts.onProgress({ done, total, label: label || '' }); } catch (e) { /* Anzeige ist ein Zusatz */ } }
const pdfYield = () => new Promise((r) => setTimeout(r, 0));
function pdfWithTimeout(promise, ms) {
  let t; return Promise.race([promise, new Promise((resolve) => { t = setTimeout(() => resolve('timeout'), ms); })]).finally(() => clearTimeout(t));
}

/* ---------- Bilder rastern ---------- */

/* F05: html2canvas beachtet object-fit nicht und zieht Fotos deshalb auf die Rahmengroesse (Manti
   wurde breit und flach). Darum wird jedes Foto VOR dem Rastern auf genau das Seitenverhaeltnis
   seines Rahmens zugeschnitten (wie object-fit: cover, mit Fokuspunkt). Danach passen Bild und
   Rahmen exakt zusammen, es gibt nichts mehr zu verzerren. Ladefehler oder Zeitueberschreitung:
   das Bild wird unsichtbar (kein defektes Symbol), der Export laeuft weiter. */
async function pdfBakeCoverImages(section) {
  const imgs = Array.from(section.querySelectorAll('img.pdf-img-cover'));
  for (const img of imgs) {
    try {
      if (!img.complete || !img.naturalWidth) {
        const r = await pdfWithTimeout(img.decode().then(() => 'ok', () => 'fail'), 6000);
        if (r !== 'ok') throw new Error('img');
      }
      const box = img.getBoundingClientRect();
      const bw = box.width, bh = box.height, nw = img.naturalWidth, nh = img.naturalHeight;
      if (!bw || !bh || !nw || !nh) throw new Error('img-size');
      const pos = (img.style.objectPosition || '50% 50%').split(/\s+/).map((v) => parseFloat(v) / 100);
      const fx = isNaN(pos[0]) ? 0.5 : pos[0], fy = isNaN(pos[1]) ? 0.5 : pos[1];
      const frameRatio = bw / bh, imgRatio = nw / nh;
      let sw = nw, sh = nh;
      if (imgRatio > frameRatio) sw = nh * frameRatio; else sh = nw / frameRatio;
      const sx = (nw - sw) * fx, sy = (nh - sh) * fy;
      const scale = Math.min(PDF_RENDER_SCALE, Math.max(1, sw / bw));
      const cw = Math.max(1, Math.round(bw * scale)), ch = Math.max(1, Math.round(bh * scale));
      const c = document.createElement('canvas'); c.width = cw; c.height = ch;
      c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
      img.src = c.toDataURL('image/jpeg', 0.92);
      img.style.objectFit = 'fill';
      await pdfWithTimeout(img.decode().catch(() => {}), 6000);
    } catch (e) {
      img.style.visibility = 'hidden';   // kein defektes Bildsymbol im PDF; der Rahmen bleibt als ruhige Flaeche
      img.removeAttribute('src');
    }
  }
}

/* F06: Unsichtbare Textebene ueber dem Seitenbild, damit das PDF durchsucht, kopiert und vorgelesen
   werden kann. Die Optik bleibt das gerasterte Seitenbild; der Text liegt deckungsgleich darueber.
   Grundlinie aus den echten Schriftmassen (fontBoundingBoxDescent) statt einer festen Schaetzung. */
const _pdfDescentCache = new Map();
function pdfFontDescentPx(cs) {
  const key = cs.fontStyle + '|' + cs.fontWeight + '|' + cs.fontSize + '|' + cs.fontFamily;
  if (_pdfDescentCache.has(key)) return _pdfDescentCache.get(key);
  let d = (parseFloat(cs.fontSize) || 12) * 0.22;
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const m = ctx.measureText('Hgy');
    if (m && m.fontBoundingBoxDescent > 0) d = m.fontBoundingBoxDescent;
  } catch (e) { /* Schaetzwert bleibt */ }
  _pdfDescentCache.set(key, d);
  return d;
}
function pdfAddTextLayer(pdf, section, mmPerPx) {
  try {
    const secRect = section.getBoundingClientRect();
    const range = document.createRange();
    const words = [];
    const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const txt = node.textContent;
      if (!txt || !txt.trim()) continue;
      const el = node.parentElement;
      const cs = el && getComputedStyle(el);
      if (!cs || cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) continue;
      const fs = parseFloat(cs.fontSize) || 12;
      const desc = pdfFontDescentPx(cs);
      const re = /\S+/g; let m;
      while ((m = re.exec(txt))) {
        range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
        const r = range.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        words.push({ t: m[0], x: r.left - secRect.left, y: r.bottom - secRect.top - desc, w: r.width, fs });
      }
    }
    // Zu Zeilen zusammenfassen (gleiche Grundlinie, fortlaufend von links nach rechts)
    const lines = [];
    words.forEach((w) => {
      const line = lines.find((l) => Math.abs(l.y - w.y) < w.fs * 0.35 && w.x >= l.right - 2 && w.x - l.right < w.fs * 2.5);
      if (line) { line.text += ' ' + w.t; line.right = w.x + w.w; }
      else lines.push({ text: w.t, x: w.x, y: w.y, right: w.x + w.w, fs: w.fs });
    });
    pdf.setFont('helvetica', 'normal');
    lines.forEach((l) => {
      const sizePt = (l.fs * mmPerPx) / 0.3528;
      pdf.setFontSize(sizePt);
      const widthMm = (l.right - l.x) * mmPerPx;
      const natural = pdf.getTextWidth(l.text) || widthMm;
      pdf.text(l.text, l.x * mmPerPx, l.y * mmPerPx, { renderingMode: 'invisible', horizontalScale: widthMm / natural });
    });
  } catch (e) { /* Textebene ist ein Zusatz; Fehler duerfen den Export nicht verhindern */ }
}

/* Anklickbare Adressen: Elemente mit data-pdf-href (http, https, mailto) werden echte Link-Flaechen. */
function pdfCollectUrlLinks(section, mmPerPx) {
  const out = [];
  try {
    const secRect = section.getBoundingClientRect();
    section.querySelectorAll('[data-pdf-href]').forEach((el) => {
      const url = el.getAttribute('data-pdf-href') || '';
      if (!/^(https?:\/\/|mailto:)/i.test(url)) return;
      Array.from(el.getClientRects()).forEach((r) => {
        if (r.width > 0.5 && r.height > 0.5) out.push({ url, x: (r.left - secRect.left) * mmPerPx, y: (r.top - secRect.top) * mmPerPx, w: r.width * mmPerPx, h: r.height * mmPerPx });
      });
    });
  } catch (e) { /* Links sind ein Zusatz */ }
  return out;
}

/* F06: echte, sichtbare Seitenzahlen (als Vektortext). Das Deckblatt eines Kochbuchs bleibt ohne Zahl. */
function pdfAddPageNumbers(pdf, skipPages) {
  const total = pdf.getNumberOfPages();
  const c = (PDF_CTX && PDF_CTX.tpl && PDF_CTX.tpl.pageNo) || [31, 90, 58];
  for (let i = 1; i <= total; i++) {
    if (skipPages && skipPages.has(i)) continue;
    pdf.setPage(i);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(c[0], c[1], c[2]);
    pdf.text((PDF_CTX && PDF_CTX.book ? 'Seite ' : '') + String(i), 195, 290.2, { align: 'right' });
  }
}

/* Eine Seite rastern: Seite = exakt 297 mm hoch, Raster exakt im A4-Seitenverhaeltnis.
   Ursache der angeschnittenen Raender (belegt in tests/test_pdf_kern.py): html2canvas rundet die
   Rasterbreite auf ganze Pixel (2381,06 -> 2382, rechts blieb ein durchsichtiger, im JPEG schwarzer
   Streifen), die Seite war bis 2 mm hoeher als A4 (Toleranz) und Kopf-/Fusszeile steckten in
   overflow:hidden-Boxen, die den tiefer gesetzten Text anschnitten. Jetzt: feste Seitenhoehe,
   deckende Seitenfarbe und Zielraster mit exakt gerundeter A4-Proportion. */
async function pdfRasterizeSection(section, fitsPage) {
  const cs = getComputedStyle(section);
  const domW = section.getBoundingClientRect().width;
  if (fitsPage) { section.style.minHeight = '297mm'; section.style.height = '297mm'; }
  const domH = section.getBoundingClientRect().height;
  const bg = cs.backgroundColor && !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor) ? cs.backgroundColor : '#ffffff';
  const canvas = await html2canvas(section, { scale: PDF_RENDER_SCALE, backgroundColor: bg, useCORS: true, logging: false, imageTimeout: 8000, windowWidth: Math.max(window.innerWidth || 0, 1100) });
  return { canvas, domW, domH, bg };
}
function pdfComposePage(src, domW, domH, bg) {
  const S = PDF_RENDER_SCALE;
  const Wp = Math.round(domW * S), Hp = Math.round(Wp * 297 / 210);
  const out = document.createElement('canvas'); out.width = Wp; out.height = Hp;
  const g = out.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, Wp, Hp);
  g.drawImage(src, 0, 0, Math.min(src.width, domW * S), Math.min(src.height, domH * S), 0, 0, Wp, Hp);
  return out;
}

/* Rendert jedes direkte Kind von #printRoot als eigene PDF-Seite (randlos, A4). Jede Section passt
   durch die Vor-Pagination auf eine Seite; die Schnittlogik unten ist nur Sicherheitsnetz.
   Sammelt dabei Seitennummern der Rezeptanfaenge, die Klickflaechen des Inhaltsverzeichnisses, die
   Adress-Links und die Lesezeichen (Outline). opts: { signal, onProgress, title, subject, author }. */
async function renderSectionsToPdf(opts) {
  const container = document.getElementById('printRoot');
  const sections = Array.from(container.children);
  if (!sections.length) return null;
  await ensurePdfLibs();
  await ensureFontsReadyForPdf();

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const pageWidthMm = 210, pageHeightMm = 297;
  let firstPage = true;
  const recipeStart = {};       // recipeId -> Seite (1-basiert)
  const recipeTitles = [];      // [{ id, title, chapter, page }]
  const tocLinks = [];          // [{ page, x, y, w, h, target }]
  const urlLinks = [];          // [{ page, url, x, y, w, h }]
  const skipNumbers = new Set();
  let sliced = 0;

  for (let si = 0; si < sections.length; si++) {
    pdfCheckAbort(opts);
    const section = sections[si];
    pdfProgress(opts, si, sections.length, 'render');
    if (si) await pdfYield();   // Oberflaeche bleibt bedienbar, Abbruch und Fortschritt kommen an
    const domWidth = section.offsetWidth || 1;
    const sectionTop = section.getBoundingClientRect().top;
    const kind = section.dataset.pageKind || '';
    pdfClampFrameText(section);
    const breakEls = Array.from(section.querySelectorAll('.pdf-safe-break'));
    const intervals = breakEls.map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top - sectionTop, bottom: r.bottom - sectionTop };
    });
    const domBreakTops = intervals.map((iv) => iv.top).filter((y) => !intervals.some((iv) => y > iv.top + 0.5 && y < iv.bottom - 0.5));

    // Klickflaechen fuer das Inhaltsverzeichnis vor dem Rastern messen
    const mmPerPx = pageWidthMm / domWidth;
    const rowRects = kind === 'toc' ? Array.from(section.querySelectorAll('[data-toc-id]')).map((el) => {
      const r = el.getBoundingClientRect();
      return { target: el.dataset.tocId, x: (r.left - section.getBoundingClientRect().left) * mmPerPx, y: (r.top - sectionTop) * mmPerPx, w: r.width * mmPerPx, h: r.height * mmPerPx };
    }) : [];
    const secLinks = pdfCollectUrlLinks(section, mmPerPx);

    await pdfBakeCoverImages(section);
    const contentMm = section.scrollHeight / MM_PX;
    const fitsPage = kind === 'cover' || section.getBoundingClientRect().height / MM_PX <= pageHeightMm + PAGE_FIT_TOLERANCE_MM;
    const { canvas, domW, domH, bg } = await pdfRasterizeSection(section, fitsPage);
    const pxPerMm = canvas.width / pageWidthMm;
    const scale = canvas.width / domWidth;
    const pageHeightPx = pageHeightMm * pxPerMm;

    let pageNo;
    if (fitsPage) {
      if (!firstPage) pdf.addPage();
      firstPage = false;
      pageNo = pdf.getNumberOfPages();
      const page = pdfComposePage(canvas, domW, domH, bg);
      pdf.addImage(page.toDataURL('image/jpeg', PDF_JPEG_QUALITY), 'JPEG', 0, 0, pageWidthMm, pageHeightMm);
      page.width = 0; page.height = 0;
      pdfAddTextLayer(pdf, section, pageWidthMm / domWidth);
      secLinks.forEach((l) => urlLinks.push({ ...l, page: pageNo }));
    } else {
      // Sicherheitsnetz: nur falls eine Section trotz Vor-Pagination zu hoch ist (wird im Test als Fehler gewertet)
      sliced++;
      console.warn('PDF: Seite zu hoch, Sicherheitsschnitt', kind, Math.round(contentMm) + ' mm');
      const breakPointsPx = domBreakTops.map((t) => t * scale).sort((a, b) => a - b);
      const minSlicePx = 10 * pxPerMm;
      let cursor = 0; pageNo = null;
      while (cursor < canvas.height - 1) {
        const naiveEnd = Math.min(canvas.height, cursor + pageHeightPx);
        let sliceEnd = naiveEnd;
        if (naiveEnd < canvas.height - 1) {
          const candidate = breakPointsPx.filter((p) => p > cursor + minSlicePx && p <= naiveEnd).pop();
          if (candidate !== undefined) sliceEnd = candidate;
        }
        if (canvas.height - sliceEnd < 15 * pxPerMm) sliceEnd = canvas.height;
        if (!firstPage) pdf.addPage();
        firstPage = false;
        if (pageNo === null) pageNo = pdf.getNumberOfPages();
        const sliceHeightPx = sliceEnd - cursor;
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width; sliceCanvas.height = sliceHeightPx;
        const sg = sliceCanvas.getContext('2d'); sg.fillStyle = bg; sg.fillRect(0, 0, canvas.width, sliceHeightPx);
        sg.drawImage(canvas, 0, cursor, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);
        pdf.addImage(sliceCanvas.toDataURL('image/jpeg', PDF_JPEG_QUALITY), 'JPEG', 0, 0, pageWidthMm, sliceHeightPx / pxPerMm);
        cursor = sliceEnd;
      }
    }
    canvas.width = 0; canvas.height = 0;
    if (kind === 'cover') skipNumbers.add(pageNo);
    if (kind === 'chapter') skipNumbers.add(pageNo);
    if (kind === 'recipe' && section.dataset.recipeId && !(section.dataset.recipeId in recipeStart)) {
      recipeStart[section.dataset.recipeId] = pageNo;
      recipeTitles.push({ id: section.dataset.recipeId, title: section.dataset.title || '', chapter: section.dataset.chapter || '', page: pageNo });
    }
    rowRects.forEach((rr) => tocLinks.push({ ...rr, page: pageNo }));
  }

  container.innerHTML = '';
  pdfAddPageNumbers(pdf, skipNumbers);
  // Echte, anklickbare Seitenlinks im Inhaltsverzeichnis
  tocLinks.forEach((l) => {
    const target = recipeStart[l.target];
    if (!target) return;
    try { pdf.setPage(l.page); pdf.link(l.x, l.y, l.w, l.h, { pageNumber: target }); } catch (e) { /* Link ist ein Zusatz */ }
  });
  // Adressen (Quellen): anklickbar
  urlLinks.forEach((l) => { try { pdf.setPage(l.page); pdf.link(l.x, l.y, l.w, l.h, { url: l.url }); } catch (e) { /* Link ist ein Zusatz */ } });
  // Lesezeichen (Kapitel als Ueberordnung, wenn vorhanden)
  try {
    if (pdf.outline && recipeTitles.length) {
      let parent = null, parentName = null;
      recipeTitles.forEach((rt) => {
        if (rt.chapter && rt.chapter !== parentName) { parent = pdf.outline.add(null, rt.chapter, { pageNumber: rt.page }); parentName = rt.chapter; }
        if (!rt.chapter) { parent = null; parentName = null; }
        pdf.outline.add(rt.chapter ? parent : null, rt.title || 'Rezept', { pageNumber: rt.page });
      });
    }
  } catch (e) { /* Lesezeichen sind ein Zusatz */ }
  // Metadaten: Dokumenttitel (wird im Betrachter angezeigt), Sprache de-CH
  try {
    pdf.setProperties({ title: (opts && opts.title) || (PDF_CTX && PDF_CTX.bookTitle) || 'Savora', subject: (opts && opts.subject) || '', author: (opts && opts.author) || '', creator: 'Savora' });
    if (typeof pdf.setLanguage === 'function') pdf.setLanguage('de-CH');
    if (typeof pdf.viewerPreferences === 'function') pdf.viewerPreferences({ DisplayDocTitle: true });
  } catch (e) { /* Metadaten sind ein Zusatz */ }
  pdfProgress(opts, sections.length, sections.length, 'render');
  const out = pdf.output('blob');
  try { out.pageCount = pdf.getNumberOfPages(); out.slicedPages = sliced; out.recipeStart = recipeStart; } catch (e) {}
  return out;
}

/* Startet den eigentlichen Dateidownload — getrennt von renderSectionsToPdf(), damit dazwischen
   erst eine Vorschau gezeigt werden kann (Punkt 65/138-149). Es werden genau die Bytes der Vorschau
   geschrieben (dasselbe Blob-Objekt). */
function triggerPdfDownload(blob, filename) {
  if (SavoraNative.isNative) {   // iOS-App: "Herunterladen" gibt es nicht, das Teilen-Fenster bietet "In Dateien sichern"
    SavoraNative.shareFile(blob, filename, filename).catch((err) => {
      if (!SavoraNative.isCancel(err)) showToast('Speichern nicht möglich', 'error');
    });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/* ---------- Seitenplanung eines Rezepts (Stile Pur und Prise Pop) ----------
   Deterministisch und anhand gemessener Inhalte (nach geladenen Schriften und Bildern):
     Stufe 1  regulaeres einseitiges Layout (groesstes Foto, normale Abstaende)
     Stufe 2  platzsparendes einseitiges Layout (kleineres Foto, engere Abstaende), nur wenn es wirklich
              passt; Schrift bleibt unveraendert, es wird nichts entfernt
     Stufe 3  zwei bewusst gestaltete Seiten: Zutaten komplett auf Seite 1 mit den ersten Schritten, Inhalt ausbalanciert
              verteilt (nicht Seite 1 voll, Seite 2 Rest)
     Stufe 4  drei oder mehr Seiten, gleiche Regeln
   Die Seitenzahl steht damit VOR dem Rendern fest («Fortsetzung · n von m», Inhaltsverzeichnis). */

/* Messen ohne die grossen Bild-Daten (Rahmen haben feste Groesse): schnell und Layout-neutral. */
function pdfStripImg(html) { return html.replace(/src="data:[^"]+"/g, 'src=""'); }
function pdfFits(html) { return candidateFitsOnePage(pdfStripImg(html)); }

/* Fotorahmen: immer im Seitenverhaeltnis des Fotos (nie gestreckt, nie beschnitten), in definierten Groessenstufen. Reihenfolge der
   Versuche bei knappem Platz: Foto verkleinern -> Abstaende moderat reduzieren -> erst dann mehrere Seiten. Die Schrift wird nie
   verkleinert. Reicht die Aufloesung des Fotos fuer die Rahmenbreite nicht (unter 100 dpi), wird der Rahmen entsprechend kleiner. */
function pdfFrameFor(dims, box) {
  const ar = dims.width / dims.height;
  let w = Math.min(box.w, box.h * ar);
  const maxByDpi = dims.width / MIN_PRINT_DPI * 25.4;
  if (w > maxByDpi) w = Math.max(24, maxByDpi);
  w = Math.round(w * 10) / 10;
  return { w, h: Math.round((w / ar) * 10) / 10 };
}
function pdfPhotoPlans(imgUrl, dims) {
  if (!imgUrl || !dims) return [{ frame: null }, { frame: null, tight: true }];
  const ar = dims.width / dims.height;
  const boxes = ar < 0.85 ? [{ w: 48, h: 64 }, { w: 42, h: 56 }, { w: 36, h: 48 }, { w: 32, h: 42 }]
    : ar <= 1.15 ? [{ w: 58, h: 58 }, { w: 50, h: 50 }, { w: 42, h: 42 }, { w: 36, h: 36 }]
      : [{ w: 74, h: 54 }, { w: 64, h: 46 }, { w: 54, h: 40 }, { w: 46, h: 34 }];
  const f = boxes.map((b) => pdfFrameFor(dims, b));
  return [{ frame: f[0] }, { frame: f[1] }, { frame: f[2] }, { frame: f[2], tight: true }, { frame: f[3], tight: true }];
}

const PDF_PLAN_EPS_MM = 0.3;
/* Untere Grenze des Fuellgrads beim Ausbalancieren mehrerer Seiten: Seite 1 bleibt mindestens zu drei Vierteln gefuellt. */
const PDF_PLAN_MIN_FILL = 0.75;

/* Sinnvolle Schnittstellen eines langen Schrittes: Satzenden (vor Grossbuchstabe/Zahl-Anfang), sonst
   Komma/Semikolon. Rueckgabe: Zeichenpositionen, an denen geteilt werden darf. */
function pdfSplitPoints(text) {
  const pts = [];
  const sentence = /[.!?]["»”)]*\s+(?=[A-ZÄÖÜ„«"0-9])/g; let m;
  while ((m = sentence.exec(text))) pts.push(m.index + m[0].length);
  if (pts.length < 1 && text.length > 900) { const soft = /[;,:]\s+/g; while ((m = soft.exec(text))) pts.push(m.index + m[0].length); }   // Komma nur bei ueberlangen Schritten ohne Satzende
  return pts.filter((p) => p > 20 && p < text.length - 20);
}

/* Einheiten fuer die Planung vorbereiten. Zubereitungsschritte (Einzelschritt, evtl. mit Zwischentitel
   davor) sind teilbar, alles andere nicht. */
function pdfPrepareStepItems(m, units) {
  return units.map((u) => {
    const idx = u.html.indexOf('<div class="pv-step">');
    const item = { u, split: false, kind: 's' };
    if (idx < 0 || u.html.indexOf('<div class="pv-step">', idx + 5) !== -1) return item;
    const stepHtml = u.html.slice(idx);
    const no = (stepHtml.match(/pv-step-no">(\d+)</) || [])[1];
    const step = no ? (m.steps || []).find((s) => s.type === 'step' && String(s.no) === no) : null;
    if (!step) return item;
    const text = String(step.text || '');
    const pts = pdfSplitPoints(text);
    if (!pts.length) return item;
    return Object.assign(item, { split: true, head: u.html.slice(0, idx), step, text, pts });
  });
}
function pdfStepChunkHtml(item, from, to, first) {
  const chunk = item.text.slice(from, to).trim();
  const html = pvStepUnits([Object.assign({}, item.step, { text: chunk })])[0].html;
  return first ? (item.head || '') + html : html.replace(/(<span class="pv-step-no">)[^<]*(<\/span>)/, '$1$2').replace('<div class="pv-step">', '<div class="pv-step" data-cont="1">');
}
function pdfPieceUnit(p) {
  const it = p.it;
  if (!it.split) return it.u || it;
  if (p.from === 0 && p.to === it.text.length) return it.u;
  return { html: pdfStepChunkHtml(it, p.from, p.to, p.from === 0) };
}

/* Messung der Einheiten im echten Kontext. Liefert Hoehen in mm je Schritt-/Zusatz-Einheit, den Rahmen der Abschnitte
   (Ueberschrift, Abstaende), die Hoehe der leeren Seiten (mit allen Zutaten auf Seite 1) und die Zeilengeometrie. */
function pdfMeasurePlanInputs(ctx, ingU, stepItems, exItems) {
  const meas = (u, k) => ({ ...u, html: `<div class="pdf-meas" data-k="${k}" style="display:flow-root">${u.html}</div>` });
  const stepW = stepItems.map((it) => meas(it.u, 's')), exW = exItems.map((it) => meas(it.u, 'e'));
  const base = (pg) => pdfStripImg(pvPage(ctx, Object.assign({ n: 1, total: 2, ing: [], steps: [], extras: [] }, pg)));
  const base0 = measureSectionHeightMm(base({ first: true, ing: ingU }));
  const baseC = measureSectionHeightMm(base({ first: false, n: 2 }));
  const r = pdfWithProbe(base({ first: false, n: 2, steps: stepW, extras: exW }), (el) => {
    const hs = (k) => Array.from(el.querySelectorAll(`.pdf-meas[data-k="${k}"]`)).map((n) => n.getBoundingClientRect().height / MM_PX);
    const sh = hs('s'), eh = hs('e');
    const sum = (a) => a.reduce((x, y) => x + y, 0);
    const sec = el.querySelector('.pv-steps'), ex = el.querySelector('.pv-extras');
    const stepEl = el.querySelector('.pdf-meas[data-k="s"] .pv-step');
    const stepTxt = stepEl && stepEl.querySelector('.pv-step-text');
    const lh = stepTxt ? (parseFloat(getComputedStyle(stepTxt).lineHeight) || 0) / MM_PX : 0;
    const mb = stepEl ? (parseFloat(getComputedStyle(stepEl).marginBottom) || 0) / MM_PX : 0;
    const pbBorder = stepEl ? ((parseFloat(getComputedStyle(stepEl).paddingBottom) || 0) + (parseFloat(getComputedStyle(stepEl).borderBottomWidth) || 0)) / MM_PX : 0;
    return {
      sh, eh,
      chromeS: stepItems.length && sec ? Math.max(0, sec.getBoundingClientRect().height / MM_PX - sum(sh)) : 0,
      chromeE: exItems.length && ex ? Math.max(0, ex.getBoundingClientRect().height / MM_PX - sum(eh) + 0) : 0,
      lh: lh || 5.3, mb: (mb + pbBorder) || 3.5,
    };
  });
  return Object.assign({ base0, baseC }, r);
}

/* Fuellen: Einheiten Seite fuer Seite einsetzen. capOf(p) = verfuegbare Hoehe auf Seite p (ohne den festen Rahmen).
   Teilbare Schritte duerfen an Satzgrenzen geteilt werden (mind. zwei Zeilen vorher und nachher), wenn der Schritt nicht mehr
   hineinpasst, aber noch deutlich Platz bleibt, oder wenn er allein schon laenger als eine Seite ist. Ein Abschnittsrahmen
   (chrome[kind]) zaehlt einmal je Seite. Rueckgabe: Seiten { s:[Stuecke], e:[Stuecke], used }. */
function pdfFlow(items, heights, capOf, chrome, geom) {
  const pages = [{ s: [], e: [], used: 0 }];
  const lineCount = (textH, frac) => Math.max(1, Math.ceil((textH * frac) / geom.lh - 1e-9));
  items.forEach((it, i) => {
    let from = 0, h = heights[i];
    let textH = Math.max(geom.lh, h - geom.mb);
    for (let guard = 0; guard < 60; guard++) {
      const p = pages.length - 1, pg = pages[p], c = capOf(p);
      const k = it.kind, add = pg[k].length ? 0 : chrome[k];
      const len = it.split ? it.text.length : 0, remaining = c - pg.used - add;
      const empty = !pg.s.length && !pg.e.length;
      if (h <= remaining + 1e-6) { pg[k].push({ it, from, to: len, first: from === 0, h }); pg.used += h + add; return; }
      if (it.split && (lineCount(textH, 1) >= 5 || h > c) && (!empty ? remaining >= Math.min(c * 0.2, geom.lh * 3 + geom.mb) : h > c)) {
        const total = len - from; let best = -1, bestH = 0;
        for (const pt of it.pts) {
          if (pt - from < 20) continue;
          if (len - pt < 20) break;
          const l1 = lineCount(textH, (pt - from) / total), l2 = lineCount(textH, (len - pt) / total);
          const hh = l1 * geom.lh + geom.mb;
          if (hh <= remaining + 1e-6) { if (l1 >= 2 && l2 >= 2) { best = pt; bestH = hh; } } else break;
        }
        if (best > 0) {
          pg[k].push({ it, from, to: best, first: from === 0, h: bestH }); pg.used += bestH + add;
          textH = lineCount(textH, (len - best) / total) * geom.lh; h = textH + geom.mb; from = best;
          pages.push({ s: [], e: [], used: 0 }); continue;
        }
      }
      if (empty && (p > 0 || h + chrome[k] > capOf(p + 1) + 1e-6)) { pg[k].push({ it, from, to: len, first: from === 0, h, forced: true }); pg.used += h + add; return; }
      pages.push({ s: [], e: [], used: 0 });
    }
  });
  return pages;
}
const pdfPieceSum = (pg) => pg.reduce((a, x) => a + x.h, 0);

/* Eine Verteilung fuer den Fuellgrad f (0 bis 1; 1 = Seite voll) simulieren. */
function pdfSimulate(inp, items, f, safety) {
  const capOf = (p) => Math.max(0, f * (PAGE_HEIGHT_MM + PDF_PLAN_EPS_MM - safety - (p === 0 ? inp.base0 : inp.baseC)));
  const heights = items.map((it) => (it.kind === 's' ? inp.sh : inp.eh)[it.ix]);
  const pages = pdfFlow(items, heights, capOf, { s: inp.chromeS, e: inp.chromeE }, inp);
  return { pages, K: pages.length, f };
}

/* Kleinsten Fuellgrad finden, bei dem alles auf N Seiten passt (gleichmaessige Verteilung). */
function pdfSearchPlan(inp, items, safety, minFill) {
  minFill = minFill || PDF_PLAN_MIN_FILL;
  const k1 = pdfSimulate(inp, items, 1, safety).K;
  for (let N = Math.max(2, k1); N <= k1 + 3; N++) {
    // gueltig: mindestens zwei Seiten (Einseitiges scheiterte vorher), hoechstens N
    const ok = (f) => { const s = pdfSimulate(inp, items, f, safety); return s.K >= 2 && s.K <= N; };
    let hiF = null;
    for (let f = 1; f >= minFill - 1e-9; f -= 0.05) { if (ok(f)) { hiF = f; break; } }
    if (hiF === null) continue;
    let lo = Math.max(minFill, hiF - 0.05), hi = hiF;
    if (ok(lo)) { hi = lo; lo = minFill; }
    for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (ok(mid)) hi = mid; else lo = mid; }
    return pdfSimulate(inp, items, ok(Math.min(1, hi + 0.01)) ? Math.min(1, hi + 0.01) : hi, safety);
  }
  return null;
}

/* Verteilung in Seiten-HTML umsetzen (Gesamtzahl steht fest, damit «Fortsetzung · N von M» stimmt). */
function pdfAssemble(ctx, sim, ingU) {
  const K = sim.K;
  return sim.pages.map((pg, p) => pvPage(ctx, { first: p === 0, n: p + 1, total: K, ing: p === 0 ? ingU : [], steps: pg.s.map(pdfPieceUnit), extras: pg.e.map(pdfPieceUnit) }));
}

/* Rueckfall (sehr lange Zutatenlisten, Zusatzbloecke ueber eine ganze Seite): Seite fuer Seite mit echter Messung fuellen.
   Zutaten zuerst, dann Schritte, dann Zusatzbloecke. */
function pdfLongPagesGreedy(ctx, ingU, stepItems, exItems) {
  const queue = ingU.map((u) => ({ k: 'i', u })).concat(stepItems.map((x) => ({ k: 's', u: x.u })), exItems.map((x) => ({ k: 'e', u: x.u })));
  const pages = []; let guard = 0;
  const lists = (cur) => ({ i: cur.ing, s: cur.steps, e: cur.extras });
  while (queue.length && guard++ < 120) {
    const cur = { first: pages.length === 0, ing: [], steps: [], extras: [] };
    const L = lists(cur);
    let added = 0;
    while (queue.length) {
      const q = queue[0]; L[q.k].push(q.u);
      if (!added || pdfFits(pvPage(ctx, Object.assign({ n: pages.length + 1, total: 9 }, cur)))) { queue.shift(); added++; } else { L[q.k].pop(); break; }
    }
    pages.push(cur);
  }
  return pages.map((pg, p) => pvPage(ctx, Object.assign({ n: p + 1, total: pages.length }, pg)));
}

/* Mehrseitige Planung (Stufe 3 und 4). Ergebnis: { html: [...], tier } */
function pdfPlanMultiPage(m, recipe, imgUrl, dims, detail, plans) {
  const frame = imgUrl && dims ? (plans[1] || plans[0]).frame : null;
  const variants = [];
  [false, true].forEach((tight) => {
    const ctx = { m, recipe, imgUrl: frame ? imgUrl : null, frame, tight, detail };
    const ingU = pvIngredientUnits(m.ingredients);
    const stepItems = pdfPrepareStepItems(m, pvStepUnits(m.steps));
    const exItems = pvExtrasUnits(m, detail).map((u) => ({ u, kind: 'e', split: false }));
    const inp = pdfMeasurePlanInputs(ctx, ingU, stepItems, exItems);
    const items = stepItems.map((it, ix) => Object.assign(it, { ix })).concat(exItems.map((it, ix) => Object.assign(it, { ix })));
    let result = null;
    // Passen die Zutaten allein nicht sinnvoll auf Seite 1 (kaum Platz fuer Schritte), baut die Rueckfallmethode die Seiten.
    const roomOnFirst = PAGE_HEIGHT_MM - inp.base0;
    if (roomOnFirst > 30) {
      for (let safety = 0; safety <= 12 && !result; safety += 2.5) {
        let sim = pdfSearchPlan(inp, items, safety);
        // Letzte Seite fast leer (weniger als 30 % gefuellt)? Dann mit niedrigerem Fuellgrad gleichmaessiger verteilen
        const lastFill = (s) => { const last = s.pages[s.pages.length - 1]; const cap = PAGE_HEIGHT_MM - safety - (s.K === 1 ? inp.base0 : inp.baseC); return cap > 0 ? last.used / cap : 1; };
        if (sim && sim.K >= 2 && lastFill(sim) < 0.3) { const alt = pdfSearchPlan(inp, items, safety, 0.4); if (alt && alt.K === sim.K && lastFill(alt) > lastFill(sim)) sim = alt; }
        if (!sim || sim.K < 2) break;
        const html = pdfAssemble(ctx, sim, ingU);
        if (html.every((h) => pdfFits(h))) result = { html, tight, forced: false };
      }
    }
    if (!result) result = { html: pdfLongPagesGreedy(ctx, ingU, stepItems, exItems), tight, forced: true };
    variants.push(result);
  });
  // weniger Seiten gewinnen; bei Gleichstand die normalen Abstaende
  const best = variants.reduce((a, b) => (b.html.length < a.html.length ? b : a));
  return { html: best.html, tier: best.html.length === 2 ? 3 : 4, tight: best.tight };
}

/* Ergebnis: { htmlPages, layout, tier, pageCount }. Liefert IMMER Seiten mit dem kompletten Rezeptinhalt. */
async function buildRecipePdfPage(r, previousLayout, nutritionDetail, chapter) {
  const imgUrl = await resolveRecipeImageDataUrl(r);
  const dims = imgUrl ? await getImageDimensions(imgUrl) : null;
  const detail = nutritionDetail || 'off';
  let result = null;
  if (detail !== 'off') { try { result = await pdfNutritionForExport(r); } catch (e) { /* Nährwerte sind optional */ } }
  const m = pdfBuildModel(r, result, { chapter: chapter || '' });
  const photoOk = !!(imgUrl && dims);
  // Bildzustand fuer die Oberflaeche: 'none' (kein Foto), 'ok', 'failed' (Foto gespeichert, aber nicht ladbar), 'lowres' (unter 100 dpi bei 60 mm)
  const imageState = !imgUrl ? 'none' : !photoOk ? 'failed' : (!imageResolutionSufficientForFrame(dims.width, 60) ? 'lowres' : 'ok');
  const plans = pdfPhotoPlans(photoOk ? imgUrl : null, dims);
  for (let i = 0; i < plans.length; i++) {
    const opts = plans[i];
    const html = pvRecipePage(m, r, photoOk ? imgUrl : null, opts, detail);
    if (pdfFits(html)) {
      return { htmlPages: [html], layout: (opts.frame ? 'photo' : 'text') + (opts.tight ? '-tight' : ''), tier: i === 0 ? 1 : 2, pageCount: 1, imageState };
    }
  }
  const multi = pdfPlanMultiPage(m, r, photoOk ? imgUrl : null, dims, detail, plans);
  return { htmlPages: multi.html, layout: 'long', tier: multi.tier, pageCount: multi.html.length, imageState };
}

/* Naehrwerte nur, wenn vollstaendig und aktuell berechnet (sonst weglassen statt Teilsummen zu drucken) */
async function pdfNutritionForExport(r) {
  const st = await nutritionStatusFor(r);
  return st.status === 'calculated' ? st.result : null;
}

function pdfSetContext(templateId, bookTitle, author, logo, book) {
  PDF_CTX = { tpl: pdfTemplateById(templateId), bookTitle: bookTitle || '', author: author || '', logo: logo !== false, book: !!book };
}
function pdfWrapTitle(html, r, chapter) {
  return html.replace('data-page-kind="recipe"', `data-page-kind="recipe" data-title="${escapeHtml(r.title || 'Ohne Titel')}" data-chapter="${escapeHtml(chapter || '')}"`);
}

/* Inhaltsverzeichnis: Eintraege seitenweise nach GEMESSENER Hoehe verteilen (lange Titel brechen um und
   brauchen mehr Platz). Die Seitenzahlen kommen aus der abgeschlossenen Seitenplanung. Kapitelzeilen bleiben
   nie allein am Seitenende. Folgeseiten heissen «Inhalt · Fortsetzung». */
function pdfTocPages(rows) {
  if (!rows.length) return pvTocPages(rows);
  const chunks = []; let cur = [];
  const fits = (list) => { const h = pvTocPages(list.slice(0, 27))[0]; return candidateFitsOnePage(h); };
  rows.forEach((row, i) => {
    cur.push(row);
    if (cur.length > 1 && (cur.length > 27 || !fits(cur))) {
      let carry = [cur.pop()];
      while (cur.length && cur[cur.length - 1].kind === 'chapter') carry.unshift(cur.pop());   // Kapitelzeile nicht allein am Seitenende
      if (!cur.length) { cur = carry; carry = []; }
      chunks.push(cur); cur = carry;
    }
  });
  if (cur.length) chunks.push(cur);
  return chunks.map((chunk, n) => {
    const html = pvTocPages(chunk)[0];
    return n === 0 ? html : html.replace(/(<h1 class="pv-toc-title">)Inhalt(<\/h1>)/, '$1Inhalt · Fortsetzung$2');
  });
}

/* Einzelrezept-PDF: gleiche Layoutlogik wie das Kochbuch. opts: { template, signal, onProgress } */
function buildSinglePdf(id, nutritionDetail, opts) {
  return pdfExclusive(() => pdfBuildSingleImpl(id, nutritionDetail, opts));
}
async function pdfBuildSingleImpl(id, nutritionDetail, opts) {
  const r = state.recipes.find(x => x.id === id);
  if (!r) return null;
  const templateId = (opts && opts.template) || pdfDefaultTemplateId();
  pdfSetContext(templateId, '', '', false);
  try {
    pdfProgress(opts, 0, 1, 'prepare');
    await ensurePdfLibs();   // Fehler (offline/Timeout) frueh und mit verstaendlicher Meldung
    await ensureFontsReadyForPdf();
    pdfCheckAbort(opts);
    const { htmlPages, imageState } = await buildRecipePdfPage(r, null, nutritionDetail);
    pdfCheckAbort(opts);
    document.getElementById('printRoot').innerHTML = htmlPages.map((h, i) => (i === 0 ? pdfWrapTitle(h, r, '') : h)).join('');
    cleanupPdfMeasureProbe();
    const blob = await renderSectionsToPdf(Object.assign({}, opts, { title: r.title || 'Savora Rezept', subject: 'Rezept' }));
    if (!blob) return null;
    blob.plannedPages = htmlPages.length;
    blob.imageIssues = imageState === 'failed' || imageState === 'lowres' ? [{ id: r.id, title: r.title || '', state: imageState }] : [];   // fuer die Anzeige im Dialog (Foto nicht ladbar / niedrige Aufloesung)
    return { blob, filename: `savora-${slugifyTitle(r.title)}.pdf` };
  } finally {
    const root = document.getElementById('printRoot'); if (root) root.innerHTML = '';
    cleanupPdfMeasureProbe();
  }
}

/* Gesamtes Kochbuch. Deckblatt, Inhaltsverzeichnis (nach der fertigen Pagination erzeugt, mit
   echten Seitenlinks), optionale Kapitelseiten, Rezepte. Auswahl und Reihenfolge kommen aus der
   Kochbuch-Konfiguration. opts: { template, signal, onProgress } */
function buildCookbookPdf(nutritionDetail, opts) {
  return pdfExclusive(() => pdfBuildCookbookImpl(nutritionDetail, opts));
}
async function pdfBuildCookbookImpl(nutritionDetail, opts) {
  const cfg = getCookbookConfig();
  const sections = cookbookOrderedSections(cfg);
  const recipes = sections.flatMap(s => s.recipes);
  if (!recipes.length) return null;
  try {
    await ensurePdfLibs();   // Fehler (offline/Timeout) frueh und mit verstaendlicher Meldung
    const templateId = (opts && opts.template) || cfg.pdfTemplate || pdfDefaultTemplateId();
    const title = cfg.title || '';   // leer = nichts drucken (kein unsichtbarer Standardtitel)
    const author = cfg.author || '';
    pdfSetContext(templateId, title, author, cfg.showLogo !== false, true);
    await ensureFontsReadyForPdf();

    // 1) Planung aller Rezepte (Seitenzahlen stehen danach fest)
    const pagesByRecipeId = {};
    const imageIssues = [];
    let previousLayout = null;
    for (let i = 0; i < recipes.length; i++) {
      pdfCheckAbort(opts);
      pdfProgress(opts, i, recipes.length, 'plan');
      await pdfYield();
      const r = recipes[i];
      const { htmlPages, layout, imageState } = await buildRecipePdfPage(r, previousLayout, nutritionDetail, typeof pdfChapterNameFor === 'function' ? pdfChapterNameFor(cfg, r.id) : '');   // gleiche Kapitelangabe wie im Inhaltsverzeichnis
      pagesByRecipeId[r.id] = htmlPages;
      if (imageState === 'failed' || imageState === 'lowres') imageIssues.push({ id: r.id, title: r.title || '', state: imageState });
      previousLayout = layout;
    }
    pdfCheckAbort(opts);

    // 2) Inhaltsverzeichnis und Kapitel aus der fertigen Planung
    const hasChapters = sections.some(s => s.chapter);
    const chapterPages = !!cfg.chapterPages && hasChapters;   // eigene Kapitelseiten nur auf Wunsch
    const build = (firstBodyPage) => {
      let page = firstBodyPage;
      const rows = []; const body = [];
      sections.forEach((s) => {
        const chName = s.chapter ? s.chapter.name : (hasChapters ? 'Weitere Rezepte' : '');
        if (hasChapters) rows.push({ kind: 'chapter', title: chName });
        if (chapterPages) { body.push(pvChapterPage(chName)); page += 1; }
        s.recipes.forEach((r) => {
          rows.push({ kind: 'recipe', title: r.title || 'Ohne Titel', page, id: r.id });
          const pages = pagesByRecipeId[r.id];
          body.push(pages.map((h, i) => (i === 0 ? pdfWrapTitle(h, r, chName) : h)).join(''));
          page += pages.length;
        });
      });
      return { rows, body };
    };
    let built = build(3);
    let tocPages = pdfTocPages(built.rows);
    for (let guard = 0; guard < 4 && tocPages.length !== (guard === 0 ? 1 : built.tocCount); guard++) {
      built = build(2 + tocPages.length); built.tocCount = tocPages.length;
      const again = pdfTocPages(built.rows);
      if (again.length === tocPages.length) { tocPages = again; break; }
      tocPages = again;
    }
    const tocHtml = tocPages.join('');

    // Titelblatt: eine Layoutdefinition fuer Vorschau und Export; zu lange Texte brechen den Export mit konkretem Hinweis ab
    coverEnsureConfig();
    const cfgNow = getCookbookConfig();
    await coverEnsureFonts();
    const layout = coverLayout({ templateId: cfgNow.cover.templateId, title: cfgNow.title, name: cfgNow.author, slogan: cfgNow.subtitle, date: cfgNow.cover.date, showDate: cfgNow.cover.showDate, logo: cfgNow.showLogo !== false });
    if (layout.warnings.length) throw coverError(layout.warnings.map(w => w.message).join(' '));
    const coverBg = await coverBackgroundDataUrl(layout.templateId);
    // Gleiche Zeichenfunktion wie die Vorschau; Hintergrund in Originalaufloesung (1055 x 1491 px), Seite doppelt so fein fuer scharfe Schrift
    const coverCanvas = await coverRenderCanvas(layout, 2, coverBg);
    const cover = coverHtml(layout, coverCanvas.toDataURL('image/png'));
    pdfCheckAbort(opts);
    document.getElementById('printRoot').innerHTML = cover + tocHtml + built.body.join('');
    cleanupPdfMeasureProbe();
    const stamp = new Date().toISOString().slice(0, 10);
    const planned = 1 + tocPages.length + built.body.reduce((n, h) => n + (h.match(/<section /g) || []).length, 0);
    const blob = await renderSectionsToPdf(Object.assign({}, opts, { title: title || 'Savora Kochbuch', subject: 'Kochbuch', author }));
    if (!blob) return null;
    blob.plannedPages = planned;
    blob.imageIssues = imageIssues;
    // Inhaltsverzeichnis gegen die tatsaechlichen Rezeptanfaenge pruefen (Planung und PDF muessen uebereinstimmen)
    const mismatch = built.rows.filter((row) => row.kind === 'recipe' && blob.recipeStart && blob.recipeStart[row.id] !== row.page);
    if (mismatch.length) console.warn('PDF: Inhaltsverzeichnis weicht von den Seiten ab', mismatch.map((x) => x.title));
    blob.tocMismatch = mismatch.length;
    return { blob, filename: `savora-kochbuch-${stamp}.pdf` };
  } finally {
    const root = document.getElementById('printRoot'); if (root) root.innerHTML = '';
    cleanupPdfMeasureProbe();
  }
}
