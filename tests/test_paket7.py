"""Paket 7: breite Bildschirme: Seitenleiste ab 900 px, Rezeptseite zweispaltig, kein Seitwaerts-Scrollen."""
import asyncio, sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

async def main():
    async with async_playwright() as p:
        browser, ctx = await open_ctx(p, 1280, 800)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(500)
        async def show(js):
            await page.evaluate("() => {" + js + "; render(); }"); await page.wait_for_timeout(400)
        async def r(sel): return await page.evaluate("(s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return {l: b.left, t: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom, disp: getComputedStyle(e).display} }", sel)

        async def layout(width, height):
            await page.set_viewport_size({'width': width, 'height': height}); await page.wait_for_timeout(200)
            await show("state.view='home'")
            nav = await r('.bottom-nav'); main = await r('main')
            return nav, main
        nav, main = await layout(1280, 800)
        check('1280 px: Navigation als Seitenleiste links (232 px breit, volle Höhe)', nav['l'] == 0 and abs(nav['w'] - 232) < 2 and nav['h'] >= 790, str(nav))
        check('1280 px: Inhalt beginnt rechts der Seitenleiste', main['l'] >= 232, str(main['l']))
        ov = await page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check('1280 px: kein Seitwärts-Scrollen', ov <= 0, str(ov))
        cols = await page.evaluate("getComputedStyle(document.querySelector('.rgrid')).gridTemplateColumns.split(' ').length")
        check('1280 px: Rezeptraster mit 4 Spalten', cols == 4, str(cols))
        labels = await page.evaluate("Array.from(document.querySelectorAll('.bottom-nav button')).map(b => b.querySelector('.nav-label').textContent)")
        check('Seitenleiste: vier Einträge mit Text', labels == ['Rezepte', 'Wochenplan', 'Einkauf', 'Mehr'], str(labels))
        bad = await page.evaluate("Array.from(document.querySelectorAll('.bottom-nav button')).filter(b => b.getBoundingClientRect().height < 43.5).length")
        check('Seitenleiste: Tippflächen mind. 44 px', bad == 0)
        await page.evaluate("document.querySelector('.bottom-nav [data-view=\"shopping\"]').click()"); await page.wait_for_timeout(300)
        check('Seitenleiste funktioniert (Einkauf)', await page.evaluate("state.view") == 'shopping')

        # Rezeptseite zweispaltig
        await show("state.activeRecipeId='r_legacy_1'; state.view='detail'; state.detailTab='ingredients'")
        ing = await r('.detail-aside-ing'); steps = await r('#panel-steps'); tab_ing = await r('#tab-ingredients')
        check('Rezeptseite: Zutaten links und Zubereitung rechts nebeneinander', ing['disp'] == 'block' and steps['disp'] == 'block' and ing['r'] < steps['l'] and abs(ing['t'] - steps['t']) < 400, f"{ing['l']:.0f}-{ing['r']:.0f} / {steps['l']:.0f}")
        check('Reiter "Zutaten" entfällt, Zutaten sind links sichtbar', tab_ing['disp'] == 'none' if tab_ing else True)
        vis = await page.evaluate("(() => { const e = document.querySelector('.detail-aside-ing .ing-check'); const b = e.getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight })()")
        check('Erste Zutat ohne Scrollen sichtbar (800 px hoch)', vis)
        cook = await r('.cook-start-inline')
        check('Kochmodus-Knopf liegt im Inhaltsbereich (nicht unter der Seitenleiste)', cook['l'] >= 232 and cook['b'] <= 800, str(cook))
        # Abhaken links wirkt
        await page.evaluate("document.querySelector('.detail-aside-ing .ing-check').click()"); await page.wait_for_timeout(200)
        checked = await page.evaluate("document.querySelectorAll('.detail-aside-ing .ing-check.is-checked').length")
        check('Zutat links abhaken funktioniert', checked == 1, str(checked))
        # Naehrwerte-Reiter zeigt Nährwerte statt Zubereitung
        await page.evaluate("document.querySelector('#tab-nutrition').click()"); await page.wait_for_timeout(300)
        check('Reiter Nährwerte ersetzt die Zubereitung rechts', await page.evaluate("getComputedStyle(document.querySelector('#panel-nutrition')).display") == 'block' and await page.evaluate("getComputedStyle(document.querySelector('#panel-steps')).display") == 'none')
        await page.evaluate("document.querySelector('#tab-steps').click()"); await page.wait_for_timeout(300)
        check('Reiter Zubereitung zeigt wieder die Schritte', await page.evaluate("getComputedStyle(document.querySelector('#panel-steps')).display") == 'block')
        ov = await page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check('Rezeptseite 1280 px: kein Seitwärts-Scrollen', ov <= 0, str(ov))

        # Uebergaenge der Breite
        nav, main = await layout(899, 800); check('899 px: noch untere Leiste', nav['t'] > 600 and nav['w'] >= 890, str(nav))
        nav, main = await layout(900, 800); check('900 px: Seitenleiste', nav['l'] == 0 and abs(nav['w'] - 232) < 2, str(nav))
        nav, main = await layout(1024, 768)
        await show("state.activeRecipeId='r_legacy_1'; state.view='detail'")
        ing = await r('.detail-aside-ing'); steps = await r('#panel-steps')
        check('iPad quer (1024 px): zweispaltig ohne Überlauf', ing['r'] < steps['l'] and await page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth") <= 0)
        # schmal bleibt wie bisher
        await page.set_viewport_size({'width': 390, 'height': 844}); await show("state.activeRecipeId='r_legacy_1'; state.view='detail'; state.detailTab='ingredients'")
        check('390 px: Zutaten nur im Reiter (keine Doppelung), untere Leiste', await page.evaluate("getComputedStyle(document.querySelector('.detail-aside-ing')).display") == 'none' and (await r('.bottom-nav'))['t'] > 700)
        # iPad drehen: Breitenwechsel ordnet die Zutaten ohne manuelles Neuladen um
        await page.set_viewport_size({'width': 1280, 'height': 800}); await page.wait_for_timeout(500)
        wide_ing = await page.evaluate("document.querySelectorAll('.detail-aside-ing .ing-check').length")
        await page.set_viewport_size({'width': 390, 'height': 844}); await page.wait_for_timeout(500)
        narrow_ing = await page.evaluate("[document.querySelectorAll('.detail-aside-ing .ing-check').length, document.querySelectorAll('#panel-ingredients .ing-check').length]")
        check('Breitenwechsel: Zutaten wandern zwischen Seitenspalte und Reiter, nie doppelt', wide_ing > 0 and narrow_ing == [0, wide_ing], f'{wide_ing} / {narrow_ing}')
        # Dunkelmodus 1280: keine Fehler
        await page.set_viewport_size({'width': 1280, 'height': 800})
        await page.evaluate("() => document.documentElement.setAttribute('data-theme','dark')"); await show("state.view='home'")
        await page.screenshot(path=OUT + '/p7_home_dark.png')
        await show("state.activeRecipeId='r_legacy_1'; state.view='detail'"); await page.screenshot(path=OUT + '/p7_detail_dark.png')
        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await browser.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
