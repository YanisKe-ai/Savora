"""v89 D Kochmodus: Mise en place, grosser Timer-Knopf, Timer-Ende mit wiederholtem Ton und Tomatenleiste,
Kopf «2/3» in Lilita, freihändig (Antippen links/rechts, Sprachbefehle), Zutaten-Pillen, Tomatenakzent,
Schlussbild und Kochverlauf (cookLog, «Zuletzt gekocht am …»)."""
import asyncio, sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

RID = 'r_legacy_1'
TID = RID + '-1-seg0'   # Timer im zweiten Schritt («10 Minuten»)

async def main():
    async with async_playwright() as p:
        b, c = await open_ctx(p, 375, 667)
        page = await c.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(400)
        ev = page.evaluate
        # Ton und Vibration zaehlen (kein echter Lautsprecher im Testbrowser)
        await ev("""() => { window.__beeps = 0; window.__vib = []; const O = window.AudioContext;
          window.AudioContext = function () { const ctx = new O(); const co = ctx.createOscillator.bind(ctx); ctx.createOscillator = () => { window.__beeps++; return co(); }; return ctx; };
          navigator.vibrate = (p) => { window.__vib.push(p); return true; }; }""")

        # 1 Mise en place vor Schritt 1
        await show(page, f"() => {{ localStorage.removeItem('savora-cook-progress'); state.activeRecipeId = '{RID}'; state.view = 'detail'; render(); }}", '.detail-main')
        await page.click('[data-action="start-cook"]')
        await page.wait_for_selector('.cook-mise')
        n_ing = await ev(f"realIngredients(state.recipes.find(r => r.id === '{RID}')).length")
        tiles = await ev("document.querySelectorAll('.cook-mise-tile').length")
        check('Mise en place: eine Kachel je Zutat', tiles == n_ing and tiles > 0, f'{tiles}/{n_ing}')
        th = await ev("Math.min(...Array.from(document.querySelectorAll('.cook-mise-tile')).map(t => t.getBoundingClientRect().height))")
        check('Mise en place: Kacheln gross (mind. 80 px)', th >= 80, str(th))
        await page.click('.cook-mise-tile')
        mise = await ev(f"() => ({{ on: document.querySelector('.cook-mise-tile').getAttribute('aria-checked'), cnt: document.getElementById('cookMiseCount').textContent, used: checkedSetFor('{RID}').size }})")
        check('Mise en place: Abhaken zählt mit, Schritt-Haken bleiben unberührt', mise['on'] == 'true' and mise['cnt'].startswith('1 von') and mise['used'] == 0, str(mise))
        await page.click('.cookmode-nav .primary')   # «Los geht's»
        await page.wait_for_selector('.cook-step-card')
        head = await ev("() => ({ sr: document.querySelector('.cookmode-progress').textContent, big: document.querySelector('.cook-stepcount [aria-hidden]').textContent, font: getComputedStyle(document.querySelector('.cook-stepcount b')).fontFamily, bar: document.querySelector('.cook-v2 .cook-progress').getBoundingClientRect().height })")
        check('Kopf: «1/3» gross in Lilita, Text für Screenreader bleibt', head['sr'] == 'Schritt 1 von 3' and head['big'] == '1/3' and 'Lilita' in head['font'], str(head))
        check('Fortschrittsbalken 6 bis 8 px', 6 <= head['bar'] <= 8, str(head['bar']))
        skip = await ev("() => { state.view = 'detail'; render(); return 1; }")
        await page.click('[data-action="start-cook"]'); await page.wait_for_selector('.cook-v2')
        check('Mit gespeichertem Fortschritt keine Vorbereitung', await ev("!document.querySelector('.cook-mise')"))

        # 2 Akzent Tomatenrot, Vorlesen mit Beschriftung
        acc = await ev("getComputedStyle(document.querySelector('.cookmode-nav .primary')).backgroundColor")
        check('Akzent im Kochmodus Tomatenrot', acc == 'rgb(255, 107, 74)', acc)
        rd = await ev("() => { const b = document.querySelector('[data-action=\"toggle-voice\"]'); return { t: b.textContent.trim(), p: b.getAttribute('aria-pressed'), h: b.getBoundingClientRect().height }; }")
        check('Vorlesen: Lautsprecher mit Kurzbeschriftung, Zustand per aria-pressed', rd['t'] == 'Vorlesen' and rd['p'] == 'false' and rd['h'] >= 44, str(rd))

        # 3 Timer: Chip >= 48 px Trefferfläche, grosser Knopf unter dem Schritt
        await page.click('[data-action="cook-next"]'); await page.wait_for_selector('.cook-timer-start')
        chip = await ev("() => { const c = document.querySelector('.timer-chip'); const s = getComputedStyle(c, '::before'); const h = c.getBoundingClientRect().height; return { h, hit: h - parseFloat(s.top) - parseFloat(s.bottom) }; }")
        check('Timer-Chip: sichtbar mind. 40 px, Trefferfläche mind. 48 px', chip['h'] >= 39.5 and chip['hit'] >= 48, str(chip))
        big = await ev("() => { const b = document.querySelector('.cook-timer-start'); return { t: b.textContent.trim(), h: b.getBoundingClientRect().height }; }")
        check('Grosser Knopf «Timer 10 Min. starten» mind. 48 px', big['t'] == 'Timer 10 Min. starten' and big['h'] >= 48, str(big))
        await page.click('.cook-timer-start')
        await page.wait_for_function(f"() => state.timers['{TID}'] && state.timers['{TID}'].running && document.querySelector('.cook-timer-start').dataset.state === 'running'")
        run = await ev("() => ({ t: document.querySelector('.cook-timer-start').textContent.replace(/\\s+/g, ' ').trim(), chip: document.querySelector('.timer-chip').classList.contains('running') })")
        check('Knopf startet denselben Timer wie der Chip', run['t'].startswith('Läuft') and run['chip'], str(run))

        # 4 Zutaten-Pillen: Menge fett und groesser
        ing = await ev("() => { const a = document.querySelector('.cook-ing-amt'), n = document.querySelector('.cook-ing-name'); return a && n ? { aw: +getComputedStyle(a).fontWeight, as: parseFloat(getComputedStyle(a).fontSize), ns: parseFloat(getComputedStyle(n).fontSize) } : null; }")
        check('Zutaten-Pille: Menge fett und grösser als der Name', ing and ing['aw'] >= 700 and ing['as'] > ing['ns'], str(ing))

        # 5 Timer-Leiste verdeckt keine Zutat: bis ganz unten scrollen
        cov = await ev("""() => { const body = document.querySelector('.cookmode-body'); body.scrollTop = body.scrollHeight; const bar = document.getElementById('cookTimerBar');
          const items = Array.from(body.querySelectorAll('.cook-ing, .cook-ings-btn')); const last = items[items.length - 1];
          return { hidden: bar.hidden, lastBottom: last.getBoundingClientRect().bottom, barTop: bar.getBoundingClientRect().top, bodyBottom: body.getBoundingClientRect().bottom }; }""")
        check('Timer-Leiste sichtbar und verdeckt nichts (letztes Element endet über Leiste)', not cov['hidden'] and cov['lastBottom'] <= cov['barTop'] - 8 and cov['lastBottom'] <= cov['bodyBottom'] - 8, str(cov))
        await ev("document.querySelector('.cookmode-body').scrollTop = 0")

        # 6 Timer-Ende: Tomatenleiste, Ton wiederholt bis «Fertig», hoechstens 2 Minuten
        await ev(f"() => {{ const t = state.timers['{TID}']; t.endTime = Date.now() - 1; tickTimer('{TID}'); }}")
        await page.wait_for_selector('#cookAlarm')
        al = await ev("() => { const a = document.getElementById('cookAlarm'); const r = a.getBoundingClientRect(); const ok = a.querySelector('.cook-alarm-ok'); return { w: r.width, vw: innerWidth, bg: getComputedStyle(a).backgroundColor, ok: ok.textContent, okh: ok.getBoundingClientRect().height, focus: document.activeElement === ok, txt: a.textContent }; }")
        check('Timer-Ende: bildschirmbreite Tomatenleiste mit grossem «Fertig»', al['w'] == al['vw'] and al['bg'] == 'rgb(200, 64, 44)' and al['ok'] == 'Fertig' and al['okh'] >= 56 and al['focus'] and 'Schritt 2' in al['txt'], str({k: v for k, v in al.items() if k != 'txt'}))
        b0 = await ev("window.__beeps")
        await page.wait_for_function(f"window.__beeps > {b0}", timeout=5000)
        check('Ton wiederholt sich, Vibration ausgelöst', await ev("window.__beeps") > b0 and len(await ev("window.__vib")) >= 2)
        await ev("() => { _cookAlarm.started = Date.now() - 130000; }")
        await page.wait_for_function("() => _cookAlarm && _cookAlarm.iv === null", timeout=5000)
        b1 = await ev("window.__beeps"); await page.wait_for_timeout(2300)
        check('Nach 2 Minuten kein Ton mehr, Leiste bleibt bis zur Bestätigung', await ev("window.__beeps") == b1 and await ev("!!document.getElementById('cookAlarm')"))
        await page.click('.cook-alarm-ok')
        check('«Fertig» beendet Ton und Leiste', await ev("!document.getElementById('cookAlarm') && _cookAlarm === null"))

        # 7 Freihaendig: rechte Haelfte weiter, linke zurueck, Knoepfe loesen nichts aus
        async def tap(side):
            box = await ev("() => { const r = document.querySelector('.cook-step-card').getBoundingClientRect(); return [r.left, r.right, r.top]; }")
            x = box[1] - 12 if side == 'r' else box[0] + 12
            await page.mouse.click(x, box[2] + 4); await page.wait_for_timeout(150)
        s0 = await ev("state.cookStepIndex"); await tap('r'); s1 = await ev("state.cookStepIndex"); await tap('l'); s2 = await ev("state.cookStepIndex")
        check('Antippen rechts = weiter, links = zurück', (s0, s1, s2) == (1, 2, 1), str((s0, s1, s2)))
        await page.click('.cook-ing'); check('Tippen auf eine Zutat wechselt keinen Schritt', await ev("state.cookStepIndex") == 1)
        await ev("cookVoiceHandle('weiter')"); v1 = await ev("state.cookStepIndex")
        await ev("cookVoiceHandle('zurück')"); v2 = await ev("state.cookStepIndex")
        await ev("cookVoiceHandle('wir rühren jetzt weiter und dann')"); v3 = await ev("state.cookStepIndex")
        check('Sprachbefehle «weiter»/«zurück», ganze Sätze werden ignoriert', (v1, v2, v3) == (2, 1, 1), str((v1, v2, v3)))
        await ev("() => { window.webkitSpeechRecognition = function () { this.start = () => { window.__recStarted = true; }; this.abort = () => {}; }; state.cookAllSteps = true; render(); }")
        await page.click('[data-action="cook-voice-control"]')
        check('Sprachsteuerung zuschaltbar (nur wenn verfügbar)', await ev("state.cookVoiceControl === true && window.__recStarted === true && document.querySelector('[data-action=\"cook-voice-control\"]').getAttribute('aria-pressed') === 'true'"))
        await page.click('[data-action="cook-voice-control"]')
        await ev("() => { state.cookAllSteps = false; render(); }")

        # 8 Schlussbild und Kochverlauf
        await ev("() => { state.cookStepIndex = 2; render(); }")
        await page.click('[data-action="cook-finish"]'); await page.wait_for_selector('.cook-finish-v2')
        fin = await ev("() => { const h = document.querySelector('.cook-finish-v2 h2'); return { t: h.textContent, f: getComputedStyle(h).fontFamily }; }")
        check('Schlussbild «Guten Appetit.» in Lilita', fin['t'] == 'Guten Appetit.' and 'Lilita' in fin['f'], str(fin))
        before = await ev(f"(state.recipes.find(r => r.id === '{RID}').cookLog || []).length")
        await page.click('[data-action="cook-complete"]'); await page.wait_for_selector('.detail-main')
        rec = await ev(f"dbGetAll().then(l => l.find(r => r.id === '{RID}'))")
        log = rec.get('cookLog') or []
        check('Gekocht ohne Notiz: Eintrag im Verlauf (date, cooked), lastCookedAt gesetzt', len(log) == before + 1 and log[-1].get('cooked') is True and log[-1].get('text') == '' and log[-1].get('date') == rec.get('lastCookedAt'), str(log[-1:]))
        det = await ev("() => { state.detailTab = 'steps'; render(); const l = document.querySelector('.cook-last-line'); return { line: l && l.textContent, notesTab: Array.from(document.querySelectorAll('.tab-v2')).some(t => t.textContent.trim() === 'Notizen') }; }")
        check('Rezeptdetail: dezent «Zuletzt gekocht am …»', bool(det['line']) and det['line'].startswith('Zuletzt gekocht am'), str(det))
        nt = await ev(f"""() => {{ const r = state.recipes.find(x => x.id === '{RID}'); r.notes = ''; r.cookLog = (r.cookLog || []).filter(n => !String(n.text || '').trim()); render();
          return {{ n: r.cookLog.length, tab: Array.from(document.querySelectorAll('.tab-v2')).some(t => t.textContent.trim() === 'Notizen') }}; }}""")
        check('Kochverlauf ohne Notiz erzeugt keinen leeren Notizen-Reiter', nt['n'] >= 1 and not nt['tab'], str(nt))
        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await b.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
