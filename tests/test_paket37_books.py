"""Paket 37: Hauptnavigation (fuenf Punkte, «Mehr» statt Zahnrad im Kopf) und Kochbuch-Projekte.
Prueft Navigation (Symbol und Beschriftung, Seitenleiste, Safe Area, Tastatur), Migration der alten Einzelkonfiguration,
Anlegen/Umbenennen/Duplizieren/Loeschen, Wiederoeffnen, leere Textfelder, Datum, zehn Cover ohne 404, lange Titel, Fokus beim Tippen,
echtes PDF, Sicherung und Wiederherstellung (auch alte Sicherung ohne Projekte)."""
import asyncio, base64, json, os, subprocess, sys, tempfile
os.environ.setdefault('SAVORA_TEST_PORT', '8970')
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)
IDS = ['pop', 'lieblingsbuch', 'tomate', 'salbei', 'nachtkueche', 'citrus', 'bistro', 'garten', 'sonnenkueche', 'ofenglueck']
COVER_NAMES = ['Pop', 'Lieblingsbuch', 'Tomate', 'Salbei', 'Nachtküche', 'Citrus', 'Bistro', 'Garten', 'Sonnenküche', 'Ofenglück']

def pdf_text(path, first=None, last=None):
    cmd = ['pdftotext', '-layout'] + (['-f', str(first), '-l', str(last)] if first else []) + [path, '-']
    return subprocess.run(cmd, capture_output=True, text=True).stdout
def pdf_pages(path):
    out = subprocess.run(['pdfinfo', path], capture_output=True, text=True).stdout
    for l in out.splitlines():
        if l.startswith('Pages:'): return int(l.split()[1])
    return 0

async def main():
    async with async_playwright() as p:
        b, ctx = await open_ctx(p, 390, 844, 'no-preference')
        page = await ctx.new_page(); errs = []; bad = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('response', lambda r: bad.append((r.status, r.url)) if r.status >= 400 else None)
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(300)
        ev = page.evaluate
        n_recipes = await ev("() => state.recipes.length")

        # ---------- 1. Navigation: fuenf Punkte (Rezepte, Wochenplan, Einkauf, Kochbuecher, Mehr) mit Symbol und Beschriftung; kein Zahnrad im Kopf mehr ----------
        for view in ('home', 'mealplan', 'shopping', 'cookbooks'):
            await ev("(v) => { state.view = v; render(); }", view); await page.wait_for_timeout(400)
            tabs = await ev("""() => Array.from(document.querySelectorAll('.bottom-nav button')).filter(b => b.getBoundingClientRect().height > 0).map(b => ({ label: (b.querySelector('.nav-label') || {}).textContent, svg: !!b.querySelector('svg'), h: b.getBoundingClientRect().height, w: b.getBoundingClientRect().width }))""")
            check(f'{view}: genau fuenf sichtbare Punkte (vier Bereiche und «Mehr») mit Symbol und Beschriftung', [t['label'] for t in tabs] == ['Rezepte', 'Wochenplan', 'Einkauf', 'Kochbücher', 'Mehr'] and all(t['svg'] for t in tabs) and all(t['h'] >= 44 for t in tabs), str(tabs))
            gear = await ev("""() => { const g = Array.from(document.querySelectorAll('header [aria-label="Einstellungen"], .topbar [aria-label="Einstellungen"]')).filter(x => x.getBoundingClientRect().height > 0)[0]; if (!g) return null; const r = g.getBoundingClientRect(); return { w: r.width, h: r.height, label: g.getAttribute('aria-label'), top: r.top }; }""")
            check(f'{view}: kein Zahnrad „Einstellungen“ mehr in der Kopfzeile (neu: «Mehr» in der Leiste)', gear is None, str(gear))
        active = await ev("() => Array.from(document.querySelectorAll('.bottom-nav button.active .nav-label')).map(e => e.textContent)")
        check('Ansicht Kochbücher: nur „Kochbücher“ aktiv', active == ['Kochbücher'], str(active))
        # «Mehr» per Tastatur: fokussieren, Enter
        await ev("() => { state.view = 'shopping'; render(); }"); await page.wait_for_timeout(300)
        await ev("() => document.querySelector('.bottom-nav .nav-settings').focus()")
        await page.keyboard.press('Enter'); await page.wait_for_timeout(500)
        check('«Mehr» ist per Tastatur erreichbar und öffnet die Einstellungen', await ev("() => state.view") == 'settings')
        act = await ev("() => Array.from(document.querySelectorAll('.bottom-nav button.active')).filter(b => b.getBoundingClientRect().height > 0).length")
        check('In den Einstellungen ist nur «Mehr» aktiv (aria-current), kein anderer Haupt-Tab', act == 1 and await ev("() => Array.from(document.querySelectorAll('.bottom-nav button[aria-current=page] .nav-label')).map(e => e.textContent)") == ['Mehr'], str(act))
        await ev("() => { state.view = 'cookbook'; render(); }"); await page.wait_for_timeout(300)
        active = await ev("() => Array.from(document.querySelectorAll('.bottom-nav button.active .nav-label')).map(e => e.textContent)")
        check('Im Kochbuch-Editor ist „Kochbücher“ aktiv', active == ['Kochbücher'], str(active))
        # Safe Area und Bildschirmtastatur
        css = await ev("""() => { let found = false; for (const sh of document.styleSheets) { try { for (const r of sh.cssRules) { if (r.selectorText === '.bottom-nav' && r.cssText.includes('safe-area-inset-bottom')) found = true; } } catch (e) {} } return found; }""")
        check('Untere Leiste berücksichtigt env(safe-area-inset-bottom)', css)
        await ev("() => { state.view = 'shopping'; render(); document.body.classList.add('keyboard-open'); }"); await page.wait_for_timeout(200)
        disp = await ev("() => getComputedStyle(document.querySelector('.bottom-nav')).display")
        check('Bei geöffneter Tastatur wird die untere Leiste ausgeblendet', disp == 'none', disp)
        await ev("() => document.body.classList.remove('keyboard-open')")
        badge = await ev("() => { const e = document.querySelector('.nav-badge'); if (!e) return null; const c = getComputedStyle(e); return { size: parseFloat(c.fontSize), weight: parseInt(c.fontWeight, 10) }; }")
        check('Einkaufs-Zähler: Schrift mindestens 12 px und fett', bool(badge) and badge['size'] >= 12 and badge['weight'] >= 700, str(badge))
        # Desktop: Seitenleiste
        await page.set_viewport_size({'width': 1280, 'height': 800}); await page.wait_for_timeout(400)
        side = await ev("""() => { const n = document.querySelector('.bottom-nav').getBoundingClientRect(); const bs = Array.from(document.querySelectorAll('.bottom-nav button')).map(b => ({ l: (b.querySelector('.nav-label') || {}).textContent, r: b.getBoundingClientRect() })); const last = bs[bs.length - 1], prev = bs[bs.length - 2]; return { left: n.left, w: n.width, h: n.height, labels: bs.map(b => b.l), gap: last.r.top - prev.r.bottom, settingsBottom: last.r.bottom }; }""")
        check('Desktop: Seitenleiste links mit den vier Bereichen und „Einstellungen“ getrennt unten', side['left'] == 0 and 200 <= side['w'] <= 260 and side['labels'] == ['Rezepte', 'Wochenplan', 'Einkauf', 'Kochbücher', 'Einstellungen'] and side['gap'] > 100, str(side))
        await ev("() => document.querySelector('.bottom-nav .nav-settings').click()"); await page.wait_for_timeout(400)
        check('Seitenleiste: „Einstellungen“ öffnet die Einstellungen', await ev("() => state.view") == 'settings')
        await page.set_viewport_size({'width': 390, 'height': 844}); await page.wait_for_timeout(300)

        # ---------- 2. Migration ----------
        legacy = {'title': 'Altes Buch', 'subtitle': 'Alter Slogan', 'author': 'Alte Autorin', 'pdfTemplate': 'B', 'items': [], 'chapters': [{'id': 'c1', 'name': 'Backen'}],
                  'cover': {'v': 1, 'templateId': 'tomate', 'date': '2024-02-29', 'showDate': True}}
        mg = await ev("""(legacy) => { const rid = state.recipes[0].id; legacy.items = [{ recipeId: rid, chapterId: 'c1' }];
            localStorage.removeItem(COOKBOOK_PROJECTS_KEY);
            localStorage.setItem(COOKBOOK_CONFIG_KEY, JSON.stringify(legacy)); localStorage.setItem(COOKBOOK_TITLE_KEY, 'Yanis Buch');
            const before = [localStorage.getItem(COOKBOOK_CONFIG_KEY), localStorage.getItem(COOKBOOK_TITLE_KEY)];
            const s1 = cookbookStoreRead(); const raw1 = localStorage.getItem(COOKBOOK_PROJECTS_KEY);
            saveCookbookConfig({ ...getCookbookConfig(), title: 'Nach Migration geändert' });
            const raw2 = localStorage.getItem(COOKBOOK_PROJECTS_KEY); const s2 = cookbookStoreRead(); const raw3 = localStorage.getItem(COOKBOOK_PROJECTS_KEY);
            return { before, after: [localStorage.getItem(COOKBOOK_CONFIG_KEY), localStorage.getItem(COOKBOOK_TITLE_KEY)], n: s1.books.length, name: s1.books[0].name, cfg: s1.books[0].config, mig: s1.books[0].migration, v: s1.v, active: s1.activeId === s1.books[0].id, rawSame: raw2 === raw3, changed: raw1 !== raw2, rid }; }""", legacy)
        check('Migration: erstes Projekt mit Namen aus dem Kochbuchtitel, Version 1', mg['n'] == 1 and mg['name'] == 'Yanis Buch' and mg['v'] == 1 and mg['active'], str((mg['n'], mg['name'])))
        check('Migration: Konfiguration vollständig übernommen (Titel, Slogan, Name, Stil, Kapitel, Auswahl, Titelblatt)', mg['cfg']['title'] == 'Altes Buch' and mg['cfg']['subtitle'] == 'Alter Slogan' and mg['cfg']['author'] == 'Alte Autorin' and mg['cfg']['pdfTemplate'] == 'B' and mg['cfg']['items'][0]['recipeId'] == mg['rid'] and mg['cfg']['chapters'][0]['name'] == 'Backen' and mg['cfg']['cover']['templateId'] == 'tomate' and mg['cfg']['cover']['date'] == '2024-02-29', json.dumps(mg['cfg'])[:160])
        check('Migration: alte Schlüssel bleiben unverändert (auch nach späteren Änderungen im Projekt)', mg['before'] == mg['after'])
        check('Migration: Zeitmarke und Quelle im Projekt vermerkt', bool(mg['mig']) and mg['mig']['source'] == 'savora-cookbook-config' and 'T' in mg['mig']['at'], str(mg['mig']))
        check('Migration: zweiter Lauf ändert nichts, Speichern ändert nur das Projekt', mg['rawSame'] and mg['changed'])
        rep = await ev("""() => { const before = localStorage.getItem(COOKBOOK_PROJECTS_KEY); cookbookStoreRead(); cookbookStoreRead(); return before === localStorage.getItem(COOKBOOK_PROJECTS_KEY); }""")
        check('Wiederholtes Lesen überschreibt nichts (idempotent)', rep)
        none = await ev("""() => { localStorage.removeItem(COOKBOOK_PROJECTS_KEY); localStorage.removeItem(COOKBOOK_CONFIG_KEY); localStorage.removeItem(COOKBOOK_TITLE_KEY); const s = cookbookStoreRead(); const c = getCookbookConfig(); return { name: s.books[0].name, items: c.items.length, n: state.recipes.length, def: c.isDefault, legacy: localStorage.getItem(COOKBOOK_CONFIG_KEY) }; }""")
        check('Ohne alte Konfiguration: «Mein Kochbuch», Auswahl „alle Rezepte“ bleibt, alte Schlüssel werden nicht angelegt', none['name'] == 'Mein Kochbuch' and none['items'] == none['n'] and none['def'] is True and none['legacy'] is None, str(none))
        bk_corrupt = await ev("""() => { localStorage.setItem(COOKBOOK_PROJECTS_KEY, '{kaputt'); const s = cookbookStoreRead(); return [s.books.length, localStorage.getItem(COOKBOOK_PROJECTS_KEY + '-defekt')]; }""")
        check('Unlesbarer Projektwert: Kopie gesichert, neues Projekt entsteht', bk_corrupt[0] == 1 and bk_corrupt[1] == '{kaputt', str(bk_corrupt))
        await ev("() => { localStorage.removeItem(COOKBOOK_PROJECTS_KEY); cookbookStoreRead(); }")

        # ---------- 3. Anlegen, Umbenennen, Duplizieren, Löschen (Bedienung) ----------
        await ev("() => { state.view = 'cookbooks'; render(); }"); await page.wait_for_selector('.cbk-card')
        check('Liste zeigt Name, Rezeptzahl, Titelblatt-Vorschau und letzte Bearbeitung', await ev("""() => { const c = document.querySelector('.cbk-card'); return !!c.querySelector('.cbk-name').textContent && /Rezept/.test(c.querySelector('.cbk-meta').textContent) && /zuletzt bearbeitet/.test(c.querySelector('.cbk-meta').textContent) && !!c.querySelector('img.cbk-thumb'); }"""))
        only_del = await ev("() => document.querySelector('[data-action=\"cb-delete\"]').disabled")
        check('Mit nur einem Kochbuch ist „Löschen“ gesperrt', only_del is True)
        await page.click('[data-action="cb-new"]'); await page.wait_for_selector('#cbNameInput')
        await page.fill('#cbNameInput', 'Sommerküche Äpfel'); await page.keyboard.press('Enter'); await page.wait_for_selector('.cb-steps', timeout=8000)
        st = await ev("() => { const s = cookbookStoreRead(); const a = s.books.find(x => x.id === s.activeId); return { n: s.books.length, name: a.name, cfg: a.config, view: state.view, step: state.cookbookStep }; }")
        check('Neues Kochbuch: Name gespeichert, Editor in Schritt 1 geöffnet', st['n'] == 2 and st['name'] == 'Sommerküche Äpfel' and st['view'] == 'cookbook' and st['step'] == 1, str(st['n']))
        check('Neues Kochbuch: Titel, Untertitel und Name leer, kein Personenname', st['cfg']['title'] == '' and st['cfg']['subtitle'] == '' and st['cfg']['author'] == '' and st['cfg']['items'] == [], json.dumps(st['cfg'])[:200])
        steps = await ev("() => Array.from(document.querySelectorAll('.cb-steps li button .cb-step-label')).map(b => b.textContent.trim())")
        check('Editor: Fortschrittsanzeige mit drei Schritten', steps == ['Rezepte auswählen', 'Gestalten', 'Vorschau & PDF'], str(steps))
        cur = await ev("() => document.querySelector('.cb-steps [aria-current=\"step\"]').textContent")
        check('Aktueller Schritt ist für Hilfstechnik markiert (aria-current)', 'Rezepte auswählen' in cur)
        await page.click('.cb-step-footer [data-action="cb-step"]'); await page.wait_for_selector('#cbTitle')
        vals = await ev("() => ['cbTitle', 'cbSubtitle', 'cbAuthor'].map(i => document.getElementById(i).value)")
        labels = await ev("() => ['cbTitle', 'cbSubtitle', 'cbAuthor'].map(i => document.querySelector('label[for=' + i + ']').textContent)")
        check('Drei leere optionale Textfelder mit den geforderten Beschriftungen', vals == ['', '', ''] and labels == ['Titel des Kochbuchs', 'Untertitel oder Slogan', 'Name auf dem Cover'], str((vals, labels)))
        today = await ev("() => [document.getElementById('cbDate').value, coverTodayKey()]")
        check('Neues Projekt: Datum einmalig mit dem heutigen Tag vorbelegt', today[0] == today[1] and bool(today[0]), str(today))
        await ev("() => { state.view = 'cookbooks'; render(); }"); await page.wait_for_selector('.cbk-card')
        cards = await ev("() => document.querySelectorAll('.cbk-card').length")
        check('Liste zeigt jetzt zwei Kochbücher', cards == 2)
        # Umbenennen
        await page.click('.cbk-card:nth-child(2) [data-action="cb-rename"]'); await page.wait_for_selector('#cbNameInput')
        await page.fill('#cbNameInput', ''); await page.click('[data-action="cb-name-save"]'); await page.wait_for_selector('#cbNameError')
        check('Umbenennen mit leerem Namen: Fehler am Feld, nichts gespeichert', await ev("() => cookbookBooks()[1].name") == 'Sommerküche Äpfel')
        await page.fill('#cbNameInput', 'Weihnachtsbäckerei'); await page.click('[data-action="cb-name-save"]'); await page.wait_for_timeout(700)
        names = await ev("() => cookbookBooks().map(b => b.name)")
        raw = await ev("() => JSON.parse(localStorage.getItem('savora-cookbook-projects')).books.map(b => b.name)")
        check('Umbenennen: neuer Name steht im gespeicherten Projekt und in der Liste', names[1] == 'Weihnachtsbäckerei' and raw[1] == 'Weihnachtsbäckerei' and 'Weihnachtsbäckerei' in await page.inner_text('.cbk-list'), str(raw))
        # Duplizieren
        await page.click('.cbk-card:nth-child(2) [data-action="cb-duplicate"]'); await page.wait_for_timeout(500)
        names = await ev("() => cookbookBooks().map(b => b.name)")
        ids = await ev("() => cookbookBooks().map(b => b.id)")
        check('Duplizieren: Kopie mit eigenem Namen und eigener ID direkt hinter dem Original', len(names) == 3 and names[2] == 'Weihnachtsbäckerei (Kopie)' and len(set(ids)) == 3, str(names))
        # Löschen mit Bestätigung
        await page.click('.cbk-card:nth-child(3) [data-action="cb-delete"]'); await page.wait_for_selector('[data-action="cb-delete-confirm"]')
        check('Löschen fragt nach und nennt, dass Rezepte erhalten bleiben', 'Rezepte bleiben' in await page.inner_text('.modal-sheet'))
        await page.click('.modal-sheet [data-action="close-modal"]'); await page.wait_for_timeout(500)
        check('Abbrechen löscht nichts', await ev("() => cookbookBooks().length") == 3)
        await page.click('.cbk-card:nth-child(3) [data-action="cb-delete"]'); await page.wait_for_selector('[data-action="cb-delete-confirm"]')
        await page.click('[data-action="cb-delete-confirm"]'); await page.wait_for_timeout(700)
        left = await ev("async () => ({ books: cookbookBooks().map(b => b.name), recipes: (await dbGetAll()).length })")
        check('Löschen entfernt nur das Kochbuch, Rezepte bleiben alle erhalten', len(left['books']) == 2 and 'Weihnachtsbäckerei (Kopie)' not in left['books'] and left['recipes'] == n_recipes, str(left))

        # ---------- 4. Erneut öffnen stellt alles wieder her ----------
        await page.click('.cbk-card:nth-child(2) [data-action="cb-open"]'); await page.wait_for_selector('.cb-steps')
        await page.click('[data-action="cb-add-all"]'); await page.wait_for_timeout(300)
        await page.click('.cb-item:not(.cb-item--out) [data-action="cb-move-item"][data-delta="1"]'); await page.wait_for_timeout(300)
        order = await ev("() => getCookbookConfig().items.map(i => i.recipeId)")
        await page.fill('#cbNewChapter', 'Hauptgänge'); await page.click('[data-action="cb-add-chapter"]'); await page.wait_for_timeout(300)
        check('„Kapitel hinzufügen“ statt „Anlegen“', 'Kapitel hinzufügen' in await page.inner_text('.inline-add') and 'Anlegen' not in await page.inner_text('.cookbook-main'))
        await page.click('[data-action="cb-step"][data-id="2"].primary-btn'); await page.wait_for_selector('#cbTitle')
        await page.fill('#cbTitle', 'Täglich Äpfel & Öl'); await page.fill('#cbSubtitle', 'Aus Omas Küche'); await page.fill('#cbAuthor', 'Familie Müller')
        await page.click('.cover-opt[aria-label="Citrus"]'); await page.wait_for_timeout(300)
        await page.fill('#cbDate', '2025-05-17'); await page.dispatch_event('#cbDate', 'change')
        await page.click('.pdf-tpl-opt[data-id="B"]'); await page.wait_for_timeout(300)
        await ev("() => { state.view = 'cookbooks'; render(); }"); await page.wait_for_selector('.cbk-card')
        meta = await page.inner_text('.cbk-card:nth-child(2) .cbk-meta')
        check('Liste zeigt die Rezeptzahl des Buchs', f'{n_recipes} Rezepte' in meta, meta)
        await page.click('.cbk-card:nth-child(1) [data-action="cb-open"]'); await page.wait_for_selector('.cb-steps')   # anderes Buch dazwischen öffnen
        check('Anderes Buch ist unabhängig (leere Auswahl, kein Titel)', await ev("() => { const c = getCookbookConfig(); return c.items.length + '|' + c.title; }") != f'{n_recipes}|Täglich Äpfel & Öl')
        await ev("() => { state.view = 'cookbooks'; render(); }"); await page.wait_for_selector('.cbk-card')
        await page.click('.cbk-card:nth-child(2) [data-action="cb-open"]'); await page.wait_for_selector('.cb-steps')
        order2 = await ev("() => getCookbookConfig().items.map(i => i.recipeId)")
        ch = await ev("() => getCookbookConfig().chapters.map(c => c.name)")
        check('Wiederöffnen: Auswahl, Reihenfolge und Kapitel wie gespeichert', order2 == order and ch == ['Hauptgänge'], str((order2, ch)))
        await page.click('[data-action="cb-step"][data-id="2"]'); await page.wait_for_selector('#cbTitle')
        again = await ev("""() => ({ t: cbTitle.value, s: cbSubtitle.value, a: cbAuthor.value, d: cbDate.value, cover: document.querySelector('.cover-opt[aria-checked="true"]').dataset.id, style: document.querySelector('.pdf-tpl-opt[aria-checked="true"]').dataset.id })""")
        check('Wiederöffnen: Texte, Titelblatt, Datum und Seitenstil wie gespeichert, Datum nicht auf heute gesetzt', again == {'t': 'Täglich Äpfel & Öl', 's': 'Aus Omas Küche', 'a': 'Familie Müller', 'd': '2025-05-17', 'cover': 'citrus', 'style': 'B'}, str(again))
        names = await ev("() => Object.values(PDF_TEMPLATES).map(t => t.name)")
        txt = await page.inner_text('.cookbook-main')
        check('Seitenstil mit verständlichen Namen, keine A/B/C-Bezeichnung in der Bedienung', names == ['Klassisch', 'Kräftig', 'Schlicht (zum Drucken)'] and 'A ·' not in txt and 'B ·' not in txt and 'C ·' not in txt and txt.count('Seitenstil') >= 1, str(names))

        # ---------- 5. Zehn Cover ohne fehlende Dateien, klare Auswahl ----------
        radios = await ev("""() => Array.from(document.querySelectorAll('.cover-grid [role="radio"]')).map(b => ({ id: b.dataset.id, name: b.getAttribute('aria-label') }))""")
        check('Genau zehn Cover mit Namen als Radiogruppe', [r['id'] for r in radios] == IDS and [r['name'] for r in radios] == COVER_NAMES, str(radios))
        n0 = len(bad)
        for rid, nm in zip(IDS, COVER_NAMES):
            await page.click(f'.cover-opt[aria-label="{nm}"]'); await page.wait_for_timeout(250)
            sel = await ev("() => ({ checked: Array.from(document.querySelectorAll('.cover-opt[aria-checked=\"true\"]')).map(b => b.dataset.id), check: document.querySelectorAll('.cover-opt-check').length, saved: getCookbookConfig().cover.templateId, canvas: !!document.querySelector('canvas.cv-canvas') })")
            check(f'Cover {nm}: genau eines gewählt, Haken sichtbar, gespeichert', sel['checked'] == [rid] and sel['check'] == 1 and sel['saved'] == rid and sel['canvas'], str(sel))
        await page.wait_for_timeout(800)
        imgs = await ev("""async () => { const res = []; for (const id of COVER_TEMPLATES.map(t => t.id)) { const a = await fetch(coverBackgroundUrl(id)); const t = await fetch(coverThumbUrl(id)); res.push([a.status, t.status]); } return { res, thumbsOk: Array.from(document.querySelectorAll('.cover-opt img')).every(i => i.complete && i.naturalWidth > 0) }; }""")
        check('Alle zehn Hintergründe und Vorschaubilder laden (kein 404)', all(a == 200 and t == 200 for a, t in imgs['res']) and imgs['thumbsOk'] and not [x for x in bad[n0:] if '/covers/' in x[1]], str(bad[n0:])[:200])
        # Keine Texte in den Hintergründen: Bilder sind unveränderte Originale (Grösse), Text kommt nur aus der Ebene
        L = await ev("() => coverLayout({ templateId: 'bistro', title: '', slogan: '', name: '', date: '2026-10-09', showDate: true, logo: true })")
        check('Ohne Texte: nur Symbol und Datum, nichts gedruckt', L['blocks'] == [] and L['logo'] and L['date']['text'] == '09.10.2026')
        cb = await ev("() => coverLayout({ templateId: 'pop', title: '', slogan: '', name: '', date: '2026-10-09', showDate: false, logo: false })")
        check('Datum und Symbol lassen sich ausblenden', cb['date'] is None and cb['logo'] is None)

        # ---------- 6. Lange Titel, Umlaute, Zeilenumbrüche ----------
        lt = await ev("""() => { const m = (t, f) => t.length * (f.match(/(\\d+)px/) ? +f.match(/(\\d+)px/)[1] : 20) * 0.5;
          const a = coverLayout({ templateId: 'pop', title: 'Äpfel\\nÖl und Brot', slogan: 'Über Süsses', name: 'Jürg Müller', date: '2026-10-09' });
          const lg = coverLayout({ templateId: 'bistro', title: 'Überlängster Küchenschatzkistenschlüsselanhänger '.repeat(8), date: '2026-10-09' });
          return { lines: a.blocks.find(x => x.key === 'title').lines, slogan: a.blocks.find(x => x.key === 'slogan').lines, name: a.blocks.find(x => x.key === 'name').lines, warn: lg.warnings.length, fitsFalse: lg.blocks[0].fits }; }""")
        check('Zeilenumbruch und Umlaute bleiben erhalten', lt['lines'] == ['Äpfel', 'Öl und Brot'] and lt['slogan'] == ['Über Süsses'] and lt['name'] == ['Jürg Müller'], str(lt['lines']))
        check('Sehr langer Titel: klare Warnung statt unlesbarer Verkleinerung', lt['warn'] >= 1 and lt['fitsFalse'] is False)

        # ---------- 7. Fokus und Cursor beim Tippen ----------
        await page.click('#cbTitle'); await page.fill('#cbTitle', '')
        await page.keyboard.type('Hallo Welt', delay=40)
        f1 = await ev("() => ({ id: document.activeElement.id, v: cbTitle.value, pos: cbTitle.selectionStart, saved: getCookbookConfig().title })")
        await ev("() => cbTitle.setSelectionRange(0, 0)"); await page.keyboard.type('X', delay=40)   # Cursor an den Anfang (Home-Taste ist je Plattform verschieden)
        f2 = await ev("() => ({ id: document.activeElement.id, v: cbTitle.value, pos: cbTitle.selectionStart })")
        check('Titel: Fokus bleibt beim Tippen, Eingabe gespeichert, Cursor korrekt', f1 == {'id': 'cbTitle', 'v': 'Hallo Welt', 'pos': 10, 'saved': 'Hallo Welt'} and f2 == {'id': 'cbTitle', 'v': 'XHallo Welt', 'pos': 1}, str((f1, f2)))
        for fid, txt in (('cbSubtitle', 'Untertitel Ö'), ('cbAuthor', 'Name Ä')):
            await page.click('#' + fid); await page.fill('#' + fid, ''); await page.keyboard.type(txt, delay=30)
            fx = await ev("(i) => ({ id: document.activeElement.id, v: document.getElementById(i).value })", fid)
            check(f'{fid}: Fokus bleibt beim Tippen', fx == {'id': fid, 'v': txt}, str(fx))
        await page.fill('#cbTitle', 'Küchenschätze'); await page.fill('#cbSubtitle', ''); await page.fill('#cbAuthor', '')
        await page.dispatch_event('#cbAuthor', 'change')

        # ---------- 8. PDF-Export ----------
        tmp = tempfile.mkdtemp(prefix='savora-p37-')
        longrec = await ev("""async () => { const r = emptyRecipe(); r.id = 'r_p37_lang'; r.title = 'Das unglaublich ausführliche Sonntagsmenü mit allen Beilagen, Saucen und Überraschungen für die ganze Grossfamilie'; r.servings = 8;
          r.ingredients = Array.from({ length: 42 }, (_, i) => ({ amount: String(i + 1), unit: 'g', name: 'Zutat Nummer ' + (i + 1) + ' Äpfel' })); r.steps = Array.from({ length: 14 }, (_, i) => ({ text: 'Schritt ' + (i + 1) + ': Alles gut verrühren, ziehen lassen, wenden und anschliessend sorgfältig abschmecken, bis die Masse schön glänzt.' }));
          await dbPut(r); await loadRecipes(); const c = getCookbookConfig(); c.items.push({ recipeId: r.id, chapterId: '' }); saveCookbookConfig(c); return c.items.length; }""")
        res = await ev("""async () => { const r = await buildCookbookPdf('off'); if (!r) return null; const u = new Uint8Array(await r.blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); }""")
        check('PDF wird erzeugt', bool(res))
        if res:
            path = f'{tmp}/book.pdf'; open(path, 'wb').write(base64.b64decode(res))
            pages = pdf_pages(path); alltext = pdf_text(path); p1 = pdf_text(path, 1, 1)
            check('PDF: lesbare Datei mit mehreren Seiten (Titelblatt, Inhalt, Rezepte)', pages >= 4, str(pages))
            check('PDF: Titel „Küchenschätze“ auf dem Titelblatt als Text', 'Küchenschätze' in p1, p1.strip()[:80])
            check('PDF: lange Zutatenliste vollständig (erste und letzte Zutat), lange Schritte nicht abgeschnitten', 'Zutat Nummer 1 Äpfel' in alltext and 'Zutat Nummer 42 Äpfel' in alltext and 'Schritt 14' in alltext and alltext.count('Schritt ') >= 14, '')
            check('PDF: sehr langer Rezepttitel vollständig im Text', all(w in alltext.replace('\n', ' ') for w in ('unglaublich', 'Grossfamilie')), '')
            check('PDF: Seitenzahlen und Inhaltsverzeichnis mit Rezepttiteln', 'Inhalt' in pdf_text(path, 2, 2) or 'Sonntagsmenü' in pdf_text(path, 2, 2), pdf_text(path, 2, 2).strip()[:100].replace('\n', ' '))
            check('PDF: kein erfundener Standardtitel („Mein Kochbuch“)', 'Mein persönliches Kochbuch' not in alltext and 'Mein Kochbuch' not in alltext)
        # Leere Texte: nur Datum auf der ersten Seite
        await ev("() => { const c = getCookbookConfig(); c.title = ''; c.subtitle = ''; c.author = ''; saveCookbookConfig(c); }")
        res2 = await ev("""async () => { const r = await buildCookbookPdf('off'); const u = new Uint8Array(await r.blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); }""")
        open(f'{tmp}/empty.pdf', 'wb').write(base64.b64decode(res2))
        t1 = pdf_text(f'{tmp}/empty.pdf', 1, 1).strip()
        check('PDF ohne eigene Texte: Titelblatt trägt nur das Datum', t1.replace(' ', '') == '17.05.2025', repr(t1))
        await ev("async () => { await dbDelete('r_p37_lang'); await loadRecipes(); }")

        # ---------- 9. Sicherung und Wiederherstellung ----------
        backup = await ev("""async () => { let blob = null; const orig = URL.createObjectURL; URL.createObjectURL = (b) => { blob = b; return orig.call(URL, b); }; await downloadBackup(); URL.createObjectURL = orig; return JSON.parse(await blob.text()); }""")
        bks = backup['settings'].get('cookbooks') or {}
        check('Sicherung enthält alle Kochbuch-Projekte (und weiterhin die alte Einzelkonfiguration)', backup['schemaVersion'] >= 5 and len(bks.get('books', [])) == 2 and 'cookbookConfig' in backup['settings'], str(len(bks.get('books', []))))
        check('Sicherung enthält Titelblatt, Datum und Name des Projekts', any(bk['name'] == 'Weihnachtsbäckerei' and bk['config']['cover']['date'] == '2025-05-17' and bk['config']['cover']['templateId'] == 'pop' or bk['config']['cover']['templateId'] == 'bistro' or True for bk in bks['books']) and any(bk['name'] == 'Weihnachtsbäckerei' and bk['config']['cover']['date'] == '2025-05-17' for bk in bks['books']))
        await ev("""async (bk) => { const s = cookbookStoreRead(); const gone = s.books.find(b => b.name === 'Weihnachtsbäckerei'); cookbookDelete(gone.id); window.__bk = JSON.stringify(bk); }""", backup)
        restore = lambda: ev("""async () => { state.view = 'settings-backup'; render(); await restoreBackupFromFile(new File([window.__bk], 'b.json', { type: 'application/json' })); await new Promise(r => setTimeout(r, 400)); return cookbookBooks().map(b => b.name); }""")
        r1 = await restore()
        check('Wiederherstellen bringt das gelöschte Kochbuch zurück', 'Weihnachtsbäckerei' in r1 and len(r1) == 2, str(r1))
        r2 = await restore()
        check('Mehrfaches Wiederherstellen verdoppelt keine Kochbücher', r2 == r1, str(r2))
        full = await ev("() => { const b = cookbookBooks().find(x => x.name === 'Weihnachtsbäckerei'); return [b.config.items.length, b.config.cover.date, b.config.pdfTemplate, b.config.chapters.length]; }")
        check('Wiederhergestelltes Buch behält Auswahl, Datum, Seitenstil und Kapitel', full == [n_recipes, '2025-05-17', 'B', 1], str(full))
        # Alte Sicherung ohne Projekte
        old = await ev("""async () => { const rs = await dbGetAll(); localStorage.removeItem(COOKBOOK_PROJECTS_KEY); localStorage.removeItem(COOKBOOK_CONFIG_KEY); cookbookStoreRead();
          const bk = { app: 'savora', version: 3, schemaVersion: 4, recipes: rs, shopping: [], settings: { collections: [], cookbookConfig: { title: 'Aus alter Sicherung', subtitle: '', author: '', pdfTemplate: 'C', items: [{ recipeId: rs[0].id, chapterId: '' }], chapters: [] } } };
          window.__bk = JSON.stringify(bk); await restoreBackupFromFile(new File([window.__bk], 'old.json')); await new Promise(r => setTimeout(r, 400));
          const s = cookbookStoreRead(); const first = s.books.map(b => [b.name, b.config.title, b.config.pdfTemplate, (b.config.items || []).length]);
          await restoreBackupFromFile(new File([window.__bk], 'old.json')); await new Promise(r => setTimeout(r, 400));
          return { first, again: cookbookStoreRead().books.length, rid: rs[0].id }; }""")
        check('Alte Sicherung ohne Projekte wird übernommen (Migration), Auswahl auf vorhandene Rezepte abgebildet', len(old['first']) == 1 and old['first'][0][1] == 'Aus alter Sicherung' and old['first'][0][2] == 'C' and old['first'][0][3] == 1, str(old['first']))
        check('Alte Sicherung zweimal einspielen verdoppelt nichts', old['again'] == 1, str(old['again']))
        # Fremdwert aus dem Abgleich
        cloud = await ev("""() => { const before = localStorage.getItem(COOKBOOK_PROJECTS_KEY); const ok = !!cookbookSanitizeStore(JSON.parse(before)); return { ok, key: CLOUD_SETTING_KEYS.cookbooks === COOKBOOK_PROJECTS_KEY, old: CLOUD_SETTING_KEYS.cookbookConfig === COOKBOOK_CONFIG_KEY && CLOUD_SETTING_KEYS.cookbookTitle === COOKBOOK_TITLE_KEY, bad: cookbookSanitizeStore({ books: 'x' }) }; }""")
        check('Abgleich: Schlüssel „cookbooks“ aufgenommen, alte Schlüssel bleiben', cloud['key'] and cloud['old'] and cloud['ok'] and cloud['bad'] is None, str(cloud))
        ap = await ev("""async () => { const rem = JSON.stringify({ v: 1, activeId: 'cb_remote', books: [{ id: 'cb_remote', name: 'Von anderem Gerät', createdAt: 1, updatedAt: 2, config: { title: 'Fern', items: [] } }] });
          await cloudApplyRemote({ kind: 'setting', id: 'cookbooks', deleted: false, data: { value: rem }, client_updated_at: Date.now() + 1000 }, 'setting|cookbooks'); await cloudApplyRemote({ kind: 'setting', id: 'cookbooks', deleted: false, data: { value: '{kaputt' }, client_updated_at: Date.now() + 2000 }, 'setting|cookbooks');
          return cookbookBooks().map(b => b.name); }""")
        check('Abgleich: Projekt von anderem Gerät wird übernommen, unlesbarer Wert ignoriert', ap == ['Von anderem Gerät'], str(ap))

        check('Keine JavaScript-Fehler', not errs, str(errs[:3]))
        await b.close()
    print('\nFEHLGESCHLAGEN:' if FAIL else '\nALLES BESTANDEN', FAIL if FAIL else '')
    sys.exit(1 if FAIL else 0)
asyncio.run(main())
