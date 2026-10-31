"""0.92.1: Zeiterkennung im Textimport. Tätigkeiten als Bezeichnung («Backen: 35 Minuten», «Ruhen lassen 2 Std.»,
«35 Min. backen»), «Zubereitung: 25 Minuten» als Zeit statt Schritt, Kombizeilen mit «·», englische Angaben.
Schritte wie «Backen Sie den Kuchen 35 Minuten» bleiben Schritte, Gesamtzeit wird nie zusammengerechnet."""
import asyncio, sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

def rez(meta, steps='1. Alles mischen.\n2. Servieren.'):
    return f"Testkuchen\n{meta}\n\nZutaten\n200 g Mehl\n2 Eier\n\nZubereitung\n{steps}"

# (Name, Text, erwartet: total, prep, cook, rest, Schritte)
FAELLE = [
    ('Backen: 35 Minuten', rez('Backen: 35 Minuten'), dict(total=0, cook=35, nsteps=2)),
    ('Kombizeile mit ·', rez('Ergibt 1 Blech (12 Stück) · Backen: 35 Minuten'), dict(cook=35, nsteps=2, servings=1)),   # «1 Blech» wie bisher
    ('Für 4 Personen · Zubereitung: 25 Minuten', rez('Für 4 Personen · Zubereitung: 25 Minuten'), dict(total=25, nsteps=2, servings=4)),
    ('Zubereitung: 25 Minuten allein', rez('Zubereitung: 25 Minuten'), dict(total=25, nsteps=2)),
    ('Ruhen lassen: 2 Std.', rez('Ruhen lassen: 2 Std.'), dict(rest=120, nsteps=2)),
    ('35 Min. backen', rez('35 Min. backen'), dict(cook=35, nsteps=2)),
    ('2 Stunden kühl stellen', rez('2 Stunden kühl stellen'), dict(rest=120, nsteps=2)),
    ('Mehrere Zeilen', rez('Vorbereiten: 20 Min.\nBacken: 40 Min.\nAbkühlen lassen: 1 Std.'), dict(total=0, prep=20, cook=40, rest=60, nsteps=2)),
    ('Gesamtzeit plus Teile', rez('Gesamtzeit: 1 Std. 30 Min.\nBackzeit: 45 Min.'), dict(total=90, cook=45, nsteps=2)),
    ('Backdauer: ca. 50 Minuten', rez('Backdauer: ca. 50 Minuten'), dict(cook=50, nsteps=2)),
    ('Englisch Bake: 25 minutes', rez('Bake: 25 minutes'), dict(cook=25, nsteps=2)),
    ('Englisch Chill 1 hour', rez('Chill: 1 hour'), dict(rest=60, nsteps=2)),
    ('Spanne bleibt Hinweis', rez('Backen: 30-40 Minuten'), dict(cook=0, nsteps=2, rangeIssue=True)),
    # Schritte bleiben Schritte
    ('Schritt mit Backen bleibt Schritt', rez('Für 4 Personen', '1. Teig rühren.\n2. Backen Sie den Kuchen 35 Minuten bei 180 °C.'), dict(cook=0, nsteps=2, step2='Backen Sie den Kuchen 35 Minuten bei 180 °C.')),
    ('Unnummerierter Schritt mit Kochen bleibt', rez('Für 4 Personen', 'Kochen, bis alles weich ist, etwa 20 Minuten.'), dict(cook=0, nsteps=1)),
    ('Zubereitung mit Text bleibt Schritt', "Testkuchen\n\nZutaten\n200 g Mehl\n\nZubereitung: Alles 20 Minuten backen.", dict(total=0, nsteps=1)),
    ('Bestehend: Arbeitszeit ca. 20 Min.', rez('Arbeitszeit: ca. 20 Min.'), dict(total=20, nsteps=2)),
]

JS = """(t) => { const r = parseFreeTextRecipe(t); return { total: r.timeMinutes || 0, prep: r.prepMinutes || 0, cook: r.cookMinutes || 0, rest: r.restMinutes || 0,
  servings: r.servings, steps: (r.steps || []).map(s => s.text).filter(Boolean), issues: ((r._importSummary && r._importSummary.issues) || []).map(x => x.id) }; }"""

async def main():
    async with async_playwright() as p:
        b, ctx = await open_ctx(p)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page)
        for name, text, exp in FAELLE:
            r = await page.evaluate(JS, text)
            ok = True
            for k in ('total', 'prep', 'cook', 'rest', 'servings'):
                if k in exp and r[k] != exp[k]: ok = False
            if 'nsteps' in exp and len(r['steps']) != exp['nsteps']: ok = False
            if 'step2' in exp and (len(r['steps']) < 2 or r['steps'][1] != exp['step2']): ok = False
            if exp.get('rangeIssue') and 'time-range' not in r['issues']: ok = False
            check(name, ok, str(r))
        # PDF-Fixture end-to-end: «Backen: 35 Minuten» aus der zweispaltigen PDF
        import base64
        data = base64.b64encode(open(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), 'fixtures/pdf/zweispaltig.pdf'), 'rb').read()).decode()
        r = await page.evaluate("""async (b64) => { const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
          const res = await pdfImportRead(new File([bin], 'x.pdf', { type: 'application/pdf' }));
          const rr = parseFreeTextRecipe(pdfJoinPages(res.pages, [1])); return { cook: rr.cookMinutes || 0, servings: rr.servings, steps: rr.steps.length }; }""", data)
        check('PDF zweispaltig: Backzeit 35 erkannt, ergibt 1 Blech', r['cook'] == 35 and r['servings'] == 1 and r['steps'] == 4, str(r))
        check('keine Seitenfehler', not errs, str(errs[:2]))
        await b.close()
    print('\nFAIL:', FAIL or 'keine')
    sys.exit(1 if FAIL else 0)
asyncio.run(main())
