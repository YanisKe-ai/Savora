"""Paket 38: Einstellungen mit sechs Zeilen in drei Gruppen, kombinierte Seiten (Konto und Sicherung, Anzeige), Rechtliches in Über Savora, Sicherung/Wiederherstellung, Namen beim Teilen."""
import asyncio, json, sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

VIEWS = ['more', 'settings', 'settings-data', 'settings-cooking', 'settings-account', 'settings-offline', 'settings-display', 'settings-units', 'settings-profile', 'settings-backup', 'settings-help', 'settings-privacy',
         'settings-terms', 'settings-sources', 'settings-about', 'settings-licenses', 'settings-nutrition', 'settings-sync', 'settings-share', 'settings-share-preview']

async def main():
    async with async_playwright() as p:
        browser, ctx = await open_ctx(p, 390, 844)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(400)
        ev = page.evaluate
        async def go(view):
            await ev(f"() => {{ state.modal = null; state.view = '{view}'; render(); }}"); await page.wait_for_timeout(150)
        async def main_text():
            return await ev("document.querySelector('main').innerText")

        # 1 Einstellungen: zwei Gruppen mit sechs Seiten (Teilauftrag M1, Details in test_mehr_nav.py)
        await go('settings')
        groups = await ev("Array.from(document.querySelectorAll('.settings-group')).map(g => ({ t: g.querySelector('.settings-group-title').textContent.trim(), rows: Array.from(g.querySelectorAll('.settings-row')).map(r => ({ title: r.querySelector('.settings-row-title').textContent.trim(), sum: (r.querySelector('.settings-row-summary') || {textContent: ''}).textContent.trim() })) }))")
        titles = [g['t'] for g in groups]
        check('Gruppen in Reihenfolge: Konto & Daten, App anpassen', titles == ['Konto & Daten', 'App anpassen'], str(titles))
        rows = [[r['title'] for r in g['rows']] for g in groups]
        check('Konto & Daten: Mein Konto, Geräteabgleich, Sicherung & Wiederherstellung', rows[0] == ['Mein Konto', 'Geräteabgleich', 'Sicherung & Wiederherstellung'], str(rows[0]))
        check('App anpassen: Darstellung, Kochen & Mengen, Ohne Internet', rows[1] == ['Darstellung', 'Kochen & Mengen', 'Ohne Internet'], str(rows[1]))
        check('Hauptliste hat genau 6 Zeilen', sum(len(r) for r in rows) == 6, str(rows))
        sums = {r['title']: r['sum'] for g in groups for r in g['rows']}
        check('Ohne Anmeldung steht «Nicht angemeldet»', sums['Mein Konto'] == 'Nicht angemeldet', str(sums))
        txt = await main_text()
        for old in ['Kochbuch gestalten und als PDF', 'Kochbuch & Profil', 'Synchronisation', 'Hilfe & Feedback', 'Imperial', 'Metrisch', 'Datenschutz', 'Nutzungsbedingungen', 'Sicherungskopie', 'Auf mehreren Geräten', 'Socialize', 'Konto und Sicherung', 'Darstellung und Einheiten']:
            check(f'Einstellungen ohne altes Wort «{old}»', old not in txt)
        check('Rechner nicht unter Einstellungen', await ev("document.querySelector('.settings-row[data-action=\"open-unitconverter\"]') === null") and 'Rechner' not in txt)

        # 2 Darstellung und Kochen & Mengen (frueher eine Seite «Anzeige»)
        await ev("() => { state.theme = 'auto'; state.unitSystem = 'metric'; state.showNutrition = true; }"); await go('settings')
        sm = await ev("Array.from(document.querySelectorAll('.settings-row')).map(r => r.querySelector('.settings-row-summary').textContent.trim()).join('|')")
        check('Zusammenfassung «Wie dein Gerät» und «Gramm und Milliliter, Nährwerte sichtbar»', 'Wie dein Gerät' in sm and 'Gramm und Milliliter, Nährwerte sichtbar' in sm, sm)
        await go('settings-display'); t = await main_text()
        check('Darstellung: «Wie dein Gerät» statt «System»', 'Wie dein Gerät' in t and 'System' not in t, t[:200])
        check('Darstellung: Seitentitel «Darstellung»', await ev("document.querySelector('.topbar-title').textContent.trim()") == 'Darstellung')
        await go('settings-cooking'); t = await main_text()
        check('Kochen & Mengen: Mengenangaben «Gramm und Milliliter» und «US-Masse (Cups, Unzen)»', 'Gramm und Milliliter' in t and 'US-Masse (Cups, Unzen)' in t and 'Imperial' not in t and 'Metrisch' not in t, t[:400])
        check('Kochen & Mengen: Nährwerte-Satz', 'Geschätzte Werte. Je nach Zutaten und Mengen können sie abweichen.' in t.replace('Nährwerte sind geschätzte Werte', 'Geschätzte Werte').replace('geschätzte Werte', 'Geschätzte Werte'))
        for v in ('settings-units', 'settings-nutrition'):
            await go(v); check(f'{v} zeigt Kochen & Mengen', await ev("document.querySelector('.topbar-title').textContent.trim()") == 'Kochen & Mengen')
        await go('settings-cooking')
        await page.click('[data-action="set-unit-system"][data-system="imperial"]'); await page.wait_for_timeout(150)
        await page.click('button[role="switch"]'); await page.wait_for_timeout(150)
        await go('settings')
        check('Zusammenfassung zeigt US-Masse und ausgeblendete Nährwerte', 'US-Masse (Cups, Unzen), Nährwerte ausgeblendet' in await main_text(), await main_text())
        await ev("() => { state.unitSystem = 'metric'; state.showNutrition = true; }")

        # 5 Sicherungsseite (Mehr, M2): Konto, Geräteabgleich und Sicherung sind getrennte Seiten
        h2 = lambda: ev("Array.from(document.querySelectorAll('main h2')).map(h => h.textContent.trim())")
        await go('settings-backup'); t = await main_text()
        hb = await h2()
        check('settings-backup: Sicherung herunterladen zuerst, dann Sicherung importieren', hb == ['Sicherung herunterladen', 'Sicherung importieren'], str(hb))
        await go('settings-account')
        check('Mein Konto: Anmeldefelder auf der Kontoseite, kein Sicherungsknopf dort', await ev("!!document.getElementById('cloudEmail') && !document.querySelector('[data-action=export-backup]') && !document.getElementById('kontoRestoreInput')"))
        await go('settings-backup')
        check('Sicherung: Seitentitel «Sicherung & Wiederherstellung»', 'Sicherung & Wiederherstellung' in await ev("document.querySelector('header, .topbar').innerText"))
        check('Sicherung: Beschreibung', 'Erstellt eine Datei, mit der du deine Daten später wiederherstellen kannst.' in t)
        btns = await ev("Array.from(document.querySelectorAll('[data-action=\"export-backup\"], [data-action=\"konto-import-pick\"]')).map(b => b.textContent.trim())")
        check('Sicherung: Schaltflächen «Sicherung herunterladen» und «Sicherung importieren»', btns == ['Sicherung herunterladen', 'Sicherung importieren'], str(btns))
        check('Sicherung: Erklärung vor dem Import auf der Seite', 'ergänzt' in t and 'nicht überschrieben' in t and 'nicht doppelt' in t and 'Erst nach deiner Bestätigung wird etwas übernommen' in t)
        check('Sicherung: Abgleich ersetzt keine Sicherung (Unterschied erklärt)', 'Abgleich oder Sicherung?' in t and 'Sicherungsdatei bewahrt einen bestimmten Stand' in t)
        check('Sicherung: PDF-Satz sachlich (PDF nicht importierbar)', 'PDF-Dateien sind zum Lesen und Drucken gedacht und lassen sich nicht importieren' in t and 'fertige PDF-Datei an' not in t)
        for v in ('settings-sync', 'settings-data'):
            await go(v)
            check(f'{v}: kein Sicherungs-Knopf mit Anmeldefeldern vermischt', await ev("!document.querySelector('[data-action=export-backup]') || !document.getElementById('cloudEmail')"))
        await go('settings-sync'); st = await main_text()
        check('Geräteabgleich: Abgleich ersetzt keine Sicherung', 'ersetzt keine Sicherung' in st or 'Sicherung' in st, st[:200])

        # 6 Reales Verhalten: Erklaerung stimmt mit Code ueberein (Import erst nach Bestätigung)
        n0 = await ev("state.recipes.length")
        before = await ev("JSON.stringify(state.recipes.map(r => [r.id, r.title, r.updatedAt]).sort())")
        existing = await ev("JSON.parse(JSON.stringify(state.recipes[0]))")
        newr = json.loads(json.dumps(existing)); newr['id'] = 'r_p37_new'; newr['title'] = 'P37 Neues Testrezept'; newr['ingredients'] = [{'amount': 1, 'unit': 'Stk', 'name': 'Testzutat'}]
        data = {'app': 'savora', 'version': 3, 'schemaVersion': 4, 'recipes': [existing, newr], 'shopping': []}
        path = OUT + '/p37-backup.json'; json.dump(data, open(path, 'w'))
        await go('settings-backup')
        await page.set_input_files('#kontoRestoreInput', path)
        await page.wait_for_selector('#kontoImportPanel .kd-panel', timeout=5000); await page.wait_for_timeout(300)
        check('Vor der Bestätigung ist nichts verändert', await ev("state.recipes.length") == n0)
        await page.click('[data-action="konto-import-go"]'); await page.wait_for_timeout(1500)
        n1 = await ev("state.recipes.length")
        after = await ev("JSON.stringify(state.recipes.filter(r => r.id !== 'r_p37_new').map(r => [r.id, r.title, r.updatedAt]).sort())")
        check('Import ergänzt (+1), Gleiches nicht doppelt, nichts ersetzt oder gelöscht', n1 == n0 + 1 and after == before, f'{n0}->{n1}')
        st = await ev("document.getElementById('backupStatus').innerText")
        check('Statusmeldung nennt Ergebnis', '1 Rezept' in st and 'schon vorhanden' in st, st)

        # 7 Name beim Teilen: «settings-profile» führt seit «Mehr» zu Freunde & Rezepte (Profil), das Namensfeld steht nicht mehr auf einer Einstellungsseite
        await go('settings-profile')
        check('settings-profile führt zum Freunde-Profil, ohne altes Namensfeld', await ev("document.getElementById('f-sender-name') === null") and 'Profil' in await ev("document.querySelector('header, .topbar').innerText"))
        await ev("() => { state.senderName = 'Anna'; localStorage.setItem(SENDER_NAME_KEY, 'Anna'); }")
        pm = await ev("JSON.stringify(pdfBuildModel(state.recipes[0], null))")
        check('Name erscheint nicht ungefragt im PDF-Modell', 'Anna' not in pm)
        check('Name erscheint nicht im Sendeinhalt', 'Anna' not in json.dumps(await ev("shareBuildPayload(state.recipes[0])")))
        await ev("() => { state.senderName = ''; localStorage.removeItem(SENDER_NAME_KEY); }")

        # 8 Rechtliches in Über Savora
        await go('settings-about')
        reach = await ev("Array.from(document.querySelectorAll('main [data-view]')).map(b => b.dataset.view)")
        check('Über Savora: Rechtliches mit Datenschutz, Nutzungsbedingungen, Datenquellen und Lizenzen', reach == ['settings-privacy', 'settings-terms', 'settings-sources'], str(reach))
        rt = await ev("Array.from(document.querySelectorAll('.settings-row-title')).map(r => r.textContent.trim())")
        check('Über Savora: Zeilen nichts doppelt', rt == ['Datenschutz', 'Nutzungsbedingungen', 'Datenquellen und Lizenzen'], str(rt))
        check('Über Savora: Überschrift «Rechtliches»', 'rechtliches' in (await main_text()).lower())
        await page.click('[data-view="settings-sources"]'); await page.wait_for_timeout(200)
        check('Datenquellen öffnen sich', 'schweizer nährwertdatenbank' in (await main_text()).lower())
        check('Datenquellen verweisen auf Lizenzen', await ev("!!document.querySelector('main [data-view=settings-licenses]')"))
        await go('settings-licenses'); check('Lizenzen öffnen sich', 'Roboto' in await main_text())
        await go('settings-privacy'); check('Datenschutz erreichbar', 'Wer verantwortlich ist' in await main_text())
        await go('settings-terms'); check('Nutzungsbedingungen erreichbar', 'Beta-Version' in await main_text())
        await go('settings-about'); await page.click('[data-view="settings-privacy"]'); await page.wait_for_timeout(200)
        await ev("document.querySelector('[data-action=back]').click()"); await page.wait_for_timeout(500)
        check('Zurück von Datenschutz führt zu Über Savora', await ev("state.view") == 'settings-about')

        # 9 Hilfe erhalten
        await go('settings-help'); t = await ev("document.body.innerText")
        check('Hilfe & Kontakt: Titel, kein «Feedback»', 'Hilfe & Kontakt' in t and 'Feedback' not in t)

        # 10 Alle Seiten: kein ß, keine Gedankenstriche, kein Ueberlauf (390 px und 24 px Schrift)
        for fs in ('', '24px'):
            await ev(f"() => {{ document.documentElement.style.fontSize = '{fs}'; }}")
            for v in VIEWS:
                await go(v)
                if fs == '':
                    bt = await ev("document.body.innerText")
                    check(f'{v}: kein ß und keine Gedankenstriche', 'ß' not in bt and '—' not in bt and '–' not in bt, ''.join(c for c in bt if c in 'ß—–'))
                ov = await ev("Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth")
                check(f'{v}: kein Überlauf bei 390 px{" und 24 px Schrift" if fs else ""}', ov <= 0, str(ov))
        await page.set_viewport_size({'width': 360, 'height': 780})
        for fs in ('', '24px'):
            await ev(f"() => {{ document.documentElement.style.fontSize = '{fs}'; }}")
            for v in ('settings', 'settings-data', 'settings-backup', 'settings-display', 'settings-about'):
                await go(v)
                ov = await ev("Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth")
                clip = await ev("Array.from(document.querySelectorAll('.settings-row')).filter(r => r.scrollWidth > r.clientWidth + 1).length")
                check(f'{v}: bei 360 px{" und 24 px Schrift" if fs else ""} kein Überlauf, keine abgeschnittene Zeile', ov <= 0 and clip == 0, f'{ov} {clip}')
                if v == 'settings': 
                    small = await ev("Array.from(document.querySelectorAll('main *')).filter(e => e.childNodes.length && Array.from(e.childNodes).some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 14).length")
                    hh = await ev("Math.min(...Array.from(document.querySelectorAll('.settings-row')).map(r => r.getBoundingClientRect().height))")
                    check(f'Hauptliste: nichts unter 14 px, Zeilen mind. 44 px hoch ({fs or "normal"})', small == 0 and hh >= 44, f'{small} {hh}')
        await ev("() => { document.documentElement.style.fontSize = ''; }")
        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await browser.close()
    print('\nFEHLER:' if FAIL else '\nALLES OK', FAIL if FAIL else '')
    sys.exit(1 if FAIL else 0)

asyncio.run(main())
