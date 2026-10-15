"""v0.83.1 Planung: Eintrag bearbeiten im neuen Dialoggeruest, Einkauf «Zurueck zur Auswahl», Mahlzeiten ohne Wischen.
1 planEntryModal: Schliessen-Symbol (44 px), «Abbrechen», Escape, Fokus zurueck zum Ausloeser, Mahlzeit optional mit
  «Andere Mahlzeit» -> «Name der Mahlzeit», Menge mit Schrittweite des Ertrags (yieldStep/yieldShort), erst mit «Speichern».
  Datenmodell unveraendert ({ id, recipeId, meal, servings } bzw. { id, type, text, meal? }).
2 Vorschau «In den Einkauf übernehmen» nach «Aus Rezepten»: «Zurück zur Auswahl» stellt Rezepte, Mengen und Suche wieder her.
3 320/390/1280 px: «Andere Mahlzeit» ohne Wischen sichtbar, Dialog im Bild, kein Ueberlauf.
Isolierte Testrezepte (IDs r_v831_*), keine echten Daten."""
import asyncio, os, sys
os.environ.setdefault('SAVORA_TEST_PORT', '8873')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info if not cond else '')
    if not cond: FAIL.append(name)

OVERFLOW = "() => document.documentElement.scrollWidth <= window.innerWidth + 1"
SETUP = """async () => {
  const mk = (id, title, extra) => Object.assign(emptyRecipe(), { id, title, ingredients: [{ amount: '200', unit: 'g', name: 'Zucker' }, { amount: '1', unit: '', name: 'Zitrone' }], steps: [{ text: 'Kochen.' }] }, extra || {});
  const list = [
    mk('r_v831_fond', 'Rinderfond', { servingMode: 'total', servings: 500, yieldLabel: 'ml' }),
    mk('r_v831_zimt', 'Zimtschnecken', { servingMode: 'pieces', servings: 12, yieldLabel: 'Stück' }),
    mk('r_v831_suppe', 'Linsensuppe', { servings: 4 }),
    mk('r_v831_offen', 'Brot ohne Angabe', { servings: 0 }),
  ];
  for (let i = 0; i < 6; i++) list.push(mk('r_v831_f' + i, 'Füllrezept ' + (i + 1), { servings: 2 }));
  for (const r of list) await dbPut(r);
  await loadRecipes();
  const wk = currentWeekDays();
  await savePlanEntries(wk[1], [
    { id: 'e_fond', recipeId: 'r_v831_fond', meal: 'dinner', servings: null },
    { id: 'e_suppe', recipeId: 'r_v831_suppe', meal: 'Znüni', servings: 6 },
    { id: 'e_offen', recipeId: 'r_v831_offen', meal: '', servings: null },
    { id: 'e_note', type: 'note', text: 'Reste' },
  ]);
}"""

async def click(page, sel):
    await page.evaluate("(s) => document.querySelector(s).click()", sel)
    await page.wait_for_timeout(120)

async def fresh(p, w=390, h=844, theme='light'):
    b, ctx = await open_ctx(p, w, h, 'reduce')
    page = await ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('dialog', lambda d: asyncio.ensure_future(d.dismiss()))
    await goto(page); await page.evaluate(open(SEED_PATH).read())
    await page.evaluate(SETUP)
    await page.evaluate(f"() => {{ document.documentElement.dataset.theme = '{theme}'; state.view = 'mealplan'; render(); }}")
    await page.wait_for_selector('.plan-week')
    await page.evaluate("() => document.fonts.ready")
    return b, ctx, page, errs

async def open_entry(page, eid):
    trig = f'.plan-entry [data-action="open-plan-entry"][data-id="{eid}"]'
    await page.focus(trig)
    await page.keyboard.press('Enter')
    await page.wait_for_selector('.rp-sheet--entry')
    return trig

async def closed_with_focus(page, eid):
    await page.wait_for_function("() => !document.querySelector('.modal-sheet')")
    await page.wait_for_function(f"() => document.activeElement && document.activeElement.dataset.action === 'open-plan-entry' && document.activeElement.dataset.id === '{eid}'", timeout=3000)
    return True

async def entry(page, day, eid):
    return await page.evaluate(f"() => dbGetAllMealplan().then(l => (l.find(d => d.date === '{day}') || {{ entries: [] }}).entries.find(e => e.id === '{eid}') || null)")

async def main():
    async with async_playwright() as p:
        b, ctx, page, errs = await fresh(p)
        ev = page.evaluate
        week = await ev("() => currentWeekDays()")
        day = week[1]

        # ---------- 1 Eintrag bearbeiten: Aufbau ----------
        await open_entry(page, 'e_fond')
        d = await ev("""() => { const s = document.querySelector('.rp-sheet--entry'); const vis = sel => { const e = s.querySelector(sel); return !!e && e.getClientRects().length > 0; };
          const x = s.querySelector('.rp-close').getBoundingClientRect();
          return { role: s.getAttribute('role'), modal: s.getAttribute('aria-modal'), title: document.getElementById('plan-entry-title').textContent,
            date: /\\d+\\. /.test((document.getElementById('plan-entry-date') || {}).textContent || '') && s.getAttribute('aria-describedby') === 'plan-entry-date',
            close: vis('.rp-close[aria-label="Schliessen"]'), closeSize: [Math.round(x.width), Math.round(x.height)],
            cancel: [...s.querySelectorAll('.rp-foot button')].map(b => b.textContent.trim()),
            meals: s.querySelectorAll('[data-action=set-plan-meal]').length, other: vis('[data-action=plan-meal-other]'),
            dinner: (s.querySelector('[data-action=set-plan-meal][data-id=dinner]') || {}).getAttribute('aria-checked'),
            custom: !!s.querySelector('#planMealCustom'), oldLabel: s.textContent.includes('Eigene Bezeichnung'),
            qty: (s.querySelector('.rp-qty-val') || {}).textContent, minus: (s.querySelector('[data-rp-step="-1"]') || {}).disabled,
            remove: vis('[data-action=remove-plan-entry]'), move: vis('#planMoveDay') } }""")
        check('Eintrag: Dialog mit Rolle, aria-modal, Rezepttitel und Datum', d['role'] == 'dialog' and d['modal'] == 'true' and d['title'] == 'Rinderfond' and d['date'], d)
        check('Eintrag: sichtbares Schliessen-Symbol 44 × 44 px', d['close'] and d['closeSize'][0] >= 44 and d['closeSize'][1] >= 44, d['closeSize'])
        check('Eintrag: Fuss «Abbrechen» und «Speichern»', d['cancel'] == ['Abbrechen', 'Speichern'], d['cancel'])
        check('Eintrag: Mahlzeit optional, «Abendessen» gewählt, «Andere Mahlzeit» vorhanden', d['meals'] == 3 and d['other'] and d['dinner'] == 'true', d)
        check('Eintrag: kein altes Feld «Eigene Bezeichnung», Namensfeld erst auf Wunsch', not d['custom'] and not d['oldLabel'], d)
        check('Eintrag: Menge mit Ertrag «500 ml», Minus gesperrt', d['qty'] == '500 ml' and d['minus'] is True, d)
        check('Eintrag: Verschieben und Entfernen vorhanden', d['remove'] and d['move'], d)

        # Menge mit Schrittweite des Ertrags, Abbrechen verwirft
        await click(page, '.rp-sheet--entry [data-rp-step="1"]')
        q = await ev("() => document.querySelector('.rp-sheet--entry .rp-qty-val').textContent")
        check('Menge: «+» springt um einen ganzen Ansatz auf «1000 ml»', q in ('1000 ml', '1 000 ml', '1’000 ml', '1 l'), q)
        await click(page, '.rp-sheet--entry .rp-foot [data-action="close-modal"]')
        check('«Abbrechen» schliesst, Fokus zurück zum Auslöser', await closed_with_focus(page, 'e_fond'))
        e0 = await entry(page, day, 'e_fond')
        check('«Abbrechen» speichert die Menge nicht', e0 and e0['servings'] is None and e0['meal'] == 'dinner', e0)

        # Escape schliesst, Fokus zurueck
        await open_entry(page, 'e_fond')
        await click(page, '.rp-sheet--entry [data-rp-step="1"]')
        await page.keyboard.press('Escape')
        check('Escape schliesst, Fokus zurück zum Auslöser', await closed_with_focus(page, 'e_fond'))
        e0 = await entry(page, day, 'e_fond')
        check('Escape speichert die Menge nicht', e0 and e0['servings'] is None, e0)

        # Schliessen-Symbol
        await open_entry(page, 'e_fond')
        await click(page, '.rp-sheet--entry .rp-close')
        check('Schliessen-Symbol schliesst, Fokus zurück zum Auslöser', await closed_with_focus(page, 'e_fond'))

        # Andere Mahlzeit -> Name der Mahlzeit, Menge bleibt beim Neuaufbau, Speichern
        await open_entry(page, 'e_fond')
        await click(page, '.rp-sheet--entry [data-rp-step="1"]')
        await click(page, '[data-action="plan-meal-other"]')
        o = await ev("""() => ({ field: !!document.getElementById('planMealCustom'), label: (document.querySelector('label[for=planMealCustom]') || {}).textContent,
            focus: document.activeElement && document.activeElement.id, other: document.querySelector('[data-action=plan-meal-other]').getAttribute('aria-checked'),
            dinner: document.querySelector('[data-action=set-plan-meal][data-id=dinner]').getAttribute('aria-checked'),
            qty: document.querySelector('.rp-sheet--entry .rp-qty-val').textContent })""")
        check('«Andere Mahlzeit» zeigt «Name der Mahlzeit» mit Fokus, Menge bleibt', o['field'] and o['label'] == 'Name der Mahlzeit' and o['focus'] == 'planMealCustom' and o['other'] == 'true' and o['dinner'] == 'false' and o['qty'] != '500 ml', o)
        await page.fill('#planMealCustom', 'Gäste')
        await click(page, '[data-action="save-plan-entry"]')
        await page.wait_for_function("() => !document.querySelector('.modal-sheet')")
        e1 = await entry(page, day, 'e_fond')
        check('Speichern: Mahlzeit «Gäste», Menge 1000, gleiche Felder wie bisher', e1 and e1['meal'] == 'Gäste' and e1['servings'] == 1000 and sorted(e1.keys()) == ['id', 'meal', 'recipeId', 'servings'], e1)

        # Eintrag mit eigener Mahlzeit: Feld vorausgefuellt; Wechsel auf Mittagessen
        await open_entry(page, 'e_suppe')
        z = await ev("() => ({ v: (document.getElementById('planMealCustom') || {}).value, other: document.querySelector('[data-action=plan-meal-other]').getAttribute('aria-checked'), qty: document.querySelector('.rp-sheet--entry .rp-qty-val').textContent, hint: document.querySelector('.rp-sheet--entry .rp-qty-hint').textContent })")
        check('Eigene Mahlzeit «Znüni»: «Andere Mahlzeit» aktiv, Name vorausgefüllt, Menge «6 Port.»', z['v'] == 'Znüni' and z['other'] == 'true' and z['qty'] == '6 Port.' and '4 Portionen.' in z['hint'], z)
        await page.select_option('#planMoveDay', week[2])
        await click(page, '[data-action="set-plan-meal"][data-id="lunch"]')
        kept = await ev("() => ({ move: document.getElementById('planMoveDay').value, field: !!document.getElementById('planMealCustom') })")
        check('Mahlzeit wechseln: Feld verschwindet, gewählter Zieltag bleibt', kept['move'] == week[2] and not kept['field'], kept)
        await click(page, '.rp-sheet--entry [data-rp-step="-1"]')
        await click(page, '[data-action="save-plan-entry"]')
        await page.wait_for_function("() => !document.querySelector('.modal-sheet')")
        e2 = await entry(page, week[2], 'e_suppe')
        check('Verschoben mit Mittagessen und 5 Portionen', e2 and e2['meal'] == 'lunch' and e2['servings'] == 5, e2)

        # Rezept ohne Ertrag: Hinweis statt Mengenwahl
        await open_entry(page, 'e_offen')
        u = await ev("() => ({ step: !!document.querySelector('.rp-sheet--entry [data-rp-step]'), hint: (document.querySelector('.rp-sheet--entry .rp-qty-hint') || {}).textContent || '' })")
        check('Ohne Ertragsangabe: keine Mengenwahl, verständlicher Hinweis', not u['step'] and 'Originalmengen' in u['hint'], u)
        await page.keyboard.press('Escape'); await closed_with_focus(page, 'e_offen')

        # Notiz: gleiches Geruest, Text bleibt beim Mahlzeitwechsel
        await open_entry(page, 'e_note')
        n = await ev("() => ({ title: document.getElementById('plan-entry-title').textContent, close: !!document.querySelector('.rp-sheet--entry .rp-close'), field: !!document.getElementById('planNoteEdit') })")
        check('Notiz: «Notiz bearbeiten» mit Schliessen-Symbol und Textfeld', n['title'] == 'Notiz bearbeiten' and n['close'] and n['field'], n)
        await page.fill('#planNoteEdit', 'Reste vom Sonntag')
        await click(page, '[data-action="set-plan-meal"][data-id="dinner"]')
        t = await ev("() => document.getElementById('planNoteEdit').value")
        check('Notiz: getippter Text bleibt beim Wählen der Mahlzeit', t == 'Reste vom Sonntag', t)
        await click(page, '[data-action="save-plan-entry"]')
        await page.wait_for_function("() => !document.querySelector('.modal-sheet')")
        e3 = await entry(page, day, 'e_note')
        check('Notiz gespeichert: { id, type, text, meal }', e3 and e3['text'] == 'Reste vom Sonntag' and e3['meal'] == 'dinner' and sorted(e3.keys()) == ['id', 'meal', 'text', 'type'], e3)
        check('Eintrag bearbeiten ohne Seitenfehler', not errs, str(errs[:2]))

        # ---------- 2 Einkauf: Zurueck zur Auswahl ----------
        await ev("() => { state.view = 'shopping'; render(); }")
        await page.wait_for_selector('[data-action="open-shop-from-recipes"]')
        await click(page, '[data-action="open-shop-from-recipes"]'); await page.wait_for_selector('#rpSearch')
        await click(page, '.rp-input[data-rp-pick="r_v831_suppe"]')
        await click(page, '.rp-row.is-selected [data-rp-step="1"]')
        await click(page, '.rp-input[data-rp-pick="r_v831_zimt"]')
        await page.fill('#rpSearch', 'zimt')
        await click(page, '[data-action="confirm-pick-recipes"]')
        await page.wait_for_selector('.shop-select-list')
        pv = await ev("() => ({ back: !!document.querySelector('[data-action=shop-back-to-pick]'), label: (document.querySelector('[data-action=shop-back-to-pick]') || {}).textContent, rows: document.querySelectorAll('.shop-select-row').length })")
        check('Vorschau: Knopf «Zurück zur Auswahl»', pv['back'] and pv['label'].strip() == 'Zurück zur Auswahl', pv)
        await click(page, '[data-action="shop-back-to-pick"]')
        await page.wait_for_selector('#rpSearch')
        bk = await ev("""() => ({ type: state.modal.type, sel: state.modal.rpSel, qty: state.modal.rpQty, q: document.getElementById('rpSearch').value,
            checked: [...document.querySelectorAll('.rp-input:checked')].map(x => x.value), go: document.querySelector('[data-rp-confirm]').textContent,
            focus: document.activeElement && document.activeElement.hasAttribute('data-rp-confirm') })""")
        check('Zurück: Auswahl, Menge und Suche wiederhergestellt', bk['type'] == 'pick-recipes' and bk['sel'] == ['r_v831_suppe', 'r_v831_zimt'] and bk['qty'].get('r_v831_suppe') == 5 and bk['q'] == 'zimt' and bk['checked'] == ['r_v831_zimt'], bk)
        check('Zurück: Zähler und Fokus auf «Zur Vorschau»', bk['go'] == 'Zur Vorschau (2 Rezepte)' and bk['focus'], bk)
        await page.fill('#rpSearch', '')
        sq = await ev("() => document.querySelector('.rp-row.is-selected .rp-qty-val') && [...document.querySelectorAll('.rp-row.is-selected .rp-qty-val')].map(e => e.textContent)")
        check('Zurück: Menge je Rezept sichtbar («5 Port.»)', sq and '5 Port.' in sq, sq)
        await click(page, '[data-action="confirm-pick-recipes"]')
        await page.wait_for_selector('.shop-select-list')
        rows2 = await ev("() => document.querySelectorAll('.shop-select-row').length")
        check('Erneut zur Vorschau: gleiche Zutaten wie vorher', rows2 == pv['rows'], (rows2, pv['rows']))
        shop0 = await ev("() => state.shopping.length")
        await page.keyboard.press('Escape'); await page.wait_for_function("() => !document.querySelector('.modal-sheet')")
        check('Zurück und Escape übernehmen nichts in den Einkauf', await ev("() => state.shopping.length") == shop0)
        # Vorschau aus einem einzelnen Rezept: kein Zurueck
        await ev("() => { const r = state.recipes.find(x => x.id === 'r_v831_suppe'); const items = shoppingSelectionFor(r, 4); markShoppingDuplicates(items); openModal({ type: 'shop-select', items }); }")
        await page.wait_for_selector('.shop-select-list')
        check('Vorschau ohne vorherige Auswahl: kein «Zurück zur Auswahl»', not await ev("() => !!document.querySelector('[data-action=shop-back-to-pick]')"))
        await page.keyboard.press('Escape'); await page.wait_for_function("() => !document.querySelector('.modal-sheet')")
        check('Einkauf ohne Seitenfehler', not errs, str(errs[:2]))
        await b.close()

        # ---------- 3 Darstellung: Andere Mahlzeit ohne Wischen, Dialoge im Bild ----------
        for (w, h) in [(320, 640), (390, 844), (1280, 800)]:
            for theme in ('light', 'dark'):
                b, ctx, page, errs = await fresh(p, w, h, theme)
                ev = page.evaluate
                week = await ev("() => currentWeekDays()")
                tag = f'{w}x{h} {theme}'
                await page.focus(f'[data-action="open-day-picker"][data-date="{week[0]}"]'); await page.keyboard.press('Enter')
                await page.wait_for_selector('#rpSearch')
                g = await ev("""() => { const s = document.querySelector('.modal-sheet'), sr = s.getBoundingClientRect();
                  const row = s.querySelector('.rp-meal-chips'), rr = row.getBoundingClientRect();
                  const o = s.querySelector('[data-action=plan-meal-other]').getBoundingClientRect();
                  const chips = [...row.querySelectorAll('.chip')].map(c => c.getBoundingClientRect());
                  const tops = [...new Set(chips.map(c => Math.round(c.top)))];
                  const ws = n => document.querySelectorAll('.rp-meal-chips').length;
                  return { otherVisible: o.left >= sr.left - 0.5 && o.right <= sr.right + 0.5 && o.left >= rr.left - 0.5 && o.right <= rr.right + 0.5,
                    noScroll: row.scrollWidth <= row.clientWidth + 1, rows: tops.length, rowH: Math.round(rr.height),
                    minChip: Math.min(...chips.map(c => c.height)), inside: sr.right <= innerWidth + 1 && sr.bottom <= innerHeight + 1 } }""")
                await page.screenshot(path=os.path.join(OUT, f'v831_plan_{w}_{theme}.png'))
                check(f'{tag}: «Andere Mahlzeit» ohne Wischen sichtbar', g['otherVisible'] and g['noScroll'], g)
                check(f'{tag}: Mahlzeiten höchstens 2 Zeilen, Touchflächen 44 px', g['rows'] <= 2 and g['minChip'] >= 43.5 and g['rowH'] <= 2 * 64, g)
                check(f'{tag}: Planungsdialog im Bild, kein Überlauf', g['inside'] and await ev(OVERFLOW), g)
                await page.keyboard.press('Escape'); await page.wait_for_function("() => !document.querySelector('.modal-sheet')")
                await open_entry(page, 'e_suppe')
                k = await ev("""() => { const s = document.querySelector('.modal-sheet'), r = s.getBoundingClientRect();
                  const small = [...s.querySelectorAll('button, select, input')].filter(e => e.getClientRects().length).filter(e => { const b = e.getBoundingClientRect(); return b.height < 43.5 || (e.tagName === 'BUTTON' && b.width < 43.5); }).map(e => e.className + ':' + e.textContent.trim().slice(0, 20));
                  const go = s.querySelector('[data-action=save-plan-entry]').getBoundingClientRect();
                  return { inside: r.left >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1, go: go.bottom <= innerHeight && go.right <= innerWidth + 1, small, sheetOv: s.scrollWidth <= s.clientWidth + 1 } }""")
                await page.screenshot(path=os.path.join(OUT, f'v831_entry_{w}_{theme}.png'))
                check(f'{tag}: Eintrag-Dialog im Bild, «Speichern» erreichbar, kein Überlauf', k['inside'] and k['go'] and k['sheetOv'] and await ev(OVERFLOW), k)
                check(f'{tag}: Eintrag-Dialog Touchflächen mindestens 44 px', not k['small'], k['small'])
                await page.keyboard.press('Escape'); await page.wait_for_function("() => !document.querySelector('.modal-sheet')")
                # Einkaufsvorschau mit Zurueck
                await ev("() => { state.view = 'shopping'; render(); }")
                await click(page, '[data-action="open-shop-from-recipes"]'); await page.wait_for_selector('#rpSearch')
                await click(page, '.rp-input[data-rp-pick="r_v831_zimt"]')
                await click(page, '[data-action="confirm-pick-recipes"]'); await page.wait_for_selector('.shop-select-list')
                sb = await ev("() => { const b = document.querySelector('[data-action=shop-back-to-pick]').getBoundingClientRect(); return { h: b.height, ok: b.left >= 0 && b.right <= innerWidth } }")
                await page.screenshot(path=os.path.join(OUT, f'v831_shop_{w}_{theme}.png'))
                check(f'{tag}: «Zurück zur Auswahl» 44 px hoch, im Bild', sb['h'] >= 43.5 and sb['ok'] and await ev(OVERFLOW), sb)
                check(f'{tag}: keine Seitenfehler', not errs, str(errs[:2]))
                await b.close()
    print('\nScreenshots in', OUT)
    print('FEHLER:' if FAIL else 'ALLE OK', FAIL if FAIL else '')
    sys.exit(1 if FAIL else 0)

asyncio.run(main())
