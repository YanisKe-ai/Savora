/* v0.95: Schritte abhaken (Rezeptansicht, Reiter «Zubereitung») und Mengen direkt im Schritttext (Rezeptansicht und Kochmodus).
   Klassisches Skript. Laedt nach recipe-model.js, views.js und cookmode.js.
   - Abhaken: state.doneSteps[recipeId] = Set(sourceIndex), nur im Speicher (wie state.checkedIngredients, temporaerer Kochfortschritt).
   - Mengen: Zuordnung ueber stepIngredientMatch, Menge wie in der Zutatenliste (scaledAmountDisplay, aktuelle Portionen).
     Der Text wird NICHT zerlegt: an der Einfuegestelle steht ein Platzhalterzeichen (Private-Use-Bereich), das durch die normale
     Ausgabe (escapeHtml, Timer-Chips) hindurchgeht und danach durch das Etikett ersetzt wird. So bleiben Timer unberuehrt. */

const STEP_QTY_BASE = 0xE100;   // Platzhalterzeichen STEP_QTY_BASE + Nummer

/* ---------- Mengen im Schritttext ---------- */
function stepQtyLabel(i, factor) {
  // Menge im Namen («½ TL Backpulver», Mengenfeld leer) nur fuer die Anzeige teilen, wie in der Zutatenliste
  const sp = (!String(i.amount || '').trim() && !String(i.unit || '').trim() && typeof parseIngredientLine === 'function') ? parseIngredientLine(String(i.name || '')) : null;
  const shown = sp && sp.amount && sp.name ? Object.assign({}, i, { amount: sp.amount, unit: sp.unit || '', name: sp.name }) : i;
  const d = scaledAmountDisplay(shown, factor);
  if (!d.text || !/[\d½¼¾⅓⅔⅛]/.test(d.text)) return '';   // «nach Belieben», leer, nur Einheit: keine Menge zeigen
  return d.text + (d.unit ? ' ' + d.unit : '');
}
const STEP_QTY_WORD = /[A-Za-zÄÖÜäöüßéèàç]+/g;
const STEP_QTY_PRECEDED = /(?:^|[\s(])[\d½¼¾⅓⅔⅛][\d.,/½¼¾⅓⅔⅛–-]*\s*((?:[A-Za-zÄÖÜäöüßéèàç.]{1,12}\s+){0,2})$/;
function stepQtyPreceded(text, pos) {
  const m = STEP_QTY_PRECEDED.exec(text.slice(Math.max(0, pos - 40), pos));
  if (!m) return false;
  return !/(^|\s)(und|oder|mit|dann|dazu|danach)(\s|$)/i.test(m[1] || '');   // «2 Eier und Mehl»: «und» trennt, Mehl bekommt seine Menge
}
/* Gibt [{ pos, label }] zurueck: pos = Zeichenstelle direkt hinter der ersten Erwaehnung. Aendert nichts. */
function stepQtyMarks(r, step, text) {
  try {
    if (!r || !step || typeof stepIngredientMatch !== 'function') return [];
    text = String(text || '');
    if (!text) return [];
    const items = stepIngredientMatch(r, step).items.filter(i => !i._ambiguous);
    if (!items.length) return [];
    const factor = servingsFactor(r, currentServings(r));
    const words = [];
    let m; STEP_QTY_WORD.lastIndex = 0;
    while ((m = STEP_QTY_WORD.exec(text))) words.push({ w: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
    const used = new Set(), marks = [];
    items.forEach(i => {
      const label = stepQtyLabel(i, factor);
      if (!label) return;
      const keys = ingredientKeywords(i);
      const hit = words.find(x => keys.some(k => tokenMatchesKeyword(x.w, k)));
      if (!hit || used.has(hit.end)) return;
      used.add(hit.end);
      if (stepQtyPreceded(text, hit.start)) return;   // «200 g Mehl»: Menge steht schon da
      marks.push({ pos: hit.end, label });
    });
    marks.sort((a, b) => a.pos - b.pos);
    return marks.slice(0, 200);
  } catch (e) { return []; }
}
function stepQtyMarkText(text, marks) {
  text = String(text || '');
  let out = text;
  for (let k = marks.length - 1; k >= 0; k--) out = out.slice(0, marks[k].pos) + String.fromCharCode(STEP_QTY_BASE + k) + out.slice(marks[k].pos);
  return out;
}
function stepQtyApply(html, marks) {
  return html.replace(/[-]/g, c => {
    const m = marks[c.charCodeAt(0) - STEP_QTY_BASE];
    return m ? ` <span class="step-qty">${escapeHtml(m.label)}</span>` : '';
  });
}
/* Fertiges, sicher maskiertes HTML fuer einen Schritttext ohne Timer (Rezeptansicht). */
function stepQtyHtml(r, step, text) {
  const marks = stepQtyMarks(r, step, text);
  return stepQtyApply(escapeHtml(marks.length ? stepQtyMarkText(text, marks) : String(text || '')), marks);
}
/* Kochmodus: renderStepWithTimers (views.js) um die Mengen erweitern, ohne views.js zu aendern. */
(function () {
  if (typeof renderStepWithTimers !== 'function' || renderStepWithTimers.__stepQty) return;
  const orig = renderStepWithTimers;
  const wrapped = function (text, stepIdx) {
    let marks = [];
    try {
      const r = typeof currentCookRecipe === 'function' ? currentCookRecipe() : null;
      const step = r && cookSteps(r)[stepIdx];
      if (step && step.text === text && step._sourceIndex !== undefined) marks = stepQtyMarks(r, step, text);
    } catch (e) { marks = []; }
    if (!marks.length) return orig(text, stepIdx);
    return stepQtyApply(orig(stepQtyMarkText(text, marks), stepIdx), marks);
  };
  wrapped.__stepQty = true;
  window.renderStepWithTimers = wrapped;
})();

/* ---------- Schritte abhaken ---------- */
function doneStepsFor(recipeId) {
  state.doneSteps = state.doneSteps || {};
  if (!state.doneSteps[recipeId]) state.doneSteps[recipeId] = new Set();
  return state.doneSteps[recipeId];
}
function stepIsDone(r, key) { return !!(state.doneSteps && state.doneSteps[r.id] && state.doneSteps[r.id].has(key)); }
/* Nummernknopf eines Schritts (Tippflaeche gross, die Scheibe bleibt so gross wie bisher). */
function stepCheckHtml(r, key, n) {
  const on = stepIsDone(r, key);
  return `<button type="button" class="step-check" role="checkbox" aria-checked="${on}" aria-label="Schritt ${n} erledigt"><span class="step-no" aria-hidden="true"><span class="step-no-num">${n}</span><span class="step-no-tick">${typeof ICONS !== 'undefined' ? ICONS.check : ''}</span></span></button>`;
}
function stepResetHtml(r) {
  const n = state.doneSteps && state.doneSteps[r.id] ? state.doneSteps[r.id].size : 0;
  return `<button type="button" class="text-btn step-reset-btn" ${n ? '' : 'hidden'}>Alle zurücksetzen</button>`;
}
function stepToggleDone(li) {
  const list = li.closest('.step-list-v2');
  const rid = list && list.dataset.recipeId;
  const key = parseInt(li.dataset.stepKey, 10);
  if (!rid || isNaN(key)) return;
  const set = doneStepsFor(rid);
  if (set.has(key)) set.delete(key); else set.add(key);
  stepApplyDone(li, set.has(key));
  stepSyncReset(list, set.size);
  try { SavoraNative.haptic('light'); } catch (e) {}
}
function stepApplyDone(li, on) {
  li.classList.toggle('is-done', on);
  const b = li.querySelector('.step-check');
  if (b) b.setAttribute('aria-checked', String(on));
}
function stepSyncReset(list, count) {
  const btn = list && list.parentElement && list.parentElement.querySelector('.step-reset-btn');
  if (btn) btn.hidden = !count;
}
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button > 0) return;
  const t = e.target;
  if (!t || !t.closest) return;
  const reset = t.closest('.step-reset-btn');
  if (reset) {
    const list = reset.parentElement.querySelector('.step-list-v2');
    if (!list) return;
    doneStepsFor(list.dataset.recipeId).clear();
    list.querySelectorAll('.step-item.is-done').forEach(li => stepApplyDone(li, false));
    reset.hidden = true;
    return;
  }
  const li = t.closest('.step-item[data-step-key]');
  if (!li) return;
  const check = t.closest('.step-check');
  if (!check) {
    // Knoepfe, Links und Felder im Schritt (z. B. Timer-Chips) behalten ihre eigene Aufgabe
    const inner = t.closest('button, a, input, textarea, select, label, [data-action]');
    if (inner && li.contains(inner)) return;
    const sel = window.getSelection ? String(window.getSelection()) : '';
    if (sel.trim()) return;   // Text wird markiert: nicht abhaken
  }
  stepToggleDone(li);
});
