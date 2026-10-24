"""Text-Import: realistische Rezepttexte (Chefkoch, Instagram, WhatsApp, Schweizer Schreibweise, Gruppen) und Timer-Erkennung.
Danach (frueher test_nutrition_import.py): Naehrwerte nach dem Import, realistische Rezepttexte (Instagram, Chefkoch, WhatsApp, Schweiz, Englisch) werden ueber die Oberflaeche importiert und automatisch zugeordnet."""
import asyncio, json, sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

SAMPLES = {
'chefkoch': ("""Spaghetti Carbonara
Zutaten für 4 Portionen
400 g Spaghetti
150 g Speck, gewürfelt
4 Eigelb
1 Ei
80 g Parmesan, frisch gerieben
2 EL Olivenöl
Salz und Pfeffer
Zubereitung
Arbeitszeit: ca. 20 Min.
Die Spaghetti in reichlich Salzwasser 10 Minuten al dente kochen.
Speck im Öl knusprig braten.
Eigelb, Ei und Parmesan verrühren.
Nudeln abgiessen, mit Speck und Eiermasse mischen. Sofort servieren.""",
  dict(title='Spaghetti Carbonara', servings=4, time=20, ings=['400|g|Spaghetti', '150|g|Speck, gewürfelt', '4||Eigelb', '1||Ei', '80|g|Parmesan, frisch gerieben', '2|EL|Olivenöl', '||Salz und Pfeffer'], nsteps=4)),
'instagram': ("""🍋 Zitronen-Ricotta-Kuchen 🍋
Für 8 Stück ⏱ 45 Min
🥣 Zutaten:
• 250 g Ricotta
• 200 g Mehl
• 150 g Zucker
• 3 Eier
• 1 Zitrone (Saft & Abrieb)
• 1 Pck. Backpulver
👩‍🍳 So geht's:
1️⃣ Ofen auf 180 °C vorheizen.
2️⃣ Alles verrühren und in eine Form geben.
3️⃣ 35-40 Minuten backen.
Tipp: Mit Puderzucker bestäuben.
#kuchen #zitrone #backen""",
  dict(title='Zitronen-Ricotta-Kuchen', servings=8, time=45, mode='pieces', ings=['250|g|Ricotta', '200|g|Mehl', '150|g|Zucker', '3||Eier', '1||Zitrone (Saft & Abrieb)', '1|Pck|Backpulver'], nsteps=3, notes='Tipp: Mit Puderzucker bestäuben.', tags=['kuchen', 'zitrone', 'backen'])),
'whatsapp': ("""Mamas Kartoffelsuppe
Zutaten:
800g Kartoffeln
2 Zwiebeln
1 Karotte
1 l Gemüsebrühe
1 Bund Petersilie
etwas Muskat
Kartoffeln schälen und würfeln. Zwiebeln anbraten, Kartoffeln und Karotte dazu, mit Brühe aufgiessen und 25 Minuten kochen. Pürieren, würzen, Petersilie drüber.""",
  dict(title='Mamas Kartoffelsuppe', ings=['800|g|Kartoffeln', '2||Zwiebeln', '1||Karotte', '1|l|Gemüsebrühe', '1|Bund|Petersilie', '||etwas Muskat'], nsteps=3)),
'schweiz': ("""Rösti
Zutaten (4 Personen)
1 kg Kartoffeln, festkochend
2 EL Bratbutter
1 TL Salz
1 1/2 dl Milch
Zubereitung
1. Kartoffeln am Vortag im Salzwasser 20 Min. kochen.
2. Am nächsten Tag schälen und raffeln.
3. In der Bratbutter 15-20 Minuten braten, bis sie goldbraun sind.""",
  dict(title='Rösti', servings=4, ings=['1|kg|Kartoffeln, festkochend', '2|EL|Bratbutter', '1|TL|Salz', '1 1/2|dl|Milch'], nsteps=3)),
'gruppen': ("""Apfelstrudel
Teig:
250 g Mehl
1 Prise Salz
6 EL Wasser
Füllung:
1 kg Äpfel
100 g Zucker
1 TL Zimt
1. Teig kneten und 30 Minuten ruhen lassen.
2. Äpfel schälen, in Scheiben schneiden und mit Zucker und Zimt mischen.
3. Teig ausrollen, füllen, einrollen und 40 Min. bei 200 Grad backen.""",
  dict(title='Apfelstrudel', ings=['250|g|Mehl|Teig', '1|Prise|Salz|Teig', '6|EL|Wasser|Teig', '1|kg|Äpfel|Füllung', '100|g|Zucker|Füllung', '1|TL|Zimt|Füllung'], nsteps=3)),
'kurz': ("""Rührei
3 Eier
1 EL Butter
Salz
Eier verquirlen, in Butter stocken lassen.""", dict(title='Rührei', ings=['3||Eier', '1|EL|Butter', '||Salz'], nsteps=1)),
'englisch': ("""Pancakes
Ingredients
200 g flour
2 eggs
300 ml milk
Instructions
Mix everything.
Fry in a pan for 2 minutes per side.""", dict(title='Pancakes', ings=['200|g|flour', '2||eggs', '300|ml|milk'], nsteps=2)),
'emoji_liste': ("""Bowl mit Avocado
🥑 2 Avocados
🍅 250 g Kirschtomaten
🧂 1 Prise Salz
1. Alles klein schneiden und mischen.""", dict(title='Bowl mit Avocado', ings=['2||Avocados', '250|g|Kirschtomaten', '1|Prise|Salz'], nsteps=1)),
'kurzer_satz': ("""Pfannkuchen
200 g Mehl
2 Eier
Teig rühren und braten.""", dict(title='Pfannkuchen', ings=['200|g|Mehl', '2||Eier'], nsteps=1)),
'gesamtzeit': ("""Brot
Arbeitszeit ca. 20 Min.
Backzeit ca. 30 Min.
Gesamtzeit ca. 50 Min.
Zutaten für 12 Stück
500 g Mehl
1 Würfel Hefe
Zubereitung
Alles mischen und backen.""", dict(title='Brot', time=50, servings=12, mode='pieces', ings=['500|g|Mehl', '1|Würfel|Hefe'], nsteps=1)),
}
TIMERS = [
    ('10 Minuten kochen', [600]), ('10-12 Min. braten', [720]), ('1 Std. 30 Min. schmoren', [5400]), ('1 Stunde und 15 Minuten', [4500]),
    ('eine halbe Stunde ruhen', [1800]), ('eine Viertelstunde warten', [900]), ('anderthalb Stunden garen', [5400]), ('2 Stunden gehen lassen', [7200]),
    ('20 Sek. rühren', [20]), ('bei 180 Grad backen', []), ('5 Eier und 2 EL Öl', []), ('erst 5 Minuten, dann 10 Minuten', [300, 600]),
]
async def main():
    texts = json.load(open(_os.path.join(TESTS, 'data', 'import_texts.json'), encoding='utf-8'))
    phrases = [l.strip() for l in open(_os.path.join(TESTS, 'data', 'import_phrases.txt'), encoding='utf-8') if l.strip()]
    async with async_playwright() as p:
        browser, ctx = await open_ctx(p, 390, 844)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page)
        for name, (text, exp) in SAMPLES.items():
            r = await page.evaluate("(t) => { const r = parseFreeTextRecipe(t); return { title: r.title, servings: r.servings, mode: r.servingMode || 'portions', time: r.timeMinutes, ings: r.ingredients.map(i => [i.amount, i.unit, i.name].concat(i.group ? [i.group] : []).join('|')), steps: r.steps.map(s => s.text), notes: r.notes, tags: r.tags } }", text)
            ok = r['title'] == exp['title'] and r['ings'] == exp['ings'] and len(r['steps']) == exp['nsteps']
            if 'servings' in exp: ok = ok and r['servings'] == exp['servings']
            if 'time' in exp: ok = ok and r['time'] == exp['time']
            if 'mode' in exp: ok = ok and r['mode'] == exp['mode']
            if 'notes' in exp: ok = ok and r['notes'] == exp['notes']
            if 'tags' in exp: ok = ok and r['tags'] == exp['tags']
            check(f'Import "{name}"', ok, '' if ok else json.dumps(r, ensure_ascii=False)[:600])
        for text, exp in TIMERS:
            got = await page.evaluate("(t) => parseStepSegments(t).filter(s => s.type === 'timer').map(s => s.seconds)", text)
            check(f'Timer "{text}"', got == exp, str(got))
        ev = page.evaluate   # ab hier: Naehrwerte nach dem Import (frueher test_nutrition_import.py)
        # 1) Einzelne Zeilen wie beim Import: erkannt und berechenbar
        res = await ev("""async (lines) => { await ensureSwissDataSeeded(); const out = []; for (const line of lines) { const r = parseFreeTextRecipe('Test\\nZutaten\\n' + line + '\\nZubereitung\\nMischen und servieren, bis alles fertig ist.'); const raw = (r.ingredients || [])[0] || { amount: '', unit: '', name: '' }; const ing = Object.assign({}, raw, nutPrepareIngredient(raw)); const m = await matchIngredient(ing.name, []); const g = m.food ? resolveIngredientGrams(ing, m.food) : { grams: null }; const noAmt = (ing.amount === '' || ing.amount === null); out.push({ line, ok: m.status === 'matched' && (g.grams !== null || !!m.skipped || noAmt), food: m.food ? m.food.name : (m.skipped || null) }); } return out; }""", phrases)
        ok = sum(1 for r in res if r['ok'])
        check('Import-Zeilen: mindestens 97 % erkannt und berechenbar', ok / len(res) >= 0.97, f"{ok} von {len(res)}; offen: {[r['line'] for r in res if not r['ok']][:4]}")
        wrong = [(r['line'], r['food']) for r in res if ('olive oil' in r['line'].lower() and 'Olive,' in (r['food'] or '')) or ('eggs' in r['line'].lower() and 'Rührei' in (r['food'] or '')) or ('ground beef' in r['line'].lower() and 'Bolognese' in (r['food'] or '')) or ('Thon' in r['line'] and 'öl' == (r['food'] or '').lower()[-2:])]
        check('Keine Fehlzuordnung (olive oil, eggs, ground beef, Thon im Öl)', not wrong, str(wrong))
        # 2) Ganze Texte ueber die Oberflaeche importieren, speichern, Reiter Naehrwerte oeffnen
        for key, text in texts.items():
            await ev("() => { state.view = 'paste-import'; state.modal = null; render(); }"); await page.wait_for_selector('#pasteText')
            await page.fill('#pasteText', text)
            await page.evaluate("document.querySelector('[data-action=\"do-paste-import\"]').click()"); await page.wait_for_selector('#recipeForm', timeout=8000)
            await page.evaluate("document.querySelector('[data-action=\"save-recipe\"]').click()"); await page.wait_for_timeout(600)
            rid = await ev("state.recipes.slice().sort((a, b) => b.createdAt - a.createdAt)[0].id")
            await ev("(id) => { state.activeRecipeId = id; state.view = 'detail'; state.detailTab = 'nutrition'; state.modal = null; render(); }", rid)
            await page.wait_for_function("() => { const n = document.querySelector('[data-lazy-nutrition]'); return n && !n.classList.contains('nutrition-card-loading'); }", timeout=10000)
            txt = await ev("document.querySelector('#panel-nutrition').innerText")
            check(f'Import {key}: Nährwerte erscheinen automatisch und vollständig', 'kcal' in txt and 'Unvollständig' not in txt and 'Noch nicht berechnet' not in txt, txt.replace('\\n', ' ')[:140])
        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await browser.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
