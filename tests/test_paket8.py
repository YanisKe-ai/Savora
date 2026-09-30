"""Paket 8: Feinschliff (Formular-Schritte, Knoepfe ohne Umbruch, Erinnerung kompakt, Wortlaut)."""
import asyncio, sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

async def main():
    async with async_playwright() as p:
        for w in (320, 390):
            browser, ctx = await open_ctx(p, w, 800)
            page = await ctx.new_page(); errs = []
            page.on('pageerror', lambda e: errs.append(str(e)))
            await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(400)
            for step in range(5):
                await page.evaluate(f"() => {{ state.editingRecipe = JSON.parse(JSON.stringify(state.recipes[0])); state.formStep = {step}; state.view = 'form'; render(); }}"); await page.wait_for_timeout(250)
                g = await page.evaluate("""() => { const st = document.querySelector('.form-stepper'); const btns = Array.from(st.querySelectorAll('.form-step-btn'));
                  const sr = st.getBoundingClientRect(); const actBtn = st.querySelector('.is-active').getBoundingClientRect();
                  const activeIn = actBtn.left >= sr.left - 0.5 && actBtn.right <= sr.right + 0.5;
                  const inside = innerWidth >= 360 ? btns.every(b => { const r = b.getBoundingClientRect(); return r.left >= -0.5 && r.right <= innerWidth + 0.5 }) : activeIn;
                  const act = st.querySelector('.is-active .form-step-label'); const names = btns.map(b => b.textContent.replace(/\\s+/g, ' ').trim());
                  return { inside, activeVisible: !!act && act.getBoundingClientRect().width > 20, small: btns.filter(b => b.getBoundingClientRect().width < 43.5 || b.getBoundingClientRect().height < 43.5).length, names, ov: document.documentElement.scrollWidth - innerWidth } }""")
                check(f'{w} px, Schritt {step + 1}: alle 5 Schritte sichtbar (320 px: aktiver sichtbar), aktiver mit Namen, Tippflächen mind. 44 px', g['inside'] and g['activeVisible'] and g['small'] == 0 and g['ov'] <= 0, str(g))
            check(f'{w} px: Screenreader kennen alle Schrittnamen', [n.replace(' ', '') for n in g['names']] == ['1Basis', '2Kategorien', '3Zutaten', '4Zubereitung', '5Kontrolle'], str(g['names']))
            btn = await page.evaluate("(() => { const b = document.querySelector('.form-actions .primary-btn'); const r = b.getBoundingClientRect(); return { h: r.height, text: b.textContent.trim() } })()")
            check(f'{w} px: "Rezept speichern" bleibt einzeilig', btn['h'] < 64 and btn['text'] == 'Rezept speichern', str(btn))
            await page.evaluate("() => { state.activeRecipeId='r_legacy_1'; state.view='detail'; state.detailTab='ingredients'; state.modal={type:'pdf-export', target:'single', recipeId:'r_legacy_1', stage:'options', nutritionDetail:'off'}; render(); }"); await page.wait_for_timeout(300)
            pb = await page.evaluate("(() => { const b = document.querySelector('.modal-sheet .form-actions .primary-btn'); return b.getBoundingClientRect().height })()")
            check(f'{w} px: "PDF erstellen" bleibt einzeilig', pb < 64, str(pb))
            await page.evaluate("() => { state.modal = null; localStorage.removeItem('savora-backup-nudge-until'); state.lastBackupAt = null; state.view='home'; render(); }"); await page.wait_for_timeout(300)
            nh = await page.evaluate("document.querySelector('.nudge-card').getBoundingClientRect().height")
            check(f'{w} px: Sicherungs-Erinnerung höchstens 130 px hoch', nh <= 130, f'{nh:.0f}')
            if w == 390:
                await page.evaluate("() => { state.view='settings-sync'; render(); }"); await page.wait_for_timeout(200)
                t = await page.evaluate("document.querySelector('.settings-page, main').innerText")
                check('Sync-Text ohne holprige Doppelung', 'gleich und sind' not in t and 'sofort da' in t)
            check(f'{w} px: keine Seitenfehler', not errs, str(errs[:3]))
            await browser.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
