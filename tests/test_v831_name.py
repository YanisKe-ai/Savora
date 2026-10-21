"""v0.83.1: Wo der Name im Kochbuch-PDF gedruckt wird (Schritt «Gestalten», Bereich «Im PDF»).
Prueft: Wahl «Titelblatt und Fusszeile» (Standard, auch fuer bestehende Buecher ohne Feld), «Nur Titelblatt», «Nur Fusszeile»,
«Nicht drucken» als Feld printName in der Kochbuch-Konfiguration; der Name (author) bleibt bei jeder Wahl gespeichert;
die alte Aktion «Keinen Namen im PDF zeigen» (cb-clear-name) setzt «Nicht drucken» statt den Namen zu loeschen; cookbookSanitizeStore,
die Platzhalter-Konfiguration ohne Auswahl und ein Neuladen erhalten das Feld; Zusammenfassung in «Vorschau & PDF» mit denselben Begriffen;
Titelblatt-Vorschau zeigt den Namen nur, wenn er aufs Titelblatt gehoert.
Echte PDFs (Pur und Prise Pop, alle vier Varianten): pdftotext je Seite prueft, ob der Name auf dem Titelblatt (Seite 1) und in der
Fusszeile von Inhalt und Rezeptseiten steht; pdfinfo «Author» nur, wenn der Name gedruckt wird. Name mit ß, Umlaut und Akzent (Lehre 6).
Seiten werden mit pdftoppm gerendert. SAVORA_PDF_TEXT_SHIFT_MM wirkt (Linux-Simulation)."""
import asyncio, base64, os, re, subprocess, sys
os.environ.setdefault('SAVORA_TEST_PORT', '63010')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
from pdf_harness import HOOK_JS
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info if not cond else '')
    if not cond: FAIL.append(name)

NAME = 'Zoë Strauß-Müller'
LABEL = {'both': 'Titelblatt und Fusszeile', 'cover': 'Nur Titelblatt', 'footer': 'Nur Fusszeile', 'none': 'Nicht drucken'}

SETUP = """async (name) => {
  const cfg = getCookbookConfig();
  cfg.items = [{ recipeId: 'r_legacy_2', chapterId: '' }, { recipeId: 'r_legacy_3', chapterId: '' }];
  cfg.chapters = []; cfg.title = 'Namenbuch'; cfg.author = name; cfg.pdfTemplate = 'pur';
  delete cfg.printName;   // bestehendes Buch ohne das neue Feld
  saveCookbookConfig(cfg);
  state.view = 'cookbook'; state.cookbookStep = 2; state.cbDesignPart = 'pages'; render();   // v85: Name im PDF steht im Teil «Rezeptseiten»
}"""

def norm(s):
    return re.sub(r'\s+', '', s).casefold()   # casefold: ß -> ss, Grossschreibung (Prise Pop) egal

def page_texts(path):
    info = subprocess.run(['pdfinfo', path], capture_output=True, text=True).stdout
    n = next((int(l.split()[1]) for l in info.splitlines() if l.startswith('Pages:')), 0)
    author = next((l.split(':', 1)[1].strip() for l in info.splitlines() if l.startswith('Author:')), '')
    pages = [subprocess.run(['pdftotext', '-f', str(i), '-l', str(i), '-layout', path, '-'], capture_output=True, text=True).stdout for i in range(1, n + 1)]
    return pages, author

async def build_pdf(ev, tpl, path):
    b64 = await ev("""async (tpl) => {
      const cfg = getCookbookConfig();
      const res = await buildCookbookPdf('off', { template: tpl });
      const u = new Uint8Array(await res.blob.arrayBuffer()); let s = '';
      for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192));
      return btoa(s);
    }""", tpl)
    open(path, 'wb').write(base64.b64decode(b64))
    subprocess.run(['pdftoppm', '-r', '60', '-png', path, path[:-4]], check=False)

async def main():
    shift = float(os.environ.get('SAVORA_PDF_TEXT_SHIFT_MM', '0') or 0)
    tag = '' if not shift else '_shift' + str(shift).replace('.', '')
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        b, ctx = await open_ctx(p, 1280, 900)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.evaluate(open(SEED_PATH).read())
        await page.evaluate(HOOK_JS); await page.evaluate('(mm) => { window.__pdfShiftMm = mm; }', shift)
        ev = page.evaluate
        await ev(SETUP, NAME)
        await page.wait_for_selector('[data-cb-print-name]')

        # ---------- Gestalten: Wahl, Standard, Speichern ----------
        opts = await ev("() => Array.from(document.querySelectorAll('[data-cb-print-name]')).map(i => [i.value, i.checked, i.closest('label').textContent.trim()])")
        check('Vier Varianten mit den Begriffen aus dem Auftrag', [o[2] for o in opts] == [LABEL[k] for k in ('both', 'cover', 'footer', 'none')], str(opts))
        check('Ohne Feld: «Titelblatt und Fusszeile» gewählt (bisheriges Verhalten)', [o[0] for o in opts if o[1]] == ['both'], str(opts))
        check('Radiogruppe ist beschriftet', await ev("() => { const g = document.querySelector('.cb-print-name'); return g.getAttribute('role') === 'radiogroup' && !!document.getElementById(g.getAttribute('aria-labelledby')).textContent.trim(); }"))
        where = await ev("() => document.getElementById('cbNameWhere').textContent")
        check('Hinweis «Titelblatt und in der Fusszeile» bei Standard', 'Titelblatt und in der Fusszeile' in where, where)
        check('Alter Knopf «Keinen Namen im PDF zeigen» ist in der Wahl aufgegangen', await ev("() => !document.querySelector('[data-action=cb-clear-name]')"))
        await page.click('[data-cb-print-name][value="cover"]')
        await page.wait_for_function("() => getCookbookConfig().printName === 'cover'")
        r = await ev("() => ({ a: getCookbookConfig().author, focus: document.activeElement && document.activeElement.value, where: document.getElementById('cbNameWhere').textContent })")
        check('«Nur Titelblatt» gespeichert, Name bleibt, Fokus bleibt auf der Wahl', r['a'] == NAME and r['focus'] == 'cover' and 'nur auf dem Titelblatt' in r['where'], str(r))
        await page.keyboard.press('ArrowDown')
        await page.wait_for_function("() => getCookbookConfig().printName === 'footer'")
        check('Pfeiltaste wählt «Nur Fusszeile» (Tastatur)', True)
        await page.click('[data-cb-print-name][value="none"]')
        await page.wait_for_function("() => getCookbookConfig().printName === 'none'")
        check('«Nicht drucken» behält den Namen', await ev("() => getCookbookConfig().author") == NAME)
        # alte Aktion: setzt «Nicht drucken», loescht den Namen nicht
        await ev("async () => { const c = getCookbookConfig(); c.printName = 'both'; saveCookbookConfig(c); render(); const b = document.createElement('button'); b.dataset.action = 'cb-clear-name'; await handleActionV2('cb-clear-name', null, b, { preventDefault() {} }); }")
        r = await ev("() => ({ pn: getCookbookConfig().printName, a: getCookbookConfig().author })")
        check('cb-clear-name setzt «Nicht drucken» ohne Datenverlust', r == {'pn': 'none', 'a': NAME}, str(r))

        # ---------- Speicher, Sicherung, Platzhalter ----------
        r = await ev("""() => {
          const s = cookbookSanitizeStore({ v: 1, activeId: 'x', books: [{ id: 'x', name: 'A', config: { printName: 'footer', author: 'B' } }] });
          const stored = JSON.parse(localStorage.getItem(COOKBOOK_PROJECTS_KEY));
          const act = stored.books.find(b => b.id === stored.activeId);
          return { san: s.books[0].config.printName, stored: act.config.printName, bad: cookbookPrintName({ printName: 'quer' }), miss: cookbookPrintName({}) };
        }""")
        check('cookbookSanitizeStore erhält printName; gespeichert im Projekt; unbekannt/fehlt = both', r == {'san': 'footer', 'stored': 'none', 'bad': 'both', 'miss': 'both'}, str(r))
        r = await ev("""() => {
          const s = cookbookStoreRead(); const b = s.books.find(x => x.id === s.activeId);
          const keep = b.config; b.config = { title: 'Stub', author: 'C', printName: 'cover' }; cookbookWrite(s);
          const c = getCookbookConfig(); const out = { pn: c.printName, def: !!c.isDefault, cover: coverInputFromConfig(c).name };
          const s2 = cookbookStoreRead(); s2.books.find(x => x.id === s2.activeId).config = keep; cookbookWrite(s2);
          return out;
        }""")
        check('Platzhalter-Konfiguration (ohne Auswahl) behält printName', r == {'pn': 'cover', 'def': True, 'cover': 'C'}, str(r))
        r = await ev("""() => backupCookbookIsPristine({ config: { printName: 'none' } })""")
        check('Sicherung: Buch mit nur printName gilt nicht als unberührt', r is False, str(r))
        await page.reload(); await page.wait_for_function("() => typeof getCookbookConfig === 'function' && state.recipes && state.recipes.length > 0")
        await page.evaluate(HOOK_JS); await page.evaluate('(mm) => { window.__pdfShiftMm = mm; }', shift)
        r = await ev("() => ({ pn: getCookbookConfig().printName, a: getCookbookConfig().author })")
        check('Nach Neuladen: Wahl und Name erhalten', r == {'pn': 'none', 'a': NAME}, str(r))

        # ---------- Zusammenfassung «Vorschau & PDF» ----------
        for pn in ('both', 'cover', 'footer', 'none'):
            r = await ev("""(pn) => { const c = getCookbookConfig(); c.printName = pn; saveCookbookConfig(c); state.view = 'cookbook'; state.cookbookStep = 3; render();
              const dd = document.getElementById('cbSummaryPrintName');
              const blocks = JSON.parse(document.querySelector('.cb-final .cv-canvas').dataset.layout).blocks;   // Layout der angezeigten Titelblatt-Vorschau
              return { dd: dd && dd.textContent, cover: blocks.some(bl => bl.key === 'name' && bl.lines.join(' ').includes(c.author)) }; }""", pn)
            check(f'Zusammenfassung «{LABEL[pn]}», Titelblatt-Vorschau mit Name: {pn in ("both", "cover")}', r['dd'] == LABEL[pn] and r['cover'] == (pn in ('both', 'cover')), str(r))
        await page.screenshot(path=os.path.join(OUT, f'v831_zusammenfassung{tag}.png'))
        await ev("() => { state.cookbookStep = 2; state.cbDesignPart = 'pages'; render(); }")
        el = await page.query_selector('.cb-pdf-opts')
        if el: await el.screenshot(path=os.path.join(OUT, f'v831_gestalten_im_pdf{tag}.png'))

        # ---------- Echte PDFs ----------
        want = norm(NAME)
        for tpl in ('pur', 'prise-pop'):
            for pn in ('both', 'cover', 'footer', 'none'):
                await ev("(pn) => { const c = getCookbookConfig(); c.printName = pn; saveCookbookConfig(c); }", pn)
                path = os.path.join(OUT, f'v831_{tpl}_{pn}{tag}.pdf')
                await build_pdf(ev, tpl, path)
                pages, author = page_texts(path)
                on_cover = want in norm(pages[0]) if pages else False
                recipe_pages = pages[1:]   # 1 Titelblatt, danach Inhalt und Rezepte (alle mit Fusszeile)
                in_foot = [want in norm(t) for t in recipe_pages]
                title_foot = all('namenbuch' in norm(t) for t in recipe_pages)
                exp_cover, exp_foot = pn in ('both', 'cover'), pn in ('both', 'footer')
                check(f'PDF {tpl}/{pn}: Name auf Titelblatt = {exp_cover}', on_cover == exp_cover, pages[0][:300] if pages else 'leer')
                check(f'PDF {tpl}/{pn}: Name in jeder Fusszeile = {exp_foot}', bool(recipe_pages) and all(x == exp_foot for x in in_foot), str(in_foot))
                check(f'PDF {tpl}/{pn}: Buchtitel weiter in der Fusszeile', title_foot)
                check(f'PDF {tpl}/{pn}: Name nirgends sonst', exp_cover or exp_foot or all(want not in norm(t) for t in pages))
                check(f'PDF {tpl}/{pn}: Eigenschaft «Autor» nur, wenn gedruckt', (author == NAME) == (exp_cover or exp_foot), repr(author))
        check('Keine Seitenfehler', not errs, str(errs))
        await b.close()
    print('Ausgabe:', OUT)
    if FAIL:
        print('FEHLER:', len(FAIL)); sys.exit(1)
    print('Alle Prüfungen bestanden')

asyncio.run(main())
