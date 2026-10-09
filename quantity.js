/* ---------- Gemeinsame Mengenlogik (Import, Anzeige, Skalierung, Einkauf, Naehrwerte, PDF) ----------
   Eine Menge ist immer eine von:
     { kind: 'exact',       min, max (= min) }      exakte Zahl
     { kind: 'range',       min, max }              Bereich, beide Grenzen bleiben erhalten
     { kind: 'qualitative', text }                  "etwas", "nach Geschmack" (keine Zahl)
     { kind: 'missing' }                            keine Angabe
     { kind: 'ambiguous',   text, candidates }      Zahl mit mehreren moeglichen Lesarten ("1.000" ohne Kontext)
     { kind: 'invalid',     text }                  kein lesbarer Zahlenwert
   Gespeichert wird weiterhin im bisherigen Feld ingredient.amount (Zahl oder Text): ein Bereich als
   Text "200-300" (Bindestrich, Punkt als Dezimalzeichen). Es gibt keine Datenmigration; alte
   Rezepte mit einfachen Mengen lesen sich unveraendert. Nichts wird gerundet, gemittelt oder auf die
   erste Zahl gekuerzt. */

const QTY_GLYPHS = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 };
const QTY_GLYPH_CLASS = '¼½¾⅓⅔⅕⅖⅗⅘⅛⅜⅝⅞';
// Zahlenmuster (Reihenfolge wichtig: gemischte Brueche und Tausender vor einfachen Dezimalzahlen)
const QTY_NUM = '(?:\\d+\\s+\\d+\\/\\d+|\\d+\\s*[' + QTY_GLYPH_CLASS + ']|[' + QTY_GLYPH_CLASS + ']|\\d+\\/\\d+|\\d{1,3}(?:[\'’\\u2009\\u00a0 ]\\d{3})+(?!\\d)(?:,\\d+)?|\\d{1,3}(?:\\.\\d{3})+(?!\\d)(?:,\\d+)?|\\d+(?:[.,]\\d+)?)';
const QTY_RANGE_SEP = '(?:-|–|—|bis|to)';
const QTY_SMALL_UNITS = new Set(['g', 'gr', 'gramm', 'mg', 'ml']);
const QTY_QUALITATIVE_RE = /^(etwas|nach geschmack|nach belieben|ein wenig|ein bisschen|einige|ein paar|je nach bedarf|bei bedarf|zum bestreuen|zum servieren|zum garnieren|zum anbraten|zum braten)$/i;

function qtyRound(v) { return Math.round(v * 1e6) / 1e6; }

/* Eine einzelne Zahl. unit (optional) liefert den Kontext fuer "1.000". Ergebnis:
   { value } oder { candidates:[a,b] } (mehrdeutig) oder null (keine Zahl) */
function qtyParseNumber(tok, unit) {
  let s = String(tok == null ? '' : tok).trim().replace(/[  ]/g, ' ');
  if (!s) return null;
  let m;
  if ((m = /^(\d+)\s+(\d+)\/(\d+)$/.exec(s))) return +m[3] ? { value: qtyRound(+m[1] + m[2] / m[3]) } : null;
  if ((m = /^(\d+)\/(\d+)$/.exec(s))) return +m[2] ? { value: qtyRound(m[1] / m[2]) } : null;
  if ((m = new RegExp('^(\\d+)\\s*([' + QTY_GLYPH_CLASS + '])$').exec(s))) return { value: qtyRound(+m[1] + QTY_GLYPHS[m[2]]) };
  if (QTY_GLYPHS[s] !== undefined) return { value: qtyRound(QTY_GLYPHS[s]) };
  const u = String(unit || '').toLowerCase().replace(/\.$/, '');
  // Tausender mit Apostroph oder Leerzeichen sind eindeutig: 1'000, 1 000
  if (/^\d{1,3}(?:['’ ]\d{3})+(?:,\d+)?$/.test(s)) return { value: qtyRound(parseFloat(s.replace(/['’ ]/g, '').replace(',', '.'))) };
  // Punkt als Gruppenzeichen mit drei Ziffern: 1.000 / 12.500 / 1.250,5
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(s)) {
    const asThousands = qtyRound(parseFloat(s.replace(/\./g, '').replace(',', '.')));
    if (/,\d/.test(s)) return { value: asThousands };   // "1.250,5": Komma ist das Dezimalzeichen, der Punkt also Gruppenzeichen
    if (/^0\./.test(s)) return { value: qtyRound(parseFloat(s)) };   // 0.125 ist eindeutig eine Dezimalzahl
    if (QTY_SMALL_UNITS.has(u) && /^\d{1,3}\.\d{3}$/.test(s) || /^\d{1,3}(?:\.\d{3}){2,}$/.test(s)) return { value: asThousands };   // "1.000 g" ist 1000 g, nicht 1 g
    return { candidates: [qtyRound(parseFloat(s)), asThousands] };   // "1.000" ohne belastbaren Kontext: nicht raten
  }
  // Komma mit genau drei Ziffern und Gruppenkontext ("1,000 g") ist ebenfalls nicht eindeutig
  if (/^[1-9]\d{0,2},\d{3}$/.test(s) && (QTY_SMALL_UNITS.has(u) || !u)) return { candidates: [qtyRound(parseFloat(s.replace(',', '.'))), qtyRound(parseFloat(s.replace(',', '')))] };
  if (/^\d+(?:[.,]\d+)?$/.test(s)) return { value: qtyRound(parseFloat(s.replace(',', '.'))) };
  return null;
}

/* Menge aus dem gespeicherten Feld (Zahl oder Text) lesen. unit liefert Kontext fuer Mehrdeutiges. */
function parseQuantity(raw, unit) {
  if (raw === null || raw === undefined) return { kind: 'missing' };
  if (typeof raw === 'number') return isFinite(raw) ? { kind: 'exact', min: raw, max: raw } : { kind: 'invalid', text: String(raw) };
  const s = String(raw).replace(/[  ]/g, ' ').trim();
  if (!s) return { kind: 'missing' };
  if (QTY_QUALITATIVE_RE.test(s)) return { kind: 'qualitative', text: s };
  // Bereich: "200-300", "200 – 300", "200 bis 300", "1/2-1", optional mit Einheit am Ende ("50 bis 70g")
  const rm = new RegExp('^(' + QTY_NUM + ')\\s*(?:([A-Za-zäöüÄÖÜ.]{1,12}?)\\s*)?' + QTY_RANGE_SEP + '\\s*(' + QTY_NUM + ')\\s*([A-Za-zäöüÄÖÜ.]{1,12})?$', 'i').exec(s);
  if (rm) {
    const ctx = unit || rm[4] || rm[2] || '';
    const a = qtyParseNumber(rm[1], ctx), b = qtyParseNumber(rm[3], ctx);
    if (a && b && a.value !== undefined && b.value !== undefined) {
      const lo = Math.min(a.value, b.value), hi = Math.max(a.value, b.value);
      return lo === hi ? { kind: 'exact', min: lo, max: lo, text: s } : { kind: 'range', min: lo, max: hi, text: s, unitHint: rm[4] || rm[2] || '' };
    }
    return { kind: 'ambiguous', text: s, candidates: [] };
  }
  // Einzelne Zahl, optional mit angehaengter Einheit ("250g")
  const em = new RegExp('^(' + QTY_NUM + ')\\s*([A-Za-zäöüÄÖÜ.]{1,12})?$', 'i').exec(s);
  if (em) {
    const hint = em[2] || '';
    const n = qtyParseNumber(em[1], unit || hint);
    if (n && n.value !== undefined) return { kind: 'exact', min: n.value, max: n.value, text: s, unitHint: hint };
    if (n && n.candidates) return { kind: 'ambiguous', text: s, candidates: n.candidates };
  }
  return { kind: 'invalid', text: s };
}
function qtyFromIngredient(ing) { return parseQuantity(ing ? ing.amount : null, ing ? ing.unit : ''); }
function qtyIsNumeric(q) { return !!q && (q.kind === 'exact' || q.kind === 'range'); }

/* Skalieren: beide Grenzen, immer vom Originalwert (nie von einem schon skalierten Wert) */
function qtyScale(q, factor) {
  if (!qtyIsNumeric(q)) return q;
  return { kind: q.kind, min: q.min * factor, max: q.max * factor };
}
/* Addieren (Einkaufsliste): exakt wie Bereich mit gleicher Unter- und Obergrenze, Grenzen werden einzeln addiert */
function qtyAdd(a, b) {
  if (!qtyIsNumeric(a) || !qtyIsNumeric(b)) return null;
  const min = qtyRound(a.min + b.min), max = qtyRound(a.max + b.max);
  return { kind: min === max ? 'exact' : 'range', min, max };
}
/* Umrechnen (Einheitenumrechnung): fn bekommt eine Zahl und liefert die umgerechnete Zahl */
function qtyMap(q, fn) {
  if (!qtyIsNumeric(q)) return q;
  const min = fn(q.min), max = fn(q.max);
  return { kind: min === max ? 'exact' : 'range', min, max };
}
/* Anzeige: exakt "250", Bereich "200–300" (Gedankenstrich), alles andere der Originaltext */
function qtyFormat(q, unit, fmt) {
  const f = fmt || ((v) => (typeof kitchenAmount === 'function' ? kitchenAmount(v, unit) : String(Math.round(v * 100) / 100)));
  if (!q) return '';
  if (q.kind === 'exact') return f(q.min);
  if (q.kind === 'range') return f(q.min) + '–' + f(q.max);
  if (q.kind === 'qualitative' || q.kind === 'ambiguous' || q.kind === 'invalid') return q.text || '';
  return '';
}
/* In das gespeicherte Feld schreiben: exakt als Zahl-Text, Bereich als "min-max" */
function qtyToStored(q) {
  if (!q) return '';
  if (q.kind === 'exact') return String(qtyRound(q.min));
  if (q.kind === 'range') return qtyRound(q.min) + '-' + qtyRound(q.max);
  if (q.kind === 'qualitative' || q.kind === 'ambiguous' || q.kind === 'invalid') return q.text || '';
  return '';
}

/* ---------- Zeilen-Parser: "200-300 g Kartoffeln", "50 bis 70g Parmesan (gerieben)", "½ TL Salz" ----------
   Liefert { amount, unit, name, kind, flags[] } oder null. amount ist der Speicherwert (siehe oben). */
const QTY_UNITS = ['kg', 'g', 'gr', 'mg', 'l', 'dl', 'cl', 'ml', 'tl', 'el', 'msp', 'prise', 'prisen', 'bund', 'dose', 'dosen', 'pk', 'pkg', 'packung', 'packungen', 'päckchen', 'päckli', 'tüte', 'tüten',
  'stk', 'stück', 'stueck', 'zehe', 'zehen', 'scheibe', 'scheiben', 'tasse', 'tassen', 'cup', 'cups', 'tsp', 'tbsp', 'oz', 'lb', 'lbs', 'becher', 'handvoll', 'zweig', 'zweige',
  'kopf', 'stange', 'stangen', 'blatt', 'blätter', 'würfel', 'flasche', 'flaschen', 'glas', 'gläser', 'rispe', 'rispen', 'knolle', 'knollen', 'gramm', 'kilogramm', 'liter', 'milliliter', 'deziliter', 'esslöffel', 'teelöffel', 'pfund',
  'pck', 'clove', 'cloves', 'can', 'cans', 'jar', 'jars', 'stick', 'sticks', 'pinch', 'dash', 'handful', 'bunch', 'slice', 'slices', 'piece', 'pieces', 'sprig', 'sprigs', 'stalk', 'stalks', 'head', 'package', 'packages', 'ounce', 'ounces', 'pound', 'pounds', 'teaspoon', 'tablespoon', 'teaspoons', 'tablespoons'];
const QTY_NUM_START = new RegExp('^' + QTY_NUM, 'i');
const QTY_SEP_NUM = new RegExp('^\\s*' + QTY_RANGE_SEP + '\\s*(' + QTY_NUM + ')', 'i');
const QTY_UNIT_START = /^([A-Za-zäöüÄÖÜ]+)\.?(?=\s|$|[,)(])/;

function qtyIsUnitWord(w) {
  const k = String(w || '').toLowerCase().replace(/\.$/, '');
  return QTY_UNITS.includes(k) || (typeof normalizeUnit === 'function' && !!normalizeUnit(k));
}

function qtyParseLine(line) {
  const s = String(line || '').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  const flags = [];
  const none = () => ({ amount: '', unit: '', name: s, kind: 'missing', flags });
  // Qualitative Angabe vorn: "etwas Pfeffer", "nach Geschmack Salz"
  let qm = /^(etwas|ein wenig|ein bisschen|nach geschmack|nach belieben|einige|ein paar)\s+(.+)$/i.exec(s);
  if (qm) return { amount: '', unit: '', name: s, kind: 'qualitative', flags };   // bleibt im Namen ("etwas Muskat"), wie bisher gespeichert
  // Qualitative Angabe hinten: "Pfeffer nach Geschmack", "Salz, nach Belieben"
  qm = /^(.+?)[,;]?\s+(nach geschmack|nach belieben|zum bestreuen|zum servieren|zum garnieren)$/i.exec(s);
  if (qm && !/^[\d½¼¾⅓⅔⅛]/.test(s)) return { amount: '', unit: '', name: s, kind: 'qualitative', flags };
  let t = s.replace(/^(?:ca\.?|circa|etwa|ungefähr|rund|~)\s*/i, '');
  const nm = QTY_NUM_START.exec(t);
  if (!nm) return none();
  let rest = t.slice(nm[0].length);
  const takeUnit = () => {
    const m = QTY_UNIT_START.exec(rest.replace(/^\s*/, ''));
    if (m && !/^(bis|to)$/i.test(m[1]) && qtyIsUnitWord(m[1])) { rest = rest.replace(/^\s*/, '').slice(m[0].length); return m[1]; }
    return '';
  };
  let unit = takeUnit();
  let secondTok = '';
  const sm = QTY_SEP_NUM.exec(rest);
  if (sm) {
    secondTok = sm[1]; rest = rest.slice(sm[0].length);
    if (unit) { const again = QTY_UNIT_START.exec(rest.replace(/^\s*/, '')); if (again && again[1].toLowerCase() === unit.toLowerCase()) rest = rest.replace(/^\s*/, '').slice(again[0].length); }   // "200 g bis 300 g": die Einheit steht zweimal
  }
  else if (/^\s*[-–—]/.test(rest)) return none();   // "7-Kräuter-Mix": die Zahl gehoert zum Namen
  if (!unit) unit = takeUnit();
  rest = rest.replace(/^\s*/, '').trim();
  if (!rest) return none();   // nur "2": nichts erfinden
  const first = qtyParseNumber(nm[0], unit);
  const second = secondTok ? qtyParseNumber(secondTok, unit) : null;
  if (!first || (secondTok && !second)) return none();
  let q;
  if (first.candidates || (second && second.candidates)) {
    q = { kind: 'ambiguous', text: nm[0] + (secondTok ? '-' + secondTok : '') };
    flags.push('ambiguous-number');
  } else if (second) {
    const lo = Math.min(first.value, second.value), hi = Math.max(first.value, second.value);
    q = lo === hi ? { kind: 'exact', min: lo, max: lo } : { kind: 'range', min: lo, max: hi };
  } else q = { kind: 'exact', min: first.value, max: first.value };
  // Brueche bleiben im Originalwortlaut ("1 1/2"), damit die Originalmenge nicht umgeschrieben wird
  let amount = qtyToStored(q);
  if (!secondTok && /\//.test(nm[0])) amount = nm[0].trim();
  else if (secondTok && (/\//.test(nm[0]) || /\//.test(secondTok)) && q.kind === 'range') amount = nm[0].trim() + '-' + secondTok.trim();
  return { amount, unit, name: rest, kind: q.kind, flags };
}

/* ---------- Einkaufslisten-Mengen: item.amount (Zahl) plus optional item.amountMax (Obergrenze eines Bereichs) ---------- */
function shopQty(i) {
  if (!i) return { kind: 'missing' };
  if (typeof i.amount === 'number' && isFinite(i.amount)) {
    const max = typeof i.amountMax === 'number' && i.amountMax > i.amount ? i.amountMax : i.amount;
    return { kind: max > i.amount ? 'range' : 'exact', min: i.amount, max };
  }
  return parseQuantity(i.amount, i.unit);
}
function shopAmountText(i) { return qtyFormat(shopQty(i), i.unit); }
// Quantity -> Felder des Einkaufsartikels
function shopFieldsFromQty(q) {
  if (q && q.kind === 'exact') return { amount: qtyRound(Math.round(q.min * 100) / 100) };
  if (q && q.kind === 'range') return { amount: qtyRound(Math.round(q.min * 100) / 100), amountMax: qtyRound(Math.round(q.max * 100) / 100) };
  return { amount: q && q.text ? q.text : '' };
}
