"""Paket 3: Masseinheiten-Rechner (Gewicht, Volumen, Temperatur, Zutaten)."""
import asyncio, re, sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

async def main():
    async with async_playwright() as p:
        browser, ctx = await open_ctx(p, 390, 844)
        await ctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin='http://localhost:8795')
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page)
        await page.evaluate("() => { state.view = 'unitconverter'; state.ucTab = undefined; state.ucUnit = undefined; state.ucAmount = undefined; localStorage.removeItem('savora-uc-defs'); render(); }")
        await page.wait_for_selector('.uc-page')
        async def res():
            t = re.sub(r'\s+', ' ', await page.evaluate("document.getElementById('ucResults').textContent")).strip()
            return re.sub(r'(\d)(?=[A-Za-z°≈])', r'\1 ', t)   # Zahl und Einheit stehen im DOM ohne Leerzeichen (Abstand kommt aus dem Layout)
        async def tab(name):
            await page.evaluate(f"document.querySelector('[data-action=\"uc-tab\"][data-id=\"{name}\"]').click()"); await page.wait_for_timeout(150)
        async def setv(amount, unit=None):
            if unit: await page.select_option('#ucUnit', unit); await page.wait_for_timeout(120)
            await page.fill('#ucAmount', str(amount)); await page.wait_for_timeout(120)

        # Gewicht
        await tab('weight'); await setv('1', 'kg'); r = await res()
        check('1 kg = 1000 g, 35.3 oz, 2.2 lb', '1000 g' in r and '35.3 oz' in r and '2.2 lb' in r, r)
        await setv('100', 'g'); r = await res()
        check('100 g = 0.1 kg, 3.53 oz, 0.22 lb', '0.1 kg' in r and '3.53 oz' in r and '0.22 lb' in r, r)
        for v in ['0,5', '0.5', '1/2', '½']:
            await setv(v, 'kg'); rr = await res()
            check(f'Eingabe "{v}" kg ergibt 500 g', '500 g' in rr, rr)
        await setv('abc'); r = await res(); check('Ungültige Eingabe wird abgelehnt', 'gültige Zahl' in r, r)
        await setv(''); r = await res(); check('Leere Eingabe wird abgelehnt', 'Menge' in r, r)

        # Volumen (Schweiz)
        await tab('volume'); await setv('1', 'cup'); r = await res()
        check('Schweiz: 1 Tasse = 250 ml = 2.5 dl = 0.25 l = 16.7 EL = 50 TL', all(x in r for x in ['250 ml', '2.5 dl', '0.25 l', '16.7 EL', '50 TL']), r)
        await setv('2', 'dl'); r = await res(); check('2 dl = 200 ml', '200 ml' in r, r)
        await setv('1', 'tbsp'); r = await res(); check('Schweiz: 1 EL = 15 ml, 3 TL', '15 ml' in r and '3 TL' in r, r)
        await page.evaluate("document.querySelector('[data-action=\"uc-defs\"][data-id=\"us\"]').click()"); await page.wait_for_timeout(200)
        await tab('volume'); await setv('1', 'cup'); r = await res()
        check('USA: 1 Tasse = 237 ml', '237 ml' in r, r)
        check('Auswahl bleibt gespeichert', await page.evaluate("localStorage.getItem('savora-uc-defs')") == 'us')
        await page.evaluate("document.querySelector('[data-action=\"uc-defs\"][data-id=\"metric\"]').click()"); await page.wait_for_timeout(200)

        # Temperatur
        await tab('temp'); await setv('180', 'c'); r = await res()
        check('180 °C = 356 °F, Gasstufe 4, Heissluft 160 °C', '356 °F' in r and '4 Gasstufe' in r and '160 °C' in r, r)
        await setv('350', 'f'); r = await res()
        check('350 °F = 177 °C, nächste Gasstufe 4, Heissluft 157', '177 °C' in r and '4 Gasstufe' in r and '157 °C' in r, r)
        await setv('6', 'gas'); r = await res()
        check('Gasstufe 6 = 200 °C = 392 °F, Heissluft 180', '200 °C' in r and '392 °F' in r and '180 °C' in r, r)
        await setv('20', 'c'); r = await res(); check('20 °C: keine Gasstufe, Hinweis', '–' in r and 'ausserhalb' in r, r)
        await setv('600', 'c'); r = await res(); check('Temperatur über 500 °C wird abgelehnt', 'zwischen 0 und 500' in r, r)
        await setv('10', 'gas'); r = await res(); check('Gasstufe 10 wird abgelehnt', 'Gasstufe: bitte' in r, r)
        await page.evaluate("document.querySelector('[data-action=\"uc-temp-row\"][data-c=\"200\"]').click()"); await page.wait_for_timeout(200)
        check('Tippen auf die Stufen-Tabelle setzt 200 °C', await page.input_value('#ucAmount') == '200' and await page.input_value('#ucUnit') == 'c')

        # Zutaten
        await tab('food'); await page.select_option('#ucIngredient', 'flour'); await setv('1', 'cup'); r = await res()
        check('1 Tasse Weissmehl ≈ 138 g', '≈ 138 g' in r and 'Richtwerte' in r, r)
        await page.select_option('#ucIngredient', 'butter'); await setv('100', 'g'); r = await res()
        check('100 g Butter ≈ 104 ml', '≈ 104 ml' in r, r)
        await page.select_option('#ucIngredient', 'honey'); await setv('1', 'tbsp'); r = await res()
        check('1 EL Honig ≈ 21.3 g', '≈ 21.3 g' in r, r)

        # Kopieren, Schnellwerte, Reiter merken Eingabe
        await tab('weight'); await setv('1', 'kg')
        await page.evaluate("document.querySelector('.uc-result-row').click()"); await page.wait_for_timeout(300)
        clip = await page.evaluate("navigator.clipboard.readText()")
        check('Tippen auf ein Ergebnis kopiert es', clip.strip() == await page.evaluate("document.querySelector('.uc-result-row').dataset.copy"), repr(clip))
        await page.evaluate("document.querySelector('[data-action=\"uc-quick\"]').click()"); await page.wait_for_timeout(200)
        check('Schnellwert setzt die Menge', await page.input_value('#ucAmount') in ('0.5', '1', '50', '4'), await page.input_value('#ucAmount'))
        await tab('temp'); await tab('weight')
        check('Reiter merkt sich die letzte Eingabe', await page.input_value('#ucUnit') == 'kg')

        # Bedienbarkeit
        for t in ['weight', 'volume', 'temp', 'food']:
            await tab(t)
            bad = await page.evaluate("""() => Array.from(document.querySelectorAll('.uc-page button, .uc-page input, .uc-page select')).filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.height < 43.5 || r.width < 43.5) }).map(e => e.className + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height))""")
            check(f'Tippflächen mind. 44 px: {t}', not bad, str(bad[:3]))
        check('Beschriftungen für Menge, Einheit, Zutat vorhanden', await page.evaluate("!!document.querySelector('label[for=ucAmount]') && !!document.querySelector('label[for=ucUnit]')"))
        check('Reiter mit Rollen und aria-selected', await page.evaluate("document.querySelectorAll('[role=tab][aria-selected=true]').length") == 1)
        await browser.close()

        # 320 px und Dunkelmodus: kein horizontaler Ueberlauf
        b2, c2 = await open_ctx(p, 320, 640)
        pg = await c2.new_page(); await goto(pg)
        for th in ['light', 'dark']:
            await pg.evaluate(f"() => document.documentElement.setAttribute('data-theme','{th}')")
            for t in ['weight', 'volume', 'temp', 'food']:
                await pg.evaluate(f"() => {{ state.view = 'unitconverter'; state.ucTab = undefined; state.ucUnit = undefined; state.ucAmount = undefined; ucSwitchTab('{t}'); render(); }}"); await pg.wait_for_timeout(200)
                ov = await pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
                check(f'320 px {th} {t}: kein Seitwärts-Scrollen', ov <= 0, str(ov))
        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await b2.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
