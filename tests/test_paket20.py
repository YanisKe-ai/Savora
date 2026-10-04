"""Paket 20: neues Logo, klar getrennte Kopfzeile, Kochbuch-PDF (Nummern, Inhaltsverzeichnis), Timer-Leiste zentriert."""
import asyncio, sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)
async def main():
    async with async_playwright() as p:
        b, c = await open_ctx(p, 390, 844); page = await c.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(400)
        ev = page.evaluate
        head = await ev("""() => { const t = document.querySelector('.topbar'); const i = document.querySelector('.brand-mark2'); const h = document.querySelector('.page-title'); const tr = t.getBoundingClientRect(), hr = h.getBoundingClientRect();
          return { icon: !!i, border: getComputedStyle(t).borderBottomWidth, gap: Math.round(hr.top - tr.bottom), wm: parseFloat(getComputedStyle(document.querySelector('.brand-word')).fontSize), pt: parseFloat(getComputedStyle(h).fontSize) }; }""")
        check('Kopfzeile: Logo, keine harte Linie, Abstand zum Seitentitel', head['icon'] and head['border'] == '0px' and head['gap'] >= 14, str(head))
        check('Wortmarke deutlich kleiner als der Seitentitel', head['wm'] < head['pt'], str(head))
        res = await ev("""async () => { const r = state.recipes.find(x => x.id === 'r_legacy_1'); const out = await buildSinglePdf(r.id, 'off'); return { size: out && out.blob.size, name: out && out.filename }; }""")
        check('Einzelrezept-PDF wird erzeugt', res['size'] and res['size'] > 5000, str(res))
        res = await ev("""async () => { const cb = await buildCookbookPdf('off'); return cb && cb.blob.size; }""")
        check('Kochbuch-PDF wird erzeugt', res and res > 5000, str(res))
        html = await ev("""() => { const r = state.recipes.find(x => x.id === 'r_legacy_1'); const m = pdfBuildModel(r, null); return pvStepUnits(m.steps).map(u => u.html).join(''); }""")
        check('PDF-Schritte haben nummerierte Einträge (01, 02 ...)', html.count('class="pv-step-no"') >= 2 and '>01<' in html)
        toc = await ev("""() => { const d = document.createElement('div'); d.innerHTML = '<section class="pv-page pv-tpl-a"><div class="pv-toc-row"><span class="pv-toc-name">Titel</span></div></section>'; document.body.appendChild(d); const v = getComputedStyle(d.querySelector('.pv-toc-name')).overflow; d.remove(); return v; }""")
        check('Inhaltsverzeichnis schneidet Titel nicht ab', toc == 'visible', toc)
        await ev("() => { state.activeRecipeId = state.recipes.find(x => x.id === 'r_legacy_1').id; state.view = 'cookmode'; state.cookStepIndex = 1; state.cookFinished = false; render(); }"); await page.wait_for_timeout(300)
        await ev("() => { const b = document.querySelector('.timer-chip'); if (b) b.click(); }"); await page.wait_for_timeout(1200)
        pos = await ev("""() => { const it = document.querySelector('.cook-timer-item'); if (!it) return null; const r = it.getBoundingClientRect(); const go = it.querySelector('.cook-timer-go b').getBoundingClientRect(); const pl = it.querySelector('.cook-timer-plus').getBoundingClientRect(); const mid = r.top + r.height / 2; return { dGo: Math.abs((go.top + go.height / 2) - mid), dPlus: Math.abs((pl.top + pl.height / 2) - mid) }; }""")
        check('Timer-Leiste: Zeit und "+1 Min." vertikal mittig', pos and pos['dGo'] < 1.5 and pos['dPlus'] < 1.5, str(pos))
        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await b.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
