"""Barrierefreiheit mit axe-core: alle Ansichten in Hell, Dunkel und Schwarz duerfen keine Verletzung haben
(Kontrast, Beschriftungen, Rollen, Ueberschriften). Voraussetzung: `npm ci` (axe-core ist eine Entwicklungs-Abhaengigkeit)."""
import asyncio, os, sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
AXE_PATH = _os.path.join(ROOT, 'node_modules', 'axe-core', 'axe.min.js')
VIEWS = [
 ('Startseite', "state.view='home'"), ('Rezeptseite Zutaten', "state.activeRecipeId='r_legacy_1'; state.view='detail'; state.detailTab='ingredients'"),
 ('Rezeptseite Zubereitung', "state.activeRecipeId='r_legacy_1'; state.view='detail'; state.detailTab='steps'"),
 ('Rezeptseite Naehrwerte', "state.activeRecipeId='r_legacy_1'; state.view='detail'; state.detailTab='nutrition'"),
 ('Kochmodus', "state.activeRecipeId='r_legacy_1'; state.view='cookmode'"), ('Wochenplan', "state.view='mealplan'"), ('Einkauf', "state.view='shopping'"),
 ('Einstellungen', "state.view='settings'"), ('Darstellung', "state.view='settings-display'"), ('Sicherung', "state.view='settings-backup'"),
 ('Synchronisation', "state.view='settings-sync'"), ('Datenschutz', "state.view='settings-privacy'"), ('Bedingungen', "state.view='settings-terms'"),
 ('Quellen', "state.view='settings-sources'"), ('Lizenzen', "state.view='settings-licenses'"), ('Ueber', "state.view='settings-about'"), ('Hilfe', "state.view='settings-help'"),
 ('Rechner Gewicht', "state.view='unitconverter'; state.ucTab=undefined; state.ucUnit=undefined; state.ucAmount=undefined"), ('Rechner Temperatur', "state.view='unitconverter'; ucSwitchTab('temp')"),
 ('Rechner Zutaten', "state.view='unitconverter'; ucSwitchTab('food')"),
 ('Kochbuch', "state.view='cookbook'"), ('Formular Basis', "state.editingRecipe = JSON.parse(JSON.stringify(state.recipes[0])); state.formStep=0; state.view='form'"),
 ('Formular Zutaten', "state.editingRecipe = JSON.parse(JSON.stringify(state.recipes[0])); state.formStep=2; state.view='form'"), ('Text-Import', "state.view='paste-import'"),
]
async def main():
    fails = []
    if not _os.path.exists(AXE_PATH):
        print('UEBERSPRUNGEN (nicht bestanden, nicht ausgefuehrt): axe-core fehlt, bitte `npm ci` ausfuehren'); sys.exit(1)
    axe = open(AXE_PATH).read()
    async with async_playwright() as p:
        browser, ctx = await open_ctx(p, 390, 844)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(600)
        await page.add_script_tag(content=axe)
        n = 0
        for width, height in [(390, 844), (1280, 800)]:
          await page.set_viewport_size({'width': width, 'height': height})
          for th in ['light', 'dark', 'amoled']:
              await page.evaluate(f"() => document.documentElement.setAttribute('data-theme','{th}')")
              for name, js in VIEWS:
                  await page.evaluate("() => {" + js + "; render(); }"); await page.wait_for_timeout(300)
                  v = await page.evaluate("""async () => { const r = await axe.run(document, { runOnly: ['wcag2a','wcag2aa','wcag21aa','best-practice'] });
                      return r.violations.map(x => x.id + ' (' + x.nodes.length + '): ' + x.nodes[0].target.join(' ').slice(-60)) }""")
                  n += 1
                  if v:
                      fails.append(f'{width}px {th} / {name}: {v}'); print('FEHL ', width, th, name, v)
        print(f'{n} Ansichten geprueft (Hell, Dunkel, Schwarz, 390 und 1280 px)')
        if errs: fails.append('Seitenfehler: ' + str(errs[:2]))
        await browser.close()
    print('\nFEHLGESCHLAGEN:', fails or 'keine')
    sys.exit(1 if fails else 0)
asyncio.run(main())
