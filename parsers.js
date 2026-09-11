/* ---------- Timer parsing for cook mode ---------- */
/* ---------- Zentraler Dauer-Parser (Zeitspannen, Sekunden, Dezimalstunden) ---------- */
function durationUnitSeconds(unit) {
  if (/^(Stunden?|Std\.?|h)$/i.test(unit)) return 3600;
  if (/^(Sekunden?|Sek\.?|s)$/i.test(unit)) return 1;
  return 60; // Minuten
}

function parseDurations(text) {
  const re = /(\d+(?:[.,]\d+)?)\s*(?:(?:bis|-|–|—)\s*(\d+(?:[.,]\d+)?)\s*)?(Stunden?|Std\.?|Minuten?|Min\.?|Sekunden?|Sek\.?|h)\b/gi;
  const results = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const mult = durationUnitSeconds(m[3]);
    const n1 = parseFloat(m[1].replace(',', '.'));
    const n2 = m[2] ? parseFloat(m[2].replace(',', '.')) : null;
    if (isNaN(n1)) continue;
    const minSeconds = Math.round(n1 * mult);
    const maxSeconds = n2 !== null && !isNaN(n2) ? Math.round(n2 * mult) : minSeconds;
    results.push({
      raw: m[0], index: m.index, length: m[0].length,
      seconds: maxSeconds, // bei Zeitspannen wird der obere Wert vorgeschlagen
      minSeconds, maxSeconds,
      confidence: n2 !== null ? 'range' : 'exact',
    });
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

function parseFreeTextRecipe(raw) {
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
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
      if (continuation.length) step.text = (step.text + ' ' + continuation.join(' ')).replace(/\s+/g, ' ').trim();
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

  const metaText = lines.filter(l => metaLineRe.test(l)).join(' ') || raw;
  const timeMatch = metaText.match(/(\d+)\s*(min(?:uten)?|std\.?|stunden?)/i) || raw.match(/(\d+)\s*(min(?:uten)?|std\.?|stunden?)/i);
  if (timeMatch) r.timeMinutes = /std|stunden/i.test(timeMatch[2]) ? parseInt(timeMatch[1]) * 60 : parseInt(timeMatch[1]);
  const servMatch = metaText.match(/(\d+)\s*(portionen|personen|servings)/i) || raw.match(/(\d+)\s*(portionen|personen|servings)/i);
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
  r.tags = Array.from(new Set(tagWords.filter(t => !dietMap[t.toLowerCase()]))).slice(0, 6);
  r.notes = 'Aus eingefügtem Text importiert — bitte vor dem Speichern prüfen.';
  r._importSummary = {
    titleFound: !!titleLine,
    ingredientCount: r.ingredients.filter(i => i.name).length,
    stepCount: r.steps.filter(s => s.text).length,
    servingsFound: !!servMatch,
    timeFound: !!timeMatch,
    dietFound: r.diet.length > 0,
  };
  return r;
}
