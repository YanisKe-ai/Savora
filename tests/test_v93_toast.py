"""v0.93.1: Meldung mit Knopf («Rezept gespeichert» + «Zu einer Sammlung hinzufügen») war auf dem iPhone nur halb so breit
wie der Bildschirm, der Text stand Buchstabe für Buchstabe untereinander. Jetzt: Handy Text oben, Knopf darunter; ab 480 px eine Zeile."""
import asyncio, os, sys
os.environ.setdefault('SAVORA_TEST_PORT', '64300')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

SHOT = os.environ.get('SAVORA_TOAST_SHOTS')
MESS = """() => { const t = document.querySelector('.toast-action'); const r = t.getBoundingClientRect();
  const s = t.querySelector('.toast-text').getBoundingClientRect(); const b = t.querySelector('.toast-action-btn').getBoundingClientRect();
  const lh = parseFloat(getComputedStyle(t.querySelector('.toast-text')).lineHeight) || 21;
  return { W: document.documentElement.clientWidth, l: r.left, r: r.right, textH: s.height, lh, textW: s.width, btnH: b.height, btnTop: b.top, textTop: s.top }; }"""

async def main():
    async with async_playwright() as p:
        for w, h in [(320, 700), (390, 844), (430, 932), (768, 1024), (1280, 800)]:
            for scheme in ('dark', 'light'):
                b, ctx = await open_ctx(p, w, h)
                page = await ctx.new_page(); errs = []
                page.on('pageerror', lambda e: errs.append(str(e)))
                await page.emulate_media(color_scheme=scheme)
                await goto(page)
                await page.evaluate("() => showToast('Rezept gespeichert', 'success', false, { actionLabel: 'Zu einer Sammlung hinzufügen', duration: 20000, onAction: () => {} })")
                await page.wait_for_selector('.toast-action')
                m = await page.evaluate(MESS)
                tag = f'{w}px {scheme}'
                check(f'{tag}: Text in einer Zeile, nie Buchstabe für Buchstabe', m['textH'] <= m['lh'] * 1.5 and m['textW'] > 80, m)
                check(f'{tag}: Meldung ganz im Bild', m['l'] >= 0 and m['r'] <= m['W'] + 0.5, m)
                check(f'{tag}: Knopf mindestens 44 px hoch', m['btnH'] >= 44, m)
                if w < 480: check(f'{tag}: Handy: Knopf unter dem Text', m['btnTop'] >= m['textTop'] + m['textH'] - 1, m)
                else: check(f'{tag}: breit: Text und Knopf in einer Zeile', abs((m['btnTop'] + m['btnH'] / 2) - (m['textTop'] + m['textH'] / 2)) < 4, m)
                if SHOT: await page.screenshot(path=os.path.join(SHOT, f'toast_{w}_{scheme}.png'))
                check(f'{tag}: keine Seitenfehler', not errs, errs)
                await b.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
    sys.exit(1 if FAIL else 0)

asyncio.run(main())
