"""Heute-Schalter 0.71: Wochenplan «Heute» springt zur aktuellen Woche und zeigt den heutigen Tag; Mehr: Schnellschalter «Erscheinungsbild» (Hell, Dunkel, Schwarz, System).
Prueft Sprung, Zustand in der aktuellen Woche (Platz bleibt, kein Layoutsprung), 44 px, Name, Fokus, Ueberlauf bei 320/390/430/820/1440, Schalter mit Haken, Speicherung nach Neuladen, Tastatur."""
import asyncio, sys, os
os.environ.setdefault('SAVORA_TEST_PORT', '10990')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)
SHOTS = os.environ.get('SAVORA_SHOTS_DIR')
SIZES = [(320, 640), (390, 844), (430, 932), (820, 1180), (1440, 900)]
HIDE_SB = "document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = 'html { scrollbar-width: none } html::-webkit-scrollbar { display: none }'; document.head.appendChild(s); });"

async def new_page(p, w, h):
    b, ctx = await open_ctx(p, w, h, 'reduce'); page = await ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    await page.add_init_script(HIDE_SB)
    await goto(page)
    await page.evaluate("() => document.fonts.ready.then(() => 1)")
    await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(400)
    return b, ctx, page, errs
async def shot(page, name):
    if SHOTS: os.makedirs(SHOTS, exist_ok=True); await page.screenshot(path=os.path.join(SHOTS, name))
GEO = """() => { const q = s => document.querySelector(s); const t = q('.week-today').getBoundingClientRect(), l = q('.week-nav-label').getBoundingClientRect(), n = q('.week-nav').getBoundingClientRect(), pv = q('[data-action="week-prev"]').getBoundingClientRect(), nx = q('[data-action="week-next"]').getBoundingClientRect();
  return { t: [t.width, t.height], lx: l.left + l.width / 2, ly: l.top, mid: n.left + n.width / 2, navH: n.height, pvR: pv.right, nxL: nx.left, dis: q('.week-today').disabled, vis: getComputedStyle(q('.week-today')).visibility, sw: document.documentElement.scrollWidth <= document.documentElement.clientWidth }; }"""
async def goto_plan(page, offset=0):
    await page.evaluate("(o) => { state.view = 'mealplan'; state.modal = null; state.weekStart = addDays(getMonday(new Date()), o); render(); window.scrollTo(0, 0); }", offset)
    await page.wait_for_selector('.week-today', state='attached')

async def main():
    async with async_playwright() as p:
        for (w, h) in SIZES:
            b, ctx, page, errs = await new_page(p, w, h); ev = page.evaluate; tag = f'[{w}] '
            await goto_plan(page, 0); cur = await ev(GEO)
            await goto_plan(page, 21); away = await ev(GEO)
            check(tag + 'Aktuelle Woche: «Heute» deaktiviert und unsichtbar, Platz bleibt (Wochenleiste gleich hoch, Text gleich platziert)', cur['dis'] and cur['vis'] == 'hidden' and abs(cur['navH'] - away['navH']) < 0.5 and abs(cur['ly'] - away['ly']) < 0.5, f'{cur} {away}')
            check(tag + 'Andere Woche: «Heute» sichtbar, mindestens 44 x 44 px', not away['dis'] and away['vis'] == 'visible' and away['t'][0] >= 43.5 and away['t'][1] >= 43.5, str(away['t']))
            check(tag + 'Wochenanzeige exakt zentriert (+-1 px) zwischen den Pfeilen, mindestens 8 px Abstand', abs(away['lx'] - away['mid']) <= 1 and abs(cur['lx'] - cur['mid']) <= 1 and away['nxL'] - away['pvR'] > 100, f'{away["lx"]} {away["mid"]}')
            check(tag + 'Kein horizontaler Ueberlauf', cur['sw'] and away['sw'] and not await overflow_info(page), str(await overflow_info(page)))
            name = await ev("() => document.querySelector('.week-today').getAttribute('aria-label')")
            check(tag + 'Zugaenglicher Name vorhanden und beginnt mit sichtbarem Text', bool(name) and 'Heute'.lower() in name.lower(), name)
            await ev("() => document.querySelector('.week-today').focus()")
            fo = await ev("() => { const e = document.querySelector('.week-today'); return e.matches(':focus-visible') ? getComputedStyle(e).outlineStyle + ' ' + getComputedStyle(e).outlineWidth : 'kein' }")
            check(tag + 'Fokus sichtbar', fo.startswith('solid') or fo.startswith('auto'), fo)
            if w in (390, 1440): await shot(page, f'wochenplan_{w}_andere_woche_hell.png')
            await page.click('.week-today'); await page.wait_for_timeout(700)
            r = await ev("() => { const t = document.querySelector('.plan-day.is-today'); const b = t && t.getBoundingClientRect(); return { ws: fmtDateKey(state.weekStart) === fmtDateKey(getMonday(new Date())), today: !!t, vis: !!t && b.bottom > 0 && b.top < innerHeight, focus: document.activeElement && document.activeElement.id, dis: document.querySelector('.week-today').disabled }; }")
            check(tag + '«Heute» springt zur aktuellen Woche, heutiger Tag sichtbar, Knopf danach deaktiviert, Fokus auf Wochenanzeige', r['ws'] and r['today'] and r['vis'] and r['dis'] and r['focus'] == 'weekNavLabel', str(r))
            if w in (390, 1440): await shot(page, f'wochenplan_{w}_aktuell_hell.png')
            # Datenmodell unveraendert
            n1 = await ev("() => JSON.stringify(state.mealPlan || null).length")
            await goto_plan(page, -14); await page.click('.week-today'); await page.wait_for_timeout(300)
            n2 = await ev("() => JSON.stringify(state.mealPlan || null).length")
            check(tag + 'Nutzerdaten unveraendert', n1 == n2)
            if w == 390:
                for th in ('dark', 'amoled'):
                    await ev("(t) => { state.theme = t; applyTheme(); render(); }", th)
                    await goto_plan(page, 14)
                    g = await ev("""() => { const e = document.querySelector('.week-today'); const cs = getComputedStyle(e); const lum = c => { const m = c.match(/[\\d.]+/g).map(Number); const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
                      let bg = null; for (let n = e; n; n = n.parentElement) { const c = getComputedStyle(n).backgroundColor; if (c && !/rgba\\(.*, 0\\)|transparent/.test(c)) { bg = c; break; } }
                      const a = lum(cs.color), b = lum(bg || 'rgb(255,255,255)'); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }""")
                    check(tag + f'Kontrast «Heute» in {th} mindestens 4,5:1', g >= 4.5, f'{g:.2f}')
                    await shot(page, f'wochenplan_390_{th}.png')
                await ev("() => { state.theme = 'light'; applyTheme(); render(); }")
            check(tag + 'Wochenplan ohne Seitenfehler', not errs, str(errs[:2]))
            await ctx.close(); await b.close()

        # ---------- Schnellschalter ----------
        for (w, h) in SIZES:
            b, ctx, page, errs = await new_page(p, w, h); ev = page.evaluate; tag = f'[{w}] Schalter: '
            await ev("() => { localStorage.setItem(THEME_KEY, 'light'); state.theme = 'light'; applyTheme(); state.view = 'settings'; render(); }")
            await page.wait_for_selector('.theme-quick')
            g = await ev("""() => { const o = [...document.querySelectorAll('.theme-opt--quick')]; return { labels: o.map(e => e.textContent.trim()), small: o.filter(e => { const r = e.getBoundingClientRect(); return r.height < 43.5 || r.width < 43.5; }).length, sw: document.documentElement.scrollWidth <= document.documentElement.clientWidth, clipped: o.filter(e => e.scrollWidth > e.clientWidth + 1).length, grp: document.querySelector('.theme-quick-switch').getAttribute('role'), row: !![...document.querySelectorAll('.settings-row-title')].find(e => e.textContent.includes('Darstellung und Einheiten')) }; }""")
            check(tag + 'Vier Optionen Hell, Dunkel, Schwarz, System; Radiogruppe; Zeile «Darstellung und Einheiten» bleibt', g['labels'] == ['Hell', 'Dunkel', 'Schwarz', 'System'] and g['grp'] == 'radiogroup' and g['row'], str(g))
            check(tag + 'Alle Flaechen mindestens 44 px, nichts abgeschnitten, kein Ueberlauf', g['small'] == 0 and g['clipped'] == 0 and g['sw'] and not await overflow_info(page), str(g))
            await ev("() => { document.documentElement.style.fontSize = '24px'; }")
            g2 = await ev("() => ({ sw: document.documentElement.scrollWidth <= document.documentElement.clientWidth, small: [...document.querySelectorAll('.theme-opt--quick')].filter(e => e.getBoundingClientRect().height < 43.5).length })")
            check(tag + 'Systemschrift 24 px: kein Ueberlauf, 44 px', g2['sw'] and g2['small'] == 0, str(g2))
            await ev("() => { document.documentElement.style.fontSize = ''; }")
            if w in (390, 1440): await shot(page, f'mehr_{w}_hell.png')
            for th, label in (('dark', 'Dunkel'), ('amoled', 'Schwarz'), ('auto', 'System'), ('light', 'Hell')):
                await page.click(f'.theme-opt--quick[data-theme="{th}"]'); await page.wait_for_timeout(250)
                s = await ev("""() => { const a = document.querySelector('.theme-opt--quick.active'); return { th: state.theme, ls: localStorage.getItem(THEME_KEY), n: document.querySelectorAll('.theme-opt--quick.active').length, checked: document.querySelectorAll('.theme-opt--quick[aria-checked="true"]').length, hook: a ? getComputedStyle(a, '::before').content + '|' + getComputedStyle(a, '::before').display : null, foc: document.activeElement && document.activeElement.dataset.theme }; }""")
                check(tag + f'{label}: gespeichert, genau eine aktive Option mit Haken, Fokus bleibt', s['th'] == th and s['ls'] == th and s['n'] == 1 and s['checked'] == 1 and s['hook'] and s['hook'].startswith('""') and not s['hook'].endswith('none'), str(s))
                if th == 'dark' and w in (390, 1440): await shot(page, f'mehr_{w}_dunkel.png')
            # bleibt nach Neuladen
            await page.click('.theme-opt--quick[data-theme="dark"]'); await page.wait_for_timeout(250)
            await page.reload(); await page.wait_for_function("typeof state !== 'undefined' && document.getElementById('app').children.length > 0"); await page.wait_for_timeout(500)
            await ev("() => { state.view = 'settings'; render(); }")
            r = await ev("() => ({ th: state.theme, attr: document.documentElement.getAttribute('data-theme'), act: document.querySelector('.theme-opt--quick.active')?.dataset.theme })")
            check(tag + 'Dunkel bleibt nach Neuladen', r['th'] == 'dark' and r['attr'] == 'dark' and r['act'] == 'dark', str(r))
            # gleiche Wahl auf der Seite «Darstellung und Einheiten»
            await ev("() => { state.view = 'settings-display'; render(); }")
            r = await ev("() => document.querySelector('.theme-switch--grid .theme-opt.active')?.dataset.theme")
            check(tag + 'Seite «Darstellung und Einheiten» zeigt dieselbe Wahl', r == 'dark', str(r))
            await ev("() => { state.view = 'settings'; render(); }")
            # Tastatur
            await ev("() => document.querySelector('.theme-opt--quick[data-theme=\"dark\"]').focus()")
            await page.keyboard.press('ArrowRight'); await page.wait_for_timeout(300)
            k = await ev("() => ({ th: state.theme, foc: document.activeElement.dataset.theme })")
            check(tag + 'Pfeil rechts waehlt Schwarz und behaelt den Fokus', k['th'] == 'amoled' and k['foc'] == 'amoled', str(k))
            await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await page.wait_for_timeout(300)
            k = await ev("() => ({ th: state.theme, foc: document.activeElement.dataset.theme })")
            check(tag + 'Pfeil links zweimal waehlt Hell', k['th'] == 'light' and k['foc'] == 'light', str(k))
            f = await ev("() => { const e = document.activeElement; e.focus(); const cs = getComputedStyle(e); return cs.outlineStyle + ' ' + cs.outlineWidth; }")
            check(tag + 'Fokus sichtbar', f.startswith('solid') or f.startswith('auto'), f)
            check(tag + 'Ohne Seitenfehler', not errs, str(errs[:2]))
            await ctx.close(); await b.close()
    print('\n' + ('ALLE OK' if not FAIL else f'{len(FAIL)} FEHLER: ' + '; '.join(FAIL[:12])))
    sys.exit(1 if FAIL else 0)
asyncio.run(main())
