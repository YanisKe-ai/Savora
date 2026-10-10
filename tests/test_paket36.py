"""Paket 36: Rezepte zwischen verbundenen Profilen senden (Profil, Anfrage, Senden, Vorschau, Uebernehmen).
Laeuft gegen den lokalen Supabase-Nachbau (tests/mock_supabase.py), der die SQL-Funktionen aus
supabase/paket36-teilen.sql nachbildet."""
import asyncio, sys, threading, uuid
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
import mock_supabase as M
from http.server import ThreadingHTTPServer
srv = ThreadingHTTPServer(('127.0.0.1', 8796), M.H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
CLOUD = "window.SAVORA_CLOUD_URL_OVERRIDE = 'http://127.0.0.1:8796'; window.SAVORA_CLOUD_KEY_OVERRIDE = 'test-key';"
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

async def device(p, name):
    browser, ctx = await open_ctx(p)
    await ctx.add_init_script(CLOUD)
    page = await ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(f'{name}: {e}'))
    page.on("console", lambda m: errs.append(f'{name} console: {m.text}') if m.type == 'error' and '400 (Bad Request)' not in m.text else None)   # 400 = bewusst abgewiesene Anfragen (Fehlerfaelle im Test)
    page.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
    await goto(page)
    return browser, ctx, page, errs
async def click(page, sel, wait=350):
    await page.evaluate("(s) => { const e = document.querySelector(s); if (!e) throw new Error('fehlt ' + s); e.click(); }", sel)
    await page.wait_for_timeout(wait)
async def login(page, email):
    await show(page, "() => { state.modal = null; state.view = 'settings-sync'; render(); }", '#cloudEmail')
    await page.fill('#cloudEmail', email); await page.fill('#cloudPassword', 'geheim-123')
    await click(page, '[data-action="cloud-sign-in"]')
    await page.wait_for_timeout(1500)
def add_user(email):
    M.USERS[email] = {'id': str(uuid.uuid4()), 'password': 'geheim-123', 'confirmed': True}
async def open_share(page):
    await page.evaluate("() => { if (document.activeElement) document.activeElement.blur(); state.modal = null; state.view = 'settings-share'; render(); }")
    await page.wait_for_timeout(900)
async def text(page, sel='body'): return await page.evaluate("(s) => (document.querySelector(s) || {innerText: ''}).innerText", sel)
async def make_profile(page, handle, name):
    await open_share(page)
    await page.wait_for_selector('#shareHandle', state='attached')
    await page.fill('#shareHandle', handle); await page.fill('#shareName', name)
    await click(page, '[data-action="share-profile-save"]', 800)

async def main():
    async with async_playwright() as p:
        # 1. Ohne Anmeldung: kein Cloud-Verkehr, Hinweis statt Funktion, Sicherungs-Erinnerung bleibt
        bX, cX, px, errX = await device(p, 'X')
        await px.evaluate(open(SEED_PATH).read()); await px.wait_for_timeout(2500)
        await px.evaluate("() => { localStorage.removeItem('savora-backup-nudge-until'); state.lastBackupAt = null; state.view = 'home'; render(); }")
        await px.wait_for_timeout(300)
        check('Ohne Konto: Sicherungs-Erinnerung erscheint wie bisher', await px.evaluate("!!document.querySelector('.nudge-card')"))
        await open_share(px)
        t = await text(px)
        check('Ohne Konto: Freunde-Seite erklaert, dass ein Konto noetig ist', 'Konto' in t and not await px.evaluate("!!document.querySelector('#shareHandle')"), t[:120])
        check('Ohne Konto: kein Cloud-Verkehr', len(M.LOG) == 0, str(M.LOG[:3]))
        await bX.close()

        # Zwei Geraete mit zwei Konten
        add_user('yanis@example.test'); add_user('berta@example.test')
        bA, cA, pa, errA = await device(p, 'A')
        await pa.evaluate(open(SEED_PATH).read())
        bB, cB, pb, errB = await device(p, 'B')
        await login(pa, 'yanis@example.test'); await login(pb, 'berta@example.test')

        # 2. Mit Konto: Sicherungs-Erinnerung weg, Hinweis auf der Sicherungsseite
        await pa.evaluate("() => { localStorage.removeItem('savora-backup-nudge-until'); state.lastBackupAt = null; state.view = 'home'; render(); }")
        await pa.wait_for_timeout(300)
        check('Mit Konto: keine Sicherungs-Erinnerung', await pa.evaluate("!document.querySelector('.nudge-card') && backupNudgeInfo() === null"))
        await pa.evaluate("() => { state.view = 'settings-backup'; render(); }")
        check('Mit Konto: Sicherungsseite sagt, dass keine Sicherung noetig ist', 'keine Sicherung erstellen' in await text(pa, 'main'))

        # 3. Profil anlegen
        await open_share(pa)
        await pa.wait_for_selector('#shareHandle', state='attached')
        await pa.fill('#shareHandle', 'Ab'); await click(pa, '[data-action="share-profile-save"]', 600)
        check('Zu kurzer Profilname wird erklaert', '3 bis 24' in await text(pa, '#shareError'))
        await make_profile(pa, 'yanis_kocht', 'Yanis')
        await make_profile(pb, 'berta', 'Berta')
        pr = await pa.evaluate("share.profile")
        check('Profil angelegt mit Einladungscode', pr and pr['handle'] == 'yanis_kocht' and pr['invite_code'].startswith('SAV-'), str(pr))
        await pb.evaluate("() => { state.view = 'settings-share'; render(); }"); await pb.wait_for_timeout(300)
        await pb.fill('#shareHandle', 'yanis_kocht'); await click(pb, '[data-action="share-profile-save"]', 600)
        check('Doppelter Profilname wird abgewiesen', 'schon vergeben' in await text(pb, '#shareError'))

        # 4. Verbinden: Anfrage, Bestaetigung
        await open_share(pa)
        await pa.fill('#shareTarget', '@Berta'); await click(pa, '[data-action="share-connect"]', 900)
        check('Anfrage gesendet, wartet auf Bestaetigung', 'wartet auf Bestätigung' in await text(pa, 'main'))
        send_before = await pa.evaluate("shareRpc('savora_send', {p_handle:'berta', p_recipe:{title:'X'}, p_image:null, p_message:null}).then(() => 'ok', e => e.message)")
        check('Vor der Bestaetigung kann nichts gesendet werden', 'nicht verbunden' in send_before, send_before)
        await pb.evaluate("shareCheckCount()"); await pb.wait_for_timeout(900)   # die automatische Abfrage meldet die neue Anfrage
        await open_share(pb)
        check('B sieht die Anfrage', 'möchte sich mit dir verbinden' in await text(pb, 'main'))
        await click(pb, '[data-action="share-respond"][data-answer="accept"]', 900)
        check('B nimmt an: verbunden', M.CONNS and 'accepted' in M.CONNS.values() and 'Entfernen' in await text(pb, 'main'))
        await open_share(pa)
        check('A sieht die Verbindung', 'Entfernen' in await text(pa, 'main') and 'wartet auf' not in await text(pa, 'main'))

        # 5. Rezept senden (mit Bild und Nachricht)
        n_a = await pa.evaluate("state.recipes.length")
        await show(pa, "() => { state.modal = null; state.activeRecipeId = 'r_legacy_1'; state.view = 'detail'; render(); }", '.detail-main')
        await pa.evaluate("() => { state.modal = { type: 'detail-menu', recipeId: 'r_legacy_1' }; render(); }"); await pa.wait_for_timeout(300)
        await click(pa, '[data-action="share-open-send"]', 700)
        modal_text = await text(pa, '.modal-sheet')
        check('Senden-Fenster zeigt Freund und Hinweis auf Kopie', 'Berta' in modal_text and 'Kopie' in modal_text, modal_text[:150])
        await pa.fill('#shareMessage', 'Probier das mal!')
        await click(pa, '[data-action="share-send"]', 1200)
        check('Rezept liegt serverseitig im Posteingang von B', len(M.SHARES) == 1 and list(M.SHARES.values())[0]['message'] == 'Probier das mal!' and list(M.SHARES.values())[0]['image'] is not None)
        sh = list(M.SHARES.values())[0]['recipe']
        check('Gesendet ohne Persoenliches (ID, Favorit, Bild-ID, Zeitstempel)', all(k not in sh for k in ('id', 'favorite', 'imageId', 'createdAt', 'updatedAt', 'cookLog')), str(sorted(sh)))
        check('Original bei A unveraendert', await pa.evaluate("state.recipes.length") == n_a and await pa.evaluate("!!state.recipes.find(r => r.id === 'r_legacy_1' && r.imageId)"))

        # 6. B: Posteingang, Vorschau, noch nichts im Kochbuch
        n_b = await pb.evaluate("state.recipes.length")
        await pb.evaluate("shareCheckCount()"); await pb.wait_for_timeout(1000)
        await pb.evaluate("() => { state.view = 'settings'; render(); }")
        check('B: Einstellungen zeigen "1 neu"', '1 neu' in await text(pb, 'main'), (await text(pb, 'main'))[:200])
        await open_share(pb)
        inbox_t = await text(pb, 'main')
        check('B: Posteingang zeigt Absender, Titel und Nachricht', 'Yanis' in inbox_t and 'Probier das mal!' in inbox_t)
        await click(pb, '[data-action="share-open-preview"]', 1200)
        pt = await text(pb, 'main')
        check('Vorschau zeigt Titel, Zutaten, Zubereitung', 'Zutaten' in pt and 'Zubereitung' in pt and 'Ins Kochbuch übernehmen' in pt, pt[:160])
        check('Vorschau zeigt das Bild', await pb.evaluate("!!document.querySelector('.share-preview-img') && document.querySelector('.share-preview-img').src.startsWith('data:image')"))
        check('Vorschau uebernimmt nichts ins Kochbuch', await pb.evaluate("state.recipes.length") == n_b)

        # 7. Uebernehmen: sofort nutzbar
        title = await pb.evaluate("shareFindInbox(share.previewId).title")
        await click(pb, '[data-action="share-accept"]', 1500)
        rec = await pb.evaluate("(t) => { const r = state.recipes.find(x => x.title === t); return r ? { id: r.id, fav: r.favorite, img: r.imageId, n: r.ingredients.length, by: r.sharedBy, servings: r.servings } : null; }", title)
        check('Uebernommen: eigene Kopie mit neuer ID, kein Favorit', rec and rec['id'] != 'r_legacy_1' and rec['fav'] is False and rec['n'] >= 1 and rec['by'] == 'yanis_kocht', str(rec))
        check('Bild wurde mit uebernommen', rec and rec['img'] and await pb.evaluate("(id) => dbGetImage(id).then(i => !!(i && i.blob && i.blob.size > 100 && i.thumbBlob))", rec['img']))
        check('Danach Rezeptansicht offen', await pb.evaluate("(id) => state.view === 'detail' && state.activeRecipeId === id", rec['id']))
        check('Posteingang serverseitig leer', len(M.SHARES) == 0)
        # sofort nutzbar: skalieren, Einkauf, Kochmodus
        use = await pb.evaluate("""(id) => { const r = state.recipes.find(x => x.id === id);
          const f = servingsFactor(r, r.servings * 2);
          const sel = shoppingSelectionFor(r, r.servings);
          return { f, shop: sel.length, text: r.ingredients.map(i => scaledAmountText(i, f)).join('|') }; }""", rec['id'])
        check('Skalieren (x2) und Einkaufsliste funktionieren sofort', use['f'] == 2 and use['shop'] >= 1, str(use))
        await show(pb, f"() => {{ state.view = 'detail'; state.activeRecipeId = '{rec['id']}'; render(); }}", '.detail-main')
        check('Kochmodus-Knopf vorhanden', await pb.evaluate("!!document.querySelector('[data-action=\"start-cook\"]')"))
        # Sync: Kopie landet in B's Cloud
        await pb.evaluate("cloudSyncNow()")
        check('Kopie wird mit B synchronisiert (nicht mit A)', any(k[0] != list(M.USERS.values())[0]['id'] and v['kind'] == 'recipe' and v['data'] and v['data']['id'] == rec['id'] for k, v in M.RECORDS.items()))
        await pa.evaluate("cloudSyncNow()")
        check('A bekommt die Kopie nicht', await pa.evaluate("(id) => !state.recipes.some(r => r.id === id)", rec['id']))

        # 8. Ablehnen
        await pa.evaluate("""() => shareRpc('savora_send', {p_handle:'berta', p_recipe:{title:'Abgelehnt-Test', ingredients:[{name:'Salz',amount:'1',unit:'TL'}], steps:[{text:'x'}]}, p_image:null, p_message:null})""")
        await pb.evaluate("shareRefresh()"); await pb.wait_for_timeout(600)
        n_b2 = await pb.evaluate("state.recipes.length")
        await open_share(pb)
        await click(pb, '[data-action="share-open-preview"]', 800)
        await click(pb, '[data-action="share-decline"]', 900)
        check('Ablehnen: nichts im Kochbuch, serverseitig geloescht', await pb.evaluate("state.recipes.length") == n_b2 and len(M.SHARES) == 0)

        # 9. Boeswillige Nutzlast wird entschaerft
        await pa.evaluate("""() => shareRpc('savora_send', {p_handle:'berta', p_recipe:JSON.parse('{"title":"<img src=x onerror=window.__pwn=1>Gift","id":"r_legacy_1","favorite":true,"__proto__":{"polluted":1},"imageId":"img_legacy_1","ingredients":[{"name":"<b>fett</b>","amount":"2","unit":"g"}],"steps":[{"text":"<script>window.__pwn=2</script>"}],"servings":"abc"}'), p_image:null, p_message:null})""")
        await pb.evaluate("shareRefresh()"); await pb.wait_for_timeout(600)
        await open_share(pb)
        await click(pb, '[data-action="share-open-preview"]', 800)
        check('Vorschau escaped HTML (kein eingeschleustes Element)', await pb.evaluate("!document.querySelector('.share-preview img[src=x], .share-preview script, .share-preview b') && window.__pwn === undefined"))
        await click(pb, '[data-action="share-accept"]', 1200)
        r2 = await pb.evaluate("() => { const r = state.recipes.find(x => x.title.includes('Gift')); return r ? { id: r.id, fav: r.favorite, img: r.imageId || null, servings: r.servings, polluted: ({}).polluted } : null; }")
        check('Fremde ID/Favorit/Bild-ID werden nicht uebernommen, kein Prototyp-Eintrag', r2 and r2['id'] != 'r_legacy_1' and r2['fav'] is False and r2['img'] is None and r2['servings'] == 0 and r2['polluted'] is None, str(r2))
        check('Bestehendes Rezept bei B (gleiche ID wie A) nicht ueberschrieben', await pb.evaluate("state.recipes.filter(r => r.id === 'r_legacy_1').length") <= 1)

        # 10. Nicht verbunden: senden nicht moeglich
        M.PROFILES['fake-carl'] = {'handle': 'carl', 'display_name': 'Carl', 'invite_code': 'SAV-CCCC-DDDD'}
        e = await pb.evaluate("shareRpc('savora_send', {p_handle:'carl', p_recipe:{title:'X'}, p_image:null, p_message:null}).then(() => 'ok', e => e.message)")
        check('An Unverbundene senden geht nicht', 'nicht verbunden' in e, e)
        e = await pb.evaluate("shareRpc('savora_send', {p_handle:'yanis_kocht', p_recipe:{title:'X'}, p_image:'data:text/html;base64,AAAA', p_message:null}).then(() => 'ok', e => e.message)")
        check('Ungueltiges Bild wird abgewiesen', 'Ungültiges Bild' in e, e)
        e = await pb.evaluate("shareRpc('savora_send', {p_handle:'yanis_kocht', p_recipe:{title:'X'}, p_image:null, p_message:'a'.repeat(201)}).then(() => 'ok', e => e.message)")
        check('Zu lange Nachricht wird abgewiesen', 'zu lang' in e, e)

        # 11. Einladungslink
        pr_b = await pb.evaluate("share.profile.invite_code")
        M.PROFILES['fake-dora'] = {'handle': 'dora', 'display_name': 'Dora', 'invite_code': 'SAV-ZZZZ-2222'}
        await pb.goto(URL + '?freund=SAV-ZZZZ-2222'); await pb.wait_for_function("typeof state !== 'undefined'")
        await pb.wait_for_function("state.view === 'settings-share'", timeout=8000)
        await pb.wait_for_selector('#shareTarget', state='attached', timeout=8000)
        check('Einladungslink oeffnet Freunde-Seite mit vorausgefuelltem Code', await pb.evaluate("document.getElementById('shareTarget').value") == 'SAV-ZZZZ-2222' and 'freund=' not in await pb.evaluate("location.search"))
        await click(pb, '[data-action="share-connect"]', 900)
        bid = M.USERS['berta@example.test']['id']
        check('Anfrage ueber Einladungscode (Profil dora)', M.CONNS.get((bid, 'fake-dora')) == 'pending')

        # 12. Blockieren und Entfernen
        await open_share(pb)
        await click(pb, '[data-action="share-remove"][data-id="yanis_kocht"]', 900)
        check('Verbindung entfernen', 'yanis_kocht' not in await text(pb, 'main'))
        e = await pa.evaluate("shareRpc('savora_send', {p_handle:'berta', p_recipe:{title:'X'}, p_image:null, p_message:null}).then(() => 'ok', e => e.message)")
        check('Nach dem Entfernen kein Senden mehr', 'nicht verbunden' in e, e)
        await pa.evaluate("shareRpc('savora_connect', {p_target:'berta'})"); await pb.evaluate("shareRefresh()"); await pb.wait_for_timeout(500)
        await open_share(pb)
        await click(pb, '[data-action="share-respond"][data-answer="block"]', 900)
        e = await pa.evaluate("shareRpc('savora_connect', {p_target:'berta'}).then(() => 'ok', e => e.message)")
        check('Blockiert: A findet B nicht mehr', 'nicht gefunden' in e, e)

        # 13. Abmelden raeumt auf, Konto loeschen entfernt Profil
        await pb.evaluate("cloudAuthSignOut()")
        check('Abmelden setzt Freunde-Zustand zurueck', await pb.evaluate("share.profile === undefined && share.inbox.length === 0"))
        uidA = await pa.evaluate("cloudUserId()")
        await pa.evaluate("cloudDeleteAccount()")
        check('Konto loeschen entfernt Profil und Verbindungen', uidA not in M.PROFILES and not any(uidA in k for k in M.CONNS))

        errs = errA + errB
        check('Keine JS-Fehler', not errs, '; '.join(errs[:3]))
        await bA.close(); await bB.close()
    print('\nFEHLER:' if FAIL else '\nALLE OK', FAIL if FAIL else '')
    sys.exit(1 if FAIL else 0)
asyncio.run(main())
