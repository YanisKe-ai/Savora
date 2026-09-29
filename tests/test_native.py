"""Simuliert die native iOS-App (Capacitor) mit Attrappen fuer die Plugins und prueft, dass
Savora sie richtig benutzt: Service Worker aus, PDF/Sicherung/Einkauf ueber das Teilen-Fenster,
Bildschirm wach im Kochmodus, Timer-Benachrichtigung. Echte Geraetetests bleiben Handarbeit (siehe ARBEITSABLAUF.md)."""
import asyncio, sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

MOCK = """
window.__calls = []; window.__swRegister = 0;
const rec = (n, ret) => (a) => { window.__calls.push([n, a]); return Promise.resolve(ret); };
window.Capacitor = { isNativePlatform: () => true, Plugins: {
  Filesystem: { writeFile: rec('fs.write', { uri: 'file:///cache/test' }) },
  Share: { share: rec('share', {}) },
  KeepAwake: { keepAwake: rec('keepAwake'), allowSleep: rec('allowSleep') },
  LocalNotifications: { checkPermissions: rec('perm.check', { display: 'granted' }), requestPermissions: rec('perm.req', { display: 'granted' }),
                        schedule: rec('notif.schedule'), cancel: rec('notif.cancel') },
} };
Object.defineProperty(navigator, 'serviceWorker', { value: { register: () => { window.__swRegister++; return Promise.reject(new Error('x')); }, addEventListener: () => {}, controller: null } });
try { localStorage.setItem('savora-splash-seen', '1') } catch (e) {}
"""
async def click(page, sel):
    await page.evaluate("(s) => { const e = document.querySelector(s); if (!e) throw new Error('fehlt: ' + s); e.click(); }", sel)
    await page.wait_for_timeout(250)
async def calls(page, name=None):
    c = await page.evaluate("window.__calls")
    return [x for x in c if name is None or x[0] == name]

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={"width": 390, "height": 844}, reduced_motion='reduce', timezone_id='UTC', accept_downloads=True)
        await ctx.add_init_script(MOCK)
        page = await ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        await goto(page)
        await page.evaluate(open(SEED_PATH).read())
        await page.wait_for_timeout(300)

        check('Native Umgebung erkannt', await page.evaluate("SavoraNative.isNative") is True)
        check('Service Worker wird in der nativen App nicht registriert', await page.evaluate("window.__swRegister") == 0)

        # PDF: "Herunterladen" wird zum Teilen-Fenster (Datei in Cache geschrieben, dann Share)
        await page.evaluate("triggerPdfDownload(new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), 'Sloppy Joe.pdf')")
        await page.wait_for_timeout(400)
        w, s = await calls(page, 'fs.write'), await calls(page, 'share')
        check('PDF speichern/teilen ueber Filesystem + Share', len(w) == 1 and w[0][1]['directory'] == 'CACHE' and len(w[0][1]['data']) > 0 and len(s) == 1 and s[0][1]['url'] == 'file:///cache/test', str([w and w[0][1]['path'], s and s[0][1].get('url')]))

        # Sicherung
        await page.evaluate("downloadBackup()")
        await page.wait_for_timeout(500)
        w = await calls(page, 'fs.write')
        check('Sicherung ueber Teilen-Fenster, Dateiname .json', len(w) == 2 and w[1][1]['path'].startswith('savora-sicherung-') and w[1][1]['path'].endswith('.json'))
        check('Sicherungsdatum gesetzt', await page.evaluate("!!localStorage.getItem(LAST_BACKUP_KEY)"))

        # Kochmodus: Bildschirm bleibt an, Timer meldet sich auch bei gesperrtem Telefon
        await show(page, "() => { state.activeRecipeId = 'r_legacy_1'; state.view = 'detail'; render(); }", '.detail-main')
        await click(page, '[data-action="start-cook"]')
        await page.wait_for_selector('.cook-v2')
        check('Kochmodus: KeepAwake aktiv', len(await calls(page, 'keepAwake')) >= 1 and await page.evaluate("!!state.wakeLock"))
        await click(page, '[data-action="cook-next"]')
        await click(page, '.timer-chip')
        await page.wait_for_timeout(400)
        sc = await calls(page, 'notif.schedule')
        ok = len(sc) == 1
        if ok:
            n = sc[0][1]['notifications'][0]
            ok = n['schedule']['at'] and n['title'] == 'Timer fertig' and 'Sloppy Joe Buns' in n['body']
        check('Timer plant lokale Benachrichtigung mit Rezeptname', ok, str(sc[:1]))
        await click(page, '[data-action="exit-cook"]')
        await page.wait_for_timeout(400)
        check('Kochmodus verlassen: Benachrichtigung storniert, Bildschirm darf ausgehen', len(await calls(page, 'notif.cancel')) >= 1 and len(await calls(page, 'allowSleep')) >= 1)

        # Einkaufsliste teilen
        await page.evaluate("dbPutShopping({ id: 's_n1', name: 'Butter', amount: 1, unit: 'Stk', checked: false, recipeId: null, createdAt: Date.now() }).then(() => loadShopping())")
        await show(page, "() => { state.view = 'shopping'; render(); }", '[data-action="share-shopping"], .shop-main, .shopping-main')
        btn = await page.evaluate("!!document.querySelector('[data-action=\"share-shopping\"]')")
        if btn:
            before = len(await calls(page, 'share'))
            await click(page, '[data-action="share-shopping"]')
            await page.wait_for_timeout(400)
            sh = await calls(page, 'share')
            check('Einkaufsliste ueber natives Teilen', len(sh) == before + 1 and 'Butter' in (sh[-1][1].get('text') or ''))
        else:
            print('UEBERSPRUNGEN (nicht bestanden, nicht ausgefuehrt): Einkaufsliste teilen, Schaltflaeche nicht gefunden')
        check('Keine Seitenfehler', not errors, str(errors[:3]))
        await browser.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
