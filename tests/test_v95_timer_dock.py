"""v95 Timer überall: schwebende Pille (timer-dock.js) für laufende und fertige Timer ausserhalb des Kochmodus."""
import asyncio, sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

RID = 'r_legacy_1'
TID = RID + '-1-seg0'   # Timer im zweiten Schritt («10 Minuten»)
TID2 = RID + '-0-seg9'
SHOTS = _os.path.join(_os.environ.get('SAVORA_SHOT_DIR', ''), '') if _os.environ.get('SAVORA_SHOT_DIR') else ''

async def start_cooking(page):
    ev = page.evaluate
    await ev("() => { localStorage.removeItem('savora-cook-progress'); state.timers = {}; }")
    await show(page, f"() => {{ state.activeRecipeId = '{RID}'; state.view = 'detail'; render(); }}", '.detail-main')
    await page.click('[data-action="start-cook"]'); await page.wait_for_selector('.cook-mise')
    await page.click('.cookmode-nav .primary'); await page.wait_for_selector('.cook-step-card')
    await page.click('[data-action="cook-next"]'); await page.wait_for_selector('.cook-timer-start')
    await page.click('.cook-timer-start')
    await page.wait_for_function(f"() => state.timers['{TID}'] && state.timers['{TID}'].running")

async def leave_to_shopping(page):
    await page.click('[data-action="exit-cook"]')
    await page.wait_for_function("() => state.view !== 'cookmode'")
    await page.evaluate("() => { state.view = 'shopping'; render(); }")
    await page.wait_for_selector('.bottom-nav')

DOCK = "document.getElementById('timerDock')"
async def dock_vis(page):
    return await page.evaluate(f"() => {{ const d = {DOCK}; return !!d && !d.hidden && d.classList.contains('is-in') && getComputedStyle(d).opacity === '1'; }}")

async def main():
    async with async_playwright() as p:
        b, c = await open_ctx(p, 390, 844)
        page = await c.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(400)
        ev = page.evaluate

        # 1 Im Kochmodus keine Pille; Metadaten im Timer
        await start_cooking(page)
        check('Im Kochmodus keine Pille', not await dock_vis(page))
        meta = await ev(f"state.timers['{TID}'].meta")
        check('Timer speichert Rezept, Schritt und Name', meta and meta['recipeId'] == RID and meta['stepIdx'] == 1 and meta['label'] == 'Sloppy Joe Buns', str(meta))

        # 2 Kochmodus verlassen (Kreuz), Einkaufsliste: Pille sichtbar, tickt, Timer lief weiter
        await leave_to_shopping(page)
        await page.wait_for_function(f"() => {{ const d = {DOCK}; return d && !d.hidden && d.classList.contains('is-in'); }}")
        check('Timer läuft nach dem Verlassen weiter', await ev(f"state.timers['{TID}'] && state.timers['{TID}'].running"))
        t1 = await ev(f"{DOCK}.querySelector('.timer-dock-time').textContent")
        await page.wait_for_function(f"t => {DOCK}.querySelector('.timer-dock-time').textContent !== t", arg=t1, timeout=5000)
        t2 = await ev(f"{DOCK}.querySelector('.timer-dock-time').textContent")
        check('Pille zeigt Restzeit mm:ss und tickt ohne render()', t1[:2] in ('9:', '10') and t2 != t1, f'{t1} -> {t2}')
        info = await ev(f"""() => {{ const d = {DOCK}, m = d.querySelector('.timer-dock-main'), nav = document.querySelector('.bottom-nav');
          const r = d.getBoundingClientRect(), n = nav.getBoundingClientRect(); const mr = m.getBoundingClientRect();
          return {{ label: m.getAttribute('aria-label'), name: d.querySelector('.timer-dock-name').textContent, gap: n.top - r.bottom, h: mr.height, ok: d.querySelector('.timer-dock-ok').hidden, live: !!d.querySelector('[aria-live]') || d.hasAttribute('aria-live'), parent: d.parentElement.tagName }}; }}""")
        check('Pille: Knopf mit klarem Namen, ohne aria-live, an body', info['label'].startswith('Timer Sloppy Joe Buns, Schritt 2, noch 9 Minuten') and info['label'].endswith('zum Kochmodus') and not info['live'] and info['parent'] == 'BODY', info['label'])
        check('Pille: Name, mind. 44 px hoch, über der Navigation, kein OK solange es läuft', info['name'] == 'Sloppy Joe Buns' and info['h'] >= 44 and info['gap'] >= 8 and info['ok'] is True, str(info))
        # Ein Toast schiebt die Pille nicht darunter, sondern sie weicht aus
        await ev("showToast('Test')"); await page.wait_for_selector('.toast')
        await page.wait_for_function(f"() => {{ const t = document.querySelector('.toast').getBoundingClientRect(), d = {DOCK}.getBoundingClientRect(); return d.bottom <= t.top + 1 || d.top >= t.bottom - 1; }}")
        check('Toast und Pille überlappen sich nicht', True)

        # 3 Tippen: zurück in den Kochmodus beim richtigen Schritt, Fortschritt bleibt
        await ev(f"() => {{ checkedSetFor('{RID}').add(0); saveCookProgress(); }}")
        await page.click(f'#timerDock .timer-dock-main')
        await page.wait_for_selector('.cook-step-card')
        st = await ev(f"() => ({{ view: state.view, step: state.cookStepIndex, chk: Array.from(checkedSetFor('{RID}')), running: state.timers['{TID}'].running, dock: {DOCK}.hidden || !{DOCK}.classList.contains('is-in') }})")
        check('Tippen führt in den Kochmodus zu Schritt 2, Haken und Timer bleiben', st['view'] == 'cookmode' and st['step'] == 1 and 0 in st['chk'] and st['running'], str(st))
        await page.wait_for_function(f"() => !{DOCK}.classList.contains('is-in')")
        check('Im Kochmodus ist die Pille wieder weg', True)

        # 4 Zwei Timer: «+1»
        await ev(f"() => {{ startTimer('{TID2}', 300); }}")
        await leave_to_shopping(page)
        await page.wait_for_function(f"() => {DOCK}.classList.contains('is-in') && !{DOCK}.querySelector('.timer-dock-more').hidden")
        two = await ev(f"() => ({{ more: {DOCK}.querySelector('.timer-dock-more').textContent, time: {DOCK}.querySelector('.timer-dock-time').textContent, label: {DOCK}.querySelector('.timer-dock-main').getAttribute('aria-label') }})")
        check('Zwei Timer: nächst ablaufender (5 Min.) plus «+1»', two['more'] == '+1' and two['time'][:2] in ('5:', '4:') and 'plus 1 weiterer Timer' in two['label'] and 'Schritt 1' in two['label'], str(two))

        # 5 Ablauf: Fertig-Zustand, OK blendet aus, ohne in den Kochmodus zu wechseln
        await ev(f"() => {{ const t = state.timers['{TID}']; t.endTime = Date.now() - 1; tickTimer('{TID}'); }}")
        await page.wait_for_function(f"() => {DOCK}.classList.contains('is-done')")
        done = await ev(f"""() => {{ const d = {DOCK}, ok = d.querySelector('.timer-dock-ok'), cs = getComputedStyle(d);
          return {{ name: d.querySelector('.timer-dock-name').textContent, bg: cs.backgroundColor, okh: ok.getBoundingClientRect().height, okw: ok.getBoundingClientRect().width, okHidden: ok.hidden, view: state.view, alarm: !!document.getElementById('cookAlarm') }}; }}""")
        check('Fertig: Tomatenrot, «Fertig: …», OK-Knopf mind. 44 px', done['name'] == 'Fertig: Sloppy Joe Buns' and done['bg'] in ('rgb(185, 59, 44)', 'rgb(255, 155, 128)') and done['okh'] >= 44 and done['okw'] >= 44 and not done['okHidden'] and done['view'] == 'shopping', str(done))
        await page.click('#timerDock .timer-dock-ok')
        await ev("() => 1")
        left = await ev(f"() => ({{ view: state.view, more: {DOCK}.querySelector('.timer-dock-more').hidden, done: {DOCK}.classList.contains('is-done'), alarm: !!document.getElementById('cookAlarm') }})")
        check('OK bestätigt, bleibt in der Ansicht, Tomatenleiste weg, übrig bleibt der laufende Timer', left['view'] == 'shopping' and left['more'] and not left['done'] and not left['alarm'], str(left))
        await ev(f"() => {{ const t = state.timers['{TID2}']; t.endTime = Date.now() - 1; tickTimer('{TID2}'); }}")
        await page.wait_for_function(f"() => {DOCK}.classList.contains('is-done')")
        await page.click('#timerDock .timer-dock-ok')
        await page.wait_for_function(f"() => !{DOCK}.classList.contains('is-in')")
        await page.wait_for_function(f"() => {DOCK}.hidden")
        check('Nach dem letzten OK ist die Pille ausgeblendet', True)
        # Im Kochmodus bleibt der bestätigte Timer sichtbar (Leiste unverändert)
        # 6 Bindestriche in der Rezept-ID
        await ev("""() => { const r = JSON.parse(JSON.stringify(state.recipes.find(x => x.id === 'r_legacy_1'))); r.id = 'mein-rezept-mit-strich'; r.title = 'Strich'; state.recipes.push(r); state.activeRecipeId = r.id; startTimer('mein-rezept-mit-strich-3-seg0', 120); state.activeRecipeId = 'r_legacy_1'; }""")
        await page.wait_for_function(f"() => {DOCK}.classList.contains('is-in')")
        h = await ev("state.timers['mein-rezept-mit-strich-3-seg0'].meta")
        check('Rezept-ID mit Bindestrichen: Metadaten stimmen', h['recipeId'] == 'mein-rezept-mit-strich' and h['stepIdx'] == 3, str(h))
        await ev("() => { const t = state.timers['mein-rezept-mit-strich-3-seg0']; clearInterval(t.intervalId); delete state.timers['mein-rezept-mit-strich-3-seg0']; state.recipes = state.recipes.filter(r => r.id !== 'mein-rezept-mit-strich'); timerDockUpdate(); }")
        await page.wait_for_function(f"() => !{DOCK}.classList.contains('is-in')")

        # 7 Breiten ohne Überlauf, Pille über der Navigation (hell und dunkel)
        for w in (320, 390, 1280):
            for th in ('light', 'dark'):
                await page.set_viewport_size({'width': w, 'height': 844 if w < 900 else 800})
                await ev(f"() => {{ document.documentElement.setAttribute('data-theme', '{th}'); }}")
                await ev(f"() => {{ state.timers = {{}}; state.activeRecipeId = '{RID}'; startTimer('{TID}', 612); state.view = 'shopping'; render(); }}")
                await page.wait_for_function(f"() => {DOCK}.classList.contains('is-in')")
                await page.wait_for_timeout(260)
                m = await ev(f"""() => {{ const d = {DOCK}.getBoundingClientRect(), nav = document.querySelector('.bottom-nav').getBoundingClientRect(); const W = document.documentElement.clientWidth;
                  const wide = W >= 900; return {{ over: document.documentElement.scrollWidth > W, inside: d.left >= 0 && d.right <= W, clear: wide ? true : d.bottom <= nav.top, name: {DOCK}.querySelector('.timer-dock-name').getBoundingClientRect().width > 0 }}; }}""")
                over = await ev(OVERFLOW_JS)
                check(f'{w}px {th}: kein seitlicher Überlauf, Pille im Bild und frei von der Navigation', not m['over'] and m['inside'] and m['clear'] and not over, str(m) + str(over))
                if SHOTS and w in (390, 1280) and (w == 390 or th == 'light'):
                    await page.screenshot(path=_os.path.join(SHOTS, f'c_dock_{w}_{th}.png'))
                    if w == 390:
                        await ev(f"() => {{ const t = state.timers['{TID}']; t.endTime = Date.now() - 1; tickTimer('{TID}'); }}")
                        await page.wait_for_function(f"() => {DOCK}.classList.contains('is-done')"); await page.wait_for_timeout(260)
                        await page.screenshot(path=_os.path.join(SHOTS, f'c_dock_done_{w}_{th}.png'))
                        await ev(f"() => {{ const t = state.timers['{TID}']; t.ack = true; }}")
        await ev("() => document.documentElement.removeAttribute('data-theme')")

        # 8 Pille liegt nicht über der Hinzufügen-Leiste (Startseite)
        await page.set_viewport_size({'width': 390, 'height': 844})
        await ev(f"() => {{ state.timers = {{}}; startTimer('{TID}', 600); state.view = 'home'; render(); }}")
        await page.wait_for_function(f"() => {DOCK}.classList.contains('is-in')"); await page.wait_for_timeout(300)
        hm = await ev(f"""() => {{ const d = {DOCK}.getBoundingClientRect(), a = document.querySelector('.home-add-bar button, .home-add-bar a, .home-add-bar'); const r = a.getBoundingClientRect(); return {{ d: [d.top, d.bottom], a: [r.top, r.bottom], has: !!document.querySelector('.home-add-bar') }}; }}""")
        check('Startseite: Pille überdeckt die Hinzufügen-Leiste nicht', (not hm['has']) or hm['d'][1] <= hm['a'][0] + 1, str(hm))

        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await b.close()

        # 9 Pulsieren nur ohne Reduced Motion
        for motion in ('no-preference', 'reduce'):
            b, c = await open_ctx(p, 390, 844, motion=motion)
            page = await c.new_page(); await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(300)
            await page.evaluate(f"() => {{ state.activeRecipeId = '{RID}'; startTimer('{TID}', 600); const t = state.timers['{TID}']; t.endTime = Date.now() - 1; tickTimer('{TID}'); state.view = 'shopping'; render(); }}")
            await page.wait_for_function(f"() => {DOCK}.classList.contains('is-done')")
            an = await page.evaluate(f"() => getComputedStyle({DOCK}, '::after').animationName")
            check(f'Pulsieren bei {motion}: ' + ('an' if motion == 'no-preference' else 'aus'), (an == 'timerDockPulse') == (motion == 'no-preference'), an)
            await b.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
