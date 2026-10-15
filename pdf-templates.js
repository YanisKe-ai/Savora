/* ---------- PDF-Seitenstile «Pur» und «Prise Pop» und Seitenaufbau ----------
   Genau zwei auswaehlbare Stile, eine gemeinsame Pipeline (Einzelrezept und Kochbuch) mit gemeinsamen Bausteinen:
     pur        «Pur»        weiss, Public Sans (ruhige Grotesk), helle gruene Zutatenflaeche ohne Zellen, schlichte Nummern. Standard.
     prise-pop  «Prise Pop»  Tomatenrot, gelbe Zutatenflaeche mit Wellenkante, Nummernkreise, lavendelfarbene Hinweise.
   Verbindliche Gestaltung: Savora_PDF_Feinschliff_V2 (recipe-layout.css), Masse und Farben als Tokens in pdf-print.css.
   Dichten (vom Seitenplaner in pdf.js gewaehlt, Attribut data-density der Seite): normal, compact, compact-columns.
   Unterschiede stecken nur in Design-Tokens (pdf-print.css) und wenigen Schmuckregeln, nicht in eigenen Renderern.
   Die fruehren Stil-IDs A, B, C gibt es nur noch als Zuordnung in pdfNormalizeTemplateId (A, C und unbekannt -> pur, B -> prise-pop).
   Die Seiten sind reines HTML (Klassen mit Praefix pv-), das in pdf.js gemessen, paginiert und gerastert wird. Nichts hier
   veraendert Rezeptdaten: es wird nur dargestellt.

   Grundregeln: Originalmengen unveraendert (keine Kuechenrundung), leere Bloecke werden nicht gezeichnet (Darstellungsbereinigung,
   Rezept bleibt unveraendert), Fliesstext mind. 10,5 pt, Sekundaertexte mind. 8,5 pt, Bilder nie gestreckt (Rahmen hat immer das
   Seitenverhaeltnis des Fotos, das ganze Foto bleibt sichtbar). */

const PDF_TEMPLATES = {
  'pur': { id: 'pur', name: 'Pur', hint: 'Weiss und ruhig, serifenlose Schrift, spart Tinte beim Drucken. Standard.', cls: 'pv-tpl-pur', pageNo: [37, 39, 32], pageNoCenter: true,
    fonts: ['400 11pt "Public Sans"', '700 11pt "Public Sans"', '400 11pt "Public Sans Pur"', '600 11pt "Public Sans Pur"', '700 11pt "Public Sans Pur"', '700 30pt "Public Sans Pur"', '400 11pt "Carlito"'], extrasSide: false, wave: false, inlineFacts: true },
  'prise-pop': { id: 'prise-pop', name: 'Prise Pop', hint: 'Kräftige rote Titel, gelbe Zutatenfläche, freundlich und bunt.', cls: 'pv-tpl-prise-pop', pageNo: [37, 39, 32], pageNoCenter: true,
    fonts: ['400 11pt "Carlito"', '400 32pt "Lilita One"', '400 11pt "Public Sans"', '700 11pt "Public Sans"', '400 32pt "Lilita One Pop"', '400 11pt "Public Sans Pop"', '700 11pt "Public Sans Pop"'], extrasSide: false, wave: true, inlineFacts: true, pop: true },
};
const PDF_TEMPLATE_KEY = 'savora-pdf-template';

/* Einzige Stelle fuer die Zuordnung alter und unbekannter Stil-IDs. Idempotent, liefert immer 'pur' oder 'prise-pop'.
   A (Klassisch), C (Schlicht), leer und alles Unbekannte -> 'pur'; B (Kraeftig) -> 'prise-pop'. */
function pdfNormalizeTemplateId(id) {
  const k = String(id == null ? '' : id).trim().toLowerCase();
  return k === 'prise-pop' || k === 'b' ? 'prise-pop' : 'pur';
}
function pdfTemplateById(id) { return PDF_TEMPLATES[pdfNormalizeTemplateId(id)]; }
function pdfDefaultTemplateId() {
  let v = null; try { v = localStorage.getItem(PDF_TEMPLATE_KEY); } catch (e) {}
  return pdfNormalizeTemplateId(v);
}
function pdfRememberTemplate(id) { try { localStorage.setItem(PDF_TEMPLATE_KEY, pdfNormalizeTemplateId(id)); } catch (e) {} }

/* Kontext des laufenden Exports (Stil, Buchtitel/Autor fuer die Fusszeile, Kochbuch-Modus fuer «Seite n») */
let PDF_CTX = { tpl: PDF_TEMPLATES['pur'], bookTitle: '', author: '', logo: true, book: false };

/* ---------- Darstellungsmodell (abgeleitet, aendert nichts am Rezept) ---------- */

function pdfAmountText(i) {
  // Originalwortlaut: nur das Zahlenformat vereinheitlichen (1/2 -> ½, Bereich mit Gedankenstrich), niemals runden oder umrechnen.
  const raw = String(i.amount == null ? '' : i.amount).trim();
  if (!raw) return '';
  const q = qtyFromIngredient(i);
  if (qtyIsNumeric(q)) return qtyDisplay(q, i.unit, { fmt: fmtAmount }).text;   // exakt oder Bereich, beide Grenzen; kg unter 1 kg als g
  return raw;                                                    // "etwas", mehrdeutige oder freie Angaben unveraendert
}
// Menge samt Einheit (Anzeigeeinheit wie in Rezeptansicht und Einkauf)
function pdfAmountLine(i) {
  const raw = String(i.amount == null ? '' : i.amount).trim();
  const q = qtyFromIngredient(i);
  if (raw && qtyIsNumeric(q)) { const d = qtyDisplay(q, i.unit, { fmt: fmtAmount }); return d.text + (d.unit ? ' ' + d.unit : ''); }
  const unit = String(i.unit || '').trim();
  return raw ? raw + (unit ? ' ' + unit : '') : unit;
}

/* pdfClassifyStepText (Hinweise/Quellen als Schritt erkennen) steht in pdf-model.js. */

function pdfFormatMinutes(m) {
  m = Math.round(Number(m) || 0);
  if (m < 60) return m + ' Min.';
  const h = Math.floor(m / 60), r = m % 60;
  return h + ' Std.' + (r ? ' ' + r + ' Min.' : '');
}

/* Darstellungsmodell eines Rezepts (nur Anzeige, nichts wird veraendert). Die Aufbereitung steht in pdf-model.js.
   opts.chapter: Name des Kochbuch-Kapitels des Nutzers (dieselbe Quelle wie das Inhaltsverzeichnis), nur im Kochbuch. */
function pdfBuildModel(recipe, nutritionResult, opts) {
  opts = opts || {};
  const groups = pdfIngredientGroups(recipe);
  const showGroupTitles = groups.length > 1 || (groups[0] && groups[0].title !== 'Zutaten');
  const ingredients = [];
  groups.forEach((g) => {
    ingredients.push({ type: 'group', title: g.title, show: showGroupTitles, size: g.ingredients.length });
    g.ingredients.forEach((i) => ingredients.push(Object.assign({ type: 'ing', group: g.title }, pdfSplitIngredient(i))));
  });

  const { steps, tips, sources } = pdfSplitSteps(recipe);
  const src = pdfSourceInfo(recipe, sources);
  const cat = pdfCategoryInfo(recipe, opts.chapter);
  const log = (recipe.cookLog || []).filter((x) => x && String(x.text || '').trim());
  const notes = String(recipe.notes || '').trim();
  const servings = pdfServingsInfo(recipe, steps.filter((s) => s.type === 'step').map((s) => s.text).concat(tips, notes ? [notes] : []));
  const facts = [];
  const sv = Number(recipe.servings) || 0;
  const pieces = servingMode(recipe) === 'pieces';
  const addFact = (label, value, short) => facts.push({ label, value, short: short || (label + ' ' + value) });
  if (sv) {
    const yl = recipe.yieldLabel || 'Stück';
    if (pieces) addFact('Ergibt', sv + ' ' + yl, 'Ergibt ' + sv + ' ' + yl);
    else addFact(sv === 1 ? 'Portion' : 'Portionen', String(sv), sv + ' ' + (sv === 1 ? 'Portion' : 'Portionen'));
  }
  const shortMin = (n) => (Math.round(Number(n) || 0) < 120 ? Math.round(Number(n) || 0) + ' Minuten' : pdfFormatMinutes(n));   // Kurzform fuer die Untertitelzeile («4 Portionen · 90 Minuten»)
  if (recipe.timeMinutes) addFact('Gesamtzeit', pdfFormatMinutes(recipe.timeMinutes), shortMin(recipe.timeMinutes));
  if (recipe.prepMinutes) addFact('Vorbereitungszeit', pdfFormatMinutes(recipe.prepMinutes), 'Vorbereitung ' + shortMin(recipe.prepMinutes));
  if (recipe.restMinutes) addFact('Ruhen', pdfFormatMinutes(recipe.restMinutes), 'Ruhen ' + shortMin(recipe.restMinutes));
  if (recipe.cookMinutes) addFact('Garen/Backen', pdfFormatMinutes(recipe.cookMinutes), 'Garen/Backen ' + shortMin(recipe.cookMinutes));
  const basis = pdfNutritionBasis(nutritionResult, pieces);
  const m = {
    id: recipe.id, title: String(recipe.title || 'Ohne Titel').trim(), category: cat.text, categoryKind: cat.kind, categoryAll: cat.all, facts, ingredients, steps, tips,
    source: src.source, sourceText: src.sourceText, sourceUrl: src.sourceUrl, sourceUrlText: src.sourceUrlText, sourceOrigin: src.sourceOrigin || '', notes, log,
    nutrition: nutritionResult || null, pieces, servings,
    nutritionBasis: basis.basis, nutritionBasisLabel: basis.label, nutritionView: pdfNutritionView(nutritionResult), nutritionNote: pdfNutritionNote(nutritionResult, servings),
  };
  m.warnings = pdfModelWarnings(m);
  return m;
}

/* ---------- Bausteine ---------- */

/* Typografie: Zahl und Zeichen «%» bzw. «°C» bleiben zusammen (geschuetztes Leerzeichen), damit sie nicht getrennt umbrechen */
function pvEsc(s) { return escapeHtml(String(s).replace(/(\d)[ \t]+(%|°\s?C\b)/g, '$1 $2')); }

/* Zutatenzeile. Modell: { amount (nur Menge + kurze Einheit), name, note, raw, uncertain }.
   Unsichere Zeilen (uncertain) geben den Originaltext raw vollstaendig in der Namensspalte aus.
   Zutaten ohne Menge bekommen keine Mengenangabe (auch keine 0): der Name steht in der Namensspalte.
   Sehr lange Mengenangaben (> PV_AMT_STACK_CHARS Zeichen) stehen ueber dem Namen statt in der Mengenspalte.
   Zusatzklassen laufen ueber data-Attribute, damit class="pv-ing" stabil bleibt. */
const PV_AMT_STACK_CHARS = 12;
function pvIngUnit(it, cont) {
  if (it.type === 'group') return it.show ? `<div class="pv-ing-group">${pvEsc(it.title)}${cont ? ' <span class="pv-cont">· Fortsetzung</span>' : ''}</div>` : '';
  const unsure = !!it.uncertain && String(it.raw || '').trim();
  const amount = unsure ? '' : String(it.amount == null ? '' : it.amount).trim();
  const name = unsure ? String(it.raw).trim() : String(it.name == null ? '' : it.name).trim();
  let note = unsure ? '' : String(it.note || '').trim();
  if (note) note = /^\(/.test(note) ? ' ' + note : /^[,;]/.test(note) ? note : ', ' + note;
  const attrs = (amount.length > PV_AMT_STACK_CHARS ? ' data-stack="1"' : '') + (unsure ? ' data-uncertain="1"' : '') + (!amount && !unsure ? ' data-noamt="1"' : '');
  return `<div class="pv-ing"${attrs}>${amount ? `<span class="pv-ing-amt">${pvEsc(amount)}</span>` : ''}<span class="pv-ing-name">${pvEsc(name)}${note ? `<span class="pv-ing-note">${pvEsc(note)}</span>` : ''}</span></div>`;
}
function pvStepUnit(s, title) {
  if (s.type === 'heading') return `<div class="pv-step-heading">${pvEsc(s.text)}</div>`;
  if (title) return `<div class="pv-step"><span class="pv-step-no">${s.no}</span><span class="pv-step-body"><div class="pv-step-heading">${pvEsc(title.text)}</div><span class="pv-step-text">${pvEsc(s.text)}</span></span></div>`;   // Pur: Schrittname neben der Ziffer
  return `<div class="pv-step"><span class="pv-step-no">${s.no}</span><span class="pv-step-text">${pvEsc(s.text)}</span></div>`;
}
/* Spalte ohne jede Mengenangabe: keine leere Mengenspalte */
function pvIngColClass(html, extra) { return 'pv-ing-col' + (extra ? ' ' + extra : '') + (/pv-ing-amt/.test(html) ? '' : ' pv-ing-col-noamt'); }

/* Zutaten in kleinste Einheiten (Zeilen) zerlegen. w = geschaetzte Zeilenzahl (nur fuer das Ausbalancieren der beiden Spalten;
   die endgueltige Passung wird immer am echten Layout gemessen). */
function pvIngWeight(it) {
  const len = String((it.uncertain && it.raw) ? it.raw : (it.name || '')).length + String(it.note || '').length;
  return 1 + Math.floor(len / 30);
}
function pvIngAtoms(ingredients) {
  const atoms = [];
  let gi = -1, head = null, idx = 0;
  ingredients.forEach((it) => {
    if (it.type === 'group') { gi++; head = it; idx = 0; return; }
    atoms.push({ html: pvIngUnit(it), it, w: pvIngWeight(it), gi, head, idx: idx++, gSize: head ? head.size : 1, hasHead: !!(head && head.show) });
  });
  return atoms;
}
/* Einheiten fuer den Umbruch (pdf.js fuellt Seite fuer Seite Einheit fuer Einheit):
   - kleine Gruppen (<= 8 Zutaten) bleiben ganz zusammen;
   - bei groesseren Gruppen bildet der Gruppentitel IMMER mit der ersten Zutat eine unteilbare Einheit. */
function pvIngredientUnits(ingredients) {
  const atoms = pvIngAtoms(ingredients);
  const units = [];
  let i = 0;
  while (i < atoms.length) {
    let j = i; while (j < atoms.length && atoms[j].gi === atoms[i].gi) j++;
    const grp = atoms.slice(i, j);
    if (grp.length <= 8) units.push({ atoms: grp, group: grp[0].head && grp[0].head.title, groupHead: grp[0].head, first: true, whole: true, html: grp.map((a) => a.html).join('') });
    else grp.forEach((a, k) => units.push({ atoms: [a], group: a.head && a.head.title, groupHead: a.head, first: k === 0, html: a.html }));
    i = j;
  }
  return units;
}
function pvStepUnits(steps) {
  const units = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (s.type === 'heading') {
      let html = pvStepUnit(s); let j = i + 1;
      while (j < steps.length && steps[j].type === 'heading') { html += pvStepUnit(steps[j]); j++; }
      if ((PDF_CTX.tpl.id === 'pur' || PDF_CTX.tpl.pop) && j === i + 1 && j < steps.length) { html = pvStepUnit(steps[j], s); i = j; }
      else if (j < steps.length) { html += pvStepUnit(steps[j]); i = j; } else i = j - 1;
      units.push({ html });
    } else units.push({ html: pvStepUnit(s) });
  }
  return units;
}

/* Zutaten einer Seite auf zwei Spalten verteilen: Gruppen bleiben zusammen, Reihenfolge strikt von oben nach unten und von
   links nach rechts. Geschnitten wird nur zwischen Gruppen, bei Zutaten ohne Gruppentitel zwischen beliebigen Zeilen und
   in grossen Gruppen (ab 6 Zutaten) nach der zweiten Zeile; die zweite Spalte wiederholt dann den Gruppentitel mit «Fortsetzung». */
function pvSplitCols(atoms) {
  const cost = (a) => a.w + (a.idx === 0 && a.hasHead ? 1.9 : 0);
  if (atoms.length <= 2) return [atoms, []];
  const legal = (a) => a.idx === 0 || !a.hasHead || (a.gSize >= 6 && a.idx >= 2 && a.idx <= a.gSize - 2);
  const total = atoms.reduce((n, a) => n + cost(a), 0);
  let best = -1, bestMax = Infinity, left = 0;
  for (let c = 1; c < atoms.length; c++) {
    left += cost(atoms[c - 1]);
    if (!legal(atoms[c])) continue;
    const right = total - left + (atoms[c].idx > 0 && atoms[c].hasHead ? 1.9 : 0);
    const mx = Math.max(left, right);
    if (mx < bestMax - 1e-9) { bestMax = mx; best = c; }
  }
  if (best < 0) return [atoms, []];
  return [atoms.slice(0, best), atoms.slice(best)];
}
/* Breite Gruppe (Layoutentscheidung des Adapters, nicht der Daten): bei ungerader Gruppenzahl ab drei nutzt die letzte Gruppe die
   ganze Breite. Kurze Zeilen stehen dann in zwei ausgewogenen Spalten (oben nach unten, dann rechts), lange Zeilen einspaltig. */
const PV_WIDE_ROW_CHARS = 46;   // ca. zwei Zeilen in der halben Breite
function pvWideTwoCols(list) {
  return list.every((a) => {
    const it = a.it || {};
    const txt = it.uncertain && it.raw ? String(it.raw) : String(it.name || '') + String(it.note || '');
    return txt.length <= PV_WIDE_ROW_CHARS && String(it.amount || '').length <= PV_AMT_STACK_CHARS;
  });
}
function pvWideGroupHtml(list, gi) {
  const head = list[0].hasHead ? (list[0].idx === 0 ? pvIngUnit(list[0].head) : pvIngUnit(list[0].head, true)) : '';
  const hasAmt = list.some((a) => /pv-ing-amt/.test(a.html));
  if (!pvWideTwoCols(list) || list.length < 2) {
    const h = head + list.map((a) => a.html).join('');
    return `<div class="pp-group pp-wide${hasAmt ? '' : ' pv-ing-col-noamt'}" data-group="${gi}" data-fullwidth="1" data-onecol="1">${h}</div>`;
  }
  const half = Math.ceil(list.length / 2), r0 = head ? 2 : 1;
  const rows = list.map((a, k) => {
    const right = k >= half, row = r0 + (right ? k - half : k);
    const col = hasAmt ? (right ? 4 : 1) : (right ? 3 : 1);
    return a.html.replace(/^<div class="pv-ing"/, `<div class="pv-ing" style="grid-area:${row} / ${col} / auto / span ${hasAmt ? 2 : 1}"`);
  }).join('');
  return `<div class="pp-group pp-wide pp-wide-2${hasAmt ? '' : ' pv-ing-col-noamt'}" data-group="${gi}" data-fullwidth="1">${head}${rows}</div>`;
}
/* Zutatenflaeche einer Seite (beide Stile, gleiche Bausteine). units: Einheiten aus pvIngredientUnits (evtl. mit abgetrenntem
   Beginn einer Gruppe). density: 'normal' | 'compact' | 'compact-columns' (drei Gruppenspalten, keine breite Gruppe). */
function pvIngPanel(units, label, density) {
  const atoms = [];
  units.forEach((u) => (u.atoms || []).forEach((a) => atoms.push(a)));
  if (!atoms.length) return '';
  const colHtml = (list) => list.map((a, i) => (a.hasHead ? (a.idx === 0 ? pvIngUnit(a.head) : (i === 0 ? pvIngUnit(a.head, true) : '')) : '') + a.html).join('');
  const wave = PDF_CTX.tpl.wave ? '<i class="pv-wave pv-wave-b" aria-hidden="true"></i>' : '';
  // Gruppen als Zellen eines zweispaltigen Rasters (zeilenweise: Gruppe 1 | 2, darunter 3 | 4). Eine einzelne Gruppe wird auf zwei Zellen verteilt.
  const gs = [];
  atoms.forEach((a) => { const g = gs[gs.length - 1]; if (g && g.gi === a.gi) g.list.push(a); else gs.push({ gi: a.gi, list: [a] }); });
  const cols3 = density === 'compact-columns' && gs.length >= 3;
  let cells = gs.map((g) => ({ gi: g.gi, list: g.list }));
  if (cells.length === 1 && cells[0].list.length > 2) cells = pvSplitCols(cells[0].list).filter((c) => c.length).map((list) => ({ gi: list[0].gi, list }));
  const wideAt = !cols3 && cells.length >= 3 && cells.length % 2 === 1 ? cells.length - 1 : -1;
  const cellHtml = cells.map((c, k) => {
    if (k === wideAt) return pvWideGroupHtml(c.list, c.gi);
    const h = colHtml(c.list);
    return `<div class="pp-group ${pvIngColClass(h)}" data-group="${c.gi}">${h}</div>`;
  }).join('');
  return `<div class="pv-ing-panel"><h2 class="pv-h">${label || 'Zutaten'}</h2><div class="pp-groups${cols3 ? ' pv-ing-cols3' : ''}">${cellHtml}</div>${wave}</div>`;
}
function pvStepsHtml(units, label, deco) {
  const html = units.map((u) => u.html).join('');
  return html ? `<div class="pv-steps"><h2 class="pv-h">${label || 'Zubereitung'}${deco ? '<i class="pv-tomato" aria-hidden="true"></i>' : ''}</h2>${html}</div>` : '';
}

/* Naehrwerte: ein Raster fuer «Kompakt» und «Erweitert». Jede Zelle = Wert + Einheit, darunter die Bezeichnung.
   Fehlende Werte (null) werden weggelassen, nie als 0 gezeichnet. Das Raster hat feste Spaltenzahl, eine Zelle bricht nie. */
function pvNutBasisText(result, pieces, basis) {
  const b = basis && typeof basis === 'object' ? (basis.label || basis.text || '') : String(basis || '');
  if (String(b).trim()) return String(b).trim();
  return result.needsServings ? 'gesamt' : pieces ? 'pro Stück' : 'pro Portion';
}
function pvNutritionBox(result, detailLevel, pieces, basis, basisNote) {
  if (!result) return '';
  const total = !!result.needsServings;   // Ausbeute unbekannt: Gesamtwerte statt Pro-Portion
  const cell = (key, label) => {
    const def = NUTRIENT_KEYS[key];
    const v = typeof nutValueText === 'function' ? nutValueText(result, total ? 'total' : 'portion', key) : (result.nutrientsPerPortion[key] === null ? null : String(result.nutrientsPerPortion[key]).replace('.', ','));
    if (v === null || v === undefined || v === '' || v === 'NaN') return '';
    return `<div class="pv-nut-cell"><b>${pvEsc(v)}</b> <em>${pvEsc(def.unit)}</em><i>${pvEsc(label || def.label)}</i></div>`;
  };
  const cells = PDF_CTX.tpl.id === 'pur'   // Pur: Reihenfolge und Bezeichnung wie in der Vorlage (Energie, Fett, Kohlenhydrate, Eiweiss)
    ? [cell('energyKcal', 'Energie'), cell('fat', 'Fett'), cell('carbohydrates', 'Kohlenhydrate'), cell('protein', 'Eiweiss'), cell('fiber', 'Ballaststoffe')]
    : [cell('energyKcal', 'Energie'), cell('protein', 'Protein'), cell('carbohydrates', 'Kohlenhydrate'), cell('fat', 'Fett'), cell('fiber', 'Ballaststoffe')];
  if (detailLevel === 'full') cells.push(cell('sugars', 'Zucker'), cell('saturatedFat', 'ges. Fett'), cell('salt', 'Salz'));
  const shown = cells.filter(Boolean);
  if (!shown.length) return '';
  const cols = Math.min(shown.length, detailLevel === 'full' ? 4 : 5);
  const hint = `${pvEsc(nutritionSourceLabel(result.sourceDataVersions))}. Geschätzte Werte, je nach Zutaten und Mengen können sie abweichen. Keine medizinische Aussage.${result.rangeUsed ? ' Menge als Bereich angegeben, Ergebnis als Spanne.' : ''}${result.needsServings ? ' Es fehlt die Angabe, wie viel das Rezept ergibt: Pro-Portion-Werte erst nach Klärung.' : ''}${(result.approximations || []).length ? ' Angenähert: ' + pvEsc(result.approximations.map((a) => a.name).join(', ')) + '.' : ''}${(result.unquantified || []).length ? ' Ohne Mengenangabe nicht eingerechnet: ' + pvEsc(result.unquantified.join(', ')) + '.' : ''}${basisNote ? ' ' + pvEsc(basisNote) : ''}`;
  if (PDF_CTX.tpl.pop && detailLevel !== 'full') {
    const line = [['energyKcal', null], ['protein', 'Eiweiss'], ['carbohydrates', 'Kohlenhydrate'], ['fat', 'Fett'], ['fiber', 'Ballaststoffe']].map(([k, lab]) => {
      const v = typeof nutValueText === 'function' ? nutValueText(result, total ? 'total' : 'portion', k) : null;
      return v === null || v === undefined || v === '' || v === 'NaN' ? '' : pvEsc(v + '\u00a0' + NUTRIENT_KEYS[k].unit) + (lab ? ' ' + lab : '');
    }).filter(Boolean).map((t) => `<span>${t}</span>`).join('');
    return `<div class="pv-nutri pv-nutline" data-detail="compact"><div class="pv-nutline-row"><b>Nährwerte ${pvEsc(pvNutBasisText(result, pieces, basis))}</b>${line}</div><div class="pv-small">${hint}</div></div>`;
  }
  return `<div class="pv-nutri" data-detail="${detailLevel === 'full' ? 'full' : 'compact'}"><div class="pv-label">Nährwerte</div><div class="pv-nut-basis">${pvEsc(pvNutBasisText(result, pieces, basis))} · geschätzt</div><div class="pv-nut-grid" style="--pv-nut-cols:${cols}">${shown.join('')}</div>
    <div class="pv-small">${hint}</div></div>`;
}

/* Quelle: Text mit anklickbarer URL. Der Link traegt data-pdf-href (nur http/https), das pdf.js als PDF-Link auswerten kann. */
function pvSourceHtml(text, url) {
  const t = String(text || '').replace(/^\s*quelle\s*[:\-–]\s*/i, '').trim();
  const link = (u) => { const clean = u.replace(/[.,;:!?)\]]+$/, ''), tail = u.slice(clean.length); return `<a class="pv-url" href="${escapeHtml(clean)}" data-pdf-href="${escapeHtml(clean)}">${pvEsc(clean)}</a>${pvEsc(tail)}`; };
  const u = String(url || '').trim();
  const bare = u.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  // Steht dieselbe Adresse im Text nur ohne «https://», wird genau diese Stelle zum Link (nicht doppelt ausgeben)
  const bareAt = (/^https?:\/\//i.test(u) && bare && !/https?:\/\//i.test(t)) ? t.indexOf(bare) : -1;
  if (bareAt >= 0) {
    return (pvEsc(t.slice(0, bareAt)) + `<a class="pv-url" href="${escapeHtml(u)}" data-pdf-href="${escapeHtml(u)}">${pvEsc(bare)}</a>` + pvEsc(t.slice(bareAt + bare.length))).trim();
  }
  let html = '', last = 0, m; const re = /https?:\/\/[^\s<>"']+/gi;
  while ((m = re.exec(t))) { html += pvEsc(t.slice(last, m.index)) + link(m[0]); last = m.index + m[0].length; }
  html += pvEsc(t.slice(last));
  if (/^https?:\/\//i.test(u) && !t.includes(u)) html += (html ? ' ' : '') + link(u);
  return html.trim();
}

/* Zusatzbloecke in Reihenfolge Hinweise, Notizen, Naehrwerte, Quelle. Nur mit echtem Inhalt; jede Ueberschrift einmal.
   Blocks: [{ key, cls, label, paras:[html] } | { key, box:html }] */
function pvExtrasBlocks(m, nutritionDetail) {
  const out = [];
  const tips = (m.tips || []).map((t) => String(t == null ? '' : t).trim()).filter(Boolean);
  if (tips.length) out.push({ key: 'tips', cls: 'pv-tips', label: tips.length > 1 ? 'Hinweise' : 'Hinweis', paras: tips.map((t) => `<p>${pvEsc(t)}</p>`) });
  const notes = String(m.notes || '').trim();
  const log = (m.log || []).filter((n) => n && String(n.text || '').trim());
  if (notes || log.length) out.push({ key: 'notes', cls: 'pv-notes', label: 'Notizen', paras: (notes ? [`<p>${pvEsc(notes)}</p>`] : []).concat(log.map((n) => `<p><b>${pvEsc(new Date(n.date).toLocaleDateString('de-CH'))}:</b> ${pvEsc(String(n.text).trim())}</p>`)) });
  if (m.nutrition && nutritionDetail && nutritionDetail !== 'off') {
    const box = pvNutritionBox(m.nutrition, nutritionDetail, m.pieces, m.nutritionBasisLabel || m.nutritionBasis, m.nutritionNote);
    if (box) out.push({ key: 'nutrition', box });
  }
  // Herkunft aus der Rezeptbibliothek (m.sourceOrigin) steht am Ende derselben Quellzeile, nie als eigener Block
  const srcMain = pvSourceHtml(m.source, m.sourceUrl), srcOrigin = pvEsc(String(m.sourceOrigin || '').trim());
  const src = srcMain && srcOrigin ? srcMain + ' · ' + srcOrigin : (srcMain || srcOrigin);
  if (src) out.push({ key: 'source', box: `<div class="pv-source"><span class="pv-label">Quelle</span><span class="pv-source-text">${src}</span></div>` });
  return out;
}
function pvBlockHtml(b, paras, cont) {
  if (b.box) return `<div class="pv-extra">${b.box}</div>`;
  return `<div class="pv-extra"><div class="${b.cls}"><div class="pv-label">${b.label}${cont ? ' <span class="pv-cont">· Fortsetzung</span>' : ''}</div><div class="pv-extra-body">${(paras || b.paras).join('')}</div></div></div>`;
}
/* Einheiten fuer den Seitenumbruch: Ueberschrift und erster Absatz sind unteilbar; weitere Absaetze
   duerfen auf der naechsten Seite folgen. Beginnt eine Seite mit so einem Folgeabsatz, nimmt man contHtml
   (gleicher Absatz mit Ueberschrift «· Fortsetzung»), sonst html. */
function pvExtrasUnits(m, nutritionDetail) {
  const units = [];
  pvExtrasBlocks(m, nutritionDetail).forEach((b) => {
    if (b.box) { units.push({ key: b.key, html: pvBlockHtml(b) }); return; }
    units.push({ key: b.key, html: pvBlockHtml(b, b.paras.slice(0, 1)) });
    b.paras.slice(1).forEach((p) => units.push({ key: b.key, more: true, html: `<div class="pv-extra pv-extra-more"><div class="${b.cls}">${p}</div></div>`, contHtml: pvBlockHtml(b, [p], true) }));
  });
  return units;
}
/* Zusatzbloecke einer Seite. Im Stil «Pur» stehen kurze Hinweise/Notizen links neben den Naehrwerten (wie in der Vorlage),
   sonst untereinander in der Reihenfolge Hinweise, Notizen, Naehrwerte, Quelle. */
function pvExtrasGroupHtml(units) {
  if (!units || !units.length) return '';
  const list = units.map((u, i) => (i === 0 && u.more && u.contHtml ? Object.assign({}, u, { html: u.contHtml }) : u));
  const left = list.filter((u) => u.key === 'tips' || u.key === 'notes');
  const nut = list.find((u) => u.key === 'nutrition');
  const src = list.find((u) => u.key === 'source');
  const leftLen = left.reduce((n, u) => n + u.html.replace(/<[^>]+>/g, '').length, 0);
  const side = !!(PDF_CTX.tpl.extrasSide && nut && left.length && leftLen <= 700 && list.length === left.length + 1 + (src ? 1 : 0));
  let nutHtml = nut ? nut.html : '', nutHint = '';
  if (side) { const mm = /<div class="pv-small">[\s\S]*?<\/div>/.exec(nutHtml); if (mm) { nutHint = mm[0]; nutHtml = nutHtml.replace(mm[0], ''); } }   // Pur: Hinweistext zu den Naehrwerten ueber die volle Breite statt in der schmalen Spalte
  const body = side
    ? `<div class="pv-extras-grid"><div class="pv-extras-l">${left.map((u) => u.html).join('')}</div><div class="pv-extras-r">${nutHtml}</div></div>${nutHint ? `<div class="pv-extra pv-extras-hint">${nutHint}</div>` : ''}${src ? src.html : ''}`
    : list.map((u) => u.html).join('');
  return `<div class="pv-extras">${body}</div>`;
}

function pvExtrasHtml(m, nutritionDetail) { return pvExtrasGroupHtml(pvExtrasUnits(m, nutritionDetail)); }

function pvFooter() {
  const t = PDF_CTX;
  const left = [t.bookTitle, t.author].filter(Boolean).join('  /  ') || 'Savora';
  return `<footer class="pv-foot"><span>${pvEsc(left)}</span></footer>`;
}

/* Titelgroesse: feste Groesse (Prise Pop 32 pt, Pur 30 pt, kompakt 28 pt). Lange Titel brechen zwischen Woertern um und der Kopf
   waechst mit. Nur ein sehr langes EINZELNES Wort (das sonst mitten im Wort brechen muesste) bekommt eine kleinere Stufe. */
function pvTitleClass(title) {
  const word = Math.max.apply(null, String(title).split(/\s+/).map((w) => w.length).concat([0]));
  return word > 22 ? 'pv-t-xl' : word > 16 ? 'pv-t-l' : 'pv-t-s';
}

/* Foto: proportional in einer festen Box (normal 58 x 42 mm, kompakt 44 x 28 mm, frame.bw x frame.bh), object-fit: contain,
   kein Beschnitt, keine Maske, keine Farbform dahinter. frame.w x frame.h hat das Seitenverhaeltnis des Fotos. */
function pdfImgTag(imgUrl) {
  return `<img src="${escapeHtml(imgUrl)}" class="pdf-img-cover" style="object-fit:contain;object-position:50% 50%;" alt="">`;
}
function pvPhotoHtml(imgUrl, frame) {
  const bw = frame.bw || frame.w, bh = frame.bh || frame.h;
  return `<div class="pv-photo-wrap" style="width:${bw}mm;height:${bh}mm"><div class="pv-photo" style="width:${frame.w}mm;height:${frame.h}mm">${pdfImgTag(imgUrl)}</div></div>`;
}

/* Kopf einer Fortsetzungsseite: kleiner Rezeptname links, dezente Marke «Fortsetzung · n / total» rechts (beide Stile).
   Die Zaehlung kommt aus pdf.js. Zu lange Titel werden in pdf-layout.js (pdfClampText) auf zwei Zeilen begrenzt. */
function pvPageOfText(n, total) { return `${n} / ${total}`; }
function pvContinuationHead(title, n, total) {
  const label = n > 0 && total > 0 ? `Fortsetzung · ${pvPageOfText(n, total)}` : 'Fortsetzung';
  return `<header class="pv-cont-head"><span>${pvEsc(title)}</span><i>${label}</i></header>`;
}

/* ---------- Eine Rezeptseite (erste Seite und Fortsetzung, gleiche Bausteine) ----------
   ctx: { m, recipe, imgUrl, frame:{w,h,bw,bh}|null, tight, density, detail }
   pg:  { first, n, total, ing:[Einheiten], steps:[Einheiten], extras:[Einheiten] }
   Die Kategorie erscheint nicht mehr im PDF (Vorgabe V2: der Renderer zeigt sie nicht; die Daten bleiben unveraendert). */
function pvDensity(ctx) {
  const d = ctx && ctx.density;
  return d === 'compact' || d === 'compact-columns' || d === 'normal' ? d : (ctx && ctx.tight ? 'compact' : 'normal');
}
function pvHeadHtml(ctx) {
  const m = ctx.m;
  const photo = ctx.imgUrl && ctx.frame ? pvPhotoHtml(ctx.imgUrl, ctx.frame) : '';
  const meta = m.facts.length ? `<p class="pp-meta">${m.facts.map((f) => `<span>${pvEsc(f.short)}</span>`).join('')}</p>` : '';
  return `<header class="pv-head"><div class="pv-head-grid"><div class="pv-head-text"><h1 class="pv-title ${pvTitleClass(m.title)}">${pvEsc(m.title)}</h1>${meta}</div>${photo}</div></header>`;
}
function pvPage(ctx, pg) {
  const tpl = PDF_CTX.tpl, m = ctx.m, density = pvDensity(ctx);
  const photoOn = !!(pg.first && ctx.imgUrl && ctx.frame);
  const cls = ['pv-page', 'pv-recipe', pg.first ? '' : 'pv-cont-page', tpl.cls, density !== 'normal' ? 'pv-tight' : '', photoOn ? 'pv-photo-side' : 'pv-photo-none'].filter(Boolean).join(' ');
  const head = pg.first ? pvHeadHtml(ctx) : pvContinuationHead(m.title, pg.n, pg.total);
  return `<section class="${cls}" lang="de" data-recipe-id="${pvEsc(m.id)}" data-page-kind="${pg.first ? 'recipe' : 'continuation'}" data-density="${density}"${ctx.dense ? ' data-dense="1"' : ''} data-continuation="${pg.first ? 'false' : 'true'}">
    ${head}
    ${pvIngPanel(pg.ing || [], pg.first ? 'Zutaten' : 'Zutaten <span class="pv-cont">· Fortsetzung</span>', density)}
    ${pvStepsHtml(pg.steps || [], 'Zubereitung', !pg.first)}
    ${pvExtrasGroupHtml(pg.extras)}
    ${pvFooter()}
  </section>`;
}
/* Fortsetzungsseite (Kurzform fuer Tests und Altaufrufer) */
function pvContinuationPage(m, ingU, stepU, extrasHtml, tight, ingRight, n, total) {
  return pvPage({ m, recipe: null, imgUrl: null, frame: null, tight: !!tight }, { first: false, n, total, ing: ingU || [], steps: stepU || [], extras: extrasHtml ? [{ key: 'x', html: extrasHtml }] : [] });
}
/* Komplettes einseitiges Rezept (Einseiten-Kandidaten der Seitenplanung). opts: { frame, tight, density, dense }
   dense (v83): letzter Einseiten-Versuch mit engeren Abstaenden und kleinerem Foto; Schriftgroessen bleiben unveraendert. */
function pvRecipePage(m, recipe, imgUrl, opts, nutritionDetail) {
  opts = opts || {};
  const ctx = { m, recipe, imgUrl: imgUrl || null, frame: opts.frame || null, tight: !!opts.tight, density: opts.density, dense: !!opts.dense, detail: nutritionDetail };
  return pvPage(ctx, { first: true, n: 1, total: 1, ing: pvIngredientUnits(m.ingredients), steps: pvStepUnits(m.steps), extras: pvExtrasUnits(m, nutritionDetail) });
}

/* ---------- Inhaltsverzeichnis, Kapitel ----------
   (Das Deckblatt kommt aus cover.js und bleibt unveraendert.) */

/* rows: [{ kind:'chapter', title } | { kind:'recipe', title, page, id }] in Chunks je Seite */
function pvTocPages(rows) {
  const tpl = PDF_CTX.tpl;
  const perPage = 27;
  const chunks = [];
  for (let i = 0; i < rows.length; i += perPage) chunks.push(rows.slice(i, i + perPage));
  if (!chunks.length) chunks.push([]);
  return chunks.map((chunk, n) => `<section class="pv-page pv-toc ${tpl.cls}" data-page-kind="toc">
    <h1 class="pv-toc-title">${n === 0 ? 'Inhalt' : 'Inhalt · Fortsetzung'}</h1>
    <div class="pv-toc-list">${chunk.map((r) => r.kind === 'chapter'
      ? `<div class="pv-toc-chapter">${pvEsc(r.title)}</div>`
      : `<div class="pv-toc-row" data-toc-id="${pvEsc(r.id)}"><span class="pv-toc-name">${pvEsc(r.title)}</span><span class="pv-toc-dots"></span><span class="pv-toc-pg">${r.page}</span></div>`).join('')}</div>
    ${pvFooter()}
  </section>`);
}

function pvChapterPage(title) {
  return `<section class="pv-page pv-chapter ${PDF_CTX.tpl.cls}" data-page-kind="chapter"><div class="pv-chapter-in"><h2 class="pv-chapter-title">${pvEsc(title)}</h2><div class="pv-rule"></div></div></section>`;
}
