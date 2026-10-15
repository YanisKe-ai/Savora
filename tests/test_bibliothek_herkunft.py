"""Rezeptbibliothek: Herkunft gespeicherter Kopien (recipe.publicOrigin, recipe.publicTips).
Prueft validateRecipe (gueltig, ungueltig, Adresse wird nie vertraut), Sicherung und Wiederherstellung, privaten Abgleich ueber
den Supabase-Nachbau (tests/mock_supabase.py), Freunde-Versand einer Kopie (reduzierte Herkunft, Absender und Autor als zwei
Rollen), die Herkunftszeile im Rezeptdetail (recipe-origin.js) und das PDF (Text in der Quellzeile, keine zusaetzliche Seite).
Hoechstens ein Testbrowser gleichzeitig (mehrere Kontexte im selben Browser). Ports: SAVORA_TEST_PORT (Standard 23000),
SAVORA_MOCK_PORT (Standard 23001). SAVORA_PDF_TEXT_SHIFT_MM wirkt auf den PDF-Teil (Linux-Simulation)."""
import asyncio, json, os, sys, threading, uuid
os.environ.setdefault('SAVORA_TEST_PORT', '23000')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *   # noqa: E402,F401
import mock_supabase as M   # noqa: E402
from http.server import ThreadingHTTPServer   # noqa: E402

MOCK_PORT = int(os.environ.get('SAVORA_MOCK_PORT', '23001'))
srv = ThreadingHTTPServer(('127.0.0.1', MOCK_PORT), M.H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
CLOUD = "window.SAVORA_CLOUD_URL_OVERRIDE = 'http://127.0.0.1:%d'" % MOCK_PORT + "; window.SAVORA_CLOUD_KEY_OVERRIDE = 'test-key';"
SITE = 'https://yaniske-ai.github.io/Savora/'
PID = '3f2b8a10-1c2d-4e5f-8a9b-0123456789ab'
ORIGIN = {'publicationId': PID, 'authorPublicId': 'anna00000001', 'authorName': 'Anna Grün', 'savedVersion': 3, 'savedAt': 1760000000000,
          'url': SITE + '?rezept=' + PID, 'imagePending': True}
RECIPE = {'id': 'r_lib_1', 'title': 'Zitronenkuchen aus der Bibliothek', 'servings': 8, 'timeMinutes': 60,
          'ingredients': [{'amount': '200', 'unit': 'g', 'name': 'Mehl'}, {'amount': '2', 'unit': '', 'name': 'Zitronen'}],
          'steps': [{'text': 'Alles verrühren.'}, {'text': 'Backen.'}], 'notes': 'Meine private Notiz', 'source': 'https://www.example.ch/kuchen',
          'publicTips': 'Am Vortag backen, dann ist er saftiger.', 'publicOrigin': ORIGIN}
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

async def device(browser, name):
    """Ein Geraet = ein eigener Kontext (eigener Speicher) im gemeinsamen Browser."""
    ctx = await browser.new_context(viewport={'width': 390, 'height': 844}, accept_downloads=True, reduced_motion='reduce', timezone_id='UTC')
    await ctx.add_init_script(NO_SW + " try{localStorage.setItem('savora-splash-seen','1')}catch(e){}")
    await ctx.add_init_script(CLOUD)
    page = await ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(f'{name}: {e}'))
    page.on('console', lambda m: errs.append(f'{name} console: {m.text}') if m.type == 'error' and '400 (Bad Request)' not in m.text else None)
    page.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    await goto(page)
    if not await page.evaluate("typeof recipeOriginHtml === 'function'"):   # bis der Integrator recipe-origin.js in index.html einbindet
        await page.add_script_tag(url=URL.rsplit('/', 1)[0] + '/recipe-origin.js')
    return ctx, page, errs
def add_user(email):
    M.USERS[email] = {'id': str(uuid.uuid4()), 'password': 'geheim-123', 'confirmed': True}
    return M.USERS[email]['id']
async def login(page, email):
    await show(page, "() => { state.modal = null; state.view = 'settings-account'; render(); }", '#cloudEmail')
    await page.fill('#cloudEmail', email); await page.fill('#cloudPassword', 'geheim-123')
    await page.evaluate("document.querySelector('[data-action=\"cloud-sign-in\"]').click()")
    await page.wait_for_function("cloudSignedIn() && !cloud.syncing", timeout=15000)
    await page.evaluate("cloudSyncNow()")
async def recipe(page, rid):
    return await page.evaluate("(id) => { const r = state.recipes.find(x => x.id === id); return r ? JSON.parse(JSON.stringify(r)) : null; }", rid)
async def wait_py(cond, timeout=10.0):
    t = 0.0
    while not cond() and t < timeout: await asyncio.sleep(0.1); t += 0.1
    return cond()

async def teil_app(p):
    browser = await p.chromium.launch()
    try:
        cA, pa, errA = await device(browser, 'A')
        # ---------- 1. validateRecipe ----------
        v = await pa.evaluate("(r) => validateRecipe(r)", RECIPE)
        po = (v.get('recipe') or {}).get('publicOrigin') or {}
        check('validateRecipe: gueltige Herkunft bleibt vollstaendig erhalten', v['ok'] and not v['warnings'] and po == ORIGIN and v['recipe']['publicTips'] == RECIPE['publicTips'], json.dumps(v)[:300])
        bad = dict(RECIPE, publicOrigin=dict(ORIGIN, url='https://evil.example/?x=1', admin=True, owner='x', publicationId=PID.upper()))
        v = await pa.evaluate("(r) => validateRecipe(r)", bad)
        po = v['recipe']['publicOrigin']
        check('validateRecipe: Adresse wird lokal neu gebaut, fremde Felder fallen weg', v['ok'] and po['url'] == SITE + '?rezept=' + PID and 'admin' not in po and 'owner' not in po and po['publicationId'] == PID, json.dumps(po))
        v = await pa.evaluate("(r) => validateRecipe(r)", dict(RECIPE, publicOrigin={'publicationId': 'keine-uuid'}, publicTips=12))
        check('validateRecipe: ungueltige Herkunft wird entfernt, Rezept bleibt gueltig, mit Warnung',
              v['ok'] and 'publicOrigin' not in v['recipe'] and 'publicTips' not in v['recipe'] and len(v['warnings']) == 2 and v['recipe']['title'] == RECIPE['title'], json.dumps(v['warnings'], ensure_ascii=False))
        v = await pa.evaluate("(r) => validateRecipe(r)", dict(RECIPE, publicOrigin=dict(ORIGIN, authorPublicId='GROSS', savedVersion=0, savedAt='gestern', imagePending='ja', authorName='x' * 41), publicTips='y' * 2001))
        po = v['recipe'].get('publicOrigin') or {}
        check('validateRecipe: ungueltige Teilfelder einzeln entfernt (publicationId bleibt)', v['ok'] and set(po) == {'publicationId', 'url'} and 'publicTips' not in v['recipe'] and len(v['warnings']) == 6, json.dumps(po))
        v = await pa.evaluate("(r) => validateRecipe(r)", dict(RECIPE, publicOrigin='text'))
        check('validateRecipe: Herkunft als Text wird entfernt', v['ok'] and 'publicOrigin' not in v['recipe'])
        v = await pa.evaluate("(r) => validateRecipe(r)", {k: x for k, x in RECIPE.items() if k not in ('publicOrigin', 'publicTips')})
        check('validateRecipe: Rezept ohne Herkunft unveraendert, keine Warnung', v['ok'] and not v['warnings'] and 'publicOrigin' not in v['recipe'])

        # ---------- 2. Sicherung und Wiederherstellung (ohne Konto) ----------
        await pa.evaluate("async (f) => { await dbPut(Object.assign(emptyRecipe(), f)); await loadRecipes(); }", RECIPE)
        async with pa.expect_download() as dl:
            await pa.evaluate("downloadBackup()")
        data = json.load(open(await (await dl.value).path(), encoding='utf-8'))
        exp = next((r for r in data['recipes'] if r['id'] == 'r_lib_1'), {})
        check('Sicherung enthaelt Herkunft und Kochtipps', exp.get('publicOrigin') == ORIGIN and exp.get('publicTips') == RECIPE['publicTips'], json.dumps(exp.get('publicOrigin')))
        exp['publicOrigin']['url'] = 'https://evil.example/'   # manipulierte Sicherung: Adresse darf nicht uebernommen werden
        await pa.evaluate("async () => { await dbDelete('r_lib_1'); await loadRecipes(); }")
        await pa.evaluate("async (t) => { await restoreBackupFromFile(new File([t], 'savora-sicherung.json', { type: 'application/json' })); }", json.dumps(data))
        r = await recipe(pa, 'r_lib_1')
        check('Wiederherstellung: gleiche lokale ID, Herkunft erhalten, Adresse neu gebaut',
              r and r['publicOrigin'] == ORIGIN and r['publicTips'] == RECIPE['publicTips'] and r['notes'] == RECIPE['notes'], json.dumps(r and r.get('publicOrigin')))
        # Einzelnes geteiltes Rezept als Datei (type recipe-share): Herkunft geprueft, neue ID
        share_file = {'type': 'recipe-share', 'sharedBy': 'Datei', 'recipe': dict(RECIPE, id='r_datei', title='Aus Datei', publicOrigin=dict(ORIGIN, url='javascript:alert(1)'))}
        await pa.evaluate("async (t) => { await restoreBackupFromFile(new File([t], 'rezept.json', { type: 'application/json' })); }", json.dumps(share_file))
        r = await pa.evaluate("() => JSON.parse(JSON.stringify(state.recipes.find(x => x.title === 'Aus Datei') || null))")
        check('Rezeptdatei: Herkunft erhalten, Adresse neu gebaut, nichts veroeffentlicht', r and r['publicOrigin']['url'] == ORIGIN['url'] and r['publicOrigin']['publicationId'] == PID and len(M.LOG) == 0, json.dumps(r and r.get('publicOrigin')))

        # ---------- 3. Privater Abgleich: Herkunft und lokale ID bleiben ----------
        uid_a = add_user('yanis@example.test'); uid_b = add_user('berta@example.test')
        await login(pa, 'yanis@example.test')
        await wait_py(lambda: M.RECORDS.get((uid_a, 'recipe', 'r_lib_1')) is not None, 20.0)   # erster Abgleich laeuft asynchron (Linux langsamer)
        row = M.RECORDS.get((uid_a, 'recipe', 'r_lib_1'))
        check('Abgleich: Rezept mit Herkunft hochgeladen', row and row['data'].get('publicOrigin') == ORIGIN and row['data'].get('publicTips') == RECIPE['publicTips'], json.dumps(row and row['data'].get('publicOrigin')))
        # Server-Daten manipulieren: eine fremde Adresse und Zusatzfelder duerfen auf dem zweiten Geraet nicht ankommen
        row['data']['publicOrigin'] = dict(ORIGIN, url='https://evil.example/', canEdit=True)
        cA2, pa2, errA2 = await device(browser, 'A2')
        await login(pa2, 'yanis@example.test')
        await pa2.wait_for_function("state.recipes.some(r => r.id === 'r_lib_1')", timeout=10000)
        r = await recipe(pa2, 'r_lib_1')
        check('Abgleich: zweites Geraet erhaelt Herkunft mit gleicher lokaler ID, Adresse neu gebaut, keine Zusatzrechte',
              r and r['publicOrigin'] == ORIGIN and r['publicTips'] == RECIPE['publicTips'], json.dumps(r and r.get('publicOrigin')))
        await cA2.close()

        # ---------- 4. Freunde-Versand einer Kopie ----------
        M.PROFILES[uid_a] = {'handle': 'yanis', 'display_name': 'Yanis', 'invite_code': 'SAV-AAAA-BBBB'}
        M.PROFILES[uid_b] = {'handle': 'berta', 'display_name': 'Berta', 'invite_code': 'SAV-CCCC-DDDD'}
        M.CONNS[(uid_a, uid_b)] = 'accepted'
        await pa.evaluate("async () => { await shareRefresh(); state.activeRecipeId = 'r_lib_1'; state.view = 'detail'; render(); openModal({ type: 'share-send', recipeId: 'r_lib_1' }); }")
        await pa.wait_for_selector('input[name="shareTo"][value="berta"]', state='attached', timeout=8000)
        sheet_text = await pa.evaluate("document.querySelector('input[name=\"shareTo\"]').closest('[role=dialog], .modal-sheet, .sheet') ? document.querySelector('input[name=\"shareTo\"]').closest('[role=dialog], .modal-sheet, .sheet').innerText : document.body.innerText")
        check('Sendefenster nennt, was mitgesendet wird', 'Mitgesendet werden Zutaten, Zubereitung und deine Notizen.' in sheet_text, sheet_text[:200])
        await pa.evaluate("() => { document.querySelector('input[name=\"shareTo\"][value=\"berta\"]').checked = true; document.querySelector('[data-action=\"share-send\"]').click(); }")
        await wait_py(lambda: len(M.SHARES) == 1)
        sent = next(iter(M.SHARES.values()))['recipe'] if M.SHARES else {}
        check('Versand: Herkunft auf publicationId, authorPublicId, authorName reduziert',
              sent.get('publicOrigin') == {'publicationId': PID, 'authorPublicId': 'anna00000001', 'authorName': 'Anna Grün'}, json.dumps(sent.get('publicOrigin')))
        check('Versand: Kochtipps mit, Notizen wie bisher mit, keine ID/Favoriten/Absender', sent.get('publicTips') == RECIPE['publicTips'] and sent.get('notes') == RECIPE['notes'] and 'id' not in sent and 'sharedBy' not in sent and 'favorite' not in sent)
        cB, pb, errB = await device(browser, 'B')
        await login(pb, 'berta@example.test')
        await pb.evaluate("async () => { await shareRefresh(); share.previewId = share.inbox[0].id; state.view = 'settings-share-preview'; render(); }")
        await pb.wait_for_selector('[data-action="share-accept"]', timeout=8000)
        prev = await pb.evaluate("document.body.innerText")
        check('Vorschau: Absender und Autor als zwei Rollen sichtbar', 'Von Yanis' in prev and 'Aus der Rezeptbibliothek, von Anna Grün' in prev and 'Am Vortag backen' in prev, prev[:300])
        n0 = await pb.evaluate("state.recipes.length")
        await pb.evaluate("document.querySelector('[data-action=\"share-accept\"]:not([data-mode])').click()")
        await pb.wait_for_function("(n) => state.recipes.length > n && state.view === 'detail'", arg=n0, timeout=10000)
        r = await pb.evaluate("() => JSON.parse(JSON.stringify(state.recipes.find(x => x.id === state.activeRecipeId)))")
        po = r.get('publicOrigin') or {}
        check('Empfaenger: Herkunft geprueft uebernommen (ohne savedAt/savedVersion/imagePending), Absender = sharedBy',
              set(po) == {'publicationId', 'authorPublicId', 'authorName', 'url'} and po['url'] == ORIGIN['url'] and r.get('sharedBy') == 'yanis' and r['id'] != 'r_lib_1', json.dumps(po))
        # ---------- 5. Herkunftszeile im Rezeptdetail (recipe-origin.js), auch offline ----------
        await cB.set_offline(True)
        html = await pb.evaluate("() => { const r = state.recipes.find(x => x.id === state.activeRecipeId); const d = document.createElement('div'); d.id = 'originProbe'; d.innerHTML = recipeOriginHtml(r); document.body.appendChild(d); return d.innerHTML; }")
        txt = await pb.evaluate("document.getElementById('originProbe').innerText")
        btn = await pb.evaluate("(() => { const b = document.querySelector('#originProbe [data-action=\"lib-open\"]'); return b ? [b.tagName, b.dataset.id, b.textContent.trim()] : null; })()")
        check('Detail: Quelle, Bibliothek mit Autor und Absender getrennt sichtbar (offline, ohne Netz)',
              'Quelle: example.ch' in txt and 'Aus der Rezeptbibliothek, von Anna Grün' in txt and 'Geteilt von yanis' in txt and btn == ['BUTTON', PID, 'Original ansehen'] and 'source-line' in html, txt.replace('\n', ' | '))
        plain = await pb.evaluate("recipeOriginPlain(state.recipes.find(x => x.id === state.activeRecipeId))")
        check('recipeOriginPlain: alle Rollen als Text', plain == 'Quelle: https://www.example.ch/kuchen · Aus der Rezeptbibliothek, von Anna Grün · Geteilt von yanis', plain)
        await cB.set_offline(False)
        cases = await pa.evaluate("""() => {
          const base = { title: 'X', ingredients: [], steps: [] };
          const probe = (r) => { const d = document.createElement('div'); d.innerHTML = recipeOriginHtml(r); return { text: d.innerText || d.textContent, img: !!d.querySelector('img'), btn: !!d.querySelector('[data-action="lib-open"]') }; };
          return {
            none: recipeOriginHtml(base),
            noname: probe(Object.assign({}, base, { publicOrigin: { publicationId: '%s' } })),
            xss: probe(Object.assign({}, base, { publicOrigin: { publicationId: '%s', authorName: '<img src=x onerror=alert(1)>' } })),
            broken: probe(Object.assign({}, base, { publicOrigin: { publicationId: 'kaputt', authorName: 'Eva' } })),
          };
        }""" % (PID, PID))
        check('Detail: ohne Herkunft keine Zeile', cases['none'] == '')
        check('Detail: ohne Namen «Aus der Savora-Rezeptbibliothek»', 'Aus der Savora-Rezeptbibliothek' in cases['noname']['text'] and cases['noname']['btn'], json.dumps(cases['noname'], ensure_ascii=False))
        check('Detail: Autorname wird nur als Text gezeigt', not cases['xss']['img'] and '<img' in cases['xss']['text'])
        check('Detail: kaputte Herkunft erzeugt keinen Knopf', not cases['broken']['btn'] and 'Eva' not in cases['broken']['text'])

        errs = [e for e in errA + errB + errA2 if 'Failed to load resource' not in e and 'Schweizer' not in e]
        check('Keine Konsolenfehler', not errs, str(errs[:4]))
    finally:
        await browser.close()

async def teil_pdf():
    from pdf_harness import PdfSession, alle_pruefungen
    shift = os.environ.get('SAVORA_PDF_TEXT_SHIFT_MM', '0')
    origin = dict(ORIGIN, authorName='Anna Müller-Grünenfelder')
    async with PdfSession(os.path.join(OUT, 'pdf_herkunft')) as s:
        for stil in TEMPLATE_IDS:
            for rid, erwartet in (('pdf_carbonara', 'Quelle Aus der Savora-Rezeptbibliothek, von Anna Müller-Grünenfelder'), ('pdf_sloppy', 'Bibliothek: Anna Müller-Grünenfelder'), ('pdf_zweiseiten', 'Aus der Savora-Rezeptbibliothek, von Anna')):
                await s.page.evaluate("(id) => { delete state.recipes.find(x => x.id === id).publicOrigin; }", rid)
                ohne = await s.single(rid, stil, 'off', name=f'herkunft_{rid}_{stil}_ohne')
                await s.page.evaluate("([id, po]) => { state.recipes.find(x => x.id === id).publicOrigin = po; }", [rid, origin])
                mit = await s.single(rid, stil, 'off', name=f'herkunft_{rid}_{stil}_mit')
                t = ' '.join(mit.text().replace(' ', ' ').split())
                check(f'PDF {stil} {rid}: Herkunft im Text', erwartet in t and 'rezept=' not in t, t[-160:])
                check(f'PDF {stil} {rid}: keine zusaetzliche Seite', mit.seiten() == ohne.seiten(), f'{ohne.seiten()} -> {mit.seiten()}')
                a, b = alle_pruefungen(ohne), alle_pruefungen(mit)
                neu = {k: len(b[k]) - len(a[k]) for k in ('raender', 'ueberlappung', 'schrift', 'wortbruch', 'ueberschriften', 'bilder', 'fortsetzung') if len(b[k]) > len(a[k])}
                check(f'PDF {stil} {rid}: keine neuen Befunde (Ränder, Überlappung, Schrift, Wortbruch; Verschiebung {shift} mm)', not neu, json.dumps({k: b[k][:2] for k in neu}, ensure_ascii=False)[:400])
                print('     Seitenbilder:', ', '.join(mit.render()))
        check('PDF: keine Seitenfehler', not s.fehler, str(s.fehler[:3]))

async def main():
    async with async_playwright() as p:
        await teil_app(p)
    await teil_pdf()   # danach (eigener Browser), damit nie zwei Testbrowser gleichzeitig laufen
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
