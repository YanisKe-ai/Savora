/* ---------- Cover-Editor: Oberflaeche fuer den Schritt «Gestalten» (Paket C3) ----------
   Geladen NACH cover.js und cover-model.js. Datenform und Layout: siehe Kopf von cover-model.js (feste Schnittstelle).

   Aufbau
   - ce            : Zustand der Oberflaeche im Speicher (Entwurf des Titelblatts, Texte, Auswahl, Undo-Stapel, Speicherstatus).
                     Der Entwurf bleibt in der Oberflaeche, auch wenn das Speichern scheitert.
   - Speicherung   : Entwurf = cfg.cover (v 2) plus cfg.title/subtitle/author/showLogo. Autospeichern 600 ms nach der letzten Eingabe
                     ueber cookbookSetRaw. Ein Titelblatt wird erst zu v 2, wenn die Person etwas aendert (kein stilles Hochstufen).
   - Texte         : cfg.title/subtitle/author bleiben die Quelle (kein Duplikat in fields.*.text). Nur «Weitere Textzeile» (extra1)
                     liegt in fields.extra1.text.
   - Vorschau      : Canvas (coverDraw, dieselbe Funktion wie im Export) und eine transparente Bedienebene darueber (nur hier, nie im Export).
   - Zeigen        : touch-action: none liegt nur auf den Griffen des ausgewaehlten Felds; Scrollen ueber der Vorschau verschiebt nie etwas.
   - Bilder        : coverImageImport / coverImageLoad / coverImageRemove (cover-image.js, Paket C4), mit typeof-Schutz. */

const CE_LABEL = { title: 'Kochbuchtitel', subtitle: 'Untertitel', name: 'Name', date: 'Veröffentlichungsdatum', extra1: 'Weitere Textzeile' };
const CE_SHORT = { title: 'Titel', subtitle: 'Untertitel', name: 'Name', date: 'Datum', extra1: 'Textzeile' };
const CE_FIELD_ORDER = ['title', 'subtitle', 'name', 'date', 'extra1'];
const CE_COLORS = [['Papier', '#F7F4EE'], ['Tomate', '#B93B2C'], ['Salbei', '#9CB59A'], ['Nachtgrün', '#22382F'], ['Tinte', '#252720'], ['Butter', '#F2D98A'], ['Lavendel', '#C3B6E2'], ['Weiss', '#FFFFFF']];
const CE_SAFE_X = 12 / 210, CE_SAFE_Y = 12 / 297;   // sicherer Rand: 12 mm auf A4
const CE_SNAP = 0.015;
const CE_UNDO_MAX = 50;
const CE_SAVE_MS = 600;
const CE_PT_RANGE = { title: [18, 140], subtitle: [7, 60], name: [7, 48], date: [6, 36], extra1: [7, 48] };
const CE_ALIGN_LABEL = { left: 'Linksbündig', center: 'Zentriert', right: 'Rechtsbündig' };
const CE_READ = [['none', 'Ohne Hintergrund'], ['panel', 'Dezente Textfläche'], ['gradient', 'Verlauf hinter dem Text']];
const CE_ICON = {
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
  redo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
  move: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18M3 12h18M12 3 9 6M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/></svg>',
  width: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 7 3 12l5 5M16 7l5 5-5 5M3 12h18"/></svg>',
  alignleft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h13"/></svg>',
  aligncenter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M5.5 18h13"/></svg>',
  alignright: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M10 12h10M7 18h13"/></svg>',
};

const ce = {
  bookId: null, model: null, texts: null, coverDirty: false, savedSig: '',
  tab: null, sel: null, imgMove: false, imgBusy: false, imgError: '',
  undo: [], redo: [], lastKey: '', lastT: 0,
  status: 'saved', saveTimer: 0, saveError: false,
  layout: null, drag: null, paintTok: 0, paintQueued: false, bgCache: {}, imgCache: {}, pendingRemove: new Set(),
};

/* ---------- Hilfen ---------- */
function ceClone(o) { return JSON.parse(JSON.stringify(o)); }
function ceClamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
function ceRound(v, d) { const k = Math.pow(10, d == null ? 4 : d); return Math.round(v * k) / k; }
function ceEsc(s) { return escapeHtml(String(s == null ? '' : s)); }
function ceF(id) { return (ce.model && ce.model.fields && ce.model.fields[id]) || {}; }
function ceTextOf(id) { return id === 'extra1' ? (ceF('extra1').text || '') : id === 'title' ? ce.texts.title : id === 'subtitle' ? ce.texts.subtitle : id === 'name' ? ce.texts.author : ''; }
function ceFieldOptional(id) { return id !== 'title'; }

/* ---------- Zustand laden, Aenderungen von aussen erkennen ---------- */
function ceStoredSig() {
  const raw = cookbookGetRaw(), cfg = getCookbookConfig();
  return JSON.stringify([raw.cover || null, cfg.title || '', cfg.subtitle || '', cfg.author || '', cfg.showLogo !== false]);
}
function ceLoadFromStore() {
  const raw = cookbookGetRaw(), cfg = getCookbookConfig();
  ce.model = coverModelFromLegacy(raw);
  if (!ce.model.date && cfg.cover && cfg.cover.date) ce.model.date = cfg.cover.date;
  ce.texts = { title: cfg.title || '', subtitle: cfg.subtitle || '', author: cfg.author || '', showLogo: cfg.showLogo !== false };
  ce.coverDirty = false;
  ce.savedSig = ceStoredSig();
}
function ceEnsure() {
  const book = cookbookActiveBook();
  if (ce.bookId !== book.id) {
    ceFlushImages();
    clearTimeout(ce.saveTimer);
    Object.assign(ce, { bookId: book.id, model: null, undo: [], redo: [], sel: null, tab: null, imgMove: false, imgError: '', status: 'saved', saveError: false, lastKey: '', layout: null });
  }
  // Entwurf nur dann neu laden, wenn nichts Ungespeichertes in der Oberflaeche steht und der Speicher von aussen geaendert wurde
  if (!ce.model || (!ce.saveTimer && !ce.saveError && ce.savedSig !== ceStoredSig())) ceLoadFromStore();
  if (!ce.tab || (ce.model.mode !== 'custom' && ce.tab === 'bg')) ce.tab = ce.model.mode === 'custom' ? 'bg' : 'text';
  return ce;
}
function ceInput() {
  const cover = { ...ceClone(ce.model), v: 2 };
  return coverInputFromConfig({ title: ce.texts.title, subtitle: ce.texts.subtitle, author: ce.texts.author, showLogo: ce.texts.showLogo, cover });
}
function ceRelayout() {
  try { ce.layout = coverLayout(ceInput()); } catch (e) { /* letztes gueltiges Layout behalten */ }
  return ce.layout;
}
function ceBlockOf(id) {
  const L = ce.layout; if (!L) return null;
  return (L.blocks || []).find(b => (b.id || (b.key === 'slogan' ? 'subtitle' : b.key)) === id) || null;
}
function ceBoxes() {
  const L = ce.layout, out = {}; if (!L) return out;
  (L.blocks || []).forEach((b) => { const id = b.id || (b.key === 'slogan' ? 'subtitle' : b.key); out[id] = { x: b.x, y: b.y, w: b.w, h: Math.max(b.h || 0, 0.02) }; });
  const d = L.date;
  if (d) {
    const w = d.tw || d.w || Math.min(0.4, 0.014 * (d.text || '').length + 0.02), h = Math.max(d.h || 0.03, 0.02);
    const ax = d.ax != null ? d.ax : d.x1, al = d.align || 'right';
    out.date = { x: al === 'right' ? ax - w : al === 'center' ? ax - w / 2 : ax, y: d.y, w, h };
  }
  return out;
}
function ceEff(id) {
  const f = ceF(id), b = ceBlockOf(id), box = ceBoxes()[id], D = COVER_FIELD_DEFAULTS[id] || {}, d = ce.layout && ce.layout.date;
  const pt = f.fontPt != null ? f.fontPt : (id === 'date' ? (d ? d.sizePx * 0.75 : D.fontPt) : b && b.sizePt != null ? b.sizePt : b ? b.sizePx * 0.75 : D.fontPt);
  return {
    fontPt: ceRound(pt, 1),
    color: f.color || (id === 'date' ? d && d.ink : b && b.ink) || D.color,
    align: f.align || (id === 'date' ? d && d.align : b && b.align) || D.align,
    w: f.w != null ? f.w : box ? ceRound(box.w) : D.w,
    x: f.x != null ? f.x : box ? box.x : D.x, y: f.y != null ? f.y : box ? box.y : (D.y || 0.2),
    font: f.font || D.font,
  };
}

/* ---------- Undo / Redo ---------- */
function ceSnap() { return JSON.stringify({ m: ce.model, t: ce.texts, d: ce.coverDirty }); }
function ceCheckpoint(key) {
  const now = Date.now();
  if (key && ce.lastKey === key && now - ce.lastT < 1000) { ce.lastT = now; return; }
  ce.undo.push(ceSnap()); if (ce.undo.length > CE_UNDO_MAX) ce.undo.shift();
  ce.redo = []; ce.lastKey = key || ''; ce.lastT = now;
  ceUpdateHistoryButtons();
}
function ceRestore(snap) {
  const s = JSON.parse(snap); ce.model = coverModelSanitize(s.m); ce.texts = s.t; ce.coverDirty = true;
  ce.lastKey = ''; ceRelayout(); ceRenderAll(); ceScheduleSave(true);
}
function ceUndo() { if (!ce.undo.length) return; ce.redo.push(ceSnap()); ceRestore(ce.undo.pop()); }
function ceRedo() { if (!ce.redo.length) return; ce.undo.push(ceSnap()); ceRestore(ce.redo.pop()); }
function ceUpdateHistoryButtons() {
  const u = document.querySelector('[data-ce="undo"]'), r = document.querySelector('[data-ce="redo"]');
  if (u) u.disabled = !ce.undo.length; if (r) r.disabled = !ce.redo.length;
}

/* ---------- Aendern und Speichern ---------- */
function ceChange(fn, o) {
  o = o || {};
  ceCheckpoint(o.key);
  const m = ceClone(ce.model); fn(m);
  ce.model = coverModelSanitize(m); ce.coverDirty = true;
  ceAfterChange(o);
}
function ceAfterChange(o) {
  o = o || {};
  ceRelayout(); ceSyncOverlay(); cePaintSoon(); ceRenderWarnings();
  if (o.panels) ceRenderPanels();
  if (o.tabs) ceRenderTabs();
  ceScheduleSave(o.now);
}
function ceSetStatus(s) {
  ce.status = s;
  document.querySelectorAll('.ce-status-text').forEach((el) => {
    el.textContent = s === 'saving' ? 'Wird gespeichert …' : s === 'error' ? 'Speichern nicht möglich – erneut versuchen' : 'Gespeichert';
    el.closest('.ce-status').dataset.state = s;
  });
  document.querySelectorAll('[data-ce="retry"]').forEach(b => { b.hidden = s !== 'error'; });
}
function ceScheduleSave(now) {
  clearTimeout(ce.saveTimer);
  ceSetStatus('saving');
  if (now) { ce.saveTimer = 0; ceSaveNow(); return; }
  ce.saveTimer = setTimeout(() => { ce.saveTimer = 0; ceSaveNow(); }, CE_SAVE_MS);
}
function ceStoredCover() {
  const raw = cookbookGetRaw().cover, m = ce.model;
  if (!ce.coverDirty) return raw;
  if (coverModelIsPlainTemplate(m) && !(raw && raw.v === 2)) return { v: 1, templateId: m.templateId, date: m.date, showDate: m.showDate };
  return { ...ceClone(m), v: 2 };
}
function ceSaveNow() {
  clearTimeout(ce.saveTimer); ce.saveTimer = 0;
  if (!ce.model) return true;
  try {
    const raw = cookbookGetRaw(), next = { ...raw, title: ce.texts.title.trim(), subtitle: ce.texts.subtitle.trim(), author: ce.texts.author.trim() };
    if (ce.texts.showLogo === false) next.showLogo = false; else if ('showLogo' in next) next.showLogo = true;
    const cv = ceStoredCover(); if (cv) next.cover = cv;
    cookbookSetRaw(next);
    if (typeof _cookbookMemoryStore !== 'undefined' && _cookbookMemoryStore) throw new Error('Speicher nicht beschreibbar');
    ce.saveError = false; ce.savedSig = ceStoredSig(); ceSetStatus('saved');
    return true;
  } catch (e) {
    ce.saveError = true; ceSetStatus('error');
    return false;
  }
}
function ceFlush() { if (ce.saveTimer) ceSaveNow(); }
/* Bilder werden hier nie geloescht (Undo koennte die Referenz zurueckholen); Aufraeumen macht das manuelle coverImageGc() (cover-image.js). */
function ceFlushImages() { /* bewusst leer */ }

/* ---------- Texte (cfg.title / subtitle / author) ---------- */
function ceSetText(key, value, final) {
  const v = final ? value.trim() : value;
  if (ce.texts[key] === v) return;
  ceCheckpoint('text:' + key);
  ce.texts[key] = v;
  ceAfterChange({ now: !!final });
}

/* ---------- HTML ---------- */
function ceSwatches(kind, current, f) {
  const cur = String(current || '').toUpperCase();
  const known = CE_COLORS.some(c => c[1] === cur);
  return `<div class="ce-swatches" role="radiogroup" aria-label="${kind === 'bg' ? 'Hintergrundfarbe' : 'Textfarbe'}">${CE_COLORS.map(([n, h]) => `<button type="button" class="ce-swatch ${cur === h ? 'is-on' : ''}" role="radio" aria-checked="${cur === h}" style="--sw:${h}" data-ce="color" data-kind="${kind}" data-f="${f || ''}" data-v="${h}" data-k="sw-${kind}-${f || ''}-${h.slice(1)}" aria-label="${n}"><span class="ce-swatch-dot"></span></button>`).join('')}
    <label class="ce-swatch ce-swatch--own ${!known && cur ? 'is-on' : ''}" aria-label="Eigene Farbe wählen"><span class="ce-swatch-dot" style="--sw:${known || !cur ? '#FFFFFF' : cur}">${known || !cur ? '+' : ''}</span><input type="color" value="${cur && /^#[0-9A-F]{6}$/.test(cur) ? cur : '#FFFFFF'}" data-ce-input="color" data-kind="${kind}" data-f="${f || ''}" data-k="own-${kind}-${f || ''}" aria-label="Eigene Farbe"></label></div>`;
}
function ceSeg(items, cur, attrs, label) {
  return `<div class="ce-seg" role="group" aria-label="${ceEsc(label)}">${items.map(([v, t, aria]) => `<button type="button" class="ce-segbtn" aria-pressed="${cur === v}" ${attrs} data-v="${v}" data-k="${(attrs.match(/data-ce="(\w+)"/) || [])[1]}-${v}" ${aria ? `aria-label="${ceEsc(aria)}"` : ''}>${t}</button>`).join('')}</div>`;
}
function ceWarnItems(ids) {
  const ws = ((ce.layout && ce.layout.warnings) || []).filter(w => ids.includes(w.fieldId || w.key));
  if (!ws.length) return '';
  return `<ul class="ce-warns" role="status">${ws.map((w) => {
    const id = w.fieldId || (w.key === 'slogan' ? 'subtitle' : w.key), isText = CE_FIELD_ORDER.includes(id) && id !== 'date';
    const fix = isText && (w.kind === 'cut' || w.kind === 'outside') ? `<span class="ce-warn-btns"><button type="button" class="ce-chip" data-ce="w-shorten" data-f="${id}" data-k="ws-${id}">Text kürzen</button><button type="button" class="ce-chip" data-ce="w-shrink" data-f="${id}" data-k="wf-${id}">Schrift verkleinern</button><button type="button" class="ce-chip" data-ce="w-widen" data-f="${id}" data-k="ww-${id}">Textfeld verbreitern</button></span>`
      : w.kind === 'unreadable' && ce.model.readability !== 'panel' ? `<span class="ce-warn-btns"><button type="button" class="ce-chip" data-ce="readability" data-v="panel" data-k="wr-${id}">Textfläche einschalten</button></span>` : '';
    return `<li class="ce-warn ce-warn--${ceEsc(w.kind)}"><span class="ce-warn-msg">${ceEsc(w.message)}</span>${fix}</li>`;
  }).join('')}</ul>`;
}
function ceRange(prop, id, label, min, max, step, val, unit, withStep) {
  const o = `${ceRound(val, 1)} ${unit}`;
  return `<div class="ce-ctl"><label class="ce-lab" for="ce-${prop}-${id}">${label}</label><div class="ce-range">${withStep ? `<button type="button" class="ce-step" data-ce="step" data-f="${id}" data-d="-1" data-k="${prop}-m-${id}" aria-label="${label} verkleinern">A−</button>` : ''}<input type="range" id="ce-${prop}-${id}" data-ce-input="${prop}" data-f="${id}" data-k="${prop}-r-${id}" min="${min}" max="${max}" step="${step}" value="${ceClamp(val, min, max)}">${withStep ? `<button type="button" class="ce-step" data-ce="step" data-f="${id}" data-d="1" data-k="${prop}-p-${id}" aria-label="${label} vergrössern">A+</button>` : ''}<output class="ce-out" for="ce-${prop}-${id}">${o}</output></div></div>`;
}
function cePositionBlock(id) {
  const e = ceEff(id), pos = ['Oben links', 'Oben mittig', 'Oben rechts', 'Mitte links', 'Mitte', 'Mitte rechts', 'Unten links', 'Unten mittig', 'Unten rechts'];
  return `<div class="ce-ctl"><span class="ce-lab" id="cepos-${id}">Position</span>
    <div class="ce-posrow">
      <div class="ce-grid3" role="group" aria-labelledby="cepos-${id}">${pos.map((p, i) => `<button type="button" class="ce-cell" data-ce="place" data-f="${id}" data-c="${i % 3}" data-r="${Math.floor(i / 3)}" data-k="pl-${id}-${i}" aria-label="${CE_SHORT[id]}: ${p.toLowerCase()}"><span></span></button>`).join('')}</div>
      <div class="ce-dpad" role="group" aria-label="${CE_SHORT[id]} verschieben">
        <button type="button" class="ce-nudge ce-nudge--u" data-ce="nudge" data-f="${id}" data-dx="0" data-dy="-1" data-k="nu-${id}" aria-label="${CE_SHORT[id]} nach oben (Umschalt: grösserer Schritt)">${CE_ICON.up}</button>
        <button type="button" class="ce-nudge ce-nudge--l" data-ce="nudge" data-f="${id}" data-dx="-1" data-dy="0" data-k="nl-${id}" aria-label="${CE_SHORT[id]} nach links (Umschalt: grösserer Schritt)">${CE_ICON.left}</button>
        <button type="button" class="ce-nudge ce-nudge--r" data-ce="nudge" data-f="${id}" data-dx="1" data-dy="0" data-k="nr-${id}" aria-label="${CE_SHORT[id]} nach rechts (Umschalt: grösserer Schritt)">${CE_ICON.right}</button>
        <button type="button" class="ce-nudge ce-nudge--d" data-ce="nudge" data-f="${id}" data-dx="0" data-dy="1" data-k="nd-${id}" aria-label="${CE_SHORT[id]} nach unten (Umschalt: grösserer Schritt)">${CE_ICON.down}</button>
      </div>
    </div>
    <details class="ce-exact"><summary data-k="ex-${id}">Genau einstellen</summary>
      <div class="ce-exact-row"><label>Von links in %<input type="number" inputmode="decimal" step="0.5" min="-50" max="150" data-ce-input="x" data-f="${id}" data-k="x-${id}" value="${ceRound(e.x * 100, 1)}"></label>
      <label>Von oben in %<input type="number" inputmode="decimal" step="0.5" min="-50" max="150" data-ce-input="y" data-f="${id}" data-k="y-${id}" value="${ceRound(e.y * 100, 1)}"></label></div>
    </details></div>`;
}
function ceFieldControls(id) {
  const e = ceEff(id), rg = CE_PT_RANGE[id];
  return `<div class="ce-fbody">
    <div class="ce-actions"><button type="button" class="ce-chip ce-chip--solid" data-ce="edit" data-f="${id}" data-k="edit-${id}">Text bearbeiten</button>${id === 'extra1' && ceTextOf('extra1') ? `<button type="button" class="ce-chip" data-ce="clear-extra" data-k="clear-extra">Zeile entfernen</button>` : ''}</div>
    ${ceRange('fontPt', id, 'Schriftgrösse', rg[0], rg[1], 0.5, e.fontPt, 'pt', true)}
    <div class="ce-ctl"><span class="ce-lab">Textfarbe</span>${ceSwatches('text', e.color, id)}</div>
    <div class="ce-ctl"><span class="ce-lab">Ausrichtung</span>${ceSeg([['left', CE_ICON.alignleft, CE_ALIGN_LABEL.left], ['center', CE_ICON.aligncenter, CE_ALIGN_LABEL.center], ['right', CE_ICON.alignright, CE_ALIGN_LABEL.right]], e.align, `data-ce="align" data-f="${id}"`, 'Ausrichtung')}</div>
    ${id === 'date' ? '' : ceRange('w', id, 'Breite', 10, 100, 1, e.w * 100, '%', false)}
    ${id === 'title' ? `<div class="ce-ctl"><span class="ce-lab" id="cefont">Titelschrift</span><div class="ce-fonts" role="radiogroup" aria-labelledby="cefont">${COVER_TITLE_FONT_NAMES.map(n => `<button type="button" class="ce-font" role="radio" aria-checked="${e.font === n}" data-ce="font" data-v="${ceEsc(n)}" data-k="font-${n.replace(/\W/g, '')}" style="font-family:${COVER_FONT_TABLE[n].family};font-weight:${COVER_FONT_TABLE[n].weight}">${n.replace(' Extra Condensed', '')}</button>`).join('')}</div></div>` : ''}
    ${cePositionBlock(id)}
    <div class="ce-actions"><button type="button" class="ce-chip" data-ce="field-reset" data-f="${id}" data-k="fr-${id}">${CE_SHORT[id]} zurücksetzen</button></div>
  </div>`;
}
function ceFieldCard(id) {
  const sel = ce.sel === id, inputId = id === 'title' ? 'cbTitle' : id === 'subtitle' ? 'cbSubtitle' : id === 'name' ? 'cbAuthor' : id === 'date' ? 'cbDate' : 'cbExtra1';
  let input;
  if (id === 'date') {
    input = `<div class="ce-datebox"><input type="date" id="cbDate" data-cb-cover-date value="${ceEsc(ce.model.date || '')}"><label class="check-row"><input type="checkbox" data-cb-cover-flag="showDate" ${ce.model.showDate === false ? '' : 'checked'}> <span>Datum auf dem Titelblatt zeigen</span></label></div>`;
  } else if (id === 'extra1') {
    input = `<input type="text" id="cbExtra1" data-ce-input="extra1" maxlength="200" value="${ceEsc(ceF('extra1').text || '')}" autocomplete="off" placeholder="z. B. Für meine Familie">`;
  } else {
    const dk = id === 'name' ? 'author' : id;
    input = `<input type="text" id="${inputId}" data-cb-field="${dk}" value="${ceEsc(ceTextOf(id))}" autocomplete="off">`;
  }
  const hint = id === 'title' && !ce.texts.title.trim() ? '<p class="ce-hint">Ohne Titel bleibt das Titelblatt leer.</p>' : '';
  return `<div class="ce-field ${sel ? 'is-sel' : ''}" data-f="${id}">
    <div class="ce-fhead"><label for="${inputId}">${CE_LABEL[id]}</label><button type="button" class="ce-chip ${sel ? 'is-on' : ''}" data-ce="select" data-f="${id}" data-k="sel-${id}" aria-pressed="${sel}" aria-label="${CE_LABEL[id]} auf dem Titelblatt gestalten">${sel ? 'Ausgewählt' : 'Gestalten'}</button></div>
    ${input}${hint}${ceWarnItems([id])}
    ${sel ? ceFieldControls(id) : ''}
  </div>`;
}
function ceTextTab() {
  return `<div class="ce-sec">${CE_FIELD_ORDER.map(ceFieldCard).join('')}
    <p class="ce-hint">Was leer bleibt, wird nicht gedruckt. Der Name erscheint auch in der Fusszeile der Rezeptseiten.</p></div>`;
}
function ceBgTab() {
  const m = ce.model, im = m.image;
  const color = `<div class="ce-sec"><h3 class="ce-h">Farbe</h3>${ceSwatches('bg', m.bg.color, '')}</div>`;
  const choose = typeof coverImageImport === 'function';
  const imgHtml = `<div class="ce-sec"><h3 class="ce-h">Bild</h3>
    <input type="file" class="ce-file" data-ce-file accept="image/jpeg,image/png,image/webp" tabindex="-1" aria-hidden="true">
    ${im ? `<div class="ce-actions"><button type="button" class="ce-chip ce-chip--solid" data-ce="pick" data-k="pick" ${ce.imgBusy ? 'disabled' : ''}>Bild ersetzen</button><button type="button" class="ce-chip" data-ce="img-remove" data-k="img-remove">Bild entfernen</button></div>`
      : `<div class="ce-actions"><button type="button" class="ce-chip ce-chip--solid" data-ce="pick" data-k="pick" ${ce.imgBusy || !choose ? 'disabled' : ''}>${ce.imgBusy ? 'Bild wird geladen …' : 'Bild wählen'}</button></div>`}
    ${typeof coverImageSyncNote === 'function' && coverImageSyncNote() ? `<p class="ce-hint">${ceEsc(coverImageSyncNote())}</p>` : ''}
    <p class="ce-error" role="alert" ${ce.imgError ? '' : 'hidden'}>${ceEsc(ce.imgError)}</p>
    <p class="ce-hint">JPEG, PNG oder WebP. HEIC-Fotos vom iPhone werden nicht unterstützt: Speichere sie vorher als JPEG. Das Bild bleibt auf diesem Gerät und wird nicht an Dritte gesendet.</p>
    ${im ? `<div class="ce-ctl"><span class="ce-lab">Darstellung</span>${ceSeg([['contain', 'Ganzes Bild anzeigen'], ['cover', 'Cover ausfüllen']], im.fit, 'data-ce="fit"', 'Darstellung des Bildes')}</div>
    <p class="ce-hint">${im.fit === 'cover' ? 'Das Bild füllt das Titelblatt, der Rand wird beschnitten. Wähle den Ausschnitt mit Zoom und Verschieben.' : 'Das ganze Bild bleibt sichtbar, freie Ränder zeigen die Hintergrundfarbe.'}</p>
    <div class="ce-ctl"><label class="ce-lab" for="ce-zoom">Ausschnitt vergrössern</label><div class="ce-range"><input type="range" id="ce-zoom" data-ce-input="zoom" data-k="zoom" min="${im.fit === 'cover' ? 1 : 0.3}" max="${im.fit === 'cover' ? 8 : 1}" step="0.01" value="${im.zoom}"><output class="ce-out" for="ce-zoom">${Math.round(im.zoom * 100)} %</output></div></div>
    <div class="ce-actions"><button type="button" class="ce-chip ${ce.imgMove ? 'is-on' : ''}" data-ce="img-move" data-k="img-move" aria-pressed="${ce.imgMove}">Im Bild verschieben</button><button type="button" class="ce-chip" data-ce="img-reset" data-k="img-reset">Ausschnitt zurücksetzen</button></div>
    ${ce.imgMove ? `<div class="ce-dpad ce-dpad--solo" role="group" aria-label="Bild verschieben">${['u', 'l', 'r', 'd'].map(d => `<button type="button" class="ce-nudge ce-nudge--${d}" data-ce="img-nudge" data-dx="${d === 'l' ? -1 : d === 'r' ? 1 : 0}" data-dy="${d === 'u' ? -1 : d === 'd' ? 1 : 0}" data-k="in-${d}" aria-label="Bild ${{ u: 'nach oben', d: 'nach unten', l: 'nach links', r: 'nach rechts' }[d]}">${CE_ICON[{ u: 'up', d: 'down', l: 'left', r: 'right' }[d]]}</button>`).join('')}</div>` : ''}
    ${ceWarnItems(['image'])}` : ''}
  </div>`;
  return color + imgHtml;
}
function ceArrTab() {
  const m = ce.model;
  const arr = `<div class="ce-sec"><h3 class="ce-h">Anordnung der Texte</h3>
    <div class="ce-arr" role="group" aria-label="Anordnung der Texte">${COVER_ARRANGEMENTS.map(a => `<button type="button" class="ce-segbtn ce-arrbtn" data-ce="arrange" data-v="${ceEsc(a)}" data-k="arr-${a.replace(/\W/g, '')}" aria-pressed="${m.arrange === a}">${a}</button>`).join('')}</div>
    <p class="ce-hint">Setzt Titel, Untertitel und Name als Block. Texte und Farben bleiben, Schritt rückgängig machbar.</p></div>`;
  const logo = `<div class="ce-sec"><h3 class="ce-h">Savora-Logo</h3>
    <label class="check-row"><input type="checkbox" data-cb-flag="showLogo" ${ce.texts.showLogo === false ? '' : 'checked'}> <span>Savora-Wortmarke auf dem Titelblatt zeigen</span></label>
    <div class="ce-ctl"><span class="ce-lab">Position</span>${ceSeg([['top-right', 'Oben rechts'], ['top-left', 'Oben links'], ['bottom-right', 'Unten rechts']], m.logo.pos, 'data-ce="logo-pos"', 'Position des Logos')}</div>
    <div class="ce-ctl"><span class="ce-lab">Farbe des Logos</span>${ceSeg([['auto', 'Automatisch'], ['light', 'Hell'], ['dark', 'Dunkel']], m.logo.variant, 'data-ce="logo-var"', 'Farbe des Logos')}</div>
    <p class="ce-hint">Die Wortmarke ist eine Grafik und lässt sich nicht als Text ändern.</p>${ceWarnItems(['logo'])}</div>`;
  const read = `<div class="ce-sec"><h3 class="ce-h">Lesbarkeit</h3>${ceSeg(CE_READ, m.readability, 'data-ce="readability"', 'Lesbarkeit des Textes')}
    <p class="ce-hint">Hilft bei Fotos. Bei einfarbigem Hintergrund prüft Savora den Kontrast, bei Fotos kann das nicht garantiert werden.</p></div>`;
  const reset = `<div class="ce-sec ce-sec--reset"><h3 class="ce-h">Zurücksetzen</h3><div class="ce-actions"><button type="button" class="ce-chip" data-ce="arr-reset" data-k="arr-reset">Anordnung zurücksetzen</button><button type="button" class="ce-chip ce-chip--danger" data-ce="cover-reset" data-k="cover-reset">Cover zurücksetzen</button></div>
    <p class="ce-hint">«Anordnung zurücksetzen» entfernt nur Positionen und Breiten. Texte, Farben und Hintergrund bleiben.</p></div>`;
  return arr + logo + read + reset;
}
function ceTabs() {
  const tabs = ce.model.mode === 'custom' ? [['bg', 'Hintergrund'], ['text', 'Texte'], ['arr', 'Anordnung']] : [['text', 'Texte'], ['arr', 'Anordnung']];
  return `<div class="ce-tabs" role="tablist" aria-label="Bereiche des Titelblatts">${tabs.map(([k, t]) => `<button type="button" role="tab" class="ce-tab ${ce.tab === k ? 'is-on' : ''}" id="cetab-${k}" aria-selected="${ce.tab === k}" aria-controls="cepanel" tabindex="${ce.tab === k ? 0 : -1}" data-ce="tab" data-v="${k}" data-k="tab-${k}">${t}</button>`).join('')}</div>`;
}
function cePanelInner() { return ce.tab === 'bg' ? ceBgTab() : ce.tab === 'arr' ? ceArrTab() : ceTextTab(); }
function ceTemplateGrid() {
  const cur = coverValidTemplateId(ce.model.templateId);
  return `<div class="ce-sec"><h3 class="ce-h" id="cegridt">Motiv</h3><div class="cover-grid" role="radiogroup" aria-label="Titelblatt wählen">${COVER_TEMPLATES.map(t => `<button type="button" class="cover-opt ${t.id === cur ? 'is-active' : ''}" role="radio" aria-checked="${t.id === cur}" data-ce="template" data-id="${escapeAttr(t.id)}" aria-label="${escapeHtml(t.name)}"><img src="${coverThumbUrl(t.id)}" alt="" loading="lazy" width="130" height="185"><span class="cover-opt-name">${escapeHtml(t.name)}</span>${t.id === cur ? `<span class="cover-opt-check" aria-hidden="true">${ICONS.check}</span>` : ''}</button>`).join('')}</div></div>`;
}
function ceWarnSummary() {
  const ws = ((ce.layout && ce.layout.warnings) || []);
  if (!ws.length) return '';
  const id = ws[0].fieldId || (ws[0].key === 'slogan' ? 'subtitle' : ws[0].key);
  return `<button type="button" class="ce-warnbar" data-ce="goto-warn" data-f="${ceEsc(id)}" data-k="warnbar"><span class="ce-warnbar-n">${ws.length}</span> ${ws.length === 1 ? 'Hinweis zum Titelblatt' : 'Hinweise zum Titelblatt'}: ${ceEsc(ws[0].message)}</button>`;
}
function ceEditorHtml() {
  ceEnsure(); ceRelayout();
  const custom = ce.model.mode === 'custom';
  return `<div class="cover-picker ce" data-mode="${ce.model.mode}">
    <div class="ce-mode" role="group" aria-label="Art des Titelblatts">
      <button type="button" class="ce-modebtn" data-ce="mode" data-v="template" data-k="mode-template" aria-pressed="${!custom}">Vorlagen</button>
      <button type="button" class="ce-modebtn" data-ce="mode" data-v="custom" data-k="mode-custom" aria-pressed="${custom}">Eigenes Cover</button>
    </div>
    <div class="ce-body">
      <div class="ce-stage">
        <div class="ce-preview" aria-label="Vorschau des Titelblatts"><canvas class="ce-canvas" width="794" height="1123" role="img" aria-label="Vorschau des Titelblatts"></canvas><div class="ce-overlay"></div></div>
        <div class="ce-bar">
          <button type="button" class="ce-icon" data-ce="undo" data-k="undo" aria-label="Rückgängig" ${ce.undo.length ? '' : 'disabled'}>${CE_ICON.undo}</button>
          <button type="button" class="ce-icon" data-ce="redo" data-k="redo" aria-label="Wiederholen" ${ce.redo.length ? '' : 'disabled'}>${CE_ICON.redo}</button>
          <div class="ce-status" data-state="${ce.status}" role="status" aria-live="polite"><span class="ce-status-text">${ce.status === 'saving' ? 'Wird gespeichert …' : ce.status === 'error' ? 'Speichern nicht möglich – erneut versuchen' : 'Gespeichert'}</span><button type="button" class="ce-chip" data-ce="retry" data-k="retry" ${ce.status === 'error' ? '' : 'hidden'}>Erneut versuchen</button></div>
        </div>
        <div class="ce-warnslot">${ceWarnSummary()}</div>
      </div>
      <div class="ce-side">
        ${custom ? '' : ceTemplateGrid()}
        <div class="ce-tabswrap">${ceTabs()}</div>
        <div class="ce-panels" id="cepanel" role="tabpanel">${cePanelInner()}</div>
      </div>
    </div>
  </div>`;
}
function ceModalHtml() {
  const m = state.modal;
  if (!m || m.type !== 'ce-reset') return '';
  return sheet('ce-reset-title', 'Cover zurücksetzen?', `
    <p>Das Titelblatt geht zurück auf die Vorlage ohne eigene Anpassungen. Das wird entfernt: eigene Hintergrundfarbe und eigenes Bild, Positionen, Grössen, Farben und Schriften der Texte, die weitere Textzeile, Logo-Einstellungen und Lesbarkeitsfläche.</p>
    <p>Bleiben: Titel, Untertitel, Name und Datum sowie alle Rezepte und der Inhalt des Kochbuchs.</p>
    <div class="form-actions"><button class="ghost-btn" data-action="close-modal">Abbrechen</button><button class="primary-btn danger-btn-fill" data-action="ce-reset-confirm">Cover zurücksetzen</button></div>`);
}

/* ---------- Teilweise neu zeichnen (Fokus und Scrollposition bleiben) ---------- */
function ceRoot() { return document.querySelector('.cover-picker.ce'); }
function ceFocusKey() { const a = document.activeElement; return a && a.closest && a.closest('.ce-side') && a.dataset ? (a.dataset.k || a.id || '') : ''; }
function ceRestoreFocus(key) {
  if (!key) return;
  const root = ceRoot(); if (!root) return;
  let el = null; root.querySelectorAll('.ce-side [data-k], .ce-side [id]').forEach((n) => { if (!el && (n.dataset.k === key || n.id === key)) el = n; });
  if (el && !el.disabled && !el.hidden) el.focus({ preventScroll: true });
}
function ceRenderPanels() {
  const p = document.getElementById('cepanel'); if (!p) return;
  const key = ceFocusKey(), y = window.scrollY, ps = p.scrollTop;
  const openEx = !!p.querySelector('details[open]');
  p.innerHTML = cePanelInner();
  if (openEx) { const d = p.querySelector('.ce-exact'); if (d) d.open = true; }
  p.scrollTop = ps; ceRestoreFocus(key);
  if (Math.abs(window.scrollY - y) > 0) window.scrollTo(0, y);
}
function ceRenderTabs() {
  const w = document.querySelector('.ce-tabswrap'); if (!w) return;
  const key = ceFocusKey(); w.innerHTML = ceTabs(); ceRestoreFocus(key);
}
function ceRenderWarnings() {
  const slot = document.querySelector('.ce-warnslot'); if (slot) slot.innerHTML = ceWarnSummary();
  // Hinweise an den Feldern aktualisieren, ohne Eingaben neu zu zeichnen
  document.querySelectorAll('.ce-field').forEach((card) => {
    const id = card.dataset.f, old = card.querySelector(':scope > .ce-warns'), html = ceWarnItems([id]);
    const sig = html.replace(/\s+/g, '');
    if ((old ? old.outerHTML.replace(/\s+/g, '') : '') === sig) return;
    const tmp = document.createElement('div'); tmp.innerHTML = html;
    if (old) old.remove();
    if (tmp.firstElementChild) { const anchor = card.querySelector('input[type=text], .ce-datebox, input[type=date]'); (anchor ? anchor.closest('.ce-datebox') || anchor : card.firstElementChild).after(tmp.firstElementChild); }
  });
  document.querySelectorAll('.ce-overlay [data-fr]').forEach((fr) => { fr.classList.toggle('is-warn', ceHasWarn(fr.dataset.fr)); });
  ceSetScrollPad();
}
function ceHasWarn(id) { return ((ce.layout && ce.layout.warnings) || []).some(w => (w.fieldId || (w.key === 'slogan' ? 'subtitle' : w.key)) === id && (w.kind === 'cut' || w.kind === 'outside' || w.kind === 'overlap')); }
function ceRenderAll() {
  const root = ceRoot(); if (!root) return;
  const key = ceFocusKey();
  const mode = root.querySelector('.ce-mode');
  mode.querySelectorAll('.ce-modebtn').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.v === 'custom') === (ce.model.mode === 'custom'))));
  root.dataset.mode = ce.model.mode;
  const side = root.querySelector('.ce-side'), grid = side.querySelector('.cover-grid');
  if (ce.model.mode === 'custom' && grid) grid.closest('.ce-sec').remove();
  if (ce.model.mode !== 'custom' && !grid) { const tmp = document.createElement('div'); tmp.innerHTML = ceTemplateGrid(); side.prepend(tmp.firstElementChild); }
  else if (grid) { const cur = coverValidTemplateId(ce.model.templateId); grid.querySelectorAll('.cover-opt').forEach((b) => { const on = b.dataset.id === cur; b.classList.toggle('is-active', on); b.setAttribute('aria-checked', String(on)); const chk = b.querySelector('.cover-opt-check'); if (on && !chk) b.insertAdjacentHTML('beforeend', `<span class="cover-opt-check" aria-hidden="true">${ICONS.check}</span>`); if (!on && chk) chk.remove(); }); }
  ceRenderTabs(); ceRenderPanels(); ceRenderWarnings(); ceSyncOverlay(); cePaintSoon(); ceUpdateHistoryButtons(); ceSetStatus(ce.status);
  ceRestoreFocus(key);
}

/* ---------- Vorschau: Canvas ---------- */
function cePaintSoon() { if (ce.paintQueued) return; ce.paintQueued = true; requestAnimationFrame(() => { ce.paintQueued = false; cePaint(); }); }
function ceLoadBg(url) {
  if (!ce.bgCache[url]) ce.bgCache[url] = coverLoadImage(url).catch(() => null);
  return ce.bgCache[url];
}
async function ceUserImage(id) {
  if (ce.imgCache[id]) return ce.imgCache[id];
  if (typeof coverImageLoad !== 'function') return null;
  try { const d = await coverImageLoad(id); if (d) ce.imgCache[id] = d; return d || null; } catch (e) { return null; }
}
async function cePaint() {
  const tok = ++ce.paintTok, cv = document.querySelector('canvas.ce-canvas'), L = ce.layout;
  if (!cv || !L) return;
  try { await coverEnsureFonts(); } catch (e) { /* weiter mit Ersatzschrift */ }
  const bg = L.background ? await ceLoadBg(L.background) : null;
  const user = L.image ? await ceUserImage(L.image.id) : null;
  if (tok !== ce.paintTok || !cv.isConnected) return;
  const scale = ceClamp((cv.clientWidth || 320) * (window.devicePixelRatio || 1) / COVER_PAGE.w, 0.5, 2);
  const w = Math.round(L.page.w * scale), h = Math.round(L.page.h * scale);
  if (cv.width !== w) cv.width = w; if (cv.height !== h) cv.height = h;
  coverDraw(cv.getContext('2d'), L, bg, scale, user);
}

/* ---------- Bedienebene ueber der Vorschau ---------- */
function ceOverlay() { return document.querySelector('.ce-overlay'); }
function ceSyncOverlay() {
  const ov = ceOverlay(); if (!ov) return;
  const boxes = ceBoxes();
  const pct = (v) => (v * 100).toFixed(3) + '%';
  const want = new Set();
  // Hilfslinien (nur beim Ziehen sichtbar)
  if (!ov.querySelector('.ce-guides')) {
    ov.insertAdjacentHTML('afterbegin', `<div class="ce-guides" aria-hidden="true"><i class="ce-g ce-g--v" data-g="vc"></i><i class="ce-g ce-g--h" data-g="hc"></i><i class="ce-safe"></i></div><div class="ce-imgpad" data-imgpad hidden></div>`);
    const safe = ov.querySelector('.ce-safe'); safe.style.cssText = `left:${pct(CE_SAFE_X)};right:${pct(CE_SAFE_X)};top:${pct(CE_SAFE_Y)};bottom:${pct(CE_SAFE_Y)}`;
  }
  ov.classList.toggle('is-imgmove', !!ce.imgMove);
  ov.querySelector('[data-imgpad]').hidden = !ce.imgMove;
  CE_FIELD_ORDER.forEach((id) => {
    const b = boxes[id];
    let hit = ov.querySelector(`[data-hit="${id}"]`), fr = ov.querySelector(`[data-fr="${id}"]`);
    if (!b || ce.imgMove) { if (hit) hit.remove(); if (fr) fr.remove(); return; }
    want.add(id);
    const st = `left:${pct(b.x)};top:${pct(b.y)};width:${pct(b.w)};height:${pct(b.h)}`;
    if (ce.sel === id) {
      if (hit) hit.remove();
      if (!fr) {
        ov.insertAdjacentHTML('beforeend', `<div class="ce-frame" data-fr="${id}" tabindex="0" role="group" aria-label="${CE_LABEL[id]}, ausgewählt. Mit den Pfeiltasten verschieben, mit Umschalt in grösseren Schritten. Escape hebt die Auswahl auf."><span class="ce-tag">${CE_SHORT[id]}</span><button type="button" class="ce-grip ce-grip--move" data-grip="move" data-k="grip-move" tabindex="-1" aria-label="${CE_SHORT[id]} verschieben">${CE_ICON.move}</button><button type="button" class="ce-grip ce-grip--w" data-grip="width" data-k="grip-w" tabindex="-1" aria-label="Breite von ${CE_SHORT[id]} ändern">${CE_ICON.width}</button></div>`);
        fr = ov.querySelector(`[data-fr="${id}"]`);
      }
      fr.style.cssText = st; fr.classList.toggle('is-warn', ceHasWarn(id));
      fr.dataset.align = ceEff(id).align;
    } else {
      if (fr) fr.remove();
      if (!hit) { ov.insertAdjacentHTML('afterbegin', `<div class="ce-hit" data-hit="${id}" aria-hidden="true"></div>`); hit = ov.querySelector(`[data-hit="${id}"]`); }
      hit.style.cssText = st;
    }
  });
  ov.querySelectorAll('[data-hit],[data-fr]').forEach((n) => { if (!want.has(n.dataset.hit || n.dataset.fr)) n.remove(); });
}
function ceSelect(id, opts) {
  opts = opts || {};
  ce.sel = id; ce.imgMove = false;
  if (id && ce.tab !== 'text') { ce.tab = 'text'; ceRenderTabs(); }
  ceSyncOverlay(); ceRenderPanels();
  if (id && opts.focusFrame) { const fr = document.querySelector(`.ce-frame[data-fr="${id}"]`); if (fr) fr.focus({ preventScroll: true }); }
}

/* ---------- Ziehen ---------- */
function ceSnapPos(box, drag) {
  const g = { vc: false, hc: false };
  let { x, y } = box; const { w, h } = box;
  const nearX = [[x + w / 2, 0.5, -w / 2, 'vc'], [x, CE_SAFE_X, 0, ''], [x + w, 1 - CE_SAFE_X, -w, '']];
  for (const [cur, target, off, gd] of nearX) if (Math.abs(cur - target) < CE_SNAP) { x = target + off; if (gd) g[gd] = true; break; }
  const nearY = [[y + h / 2, 0.5, -h / 2, 'hc'], [y, CE_SAFE_Y, 0, ''], [y + h, 1 - CE_SAFE_Y, -h, '']];
  for (const [cur, target, off, gd] of nearY) if (Math.abs(cur - target) < CE_SNAP) { y = target + off; if (gd) g[gd] = true; break; }
  return { x, y, g };
}
function ceDragStart(e, kind, id) {
  if (ce.drag) return;   // zweiter Finger waehrend des Ziehens wird ignoriert
  const pv = document.querySelector('.ce-preview'); if (!pv) return;
  const box = kind === 'image' ? null : ceBoxes()[id];
  if (kind !== 'image' && !box) return;
  ce.drag = { kind, id, pid: e.pointerId, sx: e.clientX, sy: e.clientY, rect: pv.getBoundingClientRect(), box0: box ? { ...box } : null, started: false, eff: id ? ceEff(id) : null, img0: ce.model.image ? { ...ce.model.image } : null, el: e.currentTarget };
  try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* nicht kritisch */ }
  e.preventDefault();
}
function ceDragMove(e) {
  const d = ce.drag; if (!d || e.pointerId !== d.pid) return;
  const dxp = e.clientX - d.sx, dyp = e.clientY - d.sy;
  if (!d.started) {
    if (Math.hypot(dxp, dyp) < 3) return;
    d.started = true; ceCheckpoint(null);
    const ov = ceOverlay(); if (ov) ov.classList.add('is-dragging');
  }
  const dx = dxp / d.rect.width, dy = dyp / d.rect.height;
  const ov = ceOverlay();
  if (d.kind === 'image') {
    const im = d.img0; if (!im) return;
    const page = COVER_PAGE.w / COVER_PAGE.h, a = (im.w || 1) / (im.h || 1);
    ce.model = coverModelSanitize({ ...ce.model, image: im.fit === 'contain' ? { ...im, cx: im.cx + dx, cy: im.cy + dy }
      : (() => { const visW = (a > page ? page / a : 1) / im.zoom, visH = (a > page ? 1 : a / page) / im.zoom; return { ...im, cx: im.cx - dx * visW, cy: im.cy - dy * visH }; })() });
  } else if (d.kind === 'move') {
    const s = ceSnapPos({ x: d.box0.x + dx, y: d.box0.y + dy, w: d.box0.w, h: d.box0.h }, d);
    ce.model = coverModelSanitize({ ...ce.model, fields: { ...ce.model.fields, [d.id]: { ...ceF(d.id), x: ceRound(s.x), y: ceRound(s.y) } } });
    if (ov) { ov.querySelector('[data-g="vc"]').classList.toggle('is-on', s.g.vc); ov.querySelector('[data-g="hc"]').classList.toggle('is-on', s.g.hc); }
  } else {
    let nw = ceClamp(d.box0.w + dx, 0.1, 1);
    if (Math.abs(d.box0.x + nw - (1 - CE_SAFE_X)) < CE_SNAP) nw = 1 - CE_SAFE_X - d.box0.x;
    const f = { ...ceF(d.id), w: ceRound(nw) };
    if (f.x == null) f.x = ceRound(d.box0.x);
    ce.model = coverModelSanitize({ ...ce.model, fields: { ...ce.model.fields, [d.id]: f } });
  }
  ce.coverDirty = true;
  ceRelayout(); ceSyncOverlay(); cePaintSoon();
}
function ceDragEnd(e) {
  const d = ce.drag; if (!d || (e && e.pointerId !== d.pid)) return;
  ce.drag = null;
  try { if (d.el && d.el.releasePointerCapture) d.el.releasePointerCapture(d.pid); } catch (err) { /* schon frei */ }
  const ov = ceOverlay(); if (ov) { ov.classList.remove('is-dragging'); ov.querySelectorAll('.ce-g').forEach(g => g.classList.remove('is-on')); }
  if (d.started) { ceRenderWarnings(); ceRenderPanels(); ceScheduleSave(true); }
}

/* ---------- Verschieben ohne Ziehen ---------- */
function ceMoveBy(id, dx, dy, key) {
  const e = ceEff(id);
  ceChange((m) => { const f = { ...(m.fields[id] || {}) }; f.x = ceRound(e.x + dx); f.y = ceRound(e.y + dy); m.fields[id] = f; }, { key: key || 'move:' + id });
  ceSyncPositionInputs(id);
}
function ceSyncPositionInputs(id) {
  const e = ceEff(id);
  const x = document.querySelector(`[data-ce-input="x"][data-f="${id}"]`), y = document.querySelector(`[data-ce-input="y"][data-f="${id}"]`);
  if (x && document.activeElement !== x) x.value = ceRound(e.x * 100, 1);
  if (y && document.activeElement !== y) y.value = ceRound(e.y * 100, 1);
}
function cePlace(id, col, row) {
  const box = ceBoxes()[id] || { w: ceEff(id).w, h: 0.05 }, w = box.w, h = box.h, mx = 0.09, top = 0.10, bottom = 0.08;
  const x = col === 0 ? mx : col === 1 ? 0.5 - w / 2 : 1 - mx - w;
  const y = row === 0 ? top : row === 1 ? 0.5 - h / 2 : 1 - bottom - h;
  ceChange((m) => { m.fields[id] = { ...(m.fields[id] || {}), x: ceRound(x), y: ceRound(y), align: ['left', 'center', 'right'][col] }; }, { panels: true });
}
function ceSetProp(id, prop, value, key) {
  ceChange((m) => { m.fields[id] = { ...(m.fields[id] || {}), [prop]: value }; }, { key: key || ('p:' + id + prop) });
  if (prop === 'x' || prop === 'y') ceSyncPositionInputs(id);
}

/* ---------- Anordnung, Zuruecksetzen ---------- */
function ceArrange(name) {
  ceCheckpoint(null);
  let next;
  try { next = coverApplyArrangement(ceClone(ce.model), name, ceInput(), undefined); } catch (e) { next = null; }
  const m = coverModelSanitize(next || ce.model); m.arrange = name;
  ce.model = m; ce.coverDirty = true;
  ceRelayout(); ceRenderAll(); ceScheduleSave(true);
}
function ceResetArrangement() {
  ceCheckpoint(null);
  const m = ceClone(ce.model);
  Object.keys(m.fields).forEach((id) => { const f = m.fields[id]; ['x', 'y', 'w'].forEach(k => delete f[k]); if (!Object.keys(f).length) delete m.fields[id]; });
  m.arrange = ''; ce.model = coverModelSanitize(m); ce.coverDirty = true;
  ceRelayout(); ceRenderAll(); ceScheduleSave(true);
}
function ceResetCover() {
  ceCheckpoint(null);
  ce.model = coverModelSanitize({ v: 2, mode: 'template', templateId: ce.model.templateId, date: ce.model.date, showDate: ce.model.showDate });
  ce.coverDirty = true; ce.sel = null; ce.imgMove = false; ce.tab = 'text';
  ceRelayout(); ceRenderAll(); ceScheduleSave(true);
}

/* ---------- Bild ---------- */
async function ceImportImage(file) {
  if (!file) return;
  if (typeof coverImageImport !== 'function') { ce.imgError = 'Eigene Bilder sind in dieser Version noch nicht verfügbar.'; ceRenderPanels(); return; }
  ce.imgBusy = true; ce.imgError = ''; ceRenderPanels();
  try {
    const r = await coverImageImport(file, ce.bookId);
    const old = ce.model.image;
    ceChange((m) => { m.mode = 'custom'; m.image = { id: r.id, fit: old ? old.fit : 'cover', cx: 0.5, cy: 0.5, zoom: 1, w: r.w, h: r.h }; }, { panels: false, now: true });
  } catch (e) {
    ce.imgError = (e && e.userMessage) || 'Das Bild konnte nicht geladen werden. Versuche es mit einer JPEG- oder PNG-Datei.';
  } finally { ce.imgBusy = false; ceRenderPanels(); }
}

/* ---------- Ereignisse (einmal, delegiert) ---------- */
function ceCtx(el) { return el && el.closest ? el.closest('.cover-picker.ce') : null; }
document.addEventListener('click', (e) => {
  // Vor jeder anderen Aktion ausserhalb des Editors: ausstehende Aenderungen sofort speichern
  const act = e.target.closest && e.target.closest('[data-action]');
  if (act && ce.saveTimer && !ceCtx(act)) ceFlush();
  const b = e.target.closest && e.target.closest('[data-ce]');
  if (!b || !ceCtx(b) || b.disabled) return;
  const a = b.dataset.ce, id = b.dataset.f, v = b.dataset.v;
  switch (a) {
    case 'mode': {
      if ((v === 'custom') === (ce.model.mode === 'custom')) break;
      ceChange((m) => { m.mode = v === 'custom' ? 'custom' : 'template'; }, { now: true });
      ce.sel = null; ce.imgMove = false; ce.tab = v === 'custom' ? 'bg' : 'text'; ceRenderAll(); break;
    }
    case 'tab': ce.tab = v; ce.imgMove = false; ceRenderTabs(); ceRenderPanels(); ceSyncOverlay(); break;
    case 'template': ceChange((m) => { m.templateId = coverValidTemplateId(b.dataset.id); }, { now: true }); ceRenderAll(); break;
    case 'select': ceSelect(ce.sel === id ? null : id); break;
    case 'goto-warn': { const t = CE_FIELD_ORDER.includes(id) ? id : null; if (t) { ceSelect(t); const c = document.querySelector(`.ce-field[data-f="${t}"]`); if (c) c.scrollIntoView({ block: 'nearest' }); } else { ce.tab = id === 'image' ? 'bg' : 'arr'; ceRenderTabs(); ceRenderPanels(); } break; }
    case 'edit': { const inp = document.querySelector(`.ce-field[data-f="${id}"] input[type=text]`); if (inp) { inp.focus(); inp.select && inp.select(); } break; }
    case 'clear-extra': ceChange((m) => { delete m.fields.extra1; }, { panels: true }); break;
    case 'color': {
      const hex = v;
      if (b.dataset.kind === 'bg') ceChange((m) => { m.bg = { color: hex }; }, { panels: true });
      else ceChange((m) => { m.fields[id] = { ...(m.fields[id] || {}), color: hex }; }, { panels: true });
      break;
    }
    case 'align': ceChange((m) => { m.fields[id] = { ...(m.fields[id] || {}), align: v }; }, { panels: true }); break;
    case 'font': ceChange((m) => { m.fields.title = { ...(m.fields.title || {}), font: v }; }, { panels: true }); break;
    case 'step': { const rg = CE_PT_RANGE[id], cur = ceEff(id).fontPt, st = id === 'title' ? 2 : 1; ceSetProp(id, 'fontPt', ceClamp(cur + st * Number(b.dataset.d), rg[0], rg[1]), 'step:' + id); ceRefreshRange(id, 'fontPt'); break; }
    case 'place': cePlace(id, Number(b.dataset.c), Number(b.dataset.r)); break;
    case 'nudge': { const s = e.shiftKey ? 0.05 : 0.01; ceMoveBy(id, Number(b.dataset.dx) * s, Number(b.dataset.dy) * s, 'nudge:' + id); break; }
    case 'field-reset': ceChange((m) => { const t = m.fields[id] && m.fields[id].text; delete m.fields[id]; if (t) m.fields[id] = { text: t }; }, { panels: true }); break;
    case 'w-shorten': ceSelect(id); { const inp = document.querySelector(`.ce-field[data-f="${id}"] input[type=text]`); if (inp) inp.focus(); } break;
    case 'w-shrink': ceSetProp(id, 'fontPt', Math.max(CE_PT_RANGE[id][0], ceRound(ceEff(id).fontPt * 0.9, 1)), 'shrink:' + id); ceRenderPanels(); break;
    case 'w-widen': { const ef = ceEff(id), nw = Math.min(ef.w + 0.15, 0.88), nx = Math.max(0.06, Math.min(ef.x, 0.94 - nw)); ceChange((m) => { m.fields[id] = { ...(m.fields[id] || {}), w: ceRound(nw), x: ceRound(nx) }; }, { panels: true }); break; }
    case 'arrange': ceArrange(v); break;
    case 'logo-pos': ceChange((m) => { m.logo.pos = v; }, { panels: true }); break;
    case 'logo-var': ceChange((m) => { m.logo.variant = v; }, { panels: true }); break;
    case 'readability': ceChange((m) => { m.readability = v; }, { panels: true }); break;
    case 'arr-reset': ceResetArrangement(); break;
    case 'cover-reset': openModal({ type: 'ce-reset' }, '[data-ce="cover-reset"]'); break;
    case 'pick': { const f = document.querySelector('[data-ce-file]'); if (f) f.click(); break; }
    case 'img-remove': { ceChange((m) => { m.image = null; }, { panels: true, now: true }); ce.imgMove = false; ceSyncOverlay(); break; }
    case 'fit': ceChange((m) => { if (m.image) { m.image = { ...m.image, fit: v, cx: 0.5, cy: 0.5, zoom: 1 }; } }, { panels: true }); break;
    case 'img-move': ce.imgMove = !ce.imgMove; if (ce.imgMove) ce.sel = null; ceSyncOverlay(); ceRenderPanels(); break;
    case 'img-reset': ceChange((m) => { if (m.image) m.image = { ...m.image, cx: 0.5, cy: 0.5, zoom: 1 }; }, { panels: true }); break;
    case 'img-nudge': { const im = ce.model.image; if (!im) break; const s = (e.shiftKey ? 0.05 : 0.01) * (im.fit === 'contain' ? 1 : -1) * (im.fit === 'contain' ? 1 : 1 / Math.max(im.zoom, 1)); ceChange((m) => { m.image = { ...m.image, cx: m.image.cx + Number(b.dataset.dx) * s, cy: m.image.cy + Number(b.dataset.dy) * s }; }, { key: 'imgnudge' }); break; }
    case 'undo': ceUndo(); break;
    case 'redo': ceRedo(); break;
    case 'retry': ceSaveNow(); break;
    case 'hit': break;
  }
});
document.addEventListener('click', (e) => {
  const hit = e.target.closest && e.target.closest('.ce-hit');
  if (hit && ceCtx(hit)) ceSelect(hit.dataset.hit, { focusFrame: e.detail === 0 });
});
function ceRefreshRange(id, prop) {
  const el = document.querySelector(`[data-ce-input="${prop}"][data-f="${id}"]`); if (!el) return;
  const e = ceEff(id), val = prop === 'w' ? e.w * 100 : e.fontPt;
  el.value = val; const out = el.parentElement.querySelector('output'); if (out) out.textContent = `${ceRound(val, 1)} ${prop === 'w' ? '%' : 'pt'}`;
}
document.addEventListener('input', (e) => {
  const t = e.target; if (!t.matches || !ceCtx(t)) return;
  const kind = t.dataset.ceInput;
  if (t.matches('[data-cb-field]')) { ceSetText(t.dataset.cbField, t.value, false); return; }
  if (!kind) return;
  const id = t.dataset.f, num = Number(t.value);
  if (kind === 'extra1') { ceChange((m) => { const f = { ...(m.fields.extra1 || {}) }; if (t.value.trim()) f.text = t.value; else delete f.text; if (Object.keys(f).length) m.fields.extra1 = f; else delete m.fields.extra1; }, { key: 'text:extra1' }); return; }
  if (kind === 'fontPt') { ceSetProp(id, 'fontPt', num, 'rng:' + id + 'pt'); t.parentElement.querySelector('output').textContent = `${ceRound(num, 1)} pt`; }
  else if (kind === 'w') { ceSetProp(id, 'w', num / 100, 'rng:' + id + 'w'); t.parentElement.querySelector('output').textContent = `${num} %`; }
  else if (kind === 'zoom') { ceChange((m) => { if (m.image) m.image = { ...m.image, zoom: num }; }, { key: 'zoom' }); t.parentElement.querySelector('output').textContent = `${Math.round(num * 100)} %`; }
  else if (kind === 'color') {
    const hex = t.value.toUpperCase();
    if (t.dataset.kind === 'bg') ceChange((m) => { m.bg = { color: hex }; }, { key: 'color:bg' }); else ceChange((m) => { m.fields[id] = { ...(m.fields[id] || {}), color: hex }; }, { key: 'color:' + id });
  }
});
document.addEventListener('change', (e) => {
  const t = e.target; if (!t.matches || !ceCtx(t)) return;
  if (t.matches('[data-ce-file]')) { const f = t.files && t.files[0]; t.value = ''; ceImportImage(f); return; }
  if (t.matches('[data-cb-field]')) { t.value = t.value.trim(); ceSetText(t.dataset.cbField, t.value, true); ceFlush(); return; }
  if (t.matches('[data-cb-cover-date]')) {
    const d = coverNormalizeDate(t.value);
    if (d) ceChange((m) => { m.date = d; }, { now: true }); else t.value = ce.model.date;   // leer oder ungueltig: bisheriges Datum bleibt
    return;
  }
  if (t.matches('[data-cb-cover-flag]')) { const on = !!t.checked; ceChange((m) => { m[t.dataset.cbCoverFlag] = on; }, { now: true }); return; }
  if (t.matches('[data-cb-flag="showLogo"]')) { ceCheckpoint(null); ce.texts.showLogo = !!t.checked; ceAfterChange({ now: true }); return; }
  const kind = t.dataset.ceInput;
  if (kind === 'x' || kind === 'y') { const n = Number(t.value); if (Number.isFinite(n)) ceSetProp(t.dataset.f, kind, ceClamp(n, -50, 150) / 100, 'xy:' + t.dataset.f + kind); }
  if (kind === 'fontPt' || kind === 'w' || kind === 'zoom' || kind === 'color') ce.lastKey = '';
});
/* Zeigen (Pointer-Events mit Capture). Maus: ganzer Rahmen und Griffe. Touch: nur die Griffe, Rest scrollt normal. */
document.addEventListener('pointerdown', (e) => {
  const t = e.target; if (!t.closest || !ceCtx(t)) return;
  const grip = t.closest('[data-grip]'), fr = t.closest('.ce-frame'), pad = t.closest('[data-imgpad]'), hit = t.closest('.ce-hit');
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (grip && fr) { ceDragStart({ ...ceEvt(e), currentTarget: grip }, grip.dataset.grip === 'width' ? 'width' : 'move', fr.dataset.fr); }
  else if (fr && e.pointerType === 'mouse') ceDragStart({ ...ceEvt(e), currentTarget: fr }, 'move', fr.dataset.fr);
  else if (pad) ceDragStart({ ...ceEvt(e), currentTarget: pad }, 'image', null);
  else if (hit && e.pointerType === 'mouse') { const id = hit.dataset.hit; ceSelect(id); const nf = document.querySelector(`.ce-frame[data-fr="${id}"]`); if (nf) { e.preventDefault(); ceDragStart({ ...ceEvt(e), currentTarget: nf }, 'move', id); } }
});
function ceEvt(e) { return { pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY, preventDefault: () => e.preventDefault() }; }
document.addEventListener('pointermove', (e) => { if (ce.drag) ceDragMove(e); });
document.addEventListener('pointerup', (e) => { if (ce.drag) ceDragEnd(e); });
document.addEventListener('pointercancel', (e) => { if (ce.drag) ceDragEnd(e); });
document.addEventListener('lostpointercapture', (e) => { if (ce.drag && e.pointerId === ce.drag.pid) ceDragEnd(e); });
document.addEventListener('keydown', (e) => {
  const t = e.target;
  const fr = t.closest && t.closest('.ce-frame');
  if (fr && ceCtx(fr)) {
    const id = fr.dataset.fr, s = e.shiftKey ? 0.05 : 0.01;
    const d = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.key];
    if (d) { e.preventDefault(); ceMoveBy(id, d[0], d[1], 'key:' + id); return; }
    if (e.key === 'Escape') { e.preventDefault(); ceSelect(null); return; }
    if (e.key === 'Enter') { e.preventDefault(); const inp = document.querySelector(`.ce-field[data-f="${id}"] input[type=text]`); if (inp) inp.focus(); return; }
  }
  // Rueckgaengig und Wiederholen (nicht, wenn gerade Text getippt wird: dort gilt die Rueckgaengig-Funktion des Feldes)
  if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z' || e.key === 'y') && ceRoot() && state.view === 'cookbook') {
    const tag = t.tagName, typing = (tag === 'INPUT' && !/^(range|checkbox|radio|color|button)$/.test(t.type)) || tag === 'TEXTAREA';
    if (typing) return;
    e.preventDefault();
    if (e.key === 'y' || e.shiftKey) ceRedo(); else ceUndo();
  }
  // Tabs mit Pfeiltasten
  if (t.matches && t.matches('.ce-tab') && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    const tabs = Array.from(document.querySelectorAll('.ce-tab')), i = tabs.indexOf(t), n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    e.preventDefault(); n.click(); const nn = document.getElementById(n.id); if (nn) nn.focus();
  }
});
window.addEventListener('pagehide', () => { ceFlush(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') ceFlush(); });
function ceSetTop() {
  const root = ceRoot(); if (!root) return;
  const tb = document.querySelector('.topbar'), pos = tb ? getComputedStyle(tb).position : '';
  const top = (pos === 'sticky' || pos === 'fixed') ? Math.round(tb.getBoundingClientRect().height) : 0;
  root.style.setProperty('--ce-top', top + 'px');
  ceSetScrollPad();
}
/* Beim Fokussieren oder Scrollen zu einem Bedienelement soll es nicht unter der angehefteten Vorschau landen */
function ceSetScrollPad() {
  const root = ceRoot(), st = root && root.querySelector('.ce-stage');
  const sticky = st && getComputedStyle(st).position === 'sticky';
  const top = parseInt(root && root.style.getPropertyValue('--ce-top'), 10) || 0;
  document.documentElement.style.scrollPaddingTop = root && sticky ? (top + st.getBoundingClientRect().height + 8) + 'px' : '';
}
window.addEventListener('resize', () => { if (ceRoot()) { ceSetTop(); cePaintSoon(); } });

/* ---------- Anbindung an cover.js (Vorschau nach dem Zeichnen der Seite und bei fertigen Schriften) ---------- */
(function () {
  const fit = coverFitPreviews;
  coverFitPreviews = function () { fit(); if (!ceRoot()) document.documentElement.style.scrollPaddingTop = ''; if (ceRoot()) { ceSetTop(); ceEnsure(); ceRelayout(); ceRenderWarnings(); ceSyncOverlay(); cePaintSoon(); } };
  coverRefresh = function () { if (ceRoot()) { ceRelayout(); ceSyncOverlay(); cePaintSoon(); ceRenderWarnings(); } };
})();

/* ---------- Uebergang bis das Layout-Paket (C2) v2 in cover.js kennt ----------
   Erkennt selbst, ob coverSanitizeConfig/coverEnsureConfig ein v2-Titelblatt unveraendert durchlassen. Wenn ja, passiert hier nichts. */
(function () {
  try {
    if (coverSanitizeConfig({ v: 2, mode: 'custom' }).v === 2) return;
    const san = coverSanitizeConfig, ens = coverEnsureConfig;
    coverSanitizeConfig = function (raw, force) {
      const base = san(raw, force);
      if (raw && raw.v === 2) return { ...coverModelSanitize(raw), date: base.date || coverNormalizeDate(raw.date), v: 2 };
      return base;
    };
    coverEnsureConfig = function () {
      const c = cookbookGetRaw().cover;
      if (c && c.v === 2) return getCookbookConfig();
      return ens();
    };
  } catch (e) { /* Layout-Paket liefert alles */ }
})();
