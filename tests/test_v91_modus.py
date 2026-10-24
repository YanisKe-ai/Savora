"""v91.2: Hell/Dunkel-Schnellschalter oben rechts auf «Mehr» (nur ein Symbol).
v91.5: farbige Symbol-Kacheln je Gruppe (hell und dunkel, Kontrast) und Profilkarte oben.
v91.6: Kacheln zwei nebeneinander, kein Überlauf, Titel ganz lesbar; Profilbild aus gemerktem Profil."""
import asyncio, os, sys
os.environ.setdefault('SAVORA_TEST_PORT', '8968')
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

async def main():
    async with async_playwright() as p:
        for w, h in [(390, 844), (320, 640), (1280, 800)]:
            b, ctx = await open_ctx(p, w=w, h=h)
            page = await ctx.new_page(); errs = []
            page.on('pageerror', lambda e: errs.append(str(e)))
            await goto(page)
            await page.evaluate("() => { state.theme = 'light'; applyTheme(); state.view = 'more'; render(); }")
            await page.wait_for_selector('.theme-quick-toggle')
            g = await page.evaluate("""() => { const btn = document.querySelector('.theme-quick-toggle'), h1 = document.querySelector('.page-title'); const a = btn.getBoundingClientRect(), t = h1.getBoundingClientRect();
              return { n: document.querySelectorAll('.theme-quick-toggle').length, w: a.width, h: a.height, rightGap: Math.abs(document.querySelector('.settings-group-card').getBoundingClientRect().right - a.right), sameRow: Math.abs((a.top + a.bottom) / 2 - (t.top + t.bottom) / 2) < 12, right: a.left > t.right,
                text: btn.innerText.trim(), label: btn.getAttribute('aria-label'), svg: !!btn.querySelector('svg'), W: document.documentElement.scrollWidth, iw: innerWidth }; }""")
            check(f'[{w}] ein Symbol-Knopf oben rechts neben «Mehr» (bündig mit den Karten), ohne Text, mit Beschriftung für Bildschirmleser', g['n'] == 1 and g['svg'] and not g['text'] and g['sameRow'] and g['right'] and g['rightGap'] <= 2 and g['label'] == 'Dunklen Modus einschalten', str(g))
            col = await page.evaluate("() => { const c = getComputedStyle(document.querySelector('.theme-quick-toggle')), card = getComputedStyle(document.querySelector('.settings-group-card > .settings-row')); return [c.backgroundColor, card.backgroundColor]; }")
            check(f'[{w}] Knopf im hellen Modus hell (gleiche Fläche wie die Karten)', col[0] == col[1], str(col))
            check(f'[{w}] Knopf mindestens 44 px, kein seitlicher Überlauf', g['w'] >= 44 and g['h'] >= 44 and g['W'] <= g['iw'], str(g))
            await page.click('.theme-quick-toggle')
            await page.wait_for_function("document.documentElement.getAttribute('data-theme') === 'dark' && document.querySelector('.theme-quick-toggle') && document.querySelector('.theme-quick-toggle').getAttribute('data-theme-next') === 'light'", timeout=5000)
            st = await page.evaluate("() => ({ theme: state.theme, ls: localStorage.getItem(THEME_KEY), label: document.querySelector('.theme-quick-toggle').getAttribute('aria-label'), view: state.view })")
            check(f'[{w}] Tippen: dunkel, gespeichert, Symbol wechselt auf Sonne, bleibt auf «Mehr»', st['theme'] == 'dark' and st['ls'] == 'dark' and st['label'] == 'Hellen Modus einschalten' and st['view'] == 'more', str(st))
            await page.wait_for_function("!document.documentElement.classList.contains('theme-transitioning')", timeout=5000)
            await page.click('.theme-quick-toggle')
            await page.wait_for_function("document.documentElement.getAttribute('data-theme') === 'light'", timeout=5000)
            check(f'[{w}] nochmals Tippen: wieder hell', await page.evaluate("state.theme") == 'light')
            await page.evaluate("() => { state.theme = 'auto'; applyTheme(); render(); }")
            eff = await page.evaluate("() => ({ eff: document.documentElement.getAttribute('data-theme'), next: document.querySelector('.theme-quick-toggle').getAttribute('data-theme-next') })")
            check(f'[{w}] «Wie System»: Knopf schaltet in den jeweils anderen Modus', eff['next'] != eff['eff'], str(eff))
            for mode in ['light', 'dark']:
                await page.evaluate(f"() => {{ state.theme = '{mode}'; applyTheme(); state.view = 'more'; render(); }}")
                t = await page.evaluate("""() => {
                  const lum = c => { const m = c.match(/[\\d.]+/g).map(Number).slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
                  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
                  return Array.from(document.querySelectorAll('.settings-group--tone')).map(g => { const i = g.querySelector('.settings-row-icon'); const cs = getComputedStyle(i); const r = i.getBoundingClientRect();
                    return { t: g.querySelector('.settings-group-title').textContent.trim(), bg: cs.backgroundColor, ratio: Math.round(ratio(cs.color, cs.backgroundColor) * 10) / 10, size: r.width }; }); }""")
                check(f'[{w}/{mode}] vier Gruppen mit eigener Kachelfarbe', len(t) == 4 and len(set(x['bg'] for x in t)) == 4, str(t))
                check(f'[{w}/{mode}] Symbole auf den Kacheln gut lesbar (Kontrast ab 4,5) und mindestens 32 px', all(x['ratio'] >= 4.5 and x['size'] >= 32 for x in t), str(t))
            pc = await page.evaluate("""() => { const c = document.querySelector('.more-profile'), h1 = document.querySelector('.page-title-row'), g = document.querySelector('.settings-group');
              const r = c.getBoundingClientRect(); return { below: r.top >= h1.getBoundingClientRect().bottom - 1 && r.bottom <= g.getBoundingClientRect().top + 1, h: r.height, name: c.querySelector('.more-profile-name').textContent.trim(), status: c.querySelector('.more-profile-status').textContent.trim(), pic: !!c.querySelector('.more-profile-pic') }; }""")
            check(f'[{w}] Profilkarte zwischen Titel und erster Gruppe, mit Bild/Buchstabe, Name und Status', pc['below'] and pc['pic'] and pc['name'] and 'angemeldet' in pc['status'] and pc['h'] >= 44, str(pc))
            await page.evaluate("() => { lib.pubProfile = { data: { display_name: 'Yanis', avatar_path: 'preset:03' } }; render(); }")
            pc2 = await page.evaluate("() => ({ name: document.querySelector('.more-profile-name').textContent.trim(), src: (document.querySelector('img.more-profile-pic') || {}).getAttribute ? document.querySelector('img.more-profile-pic').getAttribute('src') : '' })")
            check(f'[{w}] Profilkarte zeigt Name und gewähltes Profilbild', pc2['name'] == 'Yanis' and 'profilbilder/' in (pc2['src'] or ''), str(pc2))
            await page.click('.more-profile'); await page.wait_for_function("state.view === 'settings-account'", timeout=5000)
            check(f'[{w}] Profilkarte öffnet «Mein Konto»', True)
            await page.evaluate("() => { lib.pubProfile = { data: undefined }; state.theme = 'light'; applyTheme(); state.view = 'more'; render(); }")
            k = await page.evaluate("""() => { const rows = Array.from(document.querySelectorAll('.more-page .settings-group-card > .settings-row')); const xs = new Set(rows.map(r => Math.round(r.getBoundingClientRect().left)));
              return { n: rows.length, cols: xs.size, W: document.documentElement.scrollWidth, iw: innerWidth, out: rows.filter(r => r.getBoundingClientRect().right > innerWidth + 0.5).length,
                cut: rows.filter(r => { const t = r.querySelector('.settings-row-title'); return t.scrollWidth > t.clientWidth + 1 || t.scrollHeight > t.clientHeight + 1; }).map(r => r.querySelector('.settings-row-title').textContent),
                h: rows.map(r => r.getBoundingClientRect().height), titles: Array.from(document.querySelectorAll('.more-page .settings-group-title')).map(t => t.textContent.trim()) }; }""")
            check(f'[{w}] Kacheln zwei nebeneinander, kein seitlicher Überlauf, Titel ganz lesbar, mindestens 44 px hoch', k['n'] == 10 and k['cols'] == 2 and k['W'] <= k['iw'] and not k['out'] and not k['cut'] and min(k['h']) >= 44, str(k))
            check(f'[{w}] Gruppenüberschriften bleiben für Bildschirmleser', k['titles'] == ['Daten', 'Teilen', 'Werkzeuge', 'App'], str(k['titles']))
            check(f'[{w}] keine Seitenfehler', not errs, str(errs[:2]))
            if w == 390:
                await page.evaluate("() => { state.theme = 'light'; applyTheme(); render(); }"); await page.screenshot(path=os.path.join(OUT, 'mehr-hell-390.png'))
                await page.evaluate("() => { state.theme = 'dark'; applyTheme(); render(); }"); await page.screenshot(path=os.path.join(OUT, 'mehr-dunkel-390.png'))
            await b.close()
    print('\nFEHLGESCHLAGEN:', ', '.join(FAIL) if FAIL else 'keine'); sys.exit(1 if FAIL else 0)
asyncio.run(main())
