"""Paket 33: Interaktionen (Toast-Ausgang, Haekchen-Uebergang, Reduzierte Bewegung, Tastatur und Dialoge)."""
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
        for reduced in ('no-preference', 'reduce'):
            ctx = await b.new_context(viewport={'width': 390, 'height': 844}, reduced_motion=reduced, timezone_id='UTC')
            await ctx.add_init_script("try { localStorage.setItem('savora-splash-seen', '1') } catch (e) {}")
            page = await ctx.new_page(); errs = []
            page.on('pageerror', lambda e: errs.append(str(e)))
            await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(400); ev = page.evaluate
            tag = f'[{reduced}] '
            await ev("() => showToast('Test', 'success')"); await page.wait_for_timeout(100)
            check(tag + 'Toast erscheint', await ev("() => !!document.querySelector('.toast')"))
            an = await ev("() => getComputedStyle(document.querySelector('.toast')).animationName")
            check(tag + ('Toast-Eingang ohne Bewegung' if reduced == 'reduce' else 'Toast-Eingang animiert'), (an == 'none') == (reduced == 'reduce'), an)
            await page.wait_for_timeout(2500)
            check(tag + 'Toast bekommt Ausgangs-Klasse', await ev("() => { const t = document.querySelector('.toast'); return !t || t.classList.contains('is-leaving'); }"))
            await page.wait_for_timeout(300)
            check(tag + 'Toast ist danach entfernt', await ev("() => !document.querySelector('.toast')"))
            await ev("() => { state.view = 'shopping'; render(); }"); await page.wait_for_timeout(250)
            tr = await ev("() => { const e = document.querySelector('.check-box'); return e ? getComputedStyle(e).transitionProperty : 'keins'; }")
            check(tag + 'Haekchen wechselt per Uebergang', 'background' in tr or tr == 'all' or 'border' in tr, tr)
            await ev("() => { state.activeRecipeId = state.recipes[0].id; state.view = 'detail'; render(); }"); await page.wait_for_timeout(300)
            await ev("() => document.querySelector('[data-action=\"open-detail-menu\"]').click()"); await page.wait_for_timeout(400)
            check(tag + 'Menue ist ein Dialog (role, aria-modal)', await ev("() => { const m = document.querySelector('.modal-sheet'); return !!m && m.getAttribute('role') === 'dialog' && m.getAttribute('aria-modal') === 'true'; }"))
            await page.keyboard.press('Escape'); await page.wait_for_timeout(300)
            check(tag + 'Escape schliesst den Dialog', await ev("() => !document.querySelector('.modal-sheet')"))
            check(tag + 'Keine Seitenfehler', not errs, str(errs[:2]))
            await ctx.close()
        await b.close()
    print('\nFEHLGESCHLAGEN:', ', '.join(FAIL) if FAIL else 'keine'); sys.exit(1 if FAIL else 0)
asyncio.run(main())
