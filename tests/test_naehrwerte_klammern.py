"""Naehrwerte und Klammern: Text in Klammern ("(Ei verquirlen)", "(fein geraspelt)") zaehlt nicht zum Zutatennamen.
Neu importierte Zeilen behalten das Zutatenwort als Namen; bereits gespeicherte Rezepte (Zutatenwort als Einheit, Klammer als Name)
werden erst bei der Berechnung zur Laufzeit richtig gelesen, gespeicherte Daten bleiben unveraendert."""
import asyncio, sys, json
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

MANTI = ["200 g Mehl (+ etwas Mehl zum Ausrollen)", "75 ml Wasser", "1/2 Ei (Ei verquirlen und die Hälfte nehmen)", "1/4 EL (ca. 1 gestrichener TL) Salz",
         "150 g Hackfleisch (Rind)", "1/2 Zwiebel (fein geraspelt)", "1/2 Knoblauchzehe (fein geraspelt)", "1/2 Handvoll glatte Petersilie (sehr fein gehackt)", "1/2 EL Olivenöl"]
# Altbestand: Zutatenwort steht in der Einheit, im Namen nur die Klammer (so zeigt es der Screenshot des Fehlerberichts)
ALT = [["200", "g", "Mehl (+ etwas Mehl zum Ausrollen)"], ["75", "ml", "Wasser"], ["1/2", "Ei", "(Ei verquirlen und die Hälfte nehmen)"], ["1/4", "EL", "(ca. 1 gestrichener TL) Salz"],
       ["150", "g", "Hackfleisch (Rind)"], ["1/2", "Zwiebel", "(fein geraspelt)"], ["1/2", "Knoblauchzehe", "(fein geraspelt)"], ["1/2", "Handvoll", "glatte Petersilie (sehr fein gehackt)"], ["1/2", "EL", "Olivenöl"]]

CALC = """async (ings) => { await ensureSwissDataSeeded();
  const res = await calculateRecipeNutrition({ id: 'klammer-test', servings: 4, ingredients: ings.map(a => ({ amount: a[0], unit: a[1], name: a[2] })), steps: [{ text: 'Alles mischen und servieren, bis es fertig ist.' }] });
  const rows = [];
  for (const a of ings) { const raw = { amount: a[0], unit: a[1], name: a[2] }; const p = Object.assign({}, raw, nutPrepareIngredient(raw)); const m = await matchIngredient(p.name, [], { originalName: raw.name });
    const g = m.food ? resolveIngredientGrams(p, m.food) : null; rows.push({ name: p.name, unit: p.unit, status: m.status, food: m.food ? m.food.name : (m.skipped || null), grams: g ? g.grams : null }); }
  return { rows, res: { total: res.nutrientsTotal, relevant: res.relevantCount, matched: res.matchedCount, unresolved: res.unresolvedIngredients, unquantified: res.unquantified }, ingIn: JSON.stringify(ings) }; }"""

async def main():
    async with async_playwright() as p:
        b, c = await open_ctx(p, 390, 844); page = await c.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.wait_for_timeout(300)
        ev = page.evaluate
        # 1) Import-Zeilen: Zutatenwort bleibt der Name, Klammern bleiben am Namen erhalten
        parsed = await ev("(L) => L.map(l => { const r = parseFreeTextRecipe('Test\\nZutaten\\n' + l + '\\nZubereitung\\nMischen und servieren, bis alles fertig ist.'); const i = r.ingredients[0]; return [i.amount, i.unit, i.name]; })", MANTI)
        check('Import: 1/2 Ei (...) behält Ei als Namen', parsed[2][1] == '' and parsed[2][2].startswith('Ei ('), str(parsed[2]))
        check('Import: Zwiebel und Knoblauchzehe behalten ihren Namen', parsed[5][1] == '' and parsed[5][2].startswith('Zwiebel') and parsed[6][2].startswith('Knoblauchzehe'), str(parsed[5:7]))
        check('Import: 1/4 EL (ca. 1 gestrichener TL) Salz', parsed[3][1] == 'EL' and parsed[3][2].endswith('Salz') and parsed[3][2].startswith('('), str(parsed[3]))
        check('Import: Klammerzusätze gehen nicht verloren', '(Rind)' in parsed[4][2] and '(sehr fein gehackt)' in parsed[7][2] and '(+ etwas Mehl zum Ausrollen)' in parsed[0][2], str([parsed[0], parsed[4], parsed[7]]))
        stueck = await ev("(L) => L.map(l => { const q = qtyParseLine(l); return [q.amount, q.unit, q.name]; })", ["1 Zehe (fein geraspelt)", "1 Bund (frisch)", "2 EL (gehäuft)", "1 Zehe Knoblauch (fein)", "1 Dose (400 g) Tomaten"])
        check('Stückwort ist nur Einheit, wenn danach ein Name folgt', stueck[0][1] == '' and stueck[0][2].startswith('Zehe') and stueck[1][1] == '' and stueck[3][1] == 'Zehe' and stueck[3][2].startswith('Knoblauch') and stueck[4][1] == 'Dose', str(stueck))
        check('Masseinheit bleibt Einheit', stueck[2][1] == 'EL', str(stueck[2]))
        leg = await ev("(l) => parseIngredientLine(l)", "1/2 Ei (Ei verquirlen)")
        check('parseIngredientLine: Ei wird nicht zur Einheit', leg['unit'] == '' and leg['name'].startswith('Ei'), str(leg))
        # 2) Berechnung: neue Import-Form und Altbestand liefern dieselben Zuordnungen
        new = await ev(CALC, parsed); alt = await ev(CALC, ALT)
        for label, r in (('Import', new), ('Altbestand', alt)):
            names = [x['name'] for x in r['rows']]
            check(f'{label}: Namen ohne Klammern', names == ['Mehl', 'Wasser', 'Ei', 'Salz', 'Hackfleisch', 'Zwiebel', 'Knoblauchzehe', 'glatte Petersilie', 'Olivenöl'], str(names))
            check(f'{label}: alle neun Zutaten zugeordnet (Wasser nicht kalorisch)', all(x['status'] == 'matched' for x in r['rows']), str([x['food'] for x in r['rows']]))
            check(f'{label}: Ei, Zwiebel, Knoblauch als Stück gerechnet', all(x['grams'] and x['grams'] > 0 for x in r['rows'][2:3] + r['rows'][5:7]), str([x['grams'] for x in r['rows']]))
            check(f'{label}: nichts nicht zugeordnet', not r['res']['unresolved'] and r['res']['relevant'] == 8 and r['res']['matched'] == 8, str(r['res']['unresolved']))
        check('Altbestand rechnet gleich wie neuer Import', json.dumps(new['res']['total'], sort_keys=True) == json.dumps(alt['res']['total'], sort_keys=True) and new['rows'] == alt['rows'])
        check('Altbestand-Eingabe bleibt unverändert (keine Datenmigration)', alt['ingIn'] == json.dumps(ALT, separators=(',', ':'), ensure_ascii=False))
        tot = new['res']['total'] or {}
        check('Kalorien berechnet, fehlende Werte bleiben null statt 0', isinstance(tot.get('energyKcal'), (int, float)) and tot['energyKcal'] > 300 and all(v is None or v >= 0 for v in tot.values()), str({k: tot[k] for k in list(tot)[:4]}))
        # 3) Klammer ohne Zutatenwort: ehrlich als nicht berechenbar melden, nie still weglassen
        nn = await ev(CALC, [["100", "g", "(Rind)"], ["2", "EL", "Olivenöl (optional)"], ["", "", "Salz (nach Geschmack)"], ["1", "Zehe", "(fein)"], ["200", "g", "Mehl"]])
        un = nn['res']['unresolved']
        check('Nur Klammer ohne Zutatenwort: als "Name fehlt" gemeldet', sum(1 for u in un if u['reason'] == 'no-name') == 2 and nn['res']['relevant'] == 3, str(un))
        check('(optional) in Klammern zählt wie vorher als bewusst ausgelassen', not any('Olivenöl' in u['name'] for u in un) and nn['res']['relevant'] == 3)
        # 4) Frueher bestaetigte Zuordnung unter dem vollen Namen (mit Klammer) gilt weiter
        r = await ev("""async () => { await ensureSwissDataSeeded(); const foods = await searchSwissFoods('Kartoffeln', 3); const f = foods[0]; await confirmIngredientMatch('Kartoffeln (festkochend)', f.id);
          const m = await matchIngredient('Kartoffeln', [], { originalName: 'Kartoffeln (festkochend)' }); const m2 = await matchIngredient('Kartoffeln (festkochend)', []);
          await resetIngredientMatch('Kartoffeln (festkochend)'); return { a: m.confirmed && m.food.id === f.id, b: m2.confirmed && m2.food.id === f.id }; }""")
        check('Bestätigte Zuordnung mit Klammer-Name bleibt gültig', r['a'] and r['b'], str(r))
        # 5) Ganzer Weg ueber die Oberflaeche: Manti als Text importieren, speichern, Reiter Naehrwerte
        await ev("() => { state.view = 'paste-import'; state.modal = null; render(); }"); await page.wait_for_selector('#pasteText')
        await page.fill('#pasteText', 'Türkische Manti\n4 Portionen\nZutaten\nFür den Teig:\n' + '\n'.join(MANTI[:4]) + '\nFür die Füllung:\n' + '\n'.join(MANTI[4:]) + '\nZubereitung\n1. Teig kneten und ruhen lassen.\n2. Füllung mischen, Teig füllen und kochen.')
        await page.evaluate("document.querySelector('[data-action=\"do-paste-import\"]').click()"); await page.wait_for_selector('#recipeForm', timeout=8000)
        await page.evaluate("document.querySelector('[data-action=\"save-recipe\"]').click()"); await page.wait_for_timeout(600)
        rid = await ev("state.recipes.slice().sort((a, b) => b.createdAt - a.createdAt)[0].id")
        saved = await ev("(id) => state.recipes.find(r => r.id === id).ingredients.map(i => [i.amount, i.unit, i.name])", rid)
        check('Gespeichert: Ei, Zwiebel, Knoblauchzehe mit Namen, ohne Zutatenwort in der Einheit', any(i[2].startswith('Ei') and not i[1] for i in saved) and any(i[2].startswith('Zwiebel') and not i[1] for i in saved), str(saved)[:200])
        await ev("(id) => { state.activeRecipeId = id; state.view = 'detail'; state.detailTab = 'nutrition'; state.modal = null; render(); }", rid)
        await page.wait_for_function("() => { const n = document.querySelector('[data-lazy-nutrition]'); return n && !n.classList.contains('nutrition-card-loading'); }", timeout=10000)
        txt = await ev("document.querySelector('#panel-nutrition').innerText")
        check('Nährwerte-Reiter: kcal da, nichts "nicht gefunden"', 'kcal' in txt and 'nicht gefunden' not in txt and 'Noch nicht berechnet' not in txt, txt.replace('\n', ' ')[:160])
        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await b.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
