"""Hell, Dunkel, Schwarz und System: Farbe der Browserleiste, Systemelemente, Wechsel im Betrieb."""
import asyncio, sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={'width': 390, 'height': 844}, color_scheme='dark', reduced_motion='reduce', timezone_id='UTC')
        await ctx.add_init_script(NO_SW + " try{localStorage.setItem('savora-splash-seen','1')}catch(e){}")
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page)
        n = await page.evaluate("document.querySelectorAll('meta[name=theme-color]').length")
        check('Genau eine theme-color-Angabe', n == 1, str(n))
        async def snap(theme):
            await page.evaluate(f"() => {{ state.theme = '{theme}'; applyTheme(); }}")
            return await page.evaluate("({t: document.documentElement.getAttribute('data-theme'), m: document.querySelector('meta[name=theme-color]').content, cs: getComputedStyle(document.documentElement).colorScheme})")
        for theme, exp in [('light', ('light', '#FAFAF8', 'light')), ('dark', ('dark', '#121214', 'dark')), ('amoled', ('amoled', '#000000', 'dark'))]:
            s = await snap(theme)
            check(f'{theme}: Modus, Browserleiste und Systemelemente passen', (s['t'], s['m'], s['cs']) == exp, str(s))
        s = await snap('auto')
        check('System (Telefon dunkel): App wird dunkel', s['t'] == 'dark' and s['m'] == '#121214', str(s))
        await page.emulate_media(color_scheme='light'); await page.wait_for_timeout(200)
        s = await page.evaluate("({t: document.documentElement.getAttribute('data-theme'), m: document.querySelector('meta[name=theme-color]').content})")
        check('System: Wechsel des Telefons auf hell wirkt sofort', s['t'] == 'light' and s['m'] == '#FAFAF8', str(s))
        # gewaehlter Modus bleibt, auch wenn das System wechselt
        await snap('dark'); await page.emulate_media(color_scheme='light'); await page.wait_for_timeout(150)
        check('Manuelle Wahl "Dunkel" bleibt trotz hellem System', await page.evaluate("document.documentElement.getAttribute('data-theme')") == 'dark')
        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await browser.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
