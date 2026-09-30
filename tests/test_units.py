"""Einheiten: dl und cl (Schweiz) in Erkennung, Umrechnung, Skalierung und Einkaufsliste."""
import asyncio, sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

async def main():
    async with async_playwright() as p:
        browser, ctx = await open_ctx(p, 390, 844)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(400)
        ev = page.evaluate
        check('dl, Dl, Deziliter, cl werden erkannt', await ev("['dl', 'Dl', 'Deziliter', 'cl', 'Zentiliter'].map(normalizeUnit)") == ['dl', 'dl', 'dl', 'cl', 'cl'])
        check('dl und cl sind Volumen, 1 dl = 100 ml, 1 cl = 10 ml', await ev("[unitDimension('dl'), unitDimension('cl'), convertAmountExplicit(1, 'dl', 'ml'), convertAmountExplicit(5, 'cl', 'ml'), convertAmountExplicit(250, 'ml', 'dl')]") == ['volume', 'volume', 100, 50, 2.5])
        check('Metrische Einheiten bleiben bei metrischer Einstellung unverändert', await ev("convertToSystem(2, 'dl', 'metric')") is None)
        imp = await ev("convertToSystem(2, 'dl', 'imperial')")
        check('Imperial: 2 dl = 6.76 fl oz', imp and imp['unit'] == 'floz' and abs(imp['amount'] - 6.76) < 0.01, str(imp))
        # Einkaufsliste: dl und ml werden zusammengefuehrt
        res = await ev("""async () => { for (const s of (await dbGetAllShopping())) await dbDeleteShopping(s.id); await loadShopping();
          const r1 = emptyRecipe(); r1.id = 'r_dl1'; r1.title = 'A'; r1.servings = 2; r1.ingredients = [{ amount: '1', unit: 'dl', name: 'Milch' }, { amount: '2', unit: 'dl', name: 'Rahm' }];
          const r2 = emptyRecipe(); r2.id = 'r_dl2'; r2.title = 'B'; r2.servings = 2; r2.ingredients = [{ amount: '200', unit: 'ml', name: 'Milch' }, { amount: '1', unit: 'dl', name: 'Rahm' }];
          await addRecipeIngredientsToShopping(r1, 2); await addRecipeIngredientsToShopping(r2, 2);
          return state.shopping.map(s => [s.name, s.amount, s.unit]); }""")
        check('Einkauf: 1 dl + 200 ml Milch = 3 dl, 2 dl + 1 dl Rahm = 3 dl (eine Zeile je Zutat)', sorted(res) == [['Milch', 3, 'dl'], ['Rahm', 3, 'dl']], str(res))
        # Nährwerte kennen dl (2 dl Milch = 206 g, 100 g Mehl: rund 465 kcal)
        n = await ev("""async () => { const r = emptyRecipe(); r.id = 'r_nu'; r.title = 'N'; r.servings = 1; r.ingredients = [{ amount: '2', unit: 'dl', name: 'Milch' }, { amount: '100', unit: 'g', name: 'Mehl' }]; r.steps = [{ text: 'x' }];
          await ensureSwissDataSeeded(); const res = await calculateRecipeNutrition(r); return [res.matchedCount, Math.round(res.totalWeight), Math.round(res.nutrientsTotal.energyKcal)]; }""")
        check('Nährwerte: 2 dl Milch und 100 g Mehl = 2 Zutaten erkannt, 306 g, 440 bis 490 kcal', n[0] == 2 and n[1] == 306 and 440 <= n[2] <= 490, str(n))
        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await browser.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
