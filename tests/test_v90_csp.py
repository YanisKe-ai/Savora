"""v90 Punkt 4: Inhaltsrichtlinie (CSP). Streng: Die Meta-Richtlinie aus index.html wird in die Seite eingesetzt
(auch solange sie dort noch auskommentiert ist), der Browser erzwingt sie (bypass_csp aus). Supabase (die echte Adresse,
damit connect-src/img-src wirklich geprueft werden) wird per page.route auf den lokalen Nachbau umgeleitet.
Gepruefte Wege: Start, Rezept (mit Foto = blob:), Bearbeiten, PDF-Export, Anmelden und Abgleich, Bibliotheksbild.
Danach: keine Inline-Ereignisattribute (on...=) mehr in den App-Skripten.
Meldet jeden Verstoss (securitypolicyviolation) mit Wert und Quelle."""
import asyncio, json, os, re, sys, threading, urllib.request, urllib.error, uuid
os.environ.setdefault('SAVORA_TEST_PORT', '49060')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
import mock_supabase as M
from http.server import ThreadingHTTPServer
MOCK_PORT = int(os.environ.get('SAVORA_MOCK_PORT', '49061'))
threading.Thread(target=ThreadingHTTPServer(('127.0.0.1', MOCK_PORT), M.H).serve_forever, daemon=True).start()
SUPA = 'https://npvhdgaxhbmblykiztnn.supabase.co'
FAIL = []
LOGNET = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

HTML = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
META = re.search(r'<meta http-equiv="Content-Security-Policy"[^>]*>', HTML)
POLICY = META.group(0) if META else None

SPY = """(() => {  window.__csp = []; document.addEventListener('securitypolicyviolation', e => { window.__csp.push(e.violatedDirective + ' | ' + (e.blockedURI || '').slice(0, 80) + ' | ' + (e.sourceFile || '').split('/').pop() + ':' + e.lineNumber + ' | ' + (e.sample || '').slice(0, 60)); }); })();"""
PNG = bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082')

def proxy(route):
    req = route.request
    url = 'http://127.0.0.1:%d%s' % (MOCK_PORT, req.url[len(SUPA):])
    if req.url.startswith(SUPA + '/storage/v1/object/sign/lib-bild'):
        return asyncio.ensure_future(route.fulfill(status=200, headers={'Access-Control-Allow-Origin': '*', 'Content-Type': 'image/png'}, body=PNG))
    hdrs = {k: v for k, v in req.headers.items() if k.lower() in ('authorization', 'content-type', 'prefer')}
    hdrs['apikey'] = 'test-key'   # der Nachbau kennt nur diesen Schluessel (die echte App sendet ihren oeffentlichen Schluessel)
    data = req.post_data_buffer
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, data=data, headers=hdrs, method=req.method), timeout=10)
        code, body, ct = r.status, r.read(), r.headers.get('Content-Type', 'application/json')
    except urllib.error.HTTPError as e:
        code, body, ct = e.code, e.read(), e.headers.get('Content-Type', 'application/json')
    asyncio.ensure_future(route.fulfill(status=code, headers={'Access-Control-Allow-Origin': '*', 'Content-Type': ct}, body=body))

async def until(page, js, secs):
    # Nicht wait_for_function: Playwright wertet dort Text mit eval aus, was die strenge Richtlinie (zu Recht) verbietet.
    for _ in range(int(secs * 5)):
        if await page.evaluate('() => !!(' + js + ')'): return True
        await page.wait_for_timeout(200)
    return False

async def violations(page):
    return await page.evaluate("window.__csp.slice()")

async def step(page, name, seen):
    v = await violations(page)
    new = v[seen[0]:]; seen[0] = len(v)
    check('Keine CSP-Verstösse: ' + name, not new, ' || '.join(new[:6]))

async def main():
    check('Meta-Richtlinie in index.html vorhanden (auch auskommentiert)', bool(POLICY))
    check('Richtlinie ohne unsafe-inline/unsafe-eval fuer Skripte', bool(POLICY) and "script-src 'self'" in POLICY and 'unsafe-eval' not in POLICY and not re.search(r"script-src[^;]*unsafe", POLICY))
    check('Richtlinie: connect-src nennt nur self, lokale data:/blob: und Supabase', bool(POLICY) and re.search(r"connect-src 'self'( data:)?( blob:)? " + re.escape(SUPA) + ";", POLICY) is not None)
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={'width': 390, 'height': 844}, accept_downloads=True, reduced_motion='reduce', timezone_id='UTC', bypass_csp=False)
        await ctx.add_init_script(NO_SW + " try{localStorage.setItem('savora-splash-seen','1')}catch(e){}")
        await ctx.add_init_script(SPY)
        async def serve_index(route):
            r = await route.fetch(); body = await r.text()
            active = re.search(r'<meta http-equiv="Content-Security-Policy"', re.sub(r'<!--.*?-->', '', body, flags=re.S))
            if POLICY and not active:
                body = body.replace('<head>', '<head>\n' + POLICY, 1)
            await route.fulfill(response=r, body=body, headers={**r.headers})
        await ctx.route(re.compile(r'.*/index\.html(\?.*)?$'), serve_index)
        await ctx.route(SUPA + '/**', proxy)
        page = await ctx.new_page()
        page.on('requestfailed', lambda r: LOGNET.append('FAIL ' + r.url[:90] + ' ' + str(r.failure)))
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'Content Security Policy' in m.text else None)
        seen = [0]
        await goto(page)
        active = await page.evaluate("[...document.querySelectorAll('meta[http-equiv]')].some(m => /content-security-policy/i.test(m.httpEquiv))")
        check('Meta-Richtlinie ist im geladenen Dokument aktiv', active)
        check('Seite startet (Kopfbereich und Navigation da)', await page.evaluate("!!document.querySelector('nav, .bottom-nav, header')"))
        await step(page, 'Start', seen)

        await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(600)
        await step(page, 'Beispieldaten (Rezepte, Bilder)', seen)

        await page.evaluate("state.activeRecipeId = 'r_legacy_1'; state.view = 'detail'; render();")
        await page.wait_for_selector('img[src^="blob:"]', timeout=8000, state='attached')
        check('Rezeptfoto (blob:) wird angezeigt', await page.evaluate("[...document.querySelectorAll('img[src^=\"blob:\"]')].some(i => i.complete && i.naturalWidth > 0)"))
        await step(page, 'Rezept mit Foto (blob:)', seen)

        await page.evaluate("state.editingRecipe = JSON.parse(JSON.stringify(state.recipes.find(r => r.id === 'r_legacy_1'))); state.view = 'form'; render();")
        await page.wait_for_timeout(500)
        await step(page, 'Rezept bearbeiten', seen)
        await page.evaluate("state.editingRecipe = null; state.view = 'detail'; render();"); await page.wait_for_timeout(300)

        # Fenster mit Inline-Handler (Filter, Loeschen, Einkauf auswaehlen ...): Klick auf den Hintergrund schliesst, Klick im Blatt nicht
        await page.evaluate("state.view = 'home'; render();"); await page.wait_for_timeout(300)
        await page.evaluate("openModal({ type: 'nutrition' , recipeId: 'r_legacy_1' }, null)"); await page.wait_for_timeout(500)
        has = await page.evaluate("!!document.querySelector('.modal-sheet[data-stop-click]')")
        if has:
            await page.locator('.modal-sheet').first.click(position={'x': 20, 'y': 20}); await page.wait_for_timeout(250)
            check('Klick im Fenster-Blatt schliesst das Fenster nicht (data-stop-click)', await page.evaluate("!!document.querySelector('.modal-sheet')"))
        await page.evaluate("closeModal && closeModal()"); await page.wait_for_timeout(200)
        await step(page, 'Fenster (Naehrwerte)', seen)

        # PDF-Export
        await page.evaluate("state.activeRecipeId = 'r_legacy_1'; state.view = 'detail'; render();"); await page.wait_for_timeout(300)
        await page.evaluate("openModal({ type: 'pdf-export', target: 'single', recipeId: 'r_legacy_1', stage: 'options', template: pdfDefaultTemplateId(), nutritionDetail: 'off' }, null)")
        await page.wait_for_selector('[data-action="pdf-export-build"]', timeout=8000)
        check('PDF-Fenster: Blatt mit data-stop-click', await page.evaluate("!!document.querySelector('.pdf-export-sheet[data-stop-click]')"))
        await page.locator('[data-action="pdf-export-build"]').click()
        ok = await until(page, "state.modal && state.modal.stage === 'preview'", 60)
        check('PDF-Export erzeugt eine Vorschau', ok, await page.evaluate("() => String(state.modal && (state.modal.stage + ' ' + (state.modal.error || '')))"))
        await step(page, 'PDF-Export (Skripte, Blob, Vorschau)', seen)
        await page.evaluate("closeModal && closeModal()"); await page.wait_for_timeout(300)

        # Anmelden und Abgleich ueber die echte Supabase-Adresse (umgeleitet)
        M.USERS['csp@example.test'] = {'id': str(uuid.uuid4()), 'password': 'geheim-123', 'confirmed': True}
        await page.evaluate("state.view = 'settings-account'; render();")
        await page.wait_for_selector('#cloudEmail', timeout=8000)
        await page.fill('#cloudEmail', 'csp@example.test'); await page.fill('#cloudPassword', 'geheim-123')
        await page.locator('[data-action="cloud-sign-in"]').click()
        await page.wait_for_timeout(2500)
        check('Anmeldung ueber die umgeleitete Supabase-Adresse klappt', await page.evaluate("typeof cloudSignedIn === 'function' && cloudSignedIn()"))
        n = len([k for k in M.RECORDS if k[1] == 'recipe'])
        check('Abgleich: Rezepte liegen im Nachbau', n >= 1, 'recipes=%d' % n)
        await step(page, 'Anmelden und Abgleich', seen)

        # Bibliotheksbild: Bild von der Supabase-Adresse (img-src) laedt, kaputtes Bild entfernt sich (data-img-remove-on-error)
        res = await page.evaluate("""async () => {
          const host = document.createElement('div'); host.id = 'cspLibProbe';
          host.innerHTML = '<img class="ok" alt="" width="40" height="40" data-img-loaded data-img-remove-on-error src="%s/storage/v1/object/sign/lib-bild.png"><img class="bad" alt="" width="40" height="40" data-img-loaded data-img-remove-on-error src="%s/storage/v1/object/sign/fehlt.png">';
          document.body.appendChild(host);
          const ok = host.querySelector('.ok');
          await new Promise(r => setTimeout(r, 1500));
          return { okLoaded: !!(ok && ok.classList.contains('is-loaded')), badGone: !host.querySelector('.bad'), okExists: !!ok };
        }""" % (SUPA, SUPA))
        check('Bibliotheksbild (Supabase-Adresse) laedt und bekommt is-loaded', res['okLoaded'], str(res))
        check('Kaputtes Bild entfernt sich (data-img-remove-on-error)', res['badGone'], str(res))
        await step(page, 'Bibliotheksbild', seen)

        # Theme: das ausgelagerte theme-init.js setzt das Schema vor dem ersten Bild
        await page.evaluate("localStorage.setItem('savora-theme','dark')"); await page.reload()
        await until(page, "document.getElementById('app').children.length > 0", 30)
        check('theme-init.js setzt data-theme=dark (kein Inline-Skript)', await page.evaluate("document.documentElement.getAttribute('data-theme') === 'dark'"))
        check('PDF-Seitenstile werden fuer alle Medien aktiv (data-print-css)', await page.evaluate("[...document.querySelectorAll('link[data-print-css]')].every(l => l.media === 'all')"))
        await step(page, 'Neuladen mit dunklem Schema', seen)
        check('Keine Konsolenmeldungen zu Content Security Policy', not errs, ' | '.join(errs[:4]))
        await browser.close()

    # Statische Pruefung: keine Inline-Ereignisattribute in App-Skripten und index.html
    bad = []
    for f in sorted(os.listdir(ROOT)):
        if not (f.endswith('.js') or f.endswith('.html')) or f.endswith('.min.js') or f in ('jspdf.umd.min.js', 'html2canvas.min.js', 'csp-compat.js', 'theme-init.js', 'sw.js'): continue
        for i, line in enumerate(open(os.path.join(ROOT, f), encoding='utf-8').read().split('\n'), 1):
            if re.search(r'''\bon(click|error|load|submit|change|input|keydown|keyup|focus|blur|mouse\w+|touch\w+)\s*=\s*["']''', line) and not line.lstrip().startswith(('//', '*', '/*')):
                bad.append('%s:%d' % (f, i))
    check('Keine Inline-Ereignisattribute (on...=") in App-Skripten und index.html', not bad, ', '.join(bad[:20]))
    print('\n%d Fehler' % len(FAIL) if FAIL else '\nAlles gruen')
    sys.exit(1 if FAIL else 0)

asyncio.run(main())
