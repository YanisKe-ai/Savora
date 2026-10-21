"""v0.84 Integration: Sammlungen in Wochenplan, Einkauf, Kochbuch und Bibliothek (Vertrag, Helfer INTEGRATION).
Prueft: Auswahlfeld «Anzeigen» in der Rezeptauswahl (Start «Alle Rezepte», Favoriten, Sammlung, Suche kombiniert,
Auswahl bleibt beim Wechsel, nur ausdruecklich Gewaehltes wird uebernommen, keine «Passt dazu»-Rezepte), Kochbuch
«Aus Sammlung auswaehlen» (enthaltene gesperrt, ans Ende, keine Dubletten, Kapitel unveraendert, Momentaufnahme: spaetere
Aenderung der Sammlung aendert das Buch nicht, kein Sammlungsname als Titel/Kapitel), Bibliothek «Speichern und zu Sammlung
hinzufuegen» (lokale ID, nie die oeffentliche; vorhandene Kopie wiederverwendet) und freiwillige Aktion nach Import/Uebernahme.
Daten ueber org.js, solange es fehlt ueber den Bestand (savora-collections, recipe.collections). Nur Testdaten."""
import os
os.environ.setdefault('SAVORA_TEST_PORT', '50100')
os.environ.setdefault('SAVORA_MOCK_PORT', '50101')
from bibliothek_helfer import *   # noqa: F401,F403

SETUP = """async () => {
  // Feste, gleiche Zeitstempel: loadRecipes sortiert nach updatedAt (neueste zuerst). Mit Date.now() aus emptyRecipe()
  // fielen die Rezepte auf langsamen Rechnern (Linux-CI) in verschiedene Millisekunden, dann kam r_i_d vor r_i_a.
  const T = 1700000000000;
  const mk = (id, title, extra) => Object.assign(emptyRecipe(), { id, title, createdAt: T, updatedAt: T, servings: 4, ingredients: [{ amount: '200', unit: 'g', name: 'Zucker' }], steps: [{ text: 'Kochen.' }] }, extra || {});
  const list = [mk('r_i_a', 'Apfelkuchen'), mk('r_i_b', 'Birchermuesli', { favorite: true }), mk('r_i_c', 'Currysuppe', { favorite: true }),
                mk('r_i_d', 'Dinkelbrot'), mk('r_i_e', 'Erdbeertorte'), mk('r_i_f', 'Fladenbrot')];
  for (const r of list) await dbPut(r);
  await loadRecipes();
  // Sammlung «Meal Prep» mit a, c, d; zweite Sammlung «Leer» ohne Rezepte
  let colId = 'col_meal-prep';
  if (typeof orgCreateCollection === 'function') {
    const res = orgCreateCollection({ name: 'Meal Prep', color: 'sage', icon: 'folder' }); colId = res.id;
    orgCreateCollection({ name: 'Leer', color: 'sage', icon: 'folder' });
    for (const id of ['r_i_a', 'r_i_c', 'r_i_d']) orgSetMembership(id, colId, true);
  } else {
    saveCollections([{ id: colId, name: 'Meal Prep' }, { id: 'col_leer', name: 'Leer' }]);
    for (const r of state.recipes) if (['r_i_a', 'r_i_c', 'r_i_d'].includes(r.id)) { r.collections = [colId]; await dbPut(r); }
    await loadRecipes();
  }
  window.__col = colId;
  return colId;
}"""
ADD_COL = """async (id) => {
  if (typeof orgSetMembership === 'function') orgSetMembership(id, window.__col, true);
  else { const r = state.recipes.find(x => x.id === id); r.collections = [window.__col]; await dbPut(r); await loadRecipes(); }
}"""
async def click(page, sel):
    await ev(page, "(s) => document.querySelector(s).click()", sel); await page.wait_for_timeout(150)
async def titles(page): return await ev(page, "() => [...document.querySelectorAll('#rpList .rp-item-title')].map(e => e.textContent)")

async def main():
    t0 = time.time()
    A = M.make_user('autor-a@example.test')
    async with async_playwright() as p:
        browser, ctx, page = await open_app(p)
        await ev(page, "() => { localStorage.clear(); }")
        await ev(page, "async () => { await dbClear?.(); }") if False else None
        col = await ev(page, SETUP)

        # ---------- Wochenplan ----------
        async with section('Wochenplan: Auswahl nach Sammlung gefiltert'):
            week = await ev(page, "() => currentWeekDays()")
            await ev(page, "() => { state.view = 'mealplan'; render(); }")
            await page.wait_for_selector('.plan-week')
            await ev(page, f"() => openModal({{ type: 'pick-recipe', date: '{week[2]}', meal: '', planMode: 'recipe', rpPicker: true, rpMulti: false, rpSel: [], rpQuery: '', rpQty: {{}} }})")
            await page.wait_for_selector('#rpScope')
            check('Auswahlfeld «Anzeigen» mit Beschriftung', await ev(page, "() => document.querySelector('label[for=rpScope]').textContent") == 'Anzeigen')
            check('Start immer bei «Alle Rezepte» (6 Rezepte)', await ev(page, "() => document.getElementById('rpScope').value") == 'all' and len(await titles(page)) == 6)
            opts = await ev(page, "() => [...document.querySelectorAll('#rpScope option')].map(o => o.textContent)")
            check('Optionen: Alle, Favoriten (2), Sammlungen mit Anzahl', opts[0] == 'Alle Rezepte' and opts[1] == 'Favoriten (2)' and 'Meal Prep (3)' in opts and 'Leer (0)' in opts, opts)
            await page.select_option('#rpScope', col)
            check('Sammlung: nur ihre 3 Rezepte', sorted(await titles(page)) == ['Apfelkuchen', 'Currysuppe', 'Dinkelbrot'], await titles(page))
            await page.fill('#rpSearch', 'brot')
            check('Suche kombiniert mit Sammlung (Fladenbrot ausserhalb)', await titles(page) == ['Dinkelbrot'], await titles(page))
            await page.fill('#rpSearch', 'zzz')
            txt = await ev(page, "() => document.querySelector('.rp-empty').innerText")
            check('Leer mit Suche: «Kein Rezept in «Meal Prep» gefunden für «zzz».»', 'Kein Rezept in «Meal Prep» gefunden für «zzz»' in txt and 'In allen Rezepten suchen' in txt, txt)
            await click(page, '[data-rp-allscope]')
            check('«In allen Rezepten suchen» setzt auf Alle, Suche bleibt', await ev(page, "() => document.getElementById('rpScope').value") == 'all')
            await page.fill('#rpSearch', '')
            await click(page, '.rp-input[data-rp-pick="r_i_e"]')   # ausserhalb der Sammlung
            await page.select_option('#rpScope', 'favorites')
            check('Favoriten: Birchermuesli und Currysuppe', sorted(await titles(page)) == ['Birchermuesli', 'Currysuppe'], await titles(page))
            check('Auswahl bleibt beim Wechsel erhalten', await ev(page, "() => state.modal.rpSel") == ['r_i_e'])
            await page.select_option('#rpScope', 'col_leer' if await ev(page, "() => typeof orgCreateCollection !== 'function'") else await ev(page, "() => orgCollections().find(c => c.name === 'Leer').id"))
            txt = await ev(page, "() => document.querySelector('.rp-empty').innerText")
            check('Leere Sammlung: Hinweis und «Alle Rezepte zeigen»', 'In «Leer» ist noch kein Rezept.' in txt and 'Alle Rezepte zeigen' in txt, txt)
            await click(page, '[data-rp-allscope]')
            await click(page, '[data-action="plan-commit-recipe"]')
            await page.wait_for_timeout(300)
            plan = await ev(page, f"() => planEntriesFor('{week[2]}').map(e => e.recipeId)")
            check('Nur das ausdruecklich gewaehlte Rezept wird eingetragen (keine «Passt dazu»-Rezepte)', plan == ['r_i_e'], plan)
            await ev(page, "() => { state.modal = null; render(); }")

        # ---------- Einkauf ----------
        async with section('Einkauf: Auswahl nach Sammlung'):
            await ev(page, "() => { state.view = 'shopping'; render(); openModal({ type: 'pick-recipes', selected: [], rpPicker: true, rpMulti: true, rpSel: [], rpQuery: '', rpQty: {} }); }")
            await page.wait_for_selector('#rpScope')
            check('Einkauf: Start bei «Alle Rezepte»', await ev(page, "() => document.getElementById('rpScope').value") == 'all')
            await page.select_option('#rpScope', col)
            await click(page, '.rp-input[data-rp-pick="r_i_a"]'); await click(page, '.rp-input[data-rp-pick="r_i_d"]')
            await page.select_option('#rpScope', 'all')
            await click(page, '.rp-input[data-rp-pick="r_i_f"]')
            await page.select_option('#rpScope', col)
            cnt = await ev(page, "() => document.getElementById('rpCount').textContent")
            check('Zaehlung nennt Auswahl ausserhalb der Sammlung', '3 Rezepte ausgewählt' in cnt and '1 ausgewähltes ausserhalb von «Meal Prep»' in cnt, cnt)
            await click(page, '[data-rp-confirm]'); await page.wait_for_timeout(300)
            items = await ev(page, "() => state.modal && state.modal.items ? [...new Set(state.modal.items.map(i => i.recipeId || i.title))] : null")
            check('Vorschau enthaelt nur die gewaehlten 3 Rezepte', items is not None and len(items) == 3, items)
            back = await ev(page, "() => { const b = document.querySelector('[data-action=\"shop-back\"], .shop-back-btn'); if (b) b.click(); return !!b; }")
            if back:
                await page.wait_for_timeout(300)
                check('Zurueck zur Auswahl: Bereich bleibt', await ev(page, "() => state.modal.rpScope") == col and len(await ev(page, "() => state.modal.rpSel")) == 3)
            await ev(page, "() => { state.modal = null; render(); }")

        # ---------- Kochbuch ----------
        async with section('Kochbuch: Aus Sammlung auswaehlen'):
            await ev(page, "() => { const c = getCookbookConfig(); c.items = [{ recipeId: 'r_i_c', chapterId: 'ch1' }, { recipeId: 'r_i_f', chapterId: '' }]; c.chapters = [{ id: 'ch1', name: 'Suppen' }]; c.title = 'Mein Buch'; saveCookbookConfig(c); state.view = 'cookbook'; state.cookbookStep = 1; render(); }")
            await page.wait_for_selector('.cb-bulk')
            check('Knopf «Aus Sammlung auswählen» sichtbar', await page.locator('[data-action="cb-from-col"]').count() == 1)
            await click(page, '[data-action="cb-from-col"]')
            await page.wait_for_selector('[data-action="cb-col-pick"]')
            rows = await ev(page, "() => [...document.querySelectorAll('.cbc-col')].map(b => b.innerText.replace(/\\s+/g, ' '))")
            check('Stufe 1: Sammlungen mit Anzahl (Favoriten, Meal Prep), leere fehlen', any('Meal Prep' in r and '3' in r for r in rows) and not any(r.startswith('Leer') for r in rows), rows)
            await click(page, f'[data-action="cb-col-pick"][data-id="{col}"]')
            st = await ev(page, "() => [...document.querySelectorAll('#cbColList .rp-input')].map(i => [i.dataset.cbcolPick, i.checked, i.disabled])")
            check('Stufe 2: enthaltene gesperrt und angehakt, neue vorausgewaehlt', sorted(st) == [['r_i_a', True, False], ['r_i_c', True, True], ['r_i_d', True, False]], st)
            txt = await ev(page, "() => document.querySelector('.rp-sheet').innerText")
            check('Hinweis Momentaufnahme und «Schon im Kochbuch»', 'Das Kochbuch übernimmt diese Auswahl einmalig. Spätere Änderungen an der Sammlung ändern das Kochbuch nicht.' in txt and 'Schon im Kochbuch' in txt and 'Kapitel für neue Rezepte' in txt, txt[:300])
            check('Knopf zaehlt «2 Rezepte hinzufügen»', await ev(page, "() => document.getElementById('cbColGo').textContent") == '2 Rezepte hinzufügen')
            await click(page, '.rp-input[data-cbcol-pick="r_i_d"]')
            check('Abwaehlen aktualisiert den Knopf', await ev(page, "() => document.getElementById('cbColGo').textContent") == '1 Rezept hinzufügen')
            await click(page, '.rp-input[data-cbcol-pick="r_i_d"]')
            await click(page, '#cbColGo'); await page.wait_for_timeout(500)
            cfg = await ev(page, "() => getCookbookConfig()")
            check('Ans Ende angehaengt, Reihenfolge und Kapitel unveraendert, keine Dubletten',
                  [i['recipeId'] for i in cfg['items']] == ['r_i_c', 'r_i_f', 'r_i_a', 'r_i_d'] and cfg['items'][0]['chapterId'] == 'ch1' and cfg['items'][2]['chapterId'] == '', cfg['items'])
            check('Kein Sammlungsname als Titel oder Kapitel', cfg['title'] == 'Mein Buch' and [c['name'] for c in cfg['chapters']] == ['Suppen'])
            toast = await ev(page, "() => (document.querySelector('.toast') || {}).textContent")
            check('Meldung nennt aufgenommene und schon enthaltene', toast and '2 Rezepte im Kochbuch aufgenommen. 1 war schon enthalten.' in toast, toast)
            check('Seite zeigt neuen Stand (#cbSelCount)', '4 von 6' in await ev(page, "() => document.getElementById('cbSelCount').textContent"))
            # Momentaufnahme
            await ev(page, ADD_COL, 'r_i_e')
            await ev(page, "() => { if (typeof orgSetMembership === 'function') orgSetMembership('r_i_a', window.__col, false); }")
            cfg2 = await ev(page, "() => getCookbookConfig()")
            check('Spaetere Aenderung der Sammlung aendert das Kochbuch nicht', [i['recipeId'] for i in cfg2['items']] == ['r_i_c', 'r_i_f', 'r_i_a', 'r_i_d'])
            # Zweites Mal: nur noch das neue Rezept
            await ev(page, "() => { render(); }")
            await click(page, '[data-action="cb-from-col"]'); await page.wait_for_selector('[data-action="cb-col-pick"]')
            await click(page, f'[data-action="cb-col-pick"][data-id="{col}"]')
            sel = await ev(page, "() => state.modal.sel")
            check('Zweites Oeffnen: nur das neue Rezept vorausgewaehlt', sel == ['r_i_e'], sel)
            await click(page, '#cbColGo'); await page.wait_for_timeout(400)
            ids = await ev(page, "() => getCookbookConfig().items.map(i => i.recipeId)")
            check('Keine Dubletten nach erneutem Hinzufuegen', len(ids) == len(set(ids)) and ids[-1] == 'r_i_e', ids)

        # ---------- Bibliothek ----------
        async with section('Bibliothek: Speichern und zu Sammlung hinzufuegen'):
            pub = M.seed_publication(A, rich_recipe('Linsencurry', diet=('vegan',)))
            await ev(page, f"libOpenDetail('{pub}')"); await wait_js(page, "lib.detail.status === 'ready'")
            check('UI: «Speichern und zu Sammlung hinzufügen» (noch keine Kopie)', await btn(page, 'Speichern und zu Sammlung hinzufügen').count() == 1)
            await click_btn(page, 'Speichern und zu Sammlung hinzufügen')
            await wait_js(page, "!!state.modal && state.modal.type === 'rcol'", 6000)
            m = await ev(page, "() => state.modal")
            copies = await local_copies(page, pub)
            check('Genau eine Kopie, Dialog mit lokaler ID (nie die oeffentliche)', len(copies) == 1 and m['recipeId'] == copies[0]['id'] and m['recipeId'] != pub, (m, copies))
            await ev(page, "() => { state.modal = null; render(); }")
            await ev(page, f"libOpenDetail('{pub}')"); await wait_js(page, "lib.detail.status === 'ready'")
            check('UI: mit Kopie «Zu Sammlung hinzufügen»', await btn(page, 'Zu Sammlung hinzufügen').count() == 1 and await btn(page, 'Speichern und zu Sammlung hinzufügen').count() == 0)
            await click_btn(page, 'Zu Sammlung hinzufügen')
            await wait_js(page, "!!state.modal && state.modal.type === 'rcol'", 6000)
            m2 = await ev(page, "() => state.modal")
            check('Vorhandene Kopie wiederverwendet (keine zweite)', len(await local_copies(page, pub)) == 1 and m2['recipeId'] == copies[0]['id'])
            await ev(page, "() => { state.modal = null; render(); }")

        async with section('Freiwillige Aktion nach Import und Uebernahme'):
            await ev(page, "() => { window.rcolModalHtml = window.rcolModalHtml || (() => ''); }")
            # Text-Import: Formular -> Speichern
            await ev(page, "() => { const r = emptyRecipe(); r.title = 'Importiertes Rezept'; r.ingredients = [{ amount: '1', unit: '', name: 'Ei' }]; r.steps = [{ text: 'Braten.' }]; r._importSummary = { x: 1 }; openForm(r); }")
            await page.wait_for_selector('#f-title')
            await click(page, '[data-action="save-recipe"]'); await page.wait_for_timeout(600)
            t = await ev(page, "() => { const e = document.querySelector('.toast'); return e ? { text: e.textContent, btn: !!e.querySelector('.toast-action-btn'), modal: !!state.modal } : null; }")
            check('Import: Erfolgshinweis mit freiwilliger Aktion, kein Pflichtdialog', t and 'Rezept gespeichert' in t['text'] and 'Zu einer Sammlung hinzufügen' in t['text'] and t['btn'] and not t['modal'], t)
            await click(page, '.toast-action-btn'); await page.wait_for_timeout(200)
            m3 = await ev(page, "() => state.modal")
            check('Aktion oeffnet Sammlungsdialog fuer das neue Rezept', m3 and m3['type'] == 'rcol' and m3['recipeId'] == await ev(page, "() => state.activeRecipeId"), m3)
            await ev(page, "() => { state.modal = null; render(); }")
            # normales Speichern ohne Import: kein Zusatz
            await ev(page, "() => { const r = emptyRecipe(); r.title = 'Normal'; r.ingredients = [{ amount: '1', unit: '', name: 'Ei' }]; r.steps = [{ text: 'Braten.' }]; openForm(r); }")
            await page.wait_for_selector('#f-title'); await click(page, '[data-action="save-recipe"]'); await page.wait_for_timeout(500)
            check('Normales Speichern ohne Zusatzaktion', not await ev(page, "() => !!document.querySelector('.toast .toast-action-btn')"))
            # Bibliotheksuebernahme (nur «In meine Rezepte speichern»)
            pub2 = M.seed_publication(A, rich_recipe('Gemuesewaehe', diet=('vegetarisch',)))
            await ev(page, f"libOpenDetail('{pub2}')"); await wait_js(page, "lib.detail.status === 'ready'")
            await click_btn(page, 'In meine Rezepte speichern')
            await wait_js(page, "!!document.querySelector('.toast .toast-action-btn')", 5000)
            tt = await ev(page, "() => document.querySelector('.toast').textContent")
            check('Uebernahme: Hinweis mit freiwilliger Aktion', 'In Meine Rezepte gespeichert.' in tt and 'Zu einer Sammlung hinzufügen' in tt and not await ev(page, "() => !!state.modal"), tt)

        check('Keine Skriptfehler', not page.errs, page.errs[:3])
        await browser.close()
    report(t0)

asyncio.run(main())
