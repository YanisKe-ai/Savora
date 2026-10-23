"""v0.90 Speicher voll + Warteschlange in IndexedDB.
Prueft: storageFullWarn (Meldung, hoechstens alle 30 s), writeJsonKey/IndexedDB bei QuotaExceededError, stableHash
(Reihenfolge egal), savoraDeviceName, einmalige Migration der Warteschlange/Meta aus localStorage (grosseres at gewinnt,
alte Werte bleiben), Zustand ueberlebt Neuladen, Abmelden leert syncState, Einstellungen «Name dieses Geraets» und
«Belegt X MB von Y MB» / «Dauerhaft gesichert»."""
import asyncio, sys, threading, json, uuid
import os as _os
_os.environ.setdefault('SAVORA_TEST_PORT', '49005')
sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
import mock_supabase as M
from http.server import ThreadingHTTPServer
srv = ThreadingHTTPServer(('127.0.0.1', 0), M.H)
MOCK_PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
CLOUD = f"window.SAVORA_CLOUD_URL_OVERRIDE = 'http://127.0.0.1:{MOCK_PORT}'; window.SAVORA_CLOUD_KEY_OVERRIDE = 'test-key'; window.__SAVORA_NO_NUTRITION_BACKFILL = true;"
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)
EMAIL, PW = 'speicher@example.test', 'geheim-123'

async def main():
    M.USERS[EMAIL] = {'id': str(uuid.uuid4()), 'password': PW, 'confirmed': True}
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={'width': 390, 'height': 844}, reduced_motion='reduce', timezone_id='UTC')
        await ctx.add_init_script(NO_SW + " try{localStorage.setItem('savora-splash-seen','1')}catch(e){}")
        await ctx.add_init_script(CLOUD)
        page = await ctx.new_page()
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page)
        ev = page.evaluate

        # Hilfsfunktionen
        h = await ev("[stableHash({ a: 1, b: [1, { y: 2, x: 3 }] }), stableHash({ b: [1, { x: 3, y: 2 }], a: 1 }), stableHash({ a: 2 }), stableHash({ a: 1, u: undefined }) === stableHash({ a: 1 })]")
        check('stableHash: Reihenfolge egal, Inhalt zaehlt, undefined wie fehlend', h[0] == h[1] and h[0] != h[2] and h[3] and len(h[0]) == 8, str(h))
        dn = await ev("() => { const a = savoraDeviceName(); localStorage.setItem('savora-device-name', '  Küche  '); const b = savoraDeviceName(); localStorage.removeItem('savora-device-name'); return [a, b]; }")
        check('savoraDeviceName: automatisch, sonst eigener Name', dn[0] in ('Mac', 'Windows-PC', 'Gerät', 'Android', 'iPhone', 'iPad') and dn[1] == 'Küche', str(dn))

        # Speicher voll: Meldung, gedrosselt
        r = await ev("() => { const a = storageFullWarn('test'); const b = storageFullWarn('test'); const t = (document.querySelector('.toast') || {}).textContent || ''; return [a, b, t]; }")
        check('storageFullWarn: Meldung sichtbar, zweite innerhalb 30 s unterdrueckt', r[0] is True and r[1] is False and 'Speicher voll' in r[2], str(r))
        r = await ev("""() => { storageFullWarnAt = 0; document.querySelectorAll('.toast').forEach(t => t.remove());
            const orig = Storage.prototype.setItem;
            Storage.prototype.setItem = function () { throw new DOMException('voll', 'QuotaExceededError'); };
            let ok; try { ok = writeJsonKey('savora-test-x', { a: 1 }); } finally { Storage.prototype.setItem = orig; }
            return [ok, (document.querySelector('.toast') || {}).textContent || '']; }""")
        check('writeJsonKey bei vollem Speicher: false + Meldung', r[0] is False and 'Speicher voll' in r[1], str(r))
        r = await ev("""() => new Promise(res => { storageFullWarnAt = 0; document.querySelectorAll('.toast').forEach(t => t.remove());
            dbTxFail({ error: new DOMException('voll', 'QuotaExceededError') }, (e) => res([e.name, (document.querySelector('.toast') || {}).textContent || ''])); })""")
        check('IndexedDB-Abbruch mit QuotaExceededError: Meldung', r[0] == 'QuotaExceededError' and 'Speicher voll' in r[1], str(r))
        r = await ev("""() => { storageFullWarnAt = 0; document.querySelectorAll('.toast').forEach(t => t.remove());
            const orig = orgWriteKey; window.orgWriteKey = () => false;
            try { orgCreateCollection({ name: 'Volle Sammlung' }); } catch (e) {} finally { window.orgWriteKey = orig; }
            return (document.querySelector('.toast') || {}).textContent || ''; }""")
        check('Sammlung bei vollem Speicher: «Speicher voll: Sammlung nicht gespeichert»', 'Sammlung nicht gespeichert' in r, r)

        # Migration: alter Stand (v0.89) mit Warteschlange/Meta in localStorage
        await ev(f"cloudAuthSignIn({json.dumps(EMAIL)}, {json.dumps(PW)})")
        await ev("cloudSyncNow()")
        sess = await ev("localStorage.getItem('savora-cloud-session')")
        cur = await ev("localStorage.getItem('savora-sync-cursor')")
        old_q = {'recipe|alt1': {'kind': 'recipe', 'id': 'alt1', 'deleted': False, 'at': 5000}, 'recipe|neu1': {'kind': 'recipe', 'id': 'neu1', 'deleted': False, 'at': 100}}
        old_m = {'recipe|alt1': 5000, 'recipe|neu1': 100, 'mealplan|2026-01-01': 42}
        ctx2 = await browser.new_context(viewport={'width': 390, 'height': 844}, reduced_motion='reduce', timezone_id='UTC')
        await ctx2.add_init_script(NO_SW + " try{localStorage.setItem('savora-splash-seen','1')}catch(e){}")
        await ctx2.add_init_script(CLOUD)
        p2 = await ctx2.new_page()
        p2.on('pageerror', lambda e: errs.append('p2: ' + str(e)))
        await goto(p2)   # nicht angemeldet: legt nur die Datenbank (Version 6) an
        # Stand wie nach v0.89: Warteschlange/Meta in localStorage, kein Flag; in IndexedDB schon ein neuerer Eintrag (at 900)
        await p2.evaluate("""async ([sess, cur, q, m]) => {
            localStorage.setItem('savora-cloud-session', sess); localStorage.setItem('savora-sync-cursor', cur);
            localStorage.setItem('savora-sync-queue', q); localStorage.setItem('savora-sync-meta', m); localStorage.removeItem('savora-sync-store');
            const db = await openDB(); await new Promise(r => { const tx = db.transaction('syncState', 'readwrite'); tx.objectStore('syncState').put({ key: 'q|recipe|neu1', v: { kind: 'recipe', id: 'neu1', deleted: false, at: 900 } }); tx.oncomplete = r; }); }""",
            [sess, cur, json.dumps(old_q), json.dumps(old_m)])
        # Server waehrend der Pruefung nicht erreichbar: die Warteschlange bleibt stehen
        await p2.route(f'http://127.0.0.1:{MOCK_PORT}/**', lambda route: route.abort())
        await p2.reload()
        await p2.wait_for_function("typeof state !== 'undefined' && document.getElementById('app').children.length > 0")
        await p2.wait_for_function("cloudState.loaded", timeout=8000)
        r = await p2.evaluate("""async () => ({ flag: localStorage.getItem('savora-sync-store'), mode: cloudState.mode,
            alt: cloudQueueGet('recipe|alt1'), neu: cloudQueueGet('recipe|neu1'), meta: cloudMetaGet('mealplan|2026-01-01'),
            lsKept: !!localStorage.getItem('savora-sync-queue') && !!localStorage.getItem('savora-sync-meta'),
            idb: (await dbGetAllSyncState()).map(r => r.key).sort() })""")
        check('Migration: Flag idb, Eintraege uebernommen', r['flag'] == 'idb' and r['mode'] == 'idb' and r['alt'] and r['alt']['at'] == 5000 and r['meta'] == 42, str(r)[:200])
        check('Migration: groesseres at gewinnt (IndexedDB 900 > localStorage 100)', r['neu'] and r['neu']['at'] == 900, str(r['neu']))
        check('Migration: alte localStorage-Werte bleiben', r['lsKept'])
        check('Migration: Eintraege im Store syncState', 'q|recipe|alt1' in r['idb'] and 'm|mealplan|2026-01-01' in r['idb'], str(r['idb'][:6]))
        # Neue Vormerkung landet in IndexedDB (nicht in localStorage) und ueberlebt das Neuladen
        await p2.evaluate("async () => { await dbPut({ id: 'r_mig', title: 'Neu', ingredients: [], steps: [], createdAt: 1, updatedAt: Date.now() }); await cloudStateFlush(); }")
        ls_has = await p2.evaluate("'recipe|r_mig' in JSON.parse(localStorage.getItem('savora-sync-queue') || '{}')")
        await p2.reload()
        await p2.wait_for_function("typeof state !== 'undefined' && document.getElementById('app').children.length > 0")
        await p2.wait_for_function("cloudState.loaded", timeout=8000)
        kept = await p2.evaluate("!!cloudQueueGet('recipe|r_mig') && cloudQueueCount()")
        check('Vormerkung in IndexedDB, nicht in localStorage, ueberlebt Neuladen', not ls_has and kept, f'ls={ls_has} kept={kept}')
        # Abgleich laeuft mit dem neuen Speicher; Abmelden leert syncState
        await p2.unroute(f'http://127.0.0.1:{MOCK_PORT}/**')
        await p2.wait_for_function("!cloud.syncing")
        res = await p2.evaluate("cloudSyncNow()")
        check('Abgleich mit Warteschlange in IndexedDB', res.get('ok') and not (await p2.evaluate("cloudQueueGet('recipe|r_mig')")), str(res))
        await p2.evaluate("cloudAuthSignOut()")
        await p2.wait_for_timeout(200)
        n = await p2.evaluate("dbGetAllSyncState().then(l => l.length)")
        check('Abmelden leert syncState', n == 0 and await p2.evaluate("cloudQueueCount()") == 0, str(n))

        # Einstellungen: Geraetename und Speicher
        await page.evaluate("() => { state.modal = null; state.view = 'settings-sync'; render(); }")
        await page.wait_for_selector('#kontoDeviceName', timeout=8000)
        await page.fill('#kontoDeviceName', 'Küchen-iPad')
        await page.press('#kontoDeviceName', 'Enter')
        await page.wait_for_timeout(200)
        r = await ev("[localStorage.getItem('savora-device-name'), savoraDeviceName(), document.getElementById('kontoDeviceHint').textContent]")
        check('Name dieses Geraets wird gespeichert und genutzt', r[0] == 'Küchen-iPad' and r[1] == 'Küchen-iPad' and 'Kopie von Küchen-iPad' in r[2], str(r))
        await page.evaluate("() => { state.view = 'settings-offline'; render(); }")
        await page.wait_for_function("(document.getElementById('kontoStorageInfo') || {}).textContent && document.getElementById('kontoStorageInfo').textContent.includes('Dauerhaft')", timeout=8000)
        t = await ev("document.getElementById('kontoStorageInfo').textContent")
        check('Speicher: «Belegt X MB von Y MB» und «Dauerhaft gesichert: Ja/Nein»', 'Belegt' in t and 'MB von' in t and ('Dauerhaft gesichert: Ja' in t or 'Dauerhaft gesichert: Nein' in t), t)
        forms = await ev("document.querySelectorAll('[onsubmit]').length")
        check('Keine Inline-Handler in den Konto-Formularen', forms == 0)

        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await browser.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
    if FAIL: sys.exit(1)

asyncio.run(main())
