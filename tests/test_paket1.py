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

        # Startseite (Paket 37): kein "Zuletzt bearbeitet" mehr, Rezepte ohne Foto sind typografische Karten (kein Buchstabe, keine Bildflaeche)
        await show(page, "() => { state.view='home'; render(); }", '.home-main')
        check('Startseite mit 3 Rezepten: kein doppeltes "Zuletzt bearbeitet"', await page.evaluate("document.querySelectorAll('.recent-card').length") == 0)
        await page.evaluate("""async () => { const r = emptyRecipe(); r.id = 'r_p1_four'; r.title = 'Vierter Test'; r.ingredients=[{amount:'1',unit:'',name:'Ei'}]; r.steps=[{text:'Kochen.'}]; await dbPut(r); await loadRecipes(); state.view='home'; render(); }""")
        await page.wait_for_timeout(400)
        # Handy (390): neue Liste. Die Raster-Karten gibt es weiterhin auf dem Tablet (820), dort gelten die bisherigen Erwartungen unveraendert.
        check('Handy: Startseite mit 4 Rezepten: Rezepte sofort als Liste, kein "Zuletzt bearbeitet"', await page.evaluate("document.querySelectorAll('.recent-card').length") == 0 and await page.evaluate("document.querySelectorAll('.rrow--phone').length") == 4 and await page.evaluate("document.querySelectorAll('.rcard').length") == 0)
        ph = await page.evaluate("Array.from(document.querySelectorAll('.rrow--phone')).filter(e => e.querySelector('.rrow-ph')).map(e => (e.querySelector('.ph-letter') ? 'buchstabe' : 'ok') + ':' + e.querySelector('.rrow-title').textContent.trim())")
        check('Handy: Rezepte ohne Foto: ruhiger Platzhalter ohne Buchstaben (neu, bewusst)', len(ph) >= 2 and all(t.startswith('ok:') for t in ph) and any(t.endswith(':Gemüse-Curry') for t in ph), str(ph))
        await page.set_viewport_size({'width': 820, 'height': 1180}); await page.wait_for_timeout(600)
        check('Tablet: Startseite mit 4 Rezepten: Rezepte sofort, kein "Zuletzt bearbeitet"', await page.evaluate("document.querySelectorAll('.recent-card').length") == 0 and await page.evaluate("document.querySelectorAll('.rcard').length") == 4)

        # Rezepte ohne Foto: typografische Karte statt Buchstaben-Platzhalter (Tablet)
        txt = await page.evaluate("Array.from(document.querySelectorAll('.rcard--text')).map(e => (e.querySelector('.rcard-img, .placeholder, .ph-letter') ? 'bild' : 'ok') + ':' + e.querySelector('.rcard-title').textContent.trim())")
        check('Rezepte ohne Foto: typografische Karte ohne Bildflaeche und Buchstaben', len(txt) >= 2 and all(t.startswith('ok:') for t in txt) and any(t.endswith(':Gemüse-Curry') for t in txt), str(txt))
        # Dunkelmodus: Titel in der typografischen Karte lesbar (heller als die Flaeche), Tablet
        await page.evaluate("() => { document.documentElement.setAttribute('data-theme','dark'); state.view='home'; render(); }"); await page.wait_for_timeout(400)
        lum = await page.evaluate("""() => { const e = document.querySelector('.rcard--text .rcard-title'); const c = getComputedStyle(e).color.match(/\\d+/g).map(Number); return c[0]*0.3 + c[1]*0.59 + c[2]*0.11 }""")
        check('Dunkelmodus: Titel der typografischen Karte hell genug', lum > 150, f'{lum:.0f}')
        await page.evaluate("() => { document.documentElement.setAttribute('data-theme','light'); render(); }")
        await page.set_viewport_size({'width': 390, 'height': 844}); await page.wait_for_timeout(500)

        # Tippflaechen
        for name, js in [('Startseite', "state.view='home'"), ('Wochenplan', "state.view='mealplan'"), ('Einkauf', "state.view='shopping'"), ('Rezeptseite', "state.activeRecipeId='r_legacy_1'; state.view='detail'")]:
            await page.evaluate("() => {" + js + "; render(); }"); await page.wait_for_timeout(500)
            bad = await page.evaluate(TAP)
            check(f'Tippflaechen mind. 44 px: {name}', not bad, str(bad[:4]))
        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await browser.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
