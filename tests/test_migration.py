import asyncio, json, os, sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *

SEED = r"""
async () => {
  const c = document.createElement('canvas'); c.width = 1200; c.height = 800;
  const x = c.getContext('2d'); x.fillStyle = '#c9832f'; x.fillRect(0,0,1200,800); x.fillStyle='#2c4534'; x.fillRect(0,0,600,800);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
  const dataUrl = c.toDataURL('image/jpeg', 0.6);
  const imgId = 'img_legacy_1';
  await dbPutImage({ id: imgId, blob, thumbBlob: blob, mime: 'image/jpeg' });
  const recipes = [];
  const r1 = emptyRecipe(); r1.id = 'r_legacy_1'; r1.title = 'Sloppy Joe Buns'; r1.servings = 9; r1.imageId = imgId; r1.favorite = true;
  r1.ingredients = [ {amount:'', unit:'', name:'Teig:'}, {amount:'250', unit:'ml', name:'Milch, lauwarm'}, {amount:'15', unit:'g', name:'Honig'},
    {amount:'', unit:'', name:'Füllung:'}, {amount:'500', unit:'g', name:'Hackfleisch'}, {amount:'2', unit:'', name:'Zwiebeln'} ];
  r1.steps = [{text:'Milch und Honig verrühren.'},{text:'Hackfleisch mit den Zwiebeln 10 Minuten anbraten.'},{text:'Backen.'}];
  r1.notes = 'Mit Sesam bestreuen.'; r1.tags = ['Backen']; r1.diet = []; r1.legacyCustomField = {keep: 'me'};
  const r2 = emptyRecipe(); r2.id = 'r_legacy_2'; r2.title = 'Carbonara'; r2.image = dataUrl; r2.timeMinutes = 10;
  r2.ingredients = [{amount:'200', unit:'g', name:'Spaghetti'},{amount:'1', unit:'', name:'Zwiebel'}]; r2.steps = [{text:'Kochen.'}]; r2.tags=['Schnell'];
  const r3 = emptyRecipe(); r3.id = 'r_legacy_3'; r3.title = 'Gemüse-Curry'; r3.diet = ['vegan']; r3.ingredients=[{amount:'1', unit:'Stk', name:'Zwiebel'}]; r3.steps=[{text:'Alles köcheln.'}];
  for (const r of [r1, r2, r3]) { await dbPut(r); }
  await dbPutMealplanDay({ date: fmtDateKey(getMonday(new Date())), recipeIds: ['r_legacy_1','r_legacy_2'], legacyDayField: 7 });
  await dbPutShopping({ id: 's_legacy_1', name: 'Milch', amount: 1, unit: 'l', checked: false, recipeId: null, createdAt: Date.now() });
  localStorage.setItem('savora-theme', 'light'); localStorage.setItem('savora-cookbook-title', 'Yanis Kochbuch'); localStorage.setItem('savora-unit-system', 'metric');
  await loadRecipes(); await loadShopping(); await loadMealplan(); render();
  return true;
}
"""
SNAP = r"""
async () => {
  const recipes = (await dbGetAll()).sort((a,b)=>a.id.localeCompare(b.id));
  return {
    ids: recipes.map(r => r.id),
    raw: recipes.map(r => JSON.stringify(r)),
    shopping: (await dbGetAllShopping()).map(s => s.id),
    plan: await dbGetAllMealplan(),
    image: !!(await dbGetImage('img_legacy_1')),
    ls: ['savora-theme','savora-cookbook-title','savora-unit-system'].map(k => localStorage.getItem(k)),
    dbVersion: (await openDB()).version,
  };
}
"""
async def main():
    SITE.set_dir(old_checkout())   # ALTER Stand = frueherer Git-Commit (OLD_COMMIT in common.py)
    async with async_playwright() as p:
        browser, ctx = await open_ctx(p)
        page = await ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        await goto(page)
        await page.evaluate(SEED)
        before = await page.evaluate(SNAP)
        # alte Sicherung mit der ALTEN App erzeugen
        async with page.expect_download() as dl:
            await page.evaluate("downloadBackup()")
        d = await dl.value
        await d.save_as(OUT + '/old-backup.json')
        print("VORHER ids:", before['ids'], "dbVersion", before['dbVersion'])

        # Umschalten auf NEUE App (gleiche Origin, gleiche IndexedDB)
        SITE.set_dir(ROOT)   # jetzt die NEUE App unter gleicher Origin ausliefern
        cdp = await ctx.new_cdp_session(page)
        await cdp.send('Network.clearBrowserCache')
        await cdp.send('Network.setCacheDisabled', {'cacheDisabled': True})
        await goto(page)
        after = await page.evaluate(SNAP)
        assert after['ids'] == before['ids'], "Rezept-IDs geaendert!"
        assert after['raw'] == before['raw'], "Rohdaten beim reinen Oeffnen veraendert!"
        assert after['shopping'] == before['shopping'] and after['image'] and after['ls'] == before['ls']
        # F01-Migration ergaenzt nur keyVersion (in UTC keine Verschiebung); sonst unveraendert
        norm = lambda l: sorted([{k: v for k, v in d.items() if k != 'keyVersion'} for d in l], key=lambda d: d['date'])
        assert norm(after['plan']) == norm(before['plan']) and all(d.get('keyVersion') == 2 for d in after['plan']), "Wochenplan-Record veraendert"
        assert after['dbVersion'] == before['dbVersion']
        print("NACHHER identisch: IDs, Rohdaten, Bild, Einkauf, Wochenplan, localStorage, DB-Version", after['dbVersion'])
        # Anzeige alter Daten
        await show(page, "() => { state.activeRecipeId = 'r_legacy_1'; state.view = 'detail'; render(); }", '.detail-main')
        await page.wait_for_timeout(500)
        groups = await page.evaluate("Array.from(document.querySelectorAll('.ing-group-title')).map(e=>e.textContent)")
        names = await page.evaluate("Array.from(document.querySelectorAll('.ing-name')).map(e=>e.textContent)")
        img_ok = await page.evaluate("!!document.querySelector('img.hero-img')")
        if not groups:
            await page.wait_for_timeout(2500); print("ERR:", errors, await page.evaluate("document.visibilityState"), await page.evaluate("document.getElementById('app').children.length")); print("DEBUG view:", await page.evaluate("state.view"), (await page.evaluate("document.getElementById('app').innerHTML"))[:400])
        print("Gruppen:", groups, "Zutaten:", names, "Bild geladen:", img_ok)
        assert groups == ['Teig', 'Füllung'] and 'Teig:' not in names and img_ok
        await page.screenshot(path=OUT + '/detail_legacy.png')
        await show(page, "() => { state.view = 'home'; render(); }", '.home-main')
        await page.wait_for_timeout(500)
        await page.screenshot(path=OUT + '/home_new.png', full_page=True)
        print("ERRORS:", errors)
        await browser.close()
asyncio.run(main())
