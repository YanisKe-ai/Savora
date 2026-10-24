"""v91.2: Hell/Dunkel-Schnellschalter oben rechts auf «Mehr» (nur ein Symbol)."""
import asyncio, os, sys
os.environ.setdefault('SAVORA_TEST_PORT', '8968')
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

async def main():
    async with async_playwright() as p:
        for w, h in [(390, 844), (320, 640), (1280, 800)]:
            b, ctx = await open_ctx(p, w=w, h=h)
            page = await ctx.new_page(); errs = []
            page.on('pageerror', lambda e: errs.append(str(e)))
            await goto(page)
            await page.evaluate("() => { state.theme = 'light'; applyTheme(); state.view = 'more'; render(); }")
            await page.wait_for_selector('.theme-quick-toggle')
            g = await page.evaluate("""() => { const btn = document.querySelector('.theme-quick-toggle'), h1 = document.querySelector('.page-title'); const a = btn.getBoundingClientRect(), t = h1.getBoundingClientRect();
              return { n: document.querySelectorAll('.theme-quick-toggle').length, w: a.width, h: a.height, rightGap: Math.abs(document.querySelector('.settings-group-card').getBoundingClientRect().right - a.right), sameRow: Math.abs((a.top + a.bottom) / 2 - (t.top + t.bottom) / 2) < 12, right: a.left > t.right,
                text: btn.innerText.trim(), label: btn.getAttribute('aria-label'), svg: !!btn.querySelector('svg'), W: document.documentElement.scrollWidth, iw: innerWidth }; }""")
            check(f'[{w}] ein Symbol-Knopf oben rechts neben «Mehr» (bündig mit den Karten), ohne Text, mit Beschriftung für Bildschirmleser', g['n'] == 1 and g['svg'] and not g['text'] and g['sameRow'] and g['right'] and g['rightGap'] <= 2 and g['label'] == 'Dunklen Modus einschalten', str(g))
            check(f'[{w}] Knopf mindestens 44 px, kein seitlicher Überlauf', g['w'] >= 44 and g['h'] >= 44 and g['W'] <= g['iw'], str(g))
            await page.click('.theme-quick-toggle')
            await page.wait_for_function("document.documentElement.getAttribute('data-theme') === 'dark' && document.querySelector('.theme-quick-toggle') && document.querySelector('.theme-quick-toggle').getAttribute('data-theme') === 'light'", timeout=5000)
            st = await page.evaluate("() => ({ theme: state.theme, ls: localStorage.getItem(THEME_KEY), label: document.querySelector('.theme-quick-toggle').getAttribute('aria-label'), view: state.view })")
            check(f'[{w}] Tippen: dunkel, gespeichert, Symbol wechselt auf Sonne, bleibt auf «Mehr»', st['theme'] == 'dark' and st['ls'] == 'dark' and st['label'] == 'Hellen Modus einschalten' and st['view'] == 'more', str(st))
            await page.wait_for_function("!document.documentElement.classList.contains('theme-transitioning')", timeout=5000)
            await page.click('.theme-quick-toggle')
            await page.wait_for_function("document.documentElement.getAttribute('data-theme') === 'light'", timeout=5000)
            check(f'[{w}] nochmals Tippen: wieder hell', await page.evaluate("state.theme") == 'light')
            await page.evaluate("() => { state.theme = 'auto'; applyTheme(); render(); }")
            eff = await page.evaluate("() => ({ eff: document.documentElement.getAttribute('data-theme'), next: document.querySelector('.theme-quick-toggle').getAttribute('data-theme') })")
            check(f'[{w}] «Wie System»: Knopf schaltet in den jeweils anderen Modus', eff['next'] != eff['eff'], str(eff))
            check(f'[{w}] keine Seitenfehler', not errs, str(errs[:2]))
            if w == 390:
                await page.evaluate("() => { state.theme = 'light'; applyTheme(); render(); }"); await page.screenshot(path=os.path.join(OUT, 'mehr-hell-390.png'))
                await page.evaluate("() => { state.theme = 'dark'; applyTheme(); render(); }"); await page.screenshot(path=os.path.join(OUT, 'mehr-dunkel-390.png'))
            await b.close()
    print('\nFEHLGESCHLAGEN:', ', '.join(FAIL) if FAIL else 'keine'); sys.exit(1 if FAIL else 0)
asyncio.run(main())
