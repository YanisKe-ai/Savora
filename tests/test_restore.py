"""Sicherung wiederherstellen: nichts geht verloren, nichts wird verdoppelt, nichts wird ueberschrieben."""
import asyncio, sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

async def main():
    async with async_playwright() as p:
        browser, ctx = await open_ctx(p, 390, 844)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(500)
        ev = page.evaluate
        # Sicherung als Datei erzeugen
        await ev("""async () => { let blob = null; const orig = URL.createObjectURL; URL.createObjectURL = (b) => { blob = b; return orig.call(URL, b); }; await downloadBackup(); URL.createObjectURL = orig; window.__bk = blob; }""")
        snap = lambda: ev("""async () => ({ ids: (await dbGetAll()).map(r => r.id).sort(), titles: (await dbGetAll()).map(r => r.title).sort(), shop: (await dbGetAllShopping()).length,
            plan: (await dbGetAllMealplan()).reduce((a, d) => a + (d.entries || d.recipeIds || []).length, 0) })""")
        restore = lambda: ev("""async () => { state.view = 'settings-backup'; render(); await restoreBackupFromFile(new File([window.__bk], 'b.json', { type: 'application/json' })); await new Promise(r => setTimeout(r, 300)); return (document.getElementById('backupStatus') || {}).textContent || ''; }""")
        base = await snap()
        # 1) Auf demselben Geraet, nichts veraendert: keine Verdopplung
        msg = await restore(); after = await snap()
        check('Unverändert wiederherstellen: keine Verdopplung (Rezepte, Einkauf, Wochenplan)', after == base, f"{len(base['ids'])} -> {len(after['ids'])}, Einkauf {base['shop']} -> {after['shop']}, Plan {base['plan']} -> {after['plan']}")
        # 2) Nochmal: bleibt stabil (idempotent)
        await restore(); after2 = await snap()
        check('Zweimal wiederherstellen ändert nichts', after2 == base)
        # 3) Ein Rezept geloescht: kommt mit Original-ID zurueck, die anderen bleiben
        await ev("dbDelete('r_legacy_2').then(() => loadRecipes())")
        await restore(); a3 = await snap()
        check('Gelöschtes Rezept kommt mit seiner ursprünglichen ID zurück', a3['ids'] == base['ids'], str(a3['ids']))
        # 4) Ein Rezept veraendert: die Sicherungsversion bleibt als Kopie, nichts wird ueberschrieben
        await ev("() => { const r = state.recipes.find(x => x.id === 'r_legacy_1'); r.title = 'Sloppy Joe VERÄNDERT'; return dbPut(r).then(() => loadRecipes()); }")
        await restore(); a4 = await snap()
        check('Verändertes Rezept bleibt unangetastet, alte Fassung kommt als Kopie dazu', len(a4['ids']) == len(base['ids']) + 1 and 'Sloppy Joe VERÄNDERT' in a4['titles'] and a4['titles'].count('Sloppy Joe Buns') == 1, str(a4['titles']))
        # 5) Meldung nennt uebersprungene Rezepte
        check('Meldung sagt, dass Rezepte schon vorhanden waren', 'schon vorhanden' in msg, msg)
        # 6) Frisches Geraet: alles mit Original-IDs
        b2, c2 = await open_ctx(p, 390, 844); p2 = await c2.new_page(); await goto(p2)
        await p2.evaluate("(t) => { window.__txt = t }", await ev("window.__bk.text()"))
        await p2.evaluate("""async () => { await restoreBackupFromFile(new File([window.__txt], 'b.json', { type: 'application/json' })); }""")
        await p2.wait_for_timeout(500)
        ids2 = await p2.evaluate("dbGetAll().then(l => l.map(r => r.id).sort())")
        check('Frisches Gerät: alle Rezepte mit ihren Original-IDs', ids2 == base['ids'], str(ids2))
        await b2.close()
        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await browser.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
