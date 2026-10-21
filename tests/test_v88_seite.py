"""v88 Rezeptseite neu: Spaltenlayout (Zutaten links schmal, Zubereitung rechts breit, Foto oben) und feste Seitenregeln.
Grundlage: die 7 Hirnkost-Rezepte (tests/pdf_hirnkost_fixture.py), echtes Kochbuch-PDF in beiden Stilen plus Einzelrezept Manti.
Prueft:
  - Planer pdfColsDistribute (Unit, ohne Messung): Seite 1 so voll wie moeglich, aber keine Seite unter 3 Schritten,
    Zusatzbloecke (Notizen, Naehrwerte) nur zusammen mit dem letzten Schritt, letzte Seite mindestens ein Drittel gefuellt
  - echtes PDF: Spaltenlayout vorhanden (data-layout="cols", linke Zutatenspalte schmaler als die rechte Spalte),
    jede Seite eines mehrseitigen Rezepts mit mindestens 3 Schritten, kein Notizkasten allein, jede Seite mindestens ca. ein
    Drittel gefuellt, Seitenzahl Hirnkost (Prise Pop hoechstens 11, Pur hoechstens 12, Manti hoechstens 2 Seiten)
  - doppelte Beschriftung «Notizen» / «Hinweise» faellt weg
SAVORA_PDF_TEXT_SHIFT_MM=0.3 (Linux-Simulation): zusaetzlich Randbefunde aus pdf_harness.pruefe_raender."""
import asyncio, os, sys
os.environ.setdefault('SAVORA_TEST_PORT', '23960')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *   # noqa: F401,E402
from pdf_harness import PdfSession, pruefe_raender   # noqa: E402
from pdf_hirnkost_fixture import hirnkost_session_setup   # noqa: E402

FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info if not cond else '')
    if not cond: FAIL.append(name)

# Unit: Verteilung mit vorgetaeuschter Messung (cap = Schritte, die je Seite passen; Zusatz kostet extra Schritte)
UNIT_JS = """(cases) => {
  const of = window.pdfColsFits, ofill = window.pdfPageFill;
  const out = [];
  try {
    for (const c of cases) {
      window.pdfColsFits = (h) => { const [p, a, b, ex] = JSON.parse(h); return (b - a) + (ex ? c.ex : 0) <= (p === 0 ? c.cap0 : c.cap); };
      window.pdfPageFill = (h) => { const [p, a, b, ex] = JSON.parse(h); return ((b - a) + (ex ? c.ex : 0)) / c.cap; };
      const page = (p, a, b, ex) => JSON.stringify([p, a, b, !!ex]);
      out.push(pdfColsDistribute(c.n, page, 3));
    }
  } finally { window.pdfColsFits = of; window.pdfPageFill = ofill; }
  return out;
}"""



def recipe_pages(ex):
    """Rezeptseiten aus der DOM-Erfassung: [(recipeId, sektion)]"""
    return [(d['recipeId'], d) for d in ex.dom if d.get('kind') in ('recipe', 'continuation')]


def steps_on(d):
    return [b for b in d['blocks'] if b['cls'] == 'pv-step-no']


def has_notes(d):
    return any(b['cls'].startswith('pv-label') and b['text'] in ('Notizen', 'Hinweise', 'Hinweis') for b in d['blocks'])


def fill(d):
    bot = max([b['b'] for b in d['blocks'] if not b['foot']] + [0])
    return (bot - 14) / (297 - 14 - 21)


async def main():
    out = os.path.join(OUT, 'v88_seite'); os.makedirs(out, exist_ok=True)
    async with PdfSession(out) as s:
        await hirnkost_session_setup(s)
        # --- Unit ---
        cases = [dict(n=7, cap0=5, cap=6, ex=1), dict(n=6, cap0=5, cap=6, ex=1), dict(n=11, cap0=5, cap=5, ex=0), dict(n=7, cap0=4, cap=7, ex=4), dict(n=3, cap0=9, cap=9, ex=1)]
        res = await s.page.evaluate(UNIT_JS, cases)
        check('unit 7 Schritte, 5 passen auf S.1: 4 + 3 (S.2 nie unter 3)', res[0] == [[0, 4], [4, 7]], res[0])
        check('unit 6 Schritte: 3 + 3', res[1] == [[0, 3], [3, 6]], res[1])
        check('unit 11 Schritte, 5 je Seite: jede Seite mind. 3', res[2] and all(b - a >= 3 for a, b in res[2]) and res[2][-1][1] == 11, res[2])
        check('unit grosser Zusatzblock bleibt beim letzten Schritt (nie allein)', res[3] and res[3][-1][1] - res[3][-1][0] >= 3, res[3])
        check('unit kurzes Rezept: eine Seite', res[4] == [[0, 3]], res[4])
        # --- echtes PDF ---
        shift = float(os.environ.get('SAVORA_PDF_TEXT_SHIFT_MM', '0') or 0)
        for stil, maxp in (('prise-pop', 11), ('pur', 12)):
            ex = await s.book('hirnkost', stil, 'compact', datei=f'hirnkost_{stil}')
            n = ex.seiten()
            plan = await s.page.evaluate("() => window.pdfLastPlan.recipes.map(r => [r.id, r.pages, r.plan])")
            print(stil, n, 'Seiten', plan)
            check(f'{stil}: Hirnkost hoechstens {maxp} Seiten', 0 < n <= maxp, n)
            pages = dict((r[0], r[1]) for r in plan)
            check(f'{stil}: Manti hoechstens 2 Seiten', pages.get('hk_manti', 9) <= 2, pages.get('hk_manti'))
            check(f'{stil}: mindestens 4 von 7 Rezepten einseitig', sum(1 for v in pages.values() if v == 1) >= 4, pages)
            rp = recipe_pages(ex)
            firsts = [d for _, d in rp if d['kind'] == 'recipe']
            check(f'{stil}: Spaltenlayout auf den Rezeptseiten', sum(1 for d in firsts if 'pv-cols' in d['cls']) >= 6, [d['cls'] for d in firsts])
            geo = await s.page.evaluate("""() => { const h = pvRecipePage(pdfBuildModel(state.recipes.find(r => r.id === 'hk_bulgogi'), null), null, null, { layout: 'cols', density: 'normal' }, 'off');
              return pdfWithProbe(h, (el) => { const a = el.querySelector('.pv-col-ing'), b = el.querySelector('.pv-col-main'); return a && b ? [a.getBoundingClientRect().width / MM_PX, b.getBoundingClientRect().width / MM_PX, a.getBoundingClientRect().left < b.getBoundingClientRect().left] : null; }); }""")
            check(f'{stil}: Zutaten links schmal (34-42 % der Satzbreite), Zubereitung rechts breit', geo and geo[2] and 0.34 <= geo[0] / 184 <= 0.42 and geo[1] > geo[0] * 1.4, geo)
            by = {}
            for rid, d in rp: by.setdefault(rid, []).append(d)
            for rid, ds in by.items():
                if len(ds) < 2: continue
                total = sum(len(steps_on(d)) for d in ds)
                for k, d in enumerate(ds):
                    st = len(steps_on(d))
                    check(f'{stil} {rid} S.{k + 1}: mindestens 3 Schritte', st >= min(3, total), st)
                    check(f'{stil} {rid} S.{k + 1}: kein Notizkasten ohne Schritt', st > 0 or not has_notes(d))
                    check(f'{stil} {rid} S.{k + 1}: mindestens ca. ein Drittel gefuellt', fill(d) >= 0.3, round(fill(d), 2))
            bul = [d for rid, d in rp if rid == 'hk_bulgogi']
            labels = [b['text'] for d in bul for b in d['blocks'] if b['cls'].startswith('pv-note-head') or b['cls'].startswith('pv-label')]
            check(f'{stil}: Bulgogi ohne doppelte Beschriftung Notizen/Hinweise', not ('Notizen' in labels and 'Hinweise' in labels), labels)
            if shift > 0:
                rb = [f for f in pruefe_raender(ex) if f['id'] in ('rand_streifen', 'fuss_ausserhalb', 'seite_zu_hoch', 'text_beschnitten')]
                check(f'{stil}: Linux-Simulation {shift} mm ohne Randbefunde', not rb, rb[:4])
        e = await s.single('hk_manti', 'prise-pop', 'compact', name='einzel_manti_pop')
        check('Einzelrezept Manti (Prise Pop): hoechstens 2 Seiten', 0 < e.seiten() <= 2, e.seiten())
        mp = [d for _, d in recipe_pages(e)]
        check('Einzelrezept Manti: Spaltenlayout auf Seite 1', mp and 'pv-cols' in mp[0]['cls'])
        if len(mp) == 2: check('Einzelrezept Manti: jede Seite mindestens 3 Schritte', all(len(steps_on(d)) >= 3 for d in mp), [len(steps_on(d)) for d in mp])
        check('keine Seitenfehler im Browser', not s.fehler, s.fehler[:3])
    print('FEHLGESCHLAGEN' if FAIL else 'ALLE OK', len(FAIL))
    sys.exit(1 if FAIL else 0)

asyncio.run(main())
