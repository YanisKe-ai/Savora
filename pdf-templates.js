/* ---------- PDF-Vorlagen A/B/C und Seitenaufbau ----------
   Drei auswaehlbare Vorlagen mit gemeinsamer Datenbasis und gemeinsamen Bausteinen:
     A  «Klassisch»  (Creme/Gruen, Serifentitel)  Standard fuer neue Kochbuecher
     B  «Kraeftig»   (Violett/Limette, kraeftige Titel)
     C  «Schlicht (zum Drucken)»  (Weiss, sparsam, kleines Bild neben dem Titel)
   Die IDs A, B, C bleiben im Datenmodell; in der Bedienung erscheinen nur die Namen.
   Die Seiten sind reines HTML (Klassen mit Praefix pv-), das in pdf.js gemessen, paginiert und
   gerastert wird. Nichts hier veraendert Rezeptdaten: es wird nur dargestellt.

   Grundregeln: Originalmengen unveraendert (keine Kuechenrundung), leere Bloecke werden nicht
   gezeichnet (Darstellungsbereinigung, Rezept bleibt unveraendert), Fliesstext mind. 10 pt,
   Bilder nie gestreckt. */

const PDF_TEMPLATES = {
  A: { id: 'A', name: 'Klassisch', hint: 'Creme und Grün, Titel in Serifenschrift. Standard.', cls: 'pv-tpl-a', pageNo: [36, 69, 54] },
  B: { id: 'B', name: 'Kräftig', hint: 'Violetter Kopf mit Limetten-Akzent, grosse Titel.', cls: 'pv-tpl-b', pageNo: [64, 32, 95] },
  C: { id: 'C', name: 'Schlicht (zum Drucken)', hint: 'Weiss mit feinen Linien, spart Tinte beim Ausdrucken.', cls: 'pv-tpl-c', pageNo: [52, 60, 53] },
};
const PDF_TEMPLATE_KEY = 'savora-pdf-template';

function pdfTemplateById(id) { return PDF_TEMPLATES[id] || PDF_TEMPLATES.A; }
function pdfDefaultTemplateId() {
  let v = null; try { v = localStorage.getItem(PDF_TEMPLATE_KEY); } catch (e) {}
  return PDF_TEMPLATES[v] ? v : 'A';
}
function pdfRememberTemplate(id) { try { if (PDF_TEMPLATES[id]) localStorage.setItem(PDF_TEMPLATE_KEY, id); } catch (e) {} }

/* Kontext des laufenden Exports (Vorlage, Buchtitel/Autor fuer die Fusszeile) */
let PDF_CTX = { tpl: PDF_TEMPLATES.A, bookTitle: '', author: '', logo: true };

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
  if (raw && qtyIsNumeric(q)) { const d = qtyDisplay(q, i.unit, { fmt: fmtAmount }); return d.text + (d.unit ? ' ' + d.unit : ''); }
  const unit = String(i.unit || '').trim();
  return raw ? raw + (unit ? ' ' + unit : '') : unit;
}

/* pdfClassifyStepText (Hinweise/Quellen als Schritt erkennen) steht jetzt in pdf-model.js. */

function pdfFormatMinutes(m) {
  m = Math.round(Number(m) || 0);
  if (m < 60) return m + ' Min.';
  const h = Math.floor(m / 60), r = m % 60;
  return h + ' Std.' + (r ? ' ' + r + ' Min.' : '');
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
  if (sv) facts.push({ label: pieces ? 'Ergibt' : (sv === 1 ? 'Portion' : 'Portionen'), value: pieces ? sv + '\u00a0' + (recipe.yieldLabel || 'Stück') : String(sv) });
  if (recipe.timeMinutes) facts.push({ label: 'Zeit', value: pdfFormatMinutes(recipe.timeMinutes) });
  if (recipe.prepMinutes) facts.push({ label: 'Vorbereitungszeit', value: pdfFormatMinutes(recipe.prepMinutes) });
  if (recipe.restMinutes) facts.push({ label: 'Ruhen', value: pdfFormatMinutes(recipe.restMinutes) });
  if (recipe.cookMinutes) facts.push({ label: 'Garen/Backen', value: pdfFormatMinutes(recipe.cookMinutes) });
  const basis = pdfNutritionBasis(nutritionResult, pieces);
  const m = {
    id: recipe.id, title: String(recipe.title || 'Ohne Titel').trim(), category: cat.text, categoryKind: cat.kind, categoryAll: cat.all, facts, ingredients, steps, tips,
    source: src.source, sourceText: src.sourceText, sourceUrl: src.sourceUrl, sourceUrlText: src.sourceUrlText, notes, log,
    nutrition: nutritionResult || null, pieces, servings,
    nutritionBasis: basis.basis, nutritionBasisLabel: basis.label, nutritionView: pdfNutritionView(nutritionResult), nutritionNote: pdfNutritionNote(nutritionResult, servings),
  };
  m.warnings = pdfModelWarnings(m);
  return m;
}

/* ---------- Bausteine ---------- */

function pvEsc(s) { return escapeHtml(String(s)); }

/* Zutatenzeile. Modell (neu): { amount (nur Menge + kurze Einheit), name, note, raw, uncertain }.
   Aelteres Modell: amount enthaelt Menge und Einheit, name die Zutat; note/raw fehlen (dann ohne).
   Unsichere Zeilen (uncertain) geben den Originaltext raw vollstaendig in der Namensspalte aus.
   Sehr lange Mengenangaben (> PV_AMT_STACK_CHARS Zeichen) stehen ueber dem Namen statt in der Mengenspalte.
   Zusatzklassen laufen ueber data-Attribute, damit class="pv-ing" fuer die Hoehenschaetzung in pdf.js stabil bleibt. */
const PV_AMT_STACK_CHARS = 12;
function pvIngUnit(it, cont) {
  if (it.type === 'group') return it.show ? `<div class="pv-ing-group">${pvEsc(it.title)}${cont ? ' <span class="pv-cont">· Fortsetzung</span>' : ''}</div>` : '';
  const unsure = !!it.uncertain && String(it.raw || '').trim();
  const amount = unsure ? '' : String(it.amount == null ? '' : it.amount).trim();
  const name = unsure ? String(it.raw).trim() : String(it.name == null ? '' : it.name).trim();
  let note = unsure ? '' : String(it.note || '').trim();
  if (note) note = /^\(/.test(note) ? ' ' + note : /^[,;]/.test(note) ? note : ', ' + note;
  const attrs = (amount.length > PV_AMT_STACK_CHARS ? ' data-stack="1"' : '') + (unsure ? ' data-uncertain="1"' : '');
  return `<div class="pv-ing"${attrs}>${amount ? `<span class="pv-ing-amt">${pvEsc(amount)}</span>` : ''}<span class="pv-ing-name">${pvEsc(name)}${note ? `<span class="pv-ing-note">${pvEsc(note)}</span>` : ''}</span></div>`;
}
function pvStepUnit(s) {
  if (s.type === 'heading') return `<div class="pv-step-heading">${pvEsc(s.text)}</div>`;
  return `<div class="pv-step"><span class="pv-step-no">${String(s.no).padStart(2, '0')}</span><span class="pv-step-text">${pvEsc(s.text)}</span></div>`;
}
/* Spalte ohne jede Mengenangabe: keine leere Mengenspalte */
function pvIngColClass(html, extra) { return 'pv-ing-col' + (extra ? ' ' + extra : '') + (/pv-ing-amt/.test(html) ? '' : ' pv-ing-col-noamt'); }

/* Einheiten fuer den Umbruch (pdf.js fuellt Seite fuer Seite Einheit fuer Einheit):
   - kleine Gruppen (<= 8 Zutaten) bleiben ganz zusammen;
   - bei groesseren Gruppen bildet der Gruppentitel IMMER mit der ersten Zutat eine unteilbare Einheit;
   - Zutaten ohne Gruppentitel davor (aelteres Modell) werden einzeln uebernommen. */
function pvIngredientUnits(ingredients) {
  const units = [];
  let i = 0;
  while (i < ingredients.length) {
    const it = ingredients[i];
    if (it.type === 'group') {
      const rows = [];
      let j = i + 1;
      while (j < ingredients.length && ingredients[j].type === 'ing') { rows.push(ingredients[j]); j++; }
      if (rows.length && rows.length <= 8) {
        units.push({ html: pvIngUnit(it) + rows.map((r) => pvIngUnit(r)).join(''), group: it.title, groupHead: it, first: true, whole: true });
      } else {
        rows.forEach((r, k) => units.push({ html: (k === 0 ? pvIngUnit(it) : '') + pvIngUnit(r), group: it.title, groupHead: it, first: k === 0 }));
      }
      i = j;
    } else { units.push({ html: pvIngUnit(it) }); i++; }
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
      if (j < steps.length) { html += pvStepUnit(steps[j]); i = j; } else i = j - 1;
      units.push({ html });
    } else units.push({ html: pvStepUnit(s) });
  }
  return units;
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
  const cells = [cell('energyKcal', 'Energie'), cell('protein', 'Protein'), cell('carbohydrates', 'Kohlenhydrate'), cell('fat', 'Fett'), cell('fiber', 'Ballaststoffe')];
  if (detailLevel === 'full') cells.push(cell('sugars', 'Zucker'), cell('saturatedFat', 'ges. Fett'), cell('salt', 'Salz'));
  const shown = cells.filter(Boolean);
  if (!shown.length) return '';
  const cols = Math.min(shown.length, detailLevel === 'full' ? 4 : 5);
  const hint = `${pvEsc(nutritionSourceLabel(result.sourceDataVersions))}. Geschätzte Werte, je nach Zutaten und Mengen können sie abweichen. Keine medizinische Aussage.${result.rangeUsed ? ' Menge als Bereich angegeben, Ergebnis als Spanne.' : ''}${result.needsServings ? ' Es fehlt die Angabe, wie viel das Rezept ergibt: Pro-Portion-Werte erst nach Klärung.' : ''}${(result.approximations || []).length ? ' Angenähert: ' + pvEsc(result.approximations.map((a) => a.name).join(', ')) + '.' : ''}${(result.unquantified || []).length ? ' Ohne Mengenangabe nicht eingerechnet: ' + pvEsc(result.unquantified.join(', ')) + '.' : ''}${basisNote ? ' ' + pvEsc(basisNote) : ''}`;
  return `<div class="pv-nutri"><div class="pv-label">Nährwerte</div><div class="pv-nut-basis">${pvEsc(pvNutBasisText(result, pieces, basis))} · geschätzt</div><div class="pv-nut-grid" style="--pv-nut-cols:${cols}">${shown.join('')}</div>
    <div class="pv-small">${hint}</div></div>`;
}

/* Quelle: Text mit anklickbarer URL. Der Link traegt data-pdf-href (nur http/https), das pdf.js als PDF-Link auswerten kann. */
function pvSourceHtml(text, url) {
  const t = String(text || '').replace(/^\s*quelle\s*[:\-–]\s*/i, '').trim();
  const link = (u) => { const clean = u.replace(/[.,;:!?)\]]+$/, ''), tail = u.slice(clean.length); return `<a class="pv-url" href="${escapeHtml(clean)}" data-pdf-href="${escapeHtml(clean)}">${pvEsc(clean)}</a>${pvEsc(tail)}`; };
  let html = '', last = 0, m; const re = /https?:\/\/[^\s<>"']+/gi;
  while ((m = re.exec(t))) { html += pvEsc(t.slice(last, m.index)) + link(m[0]); last = m.index + m[0].length; }
  html += pvEsc(t.slice(last));
  const u = String(url || '').trim();
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
    const box = pvNutritionBox(m.nutrition, nutritionDetail, m.pieces, m.nutritionBasis, m.nutritionNote);
    if (box) out.push({ key: 'nutrition', box });
  }
  const src = pvSourceHtml(m.source, m.sourceUrl);
  if (src) out.push({ key: 'source', box: `<div class="pv-source"><span class="pv-label">Quelle</span><span class="pv-source-text">${src}</span></div>` });
  return out;
}
function pvBlockHtml(b, paras, cont) {
  if (b.box) return `<div class="pv-extra">${b.box}</div>`;
  return `<div class="pv-extra"><div class="${b.cls}"><div class="pv-label">${b.label}${cont ? ' <span class="pv-cont">· Fortsetzung</span>' : ''}</div>${(paras || b.paras).join('')}</div></div>`;
}
function pvExtrasHtml(m, nutritionDetail) {
  return pvExtrasBlocks(m, nutritionDetail).map((b) => pvBlockHtml(b)).join('');
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

function pvFooter() {
  const t = PDF_CTX;
  const left = [t.bookTitle, t.author].filter(Boolean).join('  /  ') || 'Savora';
  return `<footer class="pv-foot"><span>${pvEsc(left)}</span></footer>`;
}

function pvTitleClass(title) { return title.length <= 20 ? 'pv-t-s' : title.length <= 36 ? 'pv-t-m' : title.length <= 60 ? 'pv-t-l' : 'pv-t-xl'; }

function pdfImgTag(imgUrl, recipe) {
  const fp = recipe && recipe.focalPoint;
  const x = fp && typeof fp.x === 'number' ? Math.round(fp.x * 100) : 50;
  const y = fp && typeof fp.y === 'number' ? Math.round(fp.y * 100) : 50;
  return `<img src="${escapeHtml(imgUrl)}" class="pdf-img-cover" style="object-position:${x}% ${y}%;" alt="">`;
}

/* Kopf einer Fortsetzungsseite: Rezeptname links, «Fortsetzung · n von total» rechts.
   Ohne total (Standard) steht nur «Fortsetzung». Die Zaehlung und der reservierte Bereich kommen aus pdf.js. */
function pvContinuationHead(title, n, total) {
  const label = n > 0 && total > 0 ? `Fortsetzung · ${n} von ${total}` : 'Fortsetzung';
  return `<header class="pv-cont-head"><span>${pvEsc(title)}</span><i>${label}</i></header>`;
}

/* ---------- Seite 1 eines Rezepts ----------
   opts: { photo: 'band'|'side'|'none', bandMm, side: {w,h}, tight, ingUnits, stepUnits, extras } */
function pvRecipePage(m, recipe, imgUrl, opts, nutritionDetail) {
  const tpl = PDF_CTX.tpl;
  const photoMode = imgUrl ? opts.photo : 'none';
  const cls = ['pv-page', 'pv-recipe', tpl.cls, opts.tight ? 'pv-tight' : '', 'pv-photo-' + photoMode].filter(Boolean).join(' ');
  const photoBand = photoMode === 'band' ? `<div class="pv-photo pv-photo-band" style="height:${opts.bandMm}mm">${pdfImgTag(imgUrl, recipe)}</div>` : '';
  const photoSide = photoMode === 'side' ? `<div class="pv-photo pv-photo-side" style="width:${opts.side.w}mm;height:${opts.side.h}mm">${pdfImgTag(imgUrl, recipe)}</div>` : '';
  const facts = m.facts.length ? `<div class="pv-facts">${m.facts.map((f) => `<span class="pv-fact"><b>${pvEsc(f.value)}</b><i>${pvEsc(f.label)}</i></span>`).join('')}</div>` : '';
  const head = `<header class="pv-head ${photoSide ? 'pv-head-side' : ''}">
      <div class="pv-head-text">
        ${m.category ? `<div class="pv-cat">${pvEsc(m.category)}</div>` : ''}
        <h1 class="pv-title ${pvTitleClass(m.title)}">${pvEsc(m.title)}</h1>
        ${photoSide ? facts : ''}
      </div>
      ${photoSide}
    </header>`;
  const ingHtml = (opts.ingUnits || pvIngredientUnits(m.ingredients)).map((u) => u.html).join('');
  const stepHtml = (opts.stepUnits || pvStepUnits(m.steps)).map((u) => u.html).join('');
  const single = !ingHtml;
  const body = `<div class="pv-body ${single ? 'pv-body-single' : ''}">
      ${ingHtml ? `<aside class="${pvIngColClass(ingHtml)}"><div class="pv-label">Zutaten</div>${ingHtml}</aside>` : ''}
      ${stepHtml ? `<div class="pv-steps-col"><div class="pv-label">Zubereitung</div>${stepHtml}</div>` : ''}
    </div>`;
  const extras = opts.extras === false ? '' : pvExtrasHtml(m, nutritionDetail);
  return `<section class="${cls}" lang="de" data-recipe-id="${pvEsc(m.id)}" data-page-kind="recipe">
    ${head}
    ${photoBand}
    ${!photoSide ? facts : ''}
    ${body}
    ${extras ? `<div class="pv-extras">${extras}</div>` : ''}
    ${pvFooter()}
  </section>`;
}

/* Fortsetzungsseite: kleiner Kopf, dann Spalten bzw. eine volle Spalte */
function pvContinuationPage(m, ingUnits, stepUnits, extrasHtml, tight, ingRight, n, total) {
  const tpl = PDF_CTX.tpl;
  const cls = ['pv-page', 'pv-recipe', 'pv-cont-page', tpl.cls, tight ? 'pv-tight' : ''].filter(Boolean).join(' ');
  const ingHtml = ingUnits.map((u, i) => (i === 0 && u.group && !u.first && !u.whole ? pvIngUnit(u.groupHead || { type: 'group', title: u.group, show: true }, true) : '') + u.html).join('');
  const stepHtml = stepUnits.map((u) => u.html).join('');
  const single = !ingHtml && !(ingRight && ingRight.length);
  return `<section class="${cls}" lang="de" data-recipe-id="${pvEsc(m.id)}" data-page-kind="continuation">
    ${pvContinuationHead(m.title, n, total)}
    <div class="pv-body ${single ? 'pv-body-single' : ''}">
      ${ingHtml ? `<aside class="${pvIngColClass(ingHtml)}"><div class="pv-label">Zutaten · Fortsetzung</div>${ingHtml}</aside>` : ''}
      ${stepHtml ? `<div class="pv-steps-col"><div class="pv-label">Zubereitung · Fortsetzung</div>${stepHtml}</div>` : ''}
      ${ingRight && ingRight.length ? `<aside class="${pvIngColClass(ingRight.map((u) => u.html).join(''), 'pv-ing-col-2')}">${ingRight.map((u) => u.html).join('')}</aside>` : ''}
    </div>
    ${extrasHtml ? `<div class="pv-extras">${extrasHtml}</div>` : ''}
    ${pvFooter()}
  </section>`;
}

/* ---------- Deckblatt, Inhaltsverzeichnis, Kapitel ---------- */

function pvCoverPage(title, author, coverImgUrl, subtitle) {
  const tpl = PDF_CTX.tpl;
  const logo = PDF_CTX.logo ? wordmarkSvg('pv-cover-logo') : '';
  return `<section class="pv-page pv-cover ${tpl.cls} ${coverImgUrl ? 'pv-cover-photo' : ''}" data-page-kind="cover">
    ${coverImgUrl ? `<div class="pv-cover-img"><img src="${escapeHtml(coverImgUrl)}" class="pdf-img-cover" alt=""></div>` : ''}
    <div class="pv-cover-text">
      <div class="pv-cat">Kochbuch</div>
      <h1 class="pv-cover-title ${title.length > 28 ? 'pv-t-l' : 'pv-t-m'}">${pvEsc(title)}</h1>
      <div class="pv-cover-rule"></div>
      ${subtitle ? `<p class="pv-cover-sub">${pvEsc(subtitle)}</p>` : ''}
      ${author ? `<p class="pv-cover-author">${pvEsc(author)}</p>` : ''}
    </div>
    ${logo}
  </section>`;
}

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
  return `<section class="pv-page pv-chapter ${PDF_CTX.tpl.cls}" data-page-kind="chapter"><div class="pv-chapter-in"><div class="pv-cat">Kapitel</div><h2 class="pv-chapter-title">${pvEsc(title)}</h2><div class="pv-cover-rule"></div></div></section>`;
}
