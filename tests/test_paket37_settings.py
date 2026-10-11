"""Paket 37: Einstellungen in drei Gruppen, klare Beschriftungen, Sicherung/Wiederherstellung, Namen beim Teilen."""
import asyncio, json, sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

VIEWS = ['settings', 'settings-display', 'settings-units', 'settings-profile', 'settings-backup', 'settings-help', 'settings-privacy',
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

        # 1 Drei Gruppen mit exakten Ueberschriften und Zeilen
        await go('settings')
        groups = await ev("Array.from(document.querySelectorAll('.settings-group')).map(g => ({ t: g.querySelector('.settings-group-title').textContent.trim(), rows: Array.from(g.querySelectorAll('.settings-row')).map(r => ({ title: r.querySelector('.settings-row-title').textContent.trim(), sum: (r.querySelector('.settings-row-summary') || {}).textContent || '' })) }))")
        titles = [g['t'] for g in groups]
        check('Gruppen in Reihenfolge: Deine Daten, Anzeige & Einheiten, Hilfe & Infos', [t.lower() for t in titles] == ['deine daten', 'anzeige & einheiten', 'hilfe & infos'], str(titles))
        rows = [[r['title'] for r in g['rows']] for g in groups]
        check('Deine Daten: Auf mehreren Geräten, Sicherungskopie, Freunde & Rezepte senden', rows[0] == ['Auf mehreren Geräten', 'Sicherungskopie', 'Freunde & Rezepte senden'], str(rows[0]))
        check('Anzeige & Einheiten: Design, Mengenangaben, Nährwerte anzeigen, Rechner', rows[1] == ['Helles oder dunkles Design', 'Mengenangaben', 'Nährwerte anzeigen', 'Masseinheiten-Rechner'], str(rows[1]))
        check('Hilfe & Infos: Hilfe erhalten, Über Savora, Datenschutz, Nutzungsbedingungen', rows[2] == ['Hilfe erhalten', 'Über Savora', 'Datenschutz', 'Nutzungsbedingungen'], str(rows[2]))
        sums = {r['title']: r['sum'] for g in groups for r in g['rows']}
        check('Ohne Anmeldung steht «Nicht angemeldet»', sums['Auf mehreren Geräten'] == 'Nicht angemeldet', str(sums))
        txt = await main_text()
        for old in ['Kochbuch gestalten und als PDF', 'Kochbuch & Profil', 'Synchronisation', 'Hilfe & Feedback', 'Darstellung', 'Imperial', 'Metrisch']:
            check(f'Einstellungen ohne altes Wort «{old}»', old not in txt)
        check('Rechner-Zeile ruft open-unitconverter auf', await ev("document.querySelector('.settings-row[data-action=\"open-unitconverter\"]') !== null"))
        check('Seitentitel bleibt «Einstellungen»', await ev("document.querySelector('h1, .page-title, .topbar-title') && document.body.innerText.includes('Einstellungen')"))

        # 2 Design
        await ev("() => { state.theme = 'auto'; }"); await go('settings')
        check('Design-Zusammenfassung «Wie dein Gerät»', 'Wie dein Gerät' in await main_text())
        await go('settings-display'); t = await main_text()
        check('Designseite: «Wie dein Gerät» statt «System»', 'Wie dein Gerät' in t and 'System' not in t, t[:200])

        # 3 Mengenangaben
        await go('settings-units'); t = await main_text()
        check('Mengenangaben: «Gramm und Milliliter» und «US-Masse (Cups, Unzen)»', 'Gramm und Milliliter' in t and 'US-Masse (Cups, Unzen)' in t and 'Imperial' not in t and 'Metrisch' not in t, t[:300])
        await ev("() => { state.unitSystem = 'imperial'; state.view='settings'; render(); }"); await page.wait_for_timeout(150)
        check('Zusammenfassung zeigt US-Masse', 'US-Masse (Cups, Unzen)' in await main_text())
        await ev("() => { state.unitSystem = 'metric'; }")

        # 4 Naehrwerte
        await go('settings-nutrition'); t = await main_text()
        check('Nährwerte: Satz «Geschätzte Werte. Je nach Zutaten und Mengen können sie abweichen.»', 'Geschätzte Werte. Je nach Zutaten und Mengen können sie abweichen.' in t, t[:200])
        await ev("() => { state.showNutrition = true; state.view='settings'; render(); }"); await page.wait_for_timeout(150)
        check('Nährwerte anzeigen: Zusammenfassung «An»', 'An' in sums.get('Nährwerte anzeigen', '') or 'An' in await ev("Array.from(document.querySelectorAll('.settings-row')).find(r => r.textContent.includes('Nährwerte anzeigen')).querySelector('.settings-row-summary').textContent"))

        # 5 Sicherungsseite
        await go('settings-backup'); t = await main_text()
        check('Sicherung: Beschreibung', 'Speichere eine Kopie deiner Rezepte als Datei.' in t)
        btns = await ev("Array.from(document.querySelectorAll('[data-action=\"export-backup\"], [data-action=\"trigger-restore\"]')).map(b => b.textContent.trim())")
        check('Sicherung: Schaltflächen «Sicherung speichern» und «Aus Sicherung wiederherstellen»', btns == ['Sicherung speichern', 'Aus Sicherung wiederherstellen'], str(btns))
        check('Sicherung: Erklärung vor dem Wiederherstellen auf der Seite', 'hinzugefügt' in t and 'nicht ersetzt' in t and 'nicht doppelt' in t)
        check('Sicherung: Synchronisation nicht als Sicherung (Abgleich ersetzt keine Sicherung)', 'ersetzt keine Sicherung' in t and 'Auf mehreren Geräten' in t)
        check('Sicherung: PDF-Satz sachlich (Freunde direkt in Savora, PDF nicht einspielbar)', 'Rezepte von Freunden kommen direkt in Savora an' in t and 'nicht in Savora einspielen' in t and 'fertige PDF-Datei an' not in t)
        # Dialog beim Wiederherstellen
        msgs = []
        page.on('dialog', lambda d: (msgs.append(d.message), asyncio.ensure_future(d.dismiss())))
        await page.click('[data-action="trigger-restore"]'); await page.wait_for_timeout(300)
        check('Dialog erklärt das Wiederherstellen (hinzugefügt, nicht ersetzt)', len(msgs) == 1 and 'hinzugefügt' in msgs[0] and 'nicht ersetzt' in msgs[0] and 'Aus Sicherung wiederherstellen' in msgs[0], str(msgs))

        # 6 Reales Verhalten: Erklaerung stimmt mit Code ueberein
        n0 = await ev("state.recipes.length")
        before = await ev("JSON.stringify(state.recipes.map(r => [r.id, r.title, r.updatedAt]).sort())")
        existing = await ev("JSON.parse(JSON.stringify(state.recipes[0]))")
        newr = json.loads(json.dumps(existing)); newr['id'] = 'r_p37_new'; newr['title'] = 'P37 Neues Testrezept'; newr['ingredients'] = [{'amount': 1, 'unit': 'Stk', 'name': 'Testzutat'}]
        data = {'app': 'savora', 'version': 3, 'schemaVersion': 4, 'recipes': [existing, newr], 'shopping': []}
        path = OUT + '/p37-backup.json'; json.dump(data, open(path, 'w'))
        await go('settings-backup')
        await page.set_input_files('#restoreFileInput', path); await page.wait_for_timeout(1500)
        n1 = await ev("state.recipes.length")
        after = await ev("JSON.stringify(state.recipes.filter(r => r.id !== 'r_p37_new').map(r => [r.id, r.title, r.updatedAt]).sort())")
        check('Wiederherstellen ergänzt (+1), Gleiches nicht doppelt, nichts ersetzt oder gelöscht', n1 == n0 + 1 and after == before, f'{n0}->{n1}')
        st = await ev("document.getElementById('backupStatus').innerText")
        check('Statusmeldung nennt Ergebnis', '1 Rezept' in st and 'nicht doppelt' in st, st)

        # 7 Name beim Teilen
        await go('settings-share'); t = await main_text()
        check('Abschnitt «Name beim Teilen (freiwillig)» mit Hinweis', 'Name beim Teilen (freiwillig)' in t.replace('NAME BEIM TEILEN (FREIWILLIG)', 'Name beim Teilen (freiwillig)') and 'Wird nur gedruckt, wenn du ihn selbst im Kochbuch oder beim Teilen einschaltest.' in t, t[-300:])
        await page.fill('#f-sender-name', 'Anna'); await page.click('[data-action="save-profile-fields"]'); await page.wait_for_timeout(200)
        check('Name wird gespeichert', await ev("state.senderName === 'Anna' && localStorage.getItem(SENDER_NAME_KEY) === 'Anna'"))
        pm = await ev("JSON.stringify(pdfBuildModel(state.recipes[0], null))")
        check('Name erscheint nicht ungefragt im PDF-Modell', 'Anna' not in pm)
        check('Name erscheint nicht im Sendeinhalt', 'Anna' not in json.dumps(await ev("shareBuildPayload(state.recipes[0])")))
        await ev("() => { state.senderName = ''; localStorage.removeItem(SENDER_NAME_KEY); }")
        await go('settings-profile')
        check('Profilseite zeigt nur noch den Namen (kein Kochbuch-Titel)', 'Dein Name' in await main_text() and await ev("document.getElementById('f-cookbook-title') === null"))

        # 8 Datenquellen und Lizenzen erreichbar
        await go('settings-about')
        reach = await ev("Array.from(document.querySelectorAll('[data-view]')).map(b => b.dataset.view)")
        check('Über Savora führt zu Datenquellen und Lizenzen', 'settings-sources' in reach and 'settings-licenses' in reach, str(reach))
        await page.click('[data-view="settings-sources"]'); await page.wait_for_timeout(200)
        check('Datenquellen öffnen sich', 'schweizer nährwertdatenbank' in (await main_text()).lower())
        await go('settings-licenses'); check('Lizenzen öffnen sich', 'Roboto' in await main_text())

        # 9 Hilfe erhalten
        await go('settings-help'); t = await ev("document.body.innerText")
        check('Hilfe erhalten: Titel, kein «Feedback»', 'Hilfe erhalten' in t and 'Feedback' not in t)

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
        await ev("() => { document.documentElement.style.fontSize = ''; }")
        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await browser.close()
    print('\nFEHLER:' if FAIL else '\nALLES OK', FAIL if FAIL else '')
    sys.exit(1 if FAIL else 0)

asyncio.run(main())
