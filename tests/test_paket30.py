"""Paket 30: neues Farbkleid (Tomatenrot), Robustheit mit extremen Inhalten (kein seitliches Überlaufen), Fokus, runde Häkchen."""
import asyncio, sys, re
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)
LONG = 'Überbackene Spätzle mit Käse und karamellisierten Zwiebeln nach Grossmutters Art mit sehr langem Titel ' * 2
async def main():
    css = open(_os.path.join(ROOT, 'styles.css'), encoding='utf-8').read() + open(_os.path.join(ROOT, 'styles-v2.css'), encoding='utf-8').read()
    check('Violett-Töne sind aus den App-Stilen entfernt', not re.search(r'#6E45A2|#28133E|#32164F', css, re.I))
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for (w, h) in ((320, 640), (390, 844), (1280, 800)):
            ctx = await b.new_context(viewport={'width': w, 'height': h}, timezone_id='UTC')
            await ctx.add_init_script("try { localStorage.setItem('savora-splash-seen', '1') } catch (e) {}")
            page = await ctx.new_page(); errs = []
            page.on('pageerror', lambda e: errs.append(str(e)))
            await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(400)
            ev = page.evaluate
            await ev("(t) => { const r = JSON.parse(JSON.stringify(state.recipes[0])); r.id = 'r_hart_1'; r.title = t; r.ingredients = [{ amount: '1', unit: 'Stück', name: t.slice(0, 120) + ' 😀 مرحبا 日本語' }]; r.steps = [t + t]; r.notes = 'x'.repeat(300); state.recipes.unshift(r); }", LONG)
            for view in ('home', 'mealplan', 'shopping', 'settings'):
                await ev("(v) => { state.view = v; render(); }", view); await page.wait_for_timeout(250)
                over = await ev("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
                check(f'{w}px {view}: kein seitliches Überlaufen', over <= 1, str(over))
            await ev("() => { state.currentId = 'r_hart_1'; state.view = 'detail'; render(); }"); await page.wait_for_timeout(300)
            over = await ev("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
            check(f'{w}px Detail mit 200 Zeichen Titel, Emoji, RTL, CJK: kein Überlaufen', over <= 1, str(over))
            title_clip = await ev("() => { const t = document.querySelector('.detail-title-v2'); return t ? t.scrollWidth - t.clientWidth : 0; }")
            check(f'{w}px langer Titel bricht um statt abgeschnitten zu werden', title_clip <= 1, str(title_clip))
            check(f'{w}px keine Seitenfehler', not errs, str(errs[:2]))
            if w == 390:
                await ev("() => { state.view = 'home'; render(); }"); await page.wait_for_timeout(250)
                await page.keyboard.press('Tab'); await page.keyboard.press('Tab')
                ring = await ev("() => { const e = document.activeElement; return e ? getComputedStyle(e).outlineStyle + '|' + getComputedStyle(e).outlineWidth : ''; }")
                check('Tastatur: fokussiertes Element hat einen sichtbaren Rahmen', ring.startswith('solid'), ring)
                await ev("() => { state.view = 'mealplan'; render(); }"); await page.wait_for_timeout(250)
                rad = await ev("() => { const i = document.querySelector('.day-select input'); return i ? getComputedStyle(i).borderRadius : ''; }")
                check('Wochenplan: Häkchen ist rund', rad.startswith('50%') or rad.startswith('11'), rad)
            await ctx.close()
        await b.close()
    print('\nFEHLGESCHLAGEN:', ', '.join(FAIL) if FAIL else 'keine'); sys.exit(1 if FAIL else 0)
asyncio.run(main())
