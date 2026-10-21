"""0.87.0 Textaufbereitung fuer das PDF (pdf-model.js, Modellebene, schnell, ohne PDF-Erzeugung):
  5  NIE Rezept-Links oder Quellen-URLs: keine Quellzeile (source/sourceUrl leer), URLs und Markdown-Links aus Schritten,
     Hinweisen, Notizen und Zutaten entfernt, «Quelle: kookmutsjes.com» am Schrittende weg; Rezeptdaten unveraendert
  6  Schrittueberschrift auf eigener Zeile (auch ohne Zeilenumbruch nach dem Import) wird Ueberschrift
  7  Ueberschrift ohne eigene Schritte (Carbonara «Kombinieren», «Cremig vollenden») steht nicht allein
  8  Notizen: Absaetze, Zwischentitel und «Titel:» als noteParts
  9  Gedankenstrich mit festen Abstaenden («Zuschnitt –bitte» -> «Zuschnitt – bitte»)
  10 «Nahrungsfasern» (Begriff der App) statt «Ballaststoffe» in nutritionView und pdfNutrientLabel
  17 Gruppentitel «Zutaten» unter dem Kastentitel ausgeblendet, Mengen mit genau einem geschuetzten Leerzeichen
Grundlage: Hirnkost-Rezepte (tests/pdf_hirnkost_fixture.py) plus kleine Faelle. Einzelrezept und Kochbuch nutzen dasselbe Modell
(pdfBuildModel); zusaetzlich wird das HTML einer Rezeptseite (pvRecipePage) auf Links und Quellzeile geprueft."""
import asyncio, json, re, sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
from pdf_hirnkost_fixture import HIRNKOST_RECIPES
FAIL = []
NB = ' '
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

MODEL_JS = """(arg) => { const out = {};
  for (const f of arg.recipes) {
    const r = Object.assign(emptyRecipe(), JSON.parse(JSON.stringify(f))); Object.keys(r).filter(k => k.startsWith('_')).forEach(k => delete r[k]);
    const before = JSON.stringify(r);
    const m = pdfBuildModel(r, null, {});
    let html = '';
    for (const tpl of arg.tpls) { try { PDF_CTX.tpl = pdfTemplateById(tpl); html += pvRecipePage(m, r, null, { photo: 'none' }, 'off'); } catch (e) { html += 'FEHLER ' + e.message; } }
    out[r.id] = { m: JSON.parse(JSON.stringify(m)), unchanged: before === JSON.stringify(r), html };
  }
  return out; }"""

URL_RX = re.compile(r'https?://|www\.|\]\(|\b[a-z0-9-]+\.(?:ch|com|de|org)\b')

def model_texts(m):
    t = [s['text'] for s in m['steps']] + list(m['tips']) + [m['notes'], m['source'], m['sourceText'], m['sourceUrl'], m['sourceUrlText']]
    t += [p['title'] + ' ' + p['text'] for p in m.get('noteParts', [])]
    t += [str(i.get('name', '')) + ' ' + str(i.get('note', '')) + ' ' + str(i.get('raw', '')) for i in m['ingredients'] if i['type'] == 'ing']
    return '\n'.join(x for x in t if x)

KLEIN = [
    {'id': 'tx_links', 'title': 'Links überall', 'servings': 2,
     'ingredients': [{'amount': '200', 'unit': 'g', 'name': 'Mehl (siehe https://example.org/mehl)'}, {'amount': '15', 'unit': 'g', 'name': 'Honig'}],
     'steps': [{'text': 'Teig kneten, Anleitung unter [Video](https://youtu.be/abc) ansehen.'}, {'text': 'https://example.org/nur-ein-link'},
               {'text': 'Mehr dazu auf www.marta.ch/kuchen und dann backen.'}, {'text': 'Rezept nach www.bettybossi.ch/rezept/1, leicht angepasst.'}, {'text': 'Im Ofen backen. Quelle: Oma Erna'}],
     'notes': 'Tipp: siehe [https://a.ch/x](https://a.ch/x)\nQuelle: https://b.de/y\nEigene Notiz bleibt.',
     'source': {'title': 'Betty Bossi', 'url': 'https://www.bettybossi.ch/de/rezept?id=1'}},
    {'id': 'tx_headings', 'title': 'Überschriften', 'servings': 2, 'ingredients': [{'amount': '1', 'unit': 'kg', 'name': 'Kartoffeln'}],
     'steps': [{'text': 'Vorbereitung'}, {'text': 'Backen'}, {'text': 'Ofen heizen und alles backen.'},
               {'text': 'Butter einarbeiten Die Pfanne vom Herd nehmen. Die Butter vorsichtig dazugeben.'},
               {'text': 'Den Teig kneten und ruhen lassen.'}, {'text': 'Ofen auf 200 Grad vorheizen Die Form fetten und alles einfüllen.'},
               {'text': 'Abschmecken Mit Salz und Pfeffer würzen.'}]},
    {'id': 'tx_dash', 'title': 'Striche', 'servings': 2, 'ingredients': [{'amount': '1', 'unit': 'EL', 'name': 'Öl – kalt gepresst'}],
     'steps': [{'text': 'Gut verrühren –sonst klumpt es. Pfanne ab– sonst. 1–2 Minuten, 20–30 g, Ei-Käse, Ei- und Milch, bei -18 °C, gut - sonst.'}]},
]

async def main():
    rec = HIRNKOST_RECIPES + KLEIN
    async with async_playwright() as p:
        b, c = await open_ctx(p, 1000, 900); page = await c.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.wait_for_timeout(300)
        ev = page.evaluate
        tpls = await ev("() => (window.__TPLS || [window.__T0]).filter(Boolean)")
        res = await ev(MODEL_JS, {'recipes': rec, 'tpls': tpls})
        M = {k: v['m'] for k, v in res.items()}

        # --- 5 Links und Quellen ---
        for rid, v in res.items():
            txt = model_texts(v['m'])
            check(f'5 {rid}: keine URL/Markdown-Link/Quellzeile im Modell', not URL_RX.search(txt) and not re.search(r'(^|\n)\s*Quelle\s*:', txt, re.I), (URL_RX.search(txt) or re.search(r'Quelle.{0,40}', txt) or [''])[0])
            html = re.sub(r'<[^>]+>', ' ', v['html'])
            check(f'5 {rid}: Rezeptseite ({"/".join(tpls)}) ohne Link, ohne Quellzeile', 'pv-source' not in v['html'] and 'data-pdf-href' not in v['html'] and not URL_RX.search(html), (URL_RX.search(html) or [''])[0])
            check(f'5 {rid}: Rezeptdaten unveraendert', v['unchanged'])
        sl = M['hk_sloppy']
        check('5 Sloppy Joe: «Quelle: kookmutsjes.com» (nur Quelle als Schritt) faellt weg, 11 Schritte', [s['no'] for s in sl['steps'] if s['type'] == 'step'][-1] == 11 and not any('kookmutsjes' in s['text'] for s in sl['steps']), str(sl['steps'][-1]))
        steps_l = [s['text'] for s in M['tx_links']['steps'] if s['type'] == 'step']
        check('5 Markdown-Link mit Wort: Wort bleibt, Adresse weg', steps_l[0] == 'Teig kneten, Anleitung unter Video ansehen.', steps_l[0])
        check('5 Schritt nur aus Link faellt weg (Nummerierung ohne Luecke)', len(steps_l) == 4 and [s['no'] for s in M['tx_links']['steps'] if s['type'] == 'step'] == [1, 2, 3, 4], str(steps_l))
        check('5 «Rezept nach www…» am Satzanfang: Rest beginnt gross', steps_l[2] == 'Leicht angepasst.', steps_l[2])
        check('5 «Quelle: Oma Erna» am Schrittende weg, Satz bleibt', steps_l[-1] == 'Im Ofen backen.', steps_l[-1])
        check('5 «auf www…» mitten im Satz: Adresse und leere Beschriftung weg', steps_l[1] == 'Mehr dazu und dann backen.', steps_l[1])
        check('5 Notizen: Link- und Quellzeilen weg, eigene Notiz bleibt', M['tx_links']['notes'] == 'Eigene Notiz bleibt.', repr(M['tx_links']['notes']))
        ing = [i for i in M['tx_links']['ingredients'] if i['type'] == 'ing']
        check('5 Zutat: Adresse aus dem Namen entfernt', ing[0]['name'].startswith('Mehl') and 'example' not in ing[0]['name'] + ing[0]['note'], str(ing[0]))
        check('5 Quellenfelder leer (keine Quellzeile)', all(M['hk_bulgogi'][k] == '' for k in ('source', 'sourceText', 'sourceUrl', 'sourceUrlText')) and M['hk_kartoffelsalat']['sourceUrl'] == '', '')

        # --- 6 Schrittueberschriften ---
        k = M['hk_karamell']['steps']
        check('6 Karamellsauce: 6 Schritte, jeder mit eigener Ueberschrift', [s['type'] for s in k] == ['heading', 'step'] * 6 and k[0]['text'] == 'Weissen Zucker karamellisieren' and k[1]['text'].startswith('Den weissen Zucker'), str([s['text'][:25] for s in k]))
        h = M['tx_headings']['steps']
        ht = [(s['type'], s['text'][:30]) for s in h]
        check('6 Ohne Zeilenumbruch: «Butter einarbeiten Die Pfanne …» wird Ueberschrift + Schritt', ('heading', 'Butter einarbeiten') in ht and ('step', 'Die Pfanne vom Herd nehmen. Di') in ht, str(ht))
        check('6 Gewoehnlicher Satz bleibt Schritt (kein falscher Titel)', ('step', 'Den Teig kneten und ruhen lass') in ht and ('step', 'Ofen auf 200 Grad vorheizen Di') in ht, str(ht))
        check('6 Zeilentrenner U+2028 zaehlt wie Zeilenumbruch', ('heading', 'Abschmecken') in ht, str(ht))
        kt = M['hk_kartoffelsalat']['steps']
        check('6 Kartoffelsalat Schritt 6 (erste Zeile endet mit Punkt) bleibt ein Schritt', not any(s['type'] == 'heading' for s in kt), str([s['type'] for s in kt]))

        # --- 7 Ueberschrift ohne Schritte ---
        cb = M['hk_carbonara']['steps']
        heads = [s['text'] for s in cb if s['type'] == 'heading']
        check('7 Carbonara: «Kombinieren» und «Cremig vollenden» als eine Ueberschrift ueber Schritt 4', 'Kombinieren · Cremig vollenden' in heads and not any(cb[i]['type'] == 'heading' and cb[i + 1]['type'] == 'heading' for i in range(len(cb) - 1)), str(heads))
        check('7 Keine Ueberschrift ohne folgenden Schritt (alle Rezepte)', all(not (s['type'] == 'heading' and (i + 1 >= len(mm['steps']) or mm['steps'][i + 1]['type'] != 'step')) for mm in M.values() for i, s in enumerate(mm['steps'])), '')
        check('7 Zwei Zwischentitel hintereinander gehen nicht verloren', ('heading', 'Vorbereitung · Backen') in ht, str(ht))

        # --- 8 Notizen ---
        np_ = M['hk_bulgogi']['noteParts']
        check('8 Bulgogi: «Hinweise» als Zwischentitel, 5 «Titel:»-Absaetze', np_[0]['kind'] == 'heading' and np_[0]['title'] == 'Hinweise' and [x['kind'] for x in np_[1:]] == ['lead'] * 5 and np_[1]['title'] == 'Fleisch zu dick schneiden', json.dumps(np_[:2], ensure_ascii=False))
        kp = M['hk_karamell']['noteParts']
        check('8 Karamell: Zwischentitel, Leerzeile und Angaben («Kategorie: Saucen») erhalten', [x['title'] for x in kp if x['kind'] == 'heading'] == ['Hinweise', 'Allergene', 'Beschreibung'] and any(x['gap'] for x in kp) and any(x['kind'] == 'lead' and x['title'] == 'Kategorie' and x['text'] == 'Saucen' for x in kp), json.dumps([(x['kind'], x['title']) for x in kp], ensure_ascii=False))
        flat = await ev("() => pdfNoteParts('Hinweise\\nFleisch zu dick schneiden: Dünn schneiden, z. B. Hüfte: gut. Zu lange braten: Wird zäh.')")
        check('8 Titel mitten in langer Zeile nach Satzende wird eigener Absatz (nicht nach «z. B.»)', [x['title'] for x in flat] == ['Hinweise', 'Fleisch zu dick schneiden', 'Zu lange braten'], json.dumps(flat, ensure_ascii=False))
        check('8 Notiztext bleibt vollstaendig (notes mit Zeilenumbruechen)', M['hk_karamell']['notes'].count('\n') >= 10 and 'Abkühlzeit: 60 Minuten' in M['hk_karamell']['notes'], '')
        check('8 tipParts: «Haltbarkeit: …» mit Titel', any(t['title'] == 'Haltbarkeit' for t in M['hk_cookies']['tipParts']), str(M['hk_cookies']['tipParts'][:1]))

        # --- 9 Gedankenstriche ---
        bn = M['hk_bulgogi']['notes']; st4 = M['hk_bulgogi']['steps'][3]['text']
        check('9 Bulgogi: «Zuschnitt – bitte», «braten – sonst», «anbraten – ca.» mit festen Abstaenden', f'Zuschnitt{NB}–{NB}bitte' in bn and f'braten{NB}–{NB}sonst' in bn and f'anbraten{NB}–{NB}ca. 1–2' in st4, repr(st4[-40:]))
        d = M['tx_dash']['steps'][0]['text']
        check('9 Bereiche, Bindestriche und Minus bleiben; freistehender Bindestrich wird Gedankenstrich', d == f'Gut verrühren{NB}–{NB}sonst klumpt es. Pfanne ab{NB}–{NB}sonst. 1–2 Minuten, 20–30 g, Ei-Käse, Ei- und Milch, bei -18 °C, gut{NB}–{NB}sonst.', repr(d))
        di = [i for i in M['tx_dash']['ingredients'] if i['type'] == 'ing'][0]
        check('9 Auch in Zutaten', f'{NB}–{NB}' in di['name'] + di['note'], repr(di['name'] + '|' + di['note']))

        # --- 10 Naehrwert-Begriffe ---
        lab = await ev("""() => { const nut = { nutrientsPerPortion: { energyKcal: 500, protein: 20, carbohydrates: 50, fat: 20, fiber: 3, sugars: 5, saturatedFat: 4, salt: 1 }, sourceDataVersions: {}, confidence: 'medium', unresolvedCount: 0 };
          const m = pdfBuildModel(Object.assign(emptyRecipe(), { id: 'n', title: 'N', servings: 2, ingredients: [{ amount: '1', unit: 'g', name: 'X' }], steps: [{ text: 'Mischen.' }] }), nut);
          const v = Object.fromEntries(m.nutritionView.map(x => [x.key, x.label]));
          const app = Object.fromEntries(NUT_TABLE_ROWS.map(x => [x.key, x.label]));
          return { fiber: v.fiber, protein: v.protein, fn: pdfNutrientLabel('fiber'), same: NUT_TABLE_ROWS.every(x => v[x.key] === x.label), app }; }""")
        check('10 «Nahrungsfasern» wie in der App (nutritionView, pdfNutrientLabel)', lab['fiber'] == 'Nahrungsfasern' and lab['fn'] == 'Nahrungsfasern' and lab['protein'] == 'Eiweiss' and lab['same'], str(lab))

        # --- 17 Zutaten ---
        ks = M['hk_kartoffelsalat']['ingredients']
        groups = [(i['title'], i['show']) for i in ks if i['type'] == 'group']
        check('17 Kartoffelsalat: Gruppe «Zutaten» ohne Titel, «Garnitur» mit Titel', groups == [('Zutaten', False), ('Garnitur', True)], str(groups))
        mg = [i['title'] for i in M['hk_manti']['ingredients'] if i['type'] == 'group' and i['show']]
        check('17 Andere Gruppentitel bleiben (Manti 4 Gruppen)', len(mg) == 4, str(mg))
        amts = [i['amount'] for i in M['hk_sloppy']['ingredients'] if i['type'] == 'ing' and i['amount']]
        check('17 Mengen: genau ein geschuetztes Leerzeichen zwischen Zahl und Einheit (15 g, 100 g)', f'15{NB}g' in amts and f'100{NB}g' in amts and not any(re.search(r'\s{2,}', a) for a in amts), str([a.replace(NB, '~') for a in amts]))

        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await b.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
