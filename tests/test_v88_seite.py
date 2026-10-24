"""Hirnkost-Kochbuch-PDF (zusammengelegt aus v87_layout, v88_seite und v88_mess: eine Sitzung, gleiche 7 Rezepte aus tests/pdf_hirnkost_fixture.py).

v88 Rezeptseite: Spaltenlayout (Zutaten links schmal, Zubereitung rechts breit, Foto oben) und feste Seitenregeln.
  - Planer pdfColsDistribute (Unit, ohne Messung): Seite 1 so voll wie moeglich, aber keine Seite unter 3 Schritten,
    Zusatzbloecke (Notizen, Naehrwerte) nur zusammen mit dem letzten Schritt, letzte Seite mindestens ein Drittel gefuellt
  - echtes PDF in beiden Stilen: Spaltenlayout (data-layout="cols"), jede Seite eines mehrseitigen Rezepts mit mindestens 3 Schritten,
    kein Notizkasten allein, jede Seite mindestens ca. ein Drittel gefuellt, Seitenzahl Hirnkost (Prise Pop hoechstens 11, Pur hoechstens 12, Manti hoechstens 2)
  - doppelte Beschriftung «Notizen» / «Hinweise» faellt weg
v87 Layout (Prise Pop, mit Cover «pop»): hoechstens 13 Seiten (vorher 18), jede Druckseite = eine PDF-Seite, keine Notverkleinerung,
  Inhaltsverzeichnis = echte Startseiten, eine Schriftgroesse fuer alle Schritttexte (Seite und html2canvas-Klon), Textvergroesserung aus,
  kurze Rezepte einseitig, keine geteilten Schritte, Seite 1 gefuellt, Fusszeile auf jeder Rezeptseite, Notfall (Schrift im Druckbereich 15 pt: nachplanen statt schneiden)
v88 MESS: nachgebildetes Safari-Autosizing (Text im Druckbereich wird vergroessert, solange dort kein text-size-adjust gesetzt ist):
  gleiche Seiten je Rezept wie normal (alter Code: 16 statt 11 Seiten), pdfOverflowByRecipe schaltet die Textvergroesserung selbst ab,
  Messflaeche und Druckbereich messen jede Rezeptseite gleich hoch (hoechstens 0,3 mm)
SAVORA_PDF_TEXT_SHIFT_MM=0.3 wirkt (Linux-Simulation); dann zusaetzlich Randbefunde aus pdf_harness.pruefe_raender.
Reihenfolge ist wichtig: der Notfall-Teil setzt eine CSS-Regel und laeuft deshalb zuletzt."""
import asyncio, os, re, subprocess, sys
os.environ.setdefault('SAVORA_TEST_PORT', '23960')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *   # noqa: F401,E402
from pdf_harness import PdfSession, pruefe_raender, pdftext   # noqa: E402
from pdf_hirnkost_fixture import hirnkost_session_setup, HIRNKOST_RECIPES, HIRNKOST_IDS   # noqa: E402

FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info if not cond else '')
    if not cond: FAIL.append(name)

# Misst beim Rastern jede Seite im Klon (Schriftgroesse der Schritttexte, text-size-adjust) und die Messflaeche
SPY_JS = """() => {
  window.__v87 = { secs: [], probe: [] };
  if (window.__v87inst) return true;
  window.__v87inst = true;
  const op = window.pdfWithProbe;
  if (!op.__v87) { window.pdfWithProbe = function (html, fn) { return op(html, (el, p) => { if (window.__v87.probe.length < 50) window.__v87.probe.push(p.style.getPropertyValue('-webkit-text-size-adjust') || p.style.getPropertyValue('text-size-adjust')); return fn(el, p); }); }; window.pdfWithProbe.__v87 = true; }
  const oh = window.html2canvas;
  if (!oh.__v87) {
    const w = function (el, o) {
      const rec = { kind: el.dataset.pageKind || '', id: el.dataset.recipeId || '', root: (document.getElementById('printRoot').style.getPropertyValue('-webkit-text-size-adjust')) };
      window.__v87.secs.push(rec);
      const own = o && o.onclone;
      return oh.call(this, el, Object.assign({}, o, { onclone: function (doc, cl) { if (own) own.apply(this, arguments);
        const win = doc.defaultView;
        rec.fs = Array.from(cl.querySelectorAll('.pv-step-text')).map((t) => win.getComputedStyle(t).fontSize);
        rec.tsa = doc.documentElement.style.getPropertyValue('-webkit-text-size-adjust');
        rec.hMm = cl.getBoundingClientRect().height / (96 / 25.4); } }));
    };
    w.__v87 = true; Object.keys(oh).forEach((k) => { w[k] = oh[k]; }); window.html2canvas = w;
  }
  return true;
}"""

def sh(cmd): return subprocess.run(cmd, capture_output=True, text=True).stdout

async def export(s, name, extra_css=None):
    if extra_css: await s.page.add_style_tag(content=extra_css)
    await s.page.evaluate("async () => { await ensurePdfLibs(); }")
    await s.page.evaluate(SPY_JS)
    ex = await s.book('hirnkost', 'prise-pop', 'compact', datei=name, cover='pop')
    info = await s.page.evaluate("() => ({ v: window.__v87, plan: window.pdfLastPlan })")
    return ex, info

def toc_vs_pdf(ex, info, prefix):
    n = ex.seiten()
    toc = pdftext(ex.pdf, True, 2, 2)
    starts = {}
    for r in HIRNKOST_RECIPES:
        m = re.search(re.escape(r['title']) + r'\s+(\d+)', toc)
        starts[r['title']] = int(m.group(1)) if m else None
    real = {}
    for i, d in enumerate(ex.dom):
        if d['kind'] == 'recipe':
            r = next(x for x in HIRNKOST_RECIPES if x['id'] == d['recipeId'])
            if r['title'] in pdftext(ex.pdf, True, i + 1, i + 1): real[r['title']] = i + 1
    plan = {r['title']: r['startPage'] for r in info['plan']['recipes']}
    check(f'{prefix}: Inhaltsverzeichnis nennt die echten Startseiten (PDF-Text)', starts == real and all(starts.values()), f'TOC {starts} PDF {real}')
    check(f'{prefix}: Inhaltsverzeichnis = Startseiten beim Rendern', starts == plan, f'TOC {starts} Render {plan}')

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


# Safari-Autosizing nachbilden: nur wirksam, solange der Druckbereich kein text-size-adjust traegt
AUTOSIZE_CSS = ('#printRoot:not([style*="text-size-adjust"]) .pv-step-text, #printRoot:not([style*="text-size-adjust"]) .pv-extra-body, '
                '#printRoot:not([style*="text-size-adjust"]) .pv-extra { font-size: 24px !important; line-height: 34px !important; }')
RESET_JS = "() => { const r = document.getElementById('printRoot'); r.style.removeProperty('-webkit-text-size-adjust'); r.style.removeProperty('text-size-adjust'); }"

def per_recipe(plan): return {r['id']: r['pages'] for r in plan['recipes']}

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
        ex, info = await export(s, 'hirnkost_v87')
        n = ex.seiten(); dom = ex.dom
        print('Seiten', n, [(d['kind'], d['recipeId']) for d in dom])
        check('Hirnkost: hoechstens 13 Seiten (Original 18)', 10 <= n <= 13, str(n))
        check('Hirnkost: jede Druckseite ist genau eine PDF-Seite', n == len(dom), f'{n} / {len(dom)}')
        imgs = sh(['pdfimages', '-list', ex.pdf])
        dims = re.findall(r'^\s*\d+\s+\d+\s+image\s+(\d+)\s+(\d+)', imgs, re.M)
        check('Hirnkost: alle Seitenbilder exakt A4 (kein Streifen, keine Uebergrosse)', len(dims) >= n and all(abs(int(h) / int(w) - 297 / 210) < 0.002 for w, h in dims[:n]), str(dims[:n]))
        blob = await s.page.evaluate("() => window.pdfLastPlan && window.pdfLastPlan.totalPages")
        check('Hirnkost: Gesamtseiten im Plan = PDF', blob == n, f'{blob} / {n}')
        scaled = [d for d in info['v']['secs'] if d.get('hMm', 0) > 297.4]
        check('Hirnkost: keine Seite hoeher als A4 im Raster (keine Notverkleinerung)', not scaled, str([(d['kind'], d['id'], round(d['hMm'], 1)) for d in scaled]))
        toc_vs_pdf(ex, info, 'Hirnkost')
        # einheitliche Schrift
        fs_dom = sorted({b['fsPt'] for d in dom if d['kind'] in ('recipe', 'continuation') for b in d['blocks'] if 'pv-step-text' in b['cls']})
        fs_clone = sorted({f for d in info['v']['secs'] if d['kind'] in ('recipe', 'continuation') for f in (d.get('fs') or [])})
        print('Schritttext pt (Seite):', fs_dom, 'px (Klon):', fs_clone)
        check('Schritttexte: eine Schriftgroesse auf allen Rezeptseiten (Seite)', len(fs_dom) == 1 and fs_dom[0] >= 11, str(fs_dom))
        check('Schritttexte: eine Schriftgroesse auf allen Rezeptseiten (html2canvas-Klon)', len(fs_clone) == 1 and abs(float(fs_clone[0][:-2]) * 0.75 - fs_dom[0]) < 0.05, str(fs_clone))
        check('Textvergroesserung aus: Messflaeche', info['v']['probe'] and all(x == '100%' for x in info['v']['probe']), str(info['v']['probe'][:3]))
        check('Textvergroesserung aus: Druckbereich und Klon', all(d.get('root') == '100%' and d.get('tsa') == '100%' for d in info['v']['secs']), str([(d.get('root'), d.get('tsa')) for d in info['v']['secs']][:3]))
        # Aufteilung
        pages = {r['title']: r['pages'] for r in info['plan']['recipes']}
        print('Seiten je Rezept', pages)
        check('Kurze Rezepte einseitig (Sloppy Joe, Carbonara, Cookies, Bulgogi)', all(pages[t] == 1 for t in ('Sloppy Joe Buns', 'Carbonara', 'Cookies', 'Bulgogi')), str(pages))
        check('Keine geteilten Schritte (kein «Fortsetzung ·» im Schritttext)', not any('pv-cont' in b['cls'] for d in dom for b in d['blocks']), '')
        first = {d['recipeId']: d for d in dom if d['kind'] == 'recipe'}
        for rid, d in first.items():
            if pages.get(next(r['title'] for r in HIRNKOST_RECIPES if r['id'] == rid), 1) > 1:
                steps = [b for b in d['blocks'] if 'pv-step-text' in b['cls']]
                lowest = max((b['b'] for b in steps), default=0)
                # v88: Seitenregel «mindestens 3 Schritte je Seite» geht vor dem Fuellen (Manti 4 + 3, Karamell 3 + 3): Seite 1 mindestens zur Haelfte
                check(f'{rid}: erste Seite gefuellt (Schritte reichen bis mindestens 150 mm)', lowest >= 150, f'{lowest} mm')
        # Fusszeile auf jeder Rezeptseite
        bad = []
        for p in range(3, n + 1):
            t = pdftext(ex.pdf, True, p, p)
            if 'HIRNKOST' not in t or f'Seite {p}' not in t: bad.append(p)
        check('Fusszeile (Buchname und «Seite X») auf jeder Rezeptseite', not bad, str(bad))
        if float(os.environ.get('SAVORA_PDF_TEXT_SHIFT_MM', '0') or 0) > 0:
            rb = [f for f in pruefe_raender(ex) if f['id'] in ('rand_streifen', 'fuss_ausserhalb', 'seite_zu_hoch', 'text_beschnitten')]
            check('Linux-Simulation: keine Streifen, Fusszeile in der Seite, nichts beschnitten', not rb, str(rb[:3]))
        subprocess.run(['pdftoppm', '-r', '50', '-jpeg', ex.pdf, os.path.join(out, 'hirnkost_v87')])
        n_normal = n
        await s.page.evaluate("async () => { await ensurePdfLibs(); }")
        # 1) normaler Export = der Export aus dem v87-Teil (Hirnkost, Prise Pop, Naehrwerte kompakt, Cover «pop»)
        await s.page.evaluate(RESET_JS)
        n1 = n_normal; p1 = per_recipe(info['plan'])
        print('normal:', n1, 'Seiten', p1)

        # 2) Druckbereich mit nachgebildetem Safari-Autosizing
        autosize_tag = await s.page.add_style_tag(content=AUTOSIZE_CSS)
        await s.page.evaluate(RESET_JS)
        probe = await s.page.evaluate("""() => { const r = document.getElementById('printRoot');
          r.innerHTML = '<section class="pv-page" data-page-kind="recipe" data-recipe-id="x"><span class="pv-step-text">Text</span></section>';
          const before = getComputedStyle(r.querySelector('.pv-step-text')).fontSize;
          pdfOverflowByRecipe(r);
          r.innerHTML = r.innerHTML;   // Chromium wertet [style*=...] nach einer CSSOM-Aenderung erst fuer neue Knoten neu aus (Nachbildung, nicht App)
          const after = getComputedStyle(r.querySelector('.pv-step-text')).fontSize;
          const tsa = r.style.getPropertyValue('-webkit-text-size-adjust') || r.style.getPropertyValue('text-size-adjust');
          r.innerHTML = ''; r.style.removeProperty('-webkit-text-size-adjust'); r.style.removeProperty('text-size-adjust');
          return { before, after, tsa }; }""")
        print('Nachbildung:', probe)
        check('Nachbildung wirkt (Druckbereich ohne text-size-adjust: 24 px)', probe['before'] == '24px', str(probe))
        check('pdfOverflowByRecipe schaltet die Textvergroesserung im Druckbereich ab, bevor gemessen wird', probe['tsa'] == '100%' and probe['after'] != '24px', str(probe))
        ex2 = await s.book('hirnkost', 'prise-pop', 'compact', datei='hirnkost_autosize', cover='pop')
        plan2 = await s.page.evaluate("() => window.pdfLastPlan")
        n2 = ex2.seiten(); p2 = per_recipe(plan2)
        print('Safari-Nachbildung:', n2, 'Seiten', p2)
        check('Safari-Nachbildung: gleiche Gesamtseitenzahl wie normal (alter Code: 16 statt 11)', n2 == n1, f'{n2} / {n1}')
        check('Safari-Nachbildung: jedes Rezept gleich viele Seiten wie normal', p2 == p1, f'{p2} / {p1}')

        # 3) gleicher Kontext: Messflaeche = Druckbereich (mit abgeschalteter Textvergroesserung)
        diff = await s.page.evaluate("""async (ids) => {
          pdfSetContext('prise-pop', 'HIRNKOST', '', true, true); await ensureFontsReadyForPdf();
          const root = document.getElementById('printRoot'); const out = [];
          for (const id of ids) {
            const r = state.recipes.find((x) => x.id === id);
            const res = await buildRecipePdfPage(r, null, 'compact', '');
            for (const h of res.htmlPages) {
              const html = pdfStripImg(h);
              const a = measureSectionHeightMm(html);
              root.innerHTML = html; pdfNoAutosize(root); const sec = root.firstElementChild; sec.style.minHeight = '0'; pdfClampFrameText(sec);
              const b = sec.getBoundingClientRect().height / MM_PX; root.innerHTML = '';
              out.push([id, Math.round(a * 100) / 100, Math.round(b * 100) / 100]);
            }
          }
          cleanupPdfMeasureProbe();
          return out; }""", HIRNKOST_IDS)
        bad = [d for d in diff if abs(d[1] - d[2]) > 0.3]
        print('Messflaeche / Druckbereich (mm):', diff)
        check('Messflaeche und Druckbereich messen jede Rezeptseite gleich hoch (<= 0,3 mm)', diff and not bad, str(bad))
        await autosize_tag.evaluate('e => e.remove()'); await s.page.evaluate(RESET_JS)
        # ---------- Notfall: Druckbereich setzt Schritte und Notizen 1,5-fach (wie Safari-Autosizing), die Messflaeche nicht ----------
        exn, infon = await export(s, 'hirnkost_v87_gross', '#printRoot .pv-step-text, #printRoot .pv-extra-body { font-size: 15pt !important; }')
        nfn = exn.seiten()
        overn = [d for d in infon['v']['secs'] if d.get('hMm', 0) > 297.4]
        check('Notfall: keine Seite ueber A4, nichts geschnitten oder verkleinert', not overn and nfn == len(exn.dom), str([(d['kind'], d['id'], round(d['hMm'], 1)) for d in overn]) + f' {nfn}/{len(exn.dom)}')
        print('Notfall: Seiten', nfn, 'statt', n)
        check('Notfall: das zu hohe Rezept wurde nachgeplant (mehr Seiten statt Schnitt)', nfn > n, f'{nfn} / {n}')
        toc_vs_pdf(exn, infon, 'Notfall')
        check('Keine JS-Fehler / keine Seitenfehler im Browser', not s.fehler, str(s.fehler[:3]))
    print('\n' + ('ALLE OK' if not FAIL else f'{len(FAIL)} FEHLER: ' + '; '.join(FAIL)))
    print('Ausgabe:', out)
    sys.exit(1 if FAIL else 0)

asyncio.run(main())
