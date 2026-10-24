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
            g = re.search(r'Fortsetzung\s*·\s*(\d+)\s*(?:von|/)\s*(\d+)', t)   # Pur «n von m», Prise Pop «n / m»
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
        pre_plan = await s.page.evaluate("() => [typeof pdfLastPageCounts === 'undefined' ? null : pdfLastPageCounts, typeof pdfLastPlan === 'undefined' ? null : pdfLastPlan]")   # aus test_v83_cover_pdf Teil B
        plan_abw = []; plan_buch_abw = []; texte_stil = {}; sloppy_seiten = {}; hinweis_abw = []
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
                    # aus test_v83_cover_pdf Teil B: Plan (pdfLastPageCounts / pdfLastPlan) = tatsaechliche Seiten; Text beider Stile gleich; Sloppy Joe 1 Seite
                    k = ex.seiten(); pc = await s.page.evaluate("() => ({ c: Array.from(pdfLastPageCounts || []), p: pdfLastPlan })")
                    if not (pc['c'] == [[rid, k]] and pc['p'] and pc['p']['totalPages'] == k and pc['p']['recipes'][0]['pages'] == k): plan_abw.append(f'{rid} {stil} {nw}: {pc["c"]} statt {k} Seiten')
                    texte_stil[(rid, nw, stil)] = re.sub(r'[^a-z]+', '', flach(ex.text()).replace('Fortsetzung', '').lower().replace('fortsetzung', ''))
                    if rid == 'pdf_sloppy' and nw == 'off': sloppy_seiten[stil] = k
                    if rid == 'pdf_cookies':   # aus test_export: Hinweise und Quellen stehen im echten PDF nicht als nummerierte Schritte
                        norm = re.sub(r'\s+', ' ', ex.text().replace('\u00a0', ' '))
                        if 'Haltbarkeit' not in norm or re.search(r'0\d\s+Haltbarkeit', norm) or re.search(r'\d\d\s+Quelle:', norm): hinweis_abw.append(f'{stil} {nw}')
        DAUER['einzel'] = time.time() - t0; t0 = time.time()
        # ---- Kochbuch «ref» in allen drei Naehrwerte-Optionen, «gross» (alle Testrezepte) in beiden Stilen ----
        ref_rez = [rez[i] for i, _ in fx['books']['ref']['items']]
        for stil in stile:
            for nw in ('off', 'compact', 'full'):
                ex = await s.book('ref', stil, nw)
                if not ex.pdf: bef[stil].setdefault('export_fehlgeschlagen', []).append(F('export_fehlgeschlagen', 0, f'buch ref {stil} {nw}', export=ex.name)); continue
                ernte(ex, stil, ref_rez); ex_alle[('buch', 'ref', stil, nw)] = ex
                pcb = await s.page.evaluate("() => ({ c: Object.fromEntries(pdfLastPageCounts || []), p: pdfLastPlan })")   # aus test_v83_cover_pdf Teil B
                if not (pcb['c'] == seiten_pro_rezept(ex) and pcb['p'] and pcb['p']['kind'] == 'cookbook' and pcb['p']['totalPages'] == ex.seiten()): plan_buch_abw.append(f'{stil} {nw}: {pcb["c"]} vs {seiten_pro_rezept(ex)}')
        if not SCHNELL:
            for stil in stile:   # das lange Kochbuch (alle Testrezepte) laeuft in beiden Stilen (frueher teilte sich test_pdf_ausgabe den ersten Stil)
                ex = await s.book('gross', stil, 'compact'); ernte(ex, stil, [rez[i] for i, _ in fx['books']['gross']['items']]); ex_alle[('buch', 'gross', stil, 'compact')] = ex
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
                if not all(w in t['full'] for w in ('kcal', 'Nahrungsfasern', 'Zucker', 'ges. Fett', 'Salz')): nw.append(f'{rid}: «erweitert» zeigt nicht alle Werte')
                if not re.search(r'pro (Portion|Stück)', t['compact']): nw.append(f'{rid}: Bezugsgroesse fehlt')
                if re.search(r'\b0\s*(g|kcal)\b.*\bnull\b', t['full']): nw.append(f'{rid}: Nullwert-Text')
            tb = {lv: ' '.join(ex_alle[('buch', 'ref', stil, lv)].text().split()) for lv in ('off', 'compact', 'full') if ('buch', 'ref', stil, lv) in ex_alle}
            if len(tb) == 3:
                if re.search(r'Nährwerte|kcal', tb['off']): nw.append('Kochbuch «aus» zeigt Naehrwerte')
                if 'kcal' not in tb['compact'] or 'ges. Fett' in tb['compact']: nw.append('Kochbuch «kompakt» falsch')
                if not all(w in tb['full'] for w in ('kcal', 'Nahrungsfasern', 'Zucker', 'ges. Fett', 'Salz')): nw.append('Kochbuch «erweitert» zeigt nicht alle Werte')
            check(P + 'Naehrwerte aus / kompakt / erweitert korrekt (Einzelrezept und Kochbuch), mit Bezugsgroesse', not nw, str(nw[:3]))
            # Einzelrezept und Kochbuch: gleiche Typografie, gleiche Seitenzahl
            diffs = []
            for rid in ('pdf_manti', 'pdf_carbonara', 'pdf_cookies', 'pdf_sloppy'):
                e, bk = ex_alle.get(('einzel', rid, stil, 'compact')), ex_alle.get(('buch', 'ref', stil, 'compact'))
                if e and bk:
                    for x in pruefe_einzel_gegen_buch(e, bk, rid): x['export'] = f'{rid} {stil}'; diffs.append(x)
            check(P + 'Einzelrezept und Kochbuch: gleiche Typografie und gleiche Seitenzahl je Rezept', not diffs, kurz(diffs))
        check('vor dem ersten Rendern: keine Seitenzahl (pdfLastPageCounts und pdfLastPlan sind null)', pre_plan == [None, None], str(pre_plan))
        check('Einzelrezept: pdfLastPageCounts und pdfLastPlan = tatsaechliche PDF-Seiten (alle Rezepte, beide Stile, alle Naehrwerte-Optionen)', not plan_abw, kurz(plan_abw))
        check('Kochbuch: pdfLastPageCounts = Seiten je Rezept im PDF, pdfLastPlan.totalPages = PDF-Seiten (beide Stile, alle Naehrwerte-Optionen)', not plan_buch_abw, kurz(plan_buch_abw))
        check('Sloppy Joe (knapp zu lang): in beiden Stilen eine Seite', bool(sloppy_seiten) and all(v == 1 for v in sloppy_seiten.values()), str(sloppy_seiten))
        check('Hinweise (Haltbarkeit) und Quellen stehen im PDF nicht als nummerierte Schritte (Cookies, beide Stile, alle Naehrwerte-Optionen)', not hinweis_abw, kurz(hinweis_abw))
        textabw = []
        for (rid, nw, stil), t in texte_stil.items():
            if stil == stile[0]:
                t2 = texte_stil.get((rid, nw, stile[-1]), '')
                if abs(len(t) - len(t2)) > max(40, len(t) * 0.03): textabw.append(f'{rid} {nw}: {len(t)} vs {len(t2)} Zeichen')
        check('Beide Stile liefern gleichen Inhalt (Text je Rezept und Naehrwerte-Option, Fusszeile und Seitenzahl ignoriert)', not textabw, kurz(textabw))
        if not SCHNELL:
          for stil_g in stile:
            g = ex_alle[('buch', 'gross', stil_g, 'compact')]
            check(f'[{stil_g}] langes Kochbuch (alle Testrezepte): Inhaltsverzeichnis ueber mehrere Seiten und vollstaendig', sum(1 for d in g.dom if d.get('kind') == 'toc') >= 2 and sum(len(d.get('tocRows', [])) for d in g.dom) >= 48, str(sum(1 for d in g.dom if d.get('kind') == 'toc')))
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
        # ---- aus test_pdf_scharfes_s (Fehler vom 14.10.2026): «ß» und andere Zeichen, die bei Grossschreibung laenger werden («Grüße aus Zürich»); laeuft nach dem Vorher/Nachher-Vergleich, weil es ein Rezept anlegt ----
        await s.page.evaluate("""async () => {
          const r = Object.assign(emptyRecipe(), { id: 'ss_1', title: 'Grüße aus der Straße', servings: 2, categoryTags: ['hauptgericht'], category: 'Süße Grüße',
            ingredients: [{ amount: '200', unit: 'g', name: 'Weißkohl' }, { amount: '1', unit: 'EL', name: 'Öl' }],
            steps: [{ text: 'Weißkohl in Streifen schneiden. Mit Öl in der Pfanne anbraten, bis er süßlich duftet.' }], notes: 'Maße nach Gefühl.' });
          r.image = null; r.updatedAt = Date.now(); await dbPut(r); await loadRecipes(); }""")
        for stil in stile:
            try: ex = await s.single('ss_1', stil, 'compact', name=f'scharfes_s_einzel_{stil}'); ok = bool(ex.pdf)
            except Exception as e: ok = False; print('  Fehler', str(e)[:200])
            check(f'[{stil}] Einzelrezept mit «ß» wird exportiert', ok)
            await s.page.evaluate("(t) => saveCookbookConfig({ title: 'Grüße aus Zürich', subtitle: 'Maßvoll genießen', author: 'Weiß', pdfTemplate: t, chapters: [{ id: 'k1', name: 'Süße Grüße aus der Straße' }], items: [{ recipeId: 'ss_1', chapterId: 'k1' }] })", stil)
            try:
                exb = await s._erfasse("buildCookbookPdf(a[0], { template: a[1] })", ['compact', stil], f'scharfes_s_buch_{stil}', dict(art='buch', buch='ss', stil=stil, naehrwerte='compact')); okb = bool(exb.pdf)
            except Exception as e: okb = False; exb = None; print('  Fehler', str(e)[:200])
            check(f'[{stil}] Kochbuch «Grüße aus Zürich» wird exportiert', okb)
            if okb:
                txt = re.sub(r'\s+', ' ', exb.text())
                check(f'[{stil}] Rezepttitel mit «ß» steht im PDF-Text', 'Straße' in txt or 'STRASSE' in txt.upper(), txt[:200])
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
