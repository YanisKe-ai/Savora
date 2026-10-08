"""Paket 31: Titel ist Pflicht beim Speichern (Fehler am Feld, nichts wird gespeichert), Mehrfachklick speichert genau einmal, Leerzustände mit Handlungshinweis."""
import asyncio, sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, timezone_id='UTC')
        await ctx.add_init_script("try { localStorage.setItem('savora-splash-seen', '1') } catch (e) {}")
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.wait_for_timeout(500); ev = page.evaluate
        # Leerzustaende (frische Datenbank)
        for view, needle in (('home', 'Erstes Rezept eintragen'), ('mealplan', 'Erstes Rezept eintragen'), ('shopping', 'Deine Einkaufsliste ist leer')):
            await ev("(v) => { state.view = v; render(); }", view); await page.wait_for_timeout(250)
            txt = await ev("() => document.querySelector('main').innerText")
            check(f'Leerzustand {view} nennt den nächsten Schritt', needle in txt, txt[:80].replace('\n', ' '))
        await ev("() => { state.view = 'home'; render(); }"); await page.wait_for_timeout(200)
        await ev("() => document.querySelector('.empty-state [data-action], .empty [data-action]').click()"); await page.wait_for_timeout(300)
        n0 = await ev("() => state.recipes.length")
        await page.click('[data-action="save-recipe"]'); await page.wait_for_timeout(400)
        check('Ohne Titel: nichts wird gespeichert', await ev("() => state.recipes.length") == n0 and await ev("() => state.view") == 'form')
        check('Ohne Titel: Fehlertext am Feld (role=alert)', await ev("() => (document.querySelector('#f-title-err') || {}).textContent") == 'Gib dem Rezept einen Titel.')
        check('Ohne Titel: Feld ist als ungültig markiert', await ev("() => document.getElementById('f-title').getAttribute('aria-invalid')") == 'true')
        check('Ohne Titel: Fokus liegt im Titelfeld', await ev("() => document.activeElement && document.activeElement.id") == 'f-title')
        await page.fill('#f-title', 'Testgericht')
        check('Tippen entfernt den Fehler', await ev("() => !document.getElementById('f-title-err')"))
        await ev("() => { const b = document.querySelector('[data-action=\"save-recipe\"]'); b.click(); b.click(); b.click(); }"); await page.wait_for_timeout(700)
        check('Dreifachklick speichert genau einmal', await ev("() => state.recipes.filter(r => r.title === 'Testgericht').length") == 1)
        check('Danach Detailansicht', await ev("() => state.view") == 'detail')
        check('Keine Seitenfehler', not errs, str(errs[:2]))
        await b.close()
    print('\nFEHLGESCHLAGEN:', ', '.join(FAIL) if FAIL else 'keine'); sys.exit(1 if FAIL else 0)
asyncio.run(main())
