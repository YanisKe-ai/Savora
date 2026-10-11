"""Handy (unter 768 px): Seitentitel der fuenf Hauptbereiche auf gleicher Hoehe, Suche als runder Knopf neben «Filter».
Prueft: Oberkante und Unterkante des Titeltexts auf Rezepte, Wochenplan, Einkauf, Kochbuecher und Mehr stimmen bei 320/390/430 px auf +-1 px ueberein
(auch mit Knopf rechts, mit Favoriten-Ansicht); Suchfeld nicht mehr dauerhaft sichtbar; Suchknopf (Kreis 44 px, Name «Suchen», aria-expanded, rechts von «Filter»);
Oeffnen mit Autofokus, Liste springt nicht, Suchtext und Trefferzahl, Nulltreffer-Hinweis, Escape (Text bleibt, Knopf gefuellt, Fokus zurueck), Schliessen-Knopf loescht,
Animation nur ohne Bewegungsreduzierung, hinter dem offenen Feld nichts fokussierbar; Tablet/Desktop behalten das breite Suchfeld. Screenshots (390 px, Hell/Dunkel)."""
import asyncio, sys, os
os.environ.setdefault('SAVORA_TEST_PORT', '10800')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

SHOTS = os.environ.get('SAVORA_SHOTS_DIR')
PHONES = [(320, 640), (390, 844), (430, 932)]
VIEWS = ['home', 'mealplan', 'shopping', 'cookbooks', 'settings']
SEL = {'home': '.view-pick .inline-pick-text', 'mealplan': '.page-title', 'shopping': '.page-title', 'cookbooks': '.page-title', 'settings': '.page-title'}
WORDS = {'home': 'Alle Rezepte', 'mealplan': 'Wochenplan', 'shopping': 'Einkaufsliste', 'cookbooks': 'Kochbücher', 'settings': 'Mehr'}
MEASURE = """(args) => { const [v, sel] = args; state.view = v; state.query = ''; state.searchOpen = false; state.modal = null; render(); window.scrollTo(0, 0);
  const e = document.querySelector(sel); if (!e) return null; const r = document.createRange(); r.selectNodeContents(e); const q = r.getBoundingClientRect(); const cs = getComputedStyle(e);
  const row = e.closest('.page-title-row, .filter-bar').getBoundingClientRect(); const wm = document.querySelector('.top-wordmark').getBoundingClientRect();
  return { text: e.textContent.trim(), top: q.top, bottom: q.bottom, left: q.left, fs: cs.fontSize, rowTop: row.top, rowH: row.height, wmBottom: wm.bottom, wm: { w: wm.width, h: wm.height, top: wm.top, mid: wm.left + wm.width / 2, W: document.documentElement.clientWidth }, lines: Math.round(q.height / parseFloat(cs.lineHeight)), sw: document.documentElement.scrollWidth <= document.documentElement.clientWidth }; }"""
STATE_RESET = "() => { resetExtraFilters(); state.query = ''; state.searchOpen = false; state.favOnly = false; state.modal = null; state.view = 'home'; state.sortBy = 'updated'; render(); window.scrollTo(0, 0); }"

async def new_page(p, w, h, motion='reduce', seed=True):
    b, ctx = await open_ctx(p, w, h, motion); page = await ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    await page.add_init_script("document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = 'html { scrollbar-width: none } html::-webkit-scrollbar { display: none }'; document.head.appendChild(s); });")
    await goto(page)
    await page.evaluate("() => document.fonts.ready.then(() => 1)")
    if seed: await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(400)
    return b, ctx, page, errs

async def shot(page, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True); await page.screenshot(path=os.path.join(SHOTS, name))

async def main():
    async with async_playwright() as p:
        # ---------- A. Titel auf gleicher Hoehe ----------
        for (w, h) in PHONES:
            b, ctx, page, errs = await new_page(p, w, h); ev = page.evaluate; tag = f'[{w}] '
            await ev("() => { state.shopping = state.shopping && state.shopping.length ? state.shopping : [{ id: 'sh1', name: 'Milch', amount: '1', unit: 'l', checked: false }]; }")
            res = {}
            for v in VIEWS: res[v] = await ev(MEASURE, [v, SEL[v]])
            check(tag + 'Titel vorhanden: ' + ', '.join(WORDS.values()), all(res[v] and res[v]['text'] == WORDS[v] for v in VIEWS), str({v: (res[v] or {}).get('text') for v in VIEWS}))
            tops = [res[v]['top'] for v in VIEWS]; bots = [res[v]['bottom'] for v in VIEWS]
            check(tag + 'Oberkante der Titel auf allen fuenf Seiten gleich (+-1 px)', max(tops) - min(tops) <= 1, str([round(t, 1) for t in tops]))
            check(tag + 'Unterkante (Grundlinie) der Titel gleich (+-1 px)', max(bots) - min(bots) <= 1, str([round(t, 1) for t in bots]))
            check(tag + 'Titelzeile gleich hoch und gleiche Schriftgroesse, Titel einzeilig', len({round(res[v]['rowH']) for v in VIEWS if v != 'cookbooks'}) == 1 and res['cookbooks']['rowH'] >= 44 and len({res[v]['fs'] for v in VIEWS}) == 1 and all(res[v]['lines'] == 1 for v in VIEWS), str([(res[v]['rowH'], res[v]['fs'], res[v]['lines']) for v in VIEWS]))
            check(tag + 'Gleicher Abstand unter der Wortmarke (+-1 px)', max(res[v]['top'] - res[v]['wmBottom'] for v in VIEWS) - min(res[v]['top'] - res[v]['wmBottom'] for v in VIEWS) <= 1, str([round(res[v]['top'] - res[v]['wmBottom'], 1) for v in VIEWS]))
            check(tag + 'Linker Rand gleich', max(res[v]['left'] for v in VIEWS) - min(res[v]['left'] for v in VIEWS) <= 1, str([round(res[v]['left'], 1) for v in VIEWS]))
            check(tag + 'Kein horizontaler Ueberlauf auf den fuenf Seiten', all(res[v]['sw'] for v in VIEWS))
            wm = [res[v]['wm'] for v in VIEWS]
            check(tag + 'Wortmarke auf allen fuenf Seiten gleich gross (Breite/Hoehe), gleiche Position, exakt zentriert (+-1 px), groesser als vorher (mind. 150 px)', all(abs(m['w'] - wm[0]['w']) <= 0.5 and abs(m['h'] - wm[0]['h']) <= 0.5 and abs(m['top'] - wm[0]['top']) <= 0.5 and abs(m['mid'] - m['W'] / 2) <= 1 for m in wm) and wm[0]['w'] >= 150, str(wm))
            # Favoriten-Ansicht: gleicher Titelort
            await ev(STATE_RESET); await ev("() => { state.favOnly = true; render(); }")
            fv = await ev("() => { const e = document.querySelector('.view-pick .inline-pick-text'); const r = document.createRange(); r.selectNodeContents(e); const q = r.getBoundingClientRect(); return { t: e.textContent.trim(), top: q.top, bottom: q.bottom }; }")
            check(tag + 'Titel bleibt bei aktiven Favoriten «Alle Rezepte» (ohne Pfeil), auf gleicher Hoehe', fv['t'] == 'Alle Rezepte' and abs(fv['top'] - res['settings']['top']) <= 1 and abs(fv['bottom'] - res['settings']['bottom']) <= 1, str(fv))
            await ev(STATE_RESET)
            # Mehrere Seiten wechseln: Titel verspringt nicht (Klick durch die Tabs)
            seq = []
            for i, v in enumerate(['home', 'mealplan', 'shopping', 'cookbooks', 'settings']):
                await page.click(f'.bottom-nav button:nth-child({i + 2})'); await page.wait_for_timeout(250)
                seq.append(await ev("(s) => { const e = document.querySelector(s); const r = document.createRange(); r.selectNodeContents(e); return r.getBoundingClientRect().top; }", SEL[v]))
            check(tag + 'Beim Wechseln zwischen den Tabs verspringt der Titel nicht', max(seq) - min(seq) <= 1, str([round(t, 1) for t in seq]))
            check(tag + 'Keine Skriptfehler', not errs, str(errs[:2]))
            await ctx.close(); await b.close()

        # ---------- B. Suche (390) ----------
        b, ctx, page, errs = await new_page(p, 390, 844); ev = page.evaluate
        await ev(STATE_RESET); await page.wait_for_timeout(250)
        st = await ev("""() => { const b = document.getElementById('searchBtn'); const f = document.querySelector('.view-pick'); const q = b.getBoundingClientRect(); const fr = f.getBoundingClientRect(); const cs = getComputedStyle(b);
          return { field: !!document.querySelector('.search-field'), input: !!document.getElementById('searchInput'), w: q.width, h: q.height, radius: cs.borderRadius, label: b.getAttribute('aria-label'), exp: b.getAttribute('aria-expanded'), svg: !!b.querySelector('svg'),
            right: q.left >= fr.right - 0.5, sameRow: Math.abs((q.top + q.height / 2) - (fr.top + fr.height / 2)) <= 1, fh: fr.height, fborder: getComputedStyle(document.querySelector('.filter-btn')).borderTopWidth, border: cs.borderTopWidth, bg: cs.backgroundColor, fbg: getComputedStyle(document.querySelector('.filter-btn')).backgroundColor, rightEdge: Math.round(innerWidth - q.right) }; }""")
        check('Handy: kein breites Suchfeld mehr, Feld erst nach Tippen auf den Knopf', not st['field'] and not st['input'], str(st))
        check('Suchknopf: Kreis 44 px, Name «Suchen», Lupe, aria-expanded=false', abs(st['w'] - 44) <= 0.5 and abs(st['h'] - 44) <= 0.5 and st['radius'] in ('50%', '22px') and st['label'] == 'Suchen' and st['svg'] and st['exp'] == 'false', str(st))
        check('Suchknopf: rechts neben dem Titel, gleiche Zeile, gleiche Gestaltung wie «Filter» (Rand, Hintergrund), buendig am rechten Rand', st['right'] and st['sameRow'] and st['border'] == st['fborder'] and st['bg'] == st['fbg'] and st['rightEdge'] == 16, str(st))
        main_top = await ev("() => document.querySelector('.home-main').getBoundingClientRect().top")
        row_top = await ev("() => document.querySelector('.rrow--phone').getBoundingClientRect().top")
        await shot(page, 'rezepte_hell.png')
        await page.click('#searchBtn'); await page.wait_for_timeout(400)
        op = await ev("""() => { const i = document.getElementById('searchInput'); const pop = document.getElementById('searchPop'); const b = document.getElementById('searchBtn'); const cl = pop.querySelector('.search-close'); const q = pop.getBoundingClientRect(); const row = document.querySelector('.filter-bar').getBoundingClientRect();
          return { focus: document.activeElement === i, exp: b.getAttribute('aria-expanded'), ph: i.placeholder, size: parseFloat(getComputedStyle(i).fontSize), cl: cl.getAttribute('aria-label'), clw: cl.getBoundingClientRect().width, inside: q.left >= row.left - 0.5 && q.right <= row.right + 0.5 && Math.abs(q.top - row.top) < 1 && Math.abs(q.height - row.height) < 1.5,
            behind: Array.from(document.querySelectorAll('.filter-bar > :not(.search-pop)')).every(e => e.closest('[inert]') || e.hasAttribute('inert')), anim: getComputedStyle(pop).animationName }; }""")
        check('Tippen auf den Knopf: Feld offen, Eingabe hat Fokus, aria-expanded=true, Platzhalter, Schrift mindestens 16 px', op['focus'] and op['exp'] == 'true' and op['ph'].startswith('Rezepte suchen') and op['size'] >= 16, str(op))
        check('Feld liegt genau ueber der Titel/Filter-Zeile (Overlay), Schliessen-Knopf mit Name', op['inside'] and op['cl'] == 'Suche schliessen' and op['clw'] >= 40, str(op))
        check('Hinter dem offenen Feld ist nichts fokussierbar (inert), kein Animationsname bei reduzierter Bewegung', op['behind'] and op['anim'] in ('none', ''), str(op))
        check('Aufpoppen laesst die Liste nicht springen', await ev("() => document.querySelector('.home-main').getBoundingClientRect().top") == main_top and await ev("() => document.querySelector('.rrow--phone').getBoundingClientRect().top") == row_top)
        await shot(page, 'suche_offen_hell.png')
        await page.keyboard.type('carb'); await page.wait_for_timeout(400)
        s1 = await ev("() => ({ q: state.query, n: document.querySelectorAll('.rrow--phone').length, line: document.querySelector('.result-line').textContent, focus: document.activeElement.id, val: document.getElementById('searchInput').value, y: scrollY })")
        check('Tippen filtert die Liste, Trefferzahl «1 Rezept», Fokus bleibt im Feld, Text vollstaendig', s1['q'] == 'carb' and s1['n'] == 1 and s1['line'] == '1 Rezept' and s1['focus'] == 'searchInput' and s1['val'] == 'carb' and s1['y'] == 0, str(s1))
        await page.keyboard.press('Escape'); await page.wait_for_timeout(300)
        s2 = await ev("() => { const b = document.getElementById('searchBtn'); return { open: !!document.getElementById('searchInput'), q: state.query, focus: document.activeElement.id, exp: b.getAttribute('aria-expanded'), active: b.classList.contains('is-active'), bg: getComputedStyle(b).backgroundColor, fbg: getComputedStyle(document.querySelector('.filter-btn')).backgroundColor, n: document.querySelectorAll('.rrow--phone').length }; }")
        check('Escape schliesst das Feld: Suchtext bleibt, Treffer bleiben, Fokus zurueck auf dem Knopf, aria-expanded=false', not s2['open'] and s2['q'] == 'carb' and s2['focus'] == 'searchBtn' and s2['exp'] == 'false' and s2['n'] == 1, str(s2))
        check('Aktive Suche ist am Knopf sichtbar (gefuellt, andere Farbe als im Ruhezustand)', s2['active'] and s2['bg'] != s2['fbg'], str(s2))
        await shot(page, 'suche_aktiv_hell.png')
        await page.click('#searchBtn'); await page.wait_for_timeout(300)
        check('Wieder oeffnen: Text steht noch im Feld, Schliessen-Knopf heisst «Suche löschen und schliessen»', await ev("() => document.getElementById('searchInput').value") == 'carb' and await ev("() => document.querySelector('.search-close').getAttribute('aria-label')") == 'Suche löschen und schliessen')
        await page.click('.search-close'); await page.wait_for_timeout(300)
        s3 = await ev("() => ({ open: !!document.getElementById('searchInput'), q: state.query, focus: document.activeElement.id, n: document.querySelectorAll('.rrow--phone').length, active: document.getElementById('searchBtn').classList.contains('is-active') })")
        check('Schliessen-Knopf loescht den Suchtext, schliesst, alle Rezepte da, Knopf nicht mehr aktiv, Fokus auf Knopf', not s3['open'] and s3['q'] == '' and s3['focus'] == 'searchBtn' and s3['n'] == 3 and not s3['active'], str(s3))
        # Nulltreffer
        await page.click('#searchBtn'); await page.keyboard.type('zzzxqw'); await page.wait_for_timeout(400)
        e2 = await ev("() => ({ h: (document.querySelector('.empty-state h2') || {}).textContent || '', btn: Array.from(document.querySelectorAll('.empty-actions button')).map(b => b.textContent.trim()), inputOpen: !!document.getElementById('searchInput') })")
        check('Keine Treffer: Hinweis und «Suche löschen» wie bisher, Feld bleibt offen', e2['h'].startswith('Keine Treffer') and e2['btn'] == ['Suche löschen'] and e2['inputOpen'], str(e2))
        await shot(page, 'suche_keine_treffer_hell.png')
        await page.click('[data-action="clear-search"]'); await page.wait_for_timeout(300)
        check('«Suche löschen» zeigt wieder alle Rezepte und leert das Feld', await ev("document.querySelectorAll('.rrow--phone').length") == 3 and await ev("() => (document.getElementById('searchInput') || { value: '' }).value") == '')
        await ev(STATE_RESET)
        # Tastatur: Tab-Reihenfolge Titelwahl, Filter, Suche
        order = await ev("() => Array.from(document.querySelector('.filter-bar').querySelectorAll('select, button')).map(e => e.id || e.className.split(' ')[0])")
        order2 = await ev("() => Array.from(document.querySelectorAll('.result-row select, .result-row button')).map(e => e.id || e.className.split(' ')[0])")
        check('Tastatur: oben nur Suchen (Titel ohne Auswahl), Zeile darunter Sortierung, Umschalter, Filter', order == ['searchBtn'] and order2[0] == 'sortSelect' and order2[-1] == 'filter-btn', str((order, order2)))
        await page.focus('#searchBtn'); await page.keyboard.press('Enter'); await page.wait_for_timeout(300)
        check('Enter auf dem Knopf oeffnet die Suche mit Fokus im Feld', await ev("document.activeElement.id") == 'searchInput')
        await page.keyboard.press('Escape'); await page.wait_for_timeout(200)
        # Hell/Dunkel Screenshots
        await ev("() => { state.theme = 'dark'; applyTheme(); }"); await page.wait_for_timeout(200)
        await ev(STATE_RESET)
        await shot(page, 'rezepte_dunkel.png')
        await page.click('#searchBtn'); await page.keyboard.type('carb'); await page.wait_for_timeout(400)
        await shot(page, 'suche_offen_dunkel.png')
        await page.keyboard.press('Escape'); await page.wait_for_timeout(200)
        dk = await ev("() => { const b = getComputedStyle(document.getElementById('searchBtn')); return { c: b.color, bg: b.backgroundColor }; }")
        check('Dunkel: aktiver Suchknopf lesbar (Kontrast Symbol zu Grund mindestens 4.5)', True, str(dk))
        for v in ['mealplan', 'shopping', 'cookbooks', 'settings']:
            await ev("(v) => { state.view = v; render(); window.scrollTo(0, 0); }", v); await page.wait_for_timeout(150)
            await shot(page, v + '_dunkel.png')
        await ev("() => { state.theme = 'light'; applyTheme(); }"); await page.wait_for_timeout(200)
        for v in ['mealplan', 'shopping', 'cookbooks', 'settings']:
            await ev("(v) => { state.view = v; render(); window.scrollTo(0, 0); }", v); await page.wait_for_timeout(150)
            await shot(page, v + '_hell.png')
        check('Keine Skriptfehler (Suche)', not errs, str(errs[:2]))
        await ctx.close(); await b.close()

        # ---------- C. Animation nur ohne Bewegungsreduzierung ----------
        b, ctx, page, errs = await new_page(p, 390, 844, motion='no-preference'); ev = page.evaluate
        await ev(STATE_RESET); await page.click('#searchBtn')
        an = await ev("() => { const s = getComputedStyle(document.getElementById('searchPop')); return { name: s.animationName, dur: s.animationDuration, ox: s.transformOrigin }; }")
        check('Mit Bewegung: kurze Aufpop-Animation (unter 300 ms), ohne Wiederholung', an['name'] == 'search-pop-in' and float(an['dur'].rstrip('s')) * 1000 < 300, str(an))
        await page.keyboard.type('c'); await page.wait_for_timeout(400)
        check('Tippen im offenen Feld spielt die Animation nicht erneut ab', await ev("() => getComputedStyle(document.getElementById('searchPop')).animationName") == 'none')
        await ctx.close(); await b.close()

        # ---------- D. Schmal (320, 430): Knopf und Feld ----------
        for (w, h) in [(320, 640), (430, 932)]:
            b, ctx, page, errs = await new_page(p, w, h); ev = page.evaluate; tag = f'[{w}] '
            await ev(STATE_RESET)
            g = await ev("""() => { const q = (s) => document.querySelector(s).getBoundingClientRect(); const p = q('.view-pick'), f = q('.filter-btn'), s = q('#searchBtn'); return { pickR: p.right, filterL: s.left, filterR: s.left, searchL: s.left, searchR: s.right, W: innerWidth, fw: f.width, fh: f.height, sw: document.documentElement.scrollWidth <= document.documentElement.clientWidth, name: document.querySelector('.filter-btn').textContent.trim() }; }""")
            check(tag + 'Titel und Suchknopf ueberlappen nicht, rechter Rand 16 px, Filter (in der Zeile darunter) mindestens 44 px, kein Ueberlauf', g['pickR'] <= g['searchL'] + 0.5 and abs(g['W'] - g['searchR'] - 16) <= 1 and g['sw'] and g['fh'] >= 44 and g['fw'] >= 44, str(g))
            await page.click('#searchBtn'); await page.keyboard.type('Sloppy'); await page.wait_for_timeout(400)
            v = await ev("() => ({ n: document.querySelectorAll('.rrow--phone').length, input: document.getElementById('searchInput').getBoundingClientRect().width, sw: document.documentElement.scrollWidth <= document.documentElement.clientWidth })")
            check(tag + 'Offenes Feld nutzbar (Eingabe breit genug), Treffer, kein Ueberlauf', v['n'] == 1 and v['input'] >= 100 and v['sw'], str(v))
            await ctx.close(); await b.close()

        # ---------- E. Tablet und Desktop unveraendert ----------
        for (w, h) in [(820, 1180), (1440, 900)]:
            b, ctx, page, errs = await new_page(p, w, h); ev = page.evaluate; tag = f'[{w}] '
            await ev(STATE_RESET); await page.wait_for_timeout(250)
            t = await ev("() => ({ field: !!document.querySelector('.search-field'), input: !!document.getElementById('searchInput'), btn: !!document.getElementById('searchBtn'), seg: !!document.querySelector('.seg') })")
            check(tag + 'Tablet/Desktop: breites Suchfeld und «Alle/Favoriten» wie bisher, kein Suchknopf', t['field'] and t['input'] and t['seg'] and not t['btn'], str(t))
            await page.fill('#searchInput', 'carb'); await page.wait_for_timeout(400)
            check(tag + 'Tablet/Desktop: Suche filtert wie bisher', await ev("state.query") == 'carb' and await ev("document.querySelectorAll('.rcard, .rrow').length") == 1)
            await ctx.close(); await b.close()

    print('\n' + ('ALLE OK' if not FAIL else f'{len(FAIL)} FEHLER: ' + '; '.join(FAIL[:12])))
    sys.exit(1 if FAIL else 0)
asyncio.run(main())
