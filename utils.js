/* ---------- Helpers ---------- */
function uid() { return 'r_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8); }

function escapeHtml(s) { return (s === null || s === undefined || s === false ? '' : String(s)).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
/* Attribut-Wert maskieren (Audit-Nachtrag): IDs, Handles und Schluessel stammen teils aus gespeicherten Altdaten und duerfen
   nie aus dem Attribut ausbrechen. Fuer normale IDs (Buchstaben, Ziffern, _ -) ist die Ausgabe identisch. */
function escapeAttr(s) { return escapeHtml(s); }
/* Wert fuer einen CSS-Attributselektor ([data-id="..."]) maskieren, damit Anfuehrungszeichen den Selektor nicht sprengen. */
function cssAttr(s) { return String(s === null || s === undefined ? '' : s).replace(/["\\\n\r]/g, c => c === '\n' ? '\\a ' : c === '\r' ? '\\d ' : '\\' + c); }

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

/* Liefert nur dann eine Zahl, wenn die Angabe EINE eindeutige Zahl ist. Bereiche ("200-300"), Texte ("etwas")
   und mehrdeutige Zahlen ("1.000" ohne Kontext) ergeben null, nie die erste Zahl per parseFloat.
   Fuer Bereiche und Kontext siehe quantity.js (parseQuantity). unit liefert den Kontext fuer "1.000 g". */
function parseAmount(raw, unit) {
  if (typeof raw === 'number') return isNaN(raw) ? null : raw;
  const q = parseQuantity(raw, unit);
  return q.kind === 'exact' ? q.min : null;
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

// Kalendertag im LOKALEN Kalender (F01). Frueher toISOString(): das rechnete lokale Mitternacht in
// UTC um und lieferte in Zeitzonen oestlich von UTC (z.B. Zuerich) den Vortag als Schluessel.
function fmtDateKey(d) {
  const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
  return `${y}-${m < 10 ? '0' : ''}${m}-${day < 10 ? '0' : ''}${day}`;
}
function parseDateKey(key) { const [y, m, d] = String(key).split('-').map(Number); return new Date(y, m - 1, d); }
// Schluessel, die mit der alten UTC-Logik entstanden sind, dem gemeinten lokalen Tag zuordnen:
// der alte Schluessel war das UTC-Datum der lokalen Mitternacht des gemeinten Tages.
function legacyUtcKeyToLocal(key) {
  const d = parseDateKey(key);
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  return next.toISOString().slice(0, 10) === key ? fmtDateKey(next) : key;
}

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
/* Seit 0.70.2 gibt es kein Schwarz mehr: ein frueher gespeichertes oder aus der Cloud kommendes 'amoled' gilt als 'dark'. */
function normalizeTheme(v) {
  if (v === 'amoled') return 'dark';
  return (v === 'light' || v === 'dark' || v === 'auto') ? v : 'auto';
}
function loadStoredTheme() {
  let raw = null;
  try { raw = localStorage.getItem(THEME_KEY); } catch (e) { /* ohne Speicher: System */ }
  const t = normalizeTheme(raw);
  if (raw === 'amoled') { try { localStorage.setItem(THEME_KEY, 'dark'); } catch (e) { /* egal */ } }
  return t;
}

const UNIT_KEY = 'savora-unit-system'; // 'metric' | 'imperial'

const COOKBOOK_TITLE_KEY = 'savora-cookbook-title'; // frei waehlbarer Titel unter dem Logo / auf dem PDF-Deckblatt
const SENDER_NAME_KEY = 'savora-sender-name'; // eigener Name, wird beim Teilen eines Rezepts angehaengt
const BACKUP_NUDGE_KEY = 'savora-backup-nudge-until'; // Zeitstempel: bis dahin keine Sicherungs-Erinnerung
const LAST_BACKUP_KEY = 'savora-last-backup-at'; // ISO-Zeitstempel der letzten erfolgreichen Sicherung, fuer "Mehr > Backup"

/* Sicherungs-Erinnerung: erst ab 3 Rezepten, wenn noch nie oder seit 14 Tagen nicht gesichert wurde;
   "Spaeter" schaltet sie 7 Tage aus. Mit Konto laufen die Rezepte ueber die Cloud: keine Erinnerung. */
function backupNudgeInfo() {
  try {
    if (typeof cloudSignedIn === 'function' && cloudSignedIn()) return null;
    if ((state.recipes || []).length < 3) return null;
    const until = parseInt(localStorage.getItem(BACKUP_NUDGE_KEY) || '0', 10) || 0;
    if (until > Date.now()) return null;
    const last = state.lastBackupAt ? new Date(state.lastBackupAt).getTime() : 0;
    if (!last) return { never: true, days: null };
    const days = Math.floor((Date.now() - last) / 86400000);
    return days >= 14 ? { never: false, days } : null;
  } catch (e) { return null; }
}

/* ---------- Suche ----------
   Gross/Klein, Umlaute und Akzente sind egal ("gemuse", "Gemuese" und "Gemüse" finden dasselbe),
   Bindestriche und Satzzeichen zaehlen als Leerzeichen. Mehrere Woerter muessen alle vorkommen,
   auch verteilt (Titel, Zutaten, Tags). */
function searchNorm(s) {
  return String(s === undefined || s === null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss').replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}
const _searchCache = new Map();
function recipeSearchText(r) {
  const key = r.id + '|' + (r.updatedAt || 0);
  let v = _searchCache.get(key);
  if (v === undefined) {
    v = searchNorm([r.title || ''].concat((r.ingredients || []).map(i => i.name || ''), r.tags || []).join(' '));
    if (_searchCache.size > 5000) _searchCache.clear();
    _searchCache.set(key, v);
  }
  return v;
}
function recipeMatchesQuery(r, query) {
  const tokens = searchNorm(query).split(' ').filter(Boolean);
  if (!tokens.length) return true;
  const hay = recipeSearchText(r);
  return tokens.every(t => hay.includes(t));
}

/* ---------- Sortierung der Rezeptliste ---------- */
const SORT_KEY = 'savora-sort';
const SORT_OPTIONS = [
  { id: 'updated', label: 'Zuletzt bearbeitet' },
  { id: 'az', label: 'A bis Z' },
  { id: 'cooked', label: 'Zuletzt gekocht' },
  { id: 'time', label: 'Kürzeste Zeit' },
];
function sortRecipes(list, by) {
  const arr = list.slice();
  const title = (r) => String(r.title || '');
  if (by === 'az') return arr.sort((a, b) => title(a).localeCompare(title(b), 'de', { sensitivity: 'base' }));
  if (by === 'cooked') return arr.sort((a, b) => (b.lastCookedAt || 0) - (a.lastCookedAt || 0) || title(a).localeCompare(title(b), 'de', { sensitivity: 'base' }));
  if (by === 'time') return arr.sort((a, b) => ((a.timeMinutes || 1e9) - (b.timeMinutes || 1e9)) || title(a).localeCompare(title(b), 'de', { sensitivity: 'base' }));
  return arr;   // 'updated': state.recipes ist bereits danach sortiert
}

/* ---------- Feinschliff: Textmarker, Zahlenzaehler, Avatar-Kreise ---------- */

/* Text Highlighter: liefert HTML, in dem die Suchtreffer als <mark class="hl"> stehen. Der Text selbst geht immer durch
   escapeHtml, der Suchtext wird nie ins HTML geschrieben (nur Positionen daraus). Die Treffer folgen genau der Logik von searchNorm
   (Gross/Klein, Umlaute, ss, ae/oe/ue, Satzzeichen): jedes Zeichen wird gefaltet und behaelt seine Position im Originaltext. */
function searchFoldMap(text) {
  const src = String(text === undefined || text === null ? '' : text);
  const folded = [];
  for (let i = 0; i < src.length; i++) {
    const f = src[i].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
    if (f === '') { if (folded.length) folded[folded.length - 1].e = i + 1; continue; }   // Kombinationszeichen gehoert zum Vorgaenger
    for (const c of f) folded.push({ c, s: i, e: i + 1, m: false });
  }
  const merged = [];
  for (const x of folded) {
    const p = merged[merged.length - 1];
    if (p && !p.m && x.c === 'e' && (p.c === 'a' || p.c === 'o' || p.c === 'u')) { p.e = x.e; p.m = true; } else merged.push({ c: x.c, s: x.s, e: x.e, m: false });
  }
  let norm = '';
  const idx = [];
  for (const x of merged) {
    if (/[a-z0-9]/.test(x.c)) { norm += x.c; idx.push(x); }
    else if (norm && norm[norm.length - 1] !== ' ') { norm += ' '; idx.push(x); }
  }
  return { src, norm, idx };
}
function highlightHtml(text, query) {
  const raw = String(text === undefined || text === null ? '' : text);
  const tokens = searchNorm(query).split(' ').filter(t => t.length >= 2);
  if (!tokens.length || !raw) return escapeHtml(raw);
  const { src, norm, idx } = searchFoldMap(raw);
  const ranges = [];
  tokens.forEach(t => {
    let from = 0, at;
    while ((at = norm.indexOf(t, from)) !== -1) {
      ranges.push([idx[at].s, idx[at + t.length - 1].e]);
      from = at + t.length;
    }
  });
  if (!ranges.length) return escapeHtml(src);
  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged = [];
  ranges.forEach(r => { const l = merged[merged.length - 1]; if (l && r[0] <= l[1]) l[1] = Math.max(l[1], r[1]); else merged.push([r[0], r[1]]); });
  let out = '', pos = 0;
  merged.forEach(([s, e]) => { out += escapeHtml(src.slice(pos, s)) + '<mark class="hl">' + escapeHtml(src.slice(s, e)) + '</mark>'; pos = e; });
  return out + escapeHtml(src.slice(pos));
}
/* Kleine Zeile unter dem Titel, wenn ein Suchwort nur in Zutaten (nicht im Titel) vorkommt. Leer, wenn keine Suche laeuft. */
function searchIngredientHitHtml(r, query) {
  const tokens = searchNorm(query).split(' ').filter(t => t.length >= 2);
  if (!tokens.length) return '';
  const title = searchNorm(r.title || '');
  const open = tokens.filter(t => !title.includes(t));
  if (!open.length) return '';
  const names = (r.ingredients || []).map(i => String(i.name || '')).filter(n => n && open.some(t => searchNorm(n).includes(t)));
  if (!names.length) return '';
  const shown = names.slice(0, 2).map(n => highlightHtml(n, query)).join(', ');
  return `<span class="search-hit"><span class="sr-only">Zutat: </span>${shown}${names.length > 2 ? ' …' : ''}</span>`;
}

/* Number Ticker: die Zahl steht immer als Endwert im Text (Bildschirmleser, Layout). Das Hochzaehlen zeichnet motion.js (initTickers)
   nur optisch darueber. Nur echte Zahlen (auch mit Dezimalkomma); alles andere (Spannen, «–», «99+») bleibt Text. key: pro Ansicht nur einmal animieren. */
function tickerHtml(value, key, scope) {
  const text = String(value === undefined || value === null ? '' : value).trim();
  if (!/^\d+(?:[.,]\d+)?$/.test(text) || !key) return escapeHtml(text);
  const dec = (text.split(/[.,]/)[1] || '').length;
  return `<span class="tick" data-tick="${parseFloat(text.replace(',', '.'))}" data-dec="${dec}" data-tick-key="${escapeHtml(key)}"${scope === 'session' ? ' data-tick-scope="session"' : ''}>${text}</span>`;
}

/* Avatar Circles: ueberlappende Kreise mit Initialen. Farbe stabil aus dem Namen (6 Savora-Toene, Klassen avc-c0 bis avc-c5), «+N» bei Ueberlauf. */
function avatarInitials(name) {
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  const first = (w) => Array.from(w.replace(/^[^\p{L}\p{N}]+/u, ''))[0] || '';
  const a = first(words[0] || ''), b = words.length > 1 ? first(words[words.length - 1]) : '';
  return (a + b).toLocaleUpperCase('de') || '?';
}
function avatarColorIndex(name) {
  const s = String(name).trim().toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 6;
}
function avatarCirclesHtml(names, max) {
  const list = (Array.isArray(names) ? names : []).map(n => String(n === undefined || n === null ? '' : n).trim()).filter(Boolean);
  if (!list.length) return '';
  const cap = Math.max(1, Math.floor(max) || 4);
  const shown = list.length > cap ? list.slice(0, cap) : list;
  const extra = list.length - shown.length;
  const label = `${list.length} ${list.length === 1 ? 'Freund' : 'Freunde'}: ${list.join(', ')}`;
  return `<span class="avc" role="img" aria-label="${escapeHtml(label)}">${shown.map(n => `<span class="avc-item avc-c${avatarColorIndex(n)}" aria-hidden="true">${escapeHtml(avatarInitials(n))}</span>`).join('')}${extra > 0 ? `<span class="avc-item avc-more" aria-hidden="true">+${extra}</span>` : ''}</span>`;
}

/* ---------- v0.90: Speicher voll, Geraetename, stabiler Hash ---------- */
/* Deutliche Warnung, wenn der Browser-Speicher voll ist (localStorage oder IndexedDB). Hoechstens alle 30 Sekunden,
   damit eine Schreibserie nicht dutzende Meldungen ausloest. where: 'db', 'local', 'org' (nur fuers Protokoll). */
let storageFullWarnAt = 0;
function storageFullWarn(where) {
  const now = Date.now();
  try { console.warn('Speicher voll', where || ''); } catch (e) {}
  if (now - storageFullWarnAt < 30000) return false;
  storageFullWarnAt = now;
  const msg = 'Speicher voll: Änderung nicht gespeichert. Bitte Speicher freigeben (z. B. alte Fotos oder andere Website-Daten löschen) und eine Sicherung machen.';
  if (typeof showToast === 'function') { try { showToast(msg, 'error', true); } catch (e) {} }
  return true;
}

/* Name dieses Geraets fuer Konflikt-Kopien («Kopie von iPhone»). Eigener Name aus den Einstellungen, sonst aus dem User-Agent. */
const DEVICE_NAME_KEY = 'savora-device-name';
function savoraDeviceNameAuto() {
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  const touch = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1;
  if (/iPhone|iPod/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touch)) return 'iPad';   // iPadOS meldet sich als Mac
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh|Mac OS X/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows-PC';
  return 'Gerät';
}
function savoraDeviceName() {
  let v = '';
  try { v = (localStorage.getItem(DEVICE_NAME_KEY) || '').trim(); } catch (e) {}
  return v ? v.slice(0, 40) : savoraDeviceNameAuto();
}

/* FNV-1a (32 Bit) ueber JSON mit sortierten Schluesseln: gleicher Inhalt ergibt auf jedem Geraet denselben Hash,
   unabhaengig von der Reihenfolge der Felder. undefined-Felder zaehlen wie fehlende. Ausgabe: 8 Hex-Zeichen. */
function stableJson(v) {
  if (v === null || typeof v !== 'object') return v === undefined ? 'null' : JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(x => x === undefined ? 'null' : stableJson(x)).join(',') + ']';
  return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stableJson(v[k])).join(',') + '}';
}
function stableHash(obj) {
  const s = typeof obj === 'string' ? obj : stableJson(obj);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
