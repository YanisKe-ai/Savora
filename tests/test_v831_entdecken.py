"""0.83.1: «Entdecken» ist gleich aufgebaut wie «Meine Rezepte» (homeView).
Prueft: Handy 320/390/430 px: Oberkante von Titel, Suchknopf, Umschalter, Ergebniszeile und Filterknopf in home und discover gleich (+-1 px);
Suche ueber den runden Knopf (Overlay, Autofokus, Eingabe sucht, Escape schliesst und behaelt den Text, Knopf hervorgehoben, Schliessen-Knopf
loescht); Schnellfilter im Filterfenster (Gruppe «Schnell», Schalter, mit «Maximale Gesamtzeit» abgeglichen) wirken, Zusammenfassung und
«Zuruecksetzen»; Tablet/Desktop 768/1280: Titel, Suchfeld, Filterzeile und Ergebniszeile auf gleicher Hoehe wie home, Schnellfilter-Chips wirken;
keine horizontale Scrollleiste, Touchflaechen >= 44 px, Hell/Dunkel, grosse Schrift (24 px)."""
import os
os.environ.setdefault('SAVORA_TEST_PORT', '24160')
os.environ.setdefault('SAVORA_MOCK_PORT', '24161')
from bibliothek_helfer import *   # noqa: F401,F403

MEAS = """(sels) => { const o = {}; for (const [k, s] of Object.entries(sels)) { const e = document.querySelector(s); o[k] = e ? e.getBoundingClientRect().top : null; } return o; }"""
PHONE_SELS = {'title': '.view-pick', 'search': '.search-btn', 'switch': '.lib-switch', 'row': 'main .result-row', 'filter': 'main .filter-btn'}
DESK_SELS = {'title': '.page-title', 'switch': '.lib-switch', 'search': '.home-head .search-field', 'bar': '.home-head-body > .filter-bar', 'filter': '.home-head .filter-btn', 'row': 'main .result-row'}
LAYOUT = """() => { const W = document.documentElement.clientWidth; const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  const small = []; document.querySelectorAll('.home-head button, .home-head input, main button, main select, [role=dialog] .fs-opt').forEach(e => { if (!vis(e) || e.closest('[inert]')) return; const r = e.getBoundingClientRect(); if (r.height < 43.5 || r.width < 43.5) small.push((e.getAttribute('data-action') || e.id || e.className) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); });
  return { hscroll: document.documentElement.scrollWidth > W + 1, small: [...new Set(small)].slice(0, 6) }; }"""
HOME = "() => { try { localStorage.setItem(BACKUP_NUDGE_KEY, String(Date.now() + 1e10)); } catch (e) {} state.modal = null; state.searchOpen = false; state.query = ''; state.view = 'home'; render(); window.scrollTo(0, 0); }"

def seed():
    M.lib_reset()
    A = M.make_user('autor-v831@example.test')
    M.seed_publication(A, M.simple_recipe('Apfelkuchen', minutes=60, diet=['vegetarisch'], ingredients=[{'amount': '3', 'unit': '', 'name': 'Äpfel'}]), display_name='Anna Kocht')
    M.seed_publication(A, M.simple_recipe('Schnelle Pasta', minutes=20, diet=['fleisch']), display_name='Anna Kocht')
    M.seed_publication(A, M.simple_recipe('Gemüsesuppe', minutes=25, diet=['vegan']), display_name='Anna Kocht')
    M.seed_publication(A, M.simple_recipe('Braten', minutes=None, diet=['fleisch']), display_name='Anna Kocht')

async def ctx_page(p, w, scheme='light', h=900):
    if not hasattr(ctx_page, 'b'): ctx_page.b = await p.chromium.launch()
    ctx = await ctx_page.b.new_context(viewport={'width': w, 'height': h}, reduced_motion='reduce', color_scheme=scheme, timezone_id='UTC')
    await ctx.add_init_script(NO_SW + " try{localStorage.setItem('savora-splash-seen','1'); localStorage.setItem('savora-theme', %s)}catch(e){}" % json.dumps(scheme))
    await ctx.add_init_script(CLOUD); await ctx.add_init_script(HIDE_SB)
    page = await new_page(ctx); await start(page)
    await ev(page, open(SEED_PATH).read())
    await wait_js(page, "state.recipes.length >= 3", 5000)
    return ctx, page

async def discover(page):
    await open_discover(page); await wait_discover_ready(page)
    await wait_js(page, "document.querySelectorAll('.lcard-item').length >= 1", ui_wait())
    await ev(page, "() => window.scrollTo(0, 0)")

async def compare(page, sels, tag):
    await ev(page, HOME); await wait_js(page, "!!document.querySelector('main .result-row')", 4000)
    h = await ev(page, MEAS, sels)
    await discover(page)
    d = await ev(page, MEAS, sels)
    for k in sels:
        check(f'{tag}: Oberkante {k} gleich wie «Meine Rezepte» (+-1 px)', h[k] is not None and d[k] is not None and abs(h[k] - d[k]) <= 1, f'home={h[k]} entdecken={d[k]}')
    return h, d

async def layout(page, tag):
    r = await ev(page, LAYOUT)
    check(f'{tag}: keine horizontale Scrollleiste', not r['hscroll'])
    check(f'{tag}: Touchflaechen >= 44 px', not r['small'], r['small'])

async def main():
    t0 = time.time(); seed()
    async with async_playwright() as p:
        for w in (320, 390, 430):
            async with section(f'Handy {w} px: gleiche Positionen wie «Meine Rezepte»'):
                ctx, page = await ctx_page(p, w)
                await compare(page, PHONE_SELS, f'{w}')
                st = await ev(page, """() => ({ title: document.querySelector('.view-pick').textContent.trim(), sw: !!document.querySelector('main > .lib-switch'),
                  order: [...document.querySelectorAll('main > .lib-switch, main .result-row, main .lib-grid')].map(e => e.className.split(' ')[0]),
                  info: (document.querySelector('main .result-row .result-line') || {}).textContent, sort: (document.querySelector('.sort-inline .inline-pick-text') || {}).textContent,
                  quickInHead: !!document.querySelector('.lib-qf'), field: !!document.getElementById('libSearchInput') })""")
                check(f'{w}: Titel «Entdecken», Reihenfolge Umschalter, Ergebniszeile, Karten', st['title'] == 'Entdecken' and st['order'] == ['lib-switch', 'result-row', 'lib-grid'], st)
                check(f'{w}: Ergebniszeile «4 Rezepte · Neueste», keine Schnellfilter-Chips, Suchfeld geschlossen', st['info'] == '4 Rezepte' and st['sort'].strip() == 'Neueste' and not st['quickInHead'] and not st['field'], st)
                await layout(page, f'{w} Entdecken')
                await ctx.close()

        for scheme in ('light', 'dark'):
            async with section(f'390 px {scheme}: Suche ueber den Knopf'):
                ctx, page = await ctx_page(p, 390, scheme)
                await discover(page)
                btn_ = page.locator('#libSearchBtn')
                check(f'{scheme}: Suchknopf heisst «Suchen», aria-expanded=false', await btn_.get_attribute('aria-label') == 'Suchen' and await btn_.get_attribute('aria-expanded') == 'false')
                await btn_.click()
                await page.wait_for_selector('#libSearchInput')
                s1 = await ev(page, """() => { const i = document.getElementById('libSearchInput'), pop = document.getElementById('libSearchPop').getBoundingClientRect(), bar = document.querySelector('.filter-bar--phone').getBoundingClientRect();
                  return { focus: document.activeElement === i, ph: i.placeholder, over: Math.abs(pop.top - bar.top) <= 1 && Math.abs(pop.height - bar.height) <= 1, inert: document.querySelector('main .filter-btn').hasAttribute('inert') }; }""")
                check(f'{scheme}: Feld oeffnet ueber der Titelzeile, Fokus im Feld, Platzhalter, Filterknopf dahinter inert', s1['focus'] and s1['ph'] == 'Rezepte oder Zutaten suchen' and s1['over'] and s1['inert'], s1)
                await layout(page, f'390 {scheme} Suche offen')
                await page.keyboard.type('Apfel', delay=20)
                await wait_query(page, 'Apfel')
                await wait_js(page, "document.querySelectorAll('.lcard-item').length === 1", 4000)
                check(f'{scheme}: Eingabe sucht (libSetQuery), Fokus bleibt im Feld', await ev(page, "lib.discover.items.map(x => x.title).join() === 'Apfelkuchen' && document.activeElement.id === 'libSearchInput'"))
                check(f'{scheme}: Schliessen-Knopf heisst jetzt «Suche löschen und schliessen»', await page.locator('#libSearchPop .search-close').get_attribute('aria-label') == 'Suche löschen und schliessen')
                await page.keyboard.press('Escape')
                await wait_js(page, "!document.getElementById('libSearchPop')", 4000)
                s2 = await ev(page, "() => { const b = document.getElementById('libSearchBtn'); return { active: b.classList.contains('is-active'), focus: document.activeElement === b, q: lib.discover.q, bg: getComputedStyle(b).backgroundColor, base: getComputedStyle(document.querySelector('.lib-switch-btn.is-on')).backgroundColor }; }")
                check(f'{scheme}: Escape schliesst, Text bleibt, Knopf hervorgehoben (is-active), Fokus zurueck', s2['active'] and s2['focus'] and s2['q'] == 'Apfel', s2)
                await page.screenshot(path=os.path.join(SHOTS, f'v831_suche_aktiv_{scheme}.png'))
                await btn_.click(); await page.wait_for_selector('#libSearchInput')
                check(f'{scheme}: wieder geoeffnet steht der Suchtext im Feld', await page.input_value('#libSearchInput') == 'Apfel')
                await page.locator('#libSearchPop .search-close').click()
                await wait_query(page, '')
                await wait_js(page, "!document.getElementById('libSearchPop') && !document.getElementById('libSearchBtn').classList.contains('is-active')", 4000)
                check(f'{scheme}: Schliessen-Knopf loescht die Suche, alle Rezepte wieder da', await ev(page, "lib.discover.items.length") == 4)
                await ctx.close()

        async with section('390 px: Schnellfilter im Filterfenster'):
            ctx, page = await ctx_page(p, 390)
            await discover(page)
            await page.locator('main .filter-btn').click()
            await page.wait_for_selector('.lib-filter-sheet')
            g = await ev(page, "() => { const f = document.querySelector('.lib-filter-sheet .fs-group'); return { legend: f.querySelector('legend').textContent.trim(), sw: [...f.querySelectorAll('input[role=switch]')].map(i => i.closest('label').textContent.trim()) }; }")
            check('Oberste Gruppe «Schnell» mit Schaltern «Bis 30 Min.» und «Vegetarisch»', g == {'legend': 'Schnell', 'sw': ['Bis 30 Min.', 'Vegetarisch']}, g)
            sheet = page.locator('.lib-filter-sheet')
            await sheet.get_by_role('switch', name='Bis 30 Min.', exact=True).click()
            sync = await ev(page, "() => ({ radio: document.querySelector('.lib-fs-input[data-lib-dim=max][value=\"30\"]').checked, status: document.querySelector('.fs-status').textContent })")
            check('Schalter «Bis 30 Min.» setzt auch «Maximale Gesamtzeit: Bis 30 Min.»', sync['radio'] and sync['status'] == '1 Filter gewählt', sync)
            await sheet.get_by_role('switch', name='Vegetarisch', exact=True).click()
            check('Schalter «Vegetarisch» setzt auch «Vegetarisch (mit vegan)»', await ev(page, "document.querySelector('.lib-fs-input[data-lib-dim=veg]:not([role=switch])').checked"))
            await page.screenshot(path=os.path.join(SHOTS, 'v831_filterfenster_schnell.png'))
            await layout(page, '390 Filterfenster')
            await click_btn(page, 'Rezepte anzeigen')
            await wait_js(page, "!state.modal && lib.discover.filters.quick === true && lib.discover.filters.veg === true && lib.discover.status === 'ready'", 6000)
            r = await ev(page, "() => ({ t: lib.discover.items.map(x => x.title), btn: document.querySelector('main .filter-btn').textContent.trim(), cnt: document.querySelector('main .filter-btn').dataset.count, sum: (document.querySelector('.filter-summary-text') || {}).textContent })")
            check('Wirkung: nur «Gemüsesuppe» (vegan, 25 Min.); Filterknopf «Filter · 2»; Zusammenfassung', r['t'] == ['Gemüsesuppe'] and r['btn'] == 'Filter · 2' and r['cnt'] == '2' and 'Bis 30 Min. · Vegetarisch' in (r['sum'] or ''), r)
            order = await ev(page, "() => [...document.querySelectorAll('main .result-row, main .filter-summary, main .lib-grid')].map(e => e.className.split(' ')[0])")
            check('Zusammenfassung zwischen Ergebniszeile und Karten', order == ['result-row', 'filter-summary', 'lib-grid'], order)
            await layout(page, '390 mit Filtern')
            await page.screenshot(path=os.path.join(SHOTS, 'v831_filter_aktiv.png'))
            await page.locator('.filter-summary-reset').click()
            await wait_js(page, "!lib.discover.filters.quick && !lib.discover.filters.veg && lib.discover.status === 'ready' && !document.querySelector('.filter-summary')", 6000)
            check('«Zurücksetzen» entfernt alle Filter', await ev(page, "lib.discover.items.length") == 4)
            await ctx.close()

        for w in (768, 1280):
            for scheme in ('light', 'dark'):
                async with section(f'{w} px {scheme}: wie «Meine Rezepte» (Tablet/Desktop)'):
                    ctx, page = await ctx_page(p, w, scheme)
                    await compare(page, DESK_SELS, f'{w} {scheme}')
                    st = await ev(page, "() => ({ chips: [...document.querySelectorAll('.lib-filter-bar .lib-qf')].map(b => b.textContent.trim()), btnRight: Math.abs(document.querySelector('.lib-filter-bar .filter-btn').getBoundingClientRect().right - document.querySelector('.lib-filter-bar').getBoundingClientRect().right) <= 1, ph: document.getElementById('libSearchInput').placeholder, sbtn: getComputedStyle(document.getElementById('libSearchBtn') || document.body).display })")
                    check(f'{w} {scheme}: Chips «Bis 30 Min.», «Vegetarisch» links, Filter rechts, Suchfeld sichtbar', st['chips'] == ['Bis 30 Min.', 'Vegetarisch'] and st['btnRight'] and st['ph'] == 'Rezepte oder Zutaten suchen', st)
                    await layout(page, f'{w} {scheme}')
                    if scheme == 'light':
                        await click_btn(page, 'Vegetarisch')
                        await wait_js(page, "lib.discover.filters.veg === true && lib.discover.status === 'ready'", 6000)
                        check(f'{w}: Chip «Vegetarisch» wirkt (aria-pressed, Zusammenfassung)', await ev(page, "document.querySelector('[data-action=lib-filter-veg]').getAttribute('aria-pressed') === 'true' && /Vegetarisch/.test(document.querySelector('.filter-summary-text').textContent) && lib.discover.items.length === 2"))
                    await ctx.close()

        async with section('Grosse Schrift (24 px) bei 390 und 320 px'):
            for w in (390, 320):
                ctx, page = await ctx_page(p, w)
                await ev(page, "() => { document.documentElement.style.fontSize = '24px'; }")
                await discover(page)
                await layout(page, f'{w} grosse Schrift')
                await page.locator('#libSearchBtn').click(); await page.wait_for_selector('#libSearchInput')
                await layout(page, f'{w} grosse Schrift, Suche offen')
                await page.screenshot(path=os.path.join(SHOTS, f'v831_gross_{w}.png'))
                await ctx.close()
        if hasattr(ctx_page, 'b'): await ctx_page.b.close()
    report(t0)

asyncio.run(main())
