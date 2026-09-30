"""Paket 6: Kochmodus (Schriftgroesse, Timer-Leiste, Wischen), Sicherungs-Erinnerung, Naehrwerte abschaltbar, Einstieg."""
import asyncio, sys, time
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, reduced_motion='reduce', timezone_id='UTC')
        await ctx.add_init_script(NO_SW + " try{localStorage.setItem('savora-splash-seen','1')}catch(e){}")
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(500)
        async def js(code): return await page.evaluate(code)
        async def click(sel):
            await page.evaluate("(s) => { const e = document.querySelector(s); if (!e) throw new Error('fehlt: ' + s); e.click(); }", sel); await page.wait_for_timeout(200)

        # ---- Einstieg (leeres Kochbuch) ----
        await js("() => { const keep = state.recipes; state.recipes = []; state.view = 'home'; render(); window.__keep = keep; }")
        check('Leeres Kochbuch zeigt drei Einstiegsschritte', await js("document.querySelectorAll('.empty-steps li').length") == 3)
        await js("() => { state.recipes = window.__keep; state.view = 'home'; render(); }")

        # ---- Sicherungs-Erinnerung ----
        await js("() => { localStorage.removeItem('savora-backup-nudge-until'); localStorage.removeItem(LAST_BACKUP_KEY); state.lastBackupAt = null; render(); }")
        check('Noch nie gesichert (3 Rezepte): Erinnerung erscheint', 'Noch keine Sicherung' in await js("(document.querySelector('.nudge-card')||{innerText:''}).innerText"))
        await click('[data-action="backup-nudge-dismiss"]')
        check('"Später" blendet die Erinnerung aus und merkt sich das', await js("!document.querySelector('.nudge-card') && +localStorage.getItem('savora-backup-nudge-until') > Date.now() + 6*86400000"))
        await js("() => { localStorage.removeItem('savora-backup-nudge-until'); state.lastBackupAt = new Date(Date.now() - 20*86400000).toISOString(); render(); }")
        check('Letzte Sicherung vor 20 Tagen: Erinnerung nennt die Tage', 'vor 20 Tagen' in await js("(document.querySelector('.nudge-card')||{innerText:''}).innerText"))
        await js("() => { state.lastBackupAt = new Date(Date.now() - 3*86400000).toISOString(); render(); }")
        check('Sicherung vor 3 Tagen: keine Erinnerung', await js("!document.querySelector('.nudge-card')"))
        await js("() => { state.lastBackupAt = null; const keep = state.recipes; state.recipes = keep.slice(0, 2); render(); window.__keep = keep; }")
        check('Weniger als 3 Rezepte: keine Erinnerung', await js("!document.querySelector('.nudge-card')"))
        await js("() => { state.recipes = window.__keep; state.lastBackupAt = new Date().toISOString(); render(); }")

        # ---- Naehrwerte abschaltbar ----
        await js("() => { state.activeRecipeId = 'r_legacy_1'; state.view = 'detail'; render(); }")
        check('Standard: Reiter Nährwerte ist da', await js("Array.from(document.querySelectorAll('.tab-v2')).some(b => b.textContent.trim() === 'Nährwerte')"))
        await js("() => { state.view = 'settings-nutrition'; render(); }")
        await click('[data-action="set-show-nutrition"][data-value="0"]')
        check('Ausblenden gespeichert', await js("localStorage.getItem('savora-show-nutrition')") == '0' and await js("state.showNutrition") is False)
        await js("() => { state.activeRecipeId = 'r_legacy_1'; state.view = 'detail'; render(); }")
        check('Aus: Reiter Nährwerte fehlt', not await js("Array.from(document.querySelectorAll('.tab-v2')).some(b => b.textContent.trim() === 'Nährwerte')"))
        opt = await js("() => { state.modal = { type: 'pdf-export', target: 'single', recipeId: 'r_legacy_1', stage: 'options', nutritionDetail: 'off' }; return pdfExportOptionsStage(); }")
        check('Aus: PDF-Dialog ohne Nährwert-Option', 'Nährwerte im PDF' not in opt and 'PDF erstellen' in opt)
        check('Aus: Standard für PDF ist "off"', await js("defaultPdfNutritionDetail('single', 'r_legacy_1')") == 'off')
        await js("() => { state.modal = null; state.view = 'settings-nutrition'; render(); }")
        await click('[data-action="set-show-nutrition"][data-value="1"]')
        await js("() => { state.activeRecipeId = 'r_legacy_1'; state.view = 'detail'; render(); }")
        check('Wieder an: Reiter Nährwerte ist zurück', await js("Array.from(document.querySelectorAll('.tab-v2')).some(b => b.textContent.trim() === 'Nährwerte')"))

        # ---- Kochmodus ----
        await click('[data-action="start-cook"]'); await page.wait_for_selector('.cook-v2')
        # Schriftgroesse
        f0 = await js("parseFloat(getComputedStyle(document.querySelector('.cookmode-steptext')).fontSize)")
        await click('[data-action="cook-font"]'); f1 = await js("parseFloat(getComputedStyle(document.querySelector('.cookmode-steptext')).fontSize)")
        await click('[data-action="cook-font"]'); f2 = await js("parseFloat(getComputedStyle(document.querySelector('.cookmode-steptext')).fontSize)")
        check('Schriftgröße: Normal < Gross < Sehr gross', f0 < f1 < f2, f'{f0} {f1} {f2}')
        check('Schriftgröße bleibt gespeichert', await js("localStorage.getItem('savora-cook-scale')") == '2')
        await click('[data-action="cook-font"]')
        check('Dritter Tipp: wieder Normal', await js("localStorage.getItem('savora-cook-scale')") == '0')
        # Wischen: zum Schritt mit Timer
        async def swipe(dx):
            await page.evaluate("""(dx) => { const el = document.querySelector('.cook-v2 .cookmode-body'); const mk = (x, y, target) => new Touch({ identifier: 1, target, clientX: x, clientY: y });
              const t0 = mk(200, 400, el); el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, changedTouches: [t0], touches: [t0] }));
              const t1 = mk(200 + dx, 405, el); el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, changedTouches: [t1], touches: [] })); }""", dx)
            await page.wait_for_timeout(250)
        s0 = await js("state.cookStepIndex")
        await swipe(-140); s1 = await js("state.cookStepIndex")
        await swipe(140); s2 = await js("state.cookStepIndex")
        check('Wischen nach links = weiter, nach rechts = zurück', (s0, s1, s2) == (0, 1, 0), str((s0, s1, s2)))
        await swipe(-30); check('Kurzes Wischen tut nichts', await js("state.cookStepIndex") == 0)
        # Timer-Leiste: Timer im Schritt 2 starten, Schritt wechseln, Leiste bleibt
        await swipe(-140)
        check('Ohne Timer ist die Leiste leer', await js("document.getElementById('cookTimerBar').hidden") is True)
        await click('.timer-chip'); await page.wait_for_timeout(300)
        check('Timer starten zeigt die Leiste mit dem Schritt', await js("!document.getElementById('cookTimerBar').hidden && document.querySelector('.cook-timer-step').textContent") == 'Schritt 2')
        r0 = await js("Object.values(state.timers)[0].remaining")
        await click('[data-action="timer-plus"]')
        r1 = await js("Object.values(state.timers)[0].remaining")
        check('"+1 Min." verlängert den Timer um 60 Sekunden', 58 <= r1 - r0 <= 62, f'{r0} -> {r1}')
        await page.wait_for_timeout(1300)
        lab = await js("document.querySelector('.cook-timer-go b').textContent")
        chip = await js("document.querySelector('.timer-chip [data-timer-label]').textContent")
        check('Zeit in Leiste und Text läuft mit und ist gleich', lab == chip and lab != '', f'{lab} / {chip}')
        await swipe(140)   # zurueck zu Schritt 1
        check('Leiste bleibt in anderen Schritten sichtbar', await js("!document.getElementById('cookTimerBar').hidden && state.cookStepIndex") == 0)
        await click('.cook-timer-go'); await page.wait_for_timeout(200)
        check('Tippen auf einen Timer springt zu seinem Schritt', await js("state.cookStepIndex") == 1)
        bad = await js("Array.from(document.querySelectorAll('.cook-timerbar button, .cook-font-btn')).filter(e => { const r = e.getBoundingClientRect(); return r.height < 43.5 || r.width < 43.5 }).length")
        check('Tippflächen der Timer-Leiste und Schrift-Taste mind. 44 px', bad == 0, str(bad))
        await click('[data-action="exit-cook"]'); await page.wait_for_timeout(300)
        check('Kochmodus verlassen: Timer beendet', await js("Object.keys(state.timers).length") == 0)
        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await browser.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
