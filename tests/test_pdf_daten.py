"""PDF-Datenmodell (pdfBuildModel, pdf-model.js): Zutaten sauber in Menge/Name/Zusatz zerlegt (auch Altdaten), Hinweise ohne verwaiste
Ueberschrift und ohne Verlust, Quelle mit getrennter URL, Kategorie aus der Quelle des Kapitels, Portionen/Stueck mit Widerspruch,
Naehrwerte mit null statt 0. Alles nur Anzeige: die Rezepte bleiben unveraendert."""
import asyncio, sys, json
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)
NB = ' '
FX = json.load(open(_os.path.join(TESTS, 'data', 'export_fixtures.json')))

# [Menge, Einheit, Name] -> erwartet (Menge-Anzeige, Name, Zusatz, unsicher)
MATRIX = [
    # Referenzfaelle aus den Fehlerberichten (Altdaten: Zutatenwort in der Einheit, Klammer im Namen)
    (['1/2', 'Zwiebel', '(fein geraspelt)'], ('½', 'Zwiebel', 'fein geraspelt', False)),
    (['1/2', 'Knoblauchzehe', '(fein geraspelt)'], ('½', 'Knoblauchzehe', 'fein geraspelt', False)),
    (['1/2', 'Handvoll', 'glatte Petersilie (sehr fein gehackt)'], (f'½{NB}Handvoll', 'glatte Petersilie', 'sehr fein gehackt', False)),
    (['2', 'Prisen', 'Salz'], (f'2{NB}Prisen', 'Salz', '', False)),
    (['1', 'Prise', 'Salz'], (f'1{NB}Prise', 'Salz', '', False)),
    (['1', 'Päckli', 'Vanillezucker'], (f'1{NB}Päckli', 'Vanillezucker', '', False)),
    (['1/2', 'Ei', '(Ei verquirlen und die Hälfte nehmen)'], ('½', 'Ei', 'Ei verquirlen und die Hälfte nehmen', False)),
    (['2', '', 'Eier'], ('2', 'Eier', '', False)),
    (['1/4', 'EL', '(ca. 1 gestrichener TL) Salz'], (f'¼{NB}EL', 'Salz', 'ca. 1 gestrichener TL', False)),
    (['200', 'g', 'Mehl (+ etwas Mehl zum Ausrollen)'], (f'200{NB}g', 'Mehl', '+ etwas Mehl zum Ausrollen', False)),
    (['1', 'Dose', 'Tomaten (400 g)'], (f'1{NB}Dose', 'Tomaten', '400 g', False)),
    # ohne Menge: keine Nullen, keine Platzhalter
    (['', '', 'Pfeffer aus der Mühle'], ('', 'Pfeffer aus der Mühle', '', False)),
    (['nach Geschmack', '', 'Salz'], ('', 'Salz', 'nach Geschmack', False)),
    (['etwas', '', 'Muskat'], ('', 'Muskat', 'etwas', False)),
    (['', 'Prise', 'Salz'], ('Prise', 'Salz', '', False)),
    # Bereiche, Brueche, Dezimalzahlen
    (['1-2', 'EL', 'Olivenöl'], (f'1–2{NB}EL', 'Olivenöl', '', False)),
    (['2 bis 3', 'EL', 'Öl'], (f'2–3{NB}EL', 'Öl', '', False)),
    (['1/2-1', 'TL', 'Zimt'], (f'½–1{NB}TL', 'Zimt', '', False)),
    (['1.5', 'kg', 'Kartoffeln'], (f'1{NB}½{NB}kg', 'Kartoffeln', '', False)),
    (['0.125', 'kg', 'Mehl'], (f'125{NB}g', 'Mehl', '', False)),
    (['2,25', 'dl', 'Wasser'], (f'2{NB}¼{NB}dl', 'Wasser', '', False)),
    (['0.8', 'dl', 'Rahm'], (f'0,8{NB}dl', 'Rahm', '', False)),
    (['1,2', 'EL', 'Honig'], (f'1,2{NB}EL', 'Honig', '', False)),
    (['½', 'TL', 'Backpulver'], (f'½{NB}TL', 'Backpulver', '', False)),
    (['250g', '', 'Butter'], (f'250{NB}g', 'Butter', '', False)),
    (['2 Stück', '', 'Äpfel'], (f'2{NB}Stück', 'Äpfel', '', False)),
    (['ca. 200', 'g', 'Mehl'], (f'ca.{NB}200{NB}g', 'Mehl', '', False)),
    # ganze Zeile im Namen (Altdaten)
    (['', '', '½ TL Backpulver'], (f'½{NB}TL', 'Backpulver', '', False)),
    (['', '', '300 g dunkle Schokolade oder Schokoladewürfeli'], (f'300{NB}g', 'dunkle Schokolade oder Schokoladewürfeli', '', False)),
    (['', '', '1/2 Ei (verquirlt)'], ('½', 'Ei', 'verquirlt', False)),
    (['', '', '7-Kräuter-Mix'], ('', '7-Kräuter-Mix', '', False)),
    # Sonderzeichen bleiben unveraendert
    (['100', 'g', 'Jalapeños & Co. – "frisch" <klein>'], (f'100{NB}g', 'Jalapeños & Co. – "frisch" <klein>', '', False)),
    (['2', 'EL', 'Soja-Sauce, hell'], (f'2{NB}EL', 'Soja-Sauce, hell', '', False)),
    # unsicher: Originaltext bleibt, nichts wird erfunden
    (['2', 'Zwiebel', 'rot, gehackt'], ('2', 'Zwiebel rot, gehackt', '', True)),
    (['1.000', '', 'Mehl'], ('1.000', 'Mehl', '', True)),
    (['', 'g', 'Mehl'], ('', 'Mehl', '', True)),
    (['eine Hand voll', '', 'Nüsse'], ('eine Hand voll', 'Nüsse', '', True)),
]

JS_ING = """(rows) => rows.map(r => { const rec = { id: 'x', title: 'T', ingredients: [{ amount: r[0], unit: r[1], name: r[2] }], steps: [{ text: 'Alles mischen und servieren, bis es fertig ist.' }] };
  const m = pdfBuildModel(rec, null); const i = m.ingredients.filter(x => x.type === 'ing'); return i.map(x => [x.amount, x.name, x.note, x.uncertain, x.raw, x.type]); })"""

JS_STEPS = """(spec) => { const rec = Object.assign({ id: 's', title: 'T', servings: 4, ingredients: [{ amount: '1', unit: 'g', name: 'X' }], steps: [] }, spec.rec);
  rec.steps = spec.steps.map(t => ({ text: t })); const before = JSON.stringify(rec); const m = pdfBuildModel(rec, null, spec.opts || {});
  return { steps: m.steps, tips: m.tips, source: m.source, sourceText: m.sourceText, sourceUrl: m.sourceUrl, sourceUrlText: m.sourceUrlText, notes: m.notes, cat: m.category, catKind: m.categoryKind, catAll: m.categoryAll,
    servings: m.servings, warnings: m.warnings, unchanged: before === JSON.stringify(rec) }; }"""

async def main():
    async with async_playwright() as p:
        b, c = await open_ctx(p, 1000, 900); page = await c.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.wait_for_timeout(300)
        await page.add_style_tag(content='::-webkit-scrollbar{display:none}')
        await page.evaluate('document.fonts.ready')
        ev = page.evaluate

        # 1) Zutatenmatrix
        res = await ev(JS_ING, [m[0] for m in MATRIX])
        for (inp, exp), got in zip(MATRIX, res):
            ok = len(got) == 1 and got[0][0] == exp[0] and got[0][1] == exp[1] and got[0][2] == exp[2] and got[0][3] == exp[3]
            check(f'Zutat {inp} -> {exp[0]!r} | {exp[1]!r} | {exp[2]!r}', ok, str(got).replace(NB, '~'))
        byin = {json.dumps(m[0], ensure_ascii=False): g[0] for m, g in zip(MATRIX, res)}
        check('Unsichere Zeile behaelt den Originaltext vollstaendig (raw)', byin['["2", "Zwiebel", "rot, gehackt"]'][4] == '2 Zwiebel rot, gehackt' and byin['["", "g", "Mehl"]'][4] == 'g Mehl' and byin['["1.000", "", "Mehl"]'][4] == '1.000 Mehl', '')
        check('Kein Zutatenwort steht allein in der Mengenspalte (Zwiebel, Knoblauchzehe, Ei, Eier)', not any(r[0][0].strip(NB + ' ').split(NB)[-1] in ('Zwiebel', 'Knoblauchzehe', 'Ei') for r in res[:7]), '')
        check('Keine "0" oder Platzhalter fuer fehlende Mengen', all(r[0][0] not in ('0', '-', '–', 'null', 'undefined', 'NaN') for r in res), '')
        # Zeile mit leerem Namen faellt nicht weg
        keep = await ev("""() => { const m = pdfBuildModel({ id: 'k', title: 'T', servings: 2, ingredients: [{ amount: '3', unit: 'Zwiebel', name: '' }, { amount: '', unit: '', name: '' }, { amount: '1', unit: 'EL', name: 'Öl' }], steps: [{ text: 'Mischen und kochen, bis es gar ist.' }] }, null); return m.ingredients.filter(i => i.type === 'ing').map(i => [i.amount, i.name]); }""")
        check('Zeile ohne Namen (nur Menge und Zutatenwort in der Einheit) bleibt erhalten, leere Zeile nicht', len(keep) == 2 and keep[0] == ['3', 'Zwiebel'], str(keep))
        # Gruppen
        grp = await ev("""() => { const m = pdfBuildModel({ id: 'g', title: 'T', servings: 2, ingredients: [{ name: 'Für den Teig:' }, { amount: '1', unit: 'g', name: 'A' }, { name: 'Für die Füllung:' }, { amount: '2', unit: 'g', name: 'B' }], steps: [{ text: 'Mischen und kochen, bis es gar ist.' }] }, null); return m.ingredients.map(i => i.type + ':' + (i.title || i.name) + ':' + (i.show === undefined ? '' : i.show)); }""")
        check('Gruppentitel bleiben als Gruppe (show) erhalten', grp == ['group:Für den Teig:true', 'ing:A:', 'group:Für die Füllung:true', 'ing:B:'], str(grp))

        # 2) Hinweise, Notizen, Quellen
        r = await ev(JS_STEPS, {'steps': ['Teig', 'Mehl und Wasser mischen.', 'Tipps & Hinweise', 'Haltbarkeit: Gut verschlossen etwa 2 Wochen haltbar.', 'Quelle: bettybossi.ch/rezept/chocolate-chip-cookies'], 'rec': {'notes': 'Meine eigene Notiz'}})
        check('Hinweise: allgemeine Ueberschrift "Tipps & Hinweise" bleibt nicht allein am Ende der Anleitung', r['steps'][-1]['type'] == 'step' and not any(s['type'] == 'heading' and 'Tipps' in s['text'] for s in r['steps']), str(r['steps']))
        check('Hinweis-Inhalt bleibt sichtbar (genau einmal)', r['tips'] == ['Haltbarkeit: Gut verschlossen etwa 2 Wochen haltbar.'], str(r['tips']))
        check('Nutzernotiz bleibt erhalten und getrennt von den Hinweisen', r['notes'] == 'Meine eigene Notiz', r['notes'])
        check('Quelle: Wortlaut unveraendert, URL getrennt erkannt', r['source'] == 'Quelle: bettybossi.ch/rezept/chocolate-chip-cookies' and r['sourceUrl'] == 'https://bettybossi.ch/rezept/chocolate-chip-cookies' and r['sourceUrlText'] == 'bettybossi.ch/rezept/chocolate-chip-cookies' and r['sourceText'] == 'bettybossi.ch/rezept/chocolate-chip-cookies', str(r))
        check('Echter Zwischentitel mit folgendem Schritt bleibt', r['steps'][0] == {'type': 'heading', 'text': 'Teig'} and r['steps'][1]['no'] == 1, str(r['steps']))
        check('Rezept bleibt unveraendert', r['unchanged'])
        r = await ev(JS_STEPS, {'steps': ['Mehl mischen und backen, bis alles gar ist.', 'Hinweise']})
        check('Hinweis ohne Inhalt (nur Beschriftung) erzeugt keinen Block', r['tips'] == [] and len(r['steps']) == 1, str(r))
        r = await ev(JS_STEPS, {'steps': ['Mehl mischen und backen, bis alles gar ist.', 'Für später', 'Tipp: Kühl und dunkel lagern.']})
        check('Besondere Ueberschrift vor einem Hinweis geht nicht verloren', len(r['tips']) == 1 and 'Für später' in r['tips'][0] and 'Kühl und dunkel lagern' in r['tips'][0] and r['steps'][-1]['type'] == 'step', str(r))
        r = await ev(JS_STEPS, {'steps': ['Vorbereitung', 'Backen', 'Ofen heizen und alles backen.']})
        check('Aufeinanderfolgende Zwischentitel gehen nicht verloren', [s['text'] for s in r['steps'] if s['type'] == 'heading'] == ['Vorbereitung', 'Backen'], str(r['steps']))
        r = await ev(JS_STEPS, {'steps': ['Einfrieren Sie den Teig vor dem Backen für eine Stunde.', 'Variante 2: Mit Nüssen statt Schokolade.', 'Tipp, der kein Doppelpunkt braucht.']})
        check('Mehrdeutiges Wort ohne Doppelpunkt (Einfrieren Sie ...) bleibt ein Schritt, "Variante 2:" und "Tipp" werden Hinweise', len(r['steps']) == 1 and len(r['tips']) == 2, str(r))
        r = await ev(JS_STEPS, {'steps': ['Alles mischen und backen, bis es fertig ist.'], 'rec': {'source': {'title': 'Betty Bossi', 'url': 'https://www.bettybossi.ch/de/rezept?id=1&x=2'}}})
        check('Quellenobjekt: Titel als Text, URL getrennt (nicht verloren)', r['source'] == 'Betty Bossi' and r['sourceUrl'] == 'https://www.bettybossi.ch/de/rezept?id=1&x=2', str(r))
        lang = 'https://example.com/rezepte/' + 'sehr-lang-' * 25 + 'ende.html'
        r = await ev(JS_STEPS, {'steps': ['Alles mischen und backen, bis es fertig ist.'], 'rec': {'source': lang}})
        check('Lange URL: ganzer Text und volle URL', r['source'] == lang and r['sourceUrl'] == lang, str(len(r['source'])))
        r = await ev(JS_STEPS, {'steps': ['Alles mischen und backen, bis es fertig ist.'], 'rec': {'source': 'Quelle: Tante Marta, siehe www.marta.ch/kuchen. Danke für alles!'}})
        check('Quelle mit Satz: Satz bleibt vollstaendig, URL ohne Schlusspunkt erkannt', r['source'] == 'Quelle: Tante Marta, siehe www.marta.ch/kuchen. Danke für alles!' and r['sourceUrl'] == 'https://www.marta.ch/kuchen', str(r))
        r = await ev(JS_STEPS, {'steps': ['Alles mischen und backen, bis es fertig ist.'], 'rec': {'source': 'Oma Rosa, Version 1.5 vom Sonntag'}})
        check('Keine URL erfunden (Zahl mit Punkt ist keine Adresse)', r['sourceUrl'] == '', str(r))
        check('pdfClassifyStepText bleibt fuer Kochmodus und Rezeptpruefung global', await ev("typeof pdfClassifyStepText === 'function' && pdfClassifyStepText('Tipp: x') === 'tip' && pdfClassifyStepText('Mehl sieben') === 'step'"))

        # 3) Kategorie: Ursache Manti/Sloppy Joe und Kapitel
        cls = await ev("""(fx) => fx.filter(r => r.id === 'fx_manti' || r.id === 'fx_sloppy').map(r => ({ id: r.id, dish: classifyMealAndDish(Object.assign({}, r, { tags: [] })).map(c => c.id) }))""", FX)
        check('Klassifikation: Gruppenueberschrift "rote Butter-Sauce" und Zutat "Big-Mac-Sauce" machen kein "Sauce / Dip" mehr', all('sauce' not in x['dish'] for x in cls), str(cls))
        title = await ev("() => [classifyMealAndDish({ title: 'Rote Sauce', ingredients: [], steps: [] }).map(c => c.id), classifyMealAndDish({ title: 'Pesto Rosso', ingredients: [], steps: [] }).map(c => c.id)]")
        check('Klassifikation: Titel "Rote Sauce" und "Pesto" bleiben Sauce / Dip', 'sauce' in title[0] and 'sauce' in title[1], str(title))
        r = await ev(JS_STEPS, {'steps': ['Alles mischen und backen, bis es fertig ist.'], 'rec': {'categoryTags': ['sauce', 'dinner'], 'tags': ['Türkisch']}})
        check('Kategorie ohne Kapitel: erste gewaehlte Kategorie des Nutzers, Art "Gerichtsart"', r['cat'] == 'Sauce / Dip' and r['catKind'] == 'dish' and r['catAll'] == ['Sauce / Dip', 'Abendessen', 'Türkisch'], str(r['cat']) + str(r['catAll']))
        r = await ev(JS_STEPS, {'steps': ['Alles mischen und backen, bis es fertig ist.'], 'rec': {'categoryTags': ['sauce', 'dinner']}, 'opts': {'chapter': 'Hauptgänge'}})
        check('Kategorie im Kochbuch: Kapitel des Nutzers (wie im Inhaltsverzeichnis), Gerichtsart bleibt in categoryAll', r['cat'] == 'Hauptgänge' and r['catKind'] == 'chapter' and 'Sauce / Dip' in r['catAll'] and r['unchanged'], str(r['cat']))
        ch = await ev("""() => { const cfg = { chapters: [{ id: 'c1', name: ' Hauptgänge ' }, { id: 'c2', name: 'Dessert' }], items: [{ recipeId: 'a', chapterId: 'c1' }, { recipeId: 'b', chapterId: '' }, { recipeId: 'c', chapterId: 'zz' }, { recipeId: 'd', chapterId: 'c2' }] };
          return ['a', 'b', 'c', 'd', 'nope'].map(id => pdfChapterNameFor(cfg, id)).concat([pdfChapterNameFor(null, 'a')]); }""")
        check('pdfChapterNameFor: Kapitelname aus der Kochbuch-Konfiguration, sonst leer', ch == ['Hauptgänge', '', '', 'Dessert', '', ''], str(ch))

        # 4) Portionen / Stueck
        r = await ev(JS_STEPS, {'steps': ['Aus dem Teig etwa 20 Kugeln formen und backen.'], 'rec': {'servings': 4}})
        check('Portionen: 4 Portionen, Anleitung nennt etwa 20 Kugeln -> nur Widerspruch melden', r['servings']['kind'] == 'portions' and r['servings']['value'] == 4 and r['servings']['label'] == '4 Portionen' and '4 Portionen' in r['servings']['conflict'] and '20 Kugeln' in r['servings']['conflict'] and r['servings']['conflict'] in r['warnings'], str(r['servings']))
        r = await ev(JS_STEPS, {'steps': ['Teig in 3 Stück schneiden und 20 Minuten backen, bis er gar ist.'], 'rec': {'servings': 4}})
        check('Kein Widerspruch bei beliebiger Zahl im Text (ohne "ca.", "etwa", "ergibt")', r['servings']['conflict'] == '' and r['warnings'] == [], str(r['servings']))
        r = await ev(JS_STEPS, {'steps': ['Das ergibt ca. 20 Stück.'], 'rec': {'servings': 20, 'servingMode': 'pieces', 'yieldLabel': 'Cookies'}})
        check('Stueck aus dem Datenmodell: kind pieces, Bezeichnung der Ausbeute, kein Widerspruch bei gleicher Zahl', r['servings']['kind'] == 'pieces' and r['servings']['label'] == '20 Cookies' and r['servings']['conflict'] == '', str(r['servings']))
        r = await ev(JS_STEPS, {'steps': ['Alles mischen und backen, bis es fertig ist.'], 'rec': {'servings': 0}})
        check('Unbekannte Ausbeute: kind unknown, keine erfundene Zahl, Hinweis fuer die Vorschau', r['servings']['kind'] == 'unknown' and r['servings']['value'] is None and r['servings']['label'] == '' and any('wie viel' in w for w in r['warnings']), str(r))
        r = await ev(JS_STEPS, {'steps': ['Alles mischen und backen, bis es fertig ist.'], 'rec': {'servings': 1}})
        check('1 Portion (Einzahl)', r['servings']['label'] == '1 Portion', str(r['servings']))
        facts = await ev("(fx) => { const r = Object.assign(emptyRecipe(), fx.find(x => x.id === 'fx_cookies')); const m = pdfBuildModel(r, null); return m.facts.map(f => f.label + '=' + f.value); }", FX)
        check('Fakten (Portionen, Zeit) bleiben wie gespeichert, nichts umgerechnet', facts[0] == 'Portionen=4', str(facts))

        # 5) Naehrwerte im Modell
        nut = await ev("""() => { const base = { sourceDataVersions: null, rangeUsed: false, needsServings: false, nutrientsPerPortion: { energyKcal: 523.7, protein: 12.345, fat: null, sodium: 842.4, iodide: 12.34, vitaminB12: 0.25, salt: 0, carbohydrates: 61.04 }, nutrientsTotal: { energyKcal: 2095 } };
          const rec = { id: 'n', title: 'T', servings: 4, ingredients: [{ amount: '1', unit: 'g', name: 'X' }], steps: [{ text: 'Alles mischen und backen, bis es fertig ist.' }] };
          const v = (m, k) => m.nutritionView.find(x => x.key === k);
          const m1 = pdfBuildModel(rec, base);
          const m2 = pdfBuildModel(Object.assign({}, rec, { servingMode: 'pieces', yieldLabel: 'Cookies' }), base);
          const m3 = pdfBuildModel(rec, Object.assign({}, base, { needsServings: true }));
          const m4 = pdfBuildModel(rec, null);
          const m5 = pdfBuildModel(Object.assign({}, rec, { steps: [{ text: 'Aus dem Teig etwa 20 Kugeln formen und backen.' }] }), base);
          const m6 = pdfBuildModel(rec, Object.assign({}, base, { rangeUsed: true, nutrientsPerPortion: { energyKcal: null }, nutrientsPerPortionRange: { energyKcal: { min: 120.2, max: 170.9 } } }));
          return { kcal: v(m1, 'energyKcal'), prot: v(m1, 'protein'), fat: v(m1, 'fat'), na: v(m1, 'sodium'), jod: v(m1, 'iodide'), b12: v(m1, 'vitaminB12'), salt: v(m1, 'salt'), kh: v(m1, 'carbohydrates'), vitK: v(m1, 'vitaminK'),
            b1: [m1.nutritionBasis, m1.nutritionBasisLabel], b2: [m2.nutritionBasis, m2.nutritionBasisLabel], b3: [m3.nutritionBasis, m3.nutritionBasisLabel], m3kcal: v(m3, 'energyKcal'), b4: [m4.nutritionBasis, m4.nutritionView.length, m4.nutritionNote],
            note1: m1.nutritionNote, note3: m3.nutritionNote, note5: m5.nutritionNote, b5: m5.nutritionBasis, range: v(m6, 'energyKcal').text, same: m1.nutrition === base }; }""")
        check('kcal ganzzahlig (523,7 -> 524)', nut['kcal']['value'] == 524 and nut['kcal']['text'] == '524' and nut['kcal']['unit'] == 'kcal', str(nut['kcal']))
        check('Gramm mit hoechstens einer Nachkommastelle (12,345 -> 12,3; 61,04 -> 61)', nut['prot']['text'] == '12,3' and nut['kh']['text'] == '61', str((nut['prot'], nut['kh'])))
        check('mg ab 100 ganzzahlig (842), µg unter 100 mit einer Stelle (12,3 und 0,3)', nut['na']['text'] == '842' and nut['jod']['text'] == '12,3' and nut['b12']['text'] == '0,3', str((nut['na'], nut['jod'], nut['b12'])))
        check('Fehlende Werte sind null, nie 0; gemessene 0 bleibt 0', nut['fat']['value'] is None and nut['fat']['text'] is None and nut['vitK']['value'] is None and nut['salt']['value'] == 0, str((nut['fat'], nut['vitK'], nut['salt'])))
        check('Bezugsgroesse: pro Portion / pro Stueck / gesamt (Ausbeute fehlt) / keine ohne Ergebnis', nut['b1'] == ['portion', 'pro Portion'] and nut['b2'] == ['piece', 'pro Stück'] and nut['b3'] == ['total', 'für das gesamte Rezept'] and nut['b4'] == [None, 0, ''], str((nut['b1'], nut['b2'], nut['b3'], nut['b4'])))
        check('Ausbeute fehlt: Gesamtwerte statt Portionswerte', nut['m3kcal']['value'] == 2095, str(nut['m3kcal']))
        check('Schaetzhinweis kurz; bei Portions-/Stueck-Widerspruch klar "pro Portion, nicht pro Stueck", Werte nicht umgerechnet', nut['note1'].startswith('Geschätzte Werte') and len(nut['note1']) < 80 and 'nicht pro Stück' in nut['note5'] and nut['b5'] == 'portion' and 'gesamte Rezept' in nut['note3'], str((nut['note1'], nut['note5'])))
        check('Spanne bei Mengenbereich als Text, Original-Ergebnis unveraendert im Modell', nut['range'] == '120–171' and nut['same'], nut['range'])

        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await b.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
