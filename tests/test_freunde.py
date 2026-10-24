"""Freunde & Rezepte (Mehr > Austauschen): Zustaende, Ablauf und Datenschutz der neuen Seiten.
Prueft: Profil-Zustaende loading/ready/absent/error ohne falsches «Einrichten» (Seite und Mehr-Zeile, reaktiv ohne Navigation),
Reiter per Tastatur, Senden nur mit ausdruecklichem Versand (beide Einstiege, Doppelklickschutz, Erfolg und Fehler getrennt),
Einladungscode nur auf «Freund hinzufuegen», Warnung vor neuem Code, Profil (Validierung, Erfolg, Netzwerkfehler, Doppelklick),
Namenszwecke getrennt, alte Routen, Uebernehmen mit Doppelklickschutz.
Nur gegen den Nachbau tests/mock_supabase.py, nie echte Konten oder Sendungen."""
import asyncio, os, sys, threading, uuid
os.environ.setdefault('SAVORA_TEST_PORT', '9970')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
import mock_supabase as M
from http.server import ThreadingHTTPServer
MOCK_PORT = int(os.environ.get('SAVORA_MOCK_PORT', '8798'))
srv = ThreadingHTTPServer(('127.0.0.1', MOCK_PORT), M.H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
CLOUD = "window.SAVORA_CLOUD_URL_OVERRIDE = 'http://127.0.0.1:%d'; window.SAVORA_CLOUD_KEY_OVERRIDE = 'test-key';" % MOCK_PORT
HIDE_SB = "document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = 'html { scrollbar-width: none } html::-webkit-scrollbar { display: none }'; document.head.appendChild(s); });"
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

async def ev(page, js, *a): return await page.evaluate(js, *a)
async def main_text(page): return await ev(page, "document.querySelector('main').innerText")
async def goto_view(page, view, tab=None):
    await ev(page, "([v, t]) => { if (document.activeElement) document.activeElement.blur(); state.modal = null; if (t) share.ui.tab = t; state.view = v; render(); }", [view, tab])
    await page.wait_for_timeout(350)
def rpc_count(name): return sum(1 for m, p in M.LOG if p.endswith('/rpc/' + name))

async def main():
    email = 'yanis@example.test'
    M.USERS[email] = {'id': str(uuid.uuid4()), 'password': 'geheim-123', 'confirmed': True}
    me = M.USERS[email]['id']
    async with async_playwright() as p:
        browser, ctx = await open_ctx(p)
        await ctx.add_init_script(CLOUD); await ctx.add_init_script(HIDE_SB)
        page = await ctx.new_page()
        errs, logs = [], []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.on("console", lambda m: logs.append(m.text))
        page.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(2000)
        await ev(page, "() => document.fonts.ready.then(() => 1)")

        # Anmelden (Nachbau-Konto)
        await goto_view(page, 'settings-account')
        await page.wait_for_selector('#cloudEmail')
        await page.fill('#cloudEmail', email); await page.fill('#cloudPassword', 'geheim-123')
        await ev(page, "() => document.querySelector('[data-action=\"cloud-sign-in\"]').click()"); await page.wait_for_timeout(1800)

        # ---------- 1 Profil-Zustaende ----------
        M.PROFILES[me] = {'handle': 'yanis_kocht', 'display_name': 'Yanis', 'invite_code': 'SAV-AB12-CD34'}
        M.PROFILES['f-berta'] = {'handle': 'berta', 'display_name': 'Berta', 'invite_code': 'SAV-BBBB-2222'}
        M.PROFILES['f-carl'] = {'handle': 'carl_baut', 'display_name': '', 'invite_code': 'SAV-CCCC-3333'}
        M.CONNS[(me, 'f-berta')] = 'accepted'; M.CONNS[('f-carl', me)] = 'accepted'

        # 1a loading: Antwort wird festgehalten
        gate = asyncio.Event()
        async def slow(route):
            await gate.wait(); await route.continue_()
        await page.route('**/rpc/savora_profile_get', slow)
        await ev(page, "() => { shareReset(); state.view = 'friends'; render(); }"); await page.wait_for_timeout(600)
        t = await main_text(page)
        check('Laedt: «Profil wird geladen …», nie «Profil einrichten»', 'Profil wird geladen' in t and 'einrichten' not in t.lower() and await ev(page, "shareProfileState()") == 'loading', t[:120])
        check('Laedt: Statusbereich fuer Screenreader (role=status), keine Reiter', await ev(page, "!!document.querySelector('main [role=status]') && !document.querySelector('[role=tab]')"))
        await ev(page, "() => { state.view = 'more'; render(); }")
        await goto_view(page, 'settings')
        check('Laedt: Zeile auf «Mehr» zeigt «Profil wird geladen …», kein «Einrichten»', await ev(page, "friendsSummary()") == 'Profil wird geladen …' and 'einrichten' not in (await main_text(page)).lower())
        await goto_view(page, 'friends')
        gate.set(); await page.wait_for_selector('[role=tab]', timeout=8000)
        check('Aufgeloest: Seite zeichnet sich von selbst neu (ohne Navigation), Zustand ready', await ev(page, "shareProfileState()") == 'ready' and 'Empfangen' in await main_text(page))
        await page.unroute('**/rpc/savora_profile_get', slow)

        # 1b: Mehr-Zeile wird nach Aufloesung reaktiv aktualisiert
        gate2 = asyncio.Event()
        async def slow2(route):
            await gate2.wait(); await route.continue_()
        await page.route('**/rpc/savora_profile_get', slow2)
        await ev(page, "() => { shareReset(); state.view = 'more'; render(); }"); await page.wait_for_timeout(500)
        check('Mehr-Zeile waehrend des Ladens', 'Profil wird geladen' in await main_text(page))
        gate2.set(); await page.wait_for_function("document.querySelector('main').innerText.includes('2 Freunde')", timeout=8000)
        check('Mehr-Zeile zeigt nach dem Laden echte Zahl («2 Freunde») ohne Navigation', await ev(page, "friendsSummary()") == '2 Freunde')
        await page.unroute('**/rpc/savora_profile_get', slow2)

        # 1c error: Netz faellt aus
        async def fail(route): await route.abort('failed')
        await page.route('**/rpc/savora_profile_get', fail)
        await ev(page, "() => { shareReset(); state.view = 'friends'; render(); }"); await page.wait_for_timeout(1000)
        t = await main_text(page)
        check('Ladefehler: «Profil konnte nicht geladen werden.» mit «Erneut versuchen», ohne Neuanlage', 'Profil konnte nicht geladen werden.' in t and 'Erneut versuchen' in t and 'einrichten' not in t.lower() and not await ev(page, "!!document.getElementById('shareHandle')") and await ev(page, "shareProfileState()") == 'error', t[:200])
        await goto_view(page, 'settings')
        check('Ladefehler: Mehr-Zeile ohne «Einrichten»', 'einrichten' not in (await ev(page, "friendsSummary()")).lower() and 'konnte nicht geladen' in await ev(page, "friendsSummary()"))
        await goto_view(page, 'friends-profile')
        check('Ladefehler: auch die Profilseite bietet keine Neuanlage an', 'Profil konnte nicht geladen werden.' in await main_text(page) and not await ev(page, "!!document.getElementById('shareHandle')"))
        await goto_view(page, 'friends-add')
        check('Ladefehler: «Freund hinzufügen» zeigt keinen Code und kein Formular', 'SAV-AB12-CD34' not in await ev(page, "document.body.innerText") and not await ev(page, "!!document.getElementById('shareTarget')"))
        await page.unroute('**/rpc/savora_profile_get', fail)
        await goto_view(page, 'friends')
        await ev(page, "() => document.querySelector('[data-action=share-refresh]').click()")
        await page.wait_for_selector('[role=tab]', timeout=8000)
        check('«Erneut versuchen» laedt das vorhandene Profil (kein Neuanlegen noetig)', await ev(page, "shareProfileState()") == 'ready' and rpc_count('savora_profile_set') == 0)

        # 1d Teilfehler: Posteingang scheitert, Profil bleibt
        async def inbox_fail(route): await route.fulfill(status=500, content_type='application/json', body='{"message":"Serverfehler"}')
        await page.route('**/rpc/savora_inbox', inbox_fail)
        await ev(page, "() => { shareReset(); state.view = 'friends'; render(); }"); await page.wait_for_timeout(1200)
        check('Posteingang-Fehler verwirft das geladene Profil nicht', await ev(page, "shareProfileState()") == 'ready' and await ev(page, "!!share.profile && share.profile.handle") == 'yanis_kocht' and await ev(page, "!!document.querySelector('.tl-banner')"))
        await page.unroute('**/rpc/savora_inbox', inbox_fail)

        # 1e absent: bestaetigt fehlendes Profil
        saved = M.PROFILES.pop(me)
        await ev(page, "() => { shareReset(); state.view = 'friends'; render(); }"); await page.wait_for_selector('#shareHandle', timeout=8000)
        t = await main_text(page)
        check('Bestaetigt fehlend: «Profil einrichten» mit beiden Namensfeldern', await ev(page, "shareProfileState()") == 'absent' and 'Profil einrichten' in t and await ev(page, "!!document.getElementById('shareName')"))
        check('Mehr-Zeile bei bestaetigt fehlendem Profil: «Profil einrichten»', await ev(page, "friendsSummary()") == 'Profil einrichten')
        await goto_view(page, 'friends-add')
        check('Ohne Profil: «Freund hinzufügen» fuehrt zuerst zur Einrichtung', 'Zuerst ein Profil einrichten' in await main_text(page))
        M.PROFILES[me] = saved
        await ev(page, "() => { shareReset(); state.view = 'friends'; render(); }"); await page.wait_for_selector('[role=tab]', timeout=8000)

        # 1f alte Routen
        await goto_view(page, 'settings-share')
        check('Alte Route settings-share zeigt «Freunde & Rezepte»', await ev(page, "document.querySelector('.topbar-title').textContent") == 'Freunde' and await ev(page, "!!document.querySelector('[role=tablist]')"))
        check('Mehr bleibt aktiv markiert (kein eigener sechster Eintrag)', await ev(page, "isMoreSectionView('friends') && isMoreSectionView('friends-add') && isMoreSectionView('friends-profile')"))

        # ---------- 2 Reiter ----------
        await goto_view(page, 'friends', 'inbox')
        check('Tablist mit Namen, drei Reiter «Empfangen · Senden · Freunde», Panel verknuepft', await ev(page, "document.querySelector('[role=tablist]').getAttribute('aria-label') !== '' && Array.from(document.querySelectorAll('[role=tab]')).map(t => t.textContent.replace(/\\d+$/, '').trim()).join('|') === 'Empfangen|Senden|Freunde' && document.querySelector('[role=tabpanel]').getAttribute('aria-labelledby') === 'tl-tab-inbox'"))
        await ev(page, "() => document.getElementById('tl-tab-inbox').focus()")
        await page.keyboard.press('ArrowRight'); await page.wait_for_timeout(200)
        check('Pfeil rechts aktiviert «Senden» und setzt den Fokus', await ev(page, "document.activeElement.id === 'tl-tab-send' && document.getElementById('tl-tab-send').getAttribute('aria-selected') === 'true'"))
        await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await page.wait_for_timeout(200)
        check('Pfeil links wickelt auf «Freunde» um', await ev(page, "document.activeElement.id === 'tl-tab-friends'"))
        await goto_view(page, 'friends', 'inbox')
        t = await main_text(page)
        check('Empfangen leer: Standardtext und «Freunde ansehen» wechselt zum Reiter Freunde', 'Noch keine neuen Rezepte. Hier erscheinen Rezepte, die dir Freunde senden.' in t)
        await ev(page, "() => document.querySelector('#tl-panel [data-action=share-tab][data-id=friends]').click()"); await page.wait_for_timeout(300)
        check('«Freunde ansehen» zeigt den Reiter Freunde', await ev(page, "document.getElementById('tl-tab-friends').getAttribute('aria-selected') === 'true' && !!document.querySelector('[data-action=friend-manage]')"))
        check('Zaehler nur aus echten Daten: kein Badge ohne neue Rezepte/Anfragen', await ev(page, "document.querySelectorAll('.tl-tab .tl-badge').length") == 0)

        # ---------- 3 Namenszwecke und PDF-Name ----------
        await goto_view(page, 'friends', 'friends')
        t = await main_text(page)
        check('Freundesbereich: kein «Name im PDF»/«Name beim Teilen», kein Namensfeld des PDF', 'Name im PDF' not in t and 'Name beim Teilen' not in t and not await ev(page, "!!document.getElementById('f-sender-name')"))
        check('senderNameSectionHtml() und state.senderName bleiben fuer den Export bestehen', await ev(page, "typeof senderNameSectionHtml === 'function' && typeof state.senderName === 'string'"))
        await goto_view(page, 'friends-profile')
        check('Profilseite: «Benutzername» und «Sichtbarer Name (freiwillig)» mit Hilfetexten, kein PDF-Name', await ev(page, "document.querySelector('label[for=shareHandle]').textContent === 'Benutzername' && document.querySelector('label[for=shareName]').textContent === 'Sichtbarer Name (freiwillig)'") and '3 bis 24 Zeichen: Kleinbuchstaben, Zahlen und Unterstrich' in await main_text(page) and 'Name im PDF' not in await main_text(page) and not await ev(page, "!!document.getElementById('f-sender-name')"))
        check('Profilfelder sind mit bestehenden Werten gefuellt (keine automatische Aenderung)', await ev(page, "document.getElementById('shareHandle').value") == 'yanis_kocht' and await ev(page, "document.getElementById('shareName').value") == 'Yanis')

        # ---------- 4 Profil: Validierung, Erfolg, Netzwerkfehler, Doppelklick ----------
        sets0 = rpc_count('savora_profile_set')
        await page.fill('#shareHandle', 'Ab'); await ev(page, "() => document.querySelector('[data-action=share-profile-save]').click()"); await page.wait_for_timeout(300)
        check('Zu kurz: Fehlertext aus der echten Regel, kein Serveraufruf', '3 bis 24 Zeichen' in await ev(page, "document.getElementById('shareError').textContent") and rpc_count('savora_profile_set') == sets0)
        await page.fill('#shareHandle', 'ungueltig-name!'); await ev(page, "() => document.querySelector('[data-action=share-profile-save]').click()"); await page.wait_for_timeout(300)
        check('Ungueltige Zeichen werden abgewiesen', 'Kleinbuchstaben' in await ev(page, "document.getElementById('shareError').textContent") and rpc_count('savora_profile_set') == sets0)
        await page.fill('#shareHandle', 'yanis_kocht'); await page.fill('#shareName', 'x' * 41)
        await ev(page, "() => { document.getElementById('shareName').removeAttribute('maxlength'); }"); await page.fill('#shareName', 'x' * 41)
        await ev(page, "() => document.querySelector('[data-action=share-profile-save]').click()"); await page.wait_for_timeout(300)
        check('Sichtbarer Name ueber 40 Zeichen wird abgewiesen', '40 Zeichen' in await ev(page, "document.getElementById('shareError').textContent") and rpc_count('savora_profile_set') == sets0)
        # Netzwerkfehler: Eingaben bleiben, klare Meldung
        await page.fill('#shareHandle', '@Yanis_Kocht2'); await page.fill('#shareName', 'Yanis K.')
        await ctx.set_offline(True)
        await ev(page, "() => document.querySelector('[data-action=share-profile-save]').click()"); await page.wait_for_timeout(700)
        check('Netzwerkfehler: «nicht gespeichert», Eingaben bleiben, Profil unveraendert', 'nicht gespeichert' in await ev(page, "document.getElementById('shareError').textContent") and await ev(page, "document.getElementById('shareHandle').value") == '@Yanis_Kocht2' and await ev(page, "share.profile.handle") == 'yanis_kocht')
        await ctx.set_offline(False)
        # Erfolg + Doppelklick: genau ein Serveraufruf
        sets1 = rpc_count('savora_profile_set')
        await ev(page, "() => { const b = document.querySelector('[data-action=share-profile-save]'); b.click(); b.click(); }"); await page.wait_for_timeout(1200)
        check('Doppelklick auf «Profil speichern» speichert nur einmal', rpc_count('savora_profile_set') == sets1 + 1)
        check('Erfolg: Profil kleingeschrieben uebernommen (@ entfernt), Meldung sichtbar', await ev(page, "share.profile.handle") == 'yanis_kocht2' and M.PROFILES[me]['display_name'] == 'Yanis K.' and 'Profil gespeichert' in await ev(page, "document.body.innerText"))
        check('Einladungscode bleibt beim Aendern des Profils gleich', M.PROFILES[me]['invite_code'] == 'SAV-AB12-CD34')
        await page.fill('#shareHandle', 'berta'); await ev(page, "() => document.querySelector('[data-action=share-profile-save]').click()"); await page.wait_for_timeout(800)
        check('Vergebener Benutzername: Serverfehler wird angezeigt', 'schon vergeben' in await ev(page, "document.getElementById('shareError').textContent"))
        await page.fill('#shareHandle', 'yanis_kocht'); await page.fill('#shareName', 'Yanis')
        await ev(page, "() => document.querySelector('[data-action=share-profile-save]').click()"); await page.wait_for_timeout(800)

        # ---------- 5 Einladungscode nur auf «Freund hinzufuegen» ----------
        for tabname in ['inbox', 'send', 'friends']:
            await goto_view(page, 'friends', tabname)
            check(f'Reiter {tabname}: Einladungscode nicht sichtbar', 'SAV-AB12-CD34' not in await ev(page, "document.body.innerText") and not await ev(page, "!!document.querySelector('.share-code')"))
        await goto_view(page, 'friends-profile')
        check('Profilseite zeigt den Einladungscode nicht', 'SAV-AB12-CD34' not in await ev(page, "document.body.innerText"))
        await goto_view(page, 'friends-add')
        check('«Freund hinzufügen» zeigt Code, Link-Knopf, Eingabe und Warnhinweis', 'SAV-AB12-CD34' in await main_text(page) and await ev(page, "!!document.querySelector('[data-action=share-copy-link]') && !!document.getElementById('shareTarget')") and 'alle bisherigen Links ungültig' in await main_text(page))
        resets0 = rpc_count('savora_invite_reset')
        await ev(page, "() => document.querySelector('[data-action=share-invite-reset]').click()"); await page.wait_for_timeout(400)
        mt = await ev(page, "document.querySelector('.modal-sheet').innerText")
        check('Neuer Code: Warnung mit Folgen und Bestaetigung, noch nichts geschehen', 'funktionieren danach nicht mehr' in mt and 'Bestehende Freunde bleiben verbunden' in mt and rpc_count('savora_invite_reset') == resets0 and M.PROFILES[me]['invite_code'] == 'SAV-AB12-CD34')
        await ev(page, "() => document.querySelector('.modal-sheet [data-action=close-modal]').click()"); await page.wait_for_timeout(500)
        check('Abbrechen laesst den Code unveraendert', not await ev(page, "!!state.modal") and rpc_count('savora_invite_reset') == resets0 and 'SAV-AB12-CD34' in await main_text(page))
        await ev(page, "() => document.querySelector('[data-action=share-invite-reset]').click()"); await page.wait_for_timeout(400)
        await ev(page, "() => document.querySelector('[data-action=share-invite-reset-confirm]').click()"); await page.wait_for_timeout(1200)
        check('Bestaetigt: neuer Code erzeugt und angezeigt', M.PROFILES[me]['invite_code'] != 'SAV-AB12-CD34' and M.PROFILES[me]['invite_code'] in await main_text(page) and rpc_count('savora_invite_reset') == resets0 + 1)
        code_now = M.PROFILES[me]['invite_code']
        check('Keine Einladungscodes in der Konsole', not any('SAV-' in l for l in logs))
        check('Einladungslink behaelt den Parameter ?freund=', await ev(page, "shareInviteLink(share.profile).includes('?freund=SAV-')"))

        # ---------- 6 Senden: ausdruecklich, ein Ablauf fuer beide Einstiege ----------
        await goto_view(page, 'friends', 'send')
        check('Senden: Erklaertext und Schritte', 'Wähle ein Rezept und einen Freund. Dein Original bleibt unverändert.' in await main_text(page))
        sends0 = rpc_count('savora_send')
        await ev(page, "() => document.querySelector('[data-action=share-pick-open]').click()"); await page.wait_for_selector('.tl-pick'); await page.wait_for_timeout(300)
        await ev(page, "() => document.querySelector('.tl-pick').click()"); await page.wait_for_selector('[data-action=share-send]'); await page.wait_for_timeout(300)
        check('Rezept gewaehlt: noch nichts gesendet, kein Empfaenger vorgewaehlt', rpc_count('savora_send') == sends0 and await ev(page, "!document.querySelector('input[name=shareTo]:checked')"))
        await ev(page, "() => document.querySelector('[data-action=share-send]').click()"); await page.wait_for_timeout(300)
        check('Ohne Empfaenger kein Versand, Hinweis sichtbar', rpc_count('savora_send') == sends0 and 'Empfänger' in await ev(page, "document.getElementById('shareError').textContent"))
        await ev(page, "() => document.querySelector('input[name=shareTo][value=berta]').click()"); await page.wait_for_timeout(200)
        check('Empfaenger gewaehlt: weiterhin nichts gesendet', rpc_count('savora_send') == sends0)
        # Fehlerfall: Server lehnt ab
        await ev(page, "() => { window.__n = 0; window.__orig = shareRpc; shareRpc = async (n, a) => { if (n === 'savora_send') { window.__n++; await new Promise(r => setTimeout(r, 500)); throw new Error('Es liegen schon 20 ungeöffnete Rezepte bei diesem Profil.'); } return window.__orig(n, a); }; }")
        await ev(page, "() => { const b = document.querySelector('[data-action=share-send]'); b.click(); b.click(); b.click(); }"); await page.wait_for_timeout(1200)
        check('Dreifachklick: nur ein Sendeversuch', await ev(page, "window.__n") == 1)
        check('Fehler getrennt vom Erfolg: Meldung «Nicht gesendet», Dialog bleibt, Knopf wieder frei', 'Nicht gesendet' in await ev(page, "document.getElementById('shareError').textContent") and await ev(page, "!!state.modal && !document.querySelector('[data-action=share-send]').disabled"))
        # Erfolgsfall
        await ev(page, "() => { shareRpc = async (n, a) => { if (n === 'savora_send') { window.__n++; await new Promise(r => setTimeout(r, 400)); return null; } return window.__orig(n, a); }; }")
        await ev(page, "() => { const b = document.querySelector('[data-action=share-send]'); b.click(); b.click(); }"); await page.wait_for_timeout(1400)
        check('Erfolg: ein weiterer Versuch, Dialog geschlossen, Bestaetigung', await ev(page, "window.__n") == 2 and await ev(page, "!state.modal") and 'gesendet' in await ev(page, "document.body.innerText"))
        await ev(page, "() => { shareRpc = window.__orig; }")
        # Einstieg am Rezept: derselbe Dialog
        await show(page, "() => { state.modal = null; state.activeRecipeId = 'r_legacy_1'; state.view = 'detail'; render(); }", '.detail-main')
        await ev(page, "() => { state.modal = { type: 'detail-menu', recipeId: 'r_legacy_1' }; render(); }"); await page.wait_for_timeout(300)
        await ev(page, "() => document.querySelector('[data-action=share-open-send]').click()"); await page.wait_for_selector('[data-action=share-send]'); await page.wait_for_timeout(300)
        check('Einstieg am Rezept: derselbe Ablauf (Empfaenger waehlen, «Rezept senden»)', await ev(page, "document.querySelector('[data-action=share-send]').textContent") == 'Rezept senden' and await ev(page, "document.querySelectorAll('input[name=shareTo]').length") == 2 and await ev(page, "!document.querySelector('input[name=shareTo]:checked')") and rpc_count('savora_send') == sends0)
        await ev(page, "() => document.querySelector('.modal-sheet [data-action=close-modal]').click()"); await page.wait_for_timeout(500)

        # ---------- 7 Freunde: Verwalten mit Folgen ----------
        await goto_view(page, 'friends', 'friends')
        check('Freunde: echte Namen mit Verwalten-Knopf pro Person', await ev(page, "document.querySelectorAll('[data-action=friend-manage]').length") == 2 and 'Berta' in await main_text(page) and not await ev(page, "!!document.querySelector('.tl-avatars')"))
        await ev(page, "() => document.querySelector('[data-action=friend-manage][data-id=berta]').click()"); await page.wait_for_timeout(300)
        await ev(page, "() => document.querySelector('[data-action=friend-send]').click()"); await page.wait_for_selector('.tl-pick'); await page.wait_for_timeout(300)
        await ev(page, "() => document.querySelector('.tl-pick').click()"); await page.wait_for_selector('[data-action=share-send]'); await page.wait_for_timeout(300)
        check('Senden aus dem Freundeskontext: Person vorgewaehlt, aber erst «Rezept senden» sendet', await ev(page, "document.querySelector('input[name=shareTo]:checked').value") == 'berta' and rpc_count('savora_send') == sends0)
        await ev(page, "() => { state.modal = null; render(); }")

        # ---------- 8 Uebernehmen: Doppelklickschutz ----------
        M.SHARES['s-x'] = {'id': 's-x', 'sender': 'f-berta', 'recipient': me, 'title': 'Doppelklick-Test', 'recipe': {'title': 'Doppelklick-Test', 'servings': 2, 'ingredients': [{'name': 'Salz', 'amount': '1', 'unit': 'TL'}], 'steps': [{'text': 'Mischen.'}]}, 'image': None, 'message': None, 'created_at': M.now_ts()}
        await ev(page, "() => { shareRefresh(); }"); await page.wait_for_timeout(900)
        await goto_view(page, 'friends', 'inbox')
        check('Empfangen zeigt das Rezept mit Absender und Zaehler aus echten Daten', 'Doppelklick-Test' in await main_text(page) and await ev(page, "document.querySelector('#tl-tab-inbox .tl-badge').textContent") == '1')
        await ev(page, "() => document.querySelector('[data-action=share-open-preview]').click()"); await page.wait_for_selector('[data-action=share-accept]'); await page.wait_for_timeout(400)
        t = await main_text(page)
        check('Vorschau: «In meine Rezepte übernehmen» als Hauptaktion, Absender, behalten-Weg, Original unveraendert', 'In meine Rezepte übernehmen' in t and 'Von Berta' in t and await ev(page, "!!document.querySelector('[data-action=share-accept][data-mode=keep]')") and 'Original bleibt unverändert' in t)
        n0 = await ev(page, "state.recipes.length")
        await ev(page, "() => { const b = document.querySelector('[data-action=share-accept]:not([data-mode])'); b.click(); b.click(); }"); await page.wait_for_timeout(1800)
        check('Doppelklick auf «In meine Rezepte übernehmen» legt genau ein Rezept an', await ev(page, "state.recipes.length") == n0 + 1 and await ev(page, "state.recipes.filter(r => r.title === 'Doppelklick-Test').length") == 1)
        check('Uebernommenes Rezept nennt den Absender', await ev(page, "state.recipes.find(r => r.title === 'Doppelklick-Test').sharedBy") == 'berta')

        # ---------- 9 Abgemeldet ----------
        await ev(page, "() => cloudAuthSignOut()"); await page.wait_for_timeout(500)
        await goto_view(page, 'friends')
        t = await main_text(page)
        check('Abgemeldet: Hinweis mit Anmeldung, kein Profilformular, Mehr-Zeile «Nicht angemeldet»', 'Zur Anmeldung' in t and not await ev(page, "!!document.getElementById('shareHandle')") and await ev(page, "friendsSummary()") == 'Nicht angemeldet')

        check('Keine JS-Fehler', not errs, '; '.join(errs[:3]))
        await browser.close()
    print('\nFEHLER:' if FAIL else '\nALLE OK', FAIL if FAIL else '')
    sys.exit(1 if FAIL else 0)
asyncio.run(main())
