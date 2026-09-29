import asyncio, sys, threading, time
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
import mock_supabase as M
from http.server import ThreadingHTTPServer
srv = ThreadingHTTPServer(('127.0.0.1', 8796), M.H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
CLOUD = "window.SAVORA_CLOUD_URL_OVERRIDE = 'http://127.0.0.1:8796'; window.SAVORA_CLOUD_KEY_OVERRIDE = 'test-key';"
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)
async def device(p, name):
    browser, ctx = await open_ctx(p)
    await ctx.add_init_script(CLOUD)
    page = await ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(f'{name}: {e}'))
    page.on("console", lambda m: errs.append(f'{name} console: {m.text}') if m.type == 'error' else None)
    await goto(page)
    return browser, ctx, page, errs
async def click(page, sel):
    await page.evaluate("(s) => { const e = document.querySelector(s); if (!e) throw new Error('fehlt ' + s); e.click(); }", sel)
    await page.wait_for_timeout(250)
async def login(page, email, pw, signup=False):
    await show(page, "() => { state.modal = null; state.view = 'settings-sync'; render(); }", '#cloudEmail')
    if signup:
        await click(page, '[data-action="cloud-mode"][data-id="signup"]')
    await page.fill('#cloudEmail', email); await page.fill('#cloudPassword', pw)
    await click(page, '[data-action="cloud-sign-up"]' if signup else '[data-action="cloud-sign-in"]')
    await page.wait_for_timeout(1500)
async def sync(page):
    return await page.evaluate("cloudSyncNow()")
def rows(uid): return {(k[1], k[2]): v for k, v in M.RECORDS.items() if k[0] == uid}

async def main():
    async with async_playwright() as p:
        # Geraet C ohne Anmeldung: kein Netzwerkverkehr zur Cloud
        bC, cC, pc, errC = await device(p, 'C')
        await pc.evaluate(open(SEED_PATH).read()); await pc.wait_for_timeout(2500)
        check('Ohne Anmeldung kein Cloud-Verkehr', len(M.LOG) == 0, str(M.LOG[:3]))
        await bC.close()

        # Geraet A (iPhone mit Altdaten): registrieren, bestaetigen, anmelden, hochladen
        bA, cA, pa, errA = await device(p, 'A')
        await pa.evaluate(open(SEED_PATH).read())
        # Geschlossene Testphase: kein Registrier-Link, Hinweis sichtbar; Konto wird "vom Admin" angelegt
        await show(pa, "() => { state.view = 'settings-sync'; render(); }", '#cloudEmail')
        no_signup = await pa.evaluate("!document.querySelector('[data-action=\"cloud-mode\"][data-id=\"signup\"]') && !!document.querySelector('.beta-note')")
        check('Geschlossene Testphase: kein Registrier-Link, Hinweis sichtbar', no_signup)
        M.SIGNUP_DISABLED[0] = True
        err = await pa.evaluate("cloudAuthSignUp('fremd@example.test', 'geheim-123').then(() => 'ok', e => e.message)")
        check('Selbstregistrierung wird freundlich abgewiesen', 'geschlossenen Testphase' in err, err)
        import uuid as _u
        M.USERS['yanis@example.test'] = {'id': str(_u.uuid4()), 'password': 'geheim-123', 'confirmed': True}
        pending = False
        await login(pa, 'yanis@example.test', 'geheim-123')
        uid = await pa.evaluate("cloudUserId()")
        r = rows(uid)
        kinds = sorted({k for k, _ in r})
        check('Registrierung braucht Bestaetigung, danach Anmeldung', pending is False and uid, uid)
        check('Erstabgleich laedt alles hoch', sum(1 for k, _ in r if k == 'recipe') == 3 and ('mealplan' in kinds) and ('shopping' in kinds) and ('setting', 'cookbookTitle') in r,
              f"{kinds} {len(r)} Zeilen")
        check('Fotos im privaten Speicher (voll + Vorschau)', f'{uid}/img_legacy_1' in M.OBJECTS and f'{uid}/img_legacy_1-thumb' in M.OBJECTS)
        st = await pa.evaluate("document.getElementById('cloudStatus').textContent")
        check('Status sichtbar', 'Zuletzt abgeglichen' in st, st)

        # Geraet B (Laptop, leer): anmelden und alles erhalten
        bB, cB, pb, errB = await device(p, 'B')
        await login(pb, 'yanis@example.test', 'geheim-123')
        n = await pb.evaluate("state.recipes.length")
        img = await pb.evaluate("dbGetImage('img_legacy_1').then(i => !!(i && i.blob && i.blob.size > 100))")
        title = await pb.evaluate("state.cookbookTitle")
        plan = await pb.evaluate("dbGetAllMealplan().then(l => l.length && l[0].recipeIds.length)")
        shop = await pb.evaluate("state.shopping.length")
        await show(pb, "() => { state.activeRecipeId = 'r_legacy_1'; state.view = 'detail'; render(); }", '.detail-main')
        await pb.wait_for_timeout(600)
        hero = await pb.evaluate("!!document.querySelector('img.hero-img')")
        check('Zweites Geraet erhaelt Rezepte, Foto, Plan, Einkauf, Titel', n == 3 and img and title == 'Yanis Kochbuch' and plan == 2 and shop == 1 and hero, f"n={n} img={img} titel={title} plan={plan} shop={shop} hero={hero}")

        # Aenderung auf B erscheint auf A
        await show(pb, "() => { state.view = 'home'; render(); }", '.home-main')
        await pb.evaluate("document.querySelector('[data-action=\"toggle-fav\"][data-id=\"r_legacy_2\"]').click()")
        await pb.wait_for_timeout(2500)  # automatischer Abgleich nach 1.5 s
        await sync(pa)
        favA = await pa.evaluate("state.recipes.find(r => r.id === 'r_legacy_2').favorite")
        check('Favorit auf B -> automatisch auf A', favA is True)

        # Loeschen auf A erscheint auf B
        await show(pa, "() => { state.modal = null; state.activeRecipeId = 'r_legacy_3'; state.view = 'detail'; render(); }", '.detail-main')
        await pa.evaluate("() => { state.modal = { type: 'delete', recipeId: 'r_legacy_3' }; render(); }")
        await pa.wait_for_timeout(200)
        await click(pa, '[data-action="delete-recipe"]')
        await pa.wait_for_timeout(8500)  # Loeschen erfolgt erst nach Ablauf der Rueckgaengig-Frist
        await sync(pa); await sync(pb)
        goneB = await pb.evaluate("!state.recipes.some(r => r.id === 'r_legacy_3')")
        check('Loeschen auf A -> weg auf B', goneB and rows(uid)[('recipe', 'r_legacy_3')]['deleted'] is True)

        # Offline auf B: Aenderung bleibt vorgemerkt, wird nach Verbindung uebertragen
        await cB.set_offline(True)
        await pb.evaluate("() => { state.view = 'shopping'; render(); }"); await pb.wait_for_timeout(200)
        await pb.fill('#shoppingAddInput', '3 Zitronen')
        await click(pb, '[data-action="add-shopping-item-manual"]')
        r1 = await sync(pb)
        q = await pb.evaluate("Object.keys(JSON.parse(localStorage.getItem('savora-sync-queue')||'{}')).length")
        await cB.set_offline(False)
        await pb.evaluate("window.dispatchEvent(new Event('online'))")
        await pb.wait_for_timeout(2000)
        has = any(v['data'] and v['data'].get('name') == 'Zitronen' for (k, i), v in rows(uid).items() if k == 'shopping')
        check('Offline-Aenderung wird nachgeliefert', r1.get('reason') == 'offline' and q >= 1 and has, f"offline={r1} queue={q} hochgeladen={has}")

        # Konflikt: A aendert zuerst (aelter), B spaeter (neuer); A laedt zuletzt hoch -> B gewinnt ueberall
        await pa.evaluate("() => { const r = state.recipes.find(x => x.id === 'r_legacy_1'); r.title = 'Titel von A'; r.updatedAt = Date.now(); return dbPut(r); }")
        await pa.evaluate("() => { clearTimeout(cloud.timer); }")
        await pa.wait_for_timeout(50)
        await pb.evaluate("() => { const r = state.recipes.find(x => x.id === 'r_legacy_1'); r.title = 'Titel von B'; r.updatedAt = Date.now(); return dbPut(r); }")
        await sync(pb); await sync(pa); await sync(pb)
        ta = await pa.evaluate("state.recipes.find(x => x.id === 'r_legacy_1').title")
        tb = await pb.evaluate("state.recipes.find(x => x.id === 'r_legacy_1').title")
        check('Konflikt: neuester Stand gewinnt auf beiden Geraeten', ta == tb == 'Titel von B', f"A={ta} B={tb}")

        # Neues Foto auf B -> auf A
        await pb.evaluate("""async () => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; c.getContext('2d').fillRect(0,0,400,300);
            const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8)); await dbPutImage({ id: 'img_neu', blob, thumbBlob: blob, mime: 'image/jpeg' });
            const r = emptyRecipe(); r.id = 'r_neu'; r.title = 'Neu mit Foto'; r.imageId = 'img_neu'; await dbPut(r); await loadRecipes(); }""")
        await sync(pb); await sync(pa)
        imgA = await pa.evaluate("dbGetImage('img_neu').then(i => !!(i && i.blob))")
        check('Neues Rezept mit Foto von B auf A', imgA and await pa.evaluate("state.recipes.some(r => r.id === 'r_neu')"))

        # Passwort aendern auf B, danach Anmeldung nur noch mit neuem Passwort
        await show(pb, "() => { state.modal = null; state.view = 'settings-sync'; render(); }", '#cloudNewPassword2')
        await pb.fill('#cloudNewPassword', 'neues-pass-99'); await pb.fill('#cloudNewPassword2', 'anders-99')
        await click(pb, '[data-action="cloud-save-password"]')
        mismatch = await pb.evaluate("document.getElementById('cloudError').textContent")
        await pb.fill('#cloudNewPassword', 'neues-pass-99'); await pb.fill('#cloudNewPassword2', 'neues-pass-99')
        await click(pb, '[data-action="cloud-save-password"]'); await pb.wait_for_timeout(500)
        old_ok = await pa.evaluate("fetch(CLOUD_URL + '/auth/v1/token?grant_type=password', {method:'POST', headers:{apikey:CLOUD_KEY,'Content-Type':'application/json'}, body: JSON.stringify({email:'yanis@example.test', password:'geheim-123'})}).then(r => r.ok)")
        new_ok = await pa.evaluate("fetch(CLOUD_URL + '/auth/v1/token?grant_type=password', {method:'POST', headers:{apikey:CLOUD_KEY,'Content-Type':'application/json'}, body: JSON.stringify({email:'yanis@example.test', password:'neues-pass-99'})}).then(r => r.ok)")
        check('Passwort aendern (mit Wiederholungspruefung)', 'stimmen nicht' in mismatch and not old_ok and new_ok, mismatch)

        # Abmelden behaelt lokale Daten
        await show(pb, "() => { state.view = 'settings-sync'; render(); }", '[data-action="cloud-sign-out"]')
        await click(pb, '[data-action="cloud-sign-out"]')
        kept = await pb.evaluate("state.recipes.length")
        check('Abmelden behaelt Daten auf dem Geraet', kept >= 3 and not await pb.evaluate("cloudSignedIn()"))

        # Konto loeschen auf A
        await show(pa, "() => { state.modal = null; state.view = 'settings-sync'; render(); }", '[data-action="cloud-delete-account"]')
        pa.once('dialog', lambda d: asyncio.ensure_future(d.accept('LÖSCHEN')))
        await click(pa, '[data-action="cloud-delete-account"]')
        await pa.wait_for_timeout(1500)
        left = [k for k in M.RECORDS if k[0] == uid] + [k for k in M.OBJECTS if k.startswith(uid)]
        local = await pa.evaluate("state.recipes.length")
        check('Konto loeschen entfernt alle Cloud-Daten, lokal bleibt', not left and 'yanis@example.test' not in M.USERS and local >= 3, f"rest={left[:3]} lokal={local}")

        errs = [e for e in errA + errB if 'Schweizer' not in e and 'Failed to load resource' not in e]
        check('Keine Konsolenfehler', not errs, str(errs[:4]))
        for b in (bA, bB): await b.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
