"""Versionierter JSON-Import (recipe-json.js): Erkennung, Validierung, Abbildung auf den Entwurf."""
import asyncio, json, os, re, sys
os.environ.setdefault('SAVORA_TEST_PORT', '8964')
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

DOC = open(os.path.join(ROOT, 'docs', 'KI-IMPORT.md'), encoding='utf-8').read()
REF = json.loads(re.search(r'```json\n(.*?)\n```', DOC, re.S).group(1))   # Referenzrezept aus der Doku

def mod(**kw):
    d = json.loads(json.dumps(REF)); d.update(kw); return d

async def main():
    async with async_playwright() as p:
        b, ctx = await open_ctx(p)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page)
        async def run(x):
            return await page.evaluate("(x) => parseRecipeJson(x)", x)
        def msgs(res): return ' | '.join(e['message'] for e in res['errors'])

        # 1 Referenzrezept
        r = await run(REF); rc = r['recipe']
        check('1 Referenz ok', r['ok'] and not r['errors'], msgs(r))
        check('1 Titel', rc['title'] == 'Knusprige Kartoffel-Parmesan-Schälchen')
        check('1 Ausbeute 9 pieces Schälchen', (rc['servings'], rc['servingMode'], rc.get('yieldLabel')) == (9, 'pieces', 'Schälchen'), str((rc['servings'], rc['servingMode'], rc.get('yieldLabel'))))
        check('1 Gesamtzeit unbekannt = 0', rc['timeMinutes'] == 0, str(rc['timeMinutes']))
        ing = rc['ingredients']
        check('1 Kartoffeln 200-300 g', (ing[0]['amount'], ing[0]['unit'], ing[0]['name']) == ('200-300', 'g', 'Kartoffeln'), str(ing[0]))
        check('1 Parmesan 50-70 g (gerieben)', (ing[1]['amount'], ing[1]['name']) == ('50-70', 'Parmesan (gerieben)'), str(ing[1]))
        check('1 Pfeffer/Muskat ohne Menge', ing[2]['amount'] == '' and ing[3]['amount'] == '' and len(ing) == 4)
        check('1 vier Schritte', len(rc['steps']) == 4)
        check('1 Schritt 4 mit Varianten', rc['steps'][3]['text'].split('\n')[1:] == ['Im Airfryer: 25–30 Minuten bei 200 °C', 'Im Backofen: im vorgeheizten Backofen 30–35 Minuten bei 200 °C Umluft'], repr(rc['steps'][3]['text']))
        check('1 Hinweis in notes', '5–10 Minuten länger' in rc['notes'])
        check('1 Quelle als String', rc['source'].startswith('https://www.franzoesischkochen.de/knusprige-kartoffel-parmesan'), str(rc['source']))

        # 2 Codeblock mit Text drumherum + Erkennung
        txt = 'Klar, hier ist das Rezept:\n\n```json\n' + json.dumps(REF, ensure_ascii=False, indent=2) + '\n```\n\nViel Spass! {kein json}'
        r = await run(txt)
        check('2 Codeblock mit Umgebungstext', r['ok'] and r['recipe']['title'] == REF['title'], msgs(r))
        r = await run('Vorab: ' + json.dumps(REF, ensure_ascii=False) + ' Ende.')
        check('2 rohes JSON mit Text drumherum', r['ok'])
        check('2 looksLikeRecipeJson', await page.evaluate("(t) => [looksLikeRecipeJson(t), looksLikeRecipeJson('200 g Mehl\\n1 Ei\\nMischen'), looksLikeRecipeJson('{\"title\":\"x\",\"ingredients\":[]}')]", txt) == [True, False, True])
        check('2 extract ohne JSON = null', await page.evaluate("() => extractRecipeJson('nur Text')") is None)

        # 3 unbekannte Version
        r = await run(mod(version=2))
        check('3 unbekannte Version', not r['ok'] and r['recipe'] is None and 'Formatversion 2' in msgs(r) and 'versteht nur Version 1' in msgs(r), msgs(r))
        # 4 kaputtes JSON
        r = await run('```json\n{"format": "savora-recipe", "title": }\n```')
        check('4 kaputtes JSON', not r['ok'] and 'kein gültiges JSON' in msgs(r), msgs(r))
        r = await run('Hallo, kein JSON hier')
        check('4 gar kein JSON', not r['ok'] and 'kein gültiges JSON' in msgs(r))
        # 5 fehlender Titel
        d = mod(); del d['title']
        r = await run(d)
        check('5 Titel fehlt', not r['ok'] and any(e['path'] == 'title' for e in r['errors']), msgs(r))
        r = await run(mod(title='   '))
        check('5 Titel leer', not r['ok'] and 'leer' in msgs(r))
        # 6 range min>max
        d = mod(); d['ingredients'][0]['amount'] = {'type': 'range', 'min': 200, 'max': 150}
        r = await run(d)
        check('6 Bereich min>max', not r['ok'] and 'Zutat 1: Menge ist ein Bereich, aber max (150) ist kleiner als min (200)' in msgs(r), msgs(r))
        # 7 exact + range
        d = mod(); d['ingredients'][1]['amount'] = {'type': 'range', 'min': 1, 'max': 2, 'value': 3}
        r = await run(d)
        check('7 exakt und Bereich gleichzeitig', not r['ok'] and 'Zutat 2' in msgs(r) and 'exakten Wert' in msgs(r), msgs(r))
        # 8 falscher Typ
        d = mod(); d['ingredients'][2]['amount'] = {'type': 'exact', 'value': '250'}
        r = await run(d)
        check('8 value als String', not r['ok'] and 'Zutat 3' in msgs(r) and 'Text statt Zahl' in msgs(r), msgs(r))
        # 9 negative Zahl
        d = mod(); d['ingredients'][0]['amount'] = {'type': 'exact', 'value': -5}
        r = await run(d)
        check('9 negative Menge', not r['ok'] and 'negativ' in msgs(r), msgs(r))
        r = await run(mod(time={'totalMinutes': -1, 'activeMinutes': None, 'restMinutes': None, 'cookMinutes': None}))
        check('9 negative Zeit', not r['ok'] and 'time.totalMinutes' in [e['path'] for e in r['errors']])
        # 10 yield null
        r = await run(mod(**{'yield': None}))
        check('10 yield null: servings 0 (nicht 4)', r['ok'] and r['recipe']['servings'] == 0 and 'yieldLabel' not in r['recipe'], str(r['recipe'] and r['recipe']['servings']))
        r = await run(mod(**{'yield': {'count': 0, 'kind': 'pieces', 'label': None}}))
        check('10 yield.count 0 ungültig', not r['ok'])
        r = await run(mod(**{'yield': {'count': 4, 'kind': 'stuecke', 'label': None}}))
        check('10 yield.kind ungültig', not r['ok'] and 'yield.kind' in [e['path'] for e in r['errors']])
        # 11 Schwierigkeit / Quelle nur wenn gesetzt
        r = await run(mod(difficulty='mittel', source=None))
        check('11 Schwierigkeit gesetzt, Quelle null', r['ok'] and r['recipe']['difficulty'] == 'mittel' and r['recipe']['source'] is None)
        r = await run(mod(difficulty=None))
        check('11 Schwierigkeit null -> leer', r['recipe']['difficulty'] == '')
        r = await run(mod(difficulty='leicht'))
        check('11 Schwierigkeit ungültig', not r['ok'])
        # 12 keine fremden IDs
        r = await run(mod(id='x', createdAt=1, updatedAt=2, favorite=True, image='data:x', collections=['a']))
        rc = r['recipe']
        check('12 eigene id, keine Fremdfelder', r['ok'] and rc['id'] != 'x' and rc['createdAt'] != 1 and rc['updatedAt'] != 2 and rc['favorite'] is False and not rc.get('image') and 'collections' not in rc, str((rc['id'], rc['createdAt'])))
        # 13 Notizen
        r = await run(mod(notes='Eine Notiz'))
        check('13 Notizen als String', r['recipe']['notes'] == 'Eine Notiz')
        r = await run(mod(notes=['Eins', 'Zwei']))
        check('13 Notizen als Array', r['recipe']['notes'] == 'Eins\nZwei')
        # 14 Warnungen, unvollständig
        d = mod(steps=[]); r = await run(d)
        check('14 ohne Schritte: ok mit Warnung', r['ok'] and any(w['path'] == 'steps' for w in r['warnings']))
        r = await run(mod(time={'totalMinutes': 10, 'activeMinutes': None, 'restMinutes': None, 'cookMinutes': 30}))
        check('14 Gesamtzeit < Garzeit: Warnung', r['ok'] and any('kleiner als die Garzeit' in w['message'] for w in r['warnings']), str(r['warnings']))
        # 15 Sonstiges
        d = mod(); d['ingredients'][0].update({'optional': True, 'group': 'Teig', 'amount': {'type': 'qualitative', 'text': 'nach Geschmack'}})
        r = await run(d); i0 = r['recipe']['ingredients'][0]
        check('15 optional, Gruppe, qualitativ', (i0['name'], i0['group'], i0['amount']) == ('Kartoffeln (optional)', 'Teig', 'nach Geschmack'), str(i0))
        r = await run(mod(format='anderes'))
        check('15 falsches format', not r['ok'] and 'format' in [e['path'] for e in r['errors']])
        d = mod(); d['ingredients'][0]['amount'] = {'type': 'exact', 'value': 250}
        check('15 exakt 250', (await run(d))['recipe']['ingredients'][0]['amount'] == '250')
        check('Keine Seitenfehler', not errs, str(errs[:2]))
        await b.close()
    print('\nFEHLGESCHLAGEN:', ', '.join(FAIL) if FAIL else 'keine'); sys.exit(1 if FAIL else 0)
asyncio.run(main())
