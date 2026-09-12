/* ---------- Ingredient Intelligence (Master-Prompt Teil B/C, Punkt 6-48) ----------
   Zerlegt eine Zutatenzeile regelbasiert (keine grosse String.replace()-Kette, sondern eine
   Pipeline aus klar getrennten Datentabellen, Punkt 85-86):

     Originaltext
       -> Klammern/Beispiele/Optional-Marker extrahieren
       -> Nutzungsphrasen ("zum Braten") entfernen
       -> bekannte zusammengesetzte Lebensmittel schuetzen (Bratbutter, Buttermilch, ...)
       -> ernaehrungsrelevante Zustaende erkennen (roh/gekocht/TK/Konserve/getrocknet/...)
       -> matching-neutrale Deskriptoren entfernen (Zubereitung, Schnitt, Groesse/Qualitaet)
       -> Schweizer/deutsche Synonyme anwenden
       -> canonicalIngredient

   WICHTIG (Punkt 45): der sichtbare Originaltext (originalText) wird NIE veraendert — nur
   fuer das interne Nutrition-Matching wird aus ihm eine bereinigte Suchanfrage abgeleitet. */

/* ---------- 8C: geschuetzte zusammengesetzte Lebensmittel ----------
   Diese Woerter/Phrasen duerfen NIEMALS in "Basiswort + Deskriptor" zerlegt werden — sonst
   wuerde z.B. "Bratbutter" faelschlich zu "Butter" oder "Erdnussbutter" zu "Butter" degradiert
   (Punkt 8C, Punkt 73 "NICHT auf Butter matchen"). Laengere Phrasen zuerst geprueft. */
const PROTECTED_INGREDIENT_PHRASES = [
  // Butter-Familie (Punkt 73)
  'bratbutter', 'erdnussbutter', 'buttermilch', 'butterschmalz', 'kraeuterbutter', 'kräuterbutter',
  // Tomaten-Produkte (Punkt 16, 74) — eigenstaendige Lebensmittel, keine "Tomate + Deskriptor"
  'tomatenpueree', 'tomatenpüree', 'tomatenmark', 'passata', 'passierte tomaten', 'tomatensaft',
  'getrocknete tomaten', 'getrocknete tomaten in oel', 'getrocknete tomaten in öl',
  // Milch-/Rahmprodukte (Punkt 33) — jedes ein eigenes Lebensmittel
  'buttermilch', 'vollmilch', 'magermilch', 'halbfettmilch', 'hafermilch', 'kokosmilch', 'sojamilch',
  'mandelmilch', 'vollrahm', 'halbrahm', 'saurer halbrahm', 'doppelrahm', 'creme fraiche', 'crème fraîche',
  'frischkaese', 'frischkäse', 'doppelrahmfrischkaese', 'doppelrahmfrischkäse', 'huettenkaese', 'hüttenkäse',
  'mascarpone', 'ricotta', 'magerquark', 'skyr', 'griechischer joghurt', 'sojajoghurt', 'joghurt nature',
  'vegane butter', 'pflanzlicher rahm', 'pflanzliche sahne',
  // Eier-Bestandteile (Punkt 13) — NIE mit "Ei" zusammenfuehren
  'eigelb', 'eigelbe', 'eiweiss', 'eiweisse', 'huehnereigelb', 'hühnereigelb', 'huehnereiweiss', 'hühnereiweiss',
  // Verarbeitetes Fleisch (Punkt 25) — nicht zu "Fleisch"/"Schwein" vergroebern
  'rohschinken', 'kochschinken', 'schinken', 'speck', 'speckwuerfeli', 'speckwürfeli', 'salami', 'salsiz',
  'mortadella', 'prosciutto', 'buendnerfleisch', 'bündnerfleisch',
  // Fisch (Punkt 26)
  'rauchlachs', 'raeucherlachs', 'räucherlachs',
  // Zucker-Sorten (Punkt 32) — nicht pauschal "Zucker"
  'rohzucker', 'brauner zucker', 'puderzucker', 'kandiszucker', 'vanillezucker',
  // Mehl-Sorten (Punkt 31)
  'weissmehl', 'weizenmehl', 'dinkelmehl', 'helles dinkelmehl', 'vollkornmehl', 'roggenmehl', 'maismehl',
  'kichererbsenmehl',
  // Zitrusfrucht-Produkte (Punkt 22) — nie mit der Frucht selbst zusammenfuehren
  'zitronensaft', 'zitronenschale', 'abgeriebene zitronenschale', 'limettensaft', 'limettenschale',
  // Oele (Punkt 34) — eigene Sorte, nicht generisch "Oel"
  'olivenoel', 'olivenöl', 'rapsoel', 'rapsöl', 'sonnenblumenoel', 'sonnenblumenöl', 'sesamoel', 'sesamöl',
  'kokosoel', 'kokosöl',
  // Schweizer Spezialbegriffe (Punkt 43)
  'weggli', 'maizena',
];

/* ---------- Ernaehrungsrelevante Zustaende (Punkt 8B, 78) ----------
   Duerfen NIE stillschweigend entfernt werden — sie fliessen als Zusatzwort in die
   Matching-Suche ein (gleiches Prinzip wie die Zubereitungserkennung aus den Schritten,
   siehe nutrition-preparation.js), damit z.B. "Reis, gekocht" nicht auf den rohen
   Naehrwert-Datensatz matcht. */
const NUTRITION_RELEVANT_STATE_PHRASES = [
  'aus der dose', 'in der dose', 'aus der büchse',
  'getrocknete tomaten in oel', 'getrocknete tomaten in öl', // bereits oben geschuetzt, hier nur fuer Vollstaendigkeit der Erkennung falls nicht geschuetzt greift
  'in oel', 'in öl', 'im wasser gekocht', 'ohne salz',
  'tiefgekuehlt', 'tiefgekühlt', 'gefroren', 'gefrorene', 'gefrorener',
  'aufgetaut', 'angetaut',
  'geraeuchert', 'geräuchert',
  'getrocknet', 'getrocknete', 'getrockneter',
  'blanchiert',
  'roh', 'gekocht', 'trocken', 'trockene', 'trockener',
  'gebraten', 'geroestet', 'geröstet', 'angeroestet', 'angeröstet',
  'gedaempft', 'gedämpft',
  'abgetropft', 'abgegossen', 'abgespuelt', 'abgespült', 'kalt abgespuelt', 'kalt abgespült', 'gut abgetropft',
  'dose', 'konserve', 'tk',
  'vorgekocht',
];

/* ---------- Matching-neutrale Deskriptoren (Punkt 8A, 36-38, 77) ----------
   Duerfen einen guten Match nicht verhindern — werden fuer die Suche entfernt, das Basis-
   Lebensmittel bleibt gleich. Mehrwort-Phrasen sind bewusst einzeln aufgefuehrt (kein Regex-
   Zusammenbau), damit neue Begriffe einfach ergaenzt werden koennen (Punkt 87). */
const NEUTRAL_DESCRIPTOR_PHRASES = [
  // Temperatur/Konsistenz (Punkt 11)
  'weich', 'zimmerwarm', 'bei zimmertemperatur', 'streichfaehig', 'streichfähig', 'weich geruehrt', 'weich gerührt',
  'kalt', 'gekuehlt', 'gekühlt', 'fluessig', 'flüssig', 'geschmolzen', 'zerlassen',
  // Ei-Zubereitung (Punkt 12) — nur wenn NICHT Eigelb/Eiweiss (die sind protected)
  'verklopft', 'verquirlt', 'geschlagen', 'leicht geschlagen', 'steif geschlagen',
  // Schnitt-/Formbegriffe (Punkt 36)
  'fein gehackt', 'grob gehackt', 'gehackt', 'fein geschnitten', 'grob geschnitten', 'geschnitten',
  'klein gewuerfelt', 'klein gewürfelt', 'grob gewuerfelt', 'grob gewürfelt', 'gewuerfelt', 'gewürfelt',
  'in wuerfeln', 'in würfeln', 'in wuerfeli', 'in würfeli', 'wuerfel', 'würfel',
  'in stuecke', 'in stücke', 'in stuecken', 'in stücken',
  'in scheiben', 'in scheibchen', 'geschichtet',
  'in ringe', 'in ringen', 'ringe',
  'in streifen', 'in feinen streifen', 'streifen',
  'in schnitze', 'in schnitzen',
  'geviertelt', 'halbiert', 'laengs halbiert', 'längs halbiert',
  'fein gerieben', 'grob gerieben', 'gerieben', 'fein geraffelt', 'grob geraffelt', 'geraffelt',
  'zerzupft', 'zerkleinert', 'zerdrueckt', 'zerdrückt', 'puriert', 'püriert', 'gepresst', 'ausgedrueckt', 'ausgedrückt',
  // Vorbereitung, matching-neutral (Punkt 37)
  'geschaelt', 'geschält', 'ungeschaelt', 'ungeschält', 'entkernt', 'entsteint', 'kerngehaeuse entfernt',
  'kerngehäuse entfernt', 'geputzt', 'gewaschen', 'entstielt',
  // Kraeuter-Deskriptoren (Punkt 21)
  'blaetter', 'blätter', 'blaettchen', 'blättchen', 'nadeln', 'roellchen', 'röllchen',
  'glattblaettrig', 'glattblättrig', 'kraus', 'krause',
  // Nuss-Deskriptoren (Punkt 23) — gemahlen/gehackt bleiben neutral, geroestet ist nutrition-relevant (oben)
  'gemahlen', 'gemahlene',
  // Kaese-Praesentation (Punkt 20)
  'spaene', 'späne',
  // Qualitaets-/Groessenwoerter (Punkt 38) — Farbe wird NICHT hier gefuehrt (Sorte-relevant)
  'klein', 'kleine', 'gross', 'grosse', 'mittelgross', 'reif', 'sehr reif', 'frisch', 'bio',
];

/* ---------- "zum ..."-Nutzungsphrasen (Punkt 35) — kein Teil des Lebensmittelnamens ---------- */
const USAGE_PHRASE_PATTERN = /\bzum\s+(braten|anbraten|backen|bestreichen|einfetten|garnieren|servieren|bestaeuben|bestäuben|betraeufeln|beträufeln)\b/gi;

/* ---------- Marker fuer Beispiele/Marken (Punkt 39) ---------- */
const EXAMPLE_MARKER_PATTERN = /\b(z\.?\s?b\.?|zum beispiel)\b/i;

/* ---------- Optional-Marker (Punkt 42) ---------- */
const OPTIONAL_MARKER_PATTERNS = [/\boptional\b/i, /\bnach belieben\b/i, /\bwer mag\b/i, /\bbei bedarf\b/i];

/* ---------- Vage Mengenangaben (Punkt 41) — ergaenzt die bestehende Pruefung in
   nutrition-calculator.js (isQualitativeIngredient), hier fuer die Erkennung innerhalb des
   Normalizers verfuegbar. */
const VAGUE_AMOUNT_PATTERNS = [/\bwenig\b/i, /\betwas\b/i, /\bnach bedarf\b/i, /\bnach belieben\b/i, /\beine prise\b/i, /\bein schuss\b/i, /\beine handvoll\b/i];

/* ---------- Schweizer & deutsche Synonyme (Punkt 43-44) ----------
   Bewusst als exakte Token-/Phrasen-Map, NIE als Substring-Ersetzung — sonst wuerde z.B.
   "Peperoncino" faelschlich "Peperoni" enthalten und auf Paprika matchen (Punkt 19, 121). */
const SWISS_GERMAN_SYNONYMS = {
  'ruebli': 'karotte', 'rüebli': 'karotte',
  'moehre': 'karotte', 'möhre': 'karotte', 'moehren': 'karotten', 'möhren': 'karotten',
  // "Peperoni" ist in der Schweizer Datenbank bereits der native Lebensmittelname fuer
  // Gemuesepaprika (Punkt 19) — KEINE Alternative auf "Paprika" ergaenzen: "Paprika (Gewuerz)"
  // ist dort das Gewuerzpulver, ein anderes Lebensmittel. "Peperoncino" bleibt bewusst
  // unangetastet (nicht in dieser Map), damit es NIE mit Peperoni verwechselt wird.
  'nuesslisalat': 'feldsalat', 'nüsslisalat': 'feldsalat',
  'randen': 'rande', // "Rande" existiert nativ (mit BLV-Synonym "Rote Beete") — keine Dopplung noetig
  'baumnuesse': 'baumnuss', 'baumnüsse': 'baumnuss', // "Baumnuss" existiert nativ (Synonym "Walnuss")
  'rahm': 'rahm sahne', 'sahne': 'sahne rahm',
  'haehnchen': 'poulet', 'hähnchen': 'poulet', // "Poulet" existiert nativ, "Haehnchen" nicht
  'pouletbrust': 'poulet brust', 'pouletbrustfilet': 'poulet brust filet',
  'huehnerbrust': 'poulet brust', 'hühnerbrust': 'poulet brust',
  'haehnchenbrust': 'poulet brust', 'hähnchenbrust': 'poulet brust',
  'gschwellti': 'kartoffel gekocht',
  'zwetschgen': 'pflaumen', 'doerraprikosen': 'aprikosen getrocknet', 'dörraprikosen': 'aprikosen getrocknet',
};

/* ---------- Hilfsfunktionen ---------- */

// Wortgrenzen-sichere Suche/Entfernung EINER Phrase (mehrwortfaehig) in einem Leerzeichen-
// getrennten Text. `inflect=true` (Default) erlaubt eine uebliche deutsche Adjektiv-/Partizip-
// Endung am letzten Wort der Phrase (weich -> weiche/weicher/weiches/weichen/weichem), damit
// "weiche Butter" genauso erkannt wird wie "Butter, weich" — ohne die Basisform selbst
// aufzuweichen (Butter bleibt Butter, da "butter" nirgends als Deskriptor gelistet ist).
function extractPhrase(text, phrase, inflect) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const suffix = inflect === false ? '' : '(?:e|er|es|en|em)?';
  const pattern = new RegExp('(^|\\s)' + escaped + suffix + '(?=\\s|$)', 'i');
  if (!pattern.test(text)) return { found: false, text };
  return { found: true, text: text.replace(pattern, ' ').replace(/\s+/g, ' ').trim() };
}

// Entfernt ALLE Treffer aus einer Phrasenliste (laengste zuerst, damit z.B. "fein gehackt"
// vor dem alleinstehenden "gehackt" greift) und sammelt die gefundenen Phrasen.
function extractAllPhrases(text, phraseList, inflect) {
  const sorted = [...phraseList].sort((a, b) => b.length - a.length);
  const found = [];
  let remaining = text;
  for (const phrase of sorted) {
    const result = extractPhrase(remaining, phrase, inflect);
    if (result.found) {
      found.push(phrase);
      remaining = result.text;
    }
  }
  return { remaining, found };
}

// Prueft, ob eine geschuetzte Verbindung im Text steckt, OHNE sie zu entfernen (sie bleibt
// als Ganzes stehen). Bewusst OHNE Adjektiv-Flexion (inflect=false) — das sind Nomen, gaengige
// Pluralformen stehen bereits explizit in der Liste (z.B. "eigelbe", "eiweisse").
function findProtectedPhrase(text) {
  const sorted = [...PROTECTED_INGREDIENT_PHRASES].sort((a, b) => b.length - a.length);
  for (const phrase of sorted) {
    if (extractPhrase(text, phrase, false).found) return phrase;
  }
  return null;
}

function applySwissGermanSynonyms(coreText) {
  const trimmed = coreText.trim();
  if (!trimmed) return trimmed;
  if (SWISS_GERMAN_SYNONYMS[trimmed]) return SWISS_GERMAN_SYNONYMS[trimmed];
  const tokens = trimmed.split(' ').filter(Boolean);
  const mapped = tokens.map((t) => SWISS_GERMAN_SYNONYMS[t] || t);
  return mapped.join(' ');
}

// Manche erkannten Zustandsphrasen entsprechen nicht dem Wortlaut der Schweizer Datenbank
// (die Zutatenzeile sagt z.B. "aus der Dose", der Datensatz heisst aber "... (Konserve)").
// Fuer die SUCHE wird deshalb ein datenbanknaher Suchbegriff verwendet — der dem Nutzer
// angezeigte/gespeicherte Zustand (nutritionRelevantStates) bleibt trotzdem der Originalbegriff.
const STATE_SEARCH_TERM_OVERRIDES = {
  'aus der dose': 'konserve', 'in der dose': 'konserve', 'aus der büchse': 'konserve', 'dose': 'konserve',
};
function stateSearchTerm(phrase) {
  return STATE_SEARCH_TERM_OVERRIDES[phrase] || phrase;
}

/* ---------- Hauptfunktion ---------- */
/* Zerlegt einen Zutatennamen (den reinen Namensteil, OHNE Menge/Einheit — die liegen bei
   Savora bereits getrennt in ing.amount/ing.unit). Gibt das in Punkt 7 beschriebene, auf
   Savoras Bedarf reduzierte Datenmodell zurueck. `originalText` bleibt IMMER unveraendert
   (Punkt 45) — alles andere ist nur eine interne Ableitung fuers Matching. */
function normalizeIngredientPhrase(rawName) {
  const originalText = rawName || '';
  const out = {
    originalText,
    rawIngredientName: originalText,
    canonicalIngredient: '',
    descriptors: [],
    nutritionRelevantStates: [],
    qualifiers: [],
    optional: false,
    vagueAmount: false,
    searchQuery: '',
    protected: false,
  };
  if (!originalText.trim()) return out;

  // 1) Optional-Marker erkennen (Punkt 42) — Text bleibt sichtbar, nur das Flag wird gesetzt.
  out.optional = OPTIONAL_MARKER_PATTERNS.some((p) => p.test(originalText));
  out.vagueAmount = VAGUE_AMOUNT_PATTERNS.some((p) => p.test(originalText));

  // 2) Klammerinhalt separat behandeln (Punkt 40) — Beispiel/Marke/Erklaerung, nicht blind loeschen.
  let working = originalText;
  const bracketMatch = working.match(/\(([^)]+)\)/);
  let bracketContent = null;
  if (bracketMatch) {
    bracketContent = bracketMatch[1].trim();
    working = working.replace(bracketMatch[0], ' ');
  }
  if (bracketContent) {
    if (EXAMPLE_MARKER_PATTERN.test(bracketContent)) {
      // "Halbhartkäse (z. B. Gruyère)" -> Beispiel merken, NICHT als sichere Sorte behaupten (Punkt 39)
      const example = bracketContent.replace(EXAMPLE_MARKER_PATTERN, '').replace(/^[\s.,:]+/, '').trim();
      if (example) out.qualifiers.push({ type: 'example', value: example });
    } else if (/^\s*(ca\.?|circa)?\s*\d/.test(bracketContent)) {
      out.qualifiers.push({ type: 'weight-hint', value: bracketContent });
    } else {
      out.qualifiers.push({ type: 'note', value: bracketContent });
    }
  }

  // 3) "zum ..."-Nutzungsphrasen entfernen (Punkt 35) — z.B. "Butter zum Bestreichen" -> "Butter"
  const usageMatches = working.match(USAGE_PHRASE_PATTERN);
  if (usageMatches) {
    out.descriptors.push(...usageMatches.map((m) => m.trim()));
    working = working.replace(USAGE_PHRASE_PATTERN, ' ');
  }

  // 4) Optional-/vage-Marker-Woerter aus dem Arbeitstext entfernen, bevor weiter zerlegt wird
  //    (sie sind weder Lebensmittel noch Zustand).
  for (const p of OPTIONAL_MARKER_PATTERNS) working = working.replace(p, ' ');

  // 5) Normalisieren (Kleinschreibung, Satzzeichen -> Leerzeichen) — dieselbe Basis wie das
  //    allgemeine Matching (nutrition-model.js), damit beide Systeme konsistent bleiben.
  let normalized = normalizeIngredientText(working);
  if (!normalized) { out.canonicalIngredient = ''; return out; }

  // 6) Geschuetzte zusammengesetzte Lebensmittel VOR jeder Deskriptor-Entfernung erkennen
  //    (Punkt 10: "Bratbutter wird zunaechst als Lebensmittel erkannt").
  const protectedPhrase = findProtectedPhrase(normalized);
  let core;
  if (protectedPhrase) {
    // Die geschuetzte Phrase bleibt als Kern stehen, alles drumherum wird ganz normal als
    // Deskriptor/Zustand weiterverarbeitet (z.B. "Rohschinken, in Streifen").
    const withoutProtected = extractPhrase(normalized, protectedPhrase).text;
    const states1 = extractAllPhrases(withoutProtected, NUTRITION_RELEVANT_STATE_PHRASES);
    const neutrals1 = extractAllPhrases(states1.remaining, NEUTRAL_DESCRIPTOR_PHRASES);
    out.nutritionRelevantStates.push(...states1.found);
    out.descriptors.push(...neutrals1.found);
    core = protectedPhrase;
  } else {
    // 7) Ernaehrungsrelevante Zustaende ZUERST entnehmen (muessen erhalten bleiben, Punkt 78),
    //    danach matching-neutrale Deskriptoren (duerfen fuers Matching entfernt werden, Punkt 77).
    const states = extractAllPhrases(normalized, NUTRITION_RELEVANT_STATE_PHRASES);
    const neutrals = extractAllPhrases(states.remaining, NEUTRAL_DESCRIPTOR_PHRASES);
    out.nutritionRelevantStates.push(...states.found);
    out.descriptors.push(...neutrals.found);
    core = neutrals.remaining;
  }

  // 8) Restliche Satzzeichen/Kommas aufraeumen, die durch die Entfernung uebrig blieben.
  core = core.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();

  // 9) Schweizer/deutsche Synonyme anwenden (Punkt 43-44) — NUR auf den bereinigten Kern,
  //    nie auf geschuetzte Verbindungen (die sind bereits das korrekte Lebensmittel).
  const canonicalCore = protectedPhrase ? core : applySwissGermanSynonyms(core);

  out.rawIngredientName = core || normalized;
  out.canonicalIngredient = canonicalCore || core || normalized;
  out.protected = !!protectedPhrase; // true = canonicalIngredient ist eine geschuetzte Mehrwort-Verbindung
                                       // (z.B. "vegane butter") und darf NIE wortweise zerlegt/geprueft werden

  // 10) Suchanfrage fuers Nutrition-Matching: Kern + erhaltene ernaehrungsrelevante Zustaende
  //     (gleiches Prinzip wie die Zubereitungserkennung aus den Schritten, nutrition-preparation.js).
  //     Fuer die Suche werden Zustaende auf ihren datenbanknahen Begriff abgebildet (siehe oben).
  out.searchQuery = [out.canonicalIngredient, ...out.nutritionRelevantStates.map(stateSearchTerm)].filter(Boolean).join(' ').trim();

  return out;
}
