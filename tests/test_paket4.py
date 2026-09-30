"""Paket 4: Zutatenzeile (Menge, Einheit, Name) und Dialog "Mehrere Zutaten einfuegen"."""
import asyncio, json, sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

CASES = [
    ('250 g Mehl', ['250', 'g', 'Mehl']), ('½ TL Salz', ['0.5', 'TL', 'Salz']), ('1 1/2 EL Öl', ['1 1/2', 'EL', 'Öl']),
    ('2-3 Zwiebeln', ['2-3', '', 'Zwiebeln']), ('ca. 200 ml Milch', ['200', 'ml', 'Milch']), ('1 Prise Salz', ['1', 'Prise', 'Salz']),
    ('3 Eier', ['3', '', 'Eier']), ('Salz', ['', '', 'Salz']), ('- 200 g Butter', ['200', 'g', 'Butter']), ('200g Mehl', ['200', 'g', 'Mehl']),
    ('1,5 l Wasser', ['1.5', 'l', 'Wasser']), ('1 Dose Tomaten (400 g)', ['1', 'Dose', 'Tomaten (400 g)']), ('2', ['', '', '2']),
    ('2 EL Öl, kalt gepresst', ['2', 'EL', 'Öl, kalt gepresst']), ('1 ¾ Tassen Zucker', ['1.75', 'Tassen', 'Zucker']),
]
async def main():
    async with async_playwright() as p:
        browser, ctx = await open_ctx(p, 390, 844)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page)
        # Parser
        for text, exp in CASES:
            got = await page.evaluate("(t) => { const r = ingPasteParse(t).items[0]; return r ? [r.amount, r.unit, r.name] : null }", text)
            check(f'Parser: "{text}"', got == exp, str(got))
        g = await page.evaluate("ingPasteParse('Teig:\\n250 g Mehl\\nFüllung:\\n2 EL Öl\\n\\n1 Ei')")
        check('Gruppen: Überschriften werden zu Gruppen, Leerzeilen ignoriert', g['groups'] == 2 and [i.get('group') for i in g['items']] == ['Teig', 'Füllung', 'Füllung'], str(g))

        # Formular oeffnen (neues Rezept, Schritt Zutaten)
        await page.evaluate("() => { state.editingRecipe = emptyRecipe(); if (!state.editingRecipe.ingredients.length) state.editingRecipe.ingredients.push({ amount: '', unit: '', name: '' }); state.formStep = 2; state.view = 'form'; state.activeRecipeId = null; render(); }")
        await page.wait_for_selector('#ingRows')
        await page.fill('.ing-name-input', 'Vorhanden'); await page.fill('.ing-amount-input', '1')
        await page.evaluate("document.querySelector('[data-action=\"open-ing-paste\"]').click()"); await page.wait_for_selector('#ingPasteText')
        check('Dialog zeigt Hinweis vor der Eingabe', 'Zutatenliste' in await page.evaluate("document.querySelector('.modal-sheet').innerText"))
        await page.fill('#ingPasteText', 'Teig:\n250 g Mehl\n½ TL Salz\n1 Ei\nFüllung:\n2 EL Öl\n100 g Zucker')
        await page.wait_for_timeout(150)
        prev = await page.evaluate("document.getElementById('ingPastePreview').innerText")
        check('Vorschau nennt Anzahl und Gruppen', '5 Zutaten, 2 Gruppen erkannt' in prev, prev[:80])
        await page.evaluate("document.querySelector('[data-action=\"ing-paste-apply\"]').click()"); await page.wait_for_timeout(400)
        rows = await page.evaluate("Array.from(document.querySelectorAll('#ingRows [data-ing-row]')).map(r => [r.querySelector('.ing-amount-input').value, r.querySelector('.ing-unit-input').value, r.querySelector('.ing-name-input').value])")
        groups = await page.evaluate("Array.from(document.querySelectorAll('#ingRows .group-name-input')).map(i => i.value)")
        check('Bestehende Zutat bleibt, neue werden angehängt', rows[0] == ['1', '', 'Vorhanden'] and len(rows) == 6 and rows[1] == ['250', 'g', 'Mehl'] and rows[2] == ['0.5', 'TL', 'Salz'], str(rows))
        check('Gruppen erscheinen als Gruppenzeilen', groups == ['Teig', 'Füllung'], str(groups))
        check('Dialog ist geschlossen', await page.evaluate("!state.modal && !document.querySelector('#ingPasteText')"))

        # Speichern und aus der Datenbank pruefen
        await page.evaluate("document.getElementById('f-title').value = 'Einfüge-Test'")
        await page.evaluate("document.querySelector('.topbar [data-action=\"save-recipe\"]').click()"); await page.wait_for_timeout(700)
        saved = await page.evaluate("dbGetAll().then(l => l.find(r => r.title === 'Einfüge-Test'))")
        ing = saved['ingredients'] if saved else []
        check('Gespeichert mit Mengen, Einheiten und Gruppen', len(ing) == 6 and ing[2].get('group') == 'Teig' and ing[5].get('group') == 'Füllung' and ing[3]['name'] == 'Ei', str([(i['amount'], i['unit'], i['name'], i.get('group')) for i in ing]))

        # Reihenfolge und Layout der Zeile
        async def geo(width):
            await page.set_viewport_size({'width': width, 'height': 844})
            await page.evaluate("() => { state.editingRecipe = emptyRecipe(); if (!state.editingRecipe.ingredients.length) state.editingRecipe.ingredients.push({ amount: '', unit: '', name: '' }); state.formStep = 2; state.view = 'form'; render(); }"); await page.wait_for_timeout(300)
            return await page.evaluate("""() => { const r = document.querySelector('[data-ing-row]'); const q = s => r.querySelector(s).getBoundingClientRect();
              const a = q('.ing-amount-input'), u = q('.ing-unit-input'), n = q('.ing-name-input'), rm = q('.repeat-row-remove');
              return { a: [a.left, a.top, a.height], u: [u.left, u.top], n: [n.left, n.top, n.width], rm: [rm.width, rm.height], ov: document.documentElement.scrollWidth - document.documentElement.clientWidth } }""")
        s = await geo(390)
        check('Schmal (390 px): Menge und Einheit oben, Name darunter', s['a'][0] < s['u'][0] and s['n'][1] > s['a'][1] + 20 and s['ov'] <= 0, str(s))
        w = await geo(800)
        check('Breit (800 px): Menge, Einheit, Name in einer Zeile in dieser Reihenfolge', w['a'][0] < w['u'][0] < w['n'][0] and abs(w['n'][1] - w['a'][1]) < 4 and w['n'][2] > 200, str(w))
        check('Tippflächen der Zeile mind. 44 px', s['a'][2] >= 43.5 and s['rm'][0] >= 43.5 and s['rm'][1] >= 43.5, str(s['rm']))
        n = await geo(320); check('320 px: kein Seitwärts-Scrollen', n['ov'] <= 0, str(n['ov']))
        # Dunkelmodus Vorschau lesbar (kein Ueberlauf)
        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await browser.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
