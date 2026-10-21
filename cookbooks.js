/* ---------- Kochbuch-Projekte (Paket 37) ----------
   Mehrere gestaltete Kochbuecher statt einer einzigen Konfiguration.

   Speicher: localStorage 'savora-cookbook-projects' = {
     v: 1, activeId, books: [ { id, name, createdAt, updatedAt, config: { ...Kochbuch-Konfiguration wie bisher... }, migration? } ]
   }
   config enthaelt wie bisher items, chapters, chapterPages, title, subtitle, author, showLogo, pdfTemplate, cover.
   getCookbookConfig()/saveCookbookConfig() (recipe-model.js) arbeiten auf dem aktiven Projekt.

   Migration (versioniert, wiederholbar): Fehlt der Schluessel, entsteht das erste Projekt aus der alten Einzelkonfiguration
   (COOKBOOK_CONFIG_KEY, sonst leer) mit dem Namen aus COOKBOOK_TITLE_KEY (sonst «Mein Kochbuch»). Die alten Schluessel werden
   nie veraendert oder geloescht; sie bleiben als Sicherung. Ein vorhandenes, gueltiges Projekt-Objekt wird nie ueberschrieben.
   Rezepte werden von keiner Funktion hier geloescht. Dokumentation: docs/KOCHBUCH-PROJEKTE.md */

const COOKBOOK_PROJECTS_VERSION = 1;
const COOKBOOK_DEFAULT_NAME = 'Mein Kochbuch';
const COOKBOOK_NAME_MAX = 80;
let _cookbookMemoryStore = null;   // nur wenn der Speicher nicht beschreibbar ist (privater Modus, voll)

function cookbookNewId() { return 'cb_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function cookbookCleanName(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, COOKBOOK_NAME_MAX); }

/* ---------- Stil-IDs der Rezeptseiten (pdfTemplate) ----------
   Alte IDs (A Klassisch, B Kraeftig, C Schlicht, leer, unbekannt) werden ueber pdfNormalizeTemplateId (pdf-templates.js) auf
   «pur» oder «prise-pop» abgebildet. Nur das Feld pdfTemplate wird angefasst, nie ein anderes Feld. Idempotent. Fehlt das Feld,
   bleibt es fehlend (dann gilt der Standard). Ohne die Funktion (Zwischenstand) bleibt alles unveraendert. */
let _cookbookTplFixed = false;
function cookbookNormalizeConfigTemplate(cfg) {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg) || !('pdfTemplate' in cfg)) return false;
  if (typeof pdfNormalizeTemplateId !== 'function') return false;
  const n = pdfNormalizeTemplateId(cfg.pdfTemplate);
  if (n === cfg.pdfTemplate) return false;
  cfg.pdfTemplate = n;
  return true;
}
/* Gespeicherter Text (Kochbuch-Projekte oder alte Einzelkonfiguration, z. B. aus der Cloud) mit normalisiertem Stil. Unlesbares bleibt unveraendert. */
function cookbookNormalizeStoreText(text, isStore) {
  if (typeof text !== 'string' || typeof pdfNormalizeTemplateId !== 'function') return text;
  let data; try { data = JSON.parse(text); } catch (e) { return text; }
  let changed = false;
  if (isStore) { if (data && Array.isArray(data.books)) data.books.forEach((b) => { if (b && cookbookNormalizeConfigTemplate(b.config)) changed = true; }); }
  else if (cookbookNormalizeConfigTemplate(data)) changed = true;
  return changed ? JSON.stringify(data) : text;
}

/* Gueltiges Projekt-Objekt oder null (defensiv: auch Daten von anderen Geraeten oder aus Sicherungen) */
function cookbookSanitizeStore(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.books)) return null;
  const seen = new Set();
  const books = [];
  raw.books.forEach((b) => {
    if (!b || typeof b !== 'object' || typeof b.id !== 'string' || !b.id || seen.has(b.id)) return;
    seen.add(b.id);
    if (cookbookNormalizeConfigTemplate(b.config)) _cookbookTplFixed = true;
    const created = Number(b.createdAt) || 0;
    books.push({ ...b, name: cookbookCleanName(b.name) || COOKBOOK_DEFAULT_NAME, createdAt: created, updatedAt: Number(b.updatedAt) || created, config: b.config && typeof b.config === 'object' && !Array.isArray(b.config) ? b.config : {} });
  });
  if (!books.length) return null;
  return { ...raw, v: raw.v || COOKBOOK_PROJECTS_VERSION, activeId: books.some(b => b.id === raw.activeId) ? raw.activeId : books[0].id, books };
}

/* Schreibt ohne Abgleich-Markierung: die Migration ist keine Aenderung der Person und darf einen
   neueren Stand aus der Cloud nicht ueberholen. */
function cookbookWriteUnmarked(store) {
  const text = JSON.stringify(store);
  try {
    if (typeof cloudOrigSetItem === 'function') cloudOrigSetItem.call(localStorage, COOKBOOK_PROJECTS_KEY, text);
    else localStorage.setItem(COOKBOOK_PROJECTS_KEY, text);
    _cookbookMemoryStore = null;
    return true;
  } catch (e) { _cookbookMemoryStore = store; return false; }
}
function cookbookWrite(store) {
  try { localStorage.setItem(COOKBOOK_PROJECTS_KEY, JSON.stringify(store)); _cookbookMemoryStore = null; return true; }
  catch (e) { _cookbookMemoryStore = store; return false; }
}

/* Erste Projekt-Datei aus der alten Einzelkonfiguration. Aendert die alten Schluessel nicht. */
function cookbookMigrate() {
  const legacy = readJsonKey(COOKBOOK_CONFIG_KEY, null);
  let legacyTitle = '';
  try { legacyTitle = localStorage.getItem(COOKBOOK_TITLE_KEY) || ''; } catch (e) { /* ohne Speicher: Standardname */ }
  const now = Date.now();
  const hadConfig = !!(legacy && typeof legacy === 'object');
  const book = {
    id: cookbookNewId(), name: cookbookCleanName(legacyTitle) || COOKBOOK_DEFAULT_NAME, createdAt: now, updatedAt: now,
    config: hadConfig ? JSON.parse(JSON.stringify(legacy)) : {},   // die alte Einzelkonfiguration bleibt unveraendert, die Kopie bekommt die neue Stil-ID
    migration: { v: COOKBOOK_PROJECTS_VERSION, at: new Date(now).toISOString(), source: 'savora-cookbook-config', titleSource: 'savora-cookbook-title', hadConfig },
  };
  cookbookNormalizeConfigTemplate(book.config);
  const store = { v: COOKBOOK_PROJECTS_VERSION, activeId: book.id, books: [book] };
  cookbookWriteUnmarked(store);
  return store;
}

function cookbookStoreRead() {
  let text = null, raw = null;
  try { text = localStorage.getItem(COOKBOOK_PROJECTS_KEY); } catch (e) { text = null; }
  if (text !== null) {
    try { raw = JSON.parse(text); } catch (e) { raw = undefined; }
    _cookbookTplFixed = false;
    const ok = cookbookSanitizeStore(raw);
    if (ok) {
      // alte Stil-ID gefunden: einmal still zurueckschreiben (ohne Abgleich-Markierung, damit ein neuerer Cloud-Stand nicht ueberholt wird)
      if (_cookbookTplFixed) { _cookbookTplFixed = false; cookbookWriteUnmarked(ok); }
      return ok;
    }
    // vorhanden, aber unlesbar: Kopie sichern statt still ueberschreiben, dann neu aus der alten Konfiguration aufbauen
    try { localStorage.setItem(COOKBOOK_PROJECTS_KEY + '-defekt', text); } catch (e) { /* Speicher voll */ }
  }
  if (_cookbookMemoryStore) { const m = cookbookSanitizeStore(_cookbookMemoryStore); if (m) return m; }
  return cookbookMigrate();
}

function cookbookBooks() { return cookbookStoreRead().books; }
function cookbookById(id) { return cookbookBooks().find(b => b.id === id) || null; }
function cookbookActiveBook() { const s = cookbookStoreRead(); return s.books.find(b => b.id === s.activeId) || s.books[0]; }

/* Rohe Konfiguration des aktiven Projekts (kann eine Platzhalter-Konfiguration ohne items sein: dann gilt «alle Rezepte») */
function cookbookGetRaw() { return cookbookActiveBook().config || {}; }
function cookbookSetRaw(cfg, opts) {
  const store = cookbookStoreRead();
  const book = store.books.find(b => b.id === store.activeId) || store.books[0];
  if (JSON.stringify(book.config) === JSON.stringify(cfg)) return;   // keine Aenderung: nichts schreiben, nichts abgleichen
  book.config = cfg;
  if (!opts || opts.touch !== false) book.updatedAt = Date.now();
  cookbookWrite(store);
}

/* Auswahl «alle Rezepte» (Platzhalter ohne items) in eine feste Auswahl umwandeln, z. B. fuer Kopien */
function cookbookMaterialize(config) {
  const c = JSON.parse(JSON.stringify(config || {}));
  if (!Array.isArray(c.items)) c.items = state.recipes.map(r => ({ recipeId: r.id, chapterId: '' }));
  if (!Array.isArray(c.chapters)) c.chapters = [];
  return c;
}
function cookbookRecipeCount(book) {
  const cfg = book && book.config;
  if (!cfg || !Array.isArray(cfg.items)) return state.recipes.length;
  const ids = new Set(state.recipes.map(r => r.id));
  return cfg.items.filter(it => ids.has(it.recipeId)).length;
}
function cookbookCoverId(book) {
  const t = book && book.config && book.config.cover && book.config.cover.templateId;
  return coverValidTemplateId(t);
}

function cookbookNewConfig() {
  return {
    title: '', subtitle: '', author: '', chapters: [], items: [], chapterPages: false,
    pdfTemplate: typeof pdfDefaultTemplateId === 'function' ? pdfDefaultTemplateId() : 'pur',
    cover: { v: COVER_SCHEMA_VERSION, templateId: COVER_DEFAULT_ID, date: coverTodayKey(), showDate: true },   // heutiges Datum einmalig bei NEUEN Projekten
  };
}
function cookbookDefaultNewName() {
  const names = new Set(cookbookBooks().map(b => b.name));
  for (let n = 2; n < 500; n++) { const c = 'Kochbuch ' + n; if (!names.has(c)) return c; }
  return 'Neues Kochbuch';
}
function cookbookCreate(name) {
  const store = cookbookStoreRead();
  const now = Date.now();
  const book = { id: cookbookNewId(), name: cookbookCleanName(name) || cookbookDefaultNewName(), createdAt: now, updatedAt: now, config: cookbookNewConfig() };
  store.books.push(book);
  store.activeId = book.id;
  cookbookWrite(store);
  return book;
}
function cookbookRename(id, name) {
  const clean = cookbookCleanName(name);
  if (!clean) return false;
  const store = cookbookStoreRead();
  const book = store.books.find(b => b.id === id);
  if (!book) return false;
  book.name = clean; book.updatedAt = Date.now();
  cookbookWrite(store);
  return true;
}
function cookbookDuplicate(id) {
  const store = cookbookStoreRead();
  const i = store.books.findIndex(b => b.id === id);
  if (i < 0) return null;
  const src = store.books[i], now = Date.now();
  const copy = { id: cookbookNewId(), name: cookbookCleanName(src.name + ' (Kopie)'), createdAt: now, updatedAt: now, config: cookbookMaterialize(src.config) };
  store.books.splice(i + 1, 0, copy);
  cookbookWrite(store);
  return copy;
}
/* Loescht nur das Projekt (nie Rezepte). Mindestens ein Kochbuch bleibt. */
function cookbookDelete(id) {
  const store = cookbookStoreRead();
  if (store.books.length <= 1 || !store.books.some(b => b.id === id)) return false;
  store.books = store.books.filter(b => b.id !== id);
  if (store.activeId === id) store.activeId = store.books[0].id;
  cookbookWrite(store);
  return true;
}
function cookbookSetActive(id) {
  const store = cookbookStoreRead();
  if (!store.books.some(b => b.id === id)) return false;
  if (store.activeId !== id) { store.activeId = id; cookbookWrite(store); }
  return true;
}

/* ---------- v83: eine gemeinsame PDF-Konfiguration pro Kochbuch ----------
   Alle Optionen stehen in der Konfiguration des Kochbuchs (additiv, optional):
     pdfTemplate  'pur' | 'prise-pop'   (wie bisher; alte IDs werden oben normalisiert)
     pdfNutrition 'off' | 'compact' | 'full'   (NEU; fehlt = Standard: Kompakt, wenn Nährwerte eingeschaltet sind, sonst Aus.
                                               Rezepte ohne berechnete Nährwerte drucken ohnehin keine Box, also gleiches PDF wie bisher)
     author       Name auf Titelblatt und in der Fusszeile (wie bisher; leer = nicht gedruckt). Der frühere Name «nur für dieses PDF»
                  im Exportdialog wurde nie gespeichert; es gibt daher keinen Altwert, der verloren gehen kann.
     printName    'both' | 'cover' | 'footer' | 'none'   (NEU 0.83.1; wo der Name gedruckt wird. Fehlt oder unbekannt = 'both', also wie bisher:
                  Titelblatt und Fusszeile, sofern ein Name eingetragen ist. «Nicht drucken» behaelt den Namen in author, statt ihn zu loeschen.)
   Cover-Editor (Schritt «Gestalten»), Zusammenfassung, Export und Vorschau lesen nur diese Werte. */
const COOKBOOK_NUTRITION_LEVELS = ['off', 'compact', 'full'];
const COOKBOOK_NUTRITION_LABEL = { off: 'Aus', compact: 'Kompakt', full: 'Erweitert' };
function cookbookPdfNutrition(cfg) {
  if (!state.showNutrition) return 'off';
  const v = cfg && cfg.pdfNutrition;
  return COOKBOOK_NUTRITION_LEVELS.includes(v) ? v : 'compact';
}
const COOKBOOK_PRINT_NAME = ['both', 'cover', 'footer', 'none'];
const COOKBOOK_PRINT_NAME_LABEL = { both: 'Titelblatt und Fusszeile', cover: 'Nur Titelblatt', footer: 'Nur Fusszeile', none: 'Nicht drucken' };
function cookbookPrintName(cfg) {
  const v = cfg && cfg.printName;
  return COOKBOOK_PRINT_NAME.includes(v) ? v : 'both';
}
function cookbookPdfTemplate(cfg) {
  const id = (cfg && cfg.pdfTemplate) || (typeof pdfDefaultTemplateId === 'function' ? pdfDefaultTemplateId() : 'pur');
  return typeof pdfNormTpl === 'function' ? pdfNormTpl(id) : id;
}
function cookbookPdfTemplateName(id) { return (typeof PDF_TEMPLATES !== 'undefined' && PDF_TEMPLATES[id] && PDF_TEMPLATES[id].name) || id; }
/* Optionen fuer den Export (gleiche Werte wie in «Gestalten»). author bleibt weg: pdf.js nimmt cfg.author. */
function cookbookExportOptions(cfg) {
  return { template: cookbookPdfTemplate(cfg), nutritionDetail: cookbookPdfNutrition(cfg) };
}

/* ---------- v83: Zusammenfassung und Prüfhinweise ---------- */
function cookbookPlural(n, one, many) { return `${n} ${n === 1 ? one : many}`; }
/* Kapitel, die tatsaechlich Rezepte enthalten; leere Kapitel bleiben erhalten, werden im PDF aber ausgelassen */
function cookbookSummary(cfg) {
  const ids = new Set(state.recipes.map(r => r.id));
  const items = (cfg.items || []).filter(it => ids.has(it.recipeId));
  const chapters = cfg.chapters || [];
  const used = chapters.filter(c => items.some(it => it.chapterId === c.id));
  const empty = chapters.filter(c => !items.some(it => it.chapterId === c.id));
  const loose = items.filter(it => !it.chapterId || !chapters.some(c => c.id === it.chapterId)).length;
  let text = cookbookPlural(items.length, 'Rezept', 'Rezepte');
  if (used.length) text += ` in ${used.length} ${used.length === 1 ? 'verwendetem Kapitel' : 'verwendeten Kapiteln'}`;
  if (used.length && loose) text += `, ${loose} ohne Kapitel`;
  return { recipes: items.length, used, empty, loose, text };
}
function cookbookEmptyChaptersText(n) { return n === 1 ? '1 leeres Kapitel wird im PDF ausgelassen.' : `${n} leere Kapitel werden im PDF ausgelassen.`; }

/* Ergebnis des letzten Kochbuch-PDFs (nur im Speicher): echte Seitenzahlen pro Rezept.
   Quelle: zuerst blob.recipePages des angezeigten PDFs, dann `pdfLastPageCounts` (Map recipeId -> tatsaechliche Seiten) und `pdfLastPlan`.
   Nur als Rueckfall (aelterer Stand ohne diese Schnittstelle): blob.planLog, sonst blob.recipeStart. */
function cookbookPageCountsFromBlob(blob, cfg) {
  const out = {};
  // 1) Seiten genau dieses PDFs (pdf.js: blob.recipePages), passt sicher zur angezeigten Datei
  try {
    if (blob && blob.recipePages && typeof blob.recipePages.forEach === 'function') {
      blob.recipePages.forEach((n, id) => { if (n > 0) out[id] = n; });
      if (Object.keys(out).length) return out;
    }
  } catch (e) { /* Rueckfall unten */ }
  try {
    const planOk = typeof pdfLastPlan === 'undefined' || !pdfLastPlan || pdfLastPlan.kind === 'cookbook';
    if (planOk && typeof pdfLastPageCounts !== 'undefined' && pdfLastPageCounts && typeof pdfLastPageCounts.forEach === 'function') {
      pdfLastPageCounts.forEach((n, id) => { if (n > 0) out[id] = n; });
      if (Object.keys(out).length) return out;
    }
  } catch (e) { /* Rueckfall unten */ }
  const recipes = cookbookOrderedSections(cfg).flatMap(s => s.recipes);
  const logs = blob && Array.isArray(blob.planLog) ? blob.planLog : null;
  if (logs && logs.length === recipes.length) {
    recipes.forEach((r, i) => { const n = parseInt(String((logs[i] && logs[i].plan) || ''), 10); if (n > 0) out[r.id] = n; });
    if (Object.keys(out).length === recipes.length) return out;
  }
  const starts = blob && blob.recipeStart;
  if (starts && !cfg.chapterPages) {
    recipes.forEach((r, i) => { const a = starts[r.id], next = i + 1 < recipes.length ? starts[recipes[i + 1].id] : (blob.pageCount || 0) + 1; if (a > 0 && next > a) out[r.id] = next - a; });
  }
  return out;
}
function cookbookRememberBuild(blob, template) {
  const cfg = getCookbookConfig();
  state.cookbookLastBuild = { bookId: cookbookActiveBook().id, template, pageCount: (blob && blob.pageCount) || 0, pages: cookbookPageCountsFromBlob(blob, cfg), at: Date.now() };
}
function cookbookLastBuildFor(bookId) { const b = state.cookbookLastBuild; return b && b.bookId === bookId ? b : null; }

/* Prüfhinweise: { level: 'error'|'check'|'info', text, target: { action, id?, label } }.
   Fehler zuerst, dann «Prüfen», dann Informationen. Cover-Hinweise stammen aus cover-model.js (coverLayout().warnings) und werden nur angezeigt. */
const COOKBOOK_LEVEL_RANK = { error: 0, check: 1, info: 2 };
function cookbookReview(cfg) {
  const out = [];
  const byId = Object.fromEntries(state.recipes.map(r => [r.id, r]));
  const recipeTarget = (r) => ({ action: 'open-recipe', id: r.id, label: 'Rezept prüfen' });
  const coverTarget = { action: 'cb-step', id: '2', label: 'Cover bearbeiten' };
  const chapterTarget = { action: 'cb-step', id: '1', label: 'Kapitel bearbeiten' };
  if (!cfg.items.length) out.push({ level: 'error', text: 'Es ist noch kein Rezept ausgewählt.', target: { action: 'cb-step', id: '1', label: 'Rezepte auswählen' } });
  if (typeof coverLayout === 'function' && cfg.cover) {
    try {
      coverLayout(coverInputFromConfig(cfg)).warnings.forEach((w) => {
        if (!w || !w.message) return;
        out.push({ level: (!w.kind || w.kind === 'cut' || w.kind === 'outside') ? 'error' : 'check', kind: 'cover', text: 'Titelblatt: ' + w.message, target: coverTarget });
      });
    } catch (e) { /* Cover-Pruefung nicht verfuegbar */ }
  }
  if (cfg.items.length > 40) out.push({ level: 'check', text: `Ein Kochbuch mit ${cfg.items.length} Rezepten dauert beim Erstellen einige Minuten und braucht viel Speicher auf deinem Gerät. Teile es bei Bedarf in mehrere Kochbücher auf.`, target: { action: 'cb-step', id: '1', label: 'Rezepte auswählen' } });
  // v85: ein Eintrag pro Rezept (Gründe zusammengefasst), kurze Texte; Reihenfolge wie im PDF
  const noPhoto = [];
  const ordered = typeof cookbookItemGroups === 'function' ? cookbookItemGroups(cfg).flatMap(g => g.items) : cfg.items;
  ordered.forEach((it) => {
    const r = byId[it.recipeId]; if (!r) return;
    const t = r.title || 'Ohne Titel';
    const reasons = [];
    if (!realIngredients(r).length) reasons.push('Keine Zutaten');
    if (!(r.steps || []).some(s => (s.text || '').trim())) reasons.push('Keine Zubereitung');
    const q = typeof recipeQualityIssues === 'function' ? recipeQualityIssues(r).length : 0;
    if (q) reasons.push(q === 1 ? '1 Hinweis zur Qualität' : `${q} Hinweise zur Qualität`);
    if (reasons.length) out.push({ level: 'check', kind: 'recipe', name: t, reasons, text: `${t}: ${reasons.join(', ')}`, target: recipeTarget(r) });
    if (!r.image && !r.imageId) noPhoto.push(r);
  });
  const tn = (r) => r.title || 'Ohne Titel';
  if (noPhoto.length) out.push({ level: 'info', kind: 'no-photo', text: noPhoto.length === 1 ? `«${tn(noPhoto[0])}» hat kein Foto.` : `${noPhoto.length} Rezepte ohne Foto: ${noPhoto.map(tn).join(', ')}.`, target: noPhoto.length === 1 ? recipeTarget(noPhoto[0]) : null });
  if (cfg.coverRecipeId) {
    const r = byId[cfg.coverRecipeId];
    if (!r || (!r.image && !r.imageId)) out.push({ level: 'check', text: 'Das gewählte Titelbild ist nicht mehr verfügbar.', target: coverTarget });
  }
  // leere Kapitel: EIN Hinweis (Details aufklappbar in der Ansicht), nicht einer pro Kapitel
  const sum = cookbookSummary(cfg);
  if (sum.empty.length) out.push({ level: 'info', kind: 'empty-chapters', text: cookbookEmptyChaptersText(sum.empty.length), names: sum.empty.map(c => c.name), target: chapterTarget });
  return out.map((h, i) => ({ ...h, i })).sort((a, b) => (COOKBOOK_LEVEL_RANK[a.level] - COOKBOOK_LEVEL_RANK[b.level]) || a.i - b.i);
}

/* ---------- v83: Coverminiaturen in der Übersicht ----------
   Gleiche Zeichenfunktion wie Editor und PDF (coverLayout + coverRenderCanvas), klein gerendert und im Speicher zwischengespeichert:
   neu gezeichnet wird nur, wenn sich Titel, Texte oder Cover des Buchs geaendert haben. Fehler: Vorlagenbild als Platzhalter. */
const _cookbookThumbCache = new Map();   // bookId -> { sig, url } | { sig, failed: true }
function cookbookThumbInput(book) {
  const raw = (book && book.config) || {};
  const cover = typeof coverSanitizeConfig === 'function' ? coverSanitizeConfig(raw.cover, false) : raw.cover;
  return coverInputFromConfig({ ...raw, cover });
}
function cookbookThumbSig(book) { try { return JSON.stringify(cookbookThumbInput(book)); } catch (e) { return ''; } }
function cookbookThumbHtml(b) {
  const sig = cookbookThumbSig(b), hit = _cookbookThumbCache.get(b.id);
  const ready = hit && hit.sig === sig && hit.url;
  const src = ready ? hit.url : coverThumbUrl(cookbookCoverId(b));
  return `<img class="cbk-thumb ${ready ? 'is-rendered' : 'is-placeholder'}" src="${escapeAttr(src)}" alt="" width="64" height="91" data-cbk-thumb="${escapeAttr(b.id)}">`;
}
let _cookbookThumbRun = 0;
async function cookbookBindThumbs() {
  const imgs = Array.from(document.querySelectorAll('img[data-cbk-thumb].is-placeholder'));
  if (!imgs.length || typeof coverRenderCanvas !== 'function') return;
  const run = ++_cookbookThumbRun;
  for (const img of imgs) {
    const b = cookbookById(img.dataset.cbkThumb); if (!b) continue;
    const sig = cookbookThumbSig(b), hit = _cookbookThumbCache.get(b.id);
    if (hit && hit.sig === sig && hit.failed) continue;   // gleicher Stand ist schon einmal gescheitert: Platzhalter behalten
    try {
      const layout = coverLayout(cookbookThumbInput(b));
      const bg = layout.background ? await coverBackgroundDataUrl(layout.templateId) : null;
      const c = await coverRenderCanvas(layout, 0.25, bg);
      const url = c.toDataURL('image/jpeg', 0.85);
      _cookbookThumbCache.set(b.id, { sig, url });
      if (run !== _cookbookThumbRun) return;
      document.querySelectorAll(`img[data-cbk-thumb="${cssAttr(b.id)}"]`).forEach((el) => { el.src = url; el.classList.remove('is-placeholder'); el.classList.add('is-rendered'); });
    } catch (e) {
      _cookbookThumbCache.set(b.id, { sig, failed: true });
      document.querySelectorAll(`img[data-cbk-thumb="${cssAttr(b.id)}"]`).forEach((el) => el.classList.add('is-fallback'));
    }
  }
}

/* ---------- Ansicht «Kochbücher» ---------- */
function cookbookDateLabel(ts) {
  if (!ts) return '';
  try { return new Date(ts).toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return ''; }
}
function cookbooksView() {
  const store = cookbookStoreRead();
  const only = store.books.length <= 1;
  return `
    ${topbar('Kochbücher')}
    <main class="has-tabbar cookbooks-main">
      ${pageTitle('Kochbücher', `<button class="primary-btn cbk-new" data-action="cb-new">${ICONS.plus} Neues Kochbuch</button>`)}
      <ul class="cbk-list" aria-label="Deine Kochbücher">
        ${store.books.map((b) => {
          const n = cookbookRecipeCount(b);
          const name = escapeHtml(b.name);
          return `<li class="cbk-card" data-book="${escapeHtml(b.id)}">
            ${cookbookThumbHtml(b)}
            <div class="cbk-body">
              <h2 class="cbk-name">${name}</h2>
              <p class="cbk-meta">${n} ${n === 1 ? 'Rezept' : 'Rezepte'}</p>
              ${b.updatedAt ? `<p class="cbk-date">Zuletzt bearbeitet am ${escapeHtml(cookbookDateLabel(b.updatedAt))}</p>` : ''}
              <div class="cbk-actions">
                <button type="button" class="outline-btn cbk-open" data-action="cb-open" data-id="${escapeHtml(b.id)}" aria-label="Kochbuch ${name} öffnen und bearbeiten">${ICONS.edit} Öffnen</button>
                <button type="button" class="icon-btn cbk-more" data-action="cb-menu" data-id="${escapeHtml(b.id)}" aria-haspopup="dialog" aria-label="Weitere Aktionen für ${name}">${ICONS.moreH || ICONS.more}</button>
              </div>
            </div>
          </li>`;
        }).join('')}
      </ul>
      ${only ? '<p class="hint-line">Das letzte Kochbuch kann nicht gelöscht werden. Beim Löschen bleiben deine Rezepte erhalten.</p>' : ''}
    </main>
    ${bottomNav()}
    ${cookbookModals()}`;
}

function cookbookModals() {
  const m = state.modal;
  if (!m) return '';
  if (m.type === 'cb-name') {
    const isNew = m.mode === 'new';
    return sheet('cb-name-title', isNew ? 'Neues Kochbuch' : 'Kochbuch umbenennen', `
      <div class="field"><label for="cbNameInput">Name des Kochbuchs</label>
        <input type="text" id="cbNameInput" maxlength="${COOKBOOK_NAME_MAX}" autocomplete="off" value="${escapeHtml(m.value || '')}" placeholder="${isNew ? 'z. B. Familienrezepte' : ''}" ${m.error ? 'aria-invalid="true" aria-describedby="cbNameError"' : ''}>
        ${m.error ? `<p class="field-error" id="cbNameError" role="alert">${escapeHtml(m.error)}</p>` : ''}
        <p class="hint-line">Der Name hilft dir, deine Kochbücher zu unterscheiden. Er wird nicht gedruckt. Titel, Untertitel und Name auf dem Titelblatt legst du später fest.</p>
      </div>
      <div class="form-actions">
        <button class="ghost-btn" data-action="close-modal">Abbrechen</button>
        <button class="primary-btn" data-action="cb-name-save">${isNew ? 'Anlegen' : 'Speichern'}</button>
      </div>`);
  }
  if (m.type === 'cb-menu') {
    const b = cookbookById(m.id);
    if (!b) return '';
    const only = cookbookBooks().length <= 1;
    const id = escapeAttr(b.id);
    return sheet('cb-menu-title', b.name, `
      <div class="menu-list">
        <button type="button" class="menu-item" data-action="cb-rename" data-id="${id}">${ICONS.edit}<span>Umbenennen</span></button>
        <button type="button" class="menu-item" data-action="cb-duplicate" data-id="${id}">${ICONS.copy}<span>Duplizieren</span></button>
        <button type="button" class="menu-item menu-item--danger" data-action="cb-delete" data-id="${id}" ${only ? 'disabled aria-disabled="true" aria-describedby="cbMenuOnly"' : ''}>${ICONS.trash}<span>Löschen</span></button>
      </div>
      ${only ? '<p class="hint-line" id="cbMenuOnly">Das letzte Kochbuch kann nicht gelöscht werden. Beim Löschen bleiben deine Rezepte erhalten.</p>' : ''}
      <div class="form-actions"><button type="button" class="ghost-btn" data-action="close-modal">Schliessen</button></div>`);
  }
  if (m.type === 'cb-delete') {
    const b = cookbookById(m.id);
    if (!b) return '';
    return sheet('cb-delete-title', 'Kochbuch löschen?', `
      <p>Das Kochbuch «${escapeHtml(b.name)}» mit seiner Auswahl, Reihenfolge und Gestaltung wird gelöscht. Deine Rezepte bleiben alle erhalten.</p>
      <div class="form-actions">
        <button class="ghost-btn" data-action="close-modal">Abbrechen</button>
        <button class="primary-btn danger-btn-fill" data-action="cb-delete-confirm" data-id="${escapeHtml(b.id)}">Kochbuch löschen</button>
      </div>`);
  }
  return '';
}

/* ---------- v85: Kochbuch-Assistent, Schritt 1 nach Kapiteln (Reihenfolge = PDF-Reihenfolge) ----------
   Gleiche Regel wie cookbookOrderedSections (recipe-model.js): Kapitel in ihrer Reihenfolge, Rezepte ohne oder mit
   unbekanntem Kapitel am Schluss. Ohne Kapitel gibt es genau eine Gruppe (chapter null). Datenmodell unveraendert. */
function cookbookItemChapterKnown(cfg, it) { return !!it.chapterId && (cfg.chapters || []).some(c => c.id === it.chapterId); }
function cookbookItemGroups(cfg) {
  const items = cfg.items || [];
  const groups = (cfg.chapters || []).map(c => ({ chapter: c, items: items.filter(it => it.chapterId === c.id) }));
  const loose = items.filter(it => !cookbookItemChapterKnown(cfg, it));
  if (loose.length) groups.push({ chapter: null, items: loose });
  return groups.filter(g => g.items.length);
}
/* Gruppe eines Rezepts und Platz darin: { group, k, n, pos, total, chapterName } (pos ueber alle Gruppen, 1 bis total) */
function cookbookItemPlace(cfg, recipeId) {
  let pos = 0;
  const groups = cookbookItemGroups(cfg);
  const total = groups.reduce((a, g) => a + g.items.length, 0);
  for (const g of groups) {
    const k = g.items.findIndex(it => it.recipeId === recipeId);
    if (k >= 0) return { group: g, k, n: g.items.length, pos: pos + k + 1, total, chapterName: g.chapter ? (g.chapter.name || 'Ohne Namen') : ((cfg.chapters || []).length ? 'Ohne Kapitel' : '') };
    pos += g.items.length;
  }
  return null;
}
/* Satz «Platz 2 von 3 in «Hauptgänge»» bzw. «Platz 2 von 7» */
function cookbookPlaceText(p) {
  if (!p) return '';
  return p.chapterName ? `Platz ${p.k + 1} von ${p.n} in «${p.chapterName}»` : `Platz ${p.k + 1} von ${p.n}`;
}
/* Verschiebt ein Rezept innerhalb seiner Gruppe (delta -1/1 oder to 'first'/'last'). Gibt true zurueck, wenn sich etwas geaendert hat. */
function cookbookMoveItemInGroup(cfg, recipeId, delta, to) {
  const p = cookbookItemPlace(cfg, recipeId);
  if (!p) return false;
  const g = p.group.items, it = g[p.k];
  if (to === 'first' || to === 'last') {
    if ((to === 'first' && p.k === 0) || (to === 'last' && p.k === g.length - 1)) return false;
    const anchor = to === 'first' ? g[0] : g[g.length - 1];
    cfg.items.splice(cfg.items.indexOf(it), 1);
    const ai = cfg.items.indexOf(anchor);
    cfg.items.splice(to === 'first' ? ai : ai + 1, 0, it);
    return true;
  }
  const k2 = p.k + delta;
  if (!delta || k2 < 0 || k2 >= g.length) return false;
  const a = cfg.items.indexOf(it), b = cfg.items.indexOf(g[k2]);
  [cfg.items[a], cfg.items[b]] = [cfg.items[b], cfg.items[a]];
  return true;
}
/* Kapitel wechseln: das Rezept kommt ans Ende seiner neuen Gruppe (ans Ende von items; andere Gruppen behalten ihre Reihenfolge) */
function cookbookSetItemChapter(cfg, recipeId, chapterId) {
  const i = cfg.items.findIndex(x => x.recipeId === recipeId);
  if (i < 0) return false;
  const it = cfg.items[i];
  const next = chapterId && (cfg.chapters || []).some(c => c.id === chapterId) ? chapterId : '';
  if ((cookbookItemChapterKnown(cfg, it) ? it.chapterId : '') === next) return false;
  it.chapterId = next;
  cfg.items.splice(i, 1); cfg.items.push(it);
  return true;
}
function cookbookChapterCountText(n) { return n === 0 ? 'leer' : n === 1 ? '1 Rezept' : `${n} Rezepte`; }

/* Fenster im Kochbuch-Editor: Menue einer Rezeptzeile und Menue eines Kapitels */
function cookbookEditorModals() {
  const m = state.modal;
  if (!m || state.view !== 'cookbook') return '';
  if (m.type === 'cb-item-menu') {
    const cfg = getCookbookConfig();
    const r = state.recipes.find(x => x.id === m.id);
    const p = cookbookItemPlace(cfg, m.id);
    if (!r || !p) return '';
    const it = p.group.items[p.k];
    const cur = cookbookItemChapterKnown(cfg, it) ? it.chapterId : '';
    const t = r.title || 'Ohne Titel';
    const id = escapeAttr(r.id);
    const radio = (val, label) => `<label class="check-line cb-radio"><input type="radio" name="cbItemChapter" data-cb-item-chapter="${id}" value="${escapeAttr(val)}" ${cur === val ? 'checked' : ''}> <span>${escapeHtml(label)}</span></label>`;
    const chapters = cfg.chapters.length
      ? `<h3 class="cb-menu-label" id="cbItemChLabel">Kapitel</h3>
        <div class="cb-menu-radios" role="radiogroup" aria-labelledby="cbItemChLabel">${cfg.chapters.map(c => radio(c.id, c.name || 'Ohne Namen')).join('')}${radio('', 'Ohne Kapitel')}</div>`
      : '<p class="hint-line">Kapitel legst du unten unter «Kapitel» an.</p>';
    return sheet('cb-item-menu-title', t, `
      <p class="hint-line cb-menu-sub">${escapeHtml(cookbookPlaceText(p))}</p>
      ${chapters}
      <div class="menu-list cb-menu-actions">
        <button type="button" class="menu-item" data-action="cb-move-item" data-id="${id}" data-to="first" ${p.k === 0 ? 'disabled' : ''}>${ICONS.arrowUp}<span>Ganz nach oben</span></button>
        <button type="button" class="menu-item" data-action="cb-move-item" data-id="${id}" data-to="last" ${p.k === p.n - 1 ? 'disabled' : ''}>${ICONS.arrowDown}<span>Ganz nach unten</span></button>
        <button type="button" class="menu-item menu-item--danger menu-item--hint" data-action="cb-remove-item" data-id="${id}">${ICONS.x}<span class="menu-item-text"><span>Aus dem Kochbuch nehmen</span><span class="menu-item-hint">Das Rezept selbst bleibt erhalten.</span></span></button>
      </div>
      <div class="form-actions"><button type="button" class="ghost-btn" data-action="close-modal">Schliessen</button></div>`);
  }
  if (m.type === 'cb-chapter-menu') {
    const cfg = getCookbookConfig();
    const i = cfg.chapters.findIndex(c => c.id === m.id);
    if (i < 0) return '';
    const c = cfg.chapters[i];
    const n = cfg.items.filter(it => it.chapterId === c.id).length;
    const id = escapeAttr(c.id);
    const name = c.name || 'Ohne Namen';
    return sheet('cb-chapter-menu-title', name, `
      <p class="hint-line cb-menu-sub">Kapitel ${i + 1} von ${cfg.chapters.length}, ${cookbookChapterCountText(n)}</p>
      <div class="menu-list cb-menu-actions">
        <button type="button" class="menu-item" data-action="cb-chapter-rename" data-id="${id}">${ICONS.edit}<span>Umbenennen</span></button>
        <button type="button" class="menu-item" data-action="cb-move-chapter" data-id="${id}" data-delta="-1" ${i === 0 ? 'disabled' : ''}>${ICONS.arrowUp}<span>Nach oben</span></button>
        <button type="button" class="menu-item" data-action="cb-move-chapter" data-id="${id}" data-delta="1" ${i === cfg.chapters.length - 1 ? 'disabled' : ''}>${ICONS.arrowDown}<span>Nach unten</span></button>
        <button type="button" class="menu-item menu-item--danger menu-item--hint" data-action="cb-delete-chapter" data-id="${id}">${ICONS.trash}<span class="menu-item-text"><span>Kapitel löschen</span><span class="menu-item-hint">${n === 0 ? 'Das Kapitel ist leer.' : n === 1 ? 'Das Rezept bleibt im Kochbuch, dann ohne Kapitel.' : `Die ${n} Rezepte bleiben im Kochbuch, dann ohne Kapitel.`}</span></span></button>
      </div>
      <div class="form-actions"><button type="button" class="ghost-btn" data-action="close-modal">Schliessen</button></div>`);
  }
  return '';
}
