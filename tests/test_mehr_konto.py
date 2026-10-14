"""Mehr/Einstellungen, Teilauftrag M2: Mein Konto, Geräteabgleich, Sicherung & Wiederherstellung, Ohne Internet (settings-konto.js).
Läuft gegen den lokalen Supabase-Nachbau (tests/mock_supabase.py), nie gegen echte Konten.

Router: Der Router (views.js, viewFor) gehört dem Teilauftrag M1. Dieser Test lädt settings-konto.js deshalb selbst nach (add_script_tag,
nach cloud.js/app.js, genau wie index.html es später tun muss) und biegt viewFor() für die vier Routen settings-account/-sync/-backup/-offline
auf settingsAccountView() & Co. um. Alles Weitere (Klicks, Aktionen, render()) läuft über den echten Code der App.
Screenshots: SAVORA_M2_SHOTS (Standard /tmp/m2_shots)."""
import asyncio, json, sys, threading, uuid
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
import mock_supabase as M
from http.server import ThreadingHTTPServer
MOCK_PORT = int(_os.environ.get('SAVORA_MOCK_PORT', '8797'))
srv = ThreadingHTTPServer(('127.0.0.1', MOCK_PORT), M.H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
CLOUD = "window.SAVORA_CLOUD_URL_OVERRIDE = 'http://127.0.0.1:%d'" % MOCK_PORT + "; window.SAVORA_CLOUD_KEY_OVERRIDE = 'test-key';"
KONTO_JS = _os.path.join(ROOT, 'settings-konto.js')
SHOTS = _os.environ.get('SAVORA_M2_SHOTS', '/tmp/m2_shots')
_os.makedirs(SHOTS, exist_ok=True)
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

ROUTES = "(() => { const o = window.viewFor; window.viewFor = (v) => ({ 'settings-account': settingsAccountView, 'settings-sync': settingsSyncView, 'settings-backup': settingsBackupView, 'settings-offline': settingsOfflineView })[v] ? ({ 'settings-account': settingsAccountView, 'settings-sync': settingsSyncView, 'settings-backup': settingsBackupView, 'settings-offline': settingsOfflineView })[v]() : o(v); window.friendsProfileView = window.friendsProfileView || (() => '<main>Profil</main>'); })()"

async def device(p, name, motion='reduce', sw=False):
    if sw:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={'width': 390, 'height': 844}, accept_downloads=True)
        await ctx.add_init_script("try{localStorage.setItem('savora-splash-seen','1')}catch(e){}")
    else:
        browser, ctx = await open_ctx(p)
    await ctx.add_init_script(CLOUD)
    page = await ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(f'{name}: {e}'))
    page.on('console', lambda m: errs.append(f'{name} console: {m.text}') if m.type == 'error' and '400 (Bad Request)' not in m.text and '500' not in m.text else None)
    page.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    await goto(page)
    await install(page)
    return browser, ctx, page, errs
async def install(page):
    if not await page.evaluate("typeof settingsAccountView === 'function'"):
        await page.add_script_tag(path=KONTO_JS)
    await page.evaluate(ROUTES)
async def go(page, view, sel='.kd-page'):
    await page.evaluate("(v) => { state.modal = null; state.view = v; render(); }", view)
    await page.wait_for_selector(sel, timeout=8000, state='attached')
    await page.wait_for_timeout(250)
async def click(page, sel, wait=350):
    await page.evaluate("(s) => { const e = document.querySelector(s); if (!e) throw new Error('fehlt ' + s); e.click(); }", sel)
    await page.wait_for_timeout(wait)
async def text(page, sel='main'):
    return await page.evaluate("(s) => (document.querySelector(s) || {}).innerText || ''", sel)
def add_user(email, pw='geheim-123'):
    M.USERS[email] = {'id': str(uuid.uuid4()), 'password': pw, 'confirmed': True}
async def sign_in_via_page(page, email, pw='geheim-123'):
    await go(page, 'settings-account', '#cloudEmail')
    await page.fill('#cloudEmail', email); await page.fill('#cloudPassword', pw)
    await click(page, '[data-action="cloud-sign-in"]')
    await page.wait_for_timeout(1800)

async def main():
    async with async_playwright() as p:
        # ---------- Abgemeldet ----------
        b, ctx, page, errs = await device(p, 'A')
        await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(600)
        await go(page, 'settings-account')
        t = await text(page)
        check('Konto abgemeldet: «Nicht angemeldet», Anmeldeformular, Passwort vergessen', 'Nicht angemeldet' in t and await page.evaluate("!!document.getElementById('cloudEmail') && !!document.getElementById('cloudPassword')") and 'Passwort vergessen' in t, t[:160])
        check('Konto abgemeldet: geschlossene Testphase respektiert (keine Registrierung)', 'geschlossenen Testphase' in t and 'Konto erstellen' not in t)
        check('Konto abgemeldet: keine Passwort-/Löschen-Aktionen', 'Konto löschen' not in t and 'Passwort ändern' not in t)
        await go(page, 'settings-sync')
        t = await text(page)
        check('Abgleich abgemeldet: Zweck, «Zum Abgleichen anmelden», kein «An»', 'Deine Änderungen werden auf deinen angemeldeten Geräten übernommen.' in t and 'Zum Abgleichen anmelden' in t and 'Jetzt abgleichen' not in t, t[:200])
        check('Summary-Texte ehrlich (nie «An»)', await page.evaluate("settingsSyncSummary() === 'Nicht angemeldet' && cloudSettingsSummary() === 'Nicht angemeldet' && settingsAccountSummary() === 'Nicht angemeldet'"))
        # Weg zur Konto-Seite und Rückkehr nach der Anmeldung
        add_user('anna@example.test')
        await click(page, '[data-action="konto-sign-in-for-sync"]')
        check('«Zum Abgleichen anmelden» führt zu Mein Konto', await page.evaluate("state.view") == 'settings-account' and await page.evaluate("!!document.getElementById('cloudEmail')"))
        await page.fill('#cloudEmail', 'anna@example.test'); await page.fill('#cloudPassword', 'falsch')
        await click(page, '[data-action="cloud-sign-in"]', 900)
        err = await text(page, '#cloudError')
        check('Anmeldung mit falschem Passwort: Fehlertext, keine Rückkehr', 'stimmt nicht' in err and await page.evaluate("state.view") == 'settings-account', err)
        await page.fill('#cloudPassword', 'geheim-123')
        await click(page, '[data-action="cloud-sign-in"]', 2200)
        check('Nach der Anmeldung zurück zum Geräteabgleich', await page.evaluate("state.view") == 'settings-sync', await page.evaluate("state.view"))
        await page.screenshot(path=_os.path.join(SHOTS, 'abgleich-angemeldet-390.png'))

        # ---------- Geräteabgleich: Status aus echter Antwort ----------
        st = await text(page, '#kontoSyncLive')
        check('Abgleich: «Zuletzt abgeglichen: heute, HH:MM» nach echter Antwort', 'Zuletzt abgeglichen: heute,' in st, st)
        # Login allein heisst nicht «aktuell»: ohne Zeitstempel der letzten erfolgreichen Runde
        await page.evaluate("() => { localStorage.removeItem('savora-sync-last'); cloud.lastError = null; render(); }"); await page.wait_for_timeout(300)
        st = await text(page, '#kontoSyncLive')
        check('Abgleich: angemeldet ohne erfolgreiche Runde zeigt «Noch nicht abgeglichen» (nicht «aktuell»)', 'Noch nicht abgeglichen' in st and 'Zuletzt abgeglichen' not in st, st)
        # laufender Abgleich
        await page.evaluate("() => { window.__origFetch = window.fetch; window.fetch = (u, o) => new Promise(r => setTimeout(() => r(window.__origFetch(u, o)), 1200)); window.__p = cloudSyncNow(); }")
        await page.wait_for_timeout(300)
        st = await text(page, '#kontoSyncLive')
        busy = await page.evaluate("document.querySelector('#kontoSyncActions button').disabled")
        check('Abgleich läuft: «Wird abgeglichen …», Knopf gesperrt', 'Wird abgeglichen …' in st and busy, st)
        await page.evaluate("() => window.__p"); await page.wait_for_timeout(300)
        st = await text(page, '#kontoSyncLive')
        check('Abgleich fertig: Statuszeile live aktualisiert (ohne Neuladen)', 'Zuletzt abgeglichen: heute,' in st, st)
        # Fehler vom Server -> «Abgleich fehlgeschlagen» + «Erneut versuchen»
        await page.evaluate("""() => { window.fetch = (u, o) => String(u).includes('/rest/v1/savora_records') ? Promise.resolve(new Response(JSON.stringify({ message: 'kaputt' }), { status: 500, headers: { 'Content-Type': 'application/json' } })) : window.__origFetch(u, o); cloudScheduleSync = () => {}; }""")
        await page.evaluate("() => { const s = cloudQueue(); s['recipe|x'] = { kind: 'recipe', id: 'x', deleted: false, at: Date.now() }; writeJsonKey(CLOUD_QUEUE_KEY, s); cloudSyncNow().then(() => render()); }")
        await page.wait_for_timeout(1200)
        st = await text(page, '#kontoSyncLive')
        btn = await text(page, '#kontoSyncActions')
        check('Abgleichfehler: «Abgleich fehlgeschlagen» mit Meldung und «Erneut versuchen»', 'Abgleich fehlgeschlagen' in st and 'Erneut versuchen' in btn, st + ' | ' + btn)
        check('Abgleichfehler: ausstehende Änderungen werden genannt', 'warten auf die Übertragung' in st, st)
        await page.evaluate("() => { window.fetch = window.__origFetch; const s = cloudQueue(); delete s['recipe|x']; writeJsonKey(CLOUD_QUEUE_KEY, s); }")
        await click(page, '#kontoSyncActions button', 1800)
        st = await text(page, '#kontoSyncLive')
        check('Wiederholung nach Fehler: Status wieder «Zuletzt abgeglichen»', 'Zuletzt abgeglichen: heute,' in st and 'fehlgeschlagen' not in st, st)
        # Offline
        await ctx.set_offline(True); await page.wait_for_timeout(500)
        await page.evaluate("render()"); await page.wait_for_timeout(300)
        st = await text(page, '#kontoSyncLive')
        dis = await page.evaluate("document.querySelector('#kontoSyncActions button').disabled")
        check('Abgleich offline: sachlicher Hinweis, spätere Übertragung nur weil umgesetzt (online-Ereignis)', st.startswith('Offline') and 'Keine Internetverbindung' in st and 'sobald wieder eine Verbindung besteht' in st and dis, st[:200])
        await page.screenshot(path=_os.path.join(SHOTS, 'abgleich-offline-390.png'))
        await ctx.set_offline(False); await page.wait_for_timeout(800)
        # «Was wird abgeglichen?»
        await page.evaluate("document.querySelector('.kd-details').open = true")
        t = await text(page)
        check('«Was wird abgeglichen?» nennt Abgeglichenes, Nur-dieses-Gerät, Löschen und keine Backup-Garantie',
              'Rezepte mit ihren Fotos' in t and 'Gilt nur auf diesem Gerät' in t and 'verschwindet es auf allen angemeldeten Geräten' in t and 'keine Sicherung' in t and 'Darstellung' in t)

        # ---------- Mein Konto angemeldet ----------
        await go(page, 'settings-account')
        t = await text(page)
        check('Konto angemeldet: «Angemeldet» mit E-Mail', 'Angemeldet' in t and 'anna@example.test' in t)
        check('Konto angemeldet: Verweis «Öffentliches Profil bearbeiten» (Route friends-profile), als freiwillig bezeichnet',
              await page.evaluate("!!document.querySelector('[data-action=goto-view][data-view=friends-profile]')") and 'Öffentliches Profil bearbeiten' in t and 'Freiwillig' in t)
        check('Konto angemeldet: Löschen ist nachgeordnet (letzter Abschnitt) und Passwortfelder stehen nicht auf der Seite',
              await page.evaluate("document.querySelectorAll('.kd-sec')[document.querySelectorAll('.kd-sec').length - 1].classList.contains('kd-sec--danger') && !document.querySelector('input[type=password]')"))
        check('Konto angemeldet: «Abmelden» erklärt den Umgang mit lokalen Daten', 'bleiben auf diesem Gerät' in t and 'zusammengeführt' in t)
        await page.screenshot(path=_os.path.join(SHOTS, 'konto-angemeldet-390.png'), full_page=True)

        # Passwort ändern
        await click(page, '[data-action="konto-pw-open"]', 500)
        check('Passwort ändern öffnet einen Dialog mit beschrifteten Feldern', await page.evaluate("!!document.querySelector('.modal-sheet[role=dialog] label[for=kontoPw1]') && !!document.querySelector('label[for=kontoPw2]')"))
        await page.fill('#kontoPw1', 'kurz'); await page.fill('#kontoPw2', 'kurz')
        await click(page, '[data-action="konto-pw-save"]')
        check('Passwort zu kurz: Fehlermeldung, Dialog bleibt', '8 Zeichen' in await text(page, '#kontoPwError') and await page.evaluate("!!document.getElementById('kontoPw1')"))
        await page.fill('#kontoPw1', 'neues-pass-1'); await page.fill('#kontoPw2', 'anders-pass-2')
        await click(page, '[data-action="konto-pw-save"]')
        check('Passwörter ungleich: Fehlermeldung', 'stimmen nicht überein' in await text(page, '#kontoPwError'))
        await page.evaluate("() => { window.__f = window.fetch; window.fetch = () => Promise.reject(new Error('x')); }")
        await page.fill('#kontoPw2', 'neues-pass-1')
        await click(page, '[data-action="konto-pw-save"]', 600)
        check('Passwort ändern ohne Verbindung: Fehler sichtbar, Dialog bleibt, Passwort unverändert', 'Internet' in await text(page, '#kontoPwError') and M.USERS['anna@example.test']['password'] == 'geheim-123', await text(page, '#kontoPwError'))
        await page.evaluate("() => { window.fetch = window.__f; }")
        await click(page, '[data-action="konto-pw-save"]', 1000)
        gone = await page.evaluate("!document.getElementById('kontoPw1')")
        check('Passwort ändern: Erfolg, Dialog zu, Passwort beim Server geändert', gone and M.USERS['anna@example.test']['password'] == 'neues-pass-1', str(M.USERS['anna@example.test']['password']))
        check('Passwort ändern: Erfolgsmeldung', 'Passwort geändert' in await text(page, '.toast'), await text(page, '.toast'))

        # Konto löschen: nur mit Bestätigung, Abbrechen ändert nichts
        await click(page, '[data-action="konto-delete-open"]', 500)
        t = await text(page, '.modal-sheet')
        check('Konto löschen: Dialog nennt Folgen und verlangt LÖSCHEN, Knopf zunächst gesperrt', 'nicht rückgängig' in t and 'Rezepte und Daten auf diesem Gerät bleiben erhalten' in t and await page.evaluate("document.getElementById('kontoDelBtn').disabled"), t[:120])
        await page.fill('#kontoDelConfirm', 'nein')
        check('Konto löschen: falsche Eingabe lässt den Knopf gesperrt', await page.evaluate("document.getElementById('kontoDelBtn').disabled"))
        await page.screenshot(path=_os.path.join(SHOTS, 'konto-loeschen-dialog-390.png'))
        await click(page, '.modal-sheet [data-action="close-modal"]', 600)
        check('Konto löschen abgebrochen: Konto besteht weiter', 'anna@example.test' in M.USERS and await page.evaluate("cloudSignedIn()"))
        await click(page, '[data-action="konto-delete-open"]', 500)
        await page.fill('#kontoDelConfirm', 'löschen')
        check('Konto löschen: Knopf wird mit LÖSCHEN frei', not await page.evaluate("document.getElementById('kontoDelBtn').disabled"))
        await click(page, '#kontoDelBtn', 1500)
        check('Konto gelöscht (Nachbau): Konto weg, abgemeldet, lokale Rezepte bleiben', 'anna@example.test' not in M.USERS and not await page.evaluate("cloudSignedIn()") and await page.evaluate("state.recipes.length") == 3, str(await page.evaluate("state.recipes.length")))
        await page.wait_for_timeout(400)
        check('Nach dem Löschen zeigt Mein Konto «Nicht angemeldet»', 'Nicht angemeldet' in await text(page))

        # Abmelden: Daten bleiben
        add_user('ben@example.test')
        await sign_in_via_page(page, 'ben@example.test')
        n = await page.evaluate("state.recipes.length")
        await go(page, 'settings-account')
        await click(page, '[data-action="cloud-sign-out"]', 900)
        check('Abmelden: Seite zeigt «Nicht angemeldet», Rezepte bleiben auf dem Gerät', 'Nicht angemeldet' in await text(page) and await page.evaluate("state.recipes.length") == n and n == 3, str(n))

        # ---------- Sicherung ----------
        await go(page, 'settings-backup')
        t = await text(page)
        check('Sicherung: Zweck, beide Aktionen, «Noch keine Sicherung heruntergeladen»', 'Lade eine Kopie deiner Daten als Datei herunter.' in t and 'Sicherung herunterladen' in t and 'Sicherung importieren' in t and 'Noch keine Sicherung heruntergeladen' in t, t[:160])
        check('Sicherung: Unterschied Abgleich/Sicherungsdatei erklärt, keine pauschale Zusage, kein PDF-Backup',
              'Abgleich oder Sicherung?' in t and 'bewahrt einen bestimmten Stand' in t and 'musst keine Sicherung' not in t and 'PDF-Dateien' in t and 'lassen sich nicht importieren' in t)
        check('Sicherung: Satz «Die Datei ergänzt deine Daten…» wird nicht pauschal benutzt', 'Vorhandene Einträge bleiben erhalten' not in t and 'ersetzen die vorhandenen' in t)
        # Export schlägt fehl -> Zeitstempel bleibt unberührt
        await page.evaluate("() => { window.__o = window.dbGetAllCustomFoods; window.dbGetAllCustomFoods = () => Promise.reject(new Error('kaputt')); }")
        await click(page, '[data-action="export-backup"]', 700)
        key = await page.evaluate("localStorage.getItem(LAST_BACKUP_KEY)")
        check('Export fehlgeschlagen: kein Zeitstempel, Fehlermeldung, Status unverändert', key is None and 'Noch keine Sicherung heruntergeladen' in await text(page, '#kontoBackupStatus') and 'nicht erstellt' in await text(page, '.toast'), str(key))
        await page.evaluate("() => { window.dbGetAllCustomFoods = window.__o; }")
        async with page.expect_download() as dl:
            await click(page, '[data-action="export-backup"]', 300)
        d = await dl.value
        path = _os.path.join(OUT, 'm2-sicherung.json'); await d.save_as(path)
        data = json.load(open(path))
        key = await page.evaluate("localStorage.getItem(LAST_BACKUP_KEY)")
        check('Export erfolgreich: Datei gültig (3 Rezepte), Zeitstempel gesetzt, Status zeigt «Letzte heruntergeladene Sicherung: heute, …»',
              data.get('app') == 'savora' and len(data['recipes']) == 3 and key and 'Letzte heruntergeladene Sicherung: heute,' in await text(page, '#kontoBackupStatus'), await text(page, '#kontoBackupStatus'))
        await page.screenshot(path=_os.path.join(SHOTS, 'sicherung-390.png'), full_page=True)

        # Import: defekt, fremde App, PDF
        async def pick(name, content, mime='application/json'):
            await page.set_input_files('#kontoRestoreInput', files=[{'name': name, 'mimeType': mime, 'buffer': content if isinstance(content, bytes) else content.encode()}])
            await page.wait_for_selector('#kontoImportPanel .kd-panel', timeout=5000)
            await page.wait_for_timeout(200)
        before = await page.evaluate("[state.recipes.length, state.shopping.length]")
        await pick('kaputt.json', '{"app": "savora", "recipes": [')
        t = await text(page, '#kontoImportPanel')
        check('Import defekte Datei: verständlicher Fehler, nichts verändert, kein Importknopf', 'beschädigt' in t and 'Es wurde nichts verändert' in t and 'Jetzt importieren' not in t, t[:160])
        await pick('fremd.json', json.dumps({'app': 'andere-app', 'recipes': []}))
        t = await text(page, '#kontoImportPanel')
        check('Import fremde/inkompatible Datei (app passt nicht): abgelehnt', 'stammt nicht aus Savora' in t and 'Jetzt importieren' not in t, t[:160])
        await pick('version.json', json.dumps({'app': 'savora', 'version': 'abc', 'recipes': []}))
        t = await text(page, '#kontoImportPanel')
        check('Import mit ungültiger Versionsangabe: abgelehnt', 'Versionsangabe' in t and 'Jetzt importieren' not in t, t[:160])
        await pick('rezepte.pdf', b'%PDF-1.4\n%binary', 'application/pdf')
        t = await text(page, '#kontoImportPanel')
        check('Import einer PDF-Datei: abgelehnt, nichts verändert', 'Jetzt importieren' not in t and 'nichts verändert' in t)
        check('Datei-Auswahl nimmt nur JSON an', 'json' in (await page.evaluate("document.getElementById('kontoRestoreInput').accept")))
        check('Nach den Fehlversuchen sind die Daten unverändert', await page.evaluate("[state.recipes.length, state.shopping.length]") == before)
        # Import gültig: Bestätigung mit verlässlichem Umfang, Abbruch, dann Import
        data['recipes'].append(await page.evaluate("() => { const r = emptyRecipe(); r.id = 'r_neu_1'; r.title = 'Neu aus Datei'; r.ingredients = [{amount:'1', unit:'', name:'Apfel'}]; r.steps = [{text:'Essen.'}]; return r; }"))
        data['recipes'].append({'id': 'r_kaputt', 'title': 12345, 'ingredients': 'nein'})
        content = json.dumps(data)
        await pick('savora-sicherung-test.json', content)
        t = await text(page, '#kontoImportPanel')
        check('Import gültig: Bestätigung nennt Umfang (4 lesbare Rezepte) und Hinweis auf 1 unlesbaren Eintrag', 'Datei prüfen' in t and 'Rezepte\n4' in t.replace('\n\n', '\n') and '1 Eintrag ist nicht lesbar' in t and 'savora-sicherung-test.json' in t, t[:300])
        check('Import gültig: keine erfundenen Duplikatzahlen vorab', 'zeigt das Ergebnis nach dem Import' in t and 'doppelt' in t)
        check('Import gültig: vor der Bestätigung unverändert', await page.evaluate("[state.recipes.length, state.shopping.length]") == before)
        await page.screenshot(path=_os.path.join(SHOTS, 'sicherung-import-bestaetigung-390.png'), full_page=True)
        await click(page, '[data-action="konto-import-cancel"]')
        check('Import abgebrochen: Panel weg, Daten unverändert', await page.evaluate("[state.recipes.length, state.shopping.length]") == before and not await page.evaluate("!!document.querySelector('#kontoImportPanel .kd-panel')"))
        await pick('savora-sicherung-test.json', content)
        await click(page, '[data-action="konto-import-go"]', 1500)
        after = await page.evaluate("[state.recipes.length, state.shopping.length]")
        rep = await text(page, '#backupStatus')
        check('Import: genau das neue Rezept kommt dazu, Duplikate werden nicht doppelt angelegt, Ergebnis wird gemeldet', after[0] == 4 and 'schon vorhanden' in rep and 'unlesbar' in rep, f'{after} {rep[:200]}')
        check('Import: vorhandene Rezepte unverändert erhalten', await page.evaluate("state.recipes.filter(r => ['r_legacy_1','r_legacy_2','r_legacy_3'].includes(r.id)).length") == 3)
        await pick('savora-sicherung-test.json', content)
        await click(page, '[data-action="konto-import-go"]', 1500)
        check('Zweiter Import derselben Datei: keine Doppelungen', await page.evaluate("state.recipes.length") == 4)
        check('Keine Seitenfehler bis hierher', not errs, str(errs[:3]))
        await b.close()

        # ---------- Ohne Internet: Zustände mit nachgebautem Service-Worker-Antworten ----------
        b, ctx, page, errs2 = await device(p, 'O')
        await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(500)
        MOCK_OFF = """(a) => { const [missing, ready, delay] = a; window.__prog = []; window.offlineAsk = (type, onMsg) => new Promise((res, rej) => { const run = () => { if (type === 'PREPARE_OFFLINE') { onMsg && onMsg({ type: 'progress', done: 1, total: 3 }); } setTimeout(() => res({ type: 'done', ready, total: 60, cached: 60 - missing.length, missing }), delay || 20); }; run(); }); kd.offline.phase = 'idle'; kd.offline.at = 0; }"""
        await page.evaluate(MOCK_OFF, [[], True, 20])
        await go(page, 'settings-offline'); await page.wait_for_timeout(500)
        t = await text(page)
        check('Offline: «Offline bereit» mit Liste App/Schriften/Cover/PDF-Vorschau/Nährwertdaten/Rezeptfotos', 'Offline bereit' in t and all(x in t for x in ['App', 'Rezeptfotos', 'Cover', 'PDF-Vorschau', 'Nährwertdaten', 'Schriften']) and 'Offline-Inhalte laden' not in t, t[:300])
        miss = ['./assets/covers/01-pop.png', './assets/covers/02-lieblingsbuch.png', './swiss-fcd-data.json']
        await page.evaluate(MOCK_OFF, [miss, False, 20]); await go(page, 'settings-offline'); await page.wait_for_timeout(500)
        t = await text(page)
        check('Offline teilweise: «Teilweise verfügbar», Cover «2 Dateien fehlen», Nährwertdaten «1 Datei fehlt», Aktion sichtbar', 'Teilweise verfügbar' in t and '2 Dateien fehlen' in t and '1 Datei fehlt' in t and 'Offline-Inhalte laden' in t, t[:300])
        check('Offline: technische Cache-Namen erscheinen nie', 'savora-shell' not in t and 'savora-data' not in t and 'CACHE' not in t.upper().replace('CACHEN', ''))
        await page.screenshot(path=_os.path.join(SHOTS, 'offline-teilweise-390.png'), full_page=True)
        # Fortschritt
        await page.evaluate("""() => { window.offlineAsk = (type, onMsg) => new Promise((res) => { onMsg({ type: 'progress', done: 1, total: 3 }); window.__finish = () => res({ type: 'done', ready: true, total: 60, cached: 60, missing: [] }); }); }""")
        await click(page, '[data-action="konto-offline-prepare"]', 300)
        t = await text(page, '#kontoOfflineBox')
        prog = await page.evaluate("(() => { const p = document.querySelector('.kd-progress progress'); return p ? [p.value, p.max] : null; })()")
        check('Offline laden: «Inhalte werden geladen …» mit Fortschritt 1 von 3', 'Inhalte werden geladen …' in t and '1 von 3' in t and prog == [1, 3], f'{t[:100]} {prog}')
        await page.evaluate("window.__finish()"); await page.wait_for_timeout(300)
        check('Offline laden fertig: «Offline bereit»', 'Offline bereit' in await text(page, '#kontoOfflineBox'))
        # Fehler + Wiederholung
        await page.evaluate("""() => { kd.offline.phase = 'partial'; kd.offline.missing = ['./swiss-fcd-data.json']; window.offlineAsk = () => Promise.reject(new Error('timeout')); render(); }""")
        await page.wait_for_timeout(300)
        await click(page, '[data-action="konto-offline-prepare"]', 400)
        t = await text(page, '#kontoOfflineBox')
        check('Offline laden fehlgeschlagen: sachlicher Fehler mit Wiederholungsmöglichkeit', 'konnten nicht geladen werden' in t and 'versuche es erneut' in t and await page.evaluate("!!document.querySelector('[data-action=konto-offline-prepare]:not([disabled])')"), t[:200])
        # Wiederholung klappt
        await page.evaluate("""() => { window.offlineAsk = () => Promise.resolve({ type: 'done', ready: true, total: 60, cached: 60, missing: [] }); }""")
        await click(page, '[data-action="konto-offline-prepare"]', 500)
        check('Wiederholung nach Fehler: «Offline bereit»', 'Offline bereit' in await text(page, '#kontoOfflineBox'))
        # Laden mit unvollständigem Ergebnis
        await page.evaluate("""() => { kd.offline.phase = 'partial'; kd.offline.missing = ['./swiss-fcd-data.json']; window.offlineAsk = () => Promise.resolve({ type: 'done', ready: false, total: 60, cached: 59, missing: ['./swiss-fcd-data.json'] }); render(); }""")
        await page.wait_for_timeout(300)
        await click(page, '[data-action="konto-offline-prepare"]', 500)
        t = await text(page, '#kontoOfflineBox')
        check('Laden unvollständig: bleibt «Teilweise verfügbar» mit Hinweis', 'Teilweise verfügbar' in t and 'Einige Inhalte konnten nicht geladen werden' in t, t[:200])
        # Keine Verbindung
        await ctx.set_offline(True); await page.wait_for_timeout(400)
        await page.evaluate("render()"); await page.wait_for_timeout(300)
        t = await text(page, '#kontoOfflineBox')
        dis = await page.evaluate("document.querySelector('[data-action=konto-offline-prepare]').disabled")
        check('Ohne Verbindung: Hinweis und gesperrte Aktion', 'Keine Internetverbindung' in t and dis, t[:200])
        await ctx.set_offline(False)
        # nicht bereit (Service Worker steuert noch nicht)
        await page.evaluate("""() => { window.offlineAsk = () => Promise.reject(new Error('no-controller')); kd.offline.phase = 'idle'; kd.offline.at = 0; render(); }"""); await page.wait_for_timeout(500)
        t = await text(page, '#kontoOfflineBox')
        check('Service Worker noch nicht aktiv: «Noch nicht geprüft» mit Hinweis, keine Behauptung «bereit»', 'Noch nicht geprüft' in t and 'Offline bereit' not in t, t[:200])
        # Speicherwarnung nur bei echtem Bedarf
        await page.evaluate("""() => { kd.offline.phase = 'partial'; kd.offline.missing = ['./swiss-fcd-data.json']; kd.offline.storage = 500; render(); }"""); await page.wait_for_timeout(200)
        no_warn = 'Speicher frei' not in await text(page, '#kontoOfflineBox')
        await page.evaluate("""() => { kd.offline.storage = 12; render(); }"""); await page.wait_for_timeout(200)
        warn = 'nur noch rund 12 MB Speicher frei' in await text(page, '#kontoOfflineBox')
        check('Speicherwarnung nur bei knappem Speicher', no_warn and warn)
        # Rezeptfotos aus dem echten Speicher: ein Foto ohne Bilddatei
        await page.evaluate("""async () => { kd.offline.photos = await kdOfflinePhotos(); kd.offline.phase = 'partial'; kd.offline.missing = []; kd.offline.at = Date.now(); render(); }""")
        await page.wait_for_timeout(300)
        t = await text(page, '#kontoOfflineBox')
        check('Rezeptfotos: echte Prüfung (Seed hat 1 Foto im Speicher)', 'Alle 1 auf diesem Gerät' in t, t[:300])
        await page.evaluate("""async () => { await dbPutImage({ id: 'img_missing_test', blob: new Blob(['x']), thumbBlob: new Blob(['x']), mime: 'image/jpeg' }); const r = state.recipes[1]; r.imageId = 'img_missing_test'; state.recipes[1] = r; await dbDeleteImage('img_missing_test'); kd.offline.photos = await kdOfflinePhotos(); render(); }""")
        await page.wait_for_timeout(300)
        t = await text(page, '#kontoOfflineBox')
        check('Rezeptfotos: fehlendes Foto wird gemeldet', '1 von 2 fehlen noch auf diesem Gerät' in t, t[:300])
        check('Keine Seitenfehler (Offline-Zustände)', not errs2, str(errs2[:3]))
        await b.close()

        # ---------- Ohne Internet mit echtem Service Worker ----------
        b, ctx, page, errs3 = await device(p, 'S', sw=True)
        await page.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.ready.then(() => true)", timeout=20000)
        await page.reload(); await page.wait_for_function("!!navigator.serviceWorker.controller", timeout=20000)
        await page.wait_for_selector('#app > *'); await install(page)
        await go(page, 'settings-offline'); await page.wait_for_function("document.querySelector('#kontoOfflineBox .kd-status-title') && !/Wird geprüft/.test(document.querySelector('#kontoOfflineBox .kd-status-title').textContent)", timeout=15000)
        t = await text(page, '#kontoOfflineBox')
        check('Echter Service Worker: Stand wird aus den Caches abgeleitet (nicht allein aus «Worker installiert»): Teilweise verfügbar vor dem Laden', 'Teilweise verfügbar' in t and 'Cover' in t and 'Offline-Inhalte laden' in t, t[:300])
        await click(page, '[data-action="konto-offline-prepare"]', 300)
        await page.wait_for_function("(document.querySelector('#kontoOfflineBox .kd-status-title') || {}).textContent === 'Offline bereit'", timeout=60000)
        t = await text(page, '#kontoOfflineBox')
        check('Echter Service Worker: nach «Offline-Inhalte laden» → «Offline bereit», alle Zeilen «Bereit»', 'Offline bereit' in t and 'fehlt' not in t.lower() and t.count('Bereit') >= 5, t[:300])
        await page.screenshot(path=_os.path.join(SHOTS, 'offline-bereit-390.png'), full_page=True)
        check('Keine Seitenfehler (echter Service Worker)', not errs3, str(errs3[:3]))
        await b.close()

        # ---------- Darstellung: Breiten, Hell/Dunkel, Touchflächen, Beschriftungen ----------
        b, ctx, page, errs4 = await device(p, 'L')
        await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(500)
        add_user('cara@example.test')
        await page.evaluate("friendsProfileView = () => ''")
        await page.evaluate("""() => { window.offlineAsk = () => Promise.resolve({ type: 'done', ready: false, total: 60, cached: 58, missing: ['./swiss-fcd-data.json', './assets/covers/01-pop.png'] }); }""")
        views = ['settings-account', 'settings-sync', 'settings-backup', 'settings-offline']
        for signed in (False, True):
            if signed: await sign_in_via_page(page, 'cara@example.test')
            for theme in ('light', 'dark'):
                for w in (320, 390, 768, 1440):
                    await page.set_viewport_size({'width': w, 'height': 900})
                    await page.evaluate("(t) => { document.documentElement.setAttribute('data-theme', t); }", theme)
                    for v in views:
                        await go(page, v); await page.wait_for_timeout(120)
                        if v == 'settings-backup': await page.evaluate("kd.imp = { file: { name: 'savora-sicherung-2026-10-14.json' }, summary: { exportedAt: new Date().toISOString(), rows: [{ label: 'Rezepte', value: 12 }, { label: 'Einkaufsliste', value: '4 Einträge' }], warnings: ['1 Eintrag ist nicht lesbar und wird übersprungen. Alles andere wird übernommen.'] } }; kdRefreshImport()")
                        if v == 'settings-offline': await page.wait_for_timeout(300)
                        info = await page.evaluate("""() => {
                          const W = document.documentElement.clientWidth;
                          const over = [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > W + 0.5 || r.left < -0.5); }).map(e => e.tagName + '.' + e.className).slice(0, 3);
                          const small = [...document.querySelectorAll('main button, main summary, main input:not(.kd-file-input), main select')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height < 43.5 && !e.classList.contains('kd-inline-link'); }).map(e => (e.dataset.action || e.tagName) + ':' + Math.round(e.getBoundingClientRect().height)).slice(0, 4);
                          const unl = [...document.querySelectorAll('main input')].filter(e => !e.classList.contains('kd-file-input') && !(e.id && document.querySelector('label[for="' + e.id + '"]'))).map(e => e.id).slice(0, 3);
                          const h1 = document.querySelectorAll('h1').length;
                          const noname = [...document.querySelectorAll('main button')].filter(e => !(e.innerText || e.getAttribute('aria-label') || '').trim()).length;
                          return { over, small, unl, h1, noname };
                        }""")
                        ok = not info['over'] and not info['small'] and not info['unl'] and info['h1'] == 1 and not info['noname']
                        if not ok or (w in (320, 1440) and theme == 'dark') or (w == 390 and theme == 'light' and signed):
                            if not ok: print('   ', signed, theme, w, v, info)
                        check(f'{"angemeldet" if signed else "abgemeldet"} {theme} {w}px {v}: kein Überlauf, Tippflächen >= 44px, Labels, ein h1', ok, str(info) if not ok else '')
                        if (w, theme) in ((320, 'light'), (1440, 'dark'), (768, 'light')) and signed:
                            await page.screenshot(path=_os.path.join(SHOTS, f'{v}-{w}-{theme}.png'), full_page=True)
        # Fokus sichtbar per Tastatur
        await page.set_viewport_size({'width': 390, 'height': 900})
        await go(page, 'settings-sync')
        await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab')
        out = await page.evaluate("(() => { const e = document.activeElement; const s = getComputedStyle(e); return [e.tagName, s.outlineStyle, s.outlineWidth]; })()")
        check('Tastatur: fokussiertes Element hat sichtbaren Fokusring', out[1] != 'none' and out[2] != '0px', str(out))
        check('Keine Seitenfehler (Darstellung)', not errs4, str(errs4[:3]))
        await b.close()
    print('\nFEHLER:', FAIL or 'keine')
    sys.exit(1 if FAIL else 0)
asyncio.run(main())
