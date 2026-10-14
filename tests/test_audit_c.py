"""Audit C: Dialoge (B02/A01), Filter Mahlzeit/Gericht (D01), Texte (D02), Auswahlzustand mit Haken (D03), Ueberschriften (D04/A02),
Metadaten im initialen HTML (S01) und eigene 404-Seite (S02)."""
import asyncio, sys, os, re, struct, urllib.request
os.environ.setdefault('SAVORA_TEST_PORT', '9700')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

EXTRA = """async () => {
  const mk = (id, title, o) => { const r = emptyRecipe(); r.id = id; r.title = title; r.servings = 2; r.ingredients = [{amount:'1', unit:'', name:'Zutat'}]; r.steps = [{text:'Kochen.'}]; Object.assign(r, o); return r; };
  const list = [
    mk('ac_a', 'Abend-Pasta', { categoryTags: ['dinner', 'pasta'], tags: ['Familie'] }),
    mk('ac_b', 'Abend-Suppe', { categoryTags: ['dinner', 'soup'] }),
    mk('ac_c', 'Mittags-Pasta', { categoryTags: ['lunch', 'pasta'] }),
    mk('ac_d', 'Frühstück pur', { categoryTags: ['breakfast'] }),
    mk('ac_e', 'Ohne Kategorie', { categoryTags: [] }),
    mk('ac_f', 'Altwert', { categoryTags: ['legacy-x'] }),
  ];
  for (const r of list) await dbPut(r);
  await loadRecipes();
  state.view = 'home'; state.query = ''; state.favOnly = false; state.activeCollection = 'all'; state.activeTag = null; state.sortBy = 'updated';
  resetExtraFilters(); render(); return state.recipes.length;
}"""
IN_SHEET = "() => { const s = document.querySelector('.modal-sheet'); return !!s && s.contains(document.activeElement); }"

def fetch(path):
    with urllib.request.urlopen(f'http://localhost:{PORT}/{path}') as r: return r.status, r.read()

async def main():
    # ---------- S01 / S02: statische Dateien, ohne JavaScript gelesen ----------
    st, raw = fetch('index.html'); html = raw.decode('utf-8')
    head = html.split('</head>')[0]
    check('S01 lang="de-CH"', '<html lang="de-CH">' in html)
    check('S01 canonical absolut', '<link rel="canonical" href="https://yaniske-ai.github.io/Savora/">' in head)
    for prop in ['og:type', 'og:site_name', 'og:locale', 'og:url', 'og:title', 'og:description', 'og:image', 'og:image:width', 'og:image:height', 'og:image:alt']:
        check(f'S01 {prop} im initialen HTML', f'property="{prop}"' in head)
    check('S01 og:locale de_CH', 'property="og:locale" content="de_CH"' in head)
    check('S01 Twitter Card summary_large_image mit Bild und Alt-Text', 'name="twitter:card" content="summary_large_image"' in head and 'name="twitter:image" content="https://yaniske-ai.github.io/Savora/' in head and 'name="twitter:image:alt"' in head)
    img_rel = re.search(r'property="og:image" content="https://yaniske-ai.github.io/Savora/([^"]+)"', head)
    check('S01 Bild-URL absolut unter /Savora/', bool(img_rel), '')
    if img_rel:
        st2, png = fetch(img_rel.group(1)); w, h = struct.unpack('>II', png[16:24])
        check('S01 Socialbild vorhanden, PNG, 1200x630', st2 == 200 and png[:8] == b'\x89PNG\r\n\x1a\n' and (w, h) == (1200, 630), f'{w}x{h}')
    check('S01 Beschreibung und Titel unverändert', '<title>Savora · Dein Kochbuch</title>' in head and 'name="description"' in head)
    st3, raw3 = fetch('404.html'); h404 = raw3.decode('utf-8')
    check('S02 404.html vorhanden mit Titel, h1, Link /Savora/, noindex, ohne Redirect', st3 == 200 and 'Diese Seite gibt es nicht' in h404 and '<h1>' in h404 and 'href="/Savora/"' in h404 and 'noindex' in h404 and 'http-equiv="refresh"' not in h404 and 'location' not in h404.split('<style>')[-1].split('</style>')[-1])
    check('S02 404 nutzt Savora-Wortmarke und Basispfad /Savora/ für alle Assets', 'savora-wortmarke-light.svg' in h404 and 'src="/Savora/' in h404 and not re.search(r'(?:src|href)="(?!/Savora/|https?:)[^"#]', h404))
    for a in re.findall(r'(?:src|href)="(/Savora/[^"]+)"', h404):
        st4, _ = fetch(a[len('/Savora/'):].split('?')[0]) if True else (0, b'')
        check(f'S02 Asset vorhanden: {a}', st4 == 200)

    async with async_playwright() as p:
        b, ctx = await open_ctx(p, 390, 844, 'reduce'); page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(300)
        ev = page.evaluate
        n = await ev(EXTRA); await page.wait_for_timeout(300)
        total = await ev("() => state.recipes.length")
        before = await ev("() => JSON.stringify(state.recipes.map(r => r.id + '|' + r.title + '|' + JSON.stringify(r.categoryTags)).sort())")
        await ev("() => { resetExtraFilters(); state.modal = null; render(); window.scrollTo(0, 0); }"); await page.wait_for_timeout(250)

        # ---------- B02/A01: Fokusfalle Filter ----------
        await page.click('[data-action="open-filter-sheet"]'); await page.wait_for_selector('.filter-sheet'); await page.wait_for_timeout(300)
        check('Filter: Dialogcontainer hat Anfangsfokus', await ev("() => document.activeElement === document.querySelector('.filter-sheet')"))
        await page.keyboard.press('Shift+Tab'); await page.wait_for_timeout(80)
        check('Filter: Umschalt+Tab direkt nach Öffnen bleibt im Dialog', await ev(IN_SHEET))
        check('Filter: Fokus liegt dabei auf dem letzten Control (Hauptaktion)', await ev("() => document.activeElement.classList.contains('fs-apply')"))
        await page.keyboard.press('Tab'); await page.wait_for_timeout(50)
        check('Filter: Tab vom letzten Control springt zum ersten', await ev("() => document.activeElement.classList.contains('fs-close')"))
        await page.keyboard.press('Shift+Tab'); await page.wait_for_timeout(50)
        check('Filter: Umschalt+Tab vom ersten Control springt zum letzten', await ev("() => document.activeElement.classList.contains('fs-apply')"))
        for i in range(60):
            await page.keyboard.press('Tab')
            if not await ev(IN_SHEET): break
        check('Filter: 60 Tab-Schritte verlassen den Dialog nie', await ev(IN_SHEET))
        for i in range(60):
            await page.keyboard.press('Shift+Tab')
            if not await ev(IN_SHEET): break
        check('Filter: 60 Umschalt+Tab-Schritte verlassen den Dialog nie', await ev(IN_SHEET))
        # Hintergrund inert
        inert = await ev("""() => { const sheet = document.querySelector('.modal-sheet'); const out = [];
          document.querySelectorAll('#app > *').forEach(e => { if (!e.contains(sheet)) out.push(e.tagName + ':' + e.inert); }); return { out, sheetInert: !!sheet.closest('[inert]'), nav: document.querySelector('.bottom-nav') && document.querySelector('.bottom-nav').closest('[inert]') !== null }; }""")
        check('Hintergrund ist inert, Dialog nicht', inert['nav'] and not inert['sheetInert'] and all(x.endswith('true') for x in inert['out']) and inert['out'], str(inert))
        live = await ev("() => !document.getElementById('liveRegion').closest('[inert]')")
        check('Live-Region bleibt ansprechbar', live)
        # Dialog ohne aktive Controls
        await ev("() => document.querySelectorAll('.modal-sheet button, .modal-sheet input').forEach(e => e.disabled = true); document.querySelector('.modal-sheet').focus()")
        await page.keyboard.press('Shift+Tab'); await page.wait_for_timeout(50)
        a = await ev(IN_SHEET); await page.keyboard.press('Tab'); await page.wait_for_timeout(50)
        check('Dialog ohne aktive Controls: Tab und Umschalt+Tab bleiben im Dialog', a and await ev(IN_SHEET))
        await page.keyboard.press('Escape'); await page.wait_for_timeout(500)

        # ---------- Escape schliesst genau eine Ebene, Entwurf verworfen, Fokus und Scroll ----------
        await ev("() => { document.querySelector('#app').scrollTop = 0; window.scrollTo(0, 200); }"); await page.wait_for_timeout(300)
        y0 = await ev("() => window.scrollY")
        await ev("() => document.querySelector('[data-action=\"open-filter-sheet\"]').click()"); await page.wait_for_selector('.filter-sheet'); await page.wait_for_timeout(300)
        await page.click('.fs-input[data-fs-dim="dietary"][value="vegan"] >> xpath=..'); await page.wait_for_timeout(80)
        await page.keyboard.press('Escape'); await page.wait_for_timeout(500)
        c = await ev("() => ({ gone: !document.querySelector('.modal-sheet'), foc: document.activeElement.dataset.action, d: state.activeFilters.dietary.size, y: window.scrollY, inert: document.querySelectorAll('[inert]').length })")
        check('Escape: Dialog zu, Fokus auf Auslöser, Entwurf verworfen, kein Scrollsprung, nichts mehr inert', c['gone'] and c['foc'] == 'open-filter-sheet' and c['d'] == 0 and abs(c['y'] - y0) <= 1 and y0 > 100 and c['inert'] == 0, str(c) + f' y0={y0}')
        await page.keyboard.press('Escape'); await page.wait_for_timeout(200)
        check('Zweites Escape ohne Dialog ändert nichts', await ev("() => state.view === 'home' && !state.modal"))
        # Browser-Zurück
        await page.click('[data-action="open-filter-sheet"]'); await page.wait_for_selector('.filter-sheet'); await page.wait_for_timeout(300)
        await page.go_back(); await page.wait_for_timeout(500)
        check('Browser-Zurück schliesst genau den Dialog, Ansicht bleibt', await ev("() => !document.querySelector('.modal-sheet') && state.view === 'home' && document.activeElement.dataset.action === 'open-filter-sheet'"))

        # ---------- zweiter Dialog: Detail-Menü; verschachtelte Dialoge ----------
        await ev("() => { openRecipe && 0; }") if False else None
        await ev("() => { state.activeRecipeId = 'ac_a'; state.view = 'detail'; render(); window.scrollTo(0, 0); }"); await page.wait_for_timeout(300)
        await page.click('[data-action="open-detail-menu"]'); await page.wait_for_selector('.modal-sheet'); await page.wait_for_timeout(300)
        await page.keyboard.press('Shift+Tab'); await page.wait_for_timeout(80)
        check('Detail-Menü: Umschalt+Tab direkt nach Öffnen bleibt im Dialog', await ev(IN_SHEET))
        t = await ev("() => document.querySelector('.modal-sheet .modal-title').tagName")
        check('A02 Dialogtitel ist h2 (nicht h3)', t == 'H2', t)
        await page.keyboard.press('Escape'); await page.wait_for_timeout(500)
        check('Detail-Menü: Fokus kehrt zum Auslöser zurück', await ev("() => document.activeElement.dataset.action === 'open-detail-menu'"))
        # verschachtelt: zweiter Dialog im DOM, nur der oberste bleibt aktiv
        nest = await ev("""() => { state.modal = { type: 'detail-menu', recipeId: 'ac_a' }; render();
          const second = document.createElement('div'); second.className = 'modal-backdrop';
          second.innerHTML = '<div class="modal-sheet" role="dialog" aria-modal="true" tabindex="-1"><h2 class="modal-title">Zweite Ebene</h2><button id="nest-btn">OK</button></div>';
          document.getElementById('app').appendChild(second); applyModalInert(); topModalSheet().focus();
          const first = document.querySelectorAll('.modal-sheet')[0], top = topModalSheet();
          return { firstInert: !!first.closest('[inert]'), topInert: !!top.closest('[inert]'), topIsSecond: top.querySelector('#nest-btn') !== null }; }""")
        check('Verschachtelt: oberster Dialog aktiv, darunterliegender inert', nest['firstInert'] and not nest['topInert'] and nest['topIsSecond'], str(nest))
        await page.keyboard.press('Shift+Tab'); await page.wait_for_timeout(50)
        check('Verschachtelt: Umschalt+Tab bleibt im obersten Dialog', await ev("() => document.activeElement.id === 'nest-btn'"))
        await ev("() => { document.querySelectorAll('.modal-backdrop').forEach((e, i) => { if (i > 0) e.remove(); }); state.modal = null; render(); state.view = 'home'; render(); }"); await page.wait_for_timeout(200)
        check('Nach dem Schliessen ist nichts mehr inert', await ev("() => document.querySelectorAll('[inert],[data-savora-inert]').length === 0"))

        # ---------- D01: Mahlzeit / Gericht ----------
        await ev("() => { resetExtraFilters(); state.modal = null; state.view = 'home'; render(); }"); await page.wait_for_timeout(200)
        await page.click('[data-action="open-filter-sheet"]'); await page.wait_for_selector('.filter-sheet'); await page.wait_for_timeout(300)
        groups = await ev("() => Array.from(document.querySelectorAll('.fs-legend')).map(e => e.textContent.trim())")
        check('D01 Gruppen «Mahlzeit» und «Gericht» statt «Gerichtart»', 'Mahlzeit' in groups and 'Gericht' in groups and 'Gerichtart' not in groups, str(groups))
        sets = await ev("""() => { const g = (t) => { const f = Array.from(document.querySelectorAll('.fs-group')).find(x => x.querySelector('.fs-legend').textContent.trim() === t); return Array.from(f.querySelectorAll('.fs-text')).map(e => e.textContent.trim()); };
          return { meal: g('Mahlzeit'), dish: g('Gericht') }; }""")
        check('D01 Mahlzeit enthält Frühstück/Abendessen, Gericht enthält Suppe/Pasta/Backen, keine Vermischung', 'Frühstück' in sets['meal'] and 'Abendessen' in sets['meal'] and 'Suppe' not in sets['meal'] and 'Pasta' in sets['dish'] and 'Backen' in sets['dish'] and 'Abendessen' not in sets['dish'], str(sets))
        async def pickc(v):
            await page.click(f'.fs-input[data-fs-dim="category"][value="{v}"] >> xpath=..'); await page.wait_for_timeout(60)
        cnt = "() => applyAllFilters(state.recipes, filterDraft()).map(r => r.title).sort()"
        await pickc('dinner'); r1 = await ev(cnt)
        check('D01 nur Mahlzeit Abendessen: 2 Treffer', r1 == ['Abend-Pasta', 'Abend-Suppe'], str(r1))
        await pickc('lunch'); r2 = await ev(cnt)
        check('D01 ODER innerhalb Mahlzeit (Abend oder Mittag): 3 Treffer', r2 == ['Abend-Pasta', 'Abend-Suppe', 'Mittags-Pasta'], str(r2))
        await pickc('pasta'); r3 = await ev(cnt)
        check('D01 UND zwischen Mahlzeit und Gericht: Pasta zusätzlich: 2 Treffer', r3 == ['Abend-Pasta', 'Mittags-Pasta'], str(r3))
        await pickc('soup'); r4 = await ev(cnt)
        check('D01 ODER innerhalb Gericht (Pasta oder Suppe): 3 Treffer', r4 == ['Abend-Pasta', 'Abend-Suppe', 'Mittags-Pasta'], str(r4))
        await page.click('.fs-reset'); await page.wait_for_timeout(100)
        await pickc('pasta'); r5 = await ev(cnt)
        check('D01 nur Gericht Pasta: 2 Treffer, unabhängig von der Mahlzeit', r5 == ['Abend-Pasta', 'Mittags-Pasta'], str(r5))
        # Altfilter: unbekannte ID gehört zur Gruppe Gericht und trifft weiter; gemischte Altauswahl bleibt sichtbar
        legacy = await ev("""() => { const f = state.activeFilters; f.category = new Set(['legacy-x']); const a = applyAllFilters(state.recipes).map(r => r.title);
          f.category = new Set(['legacy-x', 'pasta']); const b = applyAllFilters(state.recipes).map(r => r.title).sort(); f.category = new Set(); return { a, b }; }""")
        check('D01 Altwert (unbekannte ID) verschwindet nicht', legacy['a'] == ['Altwert'] and legacy['b'] == ['Abend-Pasta', 'Altwert', 'Mittags-Pasta'], str(legacy))
        await page.keyboard.press('Escape'); await page.wait_for_timeout(450)
        after = await ev("() => JSON.stringify(state.recipes.map(r => r.id + '|' + r.title + '|' + JSON.stringify(r.categoryTags)).sort())")
        check('D01 Rezeptdaten unverändert (kein Datensatz verschwindet)', after == before and total == n)
        # Übernehmen und erneut öffnen: Auswahl vorbelegt, Zähler zählt je Option
        await page.click('[data-action="open-filter-sheet"]'); await page.wait_for_selector('.filter-sheet'); await page.wait_for_timeout(300)
        await pickc('dinner'); await pickc('pasta'); await page.click('.fs-apply'); await page.wait_for_timeout(500)
        ap = await ev("() => [document.querySelector('.filter-btn').textContent.trim(), document.querySelectorAll('.rcard, .rrow').length, activeStructuredFilterCount()]")
        check('D01 Übernehmen: Zähler «Filter · 2», 1 Treffer', ap[0] == 'Filter · 2' and ap[1] == 1 and ap[2] == 2, str(ap))
        await page.click('[data-action="open-filter-sheet"]'); await page.wait_for_selector('.filter-sheet'); await page.wait_for_timeout(300)
        pre = await ev("() => Array.from(document.querySelectorAll('.fs-input:checked')).map(i => i.dataset.fsDim + '=' + i.value).sort()")
        check('D01 Erneutes Öffnen: Mahlzeit und Gericht vorbelegt', pre == ['category=dinner', 'category=pasta', 'time='], str(pre))
        await page.keyboard.press('Escape'); await page.wait_for_timeout(450)
        await ev("() => { resetExtraFilters(); render(); }")

        # ---------- D02: Texte ----------
        await ev("() => { state.view = 'settings'; render(); }"); await page.wait_for_timeout(250)
        rows = await ev("() => Array.from(document.querySelectorAll('.settings-row-title, .settings-row b, .settings-row')).map(e => e.textContent.trim().replace(/\\s+/g, ' ')).join(' | ')")
        check('D02 Einstellungen: «Darstellung und Einheiten», «Freunde & Rezepte»', 'Darstellung und Einheiten' in rows and 'Freunde & Rezepte' in rows and 'Socialize' not in rows, rows[:300])
        await ev("() => { state.view = 'settings-share'; render(); }"); await page.wait_for_timeout(200)
        check('D02 Seitentitel «Freunde & Rezepte»', await ev("() => document.querySelector('.topbar-title').textContent.trim()") == 'Freunde & Rezepte')
        await ev("() => { state.view = 'settings-display'; render(); }"); await page.wait_for_timeout(200)
        check('D02 Seitentitel «Darstellung und Einheiten»', await ev("() => document.querySelector('.topbar-title').textContent.trim()") == 'Darstellung und Einheiten')
        # Editor: Eigene Schlagwörter mit Beispiel
        await ev("() => { state.editingRecipe = emptyRecipe(); state.view = 'form'; state.formStep = 1; render(); }"); await page.wait_for_timeout(250)
        lab = await ev("() => { const l = document.querySelector('label[for=\"f-tag-new\"]'); const h = l.parentElement.querySelector('.field-hint'); return [l.textContent.trim(), h ? h.textContent.trim() : '', document.getElementById('f-tag-new').placeholder]; }")
        check('D02 Editor: «Eigene Schlagwörter» mit kurzem Beispiel', lab[0] == 'Eigene Schlagwörter' and 'z.B.' in lab[1] and 'Tag' not in lab[2].replace('Schlagwort', ''), str(lab))
        await ev("() => { state.editingRecipe = null; state.view = 'home'; render(); }")
        await page.wait_for_timeout(150)
        await page.click('[data-action="open-filter-sheet"]'); await page.wait_for_selector('.filter-sheet'); await page.wait_for_timeout(300)
        grp = await ev("() => Array.from(document.querySelectorAll('.fs-legend')).map(e => e.textContent.trim())")
        check('D02 Filter: «Eigene Schlagwörter» statt «Tags»', 'Eigene Schlagwörter' in grp and 'Tags' not in grp, str(grp))
        await page.keyboard.press('Escape'); await page.wait_for_timeout(450)

        # ---------- D03: Auswahlzustand mit Haken, Hell/Dunkel (seit 0.70.2 ohne Schwarz) ----------
        MARK = """(sel) => { const e = document.querySelector(sel); if (!e) return null; const cs = getComputedStyle(e, '::before'); return { content: cs.content, w: parseFloat(cs.width), h: parseFloat(cs.height), bw: cs.borderRightWidth, col: cs.borderRightColor }; }"""
        for theme in ['light', 'dark']:
            await ev("(t) => { state.theme = t; applyTheme(); state.view = 'settings-display'; render(); }", theme); await page.wait_for_timeout(250)
            m = await ev(MARK, '.theme-opt.active')
            ok = m and m['content'] != 'none' and m['w'] > 2 and m['h'] > 4 and m['bw'] != '0px'
            inactive = await ev(MARK, '.theme-opt:not(.active)')
            check(f'D03 [{theme}] aktive Einstellungsoption zeigt Haken, inaktive nicht', bool(ok) and inactive['content'] == 'none', str(m))
            await ev("() => { state.view = 'home'; resetExtraFilters(); render(); }"); await page.wait_for_timeout(200)
            # Die Segment-Auswahl «Alle/Favoriten» gibt es auf Tablet und Desktop; auf dem Handy ist es seit der Startseite als Liste eine Auswahl «Alle Rezepte».
            await page.set_viewport_size({'width': 820, 'height': 1180}); await page.wait_for_timeout(500)
            m2 = await ev(MARK, '.seg-btn[aria-pressed="true"]')
            m3 = await ev(MARK, '.seg-btn[aria-pressed="false"]')
            check(f'D03 [{theme}] «Alle» zeigt Haken, «Favoriten» nicht', bool(m2) and m2['content'] != 'none' and m2['w'] > 2 and m3['content'] == 'none', str(m2))
            await page.set_viewport_size({'width': 390, 'height': 844}); await page.wait_for_timeout(500)
            await page.click('[data-action="open-filter-sheet"]'); await page.wait_for_selector('.filter-sheet'); await page.wait_for_timeout(250)
            await page.click('.fs-input[data-fs-dim="dietary"][value="vegan"] >> xpath=..'); await page.wait_for_timeout(80)
            mk = await ev("() => { const e = document.querySelector('.fs-input:checked + .fs-mark'); const cs = getComputedStyle(e); return { vis: !!e.querySelector('svg'), color: cs.color, bg: cs.backgroundColor, bd: cs.borderColor }; }")
            check(f'D03 [{theme}] Filteroption: Haken-Symbol sichtbar, Farbe weicht von der Fläche ab', mk['vis'] and mk['color'] != mk['bg'], str(mk))
            await page.keyboard.press('Escape'); await page.wait_for_timeout(400)
        await ev("() => { state.theme = 'auto'; applyTheme(); render(); }")
        # Editor-Chips und Wochenplan: bestehende Haken bleiben
        await ev("() => { state.editingRecipe = emptyRecipe(); state.editingRecipe.diet = ['vegan']; state.view = 'form'; state.formStep = 1; render(); }"); await page.wait_for_timeout(250)
        check('D03 Editor-Chip gewählt: Haken-Symbol', await ev("() => !!document.querySelector('.diet-select-chip.active svg')"))
        await ev("() => { state.editingRecipe = null; state.view = 'home'; render(); }")

        # ---------- D04/A02: Überschriften der Detailseite ----------
        await ev("() => { state.activeRecipeId = 'ac_a'; state.view = 'detail'; render(); }"); await page.wait_for_timeout(300)
        d = await ev("""() => ({ h1: Array.from(document.querySelectorAll('h1')).map(e => e.textContent.trim()), bar: document.querySelector('.topbar-title').tagName + ':' + document.querySelector('.topbar-title').textContent.trim(),
          levels: Array.from(document.querySelectorAll('#app h1, #app h2, #app h3')).map(e => e.tagName) })""")
        check('D04 Detailseite: genau ein h1 mit dem Rezepttitel, Kopfleiste zeigt «Rezept» ohne Überschrift', d['h1'] == ['Abend-Pasta'] and d['bar'] == 'SPAN:Rezept', str(d))
        order_ok = True; prev = 0
        for lv in d['levels']:
            k = int(lv[1]);
            if k > prev + 1: order_ok = False
            prev = k
        check('A02 Überschriftenreihenfolge ohne Ebenensprung (h1 > h2 > h3)', order_ok, str(d['levels']))
        long_title = 'Ein sehr langer Rezepttitel mit vielen Wörtern damit er in der Kopfleiste nicht doppelt auftaucht und den Kopf sprengt'
        await ev("(t) => { const r = state.recipes.find(x => x.id === 'ac_a'); r.title = t; render(); }", long_title); await page.wait_for_timeout(250)
        d2 = await ev("() => ({ bar: document.querySelector('.topbar-title').textContent.trim(), n: Array.from(document.querySelectorAll('#app *')).filter(e => e.children.length === 0 && e.textContent.trim() === arguments[0]).length })") if False else await ev("(t) => ({ bar: document.querySelector('.topbar-title').textContent.trim(), n: Array.from(document.querySelectorAll('#app *')).filter(e => e.children.length === 0 && e.textContent.trim() === t).length, over: document.documentElement.scrollWidth - window.innerWidth })", long_title)
        check('D04 Langer Titel nur einmal im Inhalt, Kopf «Rezept», kein Seitwärtsscrollen', d2['bar'] == 'Rezept' and d2['n'] == 1 and d2['over'] <= 0, str(d2))

        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await b.close()
    print('Fehler im Test:', FAIL if FAIL else 'keine')
    sys.exit(1 if FAIL else 0)
asyncio.run(main())
