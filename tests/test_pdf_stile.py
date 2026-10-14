"""PDF-Stile: strenge Abnahmepruefungen fuer BEIDE Stile (TEMPLATE_IDS, Standard pur und prise-pop) als Einzelrezept UND Kochbuch,
mit allen drei Naehrwerte-Optionen (aus, kompakt, erweitert), auf den ECHT erzeugten PDFs (buildSinglePdf / buildCookbookPdf).

Pflichtpruefungen je Stil: kein Clipping, Bounds in sicheren Bereichen, Bilder nie verzerrt, Schrift nie unter 10 pt (Haupttext) / 8,5 pt (sekundaer),
keine Wortfragmente (besonders in der Zutatenspalte), keine einzelne Ueberschrift am Seitenende, «Fortsetzung · n von m», keine fast leere Restseite,
Text vollstaendig und nicht doppelt (pdftotext, normalisiert), Inhaltsverzeichnis = Seitenzahlen, Vorschau-Bytes = Download-Bytes,
Naehrwerte-Optionen, Dokumenttitel; ausserdem: alle vorhandenen Cover erzeugen ein PDF und das Deckblatt ist vom Stil unabhaengig.

Strikt, keine «erwartet rot»-Liste. Umgebung:
  SAVORA_PDF_IDS=A,B     gegen alten Code (vor 0.75) ausfuehren (Standard: pur,prise-pop)
  SAVORA_PDF_SCHNELL=1   kleinere Matrix (weniger Rezepte, kein grosses Kochbuch, nur 4 Covervorlagen)
Die Messung nutzt tests/pdf_harness.py (DOM-Vermessung vor html2canvas). Aendert eine Version die Rastermaschine oder die pv-Klassennamen, muss nur der Harness angepasst werden."""
import asyncio, os, re, sys, time
os.environ.setdefault('SAVORA_TEST_PORT', '16500')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pdf_harness import *   # noqa: F401,F403
from PIL import ImageChops

SCHNELL = os.environ.get('SAVORA_PDF_SCHNELL') == '1'
OUTDIR = os.path.join(OUT, 'pdf_stile'); os.makedirs(OUTDIR, exist_ok=True)
FAIL = []
SICHER_X, SICHER_R, SICHER_Y, SICHER_B = 8.0, 202.0, 4.0, 293.0   # mm auf A4: Textboxen ausserhalb der Fusszeile muessen in diesem Kasten liegen (Auftrag: Innenabstand ca. 15 mm, Toleranz fuer Kopfbaender)

# Rezepte der Matrix (aus tests/fixtures/pdf_rezepte.json). NW3 = alle drei Naehrwerte-Optionen; EINZEL = eine Option (kompakt, falls Naehrwerte vorhanden).
NW3 = ['pdf_sloppy', 'pdf_manti', 'pdf_carbonara', 'pdf_cookies', 'pdf_gruppen']
EINZEL = ['pdf_kurz', 'pdf_zitronenpasta', 'pdf_ohnemenge', 'pdf_langeeinheiten', 'pdf_zahlen', 'pdf_unicode', 'pdf_bildkaputt', 'pdf_hochformat', 'pdf_quadrat', 'pdf_querformat',
          'pdf_langerschritt', 'pdf_vieleschritte', 'pdf_notizen', 'pdf_langtitel', 'pdf_cookies_lang', 'pdf_vielezutaten', 'pdf_zweiseiten', 'pdf_dreiseiten']
if SCHNELL:
    NW3 = ['pdf_manti', 'pdf_carbonara']
    EINZEL = ['pdf_kurz', 'pdf_zitronenpasta', 'pdf_unicode', 'pdf_bildkaputt', 'pdf_langerschritt', 'pdf_notizen', 'pdf_zweiseiten', 'pdf_dreiseiten']
# Seitenzahl-Erwartung (untere, obere Grenze) bei kompakten Naehrwerten
ERWARTUNG = {'pdf_kurz': (1, 1), 'pdf_zitronenpasta': (1, 1), 'pdf_ohnemenge': (1, 1), 'pdf_quadrat': (1, 1), 'pdf_zweiseiten': (2, 3), 'pdf_dreiseiten': (3, 9)}
DAUER = {}


def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info if (info and not cond) or (info and len(info) < 90) else '')
    if not cond: FAIL.append(name)

def kurz(bef, n=3):
    return f'{len(bef)} Befunde, z. B. ' + ' | '.join(f'{b.get("export", "")} S.{b["seite"]}: {b["text"][:110]}' for b in bef[:n]) if bef else ''


# ---------- eigene Pruefungen auf dem DOM ----------
def pruefe_sichere_bereiche(ex):
    """Alle Textbloecke (ohne Fusszeile, ohne Deckblatt/Kapitelseiten) liegen innerhalb des sicheren Kastens; kein Block ist von der Seite oder einem overflow-Vorfahren beschnitten."""
    out = []
    for i, s in enumerate(ex.dom):
        if s.get('kind') in ('cover', 'chapter'): continue
        for b in s.get('blocks', []):
            if b.get('foot'): continue
            if b['x'] < SICHER_X or b['r'] > SICHER_R or b['y'] < SICHER_Y or b['b'] > SICHER_B:
                out.append(F('ausserhalb_sicher', i + 1, f'«{b["text"][:30]}» ({b["cls"][:25]}) liegt bei x {b["x"]}–{b["r"]}, y {b["y"]}–{b["b"]} mm ausserhalb des sicheren Bereichs'))
        for c in s.get('clipped', []): out.append(F('clipping', i + 1, f'«{c.get("text", "")}» beschnitten durch {c.get("by", "")}'))
    return out

def pruefe_minimale_schrift(ex):
    """Nichts Sichtbares ausser dem Deckblatt unter 8,5 pt (zusaetzlich zur klassenbasierten Haupttext-Pruefung in pruefe_schriftgroessen)."""
    out = []; seen = set()
    for i, s in enumerate(ex.dom):
        if s.get('kind') == 'cover': continue
        for b in s.get('blocks', []):
            if b['fsPt'] < MIN_SEKUNDAER_PT - 0.05 and (b['cls'], b['fsPt']) not in seen:
                seen.add((b['cls'], b['fsPt'])); out.append(F('schrift_unter_minimum', i + 1, f'{b["fsPt"]} pt in «{b["cls"] or b["tag"]}»: «{b["text"][:30]}»'))
    return out

def pruefe_fortsetzung_pdf(ex):
    """Jede Folgeseite eines Rezepts traegt im PDF-Text «Fortsetzung · n von m» mit richtigem n und m (m = Seitenzahl dieses Rezepts)."""
    out = []; per = {}
    for i, s in enumerate(ex.dom):
        if s.get('recipeId'): per.setdefault(s['recipeId'], []).append(i + 1)
    for rid, seiten in per.items():
        m = len(seiten)
        for n, pdfseite in enumerate(seiten[1:], 2):
            t = re.sub(r'\s+', ' ', ex.text(first=pdfseite))
            g = re.search(r'Fortsetzung\s*·\s*(\d+) von (\d+)', t)
            if not g: out.append(F('fortsetzung_text', pdfseite, f'{rid}: «Fortsetzung · {n} von {m}» fehlt im PDF-Text', rezept=rid))
            elif int(g.group(1)) != n or int(g.group(2)) != m: out.append(F('fortsetzung_zahlen', pdfseite, f'{rid}: «{g.group(0)}» statt «Fortsetzung · {n} von {m}»', rezept=rid))
    return out

def pruefe_zutatenspalte(ex):
    """Wortfragmente in der Zutatenspalte (Menge, Einheit, Name): ein Wort bricht nie mitten im Wort."""
    out = [b for b in pruefe_wortbrueche(ex) if b['id'] in ('wort_gebrochen', 'menge_getrennt')]
    return [b for b in out if re.search(r'ing|amt|unit|menge', b['text'], re.I)]

def pruefe_nur_titel_ok(ex, titel_teil):
    t = ex.info()['titel']
    return [] if titel_teil and flach(titel_teil)[:12] in flach(t) else [F('dokumenttitel', 0, f'PDF-Titel «{t}» enthaelt nicht «{titel_teil}»')]


async def main():
    fx = lade_fixtures(); rez = {r['id']: r for r in fx['recipes']}
    for rid in NW3 + EINZEL: assert rid in rez, f'Fixture {rid} fehlt in tests/fixtures/pdf_rezepte.json'
    stile = list(TEMPLATE_IDS)
    ex_alle = {}                                  # (art, id, stil, nw) -> Export
    bef = {st: {} for st in stile}                # stil -> Kategorie -> Befunde
    def ernte(ex, stil, rezepte):
        res = alle_pruefungen(ex, rezepte)
        res['sicher'] = pruefe_sichere_bereiche(ex); res['min_schrift'] = pruefe_minimale_schrift(ex)
        res['fortsetzung_pdf'] = pruefe_fortsetzung_pdf(ex); res['zutatenspalte'] = pruefe_zutatenspalte(ex)
        for k, v in res.items():
            for b in v: b['export'] = ex.name
            bef[stil].setdefault(k, []).extend(v)
    async with PdfSession(OUTDIR) as s:
        vorher = await s.zustand()
        print('Naehrwerte-Status der Testrezepte:', s.naehrwerte_status)
        t0 = time.time()
        # ---- Einzelrezepte ----
        for stil in stile:
            for rid in NW3 + EINZEL:
                stufen = ['off', 'compact', 'full'] if rid in NW3 else (['compact'] if rez[rid].get('_nutri') else ['off'])
                for nw in stufen:
                    ex = await s.single(rid, stil, nw)
                    if not ex.pdf: bef[stil].setdefault('export_fehlgeschlagen', []).append(F('export_fehlgeschlagen', 0, f'{rid} {stil} {nw}: kein PDF', export=ex.name)); continue
                    ernte(ex, stil, [rez[rid]]); ex_alle[('einzel', rid, stil, nw)] = ex
        DAUER['einzel'] = time.time() - t0; t0 = time.time()
        # ---- Kochbuch «ref» in allen drei Naehrwerte-Optionen, «gross» (alle Testrezepte) nur im zweiten Stil, damit test_pdf_ausgabe den ersten abdeckt ----
        ref_rez = [rez[i] for i, _ in fx['books']['ref']['items']]
        for stil in stile:
            for nw in ('off', 'compact', 'full'):
                ex = await s.book('ref', stil, nw)
                if not ex.pdf: bef[stil].setdefault('export_fehlgeschlagen', []).append(F('export_fehlgeschlagen', 0, f'buch ref {stil} {nw}', export=ex.name)); continue
                ernte(ex, stil, ref_rez); ex_alle[('buch', 'ref', stil, nw)] = ex
        if not SCHNELL:
            ex = await s.book('gross', T1, 'compact'); ernte(ex, T1, [rez[i] for i, _ in fx['books']['gross']['items']]); ex_alle[('buch', 'gross', T1, 'compact')] = ex
        DAUER['kochbuch'] = time.time() - t0; t0 = time.time()

        # ---- Pflichtpruefungen je Stil ----
        for stil in stile:
            B = bef[stil]; P = f'[{stil}] '
            def ids(kat, wanted): return [b for b in B.get(kat, []) if b['id'] in wanted]
            check(P + 'alle Exporte (Einzelrezepte und Kochbuecher) liefern ein PDF', not B.get('export_fehlgeschlagen'), kurz(B.get('export_fehlgeschlagen', [])))
            b = ids('raender', {'text_in_enger_box', 'text_angeschnitten', 'text_beschnitten', 'rand_tinte', 'rand_streifen', 'seite_zu_hoch', 'fuss_ausserhalb', 'fuss_beschnitten'}) + B.get('seitenzahl', []) + B.get('sicher', []) + ids('ueberlappung', {'fuss_trifft_seitenzahl'})
            check(P + 'kein Clipping: nichts abgeschnitten, keine Randstreifen, alles in den sicheren Bereichen, jede Druckseite = eine PDF-Seite', not b, kurz(b))
            b = ids('ueberlappung', {'text_ueberlappt', 'text_auf_bild'})
            check(P + 'keine ueberlappenden Texte oder Texte auf dem Foto', not b, kurz(b))
            b = [x for x in B.get('bilder', []) if x['id'] in ('bild_verzerrt', 'bild_ungeprueft')]
            check(P + 'Bilder nie verzerrt (Seitenverhaeltnis bleibt, Hoch-, Quer-, Quadrat- und Breitformat)', not b, kurz(b))
            b = [x for x in B.get('bilder', []) if x['id'] == 'bild_defekt']
            check(P + 'kein defektes Bildsymbol auf der Seite (auch bei defektem Foto)', not b, kurz(b))
            b = B.get('schrift', []) + B.get('min_schrift', [])
            check(P + 'Schrift nie unter 10 pt im Haupttext und nie unter 8,5 pt sekundaer', not b, kurz(b))
            b = B.get('wortbruch', [])
            check(P + 'keine Wortfragmente (kein Wort bricht mitten im Wort)', not b, kurz(b))
            check(P + 'Zutatenspalte: Mengen, Einheiten und Namen nie in Fragmenten', not B.get('zutatenspalte'), kurz(B.get('zutatenspalte', [])))
            b = B.get('ueberschriften', [])
            check(P + 'keine einzelne Ueberschrift am Seitenende, keine leere Rubrik', not b, kurz(b))
            b = B.get('fortsetzung', []) + B.get('fortsetzung_pdf', [])
            check(P + 'Fortsetzungsseiten tragen Rezeptname und «Fortsetzung · n von m» (im PDF-Text)', not b, kurz(b))
            b = B.get('restseiten', [])
            check(P + 'keine fast leere Restseite', not b, kurz(b))
            b = B.get('text', [])
            check(P + 'Text vollstaendig und nicht doppelt (pdftotext, normalisiert), keine Platzhalter', not b, kurz(b))
            b = B.get('inhaltsverzeichnis', [])
            check(P + 'Inhaltsverzeichnis stimmt mit den Seitenzahlen (Verzeichnis, Rezeptanfaenge, PDF-Text)', not b, kurz(b))
            abw = []
            for rid, (lo, hi) in ERWARTUNG.items():
                e = ex_alle.get(('einzel', rid, stil, 'compact')) or ex_alle.get(('einzel', rid, stil, 'off'))
                if e is not None and not lo <= e.seiten() <= hi: abw.append(f'{rid}: {e.seiten()} Seiten (erwartet {lo} bis {hi})')
            check(P + 'Seitenzahlen der Testrezepte plausibel (kurz = 1, lang = mehrere, nie unnoetig viele)', not abw, str(abw[:3]))
            # Dokumenttitel (Einzelrezept = Rezeptname, Kochbuch = Buchtitel)
            tit = []
            for rid in ('pdf_manti', 'pdf_unicode', 'pdf_zitronenpasta'):
                e = ex_alle.get(('einzel', rid, stil, 'compact')) or ex_alle.get(('einzel', rid, stil, 'off'))
                if e: tit += pruefe_nur_titel_ok(e, rez[rid]['title'])
            bk = ex_alle.get(('buch', 'ref', stil, 'compact'))
            if bk: tit += pruefe_nur_titel_ok(bk, fx['books']['ref']['title'])
            check(P + 'Dokumenttitel gesetzt (Rezeptname bzw. Buchtitel)', not tit, kurz(tit))

            # Naehrwerte aus / kompakt / erweitert: Einzelrezept UND Kochbuch
            nw = []
            for rid in NW3:
                if rid not in ('pdf_manti', 'pdf_carbonara'): continue   # Rezepte mit gerechneten Naehrwerten
                t = {lv: ' '.join(ex_alle[('einzel', rid, stil, lv)].text().split()) for lv in ('off', 'compact', 'full')}
                if re.search(r'Nährwerte|kcal', t['off']): nw.append(f'{rid}: «aus» zeigt Naehrwerte')
                if 'kcal' not in t['compact'] or 'ges. Fett' in t['compact']: nw.append(f'{rid}: «kompakt» falsch')
                if not all(w in t['full'] for w in ('kcal', 'Ballaststoffe', 'Zucker', 'ges. Fett', 'Salz')): nw.append(f'{rid}: «erweitert» zeigt nicht alle Werte')
                if not re.search(r'pro (Portion|Stück)', t['compact']): nw.append(f'{rid}: Bezugsgroesse fehlt')
                if re.search(r'\b0\s*(g|kcal)\b.*\bnull\b', t['full']): nw.append(f'{rid}: Nullwert-Text')
            tb = {lv: ' '.join(ex_alle[('buch', 'ref', stil, lv)].text().split()) for lv in ('off', 'compact', 'full') if ('buch', 'ref', stil, lv) in ex_alle}
            if len(tb) == 3:
                if re.search(r'Nährwerte|kcal', tb['off']): nw.append('Kochbuch «aus» zeigt Naehrwerte')
                if 'kcal' not in tb['compact'] or 'ges. Fett' in tb['compact']: nw.append('Kochbuch «kompakt» falsch')
                if not all(w in tb['full'] for w in ('kcal', 'Ballaststoffe', 'Zucker', 'ges. Fett', 'Salz')): nw.append('Kochbuch «erweitert» zeigt nicht alle Werte')
            check(P + 'Naehrwerte aus / kompakt / erweitert korrekt (Einzelrezept und Kochbuch), mit Bezugsgroesse', not nw, str(nw[:3]))
            # Einzelrezept und Kochbuch: gleiche Typografie, gleiche Seitenzahl
            diffs = []
            for rid in ('pdf_manti', 'pdf_carbonara', 'pdf_cookies', 'pdf_sloppy'):
                e, bk = ex_alle.get(('einzel', rid, stil, 'compact')), ex_alle.get(('buch', 'ref', stil, 'compact'))
                if e and bk:
                    for x in pruefe_einzel_gegen_buch(e, bk, rid): x['export'] = f'{rid} {stil}'; diffs.append(x)
            check(P + 'Einzelrezept und Kochbuch: gleiche Typografie und gleiche Seitenzahl je Rezept', not diffs, kurz(diffs))
        if not SCHNELL:
            g = ex_alle[('buch', 'gross', T1, 'compact')]
            check(f'[{T1}] langes Kochbuch (alle Testrezepte): Inhaltsverzeichnis ueber mehrere Seiten und vollstaendig', sum(1 for d in g.dom if d.get('kind') == 'toc') >= 2 and sum(len(d.get('tocRows', [])) for d in g.dom) >= 48, str(sum(1 for d in g.dom if d.get('kind') == 'toc')))
        DAUER['pruefungen'] = time.time() - t0; t0 = time.time()

        # ---- Vorschau = Download, in beiden Stilen und zwei Naehrwerte-Optionen (echte Oberflaeche) ----
        for stil, stufe in [(T0, 'compact'), (T1, 'full')]:
            ui = await vorschau_gleich_download(s, stil, 'pdf_carbonara', stufe, 'kcal')
            check(f'[{stil}] Vorschau-Bytes = Download-Bytes (SHA-256), gewaehlter Stil und Naehrwerte-Option im Dialog uebernommen ({stufe})', ui['gleich'], ui['info'])
            check(f'[{stil}] Seitenzahl der Vorschau = Seitenzahl der Datei', ui['seiten_ok'], ui['info'])
        DAUER['vorschau'] = time.time() - t0; t0 = time.time()

        # ---- Cover: alle vorhandenen Vorlagen erzeugen ein PDF; das Deckblatt ist vom Seitenstil unabhaengig ----
        cov = []; vorlagen = COVER_VORLAGEN[:4] if SCHNELL else COVER_VORLAGEN
        for k, vorlage in enumerate(vorlagen):
            stil = stile[k % len(stile)]
            ex = await s.book('ref', stil, 'off', datei=f'cover_{vorlage}_{stil}', ids=['pdf_kurz'], titel='Omas Rezepte', name='Die Muddi', slogan='Gesammelt seit 1928', cover=vorlage)
            if not ex.pdf: cov.append(f'{vorlage}: kein PDF'); continue
            t1 = flach(ex.text(first=1))
            if ex.seiten() < 3: cov.append(f'{vorlage}: nur {ex.seiten()} Seiten')
            for w in ('Omas', 'Rezepte', 'Muddi', 'Gesammelt', '1928'):
                if w.lower() not in t1: cov.append(f'{vorlage}: «{w}» fehlt auf dem Deckblatt')
            if re.search(r'undefined|null|NaN', t1): cov.append(f'{vorlage}: Platzhalter im Text')
        check('Cover: alle %d vorhandenen Covervorlagen erzeugen ein PDF mit allen Texten auf dem Deckblatt' % len(vorlagen), not cov, str(cov[:4]))
        gleich = []
        for vorlage in ('pop', 'bistro'):
            bilder = []
            for stil in stile:
                ex = await s.book('ref', stil, 'off', datei=f'coverstil_{vorlage}_{stil}', ids=['pdf_kurz'], titel='Omas Rezepte', name='Die Muddi', slogan='Gesammelt seit 1928', cover=vorlage)
                bilder.append(Image.open(ex.render()[0]).convert('RGB'))
            if len(bilder) > 1:
                bb = ImageChops.difference(bilder[0], bilder[1]).convert('L').point(lambda v: 255 if v > 40 else 0).histogram()[255]
                if bb > 150: gleich.append(f'{vorlage}: Deckblatt unterscheidet sich zwischen den Stilen ({bb} Pixel)')
        check('Cover bleibt unveraendert: Deckblatt ist in beiden Stilen gleich', not gleich, str(gleich))
        DAUER['cover'] = time.time() - t0

        nachher = await s.zustand()
        check('Export veraendert keine Rezepte, Zutaten, Schritte, Notizen, Bilder, Kategorien', vorher == nachher)
        check('keine Seitenfehler im Browser (pageerror)', not s.fehler, str(s.fehler[:3]))
    with open(os.path.join(OUTDIR, 'befunde.txt'), 'w', encoding='utf-8') as f:
        for st in stile:
            for k, v in bef[st].items():
                f.write(f'## [{st}] {k} ({len(v)})\n')
                for x in v: f.write(f'{x.get("export", "")}\tS.{x["seite"]}\t{x["id"]}\t{x["text"]}\n')
    print('\nDauer je Abschnitt (s):', {k: round(v) for k, v in DAUER.items()})
    print('Exporte und Seitenbilder:', OUTDIR)
    print('FEHLGESCHLAGEN:', FAIL or 'keine')


asyncio.run(main())
sys.exit(1 if FAIL else 0)
