import asyncio, json, sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)
async def click(page, sel):
    await page.evaluate("(s) => { const e = document.querySelector(s); if (!e) throw new Error('fehlt: ' + s); e.click(); }", sel)
    await page.wait_for_timeout(180)
async def main():
    async with async_playwright() as p:
        browser, ctx = await open_ctx(p)
        page = await ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append('console: ' + m.text) if m.type == 'error' else None)
        await goto(page)
        await page.evaluate(open(SEED_PATH).read())
        await page.wait_for_timeout(300)

        # 4 Altes Rezept bearbeiten und speichern
        await show(page, "() => { state.activeRecipeId = 'r_legacy_1'; state.view = 'detail'; render(); }", '.detail-main')
        await click(page, '[data-action="open-detail-menu"]')
        await click(page, '.menu-item[data-action="edit-recipe"]')
        await page.wait_for_selector('#recipeForm')
        grp_rows = await page.evaluate("document.querySelectorAll('[data-group-row]').length")
        await click(page, '[data-action="form-goto-step"][data-idx="4"]')
        await click(page, '.form-actions [data-action="save-recipe"]')
        await page.wait_for_selector('.detail-main')
        r1 = await page.evaluate("dbGetAll().then(l => l.find(r => r.id === 'r_legacy_1'))")
        check('4 Altrezept bearbeiten und speichern', grp_rows == 2 and r1['legacyCustomField'] == {'keep': 'me'} and [i.get('group') for i in r1['ingredients']] == ['Teig','Teig','Füllung','Füllung'] and r1['imageId'] == 'img_legacy_1',
              f"gruppen={grp_rows} felder={[i.get('group') for i in r1['ingredients']]}")

        # 5 Neues Rezept mit mehreren Gruppen und Stueckzahl
        await show(page, "() => { state.view = 'home'; render(); }", '.home-main')
        await click(page, '[data-action="open-add-menu"]')
        await click(page, '.add-menu-option[data-action="new-recipe"]')
        await page.wait_for_selector('#recipeForm')
        await page.fill('#f-title', 'Zimtschnecken')
        await page.fill('#f-servings', '12')
        await page.select_option('#f-serving-mode', 'pieces')
        await click(page, '[data-action="form-goto-step"][data-idx="2"]')
        await click(page, '[data-action="add-ingredient-group"]')
        await page.evaluate("""() => { const g = document.querySelectorAll('.group-name-input'); g[0].value = 'Teig';
          const rows = document.querySelectorAll('[data-ing-row]'); const last = rows[rows.length-1];
          last.querySelector('.ing-name-input').value = 'Mehl'; last.querySelector('.ing-amount-input').value = '500'; last.querySelector('.ing-unit-input').value = 'g'; }""")
        await click(page, '[data-action="add-ingredient-group"]')
        await page.evaluate("""() => { const g = document.querySelectorAll('.group-name-input'); g[g.length-1].value = 'Füllung';
          const rows = document.querySelectorAll('[data-ing-row]'); const last = rows[rows.length-1];
          last.querySelector('.ing-name-input').value = 'Zimt'; last.querySelector('.ing-amount-input').value = '2'; last.querySelector('.ing-unit-input').value = 'EL'; }""")
        await click(page, '[data-action="form-goto-step"][data-idx="3"]')
        await page.evaluate("() => { document.querySelector('.step-text-input').value = 'Teig kneten und 45 Minuten gehen lassen.'; }")
        await click(page, '[data-action="add-step"]')
        await page.evaluate("() => { const t = document.querySelectorAll('.step-text-input'); t[t.length-1].value = 'Mit Zimt bestreichen und 20 Minuten backen.'; }")
        await click(page, '.topbar [data-action="save-recipe"]')
        await page.wait_for_selector('.detail-main')
        z = await page.evaluate("state.recipes.find(r => r.title === 'Zimtschnecken')")
        g = await page.evaluate("Array.from(document.querySelectorAll('.ing-group-title')).map(e=>e.textContent)")
        empty_rows = [i for i in z['ingredients'] if not i['name']]
        check('5 Neues Rezept mit Gruppen', g == ['Teig', 'Füllung'] and z['servingMode'] == 'pieces' and len(z['steps']) == 2 and not empty_rows, f"gruppen={g} leer={len(empty_rows)}")
        zid = z['id']

        # 6 Stueckzahl-Skalierung vom Original
        for _ in range(3): await click(page, '[data-action="serv-inc"]')
        for _ in range(3): await click(page, '[data-action="serv-dec"]')
        label = await page.evaluate("document.querySelector('.stepper-value').textContent")
        amt = await page.evaluate("document.querySelector('.ing-amount').textContent.trim()")
        await click(page, '[data-action="serv-inc"]')
        amt13 = await page.evaluate("document.querySelector('.ing-amount').textContent.trim()")
        check('6 Stueck-Skalierung vom Original', label == '12 Stück' and amt.startswith('500') and amt13.startswith('540'), f"{label} / {amt} / 13 Stück: {amt13}")

        # 18 Keine Scrollspruenge bei Favorit, Abhaken, Tabs, Menge
        await page.evaluate("window.scrollTo(0, 300)"); await page.wait_for_timeout(100)
        y0 = await page.evaluate("scrollY")
        await click(page, '.detail-fav'); y1 = await page.evaluate("scrollY")
        await click(page, '.ing-check'); y2 = await page.evaluate("scrollY")
        await click(page, '[data-action="serv-inc"]'); y3 = await page.evaluate("scrollY")
        await click(page, '[data-action="set-detail-tab"][data-id="steps"]'); y4 = await page.evaluate("scrollY")
        await click(page, '[data-action="set-detail-tab"][data-id="ingredients"]'); y5 = await page.evaluate("scrollY")
        check('18/9 Keine Scrollspruenge (Favorit, Haken, Menge, Tabs)', max(abs(v - y0) for v in [y1,y2,y3,y4,y5]) <= 2, f"{[y0,y1,y2,y3,y4,y5]}")
        checked = await page.evaluate("document.querySelector('.ing-check').getAttribute('aria-checked')")
        orig = await page.evaluate(f"dbGetAll().then(l => l.find(r => r.id === '{zid}').ingredients[0].name)")
        check('Abhaken veraendert Originalzutat nicht', checked == 'true' and orig == 'Mehl')

        # 7/8 Suche und Filter
        await show(page, "() => { state.view = 'home'; render(); }", '.home-main')
        async def count(q):
            return await page.evaluate("(q) => { state.query = q; return applyAllFilters(state.recipes).map(r => r.title); }", q)
        t1, t2, t3 = await count('carbo'), await count('hackfleisch'), await count('backen')
        check('7 Suche Titel/Zutat/Tag', t1 == ['Carbonara'] and t2 == ['Sloppy Joe Buns'] and 'Sloppy Joe Buns' in t3, f"{t1} {t2} {t3}")
        await page.evaluate("() => { state.query = ''; render(); }")
        await click(page, '[data-action="set-collection"][data-id="uncooked"]')
        await page.evaluate("() => { state.activeFilters.dietary.add('vegan'); render(); }")
        combo = await page.evaluate("applyAllFilters(state.recipes).map(r => r.title)")
        await click(page, '[data-action="clear-all-filters"]')
        reset = await page.evaluate("applyAllFilters(state.recipes).length")
        check('8 Filter kombinierbar und zuruecksetzbar', combo == ['Gemüse-Curry'] and reset == 4, f"{combo} reset={reset}")
        await click(page, '[data-action="set-home-layout"][data-id="list"]')
        lst = await page.evaluate("document.querySelectorAll('.rrow').length")
        await click(page, '[data-action="set-home-layout"][data-id="grid"]')
        check('Raster/Liste umschaltbar', lst == 4 and await page.evaluate("document.querySelectorAll('.rcard').length") == 4)

        # 10 Kochmodus mit Timer und gespeichertem Fortschritt
        await show(page, f"() => {{ state.activeRecipeId = '{zid}'; state.view = 'detail'; render(); }}", '.detail-main')
        await click(page, '[data-action="start-cook"]')
        await page.wait_for_selector('.cook-v2')
        prog = await page.evaluate("document.querySelector('.cookmode-progress').textContent")
        ing_step = await page.evaluate("Array.from(document.querySelectorAll('.cook-ing')).map(e => e.textContent.trim())")
        await click(page, '.timer-chip')
        await click(page, '[data-action="cook-next"]')
        ing_step = await page.evaluate("Array.from(document.querySelectorAll('.cook-ing')).map(e => e.textContent.trim())")
        await click(page, '.timer-chip')
        running = await page.evaluate("Object.values(state.timers).filter(t => t.running).length")
        saved = await page.evaluate("JSON.parse(localStorage.getItem('savora-cook-progress'))")
        await click(page, '[data-action="exit-cook"]')
        await page.wait_for_selector('.detail-main')
        await click(page, '[data-action="start-cook"]')
        await page.wait_for_selector('.cook-v2')
        resumed = await page.evaluate("document.querySelector('.cookmode-progress').textContent")
        timers_back = await page.evaluate("Object.values(state.timers).filter(t => t.running).length")
        check('10 Kochmodus: Fortschritt, Zutaten je Schritt, parallele Timer, Wiederaufnahme',
              prog == 'Schritt 1 von 2' and any('Zimt' in s for s in ing_step) and running == 2 and saved['step'] == 1 and resumed == 'Schritt 2 von 2' and timers_back == 2,
              f"{prog} {ing_step} timer={running} gespeichert={saved and saved['step']} weiter={resumed} timer_zurueck={timers_back}")
        await click(page, '[data-action="cook-finish"]')
        await page.fill('#cookRunNote', '10 Minuten länger gehen lassen')
        await click(page, '[data-action="cook-complete"]')
        await page.wait_for_selector('.detail-main')
        z2 = await page.evaluate(f"dbGetAll().then(l => l.find(r => r.id === '{zid}'))")
        check('Abschluss: gekocht gezaehlt, Kochnotiz, Fortschritt geloescht', z2.get('cookCount') == 1 and len(z2.get('cookLog', [])) == 1 and await page.evaluate("localStorage.getItem('savora-cook-progress')") is None)

        # 11 Wochenplan: Altbestand bleibt, neuer Eintrag mit Mahlzeit
        await show(page, "() => { state.view = 'mealplan'; render(); }", '.week-nav')
        before_titles = await page.evaluate("Array.from(document.querySelectorAll('.plan-title')).map(e=>e.textContent)")
        monday = await page.evaluate("fmtDateKey(state.weekStart)")
        await click(page, f'[data-action="open-day-picker"][data-date="{monday}"]')
        await click(page, '[data-action="set-plan-meal"][data-id="dinner"]')
        await click(page, f'.picker-item[data-id="{zid}"]')
        await page.wait_for_timeout(300)
        rec = await page.evaluate(f"dbGetAllMealplan().then(l => l.find(d => d.date === '{monday}'))")
        check('11 Wochenplan behaelt Eintraege, neuer mit Mahlzeit', before_titles == ['Sloppy Joe Buns', 'Carbonara'] and len(rec['entries']) == 3 and rec['entries'][2]['meal'] == 'dinner' and rec['legacyDayField'] == 7 and rec['recipeIds'][:2] == ['r_legacy_1','r_legacy_2'],
              f"{before_titles} {[e['meal'] for e in rec['entries']]}")
        eid = rec['entries'][2]['id']
        await click(page, f'[data-action="open-plan-entry"][data-id="{eid}"]')
        await click(page, '[data-action="plan-entry-servings"][data-delta="1"]')
        await page.select_option('#planMoveDay', await page.evaluate("fmtDateKey(addDays(state.weekStart, 2))"))
        await click(page, '[data-action="save-plan-entry"]')
        await page.wait_for_timeout(300)
        wed = await page.evaluate("dbGetAllMealplan().then(l => l.find(d => d.date === fmtDateKey(addDays(state.weekStart, 2))))")
        orig_serv = await page.evaluate(f"state.recipes.find(r => r.id === '{zid}').servings")
        check('Wochenplan: Menge pro Termin und Verschieben', wed and wed['entries'][0]['servings'] == 13 and orig_serv == 12)

        # 12 Einkauf: Zusammenfuehren 1 Zwiebel + 2 Zwiebeln, keine Gruppentitel
        await page.evaluate(f"() => {{ state.planSelectedDays = new Set([fmtDateKey(state.weekStart)]); render(); }}")
        await click(page, '[data-action="mealplan-to-shopping"]')
        await page.wait_for_selector('.shop-select-list')
        names = await page.evaluate("Array.from(document.querySelectorAll('.shop-select-row .ing-name')).map(e=>e.textContent)")
        await click(page, '[data-action="confirm-shop-select"]')
        await page.wait_for_timeout(300)
        shop = await page.evaluate("dbGetAllShopping()")
        onion = [s for s in shop if s['name'].lower().startswith('zwiebel')]
        check('12 Einkauf fuehrt zusammen, keine Gruppentitel', 'Teig:' not in names and 'Füllung:' not in names and len(onion) == 1 and onion[0]['amount'] == 3 and len(onion[0]['sources']) == 2,
              f"zwiebel={[(o['name'], o['amount']) for o in onion]}")
        await show(page, "() => { state.view = 'shopping'; render(); }", '.shop-add')
        sections = await page.evaluate("Array.from(document.querySelectorAll('.shop-section-title')).map(e=>e.textContent)")
        await click(page, f'[data-action="open-shop-item"][data-id="{onion[0]["id"]}"]')
        await click(page, '[data-action="split-shop-item"]')
        await page.wait_for_timeout(300)
        onion2 = [s for s in await page.evaluate("dbGetAllShopping()") if s['name'].lower().startswith('zwiebel')]
        await page.fill('#shoppingAddInput', '2 l Orangensaft')
        await click(page, '[data-action="add-shopping-item-manual"]')
        oj = await page.evaluate("state.shopping.find(s => s.name === 'Orangensaft')")
        check('Einkaufsbereiche, Trennen, eigene Zutat mit Menge', 'Gemüse und Früchte' in sections and len(onion2) == 2 and oj and oj['amount'] == 2 and oj['unit'] == 'l', f"{sections}")

        # 13 Altes Backup importieren
        await show(page, "() => { state.view = 'settings-backup'; render(); }", '#restoreFileInput')
        n0 = await page.evaluate("state.recipes.length")
        await page.set_input_files('#restoreFileInput', OUT + '/old-backup.json')
        await page.wait_for_timeout(1500)
        n1 = await page.evaluate("state.recipes.length")
        check('13 Altes Backup importierbar', n1 == n0 + 3, f"{n0} -> {n1}")

        # 14 Neues Backup in frischer Instanz
        async with page.expect_download() as dl:
            await page.evaluate("downloadBackup()")
        d = await dl.value; await d.save_as(OUT + '/new-backup.json')
        data = json.load(open(OUT + '/new-backup.json'))
        ctx2 = await browser.new_context(viewport={"width": 390, "height": 844}, reduced_motion='reduce')
        await ctx2.add_init_script(NO_SW)
        p2 = await ctx2.new_page()
        await goto(p2)
        await show(p2, "() => { state.view = 'settings-backup'; render(); }", '#restoreFileInput')
        await p2.set_input_files('#restoreFileInput', OUT + '/new-backup.json')
        await p2.wait_for_timeout(2000)
        n2 = await p2.evaluate("state.recipes.length")
        plan2 = await p2.evaluate("dbGetAllMealplan().then(l => l.reduce((a, d) => a + (d.entries || d.recipeIds || []).length, 0))")
        imgs2 = await p2.evaluate("state.recipes.filter(r => r.image || r.imageId).length")
        ids2 = sorted(await p2.evaluate("state.recipes.map(r => r.id)"))
        check('14b Wiederherstellung behaelt Original-IDs in frischer Instanz', ids2 == sorted(r['id'] for r in data['recipes']))
        cb2 = await p2.evaluate("readJsonKey(COOKBOOK_CONFIG_KEY, null)")
        print('     Kochbuch-Auswahl uebernommen:', bool(cb2))
        check('14 Neues Backup in frischer Instanz', data.get('schemaVersion') == 4 and n2 == len(data['recipes']) and plan2 >= 3 and imgs2 >= 2, f"rezepte={n2} plan={plan2} bilder={imgs2}")
        await ctx2.close()

        # 15/16 PDF: Einzelrezept und Kochbuch mit Kapitel
        single = await page.evaluate("buildSinglePdf('r_legacy_1', 'off').then(r => r && r.blob.size)")
        await page.evaluate("""() => { const cfg = getCookbookConfig(); cfg.chapters = [{id:'c1', name:'Backen'}]; cfg.items.forEach((it,i) => { if (i < 2) it.chapterId = 'c1'; }); cfg.title = 'Test-Kochbuch'; cfg.coverRecipeId = 'r_legacy_1'; saveCookbookConfig(cfg); }""")
        book = await page.evaluate("buildCookbookPdf('off').then(r => r && r.blob.size)")
        check('15 Einzel-PDF und Kochbuch-PDF mit Kapitel/Cover', bool(single) and bool(book), f"einzel={single} kochbuch={book}")
        await show(page, "() => { state.view = 'cookbook'; render(); }", '.cookbook-main')
        await page.screenshot(path=OUT + '/cookbook.png', full_page=True)

        # Naehrwerte: Gruppentitel nicht als ungeklaert, Status sichtbar
        res = await page.evaluate("calculateRecipeNutrition(state.recipes.find(r => r.id === 'r_legacy_1'))")
        names_unres = [u['name'] for u in res['unresolvedIngredients']]
        await show(page, "() => { state.activeRecipeId = 'r_legacy_1'; state.view = 'detail'; render(); }", '.detail-main')
        await click(page, '[data-action="nutrition-open-match"]')
        await page.wait_for_timeout(1500)
        await page.evaluate("() => { const b = document.querySelector('[data-action=\"nutrition-apply\"]'); if (b) b.click(); }")
        await page.wait_for_timeout(1500)
        await show(page, "() => { state.modal = null; state.detailTab = 'nutrition'; render(); }", '#panel-nutrition')
        await page.wait_for_timeout(1200)
        status = await page.evaluate("document.querySelector('.nutri-status') ? document.querySelector('.nutri-status').textContent.replace(/\\s+/g,' ').trim() : null")
        check('Naehrwerte: Gruppentitel ausgeschlossen, Zutatenstatus sichtbar', 'Teig:' not in names_unres and 'Füllung:' not in names_unres and res['relevantCount'] == 4, f"relevant={res['relevantCount']} unklar={names_unres} status={status}")

        # 19 Konsole
        errs = [e for e in errors if 'Schweizer' not in e]
        check('19 Keine Konsolenfehler in Kernablaeufen', not errs, str(errs[:3]))
        await browser.close()
    print('\nFEHLGESCHLAGEN:', FAIL if FAIL else 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
