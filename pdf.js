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
  if (r.image) return r.image;
  if (r.imageId) {
    try {
      const record = await dbGetImage(r.imageId);
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
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
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
    await Promise.all([
      document.fonts.load('800 26pt "Sofia Sans Extra Condensed"'),
      document.fonts.load('400 10.5pt "Roboto"'),
      document.fonts.load('600 10.5pt "Roboto"'),
      document.fonts.load('400 26pt "Source Serif 4"'),
      document.fonts.load('600 26pt "Source Serif 4"'),
      document.fonts.load('700 10.5pt "Roboto"'),
    ]);
  } catch (e) { /* Font-API-Eigenheiten je Browser — document.fonts.ready ist die harte Garantie */ }
}

/* Rendert jedes direkte Kind von #printRoot als eigene PDF-Seite — randlos, echtes A4. Durch die
   Pagination VOR dem Rendern (buildRecipePdfPage/buildLongRecipePages) passt jede Section bereits
   auf eine Seite; die Slice-Schleife greift nur noch als Sicherheitsnetz, falls eine Section
   (z.B. ein sehr langes Inhaltsverzeichnis) dennoch zu hoch geraet — dann lieber ein sauberer,
   an sicheren Stellen gesetzter Schnitt als ein abgeschnittenes PDF. */
/* F05: html2canvas beachtet object-fit nicht und zieht Fotos deshalb auf die Rahmengroesse (Manti
   wurde breit und flach). Darum wird jedes Foto VOR dem Rastern auf genau das Seitenverhaeltnis
   seines Rahmens zugeschnitten (wie object-fit: cover, mit Fokuspunkt). Danach passen Bild und
   Rahmen exakt zusammen, es gibt nichts mehr zu verzerren. */
async function pdfBakeCoverImages(section) {
  const imgs = Array.from(section.querySelectorAll('img.pdf-img-cover'));
  for (const img of imgs) {
    try {
      if (!img.complete || !img.naturalWidth) await img.decode();
      const box = img.getBoundingClientRect();
      const bw = box.width, bh = box.height, nw = img.naturalWidth, nh = img.naturalHeight;
      if (!bw || !bh || !nw || !nh) continue;
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
      await img.decode();
    } catch (e) { /* Bild bleibt wie es war; der Export bricht deshalb nicht ab */ }
  }
}

/* F06: Unsichtbare Textebene ueber dem Seitenbild, damit das PDF durchsucht, kopiert und vorgelesen
   werden kann. Die Optik bleibt das gerasterte Seitenbild; der Text liegt deckungsgleich darueber. */
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
      const re = /\S+/g; let m;
      while ((m = re.exec(txt))) {
        range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
        const r = range.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        words.push({ t: m[0], x: r.left - secRect.left, y: r.bottom - secRect.top, w: r.width, fs });
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
      const baselineMm = (l.y - l.fs * 0.22) * mmPerPx;
      const widthMm = (l.right - l.x) * mmPerPx;
      const natural = pdf.getTextWidth(l.text) || widthMm;
      pdf.text(l.text, l.x * mmPerPx, baselineMm, { renderingMode: 'invisible', horizontalScale: widthMm / natural });
    });
  } catch (e) { /* Textebene ist ein Zusatz; Fehler duerfen den Export nicht verhindern */ }
}

/* F06: echte, sichtbare Seitenzahlen (als Vektortext). Das Deckblatt eines Kochbuchs bleibt ohne Zahl. */
function pdfAddPageNumbers(pdf, skipPages) {
  const total = pdf.getNumberOfPages();
  const c = (PDF_CTX && PDF_CTX.tpl && PDF_CTX.tpl.pageNo) || [118, 95, 140];
  for (let i = 1; i <= total; i++) {
    if (skipPages && skipPages.has(i)) continue;
    pdf.setPage(i);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(c[0], c[1], c[2]);
    pdf.text(String(i), 195, 290.2, { align: 'right' });
  }
}

/* Rendert jedes direkte Kind von #printRoot als eigene PDF-Seite (randlos, A4). Jede Section passt
   durch die Vor-Pagination auf eine Seite; die Schnittlogik unten ist nur Sicherheitsnetz.
   Sammelt dabei Seitennummern der Rezeptanfaenge, die Klickflaechen des Inhaltsverzeichnisses und
   die Lesezeichen (Outline). */
async function renderSectionsToPdf() {
  const container = document.getElementById('printRoot');
  const sections = Array.from(container.children);
  if (!sections.length) return null;
  await ensureFontsReadyForPdf();

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const pageWidthMm = 210, pageHeightMm = 297;
  let firstPage = true;
  const recipeStart = {};       // recipeId -> Seite (1-basiert)
  const recipeTitles = [];      // [{ id, title, chapter, page }]
  const tocLinks = [];          // [{ page, x, y, w, h, target }]
  const skipNumbers = new Set();

  for (const section of sections) {
    const domWidth = section.offsetWidth || 1;
    const sectionTop = section.getBoundingClientRect().top;
    const kind = section.dataset.pageKind || '';
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

    await pdfBakeCoverImages(section);
    const canvas = await html2canvas(section, { scale: PDF_RENDER_SCALE, backgroundColor: null, useCORS: true });
    const pxPerMm = canvas.width / pageWidthMm;
    const scale = canvas.width / domWidth;
    const pageHeightPx = pageHeightMm * pxPerMm;

    let pageNo;
    if (canvas.height <= pageHeightPx + 2 * pxPerMm) {
      if (!firstPage) pdf.addPage();
      firstPage = false;
      pageNo = pdf.getNumberOfPages();
      const imgData = canvas.toDataURL('image/jpeg', PDF_JPEG_QUALITY);
      pdf.addImage(imgData, 'JPEG', 0, 0, pageWidthMm, canvas.height / pxPerMm);
      pdfAddTextLayer(pdf, section, pageWidthMm / domWidth);
    } else {
      // Sicherheitsnetz: nur falls eine Section trotz Vor-Pagination zu hoch ist
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
        sliceCanvas.getContext('2d').drawImage(canvas, 0, cursor, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);
        pdf.addImage(sliceCanvas.toDataURL('image/jpeg', PDF_JPEG_QUALITY), 'JPEG', 0, 0, pageWidthMm, sliceHeightPx / pxPerMm);
        cursor = sliceEnd;
      }
    }
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
  pdf.setProperties({ title: (PDF_CTX && PDF_CTX.bookTitle) || 'Savora', creator: 'Savora' });
  const out = pdf.output('blob');
  try { out.pageCount = pdf.getNumberOfPages(); } catch (e) {}
  return out;
}

/* Startet den eigentlichen Dateidownload — getrennt von renderSectionsToPdf(), damit dazwischen
   erst eine Vorschau gezeigt werden kann (Punkt 65/138-149). */
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

/* ---------- Seitenaufbau eines Rezepts (Vorlagen A/B/C) ---------- */

/* Messen ohne die grossen Bild-Daten (Rahmen haben feste Groesse): schnell und Layout-neutral. */
function pdfFits(html) {
  return candidateFitsOnePage(html.replace(/src="data:[^"]+"/g, 'src=""'));
}

/* Reihenfolge der Versuche bei knappem Platz: Foto innerhalb erlaubter Grenzen verkleinern ->
   Abstaende moderat reduzieren -> erst dann mehrere Seiten. Die Schrift wird nie verkleinert. */
function pdfPhotoPlans(imgUrl, dims, tplId) {
  if (!imgUrl || !dims) return [{ photo: 'none' }, { photo: 'none', tight: true }];
  const ar = dims.width / dims.height;
  const portrait = ar < 0.85;
  const lowRes = !imageResolutionSufficientForFrame(dims.width, 180);
  const side = portrait ? { w: 52, h: 68 } : (ar <= 1.15 ? { w: 56, h: 56 } : { w: 64, h: 46 });
  const sideSmall = portrait ? { w: 40, h: 52 } : (ar <= 1.15 ? { w: 44, h: 44 } : { w: 50, h: 36 });
  if (tplId === 'C') return [{ photo: 'side', side }, { photo: 'side', side: sideSmall, tight: true }];
  if (portrait || lowRes) return [{ photo: 'side', side }, { photo: 'side', side: sideSmall, tight: true }];
  return [
    { photo: 'band', bandMm: 66 }, { photo: 'band', bandMm: 58 }, { photo: 'band', bandMm: 50 },
    { photo: 'band', bandMm: 50, tight: true }, { photo: 'band', bandMm: 42, tight: true },
    { photo: 'side', side: sideSmall, tight: true },
  ];
}

/* Lange Rezepte: Seite 1 mit Kopf und zwei Spalten, danach Fortsetzungsseiten. Zutaten und
   Zubereitung werden Einheit fuer Einheit gefuellt und real nachgemessen; Zwischentitel bleiben
   bei ihrem Inhalt, kleine Zutatenkomponenten zusammen. */
function pdfLongPages(m, recipe, imgUrl, dims, detail, tight) {
  const ingQ = pvIngredientUnits(m.ingredients).slice();
  const stepQ = pvStepUnits(m.steps).slice();
  const extras = pvExtrasHtml(m, detail);
  const ar = dims ? dims.width / dims.height : 1.5;
  const side = ar < 0.85 ? { w: 36, h: 48 } : (ar <= 1.15 ? { w: 40, h: 40 } : { w: 46, h: 33 });
  // grobe Hoehenschaetzung je Einheit (Zeilen), damit beide Spalten gemeinsam leerlaufen
  const estIng = (u) => (u.html.match(/pv-ing"/g) || []).length * 1.9 + (u.html.match(/pv-ing-group/g) || []).length * 1.6 + (u.html.replace(/<[^>]+>/g, '').length / 26);
  const estStep = (u) => u.html.replace(/<[^>]+>/g, '').length / 62 + 1.1;
  const firstOpts = (p, withExtras) => ({ photo: imgUrl ? 'side' : 'none', side, tight, ingUnits: p.ing, stepUnits: p.steps, extras: withExtras });
  const htmlOf = (p, withExtras) => p.first
    ? pvRecipePage(m, recipe, imgUrl, firstOpts(p, withExtras), detail)
    : pvContinuationPage(m, p.ing, p.steps, withExtras ? extras : '', tight, p.ingRight);
  const pages = [];
  let guard = 0;
  while ((ingQ.length || stepQ.length) && guard++ < 80) {
    const first = pages.length === 0;
    const twoIngCols = !first && !stepQ.length && ingQ.length > 0;
    const cur = { first, ing: [], steps: [], ingRight: twoIngCols ? [] : null };
    const rightList = twoIngCols ? cur.ingRight : cur.steps;
    const rightQ = twoIngCols ? ingQ : stepQ;
    const leftQ = ingQ;
    let hL = 0, hR = 0, leftOpen = true, rightOpen = true;
    const halfEst = twoIngCols ? ingQ.reduce((n, u) => n + estIng(u), 0) / 2 : 0;
    const fits = () => pdfFits(htmlOf(cur, false));
    // bei twoIngCols teilen sich beide Spalten dieselbe Warteschlange
    while ((leftOpen && leftQ.length) || (rightOpen && rightQ.length)) {
      const canL = leftOpen && leftQ.length, canR = rightOpen && rightQ.length && !(twoIngCols && !leftQ.length);
      const pickLeft = canL && (twoIngCols ? (hL < halfEst || !canR) : (!canR || hL <= hR));
      if (pickLeft) {
        const u = leftQ[0]; cur.ing.push(u);
        if (fits() || (cur.ing.length === 1 && !rightList.length)) { leftQ.shift(); hL += estIng(u); }
        else { cur.ing.pop(); leftOpen = false; }
      } else if (canR) {
        const u = rightQ[0]; rightList.push(u);
        if (fits() || (rightList.length === 1 && !cur.ing.length)) { rightQ.shift(); hR += twoIngCols ? estIng(u) : estStep(u); }
        else { rightList.pop(); rightOpen = false; }
      } else break;
    }
    pages.push(cur);
    if (!cur.ing.length && !rightList.length) break;   // Sicherheitsnetz gegen Endlosschleife
  }
  // Zusatzbloecke (Hinweise, Notizen, Naehrwerte, Quelle) ans Ende der letzten Seite, sonst eigene Seite
  const last = pages[pages.length - 1];
  let extrasOnOwnPage = false;
  if (extras) {
    last.extrasInline = pdfFits(htmlOf(last, true));
    if (!last.extrasInline) extrasOnOwnPage = true;
  }
  const out = pages.map((p) => htmlOf(p, !!p.extrasInline));
  if (extrasOnOwnPage) out.push(pvContinuationPage(m, [], [], extras, tight, null));
  return { html: out, extrasAlone: extrasOnOwnPage };
}

/* Ergebnis: { htmlPages, layout }. Liefert IMMER Seiten mit dem kompletten Rezeptinhalt. */
async function buildRecipePdfPage(r, previousLayout, nutritionDetail) {
  const imgUrl = await resolveRecipeImageDataUrl(r);
  const dims = imgUrl ? await getImageDimensions(imgUrl) : null;
  const detail = nutritionDetail || 'off';
  let result = null;
  if (detail !== 'off') { try { result = await pdfNutritionForExport(r); } catch (e) { /* Nährwerte sind optional */ } }
  const m = pdfBuildModel(r, result);
  const plans = pdfPhotoPlans(imgUrl, dims, PDF_CTX.tpl.id);
  for (const opts of plans) {
    const html = pvRecipePage(m, r, imgUrl, opts, detail);
    if (pdfFits(html)) return { htmlPages: [html], layout: opts.photo + (opts.tight ? '-tight' : '') };
  }
  let long = pdfLongPages(m, r, imgUrl, dims, detail, false);
  // Keine letzte Seite nur fuer einen kurzen Hinweis: mit engeren Abstaenden erneut versuchen
  if (long.extrasAlone) {
    const tightLong = pdfLongPages(m, r, imgUrl, dims, detail, true);
    if (tightLong.html.length <= long.html.length) long = tightLong;
  }
  return { htmlPages: long.html, layout: 'long' };
}

/* Naehrwerte nur, wenn vollstaendig und aktuell berechnet (sonst weglassen statt Teilsummen zu drucken) */
async function pdfNutritionForExport(r) {
  const st = await nutritionStatusFor(r);
  return st.status === 'calculated' ? st.result : null;
}

function pdfSetContext(templateId, bookTitle, author, logo) {
  PDF_CTX = { tpl: pdfTemplateById(templateId), bookTitle: bookTitle || '', author: author || '', logo: logo !== false };
}
function pdfWrapTitle(html, r, chapter) {
  return html.replace('data-page-kind="recipe"', `data-page-kind="recipe" data-title="${escapeHtml(r.title || 'Ohne Titel')}" data-chapter="${escapeHtml(chapter || '')}"`);
}

/* Einzelrezept-PDF: gleiche Layoutlogik wie das Kochbuch. */
async function buildSinglePdf(id, nutritionDetail, opts) {
  const r = state.recipes.find(x => x.id === id);
  if (!r) return null;
  const templateId = (opts && opts.template) || pdfDefaultTemplateId();
  pdfSetContext(templateId, '', '', false);
  await ensureFontsReadyForPdf();
  const { htmlPages } = await buildRecipePdfPage(r, null, nutritionDetail);
  document.getElementById('printRoot').innerHTML = htmlPages.map((h, i) => (i === 0 ? pdfWrapTitle(h, r, '') : h)).join('');
  cleanupPdfMeasureProbe();
  const blob = await renderSectionsToPdf();
  if (!blob) return null;
  return { blob, filename: `savora-${slugifyTitle(r.title)}.pdf` };
}

/* Gesamtes Kochbuch. Deckblatt, Inhaltsverzeichnis (nach der fertigen Pagination erzeugt, mit
   echten Seitenlinks), optionale Kapitelseiten, Rezepte. Auswahl und Reihenfolge kommen aus der
   Kochbuch-Konfiguration. */
async function buildCookbookPdf(nutritionDetail, opts) {
  const cfg = getCookbookConfig();
  const sections = cookbookOrderedSections(cfg);
  const recipes = sections.flatMap(s => s.recipes);
  if (!recipes.length) return null;
  const templateId = (opts && opts.template) || cfg.pdfTemplate || pdfDefaultTemplateId();
  const title = (cfg.title || state.cookbookTitle || 'Mein persönliches Kochbuch');
  const author = cfg.author || '';
  pdfSetContext(templateId, title, author, cfg.showLogo !== false);
  await ensureFontsReadyForPdf();

  const pagesByRecipeId = {};
  let previousLayout = null;
  for (const r of recipes) {
    const { htmlPages, layout } = await buildRecipePdfPage(r, previousLayout, nutritionDetail);
    pagesByRecipeId[r.id] = htmlPages;
    previousLayout = layout;
  }

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
  const tocCount = pvTocPages(built.rows).length;
  if (tocCount !== 1) built = build(2 + tocCount);
  const tocHtml = pvTocPages(built.rows).join('');

  let coverImg = '';
  if (cfg.coverRecipeId) {
    const cr = state.recipes.find(x => x.id === cfg.coverRecipeId);
    if (cr) { const url = await resolveRecipeImageDataUrl(cr); if (url) coverImg = url; }
  }
  const cover = pvCoverPage(title, author, coverImg, cfg.subtitle || '');
  document.getElementById('printRoot').innerHTML = cover + tocHtml + built.body.join('');
  cleanupPdfMeasureProbe();
  const stamp = new Date().toISOString().slice(0, 10);
  const blob = await renderSectionsToPdf();
  if (!blob) return null;
  return { blob, filename: `savora-kochbuch-${stamp}.pdf` };
}
