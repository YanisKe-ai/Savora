"""Paket 27: Apple-Designregeln (Drück-Feedback, Wischen und Ziehen mit Federn, weiche Kanten, Kontrast/Transparenz, Abstandsskala, Seitenrichtung)."""
import asyncio, sys, re
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)
ROOT = _os.path.dirname(TESTS)
async def drag(page, sel, dx, dy, ms=120, release=True):
    ev = "(a) => { const el = document.querySelector(a[0]); el.dispatchEvent(new PointerEvent(a[1], { bubbles: true, pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, clientX: a[2], clientY: a[3] })); }"
    box = await page.evaluate("(s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left + r.width / 2, r.top + Math.min(20, r.height / 2)]; }", sel)
    x0, y0 = box
    await page.evaluate(ev, [sel, 'pointerdown', x0, y0])
    for i in range(1, 7):
        await page.wait_for_timeout(ms // 6)
        await page.evaluate(ev, [sel, 'pointermove', x0 + dx * i / 6, y0 + dy * i / 6])
    if release: await page.evaluate(ev, [sel, 'pointerup', x0 + dx, y0 + dy])
async def main():
    # Statische Pruefung: Abstaende nur aus der Skala (0, 1, 2 px und Vielfache von 4 px)
    bad = []
    for f in ('styles.css', 'styles-v2.css'):
        css = open(_os.path.join(ROOT, f), encoding='utf-8').read()
        for m in re.finditer(r'\b(padding(?:-[a-z]+)?|margin(?:-[a-z]+)?|gap|row-gap|column-gap)\s*:\s*([^;}]+)', css):
            if '(' in m.group(2): continue
            for v in re.findall(r'(-?[\d.]+)rem', m.group(2)):
                px = abs(float(v) * 16)
                if px > 2.01 and abs(px / 4 - round(px / 4)) > 0.01: bad.append(f'{f}: {m.group(0)[:40]}')
            if re.search(r'\d+px', m.group(2)): bad.append(f'{f}: {m.group(0)[:40]}')
    check('Abstände nur aus der Skala (4er-Schritte, in rem)', not bad, str(bad[:4]))
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, reduced_motion='no-preference', timezone_id='UTC')
        await ctx.add_init_script("try { localStorage.setItem('savora-splash-seen', '1') } catch (e) {}")
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(400)
        ev = page.evaluate
        tr = await ev("() => getComputedStyle(document.querySelector('.round-btn')).transitionProperty")
        check('Drück-Feedback: Knöpfe haben einen schnellen transform-Übergang', 'transform' in tr, tr)
        rules = await ev("() => Array.from(document.styleSheets).flatMap(s => { try { return Array.from(s.cssRules); } catch (e) { return []; } }).filter(r => r.media).map(r => r.media.mediaText).join('|')")
        check('Reduzierte Transparenz und erhöhter Kontrast werden beachtet', 'prefers-reduced-transparency' in rules and 'prefers-contrast' in rules)
        # Weiche Kante erst beim Scrollen
        await ev("() => { state.view = 'home'; render(); }"); await page.wait_for_timeout(300)
        sh0 = await ev("() => getComputedStyle(document.querySelector('.topbar')).boxShadow")
        await ev("() => window.scrollTo(0, 300)"); await page.wait_for_timeout(300)
        sh1 = await ev("() => [document.documentElement.classList.contains('is-scrolled'), getComputedStyle(document.querySelector('.topbar')).boxShadow, getComputedStyle(document.querySelector('.topbar')).borderBottomWidth]")
        check('Kopfleiste: oben ohne Linie, beim Scrollen weiche Kante', sh0 == 'none' and sh1[0] and sh1[1] != 'none' and sh1[2] == '0px', str([sh0] + sh1))
        await ev("() => window.scrollTo(0, 0)")
        # Seitenrichtung
        await ev("() => { state.activeRecipeId = 'r_legacy_1'; state.view = 'detail'; render(); }"); await page.wait_for_timeout(500)
        d1 = await ev("document.documentElement.dataset.navDir")
        await ev("() => { state.view = 'home'; render(); }"); await page.wait_for_timeout(500)
        d2 = await ev("document.documentElement.dataset.navDir")
        check('Seitenwechsel: hinein von rechts, zurück nach rechts', (d1, d2) == ('forward', 'back'), str((d1, d2)))
        # Hinweise stehen nicht mehr zwischen Kochmodus-Knopf und Reitern
        await ev("() => { state.recipes.find(r => r.id === 'r_legacy_1').steps.push({ text: 'Tipp: warm servieren.' }); state.view = 'home'; render(); }"); await page.wait_for_timeout(400)
        await ev("() => { state.activeRecipeId = 'r_legacy_1'; state.view = 'detail'; render(); }"); await page.wait_for_timeout(600)
        order = await ev("""() => { const c = document.querySelector('.recipe-check'), t = document.querySelector('.tabbar-v2'); return c && t ? !!(t.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING) : null; }""")
        check('Rezept-Hinweise stehen unter den Reitern, nicht davor', order is True, str(order))
        # Fenster: kurz ziehen federt zurück, kräftig nach unten ziehen schliesst
        await ev("() => { state.modal = { type: 'detail-menu', recipeId: 'r_legacy_1' }; render(); }"); await page.wait_for_timeout(500)
        await drag(page, '.modal-sheet .sheet-handle', 0, 40, ms=500)
        await page.wait_for_timeout(900)
        still = await ev("() => !!document.querySelector('.modal-sheet') && (document.querySelector('.modal-sheet').style.transform || '') === ''")
        check('Fenster: kurzes Ziehen federt zurück', still)
        await drag(page, '.modal-sheet .sheet-handle', 0, 320, ms=120)
        await page.wait_for_timeout(1200)
        check('Fenster: kräftig nach unten ziehen schliesst', await ev("!document.querySelector('.modal-sheet') && !state.modal"))
        # Kochmodus: Schritt folgt dem Finger schon während der Geste
        await ev("() => { state.activeRecipeId = 'r_legacy_1'; state.view = 'cookmode'; state.cookStepIndex = 0; state.cookFinished = false; render(); }"); await page.wait_for_timeout(400)
        await drag(page, '.cook-v2 .cookmode-body', -80, 0, ms=1200, release=False)
        follow = await ev("() => document.querySelector('.cook-v2 .cookmode-body').style.transform")
        check('Kochmodus: Schritt folgt dem Finger 1:1', 'translate3d(-' in follow, follow)
        await page.evaluate("() => { const el = document.querySelector('.cook-v2 .cookmode-body'); el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: 115, clientY: 400 })); }")
        await page.wait_for_timeout(900)
        check('Kochmodus: langsamer kurzer Zug ohne Schwung federt zurück', await ev("state.cookStepIndex") == 0)
        await drag(page, '.cook-v2 .cookmode-body', -200, 0, ms=100)
        await page.wait_for_timeout(1200)
        check('Kochmodus: Wisch mit Schwung wechselt zum nächsten Schritt', await ev("state.cookStepIndex") == 1)
        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await b.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
