"""Paket 24: Punkte aus dem Live-Test (Überlauf, Suche ohne Treffer, Formular, Seitenleiste, Nährwert-Tab)."""
import asyncio, sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)
URL = 'https://www.example.com/ein/sehr/langer/link/der/keine/leerzeichen/enthaelt/und-trotzdem-in-den-bildschirm-passen-muss'
async def main():
    async with async_playwright() as p:
        b, c = await open_ctx(p, 390, 844); page = await c.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(400)
        ev = page.evaluate
        await ev("""async (u) => { const r = emptyRecipe(); r.id = 'lg'; r.title = 'Ein aussergewöhnlich langer Rezepttitel mit vielen Wörtern damit er umbrechen muss'; r.ingredients = [{ amount: '1', unit: 'g', name: 'Salz' }]; r.steps = [{ text: u }]; r.notes = u; await dbPut(r); await loadRecipes(); }""", URL)
        for tab in ('steps', 'notes', 'ingredients'):
            sw = await ev("(t) => { state.activeRecipeId = 'lg'; state.view = 'detail'; state.detailTab = t; render(); return document.documentElement.scrollWidth - innerWidth; }", tab)
            check(f'Lange Links: kein seitliches Scrollen ({tab})', sw <= 0, str(sw))
        fs = await ev("() => parseFloat(getComputedStyle(document.querySelector('.detail-title-v2')).fontSize)")
        check('Sehr langer Titel wird kleiner gesetzt', fs <= 38, str(fs))
        empty = await ev("() => { state.view = 'home'; state.query = 'xyzxyz'; render(); return document.querySelector('.empty-state').innerText; }")
        check('Suche ohne Treffer: eigene Meldung mit "Suche löschen"', 'Keine Treffer für' in empty and 'Suche löschen' in empty, empty[:60])
        await page.click('[data-action="clear-search"]'); await page.wait_for_timeout(200)
        check('"Suche löschen" leert die Suche', await ev("state.query === '' && !document.querySelector('.empty-state')"))
        f = await ev("() => { state.editingRecipe = JSON.parse(JSON.stringify(state.recipes.find(r => r.id === 'r_legacy_1'))); state.view = 'form'; state.formStep = 0; render(); return document.querySelector('.form-actions--sticky').innerText; }")
        check('Formular Schritt 1: kein "Löschen" neben "Weiter"', 'Löschen' not in f, f.replace('\n', ' '))
        f5 = await ev("() => { state.formStep = 4; render(); return document.querySelector('[data-form-step=\"4\"]').innerText; }")
        check('Kontrolle-Schritt enthält "Rezept löschen" abseits der Hauptknöpfe', 'Rezept löschen' in f5)
        more = await ev("() => { state.view = 'settings'; render(); return document.querySelector('.page-title') && document.querySelector('.page-title').innerText; }")
        check('Seite "Einstellungen" hat einen sichtbaren Titel', more == 'Einstellungen', str(more))
        chip = await ev("""() => { state.activeRecipeId = 'r_legacy_1'; state.view = 'cookmode'; state.cookStepIndex = 1; render(); const c = document.querySelector('.timer-chip'); const s = getComputedStyle(c, '::before'); return parseFloat(s.top) * -1 + parseFloat(s.bottom) * -1 + c.getBoundingClientRect().height; }""")
        check('Timer-Knopf hat eine Tippfläche von mindestens 44 px', chip >= 44, str(chip))
        nut = await ev("() => { state.view = 'detail'; state.activeRecipeId = 'r_legacy_2'; state.detailTab = 'nutrition'; render(); return document.querySelector('#panel-nutrition').innerHTML; }")
        check('Nährwerte-Reiter ohne doppelte Überschrift', 'section-heading' not in nut)
        sh = await ev("() => { state.view = 'shopping'; render(); return Array.from(document.querySelectorAll('.shop-quick .outline-btn')).map(b => Math.round(b.getBoundingClientRect().height)); }")
        check('Einkauf: beide Schnellknöpfe gleich hoch', len(sh) == 2 and sh[0] == sh[1], str(sh))
        await page.set_viewport_size({'width': 1280, 'height': 800}); await page.wait_for_timeout(200)
        brand = await ev("() => { state.view = 'home'; render(); const b = document.querySelector('.nav-brand'); return b && getComputedStyle(b).display; }")
        check('Desktop: Seitenleiste zeigt das Logo', brand == 'flex', str(brand))
        await page.set_viewport_size({'width': 390, 'height': 844}); await page.wait_for_timeout(200)
        check('Telefon: Logo nur in der Kopfzeile, nicht in der unteren Leiste', await ev("() => getComputedStyle(document.querySelector('.nav-brand')).display") == 'none')
        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await b.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
