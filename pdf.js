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
function pdfAddPageNumbers(pdf, hasCover) {
  const total = pdf.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    if (hasCover && i === 1) continue;
    pdf.setPage(i);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(118, 95, 140);
    pdf.text(String(i), 196, 290, { align: 'right' });
  }
}

async function renderSectionsToPdf() {
  const container = document.getElementById('printRoot');
  const sections = Array.from(container.children);
  if (!sections.length) return null;
  await ensureFontsReadyForPdf();

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const pageWidthMm = 210, pageHeightMm = 297;
  let firstPage = true;

  for (const section of sections) {
    const domWidth = section.offsetWidth || 1;
    const sectionTop = section.getBoundingClientRect().top;
    const breakEls = Array.from(section.querySelectorAll('.pdf-safe-break'));
    const intervals = breakEls.map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top - sectionTop, bottom: r.bottom - sectionTop };
    });
    const domBreakTops = intervals
      .map((iv) => iv.top)
      .filter((y) => !intervals.some((iv) => y > iv.top + 0.5 && y < iv.bottom - 0.5));

    await pdfBakeCoverImages(section);
    const canvas = await html2canvas(section, { scale: PDF_RENDER_SCALE, backgroundColor: null, useCORS: true });
    const scale = canvas.width / domWidth;
    const pxPerMm = canvas.width / pageWidthMm;
    const pageHeightPx = pageHeightMm * pxPerMm;

    // Regelfall (garantiert durch die Vor-Pagination): passt komplett auf eine Seite -> ein Bild,
    // keine Schnittlogik noetig. Das ist jetzt der Normalpfad, nicht mehr der Sonderfall.
    if (canvas.height <= pageHeightPx + 2 * pxPerMm) {
      if (!firstPage) pdf.addPage();
      firstPage = false;
      const imgData = canvas.toDataURL('image/jpeg', PDF_JPEG_QUALITY);
      pdf.addImage(imgData, 'JPEG', 0, 0, pageWidthMm, canvas.height / pxPerMm);
      pdfAddTextLayer(pdf, section, pageWidthMm / domWidth);
      continue;
    }

    // Sicherheitsnetz: nur falls eine Section trotz Vor-Pagination zu hoch ist (z.B. ein sehr
    // langes Inhaltsverzeichnis bei vielen Rezepten) — schneidet an sicheren Stellen, nie mitten
    // in einem markierten Block, und malt NICHTS nachtraeglich auf den Schnitt (Punkt 34).
    const breakPointsPx = domBreakTops.map((t) => t * scale).sort((a, b) => a - b);
    const minSlicePx = 10 * pxPerMm;
    let cursor = 0;
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
      const sliceHeightPx = sliceEnd - cursor;
      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = sliceHeightPx;
      sliceCanvas.getContext('2d').drawImage(canvas, 0, cursor, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);
      const imgData = sliceCanvas.toDataURL('image/jpeg', PDF_JPEG_QUALITY);
      pdf.addImage(imgData, 'JPEG', 0, 0, pageWidthMm, sliceHeightPx / pxPerMm);
      cursor = sliceEnd;
    }
  }

  container.innerHTML = '';
  pdfAddPageNumbers(pdf, sections[0] && sections[0].classList.contains('pdf-page-cover'));
  return pdf.output('blob');
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

/* ---------- Teil F: Long-Recipe-Pagination ----------
   Wird nur aufgerufen, wenn die real gemessene Hoehe des normal gewaehlten Layouts (Hero/Split/
   Floating/Full-Statement/Typography) eine A4-Seite ueberschreitet. Zerlegt Zutaten, Zubereitung,
   Notizen und Naehrwerte in atomare Bloecke und packt sie GREEDY anhand echter Nachmessung auf so
   viele einspaltige Long-Recipe-Seiten wie noetig — nie mitten in einer Zutat/einem Schritt
   (Punkt 54-55), Naehrwerte-Box immer als Ganzes (Punkt 56-57), kein Bildfragment auf der
   Fortsetzung (Punkt 53), deterministisch bei gleichem Rezeptstand (Punkt 40). */
function buildLongRecipePages(recipe, imgUrl, result, nutritionDetail) {
  const factor = 1;
  const ingItems = pdfKeepWithNext(pdfIngredientItemsHtml(recipe, factor).map((html) => ({ type: 'ing', html })), (h) => h.includes('pdf-ing-group'));
  const stepItems = pdfKeepWithNext(pdfStepItemsHtml(recipe).map((html) => ({ type: 'step', html, num: html.includes('pdf-step-heading') ? 0 : 1 })), (h) => h.startsWith('<li class="pdf-step-heading"'));
  const notesHtml = pdfNotesBlock(recipe);
  const nutritionHtml = pdfNutritionBox(result, nutritionDetail);
  const extraBlocks = [];
  if (notesHtml) extraBlocks.push({ type: 'notes', html: notesHtml });
  if (nutritionHtml) extraBlocks.push({ type: 'nutrition', html: nutritionHtml });
  const allBlocks = ingItems.concat(stepItems, extraBlocks);

  if (!allBlocks.length) {
    // Randfall: Rezept ohne Zutaten/Schritte/Notizen/Naehrwerte, aber trotzdem zu hoch (z.B. sehr
    // langer Titel) — dann bleibt es bei genau einer Seite, mehr gibt es nicht zu verteilen.
    return [pdfLongRecipeSection(recipe, imgUrl, '', false)];
  }

  const pages = [];
  let cursor = 0;
  let pageIndex = 0;
  while (cursor < allBlocks.length) {
    const isFirst = pageIndex === 0;
    let end = cursor + 1; // Punkt 40: mindestens ein Block pro Seite, sonst Endlosschleife
    // Punkt 39/72: nicht schaetzen, sondern nach jedem Kandidaten-Block real nachmessen, wie hoch
    // die Seite MIT diesem Layout (Foto nur auf Seite 1) tatsaechlich wird.
    while (end < allBlocks.length) {
      const tryEnd = end + 1;
      const bodyHtml = pdfRenderBlockGroups(allBlocks.slice(cursor, tryEnd), allBlocks, cursor);
      const testHtml = pdfLongRecipeSection(recipe, isFirst ? imgUrl : null, bodyHtml, !isFirst);
      if (!candidateFitsOnePage(testHtml)) break;
      end = tryEnd;
    }
    const bodyHtml = pdfRenderBlockGroups(allBlocks.slice(cursor, end), allBlocks, cursor);
    pages.push(pdfLongRecipeSection(recipe, isFirst ? imgUrl : null, bodyHtml, !isFirst));
    cursor = end;
    pageIndex++;
  }
  return pages;
}

/* Baut eine einzelne Rezeptseite (oder mehrere, bei einem zu langen Rezept) komplett auf:
   Bildmasse ermitteln, Layout waehlen, Nutrition laden, HTML erzeugen — und JETZT zusaetzlich
   real nachmessen, ob das gewaehlte Layout ueberhaupt auf eine A4-Seite passt (Punkt 35-36/72),
   statt das erst beim Rendern per Zufall festzustellen. Passt es nicht, wird komplett auf das
   Long-Recipe-Layout mit echten Fortsetzungsseiten umgeschaltet (Teil F) — das betrifft vor allem
   Split/Full-Statement, deren Foto sonst ueber die Seitenkante hinauslaufen wuerde (Punkt 26-27).
   Gibt IMMER ein Array von HTML-Seiten zurueck (normalerweise genau eine). */
async function buildRecipePdfPage(r, previousLayout, nutritionDetail) {
  const imgUrl = await resolveRecipeImageDataUrl(r);
  const imgDims = imgUrl ? await getImageDimensions(imgUrl) : null;
  let result = null;
  if (nutritionDetail !== 'off') {
    try { result = await getFreshNutritionResult(r); } catch (e) { /* Nutrition optional — PDF funktioniert auch ohne */ }
  }
  const detail = nutritionDetail || 'compact';
  const { html, layout } = buildRecipePdfSection(r, imgUrl, imgDims, result, previousLayout, detail);

  if (candidateFitsOnePage(html)) {
    return { htmlPages: [html], layout };
  }
  const longPages = buildLongRecipePages(r, imgUrl, result, detail);
  return { htmlPages: longPages, layout: 'long' };
}

/* Baut das PDF fuer ein einzelnes Rezept und gibt {blob, filename} zurueck (kein Auto-Download —
   siehe pdf-ui.js fuer Vorschau/Download-Flow, Punkt 65). null bei Fehler. Nutzt dieselben
   Bausteine (Layouts, Pagination) wie der Kochbuch-Export, damit beide Exportwege dieselbe
   typografische Qualitaet haben (Punkt 121). */
async function buildSinglePdf(id, nutritionDetail) {
  const r = state.recipes.find(x => x.id === id);
  if (!r) return null;
  await ensureFontsReadyForPdf();
  const { htmlPages } = await buildRecipePdfPage(r, null, nutritionDetail);
  document.getElementById('printRoot').innerHTML = htmlPages.join('');
  cleanupPdfMeasureProbe();
  const blob = await renderSectionsToPdf();
  if (!blob) return null;
  return { blob, filename: `savora-${slugifyTitle(r.title)}.pdf` };
}

/* Baut das PDF fuer das komplette Kochbuch und gibt {blob, filename} zurueck. Das Inhaltsverzeichnis
   bekommt jetzt echte Seitenzahlen (Punkt 63-65): dafuer wird zuerst die komplette Pagination
   durchgerechnet (wie viele Seiten jedes Rezept tatsaechlich braucht), bevor die TOC-Seite gebaut
   wird — nicht geraten, sondern aus dem tatsaechlichen Ergebnis abgeleitet. */
async function buildCookbookPdf(nutritionDetail) {
  // Kochbuch-Designer: Auswahl, Reihenfolge, Kapitel, Titel und Cover kommen aus der
  // gespeicherten Konfiguration. Ohne Konfiguration: alle Rezepte wie bisher.
  const cfg = getCookbookConfig();
  const sections = cookbookOrderedSections(cfg);
  const recipes = sections.flatMap(s => s.recipes);
  if (!recipes.length) return null;
  await ensureFontsReadyForPdf();

  let previousLayout = null;
  const pagesByRecipeId = {};
  for (const r of recipes) {
    const { htmlPages, layout } = await buildRecipePdfPage(r, previousLayout, nutritionDetail);
    pagesByRecipeId[r.id] = htmlPages;
    previousLayout = layout;
  }

  // Seite 1 = Cover, Seite 2 = Inhaltsverzeichnis, danach je Kapitel eine Kapitelseite und die
  // Rezepte. Seitenzahlen werden aus der fertigen Pagination abgeleitet, nicht geschaetzt.
  const hasChapters = sections.some(s => s.chapter);
  // Das Inhaltsverzeichnis kann bei vielen Rezepten selbst mehrere Seiten brauchen. Deshalb wird
  // es zuerst mit Probe-Seitenzahlen gebaut und real gemessen, danach mit korrektem Versatz neu.
  const buildBody = (firstPage) => {
    let runningPage = firstPage;
    const tocBlocks = [];
    const bodyParts = [];
    sections.forEach((s) => {
      let chapterPage = null;
      if (hasChapters) {
        chapterPage = runningPage;
        const title = s.chapter ? s.chapter.name : 'Weitere Rezepte';
        bodyParts.push(`<section class="pdf-page-chapter"><div class="pdf-chapter-inner"><span class="pdf-chapter-eyebrow">Kapitel</span><h2>${escapeHtml(title)}</h2><hr class="pdf-cover-rule"></div></section>`);
        runningPage += 1;
      }
      const rows = s.recipes.map((r) => {
        const row = `<div class="print-toc-row"><span class="toc-title">${escapeHtml(r.title || 'Ohne Titel')}</span><span class="toc-leader"></span><span class="toc-page">${runningPage}</span></div>`;
        bodyParts.push(pagesByRecipeId[r.id].join(''));
        runningPage += pagesByRecipeId[r.id].length;
        return row;
      }).join('');
      tocBlocks.push(`<div class="pdf-toc-block">${hasChapters ? `<div class="print-toc-category">${escapeHtml(s.chapter ? s.chapter.name : 'Weitere Rezepte')}<span class="toc-page">${chapterPage}</span></div>` : ''}${rows}</div>`);
    });
    return { tocHtml: `<section class="pdf-page-toc"><h2>Inhalt</h2>${tocBlocks.join('')}</section>`, bodyParts };
  };
  let built = buildBody(3);
  let tocPages = 1;
  if (typeof measureSectionHeightMm === 'function') {
    tocPages = Math.max(1, Math.ceil((measureSectionHeightMm(built.tocHtml) - 2) / 297));
    if (tocPages > 1) built = buildBody(2 + tocPages);
  }
  const tocPage = built.tocHtml;
  const bodyParts = built.bodyParts;
  const title = (cfg.title || state.cookbookTitle || 'Mein persönliches Kochbuch');
  let coverImg = '';
  if (cfg.coverRecipeId) {
    const cr = state.recipes.find(x => x.id === cfg.coverRecipeId);
    if (cr) {
      const url = await resolveRecipeImageDataUrl(cr);
      if (url) coverImg = `<div class="pdf-cover-photo"><img src="${url}" alt=""></div>`;
    }
  }
  const cover = `<section class="pdf-page-cover ${coverImg ? 'pdf-page-cover--photo' : ''}">
    ${coverImg}
    <div class="pdf-cover-badge"><img src="icon-512.png" alt=""></div>
    <h1>${escapeHtml(title)}</h1>
    <hr class="pdf-cover-rule">
    ${cfg.subtitle ? `<p>${escapeHtml(cfg.subtitle)}</p>` : '<p>Savora</p>'}
  </section>`;

  document.getElementById('printRoot').innerHTML = cover + tocPage + bodyParts.join('');
  cleanupPdfMeasureProbe();
  const stamp = new Date().toISOString().slice(0, 10);
  const blob = await renderSectionsToPdf();
  if (!blob) return null;
  return { blob, filename: `savora-kochbuch-${stamp}.pdf` };
}
