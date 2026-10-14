"""Teilen ueberarbeitet: Seite «Socialize» (Handy zuerst, Tablet/Desktop in Spalten).
Prueft pro Zustand nur das Noetige (ohne Konto, ohne Profil, ohne Freunde, mit Freunden, Anfrage, Posteingang), die Reihenfolge der Bereiche
(Posteingang, Anfragen, Rezept senden, Freunde, Profil), Zaehler, eingeklappte Bereiche (und dass sie ein Neuzeichnen ueberleben),
den Ablauf Rezept waehlen, Freund waehlen, senden, Fehlertexte ohne Internet, Vorschau (Entscheidung vor den Zutaten),
Touchflaechen (44 px), Tastatur/Fokus, aria-Namen, Reduced Motion, Hell/Dunkel und kein horizontaler Ueberlauf bei 320/390/820/1440.
Laeuft gegen den Test-Datenbank-Nachbau (tests/mock_supabase.py) auf einem eigenen Port (SAVORA_MOCK_PORT, Standard 8797)."""
import asyncio, os, sys, threading, uuid
os.environ.setdefault('SAVORA_TEST_PORT', '9960')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
import mock_supabase as M
from http.server import ThreadingHTTPServer
MOCK_PORT = int(os.environ.get('SAVORA_MOCK_PORT', '8797'))
srv = ThreadingHTTPServer(('127.0.0.1', MOCK_PORT), M.H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
CLOUD = "window.SAVORA_CLOUD_URL_OVERRIDE = 'http://127.0.0.1:%d'; window.SAVORA_CLOUD_KEY_OVERRIDE = 'test-key';" % MOCK_PORT
HIDE_SB = "document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = 'html { scrollbar-width: none } html::-webkit-scrollbar { display: none }'; document.head.appendChild(s); });"
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

PROFILE = "{handle:'yanis_kocht', display_name:'Yanis', invite_code:'SAV-AB12-CD34'}"
CONNS = """[{handle:'berta', display_name:'Berta', state:'connected'},{handle:'carl_baut', display_name:'', state:'connected'},
 {handle:'dora', display_name:'Dora', state:'incoming'},{handle:'emil', display_name:'Emil', state:'outgoing'},{handle:'fritz', display_name:'Fritz', state:'blocked'}]"""
INBOX = """[{id:'s1', from_handle:'berta', from_name:'Berta', title:'Pasta al Limone mit Ricotta', message:'Probier das mal!', has_image:false, recipe:{title:'Pasta al Limone mit Ricotta', servings:2, timeMinutes:25, ingredients:[{amount:'200',unit:'g',name:'Spaghetti'}], steps:[{text:'Pasta kochen.'}]}}]"""
async def setup(page, profile, conns, inbox, ui='{}'):
    await page.evaluate(f"""() => {{ share.profile = {profile}; share.connections = {conns}; share.inbox = {inbox}; share.error = null; share.ui = {ui};
      share.count = share.connections.filter(c => c.state==='incoming').length + share.inbox.length; share.fetchedAt = Date.now()+1e10; share.loading = false;
      state.modal = null; state.view = 'settings-share'; render(); window.scrollTo(0,0); }}""")
    await page.wait_for_timeout(350)
async def ev(page, js, *a): return await page.evaluate(js, *a)
async def tab(page, t):
    await page.evaluate("(t) => { share.ui.tab = t; render(); }", t); await page.wait_for_timeout(120)
HEADS = "() => Array.from(document.querySelectorAll('main .tl-h')).filter(h => h.offsetParent !== null).map(h => h.textContent.trim())"
SMALL_JS = """() => Array.from(document.querySelectorAll('main .tl button, main .tl summary, main .tl input, main .tl textarea, .modal-sheet button, .modal-sheet input:not([type=radio]), .modal-sheet label.share-person'))
  .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
  .filter(e => e.getBoundingClientRect().height < 43.5).map(e => (e.getAttribute('data-action') || e.tagName) + ':' + Math.round(e.getBoundingClientRect().height))"""

async def main():
    M.USERS['yanis@example.test'] = {'id': str(uuid.uuid4()), 'password': 'geheim-123', 'confirmed': True}
    async with async_playwright() as p:
        browser, ctx = await open_ctx(p)
        await ctx.add_init_script(CLOUD); await ctx.add_init_script(HIDE_SB)
        page = await ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(2000)
        await page.evaluate("() => document.fonts.ready.then(() => 1)")

        # 1 Ohne Konto
        await page.evaluate("() => { state.modal = null; state.view = 'settings-share'; render(); }"); await page.wait_for_timeout(300)
        t = await ev(page, "document.querySelector('main').innerText")
        check('Ohne Konto: erklaert Konto und Datenschutz, eine Hauptaktion', 'Konto' in t and 'Niemand sieht dein Kochbuch' in t and await ev(page, "document.querySelectorAll('main .tl .primary-btn').length") >= 1 and not await ev(page, "!!document.querySelector('#shareHandle, #shareTarget')"))
        check('Ohne Konto: Name beim Teilen bleibt erreichbar', await ev(page, "!!document.getElementById('f-sender-name')"))
        check('Ohne Konto: kein Cloud-Verkehr', len(M.LOG) == 0)

        # Anmelden
        await page.evaluate("() => { state.modal = null; state.view = 'settings-sync'; render(); }"); await page.wait_for_selector('#cloudEmail')
        await page.fill('#cloudEmail', 'yanis@example.test'); await page.fill('#cloudPassword', 'geheim-123')
        await page.evaluate("() => document.querySelector('[data-action=\"cloud-sign-in\"]').click()"); await page.wait_for_timeout(1800)

        # 2 Ohne Profil: nur Einrichtung
        await setup(page, 'null', '[]', '[]')
        h = await ev(page, HEADS)
        check('Ohne Profil: nur «Profil einrichten», sonst nichts', h == ['Profil einrichten'] and await ev(page, "!!document.querySelector('#shareHandle') && !document.querySelector('#shareTarget') && !document.querySelector('.tl-fold')"), str(h))
        check('Ohne Profil: Felder haben sichtbare Beschriftung und Format-Hinweis', await ev(page, "document.querySelector('label[for=shareHandle]').textContent.includes('Profilname') && !!document.getElementById('shareHandleHint')"))

        # 3 Profil, keine Freunde: Freund hinzufuegen ist offen, Anleitung, kein Senden/Posteingang
        await setup(page, PROFILE, '[]', '[]')
        h = await ev(page, HEADS)
        t = await ev(page, "document.querySelector('main').innerText")
        check('Ohne Freunde: Bereiche Freunde und Profil, kein Posteingang, kein «Rezept senden»', h == ['Freunde', 'Mein Profil'], str(h))
        check('Ohne Freunde: Anleitung in 3 Schritten und offenes Feld zum Hinzufuegen', await ev(page, "document.querySelectorAll('.tl-steps li').length") == 3 and await ev(page, "document.querySelector('.tl-fold[data-ui=add]').open") and 'Noch keine Freunde' in t)
        check('Ohne Freunde: Einladungscode sofort sichtbar (Profil offen)', await ev(page, "document.querySelector('.tl-fold[data-ui=profile]').open") and 'SAV-AB12-CD34' in t)

        # 4 Mit Freunden, Anfrage, Posteingang: Reihenfolge und Zaehler
        await setup(page, PROFILE, CONNS, INBOX)
        check('Drei Reiter: Posteingang (2 neu), Senden, Freunde', await ev(page, "Array.from(document.querySelectorAll('.tl-tab')).map(b => b.textContent.replace(/\\d+$/, '').trim()).join('|')") == 'Posteingang|Senden|Freunde' and await ev(page, "document.querySelector('#tl-tab-inbox .tl-badge').getAttribute('aria-label')") == '2 neu')
        h = await ev(page, HEADS)
        check('Startreiter Posteingang zeigt Anfragen und Posteingang', [x.rstrip('0123456789') for x in h] == ['Anfragen', 'Posteingang'], str(h))
        await tab(page, 'send')
        check('Reiter Senden: Haupt-Knopf «Rezept waehlen» vorhanden', await ev(page, "!!document.querySelector('[data-action=share-pick-open]')"))
        await tab(page, 'friends')
        h = await ev(page, HEADS)
        check('Reiter Freunde: Freunde, Mein Profil', [x.rstrip('0123456789') for x in h][:2] == ['Freunde', 'Mein Profil'], str(h))
        check('Hinzufuegen, Verwalten und Profil sind eingeklappt', await ev(page, "Array.from(document.querySelectorAll('.tl-fold')).every(f => !f.open)"))
        check('Freunde-Liste zeigt verbundene und wartende, Blockierte nur unter «verwalten»', 'Berta' in await ev(page, "document.querySelector('#tl-panel').innerText") and 'wartet auf Bestätigung' in await ev(page, "document.body.innerText") and 'Fritz' not in await ev(page, "Array.from(document.querySelectorAll('.tl-sec .tl-list.tl-card')).map(l => l.innerText).join(' ')"))
        await tab(page, 'inbox')
        names = await ev(page, "Array.from(document.querySelectorAll('main .tl button[data-action^=share-]')).filter(b => b.getBoundingClientRect().width > 0 && !b.textContent.trim()).length")
        check('Alle Knöpfe haben einen Namen', names == 0)
        check('Aktionsknoepfe nennen die Person (aria-label)', await ev(page, "Array.from(document.querySelectorAll('[data-action=share-respond]')).every(b => /Dora/.test(b.getAttribute('aria-label') || b.textContent)) && /Pasta/.test(document.querySelector('[data-action=share-open-preview]').getAttribute('aria-label'))"))
        await tab(page, 'friends')
        # eingeklappte Bereiche ueberleben ein Neuzeichnen
        await page.evaluate("() => { const d = document.querySelector('.tl-fold[data-ui=manage]'); d.open = true; }"); await page.wait_for_timeout(100)
        await page.evaluate("() => render()"); await page.wait_for_timeout(200)
        check('Aufgeklappter Bereich bleibt nach dem Neuzeichnen offen', await ev(page, "document.querySelector('.tl-fold[data-ui=manage]').open"))
        t = await ev(page, "document.querySelector('.tl-fold[data-ui=manage]').innerText")
        check('Verwalten: Entfernen und Entsperren sind erreichbar', 'Entfernen' in t and 'Entsperren' in t and 'Fritz' in t)
        # 5 Leerer Posteingang
        await setup(page, PROFILE, CONNS, '[]')
        check('Leerer Posteingang mit Freunden erklaert, was passiert', 'Nichts Neues' in await ev(page, "document.querySelector('main').innerText"))
        await setup(page, PROFILE, "[{handle:'berta', display_name:'Berta', state:'connected'}]", '[]')
        check('Keine Anfrage: Bereich «Anfragen» fehlt', 'Anfragen' not in await ev(page, HEADS))

        # 6 Senden in drei Schritten: Rezept waehlen, Freund waehlen, senden
        await setup(page, PROFILE, "[{handle:'berta', display_name:'Berta', state:'connected'},{handle:'carl_baut', display_name:'', state:'connected'}]", '[]')
        await tab(page, 'send')
        await page.evaluate("() => document.querySelector('[data-action=share-pick-open]').click()"); await page.wait_for_selector('#sharePickQ'); await page.wait_for_timeout(300)
        check('Schritt 1: Dialog «Welches Rezept senden?» mit Suche und Liste', 'Welches Rezept senden' in await ev(page, "document.querySelector('.modal-sheet').innerText") and await ev(page, "document.querySelectorAll('.tl-pick').length") >= 3)
        await page.fill('#sharePickQ', 'Sloppy'); await page.wait_for_timeout(150)
        check('Suche filtert die Rezeptliste', await ev(page, "document.querySelectorAll('.tl-pick').length") == 1)
        await page.fill('#sharePickQ', 'gibtesnicht'); await page.wait_for_timeout(150)
        check('Keine Treffer: klare Meldung', 'Kein Rezept gefunden' in await ev(page, "document.getElementById('sharePickList').innerText"))
        await page.fill('#sharePickQ', 'Sloppy'); await page.wait_for_timeout(150)
        check('Rezept- und Dialogknoepfe sind mindestens 44 px hoch', await ev(page, SMALL_JS) == [], str(await ev(page, SMALL_JS)))
        await page.evaluate("() => document.querySelector('.tl-pick').click()"); await page.wait_for_selector('[data-action=share-send]'); await page.wait_for_timeout(300)
        mt = await ev(page, "document.querySelector('.modal-sheet').innerText")
        check('Schritt 2: Freund waehlen (erster vorgewaehlt), Hinweis auf Kopie, anderes Rezept moeglich', 'Sloppy Joe' in mt and 'Kopie' in mt and 'Berta' in mt and 'Anderes Rezept' in mt and await ev(page, "document.querySelector('input[name=shareTo]:checked').value") == 'berta')
        check('Empfaenger-Auswahl ist beschriftet (Gruppe mit Titel)', await ev(page, "document.querySelector('fieldset.share-people legend').textContent.includes('Wem')"))
        check('Senden-Dialog: Knoepfe mindestens 44 px', await ev(page, SMALL_JS) == [], str(await ev(page, SMALL_JS)))
        await page.evaluate("() => document.querySelector('input[name=shareTo][value=carl_baut]').click()")
        await page.fill('#shareMessage', 'Guten Appetit!')
        before = len(M.SHARES)
        # Ohne Internet: verstaendliche Meldung, Dialog bleibt offen
        await ctx.set_offline(True)
        await page.evaluate("() => document.querySelector('[data-action=share-send]').click()"); await page.wait_for_timeout(700)
        et = await ev(page, "document.getElementById('shareError').textContent")
        check('Senden ohne Internet: Meldung nennt Grund, Rezept nicht gesendet, Dialog bleibt', 'Keine Verbindung' in et and 'nicht gesendet' in et and len(M.SHARES) == before and await ev(page, "!!document.querySelector('[data-action=share-send]')"), et)
        await ctx.set_offline(False)
        # Die Freunde sind hier nur im Speicher der Seite (kein echtes zweites Konto): der Serveraufruf wird abgefangen. Die echte Strecke prueft test_paket36.
        await page.evaluate("() => { window.__sent = null; const orig = shareRpc; shareRpc = async (n, a) => { if (n === 'savora_send') { window.__sent = a; return null; } return orig(n, a); }; }")
        await page.evaluate("() => document.querySelector('[data-action=share-send]').click()"); await page.wait_for_timeout(1500)
        sent = await ev(page, "window.__sent && { to: window.__sent.p_handle, msg: window.__sent.p_message, img: String(window.__sent.p_image).slice(0, 11), title: window.__sent.p_recipe.title, id: window.__sent.p_recipe.id || null }")
        check('Schritt 3: gesendet an den gewaehlten Freund, mit Bild und Nachricht, ohne Persoenliches', sent and sent['to'] == 'carl_baut' and sent['msg'] == 'Guten Appetit!' and sent['img'] == 'data:image/' and sent['id'] is None, str(sent))
        check('Dialog geschlossen, Seite unveraendert offen', await ev(page, "!state.modal && state.view === 'settings-share'"))

        # 7 Senden ohne Freunde und ohne Profil: naechster Schritt
        await setup(page, PROFILE, '[]', '[]')
        await page.evaluate("() => openModal({ type: 'share-send', recipeId: 'r_legacy_1' })"); await page.wait_for_timeout(300)
        mt = await ev(page, "document.querySelector('.modal-sheet').innerText")
        check('Senden ohne Freunde: «Freund hinzufuegen» als naechster Schritt', 'noch keine Freunde' in mt and 'Freund hinzufügen' in mt)
        await page.evaluate("() => document.querySelector('.modal-sheet [data-action=close-modal]').click()"); await page.wait_for_timeout(400)
        check('Dieser Knopf schliesst den Dialog auf der Teilen-Seite', await ev(page, "!state.modal && state.view === 'settings-share'"))
        await setup(page, 'null', '[]', '[]')
        await page.evaluate("() => openModal({ type: 'share-send', recipeId: 'r_legacy_1' })"); await page.wait_for_timeout(300)
        check('Senden ohne Profil: «Profil einrichten»', 'Profil einrichten' in await ev(page, "document.querySelector('.modal-sheet').innerText"))
        await page.evaluate("() => { state.modal = null; render(); }")

        # 8 Ohne Internet auf der Seite: Fehlertexte
        await setup(page, PROFILE, '[]', '[]')
        await tab(page, 'friends')
        await ctx.set_offline(True)
        await page.fill('#shareTarget', '@berta'); await page.evaluate("() => document.querySelector('[data-action=share-connect]').click()"); await page.wait_for_timeout(700)
        check('Freund hinzufuegen ohne Internet: Fehlertext beim Feld', 'Keine Verbindung' in await ev(page, "document.getElementById('shareConnectError').textContent"))
        await page.evaluate("() => { document.activeElement.blur(); share.fetchedAt = 0; return shareRefresh(); }"); await page.wait_for_timeout(700)
        check('Neu laden ohne Internet: Hinweis «Stand von vorhin» mit Knopf', 'Stand von vorhin' in await ev(page, "(document.querySelector('.tl-banner') || {innerText: ''}).innerText") and await ev(page, "!!document.querySelector('.tl-banner [data-action=share-refresh]')"))
        check('Ohne Internet bleibt die Seite benutzbar (Profil weiter sichtbar)', await ev(page, "!!document.querySelector('.tl-fold[data-ui=profile]')"))
        await ctx.set_offline(False)
        await page.evaluate("() => { share.error = null; share.profile = undefined; share.fetchedAt = 0; share.loading = false; }")
        await page.evaluate("() => { shareReset(); share.error = 'Keine Verbindung zum Internet. Zum Teilen brauchst du Internet. Deine Rezepte sind davon nicht betroffen.'; render(); }"); await page.wait_for_timeout(300)
        check('Erstes Laden ohne Internet: Fehlerkarte mit «Nochmals versuchen»', 'Nochmals versuchen' in await ev(page, "document.querySelector('main').innerText") and 'Rezepte sind davon nicht betroffen' in await ev(page, "document.querySelector('main').innerText"))

        # 9 Vorschau: Entscheidung vor den Zutaten
        await setup(page, PROFILE, CONNS, INBOX)
        await page.evaluate("() => { share.previewId = 's1'; state.view = 'settings-share-preview'; render(); }"); await page.wait_for_timeout(300)
        order = await ev(page, "(() => { const a = document.querySelector('[data-action=share-accept]'), z = document.querySelector('.share-sub'); return !!(a.compareDocumentPosition(z) & Node.DOCUMENT_POSITION_FOLLOWING); })()")
        check('Vorschau: Uebernehmen und Ablehnen stehen vor den Zutaten, mit Erklaerung', order and 'Vorschau' in await ev(page, "document.querySelector('.share-preview-actions').innerText"))

        check('Vorschau: dritter Weg «In Rezepte von Freunden behalten» vorhanden', await ev(page, "!!document.querySelector('[data-action=share-accept][data-mode=keep]')"))
        n0 = await ev(page, "state.recipes.length")
        await page.evaluate("() => document.querySelector('[data-action=share-accept][data-mode=keep]').click()"); await page.wait_for_timeout(1500)
        kept = await ev(page, "state.recipes.filter(r => (r.collections || []).includes('friends')).map(r => r.title)")
        check('Behalten: Rezept liegt in der Kategorie «Rezepte von Freunden»', await ev(page, "state.recipes.length") == n0 + 1 and kept == ['Pasta al Limone mit Ricotta'], str(kept))
        check('Kategorie erscheint im Filter und filtert', await ev(page, "moreFilterOptions().some(o => o.id === 'friends' && o.label === 'Rezepte von Freunden') && recipesInCollection('friends', state.recipes).length === 1"))

        # 10 Tastatur und Fokus, Reduced Motion
        await setup(page, PROFILE, CONNS, INBOX)
        await tab(page, 'friends')
        await page.keyboard.press('Tab'); 
        await page.evaluate("() => document.querySelector('.tl-fold[data-ui=add] > summary').focus()")
        await page.keyboard.press('Enter'); await page.wait_for_timeout(150)
        check('Tastatur: Enter auf «Freund hinzufuegen» klappt auf, Zustand bleibt gemerkt', await ev(page, "document.querySelector('.tl-fold[data-ui=add]').open && share.ui.add === true"))
        await page.keyboard.press('Tab')
        await page.evaluate("() => document.querySelector('.tl-fold[data-ui=add] > summary').focus()")
        fo = await ev(page, "(() => { const s = document.activeElement; const c = getComputedStyle(s); return c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0; })()")
        check('Fokus ist sichtbar (Klappzeile)', fo)
        check('Reduced Motion: Pfeil der Klappzeile ohne Uebergang', await ev(page, "getComputedStyle(document.querySelector('.tl-fold-chev')).transitionDuration") in ('0s', '0s, 0s') or await ev(page, "parseFloat(getComputedStyle(document.querySelector('.tl-fold-chev')).transitionDuration)") < 0.01, await ev(page, "getComputedStyle(document.querySelector('.tl-fold-chev')).transitionDuration"))
        check('Alle Knoepfe und Klappzeilen mindestens 44 px', await ev(page, SMALL_JS) == [], str(await ev(page, SMALL_JS)))

        # 11 Breiten und Themen: kein Ueberlauf, Spalten ab Tablet-quer/Desktop
        for w, hgt in [(320, 640), (390, 844), (820, 1100), (1440, 900)]:
            await page.set_viewport_size({'width': w, 'height': hgt}); await page.wait_for_timeout(250)
            for th in ['light', 'dark']:
                await page.evaluate("(t) => { state.theme = t; applyTheme(); }", th)
                for view in ['list', 'prev']:
                    if view == 'list': await setup(page, PROFILE, CONNS, INBOX, "{add:true, manage:true, profile:true, tab:'friends'}")
                    else: await page.evaluate("() => { share.previewId = 's1'; state.view = 'settings-share-preview'; render(); }"); await page.wait_for_timeout(250)
                    ov = await ev(page, "(() => { const W = document.documentElement.clientWidth; return document.documentElement.scrollWidth - W; })()")
                    check(f'{w} px {th} {view}: kein horizontaler Ueberlauf', ov <= 0, f'{ov}')
            await setup(page, PROFILE, CONNS, INBOX)
            check(f'{w} px: eine Spalte, Reiter nebeneinander und gross genug', await ev(page, "(() => { const t = Array.from(document.querySelectorAll('.tl-tab')).map(b => b.getBoundingClientRect()); return t.length === 3 && t.every(r => r.height >= 43.5 && Math.abs(r.top - t[0].top) < 2) && !document.querySelector('.tl-cols'); })()"))
        await page.evaluate("(t) => { state.theme = t; applyTheme(); }", 'light')

        check('Keine JS-Fehler', not errs, '; '.join(errs[:3]))
        await browser.close()
    print('\nFEHLER:' if FAIL else '\nALLE OK', FAIL if FAIL else '')
    sys.exit(1 if FAIL else 0)
asyncio.run(main())
