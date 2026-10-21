"""v87 Layout (Kochbuch-PDF «Hirnkost», Stil Prise Pop): Seitenaufteilung, Schriftgroesse, Inhaltsverzeichnis.
Grundlage: die 7 Rezepte aus dem PDF des Nutzers (tests/pdf_hirnkost_fixture.py). Dort entstanden 18 Seiten mit abgeschnittenen
Streifen (S. 13, 16), 1,5-fach grosser Schrift (S. 12, 15, 18) und falschem Inhaltsverzeichnis.
Prueft am echten Kochbuch-PDF:
  - hoechstens 13 Seiten (vorher 18), jede Druckseite = genau eine PDF-Seite, keine verkleinerte Notseite (blob.scaledPages = 0)
  - Inhaltsverzeichnis = echte Startseiten (aus dem PDF-Text gelesen) und blob.tocMismatch = 0
  - eine Schriftgroesse fuer alle Schritttexte, gemessen in der Seite UND im html2canvas-Klon (dort entstand die grosse Schrift)
  - Textvergroesserung (text-size-adjust) in Messflaeche, Druckbereich und Klon abgeschaltet
  - kurze Rezepte einseitig, keine geteilten Schritte, Seite 1 gefuellt
  - Fusszeile (Buchname, Seitenzahl) auf jeder Rezeptseite im Text, nichts ueber 297 mm
  - Notfall: weicht die Schrift im Druckbereich von der Messung ab (wie Safari auf dem iPhone), wird nachgeplant statt geschnitten
SAVORA_PDF_TEXT_SHIFT_MM=0.3 wirkt (Linux-Simulation); dann zusaetzlich Randbefunde aus pdf_harness.pruefe_raender."""
import asyncio, os, re, subprocess, sys
os.environ.setdefault('SAVORA_TEST_PORT', '23870')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *   # noqa: F401,E402
from pdf_harness import PdfSession, pruefe_raender, pdftext   # noqa: E402
from pdf_hirnkost_fixture import hirnkost_session_setup, HIRNKOST_RECIPES   # noqa: E402

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

async def main():
    out = os.path.join(OUT, 'v87_layout'); os.makedirs(out, exist_ok=True)
    async with PdfSession(out) as s:
        await hirnkost_session_setup(s)
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

        # ---------- Notfall: Druckbereich setzt Schritte und Notizen 1,5-fach (wie Safari-Autosizing), die Messflaeche nicht ----------
        ex2, info2 = await export(s, 'hirnkost_v87_gross', '#printRoot .pv-step-text, #printRoot .pv-extra-body { font-size: 15pt !important; }')
        n2 = ex2.seiten()
        over = [d for d in info2['v']['secs'] if d.get('hMm', 0) > 297.4]
        check('Notfall: keine Seite ueber A4, nichts geschnitten oder verkleinert', not over and n2 == len(ex2.dom), str([(d['kind'], d['id'], round(d['hMm'], 1)) for d in over]) + f' {n2}/{len(ex2.dom)}')
        print('Notfall: Seiten', n2, 'statt', n)
        check('Notfall: das zu hohe Rezept wurde nachgeplant (mehr Seiten statt Schnitt)', n2 > n, f'{n2} / {n}')
        toc_vs_pdf(ex2, info2, 'Notfall')
        check('Keine JS-Fehler', not s.fehler, str(s.fehler[:3]))
    print('\n' + ('ALLE OK' if not FAIL else f'{len(FAIL)} FEHLER: ' + '; '.join(FAIL)))
    print('Ausgabe:', out)
    sys.exit(1 if FAIL else 0)

asyncio.run(main())
