"""v0.83 Planung und Rezeptauswahl (Auftrag §13, §14, §19, §20 F).
Gemeinsame Rezeptauswahl (recipe-picker.js) im Wochenplan, im Einkauf «Aus Rezepten» und im Kochbuch:
Suche (Titel, Kategorie, Umlaute), keine Treffer, Auswahl bleibt bei Suchaenderung, Enter waehlt nichts,
Mehrfachauswahl mit Anzahl, Menge je Rezept, Vorschau mit bestehender Zusammenfuehrung und Dublettenschutz,
Planungsdialog «Rezept» / «Ohne Rezept», Schliessen-Symbol, Abbrechen, Escape, Fokus zurueck zum Tag,
Liste ohne Neuaufbau (Fokus/Scroll bleiben), kleine Hoehe (Bildschirmtastatur), Bibliothekskopie nur mit lokaler ID.
Isolierte Testrezepte (eigene IDs r_v83_*), keine echten Daten."""
import asyncio, json, os, sys
os.environ.setdefault('SAVORA_TEST_PORT', '8871')
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info if not cond else '')
    if not cond: FAIL.append(name)

OVERFLOW = "() => document.documentElement.scrollWidth <= window.innerWidth + 1"
SETUP = """async () => {
  const mk = (id, title, extra) => Object.assign(emptyRecipe(), { id, title, ingredients: [{ amount: '200', unit: 'g', name: 'Zucker' }, { amount: '1', unit: '', name: 'Zitrone' }], steps: [{ text: 'Kochen.' }] }, extra || {});
  const list = [
    mk('r_v83_karamell', 'Karamellsauce', { servingMode: 'total', servings: 1, yieldLabel: 'Glas', categoryTags: ['sauce'], timeMinutes: 30 }),
    mk('r_v83_zimt', 'Zimtschnecken', { servingMode: 'pieces', servings: 12, yieldLabel: 'Stück', timeMinutes: 90 }),
    mk('r_v83_suppe', 'Linsensuppe', { servings: 4, categoryTags: ['soup'] }),
    mk('r_v83_gemuese', 'Gemüsewähe', { servings: 4 }),
    mk('r_v83_offen', 'Brot ohne Angabe', { servings: 0 }),
    mk('r_v83_lib', 'Bibliothek Linsencurry', { servings: 2, publicOrigin: { publicationId: 'pub_v83_fremd', title: 'Linsencurry' } }),
  ];
  for (let i = 0; i < 8; i++) list.push(mk('r_v83_f' + i, 'Füllrezept ' + (i + 1), { servings: 2 }));
  for (const r of list) await dbPut(r);
  await loadRecipes();
}"""

async def click(page, sel):
    await page.evaluate("(s) => document.querySelector(s).click()", sel)
    await page.wait_for_timeout(150)

async def fresh(p, w=390, h=844, theme='light'):
    b, ctx = await open_ctx(p, w, h, 'reduce')
    page = await ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('dialog', lambda d: asyncio.ensure_future(d.dismiss()))
    await goto(page); await page.evaluate(open(SEED_PATH).read())
    await page.evaluate(SETUP)
    await page.evaluate(f"() => {{ document.documentElement.dataset.theme = '{theme}'; }}")
    return b, ctx, page, errs

async def open_plan(page, dk):
    await page.evaluate("() => { state.view = 'mealplan'; render(); }")
    await page.wait_for_selector('.plan-week')
    await page.focus(f'[data-action="open-day-picker"][data-date="{dk}"]')
    await page.keyboard.press('Enter')
    await page.wait_for_selector('#rpSearch')

async def main():
    async with async_playwright() as p:
        b, ctx, page, errs = await fresh(p)
        ev = page.evaluate
        week = await ev("() => currentWeekDays()")
        dk = week[3]

        # ---------- Planungsdialog: Aufbau ----------
        await open_plan(page, dk)
        d = await ev("""() => { const s = document.querySelector('.modal-sheet'); const vis = sel => { const e = s.querySelector(sel); return !!e && e.getClientRects().length > 0; };
          return { role: s.getAttribute('role'), modal: s.getAttribute('aria-modal'), title: document.getElementById(s.getAttribute('aria-labelledby')).textContent,
            close: vis('.rp-close[aria-label="Schliessen"]'), cancel: [...s.querySelectorAll('button')].some(b => b.textContent.trim() === 'Abbrechen'),
            search: vis('input[type=search]#rpSearch'), searchLabel: !!s.querySelector('label[for=rpSearch]'),
            note: !!s.querySelector('#planNoteInput'), quick: !!s.querySelector('[data-note=Reste]'), custom: !!s.querySelector('#planMealCustom'),
            meals: [...s.querySelectorAll('[data-action=set-plan-meal]')].length, other: vis('[data-action=plan-meal-other]'),
            seg: [...s.querySelectorAll('[data-action=plan-mode]')].map(b => b.textContent.trim() + ':' + b.getAttribute('aria-checked')),
            commit: vis('[data-action=plan-commit-recipe]'), items: s.querySelectorAll('.rp-item').length } }""")
        check('Plan: Dialog mit Rolle, aria-modal, Datum im Titel', d['role'] == 'dialog' and d['modal'] == 'true' and d['title'].startswith('Planen für '), d)
        check('Plan: Schliessen-Symbol und «Abbrechen» sichtbar', d['close'] and d['cancel'], d)
        check('Plan: Suchfeld mit Beschriftung', d['search'] and d['searchLabel'], d)
        check('Plan: Umschalter «Rezept» (aktiv) / «Ohne Rezept»', d['seg'] == ['Rezept:true', 'Ohne Rezept:false'], d['seg'])
        check('Plan: nicht alles gleichzeitig (keine Notiz, keine Reste, keine eigene Bezeichnung im Rezeptmodus)', not d['note'] and not d['quick'] and not d['custom'], d)
        check('Plan: Mahlzeit optional mit «Andere Bezeichnung»', d['meals'] == 3 and d['other'], d)
        check('Plan: eindeutige Abschlussaktion «Eintragen»', d['commit'], d)
        total = d['items']

        # Suche: Titel, Umlaute, Kategorie, keine Treffer, Leerzustand
        await page.focus('#rpSearch')
        await page.keyboard.type('gemuse')
        r1 = await ev("() => [...document.querySelectorAll('#rpList .rp-item-title')].map(e => e.textContent)")
        check('Suche: «gemuse» findet «Gemüsewähe» und «Gemüse-Curry» (Umlaute egal)', set(r1) >= {'Gemüsewähe', 'Gemüse-Curry'} and len(r1) == 2, r1)
        await page.fill('#rpSearch', 'suppe')
        r2 = await ev("() => [...document.querySelectorAll('#rpList .rp-item-title')].map(e => e.textContent)")
        check('Suche über Kategorie: «suppe» findet «Linsensuppe»', r2 == ['Linsensuppe'], r2)
        await page.fill('#rpSearch', 'Sauce')
        r3 = await ev("() => [...document.querySelectorAll('#rpList .rp-item-title')].map(e => e.textContent)")
        check('Suche über Kategorie-ID/Titel: «Sauce» findet Karamellsauce', 'Karamellsauce' in r3, r3)
        await page.fill('#rpSearch', 'xyzq')
        empty = await ev("() => ({ t: document.querySelector('.rp-empty') && document.querySelector('.rp-empty').innerText, clear: !!document.querySelector('[data-rp-clear]'), count: document.getElementById('rpCount').textContent })")
        check('Keine Treffer: verständlicher Leerzustand mit «Suche löschen»', empty['t'] and 'Kein Rezept gefunden' in empty['t'] and empty['clear'] and empty['count'].startswith('0 Treffer'), empty)
        await click(page, '[data-rp-clear]')
        check('«Suche löschen» zeigt wieder alle Rezepte', await ev("() => document.querySelectorAll('#rpList .rp-item').length") == total)

        # Ohne Neuaufbau: dasselbe Eingabefeld, Fokus und Cursor bleiben
        await ev("() => { window.__rpEl = document.getElementById('rpSearch'); window.__rpSheet = document.querySelector('.modal-sheet'); }")
        await page.focus('#rpSearch'); await page.keyboard.type('linsen')
        same = await ev("() => ({ el: window.__rpEl === document.getElementById('rpSearch'), sheet: window.__rpSheet === document.querySelector('.modal-sheet'), focus: document.activeElement.id, pos: document.activeElement.selectionStart })")
        check('Tippen baut nur die Liste neu (Feld und Dialog bleiben, Fokus und Cursor bleiben)', same['el'] and same['sheet'] and same['focus'] == 'rpSearch' and same['pos'] == 6, same)

        # Enter waehlt nichts aus
        await page.keyboard.press('Enter'); await page.wait_for_timeout(150)
        st = await ev("() => ({ open: !!document.querySelector('.modal-sheet'), sel: (state.modal.rpSel || []).length })")
        check('Enter in der Suche wählt nichts aus und schliesst nicht', st['open'] and st['sel'] == 0, st)
        # Ohne Auswahl «Eintragen»: Hinweis, nichts gespeichert
        await click(page, '[data-action="plan-commit-recipe"]')
        n0 = await ev(f"() => planEntriesFor('{dk}').length")
        check('«Eintragen» ohne Auswahl speichert nichts', n0 == 0 and await ev("() => !!document.querySelector('.modal-sheet')"))

        # Auswahl bleibt bei Suchaenderung
        await click(page, '.rp-input[data-rp-pick="r_v83_suppe"]')
        await page.fill('#rpSearch', 'zimt')
        await page.fill('#rpSearch', '')
        kept = await ev("() => ({ sel: state.modal.rpSel, checked: !!document.querySelector('.rp-input[data-rp-pick=r_v83_suppe]:checked'), status: document.getElementById('rpPlanQty').textContent })")
        check('Auswahl bleibt beim Ändern der Suche erhalten', kept['sel'] == ['r_v83_suppe'] and kept['checked'] and 'Linsensuppe' in kept['status'], kept)
        # Menge fuer den Eintrag
        q = await ev("() => document.querySelector('#rpPlanQty .rp-qty-val').textContent")
        check('Menge: Ertrag aus dem Rezept («4 Port.»)', q == '4 Port.', q)
        await click(page, '#rpPlanQty [data-rp-step="1"]'); await click(page, '#rpPlanQty [data-rp-step="1"]')
        q2 = await ev("() => document.querySelector('#rpPlanQty .rp-qty-val').textContent")
        check('Menge ändern: «6 Port.»', q2 == '6 Port.', q2)
        # Mahlzeit: eigene Bezeichnung erst ueber «Andere Bezeichnung»
        await click(page, '[data-action="plan-meal-other"]')
        has_custom = await ev("() => ({ el: !!document.getElementById('planMealCustom'), focus: document.activeElement && document.activeElement.id, sel: state.modal.rpSel, q: state.modal.rpQty })")
        check('«Andere Bezeichnung» zeigt das Feld und setzt den Fokus; Auswahl und Menge bleiben', has_custom['el'] and has_custom['focus'] == 'planMealCustom' and has_custom['sel'] == ['r_v83_suppe'] and has_custom['q'].get('r_v83_suppe') == 6, has_custom)
        await page.fill('#planMealCustom', 'Gäste')
        await click(page, '[data-action="plan-commit-recipe"]')
        await page.wait_for_function("() => !document.querySelector('.modal-sheet')")
        e = await ev(f"() => planEntriesFor('{dk}')")
        check('Gespeichert: { recipeId, meal, servings } wie bisher (lokale ID, abweichende Menge)', len(e) == 1 and e[0]['recipeId'] == 'r_v83_suppe' and e[0]['meal'] == 'Gäste' and e[0]['servings'] == 6 and 'type' not in e[0], e)
        await page.wait_for_function(f"() => document.activeElement && document.activeElement.dataset.date === '{dk}'", timeout=3000)
        check('Fokus kehrt zum auslösenden Tag zurück', True)

        # Unveraenderte Menge: servings bleibt null (wie bisher)
        await open_plan(page, dk)
        await click(page, '[data-action="set-plan-meal"][data-id="dinner"]')
        await click(page, '.rp-input[data-rp-pick="r_v83_zimt"]')
        zq = await ev("() => document.querySelector('#rpPlanQty .rp-qty-val').textContent")
        check('Ertrag Stück im Planungsdialog («12 Stück»)', zq == '12 Stück', zq)
        await click(page, '[data-action="plan-commit-recipe"]'); await page.wait_for_function("() => !document.querySelector('.modal-sheet')")
        e = await ev(f"() => planEntriesFor('{dk}')")
        check('Unveränderte Menge: servings null, meal dinner', e[1]['servings'] is None and e[1]['meal'] == 'dinner' and e[1]['recipeId'] == 'r_v83_zimt', e)

        # Ohne Rezept: Notiz
        await open_plan(page, dk)
        await click(page, '[data-action="plan-mode"][data-id="note"]')
        nd = await ev("() => ({ note: !!document.getElementById('planNoteInput'), list: !!document.getElementById('rpList'), quick: document.querySelectorAll('[data-action=add-plan-note][data-note]').length, foot: [...document.querySelectorAll('.rp-foot button')].map(b => b.textContent.trim()) })")
        check('«Ohne Rezept»: Reste, Auswärts, eigene Notiz; keine Rezeptliste', nd['note'] and not nd['list'] and nd['quick'] == 2 and nd['foot'] == ['Abbrechen', 'Notiz eintragen'], nd)
        await page.fill('#planNoteInput', 'Pizza bei Anna')
        await click(page, '.rp-foot [data-action="add-plan-note"]'); await page.wait_for_function("() => !document.querySelector('.modal-sheet')")
        e = await ev(f"() => planEntriesFor('{dk}')")
        check('Notizeintrag { type: note, text } ohne recipeId', e[-1].get('type') == 'note' and e[-1]['text'] == 'Pizza bei Anna' and 'recipeId' not in e[-1], e[-1])

        # Abbrechen, Schliessen-Symbol, Escape: nichts gespeichert, Fokus zurueck
        before = await ev(f"() => planEntriesFor('{dk}').length")
        for how in ('cancel', 'close', 'escape'):
            await open_plan(page, dk)
            await click(page, '.rp-input[data-rp-pick="r_v83_gemuese"]')
            if how == 'cancel': await click(page, '.rp-foot [data-action="close-modal"]')
            elif how == 'close': await click(page, '.rp-close')
            else: await page.keyboard.press('Escape')
            await page.wait_for_function("() => !document.querySelector('.modal-sheet')", timeout=3000)
            ok = await ev(f"() => planEntriesFor('{dk}').length") == before
            await page.wait_for_function(f"() => document.activeElement && document.activeElement.dataset.date === '{dk}'", timeout=3000)
            check(f'Schliessen über {how}: nichts gespeichert, Fokus wieder am Tag', ok)
        # Escape mit Suchtext schliesst ohne Rueckfrage
        await open_plan(page, dk)
        await page.fill('#rpSearch', 'abc'); await page.focus('#rpSearch'); await page.keyboard.press('Escape')
        await page.wait_for_function("() => !document.querySelector('.modal-sheet')", timeout=3000)
        check('Escape mit Suchtext schliesst (Suchtext ist keine ungespeicherte Eingabe)', True)

        # Lange Liste scrollt im Dialog; Tastatur-Simulation (kleine Hoehe): Fuss bleibt sichtbar
        await page.set_viewport_size({'width': 390, 'height': 420})
        await open_plan(page, dk)
        await page.focus('#rpSearch')
        g = await ev("""() => { const s = document.querySelector('.modal-sheet'), body = s.querySelector('.rp-body'), foot = s.querySelector('.rp-foot'), r = s.getBoundingClientRect(), f = foot.getBoundingClientRect(), go = s.querySelector('[data-action=plan-commit-recipe]').getBoundingClientRect();
          return { sheetBottom: r.bottom, vh: innerHeight, footBottom: f.bottom, goVisible: go.top >= 0 && go.bottom <= innerHeight, scrolls: body.scrollHeight > body.clientHeight, ovY: getComputedStyle(body).overflowY } }""")
        check('Kleine Höhe (Tastatur): Dialog passt, «Eintragen» sichtbar, Liste scrollt im Dialog', g['sheetBottom'] <= g['vh'] + 1 and g['goVisible'] and g['scrolls'] and g['ovY'] == 'auto', g)
        await ev("() => { document.querySelector('.rp-body').scrollTop = 200; }")
        await page.keyboard.type('f')
        sc = await ev("() => ({ top: document.querySelector('.rp-body').scrollTop, focus: document.activeElement.id })")
        check('Tippen in der Suche: Fokus bleibt', sc['focus'] == 'rpSearch', sc)
        await page.keyboard.press('Escape'); await page.wait_for_function("() => !document.querySelector('.modal-sheet')")
        await page.set_viewport_size({'width': 390, 'height': 844})

        # ---------- Einkauf «Aus Rezepten» ----------
        await ev("() => { state.view = 'shopping'; render(); }"); await page.wait_for_selector('.shop-quick')
        await page.focus('[data-action="open-shop-from-recipes"]'); await page.keyboard.press('Enter')
        await page.wait_for_selector('#rpSearch')
        s0 = await ev("() => ({ title: document.getElementById('pick-recipes-title').textContent, close: !!document.querySelector('.rp-close'), count: document.getElementById('rpCount').textContent, type: document.querySelector('.rp-input').type })")
        check('Einkauf: Dialog mit Suche, Schliessen, Mehrfachauswahl (Checkbox)', s0['close'] and s0['type'] == 'checkbox' and s0['count'] == 'Noch kein Rezept ausgewählt', s0)
        await page.fill('#rpSearch', 'karamell')
        await click(page, '.rp-input[data-rp-pick="r_v83_karamell"]')
        await page.fill('#rpSearch', 'linsensuppe')
        await click(page, '.rp-input[data-rp-pick="r_v83_suppe"]')
        await page.fill('#rpSearch', '')
        c = await ev("() => ({ count: document.getElementById('rpCount').textContent, go: document.querySelector('[data-rp-confirm]').textContent, sel: state.modal.rpSel, k: document.querySelector('.rp-input[data-rp-pick=r_v83_karamell]').checked })")
        check('Mehrfachauswahl über zwei Suchen: Anzahl sichtbar, Auswahl erhalten', c['count'] == '2 Rezepte ausgewählt' and c['go'] == 'Weiter mit 2 Rezepten' and c['sel'] == ['r_v83_karamell', 'r_v83_suppe'] and c['k'], c)
        kq = await ev("() => document.querySelector('.rp-input[data-rp-pick=r_v83_karamell]').closest('.rp-row').querySelector('.rp-qty-val').textContent")
        check('Gesamtertrag in der Mengenwahl («1 Glas»)', kq == '1 Glas', kq)
        # Menge je Rezept: Linsensuppe 4 -> 8 (Zucker 200 g -> 400 g)
        for _ in range(4): await click(page, '[data-rp-step="1"][data-id="r_v83_suppe"]')
        sq = await ev("() => document.querySelector('[data-rp-step][data-id=r_v83_suppe]').closest('.rp-stepper').querySelector('.rp-qty-val').textContent")
        check('Menge je Rezept ändern («8 Port.»)', sq == '8 Port.', sq)
        await click(page, '[data-action="confirm-pick-recipes"]')
        await page.wait_for_selector('.shop-select-list')
        pv = await ev("() => state.modal.items.map(i => ({ r: i.recipeId, n: i.name, a: i.amount }))")
        suppe_zucker = [x for x in pv if x['r'] == 'r_v83_suppe' and x['n'] == 'Zucker']
        check('Vorschau vor der Übernahme (bestehendes Auswahlfenster) mit skalierter Menge', len(pv) == 4 and suppe_zucker and suppe_zucker[0]['a'] == 400, pv)
        await click(page, '[data-action="confirm-shop-select"]'); await page.wait_for_function("() => !document.querySelector('.modal-sheet')")
        shop = await ev("() => state.shopping.filter(i => (i.sources || []).some(s => String(s.recipeId || '').startsWith('r_v83'))).map(i => ({ n: i.name, a: i.amount, src: i.sources.map(s => s.recipeId) }))")
        zucker = [x for x in shop if x['n'] == 'Zucker']
        check('Gleiche Zutaten zusammengeführt, Quellen (sources[].recipeId) erhalten', len(zucker) == 1 and zucker[0]['a'] == 600 and sorted(zucker[0]['src']) == ['r_v83_karamell', 'r_v83_suppe'], shop)
        # Bereits uebernommenes Rezept: Dublettenschutz
        await click(page, '[data-action="open-shop-from-recipes"]'); await page.wait_for_selector('#rpSearch')
        await click(page, '.rp-input[data-rp-pick="r_v83_karamell"]')
        await click(page, '[data-action="confirm-pick-recipes"]'); await page.wait_for_selector('.shop-select-list')
        dup = await ev("() => ({ dup: state.modal.items.every(i => i.dup && !i.selected), hint: !!document.querySelector('.shop-dup-hint') })")
        check('Bereits übernommenes Rezept: als «schon auf der Liste» abgewählt', dup['dup'] and dup['hint'], dup)
        await page.keyboard.press('Escape'); await page.wait_for_function("() => !document.querySelector('.modal-sheet')")
        # Abbrechen im Auswahldialog: nichts uebernommen
        n_before = await ev("() => state.shopping.length")
        await click(page, '[data-action="open-shop-from-recipes"]'); await page.wait_for_selector('#rpSearch')
        await click(page, '.rp-input[data-rp-pick="r_v83_zimt"]')
        await click(page, '.rp-foot [data-action="close-modal"]'); await page.wait_for_function("() => !document.querySelector('.modal-sheet')")
        check('Abbrechen: nichts übernommen, Fokus zurück auf «Aus Rezepten»', await ev("() => state.shopping.length") == n_before and await ev("() => document.activeElement && document.activeElement.dataset.action") == 'open-shop-from-recipes')

        # ---------- Bibliothekskopie: nur lokale ID ----------
        await ev("() => { state.activeRecipeId = 'r_v83_lib'; state.view = 'detail'; render(); }"); await page.wait_for_selector('[data-action="open-plan-recipe"]')
        await click(page, '[data-action="open-plan-recipe"]'); await page.wait_for_selector('.rp-sheet [data-action="assign-mealplan-recipe"]')
        pr = await ev("() => ({ close: !!document.querySelector('.rp-close'), cancel: !!document.querySelector('.rp-foot [data-action=close-modal]'), qty: document.querySelector('.rp-qty-val') && document.querySelector('.rp-qty-val').textContent, sub: document.querySelector('.rp-sub').textContent })")
        check('«In den Wochenplan» aus der Detailansicht: Schliessen, Abbrechen, Menge, Rezeptname', pr['close'] and pr['cancel'] and pr['qty'] == '2 Port.' and pr['sub'] == 'Bibliothek Linsencurry', pr)
        await click(page, '[data-rp-step="1"]')
        lk = week[4]
        await click(page, f'[data-action="assign-mealplan-recipe"][data-date="{lk}"]')
        await page.wait_for_function("() => !state.modal")
        le = await ev(f"() => planEntriesFor('{lk}')")
        check('Bibliothekskopie im Plan mit lokaler ID und Menge 3', le and le[-1]['recipeId'] == 'r_v83_lib' and le[-1]['servings'] == 3, le)
        await ev("() => { state.view = 'shopping'; render(); }"); await page.wait_for_selector('.shop-quick')
        await click(page, '[data-action="open-shop-from-recipes"]'); await page.wait_for_selector('#rpSearch')
        await page.fill('#rpSearch', 'bibliothek'); await click(page, '.rp-input[data-rp-pick="r_v83_lib"]')
        await click(page, '[data-action="confirm-pick-recipes"]'); await page.wait_for_selector('.shop-select-list')
        await click(page, '[data-action="confirm-shop-select"]'); await page.wait_for_function("() => !document.querySelector('.modal-sheet')")
        alldata = await ev("async () => JSON.stringify({ plan: await dbGetAllMealplan(), shop: await dbGetAllShopping() })")
        check('Keine öffentliche ID in Plan oder Einkauf', 'pub_v83_fremd' not in alldata and 'r_v83_lib' in alldata)

        # ---------- Kochbuch: Suche in «Nicht im Kochbuch» ----------
        await ev("() => { state.view = 'cookbook'; state.cookbookStep = 1; const c = getCookbookConfig(); c.items = c.items.filter(it => !String(it.recipeId).startsWith('r_v83')); saveCookbookConfig(c); render(); }")
        await page.wait_for_timeout(200)
        has_cb = await ev("() => !!document.getElementById('cbRpSearch')")
        if has_cb:
            await page.fill('#cbRpSearch', 'füllrezept 3')
            vis = await ev("() => [...document.querySelectorAll('.cb-item--out')].filter(r => !r.hidden).map(r => r.querySelector('.cb-item-title').textContent)")
            check('Kochbuch: Suche filtert «Nicht im Kochbuch» ohne Neuaufbau', vis == ['Füllrezept 3'], vis)
            await page.fill('#cbRpSearch', 'qqq')
            msg = await ev("() => document.getElementById('cbRpCount').textContent")
            check('Kochbuch: keine Treffer verständlich gemeldet', msg.startswith('Kein Rezept gefunden'), msg)
            await page.fill('#cbRpSearch', '')
        else:
            check('Kochbuch: Suchfeld bei 14 Rezepten ausserhalb des Buchs vorhanden', False, await ev("() => document.querySelectorAll('.cb-item--out').length"))

        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await b.close()

        # ---------- Darstellung: Breiten, hell/dunkel, kein Ueberlauf ----------
        for (w, h) in [(320, 640), (390, 844), (768, 1024), (1280, 800)]:
            for theme in ('light', 'dark'):
                b, ctx, page, errs = await fresh(p, w, h, theme)
                ev = page.evaluate
                week = await ev("() => currentWeekDays()")
                await open_plan(page, week[0])
                await click(page, '.rp-input[data-rp-pick="r_v83_suppe"]')
                g = await ev("""() => { const s = document.querySelector('.modal-sheet'), r = s.getBoundingClientRect();
                  const small = [...s.querySelectorAll('button, .rp-item')].filter(e => e.getClientRects().length && !e.closest('.chip-row')).filter(e => { const b = e.getBoundingClientRect(); return b.height < 43.5 || b.width < 43.5; }).map(e => e.className + ':' + e.textContent.trim().slice(0, 20));
                  const go = s.querySelector('[data-action=plan-commit-recipe]').getBoundingClientRect();
                  return { inside: r.left >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1, go: go.bottom <= innerHeight && go.right <= innerWidth + 1, small, sheetOv: s.scrollWidth <= s.clientWidth + 1 } }""")
                tag = f'{w}x{h} {theme}'
                await page.screenshot(path=os.path.join(OUT, f'v83_plan_{w}_{theme}.png'))
                check(f'{tag}: Planungsdialog im Bild, «Eintragen» erreichbar, kein Überlauf', g['inside'] and g['go'] and g['sheetOv'] and await ev(OVERFLOW), g)
                check(f'{tag}: Touchflächen mindestens 44 px', not g['small'], g['small'])
                await page.keyboard.press('Escape'); await page.wait_for_function("() => !document.querySelector('.modal-sheet')")
                await ev("() => { state.view = 'shopping'; render(); }")
                await click(page, '[data-action="open-shop-from-recipes"]'); await page.wait_for_selector('#rpSearch')
                await click(page, '.rp-input[data-rp-pick="r_v83_zimt"]')
                await page.screenshot(path=os.path.join(OUT, f'v83_shop_{w}_{theme}.png'))
                ok = await ev("() => { const s = document.querySelector('.modal-sheet'); return s.scrollWidth <= s.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1; }")
                check(f'{tag}: Einkaufsauswahl ohne Überlauf', ok)
                check(f'{tag}: keine Seitenfehler', not errs, str(errs[:2]))
                await b.close()
    print('\nScreenshots in', OUT)
    print('FEHLER:' if FAIL else 'ALLE OK', FAIL if FAIL else '')
    sys.exit(1 if FAIL else 0)

asyncio.run(main())
