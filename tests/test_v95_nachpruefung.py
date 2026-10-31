"""v0.95: Befunde der unabhängigen Prüfung. Timer-Alarm nimmt ausserhalb des Kochmodus nicht den Fokus und nennt das Rezept,
«Als gekocht speichern» beendet nur die eigenen Timer, gelöschtes Rezept zeigt keine Timer-Anzeige, lange Rückgängig-Meldung bleibt im Bild,
Wochenplan «Am Folgetag nochmals» bei Einträgen, die nicht heute sind."""
import asyncio, os, sys
os.environ.setdefault('SAVORA_TEST_PORT', '64600')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

async def main():
    async with async_playwright() as p:
        b, ctx = await open_ctx(p, 360, 780)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.evaluate("() => loadRecipes().then(() => render())")
        ids = await page.evaluate("() => state.recipes.slice(0, 2).map(r => r.id)")
        # Timer von Rezept A läuft, Nutzer tippt im Einkauf in ein Feld; Timer läuft ab
        await page.evaluate("""(a) => { state.activeRecipeId = a; startTimer(a + '-0-seg0', 60); state.view = 'shopping'; render(); }""", ids[0])
        await page.wait_for_selector('#app input')
        await page.focus('#app input')
        await page.evaluate("(a) => { const t = state.timers[a + '-0-seg0']; t.endTime = Date.now() - 1000; tickTimer(a + '-0-seg0'); }", ids[0])
        await page.wait_for_selector('#cookAlarm')
        st = await page.evaluate("() => ({ tag: document.activeElement && document.activeElement.tagName, txt: document.getElementById('cookAlarmText').textContent })")
        check('Alarm ausserhalb des Kochmodus nimmt dem Eingabefeld nicht den Fokus', st['tag'] == 'INPUT', st)
        title = await page.evaluate("(a) => state.recipes.find(r => r.id === a).title", ids[0])
        check('Alarm nennt das Rezept', st['txt'].startswith(title + ':'), st['txt'])
        await page.evaluate("() => cookAlarmStop()")
        # «Als gekocht speichern» bei Rezept B beendet den Timer von A nicht
        await page.evaluate("""([a, b2]) => { state.activeRecipeId = a; startTimer(a + '-1-seg0', 300); state.activeRecipeId = b2; startTimer(b2 + '-0-seg0', 300); }""", ids)
        await page.evaluate("(b2) => { state.activeRecipeId = b2; state.view = 'cookmode'; state.cookFinished = true; render(); }", ids[1])
        await page.evaluate("""(b2) => { const el = document.createElement('button'); el.dataset.action = 'cook-complete'; el.dataset.id = b2;
            return dispatchAction('cook-complete', b2, el, { currentTarget: el, target: el, stopPropagation() {}, preventDefault() {} }); }""", ids[1])
        tm = await page.evaluate("([a, b2]) => ({ a: !!state.timers[a + '-1-seg0'], b: !!state.timers[b2 + '-0-seg0'] })", ids)
        check('Als gekocht speichern: eigener Timer beendet, fremder läuft weiter', tm['a'] and not tm['b'], tm)
        # Rezept A gelöscht: keine Timer-Anzeige
        await page.evaluate("() => { state.view = 'home'; render(); }")
        await page.wait_for_timeout(300)
        before = await page.evaluate("() => { const d = document.querySelector('.timer-dock'); return !!d && getComputedStyle(d).display !== 'none' && !d.hidden; }")
        await page.evaluate("(a) => { state.recipes = state.recipes.filter(r => r.id !== a); render(); }", ids[0])
        await page.wait_for_timeout(500)
        after = await page.evaluate("() => { const d = document.querySelector('.timer-dock'); return !!d && !d.hidden && !d.classList.contains('is-hidden') && getComputedStyle(d).display !== 'none' && getComputedStyle(d).visibility !== 'hidden' && parseFloat(getComputedStyle(d).opacity) > 0.1; }")
        check('Anzeige vorher sichtbar, nach Löschen des Rezepts weg', before and not after, [before, after])
        # Lange Rückgängig-Meldung: Knopf im Bild
        await page.evaluate("() => showUndoToast('Verknüpfung entfernt. Beide Rezepte bleiben erhalten.', () => {}, () => {})")
        m = await page.evaluate("() => { const t = document.querySelector('.toast-undo'); const r = t.getBoundingClientRect(); const bt = t.querySelector('button').getBoundingClientRect(); return { l: r.left, r: r.right, br: bt.right, bh: bt.height, W: document.documentElement.clientWidth }; }")
        check('Lange Rückgängig-Meldung: Meldung und Knopf im Bild', m['l'] >= 0 and m['r'] <= m['W'] and m['br'] <= m['W'], m)
        check('keine Seitenfehler', not errs, errs)
        await b.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
    sys.exit(1 if FAIL else 0)

asyncio.run(main())
