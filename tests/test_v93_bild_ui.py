"""v93: Rezept aus Fotos importieren, Oberfläche (Plus-Menü, «Foto wählen» und «PDF wählen» nebeneinander, Fortschritt, weak-Hinweis, Fehlertexte).
imageImportRead wird durch eine Attrappe mit der festgelegten Rückgabeform ersetzt; die Dateiauswahl ist echt (set_input_files)."""
import asyncio, sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)
PNG = _os.path.join(TESTS, 'fixtures_scan.png')
PDF = _os.path.join(TESTS, 'fixtures', 'pdf', 'einfach.pdf')
SHOTS = _os.environ.get('SAVORA_BILD_SHOTS')

MOCK = """() => { window.__mock = null; window.__calls = []; window.__gate = null;
  window.imageImportRead = async (files, opts) => { window.__calls.push({ n: files.length, names: files.map(f => f.name), hasProgress: !!(opts && opts.onProgress) });
    if (window.__gate) { await new Promise(r => { window.__release = r; }); }
    return window.__mock; };
  window.pdfImportRead = async () => ({ ok: true, error: null, numPages: 1, pages: [{ n: 1, text: 'PDF Rezept\\n1 Ei', chars: 12 }], scanned: false, truncated: false });
  window.pdfJoinPages = (pages, nums) => pages.filter(p => nums.includes(p.n)).map(p => p.text).join('\\n\\n'); }"""
TEXT = 'Apfelkuchen\n\nZutaten:\n200 g Mehl\n3 Eier\n\nZubereitung:\n1. Alles mischen.'
def res(text=TEXT, weak=False, **kw):
    d = {'ok': True, 'error': None, 'results': [], 'text': text, 'weak': weak}; d.update(kw); return d
def err(code): return {'ok': False, 'error': code, 'results': [], 'text': '', 'weak': False}

async def main():
    async with async_playwright() as p:
        b, ctx = await open_ctx(p)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); ev = page.evaluate
        await ev(MOCK)
        status = lambda: ev("() => document.getElementById('pdfStatus').textContent.trim()")
        field = lambda: page.input_value('#pasteText')
        async def reset(view='paste-import'):
            await ev("(v) => { state.modal = null; state.pdfImport = null; state.pasteImport = null; state.view = v; render(); }", view)
        async def pick(mock, sel='#ocrInput', files=PNG):
            await ev("(m) => { window.__mock = m; }", mock)
            await page.set_input_files(sel, files)
            await page.wait_for_function("() => state.pdfImport && state.pdfImport.status !== 'reading'")

        # 1. Plus-Menü
        await reset('home'); await ev("() => openModal({ type: 'add-menu' })"); await page.wait_for_selector('.add-menu-sheet')
        m = await ev("""() => { const l = document.querySelector('label[for=imgMenuInput]'), i = document.getElementById('imgMenuInput'); return { label: l.textContent.replace(/\\s+/g, ' ').trim(), accept: i.accept, multiple: i.multiple, sr: i.classList.contains('sr-only'), h: l.getBoundingClientRect().height,
          opts: Array.from(document.querySelectorAll('.add-menu-option strong')).map(e => e.textContent), pdf: !!document.getElementById('pdfMenuInput'), old: !!document.querySelector('[data-action="open-photo-scan"]') }; }""")
        check('Plus-Menü: «Aus Foto importieren» (Label, image/*, mehrere, sr-only)', 'Aus Foto importieren' in m['label'] and 'Buchseite, Zettel oder Bildschirmfoto' in m['label'] and m['accept'] == 'image/*' and m['multiple'] and m['sr'], str(m))
        check('Plus-Menü: beide Optionen Foto und PDF, Tippfläche mindestens 44 px', 'Aus PDF importieren' in m['opts'] and m['pdf'] and m['h'] >= 44 and 'Rezept erstellen' in m['opts'] and 'Aus Text importieren' in m['opts'], str(m))
        check('Plus-Menü: kein alter Knopf «Foto scannen» mehr', not m['old'] and 'Foto scannen' not in str(m['opts']))

        # 2. Aus dem Menü: ein Foto gut
        await ev("(m) => { window.__mock = m; }", res())
        await page.set_input_files('#imgMenuInput', PNG)
        await page.wait_for_function("() => state.view === 'paste-import' && state.pdfImport && state.pdfImport.status === 'done'")
        r = await ev("() => ({ modal: state.modal, title: document.querySelector('.topbar-title').textContent.trim(), calls: window.__calls })")
        t = await field()
        check('Menü: Foto gewählt, Textimport offen, Menü zu', not r['modal'] and r['title'] == 'Aus Text importieren' and r['calls'][0]['n'] == 1 and r['calls'][0]['hasProgress'], str(r))
        check('Ein Foto: Text im Feld, Hinweis nennt nächsten Schritt', t.startswith('Apfelkuchen') and '3 Eier' in t and 'Text erkannt' in await status() and 'Rezept-Entwurf erstellen' in await status(), repr(t[:40]))
        check('Ein Foto: KI-Kasten bleibt zu', await ev("() => !document.querySelector('.ki-prompt-how').open && document.querySelector('.ki-prompt-h').textContent.includes('Link')"))

        # 3. Knöpfe nebeneinander, Dateifelder sr-only
        bt = await ev("""() => { const a = document.querySelector('label[for=ocrInput]').getBoundingClientRect(), c = document.querySelector('label[for=pdfInput]').getBoundingClientRect();
          return { a: a.toJSON(), c: c.toJSON(), names: [document.querySelector('label[for=ocrInput]').textContent.trim(), document.querySelector('label[for=pdfInput]').textContent.trim()],
          sr: document.getElementById('ocrInput').classList.contains('sr-only') && document.getElementById('pdfInput').classList.contains('sr-only'), multiple: document.getElementById('ocrInput').multiple, old: !!document.querySelector('.ocr-box') }; }""")
        check('Importseite: «Foto wählen» und «PDF wählen» nebeneinander, mind. 44 px', abs(bt['a']['top'] - bt['c']['top']) < 2 and bt['a']['height'] >= 44 and bt['c']['height'] >= 44 and bt['names'] == ['Foto wählen', 'PDF wählen'], str(bt))
        check('Dateifelder sr-only, Foto mehrfach wählbar, alter ocr-Kasten weg', bt['sr'] and bt['multiple'] and not bt['old'])

        # 4. Anhängen, zwei Fotos, State
        await ev("() => { const ta = document.getElementById('pasteText'); ta.value = 'Mein Text'; ta.dispatchEvent(new Event('input', { bubbles: true })); }")
        await pick(res('Zweiter Text\n1 Ei'), files=[PNG, PNG])
        t = await field()
        check('Angehängt: eigener Text vorne, neuer nach Leerzeile', t.startswith('Mein Text\n\nZweiter Text'), repr(t))
        check('Zwei Fotos: beide gehen an den Lesekern', (await ev("() => window.__calls"))[-1]['n'] == 2)
        await ev("() => document.documentElement.setAttribute('data-theme', 'dark')"); await ev("() => render()")
        check('State: Text und Hinweis überleben ein Neuzeichnen', 'Mein Text' in await field() and 'Text erkannt' in await status())
        await ev("() => document.documentElement.removeAttribute('data-theme')")

        # 5. Fortschritt
        await reset()
        await ev("() => { window.__gate = true; window.__release = null; }")
        await ev("(m) => { window.__mock = m; }", res())
        await page.set_input_files('#ocrInput', [PNG, PNG])
        await page.wait_for_function("() => window.__release")
        check('Während des Lesens: Statuszeile «wird gelesen»', 'wird gelesen' in await status(), await status())
        # Fortschritt durch Aufruf des gemerkten onProgress simulieren: über erneutes Lesen mit gespeichertem Callback
        await ev("() => { window.__release(); }")
        await page.wait_for_function("() => state.pdfImport.status !== 'reading'")
        await ev("() => { window.__gate = null; }")
        await reset()
        await ev("""() => { window.imageImportRead = async (files, opts) => { opts.onProgress({ phase: 'load', index: 0, count: 2, progress: 0.3 }); window.__s1 = document.getElementById('pdfStatus').textContent;
          opts.onProgress({ phase: 'read', index: 0, count: 2, progress: 0.4 }); window.__s2 = document.getElementById('pdfStatus').textContent;
          opts.onProgress({ phase: 'read', index: 1, count: 2, progress: 1 }); window.__s3 = document.getElementById('pdfStatus').textContent; return window.__mock; }; }""")
        await pick(res(), files=[PNG, PNG])
        s = await ev("() => [window.__s1, window.__s2, window.__s3]")
        check('Fortschritt: «Texterkennung wird geladen … (einmalig)»', s[0] == 'Texterkennung wird geladen … (einmalig)', str(s))
        check('Fortschritt: «Foto 1 von 2 wird gelesen … 40 %» und «Foto 2 von 2 … 100 %»', s[1] == 'Foto 1 von 2 wird gelesen … 40 %' and s[2] == 'Foto 2 von 2 wird gelesen … 100 %', str(s))
        await ev(MOCK)

        # 6. weak
        await reset()
        check('Normal: KI-Kasten zu', await ev("() => !document.querySelector('.ki-prompt-how').open"))
        await pick(res('Apfl 2OO g Meh1', weak=True))
        k = await ev("""() => ({ s: document.getElementById('pdfStatus').textContent, open: document.querySelector('.ki-prompt-how').open, h: document.querySelector('.ki-prompt-h').textContent,
          steps: document.querySelector('.ki-prompt-steps').textContent, field: document.getElementById('pasteText').value })""")
        check('weak: Hinweis «schwer zu lesen», Text trotzdem angehängt', 'schwer zu lesen' in k['s'] and k['field'].startswith('Apfl'), str(k['s']))
        check('weak: KI-Kasten offen mit Foto-Schritten', k['open'] and 'Foto' in k['h'] and 'Foto in der KI anhängen' in k['steps'] and 'Prompt kopieren' in k['steps'], str(k))
        await page.context.grant_permissions(['clipboard-read', 'clipboard-write'])
        await page.click('[data-action="copy-ki-prompt"]')
        await page.wait_for_function("() => document.getElementById('kiPromptHint').textContent.length > 0")
        check('weak: Kopier-Hinweis nennt das Foto', 'Foto anhängen' in await ev("() => document.getElementById('kiPromptHint').textContent"))
        await pick(res('')); 
        check('Kein Text: Hinweis, Feld unverändert, KI-Kasten offen', 'kein Text erkannt' in await status() and (await field()).startswith('Apfl') and await ev("() => document.querySelector('.ki-prompt-how').open"))
        await pick(res())
        check('Danach gutes Foto: KI-Kasten wieder zu', await ev("() => !document.querySelector('.ki-prompt-how').open"))

        # 7. Fehlertexte
        for code, wort in (('not-image', 'kein Foto'), ('too-large', '30 MB'), ('unsupported', 'Bildformat'), ('load-failed', 'nicht geklappt')):
            await pick(err(code))
            s = await status()
            check(f'Fehler {code}: verständlicher Text, Feld unverändert', wort in s and 'undefined' not in s and 'Apfl' in await field(), s)
        allText = await ev("() => document.querySelector('.pdfimp-box').innerText")
        check('Texte: kein ß, keine Gedankenstriche', 'ß' not in allText and '—' not in allText and '–' not in allText)

        # 8. PDF geht weiter, gleiche Statuszeile
        await reset()
        await ev("(m) => { window.__mock = m; }", res())
        await page.set_input_files('#pdfInput', PDF)
        await page.wait_for_function("() => state.pdfImport && state.pdfImport.status === 'done'")
        check('PDF wählen funktioniert weiter (gleiche Statuszeile)', 'PDF Rezept' in await field() and 'Text aus der PDF übernommen' in await status())

        # 9. Hilfe, Datenschutz, Lizenz
        h = await ev("() => document.querySelector('.import-help').textContent")
        check('Hilfespalte nennt Foto und PDF', 'Foto' in h and 'PDF' in h)
        src = open(_os.path.join(ROOT, 'legal.js'), encoding='utf-8').read()
        check('Lizenzliste: Tesseract.js, Apache License 2.0', "row('Tesseract.js', 'Apache License 2.0'" in src)
        check('Datenschutz: Fotos nur auf dem Gerät, nicht gespeichert', 'Fotos werden weder gespeichert noch übertragen' in src and 'Aus Foto importieren' in src)
        check('FAQ nennt Foto', 'ein Foto von einer Buchseite' in src.split("q('Wie bringe ich ein Rezept in Savora?'")[1][:400])
        await b.close()

        # 10. Breiten, Hell und Dunkel
        for (w, h) in ((320, 700), (390, 844), (1280, 800)):
            b, ctx = await open_ctx(p, w, h); pg = await ctx.new_page(); pe = []
            pg.on('pageerror', lambda e: pe.append(str(e)))
            await goto(pg); await pg.evaluate(MOCK)
            for theme in ('light', 'dark'):
                await pg.evaluate("(t) => document.documentElement.setAttribute('data-theme', t)", theme)
                await pg.evaluate("() => { state.modal = null; state.pdfImport = null; state.pasteImport = null; state.view = 'home'; render(); openModal({ type: 'add-menu' }); }")
                await pg.wait_for_selector('.add-menu-sheet')
                o = await pg.evaluate(OVERFLOW_JS); check(f'{w}px {theme}: Plus-Menü ohne Überlauf', not o, str(o))
                if SHOTS and w == 390 and theme == 'light':
                    _os.makedirs(SHOTS, exist_ok=True); await pg.wait_for_timeout(400); await pg.screenshot(path=_os.path.join(SHOTS, '390-hell-plus-menue.png'))
                for nm, d in (('leer', None), ('gut', res()), ('weak', res('Apfl 2OO', weak=True)), ('Fehler', err('too-large'))):
                    await pg.evaluate("() => { state.modal = null; state.pdfImport = null; state.pasteImport = null; state.view = 'paste-import'; render(); }")
                    if d:
                        await pg.evaluate("(m) => { window.__mock = m; }", d)
                        await pg.set_input_files('#ocrInput', PNG)
                        await pg.wait_for_function("() => state.pdfImport && state.pdfImport.status !== 'reading'")
                    o = await pg.evaluate(OVERFLOW_JS); check(f'{w}px {theme}: Importseite {nm} ohne Überlauf', not o, str(o))
                    g = await pg.evaluate("""() => { const a = document.querySelector('label[for=ocrInput]').getBoundingClientRect(), c = document.querySelector('label[for=pdfInput]').getBoundingClientRect(), ta = document.getElementById('pasteText').getBoundingClientRect();
                      const small = []; document.querySelectorAll('.pdfimp-box *, .ki-prompt-box *').forEach(e => { if ([...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 14) small.push(e.className); });
                      return { same: Math.abs(a.top - c.top) < 2, ha: a.height, hc: c.height, right: Math.max(a.right, c.right), W: document.documentElement.clientWidth, taTop: ta.top, H: innerHeight, small }; }""")
                    check(f'{w}px {theme}: {nm}: Knöpfe ≥ 44 px, im Bild, Schrift ≥ 14 px', g['ha'] >= 44 and g['hc'] >= 44 and g['right'] <= g['W'] and not g['small'], str(g))
                    if w >= 390 and nm == 'leer': check(f'{w}px {theme}: Knöpfe nebeneinander', g['same'], str(g))
                    if w == 320 and nm == 'leer': check('320px: Knöpfe nebeneinander oder untereinander, nie abgeschnitten', g['right'] <= g['W'], str(g))
                    if w == 390 and nm == 'leer': check(f'390px {theme}: Textfeld im ersten Bildschirm (Oberkante ≤ 60 %)', g['taTop'] <= g['H'] * 0.6, str(g))
                    if SHOTS and theme == 'light':
                        name = {(390, 'leer'): '390-hell-importseite.png', (390, 'weak'): '390-hell-weak.png', (320, 'leer'): '320-hell-knoepfe.png'}.get((w, nm))
                        if name: await pg.wait_for_timeout(300); await pg.screenshot(path=_os.path.join(SHOTS, name))
            check(f'{w}px: keine Seitenfehler', not pe, str(pe[:2]))
            await b.close()
        check('keine Seitenfehler (Hauptlauf)', not errs, str(errs[:2]))
    print('\nFEHLER:' if FAIL else '\nALLES OK', FAIL if FAIL else '')
    sys.exit(1 if FAIL else 0)
asyncio.run(main())
