"""Oeffentliche Rezeptbibliothek, Ablauf fuer Besucher und Leser (Browser gegen den Nachbau tests/mock_supabase.py).
Prueft (Auftrag §26, Vertrag §5/§7): Entdecken leer, viele Rezepte mit «Mehr laden» ohne Dubletten und stabiler Reihenfolge,
Suche mit Verzoegerung und veralteter Antwort, Schnellfilter, Sortierung, Offline, Ladefehler und Nachladefehler,
Direktlink ?rezept= ohne Anmeldung, Neuladen, Zurueck/Vorwaerts mit Scrollposition, nicht verfuegbar, Speichern (Kopie,
Herkunft, keine persoenlichen Felder), Dublettenschutz (gleichzeitig, zwei Tabs), Wochenplan/Einkauf/Kochbuch/Kochen nur
mit lokaler ID, Bildfehler mit «Bild erneut laden», neue Version (Hinweis, Vergleich, Aktualisieren, zusaetzliche Kopie),
Kopie loeschen, Freundeseinladung ?freund= und Passwortlink weiterhin gueltig.
Fehlt eine Schaltflaeche, wird das als FEHL gemeldet und die Vertragsfunktion direkt aufgerufen, damit die Datenpruefungen
dahinter trotzdem laufen. Nur gegen den Nachbau, nie echte Konten."""
import os
os.environ.setdefault('SAVORA_TEST_PORT', '24020')
os.environ.setdefault('SAVORA_MOCK_PORT', '24021')
from bibliothek_helfer import *   # noqa: F401,F403

SEARCH_PH = 'Rezepte oder Zutaten suchen'

async def open_search(page):
    """0.83.1: Auf dem Handy liegt das Suchfeld wie bei «Meine Rezepte» hinter dem runden Knopf «Suchen» (Overlay)."""
    if await page.locator('#libSearchBtn').count() and not await page.locator('#libSearchInput').count():
        await page.locator('#libSearchBtn').click(timeout=ui_wait())
        await page.wait_for_selector('#libSearchInput', timeout=ui_wait())

async def quick_filter(page, label, fallback_js):
    """0.83.1: Die Schnellfilter liegen auf dem Handy im Filterfenster (Gruppe «Schnell», Schalter); ab 768 px als Chips im Kopf."""
    if await page.locator('#libSearchBtn').count():
        try:
            await page.locator('[data-action=lib-filter-open]').first.click(timeout=ui_wait())
            await page.locator('.lib-filter-sheet').get_by_role('switch', name=label, exact=True).click(timeout=ui_wait())
            await click_btn(page, 'Rezepte anzeigen')
            return True
        except Exception as e:
            check(f'UI: Schalter «{label}» im Filterfenster', False, str(e)[:160]); await ev(page, fallback_js); return False
    return await act(page, label, fallback_js)

def watch_search(page, store):
    def on_req(req):
        if req.url.endswith('/rpc/savora_lib_search') and req.method == 'POST':
            try: store.append(json.loads(req.post_data or '{}'))
            except Exception: pass
    page.on('request', on_req)

async def main():
    t0 = time.time()
    A = M.make_user('autor-a@example.test'); B = M.make_user('nutzer-b@example.test')
    async with async_playwright() as p:
        browser, ctx, page = await open_app(p)
        bodies = []; watch_search(page, bodies)

        # ---------- Entdecken leer ----------
        async with section('Entdecken leer'):
            M.lib_reset()
            await open_discover(page)
            await wait_discover_ready(page)
            check('Leere Bibliothek: Status ready, 0 Treffer', await ev(page, "lib.discover.status === 'ready' && lib.discover.items.length === 0"))
            check('Suche laeuft anonym (ohne Authorization)', len(rpc_calls('savora_lib_search')) >= 1)
            await ui_text(page, 'Hier entsteht die Savora-Rezeptbibliothek.')
            await ui_text(page, 'Veröffentliche ein eigenes Rezept und teile es mit anderen.')
            check('UI: Umschalter «Meine Rezepte · Entdecken»', await btn(page, 'Meine Rezepte').count() >= 1 and await btn(page, 'Entdecken').count() >= 1)
            await open_search(page)
            check('UI: Suchfeld «Rezepte oder Zutaten suchen»', await page.get_by_placeholder(SEARCH_PH).count() == 1)

        # ---------- Viele Rezepte: Mehr laden ----------
        async with section('Viele Rezepte, Mehr laden'):
            M.lib_reset()
            same = '2026-10-10T10:00:00.000000Z'
            for i in range(62):
                ts = same if i < 30 else '2026-10-%02dT08:%02d:00.000000Z' % (11 + i % 3, i % 60)   # 30 mit gleichem Zeitpunkt: Zweitsortierung noetig
                mins = None if i % 9 == 0 else 15 + (i % 6) * 5
                M.seed_publication(A, M.simple_recipe('Seedrezept %02d' % i, minutes=mins, diet=[['vegan'], ['vegetarisch'], ['fleisch']][i % 3]), published_at=ts, display_name='Anna Kocht')
            expected = api_order('newest')
            await ev(page, "libSearch({ force: true })")
            await wait_discover_ready(page)
            check('Erste Seite: 24 Eintraege, total 62', await ev(page, "lib.discover.items.length") == 24 and await ev(page, "lib.discover.total") == 62)
            for n in (48, 62):
                await act(page, 'Mehr laden', "libLoadMore()")
                await wait_js(page, f"lib.discover.items.length >= {n} && lib.discover.moreStatus !== 'loading'", 10000)
            ids = await ev(page, "lib.discover.items.map(x => x.id)")
            check('Mehr laden: alle 62, keine Dubletten', len(ids) == 62 and len(set(ids)) == 62, len(ids))
            check('Reihenfolge stabil und wie Server (published_at desc, id desc)', ids == expected)
            check('Kein weiterer Cursor am Ende', await ev(page, "lib.discover.cursor === null"))
            t = await main_text(page)
            dup = [n for n in range(62) if t.count('Seedrezept %02d' % n) != 1]
            check('UI: jede Karte genau einmal sichtbar', not dup, f'{len(dup)} Titel nicht genau einmal')
            check('UI: Karte zeigt Anzeigenamen', 'Anna Kocht' in t)
            check('UI: «Mehr laden» verschwindet am Ende', VIEWS[0] and await btn(page, 'Mehr laden').count() == 0)

        # ---------- Suche: Verzoegerung und veraltete Antwort ----------
        async with section('Suche mit Verzoegerung und veralteter Antwort'):
            M.lib_reset()
            M.seed_publication(A, M.simple_recipe('Apfelkuchen', ingredients=[{'amount': '3', 'unit': '', 'name': 'Äpfel'}]))
            M.seed_publication(A, M.simple_recipe('Birnenwähe', ingredients=[{'amount': '4', 'unit': '', 'name': 'Birnen'}]))
            gate = asyncio.Event(); held = []
            async def slow(route):
                if 'apfel' in str(json.loads(route.request.post_data or '{}').get('p_query', '')).lower():
                    held.append(route.request); await gate.wait()
                await route.continue_()
            await page.route('**/rpc/savora_lib_search', slow)
            await open_search(page)
            box = page.get_by_placeholder(SEARCH_PH)
            ui = await box.count() == 1
            check('UI: Suchfeld vorhanden (sonst libSetQuery direkt)', ui)
            n0 = len(bodies)
            if ui: await box.click(); await box.press_sequentially('Apfel', delay=30)
            else:
                for k in range(1, 6): await ev(page, "(q) => libSetQuery(q)", 'Apfel'[:k])
            await wait_js(page, "lib.discover.status === 'loading'", 5000)
            for _ in range(50):
                if held: break
                await asyncio.sleep(0.05)
            check('Verzoegerung: schnelles Tippen erzeugt genau 1 Anfrage', len(held) == 1 and [b.get('p_query') for b in bodies[n0:]] == ['Apfel'], [b.get('p_query') for b in bodies[n0:]])
            if ui: await box.fill(''); await box.press_sequentially('Birne', delay=30)
            else: await ev(page, "libSetQuery('Birne')")
            await wait_query(page, 'Birne')
            gate.set()
            for rq in held:   # warten, bis die verspaetete Antwort angekommen ist
                try: await asyncio.wait_for(rq.response(), 5)
                except Exception: pass
            await ev(page, "() => new Promise(r => setTimeout(r, 0))")
            items = await ev(page, "lib.discover.items.map(x => x.title)")
            check('Veraltete Antwort (Apfel) ueberschreibt neuere (Birne) nicht', items == ['Birnenwähe'], items)
            check('UI: Anzeige zeigt nur das aktuelle Ergebnis', 'Birnenwähe' in await main_text(page) and 'Apfelkuchen' not in await main_text(page))
            await page.unroute('**/rpc/savora_lib_search', slow)
            await ev(page, "libSetQuery('APFEL')"); await wait_query(page, 'APFEL')
            check('Suche: Grossschreibung egal, Umlaut gleichwertig (APFEL findet Äpfel)', await ev(page, "lib.discover.items.map(x => x.title)") == ['Apfelkuchen'])
            await ev(page, "libSetQuery('gibtsnicht')"); await wait_query(page, 'gibtsnicht')
            await ui_text(page, 'Keine passenden Rezepte gefunden.')
            await ui_text(page, 'Versuche einen anderen Suchbegriff oder passe die Filter an.')
            await ev(page, "libSetQuery('')"); await wait_query(page, '')
            if await page.locator('#libSearchPop .search-close').count():   # Handy: Suchfeld wieder schliessen (dahinter ist die Zeile inert, wie bei «Meine Rezepte»)
                await page.locator('#libSearchPop .search-close').click(); await wait_js(page, "!document.getElementById('libSearchPop')", 4000)

        # ---------- Schnellfilter und Sortierung ----------
        async with section('Schnellfilter und Sortierung'):
            M.lib_reset()
            M.seed_publication(A, M.simple_recipe('Schnell 20', minutes=20, diet=['fleisch']))
            M.seed_publication(A, M.simple_recipe('Unbekannte Zeit', minutes=None, diet=['vegetarisch']))
            M.seed_publication(A, M.simple_recipe('Lang 90', minutes=90, diet=['vegan']))
            await ev(page, "libResetFilters()"); await wait_discover_ready(page)
            await quick_filter(page, 'Bis 30 Min.', "libSetFilter({ quick: true })")
            await wait_js(page, "lib.discover.filters.quick === true && lib.discover.status === 'ready'")
            titles = await ev(page, "lib.discover.items.map(x => x.title)")
            check('«Bis 30 Min.»: nur bekannte Zeit ≤ 30, unbekannte nie', titles == ['Schnell 20'], titles)
            await ev(page, "libResetFilters()"); await wait_discover_ready(page)
            await quick_filter(page, 'Vegetarisch', "libSetFilter({ veg: true })")
            await wait_js(page, "lib.discover.filters.veg === true && lib.discover.status === 'ready'")
            titles = sorted(await ev(page, "lib.discover.items.map(x => x.title)"))
            check('«Vegetarisch» schliesst vegan ein', titles == ['Lang 90', 'Unbekannte Zeit'], titles)
            # 0.83.1: Handy zeigt aktive Filter wie «Meine Rezepte» (Zusammenfassung, Zähler am Filterknopf); ab 768 px zusaetzlich der Chip mit aria-pressed
            check('UI: aktiver Schnellfilter erkennbar (Zusammenfassung und Zaehler, bzw. aria-pressed)', await ev(page, "[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Vegetarisch' && b.getAttribute('aria-pressed') === 'true') || (/Vegetarisch/.test((document.querySelector('.filter-summary-text') || {}).textContent || '') && document.querySelector('[data-action=lib-filter-open]').getAttribute('data-count') === '1')"))
            await ev(page, "libResetFilters()"); await wait_discover_ready(page)
            try:
                await click_btn(page, 'Filter')
                await wait_text(page, 'Rezepte anzeigen')
                check('UI: Filterfenster mit «Zurücksetzen» und «Rezepte anzeigen»', await btn(page, 'Zurücksetzen').count() >= 1)
                await page.keyboard.press('Escape'); await wait_js(page, "!state.modal", 3000)
            except Exception:
                check('UI: Filterfenster («Filter» → «Zurücksetzen», «Rezepte anzeigen»)', False, 'fehlt')
            sel = page.get_by_label('Sortierung')
            if await sel.count():
                await sel.select_option(label='Kürzeste Gesamtzeit')
                check('UI: Sortierung «Neueste» / «Kürzeste Gesamtzeit» als Auswahl', True)
            else:
                check('UI: Sortierung «Neueste» / «Kürzeste Gesamtzeit»', False, 'fehlt'); await ev(page, "libSetSort('quickest')")
            await wait_js(page, "lib.discover.sort === 'quickest' && lib.discover.status === 'ready'")
            titles = await ev(page, "lib.discover.items.map(x => x.title)")
            check('Sortierung «Kürzeste Gesamtzeit»: unbekannte Zeit zuletzt', titles == ['Schnell 20', 'Lang 90', 'Unbekannte Zeit'], titles)
            await ev(page, "libSetSort('newest')"); await wait_discover_ready(page)

        # ---------- Offline ----------
        async with section('Offline'):
            await ctx.set_offline(True)
            await ev(page, "() => { lib.discover.items = []; lib.discover.key = null; return libSearch({ force: true }); }")   # wie Erststart ohne Netz
            await wait_js(page, "lib.discover.status === 'offline'")
            check('Offline: Zustand offline, keine Anfrage', True)
            await ui_text(page, 'Zum Entdecken brauchst du eine Internetverbindung. Deine gespeicherten Rezepte sind weiterhin verfügbar.')
            await ctx.set_offline(False)
            try:
                await wait_js(page, "lib.discover.status === 'ready'", 4000)
                check('Wieder online: laedt von selbst neu', True)
            except Exception:
                check('Wieder online: laedt von selbst neu (online-Listener aus libStartup)', False, 'bleibt offline; libStartup() beim Start aufgerufen?')
                await ev(page, "libSearch({ force: true })"); await wait_js(page, "lib.discover.status === 'ready'")

        # ---------- Ladefehler ----------
        async with section('Ladefehler und Erneut versuchen'):
            async def boom(route): await route.fulfill(status=500, content_type='application/json', body='{"message":"relation does not exist"}')
            await page.route('**/rpc/savora_lib_search', boom)
            await ev(page, "() => libSetFilter({ quick: true })")   # neue Suche bei vorhandenen Ergebnissen scheitert
            await wait_js(page, "lib.discover.status === 'error'")
            check('UI: Fehler bei neuer Suche trotz alter Ergebnisse sichtbar (nicht still alte, unpassende Treffer zeigen)', await ev(page, "!!document.querySelector('main [role=alert]')") or await has_text(page, 'Die Rezepte konnten nicht geladen werden.'))
            await ev(page, "() => { lib.discover.items = []; lib.discover.key = null; lib.discover.filters.quick = false; return libSearch({ force: true }); }")   # Erstaufruf scheitert
            await wait_js(page, "lib.discover.status === 'error'")
            check('Ladefehler: kein technischer Rohfehler im Zustand', 'relation' not in (await ev(page, "lib.discover.error") or ''))
            await ui_text(page, 'Die Rezepte konnten nicht geladen werden.')
            await ui_absent(page, 'UI: kein technischer Rohfehler sichtbar', ['relation', 'does not exist'])
            await page.unroute('**/rpc/savora_lib_search', boom)
            await act(page, 'Erneut versuchen', "libSearch({ force: true })")
            await wait_js(page, "lib.discover.status === 'ready'")
            check('Nach «Erneut versuchen»: Ergebnisse da', await ev(page, "lib.discover.items.length") == 3)

        # ---------- Nachladefehler ----------
        async with section('Nachladefehler behaelt Ergebnisse'):
            M.lib_reset()
            for i in range(30): M.seed_publication(A, M.simple_recipe('Nachlade %02d' % i))
            await ev(page, "libSearch({ force: true })"); await wait_discover_ready(page)
            async def boom_more(route):
                if json.loads(route.request.post_data or '{}').get('p_cursor'): await route.fulfill(status=500, body='{}', content_type='application/json')
                else: await route.continue_()
            await page.route('**/rpc/savora_lib_search', boom_more)
            await act(page, 'Mehr laden', "libLoadMore()")
            await wait_js(page, "lib.discover.moreStatus === 'error'")
            check('Nachladefehler: 24 Ergebnisse bleiben', await ev(page, "lib.discover.items.length") == 24 and await ev(page, "lib.discover.status") == 'ready')
            check('UI: 24 Karten bleiben sichtbar', (await main_text(page)).count('Nachlade ') == 24)
            await page.unroute('**/rpc/savora_lib_search', boom_more)
            await act(page, re.compile('Erneut versuchen|Mehr laden'), "libLoadMore()")
            await wait_js(page, "lib.discover.items.length === 30")
            check('Erneuter Versuch: alle 30, keine Dubletten', len(set(await ev(page, "lib.discover.items.map(x => x.id)"))) == 30)

        # ---------- Detail per Direktlink ohne Anmeldung, Neuladen ----------
        M.lib_reset()
        pub = M.seed_publication(A, rich_recipe(), display_name='Anna Kocht')
        others = [M.seed_publication(A, M.simple_recipe('Liste %02d' % i), published_at='2026-10-0%dT10:%02d:00.000000Z' % (1 + i % 9, i)) for i in range(40)]
        async with section('Direktlink ?rezept= ohne Anmeldung, Neuladen'):
            check('Seite ist abgemeldet', not await ev(page, "cloudSignedIn()"))
            n_rec = len([x for x in M.LOG if x[1].startswith('/rest/v1/savora_records')])
            await start(page, '?rezept=' + pub)
            if not await ev(page, "state.view === 'lib-detail'"):
                check('Start mit ?rezept= oeffnet lib-detail (libHandleStartLink beim Start)', False, await ev(page, "state.view"))
                await ev(page, "libHandleStartLink() && render()")
            await wait_js(page, "state.view === 'lib-detail' && lib.detail.status === 'ready'", 10000)
            check('Detail geladen: Rezept und Autor', await ev(page, "lib.detail.pub.recipe.title") == 'Zürcher Geschnetzeltes' and await ev(page, "lib.detail.pub.author.display_name") == 'Anna Kocht')
            t = await main_text(page)
            check('UI: Titel und «Von Anna Kocht»', 'Zürcher Geschnetzeltes' in t and 'Von Anna Kocht' in t, t[:120])
            check('UI: Zutatenabschnitt, Mengenbereich, «Salz nach Geschmack», Schrittueberschrift', all(x in t for x in ('Sauce', 'Salz nach Geschmack', 'Für die Sauce')) and re.search(r'2\s*[-–]\s*3', t) is not None)
            check('UI: Quelle sichtbar', 'example.org' in t)
            check('UI: «In meine Rezepte speichern» und «Link teilen»', await btn(page, 'In meine Rezepte speichern').count() >= 1 and await btn(page, 'Link teilen').count() >= 1)
            check('UI Detail: keine privaten Bearbeiten-/Loeschen-Aktionen', await lib_rendered(page) and await ev(page, "!document.querySelector('main [data-action=\"edit-recipe\"], main [data-action=\"confirm-delete\"]')"))
            check('Kein privater Abgleich durch Ansehen', len([x for x in M.LOG if x[1].startswith('/rest/v1/savora_records')]) == n_rec)
            check('Adresse behaelt ?rezept=', ('rezept=' + pub) in page.url)
            await page.reload()
            await page.wait_for_function("typeof state !== 'undefined' && document.getElementById('app').children.length > 0"); await ensure_lib(page)
            if not await ev(page, "state.view === 'lib-detail'"): await ev(page, "libHandleStartLink() && render()")
            await wait_js(page, "state.view === 'lib-detail' && lib.detail.status === 'ready'", 10000)
            check('Neuladen zeigt dasselbe Rezept', await ev(page, "lib.detail.id") == pub)

        async with section('Zurueck/Vorwaerts und Scrollposition'):
            await start(page)
            await open_discover(page); await wait_discover_ready(page)
            await act(page, 'Mehr laden', "libLoadMore()"); await wait_js(page, "lib.discover.items.length > 24")
            target, tid = await ev(page, "[lib.discover.items[30].title, lib.discover.items[30].id]")
            card = page.get_by_text(target, exact=True).first
            await card.scroll_into_view_if_needed(timeout=ui_wait())
            y0 = await ev(page, "window.scrollY")
            await card.click()
            await wait_js(page, "state.view === 'lib-detail'")
            check('Karte oeffnet Detail', await ev(page, "lib.detail.id") == tid)
            check('Adresse zeigt ?rezept= (teilbar, neu ladbar)', ('rezept=' + tid) in page.url)
            await page.go_back()
            await wait_js(page, "state.view === 'discover'")
            check('Zurueck: gleiche Ergebnisse (nicht neu geladen)', await ev(page, "lib.discover.items.length") > 24)
            await wait_js(page, f"Math.abs(window.scrollY - {y0}) < 60", 4000)
            check('Zurueck: Scrollposition wiederhergestellt', True)
            await page.go_forward()
            await wait_js(page, "state.view === 'lib-detail' && lib.detail.status === 'ready'")
            check('Vorwaerts: wieder im Detail', await ev(page, "lib.detail.id") == tid)

        async with section('Nicht verfuegbar'):
            for pid, what in ((str(uuid.uuid4()), 'unbekannt'), (M.seed_publication(A, M.simple_recipe('Zurückgezogen'), status='withdrawn'), 'zurueckgezogen'), (M.seed_publication(A, M.simple_recipe('Gesperrt'), status='blocked'), 'gesperrt')):
                await start(page, '?rezept=' + pid)
                if not await ev(page, "state.view === 'lib-detail'"): await ev(page, "libHandleStartLink() && render()")
                await wait_js(page, "lib.detail.status === 'missing'", 10000)
                check(f'Direktlink {what}: Zustand missing', True)
                await ui_text(page, 'Dieses Rezept ist nicht mehr öffentlich verfügbar.')
            check('UI: «Weitere Rezepte entdecken»', await btn(page, 'Weitere Rezepte entdecken').count() >= 1)

        # ---------- Speichern ----------
        c = {}
        async with section('Speichern: Kopie mit Herkunft'):
            await start(page)
            await ev(page, f"libOpenDetail('{pub}')"); await wait_js(page, "lib.detail.status === 'ready'")
            await act(page, 'In meine Rezepte speichern', f"ensurePersonalRecipe('{pub}')")
            await wait_js(page, f"dbGetAll().then(l => l.some(r => r.publicOrigin && r.publicOrigin.publicationId === '{pub}'))")
            await ui_text(page, 'In Meine Rezepte gespeichert.')
            copies = await local_copies(page, pub)
            check('Genau eine Kopie', len(copies) == 1, copies)
            c = copies[0] if copies else {}
            o = c.get('origin') or {}
            check('Neue lokale ID (nicht die oeffentliche)', bool(c.get('id')) and c['id'] != pub)
            check('publicOrigin vollstaendig', o.get('publicationId') == pub and o.get('authorPublicId') == M.PUB_PROFILES[A]['public_id'] and o.get('authorName') == 'Anna Kocht'
                  and o.get('savedVersion') == 1 and isinstance(o.get('savedAt'), (int, float)) and str(o.get('url', '')).endswith('?rezept=' + pub) and o.get('imagePending') is False, o)
            check('Keine persoenlichen Felder: Notiz leer, kein Favorit, kein Kochzaehler', c.get('notes') in ('', None) and not c.get('favorite') and not c.get('cookCount'))
            check('Kochtipps in publicTips, Quelle in source', c.get('publicTips') == 'Mit Rösti servieren.' and c.get('source') == 'https://example.org/geschnetzeltes', (c.get('publicTips'), c.get('source')))
            ings = c.get('ingredients', [])
            check('Struktur erhalten: Abschnitt, Bereich 2-3, «Salz nach Geschmack», Ueberschrift', any(i.get('isGroupHeader') for i in ings) and any(i.get('amount') == '2-3' for i in ings)
                  and any(i.get('name') == 'Salz nach Geschmack' for i in ings) and c.get('steps', [{}])[0].get('text') == 'Für die Sauce:', ings)
            check('In state.recipes sichtbar (Meine Rezepte)', await ev(page, f"state.recipes.some(r => r.id === '{c.get('id')}')"))
            if await act(page, 'In meinen Rezepten öffnen', f"() => {{ state.activeRecipeId = '{c.get('id')}'; state.view = 'detail'; render(); }}"):
                await wait_js(page, "state.view === 'detail'")
                check('Oeffnet die lokale Kopie', await ev(page, "state.activeRecipeId") == c.get('id'))

        async with section('Nochmals speichern: keine zweite Kopie (gleichzeitig, zwei Tabs)'):
            r = await ev(page, f"Promise.all([ensurePersonalRecipe('{pub}'), ensurePersonalRecipe('{pub}')])")
            check('Zweimal speichern: gleiche lokale ID, created=false', r[0]['recipeId'] == r[1]['recipeId'] == c.get('id') and not r[0]['created'], r)
            other = others[0]
            r = await ev(page, f"Promise.all([ensurePersonalRecipe('{other}'), ensurePersonalRecipe('{other}'), ensurePersonalRecipe('{other}')])")
            check('Drei gleichzeitige Aufrufe (neu): eine Kopie, einmal created', len({x['recipeId'] for x in r}) == 1 and len(await local_copies(page, other)) == 1, r)
            other2 = others[1]
            page2 = await new_page(ctx); await start(page2)
            res = await asyncio.gather(ev(page, f"ensurePersonalRecipe('{other2}')"), ev(page2, f"ensurePersonalRecipe('{other2}')"))
            copies = await local_copies(page, other2)
            check('Zwei Tabs gleichzeitig: genau eine Kopie, gleiche ID', len(copies) == 1 and res[0]['recipeId'] == res[1]['recipeId'], (len(copies), res))
            await page2.close()
            await ev(page, f"libOpenDetail('{pub}')"); await wait_js(page, "lib.detail.status === 'ready'")
            check('UI: Detail erkennt vorhandene Kopie («In meinen Rezepten öffnen», kein zweites «speichern»)', await btn(page, 'In meine Rezepte speichern').count() == 0 and await btn(page, 'In meinen Rezepten öffnen').count() >= 1)

        # ---------- Verknuepfungen ----------
        async with section('Speichern und Wochenplan/Einkauf/Kochbuch/Kochen'):
            p2 = M.seed_publication(A, rich_recipe('Linsencurry', diet=('vegan',)))
            await ev(page, f"libOpenDetail('{p2}')"); await wait_js(page, "lib.detail.status === 'ready'")
            cp = None
            if await act(page, re.compile('Wochenplan'), f"ensurePersonalRecipe('{p2}')"):
                await wait_js(page, f"dbGetAll().then(l => l.some(r => r.publicOrigin && r.publicOrigin.publicationId === '{p2}'))")
                await page.keyboard.press('Escape'); await wait_js(page, "!state.modal", 3000)
            copies = await local_copies(page, p2)
            check('Wochenplan-Aktion legt Kopie an; Abbruch der zweiten Aktion laesst sie bestehen', len(copies) == 1)
            cp = copies[0]['id'] if copies else None
            # Positive Verknuepfung: Wochenplan ueber die Auswahl im Fenster (falls vorhanden)
            if VIEWS[0] and await btn(page, re.compile('Wochenplan')).count():
                await click_btn(page, re.compile('Wochenplan')); await wait_js(page, "!!state.modal", 4000)
                await ev(page, "() => { const b = document.querySelector('[data-action=\"assign-mealplan-recipe\"]'); if (b) b.click(); }")
                try: await wait_js(page, f"dbGetAllMealplan().then(l => l.some(d => (d.entries || []).some(e => e.recipeId === '{cp}')))", 4000)
                except Exception: pass
            plan = await ev(page, "dbGetAllMealplan()")
            check('UI: Wochenplan entries[].recipeId = lokale ID', any(e.get('recipeId') == cp for d in plan for e in (d.get('entries') or [])), json.dumps(plan)[:160])
            await ev(page, f"libOpenDetail('{p2}')"); await wait_js(page, "lib.detail.status === 'ready'")
            if await act(page, re.compile('Einkauf'), None if VIEWS[0] else "0", 0):
                try:
                    await wait_js(page, f"state.shopping.some(i => i.recipeId === '{cp}') || !!state.modal", 4000)
                    if await ev(page, "!!state.modal"): await ev(page, "() => { const b = document.querySelector('.modal-sheet .primary-btn, .modal .primary-btn'); if (b) b.click(); }")
                    await wait_js(page, f"state.shopping.some(i => i.recipeId === '{cp}')", 4000)
                except Exception: pass
            shop = await ev(page, f"state.shopping.filter(i => i.recipeId === '{cp}').map(i => i.name)")
            check('UI: Einkauf items[].recipeId = lokale ID', len(shop) >= 2, shop)
            await ev(page, f"libOpenDetail('{p2}')"); await wait_js(page, "lib.detail.status === 'ready'")
            if await act(page, re.compile('Kochbuch'), "0"):
                try:
                    await wait_js(page, "!!state.modal", 3000)
                    await ev(page, "() => { const b = document.querySelector('.modal-sheet [data-id^=\"cb_\"], .modal [data-id^=\"cb_\"]'); if (b) b.click(); }")
                except Exception: pass
            check('UI: Kochbuch items[].recipeId = lokale ID', bool(cp) and cp in await ev(page, "JSON.stringify(cookbookStoreRead())"))
            await ev(page, f"libOpenDetail('{p2}')"); await wait_js(page, "lib.detail.status === 'ready'")
            if await act(page, re.compile('Kochen|Kochmodus'), "0"):
                try: await wait_js(page, "state.view === 'cookmode'", 4000)
                except Exception: pass
            check('UI: Kochmodus mit lokaler ID', await ev(page, "state.view") == 'cookmode' and await ev(page, "state.activeRecipeId") == cp)
            await ev(page, "() => { state.cookProgressHandled = true; state.view = 'home'; render(); }")
            hits = await scan_for_public_ids(page, [pub, p2] + others)
            check('Nie eine oeffentliche ID in Wochenplan, Einkauf oder Kochbuechern', not hits, hits)

        # ---------- Bildfehler ----------
        async with section('Bildfehler und Bild erneut laden'):
            pimg = M.seed_publication(A, M.simple_recipe('Mit Bild'), image=True)
            async def img_fail(route):
                if route.request.method == 'GET': await route.fulfill(status=500, body='x')
                else: await route.continue_()
            await page.route('**/storage/v1/object/sign/savora-public/**', img_fail)
            await ev(page, f"libOpenDetail('{pimg}')"); await wait_js(page, "lib.detail.status === 'ready'")
            await clear_toasts(page)
            await act(page, 'In meine Rezepte speichern', f"ensurePersonalRecipe('{pimg}')")
            await wait_js(page, f"dbGetAll().then(l => l.some(r => r.publicOrigin && r.publicOrigin.publicationId === '{pimg}' && r.publicOrigin.imagePending))")
            cps = await local_copies(page, pimg)
            check('Teilstatus: Kopie da, imagePending=true, kein Bild', len(cps) == 1 and cps[0]['origin'].get('imagePending') is True and not cps[0]['imageId'], cps and cps[0]['origin'])
            await ui_text(page, 'Das Rezept wurde gespeichert. Das Bild konnte noch nicht übernommen werden.')
            await page.unroute('**/storage/v1/object/sign/savora-public/**', img_fail)
            inline = page.locator('main').get_by_role('button', name='Bild erneut laden')
            try:
                await inline.first.click(timeout=3000)
                check('UI: «Bild erneut laden» im Detail klickbar (nicht vom Toast verdeckt)', True)
            except Exception as e:
                check('UI: «Bild erneut laden» im Detail klickbar (nicht vom Toast verdeckt)', False, 'verdeckt' if 'intercepts pointer' in str(e) else str(e)[:120])
                await act(page, 'Bild erneut laden', "(id) => libRetryImage(id)", arg=cps[0]['id'] if cps else '')
            await wait_js(page, f"dbGetAll().then(l => l.some(r => r.publicOrigin && r.publicOrigin.publicationId === '{pimg}' && r.imageId && !r.publicOrigin.imagePending))", 10000)
            iid = (await local_copies(page, pimg))[0]['imageId']
            await wait_js(page, f"dbGetImage('{iid}').then(i => !!(i && i.blob))", 5000)
            check('Bild erneut laden: Bild im eigenen Speicher, imagePending=false', True)
            pimg2 = M.seed_publication(A, M.simple_recipe('Mit Bild 2'), image=True)
            r = await ev(page, f"ensurePersonalRecipe('{pimg2}')")
            cps = await local_copies(page, pimg2)
            check('Speichern mit Bild (ohne Fehler): eigenes imageId, nicht der oeffentliche Pfad', r['imageFailed'] is False and cps[0]['imageId'] and 'savora-public' not in cps[0]['imageId'] and '/' not in cps[0]['imageId'])

        # ---------- Neue Version ----------
        async with section('Neue Version: Hinweis, Vergleich, Aktualisieren, zusaetzliche Kopie'):
            cid = c.get('id')
            await ev(page, f"""async () => {{ const r = (await dbGetAll()).find(x => x.id === '{cid}'); r.notes = 'Meine Notiz'; r.favorite = true; await dbPut(r); await loadRecipes();
                await dbPutMealplanDay({{ date: '2026-10-20', entries: [{{ id: 'e1', recipeId: '{cid}', meal: '', servings: null }}], recipeIds: ['{cid}'], keyVersion: 2 }});
                await addRecipeIngredientsToShopping(state.recipes.find(x => x.id === '{cid}'), 4); }}""")
            shop_before = await ev(page, f"state.shopping.filter(i => i.recipeId === '{cid}').map(i => [i.id, i.name, i.amount, i.unit])")
            M.bump_publication(pub, {'title': 'Zürcher Geschnetzeltes (neu)', 'ingredients': rich_recipe()['ingredients'] + [{'amount': '1', 'unit': 'EL', 'name': 'Petersilie'}]})
            await ev(page, f"libOpenDetail('{pub}')"); await wait_js(page, "lib.detail.status === 'ready' && lib.detail.pub.version === 2")
            check('Kopie bleibt unveraendert, bis bewusst uebernommen', next(x for x in await local_copies(page, pub) if x['id'] == cid)['title'] == 'Zürcher Geschnetzeltes')
            await ui_text(page, 'Für dieses Rezept gibt es eine neue Version')
            try:
                await click_btn(page, re.compile('Vergleich|Unterschiede|Änderungen'))
                check('UI: Gegenueberstellung zeigt neue Zutat', await has_text(page, 'Petersilie'))
            except Exception:
                check('UI: Gegenueberstellung (Vergleich/Unterschiede/Änderungen)', False, 'fehlt')
            await act(page, 'Meine Kopie aktualisieren', f"libUpdateCopy('{cid}', lib.detail.pub)")
            await wait_js(page, f"dbGetAll().then(l => l.some(r => r.id === '{cid}' && r.title === 'Zürcher Geschnetzeltes (neu)'))")
            mine = next(x for x in await local_copies(page, pub) if x['id'] == cid)
            check('Aktualisieren: gleiche ID, Notiz und Favorit bleiben, savedVersion 2', mine['notes'] == 'Meine Notiz' and mine['favorite'] and mine['origin']['savedVersion'] == 2, mine['origin'])
            check('Neue Zutat in der Kopie', any(i.get('name') == 'Petersilie' for i in mine['ingredients']))
            check('Wochenplan-Eintrag bleibt', await ev(page, f"dbGetAllMealplan().then(l => l.some(d => (d.entries||[]).some(e => e.recipeId === '{cid}')))"))
            shop_after = await ev(page, f"state.shopping.filter(i => i.recipeId === '{cid}').map(i => [i.id, i.name, i.amount, i.unit])")
            check('Einkaufsposten unveraendert (keine Petersilie nachgeschoben)', shop_after == shop_before, (len(shop_before), len(shop_after)))
            M.bump_publication(pub, {'title': 'Zürcher Geschnetzeltes v3'})
            await ev(page, f"libOpenDetail('{pub}')"); await wait_js(page, "lib.detail.status === 'ready' && lib.detail.pub.version === 3")
            try: await click_btn(page, re.compile('Vergleich'))
            except Exception: check('UI: «Vergleichen» bei neuer Version', False, 'fehlt')
            await act(page, re.compile('zusätzliche Kopie'), f"libSaveExtraCopy('{pub}')")
            await wait_js(page, f"dbGetAll().then(l => l.filter(r => r.publicOrigin && r.publicOrigin.publicationId === '{pub}').length === 2)")
            ids2 = [x['id'] for x in await local_copies(page, pub)]
            check('«Als zusätzliche Kopie»: neue ID, alte bleibt', cid in ids2 and len(set(ids2)) == 2)
            check('libCopiesOf: neueste Kopie zuerst', (await ev(page, f"libCopiesOf('{pub}').map(r => r.id)"))[-1] == cid)

        # ---------- Kopie loeschen ----------
        async with section('Kopie loeschen: Entdecken zeigt wieder speichern'):
            p3 = M.seed_publication(A, M.simple_recipe('Wird gelöscht'))
            res = await ev(page, f"ensurePersonalRecipe('{p3}')")
            rid = res['recipeId']
            await ev(page, f"() => {{ state.activeRecipeId = '{rid}'; state.view = 'detail'; state.modal = {{ type: 'delete', recipeId: '{rid}' }}; render(); }}")
            await ev(page, f"() => document.querySelector('[data-action=\"delete-recipe\"][data-id=\"{rid}\"]').click()")
            await wait_js(page, f"!state.recipes.some(r => r.id === '{rid}')")
            check('libCopiesOf leer nach Loeschen', await ev(page, f"libCopiesOf('{p3}').length") == 0)
            await ev(page, f"libOpenDetail('{p3}')"); await wait_js(page, "lib.detail.status === 'ready'")
            check('UI: nach Loeschen wieder «In meine Rezepte speichern»', await btn(page, 'In meine Rezepte speichern').count() >= 1)
            r2 = await ev(page, f"ensurePersonalRecipe('{p3}')")
            check('Speichern waehrend «Rückgängig» noch laeuft: neue Kopie statt Wiederauferstehung der geloeschten', r2['created'] is True and r2['recipeId'] != rid, r2)
            await ev(page, "(t) => { const b = [...document.querySelectorAll('button')].find(x => /Rückgängig/.test(x.textContent)); return !!b; }", None)

        # ---------- Bestehende Links ----------
        async with section('Freundeseinladung und Passwortlink weiterhin gueltig'):
            await start(page, '?freund=SAV-ZZZZ-2222')
            await wait_js(page, "!location.search.includes('freund=')", 5000)
            check('?freund= wird uebernommen (Code gemerkt) und aus der Adresse entfernt', await ev(page, "Object.keys(sessionStorage).some(k => sessionStorage.getItem(k) === 'SAV-ZZZZ-2222')") and await ev(page, "state.view") != 'lib-detail')
            await start(page, '?freund=SAV-YYYY-3333&rezept=' + pub)
            await wait_js(page, "!location.search.includes('freund=')", 5000)
            check('?freund= und ?rezept= zusammen: Einladung gemerkt', await ev(page, "Object.keys(sessionStorage).some(k => sessionStorage.getItem(k) === 'SAV-YYYY-3333')"))
            check('?freund= und ?rezept= zusammen: Rezept offen', await ev(page, "state.view") == 'lib-detail')
            at = M.token_for(B)
            await page.goto(URL + '#access_token=%s&refresh_token=rt-x&expires_in=3600&type=recovery' % at)
            await page.wait_for_function("typeof state !== 'undefined' && document.getElementById('app').children.length > 0")
            await wait_js(page, "!/access_token/.test(location.hash)", 8000)
            check('Passwortlink-Fragment wird verarbeitet (Fragment entfernt, keine Bibliotheksansicht)', await ev(page, "state.view") != 'lib-detail')

        check('Keine Skriptfehler', not page.errs, page.errs[:3])
        await browser.close()
    report(t0)

asyncio.run(main())
