/* ---------- Rezeptqualitaet pruefen (nur Hinweise und Vorschlaege) ----------
   Diese Pruefung veraendert NIE selbst ein Rezept. Sie liefert verstaendliche Hinweise; wo eine
   Korrektur eindeutig ist, gibt es einen einzeln uebernehmbaren Vorschlag (fix). Erst der Tipp auf
   "Vorschlag uebernehmen" aendert das Rezept, und zwar nur diese eine Sache, mit dem
   urspruenglichen Wortlaut. Informelle Rezepte bleiben speicher- und exportierbar. */

const RC_SEASONINGS = /\b(salz|pfeffer|wasser|öl|olivenöl|gewürz|gewürze|kräuter|muskat|prise|nudelwasser)\b|\b(zucker|mehl|butter|fett|öl) (zum|für)\b/i;
const RC_YIELD_WORDS = /\b(\d{1,3})\s*(kugeln|stück|brötchen|cookies|guetzli|plätzchen|muffins|törtchen|portionen|scheiben)\b/i;
const RC_REST_WORDS = /ruhen|gehen lassen|aufgehen|kühl stellen|kühlen|marinieren|quellen|ziehen lassen|abkühlen|tiefkühlen|einweichen/i;

/* Stufen (v0.83): error = verhindert eine Aktion, check = bitte pruefen, info = reine Information.
   Jeder Hinweis: { id, level, text, field, index?, action: { label, step, selector }, fix? }. Ohne Text wird nichts angezeigt. */
const RC_LEVELS = { error: 'Fehler', check: 'Prüfen', info: 'Hinweis' };
function rcSafe(fn) { try { return fn() || null; } catch (e) { return null; } }
/* Editor-Ziel je Feld: Formular-Schritt (FORM_STEPS in views-v2.js) und das zu fokussierende Feld */
function rcActionFor(i) {
  const idx = Number.isInteger(i.index) && i.index >= 0 ? i.index : null;
  switch (i.field) {
    case 'servings': return { label: 'Angabe prüfen', step: 0, selector: '#f-servings' };
    case 'timeMinutes': return { label: 'Angabe prüfen', step: 0, selector: '#f-time' };
    case 'prepMinutes': return { label: 'Angabe prüfen', step: 0, selector: '#f-prep' };
    case 'cookMinutes': return { label: 'Angabe prüfen', step: 0, selector: '#f-cook' };
    case 'restMinutes': return { label: 'Angabe prüfen', step: 0, selector: '#f-rest' };
    case 'ingredients': return { label: 'Angabe prüfen', step: 2, selector: idx != null ? `[data-ing-row="${idx}"] .ing-amount-input` : '#ingRows input' };
    case 'steps': return { label: 'Angabe prüfen', step: 3, selector: idx != null ? `[data-step-row="${idx}"] .step-text-input` : '#stepRows textarea' };
    case 'notes': return { label: 'Angabe prüfen', step: 4, selector: '#f-notes' };
    default: return { label: 'Angabe prüfen', step: 0, selector: '#f-title' };
  }
}

/* ---------- Schrittanzeige: «Ueberschrift: Text» in EINEM Schritt nur in der Anzeige trennen ----------
   Die Daten bleiben unveraendert. Getrennt wird nur in sicheren Faellen; alles andere bleibt ein normaler Absatz.
   Kennwoerter wie «Tipp:», «Achtung:», «Hinweis:» bleiben Teil des Textes (Sicherheitshinweise nie abtrennen). */
const RC_LABEL_WORDS = /^(tipp|tip|hinweis|achtung|wichtig|vorsicht|info|notiz|variante|quelle|zeit|dauer|temperatur|ofen|hitze|schritt|optional|oder|und|aber|dann|danach|zuerst|anschliessend|nun|jetzt)$/i;
function rcTitleCandidate(t) {
  const x = String(t || '').trim();
  if (!x || x.length > 40 || /\d/.test(x) || /[.!?;,:()]/.test(x)) return false;
  const words = x.split(/\s+/);
  if (words.length > 5) return false;
  if (words.length === 1 && RC_LABEL_WORDS.test(x)) return false;
  return /^[A-ZÄÖÜ]/.test(x);
}
function stepDisplayParts(text) {
  const raw = String(text == null ? '' : text);
  const t = raw.trim();
  // Fall 1: erste Zeile ist ein Titel, darunter folgt der Text
  const nl = t.indexOf('\n');
  if (nl > 0) {
    const head = t.slice(0, nl).trim(), rest = t.slice(nl + 1).trim();
    if (rest && rcTitleCandidate(head.replace(/:$/, ''))) return { title: head.replace(/:$/, ''), text: rest };
  }
  // Fall 2: «Titel: Satz …» in einer Zeile
  const m = /^([^:\n]{2,40}):\s+(\S[\s\S]*)$/.exec(t);
  if (m && rcTitleCandidate(m[1]) && /^[A-ZÄÖÜ]/.test(m[2]) && m[2].trim().split(/\s+/).length >= 3) return { title: m[1].trim(), text: m[2].trim() };
  return { title: '', text: t };
}

/* Angezeigte Schrittnummer (Abschnittsüberschriften zählen nicht mit, wie in der Rezeptansicht) */
function rcStepNo(r, i) {
  let n = 0, out = i + 1;
  (typeof stepEntries === 'function' ? stepEntries(r) : []).forEach((e) => { if (!e.heading) n++; if (e.sourceIndex === i) out = e.heading ? n + 1 : n; });
  return out;
}
function rcIsTitleLike(text) {
  const t = String(text || '').trim();
  return !!t && t.length <= 42 && !/[.!?;:]$/.test(t.replace(/:$/, '')) && !/\d/.test(t) && t.replace(/:$/, '').split(/\s+/).length <= 4;
}

function recipeQualityIssues(r) {
  const issues = [];
  const steps = r.steps || [];
  const blank = steps.map((s, i) => (!s || !String(s.text || '').trim()) ? i : -1).filter((i) => i >= 0);
  // Ueberschrift ohne Inhalt: kurzer Titel, gefolgt von leerem Schritt oder Ende
  steps.forEach((s, i) => {
    const t = s && String(s.text || '').trim();
    if (!t || !rcIsTitleLike(t)) return;
    const next = steps[i + 1];
    if (!next || !String(next.text || '').trim() && (!steps[i + 2] || !String(steps[i + 2].text || '').trim())) {
      issues.push({ id: 'empty-heading:' + i, level: 'check', field: 'steps', index: i, text: `Die Überschrift „${t}“ hat keinen Inhalt. Ergänze darunter einen Arbeitsschritt oder entferne die Zeile.` });
    }
  });
  if (blank.length) {
    issues.push({ id: 'empty-steps', level: 'info', field: 'steps', text: `${blank.length} leere${blank.length === 1 ? 'r' : ''} Arbeitsschritt${blank.length === 1 ? '' : 'e'}. Im PDF werden leere Schritte nicht gedruckt.`,
      fix: { label: 'Leere Schritte entfernen', apply: (rr) => { rr.steps = (rr.steps || []).filter((s) => s && String(s.text || '').trim()); return rr; } } });
  }
  // Hinweise oder Quellen, die als Schritt gespeichert sind
  steps.forEach((s, i) => {
    const t = s && String(s.text || '').trim(); if (!t) return;
    const kind = pdfClassifyStepText(t);
    if (kind === 'source') {
      issues.push({ id: 'source-step:' + i, level: 'info', field: 'steps', index: i, text: `Schritt ${rcStepNo(r, i)} ist eine Quellenangabe („${t.slice(0, 40)}${t.length > 40 ? '…' : ''}“) und gehört nicht zur Anleitung.`,
        fix: { label: 'In das Quellenfeld verschieben', apply: (rr) => { const cur = rr.source && typeof rr.source === 'string' ? rr.source + ' · ' : ''; rr.source = cur + t; rr.steps = (rr.steps || []).filter((x) => x !== rr.steps[i] && !(x && x.text === s.text)); return rr; } } });
    } else if (kind === 'tip') {
      issues.push({ id: 'tip-step:' + i, level: 'info', field: 'steps', index: i, text: `Schritt ${rcStepNo(r, i)} ist ein Hinweis („${t.slice(0, 40)}${t.length > 40 ? '…' : ''}“). Im Kochmodus und im PDF erscheint er sonst als Arbeitsschritt.`,
        fix: { label: 'Zu den Notizen verschieben', apply: (rr) => { rr.notes = (rr.notes ? rr.notes.replace(/\s+$/, '') + '\n\n' : '') + t; rr.steps = (rr.steps || []).filter((x) => !(x && x.text === s.text)); return rr; } } });
    }
  });
  // Ausbeute: Stueckzahl in der Anleitung, aber Portionsangabe
  if (servingMode(r) === 'portions') {
    for (const s of steps) {
      const m = RC_YIELD_WORDS.exec(String((s && s.text) || ''));
      if (m && !/portionen/i.test(m[2])) {
        const n = parseInt(m[1], 10);
        issues.push({ id: 'yield-pieces', level: 'info', field: 'servings', text: `In der Anleitung steht „${m[0]}“, angegeben ${Number(r.servings) > 0 ? `${r.servings === 1 ? 'ist' : 'sind'} aber ${r.servings} ${r.servings === 1 ? 'Portion' : 'Portionen'}` : 'ist aber keine Menge'}. Prüfe die Mengenangabe.`,
          fix: { label: `Ergibt ${n} Stück setzen`, apply: (rr) => { rr.servingMode = 'pieces'; rr.servings = n; return rr; } } });
        break;
      }
    }
  }
  // Ertrag und Zeit: Hinweise aus recipe-model.js (H1), sonst die bisherige Pruefung als Rueckfall
  const ys = typeof yieldSuspicion === 'function' ? rcSafe(() => yieldSuspicion(r)) : null;
  if (ys && ys.text) issues.push({ id: 'yield-total', level: 'check', field: ys.field || 'servings', text: ys.text });
  else if (!yieldKnown(r) && !issues.some((x) => x.id === 'yield-pieces') && (realIngredients(r).length || steps.length)) issues.push({ id: 'yield-missing', level: 'check', field: 'servings', text: servingMode(r) === 'pieces' ? 'Die Stückzahl fehlt. Ohne sie lässt sich das Rezept nicht umrechnen.' : 'Die Portionsangabe fehlt. Ohne sie lässt sich das Rezept nicht umrechnen.' });
  const ts = typeof timeTextSuspicion === 'function' ? rcSafe(() => timeTextSuspicion(r)) : undefined;
  if (ts && ts.text) issues.push({ id: 'time-text', level: 'check', field: ts.field || 'restMinutes', text: ts.text });
  else if (ts === undefined && r.timeMinutes > 0) {
    let rest = 0;
    steps.forEach((s) => {
      const t = String((s && s.text) || '');
      if (!RC_REST_WORDS.test(t)) return;
      const d = parseDurations(t);
      if (d.length) rest += Math.round(d[0].seconds / 60);
    });
    if (rest >= r.timeMinutes) issues.push({ id: 'time-rest', level: 'check', field: 'timeMinutes', text: `Die Gesamtzeit (${r.timeMinutes} Min.) ist nicht länger als die genannten Warte- und Ruhezeiten (zusammen etwa ${rest} Min.). Prüfe die Zeitangaben.` });
  }
  // Zutaten ohne Menge, wo eine Menge sinnvoll ist (Salz nach Geschmack ist kein Fehler)
  const noAmt = realIngredients(r).filter((i) => !String(i.amount == null ? '' : i.amount).trim() && !String(i.unit || '').trim() && !RC_SEASONINGS.test(String(i.name || '').trim()) && !/nach (belieben|geschmack)|zum (bestreichen|bestreuen|servieren|anrichten|braten)|optional/i.test(i.name || ''));
  if (noAmt.length === 1) issues.push({ id: 'no-amounts', level: 'info', field: 'ingredients', index: (r.ingredients || []).indexOf(noAmt[0]), text: `Für die Zutat „${noAmt[0].name}“ fehlt eine Mengenangabe. Ergänze sie, wenn eine Menge sinnvoll ist.` });
  else if (noAmt.length) issues.push({ id: 'no-amounts', level: 'info', field: 'ingredients', index: (r.ingredients || []).indexOf(noAmt[0]), text: `Für ${noAmt.length} Zutaten fehlt eine Mengenangabe: ${noAmt.slice(0, 3).map((i) => i.name).join(', ')}${noAmt.length > 3 ? ' …' : ''}. Ergänze sie, wenn eine Menge sinnvoll ist.` });
  // Nie einen Hinweis ohne Text liefern (kein leeres «Prüfen:»)
  return issues.filter((i) => i && String(i.text || '').trim()).map((i) => Object.assign(i, { level: RC_LEVELS[i.level] ? i.level : 'check', action: i.action || rcActionFor(i) }));
}

/* Kurzer Text fuer den Kochbuch-Designer */
function recipeIssuesSummary(r) {
  const n = recipeQualityIssues(r).length;
  return n ? `„${r.title || 'Ohne Titel'}“: ${n} Hinweis${n === 1 ? '' : 'e'} zur Rezeptqualität (Rezept öffnen, Abschnitt „Hinweise zum Rezept“).` : '';
}

async function applyRecipeFix(recipeId, issueId) {
  const r = state.recipes.find((x) => x.id === recipeId);
  if (!r) return false;
  const issue = recipeQualityIssues(r).find((i) => i.id === issueId);
  if (!issue || !issue.fix) return false;
  const copy = JSON.parse(JSON.stringify(r));
  issue.fix.apply(copy);
  copy.updatedAt = Date.now();
  await dbPut(copy);
  await loadRecipes();
  return true;
}

function recipeCheckItemHtml(r, i, inForm) {
  const label = RC_LEVELS[i.level] || RC_LEVELS.check;
  const fixBtn = i.fix && !inForm ? `<button type="button" class="outline-btn outline-btn--small" data-action="rc-apply" data-id="${escapeHtml(r.id)}" data-issue="${escapeHtml(i.id)}">${escapeHtml(i.fix.label)}</button>` : '';
  const goBtn = i.action ? `<button type="button" class="text-btn rc-go" data-action="rc-open-field" data-id="${escapeHtml(r.id)}" data-issue="${escapeHtml(i.id)}">${escapeHtml(i.action.label)}</button>` : '';
  return `<li class="rc-item rc-${escapeHtml(i.level)}"><p class="rc-text"><span class="rc-level">${label}<span class="sr-only">:</span></span> ${escapeHtml(i.text)}</p>${fixBtn || goBtn ? `<div class="rc-actions">${fixBtn}${goBtn}</div>` : ''}</li>`;
}
/* Liste fuer Detailseite (aufklappbar) und Editor-Schritt «Kontrolle» (inForm: ohne Uebernehmen-Knoepfe, Sprung innerhalb des Formulars) */
function recipeCheckListHtml(r, issues, inForm) {
  return `<ul class="recipe-check-list">${issues.map((i) => recipeCheckItemHtml(r, i, inForm)).join('')}</ul>`;
}
function recipeCheckHtml(r) {
  const issues = recipeQualityIssues(r);
  if (!issues.length) return '';
  const hasError = issues.some((i) => i.level === 'error');
  return `<details class="recipe-check" ${hasError ? 'open' : ''}><summary>Hinweise zum Rezept (${issues.length})</summary>
    <p class="hint-line">Nichts wird automatisch geändert. Ein Vorschlag ändert nur diese eine Stelle, wenn du ihn übernimmst.</p>
    ${recipeCheckListHtml(r, issues, false)}</details>`;
}

/* «Angabe prüfen»: passenden Editor-Schritt öffnen und das Feld fokussieren. Von der Rezeptseite aus öffnet sich
   der Editor (Zurück führt wieder zur Rezeptseite, Reiter bleibt); im Editor selbst werden die Eingaben vorher
   übernommen (wie beim Schrittwechsel), damit nichts verloren geht. */
function rcFocusField(selector) {
  // render() kann per View Transition verzögert sein und danach den Fokus neu setzen: so lange nachfassen,
  // bis das Feld den Fokus zweimal hintereinander behält (höchstens ~1,2 s), dann nichts mehr anfassen.
  let tries = 0, held = 0, scrolled = false;
  const go = () => {
    const el = document.querySelector(selector) || document.querySelector('.form-step.is-active input, .form-step.is-active textarea');
    const det = el && el.closest('details');
    if (det && !det.open) det.open = true;   // Feld in zugeklapptem Abschnitt (z. B. weitere Zeiten): erst aufklappen
    if (el && el.offsetParent !== null) {
      if (document.activeElement === el) { if (++held >= 2) return; }
      else {
        held = 0;
        try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
        if (!scrolled) { scrolled = true; try { el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); } catch (e) { /* alt */ } }
      }
    }
    if (++tries < 30) setTimeout(go, 40);
  };
  go();
}
function rcOpenField(recipeId, issueId) {
  const inForm = state.view === 'form' && state.editingRecipe && state.editingRecipe.id === recipeId;
  const base = inForm ? collectFormData() : state.recipes.find((x) => x.id === recipeId);
  if (!base) return false;
  const issue = recipeQualityIssues(base).find((i) => i.id === issueId);
  const act = (issue && issue.action) || rcActionFor({ field: 'title' });
  if (inForm) {
    state.editingRecipe = base;
    state.formStep = act.step;
    render();
  } else {
    openForm(JSON.parse(JSON.stringify(base)));
    if (act.step) { state.formStep = act.step; render(); }
  }
  rcFocusField(act.selector);
  return true;
}
async function rcHandleAction(action, id, el) {
  if (action === 'rc-open-field') { rcOpenField(id, el.dataset.issue); return true; }
  if (action === 'open-share-menu') { openModal({ type: 'share-menu', recipeId: id }, `[data-action="open-share-menu"][data-id="${cssAttr(id)}"]`); return true; }
  if (action === 'share-public-link') {
    const pub = typeof libPublicationForRecipe === 'function' ? rcSafe(() => libPublicationForRecipe(id)) : null;
    if (state.modal) closeModal();
    if (!pub || pub.status !== 'published') { showToast('Dieses Rezept ist nicht veröffentlicht. Veröffentliche es zuerst in der Rezeptbibliothek.', 'error'); return true; }
    const r = state.recipes.find((x) => x.id === id);
    const url = libShareLink('recipe', pub.id);
    try { await libShareNative(url, (r && r.title) || 'Rezept'); }
    catch (e) { showToast('Der Link konnte nicht geteilt werden. Versuche es erneut.', 'error'); }
    return true;
  }
  return null;
}
/* Anhängen an die Aktionskette (wie settings-konto.js): actions-v2.js ruft handleCloudAction im default-Zweig auf.
   recipe-check.js lädt vor cloud.js, deshalb erst nach dem Laden aller Skripte. */
document.addEventListener('DOMContentLoaded', () => {
  const orig = window.handleCloudAction;
  if (typeof orig !== 'function' || orig.__rc) return;
  const wrapped = async function (action, id, el, e) {
    if (action === 'rc-open-field' || action === 'open-share-menu' || action === 'share-public-link') {
      const r = await rcHandleAction(action, id, el);
      if (r !== null) return r;
    }
    return orig.call(this, action, id, el, e);
  };
  wrapped.__rc = true;
  window.handleCloudAction = wrapped;
});
