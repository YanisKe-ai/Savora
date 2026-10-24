/* ---------- Versionierter JSON-Import fuer EIN Rezept (Format "savora-recipe", Version 1) ----------
   Eine externe KI liest einen Rezeptlink und liefert dieses JSON. Hier wird es erkannt, streng
   geprueft und in einen Rezeptentwurf umgewandelt. Nichts wird erfunden: fehlende Werte bleiben
   leer bzw. 0 (= unbekannt). Beschreibung des Formats: docs/KI-IMPORT.md

   Oeffentlich: extractRecipeJson(text), looksLikeRecipeJson(text), validateRecipeJson(obj), parseRecipeJson(textOderObjekt),
   rjNormalize(obj), rjIsLinkUnreadable(text), SAVORA_KI_PROMPT (Prompt fuer die KI, im Textimport zum Kopieren)
   Ergebnis von parseRecipeJson: { ok, errors:[{path,message}], warnings:[{path,message}], recipe: Entwurf|null } */

const RJ_FORMAT = 'savora-recipe';
const RJ_VERSION = 1;
const RJ_DIFFICULTIES = ['einfach', 'mittel', 'anspruchsvoll'];

/* v90.2: Prompt fuer eine externe KI (ChatGPT, Claude, Gemini). Getestet mit 12 Rezepten (CH, DE, EN, Social Media),
   siehe tests/test_v90_ki_prompt.py. Wird im Textimport zum Kopieren angeboten; der Link kommt ans Ende. */
const SAVORA_KI_PROMPT = "Öffne den Rezept-Link (oder lies den Rezepttext) unten und gib das Rezept für die App Savora als EINEN JSON-Codeblock zurück, ohne Text davor oder danach. Kannst du den Link nicht öffnen, antworte nur: LINK NICHT LESBAR. Erfinde nie ein Rezept.\n\nForm:\n{\"format\":\"savora-recipe\",\"version\":1,\"title\":\"…\",\"yield\":{\"count\":4,\"kind\":\"portions\",\"label\":null},\"time\":{\"totalMinutes\":null,\"activeMinutes\":null,\"restMinutes\":null,\"cookMinutes\":null},\"difficulty\":null,\"source\":{\"url\":\"…\",\"name\":\"…\"},\"ingredients\":[{\"group\":null,\"name\":\"Mehl\",\"amount\":{\"type\":\"exact\",\"value\":250},\"unit\":\"g\",\"note\":null,\"optional\":false}],\"steps\":[{\"text\":\"…\",\"variants\":[]}],\"notes\":[]}\n\nRegeln:\n- amount: {\"type\":\"exact\",\"value\":0.5}, {\"type\":\"range\",\"min\":2,\"max\":3}, {\"type\":\"qualitative\",\"text\":\"1 Prise\"} oder null. Zahlen ohne Anführungszeichen, Brüche als Dezimalzahl.\n- unit kurz (g, kg, ml, dl, l, EL, TL, Prise, Pck.). Stückzahlen ohne Einheit: 2 Eier = value 2, unit null. cup, oz, lb so lassen.\n- yield: count ganze Zahl (bei Bereich die kleinere), ohne Angabe yield null. kind \"pieces\" bei Stückzahl (12 Muffins: label \"Muffins\"), sonst \"portions\". Bei mehreren Mengenvarianten nur die erste.\n- time in ganzen Minuten: activeMinutes = Vorbereitung/Arbeitszeit, cookMinutes = Koch- oder Backzeit, restMinutes = Ruhe-, Geh- oder Kühlzeit, totalMinutes nur wenn genannt.\n- Nur was im Rezept steht, Unbekanntes null. Mengen, Zeiten, Temperaturen nie ändern (°F: °C in Klammern dazu). difficulty nur \"einfach\", \"mittel\" oder \"anspruchsvoll\".\n- Texte auf Deutsch (Schweiz, ss statt ß). group nur bei Zutatengruppen im Rezept (z. B. \"Teig\"). Zusätze wie \"gehackt\" in note.\n- Utensilien sind keine Zutaten. variants nur für Alternativen (Backofen oder Airfryer): [{\"label\":\"Airfryer\",\"text\":\"…\"}].\n\nLink oder Text:\n";

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

/* ---------- v90.2: typische KI-Ausrutscher still korrigieren, bevor streng geprueft wird ----------
   Zahlen als Text ("250", "0,5", "½", "2-3"), Menge als blosse Zahl, Zutaten oder Schritte als Text, fehlendes
   format/version, Schwierigkeit als Synonym, Zeiten als Text ("30 Min.", "PT1H30M"), Ausbeute als Zahl.
   Was nicht eindeutig ist, bleibt wie es ist und wird danach normal gemeldet. Es wird nichts erfunden. */
const RJ_DIFF_SYN = { einfach: 'einfach', leicht: 'einfach', 'ganz einfach': 'einfach', 'sehr einfach': 'einfach', simpel: 'einfach', easy: 'einfach', simple: 'einfach', beginner: 'einfach',
  mittel: 'mittel', mittelschwer: 'mittel', normal: 'mittel', medium: 'mittel', intermediate: 'mittel', moderate: 'mittel',
  anspruchsvoll: 'anspruchsvoll', schwer: 'anspruchsvoll', schwierig: 'anspruchsvoll', aufwendig: 'anspruchsvoll', aufwändig: 'anspruchsvoll', difficult: 'anspruchsvoll', hard: 'anspruchsvoll', advanced: 'anspruchsvoll' };
function rjNumFromText(v) {
  if (rjIsNum(v)) return v;
  if (typeof v !== 'string' || typeof parseQuantity !== 'function') return v;
  const q = parseQuantity(v.trim(), '');
  return q.kind === 'exact' ? q.min : v;
}
function rjMinutes(v) {
  if (v == null || rjIsNum(v) && Number.isInteger(v)) return v;
  if (rjIsNum(v)) return v >= 0 ? Math.round(v) : v;
  if (typeof v !== 'string') return v;
  const s = v.trim();
  if (!s) return null;
  const iso = /^P(?:T)?(?:(\d+)H)?(?:(\d+)M)?$/i.exec(s.replace(/^P0D/i, 'P'));
  if (iso && (iso[1] || iso[2])) return (+(iso[1] || 0)) * 60 + (+(iso[2] || 0));
  const hm = /^(?:(\d+(?:[.,]\d+)?)\s*(?:h|std\.?|stunden?|hours?))?\s*(?:(\d+)\s*(?:m|min\.?|minuten|minutes?))?$/i.exec(s);
  if (hm && (hm[1] || hm[2])) return Math.round(parseFloat(String(hm[1] || 0).replace(',', '.')) * 60) + (+(hm[2] || 0));
  if (/^\d+$/.test(s)) return +s;
  return v;
}
function rjAmount(a) {
  if (a == null || a === '') return null;
  if (rjIsNum(a)) return { type: 'exact', value: a };
  if (typeof a === 'string') {
    const q = typeof parseQuantity === 'function' ? parseQuantity(a.trim(), '') : { kind: 'qualitative' };
    if (q.kind === 'exact') return { type: 'exact', value: q.min };
    if (q.kind === 'range') return { type: 'range', min: q.min, max: q.max };
    return a.trim() ? { type: 'qualitative', text: a.trim() } : null;
  }
  if (!rjIsObj(a)) return a;
  const b = Object.assign({}, a);
  if (b.type == null) b.type = 'value' in b ? 'exact' : ('min' in b || 'max' in b) ? 'range' : 'text' in b ? 'qualitative' : b.type;
  if (typeof b.type === 'string') b.type = b.type.trim().toLowerCase();
  if (b.type === 'exact' && typeof b.value === 'string') {
    const q = typeof parseQuantity === 'function' ? parseQuantity(b.value.trim(), '') : null;
    if (q && q.kind === 'range') return { type: 'range', min: q.min, max: q.max };
    b.value = rjNumFromText(b.value);
  }
  if (b.type === 'range') { b.min = rjNumFromText(b.min); b.max = rjNumFromText(b.max); if (b.max == null && rjIsNum(b.min)) return { type: 'exact', value: b.min }; }
  if (b.type === 'exact' && 'text' in b && b.text == null) delete b.text;
  if (b.type === 'exact' && (b.min === undefined || b.min === null) && (b.max === undefined || b.max === null)) { delete b.min; delete b.max; }
  return b;
}
function rjNormalize(input) {
  if (!rjIsObj(input)) return input;
  const o = Object.assign({}, input);
  const looks = typeof o.title === 'string' && Array.isArray(o.ingredients);
  if (o.format == null && looks) o.format = RJ_FORMAT;
  if (typeof o.format === 'string' && o.format.trim().toLowerCase() === RJ_FORMAT) o.format = RJ_FORMAT;
  if (o.version == null && o.format === RJ_FORMAT) o.version = RJ_VERSION;
  if (typeof o.version === 'string' && /^\s*1(\.0)?\s*$/.test(o.version)) o.version = RJ_VERSION;
  // Ausbeute
  if (rjIsNum(o.yield) || typeof o.yield === 'string') o.yield = { count: o.yield, kind: 'portions', label: null };
  if (rjIsObj(o.yield)) {
    const y = o.yield = Object.assign({}, o.yield);
    if (typeof y.count === 'string') { const m = /\d+/.exec(y.count); if (m) y.count = +m[0]; }
    if (rjIsNum(y.count) && !Number.isInteger(y.count) && y.count > 0) y.count = Math.round(y.count) || 1;
    if (y.count === 0 || y.count == null) o.yield = null;
    else {
      const k = String(y.kind == null ? '' : y.kind).trim().toLowerCase();
      y.kind = /^(pieces?|st(ü|ue)cke?|stk\.?|count|items?)$/.test(k) ? 'pieces' : 'portions';
    }
  }
  // Zeiten
  if (rjIsObj(o.time)) { const t = o.time = Object.assign({}, o.time); ['totalMinutes', 'activeMinutes', 'restMinutes', 'cookMinutes'].forEach(k => { if (k in t) t[k] = rjMinutes(t[k]); }); }
  // Schwierigkeit: Synonyme erkennen, Unbekanntes leer lassen (statt den ganzen Import abzulehnen)
  if (typeof o.difficulty === 'string') {
    const d = o.difficulty.trim().toLowerCase();
    o.difficulty = d ? (RJ_DIFF_SYN[d] || null) : null;
  }
  // Quelle als blosser Link
  if (typeof o.source === 'string') o.source = /^https?:\/\//i.test(o.source.trim()) ? { url: o.source.trim(), name: null } : null;
  // Zutaten
  if (Array.isArray(o.ingredients)) o.ingredients = o.ingredients.map(ing => {
    if (typeof ing === 'string') {
      const p = typeof parseIngredientLine === 'function' ? parseIngredientLine(ing) : null;
      if (p && String(p.name || '').trim()) return { group: null, name: String(p.name).trim(), amount: rjAmount(p.amount), unit: p.unit || null, note: null, optional: false };
      return { group: null, name: ing, amount: null, unit: null, note: null, optional: false };
    }
    if (!rjIsObj(ing)) return ing;
    const i = Object.assign({}, ing);
    if (typeof i.name !== 'string' && typeof i.item === 'string') i.name = i.item;
    i.amount = rjAmount(i.amount);
    if (rjIsNum(i.unit)) i.unit = String(i.unit);
    if (typeof i.optional === 'string') i.optional = /^(true|ja|yes)$/i.test(i.optional.trim());
    if (i.optional != null && typeof i.optional !== 'boolean') i.optional = !!i.optional;
    ['group', 'note', 'unit'].forEach(k => { if (typeof i[k] === 'string' && !i[k].trim()) i[k] = null; });
    return i;
  });
  // Schritte
  if (Array.isArray(o.steps)) o.steps = o.steps.map(st => {
    if (typeof st === 'string') return { text: st };
    if (!rjIsObj(st)) return st;
    const s2 = Object.assign({}, st);
    if (typeof s2.text !== 'string') s2.text = typeof s2.instruction === 'string' ? s2.instruction : typeof s2.description === 'string' ? s2.description : s2.text;
    if (s2.variants != null && !Array.isArray(s2.variants)) delete s2.variants;
    if (Array.isArray(s2.variants)) s2.variants = s2.variants.filter(v => rjIsObj(v) && typeof v.text === 'string' && v.text.trim()).map(v => ({ label: typeof v.label === 'string' && v.label.trim() ? v.label : 'Variante', text: v.text }));
    return s2;
  });
  return o;
}
/* Kleine Reparaturen am JSON-Text: Kommas vor } oder ], typografische Anfuehrungszeichen als Begrenzer, BOM */
function rjRepairJsonText(s) {
  return String(s).replace(/^﻿/, '').replace(/,\s*([}\]])/g, '$1').replace(/[“”„](?=\s*[:,}\]])|(?<=[{,:\[]\s*)[“”„]/g, '"');
}
/* Antwort der KI, dass sie den Link nicht lesen konnte (unser Prompt verlangt genau «LINK NICHT LESBAR») */
function rjIsLinkUnreadable(text) {
  const t = String(text == null ? '' : text).trim();
  return /^\W*LINK NICHT LESBAR\W*$/i.test(t) || (t.length < 400 && /LINK NICHT LESBAR/i.test(t) && t.indexOf('{') < 0);
}

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
    if (!rjIsObj(o.yield)) err('yield', 'Ergibt (yield) muss ein Objekt oder null sein, ist aber ' + rjType(o.yield) + '.');
    else {
      const y = o.yield;
      if (!(typeof y.count === 'number' && Number.isInteger(y.count) && y.count > 0)) err('yield.count', 'Ergibt: "count" muss eine ganze Zahl grösser 0 sein' + (y.count === undefined ? ' (fehlt).' : ', gefunden ' + JSON.stringify(y.count) + '.'));
      if (y.kind !== 'pieces' && y.kind !== 'portions') err('yield.kind', 'Ergibt: "kind" muss "pieces" oder "portions" sein' + (y.kind === undefined ? ' (fehlt).' : ', gefunden ' + JSON.stringify(y.kind) + '.'));
      if (y.label != null && typeof y.label !== 'string') err('yield.label', 'Ergibt: "label" muss Text oder null sein.');
    }
  }

  // Zeiten
  const times = {};
  if (o.time != null) {
    if (!rjIsObj(o.time)) err('time', 'Zeitangaben müssen ein Objekt oder null sein, sind aber ' + rjType(o.time) + '.');
    else [['totalMinutes', 'Gesamtzeit'], ['activeMinutes', 'Vorbereitungszeit'], ['restMinutes', 'Ruhezeit'], ['cookMinutes', 'Garzeit']].forEach(([k, label]) => {
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
    catch (e0) { try { obj = JSON.parse(rjRepairJsonText(s)); } catch (e) { return fail('', 'Das ist kein gültiges JSON. Stelle sicher, dass der gesamte JSON-Block kopiert wurde, alle Texte in Anführungszeichen stehen und keine Kommas fehlen oder überzählig sind (' + String(e.message).slice(0, 120) + ').'); } }
  }
  obj = rjNormalize(obj);
  const v = validateRecipeJson(obj);
  if (v.errors.length) return { ok: false, errors: v.errors, warnings: v.warnings, recipe: null };
  let recipe = rjBuildDraft(obj);
  if (typeof importFinalizeDraft === 'function') {
    try { recipe = importFinalizeDraft(recipe, { source: 'json', warnings: v.warnings }) || recipe; } catch (e) { /* Pruefhinweise sind optional */ }
  }
  return { ok: true, errors: [], warnings: v.warnings, recipe };
}
