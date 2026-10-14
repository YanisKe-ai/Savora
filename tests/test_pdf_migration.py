"""Stil-IDs der Rezeptseiten: alte IDs (A, B, C, leer, unbekannt) werden auf «pur» / «prise-pop» abgebildet, ueberall wo eine ID
gespeichert oder gelesen wird: Merkzettel im Browser (savora-pdf-template), Kochbuch-Projekte, alte Einzelkonfiguration, Wiederherstellung
alter Sicherungen und Cloud-Abgleich. Idempotent und ohne Datenverlust (nur das Feld pdfTemplate aendert sich)."""
import asyncio, json, sys, threading, uuid
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
import p1_stub
STUB = p1_stub.ensure_new_styles()
import mock_supabase as M
from http.server import ThreadingHTTPServer
MOCK_PORT = int(os.environ.get('SAVORA_MOCK_PORT', str(PORT + 100)))
srv = ThreadingHTTPServer(('127.0.0.1', MOCK_PORT), M.H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
CLOUD = f"window.SAVORA_CLOUD_URL_OVERRIDE = 'http://127.0.0.1:{MOCK_PORT}'; window.SAVORA_CLOUD_KEY_OVERRIDE = 'test-key';"
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

# Erwartete Abbildung (Vertrag): A, C, leer, unbekannt -> pur; B -> prise-pop; neue IDs bleiben
MAP = [('A', 'pur'), ('B', 'prise-pop'), ('C', 'pur'), ('', 'pur'), ('gibtsnicht', 'pur'), (None, 'pur'), ('pur', 'pur'), ('prise-pop', 'prise-pop')]

def book(i, tpl):
    cfg = {'title': f'Buch {i}', 'subtitle': 'Slogan', 'author': 'Autorin', 'chapters': [{'id': 'c1', 'name': 'Backen'}], 'items': [{'recipeId': 'r_x', 'chapterId': 'c1'}],
           'chapterPages': True, 'showLogo': False, 'cover': {'v': 1, 'templateId': 'bistro', 'date': '2025-05-17', 'showDate': True}, 'eigenesFeld': {'bleibt': [1, 2, 3]}}
    if tpl != '__fehlt__': cfg['pdfTemplate'] = tpl
    return {'id': f'cb_{i}', 'name': f'Kochbuch {i}', 'createdAt': 1000 + i, 'updatedAt': 2000 + i, 'config': cfg}

def strip(cfg):
    c = dict(cfg); c.pop('pdfTemplate', None); return c

async def main():
    async with async_playwright() as p:
        browser, ctx = await open_ctx(p, 390, 844)
        await ctx.add_init_script(CLOUD)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append('console: ' + m.text[:120]) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(500)
        ev = page.evaluate
        print('Nachbau der neuen Stile aktiv (Vorlagen-Tabelle noch nicht im Repo):', STUB)
        check('Normalisierungsfunktion ist vorhanden', await ev("typeof pdfNormalizeTemplateId === 'function'"))

        # ---------- 1. Merkzettel im Browser ----------
        bad = []
        for old, new in MAP:
            got = await ev("""(v) => { if (v === null) localStorage.removeItem('savora-pdf-template'); else localStorage.setItem('savora-pdf-template', v); return pdfDefaultTemplateId(); }""", old)
            if got != new: bad.append((old, got, new))
        check('Merkzettel savora-pdf-template: alle alten IDs → richtige neue ID', not bad, str(bad))
        again = await ev("[pdfNormalizeTemplateId('A'), pdfNormalizeTemplateId(pdfNormalizeTemplateId('A')), pdfNormalizeTemplateId(pdfNormalizeTemplateId('B')), pdfNormalizeTemplateId(undefined), pdfNormalizeTemplateId(42)]")
        check('Normalisierung ist idempotent und fängt Fremdwerte ab', again == ['pur', 'pur', 'prise-pop', 'pur', 'pur'], str(again))
        await ev("localStorage.setItem('savora-pdf-template', 'B')")
        await ev("() => { state.modal = null; }")
        await ev("(id) => { state.activeRecipeId = id; state.view = 'detail'; render(); openModal({ type: 'pdf-export', target: 'single', recipeId: id, stage: 'options', template: pdfDefaultTemplateId(), nutritionDetail: 'off' }); }", await ev("state.recipes[0].id"))
        await page.wait_for_selector('.pdf-tpl-opt')
        check('Dialog mit gemerktem alten Stil B: Prise Pop vorgewählt', await ev("document.querySelector('.pdf-tpl-opt.active').dataset.id") == 'prise-pop')
        await ev("closeModal()")

        # ---------- 2. Kochbuch-Projekte ----------
        store = {'v': 1, 'activeId': 'cb_0', 'books': [book(i, t) for i, (t, _) in enumerate(MAP)] + [book(99, '__fehlt__')], 'eigenerSchluessel': 'bleibt'}
        await ev("(s) => { localStorage.setItem(COOKBOOK_PROJECTS_KEY, JSON.stringify(s)); }", store)
        got = await ev("() => { const s = cookbookStoreRead(); return { books: s.books, raw: JSON.parse(localStorage.getItem(COOKBOOK_PROJECTS_KEY)), extra: s.eigenerSchluessel }; }")
        res = [(b['config'].get('pdfTemplate', '__fehlt__')) for b in got['books']]
        want = [n for _, n in MAP] + ['__fehlt__']
        check('Kochbuch-Projekte: jede alte ID wird richtig abgebildet, fehlendes Feld bleibt fehlend', res == want, f'{res} erwartet {want}')
        lost = [b['id'] for b, orig in zip(got['books'], store['books']) if strip(b['config']) != strip(orig['config']) or b['name'] != orig['name'] or b['createdAt'] != orig['createdAt'] or b['updatedAt'] != orig['updatedAt']]
        check('Kochbuch-Projekte: kein anderes Feld geht verloren (Titel, Kapitel, Auswahl, Titelblatt, Eigenes, Zeitstempel)', not lost and got['extra'] == 'bleibt' and got['books'][0]['config']['eigenesFeld'] == {'bleibt': [1, 2, 3]}, str(lost))
        check('Kochbuch-Projekte: abgebildete Werte stehen auch gespeichert da', [b['config'].get('pdfTemplate', '__fehlt__') for b in got['raw']['books']] == want)
        t1 = await ev("localStorage.getItem(COOKBOOK_PROJECTS_KEY)")
        await ev("cookbookStoreRead(); cookbookStoreRead(); getCookbookConfig();")
        t2 = await ev("localStorage.getItem(COOKBOOK_PROJECTS_KEY)")
        check('Kochbuch-Projekte: erneutes Lesen ändert nichts (idempotent)', t1 == t2)
        check('Kochbuch-Konfiguration liefert die neue ID', await ev("(() => { cookbookSetActive('cb_1'); return getCookbookConfig().pdfTemplate; })()") == 'prise-pop')

        # ---------- 3. Alte Einzelkonfiguration ----------
        legacy = {'title': 'Altes Buch', 'subtitle': 'Alt', 'author': 'Alte Autorin', 'pdfTemplate': 'C', 'coverRecipeId': 'r_x', 'items': [], 'chapters': [{'id': 'c1', 'name': 'Backen'}]}
        r = await ev("""(l) => { localStorage.removeItem(COOKBOOK_PROJECTS_KEY); localStorage.setItem(COOKBOOK_CONFIG_KEY, JSON.stringify(l)); const c = getCookbookConfig(); return { tpl: c.pdfTemplate, title: c.title, author: c.author, coverRecipeId: c.coverRecipeId, chapters: c.chapters, legacy: JSON.parse(localStorage.getItem(COOKBOOK_CONFIG_KEY)) }; }""", legacy)
        check('Alte Einzelkonfiguration (Stil C) → pur, übrige Felder unverändert', r['tpl'] == 'pur' and r['title'] == 'Altes Buch' and r['author'] == 'Alte Autorin' and r['coverRecipeId'] == 'r_x' and r['chapters'] == legacy['chapters'], str(r))
        check('Alte Einzelkonfiguration bleibt als Sicherung unverändert gespeichert', r['legacy'] == legacy)

        # ---------- 4. Alte Sicherung wiederherstellen ----------
        old = await ev("""async () => { const rs = await dbGetAll(); localStorage.removeItem(COOKBOOK_PROJECTS_KEY); localStorage.removeItem(COOKBOOK_CONFIG_KEY); cookbookStoreRead();
          const mk = (id, tpl) => ({ id, name: 'Aus Sicherung ' + id, createdAt: 5, updatedAt: 6, config: { title: 'T ' + id, subtitle: 'S', author: 'Au', pdfTemplate: tpl, chapters: [], items: [{ recipeId: rs[0].id, chapterId: '' }], eigen: 7 } });
          const bk1 = { app: 'savora', version: 3, schemaVersion: 4, recipes: rs, shopping: [], settings: { collections: [], cookbookConfig: { title: 'Alt', subtitle: '', author: '', pdfTemplate: 'C', items: [{ recipeId: rs[0].id, chapterId: '' }], chapters: [] } } };
          const bk2 = { app: 'savora', version: 3, schemaVersion: 5, recipes: rs, shopping: [], settings: { collections: [], cookbooks: { v: 1, activeId: 'b_a', books: [mk('b_a', 'A'), mk('b_b', 'B'), mk('b_c', 'C'), mk('b_e', ''), mk('b_u', 'xyz'), mk('b_n', 'prise-pop')] } } };
          const out = {};
          await restoreBackupFromFile(new File([JSON.stringify(bk1)], 'alt.json')); await new Promise(r => setTimeout(r, 400));
          out.legacy = cookbookStoreRead().books.map(b => [b.config.title, b.config.pdfTemplate, (b.config.items || []).length]);
          await restoreBackupFromFile(new File([JSON.stringify(bk2)], 'neu.json')); await new Promise(r => setTimeout(r, 500));
          out.books = cookbookStoreRead().books.filter(b => b.id.startsWith('b_')).map(b => [b.id, b.config.pdfTemplate, b.config.title, b.config.author, b.config.eigen, b.config.items.length, b.name]);
          await restoreBackupFromFile(new File([JSON.stringify(bk2)], 'neu.json')); await new Promise(r => setTimeout(r, 500));
          out.again = cookbookStoreRead().books.length; out.total = out.books.length;
          return out; }""")
        check('Alte Sicherung ohne Projekte (Stil C) → pur, Titel und Auswahl bleiben', any(x[0] == 'Alt' and x[1] == 'pur' and x[2] == 1 for x in old['legacy']), str(old['legacy']))
        by = {b[0]: b for b in old['books']}
        exp = {'b_a': 'pur', 'b_b': 'prise-pop', 'b_c': 'pur', 'b_e': 'pur', 'b_u': 'pur', 'b_n': 'prise-pop'}
        check('Sicherung mit Projekten: A/B/C/leer/unbekannt/neu → richtige neue ID', {k: v[1] for k, v in by.items()} == exp, str({k: v[1] for k, v in by.items()}))
        check('Sicherung mit Projekten: Titel, Name, Eigenes, Auswahl, Projektname bleiben', all(v[2] == 'T ' + k and v[3] == 'Au' and v[4] == 7 and v[5] == 1 and v[6] == 'Aus Sicherung ' + k for k, v in by.items()) and len(by) == 6, str(old['books'])[:200])
        check('Sicherung zweimal einspielen verdoppelt keine Kochbücher', old['again'] == await ev("cookbookStoreRead().books.length") and len(old['books']) == 6)

        # ---------- 5. Cloud-Abgleich ----------
        email, pw = 'migration@example.test', 'geheim-123'
        M.USERS[email] = {'id': str(uuid.uuid4()), 'password': pw, 'confirmed': True}
        await ev("([e, p]) => cloudAuthSignIn(e, p)", [email, pw])
        uid = await ev("cloudUserId()")
        check('Cloud-Mock: angemeldet', bool(uid))
        await ev("() => { localStorage.removeItem(COOKBOOK_PROJECTS_KEY); localStorage.removeItem(COOKBOOK_CONFIG_KEY); cookbookStoreRead(); }")
        await ev("cloudSyncNow()")
        # (a) Neuer Stil lokal gespeichert, in der Cloud liegt ein aelterer Stand mit altem Stil: der neue Stil bleibt
        await ev("""() => { const cfg = getCookbookConfig(); cfg.title = 'Lokal neu'; cfg.pdfTemplate = 'prise-pop'; cfg.items = []; saveCookbookConfig(cfg); clearTimeout(cloud.timer); }""")
        stale_store = {'v': 1, 'activeId': 'cb_stale', 'books': [book(5, 'A')]}; stale_store['books'][0]['id'] = 'cb_stale'
        M.RECORDS[(uid, 'setting', 'cookbooks')] = {'kind': 'setting', 'id': 'cookbooks', 'data': {'value': json.dumps(stale_store)}, 'deleted': False, 'client_updated_at': 1000, 'server_updated_at': M.now_ts()}
        await ev("cloudSyncNow()")
        loc = await ev("() => { const c = cookbookActiveBook().config; return [c.title, c.pdfTemplate]; }")
        check('Cloud: älterer Stand mit altem Stil überschreibt den neuen Stil nicht', loc == ['Lokal neu', 'prise-pop'], str(loc))
        pushed = json.loads(M.RECORDS[(uid, 'setting', 'cookbooks')]['data']['value'])
        check('Cloud: hochgeladener Stand enthält die neue ID', any(b['config'].get('pdfTemplate') == 'prise-pop' for b in pushed['books']), str([b['config'].get('pdfTemplate') for b in pushed['books']]))
        # (b) Neuerer Stand von einem alten Geraet mit alten IDs: wird beim Einspielen abgebildet, nichts geht verloren
        remote = {'v': 1, 'activeId': 'cb_r0', 'books': [book(0, 'A'), book(1, 'B'), book(2, 'C'), book(3, '__fehlt__')]}
        for i, b in enumerate(remote['books']): b['id'] = f'cb_r{i}'
        M.RECORDS[(uid, 'setting', 'cookbooks')] = {'kind': 'setting', 'id': 'cookbooks', 'data': {'value': json.dumps(remote)}, 'deleted': False, 'client_updated_at': 4102444800000, 'server_updated_at': M.now_ts()}
        legacy_remote = {'title': 'Fern alt', 'subtitle': '', 'author': 'Fern', 'pdfTemplate': 'B', 'items': [], 'chapters': []}
        M.RECORDS[(uid, 'setting', 'cookbookConfig')] = {'kind': 'setting', 'id': 'cookbookConfig', 'data': {'value': json.dumps(legacy_remote)}, 'deleted': False, 'client_updated_at': 4102444800000, 'server_updated_at': M.now_ts()}
        await ev("cloudSyncNow()")
        got = await ev("() => ({ books: cookbookStoreRead().books.map(b => [b.id, b.config.pdfTemplate, b.config.title, b.config.eigenesFeld]), raw: JSON.parse(localStorage.getItem(COOKBOOK_PROJECTS_KEY)).books.map(b => b.config.pdfTemplate), legacy: JSON.parse(localStorage.getItem(COOKBOOK_CONFIG_KEY)) })")
        check('Cloud: Stand von altem Gerät (A, B, C, fehlend) → pur, prise-pop, pur, fehlend', [b[1] for b in got['books']] == ['pur', 'prise-pop', 'pur', None] and got['raw'] == ['pur', 'prise-pop', 'pur', None], str(got['books']))
        check('Cloud: übrige Felder aus der Cloud bleiben (Titel, Eigenes)', all(b[2].startswith('Buch ') and b[3] == {'bleibt': [1, 2, 3]} for b in got['books']))
        check('Cloud: alte Einzelkonfiguration → Stil B wird prise-pop, Rest unverändert', got['legacy']['pdfTemplate'] == 'prise-pop' and got['legacy']['title'] == 'Fern alt' and got['legacy']['author'] == 'Fern', str(got['legacy']))
        # (c) stille Anpassung loest keinen neuen Abgleich aus (bleibt «nicht von der Person geaendert»)
        q = await ev("""() => { localStorage.setItem(COOKBOOK_PROJECTS_KEY, JSON.stringify({ v: 1, activeId: 'x', books: [{ id: 'x', name: 'X', createdAt: 1, updatedAt: 1, config: { pdfTemplate: 'C', title: 'Q' } }] })); const orig = Storage.prototype.setItem; /* direkt eingetragen: Warteschlange leeren */ localStorage.setItem('savora-sync-queue', '{}'); cookbookStoreRead(); return Object.keys(JSON.parse(localStorage.getItem('savora-sync-queue') || '{}')); }""")
        check('Stille Stil-Anpassung beim Lesen stellt keinen Abgleich in die Warteschlange', not any(k.startswith('setting|cookbooks') for k in q), str(q))
        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await browser.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
