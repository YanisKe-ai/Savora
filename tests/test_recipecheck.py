"""Rezeptprüfung: Hinweise und einzeln übernehmbare Vorschläge, nichts wird automatisch geändert."""
import asyncio, sys, json
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)
FX = json.load(open(_os.path.join(TESTS, 'data', 'export_fixtures.json')))
async def main():
    async with async_playwright() as p:
        b, c = await open_ctx(p, 390, 844); page = await c.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.wait_for_timeout(300)
        ev = page.evaluate
        await ev("""async (fx) => { for (const f of fx) { const r = Object.assign(emptyRecipe(), f); r.updatedAt = 1; await dbPut(r); }
          const e = Object.assign(emptyRecipe(), { id: 'fx_emptyhead', title: 'Leere Überschrift', steps: [{ text: 'Kombinieren' }, { text: '' }] }); await dbPut(e); await loadRecipes(); }""", FX)
        ids = await ev("(id) => recipeQualityIssues(state.recipes.find(r => r.id === id)).map(i => i.id)", 'fx_cookies')
        check('Cookies: Hinweise zu Aufbewahrung, Quelle und Stückzahl erkannt', any(i.startswith('tip-step') for i in ids) and any(i.startswith('source-step') for i in ids) and 'yield-pieces' in ids, str(ids))
        check('Leere Überschrift wird gemeldet', any(i.startswith('empty-heading') for i in await ev("() => recipeQualityIssues(state.recipes.find(r => r.id === 'fx_emptyhead')).map(i => i.id)")))
        check('Salz/Pfeffer ohne Menge ist kein Fehler (Carbonara)', 'no-amounts' not in await ev("() => recipeQualityIssues(state.recipes.find(r => r.id === 'fx_carbonara')).map(i => i.id)"))
        before = await ev("() => JSON.stringify(state.recipes.find(r => r.id === 'fx_cookies'))")
        await ev("() => { recipeQualityIssues(state.recipes.find(r => r.id === 'fx_cookies')); }")
        check('Die Prüfung allein ändert nichts am Rezept', before == await ev("() => JSON.stringify(state.recipes.find(r => r.id === 'fx_cookies'))"))
        # Vorschlag einzeln uebernehmen: Ausbeute
        await ev("async () => { await applyRecipeFix('fx_cookies', 'yield-pieces'); }")
        r = await ev("() => { const r = state.recipes.find(x => x.id === 'fx_cookies'); return { mode: r.servingMode, servings: r.servings, steps: r.steps.length, notes: r.notes, source: r.source }; }")
        check('Nur der gewählte Vorschlag wird angewendet (Ausbeute), Schritte unverändert', r['mode'] == 'pieces' and r['servings'] == 20 and r['steps'] == 6 and not r['notes'], str(r))
        # Hinweis in Notizen verschieben: Wortlaut bleibt erhalten
        tipid = [i for i in await ev("() => recipeQualityIssues(state.recipes.find(r => r.id === 'fx_cookies')).map(i => i.id)") if i.startswith('tip-step')][0]
        await ev("(i) => applyRecipeFix('fx_cookies', i)", tipid)
        r = await ev("() => { const r = state.recipes.find(x => x.id === 'fx_cookies'); return { n: r.steps.length, notes: r.notes }; }")
        check('Hinweis landet mit Originaltext in den Notizen, ein Schritt weniger', r['n'] == 5 and ('Haltbarkeit' in r['notes'] or 'Einfrieren' in r['notes']), str(r))
        html = await ev("() => recipeCheckHtml(state.recipes.find(r => r.id === 'fx_cookies'))")
        check('Detailseite zeigt die Hinweise als aufklappbaren Bereich', 'recipe-check' in html and 'rc-apply' in html)
        cook = await ev("() => cookSteps(state.recipes.find(r => r.id === 'fx_cookies')).some(s => /^Quelle/i.test(s.text))")
        check('Quellenzeile erscheint nicht als Kochschritt', cook is False)
        check('Neue Rezepte haben keine erfundene Schwierigkeit', await ev("() => emptyRecipe().difficulty === ''"))
        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await b.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
