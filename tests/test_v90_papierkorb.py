"""v0.90 «Zuletzt gelöscht» (trash.js, Oberflaeche): Loeschen ueber die Oberflaeche, Rueckgaengig-Fenster laeuft ab ->
Rezept im Papierkorb, Foto bleibt; Eintrag unter Mehr mit Anzahl; Ansicht mit «noch X Tage»; Wiederherstellen (Rezept und Foto da);
Endgueltig loeschen mit Bestaetigung (Rezept, Eintrag und Foto weg); Aufraeumen nach 31 Tagen (Uhr +31 Tage), ein 29 Tage alter
Eintrag bleibt; Foto bleibt, solange ein anderes Rezept es nutzt; leerer Zustand. Zwei Geraete ueber den Nachbau-Server
(Grabstein mit Papierkorb-Daten, alter Grabstein ohne Daten) deckt test_v90_konflikt ab."""
import asyncio, sys, os
os.environ.setdefault('SAVORA_TEST_PORT', '49022')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

def recipe(rid, title, img=None):
    r = {'id': rid, 'title': title, 'servings': 2, 'timeMinutes': 20, 'tags': [], 'diet': [], 'categoryTags': [],
         'ingredients': [{'amount': '200', 'unit': 'g', 'name': 'Mehl'}], 'steps': [{'text': 'Backen.'}], 'createdAt': 1000, 'updatedAt': 2000}
    if img: r['imageId'] = img
    return r

SEED = """async (list) => {
  const blob = new Blob([new Uint8Array([1,2,3,4])], { type: 'image/jpeg' });
  for (const id of ['img_a', 'img_b', 'img_c']) await dbPutImage({ id, blob, thumbBlob: blob, mime: 'image/jpeg' });
  for (const r of list) await dbPut(r);
  state.recipes = (await dbGetAll()).sort((a, b) => b.updatedAt - a.updatedAt);
  render();
}"""
STATE = "([id, img]) => Promise.all([dbGetRecipe(id), dbGetRecipeTrash(id), dbGetImage(img)]).then(([r, t, i]) => [!!r, !!t, !!i])"

async def main():
    async with async_playwright() as p:
        browser, ctx = await open_ctx(p)
        page = await ctx.new_page()
        errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page)
        await page.evaluate("() => { window.__purge = window.trashPurge; window.trashPurge = () => Promise.resolve(0); }")   # der Start-Aufraeumlauf stoert die Handarbeit nicht
        await page.evaluate(SEED, [recipe('r_a', 'Wähe', 'img_a'), recipe('r_b', 'Zopf', 'img_b'), recipe('r_c', 'Brot', 'img_c')])

        # 1. Leerer Zustand
        await page.evaluate("() => { state.view = 'trash'; render(); }")
        await page.wait_for_selector('.trash-empty', timeout=8000)
        check('Leerer Zustand sichtbar', 'Nichts gelöscht' in await page.inner_text('.trash-main'))

        # 2. Loeschen ueber die Oberflaeche: Rueckgaengig-Fenster laeuft ab
        await page.evaluate("() => { state.activeRecipeId = 'r_a'; state.view = 'detail'; state.modal = { type: 'delete', recipeId: 'r_a' }; render(); }")
        await page.wait_for_selector('[data-action="delete-recipe"]')
        txt = await page.inner_text('.modal-sheet')
        check('Loeschdialog verweist auf «Zuletzt gelöscht»', 'Zuletzt gelöscht' in txt, txt[:120])
        await page.click('[data-action="delete-recipe"]')
        await page.wait_for_selector('.toast-undo', timeout=5000)
        st = await page.evaluate(STATE, ['r_a', 'img_a'])
        check('Im Rueckgaengig-Fenster: Rezept noch in der Datenbank', st[0] and not st[1], str(st))
        for _ in range(60):
            if await page.evaluate("dbGetRecipeTrash('r_a').then(t => !!t)"): break
            await page.wait_for_timeout(200)
        st = await page.evaluate(STATE, ['r_a', 'img_a'])
        check('Nach Ablauf: Rezept weg, im Papierkorb, Foto noch da', st == [False, True, True], str(st))
        check('Rezept nicht mehr in der Liste', await page.evaluate("!state.recipes.some(r => r.id === 'r_a')"))

        # 3. Mehr: Zeile mit Anzahl, Ansicht mit «noch X Tage»
        await page.evaluate("async () => { await trashLoad(); state.view = 'more'; render(); }")
        await page.wait_for_selector('[data-view="trash"]')
        row = await page.inner_text('[data-view="trash"]')
        check('Mehr zeigt «Zuletzt gelöscht» mit Anzahl', 'Zuletzt gelöscht' in row and '1 Rezept' in row, row.replace('\n', ' | '))
        await page.click('[data-view="trash"]')
        await page.wait_for_selector('.trash-item')
        item = await page.inner_text('.trash-item')
        check('Eintrag zeigt Titel und «noch 30 Tage»', 'Wähe' in item and 'noch 30 Tage' in item, item.replace('\n', ' | '))
        check('Beide Knoepfe da', await page.locator('.trash-restore').count() == 1 and await page.locator('.trash-forever').count() == 1)
        sizes = await page.evaluate("() => [...document.querySelectorAll('.trash-restore, .trash-forever')].map(b => Math.round(b.getBoundingClientRect().height))")
        check('Knoepfe mindestens 44 px hoch', all(h >= 44 for h in sizes), str(sizes))
        await page.screenshot(path=os.path.join(OUT, 'h2-trash-390.png'))

        # 4. Wiederherstellen
        await page.click('.trash-restore')
        await page.wait_for_selector('.trash-empty', timeout=8000)
        st = await page.evaluate(STATE, ['r_a', 'img_a'])
        check('Wiederhergestellt: Rezept da, Papierkorb leer, Foto da', st == [True, False, True], str(st))
        check('Rezept wieder in der Liste', await page.evaluate("state.recipes.some(r => r.id === 'r_a')"))
        check('Neues updatedAt (Abgleich sieht es als neuer)', await page.evaluate("dbGetRecipe('r_a').then(r => r.updatedAt > 2000)"))

        # 5. Endgueltig loeschen mit Bestaetigung
        await page.evaluate("async () => { await recipeTrashOnDelete(await dbGetRecipe('r_b')); state.recipes = state.recipes.filter(r => r.id !== 'r_b'); await trashLoad(); render(); }")
        await page.wait_for_selector('.trash-forever')
        await page.click('.trash-forever')
        await page.wait_for_selector('.trash-confirm-btn')
        check('Bestaetigung nennt den Titel', 'Zopf' in await page.inner_text('.modal-sheet'))
        await page.screenshot(path=os.path.join(OUT, 'h2-trash-confirm-390.png'))
        await page.click('.modal-sheet [data-action="close-modal"]')
        await page.wait_for_selector('.trash-confirm-btn', state='detached')
        st = await page.evaluate(STATE, ['r_b', 'img_b'])
        check('Abbrechen loescht nichts', st == [False, True, True], str(st))
        await page.click('.trash-forever')
        await page.wait_for_selector('.trash-confirm-btn')
        await page.click('.trash-confirm-btn')
        await page.wait_for_selector('.trash-empty', timeout=8000)
        st = await page.evaluate(STATE, ['r_b', 'img_b'])
        check('Endgueltig: Rezept, Eintrag und Foto weg', st == [False, False, False], str(st))

        # 6. Aufraeumen: 31 Tage alt weg, 29 Tage alt bleibt; Foto bleibt, wenn ein anderes Rezept es nutzt
        await page.evaluate("""async () => {
          const day = 86400000, now = Date.now();
          const a = await dbGetRecipe('r_a'), c = await dbGetRecipe('r_c');
          const shared = Object.assign(JSON.parse(JSON.stringify(c)), { id: 'r_old2', title: 'Alt mit geteiltem Foto' });
          await dbPutRecipeTrash({ id: 'r_old', recipe: Object.assign(JSON.parse(JSON.stringify(a)), { id: 'r_old', title: 'Alt' }), deletedAt: now - 31 * day, imageId: null });
          await dbPutRecipeTrash({ id: 'r_old2', recipe: shared, deletedAt: now - 31 * day, imageId: 'img_c' });
          await dbPutRecipeTrash({ id: 'r_new', recipe: Object.assign(JSON.parse(JSON.stringify(a)), { id: 'r_new', title: 'Neu' }), deletedAt: now - 29 * day, imageId: null });
          await trashLoad();
        }""")
        n = await page.evaluate("__purge()")
        left = await page.evaluate("dbGetAllRecipeTrash().then(l => l.map(t => t.id).sort())")
        check('trashPurge: nur der 29 Tage alte Eintrag bleibt', n == 2 and left == ['r_new'], f'{n} {left}')
        check('Foto bleibt, weil Rezept «Brot» es noch nutzt', await page.evaluate("dbGetImage('img_c').then(i => !!i)"))
        await page.evaluate("() => { state.view = 'trash'; render(); }")
        await page.wait_for_selector('.trash-item')
        check('29 Tage alter Eintrag: «noch 1 Tag»', 'noch 1 Tag' in await page.inner_text('.trash-item'))
        # Uhr +31 Tage: alles weg
        n = await page.evaluate("__purge(Date.now() + 31 * 86400000)")
        left = await page.evaluate("dbGetAllRecipeTrash().then(l => l.length)")
        check('Uhr +31 Tage: Papierkorb leer', n == 1 and left == 0, f'{n} {left}')

        # 7. Optik: dunkel und schmal
        await page.evaluate("async () => { await recipeTrashOnDelete(await dbGetRecipe('r_c')); state.recipes = state.recipes.filter(r => r.id !== 'r_c'); await trashLoad(); }")
        for w, h, scheme in ((375, 667, 'light'), (390, 844, 'dark')):
            await page.set_viewport_size({'width': w, 'height': h})
            await page.evaluate(f"() => {{ document.documentElement.setAttribute('data-theme', '{scheme}'); state.view = 'trash'; render(); }}")
            await page.wait_for_selector('.trash-item')
            await page.wait_for_timeout(200)
            ov = await overflow_info(page)
            check(f'{w}px {scheme}: kein Ueberlauf', not ov, str(ov)[:100])
            await page.screenshot(path=os.path.join(OUT, f'h2-trash-{w}-{scheme}.png'))
        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await browser.close()
    print('\n%d Fehler' % len(FAIL) if FAIL else '\nAlles gruen')
    sys.exit(1 if FAIL else 0)
asyncio.run(main())
