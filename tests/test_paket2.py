"""Paket 2: rechtliche und allgemeine Texte, Einheitlichkeit, Navigation, Versionsangabe."""
import asyncio, re, sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)
def src(name): return open(_os.path.join(ROOT, name), encoding='utf-8').read()

async def main():
    # Statische Pruefungen ueber den Quelltext
    ui_files = ['views.js', 'views-v2.js', 'ui.js', 'actions-v2.js', 'cloud.js', 'backup.js', 'nutrition-ui.js', 'pdf-ui.js', 'legal.js', 'cookmode.js', 'shopping.js', 'recipe-model.js']
    bad_q = [(f, m.group(0)[:50]) for f in ui_files for m in re.finditer(r'„[^“”<>\n"]{1,60}"', src(f))]
    check('Anfuehrungszeichen typografisch korrekt („…“)', not bad_q, str(bad_q[:3]))
    check('Keine persoenlichen Beispielnamen im Produkt', not any('Yanis' in src(f) for f in ui_files + ['index.html', 'manifest.json']))
    check('Kein "Nutzer_innen" o. ae.', not any(re.search(r'Nutzer_|Nutzer\*|_innen', src(f)) for f in ui_files))
    ver = src('VERSION').strip()
    check('APP_VERSION in legal.js entspricht der Datei VERSION', f"APP_VERSION = '{ver}'" in src('legal.js'), ver)
    check('SW_VERSION kennt legal.js', "'./legal.js'" in src('sw.js'))

    async with async_playwright() as p:
        browser, ctx = await open_ctx(p, 390, 844)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page)
        pages = {
            'settings-privacy': ['Wer verantwortlich ist', 'Deine Rechte', 'Supabase', 'Open Food Facts', 'Ende-zu-Ende'],
            'settings-terms': ['Beta-Version', 'Nährwerte und Allergene', 'Schweizer Recht'],
            'settings-sources': ['Schweizer Nährwertdatenbank', 'Open Food Facts', 'ODbL'],
            'settings-licenses': ['Roboto', 'jsPDF', 'html2canvas', 'Capacitor'],
            'settings-about': ['Version', 'Datenschutz', 'Lizenzen'],
            'settings-help': ['Häufige Fragen', 'Kontakt'],
        }
        for view, words in pages.items():
            await page.evaluate(f"() => {{ state.view = '{view}'; render(); }}"); await page.wait_for_timeout(300)
            t = await page.evaluate("document.querySelector('.settings-page').innerText")
            missing = [w for w in words if w.lower() not in t.lower()]   # Gruppentitel werden per CSS grossgeschrieben
            check(f'Seite {view}: Inhalte vorhanden, kein "undefined"', not missing and 'undefined' not in t and '[object' not in t and len(t) > 150, f'fehlt: {missing}')
        t = await page.evaluate("state.view='settings-terms'; render(); document.querySelector('.settings-page').innerText")
        check('Nutzungsbedingungen sind kein Platzhalter mehr', 'wird für die Beta-Version vorbereitet' not in t)
        # Versionsangabe stimmt mit Datei VERSION ueberein
        await page.evaluate("() => { state.view = 'settings-about'; render(); }"); await page.wait_for_timeout(200)
        t = await page.evaluate("document.querySelector('.settings-page').innerText")
        check('Über Savora zeigt die Versionsnummer', f'Version {ver}' in t, ver)
        # Platzhalter sind markiert sichtbar
        n_ph = await page.evaluate("document.querySelectorAll('.legal-placeholder').length")
        print(f'HINWEIS Platzhalter sichtbar auf "Über Savora": {n_ph} (vor Veroeffentlichung LEGAL in legal.js ausfuellen)')
        # Navigation: Mehr > Ueber Savora > Lizenzen > zurueck
        await page.evaluate("() => { state.view = 'settings'; render(); }")
        await page.evaluate("document.querySelector('[data-view=\"settings-about\"]').click()"); await page.wait_for_timeout(300)
        await page.evaluate("document.querySelector('[data-view=\"settings-licenses\"]').click()"); await page.wait_for_timeout(300)
        check('Navigation Mehr > Über > Lizenzen', await page.evaluate("state.view") == 'settings-licenses')
        await page.evaluate("document.querySelector('[data-action=\"back\"]').click()"); await page.wait_for_timeout(500)
        check('Zurück führt zu Über Savora', await page.evaluate("state.view") == 'settings-about')
        # FAQ aufklappbar
        await page.evaluate("() => { state.view = 'settings-help'; render(); }"); await page.wait_for_timeout(200)
        await page.evaluate("document.querySelector('.faq summary').click()"); await page.wait_for_timeout(150)
        check('Hilfe: Fragen lassen sich aufklappen', await page.evaluate("document.querySelector('.faq').open") is True)
        # Sicherung statt Backup
        await page.evaluate("() => { state.view = 'settings-backup'; render(); }"); await page.wait_for_timeout(200)
        t = await page.evaluate("document.body.innerText")
        check('Sicherungsseite ohne Wort "Backup"', 'Backup' not in t and 'Sicherung erstellen' in t)
        # Tippflaechen der Einklapp-Zeilen
        await page.evaluate("() => { state.view = 'settings-help'; render(); }")
        h = await page.evaluate("document.querySelector('.faq summary').getBoundingClientRect().height")
        check('Fragen-Zeilen mind. 44 px hoch', h >= 43.5, f'{h:.0f}')
        # Screenshots fuer die Sichtkontrolle
        for v in ['settings-privacy', 'settings-about', 'settings-help']:
            await page.evaluate(f"() => {{ state.view = '{v}'; render(); }}"); await page.wait_for_timeout(300)
            await page.screenshot(path=OUT + f'/p2_{v}.png', full_page=True)
        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await browser.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
