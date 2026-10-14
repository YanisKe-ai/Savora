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
            <img class="cbk-thumb" src="${coverThumbUrl(cookbookCoverId(b))}" alt="" width="64" height="91" loading="lazy">
            <div class="cbk-body">
              <h2 class="cbk-name">${name}</h2>
              <p class="cbk-meta">${n} ${n === 1 ? 'Rezept' : 'Rezepte'} · zuletzt bearbeitet am ${escapeHtml(cookbookDateLabel(b.updatedAt))}</p>
              <div class="cbk-actions">
                <button class="outline-btn cbk-open" data-action="cb-open" data-id="${escapeHtml(b.id)}" aria-label="Kochbuch ${name} öffnen und bearbeiten">${ICONS.edit} Bearbeiten</button>
                <button class="text-btn" data-action="cb-rename" data-id="${escapeHtml(b.id)}" aria-label="Kochbuch ${name} umbenennen">Umbenennen</button>
                <button class="text-btn" data-action="cb-duplicate" data-id="${escapeHtml(b.id)}" aria-label="Kochbuch ${name} duplizieren">Duplizieren</button>
                <button class="text-btn text-btn--danger" data-action="cb-delete" data-id="${escapeHtml(b.id)}" aria-label="Kochbuch ${name} löschen" ${only ? 'disabled aria-disabled="true"' : ''}>Löschen</button>
              </div>
            </div>
          </li>`;
        }).join('')}
      </ul>
      ${only ? '<p class="hint-line">Mindestens ein Kochbuch bleibt bestehen. Gelöscht wird immer nur das Kochbuch, nie ein Rezept.</p>' : ''}
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
