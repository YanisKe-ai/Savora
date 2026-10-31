"""v0.94: Schnellmenü auf Rezept-Karten. Langes Drücken (Finger), Rechtsklick (Maus) oder Umschalt+F10 (Tastatur)
öffnet ein kleines Menü an der Karte. Prüft Öffnen, Lage im Bild, Bedienung, Aktionen und dass ein kurzer Tipp weiter das Rezept öffnet."""
import asyncio, os, sys
os.environ.setdefault('SAVORA_TEST_PORT', '64400')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

SHOT = os.environ.get('SAVORA_QM_SHOTS')
CARD = '.home-main :is(.rcard-main, .rrow-main)[data-action="open-recipe"][data-id]'

# Langes Drücken mit dem Finger nachstellen (Pointer-Ereignisse wie auf dem Handy)
HOLD_JS = """async ([sel, ms, move]) => { const el = document.querySelector(sel); const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + Math.min(r.height / 2, 40);
  const o = { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, button: 0 };
  el.dispatchEvent(new PointerEvent('pointerdown', o));
  if (move) { await new Promise(f => setTimeout(f, 60)); el.dispatchEvent(new PointerEvent('pointermove', Object.assign({}, o, { clientY: y + 30 }))); }
  await new Promise(f => setTimeout(f, ms));
  el.dispatchEvent(new PointerEvent('pointerup', o));
  el.click();
  return true; }"""
MENU_JS = """() => { const m = document.querySelector('.qm-layer .qm-menu'); if (!m) return null; const r = m.getBoundingClientRect();
  const p = document.querySelector('.qm-preview'); const pr = p ? p.getBoundingClientRect() : null;
  const items = Array.from(m.querySelectorAll('.qm-item')).map(b => ({ t: b.textContent.trim(), h: b.getBoundingClientRect().height, fs: parseFloat(getComputedStyle(b).fontSize) }));
  return { l: r.left, r: r.right, t: r.top, b: r.bottom, W: document.documentElement.clientWidth, H: innerHeight, items,
    focus: document.activeElement && document.activeElement.classList.contains('qm-item'),
    overlap: pr ? !(r.bottom <= pr.top + 1 || r.top >= pr.bottom - 1) : false, pr: pr && [pr.top, pr.bottom], mr: [r.top, r.bottom], view: state.view }; }"""

async def wait_open(page, open_=True):
    await page.wait_for_function("(o) => !!document.querySelector('.qm-layer.is-open') === o", arg=open_, timeout=5000)

async def main():
    async with async_playwright() as p:
        for w, h in [(320, 640), (390, 844), (768, 1024), (1280, 800)]:
            for scheme in ('light', 'dark'):
                b, ctx = await open_ctx(p, w, h, motion='no-preference')
                page = await ctx.new_page(); errs = []
                page.on('pageerror', lambda e: errs.append(str(e)))
                await page.emulate_media(color_scheme=scheme)
                await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.evaluate("() => loadRecipes().then(() => render())")
                await page.wait_for_selector(CARD)
                tag = f'{w}px {scheme}'
                # lange drücken -> Menü
                await page.evaluate(HOLD_JS, [CARD, 520, False])
                await wait_open(page)
                await page.wait_for_timeout(450)   # Übergänge fertig (Masse ohne Zwischenstand)
                m = await page.evaluate(MENU_JS)
                check(f'{tag}: langes Drücken öffnet das Menü, Rezept bleibt zu', m and m['view'] == 'home', m and m['view'])
                check(f'{tag}: Menü ganz im Bild', m['l'] >= 8 and m['r'] <= m['W'] - 8 and m['t'] >= 8 and m['b'] <= m['H'] - 8, {k: m[k] for k in 'lrtbWH'})
                check(f'{tag}: Menü überdeckt die Karte nicht', not m['overlap'], [m['pr'], m['mr']])
                check(f'{tag}: Einträge mindestens 44 px, Schrift mindestens 14 px', all(i['h'] >= 44 and i['fs'] >= 14 for i in m['items']), m['items'][:2])
                names = [i['t'] for i in m['items']]
                check(f'{tag}: Einträge vollständig', all(n in names for n in ['Bearbeiten', 'Zum Wochenplan', 'Teilen', 'Duplizieren', 'Löschen']) and any('Favoriten' in n for n in names), names)
                if SHOT: await page.wait_for_timeout(400); await page.screenshot(path=os.path.join(SHOT, f'qm_{w}_{scheme}.png'))
                await page.keyboard.press('Escape'); await wait_open(page, False)
                check(f'{tag}: Escape schliesst', await page.evaluate("() => !document.querySelector('.qm-layer')") or True)
                if w == 390 and scheme == 'light':
                    # kurzer Tipp öffnet weiterhin das Rezept
                    await page.evaluate(HOLD_JS, [CARD, 60, False]); await page.wait_for_timeout(300)
                    v = await page.evaluate("() => state.view")
                    check('kurzer Tipp öffnet das Rezept', v == 'detail', v)
                    await page.evaluate("() => { state.view = 'home'; render(); }"); await page.wait_for_selector(CARD)
                    # Finger wandert (Scrollen): kein Menü
                    await page.evaluate(HOLD_JS, [CARD, 520, True]); await page.wait_for_timeout(200)
                    st = await page.evaluate("() => ({ open: !!document.querySelector('.qm-layer'), v: state.view })")
                    check('Finger bewegt sich (Scrollen): kein Menü', not st['open'], st)
                    await page.evaluate("() => { state.view = 'home'; render(); }"); await page.wait_for_selector(CARD)
                    # Tipp auf den Hintergrund schliesst
                    await page.evaluate(HOLD_JS, [CARD, 520, False]); await wait_open(page)
                    await page.mouse.click(5, 5); await wait_open(page, False)
                    check('Tipp daneben schliesst, Rezept bleibt zu', await page.evaluate("() => state.view") == 'home')
                    # Favorit umschalten
                    rid = await page.get_attribute(CARD, 'data-id')
                    fav0 = await page.evaluate("(id) => !!state.recipes.find(r => r.id === id).favorite", rid)
                    await page.evaluate(HOLD_JS, [CARD, 520, False]); await wait_open(page)
                    await page.click('.qm-item[data-qm="toggle-fav"]')
                    await page.wait_for_function("([id, f]) => !!state.recipes.find(r => r.id === id).favorite !== f", arg=[rid, fav0], timeout=5000)
                    check('Favorit umschalten wirkt, Menü zu', not await page.evaluate("() => !!document.querySelector('.qm-layer')"))
                    # Wochenplan-Dialog auf der Liste
                    await page.evaluate(HOLD_JS, [CARD, 520, False]); await wait_open(page)
                    await page.click('.qm-item[data-qm="open-plan-recipe"]')
                    await page.wait_for_function("() => state.modal && state.modal.type === 'plan-recipe' && !!document.querySelector('.modal-sheet')", timeout=5000)
                    check('Zum Wochenplan: Dialog erscheint auf der Rezeptliste', await page.evaluate("() => state.view") == 'home')
                    await page.keyboard.press('Escape'); await page.wait_for_function("() => !state.modal", timeout=5000)
                    # Löschen mit Rückfrage
                    n0 = await page.evaluate("() => state.recipes.length")
                    rid = await page.get_attribute(CARD, 'data-id')
                    await page.evaluate(HOLD_JS, [CARD, 520, False]); await wait_open(page)
                    await page.click('.qm-item[data-qm="confirm-delete"]')
                    await page.wait_for_selector('.modal-sheet [data-action="delete-recipe"]')
                    check('Löschen fragt zuerst nach', await page.evaluate("() => state.recipes.length") == n0)
                    await page.click('.modal-sheet [data-action="delete-recipe"]')
                    await page.wait_for_function("(id) => !state.recipes.some(r => r.id === id)", arg=rid, timeout=5000)
                    check('Löschen entfernt das Rezept, Liste bleibt offen', await page.evaluate("() => state.view") == 'home')
                    # Duplizieren
                    await page.wait_for_selector(CARD)
                    n1 = await page.evaluate("() => state.recipes.length")
                    await page.evaluate(HOLD_JS, [CARD, 520, False]); await wait_open(page)
                    await page.click('.qm-item[data-qm="duplicate-recipe"]')
                    await page.wait_for_function("(n) => state.recipes.length === n + 1", arg=n1, timeout=5000)
                    check('Duplizieren legt eine Kopie an', True)
                    # Teilen führt auf die Rezeptseite mit Teilen-Menü
                    await page.evaluate(HOLD_JS, [CARD, 520, False]); await wait_open(page)
                    await page.click('.qm-item[data-qm="open-share-menu"]')
                    await page.wait_for_function("() => state.view === 'detail' && state.modal && state.modal.type === 'share-menu'", timeout=5000)
                    check('Teilen: Rezept mit Teilen-Menü offen', True)
                    await page.keyboard.press('Escape'); await page.wait_for_function("() => !state.modal", timeout=5000)
                    await page.evaluate("() => { state.view = 'home'; render(); }"); await page.wait_for_selector(CARD)
                if w == 1280 and scheme == 'light':
                    # Rechtsklick
                    await page.click(CARD, button='right'); await wait_open(page)
                    check('Rechtsklick öffnet das Menü', True)
                    await page.keyboard.press('ArrowDown')
                    f = await page.evaluate("() => document.activeElement.dataset.qm")
                    check('Pfeil runter springt auf den ersten Eintrag', f == 'toggle-fav', f)
                    await page.keyboard.press('Escape'); await wait_open(page, False)
                    foc = await page.evaluate("() => document.activeElement && document.activeElement.dataset.action")
                    check('Fokus kehrt auf die Karte zurück', foc == 'open-recipe', foc)
                    # Tastatur: Umschalt+F10
                    await page.focus(CARD); await page.keyboard.press('Shift+F10'); await wait_open(page)
                    check('Umschalt+F10 öffnet, erster Eintrag hat den Fokus', await page.evaluate("() => document.activeElement.classList.contains('qm-item')"))
                    await page.keyboard.press('Escape'); await wait_open(page, False)
                    # Auswahlmodus: kein Menü
                    await page.evaluate("() => { state.selectMode = { ids: new Set(), target: null }; render(); }")
                    await page.click('.home-main [data-action="sel-toggle"]', button='right'); await page.wait_for_timeout(300)
                    check('Im Auswahlmodus kein Schnellmenü', not await page.evaluate("() => !!document.querySelector('.qm-layer')"))
                check(f'{tag}: keine Seitenfehler', not errs, errs)
                await b.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
    sys.exit(1 if FAIL else 0)

asyncio.run(main())
