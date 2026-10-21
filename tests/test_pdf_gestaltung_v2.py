"""PDF-Gestaltung V2 (Savora_PDF_Feinschliff_V2, recipe-layout.css): physische Masse, Farben und Schriften der Stile «Pur» und
«Prise Pop» in allen drei Dichten (normal, compact, compact-columns). Rendert pvRecipePage/pvPage mit Testmodellen und misst im DOM
(berechnete Stile, Schriften geladen). Die echte PDF-Ausgabe pruefen test_pdf_ausgabe und test_pdf_stile."""
import asyncio, sys, os, json
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

SETUP = r"""() => {
  const g = (title) => ({ type: 'group', title, show: true });
  const I = (amount, name, extra) => Object.assign({ type: 'ing', amount, name }, extra || {});
  const base = (id, title, ingredients, extra) => Object.assign({ id, title, category: 'Sauce / Dip', facts: [{ label: 'Portionen', value: '9', short: '9 Portionen' }, { label: 'Gesamtzeit', value: '2 Std.', short: '2 Std.' }], ingredients,
    steps: Array.from({ length: 11 }, (_, i) => ({ type: 'step', no: i + 1, text: 'Schritt ' + (i + 1) + ': Teig kneten, gehen lassen und anschliessend weiterverarbeiten.' })), tips: [], source: 'kookmutsjes.com', sourceUrl: '', notes: '', log: [], nutrition: null, pieces: false }, extra || {});
  // Sloppy-Joe-Gruppen (wie fixture.js der Vorgabe): dritte Gruppe ohne bzw. mit fehlenden Mengen
  const sloppy = [g('Teig'), I('250 ml', 'Milch, lauwarm'), I('15 g', 'Honig'), I('7 g', 'Trockenhefe'), I('1', 'Ei, gross'), I('45 g', 'Butter, ungesalzen'), I('500 g', 'Weissmehl'), I('8 g', 'Salz'),
    g('Sloppy-Joe-Füllung'), I('25 ml', 'Olivenöl'), I('600 g', 'Rinderhackfleisch'), I('4 g', 'Salz'), I('3 g', 'Paprikapulver'), I('2 g', 'Knoblauchpulver'), I('3 g', 'Zwiebelpulver'), I('3 g', 'Cayennepfeffer'), I('1 ½ g', 'schwarzer Pfeffer'), I('100 g', 'Ketchup'),
    g('Zum Füllen und Bestreichen'), I('', 'Käsescheiben, Cheddar oder Schmelzkäse'), I('', 'Big-Mac-Sauce'), I('1', 'Ei (gross), verquirlt'), I('', 'Sesam')];
  const lang = sloppy.slice(0, 18).concat([g('Garnitur'), I('', 'sehr lange Zutatenzeile mit vielen Wörtern, die in der halben Breite sicher umbrechen würde und darum einspaltig steht'), I('1 Bund', 'Petersilie')]);
  const models = { sloppy: base('g1', 'Sloppy Joe Buns', sloppy), lang: base('g2', 'Ein sehr langer Rezepttitel, der sicher auf zwei Zeilen umbricht und den Kopf wachsen lässt', lang) };
  window.__gm = models;
  window.__gr = (key, tplId, density, cont) => {
    pdfSetContext(tplId, '', '', true);
    const m = models[key];
    document.getElementById('pvG') && document.getElementById('pvG').remove();
    const host = document.createElement('div'); host.id = 'pvG'; host.style.cssText = 'position:absolute;left:0;top:0;width:210mm;z-index:99999';
    const ctx = { m, recipe: { id: m.id }, imgUrl: null, frame: null, tight: density !== 'normal', density };
    host.innerHTML = cont ? pvPage(ctx, { first: false, n: 2, total: 2, ing: [], steps: pvStepUnits(m.steps).slice(3), extras: pvExtrasUnits(m, 'off') })
      : pvPage(ctx, { first: true, n: 1, total: 1, ing: pvIngredientUnits(m.ingredients), steps: pvStepUnits(m.steps), extras: pvExtrasUnits(m, 'off') });
    document.body.appendChild(host);
    return true;
  };
  return Object.keys(models);
}"""

MEASURE = r"""() => {
  const page = document.querySelector('#pvG .pv-page');
  const MM = 96 / 25.4, pt = (el) => el ? Math.round(parseFloat(getComputedStyle(el).fontSize) * 0.75 * 10) / 10 : null;
  const cs = (sel) => { const e = page.querySelector(sel); return e ? getComputedStyle(e) : null; };
  const rgb = (c) => c;
  const step = page.querySelector('.pv-step'), no = page.querySelector('.pv-step-no');
  const groups = Array.from(page.querySelectorAll('.pp-groups > .pp-group'));
  const wide = page.querySelector('.pp-group[data-fullwidth]');
  const panel = page.querySelector('.pv-ing-panel');
  const hidden = Array.from(page.querySelectorAll('*')).filter((e) => { const s = getComputedStyle(e); return s.overflow === 'hidden' || s.overflowY === 'hidden' || s.textOverflow === 'ellipsis' || (s.transform !== 'none' && /scale/.test(e.style.transform || '')); }).map((e) => e.className);
  const ings = Array.from(page.querySelectorAll('.pv-ing'));
  const wideRows = wide ? Array.from(wide.querySelectorAll('.pv-ing')).map((r) => Math.round(r.getBoundingClientRect().left)) : [];
  return {
    density: page.dataset.density, bg: getComputedStyle(page).backgroundColor, ink: getComputedStyle(page).color,
    title: page.querySelector('.pv-title') ? { pt: pt(page.querySelector('.pv-title')), color: cs('.pv-title').color, family: cs('.pv-title').fontFamily, weight: cs('.pv-title').fontWeight, lh: parseFloat(cs('.pv-title').lineHeight) / parseFloat(cs('.pv-title').fontSize), h: page.querySelector('.pv-title').getBoundingClientRect().height / MM } : null,
    meta: page.querySelector('.pp-meta') ? { pt: pt(page.querySelector('.pp-meta')), gap: parseFloat(cs('.pp-meta').columnGap) / MM } : null,
    cat: page.querySelectorAll('.pv-cat, .pv-head-top').length,
    body: step ? pt(page.querySelector('.pv-step-text')) : null, bodyLh: step ? parseFloat(cs('.pv-step-text').lineHeight) / parseFloat(cs('.pv-step-text').fontSize) : null,
    ing: ings.length ? { pt: pt(ings[0]), lh: parseFloat(getComputedStyle(ings[0]).lineHeight) / parseFloat(getComputedStyle(ings[0]).fontSize), bg: ings.map((r) => getComputedStyle(r).backgroundColor), border: ings.map((r) => getComputedStyle(r).borderBottomWidth + getComputedStyle(r.querySelector('.pv-ing-amt') || r).borderRightWidth) } : null,
    heading: pt(page.querySelector('.pv-h')), group: pt(page.querySelector('.pv-ing-group')),
    panel: panel ? { bg: getComputedStyle(panel).backgroundColor, wave: !!panel.querySelector('.pv-wave-b') && getComputedStyle(panel.querySelector('.pv-wave-b')).display !== 'none', waveBg: panel.querySelector('.pv-wave-b') ? getComputedStyle(panel.querySelector('.pv-wave-b')).backgroundImage.slice(0, 30) : '' } : null,
    no: no ? { w: no.getBoundingClientRect().width / MM, h: no.getBoundingClientRect().height / MM, radius: getComputedStyle(no).borderTopLeftRadius, border: parseFloat(getComputedStyle(no).borderTopWidth), pt: pt(no) } : null,
    stepPad: step ? parseFloat(getComputedStyle(page.querySelectorAll('.pv-step')[1]).paddingTop) / MM : null,
    groups: groups.map((g) => ({ w: g.getBoundingClientRect().width / MM, full: g.hasAttribute('data-fullwidth'), one: g.hasAttribute('data-onecol') })),
    groupCols: page.querySelector('.pp-groups') ? getComputedStyle(page.querySelector('.pp-groups')).gridTemplateColumns.split(' ').length : 0,
    cols3: !!page.querySelector('.pp-groups.pv-ing-cols3'),
    wideRows: new Set(wideRows).size,
    source: page.querySelector('.pv-source') ? pt(page.querySelector('.pv-source-text')) : null,
    sourceAfterSteps: (() => { const s = page.querySelector('.pv-source'), st = page.querySelector('.pv-steps'); return !!(s && st && !st.contains(s) && (st.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING)); })(),
    cont: page.querySelector('.pv-cont-head') ? { pt: pt(page.querySelector('.pv-cont-head span')), label: page.querySelector('.pv-cont-head i').textContent } : null,
    tomato: page.querySelector('.pv-tomato') ? getComputedStyle(page.querySelector('.pv-tomato')).display : 'none',
    hidden, overflowX: page.scrollWidth > page.clientWidth + 1,
  };
}"""

PHOTO = r"""(tplId) => { pdfSetContext(tplId, '', '', true); const html = pvPhotoHtml('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', { w: 56, h: 42, bw: 58, bh: 42 });
  const d = document.createElement('div'); d.className = 'pv-page pv-recipe ' + pdfTemplateById(tplId).cls; d.innerHTML = html; document.body.appendChild(d);
  const w = d.querySelector('.pv-photo-wrap'), r = w.getBoundingClientRect(), MM = 96 / 25.4; const out = { w: r.width / MM, h: r.height / MM, blob: !!d.querySelector('.pv-blob'), fit: getComputedStyle(d.querySelector('img')).objectFit, radius: getComputedStyle(d.querySelector('.pv-photo')).borderTopLeftRadius };
  d.remove(); return out; }"""

near = lambda a, b, t=0.15: a is not None and abs(a - b) <= t

async def main():
    async with async_playwright() as p:
        b, c = await open_ctx(p, 1000, 900); page = await c.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page)
        await page.evaluate("""async () => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'pdf-print.css'; document.head.appendChild(l); await new Promise((r) => { l.onload = r; l.onerror = r; }); }""")
        await page.evaluate(SETUP)
        for tpl in ('pur', 'prise-pop'):
            pop = tpl == 'prise-pop'
            await page.evaluate("(t) => { pdfSetContext(t, '', '', true); return ensureFontsReadyForPdf(); }", tpl)
            for dens in ('normal', 'compact', 'compact-columns'):
                await page.evaluate("([k, t, d]) => __gr(k, t, d)", ['sloppy', tpl, dens])
                await page.evaluate("document.fonts.ready"); await page.wait_for_timeout(40)
                r = await page.evaluate(MEASURE)
                T = f'[{tpl}/{dens}] '
                check(T + 'data-density auf der Seite', r['density'] == dens, r['density'])
                check(T + 'Papier und Tinte', r['bg'] == ('rgb(255, 253, 247)' if pop else 'rgb(255, 255, 255)') and r['ink'] == 'rgb(37, 39, 32)', r['bg'] + ' ' + r['ink'])
                tt = r['title']
                want_t = 28 if dens != 'normal' else (32 if pop else 30)
                check(T + f'Titel {want_t} pt', near(tt['pt'], want_t), str(tt['pt']))
                if pop: check(T + 'Titel Lilita One, Tomatenrot, Zeilenhöhe 1.06', 'Lilita One' in tt['family'] and tt['color'] == 'rgb(185, 59, 44)' and near(tt['lh'], 1.06, .01), str(tt))
                else: check(T + 'Titel Public Sans fett, ohne Lilita One', 'Public Sans' in tt['family'] and 'Lilita' not in tt['family'] and int(tt['weight']) >= 700, str(tt))
                check(T + 'Metadaten 10.5 pt, 6 mm Abstand', near(r['meta']['pt'], 10.5) and near(r['meta']['gap'], 6, .1), str(r['meta']))
                check(T + 'keine Kategorie im PDF', r['cat'] == 0)
                check(T + 'Fliesstext 11 pt / 1.45 (in jeder Dichte)', near(r['body'], 11) and near(r['bodyLh'], 1.45, .01), f"{r['body']} {r['bodyLh']}")
                check(T + 'Zutaten 10.5 pt / 1.38 (in jeder Dichte)', near(r['ing']['pt'], 10.5) and near(r['ing']['lh'], 1.38, .01), str(r['ing']['pt']))
                check(T + 'Zutatenzeilen ohne Zellkästchen, Zebra, Raster', all(x == 'rgba(0, 0, 0, 0)' for x in r['ing']['bg']) and all(x == '0px0px' for x in r['ing']['border']), str(set(r['ing']['bg'])) + str(set(r['ing']['border'])))
                check(T + 'Zutatenfläche ' + ('#FFE181 mit SVG-Welle' if pop else '#F0F3ED ohne Welle'), r['panel']['bg'] == ('rgb(255, 225, 129)' if pop else 'rgb(240, 243, 237)') and r['panel']['wave'] == pop and (not pop or 'svg' in r['panel']['waveBg']), str(r['panel']))
                want_h = (15 if dens != 'normal' else (17 if pop else 16))
                check(T + f'Abschnittstitel {want_h} pt', near(r['heading'], want_h), str(r['heading']))
                check(T + 'Gruppentitel ' + ('12.5' if pop else '11.5') + ' pt', near(r['group'], 12.5 if pop else 11.5), str(r['group']))
                n = r['no']
                if pop:
                    d = 7.5 if dens != 'normal' else 10
                    check(T + f'Nummernkreis {d} mm', near(n['w'], d, .2) and near(n['h'], d, .2) and n['radius'] == '50%' and n['border'] > 0, str(n))
                else:
                    check(T + 'Nummern schlicht ohne Kreis', n['border'] == 0 and n['radius'] in ('0px', ''), str(n))
                if dens == 'compact-columns':
                    check(T + 'drei Zutatengruppenspalten, keine breite Gruppe', r['cols3'] and r['groupCols'] == 3 and not any(g['full'] for g in r['groups']), str(r['groups']))
                else:
                    check(T + 'zwei Spalten, dritte Gruppe breit und zweispaltig', r['groupCols'] == 2 and r['groups'][2]['full'] and not r['groups'][2]['one'] and r['wideRows'] == 2 and r['groups'][2]['w'] > 1.8 * r['groups'][0]['w'], str(r['groups']) + ' ' + str(r['wideRows']))
                check(T + 'Quelle 9 pt, eigener Bereich nach den Schritten', near(r['source'], 9) and r['sourceAfterSteps'], str(r['source']))
                check(T + 'kein overflow:hidden, keine Ellipse, keine Skalierung', not r['hidden'], str(r['hidden'][:3]))
                check(T + 'kein waagrechter Überlauf', not r['overflowX'])
                # Fortsetzungsseite
                await page.evaluate("([k, t, d]) => __gr(k, t, d, true)", ['sloppy', tpl, dens])
                await page.wait_for_timeout(30)
                r = await page.evaluate(MEASURE)
                check(T + 'Fortsetzung: kleiner Titel ' + ('15' if pop else '13') + ' pt, Marke «Fortsetzung · 2 / 2»', near(r['cont']['pt'], 15 if pop else 13) and r['cont']['label'] == 'Fortsetzung · 2 / 2', str(r['cont']))
                check(T + 'Fortsetzung: gleiche Fliesstextgrösse', near(r['body'], 11))
                if dens == 'normal': check(T + 'Fortsetzung: Schritte mit 4 mm Innenabstand', near(r['stepPad'], 4, .05), str(r['stepPad']))
                check(T + 'Fortsetzung: Tomate nur bei Prise Pop', (r['tomato'] != 'none') == pop, r['tomato'])
            # lange Zeilen: breite Gruppe einspaltig; langer Titel bricht um und der Kopf waechst (keine Verkleinerung)
            await page.evaluate("([k, t, d]) => __gr(k, t, d)", ['lang', tpl, 'normal'])
            r = await page.evaluate(MEASURE)
            check(f'[{tpl}] lange Zeilen: breite Gruppe einspaltig', r['groups'][2]['full'] and r['groups'][2]['one'], str(r['groups']))
            check(f'[{tpl}] langer Titel: gleiche Grösse, umbrochen (Kopf wächst)', near(r['title']['pt'], 32 if pop else 30) and r['title']['h'] > 20, str(r['title']))
            ph = await page.evaluate(PHOTO, tpl)
            if tpl == 'prise-pop':   # v87 (Punkt 15): einheitliche Fotobox 44 × 29 mm, Foto fuellt die Box (vor dem Rastern zugeschnitten), 2 mm Rundung
                check(f'[{tpl}] Foto einheitlich 44 × 29 mm, cover, ohne Farbform', near(ph['w'], 44, .3) and near(ph['h'], 29, .3) and not ph['blob'] and ph['fit'] == 'cover' and near(float(ph['radius'].replace('px', '')) * 25.4 / 96, 2, .1), str(ph))
            else:
                check(f'[{tpl}] Foto in 58 × 42 mm, contain, ohne Farbform und Maske', near(ph['w'], 58, .3) and near(ph['h'], 42, .3) and not ph['blob'] and ph['fit'] == 'contain' and ph['radius'] == '0px', str(ph))
        st = await page.evaluate("() => [pdfTemplateById('pur').fonts.join(','), pvPageOfText(1, 2)]")
        check('Pur lädt Public Sans (nicht mehr Carlito als Textschrift)', 'Public Sans Pur' in st[0], st[0])
        check('Seitenzählung «1 / 2» in beiden Stilen', st[1] == '1 / 2', st[1])
        check('keine JavaScript-Fehler', not errs, str(errs[:2]))
        await b.close()
    print('\nFEHLGESCHLAGEN:' if FAIL else '\nAlle Pruefungen bestanden.', FAIL or '')
    sys.exit(1 if FAIL else 0)
asyncio.run(main())
