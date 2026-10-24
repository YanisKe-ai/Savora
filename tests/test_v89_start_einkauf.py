"""v89 B: Startseite (kompakter Sicherungshinweis, eine Werkzeugzeile, rundes Plus beim Scrollen, Suche blendet aus),
untere Navigation bei 200 % Schrift, Hinzufügen-Menü (ohne «Aus Link» seit 0.90.1) und openTextImport(), Zwischenablage, Einkauf («…»-Menü mit
Bestätigung, zwei halbe Knöpfe, Kontrast erledigt), Mehr-Statuszeile «Daten», Geräteabgleich-Knopf, Wochenplan, Filter-Blatt."""
import asyncio, sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

CONTRAST = """(sel) => { const e = document.querySelector(sel); if (!e) return 0;
  const rgb = (s) => (s.match(/[\\d.]+/g) || []).slice(0, 4).map(Number);
  const lum = (c) => { const a = c.slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; };
  let n = e, bg = null; while (n && n.nodeType === 1) { const c = rgb(getComputedStyle(n).backgroundColor); if (c.length && (c.length < 4 || c[3] > 0.5)) { bg = c; break; } n = n.parentElement; }
  if (!bg) bg = rgb(getComputedStyle(document.body).backgroundColor);
  const a = lum(rgb(getComputedStyle(e).color)), b = lum(bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }"""

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={'width': 375, 'height': 667}, has_touch=True, reduced_motion='reduce', timezone_id='UTC', locale='de-CH')
        await ctx.add_init_script(NO_SW + " try{localStorage.setItem('savora-splash-seen','1')}catch(e){}")
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(400)
        ev = page.evaluate
        async def click(sel):
            await page.wait_for_selector(sel, state='attached')
            await ev("(s) => document.querySelector(s).click()", sel); await page.wait_for_timeout(150)
        # genug Rezepte zum Scrollen und ein Eintrag für heute
        await ev("""async () => {
          for (let i = 0; i < 6; i++) { const r = emptyRecipe(); r.id = 'r_v89_' + i; r.title = 'TEST: Zusatz ' + i; r.ingredients = [{ amount: '1', unit: '', name: 'Ei' }]; r.steps = [{ text: 'Kochen.' }]; await dbPut(r); }
          await loadRecipes();
          await savePlanEntries(fmtDateKey(new Date()), [{ id: 'e1', recipeId: state.recipes[0].id, meal: '', servings: null }]);
          await loadMealplan();
          localStorage.removeItem('savora-backup-nudge-until'); state.lastBackupAt = null; state.homeLayout = 'list'; state.homeLayoutChosen = false;
          state.view = 'home'; render(); }""")
        await page.wait_for_selector('.rrow--phone')

        # ---------- Startseite iPhone SE ----------
        h = await ev("""() => { const r = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
          const add = r('.home-add-btn'); const rows = Array.from(document.querySelectorAll('.rrow--phone')).map(e => e.getBoundingClientRect());
          return { nudge: r('.nudge-card') && r('.nudge-card').height, info: r('.result-row--phone .result-info').height, tools: r('.result-row--phone .result-tools').top, infoTop: r('.result-row--phone .result-info').top,
            visible: rows.filter(x => x.top < add.top - 40).length, today: r('.today-planned') && r('.today-planned').height,
            close: document.querySelector('.nudge-card [data-action=backup-nudge-dismiss]').getAttribute('aria-label') }; }""")
        check('Sicherungshinweis ist eine Zeile (höchstens 48 px) mit Schliessen «Später erinnern»', h['nudge'] is not None and h['nudge'] <= 48 and h['close'] == 'Später erinnern', str(h))
        check('Anzahl, Sortierung, Auswählen, Ansicht und Filter kompakt (eine Zeile; auf 375 px mit Linux-Schrift höchstens zwei, mind. 2 Rezepte sichtbar)', h['info'] <= 48 or (h['info'] <= 68 and h['visible'] >= 2), str(h))
        check('«Heute geplant» in einer Zeile', h['today'] is not None and h['today'] <= 48, str(h))
        check('375×667: mindestens 2 Rezepte sichtbar über «Rezept hinzufügen»', h['visible'] >= 2, str(h))
        st = await ev("() => document.querySelector('.sort-inline .inline-pick-text').textContent.trim()")
        check('Sortiertext bleibt vollständig im Text (Kurzform nur als Anzeige)', st == 'Zuletzt bearbeitet', st)

        # Rundes Plus beim Scrollen (IntersectionObserver)
        check('Oben: «Rezept hinzufügen» breit mit Text', await ev("() => !document.querySelector('.home-add-bar').classList.contains('is-compact') && document.querySelector('.home-add-btn').innerText.includes('Rezept hinzufügen')"))
        await ev("window.scrollTo(0, 500)")
        await page.wait_for_function("document.querySelector('.home-add-bar').classList.contains('is-compact')", timeout=3000)
        fab = await ev("() => { const b = document.querySelector('.home-add-btn').getBoundingClientRect(); return { w: b.width, h: b.height, right: innerWidth - b.right, name: document.querySelector('.home-add-btn').getAttribute('aria-label') }; }")
        check('Gescrollt: runder Plus-Knopf rechts, mindestens 48 px, Name bleibt', abs(fab['w'] - fab['h']) < 1 and fab['h'] >= 48 and fab['right'] < 30 and fab['name'] == 'Rezept hinzufügen', str(fab))
        await ev("window.scrollTo(0, 0)")
        await page.wait_for_function("!document.querySelector('.home-add-bar').classList.contains('is-compact')", timeout=3000)
        check('Zurück oben: wieder breit', True)

        # Suche blendet «Heute geplant» und Sicherungshinweis aus
        await page.click('#searchBtn'); await page.wait_for_selector('#searchInput')
        await page.fill('#searchInput', 'TEST'); await page.wait_for_timeout(500)
        s = await ev("() => ({ today: !!document.querySelector('.today-planned'), nudge: !!document.querySelector('.nudge-card'), rows: document.querySelectorAll('.rrow--phone').length })")
        check('Aktive Suche: «Heute geplant» und Sicherungshinweis ausgeblendet, Treffer da', not s['today'] and not s['nudge'] and s['rows'] > 0, str(s))
        await ev("() => { state.query = ''; state.searchOpen = false; render(); }"); await page.wait_for_timeout(200)
        check('Suche beendet: beide wieder sichtbar', await ev("() => !!document.querySelector('.today-planned') && !!document.querySelector('.nudge-card')"))

        # ---------- Untere Navigation bei 200 % ----------
        await ev("document.documentElement.style.fontSize = '200%'"); await page.wait_for_timeout(250)
        nav = await ev("""() => { const bs = Array.from(document.querySelectorAll('.bottom-nav button')).map(b => b.getBoundingClientRect());
          const ls = Array.from(document.querySelectorAll('.bottom-nav .nav-label')).map(l => l.getBoundingClientRect());
          const inside = ls.every((l, i) => l.left >= bs[i].left - 0.5 && l.right <= bs[i].right + 0.5);
          const apart = ls.every((l, i) => i === 0 || l.left >= ls[i - 1].right - 0.5);
          return { inside, apart, navH: document.querySelector('.bottom-nav').getBoundingClientRect().height }; }""")
        check('200 % Schrift: Beschriftungen der unteren Navigation überlappen nicht', nav['inside'] and nav['apart'] and nav['navH'] <= 80, str(nav))
        await ev("document.documentElement.style.fontSize = ''")

        # ---------- Hinzufügen-Menü: «Aus Link» seit 0.90.1 entfernt ----------
        await click('[data-action="open-add-menu"]'); await page.wait_for_selector('.add-menu-sheet')
        opts = await ev("() => Array.from(document.querySelectorAll('.add-menu-option strong')).map(e => e.textContent)")
        check('Hinzufügen-Menü: Erstellen und Text, kein «Aus Link» mehr', 'Rezept erstellen' in opts and 'Aus Text importieren' in opts and 'Aus Link' not in opts and not await ev("!!document.querySelector('[data-action=\"open-link-import\"]')"), str(opts))
        await ev("() => { state.modal = null; state.view = 'home'; render(); }")

        # openTextImport für das Share Target: Link still als Quelle, kein Linkfeld
        await ev("() => openTextImport({ text: 'TEST: Geteilt\\n\\nZutaten:\\n1 Ei\\n\\nZubereitung:\\n1. Kochen.', url: 'https://example.org/x' })"); await page.wait_for_selector('#pasteText')
        pre = await ev("() => ({ t: document.getElementById('pasteText').value, u: state.pasteImport.url, feld: !!document.getElementById('pasteUrl'), title: document.querySelector('.topbar-title').textContent.trim() })")
        check('openTextImport({ text, url }): Text vorbefüllt, Link still gemerkt, kein Linkfeld', pre['t'].startswith('TEST: Geteilt') and pre['u'] == 'https://example.org/x' and not pre['feld'] and pre['title'] == 'Aus Text importieren', str(pre))
        await click('[data-action="do-paste-import"]'); await page.wait_for_function("state.view === 'form'")
        src = await ev("() => state.editingRecipe.source")
        check('Geteilter Link wird als Quelle gespeichert (kein Abruf)', src == 'https://example.org/x', str(src))
        await ev("() => { state.editingRecipe = null; state.view = 'home'; render(); }")
        await ev("() => openTextImport({ text: 'https://example.org/nur-link' })"); await page.wait_for_selector('#pasteText')
        pre2 = await ev("() => ({ t: document.getElementById('pasteText').value, u: state.pasteImport.url })")
        check('Nur ein Link als Text: Textfeld bleibt leer, Link als Quelle gemerkt', pre2['t'] == '' and pre2['u'] == 'https://example.org/nur-link', str(pre2))
        await ev("() => openTextImport({})"); await page.wait_for_selector('#pasteText')
        th = await ev("() => ({ h: document.getElementById('pasteText').getBoundingClientRect().height, H: innerHeight, link: !!document.getElementById('pasteUrl') })")
        check('Textimport: Feld etwa 40 % der Höhe, ohne Linkfeld', th['h'] >= th['H'] * 0.38 and not th['link'], str(th))
        # Zwischenablage
        await ctx.grant_permissions(['clipboard-read', 'clipboard-write'])
        await ev("() => navigator.clipboard.writeText('TEST: Aus der Ablage')")
        await click('[data-action="paste-from-clipboard"]')
        await page.wait_for_function("document.getElementById('pasteText').value.includes('TEST: Aus der Ablage')", timeout=3000)
        check('«Aus Zwischenablage einfügen» füllt das Textfeld', True)
        await ev("() => { Object.defineProperty(navigator, 'clipboard', { value: { readText: () => Promise.reject(new Error('nein')) }, configurable: true }); }")
        await click('[data-action="paste-from-clipboard"]')
        await page.wait_for_function("document.getElementById('pasteClipHint').textContent.length > 0", timeout=3000)
        check('Ohne Erlaubnis: verständlicher Hinweis statt Fehler', 'Einfügen' in await ev("document.getElementById('pasteClipHint').textContent"))

        # ---------- Einkauf ----------
        await ev("""async () => { await dbPutShopping({ id: 's_v1', name: 'TEST: Butter', amount: 1, unit: 'Stk', checked: false, createdAt: 1 });
          await dbPutShopping({ id: 's_v2', name: 'TEST: Mehl', amount: 500, unit: 'g', checked: true, createdAt: 2 }); await loadShopping(); state.shopStay = new Set(); state.view = 'shopping'; render(); }""")
        await page.wait_for_selector('.shop-quick')
        q = await ev("() => Array.from(document.querySelectorAll('.shop-quick .outline-btn')).map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.width), b.scrollWidth <= b.clientWidth + 1]; })")
        check('«Aus Rezepten» und «Aus Wochenplan» als zwei halbe Knöpfe in einer Zeile', len(q) == 2 and q[0][0] == q[1][0] and q[0][2] and q[1][2], str(q))
        check('Kein Papierkorb mehr direkt im Kopf, dafür «…»', await ev("() => !document.querySelector('.topbar [data-action=\"clear-all-shopping\"]') && !!document.querySelector('.topbar [data-action=\"open-shop-menu\"]')"))
        c = await ev(CONTRAST, '.shop-row.is-checked .shop-name')
        check('Erledigte Einträge: Kontrast mindestens 4,5:1', c >= 4.5, f'{c:.2f}')
        await click('[data-action="open-shop-menu"]'); await page.wait_for_selector('[data-action="shop-clear-ask"]')
        await click('[data-action="shop-clear-ask"]'); await page.wait_for_selector('.modal-sheet [data-action="clear-all-shopping"]')
        n0 = await ev("() => state.shopping.length")
        check('Löschen fragt zuerst nach, Liste noch voll', n0 >= 2 and await ev("() => state.modal && state.modal.type") == 'shop-clear-confirm', str(n0))
        await click('.modal-sheet [data-action="clear-all-shopping"]')
        await page.wait_for_function("state.shopping.length === 0 && !state.modal")
        check('Bestätigt: Liste geleert, Fenster zu, Rückgängig angeboten', await ev("() => !!document.querySelector('.toast-action-btn')"))
        await ev("() => document.querySelector('.toast-action-btn').click()")
        await page.wait_for_function(f"state.shopping.length === {n0}")
        check('Rückgängig stellt die Liste wieder her', True)

        # ---------- Mehr, Geräteabgleich ----------
        await ev("() => { state.view = 'more'; render(); }"); await page.wait_for_selector('.settings-group')
        d = await ev("() => { const g = document.querySelector('.settings-group'); const r = g.querySelector('.settings-row'); return [g.querySelector('.settings-group-title').textContent.trim(), r.dataset.view, r.querySelector('.settings-row-summary').textContent.trim()]; }")
        check('Mehr: Statuszeile «Daten» mit echtem Sicherungsstand und Sprung', d[0] == 'Daten' and d[1] in ('settings-backup', 'settings-sync') and 'Sicherung' in d[2], str(d))
        await ev("() => { state.view = 'settings-sync'; render(); }"); await page.wait_for_selector('.kd-note-link')
        kh = await ev("() => document.querySelector('.kd-note-link').getBoundingClientRect().height")
        check('Geräteabgleich: Knopf «Sicherung» mindestens 44 px', kh >= 44, str(kh))

        # ---------- Wochenplan ----------
        await ev("() => { state.view = 'mealplan'; render(); }"); await page.wait_for_selector('.week-nav')
        w = await ev("""() => { const c = (e) => { const r = e.getBoundingClientRect(); return r.top + r.height / 2; };
          return { label: c(document.querySelector('.week-nav-label')), prev: c(document.querySelector('[data-action=week-prev]')), next: c(document.querySelector('[data-action=week-next]')), sel: (document.querySelector('.day-select') || {}).innerText }; }""")
        check('Wochenplan: Datum und Pfeile vertikal zentriert', abs(w['label'] - w['prev']) < 2 and abs(w['label'] - w['next']) < 2, str(w))
        check('Wochenplan: Häkchen klar beschriftet', 'einkaufen' in (w['sel'] or '') and len((w['sel'] or '').strip()) > 10, str(w['sel']))

        # ---------- Filter-Blatt ----------
        await ev("() => { state.view = 'home'; render(); }"); await click('[data-action="open-filter-sheet"]'); await page.wait_for_selector('.fs-foot')
        f = await ev("""() => { const o = Array.from(document.querySelectorAll('.fs-opt')).find(x => /Meeresfr/.test(x.textContent));
          const a = document.querySelectorAll('.fs-actions > button'); const t = o.querySelector('.fs-text');
          return { wide: o.classList.contains('fs-opt--wide'), hy: getComputedStyle(t).hyphens, lines: Math.round(t.getBoundingClientRect().height / parseFloat(getComputedStyle(t).lineHeight)),
            oneRow: Math.round(a[0].getBoundingClientRect().top) === Math.round(a[1].getBoundingClientRect().top), foot: document.querySelector('.fs-foot').getBoundingClientRect().height }; }""")
        check('Filter: «Meeresfrüchte» ohne Silbentrennung in einer Zeile', f['wide'] and f['hy'] == 'manual' and f['lines'] == 1, str(f))
        check('Filter: Fusszeile kompakt (Knöpfe in einer Zeile)', f['oneRow'] and f['foot'] < 90, str(f))

        # ---------- Update-Karte ----------
        it = await ev("() => { const d = document.createElement('span'); d.className = 'update-card-dot'; document.body.appendChild(d); const v = getComputedStyle(d).animationIterationCount; d.remove(); return v; }")
        check('Update-Punkt pulsiert nur einmal', it == '1', it)

        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await browser.close()
    if FAIL: print('\nFEHLGESCHLAGEN:', len(FAIL)); sys.exit(1)
    print('\nALLE PRUEFUNGEN BESTANDEN')

asyncio.run(main())
