"""Foto scannen (iOS-App): Text aus einem Foto landet im Importfeld. Das native Plugin wird durch eine Attrappe ersetzt."""
import asyncio, sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)
PNG = _os.path.join(TESTS, 'fixtures_scan.png')
MOCK = """
window.__ocr = { calls: [], mode: 'ok' };
window.Capacitor = { isNativePlatform: () => true, Plugins: { TextRecognition: { recognize: (a) => { window.__ocr.calls.push(a.image.slice(0, 8) + ':' + a.image.length);
  if (window.__ocr.mode === 'fail') return Promise.reject(new Error('boom')); if (window.__ocr.mode === 'empty') return Promise.resolve({ text: '' });
  return Promise.resolve({ text: 'Apfelkuchen\\n200 g Mehl\\n3 Eier\\nAlles verruehren und backen.' }); } } } };
try { localStorage.setItem('savora-splash-seen', '1') } catch (e) {}
"""
async def main():
    async with async_playwright() as p:
        # Ohne Plugin (Browser): keine Foto-Funktion sichtbar
        b0, c0 = await open_ctx(p, 390, 844); p0 = await c0.new_page(); await goto(p0)
        await p0.evaluate("() => { state.view = 'paste-import'; render(); }")
        check('Browser: kein "Foto scannen"', await p0.evaluate("!document.getElementById('ocrInput')"))
        await b0.close()

        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={'width': 390, 'height': 844}, reduced_motion='reduce', timezone_id='UTC')
        await ctx.add_init_script(MOCK)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(300)
        await page.evaluate("() => { state.view = 'home'; state.modal = { type: 'add-menu' }; render(); }"); await page.wait_for_timeout(200)
        check('iOS-App: Menü "Rezept hinzufügen" bietet "Foto scannen"', 'Foto scannen' in await page.evaluate("document.querySelector('.add-menu-sheet').innerText"))
        await page.evaluate("() => { state.modal = null; state.view = 'paste-import'; render(); }"); await page.wait_for_selector('#ocrInput', state='attached')
        check('Import-Bildschirm zeigt "Foto scannen" mit Datenschutz-Hinweis', 'läuft auf deinem Gerät' in await page.evaluate("document.querySelector('.ocr-box').innerText"))
        await page.set_input_files('#ocrInput', PNG); await page.wait_for_timeout(700)
        ta = await page.input_value('#pasteText'); calls = await page.evaluate("window.__ocr.calls")
        check('Erkannter Text steht im Importfeld', ta.startswith('Apfelkuchen') and '3 Eier' in ta, repr(ta[:60]))
        check('An das Plugin geht ein JPEG (Base64) mit Inhalt', len(calls) == 1 and calls[0].startswith('/9j/') and int(calls[0].split(':')[1]) > 200, str(calls))
        check('Statusmeldung nennt den nächsten Schritt', 'Rezept-Entwurf erstellen' in await page.evaluate("document.getElementById('ocrStatus').textContent"))
        # Zweites Foto haengt an
        await page.set_input_files('#ocrInput', PNG); await page.wait_for_timeout(600)
        ta2 = await page.input_value('#pasteText')
        check('Zweites Foto wird angehängt', ta2.count('Apfelkuchen') == 2 and '\n' in ta2)
        # Entwurf erstellen aus dem gescannten Text
        await page.fill('#pasteText', ta)
        await page.evaluate("document.querySelector('[data-action=\"do-paste-import\"]').click()"); await page.wait_for_selector('#recipeForm')
        rec = await page.evaluate("({ t: state.editingRecipe.title, n: state.editingRecipe.ingredients.length, s: state.editingRecipe.steps.length })")
        check('Aus dem gescannten Text entsteht ein Rezept-Entwurf', rec['t'] == 'Apfelkuchen' and rec['n'] == 2 and rec['s'] == 1, str(rec))
        # Kein Text erkannt / Fehler
        await page.evaluate("() => { window.__ocr.mode = 'empty'; state.view = 'paste-import'; render(); }"); await page.wait_for_selector('#ocrInput', state='attached')
        await page.set_input_files('#ocrInput', PNG); await page.wait_for_timeout(500)
        check('Kein Text erkannt: freundlicher Hinweis, Feld unverändert', 'kein Text erkannt' in await page.evaluate("document.getElementById('ocrStatus').textContent") and await page.input_value('#pasteText') == '')
        await page.evaluate("() => { window.__ocr.mode = 'fail'; }")
        await page.set_input_files('#ocrInput', PNG); await page.wait_for_timeout(500)
        check('Fehler der Texterkennung: Hinweis, App läuft weiter', 'nicht geklappt' in await page.evaluate("document.getElementById('ocrStatus').textContent") and await page.evaluate("!!document.getElementById('pasteText')"))
        bad = await page.evaluate("Array.from(document.querySelectorAll('.ocr-btn')).filter(b => b.getBoundingClientRect().height < 43.5).length")
        check('Tippfläche "Foto scannen" mind. 44 px', bad == 0)
        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await browser.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
