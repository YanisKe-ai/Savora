"""Paket 39: Startseite mit festem Kopfbereich (nur der Rezeptbereich scrollt) und neue Schriften (Lilita One, Public Sans).
Prüft: Kopf bleibt beim Scrollen stehen (390x844 und 1280x800; Hell, Dunkel), Kopf höchstens 40 Prozent der Höhe,
«Heute geplant» und Sicherungshinweis scrollen weg, Zurück stellt die Scrollposition wieder her, Fokus im Suchfeld bleibt beim Tippen,
Schriftfamilien (Public Sans überall, Lilita One nur Rezept- und Buchtitel), font-synthesis, Schriften geladen, Umlaute/«½»/«–» ohne Ersatzschrift,
sehr langer Titel in Karte/Liste/Ansicht/Kochmodus ohne Überlauf, 24 px Systemschrift, Titelblatt-Schriften bleiben unverändert."""
import asyncio, sys, os, re
os.environ.setdefault('SAVORA_TEST_PORT', '8881')
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

LONG = 'Überbackene Kartoffel-Zucchini-Gratin-Spezialität mit Rosmarin, Ziegenkäse und karamellisierten Zwiebeln nach Grossmutters Hausrezept Superlangeswortohneleerzeichenumdenumbruchzutesten'
EXTRA = """async (LONG) => {
  const long = emptyRecipe(); long.id = 'r_long'; long.title = LONG; long.servings = 4; long.timeMinutes = 95;
  long.ingredients = [{amount:'1', unit:'kg', name:'Kartoffeln'}]; long.steps = [{text:'Alles mischen und backen.'}, {text:'Servieren.'}];
  await dbPut(long);
  for (let i = 1; i <= 16; i++) { const r = emptyRecipe(); r.id = 'r_fill_' + i; r.title = 'Füllrezept Nummer ' + i; r.servings = 2; r.timeMinutes = 10 + i; r.ingredients = [{amount:'1', unit:'', name:'Zutat'}]; r.steps = [{text:'Fertig.'}]; await dbPut(r); }
  await loadRecipes();
  const today = fmtDateKey(new Date());
  await savePlanEntries(today, [{id:'e1', recipeId:'r_legacy_2', meal:'', servings:null}]);
  await loadMealplan();
  try { localStorage.removeItem('savora-backup-nudge-dismissed'); } catch (e) {}
  state.view = 'home'; state.homeLayout = 'grid'; state.query = ''; render(); return true;
}"""
HEAD_RECT = "() => { const h = document.querySelector('.home-head'); const r = h.getBoundingClientRect(); return [Math.round(r.top * 10) / 10, Math.round(r.bottom * 10) / 10, Math.round(r.height * 10) / 10]; }"
TITLE_SEL = '.rcard-title, .rrow-title, .detail-title-v2, .cbk-name, .topbar--book .topbar-title, .cook-title-text, .cook-stepcount [aria-hidden], .cook-stepcount b, .cook-stepcount--text, .cook-mise-title, .cook-finish-v2 h2, .cook-alarm-copy strong'   # v89: Lilita auch fuer Schrittzahl, Vorbereitung, Schlussbild und Timer-Ende im Kochmodus
FONTS = """(titleSel) => { const out = { bad: [], lilitaElsewhere: [], notPublic: [], families: {}, synth: [], weight: [] };
  for (const el of document.querySelectorAll('#app *')) {
    const own = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim()); if (!own) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    out.families[fam] = (out.families[fam] || 0) + 1;
    if (/dm sans|fraunces|condensed|roboto|sofia/i.test(cs.fontFamily)) out.bad.push((el.className || el.tagName) + ':' + cs.fontFamily);
    const isTitle = el.matches(titleSel);
    if (fam === 'Lilita One' && !isTitle) out.lilitaElsewhere.push((el.className || el.tagName) + ':' + el.textContent.trim().slice(0, 20));
    if (fam !== 'Lilita One' && fam !== 'Public Sans' && !/^Archivo$/.test(fam) && !el.closest('svg, .brand-v2, .nav-brand')) out.notPublic.push((el.className || el.tagName) + ':' + fam);
    if (isTitle && fam === 'Lilita One') { if (cs.fontSynthesis.indexOf('weight') >= 0 && !/none/.test(cs.fontSynthesis)) out.synth.push(el.className); if (parseInt(cs.fontWeight, 10) !== 400) out.weight.push(el.className + ':' + cs.fontWeight); }
  }
  return out; }"""

async def set_theme(page, theme):
    if theme == 'schwarz':
        await page.evaluate("() => { state.theme = 'dark'; applyTheme(); }")
    else:
        await page.evaluate(f"() => {{ state.theme = '{theme}'; applyTheme(); }}")
    await page.wait_for_timeout(150)

async def to_top(page, js="state.view = 'home'"):
    await page.evaluate("() => { " + js + "; render(); }"); await page.wait_for_timeout(250)
    await page.evaluate("() => window.scrollTo(0, 0)"); await page.wait_for_timeout(300)

async def prepare(page):
    await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(300)
    await page.evaluate(EXTRA, LONG); await page.wait_for_timeout(300)

async def main():
    async with async_playwright() as p:
        # ---------- A. fester Kopf ----------
        for (w, h) in [(390, 844), (1280, 800)]:
            b, ctx = await open_ctx(p, w, h, 'reduce'); page = await ctx.new_page(); errs = []
            page.on('pageerror', lambda e: errs.append(str(e)))
            await prepare(page); ev = page.evaluate
            for theme in ['light', 'dark', 'schwarz']:
                tag = f'{w}x{h} {theme}: '
                await set_theme(page, theme); await to_top(page)
                h0 = await ev(HEAD_RECT)
                c0 = await ev("() => document.querySelector('.rcard, .rrow').getBoundingClientRect().top")
                sh0 = await ev("() => getComputedStyle(document.querySelector('.home-head')).boxShadow")
                await ev("() => window.scrollTo(0, 600)"); await page.wait_for_timeout(350)
                y = await ev("() => window.scrollY")
                h1 = await ev(HEAD_RECT)
                c1 = await ev("() => document.querySelector('.rcard, .rrow').getBoundingClientRect().top")
                sh1 = await ev("() => getComputedStyle(document.querySelector('.home-head')).boxShadow")
                check(tag + 'Seite scrollt wirklich (Testdaten reichen)', y > 100, str(y))
                check(tag + 'Kopfbereich bleibt an seiner Position', h0 == h1 and abs(h1[0]) < 0.6, f'{h0} -> {h1}')
                check(tag + 'nur der Rezeptbereich bewegt sich', c1 < c0 - 50, f'{c0} -> {c1}')
                check(tag + 'weiche Kante nur beim Scrollen', sh0 == 'none' and sh1 != 'none', f'{sh0} | {sh1}')
                bg = await ev("() => [getComputedStyle(document.querySelector('.home-head')).backgroundColor, getComputedStyle(document.body).backgroundColor]")
                check(tag + 'Kopf hat den vollen Seitenhintergrund (var(--bg))', bg[0] == bg[1] and 'rgba(0, 0, 0, 0)' not in bg[0], str(bg))
                parts = await ev("""() => { const hd = document.querySelector('.home-head').getBoundingClientRect(); const inside = s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return r.top >= hd.top - 0.5 && r.bottom <= hd.bottom + 0.5; };
                    return { brand: inside('.home-head .topbar'), plus: inside('[data-action="open-add-menu"]'), gear: inside('.icon-btn--settings'), title: inside('.page-title'), search: inside('.search-input, #searchBtn'), strip: inside('.filter-bar'), toggle: inside('.filter-btn'),
                      today: document.querySelector('.home-head .today-planned, .home-head .recent-title') ? 'im Kopf' : 'ok', nudgeInHead: !!document.querySelector('.home-head .nudge-card') }; }""")
                # Neu (Startseite als Liste): kein Zahnrad mehr (Einstellungen ueber «Mehr»); Handy ohne Plus (Aktionsknopf unten) und ohne sichtbaren Seitentitel
                need = ['brand', 'search', 'strip'] if w < 768 else ['brand', 'plus', 'title', 'search', 'strip', 'toggle']
                check(tag + 'Wortmarke, Suche, Alle/Favoriten, Filter-Schaltfläche' + ('' if w < 768 else ', Plus, Titel') + ' liegen im festen Kopf', all(parts[k] for k in need), str(parts))
                check(tag + 'Kein Zahnrad im Kopf, auf dem Handy auch kein Plus und kein Seitentitel im Kopf', parts['gear'] is None and (w >= 768 or (not parts['plus'] and parts['title'] is None)), str(parts))
                check(tag + '«Heute geplant» und Sicherungshinweis stehen nicht im festen Kopf', parts['today'] == 'ok' and not parts['nudgeInHead'], str(parts))
                if (w, h) == (390, 844):
                    check(tag + 'Kopf belegt höchstens 40 Prozent der Höhe', h1[2] <= 0.40 * h, f'{h1[2]} von {h}')
            # Heute geplant / Hinweis scrollen weg
            await set_theme(page, 'light'); await to_top(page)
            t = await ev("() => { const a = document.querySelector('.home-main .recent-card, .home-main .today-card, .home-main [class*=recent], .home-main .nudge-card'); if (!a) return null; return a.getBoundingClientRect().top; }")
            n = await ev("() => { const a = document.querySelector('.nudge-card'); return a ? a.getBoundingClientRect().top : null; }")
            check(tag_ := f'{w}x{h}: Sicherungshinweis ist im scrollenden Teil (unter dem Kopf)', n is not None and n >= (await ev(HEAD_RECT))[1] - 1, str(n))
            await ev("() => window.scrollTo(0, 600)"); await page.wait_for_timeout(300)
            n2 = await ev("() => { const a = document.querySelector('.nudge-card'); return a ? a.getBoundingClientRect().bottom : null; }")
            hb = (await ev(HEAD_RECT))[1]
            check(f'{w}x{h}: Hinweis und «Heute geplant» scrollen unter dem Kopf weg', n2 is not None and n2 <= hb + 1, f'{n2} <= {hb}')
            # Liste statt Raster
            await to_top(page, "state.homeLayout = 'list'")
            h0 = await ev(HEAD_RECT); await ev("() => window.scrollTo(0, 500)"); await page.wait_for_timeout(300); h1 = await ev(HEAD_RECT)
            check(f'{w}x{h}: Liste: Kopf bleibt stehen', h0 == h1, f'{h0} -> {h1}')
            await to_top(page, "state.homeLayout = 'grid'")
            # Zurück stellt Scrollposition wieder her
            await ev("() => { window.scrollTo(0, 500); }"); await page.wait_for_timeout(300)
            y0 = await ev("() => window.scrollY")
            await page.evaluate("() => { const c = Array.from(document.querySelectorAll('.rcard-main, .rrow-main')).find(e => e.getBoundingClientRect().top > document.querySelector('.home-head').getBoundingClientRect().bottom + 10 && e.getBoundingClientRect().bottom < innerHeight - 60); (c || document.querySelector('.rcard-main, .rrow-main')).click(); }")
            await page.wait_for_timeout(500)
            vw = await ev("() => state.view")
            await page.click('[data-action="back"]'); await page.wait_for_timeout(600)
            y1 = await ev("() => window.scrollY")
            check(f'{w}x{h}: Zurück aus der Rezeptansicht stellt die Scrollposition wieder her', vw == 'detail' and abs(y1 - y0) <= 2, f'{vw} {y0} -> {y1}')
            h1 = await ev(HEAD_RECT)
            check(f'{w}x{h}: Kopf nach der Rückkehr an seinem Platz', abs(h1[0]) < 0.6, str(h1))
            # Fokus im Suchfeld
            await ev("() => { state.view = 'home'; render(); window.scrollTo(0, 300); }"); await page.wait_for_timeout(300)
            hb0 = await ev(HEAD_RECT)
            await open_search(page); await page.click('#searchInput'); await page.keyboard.type('Car', delay=60); await page.wait_for_timeout(400)
            st = await ev("() => ({ id: document.activeElement.id, v: document.activeElement.value })")
            hb1 = await ev(HEAD_RECT)
            check(f'{w}x{h}: Fokus bleibt beim Tippen im Suchfeld, Text vollständig', st['id'] == 'searchInput' and st['v'] == 'Car', str(st))
            check(f'{w}x{h}: Kopf bewegt sich beim Tippen nicht', hb0 == hb1, f'{hb0} -> {hb1}')
            # Tastatur: ein per Tab erreichtes Rezept liegt nie hinter dem festen Kopf
            await to_top(page, "state.query = ''; state.view = 'home'")
            await open_search(page); await page.focus('#searchInput')
            seen = []
            for i in range(14):
                await page.keyboard.press('Tab'); await page.wait_for_timeout(120)
                r = await ev("() => { const a = document.activeElement; if (!a || !a.closest('main')) return null; const r = a.getBoundingClientRect(); return [Math.round(r.top), Math.round(document.querySelector('.home-head').getBoundingClientRect().bottom), Math.round(r.bottom), innerHeight]; }")
                if r: seen.append(r)
            check(f'{w}x{h}: per Tab erreichte Rezepte liegen nie hinter dem festen Kopf', len(seen) >= 3 and all(r[0] >= r[1] - 1 for r in seen), str(seen[:6]))
            # Gummiband
            ob = await ev("() => [getComputedStyle(document.documentElement).overscrollBehaviorY, getComputedStyle(document.body).overscrollBehaviorY]")
            check(f'{w}x{h}: kein Gummiband der ganzen Seite (overscroll-behavior-y: none)', ob == ['none', 'none'], str(ob))
            check(f'{w}x{h}: keine Skriptfehler', not errs, str(errs[:2]))
            await b.close()

        # ---------- B. Schriften ----------
        b, ctx = await open_ctx(p, 390, 844, 'reduce'); page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await prepare(page); ev = page.evaluate
        await ev("() => document.fonts.load('400 40px \"Lilita One\"')"); await ev("() => Promise.all([document.fonts.load('400 16px \"Public Sans\"'), document.fonts.load('700 16px \"Public Sans\"')])")
        loaded = await ev("() => Array.from(document.fonts).filter(f => f.status === 'loaded').map(f => f.family.replace(/[\"']/g, ''))")
        check('Public Sans und Lilita One sind geladen (document.fonts)', 'Public Sans' in loaded and 'Lilita One' in loaded, str(loaded))
        chk = await ev("""() => [document.fonts.check('400 16px "Public Sans"'), document.fonts.check('700 16px "Public Sans"'), document.fonts.check('400 40px "Lilita One"')]""")
        check('document.fonts.check meldet beide Schriften als verfügbar', all(chk), str(chk))
        check('DM Sans und Fraunces sind nicht mehr geladen oder deklariert', not any(x in loaded for x in ['DM Sans', 'Fraunces']))
        gl = await ev("""() => { const chars = 'ÄÖÜäöüéèà½–ß'.split(''); const c = document.createElement('canvas').getContext('2d'); const w = (font, t) => { c.font = font; return c.measureText(t).width; };
          const miss = (fam, weight) => chars.filter(ch => { const a = w(weight + ' 40px "' + fam + '", serif', ch) === w(weight + ' 40px serif', ch); const b2 = w(weight + ' 40px "' + fam + '", monospace', ch) === w(weight + ' 40px monospace', ch); return a && b2; });
          return { pub: miss('Public Sans', 400), pub7: miss('Public Sans', 700), lil: miss('Lilita One', 400) }; }""")
        check('Umlaute, «½» und «–» kommen aus Public Sans (keine Ersatzschrift)', not [c for c in gl['pub'] if c != 'ß'] and not [c for c in gl['pub7'] if c != 'ß'], str(gl))
        check('Umlaute, «½» und «–» kommen aus Lilita One (keine Ersatzschrift)', not [c for c in gl['lil'] if c != 'ß'], str(gl))
        for vname, js in [('Startseite Raster', "state.view='home';state.homeLayout='grid'"), ('Startseite Liste', "state.view='home';state.homeLayout='list'"), ('Rezeptansicht', "state.view='detail';state.activeRecipeId='r_legacy_1'"),
                          ('Rezeptansicht lang', "state.view='detail';state.activeRecipeId='r_long'"), ('Kochmodus', "state.view='cookmode';state.activeRecipeId='r_long';state.cookStepIndex=0;state.cookFinished=false;state.cookAllSteps=false"),
                          ('Wochenplan', "state.view='plan'"), ('Einkauf', "state.view='shopping'"), ('Kochbücher', "state.view='cookbooks'"), ('Einstellungen', "state.view='settings'")]:
            await ev("() => { " + js + "; state.modal = null; render(); window.scrollTo(0, 0); }"); await page.wait_for_timeout(350)
            fo = await ev(FONTS, TITLE_SEL)
            check(f'{vname}: keine DM Sans, Fraunces oder gestauchte Schrift', not fo['bad'], str(fo['bad'][:3]))
            check(f'{vname}: Lilita One nur für Rezept- und Buchtitel', not fo['lilitaElsewhere'], str(fo['lilitaElsewhere'][:3]))
            check(f'{vname}: sonst überall Public Sans', not fo['notPublic'], str(fo['notPublic'][:3]) + str(fo['families']))
            check(f'{vname}: Titel in Lilita One sind Normalgewicht ohne künstliches Fett', not fo['weight'] and not fo['synth'], str(fo['weight'][:3]) + str(fo['synth'][:3]))
        # Titel-Eigenschaften
        await ev("() => { state.view = 'home'; state.homeLayout = 'grid'; render(); }"); await page.wait_for_timeout(250)
        ts = await ev("() => { const cs = getComputedStyle(document.querySelector('.rcard-title, .rrow-title')); return [cs.fontSynthesis, cs.letterSpacing, cs.overflowWrap, cs.hyphens, cs.lineHeight, cs.fontSize, cs.fontFamily.split(',')[0]]; }")
        check('Kartentitel: font-synthesis none, Laufweite 0, umbrechen, Silbentrennung', 'none' in ts[0] and ts[1] in ('0px', 'normal') and ts[2] == 'anywhere' and ts[3] == 'auto', str(ts))
        lh = float(ts[4].replace('px', '')) / float(ts[5].replace('px', ''))
        check('Kartentitel: Zeilenhöhe 1.1 bis 1.2', 1.09 <= lh <= 1.21, str(lh))
        await page.set_viewport_size({'width': 820, 'height': 1180}); await page.wait_for_timeout(500)   # sichtbarer Seitentitel gibt es nur auf Tablet und Desktop; auf dem Handy steht «Alle Rezepte» an seiner Stelle
        pt = await ev("() => { const cs = getComputedStyle(document.querySelector('.page-title')); const st = getComputedStyle(document.querySelector('.settings-row, .section-title, h2') || document.body); return [cs.fontFamily.split(',')[0], cs.fontWeight]; }")
        check('Seitentitel «Deine Rezepte» in Public Sans 700', 'Public Sans' in pt[0] and pt[1] == '700', str(pt))
        await page.set_viewport_size({'width': 390, 'height': 844}); await page.wait_for_timeout(400)
        # Kontrast Titel (>= 4.5:1) in drei Darstellungen
        for theme in ['light', 'dark', 'schwarz']:
            await set_theme(page, theme); await page.wait_for_timeout(200)
            cr = await ev("""() => { const par = s => { const m = s.match(/[\\d.]+/g).map(Number); return m; }; const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
              const t = par(getComputedStyle(document.querySelector('.rcard-title, .rrow-title')).color), bgc = par(getComputedStyle(document.body).backgroundColor); const a = lum(t), b = lum(bgc); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); }""")
            check(f'Titelkontrast {theme} mindestens 4.5:1', cr >= 4.5, f'{cr:.1f}')
        await set_theme(page, 'light')
        # Titelblatt: Schriften bleiben Sofia/Roboto der freigegebenen Vorlagen, nie DM Sans/Fraunces
        cf = await ev("() => { const L = coverLayout({ templateId: 'tomate', title: 'Omas Rezepte', name: 'Familie Müller', slogan: 'Mit Liebe', date: '2026-10-09' }); return L.blocks.map(b => b.family).concat(L.date ? [L.date.family] : []); }")
        check('Titelblatt-Schriften bleiben die der freigegebenen Vorlagen (Sofia/Roboto), keine Oberflächenschrift', cf and not any(re.search('DM Sans|Fraunces|Lilita|Public', f) for f in cf), str(cf))
        check('keine Skriptfehler (Schriften)', not errs, str(errs[:2]))

        # ---------- C. lange Titel ----------
        for (w, fs) in [(320, '16px'), (360, '16px'), (390, '16px'), (390, '24px'), (1280, '16px')]:
            await b.close()
            b, ctx = await open_ctx(p, w, 844 if w < 900 else 800, 'reduce'); page = await ctx.new_page()
            await prepare(page); ev = page.evaluate
            await ev(f"() => {{ document.documentElement.style.fontSize = '{fs}'; }}")
            for vname, js in [('Karte', "state.view='home';state.homeLayout='grid';state.query='Überbackene'"), ('Liste', "state.view='home';state.homeLayout='list';state.query='Überbackene'"),
                              ('Ansicht', "state.view='detail';state.activeRecipeId='r_long'"), ('Kochmodus', "state.view='cookmode';state.activeRecipeId='r_long';state.cookStepIndex=0;state.cookFinished=false;state.cookAllSteps=false")]:
                if vname == 'Karte' and w < 768: continue   # Karten (Raster) gibt es nur ab 768 px; auf dem Handy gilt die Liste (naechster Durchlauf)
                await ev("() => { " + js + "; state.modal = null; render(); window.scrollTo(0, 0); }"); await page.wait_for_timeout(350)
                r = await ev("""(sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); const p = (e.closest('.rcard, .rrow, .detail-head, .cook-title-line, main') || e.parentElement).getBoundingClientRect();
                    return { sw: e.scrollWidth, cw: e.clientWidth, right: Math.round(r.right), pright: Math.round(p.right), vw: document.documentElement.clientWidth, doc: document.documentElement.scrollWidth, fam: getComputedStyle(e).fontFamily.split(',')[0], text: e.textContent.trim().slice(0, 20), h: Math.round(r.height), clampLines: getComputedStyle(e).webkitLineClamp }; }""", {'Karte': '.rcard-title', 'Liste': '.rrow-title', 'Ansicht': '.detail-title-v2', 'Kochmodus': '.cook-title-text'}[vname])
                ok = r is not None and r['sw'] <= r['cw'] + 1 and r['right'] <= r['pright'] + 1 and r['doc'] <= r['vw'] + 1 and 'Lilita One' in r['fam']
                check(f'{w}px {fs} {vname}: langer Titel überläuft nicht (Lilita One)', ok, str(r))
            await ev("() => { state.query = ''; }")
        await b.close()
    print('\nFehler:', len(FAIL))
    for f in FAIL: print(' -', f)
    sys.exit(1 if FAIL else 0)
asyncio.run(main())
