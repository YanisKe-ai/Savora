"""v0.90 Sync-Konflikte und Papierkorb-Abgleich (Cloud-Teil) ueber zwei Geraete und den Nachbau-Server.
Prueft: beide Seiten geaendert -> Verliererseite als «… (Kopie von <Geraet>)» (deterministische ID, keine Doppelkopie),
Verlierer Cloud (lokal neuer, ausstehend) ebenso, nur Bewertung verschieden -> neueres ratedAt gewinnt ohne Kopie,
erster Abgleich ohne Basis -> nie Kopie, syncDevice nur in der Cloud, geloeschtes Rezept als Grabstein mit Papierkorb-Daten,
Wiederherstellen auf dem anderen Geraet, endgueltig loeschen (Bild weg) und alter Grabstein ohne Daten loescht weiter."""
import asyncio, sys, threading, json, uuid
import os as _os
_os.environ.setdefault('SAVORA_TEST_PORT', '49004')
sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
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

EMAIL, PW = 'konflikt@example.test', 'geheim-123'
def recipe(rid, title, **kw):
    r = {'id': rid, 'title': title, 'servings': 2, 'timeMinutes': 20, 'tags': [], 'diet': [], 'categoryTags': [],
         'ingredients': [{'amount': '200', 'unit': 'g', 'name': 'Mehl'}], 'steps': [{'text': 'Backen.'}], 'createdAt': 1000, 'updatedAt': 2000}
    r.update(kw); return r

async def device(browser, name):
    ctx = await browser.new_context(viewport={'width': 800, 'height': 700}, reduced_motion='reduce', timezone_id='UTC')
    await ctx.add_init_script(NO_SW + " try{localStorage.setItem('savora-splash-seen','1')}catch(e){}")
    await ctx.add_init_script(CLOUD + f" try{{localStorage.setItem('savora-device-name', {json.dumps(name)})}}catch(e){{}}")
    page = await ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(f'{name}: {e}'))
    await goto(page)
    return ctx, page, errs

async def sign_in(page):
    await page.evaluate(f"cloudAuthSignIn({json.dumps(EMAIL)}, {json.dumps(PW)})")
    return await page.evaluate("cloudSyncNow()")

async def put(page, r):
    await page.evaluate("async (r) => { await dbPut(r); }", r)

async def edit(page, rid, patch):
    await page.evaluate("async ([id, patch]) => { const r = await dbGetRecipe(id); Object.assign(r, patch, { updatedAt: Date.now() }); await dbPut(r); }", [rid, patch])
    await page.wait_for_timeout(5)

async def titles(page):
    return await page.evaluate("dbGetAll().then(l => l.map(r => r.title).sort())")

def server(uid, rid): return M.RECORDS.get((uid, 'recipe', rid))

async def main():
    M.USERS[EMAIL] = {'id': str(uuid.uuid4()), 'password': PW, 'confirmed': True}
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ca, A, errA = await device(browser, 'Laptop')
        cb, B, errB = await device(browser, 'iPhone')
        # Kein automatischer Abgleich dazwischen: die Reihenfolge bestimmt der Test
        for pg in (A, B): await pg.evaluate("() => { window.cloudScheduleSync = () => {}; }")

        await put(A, recipe('r_k1', 'Zopf'))
        await sign_in(A)
        uid = await A.evaluate("cloudUserId()")
        r = await sign_in(B)
        check('B erhaelt das Rezept', 'Zopf' in await titles(B), str(r))
        sd = (server(uid, 'r_k1') or {}).get('data') or {}
        local_sd = await B.evaluate("dbGetRecipe('r_k1').then(r => 'syncDevice' in r)")
        check('syncDevice steht in der Cloud, nicht lokal', sd.get('syncDevice') == 'Laptop' and not local_sd, str(sd.get('syncDevice')))
        base_b = await B.evaluate("cloudBaseGet('recipe|r_k1')")
        check('Basis nach dem Abzug bekannt', bool(base_b), str(base_b))

        # 1. Beide aendern: A zuerst, dann B (neuer). B laedt hoch, A zieht B -> A behaelt seinen Stand als Kopie
        await edit(A, 'r_k1', {'title': 'Zopf vom Laptop', 'notes': 'mit Butter'})
        await edit(B, 'r_k1', {'title': 'Zopf vom iPhone', 'notes': 'mit Hefe'})
        await B.evaluate("cloudSyncNow()")
        await A.evaluate("cloudSyncNow()")
        ta = await titles(A)
        check('Konflikt: Cloud-Stand gewinnt, lokaler Stand bleibt als Kopie', sorted(ta) == sorted(['Zopf vom iPhone', 'Zopf vom Laptop (Kopie von Laptop)']), str(ta))
        copy = await A.evaluate("dbGetAll().then(l => l.find(r => r.conflictOf === 'r_k1'))")
        check('Kopie: ID k-…, conflictOf, conflictAt, Notizen erhalten', copy and copy['id'].startswith('k-') and copy.get('conflictAt') and copy.get('notes') == 'mit Butter', str(copy and copy['id']))
        await B.evaluate("cloudSyncNow()")
        tb = await titles(B)
        check('Kopie kommt auf das andere Geraet', tb == ta, str(tb))
        await A.evaluate("cloudSyncNow()"); await B.evaluate("cloudSyncNow()")
        n_copies = await A.evaluate("dbGetAll().then(l => l.filter(r => r.conflictOf).length)")
        check('Weitere Abgleiche erzeugen keine weitere Kopie', n_copies == 1 and await titles(B) == ta, str(n_copies))

        # 2. Verlierer ist die Cloud: B laedt hoch, A ist danach lokal neuer (ausstehend) und zieht vor dem Hochladen
        await edit(B, 'r_k1', {'title': 'Zopf B2'})
        await B.evaluate("cloudSyncNow()")
        await edit(A, 'r_k1', {'title': 'Zopf A2'})
        await A.evaluate("cloudPull(cloudSyncCtx())")
        ta = await titles(A)
        check('Lokal neuer: Cloud-Stand bleibt als «Kopie von iPhone»', 'Zopf A2' in ta and 'Zopf B2 (Kopie von iPhone)' in ta, str(ta))
        await A.evaluate("cloudSyncNow()"); await B.evaluate("cloudSyncNow()")
        tb = await titles(B)
        check('Danach beide gleich (Gewinner + beide Kopien)', sorted(tb) == sorted(await titles(A)) and 'Zopf A2' in tb, str(tb))

        # 3. Nur Bewertung verschieden: neueres ratedAt gewinnt, keine Kopie
        before = len(await titles(A))
        now = await A.evaluate("Date.now()")
        await edit(A, 'r_k1', {'rating': 5, 'ratedAt': now})
        await edit(B, 'r_k1', {'rating': 2, 'ratedAt': now - 60000, 'favorite': True})   # aelter bewertet, aber spaeter gespeichert
        await A.evaluate("cloudSyncNow()"); await B.evaluate("cloudSyncNow()"); await A.evaluate("cloudSyncNow()"); await B.evaluate("cloudSyncNow()")
        ra = await A.evaluate("dbGetRecipe('r_k1').then(r => [r.rating, r.favorite])")
        rb = await B.evaluate("dbGetRecipe('r_k1').then(r => [r.rating, r.favorite])")
        check('Bewertung: neueres ratedAt gewinnt auf beiden Geraeten, keine Kopie', ra[0] == 5 and rb[0] == 5 and len(await titles(A)) == before and len(await titles(B)) == before, f'{ra} {rb}')

        # 4. Erster Abgleich ohne Basis: nie eine Kopie (Geraet C mit eigenem, anderem Stand derselben ID)
        cc, C, errC = await device(browser, 'Tablet')
        await C.evaluate("() => { window.cloudScheduleSync = () => {}; }")
        await put(C, recipe('r_k1', 'Zopf ganz anders', updatedAt=1500))
        await sign_in(C); await C.evaluate("cloudSyncNow()")
        tc = await titles(C)
        check('Erster Abgleich: keine Kopie, neuerer Stand gewinnt', not any('Kopie von Tablet' in t for t in tc) and 'Zopf A2' in tc, str(tc))
        await cc.close()

        # 5. Papierkorb: A loescht (Grabstein mit Papierkorb-Daten), B legt es in den Papierkorb, Bild bleibt
        await A.evaluate("""async () => { const blob = new Blob([new Uint8Array(400).fill(7)], { type: 'image/jpeg' });
            await dbPutImage({ id: 'img_t1', blob, thumbBlob: blob, mime: 'image/jpeg' });
            await dbPut({ id: 'r_t1', title: 'Wähe', imageId: 'img_t1', ingredients: [], steps: [], createdAt: 1, updatedAt: Date.now() }); }""")
        await A.evaluate("cloudSyncNow()"); await B.evaluate("cloudSyncNow()")
        check('Rezept mit Bild auf B', await B.evaluate("Promise.all([dbGetRecipe('r_t1'), dbGetImage('img_t1')]).then(([r, i]) => !!r && !!i)"))
        await A.evaluate("dbGetRecipe('r_t1').then(r => recipeTrashOnDelete(r))")
        await A.evaluate("cloudSyncNow()")
        row = server(uid, 'r_t1') or {}
        check('Cloud: Grabstein mit data.trash (Rezept + Zeitpunkt)', row.get('deleted') and (row.get('data') or {}).get('trash', {}).get('recipe', {}).get('title') == 'Wähe', str(row.get('data'))[:120])
        await B.evaluate("cloudSyncNow()")
        st = await B.evaluate("Promise.all([dbGetRecipe('r_t1'), dbGetRecipeTrash('r_t1'), dbGetImage('img_t1')]).then(([r, t, i]) => [!!r, !!(t && t.recipe && t.recipe.title === 'Wähe' && t.deletedAt), !!i])")
        check('B: Rezept weg, im Papierkorb, Bild noch da', st == [False, True, True], str(st))
        # Wiederherstellen auf B -> A bekommt es zurueck, Papierkorb dort leer
        await B.evaluate("recipeTrashRestoreCore('r_t1')")
        await B.evaluate("cloudSyncNow()"); await A.evaluate("cloudSyncNow()")
        st = await A.evaluate("Promise.all([dbGetRecipe('r_t1'), dbGetRecipeTrash('r_t1')]).then(([r, t]) => [!!r, !!t])")
        check('Wiederherstellen: auf A wieder da, Papierkorb-Eintrag weg', st == [True, False], str(st))
        # Endgueltig: erneut loeschen, dann endgueltig -> Grabstein ohne Daten, Bild ueberall weg
        await A.evaluate("dbGetRecipe('r_t1').then(r => recipeTrashOnDelete(r))")
        await A.evaluate("cloudSyncNow()"); await B.evaluate("cloudSyncNow()")
        await A.evaluate("recipeTrashFinalDelete('r_t1')")
        await A.evaluate("cloudSyncNow()")
        row = server(uid, 'r_t1') or {}
        check('Endgueltig: Grabstein ohne Daten, Bild in der Cloud geloescht', row.get('deleted') and row.get('data') is None and f'{uid}/img_t1' not in M.OBJECTS, str(row.get('data')))
        await B.evaluate("cloudSyncNow()")
        st = await B.evaluate("Promise.all([dbGetRecipe('r_t1'), dbGetRecipeTrash('r_t1'), dbGetImage('img_t1')]).then(([r, t, i]) => [!!r, !!t, !!i])")
        check('B: endgueltig weg (Rezept, Papierkorb, Bild)', st == [False, False, False], str(st))

        # 6. Alter Grabstein (aeltere App-Version, ohne Daten) loescht weiter endgueltig
        await A.evaluate("dbPut({ id: 'r_alt', title: 'Alt', ingredients: [], steps: [], createdAt: 1, updatedAt: Date.now() })")
        await A.evaluate("cloudSyncNow()"); await B.evaluate("cloudSyncNow()")
        old = M.RECORDS[(uid, 'recipe', 'r_alt')]
        M.RECORDS[(uid, 'recipe', 'r_alt')] = dict(old, data=None, deleted=True, client_updated_at=old['client_updated_at'] + 1000, server_updated_at=M.now_ts())
        await B.evaluate("cloudSyncNow()")
        st = await B.evaluate("Promise.all([dbGetRecipe('r_alt'), dbGetRecipeTrash('r_alt')]).then(([r, t]) => [!!r, !!t])")
        check('Alter Grabstein ohne Daten: auf B endgueltig geloescht', st == [False, False], str(st))

        # 7. Hier geloescht, anderswo geaendert (Konflikt): geaenderter Stand landet im Papierkorb, nichts geht verloren
        await A.evaluate("dbPut({ id: 'r_d1', title: 'Rösti', ingredients: [], steps: [], createdAt: 1, updatedAt: Date.now() })")
        await A.evaluate("cloudSyncNow()"); await B.evaluate("cloudSyncNow()")
        await edit(A, 'r_d1', {'title': 'Rösti mit Speck'})
        await A.evaluate("cloudSyncNow()")
        await B.evaluate("dbGetRecipe('r_d1').then(r => recipeTrashOnDelete(r))")
        await B.evaluate("cloudPull(cloudSyncCtx())")
        t = await B.evaluate("dbGetRecipeTrash('r_d1').then(t => t && t.recipe.title)")
        check('Geloescht vs. geaendert: Papierkorb haelt den geaenderten Stand', t == 'Rösti mit Speck', str(t))

        check('Keine Seitenfehler', not errA and not errB and not errC, str((errA + errB + errC)[:3]))
        await browser.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
    if FAIL: sys.exit(1)

asyncio.run(main())
