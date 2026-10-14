"""PDF-Exportdialog: genau zwei Stile (Pur, Prise Pop), Standard Pur, Auswahl wird gemerkt, Doppelstart-Schutz, Abbruch,
Fehlerzustand mit «Erneut versuchen», Vorschau = Download (gleiche Bytes), Zweiseiten-Satz nur bei genau zwei Seiten,
«Name im PDF» (Vorschlag aus dem gespeicherten Namen, aenderbar, nie automatisch an, wird nicht gespeichert)."""
import asyncio, base64, hashlib, os, subprocess, sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
import p1_stub
STUB = p1_stub.ensure_new_styles()
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

OPEN_SINGLE = "(id) => { state.activeRecipeId = id; state.view = 'detail'; render(); openModal({ type: 'pdf-export', target: 'single', recipeId: id, stage: 'options', template: pdfDefaultTemplateId(), nutritionDetail: 'off' }); }"
SPY = """() => { window.__calls = []; for (const n of ['buildSinglePdf', 'buildCookbookPdf']) { if (!window['__orig_' + n]) window['__orig_' + n] = window[n];
  window[n] = function (...a) { const o = a[a.length - 1] || {}; window.__calls.push({ fn: n, template: o.template, author: o.author }); return window['__orig_' + n].apply(this, a); }; } }"""
HASH = "async () => { const u = new Uint8Array(await state.modal.previewBlob.arrayBuffer()); const d = await crypto.subtle.digest('SHA-256', u); return Array.from(new Uint8Array(d)).map(x => x.toString(16).padStart(2, '0')).join(''); }"

async def main():
    async with async_playwright() as p:
        browser, ctx = await open_ctx(p, 390, 844)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append('console: ' + m.text[:120]) if m.type == 'error' else None)
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(500)
        print('Nachbau der neuen Stile aktiv (Vorlagen-Tabelle noch nicht im Repo):', STUB)
        rid = await page.evaluate("state.recipes[0].id")
        await page.evaluate("() => { state.senderName = 'Anna'; localStorage.setItem(SENDER_NAME_KEY, 'Anna'); localStorage.removeItem('savora-pdf-template'); }")

        # ---------- Optionen ----------
        await page.evaluate(OPEN_SINGLE, rid)
        await page.wait_for_selector('[data-action="pdf-export-build"]')
        opts = await page.evaluate("Array.from(document.querySelectorAll('.pdf-tpl-opt')).map(b => [b.dataset.id, b.querySelector('b').textContent, b.getAttribute('aria-checked')])")
        check('Genau zwei Stile: Pur und Prise Pop', [o[0] for o in opts] == ['pur', 'prise-pop'] and [o[1] for o in opts] == ['Pur', 'Prise Pop'], str(opts))
        check('Standard ist Pur', opts[0][2] == 'true' and opts[1][2] == 'false', str(opts))
        txt = await page.evaluate("document.querySelector('.pdf-export-sheet').textContent")
        check('Keine alten Stilnamen im Dialog', not any(w in txt for w in ('Klassisch', 'Kräftig', 'Schlicht', 'Zum Drucken')))
        check('Dialog ist ein benannter Dialog mit Radiogruppe', await page.evaluate("(() => { const d = document.querySelector('.pdf-export-sheet'); return d.getAttribute('role') === 'dialog' && d.getAttribute('aria-modal') === 'true' && !!document.getElementById(d.getAttribute('aria-labelledby')) && !!document.querySelector('.pdf-tpl-choice[role=radiogroup]'); })()"))
        # Auswahl wird gemerkt
        await page.click('.pdf-tpl-opt[data-id="prise-pop"]'); await page.wait_for_timeout(200)
        check('Auswahl Prise Pop: aktiv und gespeichert', await page.evaluate("document.querySelector('.pdf-tpl-opt.active').dataset.id === 'prise-pop' && localStorage.getItem('savora-pdf-template') === 'prise-pop'"))
        check('Fokus bleibt auf der gewählten Option', await page.evaluate("document.activeElement && document.activeElement.dataset.id === 'prise-pop'"))
        await page.evaluate("closeModal()"); await page.evaluate(OPEN_SINGLE, rid); await page.wait_for_selector('.pdf-tpl-opt')
        check('Nach erneutem Öffnen ist Prise Pop vorgewählt', await page.evaluate("document.querySelector('.pdf-tpl-opt.active').dataset.id") == 'prise-pop')
        await page.click('.pdf-tpl-opt[data-id="pur"]'); await page.wait_for_timeout(150)
        check('Handy: kein Seitwärts-Scrollen im Dialog', await page.evaluate("document.documentElement.scrollWidth <= innerWidth"))

        # ---------- Name im PDF ----------
        f = await page.evaluate("({ v: document.getElementById('pdfNameInput').value, c: document.getElementById('pdfNamePrint').checked })")
        check('Name im PDF: Vorschlag aus dem gespeicherten Namen, nicht eingeschaltet', f['v'] == 'Anna' and f['c'] is False, str(f))
        await page.fill('#pdfNameInput', 'Anna B.')
        check('Tippen schaltet den Druck nicht automatisch ein', await page.evaluate("document.getElementById('pdfNamePrint').checked") is False)
        await page.click('.pdf-tpl-opt[data-id="prise-pop"]'); await page.wait_for_timeout(150)
        await page.click('.pdf-tpl-opt[data-id="pur"]'); await page.wait_for_timeout(150)
        check('Eingabe bleibt beim Wechsel des Stils erhalten', await page.evaluate("document.getElementById('pdfNameInput').value") == 'Anna B.')
        saved = await page.evaluate("[state.senderName, localStorage.getItem(SENDER_NAME_KEY)]")
        check('Gespeicherter Name bleibt unverändert (nicht überschrieben)', saved == ['Anna', 'Anna'], str(saved))

        # ---------- Erzeugen: Name aus, Doppelstart ----------
        await page.evaluate(SPY)
        await page.evaluate("() => { pdfExportBuildAction(); pdfExportBuildAction(); }")   # doppelter Start im selben Moment
        await page.wait_for_selector('[data-action="pdf-export-download"]', timeout=90000)
        calls = await page.evaluate("window.__calls")
        check('Doppelstart wird ignoriert (nur ein Export)', len(calls) == 1, str(calls))
        check('Name ausgeschaltet: es wird kein Name übergeben', calls and calls[0]['author'] == '' and calls[0]['template'] == 'pur', str(calls))
        pdf_path = os.path.join(OUT, 'dialog_pur.pdf')
        h0 = await page.evaluate(HASH); pages = await page.evaluate("state.modal.pageCount")
        async with page.expect_download(timeout=30000) as d:
            await page.click('[data-action="pdf-export-download"]')
        dl = await d.value; await dl.save_as(pdf_path)
        check('Vorschau und Download sind dieselben Bytes', hashlib.sha256(open(pdf_path, 'rb').read()).hexdigest() == h0)
        text = subprocess.run(['pdftotext', pdf_path, '-'], capture_output=True, text=True).stdout
        check('Ohne Haken steht kein Name im PDF', 'Anna' not in text)

        # ---------- Vorschau: Umschalter, Seitenzahl, Hinweis ----------
        await page.evaluate(OPEN_SINGLE, rid); await page.wait_for_selector('#pdfNameInput')
        await page.check('#pdfNamePrint'); await page.fill('#pdfNameInput', 'Anna B.')
        await page.evaluate(SPY)
        await page.click('[data-action="pdf-export-build"]')
        await page.wait_for_selector('[data-action="pdf-export-download"]', timeout=90000)
        calls = await page.evaluate("window.__calls")
        check('Name eingeschaltet: Name wird übergeben', calls and calls[0]['author'] == 'Anna B.', str(calls))
        path2 = os.path.join(OUT, 'dialog_name.pdf')
        b64 = await page.evaluate("async () => { const u = new Uint8Array(await state.modal.previewBlob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); }")
        open(path2, 'wb').write(base64.b64decode(b64))
        text2 = subprocess.run(['pdftotext', path2, '-'], capture_output=True, text=True).stdout
        check('Mit Haken steht der Name im PDF', 'Anna B.' in text2)
        check('Gespeicherter Name weiterhin unverändert', await page.evaluate("[state.senderName, localStorage.getItem(SENDER_NAME_KEY)]") == ['Anna', 'Anna'])
        sw = await page.evaluate("Array.from(document.querySelectorAll('.pdf-style-switch [role=radio]')).map(b => [b.dataset.id, b.getAttribute('aria-checked')])")
        check('Vorschau: Umschalter mit genau zwei Stilen', [x[0] for x in sw] == ['pur', 'prise-pop'] and sw[0][1] == 'true', str(sw))
        pm = await page.evaluate("document.querySelector('.pdf-preview-meta').textContent")
        check('Vorschau zeigt die Seitenzahl', 'Seite' in pm and str(pages) in pm, pm)
        h1 = await page.evaluate(HASH)
        await page.evaluate(SPY)
        await page.click('.pdf-style-switch [data-id="prise-pop"]')
        await page.wait_for_selector('[data-action="pdf-export-download"]', timeout=90000); await page.wait_for_timeout(300)
        h2 = await page.evaluate(HASH)
        calls = await page.evaluate("window.__calls")
        check('Stilwechsel in der Vorschau erzeugt ein neues PDF mit Prise Pop (und behält den Namen)', len(calls) == 1 and calls[0]['template'] == 'prise-pop' and calls[0]['author'] == 'Anna B.' and h1 != h2, str(calls))
        check('Vorschau zeigt Prise Pop als gewählt', await page.evaluate("document.querySelector('.pdf-style-switch .active').dataset.id") == 'prise-pop')
        note = await page.evaluate("[{ target: 'single', pageCount: 1, plannedPages: 1 }, { target: 'single', pageCount: 2, plannedPages: 2 }, { target: 'single', pageCount: 2, plannedPages: 1 }, { target: 'single', pageCount: 3, plannedPages: 3 }, { target: 'cookbook', pageCount: 2, plannedPages: 2 }].map(m => pdfMultiPageNote(m))")
        check('Zweiseiten-Satz nur bei genau 2 Seiten (Planer meldet 2)', note[0] == '' and note[1] == 'Dieses Rezept erhält zwei Seiten, damit alles gut lesbar bleibt.' and note[2] == '' and note[3] == '' and note[4] == '', str(note))
        await page.evaluate("() => { state.modal.pageCount = 2; state.modal.plannedPages = 2; render(); }")
        check('Zweiseiten-Satz erscheint in der Vorschau', 'zwei Seiten' in (await page.evaluate("document.getElementById('pdfMultiPageNote') ? document.getElementById('pdfMultiPageNote').textContent : ''")))
        await page.evaluate("closeModal()")

        # ---------- Fehler und Erneut versuchen ----------
        await page.evaluate(OPEN_SINGLE, rid); await page.wait_for_selector('[data-action="pdf-export-build"]')
        await page.evaluate("() => { window.__fail = true; const real = window.buildSinglePdf; window.__realSingle = real; window.buildSinglePdf = async (...a) => { if (window.__fail) { const e = new Error('x'); e.userMessage = 'Testfehler: Das Foto fehlt.'; throw e; } return real(...a); }; }")
        await page.click('[data-action="pdf-export-build"]')
        await page.wait_for_selector('.pdf-error-text', timeout=30000)
        et = await page.evaluate("[document.querySelector('.pdf-error-text').textContent, document.querySelector('.pdf-error-text').getAttribute('role'), Array.from(document.querySelectorAll('.pdf-export-sheet button')).map(b => b.textContent.trim())]")
        check('Fehlerzustand: verständlicher Text, role=alert, «Erneut versuchen» und «Zurück»', 'Testfehler' in et[0] and et[1] == 'alert' and any('Erneut versuchen' in b for b in et[2]) and any('Zurück' in b for b in et[2]), str(et))
        await page.evaluate("window.__fail = false")
        await page.click('[data-action="pdf-export-build"]')
        await page.wait_for_selector('[data-action="pdf-export-download"]', timeout=90000)
        check('Erneut versuchen führt zur Vorschau', await page.evaluate("state.modal.stage") == 'preview')
        await page.evaluate("closeModal()")

        # ---------- Abbruch während der Erstellung ----------
        await page.evaluate("() => { window.buildSinglePdf = window.__realSingle; }")
        await page.evaluate(OPEN_SINGLE, rid); await page.wait_for_selector('[data-action="pdf-export-build"]')
        await page.evaluate("() => { window.buildSinglePdf = (id, d, opts) => new Promise((res, rej) => { opts.signal.addEventListener('abort', () => { const e = new Error('abgebrochen'); e.aborted = true; rej(e); }); }); }")
        await page.click('[data-action="pdf-export-build"]'); await page.wait_for_selector('#pdfProgressBar')
        check('Fortschrittsanzeige mit ARIA', await page.evaluate("(() => { const b = document.getElementById('pdfProgressBar'); return b.getAttribute('role') === 'progressbar' && b.hasAttribute('aria-valuenow') && document.getElementById('pdfProgressText').getAttribute('role') === 'status'; })()"))
        await page.wait_for_timeout(800)
        await page.click('[data-action="pdf-export-cancel"]'); await page.wait_for_timeout(300)
        check('Abbrechen führt zurück zu den Optionen und gibt den Lauf frei', await page.evaluate("state.modal.stage === 'options' && _pdfExportRun === null && !!document.querySelector('.pdf-tpl-opt')"))
        await page.evaluate("closeModal()")

        # ---------- Escape schliesst ----------
        await page.evaluate("() => { window.buildSinglePdf = window.__realSingle; }")
        await page.evaluate(OPEN_SINGLE, rid); await page.wait_for_selector('.pdf-tpl-opt')
        await page.keyboard.press('Escape'); await page.wait_for_timeout(300)
        check('Escape schliesst den Dialog', await page.evaluate("!state.modal"))

        # ---------- Kochbuch ----------
        OPEN_BOOK = "() => { openModal({ type: 'pdf-export', target: 'cookbook', stage: 'options', template: pdfNormTpl(getCookbookConfig().pdfTemplate || pdfDefaultTemplateId()), nutritionDetail: 'off' }); }"
        await page.evaluate("(id) => saveCookbookConfig({ title: 'Testbuch', subtitle: '', author: 'Tester', pdfTemplate: 'B', chapters: [], items: [{ recipeId: id, chapterId: '' }] })", rid)
        await page.evaluate(OPEN_BOOK); await page.wait_for_selector('.pdf-tpl-opt')
        bo = await page.evaluate("({ ids: Array.from(document.querySelectorAll('.pdf-tpl-opt')).map(b => b.dataset.id), act: document.querySelector('.pdf-tpl-opt.active').dataset.id, v: document.getElementById('pdfNameInput').value, c: document.getElementById('pdfNamePrint').checked })")
        check('Kochbuch-Dialog: zwei Stile, alter Stil B ist als Prise Pop gewählt', bo['ids'] == ['pur', 'prise-pop'] and bo['act'] == 'prise-pop', str(bo))
        check('Kochbuch: vorhandener Name auf dem Titelblatt ist übernommen und eingeschaltet', bo['v'] == 'Tester' and bo['c'] is True, str(bo))
        await page.click('.pdf-tpl-opt[data-id="pur"]'); await page.wait_for_timeout(200)
        check('Kochbuch: Stilwahl wird im Kochbuch gespeichert (nur das Stilfeld)', await page.evaluate("(() => { const c = getCookbookConfig(); return c.pdfTemplate === 'pur' && c.title === 'Testbuch' && c.author === 'Tester' && c.items.length === 1; })()"))
        await page.uncheck('#pdfNamePrint')
        await page.evaluate(SPY)
        await page.click('[data-action="pdf-export-build"]')
        await page.wait_for_selector('[data-action="pdf-export-download"]', timeout=120000)
        calls = await page.evaluate("window.__calls")
        check('Kochbuch: Name aus gilt nur für diesen Export, gespeicherter Name bleibt', len(calls) == 1 and calls[0]['fn'] == 'buildCookbookPdf' and calls[0]['author'] == '' and await page.evaluate("getCookbookConfig().author") == 'Tester', str(calls))
        await page.evaluate("closeModal()")
        await page.evaluate("(id) => saveCookbookConfig({ title: 'Testbuch', subtitle: '', author: '', pdfTemplate: 'pur', chapters: [], items: [{ recipeId: id, chapterId: '' }] })", rid)
        await page.evaluate(OPEN_BOOK); await page.wait_for_selector('#pdfNameInput')
        bo2 = await page.evaluate("({ v: document.getElementById('pdfNameInput').value, c: document.getElementById('pdfNamePrint').checked })")
        check('Kochbuch ohne Namen: Vorschlag «Anna», nicht eingeschaltet', bo2['v'] == 'Anna' and bo2['c'] is False, str(bo2))
        await page.evaluate("closeModal()")
        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await browser.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
