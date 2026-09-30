"""PDF-Vorschau mit PDF.js (iOS und iOS-App): alle Seiten, kein leeres Bild, Speicher, Rueckfall."""
import asyncio, base64, subprocess, sys, tempfile, os
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

async def main():
    async with async_playwright() as p:
        browser, ctx = await open_ctx(p, 390, 844)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append('console: ' + m.text[:120]) if m.type == 'error' else None)
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(500)
        # Ein langes Rezept, damit das PDF mehrere Seiten hat
        await page.evaluate("""async () => { const r = emptyRecipe(); r.id = 'r_long'; r.title = 'Langes Testrezept'; r.servings = 4;
          r.ingredients = Array.from({ length: 60 }, (_, i) => ({ amount: String(i + 1), unit: 'g', name: 'Zutat Nummer ' + (i + 1) + ' mit etwas längerem Namen' }));
          r.steps = Array.from({ length: 40 }, (_, i) => ({ text: 'Schritt ' + (i + 1) + ': ' + 'Alles gut vermengen und ruhen lassen, dann weiterverarbeiten. '.repeat(3) }));
          await dbPut(r); await loadRecipes(); }""")
        # PDF selbst erzeugen und Seitenzahl mit poppler bestimmen
        b64 = await page.evaluate("""async () => { const r = await buildSinglePdf('r_long', 'off'); const buf = new Uint8Array(await r.blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode.apply(null, buf.subarray(i, i + 8192)); return btoa(s); }""")
        path = _os.path.join(OUT, 'preview_test.pdf'); open(path, 'wb').write(base64.b64decode(b64))
        info = subprocess.run(['pdfinfo', path], capture_output=True, text=True).stdout
        pages = int([l for l in info.split('\n') if l.startswith('Pages:')][0].split()[1])
        check('Test-PDF hat mehrere Seiten', pages >= 3, f'{pages} Seiten')

        async def open_preview(force):
            await page.evaluate("(f) => { state.forcePdfCanvas = f; state.activeRecipeId = 'r_long'; state.view = 'detail'; render(); }", force)
            await page.evaluate("async () => { const r = await buildSinglePdf('r_long', 'off'); state.modal = { type: 'pdf-export', target: 'single', recipeId: 'r_long', stage: 'preview', nutritionDetail: 'off', previewBlob: r.blob, previewUrl: URL.createObjectURL(r.blob), filename: 'test.pdf' }; render(); }")
            await page.wait_for_timeout(600)
        # 1) Canvas-Modus (iOS)
        await open_preview(True)
        await page.wait_for_selector('#pdfPages[data-pages]', timeout=20000)
        n = await page.evaluate("+document.getElementById('pdfPages').dataset.pages")
        check('Alle Seiten sind als Platzhalter da', n == pages and await page.evaluate("document.querySelectorAll('.pdf-page-slot').length") == pages, f'{n} von {pages}')
        await page.wait_for_timeout(1500)
        drawn = await page.evaluate("document.querySelectorAll('.pdf-page-slot canvas').length")
        check('Sichtbare Seiten sind gezeichnet (nicht alle, Speicher sparen)', 1 <= drawn < pages, f'{drawn} gezeichnet')
        ink = await page.evaluate("""() => { const c = document.querySelector('.pdf-page-slot canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let dark = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 128) dark++; return [c.width, c.height, dark] }""")
        check('Erste Seite enthält echten Inhalt (Text), nicht leer', ink[2] > 200, str(ink))
        # Scrollen zeichnet weitere Seiten, weit entfernte werden freigegeben
        await page.evaluate("document.getElementById('pdfPages').scrollTop = document.getElementById('pdfPages').scrollHeight"); await page.wait_for_timeout(1800)
        last = await page.evaluate("document.querySelector('.pdf-page-slot:last-child canvas') !== null")
        first_freed = await page.evaluate("document.querySelector('.pdf-page-slot:first-child canvas') === null")
        check('Ans Ende scrollen: letzte Seite wird gezeichnet, erste freigegeben', last and first_freed, f'letzte={last} erste frei={first_freed}')
        wrap = await page.evaluate("(() => { const p = document.getElementById('pdfPages'); const s = document.querySelector('.pdf-page-slot'); const b = p.getBoundingClientRect(); const sb = s.getBoundingClientRect(); return { pw: b.width, sw: sb.width, ov: document.documentElement.scrollWidth - innerWidth } })()")
        check('Seite passt in die Breite (kein Abschneiden, kein Seitwärts-Scrollen)', wrap['sw'] <= wrap['pw'] and wrap['ov'] <= 0, str(wrap))
        lab = await page.evaluate("document.querySelector('.pdf-page-slot').getAttribute('aria-label')")
        check('Seiten sind für Screenreader benannt', lab == f'Seite 1 von {pages}', lab)
        await page.screenshot(path=OUT + '/pdfpreview_canvas.png')
        bad = await page.evaluate("Array.from(document.querySelectorAll('.pdf-preview-actions button')).filter(b => b.getBoundingClientRect().height < 43.5).length")
        check('Teilen/Speichern erreichbar (mind. 44 px)', bad == 0)
        # 2) Desktop-Modus: eingebauter Betrachter (iframe)
        await open_preview(False)
        check('Desktop: eingebauter PDF-Betrachter (iframe), kein Canvas', await page.evaluate("!!document.querySelector('.pdf-preview-frame') && !document.getElementById('pdfPages')"))
        # 3) Native Erkennung
        await page.evaluate("() => { state.forcePdfCanvas = undefined; }")
        check('Ohne Vorgabe: Desktop-Chrome nutzt iframe', await page.evaluate("pdfPreviewUsesCanvas()") is False)
        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await browser.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
