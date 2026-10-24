"""v90.2: Prompt für die KI im Textimport und fehlertoleranter JSON-Import.
1. Echte KI-Antworten auf den Prompt (tests/fixtures/ki/*.txt, 12 Rezepte aus CH, DE, EN und Social Media, je zwei KIs)
   laufen durch denselben Import wie der Knopf «Rezept-Entwurf erstellen»: alle gültig, Titel, Ausbeute, Zutaten, Gruppen und Schritte wie erwartet.
2. Typische KI-Ausrutscher (Zahlen als Text, Brüche, Bereiche als Text, Zutaten als Zeilen, Zeiten als «PT1H30M», Kommas zu viel) werden still korrigiert.
3. Oberfläche: Prompt-Kasten mit Anleitung, «Prompt kopieren» legt genau den Prompt in die Zwischenablage, «LINK NICHT LESBAR» gibt eine klare Meldung.
4. Prompt kurz (unter 2000 Zeichen) und identisch mit docs/KI-IMPORT.md."""
import asyncio, glob, json, os, re, sys
os.environ.setdefault('SAVORA_TEST_PORT', '8967')
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

FIX = os.path.join(ROOT, 'tests', 'fixtures', 'ki')
ERW = json.load(open(os.path.join(FIX, 'erwartet.json'), encoding='utf-8'))

JS_IMPORT = """(t) => {
  if (rjIsLinkUnreadable(t)) return { unreadable: true };
  const res = parseRecipeJson(t); const r = res.recipe;
  return { ok: res.ok, json: looksLikeRecipeJson(t), errors: res.errors.map(e => e.message),
    r: r ? { title: r.title, servings: r.servings, mode: r.servingMode, ings: r.ingredients.map(i => [i.group || '', i.amount, i.unit, i.name]),
      steps: r.steps.map(s => s.text), time: r.timeMinutes, source: r.source } : null };
}"""

async def main():
    async with async_playwright() as p:
        b, ctx = await open_ctx(p)
        await ctx.grant_permissions(['clipboard-read', 'clipboard-write'])
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page)
        ev = lambda js, arg=None: page.evaluate(js, arg) if arg is not None else page.evaluate(js)

        # ---------- 1. Echte KI-Antworten ----------
        dateien = sorted(glob.glob(os.path.join(FIX, '*.txt')))
        check('Prüfmaterial: mindestens 20 KI-Antworten', len(dateien) >= 20, str(len(dateien)))
        for f in dateien:
            name = os.path.basename(f); nr = name.split('-')[-1][:2]; e = ERW[nr]
            res = await ev(JS_IMPORT, open(f, encoding='utf-8').read())
            if e.get('unlesbar'):
                check(f'{name}: «LINK NICHT LESBAR» erkannt', res.get('unreadable') is True, str(res)[:200]); continue
            r = res.get('r') or {}
            check(f'{name}: als JSON erkannt und gültig', res.get('json') and res.get('ok'), ' | '.join(res.get('errors') or []))
            if not r: continue
            n = len(r['ings']); groups = set(i[0] for i in r['ings'] if i[0])
            check(f'{name}: Titel enthält «{e["titel"]}»', e['titel'].lower() in r['title'].lower(), r['title'])
            check(f'{name}: Ausbeute {e["anzahl"]} {e["art"]}', (r['servings'], r['mode']) == (e['anzahl'], e['art']), str((r['servings'], r['mode'])))
            check(f'{name}: {e["zutaten"][0]} bis {e["zutaten"][1]} Zutaten', e['zutaten'][0] <= n <= e['zutaten'][1], str(n))
            check(f'{name}: mindestens {e["schritte"]} Schritte', len(r['steps']) >= e['schritte'], str(len(r['steps'])))
            if e.get('gruppen'): check(f'{name}: Zutatengruppen vorhanden', len(groups) >= e['gruppen'], str(sorted(groups)))
            for wort, menge in (e.get('mengen') or {}).items():
                hit = [i for i in r['ings'] if wort.lower() in i[3].lower()]
                check(f'{name}: Menge {wort} = {menge}', bool(hit) and any(str(i[1]) == menge for i in hit), str(hit[:2]))
            check(f'{name}: keine leeren Zutatennamen oder Schritte', all(i[3].strip() for i in r['ings']) and all(s.strip() for s in r['steps']))
            if e.get('quelle'): check(f'{name}: Link als Quelle', (r['source'] or '').startswith(e['quelle']), str(r['source']))

        # ---------- 2. Typische Ausrutscher ----------
        base = {'format': 'savora-recipe', 'version': 1, 'title': 'Test', 'yield': {'count': 4, 'kind': 'portions', 'label': None},
                'time': None, 'difficulty': None, 'source': None, 'ingredients': [], 'steps': [{'text': 'Kochen.'}], 'notes': []}
        def ing(amount, unit='g', name='Mehl'): return {'group': None, 'name': name, 'amount': amount, 'unit': unit, 'note': None, 'optional': False}
        faelle = [
            ('Zahl als Text', ing({'type': 'exact', 'value': '250'}), '250'),
            ('Komma-Dezimal', ing({'type': 'exact', 'value': '0,5'}, 'TL'), '0.5'),
            ('Bruch ½', ing({'type': 'exact', 'value': '½'}, 'TL'), '0.5'),
            ('Bruch 1/4', ing({'type': 'exact', 'value': '1/4'}, 'cup'), '0.25'),
            ('Bereich als exakter Text', ing({'type': 'exact', 'value': '2-3'}, 'EL'), '2-3'),
            ('Menge als blosse Zahl', ing(200), '200'),
            ('Menge als Text', ing('2 bis 3', 'EL'), '2-3'),
            ('Bereich mit Text-Grenzen', ing({'type': 'range', 'min': '200', 'max': '300'}), '200-300'),
            ('Menge ohne type', ing({'value': 3}, None, 'Eier'), '3'),
            ('qualitativ', ing({'type': 'qualitative', 'text': 'eine Prise'}, None, 'Salz'), 'eine Prise'),
        ]
        for label, i, erwartet in faelle:
            d = json.loads(json.dumps(base)); d['ingredients'] = [i]
            res = await ev("(t) => { const r = parseRecipeJson(t); return { ok: r.ok, e: r.errors.map(x => x.message), a: r.recipe && r.recipe.ingredients[0].amount }; }", json.dumps(d))
            check(f'Ausrutscher {label}: Menge {erwartet}', res['ok'] and res['a'] == erwartet, str(res))
        d = json.loads(json.dumps(base)); del d['format']; del d['version']
        d.update({'yield': '6', 'difficulty': 'Leicht', 'time': {'totalMinutes': 'PT1H30M', 'activeMinutes': '20 Min.', 'restMinutes': '1 Std.', 'cookMinutes': 45.0},
                  'source': 'https://example.org/r', 'ingredients': ['250 g Mehl', '2 Eier', 'Salz'], 'steps': ['Mischen.', {'instruction': 'Backen.'}]})
        txt = 'Hier ist dein Rezept:\n```json\n' + json.dumps(d, ensure_ascii=False, indent=1).replace('"Salz"', '"Salz",', 1) + '\n```\nGuten Appetit!'
        res = await ev("(t) => { const r = parseRecipeJson(t); const x = r.recipe; return { ok: r.ok, e: r.errors.map(y => y.message), x: x && { s: x.servings, d: x.difficulty, t: x.timeMinutes, p: x.prepMinutes, rest: x.restMinutes, c: x.cookMinutes, src: x.source, ings: x.ingredients.map(i => [i.amount, i.unit, i.name]), steps: x.steps.map(s => s.text) } }; }", txt)
        x = res.get('x') or {}
        check('Ausrutscher gesammelt: ohne format/version, Text drumherum, Komma zu viel: gültig', res['ok'], ' | '.join(res['e']))
        check('Ausbeute «6» als Text', x.get('s') == 6, str(x.get('s')))
        check('Schwierigkeit «Leicht» wird einfach', x.get('d') == 'einfach', str(x.get('d')))
        check('Zeiten: PT1H30M = 90, «20 Min.» = 20, «1 Std.» = 60, 45.0 = 45', (x.get('t'), x.get('p'), x.get('rest'), x.get('c')) == (90, 20, 60, 45), str(x))
        check('Quelle als blosser Link', x.get('src') == 'https://example.org/r', str(x.get('src')))
        check('Zutaten als Zeilen: Menge, Einheit, Name getrennt', x.get('ings') and x['ings'][0] == ['250', 'g', 'Mehl'] and x['ings'][1][0] == '2' and 'Eier' in x['ings'][1][2] and x['ings'][2][2] == 'Salz', str(x.get('ings')))
        check('Schritte als Text und mit «instruction»', x.get('steps') == ['Mischen.', 'Backen.'], str(x.get('steps')))
        res = await ev("(t) => parseRecipeJson(t).ok", json.dumps(dict(base, format='anderes-format')))
        check('Fremdes Format bleibt abgelehnt', res is False)
        res = await ev("(t) => looksLikeRecipeJson(t)", 'Zutaten:\n200 g Mehl\n\nZubereitung:\n1. Backen.')
        check('Normaler Rezepttext läuft weiter über den Text-Import', res is False)

        # ---------- 3. Oberfläche ----------
        prompt = await ev("SAVORA_KI_PROMPT")
        await ev("() => openTextImport({})"); await page.wait_for_selector('.ki-prompt-box')
        box = await ev("() => { const b = document.querySelector('.ki-prompt-box'); const t = document.getElementById('pasteText'); return { text: b.innerText, steps: b.querySelectorAll('.ki-prompt-steps li').length, above: b.getBoundingClientRect().bottom <= t.getBoundingClientRect().top, btnH: document.querySelector('[data-action=\"copy-ki-prompt\"]').getBoundingClientRect().height, W: document.documentElement.scrollWidth, w: innerWidth }; }")
        check('Prompt-Kasten über dem Textfeld, drei Schritte, ChatGPT/Claude/Gemini genannt', box['above'] and box['steps'] == 3 and all(k in box['text'] for k in ['ChatGPT', 'Claude', 'Gemini', 'Prompt kopieren']), str(box)[:200])
        kh = await ev("() => ({ h: document.querySelector('.ki-prompt-box').getBoundingClientRect().height, closed: !document.querySelector('.ki-prompt-how').open, ta: document.getElementById('pasteText').getBoundingClientRect().top, H: innerHeight })")
        check('v91.1: Kasten kompakt (höchstens 190 px), Anleitung eingeklappt, Textfeld ohne Scrollen sichtbar', kh['h'] <= 190 and kh['closed'] and kh['ta'] < kh['H'] * 0.6, str(kh))
        check('Kopier-Knopf mindestens 44 px hoch, kein seitlicher Überlauf (390 px)', box['btnH'] >= 44 and box['W'] <= box['w'], str(box))
        await page.click('[data-action="copy-ki-prompt"]')
        await page.wait_for_function("document.getElementById('kiPromptHint').textContent.includes('kopiert')", timeout=5000)
        check('«Prompt kopieren» legt genau den Prompt in die Zwischenablage', await ev("navigator.clipboard.readText()") == prompt)
        await page.click('.ki-prompt-how > summary'); await page.click('.ki-prompt-details summary')
        check('«Prompt ansehen» zeigt den vollständigen Prompt', (await ev("document.getElementById('kiPromptText').innerText")).strip() == prompt.strip())
        await page.fill('#pasteText', 'LINK NICHT LESBAR')
        await page.click('[data-action="do-paste-import"]')
        await page.wait_for_selector('#pasteError:not([hidden])')
        msg = await ev("() => ({ t: document.getElementById('pasteError').innerText, view: state.view })")
        check('«LINK NICHT LESBAR»: klare Meldung, kein Rezept-Entwurf', 'nicht öffnen' in msg['t'] and msg['view'] == 'paste-import', str(msg))
        await page.fill('#pasteText', open(dateien[0], encoding='utf-8').read())
        await page.click('[data-action="do-paste-import"]'); await page.wait_for_function("state.view === 'form'")
        check('KI-Antwort eingefügt: Entwurf zum Prüfen geöffnet', await ev("state.editingRecipe && state.editingRecipe.ingredients.length > 3"))

        # ---------- 4. Prompt kurz und dokumentiert ----------
        check('Prompt unter 2000 Zeichen', len(prompt) < 2000, str(len(prompt)))
        doc = open(os.path.join(ROOT, 'docs', 'KI-IMPORT.md'), encoding='utf-8').read()
        m = re.search(r'## Prompt für die KI\n\n.*?```\n(.*?)\n```', doc, re.S)
        check('docs/KI-IMPORT.md enthält genau diesen Prompt', bool(m) and m.group(1).strip() == prompt.strip())
        check('Keine Seitenfehler', not errs, str(errs[:2]))
        await b.close()
    print('\nFEHLGESCHLAGEN:', ', '.join(FAIL) if FAIL else 'keine'); sys.exit(1 if FAIL else 0)
asyncio.run(main())
