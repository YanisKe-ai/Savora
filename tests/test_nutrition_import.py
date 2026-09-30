"""Nährwerte nach dem Import: realistische Rezepttexte (Instagram, Chefkoch, WhatsApp, Schweiz, Englisch) werden über die Oberfläche importiert und automatisch zugeordnet."""
import asyncio, sys, json
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)
async def main():
    texts = json.load(open(_os.path.join(TESTS, 'data', 'import_texts.json'), encoding='utf-8'))
    phrases = [l.strip() for l in open(_os.path.join(TESTS, 'data', 'import_phrases.txt'), encoding='utf-8') if l.strip()]
    async with async_playwright() as p:
        b, c = await open_ctx(p, 390, 844); page = await c.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.wait_for_timeout(300)
        ev = page.evaluate
        # 1) Einzelne Zeilen wie beim Import: erkannt und berechenbar
        res = await ev("""async (lines) => { await ensureSwissDataSeeded(); const out = []; for (const line of lines) { const r = parseFreeTextRecipe('Test\\nZutaten\\n' + line + '\\nZubereitung\\nMischen und servieren, bis alles fertig ist.'); const raw = (r.ingredients || [])[0] || { amount: '', unit: '', name: '' }; const ing = Object.assign({}, raw, nutPrepareIngredient(raw)); const m = await matchIngredient(ing.name, []); const g = m.food ? resolveIngredientGrams(ing, m.food) : { grams: null }; const noAmt = (ing.amount === '' || ing.amount === null); out.push({ line, ok: m.status === 'matched' && (g.grams !== null || !!m.skipped || noAmt), food: m.food ? m.food.name : (m.skipped || null) }); } return out; }""", phrases)
        ok = sum(1 for r in res if r['ok'])
        check('Import-Zeilen: mindestens 97 % erkannt und berechenbar', ok / len(res) >= 0.97, f"{ok} von {len(res)}; offen: {[r['line'] for r in res if not r['ok']][:4]}")
        wrong = [(r['line'], r['food']) for r in res if ('olive oil' in r['line'].lower() and 'Olive,' in (r['food'] or '')) or ('eggs' in r['line'].lower() and 'Rührei' in (r['food'] or '')) or ('ground beef' in r['line'].lower() and 'Bolognese' in (r['food'] or '')) or ('Thon' in r['line'] and 'öl' == (r['food'] or '').lower()[-2:])]
        check('Keine Fehlzuordnung (olive oil, eggs, ground beef, Thon im Öl)', not wrong, str(wrong))
        # 2) Ganze Texte ueber die Oberflaeche importieren, speichern, Reiter Naehrwerte oeffnen
        for key, text in texts.items():
            await ev("() => { state.view = 'paste-import'; state.modal = null; render(); }"); await page.wait_for_selector('#pasteText')
            await page.fill('#pasteText', text)
            await page.evaluate("document.querySelector('[data-action=\"do-paste-import\"]').click()"); await page.wait_for_selector('#recipeForm', timeout=8000)
            await page.evaluate("document.querySelector('[data-action=\"save-recipe\"]').click()"); await page.wait_for_timeout(600)
            rid = await ev("state.recipes.slice().sort((a, b) => b.createdAt - a.createdAt)[0].id")
            await ev("(id) => { state.activeRecipeId = id; state.view = 'detail'; state.detailTab = 'nutrition'; state.modal = null; render(); }", rid)
            await page.wait_for_function("() => { const n = document.querySelector('[data-lazy-nutrition]'); return n && !n.classList.contains('nutrition-card-loading'); }", timeout=10000)
            txt = await ev("document.querySelector('#panel-nutrition').innerText")
            check(f'Import {key}: Nährwerte erscheinen automatisch und vollständig', 'kcal' in txt and 'Unvollständig' not in txt and 'Noch nicht berechnet' not in txt, txt.replace('\\n', ' ')[:140])
        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await b.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
