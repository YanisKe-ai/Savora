"""Laptop: Platz und Abstaende (ab 1024 px). Prueft bei 1024, 1280, 1440 und 1920 px (Hell) alle Hauptseiten mit Testdaten:
kein horizontaler Ueberlauf, gleiche Seitenraender auf allen Seiten (mit Seitenleiste), Inhaltsbreite nutzt die Breite
(mindestens 88 % des Platzes neben der Seitenleiste), gleiche Titelhoehe und Titelgroesse, Abstand Titel zum Inhalt in der
Abstandsskala (24 bis 32 px), Raster mit genug Spalten und Karten, Editor und Import mit Haupt- und Seitenspalte.
Das Handy und das Tablet (unter 1024 px) prueft test_paket42 (phones) pixelgenau."""
import asyncio, sys, os
os.environ.setdefault('SAVORA_TEST_PORT', '9951')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
import paket42_shots as P
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

SIZES = [(1024, 768), (1280, 800), (1440, 900), (1920, 1080)]
NAV = 232
# Seiten mit Seitenleiste: Name -> (JS, hat grossen Seitentitel in der Seite)
PAGES = {
    'home': ("state.view='home';state.homeLayout='grid'", True),
    'home-list': ("state.view='home';state.homeLayout='list'", True),
    'mealplan': ("state.view='mealplan'", True),
    'shopping': ("state.view='shopping'", True),
    'cookbooks': ("state.view='cookbooks'", True),
    'settings': ("state.view='settings'", True),
    'settings-data': ("state.view='settings-data'", False),
    'settings-display': ("state.view='settings-display'", False),
    'detail': ("state.view='detail';state.activeRecipeId='r_legacy_1';state.detailTab='ingredients'", False),
    'cookbook1': ("state.view='cookbook';state.cookbookStep=1", False),
    'cookbook2': ("state.view='cookbook';state.cookbookStep=2", False),
}
NO_NAV = {'edit-0': "openForm(JSON.parse(JSON.stringify(state.recipes.find(r=>r.id==='r_legacy_1')))); state.formStep=0", 'import': "state.view='paste-import'"}
EMPTY = {'empty-home': "state.view='home'", 'empty-shopping': "state.view='shopping'", 'empty-mealplan': "state.view='mealplan'", 'empty-cookbooks': "state.view='cookbooks'"}

M = """() => { const m = document.querySelector('main'); const cs = getComputedStyle(m); const r = m.getBoundingClientRect();
  const left = r.left + parseFloat(cs.paddingLeft), right = r.right - parseFloat(cs.paddingRight);
  const t = document.querySelector('main .page-title, .home-head .page-title');
  let title = null; if (t) { const q = t.getBoundingClientRect(); const row = t.closest('.page-title-row') || t; const rr = row.getBoundingClientRect();
    let nxt = row.nextElementSibling; if (!nxt) { const hb = row.parentElement; nxt = null; }
    title = { l: q.left, top: q.top, h: q.height, fs: parseFloat(getComputedStyle(t).fontSize), rowBottom: rr.bottom, gap: nxt ? nxt.getBoundingClientRect().top - rr.bottom : null }; }
  const nav = document.querySelector('.bottom-nav'); const nr = nav ? nav.getBoundingClientRect() : null;
  const tt = document.querySelector('.topbar .topbar-title'); const ttr = tt ? tt.getBoundingClientRect() : null;
  return { left, right, W: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth, title, navW: nr ? nr.width : 0, tt: ttr ? { top: ttr.top, h: ttr.height } : null }; }"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for (w, h) in SIZES:
            tag = f'{w}: '
            gutter = min(64, max(32, 0.034 * w))
            ctx, page, errs, lid = await P.new_page(b, w, h, 'light', True)
            await page.add_init_script("document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = 'html { scrollbar-width: none } html::-webkit-scrollbar { display: none }'; document.head.appendChild(s); });")
            await page.add_style_tag(content='html { scrollbar-width: none } html::-webkit-scrollbar { display: none }')
            await page.evaluate("() => document.fonts.ready.then(() => 1)")
            res = {}
            async def go(js, name):
                await page.evaluate("() => { " + js + "; render(); }"); await page.wait_for_timeout(350)
                await page.evaluate("() => window.scrollTo(0,0)")
                res[name] = await page.evaluate(M)
            for n, (js, _) in PAGES.items(): await go(js, n)
            for n, js in NO_NAV.items(): await go(js, n)
            await ctx.close()
            ctx, page, errs, _ = await P.new_page(b, w, h, 'light', False)
            await page.add_style_tag(content='html { scrollbar-width: none } html::-webkit-scrollbar { display: none }')
            await page.evaluate("() => document.fonts.ready.then(() => 1)")
            for n, js in EMPTY.items(): await go(js, n)
            await ctx.close()

            # 1. kein horizontaler Ueberlauf
            for n, r in res.items(): check(tag + n + ': kein horizontaler Ueberlauf', r['sw'] <= r['W'], f"{r['sw']} > {r['W']}")
            # 2. gleiche Seitenraender (Seitenleiste vorhanden): links und rechts, auf allen Seiten gleich
            navpages = [n for n in res if n not in NO_NAV]
            lefts = {n: round(res[n]['left'] - NAV, 1) for n in navpages}
            rights = {n: round(res[n]['W'] - res[n]['right'], 1) for n in navpages}
            check(tag + 'Seitenrand links auf allen Seiten gleich (' + str(round(gutter)) + ' px)', max(lefts.values()) - min(lefts.values()) <= 1 and abs(min(lefts.values()) - gutter) <= 1.5, str(lefts))
            check(tag + 'Seitenrand rechts auf allen Seiten gleich', max(rights.values()) - min(rights.values()) <= 1 and abs(min(rights.values()) - gutter) <= 1.5, str(rights))
            # 3. Inhaltsbreite nutzt den Platz
            for n in navpages:
                cw = res[n]['right'] - res[n]['left']; avail = res[n]['W'] - NAV
                check(tag + n + ': Inhaltsbreite mind. 88 % des Platzes neben der Seitenleiste', cw >= 0.88 * avail, f'{round(cw)} von {avail}')
            for n in NO_NAV:
                cw = res[n]['right'] - res[n]['left']
                check(tag + n + ': Inhaltsbreite mind. 85 % der Fensterbreite (ohne Seitenleiste)', cw >= 0.85 * w and res[n]['left'] >= gutter - 1, f"{round(cw)} von {w}, Rand {round(res[n]['left'])}")
            # 4. Titelhoehe und Titelgroesse gleich auf den Hauptseiten
            tp = [n for n in ('home', 'home-list', 'mealplan', 'shopping', 'cookbooks', 'settings', 'empty-home', 'empty-shopping', 'empty-mealplan', 'empty-cookbooks') if res[n]['title']]
            tops = {n: round(res[n]['title']['top'], 1) for n in tp}; fss = {n: res[n]['title']['fs'] for n in tp}
            check(tag + 'Seitentitel auf allen Hauptseiten gleich hoch', max(tops.values()) - min(tops.values()) <= 1, str(tops))
            check(tag + 'Seitentitel auf allen Hauptseiten gleich gross (40 px)', set(fss.values()) == {40.0}, str(fss))
            check(tag + 'Seitentitel buendig mit dem Inhalt', all(abs(res[n]['title']['l'] - res[n]['left']) <= 1 for n in tp), str({n: round(res[n]['title']['l'] - res[n]['left'], 1) for n in tp}))
            # 5. Abstand Titel zum Inhalt in der Skala
            gaps = {n: round(res[n]['title']['gap'], 1) for n in tp if res[n]['title']['gap'] is not None}
            check(tag + 'Abstand Titel zum Inhalt in der Skala (24 bis 32 px)', all(24 <= g <= 32 for g in gaps.values()), str(gaps))
            # 6. Unterseiten: Titel in der Kopfzeile gleich hoch
            sub = {n: round(res[n]['tt']['top'], 1) for n in ('settings-data', 'settings-display') if res[n]['tt']}
            check(tag + 'Unterseiten der Einstellungen: Titel gleich hoch', len(set(sub.values())) == 1, str(sub))
        # 7. Raster: Spalten und Kartenbreite (nur Startseite)
            ctx, page, errs, lid = await P.new_page(b, w, h, 'light', True)
            await page.evaluate("async () => { for (let i = 0; i < 12; i++) { const r = emptyRecipe(); r.id = 'lp_' + i; r.title = 'TEST: Karte ' + i; r.servings = 2; r.ingredients = [{amount:'1', unit:'', name:'Z'}]; r.steps = [{text:'K'}]; await dbPut(r); } await loadRecipes(); state.view = 'home'; state.homeLayout = 'grid'; render(); }")
            await page.wait_for_timeout(400)
            g = await page.evaluate("() => { const c = [...document.querySelectorAll('.rgrid > *')].map(e => e.getBoundingClientRect()); const cols = getComputedStyle(document.querySelector('.rgrid')).gridTemplateColumns.split(' ').length; return { cols, w: c[0].width, gap: c[1].left - c[0].right }; }")
            exp = {1024: 3, 1280: 4, 1440: 4, 1920: 6}[w]
            check(tag + f'Raster: mindestens {exp} Spalten, Karten mind. 200 px breit, Abstand 24 px', g['cols'] >= exp and g['w'] >= 200 and abs(g['gap'] - 24) <= 1, str(g))
            await ctx.close()
        # 8. Editor und Import: Seitenspalte sichtbar, Hauptspalte breit
            ctx, page, errs, lid = await P.new_page(b, w, h, 'light', True)
            for js, hs, name in (("openForm(JSON.parse(JSON.stringify(state.recipes.find(r=>r.id==='r_legacy_1')))); state.formStep=0", '.form-aside', 'Editor'), ("state.view='paste-import'", '.import-help', 'Import')):
                await page.evaluate("() => { " + js + "; render(); }"); await page.wait_for_timeout(300)
                cols = await page.evaluate("(s) => { const a = document.querySelector(s).getBoundingClientRect(); const m = document.querySelector('.form-page, .import-layout > .settings-group').getBoundingClientRect(); return { aside: a.width, main: m.width, gap: a.left - m.right }; }", hs)
                check(tag + name + ': Hauptspalte plus Seitenspalte, Hauptspalte breiter, Abstand 48 px', cols['aside'] >= 300 and cols['main'] > cols['aside'] * 1.8 and abs(cols['gap'] - 48) <= 2, str(cols))
            await ctx.close()
        await b.close()
    print('\n' + ('ALLE OK' if not FAIL else f'{len(FAIL)} FEHLER: ' + '; '.join(FAIL[:12])))
    sys.exit(1 if FAIL else 0)
asyncio.run(main())
