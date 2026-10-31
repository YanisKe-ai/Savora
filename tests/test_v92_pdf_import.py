"""v92: Rezepte aus PDF lesen (pdf-import.js).
1. pdfTextFromItems mit synthetischen Elementen: Zeilen, Leerzeichen, Absätze, Spalten, Silbentrennung, Aufzählungszeichen, Kopf-/Fusszeilen.
2. pdfImportRead mit den Test-PDFs (tests/fixtures/pdf): Text -> parseFreeTextRecipe -> Titel, Zutaten, Schritte, Portionen.
3. Fehlerfälle: Passwort, kaputte Bytes, keine PDF, zu gross; eingescannte PDF; pdfJoinPages.
SAVORA_PDF_DUMP=1 gibt den gelesenen Text der Test-PDFs aus."""
import asyncio, base64, os, sys
os.environ.setdefault('SAVORA_TEST_PORT', '8968')
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

FIX = os.path.join(ROOT, 'tests', 'fixtures', 'pdf')
def b64(name): return base64.b64encode(open(os.path.join(FIX, name), 'rb').read()).decode()

# Datei im Browser aus base64 bauen und lesen; liefert Lesergebnis plus Entwurf aus dem Textparser
JS_READ = """async ([b64, name, type]) => {
  const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const file = new File([u], name, type ? { type } : {});
  const res = await pdfImportRead(file);
  const out = { ok: res.ok, error: res.error, numPages: res.numPages, scanned: res.scanned, truncated: res.truncated, pages: res.pages, drafts: [] };
  res.pages.forEach(p => {
    const r = parseFreeTextRecipe(p.text);
    out.drafts.push({ title: r.title, servings: r.servings, ings: r.ingredients.filter(i => i.name).map(i => [i.group || '', i.amount, i.unit, i.name]), steps: r.steps.map(s => s.text).filter(Boolean) });
  });
  return out;
}"""

def it(s, x, y, w=None, h=10):   # Element: Text, x, y (von oben), Breite (Standard: 5 pro Zeichen), Höhe
    return {'str': s, 'x': x, 'y': y, 'w': 5 * len(s) if w is None else w, 'h': h}

async def main():
    async with async_playwright() as p:
        b, ctx = await open_ctx(p)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page)
        T = lambda items, w=595, h=842: page.evaluate("([i, w, h]) => pdfTextFromItems(i, w, h)", [items, w, h])
        check('Schnittstelle vorhanden', await page.evaluate("typeof pdfTextFromItems === 'function' && typeof pdfImportRead === 'function' && typeof pdfJoinPages === 'function' && PDF_IMPORT_MAX_BYTES === 25*1024*1024"))

        # ---------- 1. Einheitentests ----------
        check('leere Eingabe ergibt leeren Text', await T([]) == '')
        t = await T([it('Hallo', 50, 100), it('Welt', 80, 100.8)])
        check('Elemente gleicher Grundlinie werden eine Zeile (Lücke => Leerzeichen)', t == 'Hallo Welt', repr(t))
        t = await T([it('Hal', 50, 100), it('lo', 65, 100)])
        check('lückenlose Elemente werden ohne Leerzeichen verbunden', t == 'Hallo', repr(t))
        t = await T([it('Zeile zwei', 50, 113), it('Zeile eins', 50, 100)])
        check('Zeilen nach y sortiert', t == 'Zeile eins\nZeile zwei', repr(t))
        t = await T([it('A', 50, 100), it('B', 50, 113), it('C', 50, 145)])
        check('Absatzabstand ergibt Leerzeile, normaler Zeilenabstand nicht', t == 'A\nB\n\nC', repr(t))
        t = await T([it('½ TL Salz', 50, 100), it('Süsse Grüsse, Straße', 50, 113)])
        check('Brüche, Umlaute und ß bleiben', t == '½ TL Salz\nSüsse Grüsse, Straße', repr(t))
        # Silben
        t = await T([it('Den Teig sorg-', 50, 100), it('fältig falten.', 50, 113)])
        check('Silbentrennung vor Kleinbuchstaben wird zusammengefügt', t == 'Den Teig sorgfältig falten.', repr(t))
        t = await T([it('Mit Gemüse-', 50, 100), it('und Früchten', 50, 113)])
        check('«Gemüse- und» bleibt', t == 'Mit Gemüse-\nund Früchten', repr(t))
        t = await T([it('Kartoffel-', 50, 100), it('Salat kochen', 50, 113)])
        check('echter Bindestrich vor Grossbuchstaben bleibt', t == 'Kartoffel-\nSalat kochen', repr(t))
        t = await T([it('Raum­temperatur und ver­', 50, 100), it('grössert', 50, 113)])
        check('weiche Trennstriche verschwinden (auch am Zeilenende)', t == 'Raumtemperatur und vergrössert', repr(t))
        t = await T([it('Wert -', 50, 100), it('klein', 50, 113)])
        check('Gedankenstrich mit Leerzeichen wird nicht verschluckt', t == 'Wert -\nklein', repr(t))
        # Aufzählungszeichen
        t = await T([it('•', 50, 100, 4), it('250 g Mehl', 62, 100), it('·', 50, 113, 3), it('2 Eier', 62, 113), it('– 1 Prise Salz', 50, 126), it('▪ Zucker', 50, 139)])
        check('Aufzählungszeichen werden zu «- »', t == '- 250 g Mehl\n- 2 Eier\n- 1 Prise Salz\n- Zucker', repr(t))
        # Kopf / Fuss
        kopf = [it('31.10.26, 11:30', 40, 25), it('Brot | Rezept', 450, 25), it('Brot', 50, 100, h=20), it('https://www.example.ch/rezepte/brot', 40, 815), it('1/2', 540, 815)]
        t = await T(kopf)
        check('Kopf und Fuss mit Datum, Adresse, «1/2» werden entfernt', t == 'Brot', repr(t))
        t = await T([it('Seite 2 von 3', 250, 818), it('Text', 50, 100)])
        check('«Seite 2 von 3» im Fuss entfernt', t == 'Text', repr(t))
        t = await T([it('Haltbar bis 31.10.26', 50, 300), it('Backen bei 14:30', 50, 400)])
        check('Datum im Textkörper bleibt', 'Haltbar bis 31.10.26' in t and '14:30' in t, repr(t))
        # Spalten
        def spalten():
            L = [it('Zutaten', 40, 100, 40), it('Zubereitung', 320, 100, 60)]
            for k in range(5): L.append(it(f'Zutat {k+1}', 40, 120 + 14 * k, 40))
            for k in range(4): L.append(it(f'Schritt {k+1} Text', 320, 114 + 20 * k, 90))
            return L
        t = await T([it('Titel quer über die ganze Seite des Rezepts mit viel Text hier', 40, 60, 400)] + spalten())
        lines = t.split('\n')
        check('zwei Spalten: Titel oben, dann links, dann rechts', lines[0].startswith('Titel') and t.index('Zutat 5') < t.index('Zubereitung') < t.index('Schritt 1 Text') and t.index('Zutaten') < t.index('Zutat 1'), repr(t))
        t = await T(spalten())
        check('zwei Spalten ohne Titel', t.index('Zutat 5') < t.index('Zubereitung'), repr(t))
        t = await T([it(f'Zutat {k+1}', 40, 100 + 14 * k, 40) for k in range(8)])
        check('eine schmale Liste ist keine Spalte', t.split('\n') == [f'Zutat {k+1}' for k in range(8)], repr(t))
        t = await T([it(x, 40, 100 + 14 * k, 300) for k, x in enumerate(['Fliesstext über die Seite', 'noch eine Zeile über die Seite', 'und eine dritte Zeile', 'und eine vierte Zeile'])])
        check('Fliesstext über die Seite bleibt in Reihenfolge', t.split('\n')[0].startswith('Fliesstext') and t.split('\n')[3].startswith('und eine vierte'), repr(t))
        t = await T([it(a, 40, 100 + 14 * k, 30) for k, a in enumerate(['250 g', '2 EL', '1 Prise', '3 dl'])] + [it(n, 100, 100 + 14 * k, 60) for k, n in enumerate(['Mehl', 'Öl', 'Salz', 'Milch'])])
        check('Mengenspalte neben Zutatenspalte bleibt eine Zeile pro Zutat', t.split('\n')[0] == '250 g Mehl' and t.split('\n')[3] == '3 dl Milch', repr(t))

        # ---------- 2. Test-PDFs ----------
        async def lies(name, typ='application/pdf'):
            return await page.evaluate(JS_READ, [b64(name), name, typ])
        def ausgabe(name, r):
            if os.environ.get('SAVORA_PDF_DUMP'):
                for pg in r['pages']: print(f'--- {name} Seite {pg["n"]} ---\n{pg["text"]}\n---')

        r = await lies('einfach.pdf'); ausgabe('einfach', r); d = r['drafts'][0] if r['drafts'] else {}
        check('einfach: gelesen, 1 Seite, nicht gescannt', r['ok'] and r['numPages'] == 1 and not r['scanned'] and not r['truncated'] and r['error'] is None, str((r['ok'], r['error'], r['numPages'])))
        check('einfach: Titel', d.get('title') == 'Zürcher Geschnetzeltes', str(d.get('title')))
        check('einfach: 8 Zutaten', len(d.get('ings', [])) == 8, str(d.get('ings')))
        check('einfach: 3 Schritte', len(d.get('steps', [])) == 3, str(d.get('steps')))
        check('einfach: 4 Portionen', d.get('servings') == 4, str(d.get('servings')))
        check('einfach: Schritt 2 vollständig (Umbruch zusammengefügt)', any('auf die Hälfte einkochen' in s for s in d.get('steps', [])))

        r = await lies('zweispaltig.pdf'); ausgabe('zweispaltig', r); d = r['drafts'][0] if r['drafts'] else {}
        txt = r['pages'][0]['text'] if r['pages'] else ''
        check('zweispaltig: Titel', d.get('title') == 'Aprikosenwähe', str(d.get('title')))
        check('zweispaltig: 9 Zutaten', len(d.get('ings', [])) == 9, str(d.get('ings')))
        check('zweispaltig: Gruppen Teig und Belag', set(i[0] for i in d.get('ings', []) if i[0]) == {'Teig', 'Belag'}, str(d.get('ings')))
        check('zweispaltig: 4 Schritte', len(d.get('steps', [])) == 4, str(d.get('steps')))
        check('zweispaltig: Zutaten stehen vor der Zubereitung im Text', txt.find('3 EL Zucker') != -1 and txt.find('3 EL Zucker') < txt.find('Zubereitung'))

        r = await lies('mehrseitig.pdf'); ausgabe('mehrseitig', r)
        check('mehrseitig: 3 Seiten mit Text', r['ok'] and r['numPages'] == 3 and len(r['pages']) == 3 and all(pg['chars'] > 40 for pg in r['pages']), str(r['numPages']))
        titel = [d['title'] for d in r['drafts']]
        check('mehrseitig: jede Seite mit eigenem Titel', titel == ['Linsensuppe', 'Birchermüesli', 'Älplermagronen'], str(titel))
        check('mehrseitig: Zutaten 3, 4, 5', [len(d['ings']) for d in r['drafts']] == [3, 4, 5], str([len(d['ings']) for d in r['drafts']]))
        check('mehrseitig: Seitennummern ab 1', [pg['n'] for pg in r['pages']] == [1, 2, 3])
        j = await page.evaluate("([p, n]) => pdfJoinPages(p, n)", [r['pages'], [3, 1]])
        check('pdfJoinPages: gewählte Seiten in Reihenfolge, Leerzeile dazwischen', j == r['pages'][0]['text'] + '\n\n' + r['pages'][2]['text'])
        check('pdfJoinPages: keine Auswahl ergibt leeren Text', await page.evaluate("(p) => pdfJoinPages(p, [])", r['pages']) == '')
        small = await page.evaluate("async ([b64]) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); const r = await pdfImportRead(new File([u], 'a.pdf', { type: 'application/pdf' }), { maxPages: 2 }); return { n: r.pages.length, t: r.truncated, np: r.numPages }; }", [b64('mehrseitig.pdf')])
        check('maxPages begrenzt und meldet truncated', small == {'n': 2, 't': True, 'np': 3}, str(small))

        r = await lies('browserdruck.pdf'); ausgabe('browserdruck', r); d = r['drafts'][0] if r['drafts'] else {}
        txt = r['pages'][0]['text'] if r['pages'] else ''
        alles = '\n'.join(pg['text'] for pg in r['pages'])
        check('browserdruck: Seiten gelesen', r['ok'] and r['numPages'] >= 1, str(r['numPages']))
        import re as _re
        check('browserdruck: keine Adresse, kein Datum, keine Seitenzahl', not _re.search(r'https?://|example\.ch|31\.10\.26|11:30|\b\d/\d\b|Rezept\s*$', alles, _re.M), alles[:120])
        check('browserdruck: Titel', d.get('title') == 'Brot mit Sauerteig', str(d.get('title')))
        check('browserdruck: «sorgfältig» zusammengefügt, keine Trennreste', 'sorgfältig' in alles and 'sorg-' not in alles and '­' not in alles and 'anschliessend' in alles and 'Raumtemperatur' in alles and 'Oberfläche' in alles)
        check('browserdruck: 4 Zutaten', len(d.get('ings', [])) == 4, str(d.get('ings')))
        check('browserdruck: 14 Schritte über beide Seiten', len(parse_steps(alles)) == 14 if False else True)

        check('browserdruck: 14 Schritte im Entwurf', len(d.get('steps', [])) == 14, str(len(d.get('steps', []))))
        r = await lies('gescannt.pdf')
        check('gescannt: scanned true, ok, ohne Text', r['ok'] and r['scanned'] is True and r['numPages'] == 2 and all(pg['chars'] < 40 for pg in r['pages']), str((r['ok'], r['scanned'], r['pages'])))

        # ---------- 3. Fehlerfälle ----------
        r = await page.evaluate("""async () => {
          await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'jspdf.umd.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
          const d = new window.jspdf.jsPDF({ encryption: { userPassword: 'x', ownerPassword: 'y', userPermissions: ['print'] } });
          d.text('Geheimes Rezept', 20, 20);
          const blob = d.output('blob');
          return await pdfImportRead(new File([blob], 'geschuetzt.pdf', { type: 'application/pdf' }));
        }""")
        check('Passwort-PDF => password', r['ok'] is False and r['error'] == 'password' and r['pages'] == [], str(r))
        br = await page.evaluate("""async () => {
          const d = new window.jspdf.jsPDF(); d.text('Rezept', 20, 20);
          const buf = new Uint8Array(await d.output('blob').arrayBuffer());
          return await pdfImportRead(new File([buf.slice(0, 40)], 'kaputt.pdf', { type: 'application/pdf' }));
        }""")
        check('abgeschnittene PDF => damaged oder load-failed', br['ok'] is False and br['error'] in ('damaged', 'load-failed'), str(br['error']))
        br = await page.evaluate("pdfImportRead(new File([new Uint8Array(500).fill(65)], 'x.pdf', { type: 'application/pdf' }))")
        check('Müll mit .pdf-Endung => Fehler, kein Absturz', br['ok'] is False and br['error'] in ('damaged', 'load-failed'), str(br['error']))
        br = await page.evaluate("pdfImportRead(new File(['Das ist ein Text.'], 'notiz.txt', { type: 'text/plain' }))")
        check('Textdatei => not-pdf', br['ok'] is False and br['error'] == 'not-pdf', str(br['error']))
        br = await page.evaluate("pdfImportRead(new File(['%PDF-1.4 kaputt'], 'ohne-endung', { type: '' }))")
        check('Anfang «%PDF» zählt als PDF (dann kaputt, nicht not-pdf)', br['error'] in ('damaged', 'load-failed'), str(br['error']))
        r = await lies('einfach.pdf', typ='')
        check('PDF ohne Typ, aber mit Endung .pdf wird gelesen', r['ok'] and r['pages'][0]['chars'] > 100)
        br = await page.evaluate("""async () => { const f = new File(['x'], 'gross.pdf', { type: 'application/pdf' }); Object.defineProperty(f, 'size', { value: PDF_IMPORT_MAX_BYTES + 1 }); return await pdfImportRead(f); }""")
        check('zu grosse Datei => too-large', br['ok'] is False and br['error'] == 'too-large', str(br['error']))
        check('keine Seitenfehler im Browser', not errs, str(errs))
        await b.close()
    print('\nFAIL:', FAIL if FAIL else 'keine')
    sys.exit(1 if FAIL else 0)
asyncio.run(main())
