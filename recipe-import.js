/* ---------- Rezept-Import: Normalisierung -> Abschnittserkennung -> Extraktion -> Validierung -> Vorschau ----------
   Ersetzt die starre Zeilenlogik fuer Texte mit Ueberschriften ("Zutaten", "Zubereitung", "Utensilien", ...) oder
   nummerierten Schritten. Texte ganz ohne erkennbare Struktur laufen weiter ueber die bisherige Heuristik
   (parseFreeTextRecipeLegacy in parsers.js). Beide Wege enden in importFinalizeDraft(), das die Pruefhinweise
   fuer die Vorschau erzeugt. Nichts wird erfunden: was nicht sicher zugeordnet werden kann, bleibt als
   "nicht zugeordnet" sichtbar (r._import.unassigned) statt stillschweigend zu verschwinden.

   Flüchtige Hilfsfelder (_import, _importSummary) gehoeren nicht in die Datenbank und werden beim Speichern entfernt. */

const IMP_JUNK_RE = /newsletter|abonnier|abmeldung jederzeit|datenschutz|kommentar (schreiben|hinterlassen)|rezept senden|rezept (für später )?speichern|lieblingsquelle|scrolle nach|^\s*werbung\s*$|^\s*anzeige\s*$|cookie|zurück zum rezept|bisous|^\s*google\s*$|folge uns|auf pinterest|jetzt (kaufen|bestellen)|affiliate/i;
const IMP_UTENSIL_WORDS = /\b(backform|muffinform|tartelette[s]?|reibe|trommelreibe|schüssel|pfanne|topf|backblech|rührgerät|handmixer|küchenmaschine|messer|sieb|airfryer|heißluftfritteuse|nudelholz|schneebesen|pürierstab|mixer|auflaufform|springform|kastenform|dampfgarer|waage|thermometer)\b/i;
const IMP_DESCRIPTOR_CAPS = /^(zimmertemperatur|raumtemperatur|bio|optional|nach belieben|nach geschmack)\b/i;
const IMP_UTENSIL_HEAD = /^(utensilien|küchenutensilien|zubehör|equipment|küchengeräte|geräte|werkzeug|was du brauchst|you(?:'|’)?ll need)\s*[:：]?\s*(.*)$/i;
const IMP_NOTE_GROUP_IN_ING = /^(zum servieren|zum garnieren|zum bestreuen|zum anrichten|garnitur|dazu|serviervorschlag|zum braten|zum bestreichen)\s*:?\s*$/i;

/* ---------- 1. Normalisierung ---------- */
function importNormalizeLines(raw) {
  return String(raw == null ? '' : raw).replace(/\r\n?/g, '\n').replace(/[  ​﻿]/g, ' ').split('\n').map(l => l
    .replace(/([0-9])️?⃣\s*/g, '$1. ')
    .replace(/[’‘]/g, "'")
    .replace(/^\s{0,3}#{1,6}\s+/, '')
    .replace(/^\s*>\s?/, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/^\s*[*•▪◦‣●]\s+/, '- ')
    .replace(/[：]/g, ':')
    .replace(/\s+/g, ' ')
    .trim()).filter(Boolean);
}

/* ---------- 2. Erkennung einzelner Zeilen ---------- */
// "1. ", "1) ", "1- ", "1 - ", "1: ", "Schritt 1: "
function impStepNum(l) {
  const m = /^\s*(?:schritt\s*)?(\d{1,2})\s*(?:[.)]\s+|[-–—:]\s+(?=\D))(.+)$/i.exec(l);
  return m ? { num: parseInt(m[1], 10), text: m[2].trim() } : null;
}
function impIngHeader(l) {
  const k = importHeadKey(l);
  if (k.length > 110) return null;
  let m = /^(zutaten|ingredients?)\s+(?:für|fuer|for)\s+(.+?)\s*:?\s*$/i.exec(k);
  if (m) return { yieldText: m[2].replace(/[:.]$/, '').trim(), inline: '' };
  m = /^(zutaten|ingredients?)\s*(?:[(\[]([^)\]]*)[)\]])?\s*(?::\s*(.+))?$/i.exec(k);
  if (m) return { yieldText: (m[2] || '').trim(), inline: (m[3] || '').trim() };
  return null;
}
function impStepHeader(l) {
  if (importIsStepHeader(l)) return { inline: '' };
  const k = importHeadKey(l);
  const m = /^(zubereitung|anleitung|zubereitungsschritte|directions|instructions|method|preparation|vorbereitung)\s*:\s*(.+)$/i.exec(k);
  if (m) return { inline: m[2].trim() };
  if (/^vorbereitung$/i.test(k) && /:\s*$/.test(importStripEmoji(l))) return { inline: '' };
  return null;
}
function impUtensilHeader(l) {
  const k = importStripEmoji(l).replace(/^[\s\p{P}\p{S}]+/u, '');
  const m = IMP_UTENSIL_HEAD.exec(k);
  return m ? { inline: (m[2] || '').trim() } : null;
}
function impIsNoteStart(l) { return typeof isNoteSectionStart === 'function' && isNoteSectionStart(importStripEmoji(l).replace(/^[\s\p{P}\p{S}]+/u, '')); }

/* ---------- Ausbeute ---------- */
function impCleanLabel(w) { return String(w || '').replace(/[:.,;]+$/g, '').trim(); }
function importParseYield(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  let m;
  // "Portionen: 2", "Servings: 4", "Ergibt 12 Stück", "Yield: 12 muffins"
  if ((m = /^(?:ergiebigkeit|ausbeute|menge)?\s*:?\s*(portionen?|personen?|servings?|portions?)\s*[:=]?\s*(\d+)(?:\s*[-–]\s*(\d+))?\s*$/i.exec(t))) {
    if (m[3]) return { unknown: true, text: t };
    return { count: +m[2], mode: 'portions', label: '' };
  }
  if ((m = /^(?:ergibt|macht|ausbeute|yield|makes|ergiebigkeit|menge)\s*:?\s*(?:ca\.?\s*|etwa\s+)?(\d+)(?:\s*[-–]\s*(\d+))?\s+([A-Za-zÄÖÜäöüß][\wÄÖÜäöüß-]*)\b/i.exec(t))) {
    if (m[2]) return { unknown: true, text: t };
    const lab = impCleanLabel(m[3]);
    if (/^(portionen?|personen?|servings?)$/i.test(lab)) return { count: +m[1], mode: 'portions', label: '' };
    return { count: +m[1], mode: 'pieces', label: /^(stück|stk|stueck|pieces?)$/i.test(lab) ? '' : lab };
  }
  if ((m = /^(?:für|fuer|for|reicht für|serves)\s+(?:ca\.?\s*)?(\d+)(?:\s*[-–]\s*(\d+))?\s+(.+)$/i.exec(t))) {
    if (m[2]) return { unknown: true, text: t };
    const rest = impCleanLabel(m[3]);
    if (/^(portionen?|personen?|port\.|servings?|portions?)\b/i.test(rest)) return { count: +m[1], mode: 'portions', label: '' };
    const words = rest.split(/\s+/);
    const last = impCleanLabel(words[words.length - 1]);
    if (/^(stück|stk|stueck)$/i.test(last)) return { count: +m[1], mode: 'pieces', label: '' };
    return { count: +m[1], mode: 'pieces', label: last };   // "Zutaten für 9 knusprige Kartoffel und Parmesan Schälchen" -> 9 Schälchen
  }
  if ((m = /^(\d+)\s*(portionen?|personen?|port\.|servings?|portions?)\b/i.exec(t))) return { count: +m[1], mode: 'portions', label: '' };
  if ((m = /^(\d+)\s*(stück|stk\.?|stueck)\b/i.exec(t)) && /^(\d+)\s*(stück|stk\.?|stueck)\s*$/i.test(t)) return { count: +m[1], mode: 'pieces', label: '' };
  return null;
}

/* ---------- Zeiten, Schwierigkeit, Quelle ---------- */
const IMP_TIME_LABELS = [
  [/^(gesamtzeit|gesamtdauer|total time|zeitaufwand|dauert|dauer|zeit)\b/i, 'total'],
  [/^(zubereitungszeit)\b/i, 'totalOrPrep'],
  [/^(arbeitszeit|aktive zeit|aktiv|vorbereitungszeit|prep time)\b/i, 'prep'],
  [/^(ruhezeit|kühlzeit|gehzeit|wartezeit|ziehzeit|rest time|chill time)\b/i, 'rest'],
  [/^(kochzeit|backzeit|garzeit|bratzeit|cook time)\b/i, 'cook'],
];
function impConsumeMeta(l, meta) {
  // Kombizeilen wie "Für 8 Stück ⏱ 45 Min": an Uhr-Emojis und Trennern aufteilen, jedes Stueck einzeln pruefen
  if (/[⏱⏲🕒🕐🕑🕓🕔🕕|]/u.test(l)) {
    const parts = l.split(/[⏱⏲🕒🕐🕑🕓🕔🕕|]/u).map(x => x.trim()).filter(Boolean);
    if (parts.length > 1 || /[⏱⏲🕒🕐🕑🕓🕔🕕]/u.test(l)) {
      const consumed = parts.map(p => impConsumeMetaPart(p, meta, /[⏱⏲🕒🕐🕑🕓🕔🕕]/u.test(l)));
      return consumed.every(Boolean);
    }
  }
  return impConsumeMetaPart(l, meta, false);
}
function impConsumeMetaPart(l, meta, durationOnlyOk) {
  const t = importStripEmoji(l).replace(/^[\s\p{P}\p{S}]+/u, '').trim();
  if (!t) return false;
  // Quelle: nackte URL oder "Quelle: https://..."
  let m = /^(?:quelle|source|rezept von|von|link)?\s*:?\s*(https?:\/\/\S+)\s*$/i.exec(t);
  if (m) { meta.source = m[1].replace(/[).,;]+$/, ''); return true; }
  // Schwierigkeit
  m = /^(?:schwierigkeit(?:sgrad)?|level|difficulty)\s*:?\s*(einfach|leicht|mittel|mittelschwer|anspruchsvoll|schwer|easy|medium|hard)\b/i.exec(t);
  if (m) {
    const w = m[1].toLowerCase();
    meta.difficulty = /einfach|leicht|easy/.test(w) ? 'Einfach' : /mittel|medium/.test(w) ? 'Mittel' : 'Anspruchsvoll';
    return true;
  }
  // Ausbeute (nur kurze, eindeutige Zeilen, damit "2 Portionen Reis" als Zutat erhalten bleibt)
  if (t.length <= 70 && !/^\d+\s+(?:portionen?|personen?)\s+\p{L}/iu.test(t)) {
    const y = importParseYield(t);
    if (y) { if (!meta.yield) meta.yield = y; return true; }
  }
  // Reine Dauer ("45 Min", "ca. 1 Std. 30 Min.") ohne Bezeichnung zaehlt als Gesamtzeit (bisheriges Verhalten)
  if (typeof isDurationOnlyLine === 'function' && isDurationOnlyLine(t)) {
    const mins = typeof parseDurationText === 'function' ? parseDurationText(t) : null;
    if (mins) { meta.times = meta.times || {}; if (meta.times.total == null) meta.times.total = mins; return true; }
  }
  // Zeiten mit ausdruecklicher Bezeichnung
  for (const [re, kind] of IMP_TIME_LABELS) {
    const lm = re.exec(t);
    if (!lm) continue;
    const rest = t.slice(lm[0].length).replace(/^\s*[:=]?\s*/, '');
    if (!rest || !/\d|halbe|viertel|eine/i.test(rest)) return false;
    const ds = typeof parseDurations === 'function' ? parseDurations(rest) : [];
    meta.times = meta.times || {};
    if (!ds.length) return false;
    if (ds.some(d => d.confidence === 'range')) { meta.timeRanges = (meta.timeRanges || []).concat(t); return true; }
    const minutes = Math.round(ds.reduce((a, d) => a + d.seconds, 0) / 60);
    if (kind === 'total') meta.times.total = minutes;
    else if (kind === 'totalOrPrep') { meta.times.totalOrPrep = minutes; }
    else meta.times[kind] = minutes;
    return true;
  }
  return false;
}

/* ---------- Zutatenzeilen aufteilen ---------- */
function impSplitTopLevel(s) {
  const out = []; let depth = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '[') depth++;
    if (c === ')' || c === ']') depth = Math.max(0, depth - 1);
    const isDecimalComma = c === ',' && /\d/.test(s[i - 1] || '') && /\d/.test(s[i + 1] || '');
    if (!depth && (c === ';' || (c === ',' && !isDecimalComma))) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}
function impStartsWithAmount(seg) { return /^(?:ca\.?\s*|etwa\s+|circa\s+)?[\d½¼¾⅓⅔⅛]/i.test(seg); }
// Beschreibung zum vorigen Lebensmittel ("gerieben", "in Scheiben", "(optional)") statt neuer Zutat
function impIsDescriptor(seg) {
  if (!seg) return false;
  if (impStartsWithAmount(seg)) return false;
  if (/^[(\[]/.test(seg)) return true;
  if (/^\p{Ll}/u.test(seg)) return true;
  return IMP_DESCRIPTOR_CAPS.test(seg);
}
function impStripEndPeriod(s) {
  return /\b(?:ca|etc|z\.b|ggf|evtl|pck|pkg|stk|tl|el|msp|min|std)\.$/i.test(s) ? s : s.replace(/\.$/, '');
}
function importSplitIngredientLine(line) {
  const s = String(line || '').trim();
  if (!/[,;]/.test(s)) return [impStripEndPeriod(s)];
  const raw = impSplitTopLevel(s);
  if (raw.length < 2) return [impStripEndPeriod(s)];
  const merged = [];
  raw.forEach((seg, i) => {
    if (i > 0 && impIsDescriptor(seg) && merged.length) merged[merged.length - 1] += ', ' + seg;
    else merged.push(seg);
  });
  return merged.map(impStripEndPeriod).filter(Boolean);
}

/* ---------- 3. Abschnittserkennung (Zustandsautomat) ---------- */
function importSegment(lines) {
  const hasIngHeader = lines.some(l => impIngHeader(l));
  const hasStepHeader = lines.some(l => impStepHeader(l));
  if (!hasIngHeader && !hasStepHeader) return { ok: false };
  const out = { ok: true, titleLine: null, ingItems: [], utensils: [], steps: [], stepNums: [], notes: [], junk: [], unassigned: [], meta: {}, flags: [], headerYield: '', numbered: false };
  const numberedAny = lines.some(l => impStepNum(l));
  let state = 'pre', group = '', multi = null;
  let ingHeaderCount = 0;
  const pushIng = (txt) => importSplitIngredientLine(txt).forEach(seg => out.ingItems.push({ text: seg, group, multiLine: false }));
  // Mehrere Rezepte in einem Text: zweite Zutatenueberschrift nach bereits erkannten Schritten
  let cut = -1;
  {
    let seenIng = false, seenSteps = false;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (impIngHeader(l)) {
        if (seenIng && seenSteps) { cut = i; break; }
        seenIng = true;
      }
      if (seenIng && (impStepHeader(l) || impStepNum(l))) seenSteps = true;
    }
    if (cut > 0) {
      let c = cut;
      for (let back = 1; back <= 3 && cut - back > 0; back++) {   // Titel des zweiten Rezepts gehoert dazu
        const prev = lines[cut - back];
        if (!impStepNum(prev) && !impIngHeader(prev) && !impStepHeader(prev) && prev.length <= 120 && !/[.!?]$/.test(prev)) c = cut - back; else break;
      }
      out.otherRecipeText = lines.slice(c).join('\n');
      lines = lines.slice(0, c);
    }
  }
  for (const l of lines) {
    if (IMP_JUNK_RE.test(l) && l.length < 220) { out.junk.push(l); continue; }
    let h;
    if ((h = impIngHeader(l))) {
      state = 'ing'; ingHeaderCount++; group = '';
      if (h.yieldText && !out.headerYield) out.headerYield = h.yieldText;
      if (h.inline) pushIng(h.inline);
      continue;
    }
    if ((h = impStepHeader(l))) { state = 'steps'; if (h.inline) { out.steps.push(h.inline); out.stepNums.push(null); } continue; }
    if ((h = impUtensilHeader(l))) { state = 'utensils'; if (h.inline) out.utensils.push(impStripEndPeriod(h.inline)); continue; }
    if (state === 'ing' && IMP_NOTE_GROUP_IN_ING.test(importStripEmoji(l).replace(/^[\s\p{P}\p{S}]+/u, ''))) { group = importHeadKey(l); continue; }   // "Zum Servieren:" ist hier eine Gruppe
    if (impIsNoteStart(l)) { state = 'notes'; out.notes.push(importStripEmoji(l).replace(/^[\s\p{P}\p{S}]+/u, '').trim()); continue; }
    if (impConsumeMeta(l, out.meta)) continue;
    const sn = impStepNum(l);
    if (sn && (state !== 'notes' || (!out.steps.length && sn.num === 1) || (out.steps.length && sn.num === (out.stepNums[out.stepNums.length - 1] || 0) + 1))) {
      state = 'steps'; out.numbered = true;
      out.steps.push(sn.text); out.stepNums.push(sn.num);
      continue;
    }
    if (isHashtagLine(l)) continue;
    const text = stripBullet(l);
    switch (state) {
      case 'pre': {
        if (!out.titleLine && text.length <= 300) { out.titleLine = text; break; }
        out.unassigned.push(l);
        break;
      }
      case 'ing': {
        if (isGroupHeadingLine(l)) { group = importHeadKey(l); break; }
        const sentence = importIsSentence(l) && !importStartsWithAmount(l);
        if (sentence) {
          if (hasStepHeader || numberedAny) { out.unassigned.push(l); break; }
          state = 'steps'; out.steps.push(text); out.stepNums.push(null);   // ohne eigene Ueberschrift beginnt hier die Zubereitung
          break;
        }
        pushIng(text);
        break;
      }
      case 'utensils': out.utensils.push(impStripEndPeriod(text)); break;
      case 'steps': {
        // Ohne eigene Zubereitungs-Ueberschrift bleiben Zeilen mit Menge auch nach dem ersten Satz Zutaten (wie bisher)
        if (!hasStepHeader && !out.numbered && importStartsWithAmount(l) && l.length < 120 && !/[.!?]$/.test(l)) { pushIng(text); break; }
        if (out.numbered && out.steps.length) {
          const last = out.steps[out.steps.length - 1];
          const lineBreak = /:$/.test(last) || /\n/.test(last) || /^(?:im|in der|in dem|mit dem|auf dem|bei|ohne|falls|wenn|bitte)\b/i.test(text);
          out.steps[out.steps.length - 1] = last + (lineBreak ? '\n' : ' ') + text;
        } else { out.steps.push(text); out.stepNums.push(null); }
        break;
      }
      case 'notes': out.notes.push(text); break;
      default: out.unassigned.push(l);
    }
  }
  if (!out.numbered) out.steps = out.steps.flatMap(s => importSplitSentences(s));
  return out;
}
function isHashtagLine(l) { return !String(l).replace(/#[\wäöüÄÖÜß-]+/g, '').trim(); }

/* ---------- Entwurf bauen ---------- */
function parseFreeTextRecipe(raw) {
  const lines = importNormalizeLines(raw);
  const seg = importSegment(lines);
  if (!seg.ok) {
    const legacy = parseFreeTextRecipeLegacy(String(raw == null ? '' : raw));
    return importFinalizeDraft(legacy, { origin: 'text', raw, lines, legacy: true });
  }
  const r = emptyRecipe();
  r.source = null;
  r.servings = 0;   // unbekannte Ausbeute bleibt unbekannt (kein erfundener Standardwert)
  r.timeMinutes = 0;
  const titleText = seg.titleLine ? (importStripEmoji(stripBullet(seg.titleLine)) || stripBullet(seg.titleLine)) : '';
  r.title = titleText || 'Importiertes Rezept';
  if (r.title.length > 200) { seg.flags.push('title-long'); r.title = r.title.slice(0, 200).replace(/\s+\S*$/, '').trim() + '…'; }   // nie mitten im Wort kuerzen
  const rows = [];
  seg.ingItems.forEach(it => {
    const p = parseIngredientLine(it.text);
    if (!p || !String(p.name || '').trim()) return;
    const conv = autoConvertIngredient(p);
    const row = { amount: conv.amount, unit: conv.unit, name: conv.name };
    if (it.group) row.group = it.group;
    if (p._flags) Object.defineProperty(row, '_flags', { value: p._flags, enumerable: false });
    rows.push(row);
  });
  r.ingredients = rows.length ? rows : [{ amount: '', unit: '', name: '' }];
  r.steps = seg.steps.length ? seg.steps.map(t => ({ text: t.trim() })).filter(s => s.text) : [{ text: '' }];
  if (!r.steps.length) r.steps = [{ text: '' }];
  // Ausbeute (Meta-Zeile vor Ueberschrift, sonst Zahl aus der Zutaten-Ueberschrift)
  let y = seg.meta.yield || (seg.headerYield ? importParseYield('für ' + seg.headerYield) : null);
  if (y && y.count) { r.servings = y.count; if (y.mode === 'pieces') { r.servingMode = 'pieces'; if (y.label) r.yieldLabel = y.label; } }
  const t = seg.meta.times || {};
  const labelled = ['total', 'totalOrPrep', 'prep', 'rest', 'cook'].filter(k => t[k] != null);
  let total = t.total != null ? t.total : (t.totalOrPrep != null ? t.totalOrPrep : null);
  if (total == null && labelled.length === 1 && labelled[0] === 'prep') total = t.prep;   // einzelne "Arbeitszeit" gilt wie bisher als Zeit
  if (total) r.timeMinutes = total;
  if (t.prep && !(labelled.length === 1 && labelled[0] === 'prep')) r.prepMinutes = t.prep; else if (t.totalOrPrep && t.total != null) r.prepMinutes = t.totalOrPrep;
  if (t.rest) r.restMinutes = t.rest;
  if (t.cook) r.cookMinutes = t.cook;
  if (seg.meta.difficulty) r.difficulty = seg.meta.difficulty;
  if (seg.meta.source) r.source = seg.meta.source;
  // Notizen: Utensilien (keine Zutaten) und erkannte Hinweise
  const noteParts = [];
  if (seg.utensils.length) noteParts.push('Utensilien: ' + seg.utensils.join(', '));
  if (seg.notes.length) noteParts.push(seg.notes.join('\n'));
  const tagWords = [];
  (String(raw || '').match(/#[\wäöüÄÖÜß-]+/g) || []).forEach(x => tagWords.push(x.replace('#', '')));
  const dietText = [r.title].concat(seg.ingItems.map(i => i.text), seg.steps).join('\n') + '\n' + tagWords.map(w => '#' + w).join(' ');
  const draft = importEnrichRecipe(r, dietText, tagWords, noteParts.join('\n\n'), { titleLine: seg.titleLine, servMatch: !!(y && y.count), timeMatch: !!total });
  return importFinalizeDraft(draft, { origin: 'text', raw, lines, seg, yield: y });
}

/* ---------- 4. Validierung und Vorschau-Hinweise (gemeinsam fuer Freitext und JSON) ---------- */
function importLooksLikeSentence(name) {
  const s = String(name || '').trim();
  const words = s.split(/\s+/).filter(Boolean).length;
  return (words >= 5 && /[.!?]$/.test(s)) || (words >= 8) || /^(?:die|der|das|den|dem|in|mit|alles|man|dann|danach|zuerst|anschliessend|anschließend)\s/i.test(s) && words >= 4;
}
function importFinalizeDraft(r, ctx) {
  ctx = ctx || {};
  const issues = [];   // { id, level: 'check'|'missing', field, text, original, action?, index? }
  const ingredients = r.ingredients || [];
  const real = ingredients.map((i, idx) => ({ i, idx })).filter(x => x.i && String(x.i.name || '').trim() && !isIngredientHeaderRow(x.i));
  // Zutaten
  real.forEach(({ i, idx }) => {
    const name = String(i.name).trim();
    if (importLooksLikeSentence(name)) issues.push({ id: 'ing-sentence', level: 'check', field: 'ingredients', index: idx, text: 'Das sieht nach einem Arbeitsschritt aus, nicht nach einer Zutat.', original: name, action: 'import-ing-to-step' });
    else if (IMP_UTENSIL_WORDS.test(name) && !/\b(pulver|gewürz)\b/i.test(name)) issues.push({ id: 'ing-utensil', level: 'check', field: 'ingredients', index: idx, text: 'Das sieht nach einem Utensil aus, nicht nach einer Zutat.', original: name, action: 'import-ing-remove' });
    else if (/,.*,/.test(name) || /\b[A-ZÄÖÜ]\p{L}+\s+und\s+[A-ZÄÖÜ]\p{L}+/u.test(name) && !impStartsWithAmount(name) && importSplitIngredientLine(name).length > 1) issues.push({ id: 'ing-multi', level: 'check', field: 'ingredients', index: idx, text: 'Mehrere Lebensmittel in einer Zeile?', original: name, action: 'import-split-ing' });
    if (/\boder\b/i.test(name) && !issues.some(x => x.index === idx)) issues.push({ id: 'ing-alt', level: 'check', field: 'ingredients', index: idx, text: 'Alternative oder Zusatz: bitte prüfen, ob beides benötigt wird.', original: name });
    const q = qtyFromIngredient(i);
    if (q.kind === 'ambiguous') issues.push({ id: 'ing-amount', level: 'check', field: 'ingredients', index: idx, text: `Die Menge „${q.text}“ kann mehrere Zahlen bedeuten (z. B. ${q.candidates.map(c => String(c).replace('.', ',')).join(' oder ')}). Bitte eintragen, bis dahin wird sie nicht umgerechnet.`, original: name });
    else if (q.kind === 'invalid') issues.push({ id: 'ing-amount', level: 'check', field: 'ingredients', index: idx, text: `Die Menge „${q.text}“ ist keine Zahl.`, original: name });
  });
  if (!real.length) issues.push({ id: 'ing-none', level: 'missing', field: 'ingredients', text: 'Keine Zutaten erkannt.' });
  // Schritte
  const steps = (r.steps || []).filter(s => (s.text || '').trim());
  if (!steps.length) issues.push({ id: 'steps-none', level: 'missing', field: 'steps', text: 'Keine Zubereitungsschritte erkannt.' });
  else if (ctx.seg && ctx.seg.numbered) {
    const nums = ctx.seg.stepNums.filter(n => n != null);
    const gap = nums.some((n, k) => n !== k + 1);
    if (gap) issues.push({ id: 'steps-numbering', level: 'check', field: 'steps', text: `Die Nummerierung der Schritte ist lückenhaft (${nums.join(', ')}). Bitte prüfen, ob ein Schritt fehlt oder fälschlich in einer anderen Liste steht.` });
  }
  // Ausbeute
  const yieldKnown = Number(r.servings) > 0;
  if (!yieldKnown) issues.push({ id: 'yield', level: 'missing', field: 'servings', text: 'Ausbeute fehlt. Die Mengen bleiben wie im Original, Skalieren und Nährwerte pro Portion gehen erst nach einem Eintrag.' });
  if (ctx.yield && ctx.yield.unknown) issues.push({ id: 'yield-range', level: 'check', field: 'servings', text: `Die Ausbeute ist als Spanne angegeben („${ctx.yield.text}“). Bitte eine Zahl eintragen.` });
  // Zeit
  if (!(r.timeMinutes > 0)) issues.push({ id: 'time', level: 'missing', field: 'time', text: 'Gesamtzeit fehlt oder ist im Text nicht eindeutig angegeben. Sie bleibt leer, es wird nichts zusammengerechnet.' });
  if (ctx.seg && ctx.seg.meta.timeRanges) issues.push({ id: 'time-range', level: 'check', field: 'time', text: `Zeit als Spanne angegeben („${ctx.seg.meta.timeRanges[0]}“). Bitte eine Zahl eintragen.` });
  // Alternativen im Schritt (mehrere Garmethoden)
  const methodSteps = steps.filter(s => /\n/.test(s.text) && /(airfryer|backofen|heißluft|umluft|ober-?\/?unterhitze|grill|pfanne|mikrowelle)/i.test(s.text));
  // Nicht zugeordnet
  const unassigned = (ctx.seg && ctx.seg.unassigned) || [];
  if (unassigned.length) issues.push({ id: 'unassigned', level: 'check', field: 'unassigned', text: `${unassigned.length} Zeile${unassigned.length === 1 ? '' : 'n'} nicht zugeordnet (z. B. Einleitung). Sie werden nicht gespeichert, solange du sie nicht übernimmst.` });
  if (ctx.seg && ctx.seg.otherRecipeText) issues.push({ id: 'multi-recipe', level: 'check', field: 'recipe', text: 'Der Text enthält mehr als ein Rezept. Übernommen wurde nur das erste.', action: 'import-next-recipe' });
  if (ctx.seg && ctx.seg.flags.includes('title-long')) issues.push({ id: 'title-long', level: 'check', field: 'title', text: 'Der Titel war sehr lang und wurde an einer Wortgrenze gekürzt. Der Originaltitel steht im Originaltext.' });
  if (ctx.warnings && ctx.warnings.length) ctx.warnings.forEach(w => issues.push({ id: 'json-warning', level: 'check', field: w.path || 'recipe', text: w.message }));
  const s = r._importSummary || {};
  const noQty = real.filter(x => qtyFromIngredient(x.i).kind === 'missing').map(x => String(x.i.name).trim());
  r._importSummary = {
    ...s,
    titleFound: !!(r.title && r.title !== 'Importiertes Rezept'),
    ingredientCount: real.length,
    groupCount: typeof getIngredientGroups === 'function' ? getIngredientGroups(r).filter(g => g.title !== 'Zutaten').length : 0,
    stepCount: steps.length,
    servingsFound: yieldKnown,
    timeFound: r.timeMinutes > 0,
    noAmount: noQty,
    methodSteps: methodSteps.length,
    origin: ctx.origin || ctx.source || 'text',
    issues,
  };
  r._import = { raw: ctx.raw == null ? '' : String(ctx.raw), unassigned: unassigned.slice(), otherRecipeText: ctx.seg ? (ctx.seg.otherRecipeText || '') : '', junkCount: ctx.seg ? ctx.seg.junk.length : 0 };
  return r;
}

/* Nach einer Korrektur in der Vorschau die Hinweise neu berechnen (Zustand aus dem Entwurf, nichts wird gespeichert) */
function importRefresh(r) {
  const prev = r._importSummary || {};
  const imp = r._import || {};
  return importFinalizeDraft(r, { origin: prev.origin || 'text', raw: imp.raw, seg: { unassigned: imp.unassigned || [], otherRecipeText: imp.otherRecipeText || '', numbered: false, stepNums: [], meta: {}, flags: [], junk: new Array(imp.junkCount || 0) } });
}
