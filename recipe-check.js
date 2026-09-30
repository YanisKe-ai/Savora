/* ---------- Rezeptqualitaet pruefen (nur Hinweise und Vorschlaege) ----------
   Diese Pruefung veraendert NIE selbst ein Rezept. Sie liefert verstaendliche Hinweise; wo eine
   Korrektur eindeutig ist, gibt es einen einzeln uebernehmbaren Vorschlag (fix). Erst der Tipp auf
   "Vorschlag uebernehmen" aendert das Rezept, und zwar nur diese eine Sache, mit dem
   urspruenglichen Wortlaut. Informelle Rezepte bleiben speicher- und exportierbar. */

const RC_SEASONINGS = /\b(salz|pfeffer|wasser|öl|olivenöl|gewürz|gewürze|kräuter|muskat|prise|nudelwasser)\b|\b(zucker|mehl|butter|fett|öl) (zum|für)\b/i;
const RC_YIELD_WORDS = /\b(\d{1,3})\s*(kugeln|stück|brötchen|cookies|guetzli|plätzchen|muffins|törtchen|portionen|scheiben)\b/i;
const RC_REST_WORDS = /ruhen|gehen lassen|aufgehen|kühl stellen|kühlen|marinieren|quellen|ziehen lassen|abkühlen|tiefkühlen|einweichen/i;

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
      issues.push({ id: 'empty-heading:' + i, level: 'warn', field: 'steps', text: `Die Überschrift „${t}“ hat keinen Inhalt. Es fehlt ein Arbeitsschritt oder die Zeile ist nur ein Titel.` });
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
      issues.push({ id: 'source-step:' + i, level: 'info', field: 'steps', text: `Schritt ${i + 1} ist eine Quellenangabe („${t.slice(0, 40)}${t.length > 40 ? '…' : ''}“) und gehört nicht zur Anleitung.`,
        fix: { label: 'In das Quellenfeld verschieben', apply: (rr) => { const cur = rr.source && typeof rr.source === 'string' ? rr.source + ' · ' : ''; rr.source = cur + t; rr.steps = (rr.steps || []).filter((x) => x !== rr.steps[i] && !(x && x.text === s.text)); return rr; } } });
    } else if (kind === 'tip') {
      issues.push({ id: 'tip-step:' + i, level: 'info', field: 'steps', text: `Schritt ${i + 1} ist ein Hinweis („${t.slice(0, 40)}${t.length > 40 ? '…' : ''}“) und wird im Kochmodus und im PDF sonst wie ein Arbeitsschritt behandelt.`,
        fix: { label: 'Zu den Notizen verschieben', apply: (rr) => { rr.notes = (rr.notes ? rr.notes.replace(/\s+$/, '') + '\n\n' : '') + t; rr.steps = (rr.steps || []).filter((x) => !(x && x.text === s.text)); return rr; } } });
    }
  });
  // Ausbeute: Stueckzahl in der Anleitung, aber Portionsangabe
  if (servingMode(r) === 'portions') {
    for (const s of steps) {
      const m = RC_YIELD_WORDS.exec(String((s && s.text) || ''));
      if (m && !/portionen/i.test(m[2])) {
        const n = parseInt(m[1], 10);
        issues.push({ id: 'yield-pieces', level: 'info', field: 'servings', text: `In der Anleitung steht „${m[0]}“, die Ausbeute ist aber mit ${r.servings} ${r.servings === 1 ? 'Portion' : 'Portionen'} angegeben.`,
          fix: { label: `Ausbeute auf ${n} Stück setzen`, apply: (rr) => { rr.servingMode = 'pieces'; rr.servings = n; return rr; } } });
        break;
      }
    }
  }
  // Zeit passt nicht zu ausdruecklichen Ruhe-/Wartezeiten
  if (r.timeMinutes > 0) {
    let rest = 0;
    steps.forEach((s) => {
      const t = String((s && s.text) || '');
      if (!RC_REST_WORDS.test(t)) return;
      const d = parseDurations(t);
      if (d.length) rest += Math.round(d[0].seconds / 60);
    });
    if (rest >= r.timeMinutes) issues.push({ id: 'time-rest', level: 'warn', field: 'timeMinutes', text: `Die Zeit (${r.timeMinutes} Min.) ist nicht länger als die im Rezept genannten Warte- und Ruhezeiten (zusammen etwa ${rest} Min.). Bitte prüfen, ob es die Gesamt- oder die aktive Zeit ist.` });
  }
  // Zutaten ohne Menge, wo eine Menge sinnvoll ist (Salz nach Geschmack ist kein Fehler)
  const noAmt = realIngredients(r).filter((i) => !String(i.amount == null ? '' : i.amount).trim() && !String(i.unit || '').trim() && !RC_SEASONINGS.test(String(i.name || '').trim()) && !/nach (belieben|geschmack)|zum (bestreichen|bestreuen|servieren|anrichten|braten)|optional/i.test(i.name || ''));
  if (noAmt.length) issues.push({ id: 'no-amounts', level: 'info', field: 'ingredients', text: `${noAmt.length} Zutat${noAmt.length === 1 ? '' : 'en'} ohne Menge: ${noAmt.slice(0, 3).map((i) => i.name).join(', ')}${noAmt.length > 3 ? ' …' : ''}. Nur ergänzen, wenn eine Menge gewünscht ist.` });
  return issues;
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

function recipeCheckHtml(r) {
  const issues = recipeQualityIssues(r);
  if (!issues.length) return '';
  return `<details class="recipe-check"><summary>Hinweise zum Rezept (${issues.length})</summary>
    <p class="hint-line">Nichts wird automatisch geändert. Jeder Vorschlag ändert nur diese eine Stelle, wenn du ihn übernimmst.</p>
    <ul class="recipe-check-list">${issues.map((i) => `<li class="rc-${i.level}"><span>${escapeHtml(i.text)}</span>${i.fix ? `<button type="button" class="outline-btn outline-btn--small" data-action="rc-apply" data-id="${escapeHtml(r.id)}" data-issue="${escapeHtml(i.id)}">${escapeHtml(i.fix.label)}</button>` : `<button type="button" class="text-btn" data-action="edit-recipe" data-id="${escapeHtml(r.id)}">Rezept bearbeiten</button>`}</li>`).join('')}</ul></details>`;
}
