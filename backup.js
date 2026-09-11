/* ---------- Backup: Export / Import als JSON-Datei ---------- */
async function downloadBackup() {
  const recipesForExport = await Promise.all(state.recipes.map(async (r) => {
    const clone = { ...r };
    if (!clone.image && clone.imageId) {
      clone.image = await resolveRecipeImageDataUrl(r);
    }
    delete clone.imageId; // geraetespezifische Referenz auf den lokalen Bilder-Store, im Export irrelevant
    return clone;
  }));
  const payload = {
    app: 'savora', version: 2, exportedAt: new Date().toISOString(),
    recipes: recipesForExport, shopping: state.shopping,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `savora-sicherung-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  showToast('Sicherung wird heruntergeladen');
}

async function restoreBackupFromFile(file) {
  const statusEl = document.getElementById('backupStatus');
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.recipes)) throw new Error('Diese Datei sieht nicht wie eine Savora-Sicherung aus');
    let added = 0;
    for (const r of data.recipes) {
      const clone = JSON.parse(JSON.stringify(r));
      clone.id = uid();
      clone.updatedAt = Date.now();
      await dbPut(clone);
      added++;
    }
    let addedItems = 0;
    for (const s of (data.shopping || [])) {
      const clone = JSON.parse(JSON.stringify(s));
      clone.id = uid();
      await dbPutShopping(clone);
      addedItems++;
    }
    await loadRecipes();
    await loadShopping();
    if (statusEl) statusEl.innerHTML = `<div class="import-status ok">${added} Rezept${added === 1 ? '' : 'e'}${addedItems ? ` und ${addedItems} Einkaufslisten-Eintrag(e)` : ''} wiederhergestellt.</div>`;
    render();
  } catch (e) {
    if (statusEl) statusEl.innerHTML = `<div class="import-status err">Wiederherstellung fehlgeschlagen: ${escapeHtml(e.message)}</div>`;
    else showToast('Wiederherstellung fehlgeschlagen', 'error');
  }
}
