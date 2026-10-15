"""v83 (H3): Kochbuch-PDF-Ablauf, Zusammenfassung, Prüfhinweise und Kochbuchübersicht.
Prueft: «PDF-Vorschau erstellen» oeffnet keinen zweiten Optionsdialog (direkt erstellen), eine gemeinsame Konfiguration pro Kochbuch
(Seitenstil, Naehrwerte, Name), Altwerte (Stil «B», fehlende Naehrwert-Angabe) verlustfrei, «4 Rezepte in 2 verwendeten Kapiteln»,
EIN Hinweis fuer leere Kapitel (aufklappbar, «Kapitel bearbeiten», Kapitel bleiben erhalten), Prioritaet Fehler > Pruefen > Info,
jeder Hinweis mit Ziel, kein pauschales «ist lang», echte Seitenzahl pro Rezept («Türkische Manti: 2 Seiten»), Stilvergleich in der
Vorschau aendert das Kochbuch nicht (erst «übernehmen»), Abbrechen zeigt die vorige fertige Vorschau, Download = sichtbare Vorschau,
Einzelrezept-PDF mit eigenem kompaktem Dialog ohne Coveroptionen, Uebersicht mit Coverminiatur (gleiche Zeichenfunktion, Cache,
Platzhalter bei Fehler) und Menue fuer Umbenennen/Duplizieren/Loeschen (letztes Kochbuch bleibt).
Echte PDFs (beide Stile, Kochbuch mit leeren Kapiteln) werden gespeichert und mit pdftoppm gerendert; SAVORA_PDF_TEXT_SHIFT_MM wirkt."""
import asyncio, base64, os, subprocess, sys
os.environ.setdefault('SAVORA_TEST_PORT', '23010')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
from pdf_harness import HOOK_JS
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info if not cond else '')
    if not cond: FAIL.append(name)

SETUP = """async () => {
  const m = emptyRecipe(); m.id = 'r_manti'; m.title = 'Türkische Manti'; m.servings = 4;
  m.ingredients = Array.from({length: 24}, (_, i) => ({ amount: String(10 + i), unit: 'g', name: 'Zutat ' + (i + 1) }));
  m.steps = Array.from({length: 14}, (_, i) => ({ text: 'Schritt ' + (i + 1) + ': Den Teig ausrollen, in Quadrate schneiden, füllen und sorgfältig verschliessen. Danach kurz ruhen lassen.' }));
  await dbPut(m); await loadRecipes();
  const ids = ['r_legacy_1', 'r_legacy_2', 'r_legacy_3'];
  const cfg = getCookbookConfig();
  cfg.chapters = ['Vorspeisen','Hauptgänge','Desserts','Saucen','Brot','Getränke'].map((n, i) => ({ id: 'c' + i, name: n }));
  cfg.items = [{ recipeId: ids[0], chapterId: 'c0' }, { recipeId: ids[1], chapterId: 'c0' }, { recipeId: ids[2], chapterId: 'c1' }, { recipeId: 'r_manti', chapterId: 'c1' }];
  cfg.title = 'Testbuch'; cfg.pdfTemplate = 'B';   // Altwert: «B» (Kraeftig) = Prise Pop
  delete cfg.pdfNutrition;
  saveCookbookConfig(cfg);
  state.view = 'cookbook'; state.cookbookStep = 3; render();
}"""
WAIT_PREVIEW = "() => state.modal && state.modal.type === 'pdf-export' && (state.modal.stage === 'preview' || state.modal.stage === 'error')"

async def save_pdf(page, path):
    b64 = await page.evaluate("""async () => { const u = new Uint8Array(await state.modal.previewBlob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); }""")
    open(path, 'wb').write(base64.b64decode(b64))
    subprocess.run(['pdftoppm', '-r', '50', '-png', path, path[:-4]], check=False)
    out = subprocess.run(['pdfinfo', path], capture_output=True, text=True).stdout
    return next((int(l.split()[1]) for l in out.splitlines() if l.startswith('Pages:')), 0)

async def main():
    shift = float(os.environ.get('SAVORA_PDF_TEXT_SHIFT_MM', '0') or 0)
    async with async_playwright() as p:
        b, ctx = await open_ctx(p, 1280, 900)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.evaluate(open(SEED_PATH).read())
        await page.evaluate(HOOK_JS); await page.evaluate('(mm) => { window.__pdfShiftMm = mm; }', shift)
        ev = page.evaluate
        await ev(SETUP); await page.wait_for_selector('#cbSummaryText')

        # ---------- Zusammenfassung und Hinweise ----------
        txt = await ev("() => document.getElementById('cbSummaryText').textContent")
        check('Zusammenfassung «4 Rezepte in 2 verwendeten Kapiteln»', txt == '4 Rezepte in 2 verwendeten Kapiteln', txt)
        summary = await ev("() => document.querySelector('.cb-summary').innerText")
        check('Altwert «B» erscheint als Seitenstil «Prise Pop»', 'Prise Pop' in summary, summary)
        hints = await ev("() => Array.from(document.querySelectorAll('.cb-warnings > li')).map(li => ({ level: li.dataset.level, text: li.querySelector('.cb-hint-text').textContent, go: (li.querySelector('.cb-hint-go') || {}).textContent || '' }))")
        empty = [h for h in hints if 'leere Kapitel' in h['text']]
        check('Leere Kapitel: genau EIN zusammengefasster Hinweis', len(empty) == 1 and empty[0]['text'] == '4 leere Kapitel werden im PDF ausgelassen.', str(hints))
        check('Leere Kapitel: Ziel «Kapitel bearbeiten», Stufe Info', bool(empty) and empty[0]['go'] == 'Kapitel bearbeiten' and empty[0]['level'] == 'info', str(empty))
        check('Kein Hinweis pro einzelnem leeren Kapitel', not any('ist leer' in h['text'] for h in hints), str(hints))
        check('Kein pauschales «ist lang und wird über mehrere Seiten gesetzt»', not any('über mehrere Seiten' in h['text'] for h in hints), str(hints))
        check('Jeder Hinweis hat sichtbaren Text', all(h['text'].strip() for h in hints))
        det = await ev("() => { const d = document.querySelector('.cb-hint-details'); d.open = true; return Array.from(d.querySelectorAll('li')).map(l => l.textContent); }")
        check('Details aufklappbar mit den Namen der leeren Kapitel', det == ['Desserts', 'Saucen', 'Brot', 'Getränke'], str(det))
        # Prioritaet: Rezept ohne Schritte (Pruefen) vor Info
        await ev("async () => { const r = state.recipes.find(x => x.id === 'r_legacy_3'); r.steps = []; await dbPut(r); await loadRecipes(); render(); }")
        levels = await ev("() => Array.from(document.querySelectorAll('.cb-warnings > li')).map(li => li.dataset.level)")
        rank = {'error': 0, 'check': 1, 'info': 2}
        check('Hinweise sortiert: Fehler, dann Prüfen, dann Info', levels == sorted(levels, key=lambda l: rank[l]) and 'check' in levels, str(levels))
        go = await ev("() => { const li = Array.from(document.querySelectorAll('.cb-warnings > li')).find(l => l.dataset.level === 'check'); const b = li.querySelector('.cb-hint-go'); return b ? [b.dataset.action, b.dataset.id, b.textContent] : null; }")
        check('Prüfen-Hinweis zum Rezept führt direkt zum Rezept («Rezept prüfen»)', go == ['open-recipe', 'r_legacy_3', 'Rezept prüfen'], str(go))
        await ev("async () => { const r = state.recipes.find(x => x.id === 'r_legacy_3'); r.steps = [{ text: 'Alles köcheln.' }]; await dbPut(r); await loadRecipes(); render(); }")
        await page.click('.cb-hint-go[data-action="cb-step"][data-id="1"]')
        await page.wait_for_function("() => state.cookbookStep === 1 && document.querySelectorAll('[data-cb-chapter]').length === 6")
        check('«Kapitel bearbeiten» öffnet Schritt 1, alle sechs Kapitel bleiben erhalten', True)

        # ---------- Gestalten: Naehrwerte und Name in derselben Konfiguration ----------
        await ev("() => { state.showNutrition = true; state.cookbookStep = 2; render(); }")
        await page.wait_for_selector('[data-action="cb-pdf-nutrition"]')
        cur = await ev("() => document.querySelector('[data-action=cb-pdf-nutrition][aria-checked=true]').dataset.level")
        check('Ohne gespeicherte Angabe: Nährwerte «Kompakt» (gleiches PDF wie bisher)', cur == 'compact', cur)
        await page.click('[data-action="cb-pdf-nutrition"][data-level="off"]')
        check('Nährwerte «Aus» wird im Kochbuch gespeichert', await ev("() => getCookbookConfig().pdfNutrition") == 'off')
        await ev("() => { state.senderName = 'Anna Muster'; render(); }")
        await page.click('[data-action="cb-use-sender-name"]')
        await page.wait_for_function("() => getCookbookConfig().author === 'Anna Muster'")
        where = await ev("() => document.getElementById('cbNameWhere').textContent")
        cover_name = await ev("() => (document.getElementById('cbAuthor') || {}).value")
        check('Name: gleiche Angabe im Cover-Editor (Feld «Name») und in «Im PDF»', cover_name == 'Anna Muster' and 'Titelblatt und in der Fusszeile' in where, f'{cover_name} | {where}')

        # ---------- Vorschau & PDF: kein zweiter Dialog ----------
        await ev("() => { state.cookbookStep = 3; render(); }")
        await page.click('.cb-final > [data-action="export-cookbook"]')
        st = await ev("() => state.modal && state.modal.stage")
        check('«PDF-Vorschau erstellen» startet direkt (kein Optionsschritt)', st in ('building', 'preview'), str(st))
        check('Kein zweiter Dialog mit Name, Seitenstil und Nährwerten', await ev("() => !document.getElementById('pdfNamePrint') && !document.querySelector('.pdf-tpl-choice')"))
        await page.wait_for_function(WAIT_PREVIEW, timeout=240000)
        m = await ev("() => ({ stage: state.modal.stage, tpl: state.modal.shownTemplate, nut: state.modal.nutritionDetail, err: state.modal.errorText })")
        check('Export nutzt die Konfiguration (Prise Pop aus «B», Nährwerte Aus)', m['stage'] == 'preview' and m['tpl'] == 'prise-pop' and m['nut'] == 'off', str(m))
        src = await ev("() => [typeof pdfLastPageCounts !== 'undefined' && pdfLastPageCounts && pdfLastPageCounts.get('r_manti'), state.cookbookLastBuild && state.cookbookLastBuild.pages.r_manti]")
        check('Seitenzahl je Rezept stammt aus pdfLastPageCounts (pdf.js)', src == [2, 2], str(src))
        os.makedirs(OUT, exist_ok=True)
        pages_pop = await save_pdf(page, os.path.join(OUT, 'v83_kochbuch_prise-pop.pdf'))
        txt = subprocess.run(['pdftotext', '-layout', os.path.join(OUT, 'v83_kochbuch_prise-pop.pdf'), '-'], capture_output=True, text=True).stdout
        check('PDF: leere Kapitel erscheinen nicht, verwendete schon', 'Vorspeisen' in txt and 'Hauptgänge' in txt and 'Desserts' not in txt and 'Getränke' not in txt)
        check('PDF: Name aus dem Kochbuch gedruckt', 'Anna Muster' in txt)
        await page.screenshot(path=os.path.join(OUT, 'v83_vorschau_1280.png'))
        # Stilvergleich: aendert das Kochbuch nicht
        await page.click('.pdf-style-switch [data-id="pur"]')
        await page.wait_for_function("() => state.modal && state.modal.stage === 'preview' && state.modal.shownTemplate === 'pur'", timeout=240000)
        check('Stilvergleich ändert das Kochbuch nicht', await ev("() => cookbookPdfTemplate(getCookbookConfig())") == 'prise-pop')
        note = await ev("() => document.getElementById('pdfCompareNote').innerText")
        check('Vergleich ist klar beschriftet und bietet «übernehmen» an', 'Vergleich' in note and 'fürs Kochbuch übernehmen' in note, note)
        pages_pur = await save_pdf(page, os.path.join(OUT, 'v83_kochbuch_pur.pdf'))
        # Abbrechen eines neuen Laufs zeigt die vorige fertige Vorschau (Pur) wieder, Download gehoert dazu
        await page.click('.pdf-style-switch [data-id="prise-pop"]')
        await page.wait_for_function("() => state.modal.stage === 'building'")
        await page.wait_for_timeout(750)   # Schutz gegen Doppelklick auf «Abbrechen» (700 ms) abwarten
        await ev("() => pdfExportCancelAction()")
        r = await ev("() => ({ stage: state.modal && state.modal.stage, tpl: state.modal && state.modal.shownTemplate, sw: document.querySelector('.pdf-style-switch [aria-checked=true]').dataset.id, blob: !!state.modal.previewBlob })")
        check('Abbrechen: vorige fertige Vorschau (Pur) wieder sichtbar, Umschalter passt dazu', r == {'stage': 'preview', 'tpl': 'pur', 'sw': 'pur', 'blob': True}, str(r))
        await page.click('[data-action="pdf-export-adopt-template"]')
        check('«Pur fürs Kochbuch übernehmen» speichert den Stil', await ev("() => getCookbookConfig().pdfTemplate") == 'pur')
        await page.click('[data-action="pdf-export-back"]')
        await page.wait_for_function("() => !state.modal")
        check('Zurück schliesst die Vorschau (kein Optionsdialog dazwischen)', await ev("() => state.view") == 'cookbook')
        pg = await ev("() => Array.from(document.querySelectorAll('.cb-pages-list li')).map(li => li.innerText.replace(/\\s+/g, ' '))")
        check('Echte Seitenzahl pro Rezept: «Türkische Manti 2 Seiten»', any(x.startswith('Türkische Manti') and x.endswith('2 Seiten') for x in pg), str(pg))
        check('Kurze Rezepte: 1 Seite', sum(1 for x in pg if x.endswith('1 Seite')) == 3, str(pg))
        check('Pur- und Prise-Pop-PDF haben Seiten', pages_pop > 4 and pages_pur > 4, f'{pages_pop} {pages_pur}')

        # ---------- Einzelrezept: eigener kompakter Dialog ohne Coveroptionen ----------
        await ev("() => { openModal({ type: 'pdf-export', target: 'single', recipeId: 'r_legacy_2', stage: 'options', template: pdfDefaultTemplateId(), nutritionDetail: 'off' }); }")
        await page.wait_for_selector('.pdf-export-sheet .pdf-tpl-choice')
        single = await ev("() => ({ cover: !!document.querySelector('.pdf-export-sheet .ce, .pdf-export-sheet .cover-picker'), name: !!document.getElementById('pdfNamePrint'), stage: state.modal.stage })")
        check('Einzelrezept: Optionen (Stil, Name), keine Coveroptionen', single == {'cover': False, 'name': True, 'stage': 'options'}, str(single))
        await ev("() => closeModal()"); await page.wait_for_function("() => !state.modal")

        # ---------- Kochbuchuebersicht ----------
        await ev("() => { cookbookCreate('Zweites Buch'); state.view = 'cookbooks'; render(); }")
        await page.wait_for_function("() => document.querySelectorAll('img[data-cbk-thumb].is-rendered').length === 2", timeout=30000)
        card = await ev("() => { const c = document.querySelector('.cbk-card'); return { meta: c.querySelector('.cbk-meta').textContent, date: !!c.querySelector('.cbk-date'), btns: Array.from(c.querySelectorAll('button')).map(b => b.textContent.trim() || b.getAttribute('aria-label')) }; }")
        check('Karte: Anzahl Rezepte, dezentes Datum, Öffnen und ein Menü', card['meta'] == '4 Rezepte' and card['date'] and len(card['btns']) == 2 and card['btns'][0] == 'Öffnen', str(card))
        srcs = await ev("() => Array.from(document.querySelectorAll('img[data-cbk-thumb]')).map(i => i.src.slice(0, 22))")
        check('Coverminiaturen aus der Cover-Zeichenfunktion (Bilddaten, nicht nur Vorlagenbild)', all(s.startswith('data:image/jpeg') for s in srcs), str(srcs))
        # Cache: erneutes Rendern zeichnet nicht neu
        await ev("() => { window.__thumbCalls = 0; const o = coverRenderCanvas; window.coverRenderCanvas = async function () { window.__thumbCalls++; return o.apply(this, arguments); }; render(); }")
        await page.wait_for_timeout(300)
        check('Erneuter Seitenaufruf: keine Neuberechnung (Cache)', await ev("() => window.__thumbCalls") == 0 and await ev("() => document.querySelectorAll('img[data-cbk-thumb].is-rendered').length") == 2)
        # Titel geaendert: neue Miniatur, kein veralteter Text
        await ev("() => { const s = cookbookStoreRead(); const bk = s.books.find(x => x.name === 'Zweites Buch'); bk.config.title = 'Neuer Titel'; localStorage.setItem(COOKBOOK_PROJECTS_KEY, JSON.stringify(s)); render(); }")
        await page.wait_for_function("() => window.__thumbCalls >= 1 && document.querySelectorAll('img[data-cbk-thumb].is-rendered').length === 2", timeout=30000)
        check('Geänderter Titel: Miniatur wird neu gezeichnet', True)
        # Fehler: Platzhalter
        await ev("() => { window.coverRenderCanvas = async () => { throw new Error('kaputt'); }; const s = cookbookStoreRead(); s.books[1].config.title = 'Noch neuer'; localStorage.setItem(COOKBOOK_PROJECTS_KEY, JSON.stringify(s)); render(); }")
        await page.wait_for_function("() => document.querySelector('img[data-cbk-thumb].is-fallback')", timeout=10000)
        fb = await ev("() => { const i = document.querySelector('img[data-cbk-thumb].is-fallback'); return i.getAttribute('src'); }")
        check('Ladefehler: Vorlagenbild als Platzhalter', fb.startswith('assets/covers/'), fb)
        # Menue
        bid = await ev("() => cookbookBooks()[1].id")
        await page.click(f'[data-action="cb-menu"][data-id="{bid}"]')
        await page.wait_for_selector('.modal-sheet [data-action="cb-rename"]')
        items = await ev("() => Array.from(document.querySelectorAll('.modal-sheet .menu-item')).map(b => b.textContent.trim())")
        check('Menü: Umbenennen, Duplizieren, Löschen', items == ['Umbenennen', 'Duplizieren', 'Löschen'], str(items))
        await page.click('.modal-sheet [data-action="cb-rename"]')
        await page.wait_for_selector('#cbNameInput')
        await page.fill('#cbNameInput', 'Umbenannt'); await page.click('[data-action="cb-name-save"]')
        await page.wait_for_function("() => !state.modal && Array.from(document.querySelectorAll('.cbk-name')).some(e => e.textContent === 'Umbenannt')")
        foc = await ev("() => document.activeElement && document.activeElement.dataset.action")
        check('Nach dem Umbenennen: Fokus zurück auf dem Menüknopf', foc == 'cb-menu', str(foc))
        await page.click(f'[data-action="cb-menu"][data-id="{bid}"]'); await page.wait_for_selector('.modal-sheet [data-action="cb-delete"]')
        await page.click('.modal-sheet [data-action="cb-delete"]'); await page.wait_for_selector('[data-action="cb-delete-confirm"]')
        await page.click('[data-action="cb-delete-confirm"]')
        await page.wait_for_function("() => cookbookBooks().length === 1 && !state.modal")
        one = await ev("() => cookbookBooks()[0].id")
        await page.click(f'[data-action="cb-menu"][data-id="{one}"]'); await page.wait_for_selector('.modal-sheet [data-action="cb-delete"]')
        dis = await ev("() => document.querySelector('.modal-sheet [data-action=cb-delete]').disabled && !!document.getElementById('cbMenuOnly')")
        check('Letztes Kochbuch: Löschen gesperrt mit Erklärung (Regel unverändert)', dis)
        await ev("() => closeModal()"); await page.wait_for_function("() => !state.modal")
        check('Löschen eines Kochbuchs lässt alle Rezepte bestehen', await ev("() => state.recipes.length") == 4)

        # ---------- Screenshots 390/1280 hell/dunkel, ohne horizontales Scrollen ----------
        await ev("() => { window.coverRenderCanvas = undefined; }")
        await page.reload(); await page.wait_for_function("typeof state !== 'undefined' && document.getElementById('app').children.length > 0")
        for theme in ('light', 'dark'):
            for w in (390, 1280):
                await page.set_viewport_size({'width': w, 'height': 900})
                await ev("(t) => { document.documentElement.dataset.theme = t; localStorage.setItem('savora-theme', t); if (typeof applyTheme === 'function') applyTheme(); }", theme)
                for view, step in (('cookbooks', 0), ('cookbook', 2), ('cookbook', 3)):
                    await ev("([v, s]) => { state.view = v; state.cookbookStep = s || 1; render(); window.scrollTo(0, 0); }", [view, step])
                    await page.wait_for_timeout(250)
                    ov = await ev("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
                    check(f'{view}{step or ""} {w}px {theme}: kein horizontales Scrollen', ov <= 0, str(await overflow_info(page)))
                    await page.screenshot(path=os.path.join(OUT, f'v83_{view}{step or ""}_{w}_{theme}.png'), full_page=True)
        check('Keine JS-Fehler', not errs, str(errs[:3]))
        await b.close()
    print('\n' + ('ALLE OK' if not FAIL else f'{len(FAIL)} FEHLER: ' + '; '.join(FAIL)))
    print('Ausgabe:', OUT)
    sys.exit(1 if FAIL else 0)

asyncio.run(main())
