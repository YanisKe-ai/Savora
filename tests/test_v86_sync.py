"""v0.86 Sync: Naehrwert-Zuordnungen reisen im Rezept (recipe.nutritionMap) auf ein zweites Geraet.
Prueft Remember/Lookup, Zusammenfuehren (kein Verlust durch veraltete Kopien oder den Cloud-Abgleich), Pruefung/Sicherung,
Teilen (Feld bleibt) und Bibliothek (Feld nie oeffentlich), einmalige Uebernahme und zwei Geraete ueber den Mock-Server."""
import asyncio, sys, threading, json
import os as _os
_os.environ.setdefault('SAVORA_TEST_PORT', '47420')
sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
import mock_supabase as M
from http.server import ThreadingHTTPServer
# Mock-Server auf einem freien Port (vom System vergeben): kollidiert nie mit den Ports von run_all
srv = ThreadingHTTPServer(('127.0.0.1', int(_os.environ.get('SAVORA_V86_SYNC_MOCK_PORT', '0'))), M.H)
MOCK_PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
CLOUD = f"window.SAVORA_CLOUD_URL_OVERRIDE = 'http://127.0.0.1:{MOCK_PORT}'; window.SAVORA_CLOUD_KEY_OVERRIDE = 'test-key'; window.__SAVORA_NO_NUTRITION_BACKFILL = true;"
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

RECIPE = {'id': 'r_sync_1', 'title': 'Sauce-Pasta', 'servings': 2, 'timeMinutes': 20, 'difficulty': 'einfach', 'tags': [], 'diet': [],
          'categoryTags': [], 'ingredients': [{'amount': '200', 'unit': 'g', 'name': 'Butter'}, {'amount': '100', 'unit': 'g', 'name': 'Meine Sauce'}],
          'steps': [{'text': 'Kochen.'}], 'notes': 'privat', 'favorite': True, 'createdAt': 1000, 'updatedAt': 2000}

async def device(browser, name, cloud=True):
    ctx = await browser.new_context(viewport={'width': 800, 'height': 700}, reduced_motion='reduce', timezone_id='UTC')
    await ctx.add_init_script(NO_SW + " try{localStorage.setItem('savora-splash-seen','1')}catch(e){}")
    await ctx.add_init_script(CLOUD)
    page = await ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(f'{name}: {e}'))
    await goto(page)
    return ctx, page, errs

async def login(page, email, pw):
    await show(page, "() => { state.modal = null; state.view = 'settings-account'; render(); }", '#cloudEmail')
    await page.fill('#cloudEmail', email); await page.fill('#cloudPassword', pw)
    await page.evaluate("document.querySelector('[data-action=\"cloud-sign-in\"]').click()")
    await page.wait_for_function("cloudSignedIn() && !cloud.syncing", timeout=15000)
    await page.wait_for_timeout(300)

async def settle(*pages):
    # Abwechselnd abgleichen, bis beide Warteschlangen leer sind (zusammengefuehrte Eintraege werden neu vorgemerkt)
    for _ in range(8):
        for pg in pages:
            await pg.wait_for_function("!cloud.syncing", timeout=15000)
            res = await pg.evaluate("cloudSyncNow()"); await pg.wait_for_timeout(300)
            if _os.environ.get('V86_DEBUG'):
                info = await pg.evaluate("({ q: localStorage.getItem(CLOUD_QUEUE_KEY), m: JSON.parse(localStorage.getItem(CLOUD_META_KEY)||'{}')['recipe|r_sync_1'], keys: dbGetAll().then(l => Object.keys(l.find(r => r.id === 'r_sync_1').nutritionMap)) })")
                keys = await pg.evaluate("dbGetAll().then(l => Object.keys(l.find(r => r.id === 'r_sync_1').nutritionMap))")
                srvr = [ (v['client_updated_at'], sorted((v['data'] or {}).get('nutritionMap', {}))) for k, v in M.RECORDS.items() if k[2] == 'r_sync_1']
                print('DBG', res, info['q'], info['m'], keys, srvr)
        qs = [await pg.evaluate("Object.keys(JSON.parse(localStorage.getItem(CLOUD_QUEUE_KEY) || '{}')).length") for pg in pages]
        if not any(qs) and _ >= 2: return   # mind. drei Runden: jedes Geraet zieht den Stand des anderen

async def stored(page, rid):
    return await page.evaluate("(id) => dbGetAll().then(l => l.find(r => r.id === id) || null)", rid)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        # ---------- Geraet A: Remember / Lookup / Zusammenfuehren ----------
        ca, pa, errA = await device(browser, 'A')
        wrapped = await pa.evaluate("({ outer: !!dbPut.__cloudWrapped, inner: !!(cloudOrig.dbPut && cloudOrig.dbPut.__nsMerge), order: [...document.scripts].map(s => s.getAttribute('src')).filter(Boolean) })")
        order = wrapped['order']
        check('Skript vor nutrition-matcher.js und vor cloud.js eingebunden', order.index('nutrition-sync.js') < order.index('nutrition-matcher.js') < order.index('cloud.js'), str(order[:12]))
        check('Cloud nutzt das zusammenfuehrende dbPut (auch beim Uebernehmen)', wrapped['outer'] and wrapped['inner'], str(wrapped))
        await pa.evaluate("(r) => dbPut(r).then(loadRecipes)", RECIPE)
        cf = await pa.evaluate("""() => saveCustomFood({ name: 'Meine Sauce', nutrientsPer100g: { energyKcal: 321, fat: 12.5, protein: null } })""")
        r1 = await pa.evaluate("(cf) => nutritionSyncRemember('r_sync_1', 'butter', { normalizedIngredient: 'butter', foodId: 'swiss-butter-1', confirmedByUser: true }, null)", cf)
        r2 = await pa.evaluate("(cf) => nutritionSyncRemember('r_sync_1', 'meine sauce', { foodId: cf.id }, cf)", cf)
        r3 = await pa.evaluate("(cf) => nutritionSyncRemember('r_sync_1', 'butter', { foodId: 'swiss-butter-1' }, null)", cf)
        s = await stored(pa, 'r_sync_1')
        nm = s.get('nutritionMap') or {}
        check('Remember schreibt beide Zuordnungen', r1['changed'] and r2['changed'] and set(nm) == {'butter', 'meine sauce'}, json.dumps(nm)[:300])
        check('Remember ohne Aenderung schreibt nicht', r3['changed'] is False)
        check('Eintrag-Format: foodId, source, updatedAt', nm['butter']['foodId'] == 'swiss-butter-1' and nm['butter']['source'] == 'swiss' and nm['butter']['updatedAt'] > 0)
        cfe = nm['meine sauce']
        check('Eigenes Lebensmittel reist als Kopie mit (null bleibt null)', cfe['source'] == 'custom' and cfe['customFood']['id'] == cf['id'] and cfe['customFood']['nutrientsPer100g']['energyKcal'] == 321 and cfe['customFood']['nutrientsPer100g']['protein'] is None, json.dumps(cfe)[:300])
        same = {k: v for k, v in s.items() if k != 'nutritionMap'} == RECIPE
        check('Andere Felder unveraendert (auch updatedAt)', same, str({k: (s.get(k), RECIPE.get(k)) for k in RECIPE if s.get(k) != RECIPE.get(k)}))
        st = await pa.evaluate("!!(state.recipes.find(r => r.id === 'r_sync_1') || {}).nutritionMap")
        check('state.recipes nachgefuehrt (ohne neu zu zeichnen)', st)
        queued = await pa.evaluate("Object.keys(JSON.parse(localStorage.getItem(CLOUD_QUEUE_KEY) || '{}'))")
        check('Ohne Anmeldung keine Warteschlange (normaler dbPut-Weg)', queued == [], str(queued))
        # Veraltete Kopie (z. B. Editor vor der Zuordnung geoeffnet) loescht keine Eintraege
        await pa.evaluate("(r) => { const c = JSON.parse(JSON.stringify(r)); c.title = 'Neuer Titel'; return dbPut(c); }", RECIPE)
        s = await stored(pa, 'r_sync_1')
        check('Speichern einer alten Kopie behaelt nutritionMap', s['title'] == 'Neuer Titel' and set(s.get('nutritionMap') or {}) == {'butter', 'meine sauce'})
        # Zuruecksetzen = Grabstein, Lookup faellt auf global zurueck
        fg = await pa.evaluate("(async () => [await nutritionSyncForget('r_sync_1', 'butter'), await nutritionSyncForget('r_sync_1', 'butter'), await nutritionSyncForget('r_sync_1', 'gibtsnicht')])()")
        check('Forget: setzt Grabstein, zweites Mal und ohne Eintrag schreibt nichts', fg[0]['changed'] and not fg[1]['changed'] and not fg[2]['changed'], str(fg))
        lk = await pa.evaluate("dbGetAll().then(l => { const r = l.find(x => x.id === 'r_sync_1'); return [nutritionSyncLookup(r, 'butter'), nutritionSyncLookup(r, ['xyz', 'meine sauce']), nutritionSyncLookup({}, 'butter'), nutritionSyncLookup(null, 'x')]; })")
        check('Zurueckgesetzte Zuordnung: Lookup null', lk[0] is None)
        check('Lookup mit Schluesselliste findet eigenes Lebensmittel', lk[1] and lk[1]['foodId'] == cf['id'] and lk[1]['customFood']['nutrientsPer100g']['energyKcal'] == 321 and lk[1]['customFood']['nutrientsPer100g']['fat'] == 12.5, str(lk[1])[:200])
        check('Rezept ohne Feld / ohne Rezept: null, kein Fehler', lk[2] is None and lk[3] is None)
        # Pruefung, Sicherung, Teilen, Bibliothek
        v = await pa.evaluate("""() => {
          const old = validateRecipe({ id: 'a1', title: 'Alt', ingredients: [], steps: [] });
          const bad = validateRecipe({ id: 'a2', title: 'Kaputt', nutritionMap: { ok: { foodId: 'x-1', updatedAt: 5 }, schlecht: { foodId: '<script>', updatedAt: 1 }, ohneZeit: { foodId: 'y' }, tot: { deleted: true, updatedAt: 3 } } });
          const junk = validateRecipe({ id: 'a3', title: 'Liste', nutritionMap: [1, 2] });
          const bk = validateBackup({ app: 'savora', version: 1, recipes: [{ id: 'b1', title: 'Ohne Feld' }] });
          const bk2 = validateBackup({ app: 'savora', version: 1, recipes: [{ id: 'b2', title: 'Mit Feld', nutritionMap: { butter: { foodId: 'swiss-1', updatedAt: 9 } } }] });
          return { old: old.ok && !('nutritionMap' in old.recipe), badOk: bad.ok, badKeys: Object.keys(bad.recipe.nutritionMap).sort(), badWarn: bad.warnings.length,
                   junk: junk.ok && !('nutritionMap' in junk.recipe), bk: !bk.fatal && bk.recipes[0].ok, bk2: bk2.recipes[0].ok && bk2.recipes[0].recipe.nutritionMap.butter.foodId === 'swiss-1' };
        }""")
        check('Altes Rezept ohne Feld gueltig, Feld wird nicht erfunden', v['old'])
        check('Ungueltige Eintraege einzeln entfernt, Rezept gueltig', v['badOk'] and v['badKeys'] == ['ok', 'tot'] and v['badWarn'] >= 1, str(v))
        check('Feld als Liste: entfernt, Rezept gueltig', v['junk'])
        check('Alte Sicherung ohne Feld gueltig, neue behaelt Feld', v['bk'] and v['bk2'])
        sh = await pa.evaluate("""() => dbGetAll().then(l => { const r = l.find(x => x.id === 'r_sync_1');
          const pay = shareBuildPayload(r); const back = shareRecipeFromPayload(JSON.parse(JSON.stringify(pay)), 'freund');
          const evil = shareRecipeFromPayload({ title: 'X', nutritionMap: { a: { foodId: 'bad id!', updatedAt: 1 } } });
          const draft = libDraftFromRecipe(r, {}); const strip = libStripPrivateFields(Object.assign({}, draft, { nutritionMap: r.nutritionMap }));
          return { pay: !!pay.nutritionMap, back: !!(back.nutritionMap && back.nutritionMap['meine sauce'] && back.nutritionMap['meine sauce'].customFood), evil: !('nutritionMap' in evil),
                   draft: !('nutritionMap' in draft) && !JSON.stringify(draft).includes('Meine Sauce\\",\\"nutrientsPer100g'), strip: !('nutritionMap' in strip) }; })""")
        check('Teilen: Feld geht mit und kommt geprueft an', sh['pay'] and sh['back'] and sh['evil'], str(sh))
        check('Bibliothek: Entwurf und Veroeffentlichung ohne nutritionMap', sh['draft'] and sh['strip'], str(sh))

        # ---------- Einmalige Uebernahme lokaler Zuordnungen ----------
        bf = await pa.evaluate("""async () => {
          await dbPut({ id: 'r_bf_1', title: 'Kuchen', servings: 4, ingredients: [{ amount: '100', unit: 'g', name: 'Zucker' }, { amount: '50', unit: 'g', name: 'Meine Sauce' }, { amount: '1', unit: '', name: 'Unbekanntes' }], steps: [], createdAt: 1, updatedAt: 77 });
          await dbPutNutritionMatch({ normalizedIngredient: 'zucker', foodId: 'swiss-zucker', confirmedByUser: true, updatedAt: 500 });
          localStorage.removeItem(NUTRITION_SYNC_BACKFILL_KEY);
          const a = await nutritionSyncBackfillOnce(); const b = await nutritionSyncBackfillOnce();
          const r = (await dbGetAll()).find(x => x.id === 'r_bf_1'); const r1 = (await dbGetAll()).find(x => x.id === 'r_sync_1');
          return { a, b, map: r.nutritionMap, upd: r.updatedAt, r1butter: r1.nutritionMap.butter };
        }""")
        check('Uebernahme schreibt Zuordnung und eigenes Lebensmittel', bf['a']['written'] >= 1 and bf['map']['zucker']['foodId'] == 'swiss-zucker' and bf['map']['meine sauce']['customFood']['id'] == cf['id'] and 'unbekanntes' not in bf['map'], json.dumps(bf)[:400])
        check('Uebernahme: alter Zeitstempel, updatedAt des Rezepts bleibt', bf['map']['zucker']['updatedAt'] == 500 and bf['upd'] == 77)
        check('Uebernahme ueberschreibt vorhandene Eintraege nicht (Grabstein bleibt)', bf['r1butter'].get('deleted') is True)
        check('Uebernahme nur einmal pro Geraet', bf['b'].get('skipped') is True)
        lim = await pa.evaluate("""async () => { localStorage.removeItem(NUTRITION_SYNC_BACKFILL_KEY);
          const a = await nutritionSyncBackfillOnce({ limit: 1 }); const f1 = JSON.parse(localStorage.getItem(NUTRITION_SYNC_BACKFILL_KEY));
          let n = 0, last = a; while (!last.done && !last.skipped && n < 10) { last = await nutritionSyncBackfillOnce({ limit: 1 }); n++; }
          return { first: a.done, f1, end: JSON.parse(localStorage.getItem(NUTRITION_SYNC_BACKFILL_KEY)) }; }""")
        check('Begrenzung: in Teilen ueber mehrere Starts, dann fertig', lim['first'] is False and lim['f1']['done'] is False and lim['end']['done'] is True, str(lim))

        # ---------- Zweites Geraet ohne Cloud: Rezept mit Feld in frischem Kontext ----------
        exported = await stored(pa, 'r_sync_1')
        cb, pb, errB = await device(browser, 'B')
        await pb.evaluate("async (cf) => { await saveCustomFood({ id: 'custom-lokal-1', name: 'Lokal', nutrientsPer100g: { energyKcal: 1 } }); }", None)
        exported['nutritionMap']['lokal'] = {'foodId': 'custom-lokal-1', 'source': 'custom', 'name': 'Fremd', 'updatedAt': 9, 'customFood': {'id': 'custom-lokal-1', 'name': 'Fremd', 'nutrientsPer100g': {'energyKcal': 999}}}
        res = await pb.evaluate("""async (r) => { const v = validateRecipe(r); await dbPut(v.recipe); await loadRecipes();
          const rec = state.recipes.find(x => x.id === r.id);
          const before = (await dbGetAllCustomFoods()).map(f => f.id);
          const l = await nutritionSyncLookup(rec, 'meine sauce'); const l2 = nutritionSyncLookup(rec, 'lokal');
          await new Promise(res => setTimeout(res, 300));
          const after = await dbGetAllCustomFoods();
          return { l, before, after: after.map(f => ({ id: f.id, kcal: f.nutrientsPer100g.energyKcal, name: f.name })), l2 }; }""", exported)
        check('Zweites Geraet: Lookup liefert Zuordnung aus dem Rezept', res['l'] and res['l']['foodId'] == cf['id'] and res['l']['customFood']['nutrientsPer100g']['energyKcal'] == 321, str(res['l'])[:200])
        made = [f for f in res['after'] if f['id'] == cf['id']]
        check('Fehlendes eigenes Lebensmittel lokal angelegt (gleiche ID)', cf['id'] not in res['before'] and len(made) == 1 and made[0]['kcal'] == 321 and made[0]['name'] == 'Meine Sauce', str(res['after']))
        loc = [f for f in res['after'] if f['id'] == 'custom-lokal-1']
        check('Vorhandenes lokales Lebensmittel nicht ueberschrieben', loc and loc[0]['kcal'] == 1 and loc[0]['name'] == 'Lokal', str(loc))
        await cb.close()

        # ---------- Zwei Geraete ueber den Cloud-Abgleich (Mock) ----------
        import uuid as _u
        M.USERS['naehr@example.test'] = {'id': str(_u.uuid4()), 'password': 'geheim-123', 'confirmed': True}
        await login(pa, 'naehr@example.test', 'geheim-123')
        cb2, pb2, errB2 = await device(browser, 'B2')
        await login(pb2, 'naehr@example.test', 'geheim-123')
        r_b = await stored(pb2, 'r_sync_1')
        check('Cloud: Rezept mit nutritionMap kommt auf Geraet B an', r_b and r_b.get('nutritionMap', {}).get('meine sauce', {}).get('customFood', {}).get('id') == cf['id'], str((r_b or {}).get('nutritionMap'))[:200])
        lkb = await pb2.evaluate("nutritionSyncLookup(state.recipes.find(r => r.id === 'r_sync_1'), 'meine sauce')")
        check('Cloud: Lookup auf B liefert Zuordnung', lkb and lkb['foodId'] == cf['id'])
        # Gleichzeitig verschiedene Zutaten zuordnen: nichts geht verloren
        await pa.evaluate("nutritionSyncRemember('r_sync_1', 'pfeffer', { foodId: 'swiss-pfeffer' }, null)")
        await pb2.evaluate("nutritionSyncRemember('r_sync_1', 'salz', { foodId: 'swiss-salz' }, null)")
        await pa.wait_for_timeout(50)
        await settle(pa, pb2)
        ka = set((await stored(pa, 'r_sync_1'))['nutritionMap']); kb = set((await stored(pb2, 'r_sync_1'))['nutritionMap'])
        check('Konflikt: beide Geraete haben beide neuen Eintraege', {'pfeffer', 'salz'} <= ka and {'pfeffer', 'salz'} <= kb, f"A={sorted(ka)} B={sorted(kb)}")
        # Gleiche Zutat verschieden zugeordnet: der neuere gewinnt
        await pa.evaluate("nutritionSyncRemember('r_sync_1', 'salz', { foodId: 'swiss-salz-A' }, null)")
        await pa.wait_for_timeout(30)
        await pb2.evaluate("nutritionSyncRemember('r_sync_1', 'salz', { foodId: 'swiss-salz-B' }, null)")
        await settle(pa, pb2)
        fa = (await stored(pa, 'r_sync_1'))['nutritionMap']['salz']['foodId']; fb = (await stored(pb2, 'r_sync_1'))['nutritionMap']['salz']['foodId']
        check('Konflikt gleiche Zutat: neuerer Eintrag gewinnt auf beiden', fa == 'swiss-salz-B' and fb == 'swiss-salz-B', f"A={fa} B={fb}")
        q = await pa.evaluate("Object.keys(JSON.parse(localStorage.getItem(CLOUD_QUEUE_KEY) || '{}')).length")
        check('Kein Pingpong: Warteschlange leer nach Abgleich', q == 0, str(q))
        allerr = errA + errB + errB2
        check('Keine Seitenfehler', not allerr, str(allerr[:3]))
        await browser.close()
    print('FEHLER:', FAIL if FAIL else 'keine')
    sys.exit(1 if FAIL else 0)

asyncio.run(main())
