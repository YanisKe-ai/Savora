"""v0.95: Schnellmenü im Wochenplan. Lange auf ein geplantes Rezept drücken: Jetzt kochen, Auf die Einkaufsliste,
Verschieben oder ändern, Morgen nochmals einplanen, Aus dem Plan entfernen (mit Rückgängig)."""
import asyncio, os, sys
os.environ.setdefault('SAVORA_TEST_PORT', '64500')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

SHOT = os.environ.get('SAVORA_QM_SHOTS')
ENTRY = '.plan-main .plan-entry-main[data-plan-entry="e_test_1"]'
HOLD_JS = """async ([sel, ms]) => { const el = document.querySelector(sel); const r = el.getBoundingClientRect();
  const o = { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
  el.dispatchEvent(new PointerEvent('pointerdown', o)); await new Promise(f => setTimeout(f, ms));
  el.dispatchEvent(new PointerEvent('pointerup', o)); el.click(); return true; }"""
SETUP = """async () => {
  const today = fmtDateKey(new Date()); const r = state.recipes[0];
  await savePlanEntries(today, [{ id: 'e_test_1', recipeId: r.id, meal: 'dinner', servings: 2 }, { id: 'n_test', text: 'Reste', meal: '' }]);
  state.weekStart = typeof getWeekStart === 'function' ? getWeekStart(new Date()) : state.weekStart;
  state.view = 'mealplan'; render(); return { today, rid: r.id }; }"""

async def wait_open(page, o=True):
    await page.wait_for_function("(o) => !!document.querySelector('.qm-layer.is-open') === o", arg=o, timeout=5000)
async def hold(page):
    await page.wait_for_timeout(600)   # Scroll-Wiederherstellung nach render abwarten (Scrollen bricht das Halten ab)
    await page.evaluate("(sel) => document.querySelector(sel).scrollIntoView({ block: 'center' })", ENTRY); await page.wait_for_timeout(200)
    await page.evaluate(HOLD_JS, [ENTRY, 520]); await wait_open(page)

async def main():
    async with async_playwright() as p:
        for w, h, scheme in [(390, 844, 'light'), (390, 844, 'dark'), (1280, 800, 'light')]:
            b, ctx = await open_ctx(p, w, h, motion='no-preference')
            page = await ctx.new_page(); errs = []
            page.on('pageerror', lambda e: errs.append(str(e)))
            await page.emulate_media(color_scheme=scheme)
            await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.evaluate("() => loadRecipes().then(() => render())")
            info = await page.evaluate(SETUP)
            await page.wait_for_selector(ENTRY)
            tag = f'{w}px {scheme}'
            await hold(page)
            m = await page.evaluate("""() => { const m = document.querySelector('.qm-menu'); const r = m.getBoundingClientRect();
              return { items: Array.from(m.querySelectorAll('.qm-item')).map(b => b.textContent.trim()), l: r.left, r: r.right, t: r.top, b: r.bottom, W: document.documentElement.clientWidth, H: innerHeight, view: state.view }; }""")
            check(f'{tag}: langes Drücken öffnet das Plan-Menü, Rezept bleibt zu', m['view'] == 'mealplan', m['view'])
            check(f'{tag}: Plan-Einträge', all(x in m['items'] for x in ['Verschieben oder ändern', 'Morgen nochmals einplanen', 'Aus dem Plan entfernen']), m['items'])
            check(f'{tag}: Menü ganz im Bild', m['l'] >= 8 and m['r'] <= m['W'] - 8 and m['t'] >= 8 and m['b'] <= m['H'] - 8)
            if SHOT: await page.wait_for_timeout(400); await page.screenshot(path=os.path.join(SHOT, f'plan_{w}_{scheme}.png'))
            await page.keyboard.press('Escape'); await wait_open(page, False)
            if w == 390 and scheme == 'light':
                # Notiz-Einträge haben kein Schnellmenü (Tipp bearbeitet sie)
                note = await page.evaluate("() => !!document.querySelector('.plan-entry--note [data-plan-entry]')")
                check('Notiz-Eintrag ohne Schnellmenü', not note)
                # Eintrag eines anderen Tages: «Morgen» bezieht sich auf dessen Tag (Seed plant am 26.10.)
                # Morgen nochmals
                await hold(page)
                await page.click('.qm-item[data-qm="qm-plan-again"]')
                await page.wait_for_function("""(t) => { const [y, m, d] = t.split('-').map(Number); const k = fmtDateKey(addDays(new Date(y, m - 1, d), 1));
                  return planEntriesFor(k).some(e => e.recipeId === state.recipes[0].id && e.meal === 'dinner'); }""", arg=info['today'], timeout=5000)
                check('Morgen nochmals: Eintrag am nächsten Tag mit gleicher Mahlzeit', True)
                await page.click('.toast-action-btn')
                await page.wait_for_function("""(t) => { const [y, m, d] = t.split('-').map(Number); const k = fmtDateKey(addDays(new Date(y, m - 1, d), 1));
                  return !planEntriesFor(k).some(e => e.recipeId === state.recipes[0].id); }""", arg=info['today'], timeout=5000)
                check('Rückgängig nimmt den Eintrag wieder weg', True)
                # Entfernen mit Rückgängig
                await hold(page)
                await page.click('.qm-item[data-qm="qm-plan-remove"]')
                await page.wait_for_function("(t) => !planEntriesFor(t).some(e => e.id === 'e_test_1')", arg=info['today'], timeout=5000)
                check('Entfernen nimmt den Eintrag aus dem Plan', await page.evaluate("(t) => planEntriesFor(t).some(e => e.id === 'n_test')", info['today']))
                await page.click('.toast-action-btn')
                await page.wait_for_function("(t) => planEntriesFor(t).some(e => e.id === 'e_test_1' && e.servings === 2)", arg=info['today'], timeout=5000)
                check('Rückgängig stellt den Eintrag mit Portionen wieder her', True)
                await page.wait_for_selector(ENTRY)
                # Verschieben: bestehender Eintragsdialog
                await hold(page)
                await page.click('.qm-item[data-qm="qm-plan-edit"]')
                await page.wait_for_function("() => state.modal && state.modal.type === 'plan-entry' && state.modal.entryId === 'e_test_1' && !!document.querySelector('.modal-sheet')", timeout=5000)
                check('Verschieben öffnet den Eintragsdialog', True)
                await page.keyboard.press('Escape'); await page.wait_for_function("() => !state.modal", timeout=5000)
                # Einkaufsliste: Zutatenauswahl
                await hold(page)
                await page.click('.qm-item[data-qm="add-to-shopping"]')
                await page.wait_for_function("() => state.modal && state.modal.type === 'shop-select' && !!document.querySelector('.modal-sheet')", timeout=5000)
                check('Auf die Einkaufsliste: Zutatenauswahl im Wochenplan', await page.evaluate("() => state.view") == 'mealplan')
                await page.keyboard.press('Escape'); await page.wait_for_function("() => !state.modal", timeout=5000)
                # kurzer Tipp öffnet weiter das Rezept
                await page.wait_for_timeout(600)
                await page.evaluate(HOLD_JS, [ENTRY, 60]); await page.wait_for_function("() => state.view === 'detail'", timeout=5000)
                check('kurzer Tipp öffnet das Rezept', True)
            check(f'{tag}: keine Seitenfehler', not errs, errs)
            await b.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
    sys.exit(1 if FAIL else 0)

asyncio.run(main())
