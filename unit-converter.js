/* ---------- Masseinheiten-Rechner ----------
   Vier Reiter: Gewicht, Volumen, Temperatur, Zutaten (Tasse/EL/TL in Gramm).
   Eigenstaendig: die globalen Tabellen in units.js (Rezept-Import, Einkauf) bleiben unveraendert.
   Loeffel und Tasse sind waehlbar (Schweiz: EL 15 ml, TL 5 ml, Tasse 250 ml, USA: 14,8 / 4,9 / 236,6 ml). */
const UC_KEY = 'savora-uc-defs';
const UC_DEFS = {
  metric: { label: 'Schweiz', desc: 'EL 15 ml, TL 5 ml, Tasse 250 ml', tsp: 5, tbsp: 15, cup: 250 },
  us: { label: 'USA', desc: 'EL 14,8 ml, TL 4,9 ml, Tasse 236,6 ml', tsp: 4.92892, tbsp: 14.7868, cup: 236.588 },
};
const UC_WEIGHT = { g: 1, kg: 1000, oz: 28.3495, lb: 453.592 };
const UC_LABELS = { g: 'g', kg: 'kg', oz: 'oz', lb: 'lb', ml: 'ml', dl: 'dl', l: 'l', tsp: 'TL', tbsp: 'EL', cup: 'Tasse', floz: 'fl. oz', c: '°C', f: '°F', gas: 'Gasstufe' };
const UC_TABS = [
  { id: 'weight', label: 'Gewicht', units: ['g', 'kg', 'oz', 'lb'], unit: 'g', amount: '100' },
  { id: 'volume', label: 'Volumen', units: ['ml', 'dl', 'l', 'tsp', 'tbsp', 'cup', 'floz'], unit: 'ml', amount: '250' },
  { id: 'temp', label: 'Temperatur', units: ['c', 'f', 'gas'], unit: 'c', amount: '180' },
  { id: 'food', label: 'Zutaten', units: ['g', 'kg', 'ml', 'dl', 'l', 'tsp', 'tbsp', 'cup'], unit: 'cup', amount: '1' },
];
const UC_QUICK = {
  g: ['50', '100', '250', '500'], kg: ['0.5', '1', '2'], oz: ['4', '8', '16'], lb: ['0.5', '1', '2'],
  ml: ['50', '100', '250', '500'], dl: ['1', '2', '2.5', '5'], l: ['0.5', '1', '1.5'],
  tsp: ['1', '2', '3'], tbsp: ['1', '2', '3', '4'], cup: ['0.5', '1', '2'], floz: ['4', '8'],
  c: ['160', '180', '200', '220'], f: ['325', '350', '375', '400'], gas: ['3', '4', '5', '6'],
};
/* Dichte in g pro ml. Richtwerte: Sorte, Feuchte und wie fest gepackt wird, verschieben die Werte. */
const UC_FOODS = [
  { id: 'flour', name: 'Weissmehl', d: 0.55 }, { id: 'sugar', name: 'Zucker', d: 0.85 }, { id: 'icing', name: 'Puderzucker', d: 0.5 },
  { id: 'brown', name: 'Brauner Zucker', d: 0.9 }, { id: 'butter', name: 'Butter', d: 0.96 }, { id: 'oil', name: 'Öl', d: 0.92 },
  { id: 'honey', name: 'Honig', d: 1.42 }, { id: 'milk', name: 'Milch', d: 1.03 }, { id: 'cream', name: 'Rahm', d: 1.0 },
  { id: 'water', name: 'Wasser', d: 1.0 }, { id: 'rice', name: 'Reis, roh', d: 0.8 }, { id: 'oats', name: 'Haferflocken', d: 0.35 },
  { id: 'cocoa', name: 'Kakaopulver', d: 0.4 }, { id: 'almonds', name: 'Gemahlene Mandeln', d: 0.4 }, { id: 'salt', name: 'Salz, fein', d: 1.2 },
];
/* Gasstufe, Grad Celsius (Ober-/Unterhitze) */
const UC_GAS = [[1, 140], [2, 150], [3, 165], [4, 180], [5, 190], [6, 200], [7, 220], [8, 230], [9, 240]];

function ucDefsKey() { let v = 'metric'; try { v = localStorage.getItem(UC_KEY) || 'metric'; } catch (e) {} return UC_DEFS[v] ? v : 'metric'; }
function ucVolumeTable() { const d = UC_DEFS[ucDefsKey()]; return { ml: 1, dl: 100, l: 1000, tsp: d.tsp, tbsp: d.tbsp, cup: d.cup, floz: 29.5735 }; }
function ucFmt(v) {
  if (!isFinite(v)) return '–';
  if (v !== 0 && Math.abs(v) < 0.005) return String(Number(v.toPrecision(2)));   // kleine Werte nicht zu 0 runden
  const r = v >= 100 ? Math.round(v) : v >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100;
  return String(r);
}
function ucTabDef() {
  let t = UC_TABS.find(x => x.id === state.ucTab);
  if (!t) t = (state.ucUnit && UC_WEIGHT[state.ucUnit]) ? UC_TABS[0] : (state.ucUnit && ucVolumeTable()[state.ucUnit]) ? UC_TABS[1] : UC_TABS[0];
  return t;
}
function ucEnsureState() {
  const t = ucTabDef();
  if (state.ucTab !== t.id) state.ucTab = t.id;
  if (state.ucAmount === undefined) state.ucAmount = t.amount;
  if (!t.units.includes(state.ucUnit)) { state.ucUnit = t.unit; state.ucAmount = t.amount; }
  if (!UC_FOODS.some(f => f.id === state.ucFood)) state.ucFood = 'flour';
  return t;
}
function ucSwitchTab(id) {
  const t = UC_TABS.find(x => x.id === id) || UC_TABS[0];
  state.ucMem = state.ucMem || {};
  state.ucMem[state.ucTab] = { amount: state.ucAmount, unit: state.ucUnit };
  const mem = state.ucMem[t.id];
  state.ucTab = t.id;
  state.ucUnit = mem && t.units.includes(mem.unit) ? mem.unit : t.unit;
  state.ucAmount = mem ? mem.amount : t.amount;
}

/* ---------- Ergebnisse ---------- */
function ucRow(value, unitLabel, note) {
  const text = `${value} ${unitLabel}`;
  return `<button type="button" class="uc-result-row" data-copy="${escapeHtml(text)}" aria-label="${escapeHtml(text)} kopieren">
    <span class="uc-result-value">${escapeHtml(String(value))}</span><span class="uc-result-unit">${escapeHtml(unitLabel)}</span>
    ${note ? `<span class="uc-result-note">${escapeHtml(note)}</span>` : ''}
    <span class="uc-result-copy" aria-hidden="true">${ICONS.copy || ICONS.check}</span>
  </button>`;
}
function ucGroup(title, rows) {
  return `<div class="uc-dim-label">${escapeHtml(title)}</div><div class="uc-result-list">${rows.join('')}</div>`;
}
function ucError(msg) { return `<p class="uc-error" role="alert">${escapeHtml(msg)}</p>`; }

function ucGasFor(c) {
  if (c < 130 || c > 250) return null;
  return UC_GAS.reduce((best, g) => Math.abs(g[1] - c) < Math.abs(best[1] - c) ? g : best, UC_GAS[0]);
}
function ucTempResults(parsed, unit) {
  let c;
  if (unit === 'gas') {
    const g = UC_GAS.find(x => x[0] === Math.round(parsed.value));
    if (!g || Math.abs(parsed.value - Math.round(parsed.value)) > 1e-9) return ucError('Gasstufe: bitte eine ganze Zahl von 1 bis 9 eingeben.');
    c = g[1];
  } else if (unit === 'f') {
    if (parsed.value < 32 || parsed.value > 932) return ucError('Bitte eine Temperatur zwischen 32 und 932 °F eingeben.');
    c = (parsed.value - 32) * 5 / 9;
  } else {
    if (parsed.value < 0 || parsed.value > 500) return ucError('Bitte eine Temperatur zwischen 0 und 500 °C eingeben.');
    c = parsed.value;
  }
  const rows = [];
  if (unit !== 'c') rows.push(ucRow(Math.round(c), '°C', 'Ober-/Unterhitze'));
  if (unit !== 'f') rows.push(ucRow(Math.round(c * 9 / 5 + 32), '°F'));
  if (unit !== 'gas') {
    const g = ucGasFor(c);
    rows.push(g ? ucRow(g[0], 'Gasstufe', g[1] === Math.round(c) ? '' : `nächste Stufe, ${g[1]} °C`) : `<div class="uc-result-row uc-result-row--static"><span class="uc-result-value">–</span><span class="uc-result-unit">Gasstufe</span><span class="uc-result-note">ausserhalb von 130 bis 250 °C</span></div>`);
  }
  rows.push(ucRow(Math.max(0, Math.round(c - 20)), '°C', 'Heissluft, etwa 20 °C weniger'));
  return ucGroup(unit === 'c' ? 'Entspricht' : 'Entspricht', rows);
}
function ucMassVolumeResults(amount, unit, tab) {
  const vol = ucVolumeTable();
  if (tab === 'food') {
    const food = UC_FOODS.find(f => f.id === state.ucFood) || UC_FOODS[0];
    const ml = UC_WEIGHT[unit] ? (amount * UC_WEIGHT[unit]) / food.d : amount * vol[unit];
    const g = ml * food.d;
    const wRows = ['g', 'kg'].filter(u => u !== unit).map(u => ucRow('≈ ' + ucFmt(g / UC_WEIGHT[u]), UC_LABELS[u]));
    const vRows = ['ml', 'dl', 'l', 'tsp', 'tbsp', 'cup'].filter(u => u !== unit).map(u => ucRow('≈ ' + ucFmt(ml / vol[u]), UC_LABELS[u]));
    return ucGroup('Gewicht', wRows) + ucGroup('Volumen', vRows) +
      `<p class="settings-hint">Richtwerte für ${escapeHtml(food.name)}: Sorte, Feuchte und wie fest gepackt wird, verändern das Gewicht. Für genaues Backen wiegen.</p>`;
  }
  const table = tab === 'weight' ? UC_WEIGHT : vol;
  const rows = Object.keys(table).filter(u => u !== unit).map(u => ucRow(ucFmt((amount * table[unit]) / table[u]), UC_LABELS[u]));
  return `<div class="uc-result-list">${rows.join('')}</div>`;
}
function unitConverterResultsHtml() {
  const tab = ucEnsureState();
  const parsed = parseQuantityInput(state.ucAmount);
  if (parsed.error) return ucError(parsed.error);
  if (tab.id === 'temp') return ucTempResults(parsed, state.ucUnit);
  if (parsed.value < 0 || parsed.value > 1e6) return ucError("Bitte eine Menge zwischen 0 und 1'000'000 eingeben.");
  return ucMassVolumeResults(parsed.value, state.ucUnit, tab.id);
}

/* ---------- Ansicht ---------- */
function unitConverterView() {
  const tab = ucEnsureState();
  const unitOptions = tab.units.map(u => `<option value="${u}" ${u === state.ucUnit ? 'selected' : ''}>${UC_LABELS[u]}</option>`).join('');
  const foodField = tab.id === 'food'
    ? `<div class="uc-field"><label for="ucIngredient">Zutat</label><select id="ucIngredient" class="uc-select">${UC_FOODS.map(f => `<option value="${f.id}" ${f.id === state.ucFood ? 'selected' : ''}>${escapeHtml(f.name)}</option>`).join('')}</select></div>`
    : '';
  const quick = (UC_QUICK[state.ucUnit] || []).map(v => `<button type="button" class="uc-chip" data-action="uc-quick" data-value="${v}">${v}</button>`).join('');
  const defs = ucDefsKey();
  const defsBox = (tab.id === 'volume' || tab.id === 'food')
    ? `<div class="uc-defs"><div class="uc-dim-label">Löffel und Tasse</div>
        <div class="theme-switch" role="radiogroup" aria-label="Löffel und Tasse">${Object.keys(UC_DEFS).map(k => `<button type="button" class="theme-opt ${defs === k ? 'active' : ''}" role="radio" aria-checked="${defs === k}" data-action="uc-defs" data-id="${k}">${UC_DEFS[k].label}</button>`).join('')}</div>
        <p class="settings-hint settings-hint--top">${escapeHtml(UC_DEFS[defs].desc)}. Rezepte aus den USA meinen meist die US-Werte.</p></div>`
    : '';
  const tempTable = tab.id === 'temp'
    ? `<div class="uc-defs"><div class="uc-dim-label">Gängige Backofen-Stufen</div><div class="uc-table" role="group" aria-label="Backofen-Stufen, antippen zum Übernehmen">
        <div class="uc-table-head" aria-hidden="true"><span>Gas</span><span>°C</span><span>°F</span><span>Heissluft</span></div>
        ${UC_GAS.map(g => `<button type="button" class="uc-table-row" data-action="uc-temp-row" data-c="${g[1]}" aria-label="Gasstufe ${g[0]}, ${g[1]} Grad Celsius, ${Math.round(g[1] * 9 / 5 + 32)} Grad Fahrenheit, Heissluft ${g[1] - 20} Grad"><span>${g[0]}</span><span>${g[1]}</span><span>${Math.round(g[1] * 9 / 5 + 32)}</span><span>${g[1] - 20}</span></button>`).join('')}
      </div></div>`
    : '';
  return `
    ${topbar('Masseinheiten-Rechner', { back: true })}
    <main class="has-tabbar uc-page">
      <div class="uc-tabs" role="tablist" aria-label="Art der Umrechnung">
        ${UC_TABS.map(t => `<button type="button" role="tab" class="uc-tab ${t.id === tab.id ? 'is-active' : ''}" aria-selected="${t.id === tab.id}" data-action="uc-tab" data-id="${t.id}">${t.label}</button>`).join('')}
      </div>
      <section class="uc-card">
        ${foodField}
        <div class="uc-input-row">
          <div class="uc-field uc-field--amount"><label for="ucAmount">Menge</label><input type="text" inputmode="decimal" id="ucAmount" class="uc-input" value="${escapeHtml(state.ucAmount)}" aria-describedby="ucResults" autocomplete="off"></div>
          <div class="uc-field"><label for="ucUnit">Einheit</label><select id="ucUnit" class="uc-select">${unitOptions}</select></div>
        </div>
        ${quick ? `<div class="uc-quick" role="group" aria-label="Schnellwerte">${quick}</div>` : ''}
        <p class="settings-hint">Komma oder Punkt, auch Brüche wie 1/2 oder ½. Tippe auf ein Ergebnis, um es zu kopieren.</p>
      </section>
      <div id="ucResults" aria-live="polite">${unitConverterResultsHtml()}</div>
      ${defsBox}${tempTable}
    </main>
    ${bottomNav()}
  `;
}

/* Eingaben: nur die Ergebnisse neu zeichnen, damit das Eingabefeld den Fokus behaelt */
function ucBindInputs() {
  const amount = document.getElementById('ucAmount');
  const unit = document.getElementById('ucUnit');
  const food = document.getElementById('ucIngredient');
  if (!amount || !unit) return;
  const box = document.getElementById('ucResults');
  const results = () => { box.innerHTML = unitConverterResultsHtml(); };
  // Ergebniszeilen werden beim Tippen neu gezeichnet: ein Listener am festen Container bleibt gueltig
  box.addEventListener('click', (ev) => { const b = ev.target.closest('[data-copy]'); if (b) ucCopy(b.dataset.copy); });
  amount.addEventListener('input', () => { state.ucAmount = amount.value; results(); });
  unit.addEventListener('change', () => { state.ucUnit = unit.value; render(); });   // Schnellwerte hängen an der Einheit
  if (food) food.addEventListener('change', () => { state.ucFood = food.value; results(); });
}
function ucCopy(text) {
  const done = () => showToast('Kopiert: ' + text);
  const fallback = () => {
    try { const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done(); }
    catch (e) { showToast('Kopieren nicht möglich', 'error'); }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
}
