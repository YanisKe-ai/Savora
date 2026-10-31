"""v0.95: Schritte abhaken (Rezeptansicht) und Mengen direkt im Schritt (Rezeptansicht und Kochmodus)."""
import asyncio, os, sys
os.environ.setdefault('SAVORA_TEST_PORT', '20000')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

SHOT = os.environ.get('SAVORA_V95_SHOTS')
RID = 'r_v95_steps'
ADD = """() => { const r = emptyRecipe(); r.id = 'r_v95_steps'; r.title = 'Schritte-Test'; r.servings = 4;
  r.ingredients = [ {amount:'200', unit:'g', name:'Mehl'}, {amount:'50', unit:'g', name:'Zucker'}, {amount:'', unit:'', name:'Salz'},
    {amount:'1<i>x</i>', unit:'EL', name:'Öl <b>fett</b>'} ];
  r.steps = [ {text:'Das Mehl mit dem Zucker mischen.'}, {text:'200 g Mehl dazugeben und 10 Minuten rühren.'},
    {text:'Öl dazugeben, dann Mehl nochmals 5 Minuten mixen und Salz zugeben.'}, {text:'Servieren.'} ];
  return dbPut(r).then(() => loadRecipes()).then(() => { state.activeRecipeId = 'r_v95_steps'; state.view = 'detail'; state.detailTab = 'steps'; render(); }); }"""
STEPS_JS = """() => Array.from(document.querySelectorAll('.step-list-v2 .step-item')).map(li => ({ done: li.classList.contains('is-done'),
  chk: li.querySelector('.step-check').getAttribute('aria-checked'), name: li.querySelector('.step-check').getAttribute('aria-label'),
  qty: Array.from(li.querySelectorAll('.step-qty')).map(q => q.textContent), text: li.querySelector('.step-body p').textContent.replace(/\\s+/g, ' ').trim() }))"""
RESET_VIS = "() => { const b = document.querySelector('.step-reset-btn'); return !!b && !b.hidden && b.getBoundingClientRect().height > 0; }"

async def setup(p, w, h, scheme='light'):
    b, ctx = await open_ctx(p, w, h)
    await ctx.add_init_script(f"try{{localStorage.setItem('savora-theme','{scheme}')}}catch(e){{}}")
    page = await ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    await goto(page); await page.evaluate(open(SEED_PATH).read())
    await page.evaluate(ADD); await page.wait_for_selector('.step-list-v2 .step-item')
    return b, page, errs

async def main():
    async with async_playwright() as p:
        b, page, errs = await setup(p, 390, 844)
        s = await page.evaluate(STEPS_JS)
        check('vier Schritte mit Knopf "Schritt n erledigt"', len(s) == 4 and s[2]['name'] == 'Schritt 3 erledigt' and all(x['chk'] == 'false' for x in s), s[2]['name'])
        check('Knopf mindestens 44 px', await page.evaluate("() => Array.from(document.querySelectorAll('.step-check')).every(b => { const r = b.getBoundingClientRect(); return r.width >= 44 && r.height >= 44; })"))
        check('Mengen: Mehl und Zucker nach erster Erwaehnung', s[0]['qty'] == ['200 g', '50 g'] and s[0]['text'] == 'Das Mehl 200 g mit dem Zucker 50 g mischen.', (s[0]['qty'], s[0]['text']))
        check('keine Doppelmenge bei "200 g Mehl"', s[1]['qty'] == [], s[1]['qty'])
        check('Salz ohne Menge bekommt keine, Mehl/Oel bekommen', len(s[2]['qty']) == 2 and any('200 g' == q for q in s[2]['qty']), s[2]['qty'])
        check('Escaping: kein fremdes Element im Etikett', await page.evaluate("() => !document.querySelector('.step-qty i, .step-qty b, .step-body p b, .step-body p i')") and any('<i>' in q for q in s[2]['qty']), s[2]['qty'])
        check('Etikett umbricht nicht', await page.evaluate("() => Array.from(document.querySelectorAll('.step-qty')).every(q => getComputedStyle(q).whiteSpace === 'nowrap')"))
        check('kein Etikett in Ueberschriften', await page.evaluate("() => !document.querySelector('.step-title .step-qty')"))
        check('Zuruecksetzen-Knopf anfangs unsichtbar', not await page.evaluate(RESET_VIS))
        # Abhaken per Klick auf Nummer, dann auf Text
        await page.click('.step-item:nth-child(1) .step-check')
        s = await page.evaluate(STEPS_JS)
        check('Klick auf Nummer hakt ab', s[0]['done'] and s[0]['chk'] == 'true')
        check('Zuruecksetzen-Knopf erscheint', await page.evaluate(RESET_VIS))
        check('erledigter Schritt gedaempft, nicht durchgestrichen', await page.evaluate("() => { const li = document.querySelector('.step-item'); const p = li.querySelector('p'); return parseFloat(getComputedStyle(li.querySelector('.step-body')).opacity) < 1 && getComputedStyle(p).textDecorationLine === 'none'; }"))
        await page.click('.step-item:nth-child(2) .step-body p')
        s = await page.evaluate(STEPS_JS)
        check('Klick auf Text hakt ab', s[1]['done'])
        await page.click('.step-item:nth-child(2) .step-body p')
        s = await page.evaluate(STEPS_JS)
        check('erneut tippen hebt auf', not s[1]['done'] and s[0]['done'])
        # Textauswahl hakt nicht ab
        await page.evaluate("() => { const p = document.querySelector('.step-item:nth-child(4) .step-body p'); const r = document.createRange(); r.selectNodeContents(p); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }")
        await page.evaluate("() => document.querySelector('.step-item:nth-child(4) .step-body p').click()")
        s = await page.evaluate(STEPS_JS)
        check('Klick bei markiertem Text hakt nicht ab', not s[3]['done'])
        await page.evaluate("() => getSelection().removeAllRanges()")
        # Tastatur
        await page.focus('.step-item:nth-child(3) .step-check'); await page.keyboard.press('Space')
        s = await page.evaluate(STEPS_JS)
        check('Leertaste hakt ab', s[2]['done'])
        await page.keyboard.press('Enter')
        s = await page.evaluate(STEPS_JS)
        check('Eingabetaste hebt auf', not s[2]['done'])
        # Zustand bleibt nach Neuaufbau
        await page.evaluate("() => render()")
        s = await page.evaluate(STEPS_JS)
        check('Zustand bleibt nach render()', s[0]['done'] and not s[1]['done'])
        # Portionen
        await page.evaluate("() => { state.servingsOverride['r_v95_steps'] = 8; render(); }")
        s = await page.evaluate(STEPS_JS)
        check('Mengen rechnen mit Portionen mit', s[0]['qty'] == ['400 g', '100 g'], s[0]['qty'])
        await page.evaluate("() => { state.servingsOverride['r_v95_steps'] = 4; render(); }")
        # Timer-Chip im Kochmodus hakt nichts ab und Mengen erscheinen
        await page.evaluate("""() => { state.view = 'cookmode'; state.cookMise = false; state.cookAllSteps = false; state.cookStepIndex = 2; render(); }""")
        await page.wait_for_selector('.cookmode-steptext')
        ck = await page.evaluate("() => ({ qty: Array.from(document.querySelectorAll('.cookmode-steptext .step-qty')).map(q => q.textContent), chips: document.querySelectorAll('.cookmode-steptext .timer-chip').length, txt: document.querySelector('.cookmode-steptext').textContent.replace(/\\s+/g, ' ') })")
        check('Kochmodus zeigt Mengen und behaelt Timer-Chip', len(ck['qty']) == 2 and ck['chips'] == 1, ck)
        await page.evaluate("() => { state.cookStepIndex = 0; render(); }")
        ck = await page.evaluate("() => Array.from(document.querySelectorAll('.cookmode-steptext .step-qty')).map(q => q.textContent)")
        check('Kochmodus Schritt 1: 200 g und 50 g', ck == ['200 g', '50 g'], ck)
        await page.evaluate("() => { state.cookStepIndex = 1; render(); }")
        ck = await page.evaluate("() => ({ q: document.querySelectorAll('.cookmode-steptext .step-qty').length, chips: document.querySelectorAll('.cookmode-steptext .timer-chip').length })")
        check('Kochmodus Schritt 2: keine Doppelmenge, Timer da', ck['q'] == 0 and ck['chips'] == 1, ck)
        await page.evaluate("() => { state.cookStepIndex = 2; render(); }")
        await page.click('.cookmode-steptext .timer-chip')
        await page.evaluate("() => { state.view = 'detail'; state.detailTab = 'steps'; render(); }")
        s = await page.evaluate(STEPS_JS)
        check('Kochmodus-Timer hakt keinen Schritt ab', not any(s[i]['done'] for i in (1, 2, 3)))
        await page.evaluate("() => { Object.keys(state.timers).forEach(k => { try { clearInterval(state.timers[k].interval); } catch (e) {} }); state.timers = {}; }")
        # Alle zuruecksetzen
        await page.click('.step-reset-btn')
        s = await page.evaluate(STEPS_JS)
        check('Alle zuruecksetzen', not any(x['done'] for x in s) and not await page.evaluate(RESET_VIS))
        check('keine Seitenfehler', not errs, errs)
        await b.close()
        # Darstellung in drei Breiten, hell und dunkel
        for w, h in [(320, 640), (390, 844), (1280, 800)]:
            for scheme in ('light', 'dark'):
                b, page, errs = await setup(p, w, h, scheme)
                await page.click('.step-item:nth-child(1) .step-check')
                ov = await page.evaluate(OVERFLOW_JS)
                check(f'{w}px {scheme}: kein seitlicher Ueberlauf', not ov, ov)
                dark = await page.evaluate("() => document.documentElement.getAttribute('data-theme')")
                check(f'{w}px {scheme}: Haken sichtbar', await page.evaluate("() => { const t = document.querySelector('.step-item.is-done .step-no-tick'); return parseFloat(getComputedStyle(t).opacity) > 0.9; }"))
                if SHOT and w in (390, 1280): await page.screenshot(path=os.path.join(SHOT, f'a_schritte_{w}_{scheme}.png'))
                check(f'{w}px {scheme}: keine Seitenfehler', not errs, errs)
                await b.close()
    print('\n' + ('ALLES OK' if not FAIL else 'FEHLER: ' + ', '.join(FAIL)))
    sys.exit(1 if FAIL else 0)
asyncio.run(main())
