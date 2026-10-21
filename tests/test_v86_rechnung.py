"""v0.86 Nährwerte, Rechnung: Rundung (formatNutrient), Abdeckung/partial, Status partial/empty, Frischeprüfung
(Zuordnung, eigenes Lebensmittel, Gewicht, nutritionMap), Bouillon-Konzentrat, «ca. 200», Salz aus Natrium,
häufige Zutaten ohne absurde Treffer, Sync-Hooks, Plausibilität realistischer Rezepte."""
import asyncio, sys, json
import os as _os
_os.environ.setdefault('SAVORA_TEST_PORT', '47400')
sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

I = lambda a, u, n: {'amount': a, 'unit': u, 'name': n}
CALC = """async ([ings, servings, extra]) => { await ensureSwissDataSeeded(); const r = Object.assign({ id: 'v86calc', servings, steps: [], ingredients: ings }, extra || {});
  return await calculateRecipeNutrition(r); }"""

# Zutat -> erwarteter Wortteil im Datenbanknamen (Kleinschrift). None = darf nicht gerechnet werden (vernachlaessigbar ok)
ZUTATEN = [
    (I('1', 'Bund', 'Koriander'), 'petersilie'), (I('1', 'Handvoll', 'Koriander, frisch'), 'petersilie'),
    (I('2', 'EL', 'frischer Koriander, gehackt'), 'petersilie'), (I('1', 'Glas', 'Pesto'), 'pestosauce, grün'),
    (I('2', 'EL', 'Pesto rosso'), 'pestosauce, rot'), (I('1', '', 'kleine Dose Mais'), 'zuckermais (konserve)'),
    (I('1', 'Dose', 'Mais'), 'zuckermais (konserve)'),
    (I('1', 'Bund', 'Petersilie'), 'petersilie'), (I('1', 'Bund', 'Schnittlauch'), 'schnittlauch'),
    (I('1', 'Bund', 'Basilikum'), 'basilikum'), (I('2', 'dl', 'Rahm'), 'vollrahm'), (I('1', 'dl', 'Halbrahm'), 'halbrahm'),
    (I('150', 'g', 'Crème fraîche'), 'sauerrahm'), (I('5', 'dl', 'Gemüsebouillon'), 'bouillon, gemüse'),
    (I('400', 'ml', 'Kokosmilch'), 'kokosnussmilch'), (I('3', 'EL', 'Sojasauce'), 'sojasauce'),
    (I('20', 'g', 'Ingwer'), 'ingwer'), (I('1', '', 'Limette'), 'zitrone'), (I('2', 'EL', 'Zitronensaft'), 'zitronensaft'),
    (I('2', '', 'rote Peperoni'), 'peperoni, rot'), (I('2', '', 'Zucchetti'), 'zucchetti'), (I('3', '', 'Rüebli'), 'karotte'),
    (I('1', 'Stange', 'Lauch'), 'lauch'), (I('250', 'g', 'Mascarpone'), 'mascarpone'), (I('250', 'g', 'Ricotta'), 'quark'),
    (I('100', 'g', 'Gruyère, gerieben'), 'greyerzer'), (I('50', 'g', 'Sbrinz'), 'sbrinz'), (I('200', 'g', 'Frischkäse'), 'frischkäse'),
    (I('1', '', 'Bouillonwürfel'), 'bouillon'), (I('1', 'Würfel', 'Gemüsebouillon'), 'bouillon, gemüse'),
    (I('2', 'TL', 'Gemüsebouillon (Pulver)'), 'bouillon, gemüse'), (I('1', '', 'Zwiebel'), 'zwiebel'),
    (I('2', 'Zehen', 'Knoblauch'), 'knoblauch'), (I('200', 'g', 'Cherrytomaten'), 'tomate'),
    (I('1', 'EL', 'Limettensaft'), 'zitronensaft'), (I('2', 'EL', 'Bratbutter'), 'butter'),
]

async def main():
    async with async_playwright() as p:
        b, c = await open_ctx(p, 800, 600); page = await c.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.wait_for_timeout(300)
        ev = page.evaluate
        await ev("() => ensureSwissDataSeeded()")

        # 1) Rundung
        f = await ev("""() => ({ kcal: formatNutrient(631.4, 'energyKcal'), kj: formatNutrient(2641.6, 'energyKj'), g12: formatNutrient(12.46, 'fat'),
          g5: formatNutrient(5.39, 'fiber'), g05: formatNutrient(0.84, 'carbohydrates'), gsmall: formatNutrient(0.04, 'sugars'), zero: formatNutrient(0, 'fat'),
          s: formatNutrient(0.456, 'salt'), s2: formatNutrient(2.345, 'salt'), nul: formatNutrient(null, 'fat'), mg: formatNutrient(0.09, 'vitaminB1'),
          r: formatNutrientRange(8.86, 10.5, 'protein'), r2: formatNutrientRange(345.2, 364.4, 'energyKcal'), r3: formatNutrientRange(9.96, 10.04, 'fat'),
          g999: formatNutrient(9.96, 'fat') })""")
        check('Rundung: kcal/kJ ganz', f['kcal'] == '631' and f['kj'] == '2642', str(f))
        check('Rundung: g ab 10 ganz, darunter eine Stelle mit Komma', f['g12'] == '12' and f['g5'] == '5,4' and f['g05'] == '0,8' and f['g999'] == '10', str(f))
        check('Rundung: unter 0,1 g «< 0,1», gemessene 0 bleibt 0, null bleibt null', f['gsmall'] == '< 0,1' and f['zero'] == '0' and f['nul'] is None, str(f))
        check('Rundung: Salz unter 1 g zwei Stellen', f['s'] == '0,46' and f['s2'] == '2,3', str(f))
        check('Rundung: Spannen gleich gerundet', f['r'] == '8,9–11' and f['r2'] == '345–364' and f['r3'] == '10', str(f))
        pdfv = await ev("""() => { const res = { nutrientsPerPortion: { energyKcal: 11.4, carbohydrates: 0.97, fiber: 0.84, salt: 0.456, fat: null }, rangeUsed: false };
          const v = pdfNutritionView(res); const t = (k) => (v.find((x) => x.key === k) || {}).text; return [t('energyKcal'), t('carbohydrates'), t('fiber'), t('salt'), t('fat')]; }""")
        check('PDF nutzt dieselbe Rundung', pdfv == ['11', '1,0', '0,8', '0,46', None], str(pdfv))

        # 2) Zutaten-Zuordnung: kein absurder Treffer
        zr = await ev("""async (list) => { const out = []; for (const [ing, want] of list) {
            const prep = Object.assign({}, ing, nutPrepareIngredient(ing));
            const m = await matchIngredient(prep.name, [], { originalName: ing.name });
            const g = m.food ? resolveIngredientGrams(prep, m.food) : null;
            out.push({ name: ing.amount + ' ' + ing.unit + ' ' + ing.name, status: m.status, skipped: m.skipped || null, food: m.food ? m.food.name : null, grams: g ? (g.grams || g.gramsMin) : null, want }); }
          return out; }""", ZUTATEN)
        for z in zr:
            ok = z['status'] == 'matched' and z['food'] and z['want'] in z['food'].lower() and z['grams'] and z['grams'] > 0
            check('Zutat ' + z['name'].strip(), ok, f"-> {z['food']} {z['grams'] and round(z['grams'], 1)} g ({z['status']})")
        garnele = [z for z in zr if z['food'] and 'garnele' in z['food'].lower()]
        check('Koriander nie als Garnele', not garnele, str(garnele))

        # 3) Bouillon-Konzentrat: Salz realistisch
        bo = await ev(CALC, [[I('1', 'Würfel', 'Gemüsebouillon'), I('1', 'l', 'Wasser')], 1, None])
        salt = bo['nutrientsTotal']['salt']
        check('Bouillonwürfel: 3 bis 6 g Salz, unter 50 kcal', salt is not None and 3 <= salt <= 6 and bo['nutrientsTotal']['energyKcal'] < 50, f"salz={salt} kcal={bo['nutrientsTotal']['energyKcal']}")
        bp = await ev(CALC, [[I('2', 'TL', 'Gemüsebouillon (Pulver)')], 1, None])
        check('2 TL Bouillonpulver: 3 bis 6 g Salz', 3 <= (bp['nutrientsTotal']['salt'] or 0) <= 6, str(bp['nutrientsTotal']['salt']))
        bl = await ev(CALC, [[I('5', 'dl', 'Gemüsebouillon')], 1, None])
        check('5 dl fertige Bouillon bleibt fertige Bouillon (ca. 4,5 g Salz)', 3.5 <= (bl['nutrientsTotal']['salt'] or 0) <= 5.5, str(bl['nutrientsTotal']['salt']))

        # 4) «ca. 200» im Mengenfeld und Menge im Namen
        ca = await ev(CALC, [[I('ca. 200', 'g', 'Mehl'), I('100', 'g', 'Zucker')], 1, None])
        check('«ca. 200 g Mehl» wird als 200 g gerechnet', ca['coverage']['counted'] == 2 and ca['nutrientsTotal']['energyKcal'] > 1000, f"{ca['coverage']} kcal={ca['nutrientsTotal']['energyKcal']}")
        vs = await ev(CALC, [[I('etwa 200', 'g', 'Mehl')], 1, None]); ti = await ev(CALC, [[I('~200', 'g', 'Mehl')], 1, None]); nm = await ev(CALC, [[I('', '', '200 g Mehl')], 1, None])
        check('«etwa 200», «~200» und «200 g Mehl» ohne Mengenfeld ebenso', all(x['nutrientsTotal']['energyKcal'] and 650 < x['nutrientsTotal']['energyKcal'] < 750 for x in (vs, ti, nm)), str([x['nutrientsTotal']['energyKcal'] for x in (vs, ti, nm)]))
        disp = await ev("() => qtyFromIngredient({ amount: 'ca. 200', unit: 'g' }).kind")
        check('Anzeige-Menge bleibt Originaltext (qtyFromIngredient unverändert)', disp == 'invalid', disp)

        # 5) Salz aus Natrium
        sp = await ev(CALC, [[I('200', 'g', 'Spaghetti')], 2, None])
        check('Salz aus Natrium statt 0 (Teigwaren)', sp['nutrientsTotal']['salt'] is not None and sp['nutrientsTotal']['salt'] > 0, str((sp['nutrientsTotal']['salt'], sp['nutrientsTotal']['sodium'])))
        cf = await ev("""async () => { const f = await saveCustomFood({ name: 'V86 Testsalz-los', nutrientsPer100g: { energyKcal: 100 } }); const r = { id: 'v86cf0', servings: 1, steps: [], ingredients: [{ amount: '100', unit: 'g', name: 'V86 Testsalz-los' }] };
          const res = await calculateRecipeNutrition(r); await deleteCustomFood(f.id); return res.nutrientsTotal.salt; }""")
        check('Ohne Salz und ohne Natrium bleibt Salz null', cf is None, str(cf))

        # 6) Abdeckung, partial, enoughForEstimate, Status
        curry = [I('600', 'g', 'Pouletbrust'), I('1', '', 'Zwiebel'), I('400', 'ml', 'Kokosmilch'), I('200', 'g', 'Reis'),
                 I('1', '', 'Xyzblubbwurz'), I('2', 'EL', 'Rapsöl')]
        pc = await ev(CALC, [curry, 4, None])
        cov = pc['coverage']
        check('Teilweise: coverage 5 von 6, partial, enoughForEstimate', cov['counted'] == 5 and cov['total'] == 6 and pc['partial'] is True and pc['enoughForEstimate'] is True and cov['missing'][0]['name'] == 'Xyzblubbwurz', json.dumps(cov, ensure_ascii=False))
        check('Teilweise: Zahlen sind die Summe der eingerechneten Zutaten', pc['nutrientsPerPortion']['energyKcal'] and pc['nutrientsPerPortion']['energyKcal'] > 400, str(pc['nutrientsPerPortion']['energyKcal']))
        st = await ev("""async ([curry]) => { const S = async (r) => { await recalculateAndStoreNutrition(r); return (await nutritionStatusFor(r)).status; };
          const a = await S({ id: 'v86p', servings: 4, steps: [], ingredients: curry });
          const b = await S({ id: 'v86i', servings: 2, steps: [], ingredients: [{ amount: '100', unit: 'g', name: 'Zucker' }, { amount: '1', unit: '', name: 'Xyzblubbwurz' }, { amount: '2', unit: 'EL', name: 'Qwertzpaste' }] });
          const c = await S({ id: 'v86e', servings: 2, steps: [], ingredients: [] });
          const d = await S({ id: 'v86w', servings: 2, steps: [], ingredients: [{ amount: '1', unit: 'l', name: 'Wasser' }, { amount: '', unit: '', name: 'Salz' }] });
          const e = await S({ id: 'v86c', servings: 2, steps: [], ingredients: [{ amount: '200', unit: 'g', name: 'Spaghetti' }] });
          return [a, b, c, d, e]; }""", [curry])
        check('Status partial / incomplete / empty / empty / calculated', st == ['partial', 'incomplete', 'empty', 'empty', 'calculated'], str(st))
        na = await ev(CALC, [[I('200', 'g', 'Spaghetti'), I('', '', 'Butter')], 2, None])
        check('Zutat ohne Menge zählt als fehlend (einheitliche Zählung)', na['coverage']['total'] == 2 and na['coverage']['counted'] == 1 and na['relevantCount'] == 2 and na['unresolvedCount'] == 1 and na['coverage']['missing'][0]['reason'] == 'no-amount', json.dumps(na['coverage'], ensure_ascii=False))

        # 7) Frischeprüfung (F2-F4)
        fr = await ev("""async () => { const out = {}; const r = { id: 'v86fresh', servings: 2, steps: [], ingredients: [{ amount: '200', unit: 'g', name: 'Spaghetti' }] };
          await resetIngredientMatch('Spaghetti');
          await recalculateAndStoreNutrition(r); out.a = (await nutritionStatusFor(r)).status;
          const other = (await searchSwissFoods('Zucker', 3))[0]; await confirmIngredientMatch('Spaghetti', other.id); out.b = (await nutritionStatusFor(r)).status;
          await recalculateAndStoreNutrition(r); out.c = (await nutritionStatusFor(r)).status; await resetIngredientMatch('Spaghetti'); out.d = (await nutritionStatusFor(r)).status;
          await recalculateAndStoreNutrition(r);
          const fw = Object.assign({}, r, { nutritionFinishedWeight: 450 }); out.e = (await nutritionStatusFor(fw)).status;
          const map = Object.assign({}, r, { nutritionMap: { spaghetti: { foodId: other.id, source: 'swiss-fcd', name: other.name, updatedAt: 1 } } }); out.f = (await nutritionStatusFor(map)).status;
          const st2 = Object.assign({}, r, { steps: [{ text: 'Spaghetti kochen.' }] }); out.g = (await nutritionStatusFor(st2)).status;
          const cfood = await saveCustomFood({ name: 'V86 Hausnudeln', nutrientsPer100g: { energyKcal: 100 } });
          const rc = { id: 'v86cust', servings: 1, steps: [], ingredients: [{ amount: '100', unit: 'g', name: 'V86 Hausnudeln' }] };
          await recalculateAndStoreNutrition(rc); out.h = (await nutritionStatusFor(rc)).status;
          await saveCustomFood(Object.assign({}, cfood, { nutrientsPer100g: { energyKcal: 350 } })); out.i = (await nutritionStatusFor(rc)).status;
          out.j = (await recalculateAndStoreNutrition(rc)).nutrientsTotal.energyKcal; await deleteCustomFood(cfood.id);
          return out; }""")
        check('F2: geänderte globale Zuordnung macht Ergebnis veraltet', fr['a'] == 'calculated' and fr['b'] == 'stale' and fr['c'] == 'calculated' and fr['d'] == 'stale', str(fr))
        check('F4: Gewicht nach dem Kochen, nutritionMap und Schritte machen veraltet', fr['e'] == 'stale' and fr['f'] == 'stale' and fr['g'] == 'stale', str(fr))
        check('F3: geändertes eigenes Lebensmittel macht veraltet, neu 350 kcal', fr['h'] == 'calculated' and fr['i'] == 'stale' and fr['j'] == 350, str(fr))

        # 8) Sync-Hooks
        sy = await ev("""async () => { const calls = []; const other = (await searchSwissFoods('Zucker', 3))[0];
          window.nutritionSyncLookup = async (recipe, key) => (recipe.nutritionMap && recipe.nutritionMap[key]) || null;
          window.nutritionSyncRemember = async (rid, key, m, cf) => { calls.push([rid, key, m && m.foodId, cf ? cf.id : null]); };
          const r = { id: 'v86sync', servings: 1, steps: [], ingredients: [{ amount: '100', unit: 'g', name: 'Spaghetti' }], nutritionMap: { spaghetti: { foodId: other.id } } };
          const res = await calculateRecipeNutrition(r);
          const r2 = { id: 'v86sync2', servings: 1, steps: [], ingredients: [{ amount: '100', unit: 'g', name: 'Fremdkost' }], nutritionMap: { fremdkost: { foodId: 'custom-anderesgeraet', customFood: { id: 'custom-anderesgeraet', name: 'Fremdkost', nutrientsPer100g: { energyKcal: 123, salt: 0.5 } } } } };
          const res2 = await calculateRecipeNutrition(r2);
          await confirmIngredientMatch('Spaghetti', other.id, { recipeId: 'v86sync' }); await resetIngredientMatch('Spaghetti');
          delete window.nutritionSyncLookup; delete window.nutritionSyncRemember;
          return { kcal: res.nutrientsTotal.energyKcal, sugar: other.nutrientsPer100g.energyKcal, kcal2: res2.nutrientsTotal.energyKcal, calls }; }""")
        check('Sync-Lookup hat Vorrang (nutritionMap im Rezept)', abs(sy['kcal'] - sy['sugar']) < 1, str(sy))
        check('Sync-Lookup: eigenes Lebensmittel vom anderen Gerät wird gerechnet', sy['kcal2'] == 123, str(sy))
        check('Sync-Remember nach Bestätigung aufgerufen', sy['calls'] and sy['calls'][0][:3] == ['v86sync', 'spaghetti', sy['calls'][0][2]] and sy['calls'][0][2], str(sy['calls']))

        # 9) Plausibilität realistischer Rezepte (pro Portion)
        PL = {
            'Spaghetti aglio e olio (2 P.)': ([I('200', 'g', 'Spaghetti'), I('3', 'EL', 'Olivenöl'), I('3', 'Zehen', 'Knoblauch'), I('', '', 'Salz')], 2, 450, 650),
            '200 g Spaghetti gesamt (1 P.)': ([I('200', 'g', 'Spaghetti')], 1, 650, 760),
            'Poulet-Curry (4 P.)': (curry[:4] + [I('2', 'EL', 'Rapsöl'), I('1', 'Bund', 'Koriander')], 4, 500, 800),
            'Zürcher Geschnetzeltes (4 P.)': ([I('600', 'g', 'Kalbsgeschnetzeltes'), I('2', 'dl', 'Rahm'), I('1', 'dl', 'Weisswein'), I('1', '', 'Zwiebel'), I('1', 'EL', 'Bratbutter'), I('200', 'g', 'Champignons')], 4, 300, 500),
            'Rüeblikuchen (12 P.)': ([I('300', 'g', 'Rüebli'), I('250', 'g', 'Zucker'), I('5', '', 'Eier'), I('250', 'g', 'gemahlene Mandeln'), I('100', 'g', 'Mehl'), I('1', 'Pck.', 'Backpulver')], 12, 220, 380),
        }
        for name, (ings, sv, lo, hi) in PL.items():
            r = await ev(CALC, [ings, sv, None])
            k = r['nutrientsPerPortion']['energyKcal']
            check(f'Plausibel: {name} {lo} bis {hi} kcal/Portion', k is not None and lo <= k <= hi and r['coverage']['counted'] == r['coverage']['total'], f"{k} kcal, Salz {r['nutrientsPerPortion']['salt']} g, {r['coverage']['counted']}/{r['coverage']['total']}")
        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await b.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
