"""Gemeinsame Hilfen fuer alle Savora-Tests.
Jeder Test startet seinen eigenen lokalen Webserver (Port 8795) auf den Repo-Dateien.
Fuer den Datenerhalt-Test kann der Server auf einen frueheren Git-Stand umgeschaltet werden."""
import asyncio, json, os, subprocess, sys, tempfile, threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.async_api import async_playwright

TESTS = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(TESTS)
OUT = os.path.join(tempfile.gettempdir(), 'savora-tests-out')   # Screenshots, PDFs, Zwischen-Sicherungen
os.makedirs(OUT, exist_ok=True)
SEED_PATH = os.path.join(TESTS, 'seed.js')
# Optionale, private Sicherung fuer die Pruefbericht-Tests (nicht im Repo, siehe tests/README.md)
PRUEF_BACKUP = os.path.join(TESTS, 'private', '07_Sicherung_waehrend_Pruefung.json')
OLD_COMMIT = '5320c04'   # v20-quality-update: letzter Stand vor dem Redesign ("alter Stand" fuer den Datenerhalt-Test)
PORT = 8795
URL = f"http://localhost:{PORT}/index.html"


class _Site:
    dir = ROOT
    def set_dir(self, path): self.dir = path
SITE = _Site()

class _Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=SITE.dir, **k)
    def log_message(self, *a): pass

def _start_server():
    ThreadingHTTPServer.allow_reuse_address = True
    srv = ThreadingHTTPServer(('127.0.0.1', PORT), _Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
_start_server()

def old_checkout(commit=OLD_COMMIT):
    """Entpackt einen frueheren Git-Commit in einen Temp-Ordner (Voraussetzung: vollstaendige Git-Historie)."""
    dest = tempfile.mkdtemp(prefix='savora-old-')
    arc = subprocess.run(['git', 'archive', commit], cwd=ROOT, capture_output=True, check=True).stdout
    subprocess.run(['tar', '-x', '-C', dest], input=arc, check=True)
    return dest

NO_SW = """Object.defineProperty(navigator, 'serviceWorker', { value: { register: () => Promise.reject(new Error('x')), addEventListener: () => {} } });"""
async def open_ctx(p, w=390, h=844, motion="reduce"):
    browser = await p.chromium.launch()
    ctx = await browser.new_context(viewport={"width": w, "height": h}, accept_downloads=True, reduced_motion=motion, timezone_id="UTC")   # feste Zeitzone: Tests sind ueberall gleich reproduzierbar
    await ctx.add_init_script(NO_SW + " try{localStorage.setItem('savora-splash-seen','1')}catch(e){}")
    return browser, ctx
async def goto(page):
    await page.goto(URL)
    await page.wait_for_function("typeof state !== 'undefined' && document.getElementById('app').children.length > 0", timeout=15000)
    await page.wait_for_timeout(700)

async def show(page, js, selector):
    await page.evaluate(js)
    await page.wait_for_selector(selector, timeout=8000, state='attached')
    await page.wait_for_timeout(250)
