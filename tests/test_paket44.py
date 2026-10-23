"""Paket 44: Rezeptfilter ueberarbeitet (Startseite: Suche, Alle/Favoriten, Filter-Schaltflaeche, Zusammenfassung; Fenster «Rezepte filtern» mit Entwurf).
Prueft: Zaehlerregeln, Entwurf/Uebernehmen/Abbrechen/Escape/Hintergrund/Zuruecksetzen, ODER/UND, Zeitfilter inkl. unbekannter Dauer, Beschriftung
(Singular/Plural/0), Leerzustand, Erhalt nach Detail und Zurueck, Alle/Favoriten kombiniert, Suche kombiniert, Fokus-Rueckgabe, Scroll-Sperre ohne Sprung,
Tippflaechen, Ueberlauf bei 320/375/430 und 24 px Schrift (Hell, Dunkel), Kopfhoehe, Daten unveraendert."""
import asyncio, sys, os
os.environ.setdefault('SAVORA_TEST_PORT', '8895')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

EXTRA = """async () => {
  const mk = (id, title, o) => { const r = emptyRecipe(); r.id = id; r.title = title; r.servings = 2; r.ingredients = [{amount:'1', unit:'', name:'Zutat'}]; r.steps = [{text:'Kochen.'}]; Object.assign(r, o); return r; };
  const list = [
    mk('p44_a', 'Gemüsepfanne', { diet: ['vegetarisch'], timeMinutes: 20, categoryTags: ['dinner'], favorite: true, tags: ['Schnell'] }),
    mk('p44_b', 'Linsensuppe mit sehr langem Namen für den Umbruchtest', { diet: ['vegan', 'vegetarisch'], timeMinutes: 45, categoryTags: ['lunch', 'soup'], cookCount: 5 }),
    mk('p44_c', 'Pizza ohne Zeitangabe', { diet: ['vegetarisch'], timeMinutes: 0, categoryTags: ['dinner'], favorite: true }),
    mk('p44_d', 'Apfelkuchen', { diet: ['vegetarisch'], timeMinutes: 15, categoryTags: ['dessert'], cookCount: 1 }),
    mk('p44_e', 'Frühstücksbowl', { diet: ['vegan'], timeMinutes: 10, categoryTags: ['breakfast'], favorite: true }),
  ];
  for (const r of list) await dbPut(r);
  await loadRecipes();
  state.view = 'home'; state.query = ''; state.favOnly = false; state.activeCollection = 'all'; state.activeTag = null; state.sortBy = 'updated';
  resetExtraFilters(); render(); return state.recipes.length;
}"""
COUNT = "() => applyAllFilters(state.recipes).length"
TITLES = "() => applyAllFilters(state.recipes).map(r => r.title).sort()"
HEAD_RECT = "() => { const h = document.querySelector('.home-head').getBoundingClientRect(); return [Math.round(h.top), Math.round(h.bottom), Math.round(h.height)]; }"
SMALL = """() => { const out = []; for (const s of ['.seg-btn', '.filter-btn', '.sort-select', '.layout-toggle .icon-toggle', '.filter-summary-reset', '.fs-opt', '.fs-close', '.fs-apply', '.fs-reset', '.empty-actions button']) {
  document.querySelectorAll(s).forEach(e => { const r = e.getBoundingClientRect(); if (r.width && r.height && (r.height < 43.5 || r.width < 43.5)) out.push(s + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); }); } return out; }"""

async def set_theme(page, theme):
    await page.evaluate("(t) => { state.theme = t; applyTheme(); }", theme); await page.wait_for_timeout(120)

async def fresh(page):
    await page.evaluate("() => { resetExtraFilters(); state.query=''; state.favOnly=false; state.activeCollection='all'; state.selectMode=null; state.modal=null; state.view='home'; render(); window.scrollTo(0,0); }"); await page.wait_for_timeout(250)

# v84: «Alle / Favoriten» steht in der Sammlungsauswahl (Titel bzw. Knopf neben «Filter»), nicht mehr als .seg oder Sortieroption
async def scope(page, sid):
    await page.click('#colPickBtn'); await page.wait_for_selector('.col-pick-item'); await page.click(f'.col-pick-item[data-id="{sid}"]'); await page.wait_for_timeout(350)

async def open_sheet(page):
    await page.click('[data-action="open-filter-sheet"]'); await page.wait_for_selector('.filter-sheet'); await page.wait_for_timeout(300)

async def pick(page, dim, value):
    # Auf langsamen Rechnern (Linux-CI) kann das Neuzeichnen nach dem Klick laenger als 80 ms dauern: warten, bis der Zustand umgeschaltet hat.
    sel = f'.fs-input[data-fs-dim="{dim}"][value="{value}"]'
    before = await page.evaluate("(s) => { const i = document.querySelector(s); return i ? i.checked : null; }", sel)
    await page.click(sel + ' >> xpath=..')
    try:
        await page.wait_for_function("(a) => { const i = document.querySelector(a[0]); return i && i.checked !== a[1]; }", arg=[sel, before], timeout=3000)
    except Exception:
        pass   # Radio, das schon gewaehlt war, schaltet nicht um; die Pruefung danach entscheidet
    await page.wait_for_timeout(80)

async def main():
    async with async_playwright() as p:
        # Ablauf, Entwurf, Zaehler und Fokusfalle laufen auf dem Tablet (820 px): dort steht weiter die Segment-Auswahl «Alle/Favoriten» und das Raster.
        # Das Handy (unter 768 px) hat seit der Startseite als Liste eine eigene Anordnung; sie prueft Abschnitt A2 hier und test_startseite_liste.py.
        b, ctx = await open_ctx(p, 820, 700, 'reduce'); page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(300)
        n = await page.evaluate(EXTRA); await page.wait_for_timeout(300); ev = page.evaluate
        before = await ev("() => JSON.stringify(state.recipes.map(r => r.id + '|' + r.title + '|' + r.favorite + '|' + r.timeMinutes).sort())")
        check('Testdaten: 8 Rezepte', n == 8, str(n))

        # ---------- A. Startseite ----------
        await fresh(page)
        st = await ev("""() => ({ ph: document.getElementById('searchInput').placeholder, fw: Math.round(document.querySelector('.search-field').getBoundingClientRect().width), cw: Math.round(document.querySelector('.home-head-body').getBoundingClientRect().width),
          seg: Array.from(document.querySelectorAll('.seg-btn')).map(e => e.textContent.trim() + ':' + e.getAttribute('aria-pressed')), fb: document.querySelector('.filter-btn').textContent.trim(), chips: document.querySelectorAll('.chip').length, summary: !!document.querySelector('.filter-summary'),
          searchTop: document.querySelector('.search-field').getBoundingClientRect().top, barTop: document.querySelector('.filter-bar').getBoundingClientRect().top })""")
        check('Suche: Platzhalter «Rezepte suchen», volle Breite, eigene Zeile', st['ph'] == 'Rezepte suchen' and st['fw'] >= st['cw'] - 70 and st['barTop'] > st['searchTop'] + 40, str(st))
        st['pick'] = await ev("() => document.getElementById('colPickBtn').textContent.trim()")
        check('Sammlungsauswahl «Alle Rezepte» statt Alle/Favoriten, Filter-Schaltfläche heisst «Filter», keine Chip-Leiste, keine Zusammenfassung', st['seg'] == [] and st['pick'] == 'Alle Rezepte' and st['fb'] == 'Filter' and st['chips'] == 0 and not st['summary'], str(st))
        hh = await ev(HEAD_RECT)
        check('Kopf belegt höchstens 40 Prozent der Höhe (820x700)', hh[2] <= 0.40 * 700, str(hh))
        rl = await ev("() => document.querySelector('.result-line').textContent.trim()")
        check('Trefferzeile zeigt Anzahl', rl == '8 Rezepte', rl)

        # Alle / Favoriten
        await scope(page, 'favorites')
        check('Favoriten: nur Favoriten', await ev(COUNT) == 4 and await ev("() => document.getElementById('colPickBtn').textContent.trim()") == 'Favoriten', str(await ev(TITLES)))
        check('Favoriten zählen nicht im Filterzähler', await ev("() => document.querySelector('.filter-btn').textContent.trim()") == 'Filter')
        await scope(page, 'all')
        check('Alle: gesamte Sammlung', await ev(COUNT) == 8)

        # ---------- A2. Handy: Startseite als Liste (Auswahl «Alle Rezepte», Filter, Zeile mit Anzahl und Sortierung) ----------
        b2, ctx2 = await open_ctx(p, 390, 844, 'reduce'); pg2 = await ctx2.new_page(); ev2 = pg2.evaluate
        await goto(pg2); await pg2.evaluate(open(SEED_PATH).read()); await pg2.wait_for_timeout(300); await ev2(EXTRA); await pg2.wait_for_timeout(200)
        await ev2("() => { resetExtraFilters(); state.query=''; state.favOnly=false; state.modal=null; state.view='home'; render(); window.scrollTo(0,0); }"); await pg2.wait_for_timeout(250)
        st2 = await ev2("""() => ({ ph: document.getElementById('searchBtn').getAttribute('aria-label'), field: !!document.querySelector('.search-field'), bw: Math.round(document.getElementById('searchBtn').getBoundingClientRect().width), fr: document.querySelector('.filter-btn').getBoundingClientRect().right, sl: document.getElementById('searchBtn').getBoundingClientRect().left,
          sel: !!document.getElementById('viewSelect'), opts: Array.from(document.querySelectorAll('#sortSelect option')).map(o => o.textContent.trim()), seg: document.querySelectorAll('.seg-btn').length, fb: document.querySelector('.filter-btn').textContent.trim(), chips: document.querySelectorAll('.chip').length,
          rl: document.querySelector('.result-line').textContent.trim(), hh: Math.round(document.querySelector('.home-head').getBoundingClientRect().height) })""")
        # Neues bewusstes Verhalten (Handy): kein breites Suchfeld mehr, runder Suchknopf (44 px) rechts neben «Filter»; das Feld oeffnet sich erst auf Tippen und hat den Platzhalter «Rezepte suchen …»
        check('Handy: runder Suchknopf «Suchen» rechts neben dem Titel «Alle Rezepte», «Filter» in der Zeile darunter', st2['ph'] == 'Suchen' and not st2['field'] and st2['bw'] == 44 and st2['sl'] > 200 and not st2['sel'] and 'Nur Favoriten' not in st2['opts'] and st2['seg'] == 0 and st2['fb'] == 'Filter' and st2['chips'] == 0, str(st2))
        await pg2.click('#searchBtn'); await pg2.wait_for_timeout(250)
        check('Handy: Suchfeld nach Tippen auf den Knopf mit Platzhalter «Rezepte suchen …»', await ev2("() => document.getElementById('searchInput').placeholder") == 'Rezepte suchen …')
        await pg2.keyboard.press('Escape'); await pg2.wait_for_timeout(150)
        check('Handy: Kopf belegt höchstens 40 Prozent der Höhe (390x844) und Zeile zeigt «8 Rezepte»', st2['hh'] <= 0.40 * 844 and st2['rl'] == '8 Rezepte', str(st2))
        await scope(pg2, 'favorites')
        check('Handy: Favoriten wählbar, zählen nicht im Filterzähler', await ev2(COUNT) == 4 and await ev2("() => document.querySelector('.filter-btn').textContent.trim()") == 'Filter')
        await scope(pg2, 'all')
        check('Handy: «Alle Rezepte» zeigt die gesamte Sammlung', await ev2(COUNT) == 8)
        await b2.close()

        # ---------- B. Fenster, Entwurf, Zähler ----------
        await open_sheet(page)
        sh = await ev("""() => { const s = document.querySelector('.filter-sheet'); const g = Array.from(document.querySelectorAll('.fs-legend')).map(e => e.textContent.trim());
          return { role: s.getAttribute('role'), modal: s.getAttribute('aria-modal'), lab: document.getElementById(s.getAttribute('aria-labelledby')).textContent.trim(), groups: g, close: !!document.querySelector('.fs-close[aria-label="Schliessen"]'),
          apply: document.querySelector('.fs-apply').textContent.trim(), types: Array.from(document.querySelectorAll('.fs-input')).map(i => i.dataset.fsDim + ':' + i.type).filter((v, i, a) => a.indexOf(v) === i),
          time: Array.from(document.querySelectorAll('.fs-input[data-fs-dim=time]')).map(i => i.closest('label').textContent.trim()), locked: document.body.style.position } }""")
        check('Fenster: Dialog, modal, Überschrift «Rezepte filtern», Schliessen-Schaltfläche', sh['role'] == 'dialog' and sh['modal'] == 'true' and sh['lab'] == 'Rezepte filtern' and sh['close'], str(sh))
        check('Gruppen aus echten Daten', sh['groups'][:5] == ['Ernährung', 'Mahlzeit', 'Gerichtart', 'Gesamtzeit', 'Weitere Merkmale'], str(sh['groups']))
        check('Mehrfach = Checkbox, Zeit = Radio', 'dietary:checkbox' in sh['types'] and 'category:checkbox' in sh['types'] and 'time:radio' in sh['types'], str(sh['types']))
        check('Zeitoptionen: «Beliebig», «Bis 15/30/60 Min.»', sh['time'] == ['Beliebig', 'Bis 15 Min.', 'Bis 30 Min.', 'Bis 60 Min.'], str(sh['time']))
        check('Beschriftung Hauptaktion «8 Rezepte anzeigen»', sh['apply'] == '8 Rezepte anzeigen', sh['apply'])
        check('Hintergrund gesperrt', sh['locked'] == 'fixed', sh['locked'])

        await pick(page, 'dietary', 'vegetarisch')
        a1 = await ev("() => [document.querySelector('.fs-apply').textContent.trim(), document.querySelector('.filter-btn').textContent.trim(), state.activeFilters.dietary.size, document.querySelector('.fs-status').textContent]")
        # v0.83 (Auftrag §15): vegetarisch schliesst vegan ein (Frühstücksbowl, vegan) sowie das vegane Gemüse-Curry aus seed.js -> zwei Treffer mehr als vorher
        check('Entwurf: Trefferzahl live, Filterzähler und Zustand noch unverändert', a1[0] == '6 Rezepte anzeigen' and a1[1] == 'Filter' and a1[2] == 0, str(a1))
        await pick(page, 'time', 'under-30')
        a2 = await ev("() => document.querySelector('.fs-apply').textContent.trim()")
        check('Vegetarisch (inkl. vegan) UND Bis 30 Min.: 4 Treffer, unbekannte Dauer nicht als schnell', a2 == '4 Rezepte anzeigen', a2)
        await pick(page, 'category', 'dessert')
        a3 = await ev("() => document.querySelector('.fs-apply').textContent.trim()")
        check('Dazu Dessert: 1 Treffer, Singular «1 Rezept anzeigen»', a3 == '1 Rezept anzeigen', a3)
        await pick(page, 'category', 'dinner')
        a4 = await ev("() => document.querySelector('.fs-apply').textContent.trim()")
        check('Innerhalb Gruppe ODER (Dessert oder Abendessen): 2', a4 == '2 Rezepte anzeigen', a4)
        await pick(page, 'dietary', 'vegan')
        a5 = await ev("() => document.querySelector('.fs-apply').textContent.trim()")
        check('Ernährung ODER (vegetarisch oder vegan), UND Bis 30, UND Gerichtart: Gemüsepfanne, Apfelkuchen, Bowl nicht (Frühstück): 2', a5 == '2 Rezepte anzeigen', a5)
        await pick(page, 'time', 'under-15'); await pick(page, 'category', 'dessert'); await pick(page, 'category', 'dinner')
        radios = await ev("() => Array.from(document.querySelectorAll('.fs-input[data-fs-dim=time]')).filter(i => i.checked).map(i => i.value)")
        check('Zeit ist Einzelauswahl', radios == ['under-15'], str(radios))
        await pick(page, 'time', 'under-15')
        # Null Treffer im Fenster
        await pick(page, 'dietary', 'vegan'); await pick(page, 'dietary', 'vegetarisch'); await pick(page, 'more', 'frequent')
        z = await ev("() => [document.querySelector('.fs-apply').textContent.trim(), document.querySelector('.fs-status').textContent, document.querySelector('.fs-reset') ? 1 : 0, document.querySelectorAll('.fs-input:checked').length]")
        check('Null Treffer im Fenster: «0 Rezepte anzeigen», «Keine passenden Rezepte», Auswahl bleibt bearbeitbar', z[0] == '0 Rezepte anzeigen' and z[1].startswith('Keine passenden Rezepte') and z[3] >= 1, str(z))
        await page.click('.fs-reset'); await page.wait_for_timeout(150)
        z2 = await ev("() => [document.querySelector('.fs-apply').textContent.trim(), document.querySelectorAll('.fs-input:checked').length, state.activeFilters.dietary.size, document.querySelector('.fs-input[data-fs-dim=time][value=\"\"]').checked]")
        check('Zurücksetzen im Fenster leert nur den Entwurf', z2[0] == '8 Rezepte anzeigen' and z2[1] == 1 and z2[3] is True, str(z2))

        # Abbrechen-Wege verwerfen den Entwurf
        await pick(page, 'dietary', 'vegan')
        await page.click('.fs-close'); await page.wait_for_timeout(500)
        c1 = await ev("() => [!!document.querySelector('.filter-sheet'), state.activeFilters.dietary.size, document.activeElement.dataset.action, document.body.style.position]")
        check('Schliessen verwirft den Entwurf, Fokus zurück auf «Filter»', c1 == [False, 0, 'open-filter-sheet', ''], str(c1))
        await open_sheet(page); await pick(page, 'dietary', 'vegan')
        await page.keyboard.press('Escape'); await page.wait_for_timeout(500)
        c2 = await ev("() => [!!document.querySelector('.filter-sheet'), state.activeFilters.dietary.size, document.activeElement.dataset.action]")
        check('Escape verwirft den Entwurf, Fokus zurück', c2 == [False, 0, 'open-filter-sheet'], str(c2))
        await open_sheet(page); await pick(page, 'dietary', 'vegan')
        await page.mouse.click(5, 5); await page.wait_for_timeout(500)
        c3 = await ev("() => [!!document.querySelector('.filter-sheet'), state.activeFilters.dietary.size, document.activeElement.dataset.action]")
        check('Hintergrundtipp verwirft den Entwurf, Fokus zurück', c3 == [False, 0, 'open-filter-sheet'], str(c3))
        await open_sheet(page); await page.keyboard.press('Escape'); await page.wait_for_timeout(500)

        # Übernehmen
        await open_sheet(page); await pick(page, 'dietary', 'vegetarisch'); await pick(page, 'time', 'under-30')
        await page.click('.fs-apply'); await page.wait_for_timeout(600)
        ap = await ev("""() => ({ gone: !document.querySelector('.filter-sheet'), btn: document.querySelector('.filter-btn').textContent.trim(), sum: document.querySelector('.filter-summary-text').textContent.trim(), n: document.querySelectorAll('.rcard').length,
          line: document.querySelector('.result-line').textContent.trim(), foc: document.activeElement.dataset.action, f: [state.activeFilters.dietary.size, state.activeFilters.time.size] })""")
        check('Übernehmen: Zähler «Filter · 2», Zusammenfassung, 4 Treffer (vegan zählt als vegetarisch)', ap['gone'] and ap['btn'] == 'Filter · 2' and 'Vegetarisch' in ap['sum'] and 'Bis 30 Min.' in ap['sum'] and ap['n'] == 4 and ap['line'] == '4 von 8 Rezepten', str(ap))   # v84: mit Filter «Treffer von Gesamtzahl»
        check('Fokus nach Übernehmen auf «Filter»', ap['foc'] == 'open-filter-sheet', str(ap['foc']))
        # beim erneuten Öffnen ist die Auswahl vorbelegt
        await open_sheet(page)
        pre = await ev("() => Array.from(document.querySelectorAll('.fs-input:checked')).map(i => i.dataset.fsDim + '=' + i.value).sort()")
        check('Erneutes Öffnen: angewendete Auswahl ist vorbelegt', pre == ['dietary=vegetarisch', 'time=under-30'], str(pre))
        await page.keyboard.press('Escape'); await page.wait_for_timeout(450)

        # Favoriten + Suche kombiniert mit Filtern, Sortierung/Fav zählen nicht
        await scope(page, 'favorites')
        t = await ev(TITLES)
        check('Favoriten kombiniert mit Filtern: Gemüsepfanne und (vegan) Frühstücksbowl', sorted(t) == ['Frühstücksbowl', 'Gemüsepfanne'] and await ev("() => document.querySelector('.filter-btn').textContent.trim()") == 'Filter · 2', str(t))
        await scope(page, 'all')
        check('«Alle» setzt zusätzliche Filter nicht zurück', await ev(COUNT) == 4 and await ev("() => state.activeFilters.dietary.size") == 1)
        await page.fill('#searchInput', 'apfel'); await page.wait_for_timeout(500)
        check('Suche zusammen mit Filtern', await ev(TITLES) == ['Apfelkuchen'] and await ev("() => document.getElementById('searchInput').value") == 'apfel')
        await page.fill('#searchInput', 'carbo'); await page.wait_for_timeout(500)
        es = await ev("() => document.querySelector('.empty-state') ? document.querySelector('.empty-state').innerText : ''")
        check('Suche + Filter ohne Treffer: «Keine passenden Rezepte», Hinweis zur Suche, Zurücksetzen und Suche löschen', 'Keine passenden Rezepte' in es and 'Suche' in es and 'Filter zurücksetzen' in es and 'Suche löschen' in es, es[:120])
        await page.fill('#searchInput', ''); await page.wait_for_timeout(500)
        await page.click('.sort-select'); 
        await ev("() => { const s = document.getElementById('sortSelect'); s.value = 'az'; s.dispatchEvent(new Event('change')); }"); await page.wait_for_timeout(300)
        check('Sortierung getrennt, nicht im Filterzähler', await ev("() => [state.sortBy, document.querySelector('.filter-btn').textContent.trim()]") == ['az', 'Filter · 2'])
        await ev("() => { const s = document.getElementById('sortSelect'); s.value = 'updated'; s.dispatchEvent(new Event('change')); }"); await page.wait_for_timeout(300)

        # Zurücksetzen auf Startseite: nur zusätzliche Filter
        await page.fill('#searchInput', 'k'); await page.wait_for_timeout(400)
        await scope(page, 'favorites')
        await page.click('.filter-summary-reset'); await page.wait_for_timeout(300)
        rs = await ev("() => [state.query, state.activeCollection === 'favorites', state.sortBy, state.activeFilters.dietary.size + state.activeFilters.time.size, !!document.querySelector('.filter-summary')]")
        check('«Zurücksetzen» entfernt nur zusätzliche Filter (Suche, Favoriten, Sortierung bleiben)', rs == ['k', True, 'updated', 0, False], str(rs))
        await fresh(page)

        # Erhalt beim Öffnen/Zurück
        await ev("() => { state.activeFilters.dietary.add('vegetarisch'); state.activeFilters.time.add('under-30'); render(); }"); await page.wait_for_timeout(300)
        await page.click('.rcard-main'); await page.wait_for_timeout(500)
        vw = await ev("() => state.view")
        await page.click('[data-action="back"]'); await page.wait_for_timeout(600)
        kept = await ev("() => [state.view, document.querySelector('.filter-btn').textContent.trim(), document.querySelectorAll('.rcard').length]")
        check('Auswahl bleibt nach Rezept öffnen und Zurück erhalten', vw == 'detail' and kept == ['home', 'Filter · 2', 4], str(kept))
        # Mit geöffnetem Fenster: Browser-Zurück schliesst nur das Fenster
        await open_sheet(page); await pick(page, 'dietary', 'vegan')
        await page.go_back(); await page.wait_for_timeout(500)
        bk = await ev("() => [state.view, !!document.querySelector('.filter-sheet'), state.activeFilters.dietary.size]")
        check('Browser-Zurück schliesst das Fenster und verwirft den Entwurf', bk == ['home', False, 1], str(bk))

        # Leerzustand nach Übernehmen
        await fresh(page)
        await open_sheet(page); await pick(page, 'dietary', 'vegan'); await pick(page, 'time', 'under-15'); await pick(page, 'more', 'frequent')
        await page.click('.fs-apply'); await page.wait_for_timeout(600)
        es = await ev("() => ({ t: document.querySelector('.empty-state h2').textContent, rc: document.querySelectorAll('.rcard, .rrow').length, btn: Array.from(document.querySelectorAll('.empty-state button')).map(b => b.textContent.trim()) })")
        check('Leerzustand: «Keine passenden Rezepte», keine fremden Rezepte, «Filter zurücksetzen»', es['t'] == 'Keine passenden Rezepte' and es['rc'] == 0 and 'Filter zurücksetzen' in es['btn'], str(es))
        sm = await ev(SMALL); check('Leerzustand: Tippflächen mindestens 44 px', not sm, str(sm))
        await page.click('[data-action="reset-extra-filters"]'); await page.wait_for_timeout(300)
        check('«Filter zurücksetzen» zeigt wieder alles', await ev(COUNT) == 8 and await ev("() => document.querySelectorAll('.rcard').length") == 8)
        # Favoriten ohne Treffer
        await ev("() => { state.recipes.forEach(r => {}); state.favOnly = true; state.activeFilters.time.add('under-15'); state.activeFilters.dietary.add('vegan'); render(); }"); await page.wait_for_timeout(300)
        t = await ev(TITLES); es = await ev("() => document.querySelector('.empty-state') ? document.querySelector('.empty-state h2').textContent : ''")
        check('Favoriten + Filter: Bowl passt (vegan, 10 Min.), kein Leerzustand', t == ['Frühstücksbowl'] and es == '', str(t))
        await fresh(page)

        # Weitere Merkmale und Tags
        await ev("() => { state.activeFilters.more.add('uncooked'); render(); }")
        check('Noch nicht gekocht: 6 Treffer', await ev(COUNT) == 6)
        await ev("() => { state.activeFilters.more.add('frequent'); render(); }")
        check('Weitere Merkmale ODER: 7 Treffer', await ev(COUNT) == 7)
        await ev("() => { resetExtraFilters(); state.activeFilters.tags.add('Schnell'); render(); }")
        check('Tag-Filter', await ev(TITLES) == ['Carbonara', 'Gemüsepfanne'], str(await ev(TITLES)))
        await fresh(page)

        # ---------- C. Scroll-Sperre ohne Sprung, Scrollen im Fenster ----------
        await ev("() => window.scrollTo(0, 260)"); await page.wait_for_timeout(300)
        y0 = await ev("() => window.scrollY")
        await ev("() => document.querySelector('[data-action=\"open-filter-sheet\"]').click()"); await page.wait_for_selector('.filter-sheet'); await page.wait_for_timeout(300)
        sc = await ev("""() => { const b = document.querySelector('.fs-body'); const before = b.scrollTop; b.scrollTop = 200; return { canScroll: b.scrollHeight > b.clientHeight, moved: b.scrollTop > before, overflow: getComputedStyle(b).overflowY, overscroll: getComputedStyle(b).overscrollBehaviorY, foot: document.querySelector('.fs-foot').getBoundingClientRect().bottom, vh: innerHeight, sheetH: document.querySelector('.filter-sheet').getBoundingClientRect().height } }""")
        check('Inhalt scrollt im Fenster, Aktionsleiste bleibt unten sichtbar', sc['canScroll'] and sc['moved'] and sc['overflow'] == 'auto' and sc['overscroll'] == 'contain' and sc['foot'] <= sc['vh'] + 1, str(sc))
        await page.keyboard.press('Escape'); await page.wait_for_timeout(500)
        y1 = await ev("() => window.scrollY")
        check('Scroll-Sperre ohne Sprung (Position vor und nach dem Fenster gleich)', abs(y1 - y0) <= 1 and y0 > 100, f'{y0} -> {y1}')

        # ---------- D. Tastatur, Fokusfalle ----------
        await fresh(page)
        await page.focus('[data-action="open-filter-sheet"]'); await page.keyboard.press('Enter'); await page.wait_for_timeout(400)
        trap = []
        for i in range(60):
            await page.keyboard.press('Tab'); trap.append(await ev("() => !!document.activeElement.closest('.filter-sheet')"))
        check('Fokusfalle: Tab bleibt im Fenster', all(trap), str(trap.count(False)))
        await page.keyboard.press('Space'); await page.wait_for_timeout(100)
        await page.keyboard.press('Escape'); await page.wait_for_timeout(500)
        check('Tastatur: Escape schliesst, Fokus auf «Filter»', await ev("() => document.activeElement.dataset.action") == 'open-filter-sheet')

        # ---------- E. Tippflächen, Überlauf, Themen ----------
        await b.close()
        for (w, h, fs) in [(390, 844, None), (320, 640, None), (375, 667, None), (430, 932, None), (320, 640, 24), (390, 844, 24), (768, 1024, None), (1280, 800, None)]:
            b, ctx = await open_ctx(p, w, h, 'reduce'); page = await ctx.new_page(); ev = page.evaluate
            await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(300); await ev(EXTRA); await page.wait_for_timeout(200)
            if fs: await ev("(f) => { document.documentElement.style.fontSize = f + 'px'; }", fs)
            for theme in ['light', 'dark']:
                tag = f'{w}x{h}{" " + str(fs) + "px" if fs else ""} {theme}: '
                await set_theme(page, theme); await fresh(page)
                ov = await overflow_info(page); sm = await ev(SMALL)
                check(tag + 'Startseite: kein Überlauf, Tippflächen ≥ 44 px', not ov and not sm, str(ov) + str(sm))
                await ev("() => { state.activeFilters.dietary.add('vegetarisch'); state.activeFilters.dietary.add('vegan'); state.activeFilters.time.add('under-30'); state.activeFilters.more.add('uncooked'); state.activeFilters.tags.add('Schnell'); render(); }"); await page.wait_for_timeout(200)
                ov = await overflow_info(page); sm = await ev(SMALL)
                sx = await ev("() => { const t = document.querySelector('.filter-summary-text'); const r = t.getBoundingClientRect(); return [t.textContent.trim(), r.right <= innerWidth, t.scrollWidth <= t.clientWidth + 1] }")
                check(tag + 'mit Auswahl: Zusammenfassung umbricht, kein Überlauf', not ov and not sm and sx[1] and sx[2], str(ov) + str(sm) + str(sx))
                if (w, h, fs, theme) == (390, 844, None, 'light'):
                    hh = await ev(HEAD_RECT); check(tag + 'Kopf mit Zusammenfassung ≤ 40 Prozent der Höhe', hh[2] <= 0.40 * h, str(hh))
                await page.click('[data-action="open-filter-sheet"]'); await page.wait_for_selector('.filter-sheet'); await page.wait_for_timeout(300)
                ov = await overflow_info(page); sm = await ev(SMALL)
                gm = await ev("""() => { const s = document.querySelector('.filter-sheet').getBoundingClientRect(); const bad = []; document.querySelectorAll('.filter-sheet *').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && (r.right > s.right + 0.5 || r.left < s.left - 0.5) && !e.classList.contains('fs-input')) bad.push(e.className + ' ' + Math.round(r.left) + '-' + Math.round(r.right)); });
                  const clipped = Array.from(document.querySelectorAll('.fs-text, .fs-title, .fs-apply, .fs-reset, .fs-status')).filter(e => e.scrollWidth > e.clientWidth + 1 && e.getBoundingClientRect().width > 2).map(e => e.className); const o = document.querySelector('.filter-sheet').getBoundingClientRect(); return { bad: bad.slice(0, 4), clipped, top: Math.round(o.top), bottom: Math.round(o.bottom), vh: innerHeight, body: (() => { const b = document.querySelector('.fs-body'); return b.scrollHeight > b.clientHeight })() } }""")
                check(tag + 'Fenster: kein Überlauf, keine abgeschnittenen Texte, Tippflächen ≥ 44 px, im Bildschirm', not ov and not sm and not gm['bad'] and not gm['clipped'] and gm['top'] >= 0 and gm['bottom'] <= gm['vh'] + 1, str(ov) + str(sm) + str(gm))
                await page.keyboard.press('Escape'); await page.wait_for_timeout(450)
            await b.close()
        # Dark-Kontrast des Auswahlzustands + reduzierte Bewegung (Dauer)
        b, ctx = await open_ctx(p, 390, 844, 'no-preference'); page = await ctx.new_page(); ev = page.evaluate
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(300); await ev(EXTRA)
        await page.click('[data-action="open-filter-sheet"]'); await page.wait_for_timeout(50)
        an = await ev("() => { const s = document.querySelector('.filter-sheet'); const cs = getComputedStyle(s); return [cs.animationName, cs.animationDuration] }")
        check('Bewegung: Fenster fährt von unten ein, höchstens 250 ms', an[0] == 'sheetIn' and float(an[1].replace('s', '')) <= 0.25, str(an))
        await b.close()
        b, ctx = await open_ctx(p, 390, 844, 'reduce'); page = await ctx.new_page(); ev = page.evaluate
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(300); await ev(EXTRA)
        await page.click('[data-action="open-filter-sheet"]'); await page.wait_for_timeout(50)
        an = await ev("() => getComputedStyle(document.querySelector('.filter-sheet')).animationName")
        check('Reduzierte Bewegung: keine Einfahr-Bewegung', an == 'none', an)
        await page.keyboard.press('Escape'); await page.wait_for_timeout(400)
        after = await ev("() => JSON.stringify(state.recipes.map(r => r.id + '|' + r.title + '|' + r.favorite + '|' + r.timeMinutes).sort())")
        check('Rezepte unverändert', after.count('p44_') == before.count('p44_') and len(after) >= len(before) - 1, '')
        await b.close()
    print('Fehler im Test:', FAIL if FAIL else 'keine')
    sys.exit(1 if FAIL else 0)
asyncio.run(main())
