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
        // rot (Paket Drehung, alle fuenf Felder): Grad im Uhrzeigersinn, -180..180, gerundet auf 0.5, Standard 0 (0 wird nicht gespeichert).
        //   Drehpunkt = Mitte des Textfelds (x + w/2, y + h/2). Ohne rot bleibt alles pixelgleich wie vorher.
     images: [ { id, imgId, x, y, w, rot, z, opacity?, iw, ih } ]   // zusaetzliche eigene Bilder (hoechstens COVER_MAX_IMAGES = 4), in beiden Modi
        // id      = eindeutiger Schluessel im Modell ('ci-<zufall>', [A-Za-z0-9_-], hoechstens 40 Zeichen; doppelte IDs werden verworfen)
        // imgId   = Bild im Store 'images' mit Praefix 'cover-' (Import ueber coverImageImport(file, bookKey) -> { id, w, h }; id -> imgId, w -> iw, h -> ih)
        // x, y    = MITTE des Bildes als Seitenanteil (-0.5..1.5), w = Breite als Seitenbreiten-Anteil (0.02..1.5)
        // iw, ih  = Pixel des gespeicherten Bildes; Hoehe auf der Seite = w * 794 * ih / iw (nie verzerrt). Fehlen iw/ih, rechnet coverDraw mit den echten Pixeln.
        // rot     = wie bei den Feldern (Drehpunkt = Bildmitte); z = 'below' (unter dem Text, Standard) | 'above' (ueber dem Text, unter Wortmarke und Datum)
        // opacity = 0.05..1 (Standard 1, 1 wird nicht gespeichert)
        // Fehlt images (alte Cover), gibt es keine Zusatzbilder. Reihenfolge im Array = Zeichenreihenfolge innerhalb derselben Ebene.
     logo:  { pos: 'top-right'|'top-left'|'bottom-right', variant: 'auto'|'light'|'dark' },   // light = helle (creme) Wortmarke, dark = dunkle (Tinte)
     readability: 'none' | 'panel' | 'gradient',
     arrange: ''  | 'Oben links' | 'Oben mittig' | 'Mittig' | 'Unten links' | 'Unten mittig' | 'Frei platzieren'
   }
   Erlaubte Schriften (COVER_FONT_NAMES): 'Sofia Sans Extra Condensed' (Standard Titel), 'Lilita One', 'Archivo', 'Baloo 2', 'Roboto' (Standard Rest).

   FUNKTIONEN (cover-model.js)
     coverModelFromLegacy(cfg)          cfg = Kochbuch-Konfiguration (getCookbookConfig()); liefert IMMER ein v2-Modell (v1 -> Standardansicht), schreibt nichts.
     coverModelSanitize(raw)            idempotent, begrenzt Werte, wirft unbekannte Schluessel/Schriften weg.
     coverModelIsPlainTemplate(m)       true = Vorlage ohne jede Abweichung (-> alter v1-Pfad, pixelgleich)
     coverApplyArrangement(model, name, input, measure?)   neues Modell (rein), input wie bei coverLayout (Texte), setzt x/y/w/align der sichtbaren Textfelder
                                        und setzt deren rot auf 0 zurueck (auch bei 'Frei platzieren'; Datum und Zusatzbilder bleiben unberuehrt).
     coverNewImageEntry(imp, opts?)     baut einen Eintrag fuer model.images aus dem Ergebnis von coverImageImport ({ id, w, h }); opts: { x, y, w, z } (Standard Mitte, Breite 0.4, 'below').
     coverRotCorners(x, y, w, h, cx, cy, rot)   4 Ecken [{x,y}] (Seitenanteile) des um (cx,cy) gedrehten Rechtecks (Seitenverhaeltnis A4 beruecksichtigt)
     coverContrast(fg, bg)              WCAG-Kontrast 1..21 (Farben '#RRGGBB'/'#RGB')
     coverValidate(layout)              berechnet warnings[] aus einem v2-Layout (wird von coverLayout aufgerufen)
     coverExportBlockers(layout)        nur 'cut'/'outside' (bei v1-Layout: alle v1-Warnungen) -> [{fieldId, kind, message}]
     coverInputFromConfig(cfg, extra?)  baut das coverLayout-Argument aus der Kochbuch-Konfiguration (inkl. v2, wenn cfg.cover.v === 2); extra wird daruebergelegt.
     coverLogoAuto(model, lumaHint?)    'light'|'dark' fuer Variante 'auto' (Luminanz Hintergrundfarbe; bei Bild lumaHint 0..1 = mittlere Helligkeit hinter dem Logo)
   FUNKTIONEN (cover.js)
     coverLayout(input, measure?)       input: { templateId, title, name, slogan, date, showDate, logo, v2? }; v2-Pfad, wenn input.v2 vorhanden und nicht schlichte Vorlage.
     coverDraw(ctx, layout, bgImg, scale, userImg?, extraImgs?)   userImg = decodiertes Bild (ImageBitmap/Image/Canvas) fuer layout.image;
                                        extraImgs = { [imgId]: drawable } fuer layout.images (fehlt ein Eintrag, wird das Bild ausgelassen).
                                        Reihenfolge v2: Hintergrundfarbe, Hintergrundbild, Bilder 'below', Textflaechen/Verlaeufe, Text, Bilder 'above', Wortmarke, Datum.
                                        (v1-Layout: unveraenderte alte Reihenfolge, pixelgleich.)
     coverRenderCanvas(layout, scale, bgUrl, userImg?, extraImgs?)   fehlt userImg bzw. ein Zusatzbild, wird window.coverImageLoad(id) gefragt;
                                        fehlt ein Zusatzbild danach, wirft es coverError('Ein zusätzliches Bild des Titelblatts konnte nicht geladen werden. ...').
     coverHtml(layout, imgUrl)          unsichtbarer Textlayer; gedrehte Bloecke/Datum mit transform: rotate(<rot>deg) um dieselbe Mitte (transform-origin).

   LAYOUT-ERGEBNIS v2 (zusaetzlich zu v1-Feldern: templateId, page, ink, blocks, date, logo, warnings, background)
     v: 2, mode, bgColor: '#RRGGBB' | null (Vorlage), background: URL | null,
     blocks[]: { key ('title'|'slogan'|'name'|'extra1'), id ('title'|'subtitle'|'name'|'extra1'), lines[], sizePx, sizePt, lineHeightPx, family, weight, font,
                 x, y, w, h (Seitenanteile), ink, align, fits, splitWord (true = Einzelwort an Zeichengrenze geteilt), tx, tw (Textausdehnung),
                 rot (Grad, 0 = ungedreht), cx, cy (Drehpunkt = Mitte des Textfelds), hull: [4 Ecken {x,y}] der gedrehten Textausdehnung (tx..tx+tw, y..y+h),
                 bbox: {x,y,w,h} achsenparallele Huelle des gedrehten Textfelds (x..x+w) }
     date: { text, sizePx, x1 (rechter Rand, v1-kompatibel), ax (Ankerpunkt), align, y, h, w, tw, ink, family, weight, rot, cx, cy, hull, bbox } | null
     logo: { x, y, w, h, variant ('light'|'dark'), ink, pos } | null
     image: null | { id, fit, src: {x,y,w,h} (Originalpixel), dst: {x,y,w,h} (Seitenanteile), ppi }
     images[]: { id, imgId, x, y, w, h (ungedrehtes Ziel-Rechteck, obere linke Ecke, Seitenanteile; h = null ohne iw/ih), cx, cy (Mitte), rot, z, opacity,
                 iw, ih, ppi (Pixelbreite / Druckbreite in Zoll) | null, hull: [4 Ecken] | null, bbox | null }      (immer vorhanden, [] ohne Zusatzbilder)
     panels[]: { x, y, w, h, r (Radius in Seitenbreiten-Anteil), color, alpha, rot, cx, cy }   rot != 0: Flaeche dreht mit ihrem Block um (cx, cy)
                 (Bloecke mit verschiedener Drehung bilden nie eine gemeinsame Flaeche)
     gradients[]: { x, y, w, h, from: '#RRGGBB', alpha, dir: 'down'|'up' }   Verlauf bleibt seitenbreit und waagrecht; seine Hoehe deckt die gedrehte Huelle ab
     readability, warnings[]: { fieldId ('title'|'subtitle'|'name'|'extra1'|'date'|'logo'|'image'|'image:<images[].id>'), imageId? (bei Zusatzbildern),
                 kind: 'cut'|'outside'|'overlap'|'unreadable'|'lowres', message }
     Pruefung gedrehter Elemente: 'outside'/'cut' mit der achsenparallelen Huelle (bbox) der gedrehten Ecken; 'overlap' exakt per Trennachsen-Test (SAT)
     auf den gedrehten Rechtecken (beide ungedreht: unveraenderter Rechtecktest). Zusatzbilder: 'outside' nur wenn GANZ ausserhalb der Seite,
     'overlap' (fieldId 'image:<id>') wenn das Bild die Wortmarke beruehrt, 'lowres' unter 150 ppi. Warnungen von Zusatzbildern sperren den Export nie
     (coverExportBlockers liefert sie nicht); nur ein fehlendes Bild sperrt (coverRenderCanvas wirft).
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
const COVER_LIMITS = { fontPt: [6, 200], pos: [-0.5, 1.5], w: [0.05, 1.5], zoom: [0.3, 8], text: 600, rot: [-180, 180], imgW: [0.02, 1.5], opacity: [0.05, 1] };
const COVER_MAX_IMAGES = 4;
const COVER_IMG_ENTRY_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
/* Drehung: Grad auf 0.5 gerundet, -180..180 (ungueltig -> 0) */
function coverRotNorm(v) {
  const n = coverClampNum(v, COVER_LIMITS.rot[0], COVER_LIMITS.rot[1], 0);
  const r = Math.round(n * 2) / 2;
  return r === 0 ? 0 : r;   // -0 -> 0
}
/* Ecken eines um (cx, cy) gedrehten Rechtecks in Seitenanteilen; gedreht wird in Seitenpixeln (A4 ist nicht quadratisch) */
function coverRotCorners(x, y, w, h, cx, cy, rot) {
  const W = COVER_PAGE.w, H = COVER_PAGE.h, a = (rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([px, py]) => {
    const dx = (px - cx) * W, dy = (py - cy) * H;
    return { x: cx + (dx * c - dy * s) / W, y: cy + (dx * s + dy * c) / H };
  });
}
function coverHullBox(pts) {
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y), x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
/* Trennachsen-Test (SAT) fuer zwei konvexe Vierecke in Seitenpixeln; eps in Pixeln (Beruehren zaehlt nicht als Ueberlappung) */
function coverPolysOverlap(A, B, epsPx) {
  const W = COVER_PAGE.w, H = COVER_PAGE.h, e = epsPx == null ? 1 : epsPx;
  const pa = A.map(p => ({ x: p.x * W, y: p.y * H })), pb = B.map(p => ({ x: p.x * W, y: p.y * H }));
  for (const poly of [pa, pb]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length], len = Math.hypot(q.x - p.x, q.y - p.y);
      if (!len) continue;
      const nx = -(q.y - p.y) / len, ny = (q.x - p.x) / len;
      const proj = (P) => { let lo = Infinity, hi = -Infinity; P.forEach((v) => { const d = v.x * nx + v.y * ny; lo = Math.min(lo, d); hi = Math.max(hi, d); }); return [lo, hi]; };
      const [a0, a1] = proj(pa), [b0, b1] = proj(pb);
      if (a1 <= b0 + e || b1 <= a0 + e) return false;
    }
  }
  return true;
}
/* Eintrag fuer model.images aus dem Ergebnis von coverImageImport ({ id, w, h }) */
function coverNewImageEntry(imp, opts) {
  const o = opts || {};
  return coverSanitizeImageEntry({ id: o.id || ('ci-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)), imgId: imp && imp.id, iw: imp && imp.w, ih: imp && imp.h, x: o.x != null ? o.x : 0.5, y: o.y != null ? o.y : 0.5, w: o.w != null ? o.w : 0.4, rot: o.rot || 0, z: o.z === 'above' ? 'above' : 'below', opacity: o.opacity });
}
function coverSanitizeImageEntry(e) {
  if (!e || typeof e !== 'object') return null;
  if (typeof e.id !== 'string' || !COVER_IMG_ENTRY_ID_RE.test(e.id)) return null;
  if (typeof e.imgId !== 'string' || !e.imgId.startsWith('cover-') || e.imgId.length > 160) return null;
  const o = { id: e.id, imgId: e.imgId,
    x: coverRound(coverClampNum(e.x, COVER_LIMITS.pos[0], COVER_LIMITS.pos[1], 0.5)), y: coverRound(coverClampNum(e.y, COVER_LIMITS.pos[0], COVER_LIMITS.pos[1], 0.5)),
    w: coverRound(coverClampNum(e.w, COVER_LIMITS.imgW[0], COVER_LIMITS.imgW[1], 0.4)), rot: coverRotNorm(e.rot), z: e.z === 'above' ? 'above' : 'below' };
  const op = coverClampNum(e.opacity, COVER_LIMITS.opacity[0], COVER_LIMITS.opacity[1], 1);
  if (op < 1) o.opacity = coverRound(op, 3);
  const iw = Math.round(coverClampNum(e.iw, 1, 100000, 0)), ih = Math.round(coverClampNum(e.ih, 1, 100000, 0));
  if (iw && ih) { o.iw = iw; o.ih = ih; }
  return o;
}

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
    images: [],
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
  if (Array.isArray(r.images)) {
    const seen = new Set();
    r.images.forEach((e) => {
      if (out.images.length >= COVER_MAX_IMAGES) return;
      const o = coverSanitizeImageEntry(e);
      if (o && !seen.has(o.id)) { seen.add(o.id); out.images.push(o); }
    });
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
    const rot = coverRotNorm(f.rot); if (rot) o.rot = rot;
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
  return !!m && m.mode === 'template' && !Object.keys(m.fields || {}).length && !(m.images && m.images.length) && (!m.logo || (m.logo.pos === 'top-right' && m.logo.variant === 'auto')) && (!m.readability || m.readability === 'none');
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
    first.blocks.forEach((b) => { const f = Object.assign({}, m.fields[coverBlockId(b)], { x: coverRound(b.x), y: coverRound(b.y), w: coverRound(b.w) }); delete f.rot; m.fields[coverBlockId(b)] = f; });
    m.arrange = name;
    return coverModelSanitize(m);
  }
  if (!ids.length) { m.arrange = name; return coverModelSanitize(m); }
  const align = name.endsWith('mittig') || name === 'Mittig' ? 'center' : 'left';
  ids.forEach((id) => { const f = Object.assign({}, m.fields[id], { x: 0.09, w: 0.82, align }); delete f.y; delete f.rot; m.fields[id] = f; });
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

/* ---------- Pruefregeln ----------
   v83: Mit echter Schriftmessung (layout.geometry === 'ink') gelten die SICHTBAREN Inhalte: Textzeilen nach dem Umbruch mit ihrer
   gemessenen Tinte (nicht das Textfeld), die Wortmarke mit ihrer Pfadflaeche (nicht die viewBox). Ueberlappung = Tinte beruehrt sich
   oder steht naeher als COVER_MIN_GAP_MM; 'margin' = Tinte naeher als COVER_SAFE_MM am Seitenrand (Druckbereich, sperrt nie).
   Solange Schriften noch laden (layout.fontsPending), entstehen keine Ueberlappungs- oder Randhinweise (sie waeren nicht belastbar).
   Ueberlappungswarnungen tragen otherId (das zweite Element). */
const COVER_MIN_GAP_MM = 1, COVER_SAFE_MM = 4;
function coverValidate(layout) {
  const out = [];
  if (!layout) return out;
  const eps = 0.002, L = COVER_FIELD_LABEL, W = COVER_PAGE.w, H = COVER_PAGE.h, MM = W / 210;
  const add = (fieldId, kind, message, extra) => out.push(Object.assign({ fieldId, kind, message }, extra || {}));
  const ink = layout.geometry === 'ink', pending = !!layout.fontsPending;
  const rects = [];
  const outsideMsg = (lab, rot) => `${lab} liegt teilweise ausserhalb der Seite. ${rot ? 'Verschiebe das Textfeld, mache es schmaler oder drehe es weniger.' : 'Verschiebe das Textfeld oder mache es schmaler.'}`;
  (layout.blocks || []).forEach((b) => {
    const id = coverBlockId(b), lab = L[id] || 'Der Text';
    if (b.splitWord) add(id, 'cut', `${lab} enthält ein Wort, das breiter ist als das Textfeld und mitten im Wort getrennt wird. Verbreitere das Textfeld, verkleinere die Schrift oder kürze den Text.`);
    const useInk = ink && b.inkBox;
    // gedreht: achsenparallele Huelle der gedrehten Ecken
    const g = useInk ? (b.rot && b.inkHull ? coverHullBox(b.inkHull) : b.inkBox) : (b.rot && b.bbox ? b.bbox : b);
    if (g.y + g.h > 1 + eps) add(id, 'cut', `${lab} ragt unten über die Seite hinaus und wird abgeschnitten. Kürze den Text, verkleinere die Schrift oder verbreitere das Textfeld.`);
    else if (b.fits === false) add(id, 'cut', `${lab} ist zu lang für dieses Titelblatt. Bitte kürzen (er passt nur in kleiner, nicht lesbarer Schrift).`);
    if (g.x < -eps || g.x + g.w > 1 + eps || g.y < -eps) add(id, 'outside', outsideMsg(lab, b.rot));
    else if (useInk && !pending && g.y + g.h <= 1 + eps && coverNearEdge(g, COVER_SAFE_MM * MM)) add(id, 'margin', `${lab} steht weniger als ${COVER_SAFE_MM} mm vom Seitenrand entfernt und kann beim Drucken angeschnitten werden. Verschiebe ihn etwas nach innen.`);
    if (useInk) rects.push({ id, lines: b.rot ? null : b.inkLines, box: b.inkBox, poly: b.rot ? b.inkHull : null });
    else rects.push({ id, box: { x: b.tx != null ? b.tx : b.x, y: b.y, w: b.tw != null ? b.tw : b.w, h: b.h }, poly: b.rot && b.hull ? b.hull : null });
  });
  const d = layout.date;
  if (d) {
    const dx = d.align === 'left' ? d.ax : (d.align === 'center' ? d.ax - d.tw / 2 : d.ax - d.tw);
    const useInk = ink && d.inkBox;
    const g = useInk ? (d.rot && d.inkHull ? coverHullBox(d.inkHull) : d.inkBox) : (d.rot && d.bbox ? d.bbox : { x: dx, y: d.y, w: d.tw, h: d.h });
    if (g.x < -eps || g.x + g.w > 1 + eps || g.y < -eps || g.y + g.h > 1 + eps) add('date', 'outside', `${L.date} liegt teilweise ausserhalb der Seite. Verschiebe es nach innen.`);
    else if (useInk && !pending && coverNearEdge(g, COVER_SAFE_MM * MM)) add('date', 'margin', `${L.date} steht weniger als ${COVER_SAFE_MM} mm vom Seitenrand entfernt und kann beim Drucken angeschnitten werden. Verschiebe es etwas nach innen.`);
    if (useInk) rects.push({ id: 'date', box: d.inkBox, poly: d.rot ? d.inkHull : null });
    else rects.push({ id: 'date', box: { x: dx, y: d.y, w: d.tw, h: d.h }, poly: d.rot && d.hull ? d.hull : null });
  }
  const lg = layout.logo;
  if (lg) {
    if (lg.x < -eps || lg.x + lg.w > 1 + eps || lg.y < -eps || lg.y + lg.h > 1 + eps) add('logo', 'outside', `${L.logo} liegt teilweise ausserhalb der Seite.`);
    rects.push({ id: 'logo', box: ink && typeof coverLogoInkBox === 'function' ? coverLogoInkBox(lg) : { x: lg.x, y: lg.y, w: lg.w, h: lg.h } });
  }
  const polyOf = r => { const b = r.box; return r.poly || [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }]; };
  const acc = { title: 'den Titel', subtitle: 'den Untertitel', name: 'den Namen', extra1: 'die weitere Zeile', date: 'das Datum', logo: 'das Logo' };
  if (!(ink && pending)) for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    let hit = false, close = false;
    if (ink) {
      if (a.poly || b.poly) hit = coverPolysOverlap(polyOf(a), polyOf(b), 0.5);
      else {
        // kleinster sichtbarer Abstand zwischen den Zeilen (Pixel); < 0 = Tinte ueberlappt
        let gap = Infinity;
        (a.lines || [a.box]).forEach(ra => (b.lines || [b.box]).forEach((rb) => { gap = Math.min(gap, coverRectGapPx(ra, rb)); }));
        hit = gap < 0; close = !hit && gap < COVER_MIN_GAP_MM * MM;
      }
    } else {
      const A = a.box, B = b.box;
      // ungedreht: unveraenderter Rechtecktest; sonst exakter Trennachsen-Test auf den gedrehten Rechtecken
      hit = (!a.poly && !b.poly) ? (A.x < B.x + B.w - eps && B.x < A.x + A.w - eps && A.y < B.y + B.h - eps && B.y < A.y + A.h - eps) : coverPolysOverlap(polyOf(a), polyOf(b), 1.5);
    }
    if (hit) add(b.id, 'overlap', `${L[b.id] || 'Ein Feld'} überlappt ${acc[a.id] || 'ein anderes Feld'}. Verschiebe eines der beiden Felder.`, { otherId: a.id });
    else if (close) add(b.id, 'overlap', `${L[b.id] || 'Ein Feld'} berührt fast ${acc[a.id] || 'ein anderes Feld'} (weniger als ${COVER_MIN_GAP_MM} mm Abstand). Verschiebe eines der beiden Felder.`, { otherId: a.id, near: true });
  }
  if (layout.mode === 'custom' && !layout.image && layout.bgColor && layout.readability !== 'gradient') {
    const behind = (id) => (id !== 'date' && layout.readability === 'panel') ? COVER_PAPER : layout.bgColor;   // Datum liegt nie auf der Textflaeche
    const texts = (layout.blocks || []).map(b => ({ id: coverBlockId(b), ink: b.ink })).concat(d ? [{ id: 'date', ink: d.ink }] : []);
    texts.forEach(t => { if (coverContrast(t.ink, behind(t.id)) < 3) add(t.id, 'unreadable', 'Der Text ist hier schwer lesbar. Wähle eine andere Farbe oder aktiviere eine Textfläche.'); });
  } else if (layout.readability === 'panel') {
    (layout.blocks || []).forEach(b => { if (coverContrast(b.ink, COVER_PAPER) < 3) add(coverBlockId(b), 'unreadable', 'Der Text ist hier schwer lesbar. Wähle eine andere Farbe oder aktiviere eine Textfläche.'); });
  }
  const page = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], logoPoly = lg ? polyOf({ box: ink && typeof coverLogoInkBox === 'function' ? coverLogoInkBox(lg) : { x: lg.x, y: lg.y, w: lg.w, h: lg.h } }) : null;
  (layout.images || []).forEach((im, k) => {
    const fid = 'image:' + im.id, nr = (layout.images.length > 1 ? ` ${k + 1}` : '');
    const push = (kind, message) => out.push({ fieldId: fid, imageId: im.id, kind, message });
    if (im.hull) {
      if (!coverPolysOverlap(im.hull, page, 0)) push('outside', `Das zusätzliche Bild${nr} liegt ganz ausserhalb der Seite und ist nicht zu sehen. Verschiebe es auf die Seite oder entferne es.`);
      else if (logoPoly && coverPolysOverlap(im.hull, logoPoly, 1.5)) push('overlap', `Das zusätzliche Bild${nr} berührt das Logo. Die Wortmarke bleibt sichtbar, ist aber schlechter lesbar. Verschiebe oder verkleinere das Bild.`);
    }
    if (im.ppi != null && im.ppi < 150) push('lowres', `Das zusätzliche Bild${nr} hat in dieser Grösse nur etwa ${Math.round(im.ppi)} ppi. Für den Druck möglicherweise unscharf. Verkleinere es oder wähle ein grösseres Bild.`);
  });
  if (layout.image && layout.image.ppi != null && layout.image.ppi < 150) add('image', 'lowres', `Das Bild hat nur etwa ${Math.round(layout.image.ppi)} ppi auf A4. Für den Druck möglicherweise unscharf.`);
  return out;
}
/* Abstand zweier Rechtecke in Seitenpixeln (negativ = Ueberlappung, Wert = Eindringtiefe der kleineren Achse) */
function coverRectGapPx(a, b) {
  const W = COVER_PAGE.w, H = COVER_PAGE.h;
  const gx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)) * W, gy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)) * H;
  return Math.max(gx, gy);
}
function coverNearEdge(g, px) {
  const W = COVER_PAGE.w, H = COVER_PAGE.h;
  return g.x * W < px || (1 - g.x - g.w) * W < px || g.y * H < px || (1 - g.y - g.h) * H < px;
}
function coverExportBlockers(layout) {
  if (!layout) return [];
  if (layout.v !== COVER_SCHEMA_V2) return (layout.warnings || []).map(w => ({ fieldId: w.key || '', kind: 'cut', message: w.message }));
  return (layout.warnings || []).filter(w => (w.kind === 'cut' || w.kind === 'outside') && !w.imageId);
}

/* ---------- v83: Automatisch ausrichten (nur auf ausdrueckliche Aktion im Editor) ----------
   coverAutoAlign(model, input) -> { model, moves: [{ id, dxMm, dyMm }], unresolved: [{ id, reason }] }   (rein, schreibt nichts)
   Loest Ueberlappungen ('overlap') und zu knappe Raender ('margin') der Textfelder und des Datums mit der KLEINSTEN Verschiebung
   (eine Achse, Sicherheitsabstand COVER_ALIGN_GAP_MM zur sichtbaren Tinte aller anderen Elemente, innerhalb COVER_SAFE_MM).
   Aendert nur x/y der verschobenen Felder (nie Text, Schrift, Groesse, Breite, Drehung). Fliessende Felder, die sich dadurch
   bewegen wuerden, werden an ihrer bisherigen Stelle festgehalten. Bewegt wird das nachrangige Feld eines Paars
   (Reihenfolge Titel, Untertitel, Name, weitere Zeile, Datum); das Logo bleibt stehen. Gedrehte Felder werden nicht bewegt. */
const COVER_ALIGN_GAP_MM = 3;
function coverAutoAlign(model, input) {
  const W = COVER_PAGE.w, H = COVER_PAGE.h, MM = W / 210, gapX = COVER_ALIGN_GAP_MM * MM / W, gapY = COVER_ALIGN_GAP_MM * MM / H;
  const safeX = COVER_SAFE_MM * MM / W, safeY = COVER_SAFE_MM * MM / H;
  let m = coverModelSanitize(model);
  const lay = (mm) => coverLayout(Object.assign({}, input || {}, { v2: mm }));
  const bad = (L) => (L.warnings || []).filter(w => (w.kind === 'overlap' && !w.imageId) || w.kind === 'margin');
  const moverOf = (w) => (w.fieldId === 'logo' ? w.otherId : w.fieldId);
  const inkOf = (L, id) => {
    if (id === 'date') return L.date && (L.date.rot && L.date.inkHull ? coverHullBox(L.date.inkHull) : L.date.inkBox);
    if (id === 'logo') return coverLogoInkBox(L.logo);
    const b = (L.blocks || []).find(x => coverBlockId(x) === id); return b && (b.rot && b.inkHull ? coverHullBox(b.inkHull) : b.inkBox);
  };
  const ORDER = ['title', 'subtitle', 'name', 'extra1'];   // Lesereihenfolge bleibt erhalten (nichts springt ueber ein vorrangiges Feld)
  const posOf = (L, id) => { if (id === 'date') return L.date ? { x: L.date.fx, y: L.date.y } : null; const b = (L.blocks || []).find(x => coverBlockId(x) === id); return b ? { x: b.x, y: b.y } : null; };
  const rotOf = (L, id) => { if (id === 'date') return L.date && L.date.rot; const b = (L.blocks || []).find(x => coverBlockId(x) === id); return b && b.rot; };
  const moves = {}, unresolved = {};
  let L = lay(m);
  if (L.geometry !== 'ink') return { model: m, moves: [], unresolved: bad(L).map(w => ({ id: moverOf(w), reason: 'Messung nicht möglich' })) };
  for (let round = 0; round < 8; round++) {
    const prio = (id) => { const i = ORDER.indexOf(id); return i < 0 ? 9 : i; };
    const ws = bad(L).filter(w => !unresolved[moverOf(w)]).sort((x, y) => prio(moverOf(x)) - prio(moverOf(y)));
    if (!ws.length) break;
    const id = moverOf(ws[0]);
    if (!id || id === 'logo') { unresolved[id || '?'] = 'Logo'; continue; }
    if (rotOf(L, id)) { unresolved[id] = 'gedreht'; continue; }
    const U = inkOf(L, id), P = posOf(L, id);
    if (!U || !P) { unresolved[id] = 'Messung nicht möglich'; continue; }
    const mi = ORDER.indexOf(id);
    // Nachfolger in derselben Spalte (unterhalb, ungedreht) wandern bei einer Verschiebung nach unten mit (Abstaende untereinander bleiben)
    const followers = mi < 0 ? [] : ORDER.slice(mi + 1).filter((o) => { const q = inkOf(L, o); return q && !rotOf(L, o) && q.y >= U.y && !(q.x >= U.x + U.w || U.x >= q.x + q.w); });
    const all = ['title', 'subtitle', 'name', 'extra1', 'date', 'logo'].filter(o => o !== id).map(o => ({ o, b: inkOf(L, o) })).filter(x => x.b);
    const inSafe = (r) => r.x >= safeX - 1e-6 && r.y >= safeY - 1e-6 && r.x + r.w <= 1 - safeX + 1e-6 && r.y + r.h <= 1 - safeY + 1e-6;
    // gleiche Spalte: bisherige Reihenfolge von oben nach unten bleibt (kein Feld springt ueber ein anderes Textfeld)
    //   (ueberlappten sich die beiden schon, gilt die Lesereihenfolge Titel, Untertitel, Name, weitere Zeile)
    const free = (r, r0, ri, obst) => obst.every(({ o, b: q }) => {
      const sepX = r.x >= q.x + q.w + gapX - 1e-6 || q.x >= r.x + r.w + gapX - 1e-6;
      if (!sepX && r0 && ORDER.indexOf(o) >= 0) {
        const apart = r0.y + r0.h <= q.y + 1e-6 || q.y + q.h <= r0.y + 1e-6;
        const wasAbove = apart ? r0.y < q.y : ri < ORDER.indexOf(o);
        if (wasAbove !== (r.y + r.h / 2 < q.y + q.h / 2)) return false;
      }
      return sepX || r.y >= q.y + q.h + gapY - 1e-6 || q.y >= r.y + r.h + gapY - 1e-6;
    });
    const groupOf = (dy) => (dy > 0 ? [id].concat(followers) : [id]);
    const okAt = (dx, dy) => {
      const grp = groupOf(dy);
      const obst = all.filter(x => !grp.includes(x.o));
      return grp.every((g) => { const q = g === id ? U : inkOf(L, g); const r = { x: q.x + dx, y: q.y + dy, w: q.w, h: q.h }; return inSafe(r) && free(r, ORDER.indexOf(g) >= 0 ? q : null, ORDER.indexOf(g), obst); });
    };
    const cands = [[0, safeY - U.y], [safeX - U.x, 0], [1 - safeX - (U.x + U.w), 0], [0, 1 - safeY - (U.y + U.h)]];
    all.forEach(({ b: o }) => {
      cands.push([0, o.y + o.h + gapY - U.y], [0, o.y - gapY - (U.y + U.h)], [o.x + o.w + gapX - U.x, 0], [o.x - gapX - (U.x + U.w), 0]);
      followers.forEach((f) => { const q = inkOf(L, f); cands.push([0, o.y + o.h + gapY - q.y]); });   // Nachfolger muss unter ein Hindernis
    });
    const mmOf = ([dx, dy]) => Math.hypot(dx * W, dy * H) / MM;
    const best = cands.filter(([dx, dy]) => (dx || dy) && okAt(dx, dy)).sort((p1, p2) => mmOf(p1) - mmOf(p2))[0];
    if (!best) { unresolved[id] = 'kein Platz'; continue; }
    const grp = groupOf(best[1]);
    // Felder festhalten, die ohne eigene Position fliessen (sonst bewegen sie sich mit)
    const before = {}; ORDER.forEach((o) => { const p = posOf(L, o); if (p) before[o] = p; });
    const next = coverModelSanitize(m);
    Object.keys(before).forEach((o) => { if (!grp.includes(o) && (!next.fields[o] || next.fields[o].y == null)) next.fields[o] = Object.assign({}, next.fields[o], { y: coverRound(before[o].y) }); });
    grp.forEach((g) => { const pp = g === id ? P : posOf(L, g); next.fields[g] = Object.assign({}, next.fields[g], { x: coverRound(pp.x + best[0]), y: coverRound(pp.y + best[1]) }); });
    if (id === 'date') { const d = L.date; const f = next.fields.date; f.w = coverRound(d.w); }
    const L2 = lay(coverModelSanitize(next));
    if (bad(L2).length >= bad(L).length && bad(L2).some(w => moverOf(w) === id)) { unresolved[id] = 'kein Platz'; continue; }
    m = coverModelSanitize(next); L = L2;
    grp.filter(g => g !== id).forEach((g) => { const mv = moves[g] || { id: g, dxMm: 0, dyMm: 0 }; mv.dxMm = Math.round((mv.dxMm + best[0] * W / MM) * 10) / 10; mv.dyMm = Math.round((mv.dyMm + best[1] * H / MM) * 10) / 10; moves[g] = mv; });
    const mv = moves[id] || { id, dxMm: 0, dyMm: 0 };
    mv.dxMm = Math.round((mv.dxMm + best[0] * W / MM) * 10) / 10; mv.dyMm = Math.round((mv.dyMm + best[1] * H / MM) * 10) / 10;
    moves[id] = mv;
  }
  bad(L).forEach((w) => { const id = moverOf(w); if (id && !unresolved[id]) unresolved[id] = 'kein Platz'; });
  return { model: m, moves: Object.values(moves), unresolved: Object.keys(unresolved).map(id => ({ id, reason: unresolved[id] })) };
}
