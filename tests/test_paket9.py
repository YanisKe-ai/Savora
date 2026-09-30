"""Paket 9: tolerante Suche (Umlaute, mehrere Woerter) und Sortierung."""
import asyncio, sys, time
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

CASES = [
    ('curry', ['Gemüse-Curry']), ('gemuse', ['Gemüse-Curry']), ('GEMÜSE', ['Gemüse-Curry']), ('gemuese', ['Gemüse-Curry']),
    ('gemüse curry', ['Gemüse-Curry']), ('milch lauwarm', ['Sloppy Joe Buns']), ('curry zwiebel', ['Gemüse-Curry']),
    ('zwiebel', ['Sloppy Joe Buns', 'Carbonara', 'Gemüse-Curry']), ('  Carbonara  ', ['Carbonara']), ('backen', ['Sloppy Joe Buns']),
    ('xyz', []), ('curry xyz', []), ('', ['Sloppy Joe Buns', 'Carbonara', 'Gemüse-Curry']),
]
async def main():
    async with async_playwright() as p:
        browser, ctx = await open_ctx(p, 390, 844)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(400)
        for q, exp in CASES:
            got = await page.evaluate("(q) => { state.query = q; state.sortBy = 'updated'; return applyAllFilters(state.recipes).map(r => r.title) }", q)
            check(f'Suche "{q}"', sorted(got) == sorted(exp), str(got))
        check('Umlaute und Sonderzeichen', await page.evaluate("[searchNorm('Käse & Öl'), searchNorm('Straße'), searchNorm('Crème brûlée')]") == ['kase ol', 'strasse', 'creme brulee'])

        # Sortierung
        await page.evaluate("""async () => { state.query = '';
          const set = async (id, patch) => { const r = state.recipes.find(x => x.id === id); Object.assign(r, patch); await dbPut(r); };
          await set('r_legacy_1', { timeMinutes: 45, lastCookedAt: 1000, title: 'Sloppy Joe Buns' });
          await set('r_legacy_2', { timeMinutes: 10, lastCookedAt: 5000, title: 'Carbonara' });
          await set('r_legacy_3', { timeMinutes: 0, lastCookedAt: 0, title: 'Gemüse-Curry' });
          await loadRecipes(); }""")
        async def order(by):
            return await page.evaluate("(by) => { state.sortBy = by; return applyAllFilters(state.recipes).map(r => r.title) }", by)
        check('A bis Z', await order('az') == ['Carbonara', 'Gemüse-Curry', 'Sloppy Joe Buns'])
        check('Zuletzt gekocht: jüngstes zuerst, nie gekocht zuletzt', await order('cooked') == ['Carbonara', 'Sloppy Joe Buns', 'Gemüse-Curry'])
        check('Kürzeste Zeit: ohne Zeitangabe zuletzt', await order('time') == ['Carbonara', 'Sloppy Joe Buns', 'Gemüse-Curry'])
        # Oberflaeche
        await page.evaluate("() => { state.sortBy = 'updated'; state.view = 'home'; state.modal = { type: 'filter-sheet' }; render(); }"); await page.wait_for_timeout(300)
        await page.evaluate("document.querySelector('[data-action=\"set-sort\"][data-id=\"az\"]').click()"); await page.wait_for_timeout(300)
        check('Sortierwahl bleibt gespeichert und markiert', await page.evaluate("localStorage.getItem('savora-sort')") == 'az' and await page.evaluate("document.querySelector('.sort-chip.is-active').textContent") == 'A bis Z')
        await page.evaluate("() => { state.modal = null; render(); }"); await page.wait_for_timeout(300)
        titles = await page.evaluate("Array.from(document.querySelectorAll('.rcard-title')).map(e => e.textContent)")
        check('Startseite folgt der Sortierung und nennt sie', titles == ['Carbonara', 'Gemüse-Curry', 'Sloppy Joe Buns'] and 'A bis Z' in await page.evaluate("document.getElementById('all-h').textContent"), str(titles))
        await page.evaluate("() => { state.sortBy = 'updated'; localStorage.removeItem('savora-sort'); }")

        # Geschwindigkeit mit 500 Rezepten
        await page.evaluate("""async () => { for (let i = 0; i < 500; i++) { const r = emptyRecipe(); r.id = 'r_bulk_' + i; r.title = 'Testrezept ' + i; r.tags = ['t' + (i % 20)];
          r.ingredients = Array.from({ length: 12 }, (_, k) => ({ amount: String(k + 1), unit: 'g', name: 'Zutat ' + k + ' Käse' })); r.steps = [{ text: 'Kochen.' }]; await dbPut(r); } await loadRecipes(); }""")
        ms = await page.evaluate("(() => { const s = performance.now(); state.query = 'kase 7'; const n = applyAllFilters(state.recipes).length; const first = performance.now() - s; const s2 = performance.now(); state.query = 'kase 8'; applyAllFilters(state.recipes); return [first, performance.now() - s2, n] })()")
        check('500 Rezepte: erste Suche unter 250 ms, weitere unter 60 ms', ms[0] < 250 and ms[1] < 60 and ms[2] >= 500, f'{ms[0]:.0f} ms / {ms[1]:.0f} ms / {ms[2]} Treffer')
        await page.evaluate("() => { state.query = ''; }")
        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await browser.close()

        # Filterdialog bei 320 px ohne Ueberlauf
        b2, c2 = await open_ctx(p, 320, 640)
        pg = await c2.new_page(); await goto(pg); await pg.evaluate(open(SEED_PATH).read()); await pg.wait_for_timeout(300)
        await pg.evaluate("() => { state.view = 'home'; state.modal = { type: 'filter-sheet' }; render(); }"); await pg.wait_for_timeout(300)
        ov = await pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        btn = await pg.evaluate("(() => { const b = document.querySelector('.filter-sheet .form-actions .primary-btn').getBoundingClientRect(); const s = document.querySelector('.filter-sheet').getBoundingClientRect(); return b.right <= s.right + 0.5 })()")
        check('Filterdialog 320 px: kein Überlauf, Knopf im Dialog', ov <= 0 and btn, f'{ov}')
        await b2.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
