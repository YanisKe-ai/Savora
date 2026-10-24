"""v90 Punkt 8: Vorrat «Was kann ich kochen?» (pantry.js). Logik (pantryCanon, pantryMatches), Oberflaeche (pantryView), Aktionen
(handlePantryAction) und Abgleich-Haken (pantrySyncAll/Read/Apply). Laeuft zweimal: ohne Store «pantry» (Ersatz localStorage, wie
bei altem Stand) und mit dem Store aus dem Geruest von H1 (IndexedDB), falls dessen Stand (Branch v90-h1) verfuegbar ist.
Routen und Aktionskette baut H2; der Test haengt sie selbst ein (viewFor, handleCloudAction)."""
import asyncio, os, shutil, subprocess, sys, tempfile
os.environ.setdefault('SAVORA_TEST_PORT', '49064')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

RECIPES = """() => {
  const mk = (id, title, ings) => Object.assign(emptyRecipe(), { id, title, servings: 4, ingredients: ings.map(n => typeof n === 'string' ? { amount: '1', unit: '', name: n } : n), steps: [{ text: 'Kochen.' }] });
  state.recipes = [
    mk('a', 'Rüeblisuppe', ['Karotten', 'Zwiebel', 'Butter zum Braten', 'Salz', 'Petersilie (optional)', 'Olivenöl']),
    mk('b', 'Eierspeise', ['Eier', 'Butter', 'Schnittlauch']),
    mk('c', 'Gratin', [{ amount: '', unit: '', name: 'Sauce:' }, 'Kartoffeln', 'Rahm', 'Käse', 'Muskat']),
    mk('d', 'Dessert', ['Zucker', 'Mehl']),
    mk('e', 'Apfelkuchen', ['Mehl', 'Äpfel', 'Zwiebel']),
    mk('f', 'Abakus', ['Zwiebeln', 'Reis', 'Wasser'])
  ];
}"""
SET_ITEMS = """(names) => pantryMatches({ items: names.map(n => ({ name: n, canonical: pantryCanon(n), always: false })).concat(['Salz', 'Pfeffer', 'Wasser', 'Öl'].map(n => ({ name: n, canonical: pantryCanon(n), always: true }))) }).map(m => ({ t: m.recipe.title, miss: m.missing, have: m.have, total: m.total }))"""
ROUTE = """() => { const o = window.viewFor; window.viewFor = (v) => v === 'pantry' ? pantryView() : o(v); const c = window.handleCloudAction; window.handleCloudAction = async (a, id, el, e) => (await handlePantryAction(a, id, el, e)) || (typeof c === 'function' ? c(a, id, el, e) : false); }"""

async def run(label, directory):
    SITE.set_dir(directory)
    async with async_playwright() as p:
        browser, ctx = await open_ctx(p)
        page = await ctx.new_page()
        errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page)
        has_store = await page.evaluate("typeof dbGetAllPantry === 'function'")
        check(f'[{label}] Speicherart: ' + ('IndexedDB-Store pantry' if has_store else 'Ersatz localStorage'), True)
        # --- Namen ---
        check(f'[{label}] pantryCanon: Rüebli = Karotte (Schweizer Wort)', await page.evaluate("pantryCanon('Rüebli') === pantryCanon('Karotte')"))
        check(f'[{label}] Rüebli deckt «Karotten» (Singular/Plural)', await page.evaluate("pantryItemCovers(pantryCanon('Karotten'), pantryCanon('Rüebli'))"))
        check(f'[{label}] Zwiebeln deckt «Zwiebel» und umgekehrt', await page.evaluate("pantryItemCovers('zwiebel', 'zwiebeln') && pantryItemCovers('zwiebeln', 'zwiebel')"))
        check(f'[{label}] Ei deckt «Eier»', await page.evaluate("pantryItemCovers('eier', 'ei') && pantryItemCovers('ei', 'eier')"))
        check(f'[{label}] Zwiebel deckt NICHT «Zwiebelmett» oder Knoblauch', await page.evaluate("!pantryItemCovers('knoblauch', 'zwiebel') && !pantryItemCovers('zwiebelmett', 'zwiebel')"))
        await page.evaluate(RECIPES)
        res = await page.evaluate(SET_ITEMS, ['Rüebli', 'Zwiebeln', 'Butter'])
        by = {r['t']: r for r in res}
        a = by.get('Rüeblisuppe')
        check(f'[{label}] Rüeblisuppe: nichts fehlt (Rüebli/Karotten, Zwiebeln/Zwiebel, «Butter zum Braten», Salz+Olivenöl immer da)', a and a['miss'] == [] and a['have'] == a['total'] == 5, str(a))
        check(f'[{label}] Optionales (Petersilie optional) zaehlt nicht', a and a['total'] == 5)
        e = by.get('Eierspeise')
        check(f'[{label}] Eierspeise: fehlen Eier und Schnittlauch', e and sorted(e['miss']) == ['Eier', 'Schnittlauch'], str(e))
        check(f'[{label}] Gruppentitel «Sauce:» zaehlt nicht als Zutat', 'Gratin' not in by)   # nichts davon im Vorrat -> nicht gelistet
        res2 = await page.evaluate(SET_ITEMS, ['Rahm', 'Kartoffel'])
        g = {r['t']: r for r in res2}.get('Gratin')
        check(f'[{label}] Gratin mit Gruppentitel: 4 Zutaten, es fehlen Käse und Muskat', g and g['total'] == 4 and sorted(g['miss']) == ['Käse', 'Muskat'], str(g))
        check(f'[{label}] Nur «Immer da» im Vorrat: kein Rezept gelistet', await page.evaluate(SET_ITEMS, []) == [])
        check(f'[{label}] Rezepte ohne Treffer fehlen (Dessert bei Rüebli/Zwiebeln/Butter)', 'Dessert' not in by)
        order = [r['t'] for r in await page.evaluate(SET_ITEMS, ['Zwiebel', 'Mehl', 'Reis', 'Butter', 'Eier', 'Schnittlauch'])]
        check(f'[{label}] Sortierung: 0 fehlt zuerst (Abakus, Eierspeise nach Titel), dann mehr fehlend', order[:2] == ['Abakus', 'Eierspeise'] and order.index('Rüeblisuppe') > 1, str(order))
        # --- Oberflaeche ---
        await page.evaluate(ROUTE)
        await page.evaluate("() => { state.view = 'pantry'; render(); }")
        await page.wait_for_selector('#pantryInput', timeout=8000)
        await page.wait_for_selector('.pantry-item', state='attached', timeout=8000)   # v91.13: «Immer da» eingeklappt
        names = await page.evaluate("() => [...document.querySelectorAll('.pantry-always.is-on')].map(b => b.closest('.pantry-item').querySelector('.pantry-name').textContent)")
        check(f'[{label}] Grundausstattung «Immer da»: Salz, Pfeffer, Wasser, Öl', sorted(names) == sorted(['Salz', 'Pfeffer', 'Wasser', 'Öl']), str(names))
        check(f'[{label}] Leerer Vorrat: Hinweis statt Rezeptliste', 'Trag oben ein' in await page.inner_text('.pantry-main'))
        await page.fill('#pantryInput', 'Rüebli, Zwiebeln')
        await page.press('#pantryInput', 'Enter')
        await page.wait_for_function("() => document.querySelectorAll('.pantry-item').length >= 6")
        check(f'[{label}] Enter fuegt mehrere (Komma) hinzu', await page.evaluate("() => [...document.querySelectorAll('.pantry-name')].map(n => n.textContent).filter(t => t === 'Rüebli' || t === 'Zwiebeln').length === 2"))
        check(f'[{label}] Eingabefeld bleibt fokussiert und leer', await page.evaluate("() => document.activeElement && document.activeElement.id === 'pantryInput' && document.activeElement.value === ''"))
        await page.fill('#pantryInput', 'Butter'); await page.click('[data-action="pantry-add"]')
        await page.wait_for_selector('.pantry-card', timeout=8000)
        cards = await page.evaluate("() => [...document.querySelectorAll('.pantry-card')].map(c => c.querySelector('.pantry-card-title').textContent + ' | ' + c.querySelector('.pantry-status').textContent)")
        check(f'[{label}] Rezeptliste zeigt «Alles da» und Fehlendes', any(c.startswith('Rüeblisuppe | Alles da') for c in cards) and any(c.startswith('Eierspeise | Es fehlen: Eier, Schnittlauch') for c in cards), str(cards))
        check(f'[{label}] Doppelter Eintrag (Zwiebel = Zwiebeln) wird nicht doppelt angelegt', await page.evaluate("async () => { await pantryAdd('Zwiebel'); return pantryVisible().filter(x => x.canonical.startsWith('zwiebel')).length === 1; }"))
        # Fehlendes einkaufen
        before = await page.evaluate("() => state.shopping.length")
        await page.click('.pantry-card:has-text("Eierspeise") [data-action="pantry-shop"]')
        await page.wait_for_function("(b) => state.shopping.length > b", arg=before)
        added = await page.evaluate("() => state.shopping.filter(s => s.recipeId === 'b').map(s => s.name).sort()")
        check(f'[{label}] «Fehlendes einkaufen» legt genau Eier und Schnittlauch an', added == ['Eier', 'Schnittlauch'], str(added))
        # Abwaehlen «Immer da»: Salz nicht mehr automatisch da
        await page.click('.pantry-always-box > summary')   # v91.13: «Immer da» ist eingeklappt
        await page.wait_for_function("() => document.querySelector('.pantry-always-box').open")
        await page.click('.pantry-item:has(.pantry-name:text-is("Salz")) [data-action="pantry-always"]')
        await page.wait_for_function("() => !pantryVisible().find(x => x.name === 'Salz').always")
        res3 = await page.evaluate("() => pantryMatches().find(m => m.recipe.title === 'Rüeblisuppe')")
        check(f'[{label}] Salz abgewaehlt: Eintrag bleibt als Vorrat (deckt weiter), Zustand gespeichert', res3 is not None)
        await page.click('.pantry-item:has(.pantry-name:text-is("Salz")) [data-action="pantry-remove"]')
        await page.wait_for_function("() => !pantryVisible().some(x => x.name === 'Salz')")
        miss = await page.evaluate("() => pantryMatches().find(m => m.recipe.title === 'Rüeblisuppe').missing")
        check(f'[{label}] Salz entfernt: fehlt jetzt in der Rüeblisuppe', miss == ['Salz'], str(miss))
        # Dauerhaft: neu laden
        await page.reload(); await until(page, "typeof state !== 'undefined' && document.getElementById('app').children.length > 0")
        await page.evaluate(ROUTE)
        again = await page.evaluate("async () => { await pantryLoad(true); return pantryVisible().map(x => x.name).sort(); }")
        check(f'[{label}] Nach dem Neuladen noch da, Grundausstattung nicht erneut angelegt (Salz bleibt weg)', 'Rüebli' in again and 'Butter' in again and 'Salz' not in again and again.count('Pfeffer') == 1, str(again))
        # Abgleich-Haken
        allrecs = await page.evaluate("pantrySyncAll()")
        check(f'[{label}] pantrySyncAll liefert Datensaetze mit id, name, canonical, always, updatedAt', len(allrecs) >= 5 and all(k in allrecs[0] for k in ('id', 'updatedAt')), str(allrecs[0]))
        one = await page.evaluate("pantrySyncRead(pantryVisible()[0].id)")
        check(f'[{label}] pantrySyncRead(id) liefert den Datensatz, unbekannte ID null', one and await page.evaluate("pantrySyncRead('gibt-es-nicht')") is None)
        await page.evaluate("pantrySyncApply({ id: 'p-fremd', name: 'Fremdkost', canonical: 'fremdkost', always: false, updatedAt: Date.now() }, false)")
        check(f'[{label}] pantrySyncApply uebernimmt fremden Eintrag', await page.evaluate("pantryVisible().some(x => x.id === 'p-fremd')"))
        await page.evaluate("pantrySyncApply({ id: 'p-fremd', name: 'Aelter', canonical: 'aelter', always: false, updatedAt: 5 }, false)")
        check(f'[{label}] Aelterer fremder Stand ueberschreibt nicht', await page.evaluate("pantryVisible().find(x => x.id === 'p-fremd').name === 'Fremdkost'"))
        await page.evaluate("pantrySyncApply({ id: 'p-fremd' }, true)")
        check(f'[{label}] Geloeschter fremder Eintrag verschwindet', await page.evaluate("!pantryVisible().some(x => x.id === 'p-fremd')"))
        check(f'[{label}] Keine Seitenfehler', not errs, str(errs[:3]))
        await browser.close()

async def until(page, js, secs=20):
    for _ in range(secs * 5):
        if await page.evaluate('() => !!(' + js + ')'): return True
        await page.wait_for_timeout(200)
    return False

async def main():
    await run('ohne Store', ROOT)
    h1 = subprocess.run(['git', 'rev-parse', '--verify', '-q', 'v90-h1'], cwd=ROOT, capture_output=True, text=True)
    if h1.returncode == 0:
        tmp = tempfile.mkdtemp(prefix='savora-v90-vorrat-')
        arc = subprocess.run(['git', 'archive', 'HEAD'], cwd=ROOT, capture_output=True, check=True).stdout
        subprocess.run(['tar', '-x', '-C', tmp], input=arc, check=True)
        for f in ('pantry.js', 'mealplan-ics.js', 'csp-compat.js', 'theme-init.js'):
            shutil.copy(os.path.join(ROOT, f), os.path.join(tmp, f))
        for f in ('db.js', 'utils.js'):
            open(os.path.join(tmp, f), 'wb').write(subprocess.run(['git', 'show', 'v90-h1:' + f], cwd=ROOT, capture_output=True, check=True).stdout)
        shutil.copy(os.path.join(ROOT, 'index.html'), os.path.join(tmp, 'index.html'))
        await run('mit Store (H1-Geruest)', tmp)
        shutil.rmtree(tmp, ignore_errors=True)
    else:
        print('HINWEIS Branch v90-h1 nicht gefunden: Store-Lauf uebersprungen')
    print('\n%d Fehler' % len(FAIL) if FAIL else '\nAlles gruen')
    sys.exit(1 if FAIL else 0)

asyncio.run(main())
