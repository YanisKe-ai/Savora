"""0.89.0 Technik und Tempo (Helfer E): index.html mit defer und nicht blockierender pdf-print.css, Startadressen aus
manifest.json (Verknuepfungen, Teilen), Rueckkehr an die letzte Stelle in der installierten App, paralleles Laden,
spaeteres Laden von Naehrwertdatei und Cover-Schriften, Service Worker mit cache-first fuer die App-Schale."""
import asyncio, json, os, re, sys
os.environ.setdefault('SAVORA_TEST_PORT', '8989')
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

STANDALONE = "Object.defineProperty(window.navigator, 'standalone', { get: () => true, configurable: true });"
BASE = f"http://localhost:{PORT}/"

async def ready(page):
    await page.wait_for_function("typeof state !== 'undefined' && document.getElementById('app').children.length > 0", timeout=30000)
    await page.wait_for_timeout(500)

async def seeded_page(ctx):
    page = await ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    await goto(page)
    await page.evaluate(open(SEED_PATH).read())
    await page.wait_for_timeout(300)
    return page, errors

async def main():
    # ---------- 1. Statische Pruefungen ----------
    html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    tags = re.findall(r'<script[^>]*\ssrc="([^"]+)"[^>]*>', html)
    plain = re.findall(r'<script\s+src="[^"]+"\s*>', html)
    sync_ok = ['theme-init.js']   # v90: Farbschema muss vor dem ersten Bild laufen (frueher Inline-Skript), darum synchron im head
    check('index.html: alle App-Skripte mit defer (ausser theme-init.js)', len(tags) > 40 and [x for x in re.findall(r'<script\s+src="([^"]+)"\s*>', html)] == sync_ok and len(re.findall(r'<script defer src=', html)) == len(tags) - len(sync_ok), f'{len(tags)} Skripte')
    order = [t for t in tags]
    check('index.html: Reihenfolge der Kernskripte unveraendert (state vor views, ui vor app, app vor settings-konto)',
          order.index('state.js') < order.index('views-v2.js') < order.index('ui.js') < order.index('app.js') < order.index('settings-konto.js'))
    check('index.html: pdf-print.css blockiert nicht (media=print, data-print-css schaltet in theme-init.js auf all, noscript-Ersatz)',
          'href="pdf-print.css" media="print" data-print-css' in html and '<noscript><link rel="stylesheet" href="pdf-print.css"></noscript>' in html)
    man = json.load(open(os.path.join(ROOT, 'manifest.json'), encoding='utf-8'))
    urls = [s['url'] for s in man.get('shortcuts', [])]
    check('manifest: drei Verknuepfungen mit Startparametern', urls == ['./index.html?aktion=einkauf', './index.html?aktion=wochenplan', './index.html?aktion=neu'], str(urls))
    st = man.get('share_target', {})
    check('manifest: Teilen-Ziel per GET mit title/text/url', st.get('method') == 'GET' and st.get('action') == './index.html' and st.get('params') == {'title': 'share_title', 'text': 'share_text', 'url': 'share_url'}, str(st))
    sw = open(os.path.join(ROOT, 'sw.js'), encoding='utf-8').read()
    check('sw.js: App-Schale cache-first, Update weiter nur ueber SKIP_WAITING', 'v89 cache-first' in sw and "d.type === 'SKIP_WAITING'" in sw and 'self.skipWaiting()' not in sw.split("d.type === 'SKIP_WAITING'")[0])

    async with async_playwright() as p:
        # ---------- 2. Startadressen (ohne Service Worker) ----------
        browser, ctx = await open_ctx(p)
        page, errors = await seeded_page(ctx)
        check('pdf-print.css ist nach dem Laden aktiv (media all)', await page.evaluate("() => { const l = document.querySelector('link[href=\"pdf-print.css\"]'); return !!l && l.media === 'all' && !!l.sheet; }"))
        check('Paralleles Laden: Rezepte, Einkauf und Wochenplan sind da', await page.evaluate("() => state.recipes.length === 3 && state.shopping.length === 1 && Object.keys(state.mealplan).length >= 1"))
        for akt, view in [('einkauf', 'shopping'), ('wochenplan', 'mealplan'), ('neu', 'form')]:
            await page.goto(BASE + 'index.html?aktion=' + akt); await ready(page)
            await page.wait_for_function(f"state.view === '{view}'", timeout=5000)
            res = await page.evaluate("() => ({ view: state.view, search: location.search })")
            check(f'Verknuepfung ?aktion={akt} oeffnet {view}, Parameter verschwindet', res['view'] == view and 'aktion' not in res['search'], str(res))
        await page.goto(BASE + 'index.html?share_title=Linsensuppe&share_text=' + 'Zutaten%3A%20200%20g%20Linsen' + '&share_url=' + 'https%3A%2F%2Fexample.org%2Fsuppe'); await ready(page)
        await page.wait_for_function("state.view === 'paste-import' && document.getElementById('pasteText') && document.getElementById('pasteText').value.length > 0", timeout=5000)
        res = await page.evaluate("() => ({ v: document.getElementById('pasteText').value + ' ' + ((state.pasteImport && state.pasteImport.url) || ''), search: location.search, fn: typeof openTextImport === 'function' })")   # 0.90.1: Link wird still als Quelle gemerkt (kein Linkfeld mehr)
        check('Teilen: Textimport mit Text, Titel und Link als Quelle, kein Abruf, Parameter entfernt',
              'Linsen' in res['v'] and 'Linsensuppe' in res['v'] and 'https://example.org/suppe' in res['v'] and 'share_' not in res['search'], json.dumps(res, ensure_ascii=False))
        check('Teilen: ungueltiger Link (javascript:) wird nicht als Quelle genommen', await page.evaluate("() => appShareSourceUrl({ url: 'javascript:alert(1)', text: '' }) === '' && appShareSourceUrl({ url: '', text: 'siehe https://a.ch/x und mehr' }) === 'https://a.ch/x'"))
        # Ohne installierte App: Neuladen bleibt bei der Startseite (Browser-Verhalten unveraendert)
        await page.goto(URL); await ready(page)
        await page.evaluate("() => { state.activeRecipeId = 'r_legacy_1'; state.view = 'detail'; render(); }"); await page.wait_for_timeout(300)
        await page.reload(); await ready(page)
        check('Browser-Tab (nicht installiert): Neuladen startet auf der Startseite', await page.evaluate("state.view") == 'home')
        check('Keine Seitenfehler (Startadressen)', not errors, str(errors))
        await browser.close()

        # ---------- 3. Rueckkehr an die letzte Stelle in der installierten App ----------
        browser, ctx = await open_ctx(p)
        await ctx.add_init_script(STANDALONE)
        page, errors = await seeded_page(ctx)
        await page.evaluate("() => { state.activeRecipeId = 'r_legacy_1'; state.view = 'detail'; render(); }"); await page.wait_for_timeout(300)
        await page.reload(); await ready(page)
        res = await page.evaluate("() => ({ view: state.view, id: state.activeRecipeId })")
        check('App: Neustart oeffnet das zuletzt offene Rezept', res == {'view': 'detail', 'id': 'r_legacy_1'}, str(res))
        await page.go_back(); await page.wait_for_function("state.view === 'home'", timeout=5000)
        check('App: Zurueck fuehrt vom wiederhergestellten Rezept zur Startseite', await page.evaluate("state.view") == 'home')
        # Kochmodus mit Schritt
        await page.evaluate("() => { const b = document.createElement('button'); b.dataset.id = 'r_legacy_1'; return dispatchAction('start-cook', 'r_legacy_1', b, null); }")
        await page.wait_for_function("state.view === 'cookmode'", timeout=5000)
        await page.evaluate("() => { state.cookStepIndex = 1; saveCookProgress(); render(); }"); await page.wait_for_timeout(200)
        await page.reload(); await ready(page)
        await page.wait_for_function("state.view === 'cookmode'", timeout=5000)
        res = await page.evaluate("() => ({ view: state.view, id: state.activeRecipeId, step: state.cookStepIndex })")
        check('App: Neustart setzt den Kochmodus beim gemerkten Schritt fort', res == {'view': 'cookmode', 'id': 'r_legacy_1', 'step': 1}, str(res))
        await page.go_back(); await page.wait_for_function("state.view === 'detail'", timeout=5000)
        check('App: Zurueck aus dem fortgesetzten Kochmodus fuehrt ins Rezept', await page.evaluate("state.view === 'detail' && state.activeRecipeId === 'r_legacy_1'"))
        # Einkauf, Wochenplan
        for view in ['shopping', 'mealplan', 'cookbooks']:
            await page.evaluate(f"() => {{ state.modal = null; state.view = '{view}'; render(); }}"); await page.wait_for_timeout(250)
            await page.reload(); await ready(page)
            check(f'App: Neustart oeffnet wieder {view}', await page.evaluate("state.view") == view)
        # Verknuepfung hat Vorrang
        await page.goto(BASE + 'index.html?aktion=einkauf'); await ready(page)
        await page.evaluate("() => { state.view = 'mealplan'; render(); }"); await page.wait_for_timeout(250)
        await page.goto(BASE + 'index.html?aktion=einkauf'); await ready(page)
        check('App: Verknuepfung hat Vorrang vor der letzten Stelle', await page.evaluate("state.view") == 'shopping')
        # Alter Stand (ueber 12 Stunden) und geloeschtes Rezept: Startseite
        await page.evaluate("() => { state.view = 'form'; localStorage.setItem('savora-last-view', JSON.stringify({ view: 'detail', recipeId: 'r_legacy_2', at: Date.now() - 13 * 3600e3 })); }")   # form: beim Verlassen nichts neu merken
        await page.goto(URL); await ready(page)
        check('App: Stand aelter als 12 Stunden wird nicht wiederhergestellt', await page.evaluate("state.view") == 'home')
        await page.evaluate("() => { state.view = 'form'; localStorage.setItem('savora-last-view', JSON.stringify({ view: 'detail', recipeId: 'gibt-es-nicht', at: Date.now() })); }")
        await page.goto(URL); await ready(page)
        check('App: fehlendes Rezept fuehrt sauber zur Startseite', await page.evaluate("state.view") == 'home')
        await page.evaluate("() => { state.view = 'form'; localStorage.setItem('savora-last-view', '{kaputt'); }")
        await page.goto(URL); await ready(page)
        check('App: beschaedigter Eintrag stoert den Start nicht', await page.evaluate("state.view") == 'home')
        # Editor wird nicht als Stelle gemerkt (hat eigenen Entwurf)
        await page.evaluate("() => { state.view = 'shopping'; render(); }"); await page.wait_for_timeout(200)
        await page.evaluate("() => dispatchAction('new-recipe', null, null, null)"); await page.wait_for_function("state.view === 'form'")
        check('App: Editor wird nicht als letzte Stelle gemerkt', json.loads(await page.evaluate("localStorage.getItem('savora-last-view')"))['view'] == 'shopping')
        check('Keine Seitenfehler (Wiederherstellung)', not errors, str(errors))
        await browser.close()

        # ---------- 4. Spaeteres Laden: Naehrwertdatei und Cover-Schriften nicht im Kaltstart ----------
        browser, ctx = await open_ctx(p)
        page = await ctx.new_page()
        reqs = []
        page.on('request', lambda r: reqs.append((r.url.split('/')[-1], asyncio.get_event_loop().time())))
        t0 = asyncio.get_event_loop().time()
        await page.goto(URL); await ready(page)
        t_load = asyncio.get_event_loop().time()
        early = [n for n, t in reqs if n in ('swiss-fcd-data.json', 'roboto.woff2', 'baloo2.woff2', 'sofia-sans-extra-condensed.woff2')]
        check('Kaltstart: Naehrwertdatei und Cover-Schriften noch nicht geladen', not early, str(early))
        await page.wait_for_function("(async () => true)()")
        await page.wait_for_timeout(6000)
        late = sorted(set(n for n, t in reqs if n in ('swiss-fcd-data.json', 'roboto.woff2', 'baloo2.woff2')))
        check('Danach im Leerlauf: Naehrwertdatei und Cover-Schriften werden geladen', late == ['baloo2.woff2', 'roboto.woff2', 'swiss-fcd-data.json'], str(late))
        check('Naehrwertdaten sind eingespielt', await page.evaluate("async () => (await getSwissFoodsCached()).length > 100"))
        await browser.close()

        # ---------- 5. Service Worker: cache-first, offline, wartender Worker bleibt kontrolliert ----------
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={"width": 390, "height": 844})
        await ctx.add_init_script("try{localStorage.setItem('savora-splash-seen','1')}catch(e){}")
        page = await ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        await page.goto(URL)
        await page.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.ready.then(() => true)")
        await page.evaluate(open(SEED_PATH).read())
        await page.reload(); await ready(page)
        await page.wait_for_function("!!navigator.serviceWorker.controller", timeout=15000)
        marker = await page.evaluate("""async () => {
          const name = (await caches.keys()).find(k => k.startsWith('savora-shell-'));
          const c = await caches.open(name);
          const real = await c.match('./legal.js');
          const txt = await real.text();
          await c.put('./legal.js', new Response(txt + '\\n/*v89-cache-first*/', { headers: { 'content-type': 'application/javascript' } }));
          const got = await (await fetch('legal.js')).text();
          await c.put('./legal.js', new Response(txt, { headers: { 'content-type': 'application/javascript' } }));
          return got.includes('/*v89-cache-first*/');
        }""")
        check('SW: Shell-Datei kommt aus dem Cache (cache-first), auch online', marker)
        nav = await page.evaluate("""async () => { const r = await fetch('index.html?aktion=einkauf', { mode: 'same-origin' }); return r.ok && (await r.text()).includes('id="app"'); }""")
        check('SW: Startadresse mit Parametern liefert die App-Seite', nav)
        await ctx.set_offline(True)
        await page.goto(BASE + 'index.html?aktion=wochenplan'); await ready(page)
        check('SW: offline startet die App ueber eine Verknuepfung (Wochenplan)', await page.evaluate("state.view") == 'mealplan')
        await page.goto(URL); await ready(page)
        n = await page.evaluate("() => ({ view: state.view, n: state.recipes.length, cards: document.querySelectorAll('[data-action=\"open-recipe\"]').length })")
        check('SW: offline zeigt die Rezepte', n['view'] == 'home' and n['n'] == 3 and n['cards'] >= 3, str(n))
        await ctx.set_offline(False)
        check('Keine Seitenfehler (Service Worker)', not errors, str(errors))
        await browser.close()

    print('\nERGEBNIS:', 'ALLE OK' if not FAIL else f'{len(FAIL)} FEHLER: ' + '; '.join(FAIL))
    sys.exit(1 if FAIL else 0)

asyncio.run(main())
