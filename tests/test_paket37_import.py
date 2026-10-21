"""Paket 37: Text-Import des Testrezepts "Kartoffel-Parmesan-Körbchen" und gemeinsame Mengenanzeige.
Prüft Metadaten-Trennung (Ergibt, Vorbereitung, Backzeit, Quelle), keine erfundene Gesamtzeit, Teilzeiten in der Importzusammenfassung,
exakte Ausgangswerte (0.125 kg) mit Anzeige in g, Bereiche beim Skalieren, Einkaufsliste, PDF ohne interne Schlüssel und Mengenformate."""
import asyncio, json, os, re, sys
os.environ.setdefault('SAVORA_TEST_PORT', '8971')
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

TXT = """TEST – Kartoffel-Parmesan-Körbchen
Ergibt: 9 Stück
Vorbereitung: 15 Minuten
Backzeit: 25 Minuten
Zutaten:
500 g Kartoffeln
0.125 kg Parmesan
1–2 EL Olivenöl
Salz nach Geschmack
Zubereitung:
1. Kartoffeln schälen und fein reiben.
2. Mit Parmesan und Öl mischen und in neun Muffinformen drücken.
3. Bei 200 °C Ober-/Unterhitze 25 Minuten backen.
Quelle: Eigenes Testrezept für den App-Test"""
NB = ' '

async def main():
    async with async_playwright() as p:
        b, ctx = await open_ctx(p)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(300)
        ev = page.evaluate
        seed_before = await ev("() => JSON.stringify(state.recipes.map(r => ({ id: r.id, title: r.title, ing: r.ingredients, steps: r.steps, servings: r.servings, notes: r.notes })))")

        # ---------- 1. Entwurf aus dem Text ----------
        d = await ev("""(t) => { const r = parseFreeTextRecipe(t); return { title: r.title, servings: r.servings, mode: r.servingMode || 'portions', label: r.yieldLabel || '', time: r.timeMinutes,
          prep: r.prepMinutes || 0, rest: r.restMinutes || 0, cook: r.cookMinutes || 0, source: r.source, notes: r.notes, steps: r.steps.map(s => s.text),
          ings: r.ingredients.map(i => [i.amount, i.unit, i.name]), issues: r._importSummary.issues.map(x => x.id) }; }""", TXT)
        check('Titel exakt wie geschrieben', d['title'] == 'TEST – Kartoffel-Parmesan-Körbchen', d['title'])
        check('Ergibt 9 Stück: Modus Stück, nicht Portionen', d['servings'] == 9 and d['mode'] == 'pieces' and d['label'] == '', f"{d['servings']} {d['mode']}")
        check('Vorbereitung 15 und Backzeit 25 getrennt gespeichert', d['prep'] == 15 and d['cook'] == 25 and d['rest'] == 0, f"{d['prep']} {d['cook']}")
        check('Keine erfundene Gesamtzeit (nicht 40)', d['time'] == 0, str(d['time']))
        check('Genau drei Zubereitungsschritte, "15 Minuten" ist kein Schritt', len(d['steps']) == 3 and not any(s.strip() == '15 Minuten' for s in d['steps']), str(d['steps']))
        check('Schritt 3 ohne angehängte Quelle', d['steps'][2] == 'Bei 200 °C Ober-/Unterhitze 25 Minuten backen.', d['steps'][2])
        check('Quelle im Quellenfeld, nicht in Notizen oder Schritten', d['source'] == 'Eigenes Testrezept für den App-Test' and 'Quelle' not in d['notes'] and not any('Testrezept' in s for s in d['steps']), str(d['source']))
        check('Vier Zutaten, Metadaten nicht als Zutat', len(d['ings']) == 4 and not any(re.search(r'Ergibt|Backzeit|Vorbereitung|Quelle', i[2]) for i in d['ings']), str(d['ings']))
        check('0.125 kg bleibt exakt gespeichert', d['ings'][1] == ['0.125', 'kg', 'Parmesan'], str(d['ings'][1]))
        check('1-2 EL bleibt Bereich', d['ings'][2] == ['1-2', 'EL', 'Olivenöl'], str(d['ings'][2]))
        check('Salz nach Geschmack ohne erfundene Menge', d['ings'][3][0] == '' and d['ings'][3][1] == '' and d['ings'][3][2].startswith('Salz'), str(d['ings'][3]))

        # ---------- 2. Importvorschau über die Oberfläche ----------
        await ev("() => { state.view = 'paste-import'; render(); }"); await page.wait_for_timeout(200)
        await page.fill('#pasteText', TXT)
        await page.click('[data-action="do-paste-import"]'); await page.wait_for_timeout(500)
        banner = await ev("() => document.querySelector('.import-summary') ? document.querySelector('.import-summary').innerText : ''")
        flat = banner.replace('\n', ' | ')
        check('Vorschau: Teilzeiten getrennt, ohne Summe', 'Vorbereitung 15 Min.' in banner and 'Garen oder Backen 25 Min.' in banner and '40 Min' not in banner and 'nichts zusammengerechnet' in banner, flat[:400])
        check('Vorschau: Ausbeute 9 Stück und 3 Schritte', '9 Stück' in banner and '3 erkannt' in banner, flat[:400])
        check('Vorschau: keine Prozentwerte oder Erkennungssicherheit', '%' not in banner and not re.search(r'sicherheit|prozent', banner, re.I), flat[:200])
        form = await ev("() => ({ s: document.getElementById('f-servings').value, t: document.getElementById('f-title').value })")
        check('Formular: Ausbeute 9 und Titel übernommen', form['s'] == '9' and form['t'] == 'TEST – Kartoffel-Parmesan-Körbchen', str(form))
        await page.click('[data-action="save-recipe"]'); await page.wait_for_timeout(700)
        saved = await ev("""() => { const r = state.recipes.find(x => x.title === 'TEST – Kartoffel-Parmesan-Körbchen'); return r ? { id: r.id, prep: r.prepMinutes || 0, cook: r.cookMinutes || 0, time: r.timeMinutes || 0, src: r.source, steps: r.steps.length, ing: r.ingredients.map(i => [i.amount, i.unit]), cats: r.categoryTags } : null; }""")
        check('Gespeichert: Teilzeiten, Quelle, drei Schritte, Rohwerte', saved and saved['prep'] == 15 and saved['cook'] == 25 and saved['time'] == 0 and saved['src'] == 'Eigenes Testrezept für den App-Test' and saved['steps'] == 3 and saved['ing'][1] == ['0.125', 'kg'], str(saved))
        rid = saved['id']

        # ---------- 3. Rezeptansicht: Anzeige und Skalieren ----------
        await ev(f"() => {{ state.activeRecipeId = '{rid}'; state.view = 'detail'; render(); }}"); await page.wait_for_timeout(700)
        shown = await ev("() => Array.from(document.querySelectorAll('.ing-amount')).map(e => e.innerText.replace(/\\s+/g, ' ').trim())")
        check('Rezeptansicht: Parmesan 125 g (nicht 0.13 kg), 1–2 EL', '125 g' in shown and '1–2 EL' in shown and '500 g' in shown and not any('kg' in s for s in shown), str(shown))
        head = await ev("() => document.body.innerText")
        check('Rezeptansicht: Teilzeiten sichtbar, Quelle als Text', '15 Min. Vorbereitung' in head and '25 Min. Garen' in head and 'Eigenes Testrezept für den App-Test' in head, '')
        check('Rezeptansicht: Quelle ist kein kaputter Link', await ev("() => !Array.from(document.querySelectorAll('.source-line a')).some(a => !/^https?:/.test(a.getAttribute('href')))"))
        sc = await ev(f"() => {{ const r = state.recipes.find(x => x.id === '{rid}'); return realIngredients(r).map(i => scaledAmountLine(i, 2)); }}")
        check('Skalieren x2: 250 g Parmesan, 2–4 EL, 1000 g Kartoffeln', sc[1] == '250 g' and sc[2] == '2–4 EL' and sc[0] == '1000 g' and sc[3] == 'Salz nach Geschmack'.replace('Salz nach Geschmack', ''), str(sc))
        sc3 = await ev(f"() => {{ const r = state.recipes.find(x => x.id === '{rid}'); return scaledAmountLine(realIngredients(r)[1], 8); }}")
        check('Skalieren x8: 1 kg Parmesan bleibt als kg anzeigbar', sc3 in ('1000 g', '1 kg'), sc3)
        orig = await ev(f"() => state.recipes.find(x => x.id === '{rid}').ingredients.map(i => i.amount)")
        check('Originalwerte nach dem Skalieren unverändert', orig[:3] == ['500', '0.125', '1-2'], str(orig))

        # ---------- 4. Einkaufsliste ----------
        shop = await ev(f"""async () => {{ const r = state.recipes.find(x => x.id === '{rid}'); state.shopping = []; await addSelectionToShopping(shoppingSelectionFor(r, 9));
          const a = state.shopping.map(i => [i.name, shopAmountLine(i), i.amount, i.unit]);
          await addSelectionToShopping(shoppingSelectionFor(r, 9)); const b = state.shopping.map(i => [i.name, shopAmountLine(i)]); return [a, b]; }}""")
        parm = [x for x in shop[0] if x[0] == 'Parmesan'][0]
        check('Einkaufsliste: Parmesan als 125 g, Rohwert 0.125 kg', parm[1] == '125 g' and parm[2] == 0.125 and parm[3] == 'kg', str(parm))
        check('Einkaufsliste: Zusammenführen 250 g Parmesan, 2–4 EL', ['Parmesan', '250 g'] in shop[1] and ['Olivenöl', '2–4 EL'] in shop[1], str(shop[1]))
        await ev("() => { state.view = 'shopping'; render(); }"); await page.wait_for_timeout(500)
        shop_ui = await ev("() => document.body.innerText.replace(/\\s+/g, ' ')")
        check('Einkaufsansicht zeigt 250 g Parmesan, nicht 0.25 kg', '250 g' in shop_ui and not re.search(r'0[.,]\d+ kg', shop_ui), '')

        # ---------- 5. PDF ----------
        pdf = await ev(f"""() => {{ const r = state.recipes.find(x => x.id === '{rid}'); const m = pdfBuildModel(r, null); const html = pvRecipePage(m, r, null, {{ photo: 'none' }}, 'off');
          return {{ cat: m.category, ings: m.ingredients.filter(i => i.type === 'ing').map(i => i.amount + '|' + i.name), facts: m.facts.map(f => f.label + '=' + f.value), source: m.source, text: html.replace(/<[^>]+>/g, ' ') }}; }}""")
        ings = [x.replace(NB, ' ') for x in pdf['ings']]
        check('PDF: Kategorie auf Deutsch (Backen), kein Schlüssel "baking"', pdf['cat'] == 'Backen' and 'baking' not in pdf['text'], pdf['cat'])
        check('PDF: 125 g Parmesan, 1–2 EL, 500 g', '125 g|Parmesan' in ings and '1–2 EL|Olivenöl' in ings and '500 g|Kartoffeln' in ings, str(ings))
        check('PDF: Teilzeiten, keine Gesamtzeit; keine Quellzeile (v0.87 Nutzerregel, Quelle bleibt in den Daten)', any(f.startswith('Vorbereitung=') for f in pdf['facts']) and not any(f.startswith(('Zeit=', 'Gesamtzeit=')) for f in pdf['facts']) and pdf['source'] == '' and 'Eigenes Testrezept' not in pdf['text'], str(pdf['facts']))
        blob = await ev(f"""async () => {{ const res = await buildSinglePdf('{rid}', 'off'); return res && res.blob ? res.blob.size : 0; }}""")
        check('PDF wird erzeugt', blob > 3000, str(blob))

        # ---------- 6. Mengenformat: eine gemeinsame Funktion ----------
        F = await ev("""() => { const f = (a, u, k) => qtyDisplayLine(parseQuantity(a, u), u, k);
          return [f('0.125', 'kg'), f('0,125', 'kg'), f('0.5', 'l'), f('1', 'kg'), f('1.5', 'kg'), f('1/2', 'TL'), f('½', 'TL'), f('1 1/2', 'EL'), f('0.25-0.75', 'l'), f('1-2', 'EL'), f('etwas', ''), f('nach Belieben', 'g'), f('abc', ''), f('2', 'dl'), f('250', 'ml'), f('300', 'g')]; }""")
        exp = ['125 g', '125 g', '500 ml', '1 kg', '1 ½ kg', '½ TL', '½ TL', '1 ½ EL', '250–750 ml', '1–2 EL', 'etwas', 'nach Belieben g', 'abc', '2 dl', '250 ml', '300 g']
        check('Mengenformat: Dezimal, Komma, Brüche, Bereiche, kg/l unter 1 als g/ml', F == exp, str([(a, b) for a, b in zip(F, exp) if a != b]))
        gml = await ev("() => [qtyDisplayLine(parseQuantity('200', 'g'), 'g'), qtyDisplayLine(parseQuantity('200', 'ml'), 'ml'), shoppingFindMatch('Milch', 'ml') === null]")
        check('Gramm und Milliliter werden nicht gleichgesetzt', gml[0] == '200 g' and gml[1] == '200 ml', str(gml))
        mixed = await ev("""async () => { state.shopping = []; await addSelectionToShopping([{ name: 'Milch', amount: 200, unit: 'g', recipeId: 'a', title: 'A' }]); await addSelectionToShopping([{ name: 'Milch', amount: 200, unit: 'ml', recipeId: 'b', title: 'B' }]); return state.shopping.map(i => shopAmountLine(i)); }""")
        check('Einkauf: g und ml der gleichen Zutat bleiben getrennte Zeilen', mixed == ['200 g', '200 ml'], str(mixed))

        # ---------- 7. Bestand unverändert ----------
        seed_after = await ev(f"() => JSON.stringify(state.recipes.filter(r => r.id !== '{rid}').map(r => ({{ id: r.id, title: r.title, ing: r.ingredients, steps: r.steps, servings: r.servings, notes: r.notes }})))")
        check('Bestehende Rezepte unverändert (nicht neu geparst)', seed_after == seed_before)
        check('Keine Seitenfehler', not errs, str(errs[:2]))
        await b.close()
    print('\nFEHLGESCHLAGEN:', ', '.join(FAIL) if FAIL else 'keine'); sys.exit(1 if FAIL else 0)
asyncio.run(main())
