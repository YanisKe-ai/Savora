"""Oeffentliche Rezeptbibliothek, Darstellung (Browser gegen den Nachbau tests/mock_supabase.py).
Prueft (Auftrag §7, §24, §26 «Darstellung»): 320, 390, 430, 768 und 1280 px in Hell und Dunkel fuer Entdecken, Detail und
Profil: keine horizontale Scrollleiste, keine ueberlappenden Karten (Bounding-Box-Pruefung), einheitliche Bildflaeche auch
ohne Bild, keine verschachtelten Buttons, Touchflaechen ≥ 44 px, sichtbarer Tastaturfokus, Filterfenster mit Escape und
Fokusrueckgabe, reduzierte Bewegung, grosse Schrift (Wurzel 24 px), lange Titel und Namen, fehlende Bilder.
Bildschirmfotos: tests/out/bibliothek/ (nicht im Repo)."""
import os
os.environ.setdefault('SAVORA_TEST_PORT', '24060')
os.environ.setdefault('SAVORA_MOCK_PORT', '24061')
from bibliothek_helfer import *   # noqa: F401,F403

WIDTHS = [int(x) for x in os.environ.get('SAVORA_LIB_WIDTHS', '320,390,430,768,1280').split(',')]
LONG_TITLE = 'Grossmutters ausserordentlich langer Sonntagsbraten mit Rotweinsauce, Kartoffelstock und glasierten Rüebli nach Originalrezept aus dem Emmental'
LONG_NAME = 'Maximiliane-Annegret Müller-Lüdenscheidt'   # 40 Zeichen

LAYOUT_JS = """() => {
  const W = document.documentElement.clientWidth;
  const hscroll = document.documentElement.scrollWidth > W + 1;
  const vis = e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const cards = [...document.querySelectorAll('.lcard-item')].filter(vis).map(e => e.getBoundingClientRect());
  const overlaps = [];
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
    const a = cards[i], b = cards[j];
    if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) overlaps.push([i, j]);
  }
  const medias = [...document.querySelectorAll('.lcard-item .lcard-media')].filter(vis).map(e => { const r = e.getBoundingClientRect(); return Math.round(r.height / r.width * 100) / 100; });
  const nested = [...document.querySelectorAll('button button, button a[href], a[href] button, a[href] a[href]')].length;
  const small = [];
  document.querySelectorAll('main button, main [role=button], main select, .lib-head button, .lib-head input, .topbar button, header button').forEach(e => {
    if (!vis(e)) return; const r = e.getBoundingClientRect();
    if (r.height < 43.5 || r.width < 43.5) small.push((e.getAttribute('data-action') || e.className || e.tagName) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
  });
  const titleCut = [...document.querySelectorAll('.lcard-title, .lib-detail-main h1, h1')].filter(vis).filter(e => e.clientWidth > 2 && !e.classList.contains('sr-only') && e.scrollWidth > e.clientWidth + 1).length;
  return { W, hscroll, cards: cards.length, overlaps: overlaps.slice(0, 4), ratios: [...new Set(medias)], nested, small: [...new Set(small)].slice(0, 8), titleCut };
}"""

async def layout_checks(page, label, need_cards=True):
    r = await ev(page, LAYOUT_JS)
    check(f'{label}: keine horizontale Scrollleiste', not r['hscroll'], await overflow_info(page))
    if need_cards:
        check(f'{label}: Karten sichtbar', r['cards'] > 0, r['cards'])
        check(f'{label}: keine ueberlappenden Karten', not r['overlaps'], r['overlaps'])
        check(f'{label}: einheitliche Bildflaeche (mit und ohne Bild)', len(r['ratios']) <= 1, r['ratios'])
    check(f'{label}: keine verschachtelten Buttons/Links', r['nested'] == 0, r['nested'])
    check(f'{label}: Touchflaechen ≥ 44 px', not r['small'], r['small'])
    check(f'{label}: lange Titel werden umbrochen, nicht abgeschnitten', r['titleCut'] == 0, r['titleCut'])
    return r

def seed():
    M.lib_reset()
    A = M.make_user('autor-a@example.test'); L = M.make_user('lang@example.test')
    ids = []
    for i in range(14):
        ids.append(M.seed_publication(A, M.simple_recipe('Rezept mit Bild %02d' % i, minutes=10 + i), image=(i % 2 == 0), display_name='Anna Kocht'))
    long_id = M.seed_publication(L, rich_recipe(LONG_TITLE, minutes=None), display_name=LONG_NAME)
    M.PUB_PROFILES[L]['bio'] = 'Ich koche am liebsten Schmorgerichte für grosse Runden und schreibe dazu, woher die Rezepte stammen. ' * 1
    return A, L, long_id

async def open_ctx_theme(p, w, scheme, motion='reduce', h=900):
    browser = await p.chromium.launch() if not hasattr(open_ctx_theme, 'b') else open_ctx_theme.b
    open_ctx_theme.b = browser
    ctx = await browser.new_context(viewport={'width': w, 'height': h}, reduced_motion=motion, color_scheme=scheme, timezone_id='UTC')
    await ctx.add_init_script(NO_SW + " try{localStorage.setItem('savora-splash-seen','1'); localStorage.setItem('savora-theme', %s)}catch(e){}" % json.dumps(scheme))
    await ctx.add_init_script(CLOUD); await ctx.add_init_script(HIDE_SB)
    page = await new_page(ctx)
    await start(page)
    return ctx, page

async def main():
    t0 = time.time()
    A, L, long_id = seed()
    pid_long = M.PUB_PROFILES[L]['public_id']
    shots = []
    async with async_playwright() as p:
        for w in WIDTHS:
            for scheme in ('light', 'dark'):
                async with section(f'{w} px {scheme}'):
                    ctx, page = await open_ctx_theme(p, w, scheme)
                    check(f'{w} {scheme}: Theme aktiv', await ev(page, "document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')") == scheme)
                    await open_discover(page); await wait_discover_ready(page)
                    await wait_js(page, "document.querySelectorAll('.lcard-item').length >= 15", ui_wait())
                    await layout_checks(page, f'{w} {scheme} Entdecken')
                    shots.append(await shot(page, f'entdecken_{w}_{scheme}'))
                    await ev(page, "(id) => libOpenDetail(id)", long_id); await wait_js(page, "lib.detail.status === 'ready'")
                    await wait_js(page, "!!document.querySelector('.lib-detail-main')", ui_wait())
                    await layout_checks(page, f'{w} {scheme} Detail (langer Titel, langer Name, ohne Bild)', need_cards=False)
                    check(f'{w} {scheme} Detail: langer Autorname vollstaendig', LONG_NAME in await main_text(page))
                    shots.append(await shot(page, f'detail_{w}_{scheme}'))
                    await ev(page, "(id) => libOpenProfile(id)", pid_long); await wait_js(page, "lib.profile.status === 'ready'")
                    await wait_js(page, "document.querySelectorAll('.lcard-item').length >= 1", ui_wait())
                    await layout_checks(page, f'{w} {scheme} Profil')
                    shots.append(await shot(page, f'profil_{w}_{scheme}'))
                    await ctx.close()

        async with section('Grosse Schrift (24 px) bei 390 und 320 px'):
            for w in (390, 320):
                ctx, page = await open_ctx_theme(p, w, 'light')
                await ev(page, "() => { document.documentElement.style.fontSize = '24px'; }")
                await open_discover(page); await wait_discover_ready(page)
                await wait_js(page, "document.querySelectorAll('.lcard-item').length >= 15", ui_wait())
                await layout_checks(page, f'{w} grosse Schrift Entdecken')
                shots.append(await shot(page, f'entdecken_{w}_gross'))
                await ev(page, "(id) => libOpenDetail(id)", long_id); await wait_js(page, "lib.detail.status === 'ready'")
                await wait_js(page, "!!document.querySelector('.lib-detail-main')", ui_wait())
                await layout_checks(page, f'{w} grosse Schrift Detail', need_cards=False)
                shots.append(await shot(page, f'detail_{w}_gross'))
                await ctx.close()

        async with section('Tastatur: Fokus sichtbar, Filterfenster mit Escape und Fokusrueckgabe'):
            ctx, page = await open_ctx_theme(p, 390, 'light')
            await open_discover(page); await wait_discover_ready(page)
            await wait_js(page, "document.querySelectorAll('.lcard-item').length >= 1", ui_wait())
            found = None
            for _ in range(40):
                await page.keyboard.press('Tab')
                info = await ev(page, """() => { const e = document.activeElement; if (!e || !e.closest('.lcard-item')) return null;
                    const cs = getComputedStyle(e); return { a: e.getAttribute('data-action'), outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0, shadow: cs.boxShadow !== 'none' }; }""")
                if info: found = info; break
            check('Tab erreicht eine Karte', found is not None)
            check('Fokus auf der Karte sichtbar (outline oder box-shadow)', bool(found) and (found['outline'] or found['shadow']), found)
            shots.append(await shot(page, 'fokus_karte_390'))
            fb = page.locator('[data-action=lib-filter-open]').first
            await fb.focus(); await page.keyboard.press('Enter')
            await wait_js(page, "!!document.querySelector('[role=dialog]')", ui_wait())
            check('Filterfenster ist ein Dialog (role=dialog, aria-modal)', await ev(page, "document.querySelector('[role=dialog]').getAttribute('aria-modal') === 'true'"))
            check('Fokus liegt im Dialog', await ev(page, "!!(document.activeElement && document.activeElement.closest('[role=dialog]'))"))
            await ui_text(page, 'Zurücksetzen'); await ui_text(page, 'Rezepte anzeigen')
            shots.append(await shot(page, 'filterfenster_390'))
            await page.keyboard.press('Escape')
            await wait_js(page, "!document.querySelector('[role=dialog]')", 4000)
            await wait_js(page, "document.activeElement && document.activeElement.getAttribute('data-action') === 'lib-filter-open'", 4000)
            check('Escape schliesst, Fokus zurueck auf «Filter»', True)
            await ctx.close()

        async with section('Reduzierte Bewegung'):
            for motion in ('reduce', 'no-preference'):
                ctx, page = await open_ctx_theme(p, 390, 'light', motion=motion)
                await open_discover(page); await wait_discover_ready(page)
                await page.locator('[data-action=lib-filter-open]').first.click(timeout=ui_wait())
                await wait_js(page, "!!document.querySelector('.lib-filter-sheet')", ui_wait())
                d = await ev(page, """() => { const out = []; document.querySelectorAll('.lib-filter-sheet, .lib-filter-sheet *, .lcard, .lcard *, .lib-qf, .lib-switch-btn').forEach(e => {
                    const cs = getComputedStyle(e); const t = Math.max(...cs.transitionDuration.split(',').map(parseFloat)) * 1000, a = Math.max(...cs.animationDuration.split(',').map(parseFloat)) * 1000;
                    const tp = cs.transitionProperty; if (a > 10 || (t > 10 && !/^(opacity|color|background-color|border-color|box-shadow|outline-color)(,|$)/.test(tp.split(',')[0].trim()) && tp !== 'none')) out.push(e.className + ' ' + tp + ' ' + t + '/' + a); });
                    return out.slice(0, 5); }""")
                if motion == 'reduce':
                    check('Reduced motion: keine Bewegungsanimationen (nur Farbe/Deckkraft)', not d, d)
                else:
                    durs = await ev(page, "() => [...document.querySelectorAll('.lib-filter-sheet, .lcard, .lib-qf')].map(e => parseFloat(getComputedStyle(e).transitionDuration) * 1000).filter(x => x > 0)")
                    check('Ohne reduced motion: Uebergaenge 150 bis 220 ms', all(140 <= x <= 230 for x in durs), durs[:6])
                await ctx.close()

        async with section('Fehlende Bilder und Bildfehler'):
            ctx, page = await open_ctx_theme(p, 390, 'light')
            async def img404(route):
                if route.request.method == 'GET': await route.fulfill(status=404, body='x')
                else: await route.continue_()
            await page.route('**/storage/v1/object/sign/savora-public/**', img404)
            await open_discover(page); await wait_discover_ready(page)
            await wait_js(page, "document.querySelectorAll('.lcard-item').length >= 15", ui_wait())
            await wait_js(page, "[...document.images].filter(i => i.closest('.lcard')).every(i => i.complete)", 6000)
            r = await layout_checks(page, '390 Bilder nicht ladbar')
            check('Kaputte Bilder zeigen kein Browser-Fehlersymbol (Bild ausgeblendet oder Platzhalter)', await ev(page, "[...document.querySelectorAll('.lcard img')].every(i => i.naturalWidth > 0 || getComputedStyle(i).display === 'none' || getComputedStyle(i).visibility === 'hidden' || i.closest('.is-broken, .is-missing, [data-broken]'))"))
            check('Bilder ausserhalb des Bildschirms verzoegert (loading=lazy)', await ev(page, "[...document.querySelectorAll('.lcard img')].every(i => i.loading === 'lazy')"))
            shots.append(await shot(page, 'bildfehler_390'))
            await ctx.close()

        if hasattr(open_ctx_theme, 'b'): await open_ctx_theme.b.close()
    print('Bildschirmfotos:', SHOTS, f'({len([s for s in shots if s.endswith(".png")])} Dateien)')
    report(t0)

asyncio.run(main())
