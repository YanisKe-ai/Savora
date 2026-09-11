/* ---------- Web import (JSON-LD schema.org/Recipe) ---------- */
async function importFromUrl(url) {
  const statusEl = document.getElementById('importStatus');
  statusEl.innerHTML = `<div class="import-status pending">Rezept wird geladen …</div>`;
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error('Seite konnte nicht geladen werden');
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
    let recipeData = null;
    for (const s of scripts) {
      try {
        let json = JSON.parse(s.textContent);
        const candidates = Array.isArray(json) ? json : (json['@graph'] || [json]);
        recipeData = candidates.find(c => {
          const t = c['@type'];
          return t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'));
        });
        if (recipeData) break;
      } catch (e) { /* skip malformed block */ }
    }
    if (!recipeData) throw new Error('Auf dieser Seite wurden keine strukturierten Rezeptdaten gefunden');
    const r = emptyRecipe();
    r.title = recipeData.name || 'Importiertes Rezept';
    r.source = url;
    r.servings = parseInt(recipeData.recipeYield) || 4;
    r.timeMinutes = parseISODuration(recipeData.totalTime || recipeData.cookTime) || 30;
    r.ingredients = (recipeData.recipeIngredient || []).map(parseIngredientLine).map(i => autoConvertIngredient(i));
    const instr = recipeData.recipeInstructions;
    r.steps = Array.isArray(instr)
      ? instr.map(s => ({ text: typeof s === 'string' ? s : (s.text || s.name || '') }))
      : (typeof instr === 'string' ? instr.split(/\n+/).filter(Boolean).map(t => ({ text: t })) : [{ text: '' }]);
    if (recipeData.image) {
      r.image = Array.isArray(recipeData.image) ? recipeData.image[0] : (recipeData.image.url || recipeData.image);
    }
    await dbPut(r);
    await loadRecipes();
    statusEl.innerHTML = `<div class="import-status ok">„${escapeHtml(r.title)}" importiert.</div>`;
    setTimeout(() => { state.activeRecipeId = r.id; state.view = 'detail'; render(); }, 700);
  } catch (e) {
    statusEl.innerHTML = `<div class="import-status err">Import fehlgeschlagen: ${escapeHtml(e.message)}. Manche Seiten blockieren externe Anfragen (CORS) — trag das Rezept in diesem Fall manuell ein.</div>`;
  }
}
