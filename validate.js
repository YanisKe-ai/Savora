/* ---------- Zentrale Validierung eingehender Daten (Audit B01, B05, B06) ----------
   Alles, was von aussen kommt (Sicherung, geteiltes Rezept, Cloud-Abgleich, Altbestand in der Datenbank), laeuft durch
   dieselben Regeln. Grundsaetze:
   - Rezeptdaten werden nie veraendert, ausser dort, wo ein Wert gefaehrlich waere (ungueltige Bildquelle wird entfernt
     und gemeldet). Unbekannte Zusatzfelder bleiben erhalten, nichts wird geloescht oder umgeschrieben.
   - Eine ungueltige Angabe fuehrt zu einer klaren Fehlerliste, nie zu einem Absturz.
   - Bildquellen: nur gueltige blob:-Adressen, begrenzte Raster-Data-URLs (png, jpeg, webp, gif), http(s) und lokale relative
     Pfade. Keine SVG-Data-URLs, kein javascript:, nichts mit Anfuehrungszeichen oder Spitzklammern.
   - Ausgabe in HTML geht zusaetzlich immer durch escapeHtml (kontextsicher fuer Attribute und Text). */

const VAL = {
  MAX_ID: 120, MAX_TITLE: 500, MAX_NOTES: 50000, MAX_STEP: 20000, MAX_INGREDIENTS: 500, MAX_STEPS: 500, MAX_LIST: 200,
  MAX_RECIPES: 20000, MAX_URL: 2048, MAX_DATA_URL: 10000000, MAX_MINUTES: 100000, MAX_SERVINGS: 10000,
};
const VAL_ID_RE = /^[A-Za-z0-9_.:@-]{1,120}$/;
const VAL_DATA_IMG_RE = /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+\/]+={0,2}$/;
const VAL_BLOB_RE = /^blob:(?:https?:\/\/[A-Za-z0-9.\-:\[\]]+\/)?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const VAL_REL_PATH_RE = /^(?![A-Za-z][A-Za-z0-9+.\-]*:)(?!\/\/)(?!.*\.\.)[A-Za-z0-9._~\-\/%]{1,500}$/;

function valIsObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function valIsNum(v) { return typeof v === 'number' && isFinite(v); }

/* Prueft eine Bildquelle. Gibt die Quelle unveraendert zurueck, wenn sie erlaubt ist, sonst ''. */
function valImageSrc(src) {
  if (typeof src !== 'string' || !src || src !== src.trim()) return '';
  if (/^data:/i.test(src)) return src.length <= VAL.MAX_DATA_URL && VAL_DATA_IMG_RE.test(src) ? src : '';
  if (/^blob:/i.test(src)) return VAL_BLOB_RE.test(src) ? src : '';
  if (src.length > VAL.MAX_URL) return '';
  if (/^https?:\/\//i.test(src)) {
    if (/[\s"'<>\\`\u0000-\u001f]/.test(src)) return '';
    try { const u = new URL(src); return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname ? src : ''; } catch (e) { return ''; }
  }
  return VAL_REL_PATH_RE.test(src) ? src : '';
}
/* Fuer die Anzeige: gepruefte Bildquelle bzw. Bild-ID eines Rezepts (leer, wenn nicht erlaubt). Das Ergebnis pro Rezeptobjekt
   wird gemerkt, damit grosse Data-URLs nicht bei jedem Neuaufbau erneut geprueft werden. */
const _valImgCache = new WeakMap();
function recipeSafeImage(r) {
  if (!r || typeof r !== 'object' || typeof r.image !== 'string' || !r.image) return '';
  const hit = _valImgCache.get(r);
  if (hit && hit.src === r.image) return hit.ok;
  const ok = valImageSrc(r.image);
  _valImgCache.set(r, { src: r.image, ok });
  return ok;
}
function recipeSafeImageId(r) {
  return r && typeof r === 'object' && typeof r.imageId === 'string' && VAL_ID_RE.test(r.imageId) ? r.imageId : '';
}

function valText(v, max, label, errors, optional) {
  if (v === undefined || v === null) return;
  if (typeof v !== 'string') { errors.push(`${label}: muss Text sein (gefunden: ${valTypeName(v)})`); return; }
  if (v.length > max) errors.push(`${label}: zu lang (${v.length} Zeichen, erlaubt sind ${max})`);
}
/* ---------- Herkunft aus der oeffentlichen Rezeptbibliothek (recipe.publicOrigin, recipe.publicTips) ----------
   Reine Anzeige-Angabe: daraus entstehen nie Rechte (Bearbeiten, Zurueckziehen usw. prueft immer der Server ueber das Konto).
   Das Objekt wird Feld fuer Feld neu aufgebaut, unbekannte Felder fallen weg. Die Adresse (url) wird nie vertraut, sondern
   immer lokal aus publicationId gebaut. mode: 'store' (alle Felder), 'receive' (von Freunden: ohne savedVersion/savedAt/
   imagePending), 'send' (an Freunde: nur publicationId, authorPublicId, authorName).
   Ergebnis: { origin: Objekt|null, problems: [Text] } . origin null heisst: keine gueltige Herkunft (ganzes Feld entfernen). */
const VAL_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const VAL_PUBLIC_ID_RE = /^[a-z0-9]{12}$/;
const VAL_MAX_PUBLIC_TIPS = 2000;
function publicSiteUrl() {
  // CLOUD_SITE_URL steht in cloud.js (spaeter geladen); zur Laufzeit ist es da, sonst die feste Adresse
  return (typeof CLOUD_SITE_URL === 'string' && /^https:\/\//.test(CLOUD_SITE_URL)) ? CLOUD_SITE_URL : 'https://yaniske-ai.github.io/Savora/';
}
function publicRecipeUrl(publicationId) { return publicSiteUrl() + '?rezept=' + publicationId; }
function valPublicOrigin(raw, mode) {
  mode = mode || 'store';
  const problems = [];
  if (!valIsObj(raw)) return { origin: null, problems: ['Die Herkunft aus der Rezeptbibliothek war ungültig und wurde entfernt'] };
  const pid = typeof raw.publicationId === 'string' ? raw.publicationId.trim().toLowerCase() : '';
  if (!VAL_UUID_RE.test(pid)) return { origin: null, problems: ['Die Herkunft aus der Rezeptbibliothek war ungültig und wurde entfernt'] };
  const o = { publicationId: pid };
  if (raw.authorPublicId !== undefined && raw.authorPublicId !== null && raw.authorPublicId !== '') {
    if (typeof raw.authorPublicId === 'string' && VAL_PUBLIC_ID_RE.test(raw.authorPublicId)) o.authorPublicId = raw.authorPublicId;
    else problems.push('Die Profil-ID der Herkunft war ungültig und wurde entfernt');
  }
  if (raw.authorName !== undefined && raw.authorName !== null) {
    if (typeof raw.authorName === 'string' && raw.authorName.trim().length <= 40) { if (raw.authorName.trim()) o.authorName = raw.authorName.trim(); }
    else problems.push('Der Autorenname der Herkunft war ungültig und wurde entfernt');
  }
  if (mode === 'send') return { origin: o, problems };
  if (mode === 'store') {
    if (raw.savedVersion !== undefined && raw.savedVersion !== null) {
      if (Number.isInteger(raw.savedVersion) && raw.savedVersion >= 1) o.savedVersion = raw.savedVersion;
      else problems.push('Die gespeicherte Version der Herkunft war ungültig und wurde entfernt');
    }
    if (raw.savedAt !== undefined && raw.savedAt !== null) {
      if (valIsNum(raw.savedAt) && raw.savedAt >= 0) o.savedAt = raw.savedAt;
      else problems.push('Das Speicherdatum der Herkunft war ungültig und wurde entfernt');
    }
    if (raw.imagePending !== undefined && raw.imagePending !== null) {
      if (typeof raw.imagePending === 'boolean') o.imagePending = raw.imagePending;
      else problems.push('Die Bildangabe der Herkunft war ungültig und wurde entfernt');
    }
  }
  o.url = publicRecipeUrl(pid);   // nie aus den Daten uebernehmen: immer selbst gebaut (gleich, wenn sie stimmte)
  return { origin: o, problems };
}

function valTypeName(v) { return v === null ? 'leer' : Array.isArray(v) ? 'Liste' : typeof v === 'string' ? 'Text' : typeof v === 'number' ? 'Zahl' : typeof v === 'boolean' ? 'ja/nein' : typeof v === 'object' ? 'Objekt' : typeof v; }
function valNumber(v, max, label, errors) {
  if (v === undefined || v === null || v === '') return;
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (!valIsNum(n)) { errors.push(`${label}: muss eine Zahl sein (gefunden: ${valTypeName(v)})`); return; }
  if (n < 0) errors.push(`${label}: darf nicht negativ sein`);
  else if (n > max) errors.push(`${label}: zu gross (höchstens ${max})`);
}
function valStringList(v, label, errors) {
  if (v === undefined || v === null) return;
  if (!Array.isArray(v)) { errors.push(`${label}: muss eine Liste sein (gefunden: ${valTypeName(v)})`); return; }
  if (v.length > VAL.MAX_LIST) { errors.push(`${label}: zu viele Einträge (${v.length}, erlaubt sind ${VAL.MAX_LIST})`); return; }
  v.forEach((x, n) => { if (typeof x !== 'string' || x.length > 200) errors.push(`${label}, Eintrag ${n + 1}: muss Text bis 200 Zeichen sein`); });
}

/* Ein Rezeptobjekt pruefen.
   Ergebnis: { ok, errors: [Text], warnings: [Text], recipe } . recipe ist eine tiefe Kopie mit allen Zusatzfeldern; eine
   unzulaessige Bildquelle ist darin entfernt (und als Hinweis gemeldet). Bei ok === false ist recipe null. */
function validateRecipe(raw) {
  const errors = [], warnings = [];
  if (!valIsObj(raw)) return { ok: false, errors: ['Kein Rezept (ein Objekt wird erwartet)'], warnings, recipe: null };
  if (raw.id !== undefined && raw.id !== null && !(typeof raw.id === 'string' && VAL_ID_RE.test(raw.id))) errors.push('ID: nur Buchstaben, Ziffern und _ . : @ - sind erlaubt (höchstens 120 Zeichen)');
  valText(raw.title, VAL.MAX_TITLE, 'Titel', errors);
  valText(raw.notes, VAL.MAX_NOTES, 'Notizen', errors);
  valText(raw.difficulty, 100, 'Schwierigkeit', errors);
  valText(raw.source, VAL.MAX_URL, 'Quelle', errors);
  valText(raw.servingMode, 20, 'Ergibt-Art', errors);
  // Ertragsart (v0.83): 'portions' | 'pieces' | 'total'. Ein unbekannter Wert ist unschaedlich (wird als Portionen gelesen) und nur eine Warnung.
  if (typeof raw.servingMode === 'string' && raw.servingMode && !['portions', 'pieces', 'total'].includes(raw.servingMode)) warnings.push(`Die Angabe «${raw.servingMode.slice(0, 20)}» für «Ergibt» ist nicht bekannt. Sie wird als Portionen angezeigt.`);
  valText(raw.yieldLabel, 100, 'Bezeichnung der Menge', errors);
  valNumber(raw.servings, VAL.MAX_SERVINGS, 'Menge (Ergibt)', errors);
  ['timeMinutes', 'prepMinutes', 'restMinutes', 'cookMinutes'].forEach(k => valNumber(raw[k], VAL.MAX_MINUTES, 'Zeitangabe ' + k, errors));
  valNumber(raw.cookCount, 1e9, 'Zähler', errors);
  ['tags', 'diet', 'categoryTags', 'suppressedTags', 'collections', 'collectionIds'].forEach(k => valStringList(raw[k], k, errors));
  if (raw.cookLog !== undefined && raw.cookLog !== null && !Array.isArray(raw.cookLog)) errors.push('Kochprotokoll: muss eine Liste sein');
  if (raw.ingredients !== undefined && raw.ingredients !== null) {
    if (!Array.isArray(raw.ingredients)) errors.push(`Zutaten: müssen eine Liste sein (gefunden: ${valTypeName(raw.ingredients)})`);
    else if (raw.ingredients.length > VAL.MAX_INGREDIENTS) errors.push(`Zutaten: zu viele (${raw.ingredients.length}, erlaubt sind ${VAL.MAX_INGREDIENTS})`);
    else raw.ingredients.forEach((i, n) => {
      const l = `Zutat ${n + 1}`;
      if (!valIsObj(i)) { errors.push(`${l}: muss ein Objekt sein`); return; }
      valText(i.name, 1000, l + ', Name', errors); valText(i.unit, 100, l + ', Einheit', errors); valText(i.group, 300, l + ', Gruppe', errors);
      if (i.amount !== undefined && i.amount !== null && typeof i.amount !== 'string' && !valIsNum(i.amount)) errors.push(`${l}, Menge: muss Text oder Zahl sein`);
      else if (typeof i.amount === 'string' && i.amount.length > 200) errors.push(`${l}, Menge: zu lang`);
    });
  }
  if (raw.steps !== undefined && raw.steps !== null) {
    if (!Array.isArray(raw.steps)) errors.push(`Schritte: müssen eine Liste sein (gefunden: ${valTypeName(raw.steps)})`);
    else if (raw.steps.length > VAL.MAX_STEPS) errors.push(`Schritte: zu viele (${raw.steps.length}, erlaubt sind ${VAL.MAX_STEPS})`);
    else raw.steps.forEach((s, n) => {
      if (!valIsObj(s)) { errors.push(`Schritt ${n + 1}: muss ein Objekt mit Text sein`); return; }
      valText(s.text, VAL.MAX_STEP, `Schritt ${n + 1}`, errors);
    });
  }
  if (raw.image !== undefined && raw.image !== null && typeof raw.image !== 'string') errors.push('Bild: muss Text oder leer sein');
  if (raw.imageId !== undefined && raw.imageId !== null && typeof raw.imageId !== 'string') errors.push('Bild-ID: muss Text oder leer sein');
  if (errors.length) return { ok: false, errors, warnings, recipe: null };
  let recipe;
  try { recipe = JSON.parse(JSON.stringify(raw)); } catch (e) { return { ok: false, errors: ['Rezept enthält Werte, die nicht gespeichert werden können'], warnings, recipe: null }; }
  if (typeof recipe.image === 'string' && recipe.image && !valImageSrc(recipe.image)) {
    recipe.image = null;
    warnings.push('Die Bildquelle war nicht erlaubt und wurde nicht übernommen (erlaubt sind Fotos, https-Adressen und lokale Pfade)');
  }
  if (typeof recipe.imageId === 'string' && recipe.imageId && !VAL_ID_RE.test(recipe.imageId)) {
    delete recipe.imageId;
    warnings.push('Die Bild-ID war ungültig und wurde nicht übernommen');
  }
  if (recipe.focalPoint !== undefined && !(valIsObj(recipe.focalPoint) && valIsNum(recipe.focalPoint.x) && valIsNum(recipe.focalPoint.y) && recipe.focalPoint.x >= 0 && recipe.focalPoint.x <= 1 && recipe.focalPoint.y >= 0 && recipe.focalPoint.y <= 1)) {
    recipe.focalPoint = { x: 0.5, y: 0.5 };
    warnings.push('Der Bildausschnitt war ungültig und wurde auf die Mitte gesetzt');
  }
  // Herkunft aus der Rezeptbibliothek: ungueltig heisst nur das Feld (bzw. Teilfeld) entfernen, das Rezept bleibt gueltig
  if (recipe.publicOrigin !== undefined && recipe.publicOrigin !== null) {
    const po = valPublicOrigin(recipe.publicOrigin, 'store');
    if (po.origin) recipe.publicOrigin = po.origin; else delete recipe.publicOrigin;
    po.problems.forEach(p => warnings.push(p));
  }
  if (recipe.publicTips !== undefined && recipe.publicTips !== null && !(typeof recipe.publicTips === 'string' && recipe.publicTips.length <= VAL_MAX_PUBLIC_TIPS)) {
    delete recipe.publicTips;
    warnings.push('Die Kochtipps aus der Rezeptbibliothek waren ungültig und wurden entfernt');
  }
  return { ok: true, errors, warnings, recipe };
}

/* Bezeichnung eines Datensatzes fuer den Bericht (nie ein Absturz, auch bei kaputten Typen) */
function valLabel(r, n) {
  const t = valIsObj(r) && typeof r.title === 'string' && r.title.trim() ? r.title.trim().slice(0, 60) : '';
  return t ? `„${t}“ (Eintrag ${n + 1})` : `Eintrag ${n + 1}`;
}

/* Eine ganze Sicherung vor dem ersten Schreibzugriff pruefen.
   Ergebnis: { fatal: Text|null, recipes: [{ index, label, ok, errors, warnings, recipe }], shopping: [...], others: {...}, problems } .
   fatal bedeutet: nichts darf geschrieben werden. Einzelne unlesbare Datensaetze machen die Sicherung nicht unbrauchbar, sie
   werden aber im Ergebnisbericht einzeln genannt. */
function validateBackup(data) {
  const out = { fatal: null, recipes: [], shopping: [], sections: [], problems: [] };
  if (!valIsObj(data)) { out.fatal = 'Diese Datei sieht nicht wie eine Savora-Sicherung oder ein geteiltes Rezept aus'; return out; }
  if (data.app !== undefined && data.app !== 'savora') { out.fatal = 'Diese Datei stammt nicht aus Savora (Feld „app“ passt nicht)'; return out; }
  if (data.version !== undefined && !valIsNum(data.version)) { out.fatal = 'Die Versionsangabe der Sicherung ist ungültig'; return out; }
  if (data.schemaVersion !== undefined && !valIsNum(data.schemaVersion)) { out.fatal = 'Die Versionsangabe der Sicherung ist ungültig'; return out; }
  if (!Array.isArray(data.recipes)) { out.fatal = 'Diese Datei sieht nicht wie eine Savora-Sicherung oder ein geteiltes Rezept aus'; return out; }
  if (data.recipes.length > VAL.MAX_RECIPES) { out.fatal = `Die Sicherung enthält zu viele Rezepte (${data.recipes.length}, erlaubt sind ${VAL.MAX_RECIPES})`; return out; }
  for (const key of ['shopping', 'customFoods', 'nutritionMatches', 'nutritionResults', 'mealplan']) {
    if (data[key] !== undefined && data[key] !== null && !Array.isArray(data[key])) { out.fatal = `Der Teil „${key}“ der Sicherung muss eine Liste sein`; return out; }
  }
  if (data.settings !== undefined && data.settings !== null && !valIsObj(data.settings)) { out.fatal = 'Der Teil „settings“ der Sicherung ist ungültig'; return out; }
  const seenIds = new Set();
  data.recipes.forEach((r, n) => {
    const v = validateRecipe(r);
    const rec = { index: n, label: valLabel(r, n), ok: v.ok, errors: v.errors, warnings: v.warnings, recipe: v.recipe };
    if (v.ok && typeof v.recipe.id === 'string') {
      if (seenIds.has(v.recipe.id)) rec.warnings = rec.warnings.concat(['Die ID kommt in der Sicherung mehrfach vor, dieses Rezept erhält eine neue ID']), rec.dupId = true;
      seenIds.add(v.recipe.id);
    }
    out.recipes.push(rec);
  });
  (Array.isArray(data.shopping) ? data.shopping : []).forEach((s, n) => {
    const errors = [];
    if (!valIsObj(s)) errors.push('Kein Objekt');
    else {
      valText(s.name, 500, 'Name', errors); valText(s.unit, 100, 'Einheit', errors);
      if (typeof s.name !== 'string') errors.push('Name: fehlt');
      if (s.amount !== undefined && s.amount !== null && typeof s.amount !== 'string' && !valIsNum(s.amount)) errors.push('Menge: muss Text oder Zahl sein');
    }
    out.shopping.push({ index: n, label: valIsObj(s) && typeof s.name === 'string' && s.name ? `„${s.name.slice(0, 60)}“` : `Einkauf, Eintrag ${n + 1}`, ok: !errors.length, errors });
  });
  // Teile mit Schluesselfeld: ohne Schluessel schluege der Schreibzugriff mittendrin fehl
  const keyed = [['customFoods', 'id', 'Eigenes Lebensmittel'], ['nutritionMatches', 'normalizedIngredient', 'Gelernte Zuordnung'], ['nutritionResults', 'recipeId', 'Nährwert-Ergebnis']];
  keyed.forEach(([key, field, name]) => {
    (Array.isArray(data[key]) ? data[key] : []).forEach((x, n) => {
      const errors = [];
      if (!valIsObj(x)) errors.push('Kein Objekt');
      else if (typeof x[field] !== 'string' || !x[field]) errors.push(`Feld „${field}“ fehlt oder ist kein Text`);
      out.sections.push({ key, index: n, label: `${name} ${n + 1}`, ok: !errors.length, errors });
    });
  });
  out.problems = [].concat(
    out.recipes.filter(x => !x.ok).map(x => ({ label: x.label, errors: x.errors })),
    out.shopping.filter(x => !x.ok).map(x => ({ label: x.label, errors: x.errors })),
    out.sections.filter(x => !x.ok).map(x => ({ label: x.label, errors: x.errors })));
  return out;
}

/* ---------- Pruefung der Zeitfelder und der Menge im Editor (Audit B06) ----------
   Leer = unbekannt. Ungueltige Angaben werden am Feld erklaert, nichts wird still gerundet, begrenzt oder auf 0/1 gesetzt.
   Gibt die Liste der Fehler zurueck: [{ id, message }] in Feldreihenfolge. */
const FORM_NUMBER_FIELDS = [
  { id: 'f-servings', label: 'Anzahl', min: 1, max: VAL.MAX_SERVINGS, hint: 'Gib eine ganze Zahl ab 1 ein oder lass das Feld leer, wenn die Menge unbekannt ist.' },
  { id: 'f-time', label: 'Gesamtzeit', min: 0, max: VAL.MAX_MINUTES, hint: 'Gib die Minuten als ganze Zahl ab 0 ein oder lass das Feld leer, wenn die Zeit unbekannt ist.' },
  { id: 'f-prep', label: 'Vorbereitung', min: 0, max: VAL.MAX_MINUTES, hint: 'Gib die Minuten als ganze Zahl ab 0 ein oder lass das Feld leer.' },
  { id: 'f-rest', label: 'Ruhen oder Abkühlen', min: 0, max: VAL.MAX_MINUTES, hint: 'Gib die Minuten als ganze Zahl ab 0 ein oder lass das Feld leer.' },
  { id: 'f-cook', label: 'Garen oder Backen', min: 0, max: VAL.MAX_MINUTES, hint: 'Gib die Minuten als ganze Zahl ab 0 ein oder lass das Feld leer.' },
];
/* Reine Pruefung eines Feldtexts. Liefert null (gueltig, auch leer) oder den Fehlertext. */
function formNumberProblem(field, raw, badInput) {
  const s = String(raw == null ? '' : raw).trim();
  if (badInput) return `${field.label}: Das ist keine Zahl. ${field.hint}`;
  if (s === '') return null;
  const n = Number(s);
  if (!isFinite(n)) return `${field.label}: Das ist keine gültige Zahl. ${field.hint}`;
  if (n < 0) return `${field.label}: Negative Werte sind nicht möglich. ${field.hint}`;
  if (!Number.isInteger(n)) return `${field.label}: Es sind nur ganze Zahlen möglich, es wird nichts gerundet. ${field.hint}`;
  if (n < field.min) return `${field.label}: Der Wert muss mindestens ${field.min} sein. ${field.hint}`;
  if (n > field.max) return `${field.label}: Der Wert ist zu gross (höchstens ${field.max}). ${field.hint}`;
  return null;
}
function formNumberErrors(root) {
  const doc = root || document;
  const errs = [];
  FORM_NUMBER_FIELDS.forEach((f) => {
    const el = doc.getElementById(f.id);
    if (!el) return;
    const msg = formNumberProblem(f, el.value, !!(el.validity && el.validity.badInput));
    if (msg) errs.push({ id: f.id, message: msg });
  });
  return errs;
}
/* Zeigt die Fehler an den Feldern (aria-invalid, aria-describedby, Meldung direkt unter dem Feld) und setzt den Fokus auf das
   erste fehlerhafte Feld. Springt dazu bei Bedarf in den Schritt, in dem das Feld liegt. Gibt true zurueck, wenn es Fehler gab. */
function formShowNumberErrors(errs) {
  FORM_NUMBER_FIELDS.forEach((f) => {   // alte Meldungen zuerst entfernen
    const el = document.getElementById(f.id);
    if (el) { el.removeAttribute('aria-invalid'); if (el.getAttribute('aria-describedby') === f.id + '-err') el.removeAttribute('aria-describedby'); }
    const old = document.getElementById(f.id + '-err'); if (old) old.remove();
  });
  if (!errs.length) return false;
  errs.forEach((e) => {
    const el = document.getElementById(e.id);
    if (!el) return;
    el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', e.id + '-err');
    el.insertAdjacentHTML('afterend', `<div class="field-error" id="${e.id}-err" role="alert">${escapeHtml(e.message)}</div>`);
    el.addEventListener('input', () => { el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); const m = document.getElementById(e.id + '-err'); if (m) m.remove(); }, { once: true });
  });
  const first = document.getElementById(errs[0].id);
  if (first) {
    // Schritt wechseln ohne Neuaufbau, damit die eingegebenen Texte und die Meldungen stehen bleiben
    const stepEl = first.closest('[data-form-step]');
    if (stepEl && !stepEl.classList.contains('is-active')) {
      const idx = parseInt(stepEl.getAttribute('data-form-step'), 10) || 0;
      state.formStep = idx;
      document.querySelectorAll('[data-form-step]').forEach(sec => sec.classList.toggle('is-active', sec === stepEl));
      document.querySelectorAll('[data-action="form-goto-step"]').forEach((btn) => {
        const n = parseInt(btn.getAttribute('data-idx'), 10);
        btn.classList.toggle('is-active', n === idx); btn.classList.toggle('is-done', n < idx);
        btn.setAttribute('aria-current', n === idx ? 'step' : 'false');
      });
    }
    const det = first.closest('details'); if (det && !det.open) det.open = true;   // eingeklappte „Weitere Zeitangaben“ aufklappen, sonst laesst sich das Feld nicht fokussieren
    first.focus();
  }
  return true;
}
