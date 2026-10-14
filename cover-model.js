/* ---------- Cover-Modell v2: Datenmodell, Migration, Anordnungen, Pruefregeln ----------
   FESTE SCHNITTSTELLE (Cover-Editor, Pakete C2 bis C5). Aenderungen nur nach Absprache mit dem Integrator.

   Geladen NACH cover.js (index.html). Alles sind globale Funktionen/Konstanten (klassische Skripte).

   DATENFORM  cfg.cover (v 2, additiv zu v1: templateId, date, showDate bleiben gueltig und massgebend)
   {
     v: 2,
     mode: 'template' | 'custom',          // template: Vorlagenmotiv + Abweichungen; custom: eigener Hintergrund
     templateId, date: 'YYYY-MM-DD', showDate: boolean,      // wie v1
     bg:    { color: '#RRGGBB' },           // nur mode 'custom' (Standard Papier #F7F4EE)
     image: null | { id, fit: 'contain'|'cover', cx, cy, zoom, w, h },   // nur mode 'custom'; id = Bild im Store 'images' (z. B. 'cover-<buch>-<zufall>'),
                                            // w/h = Originalpixel (vom Import gesetzt, noetig fuer sofortiges Layout und Aufloesungswarnung)
                                            // cover:   cx,cy 0..1 = Bildpunkt in der Mitte des sichtbaren Ausschnitts (Standard .5/.5), zoom 1..8 (1 = fuellt gerade)
                                            // contain: cx,cy 0..1 = Lage der Bildmitte auf der Seite (Standard .5/.5), zoom 0.3..1 (1 = ganzes Bild so gross wie moeglich)
     fields: { title?, subtitle?, name?, date?, extra1? },    // nur Abweichungen vom Standard speichern
        // je Feld: { text?: string, visible?: boolean, x?, y?, w?, fontPt?, color?, align?: 'left'|'center'|'right', font?: <erlaubte Schrift> }
        // x, y = obere linke Ecke des Textfelds, w = Breite, beide als Anteil der A4-Seite (0..1, Hoehe ergibt sich aus Text und Schrift)
        // fontPt in Punkt (A4 = 595.3 x 841.9 pt; 1 pt = 1.3333 px bei COVER_PAGE 794 px). Ohne y: Feld fliesst unter das vorige (Titel, Untertitel, Name, extra1)
        // text: ueberschreibt den Text aus cfg.title (title), cfg.subtitle (subtitle), cfg.author (name); extra1 hat nur text. Fehlt text, gilt der v1-Text.
     logo:  { pos: 'top-right'|'top-left'|'bottom-right', variant: 'auto'|'light'|'dark' },   // light = helle (creme) Wortmarke, dark = dunkle (Tinte)
     readability: 'none' | 'panel' | 'gradient',
     arrange: ''  | 'Oben links' | 'Oben mittig' | 'Mittig' | 'Unten links' | 'Unten mittig' | 'Frei platzieren'
   }
   Erlaubte Schriften (COVER_FONT_NAMES): 'Sofia Sans Extra Condensed' (Standard Titel), 'Lilita One', 'Archivo', 'Baloo 2', 'Roboto' (Standard Rest).

   FUNKTIONEN (cover-model.js)
     coverModelFromLegacy(cfg)          cfg = Kochbuch-Konfiguration (getCookbookConfig()); liefert IMMER ein v2-Modell (v1 -> Standardansicht), schreibt nichts.
     coverModelSanitize(raw)            idempotent, begrenzt Werte, wirft unbekannte Schluessel/Schriften weg.
     coverModelIsPlainTemplate(m)       true = Vorlage ohne jede Abweichung (-> alter v1-Pfad, pixelgleich)
     coverApplyArrangement(model, name, input, measure?)   neues Modell (rein), input wie bei coverLayout (Texte), setzt x/y/w/align der sichtbaren Textfelder.
     coverContrast(fg, bg)              WCAG-Kontrast 1..21 (Farben '#RRGGBB'/'#RGB')
     coverValidate(layout)              berechnet warnings[] aus einem v2-Layout (wird von coverLayout aufgerufen)
     coverExportBlockers(layout)        nur 'cut'/'outside' (bei v1-Layout: alle v1-Warnungen) -> [{fieldId, kind, message}]
     coverInputFromConfig(cfg, extra?)  baut das coverLayout-Argument aus der Kochbuch-Konfiguration (inkl. v2, wenn cfg.cover.v === 2); extra wird daruebergelegt.
     coverLogoAuto(model, lumaHint?)    'light'|'dark' fuer Variante 'auto' (Luminanz Hintergrundfarbe; bei Bild lumaHint 0..1 = mittlere Helligkeit hinter dem Logo)
   FUNKTIONEN (cover.js)
     coverLayout(input, measure?)       input: { templateId, title, name, slogan, date, showDate, logo, v2? }; v2-Pfad, wenn input.v2 vorhanden und nicht schlichte Vorlage.
     coverDraw(ctx, layout, bgImg, scale, userImg?)   userImg = decodiertes Bild (ImageBitmap/Image/Canvas) fuer layout.image
     coverRenderCanvas(layout, scale, bgUrl, userImg?)   fehlt userImg, wird window.coverImageLoad(id) (Paket C4, async -> drawable|null) gefragt.

   LAYOUT-ERGEBNIS v2 (zusaetzlich zu v1-Feldern: templateId, page, ink, blocks, date, logo, warnings, background)
     v: 2, mode, bgColor: '#RRGGBB' | null (Vorlage), background: URL | null,
     blocks[]: { key ('title'|'slogan'|'name'|'extra1'), id ('title'|'subtitle'|'name'|'extra1'), lines[], sizePx, sizePt, lineHeightPx, family, weight, font,
                 x, y, w, h (Seitenanteile), ink, align, fits, splitWord (true = Einzelwort an Zeichengrenze geteilt) }
     date: { text, sizePx, x1 (rechter Rand, v1-kompatibel), ax (Ankerpunkt), align, y, h, w, ink, family, weight } | null
     logo: { x, y, w, h, variant ('light'|'dark'), ink, pos } | null
     image: null | { id, fit, src: {x,y,w,h} (Originalpixel), dst: {x,y,w,h} (Seitenanteile), ppi }
     panels[]: { x, y, w, h, r (Radius in Seitenbreiten-Anteil), color, alpha }    gradients[]: { x, y, w, h, from: '#RRGGBB', alpha, dir: 'down'|'up' }
     readability, warnings[]: { fieldId ('title'|'subtitle'|'name'|'extra1'|'date'|'logo'|'image'), kind: 'cut'|'outside'|'overlap'|'unreadable'|'lowres', message }
   Warnungstexte sind fertige deutsche Meldungen mit Loesungshinweis. */

const COVER_SCHEMA_V2 = 2;
const COVER_PAPER = '#F7F4EE';
const COVER_FONT_NAMES = ['Sofia Sans Extra Condensed', 'Lilita One', 'Archivo', 'Baloo 2', 'Roboto'];
const COVER_TITLE_FONT_NAMES = ['Sofia Sans Extra Condensed', 'Lilita One', 'Archivo', 'Baloo 2'];
const COVER_ARRANGEMENTS = ['Oben links', 'Oben mittig', 'Mittig', 'Unten links', 'Unten mittig', 'Frei platzieren'];
const COVER_FIELD_IDS = ['title', 'subtitle', 'name', 'date', 'extra1'];
const COVER_LOGO_POSITIONS = ['top-right', 'top-left', 'bottom-right'];
const COVER_FONT_TABLE = {
  'Sofia Sans Extra Condensed': { family: "'Sofia Sans Extra Condensed', 'Arial Narrow', sans-serif", weight: 800, lh: 1.04 },
  'Lilita One': { family: "'Lilita One', 'Arial Black', sans-serif", weight: 400, lh: 1.1 },
  'Archivo': { family: "'Archivo', 'Arial Black', sans-serif", weight: 900, lh: 1.05 },
  'Baloo 2': { family: "'Baloo 2', 'Arial Rounded MT Bold', sans-serif", weight: 700, lh: 1.15 },
  'Roboto': { family: "'Roboto', system-ui, sans-serif", weight: 400, lh: 1.25 },
};
/* Standardwerte der Felder im Modus 'custom' (Zeile y fehlt = fliesst unter das vorige Feld). */
const COVER_FIELD_DEFAULTS = {
  title: { x: 0.09, w: 0.82, fontPt: 56, color: '#252720', align: 'left', font: 'Sofia Sans Extra Condensed', weight: 800, lh: 1.04 },
  subtitle: { x: 0.09, w: 0.82, fontPt: 19, color: '#252720', align: 'left', font: 'Roboto', weight: 400, lh: 1.25 },
  name: { x: 0.09, w: 0.82, fontPt: 14, color: '#252720', align: 'left', font: 'Roboto', weight: 700, lh: 1.3 },
  extra1: { x: 0.09, w: 0.82, fontPt: 12, color: '#252720', align: 'left', font: 'Roboto', weight: 400, lh: 1.3 },
  date: { x: 0.53, y: 0.945, w: 0.4, fontPt: 9.75, color: '#252720', align: 'right', font: 'Roboto', weight: 500, lh: 1 },
};
const COVER_LIMITS = { fontPt: [6, 200], pos: [-0.5, 1.5], w: [0.05, 1.5], zoom: [0.3, 8], text: 600 };

function coverHexNorm(v, fallback) {
  const s = String(v == null ? '' : v).trim();
  let m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) return '#' + m[1].toUpperCase();
  m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s);
  if (m) return ('#' + m[1] + m[1] + m[2] + m[2] + m[3] + m[3]).toUpperCase();
  return fallback == null ? null : fallback;
}
function coverClampNum(v, lo, hi, fallback) {
  const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}
function coverRound(n, d) { const k = Math.pow(10, d == null ? 4 : d); return Math.round(n * k) / k; }

/* WCAG-Kontrast */
function coverLuminance(hex) {
  const h = coverHexNorm(hex, '#000000');
  const ch = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function coverContrast(fg, bg) {
  const a = coverLuminance(fg), b = coverLuminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/* ---------- Modell lesen und begrenzen (idempotent) ---------- */
function coverModelSanitize(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const out = {
    v: COVER_SCHEMA_V2,
    mode: r.mode === 'custom' ? 'custom' : 'template',
    templateId: coverValidTemplateId(r.templateId),
    date: coverNormalizeDate(r.date),
    showDate: r.showDate !== false,
    bg: { color: coverHexNorm(r.bg && r.bg.color, COVER_PAPER) },
    image: null,
    fields: {},
    logo: {
      pos: COVER_LOGO_POSITIONS.includes(r.logo && r.logo.pos) ? r.logo.pos : 'top-right',
      variant: ['auto', 'light', 'dark'].includes(r.logo && r.logo.variant) ? r.logo.variant : 'auto',
    },
    readability: ['panel', 'gradient'].includes(r.readability) ? r.readability : 'none',
    arrange: COVER_ARRANGEMENTS.includes(r.arrange) ? r.arrange : '',
  };
  const im = r.image;
  if (im && typeof im === 'object' && typeof im.id === 'string' && im.id && im.id.length <= 160) {
    const fit = im.fit === 'contain' ? 'contain' : 'cover';
    const img = { id: im.id, fit, cx: coverRound(coverClampNum(im.cx, 0, 1, 0.5)), cy: coverRound(coverClampNum(im.cy, 0, 1, 0.5)), zoom: coverRound(coverClampNum(im.zoom, fit === 'contain' ? 0.3 : 1, fit === 'contain' ? 1 : 8, 1)) };
    const w = Math.round(coverClampNum(im.w, 1, 100000, 0)), h = Math.round(coverClampNum(im.h, 1, 100000, 0));
    if (w && h) { img.w = w; img.h = h; }
    out.image = img;
  }
  const fs = r.fields && typeof r.fields === 'object' ? r.fields : {};
  COVER_FIELD_IDS.forEach((id) => {
    const f = fs[id];
    if (!f || typeof f !== 'object') return;
    const o = {};
    if (typeof f.text === 'string') o.text = f.text.slice(0, COVER_LIMITS.text);
    if (f.visible === false) o.visible = false;
    ['x', 'y'].forEach(k => { const n = coverClampNum(f[k], COVER_LIMITS.pos[0], COVER_LIMITS.pos[1], null); if (n != null) o[k] = coverRound(n); });
    const w = coverClampNum(f.w, COVER_LIMITS.w[0], COVER_LIMITS.w[1], null); if (w != null) o.w = coverRound(w);
    const pt = coverClampNum(f.fontPt, COVER_LIMITS.fontPt[0], COVER_LIMITS.fontPt[1], null); if (pt != null) o.fontPt = coverRound(pt, 2);
    const col = coverHexNorm(f.color, null); if (col) o.color = col;
    if (['left', 'center', 'right'].includes(f.align)) o.align = f.align;
    if (COVER_FONT_NAMES.includes(f.font)) o.font = f.font;
    if (Object.keys(o).length) out.fields[id] = o;
  });
  return out;
}

/* v1 -> v2 (Standardansicht, schreibt nichts). cfg = Kochbuch-Konfiguration oder direkt cfg.cover. */
function coverModelFromLegacy(cfg) {
  const c = cfg && cfg.cover !== undefined ? cfg.cover : cfg;
  const base = coverModelSanitize(c && typeof c === 'object' ? c : {});
  if (!c || c.v !== COVER_SCHEMA_V2) base.mode = 'template';
  return base;
}
/* Vorlage ohne jede Abweichung: alter v1-Pfad (Layout und Zeichnung bleiben pixelgleich) */
function coverModelIsPlainTemplate(m) {
  return !!m && m.mode === 'template' && !Object.keys(m.fields || {}).length && (!m.logo || (m.logo.pos === 'top-right' && m.logo.variant === 'auto')) && (!m.readability || m.readability === 'none');
}
/* Eingabe fuer coverLayout aus der Kochbuch-Konfiguration (v2 nur, wenn die Person es gespeichert hat) */
function coverInputFromConfig(cfg, extra) {
  const cv = (cfg && cfg.cover) || coverSanitizeConfig(null, true);
  const input = { templateId: cv.templateId, title: cfg && cfg.title, name: cfg && cfg.author, slogan: cfg && cfg.subtitle, date: cv.date, showDate: cv.showDate, logo: !cfg || cfg.showLogo !== false };
  if (cv.v === COVER_SCHEMA_V2) input.v2 = coverModelSanitize(cv);
  return Object.assign(input, extra || {});
}
function coverLogoAuto(model, lumaHint) {
  if (model && model.mode === 'custom') {
    if (model.image && typeof lumaHint === 'number') return lumaHint < 0.5 ? 'light' : 'dark';
    if (!model.image) return coverLuminance(model.bg && model.bg.color || COVER_PAPER) < 0.3 ? 'light' : 'dark';
  }
  return 'dark';
}

/* ---------- Anordnungen: Block aus Titel, Untertitel, Name (und weiterer Zeile) nach gemessenen Hoehen ---------- */
function coverBlockId(b) { return b.id || (b.key === 'slogan' ? 'subtitle' : b.key); }
function coverApplyArrangement(model, name, input, measure) {
  const m = coverModelSanitize(model);
  if (!COVER_ARRANGEMENTS.includes(name)) return m;
  const inp = Object.assign({}, input || {}, { v2: m });
  const first = coverLayout(inp, measure);
  const ids = first.blocks.map(coverBlockId);
  if (name === 'Frei platzieren') {
    first.blocks.forEach((b) => { m.fields[coverBlockId(b)] = Object.assign({}, m.fields[coverBlockId(b)], { x: coverRound(b.x), y: coverRound(b.y), w: coverRound(b.w) }); });
    m.arrange = name;
    return coverModelSanitize(m);
  }
  if (!ids.length) { m.arrange = name; return coverModelSanitize(m); }
  const align = name.endsWith('mittig') || name === 'Mittig' ? 'center' : 'left';
  ids.forEach((id) => { const f = Object.assign({}, m.fields[id], { x: 0.09, w: 0.82, align }); delete f.y; m.fields[id] = f; });
  const lay = coverLayout(Object.assign({}, inp, { v2: coverModelSanitize(m) }), measure);
  const gap = 0.016, H = lay.blocks.reduce((a, b) => a + b.h, 0) + gap * (lay.blocks.length - 1);
  const logoBottom = m.logo.pos === 'bottom-right';
  const topY = logoBottom ? 0.08 : 0.13;
  const bottomLimit = logoBottom ? 0.84 : (lay.date && !logoBottom ? 0.91 : 0.93);
  let y0;
  if (name.startsWith('Oben')) y0 = topY;
  else if (name === 'Mittig') y0 = Math.min(bottomLimit - H, Math.max(topY, (1 - H) / 2));
  else y0 = bottomLimit - H;
  let y = Math.max(0.02, y0);
  lay.blocks.forEach((b) => { const id = coverBlockId(b); m.fields[id] = Object.assign({}, m.fields[id], { y: coverRound(y) }); y += b.h + gap; });
  m.arrange = name;
  return coverModelSanitize(m);
}

/* ---------- Pruefregeln ---------- */
function coverValidate(layout) {
  const out = [];
  if (!layout) return out;
  const eps = 0.002, L = COVER_FIELD_LABEL;
  const add = (fieldId, kind, message) => out.push({ fieldId, kind, message });
  const rects = [];
  (layout.blocks || []).forEach((b) => {
    const id = coverBlockId(b), lab = L[id] || 'Der Text';
    if (b.splitWord) add(id, 'cut', `${lab} enthält ein Wort, das breiter ist als das Textfeld und mitten im Wort getrennt wird. Verbreitere das Textfeld, verkleinere die Schrift oder kürze den Text.`);
    if (b.y + b.h > 1 + eps) add(id, 'cut', `${lab} ragt unten über die Seite hinaus und wird abgeschnitten. Kürze den Text, verkleinere die Schrift oder verbreitere das Textfeld.`);
    else if (b.fits === false) add(id, 'cut', `${lab} ist zu lang für dieses Titelblatt. Bitte kürzen (er passt nur in kleiner, nicht lesbarer Schrift).`);
    if (b.x < -eps || b.x + b.w > 1 + eps || b.y < -eps) add(id, 'outside', `${lab} liegt teilweise ausserhalb der Seite. Verschiebe das Textfeld oder mache es schmaler.`);
    rects.push({ id, x: b.tx != null ? b.tx : b.x, y: b.y, w: b.tw != null ? b.tw : b.w, h: b.h });
  });
  const d = layout.date;
  if (d) {
    const dx = d.align === 'left' ? d.ax : (d.align === 'center' ? d.ax - d.tw / 2 : d.ax - d.tw);
    if (dx < -eps || dx + d.tw > 1 + eps || d.y < -eps || d.y + d.h > 1 + eps) add('date', 'outside', `${L.date} liegt teilweise ausserhalb der Seite. Verschiebe es nach innen.`);
    rects.push({ id: 'date', x: dx, y: d.y, w: d.tw, h: d.h });
  }
  const lg = layout.logo;
  if (lg) {
    if (lg.x < -eps || lg.x + lg.w > 1 + eps || lg.y < -eps || lg.y + lg.h > 1 + eps) add('logo', 'outside', `${L.logo} liegt teilweise ausserhalb der Seite.`);
    rects.push({ id: 'logo', x: lg.x, y: lg.y, w: lg.w, h: lg.h });
  }
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    if (a.x < b.x + b.w - eps && b.x < a.x + a.w - eps && a.y < b.y + b.h - eps && b.y < a.y + a.h - eps) {
      const acc = { title: 'den Titel', subtitle: 'den Untertitel', name: 'den Namen', extra1: 'die weitere Zeile', date: 'das Datum', logo: 'das Logo' };
      add(b.id, 'overlap', `${L[b.id] || 'Ein Feld'} überlappt ${acc[a.id] || 'ein anderes Feld'}. Verschiebe eines der beiden Felder.`);
    }
  }
  if (layout.mode === 'custom' && !layout.image && layout.bgColor && layout.readability !== 'gradient') {
    const bgc = layout.readability === 'panel' ? COVER_PAPER : layout.bgColor;
    const texts = (layout.blocks || []).map(b => ({ id: coverBlockId(b), ink: b.ink })).concat(d ? [{ id: 'date', ink: d.ink }] : []);
    texts.forEach(t => { if (coverContrast(t.ink, bgc) < 3) add(t.id, 'unreadable', 'Der Text ist hier schwer lesbar. Wähle eine andere Farbe oder aktiviere eine Textfläche.'); });
  } else if (layout.readability === 'panel') {
    (layout.blocks || []).forEach(b => { if (coverContrast(b.ink, COVER_PAPER) < 3) add(coverBlockId(b), 'unreadable', 'Der Text ist hier schwer lesbar. Wähle eine andere Farbe oder aktiviere eine Textfläche.'); });
  }
  if (layout.image && layout.image.ppi != null && layout.image.ppi < 150) add('image', 'lowres', `Das Bild hat nur etwa ${Math.round(layout.image.ppi)} ppi auf A4. Für den Druck möglicherweise unscharf.`);
  return out;
}
function coverExportBlockers(layout) {
  if (!layout) return [];
  if (layout.v !== COVER_SCHEMA_V2) return (layout.warnings || []).map(w => ({ fieldId: w.key || '', kind: 'cut', message: w.message }));
  return (layout.warnings || []).filter(w => w.kind === 'cut' || w.kind === 'outside');
}
