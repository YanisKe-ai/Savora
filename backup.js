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

/* ---------- Ein einzelnes Rezept mit jemandem teilen ---------- */
function slugifyTitle(title) {
  return (title || 'rezept').toLowerCase()
    .replace(/[äöü]/g, (c) => ({ 'ä': 'ae', 'ö': 'oe', 'ü': 'ue' }[c]))
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'rezept';
}
async function shareRecipe(id) {
  const r = state.recipes.find(x => x.id === id);
  if (!r) return;
  const clone = { ...r };
  if (!clone.image && clone.imageId) {
    clone.image = await resolveRecipeImageDataUrl(r);
  }
  delete clone.imageId;
  delete clone.favorite;
  const payload = {
    app: 'savora', type: 'recipe-share', version: 1,
    sharedBy: state.senderName || null,
    sharedAt: new Date().toISOString(),
    recipe: clone,
  };
  const json = JSON.stringify(payload, null, 2);
  const fileName = `savora-rezept-${slugifyTitle(r.title)}.json`;

  if (navigator.share) {
    try {
      const file = new File([json], fileName, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: r.title, text: `Rezept „${r.title}" aus Savora` });
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return; // Nutzer hat den Teilen-Dialog abgebrochen
      // sonst: unten auf Datei-Download ausweichen
    }
  }
  // Fallback ohne Web-Share/Datei-Teilen (z.B. Desktop-Browser): Datei herunterladen,
  // der Nutzer verschickt sie dann selbst per Mail/AirDrop/Messenger.
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  showToast('Rezept-Datei heruntergeladen — jetzt selbst verschicken');
}

async function restoreBackupFromFile(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (data && data.type === 'recipe-share' && data.recipe) {
      const clone = JSON.parse(JSON.stringify(data.recipe));
      clone.id = uid();
      clone.createdAt = Date.now();
      clone.updatedAt = Date.now();
      clone.favorite = false;
      clone.sharedBy = data.sharedBy || null;
      await dbPut(clone);
      await loadRecipes();
      const msg = `„${clone.title}"${clone.sharedBy ? ` von ${clone.sharedBy}` : ''} wurde zu deinem Kochbuch hinzugefügt.`;
      render(); // Ansicht zuerst neu aufbauen, DANACH den Status-Text setzen —
                // sonst wuerde ein nachfolgender render() die gerade gesetzte Meldung sofort wieder loeschen.
      const freshStatusEl = document.getElementById('backupStatus');
      if (freshStatusEl) freshStatusEl.innerHTML = `<div class="import-status ok">${escapeHtml(msg)}</div>`;
      showToast(msg);
      return;
    }

    if (!data || !Array.isArray(data.recipes)) throw new Error('Diese Datei sieht nicht wie eine Savora-Sicherung oder ein geteiltes Rezept aus');
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
    const msg = `${added} Rezept${added === 1 ? '' : 'e'}${addedItems ? ` und ${addedItems} Einkaufslisten-Eintrag(e)` : ''} wiederhergestellt.`;
    render();
    const freshStatusEl = document.getElementById('backupStatus');
    if (freshStatusEl) freshStatusEl.innerHTML = `<div class="import-status ok">${escapeHtml(msg)}</div>`;
    showToast(msg);
  } catch (e) {
    const statusEl = document.getElementById('backupStatus');
    if (statusEl) statusEl.innerHTML = `<div class="import-status err">Wiederherstellung fehlgeschlagen: ${escapeHtml(e.message)}</div>`;
    else showToast('Wiederherstellung fehlgeschlagen', 'error');
  }
}
