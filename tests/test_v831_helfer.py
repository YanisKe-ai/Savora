"""v0.83.1: Bibliothek, Freunde-Vorschau und Importvorschau nutzen die gemeinsamen Ertrags- und Zeithelfer."""
import asyncio, os, sys, re
os.environ.setdefault('SAVORA_TEST_PORT', '64100')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

async def main():
    async with async_playwright() as p:
        b, ctx = await open_ctx(p, 390, 844)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(300)
        ev = page.evaluate
        cases = {'glas': dict(servings=1, servingMode='total', yieldLabel='Glas'), 'stueck': dict(servings=12, servingMode='pieces'),
                 'unbekannt': dict(servings=0), 'portionen': dict(servings=4)}
        for key, c in cases.items():
            rec = dict(c, title='T ' + key, timeMinutes=90, prepMinutes=20, cookMinutes=30, restMinutes=60, ingredients=[{'amount': '1', 'unit': 'g', 'name': 'Mehl'}],
                       steps=[{'text': 'Mischen.'}], diet=[], categories=[])
            exp = {'glas': 'Ergibt 1 Glas', 'stueck': 'Ergibt 12 Stück', 'unbekannt': 'Ergibt: unbekannt', 'portionen': 'Für 4 Portionen'}[key]
            # Bibliothek
            lib = await ev("(rec) => libPublicRecipeHtml({ recipe: rec, author: {} , title: rec.title }, {})", rec) if False else await ev(
                "(rec) => libPublicRecipeHtml(Object.assign({ author: {} }, { recipe: rec }, rec), { linkAuthor: false })", rec)
            txt = re.sub(r'<[^>]+>', '|', lib)
            check(f'Bibliothek {key}: Ertrag «{exp}»', exp in txt and 'offen' not in txt, txt[:200])
            check(f'Bibliothek {key}: Zeiten', '1 Std. 30 Min.' in txt and 'Vorbereitung 20 Min.' in txt and 'Garen oder Backen 30 Min.' in txt and 'Ruhen oder Abkühlen 1 Std.' in txt, txt[:300])
            # Freunde-Vorschau
            html = await ev("""(rec) => { share.inbox = [{ id: 's1', from_name: 'Anna', from_handle: 'anna', message: '', recipe: Object.assign({ id: 'x1' }, rec) }];
              share.previewId = 's1'; return settingsSharePreviewView(); }""", rec)
            t2 = re.sub(r'<[^>]+>', '|', html)
            check(f'Freunde {key}: Ertrag «{exp}», Zeit 1 Std. 30 Min.', exp in t2 and '1 Std. 30 Min.' in t2 and 'offen' not in t2, t2[:300])
            # Import
            imp = await ev("""(rec) => importSummaryBanner({ titleFound: true, ingredientCount: 1, stepCount: 1, servingsFound: rec.servings > 0, timeFound: true, issues: [], noAmount: [] }, rec)""", rec)
            t3 = re.sub(r'<[^>]+>', '|', imp)
            check(f'Import {key}: Zeitbegriffe', 'Gesamtzeit 1 Std. 30 Min.' in t3 and 'Vorbereitung 20 Min.' in t3 and 'Garen oder Backen 30 Min.' in t3 and 'Ruhen oder Abkühlen 1 Std.' in t3, t3[:400])
            if rec['servings'] > 0: check(f'Import {key}: Ertrag', exp in t3, t3[:300])
        card = await ev("() => libCardHtml({ id: 'c1', title: 'K', total_minutes: 95, author: {} })")
        check('Karte: 1 Std. 35 Min.', '1 Std. 35 Min.' in card, card[-200:])
        # Kochmodus: Titel als Ueberschrift, Daten unveraendert
        r = await ev("""() => { const rec = { id: 'ck', title: 'C', steps: [{ text: 'Sauce: Zucker in der Pfanne hellbraun karamellisieren.' }, { text: 'Rahm zugeben.' }], ingredients: [] };
          const s = cookSteps(rec); return { sec: s[0]._section, txt: s[0].text, orig: rec.steps[0].text, n: s.length }; }""")
        check('Kochmodus: Schrittueberschrift, Original unveraendert', r['sec'] == 'Sauce' and r['txt'].startswith('Zucker') and r['orig'].startswith('Sauce:'), str(r))
        check('Keine JS-Fehler', not errs, str(errs))
        await b.close()
asyncio.run(main())
print('\nFEHLGESCHLAGEN:', ', '.join(FAIL) if FAIL else 'keine'); sys.exit(1 if FAIL else 0)
