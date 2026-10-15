/* ---------- PDF-Datenmodell: reine Anzeige-Aufbereitung (Zutaten, Hinweise, Quellen, Kategorie, Portionen, Naehrwerte) ----------
   Alles hier arbeitet nur zur Anzeigezeit auf einer Kopie der Sicht auf das Rezept. Nichts wird veraendert oder gespeichert,
   auch alte Rezepte (Zutatenwort in der Einheit, ganze Zeile im Namen) werden nur fuer die Darstellung gelesen.
   pdfBuildModel (pdf-templates.js) setzt die Ergebnisse zusammen; die Vorlagen verlassen sich auf folgende Felder:
     ingredients[]  {type:'ing', group, amount, name, note, raw, uncertain} | {type:'group', title, show, size}
     servings       {kind:'portions'|'pieces'|'total'|'unknown', value, label, conflict}
     facts[]        {label, value, short} aus pdfYieldTimeFacts (Ertrag und Zeiten mit denselben Helfern wie die App)
     category       Anzeigetext (Kochbuchkapitel des Nutzers, sonst erste gewaehlte Kategorie), categoryKind, categoryAll[]
     source, sourceText, sourceUrl, sourceUrlText, sourceOrigin (Herkunft aus der Rezeptbibliothek, Text oder '')
     nutritionBasis ('portion'|'piece'|'total'|null), nutritionBasisLabel, nutritionView[], nutritionNote
     warnings[]     kurze Pruefhinweise, nur fuer die App-Vorschau (nicht drucken)
   Wiederverwendet werden die vorhandenen Bausteine: quantity.js (parseQuantity, qtyDisplay, qtyParseLine, qtyIsUnitWord),
   units.js (normalizeUnit) und die Laufzeit-Normalisierung des Naehrwert-Pakets (nutCleanIngredientName). */

const PDF_NB = '\u00a0';

/* ---------- Kapitel (gleiche Datenquelle wie das Inhaltsverzeichnis) ---------- */

/* Name des vom Nutzer angelegten Kochbuch-Kapitels eines Rezepts, sonst ''. Das Inhaltsverzeichnis und die Seitenkopfzeile
   sollen dieselbe Quelle verwenden (cfg.chapters/cfg.items), nicht die automatisch erkannte Gerichtsart. */
function pdfChapterNameFor(cfg, recipeId) {
  if (!cfg || !Array.isArray(cfg.items) || !Array.isArray(cfg.chapters)) return '';
  const it = cfg.items.find((x) => x && x.recipeId === recipeId);
  if (!it || !it.chapterId) return '';
  const ch = cfg.chapters.find((c) => c && c.id === it.chapterId);
  return ch ? String(ch.name || '').trim() : '';
}

/* Kategorie fuer die Rezeptseite. Verschiedene Arten bleiben getrennt:
   'chapter'  Kapitel des Nutzers im Kochbuch (Vorrang, damit Seite und Inhaltsverzeichnis uebereinstimmen)
   'meal'     Mahlzeit (Fruehstueck, Dessert ...), 'dish' Gerichtsart (Pasta, Sauce / Dip ...), 'tag' freier Tag
   Die gespeicherten Kategorien werden nie ueberschrieben; categoryAll nennt alle zur Rezeptseite. */
function pdfCategoryInfo(recipe, chapter) {
  const label = (id) => (typeof categoryLabelFor === 'function' ? categoryLabelFor(id) : id);
  const kindOf = (id) => ((typeof MEAL_TYPE_OPTIONS !== 'undefined' && MEAL_TYPE_OPTIONS.some((o) => o.id === id)) ? 'meal'
    : (typeof DISH_TYPE_OPTIONS !== 'undefined' && DISH_TYPE_OPTIONS.some((o) => o.id === id)) ? 'dish' : 'tag');
  const all = [];
  const seen = new Set();
  const push = (id, kind) => { const t = String(label(id) || '').trim(); if (t && !seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); all.push({ text: t, kind }); } };
  (recipe.categoryTags || []).forEach((id) => push(id, kindOf(id)));
  (recipe.tags || []).forEach((id) => push(id, 'tag'));
  const ch = String(chapter || '').trim();
  if (ch) return { text: ch, kind: 'chapter', all: all.map((a) => a.text) };
  const first = all[0];
  return { text: first ? first.text : '', kind: first ? first.kind : '', all: all.map((a) => a.text) };
}

/* ---------- Zutaten ---------- */

const PDF_EXTRA_UNIT_WORDS = new Set(['schuss', 'spritzer', 'messerspitze', 'fingerspitze', 'stängel', 'stiel', 'stiele', 'kugel', 'kugeln', 'tafel', 'tafeln', 'tropfen', 'klecks',
  'schälchen', 'rippe', 'rippen', 'beutel', 'msp', 'stk', 'stk.', 'mg']);
const PDF_GERMAN_UNIT_NOUNS = new Set(['prise', 'prisen', 'bund', 'dose', 'dosen', 'packung', 'packungen', 'päckchen', 'päckli', 'tüte', 'tüten', 'stück', 'zehe', 'zehen', 'scheibe', 'scheiben',
  'tasse', 'tassen', 'becher', 'handvoll', 'zweig', 'zweige', 'kopf', 'stange', 'stangen', 'blatt', 'blätter', 'würfel', 'flasche', 'flaschen', 'glas', 'gläser', 'rispe', 'rispen', 'knolle', 'knollen',
  'schuss', 'spritzer', 'messerspitze', 'fingerspitze', 'stängel', 'kugel', 'kugeln', 'tafel', 'tafeln', 'tropfen', 'klecks', 'schälchen', 'beutel']);

function pdfIsMeasureUnit(u) { const k = String(u || '').toLowerCase().replace(/\.$/, ''); return k === 'mg' || (typeof normalizeUnit === 'function' && !!normalizeUnit(k) && !PDF_GERMAN_UNIT_NOUNS.has(k)); }
function pdfIsUnitWord(u) {
  const k = String(u || '').toLowerCase().replace(/\.$/, '');
  if (!k) return false;
  return PDF_EXTRA_UNIT_WORDS.has(k) || (typeof qtyIsUnitWord === 'function' && qtyIsUnitWord(k)) || (typeof normalizeNutritionUnit === 'function' && !!normalizeNutritionUnit(k));
}
// Kurze Einheit fuer die Anzeige: g kg ml cl dl l TL EL einheitlich, deutsche Mengenwoerter gross (Prise, Handvoll), sonst wie gespeichert
function pdfUnitLabel(u) {
  const t = String(u || '').trim();
  if (!t) return '';
  const k = t.toLowerCase().replace(/\.$/, '');
  const canon = typeof normalizeUnit === 'function' ? normalizeUnit(k) : null;
  if (canon && ['g', 'kg', 'ml', 'cl', 'dl', 'l', 'tsp', 'tbsp'].includes(canon) && typeof UNIT_LABELS !== 'undefined') return UNIT_LABELS[canon];
  if (t === k && PDF_GERMAN_UNIT_NOUNS.has(k)) return t.charAt(0).toUpperCase() + t.slice(1);
  return t;
}

// Zahl wie ½, 1 ¼, 2,25: Bruchzeichen nur bei exakten Werten, sonst Dezimalzahl (nie auf einen anderen Bruch runden)
const PDF_FRACS = [[0.125, '⅛'], [0.25, '¼'], [1 / 3, '⅓'], [0.375, '⅜'], [0.5, '½'], [0.625, '⅝'], [2 / 3, '⅔'], [0.75, '¾'], [0.875, '⅞']];
function pdfFormatNumber(v) {
  if (v === null || v === undefined || isNaN(v)) return '';
  const r = Math.round(v * 1000) / 1000;
  const whole = Math.floor(r + 1e-9);
  const rem = r - whole;
  if (rem < 0.0005) return String(whole);
  const f = PDF_FRACS.find((x) => Math.abs(rem - x[0]) < 0.0006);
  if (f) return (whole > 0 ? whole + PDF_NB : '') + f[1];
  return String(r).replace('.', ',');
}

/* Zutatengruppen wie getIngredientGroups, behaelt aber auch Zeilen, bei denen der Name leer ist und nur Menge/Einheit stehen
   (sonst fiele so eine Zeile im PDF stillschweigend weg). */
function pdfIngredientGroups(recipe) {
  const groups = [];
  let current = null;
  const ensure = (title) => {
    if (!current || current.title !== title) { current = { id: 'g' + groups.length, title, ingredients: [] }; groups.push(current); }
    return current;
  };
  (recipe.ingredients || []).forEach((i, idx) => {
    if (!i) return;
    if (isIngredientHeaderRow(i)) { current = null; ensure(headerTitle(i)); return; }
    const hasName = !!String(i.name || '').trim();
    const hasOther = String(i.amount == null ? '' : i.amount).trim() || String(i.unit || '').trim();
    if (!hasName && !hasOther) return;
    const title = (i.group && String(i.group).trim()) || (current ? current.title : 'Zutaten');
    ensure(title).ingredients.push(Object.assign({}, i, { _index: idx }));
  });
  return groups.filter((g) => g.ingredients.length);
}

/* Zerlegt eine gespeicherte Zutat fuer die Anzeige. Konservativ: was nicht sicher lesbar ist, bleibt im Originaltext (raw) und wird als
   uncertain markiert. Es werden keine Angaben erfunden und keine Mengen umgerechnet (ausser kg unter 1 als g, wie in der Rezeptansicht). */
function pdfSplitIngredient(ing) {
  let amountRaw = String(ing.amount == null ? '' : ing.amount).replace(/\s+/g, ' ').trim();
  let unit = String(ing.unit || '').trim();
  let nameRaw = String(ing.name || '').replace(/\s+/g, ' ').trim();
  const raw = [amountRaw, unit, nameRaw].filter(Boolean).join(' ');
  let uncertain = false;
  const notes = [];

  // Alte Rezepte: die ganze Zeile steht im Namen ("½ TL Backpulver"). Nur lesen, wenn die Zerlegung eindeutig ist.
  if (!amountRaw && !unit && /^[\d½¼¾⅓⅔⅕⅖⅗⅘⅛⅜⅝⅞]/.test(nameRaw) && typeof qtyParseLine === 'function') {
    const p = qtyParseLine(nameRaw);
    const n = p && parseFloat(String(p.amount).replace(',', '.'));
    if (p && (p.kind === 'exact' || p.kind === 'range') && p.name && !(p.flags && p.flags.length) && (p.unit || (isFinite(n) && n <= 99))) {
      amountRaw = p.amount; unit = p.unit || ''; nameRaw = p.name;
    }
  }

  const c = typeof nutCleanIngredientName === 'function' ? nutCleanIngredientName(nameRaw) : { name: nameRaw, bracketText: '' };
  let name = c.name;
  // Klammer mitten im Namen («Ei (gross), verquirlt»): Wortlaut und Reihenfolge erhalten, nur eine Klammer am Ende wird zur Notiz
  if (c.bracketText && /^[^(]*[^\s(][^(]*\([^)]*\)\s*[,;]?\s*[^\s,;)][^)]*$/.test(nameRaw)) name = nameRaw;
  else if (c.bracketText) notes.push(c.bracketText);

  // Altbestand: das Zutatenwort steht in der Einheit (Zwiebel, Knoblauchzehe, Ei, Handvoll), im Namen nur noch die Klammer
  if (!name && unit && !pdfIsMeasureUnit(unit)) { name = unit; unit = ''; }
  // Unbekanntes Wort in der Einheit, obwohl ein Name vorhanden ist: nicht raten, Wort vor den Namen setzen, Originaltext zeigen
  if (unit && !pdfIsUnitWord(unit)) { name = unit + ' ' + name; unit = ''; uncertain = true; }

  let amount = '';
  let q = null;
  let prefix = '';
  if (amountRaw) {
    let ar = amountRaw;
    const pm = /^(?:ca\.\s*|(?:ca|circa|etwa|ungefähr|rund)\s+|~\s*)(?=\S)/i.exec(ar);
    if (pm) { prefix = 'ca.' + PDF_NB; ar = ar.slice(pm[0].length); }
    q = typeof parseQuantity === 'function' ? parseQuantity(ar, unit) : { kind: 'invalid', text: ar };
    if (q.unitHint && !unit && pdfIsUnitWord(q.unitHint)) unit = q.unitHint;   // "250g" im Mengenfeld: Einheit nicht verlieren
    else if (q.unitHint && !unit) uncertain = true;
    if (qtyIsNumeric(q)) {
      const d = qtyDisplay(q, unit, { fmt: pdfFormatNumber });
      amount = d.text; unit = d.unit;
    } else if (q.kind === 'qualitative') {
      notes.push(q.text); amount = '';
    } else {
      // mehrdeutig ("1.000") oder frei ("eine Hand voll"): Wortlaut unveraendert, Zerlegung unsicher
      amount = q.text || ar; uncertain = true;
    }
  }
  const unitLabel = pdfUnitLabel(unit);
  let line = '';
  const numeric = !!q && qtyIsNumeric(q);   // nur Zahlen zusammenhalten; freier Text darf in der schmalen Spalte umbrechen
  if (amount) line = prefix + (numeric ? amount.replace(/ /g, PDF_NB) : amount) + (unitLabel ? PDF_NB + unitLabel : '');
  else if (unitLabel && !pdfIsMeasureUnit(unit)) line = unitLabel;       // "Prise Salz": Mengenwort ohne Zahl
  else if (unitLabel) { line = ''; uncertain = true; }                  // "g Mehl": Zahl fehlt, Originaltext zeigen

  name = name.replace(/\s+/g, ' ').trim();
  if (!name) { name = nameRaw; uncertain = true; notes.length = 0; }
  const note = notes.map((n) => String(n).trim()).filter(Boolean).filter((n, i, a) => a.indexOf(n) === i).join('; ');
  return { amount: line, name, note, raw, uncertain };
}

/* ---------- Schritte, Hinweise, Quellen ---------- */

const PDF_GENERIC_HEADING = /^(tipps?|hinweise?|tipps?\s*(&|und|\/)\s*hinweise?|k(ü|ue)chentipps?|notizen?|bemerkungen?|anmerkungen?|aufbewahrung|zusatzinfos?|quellen?|rezeptquelle)$/i;

/* Hinweise/Quellen, die als Schritt gespeichert wurden, gehoeren nicht in die nummerierte Anleitung.
   Eindeutige Anfaenge ("Tipp", "Hinweis") gelten auch ohne Doppelpunkt; mehrdeutige Woerter (Variante, Einfrieren, Haltbarkeit ...)
   nur mit Doppelpunkt oder Strich, damit ein echter Arbeitsschritt wie "Einfrieren Sie ..." nicht verschoben wird. */
function pdfClassifyStepText(text) {
  const t = String(text || '').trim();
  if (/^(quelle|source|rezept (von|nach)|fotos?)\s*[:\-–]/i.test(t) || (/^quelle\b/i.test(t) && t.length < 140)) return 'source';
  if (/^(tipp|tipps|küchentipp|küchentipps|hinweis|hinweise)\b/i.test(t)) return 'tip';
  if (/^(aufbewahrung|aufbewahren|haltbarkeit|haltbar|einfrieren|vorbereiten\s*\/\s*einfrieren|vorbereiten und einfrieren|variante|varianten)(\s+\d+)?\s*[:\-–]/i.test(t)) return 'tip';
  return 'step';
}

// Hinweistext ohne reine Beschriftung ("Tipp:" allein hat keinen Inhalt)
function pdfTipHasContent(t) {
  return String(t || '').replace(/^(tipps?|küchentipps?|hinweise?|aufbewahrung|aufbewahren|haltbarkeit|haltbar|einfrieren|vorbereiten\s*\/\s*einfrieren|vorbereiten und einfrieren|varianten?)(\s+\d+)?\s*[:\-–]?/i, '').replace(/[\s:;.\-–]+/g, '').length > 0;
}

/* Aufteilung der Schritte in Zwischentitel, nummerierte Schritte, Hinweise und Quellen. Es geht nichts verloren:
   - Eine Ueberschrift wird nur gezeichnet, wenn danach ein echter Schritt folgt. Bleibt nach ihr nur ein Hinweis uebrig,
     entfaellt eine allgemeine Ueberschrift ("Tipps & Hinweise"), eine besondere wird dem Hinweis vorangestellt.
   - Hinweise ohne Inhalt (nur "Tipp:") erzeugen keinen Block. */
function pdfSplitSteps(recipe) {
  const entries = stepEntries(recipe).map((e) => Object.assign({}, e, { text: String(e.text).trim() }));
  entries.forEach((e) => { e.kind = e.heading ? 'heading' : pdfClassifyStepText(e.text); });
  // Feinschliff V2: steht die gespeicherte Quelle woertlich am Ende des letzten Schritts, nur in der Exportdarstellung entfernen
  const lastStep = entries.filter((e) => e.kind === 'step').pop();
  if (lastStep) {
    const cut = pdfStripSourceTail(lastStep.text, pdfSourceStrings(recipe));
    if (cut.removed) { if (cut.text) lastStep.text = cut.text; else lastStep.kind = 'source'; }
  }
  const steps = []; const tips = []; const sources = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.kind === 'heading') {
      let j = i;
      const run = [];
      while (j < entries.length && entries[j].kind === 'heading') { run.push(entries[j]); j++; }
      const next = entries[j];
      if (next && next.kind === 'step') {
        run.forEach((h) => steps.push({ type: 'heading', text: h.text.replace(/:$/, '').trim() }));
      } else {
        // Ueberschrift ohne folgenden Arbeitsschritt: nicht allein stehen lassen
        const last = run[run.length - 1];
        run.forEach((h) => {
          const title = h.text.replace(/:$/, '').trim();
          if (PDF_GENERIC_HEADING.test(title)) return;
          if (h === last && next && next.kind === 'tip' && pdfTipHasContent(next.text) && !next.text.toLowerCase().startsWith(title.toLowerCase())) { next.text = title + ': ' + next.text; return; }
          tips.push(title);
        });
      }
      i = j - 1;
      continue;
    }
    if (e.kind === 'source') sources.push(e.text);
    else if (e.kind === 'tip') { if (pdfTipHasContent(e.text)) tips.push(e.text); }
    else steps.push({ type: 'step', text: e.text });
  }
  let n = 0; steps.forEach((s) => { if (s.type === 'step') s.no = ++n; });
  return { steps, tips, sources };
}

/* Gespeicherte Quelle (Feld source) als exakte Vergleichstexte */
function pdfSourceStrings(recipe) {
  const rs = recipe && recipe.source;
  if (!rs) return [];
  if (typeof rs === 'string') return [rs.trim()].filter(Boolean);
  return [String(rs.title || rs.name || '').trim(), String(rs.url || '').trim()].filter(Boolean);
}
/* Exakter Abgleich mit dem source-Feld (keine allgemeine Regel fuer Saetze mit «Quelle»): Endet der Text woertlich mit der
   gespeicherten Quelle und steht sie klar abgesetzt (Beschriftung «Quelle:» davor oder Satzende davor), wird nur dieser
   Schluss in der Darstellung weggelassen. Die Originaldaten bleiben unveraendert. */
const PDF_SOURCE_LABEL_RE = /\b(quelle|source|rezept (von|nach))\s*[:\-–]?\s*$/i;
function pdfStripSourceTail(text, srcs) {
  const t = String(text || '').trim();
  for (const src of srcs || []) {
    if (src.length < 4) continue;
    let body = t;
    if (!body.endsWith(src) && /[.]$/.test(body) && !/[.]$/.test(src)) body = body.slice(0, -1).trimEnd();
    if (!body.endsWith(src)) continue;
    let rest = body.slice(0, body.length - src.length);
    const labelled = PDF_SOURCE_LABEL_RE.test(rest);
    rest = rest.replace(PDF_SOURCE_LABEL_RE, '').replace(/[\s·|–-]+$/, '').trim();
    if (!rest) return { text: '', removed: true };
    if (labelled || /[.!?]$/.test(rest)) return { text: rest, removed: true };
  }
  return { text: t, removed: false };
}

const PDF_URL_RE = /\bhttps?:\/\/[^\s<>"']+|\bwww\.[^\s<>"']+|\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*\.(?:ch|com|de|org|net|at|io|co|eu|info)\b(?:\/[^\s<>"']*)?/i;
function pdfFindUrl(text) {
  const m = PDF_URL_RE.exec(String(text || ''));
  if (!m) return null;
  const shown = m[0].replace(/[.,;:!?)\]]+$/, '');
  if (!shown || /^\d+(\.\d+)*$/.test(shown)) return null;
  return { text: shown, href: /^https?:\/\//i.test(shown) ? shown : 'https://' + shown };
}

/* Herkunft eines gespeicherten Bibliotheksrezepts als kurzer Text fuer die Quellzeile ('' ohne gueltige Herkunft).
   Name wird hart gekuerzt (Vertrag: hoechstens 40 Zeichen), damit die Zeile nie ausufert. */
function pdfLibraryOriginText(recipe, hasSource) {
  if (!recipe || !recipe.publicOrigin || typeof valPublicOrigin !== 'function') return '';
  const po = valPublicOrigin(recipe.publicOrigin, 'store').origin;
  if (!po) return '';
  const name = String(po.authorName || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (hasSource) return name ? 'Bibliothek:' + PDF_NB + name : 'Savora-Rezeptbibliothek';
  return name ? 'Aus der Savora-Rezeptbibliothek, von ' + name : 'Aus der Savora-Rezeptbibliothek';
}

/* Quelle: Text unveraendert (nichts wird aus Saetzen entfernt), URL zusaetzlich getrennt erkannt.
   sourceText entfernt nur die Beschriftung "Quelle:" am Anfang eines Teils, weil die Vorlage sie selbst setzt. */
function pdfSourceInfo(recipe, sourceSteps) {
  const rs = recipe.source;
  const parts = [];
  let url = null;
  if (rs) {
    if (typeof rs === 'string') parts.push(rs.trim());
    else {
      const title = String(rs.title || rs.name || '').trim();
      const link = String(rs.url || '').trim();
      if (title) parts.push(title);
      else if (link) parts.push(link);
      if (link) url = pdfFindUrl(link) || { text: link, href: link };
    }
  }
  // Als Schritt gespeicherte Quelle, die woertlich der gespeicherten Quelle entspricht, nur einmal ausgeben
  const known = pdfSourceStrings(recipe);
  (sourceSteps || []).forEach((s) => {
    const t = String(s).trim(), bare = t.replace(/^\s*(quelle|source|rezept (von|nach))\s*[:\-–]?\s*/i, '').replace(/[.]$/, '').trim();
    if (known.some((k) => k === t || k === bare)) return;
    parts.push(t);
  });
  const clean = parts.filter(Boolean);
  const source = clean.join(' · ');
  const sourceText = clean.map((p) => p.replace(/^\s*quelle\s*[:\-–]\s*/i, '')).filter(Boolean).join(' · ');
  if (!url) for (const p of clean) { const u = pdfFindUrl(p); if (u) { url = u; break; } }
  // Herkunft aus der Rezeptbibliothek: eigenes Feld, die Vorlage haengt es an dieselbe Quellzeile an (kein eigener Block,
  // keine lange Adresse). Ohne eigene Quelle «Aus der Savora-Rezeptbibliothek, von Name», mit Quelle « · Bibliothek: Name».
  const sourceOrigin = pdfLibraryOriginText(recipe, !!(source || url));
  return { source, sourceText, sourceUrl: url ? url.href : '', sourceUrlText: url ? url.text : '', sourceOrigin };
}

/* ---------- Portionen und Stueck ---------- */

const PDF_PIECE_RE = /\b(ca\.?|circa|etwa|ungefähr|rund|ergibt|ergeben|insgesamt)\s+(\d{1,3})\s*(kugeln|stück|stk\.?|brötchen|cookies|guetzli|plätzchen|kekse|muffins|törtchen|portionen|riegel|taler)(?![a-zäöüß])/gi;

/* Ausbeute wie gespeichert (servings + servingMode + yieldLabel). Eine Stueckzahl im Text wird nie uebernommen, nur als Widerspruch gemeldet. */
function pdfServingsInfo(recipe, texts) {
  const n = Number(recipe.servings) || 0;
  let kind = 'unknown', label = '';
  if (n > 0) {
    const mode = servingMode(recipe);
    kind = mode;
    label = typeof servingLabel === 'function' ? servingLabel(recipe, n) : n + ' ' + (n === 1 ? 'Portion' : 'Portionen');
  }
  let conflict = '';
  if (n > 0) {
    for (const t of texts || []) {
      PDF_PIECE_RE.lastIndex = 0;
      let m;
      while ((m = PDF_PIECE_RE.exec(String(t || '')))) {
        const found = parseInt(m[2], 10);
        if (found < 2 || found === n) continue;
        conflict = `Angegeben sind ${label}, die Anleitung nennt ${m[1]} ${m[2]} ${m[3]}. Bitte prüfen.`;
        break;
      }
      if (conflict) break;
    }
  }
  return { kind, value: n > 0 ? n : null, label, conflict };
}

/* Ertrag und Zeiten fuer den Rezeptkopf (v0.83): gleiche Begriffe wie in der App (yieldText, timeInfo).
   «Für 4 Portionen» | «Ergibt 1 Glas» · «30 Min. Gesamtzeit» · «15 Min. Vorbereitung» · «20 Min. Garen» · «1 Std. Ruhen».
   Nichts wird summiert; unbekannter Ertrag erscheint nicht (keine erfundene Portionszahl). */
function pdfYieldTimeFacts(recipe) {
  const facts = [];
  const add = (label, value, short) => facts.push({ label, value, short });
  const info = yieldInfo(recipe);
  if (info.kind !== 'unknown') {
    const text = yieldText(recipe);
    if (info.kind === 'portions') add(info.label, String(info.count), text);
    else add('Ergibt', text.replace(/^Ergibt\s+/, ''), text);
  }
  const t = timeInfo(recipe);
  [['total', 'Gesamtzeit'], ['prep', 'Vorbereitung'], ['cook', 'Garen'], ['rest', 'Ruhen']].forEach(([k, label]) => {
    if (t[k]) add(label, fmtMinutes(t[k]), fmtMinutes(t[k]) + ' ' + label);
  });
  return facts;
}

/* ---------- Naehrwerte ---------- */

// Rundung fuer die Anzeige: kcal/kJ ganzzahlig, g mit hoechstens einer Nachkommastelle, mg und µg ab 100 ganzzahlig, sonst eine Stelle. null bleibt null.
function pdfRoundNutrient(unit, v) {
  if (v === null || v === undefined || typeof v !== 'number' || isNaN(v)) return null;
  if (unit === 'kcal' || unit === 'kJ') return Math.round(v);
  if (unit === 'g') return Math.round(v * 10) / 10;
  if (unit === 'mg' || unit === 'µg') return v >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
  return Math.round(v * 10) / 10;
}
function pdfNutText(v) { return v === null ? null : String(v).replace('.', ','); }

function pdfNutritionView(result) {
  if (!result || typeof NUTRIENT_KEYS === 'undefined') return [];
  const total = !!(result.needsServings || result.wholeRecipe);
  const exact = total ? result.nutrientsTotal : result.nutrientsPerPortion;
  const range = total ? result.nutrientsTotalRange : result.nutrientsPerPortionRange;
  return Object.keys(NUTRIENT_KEYS).map((key) => {
    const def = NUTRIENT_KEYS[key];
    let value = pdfRoundNutrient(def.unit, exact ? exact[key] : null);
    let text = pdfNutText(value);
    if (value === null && result.rangeUsed && range && range[key] && range[key].min !== range[key].max) {
      const lo = pdfRoundNutrient(def.unit, range[key].min), hi = pdfRoundNutrient(def.unit, range[key].max);
      if (lo !== null && hi !== null) text = pdfNutText(lo) + '–' + pdfNutText(hi);
    }
    return { key, label: def.label, unit: def.unit, group: def.group, value, text };
  });
}

function pdfNutritionBasis(result, pieces) {
  if (!result) return { basis: null, label: '' };
  if (result.needsServings || result.wholeRecipe) return { basis: 'total', label: 'für das gesamte Rezept' };
  return pieces ? { basis: 'piece', label: 'pro Stück' } : { basis: 'portion', label: 'pro Portion' };
}

function pdfNutritionNote(result, servings) {
  if (!result) return '';
  const parts = ['Geschätzte Werte, Abweichungen sind möglich.'];
  if (result.rangeUsed) parts.push('Menge als Bereich angegeben, Ergebnis als Spanne.');
  if (result.needsServings) parts.push('Es fehlt die Angabe, was das Rezept ergibt. Deshalb gelten die Nährwerte für das ganze Rezept. Trage ein, was das Rezept ergibt, um Werte pro Portion zu sehen.');   // gleicher Satz wie in der App (nutrition-ui.js)
  else if (result.wholeRecipe && servings && servings.kind === 'total') parts.push('Werte für das gesamte Rezept (' + servings.label + '), eine Portion ist nicht festgelegt.');
  if (servings && servings.conflict && servings.kind !== 'total' && !result.wholeRecipe) parts.push(servings.kind === 'pieces' ? 'Die Werte gelten pro Stück laut Angabe.' : 'Die Werte gelten pro Portion, nicht pro Stück.');
  return parts.join(' ');
}

/* Kurze, verstaendliche Pruefhinweise fuer die App-Vorschau (nicht fuer den Druck) */
function pdfModelWarnings(m) {
  const w = [];
  if (m.servings && m.servings.conflict) w.push(m.servings.conflict);
  const unsure = m.ingredients.filter((i) => i.type === 'ing' && i.uncertain).length;
  if (unsure) w.push(unsure === 1 ? 'Eine Zutat lässt sich nicht sicher in Menge und Namen trennen und erscheint im Originaltext.' : `${unsure} Zutaten lassen sich nicht sicher in Menge und Namen trennen und erscheinen im Originaltext.`);
  if (m.servings && m.servings.kind === 'unknown' && m.ingredients.some((i) => i.type === 'ing')) w.push('Es fehlt die Angabe, wie viel das Rezept ergibt.');
  return w;
}
