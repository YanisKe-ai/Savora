"""Handy (unter 768 px): Rezepte-Zeile 0.71.
Obere Zeile = Titel «Alle Rezepte» (ohne Pfeil, ohne Auswahl) und Lupe rechts. Zeile darunter: links «N Rezepte» und Sortierung (mit «Nur Favoriten»),
rechts der Umschalter Liste/Raster und direkt daneben der Filter (mind. 8 px Abstand). Alles in einer Zeile ohne Ueberlappung bei 320/360/390/430 px
(Reserve mind. 16 px zwischen Text und Knoepfen), Tippflaechen mind. 44 px, unter 360 px ein einzelner Wechsel-Knopf. Favoriten in der Sortierung,
Filterzaehler zaehlt Favoriten nicht. Mehr Abstand zur ersten Rezeptzeile. Logo auf allen fuenf Hauptseiten an gleicher Stelle."""
import asyncio, sys, os
os.environ.setdefault('SAVORA_TEST_PORT', '10900')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)
SHOTS = os.environ.get('SAVORA_SHOTS_DIR')
RESET = "() => { try { localStorage.removeItem('savora-home-layout'); } catch (e) {} state.homeLayoutChosen = false; state.homeLayout = 'grid'; resetExtraFilters(); state.query = ''; state.searchOpen = false; state.favOnly = false; state.sortBy = 'updated'; state.modal = null; state.view = 'home'; render(); window.scrollTo(0, 0); }"
GEO = """() => { const q = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
  const vp = q('.view-pick'), sb = q('#searchBtn'), tg = q('.layout-toggle'), sg = q('.layout-single'), fb = q('.filter-btn'), row = q('.result-row'), info = q('.result-info');
  const two = [...document.querySelectorAll('.layout-toggle .icon-toggle')].map(e => e.getBoundingClientRect());
  const tool = (tg && tg.width > 0 && two[0].width > 0) ? tg : sg;
  const textR = Math.max(...[...document.querySelectorAll('.result-info > *')].map(e => { const r = document.createRange(); r.selectNodeContents(e.querySelector('.inline-pick-text') || e); const b = r.getBoundingClientRect(); return b.width ? b.right : 0; }));
  const first = q('.rrow--phone, .rcard--phone'), W = innerWidth;
  const fv = getComputedStyle(document.querySelector('.filter-btn .filter-btn-text')).position;
  return { W, vpR: vp.right, vpT: vp.top, vpH: vp.height, sbL: sb.left, sbR: sb.right, sbT: sb.top, sbH: sb.height, tgL: tool.left, tgR: tool.right, tgW: tool.width, tgH: tool.height, single: tool === sg, twoW: two.map(r => r.width),
    fbL: fb.left, fbR: fb.right, fbW: fb.width, fbH: fb.height, fbT: fb.top, rowB: row.bottom, rowT: row.top, rowH: row.height, textR, firstT: first ? first.top : null, word: fv === 'static',
    sw: document.documentElement.scrollWidth <= document.documentElement.clientWidth, arrow: !!document.querySelector('.view-pick svg, #viewSelect'), title: document.querySelector('.view-pick').textContent.trim(),
    toggleInSort: !!document.querySelector('.sort-inline .layout-toggle'), fbName: document.querySelector('.filter-btn').textContent.trim() }; }"""
HEAD = """() => { const m = document.querySelector('.top-wordmark').getBoundingClientRect(); const t = document.querySelector('.page-title, .view-pick'); const r = document.createRange(); r.selectNodeContents(t.querySelector('.inline-pick-text') || t); return { wmT: m.top, wmW: m.width, wmH: m.height, wmMid: m.left + m.width / 2, W: document.documentElement.clientWidth, titleT: r.getBoundingClientRect().top }; }"""

async def new_page(p, w, h):
    b, ctx = await open_ctx(p, w, h); page = await ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    await page.add_init_script("document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = 'html { scrollbar-width: none } html::-webkit-scrollbar { display: none }'; document.head.appendChild(s); });")
    await goto(page); await page.evaluate("() => document.fonts.ready.then(() => 1)")
    await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(400)
    return b, ctx, page, errs
async def shot(page, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True); await page.screenshot(path=os.path.join(SHOTS, name))

async def main():
    async with async_playwright() as p:
        for (w, h) in [(320, 640), (360, 740), (390, 844), (430, 932)]:
            b, ctx, page, errs = await new_page(p, w, h); ev = page.evaluate; tag = f'[{w}] '
            await ev(RESET); await page.wait_for_timeout(200)
            g = await ev(GEO)
            check(tag + 'Titel «Alle Rezepte» ohne Pfeil und ohne Auswahl', g['title'] == 'Alle Rezepte' and not g['arrow'], str(g['title']))
            check(tag + 'Obere Zeile: Titel links, Lupe ganz rechts (16 px Rand, 44 px), gleiche Zeile, kein Ueberlappen', g['vpR'] <= g['sbL'] + 0.5 and abs(g['W'] - g['sbR'] - 16) <= 1 and abs(g['sbH'] - 44) <= 0.5 and abs((g['vpT'] + g['vpH'] / 2) - (g['sbT'] + g['sbH'] / 2)) <= 2, str(g))
            check(tag + 'Umschalter und Filter in der Zeile darunter, nicht mehr in der Sortier-Zeile', not g['toggleInSort'] and g['tgT' if False else 'tgL'] > 0 and g['fbT'] > g['sbT'] + 20, str(g))
            check(tag + 'Umschalter steht links NEBEN dem Filter, mind. 8 px Abstand, Filter ganz rechts (16 px Rand)', g['tgR'] <= g['fbL'] - 8 + 0.5 and abs(g['W'] - g['fbR'] - 16) <= 1, str(g))
            check(tag + 'Tippflaechen mind. 44 px (Umschalter, Filter)', g['tgH'] >= 44 and g['fbH'] >= 44 and g['fbW'] >= 44 and (g['single'] and g['tgW'] >= 44 or all(x >= 44 for x in g['twoW'])), str(g))
            check(tag + 'Reserve mind. 16 px zwischen Anzahl/Sortierung und den Knoepfen, nichts ueberlappt', g['tgL'] - g['textR'] >= 16, f"{g['tgL'] - g['textR']:.1f}")
            check(tag + 'Unter 360 px ein einzelner Wechsel-Knopf, sonst zwei', g['single'] == (w < 360), str(g['single']))
            check(tag + 'Wort «Filter» sichtbar ab 400 px (sonst nur Symbol), Name bleibt', g['word'] == (w >= 400) and g['fbName'] == 'Filter', f"{g['word']} {g['fbName']}")
            check(tag + 'Kein horizontaler Ueberlauf', g['sw'])
            check(tag + 'Abstand Zeile zur ersten Rezeptzeile mind. 12 px (0.75 rem)', g['firstT'] - g['rowB'] >= 11.5, f"{g['firstT'] - g['rowB']:.1f}")
            # Favoriten in der Sortierung
            n_all = await ev("() => document.querySelectorAll('.rrow--phone').length")
            await ev("() => { state.recipes[0].favorite = true; render(); }")
            opts = await ev("() => Array.from(document.querySelectorAll('#sortSelect option')).map(o => o.textContent.trim())")
            await page.select_option('#sortSelect', '__fav'); await page.wait_for_timeout(250)
            f = await ev("() => ({ n: document.querySelectorAll('.rrow--phone').length, fav: state.favOnly, label: document.querySelector('.sort-inline .inline-pick-text').textContent.trim(), btn: document.querySelector('.filter-btn').textContent.trim(), title: document.querySelector('.view-pick').textContent.trim(), allFav: state.recipes.filter(r => r.favorite).length })")
            check(tag + 'Sortierung hat «Nur Favoriten»; Auswahl zeigt nur Favoriten, Wahl sichtbar, Filterzaehler unveraendert, Titel bleibt', opts[-1] == 'Nur Favoriten' and f['n'] == f['allFav'] and f['n'] < n_all and f['fav'] and f['label'] == 'Nur Favoriten' and f['btn'] == 'Filter' and f['title'] == 'Alle Rezepte', str((opts, f)))
            await ev("() => { resetExtraFilters(); render(); }")
            check(tag + 'Zuruecksetzen laesst Favoriten stehen', await ev("state.favOnly") is True)
            await page.select_option('#sortSelect', 'az'); await page.wait_for_timeout(250)
            check(tag + 'Andere Sortierung zeigt wieder alle Rezepte', not await ev("state.favOnly") and await ev("document.querySelectorAll('.rrow--phone').length") == n_all)
            # Raster: gleiche Anordnung
            if w >= 360: await page.click('.layout-toggle .icon-toggle[data-id="grid"]')
            else: await page.click('.layout-single')
            await page.wait_for_timeout(250)
            g2 = await ev(GEO)
            check(tag + 'Raster: gleiche Zeile, Abstand zur ersten Karte mind. 12 px, Umschalter links neben Filter', g2['firstT'] - g2['rowB'] >= 11.5 and g2['tgR'] <= g2['fbL'] - 8 + 0.5 and g2['sw'], f"{g2['firstT'] - g2['rowB']:.1f}")
            if w == 390: await shot(page, 'rezepte_raster_hell.png')
            check(tag + 'Keine Skriptfehler', not errs, str(errs[:2]))
            await ctx.close(); await b.close()
        # Logo auf allen fuenf Seiten
        for (w, h) in [(320, 640), (390, 844), (430, 932)]:
            b, ctx, page, errs = await new_page(p, w, h); ev = page.evaluate; tag = f'[{w}] '
            res = []
            for v in ['home', 'mealplan', 'shopping', 'cookbooks', 'settings']:
                await ev("(v) => { state.view = v; state.query = ''; state.searchOpen = false; state.modal = null; render(); window.scrollTo(0, 0); }", v); await page.wait_for_timeout(150)
                res.append(await ev(HEAD))
            check(tag + 'Logo auf allen fuenf Seiten an gleicher Stelle, 168x56, zentriert, Titelhoehe gleich', all(abs(r['wmT'] - res[0]['wmT']) <= 0.5 and abs(r['wmW'] - 168) <= 0.5 and abs(r['wmH'] - 56) <= 0.5 and abs(r['wmMid'] - r['W'] / 2) <= 1 and abs(r['titleT'] - res[0]['titleT']) <= 1 for r in res), str([(round(r['wmT'], 1), round(r['titleT'], 1)) for r in res]))
            check(tag + 'Logo sitzt tiefer als vorher (Oberkante mind. 14 px bei 0 Safe Area)', res[0]['wmT'] >= 14 - 0.5, str(res[0]['wmT']))
            await ctx.close(); await b.close()
        # Tablet/Desktop: Segment bleibt
        for (w, h) in [(820, 1180), (1440, 900)]:
            b, ctx, page, errs = await new_page(p, w, h); ev = page.evaluate
            await ev(RESET); await page.wait_for_timeout(250)
            t = await ev("() => ({ seg: [...document.querySelectorAll('.seg-btn')].map(e => e.textContent.trim()), tg: !!document.querySelector('.result-row .layout-toggle'), single: !!document.querySelector('.layout-single') })")
            check(f'[{w}] Tablet/Desktop: Segment Alle/Favoriten bleibt, Umschalter wie bisher in der Ergebniszeile', t['seg'] == ['Alle', 'Favoriten'] and t['tg'] and not t['single'], str(t))
            if w == 1440: await shot(page, 'rezepte_laptop_1440.png')
            await ctx.close(); await b.close()
    print('\n' + ('ALLE OK' if not FAIL else f'{len(FAIL)} FEHLER: ' + '; '.join(FAIL[:12])))
    sys.exit(1 if FAIL else 0)
asyncio.run(main())
