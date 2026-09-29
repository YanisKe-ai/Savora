import asyncio, sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={"width": 390, "height": 844})  # mit Service Worker, mit Animationen
        await ctx.add_init_script("try{localStorage.setItem('savora-splash-seen','1')}catch(e){}")
        page = await ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        await page.goto(URL)
        await page.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller !== undefined", timeout=10000)
        await page.evaluate(open(SEED_PATH).read())
        await page.wait_for_function("navigator.serviceWorker.ready.then(() => true)")
        print("reload1"); await page.reload(); await page.wait_for_timeout(2500)  # SW uebernimmt und cached
        ctrl = await page.evaluate("!!navigator.serviceWorker.controller")
        await ctx.set_offline(True)
        print("reload2"); await page.reload(); await page.wait_for_timeout(2500)
        n = await page.evaluate("document.querySelectorAll('.rcard').length")
        print("SW aktiv:", ctrl, "| Offline-Start zeigt Rezepte:", n)
        await ctx.set_offline(False)
        # Navigation mit echten View-Transitions
        await page.evaluate("document.querySelector('[data-action=\"open-recipe\"]').click()")
        await page.wait_for_selector('.detail-main', timeout=5000)
        await page.go_back(); await page.wait_for_selector('.home-main', timeout=5000)
        await page.evaluate("document.querySelector('[data-action=\"open-recipe\"]').click()")
        await page.wait_for_selector('.detail-main', timeout=5000)
        await page.evaluate("document.querySelector('[data-action=\"open-detail-menu\"]').click()")
        await page.wait_for_selector('.menu-list', timeout=5000)
        await page.evaluate("document.querySelector('.menu-item[data-action=\"edit-recipe\"]').click()")
        await page.wait_for_selector('#recipeForm', timeout=5000)
        await page.go_back(); await page.wait_for_selector('.detail-main', timeout=5000)
        await page.go_back(); await page.wait_for_selector('.home-main', timeout=5000)
        print("Navigation mit Animationen und Zurueck (Detail > Menue > Bearbeiten > Zurueck > Zurueck): OK")
        print("Fehler:", errors or 'keine')
        assert not errors, errors
        await browser.close()
asyncio.run(main())
