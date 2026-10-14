"""Aufräumen: Barcode-Scan (Open Food Facts) und USDA-Anbindung sind entfernt; bereits gespeicherte off-Zuordnungen bleiben erhalten."""
import asyncio, sys, re
import os as _os
_os.environ.setdefault('SAVORA_TEST_PORT', '8962')
sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

def lese(name):
    return open(_os.path.join(ROOT, name), encoding='utf-8').read()

async def main():
    # (e) Service Worker verweist auf keine fehlende Datei, Dateien sind weg
    sw = lese('sw.js')
    shell = re.search(r"SHELL_ASSETS\s*=\s*\[(.*?)\]", sw, re.S).group(1)
    refs = re.findall(r"'\./([^']+)'", shell)
    fehlend = [r for r in refs if r and not _os.path.exists(_os.path.join(ROOT, r))]
    check('sw.js: keine fehlende Datei in SHELL_ASSETS', not fehlend and len(refs) > 20, str(fehlend))
    check('nutrition-off.js und nutrition-usda.js existieren nicht mehr', not _os.path.exists(_os.path.join(ROOT, 'nutrition-off.js')) and not _os.path.exists(_os.path.join(ROOT, 'nutrition-usda.js')))
    check('sw.js und index.html nennen die entfernten Dateien nicht', 'nutrition-off' not in sw and 'nutrition-usda' not in sw and 'nutrition-off' not in lese('index.html') and 'nutrition-usda' not in lese('index.html'))

    async with async_playwright() as p:
        b, c = await open_ctx(p, 390, 844); page = await c.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'favicon' not in m.text else None)
        await goto(page); await page.wait_for_timeout(300)
        ev = page.evaluate
        # (b) Funktionen existieren nicht mehr
        fn = await ev("() => ({ usda: typeof searchUsdaFoods, off: typeof fetchOffProductByBarcode, offs: typeof searchOffProducts, cam: typeof startNutritionBarcodeCamera, stop: typeof stopNutritionBarcodeCamera })")
        check('searchUsdaFoods, fetchOffProductByBarcode, searchOffProducts und Kamera-Logik fehlen', all(v == 'undefined' for v in fn.values()), str(fn))
        st = await ev("() => Object.keys(state).filter(k => /barcode/i.test(k))")
        check('Kein Barcode-Zustand mehr in state', not st, str(st))

        # (c) Rezept mit gespeicherter off-Zuordnung wird weiter berechnet
        r = await ev("""async () => {
          await ensureSwissDataSeeded();
          const n = emptyNutrients(); n.energyKcal = 250; n.protein = 8; n.fat = 10; n.carbohydrates = 30;
          await dbPutNutritionFoodsBulk([{ id: 'off-7612345678901', source: 'open-food-facts', sourceId: '7612345678901', barcode: '7612345678901', name: 'Testriegel', language: 'de', synonyms: [], category: null, brand: 'Testmarke', density: null, nutrientsPer100g: n, retrievedAt: 1 }]);
          await confirmIngredientMatch('Testriegel', 'off-7612345678901');
          const rec = { id: 'offrez', title: 'Off-Test', servings: 2, steps: ['Essen'], ingredients: [{ amount: '100', unit: 'g', name: 'Testriegel' }] };
          const res = await calculateRecipeNutrition(rec);
          const m = await matchIngredient('Testriegel', []);
          return { kcal: res.nutrientsTotal.energyKcal, perPortion: res.nutrientsPerPortion.energyKcal, protein: res.nutrientsTotal.protein, src: nutritionSourceLabel(res.sourceDataVersions), matched: m.status, confirmed: m.confirmed, foodId: m.food && m.food.id };
        }""")
        check('off-Zuordnung: Werte werden weiter berechnet', r['kcal'] == 250 and r['perPortion'] == 125 and r['protein'] == 8, str(r))
        check('off-Zuordnung: bleibt bestätigt und zeigt die Quelle Open Food Facts', r['matched'] == 'matched' and r['confirmed'] is True and r['foodId'] == 'off-7612345678901' and 'Open Food Facts' in r['src'], str(r))

        # (a) Nährwert-Dialog ohne Barcode-/USDA-Oberfläche, (f) keine JS-Fehler
        html = await ev("""async () => {
          const rec = { id: 'offrez', title: 'Off-Test', servings: 2, steps: ['Essen'], ingredients: [{ amount: '100', unit: 'g', name: 'Testriegel' }], category: 'Hauptgericht', tags: [], createdAt: 1, updatedAt: 1 };
          state.recipes = [rec]; state.activeRecipeId = 'offrez'; state.view = 'detail'; render();
          state.nutritionMatchItems = await matchIngredients(rec.ingredients, rec.steps);
          openModal({ type: 'nutrition', recipeId: 'offrez', stage: 'match' });
          await new Promise(r => setTimeout(r, 200));
          const a = document.querySelector('.modal-sheet') ? document.querySelector('.modal-sheet').innerHTML : '';
          state.nutritionSelectTarget = 'Testriegel'; state.nutritionSearchQuery = ''; state.nutritionSearchResults = [];
          state.modal.stage = 'select'; render();
          await new Promise(r => setTimeout(r, 200));
          const s = document.querySelector('.modal-sheet') ? document.querySelector('.modal-sheet').innerHTML : '';
          return { match: a, select: s };
        }""")
        check('Nährwert-Dialog (Zuordnung) geöffnet und zeigt die Zutat', 'Testriegel' in html['match'], html['match'][:120])
        check('Auswahl-Stufe geöffnet', 'Lebensmittel für' in html['select'], html['select'][:120])
        alles = html['match'] + html['select']
        check('Kein nutrition-open-barcode, kein Barcode, kein USDA im Dialog', 'nutrition-open-barcode' not in alles and not re.search('barcode|usda', alles, re.I), '')
        check('Dialog nennt weiterhin „Eigenes Lebensmittel erstellen“', 'Eigenes Lebensmittel erstellen' in html['select'])
        await ev("() => { closeModal && closeModal(); }"); await page.wait_for_timeout(300)

        # (d) Datenschutz und Datenquellen
        txt = {}
        for v in ['settings-privacy', 'settings-sources']:
            await ev(f"() => {{ state.modal = null; state.view = '{v}'; render(); }}"); await page.wait_for_timeout(300)
            txt[v] = await ev("document.querySelector('.settings-page').innerText")
        check('Datenschutz enthält weder „Barcode“ noch „USDA“', not re.search('barcode|usda', txt['settings-privacy'], re.I) and len(txt['settings-privacy']) > 300)
        check('Datenquellen: kein „Barcode“, kein „USDA“, Open Food Facts nur für bereits zugeordnete Produkte', not re.search('barcode|usda', txt['settings-sources'], re.I) and 'Open Food Facts' in txt['settings-sources'] and 'bereits zugeordnete Produkte' in txt['settings-sources'] and 'ODbL' in txt['settings-sources'] and 'Schweizer Nährwertdatenbank' in txt['settings-sources'])
        check('Keine JS-Fehler beim Laden und beim Öffnen des Dialogs', not errs, str(errs[:3]))
        await b.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
