import asyncio, sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
VIEWS = [
  ('home', "() => { state.modal=null; state.view='home'; render(); }", '.home-main'),
  ('detail', "() => { state.activeRecipeId='r_legacy_1'; state.view='detail'; render(); }", '.detail-main'),
  ('cook', "() => { state.activeRecipeId='r_legacy_1'; state.cookStepIndex=1; state.cookFinished=false; state.view='cookmode'; render(); }", '.cook-v2'),
  ('shopping', "() => { state.view='shopping'; render(); }", '.shop-add'),
  ('plan', "() => { state.view='mealplan'; render(); }", '.week-nav'),
  ('form', "() => { state.editingRecipe = JSON.parse(JSON.stringify(state.recipes.find(r=>r.id==='r_legacy_1'))); state.formStep=2; state.view='form'; render(); }", '#recipeForm'),
  ('cookbook', "() => { state.view='cookbook'; render(); }", '.cookbook-main'),
  ('settings', "() => { state.view='settings'; render(); }", '.settings-row'),
]
async def main():
    async with async_playwright() as p:
        overflow = []
        errors = []
        for w, h in [(320, 640), (390, 844), (768, 1024), (1280, 860)]:
            browser, ctx = await open_ctx(p, w, h)
            page = await ctx.new_page()
            page.on("pageerror", lambda e: errors.append(str(e)))
            await goto(page)
            await page.evaluate(open(SEED_PATH).read())
            await page.evaluate("async () => { const s = await dbGetAllShopping(); await addSelectionToShopping(shoppingSelectionFor(state.recipes.find(r=>r.id==='r_legacy_1'), 9)); }")
            for name, js, sel in VIEWS:
                await show(page, js, sel)
                await page.wait_for_timeout(250)
                ov = await page.evaluate("document.documentElement.scrollWidth - innerWidth")
                if ov > 1: overflow.append((w, name, ov))
                if w in (320, 390, 1280): await page.screenshot(path=OUT + f'/v_{w}_{name}.png')
            await browser.close()
        # Dunkelmodus
        browser, ctx = await open_ctx(p, 390, 844)
        page = await ctx.new_page()
        await goto(page)
        await page.evaluate(open(SEED_PATH).read())
        await page.evaluate("() => { state.theme='dark'; applyTheme(); }")
        for name, js, sel in VIEWS[:2]:
            await show(page, js, sel); await page.wait_for_timeout(250)
            await page.screenshot(path=OUT + f'/dark_{name}.png')
        await browser.close()
        print("Horizontaler Ueberlauf:", overflow or 'keiner')
        print("Fehler:", errors or 'keine')
        assert not overflow and not errors, (overflow, errors)
asyncio.run(main())
