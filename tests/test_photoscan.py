"""Foto importieren (v93: «Foto scannen» ging in «Aus Foto importieren» und «Foto wählen» auf, jetzt überall, auch im Browser).
Der Lesekern imageImportRead wird durch eine Attrappe ersetzt; hier geht es um den Weg Foto -> Importfeld -> Rezept-Entwurf."""
import asyncio, sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)
PNG = _os.path.join(TESTS, 'fixtures_scan.png')
MOCK = """() => { window.__ocr = { calls: [], mode: 'ok' };
  window.imageImportRead = async (files) => { window.__ocr.calls.push(files.length + ':' + files[0].name);
    if (window.__ocr.mode === 'fail') return { ok: false, error: 'load-failed', results: [], text: '', weak: false };
    if (window.__ocr.mode === 'empty') return { ok: true, error: null, results: [], text: '', weak: true };
    return { ok: true, error: null, results: [], text: 'Apfelkuchen\\n200 g Mehl\\n3 Eier\\nAlles verruehren und backen.', weak: false }; }; }"""
async def main():
    async with async_playwright() as p:
        browser, ctx = await open_ctx(p, 390, 844)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.evaluate(MOCK); await page.wait_for_timeout(300)
        status = lambda: page.evaluate("document.getElementById('pdfStatus').textContent")
        await page.evaluate("() => { state.view = 'home'; state.modal = { type: 'add-menu' }; render(); }"); await page.wait_for_selector('.add-menu-sheet')
        check('Menü "Rezept hinzufügen" bietet "Aus Foto importieren" (auch im Browser)', 'Aus Foto importieren' in await page.evaluate("document.querySelector('.add-menu-sheet').innerText"))
        await page.evaluate("() => { state.modal = null; state.view = 'paste-import'; render(); }"); await page.wait_for_selector('#ocrInput', state='attached')
        check('Import-Bildschirm zeigt "Foto wählen" mit Datenschutz-Hinweis', 'Foto wählen' in await page.evaluate("document.querySelector('.pdfimp-box').innerText") and 'nur auf deinem gerät' in (await page.evaluate("document.querySelector('.import-page').innerText")).lower())
        await page.set_input_files('#ocrInput', PNG)
        await page.wait_for_function("() => state.pdfImport && state.pdfImport.status === 'done'")
        ta = await page.input_value('#pasteText'); calls = await page.evaluate("window.__ocr.calls")
        check('Erkannter Text steht im Importfeld', ta.startswith('Apfelkuchen') and '3 Eier' in ta, repr(ta[:60]))
        check('Der Lesekern bekommt die Datei', len(calls) == 1 and calls[0].startswith('1:'), str(calls))
        check('Statusmeldung nennt den nächsten Schritt', 'Rezept-Entwurf erstellen' in await status())
        await page.set_input_files('#ocrInput', PNG)
        await page.wait_for_function("() => document.getElementById('pasteText').value.split('Apfelkuchen').length === 3")
        check('Zweites Foto wird angehängt', '\n' in await page.input_value('#pasteText'))
        await page.fill('#pasteText', ta)
        await page.evaluate("document.querySelector('[data-action=\"do-paste-import\"]').click()"); await page.wait_for_selector('#recipeForm')
        rec = await page.evaluate("({ t: state.editingRecipe.title, n: state.editingRecipe.ingredients.length, s: state.editingRecipe.steps.length })")
        check('Aus dem gelesenen Text entsteht ein Rezept-Entwurf', rec['t'] == 'Apfelkuchen' and rec['n'] == 2 and rec['s'] == 1, str(rec))
        await page.evaluate("() => { window.__ocr.mode = 'empty'; state.pdfImport = null; state.pasteImport = null; state.view = 'paste-import'; render(); }"); await page.wait_for_selector('#ocrInput', state='attached')
        await page.set_input_files('#ocrInput', PNG)
        await page.wait_for_function("() => state.pdfImport && state.pdfImport.status === 'weak'")
        check('Kein Text erkannt: freundlicher Hinweis, Feld unverändert', 'kein Text erkannt' in await status() and await page.input_value('#pasteText') == '')
        await page.evaluate("() => { window.__ocr.mode = 'fail'; }")
        await page.set_input_files('#ocrInput', PNG)
        await page.wait_for_function("() => state.pdfImport && state.pdfImport.status === 'error'")
        check('Fehler der Texterkennung: Hinweis, App läuft weiter', 'nicht geklappt' in await status() and await page.evaluate("!!document.getElementById('pasteText')"))
        bad = await page.evaluate("Array.from(document.querySelectorAll('.ocr-btn')).filter(b => b.getBoundingClientRect().height < 43.5).length")
        check('Tippfläche "Foto wählen" mind. 44 px', bad == 0)
        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await browser.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
