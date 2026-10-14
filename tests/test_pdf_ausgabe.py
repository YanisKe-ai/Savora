"""PDF-Ausgabe: harte Pruefungen auf den ECHT erzeugten PDFs (Abnahmekriterien 1 bis 12 aus dem Auftrag «PDF-Export ueberarbeiten»).

Der Test erzeugt Einzelrezept- und Kochbuch-PDFs ueber die echte Pipeline (buildSinglePdf / buildCookbookPdf), rendert jede Seite mit pdftoppm,
liest den Text mit pdftotext und vermisst zusaetzlich den DOM der Druckseiten (tests/pdf_harness.py, Testrezepte in tests/fixtures/pdf_rezepte.json).

SCHARF SCHALTEN (Integrator):
  Ohne Umgebungsvariable ist der Test STRIKT: jede Pruefung muss gruen sein.
  Solange die Korrekturen noch nicht zusammengefuehrt sind, setzt tests/run_all.py (Eintrag EXTRA_ENV 'pdf_ausgabe') SAVORA_PDF_ERWARTE_FEHLER=1:
  dann gelten die unten in ERWARTET_ROT aufgelisteten Pruefungen (Stand 0.72.0 gemessen) als «erwartet rot»: sie werden ausgegeben, zaehlen aber nicht als Fehler,
  jede andere Pruefung bleibt strikt. Scharf schalten = in tests/run_all.py den Eintrag 'pdf_ausgabe' aus EXTRA_ENV loeschen (eine Zeile),
  danach laufen alle Pruefungen strikt in der CI. Zeigt die Ausgabe «ERWARTET ROT, ABER GRUEN», kann der Name aus ERWARTET_ROT gestrichen werden.
  Lokal: SAVORA_PDF_ERWARTE_FEHLER=1 python tests/test_pdf_ausgabe.py   (bekannte Fehler dokumentiert)   |   python tests/test_pdf_ausgabe.py   (strikt)
  SAVORA_PDF_SCHNELL=1 laesst die grossen Teile weg (Kochbuch «gross», Stile B/C der Einzelrezepte, Cover-Sonderfaelle)."""
import asyncio, hashlib, json, os, re, sys
os.environ.setdefault('SAVORA_TEST_PORT', '16500')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pdf_harness as H
from pdf_harness import *   # noqa: F401,F403

ERWARTE_FEHLER = os.environ.get('SAVORA_PDF_ERWARTE_FEHLER') == '1'
SCHNELL = os.environ.get('SAVORA_PDF_SCHNELL') == '1'
# Stand 0.72.0 (gemessen, siehe Baseline-Bericht): diese Pruefungen sind bekannt rot und muessen nach den Korrekturen gruen werden.
ERWARTET_ROT = {
    'K01a Kopf- und Fusszeilen nicht abgeschnitten',
    'K01b keine Randstreifen, keine geschnittenen Seiten',
    'K10 Inhaltsverzeichnis und Seitenzahlen stimmen mit den Seiten ueberein',
    'K04 keine gebrochenen Woerter in Zutaten und Text',
    'K07 keine unnoetigen Restseiten',
    'K08 Fortsetzungsseiten gekennzeichnet (Name, Fortsetzung, n von m)',
    'S Mindestschriftgroessen (Haupttext 10 pt, Sekundaertext 8,5 pt)',
}
OUTDIR = os.path.join(OUT, 'pdf'); os.makedirs(OUTDIR, exist_ok=True)
FAIL, ROT = [], []
GEMELDET = []   # alle Befunde (fuer die Textdatei im Ausgabeordner)

def check(name, cond, info=''):
    if cond:
        print('OK   ' + name, info if info else '')
        if ERWARTE_FEHLER and name in ERWARTET_ROT: print('     ERWARTET ROT, ABER GRUEN (kann aus ERWARTET_ROT gestrichen werden):', name)
        return
    if ERWARTE_FEHLER and name in ERWARTET_ROT:
        print('ROT  (erwartet, Stand 0.72.0) ' + name, info); ROT.append(name)
    else:
        print('FEHL ' + name, info); FAIL.append(name)

def sammle(befunde, ids):
    return [b for b in befunde if b['id'] in ids]

def kurz(bef, n=3):
    return f'{len(bef)} Befunde, z. B. ' + ' | '.join(f'{b.get("export", "")} S.{b["seite"]}: {b["text"][:110]}' for b in bef[:n]) if bef else ''

async def main():
    fx = lade_fixtures(); rez = {r['id']: r for r in fx['recipes']}
    haupt = [r['id'] for r in fx['recipes'] if not r['id'].startswith('pdf_mini')]
    alle = {}   # Befund-Kategorie -> Liste
    def ernte(ex, rezepte=None):
        res = alle_pruefungen(ex, rezepte)
        for k, v in res.items():
            for b in v: b['export'] = ex.name
            alle.setdefault(k, []).extend(v)
        return res
    async with PdfSession(OUTDIR) as s:
        vorher = await s.zustand()
        print('Naehrwerte-Status der Testrezepte:', s.naehrwerte_status)
        einzel = {}
        stile = ['A'] if SCHNELL else ['A', 'B', 'C']
        BC_REZEPTE = {'pdf_sloppy', 'pdf_manti', 'pdf_carbonara', 'pdf_cookies', 'pdf_langtitel', 'pdf_vielezutaten', 'pdf_zweiseiten', 'pdf_dreiseiten', 'pdf_hochformat', 'pdf_kurz', 'pdf_notizen', 'pdf_langeeinheiten'}
        for stil in stile:
            for rid in haupt:
                if stil != 'A' and rid not in BC_REZEPTE: continue
                stufen = (['off', 'compact', 'full'] if stil == 'A' else ['compact']) if rez[rid].get('_nutri') else ['off']
                for nw in stufen:
                    ex = await s.single(rid, stil, nw)
                    check_ok = ex.pdf is not None
                    if not check_ok: alle.setdefault('export_fehlgeschlagen', []).append(F('export_fehlgeschlagen', 0, f'{rid} {stil} {nw}: kein PDF', export=ex.name)); continue
                    ernte(ex, [rez[rid]]); einzel[(rid, stil, nw)] = ex
        # Kochbuch «ref» in allen Stilen, «gross» in A
        buecher = {}
        for stil in stile:
            ex = await s.book('ref', stil, 'compact'); ernte(ex, [rez[i] for i, _ in fx['books']['ref']['items']]); buecher[('ref', stil)] = ex
        if not SCHNELL:
            ex = await s.book('gross', 'A', 'compact'); ernte(ex, [rez[i] for i, _ in fx['books']['gross']['items']]); buecher[('gross', 'A')] = ex
        nachher = await s.zustand()

        def aus(kategorie, ids): return sammle(alle.get(kategorie, []), ids)
        # ---- K01 ----
        b = aus('raender', {'text_in_enger_box', 'text_angeschnitten', 'rand_tinte', 'fuss_ausserhalb', 'fuss_beschnitten', 'text_beschnitten'}) + aus('ueberlappung', {'fuss_trifft_seitenzahl'})
        check('K01a Kopf- und Fusszeilen nicht abgeschnitten', not b, kurz(b))
        b = aus('raender', {'rand_streifen', 'seite_zu_hoch'}) + alle.get('seitenzahl', [])
        check('K01b keine Randstreifen, keine geschnittenen Seiten', not b, kurz(b))
        # ---- K02 ----
        b = aus('ueberlappung', {'text_ueberlappt', 'text_auf_bild'})
        check('K02 keine ueberlappenden Texte oder Bilder', not b, kurz(b))
        # ---- K03 ----
        b = alle.get('bilder', []); schlimm = [x for x in b if x['id'] in ('bild_verzerrt', 'bild_defekt', 'bild_ungeprueft')]
        check('K03 keine verzerrten oder defekten Bilder', not schlimm, kurz(schlimm))
        # ---- K04 ----
        b = alle.get('wortbruch', [])
        check('K04 keine gebrochenen Woerter in Zutaten und Text', not b, kurz(b))
        # ---- K05 ----
        b = alle.get('ueberschriften', [])
        check('K05 keine alleinstehenden Ueberschriften, keine leeren Rubriken', not b, kurz(b))
        # ---- K06 ----
        b = alle.get('text', [])
        check('K06 keine verlorenen, doppelten oder erfundenen Inhalte (Textabgleich mit dem PDF-Text)', not b, kurz(b))
        # ---- K07 ----
        b = alle.get('restseiten', [])
        check('K07 keine unnoetigen Restseiten', not b, kurz(b))
        erwartung = {'pdf_kurz': (1, 1), 'pdf_ohnemenge': (1, 1), 'pdf_quadrat': (1, 1), 'pdf_zweiseiten': (2, 3), 'pdf_dreiseiten': (3, 9)}
        abw = []
        for stil in stile:
            for rid, (lo, hi) in erwartung.items():
                ex = einzel.get((rid, stil, 'compact')) or einzel.get((rid, stil, 'off'))
                if ex is None: continue
                n = ex.seiten()
                if not lo <= n <= hi: abw.append(f'{rid} Stil {stil}: {n} Seiten (erwartet {lo} bis {hi})')
        check('K07b Seitenzahlen der Testrezepte plausibel', not abw, str(abw[:3]))
        # ---- K08 ----
        b = alle.get('fortsetzung', [])
        check('K08 Fortsetzungsseiten gekennzeichnet (Name, Fortsetzung, n von m)', not b, kurz(b))
        # ---- S ----
        b = alle.get('schrift', [])
        check('S Mindestschriftgroessen (Haupttext 10 pt, Sekundaertext 8,5 pt)', not b, kurz(b))
        # ---- K10 ----
        b = alle.get('inhaltsverzeichnis', [])
        check('K10 Inhaltsverzeichnis und Seitenzahlen stimmen mit den Seiten ueberein', not b, kurz(b))
        if not SCHNELL:
            g = buecher[('gross', 'A')]
            check('K10b langes Inhaltsverzeichnis (mehr als eine Seite) vorhanden und vollstaendig', sum(1 for d in g.dom if d.get('kind') == 'toc') >= 2 and sum(len(d.get('tocRows', [])) for d in g.dom) >= 44, str([sum(1 for d in g.dom if d.get('kind') == 'toc')]))
        # ---- E: gleicher Stil = gleiche Rezeptgestaltung ----
        diffs = []
        for stil in stile:
            bk = buecher.get(('ref', stil))
            for rid in ('pdf_manti', 'pdf_carbonara', 'pdf_cookies', 'pdf_sloppy'):
                e = einzel.get((rid, stil, 'compact'))
                if e and bk:
                    for x in pruefe_einzel_gegen_buch(e, bk, rid): x['export'] = f'{rid} {stil}'; diffs.append(x)
        check('E Einzelrezept und Kochbuch: gleicher Stil, gleiche Typografie und Seitenzahl', not diffs, kurz(diffs))
        # ---- Naehrwerte aus / kompakt / erweitert ----
        nw = []
        for rid in ('pdf_manti', 'pdf_carbonara'):
            t = {lv: ' '.join(einzel[(rid, 'A', lv)].text().split()) for lv in ('off', 'compact', 'full')}
            if re.search(r'Nährwerte|kcal', t['off']): nw.append(f'{rid}: «aus» zeigt Naehrwerte')
            if 'kcal' not in t['compact'] or re.search(r'Zucker|ges\. Fett', t['compact']): nw.append(f'{rid}: «kompakt» falsch')
            if not all(w in t['full'] for w in ('kcal', 'Zucker', 'Salz')): nw.append(f'{rid}: «erweitert» zeigt nicht alle Werte')
            if not re.search(r'pro (Portion|Stück)', t['compact']): nw.append(f'{rid}: Bezugsgroesse fehlt')
        check('N Naehrwerte aus, kompakt, erweitert korrekt und mit Bezugsgroesse', not nw, str(nw[:3]))

        # ---- K12: Cover (alle Vorlagen) ----
        cov = []
        for vorlage in COVER_VORLAGEN:
            ex = await s.book('ref', 'A', 'off', datei=f'cover_{vorlage}', ids=['pdf_kurz'], titel='Omas Rezepte', name='Die Muddi', slogan='Gesammelt seit 1928', cover=vorlage)
            if not ex.pdf: cov.append(f'{vorlage}: kein PDF'); continue
            t1 = flach(ex.text(first=1)); n = ex.seiten()
            if n < 3: cov.append(f'{vorlage}: nur {n} Seiten')
            for w in ('Omas', 'Rezepte', 'Muddi', 'Gesammelt', '1928'):
                if w.lower() not in t1: cov.append(f'{vorlage}: «{w}» fehlt auf dem Deckblatt')
            if re.search(r'undefined|null|NaN', t1): cov.append(f'{vorlage}: Platzhalter im Text')
            bild = Image.open(ex.render()[0]).convert('RGB'); farben = len(set(bild.resize((60, 80)).getdata()))
            if farben < 30: cov.append(f'{vorlage}: Deckblatt fast leer ({farben} Farben)')
            ernte(ex, [rez['pdf_kurz']])
        # leere optionale Felder, ohne Logo und Datum; lange Texte
        sonder = [('leer', dict(titel='Nur Titel', name='', slogan='', logo=False, datum_zeigen=False, cover='salbei')),
                  ('lang', dict(titel='Ein Kochbuchtitel, der ungewoehnlich lang ist und mehrere Zeilen braucht', name='Vorname Nachname und eine lange Zusatzangabe', slogan='Ein langer Slogan mit vielen Woertern, der ebenfalls umbrechen muss, ohne etwas zu ueberdecken', cover='pop')),
                  ('lang2', dict(titel='Ein Kochbuchtitel, der ungewoehnlich lang ist und mehrere Zeilen braucht', name='Vorname Nachname und eine lange Zusatzangabe', slogan='Ein langer Slogan mit vielen Woertern, der ebenfalls umbrechen muss, ohne etwas zu ueberdecken', cover='bistro'))] if not SCHNELL else []
        for nm, kw in sonder:
            try:
                ex = await s.book('ref', 'A', 'off', datei=f'cover_{nm}', ids=['pdf_kurz'], **kw)
            except Exception as e:
                if re.search(r'zu lang|kürzen', str(e)): print(f'     Info: {nm}: kontrollierter Abbruch mit Hinweis: {str(e).splitlines()[0][-110:]}'); continue   # erlaubt (Auftrag: kein abgeschnittener Text)
                cov.append(f'{nm}: Export wirft {str(e)[:80]}'); continue
            if not ex.pdf: cov.append(f'{nm}: kein PDF (kontrollierter Abbruch statt abgeschnittener Text ist erlaubt, braucht aber eine Meldung)'); continue
            t1 = flach(ex.text(first=1)); t1roh = ex.text(first=1)
            if nm == 'leer':
                if re.search(r'undefined|null|NaN|\d{1,2}\.\d{1,2}\.\d{4}', t1roh): cov.append('leer: Platzhalter oder Datum trotz ausgeschaltet')
                if 'nurtitel' not in t1: cov.append('leer: Titel fehlt')
            else:
                for w in ('Kochbuchtitel', 'ungewoehnlich', 'Nachname', 'Slogan', 'ueberdecken'):
                    if w.lower() not in t1: cov.append(f'{nm}: «{w}» fehlt (abgeschnitten?)')
        check('K12a alle 15 Covervorlagen und Sonderfaelle (leer, lang, ohne Logo/Datum) exportieren vollstaendig', not cov, str(cov[:4]))
        b = alle.get('raender', []) + alle.get('seitenzahl', [])
        check('K12b alle Seitenstile (A, B, C) exportieren Einzelrezept und Kochbuch ohne Fehler', not alle.get('export_fehlgeschlagen') and all(buecher.get(('ref', st)) and buecher[('ref', st)].seiten() >= 5 for st in stile), str(alle.get('export_fehlgeschlagen', [])[:2]))

        # ---- K09: Vorschau = Download (echte Oberflaeche) ----
        ui = await vorschau_gleich_download(s)
        check('K09 Vorschau und Download verwenden dieselben PDF-Bytes (Einzelrezept, Stil B, Naehrwerte erweitert)', ui['gleich'], ui['info'])
        check('K09b Seitenanzahl der Vorschau entspricht dem PDF', ui['seiten_ok'], ui['info'])
        # ---- K11: Daten bleiben ----
        check('K11 Export veraendert keine Rezepte, Zutaten, Schritte, Notizen, Bilder, Kategorien', vorher == nachher)
        check('K11b keine Seitenfehler im Browser (pageerror)', not s.fehler, str(s.fehler[:3]))
    # Befunde als Textdatei fuer die Fehlersuche
    with open(os.path.join(OUTDIR, 'befunde.txt'), 'w', encoding='utf-8') as f:
        for k, v in alle.items():
            f.write(f'## {k} ({len(v)})\n')
            for x in v: f.write(f'{x.get("export","")}\tS.{x["seite"]}\t{x["id"]}\t{x["text"]}\n')
    print('\nExporte und Seitenbilder:', OUTDIR)
    print('ERWARTET ROT (Stand 0.72.0):', ROT or 'keine')
    print('FEHLGESCHLAGEN:', FAIL or 'keine')


async def vorschau_gleich_download(s):
    """Echte Bedienung: Exportfenster oeffnen, Stil B und «Erweitert» waehlen, PDF erstellen, in der Vorschau «Herunterladen» klicken."""
    page = s.page; info = {}
    await page.evaluate("() => { state.activeRecipeId = 'pdf_carbonara'; state.view = 'detail'; render(); openModal({ type: 'pdf-export', target: 'single', recipeId: 'pdf_carbonara', stage: 'options', template: 'A', nutritionDetail: 'off' }); }")
    await page.wait_for_selector('[data-action="pdf-export-build"]', timeout=10000)
    await page.click('[data-action="pdf-export-set-template"][data-id="B"]')
    if await page.query_selector('[data-action="pdf-export-set-detail"][data-level="full"]'): await page.click('[data-action="pdf-export-set-detail"][data-level="full"]')
    await page.click('[data-action="pdf-export-build"]')
    await page.wait_for_selector('[data-action="pdf-export-download"]', timeout=60000)
    await page.wait_for_timeout(500)
    h_vorschau = await page.evaluate("async () => { const b = state.modal.previewBlob; const u = new Uint8Array(await b.arrayBuffer()); const d = await crypto.subtle.digest('SHA-256', u); return [Array.from(new Uint8Array(d)).map(x => x.toString(16).padStart(2, '0')).join(''), b.pageCount || 0, state.modal.template, state.modal.nutritionDetail]; }")
    async with page.expect_download(timeout=30000) as d:
        await page.click('[data-action="pdf-export-download"]')
    dl = await d.value; pfad = os.path.join(OUTDIR, 'ui_download.pdf'); await dl.save_as(pfad)
    h_dl = hashlib.sha256(open(pfad, 'rb').read()).hexdigest()
    n = pdfinfo(pfad)['seiten']; t = ' '.join(pdftext(pfad).split())
    info = f'Vorschau {h_vorschau[0][:10]} Download {h_dl[:10]}, Stil {h_vorschau[2]}, Detail {h_vorschau[3]}, Seiten (Vorschau/Datei) {h_vorschau[1]}/{n}, «Zucker» im PDF: {"Zucker" in t}'
    await page.evaluate("() => { state.modal = null; render(); }")
    return {'gleich': h_vorschau[0] == h_dl and h_vorschau[2] == 'B' and h_vorschau[3] == 'full' and 'Zucker' in t, 'seiten_ok': h_vorschau[1] == n, 'info': info}


asyncio.run(main())
sys.exit(1 if FAIL else 0)
