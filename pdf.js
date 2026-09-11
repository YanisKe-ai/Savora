/* ---------- PDF-Export (Editorial Engine, Punkt 33-69) ----------
   Rendert weiterhin NICHT ueber window.print() (Safari-Randproblem, siehe Historie), sondern
   per html2canvas + jsPDF. Neu in dieser Version: das Layout jeder Rezeptseite wird anhand des
   tatsaechlichen Bild-Seitenverhaeltnisses und der Textmenge gewaehlt (pdf-layout.js/
   pdf-templates.js), Nutrition wird eingebettet, und Seitenumbrueche versuchen, sichere Stellen
   zu treffen statt mitten in eine Zutat/einen Schritt zu schneiden. */

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

/* Zeichnet dezent "Fortsetzung · <Titel>" oben auf eine Folgeseite (Punkt 61) — direkt auf die
   bereits gerenderte Canvas-Slice, da zu diesem Zeitpunkt kein DOM-Rendering mehr stattfindet.
   pxPerMm ist bereits die volle Canvas-Pixel-pro-mm-Skala (inkl. html2canvas-scale:2). */
function drawContinuationLabel(sliceCanvas, title, pxPerMm) {
  const ctx = sliceCanvas.getContext('2d');
  const padX = 16 * pxPerMm, padY = 8 * pxPerMm;
  const fontSizePx = 9 * 0.352778 * pxPerMm; // 9pt -> mm -> Canvas-Pixel
  ctx.font = `italic ${fontSizePx}px Georgia, 'Iowan Old Style', serif`;
  ctx.fillStyle = 'rgba(122,138,124,0.95)';
  ctx.textBaseline = 'top';
  ctx.fillText(`Fortsetzung · ${title}`, padX, padY);
}

/* Rendert jedes direkte Kind von #printRoot als eigene PDF-Seite(n) — randlos, echtes A4.
   Ist ein Abschnitt hoeher als eine Seite, wird er an einem sicheren Umbruchpunkt geteilt
   (Punkt 62), statt starr nach exakt einer Seitenhoehe zu schneiden. Loest NICHT mehr selbst
   den Download aus (Punkt 65: PDF erstellen -> Vorschau -> Download) — gibt stattdessen den
   fertigen Blob zurueck, den der Aufrufer entweder direkt speichert oder erst in einer Vorschau
   zeigt (siehe pdf-ui.js). */
async function renderSectionsToPdf() {
  const container = document.getElementById('printRoot');
  const sections = Array.from(container.children);
  if (!sections.length) return null;
  if (document.fonts && document.fonts.ready) await document.fonts.ready;

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const pageWidthMm = 210, pageHeightMm = 297;
  let firstPage = true;

  for (const section of sections) {
    const domWidth = section.offsetWidth || 1;
    const sectionTop = section.getBoundingClientRect().top;
    const breakEls = Array.from(section.querySelectorAll('.pdf-safe-break'));
    // Ein Umbruchpunkt ist nur dann wirklich sicher, wenn er NICHT innerhalb der Hoehe
    // irgendeines markierten Elements liegt — bei zwei nebeneinanderliegenden Spalten
    // unterschiedlicher Laenge (kurze Zutatenliste neben langer Zubereitung) reicht es NICHT,
    // nur die eigene Spalte zu pruefen: der Kandidat aus der kurzen Spalte kann trotzdem mitten
    // in einem Element der langen Spalte liegen. Deshalb werden alle Intervalle (Top/Bottom)
    // gesammelt und ein Kandidat verworfen, sobald er in irgendeinem Intervall liegt.
    const intervals = breakEls.map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top - sectionTop, bottom: r.bottom - sectionTop };
    });
    const domBreakTops = intervals
      .map((iv) => iv.top)
      .filter((y) => !intervals.some((iv) => y > iv.top + 0.5 && y < iv.bottom - 0.5));
    const title = section.dataset.pdfTitle || '';

    const canvas = await html2canvas(section, { scale: 2, backgroundColor: null, useCORS: true });
    const scale = canvas.width / domWidth;
    const pxPerMm = canvas.width / pageWidthMm;
    const pageHeightPx = pageHeightMm * pxPerMm;
    const breakPointsPx = domBreakTops.map((t) => t * scale).sort((a, b) => a - b);
    const minSlicePx = 10 * pxPerMm;

    let cursor = 0;
    let sliceIndex = 0;
    while (cursor < canvas.height - 1) {
      const naiveEnd = Math.min(canvas.height, cursor + pageHeightPx);
      let sliceEnd = naiveEnd;
      if (naiveEnd < canvas.height - 1) {
        // Bewusst OHNE Toleranz-Obergrenze: ein Schnitt mitten in einer Zutat/einem Schritt
        // (z.B. weil zwei nebeneinanderliegende Spalten unterschiedlich hoch sind) ist ein
        // sichtbarer Fehler — zusaetzlicher Weissraum am Seitenende ist das laut Punkt 53
        // ausdruecklich gewuenschte, kleinere Uebel ("keine Angst vor freien Flaechen").
        const candidate = breakPointsPx.filter((p) => p > cursor + minSlicePx && p <= naiveEnd).pop();
        if (candidate !== undefined) sliceEnd = candidate;
      }
      // Rest-Slice zu winzig (Rundungsrauschen) -> mit der vorherigen Seite zusammenlegen statt
      // eine fast leere Extra-Seite auszugeben.
      if (canvas.height - sliceEnd < 15 * pxPerMm) sliceEnd = canvas.height;

      if (!firstPage) pdf.addPage();
      firstPage = false;
      const sliceHeightPx = sliceEnd - cursor;
      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = sliceHeightPx;
      sliceCanvas.getContext('2d').drawImage(canvas, 0, cursor, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);
      if (sliceIndex > 0 && title) drawContinuationLabel(sliceCanvas, title, pxPerMm);
      const imgData = sliceCanvas.toDataURL('image/jpeg', 0.92);
      pdf.addImage(imgData, 'JPEG', 0, 0, pageWidthMm, sliceHeightPx / pxPerMm);
      cursor = sliceEnd;
      sliceIndex++;
    }
  }

  container.innerHTML = '';
  return pdf.output('blob');
}

/* Startet den eigentlichen Dateidownload — getrennt von renderSectionsToPdf(), damit dazwischen
   erst eine Vorschau gezeigt werden kann (Punkt 65). */
function triggerPdfDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/* Baut eine einzelne Rezeptseite komplett auf: Bildmasse ermitteln, Layout waehlen, Nutrition
   laden, HTML erzeugen. Gibt zusaetzlich das gewaehlte Layout zurueck (fuer die Rhythmus-Regel
   im Kochbuch-Export, Punkt 52). `nutritionDetail`: 'off' | 'compact' | 'full' (Punkt 59) —
   bei 'off' wird das Nutrition-Ergebnis gar nicht erst geladen (schneller, keine unnoetige
   DB-Abfrage). */
async function buildRecipePdfPage(r, previousLayout, nutritionDetail) {
  const imgUrl = await resolveRecipeImageDataUrl(r);
  const imgDims = imgUrl ? await getImageDimensions(imgUrl) : null;
  let result = null;
  if (nutritionDetail !== 'off') {
    try { result = await getFreshNutritionResult(r); } catch (e) { /* Nutrition optional — PDF funktioniert auch ohne */ }
  }
  const { html, layout } = buildRecipePdfSection(r, imgUrl, imgDims, result, previousLayout, nutritionDetail || 'compact');
  // data-pdf-title fuer die Fortsetzungs-Kennzeichnung (Punkt 61) auf dem <section>-Root einfuegen.
  const withTitle = html.replace('<section class="pdf-page-recipe', `<section data-pdf-title="${escapeHtml(r.title || '')}" class="pdf-page-recipe`);
  return { html: withTitle, layout };
}

/* Baut das PDF fuer ein einzelnes Rezept und gibt {blob, filename} zurueck (kein Auto-Download —
   siehe pdf-ui.js fuer Vorschau/Download-Flow, Punkt 65). null bei Fehler. */
async function buildSinglePdf(id, nutritionDetail) {
  const r = state.recipes.find(x => x.id === id);
  if (!r) return null;
  const { html } = await buildRecipePdfPage(r, null, nutritionDetail);
  document.getElementById('printRoot').innerHTML = html;
  const blob = await renderSectionsToPdf();
  if (!blob) return null;
  return { blob, filename: `savora-${slugifyTitle(r.title)}.pdf` };
}

/* Baut das PDF fuer das komplette Kochbuch und gibt {blob, filename} zurueck. */
async function buildCookbookPdf(nutritionDetail) {
  const recipes = state.recipes;
  if (!recipes.length) return null;
  const byCat = {};
  recipes.forEach(r => { const cat = (r.tags && r.tags[0]) || 'Weitere Rezepte'; (byCat[cat] = byCat[cat] || []).push(r); });
  const toc = Object.entries(byCat).map(([cat, list]) =>
    `<div style="margin-bottom:4px;"><div class="print-toc-category">${escapeHtml(cat)}</div>
     ${list.map(r => `<div class="print-toc-row"><span>${escapeHtml(r.title)}</span></div>`).join('')}</div>`
  ).join('');
  const cover = `<section class="pdf-page-cover">
    <div class="pdf-cover-badge"><img src="logo-mark.png" alt=""></div>
    <h1>Savora</h1>
    <hr class="pdf-cover-rule">
    <p>${escapeHtml(state.cookbookTitle || 'Mein persönliches Kochbuch')}</p>
  </section>`;
  const tocPage = `<section class="pdf-page-toc"><h2>Inhalt</h2>${toc}</section>`;

  let previousLayout = null;
  const pages = [];
  for (const r of recipes) {
    const { html, layout } = await buildRecipePdfPage(r, previousLayout, nutritionDetail);
    pages.push(html);
    previousLayout = layout;
  }

  document.getElementById('printRoot').innerHTML = cover + tocPage + pages.join('');
  const stamp = new Date().toISOString().slice(0, 10);
  const blob = await renderSectionsToPdf();
  if (!blob) return null;
  return { blob, filename: `savora-kochbuch-${stamp}.pdf` };
}
