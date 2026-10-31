"""v92: Rezept aus PDF importieren, Oberfläche (Plus-Menü, Textimport, Seitenauswahl, gescannt-Hinweis, Fehlertexte).
pdfImportRead und pdfJoinPages werden durch Attrappen mit der festgelegten Rückgabeform ersetzt (unabhängig vom Lesekern pdf-import.js).
Die Dateiauswahl selbst ist echt (set_input_files mit tests/fixtures/pdf/einfach.pdf)."""
import asyncio, sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)
PDF = _os.path.join(TESTS, 'fixtures', 'pdf', 'einfach.pdf')
SHOTS = _os.environ.get('SAVORA_PDF_SHOTS')   # optional: Ordner für Bildschirmfotos

MOCK = """() => {
  window.__mockPdf = null;
  window.pdfImportRead = async (file, opts) => { window.__readCalls = (window.__readCalls || 0) + 1; window.__lastOpts = opts; return window.__mockPdf; };
  window.pdfJoinPages = (pages, nums) => pages.filter(p => nums.includes(p.n)).map(p => p.text).join('\\n\\n');
}"""
def pages(*texts):
    texts = [t.replace('\\n', '\n') for t in texts]
    return [{'n': i + 1, 'text': t, 'chars': len(''.join(t.split()))} for i, t in enumerate(texts)]
def doc(pgs, **kw):
    d = {'ok': True, 'error': None, 'numPages': len(pgs), 'pages': pgs, 'scanned': False, 'truncated': False}; d.update(kw); return d
def fail(code): return {'ok': False, 'error': code, 'numPages': 0, 'pages': [], 'scanned': False, 'truncated': False}
REZEPT = 'Apfelkuchen\\n\\nZutaten:\\n200 g Mehl\\n3 Eier\\n\\nZubereitung:\\n1. Alles mischen.'

async def main():
    async with async_playwright() as p:
        b, ctx = await open_ctx(p)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page)
        ev = page.evaluate
        await ev(MOCK)

        async def set_mock(d):
            await ev("(d) => { window.__mockPdf = d; }", d)
        async def open_menu():
            await ev("() => { state.modal = null; state.pdfImport = null; state.pasteImport = null; state.view = 'home'; render(); }")
            await ev("() => openModal({ type: 'add-menu' })"); await page.wait_for_selector('.add-menu-sheet')
        async def pick_from_menu(d):
            await set_mock(d); await open_menu()
            await page.set_input_files('#pdfMenuInput', PDF)
            await page.wait_for_function("() => state.view === 'paste-import' && state.pdfImport && state.pdfImport.status !== 'reading'")
            await page.wait_for_selector('#pasteText')
        async def pick_on_page(d):
            await set_mock(d)
            await page.set_input_files('#pdfInput', PDF)
            await page.wait_for_function("() => state.pdfImport && state.pdfImport.status !== 'reading'")
            await page.wait_for_function("() => document.getElementById('pdfStatus')")
        status = lambda: ev("() => document.getElementById('pdfStatus').textContent.trim()")
        field = lambda: page.input_value('#pasteText')

        # ---------- 1. Plus-Menü ----------
        await open_menu()
        m = await ev("""() => { const l = document.querySelector('label[for=pdfMenuInput]'), i = document.getElementById('pdfMenuInput'); const r = l.getBoundingClientRect();
          return { tag: l.tagName, label: l.textContent.replace(/\\s+/g, ' ').trim(), accept: i.accept, type: i.type, h: r.height, w: r.width, inLabel: l.contains(i),
                   order: Array.from(document.querySelectorAll('.add-menu-option strong')).map(e => e.textContent) }; }""")
        check('Plus-Menü: Option «Aus PDF importieren» als Label mit Dateifeld', m['tag'] == 'LABEL' and m['inLabel'] and m['type'] == 'file' and 'Aus PDF importieren' in m['label'] and 'Rezept als PDF-Datei' in m['label'], str(m))
        check('Plus-Menü: Dateifeld nimmt PDF an', 'application/pdf' in m['accept'] and '.pdf' in m['accept'], m['accept'])
        check('Plus-Menü: Tippfläche mindestens 44 px', m['h'] >= 44, str(m['h']))
        check('Plus-Menü: übrige Optionen unverändert vorhanden', 'Rezept erstellen' in m['order'] and 'Aus Text importieren' in m['order'], str(m['order']))

        # ---------- 2. Eine Seite: Menü schliesst, Textimport öffnet, Feld gefüllt ----------
        await pick_from_menu(doc(pages(REZEPT)))
        r = await ev("() => ({ view: state.view, modal: state.modal, title: document.querySelector('.topbar-title').textContent.trim(), n: window.__readCalls, opts: window.__lastOpts })")
        check('Eine Seite: Menü zu, «Aus Text importieren» offen', r['view'] == 'paste-import' and not r['modal'] and r['title'] == 'Aus Text importieren', str(r))
        check('Lesekern wird mit maxPages 30 aufgerufen', r['opts'] == {'maxPages': 30}, str(r['opts']))
        t = await field()
        check('Eine Seite: Text steht im Feld', t.startswith('Apfelkuchen') and '3 Eier' in t and 'Alles mischen' in t, repr(t[:60]))
        s = await status()
        check('Eine Seite: Hinweis nennt den nächsten Schritt', 'Rezept-Entwurf erstellen' in s and 'Text aus der PDF übernommen' in s, s)
        check('Eine Seite: keine Seitenauswahl', await ev("() => !document.querySelector('.pdfimp-pages')"))
        check('Statuszeile ist role=status', await ev("() => document.getElementById('pdfStatus').getAttribute('role') === 'status'"))

        # ---------- 3. Angehängt statt ersetzt, auch bei erneuter Wahl auf der Seite ----------
        await ev("() => { const ta = document.getElementById('pasteText'); ta.value = 'Mein eigener Text'; ta.dispatchEvent(new Event('input', { bubbles: true })); }")
        await pick_on_page(doc(pages('Zweiter Text\\n1 Ei')))
        t = await field()
        check('Angehängt: vorhandener Text bleibt vorne, neuer folgt nach Leerzeile', t.startswith('Mein eigener Text\n\nZweiter Text') and '1 Ei' in t, repr(t))
        await ev("() => document.documentElement.setAttribute('data-theme', 'dark')"); await ev("() => render()")
        check('Text überlebt ein Neuzeichnen (State, nicht nur DOM)', 'Mein eigener Text' in await field())
        await ev("() => document.documentElement.removeAttribute('data-theme')")

        # ---------- 4. Mehrere Seiten: Auswahl ----------
        await ev("() => { state.pasteImport = null; state.pdfImport = null; state.view = 'paste-import'; render(); }")
        await pick_on_page(doc(pages('Rezept Seite eins\\n200 g Mehl', 'Seite zwei\\n3 Eier', 'Werbung hier')))
        sel = await ev("""() => ({ legend: document.querySelector('.pdfimp-pages-h').textContent, items: Array.from(document.querySelectorAll('.pdfimp-page')).map(l => ({ t: l.textContent.replace(/\\s+/g, ' ').trim(), c: l.querySelector('input').checked, h: l.getBoundingClientRect().height })),
          btn: document.querySelector('[data-action="pdf-import-apply"]').textContent.trim(), empty: document.getElementById('pasteText').value })""")
        check('Auswahl: Titel und Knopf «Text übernehmen»', 'Welche Seiten gehören zum Rezept?' in sel['legend'] and sel['btn'] == 'Text übernehmen', str(sel))
        check('Auswahl: je Seite Nummer und erste Zeile', len(sel['items']) == 3 and 'Seite 1' in sel['items'][0]['t'] and 'Rezept Seite eins' in sel['items'][0]['t'] and 'Werbung hier' in sel['items'][2]['t'], str(sel['items']))
        check('Auswahl: bis 4 Seiten alle vorgewählt', all(i['c'] for i in sel['items']))
        check('Auswahl: Tippflächen mindestens 44 px', all(i['h'] >= 44 for i in sel['items']), str([i['h'] for i in sel['items']]))
        check('Auswahl: Feld bleibt bis «Text übernehmen» leer', sel['empty'] == '')
        await page.uncheck('[data-pdf-page="3"]')
        check('Auswahl: Haken landet im State', await ev("() => state.pdfImport.selected.slice().sort().join(',')") == '1,2')
        await ev("() => render()")   # Neuzeichnen verliert die Wahl nicht
        check('Auswahl bleibt nach Neuzeichnen', await ev("() => Array.from(document.querySelectorAll('.pdfimp-page-check')).map(c => c.checked).join(',')") == 'true,true,false')
        await page.click('[data-action="pdf-import-apply"]')
        await page.wait_for_function("() => state.pdfImport.status === 'done'")
        t = await field()
        check('«Text übernehmen» fügt nur gewählte Seiten ein, in Reihenfolge', 'Rezept Seite eins' in t and 'Seite zwei' in t and 'Werbung' not in t and t.index('Seite zwei') > t.index('Seite eins'), repr(t))
        check('Danach: Auswahl weg, Hinweis da', await ev("() => !document.querySelector('.pdfimp-pages')") and 'Rezept-Entwurf erstellen' in await status())
        # nichts gewählt
        await ev("() => { state.pasteImport = null; state.pdfImport = null; state.view = 'paste-import'; render(); }")
        await pick_on_page(doc(pages('A eins', 'B zwei')))
        await page.uncheck('[data-pdf-page="1"]'); await page.uncheck('[data-pdf-page="2"]'); await page.click('[data-action="pdf-import-apply"]')
        await page.wait_for_function("() => document.getElementById('pdfStatus').textContent.includes('mindestens eine Seite')")
        check('Keine Seite gewählt: Hinweis, Feld bleibt leer, Auswahl bleibt', await field() == '' and await ev("() => !!document.querySelector('.pdfimp-pages')"))
        # mehr als 4 Seiten: nur Seite 1 vorgewählt
        await ev("() => { state.pasteImport = null; state.pdfImport = null; state.view = 'paste-import'; render(); }")
        await pick_on_page(doc(pages(*[f'Seite Nummer {i}\\nText {i}' for i in range(1, 7)])))
        c = await ev("() => Array.from(document.querySelectorAll('.pdfimp-page-check')).map(c => c.checked)")
        check('Mehr als 4 Seiten: nur Seite 1 vorgewählt', c == [True, False, False, False, False, False], str(c))
        # Jede Seite ein eigenes Rezept (eigene Überschrift «Zutaten»): nur Seite 1 vorgewählt
        await ev("() => { state.pasteImport = null; state.pdfImport = null; state.view = 'paste-import'; render(); }")
        await pick_on_page(doc(pages('Linsensuppe\\nZutaten\\n1 Karotte', 'Birchermüesli\\nZutaten\\n1 Apfel', 'Älplermagronen\\nZutaten\\n2 dl Rahm')))
        c = await ev("() => Array.from(document.querySelectorAll('.pdfimp-page-check')).map(c => c.checked)")
        check('Neues Rezept je Seite: nur Seite 1 vorgewählt', c == [True, False, False], str(c))
        # Rezept über zwei Seiten (zweite Seite ohne neue Zutatenliste): beide vorgewählt
        await ev("() => { state.pasteImport = null; state.pdfImport = null; state.view = 'paste-import'; render(); }")
        await pick_on_page(doc(pages('Brot\\nZutaten\\n500 g Mehl\\nZubereitung\\n1. Kneten.', '2. Backen.')))
        c = await ev("() => Array.from(document.querySelectorAll('.pdfimp-page-check')).map(c => c.checked)")
        check('Rezept über zwei Seiten: beide vorgewählt', c == [True, True], str(c))
        # Seiten ohne Text (chars 0) tauchen nicht in der Auswahl auf
        await ev("() => { state.pasteImport = null; state.pdfImport = null; state.view = 'paste-import'; render(); }")
        pg = pages('Text eins', '', 'Text drei')
        await pick_on_page(doc(pg))
        check('Seiten ohne Text fehlen in der Auswahl', await ev("() => Array.from(document.querySelectorAll('.pdfimp-page-check')).map(c => c.dataset.pdfPage).join(',')") == '1,3')
        # lange erste Zeile: umbrechen, nicht abschneiden
        await ev("() => { state.pasteImport = null; state.pdfImport = null; state.view = 'paste-import'; render(); }")
        lang = 'Sehr langer Titel ' + 'Kartoffelgratin mit Käse überbacken ' * 3
        await pick_on_page(doc(pages(lang, 'Seite zwei Text')))
        w = await ev("""() => { const e = document.querySelector('.pdfimp-page-text span'); const cs = getComputedStyle(e); return { ov: cs.textOverflow, ws: cs.whiteSpace, full: e.textContent.length, sh: e.scrollHeight, ch: e.clientHeight, lines: Math.round(e.getBoundingClientRect().height / parseFloat(cs.lineHeight)) }; }""")
        check('Lange Zeile: umgebrochen, keine Ellipse, mehrzeilig', w['ov'] != 'ellipsis' and w['ws'] == 'normal' and w['lines'] >= 2 and w['sh'] <= w['ch'] + 1 and '…' not in await ev("() => document.querySelector('.pdfimp-page-text span').textContent"), str(w))

        # ---------- 5. gescannt ----------
        await ev("() => { state.pasteImport = null; state.pdfImport = null; state.view = 'paste-import'; render(); }")
        check('Normal: KI-Kasten zugeklappt, Link-Weg', await ev("() => !document.querySelector('.ki-prompt-how').open && document.querySelector('.ki-prompt-h').textContent.includes('Link')"))
        await pick_on_page(doc(pages('', ''), scanned=True))
        k = await ev("""() => ({ s: document.getElementById('pdfStatus').textContent, open: document.querySelector('.ki-prompt-how').open, h: document.querySelector('.ki-prompt-h').textContent,
          steps: document.querySelector('.ki-prompt-steps').textContent, field: document.getElementById('pasteText').value, copy: !!document.querySelector('[data-action="copy-ki-prompt"]') })""")
        check('Gescannt: Hinweis «nur Bilder, keinen lesbaren Text»', 'nur Bilder, keinen lesbaren Text' in k['s'], k['s'])
        check('Gescannt: KI-Kasten aufgeklappt mit PDF-Schritten', k['open'] and 'hänge die PDF an' in k['steps'] and 'Prompt kopieren' in k['steps'] and 'PDF' in k['h'] and k['copy'], str(k))
        check('Gescannt: Feld unverändert leer', k['field'] == '')
        await page.context.grant_permissions(['clipboard-read', 'clipboard-write'])
        await page.click('[data-action="copy-ki-prompt"]')
        await page.wait_for_function("() => document.getElementById('kiPromptHint').textContent.length > 0")
        check('Gescannt: Kopier-Hinweis nennt die PDF', 'PDF anhängen' in await ev("() => document.getElementById('kiPromptHint').textContent"))
        # neue lesbare PDF danach: Kasten wieder im Normalzustand
        await pick_on_page(doc(pages(REZEPT)))
        check('Danach lesbare PDF: KI-Kasten wieder zugeklappt', await ev("() => !document.querySelector('.ki-prompt-how').open"))

        # ---------- 6. Fehlertexte und gekürzt ----------
        faelle = [('password', 'Passwort'), ('too-large', '25 MB'), ('not-pdf', 'keine PDF-Datei'), ('damaged', 'nicht lesen'), ('load-failed', 'nicht lesen')]
        for code, wort in faelle:
            await pick_on_page(fail(code))
            s = await status()
            check(f'Fehler {code}: verständlicher Text', wort in s and not await ev("() => document.querySelector('.pdfimp-pages')") and 'undefined' not in s, s)
            check(f'Fehler {code}: Feld unverändert', 'Apfelkuchen' in await field())
        await pick_on_page(doc(pages('Text eins', 'Text zwei'), truncated=True, numPages=40))
        check('Gekürzt: Hinweis auf die ersten 30 Seiten', 'ersten 30 Seiten' in await ev("() => document.querySelector('.pdfimp-trunc').textContent"))

        # ---------- 7. Texte: Stil ----------
        allText = await ev("() => document.querySelector('.pdfimp-box').innerText")
        check('Texte: kein ß, keine Gedankenstriche', 'ß' not in allText and '—' not in allText and '–' not in allText, allText[:80])

        # ---------- 8. Hilfespalte, Datenschutz, FAQ ----------
        h = await ev("() => document.querySelector('.import-help').textContent")
        check('Hilfespalte nennt PDF', 'PDF' in h)
        leg = await ev("() => legalPrivacyHtml ? legalPrivacyHtml() : ''") if await ev("() => typeof legalPrivacyHtml === 'function'") else ''
        src = open(_os.path.join(ROOT, 'legal.js'), encoding='utf-8').read()
        check('Datenschutz: PDF nur auf dem Gerät, nicht gespeichert, nicht übertragen', 'PDF-Dateien' in src and 'nicht gespeichert und nicht übertragen' in src)
        check('FAQ «Wie bringe ich ein Rezept in Savora?» nennt PDF', "q('Wie bringe ich ein Rezept in Savora?', '" in src and 'PDF-Datei' in src.split("q('Wie bringe ich ein Rezept in Savora?'")[1][:300])

        # ---------- 9. Bestehender Import läuft weiter ----------
        await ev("() => { state.pasteImport = null; state.pdfImport = null; state.view = 'paste-import'; render(); }")
        await pick_on_page(doc(pages(REZEPT)))
        await page.click('[data-action="do-paste-import"]'); await page.wait_for_selector('#recipeForm')
        f = await ev("() => ({ title: state.editingRecipe.title, ings: state.editingRecipe.ingredients.length, pdf: state.pdfImport })")
        check('«Rezept-Entwurf erstellen» nimmt den PDF-Text, State wird aufgeräumt', f['title'] == 'Apfelkuchen' and f['ings'] >= 2 and f['pdf'] is None, str(f))

        # ---------- 10. Breiten, Hell und Dunkel, kein Überlauf ----------
        await b.close()
        for (w, h) in ((390, 844), (1280, 800)):
            b, ctx = await open_ctx(p, w, h); pg = await ctx.new_page(); pe = []
            pg.on('pageerror', lambda e: pe.append(str(e)))
            await goto(pg); await pg.evaluate(MOCK)
            for theme in ('light', 'dark'):
                await pg.evaluate("(t) => document.documentElement.setAttribute('data-theme', t)", theme)
                await pg.evaluate("() => { state.modal = null; state.pdfImport = null; state.pasteImport = null; state.view = 'home'; render(); }")
                await pg.evaluate("() => openModal({ type: 'add-menu' })"); await pg.wait_for_selector('.add-menu-sheet')
                o1 = await pg.evaluate(OVERFLOW_JS)
                check(f'{w}px {theme}: Plus-Menü ohne Überlauf', not o1, str(o1))
                if SHOTS and w == 390 and theme == 'light':
                    _os.makedirs(SHOTS, exist_ok=True); await pg.wait_for_timeout(400); await pg.screenshot(path=_os.path.join(SHOTS, '390-hell-plus-menue.png'))
                for nm, d in (('Auswahl', doc(pages('Rezept Seite eins\\n200 g Mehl und viel mehr Text in einer ziemlich langen ersten Zeile, die umbrechen muss', 'Seite zwei\\n3 Eier', 'Seite drei\\nBacken'), truncated=True)),
                              ('gescannt', doc(pages('', ''), scanned=True)), ('Fehler', fail('password')), ('Text', doc(pages(REZEPT)))):
                    await pg.evaluate("(d) => { window.__mockPdf = d; state.pdfImport = null; state.pasteImport = null; state.modal = null; state.view = 'paste-import'; render(); }", d)
                    await pg.set_input_files('#pdfInput', PDF)
                    await pg.wait_for_function("() => state.pdfImport && state.pdfImport.status !== 'reading'")
                    await pg.wait_for_function("() => document.getElementById('pdfStatus')")
                    o2 = await pg.evaluate(OVERFLOW_JS)
                    st = await pg.evaluate("() => state.pdfImport.status")
                    check(f'{w}px {theme}: {nm} ohne Überlauf', not o2, str(o2))
                    if nm in ('Auswahl', 'gescannt'):
                        sm = await pg.evaluate("""() => { const out = []; document.querySelectorAll('.pdfimp-box *, .ki-prompt-box *, .add-menu-option--file *').forEach(e => { if (!e.childNodes.length || ![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return; const fs = parseFloat(getComputedStyle(e).fontSize); if (fs < 14) out.push(e.className + ' ' + fs); }); return out; }""")
                        check(f'{w}px {theme}: {nm}: Schrift mindestens 14 px', not sm, str(sm))
                        if nm == 'Auswahl':
                            tap = await pg.evaluate("() => Array.from(document.querySelectorAll('.pdfimp-page, .pdfimp-apply, .pdfimp-btn')).map(e => Math.round(e.getBoundingClientRect().height)).filter(h => h < 44)")
                            check(f'{w}px {theme}: Tippflächen mindestens 44 px', not tap, str(tap))
                    if SHOTS:
                        name = None
                        if w == 390 and theme == 'light' and nm == 'Auswahl': name = '390-hell-seitenauswahl.png'
                        if w == 390 and theme == 'light' and nm == 'gescannt': name = '390-hell-gescannt.png'
                        if w == 1280 and theme == 'dark' and nm == 'Text': name = '1280-dunkel-importseite.png'
                        if name:
                            await pg.wait_for_timeout(400)
                            if nm in ('Auswahl', 'gescannt') and w == 390: await pg.evaluate("() => document.getElementById('pdfStatus').scrollIntoView({ block: 'start' })")
                            await pg.screenshot(path=_os.path.join(SHOTS, name))
            check(f'{w}px: keine Seitenfehler', not pe, str(pe[:2]))
            await b.close()

        check('keine Seitenfehler (Hauptlauf)', not errs, str(errs[:2]))
    print('\nFEHLER:' if FAIL else '\nALLES OK', FAIL if FAIL else '')
    sys.exit(1 if FAIL else 0)
asyncio.run(main())
