/* ---------- Versionierter JSON-Import fuer EIN Rezept (Format "savora-recipe", Version 1) ----------
   Eine externe KI liest einen Rezeptlink und liefert dieses JSON. Hier wird es erkannt, streng
   geprueft und in einen Rezeptentwurf umgewandelt. Nichts wird erfunden: fehlende Werte bleiben
   leer bzw. 0 (= unbekannt). Beschreibung des Formats: docs/KI-IMPORT.md

   Oeffentlich: extractRecipeJson(text), looksLikeRecipeJson(text), validateRecipeJson(obj), parseRecipeJson(textOderObjekt)
   Ergebnis von parseRecipeJson: { ok, errors:[{path,message}], warnings:[{path,message}], recipe: Entwurf|null } */

const RJ_FORMAT = 'savora-recipe';
const RJ_VERSION = 1;
const RJ_DIFFICULTIES = ['einfach', 'mittel', 'anspruchsvoll'];

/* Erstes vollstaendiges {...} ab Position start (Strings und Escapes werden beachtet) oder null */
function rjBalancedObject(text, start) {
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return null;
}
function rjParses(s) { try { JSON.parse(s); return true; } catch (e) { return false; } }

/* JSON aus Freitext holen: ```json ...``` oder ``` ... ``` oder rohes Objekt mit Text davor/danach. String oder null. */
function extractRecipeJson(text) {
  const t = String(text == null ? '' : text);
  if (!t.trim()) return null;
  const fence = /```[ \t]*(?:json|JSON)?[ \t]*\r?\n?([\s\S]*?)```/g;
  let m, firstFenceWithBrace = null;
  while ((m = fence.exec(t))) {
    const body = m[1].trim();
    if (body.indexOf('{') < 0) continue;
    if (rjParses(body)) return body;
    if (!firstFenceWithBrace) firstFenceWithBrace = body;
  }
  if (firstFenceWithBrace) return firstFenceWithBrace;
  let firstCandidate = null;
  for (let i = t.indexOf('{'); i >= 0; i = t.indexOf('{', i + 1)) {
    const cand = rjBalancedObject(t, i);
    if (!cand) continue;
    if (rjParses(cand)) return cand;
    if (!firstCandidate) firstCandidate = cand;
  }
  return firstCandidate;
}

/* Ist das eher ein Savora-JSON als Freitext? */
function looksLikeRecipeJson(text) {
  const t = String(text == null ? '' : text);
  if (/["']savora-recipe["']/.test(t)) return true;
  const s = extractRecipeJson(t);
  if (!s) return false;
  try {
    const o = JSON.parse(s);
    return !!o && typeof o === 'object' && !Array.isArray(o) && 'title' in o && 'ingredients' in o;
  } catch (e) { return false; }
}

function rjIsObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function rjIsNum(v) { return typeof v === 'number' && isFinite(v); }
function rjType(v) { return v === null ? 'null' : Array.isArray(v) ? 'eine Liste' : typeof v === 'string' ? 'Text' : typeof v === 'number' ? 'eine Zahl' : typeof v === 'boolean' ? 'ja/nein' : rjIsObj(v) ? 'ein Objekt' : typeof v; }
function rjFmt(n) { return String(Math.round(n * 1e6) / 1e6).replace('.', ','); }

/* Prueft das geparste Objekt. Liefert { errors, warnings } */
function validateRecipeJson(o) {
  const errors = [], warnings = [];
  const err = (path, message) => errors.push({ path, message });
  const warn = (path, message) => warnings.push({ path, message });
  if (!rjIsObj(o)) { err('', 'Das JSON muss ein einzelnes Rezept-Objekt sein, nicht ' + rjType(o) + '.'); return { errors, warnings }; }
  if (o.format !== RJ_FORMAT) err('format', 'Feld "format" fehlt oder ist falsch: erwartet "' + RJ_FORMAT + '"' + (o.format === undefined ? '' : ', gefunden ' + JSON.stringify(o.format)) + '.');
  if (o.version !== RJ_VERSION) {
    if (rjIsNum(o.version) && o.version > RJ_VERSION) err('version', 'Dieses Rezept hat die Formatversion ' + o.version + '. Diese Savora-Version versteht nur Version ' + RJ_VERSION + '. Bitte Savora aktualisieren oder das Rezept im Format Version ' + RJ_VERSION + ' erzeugen.');
    else err('version', 'Feld "version" fehlt oder ist unbekannt: erwartet ' + RJ_VERSION + (o.version === undefined ? '' : ', gefunden ' + JSON.stringify(o.version)) + '.');
  }
  if (typeof o.title !== 'string') err('title', o.title == null ? 'Der Titel fehlt.' : 'Der Titel muss Text sein, ist aber ' + rjType(o.title) + '.');
  else if (!o.title.trim()) err('title', 'Der Titel ist leer.');

  // Ausbeute
  if (o.yield != null) {
    if (!rjIsObj(o.yield)) err('yield', 'Ausbeute muss ein Objekt oder null sein, ist aber ' + rjType(o.yield) + '.');
    else {
      const y = o.yield;
      if (!(typeof y.count === 'number' && Number.isInteger(y.count) && y.count > 0)) err('yield.count', 'Ausbeute: "count" muss eine ganze Zahl größer 0 sein' + (y.count === undefined ? ' (fehlt).' : ', gefunden ' + JSON.stringify(y.count) + '.'));
      if (y.kind !== 'pieces' && y.kind !== 'portions') err('yield.kind', 'Ausbeute: "kind" muss "pieces" oder "portions" sein' + (y.kind === undefined ? ' (fehlt).' : ', gefunden ' + JSON.stringify(y.kind) + '.'));
      if (y.label != null && typeof y.label !== 'string') err('yield.label', 'Ausbeute: "label" muss Text oder null sein.');
    }
  }

  // Zeiten
  const times = {};
  if (o.time != null) {
    if (!rjIsObj(o.time)) err('time', 'Zeitangaben müssen ein Objekt oder null sein, sind aber ' + rjType(o.time) + '.');
    else [['totalMinutes', 'Gesamtzeit'], ['activeMinutes', 'Aktive Zeit'], ['restMinutes', 'Ruhezeit'], ['cookMinutes', 'Garzeit']].forEach(([k, label]) => {
      const v = o.time[k];
      if (v == null) return;
      if (!(typeof v === 'number' && Number.isInteger(v) && v >= 0)) err('time.' + k, label + ' ("' + k + '") muss eine ganze Zahl ab 0 oder null sein, gefunden ' + JSON.stringify(v) + '.');
      else times[k] = v;
    });
    if (times.totalMinutes != null) {
      if (times.cookMinutes != null && times.totalMinutes < times.cookMinutes) warn('time.totalMinutes', 'Die Gesamtzeit (' + times.totalMinutes + ' Min.) ist kleiner als die Garzeit (' + times.cookMinutes + ' Min.). Bitte prüfen.');
      if (times.activeMinutes != null && times.totalMinutes < times.activeMinutes) warn('time.totalMinutes', 'Die Gesamtzeit (' + times.totalMinutes + ' Min.) ist kleiner als die aktive Zeit (' + times.activeMinutes + ' Min.). Bitte prüfen.');
      if (times.restMinutes != null && times.totalMinutes < times.restMinutes) warn('time.totalMinutes', 'Die Gesamtzeit (' + times.totalMinutes + ' Min.) ist kleiner als die Ruhezeit (' + times.restMinutes + ' Min.). Bitte prüfen.');
    }
  }

  if (o.difficulty != null && RJ_DIFFICULTIES.indexOf(o.difficulty) < 0) err('difficulty', 'Schwierigkeit muss "einfach", "mittel", "anspruchsvoll" oder null sein, gefunden ' + JSON.stringify(o.difficulty) + '.');

  if (o.source != null) {
    if (!rjIsObj(o.source)) err('source', 'Quelle muss ein Objekt oder null sein, ist aber ' + rjType(o.source) + '.');
    else {
      if (o.source.url != null && typeof o.source.url !== 'string') err('source.url', 'Quelle: "url" muss Text sein.');
      else if (typeof o.source.url === 'string' && o.source.url.trim() && !/^https?:\/\/\S+$/i.test(o.source.url.trim())) warn('source.url', 'Quelle: "' + o.source.url + '" ist keine gültige Web-Adresse (http oder https) und wird nicht übernommen.');
      if (o.source.name != null && typeof o.source.name !== 'string') err('source.name', 'Quelle: "name" muss Text sein.');
    }
  }

  // Zutaten
  if (!Array.isArray(o.ingredients)) err('ingredients', 'Zutaten müssen eine Liste sein' + (o.ingredients == null ? ' (fehlt).' : ', ist aber ' + rjType(o.ingredients) + '.'));
  else {
    if (!o.ingredients.length) warn('ingredients', 'Das Rezept hat keine Zutaten.');
    o.ingredients.forEach((ing, i) => {
      const p = 'ingredients[' + i + ']', pre = 'Zutat ' + (i + 1) + ': ';
      if (!rjIsObj(ing)) { err(p, pre + 'muss ein Objekt sein, ist aber ' + rjType(ing) + '.'); return; }
      if (typeof ing.name !== 'string' || !ing.name.trim()) err(p + '.name', pre + 'Der Name fehlt oder ist leer.');
      if (ing.unit != null && typeof ing.unit !== 'string') err(p + '.unit', pre + 'Einheit muss Text oder null sein.');
      if (ing.group != null && typeof ing.group !== 'string') err(p + '.group', pre + 'Gruppe muss Text oder null sein.');
      if (ing.note != null && typeof ing.note !== 'string') err(p + '.note', pre + 'Hinweis ("note") muss Text oder null sein.');
      if (ing.optional != null && typeof ing.optional !== 'boolean') err(p + '.optional', pre + '"optional" muss true oder false sein, gefunden ' + JSON.stringify(ing.optional) + '.');
      const a = ing.amount;
      if (a == null) return;
      if (!rjIsObj(a)) { err(p + '.amount', pre + 'Menge muss ein Objekt oder null sein, ist aber ' + rjType(a) + '.'); return; }
      if (a.type !== 'exact' && a.type !== 'range' && a.type !== 'qualitative') { err(p + '.amount.type', pre + 'Menge: "type" muss "exact", "range" oder "qualitative" sein, gefunden ' + JSON.stringify(a.type) + '.'); return; }
      const hasExact = 'value' in a, hasRange = 'min' in a || 'max' in a, hasText = 'text' in a;
      if (a.type === 'exact') {
        if (hasRange) err(p + '.amount', pre + 'Menge ist exakt, enthält aber auch einen Bereich (min/max). Es darf nur eines von beiden sein.');
        if (!rjIsNum(a.value)) err(p + '.amount.value', pre + 'Menge: "value" muss eine Zahl sein' + (a.value === undefined ? ' (fehlt).' : ', gefunden ' + JSON.stringify(a.value) + (typeof a.value === 'string' ? ' (Text statt Zahl).' : '.')));
        else if (a.value < 0) err(p + '.amount.value', pre + 'Menge: "value" darf nicht negativ sein (' + rjFmt(a.value) + ').');
      } else if (a.type === 'range') {
        if (hasExact) err(p + '.amount', pre + 'Menge ist ein Bereich, enthält aber auch einen exakten Wert ("value"). Es darf nur eines von beiden sein.');
        let ok = true;
        ['min', 'max'].forEach(k => {
          if (!rjIsNum(a[k])) { ok = false; err(p + '.amount.' + k, pre + 'Menge: "' + k + '" muss eine Zahl sein' + (a[k] === undefined ? ' (fehlt).' : ', gefunden ' + JSON.stringify(a[k]) + (typeof a[k] === 'string' ? ' (Text statt Zahl).' : '.'))); }
          else if (a[k] < 0) { ok = false; err(p + '.amount.' + k, pre + 'Menge: "' + k + '" darf nicht negativ sein (' + rjFmt(a[k]) + ').'); }
        });
        if (ok && a.min > a.max) err(p + '.amount', pre + 'Menge ist ein Bereich, aber max (' + rjFmt(a.max) + ') ist kleiner als min (' + rjFmt(a.min) + ').');
        else if (ok && a.min === a.max) warn(p + '.amount', pre + 'Der Bereich hat gleiche Grenzen (' + rjFmt(a.min) + ') und wird als exakte Menge übernommen.');
      } else {
        if (hasExact || hasRange) err(p + '.amount', pre + 'Menge ist qualitativ, enthält aber auch Zahlen. Es darf nur "text" gesetzt sein.');
        if (typeof a.text !== 'string' || !a.text.trim()) err(p + '.amount.text', pre + 'Menge: "text" fehlt oder ist leer.');
      }
      if (a.type !== 'qualitative' && hasText) warn(p + '.amount.text', pre + 'Menge: "text" wird bei dieser Mengenart ignoriert.');
    });
  }

  // Schritte
  if (!Array.isArray(o.steps)) err('steps', 'Schritte müssen eine Liste sein' + (o.steps == null ? ' (fehlt).' : ', ist aber ' + rjType(o.steps) + '.'));
  else {
    if (!o.steps.length) warn('steps', 'Das Rezept hat keine Schritte.');
    o.steps.forEach((st, i) => {
      const p = 'steps[' + i + ']', pre = 'Schritt ' + (i + 1) + ': ';
      if (!rjIsObj(st)) { err(p, pre + 'muss ein Objekt mit "text" sein, ist aber ' + rjType(st) + '.'); return; }
      if (typeof st.text !== 'string' || !st.text.trim()) err(p + '.text', pre + 'Der Text fehlt oder ist leer.');
      if (st.variants != null) {
        if (!Array.isArray(st.variants)) err(p + '.variants', pre + '"variants" muss eine Liste sein.');
        else st.variants.forEach((v, j) => {
          if (!rjIsObj(v)) { err(p + '.variants[' + j + ']', pre + 'Variante ' + (j + 1) + ' muss ein Objekt mit "label" und "text" sein.'); return; }
          if (typeof v.label !== 'string' || !v.label.trim()) err(p + '.variants[' + j + '].label', pre + 'Variante ' + (j + 1) + ': "label" fehlt oder ist leer.');
          if (typeof v.text !== 'string' || !v.text.trim()) err(p + '.variants[' + j + '].text', pre + 'Variante ' + (j + 1) + ': "text" fehlt oder ist leer.');
        });
      }
    });
  }

  // Notizen
  if (o.notes != null) {
    if (Array.isArray(o.notes)) { o.notes.forEach((n, i) => { if (typeof n !== 'string') err('notes[' + i + ']', 'Notiz ' + (i + 1) + ' muss Text sein, ist aber ' + rjType(n) + '.'); }); }
    else if (typeof o.notes !== 'string') err('notes', 'Notizen müssen Text oder eine Liste von Texten sein, sind aber ' + rjType(o.notes) + '.');
  }
  return { errors, warnings };
}

/* Gepruefte Daten -> Rezeptentwurf (nur aufrufen, wenn keine Fehler vorliegen) */
function rjBuildDraft(o) {
  const r = typeof emptyRecipe === 'function' ? emptyRecipe() : { id: 'draft-' + Date.now() };   // neue id, keine fremden Felder
  r.title = o.title.trim();
  const y = o.yield;
  r.servings = y ? y.count : 0;   // 0 = unbekannt, kein Standardwert
  r.servingMode = y ? y.kind : 'portions';
  if (y && typeof y.label === 'string' && y.label.trim()) r.yieldLabel = y.label.trim();
  const t = (o.time && typeof o.time === 'object') ? o.time : {};
  r.timeMinutes = t.totalMinutes != null ? t.totalMinutes : 0;
  if (t.activeMinutes != null) r.prepMinutes = t.activeMinutes;
  if (t.restMinutes != null) r.restMinutes = t.restMinutes;
  if (t.cookMinutes != null) r.cookMinutes = t.cookMinutes;
  r.difficulty = o.difficulty || '';
  r.source = (o.source && typeof o.source.url === 'string' && /^https?:\/\/\S+$/i.test(o.source.url.trim())) ? o.source.url.trim() : null;
  const ings = o.ingredients.map(ing => {
    let name = ing.name.trim();
    if (ing.note && ing.note.trim()) name += ' (' + ing.note.trim() + ')';
    if (ing.optional === true) name += ' (optional)';
    let amount = '';
    const a = ing.amount;
    if (a && typeof a === 'object') {
      if (a.type === 'exact') amount = qtyToStored({ kind: 'exact', min: a.value, max: a.value });
      else if (a.type === 'range') amount = qtyToStored(a.min === a.max ? { kind: 'exact', min: a.min, max: a.min } : { kind: 'range', min: a.min, max: a.max });
      else amount = a.text.trim();
    }
    const out = { amount, unit: typeof ing.unit === 'string' ? ing.unit.trim() : '', name };
    if (typeof ing.group === 'string' && ing.group.trim()) out.group = ing.group.trim();
    return out;
  });
  if (ings.length) r.ingredients = ings;
  const steps = o.steps.map(st => {
    let text = st.text.trim();
    (Array.isArray(st.variants) ? st.variants : []).forEach(v => { text += '\n' + v.label.trim() + ': ' + v.text.trim(); });
    return { text };
  });
  if (steps.length) r.steps = steps;
  if (o.notes != null) r.notes = (Array.isArray(o.notes) ? o.notes : [o.notes]).map(n => n.trim()).filter(Boolean).join('\n');
  else r.notes = '';
  return r;
}

/* Text (mit Codeblock/Fliesstext drumherum) oder Objekt -> Ergebnis */
function parseRecipeJson(input) {
  const fail = (path, message) => ({ ok: false, errors: [{ path, message }], warnings: [], recipe: null });
  let obj = input;
  if (typeof input === 'string') {
    const s = extractRecipeJson(input);
    if (!s) return fail('', 'Das ist kein gültiges JSON. Stelle sicher, dass die Antwort der KI einen vollständigen JSON-Block enthält, der mit { beginnt und mit } endet.');
    try { obj = JSON.parse(s); }
    catch (e) { return fail('', 'Das ist kein gültiges JSON. Stelle sicher, dass der gesamte JSON-Block kopiert wurde, alle Texte in Anführungszeichen stehen und keine Kommas fehlen oder überzählig sind (' + String(e.message).slice(0, 120) + ').'); }
  }
  const v = validateRecipeJson(obj);
  if (v.errors.length) return { ok: false, errors: v.errors, warnings: v.warnings, recipe: null };
  let recipe = rjBuildDraft(obj);
  if (typeof importFinalizeDraft === 'function') {
    try { recipe = importFinalizeDraft(recipe, { source: 'json', warnings: v.warnings }) || recipe; } catch (e) { /* Pruefhinweise sind optional */ }
  }
  return { ok: true, errors: [], warnings: v.warnings, recipe };
}
