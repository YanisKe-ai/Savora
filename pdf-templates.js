/* ---------- PDF-Vorlagen A/B/C und Seitenaufbau ----------
   Drei auswaehlbare Vorlagen mit gemeinsamer Datenbasis und gemeinsamen Bausteinen:
     A  Warm Editorial  (Creme/Gruen, Serifentitel)  Standard fuer neue Kochbuecher
     B  Bold Kitchen    (Violett/Limette, kraeftige Titel)
     C  Kuechenblatt    (Weiss, sparsam, Druckvariante, kleines Bild neben dem Titel)
   Die Seiten sind reines HTML (Klassen mit Praefix pv-), das in pdf.js gemessen, paginiert und
   gerastert wird. Nichts hier veraendert Rezeptdaten: es wird nur dargestellt.

   Grundregeln: Originalmengen unveraendert (keine Kuechenrundung), leere Bloecke werden nicht
   gezeichnet (Darstellungsbereinigung, Rezept bleibt unveraendert), Fliesstext mind. 10 pt,
   Bilder nie gestreckt. */

const PDF_TEMPLATES = {
  A: { id: 'A', name: 'Warm Editorial', hint: 'Creme und Grün, Serifentitel. Standard.', cls: 'pv-tpl-a', pageNo: [36, 69, 54] },
  B: { id: 'B', name: 'Bold Kitchen', hint: 'Violett mit Limetten-Akzent, kräftige Titel.', cls: 'pv-tpl-b', pageNo: [64, 32, 95] },
  C: { id: 'C', name: 'Küchenblatt', hint: 'Weiss, sparsam, gut zum Drucken.', cls: 'pv-tpl-c', pageNo: [52, 60, 53] },
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
  if (qtyIsNumeric(q)) return qtyFormat(q, i.unit, fmtAmount);   // exakt oder Bereich, beide Grenzen
  return raw;                                                    // "etwas", mehrdeutige oder freie Angaben unveraendert
}

/* Hinweise/Quellen, die als Schritt gespeichert wurden, gehoeren nicht in die nummerierte Anleitung.
   Nur eindeutige Anfaenge werden so behandelt (sonst bleibt es ein Schritt). */
function pdfClassifyStepText(text) {
  const t = String(text || '').trim();
  if (/^(quelle|source|rezept (von|nach)|fotos?)\s*[:\-–]/i.test(t) || (/^quelle\b/i.test(t) && t.length < 140)) return 'source';
  if (/^(tipp|tipps|küchentipp|hinweis|hinweise|aufbewahrung|aufbewahren|haltbarkeit|haltbar|einfrieren|vorbereiten\s*\/\s*einfrieren|vorbereiten und einfrieren|variante|varianten)\b/i.test(t)) return 'tip';
  return 'step';
}

function pdfFormatMinutes(m) {
  m = Math.round(Number(m) || 0);
  if (m < 60) return m + ' Min.';
  const h = Math.floor(m / 60), r = m % 60;
  return h + ' Std.' + (r ? ' ' + r + ' Min.' : '');
}

function pdfBuildModel(recipe, nutritionResult) {
  const groups = getIngredientGroups(recipe);
  const showGroupTitles = groups.length > 1 || (groups[0] && groups[0].title !== 'Zutaten');
  const ingredients = [];
  groups.forEach((g) => {
    ingredients.push({ type: 'group', title: g.title, show: showGroupTitles, size: g.ingredients.length });
    g.ingredients.forEach((i) => {
      const amt = pdfAmountText(i);
      const unit = String(i.unit || '').trim();
      ingredients.push({ type: 'ing', group: g.title, amount: amt ? amt + (unit ? ' ' + unit : '') : unit, name: String(i.name || '').trim() });
    });
  });

  const steps = []; const tips = []; let source = '';
  const entries = stepEntries(recipe);
  entries.forEach((e, idx) => {
    if (e.heading) {
      // Zwischentitel nur zeichnen, wenn danach echter Inhalt folgt (sonst leere Ueberschrift)
      const next = entries[idx + 1];
      if (next && !next.heading) steps.push({ type: 'heading', text: String(e.text).trim().replace(/:$/, '') });
      return;
    }
    const kind = pdfClassifyStepText(e.text);
    if (kind === 'source') { source = source ? source + ' · ' + String(e.text).trim() : String(e.text).trim(); return; }
    if (kind === 'tip') { tips.push(String(e.text).trim()); return; }
    steps.push({ type: 'step', text: String(e.text).trim() });
  });
  let n = 0; steps.forEach((s) => { if (s.type === 'step') s.no = ++n; });

  const rs = recipe.source;
  const sourceField = rs ? (typeof rs === 'string' ? rs : (rs.title || rs.url || rs.name || '')) : '';
  const cat = (recipe.categoryTags || [])[0] || (recipe.tags || [])[0] || '';
  const log = (recipe.cookLog || []).filter((x) => x && String(x.text || '').trim());
  const facts = [];
  const sv = Number(recipe.servings) || 0;
  const pieces = servingMode(recipe) === 'pieces';
  if (sv) facts.push({ label: pieces ? 'Ergibt' : (sv === 1 ? 'Portion' : 'Portionen'), value: pieces ? sv + '\u00a0' + (recipe.yieldLabel || 'Stück') : String(sv) });
  if (recipe.timeMinutes) facts.push({ label: 'Zeit', value: pdfFormatMinutes(recipe.timeMinutes) });
  if (recipe.prepMinutes) facts.push({ label: 'Aktiv', value: pdfFormatMinutes(recipe.prepMinutes) });
  if (recipe.restMinutes) facts.push({ label: 'Ruhen', value: pdfFormatMinutes(recipe.restMinutes) });
  if (recipe.cookMinutes) facts.push({ label: 'Garen/Backen', value: pdfFormatMinutes(recipe.cookMinutes) });
  return {
    id: recipe.id, title: String(recipe.title || 'Ohne Titel').trim(), category: cat, facts, ingredients, steps, tips,
    source: [sourceField, source].filter(Boolean).join(' · '), notes: String(recipe.notes || '').trim(), log,
    nutrition: nutritionResult || null, pieces,
  };
}

/* ---------- Bausteine ---------- */

function pvEsc(s) { return escapeHtml(String(s)); }

function pvIngUnit(it, cont) {
  if (it.type === 'group') return it.show ? `<div class="pv-ing-group">${pvEsc(it.title)}${cont ? ' <span class="pv-cont">· Fortsetzung</span>' : ''}</div>` : '';
  return `<div class="pv-ing"><span class="pv-ing-amt">${pvEsc(it.amount)}</span><span class="pv-ing-name">${pvEsc(it.name)}</span></div>`;
}
function pvStepUnit(s) {
  if (s.type === 'heading') return `<div class="pv-step-heading">${pvEsc(s.text)}</div>`;
  return `<div class="pv-step"><span class="pv-step-no">${String(s.no).padStart(2, '0')}</span><span class="pv-step-text">${pvEsc(s.text)}</span></div>`;
}

/* Kleine Komponenten (<= 8 Zutaten) bleiben zusammen; Ueberschrift nie allein am Ende. */
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
        units.push({ html: pvIngUnit(it) + rows.map((r) => pvIngUnit(r)).join(''), group: it.title, whole: true });
      } else {
        rows.forEach((r, k) => units.push({ html: (k === 0 ? pvIngUnit(it) : '') + pvIngUnit(r), group: it.title, groupHead: it, first: k === 0 }));
      }
      i = j;
    } else i++;
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

function pvNutritionBox(result, detailLevel, pieces) {
  if (!result) return '';
  const total = !!result.needsServings;   // Ausbeute unbekannt: Gesamtwerte statt Pro-Portion
  const cell = (key, label) => {
    const def = NUTRIENT_KEYS[key];
    const v = typeof nutValueText === 'function' ? nutValueText(result, total ? 'total' : 'portion', key) : (result.nutrientsPerPortion[key] === null ? null : String(result.nutrientsPerPortion[key]).replace('.', ','));
    return v === null || v === undefined ? '' : `<span><b>${pvEsc(v)}</b> ${pvEsc(def.unit)} ${pvEsc(label || def.label)}</span>`;
  };
  const rows = [cell('energyKcal', 'Energie'), cell('protein', 'Protein'), cell('carbohydrates', 'Kohlenhydrate'), cell('fat', 'Fett'), cell('fiber', 'Ballaststoffe')];
  if (detailLevel === 'full') rows.push(cell('sugars', 'Zucker'), cell('saturatedFat', 'ges. Fett'), cell('salt', 'Salz'));
  return `<div class="pv-nutri"><div class="pv-label">Nährwerte ${total ? 'gesamt' : pieces ? 'pro Stück' : 'pro Portion'}, geschätzt</div><div class="pv-nutri-row">${rows.filter(Boolean).join('')}</div>
    <div class="pv-small">${pvEsc(nutritionSourceLabel(result.sourceDataVersions))}. Schätzwerte, keine medizinische Aussage.${result.rangeUsed ? ' Menge als Bereich angegeben, Ergebnis als Spanne.' : ''}${result.needsServings ? ' Ausbeute unbekannt: Pro-Portion-Werte erst nach Klärung.' : ''}${(result.approximations || []).length ? ' Angenähert: ' + pvEsc(result.approximations.map((a) => a.name).join(', ')) + '.' : ''}${(result.unquantified || []).length ? ' Ohne Mengenangabe nicht eingerechnet: ' + pvEsc(result.unquantified.join(', ')) + '.' : ''}</div></div>`;
}

function pvExtrasHtml(m, nutritionDetail) {
  const parts = [];
  if (m.tips.length) parts.push(`<div class="pv-tips"><div class="pv-label">${m.tips.length > 1 ? 'Hinweise' : 'Hinweis'}</div>${m.tips.map((t) => `<p>${pvEsc(t)}</p>`).join('')}</div>`);
  if (m.notes || m.log.length) {
    const logHtml = m.log.map((n) => `<p><b>${pvEsc(new Date(n.date).toLocaleDateString('de-CH'))}:</b> ${pvEsc(n.text)}</p>`).join('');
    parts.push(`<div class="pv-notes"><div class="pv-label">Notizen</div>${m.notes ? `<p>${pvEsc(m.notes)}</p>` : ''}${logHtml}</div>`);
  }
  if (m.nutrition && nutritionDetail && nutritionDetail !== 'off') parts.push(pvNutritionBox(m.nutrition, nutritionDetail, m.pieces));
  if (m.source) parts.push(`<div class="pv-source"><span class="pv-label">Quelle</span> ${pvEsc(m.source.replace(/^\s*quelle\s*[:\-–]\s*/i, ''))}</div>`);
  return parts.map((h) => `<div class="pv-extra">${h}</div>`).join('');
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
  return `<img src="${imgUrl}" class="pdf-img-cover" style="object-position:${x}% ${y}%;" alt="">`;
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
      ${ingHtml ? `<aside class="pv-ing-col"><div class="pv-label">Zutaten</div>${ingHtml}</aside>` : ''}
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
function pvContinuationPage(m, ingUnits, stepUnits, extrasHtml, tight, ingRight) {
  const tpl = PDF_CTX.tpl;
  const cls = ['pv-page', 'pv-recipe', 'pv-cont-page', tpl.cls, tight ? 'pv-tight' : ''].filter(Boolean).join(' ');
  const ingHtml = ingUnits.map((u, i) => (i === 0 && u.group && !u.first && !u.whole ? pvIngUnit(u.groupHead || { type: 'group', title: u.group, show: true }, true) : '') + u.html).join('');
  const stepHtml = stepUnits.map((u) => u.html).join('');
  const single = !ingHtml && !(ingRight && ingRight.length);
  return `<section class="${cls}" lang="de" data-recipe-id="${pvEsc(m.id)}" data-page-kind="continuation">
    <header class="pv-cont-head"><span>${pvEsc(m.title)}</span><i>Fortsetzung</i></header>
    <div class="pv-body ${single ? 'pv-body-single' : ''}">
      ${ingHtml ? `<aside class="pv-ing-col"><div class="pv-label">Zutaten · Fortsetzung</div>${ingHtml}</aside>` : ''}
      ${stepHtml ? `<div class="pv-steps-col"><div class="pv-label">Zubereitung · Fortsetzung</div>${stepHtml}</div>` : ''}
      ${ingRight && ingRight.length ? `<aside class="pv-ing-col pv-ing-col-2">${ingRight.map((u) => u.html).join('')}</aside>` : ''}
    </div>
    ${extrasHtml ? `<div class="pv-extras">${extrasHtml}</div>` : ''}
    ${pvFooter()}
  </section>`;
}

/* ---------- Deckblatt, Inhaltsverzeichnis, Kapitel ---------- */

function pvCoverPage(title, author, coverImgUrl, subtitle) {
  const tpl = PDF_CTX.tpl;
  const logo = PDF_CTX.logo ? `<img class="pv-cover-logo" src="icon-96.png" alt="">` : '';
  return `<section class="pv-page pv-cover ${tpl.cls} ${coverImgUrl ? 'pv-cover-photo' : ''}" data-page-kind="cover">
    ${coverImgUrl ? `<div class="pv-cover-img"><img src="${coverImgUrl}" class="pdf-img-cover" alt=""></div>` : ''}
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
