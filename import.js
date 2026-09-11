/* ---------- Web-Import (JSON-LD schema.org/Recipe) ----------
   Architektur bewusst in Etappen getrennt (Abruf / HTML-Parsing / JSON-LD-Extraktion /
   Normalisierung):
     URL -> fetchRecipePage() -> HTML -> extractJsonLdRecipe() -> JSON-LD ->
     normalizeJsonLdRecipe() -> Savora-Rezept -> Formular-Vorschau -> Nutzer prueft -> Speichern
   Dadurch laesst sich die Abruf-Etappe spaeter durch einen eigenen Backend-/Edge-Service
   ersetzen, ohne die Parsing-/Normalisierungslogik anzufassen (die auch weiterhin funktioniert,
   falls der direkte Browser-Abruf klappt — die meisten Seiten mit CORS-Freigabe funktionieren
   unveraendert). Es wird bewusst KEIN oeffentlicher CORS-Proxy und kein Workaround um Browser-
   Sicherheitsmechanismen verwendet: Bei Blockierung wird stattdessen klar und direkt auf den
   Text-Import verwiesen, der zuverlaessig funktioniert. Der bestehende JSON-LD-Parser selbst
   (extractJsonLdRecipe/normalizeJsonLdRecipe) ist unveraendert dieselbe Parsing-Logik wie zuvor. */

function importError(type, message) {
  const err = new Error(message);
  err.type = type;
  return err;
}

function isValidHttpUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

/* Abruf-Etappe — der austauschbare Einstiegspunkt fuer einen spaeteren eigenen Import-Service.
   fetch() kann aus Browser-Sicherheitsgruenden technisch NICHT zwischen einem CORS-Block und
   einem echten Netzwerkfehler (DNS, offline, ungueltiges Zertifikat...) unterscheiden — beides
   loest denselben generischen TypeError aus. Diese Einschraenkung ist auf JS-Ebene nicht
   zuverlaessig umgehbar, daher werden beide Faelle ehrlich unter einer gemeinsamen, klar
   verstaendlichen Meldung zusammengefasst statt eine falsche Praezision vorzutaeuschen. */
async function fetchRecipePage(url) {
  let res;
  try {
    res = await fetch(url, { mode: 'cors' });
  } catch (e) {
    throw importError('network-or-cors', 'Die Seite konnte nicht direkt abgerufen werden — entweder ein Netzwerkproblem oder die Website blockiert externe Anfragen (CORS).');
  }
  if (!res.ok) {
    throw importError('not-ok', `Die Seite antwortete mit einem Fehler (Status ${res.status}).`);
  }
  return res.text();
}

/* HTML-Parsing + JSON-LD-Extraktion — unveraenderte Parsing-Logik, nur in eine eigene,
   testbare Funktion ausgelagert. */
function extractJsonLdRecipe(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
  if (!scripts.length) return { recipe: null, hadJsonLd: false, hadParseError: false };
  let hadParseError = false;
  for (const s of scripts) {
    try {
      const json = JSON.parse(s.textContent);
      const candidates = Array.isArray(json) ? json : (json['@graph'] || [json]);
      const recipeData = candidates.find(c => {
        const t = c && c['@type'];
        return t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'));
      });
      if (recipeData) return { recipe: recipeData, hadJsonLd: true, hadParseError: false };
    } catch (e) { hadParseError = true; }
  }
  return { recipe: null, hadJsonLd: true, hadParseError };
}

/* JSON-LD -> normalisiertes Savora-Rezept. */
function normalizeJsonLdRecipe(recipeData, url) {
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
  r._importSummary = {
    titleFound: !!recipeData.name,
    ingredientCount: r.ingredients.filter(i => i.name).length,
    stepCount: r.steps.filter(s => s.text).length,
    servingsFound: !!recipeData.recipeYield,
    timeFound: !!(recipeData.totalTime || recipeData.cookTime),
    dietFound: false,
  };
  return r;
}

function fallbackToTextImportHtml(message) {
  return `<div class="import-status err">
    ${escapeHtml(message)}<br>Kopiere stattdessen den Rezepttext von der Seite und füge ihn unten ein.
    <div style="margin-top:8px;"><button type="button" class="ghost-btn" data-action="focus-paste-import">Text einfügen</button></div>
  </div>`;
}

/* Fehlerhinweis inkl. Fallback-Button anzeigen. Der Button wird per innerHTML direkt in
   #importStatus eingefuegt, ausserhalb des normalen render()-Zyklus — die zentrale
   [data-action]-Klick-Delegation aus bindEvents() greift dafuer also nicht automatisch.
   Deshalb hier explizit denselben onAction-Handler anhaengen wie bindEvents es sonst tut. */
function showImportError(statusEl, message) {
  statusEl.innerHTML = fallbackToTextImportHtml(message);
  const btn = statusEl.querySelector('[data-action="focus-paste-import"]');
  if (btn) btn.addEventListener('click', onAction);
}

async function importFromUrl(url) {
  const statusEl = document.getElementById('importStatus');
  statusEl.innerHTML = `<div class="import-status pending">Rezept wird geladen …</div>`;

  if (!isValidHttpUrl(url)) {
    statusEl.innerHTML = `<div class="import-status err">Das sieht nicht nach einer gültigen Web-Adresse aus — bitte mit http:// oder https:// beginnen.</div>`;
    return;
  }

  let html;
  try {
    html = await fetchRecipePage(url);
  } catch (e) {
    showImportError(statusEl, e.message);
    return;
  }

  const { recipe, hadJsonLd, hadParseError } = extractJsonLdRecipe(html);
  if (!recipe) {
    const reason = !hadJsonLd
      ? 'Diese Website enthält keine strukturierten Rezeptdaten, die Savora automatisch lesen kann.'
      : hadParseError
        ? 'Auf dieser Seite wurden strukturierte Daten gefunden, sie liessen sich aber nicht auswerten.'
        : 'Auf dieser Seite wurden strukturierte Daten gefunden, aber kein Rezept darin.';
    showImportError(statusEl, reason);
    return;
  }

  const r = normalizeJsonLdRecipe(recipe, url);
  const hasContent = r.ingredients.filter(i => i.name).length || r.steps.filter(s => s.text).length;
  if (!hasContent) {
    showImportError(statusEl, 'Das gefundene Rezept scheint unvollständig zu sein (keine Zutaten oder Schritte erkannt).');
    return;
  }

  // Erfolgreich normalisiert -> Formular-Vorschau, genau wie beim Text-Import:
  // der Nutzer prueft den Entwurf, bevor gespeichert wird — kein automatisches Speichern.
  statusEl.innerHTML = '';
  state.editingRecipe = r;
  state.view = 'form';
  render();
  showToast('Entwurf erstellt — bitte prüfen');
}
