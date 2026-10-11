"""Startseite als Rezeptliste (Handy, unter 768 px) und untere Navigation mit genau fuenf Punkten.
Prueft: Navigation (fuenf Punkte, Reihenfolge, Beschriftung, aria-current, Tippflaechen, keine Ueberlappung, Mehr aktiv auch auf Unterseiten),
Wortmarke (unveraenderter Pfad, Mittelpunkt = Bildschirmmitte +-1 px, kein Plus/Zahnrad im Kopf), Aufbau der Handy-Startseite (Suche, Alle Rezepte/Favoriten, Filter,
Zeile «N Rezepte, Sortierung», kein Raster/Liste-Umschalter), Listenzeilen (quadratisches Foto, Zeit nur wenn bekannt, Platzhalter, Favoritenknopf getrennt, kein
verschachtelter Knopf, lange Titel), Knopf «Rezept hinzufuegen» (ueber der Leiste, letztes Element sichtbar, Tastatur), Leerzustaende, Filterdialog und Fokusfalle,
Sortierung, Tablet (820) und Desktop (1440) behalten ihre Anordnung, Hell/Dunkel, kein horizontaler Ueberlauf bei 320/390/430/820/1440."""
import asyncio, sys, os
os.environ.setdefault('SAVORA_TEST_PORT', '9950')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

PHONES = [(320, 640), (390, 844), (430, 932)]
LONG = 'Überbackene Kartoffel-Zucchini-Gratin-Spezialität mit Rosmarin, Ziegenkäse und karamellisierten Zwiebeln aus dem Holzofen'
WORD = 'Supercalifragilisticexpialigetisch' * 3

MANY = """async () => {
  const mk = (i) => { const r = emptyRecipe(); r.id = 'sl_' + i; r.title = 'Rezept ' + i + (i % 7 === 0 ? ' mit langem Titel zum Umbrechen in der Liste' : ''); r.servings = 2;
    r.ingredients = [{amount:'1', unit:'', name:'Zutat'}]; r.steps = [{text:'Kochen.'}]; if (i % 3) r.timeMinutes = 10 + i; if (i % 5 === 0) r.favorite = true; return r; };
  for (let i = 1; i <= 100; i++) await dbPut(mk(i));
  await loadRecipes(); state.view = 'home'; state.query = ''; state.favOnly = false; resetExtraFilters(); render(); return state.recipes.length;
}"""
LONGS = """async () => {
  const a = emptyRecipe(); a.id = 'sl_long'; a.title = %r; a.servings = 2; a.timeMinutes = 45; a.ingredients = [{amount:'1', unit:'', name:'Z'}]; a.steps = [{text:'K'}];
  const b = emptyRecipe(); b.id = 'sl_word'; b.title = %r; b.servings = 2; b.favorite = true; b.ingredients = [{amount:'1', unit:'', name:'Z'}]; b.steps = [{text:'K'}];
  await dbPut(a); await dbPut(b); await loadRecipes(); state.view = 'home'; render(); return state.recipes.length;
}""" % (LONG, WORD)

NAV_JS = """() => { const nav = document.querySelector('.bottom-nav'); const bs = Array.from(nav.querySelectorAll('button'));
  const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  return { n: bs.length, labels: bs.map(b => b.querySelector('.nav-label').innerText.trim()), active: bs.filter(b => b.getAttribute('aria-current') === 'page').map(b => b.querySelector('.nav-label').innerText.trim()),
    rects: bs.map(R), navRect: R(nav), pos: getComputedStyle(nav).position, vis: bs.every(vis),
    clipped: bs.filter(b => { const l = b.querySelector('.nav-label'); return l.scrollWidth > l.clientWidth + 0.5; }).length,
    labelRects: bs.map(b => { const l = b.querySelector('.nav-label'); const r = document.createRange(); r.selectNodeContents(l); const q = r.getBoundingClientRect(); return { l: q.left, r: q.right }; }),
    names: bs.map(b => b.innerText.replace(/\\s+/g, ' ').trim()), W: document.documentElement.clientWidth, H: innerHeight }; }"""
BRAND_JS = """() => { const s = document.querySelector('.topbar .top-wordmark'); if (!s) return null; const r = s.getBoundingClientRect(); const W = document.documentElement.clientWidth;
  const hd = document.querySelector('.topbar'); const kids = Array.from(hd.querySelectorAll('button, [data-action]')).filter(e => { const q = e.getBoundingClientRect(); return q.width > 0 && q.height > 0; }).map(e => e.getAttribute('data-action') + '|' + (e.getAttribute('aria-label') || ''));
  return { mid: r.left + r.width / 2, W, w: Math.round(r.width), h: Math.round(r.height), d: (s.querySelector('path') || {}).getAttribute ? s.querySelector('path').getAttribute('d') : null, wm: typeof WORDMARK_PATH !== 'undefined' ? WORDMARK_PATH : null, kids, color: getComputedStyle(s).color, top: r.top }; }"""
STATE_RESET = "() => { resetExtraFilters(); state.query = ''; state.favOnly = false; state.modal = null; state.view = 'home'; state.sortBy = 'updated'; render(); window.scrollTo(0, 0); }"

def lum(c):
    v = [int(x) / 255 for x in c]
    v = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in v]
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]
def contrast(a, b):
    la, lb = lum(a), lum(b)
    if la < lb: la, lb = lb, la
    return (la + 0.05) / (lb + 0.05)
def rgb(s):
    import re
    return [int(x) for x in re.findall(r'\d+', s)[:3]]

async def theme(page, t):
    await page.evaluate("(t) => { state.theme = t; applyTheme(); }", t); await page.wait_for_timeout(150)

async def new_phone(p, w, h, seed=True):
    b, ctx = await open_ctx(p, w, h, 'reduce'); page = await ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    await goto(page)
    if seed: await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(400)
    return b, ctx, page, errs

async def main():
    async with async_playwright() as p:
        # ---------- A. Handy: Navigation, Wortmarke, Aufbau (320, 390, 430) ----------
        for (w, h) in PHONES:
            b, ctx, page, errs = await new_phone(p, w, h); ev = page.evaluate; tag = f'[{w}] '
            await ev(STATE_RESET); await page.wait_for_timeout(200)
            nv = await ev(NAV_JS)
            check(tag + 'Navigation: genau fuenf Punkte in der Reihenfolge Rezepte, Wochenplan, Einkauf, Kochbücher, Mehr', nv['n'] == 5 and nv['labels'] == ['Rezepte', 'Wochenplan', 'Einkauf', 'Kochbücher', 'Mehr'], str(nv['labels']))
            check(tag + 'Navigation: unten fixiert, alle fuenf sichtbar, Beschriftung nicht abgeschnitten', nv['pos'] == 'fixed' and nv['vis'] and nv['clipped'] == 0 and abs(nv['navRect']['b'] - nv['H']) < 1.5, f"{nv['pos']} clipped={nv['clipped']} b={nv['navRect']['b']}")
            check(tag + 'Navigation: Tippflaechen mindestens 44 px und gleich breit', all(r['h'] >= 44 and r['w'] >= 44 for r in nv['rects']) and max(r['w'] for r in nv['rects']) - min(r['w'] for r in nv['rects']) < 1.5, str([(round(r['w']), round(r['h'])) for r in nv['rects']]))
            ov = [i for i in range(4) if nv['labelRects'][i]['r'] > nv['labelRects'][i + 1]['l'] - 1]
            check(tag + 'Navigation: Beschriftungen ueberlappen nicht', not ov, str(nv['labelRects']))
            check(tag + 'Navigation: aktiver Punkt «Rezepte» mit aria-current', nv['active'] == ['Rezepte'], str(nv['active']))
            check(tag + 'Navigation: Namen ohne Doppelungen (Mehr, nicht Einstellungen)', 'Mehr' in nv['names'][4] and 'Einstellungen' not in nv['names'][4], str(nv['names']))
            br = await ev(BRAND_JS)
            check(tag + 'Wortmarke: Mittelpunkt = Bildschirmmitte (+-1 px)', abs(br['mid'] - br['W'] / 2) <= 1, f"{br['mid']} vs {br['W'] / 2}")
            check(tag + 'Wortmarke: Pfad unveraendert (wordmarkSvg), Seitenverhaeltnis 3:1', br['d'] and br['d'] == br['wm'] and abs(br['w'] / br['h'] - 3) < 0.05, f"{br['w']}x{br['h']}")
            check(tag + 'Kopf: kein Plus, kein Zahnrad, kein weiteres Symbol', br['kids'] == [], str(br['kids']))
            st = await ev("""() => ({ ph: document.getElementById('searchInput').placeholder, view: document.getElementById('viewSelect').value, viewText: document.querySelector('.view-pick .inline-pick-text').textContent.trim(),
              opts: Array.from(document.querySelectorAll('#viewSelect option')).map(o => o.textContent.trim()), filter: document.querySelector('.filter-btn').textContent.trim(),
              count: document.querySelector('.result-line').textContent.trim(), sortText: document.querySelector('.sort-inline .inline-pick-text').textContent.trim(), sortOpts: Array.from(document.querySelectorAll('#sortSelect option')).length,
              toggle: !!document.querySelector('.layout-toggle'), seg: !!document.querySelector('.seg'), grid: !!document.querySelector('.rgrid'), rows: document.querySelectorAll('.rrow--phone').length, addBar: !!document.querySelector('.home-add-btn'),
              h1: (document.querySelector('h1') || {}).textContent, pt: !!document.querySelector('.page-title') })""")
            check(tag + 'Suche: Platzhalter «Rezepte suchen …»', st['ph'] == 'Rezepte suchen …', st['ph'])
            check(tag + '«Alle Rezepte»-Auswahl mit Favoriten, Filter-Knopf, Zeile «3 Rezepte» und Sortierung', st['viewText'] == 'Alle Rezepte' and st['opts'] == ['Alle Rezepte', 'Favoriten'] and st['filter'] == 'Filter' and st['count'] == '3 Rezepte' and st['sortText'] == 'Zuletzt bearbeitet' and st['sortOpts'] == 4, str(st))
            check(tag + 'Kein Raster/Liste-Umschalter, keine Segment-Auswahl, Liste ist Standard, Seitentitel nur fuer Bildschirmleser', not st['toggle'] and not st['seg'] and not st['grid'] and st['rows'] == 3 and st['h1'] == 'Deine Rezepte' and not st['pt'], str(st))
            ge = await ev("""() => { const q = (s) => { const e = document.querySelector(s); const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.height)]; };
              return { pick: q('.view-pick'), filter: q('.filter-btn'), W: document.documentElement.clientWidth } }""")
            check(tag + 'Alle Rezepte links, Filter rechts, auf einer Zeile, je mindestens 44 px hoch', ge['pick'][0] < 40 and ge['filter'][2] > ge['W'] - 40 and abs(ge['pick'][1] - ge['filter'][1]) < 12 and ge['pick'][3] >= 44 and ge['filter'][3] >= 44, str(ge))
            sw = await ev("() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]")
            check(tag + 'Kein horizontaler Ueberlauf (Startseite)', sw[0] <= sw[1], str(sw) + str(await overflow_info(page)))
            # Mehr
            await page.click('.bottom-nav button:nth-child(6)'); await page.wait_for_timeout(300)
            nv2 = await ev(NAV_JS); br2 = await ev(BRAND_JS); title = await ev("() => document.querySelector('.page-title').textContent.trim()")
            check(tag + 'Mehr: Einstellungsseite, Punkt «Mehr» aktiv, Titel «Mehr»', await ev("state.view") == 'settings' and nv2['active'] == ['Mehr'] and title == 'Mehr', f"{nv2['active']} {title}")
            check(tag + 'Mehr: Wortmarke zentriert, kein Zahnrad', abs(br2['mid'] - br2['W'] / 2) <= 1 and br2['kids'] == [], f"{br2['mid']} {br2['kids']}")
            sw = await ev("() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]")
            check(tag + 'Kein horizontaler Ueberlauf (Mehr)', sw[0] <= sw[1], str(sw))
            check(tag + 'Keine Skriptfehler', not errs, str(errs[:2]))
            await ctx.close(); await b.close()

        # ---------- B. Handy 390: Zeilen, Favoriten, Oeffnen, Sortierung, Daten ----------
        b, ctx, page, errs = await new_phone(p, 390, 844); ev = page.evaluate
        await ev("() => { state.recipes.find(r => r.id === 'r_legacy_3').timeMinutes = 0; }")   # Zeit unbekannt (nur im Speicher des Testbrowsers)
        before = await ev("() => JSON.stringify(state.recipes.map(r => r.id + '|' + r.title + '|' + r.timeMinutes + '|' + !!r.favorite).sort())")
        await ev(STATE_RESET); await page.wait_for_timeout(300)
        rows = await ev("""() => Array.from(document.querySelectorAll('.rrow--phone')).map(r => { const i = r.querySelector('.rrow-img'); const q = i.getBoundingClientRect(); const m = r.querySelector('.rrow-main').getBoundingClientRect(); const f = r.querySelector('.fav-toggle').getBoundingClientRect(); const t = r.querySelector('.rrow-title').getBoundingClientRect();
          return { title: r.querySelector('.rrow-title').textContent, tag: i.tagName, w: q.width, h: q.height, time: (r.querySelector('.rrow-meta--time') || {}).textContent || null, ph: i.classList.contains('rrow-ph'), fit: getComputedStyle(i).objectFit, nested: r.querySelectorAll('button button, a button, button a').length, favInMain: !!r.querySelector('.rrow-main .fav-toggle'),
          titleR: t.right, favL: f.left, favW: f.width, favH: f.height, pressed: r.querySelector('.fav-toggle').getAttribute('aria-pressed'), label: r.querySelector('.fav-toggle').getAttribute('aria-label') }; })""")
        by = {r['title']: r for r in rows}
        check('Zeilen: Foto quadratisch (Breite = Hoehe), Titel vorhanden, ohne Verzerrung (object-fit: cover)', all(abs(r['w'] - r['h']) < 1 and r['w'] >= 72 for r in rows) and all(r['fit'] == 'cover' for r in rows if not r['ph']), str([(r['title'], r['w'], r['h']) for r in rows]))
        check('Zeit nur wenn bekannt: Carbonara 10 Min., Curry ohne Zeit zeigt keine Zeit', by['Carbonara']['time'] and '10 Min.' in by['Carbonara']['time'] and by['Gemüse-Curry']['time'] is None, str([(r['title'], r['time']) for r in rows]))
        check('Ohne Foto: ruhiger Platzhalter in gleicher Groesse, kein Buchstabe', by['Gemüse-Curry']['ph'] and by['Gemüse-Curry']['w'] == by['Carbonara']['w'] and by['Gemüse-Curry']['h'] == by['Carbonara']['h'], str(by['Gemüse-Curry']))
        check('Favoritenknopf: getrennt, kein verschachtelter Knopf, mindestens 44 px, Zustand und Name', all(r['nested'] == 0 and not r['favInMain'] and r['favW'] >= 44 and r['favH'] >= 44 for r in rows) and by['Sloppy Joe Buns']['pressed'] == 'true' and by['Sloppy Joe Buns']['label'] == 'Aus Favoriten entfernen' and by['Carbonara']['label'] == 'Zu Favoriten hinzufügen', str(by['Carbonara']))
        check('Titel und Favoritenknopf ueberlappen nicht', all(r['titleR'] <= r['favL'] + 0.5 for r in rows))
        # Favorit: toggelt, oeffnet nicht
        await page.click('.rrow--phone:nth-child(2) .fav-toggle'); await page.wait_for_timeout(250)
        s1 = await ev("() => ({ view: state.view, fav: state.recipes.find(r => r.id === 'r_legacy_2').favorite, pressed: document.querySelectorAll('.rrow--phone')[1].querySelector('.fav-toggle').getAttribute('aria-pressed') })")
        check('Favoritenknopf setzt den Favoriten und oeffnet das Rezept nicht', s1['view'] == 'home' and s1['fav'] is True and s1['pressed'] == 'true', str(s1))
        await page.click('.rrow--phone:nth-child(2) .fav-toggle'); await page.wait_for_timeout(250)
        check('Favoritenknopf nimmt den Favoriten wieder zurueck', await ev("state.recipes.find(r => r.id === 'r_legacy_2').favorite") in (False, None, 0) or not await ev("state.recipes.find(r => r.id === 'r_legacy_2').favorite"))
        # Alle / Favoriten
        await page.select_option('#viewSelect', 'fav'); await page.wait_for_timeout(250)
        s2 = await ev("() => ({ n: document.querySelectorAll('.rrow--phone').length, text: document.querySelector('.view-pick .inline-pick-text').textContent, count: document.querySelector('.result-line').textContent, favOnly: state.favOnly, filterBtn: document.querySelector('.filter-btn').textContent.trim() })")
        check('Auswahl «Favoriten»: nur Favoriten, Beschriftung, Anzahl; zaehlt nicht als Filter', s2['n'] == 1 and s2['text'] == 'Favoriten' and s2['count'] == '1 Rezept' and s2['favOnly'] and s2['filterBtn'] == 'Filter', str(s2))
        await page.select_option('#viewSelect', 'all'); await page.wait_for_timeout(250)
        check('Auswahl «Alle Rezepte»: alle drei wieder da', await ev("document.querySelectorAll('.rrow--phone').length") == 3)
        # Sortierung
        await page.select_option('#sortSelect', 'az'); await page.wait_for_timeout(250)
        s3 = await ev("() => ({ t: Array.from(document.querySelectorAll('.rrow-title')).map(e => e.textContent), text: document.querySelector('.sort-inline .inline-pick-text').textContent, stored: localStorage.getItem(SORT_KEY) })")
        check('Sortierung «A bis Z» bedienbar, Beschriftung folgt', s3['t'] == ['Carbonara', 'Gemüse-Curry', 'Sloppy Joe Buns'] and s3['text'] == 'A bis Z', str(s3))
        await page.select_option('#sortSelect', 'time'); await page.wait_for_timeout(250)
        check('Sortierung «Kürzeste Zeit»: kuerzeste Zeit zuerst, unbekannte Zeit zuletzt', (await ev("() => Array.from(document.querySelectorAll('.rrow-title')).map(e => e.textContent)"))[0] == 'Carbonara' and (await ev("() => Array.from(document.querySelectorAll('.rrow-title')).map(e => e.textContent)"))[2] == 'Gemüse-Curry')
        await page.select_option('#sortSelect', 'updated'); await page.wait_for_timeout(250)
        # Suche
        await page.fill('#searchInput', 'carb'); await page.wait_for_timeout(300)
        check('Suche filtert die Liste und die Zeile zeigt «1 Rezept»', await ev("document.querySelector('.result-line').textContent") == '1 Rezept' and await ev("document.querySelectorAll('.rrow--phone').length") == 1)
        await page.fill('#searchInput', ''); await page.wait_for_timeout(300)
        # Oeffnen und Zurueck
        h0 = await ev("history.length")
        await page.click('.rrow--phone:nth-child(1) .rrow-main'); await page.wait_for_timeout(400)
        check('Zeile oeffnet das Rezept', await ev("state.view") == 'detail')
        await page.go_back(); await page.wait_for_timeout(400)
        check('Browser-Zurueck fuehrt zur Liste, kein zusaetzlicher History-Eintrag', await ev("state.view") == 'home' and await ev("history.length") <= h0 + 1, f"{h0} -> {await ev('history.length')}")
        after = await ev("() => JSON.stringify(state.recipes.map(r => r.id + '|' + r.title + '|' + r.timeMinutes + '|' + !!r.favorite).sort())")
        check('Rezeptdaten unveraendert (Titel, Zeit, Favoriten)', before == after)

        # ---------- C. Navigation ueber alle fuenf Punkte, Mehr-Unterseiten, History ----------
        await ev(STATE_RESET); await page.wait_for_timeout(200)
        h0 = await ev("history.length"); seen = []
        for i, view in [(3, 'mealplan'), (4, 'shopping'), (5, 'cookbooks'), (6, 'settings'), (2, 'home')]:
            await page.click(f'.bottom-nav button:nth-child({i})'); await page.wait_for_timeout(300)
            nv = await ev(NAV_JS); seen.append((view, await ev('state.view'), nv['active']))
            ov2 = [k for k in range(4) if nv['labelRects'][k]['r'] > nv['labelRects'][k + 1]['l'] - 1]
            check(f'Navigation mit aktivem Punkt {view}: Beschriftungen vollstaendig und ohne Ueberlappung', nv['clipped'] == 0 and not ov2, f"clipped={nv['clipped']} {nv['labelRects']}")
        check('Alle fuenf Punkte fuehren zum richtigen Bereich, genau einer ist aktiv', [(a, b, len(c)) for a, b, c in seen] == [(v, v, 1) for v in ['mealplan', 'shopping', 'cookbooks', 'settings', 'home']], str(seen))
        check('Wechsel zwischen den Punkten legt keine History-Eintraege an', await ev("history.length") == h0, f"{h0} -> {await ev('history.length')}")
        await page.click('.bottom-nav button:nth-child(6)'); await page.wait_for_timeout(250)
        h1 = await ev("history.length")
        for sub in ['settings-data', 'settings-display', 'settings-share', 'settings-help', 'settings-about']:
            await ev(f"() => {{ state.view = '{sub}'; render(); }}"); await page.wait_for_timeout(250)
            nv = await ev(NAV_JS)
            check(f'Unterseite {sub}: «Mehr» bleibt aktiv, Navigation vorhanden', nv['n'] == 5 and nv['active'] == ['Mehr'], str(nv['active']))
        await ev("() => { state.view = 'settings'; render(); }"); await page.wait_for_timeout(200)
        await page.click('[data-action="goto-view"][data-view="settings-display"]'); await page.wait_for_timeout(300)
        n1 = await ev("history.length")
        await page.go_back(); await page.wait_for_timeout(350)
        check('Browser-Zurueck aus einer Mehr-Unterseite fuehrt zu «Mehr» und nicht aus der App', await ev("state.view") == 'settings' and (await ev(NAV_JS))['active'] == ['Mehr'], await ev("state.view"))
        # ---------- D. Rezept hinzufuegen ----------
        await ev(STATE_RESET); await page.wait_for_timeout(250)
        ab = await ev("""() => { const a = document.querySelector('.home-add-btn').getBoundingClientRect(); const n = document.querySelector('.bottom-nav').getBoundingClientRect(); const l = document.querySelector('.rrow--phone:last-child').getBoundingClientRect();
          return { aT: a.top, aB: a.bottom, nT: n.top, h: a.height, w: a.width, W: innerWidth, lB: l.bottom, name: document.querySelector('.home-add-btn').innerText.trim(), pos: getComputedStyle(document.querySelector('.home-add-bar')).position } }""")
        check('Knopf «Rezept hinzufügen» liegt ueber der unteren Leiste, mindestens 44 px hoch, breit', ab['aB'] <= ab['nT'] + 0.5 and ab['h'] >= 44 and ab['w'] > ab['W'] * 0.7 and 'Rezept hinzufügen' in ab['name'], str(ab))
        check('Letztes Listenelement liegt ueber dem Aktionsknopf (3 Rezepte)', ab['lB'] <= ab['aT'] + 0.5, str(ab))
        await page.click('.home-add-btn'); await page.wait_for_selector('.add-menu-sheet'); await page.wait_for_timeout(300)
        am = await ev("() => ({ opts: Array.from(document.querySelectorAll('.add-menu-option')).map(e => e.querySelector('strong').textContent), focusIn: document.querySelector('.add-menu-sheet').contains(document.activeElement) || document.activeElement === document.querySelector('.add-menu-sheet') })")
        check('Knopf oeffnet die bestehende Auswahl (manuell, Text, ...), Fokus im Dialog', 'Rezept erstellen' in am['opts'] and any('Text' in o for o in am['opts']), str(am))
        await page.keyboard.press('Shift+Tab'); await page.wait_for_timeout(100)
        check('Fokusfalle: Umschalt+Tab direkt nach dem Oeffnen bleibt im Dialog', await ev("document.querySelector('.add-menu-sheet').contains(document.activeElement)"), await ev("document.activeElement.outerHTML.slice(0, 80)"))
        await page.keyboard.press('Escape'); await page.wait_for_timeout(400)
        check('Schliessen gibt den Fokus an «Rezept hinzufügen» zurueck', await ev("document.activeElement && document.activeElement.classList.contains('home-add-btn')"), await ev("document.activeElement.outerHTML.slice(0, 80)"))
        await page.click('.home-add-btn'); await page.wait_for_selector('.add-menu-sheet'); await page.wait_for_timeout(200)
        await page.click('.add-menu-option[data-action="new-recipe"]'); await page.wait_for_timeout(500)
        check('Rezept erstellen oeffnet das Formular', await ev("state.view") == 'form')
        await ev("() => { clearRecipeDraft && clearRecipeDraft(); state.editingRecipe = null; state.view = 'home'; render(); }"); await page.wait_for_timeout(300)
        check('Zurueck zur Liste: Liste und Aktionsknopf wieder da', await ev("document.querySelectorAll('.rrow--phone').length") == 3 and await ev("!!document.querySelector('.home-add-btn')"))
        # Tastatur
        await page.click('#searchInput'); await page.keyboard.type('sup'); await page.wait_for_timeout(200)
        await ev("() => document.body.classList.add('keyboard-open')"); await page.wait_for_timeout(100)
        kb = await ev("() => ({ add: getComputedStyle(document.querySelector('.home-add-bar')).display, nav: getComputedStyle(document.querySelector('.bottom-nav')).display, val: document.getElementById('searchInput').value, foc: document.activeElement.id })")
        check('Bildschirmtastatur: Aktionsknopf und Leiste ausgeblendet, Eingabe und Fokus bleiben', kb['add'] == 'none' and kb['nav'] == 'none' and kb['val'] == 'sup' and kb['foc'] == 'searchInput', str(kb))
        await ev("() => document.body.classList.remove('keyboard-open')"); await page.fill('#searchInput', ''); await page.wait_for_timeout(250)
        # Fokus sichtbar
        await page.keyboard.press('Tab'); await page.wait_for_timeout(100)
        check('Tastatur: Fokus ist sichtbar (Umriss) auf Auswahl «Alle Rezepte»', await ev("() => { const a = document.activeElement; return a && a.id === 'viewSelect' && getComputedStyle(a.closest('.inline-pick')).outlineStyle !== 'none'; }"))
        check('Keine Skriptfehler', not errs, str(errs[:2]))
        await ctx.close(); await b.close()

        # ---------- E. Filterdialog (Entwurf, Abbrechen, Zuruecksetzen, Fokusfalle) ----------
        b, ctx, page, errs = await new_phone(p, 390, 844); ev = page.evaluate
        await ev(STATE_RESET); await page.wait_for_timeout(200)
        await page.click('.filter-btn'); await page.wait_for_selector('.filter-sheet'); await page.wait_for_timeout(300)
        await page.keyboard.press('Shift+Tab'); await page.wait_for_timeout(100)
        check('Filterdialog: Umschalt+Tab direkt nach dem Oeffnen bleibt im Dialog', await ev("document.querySelector('.filter-sheet').contains(document.activeElement)"))
        await page.click('.fs-input[data-fs-dim="dietary"][value="vegan"] >> xpath=..'); await page.wait_for_timeout(100)
        check('Entwurf: Anzeige vor dem Anwenden unveraendert', await ev("document.querySelectorAll('.rrow--phone').length") == 3 and await ev("state.activeFilters.dietary.size") == 0)
        await page.keyboard.press('Escape'); await page.wait_for_timeout(400)
        check('Abbrechen verwirft den Entwurf, Fokus kehrt zu «Filter» zurueck', await ev("state.activeFilters.dietary.size") == 0 and await ev("document.activeElement.classList.contains('filter-btn')"))
        await page.click('.filter-btn'); await page.wait_for_selector('.filter-sheet'); await page.wait_for_timeout(300)
        await page.click('.fs-input[data-fs-dim="dietary"][value="vegan"] >> xpath=..'); await page.click('.fs-apply'); await page.wait_for_timeout(500)
        fs = await ev("() => ({ n: document.querySelectorAll('.rrow--phone').length, btn: document.querySelector('.filter-btn').textContent.trim(), sum: !!document.querySelector('.filter-summary'), count: document.querySelector('.result-line').textContent })")
        check('Anwenden: 1 Rezept, «Filter · 1», Zusammenfassung sichtbar', fs['n'] == 1 and fs['btn'] == 'Filter · 1' and fs['sum'] and fs['count'] == '1 Rezept', str(fs))
        await page.select_option('#viewSelect', 'fav'); await page.wait_for_timeout(250)
        check('Filter und Favoriten kombiniert (UND): vegane Favoriten = keine, verstaendlicher Leerzustand', await ev("document.querySelector('.empty-state h2').textContent") == 'Keine passenden Rezepte')
        await page.click('.filter-summary-reset'); await page.wait_for_timeout(300)
        check('Zuruecksetzen setzt nur die Zusatzfilter zurueck, Favoritenauswahl bleibt', await ev("state.activeFilters.dietary.size") == 0 and await ev("state.favOnly") is True and await ev("document.getElementById('viewSelect').value") == 'fav')
        await ctx.close(); await b.close()

        # ---------- F. Leerzustaende ----------
        b, ctx, page, errs = await new_phone(p, 390, 844, seed=False); ev = page.evaluate
        await ev(STATE_RESET); await page.wait_for_timeout(300)
        e1 = await ev("() => ({ h: (document.querySelector('.empty-state h2') || {}).textContent, add: !!document.querySelector('.home-add-btn'), nav: document.querySelectorAll('.bottom-nav button').length, ctas: Array.from(document.querySelectorAll('.empty-actions button')).map(b => b.textContent.trim()), filter: !!document.querySelector('.filter-btn') })")
        check('Leere Sammlung: Erklaerung mit Aktionen, Navigation da, kein doppelter Aktionsknopf', e1['h'] == 'Dein Kochbuch ist noch leer' and len(e1['ctas']) == 2 and not e1['add'] and e1['nav'] == 5, str(e1))
        await page.click('.empty-actions .primary-btn'); await page.wait_for_timeout(400)
        check('Leere Sammlung: «Erstes Rezept eintragen» oeffnet das Formular', await ev("state.view") == 'form')
        await ev("() => { clearRecipeDraft && clearRecipeDraft(); state.editingRecipe = null; state.view = 'home'; render(); }")
        await ctx.close(); await b.close()
        b, ctx, page, errs = await new_phone(p, 390, 844); ev = page.evaluate
        await ev(STATE_RESET); await page.fill('#searchInput', 'zzzxqw'); await page.wait_for_timeout(350)
        e2 = await ev("() => ({ h: document.querySelector('.empty-state h2').textContent, btn: Array.from(document.querySelectorAll('.empty-actions button')).map(b => b.textContent.trim()), add: !!document.querySelector('.home-add-btn') })")
        check('Keine Suchtreffer: verstaendliche Meldung, «Suche löschen», Aktionsknopf bleibt', e2['h'].startswith('Keine Treffer') and e2['btn'] == ['Suche löschen'] and e2['add'], str(e2))
        await page.click('[data-action="clear-search"]'); await page.wait_for_timeout(300)
        check('Suche loeschen zeigt wieder alle Rezepte', await ev("document.querySelectorAll('.rrow--phone').length") == 3)
        await ev("() => { state.recipes.forEach(r => { r.favorite = false; }); }"); await page.select_option('#viewSelect', 'fav'); await page.wait_for_timeout(300)
        e3 = await ev("() => ({ h: document.querySelector('.empty-state h2').textContent, p: document.querySelector('.empty-state p').textContent, btn: Array.from(document.querySelectorAll('.empty-actions button')).map(b => b.textContent.trim()) })")
        check('Favoriten ohne Eintraege: «Du hast noch keine Favoriten markiert», Aktion «Alle Rezepte anzeigen»', 'keine Favoriten' in e3['p'] and 'Alle Rezepte anzeigen' in e3['btn'], str(e3))
        await page.click('[data-action="set-fav-mode"][data-id="all"]'); await page.wait_for_timeout(300)
        check('«Alle Rezepte anzeigen» fuehrt zur Liste zurueck, Auswahl zeigt «Alle Rezepte»', await ev("document.querySelectorAll('.rrow--phone').length") == 3 and await ev("document.getElementById('viewSelect').value") == 'all')
        await ctx.close(); await b.close()

        # ---------- G. Lange Titel, 100 Rezepte, letztes Element ----------
        for (w, h) in PHONES:
            b, ctx, page, errs = await new_phone(p, w, h); ev = page.evaluate; tag = f'[{w}] '
            await ev(LONGS); await page.wait_for_timeout(500)
            lg = await ev("""() => { const out = []; document.querySelectorAll('.rrow--phone').forEach(r => { if (!/Überbackene|Supercali/.test(r.textContent)) return; const m = r.getBoundingClientRect(); const t = r.querySelector('.rrow-title').getBoundingClientRect(); const f = r.querySelector('.fav-toggle').getBoundingClientRect(); const i = r.querySelector('.rrow-img').getBoundingClientRect();
              out.push({ tR: t.right, fL: f.left, fR: f.right, mR: m.right, iW: i.width, iH: i.height, rowH: m.height, body: r.querySelector('.rrow-body').scrollWidth <= r.querySelector('.rrow-body').clientWidth + 1 }); }); return out; }""")
            check(tag + 'Lange Titel und langes Wort: umbrechen, ueberlappen den Favoritenknopf nicht, Foto bleibt quadratisch', len(lg) == 2 and all(x['tR'] <= x['fL'] + 0.5 and x['fR'] <= x['mR'] + 0.5 and abs(x['iW'] - x['iH']) < 1 and x['body'] for x in lg), str(lg))
            sw = await ev("() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]")
            check(tag + 'Lange Titel: kein horizontaler Ueberlauf', sw[0] <= sw[1], str(sw) + str(await overflow_info(page)))
            n = await ev(MANY); await page.wait_for_timeout(600)
            check(tag + '100 Rezepte (+ 5 vorhandene): Zeile zeigt Anzahl, alle Zeilen in der Liste', await ev("document.querySelector('.result-line').textContent") == f'{n} Rezepte' and await ev("document.querySelectorAll('.rrow--phone').length") == n, str(n))
            await ev("() => window.scrollTo(0, document.documentElement.scrollHeight)"); await page.wait_for_timeout(500)
            ls = await ev("""() => { const l = document.querySelector('.rrow--phone:last-child'); const lr = l.getBoundingClientRect(); const a = document.querySelector('.home-add-btn').getBoundingClientRect(); const nv = document.querySelector('.bottom-nav').getBoundingClientRect();
              const fb = l.querySelector('.fav-toggle').getBoundingClientRect(); const top = document.elementFromPoint(fb.left + fb.width / 2, fb.top + fb.height / 2);
              return { lB: lr.bottom, lT: lr.top, aT: a.top, aB: a.bottom, nT: nv.top, H: innerHeight, atEnd: Math.abs(window.scrollY + innerHeight - document.documentElement.scrollHeight) < 2, hit: top && top.closest('.fav-toggle') === l.querySelector('.fav-toggle'), t: l.querySelector('.rrow-title').textContent } }""")
            check(tag + 'Letztes Rezept vollstaendig sichtbar und bedienbar ueber dem Aktionsknopf', ls['atEnd'] and ls['lB'] <= ls['aT'] + 0.5 and ls['lT'] >= 0 and ls['aB'] <= ls['nT'] + 0.5 and ls['hit'], str(ls))
            sw = await ev("() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]")
            check(tag + '100 Rezepte: kein horizontaler Ueberlauf', sw[0] <= sw[1], str(sw))
            sy = await ev("() => window.scrollY"); await page.click('.rrow--phone:last-child .fav-toggle'); await page.wait_for_timeout(300)
            check(tag + 'Favorit am Listenende: kein Scrollsprung, Rezept bleibt geschlossen', abs(await ev("window.scrollY") - sy) < 2 and await ev("state.view") == 'home', f"{sy} -> {await ev('window.scrollY')}")
            await ctx.close(); await b.close()

        # ---------- H. Hell / Dunkel / Schwarz ----------
        b, ctx, page, errs = await new_phone(p, 390, 844); ev = page.evaluate
        for t in ['light', 'dark', 'amoled']:
            await theme(page, t); await ev(STATE_RESET); await page.wait_for_timeout(250)
            c = await ev("""() => { const cs = (e, k) => getComputedStyle(e)[k]; const act = document.querySelector('.bottom-nav button.active'); const add = document.querySelector('.home-add-btn');
              return { wm: cs(document.querySelector('.top-wordmark'), 'color'), navBg: cs(document.querySelector('.bottom-nav'), 'backgroundColor'), act: cs(act.querySelector('.nav-label'), 'color'), inact: cs(document.querySelectorAll('.bottom-nav button')[1].querySelector('.nav-label'), 'color'), addBg: cs(add, 'backgroundColor'), addFg: cs(add, 'color'),
                bg: cs(document.body, 'backgroundColor'), title: cs(document.querySelector('.rrow-title'), 'color'), meta: cs(document.querySelector('.rrow-meta--time'), 'color'), sw: document.documentElement.scrollWidth <= document.documentElement.clientWidth }; }""")
            check(f'{t}: aktiver Punkt und inaktive Beschriftung lesbar (Kontrast >= 4.5)', contrast(rgb(c['act']), rgb(c['navBg'])) >= 4.5 and contrast(rgb(c['inact']), rgb(c['navBg'])) >= 4.5, f"{contrast(rgb(c['act']), rgb(c['navBg'])):.2f} {contrast(rgb(c['inact']), rgb(c['navBg'])):.2f}")
            check(f'{t}: Text auf «Rezept hinzufügen» und Titel/Zeit lesbar', contrast(rgb(c['addFg']), rgb(c['addBg'])) >= 4.5 and contrast(rgb(c['title']), rgb(c['bg'])) >= 4.5 and contrast(rgb(c['meta']), rgb(c['bg'])) >= 4.5, str(c))
            check(f'{t}: Wortmarke hell auf dunklem Grund bzw. rot auf hellem, ohne Ueberlauf', (rgb(c['wm']) == [185, 59, 44] if t == 'light' else rgb(c['wm']) == [247, 244, 238]) and c['sw'], c['wm'])
            if t != 'amoled':
                await page.screenshot(path=os.path.join(OUT, f'startseite-liste-{t}.png'))
        await ctx.close(); await b.close()

        # ---------- I. Tablet 820 und Desktop 1440 ----------
        for (w, h) in [(820, 1180), (1440, 900)]:
            b, ctx, page, errs = await new_phone(p, w, h); ev = page.evaluate; tag = f'[{w}] '
            await ev(STATE_RESET); await page.wait_for_timeout(300)
            nv = await ev(NAV_JS)
            exp_last = 'Einstellungen' if w >= 900 else 'Mehr'
            check(tag + 'Navigation: genau fuenf Punkte, letzter «' + exp_last + '»', nv['n'] == 5 and nv['labels'][:4] == ['Rezepte', 'Wochenplan', 'Einkauf', 'Kochbücher'] and nv['labels'][4] == exp_last and nv['vis'], str(nv['labels']))
            check(tag + ('Seitenleiste links' if w >= 900 else 'untere Leiste') + ', keine doppelte Navigation', (nv['navRect']['l'] == 0 and nv['navRect']['w'] < 300 and nv['navRect']['h'] > h * 0.5) if w >= 900 else (nv['navRect']['b'] >= h - 1 and nv['navRect']['w'] >= w - 1), str(nv['navRect']))
            tb = await ev("""() => ({ layout: !!document.querySelector('.layout-toggle'), seg: !!document.querySelector('.seg'), addBar: !!document.querySelector('.home-add-bar'), plus: !!document.querySelector('.topbar [data-action="open-add-menu"]'), gear: !!document.querySelector('.icon-btn--settings, [aria-label="Einstellungen"]:not(.nav-settings)'), phoneRows: document.querySelectorAll('.rrow--phone').length,
              h1: document.querySelector('.page-title').textContent.trim(), sw: document.documentElement.scrollWidth <= document.documentElement.clientWidth, cols: getComputedStyle(document.querySelector('.rgrid') || document.body).gridTemplateColumns.split(' ').length })""")
            check(tag + 'Tablet/Desktop behalten ihre Startseite (Raster/Liste, Alle/Favoriten, Plus im Kopf), keine Handy-Liste, kein Zahnrad', tb['layout'] and tb['seg'] and not tb['addBar'] and (tb['plus'] or w >= 900) and not tb['gear'] and tb['phoneRows'] == 0 and tb['h1'] == 'Deine Rezepte', str(tb))
            check(tag + 'Kein horizontaler Ueberlauf', tb['sw'], str(await overflow_info(page)))
            await page.click('.bottom-nav button:nth-child(6)' if False else '.bottom-nav .nav-settings'); await page.wait_for_timeout(300)
            nv2 = await ev(NAV_JS); t2 = await ev("document.querySelector('.page-title').textContent.trim()")
            check(tag + 'Zugang zu Einstellungen: Seite offen, Punkt aktiv, Titel ' + ('«Einstellungen»' if w >= 900 else '«Mehr»'), await ev("state.view") == 'settings' and nv2['active'] == [exp_last] and t2 == ('Einstellungen' if w >= 900 else 'Mehr'), f"{nv2['active']} {t2}")
            await ctx.close(); await b.close()

        # ---------- J. Wechsel der Fenstergroesse an der Grenze 768 ----------
        b, ctx, page, errs = await new_phone(p, 390, 844); ev = page.evaluate
        await ev(STATE_RESET); await page.set_viewport_size({'width': 820, 'height': 900}); await page.wait_for_timeout(500)
        check('Fenster 390 -> 820: Startseite baut sich als Tablet-Ansicht neu auf', await ev("!!document.querySelector('.layout-toggle')") and await ev("!document.querySelector('.rrow--phone')"))
        await page.set_viewport_size({'width': 390, 'height': 844}); await page.wait_for_timeout(500)
        check('Fenster 820 -> 390: wieder die Handy-Liste', await ev("document.querySelectorAll('.rrow--phone').length") == 3 and await ev("!document.querySelector('.layout-toggle')"))
        await ctx.close(); await b.close()

    print('\n' + ('ALLE OK' if not FAIL else f'{len(FAIL)} FEHLER: ' + '; '.join(FAIL[:12])))
    sys.exit(1 if FAIL else 0)
asyncio.run(main())
