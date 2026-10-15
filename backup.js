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
  const coverImages = await backupCoverImages();
  const payload = {
    // version bleibt fuer aeltere App-Staende lesbar; schemaVersion beschreibt den Inhalt.
    // schemaVersion 6: zusaetzlich organization (Sammlungen, Zuordnungen, Verknuepfungen «Passt dazu»). settings.collections und
    // recipe.collections bleiben drin, damit aeltere App-Staende die Sicherung weiter lesen.
    app: 'savora', version: 3, schemaVersion: 6, exportedAt: new Date().toISOString(),
    recipes: recipesForExport, shopping: state.shopping,
    customFoods, nutritionMatches, nutritionResults,
    mealplan,
    coverImages,   // eigene Cover-Bilder der Kochbuecher (Cover-Editor); aeltere Sicherungen haben das Feld nicht, aeltere App-Staende ignorieren es
    // cookbooks: alle Kochbuch-Projekte (ab schemaVersion 5); cookbookConfig: alte Einzelkonfiguration, damit aeltere App-Staende die Sicherung weiter lesen
    settings: { collections: getCollections(), cookbooks: cookbookStoreRead(), cookbookConfig: readJsonKey(COOKBOOK_CONFIG_KEY, null) },
  };
  if (typeof orgExport === 'function') payload.organization = orgExport();
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

/* ---------- Cover-Bilder (Cover-Editor) ----------
   Sicherung: [{ id, mime, w, h, data: Data-URL, thumb?: Data-URL }] fuer alle Bilder, die ein Kochbuch nennt (coverImageIdsInUse).
   Wiederherstellen: gleiche ID, wenn sie frei ist oder dasselbe Bild schon dort liegt; sonst neue ID. Die Zuordnung alt -> neu
   wird in den wiederhergestellten Kochbuechern nachgefuehrt (wie recipeIdMap bei Rezepten). Vorhandene Bilder werden nie ueberschrieben. */
const BACKUP_COVER_ID_RE = /^cover-[A-Za-z0-9_-]{1,120}$/;
const BACKUP_COVER_DATA_RE = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+\/]+={0,2}$/;
const BACKUP_COVER_MAX = 60;
async function backupCoverImages() {
  const out = [];
  if (typeof coverImageIdsInUse !== 'function') return out;
  for (const id of coverImageIdsInUse()) {
    try {
      const rec = await dbGetImage(id);
      if (!rec || !rec.blob) continue;
      const item = { id, mime: rec.mime || rec.blob.type || 'image/jpeg', w: rec.w || 0, h: rec.h || 0, data: await blobToDataUrl(rec.blob) };
      if (rec.thumbBlob && rec.thumbBlob !== rec.blob) item.thumb = await blobToDataUrl(rec.thumbBlob);
      out.push(item);
    } catch (e) { /* ein unlesbares Bild darf die Sicherung der Rezepte nicht verhindern */ }
  }
  return out;
}
async function backupDataUrlBlob(url) { return (await fetch(url)).blob(); }
/* Gibt { map: altId -> neueId, written, problems: [Text] } zurueck. Schreibt nur gueltige, lesbare Bilder. */
async function backupRestoreCoverImages(list, progress) {
  const res = { map: {}, written: 0, problems: [] };
  if (!Array.isArray(list)) return res;
  let seen = 0;
  for (const it of list) {
    if (seen++ >= BACKUP_COVER_MAX) { res.problems.push(`Nicht übernommen, Titelbilder: mehr als ${BACKUP_COVER_MAX} Bilder in der Sicherung`); break; }
    const id = it && typeof it === 'object' ? it.id : '';
    if (typeof id !== 'string' || !BACKUP_COVER_ID_RE.test(id) || typeof it.data !== 'string' || !BACKUP_COVER_DATA_RE.test(it.data)) { res.problems.push('Nicht übernommen, Titelbild: Eintrag ist unlesbar'); continue; }
    try {
      const blob = await backupDataUrlBlob(it.data);
      const probe = await createImageBitmap(blob);   // lesbar? (verhindert kaputte Bilder im Speicher)
      const w = probe.width, h = probe.height; if (probe.close) probe.close();
      const mime = blob.type || it.mime || 'image/jpeg';
      let thumbBlob = blob;
      if (typeof it.thumb === 'string' && BACKUP_COVER_DATA_RE.test(it.thumb)) { try { thumbBlob = await backupDataUrlBlob(it.thumb); } catch (e) { thumbBlob = blob; } }
      const existing = await dbGetImage(id);
      let newId = id;
      if (existing) {
        if (existing.blob && existing.blob.size === blob.size && (existing.mime || existing.blob.type) === mime) { res.map[id] = id; continue; }   // dasselbe Bild liegt schon da
        newId = id.slice(0, 50) + '-r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);   // gleiche ID, anderes Bild: nie ueberschreiben
      }
      await dbPutImage({ id: newId, blob, thumbBlob, mime, kind: 'cover', w, h });
      if (progress) progress.written++;
      res.map[id] = newId; res.written++;
    } catch (e) { res.problems.push('Nicht übernommen, Titelbild: Bild ist beschädigt oder zu gross'); }
  }
  return res;
}

/* Rezept-IDs einer gesicherten Kochbuch-Konfiguration auf die neuen IDs abbilden (nicht aufloesbare Rezepte entfallen);
   coverIdMap (optional): Cover-Bild-ID aus der Sicherung -> ID auf diesem Geraet */
function backupMapCookbookConfig(config, recipeIdMap, coverIdMap) {
  const cfg = JSON.parse(JSON.stringify(config || {}));
  cookbookNormalizeConfigTemplate(cfg);   // alte Stil-ID einer aelteren Sicherung (A/B/C) -> pur/prise-pop, sonst bleibt alles wie gesichert
  const ci = cfg.cover && cfg.cover.image;
  if (ci && typeof ci.id === 'string' && coverIdMap && coverIdMap[ci.id]) ci.id = coverIdMap[ci.id];
  const cis = cfg.cover && cfg.cover.images;   // zusaetzliche Cover-Bilder (images[].imgId), gleiche Zuordnung wie das Hintergrundbild
  if (Array.isArray(cis) && coverIdMap) cis.forEach((e) => { if (e && typeof e.imgId === 'string' && coverIdMap[e.imgId]) e.imgId = coverIdMap[e.imgId]; });
  if (Array.isArray(cfg.items)) cfg.items = cfg.items.map(it => ({ ...it, recipeId: recipeIdMap[it.recipeId] })).filter(it => it.recipeId);
  if (cfg.coverRecipeId) cfg.coverRecipeId = recipeIdMap[cfg.coverRecipeId] || '';
  return cfg;
}
function backupCookbookIsPristine(book) {
  const c = book && book.config;
  return !!c && !Array.isArray(c.items) && !c.title && !c.subtitle && !c.author && !c.printName;   // nie bearbeitet: nur die leere Startkonfiguration
}
/* Gibt die Zahl der hinzugefuegten Kochbuecher zurueck. Aeltere Sicherungen ohne Projekte: die alte Einzelkonfiguration
   wird wie bei der Migration zu einem Projekt (ein noch unberuehrtes Startkochbuch uebernimmt sie). */
function restoreCookbooksFromBackup(settings, recipeIdMap, coverIdMap) {
  if (!settings) return 0;
  const store = cookbookStoreRead();   // loest bei Bedarf die Migration aus
  let added = 0;
  const sameConfig = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const incoming = [];
  const src = settings.cookbooks && cookbookSanitizeStore(settings.cookbooks);
  if (src) src.books.forEach(b => incoming.push({ id: b.id, name: b.name, createdAt: b.createdAt, updatedAt: b.updatedAt, config: backupMapCookbookConfig(b.config, recipeIdMap, coverIdMap) }));
  else if (settings.cookbookConfig && typeof settings.cookbookConfig === 'object') {
    const cfg = backupMapCookbookConfig(settings.cookbookConfig, recipeIdMap, coverIdMap);
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

/* Ergebnisbericht in die Statusflaeche schreiben: Zusammenfassung plus je Datensatz eine Zeile fuer alles, was nicht
   uebernommen wurde (kein stiller Teilerfolg). ok === false faerbt den Bericht als Warnung. */
function backupShowReport(msg, lines, ok) {
  const el = document.getElementById('backupStatus');
  if (!el) return;
  const list = lines && lines.length ? `<ul class="import-report">${lines.map(l => `<li>${escapeHtml(l)}</li>`).join('')}</ul>` : '';
  el.innerHTML = `<div class="import-status ${ok ? 'ok' : 'err'}">${escapeHtml(msg)}${list}</div>`;
}

async function restoreBackupFromFile(file) {
  const progress = { written: 0 };   // Zahl der Datensaetze, die schon geschrieben wurden: bestimmt, was eine Fehlermeldung ehrlich behaupten darf
  try {
    const text = await file.text();
    let data;
    try { data = JSON.parse(text); } catch (parseErr) { throw new Error('Die Datei ist beschädigt oder keine Sicherung (kein gültiges JSON). Es wurde nichts verändert. Wähle die Datei „savora-sicherung-….json“ erneut oder eine andere Sicherung'); }

    if (data && data.type === 'recipe-share' && data.recipe) {
      const v = validateRecipe(data.recipe);
      if (!v.ok) throw new Error(`Das geteilte Rezept ist nicht lesbar (${v.errors.slice(0, 3).join('; ')}). Es wurde nichts verändert`);
      const clone = v.recipe;
      // Sammlungs-IDs des Absenders gehoeren nicht in dieses Kochbuch (sie koennten zufaellig eigenen IDs gleichen)
      delete clone.collections; delete clone.collectionIds;
      const fp = backupRecipeFingerprint(clone);
      const same = state.recipes.find(x => backupRecipeFingerprint(x) === fp);   // gleiche Datei zweimal einspielen legt keine zweite Kopie an
      let msg;
      if (same) msg = `„${clone.title || 'Ohne Titel'}“ war schon in deinem Kochbuch und wurde nicht doppelt angelegt.`;
      else {
        clone.id = uid();
        clone.createdAt = Date.now();
        clone.updatedAt = Date.now();
        clone.favorite = false;
        clone.sharedBy = typeof data.sharedBy === 'string' ? data.sharedBy.slice(0, 100) : null;
        await dbPut(clone);
        progress.written++;
        await loadRecipes();
        msg = `„${clone.title || 'Ohne Titel'}“${clone.sharedBy ? ` von ${clone.sharedBy}` : ''} wurde zu deinem Kochbuch hinzugefügt.`;
      }
      render(); // Ansicht zuerst neu aufbauen, DANACH den Status-Text setzen —
                // sonst wuerde ein nachfolgender render() die gerade gesetzte Meldung sofort wieder loeschen.
      backupShowReport(msg, v.warnings.map(w => `Hinweis: ${w}`), true);
      showToast(msg);
      return;
    }

    // Die ganze Sicherung wird VOR dem ersten Schreibzugriff geprueft. Ein grundsaetzlicher Fehler bricht ab, ohne etwas zu aendern.
    const vb = validateBackup(data);
    if (vb.fatal) throw new Error(vb.fatal + '. Es wurde nichts verändert');
    const badSection = new Set(vb.sections.filter(x => !x.ok).map(x => x.key + ':' + x.index));
    const badShopping = new Set(vb.shopping.filter(x => !x.ok).map(x => x.index));
    const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
    const report = [];   // eine Zeile je Datensatz, der nicht uebernommen wurde oder einen Hinweis hat
    vb.problems.forEach(p => report.push(`Nicht übernommen, ${p.label}: ${p.errors.slice(0, 2).join('; ')}${p.errors.length > 2 ? ' …' : ''}`));
    const badRecipes = vb.recipes.filter(x => !x.ok).length;
    let added = 0, skipped = 0;
    const skippedIds = new Set();   // schon vorhandene, identische Rezepte: ihre lokalen Nährwert-Ergebnisse bleiben
    const recipeIdMap = {}; // alte Rezept-ID (aus der Sicherung) -> neue ID (siehe unten, wichtig fuer nutritionResults)
    const legacyPairs = [];   // [{c, r}] aus recipes[].collections (IDs der Sicherung), fuer Sammlungen und Zuordnungen
    const idCount = {};
    vb.recipes.forEach(rec => { if (rec.ok && typeof rec.recipe.id === 'string') idCount[rec.recipe.id] = (idCount[rec.recipe.id] || 0) + 1; });
    for (const rec of vb.recipes) {
      if (!rec.ok) continue;
      rec.warnings.forEach(w => report.push(`Hinweis, ${rec.label}: ${w}`));
      const clone = rec.recipe;
      const oldId = clone.id;
      if (oldId && Array.isArray(clone.collections)) clone.collections.forEach(c => { if (typeof c === 'string' && c !== 'friends') legacyPairs.push({ c, r: oldId }); });
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
      progress.written++;
      state.recipes.push(clone);   // fuer die Duplikatpruefung der folgenden Datensaetze derselben Datei
      if (oldId) recipeIdMap[oldId] = clone.id;
      added++;
    }
    // Sammlungen, Zuordnungen und Verknuepfungen (org.js): direkt nach den Rezepten, damit alle Beziehungen ueber die
    // vollstaendige ID-Abbildung laufen. Mehrdeutige IDs (mehrfach in der Sicherung) werden nicht verbunden.
    let orgRep = null;
    if (typeof orgImport === 'function') {
      const orgMap = {};
      Object.entries(recipeIdMap).forEach(([k, v]) => { if (idCount[k] === 1) orgMap[k] = v; });
      const ambiguous = Object.keys(idCount).filter(k => idCount[k] > 1).length;
      const od = vb.organization && vb.organization.data;
      const orgData = od ? { collections: od.collections, memberships: od.memberships, links: od.links, legacy: legacyPairs }
        : { collections: (data.settings && Array.isArray(data.settings.collections) ? data.settings.collections : []).filter(c => isObj(c)), legacy: legacyPairs };
      orgRep = orgImport(orgData, orgMap);
      const mr = orgRep.memberships, lr = orgRep.links;
      if (mr.missing) report.push(`Nicht übernommen, Sammlungen: ${mr.missing} Zuordnung${mr.missing === 1 ? '' : 'en'} ohne Rezept oder Sammlung in der Sicherung`);
      if (mr.removed) report.push(`Nicht übernommen, Sammlungen: ${mr.removed} Zuordnung${mr.removed === 1 ? ' wurde' : 'en wurden'} auf diesem Gerät bewusst entfernt`);
      if (lr.missing) report.push(`Nicht übernommen, Passt dazu: ${lr.missing} Verknüpfung${lr.missing === 1 ? '' : 'en'}, weil ein Rezept fehlt${ambiguous ? ' oder seine ID in der Sicherung mehrfach vorkommt' : ''}`);
      if (lr.self) report.push(`Nicht übernommen, Passt dazu: ${lr.self} Verknüpfung${lr.self === 1 ? '' : 'en'} zwischen zwei gleichen Rezepten`);
      if (lr.removed) report.push(`Nicht übernommen, Passt dazu: ${lr.removed} Verknüpfung${lr.removed === 1 ? ' wurde' : 'en wurden'} auf diesem Gerät bewusst entfernt`);
      if (orgRep.collections.added || mr.added || lr.added) progress.written++;
    }
    let addedItems = 0;
    for (let n = 0; n < (data.shopping || []).length; n++) {
      const s = data.shopping[n];
      if (badShopping.has(n) || !isObj(s)) continue;
      if (state.shopping.some(x => x.name === s.name && x.amount === s.amount && (x.unit || '') === (s.unit || ''))) continue;   // schon in der Einkaufsliste
      const clone = JSON.parse(JSON.stringify(s));
      clone.id = uid();
      await dbPutShopping(clone);
      progress.written++;
      state.shopping.push(clone);
      addedItems++;
    }

    // Nutrition-Daten (Punkt 32, ab Sicherungsversion 3 vorhanden — bei aelteren Sicherungen
    // sind diese Felder einfach nicht da, dann passiert hier nichts, alte Backups bleiben
    // importierbar). Eigene Lebensmittel und gelernte Zuordnungen behalten ihre ID/ihren Key
    // (put = upsert) — anders als bei Rezepten wuerde ein Neuvergeben der ID die Verbindung
    // zwischen einer gelernten Zuordnung und dem Custom Food, auf das sie zeigt, zerstoeren.
    let addedFoods = 0, addedMatches = 0, addedResults = 0;
    for (let n = 0; n < (data.customFoods || []).length; n++) {
      if (badSection.has('customFoods:' + n)) continue;
      await dbPutCustomFood(JSON.parse(JSON.stringify(data.customFoods[n])));
      progress.written++;
      addedFoods++;
    }
    for (let n = 0; n < (data.nutritionMatches || []).length; n++) {
      if (badSection.has('nutritionMatches:' + n)) continue;
      await dbPutNutritionMatch(JSON.parse(JSON.stringify(data.nutritionMatches[n])));
      progress.written++;
      addedMatches++;
    }
    for (let n = 0; n < (data.nutritionResults || []).length; n++) {
      if (badSection.has('nutritionResults:' + n)) continue;
      const clone = JSON.parse(JSON.stringify(data.nutritionResults[n]));
      const newRecipeId = recipeIdMap[clone.recipeId];
      if (!newRecipeId || skippedIds.has(clone.recipeId)) continue; // Rezept aus der Sicherung ist nicht (mehr) dabei -> Ergebnis waere verwaist
      clone.recipeId = newRecipeId;
      await dbPutNutritionResult(clone);
      progress.written++;
      addedResults++;
    }

    // Ab schemaVersion 4: Wochenplan, Sammlungen und Kochbuch-Auswahl. Aeltere Sicherungen haben
    // diese Felder nicht, dann passiert hier nichts. Rezept-IDs werden auf die neuen IDs umgebogen;
    // vorhandene Wochenplan-Eintraege werden ergaenzt, nie ersetzt.
    let addedPlan = 0, badDays = 0;
    for (const day of (data.mealplan || [])) {
      if (!isObj(day) || typeof day.date !== 'string' || !/^\d{4}-\d{1,2}-\d{1,2}$/.test(day.date)) { if (!(isObj(day) && day.movedTo)) badDays++; continue; }
      if (day.movedTo) continue;
      // Sicherungen vor der Datumskorrektur (ohne keyVersion) auf den gemeinten Tag abbilden.
      const dayKey = day.keyVersion ? day.date : legacyUtcKeyToLocal(day.date);
      const incoming = (Array.isArray(day.entries) ? day.entries : (Array.isArray(day.recipeIds) ? day.recipeIds : []).map(rid => ({ recipeId: rid, meal: '', servings: null }))).filter(isObj);
      let mapped = incoming.map(en => en.type === 'note' ? { ...en, id: uid() } : ({ ...en, id: uid(), recipeId: recipeIdMap[en.recipeId] })).filter(en => en.type === 'note' ? String(en.text || '').trim() : en.recipeId);   // Notizeintraege (Paket 37) haben kein Rezept
      await loadMealplan();
      const existing = planEntriesFor(dayKey);
      mapped = mapped.filter(en => !existing.some(x => (en.type === 'note' ? x.type === 'note' && x.text === en.text : x.recipeId === en.recipeId) &&(x.meal || '') === (en.meal || '') && (x.servings || null) === (en.servings || null)));   // gleicher Eintrag schon da
      if (!mapped.length) continue;
      await savePlanEntries(dayKey, existing.concat(mapped));
      progress.written++;
      addedPlan += mapped.length;
    }
    if (badDays) report.push(`Nicht übernommen, Wochenplan: ${badDays} Tag${badDays === 1 ? '' : 'e'} ohne gültiges Datum`);
    // Kochbuch-Projekte (ab schemaVersion 5) und alte Einzelkonfiguration (aeltere Sicherungen): Rezept-IDs werden auf die
    // neuen IDs umgebogen. Vorhandene Kochbuecher werden nie ersetzt; identische (gleiche ID oder gleicher Inhalt) werden nicht verdoppelt.
    const covers = await backupRestoreCoverImages(data.coverImages, progress);   // Bilder zuerst, damit die Kochbuecher auf vorhandene Bilder zeigen
    covers.problems.forEach(t => report.push(t));
    const addedBooks = restoreCookbooksFromBackup(data.settings, recipeIdMap, covers.map);
    if (addedBooks) progress.written++;
    if (!orgRep && data.settings && Array.isArray(data.settings.collections)) {   // nur ohne org.js (Rueckfall)
      const cols = getCollections();
      data.settings.collections.forEach(c => { if (c && typeof c === 'object' && typeof c.id === 'string' && !cols.some(x => x.id === c.id)) cols.push(c); });
      saveCollections(cols);
    }
    await loadRecipes();
    await loadShopping();
    await loadMealplan();
    const extras = [];
    if (addedBooks) extras.push(`${addedBooks} Kochbuch${addedBooks === 1 ? '' : 'bücher'}`);
    if (covers.written) extras.push(`${covers.written} Titelbild${covers.written === 1 ? '' : 'er'}`);
    if (addedPlan) extras.push(`${addedPlan} Wochenplan-Eintr${addedPlan === 1 ? 'ag' : 'äge'}`);
    if (addedFoods) extras.push(`${addedFoods} eigene${addedFoods === 1 ? 's' : ''} Lebensmittel`);
    if (addedMatches) extras.push(`${addedMatches} gelernte Zuordnung${addedMatches === 1 ? '' : 'en'}`);
    if (orgRep && orgRep.collections.added) extras.push(`${orgRep.collections.added} Sammlung${orgRep.collections.added === 1 ? '' : 'en'}`);
    if (orgRep && orgRep.memberships.added) extras.push(`${orgRep.memberships.added} Sammlungszuordnung${orgRep.memberships.added === 1 ? '' : 'en'}`);
    if (orgRep && orgRep.links.added) extras.push(`${orgRep.links.added} Verknüpfung${orgRep.links.added === 1 ? '' : 'en'}`);
    const nBad = vb.problems.length;
    const msg = `${added} Rezept${added === 1 ? '' : 'e'}${addedItems ? `, ${addedItems} Einkaufslisten-Eintrag(e)` : ''}${extras.length ? ' und ' + extras.join(', ') : ''} wiederhergestellt.${skipped ? ` ${skipped} Rezept${skipped === 1 ? ' war' : 'e waren'} schon vorhanden und ${skipped === 1 ? 'wurde' : 'wurden'} nicht doppelt angelegt.` : ''}${badRecipes ? ` ${badRecipes} ${badRecipes === 1 ? 'Eintrag war' : 'Einträge waren'} unlesbar und wurde${badRecipes === 1 ? '' : 'n'} übersprungen.` : ''}${nBad > badRecipes ? ` ${nBad - badRecipes} weitere Datensätze waren unlesbar und wurden übersprungen.` : ''}${data.schemaVersion > 6 ? ' Die Sicherung stammt aus einer neueren Savora-Version: Unbekannte Teile wurden nicht übernommen.' : ''}${nBad ? ' Du kannst dieselbe Datei nach einer Korrektur erneut einspielen, bereits übernommene Rezepte werden nicht doppelt angelegt.' : ''}`;
    render();
    backupShowReport(msg, valReportLinesFromStrings(report, 12), !nBad && !covers.problems.length);
    showToast(msg);
  } catch (e) {
    const statusEl = document.getElementById('backupStatus');
    const full = e && (e.name === 'QuotaExceededError' || /quota|voll/i.test(String(e.message || '')));
    let msg = `Wiederherstellung fehlgeschlagen: ${(e && e.message) || 'Unbekannter Fehler'}.`;
    if (progress.written > 0) {
      // Es wurde schon geschrieben: nie behaupten, es sei nichts veraendert worden
      try { await loadRecipes(); await loadShopping(); } catch (err2) { /* Ansicht wird beim naechsten Laden aktualisiert */ }
      msg += ` Schon übernommen wurden ${progress.written} Datensatz/Datensätze und sie bleiben erhalten.${full ? ' Der Speicher des Geräts ist voll: Schaffe Platz und spiele dieselbe Datei erneut ein,' : ' Spiele dieselbe Datei erneut ein,'} bereits vorhandene Rezepte werden nicht doppelt angelegt.`;
    } else if (full) {
      msg += ' Der Speicher des Geräts ist voll. Es wurde nichts übernommen, deine bisherigen Daten und Eingaben bleiben unverändert. Schaffe Platz und versuche es erneut.';
    }
    if (statusEl) backupShowReport(msg, [], false);
    else showToast('Wiederherstellung fehlgeschlagen', 'error');
  }
}
function valReportLinesFromStrings(lines, max) {
  const out = lines.slice(0, max);
  if (lines.length > max) out.push(`… und ${lines.length - max} weitere Zeilen`);
  return out;
}
