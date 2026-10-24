"""Hell, Dunkel und System (Browserleiste, Systemelemente, Wechsel im Betrieb; frueher test_theme.py) und Ohne Schwarz (seit 0.70.2): Das Farbschema «Schwarz» (amoled) gibt es nicht mehr. Gespeichertes 'amoled' wird still zu Dunkel,
Auswahl bietet nur Hell, Dunkel, System, Schnellschalter bei 390 px in einer Zeile, kein [data-theme="amoled"] im geladenen CSS, Dunkel unveraendert."""
import asyncio, sys, os
os.environ.setdefault('SAVORA_TEST_PORT', '15400')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)
HIDE_SB = "document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = 'html { scrollbar-width: none } html::-webkit-scrollbar { display: none }'; document.head.appendChild(s); });"

async def new_page(p, w, h, saved=None):
    b, ctx = await open_ctx(p, w, h, 'reduce'); page = await ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    await page.add_init_script(HIDE_SB)
    if saved: await page.add_init_script(f"try{{ if (!sessionStorage.getItem('os-seeded')) {{ localStorage.setItem('savora-theme', '{saved}'); sessionStorage.setItem('os-seeded', '1'); }} }}catch(e){{}}")
    await goto(page)
    await page.evaluate("() => document.fonts.ready.then(() => 1)")
    return b, ctx, page, errs


async def theme_basis(p):
    """Hell, Dunkel und System: Farbe der Browserleiste, Systemelemente, Wechsel im Betrieb (frueher test_theme.py). Die Migration von «Schwarz» prueft main unten."""
    browser = await p.chromium.launch()
    ctx = await browser.new_context(viewport={'width': 390, 'height': 844}, color_scheme='dark', reduced_motion='reduce', timezone_id='UTC')
    await ctx.add_init_script(NO_SW + " try{localStorage.setItem('savora-splash-seen','1')}catch(e){}")
    page = await ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    await goto(page)
    n = await page.evaluate("document.querySelectorAll('meta[name=theme-color]').length")
    check('Genau eine theme-color-Angabe', n == 1, str(n))
    async def snap(theme):
        await page.evaluate(f"() => {{ state.theme = '{theme}'; applyTheme(); }}")
        return await page.evaluate("({t: document.documentElement.getAttribute('data-theme'), m: document.querySelector('meta[name=theme-color]').content, cs: getComputedStyle(document.documentElement).colorScheme})")
    for theme, exp in [('light', ('light', '#F7F4EE', 'light')), ('dark', ('dark', '#1B1A17', 'dark'))]:
        s = await snap(theme)
        check(f'{theme}: Modus, Browserleiste und Systemelemente passen', (s['t'], s['m'], s['cs']) == exp, str(s))
    s = await snap('auto')
    check('System (Telefon dunkel): App wird dunkel', s['t'] == 'dark' and s['m'] == '#1B1A17', str(s))
    await page.emulate_media(color_scheme='light'); await page.wait_for_timeout(200)
    s = await page.evaluate("({t: document.documentElement.getAttribute('data-theme'), m: document.querySelector('meta[name=theme-color]').content})")
    check('System: Wechsel des Telefons auf hell wirkt sofort', s['t'] == 'light' and s['m'] == '#F7F4EE', str(s))
    # gewaehlter Modus bleibt, auch wenn das System wechselt
    await snap('dark'); await page.emulate_media(color_scheme='light'); await page.wait_for_timeout(150)
    check('Manuelle Wahl "Dunkel" bleibt trotz hellem System', await page.evaluate("document.documentElement.getAttribute('data-theme')") == 'dark')
    check('Keine Seitenfehler', not errs, str(errs[:3]))
    await browser.close()

async def main():
    async with async_playwright() as p:
        await theme_basis(p)
        b, ctx, page, errs = await new_page(p, 390, 844, 'amoled'); ev = page.evaluate
        r = await ev("() => ({ st: state.theme, ls: localStorage.getItem(THEME_KEY), attr: document.documentElement.getAttribute('data-theme'), meta: document.querySelector('meta[name=theme-color]').content })")
        check('Gespeichertes Schwarz: Laden zeigt Dunkel, Wert wird zu dark umgeschrieben', r == {'st': 'dark', 'ls': 'dark', 'attr': 'dark', 'meta': '#1B1A17'}, str(r))
        await ev("() => { state.view = 'settings-display'; render(); }")
        r = await ev("() => ({ act: [...document.querySelectorAll('.theme-switch .theme-opt.active')].map(e => e.dataset.theme), checked: [...document.querySelectorAll('.theme-switch [aria-checked=true]')].map(e => e.dataset.theme), n: document.querySelectorAll('.theme-switch .theme-opt').length, hook: getComputedStyle(document.querySelector('.theme-switch .theme-opt.active'), '::before').content })")
        check('Darstellung: drei Optionen, Dunkel aktiv mit Haken', r['act'] == ['dark'] and r['checked'] == ['dark'] and r['n'] == 3 and r['hook'] != 'none', str(r))
        await ev("() => { state.view = 'settings-display'; render(); }")
        r = await ev("() => { const o = [...document.querySelectorAll('.theme-opt')]; const ys = new Set(o.map(e => Math.round(e.getBoundingClientRect().top))); return { labels: o.map(e => e.querySelector('.theme-opt-label').textContent.trim()), rows: ys.size, act: o.filter(e => e.classList.contains('active')).map(e => e.dataset.theme), small: o.filter(e => { const q = e.getBoundingClientRect(); return q.height < 43.5 || q.width < 43.5; }).length, sw: document.documentElement.scrollWidth <= document.documentElement.clientWidth } }")
        check('Darstellung: Hell, Dunkel, Wie dein Gerät, Dunkel aktiv, 44 px, kein Ueberlauf', r['labels'] == ['Hell', 'Dunkel', 'Wie dein Gerät'] and r['act'] == ['dark'] and r['small'] == 0 and r['sw'], str(r))
        txt = await ev("() => document.body.innerText")
        check('Darstellung: Oberflaeche nennt kein «Schwarz»', 'Schwarz' not in txt)
        await ev("() => { state.view = 'settings-display'; render(); }")
        txt = await ev("() => document.body.innerText")
        check('Darstellung: Oberflaeche nennt kein «Schwarz»', 'Schwarz' not in txt and 'OLED' not in txt)
        css = await ev("""async () => { let all = ''; for (const l of document.querySelectorAll('link[rel=stylesheet]')) all += await (await fetch(l.href)).text(); return all; }""")
        check('Geladenes CSS enthaelt kein [data-theme="amoled"]', 'amoled' not in css.lower(), str(css.lower().count('amoled')))
        # Cloud/Einstellungen liefern 'amoled': Wahl bleibt gueltig dunkel
        r = await ev("() => { state.theme = normalizeTheme('amoled'); localStorage.setItem(THEME_KEY, state.theme); applyTheme(); return [state.theme, document.documentElement.getAttribute('data-theme')]; }")
        check('normalizeTheme bildet amoled auf dark ab', r == ['dark', 'dark'], str(r))
        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await ctx.close(); await b.close()
        # Dunkel: Farben unveraendert
        b, ctx, page, errs = await new_page(p, 390, 844, 'dark'); ev = page.evaluate
        r = await ev("() => { const cs = getComputedStyle(document.body); const root = getComputedStyle(document.documentElement); return [cs.backgroundColor, root.getPropertyValue('--card-bg').trim(), root.getPropertyValue('--text').trim()]; }")
        check('Dunkel: Farben unveraendert (Seite #1B1A17, Flaeche #24231F, Text #F1EDE4)', r[0] == 'rgb(27, 26, 23)' and r[1].upper() == '#24231F' and r[2].upper() == '#F1EDE4', str(r))
        await ctx.close(); await b.close()
        # Auswahl Dunkel -> Wie dein Gerät -> Hell funktioniert (390)
        b, ctx, page, errs = await new_page(p, 390, 844); ev = page.evaluate
        await ev("() => { state.view = 'settings-display'; render(); }")
        for th in ('dark', 'auto', 'light'):
            await page.click(f'.theme-opt[data-theme="{th}"]'); await page.wait_for_timeout(250)
            r = await ev("() => [state.theme, localStorage.getItem(THEME_KEY)]")
            check(f'Wahl {th} gespeichert', r == [th, th], str(r))
        await ctx.close(); await b.close()
    print('\n' + ('ALLE OK' if not FAIL else f'{len(FAIL)} FEHLER: ' + '; '.join(FAIL[:12])))
asyncio.run(main())
sys.exit(1 if FAIL else 0)
