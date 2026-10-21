"""v0.86.1: Rezeptansicht auf dem Handy (Rückmeldung iPhone).
- Reiterwechsel hinterlässt keine leere Fläche (keine angesammelte Mindesthöhe), klebende Reiter: Inhalt beginnt direkt darunter.
- Infozeile: keine Zeile beginnt mit einem sichtbaren Trennstrich.
- «½ TL Backpulver» ohne Mengenfeld: Menge in der Mengenspalte, Daten unverändert."""
import asyncio, sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

SETUP = """async () => { const r = Object.assign(emptyRecipe(), { id: 'v861', title: 'Cookies', servings: 4, difficulty: 'Mittel', totalTime: 15,
  ingredients: [['150','g','Butter'],['100','g','Zucker'],['2','','Eier'],['150','g','Mehl'],['','','½ TL Backpulver'],['','','½ TL Natron']].map(a => ({ amount: a[0], unit: a[1], name: a[2] })),
  steps: Array.from({ length: 14 }, (_, i) => ({ text: 'Schritt ' + (i + 1) + ': Butter und Zucker schaumig rühren, die restlichen Zutaten sorgfältig mischen und kurz ruhen lassen.' })), createdAt: Date.now(), updatedAt: Date.now() });
  await dbPut(r); state.recipes = state.recipes.filter(x => x.id !== r.id).concat([r]); state.activeRecipeId = 'v861'; state.view = 'detail'; state.detailTab = 'ingredients'; render(); }"""

async def main():
    async with async_playwright() as p:
        b, c = await open_ctx(p, 390, 844); page = await c.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.evaluate(SETUP); await page.wait_for_timeout(400)
        ing = await page.evaluate("Array.from(document.querySelectorAll('#panel-ingredients .ing-check')).slice(4).map(b => [b.querySelector('.ing-amount').textContent.trim(), b.querySelector('.ing-name').textContent.trim()])")
        check('«½ TL Backpulver»: Menge in der Mengenspalte', ing == [['½ TL', 'Backpulver'], ['½ TL', 'Natron']], str(ing))
        raw = await page.evaluate("state.recipes.find(r => r.id === 'v861').ingredients[4]")
        check('Rezeptdaten bleiben unverändert', raw['amount'] == '' and raw['name'] == '½ TL Backpulver', str(raw))
        starts = await page.evaluate("""() => { const kids = Array.from(document.querySelector('.detail-meta-v2').children); const tops = {}; kids.forEach(e => { const r = e.getBoundingClientRect(); const k = Math.round(r.top); if (!(k in tops) || r.left < tops[k]) tops[k] = r.left; });
          const content = document.querySelector('.detail-title-v2').getBoundingClientRect().left; return Object.values(tops).map(x => x - content); }""")
        check('Infozeile: Zeilenanfang ohne sichtbaren Trennstrich (Strich liegt links ausserhalb)', all(x < 0 for x in starts), str(starts))
        await page.evaluate("window.scrollTo(0, 700)"); await page.click('#tab-steps'); await page.wait_for_timeout(150)
        await page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)"); await page.wait_for_timeout(150)
        await page.click('#tab-ingredients'); await page.wait_for_timeout(250)
        g = await page.evaluate("""() => { const bar = document.querySelector('.tabbar-v2').getBoundingClientRect(); const first = document.querySelector('#panel-ingredients .ing-check').getBoundingClientRect();
          const p = document.getElementById('panel-ingredients'); const last = Array.from(p.querySelectorAll('.ing-check')).pop().getBoundingClientRect();
          return { gapTop: first.top - bar.bottom, panelH: p.getBoundingClientRect().height, contentH: last.bottom - p.getBoundingClientRect().top, vh: innerHeight }; }""")
        check('Reiterwechsel (klebend): Zutaten beginnen direkt unter den Reitern', 0 <= g['gapTop'] < 120, str(g))
        check('Reiterwechsel: höchstens Platz bis Bildschirmende reserviert, keine riesige Leerfläche', g['panelH'] - g['contentH'] < g['vh'], str(g))
        await page.click('#tab-steps'); await page.click('#tab-ingredients'); await page.click('#tab-steps'); await page.wait_for_timeout(150)
        mh = await page.evaluate("Array.from(document.querySelectorAll('.tab-panel')).filter(p => p.hidden && p.style.minHeight).length")
        check('Keine angesammelte Mindesthöhe in versteckten Reitern', mh == 0, str(mh))
        # v86.2: «Mehr Werte und Optionen» auf, ganz nach unten, wieder zu: keine leere Fläche, keine stehende Reservierung
        await page.evaluate("async () => { state.detailTab = 'ingredients'; render(); window.scrollTo(0, 0); }")
        await page.wait_for_timeout(150)
        await page.click('#tab-nutrition'); await page.wait_for_timeout(200)
        await page.evaluate("async () => { await hydrateNutritionCards(); }"); await page.wait_for_timeout(200)
        await page.evaluate("() => { const d = document.querySelector('#panel-nutrition details.nut-more'); d.open = true; }"); await page.wait_for_timeout(200)
        await page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)"); await page.wait_for_timeout(200)
        await page.evaluate("() => { document.querySelector('#panel-nutrition details.nut-more').open = false; }"); await page.wait_for_timeout(300)
        z = await page.evaluate("""() => { const p = document.getElementById('panel-nutrition'); const last = p.querySelector('details.nut-more').getBoundingClientRect();
          return { mh: p.style.minHeight, bottomGap: document.documentElement.scrollHeight - (scrollY + innerHeight), summaryInView: last.bottom > 0 && last.top < innerHeight, below: innerHeight - p.getBoundingClientRect().bottom }; }""")
        check('Zuklappen: keine stehende Reservierung, Seite endet am Bildschirmrand', z['mh'] == '' and z['bottomGap'] <= 1 and z['summaryInView'], str(z))
        # Reservierung nach Reiterwechsel schrumpft beim Hochscrollen
        await page.evaluate("async () => { state.detailTab = 'steps'; render(); }"); await page.wait_for_timeout(150)
        await page.evaluate("window.scrollTo(0, 200)"); await page.wait_for_timeout(100)
        await page.click('#tab-ingredients'); await page.wait_for_timeout(700)   # direkt nach dem Wechsel (500 ms) bleibt die Reservierung bewusst stehen
        r0 = await page.evaluate("parseFloat(document.getElementById('panel-ingredients').style.minHeight) || 0")
        for _ in range(4):
            await page.mouse.wheel(0, -120); await page.wait_for_timeout(120)
        r1 = await page.evaluate("parseFloat(document.getElementById('panel-ingredients').style.minHeight) || 0")
        check('Hochscrollen: reservierter Platz schrumpft', r0 > 0 and r1 < r0, f'{r0} -> {r1}')
        check('Keine JS-Fehler', not errs, str(errs))
        await b.close()
    print('\nFEHLGESCHLAGEN:', FAIL if FAIL else 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
