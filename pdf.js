/* ---------- PDF-Export (Reparatur-Auftrag: semantische Pagination statt Canvas-Slicing) ----------
   Rendert weiterhin NICHT ueber window.print() (Safari-Randproblem, siehe Historie), sondern
   per html2canvas + jsPDF — aber die Seitenaufteilung passiert jetzt VOR dem Rendern, anhand
   echter DOM-Hoehenmessung (pdf-layout.js: measureSectionHeightMm/candidateFitsOnePage), nicht
   mehr danach per blindem Pixel-Schnitt alle 297mm. Jede <section> in #printRoot entspricht
   dadurch garantiert genau einer PDF-Seite; renderSectionsToPdf schneidet nur noch als
   Sicherheitsnetz (siehe dort), nicht mehr im Regelfall. */

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
      document.fonts.load('700 26pt "Baloo 2"'),
      document.fonts.load('400 10.5pt "Baloo 2"'),
    ]);
  } catch (e) { /* Font-API-Eigenheiten je Browser — document.fonts.ready ist die harte Garantie */ }
}

/* Rendert jedes direkte Kind von #printRoot als eigene PDF-Seite — randlos, echtes A4. Durch die
   Pagination VOR dem Rendern (buildRecipePdfPage/buildLongRecipePages) passt jede Section bereits
   auf eine Seite; die Slice-Schleife greift nur noch als Sicherheitsnetz, falls eine Section
   (z.B. ein sehr langes Inhaltsverzeichnis) dennoch zu hoch geraet — dann lieber ein sauberer,
   an sicheren Stellen gesetzter Schnitt als ein abgeschnittenes PDF. */
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

    const canvas = await html2canvas(section, { scale: 2, backgroundColor: null, useCORS: true });
    const scale = canvas.width / domWidth;
    const pxPerMm = canvas.width / pageWidthMm;
    const pageHeightPx = pageHeightMm * pxPerMm;

    // Regelfall (garantiert durch die Vor-Pagination): passt komplett auf eine Seite -> ein Bild,
    // keine Schnittlogik noetig. Das ist jetzt der Normalpfad, nicht mehr der Sonderfall.
    if (canvas.height <= pageHeightPx + 2 * pxPerMm) {
      if (!firstPage) pdf.addPage();
      firstPage = false;
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      pdf.addImage(imgData, 'JPEG', 0, 0, pageWidthMm, canvas.height / pxPerMm);
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
      const imgData = sliceCanvas.toDataURL('image/jpeg', 0.92);
      pdf.addImage(imgData, 'JPEG', 0, 0, pageWidthMm, sliceHeightPx / pxPerMm);
      cursor = sliceEnd;
    }
  }

  container.innerHTML = '';
  return pdf.output('blob');
}

/* Startet den eigentlichen Dateidownload — getrennt von renderSectionsToPdf(), damit dazwischen
   erst eine Vorschau gezeigt werden kann (Punkt 65/138-149). */
function triggerPdfDownload(blob, filename) {
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
  const ingItems = pdfIngredientItemsHtml(recipe, factor).map((html) => ({ type: 'ing', html }));
  const stepItems = pdfStepItemsHtml(recipe).map((html) => ({ type: 'step', html }));
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
  const recipes = state.recipes;
  if (!recipes.length) return null;
  await ensureFontsReadyForPdf();

  const byCat = {};
  recipes.forEach(r => { const cat = (r.tags && r.tags[0]) || 'Weitere Rezepte'; (byCat[cat] = byCat[cat] || []).push(r); });

  let previousLayout = null;
  const recipePages = []; // { recipe, htmlPages }
  for (const r of recipes) {
    const { htmlPages, layout } = await buildRecipePdfPage(r, previousLayout, nutritionDetail);
    recipePages.push({ recipe: r, htmlPages });
    previousLayout = layout;
  }
  const pageCountByRecipeId = {};
  recipePages.forEach(({ recipe, htmlPages }) => { pageCountByRecipeId[recipe.id] = htmlPages.length; });

  // Seite 1 = Cover, Seite 2 = Inhaltsverzeichnis, danach die Rezepte in derselben Reihenfolge.
  const COVER_PAGES = 1, TOC_PAGES = 1;
  let runningPage = COVER_PAGES + TOC_PAGES + 1;
  const startPageByRecipeId = {};
  recipes.forEach((r) => {
    startPageByRecipeId[r.id] = runningPage;
    runningPage += pageCountByRecipeId[r.id];
  });

  const toc = Object.entries(byCat).map(([cat, list]) =>
    `<div style="margin-bottom:4px;"><div class="print-toc-category">${escapeHtml(cat)}</div>
     ${list.map(r => `<div class="print-toc-row"><span class="toc-title">${escapeHtml(r.title)}</span><span class="toc-leader"></span><span class="toc-page">${startPageByRecipeId[r.id]}</span></div>`).join('')}</div>`
  ).join('');
  const cover = `<section class="pdf-page-cover">
    <div class="pdf-cover-badge"><img src="logo-mark.png" alt=""></div>
    <h1>Savora</h1>
    <hr class="pdf-cover-rule">
    <p>${escapeHtml(state.cookbookTitle || 'Mein persönliches Kochbuch')}</p>
  </section>`;
  const tocPage = `<section class="pdf-page-toc"><h2>Inhalt</h2>${toc}</section>`;

  const pages = recipePages.map(({ htmlPages }) => htmlPages.join('')).join('');
  document.getElementById('printRoot').innerHTML = cover + tocPage + pages;
  cleanupPdfMeasureProbe();
  const stamp = new Date().toISOString().slice(0, 10);
  const blob = await renderSectionsToPdf();
  if (!blob) return null;
  return { blob, filename: `savora-kochbuch-${stamp}.pdf` };
}
