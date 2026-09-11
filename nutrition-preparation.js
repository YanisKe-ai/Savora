/* ---------- Nutrition: Zubereitungserkennung (Implementierungsauftrag Punkt 15, 20-21) ----------
   Ziel: aus den Zubereitungsschritten ableiten, ob eine Zutat vermutlich roh oder in welcher
   Zubereitungsform (gekocht/gebraten/gedämpft/gebacken) verwendet wird, und das Matching darauf
   ausrichten — die Schweizer Datenbank fuehrt rohe und zubereitete Varianten als eigene,
   tatsaechlich gemessene Eintraege (z.B. "Reis poliert, trocken" vs. "..., gekocht in
   Salzwasser"). Das ist genauer als ein nachtraeglich aufmultiplizierter Retentionsfaktor und
   erspart Savora, selbst Kochverlust-Faktoren erfinden zu muessen (Punkt 20 verbietet das
   ausdruecklich ohne verlaessliche Datengrundlage — die hier verwendete Excel-Quelle liefert
   keine separate Retentionsfaktor-Tabelle, siehe convert_swiss_fcd.py).

   WICHTIG (Punkt 21): "Bei Unsicherheit: NICHT automatisch veraendern." Die erkannte Zubereitung
   fliesst deshalb nur als zusaetzliches Suchwort ins Matching ein (macht den Treffer praeziser,
   ersetzt ihn aber nicht blind) und wird dem Nutzer im Matching-Screen als Hinweis angezeigt
   (nicht versteckt) — die normale Bestaetigen/Aendern-Moeglichkeit aus Phase 3 bleibt unveraendert
   der eigentliche Kontrollmechanismus. */

const PREPARATION_METHOD_LABELS = {
  gekocht: 'Gekocht', gebraten: 'Gebraten', gedämpft: 'Gedämpft', gebacken: 'Gebacken', gegrillt: 'Gegrillt', roh: 'Roh',
};

// Reihenfolge relevant: spezifischere/haeufigere Verbformen zuerst, damit z.B. "gedaempft"
// nicht ueber ein zu allgemeines Muster verpasst wird.
const PREPARATION_METHOD_PATTERNS = [
  { method: 'gekocht', pattern: /\b(koch\w*|sied\w*|garzieh\w*)\b/i },
  { method: 'gebraten', pattern: /\b(brat\w*|anbrat\w*)\b/i },
  { method: 'gedämpft', pattern: /\b(dämpf\w*|dampfgar\w*)\b/i },
  { method: 'gebacken', pattern: /\b(back\w*|im ofen)\b/i },
  { method: 'gegrillt', pattern: /\b(grill\w*)\b/i },
];

/* Zerlegt den Zubereitungstext in Saetze/Teilsaetze, damit ein Kochverb nur der Zutat zugeordnet
   wird, die tatsaechlich im selben Satzabschnitt genannt ist ("Kartoffeln kochen. Danach Ei
   braten." darf "Ei" nicht als "gekocht" erkennen). */
function splitIntoClauses(text) {
  return (text || '').split(/(?<=[.!?])\s+|,\s*(?=und|dann|danach)/i).filter(Boolean);
}

/* Prueft, ob der (normalisierte) Zutatenname im Klausel-Text vorkommt — Wortstamm-Vergleich
   analog zum allgemeinen Matching, damit "Kartoffel" auch in "Kartoffeln" gefunden wird. */
function clauseContainsIngredient(clause, ingredientName) {
  const clauseNorm = normalizeIngredientText(clause);
  const nameTokens = tokenizeText(normalizeIngredientText(ingredientName)).map(stemDe);
  if (!nameTokens.length) return false;
  const clauseTokens = tokenizeText(clauseNorm).map(stemDe);
  return nameTokens.some((t) => clauseTokens.includes(t));
}

/* Liefert die vermutete Zubereitungsart einer Zutat, oder null, wenn sich aus dem Text nichts
   Eindeutiges ableiten laesst (dann bleibt es beim normalen Matching ohne Zusatzwort). */
function detectIngredientPreparation(ingredientName, steps) {
  const name = (ingredientName || '').trim();
  if (!name) return null;
  const fullText = (steps || []).map((s) => (s && s.text) || '').join(' ');
  const clauses = splitIntoClauses(fullText);
  const relevantClauses = clauses.filter((c) => clauseContainsIngredient(c, name));
  if (!relevantClauses.length) return null;

  for (const { method, pattern } of PREPARATION_METHOD_PATTERNS) {
    const hit = relevantClauses.find((c) => pattern.test(c));
    if (hit) return { method, label: PREPARATION_METHOD_LABELS[method], evidence: hit.trim() };
  }
  return null;
}
