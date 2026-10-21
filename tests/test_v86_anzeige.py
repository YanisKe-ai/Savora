"""v0.86 Nährwerte, Anzeige: Kurzzeile im Rezeptkopf, ruhige Tabelle im Reiter, Teilsumme bei teilweise erkannten
Zutaten, kein «0 von 0», einheitliche Rundung, «Gesamtes Rezept» folgt den Portionen, kein Detail-Dialog mehr.
Screenshots nur mit SAVORA_V86_SHOTS=<Ordner>."""
import asyncio, sys, os
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)
SHOTS = os.environ.get('SAVORA_V86_SHOTS')

KNOWN = [["200", "g", "Spaghetti"], ["2", "EL", "Olivenöl"], ["2", "Zehen", "Knoblauch"], ["1", "", "Zwiebel"], ["100", "ml", "Rahm"], ["20", "g", "Butter"],
         ["50", "g", "Mehl"], ["10", "g", "Zucker"], ["2", "dl", "Milch"], ["100", "g", "Reis"], ["300", "g", "Kartoffeln"]]
CASES = {
    'voll': dict(servings=2, ings=KNOWN[:3]),
    'teilweise': dict(servings=4, ings=KNOWN + [["30", "g", "Xyzzyfrucht"]]),
    'wenig': dict(servings=2, ings=[["200", "g", "Spaghetti"], ["50", "g", "Xyzzyfrucht"], ["80", "g", "Quorbelwurz"]]),
    'leer': dict(servings=2, ings=[]),
    'gesamt': dict(servings=1, servingMode='total', yieldLabel='Glas', ings=[["300", "g", "Zucker"], ["500", "g", "Erdbeeren"]]),
    'stueck': dict(servings=8, servingMode='pieces', yieldLabel='Stück', ings=[["200", "g", "Mehl"], ["100", "g", "Butter"], ["80", "g", "Zucker"]]),
    'bereich': dict(servings=2, ings=[["200-300", "g", "Spaghetti"], ["2", "EL", "Olivenöl"]]),
}
SETUP = """async (cases) => { await ensureSwissDataSeeded();
  for (const [k, c] of Object.entries(cases)) {
    const r = Object.assign(emptyRecipe(), { id: 'v86_' + k, title: 'Test ' + k, servings: c.servings, servingMode: c.servingMode || 'portions', yieldLabel: c.yieldLabel || '',
      ingredients: c.ings.map(a => ({ amount: a[0], unit: a[1], name: a[2] })), steps: [{ text: 'Alles mischen und servieren.' }], createdAt: Date.now(), updatedAt: Date.now() });
    await dbPut(r); state.recipes = state.recipes.filter(x => x.id !== r.id).concat([r]);
  } }"""
OPEN = """async (k) => { state.modal = null; state.activeRecipeId = 'v86_' + k; state.view = 'detail'; state.detailTab = 'nutrition'; render();
  const t0 = performance.now(); while (performance.now() - t0 < 8000) { const n = document.querySelector('[data-lazy-nutrition]'); if (n && !n.classList.contains('nutrition-card-loading') && !document.querySelector('.nut-line--pending')) break; await new Promise(r => setTimeout(r, 30)); }
  await new Promise(r => setTimeout(r, 60));
  const line = document.querySelector('.nut-line'); const p = document.querySelector('#panel-nutrition');
  return { line: line ? line.textContent.replace(/\\s+/g, ' ').trim() : null, lineH: line ? line.getBoundingClientRect().height : 0, panel: p ? p.innerText : '',
    rows: Array.from(document.querySelectorAll('#panel-nutrition .nut-table:not(.nut-table--extra) th[scope=row]')).map(t => t.textContent.trim()),
    caption: (document.querySelector('#panel-nutrition .nut-caption') || {}).textContent || '', band: !!document.querySelector('.estimate-note'), sw: document.documentElement.scrollWidth }; }"""

async def main():
    async with async_playwright() as p:
        b, c = await open_ctx(p, 390, 844); page = await c.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); ev = page.evaluate
        await ev(SETUP, CASES)
        # Rundung (Plan 6) mit lokaler Regel und Vertragsfunktion
        fm = await ev("""() => [['energyKcal', 520.6], ['protein', 24.4], ['protein', 5.38], ['fiber', 0.84], ['sugars', 0.04], ['salt', 0.456], ['salt', 2.37], ['fat', null], ['fat', 0]].map(([k, v]) => nutUiFormatLocal(v, k))""")
        check('Rundung: kcal ganz, g ab 10 ganz, sonst 1 Stelle, < 0,1, Salz < 1 g zwei Stellen, null bleibt null', fm == ['521', '24', '5,4', '0,8', '< 0,1', '0,46', '2,4', None, '0'], str(fm))
        rg = await ev("() => nutUiFormatRange(8.86, 10.5, 'protein')")
        check('Spanne gleich gerundet («8,9–11»)', rg == '8,9–11', rg)
        check('Detail-Dialog «Alle Nährwerte» ist entfernt', await ev("() => typeof nutritionDetailModal === 'undefined' && !document.querySelector('[data-action=nutrition-open-detail]')"))

        res = {}
        for k in CASES: res[k] = await ev(OPEN, k)
        v = res['voll']
        check('Voll: Kurzzeile «ca. … kcal · … Eiweiss · … Kohlenhydrate · … Fett pro Portion»', v['line'] and v['line'].startswith('ca. ') and 'kcal' in v['line'] and 'Eiweiss' in v['line'] and 'Kohlenhydrate' in v['line'] and 'Fett' in v['line'] and 'pro Portion' in v['line'], str(v['line']))
        lh = await ev("async () => { state.detailTab = 'ingredients'; render(); await hydrateNutritionCards(); await new Promise(r => setTimeout(r, 60)); const l = document.querySelector('.nut-line:not(.nut-line--pending)'); return l ? l.getBoundingClientRect().height : 0; }")
        check('Kurzzeile unter den Zutaten: Tippfläche mindestens 44 px', lh >= 44, str(lh))
        first = await ev("() => { state.activeRecipeId = 'v86_voll'; state.detailTab = 'ingredients'; render(); const e = document.querySelector('.ing-check'), l = document.querySelector('.nut-line'); return !!(e && l && l.getBoundingClientRect().top > e.getBoundingClientRect().bottom); }")
        check('Kurzzeile steht unter der Zutatenliste', first)
        check('Voll: Tabelle in LIV-Reihenfolge mit Überschrift', v['rows'] == ['Energie', 'Fett', 'davon gesättigte Fettsäuren', 'Kohlenhydrate', 'davon Zucker', 'Nahrungsfasern', 'Eiweiss', 'Salz'] and v['caption'] == 'Nährwerte pro Portion', str(v['rows']) + v['caption'])
        check('Voll: kein grünes Hinweisband, «Richtwerte» genau einmal, kein «geschätzt»', not v['band'] and v['panel'].count('Richtwerte') == 1 and 'eschätzt' not in v['panel'], v['panel'][:200])
        check('Voll: Energie in einer Zeile (kcal und kJ), keine Dopplung', v['panel'].count('Energie') == 1 and 'kJ' in v['panel'])
        check('Strich-Hinweis nur, wenn ein «–» sichtbar ist', ('–' in v['panel'].split('Aus den Zutaten')[0]) == ('nicht 0' in v['panel']), v['panel'][:300])
        t = res['teilweise']
        check('Teilweise: Kurzzeile mit «mind.»', t['line'] and t['line'].startswith('mind. ') and 'kcal' in t['line'], str(t['line']))
        check('Teilweise: Zahlen und Hinweis «Ohne Xyzzyfrucht gerechnet»', 'kcal' in t['panel'] and 'Ohne Xyzzyfrucht gerechnet' in t['panel'] and 'zu tief' in t['panel'] and 'Zutaten zuordnen' in t['panel'], t['panel'][:300])
        w = res['wenig']
        check('Zu wenig: keine Kurzzeile, keine Zahlen, Satz und Knopf', w['line'] is None and 'Zu wenige Zutaten erkannt' in w['panel'] and 'kcal' not in w['panel'] and 'Zutaten zuordnen' in w['panel'], w['panel'][:200])
        e = res['leer']
        check('Keine Zutaten: «Noch keine Zutaten», kein «0 von 0», keine Kurzzeile', 'Noch keine Zutaten' in e['panel'] and '0 von 0' not in e['panel'] and e['line'] is None, e['panel'][:200])
        g = res['gesamt']
        check('Gesamtertrag: Werte für das gesamte Rezept (1 Glas), keine Portion', 'für das gesamte Rezept' in g['caption'] and 'Glas' in g['caption'] and g['line'] and 'für das gesamte Rezept' in g['line'] and 'pro Portion' not in g['panel'], g['caption'] + ' | ' + str(g['line']))
        s = res['stueck']
        check('Stück: «pro Stück»', s['caption'] == 'Nährwerte pro Stück' and 'pro Stück' in (s['line'] or ''), s['caption'])
        r = res['bereich']
        check('Bereich: Spanne mit Strich, Hinweis auf Spannen', r['line'] and '–' in r['line'] and 'Ergebnis als Spanne' in r['panel'], str(r['line']))
        check('Kein seitliches Scrollen (390 px)', all(x['sw'] <= 390 for x in res.values()), str([x['sw'] for x in res.values()]))

        # Kein Layoutsprung: «Kochen starten» bleibt beim Nachladen der Kurzzeile an seinem Platz (leerer Zwischenspeicher)
        jump = await ev("""async () => { nutUiCacheClear(); state.detailTab = 'ingredients'; state.activeRecipeId = 'v86_teilweise'; state.view = 'detail'; render();
          const btn = () => document.querySelector('.cook-start-inline').getBoundingClientRect().top; const a = btn(); const pending = !!document.querySelector('.nut-line--pending');
          const t0 = performance.now(); while (document.querySelector('.nut-line--pending') && performance.now() - t0 < 8000) await new Promise(r => setTimeout(r, 20));
          return { a, b: btn(), pending, line: !!document.querySelector('.nut-line:not(.nut-line--pending)') }; }""")
        check('Kein Layoutsprung: Platz reserviert, Knopf bleibt stehen (Zeile unter den Zutaten)', jump['pending'] and jump['line'] and abs(jump['a'] - jump['b']) < 1, str(jump))
        sync = await ev("() => { render(); return !!document.querySelector('.nut-line:not(.nut-line--pending)'); }")
        check('Zweites Zeichnen: Kurzzeile sofort da (Zwischenspeicher)', sync)
        # Antippen öffnet den Reiter Nährwerte
        await page.click('.nut-line'); await page.wait_for_timeout(400)
        tab = await ev("() => ({ sel: document.getElementById('tab-nutrition').getAttribute('aria-selected'), vis: !document.getElementById('panel-nutrition').hidden, top: document.getElementById('panel-nutrition').getBoundingClientRect().top })")
        check('Kurzzeile antippen: Reiter Nährwerte aktiv und sichtbar', tab['sel'] == 'true' and tab['vis'] and 0 <= tab['top'] < 844, str(tab))

        # F6: «Gesamtes Rezept» folgt den eingestellten Portionen, pro Portion bleibt gleich
        f6 = await ev("""async () => { const id = 'v86_voll'; state.activeRecipeId = id; state.detailTab = 'nutrition'; state.servingsOverride[id] = 2; state.nutritionDetailMode = 'portion'; render(); await hydrateNutritionCards();
          const kcal = () => parseInt(document.querySelector('#panel-nutrition .nut-table td').textContent.replace(/\\D+/g, ' ').trim().split(' ')[0], 10);
          const p2 = kcal(); state.nutritionDetailMode = 'total'; render(); await hydrateNutritionCards(); const t2 = kcal(); const cap2 = document.querySelector('.nut-caption').textContent;
          state.servingsOverride[id] = 6; render(); await hydrateNutritionCards(); const t6 = kcal(); const cap6 = document.querySelector('.nut-caption').textContent;
          state.nutritionDetailMode = 'portion'; render(); await hydrateNutritionCards(); const p6 = kcal(); const open = !!document.querySelector('.nut-more[open]');
          delete state.servingsOverride[id]; return { p2, t2, t6, p6, cap2, cap6 }; }""")
        check('F6: Gesamt bei 6 statt 2 Portionen = dreifach, pro Portion gleich', abs(f6['t6'] - 3 * f6['t2']) <= 3 and f6['p2'] == f6['p6'] and '6 Portionen' in f6['cap6'], str(f6))
        await ev("() => { state.nutritionMoreOpen = false; render(); }"); await page.click('.nut-more > summary')
        await page.click('[data-action="nutrition-set-mode"][data-mode="total"]'); await page.wait_for_timeout(200)
        mo = await ev("() => ({ open: !!document.querySelector('.nut-more[open]'), cap: document.querySelector('.nut-caption').textContent })")
        check('Bezug umschalten: «Mehr Werte und Optionen» bleibt offen, Überschrift wechselt', mo['open'] and 'gesamte Rezept' in mo['cap'], str(mo))
        await ev("() => { state.nutritionDetailMode = 'portion'; state.nutritionMoreOpen = false; render(); }")

        # PDF: Teilsumme wird gedruckt, mit «mindestens» und «ohne … gerechnet»
        pdf = await ev("""async () => { const r = state.recipes.find(x => x.id === 'v86_teilweise'); const n = await pdfNutritionForExport(r); const w = await pdfNutritionForExport(state.recipes.find(x => x.id === 'v86_wenig'));
          pdfSetContext(pdfDefaultTemplateId(), '', '', true, false); const box = n ? pvNutritionBox(n, 'compact', false, 'pro Portion', '') : '';
          return { ok: !!n, few: w, box: box.replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ') }; }""")
        check('PDF: teilweise gedruckt mit «Ohne Xyzzyfrucht gerechnet», zu wenig nicht', pdf['ok'] and pdf['few'] is None and 'Ohne Xyzzyfrucht gerechnet' in pdf['box'] and ('mindestens' in pdf['box'] or 'mind.' in pdf['box']), pdf['box'][:240])

        if SHOTS:
            os.makedirs(SHOTS, exist_ok=True)
            for k in ('voll', 'teilweise', 'wenig'):
                await ev("(k) => { state.detailTab = 'nutrition'; state.activeRecipeId = 'v86_' + k; render(); window.scrollTo(0, 0); }", k); await ev("hydrateNutritionCards()"); await page.wait_for_timeout(250)
                await page.screenshot(path=f'{SHOTS}/handy-hell-{k}.png', full_page=True)
        # Einstellung aus: keine Kurzzeile, kein Reiter
        off = await ev("""() => { state.showNutrition = false; state.activeRecipeId = 'v86_voll'; render(); const o = { line: !!document.querySelector('.nut-line'), tab: !!document.getElementById('tab-nutrition') }; state.showNutrition = true; render(); return o; }""")
        check('Einstellung aus: keine Kurzzeile, kein Reiter', not off['line'] and not off['tab'], str(off))
        check('Keine JS-Fehler', not errs, str(errs[:3]))
        await c.close(); await b.close()

        if SHOTS:
            for (wv, hv, scheme, name, k) in ((390, 844, 'dark', 'handy-dunkel', 'voll'), (1440, 900, 'light', 'desktop-hell', 'voll')):
                b, c = await open_ctx(p, wv, hv); await c.add_init_script(f"try{{localStorage.setItem('savora-theme','{'dark' if scheme == 'dark' else 'light'}')}}catch(e){{}}")
                page = await c.new_page(); await page.emulate_media(color_scheme=scheme); await goto(page); ev = page.evaluate
                await ev(SETUP, CASES); await ev(OPEN, k); await page.wait_for_timeout(250)
                await page.screenshot(path=f'{SHOTS}/{name}-{k}.png', full_page=False)
                await c.close(); await b.close()
            # 200 % Schrift, Handy hell, teilweise
            b, c = await open_ctx(p, 390, 844); page = await c.new_page(); await goto(page); ev = page.evaluate
            await ev(SETUP, CASES); await ev("() => { document.documentElement.style.fontSize = '200%'; }"); await ev(OPEN, 'teilweise'); await page.wait_for_timeout(250)
            await page.screenshot(path=f'{SHOTS}/handy-hell-teilweise-schrift200.png', full_page=True)
            sw = await ev("document.documentElement.scrollWidth")
            check('200 % Schrift: kein seitliches Scrollen', sw <= 390, str(sw))
            await c.close(); await b.close()
    print('\nFEHLGESCHLAGEN:', FAIL if FAIL else 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
