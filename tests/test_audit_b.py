"""Audit B (Offline und Performance): B03, P01, P02, P04, P05.

B03  Aktivierung loescht nur alte Savora-Caches, nie fremde (Test mit 'other-app-test')
P01  Installation klappt auch ohne optionale grosse Dateien; Vollaufloesung nicht in der Installation;
     "Fuer offline verfuegbar" erst nach vollstaendiger Pruefung
P02  jsPDF/html2canvas laden bei Bedarf, bei Doppelklick genau einmal; Fehler, Wiederholen, Offline-Hinweis;
     Export funktioniert offline nach Vorbereitung
P04  Lazy-Bilder aus IndexedDB: viewportnah, begrenzte Parallelitaet, kein Schreiben in neue Ansichten, URLs freigegeben
P05  Fehlerseiten werden nie gecacht; ein teilweise scheiternder Update-Download laesst die bestehende Version nutzbar
"""
import os, shutil, sys, tempfile, time
import os as _os
sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
_os.environ.setdefault('SAVORA_TEST_PORT', '9651')
from common import *
import common

FAIL = []
def check(name, ok, info=''):
    print(('OK   ' if ok else 'FEHL ') + name, info if (not ok or info) else '')
    if not ok: FAIL.append(name)

SKIP_DIRS = {'ios', 'docs', 'tests', 'node_modules', '.git', 'supabase', 'native-plugins', 'scripts'}
def make_site(version=None, remove=()):
    """Kopie der App (ohne grosse Nebenordner). Optional anderer SW_VERSION-Wert und entfernte Dateien (liefern dann 404)."""
    dest = tempfile.mkdtemp(prefix='savora-site-')
    for name in os.listdir(ROOT):
        src = os.path.join(ROOT, name)
        if name in SKIP_DIRS or name.startswith('.') or os.path.islink(src): continue
        if os.path.isdir(src): shutil.copytree(src, os.path.join(dest, name))
        else: shutil.copy2(src, os.path.join(dest, name))
    if version:
        p = os.path.join(dest, 'sw.js'); s = open(p, encoding='utf-8').read()
        import re
        s = re.sub(r"const SW_VERSION = '[^']*'", f"const SW_VERSION = '{version}'", s)
        open(p, 'w', encoding='utf-8').write(s)
    for r in remove:
        os.remove(os.path.join(dest, r))
    return dest

# --- Anfrage-Protokoll und Fehlersimulation im gemeinsamen Testserver ---
REQ = []
MODE = {'fail': False}
_orig_get = common._Handler.do_GET
def _do_get(self):
    path = self.path.split('?')[0]
    REQ.append(path)
    if MODE['fail'] and path == '/utils.js':
        body = b'<html><body>Serverfehler</body></html>'
        self.send_response(500); self.send_header('Content-Type', 'text/html'); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body); return
    if MODE['fail'] and path == '/units.js':
        body = b'<html><body>Weiterleitung auf Startseite</body></html>'
        self.send_response(200); self.send_header('Content-Type', 'text/html'); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body); return
    _orig_get(self)
common._Handler.do_GET = _do_get

def is_fullres(p): return p.startswith('/assets/covers/') and '/thumbs/' not in p and p.endswith('.png')
N_COVER = len([f for f in os.listdir(os.path.join(ROOT, 'assets', 'covers')) if f.endswith('.png')])   # Vollaufloesung: alle Cover-PNGs (dynamisch)

async def sw_ctx(p, w=390, h=844):
    b = await p.chromium.launch()
    c = await b.new_context(viewport={"width": w, "height": h}, accept_downloads=True, reduced_motion='reduce', timezone_id='UTC')
    await c.add_init_script("try{localStorage.setItem('savora-splash-seen','1')}catch(e){}")
    return b, c

async def wait_controlled(page, timeout=40000):
    await page.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller", timeout=timeout)

async def wait_waiting(page, timeout=40):
    """Wartet, bis ein neuer Service Worker im Zustand "waiting" ist (wait_for_function wartet nicht auf Promises)."""
    for _ in range(timeout * 2):
        if await page.evaluate("navigator.serviceWorker.getRegistration().then(r => !!r.waiting)"): return True
        await page.wait_for_timeout(500)
    raise AssertionError('kein wartender Service Worker')

async def cache_keys(page):
    return await page.evaluate("caches.keys()")

async def ready_app(page):
    await page.wait_for_function("typeof state !== 'undefined' && document.getElementById('app').children.length > 0", timeout=30000)
    await page.wait_for_timeout(300)

SEED = open(SEED_PATH).read()

async def t_b03(p):
    print('--- B03 Cache-Eigentum')
    SITE.set_dir(ROOT)
    b, c = await sw_ctx(p); page = await c.new_page()
    await page.goto(URL); await wait_controlled(page); await ready_app(page)
    keys0 = await cache_keys(page)
    check('B03 Installation legt eigene Caches an', any(k.startswith('savora-shell-') for k in keys0), str(keys0))
    for name in ('other-app-test', 'savora-v4', 'savora-shell-v1-alt', 'savora-data-v1-alt', 'savora-runtime-v1-alt'):
        await page.evaluate("async (n) => { const c = await caches.open(n); await c.put('/x-' + n, new Response('x')); }", name)
    v2 = make_site(version='v99-audit-test')
    SITE.set_dir(v2)
    await page.evaluate("navigator.serviceWorker.getRegistration().then(r => r.update())")
    await wait_waiting(page)
    check('B03 Neue Version wartet (keine stille Uebernahme)', True)
    await page.evaluate("navigator.serviceWorker.getRegistration().then(r => r.waiting.postMessage({ type: 'SKIP_WAITING' }))")
    keys = []
    for _ in range(60):
        await page.wait_for_timeout(500)
        try: keys = await cache_keys(page)
        except Exception: continue
        if 'savora-shell-v99-audit-test' in keys and not any(k.startswith('savora-') and 'v99-audit-test' not in k for k in keys): break
    check('B03 Fremder Cache "other-app-test" bleibt erhalten', 'other-app-test' in keys, str(keys))
    check('B03 Alte Savora-Caches (auch frueherer Namensraum) sind weg', not any(k.startswith('savora-') and 'v99-audit-test' not in k for k in keys), str(keys))
    check('B03 Aktuelle Savora-Caches bleiben', 'savora-shell-v99-audit-test' in keys, str(keys))
    await b.close(); SITE.set_dir(ROOT)

async def t_p01(p):
    print('--- P01 optionale Dateien, Offline-Anzeige')
    # a) Normale Installation: keine Vollaufloesung
    SITE.set_dir(ROOT); REQ.clear()
    b, c = await sw_ctx(p); page = await c.new_page()
    await page.goto(URL); await wait_controlled(page); await ready_app(page)
    await page.wait_for_timeout(1500)
    full = [r for r in REQ if is_fullres(r)]
    check('P01 Installation und Start laden keine Cover in Vollaufloesung', not full, str(full))
    thumbs = [r for r in REQ if '/covers/thumbs/' in r]
    check('P01 Kleine Vorschaubilder gehoeren zur Installation', len(set(thumbs)) >= 10, str(len(set(thumbs))))
    shell = await page.evaluate("(async () => { const k = (await caches.keys()).find(n => n.startsWith('savora-shell-')); const c = await caches.open(k); return (await c.keys()).length; })()")
    check('P01 Shell-Cache vollstaendig gefuellt', shell >= 90, str(shell))
    await page.evaluate(SEED); await page.wait_for_timeout(300)
    # b) Offline-Anzeige: zunaechst teilweise, nie faelschlich "verfuegbar"
    await page.evaluate("state.view = 'settings-offline'; render()"); await page.wait_for_selector('#kontoOfflineBox .kd-status-title', timeout=8000)
    await page.wait_for_function("kd.offline.phase === 'partial'", timeout=15000)
    txt = await page.inner_text('#kontoOfflineBox .kd-status-title')
    check('P01 Vor der Vorbereitung steht nicht "Fuer offline verfuegbar"', not txt.startswith('Für offline verfügbar'), txt)
    vis = await page.evaluate("!!document.querySelector('[data-action=\"konto-offline-prepare\"]')")
    check('P01 Knopf "Offline-Inhalte laden" sichtbar', vis, str(vis))
    await page.click('[data-action="konto-offline-prepare"]')
    await page.wait_for_function("kd.offline.phase === 'ready'", timeout=60000)
    txt = await page.inner_text('#kontoOfflineBox .kd-status-title')
    check('P01 Nach vollstaendiger Pruefung: "Offline bereit"', txt.startswith('Offline bereit'), txt)
    hid = await page.evaluate("!document.querySelector('[data-action=\"konto-offline-prepare\"]')")
    check('P01 Knopf ist danach ausgeblendet', hid, str(hid))
    full = [r for r in REQ if is_fullres(r)]
    check('P01 Vorbereitung hat Vollaufloesung geholt', len(set(full)) == N_COVER, f'{len(set(full))} von {N_COVER}')
    # c) Offline: Start, Cover in Vollaufloesung, PDF-Export
    await c.set_offline(True)
    await page.reload(); await ready_app(page)
    n = await page.evaluate("document.querySelectorAll('.rcard, .rrow').length")
    check('P02/P01 Offline-Start zeigt Rezepte', n > 0, str(n))
    ok = await page.evaluate("fetch('assets/covers/05-nachtkueche.png').then(r => r.ok && r.headers.get('content-type'))")
    check('P01 Cover in Vollaufloesung offline verfuegbar', bool(ok), str(ok))
    res = await page.evaluate("""async () => { try { const r = await buildSinglePdf('r_legacy_1', 'off', { template: 'A' }); return r && r.blob ? r.blob.size : 0; } catch (e) { return 'FEHLER ' + e.message; } }""")
    check('P02 PDF-Export funktioniert offline nach Vorbereitung', isinstance(res, int) and res > 1000, str(res))
    check('P02 Bibliotheken kamen aus dem Cache (offline geladen)', await page.evaluate("pdfLibsReady()"))
    await c.set_offline(False)
    await b.close()
    # d) Fehlende optionale Dateien: Installation klappt trotzdem
    broken = make_site(version='v98-optional-missing', remove=['assets/covers/05-nachtkueche.png', 'swiss-fcd-data.json'])
    SITE.set_dir(broken)
    b, c = await sw_ctx(p); page = await c.new_page()
    await page.goto(URL); await wait_controlled(page); await ready_app(page)
    keys = await cache_keys(page)
    check('P01 Installation klappt auch wenn optionale Dateien 404 liefern', any(k == 'savora-shell-v98-optional-missing' for k in keys), str(keys))
    await c.set_offline(True); await page.reload(); await ready_app(page)
    check('P01 Shell offline nutzbar trotz fehlender optionaler Dateien', await page.evaluate("document.getElementById('app').children.length > 0"))
    await c.set_offline(False)
    await page.evaluate("state.view = 'settings-offline'; render()"); await page.wait_for_selector('#kontoOfflineBox .kd-status-title')
    await page.wait_for_function("kd.offline.phase === 'partial'", timeout=15000)
    await page.click('[data-action="konto-offline-prepare"]')
    await page.wait_for_function("kd.offline.phase === 'partial' || kd.offline.phase === 'ready'", timeout=30000)
    await page.wait_for_timeout(500)
    ph = await page.evaluate("kd.offline.phase")
    check('P01 Fehlende Datei: Anzeige bleibt ehrlich "teilweise" statt "verfuegbar"', ph == 'partial', ph)
    await b.close(); SITE.set_dir(ROOT)

async def t_p02(p):
    print('--- P02 PDF-Bibliotheken bei Bedarf')
    SITE.set_dir(ROOT)
    b, c = await open_ctx(p, 390, 844, 'reduce'); page = await c.new_page()
    reqs = []
    page.on('request', lambda r: reqs.append(r.url.split('?')[0].rsplit('/', 1)[-1]))
    errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
    await goto(page); await page.evaluate(SEED); await page.wait_for_timeout(300)
    check('P02 Kaltstart laedt jsPDF/html2canvas nicht', not any(r in ('jspdf.umd.min.js', 'html2canvas.min.js') for r in reqs), str([r for r in reqs if 'pdf' in r or 'canvas' in r]))
    check('P02 Globale Objekte fehlen vor dem ersten Export', await page.evaluate("typeof window.jspdf === 'undefined' && typeof window.html2canvas === 'undefined'"))
    await page.evaluate("state.activeRecipeId = 'r_legacy_1'; state.view = 'detail'; render(); openModal({ type: 'pdf-export', target: 'single', recipeId: 'r_legacy_1', stage: 'options', template: pdfDefaultTemplateId(), nutritionDetail: 'off' })")
    await page.wait_for_selector('[data-action="pdf-export-build"]', timeout=8000)
    await page.wait_for_function("pdfLibsReady()", timeout=15000)
    await page.dblclick('[data-action="pdf-export-build"]')
    await page.wait_for_function("state.modal && state.modal.stage === 'preview'", timeout=60000)
    n_j = reqs.count('jspdf.umd.min.js'); n_h = reqs.count('html2canvas.min.js')
    check('P02 Doppelklick: jsPDF genau einmal geladen', n_j == 1, str(n_j))
    check('P02 Doppelklick: html2canvas genau einmal geladen', n_h == 1, str(n_h))
    check('P02 Gemeinsame Promise: genau ein Ladevorgang', await page.evaluate("pdfLibLoadCount") == 1)
    check('P02 Export erzeugt PDF-Vorschau', await page.evaluate("state.modal.previewBlob && state.modal.previewBlob.size > 1000"))
    check('P02 Keine Seitenfehler', not errs, str(errs))
    await b.close()

    # Fehler, Wiederholen
    b, c = await open_ctx(p, 390, 844, 'reduce'); page = await c.new_page()
    await goto(page); await page.evaluate(SEED); await page.wait_for_timeout(300)
    await page.route('**/jspdf.umd.min.js', lambda r: r.abort())
    await page.evaluate("state.activeRecipeId = 'r_legacy_1'; state.view = 'detail'; render(); openModal({ type: 'pdf-export', target: 'single', recipeId: 'r_legacy_1', stage: 'options', template: pdfDefaultTemplateId(), nutritionDetail: 'off' })")
    await page.wait_for_selector('[data-action="pdf-export-build"]'); await page.wait_for_timeout(500)
    await page.click('[data-action="pdf-export-build"]')
    await page.wait_for_function("state.modal && state.modal.stage === 'error' && !!document.querySelector('.pdf-error-text')", timeout=30000)
    toast = await page.evaluate("document.querySelector('.pdf-error-text').textContent")
    check('P02 Ladefehler: verstaendliche Meldung, Rezepte unveraendert', 'PDF-Werkzeuge' in toast and 'erneut' in toast, toast)
    check('P02 Nach Fehler Export wieder moeglich (Zustand error mit «Erneut versuchen»)', await page.evaluate("state.modal.stage") == 'error' and await page.locator('[data-action="pdf-export-build"]').count() == 1)
    await page.unroute('**/jspdf.umd.min.js')
    await page.wait_for_timeout(300)
    await page.click('[data-action="pdf-export-build"]')
    await page.wait_for_function("state.modal && state.modal.stage === 'preview'", timeout=60000)
    check('P02 Wiederholen laedt neu und gelingt', True)
    await b.close()

    # Offline-Hinweis
    b, c = await open_ctx(p, 390, 844, 'reduce'); page = await c.new_page()
    await goto(page); await page.evaluate(SEED); await page.wait_for_timeout(300)
    await page.route('**/html2canvas.min.js', lambda r: r.abort())
    await c.set_offline(True)
    await page.evaluate("state.activeRecipeId = 'r_legacy_1'; state.view = 'detail'; render(); openModal({ type: 'pdf-export', target: 'single', recipeId: 'r_legacy_1', stage: 'options', template: pdfDefaultTemplateId(), nutritionDetail: 'off' })")
    await page.wait_for_selector('[data-action="pdf-export-build"]'); await page.wait_for_timeout(500)
    await page.click('[data-action="pdf-export-build"]')
    await page.wait_for_function("state.modal && state.modal.stage === 'error' && !!document.querySelector('.pdf-error-text')", timeout=30000)
    toast = await page.evaluate("document.querySelector('.pdf-error-text').textContent")
    check('P02 Offline ohne Bibliothek: Offline-Hinweis', 'offline' in toast, toast)
    await b.close()

async def t_p05(p):
    print('--- P05 Fehlerseiten, Teil-Netzausfall')
    SITE.set_dir(ROOT); MODE['fail'] = False
    b, c = await sw_ctx(p); page = await c.new_page()
    await page.goto(URL); await wait_controlled(page); await ready_app(page)
    shell = (await cache_keys(page))
    shell = [k for k in shell if k.startswith('savora-shell-')][0]
    before = await page.evaluate("async (k) => { const c = await caches.open(k); return [await (await c.match('utils.js')).text(), await (await c.match('units.js')).text()]; }", shell)
    MODE['fail'] = True
    await page.reload(); await ready_app(page)
    await page.wait_for_timeout(500)
    after = await page.evaluate("async (k) => { const c = await caches.open(k); return [await (await c.match('utils.js')).text(), await (await c.match('units.js')).text()]; }", shell)
    check('P05 HTTP-500-Fehlerseite ersetzt keine gecachte Datei', after[0] == before[0] and not after[0].lstrip().startswith('<'))
    check('P05 HTML mit Status 200 anstelle von JS wird nicht gecacht', after[1] == before[1] and not after[1].lstrip().startswith('<'))
    check('P05 App startet trotz Fehlerantworten (gecachte Dateien greifen)', await page.evaluate("typeof state !== 'undefined' && typeof escapeHtml === 'function' && document.getElementById('app').children.length > 0"))
    MODE['fail'] = False

    # Update mit teilweisem Ausfall: neue Version kann nicht vollstaendig geladen werden
    v2 = make_site(version='v97-partial', remove=['cookbooks.js'])
    SITE.set_dir(v2)
    before_keys = await cache_keys(page)
    await page.evaluate("navigator.serviceWorker.getRegistration().then(r => r.update().catch(() => {}))")
    await page.wait_for_timeout(6000)
    st = await page.evaluate("navigator.serviceWorker.getRegistration().then(r => ({ waiting: !!r.waiting, installing: !!r.installing, active: !!r.active }))")
    keys = await cache_keys(page)
    check('P05 Unvollstaendiges Update wird nicht uebernommen (nichts wartend)', not st['waiting'] and not st['installing'] and st['active'], str(st))
    check('P05 Kein halb gefuellter Cache der neuen Version', 'savora-shell-v97-partial' not in keys, str(keys))
    check('P05 Bestehende Caches bleiben', shell in keys, str(keys))
    await c.set_offline(True)
    await page.reload(); await ready_app(page)
    n = await page.evaluate("document.querySelectorAll('.rcard, .rrow, .empty-state').length")
    check('P05 Bestehende Version bleibt offline nutzbar', n >= 0 and await page.evaluate("typeof state !== 'undefined' && document.getElementById('app').children.length > 0"))
    await c.set_offline(False)
    await b.close(); SITE.set_dir(ROOT)

    # Entwurfsschutz beim Uebernehmen
    v3 = make_site(version='v96-ok')
    b, c = await sw_ctx(p); page = await c.new_page()
    SITE.set_dir(ROOT)
    await page.goto(URL); await wait_controlled(page); await ready_app(page)
    await page.reload(); await ready_app(page)   # jetzt von Anfang an vom Service Worker kontrolliert (wie bei einem echten Folgebesuch)
    await page.evaluate(SEED); await page.wait_for_timeout(300)
    await page.evaluate("openForm(state.recipes[0])"); await page.wait_for_selector('#f-title')
    await page.fill('#f-title', 'Ungespeicherter Entwurfstitel')
    await page.wait_for_timeout(1200)
    SITE.set_dir(v3)
    await page.evaluate("navigator.serviceWorker.getRegistration().then(r => r.update())")
    await wait_waiting(page)
    marker = await page.evaluate("window.__noReload = true; true")
    await page.evaluate("navigator.serviceWorker.getRegistration().then(r => r.waiting.postMessage({ type: 'SKIP_WAITING' }))")
    await page.wait_for_timeout(4000)
    still = await page.evaluate("window.__noReload === true && document.getElementById('f-title') && document.getElementById('f-title').value")
    check('P05 Update-Uebernahme laedt nicht mitten im Editor mit Aenderungen neu', still == 'Ungespeicherter Entwurfstitel', str(still))
    draft = await page.evaluate("(() => { const d = loadRecipeDraft(); return d && d.recipe && d.recipe.title; })()")
    check('P05 Entwurf wurde gesichert', draft == 'Ungespeicherter Entwurfstitel', str(draft))
    await page.evaluate("state.editingRecipeSnapshot = formDirtySnapshot(collectFormData())")   # wie nach dem Speichern: nicht mehr veraendert
    await page.wait_for_function("window.__noReload !== true", timeout=15000)
    check('P05 Nach dem Speichern/Verlassen wird die neue Version geladen', True)
    await b.close(); SITE.set_dir(ROOT)

async def t_p04(p):
    print('--- P04 Lazy-Bilder')
    SITE.set_dir(ROOT)
    b, c = await open_ctx(p, 390, 844, 'reduce'); page = await c.new_page()
    errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
    await goto(page)
    N = 150
    await page.evaluate("""async (N) => {
      const cv = document.createElement('canvas'); cv.width = 40; cv.height = 40; cv.getContext('2d').fillRect(0, 0, 40, 40);
      const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.8));
      const list = [];
      for (let i = 0; i < N; i++) {
        await dbPutImage({ id: 'imgt_' + i, blob, thumbBlob: blob, mime: 'image/jpeg' });
        const r = emptyRecipe(); r.id = 'rt_' + i; r.title = 'Testrezept ' + i; r.imageId = 'imgt_' + i; list.push(r);
      }
      window.__calls = 0; window.__act = 0; window.__max = 0;
      const orig = window.dbGetImage;
      window.dbGetImage = async function (id) { window.__calls++; window.__act++; window.__max = Math.max(window.__max, window.__act); await new Promise(r => setTimeout(r, 40)); try { return await orig(id); } finally { window.__act--; } };
      state.recipes = list; state.view = 'home'; render();
    }""", N)
    await page.wait_for_timeout(1500)
    hyd = await page.evaluate("document.querySelectorAll('.home-main img').length || document.querySelectorAll('#app img').length")
    left = await page.evaluate("document.querySelectorAll('[data-lazy-img]').length")
    check('P04 Nur viewportnahe Bilder werden geladen (nicht alle ' + str(N) + ')', 0 < hyd < N and left > 0, f'geladen={hyd} offen={left}')
    check('P04 Lese-Aufrufe entsprechen den geladenen Bildern', await page.evaluate("window.__calls") <= hyd + 3, str(await page.evaluate("window.__calls")))
    check('P04 Hoechstens 3 gleichzeitige Lesevorgaenge', await page.evaluate("window.__max") <= 3, str(await page.evaluate("window.__max")))
    await page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)")
    await page.wait_for_timeout(2500)
    hyd2 = await page.evaluate("document.querySelectorAll('#app img').length")
    check('P04 Beim Scrollen kommen weitere Bilder nach', hyd2 > hyd, f'{hyd} -> {hyd2}')
    # URLs freigeben: neue Ansicht, danach nur noch URLs verbundener Bilder
    await page.evaluate("state.view = 'settings'; render(); state.view = 'home'; render(); window.scrollTo(0, 0)")
    await page.wait_for_timeout(1500)
    leak = await page.evaluate("[...lazyImgUrls.keys()].filter(i => !i.isConnected).length")
    check('P04 Object-URLs nicht mehr verbundener Bilder sind freigegeben', leak == 0, str(leak))
    # Veraltete Ergebnisse: Ansicht wird waehrend des Ladens ersetzt
    await page.evaluate("window.__calls = 0; state.view = 'home'; render(); document.getElementById('app').innerHTML = '<p id=\"leer\">leer</p>'")
    await page.wait_for_timeout(1200)
    st = await page.evaluate("({ imgs: document.querySelectorAll('#app img').length, urls: [...lazyImgUrls.keys()].filter(i => !i.isConnected).length })")
    check('P04 Veraltete Ergebnisse landen nicht in einer neuen Ansicht', st['imgs'] == 0 and st['urls'] == 0, str(st))
    check('P04 Keine Seitenfehler', not errs, str(errs))
    await b.close()

async def main():
    async with async_playwright() as p:
        for fn in (t_b03, t_p01, t_p02, t_p05, t_p04):
            try: await fn(p)
            except Exception as e:
                import traceback; traceback.print_exc()
                check(fn.__name__ + ' ohne Ausnahme', False, repr(e))
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
    sys.exit(1 if FAIL else 0)
asyncio.run(main())
