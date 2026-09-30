/* ---------- Timer parsing for cook mode ---------- */
/* ---------- Zentraler Dauer-Parser (Zeitspannen, Sekunden, Dezimalstunden, Zahlwoerter) ---------- */
function durationUnitSeconds(unit) {
  if (/^(Stunden?|Std\.?|h)$/i.test(unit)) return 3600;
  if (/^(Sekunden?|Sek\.?|s)$/i.test(unit)) return 1;
  return 60; // Minuten
}

// Kleine Normalisierungsschicht fuer Zahlwoerter statt einer langen Liste unwartbarer
// Sonderfaelle: jedes Wort wird auf seinen Zahlenwert abgebildet, "eineinhalb"/"anderthalb"
// separat als 1.5. Nach Wortlaenge absteigend sortiert, damit z.B. "fuenfundvierzig" nicht
// schon bei "fuenf" abgeschnitten wird.
const GERMAN_TIME_NUMBER_WORDS = {
  'eineinhalb': 1.5, 'anderthalb': 1.5,
  'fünfundvierzig': 45, 'zwanzig': 20, 'dreissig': 30, 'dreißig': 30, 'vierzig': 40,
  'sechzig': 60, 'fünfzehn': 15, 'zwölf': 12, 'zehn': 10,
  'eins': 1, 'eine': 1, 'ein': 1, 'zwei': 2, 'drei': 3, 'vier': 4, 'fünf': 5,
  'sechs': 6, 'sieben': 7, 'acht': 8, 'neun': 9, 'elf': 11,
};
const TIME_NUMBER_WORD_PATTERN = Object.keys(GERMAN_TIME_NUMBER_WORDS).sort((a, b) => b.length - a.length).join('|');

function parseTimeNumberToken(tok) {
  if (tok == null) return null;
  const t = tok.trim();
  if (/^½$/.test(t)) return 0.5;
  const halfMatch = /^(\d+)\s*½$/.exec(t);
  if (halfMatch) return parseInt(halfMatch[1], 10) + 0.5;
  const wordMatch = new RegExp(`^(${TIME_NUMBER_WORD_PATTERN})$`, 'i').exec(t);
  if (wordMatch) return GERMAN_TIME_NUMBER_WORDS[wordMatch[1].toLowerCase()];
  const f = parseFloat(t.replace(',', '.'));
  return isNaN(f) ? null : f;
}

function parseDurations(text) {
  const results = [];

  // 1) Uhrzeit-artige Stundenangabe (1:30 Stunden / 1:30 h) — eigenes Muster, da das
  //    Ergebnis direkt in Minuten umgerechnet wird statt mit der allgemeinen Einheit.
  const hmRe = /\b(\d{1,2}):(\d{2})\s*(Stunden?|Std\.?|h)\b/gi;
  let hm;
  while ((hm = hmRe.exec(text)) !== null) {
    const totalSeconds = (parseInt(hm[1], 10) * 60 + parseInt(hm[2], 10)) * 60;
    results.push({
      raw: hm[0], index: hm.index, length: hm[0].length,
      seconds: totalSeconds, minSeconds: totalSeconds, maxSeconds: totalSeconds, confidence: 'exact',
    });
  }

  // 2) Allgemeines Muster: Ziffer, Dezimalzahl, Zahlwort, ½ oder "1½" [bis/– weitere Zahl] Einheit.
  //    Die Einheit muss unmittelbar folgen — nur so werden "180 Grad", "2 Portionen" oder
  //    "5 Eier" zuverlaessig NICHT als Zeitangabe erkannt (kein False Positive).
  const numTok = `(?:\\d+(?:[.,]\\d+)?\\s*½?|½|${TIME_NUMBER_WORD_PATTERN})`;
  const re = new RegExp(`(${numTok})\\s*(?:(?:bis|-|–|—)\\s*(${numTok})\\s*)?(Stunden?|Std\\.?|Minuten?|Min\\.?|Sekunden?|Sek\\.?|h)\\b`, 'gi');
  let m;
  while ((m = re.exec(text)) !== null) {
    // Ueberlappung mit bereits erkannten h:mm-Treffern vermeiden (kein Doppel-Treffer).
    if (results.some(r => m.index < r.index + r.length && m.index + m[0].length > r.index)) continue;
    const mult = durationUnitSeconds(m[3]);
    const n1 = parseTimeNumberToken(m[1]);
    const n2 = m[2] ? parseTimeNumberToken(m[2]) : null;
    if (n1 == null) continue;
    const minSeconds = Math.round(n1 * mult);
    const maxSeconds = n2 != null ? Math.round(n2 * mult) : minSeconds;
    results.push({
      raw: m[0], index: m.index, length: m[0].length,
      seconds: maxSeconds, // bei Zeitspannen wird der obere Wert vorgeschlagen
      minSeconds, maxSeconds,
      confidence: n2 != null ? 'range' : 'exact',
      unitSeconds: mult,
    });
  }

  // 3) Zeitwoerter: "eine halbe Stunde", "Viertelstunde", "Dreiviertelstunde"
  const wordRe = /\b(?:(?:eine|1)\s+)?(halbe|halbstunde|viertelstunde|dreiviertelstunde|dreiviertel\s+stunde|viertel\s+stunde)(?:\s+(?:stunde|std\.?))?(?![a-zäöüß])/gi;
  let w;
  while ((w = wordRe.exec(text)) !== null) {
    if (/^halbe$/i.test(w[1]) && !/(stunde|std)/i.test(w[0])) continue;   // "halbe" allein ist keine Zeitangabe
    if (results.some(r => w.index < r.index + r.length && w.index + w[0].length > r.index)) continue;
    const key = w[1].toLowerCase().replace(/\s+/g, '');
    const secs = key.startsWith('dreiviertel') ? 2700 : key.startsWith('viertel') ? 900 : 1800;
    results.push({ raw: w[0], index: w.index, length: w[0].length, seconds: secs, minSeconds: secs, maxSeconds: secs, confidence: 'exact', unitSeconds: 3600 });
  }

  results.sort((a, b) => a.index - b.index);

  // 4) "1 Std. 30 Min." ist EIN Timer (90 Minuten), nicht zwei
  for (let i = 0; i < results.length - 1; i++) {
    const a = results[i], b = results[i + 1];
    if (a.unitSeconds === 3600 && b.unitSeconds === 60 && a.confidence === 'exact' && b.confidence === 'exact' &&
        /^\.?\s*(?:und\s+)?$/i.test(text.slice(a.index + a.length, b.index))) {
      const end = b.index + b.length;
      const total = a.seconds + b.seconds;
      results.splice(i, 2, { raw: text.slice(a.index, end), index: a.index, length: end - a.index, seconds: total, minSeconds: total, maxSeconds: total, confidence: 'exact', unitSeconds: 60 });
    }
  }
  return results;
}

function parseStepSegments(text) {
  const durations = parseDurations(text);
  const segments = [];
  let last = 0, i = 0;
  for (const d of durations) {
    if (d.index > last) segments.push({ type: 'text', value: text.slice(last, d.index) });
    segments.push({ type: 'timer', value: d.raw, seconds: d.seconds, key: 'seg' + (i++) });
    last = d.index + d.length;
  }
  if (last < text.length) segments.push({ type: 'text', value: text.slice(last) });
  return segments;
}

function fmtClock(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function parseISODuration(iso) {
  if (!iso) return null;
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?/.exec(iso);
  if (!m) return null;
  return (parseInt(m[1] || 0) * 60) + parseInt(m[2] || 0);
}

// Zeile, die nur aus einer Dauer besteht ("20 Minuten", "ca. 1 Std. 30 Min.")
function isDurationOnlyLine(l) {
  return /^(ca\.?|etwa|rund|zeit:?|dauer:?)?\s*\d+([.,]\d+)?\s*(h|std\.?|stunden?|min\.?|minuten?)(\s*(und\s*)?\d+\s*(min\.?|minuten?))?\.?$/i.test(stripBullet(String(l)).trim());
}
// Kurze Zwischenueberschrift zwischen Zutaten ("Teig:", "Für die Sauce:")
function isGroupHeadingLine(l) {
  const s = stripBullet(String(l)).trim();
  return /:$/.test(s) && s.length <= 40 && !/\d/.test(s) && s.split(/\s+/).length <= 5;
}

/* Wandelt eine Dauerangabe in Minuten um: "20 Minuten", "1 Std. 30 Min.", "1,5 h", "90 min". */
function parseDurationText(s) {
  const text = String(s || '').toLowerCase();
  let total = 0, found = false, m;
  const hRe = /(\d+(?:[.,]\d+)?)\s*(h\b|std\.?|stunden?)/g;
  while ((m = hRe.exec(text))) { total += parseFloat(m[1].replace(',', '.')) * 60; found = true; }
  const mRe = /(\d+)\s*(min\.?|minuten?)\b/g;
  while ((m = mRe.exec(text))) { total += parseInt(m[1], 10); found = true; }
  return found ? Math.round(total) : null;
}

function parseIngredientLine(line) {
  // Bevorzugt der gemeinsame Zeilen-Parser (Brueche wie "1 1/2 dl" und "½ TL", Bereiche, bekannte Einheiten)
  if (typeof ingPasteParseLine === 'function') {
    const p = ingPasteParseLine(String(line));
    if (p) return p;
  }
  const m = /^([\d.,\/]+)\s*([a-zA-ZäöüÄÖÜ.]*)\s+(.*)$/.exec(line.trim());
  if (m) return { amount: m[1].replace(',', '.'), unit: m[2], name: m[3] };
  return { amount: '', unit: '', name: line };
}

/* ---------- Freitext-Import (z.B. Instagram-Bildunterschrift) ---------- */
function stripBullet(line) {
  // Deckt per Unicode-Kategorie (Symbol/Interpunktion) praktisch jedes gaengige Bullet-Zeichen ab
  // (-, *, •, ‣, ▪, ◦, ·, ∙, ●, ➤, ✦ ...), nicht nur eine feste Liste.
  return line.replace(/^[\s]*[\p{P}\p{S}]+\s*/u, '').replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]\s*/u, '').trim();
}

function stripStepNumber(line) {
  return line.replace(/^\s*(schritt\s*)?\d+[\.\):]\s*/i, '').trim();
}

const STEP_NUM_RE = /^\s*(?:schritt\s*)?(\d+)[\.\):]\s+(.+)$/i;

function looksLikeIngredient(line) {
  if (STEP_NUM_RE.test(line)) return false;
  const s = stripBullet(line);
  if (!s) return false;
  return /^[\d½¼¾⅓⅔]/.test(s) || /^\s*[\p{P}\p{S}]/u.test(line) || /^[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(line);
}

/* ---------- Automatische Notiz-Erkennung beim Textimport (Master-Prompt Teil D, Punkt 49-58) ----------
   Erkennt Tipps/Hinweise/Serviervorschläge etc. am Ende eines eingefügten Rezepttexts und trennt
   sie automatisch von der eigentlichen Zubereitung ab, statt sie als Zubereitungsschritt zu
   fehlinterpretieren. WICHTIG (Punkt 54): erfindet NIE eine Notiz — findet der Text keine
   erkennbare Notiz-Sektion, bleibt notes leer. */

// A) Eigenstaendige Ueberschriftszeile (Punkt 50) — die ganze Zeile besteht nur aus dem
// Ueberschriftswort (+ optionalem Doppelpunkt), der eigentliche Inhalt folgt in Zeilen danach.
const NOTE_HEADER_RE = /^(tipps?|hinweise?|gut zu wissen|notiz(en)?|anmerkungen?|serviertipps?|servieren|zum servieren|dazu passt|dazu passen|varianten?|alternativen?|vorbereiten|vorbereitung|lässt sich( gut)? vorbereiten|haltbarkeit|aufbewahrung|lagerung|resteverwertung)\s*:?\s*$/i;

// B) Satzstarter (Punkt 51) — Ueberschrift UND Inhalt in derselben Zeile, durch Doppelpunkt
// getrennt. Bewusst nur die im Auftrag explizit gelisteten Formulierungen, damit z.B. "Mit
// Petersilie servieren." (ein ganz normaler Zubereitungsschritt, Punkt 52) NICHT anschlaegt —
// das erfordert weder einen Doppelpunkt noch steht "servieren" hier am Zeilenanfang.
// "notiz(en)" ergaenzt (Bugfix): war zuvor nur in der Header-Variante gelistet und dort zudem
// nur als "notizen?" (verlangte faelschlich ein "e" vor dem optionalen "n" und traf damit nie
// auf das singulare "Notiz"), obwohl "Notiz: ..." als Ein-Zeilen-Form vermutlich die haeufigste
// Schreibweise ueberhaupt ist.
const NOTE_STARTER_RE = /^(tipp|notiz(en)?|dazu passt|dazu passen|schneller gehts|schneller geht's|lässt sich( gut)? vorbereiten|haltbarkeit|aufbewahrung|variante|alternativ|wer mag|nach belieben|zum servieren|zum anrichten)\s*:\s*\S/i;

function isNoteSectionStart(line) {
  return NOTE_HEADER_RE.test(line) || NOTE_STARTER_RE.test(line);
}

/* Sucht die ERSTE Zeile, die eine Notiz-Sektion einleitet, und trennt ab dort alles als Notiz
   ab (Punkt 53: Struktur/Zeilenumbrueche bleiben erhalten, nichts wird zusammengeklebt).
   Reine Hashtag-Zeilen ("#pasta #dinner") am Ende zaehlen nicht zu den Notizen und werden
   uebersprungen, falls sie NACH dem Notiz-Beginn noch auftauchen. */
function extractNotesSection(lines) {
  const isHashtagOnly = (l) => !l.replace(/#[\wäöüÄÖÜß-]+/g, '').trim();
  const startIdx = lines.findIndex((l) => isNoteSectionStart(l));
  if (startIdx === -1) return { contentLines: lines, notes: '' };
  const noteLines = lines.slice(startIdx).filter((l) => !isHashtagOnly(l));
  return { contentLines: lines.slice(0, startIdx), notes: noteLines.join('\n').trim() };
}

/* ---------- Import-Hilfen (Emoji, Kopfzeilen, Saetze) ---------- */
function importStripEmoji(s) {
  return String(s || '').replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D\u20E3]/gu, '').replace(/\s+/g, ' ').trim();
}
function importHeadKey(l) { return importStripEmoji(l).replace(/^[\s\p{P}\p{S}]+/u, '').replace(/[:：]\s*$/, '').trim(); }
function importIsIngHeader(l) {
  const k = importHeadKey(l);
  return k.length <= 60 && /^(zutaten|ingredients?)(\s+(für|fuer|for)\s+.+|\s*[(\[].*[)\]])?$/i.test(k);
}
function importIsStepHeader(l) {
  const k = importHeadKey(l);
  return k.length <= 40 && /^(zubereitung|zubereitungsschritte|anleitung|schritte|steps?|instructions?|method|so geht'?s|so gehts|so wird'?s gemacht|und so geht'?s|und so gehts)$/i.test(k);
}
// Zeile beginnt (nach Emoji und Aufzaehlungszeichen) mit einer Mengenangabe
function importStartsWithAmount(l) {
  return /^[\d½¼¾⅓⅔⅛]/.test(importStripEmoji(stripBullet(String(l))).replace(/^[\s\p{P}\p{S}]+/u, ''));
}
// Ganzer Satz statt Zutatenzeile: mind. 5 Woerter und Satzzeichen am Ende oder lang
function importIsSentence(l) {
  const s = importStripEmoji(stripBullet(String(l))).trim();
  const words = s.split(/\s+/).filter(Boolean).length;
  return words >= 5 && (/[.!?]$/.test(s) || s.length >= 70);
}
const IMPORT_ABBREV = /(?:^|\s)(?:min|std|sek|ca|pck|pkg|stk|z\.b|bzw|ggf|evtl|nr|el|tl|msp|dl|cl|ml|kg|g)\.$/i;
function importSplitSentences(text) {
  const t = String(text || '').trim();
  if (t.length < 130) return [t];
  const out = []; let cur = '';
  t.split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ])/).forEach(part => {
    if (cur && IMPORT_ABBREV.test(cur)) { cur += ' ' + part; return; }   // "20 Min. Kochen" nicht trennen
    if (cur) out.push(cur);
    cur = part;
  });
  if (cur) out.push(cur);
  // Zu kurze Bruchstuecke an den Vorgaenger haengen
  return out.reduce((acc, s) => { if (acc.length && s.length < 25) acc[acc.length - 1] += ' ' + s; else acc.push(s); return acc; }, []);
}

function parseFreeTextRecipe(raw) {
  const rawLines = raw.split(/\r?\n/).map(l => l.replace(/([0-9])\uFE0F?\u20E3\s*/g, '$1. ').replace(/[’‘]/g, "'").trim()).filter(Boolean);
  const { contentLines: lines, notes: detectedNotes } = extractNotesSection(rawLines);
  const r = emptyRecipe();
  r.source = null;

  const ingHeaderRe = { test: (l) => importIsIngHeader(l) };
  const stepHeaderRe = { test: (l) => importIsStepHeader(l) };
  const metaLineRe = /portionen|personen|servings|dauert|zubereitungszeit|gesamtzeit|kochzeit|arbeitszeit|backzeit|ruhezeit|zeitaufwand|schwierigkeit|zutaten\s*(?:für|fuer)\s+\d+|^[\p{Extended_Pictographic}\uFE0F\s]*(?:für|fuer)\s+\d+\s*(?:stück|stk|port|pers)|[⏱⏲🕒🕐🕑🕓🕔🕕]/iu;
  const isHashtagOnly = (l) => !l.replace(/#[\wäöüÄÖÜß-]+/g, '').trim();

  let tagWords = [];
  rawLines.forEach(l => {
    const tags = l.match(/#[\wäöüÄÖÜß-]+/g);
    if (tags) tagWords.push(...tags.map(t => t.replace('#', '')));
  });

  const ingStart = lines.findIndex(l => ingHeaderRe.test(l));
  const stepStart = lines.findIndex(l => stepHeaderRe.test(l));

  // Instagram-Bildunterschriften haben die Schritte meist schon nummeriert — dieses
  // Muster ist ein zuverlässiges Signal und wird unabhängig von Überschriften erkannt.
  const numberedSteps = [];
  lines.forEach((l, idx) => {
    const m = STEP_NUM_RE.exec(l);
    if (m) numberedSteps.push({ idx, num: parseInt(m[1]), text: m[2].trim() });
  });
  // Beschreibungszeilen OHNE eigene Nummerierung, die direkt nach einer Schritt-Überschrift
  // folgen (typisch bei aus Notizen kopierten Rezepten: "1. Kurztitel" + Detailabsatz darunter),
  // gehören inhaltlich zu diesem Schritt und werden angehängt statt verworfen.
  if (numberedSteps.length) {
    const byPosition = [...numberedSteps].sort((a, b) => a.idx - b.idx);
    byPosition.forEach((step, i) => {
      const nextIdx = i + 1 < byPosition.length ? byPosition[i + 1].idx : lines.length;
      const continuation = lines.slice(step.idx + 1, nextIdx)
        .filter(l => !ingHeaderRe.test(l) && !stepHeaderRe.test(l) && !metaLineRe.test(l) && !isHashtagOnly(l));
      if (continuation.length) {
        let title = step.text.trim();
        if (title && !/[.!?:]$/.test(title)) title += '.'; // sonst liest sich "Titel Fliesstext..." als ein Satz ohne Pause
        step.text = (title + ' ' + continuation.join(' ')).replace(/\s+/g, ' ').trim();
      }
    });
  }

  const titleLine = lines.find(l =>
    !isHashtagOnly(l) && !ingHeaderRe.test(l) && !stepHeaderRe.test(l) &&
    !metaLineRe.test(l) && !STEP_NUM_RE.test(l) && !importStartsWithAmount(l) && !isGroupHeadingLine(l) &&
    importStripEmoji(stripBullet(l)).length > 1
  ) || lines.find(l => !l.startsWith('#')) || null;

  let ingLines = [], stepLines = [];

  if (numberedSteps.length) {
    stepLines = numberedSteps.sort((a, b) => a.num - b.num).map(s => s.text);
    const firstStepIdx = Math.min(...numberedSteps.map(s => s.idx));
    if (ingStart !== -1) {
      const end = (stepStart !== -1 && stepStart > ingStart) ? stepStart : firstStepIdx;
      ingLines = lines.slice(ingStart + 1, Math.max(end, ingStart + 1)).filter(l => !STEP_NUM_RE.test(l));
    } else {
      ingLines = lines.slice(0, firstStepIdx).filter(l => l !== titleLine && !isDurationOnlyLine(l) && (looksLikeIngredient(l) || isGroupHeadingLine(l)));
    }
  } else if (ingStart !== -1 || stepStart !== -1) {
    const firstSectionIdx = [ingStart, stepStart].filter(i => i !== -1).sort((a, b) => a - b)[0];
    if (ingStart !== -1) {
      const end = stepStart !== -1 && stepStart > ingStart ? stepStart : lines.length;
      ingLines = lines.slice(ingStart + 1, end);
      // Ohne eigene Zubereitungs-Ueberschrift beginnt die Zubereitung mit dem ersten ganzen Satz
      if (stepStart === -1) {
        const cut = ingLines.findIndex(l => importIsSentence(l) && !importStartsWithAmount(l));
        if (cut !== -1) { stepLines = ingLines.slice(cut); ingLines = ingLines.slice(0, cut); }
      }
    }
    if (stepStart !== -1) {
      const end = ingStart !== -1 && ingStart > stepStart ? ingStart : lines.length;
      stepLines = lines.slice(stepStart + 1, end).filter(l => !ingHeaderRe.test(l));
    }
  } else {
    // Ohne Kopfzeilen: am Anfang stehen die Zutaten (kurze Zeilen), ab dem ersten ganzen Satz beginnt
    // die Zubereitung. Zeilen mit Mengenangabe bleiben auch danach Zutaten.
    let inIngredients = true;
    for (const l of lines) {
      if (l === titleLine || l.startsWith('#') || metaLineRe.test(l)) continue;
      const strictIng = importStartsWithAmount(l) && l.length < 60 && !/[.!?]$/.test(l);
      if (strictIng) { ingLines.push(l); continue; }
      if (inIngredients && !importIsSentence(l)) { ingLines.push(l); continue; }
      inIngredients = false;
      stepLines.push(l);
    }
  }

  ingLines = ingLines.filter(l => !metaLineRe.test(l) && !isHashtagOnly(l));
  stepLines = stepLines.filter(l => !metaLineRe.test(l) && !isHashtagOnly(l));
  if (!numberedSteps.length) stepLines = stepLines.flatMap(l => importSplitSentences(l));

  r.title = (titleLine && importStripEmoji(stripBullet(titleLine))) ? importStripEmoji(stripBullet(titleLine)).slice(0, 80) : (titleLine ? stripBullet(titleLine).slice(0, 80) : 'Importiertes Rezept');
  ingLines = ingLines.filter(l => !isDurationOnlyLine(l));
  r.ingredients = ingLines.map(l => parseIngredientLine(stripBullet(l))).filter(i => i.name);
  r.ingredients = r.ingredients.map(i => autoConvertIngredient(i));
  // Gruppenzeilen ("Teig:") werden beim Import direkt zum group-Feld der folgenden Zutaten; sie
  // zaehlen damit nicht als Zutat und landen nie in der Einkaufsliste.
  let importGroup = '';
  r.ingredients = r.ingredients.filter(i => {
    if (typeof isIngredientHeaderRow === 'function' && isIngredientHeaderRow(i)) { importGroup = headerTitle(i); return false; }
    if (importGroup) i.group = importGroup;
    return true;
  });
  r.steps = stepLines.map(l => ({ text: stripStepNumber(stripBullet(l)) })).filter(s => s.text);
  if (!r.ingredients.length) r.ingredients = [{ amount: '', unit: '', name: '' }];
  if (!r.steps.length) r.steps = [{ text: '' }];

  // Zeit/Portionen nur aus eindeutigen Meta-Zeilen uebernehmen (z.B. "Zubereitungszeit: 30 Min"),
  // NICHT aus irgendeiner Zahl irgendwo im Fliesstext — sonst wird zufaellig die Dauer eines
  // einzelnen Zwischenschritts (z.B. "~8 Min" beim Karamellisieren) faelschlich als Gesamtzeit
  // uebernommen. Ohne klare Meta-Zeile bleibt der Standardwert stehen und wird im Import-Hinweis
  // ehrlich als "nicht erkannt" markiert, statt eine moeglicherweise falsche Zahl zu zeigen.
  const metaLines = lines.filter(l => metaLineRe.test(l));
  // Gibt es eine "Gesamtzeit", zaehlt nur sie (sonst wuerden Arbeits-, Koch- und Gesamtzeit doppelt addiert)
  const totalLine = metaLines.find(l => /gesamt|dauert/i.test(l));
  const metaText = (totalLine ? [totalLine].concat(metaLines.filter(l => !/(zeit|dauer|⏱|⏲|🕒|min|std)/i.test(l))) : metaLines).join(' ');
  // F08: Zeit aus Meta-Zeilen ODER aus einer Zeile, die nur aus einer Dauer besteht ("20 Minuten",
  // "1 Std. 30 Min.", "ca. 45 min"). Dauern mitten in Zubereitungsschritten zaehlen weiterhin nicht,
  // und einzelne Timer werden nicht aufsummiert.
  let timeMinutes = metaText ? parseDurationText(metaText) : null;
  if (timeMinutes === null) {
    const onlyDuration = lines.map(l => stripBullet(l).trim()).find(l => /^(ca\.?|etwa|rund|zeit:?|dauer:?)?\s*\d+([.,]\d+)?\s*(h|std\.?|stunden?|min\.?|minuten?)(\s*(und\s*)?\d+\s*(min\.?|minuten?))?\.?$/i.test(l));
    if (onlyDuration) timeMinutes = parseDurationText(onlyDuration);
  }
  const timeMatch = timeMinutes !== null && timeMinutes > 0;
  // Unbekannte Zeit bleibt leer (0) statt eines Standardwerts, der wie ein echter Wert aussieht.
  r.timeMinutes = timeMatch ? timeMinutes : 0;
  const servMatch = metaLines.join(' ').match(/(\d+)\s*(portionen|personen|servings|stück|stueck|stk)/i);
  if (servMatch) { r.servings = parseInt(servMatch[1]); if (/^st(ü|ue)ck|^stk/i.test(servMatch[2])) r.servingMode = 'pieces'; }

  const dietMap = { vegan: 'vegan', vegetarisch: 'vegetarisch', vegetarian: 'vegetarisch', glutenfrei: 'glutenfrei', laktosefrei: 'laktosefrei', nussfrei: 'nussfrei' };
  const NEGATION_WORDS = ['nicht', 'kein', 'keine', 'keinen', 'keinem', 'ohne'];
  const lowerAll = (raw + ' ' + tagWords.join(' ')).toLowerCase();
  const detectedDiet = [];
  for (const [kw, val] of Object.entries(dietMap)) {
    let searchFrom = 0, idx;
    let anyPositive = false;
    // Alle Fundstellen pruefen, nicht nur die erste — falls "vegan" mehrfach vorkommt
    // (z.B. einmal negiert, einmal nicht), zaehlt ein einziger echter Treffer.
    while ((idx = lowerAll.indexOf(kw, searchFrom)) !== -1) {
      const before = lowerAll.slice(Math.max(0, idx - 15), idx);
      const negated = NEGATION_WORDS.some(w => before.includes(w));
      if (!negated) { anyPositive = true; break; }
      searchFrom = idx + kw.length;
    }
    if (anyPositive) detectedDiet.push(val);
  }
  r.diet = Array.from(new Set(detectedDiet));

  // Zusaetzlich zur reinen Text-/Hashtag-Erkennung oben: zutatenbasierte Klassifikation
  // (Master-Prompt Teil I) — zuverlaessiger als blosse Schluesselwoerter im Fliesstext, siehe
  // classification.js. Ergaenzt r.diet nur additiv (nimmt nichts weg) und setzt zusaetzlich
  // recipe.categoryTags (Mahlzeit/Gerichtstyp). Niedrige Sicherheit wird bewusst NICHT
  // automatisch gesetzt (Punkt 101), sondern nur im Importhinweis vorgeschlagen (Punkt 114).
  const autoClassification = classifyRecipe(r);
  applyClassification(r, autoClassification, { minConfidence: 'medium' });
  const lowConfidenceHints = lowConfidenceSuggestions(autoClassification);
  r.tags = Array.from(new Set(tagWords.filter(t => !dietMap[t.toLowerCase()]))).slice(0, 6);
  r.notes = detectedNotes || '';
  // Klar widerspruechliche Ernaehrungsvorschlaege (z.B. "vegan" bei Speck oder Parmesan) bei neuen
  // Importen gar nicht erst setzen. Bestehende Rezepte werden davon nicht beruehrt.
  if (typeof dietConflicts === 'function') {
    const conflicting = new Set(dietConflicts(r).map(c => c.label));
    if (conflicting.size) r.diet = r.diet.filter(d => !conflicting.has(d));
  }
  r._importSummary = {
    titleFound: !!titleLine,
    ingredientCount: typeof realIngredients === 'function' ? realIngredients(r).length : r.ingredients.filter(i => i.name).length,
    groupCount: typeof getIngredientGroups === 'function' ? getIngredientGroups(r).filter(g => g.title !== 'Zutaten').length : 0,
    stepCount: r.steps.filter(s => s.text).length,
    servingsFound: !!servMatch,
    timeFound: !!timeMatch,
    dietFound: r.diet.length > 0,
    notesFound: !!detectedNotes,
    categoryFound: r.categoryTags.length > 0,
    lowConfidenceHints,
  };
  return r;
}
