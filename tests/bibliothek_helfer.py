"""Gemeinsame Hilfen fuer die Browser-Tests der oeffentlichen Rezeptbibliothek (test_bibliothek_ablauf/_veroeffentlichen/_ansicht).
Startet den Supabase-Nachbau (tests/mock_supabase.py) auf SAVORA_MOCK_PORT und stellt Pruef- und Navigationshilfen bereit.
Navigation und Aktionen laufen ueber sichtbare Texte (Vertrag §7) und Rollen, Datenpruefungen ueber die Vertragsfunktionen
(library.js, Vertrag §5). Feste Wartezeiten werden vermieden (wait_for_function)."""
import asyncio, json, os, re, sys, threading, time, uuid
from contextlib import asynccontextmanager
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *   # noqa: F401,F403  (startet den Webserver, open_ctx, goto, URL, ROOT, OUT)
import mock_supabase as M
from http.server import ThreadingHTTPServer

MOCK_PORT = int(os.environ.get('SAVORA_MOCK_PORT', str(PORT + 1)))
ThreadingHTTPServer.allow_reuse_address = True
_srv = ThreadingHTTPServer(('127.0.0.1', MOCK_PORT), M.H)
threading.Thread(target=_srv.serve_forever, daemon=True).start()
CLOUD = "window.SAVORA_CLOUD_URL_OVERRIDE = 'http://127.0.0.1:%d'; window.SAVORA_CLOUD_KEY_OVERRIDE = 'test-key';" % MOCK_PORT
HIDE_SB = "document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = 'html { scrollbar-width: none } html::-webkit-scrollbar { display: none }'; document.head.appendChild(s); });"
UI_WAIT = int(os.environ.get('SAVORA_LIB_UI_WAIT', '6000'))   # ms: Wartezeit auf UI-Elemente (kurz, damit fehlende UI schnell rot wird)
SHOTS = os.path.join(TESTS, 'out', 'bibliothek')
os.makedirs(SHOTS, exist_ok=True)

FAIL, TIMES = [], []
INJECTED = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, ('' if cond else str(info)[:300]))
    if not cond: FAIL.append(name)
    return cond

@asynccontextmanager
async def section(name):
    """Testabschnitt mit Zeitmessung. Ausnahmen (z. B. fehlende UI) werden als FEHL gemeldet, der naechste Abschnitt laeuft weiter."""
    t = time.time()
    print(f'--- {name}')
    try:
        yield
    except Exception as e:
        msg = str(e).split('\n')[0][:240]
        print(f'FEHL {name}: Abschnitt abgebrochen: {type(e).__name__}: {msg}')
        FAIL.append(name + ' (abgebrochen)')
    finally:
        TIMES.append((name, time.time() - t))

def report(t0):
    print('\nLaufzeit je Abschnitt:')
    for n, d in TIMES: print(f'  {d:6.1f} s  {n}')
    print(f'Gesamt: {time.time() - t0:.1f} s')
    if INJECTED: print('Hinweis: nicht in index.html eingebunden, vom Test nachgeladen:', ', '.join(INJECTED))
    if FAIL:
        print('FEHLGESCHLAGEN:', len(FAIL))
        for f in FAIL: print('  -', f)
        sys.exit(1)
    print('ALLE OK')

async def ev(page, js, *a): return await page.evaluate(js, *a)
async def main_text(page): return await ev(page, "(document.querySelector('main') || document.body).innerText")
async def body_text(page): return await ev(page, "document.body.innerText")

LIB_FILES = ['library.js', 'library-views.js', 'library-publish.js']
async def ensure_lib(page):
    """Laedt library.js und die View-Dateien nach, solange der Integrator sie noch nicht in index.html eingetragen hat."""
    for f in LIB_FILES:
        present = await ev(page, "(f) => !!document.querySelector('script[src=\"' + f + '\"]')", f)
        if not present and os.path.exists(os.path.join(ROOT, f)):
            await page.add_script_tag(url=f)
            if f not in INJECTED: INJECTED.append(f)
    await page.wait_for_function("typeof lib !== 'undefined' && typeof ensurePersonalRecipe === 'function'", timeout=10000)
    VIEWS[0] = await ev(page, "typeof recipesSwitchHtml === 'function' || typeof handleLibraryAction === 'function'")

VIEWS = [False]   # sind die Bibliothek-Views (library-views.js / library-publish.js) geladen?
def ui_wait(t=None):
    return t or (UI_WAIT if VIEWS[0] else 1200)   # ohne Views kurz warten: der Test soll schnell und ehrlich rot werden

async def new_page(ctx):
    page = await ctx.new_page()
    page.errs = []
    page.on("pageerror", lambda e: page.errs.append(str(e)))
    page.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
    return page

async def open_app(p, w=390, h=844, motion='reduce', scheme='light', url_suffix=''):
    browser, ctx = await open_ctx(p, w, h, motion)
    await ctx.add_init_script(CLOUD); await ctx.add_init_script(HIDE_SB)
    if scheme: await ctx.add_init_script("try{localStorage.setItem('savora-theme', %s)}catch(e){}" % json.dumps(scheme))
    page = await new_page(ctx)
    await start(page, url_suffix)
    return browser, ctx, page

async def start(page, url_suffix=''):
    await page.goto(URL + url_suffix)
    await page.wait_for_function("typeof state !== 'undefined' && document.getElementById('app').children.length > 0", timeout=30000)
    await ensure_lib(page)
    await ev(page, "() => document.fonts.ready.then(() => 1)")

async def login(page, email, password='geheim-123'):
    """Anmelden ueber die echte Kontoseite (Nachbau-Konto muss existieren: M.make_user)."""
    await ev(page, "() => { state.modal = null; state.view = 'settings-account'; render(); }")
    await page.wait_for_selector('#cloudEmail', timeout=8000)
    await page.fill('#cloudEmail', email); await page.fill('#cloudPassword', password)
    await ev(page, "() => document.querySelector('[data-action=\"cloud-sign-in\"]').click()")
    await page.wait_for_function("typeof cloudSignedIn === 'function' && cloudSignedIn()", timeout=10000)

async def goto_view(page, view, extra_js=''):
    await ev(page, "([v, x]) => { if (document.activeElement) document.activeElement.blur(); state.modal = null; " + "eval(x); state.view = v; render(); }", [view, extra_js])

async def open_discover(page):
    """Entdecken wie ueber den Umschalter «Meine Rezepte · Entdecken» (Vertrag §5)."""
    await ev(page, "() => { state.modal = null; state.view = 'discover'; if (typeof libEnterDiscover === 'function') libEnterDiscover(); render(); }")

async def wait_text(page, text, timeout=None, scope='body'):
    await page.wait_for_function("([t, s]) => (document.querySelector(s) || document.body).innerText.includes(t)", arg=[text, scope], timeout=ui_wait(timeout))
    return True

async def has_text(page, text, timeout=None):
    try: return await wait_text(page, text, timeout)
    except Exception: return False

async def _poll_async(page, js, timeout, arg):
    """wait_for_function wartet nicht auf Promises (ein Promise gilt sofort als «wahr»). Fuer Bedingungen mit IndexedDB
    (dbGetAll().then(...)) wird deshalb per evaluate abgefragt, bis das Ergebnis wahr ist."""
    is_fn = js.lstrip().startswith(('(', 'async')) and '=>' in js.split('\n')[0][:40]
    code = js if is_fn else f"async () => !!(await ({js}))"
    end = time.time() + timeout / 1000
    while True:
        r = await (page.evaluate(code, arg) if is_fn and arg is not None else page.evaluate(code))
        if r: return r
        if time.time() > end: raise TimeoutError('Zeit abgelaufen')
        await asyncio.sleep(0.05)

async def wait_js(page, js, timeout=None, arg=None):
    try:
        if '.then(' in js or 'await ' in js or 'Promise' in js:
            return await _poll_async(page, js, timeout or 8000, arg)
        return await page.wait_for_function(js, arg=arg, timeout=timeout or 8000)
    except Exception:
        try: snap = await ev(page, "JSON.stringify({ view: state.view, d: typeof lib !== 'undefined' ? { s: lib.discover.status, m: lib.discover.moreStatus, n: lib.discover.items.length, f: lib.discover.filters, q: lib.discover.q, e: lib.discover.error } : null, det: typeof lib !== 'undefined' ? [lib.detail.id, lib.detail.status] : null, modal: state.modal && state.modal.type })")
        except Exception as e2: snap = str(e2)
        raise TimeoutError(f'Warten auf «{js[:90]}» erfolglos; Zustand: {snap[:300]}')

SCOPE = 'main, .lib-head, header, .topbar, [role=dialog], .modal-sheet, .toast'   # nie die Hauptnavigation (dort heissen Knoepfe auch «Wochenplan», «Einkauf»)
def btn(page, name):
    """Schaltflaeche oder Link per zugaenglichem Namen (Text oder aria-label), exakt oder als Regex, nur im Inhalt/Dialog/Toast."""
    root = page.locator(SCOPE)
    return root.get_by_role('button', name=name).or_(root.get_by_role('link', name=name))

async def click_btn(page, name, timeout=None):
    """Klickt die erste klickbare Fundstelle (eine verdeckte wird uebersprungen, z. B. unter einem Toast)."""
    loc = btn(page, name)
    await loc.first.wait_for(state='visible', timeout=ui_wait(timeout))
    n = await loc.count(); last = None
    for i in range(n):
        try:
            await loc.nth(i).click(timeout=2500); return
        except Exception as e: last = e
    raise last or TimeoutError('nicht klickbar')

async def clear_toasts(page):
    """Entfernt alte Toasts eines vorigen Abschnitts (nur Testhygiene; dass ein Toast Inhalte verdeckt, prueft ein eigener Test)."""
    await ev(page, "() => document.querySelectorAll('.toast').forEach(t => t.remove())")

def nm(name): return name.pattern if hasattr(name, 'pattern') else name

async def act(page, name, fallback_js=None, timeout=None, arg=None):
    """Klickt die Schaltflaeche. Fehlt sie: als FEHL melden und (falls angegeben) die Vertragsfunktion direkt aufrufen,
    damit die Datenpruefungen dahinter trotzdem laufen. Ohne Ersatz wird der Abschnitt abgebrochen."""
    try:
        await click_btn(page, name, timeout); return True
    except Exception:
        ctxt = (await ev(page, "[state.view, state.modal && state.modal.type, (document.querySelector('main') || document.body).innerText.replace(/\\s+/g, ' ').slice(0, 140)].join(' | ')"))
        check(f'UI: Schaltflaeche «{nm(name)}» vorhanden', False, 'fehlt' + (' (Ersatz: Vertragsfunktion direkt)' if fallback_js else '') + ' :: ' + ctxt)
        if fallback_js is None: raise
        await ev(page, fallback_js, arg) if arg is not None else await ev(page, fallback_js)
        return False

async def lib_rendered(page):
    """Zeigt der Inhaltsbereich gerade eine Bibliothek-Ansicht (Vertrag §5: Aktionen data-action="lib-…")?
    Negativpruefungen («zeigt X nicht») gelten nur, wenn die Ansicht wirklich gezeichnet ist."""
    return await ev(page, "!!document.querySelector('main [data-action^=\"lib-\"], [role=dialog] [data-action^=\"lib-\"], .modal-sheet [data-action^=\"lib-\"]')")

async def ui_absent(page, name, texts, scope_js="(document.querySelector('main') || document.body).innerText"):
    """UI-Negativpruefung: Ansicht muss gezeichnet sein UND keiner der Texte darf vorkommen."""
    shown = await lib_rendered(page)
    t = await ev(page, scope_js)
    hits = [x for x in texts if x in t]
    return check(name, shown and not hits, 'Bibliothek-Ansicht nicht gezeichnet' if not shown else hits)

async def ui_text(page, text, timeout=None):
    """Prueft einen sichtbaren Text (Vertrag §7) und meldet FEHL statt abzubrechen."""
    return check(f'Text «{text}»', await has_text(page, text, timeout), (await main_text(page))[:160])

async def wait_query(page, q):
    """Wartet, bis die Suche fuer genau diesen Begriff fertig ist."""
    await wait_js(page, "(q) => lib.discover.status === 'ready' && !!lib.discover.key && JSON.parse(lib.discover.key)[0] === libNorm(q)", 8000, arg=q)

def rpc_calls(name):
    return [x for x in M.LOG if x[1].endswith('/rpc/' + name)]

async def wait_discover_ready(page, timeout=None):
    await wait_js(page, "lib.discover.status === 'ready' || lib.discover.status === 'error' || lib.discover.status === 'offline'", timeout or 10000)

def api_order(sort='newest', filters=None, query=''):
    """Erwartete Reihenfolge direkt aus dem Nachbau (ohne Browser)."""
    out, cur = [], None
    for _ in range(100):
        items = [p for p in M.PUBS.values() if M._visible(p) and M._matches(p, M.lib_norm(query).split(), filters or {})]
        page, cur = M._page(items, sort, cur, 24)
        out += [p['id'] for p in page]
        if not cur: break
    return out

DBGET = "(id) => dbGetAll().then(l => l.find(r => r.id === id) || null)"

async def scan_for_public_ids(page, ids):
    """Sucht oeffentliche Publikations-IDs in Wochenplan, Einkauf und Kochbuechern (duerfen dort nie vorkommen)."""
    return await ev(page, """async (ids) => {
      const plan = JSON.stringify(await dbGetAllMealplan());
      const shop = JSON.stringify(state.shopping || []);
      let books = ''; try { books = JSON.stringify(cookbookStoreRead()); } catch (e) {}
      const hits = [];
      ids.forEach(id => { if (plan.includes(id)) hits.push('Wochenplan:' + id); if (shop.includes(id)) hits.push('Einkauf:' + id); if (books.includes(id)) hits.push('Kochbuch:' + id); });
      return hits; }""", ids)

async def local_copies(page, pub_id):
    return await ev(page, "(id) => dbGetAll().then(l => l.filter(r => r.publicOrigin && r.publicOrigin.publicationId === id).map(r => ({ id: r.id, imageId: r.imageId || null, notes: r.notes, favorite: !!r.favorite, title: r.title, origin: r.publicOrigin, cookCount: r.cookCount, publicTips: r.publicTips, source: r.source, ingredients: r.ingredients, steps: r.steps, servings: r.servings, servingMode: r.servingMode, yieldLabel: r.yieldLabel, timeMinutes: r.timeMinutes })))", pub_id)

async def shot(page, name):
    path = os.path.join(SHOTS, name + '.png')
    try: await page.screenshot(path=path, full_page=False)
    except Exception as e: return f'(kein Bild: {e})'
    return path

def rich_recipe(title='Zürcher Geschnetzeltes', minutes=35, diet=('fleisch',), **extra):
    """Oeffentliches Rezept mit Zutatenabschnitten, Mengenbereich, «nach Geschmack», Ueberschrift im Schritt."""
    return M.simple_recipe(title, minutes=minutes, diet=list(diet), categories=['dinner'],
        ingredients=[{'amount': '', 'unit': '', 'name': 'Sauce', 'group': '', 'isGroupHeader': True},
                     {'amount': '2-3', 'unit': 'dl', 'name': 'Rahm', 'group': 'Sauce', 'isGroupHeader': False},
                     {'amount': '', 'unit': '', 'name': 'Salz nach Geschmack', 'group': 'Sauce', 'isGroupHeader': False},
                     {'amount': 600, 'unit': 'g', 'name': 'Kalbfleisch', 'group': '', 'isGroupHeader': False}],
        steps=[{'text': 'Für die Sauce:'}, {'text': 'Rahm aufkochen.'}, {'text': 'Fleisch anbraten.'}],
        tips='Mit Rösti servieren.', source={'url': 'https://example.org/geschnetzeltes', 'text': ''}, **extra)
