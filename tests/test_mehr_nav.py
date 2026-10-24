"""Mehr und Einstellungen (Teilauftrag M1): fünf Navigationspunkte, «Mehr» auf allen Unterseiten aktiv, Gruppen und Texte,
alte Routen als Verweise, Farbschema nur an einer Stelle, Kochen & Mengen, Hilfe und Über, fünf Breiten ohne
horizontales Scrollen, Hell und Dunkel, Zurück mit Scrollposition, Fokus auf dem Titel. Echte Navigation per Klick."""
import asyncio, sys, os as _os
sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

SHOTS = _os.environ.get('SAVORA_M1_SHOTS')   # optional: Screenshots-Ordner (ausserhalb des Repos)
HIDE_SCROLLBARS = "::-webkit-scrollbar{display:none} html{scrollbar-width:none}"

async def go(page, view):
    await page.evaluate("(v) => { state.modal = null; state.view = v; render(); }", view)
    await page.wait_for_timeout(250)

async def click_nav(page, text):
    await page.evaluate("(t) => { const b = Array.from(document.querySelectorAll('.bottom-nav button')).find(x => x.querySelector('.nav-label').textContent.trim() === t); b.click(); }", text)
    await page.wait_for_timeout(300)

async def row(page, title):
    await page.evaluate("(t) => { const b = Array.from(document.querySelectorAll('.settings-row')).find(x => x.querySelector('.settings-row-title').textContent.trim() === t); b.click(); }", title)
    await page.wait_for_timeout(350)

async def main():
    async with async_playwright() as p:
        browser, ctx = await open_ctx(p, 390, 844)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(400)
        await page.add_style_tag(content=HIDE_SCROLLBARS)
        ev = page.evaluate

        # ---- Navigation: genau fünf Punkte, letzter «Mehr» ----
        labels = await ev("() => Array.from(document.querySelectorAll('.bottom-nav button .nav-label')).map(b => b.textContent.trim())")
        check('Navigation: genau fünf Punkte Rezepte, Wochenplan, Einkauf, Kochbücher, Mehr', labels == ['Rezepte', 'Wochenplan', 'Einkauf', 'Kochbücher', 'Mehr'], str(labels))
        check('Navigation: kein Eintrag «Einstellungen»', 'Einstellungen' not in labels)

        # ---- Mehr: Gruppen und Texte genau nach Vorgabe ----
        await click_nav(page, 'Mehr')
        check('Mehr: Route more', await ev("state.view") == 'more')
        groups = await ev("() => Array.from(document.querySelectorAll('.settings-group')).map(g => [g.querySelector('.settings-group-title').textContent.trim(), Array.from(g.querySelectorAll('.settings-row')).map(r => [r.querySelector('.settings-row-title').textContent.trim(), r.querySelector('.settings-row-summary').textContent.trim()])])")
        # v91.3 (Nutzerwunsch): «Austauschen» und «Rezeptbibliothek» als eine Gruppe «Teilen», kürzere Untertitel
        # v91.12 (Nutzerwunsch): öffentliches Profil und öffentliche Rezepte in «Mein Konto»; «Mehr» passt ohne Scrollen auf einen Bildschirm
        want = [['Alltag', [['Freunde', 'Empfangene Rezepte und Kontakte'], ['Vorrat', 'Was kann ich damit kochen?'], ['Einheiten umrechnen', 'Gewicht, Volumen, Temperatur'], ['Papierkorb', 'Nichts gelöscht']]],
                ['App', [['Hilfe & Kontakt', 'Antworten und Unterstützung'], ['Einstellungen', 'Sicherung, Abgleich, Darstellung']]]]
        # v91.7: «Über Savora» als Fusszeile mit Version
        check('Mehr: Fusszeile «Über Savora · Version» führt zu Über Savora', await ev("() => { const f = document.querySelector('.more-footer'); return !!f && f.textContent.includes('Über Savora') && f.textContent.includes(APP_VERSION) && f.dataset.view === 'settings-about'; }"))
        # v89: oben eine Statuszeile «Daten» (echter Sicherungsstand), v90: dazu «Zuletzt gelöscht», danach die bisherigen Gruppen unverändert
        # v91.11 (Nutzerwunsch): keine Gruppe «Daten» mehr auf «Mehr»; Sicherung und Abgleich nur in den Einstellungen, fehlende Sicherung als Etikett an «Einstellungen»
        check('Mehr: keine Sicherung und kein Abgleich mehr auf «Mehr», Etikett «Sicherung fehlt» an Einstellungen', not any(r[0].startswith('Sicherung') for g in groups for r in g[1]) and await ev("() => { const c = document.querySelector('.settings-row[data-view=\"settings\"] .settings-row-chip'); return !!c && c.textContent.trim() === 'Sicherung fehlt'; }"), str(groups[:1]))
        check('Mehr: Gruppen Alltag und App mit den Vorgabetexten', groups == want, str(groups))
        check('Mehr: Seitentitel «Mehr» als h1', await ev("() => document.querySelector('main h1').textContent.trim()") == 'Mehr')
        check('Mehr: keine Farbschema-Auswahl auf der Übersicht, nur der Schnellschalter oben rechts (v91.2, Nutzerwunsch)', await ev("() => !document.querySelector('.theme-opt') && document.querySelectorAll('[data-action=\"set-theme\"]').length === 1 && !!document.querySelector('.page-title-row .theme-quick-toggle')"))
        check('Mehr: Zähler fehlt ohne echte Daten', await ev("() => !document.querySelector('.settings-row-badge')"))
        await ev("() => { share.count = 3; render(); }")
        check('Mehr: Zähler «3 neu» aus share.count', await ev("() => (document.querySelector('.settings-row-badge') || {}).textContent") == '3 neu')
        await ev("() => { share.count = 0; render(); }")
        check('Mehr: Pfeil an jeder Zeile (alle sind Navigation)', await ev("() => Array.from(document.querySelectorAll('.settings-row')).every(r => !!r.querySelector('.settings-row-chevron'))"))

        # ---- Mehr bleibt auf allen Unterseiten aktiv ----
        subs = ['more', 'settings', 'settings-account', 'settings-sync', 'settings-backup', 'settings-display', 'settings-cooking', 'settings-offline',
                'settings-help', 'settings-about', 'settings-privacy', 'settings-terms', 'settings-sources', 'settings-licenses', 'unitconverter', 'friends',
                'settings-share', 'settings-data', 'settings-units', 'settings-nutrition', 'settings-profile']
        bad = []
        for v in subs:
            await go(page, v)
            r = await ev("() => ({ act: Array.from(document.querySelectorAll('.bottom-nav button.active .nav-label')).map(b => b.textContent.trim()), cur: Array.from(document.querySelectorAll('.bottom-nav [aria-current=page] .nav-label')).map(b => b.textContent.trim()), n: document.querySelector('#app').innerText.length })")
            if r['act'] != ['Mehr'] or r['cur'] != ['Mehr'] or r['n'] < 20: bad.append((v, r))
        check('Mehr ist auf allen Unterseiten und alten Routen als einziger Punkt aktiv markiert', not bad, str(bad[:3]))
        for v in ['home', 'mealplan', 'shopping', 'cookbooks']:
            await go(page, v)
            act = await ev("() => Array.from(document.querySelectorAll('.bottom-nav button.active .nav-label')).map(b => b.textContent.trim())")
            if act == ['Mehr']: bad.append(v)
        check('Mehr ist auf den vier anderen Hauptseiten nicht aktiv', not bad, str(bad))

        # ---- Einstellungen: Gruppen ----
        await go(page, 'more'); await row(page, 'Einstellungen')
        check('Mehr > Einstellungen öffnet die Übersicht', await ev("state.view") == 'settings' and await ev("() => document.querySelector('.topbar-title').textContent.trim()") == 'Einstellungen')
        groups = await ev("() => Array.from(document.querySelectorAll('.settings-group')).map(g => [g.querySelector('.settings-group-title').textContent.trim(), Array.from(g.querySelectorAll('.settings-row')).map(r => r.querySelector('.settings-row-title').textContent.trim())])")
        check('Einstellungen: «Daten» (Sicherung, Geräteabgleich) und «App anpassen»; Mein Konto über die Profilkarte (v91.11)', groups == [['Daten', ['Sicherung', 'Geräteabgleich']], ['App anpassen', ['Darstellung', 'Kochen & Mengen', 'Ohne Internet']]], str(groups))
        sums = await ev("() => Array.from(document.querySelectorAll('.settings-row-summary')).map(s => s.textContent.trim())")
        check('Einstellungen: Untertitel zeigen echte Werte', sums[0] == 'Noch keine Sicherung heruntergeladen' and sums[1] == 'Nicht angemeldet' and sums[2] == 'Wie dein Gerät' and sums[3].startswith('Gramm und Milliliter, Nährwerte sichtbar'), str(sums))
        for k, (t, view) in enumerate([('Geräteabgleich', 'settings-sync'), ('Sicherung', 'settings-backup'), ('Darstellung', 'settings-display'), ('Kochen & Mengen', 'settings-cooking'), ('Ohne Internet', 'settings-offline')]):
            await go(page, 'settings'); await row(page, t)
            check(f'Einstellungen > {t} öffnet {view}', await ev("state.view") == view)
        # Zurück führt Schritt für Schritt zum Ursprung
        await go(page, 'more'); await row(page, 'Einstellungen'); await row(page, 'Darstellung')
        await page.click('[data-action="back"]'); await page.wait_for_timeout(400)
        check('Zurück aus Darstellung führt zu Einstellungen', await ev("state.view") == 'settings')
        await page.click('[data-action="back"]'); await page.wait_for_timeout(400)
        check('Zurück aus Einstellungen führt zu Mehr', await ev("state.view") == 'more')
        await row(page, 'Hilfe & Kontakt'); await page.go_back(); await page.wait_for_timeout(400)
        check('Browser-Zurück aus Hilfe führt zu Mehr', await ev("state.view") == 'more')
        await row(page, 'Einheiten umrechnen')
        check('Einheiten umrechnen öffnet den bestehenden Rechner', await ev("state.view") == 'unitconverter' and await ev("() => !!document.querySelector('.uc-card, .uc-tabs, [data-action=\"uc-tab\"]')"))
        await page.click('[data-action="back"]'); await page.wait_for_timeout(400)
        check('Zurück aus dem Rechner führt zu Mehr', await ev("state.view") == 'more')

        # Scrollposition beim Zurück
        await go(page, 'settings-help')
        await ev("() => { document.body.style.minHeight = '3000px'; }")
        await ev("() => document.querySelectorAll('.faq').forEach(f => f.open = true)")
        await page.wait_for_timeout(200)
        await ev("() => window.scrollTo(0, 0)")
        await go(page, 'more'); await row(page, 'Hilfe & Kontakt')
        await ev("() => { document.querySelectorAll('.faq').forEach(f => f.open = true); window.scrollTo(0, 400); }"); await page.wait_for_timeout(200)
        y1 = await ev("window.scrollY")
        await ev("() => { state.view = 'settings-privacy'; render(); }"); await page.wait_for_timeout(300)
        y_top = await ev("window.scrollY")
        await page.click('[data-action="back"]'); await page.wait_for_timeout(500)
        y2 = await ev("window.scrollY")
        check('Neue Unterseite startet oben, Zurück stellt die Scrollposition wieder her', y1 > 100 and y_top == 0 and abs(y2 - y1) < 5, str((y1, y_top, y2)))

        # Fokus auf dem Titel
        await go(page, 'more'); await row(page, 'Einstellungen')
        foc = await ev("() => document.activeElement && document.activeElement.tagName + ':' + document.activeElement.textContent.trim()")
        check('Fokus nach Seitenwechsel auf dem Seitentitel', foc == 'H1:Einstellungen', str(foc))

        # ---- Darstellung ----
        await go(page, 'settings-display')
        check('Darstellung: genau eine Farbschema-Steuerung', await ev("() => document.querySelectorAll('[data-action=\"set-theme\"]').length") == 3)
        opts = await ev("() => Array.from(document.querySelectorAll('[data-action=\"set-theme\"]')).map(b => b.querySelector('.theme-opt-label').textContent.trim())")
        check('Darstellung: Hell, Dunkel, Wie dein Gerät', opts == ['Hell', 'Dunkel', 'Wie dein Gerät'], str(opts))
        check('Darstellung: kein «System» irgendwo', await ev("() => !/\\bSystem\\b/.test(document.querySelector('#app').innerText)"))
        check('Darstellung: kein Rechner und keine Einheiten', await ev("() => !/Rechner|Einheiten|Nährwerte/.test(document.querySelector('main').innerText)"))
        check('Darstellung: gewählter Eintrag mit Text «Ausgewählt» und aria-checked', await ev("() => { const a = document.querySelector('.theme-opt.active'); return a.getAttribute('aria-checked') === 'true' && /Ausgewählt/.test(a.textContent) && document.querySelectorAll('.theme-opt[aria-checked=true]').length === 1; }"))
        await page.click('[data-action="set-theme"][data-theme="dark"]'); await page.wait_for_timeout(600)
        r = await ev("() => ({ t: state.theme, ls: localStorage.getItem('savora-theme'), attr: document.documentElement.getAttribute('data-theme'), active: document.querySelector('.theme-opt.active .theme-opt-label').textContent.trim(), txt: /Ausgewählt/.test(document.querySelector('.theme-opt.active').textContent), other: document.querySelectorAll('.theme-opt[aria-checked=true]').length })")
        check('Dunkel wirkt sofort, wird gespeichert und ist durch Text markiert', r['t'] == 'dark' and r['ls'] == 'dark' and r['attr'] == 'dark' and r['active'] == 'Dunkel' and r['txt'] and r['other'] == 1, str(r))
        await page.reload(); await page.wait_for_function("typeof state !== 'undefined' && document.getElementById('app').children.length > 0"); await page.wait_for_timeout(500)
        check('Farbschema bleibt nach dem Neuladen erhalten', await ev("state.theme") == 'dark' and await ev("document.documentElement.getAttribute('data-theme')") == 'dark')
        await page.add_style_tag(content=HIDE_SCROLLBARS)
        await go(page, 'settings-display'); await page.click('[data-action="set-theme"][data-theme="auto"]'); await page.wait_for_timeout(600)
        check('«Wie dein Gerät» wählbar und gespeichert', await ev("localStorage.getItem('savora-theme')") == 'auto')
        await page.click('[data-action="set-theme"][data-theme="light"]'); await page.wait_for_timeout(600)
        check('Hell wählbar', await ev("state.theme") == 'light')

        # ---- Kochen & Mengen ----
        await go(page, 'settings-units')
        check('Alte Route settings-units zeigt Kochen & Mengen', await ev("() => document.querySelector('.topbar-title').textContent.trim()") == 'Kochen & Mengen')
        titles = await ev("() => Array.from(document.querySelectorAll('.settings-group-title')).map(t => t.textContent.trim())")
        check('Kochen & Mengen: «Einheiten beim Import» und Nährwerte-Schalter', titles[0] == 'Einheiten beim Import' and await ev("() => !!document.querySelector('button[role=switch]')"), str(titles))
        check('Kochen & Mengen: kein Farbschema', await ev("() => !document.querySelector('[data-action=\"set-theme\"]')"))
        check('Kochen & Mengen: wahrheitsgemässe Erklärung', await ev("() => /Gespeicherte Rezepte bleiben unverändert/.test(document.querySelector('main').innerText)"))
        n0 = await ev("() => state.recipes.map(r => JSON.stringify(r.ingredients)).join('|')")
        await page.click('[data-system="imperial"]'); await page.wait_for_timeout(300)
        check('Einheiten: US-Masse gewählt und gespeichert, Rezepte unverändert', await ev("state.unitSystem") == 'imperial' and await ev("localStorage.getItem('savora-unit-system')") == 'imperial' and await ev("() => state.recipes.map(r => JSON.stringify(r.ingredients)).join('|')") == n0)
        await page.click('[data-system="metric"]'); await page.wait_for_timeout(300)
        sw = await ev("() => { const s = document.querySelector('button[role=switch]'); return [s.getAttribute('aria-checked'), s.getAttribute('aria-labelledby'), s.getAttribute('aria-describedby'), document.getElementById('nutritionDesc').textContent.trim()]; }")
        check('Nährwerte-Schalter: zugänglich, an, mit Beschreibung', sw[0] == 'true' and sw[1] == 'nutritionLabel' and sw[2] == 'nutritionDesc' and sw[3] == 'In Rezepten und im PDF-Export. Gespeicherte Werte bleiben erhalten.', str(sw))
        before = await ev("() => JSON.stringify(state.recipes.map(r => r.nutrition || null))")
        await page.click('button[role=switch]'); await page.wait_for_timeout(300)
        check('Nährwerte ausblenden: Schalter aus, Reiter weg, Daten unverändert', await ev("state.showNutrition") is False and await ev("() => document.querySelector('button[role=switch]').getAttribute('aria-checked')") == 'false' and await ev("() => JSON.stringify(state.recipes.map(r => r.nutrition || null))") == before)
        await page.click('button[role=switch]'); await page.wait_for_timeout(300)
        check('Nährwerte wieder einblenden', await ev("state.showNutrition") is True)

        # ---- Hilfe & Über ----
        await go(page, 'settings-help')
        check('Hilfe: Titel «Hilfe & Kontakt»', await ev("() => document.querySelector('.topbar-title').textContent.trim()") == 'Hilfe & Kontakt')
        gt = await ev("() => Array.from(document.querySelectorAll('.settings-group-title')).map(t => t.textContent.trim())")
        check('Hilfe: Fragen nach Aufgaben gruppiert', gt == ['Kontakt aufnehmen', 'Rezepte', 'Daten & Geräte', 'Kochen', 'Freunde & Teilen'], str(gt))
        mail = await ev("() => (document.querySelector('a.help-contact-btn') || {}).getAttribute && document.querySelector('a.help-contact-btn').getAttribute('href')")
        check('Hilfe: Kontaktadresse aus der Konfiguration (mailto, kein Auto-Versand)', mail == 'mailto:' + await ev("LEGAL.email"), str(mail))
        check('Hilfe: kein Socialize, keine alten Pfadnamen', await ev("() => !/Socialize|Konto und Sicherung/.test(document.querySelector('#app').innerText + document.querySelector('#app').innerHTML)"))
        await go(page, 'settings-about')
        ab = await ev("() => document.querySelector('main').innerText")
        check('Über Savora: echte Version, Datenschutz, Nutzungsbedingungen, Datenquellen', ('Version ' + await ev("APP_VERSION")) in ab and 'Datenschutz' in ab and 'Nutzungsbedingungen' in ab and 'Quellen & Lizenzen' in ab)
        await go(page, 'settings-sources')
        check('Lizenzen bleiben erreichbar', await ev("() => !!Array.from(document.querySelectorAll('.settings-row')).find(r => /Lizenzen/.test(r.textContent))"))
        check('Keine sichtbaren Socialize-Texte in Mehr, Einstellungen, Hilfe, Über', await ev("""() => { let bad = []; for (const v of ['more', 'settings', 'settings-help', 'settings-about', 'settings-privacy', 'settings-display', 'settings-cooking']) { state.view = v; render(); const t = document.querySelector('#app').innerText; if (/Socialize/i.test(t)) bad.push(v); } return bad.length === 0; }"""))

        # Alte Routen: Verweise auf die neuen Ziele
        alias = {'settings-data': 'Geräteabgleich', 'settings-sync': 'Geräteabgleich', 'settings-nutrition': 'Kochen & Mengen', 'settings-units': 'Kochen & Mengen', 'settings-display': 'Darstellung'}
        bad = []
        for v, t in alias.items():
            await go(page, v)
            sub = await ev("() => (document.querySelector('.settings-subnav-item.active') || {}).textContent")
            top = await ev("() => document.querySelector('.topbar-title').textContent.trim()")
            if (sub or '').strip() != t and top != t: bad.append((v, sub, top))
        check('Alte Routen zeigen auf die neuen Ziele (Deep-Links)', not bad, str(bad))

        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await ctx.close(); await browser.close()

        # ---- Fünf Breiten, hell und dunkel, ohne horizontales Scrollen, Tippflächen ----
        for scheme in ('light', 'dark'):
            for w, h in [(320, 640), (390, 844), (430, 932), (768, 1024), (1440, 900)]:
                browser, ctx = await open_ctx(p, w, h)
                page = await ctx.new_page(); errs2 = []
                page.on('pageerror', lambda e: errs2.append(str(e)))
                await ctx.add_init_script(f"try{{localStorage.setItem('savora-theme','{scheme}')}}catch(e){{}}")
                await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(300)
                await page.add_style_tag(content=HIDE_SCROLLBARS)
                if w == 320:
                    await page.add_style_tag(content="html{font-size:125%}")   # grosse Schrift
                bad = []
                for v in ['more', 'settings', 'settings-account', 'settings-sync', 'settings-backup', 'settings-display', 'settings-cooking', 'settings-offline', 'settings-help', 'settings-about']:
                    await page.evaluate("(v) => { state.view = v; render(); }", v); await page.wait_for_timeout(200)
                    await page.evaluate("() => document.fonts.ready")
                    ov = await overflow_info(page)
                    sw = await page.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
                    small = await page.evaluate("() => Array.from(document.querySelectorAll('main .settings-row, main .theme-opt, main .switch, .bottom-nav button, .settings-subnav-item')).filter(e => e.offsetParent !== null && e.getBoundingClientRect().height < 43.5).map(e => e.className + ':' + Math.round(e.getBoundingClientRect().height))")
                    if ov or sw > 0 or small: bad.append((v, ov[:2], sw, small[:2]))
                    if SHOTS and scheme in ('light', 'dark') and w in (390, 1440) and v in ('more', 'settings', 'settings-display', 'settings-cooking', 'settings-help'):
                        _os.makedirs(SHOTS, exist_ok=True)
                        await page.screenshot(path=_os.path.join(SHOTS, f'{v}_{w}_{scheme}.png'))
                check(f'{w}px {scheme}: kein horizontales Scrollen, Tippflächen ab 44 px', not bad, str(bad[:2]))
                if w == 1440:
                    await page.evaluate("() => { state.view = 'settings-display'; render(); }"); await page.wait_for_timeout(200)
                    sub = await page.evaluate("() => { const n = document.querySelector('.settings-subnav'); const m = document.querySelector('.settings-main'); return n && m ? [getComputedStyle(n).display, n.getBoundingClientRect().right <= m.getBoundingClientRect().left, Math.round(m.getBoundingClientRect().width), Array.from(n.querySelectorAll('.settings-subnav-item')).map(b => b.textContent.trim()).join('|'), n.querySelector('.active').textContent.trim()] : null; }")
                    check('Desktop: Abschnittsnavigation links neben dem Inhalt, begrenzte Breite', sub and sub[0] == 'block' and sub[1] and sub[2] <= 640 and sub[3] == 'Mein Konto|Geräteabgleich|Sicherung|Darstellung|Kochen & Mengen|Ohne Internet' and sub[4] == 'Darstellung', str(sub))
                    await page.evaluate("() => { document.querySelector('.settings-subnav-item[data-view=\"settings-cooking\"]').click(); }"); await page.wait_for_timeout(300)
                    check('Desktop: Abschnittsnavigation wechselt die Seite', await page.evaluate("state.view") == 'settings-cooking')
                    side = await page.evaluate("() => Array.from(document.querySelectorAll('.bottom-nav button')).map(b => b.querySelector('.nav-label').textContent.trim() + (b.classList.contains('active') ? '*' : ''))")
                    check('Desktop: Seitenleiste mit «Mehr» als aktivem Einstieg', side == ['Rezepte', 'Wochenplan', 'Einkauf', 'Kochbücher', 'Mehr*'], str(side))
                if w == 390 and scheme == 'light':
                    sub = await page.evaluate("() => { state.view = 'settings-display'; render(); const n = document.querySelector('.settings-subnav'); return n ? getComputedStyle(n).display : 'none'; }")
                    check('Handy: keine Abschnittsnavigation neben dem Inhalt', sub == 'none', sub)
                check(f'{w}px {scheme}: keine Seitenfehler', not errs2, str(errs2[:2]))
                await ctx.close(); await browser.close()
    print('\nFEHLER:' if FAIL else '\nALLE OK', FAIL if FAIL else '')
    sys.exit(1 if FAIL else 0)
asyncio.run(main())
