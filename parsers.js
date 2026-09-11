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
    });
  }

  results.sort((a, b) => a.index - b.index);
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

function parseIngredientLine(line) {
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
const NOTE_HEADER_RE = /^(tipps?|hinweise?|gut zu wissen|notizen?|anmerkungen?|serviertipps?|servieren|zum servieren|dazu passt|dazu passen|varianten?|alternativen?|vorbereiten|vorbereitung|lässt sich( gut)? vorbereiten|haltbarkeit|aufbewahrung|lagerung|resteverwertung)\s*:?\s*$/i;

// B) Satzstarter (Punkt 51) — Ueberschrift UND Inhalt in derselben Zeile, durch Doppelpunkt
// getrennt. Bewusst nur die im Auftrag explizit gelisteten Formulierungen, damit z.B. "Mit
// Petersilie servieren." (ein ganz normaler Zubereitungsschritt, Punkt 52) NICHT anschlaegt —
// das erfordert weder einen Doppelpunkt noch steht "servieren" hier am Zeilenanfang.
const NOTE_STARTER_RE = /^(tipp|dazu passt|dazu passen|schneller gehts|schneller geht's|lässt sich( gut)? vorbereiten|haltbarkeit|aufbewahrung|variante|alternativ|wer mag|nach belieben|zum servieren|zum anrichten)\s*:\s*\S/i;

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

function parseFreeTextRecipe(raw) {
  const rawLines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const { contentLines: lines, notes: detectedNotes } = extractNotesSection(rawLines);
  const r = emptyRecipe();
  r.source = null;

  const ingHeaderRe = /^(zutaten|ingredients?)\s*:?\s*$/i;
  const stepHeaderRe = /^(zubereitung|anleitung|schritte|steps?|instructions?)\s*:?\s*$/i;
  const metaLineRe = /portionen|personen|servings|dauert|zubereitungszeit|gesamtzeit|kochzeit/i;
  const isHashtagOnly = (l) => !l.replace(/#[\wäöüÄÖÜß-]+/g, '').trim();

  let tagWords = [];
  lines.forEach(l => {
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
    !metaLineRe.test(l) && !STEP_NUM_RE.test(l) && !looksLikeIngredient(l)
  ) || lines.find(l => !l.startsWith('#')) || null;

  let ingLines = [], stepLines = [];

  if (numberedSteps.length) {
    stepLines = numberedSteps.sort((a, b) => a.num - b.num).map(s => s.text);
    const firstStepIdx = Math.min(...numberedSteps.map(s => s.idx));
    if (ingStart !== -1) {
      const end = (stepStart !== -1 && stepStart > ingStart) ? stepStart : firstStepIdx;
      ingLines = lines.slice(ingStart + 1, Math.max(end, ingStart + 1)).filter(l => !STEP_NUM_RE.test(l));
    } else {
      ingLines = lines.slice(0, firstStepIdx).filter(l => l !== titleLine && looksLikeIngredient(l));
    }
  } else if (ingStart !== -1 || stepStart !== -1) {
    const firstSectionIdx = [ingStart, stepStart].filter(i => i !== -1).sort((a, b) => a - b)[0];
    if (ingStart !== -1) {
      const end = stepStart !== -1 && stepStart > ingStart ? stepStart : lines.length;
      ingLines = lines.slice(ingStart + 1, end);
    }
    if (stepStart !== -1) {
      const end = ingStart !== -1 && ingStart > stepStart ? ingStart : lines.length;
      stepLines = lines.slice(stepStart + 1, end).filter(l => !ingHeaderRe.test(l));
    }
  } else {
    for (const l of lines) {
      if (l === titleLine || l.startsWith('#')) continue;
      if (looksLikeIngredient(l) && l.length < 60) ingLines.push(l);
      else stepLines.push(l);
    }
  }

  ingLines = ingLines.filter(l => !metaLineRe.test(l) && !isHashtagOnly(l));
  stepLines = stepLines.filter(l => !metaLineRe.test(l) && !isHashtagOnly(l));

  r.title = titleLine ? stripBullet(titleLine).slice(0, 80) : 'Importiertes Rezept';
  r.ingredients = ingLines.map(l => parseIngredientLine(stripBullet(l))).filter(i => i.name);
  r.ingredients = r.ingredients.map(i => autoConvertIngredient(i));
  r.steps = stepLines.map(l => ({ text: stripStepNumber(stripBullet(l)) })).filter(s => s.text);
  if (!r.ingredients.length) r.ingredients = [{ amount: '', unit: '', name: '' }];
  if (!r.steps.length) r.steps = [{ text: '' }];

  // Zeit/Portionen nur aus eindeutigen Meta-Zeilen uebernehmen (z.B. "Zubereitungszeit: 30 Min"),
  // NICHT aus irgendeiner Zahl irgendwo im Fliesstext — sonst wird zufaellig die Dauer eines
  // einzelnen Zwischenschritts (z.B. "~8 Min" beim Karamellisieren) faelschlich als Gesamtzeit
  // uebernommen. Ohne klare Meta-Zeile bleibt der Standardwert stehen und wird im Import-Hinweis
  // ehrlich als "nicht erkannt" markiert, statt eine moeglicherweise falsche Zahl zu zeigen.
  const metaText = lines.filter(l => metaLineRe.test(l)).join(' ');
  const timeMatch = metaText ? metaText.match(/(\d+)\s*(min(?:uten)?|std\.?|stunden?)/i) : null;
  if (timeMatch) r.timeMinutes = /std|stunden/i.test(timeMatch[2]) ? parseInt(timeMatch[1]) * 60 : parseInt(timeMatch[1]);
  const servMatch = metaText ? metaText.match(/(\d+)\s*(portionen|personen|servings)/i) : null;
  if (servMatch) r.servings = parseInt(servMatch[1]);

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
  r._importSummary = {
    titleFound: !!titleLine,
    ingredientCount: r.ingredients.filter(i => i.name).length,
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
