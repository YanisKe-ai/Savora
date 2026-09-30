"""Nährwerte: Erkennungsrate der Zutaten, Alias-Tabelle, Mengenumrechnung (Löffel, Stück, Packung), ehrliche Lücken."""
import asyncio, sys, json
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)
async def main():
    bench = json.load(open(_os.path.join(TESTS, 'data', 'nutrition_bench.json')))
    async with async_playwright() as p:
        b, c = await open_ctx(p, 800, 600); page = await c.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.wait_for_timeout(400)
        ev = page.evaluate
        missing = await ev("""async () => { await ensureSwissDataSeeded(); const out = []; for (const [terms, target] of NUTRITION_ALIAS_TABLE) { const f = await findSwissFoodByExactName(target); if (!f || f.name.toLowerCase() !== target.toLowerCase()) out.push(target); } return out; }""")
        check('Jedes Alias-Ziel existiert in der Schweizer Nährwertdatenbank', not missing, str(missing[:5]))
        res = await ev("""async (bench) => { const out = []; for (const [amount, unit, name, exp] of bench) { const m = await matchIngredient(name, []); const g = m.food ? resolveIngredientGrams({ amount, unit, name }, m.food) : { grams: null }; out.push({ name, status: m.status, skipped: m.skipped || null, food: m.food ? m.food.name : null, grams: g.grams, exp }); } return out; }""", bench)
        counted = [r for r in res if not r['skipped']]
        usable = [r for r in counted if r['status'] == 'matched' and r['grams'] is not None]
        correct = [r for r in usable if r['exp'] in (r['food'] or '').lower()]
        rate = len(usable) / len(counted)
        check('Erkennung + Menge: mindestens 92 % der Alltagszutaten berechenbar', rate >= 0.92, '%.1f %% (%d von %d)' % (rate * 100, len(usable), len(counted)))
        check('Erkannte Lebensmittel sind fast immer die richtigen (mind. 95 %)', len(correct) / max(1, len(usable)) >= 0.95, '%d von %d' % (len(correct), len(usable)))
        check('Wasser und Gewürze in Kleinstmengen werden nicht mitgerechnet', all(r['skipped'] for r in res if r['name'] in ('Wasser', 'Pfeffer', 'Backpulver', 'Currypulver')))
        conv = await ev("""() => { const g = (a, u, n, f) => resolveIngredientGrams({ amount: a, unit: u, name: n }, f || null).grams; return { tl: g('1', 'TL', 'Zucker', { name: 'Zucker, weiss', density: null }), el: g('2', 'EL', 'Olivenöl', { name: 'Olivenöl', density: null }), dl: g('2', 'dl', 'Milch', { name: 'Vollmilch, pasteurisiert', density: null }), prise: g('1', 'Prise', 'Salz'), unknown: g('1', 'EL', 'Xyz', { name: 'Xyz', density: null }) }; }""")
        check('Löffel/dl werden mit Richtdichten umgerechnet', abs(conv['tl'] - 4.25) < .01 and abs(conv['el'] - 27.6) < .01 and abs(conv['dl'] - 206) < .5, str(conv))
        check('Unbekannte Dichte bleibt ehrlich ungeklärt (kein erfundener Wert)', conv['unknown'] is None)
        calc = await ev("""async () => { const r = { id: 'nx', servings: 4, steps: [], ingredients: [
          { amount: '500', unit: 'g', name: 'Rindshackfleisch' }, { amount: '1', unit: '', name: 'Zwiebel' }, { amount: '2', unit: 'EL', name: 'Olivenöl' }, { amount: '1', unit: 'Dose', name: 'gehackte Tomaten' },
          { amount: '200', unit: 'g', name: 'Spaghetti' }, { amount: '1', unit: 'TL', name: 'Salz' }, { amount: '1', unit: 'TL', name: 'Pfeffer' }, { amount: '100', unit: 'ml', name: 'Wasser' }, { amount: '1', unit: 'EL', name: 'Miso' } ] };
          const res = await calculateRecipeNutrition(r); return { kcal: res.nutrientsPerPortion.energyKcal, matched: res.matchedCount, relevant: res.relevantCount, unresolved: res.unresolvedIngredients.map(u => u.name + ':' + u.reason), detail: res.confidenceDetail }; }""")
        check('Beispielrezept: Kalorien berechnet, nur "Miso" bleibt ungeklärt', calc['kcal'] and calc['kcal'] > 200 and calc['unresolved'] == ['Miso:not-found'], str(calc))
        # Grosse Liste (227 Zeilen) und die vier echten Rezepte des Nutzers (nur die Zutatenzeilen)
        big = [l.strip() for l in open(_os.path.join(TESTS, 'data', 'nutrition_big_lines.txt'), encoding='utf-8') if l.strip()]
        bres = await ev("""async (lines) => { const out = []; for (const line of lines) { const it = ingPasteParseLine(line); const m = await matchIngredient(it.name, []); const g = m.food ? resolveIngredientGrams(it, m.food) : { grams: null }; out.push({ ok: m.status === 'matched' && (g.grams !== null || !!m.skipped), line, food: m.food ? m.food.name : (m.skipped || null) }); } return out; }""", big)
        okc = sum(1 for r in bres if r['ok'])
        check('Grosse Zutatenliste: mindestens 98 % berechenbar', okc / len(bres) >= 0.98, f'{okc} von {len(bres)}; offen: {[r["line"] for r in bres if not r["ok"]][:4]}')
        wrong = [(r['line'], r['food']) for r in bres if (('Geschnetzeltes' in r['line'] and 'Currysauce' in (r['food'] or '')) or ('Chips' in r['line'] and 'Brot' in (r['food'] or '')))]
        check('Keine Fehlzuordnung zu Fertiggerichten (Geschnetzeltes, Chips)', not wrong, str(wrong))
        real = json.load(open(_os.path.join(TESTS, 'data', 'real_recipes_lines.json'), encoding='utf-8'))
        rr = await ev("""async (data) => { const out = {}; for (const [t, lines] of Object.entries(data)) { const r = await calculateRecipeNutrition({ id: 'x', servings: 4, steps: [], ingredients: lines.map(l => ingPasteParseLine(l)) }); out[t] = { unresolved: r.unresolvedIngredients.map(u => u.name), kcal: r.nutrientsPerPortion.energyKcal, complete: r.complete }; } return out; }""", real)
        check('Die vier echten Rezepte (Sloppy Joe, Manti, Carbonara, Cookies) sind vollständig berechenbar', all(v['complete'] and v['kcal'] > 100 for v in rr.values()), str({k: v['unresolved'] for k, v in rr.items() if v['unresolved']}))
        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await b.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
