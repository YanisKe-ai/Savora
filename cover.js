/* ---------- Kochbuch-Titelblaetter: zehn Vorlagen, gemeinsames Layout fuer Vorschau und PDF ----------
   Ein Titelblatt besteht aus getrennten Ebenen: Hintergrund (PNG, unveraendert, ohne Text), Savora-Symbol oben rechts,
   optionale Texte der nutzenden Person (Titel, Name, Slogan) und das Veroeffentlichungsdatum unten rechts.
   Ohne eigene Eingaben erscheinen nur Symbol und Datum. Es werden nie Namen, Beispieltitel oder Vorlagennamen gedruckt.

   Gespeichert wird pro Kochbuch (Kochbuch-Konfiguration, Schluessel savora-cookbook-config):
     cfg.cover = { v: 1, templateId, date: 'YYYY-MM-DD' (Kalenderdatum ohne Zeitzone), showDate }
   Die Texte bleiben in den bisherigen Feldern cfg.title, cfg.author (Name) und cfg.subtitle (Slogan).
   Alle Koordinaten sind relativ zur Seite (0..1) und gelten fuer Vorschau und Export gleichermassen. */

const COVER_SCHEMA_VERSION = 1;
const COVER_PAGE = { w: 794, h: 1123 };   // Referenzgroesse in CSS-Pixeln (A4); alle Schriftgroessen beziehen sich darauf
const COVER_RED = '#E64B35';              // Lesezeichen im Savora-Symbol
const COVER_DEFAULT_ID = 'pop';
const COVER_LOGO_BOX = { x: 0.80, y: 0.04, w: 0.13 };
const COVER_DATE_ZONE = { x1: 0.93, y: 0.945, h: 0.03, size: 13 };   // rechtsbuendig; Spezialfaelle je Vorlage unten
const COVER_FONTS = {
  title: { family: "'Sofia Sans Extra Condensed', 'Arial Narrow', sans-serif", weight: 800, max: 104, min: 34, lh: 1.04 },
  slogan: { family: "'Roboto', system-ui, sans-serif", weight: 400, max: 30, min: 15, lh: 1.25 },
  name: { family: "'Roboto', system-ui, sans-serif", weight: 700, max: 22, min: 13, lh: 1.3 },
  date: { family: "'Roboto', system-ui, sans-serif", weight: 500 },
};
const COVER_BLOCK_WEIGHTS = { title: 3, slogan: 1.4, name: 1 };
const COVER_DARK = '#171717', COVER_LIGHT = '#FFFFFF';

/* text: sichere Zone fuer Titel, Slogan und Name (relativ zur Seite). Die Illustrationen werden nicht ueberdeckt:
   Zonen enden oberhalb des Motivs (Lieblingsbuch: rechts vom linken Band, Bistro: oberhalb des Dampfs). */
const COVER_TEMPLATES = [
  { id: 'pop', name: 'Pop', file: 'pop', ink: COVER_DARK, logoVariant: 'light', text: { x: 0.09, y: 0.13, w: 0.82, h: 0.25 } },
  { id: 'lieblingsbuch', name: 'Lieblingsbuch', file: 'lieblingsbuch', ink: COVER_LIGHT, logoVariant: 'dark', text: { x: 0.27, y: 0.13, w: 0.64, h: 0.27 } },
  { id: 'tomate', name: 'Tomate', file: 'tomate', ink: COVER_DARK, logoVariant: 'light', text: { x: 0.09, y: 0.13, w: 0.82, h: 0.35 } },
  { id: 'salbei', name: 'Salbei', file: 'salbei', ink: COVER_DARK, logoVariant: 'light', text: { x: 0.09, y: 0.13, w: 0.80, h: 0.18 }, date: { x1: 0.955, size: 11 } },
  { id: 'nachtkueche', name: 'Nachtküche', file: 'nachtkueche', ink: COVER_LIGHT, logoVariant: 'dark', text: { x: 0.09, y: 0.13, w: 0.82, h: 0.27 } },
  { id: 'citrus', name: 'Citrus', file: 'citrus', ink: COVER_LIGHT, logoVariant: 'dark', text: { x: 0.09, y: 0.13, w: 0.82, h: 0.21 } },
  { id: 'bistro', name: 'Bistro', file: 'bistro', ink: COVER_DARK, logoVariant: 'light', text: { x: 0.09, y: 0.13, w: 0.82, h: 0.15 } },
  { id: 'garten', name: 'Garten', file: 'garten', ink: COVER_DARK, logoVariant: 'light', text: { x: 0.09, y: 0.13, w: 0.82, h: 0.18 } },
  { id: 'sonnenkueche', name: 'Sonnenküche', file: 'sonnenkueche', ink: COVER_DARK, logoVariant: 'light', text: { x: 0.09, y: 0.13, w: 0.82, h: 0.23 } },
  { id: 'ofenglueck', name: 'Ofenglück', file: 'ofenglueck', ink: COVER_DARK, logoVariant: 'light', text: { x: 0.09, y: 0.13, w: 0.82, h: 0.24 } },
];
const COVER_IMAGE_SIZE = { default: [1055, 1491], ofenglueck: [1054, 1492] };
const COVER_FILE_NUMBER = { pop: '01', lieblingsbuch: '02', tomate: '03', salbei: '04', nachtkueche: '05', citrus: '06', bistro: '07', garten: '08', sonnenkueche: '09', ofenglueck: '10' };
function coverTemplateById(id) { return COVER_TEMPLATES.find(t => t.id === id) || null; }
function coverValidTemplateId(id) { return coverTemplateById(id) ? id : COVER_DEFAULT_ID; }
function coverBackgroundUrl(id) { const t = coverTemplateById(coverValidTemplateId(id)); return `assets/covers/${COVER_FILE_NUMBER[t.id]}-${t.file}.png`; }
function coverThumbUrl(id) { const t = coverTemplateById(coverValidTemplateId(id)); return `assets/covers/thumbs/${COVER_FILE_NUMBER[t.id]}-${t.file}.jpg`; }

/* ---------- Datum: Kalenderdatum als Text, nie ueber Date/UTC verschoben ---------- */
function coverTodayKey() {
  const d = new Date();   // lokales heutiges Datum
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function coverIsValidDateKey(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1) return false;
  const dim = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return d <= dim && y >= 1900 && y <= 2999;
}
function coverFormatDate(key) {
  if (!coverIsValidDateKey(key)) return '';
  const [y, m, d] = key.split('-');
  return `${d}.${m}.${y}`;   // TT.MM.JJJJ
}
/* Eingabe aus dem Datumsfeld oder altem Format auf ein gueltiges Kalenderdatum bringen, sonst '' */
function coverNormalizeDate(v) {
  const s = String(v == null ? '' : v).trim();
  if (coverIsValidDateKey(s)) return s;
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (m) { const k = `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`; return coverIsValidDateKey(k) ? k : ''; }
  return '';
}

/* ---------- Konfiguration: defensiv lesen, nie ueberschreiben was die Person gesetzt hat ---------- */
function coverSanitizeConfig(raw, forceDate) {
  const c = raw && typeof raw === 'object' ? raw : {};
  const date = coverNormalizeDate(c.date);
  return {
    v: COVER_SCHEMA_VERSION,
    templateId: coverValidTemplateId(c.templateId),
    date: date || (forceDate ? coverTodayKey() : ''),
    showDate: c.showDate !== false,
  };
}
/* Stellt sicher, dass die Kochbuch-Konfiguration ein Titelblatt hat. Beim ersten Anlegen wird das lokale heutige
   Datum einmalig gespeichert (und bleibt danach stabil). Ohne bestehende Konfiguration wird eine angelegt. */
function coverEnsureConfig() {
  const cfg = readJsonKey(COOKBOOK_CONFIG_KEY, null);
  const c = cfg && cfg.cover;
  const ok = c && c.v === COVER_SCHEMA_VERSION && coverIsValidDateKey(c.date) && coverTemplateById(c.templateId);
  if (!ok) {
    // Nur das Titelblatt ergaenzen. Eine noch nie gespeicherte Auswahl (items) bleibt "alle Rezepte" und wird hier nicht eingefroren.
    const next = { ...(cfg || {}), cover: coverSanitizeConfig(c, !(c && coverIsValidDateKey(c.date))) };
    writeJsonKey(COOKBOOK_CONFIG_KEY, next);
  }
  return typeof getCookbookConfig === 'function' ? getCookbookConfig() : readJsonKey(COOKBOOK_CONFIG_KEY, null);
}

/* ---------- Texte messen und umbrechen (eine Implementierung fuer Vorschau und Export) ---------- */
let _coverMeasureCtx = null;
function coverMeasureDefault(text, font) {
  if (!_coverMeasureCtx) _coverMeasureCtx = document.createElement('canvas').getContext('2d');
  _coverMeasureCtx.font = font;
  return _coverMeasureCtx.measureText(text).width;
}
function coverCleanText(s) {
  return String(s == null ? '' : s).replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/[ \t ]+/g, ' ').trim()).filter((l, i, a) => l || (i > 0 && i < a.length - 1)).join('\n').trim();
}
// Zeilenumbruch nach Woertern; ein einzelnes Wort, das nicht in die Breite passt, wird an Zeichengrenzen geteilt
function coverWrap(text, widthPx, fontOf, measure) {
  const lines = [];
  text.split('\n').forEach((para) => {
    if (!para.trim()) { lines.push(''); return; }
    let cur = '';
    para.split(' ').forEach((word) => {
      const trial = cur ? cur + ' ' + word : word;
      if (measure(trial, fontOf) <= widthPx) { cur = trial; return; }
      if (cur) { lines.push(cur); cur = ''; }
      if (measure(word, fontOf) <= widthPx) { cur = word; return; }
      let chunk = '';
      for (const ch of Array.from(word)) {
        if (measure(chunk + ch, fontOf) > widthPx && chunk) { lines.push(chunk); chunk = ch; } else chunk += ch;
      }
      cur = chunk;
    });
    lines.push(cur);
  });
  return lines;
}
function coverFitBlock(key, text, zone, measure) {
  const f = COVER_FONTS[key];
  const widthPx = zone.w * COVER_PAGE.w, heightPx = zone.h * COVER_PAGE.h;
  for (let size = f.max; size >= f.min; size -= 1) {
    const font = `${f.weight} ${size}px ${f.family}`;
    const lines = coverWrap(text, widthPx, font, measure);
    const lh = size * f.lh;
    if (lines.length * lh <= heightPx + 0.5) return { lines, size, lh, fits: true };
  }
  const size = f.min, font = `${f.weight} ${size}px ${f.family}`;
  return { lines: coverWrap(text, widthPx, font, measure), size, lh: size * f.lh, fits: false };
}
const COVER_BLOCK_LABEL = { title: 'Der Titel', slogan: 'Der Untertitel', name: 'Der Name' };

/* Berechnet das gesamte Titelblatt. input: { title, name, slogan, date, showDate, templateId, logo }.
   measure ist austauschbar (Tests). Ergebnis ist rein beschreibend (Zahlen und Zeilen) und wird von Vorschau und Export gleich gezeichnet. */
function coverLayout(input, measure) {
  const m = measure || coverMeasureDefault;
  const tpl = coverTemplateById(coverValidTemplateId(input && input.templateId));
  const texts = { title: coverCleanText(input && input.title), slogan: coverCleanText(input && input.slogan), name: coverCleanText(input && input.name) };
  const present = ['title', 'slogan', 'name'].filter(k => texts[k]);
  const warnings = [];
  const blocks = [];
  if (present.length) {
    const z = tpl.text, gap = 0.016;
    const totalW = present.reduce((a, k) => a + COVER_BLOCK_WEIGHTS[k], 0);
    const avail = z.h - gap * (present.length - 1);
    let y = z.y;
    present.forEach((k) => {
      const h = avail * COVER_BLOCK_WEIGHTS[k] / totalW;
      const fit = coverFitBlock(k, texts[k], { w: z.w, h }, m);
      const usedH = Math.min(h, (fit.lines.length * fit.lh) / COVER_PAGE.h);
      if (!fit.fits) warnings.push({ key: k, message: `${COVER_BLOCK_LABEL[k]} ist zu lang für dieses Titelblatt. Bitte kürzen (er passt nur in kleiner, nicht lesbarer Schrift).` });
      blocks.push({ key: k, lines: fit.lines, sizePx: fit.size, lineHeightPx: fit.lh, family: COVER_FONTS[k].family, weight: COVER_FONTS[k].weight, x: z.x, y, w: z.w, h: usedH, ink: tpl.ink, fits: fit.fits });
      y += usedH + gap;
    });
  }
  const dateText = input && input.showDate !== false ? coverFormatDate(input && input.date) : '';
  const dz = { ...COVER_DATE_ZONE, ...(tpl.date || {}) };
  const date = dateText ? { text: dateText, sizePx: dz.size, x1: dz.x1, y: dz.y, h: dz.h, ink: tpl.ink, family: COVER_FONTS.date.family, weight: COVER_FONTS.date.weight } : null;
  const logo = input && input.logo === false ? null : { x: COVER_LOGO_BOX.x, y: COVER_LOGO_BOX.y, w: COVER_LOGO_BOX.w, variant: tpl.logoVariant, ink: tpl.ink };
  return { templateId: tpl.id, page: COVER_PAGE, ink: tpl.ink, blocks, date, logo, warnings, background: coverBackgroundUrl(tpl.id) };
}

/* ---------- Savora-Symbol (Buch, Loeffel, Lesezeichen) als Vektor ---------- */
function coverSymbolSvg(ink, cls) {
  return `<svg class="${cls || 'savora-symbol'}" xmlns="http://www.w3.org/2000/svg" viewBox="52 86 408 346" aria-hidden="true" focusable="false"><g fill="none" stroke="${ink}" stroke-width="19" stroke-linejoin="round"><path d="M233 141 C186 103 119 92 64 101 L64 365 C130 362 192 384 229 421"/><path d="M279 141 C326 103 393 92 448 101 L448 365 C382 362 320 384 283 421"/></g><path fill="${COVER_RED}" d="M383 105 L422 105 L422 172 L402.5 160 L383 172 Z"/><path fill="${ink}" d="M256 151 C232 151 218 184 218 212 C218 237 228 251 240 264 C245 270 246 276 246 284 L246 418 Q246 425 253 425 L259 425 Q266 425 266 418 L266 284 C266 276 267 270 272 264 C284 251 294 237 294 212 C294 184 280 151 256 151 Z"/></svg>`;
}

/* ---------- Titelblatt als HTML (identisch fuer Vorschau und PDF); Nutzereingaben werden nur als Text eingesetzt ---------- */
/* Hintergrund ohne Verzerren einpassen: Seitenverhaeltnis des Bildes leicht vom A4-Format entfernt -> minimaler, mittiger Beschnitt */
function coverBgRect(templateId, W, H) {
  const sz = COVER_IMAGE_SIZE[templateId] || COVER_IMAGE_SIZE.default;
  const imgAspect = sz[0] / sz[1], pageAspect = W / H;
  if (imgAspect >= pageAspect) { const w = H * imgAspect; return { x: -(w - W) / 2, y: 0, w, h: H }; }
  const h = W / imgAspect; return { x: 0, y: -(h - H) / 2, w: W, h };
}

/* ---------- Zeichnen: EINE Funktion fuer Vorschau und Export (gleiche Zahlen, gleiche Pixel) ---------- */
const COVER_SYMBOL = {
  box: [52, 86, 408, 346],   // viewBox des Symbols
  book: ['M233 141 C186 103 119 92 64 101 L64 365 C130 362 192 384 229 421', 'M279 141 C326 103 393 92 448 101 L448 365 C382 362 320 384 283 421'],
  bookmark: 'M383 105 L422 105 L422 172 L402.5 160 L383 172 Z',
  spoon: 'M256 151 C232 151 218 184 218 212 C218 237 228 251 240 264 C245 270 246 276 246 284 L246 418 Q246 425 253 425 L259 425 Q266 425 266 418 L266 284 C266 276 267 270 272 264 C284 251 294 237 294 212 C294 184 280 151 256 151 Z',
  stroke: 19,
};
function coverDrawSymbol(ctx, x, y, widthPx, ink) {
  const [vx, vy, vw] = COVER_SYMBOL.box, k = widthPx / vw;
  ctx.save(); ctx.translate(x - vx * k, y - vy * k); ctx.scale(k, k);
  ctx.lineJoin = 'round'; ctx.lineWidth = COVER_SYMBOL.stroke; ctx.strokeStyle = ink; ctx.fillStyle = ink;
  COVER_SYMBOL.book.forEach(d => ctx.stroke(new Path2D(d)));
  ctx.fillStyle = COVER_RED; ctx.fill(new Path2D(COVER_SYMBOL.bookmark));
  ctx.fillStyle = ink; ctx.fill(new Path2D(COVER_SYMBOL.spoon));
  ctx.restore();
}
function coverDraw(ctx, layout, bgImg, scale) {
  const W = layout.page.w * scale, H = layout.page.h * scale;
  ctx.save();
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);
  if (bgImg) { const r = coverBgRect(layout.templateId, W, H); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(bgImg, r.x, r.y, r.w, r.h); }
  if (layout.logo) coverDrawSymbol(ctx, layout.logo.x * W, layout.logo.y * H, layout.logo.w * W, layout.logo.ink);
  const baseline = (top, lh, font) => { ctx.font = font; const m = ctx.measureText('Hg'); const fa = m.fontBoundingBoxAscent || m.actualBoundingBoxAscent, fd = m.fontBoundingBoxDescent || m.actualBoundingBoxDescent; return top + (lh - (fa + fd)) / 2 + fa; };
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  layout.blocks.forEach((b) => {
    const size = b.sizePx * scale, lh = b.lineHeightPx * scale, font = `${b.weight} ${size}px ${b.family}`;
    ctx.fillStyle = b.ink;
    b.lines.forEach((line, i) => { if (line) ctx.fillText(line, b.x * W, baseline(b.y * H + i * lh, lh, font) + 0); });
  });
  if (layout.date) {
    const size = layout.date.sizePx * scale, font = `${layout.date.weight} ${size}px ${layout.date.family}`;
    ctx.fillStyle = layout.date.ink; ctx.textAlign = 'right';
    ctx.fillText(layout.date.text, layout.date.x1 * W, baseline(layout.date.y * H, layout.date.h * H, font));
  }
  ctx.restore();
}
function coverLoadImage(url) {
  return new Promise((resolve, reject) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = () => reject(coverError('Die Datei des gewählten Titelblatts konnte nicht geladen werden. Bitte wähle ein anderes Titelblatt.')); im.src = url; });
}
async function coverRenderCanvas(layout, scale, bgUrl) {
  await coverEnsureFonts();
  const img = await coverLoadImage(bgUrl || layout.background);
  const c = document.createElement('canvas'); c.width = Math.round(layout.page.w * scale); c.height = Math.round(layout.page.h * scale);
  coverDraw(c.getContext('2d'), layout, img, scale);
  return c;
}

/* Sichtbare Seite besteht aus dem gezeichneten Bild; der Text steckt zusaetzlich unsichtbar im Dokument
   (auswaehlbar und durchsuchbar im PDF). Nutzereingaben werden nur als Text eingesetzt, nie als HTML. */
function coverHtml(layout, imgUrl) {
  const esc = (s) => escapeHtml(String(s));
  const pct = (v) => (v * 100).toFixed(3) + '%';
  const blocks = layout.blocks.map(b => `<div class="cv-block cv-${b.key}" style="left:${pct(b.x)};top:${pct(b.y)};width:${pct(b.w)};font:${b.weight} ${b.sizePx}px/${b.lineHeightPx}px ${b.family}">${b.lines.map(l => `<div class="cv-line">${l ? esc(l) : '&nbsp;'}</div>`).join('')}</div>`).join('');
  const date = layout.date ? `<div class="cv-date" style="right:${pct(1 - layout.date.x1)};top:${pct(layout.date.y)};font:${layout.date.weight} ${layout.date.sizePx}px/1 ${layout.date.family}">${esc(layout.date.text)}</div>` : '';
  const logo = '';   // das Symbol ist reine Grafik (kein Text im PDF)
  return `<section class="pv-page pv-cover pv-cover2" data-page-kind="cover" data-cover="${esc(layout.templateId)}">${imgUrl ? `<img class="cv-bg" src="${esc(imgUrl)}" alt="" style="left:0;top:0;width:100%;height:100%">` : ''}${logo}<div class="cv-textlayer">${blocks}${date}</div></section>`;
}

function coverError(msg) { const e = new Error(msg); e.userMessage = msg; return e; }

/* ---------- Schriften und Bilder bereitstellen (Vorschau und Export warten darauf) ---------- */
let _coverFontsReady = false, _coverFontsPromise = null;
function coverEnsureFonts() {
  if (_coverFontsPromise) return _coverFontsPromise;
  _coverFontsPromise = (async () => {
    try {
      if (document.fonts && document.fonts.load) {
        await Promise.all([
          document.fonts.load("800 40px 'Sofia Sans Extra Condensed'"), document.fonts.load("400 20px 'Roboto'"),
          document.fonts.load("500 13px 'Roboto'"), document.fonts.load("700 20px 'Roboto'"),
        ]);
      }
    } catch (e) { /* document.fonts.ready bleibt die Untergrenze */ }
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    _coverFontsReady = true;
    return true;
  })();
  return _coverFontsPromise;
}
// Hintergrund als Data-URL laden (bricht mit verstaendlicher Meldung ab, wenn die Datei fehlt: nie ein leeres PDF)
async function coverBackgroundDataUrl(templateId) {
  const url = coverBackgroundUrl(templateId);
  let res;
  try { res = await fetch(url, { cache: 'force-cache' }); } catch (e) { throw coverError('Das Titelblatt konnte nicht geladen werden. Bitte prüfe die Verbindung und versuche es noch einmal.'); }
  if (!res || !res.ok) throw coverError('Die Datei des gewählten Titelblatts fehlt. Bitte wähle ein anderes Titelblatt.');
  const blob = await res.blob();
  if (!blob.size) throw coverError('Die Datei des gewählten Titelblatts ist leer. Bitte wähle ein anderes Titelblatt.');
  return await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(coverError('Das Titelblatt konnte nicht gelesen werden.')); r.readAsDataURL(blob); });
}
/* Vorschau: Seite (794 x 1123) in die Breite des Rahmens skalieren */
function coverFitPreviews() {
  document.querySelectorAll('.cover-preview').forEach((box) => {
    const s = box.clientWidth / COVER_PAGE.w;
    if (s > 0) box.style.setProperty('--cv-scale', String(s));
  });
  coverPaintPreviews();
  if (!_coverFontsReady && typeof coverEnsureFonts === 'function') coverEnsureFonts().then(() => { if (typeof coverRefresh === 'function') coverRefresh(); });
}
/* Nur das Titelblatt-Panel neu zeichnen (Fokus und Scrollposition der Texteingaben bleiben unberuehrt) */
function coverRefresh(focusId) {
  const el = document.querySelector('.cover-picker');
  if (!el || typeof coverPickerHtml !== 'function') return;
  const tmp = document.createElement('div');
  tmp.innerHTML = coverPickerHtml(getCookbookConfig());
  // Unveraendert (z. B. change nach input): nichts ersetzen, damit ein gerade gesetzter Fokus nicht verloren geht
  if (tmp.firstElementChild.dataset.sig === el.dataset.sig) return;
  const y0 = window.scrollY;
  const act = document.activeElement, keep = act && act.closest && act.closest('.cover-picker') && act.dataset ? act.dataset.id : null;
  const fresh = tmp.firstElementChild;
  el.replaceWith(fresh);
  if (typeof onAction === 'function') fresh.querySelectorAll('[data-action]').forEach(b => b.addEventListener('click', onAction));   // neue Knoepfe brauchen ihren Klick-Handler
  if (keep && !focusId) focusId = keep;
  coverFitPreviews();
  if (Math.abs(window.scrollY - y0) > 0) window.scrollTo(0, y0);   // kein Springen beim Austauschen
  if (focusId) { const b = document.querySelector(`.cover-opt[data-id="${focusId}"]`); if (b) b.focus({ preventScroll: true }); }
}

/* Vorschau zeichnen: dieselbe Funktion wie im Export (coverDraw), nur in Anzeigegroesse */
let _coverPaintToken = 0;
async function coverPaintPreviews() {
  const token = ++_coverPaintToken;
  const canvases = Array.from(document.querySelectorAll('canvas.cv-canvas'));
  for (const c of canvases) {
    let layout; try { layout = JSON.parse(c.dataset.layout); } catch (e) { continue; }
    try {
      const scale = Math.min(2, Math.max(0.5, (c.clientWidth || 320) * (window.devicePixelRatio || 1) / COVER_PAGE.w));
      const out = await coverRenderCanvas(layout, scale);
      if (token !== _coverPaintToken || !c.isConnected) return;
      c.width = out.width; c.height = out.height; c.getContext('2d').drawImage(out, 0, 0);
    } catch (e) { c.dataset.error = '1'; }
  }
}
