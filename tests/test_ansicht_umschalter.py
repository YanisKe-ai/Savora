"""Ansicht Umschalter (Handy): Liste oder Raster waehlbar.
Prueft: Umschalter in der Zeile «N Rezepte · Sortierung» bei 320/390/430 sichtbar (Namen «Listenansicht»/«Rasteransicht», aria-pressed, 44 px), Standard Liste,
Wahl bleibt nach Neuladen (gleicher Speicherort savora-home-layout), Raster hat 2 Spalten mit 4:3-Foto, Favorit oeffnet das Rezept nicht, kein Ueberlauf,
Hell/Dunkel; Tablet 820 und Desktop 1440 haben denselben Umschalter. Screenshots 390 (Liste/Raster, Hell/Dunkel)."""
import asyncio, sys, os
os.environ.setdefault('SAVORA_TEST_PORT', '12800')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)
SHOTS = os.environ.get('SAVORA_SHOTS_DIR')

async def new_page(p, w, h, scheme=None):
    b, ctx = await open_ctx(p, w, h, 'reduce'); page = await ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    await page.add_init_script("document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = 'html { scrollbar-width: none } html::-webkit-scrollbar { display: none }'; document.head.appendChild(s); });")
    await goto(page)
    await page.evaluate("() => document.fonts.ready.then(() => 1)")
    await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(400)
    return b, ctx, page, errs

async def shot(page, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True); await page.screenshot(path=os.path.join(SHOTS, name))

RESET = "() => { try { localStorage.removeItem('savora-home-layout'); } catch (e) {} state.homeLayoutChosen = false; state.homeLayout = 'grid'; resetExtraFilters(); state.query = ''; state.searchOpen = false; state.favOnly = false; state.modal = null; state.view = 'home'; render(); window.scrollTo(0, 0); }"
INFO = """() => { const t = document.querySelector('.layout-toggle'); if (!t) return null; const bs = [...t.querySelectorAll('.icon-toggle')].map(b => { const r = b.getBoundingClientRect(); return { n: b.getAttribute('aria-label'), p: b.getAttribute('aria-pressed'), w: r.width, h: r.height }; });
  const tr = t.getBoundingClientRect(), row = document.querySelector('.result-row').getBoundingClientRect(), W = document.documentElement.clientWidth;
  return { bs, inRow: tr.top >= row.top - 1 && tr.bottom <= row.bottom + 1, right: tr.right, W, rowH: row.height, sw: document.documentElement.scrollWidth <= W,
    rows: document.querySelectorAll('.rrow--phone').length, cards: document.querySelectorAll('.rcard--phone').length, grid: !!document.querySelector('.rgrid--phone') }; }"""

async def main():
    async with async_playwright() as p:
        for (w, h) in [(320, 640), (390, 844), (430, 932)]:
            b, ctx, page, errs = await new_page(p, w, h); ev = page.evaluate; tag = f'[{w}] '
            await ev(RESET)
            i = await ev(INFO)
            check(tag + 'Umschalter sichtbar mit Namen Listenansicht/Rasteransicht', i and [x['n'] for x in i['bs']] == ['Rasteransicht', 'Listenansicht'], str(i and i['bs']))
            check(tag + 'Standard ist Liste (aria-pressed)', i['bs'][1]['p'] == 'true' and i['bs'][0]['p'] == 'false' and i['rows'] > 0 and not i['grid'])
            check(tag + 'Touchflaeche mind. 44 px, im Zeilenbereich, rechts buendig', all(x['w'] >= 44 and x['h'] >= 44 for x in i['bs']) and i['inRow'] and i['W'] - i['right'] <= 20 + 1, f"{i['right']} {i['W']}")
            await page.click('[data-action="set-home-layout"][data-id="grid"]'); await page.wait_for_timeout(200)
            g = await ev("""() => { const c = [...document.querySelectorAll('.rcard--phone')]; const xs = new Set(c.map(e => Math.round(e.getBoundingClientRect().left))); const im = c.map(e => e.querySelector('.rcard-img')).filter(Boolean).map(e => { const r = e.getBoundingClientRect(); return r.width / r.height; });
              return { n: c.length, cols: xs.size, ratios: im.slice(0, 6), sw: document.documentElement.scrollWidth <= document.documentElement.clientWidth, nested: document.querySelectorAll('.rcard--phone button button').length, store: localStorage.getItem('savora-home-layout') }; }""")
            check(tag + 'Raster: zwei Spalten, 4:3-Fotos, kein verschachtelter Knopf, gespeichert', g['n'] > 0 and g['cols'] == 2 and all(abs(r - 4 / 3) < 0.05 for r in g['ratios']) and g['nested'] == 0 and g['store'] == 'grid', str(g))
            check(tag + 'Raster: kein horizontaler Ueberlauf', g['sw'])
            i2 = await ev(INFO)
            check(tag + 'Raster aktiv: aria-pressed folgt', i2['bs'][0]['p'] == 'true' and i2['bs'][1]['p'] == 'false' and i2['sw'])
            await page.reload(); await page.wait_for_timeout(700)
            i3 = await ev(INFO)
            check(tag + 'Wahl bleibt nach Neuladen (Raster)', i3 and i3['grid'] and i3['cards'] > 0)
            if w == 390:
                # Favorit oeffnet Rezept nicht
                before = await ev("() => { const r = state.recipes.find(x => x.id === document.querySelector('.rcard--phone .fav-toggle').dataset.id); return { id: r.id, fav: !!r.favorite, view: state.view }; }")
                await page.click('.rcard--phone .fav-toggle'); await page.wait_for_timeout(300)
                after = await ev("(id) => ({ fav: !!state.recipes.find(x => x.id === id).favorite, view: state.view })", before['id'])
                check('[390] Favorit im Raster schaltet um und oeffnet das Rezept nicht', after['fav'] != before['fav'] and after['view'] == 'home', str((before, after)))
                await page.click('.rcard--phone .rcard-main'); await page.wait_for_timeout(300)
                check('[390] Tippen auf Karte oeffnet das Rezept', await ev("() => state.view") == 'detail')
                await ev("() => { state.view = 'home'; render(); }")
                # Platzhalter und lange Titel
                await ev("""() => { const r = emptyRecipe(); r.id = 'lang_1'; r.title = 'TEST: Ein ausserordentlich langer Rezepttitel ohne Foto mit Donaudampfschifffahrtsgesellschaftskapitaen'; r.timeMinutes = 0; r.ingredients = []; r.steps = []; state.recipes.unshift(r); state.sortBy = 'updated'; state.view = 'home'; render(); }""")
                ph = await ev("""() => { const c = document.querySelector('.rcard--phone'); const t = c.querySelector('.rcard-title').getBoundingClientRect(); const cr = c.getBoundingClientRect(); const ph = c.querySelector('.rcard-ph'); return { hasPh: !!ph, time: !!c.querySelector('.rcard-meta--time'), inside: t.right <= cr.right + 1 && t.left >= cr.left - 1, sw: document.documentElement.scrollWidth <= document.documentElement.clientWidth }; }""")
                check('[390] Ohne Foto: ruhiger Platzhalter, keine Zeit, langer Titel bleibt in der Karte', ph['hasPh'] and not ph['time'] and ph['inside'] and ph['sw'], str(ph))
                await ev("() => { state.recipes = state.recipes.filter(r => r.id !== 'lang_1'); render(); }")
                # Tippen auf Liste zurueck
                await page.click('[data-action="set-home-layout"][data-id="list"]'); await page.wait_for_timeout(200)
                await page.reload(); await page.wait_for_timeout(700)
                i4 = await ev(INFO)
                check('[390] Zurueck auf Liste, bleibt nach Neuladen', i4['rows'] > 0 and not i4['grid'])
                # bestehende gespeicherte Wahl 'list' bleibt gueltig; 'grid' ebenfalls
                await ev("() => { localStorage.setItem('savora-home-layout', 'grid'); }"); await page.reload(); await page.wait_for_timeout(700)
                check('[390] Bestehende gespeicherte Wahl «grid» zeigt Raster', (await ev(INFO))['grid'])
                await ev(RESET)
                for scheme in ['light', 'dark']:
                    await ev("(s) => { document.documentElement.setAttribute('data-theme', s); }", scheme)
                    for lay in ['list', 'grid']:
                        await page.click(f'[data-action="set-home-layout"][data-id="{lay}"]'); await page.wait_for_timeout(250)
                        await ev("() => window.scrollTo(0, 0)")
                        await shot(page, f'ansicht-390-{lay}-{scheme}.png')
                        ok = await ev("() => document.documentElement.scrollWidth <= document.documentElement.clientWidth")
                        check(f'[390] {scheme}/{lay}: kein Ueberlauf', ok)
                await ev("() => document.documentElement.removeAttribute('data-theme')")
            check(tag + 'Keine JS-Fehler', not errs, str(errs))
            await b.close()
        for (w, h) in [(820, 1180), (1440, 900)]:
            b, ctx, page, errs = await new_page(p, w, h); ev = page.evaluate; tag = f'[{w}] '
            await ev(RESET)
            i = await ev(INFO)
            check(tag + 'Umschalter vorhanden, gleiche Namen, gleiche Symbole', i and [x['n'] for x in i['bs']] == ['Rasteransicht', 'Listenansicht'] and i['sw'], str(i and i['bs']))
            check(tag + 'Standard Raster', i['bs'][0]['p'] == 'true' and await ev("!!document.querySelector('.rgrid') && !document.querySelector('.rgrid--phone')"))
            await page.click('[data-action="set-home-layout"][data-id="list"]'); await page.wait_for_timeout(200)
            check(tag + 'Liste waehlbar und gespeichert', await ev("localStorage.getItem('savora-home-layout')") == 'list' and await ev("document.querySelectorAll('.rrow').length") > 0)
            await b.close()
    print('\nFEHLER: ' + str(FAIL) if FAIL else '\nAlle Pruefungen bestanden')
    sys.exit(1 if FAIL else 0)
asyncio.run(main())
