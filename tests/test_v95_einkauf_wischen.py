"""v95 B: Wischen in der Einkaufsliste (shop-swipe.js). Synthetische PointerEvents (pointerType 'touch').
Rechts = abhaken/Haken entfernen, links = entfernen mit Rückgängig, kurzer Wisch federt zurück, senkrecht tut nichts,
kein Klick nach dem Wisch, Maus wischt nicht, Haken-Knopf geht weiter, kein seitlicher Überlauf, hell/dunkel, keine Seitenfehler."""
import asyncio, os, sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info if not cond else '')
    if not cond: FAIL.append(name)
SHOTS = os.environ.get('SAVORA_V95_SHOTS') or os.path.join(OUT, 'v95-shots')
os.makedirs(SHOTS, exist_ok=True)

SWIPE = """async ({ sel, dx, dy, steps, dt, type, hold, startSel }) => {
  const row = document.querySelector(sel);
  const target = (startSel && row.querySelector(startSel)) || row.querySelector('.shop-text');
  const r = target.getBoundingClientRect();
  let x = r.left + r.width / 2, y = r.top + r.height / 2;
  const mk = (t, px, py) => new PointerEvent(t, { pointerId: 7, pointerType: type || 'touch', isPrimary: true, bubbles: true, cancelable: true, composed: true, clientX: px, clientY: py, buttons: t === 'pointerup' ? 0 : 1 });
  const sleep = (ms) => new Promise(res => setTimeout(res, ms));
  target.dispatchEvent(mk('pointerdown', x, y));
  for (let i = 1; i <= steps; i++) { await sleep(dt); target.dispatchEvent(mk('pointermove', x + dx * i / steps, y + (dy || 0) * i / steps)); }
  if (!hold) { await sleep(dt); target.dispatchEvent(mk('pointerup', x + dx, y + (dy || 0))); }
  return true; }"""
RELEASE = """() => { const t = document.querySelector('.shop-row .shop-text'); t.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, composed: true })); }"""

async def setup(page, theme=None):
    await goto(page)
    await page.evaluate("""async () => {
      await dbPutShopping({ id: 's_a', name: 'Milch', amount: 2, unit: 'l', checked: false, createdAt: 1 });
      await dbPutShopping({ id: 's_b', name: 'Butter', amount: 1, unit: 'Stk', checked: false, createdAt: 2 });
      await dbPutShopping({ id: 's_c', name: 'Mehl', amount: 500, unit: 'g', checked: false, createdAt: 3 });
      await loadShopping(); state.shopStay = new Set(); state.view = 'shopping'; render(); }""")
    if theme:
        await page.evaluate("(t) => { state.theme = t; applyTheme(); render(); }", theme)
    await page.wait_for_selector('.shop-row[data-id="s_a"]')
    await page.wait_for_function("document.fonts.ready.then(() => true)")

def row(i): return f'.shop-row[data-id="{i}"]'
async def item(page, i): return await page.evaluate("(i) => { const x = state.shopping.find(s => s.id === i); return x ? { name: x.name, amount: x.amount, unit: x.unit, checked: !!x.checked } : null; }", i)
async def tx(page, i): return await page.evaluate("(i) => getComputedStyle(document.querySelector('.shop-row[data-id=\"' + i + '\"] .shop-row-fg')).transform", i)
async def swipe(page, i, dx, dy=0, steps=10, dt=25, **kw):
    await page.evaluate(SWIPE, dict(sel=row(i), dx=dx, dy=dy, steps=steps, dt=dt, **kw))

async def main():
    async with async_playwright() as p:
        # ---------- Hauptlauf: 390 px, Bewegung mit Animation ----------
        browser, ctx = await open_ctx(p, 390, 844, motion="no-preference")
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await setup(page)
        orig = await item(page, 's_a')
        check('Ausgang: Milch offen', orig == {'name': 'Milch', 'amount': 2, 'unit': 'l', 'checked': False}, str(orig))

        # kurzer, langsamer Wisch nach rechts: federt zurück, keine Wirkung
        await swipe(page, 's_a', 60, steps=6, dt=50)
        await page.wait_for_function("(i) => { const r = document.querySelector('.shop-row[data-id=\"' + i + '\"]'); return !r.classList.contains('is-swiping'); }", arg='s_a', timeout=3000)
        check('Kurzer Wisch: nicht abgehakt', (await item(page, 's_a'))['checked'] is False)
        check('Kurzer Wisch: Zeile wieder an ihrer Stelle', await tx(page, 's_a') in ('none', 'matrix(1, 0, 0, 1, 0, 0)'), await tx(page, 's_a'))

        # senkrechte Bewegung: nichts
        await swipe(page, 's_a', 8, dy=120, steps=8, dt=20)
        check('Senkrechte Bewegung: keine Wischgeste, nichts geändert', not await page.evaluate("document.querySelector('.shop-row.is-swiping') !== null") and (await item(page, 's_a'))['checked'] is False)

        # Zeile folgt dem Finger 1:1 (Wisch gehalten)
        await swipe(page, 's_b', 140, steps=8, dt=20, hold=True)
        m = await page.evaluate("(i) => new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.shop-row[data-id=\"' + i + '\"] .shop-row-fg')).transform).m41", 's_b')
        check('Zeile folgt dem Finger 1:1 (140 px)', abs(m - 140) < 2, str(m))
        info = await page.evaluate("""() => { const r = document.querySelector('.shop-row[data-id="s_b"]'); const bg = r.querySelector('.shop-swipe-bg--ok'); const s = getComputedStyle(bg);
          return { swiping: r.classList.contains('is-swiping'), armed: r.classList.contains('is-armed'), disp: s.display, bgc: s.backgroundColor, del: getComputedStyle(r.querySelector('.shop-swipe-bg--del')).display }; }""")
        check('Gehalten: Aktion darunter sichtbar (grün), über der Schwelle eingerastet', info['swiping'] and info['armed'] and info['disp'] == 'flex' and info['del'] == 'none', str(info))
        check('Mitten im Wisch kein seitlicher Überlauf (390)', await page.evaluate(OVERFLOW_JS) == [], str(await page.evaluate(OVERFLOW_JS)))
        await page.screenshot(path=os.path.join(SHOTS, 'b_390_hell_rechts.png'))
        await page.evaluate(RELEASE)
        await page.wait_for_function("(i) => (state.shopping.find(s => s.id === i) || {}).checked === true", arg='s_b', timeout=3000)
        check('Wisch nach rechts hakt ab', (await item(page, 's_b'))['checked'] is True)
        await page.wait_for_function("(i) => !document.querySelector('.shop-row[data-id=\"' + i + '\"]').classList.contains('is-swiping')", arg='s_b', timeout=3000)
        check('Nach dem Abhaken: Zeile zurück an ihrer Stelle', await tx(page, 's_b') in ('none', 'matrix(1, 0, 0, 1, 0, 0)'), await tx(page, 's_b'))
        # wieder nach rechts: Haken entfernen
        await swipe(page, 's_b', 200)
        await page.wait_for_function("(i) => (state.shopping.find(s => s.id === i) || {}).checked === false", arg='s_b', timeout=3000)
        check('Wisch nach rechts bei erledigter Zeile entfernt den Haken', (await item(page, 's_b'))['checked'] is False)

        # schneller Flick (kurze Strecke, hohe Geschwindigkeit) löst aus
        await swipe(page, 's_c', 80, steps=3, dt=15)
        await page.wait_for_function("(i) => (state.shopping.find(s => s.id === i) || {}).checked === true", arg='s_c', timeout=3000)
        check('Schneller Wisch (80 px, ca. 1.7 px/ms) hakt ab', (await item(page, 's_c'))['checked'] is True)
        await swipe(page, 's_c', 200)
        await page.wait_for_function("(i) => (state.shopping.find(s => s.id === i) || {}).checked === false", arg='s_c', timeout=3000)

        # kein Klick nach dem Wisch (Wisch beginnt auf dem Haken-Knopf)
        await swipe(page, 's_c', 200, startSel='.shop-check')
        await page.wait_for_function("(i) => (state.shopping.find(s => s.id === i) || {}).checked === true", arg='s_c', timeout=3000)
        await page.evaluate("() => document.querySelector('.shop-row[data-id=\"s_c\"] .shop-check').click()")   # der Klick, den der Browser nach dem Loslassen schickt
        await page.wait_for_timeout(300)
        check('Nach dem Wisch löst der Klick nichts aus (bleibt abgehakt)', (await item(page, 's_c'))['checked'] is True)
        await page.wait_for_timeout(600)
        # normaler Klick danach funktioniert wieder
        await page.click(row('s_c') + ' .shop-check')
        await page.wait_for_function("(i) => (state.shopping.find(s => s.id === i) || {}).checked === false", arg='s_c', timeout=3000)
        check('Haken-Knopf funktioniert weiter (echter Klick)', (await item(page, 's_c'))['checked'] is False)

        # Maus wischt nicht
        await swipe(page, 's_a', 250, type='mouse')
        await page.wait_for_timeout(300)
        check('Maus: kein Wischen', (await item(page, 's_a'))['checked'] is False and await page.evaluate("document.querySelector('.shop-row.is-swiping') === null"))

        # links = entfernen mit Rückgängig
        await swipe(page, 's_a', -200)
        await page.wait_for_function("(i) => !state.shopping.some(s => s.id === i)", arg='s_a', timeout=4000)
        check('Wisch nach links entfernt den Eintrag', await item(page, 's_a') is None)
        await page.wait_for_selector('.toast-action-btn', timeout=3000)
        toast = await page.inner_text('.toast')
        check('Meldung mit «Rückgängig» und Name', 'Milch' in toast and 'Rückgängig' in toast, toast)
        check('Lücke geschlossen: Zeile nicht mehr in der Liste', await page.evaluate("document.querySelector('.shop-row[data-id=\"s_a\"]') === null"))
        await page.click('.toast-action-btn')
        await page.wait_for_function("(i) => state.shopping.some(s => s.id === i)", arg='s_a', timeout=4000)
        back = await item(page, 's_a')
        check('Rückgängig stellt Name, Menge, Einheit, Haken wieder her', back == orig, str(back))
        await page.wait_for_selector(row('s_a'))
        check('Wiederhergestellte Zeile steht in der Liste', True)

        # Löschen ohne Wischen bleibt erreichbar: Menü «…» -> «Entfernen»
        await page.click(row('s_c') + ' [data-action="open-shop-item"]')
        await page.wait_for_selector('[data-action="delete-shopping-item"]')
        check('Löschen ohne Wischen erreichbar (Menü «…» -> Entfernen)', True)
        await page.keyboard.press('Escape')
        await page.evaluate("() => { state.modal = null; render(); }")
        check('Keine Seitenfehler (390 hell)', not errs, str(errs))
        await browser.close()

        # ---------- Bewegung reduziert: direkte Wirkung ----------
        browser, ctx = await open_ctx(p, 390, 844, motion="reduce")
        page = await ctx.new_page(); errs2 = []
        page.on('pageerror', lambda e: errs2.append(str(e)))
        await setup(page)
        await swipe(page, 's_a', 200)
        await page.wait_for_function("(i) => (state.shopping.find(s => s.id === i) || {}).checked === true", arg='s_a', timeout=3000)
        check('Reduzierte Bewegung: abhaken wirkt direkt, Zeile sofort zurück', await tx(page, 's_a') in ('none', 'matrix(1, 0, 0, 1, 0, 0)'))
        await swipe(page, 's_b', -200)
        await page.wait_for_function("(i) => !state.shopping.some(s => s.id === i)", arg='s_b', timeout=1500)
        check('Reduzierte Bewegung: Löschen wirkt direkt', True)
        check('Keine Seitenfehler (reduziert)', not errs2, str(errs2))
        await browser.close()

        # ---------- Dunkel 390 + Überlauf 320 / 1280, Bilder ----------
        for (w, h, theme, shot) in [(390, 844, 'dark', 'b_390_dunkel_links.png'), (320, 640, None, None), (1280, 800, None, 'b_1280_hell.png')]:
            browser, ctx = await open_ctx(p, w, h, motion="reduce")
            page = await ctx.new_page(); e3 = []
            page.on('pageerror', lambda e: e3.append(str(e)))
            await setup(page, theme)
            ov = await page.evaluate(OVERFLOW_JS)
            check(f'{w} px {theme or "hell"}: kein seitlicher Überlauf', ov == [], str(ov))
            if w < 768:
                await swipe(page, 's_b', -130, steps=8, dt=20, hold=True)
                ov2 = await page.evaluate(OVERFLOW_JS)
                check(f'{w} px {theme or "hell"}: mitten im Wisch kein Überlauf', ov2 == [], str(ov2))
                col = await page.evaluate("() => getComputedStyle(document.querySelector('.shop-row[data-id=\"s_b\"] .shop-swipe-bg--del')).backgroundColor")
                check(f'{w} px: Löschen-Fläche sichtbar gefärbt', col not in ('rgba(0, 0, 0, 0)', 'transparent'), col)
                if shot: await page.screenshot(path=os.path.join(SHOTS, shot))
                await page.evaluate(RELEASE.replace("'.shop-row .shop-text'", "'.shop-row[data-id=\"s_b\"] .shop-text'"))
            else:
                # Maus/Tablet breit: Zeilen unverändert bedienbar
                await page.click(row('s_a') + ' .shop-check')
                await page.wait_for_function("(i) => (state.shopping.find(s => s.id === i) || {}).checked === true", arg='s_a', timeout=3000)
                check('1280 px: Haken-Knopf funktioniert', True)
                if shot: await page.screenshot(path=os.path.join(SHOTS, shot))
            check(f'{w} px: keine Seitenfehler', not e3, str(e3))
            await browser.close()
    print('\nFEHLER:' if FAIL else '\nAlles bestanden', FAIL if FAIL else '')
    sys.exit(1 if FAIL else 0)
asyncio.run(main())
