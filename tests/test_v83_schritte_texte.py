"""v0.83 H2: Rezeptschritte (Überschrift separat), Rezepthinweise (Stufen, nie ohne Text, «Angabe prüfen»),
Rezeptaktionen und Teilen-Menü, Profil- und Abgleichtexte, Filterfenster (Gerichtart aufklappbar, Gesamtzeit, vegetarisch inkl. vegan).
Isolierte Testrezepte (h2_*), keine echten Daten."""
import asyncio, sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

SETUP = """async () => {
  const mk = (o) => Object.assign(emptyRecipe(), o, { updatedAt: 1 });
  const karamell = mk({ id: 'h2_karamell', title: 'Karamellsauce', servings: 1, timeMinutes: 30,
    ingredients: [{ amount: '200', unit: 'g', name: 'Zucker' }, { amount: '2', unit: 'dl', name: 'Rahm' }, { amount: '', unit: '', name: 'Vanilleschote' }],
    steps: [{ text: 'Zucker karamellisieren: Den Zucker in einer Pfanne ohne Rühren goldbraun schmelzen lassen.' },
            { text: 'Rahm zugeben\\nDen warmen Rahm vorsichtig dazugiessen. Achtung: Es spritzt stark.' },
            { text: 'Achtung: Heisser Zucker verursacht schwere Verbrennungen.' },
            { text: 'Die Sauce etwa 1 Stunde abkühlen lassen.' }] });
  const sauber = mk({ id: 'h2_sauber', title: 'Tomatensalat', servings: 2, timeMinutes: 10,
    ingredients: [{ amount: '4', unit: '', name: 'Tomaten' }, { amount: '', unit: '', name: 'Salz' }], steps: [{ text: 'Tomaten schneiden und salzen.' }] });
  const vegan = mk({ id: 'h2_vegan', title: 'Linsencurry', servings: 4, timeMinutes: 40, diet: ['vegan'], categoryTags: ['curry'],
    ingredients: [{ amount: '200', unit: 'g', name: 'Linsen' }], steps: [{ text: 'Kochen.' }] });
  const veg = mk({ id: 'h2_veg', title: 'Käsespätzle', servings: 4, timeMinutes: 0, diet: ['vegetarisch'], categoryTags: ['pasta'],
    ingredients: [{ amount: '300', unit: 'g', name: 'Spätzle' }], steps: [{ text: 'Kochen.' }] });
  const fleisch = mk({ id: 'h2_fleisch', title: 'Bolognese', servings: 4, timeMinutes: 25, diet: ['fleisch'], categoryTags: ['pasta'],
    ingredients: [{ amount: '400', unit: 'g', name: 'Hackfleisch' }], steps: [{ text: 'Kochen.' }] });
  for (const r of [karamell, sauber, vegan, veg, fleisch]) await dbPut(r);
  await loadRecipes();
}"""

async def main():
    async with async_playwright() as p:
        b, c = await open_ctx(p, 390, 844); page = await c.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); ev = page.evaluate
        await ev(SETUP)
        before = await ev("() => JSON.stringify(state.recipes.find(r => r.id === 'h2_karamell'))")

        # ---------- Schritte ----------
        await ev("() => { state.activeRecipeId = 'h2_karamell'; state.view = 'detail'; state.detailTab = 'steps'; render(); }")
        await page.wait_for_selector('.step-list-v2 .step-item')
        st = await ev("""() => Array.from(document.querySelectorAll('.step-list-v2 .step-item')).map(li => ({ no: li.querySelector('.step-no').textContent.trim(),
            title: (li.querySelector('.step-title') || {}).textContent || '', text: li.querySelector('.step-body p').textContent }))""")
        check('Schritt «Titel: Text» wird in der Anzeige getrennt (Überschrift separat, Text darunter)', st[0]['title'] == 'Zucker karamellisieren' and st[0]['text'].startswith('Den Zucker'), str(st[0]))
        check('Schritt «Titel\\nText» wird getrennt, Sicherheitshinweis im Text bleibt vollständig', st[1]['title'] == 'Rahm zugeben' and 'Achtung: Es spritzt stark.' in st[1]['text'], str(st[1]))
        check('«Achtung: …» wird nie als Überschrift abgetrennt', st[2]['title'] == '' and st[2]['text'].startswith('Achtung: Heisser Zucker'), str(st[2]))
        check('Schritt ohne Überschrift bleibt normaler Absatz, Nummern fortlaufend', st[3]['title'] == '' and [s['no'] for s in st] == ['1', '2', '3', '4'], str(st))
        title_sep = await ev("() => { const t = document.querySelector('.step-title'), q = document.querySelector('.step-title + p'); return t && q ? q.getBoundingClientRect().top >= t.getBoundingClientRect().bottom - 1 : false; }")
        check('Überschrift steht sichtbar über dem Text (eigene Zeile)', title_sep)
        check('Schrittdaten bleiben unverändert (nur Anzeige)', before == await ev("() => JSON.stringify(state.recipes.find(r => r.id === 'h2_karamell'))"))
        check('stepDisplayParts: unsichere Fälle bleiben unverändert', await ev("""() => [
            stepDisplayParts('Tipp: Mit Salz abschmecken und servieren.').title, stepDisplayParts('Backen: 20 Min. bei 180 Grad.').title,
            stepDisplayParts('Dann: alles mischen.').title, stepDisplayParts('Den Ofen auf 200 Grad vorheizen.').title ].every(t => t === '')"""))

        # ---------- Hinweise ----------
        none = await ev("() => recipeCheckHtml(state.recipes.find(r => r.id === 'h2_sauber'))")
        check('Kein Hinweis: kein Hinweisbereich (Salz ohne Menge ist kein Fehler)', none == '', none[:120])
        iss = await ev("() => recipeQualityIssues(state.recipes.find(r => r.id === 'h2_karamell')).map(i => ({ id: i.id, level: i.level, text: i.text, a: !!i.action }))")
        check('Mehrere Hinweise mit Stufe error/check/info, konkretem Text und Aktion', len(iss) >= 3 and all(i['level'] in ('error', 'check', 'info') and len(i['text']) > 15 and i['a'] for i in iss), str(iss))
        check('Gesamtertrag-Hinweis (H1 yieldSuspicion) und Zeit-Hinweis (H1 timeTextSuspicion) mit konkretem Satz',
              any('Gesamtertrag' in i['text'] for i in iss) and any('Prüfe die Zeitangaben' in i['text'] and 'Schritt 4' in i['text'] for i in iss), str([i['text'] for i in iss]))
        check('Zutat ohne Menge: konkreter Satz mit Zutatname', any(i['text'].startswith('Für die Zutat „Vanilleschote“ fehlt eine Mengenangabe') for i in iss))
        one = await ev("""() => { const r = Object.assign(emptyRecipe(), { id: 'h2_tmp', title: 'Brot', servings: 0, ingredients: [{ amount: '500', unit: 'g', name: 'Mehl' }], steps: [{ text: 'Backen.' }] });
            return recipeQualityIssues(r).map(i => i.text); }""")
        check('Ein Hinweis: «Die Portionsangabe fehlt.»', len(one) == 1 and one[0].startswith('Die Portionsangabe fehlt.'), str(one))
        empty = await ev("""() => { const y = window.yieldSuspicion, t = window.timeTextSuspicion;
            window.yieldSuspicion = () => ({ text: '', field: 'servings' }); window.timeTextSuspicion = () => ({ text: '   ', field: 'restMinutes' });
            const r = state.recipes.find(x => x.id === 'h2_karamell'); const out = recipeQualityIssues(r).filter(i => !String(i.text).trim()).length; const html = recipeCheckHtml(r);
            window.yieldSuspicion = y; window.timeTextSuspicion = t; return { out, html }; }""")
        check('Fehlender Hinweistext: Hinweis wird nicht geliefert', empty['out'] == 0)
        await ev("() => { const d = document.querySelector('.recipe-check'); d.open = true; }")
        items = await ev("""() => Array.from(document.querySelectorAll('.recipe-check .rc-item')).map(li => { const p = li.querySelector('.rc-text'); const lvl = p.querySelector('.rc-level');
            return { lvl: lvl ? lvl.textContent.replace(':', '').trim() : '', rest: p.textContent.replace(lvl ? lvl.textContent : '', '').trim(), before: getComputedStyle(p.querySelector('span'), '::before').content }; })""")
        check('Kein leeres «Prüfen:»: jede Zeile hat Stufe UND Text im selben Absatz, kein CSS-Vorsatz', items and all(i['lvl'] in ('Fehler', 'Zu prüfen', 'Hinweis') and len(i['rest']) > 15 and i['before'] in ('none', 'normal') for i in items), str(items))
        go = await ev("() => Array.from(document.querySelectorAll('.recipe-check [data-action=rc-open-field]')).map(b => [b.textContent.trim(), (document.getElementById(b.getAttribute('aria-describedby')) || {}).textContent || ''])")
        check('Aktion je Hinweis mit Ziel im Namen (Portionen/Zeit/Zutat prüfen) und Verweis auf den Hinweistext', len(go) == len(items) and [g[0] for g in go] == ['Portionen prüfen', 'Zeit prüfen', 'Zutat prüfen'] and all(len(g[1]) > 15 for g in go), str(go))

        # Direktsprung zum Editor: Zeit-Hinweis -> Feld «Ruhen»
        await ev("() => { window.scrollTo(0, 0); }")
        await ev("() => { const i = recipeQualityIssues(state.recipes.find(r => r.id === 'h2_karamell')).find(x => x.id === 'time-text'); document.querySelector(`[data-action=rc-open-field][data-issue=\"${i.id}\"]`).click(); }")
        await page.wait_for_function("state.view === 'form' && document.activeElement && document.activeElement.id === 'f-rest'", timeout=5000)
        check('Direktsprung: Editor offen, Feld «Ruhen» im zugeklappten Abschnitt aufgeklappt und fokussiert', await ev("() => { const d = document.getElementById('f-rest').closest('details'); return !d || d.open; }"))
        await page.go_back(); await page.wait_for_function("state.view === 'detail'", timeout=5000)
        check('Rückkehr: Rezeptseite mit Reiter «Zubereitung», Rezept unverändert', await ev("state.activeRecipeId") == 'h2_karamell' and await ev("document.querySelector('.tab-v2.is-active').textContent.trim()") == 'Zubereitung' and before == await ev("() => JSON.stringify(state.recipes.find(r => r.id === 'h2_karamell'))"))
        # Zutat ohne Menge -> Schritt «Zutaten», Mengenfeld der Zeile 3
        await ev("() => { document.querySelector('.recipe-check').open = true; document.querySelector('[data-action=rc-open-field][data-issue=\"no-amounts\"]').click(); }")
        await page.wait_for_function("state.view === 'form' && document.activeElement && document.activeElement.classList.contains('ing-amount-input')", timeout=5000)
        row = await ev("() => document.activeElement.closest('[data-ing-row]').dataset.ingRow")
        check('Direktsprung Zutat: Schritt «Zutaten», Mengenfeld der betroffenen Zeile', await ev("state.formStep") == 2 and row == '2', row)
        # Im Editor: Eingabe bleibt beim Sprung erhalten
        await page.fill('[data-ing-row="2"] .ing-amount-input', '1')
        await ev("() => document.querySelector('[data-action=form-goto-step][data-idx=\"4\"]').click()")
        await page.wait_for_selector('.recipe-check--form')
        await ev("() => document.querySelector('.recipe-check--form [data-action=rc-open-field][data-issue=\"time-text\"]').click()")
        await page.wait_for_function("document.activeElement && document.activeElement.id === 'f-rest'", timeout=5000)
        kept = await ev("() => collectFormData().ingredients[2].amount")
        check('Sprung innerhalb des Editors: ungespeicherte Eingabe bleibt erhalten', str(kept) == '1', str(kept))
        await ev("() => { state.editingRecipeSnapshot = null; clearRecipeDraft && clearRecipeDraft(); state.view = 'detail'; render(); }")

        # ---------- Rezeptaktionen und Teilen ----------
        await ev("() => { state.activeRecipeId = 'h2_karamell'; state.view = 'detail'; render(); }")
        labels = await ev("() => Array.from(document.querySelectorAll('.detail-tools .tool-action span')).map(s => s.textContent.trim())")
        check('Rezeptaktionen ausgeschrieben', labels == ['Auf die Einkaufsliste', 'Zum Wochenplan', 'Bearbeiten', 'Teilen'], str(labels))
        await ev("() => document.querySelector('.detail-tools [data-action=open-share-menu]').click()")
        await page.wait_for_selector('.share-menu')
        sm = await ev("() => Array.from(document.querySelectorAll('.share-menu .menu-item')).map(b => b.dataset.action + '|' + b.textContent.trim())")
        check('Teilen-Menü (nicht veröffentlicht): An Freunde senden, kein öffentlicher Link, Veröffentlichen, Als PDF exportieren', any(x.startswith('share-open-send|An Freunde senden') for x in sm) and not any('share-public-link' in x for x in sm) and any('lib-pub-open' in x for x in sm) and any(x == 'share-recipe|Als PDF exportieren' for x in sm), str(sm))
        await page.keyboard.press('Escape'); await page.wait_for_function("!state.modal", timeout=5000)
        await ev("""() => { lib.mine.items = [{ id: 'pub123abc', source_local_id: 'h2_karamell', status: 'published', updated_at: '2026-10-15' }];
            window.__shared = null; window.libShareNative = async (url, title) => { window.__shared = { url, title }; return 'shared'; }; render(); }""")
        await ev("() => document.querySelector('.detail-tools [data-action=open-share-menu]').click()")
        await page.wait_for_selector('.share-menu [data-action=share-public-link]')
        check('Teilen-Menü (veröffentlicht): «Öffentlichen Link teilen» vorhanden', 'Öffentlichen Link teilen' in await ev("() => document.querySelector('[data-action=share-public-link]').textContent"))
        await ev("() => document.querySelector('[data-action=share-public-link]').click()")
        await page.wait_for_function("window.__shared", timeout=5000)
        sh = await ev("window.__shared")
        check('Öffentlicher Link zeigt auf die Veröffentlichung (nicht die lokale ID)', sh['url'].endswith('?rezept=pub123abc'), str(sh))
        await ev("() => { lib.mine.items = []; }")
        await page.wait_for_function("!state.modal", timeout=5000)
        dm = await ev("() => { openModal({ type: 'detail-menu', recipeId: 'h2_karamell' }); return Array.from(document.querySelectorAll('.menu-list .menu-item span:first-child, .menu-list .menu-item > span')).map(s => s.textContent.trim()); }")
        check('Menü: «Zum Wochenplan», Teilen-Gruppe klar getrennt, PDF nur einmal', 'Zum Wochenplan' in dm and 'An Freunde senden' in dm and 'An Freund in Savora senden' not in dm and dm.count('Als PDF exportieren') == 1, str(dm))
        await page.keyboard.press('Escape'); await page.wait_for_function("!state.modal", timeout=5000)

        # 320 px: keine horizontale Scrollleiste, Aktionen nicht abgeschnitten
        await page.set_viewport_size({ 'width': 320, 'height': 740 }); await ev("render()"); await page.wait_for_timeout(200)
        ov = await ev("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
        clip = await ev("() => Array.from(document.querySelectorAll('.detail-tools .tool-action')).filter(b => b.scrollWidth > b.clientWidth + 1 || b.getBoundingClientRect().height < 44).length")
        check('320 px: keine horizontale Scrollleiste, Aktionen vollständig und mind. 44 px hoch', ov <= 0 and clip == 0, f'{ov} {clip} {await overflow_info(page)}')
        await page.set_viewport_size({ 'width': 390, 'height': 844 })

        # ---------- Filter ----------
        await ev("() => { state.view = 'home'; render(); openModal({ type: 'filter-sheet' }); }")
        await page.wait_for_selector('.filter-sheet')
        groups = await ev("() => Array.from(document.querySelectorAll('.fs-legend')).map(e => e.textContent.trim())")
        check('Filtergruppen Ernährung, Mahlzeit, Gerichtart, Gesamtzeit, Weitere Merkmale', groups[:5] == ['Ernährung', 'Mahlzeit', 'Gerichtart', 'Gesamtzeit', 'Weitere Merkmale'], str(groups))
        vis = "() => Array.from(document.querySelectorAll('[data-fs-group=dish] .fs-opt')).filter(o => o.offsetParent !== null).length"
        total = await ev("() => DISH_TYPE_OPTIONS.length")
        check('Gerichtart: zuerst 8 sichtbar, Rest aufklappbar', await ev(vis) == 8 and total > 8, str(await ev(vis)))
        await ev("() => document.querySelector('.fs-more-toggle').click()")
        check('Aufklappen zeigt alle Gerichtarten', await ev(vis) == total and await ev("document.querySelector('.fs-more-toggle').getAttribute('aria-expanded')") == 'true')
        last = await ev("() => DISH_TYPE_OPTIONS[DISH_TYPE_OPTIONS.length - 1].id")
        await page.click(f'[data-fs-group=dish] .fs-input[value="{last}"] >> xpath=..')
        await ev("() => document.querySelector('.fs-more-toggle').click()")
        check('Zuklappen: gewählte ausgeblendete Option bleibt sichtbar und gewählt', await ev(vis) == 9 and await ev(f"() => document.querySelector('[data-fs-group=dish] .fs-input[value=\"{last}\"]').checked") and await ev(f"() => filterDraft().category.has('{last}')"))
        await page.click(f'[data-fs-group=dish] .fs-input[value="{last}"] >> xpath=..')
        cnt = "() => applyAllFilters(state.recipes, filterDraft()).map(r => r.id).sort()"
        await page.click('.fs-input[data-fs-dim="dietary"][value="vegetarisch"] >> xpath=..')
        r1 = await ev(cnt)
        check('Vegetarisch schliesst vegan ein, Fleisch nicht', 'h2_vegan' in r1 and 'h2_veg' in r1 and 'h2_fleisch' not in r1, str(r1))
        check('Live-Trefferzahl im Anwenden-Knopf', await ev("document.querySelector('.fs-apply').textContent.trim()") == f'{len(r1)} Rezepte anzeigen')
        await page.click('.fs-input[data-fs-dim="dietary"][value="vegetarisch"] >> xpath=..')
        await page.click('.fs-input[data-fs-dim="time"][value="under-60"] >> xpath=..')
        r2 = await ev(cnt)
        check('Gesamtzeit: unbekannte Zeit ist nie ein Treffer', 'h2_veg' not in r2 and 'h2_vegan' in r2, str(r2))
        check('Zeitbasis klar benannt (Gesamtzeit, Hinweis zu fehlender Zeit)', 'ohne Zeitangabe' in await ev("document.querySelector('[data-fs-group=time] .fs-hint').textContent"))
        await page.click('.fs-apply')
        await page.wait_for_function("!state.modal", timeout=5000)
        check('Anwenden übernimmt die Auswahl', await ev("state.activeFilters.time.has('under-60')"))
        await ev("() => { resetExtraFilters(); render(); }")

        # ---------- Konto- und Abgleichtexte ----------
        await ev("() => { window.cloudSession = () => ({ access_token: 'x', user: { id: 'u1', email: 'test@example.test' } }); state.view = 'settings-account'; render(); }")
        await page.wait_for_selector('.kd-link')
        t = await ev("() => document.querySelector('main').innerText")
        rows = await ev("() => Array.from(document.querySelectorAll('.kd-link')).map(b => b.dataset.view)")
        check('Konto: öffentliches Profil = Rezeptbibliothek, Freunde-Profil getrennt, keine doppelte Verwaltung (nur Verweise)', 'lib-pubprofile' in rows and 'friends-profile' in rows and 'Sichtbar für alle' in t and 'Sichtbar für deine Freunde' in t and 'Einladungscode bleibt privat' in t and 'Nur nötig, wenn du Rezepte mit Freunden' not in t, str(rows))
        await ev("() => { state.view = 'settings-sync'; render(); }")
        t = await ev("() => document.querySelector('main').innerText")
        check('Geräteabgleich: vereinbarter Zwecksatz, unterstützte Datenarten direkt darunter', 'Hält deine Rezepte und unterstützten Daten auf deinen Geräten aktuell.' in t and await ev("() => !!document.querySelector('.kd-bullets--lead')"))
        await ev("() => { state.view = 'settings-backup'; render(); }")
        t = await ev("() => document.querySelector('main').innerText")
        check('Sicherung: vereinbarter Zwecksatz, kein «alle Daten»-Versprechen', 'Erstellt eine Datei, mit der du deine Daten später wiederherstellen kannst.' in t and 'alle Daten' not in t and 'Alle Daten' not in t)
        await page.screenshot(path=_os.path.join(OUT, 'v83-sicherung-390.png'))

        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await b.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
