"""Savora 0.90 (H3): gemeinsame Haushaltsliste im Einkauf.
Laeuft gegen den Supabase-Nachbau (tests/mock_supabase.py, Regeln wie supabase/paket48-haushalt.sql).
Prueft: ausgeblendet ohne Serverfunktion (404), Einladen ueber Freunde, Einladung im Eingang annehmen, eigene Liste bleibt
unangetastet, Abgleich in beide Richtungen (auch per Abfrage alle 8 s), Konfliktregel (neuer gewinnt, Loeschen bei
Gleichstand, Kappung der Zukunft, lokal Ausstehendes bleibt), pausiert ohne Verbindung, Verlassen und Ende
(offene Eintraege in die eigene Liste), Datenart pantry, statische SQL-Pruefung. Screenshots 375x667 und 390x844 hell/dunkel."""
import asyncio, json, os, re, sys, threading, time, urllib.request, uuid
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
import mock_supabase as M
from http.server import ThreadingHTTPServer

MOCK_PORT = int(_os.environ.get('SAVORA_MOCK_PORT', str(int(_os.environ.get('SAVORA_TEST_PORT', '8795')) + 1)))
srv = ThreadingHTTPServer(('127.0.0.1', MOCK_PORT), M.H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
MOCK = 'http://127.0.0.1:%d' % MOCK_PORT
CLOUD = "window.SAVORA_CLOUD_URL_OVERRIDE = '%s'; window.SAVORA_CLOUD_KEY_OVERRIDE = 'test-key';" % MOCK
SHOTS = os.environ.get('SAVORA_HH_SHOTS') or os.path.join(OUT, 'v90-haushalt')
os.makedirs(SHOTS, exist_ok=True)
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info if not cond else '')
    if not cond: FAIL.append(name)

# Bis H2 den Umschalter in shoppingView einbaut: im Test oben in die Einkaufsliste setzen (danach wirkungslos).
INJECT = """() => { if (window.__hhInjected || String(shoppingView).includes('householdSwitchHtml')) return;
  window.__hhInjected = true; const o = window.shoppingView;
  window.shoppingView = function () { return o.apply(this, arguments).replace(/(<main class="has-tabbar shop-main">)/, (m) => m + householdSwitchHtml()); }; }"""

def rpc(uid, name, args):
    req = urllib.request.Request(MOCK + '/rest/v1/rpc/' + name, data=json.dumps(args).encode(), method='POST',
                                 headers={'apikey': 'test-key', 'Authorization': 'Bearer ' + M.token_for(uid), 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as r: b = r.read(); return r.status, (json.loads(b) if b else None)
    except urllib.error.HTTPError as e:
        b = e.read(); return e.code, (json.loads(b) if b else None)

async def device(p, name, w=390, h=844, scheme='light'):
    browser, ctx = await open_ctx(p, w, h)
    await ctx.add_init_script(CLOUD)
    page = await ctx.new_page()
    await page.emulate_media(color_scheme=scheme)
    errs = []
    page.on('pageerror', lambda e: errs.append(f'{name}: {e}'))
    page.on('console', lambda m: errs.append(f'{name} console: {m.text}') if m.type == 'error' and '400 (Bad Request)' not in m.text and '404 (Not Found)' not in m.text else None)
    page.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    await goto(page)
    await page.evaluate(INJECT)
    return browser, ctx, page, errs

async def login(page, email):
    await show(page, "() => { state.modal = null; state.view = 'settings-account'; render(); }", '#cloudEmail')
    await page.fill('#cloudEmail', email); await page.fill('#cloudPassword', 'geheim-123')
    await page.evaluate("document.querySelector('[data-action=\"cloud-sign-in\"]').click()")
    await page.wait_for_function("cloudSignedIn()", timeout=10000)
    await page.wait_for_timeout(600)

async def click(page, sel):
    await page.evaluate("(s) => { const e = document.querySelector(s); if (!e) throw new Error('fehlt ' + s); e.click(); }", sel)

async def open_shopping(page):
    await page.evaluate("() => { if (document.activeElement) document.activeElement.blur(); state.modal = null; state.view = 'shopping'; render(); }")
    await page.wait_for_selector('.shop-main', state='attached')

async def names(page):
    return await page.evaluate("state.shopping.map(i => i.name).sort()")

async def own_names(page):
    return await page.evaluate("hhOrig.dbGetAllShopping().then(l => l.map(i => i.name).sort())")

def items_on_server():
    return {(v['data'] or {}).get('name'): v for (h, i), v in M.HH_ITEMS.items()}

async def main():
    ua = M.make_user('anna@example.test'); ub = M.make_user('ben@example.test')
    M.PROFILES[ua] = {'handle': 'anna', 'display_name': 'Anna', 'invite_code': 'SAV-AAAA-AAAA'}
    M.PROFILES[ub] = {'handle': 'ben', 'display_name': 'Ben', 'invite_code': 'SAV-BBBB-BBBB'}
    M.CONNS[(ua, ub)] = 'accepted'
    async with async_playwright() as p:
        bA, cA, pa, errA = await device(p, 'A')
        bB, cB, pb, errB = await device(p, 'B')
        check('Lokale Stores householdItems und householdQueue vorhanden (db.js)', await pa.evaluate("hhStoresReady()"))

        # 1. Ohne Paket 48 (RPC 404): Funktion unsichtbar, Rest laeuft
        M.HH_DISABLED[0] = True
        await login(pa, 'anna@example.test')
        await pa.evaluate("hhSync({ state: true })")
        await pa.wait_for_function("hh.unsupported === true", timeout=8000)
        await open_shopping(pa)
        check('Ohne Serverfunktion: kein Umschalter im Einkauf', await pa.evaluate("!document.querySelector('.hh-box') && householdSwitchHtml() === ''"))
        check('Ohne Serverfunktion: kein «Einkaufsliste teilen» beim Freund', await pa.evaluate("hhFriendButtonHtml('ben', 'Ben') === ''"))
        M.HH_DISABLED[0] = False
        await goto(pa); await pa.evaluate(INJECT)   # neuer Start: Funktion wird erneut geprueft
        await pa.wait_for_function("cloudSignedIn() && hh.state !== null", timeout=10000)
        check('Mit Serverfunktion: Zustand geladen, noch kein Haushalt', await pa.evaluate("hh.state.household === null && !hhMember()"))

        # 2. Eigene Liste vorher anlegen, dann Ben einladen
        await pa.evaluate("async () => { const it = { id: uid(), name: 'Eigenes Brot', amount: '1', unit: '', checked: false, createdAt: Date.now() }; await dbPutShopping(it); await loadShopping(); }")
        await pa.wait_for_timeout(2500)   # persoenlicher Abgleich laeuft
        await pa.evaluate("() => { share.connections = [{ handle: 'ben', display_name: 'Ben', state: 'connected' }]; state.view = 'friends'; render(); openModal({ type: 'friend-manage', handle: 'ben' }); }")
        await pa.wait_for_selector('[data-action="hh-invite"]', state='attached')
        check('Freund verwalten zeigt «Einkaufsliste mit Ben teilen»', 'Einkaufsliste mit Ben teilen' in await pa.inner_text('.modal-sheet'))
        await click(pa, '[data-action="hh-invite"]')
        await pa.wait_for_function("hhMember()", timeout=8000)
        inv = [m for (h, u), m in M.HH_MEMBERS.items() if u == ub]
        check('Server: Ben ist eingeladen, Anna aktiv', len(inv) == 1 and inv[0]['status'] == 'invited' and any(u == ua and m['status'] == 'active' for (h, u), m in M.HH_MEMBERS.items()))
        await open_shopping(pa)
        check('Anna: gemeinsame Liste gewaehlt und noch leer', await pa.evaluate("hhWanted()") and await names(pa) == [])
        check('Anna: eigene Liste unangetastet im Store shopping', await own_names(pa) == ['Eigenes Brot'])
        check('Anna: Umschalter mit zwei Knoepfen, «Gemeinsam» gedrueckt', await pa.evaluate("document.querySelectorAll('.hh-seg .seg-btn').length === 2 && document.querySelector('[data-action=\"hh-mode\"][data-id=\"household\"]').getAttribute('aria-pressed') === 'true'"))
        await click(pa, '[data-action="hh-mode"][data-id="own"]'); await pa.wait_for_function("state.shopping.length === 1")
        check('Umschalten auf «Meine Liste» zeigt die eigene Liste', await names(pa) == ['Eigenes Brot'])
        await click(pa, '[data-action="hh-mode"][data-id="household"]'); await pa.wait_for_function("state.shopping.length === 0")

        # 3. Ben sieht die Einladung im Eingang und nimmt an
        await login(pb, 'ben@example.test')
        await pb.evaluate("async () => { await hhSync({ state: true }); share.ui.tab = 'inbox'; state.view = 'friends'; render(); }")
        await pb.wait_for_function("hhInviteCount() === 1", timeout=8000)
        await pb.evaluate("() => { share.profile = share.profile || { handle: 'ben', display_name: 'Ben', invite_code: 'SAV-BBBB-BBBB' }; render(); }")
        t = await pb.inner_text('main')
        check('Ben: Einladung im Reiter Empfangen', 'lädt dich zur gemeinsamen Einkaufsliste ein' in t and await pb.evaluate("!!document.querySelector('.hh-inbox [data-action=\"hh-accept\"]')"), t[:200])
        check('Ben: Abzeichen zaehlt die Einladung', await pb.evaluate("friendsBadgeCount() >= 1"))
        await pb.set_viewport_size({'width': 375, 'height': 667})
        await pb.screenshot(path=os.path.join(SHOTS, 'eingang-375-hell.png'))
        await pb.set_viewport_size({'width': 390, 'height': 844})
        await click(pb, '.hh-inbox [data-action="hh-accept"]')
        await pb.wait_for_function("hhMember() && hhWanted()", timeout=8000)
        check('Server: Ben ist aktiv', any(u == ub and m['status'] == 'active' for (h, u), m in M.HH_MEMBERS.items()))

        # 4. Abgleich: Anna traegt ein (ueber die Oberflaeche), Ben sieht es per Abfrage (8 s, Einkauf sichtbar)
        await open_shopping(pb)
        await open_shopping(pa)
        await pa.fill('#shoppingAddInput', '2 l Milch'); await click(pa, '[data-action="add-shopping-item-manual"]')
        await pa.wait_for_function("hh.syncing === false && !!state.shopping.find(i => i.name === 'Milch')")
        await pa.evaluate("hhSync()")
        await pa.wait_for_function("hh.syncing === false")
        check('Server: Milch angekommen', 'Milch' in items_on_server())
        t0 = time.time()
        await pb.wait_for_function("state.shopping.some(i => i.name === 'Milch')", timeout=20000)
        check('Ben: Milch erscheint ohne Zutun (Abfrage im Einkauf)', time.time() - t0 < 19, '%.1f s' % (time.time() - t0))
        check('Ben: Milch steht auch in der Ansicht', 'Milch' in await pb.inner_text('main'))
        check('Persoenlicher Abgleich bekommt keine Haushalts-Eintraege', not any((v.get('data') or {}).get('name') == 'Milch' for v in M.RECORDS.values()))
        check('Persoenlicher Abgleich hat die eigene Liste', any((v.get('data') or {}).get('name') == 'Eigenes Brot' for v in M.RECORDS.values()))

        # 5. Konflikt: Anna aendert frueher, Ben spaeter (noch nicht gesendet) -> Bens Stand bleibt und gewinnt
        mid = await pa.evaluate("state.shopping.find(i => i.name === 'Milch').id")
        await pa.evaluate("async (id) => { const it = state.shopping.find(i => i.id === id); it.amount = '3'; await dbPutShopping(it); await hhSync(); }", mid)
        await pa.wait_for_function("hh.syncing === false")
        kept = await pb.evaluate("""async (id) => { const it = Object.assign({}, state.shopping.find(i => i.id === id), { amount: '5' });
            await dbPutShopping(it); await hhPull(hhMeta().id); await loadShopping(); return state.shopping.find(i => i.id === id).amount; }""", mid)
        check('Lokal ausstehende Aenderung wird vom aelteren Abzug nicht ueberschrieben', kept == '5', kept)
        await pb.evaluate("hhSync()"); await pb.wait_for_function("hh.syncing === false")
        await pb.wait_for_function("hh.syncing === false")
        srv_amount = items_on_server()['Milch']['data']['amount']
        check('Server: neuerer Stand (Ben) gewinnt', srv_amount == '5', srv_amount)
        await pa.evaluate("hhSync()"); await pa.wait_for_function("hh.syncing === false && state.shopping.find(i => i.name === 'Milch').amount === '5'", timeout=8000)
        check('Anna bekommt Bens Stand', True)

        # Serverregeln direkt
        hid = await pa.evaluate("hhMeta().id")
        cur = M.HH_ITEMS[(hid, mid)]['client_updated_at']
        st, r = rpc(ua, 'savora_hh_push', {'p_household': hid, 'p_rows': [{'id': mid, 'data': {'name': 'Alt'}, 'deleted': False, 'client_updated_at': cur - 1000}]})
        check('Server: aelterer Stand wird verworfen', st == 200 and r['applied'] == 0 and M.HH_ITEMS[(hid, mid)]['data']['name'] == 'Milch')
        st, r = rpc(ua, 'savora_hh_push', {'p_household': hid, 'p_rows': [{'id': 'x-tie', 'data': {'name': 'Tie'}, 'deleted': False, 'client_updated_at': 1000}]})
        st, r = rpc(ub, 'savora_hh_push', {'p_household': hid, 'p_rows': [{'id': 'x-tie', 'data': None, 'deleted': True, 'client_updated_at': 1000}]})
        check('Server: Gleichstand, Loeschen gewinnt', M.HH_ITEMS[(hid, 'x-tie')]['deleted'] is True)
        st, r = rpc(ub, 'savora_hh_push', {'p_household': hid, 'p_rows': [{'id': 'x-tie', 'data': {'name': 'Tie'}, 'deleted': False, 'client_updated_at': 1000}]})
        check('Server: Gleichstand, Wiederbeleben verliert', M.HH_ITEMS[(hid, 'x-tie')]['deleted'] is True)
        far = int(time.time() * 1000) + 10 * 24 * 3600 * 1000
        rpc(ua, 'savora_hh_push', {'p_household': hid, 'p_rows': [{'id': 'x-fut', 'data': {'name': 'Zukunft'}, 'deleted': False, 'client_updated_at': far}]})
        check('Server: Zeit aus der Zukunft auf jetzt + 60 s gekappt', M.HH_ITEMS[(hid, 'x-fut')]['client_updated_at'] <= int(time.time() * 1000) + 61000)
        st, r = rpc(ua, 'savora_hh_push', {'p_household': hid, 'p_rows': [{'id': 'big', 'data': {'name': 'x' * 5000}, 'deleted': False, 'client_updated_at': 1}]})
        check('Server: zu grosser Eintrag abgewiesen', st == 400 and 'zu gross' in r['message'])
        st, r = rpc(ua, 'savora_hh_push', {'p_household': hid, 'p_rows': [{'id': 'n%d' % i, 'data': {'name': 'n'}, 'deleted': False, 'client_updated_at': 1} for i in range(201)]})
        check('Server: hoechstens 200 pro Aufruf', st == 400 and '200' in r['message'])
        ux = M.make_user('fremd@example.test'); M.PROFILES[ux] = {'handle': 'fremd', 'display_name': '', 'invite_code': 'SAV-XXXX-XXXX'}
        st, r = rpc(ux, 'savora_hh_pull', {'p_household': hid, 'p_since': None})
        check('Server: Fremde lesen die Liste nicht', st == 400 and 'Kein Zugriff' in r['message'])
        st, r = rpc(ua, 'savora_hh_invite', {'p_handle': 'fremd'})
        check('Server: nur verbundene Freunde einladbar', st == 400 and 'nicht verbunden' in r['message'])
        for k in [k for k in M.HH_ITEMS if k[1] in ('x-tie', 'x-fut')]: del M.HH_ITEMS[k]

        # 6. Loeschen kommt an
        await pa.evaluate("hhSync()"); await pa.wait_for_function("hh.syncing === false")
        await pa.evaluate("async () => { const it = { id: uid(), name: 'Eier', amount: '6', unit: '', checked: false, createdAt: Date.now() }; await dbPutShopping(it); await loadShopping(); await hhSync(); }")
        await pb.evaluate("hhSync()"); await pb.wait_for_function("state.shopping.some(i => i.name === 'Eier')", timeout=8000)
        await pa.evaluate("async () => { const it = state.shopping.find(i => i.name === 'Eier'); await dbDeleteShopping(it.id); await loadShopping(); await hhSync(); }")
        await pb.evaluate("hhSync()"); await pb.wait_for_function("!state.shopping.some(i => i.name === 'Eier')", timeout=8000)
        check('Geloeschter Eintrag verschwindet beim anderen', True)

        # Screenshots Einkauf mit gemeinsamer Liste
        await pb.evaluate("async () => { for (const n of ['Rüebli', 'Zwiebeln']) await dbPutShopping({ id: uid(), name: n, amount: '500', unit: 'g', checked: false, createdAt: Date.now() }); await loadShopping(); await hhSync(); }")
        for (w, h) in ((375, 667), (390, 844)):
            for scheme in ('light', 'dark'):
                await pb.set_viewport_size({'width': w, 'height': h}); await pb.emulate_media(color_scheme=scheme)
                await open_shopping(pb); await pb.wait_for_timeout(300)
                await pb.screenshot(path=os.path.join(SHOTS, 'einkauf-%d-%s.png' % (w, 'hell' if scheme == 'light' else 'dunkel')))
        await pb.evaluate("document.querySelector('.hh-details').open = true")
        await pb.screenshot(path=os.path.join(SHOTS, 'einkauf-390-dunkel-details.png'))
        ov = await overflow_info(pb)
        check('Kein waagrechtes Ueberlaufen im Einkauf (390 px)', not ov, str(ov)[:200])
        await pb.emulate_media(color_scheme='light')

        # 7. Pausiert ohne Verbindung
        M.CONNS.pop((ua, ub))
        await pb.evaluate("hhSync({ state: true })"); await pb.wait_for_function("hh.syncing === false")
        await open_shopping(pb)
        check('Ohne Freundschaft: Liste pausiert, Hinweis sichtbar', 'Pausiert' in await pb.inner_text('.hh-box'))
        st, r = rpc(ub, 'savora_hh_pull', {'p_household': hid, 'p_since': None})
        check('Ohne Freundschaft: Server verweigert den Abzug', st == 400)
        M.CONNS[(ua, ub)] = 'accepted'
        await pb.evaluate("hhSync({ state: true })"); await pb.wait_for_function("hh.syncing === false")

        # 8. Ben verlaesst: offene Eintraege in die eigene Liste, Anna bleibt
        await pb.evaluate("async () => { const it = state.shopping.find(i => i.name === 'Rüebli'); it.checked = true; await dbPutShopping(it); await hhSync(); }")
        before_own = await own_names(pb)
        await open_shopping(pb)
        await pb.evaluate("document.querySelector('.hh-details').open = true")
        await click(pb, '[data-action="hh-leave"]')
        await pb.wait_for_function("!hhMember()", timeout=8000)
        own = await own_names(pb)
        check('Verlassen: offene Eintraege in der eigenen Liste (abgehakte nicht)', 'Milch' in own and 'Zwiebeln' in own and 'Rüebli' not in own and set(before_own) <= set(own), str(own))
        check('Verlassen: Einkauf zeigt wieder die eigene Liste ohne Umschalter', await names(pb) == own and await pb.evaluate("!document.querySelector('.hh-seg')"))
        toast = await pb.evaluate("Array.from(document.querySelectorAll('.toast, [role=status], [role=alert]')).map(e => e.textContent).join(' | ')")
        check('Verlassen: Meldung nennt die uebernommenen Eintraege', 'verlassen' in toast and 'in deiner Liste' in toast, toast[:200])
        check('Verlassen: Haushaltsspeicher geleert', await pb.evaluate("hhDbTx(['householdItems','householdQueue']).then(tx => Promise.all(['householdItems','householdQueue'].map(s => hhReq(tx.objectStore(s).getAll())))).then(r => r[0].length + r[1].length)") == 0)
        check('Server: Ben weg, Anna bleibt Besitzerin', not any(u == ub for (h, u) in M.HH_MEMBERS) and M.HOUSEHOLDS[hid]['owner'] == ua)

        # 9. Ende von aussen: Ben wieder dabei, der Haushalt wird aufgeloest -> Ben uebernimmt und wird informiert
        st, r = rpc(ua, 'savora_hh_invite', {'p_handle': 'ben'})
        await pb.evaluate("hhSync({ state: true })"); await pb.wait_for_function("hhInviteCount() === 1", timeout=8000)
        await pb.evaluate("handleHouseholdAction('hh-accept', hhInvites()[0].household_id, null)")
        await pb.wait_for_function("hhMember() && state.shopping.some(i => i.name === 'Milch')", timeout=8000)
        await pb.evaluate("async () => { await dbPutShopping({ id: uid(), name: 'Honig', amount: '1', unit: 'Glas', checked: false, createdAt: Date.now() }); await hhSync(); }")
        await pb.wait_for_function("hh.syncing === false")
        with M.LOCK:
            for u in (ua, ub): M.hh_remove_member(hid, u)
        check('Server: letzter Austritt loescht Haushalt und Eintraege', hid not in M.HOUSEHOLDS and not any(k[0] == hid for k in M.HH_ITEMS))
        await pb.evaluate("hhSync({ state: true })"); await pb.wait_for_function("!hhMember()", timeout=8000)
        check('Ende: Honig ist in Bens eigener Liste', 'Honig' in await own_names(pb))
        toast = await pb.evaluate("Array.from(document.querySelectorAll('.toast, [role=status], [role=alert]')).map(e => e.textContent).join(' | ')")
        check('Ende: Meldung «beendet»', 'beendet' in toast, toast[:200])

        # 10. Datenart pantry im persoenlichen Abgleich
        st = urllib.request.urlopen(urllib.request.Request(MOCK + '/rest/v1/savora_records', method='POST', data=json.dumps([{'user_id': ua, 'kind': 'pantry', 'id': 'p1', 'data': {'name': 'Reis'}, 'deleted': False, 'client_updated_at': 1}]).encode(),
                                    headers={'apikey': 'test-key', 'Authorization': 'Bearer ' + M.token_for(ua), 'Content-Type': 'application/json'})).status
        check('Nachbau nimmt die Datenart pantry an', st == 201 and (ua, 'pantry', 'p1') in M.RECORDS)

        check('Keine Seitenfehler', not (errA + errB), str((errA + errB)[:4]))
        await bA.close(); await bB.close()

    # 11. SQL statisch
    sql = open(os.path.join(ROOT, 'supabase', 'paket48-haushalt.sql'), encoding='utf-8').read()
    code = '\n'.join(l.split('--', 1)[0] for l in sql.splitlines())
    check('SQL: eine Transaktion', code.strip().startswith('begin;') and code.strip().endswith('commit;'))
    kinds = re.search(r"savora_records_kind_check\s+check \(kind = any \(array\[(.*?)\]\)\)", code, re.S)
    check('SQL: kind-Liste gleich Nachbau (mit pantry)', kinds and set(re.findall(r"'([a-z]+)'", kinds.group(1))) == M.KINDS_48)
    funcs = re.findall(r'create or replace function (public\.\w+)\((.*?)\) returns (\w+)\s+language (\w+)([^$]*)\$\$', code, re.S)
    check('SQL: alle Funktionen mit search_path = \'\'', funcs and all("set search_path = ''" in f[4] for f in funcs), str([f[0] for f in funcs if "set search_path = ''" not in f[4]]))
    definer = [f[0] for f in funcs if 'security definer' in f[4]]
    check('SQL: Client-Funktionen security definer', all('public.savora_hh_' + n in definer for n in ('state', 'invite', 'accept', 'decline', 'leave', 'push', 'pull')))
    check('SQL: RLS an fuer alle drei Tabellen', all(('alter table public.%s enable row level security' % t) in code for t in ('savora_households', 'savora_household_members', 'savora_household_items')))
    check('SQL: Tabellen gesperrt fuer anon/authenticated', 'revoke all on public.savora_households, public.savora_household_members, public.savora_household_items from anon, authenticated' in code)
    check('SQL: Ausfuehren nur fuer authenticated, intern gesperrt', 'to authenticated;' in code and 'savora_hh_is_member(uuid, uuid), public.savora_hh_now_ms(), public.savora_hh_member_gone()\n  from public, anon, authenticated' in code)
    check('SQL: nur additiv (kein drop table, kein delete ohne where)', not re.search(r'drop table|truncate', code, re.I))
    check('SQL: Profile-Spalten wie paket36 (user_id, handle, display_name)', all(c in open(os.path.join(ROOT, 'supabase', 'paket36-teilen.sql')).read() for c in ('user_id uuid primary key', 'handle text', 'display_name text')))

    print('\nFEHLER:' if FAIL else '\nALLES OK', FAIL if FAIL else '')
    sys.exit(1 if FAIL else 0)

asyncio.run(main())
