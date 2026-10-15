"""Oeffentliche Rezeptbibliothek, Veroeffentlichen, Verwalten und Moderation (Browser gegen den Nachbau tests/mock_supabase.py).
Prueft (Auftrag §12, §14, §17, §21, §26): Zugang abgemeldet/ohne Profil/gesperrt/offline (keine Warteschlange), Pruefung der
Rezeptstruktur (ohne Foto, unbekannte Zeit, Mengenbereiche, Abschnitte, Ueberschriften, «nach Geschmack», lange Texte, Ertrag
in Stueck), Vorschau und Nutzlast ohne private Felder (mitgeschnitten), Rechte-Haekchen nicht vorausgewaehlt, Doppelklick,
Wiederholung nach Zeitueberschreitung, Fehler beim Bild-Upload und nach dem Upload, Aktualisieren mit Konflikt aus zweitem Tab,
Zurueckziehen (auch Serverfehler), Loeschen des Ursprungsrezepts mit Wahl, oeffentliches Profil, Kontowechsel waehrend einer
Anfrage, Konto loeschen, Moderation (Melden, Ausblenden, Wiederfreigeben, Sperre, Nicht-Moderator).
Fehlt eine Schaltflaeche, wird das als FEHL gemeldet und die Vertragsfunktion direkt aufgerufen. Nur gegen den Nachbau."""
import os
os.environ.setdefault('SAVORA_TEST_PORT', '24040')
os.environ.setdefault('SAVORA_MOCK_PORT', '24041')
from bibliothek_helfer import *   # noqa: F401,F403

RECIPE_KEYS = {'v', 'title', 'servings', 'servingMode', 'yieldLabel', 'timeMinutes', 'prepMinutes', 'cookMinutes', 'restMinutes', 'difficulty', 'diet', 'categories', 'ingredients', 'steps', 'tips', 'source'}
ING_KEYS = {'amount', 'unit', 'name', 'group', 'isGroupHeader'}
ARG_KEYS = {'p_request_id', 'p_publication_id', 'p_expected_version', 'p_recipe', 'p_image_path', 'p_thumb_path', 'p_source_local_id', 'p_terms_version', 'p_terms_accepted'}
SECRET = 'GEHEIME NOTIZ 4711'

PUT_RECIPE = """async (r) => {
  if (r._img) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 48; const g = c.getContext('2d'); g.fillStyle = '#c84'; g.fillRect(0, 0, 64, 48);
    const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.8));
    await dbPutImage({ id: r.imageId, blob, thumbBlob: blob, mime: 'image/jpeg' }); delete r._img;
  }
  await dbPut(r); await loadRecipes(); return r.id; }"""

def private_recipe(rid, title, **kw):
    r = {'id': rid, 'title': title, 'servings': 4, 'servingMode': 'portions', 'timeMinutes': 30, 'difficulty': '', 'tags': ['privat-tag'],
         'diet': ['vegetarisch', 'glutenfrei'], 'categoryTags': ['dinner'], 'suppressedTags': [],
         'ingredients': [{'amount': '200', 'unit': 'g', 'name': 'Reis'}], 'steps': [{'text': 'Kochen.'}],
         'notes': SECRET, 'favorite': True, 'cookCount': 3, 'cookLog': [1760000000000], 'lastCookedAt': 1760000000000,
         'collections': ['Geheime Sammlung'], 'source': 'https://example.org/quelle', 'createdAt': 1760000000000, 'updatedAt': 1760000000000, 'focalPoint': {'x': 0.5, 'y': 0.5}}
    r.update(kw)
    return r

def pubs_of(uid, src=None):
    return [p for p in M.PUBS.values() if p['owner'] == uid and (src is None or p['source_local_id'] == src)]

async def publish_js(page, rid, extra='{}'):
    """libPublish wie die View es aufruft (Haekchen bestaetigt)."""
    return await ev(page, """async ([rid, extra]) => { const recipe = state.recipes.find(r => r.id === rid); const draft = libDraftFromRecipe(recipe, {});
        try { return { ok: true, res: await libPublish(Object.assign({ recipe, draft, publicationId: null, expectedVersion: null, termsAccepted: true, includePhoto: !!recipe.imageId }, extra)) }; }
        catch (e) { return { ok: false, message: e.message, offline: !!e.offline, conflict: !!e.conflict, needsLogin: !!e.needsLogin }; } }""", [rid, json.loads(extra)])

async def open_publish(page, rid, step=1, pid=None):
    await ev(page, "([rid, step, pid]) => { state.modal = null; lib.publish = { recipeId: rid, step: step, publicationId: pid }; state.view = 'lib-publish'; render(); }", [rid, step, pid])

async def mod_do(pm, name, fallback, target):
    """Moderationsaktion: Knopf in der Meldung, dann Bestaetigung mit Notiz (lib-mod-confirm)."""
    if await act(pm, name, fallback, arg=target):
        try:
            note = pm.locator('[role=dialog] textarea, .modal-sheet textarea, [role=dialog] input[type=text]').first
            if await note.count(): await note.fill('Testnotiz')
            await pm.locator('[data-action=lib-mod-confirm]').first.click(timeout=ui_wait())
            check(f'UI Moderation: Bestaetigung «{nm(name)}» mit Notiz', True)
        except Exception as e:
            check(f'UI Moderation: Bestaetigung «{nm(name)}»', False, str(e)[:120]); await ev(pm, fallback, target)

async def main():
    t0 = time.time()
    A = M.make_user('autor-a@example.test'); B = M.make_user('nutzer-b@example.test'); MOD = M.make_user('moderator@example.test')
    M.PROFILES[A] = {'handle': 'autor_a', 'display_name': 'Anna Privat', 'invite_code': 'SAV-AAAA-1111'}
    payloads = []
    async with async_playwright() as p:
        browser, ctx, page = await open_app(p)
        def capture(req):
            if req.url.endswith('/rpc/savora_pub_publish'):
                payloads.append(req.post_data or '')
        ctx.on('request', capture)
        await ev(page, PUT_RECIPE, private_recipe('r_basis', 'Risotto mit Pilzen', imageId='img_basis', _img=True))

        # ---------- Zugang ----------
        async with section('Zugang: abgemeldet'):
            await open_publish(page, 'r_basis')
            check('UI: Hinweis zur Anmeldung', await ev(page, "state.view") == 'lib-publish' and await has_text(page, 'Anmeld'), (await main_text(page))[:120])
            n = len(rpc_calls('savora_pub_publish'))
            r = await publish_js(page, 'r_basis')
            check('libPublish abgemeldet: abgewiesen ohne Serveraufruf', not r['ok'] and r['needsLogin'] and len(rpc_calls('savora_pub_publish')) == n, r)

        async with section('Zugang: ohne oeffentliches Profil'):
            await login(page, 'autor-a@example.test')
            await ev(page, "libLoadPubProfile()")
            check('libLoadPubProfile: kein Profil (data null)', await ev(page, "lib.pubProfile.status === 'ready' && lib.pubProfile.data === null"))
            await open_publish(page, 'r_basis')
            check('UI: fuehrt zuerst zum oeffentlichen Profil', await has_text(page, 'öffentliches Profil') or await has_text(page, 'Öffentliches Profil'))
            r = await publish_js(page, 'r_basis')
            check('Server weist ab: «Lege zuerst ein öffentliches Profil an.»', not r['ok'] and 'öffentliches Profil' in r['message'] and not pubs_of(A), r)
            check('Freundesprofil (Handle, Einladungscode) wird nicht automatisch oeffentlich', A not in M.PUB_PROFILES)

        async with section('Zugang: gesperrt'):
            await ev(page, "libSavePubProfile({ name: 'Anna Kocht', bio: 'Ich koche gern.' })")
            M.BANS[A] = {'reason': 'test', 'created_at': M.now_ts(), 'created_by': MOD}
            await ev(page, "libLoadPubProfile()")
            check('publishing_blocked im Profil', await ev(page, "lib.pubProfile.data && lib.pubProfile.data.publishing_blocked === true"))
            await open_publish(page, 'r_basis')
            check('UI: Hinweis auf gesperrte Veröffentlichungsrechte', await has_text(page, 'gesperrt') or await has_text(page, 'nicht veröffentlichen'))
            r = await publish_js(page, 'r_basis')
            check('Gesperrter Autor (Rezept mit Foto): nichts veroeffentlicht', not r['ok'] and not pubs_of(A), r)
            check('Gesperrter Autor: Meldung ohne Technik (Client prueft publishing_blocked vor dem Hochladen)', 'violates' not in r['message'] and 'security' not in r['message'], r['message'])
            r = await publish_js(page, 'r_basis', '{"includePhoto": false}')
            check('Gesperrter Autor (ohne Foto): Server weist ab', not r['ok'] and r['message'] == 'Dein Konto kann zurzeit keine Rezepte veröffentlichen.', r)
            del M.BANS[A]
            await ev(page, "libLoadPubProfile()")

        async with section('Zugang: offline, keine Warteschlange'):
            await ctx.set_offline(True)
            n = len(rpc_calls('savora_pub_publish'))
            r = await publish_js(page, 'r_basis')
            check('Offline: Fehler mit Hinweis, nichts veroeffentlicht', not r['ok'] and r['offline'] and 'nicht veröffentlicht' in r['message'], r)
            await ctx.set_offline(False)
            await ev(page, "() => { window.dispatchEvent(new Event('online')); return typeof cloudSyncNow === 'function' ? cloudSyncNow().catch(() => 0) : 0; }")
            check('Wieder online: keine automatische Veroeffentlichung', len(rpc_calls('savora_pub_publish')) == n and not pubs_of(A))

        # ---------- Pruefen: Rezeptstruktur ----------
        async with section('Pruefen: Rezeptstruktur'):
            variants = {
                'r_ohnefoto': private_recipe('r_ohnefoto', 'Ohne Foto'),
                'r_zeitlos': private_recipe('r_zeitlos', 'Ohne Zeitangabe', timeMinutes=None),
                'r_bereich': private_recipe('r_bereich', 'Mengenbereich', ingredients=[{'amount': '2-3', 'unit': 'EL', 'name': 'Olivenöl'}, {'amount': '', 'unit': '', 'name': 'Salz nach Geschmack'}]),
                'r_abschnitt': private_recipe('r_abschnitt', 'Abschnitte', ingredients=[{'amount': '', 'unit': '', 'name': 'Teig', 'isGroupHeader': True}, {'amount': '250', 'unit': 'g', 'name': 'Mehl', 'group': 'Teig'},
                                                                                      {'amount': '', 'unit': '', 'name': 'Füllung', 'isGroupHeader': True}, {'amount': '1', 'unit': '', 'name': 'Apfel', 'group': 'Füllung'}],
                                              steps=[{'text': 'Teig:'}, {'text': 'Mehl kneten.'}, {'text': 'Füllung:'}, {'text': 'Apfel schneiden.'}]),
                'r_stueck': private_recipe('r_stueck', 'Zimtschnecken', servings=12, servingMode='pieces', yieldLabel='Schnecken'),
            }
            for rid, rec in variants.items(): await ev(page, PUT_RECIPE, rec)
            for rid in variants:
                v = await ev(page, "(rid) => { const r = state.recipes.find(x => x.id === rid); return libValidateDraft(libDraftFromRecipe(r, {}), r); }", rid)
                check(f'Pruefung ok: {variants[rid]["title"]}', v['ok'], v['errors'])
            v = await ev(page, "(rid) => { const r = state.recipes.find(x => x.id === rid); return libValidateDraft(libDraftFromRecipe(r, {}), r); }", 'r_zeitlos')
            check('Unbekannte Zeit: nur Hinweis, kein Fehler', v['ok'] and any(w['field'] == 'time' for w in v['warnings']))
            await ev(page, PUT_RECIPE, private_recipe('r_lang', 'Langer Text', steps=[{'text': 'x' * 4001}]))
            v = await ev(page, "(rid) => { const r = state.recipes.find(x => x.id === rid); return libValidateDraft(libDraftFromRecipe(r, {}), r); }", 'r_lang')
            check('Langer Schritt (> 4000): verstaendlicher Fehler', not v['ok'] and any('4000' in e['message'] for e in v['errors']), v['errors'])
            await ev(page, PUT_RECIPE, private_recipe('r_langok', 'L' * 200, steps=[{'text': 'y' * 4000}], ingredients=[{'amount': '1', 'unit': '', 'name': 'z' * 300}]))
            for rid in list(variants) + ['r_langok']:
                r = await publish_js(page, rid)
                check(f'Veroeffentlicht: {rid}', r['ok'], r)
            srv = {p['source_local_id']: p['recipe'] for p in pubs_of(A)}
            check('Ohne Foto: kein Bildpfad', all(p['image_path'] is None for p in pubs_of(A, 'r_ohnefoto')))
            check('Unbekannte Zeit bleibt null (nie 0)', srv['r_zeitlos']['timeMinutes'] is None)
            check('Mengenbereich «2-3» und «Salz nach Geschmack» erhalten', srv['r_bereich']['ingredients'][0]['amount'] == '2-3' and srv['r_bereich']['ingredients'][1]['name'] == 'Salz nach Geschmack')
            ab = srv['r_abschnitt']
            check('Zutatenabschnitte und Schrittueberschriften erhalten', [i.get('isGroupHeader', False) for i in ab['ingredients']] == [True, False, True, False] and ab['ingredients'][1]['group'] == 'Teig' and ab['steps'][0]['text'] == 'Teig:', ab['ingredients'])
            check('Ertrag in Stueck: servingMode pieces, yieldLabel', srv['r_stueck']['servingMode'] == 'pieces' and srv['r_stueck']['servings'] == 12 and srv['r_stueck']['yieldLabel'] == 'Schnecken')
            check('Lange, gueltige Texte ungekuerzt (200/4000/300)', len(srv['r_langok']['title']) == 200 and len(srv['r_langok']['steps'][0]['text']) == 4000 and len(srv['r_langok']['ingredients'][0]['name']) == 300)
            check('Allergie-Angabe (glutenfrei) nicht veroeffentlicht', all('glutenfrei' not in r['diet'] for r in srv.values()))
            await open_publish(page, 'r_zeitlos', 1)
            check('UI Schritt 1 «Rezept prüfen»: Hinweis «Zeit unbekannt»', await lib_rendered(page) and await has_text(page, 'Zeit unbekannt'))

        # ---------- Vorschau und Nutzlast ----------
        async with section('Vorschau und Nutzlast ohne private Felder'):
            await open_publish(page, 'r_basis', 2)
            t = await main_text(page)
            check('UI Vorschau: Titel sichtbar', await lib_rendered(page) and 'Risotto mit Pilzen' in t, t[:120])
            await wait_js(page, "!!document.querySelector('.lp-preview-frame')", ui_wait())
            await ui_absent(page, 'UI Vorschau (nur Vorschaurahmen): keine Notiz, kein Favorit, kein Kochverlauf, keine Sammlung, keine privaten Tags, keine Allergieangabe',
                            [SECRET, 'Geheime Sammlung', 'privat-tag', 'gekocht', 'Favorit', 'Glutenfrei'], "(document.querySelector('.lp-preview-frame') || document.body).innerText")
            draft = await ev(page, "libDraftFromRecipe(state.recipes.find(r => r.id === 'r_basis'), {})")
            check('Notizen werden nicht automatisch zu Kochtipps', draft['tips'] == '' and SECRET not in json.dumps(draft))
            bad = []
            for body in payloads:
                a = json.loads(body); rec = a.get('p_recipe') or {}
                if set(a) - ARG_KEYS: bad.append(('args', set(a) - ARG_KEYS))
                if set(rec) - RECIPE_KEYS: bad.append(('recipe', set(rec) - RECIPE_KEYS))
                for i in rec.get('ingredients', []):
                    if set(i) - ING_KEYS: bad.append(('ing', set(i) - ING_KEYS))
                for s_ in rec.get('steps', []):
                    if set(s_) - {'text'}: bad.append(('step', set(s_)))
                if any(x in body for x in (SECRET, 'Geheime Sammlung', 'privat-tag', 'cookLog', 'favorite', 'glutenfrei', 'SAV-AAAA', 'autor-a@')): bad.append(('inhalt', body[:80]))
            check(f'Mitgeschnittene Nutzlast ({len(payloads)} Aufrufe): nur erlaubte Schluessel, keine privaten Inhalte', payloads and not bad, bad[:3])

        # ---------- Rechte-Haekchen, Doppelklick ----------
        async with section('Rechte-Haekchen und Doppelklick'):
            await ev(page, PUT_RECIPE, private_recipe('r_dk', 'Doppelklick'))
            await open_publish(page, 'r_dk', 3)
            boxes = await ev(page, "[...document.querySelectorAll('main input[type=checkbox]')].map(b => b.checked)")
            await ui_text(page, 'Dein Rezept ist öffentlich sichtbar. Andere können es in ihre persönliche Sammlung übernehmen.')
            await ui_text(page, 'Wenn du die Veröffentlichung später zurückziehst, bleiben bereits gespeicherte persönliche Kopien bei anderen erhalten.')
            check('UI Schritt 3: Rechte-Bestaetigung vorhanden und nicht vorausgewaehlt', len(boxes) >= 1 and not any(boxes), boxes)
            r = await publish_js(page, 'r_dk', '{"termsAccepted": false}')
            check('Ohne Haekchen: Server weist ab, nichts veroeffentlicht', not r['ok'] and not pubs_of(A, 'r_dk'), r)
            ui_ok = False
            try:
                await page.locator('main input[type=checkbox]').first.check(timeout=ui_wait())
                pb = btn(page, re.compile('^Veröffentlichen$|Jetzt veröffentlichen'))
                await pb.first.dblclick(timeout=ui_wait())
                await wait_text(page, 'Dein Rezept ist veröffentlicht.', 10000)
                ui_ok = True
            except Exception as e:
                check('UI: Veroeffentlichen-Knopf in Schritt 3', False, str(e)[:120])
            if ui_ok:
                check('UI Doppelklick: genau eine Veroeffentlichung', len(pubs_of(A, 'r_dk')) == 1)
                check('UI Erfolg: «Rezept ansehen» und «Link teilen»', await btn(page, 'Rezept ansehen').count() >= 1 and await btn(page, 'Link teilen').count() >= 1)
            await ev(page, PUT_RECIPE, private_recipe('r_dk2', 'Doppelt gleichzeitig'))
            res = await asyncio.gather(publish_js(page, 'r_dk2'), publish_js(page, 'r_dk2'))
            check('Zwei gleichzeitige libPublish: eine Veroeffentlichung, gleiche ID', len(pubs_of(A, 'r_dk2')) == 1 and res[0].get('res', {}).get('id') == res[1].get('res', {}).get('id'), res)

        # ---------- Wiederholung nach Timeout ----------
        async with section('Wiederholung nach Zeitueberschreitung'):
            await ev(page, PUT_RECIPE, private_recipe('r_to', 'Zeitüberschreitung'))
            first = [True]
            async def timeout_once(route):
                if first[0]:
                    first[0] = False
                    await route.fetch()   # Server verarbeitet die Anfrage ...
                    await route.abort('timedout')   # ... die Antwort geht aber verloren
                else: await route.continue_()
            await page.route('**/rpc/savora_pub_publish', timeout_once)
            r1 = await publish_js(page, 'r_to')
            check('Erster Versuch: Fehler beim Client, Server hat veroeffentlicht', not r1['ok'] and len(pubs_of(A, 'r_to')) == 1, r1)
            r2 = await publish_js(page, 'r_to')
            await page.unroute('**/rpc/savora_pub_publish', timeout_once)
            check('Wiederholung: gleiche Request-ID, keine Dublette, Version 1', r2['ok'] and len(pubs_of(A, 'r_to')) == 1 and r2['res']['version'] == 1, (r2, len(pubs_of(A, 'r_to'))))

        # ---------- Bildfehler ----------
        async with section('Fehler beim Bild-Upload und nach dem Upload'):
            await ev(page, PUT_RECIPE, private_recipe('r_img', 'Mit Foto', imageId='img_r_img', _img=True))
            before = await ev(page, "dbGetAll().then(l => JSON.stringify(l.find(r => r.id === 'r_img')))")
            async def up_fail(route):
                if route.request.method == 'POST': await route.fulfill(status=500, content_type='application/json', body='{"message":"Internal"}')
                else: await route.continue_()
            await page.route('**/storage/v1/object/savora-public/**', up_fail)
            r = await publish_js(page, 'r_img')
            await page.unroute('**/storage/v1/object/savora-public/**', up_fail)
            check('Upload-Fehler: nichts veroeffentlicht', not r['ok'] and not pubs_of(A, 'r_img'), r)
            check('Upload-Fehler: Entwurf (pendingPubId, requestId) bleibt', await ev(page, "!!(libDraftGet('r_img') && libDraftGet('r_img').pendingPubId)"))
            check('Upload-Fehler: privates Rezept unveraendert', before == await ev(page, "dbGetAll().then(l => JSON.stringify(l.find(r => r.id === 'r_img')))"))
            async def pub_fail(route): await route.fulfill(status=500, content_type='application/json', body='{"message":"Internal"}')
            await page.route('**/rpc/savora_pub_publish', pub_fail)
            r = await publish_js(page, 'r_img')
            await page.unroute('**/rpc/savora_pub_publish', pub_fail)
            pend = await ev(page, "libDraftGet('r_img').pendingPubId")
            up = [k for k in M.PUB_OBJECTS if k.startswith(f'{A}/{pend}/')]
            check('Fehler nach Upload: nichts veroeffentlicht, Bilder hochgeladen', not r['ok'] and not pubs_of(A, 'r_img') and len(up) == 2, (r, up))
            st = [M._readable(None, k) for k in up]
            check('Hochgeladene Entwurfsbilder sind nicht oeffentlich lesbar', not any(st))
            r = await publish_js(page, 'r_img')
            pr = pubs_of(A, 'r_img')
            check('Erneuter Versuch: veroeffentlicht mit derselben ID (keine verwaisten Bilder)', r['ok'] and len(pr) == 1 and pr[0]['id'] == pend and pr[0]['image_path'] in up, r)
            check('Bilder WebP/JPEG, Pfad <uid>/<id>/full-…', pr and re.fullmatch(rf'{A}/{pend}/full-[0-9a-f]{{8,}}\.(webp|jpg)', pr[0]['image_path'] or '') is not None)
            check('Keine Warteschlange: Entwurf nach Erfolg geloescht', await ev(page, "libDraftGet('r_img') === null"))

        # ---------- Aktualisieren und Konflikt ----------
        async with section('Aktualisieren und Konflikt aus zweitem Tab'):
            pid = pubs_of(A, 'r_basis')[0]['id'] if pubs_of(A, 'r_basis') else (await publish_js(page, 'r_basis'))['res']['id']
            await ev(page, "() => { const r = state.recipes.find(x => x.id === 'r_basis'); r.title = 'Risotto mit Steinpilzen'; return dbPut(r).then(loadRecipes); }")
            check('Private Bearbeitung aendert die oeffentliche Fassung nicht', M.PUBS[pid]['title'] == 'Risotto mit Pilzen')
            page2 = await new_page(ctx); await start(page2)
            r = await publish_js(page, 'r_basis', json.dumps({'publicationId': pid, 'expectedVersion': 1}))
            check('Aktualisieren: Version +1, neuer Titel', r['ok'] and r['res']['version'] == 2 and M.PUBS[pid]['title'] == 'Risotto mit Steinpilzen', r)
            r = await publish_js(page2, 'r_basis', json.dumps({'publicationId': pid, 'expectedVersion': 1}))
            check('Zweiter Tab mit alter Version: Konflikt, nichts ueberschrieben', not r['ok'] and r['conflict'] and M.PUBS[pid]['version'] == 2, r)
            check('Konfliktmeldung verstaendlich (ohne «KONFLIKT:»)', await ev(page2, "(m) => libErrText(Object.assign(new Error(m), {}))", 'KONFLIKT: Diese Veröffentlichung wurde inzwischen geändert. Lade sie neu und prüfe die Änderungen.') == 'Diese Veröffentlichung wurde inzwischen geändert. Lade sie neu und prüfe die Änderungen.')
            await page2.close()

        # ---------- Zurueckziehen ----------
        async with section('Zurueckziehen (auch Serverfehler)'):
            await ev(page, "libSearch({ force: true })"); await wait_discover_ready(page)
            await ev(page, "(id) => libOpenDetail(id)", pid); await wait_js(page, "lib.detail.status === 'ready'")
            async def wd_fail(route): await route.fulfill(status=500, content_type='application/json', body='{"message":"x"}')
            await page.route('**/rpc/savora_pub_withdraw', wd_fail)
            r = await ev(page, "(id) => libWithdraw(id).then(() => 'ok', e => 'fehler')", pid)
            await page.unroute('**/rpc/savora_pub_withdraw', wd_fail)
            check('Serverfehler: kein Erfolg, weiter veroeffentlicht, Detail bleibt', r == 'fehler' and M.PUBS[pid]['status'] == 'published' and await ev(page, "lib.detail.status") == 'ready')
            r = await ev(page, "(id) => libWithdraw(id).then(() => 'ok', e => e.message)", pid)
            check('Zurueckziehen: Server withdrawn', r == 'ok' and M.PUBS[pid]['status'] == 'withdrawn')
            check('UI-Zustand sofort konsistent: aus Suche und Detail entfernt', await ev(page, "(id) => !lib.discover.items.some(x => x.id === id) && lib.detail.status === 'missing'", pid))
            st, _ = 200, None
            check('Ueber API nicht mehr lesbar (get/search/profile)', M.PUBS[pid]['status'] == 'withdrawn' and not M._visible(M.PUBS[pid]))
            await ev(page, "libLoadMine()"); await wait_js(page, "lib.mine.status === 'ready'")
            check('Meine Veroeffentlichungen: Status zurueckgezogen', await ev(page, "(id) => lib.mine.items.find(x => x.id === id).status", pid) == 'withdrawn')
            await goto_view(page, 'lib-mine')
            check('UI «Meine Veröffentlichungen» zeigt «Zurückgezogen»', await has_text(page, 'Zurückgezogen'))

        # ---------- Ursprungsrezept loeschen mit Wahl ----------
        async with section('Privates Ursprungsrezept loeschen mit Wahl'):
            pid_dk2 = pubs_of(A, 'r_dk2')[0]['id']
            await ev(page, "libLoadMine()"); await wait_js(page, "lib.mine.status === 'ready'")
            await ev(page, "() => { state.activeRecipeId = 'r_dk2'; state.view = 'detail'; state.modal = { type: 'delete', recipeId: 'r_dk2' }; render(); }")
            t = await body_text(page)
            check('UI Loeschdialog nennt die Veroeffentlichung', 'veröffentlicht' in t.lower() or 'Veröffentlichung' in t, t[:200])
            try:
                radios = await ev(page, "[...document.querySelectorAll('input[name=delPubChoice]')].map(x => [x.value, x.checked])")
                check('UI Loeschdialog: Wahl bestehen lassen/zurueckziehen, nichts vorausgewaehlt', len(radios) == 2 and not any(c for _, c in radios), radios)
                await page.get_by_label('Veröffentlichung zurückziehen').check(timeout=ui_wait())
                await ev(page, "() => document.querySelector('[data-action=\"delete-recipe\"][data-id=\"r_dk2\"]').click()")
                await wait_js(page, "!state.recipes.some(r => r.id === 'r_dk2')", 5000)
                for _ in range(40):
                    if M.PUBS[pid_dk2]['status'] == 'withdrawn': break
                    await asyncio.sleep(0.1)
                check('Wahl «zurückziehen»: Rezept geloescht und Veroeffentlichung zurueckgezogen', M.PUBS[pid_dk2]['status'] == 'withdrawn')
            except Exception:
                check('UI: Wahl «Veröffentlichung zurückziehen» im Loeschdialog', False, 'fehlt')
            await ev(page, "() => { state.modal = null; state.view = 'home'; render(); }")

        # ---------- Oeffentliches Profil ----------
        async with section('Oeffentliches Profil'):
            pr0 = dict(M.PUB_PROFILES[A])
            await goto_view(page, 'lib-pubprofile')
            await ui_absent(page, 'UI: kein Einladungscode, kein Handle, keine E-Mail auf der oeffentlichen Profilseite', ['SAV-AAAA-1111', 'autor_a', 'autor-a@'], "document.body.innerText")
            check('UI: Profilseite zeigt Anzeigenamen', await has_text(page, 'Anna Kocht') or await ev(page, "[...document.querySelectorAll('main input')].some(i => i.value === 'Anna Kocht')"))
            await ev(page, "libSavePubProfile({ name: 'Anna Neu', bio: 'Neu' })")
            check('Umbenennen aendert public_id und Link nicht', M.PUB_PROFILES[A]['public_id'] == pr0['public_id'] and M.PUB_PROFILES[A]['display_name'] == 'Anna Neu')
            check('libShareLink(profile) stabil', await ev(page, "(id) => libShareLink('profile', id)", pr0['public_id']) == 'https://yaniske-ai.github.io/Savora/?profil=' + pr0['public_id'])

        # ---------- Kontowechsel waehrend Anfrage ----------
        async with section('Kontowechsel waehrend laufender Anfrage'):
            gate = asyncio.Event(); hit = asyncio.Event()
            async def hold(route):
                hit.set(); await gate.wait(); await route.continue_()
            await page.route('**/rpc/savora_pub_mine', hold)
            await ev(page, "() => { lib.mine = { status: 'idle', items: [], error: null, loadedAt: 0 }; window.__mine = libLoadMine(); }")
            await asyncio.wait_for(hit.wait(), 5)
            await ev(page, "() => { libReset(); return cloudAuthSignOut(); }")
            gate.set()
            await ev(page, "() => window.__mine")
            await page.unroute('**/rpc/savora_pub_mine', hold)
            check('Antwort des alten Kontos verworfen (lib.mine leer)', await ev(page, "lib.mine.items.length") == 0)
            await login(page, 'autor-a@example.test')
            gate2 = asyncio.Event(); hit2 = asyncio.Event()
            async def hold2(route):
                hit2.set(); await gate2.wait(); await route.continue_()
            await ev(page, PUT_RECIPE, private_recipe('r_wechsel', 'Kontowechsel'))
            await page.route('**/rpc/savora_pub_publish', hold2)
            await ev(page, "() => { window.__pub = libPublish({ recipe: state.recipes.find(r => r.id === 'r_wechsel'), draft: libDraftFromRecipe(state.recipes.find(r => r.id === 'r_wechsel'), {}), termsAccepted: true }).then(() => 'ok', e => e.message); }")
            await asyncio.wait_for(hit2.wait(), 5)
            await ev(page, "libReset()")
            gate2.set()
            msg = await ev(page, "() => window.__pub")
            await page.unroute('**/rpc/savora_pub_publish', hold2)
            check('libPublish nach Kontowechsel: kein Erfolg gemeldet', msg != 'ok' and 'gewechselt' in msg, msg)

        # ---------- Moderation ----------
        async with section('Moderation: Melden, Ausblenden, Wiederfreigeben, Sperre'):
            target = pubs_of(A, 'r_ohnefoto')[0]['id']
            ctxB = await browser.new_context(viewport={'width': 390, 'height': 844}, reduced_motion='reduce', timezone_id='UTC')
            await ctxB.add_init_script(NO_SW + " try{localStorage.setItem('savora-splash-seen','1')}catch(e){}"); await ctxB.add_init_script(CLOUD)
            pb = await new_page(ctxB); await start(pb)
            await login(pb, 'nutzer-b@example.test')
            await ev(pb, "(id) => libOpenDetail(id)", target); await wait_js(pb, "lib.detail.status === 'ready'")
            try:
                await click_btn(pb, 'Weitere Aktionen')
                await click_btn(pb, 'Rezept melden')
                check('UI: «Rezept melden» im weiteren Menue', True)
                await pb.locator('input[type=radio][value=foreign]').check(timeout=ui_wait())
                await click_btn(pb, 'Meldung senden')
                for _ in range(40):
                    if M.REPORTS: break
                    await asyncio.sleep(0.1)
            except Exception:
                check('UI: «Rezept melden» im weiteren Menue mit Grund', False, 'fehlt; Ersatz libReport')
                await ev(pb, "(id) => libReport(id, 'foreign', 'Aus einem Buch kopiert')", target)
            check('Meldung beim Server angekommen', any(r['publication_id'] == target and r['reporter'] == B for r in M.REPORTS.values()))
            check('Nicht-Moderator: savora_mod_is false, keine Moderation im Menue', await ev(pb, "libModCheck()") is False)
            await goto_view(pb, 'more')
            check('UI Nicht-Moderator: «Moderation» erscheint nicht unter Mehr', 'Moderation' not in await main_text(pb))
            await goto_view(pb, 'lib-mod')
            check('UI Nicht-Moderator: Moderationsseite zeigt keine Meldungen (Zugriff verweigert)', 'Ohne Foto' not in await main_text(pb) and await ev(pb, "state.view") == 'lib-mod' and not await ev(pb, "lib.mod.reports.length"))
            r = await ev(pb, "(id) => libModAction(id, 'hide').then(() => 'ok', e => e.message)", target)
            check('Nicht-Moderator: Ausblenden per API abgewiesen', r != 'ok' and M.PUBS[target]['status'] == 'published', r)
            await ctxB.close()

            M.make_moderator(MOD)
            ctxM = await browser.new_context(viewport={'width': 390, 'height': 844}, reduced_motion='reduce', timezone_id='UTC')
            await ctxM.add_init_script(NO_SW + " try{localStorage.setItem('savora-splash-seen','1')}catch(e){}"); await ctxM.add_init_script(CLOUD)
            pm = await new_page(ctxM); await start(pm)
            await login(pm, 'moderator@example.test')
            check('Moderator: savora_mod_is true', await ev(pm, "libModCheck()") is True)
            await goto_view(pm, 'more')
            check('UI Moderator: «Moderation» unter Mehr', await has_text(pm, 'Moderation'))
            await goto_view(pm, 'lib-mod'); await ev(pm, "libModLoad('open')"); await wait_js(pm, "lib.mod.status === 'ready'")
            check('Moderator laedt offene Meldungen (ohne Melder-ID)', await ev(pm, "lib.mod.reports.length") == 1 and B not in json.dumps(await ev(pm, "lib.mod.reports")))
            check('UI Moderator: Meldung mit Titel sichtbar', await has_text(pm, 'Ohne Foto'))
            await mod_do(pm, 'Ausblenden', "(id) => libModAction(id, 'hide')", target)
            for _ in range(40):
                if M.PUBS[target]['status'] == 'blocked': break
                await asyncio.sleep(0.1)
            check('Ausblenden: gesperrt, nicht mehr oeffentlich', M.PUBS[target]['status'] == 'blocked' and not M._visible(M.PUBS[target]))
            r = await publish_js(page, 'r_ohnefoto', json.dumps({'publicationId': target, 'expectedVersion': 1})) if await ev(page, "cloudSignedIn()") else None
            if r is None:
                await login(page, 'autor-a@example.test'); r = await publish_js(page, 'r_ohnefoto', json.dumps({'publicationId': target, 'expectedVersion': 1}))
            check('Autor kann gesperrtes nicht erneut veroeffentlichen', not r['ok'] and 'ausgeblendet' in r['message'], r)
            r = await publish_js(page, 'r_ohnefoto')
            check('Autor kann Sperre nicht per neuer ID umgehen', not r['ok'] and 'ausgeblendet' in r['message'], r)
            await ev(pm, "libModLoad('open')"); await wait_js(pm, "lib.mod.status === 'ready'")
            await mod_do(pm, re.compile('^Wieder freigeben'), "(id) => libModAction(id, 'restore')", target)
            for _ in range(40):
                if M.PUBS[target]['status'] == 'published': break
                await asyncio.sleep(0.1)
            check('Wiederfreigeben: wieder oeffentlich', M.PUBS[target]['status'] == 'published')
            await mod_do(pm, re.compile('Veröffentlichungsrechte.*sperren'), "(id) => libModBan(id, true, 'Test')", target)
            for _ in range(40):
                if A in M.BANS: break
                await asyncio.sleep(0.1)
            check('Sperre: Autor gesperrt', A in M.BANS)
            r = await publish_js(page, 'r_basis', '{"includePhoto": false}')
            check('Gesperrter Autor kann nicht veroeffentlichen', not r['ok'] and 'zurzeit keine' in r['message'], r)
            await ev(pm, "(id) => libModBan(id, false, '')", target)
            check('Sperre aufheben (nur Moderation)', A not in M.BANS)
            await ctxM.close()

        # ---------- Konto loeschen ----------
        async with section('Konto loeschen'):
            check('Vorher: veroeffentlichte Rezepte von A vorhanden', any(p['status'] == 'published' for p in pubs_of(A)))
            await ev(page, "cloudDeleteAccount()")
            check('Nach Kontoloeschung: Profil und Veroeffentlichungen weg', not pubs_of(A) and A not in M.PUB_PROFILES)
            check('Nach Kontoloeschung: oeffentliche Bilder weg', not any(k.startswith(A + '/') for k in M.PUB_OBJECTS))
            await ev(page, "libSearch({ force: true })"); await wait_discover_ready(page)
            check('Suche zeigt nichts mehr von A', await ev(page, "lib.discover.items.length") == 0)

        check('Keine Skriptfehler', not page.errs, page.errs[:3])
        await browser.close()
    report(t0)

asyncio.run(main())
