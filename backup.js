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
  const mealplan = await dbGetAllMealplan();
  const payload = {
    // version bleibt fuer aeltere App-Staende lesbar; schemaVersion beschreibt den Inhalt.
    app: 'savora', version: 3, schemaVersion: 5, exportedAt: new Date().toISOString(),
    recipes: recipesForExport, shopping: state.shopping,
    customFoods, nutritionMatches, nutritionResults,
    mealplan,
    // cookbooks: alle Kochbuch-Projekte (ab schemaVersion 5); cookbookConfig: alte Einzelkonfiguration, damit aeltere App-Staende die Sicherung weiter lesen
    settings: { collections: getCollections(), cookbooks: cookbookStoreRead(), cookbookConfig: readJsonKey(COOKBOOK_CONFIG_KEY, null) },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const stamp = new Date().toISOString().slice(0, 10);
  if (SavoraNative.isNative) {   // iOS-App: Sicherung ueber das Teilen-Fenster ("In Dateien sichern")
    try {
      await SavoraNative.shareFile(blob, `savora-sicherung-${stamp}.json`, 'Savora Sicherung');
      state.lastBackupAt = payload.exportedAt;
      localStorage.setItem(LAST_BACKUP_KEY, payload.exportedAt);
    } catch (err) { if (!SavoraNative.isCancel(err)) showToast('Sicherung konnte nicht gespeichert werden', 'error'); }
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `savora-sicherung-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  state.lastBackupAt = payload.exportedAt;
  localStorage.setItem(LAST_BACKUP_KEY, payload.exportedAt);
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
/* Punkt 2 (Direkter Update-Prompt): "Teilen" ging vorher direkt an navigator.share vorbei an
   jeder Vorschau — Einzelrezept und Kochbuch nutzten dadurch zwei verschiedene Wege. Die frühere
   shareRecipe()-Funktion ist deshalb entfernt; "Teilen" oeffnet jetzt denselben
   Optionen->Erstellen->Vorschau-Ablauf wie "Als PDF exportieren" (siehe ui.js 'share-recipe'),
   Teilen passiert von dort aus ueber denselben bereits erzeugten Blob (pdf-export-share). */

/* Inhaltlicher Fingerabdruck eines Rezepts: zwei Rezepte mit gleichem Fingerabdruck sind fuer die
   Wiederherstellung dasselbe Rezept (Zeitstempel, Fotos und Zaehler zaehlen nicht). */
function backupRecipeFingerprint(r) {
  return JSON.stringify([r.title || '', r.servings, r.servingMode || '', r.timeMinutes || 0, r.ingredients || [], r.steps || [], r.notes || '', r.tags || [], r.diet || [], r.categoryTags || []]);
}

/* Rezept-IDs einer gesicherten Kochbuch-Konfiguration auf die neuen IDs abbilden (nicht aufloesbare Rezepte entfallen) */
function backupMapCookbookConfig(config, recipeIdMap) {
  const cfg = JSON.parse(JSON.stringify(config || {}));
  if (Array.isArray(cfg.items)) cfg.items = cfg.items.map(it => ({ ...it, recipeId: recipeIdMap[it.recipeId] })).filter(it => it.recipeId);
  if (cfg.coverRecipeId) cfg.coverRecipeId = recipeIdMap[cfg.coverRecipeId] || '';
  return cfg;
}
function backupCookbookIsPristine(book) {
  const c = book && book.config;
  return !!c && !Array.isArray(c.items) && !c.title && !c.subtitle && !c.author;   // nie bearbeitet: nur die leere Startkonfiguration
}
/* Gibt die Zahl der hinzugefuegten Kochbuecher zurueck. Aeltere Sicherungen ohne Projekte: die alte Einzelkonfiguration
   wird wie bei der Migration zu einem Projekt (ein noch unberuehrtes Startkochbuch uebernimmt sie). */
function restoreCookbooksFromBackup(settings, recipeIdMap) {
  if (!settings) return 0;
  const store = cookbookStoreRead();   // loest bei Bedarf die Migration aus
  let added = 0;
  const sameConfig = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const incoming = [];
  const src = settings.cookbooks && cookbookSanitizeStore(settings.cookbooks);
  if (src) src.books.forEach(b => incoming.push({ id: b.id, name: b.name, createdAt: b.createdAt, updatedAt: b.updatedAt, config: backupMapCookbookConfig(b.config, recipeIdMap) }));
  else if (settings.cookbookConfig && typeof settings.cookbookConfig === 'object') {
    const cfg = backupMapCookbookConfig(settings.cookbookConfig, recipeIdMap);
    if (Array.isArray(cfg.items) && cfg.items.length) incoming.push({ id: null, name: '', createdAt: Date.now(), updatedAt: Date.now(), config: cfg });
  }
  incoming.forEach((b) => {
    if (store.books.some(x => (b.id && x.id === b.id) || sameConfig(x.config, b.config))) return;
    // Ein noch unberuehrtes Startkochbuch (und nur dieses) nimmt den ersten gesicherten Stand auf, statt neben ihm zu stehen
    const only = store.books.length === 1 ? store.books[0] : null;
    if (only && backupCookbookIsPristine(only) && !incoming.some(i => i.id && i.id === only.id)) {
      only.config = b.config; only.updatedAt = Date.now();
      if (src) { if (b.name) only.name = b.name; if (b.id) only.id = b.id; store.activeId = only.id; }
      added++; return;
    }
    store.books.push({ id: b.id && !store.books.some(x => x.id === b.id) ? b.id : cookbookNewId(), name: b.name || 'Wiederhergestelltes Kochbuch', createdAt: b.createdAt || Date.now(), updatedAt: b.updatedAt || Date.now(), config: b.config });
    added++;
  });
  if (added) cookbookWrite(store);
  return added;
}

async function restoreBackupFromFile(file) {
  try {
    const text = await file.text();
    let data;
    try { data = JSON.parse(text); } catch (parseErr) { throw new Error('Die Datei ist beschädigt oder keine Sicherung (kein gültiges JSON). Es wurde nichts verändert. Wähle die Datei „savora-sicherung-….json“ erneut oder eine andere Sicherung'); }

    if (data && data.type === 'recipe-share' && data.recipe) {
      const clone = JSON.parse(JSON.stringify(data.recipe));
      clone.id = uid();
      clone.createdAt = Date.now();
      clone.updatedAt = Date.now();
      clone.favorite = false;
      clone.sharedBy = data.sharedBy || null;
      await dbPut(clone);
      await loadRecipes();
      const msg = `„${clone.title}“${clone.sharedBy ? ` von ${clone.sharedBy}` : ''} wurde zu deinem Kochbuch hinzugefügt.`;
      render(); // Ansicht zuerst neu aufbauen, DANACH den Status-Text setzen —
                // sonst wuerde ein nachfolgender render() die gerade gesetzte Meldung sofort wieder loeschen.
      const freshStatusEl = document.getElementById('backupStatus');
      if (freshStatusEl) freshStatusEl.innerHTML = `<div class="import-status ok">${escapeHtml(msg)}</div>`;
      showToast(msg);
      return;
    }

    if (!data || !Array.isArray(data.recipes)) throw new Error('Diese Datei sieht nicht wie eine Savora-Sicherung oder ein geteiltes Rezept aus');
    // Vorab prüfen: Einträge ohne Rezeptform (null, Zahl, Text) würden die Wiederherstellung mittendrin abbrechen. Sie werden übersprungen und gemeldet.
    const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
    const badRecipes = data.recipes.filter(r => !isObj(r)).length;
    data.recipes = data.recipes.filter(isObj);
    if (Array.isArray(data.shopping)) data.shopping = data.shopping.filter(isObj);
    let added = 0, skipped = 0;
    const skippedIds = new Set();   // schon vorhandene, identische Rezepte: ihre lokalen Nährwert-Ergebnisse bleiben
    const recipeIdMap = {}; // alte Rezept-ID (aus der Sicherung) -> neue ID (siehe unten, wichtig fuer nutritionResults)
    for (const r of data.recipes) {
      const clone = JSON.parse(JSON.stringify(r));
      const oldId = clone.id;
      // Original-ID behalten, wenn sie auf diesem Geraet frei ist (z.B. Wiederherstellung auf
      // neuem Geraet). Nur bei Kollision entsteht eine neue ID, damit nichts ueberschrieben wird.
      // Ist dasselbe Rezept (gleiche ID, gleicher Inhalt) schon da, wird es uebersprungen statt verdoppelt.
      // Ist es inhaltlich anders, bleibt es als zusaetzliche Kopie erhalten: es wird nie etwas ueberschrieben.
      const fp = backupRecipeFingerprint(clone);
      const existingSame = state.recipes.find(x => x.id === oldId && backupRecipeFingerprint(x) === fp)
        || state.recipes.find(x => backupRecipeFingerprint(x) === fp);   // auch eine frueher angelegte Kopie zaehlt: mehrfaches Einspielen verdoppelt nichts
      if (existingSame) { if (oldId) { recipeIdMap[oldId] = existingSame.id; skippedIds.add(oldId); } skipped++; continue; }
      const idTaken = !oldId || state.recipes.some(x => x.id === oldId) || Object.values(recipeIdMap).includes(oldId);
      if (idTaken) clone.id = uid();
      clone.updatedAt = Date.now();
      await dbPut(clone);
      if (oldId) recipeIdMap[oldId] = clone.id;
      added++;
    }
    let addedItems = 0;
    for (const s of (data.shopping || [])) {
      if (state.shopping.some(x => x.name === s.name && x.amount === s.amount && (x.unit || '') === (s.unit || ''))) continue;   // schon in der Einkaufsliste
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
      if (!newRecipeId || skippedIds.has(clone.recipeId)) continue; // Rezept aus der Sicherung ist nicht (mehr) dabei -> Ergebnis waere verwaist
      clone.recipeId = newRecipeId;
      await dbPutNutritionResult(clone);
      addedResults++;
    }

    // Ab schemaVersion 4: Wochenplan, Sammlungen und Kochbuch-Auswahl. Aeltere Sicherungen haben
    // diese Felder nicht, dann passiert hier nichts. Rezept-IDs werden auf die neuen IDs umgebogen;
    // vorhandene Wochenplan-Eintraege werden ergaenzt, nie ersetzt.
    let addedPlan = 0;
    for (const day of (data.mealplan || [])) {
      if (!day || !day.date || day.movedTo) continue;
      // Sicherungen vor der Datumskorrektur (ohne keyVersion) auf den gemeinten Tag abbilden.
      const dayKey = day.keyVersion ? day.date : legacyUtcKeyToLocal(day.date);
      const incoming = Array.isArray(day.entries) ? day.entries : (day.recipeIds || []).map(rid => ({ recipeId: rid, meal: '', servings: null }));
      let mapped = incoming.map(en => en && en.type === 'note' ? { ...en, id: uid() } : ({ ...en, id: uid(), recipeId: recipeIdMap[en.recipeId] })).filter(en => en.type === 'note' ? String(en.text || '').trim() : en.recipeId);   // Notizeintraege (Paket 37) haben kein Rezept
      await loadMealplan();
      const existing = planEntriesFor(dayKey);
      mapped = mapped.filter(en => !existing.some(x => (en.type === 'note' ? x.type === 'note' && x.text === en.text : x.recipeId === en.recipeId) &&(x.meal || '') === (en.meal || '') && (x.servings || null) === (en.servings || null)));   // gleicher Eintrag schon da
      if (!mapped.length) continue;
      await savePlanEntries(dayKey, existing.concat(mapped));
      addedPlan += mapped.length;
    }
    // Kochbuch-Projekte (ab schemaVersion 5) und alte Einzelkonfiguration (aeltere Sicherungen): Rezept-IDs werden auf die
    // neuen IDs umgebogen. Vorhandene Kochbuecher werden nie ersetzt; identische (gleiche ID oder gleicher Inhalt) werden nicht verdoppelt.
    const addedBooks = restoreCookbooksFromBackup(data.settings, recipeIdMap);
    if (data.settings && Array.isArray(data.settings.collections)) {
      const cols = getCollections();
      data.settings.collections.forEach(c => { if (c && c.id && !cols.some(x => x.id === c.id)) cols.push(c); });
      saveCollections(cols);
    }
    await loadRecipes();
    await loadShopping();
    await loadMealplan();
    const extras = [];
    if (addedBooks) extras.push(`${addedBooks} Kochbuch${addedBooks === 1 ? '' : 'bücher'}`);
    if (addedPlan) extras.push(`${addedPlan} Wochenplan-Eintr${addedPlan === 1 ? 'ag' : 'äge'}`);
    if (addedFoods) extras.push(`${addedFoods} eigene${addedFoods === 1 ? 's' : ''} Lebensmittel`);
    if (addedMatches) extras.push(`${addedMatches} gelernte Zuordnung${addedMatches === 1 ? '' : 'en'}`);
    const msg = `${added} Rezept${added === 1 ? '' : 'e'}${addedItems ? `, ${addedItems} Einkaufslisten-Eintrag(e)` : ''}${extras.length ? ' und ' + extras.join(', ') : ''} wiederhergestellt.${skipped ? ` ${skipped} Rezept${skipped === 1 ? ' war' : 'e waren'} schon vorhanden und ${skipped === 1 ? 'wurde' : 'wurden'} nicht doppelt angelegt.` : ''}${badRecipes ? ` ${badRecipes} Eintrag${badRecipes === 1 ? ' war' : 'e waren'} unlesbar und wurde${badRecipes === 1 ? '' : 'n'} übersprungen.` : ''}${data.schemaVersion > 5 ? ' Die Sicherung stammt aus einer neueren Savora-Version: Unbekannte Teile wurden nicht übernommen.' : ''}`;
    render();
    const freshStatusEl = document.getElementById('backupStatus');
    if (freshStatusEl) freshStatusEl.innerHTML = `<div class="import-status ok">${escapeHtml(msg)}</div>`;
    showToast(msg);
  } catch (e) {
    const statusEl = document.getElementById('backupStatus');
    const full = e && (e.name === 'QuotaExceededError' || /quota|voll/i.test(String(e.message || '')));
    const hint = full ? ' Der Speicher des Geräts ist voll. Schon übernommene Rezepte bleiben erhalten; schaffe Platz und spiele dieselbe Datei erneut ein, bereits vorhandene Rezepte werden nicht doppelt angelegt.' : '';
    if (statusEl) statusEl.innerHTML = `<div class="import-status err">Wiederherstellung fehlgeschlagen: ${escapeHtml((e && e.message) || 'Unbekannter Fehler')}.${hint}</div>`;
    else showToast('Wiederherstellung fehlgeschlagen', 'error');
  }
}
