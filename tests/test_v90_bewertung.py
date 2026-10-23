"""v0.90 Bewertung (1 bis 5 Sterne): Radiogruppe im Rezeptdetail (44 px, Tastatur, nochmal antippen entfernt), Speichern in
der Datenbank mit ratedAt, validate.js entfernt ungueltige Werte mit Warnung (gueltige bleiben, Sicherung/Import behalten die
Bewertung), Sortierung «Beste Bewertung» (ohne Bewertung am Ende, Hinweis), Filter «Ab 4 Sternen», Duplizieren setzt zurueck,
Cloud: das Feld reist mit dem Rezept (zwei Geraete, Nachbau-Server), kein Konflikt-Duplikat durch Bewertung allein."""
import asyncio, sys, os, threading, json, uuid
os.environ.setdefault('SAVORA_TEST_PORT', '49024')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
import mock_supabase as M
from http.server import ThreadingHTTPServer
srv = ThreadingHTTPServer(('127.0.0.1', 0), M.H)
MOCK_PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
CLOUD = f"window.SAVORA_CLOUD_URL_OVERRIDE = 'http://127.0.0.1:{MOCK_PORT}'; window.SAVORA_CLOUD_KEY_OVERRIDE = 'test-key'; window.__SAVORA_NO_NUTRITION_BACKFILL = true;"
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

def recipe(rid, title, **kw):
    r = {'id': rid, 'title': title, 'servings': 2, 'timeMinutes': 20, 'tags': [], 'diet': [], 'categoryTags': [],
         'ingredients': [{'amount': '200', 'unit': 'g', 'name': 'Mehl'}], 'steps': [{'text': 'Backen.'}], 'createdAt': 1000, 'updatedAt': 2000}
    r.update(kw); return r

async def device(browser, name, w=390, h=844):
    ctx = await browser.new_context(viewport={'width': w, 'height': h}, reduced_motion='reduce', timezone_id='UTC')
    await ctx.add_init_script(NO_SW + " try{localStorage.setItem('savora-splash-seen','1')}catch(e){}")
    await ctx.add_init_script(CLOUD + f" try{{localStorage.setItem('savora-device-name', {json.dumps(name)})}}catch(e){{}}")
    page = await ctx.new_page()
    errs = []; page.on('pageerror', lambda e: errs.append(f'{name}: {e}'))
    await goto(page)
    return ctx, page, errs

async def stars(page):
    return await page.evaluate("() => [...document.querySelectorAll('.rate-star')].map(b => b.getAttribute('aria-checked'))")

async def main():
    EMAIL, PW = 'bewertung@example.test', 'geheim-123'
    M.USERS[EMAIL] = {'id': str(uuid.uuid4()), 'password': PW, 'confirmed': True}
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ca, A, errA = await device(browser, 'Laptop')
        cb, B, errB = await device(browser, 'iPhone')
        for pg in (A, B): await pg.evaluate("() => { window.cloudScheduleSync = () => {}; }")
        await A.evaluate("""async (list) => { for (const r of list) await dbPut(r); state.recipes = (await dbGetAll()).sort((a, b) => b.updatedAt - a.updatedAt); }""",
                         [recipe('r1', 'Apfelkuchen'), recipe('r2', 'Brot', timeMinutes=60), recipe('r3', 'Curry'), recipe('r4', 'Dattelkuchen')])

        # 1. Radiogruppe im Detail
        await A.evaluate("() => { state.activeRecipeId = 'r1'; state.view = 'detail'; render(); }")
        await A.wait_for_selector('.rating-row')
        info = await A.evaluate("() => { const g = document.querySelector('[data-rating-group]'); const b = [...g.querySelectorAll('.rate-star')]; return { role: g.getAttribute('role'), n: b.length, roles: b.every(x => x.getAttribute('role') === 'radio'), sizes: b.map(x => Math.round(x.getBoundingClientRect().width) + 'x' + Math.round(x.getBoundingClientRect().height)), labelled: !!g.getAttribute('aria-labelledby') }; }")
        check('Radiogruppe mit 5 Sternen', info['role'] == 'radiogroup' and info['n'] == 5 and info['roles'] and info['labelled'], str(info))
        check('Jeder Stern mindestens 44 x 44 px', all(int(x.split('x')[0]) >= 44 and int(x.split('x')[1]) >= 44 for x in info['sizes']), str(info['sizes']))
        check('Noch nicht bewertet', await stars(A) == ['false'] * 5 and 'Noch nicht bewertet' in await A.inner_text('#rating-hint'))
        await A.click('.rate-star[data-val="4"]')
        await A.wait_for_function("document.querySelector('.rate-star[data-val=\"4\"]').getAttribute('aria-checked') === 'true'")
        r = await A.evaluate("dbGetRecipe('r1')")
        check('4 Sterne gespeichert mit ratedAt', r.get('rating') == 4 and r.get('ratedAt', 0) > 0, str((r.get('rating'), r.get('ratedAt'))))
        check('Anzeige: nur Stern 4 aktiv, Text', await stars(A) == ['false', 'false', 'false', 'true', 'false'] and '4 von 5' in await A.inner_text('#rating-hint'))
        check('Gefuellte Sterne bis 4', await A.evaluate("[...document.querySelectorAll('.rate-star')].map(b => b.classList.contains('is-on')).join()") == 'true,true,true,true,false')
        sy = await A.evaluate("window.scrollY")
        await A.click('.rate-star[data-val="4"]')
        await A.wait_for_function("document.querySelector('.rate-star[data-val=\"4\"]').getAttribute('aria-checked') === 'false'")
        r = await A.evaluate("dbGetRecipe('r1')")
        check('Nochmal antippen entfernt (rating null)', r.get('rating') is None, str(r.get('rating')))
        await A.focus('.rate-star[data-val="1"]')
        await A.keyboard.press('ArrowRight'); await A.keyboard.press('ArrowRight')
        await A.wait_for_function("document.querySelector('.rate-star[data-val=\"3\"]').getAttribute('aria-checked') === 'true'")
        r = await A.evaluate("dbGetRecipe('r1')")
        check('Pfeil rechts waehlt weiter (3)', r.get('rating') == 3, str(r.get('rating')))
        check('Fokus wandert mit', await A.evaluate("document.activeElement && document.activeElement.dataset.val") == '3')
        await A.keyboard.press('End')
        await A.wait_for_function("document.querySelector('.rate-star[data-val=\"5\"]').getAttribute('aria-checked') === 'true'")
        await A.keyboard.press('Home')
        await A.wait_for_function("document.querySelector('.rate-star[data-val=\"1\"]').getAttribute('aria-checked') === 'true'")
        check('Ende = 5, Pos1 = 1', True)
        check('Nur ein Stern im Tab-Weg (roving tabindex)', await A.evaluate("[...document.querySelectorAll('.rate-star')].filter(b => b.tabIndex === 0).length") == 1)
        await A.screenshot(path=os.path.join(OUT, 'h2-rating-390-light.png'))

        # 2. validate.js
        v = await A.evaluate("""() => ['rating-x', 7, 3.5, 0, '4', 5, null].map(x => { const r = validateRecipe(Object.assign(emptyRecipe(), { title: 'T', rating: x, ratedAt: 5 })); return [r.ok, r.recipe && r.recipe.rating, r.warnings.length]; })""")
        check('Ungueltig (Text, 7, 3.5, 0, "4") wird entfernt mit Warnung',
              all(x[0] and x[1] is None and x[2] >= 1 for x in v[:5]), str(v))
        check('Gueltig 5 und null bleiben ohne Warnung', v[5][1] == 5 and v[5][2] == 0 and v[6][1] is None and v[6][2] == 0, str(v[5:]))

        # 3. Sortierung und Filter
        await A.evaluate("""async () => { for (const [id, n, t] of [['r1', 5, 3000], ['r2', 4, 4000], ['r3', 5, 5000]]) { const r = await dbGetRecipe(id); r.rating = n; r.ratedAt = t; await dbPut(r); } state.recipes = (await dbGetAll()).sort((a, b) => b.updatedAt - a.updatedAt); }""")
        order = await A.evaluate("hvSortRecipes(state.recipes, 'rating').map(r => r.id).join()")
        check('Sortierung: 5 Sterne (zuletzt bewertet zuerst), 4, ohne Bewertung am Ende', order == 'r3,r1,r2,r4', order)
        await A.evaluate("() => { state.view = 'home'; state.sortBy = 'rating'; render(); }")
        await A.wait_for_selector('.result-line')
        hint = await A.evaluate("hvSortHint(state.recipes)")
        check('Hinweis: ohne Bewertung am Ende', 'ohne Bewertung' in hint, hint)
        check('Sortier-Auswahl enthaelt «Beste Bewertung»', await A.evaluate("!![...document.querySelectorAll('#sortSelect option')].find(o => o.value === 'rating')") or await A.evaluate("HV_SORT_OPTIONS.some(o => o.id === 'rating')"))
        await A.evaluate("localStorage.setItem('savora-sort', 'rating')"); await A.reload(); await A.wait_for_function("typeof state !== 'undefined' && document.getElementById('app').children.length > 0")
        check('Gemerkte Sortierung «rating» wird beim Start gelesen (state.js)', await A.evaluate("state.sortBy") == 'rating')
        await A.evaluate("localStorage.setItem('savora-sort', 'updated')")
        await A.evaluate("() => { state.activeFilters.more.add('rating4'); }")
        ids = await A.evaluate("applyAllFilters(state.recipes).map(r => r.id).join()")
        check('Filter «Ab 4 Sternen»: r3, r1, r2', ids == 'r3,r1,r2', ids)
        check('Filter zaehlt als aktiv', await A.evaluate("activeStructuredFilterCount()") >= 1)
        await A.evaluate("() => { state.openFilter = true; openModal({ type: 'filter-sheet' }); }")
        await A.wait_for_selector('.filter-sheet')
        check('Filterfenster bietet «Ab 4 Sternen» an', 'Ab 4 Sternen' in await A.inner_text('.filter-sheet'))
        await A.evaluate("() => { state.modal = null; state.activeFilters.more.clear(); state.sortBy = 'updated'; }")

        # 4. Duplizieren setzt die Bewertung zurueck
        await A.evaluate("() => { state.activeRecipeId = 'r1'; state.view = 'detail'; render(); }")
        await A.evaluate("() => handleActionV2('duplicate-recipe', 'r1', document.body, new Event('click'))")
        await A.wait_for_timeout(300)
        cp = await A.evaluate("dbGetAll().then(l => l.find(r => /Kopie/.test(r.title)))")
        check('Kopie ist unbewertet', cp is not None and not cp.get('rating'), str(cp and cp.get('rating')))

        # 5. Cloud: das Feld reist mit, keine Kopie durch Bewertung allein
        await A.evaluate(f"cloudAuthSignIn({json.dumps(EMAIL)}, {json.dumps(PW)})"); await A.evaluate("cloudSyncNow()")
        await B.evaluate(f"cloudAuthSignIn({json.dumps(EMAIL)}, {json.dumps(PW)})"); await B.evaluate("cloudSyncNow()")
        got = await B.evaluate("dbGetRecipe('r2').then(r => [r.rating, r.ratedAt])")
        check('B erhaelt Bewertung von A', got[0] == 4 and got[1] == 4000, str(got))
        await B.evaluate("() => rateRecipe && 0"); await B.evaluate("() => { state.recipes = []; return dbGetAll().then(l => { state.recipes = l; }); }")
        await B.evaluate("() => rateRecipe('r2', 2, false)")
        await B.evaluate("cloudSyncNow()"); await A.evaluate("cloudSyncNow()")
        got = await A.evaluate("dbGetRecipe('r2').then(r => r.rating)")
        check('Neue Bewertung von B kommt bei A an', got == 2, str(got))
        # beide bewerten ohne Textaenderung: neueres ratedAt gewinnt, keine Kopie
        await A.evaluate("() => { state.recipes = []; return dbGetAll().then(l => { state.recipes = l; }); }")
        await A.evaluate("() => rateRecipe('r2', 5, false)")
        await B.wait_for_timeout(20)
        await B.evaluate("() => rateRecipe('r2', 1, false)")
        await B.evaluate("cloudSyncNow()"); await A.evaluate("cloudSyncNow()"); await B.evaluate("cloudSyncNow()")
        ra = await A.evaluate("dbGetAll().then(l => [l.filter(r => r.title === 'Brot').length, l.find(r => r.id === 'r2').rating, l.some(r => r.conflictOf)])")
        rb = await B.evaluate("dbGetAll().then(l => [l.filter(r => r.title === 'Brot').length, l.find(r => r.id === 'r2').rating, l.some(r => r.conflictOf)])")
        check('Gleichzeitig bewertet: neuere gewinnt (1), keine Konfliktkopie', ra == [1, 1, False] and rb == [1, 1, False], f'{ra} {rb}')

        # 6. Optik
        for w, h, scheme in ((375, 667, 'light'), (390, 844, 'dark')):
            await A.set_viewport_size({'width': w, 'height': h})
            await A.evaluate(f"() => {{ document.documentElement.setAttribute('data-theme', '{scheme}'); state.activeRecipeId = 'r3'; state.view = 'detail'; render(); }}")
            await A.wait_for_selector('.rating-block')
            await A.evaluate("() => document.querySelector('.rating-block').scrollIntoView({ block: 'center' })")
            await A.wait_for_timeout(250)
            ov = await overflow_info(A)
            check(f'{w}px {scheme}: kein Ueberlauf', not ov, str(ov)[:100])
            await A.screenshot(path=os.path.join(OUT, f'h2-rating-{w}-{scheme}.png'))
        check('Keine Seitenfehler', not (errA + errB), str((errA + errB)[:3]))
        await browser.close()
    print('\n%d Fehler' % len(FAIL) if FAIL else '\nAlles gruen')
    sys.exit(1 if FAIL else 0)
asyncio.run(main())
