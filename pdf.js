/* ---------- PDF-Export ----------
   Wird NICHT mehr ueber window.print() erzeugt: Safari erzwingt dabei einen eigenen,
   nicht per CSS entfernbaren Seitenrand (@page-Margins werden von WebKit ignoriert).
   Stattdessen wird jede "Seite" mit html2canvas als Bild gerendert und per jsPDF direkt
   zu einer PDF-Datei zusammengebaut — damit bestimmt Savora selbst die Seitenmasse,
   randlos bis zur letzten Pixelreihe, unabhaengig vom Drucksystem des Geraets.
*/
function printRecipeHtml(r, resolvedImg) {
  const img = resolvedImg ? `<img class="print-image" src="${resolvedImg}">` : '';
  return `<section class="pdf-page-recipe">
    <div class="print-header">${(r.tags || [])[0] || 'Savora'}</div>
    <h1 class="print-title">${escapeHtml(r.title)}</h1>
    <div class="print-meta">
      ${r.timeMinutes ? `<span>${r.timeMinutes} Min.</span>` : ''}
      <span>${r.servings || 1} Portionen</span>
      ${r.difficulty ? `<span>${escapeHtml(r.difficulty)}</span>` : ''}
    </div>
    ${r.source ? `<div class="print-source">Importiert von ${escapeHtml(domainFromUrl(r.source))}</div>` : ''}
    ${(r.diet || []).length ? `<div class="print-meta">${r.diet.map(dk => { const d = DIET_OPTIONS.find(o => o.key === dk); return d ? escapeHtml(d.label) : ''; }).filter(Boolean).join(' · ')}</div>` : ''}
    ${img}
    <hr class="print-divider">
    <div class="print-cols">
      <div class="print-ing-block">
        <div class="print-ing-title">Zutaten</div>
        <ul class="print-ing-list">
          ${(r.ingredients || []).map(i => `<li><strong>${(() => { const pa = parseAmount(i.amount); return pa !== null ? fmtAmount(pa) + (i.unit ? ' ' + escapeHtml(i.unit) : '') : ''; })()}</strong> ${escapeHtml(i.name)}</li>`).join('')}
        </ul>
      </div>
      <div class="print-steps-block">
        <div class="print-steps-title">Zubereitung</div>
        <ol class="print-step-list">
          ${(r.steps || []).map(s => `<li>${escapeHtml(s.text)}</li>`).join('')}
        </ol>
        ${r.notes ? `<div class="print-steps-title" style="margin-top:14px;">Notizen</div><p style="font-family:var(--font-sans);font-size:9.5pt;color:#555;">${escapeHtml(r.notes)}</p>` : ''}
      </div>
    </div>
    <div class="print-footer">Savora · Dein Kochbuch</div>
  </section>`;
}

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

/* Rendert jedes direkte Kind von #printRoot als eigene(s) PDF-Seite(n) — randlos, echtes A4.
   Ist der Inhalt eines Abschnitts hoeher als eine A4-Seite (z.B. ein langes Rezept mit Foto),
   wird die Bildschnappschuss-Leinwand in mehrere volle Seiten zerschnitten statt abgeschnitten. */
async function renderSectionsToPdf(filename) {
  const container = document.getElementById('printRoot');
  const sections = Array.from(container.children);
  if (!sections.length) return;
  if (document.fonts && document.fonts.ready) await document.fonts.ready;

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const pageWidthMm = 210, pageHeightMm = 297;
  let firstPage = true;

  for (const section of sections) {
    const canvas = await html2canvas(section, { scale: 2, backgroundColor: null, useCORS: true });
    const pxPerMm = canvas.width / pageWidthMm;
    const pageHeightPx = pageHeightMm * pxPerMm;
    let totalSlices = Math.max(1, Math.ceil(canvas.height / pageHeightPx));
    // Wenn die rechnerisch letzte "Seite" nur ein paar Rausch-Pixel enthaelt (Rundungsfehler
    // beim Rendern), diese komplett leere Extra-Seite weglassen statt sie mit auszugeben.
    const lastSliceHeightPx = canvas.height - (totalSlices - 1) * pageHeightPx;
    if (totalSlices > 1 && lastSliceHeightPx < 15) totalSlices -= 1;
    for (let i = 0; i < totalSlices; i++) {
      if (!firstPage) pdf.addPage();
      firstPage = false;
      const sliceHeightPx = Math.min(pageHeightPx, canvas.height - i * pageHeightPx);
      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = sliceHeightPx;
      sliceCanvas.getContext('2d').drawImage(
        canvas, 0, i * pageHeightPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx
      );
      const imgData = sliceCanvas.toDataURL('image/jpeg', 0.92);
      pdf.addImage(imgData, 'JPEG', 0, 0, pageWidthMm, sliceHeightPx / pxPerMm);
    }
  }

  container.innerHTML = '';
  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

async function exportSinglePdf(id) {
  const r = state.recipes.find(x => x.id === id);
  if (!r) return;
  showToast('PDF wird erstellt …', 'info');
  const imgUrl = await resolveRecipeImageDataUrl(r);
  document.getElementById('printRoot').innerHTML = printRecipeHtml(r, imgUrl);
  try {
    await renderSectionsToPdf(`savora-${slugifyTitle(r.title)}.pdf`);
  } catch (e) {
    showToast('PDF konnte nicht erstellt werden', 'error');
  }
}

async function exportCookbookPdf() {
  const recipes = state.recipes;
  if (!recipes.length) { showToast('Noch keine Rezepte zum Exportieren.'); return; }
  showToast('PDF wird erstellt …', 'info');
  const byCat = {};
  recipes.forEach(r => { const cat = (r.tags && r.tags[0]) || 'Weitere Rezepte'; (byCat[cat] = byCat[cat] || []).push(r); });
  const toc = Object.entries(byCat).map(([cat, list]) =>
    `<div style="margin-bottom:4px;"><div class="print-toc-category">${escapeHtml(cat)}</div>
     ${list.map(r => `<div class="print-toc-row"><span>${escapeHtml(r.title)}</span></div>`).join('')}</div>`
  ).join('');
  const cover = `<section class="pdf-page-cover">
    <div class="pdf-cover-badge">${ICONS.chef}</div>
    <h1>Savora</h1>
    <hr class="pdf-cover-rule">
    <p>${escapeHtml(state.cookbookTitle || 'Mein persönliches Kochbuch')}</p>
  </section>`;
  const tocPage = `<section class="pdf-page-toc"><h2>Inhalt</h2>${toc}</section>`;
  const pages = (await Promise.all(recipes.map(async (r) => printRecipeHtml(r, await resolveRecipeImageDataUrl(r))))).join('');
  document.getElementById('printRoot').innerHTML = cover + tocPage + pages;
  const stamp = new Date().toISOString().slice(0, 10);
  try {
    await renderSectionsToPdf(`savora-kochbuch-${stamp}.pdf`);
  } catch (e) {
    showToast('PDF konnte nicht erstellt werden', 'error');
  }
}
