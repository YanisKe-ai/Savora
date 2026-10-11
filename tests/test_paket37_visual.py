"""Paket 37: neue visuelle Sprache (Schriften, Farben, Kontrast, Tippflaechen, Rezept ohne Foto, Startseite, Kochmodus).
Gemessen in Hell, Dunkel und Schwarz bei 390 und 1280 px, dazu grosse Systemschrift (24 px) und reduzierte Bewegung."""
import asyncio, sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

VIEWS = [
    ('Startseite', "state.view='home'"),
    ('Rezept mit Foto', "state.view='detail';state.activeRecipeId='r_legacy_1'"),
    ('Rezept ohne Foto', "state.view='detail';state.activeRecipeId='r_legacy_3'"),
    ('Kochmodus', "state.view='cookmode';state.activeRecipeId='r_legacy_1';state.cookStepIndex=0;state.cookFinished=false;state.cookAllSteps=false"),
    ('Einstellungen', "state.view='settings'"),
]
BADGES = '.chip-count, .nav-badge, .filter-count-badge'
SERIF_OK = '.rcard-title, .rrow-title, .detail-title-v2, .cbk-name, .topbar--book .topbar-title, .cook-title-text'

JS_FONTS = """(serifOk) => {
  const out = {bad: [], serifElsewhere: [], families: {}};
  for (const el of document.querySelectorAll('#app *')) {
    const own = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    out.families[fam] = (out.families[fam] || 0) + 1;
    if (/condensed|roboto|baloo|sofia/i.test(cs.fontFamily.split(',')[0])) out.bad.push(el.className + ':' + fam);
    if (fam === 'Lilita One' && !el.matches(serifOk)) out.serifElsewhere.push((el.className || el.tagName) + ':' + el.textContent.trim().slice(0, 20));
  }
  return out;
}"""

JS_MINFONT = """(badges) => {
  let min = 999, who = '';
  for (const el of document.querySelectorAll('#app *')) {
    const own = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim());
    if (!own || el.closest('.sr-only')) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    if (el.matches(badges) || el.closest(badges)) continue;
    if (innerWidth < 900 && el.closest('.bottom-nav .nav-label')) continue;   // Ausnahme: fuenf Punkte in einer Reihe (Handy), Beschriftung dafuer einzeln geprueft (mind. 10 px)
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const fs = parseFloat(cs.fontSize);
    if (fs < min) { min = fs; who = (el.className || el.tagName) + ':' + el.textContent.trim().slice(0, 24); }
  }
  return [min, who];
}"""

JS_TAPS = """() => {
  const bad = [];
  const sel = 'button, a[href], [role=button], [role=tab], [role=checkbox], summary, select, input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea';
  for (const el of document.querySelectorAll('#app ' + sel.split(', ').join(', #app '))) {
    if (el.closest('.sr-only') || el.matches('.sr-only')) continue;
    if (el.matches('.timer-chip, .sheet-handle') || (el.tagName === 'A' && el.closest('.source-line, .legal-card, p'))) continue;   // Zeitgeber im Fliesstext haben eine vergroesserte Trefferflaeche (::before), Textlinks stehen im Satz
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const r = el.getBoundingClientRect(); if (!r.width && !r.height) continue;
    if (r.width < 43.5 || r.height < 43.5) bad.push((el.className || el.tagName) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' ' + (el.getAttribute('aria-label') || el.textContent.trim().slice(0, 18)));
  }
  return bad;
}"""

JS_CONTRAST = """(pairs) => {
  const parse = (s) => {
    let m = s.match(/rgba?\\(([^)]+)\\)/); if (m) { const v = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return {r: v[0], g: v[1], b: v[2], a: v[3] === undefined ? 1 : v[3]}; }
    m = s.match(/color\\(srgb ([^)]+)\\)/); if (m) { const v = m[1].split(/[ \\/]+/).filter(Boolean).map(Number); return {r: v[0] * 255, g: v[1] * 255, b: v[2] * 255, a: v[3] === undefined ? 1 : v[3]}; }
    return null;
  };
  const lum = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const blend = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
  const bgOf = (el) => { let stack = []; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; } } let base = {r: 255, g: 255, b: 255, a: 1}; for (let i = stack.length - 1; i >= 0; i--) base = blend(stack[i], base); return base; };
  const res = [];
  for (const [label, sel, forcedBg] of pairs) {
    const el = document.querySelector(sel); if (!el) { res.push([label, null]); continue; }
    const fg = parse(getComputedStyle(el).color); const bg = bgOf(el);
    const l1 = lum(blend(fg, bg)), l2 = lum(bg); const cr = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    res.push([label, Math.round(cr * 100) / 100]);
  }
  return res;
}"""

# seit 0.70.0 (Handy): Zeile unter dem Titel = Auswahl «Alle Rezepte» | Filter | Suchknopf (Suchfeld nur geoeffnet, dann absolut darueber)
JS_PHONE_STRIP = """() => {
  const bar = document.querySelector('.filter-bar--phone'); if (!bar) return null;
  const pick = bar.querySelector('.view-pick'), sel = bar.querySelector('select#viewSelect'), f = document.querySelector('.result-row [data-action="open-filter-sheet"]'), sb = bar.querySelector('#searchBtn');
  if (!pick || !f || !sb) return { sel: !!sel, missing: true };
  const r = e => e.getBoundingClientRect(), t = e => Math.round(r(e).top), txt = f.querySelector('.filter-btn-text');
  const tops = [pick, sb].map(t);
  return { sel: !sel && !pick.querySelector('svg'), pickText: pick.querySelector('.inline-pick-text').textContent.trim(), searchLabel: sb.getAttribute('aria-label'),
    order: r(pick).right <= r(sb).left + 1 && r(f).top >= r(sb).bottom - 1, row: Math.max(...tops) - Math.min(...tops),
    filterW: Math.round(r(f).width), filterTextVisible: !!txt && r(txt).width > 2, vw: innerWidth };
}"""

async def measure_contrast(page, pairs):
    return await page.evaluate(JS_CONTRAST, pairs)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        for theme in ('light', 'dark', 'amoled'):
            for (w, h) in ((390, 844), (1280, 800)):
                tag = f'[{theme} {w}] '
                ctx = await browser.new_context(viewport={'width': w, 'height': h}, reduced_motion='reduce', timezone_id='UTC')
                await ctx.add_init_script(NO_SW + " try{localStorage.setItem('savora-splash-seen','1')}catch(e){}")
                page = await ctx.new_page(); errs = []
                page.on('pageerror', lambda e: errs.append(str(e)))
                await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(400)
                await page.evaluate(f"() => {{ state.theme = '{theme}'; applyTheme(); }}")
                await page.evaluate("document.fonts.ready")
                fonts_loaded = await page.evaluate("() => Array.from(document.fonts).filter(f => f.status === 'loaded').map(f => f.family.replace(/[\"']/g, ''))")
                async def show_view(js):
                    await page.evaluate("() => { " + js + "; render(); }"); await page.wait_for_timeout(450)
                for name, js in VIEWS:
                    await show_view(js)
                    t = f'{tag}{name}: '
                    fo = await page.evaluate(JS_FONTS, SERIF_OK)
                    check(t + 'Public Sans im UI, keine gestauchte Schrift, kein Roboto', not fo['bad'] and fo['families'].get('Public Sans', 0) > 5, str(fo['bad'][:3]) + str(fo['families']))
                    check(t + 'Lilita One nur fuer Rezept- und Buchtitel', not fo['serifElsewhere'], str(fo['serifElsewhere'][:3]))
                    mn = await page.evaluate(JS_MINFONT, BADGES)
                    check(t + 'kleinste Schrift mindestens 14 px (ausser Zaehler, ausser Beschriftung der fuenfteiligen Leiste)', mn[0] >= 13.99, f'{mn[0]} {mn[1]}')
                    nl = await page.evaluate("() => { const l = document.querySelector('.bottom-nav .nav-label'); return l ? [parseFloat(getComputedStyle(l).fontSize), innerWidth] : null; }")
                    check(t + 'Navigation: Beschriftung mindestens 10 px (Handy, fuenf Punkte) bzw. 14 px (Seitenleiste)', nl is None or nl[0] >= (13.99 if nl[1] >= 900 else 9.99), str(nl))
                    taps = await page.evaluate(JS_TAPS)
                    check(t + 'Tippflaechen mindestens 44 px', not taps, str(taps[:4]))
                    ov = await page.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth]")
                    check(t + 'kein seitlicher Ueberlauf', ov[0] <= ov[1] + 1, str(ov))
                check(tag + 'Public Sans und Lilita One sind geladen', 'Public Sans' in fonts_loaded and 'Lilita One' in fonts_loaded, str(fonts_loaded))

                # Startseite: ein Suchfeld, Hauptaktion, Zahnrad, keine Statistik
                await show_view("state.view='home'")
                home = await page.evaluate("""() => ({ search: document.querySelectorAll('input[type=search], [role=searchbox]').length, fields: document.querySelectorAll('.search-field').length,
                    btn: !!document.querySelector('.filter-bar #searchBtn'), lupe: !!document.querySelector('.topbar [aria-label=\"Suchen\"], .topbar [data-action=\"focus-search\"]'),
                    gear: !!document.querySelector('.topbar [data-action=\"goto-view\"][data-view=\"settings\"][aria-label=\"Einstellungen\"]'),
                    more: (document.querySelector('.bottom-nav .nav-settings .nav-label') || {}).textContent,
                    recent: !!document.querySelector('.recent-card'), allTitle: Array.from(document.querySelectorAll('main h2')).some(h => h.textContent.trim() === 'Alle Rezepte' && getComputedStyle(h).position !== 'absolute'),
                    firstRecipe: Math.round(document.querySelector('.rcard, .rrow').getBoundingClientRect().top), stripRow: (() => { const s = document.querySelector('.filter-bar'); if (!s) return null; const kids = Array.from(s.children).map(k => Math.round(k.getBoundingClientRect().top)); return Math.max(...kids) - Math.min(...kids); })() })""")
                # Handy (unter 768 px): bewusst kein dauerhaftes Suchfeld mehr, sondern ein runder Suchknopf neben «Filter» (kein Knopf oben im Kopf); Tablet/Desktop: ein Suchfeld
                check(tag + 'Startseite: genau eine Suche (Handy: runder Knopf «Suchen» neben dem Filter, sonst ein Suchfeld), kein Lupen-Knopf oben', ((home['search'] == 0 and home['fields'] == 0 and home['btn']) if w < 768 else (home['search'] == 1 and home['fields'] == 1)) and not home['lupe'], str(home))
                check(tag + 'Startseite: kein Zahnrad mehr in der Kopfzeile, Einstellungen ueber «Mehr»/«Einstellungen» in der Navigation', not home['gear'] and home['more'] == ('Mehr' if w < 900 else 'Einstellungen'), str(home))
                check(tag + 'Startseite: kein Zwischentitel "Alle Rezepte", kein "Zuletzt bearbeitet"', not home['allTitle'] and not home['recent'], str(home))
                if w < 768:
                    # seit 0.71.0 (Handy): Titel «Alle Rezepte» ohne Pfeil links, Suchknopf rechts, Filter-Knopf in der Zeile darunter (neben dem Umschalter). Davor 0.70.0: statt Segment «Alle/Favoriten» eine Auswahl «Alle Rezepte» (select #viewSelect in .view-pick) links, Filter-Knopf und Suchknopf rechts davon, alles in einer Zeile
                    strip = await page.evaluate(JS_PHONE_STRIP)
                    ok_strip = strip is not None and strip['sel'] and strip['pickText'] == 'Alle Rezepte' and strip['searchLabel'] == 'Suchen' and strip['order'] and strip['row'] <= 6
                    check(tag + 'Startseite (Handy, seit 0.70.0): Titel «Alle Rezepte» ohne Pfeil links, Suchknopf rechts (aria-label «Suchen»), Filter-Knopf in der Zeile darunter', ok_strip, str(strip))
                else:
                    check(tag + 'Startseite: Alle/Favoriten und Filter-Schaltfläche in einer Zeile (Tablet/Desktop)', home['stripRow'] is not None and home['stripRow'] <= 6, str(home['stripRow']))
                check(tag + 'Startseite: erstes Rezept beginnt frueh', home['firstRecipe'] < (520 if w < 600 else 480), str(home['firstRecipe']))
                if w >= 768:
                    # Rezept ohne Foto: kein Buchstaben-Platzhalter, keine leere Bildflaeche
                    cards = await page.evaluate("""() => { const t = Array.from(document.querySelectorAll('.rcard--text')); const ph = Array.from(document.querySelectorAll('.rcard')).filter(c => c.classList.contains('rcard--text')); const photo = Array.from(document.querySelectorAll('.rcard:not(.rcard--text)'));
                        return { text: t.length, imgInText: t.some(c => c.querySelector('img, .placeholder, .ph-letter')), letters: document.querySelectorAll('.ph-letter').length,
                          hText: t.length ? Math.round(t[0].getBoundingClientRect().height) : 0, hPhoto: photo.length ? Math.round(photo[0].getBoundingClientRect().height) : 0, fam: t.length ? getComputedStyle(t[0].querySelector('.rcard-title')).fontFamily.split(',')[0] : '' }; }""")
                    check(tag + 'Rezept ohne Foto (Raster): typografische Karte ohne Bild und ohne Buchstaben', cards['text'] >= 1 and not cards['imgInText'] and cards['letters'] == 0 and 'Lilita One' in cards['fam'], str(cards))
                    check(tag + 'Rezept ohne Foto (Raster): etwa so hoch wie eine Foto-Karte', cards['hPhoto'] > 0 and abs(cards['hText'] - cards['hPhoto']) <= 0.2 * cards['hPhoto'] + 8, str(cards))
                    await show_view("state.view='home';state.homeLayout='list'")
                    rows = await page.evaluate("() => { const t = Array.from(document.querySelectorAll('.rrow--text')); return { n: t.length, img: t.some(c => c.querySelector('img, .placeholder, .ph-letter')), h: t.length ? Math.round(t[0].getBoundingClientRect().height) : 0 }; }")
                    check(tag + 'Rezept ohne Foto (Liste): kein Bild, keine leere Flaeche, Zeile mindestens 64 px', rows['n'] >= 1 and not rows['img'] and rows['h'] >= 64, str(rows))
                else:
                    # Handy (Startseite als Liste): Rezepte ohne Foto bekommen einen ruhigen Platzhalter in Fotogroesse, ohne Buchstaben
                    await show_view("state.view='home'")
                    rows = await page.evaluate("""() => { const all = Array.from(document.querySelectorAll('.rrow--phone')); const ph = all.filter(r => r.querySelector('.rrow-ph')); const photo = all.filter(r => !r.querySelector('.rrow-ph'));
                        const sz = (r) => { const b = r.querySelector('.rrow-img').getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; };
                        return { n: ph.length, letters: document.querySelectorAll('.ph-letter').length, szPh: ph.length ? sz(ph[0]) : null, szPhoto: photo.length ? sz(photo[0]) : null, h: ph.length ? Math.round(ph[0].getBoundingClientRect().height) : 0, text: ph.length ? ph[0].querySelector('.rrow-img').textContent.trim() : null }; }""")
                    check(tag + 'Rezept ohne Foto (Handy-Liste): ruhiger Platzhalter ohne Buchstaben, so gross wie ein Foto, Zeile mindestens 64 px', rows['n'] >= 1 and rows['letters'] == 0 and rows['text'] == '' and rows['szPh'] == rows['szPhoto'] and rows['h'] >= 64, str(rows))
                await show_view("state.homeLayout='grid';state.view='home'")
                await show_view("state.view='detail';state.activeRecipeId='r_legacy_3'")
                nd = await page.evaluate("""() => ({ hero: !!document.querySelector('.hero, .hero-img'), letter: !!document.querySelector('.ph-letter'), fam: getComputedStyle(document.querySelector('.detail-title-v2')).fontFamily.split(',')[0], fs: parseFloat(getComputedStyle(document.querySelector('.detail-title-v2')).fontSize),
                    time: !!document.querySelector('.detail-meta-v2 .fact'), cook: (document.querySelector('.cook-start-inline') || {}).textContent, ing: Math.round(document.querySelector('.ing-check, .detail-aside-ing .ing-check').getBoundingClientRect().height),
                    tabs: Array.from(document.querySelectorAll('.tab-v2')).map(t => Math.round(t.getBoundingClientRect().height)), tools: Array.from(document.querySelectorAll('.detail-tools [data-action]')).map(b => b.dataset.action) })""")
                check(tag + 'Rezept ohne Foto (Ansicht): kein Bildband, Titel gross in Lilita One', not nd['hero'] and not nd['letter'] and 'Lilita One' in nd['fam'] and nd['fs'] >= 32, str(nd))
                check(tag + 'Rezeptansicht: "Kochen starten", Zeit/Menge, Zutatenzeile mind. 52 px, Reiter mind. 48 px', (nd['cook'] or '').strip() == 'Kochen starten' and nd['time'] and nd['ing'] >= 52 and all(x >= 48 for x in nd['tabs']), str(nd))
                check(tag + 'Rezeptansicht: Einkaufen, Planen, Bearbeiten, Teilen erreichbar', nd['tools'] == ['add-to-shopping', 'open-plan-recipe', 'edit-recipe', 'share-recipe'], str(nd['tools']))
                await show_view("state.view='detail';state.activeRecipeId='r_legacy_1'")
                wp = await page.evaluate("""() => { const i = document.querySelector('img.hero-img'); if (!i) return null; const cs = getComputedStyle(i); const r = i.getBoundingClientRect(); return { fit: cs.objectFit, nat: [i.naturalWidth, i.naturalHeight], box: [Math.round(r.width), Math.round(r.height)] }; }""")
                check(tag + 'Rezept mit Foto: Bild wird zugeschnitten, nie gestreckt (object-fit cover)', wp is not None and wp['fit'] == 'cover', str(wp))
                await show_view("state.view='detail';state.activeRecipeId=(state.recipes.find(r => !r.notes && !(r.cookLog || []).length) || state.recipes[0]).id")
                nn = await page.evaluate("""() => ({ noteBox: !!document.querySelector('.note-card'), noteTab: Array.from(document.querySelectorAll('.tab-v2')).some(t => t.textContent.trim() === 'Notizen') })""")
                check(tag + 'Notizen nur sichtbar, wenn vorhanden (Rezept ohne Notiz)', not nn['noteBox'] and not nn['noteTab'], str(nn))
                await show_view("state.view='detail';state.activeRecipeId=(state.recipes.find(r => r.notes) || state.recipes[0]).id;state.detailTab='notes'")
                nn2 = await page.evaluate("""() => ({ noteTab: Array.from(document.querySelectorAll('.tab-v2')).some(t => t.textContent.trim() === 'Notizen'), add: !!Array.from(document.querySelectorAll('[data-action=\"open-note-modal\"]')).length })""")
                check(tag + 'Rezept mit Notiz: Reiter "Notizen" und "Notiz hinzufuegen" vorhanden', nn2['noteTab'] and nn2['add'], str(nn2))
                await show_view("state.detailTab='ingredients'")

                # Kontrast
                await show_view("state.view='home'")
                pairs = [['Seitentitel auf Seite', '.page-title'], ['Zweittext (Meta) auf Seite', '.rcard-meta, .result-line'], ['Chip-Text auf Chip', '.chip:not(.chip--active)'], ['aktiver Chip', '.chip--active'], ['Suchtext auf Suchfeld', '.search-input'], ['Titel in typografischer Karte', '.rcard--text .rcard-title'], ['Textknopf Sichern', '.nudge-actions .text-btn'], ['Zahlen/Meta typografische Karte', '.rcard--text .rcard-meta']]
                c1 = await measure_contrast(page, pairs)
                bad = [x for x in c1 if x[1] is not None and x[1] < 4.5]
                check(tag + 'Kontrast Text auf Flaeche mindestens 4.5:1 (Startseite)', not bad, str(c1))
                await show_view("state.view='detail';state.activeRecipeId='r_legacy_3'")
                c2 = await measure_contrast(page, [['Rezepttitel', '.detail-title-v2'], ['Menge/Zeit', '.fact'], ['Zutatenname', '.ing-name'], ['Reiter inaktiv', '.tab-v2:not(.is-active)'], ['Reiter aktiv', '.tab-v2.is-active'], ['Hauptknopf Kochen starten', '.cook-start-inline'], ['Zweitaktion', '.tool-action span']])
                bad2 = [x for x in c2 if x[1] is not None and x[1] < (5.5 if 'Hauptknopf' in x[0] else 4.5)]
                check(tag + 'Kontrast Rezeptansicht: Text mind. 4.5:1, Hauptknopf mind. 5.5:1', not bad2 and any(x[0].startswith('Hauptknopf') and x[1] for x in c2), str(c2))
                await show_view("state.view='settings'")
                c3 = await measure_contrast(page, [['Einstellungszeile', '.settings-row-title'], ['Gruppentitel', '.settings-group-title'], ['Zusammenfassung', '.settings-row-summary']])
                bad3 = [x for x in c3 if x[1] is not None and x[1] < 4.5]
                check(tag + 'Kontrast Einstellungen mindestens 4.5:1', not bad3, str(c3))
                await show_view(VIEWS[3][1])
                c4 = await measure_contrast(page, [['Schritttext', '.cookmode-steptext'], ['Zutaten-Chip', '.cook-ing'], ['Weiter', '.cookmode-nav .primary'], ['Alle Zutaten', '.cook-ings-btn']])
                bad4 = [x for x in c4 if x[1] is not None and x[1] < (5.5 if x[0] == 'Weiter' else 4.5)]
                check(tag + 'Kontrast Kochmodus (Text 4.5:1, Hauptknopf 5.5:1)', not bad4, str(c4))
                # Kochmodus: Schriftgroessen und Schaltflaechen
                ck = await page.evaluate("""() => ({ step: parseFloat(getComputedStyle(document.querySelector('.cookmode-steptext')).fontSize), chip: Math.min(...Array.from(document.querySelectorAll('.cook-ing')).map(c => parseFloat(getComputedStyle(c).fontSize))),
                    btn: Array.from(document.querySelectorAll('.cook-ings-btn')).map(b => Math.round(b.getBoundingClientRect().height)), n: document.querySelectorAll('.cook-ing').length, all: !!Array.from(document.querySelectorAll('.cook-ings-btn')).find(b => b.textContent.trim() === 'Alle Zutaten'),
                    timer: !!document.getElementById('cookTimerBar') })""")
                check(tag + 'Kochmodus: Schritttext mindestens 28 px, Zutaten-Chips mind. 18 px', ck['step'] >= 27.99 and (ck['n'] == 0 or ck['chip'] >= 17.99), str(ck))
                check(tag + 'Kochmodus: "Anpassen" und "Alle Zutaten" als Schaltflaechen mind. 44 px', ck['all'] and all(x >= 44 for x in ck['btn']), str(ck))

                # Marke (Paket 43): nur die Wortmarke, Hell rot, Dunkel/Schwarz creme
                await show_view("state.view='home'")
                lg = await page.evaluate("""() => { const w = document.querySelector('.topbar .top-wordmark'); return w ? getComputedStyle(w).color.replace(/ /g, '') : null; }""")
                want_wm = 'rgb(185,59,44)' if theme == 'light' else 'rgb(247,244,238)'
                check(tag + 'Logo: Wortmarke rot auf hell bzw. creme auf dunkel', lg == want_wm, str(lg))

                # Grosse Systemschrift
                await page.evaluate("document.documentElement.style.fontSize = '24px'"); await page.wait_for_timeout(200)
                for name, js in VIEWS:
                    await show_view(js)
                    ov = await page.evaluate("""() => { const w = window.innerWidth; const clipped = Array.from(document.querySelectorAll('#app .tool-action, #app .rcard-title, #app .cook-ing, #app .detail-title-v2, #app .chip')).filter(e => e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow !== 'visible' && getComputedStyle(e).overflowX !== 'scroll' && getComputedStyle(e).overflowX !== 'auto').length; return [document.documentElement.scrollWidth, w, clipped]; }""")
                    check(f'{tag}{name} bei Systemschrift 24 px: kein seitlicher Ueberlauf, nichts abgeschnitten', ov[0] <= ov[1] + 1 and ov[2] == 0, str(ov))
                await page.evaluate("document.documentElement.style.fontSize = ''")
                check(tag + 'Keine Seitenfehler', not errs, str(errs[:3]))
                await ctx.close()

        # seit 0.70.0 bei 320 px: «Filter» nur als Symbol, damit «Alle Rezepte» in eine Zeile passt; Zeile bleibt eine Zeile, kein Ueberlauf
        ctx = await browser.new_context(viewport={'width': 320, 'height': 700}, reduced_motion='reduce', timezone_id='UTC')
        await ctx.add_init_script(NO_SW + " try{localStorage.setItem('savora-splash-seen','1')}catch(e){}")
        page = await ctx.new_page(); await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(400)
        await page.evaluate("() => { state.view = 'home'; render(); }"); await page.wait_for_timeout(450)
        st = await page.evaluate(JS_PHONE_STRIP)
        ov = await page.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth]")
        check('Startseite 320 px (seit 0.70.0): Auswahl, Filter nur als Symbol (44 px), Suchknopf in einer Zeile, kein Ueberlauf', st is not None and st.get('row', 99) <= 6 and st.get('order') and not st.get('filterTextVisible') and st.get('filterW') == 44 and st.get('pickText') == 'Alle Rezepte' and ov[0] <= ov[1] + 1, str(st) + str(ov))
        await ctx.close()

        # Bewegung: reduziert und normal
        for reduced in ('reduce', 'no-preference'):
            ctx = await browser.new_context(viewport={'width': 390, 'height': 844}, reduced_motion=reduced, timezone_id='UTC')
            await ctx.add_init_script(NO_SW + " try{localStorage.setItem('savora-splash-seen','1')}catch(e){}")
            page = await ctx.new_page(); await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(400)
            await page.evaluate("() => { state.view = 'detail'; state.activeRecipeId = 'r_legacy_3'; render(); }"); await page.wait_for_timeout(500)
            m = await page.evaluate("""() => { const dur = (s) => s.split(',').map(x => parseFloat(x) * (x.trim().endsWith('ms') ? 0.001 : 1)); let mx = 0; for (const e of document.querySelectorAll('#app *')) { const cs = getComputedStyle(e); mx = Math.max(mx, ...dur(cs.transitionDuration), ...dur(cs.animationDuration)); } const b = getComputedStyle(document.querySelector('.cook-start-inline')); return { mx, tr: b.transitionProperty, td: b.transitionDuration, mq: matchMedia('(prefers-reduced-motion: reduce)').matches }; }""")
            if reduced == 'reduce':
                check('Reduzierte Bewegung: keine laenger als 1 ms dauernden Uebergaenge oder Animationen', m['mq'] and m['mx'] <= 0.001, str(m))
            else:
                check('Normale Bewegung: Hauptknopf hat schnellen Druck-Uebergang (transform, 100 bis 200 ms)', 'transform' in m['tr'] and 0.09 <= float(m['td'].split(',')[0].replace('s', '')) <= 0.2, str(m))
            await ctx.close()
        await browser.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
