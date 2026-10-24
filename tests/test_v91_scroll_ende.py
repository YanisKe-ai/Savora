"""v91.14: Auf allen Seiten unter «Mehr» lässt sich bis ganz nach unten scrollen; nichts bleibt hinter der unteren Leiste
(Handy 390 und 320 px, abgemeldet und angemeldet). Fehler vorher: Mein Konto, Sicherung, Geräteabgleich, Ohne Internet."""
import asyncio, os, sys
os.environ.setdefault('SAVORA_TEST_PORT', '8969')
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

VIEWS = ['more', 'settings', 'settings-account', 'settings-backup', 'settings-sync', 'settings-display', 'settings-cooking', 'settings-offline',
         'settings-help', 'settings-about', 'settings-privacy', 'settings-terms', 'settings-sources', 'friends', 'lib-mine', 'lib-pubprofile', 'trash', 'pantry', 'unitconverter']
JS = """async (v) => { state.view = v; render(); await new Promise(r => setTimeout(r, 250)); window.scrollTo(0, document.documentElement.scrollHeight); await new Promise(r => setTimeout(r, 150));
  const nav = document.querySelector('.bottom-nav'); const navTop = nav && getComputedStyle(nav).display !== 'none' ? nav.getBoundingClientRect().top : innerHeight;
  const main = document.querySelector('main'); if (!main) return { v, ok: false, err: 'kein main' };
  const shown = e => { for (let x = e.parentElement; x && x !== main; x = x.parentElement) if (x.tagName === 'DETAILS' && !x.open && !(e.closest('summary'))) return false; return true; };
  const els = Array.from(main.querySelectorAll('*')).filter(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.height > 0 && r.width > 0 && cs.visibility !== 'hidden' && cs.position !== 'fixed' && cs.position !== 'sticky' && shown(e); });
  const last = Math.max(...els.map(e => e.getBoundingClientRect().bottom));
  return { v, last: Math.round(last), navTop: Math.round(navTop), ok: last <= navTop + 0.5 }; }"""

async def main():
    async with async_playwright() as p:
        for w, h in [(390, 844), (320, 640)]:
            b, ctx = await open_ctx(p, w=w, h=h)
            page = await ctx.new_page(); errs = []
            page.on('pageerror', lambda e: errs.append(str(e)))
            await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(300)
            for signed in (False, True):
                if signed: await page.evaluate("() => { window.cloudSignedIn = () => true; window.cloudSession = () => ({ user: { email: 'anna@example.test' } }); }")
                bad = []
                for v in VIEWS:
                    r = await page.evaluate(JS, v)
                    if not r.get('ok'): bad.append(r)
                check(f'[{w}, {"angemeldet" if signed else "abgemeldet"}] alle {len(VIEWS)} Seiten unter «Mehr» bis zum Ende sichtbar (nichts hinter der unteren Leiste)', not bad, str(bad))
            check(f'[{w}] keine Seitenfehler', not errs, str(errs[:2]))
            await b.close()
    print('\nFEHLGESCHLAGEN:', ', '.join(FAIL) if FAIL else 'keine'); sys.exit(1 if FAIL else 0)
asyncio.run(main())
