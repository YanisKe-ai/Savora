/* ---------- Backup: Export / Import als JSON-Datei ----------
   Ab Version 3 zusaetzlich mit Nutrition-Daten (Punkt 32): eigene Lebensmittel und gelernte
   Zuordnungen sind Nutzer-Eingaben und muessen genauso gesichert werden wie Rezepte. Bereits
   berechnete Nährwert-Ergebnisse (nutritionResults) werden ebenfalls gesichert, aber beim
   Restore auf die NEUEN Rezept-IDs umgemappt (Rezepte bekommen beim Wiederherstellen bewusst
   neue IDs, damit sich zwei Bibliotheken zusammenfuehren lassen, ohne sich zu ueberschreiben —
   siehe restoreBackupFromFile). Die Schweizer Rohdaten selbst (nutritionFoods mit source
   "swiss-fcd") werden NICHT gesichert — die werden beim naechsten Start ohnehin automatisch aus
   swiss-fcd-data.json neu eingespielt (siehe nutrition-swiss.js), das waere nur totes Gewicht
   in der Sicherungsdatei. Von Open-Food-Facts gecachte Produkte (source "open-food-facts")
   werden ebenfalls nicht gesichert — sie werden bei Bedarf einfach erneut abgerufen. */
async function downloadBackup() {
  const recipesForExport = await Promise.all(state.recipes.map(async (r) => {
    const clone = { ...r };
    if (!clone.image && clone.imageId) {
      clone.image = await resolveRecipeImageDataUrl(r);
    }
    delete clone.imageId; // geraetespezifische Referenz auf den lokalen Bilder-Store, im Export irrelevant
    return clone;
  }));
  const [customFoods, nutritionMatches, nutritionResults] = await Promise.all([
    dbGetAllCustomFoods(), dbGetAllNutritionMatches(), dbGetAllNutritionResults(),
  ]);
  const payload = {
    app: 'savora', version: 3, exportedAt: new Date().toISOString(),
    recipes: recipesForExport, shopping: state.shopping,
    customFoods, nutritionMatches, nutritionResults,
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
/* ---------- Einzelnes Rezept teilen — als PDF, nicht als JSON (Master-Prompt Teil E) ----------
   JSON ist ein technisches Datenformat und bleibt ausschliesslich fuer Backup/Restore reserviert
   (Punkt 59, 66-67). Beim normalen "Teilen" bekommt die andere Person eine fertig gestaltete
   PDF-Datei — dieselbe Editorial-PDF-Engine wie beim regulaeren Export (Punkt 69), inklusive
   korrektem Bildseitenverhaeltnis, Nutrition, Notizen nur wenn vorhanden. */
async function shareRecipe(id) {
  const r = state.recipes.find(x => x.id === id);
  if (!r) return;
  showToast('PDF wird erstellt …', 'info');

  let result;
  try {
    result = await buildSinglePdf(id, await defaultPdfNutritionDetail('single', id));
  } catch (e) {
    showToast('PDF konnte nicht erstellt werden', 'error');
    return;
  }
  if (!result) {
    showToast('PDF konnte nicht erstellt werden', 'error');
    return;
  }
  const { blob, filename } = result;

  if (navigator.share) {
    try {
      const file = new File([blob], filename, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: r.title, text: `Rezept „${r.title}“ aus Savora` });
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return; // Nutzer hat das Teilen-Sheet selbst abgebrochen — kein Fehler
      // sonst: unten auf Datei-Download ausweichen (Punkt 65 Fallback)
    }
  }
  // Fallback ohne Web-Share/Datei-Teilen (z.B. Desktop-Browser ohne Share-API): PDF direkt
  // herunterladen, der Nutzer verschickt sie dann selbst per Mail/AirDrop/Messenger.
  triggerPdfDownload(blob, filename);
  showToast('PDF heruntergeladen — jetzt selbst verschicken');
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
    const recipeIdMap = {}; // alte Rezept-ID (aus der Sicherung) -> neue ID (siehe unten, wichtig fuer nutritionResults)
    for (const r of data.recipes) {
      const clone = JSON.parse(JSON.stringify(r));
      const oldId = clone.id;
      clone.id = uid();
      clone.updatedAt = Date.now();
      await dbPut(clone);
      if (oldId) recipeIdMap[oldId] = clone.id;
      added++;
    }
    let addedItems = 0;
    for (const s of (data.shopping || [])) {
      const clone = JSON.parse(JSON.stringify(s));
      clone.id = uid();
      await dbPutShopping(clone);
      addedItems++;
    }

    // Nutrition-Daten (Punkt 32, ab Sicherungsversion 3 vorhanden — bei aelteren Sicherungen
    // sind diese Felder einfach nicht da, dann passiert hier nichts, alte Backups bleiben
    // importierbar). Eigene Lebensmittel und gelernte Zuordnungen behalten ihre ID/ihren Key
    // (put = upsert) — anders als bei Rezepten wuerde ein Neuvergeben der ID die Verbindung
    // zwischen einer gelernten Zuordnung und dem Custom Food, auf das sie zeigt, zerstoeren.
    let addedFoods = 0, addedMatches = 0, addedResults = 0;
    for (const f of (data.customFoods || [])) {
      await dbPutCustomFood(JSON.parse(JSON.stringify(f)));
      addedFoods++;
    }
    for (const m of (data.nutritionMatches || [])) {
      await dbPutNutritionMatch(JSON.parse(JSON.stringify(m)));
      addedMatches++;
    }
    for (const res of (data.nutritionResults || [])) {
      const clone = JSON.parse(JSON.stringify(res));
      const newRecipeId = recipeIdMap[clone.recipeId];
      if (!newRecipeId) continue; // Rezept aus der Sicherung ist nicht (mehr) dabei -> Ergebnis waere verwaist
      clone.recipeId = newRecipeId;
      await dbPutNutritionResult(clone);
      addedResults++;
    }

    await loadRecipes();
    await loadShopping();
    const extras = [];
    if (addedFoods) extras.push(`${addedFoods} eigene${addedFoods === 1 ? 's' : ''} Lebensmittel`);
    if (addedMatches) extras.push(`${addedMatches} gelernte Zuordnung${addedMatches === 1 ? '' : 'en'}`);
    const msg = `${added} Rezept${added === 1 ? '' : 'e'}${addedItems ? `, ${addedItems} Einkaufslisten-Eintrag(e)` : ''}${extras.length ? ' und ' + extras.join(', ') : ''} wiederhergestellt.`;
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
