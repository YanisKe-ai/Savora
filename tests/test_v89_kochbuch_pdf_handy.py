"""v0.89 C: Kochbuch-Assistent und Einzel-PDF-Dialog auf dem Handy (375x667 und 390x844, hell und dunkel).
Prueft: im Assistenten (alle drei Schritte) keine untere Navigation, Fussleiste Zurück/Weiter allein am unteren Rand;
Schritt 3: «PDF-Vorschau erstellen» klebt auf einer deckenden Flaeche (Hintergrund nicht transparent), ueberdeckt beim Scrollen
nichts Antippbares und ist auch gesperrt (kein Rezept) deckend hinterlegt; ab 900 px bleibt die Seitenleiste.
Einzel-PDF: «PDF erstellen» als feste Fusszeile ohne Scrollen sichtbar und antippbar, Kaestchen «Name im PDF drucken» unter dem
Namensfeld, Abstand vor «Nährwerte im PDF» mindestens 16 px. Nur Testdaten."""
import asyncio, os, sys
os.environ.setdefault('SAVORA_TEST_PORT', '48450')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info if not cond else '')
    if not cond: FAIL.append(name)

BAR = """() => { const bar = document.querySelector('.cb-final > .cb-export-bar'); const b = bar && bar.querySelector('[data-action="export-cookbook"]');
  if (!b) return null; const r = b.getBoundingClientRect(), br = bar.getBoundingClientRect(); const bg = getComputedStyle(bar).backgroundColor;
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { pos: getComputedStyle(bar).position, opaque: !/rgba\\(.*,\\s*0(\\.\\d+)?\\)$/.test(bg) && bg !== 'transparent', bg, btnBottom: r.bottom, barBottom: br.bottom, vh: innerHeight, gap: br.bottom - r.bottom, hit: !!hit && b.contains(hit), disabled: b.disabled }; }"""

async def main():
    async with async_playwright() as p:
        browser, ctx = await open_ctx(p, 390, 844)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.evaluate(open(SEED_PATH).read())
        await page.wait_for_function("() => state.recipes.length >= 3")
        ev = page.evaluate
        for (w, h) in ((375, 667), (390, 844)):
            await page.set_viewport_size({'width': w, 'height': h})
            for theme in ('light', 'dark'):
                tag = f'[{w}x{h} {theme}]'
                await ev("(t) => { document.documentElement.dataset.theme = t; }", theme)
                # leeres Kochbuch: Schritt 3 mit gesperrtem Knopf
                await ev("() => { state.modal = null; cookbookCreate('Test ' + Math.random()); state.view = 'cookbook'; state.cookbookStep = 3; render(); window.scrollTo(0, 0); }")
                await page.wait_for_selector('.cb-export-bar')
                nav = await ev("() => { const n = document.querySelector('.bottom-nav'); return n ? getComputedStyle(n).display : 'fehlt'; }")
                check(f'{tag} Assistent: untere Navigation ausgeblendet', nav in ('none', 'fehlt'), nav)
                r = await ev(BAR)
                check(f'{tag} Schritt 3 leer: Knopf gesperrt, klebend, deckende Fläche, im Bild mit Abstand unten', r and r['disabled'] and r['pos'] == 'sticky' and r['opaque'] and r['btnBottom'] <= r['vh'] - 8 and r['gap'] >= 8, str(r))
                # gefuellt: alle Rezepte aufnehmen
                await ev("() => { const c = getCookbookConfig(); c.items = state.recipes.map(x => ({ recipeId: x.id, chapterId: '' })); saveCookbookConfig(c); state.cookbookStep = 3; render(); window.scrollTo(0, 0); }")
                await page.wait_for_selector('.cb-export-bar [data-action="export-cookbook"]:not([disabled])')
                await ev("() => window.scrollTo(0, 200)")
                await page.wait_for_function("() => scrollY > 0 || document.documentElement.scrollHeight <= innerHeight")
                r = await ev(BAR)
                check(f'{tag} Schritt 3 gefüllt: Knopf im Bild und antippbar, deckend hinterlegt', r and not r['disabled'] and r['hit'] and r['opaque'] and r['btnBottom'] <= r['vh'] - 8, str(r))
                # Schritt 1: Fussleiste allein am unteren Rand
                await ev("() => { state.cookbookStep = 1; render(); window.scrollTo(0, 0); }")
                await page.wait_for_selector('.cb-step-footer .primary-btn')
                f = await ev("() => { const f = document.querySelector('.cb-step-footer'), b = f.querySelector('.primary-btn'), r = f.getBoundingClientRect(), br = b.getBoundingClientRect(); const hit = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2); return { bottom: r.bottom, vh: innerHeight, hit: !!hit && b.contains(hit), pad: parseFloat(getComputedStyle(f).paddingBottom), long: document.documentElement.scrollHeight > innerHeight + 1 }; }")
                check(f'{tag} Schritt 1: Fussleiste im Bild (bei langer Seite unten bündig), «Weiter» antippbar', f['bottom'] <= f['vh'] + 1 and (not f['long'] or abs(f['bottom'] - f['vh']) <= 1) and f['hit'] and f['pad'] >= 12, str(f))
                # Einzel-PDF-Dialog
                rid = await ev("state.recipes[0].id")
                await ev("(id) => { state.activeRecipeId = id; state.view = 'detail'; state.showNutrition = true; render(); openModal({ type: 'pdf-export', target: 'single', recipeId: id, stage: 'options', template: pdfDefaultTemplateId(), nutritionDetail: 'compact' }); }", rid)
                await page.wait_for_selector('.pdf-export-footer [data-action="pdf-export-build"]')
                d = await ev("""() => { const s = document.querySelector('.pdf-export-sheet'); const b = s.querySelector('.pdf-export-footer [data-action="pdf-export-build"]'); const br = b.getBoundingClientRect(), sr = s.getBoundingClientRect();
                  const hit = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2);
                  const inp = document.getElementById('pdfNameInput').getBoundingClientRect(), cb = document.getElementById('pdfNamePrint').getBoundingClientRect();
                  const nl = s.querySelector('.pdf-nutri-label'), prev = nl && nl.previousElementSibling;
                  return { scrollable: s.scrollHeight > s.clientHeight, visible: br.bottom <= Math.min(innerHeight, sr.bottom) && br.top >= sr.top, hit: !!hit && b.contains(hit), h: br.height,
                    order: cb.top >= inp.bottom, space: nl && prev ? nl.getBoundingClientRect().top - prev.getBoundingClientRect().bottom : null, footBg: getComputedStyle(b.parentElement).backgroundColor }; }""")
                check(f'{tag} Einzel-PDF: «PDF erstellen» ohne Scrollen sichtbar und antippbar (feste Fusszeile)', d['visible'] and d['hit'] and d['h'] >= 44, str(d))
                check(f'{tag} Einzel-PDF: Kästchen unter dem Namensfeld, Abstand vor «Nährwerte» >= 16 px', d['order'] and d['space'] is not None and d['space'] >= 16, str(d))
                await ev("() => { const s = document.querySelector('.pdf-export-sheet'); s.scrollTop = s.scrollHeight; }")
                d2 = await ev("""() => { const s = document.querySelector('.pdf-export-sheet'), f = s.querySelector('.pdf-export-footer'), hint = s.querySelector('.pdf-preview-hint');
                  return { hintAbove: hint.getBoundingClientRect().bottom <= f.getBoundingClientRect().top + 1, footBottom: Math.round(f.getBoundingClientRect().bottom), sheetBottom: Math.round(s.getBoundingClientRect().bottom) }; }""")
                check(f'{tag} Einzel-PDF ganz unten: letzter Hinweis über der Fusszeile, Fusszeile bündig am Rand', d2['hintAbove'] and abs(d2['footBottom'] - d2['sheetBottom']) <= 1, str(d2))
                await ev("() => closeModal()")
        # Desktop: Seitenleiste bleibt
        await page.set_viewport_size({'width': 1280, 'height': 800})
        await ev("() => { state.modal = null; state.view = 'cookbook'; state.cookbookStep = 3; render(); }")
        await page.wait_for_selector('.cb-export-bar')
        side = await ev("() => { const n = document.querySelector('.bottom-nav'); const r = n.getBoundingClientRect(); return { d: getComputedStyle(n).display, w: r.width, h: r.height }; }")
        check('1280 px: Seitenleiste im Kochbuch-Assistenten bleibt sichtbar', side['d'] != 'none' and side['w'] > 150 and side['h'] > 500, str(side))
        check('Keine JS-Fehler', not errs, str(errs[:3]))
        await browser.close()
    print('\n' + ('ALLE PRÜFUNGEN BESTANDEN' if not FAIL else f'{len(FAIL)} FEHLGESCHLAGEN'))
    sys.exit(1 if FAIL else 0)
asyncio.run(main())
