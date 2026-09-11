/* ---------- Helpers ---------- */
function uid() { return 'r_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8); }

function escapeHtml(s) { return (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function fmtAmount(n) {
  if (n === null || n === undefined || n === '') return '';
  const rounded = Math.round(n * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  const frac = { 0.25: '¼', 0.5: '½', 0.75: '¾', 0.33: '⅓', 0.67: '⅔' };
  const whole = Math.floor(rounded);
  const rem = Math.round((rounded - whole) * 100) / 100;
  const closest = Object.keys(frac).map(Number).reduce((a, b) => Math.abs(b - rem) < Math.abs(a - rem) ? b : a, 1);
  if (Math.abs(closest - rem) < 0.06) return (whole > 0 ? whole + ' ' : '') + frac[closest];
  return String(rounded);
}

/* ---------- Zentraler Mengen-Parser: verhindert NaN bei Bruechen/Komma ---------- */
const UNICODE_FRACTIONS = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 };

function parseFractionPart(s) {
  if (UNICODE_FRACTIONS[s] !== undefined) return UNICODE_FRACTIONS[s];
  const m = /^(\d+)\/(\d+)$/.exec(s);
  if (m) {
    const num = parseInt(m[1], 10), den = parseInt(m[2], 10);
    return den === 0 ? null : num / den;
  }
  return null;
}

function parseAmount(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return isNaN(raw) ? null : raw;
  const s = String(raw).trim();
  if (!s) return null;
  const mixed = /^(\d+)\s+(\d+\/\d+|[¼½¾⅓⅔⅕⅖⅗⅘⅛⅜⅝⅞])$/.exec(s);
  if (mixed) {
    const frac = parseFractionPart(mixed[2]);
    return frac === null ? null : parseInt(mixed[1], 10) + frac;
  }
  const fracOnly = parseFractionPart(s);
  if (fracOnly !== null) return fracOnly;
  const num = parseFloat(s.replace(',', '.'));
  return isNaN(num) ? null : num;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function compressImage(dataUrl, maxW = 1200, quality = 0.82) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function domainFromUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url; }
}

function fmtDateKey(d) { return d.toISOString().slice(0, 10); }

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(d, n) { const nd = new Date(d); nd.setDate(nd.getDate() + n); return nd; }

const WEEKDAY_LABELS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

const MONTH_LABELS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

const ALL_TAGS_SEED = ['Frühstück', 'Hauptgang', 'Dessert', 'Vegetarisch', 'Vegan', 'Schnell', 'Backen', 'Suppe', 'Salat', 'Beilage'];

const THEME_KEY = 'savora-theme'; // 'light' | 'dark' | 'auto'

const UNIT_KEY = 'savora-unit-system'; // 'metric' | 'imperial'

const COOKBOOK_TITLE_KEY = 'savora-cookbook-title'; // frei waehlbarer Titel unter dem Logo / auf dem PDF-Deckblatt
const SENDER_NAME_KEY = 'savora-sender-name'; // eigener Name, wird beim Teilen eines Rezepts angehaengt
