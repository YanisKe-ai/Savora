"""Nährwerte: Mengenbereiche als Spanne (kein Mittelwert, keine stille Untergrenze), Packungsangaben nur einmal multipliziert, unbekannte Ausbeute."""
import asyncio, sys, json
import os as _os
_os.environ.setdefault('SAVORA_TEST_PORT', '8961')
sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)
RANGE = [{'amount': '200-300', 'unit': 'g', 'name': 'Kartoffeln'}, {'amount': '50-70', 'unit': 'g', 'name': 'Parmesan (gerieben)'},
         {'amount': '', 'unit': '', 'name': 'Pfeffer'}, {'amount': '', 'unit': '', 'name': 'Muskat'}]
EXACT = [{'amount': '250', 'unit': 'g', 'name': 'Kartoffeln'}, {'amount': '60', 'unit': 'g', 'name': 'Parmesan (gerieben)'},
         {'amount': '', 'unit': '', 'name': 'Pfeffer'}, {'amount': '', 'unit': '', 'name': 'Muskat'}]
CALC = """async ([ings, servings]) => { await ensureSwissDataSeeded(); const r = { id: 'rg', servings, steps: [], ingredients: ings };
  const res = await calculateRecipeNutrition(r); return res; }"""
async def main():
    async with async_playwright() as p:
        b, c = await open_ctx(p, 800, 600); page = await c.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.wait_for_timeout(400)
        ev = page.evaluate
        # 1) Auflösung der Gramm
        g = await ev("""() => { const f = { name: 'x', density: null }; const R = (a, u, n) => resolveIngredientGrams({ amount: a, unit: u, name: n }, f);
          return { range: R('200-300', 'g', 'Kartoffeln'), exact: R('250', 'g', 'Kartoffeln'), kg: R('1-2', 'kg', 'Mehl'), unk: R('1-2', 'EL', 'Xyz'), piece: R('2-3', '', 'Zwiebel') }; }""")
        check('Bereich: gramsMin/gramsMax, grams null, range true', g['range']['gramsMin'] == 200 and g['range']['gramsMax'] == 300 and g['range']['grams'] is None and g['range']['range'] is True, str(g['range']))
        check('Exakte Menge unverändert (grams 250, kein range)', g['exact']['grams'] == 250 and not g['exact'].get('range') and 'gramsMin' not in g['exact'], str(g['exact']))
        check('Bereich in kg wird je Grenze umgerechnet', g['kg']['gramsMin'] == 1000 and g['kg']['gramsMax'] == 2000, str(g['kg']))
        check('Bereich mit unbekannter Umrechnung bleibt ungeklärt', g['unk']['gramsMin'] is None and g['unk']['range'] is True and g['unk']['needsConfirmation'] is True, str(g['unk']))
        check('Bereich bei Stückzahl: beide Grenzen geschätzt', g['piece']['gramsMin'] == 220 and g['piece']['gramsMax'] == 330 and g['piece']['estimated'] is True, str(g['piece']))
        # 2) Rezept mit Bereichen
        r = await ev(CALC, [RANGE, 9])
        e = await ev(CALC, [EXACT, 9])
        k = r['nutrientsPerPortionRange']['energyKcal']
        check('Bereichsrezept: rangeUsed true', r['rangeUsed'] is True)
        check('kcal pro Portion als Spanne mit min<max', k is not None and k['min'] < k['max'], str(k))
        check('kcal pro Portion: kein Exaktwert', r['nutrientsPerPortion']['energyKcal'] is None and r['nutrientsTotal']['energyKcal'] is None and r['nutrientsPer100g']['energyKcal'] is None)
        kt = r['nutrientsTotalRange']['energyKcal']; k100 = r['nutrientsPer100gRange']['energyKcal']
        check('Gesamt- und Pro-100-g-Spanne vorhanden', kt['min'] < kt['max'] and k100['min'] <= k100['max'], str((kt, k100)))
        lo = await ev(CALC, [[{'amount': '200', 'unit': 'g', 'name': 'Kartoffeln'}, {'amount': '50', 'unit': 'g', 'name': 'Parmesan (gerieben)'}], 9])
        hi = await ev(CALC, [[{'amount': '300', 'unit': 'g', 'name': 'Kartoffeln'}, {'amount': '70', 'unit': 'g', 'name': 'Parmesan (gerieben)'}], 9])
        check('Untergrenze = exakte Rechnung mit Minima, Obergrenze = mit Maxima', abs(k['min'] - lo['nutrientsPerPortion']['energyKcal']) <= 0.06 and abs(k['max'] - hi['nutrientsPerPortion']['energyKcal']) <= 0.06, f"{k} vs {lo['nutrientsPerPortion']['energyKcal']} / {hi['nutrientsPerPortion']['energyKcal']}")
        check('Mittelwert wird nirgends als Wert geführt', all(r['nutrientsPerPortion'][x] is None or r['nutrientsPerPortionRange'][x]['min'] == r['nutrientsPerPortionRange'][x]['max'] for x in r['nutrientsPerPortion']))
        check('confidenceDetail nennt die Spanne', 'bei 2 Zutaten Mengenbereich: Ergebnis als Spanne' in r['confidenceDetail'], r['confidenceDetail'])
        check('Bereichszutaten zählen als erkannt, nicht als ungeklärt', r['unresolvedCount'] == 0 and r['matchedCount'] == 2 and r['complete'] is True, f"{r['matchedCount']}/{r['relevantCount']} {r['unresolvedIngredients']}")
        # 3) Exaktes Rezept unverändert
        check('Exaktes Rezept: rangeUsed false, Exaktwert vorhanden, Spannenfelder leer', e['rangeUsed'] is False and e['nutrientsPerPortion']['energyKcal'] > 0 and e['nutrientsPerPortionRange'] == {} and e['nutrientsPer100gRange'] == {} and e['nutrientsTotalRange'] == {}, str(e['nutrientsPerPortion']['energyKcal']))
        check('Exaktes Rezept: kein Hinweis auf Spanne', 'Mengenbereich' not in e['confidenceDetail'] and e['needsServings'] is False and e['servings'] == 9)
        check('Exakter Wert liegt innerhalb der Spanne', k['min'] <= e['nutrientsPerPortion']['energyKcal'] <= k['max'], f"{k} / {e['nutrientsPerPortion']['energyKcal']}")
        # 4) Qualitative / negligible
        q = await ev("""() => ({ a: isNegligibleAmount({ amount: '1-2', unit: 'g', name: 'Pfeffer' }), b: isNegligibleAmount({ amount: '5-50', unit: 'g', name: 'Pfeffer' }), c: isQualitativeIngredient({ amount: '200-300', unit: 'g', name: 'Mehl' }), d: isQualitativeIngredient({ amount: '', unit: '', name: 'Pfeffer nach Geschmack' }), h1: hashIngredientsForNutrition([{ amount: '200-300', unit: 'g', name: 'a' }], 4), h2: hashIngredientsForNutrition([{ amount: '200-300', unit: 'g', name: 'a' }], 4), h3: hashIngredientsForNutrition([{ amount: '200-400', unit: 'g', name: 'a' }], 4) })""")
        check('negligible: kleiner Bereich ja, Bereich mit grosser Obergrenze nein', q['a'] is True and q['b'] is False, str(q))
        check('qualitativ: Bereich nein, "nach Geschmack" ja', q['c'] is False and q['d'] is True)
        check('Hash stabil und bereichsempfindlich', q['h1'] == q['h2'] and q['h1'] != q['h3'])
        # 5) Packungen
        pk = await ev("""async () => { await ensureSwissDataSeeded(); const out = {}; const prep = (a, u, n) => { const raw = { amount: a, unit: u, name: n }; return Object.assign({}, raw, nutPrepareIngredient(raw)); };
          out.a = prep('2', 'Dose', 'Tomaten à 400 g'); out.b = prep('2', 'Dosen', 'Tomaten (400 g)'); out.c = prep('2-3', 'Dosen', 'Tomaten à 400 g'); out.d = prep('2', 'Dose', 'Tomaten');
          out.e = prep('1', 'Dose', 'Tomaten, je 400 g'); out.f = prep('800', 'g', 'Tomaten (2 Dosen à 400 g)');
          const gr = async (ing) => { const p2 = Object.assign({}, ing, nutPrepareIngredient(ing)); const m = await matchIngredient(p2.name, []); return resolveIngredientGrams(p2, m.food); };
          out.ga = await gr({ amount: '2', unit: 'Dose', name: 'gehackte Tomaten à 400 g' }); out.gc = await gr({ amount: '2-3', unit: 'Dosen', name: 'gehackte Tomaten à 400 g' });
          return out; }""")
        check('"2 Dosen Tomaten à 400 g" = 800 g (nicht 1600)', pk['a']['amount'] == 800 and pk['a']['unit'] == 'g' and 'à' not in pk['a']['name'], str(pk['a']))
        check('"2 Dosen Tomaten (400 g)" = 800 g', pk['b']['amount'] == 800 and pk['b']['unit'] == 'g', str(pk['b']))
        check('Bereich x Packungsinhalt: 800-1200 g, einmal multipliziert', pk['c']['amount'] == '800-1200' and pk['c']['unit'] == 'g', str(pk['c']))
        check('Dose ohne Grössenangabe bleibt unverändert', pk['d']['amount'] == '2' and pk['d']['unit'] == 'Dose')
        check('"je 400 g" wird wie "à" behandelt', pk['e']['amount'] == 400 and pk['e']['unit'] == 'g' and pk['e']['name'] == 'Tomaten', str(pk['e']))
        check('Bereits in g angegeben: Klammer wird nicht noch einmal multipliziert', pk['f']['amount'] == '800' and pk['f']['unit'] == 'g', str(pk['f']))
        check('Gramm für 2 Dosen à 400 g = 800', pk['ga']['grams'] == 800, str(pk['ga']))
        check('Gramm für 2-3 Dosen à 400 g = 800-1200', pk['gc']['gramsMin'] == 800 and pk['gc']['gramsMax'] == 1200, str(pk['gc']))
        # 6) Ausbeute unbekannt
        for sv in (None, 0, ''):
            n = await ev(CALC, [EXACT, sv])
            check(f'servings={sv!r}: needsServings, keine Pro-Portion-Werte, Gesamtwerte bleiben', n['needsServings'] is True and n['servings'] is None and all(v is None for v in n['nutrientsPerPortion'].values()) and n['nutrientsTotal']['energyKcal'] > 0, n['confidenceDetail'][-60:])
        n = await ev(CALC, [RANGE, None])
        check('Bereich + unbekannte Ausbeute: Pro-Portion leer, Gesamtspanne da', n['needsServings'] and n['rangeUsed'] and n['nutrientsPerPortionRange']['energyKcal'] is None and n['nutrientsTotalRange']['energyKcal']['min'] < n['nutrientsTotalRange']['energyKcal']['max'])
        # 7) Anzeige
        ui = await ev("""async ([ings, sv]) => { await ensureSwissDataSeeded(); const res = await calculateRecipeNutrition({ id: 'rg', servings: sv, steps: [], ingredients: ings });
          const html = nutritionCompactInner({ id: 'rg', servings: sv, ingredients: ings }, res); const d = document.createElement('div'); d.innerHTML = html; return d.innerText || d.textContent; }""", [RANGE, 9])
        check('UI: Spanne mit Gedankenstrich + Dezimalkomma-Format, Hinweis, kein Exaktwert', '–' in ui and 'kcal' in ui and 'Menge als Bereich angegeben, Ergebnis als Spanne' in ui and any(ch.isdigit() for ch in ui), ui.replace('\n', ' ')[:200])
        ui2 = await ev("""async ([ings, sv]) => { await ensureSwissDataSeeded(); const res = await calculateRecipeNutrition({ id: 'rg', servings: sv, steps: [], ingredients: ings });
          const d = document.createElement('div'); d.innerHTML = nutritionCompactInner({ id: 'rg', servings: sv, ingredients: ings }, res); return d.textContent; }""", [EXACT, None])
        check('UI: unbekannte Ausbeute zeigt Hinweis und Gesamtwerte', 'Ausbeute unbekannt: Pro-Portion-Werte erst nach Klärung' in ui2 and 'Gesamtwerte' in ui2, ui2.replace('\n', ' ')[:200])
        pdf = await ev("""async ([ings, sv]) => { await ensureSwissDataSeeded(); const res = await calculateRecipeNutrition({ id: 'rg', servings: sv, steps: [], ingredients: ings }); return pvNutritionBox(res, 'full', false); }""", [RANGE, 9])
        check('PDF: Spanne und Hinweis', '–' in pdf and 'Menge als Bereich angegeben' in pdf, pdf[:160])
        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await b.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
