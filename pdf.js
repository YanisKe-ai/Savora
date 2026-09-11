/* ---------- PDF export (print) ---------- */
function printRecipeHtml(r, resolvedImg) {
  const img = resolvedImg ? `<img class="print-image" src="${resolvedImg}">` : '';
  return `<section class="print-recipe-page">
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

async function exportSinglePdf(id) {
  const r = state.recipes.find(x => x.id === id);
  if (!r) return;
  const imgUrl = await resolveRecipeImageDataUrl(r);
  document.getElementById('printRoot').innerHTML = printRecipeHtml(r, imgUrl);
  window.print();
}

async function exportCookbookPdf() {
  const recipes = state.recipes;
  if (!recipes.length) { showToast('Noch keine Rezepte zum Exportieren.'); return; }
  const byCat = {};
  recipes.forEach(r => { const cat = (r.tags && r.tags[0]) || 'Weitere Rezepte'; (byCat[cat] = byCat[cat] || []).push(r); });
  const toc = Object.entries(byCat).map(([cat, list]) =>
    `<div style="margin-bottom:4px;"><div class="print-toc-category">${escapeHtml(cat)}</div>
     ${list.map(r => `<div class="print-toc-row"><span>${escapeHtml(r.title)}</span></div>`).join('')}</div>`
  ).join('');
  const cover = `<section class="print-cover">
    <h1>Savora</h1>
    <p>Mein persönliches Kochbuch</p>
  </section>`;
  const tocPage = `<section class="print-toc"><h2>Inhalt</h2>${toc}</section>`;
  const pages = (await Promise.all(recipes.map(async (r) => printRecipeHtml(r, await resolveRecipeImageDataUrl(r))))).join('');
  document.getElementById('printRoot').innerHTML = cover + tocPage + pages;
  window.print();
}
