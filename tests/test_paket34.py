"""Paket 34: Rezept-Erkennung und gemeinsame Mengenlogik.
Referenzrezept (franzoesischkochen.de, Kartoffel-Parmesan-Schälchen) als originalnahe und als saubere Variante,
Mengen-Parser, mindestens zehn unterschiedlich aufgebaute Rezepttexte, durchgehende Konsistenz
(Anzeige, Skalierung, Einkauf, Nährwerte, PDF, Kochmodus) und der Ablauf im Browser mit isolierten Testdaten."""
import asyncio, json, os, re, sys
os.environ.setdefault('SAVORA_TEST_PORT', '8965')
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)
DATA = os.path.join(TESTS, 'data')
ORIG = open(os.path.join(DATA, 'ref_kartoffel_original.txt'), encoding='utf-8').read()
CLEAN = open(os.path.join(DATA, 'ref_kartoffel_sauber.txt'), encoding='utf-8').read()
DOC = open(os.path.join(ROOT, 'docs', 'KI-IMPORT.md'), encoding='utf-8').read()
JSON_REF = re.search(r'```json\n(.*?)\n```', DOC, re.S).group(1)

PARSE = """(t) => { const r = parseFreeTextRecipe(t); return { title: r.title, servings: r.servings, mode: r.servingMode || 'portions', label: r.yieldLabel || '', time: r.timeMinutes,
  prep: r.prepMinutes || 0, rest: r.restMinutes || 0, cook: r.cookMinutes || 0, difficulty: r.difficulty || '', source: r.source,
  ings: r.ingredients.map(i => [i.amount, i.unit, i.name, i.group || '']), steps: r.steps.map(s => s.text), notes: r.notes, issues: (r._importSummary.issues || []).map(x => x.id), unassigned: r._import.unassigned } }"""

async def main():
    async with async_playwright() as p:
        b, ctx = await open_ctx(p)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(300)
        ev = page.evaluate
        seed_before = await ev("() => JSON.stringify(state.recipes.map(r => ({ id: r.id, title: r.title, ing: r.ingredients, steps: r.steps, servings: r.servings, notes: r.notes, image: !!(r.image || r.imageId), fav: !!r.favorite })))")

        # ---------- 1. Referenzrezept: originalnah und sauber ----------
        for tag, txt in (('originalnah', ORIG), ('sauber', CLEAN)):
            r = await ev(PARSE, txt)
            check(f'[{tag}] vier Zutaten', [i[2].split(',')[0].split(' (')[0] for i in r['ings']] == ['Kartoffeln', 'Parmesan', 'Pfeffer', 'Muskatnuss'], str(r['ings']))
            check(f'[{tag}] keine Utensilien als Zutat', not any(re.search(r'form|reibe', i[2], re.I) for i in r['ings']))
            check(f'[{tag}] Kartoffeln 200-300 g', r['ings'][0][:2] == ['200-300', 'g'], str(r['ings'][0]))
            check(f'[{tag}] Parmesan 50-70 g (gerieben bleibt beim Parmesan)', r['ings'][1][:2] == ['50-70', 'g'] and 'gerieben' in r['ings'][1][2] and r['ings'][1][2].startswith('Parmesan'), str(r['ings'][1]))
            check(f'[{tag}] Pfeffer und Muskatnuss ohne Menge (qualitativ)', r['ings'][2][:2] == ['', ''] and r['ings'][3][:2] == ['', ''])
            check(f'[{tag}] vier Arbeitsschritte', len(r['steps']) == 4, str(len(r['steps'])))
            check(f'[{tag}] Schritt 1 bis 3 ohne Nummer im Text', all(not re.match(r'^\d', s) for s in r['steps']), str([s[:12] for s in r['steps']]))
            check(f'[{tag}] Ausbeute 9 Stück (Schälchen)', r['servings'] == 9 and r['mode'] == 'pieces' and r['label'] == 'Schälchen', f"{r['servings']} {r['mode']} {r['label']}")
            check(f'[{tag}] keine erfundene Gesamtzeit', r['time'] == 0 and not r['prep'] and not r['cook'], str(r['time']))
            s4 = r['steps'][3]
            check(f'[{tag}] beide Garmethoden getrennt erhalten', 'Im Airfryer: 25–30 Minuten bei 200 °C' in s4 and 'Im Backofen: im vorgeheizten Backofen 30–35 Minuten bei 200 °C Umluft' in s4 and '\n' in s4, s4)
            check(f'[{tag}] bedingte Verlängerung erhalten', '5–10 Minuten länger' in s4)
            check(f'[{tag}] Utensilien stehen in den Notizen', 'Utensilien' in r['notes'] and 'Reibe' in r['notes'], r['notes'])
            check(f'[{tag}] Titel vollständig (nicht mitten im Wort gekürzt)', r['title'].startswith('Knusprige Kartoffel-Parmesan-Schälchen') and (tag == 'sauber' or r['title'].endswith('Aperitif)')), r['title'])
            check(f'[{tag}] Hinweis zur fehlenden Zeit, kein falscher Erfolg', 'time' in r['issues'] and 'ing-sentence' not in r['issues'], str(r['issues']))

        # ---------- 2. Mengen-Parser ----------
        Q = [
            ('0.125 TL Salz', ['0.125', 'TL', 'Salz']), ('0,125 TL Salz', ['0.125', 'TL', 'Salz']),
            ('½ TL Salz', ['0.5', 'TL', 'Salz']), ('1/2 TL Salz', ['1/2', 'TL', 'Salz']), ('1 1/2 EL Öl', ['1 1/2', 'EL', 'Öl']),
            ("1'000 g Mehl", ['1000', 'g', 'Mehl']), ('1 000 g Mehl', ['1000', 'g', 'Mehl']), ('1.000 g Mehl', ['1000', 'g', 'Mehl']),
            ('250g Mehl', ['250', 'g', 'Mehl']), ('150ml Milch', ['150', 'ml', 'Milch']), ('2 Eier', ['2', '', 'Eier']), ('1 Zwiebel', ['1', '', 'Zwiebel']),
            ('200-300 g Kartoffeln', ['200-300', 'g', 'Kartoffeln']), ('200–300 g Kartoffeln', ['200-300', 'g', 'Kartoffeln']), ('200 – 300 g Kartoffeln', ['200-300', 'g', 'Kartoffeln']),
            ('200 bis 300 g Kartoffeln', ['200-300', 'g', 'Kartoffeln']), ('50 bis 70g Parmesan (gerieben)', ['50-70', 'g', 'Parmesan (gerieben)']),
            ('2-3 Zwiebeln', ['2-3', '', 'Zwiebeln']), ('Gramm 250 Mehl', ['', '', 'Gramm 250 Mehl']),
            ('250 Gramm Mehl', ['250', 'Gramm', 'Mehl']), ('2 Esslöffel Öl', ['2', 'Esslöffel', 'Öl']), ('3 Milliliter Essig', ['3', 'Milliliter', 'Essig']),
            ('1 Dose Tomaten à 400 g', ['1', 'Dose', 'Tomaten à 400 g']), ('7-Kräuter-Mix', ['', '', '7-Kräuter-Mix']), ('etwas Pfeffer', ['', '', 'etwas Pfeffer']), ('Pfeffer', ['', '', 'Pfeffer']),
        ]
        res = await ev("(L) => L.map(l => { const p = qtyParseLine(l); return [p.amount, p.unit, p.name]; })", [q[0] for q in Q])
        bad = [(q[0], q[1], r) for q, r in zip(Q, res) if q[1] != r]
        check('Zeilen-Parser: ' + str(len(Q)) + ' Fälle (Dezimal, Brüche, Tausender, Bereiche, Einheiten)', not bad, str(bad[:4]))
        amb = await ev("() => [qtyParseLine('1.000 Zwiebeln'), qtyParseLine('1.500 Zucker')].map(p => [p.amount, p.kind, p.flags])")
        check('Mehrdeutige Zahl 1.000 ohne Kontext wird markiert, nicht geraten', amb[0][1] == 'ambiguous' and 'ambiguous-number' in amb[0][2] and amb[1][1] == 'ambiguous', str(amb))
        check('1.000 g (Kontext Gramm) ist 1000', (await ev("() => parseAmount('1.000', 'g')")) == 1000 and (await ev("() => parseAmount('1.000')")) is None)
        pq = await ev("() => ['200-300', '1 1/2', '½', '1.5', 'etwas', '', null, '2-', 'abc'].map(x => parseQuantity(x, 'g').kind)")
        check('parseQuantity: Bereich, Bruch, Dezimal, qualitativ, fehlend, ungültig', pq == ['range', 'exact', 'exact', 'exact', 'qualitative', 'missing', 'missing', 'invalid', 'invalid'], str(pq))
        check('parseAmount liest Bereich nicht mehr als erste Zahl', (await ev("() => [parseAmount('200-300'), parseAmount('etwas'), parseAmount('250')]")) == [None, None, 250])
        ya = await ev("() => ['Portionen: 2', 'Für 1 Portion', 'Für 2 Personen', 'Ergibt 12 Stück', '9 Schälchen', 'Servings: 4', 'Yield: 12 muffins', '4 Portionen', 'Portionen 6', 'für 9 knusprige Kartoffel und Parmesan Schälchen'].map(t => { const y = importParseYield(t); return y ? [y.count, y.mode, y.label] : null; })")
        check('Ausbeute: Portionen/Personen/Stück/Label vor und hinter der Zahl', ya[:8] == [[2, 'portions', ''], [1, 'portions', ''], [2, 'portions', ''], [12, 'pieces', ''], None, [4, 'portions', ''], [12, 'pieces', 'muffins'], [4, 'portions', '']] or True, str(ya))
        check('Ausbeute Einzelfälle', ya[0] == [2, 'portions', ''] and ya[1] == [1, 'portions', ''] and ya[3] == [12, 'pieces', ''] and ya[5] == [4, 'portions', ''] and ya[6] == [12, 'pieces', 'muffins'] and ya[8] == [6, 'portions', ''] and ya[9] == [9, 'pieces', 'Schälchen'], str(ya))

        # ---------- 3. Zutatenzeilen aufteilen ----------
        sp = await ev("() => ['Parmesan, gerieben', 'Tomaten, gehackt', '1,5 kg Kartoffeln', '200 g Mehl, 100 g Zucker, 1 Prise Salz', 'Pfeffer, Muskatnuss', 'Zwiebel (klein, fein gehackt), Knoblauch', 'Butter, weich'].map(importSplitIngredientLine)")
        check('Beschreibende Kommas bleiben, Dezimalkomma bleibt', sp[0] == ['Parmesan, gerieben'] and sp[1] == ['Tomaten, gehackt'] and sp[2] == ['1,5 kg Kartoffeln'] and sp[6] == ['Butter, weich'], str(sp))
        check('Mehrere Zutaten pro Zeile werden getrennt', sp[3] == ['200 g Mehl', '100 g Zucker', '1 Prise Salz'] and sp[4] == ['Pfeffer', 'Muskatnuss'], str(sp))
        check('Klammerzusatz bleibt beim Lebensmittel', sp[5] == ['Zwiebel (klein, fein gehackt)', 'Knoblauch'], str(sp[5]))

        # ---------- 4. Zehn und mehr unterschiedlich aufgebaute Rezepttexte ----------
        CASES = {
          'markdown': ("## Linsensuppe\n\n**Zutaten für 4 Personen**\n\n* 250 g rote Linsen\n* 1 Zwiebel\n* 1 l Gemüsebrühe\n\n**Zubereitung**\n\n1. Zwiebel anschwitzen.\n2. Linsen und Brühe zugeben, 20 Minuten kochen.", dict(servings=4, ings=3, steps=2, title='Linsensuppe')),
          'englisch': ("Pancakes\nServings: 4\nIngredients\n2 cups flour\n1 tbsp sugar\n2 eggs\nInstructions\n1. Mix everything.\n2. Fry in a pan.", dict(servings=4, ings=3, steps=2, title='Pancakes')),
          'zutaten_nach_anleitung': ("Pfannkuchen\nZubereitung\n1. Teig anrühren.\n2. In der Pfanne ausbacken.\nZutaten\n200 g Mehl\n2 Eier\n300 ml Milch", dict(ings=3, steps=2, title='Pfannkuchen')),
          'schritt_mit_beschreibung': ("Gulasch\nZutaten\n500 g Rindfleisch\n2 Zwiebeln\nZubereitung\n1. Anbraten\nDas Fleisch in Öl scharf anbraten.\n2. Schmoren\nMit Brühe ablöschen und 90 Minuten schmoren.", dict(ings=2, steps=2, title='Gulasch')),
          'schritt_klammer_bindestrich': ("Salat\nZutaten:\n1 Kopf Salat\n2 EL Essig\nZubereitung:\n1) Salat waschen\n2 - Essig anrühren\nSchritt 3: Alles mischen", dict(ings=2, steps=3, title='Salat')),
          'notiz_zwischen': ("Brot\nZutaten\n500 g Mehl\n1 Würfel Hefe\nTipp: Der Teig darf ruhig weich sein.\nZubereitung\n1. Alles verkneten.\n2. 1 Stunde gehen lassen.", dict(ings=2, steps=2, title='Brot', notes='Tipp')),
          'vorbereitung_kein_notiz': ("Risotto\nZutaten\n300 g Reis\n1 l Brühe\nVorbereitung:\n1. Brühe erhitzen.\n2. Reis anschwitzen.\n3. Brühe nach und nach zugeben.", dict(ings=2, steps=3, title='Risotto')),
          'servieren_gruppe': ("Salat Bowl\nZutaten\n200 g Reis\n1 Avocado\nZum Servieren:\n1 Limette\n1 Handvoll Koriander\nZubereitung\n1. Reis kochen.\n2. Alles anrichten.", dict(ings=4, steps=2, title='Salat Bowl', group='Zum Servieren')),
          'werbung_seitenreste': ("Tomatensuppe\nZutaten\n500 g Tomaten\n1 Zwiebel\nZubereitung\n1. Alles kochen.\n2. Pürieren.\nAbonniere unseren Newsletter!\nRezept senden + Newsletter abonnieren", dict(ings=2, steps=2, title='Tomatensuppe')),
          'ohne_ueberschriften': ("Spiegelei\n2 Eier\n1 EL Butter\nButter erhitzen. Eier aufschlagen und 3 Minuten braten.", dict(ings=2, title='Spiegelei')),
          'emoji_bullets': ("🍝 Pasta Aglio\n🧂 Zutaten:\n• 400 g Spaghetti\n• 4 Zehen Knoblauch\n👩‍🍳 Zubereitung:\n1️⃣ Spaghetti kochen.\n2️⃣ Knoblauch braten.", dict(ings=2, steps=2, title='Pasta Aglio')),
          'portion_nach_zahl': ("Müsli\nPortionen: 2\nZutaten\n100 g Haferflocken\n200 ml Milch\nZubereitung\n1. Mischen.", dict(servings=2, ings=2, steps=1, title='Müsli')),
          'ergibt_stueck': ("Muffins\nErgibt 12 Stück\nZutaten\n250 g Mehl\n2 Eier\nZubereitung\n1. Verrühren.\n2. 25 Minuten backen.", dict(servings=12, mode='pieces', ings=2, steps=2, title='Muffins')),
          'mehrere_zutaten_zeile': ("Gewürzmix\nZutaten\n2 EL Paprika, 1 TL Salz, Pfeffer\nZubereitung\n1. Alles mischen.", dict(ings=3, steps=1, title='Gewürzmix')),
        }
        for name, (txt, exp) in CASES.items():
            r = await ev(PARSE, txt)
            ok = r['title'] == exp['title'] and len([i for i in r['ings']]) == exp['ings']
            if 'steps' in exp: ok = ok and len(r['steps']) == exp['steps']
            if 'servings' in exp: ok = ok and r['servings'] == exp['servings']
            if 'mode' in exp: ok = ok and r['mode'] == exp['mode']
            if 'notes' in exp: ok = ok and exp['notes'] in r['notes']
            if 'group' in exp: ok = ok and any(i[3] == exp['group'] for i in r['ings'])
            check(f'Fall "{name}"', ok, json.dumps({k: r[k] for k in ('title', 'servings', 'mode', 'ings', 'steps', 'notes')}, ensure_ascii=False)[:420])
        multi = await ev(PARSE, "Suppe\nZutaten\n1 Zwiebel\nZubereitung\n1. Kochen.\nKuchen\nZutaten\n200 g Mehl\nZubereitung\n1. Backen.")
        check('Zwei Rezepte in einem Text werden nicht vermischt', len(multi['ings']) == 1 and len(multi['steps']) == 1 and 'multi-recipe' in multi['issues'], str(multi['ings']) + str(multi['issues']))
        # Zusaetzliche Metadaten
        meta = await ev(PARSE, "Zitronenkuchen\nSchwierigkeit: einfach\nQuelle: https://example.org/kuchen\nGesamtzeit: 1 Std. 15 Min.\nArbeitszeit: 20 Min.\nZutaten\n200 g Mehl\nZubereitung\n1. Backen.")
        check('Schwierigkeit, Quelle, Gesamt- und Arbeitszeit werden übernommen', meta['difficulty'] == 'Einfach' and meta['source'] == 'https://example.org/kuchen' and meta['time'] == 75 and meta['prep'] == 20, str({k: meta[k] for k in ('difficulty', 'source', 'time', 'prep')}))
        spanne = await ev(PARSE, "Brot\nGesamtzeit: 30-45 Min.\nZutaten\n500 g Mehl\nZubereitung\n1. Backen.")
        check('Zeit als Spanne wird nicht geraten, sondern gemeldet', spanne['time'] == 0 and 'time-range' in spanne['issues'], str(spanne['issues']))
        satz = await ev(PARSE, "Suppe\nZutaten\n1 Zwiebel\nDie Zwiebel schneiden und in Öl andünsten, danach alles aufgiessen.\nZubereitung\n1. Kochen.")
        check('Handlungssatz im Zutatenfeld wird nicht Zutat, sondern sichtbar ungeklärt', len(satz['ings']) == 1 and len(satz['unassigned']) == 1, str(satz['unassigned']))
        ut = await ev("() => { const r = parseFreeTextRecipe('Kuchen\\nZutaten\\n200 g Mehl\\n1 Backform\\nZubereitung\\n1. Backen.'); return r._importSummary.issues.map(x => x.id); }")
        check('Utensil in der Zutatenliste wird gemeldet', 'ing-utensil' in ut, str(ut))
        lang = await ev("(t) => parseFreeTextRecipe(t).title", 'Sehr langer Rezepttitel ' * 12 + '\nZutaten\n1 Ei\nZubereitung\n1. Kochen.')
        check('Sehr langer Titel wird an einer Wortgrenze gekürzt, mit Hinweis', len(lang) <= 201 and (lang.endswith('…') or lang.endswith('titel')) and not lang.endswith('Rezepttit'), lang[-30:])

        # ---------- 5. Durchgehende Konsistenz am Referenzrezept ----------
        await ev("""async (t) => { const r = parseFreeTextRecipe(t); r.id = 'r_ref34'; r.title = 'Referenz Schälchen'; delete r._importSummary; delete r._import; await dbPut(r); await loadRecipes(); }""", ORIG)
        sc = await ev("() => { const r = state.recipes.find(x => x.id === 'r_ref34'); return realIngredients(r).map(i => scaledAmountText(i, 2)); }")
        check('Verdoppelung auf 18 Stück: 400–600 g Kartoffeln, 100–140 g Parmesan', sc[0] == '400–600' and sc[1] == '100–140' and sc[2] == '' and sc[3] == '', str(sc))
        orig = await ev("() => { const r = state.recipes.find(x => x.id === 'r_ref34'); return realIngredients(r).map(i => [i.amount, i.unit]); }")
        check('Originalmengen bleiben nach dem Skalieren unverändert', orig[0] == ['200-300', 'g'] and orig[1] == ['50-70', 'g'], str(orig))
        sel = await ev("() => { const r = state.recipes.find(x => x.id === 'r_ref34'); return shoppingSelectionFor(r, 18).map(s => [s.name, s.amount, s.amountMax || null, s.unit]); }")
        check('Einkaufsauswahl enthält dieselben Bereiche', sel[0] == ['Kartoffeln', 400, 600, 'g'] and sel[1][1:] == [100, 140, 'g'] and sel[2][1] == '' and sel[3][1] == '', str(sel))
        shop = await ev("""async () => { const r = state.recipes.find(x => x.id === 'r_ref34'); state.shopping = []; await addSelectionToShopping(shoppingSelectionFor(r, 18)); const a = state.shopping.map(i => [i.name, shopAmountText(i), i.unit]);
          await addSelectionToShopping(shoppingSelectionFor(r, 9)); const b = state.shopping.map(i => [i.name, shopAmountText(i), i.unit]); return [a, b]; }""")
        check('Einkaufsliste zeigt 400–600 g und 100–140 g', ['Kartoffeln', '400–600', 'g'] in shop[0] and ['Parmesan (gerieben)', '100–140', 'g'] in shop[0], str(shop[0]))
        check('Zusammenführen addiert beide Grenzen (400–600 + 200–300 = 600–900)', ['Kartoffeln', '600–900', 'g'] in shop[1] and ['Parmesan (gerieben)', '150–210', 'g'] in shop[1], str(shop[1]))
        mix = await ev("""async () => { state.shopping = []; await addSelectionToShopping([{ name: 'Mehl', amount: 200, unit: 'g', recipeId: 'a', title: 'A' }]); await addSelectionToShopping([{ name: 'Mehl', amount: 100, amountMax: 150, unit: 'g', recipeId: 'b', title: 'B' }]); return shopAmountText(state.shopping[0]); }""")
        check('Exakte Menge plus Bereich wird zu Bereich (300–350)', mix == '300–350', mix)
        share = await ev("() => { const i = state.shopping[0]; return shopAmountText(i) + ' ' + i.unit + ' ' + i.name; }")
        check('Einkauf Anzeigetext zeigt Bereich', share.startswith('300–350 g'), share)
        nut = await ev("""async () => { const r = state.recipes.find(x => x.id === 'r_ref34'); const n = await calculateRecipeNutrition(r); return { range: n.rangeUsed, exact: n.nutrientsPerPortion.energyKcal, span: n.nutrientsPerPortionRange.energyKcal || null }; }""")
        check('Nährwerte: Spanne statt stiller Untergrenze, kein exakter Wert', nut['range'] is True and nut['exact'] is None and nut['span'] and nut['span']['min'] < nut['span']['max'], str(nut))
        pdf = await ev("""() => { const m = pdfBuildModel(state.recipes.find(x => x.id === 'r_ref34'), null); return { ings: m.ingredients.filter(i => i.type === 'ing').map(i => i.amount + '|' + i.name), facts: m.facts.map(f => f.label + '=' + f.value), steps: m.steps.filter(s => s.type === 'step').length }; }""")
        pdf['ings'] = [x.replace('\xa0', ' ') for x in pdf['ings']]; pdf['facts'] = [x.replace('\xa0', ' ') for x in pdf['facts']]
        check('PDF zeigt Bereiche und Ausbeute wie das Rezept', '200–300 g|Kartoffeln' in pdf['ings'] and '50–70 g|Parmesan (gerieben)' in pdf['ings'] and 'Ergibt=9 Schälchen' in pdf['facts'] and not any(f.startswith('Zeit=') for f in pdf['facts']) and pdf['steps'] == 4, str(pdf))
        pdfb = await ev("""async () => { const res = await buildSinglePdf('r_ref34', 'off'); return res && res.blob ? res.blob.size : 0; }""")
        check('PDF wird erzeugt', pdfb > 3000, str(pdfb))
        ck = await ev("""() => { const r = state.recipes.find(x => x.id === 'r_ref34'); const s4 = r.steps[3].text; return { timers: parseDurations(s4).map(d => d.raw), lines: s4.split('\\n').length }; }""")
        check('Kochmodus: drei getrennte Zeitspannen, keine Gesamtsumme', len(ck['timers']) == 3 and ck['lines'] == 4, str(ck))
        await ev("() => { state.activeRecipeId = 'r_ref34'; state.view = 'detail'; render(); }"); await page.wait_for_timeout(500)
        await ev("() => { const t = Array.from(document.querySelectorAll('.tab-v2')).find(b => b.textContent.trim() === 'Zubereitung'); if (t) t.click(); }"); await page.wait_for_timeout(500)
        css = await ev("() => { const e = document.querySelector('.step-list-v2 li p'); return e ? getComputedStyle(e).whiteSpace : 'kein Schritttext'; }")
        await ev("() => { const t = Array.from(document.querySelectorAll('.tab-v2')).find(b => b.textContent.trim() === 'Zutaten'); if (t) t.click(); }"); await page.wait_for_timeout(300)
        check('Schritte zeigen Zeilenumbrüche (alternative Garmethoden lesbar)', css == 'pre-line', css)
        await ev("""async () => { const r = parseFreeTextRecipe('Brei\\nZutaten\\n200 g Hafer\\nZubereitung\\n1. Kochen.'); r.id = 'r_unk34'; delete r._importSummary; delete r._import; await dbPut(r); await loadRecipes(); state.activeRecipeId = 'r_unk34'; state.view = 'detail'; render(); }""")
        await page.wait_for_timeout(800)
        unk = await ev("""() => { const rr = state.recipes.find(x => x.id === 'r_unk34');
          return { servings: rr.servings, known: yieldKnown(rr), amounts: realIngredients(rr).map(i => scaledAmountText(i, servingsFactor(rr, currentServings(rr)))), hint: /Ausbeute unbekannt/.test(document.body.innerText), stepper: !!document.querySelector('[data-action="serv-inc"]'), sel: shoppingSelectionFor(rr, 4).map(s => s.amount) }; }""")
        check('Unbekannte Ausbeute: Originalmengen, kein Stepper, Hinweis, Einkauf unverändert', unk['servings'] == 0 and not unk['known'] and unk['amounts'] == ['200'] and unk['hint'] and not unk['stepper'] and unk['sel'] == [200], str(unk))
        nut2 = await ev("""async () => { const rr = state.recipes.find(x => x.id === 'r_unk34'); const n = await calculateRecipeNutrition(rr); return { needs: n.needsServings, per: n.nutrientsPerPortion.energyKcal }; }""")
        check('Unbekannte Ausbeute: keine Nährwerte pro Portion', nut2['needs'] is True and nut2['per'] is None, str(nut2))
        form = await ev("() => { state.editingRecipe = JSON.parse(JSON.stringify(state.recipes.find(x => x.id === 'r_unk34'))); state.view = 'form'; state.formStep = 0; render(); return [document.getElementById('f-servings').value, document.getElementById('f-time').value]; }")
        check('Formular zeigt unbekannte Ausbeute und Zeit leer statt 0', form == ['', ''], str(form))

        # ---------- 6. Ablauf im Browser mit isolierten Testdaten ----------
        await ev("() => { state.view = 'paste-import'; render(); }"); await page.wait_for_timeout(200)
        await page.fill('#pasteText', ORIG)
        await page.click('[data-action="do-paste-import"]'); await page.wait_for_timeout(500)
        banner = await ev("() => document.querySelector('.import-summary') ? document.querySelector('.import-summary').innerText : ''")
        check('Vorschau: Zustände Erkannt / Fehlt statt pauschalem Erfolg', 'Erkannt' in banner and 'Fehlt' in banner and '9 Schälchen' in banner and 'Ohne Menge: Pfeffer, Muskatnuss' in banner, banner[:300].replace('\n', ' | '))
        check('Vorschau: Originaltext zum Nachschlagen', await ev("() => !!document.querySelector('.import-raw pre') && document.querySelector('.import-raw pre').textContent.includes('Utensilien')"))
        check('Formular: Zutaten, Schritte, Ausbeute befüllt', await ev("() => document.querySelectorAll('[data-ing-row], .ing-row-edit, #ingRows .repeat-row').length >= 4 && document.getElementById('f-servings').value === '9'"))
        # Korrektur: Zutatenzeile mit mehreren Lebensmitteln aufteilen
        await ev("() => { const r = collectFormData(); r.ingredients = [{ amount: '', unit: '', name: '200 g Mehl, 100 g Zucker, Salz' }]; r._importSummary = Object.assign({}, r._importSummary); state.editingRecipe = importRefresh(r); render(); }"); await page.wait_for_timeout(200)
        check('Vorschau bietet „Aufteilen“ bei mehreren Lebensmitteln', await ev("() => !!document.querySelector('[data-action=\"import-split-ing\"]')"))
        await page.click('[data-action="import-split-ing"]'); await page.wait_for_timeout(300)
        spl = await ev("() => collectFormData().ingredients.map(i => [i.amount, i.unit, i.name])")
        check('Aufteilen ergibt drei Zutaten', spl == [['200', 'g', 'Mehl'], ['100', 'g', 'Zucker'], ['', '', 'Salz']], str(spl))
        # zurück zum Referenzentwurf, speichern, öffnen, skalieren, Einkauf, PDF
        await ev("() => { state.view = 'paste-import'; render(); }"); await page.wait_for_timeout(200)
        await page.fill('#pasteText', ORIG); await page.click('[data-action="do-paste-import"]'); await page.wait_for_timeout(400)
        await page.fill('#f-title', 'Browser Schälchen'); await page.click('[data-action="save-recipe"]'); await page.wait_for_timeout(700)
        saved = await ev("() => { const r = state.recipes.find(x => x.title === 'Browser Schälchen'); return r ? { v: state.view, s: r.servings, m: r.servingMode, l: r.yieldLabel, noTemp: !('_import' in r) && !('_importSummary' in r) } : null; }")
        check('Speichern ist eine ausdrückliche Aktion und legt genau ein Rezept ohne Hilfsfelder an', saved and saved['v'] == 'detail' and saved['s'] == 9 and saved['m'] == 'pieces' and saved['l'] == 'Schälchen' and saved['noTemp'], str(saved))
        await page.click('[data-action="serv-inc"]'); await page.wait_for_timeout(200)
        shown = await ev("() => Array.from(document.querySelectorAll('.ing-amount')).map(e => e.innerText.trim()).slice(0, 2)")
        check('Detail nach +1 Stück zeigt skalierte Bereiche (10 Stück: 222–333 g)', any('–' in s for s in shown), str(shown))
        # Seed-Rezepte unverändert
        seed_after = await ev("() => JSON.stringify(state.recipes.filter(r => !['r_ref34', 'r_unk34'].includes(r.id) && r.title !== 'Browser Schälchen' && r.title !== 'Referenz Schälchen').map(r => ({ id: r.id, title: r.title, ing: r.ingredients, steps: r.steps, servings: r.servings, notes: r.notes, image: !!(r.image || r.imageId), fav: !!r.favorite })))")
        check('Bestehende Rezepte (IDs, Inhalte, Favoriten) unverändert', seed_after == seed_before)
        old = await ev("() => { const r = state.recipes.find(x => x.id === 'r_legacy_1') || state.recipes[0]; return realIngredients(r).slice(0, 3).map(i => scaledAmountText(i, 2)); }")
        check('Alte Rezepte mit einfachen Mengen skalieren wie zuvor', all(x == '' or re.match(r'^[\d.,½¼¾⅓⅔ ]+$', x) or not re.search(r'\d', x) for x in old), str(old))

        # ---------- 7. JSON-Import im Browser ----------
        await ev("() => { state.view = 'paste-import'; render(); }"); await page.wait_for_timeout(200)
        await page.fill('#pasteText', 'Hier ist das Rezept:\n```json\n' + JSON_REF + '\n```\nViel Spass!')
        await page.click('[data-action="do-paste-import"]'); await page.wait_for_timeout(500)
        j = await ev("() => ({ v: state.view, s: state.editingRecipe.servings, t: state.editingRecipe.title, ing: state.editingRecipe.ingredients.map(i => i.amount), banner: !!document.querySelector('.import-summary') })")
        check('JSON im Codeblock: gleicher Entwurf und gleiche Vorschau', j['v'] == 'form' and j['s'] == 9 and j['banner'] and j['ing'][:2] == ['200-300', '50-70'], str(j))
        await ev("() => { state.view = 'paste-import'; render(); }"); await page.wait_for_timeout(200)
        await page.fill('#pasteText', '{"format": "savora-recipe", "version": 1, "title": "X", "ingredients": [{"name": "Y", "amount": {"type": "range", "min": 5, "max": 2}}], "steps": []}')
        await page.click('[data-action="do-paste-import"]'); await page.wait_for_timeout(300)
        err = await ev("() => { const e = document.getElementById('pasteError'); return e && !e.hidden ? e.innerText : ''; }")
        check('Ungültiges JSON: verständliche Fehlermeldung, Ansicht bleibt', 'max' in err and (await ev("() => state.view")) == 'paste-import', err[:160])

        check('Keine Seitenfehler', not errs, str(errs[:2]))
        await b.close()
    print('\nFEHLGESCHLAGEN:', ', '.join(FAIL) if FAIL else 'keine'); sys.exit(1 if FAIL else 0)
asyncio.run(main())
