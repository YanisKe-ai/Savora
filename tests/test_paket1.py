"""Paket 1: kompakte Rezeptseite, Startseite ohne Doppelung, Platzhalter mit Buchstabe, Tippflaechen, toter Code."""
import asyncio, sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

TAP = """() => { const bad = [];
  document.querySelectorAll('button, a[href], [role=button], select, [data-action]').forEach(e => {
    const r = e.getBoundingClientRect(); if (!r.width || !r.height) return;
    if (r.width < 43.5 || r.height < 43.5) bad.push((e.getAttribute('data-action') || e.tagName) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); });
  document.querySelectorAll('input[type=checkbox]').forEach(i => { const l = i.closest('label'); const r = (l || i).getBoundingClientRect();
    if (r.height && r.height < 43.5) bad.push('checkbox ' + Math.round(r.width) + 'x' + Math.round(r.height)); });
  return bad; }"""

async def main():
    check('import.js ist entfernt (toter Code)', not _os.path.exists(_os.path.join(ROOT, 'import.js')))
    async with async_playwright() as p:
        browser, ctx = await open_ctx(p, 390, 844)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(500)

        # Rezeptseite
        await show(page, "() => { state.activeRecipeId='r_legacy_1'; state.view='detail'; render(); }", '.detail-main')
        await page.wait_for_timeout(600)
        m = await page.evaluate("""() => { const r = s => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null };
          const t = document.querySelector('.topbar-title'); const tb = t.getBoundingClientRect();
          return { hero: r('.hero-img').height, ing: r('.ing-check').top, ingBottom: r('.ing-check').bottom, bar: r('.cook-start-inline'), nav: r('.bottom-nav').top,
                   titleW: tb.width, text: document.body.innerText } }""")
        check('Foto hoechstens 30 % der Bildschirmhoehe', m['hero'] <= 844 * 0.30 + 1, f"{m['hero']:.0f}px")
        check('Erste Zutat ohne Scrollen sichtbar', m['ing'] > 0 and m['ingBottom'] < m['nav'], f"Zutat {m['ing']:.0f}..{m['ingBottom']:.0f}, Navigation ab {m['nav']:.0f}")
        check('Kochmodus-Knopf steht im Kopfbereich und schwebt nicht über dem Text', m['bar']['bottom'] <= m['ing'], f"Knopf bis {m['bar']['bottom']:.0f}, erste Zutat ab {m['ing']:.0f}")
        check('Titel nur einmal sichtbar (Kopfzeile ausgeblendet)', m['titleW'] <= 2)
        check('Keine Zeile "Aus deinem eigenen Kochbuch"', 'Aus deinem eigenen Kochbuch' not in m['text'])
        await page.evaluate("document.querySelector('.cook-start-inline').click()")
        await page.wait_for_selector('.cook-v2', timeout=5000)
        check('Kochmodus startet ueber den Knopf', True)
        await page.evaluate("() => { state.view='detail'; state.activeRecipeId='r_legacy_1'; render(); }")

        # Startseite: erst ab 4 Rezepten "Zuletzt bearbeitet"
        await show(page, "() => { state.view='home'; render(); }", '.home-main')
        n_recent = await page.evaluate("document.querySelectorAll('.recent-card').length")
        check('Startseite mit 3 Rezepten: kein doppeltes "Zuletzt bearbeitet"', n_recent == 0)
        await page.evaluate("""async () => { const r = emptyRecipe(); r.id = 'r_p1_four'; r.title = 'Vierter Test'; r.ingredients=[{amount:'1',unit:'',name:'Ei'}]; r.steps=[{text:'Kochen.'}]; await dbPut(r); await loadRecipes(); state.view='home'; render(); }""")
        await page.wait_for_timeout(400)
        check('Startseite mit 4 Rezepten: "Zuletzt bearbeitet" erscheint', await page.evaluate("document.querySelectorAll('.recent-card').length") == 1)

        # Platzhalter
        cls1 = await page.evaluate("Array.from(document.querySelectorAll('.rcard-img.placeholder')).map(e => e.className.match(/ph-\\d/)[0] + ':' + e.textContent.trim())")
        await page.evaluate("() => { state.view='detail'; render(); state.view='home'; render(); }"); await page.wait_for_timeout(300)
        cls2 = await page.evaluate("Array.from(document.querySelectorAll('.rcard-img.placeholder')).map(e => e.className.match(/ph-\\d/)[0] + ':' + e.textContent.trim())")
        check('Rezepte ohne Foto: Anfangsbuchstabe mit stabiler Farbe', len(cls1) >= 2 and cls1 == cls2 and any(c.endswith(':V') for c in cls1) and any(c.endswith(':G') for c in cls1), str(cls1))

        # Tippflaechen
        for name, js in [('Startseite', "state.view='home'"), ('Wochenplan', "state.view='mealplan'"), ('Einkauf', "state.view='shopping'"), ('Rezeptseite', "state.activeRecipeId='r_legacy_1'; state.view='detail'")]:
            await page.evaluate("() => {" + js + "; render(); }"); await page.wait_for_timeout(500)
            bad = await page.evaluate(TAP)
            check(f'Tippflaechen mind. 44 px: {name}', not bad, str(bad[:4]))
        # Dunkelmodus: Platzhalter lesbar (Buchstabe heller als Hintergrund)
        await page.evaluate("() => { document.documentElement.setAttribute('data-theme','dark'); state.view='home'; render(); }"); await page.wait_for_timeout(400)
        lum = await page.evaluate("""() => { const e = document.querySelector('.rcard-img.placeholder'); const cs = getComputedStyle(e); const c = cs.color.match(/\\d+/g).map(Number); return c[0]*0.3 + c[1]*0.59 + c[2]*0.11 }""")
        check('Dunkelmodus: Platzhalter-Buchstabe hell genug', lum > 150, f'{lum:.0f}')
        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await browser.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
