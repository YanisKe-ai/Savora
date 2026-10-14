"""Abnahme-Werkzeug: erzeugt echte PDFs und Seitenbilder zum Anschauen (ein Aufruf, kein Playwright-Wissen noetig).

Aufruf (aus dem Repo-Ordner):
    .venv/bin/python tests/pdf_abnahme_render.py [Ausgabeordner] [Optionen]

Was passiert: Fuer ALLE Testrezepte (tests/fixtures/pdf_rezepte.json) x BEIDE Stile (pur, prise-pop) wird je ein Einzelrezept-PDF und ein
Kochbuch-PDF (Deckblatt, Inhaltsverzeichnis, das Rezept) geschrieben, dazu die beiden Beispielkochbuecher «ref» und «gross».
Pro PDF entstehen Seitenbilder (pdftoppm, 70 dpi) und EINE Kontaktbogen-PNG mit allen Seiten nebeneinander. Am Ende steht eine Uebersicht
(INDEX.txt und INDEX.html mit allen Kontaktboegen) im Ausgabeordner. Standard-Ausgabeordner: <Test-Ausgabe>/pdf_abnahme.

Struktur:   <Ausgabe>/<stil>/<einzel|kochbuch>/<name>.pdf, <name>_s-1.png ..., <name>_bogen.png

Optionen:
    --schnell            nur 8 wichtige Rezepte (statt aller) und nur das Buch «ref»
    --nur id,id,...      nur diese Testrezepte (z. B. pdf_manti,pdf_dreiseiten), Kurzform ohne «pdf_» geht auch
    --stile pur,prise-pop  andere Stil-Liste (alter Code: A,B; auch per SAVORA_PDF_IDS)
    --naehrwerte off|compact|full   Naehrwerte-Option fuer Rezepte mit Naehrwerten (Standard: compact)
    --ohne-kochbuch      nur Einzelrezepte        --ohne-einzel   nur Kochbuecher
    --dpi 70             Aufloesung der Seitenbilder
Voraussetzung: poppler (pdftoppm, pdftotext, pdfinfo) und Pillow, wie bei den uebrigen PDF-Tests."""
import argparse, asyncio, html, os, sys, time
os.environ.setdefault('SAVORA_TEST_PORT', '16500')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pdf_harness import *   # noqa: F401,F403

WICHTIG = ['pdf_sloppy', 'pdf_manti', 'pdf_carbonara', 'pdf_zitronenpasta', 'pdf_cookies_lang', 'pdf_unicode', 'pdf_bildkaputt', 'pdf_dreiseiten']


def parse():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('ausgabe', nargs='?', default=os.path.join(OUT, 'pdf_abnahme'))
    ap.add_argument('--schnell', action='store_true'); ap.add_argument('--nur', default=''); ap.add_argument('--stile', default=','.join(TEMPLATE_IDS))
    ap.add_argument('--naehrwerte', default='compact', choices=['off', 'compact', 'full']); ap.add_argument('--dpi', type=int, default=70)
    ap.add_argument('--ohne-kochbuch', action='store_true'); ap.add_argument('--ohne-einzel', action='store_true')
    return ap.parse_args()


async def main():
    a = parse(); stile = [x.strip() for x in a.stile.split(',') if x.strip()]
    base = os.path.abspath(a.ausgabe); os.makedirs(base, exist_ok=True)
    async with PdfSession(base) as s:
        rez = {r['id']: r for r in s.fx['recipes']}
        if a.nur: wahl = [(x if x in rez else 'pdf_' + x) for x in a.nur.split(',') if x.strip()]
        elif a.schnell: wahl = [r for r in WICHTIG if r in rez]
        else: wahl = [r['id'] for r in s.fx['recipes'] if not r['id'].startswith('pdf_mini')]
        fehlt = [r for r in wahl if r not in rez]
        if fehlt: sys.exit(f'Unbekannte Testrezepte: {fehlt}. Verfuegbar: {sorted(rez)[:8]} ...')
        jobs = []
        for stil in stile:
            if not a.ohne_einzel:
                for rid in wahl: jobs.append(('einzel', rid, stil))
            if not a.ohne_kochbuch:
                for rid in wahl: jobs.append(('kochbuch', rid, stil))
                for buch in (['ref'] if a.schnell else ['ref', 'gross']): jobs.append(('buch', buch, stil))
        print(f'{len(jobs)} PDFs ({len(wahl)} Rezepte x {len(stile)} Stile) nach {base}', flush=True)
        zeilen = []; t_ges = time.time()
        for k, (art, rid, stil) in enumerate(jobs, 1):
            ordner = os.path.join(base, stil, 'einzel' if art == 'einzel' else 'kochbuch'); os.makedirs(ordner, exist_ok=True); s.out = ordner
            nw = a.naehrwerte if rez.get(rid, {}).get('_nutri') or art == 'buch' else 'off'
            try:
                if art == 'einzel': ex = await s.single(rid, stil, nw, name=f'{rid.replace("pdf_", "")}_{nw}')
                elif art == 'kochbuch': ex = await s.book('ref', stil, nw, datei=f'{rid.replace("pdf_", "")}_buch_{nw}', ids=[rid], titel=f'Abnahme {rez[rid]["title"][:40]}', name='Testperson', slogan='Abnahmebuch')
                else: ex = await s.book(rid, stil, nw, datei=f'buch_{rid}_{nw}')
                if not ex.pdf: raise RuntimeError('kein PDF')
                bilder = rendere_seiten(ex.pdf, a.dpi, '_s')
                bogen = kontaktbogen(bilder, ex.pdf[:-4] + '_bogen.png', pro_zeile=5 if len(bilder) <= 12 else 8, breite=330 if len(bilder) <= 12 else 220)
                ids = [rid] if art in ('einzel', 'kochbuch') else [i for i, _ in s.fx['books'][rid]['items']]
                res = alle_pruefungen(ex, [rez[i] for i in ids])
                n_bef = sum(len(v) for v in res.values())
                zeilen.append((stil, art, rid, ex.seiten(), n_bef, os.path.relpath(bogen, base), os.path.relpath(ex.pdf, base), ex.sekunden))
                print(f'[{k}/{len(jobs)}] {stil} {art} {rid}: {ex.seiten()} Seiten, {ex.sekunden:.1f} s, {n_bef} automatische Befunde', flush=True)
            except Exception as e:
                zeilen.append((stil, art, rid, 0, -1, '', '', 0)); print(f'[{k}/{len(jobs)}] FEHLER {stil} {art} {rid}: {str(e)[:200]}', flush=True)
    with open(os.path.join(base, 'INDEX.txt'), 'w', encoding='utf-8') as f:
        f.write('stil\tart\tname\tseiten\tbefunde\tkontaktbogen\tpdf\n')
        for z in zeilen: f.write('\t'.join(str(x) for x in z[:7]) + '\n')
    with open(os.path.join(base, 'INDEX.html'), 'w', encoding='utf-8') as f:
        f.write('<!doctype html><meta charset="utf-8"><title>PDF-Abnahme</title><style>body{font:14px system-ui;margin:20px}img{max-width:100%;border:1px solid #888}h3{margin:24px 0 4px}</style><h1>PDF-Abnahme</h1>')
        for stil, art, rid, n, bef, bogen, pdf, sek in zeilen:
            f.write(f'<h3>{html.escape(stil)} · {html.escape(art)} · {html.escape(rid)} · {n} Seiten · {bef} Befunde · <a href="{html.escape(pdf)}">PDF</a></h3>' + (f'<img src="{html.escape(bogen)}" loading="lazy">' if bogen else '<p>FEHLER</p>'))
    print(f'\nFertig in {time.time() - t_ges:.0f} s. Uebersicht: {os.path.join(base, "INDEX.html")}')
    print('Fehlgeschlagen:', [z[:3] for z in zeilen if z[4] < 0] or 'keine')

asyncio.run(main())
