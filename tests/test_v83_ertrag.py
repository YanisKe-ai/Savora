"""v0.83 H1: Ertrag (Portionen, Stück, Gesamtertrag, unbekannt), Nährwertbezug und Zeitangaben.
Auftrag §20 A (Ertrag), B (Nährwerte), C (Zeiten). Isolierte Testrezepte (Karamellsauce mit «1 Glas» und
«ca. 1 Stunde abkühlen» im Text); die Rezepte aus seed.js werden nicht verändert."""
import asyncio, json, os, sys
os.environ.setdefault('SAVORA_TEST_PORT', '21500')
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

KARAMELL = {
    'id': 'v83_karamell', 'title': 'Karamellsauce', 'servings': 1, 'servingMode': 'total', 'yieldLabel': 'Glas', 'timeMinutes': 30,
    'ingredients': [{'amount': '200', 'unit': 'g', 'name': 'Zucker'}, {'amount': '200', 'unit': 'ml', 'name': 'Rahm'},
                    {'amount': '50', 'unit': 'g', 'name': 'Butter'}, {'amount': '', 'unit': '', 'name': 'Salz nach Geschmack'}],
    'steps': [{'text': 'Zucker in einer Pfanne hellbraun karamellisieren.'}, {'text': 'Rahm und Butter zugeben und 5 Min. köcheln.'},
              {'text': 'In ein Glas füllen und ca. 1 Stunde abkühlen lassen.'}],
    'tags': [], 'diet': [], 'categoryTags': ['sauce'], 'notes': '',
}
def variant(**kw):
    r = json.loads(json.dumps(KARAMELL)); r.update(kw); return r

async def main():
    async with async_playwright() as p:
        b, ctx = await open_ctx(p, 390, 844)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(300)
        ev = page.evaluate
        seed_before = await ev("() => JSON.stringify(state.recipes.map(r => [r.id, r.title, r.servings, r.servingMode || '', r.timeMinutes || 0, r.ingredients]))")

        # ---------- A. Ertrag ----------
        y = await ev("""() => { const c = [
            { servings: 4 }, { servings: 12, servingMode: 'pieces' }, { servings: 12, servingMode: 'pieces', yieldLabel: 'Cookies' },
            { servings: 1, servingMode: 'total', yieldLabel: 'Glas' }, { servings: 500, servingMode: 'total', yieldLabel: 'ml' }, { servings: 0 }, { } ];
          return c.map(r => [yieldText(r), yieldShort(r), yieldInfo(r).kind, nutritionBasis(r).label]); }""")
        check('A: 4 Portionen', y[0] == ['Für 4 Portionen', '4 Port.', 'portions', 'pro Portion'], str(y[0]))
        check('A: 12 Stück', y[1] == ['Ergibt 12 Stück', '12 Stück', 'pieces', 'pro Stück'], str(y[1]))
        check('A: 12 Cookies (eigene Bezeichnung)', y[2][0] == 'Ergibt 12 Cookies', str(y[2]))
        check('A: 1 Glas', y[3] == ['Ergibt 1 Glas', '1 Glas', 'total', 'für das gesamte Rezept'], str(y[3]))
        check('A: 500 ml', y[4] == ['Ergibt 500 ml', '500 ml', 'total', 'für das gesamte Rezept'], str(y[4]))
        check('A: unbekannter Ertrag erfindet keine Zahl', y[5][:3] == ['Ertrag unbekannt', '', 'unknown'] and y[6][:3] == ['Ertrag unbekannt', '', 'unknown'], str(y[5:]))
        pl = await ev("() => [yieldText({ servings: 1, servingMode: 'total', yieldLabel: 'Glas' }, 2), yieldText({ servings: 1, servingMode: 'total', yieldLabel: 'Blech' }, 3), yieldText({ servings: 1, servingMode: 'total', yieldLabel: 'Schälchen Dip' }, 2), servingLabel({ servings: 1 }, 1)]")
        check('A: Mehrzahl sinnvoll (Gläser, Bleche), sonst Bezeichnung unverändert; 1 Portion bleibt', pl == ['Ergibt 2 Gläser', 'Ergibt 3 Bleche', 'Ergibt 2 Schälchen Dip', '1 Portion'], str(pl))

        # Karamellsauce in der App: Detail, Skalieren, Basisdaten unverändert
        await ev("async (r) => { await dbPut(r); await loadRecipes(); state.activeRecipeId = r.id; state.view = 'detail'; state.detailTab = 'ingredients'; render(); }", KARAMELL)
        await page.wait_for_selector('.detail-meta-v2')
        meta = await ev("() => document.querySelector('.detail-meta-v2').textContent + ' | ' + (document.querySelector('.detail-times') || {}).textContent")
        check('A: Detail zeigt «Ergibt 1 Glas», nicht «Portion»', 'Ergibt 1 Glas' in meta and 'Portion' not in meta, meta)
        lbl = await ev("() => document.querySelector('.amount-row-label').textContent")
        check('A: Stepper heisst «Menge anpassen» (getrennt vom Bearbeiten)', lbl.strip() == 'Menge anpassen', lbl)
        await page.click('[data-action="serv-inc"]')
        await page.wait_for_function("document.querySelector('.stepper-value') && document.querySelector('.stepper-value').textContent.includes('2 Gläser')")
        sc = await ev("""async () => { const r = state.recipes.find(x => x.id === 'v83_karamell'); const raw = (await dbGetAll()).find(x => x.id === r.id);
            return { stepper: document.querySelector('.stepper-value').textContent, hint: (document.querySelector('.amount-scaled-hint') || {}).textContent || '',
              amounts: Array.from(document.querySelectorAll('.ing-amount')).map(e => e.textContent.trim()), names: Array.from(document.querySelectorAll('.ing-list .ing-name')).map(e => e.textContent.trim()),
              servings: raw.servings, mode: raw.servingMode, ing0: raw.ingredients[0].amount }; }""")
        check('A: Skalieren 1 Glas -> 2 Gläser verdoppelt Mengen', sc['stepper'] == '2 Gläser' and sc['amounts'][:3] == ['400 g', '400 ml', '100 g'], str(sc))
        check('A: nicht numerische Menge («nach Geschmack») bleibt erhalten', sc['amounts'][3] == '' and 'Salz nach Geschmack' in sc['names'], str(sc['names']))
        check('A: Skalieren ändert keine Basisdaten', sc['servings'] == 1 and sc['mode'] == 'total' and sc['ing0'] == '200', str(sc))
        check('A: Hinweis nennt die Originalmenge', 'Ergibt' not in sc['hint'] and '1 Glas' in sc['hint'], sc['hint'])
        await page.click('[data-action="serv-reset"]')
        await page.wait_for_function("document.querySelector('.stepper-value').textContent === '1 Glas'")
        # Gesamtertrag in ml: Schrittweite eine ganze Rezeptmenge
        await ev("async (r) => { await dbPut(r); await loadRecipes(); state.activeRecipeId = r.id; state.view = 'detail'; render(); }", variant(id='v83_ml', title='Vinaigrette', servings=500, yieldLabel='ml'))
        await page.click('[data-action="serv-inc"]')
        await page.wait_for_function("document.querySelector('.stepper-value').textContent === '1000 ml'")
        check('A: 500 ml skaliert in Rezeptmengen (1000 ml)', True)
        # Unbekannter Ertrag: kein Stepper, keine erfundene Zahl
        await ev("async (r) => { await dbPut(r); await loadRecipes(); state.activeRecipeId = r.id; state.view = 'detail'; render(); }", variant(id='v83_unk', title='Brei', servings=0, servingMode=None, timeMinutes=0))
        unk = await ev("() => ({ meta: document.querySelector('.detail-meta-v2').textContent, stepper: !!document.querySelector('[data-action=serv-inc]'), row: document.querySelector('.amount-row').textContent })")
        check('A: unbekannter Ertrag: «Ertrag unbekannt», kein Stepper', 'Ertrag unbekannt' in unk['meta'] and not unk['stepper'] and 'Portion' not in unk['meta'], str(unk))
        # Hinweis bei verdächtigem «1 Portion», ohne Umdeutung
        sus = await ev("() => [yieldSuspicion({ title: 'Karamellsauce', servings: 1 }), yieldSuspicion({ title: 'Lasagne', servings: 1 }), yieldSuspicion({ title: 'Karamellsauce', servings: 1, servingMode: 'total' }), yieldSuspicion({ title: 'Apfelmus', servings: 1, categoryTags: ['sauce'] })]")
        check('A: verdächtiges «1 Portion» bei Sauce ergibt Hinweis mit Feld', sus[0] and sus[0]['field'] == 'servings' and '1 Portion oder einen Gesamtertrag' in sus[0]['text'], str(sus[0]))
        check('A: kein Hinweis bei Lasagne oder schon gesetztem Gesamtertrag', sus[1] is None and sus[2] is None and sus[3] is not None, str(sus[1:]))
        # Editor: Ertragsart Gesamtertrag mit Bezeichnung, keine Pflicht
        ed = await ev("""() => { state.editingRecipe = JSON.parse(JSON.stringify(state.recipes.find(x => x.id === 'v83_karamell'))); state.editingRecipe.servingMode = 'portions'; delete state.editingRecipe.yieldLabel;
            state.view = 'form'; state.formStep = 0; render();
            const sel = document.getElementById('f-serving-mode'); const before = document.getElementById('f-yield-label-field').hidden;
            sel.value = 'total'; sel.dispatchEvent(new Event('change')); const after = document.getElementById('f-yield-label-field').hidden;
            document.getElementById('f-yield-label').value = 'Glas';
            const labels = Array.from(document.querySelectorAll('label')).map(l => l.textContent.trim());
            const r = collectFormData(); return { before, after, mode: r.servingMode, label: r.yieldLabel, servings: r.servings, labels, hint: document.getElementById('f-yield-hint').textContent }; }""")
        check('A: Editor: Bezeichnung erscheint erst bei Stück/Gesamtertrag', ed['before'] is True and ed['after'] is False, str(ed))
        check('A: Editor speichert Gesamtertrag «1 Glas»', ed['mode'] == 'total' and ed['label'] == 'Glas' and ed['servings'] == 1, str(ed))
        check('A: Editor: Zeiten klar benannt', all(x in ed['labels'] for x in ['Gesamtzeit (Min.)', 'Vorbereitung (Min.)', 'Garen oder Backen (Min.)', 'Ruhen oder Kühlen (Min.)', 'Ertrag', 'Anzahl']), str(ed['labels']))
        ed2 = await ev("""() => { const sel = document.getElementById('f-serving-mode'); sel.value = 'portions'; sel.dispatchEvent(new Event('change')); document.getElementById('f-servings').value = '';
            const r = collectFormData(); return { mode: r.servingMode, label: r.yieldLabel === undefined, servings: r.servings }; }""")
        check('A: Editor: Ertrag leer = unbekannt (keine Pflicht), Portionen ohne Bezeichnung', ed2 == {'mode': 'portions', 'label': True, 'servings': 0}, str(ed2))
        await ev("() => { state.view = 'home'; state.editingRecipe = null; render(); }")
        # Validierung und Bibliothek
        va = await ev("() => [validateRecipe({ title: 'x', servingMode: 'total', yieldLabel: 'Glas', servings: 1 }), validateRecipe({ title: 'x', servingMode: 'pfund' })].map(v => [v.ok, v.warnings.join('|')])")
        check('A: validate: total gültig ohne Warnung, unbekannte Art nur Warnung', va[0] == [True, ''] and va[1][0] is True and 'unbekannt' in va[1][1], str(va))
        lib = await ev("""() => { const d = libDraftFromRecipe(state.recipes.find(x => x.id === 'v83_karamell')); const n = libNormalizePublic(d);
            const back = libRecipeFromPublication({ id: '00000000-0000-4000-8000-000000000001', version: 1, recipe: n, author: { display_name: 'Test' } });
            return [d.servingMode, d.yieldLabel, n.servingMode, n.yieldLabel, back.servingMode, back.yieldLabel, back.servings]; }""")
        check('A: Bibliothek: Gesamtertrag bleibt beim Veröffentlichen und Übernehmen', lib == ['total', 'Glas', 'total', 'Glas', 'total', 'Glas', 1], str(lib))

        # ---------- B. Nährwerte ----------
        nb = await ev("""async () => { const out = {};
            for (const [k, r] of Object.entries({ total: state.recipes.find(x => x.id === 'v83_karamell'),
                 portion: Object.assign({}, state.recipes.find(x => x.id === 'v83_karamell'), { id: 'v83_np', servingMode: 'portions', servings: 4 }),
                 piece: Object.assign({}, state.recipes.find(x => x.id === 'v83_karamell'), { id: 'v83_ns', servingMode: 'pieces', servings: 8, yieldLabel: 'Pralinen' }) })) {
              const n = await calculateRecipeNutrition(r);
              const html = nutritionCompactInner(r, n);
              out[k] = { whole: n.wholeRecipe, per: n.nutrientsPerPortion.energyKcal, tot: n.nutrientsTotal.energyKcal, html, cov: nutCoverageText(n) };
            } return out; }""")
        check('B: Gesamtrezept: keine Pro-Portion-Werte, Überschrift «für das gesamte Rezept»', nb['total']['whole'] and nb['total']['per'] is None and nb['total']['tot'] > 1000 and 'Geschätzte Nährwerte für das gesamte Rezept' in nb['total']['html'] and 'pro Portion' not in nb['total']['html'], str({k: v for k, v in nb['total'].items() if k != 'html'}))
        check('B: Gesamtrezept nennt den Bezug (1 Glas)', 'Ergibt 1 Glas' in nb['total']['html'])
        check('B: pro Portion bei 4 Portionen (Gesamt / 4)', 'Geschätzte Nährwerte pro Portion' in nb['portion']['html'] and abs(nb['portion']['per'] * 4 - nb['portion']['tot']) < 2, f"{nb['portion']['per']} {nb['portion']['tot']}")
        check('B: pro Stück bei Stückzahl', 'Geschätzte Nährwerte pro Stück' in nb['piece']['html'] and abs(nb['piece']['per'] * 8 - nb['piece']['tot']) < 2)
        check('B: «Mittlere Genauigkeit» ersetzt durch nachvollziehbare Angabe', all('Genauigkeit' not in v['html'] for v in nb.values()) and 'von 3 Zutaten berücksichtigt' in nb['total']['cov'], nb['total']['cov'])
        miss = await ev("""async () => { const r = Object.assign({}, state.recipes.find(x => x.id === 'v83_karamell'), { id: 'v83_miss', ingredients: [{ amount: '200', unit: 'g', name: 'Zucker' }, { amount: '100', unit: 'g', name: 'Zzyzxwurzelpaste' }] });
            const n = await calculateRecipeNutrition(r); return { cov: nutCoverageText(n), complete: n.complete, html: nutritionIncompleteInner(r, n) }; }""")
        check('B: fehlende Zutatenzuordnung: «1 von 2 Zutaten», keine Summe', miss['cov'] == '1 von 2 Zutaten berücksichtigt' and miss['complete'] is False and 'Unvollständig' in miss['html'], str(miss['cov']))
        m100 = await ev("""async () => { const r = state.recipes.find(x => x.id === 'v83_karamell'); const n = await calculateRecipeNutrition(r);
            const a = nutDetailModes(r, n).map(m => m.id); const r2 = Object.assign({}, r, { nutritionFinishedWeight: 380 }); const n2 = await calculateRecipeNutrition(r2);
            return [a, nutDetailModes(r2, n2).map(m => m.id), n2.nutrientsPer100g.energyKcal > 0]; }""")
        check('B: unbekannte Endmasse: kein «pro 100 g»; nur mit gewogenem Gewicht', m100[0] == ['total'] and m100[1] == ['total', '100g'] and m100[2], str(m100))
        st = await ev("""async () => { const r = state.recipes.find(x => x.id === 'v83_karamell'); await recalculateAndStoreNutrition(r); const s1 = (await nutritionStatusFor(r)).status;
            const changed = Object.assign({}, r, { ingredients: r.ingredients.concat([{ amount: '20', unit: 'g', name: 'Butter' }]) }); const s2 = (await nutritionStatusFor(changed)).status;
            const asPortion = Object.assign({}, r, { servingMode: 'portions' }); const s3 = (await nutritionStatusFor(asPortion)).status;
            const scaled = Object.assign({}, r, { lastServings: 3 }); const s4 = (await nutritionStatusFor(scaled)).status;
            const grouped = Object.assign({}, r, { id: 'v83_grp', ingredients: [{ amount: '', unit: '', name: 'Sauce:' }].concat(r.ingredients) }); await recalculateAndStoreNutrition(grouped); const s5 = (await nutritionStatusFor(grouped)).status;
            return [s1, s2, s3, s4, s5]; }""")
        check('B: Cache gültig nach Berechnung', st[0] in ('calculated', 'incomplete'), str(st))
        check('B: geänderte Zutaten machen Werte ungültig', st[1] == 'stale', str(st))
        check('B: geänderte Ertragsart macht Werte ungültig', st[2] == 'stale', str(st))
        check('B: Skalieren ändert nichts am Nährwertbezug', st[3] == st[0], str(st))
        check('B: Rezept mit Zutatengruppen gilt nach Berechnung nicht mehr als veraltet', st[4] in ('calculated', 'incomplete'), str(st))
        # Anzeige in der App (lazy Karte)
        await ev("() => { state.activeRecipeId = 'v83_karamell'; state.view = 'detail'; state.showNutrition = true; state.detailTab = 'nutrition'; render(); }")
        await page.wait_for_function("document.querySelector('.nutrition-basis-title')", timeout=15000)
        card = await ev("() => document.querySelector('[data-lazy-nutrition]').textContent.replace(/\\s+/g, ' ')")
        check('B: App-Karte: «Geschätzte Nährwerte für das gesamte Rezept», keine 0 für Unbekanntes', 'Geschätzte Nährwerte für das gesamte Rezept' in card and 'pro Portion' not in card, card[:200])
        await page.screenshot(path=os.path.join(OUT, 'v83_naehrwerte_karamell.png'), full_page=True)
        # PDF-Datenmodell
        pm = await ev("""async () => { const r = state.recipes.find(x => x.id === 'v83_karamell'); const n = await calculateRecipeNutrition(r); const m = pdfBuildModel(r, n);
            return { facts: m.facts.map(f => f.short), basis: m.nutritionBasis, label: m.nutritionBasisLabel, servings: m.servings.label, note: m.nutritionNote, kcal: (m.nutritionView.find(v => v.key === 'energyKcal') || {}).value }; }""")
        check('B/A: PDF: «Ergibt 1 Glas», Nährwerte für das gesamte Rezept', pm['facts'][0] == 'Ergibt 1 Glas' and pm['basis'] == 'total' and pm['label'] == 'für das gesamte Rezept' and pm['servings'] == '1 Glas' and pm['kcal'] and pm['kcal'] > 1000, str(pm))

        # ---------- C. Zeiten ----------
        t = await ev("""() => [timeInfo({ timeMinutes: 45 }), timeInfo({ timeMinutes: 30, restMinutes: 60 }), timeInfo({ timeMinutes: 35, prepMinutes: 20, cookMinutes: 30 }), timeInfo({}), [fmtMinutes(45), fmtMinutes(60), fmtMinutes(90), fmtMinutes(0)]]""")
        check('C: nur Gesamtzeit', t[0]['text'] == '45 Min. Gesamtzeit' and t[0]['cardText'] == '45 Min.', str(t[0]))
        check('C: Arbeits- und Ruhezeit kompakt', t[1]['text'] == '30 Min. Gesamtzeit · 1 Std. Ruhen', t[1]['text'])
        check('C: parallele Schritte: keine Summe, Gesamtzeit bleibt 35', t[2]['total'] == 35 and t[2]['text'] == '35 Min. Gesamtzeit · 20 Min. Vorbereitung · 30 Min. Garen', t[2]['text'])
        check('C: unbekannte Zeit: nichts, keine 0', t[3]['text'] == '' and t[3]['cardText'] == '' and t[3]['total'] is None, str(t[3]))
        check('C: fmtMinutes', t[4] == ['45 Min.', '1 Std.', '1 Std. 30 Min.', ''], str(t[4]))
        ts = await ev("""() => { const r = state.recipes.find(x => x.id === 'v83_karamell'); return [timeTextSuspicion(r), timeTextSuspicion(Object.assign({}, r, { restMinutes: 60 })), timeTextSuspicion(Object.assign({}, r, { timeMinutes: 120 })), r.restMinutes === undefined]; }""")
        check('C: Widerspruch Text/Felder: Hinweis «In Schritt 3 … Kühlzeit … 1 Std.»', ts[0] and ts[0]['field'] == 'restMinutes' and 'Schritt 3' in ts[0]['text'] and 'Kühlzeit' in ts[0]['text'] and '1 Std.' in ts[0]['text'], str(ts[0]))
        check('C: kein Hinweis, wenn Ruhezeit gesetzt oder Gesamtzeit sie enthält; nichts wird geändert', ts[1] is None and ts[2] is None and ts[3], str(ts))
        fl = await ev("""() => { const ids = (list) => list.map(r => r.id);
            return { b30: timeBucketsFor(0), q: ids(recipesInCollection('quick', [{ id: 'a', timeMinutes: 0 }, { id: 'b', timeMinutes: 25 }, { id: 'c' }])) }; }""")
        check('C: private Filter: unbekannte Zeit nie bei «Bis 30 Min.»', fl['b30'] == [] and fl['q'] == ['b'], str(fl))
        # Karte nutzt Gesamtzeit, unbekannte Zeit ohne Uhr
        await ev("() => { state.view = 'home'; render(); }")
        await page.wait_for_selector('[data-flip-id="v83_karamell"]')
        cards = await ev("() => ({ k: (document.querySelector('[data-flip-id=\"v83_karamell\"] [class*=meta--time]') || {}).textContent || '', u: !!document.querySelector('[data-flip-id=\"v83_unk\"] [class*=meta--time]') })")
        check('C: Karte zeigt Gesamtzeit, unbekannt ohne Zeit', cards['k'].strip() == '30 Min.' and not cards['u'], str(cards))

        # Detail-Zeitzeile und Screenshot
        await ev("async (r) => { await dbPut(r); await loadRecipes(); state.activeRecipeId = r.id; state.view = 'detail'; state.detailTab = 'ingredients'; render(); }", variant(restMinutes=60))
        await page.wait_for_selector('.detail-times')
        tl = await ev("() => document.querySelector('.detail-times').textContent.trim()")
        check('C: Detail: kompakte Zeitzeile', tl == '30 Min. Gesamtzeit · 1 Std. Ruhen', tl)
        await page.screenshot(path=os.path.join(OUT, 'v83_detail_karamell_390.png'))
        await page.set_viewport_size({'width': 1280, 'height': 900})
        await page.wait_for_timeout(200)
        await ev("() => render()")
        await page.screenshot(path=os.path.join(OUT, 'v83_detail_karamell_1280.png'))

        seed_after = await ev("() => JSON.stringify(state.recipes.filter(r => !String(r.id).startsWith('v83_')).map(r => [r.id, r.title, r.servings, r.servingMode || '', r.timeMinutes || 0, r.ingredients]))")
        check('Seed-Rezepte unverändert', seed_after == seed_before)
        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await b.close()
    print('\nFEHLGESCHLAGEN:', FAIL if FAIL else 'keine')
    sys.exit(1 if FAIL else 0)

asyncio.run(main())
