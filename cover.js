/* ---------- Kochbuch-Titelblaetter: zehn Vorlagen, gemeinsames Layout fuer Vorschau und PDF ----------
   Ein Titelblatt besteht aus getrennten Ebenen: Hintergrund (PNG, unveraendert, ohne Text), Savora-Wortmarke oben rechts,
   optionale Texte der nutzenden Person (Titel, Name, Slogan) und das Veroeffentlichungsdatum unten rechts.
   Ohne eigene Eingaben erscheinen nur Wortmarke und Datum. Es werden nie Namen, Beispieltitel oder Vorlagennamen gedruckt.

   Gespeichert wird pro Kochbuch-Projekt (config im Projekt, Schluessel savora-cookbook-projects; siehe cookbooks.js):
     cfg.cover = { v: 1, templateId, date: 'YYYY-MM-DD' (Kalenderdatum ohne Zeitzone), showDate }
   Die Texte bleiben in den bisherigen Feldern cfg.title, cfg.author (Name) und cfg.subtitle (Slogan).
   Alle Koordinaten sind relativ zur Seite (0..1) und gelten fuer Vorschau und Export gleichermassen. */

const COVER_SCHEMA_VERSION = 1;
const COVER_PAGE = { w: 794, h: 1123 };   // Referenzgroesse in CSS-Pixeln (A4); alle Schriftgroessen beziehen sich darauf
const COVER_WORDMARK_RED = '#B93B2C', COVER_WORDMARK_CREAM = '#F7F4EE', COVER_WORDMARK_INK = '#252720';
const COVER_DEFAULT_ID = 'pop';
const COVER_LOGO_BOX = { x: 0.65, y: 0.05, w: 0.27 };   // Wortmarke (Seitenverhaeltnis 3:1), rechter Rand bei 92 %, innerhalb der sicheren Zone
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
  const cfg = cookbookGetRaw();   // aktives Kochbuch-Projekt
  const c = cfg && cfg.cover;
  const ok = c && c.v === COVER_SCHEMA_VERSION && coverIsValidDateKey(c.date) && coverTemplateById(c.templateId);
  if (!ok) {
    // Nur das Titelblatt ergaenzen. Eine noch nie gespeicherte Auswahl (items) bleibt "alle Rezepte" und wird hier nicht eingefroren.
    const next = { ...(cfg || {}), cover: coverSanitizeConfig(c, !(c && coverIsValidDateKey(c.date))) };
    cookbookSetRaw(next);
  }
  return getCookbookConfig();
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
  const logo = input && input.logo === false ? null : { x: COVER_LOGO_BOX.x, y: COVER_LOGO_BOX.y, w: COVER_LOGO_BOX.w, variant: tpl.logoVariant, ink: tpl.logoVariant === 'dark' ? COVER_WORDMARK_CREAM : COVER_WORDMARK_INK, h: COVER_LOGO_BOX.w * COVER_PAGE.w * (WORDMARK_BOX.h / WORDMARK_BOX.w) / COVER_PAGE.h };
  return { templateId: tpl.id, page: COVER_PAGE, ink: tpl.ink, blocks, date, logo, warnings, background: coverBackgroundUrl(tpl.id) };
}

/* ---------- Savora-Wortmarke (Teigschrift, nur Pfad, viewBox 1200 x 400) als Vektor ----------
   Quelle: assets/logo/savora-wortmarke-light.svg (identischer Pfad in der dark-Variante, nur die Farbe unterscheidet sich).
   In der App steuert CSS die Farbe ueber data-theme (Hell rot #B93B2C, Dunkel/Schwarz creme #F7F4EE): kein Filter, kein Flackern. */
const WORDMARK_PATH = "M98.54,366.88 C68.71,361.87 48.82,348.68 38.30,326.94 C18.06,285.08 37.22,236.65 77.40,228.12 C90.80,225.28 95.85,227.10 110.87,240.20 C124.27,251.89 132.86,255.92 144.42,255.94 C163.40,255.97 171.53,244.64 160.44,233.63 C154.80,228.04 153.26,227.53 114.63,218.39 C70.24,207.90 46.51,186.62 44.37,155.41 C42.22,124.06 63.21,97.15 106.65,75.57 C151.35,53.36 246.12,26.37 253.19,33.83 C259.11,40.08 282.03,85.48 286.02,98.87 C291.73,118.01 255.18,149.54 220.35,155.51 C206.87,157.82 198.06,155.64 185.68,146.95 C168.43,134.84 162.21,132.26 150.05,132.21 C137.66,132.15 133.13,134.48 128.85,143.08 C124.08,152.68 129.22,162.21 142.22,167.87 C148.63,170.67 153.06,171.24 176.17,172.22 C228.96,174.49 248.68,180.62 267.67,200.70 C281.06,214.86 286.78,232.00 285.65,254.55 C284.46,278.19 276.27,295.90 257.32,315.83 C233.01,341.39 197.03,359.24 156.63,365.79 C144.99,367.68 107.48,368.39 98.54,366.88 Z M315.50,362.24 C294.78,357.86 276.72,342.44 270.00,323.41 C268.01,317.75 268.05,317.40 271.37,313.46 C277.70,305.93 286.01,290.33 289.69,279.03 C292.76,269.63 293.37,265.10 293.51,250.71 L293.67,233.57 301.78,227.82 C316.09,217.67 336.74,210.18 361.51,206.18 C377.15,203.64 382.20,197.81 376.19,189.23 C369.67,179.91 352.95,182.44 333.58,195.66 C315.90,207.73 304.44,211.24 291.91,208.43 C285.08,206.91 283.19,205.56 272.57,194.63 L260.80,182.52 260.80,174.70 C260.80,162.57 266.90,151.72 282.38,136.34 C313.55,105.37 349.52,88.10 382.84,88.10 C409.42,88.10 431.51,100.95 447.55,125.74 C461.30,147.00 468.18,166.32 474.78,202.18 C479.57,228.19 483.80,242.30 489.91,252.67 C492.14,256.45 498.53,270.22 504.10,283.27 C518.98,318.09 518.99,327.00 504.17,340.32 C494.17,349.32 484.41,352.77 466.83,353.55 C443.86,354.56 426.52,347.51 409.97,330.41 L403.18,323.39 393.39,333.70 C381.67,346.03 369.56,353.99 355.13,358.83 C343.26,362.82 325.48,364.35 315.50,362.24 Z M851.25,349.70 C832.79,346.83 823.58,341.49 818.76,330.88 C814.15,320.74 815.10,315.80 823.62,305.76 C841.52,284.67 850.84,262.19 853.89,232.77 C857.51,197.87 846.76,157.26 826.81,130.41 C819.85,121.04 819.14,117.81 822.35,110.12 C827.26,98.37 838.26,90.72 853.84,88.21 C869.31,85.72 880.69,89.37 889.68,99.70 L894.95,105.76 900.72,98.68 C913.88,82.53 928.76,74.98 947.60,74.89 C971.94,74.78 986.41,87.31 987.85,109.75 C988.88,125.76 983.01,140.51 970.12,154.29 C962.35,162.59 958.20,164.83 947.31,166.58 C917.05,171.46 909.56,192.96 920.94,242.27 C924.65,258.34 925.13,262.32 923.90,266.75 C921.47,275.51 922.09,295.22 925.10,304.90 C931.24,324.61 919.44,341.73 895.84,347.34 C884.55,350.03 861.26,351.26 851.25,349.70 Z M702.57,344.14 C665.22,337.28 639.76,314.99 630.48,281.03 C624.99,260.90 627.78,231.10 637.75,203.49 C660.73,139.83 699.60,102.15 744.77,99.72 C796.93,96.93 837.77,137.23 845.54,199.15 C855.34,277.27 801.89,341.60 724.58,344.71 C716.07,345.06 706.17,344.80 702.57,344.14 Z M977.12,344.05 C936.61,335.52 917.61,290.59 937.50,250.36 C942.95,239.33 960.96,221.76 974.72,214.04 C989.94,205.51 1013.53,197.79 1032.22,195.23 C1044.74,193.52 1048.06,192.57 1050.06,190.11 C1054.84,184.22 1052.45,177.34 1044.72,174.79 C1037.55,172.42 1029.04,174.88 1015.06,183.35 C996.53,194.57 987.79,196.62 977.27,192.23 C969.90,189.15 964.58,183.56 962.82,177.02 C961.42,171.81 961.55,171.24 964.59,169.34 C977.73,161.17 992.57,138.74 994.98,123.41 C996.31,114.98 997.70,113.18 1011.56,102.02 C1030.35,86.88 1048.88,79.75 1069.49,79.72 C1097.17,79.68 1117.22,92.63 1128.86,118.06 C1135.03,131.53 1136.66,145.43 1135.59,175.54 C1134.27,212.42 1136.18,218.70 1154.32,237.39 C1166.10,249.52 1169.06,257.51 1168.97,276.93 C1168.85,304.76 1157.87,324.13 1136.60,334.09 C1125.59,339.24 1102.25,339.44 1089.87,334.48 C1081.41,331.10 1067.00,319.05 1062.69,311.77 L1060.33,307.78 1050.47,317.31 C1037.78,329.58 1027.37,336.40 1014.87,340.63 C1003.59,344.44 986.40,346.00 977.12,344.05 Z M537.83,335.26 C529.84,332.71 522.37,323.88 522.36,316.98 C522.35,308.44 520.48,302.89 506.97,271.25 C492.33,236.95 487.30,221.76 481.73,194.98 C477.14,172.90 471.45,155.42 464.09,140.81 C458.67,130.03 458.86,127.50 465.46,122.49 C478.70,112.45 508.81,110.05 525.37,117.72 C547.28,127.87 553.26,142.97 556.46,196.21 C558.25,225.87 559.48,231.99 562.95,228.51 C566.90,224.57 568.77,206.45 567.80,181.73 C566.68,153.47 568.23,147.04 578.30,137.94 C594.88,122.96 632.32,121.68 645.60,135.63 C655.25,145.78 655.05,149.33 643.51,172.33 C630.02,199.20 621.68,226.46 621.68,243.70 C621.68,251.99 615.33,267.76 599.44,298.93 C589.18,319.06 579.75,329.18 566.72,334.05 C557.89,337.36 545.97,337.85 537.83,335.26 Z M376.91,272.39 C384.43,267.27 387.39,262.22 387.39,254.49 C387.39,245.02 383.59,241.23 374.26,241.36 C361.46,241.55 348.64,252.18 348.64,262.61 C348.64,274.18 365.63,280.06 376.91,272.39 Z M1039.78,265.11 C1049.57,260.05 1057.04,244.47 1054.51,234.39 C1051.33,221.72 1027.36,229.82 1018.80,246.45 C1015.04,253.78 1015.42,258.25 1020.22,263.05 C1024.92,267.75 1033.03,268.60 1039.78,265.11 Z M744.72,228.51 C756.52,218.58 759.09,196.47 749.35,188.81 C740.56,181.90 727.72,193.67 723.72,212.29 C720.24,228.55 732.98,238.39 744.72,228.51 Z";
const WORDMARK_BOX = { w: 1200, h: 400 };
function wordmarkSvg(cls, label) {
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  return `<svg class="wordmark ${cls || ''}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 400" width="1200" height="400" ${a11y} focusable="false"><path fill="currentColor" fill-rule="evenodd" d="${WORDMARK_PATH}"/></svg>`;
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
function coverDrawWordmark(ctx, x, y, widthPx, ink) {
  const k = widthPx / WORDMARK_BOX.w;
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  ctx.fillStyle = ink; ctx.fill(new Path2D(WORDMARK_PATH), 'evenodd');
  ctx.restore();
}
function coverDraw(ctx, layout, bgImg, scale) {
  const W = layout.page.w * scale, H = layout.page.h * scale;
  ctx.save();
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);
  if (bgImg) { const r = coverBgRect(layout.templateId, W, H); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(bgImg, r.x, r.y, r.w, r.h); }
  if (layout.logo) coverDrawWordmark(ctx, layout.logo.x * W, layout.logo.y * H, layout.logo.w * W, layout.logo.ink);
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
  const logo = '';   // die Wortmarke ist reine Grafik (kein Text im PDF)
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
  if (focusId) { const b = document.querySelector(`.cover-opt[data-id="${cssAttr(focusId)}"]`); if (b) b.focus({ preventScroll: true }); }
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
