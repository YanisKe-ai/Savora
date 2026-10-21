"""0.87.0 Gestaltung Kochbuch-PDF (pdf-templates.js, pdf-print.css), Stil «Prise Pop», Pur mitgeprueft:
  12 Hinweis-/Naehrwertkaesten direkt nach den Schritten (nicht unten an den Seitenrand geklebt)
  13 Fortsetzung: geteilter Schritt ohne kleines «n Fortsetzung ·» im Text, Marke «Fortsetzung · n / K» als ganze Pille
  14 genau EINE Seitenzaehlung in der Fusszeile (pvPageNumberMarks; im PDF nur, wenn pdf.js die Funktion aufruft)
  15 einheitliche Fotogroesse und -lage (Prise Pop 44 x 29 mm, unabhaengig von Seitenverhaeltnis und Dichte)
  16 ein Kasten fuer Hinweise und Notizen, Beschriftung oben buendig mit der ersten Textzeile, «Titel:» fett, Absaetze
  17 ausgeglichene Zutatenspalten (Kartoffelsalat: zwei Spalten statt langer Liste links und «Garnitur» rechts)
  18 Kopfzeile: alle Zeitangaben bleiben zusammen
Geometrie wird im Browser an echten Seiten-HTML gemessen (feste Messung, plattformunabhaengig), dazu ein echtes Kochbuch-PDF
(Hirnkost) mit pdftotext und der Rasterpruefung aus pdf_harness (Text angeschnitten; mit SAVORA_PDF_TEXT_SHIFT_MM auch Linux)."""
import asyncio, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pdf_harness as H   # startet den Testserver (common)
from pdf_hirnkost_fixture import hirnkost_session_setup
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

GEO_JS = r"""(tpl) => {
  const MM = 96 / 25.4, out = {};
  pdfSetContext(tpl, 'Hirnkost', '', true);
  const rec = (id) => state.recipes.find((r) => r.id === id);
  const host = document.createElement('div'); host.style.cssText = 'position:absolute;left:-3000px;top:0;width:210mm'; document.body.appendChild(host);
  const page = (id, opts, img) => { const r = rec(id); const m = pdfBuildModel(r, null, {}); host.innerHTML = pvRecipePage(m, r, img || null, opts || {}, 'off'); return host.querySelector('.pv-page'); };
  const R = (e) => e.getBoundingClientRect();
  // 14 Seitenzahl
  out.marksBook = pvPageNumberMarks(5, { n: 2, K: 2 }, true, 12);
  out.marksSingle = pvPageNumberMarks(2, { n: 2, K: 2 }, false, 2);
  // 12 + 16 Cookies: Hinweise direkt nach den Schritten, ein Kasten, Beschriftung buendig
  let p = page('hk_cookies');
  const steps = p.querySelector('.pv-steps'), ex = p.querySelector('.pv-extras');
  out.gapAfterSteps = ex && steps ? (R(ex).top - R(steps).bottom) / MM : null;
  out.boxes = p.querySelectorAll('.pv-tips, .pv-notes').length;
  out.more = p.querySelectorAll('.pv-extra-more').length;
  const lab = p.querySelector('.pv-notebox > .pv-label'), para = p.querySelector('.pv-notebox .pv-extra-body p');
  if (lab && para) {   // Grundlinien vergleichen: unsichtbare Marke (0 x 0, vertical-align baseline) am Anfang beider Zeilen
    const mk = () => { const i = document.createElement('i'); i.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline'; return i; };
    const a = mk(), b = mk(); lab.insertBefore(a, lab.firstChild); para.insertBefore(b, para.firstChild);
    out.labelDelta = (R(a).top - R(b).top) / MM; a.remove(); b.remove(); }
  out.tipTitles = Array.from(p.querySelectorAll('.pv-notebox .pv-note-title')).map((b) => b.textContent);
  // 16 Bulgogi/Karamell: Notizen gegliedert
  p = page('hk_karamell');
  out.karParas = p.querySelectorAll('.pv-notebox p').length; out.karHeads = Array.from(p.querySelectorAll('.pv-note-head')).map((b) => b.textContent);
  out.karBoxes = p.querySelectorAll('.pv-tips, .pv-notes').length;
  // Hinweise UND Notizen: ein Kasten mit zwei Beschriftungen
  const mm = pdfBuildModel(Object.assign(emptyRecipe(), { id: 'x', title: 'X', servings: 2, ingredients: [{ amount: '1', unit: 'g', name: 'Salz' }], steps: [{ text: 'Mischen.' }, { text: 'Tipp: Kalt servieren.' }], notes: 'Eigene Notiz.\nZweite Zeile.' }), null, {});
  const h2 = document.createElement('div'); h2.innerHTML = pvExtrasHtml(mm, 'off');
  out.both = { boxes: h2.querySelectorAll('.pv-tips, .pv-notes').length, labels: Array.from(h2.querySelectorAll('.pv-label')).map((e) => e.textContent) };
  // 15 Foto: Quer- und Hochformat gleich gross, auch in kompakter und dichter Planung
  const img = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  out.photos = [[{ w: 58, h: 38.7, bw: 58, bh: 42 }, 'normal'], [{ w: 18.7, h: 28, bw: 44, bh: 28 }, 'compact'], [{ w: 24, h: 24, bw: 38, bh: 24 }, 'compact']].map(([frame, density], k) => {
    const pg = page('hk_sloppy', { frame, density, dense: k === 2 }, img); const w = pg.querySelector('.pv-photo-wrap'); const r = R(w), pr = R(pg);
    return { w: Math.round(r.width / MM * 10) / 10, h: Math.round(r.height / MM * 10) / 10, top: Math.round((r.top - pr.top) / MM * 10) / 10, right: Math.round((pr.right - r.right) / MM * 10) / 10 };
  });
  // 18 Kopfzeile Kartoffelsalat: Zeiten in einer Gruppe
  p = page('hk_kartoffelsalat');
  const times = p.querySelector('.pp-meta .pp-times');
  out.times = times ? Array.from(times.children).map((e) => e.textContent) : null;
  const tr = times ? Array.from(times.children).map((e) => Math.round(R(e).top)) : [];
  out.timesOneLine = tr.length > 0 && tr.every((t) => t === tr[0]);
  // 17 Zutatenspalten
  const cols = Array.from(p.querySelectorAll('.pp-stack > .pp-col')).map((c) => {
    const kids = Array.from(c.querySelectorAll('.pv-ing, .pv-ing-group')); if (!kids.length) return 0;
    return (R(kids[kids.length - 1]).bottom - R(c).top) / MM; });
  out.kartCols = cols;
  out.sloppyStack = !!page('hk_sloppy').querySelector('.pp-stack');
  out.mantiStack = !!page('hk_manti').querySelector('.pp-stack');
  // 13 geteilter Schritt
  host.innerHTML = pvContinuationPage(pdfBuildModel(rec('hk_sloppy'), null, {}), [], [{ html: '<div class="pv-step" data-cont="1"><span class="pv-step-no">2</span><span class="pv-step-text"><span class="pv-cont">Fortsetzung · </span>Rest des Schritts.</span></div>' }], '', false, false, 2, 2);
  const st = host.querySelector('.pv-step[data-cont]');
  out.contStep = { noVis: getComputedStyle(st.querySelector('.pv-step-no')).visibility, contDisp: getComputedStyle(st.querySelector('.pv-cont')).display, text: st.innerText.trim() };
  const badge = host.querySelector('.pv-cont-head i'); const bcs = getComputedStyle(badge);
  out.badge = { text: badge.textContent, h: R(badge).height / MM, radius: parseFloat(bcs.borderTopLeftRadius) / MM, overflow: bcs.overflow };
  host.remove(); return out; }"""


async def main():
    out = os.path.join(H.OUT, 'v87_design'); os.makedirs(out, exist_ok=True)
    async with H.PdfSession(out) as s:
        await hirnkost_session_setup(s)
        for tpl in ('prise-pop', 'pur'):
            T = f'[{tpl}] '
            g = await s.page.evaluate(GEO_JS, tpl)
            if tpl == 'prise-pop':
                check(T + '14 Kochbuch: genau eine Seitenzahl in der Fusszeile («Seite X»)', [m['text'] for m in g['marksBook']] == ['Seite 5'], str(g['marksBook']))
                check(T + '14 Einzelrezept: genau eine Zaehlung «n / K»', [m['text'] for m in g['marksSingle']] == ['2 / 2'], str(g['marksSingle']))
            check(T + '12 Hinweise direkt nach den Schritten (Abstand <= 6 mm)', g['gapAfterSteps'] is not None and 0 <= g['gapAfterSteps'] <= 6, str(g['gapAfterSteps']))
            check(T + '16 Cookies: ein Hinweiskasten fuer beide Absaetze', g['boxes'] == 1 and g['more'] == 0, f"{g['boxes']} Kaesten, {g['more']} Einzelabsaetze")
            check(T + '16 Beschriftung oben buendig mit der ersten Textzeile (Grundlinie +- 1 mm)', g.get('labelDelta') is not None and abs(g['labelDelta']) <= 1.0, str(g.get('labelDelta')))
            check(T + '16 «Titel:» in Hinweisen fett', 'Haltbarkeit:' in g['tipTitles'], str(g['tipTitles']))
            check(T + '16 Karamell: Notizen in Absaetzen mit Zwischentiteln, ein Kasten', g['karBoxes'] == 1 and g['karParas'] >= 6 and any('Allergene' in h for h in g['karHeads']), f"{g['karParas']} Absaetze, {g['karHeads']}")
            check(T + '16 Hinweise und Notizen zusammen: ein Kasten, zwei Beschriftungen', g['both']['boxes'] == 1 and [l.strip() for l in g['both']['labels']] == ['Hinweis', 'Notizen'], str(g['both']))
            check(T + '18 Kartoffelsalat: drei Zeitangaben in einer Gruppe auf einer Zeile', g['times'] and len(g['times']) == 3 and g['timesOneLine'], str(g['times']))
            check(T + '13 Folgeteil eines Schritts ohne Nummer und ohne «Fortsetzung ·» im Text', g['contStep']['noVis'] == 'hidden' and g['contStep']['contDisp'] == 'none' and 'Fortsetzung' not in g['contStep']['text'], str(g['contStep']))
            if tpl == 'prise-pop':
                ph = g['photos']
                check(T + '15 Foto einheitlich 44 x 29 mm an derselben Stelle (quer, hoch, kompakt, dicht)', all(abs(p['w'] - 44) <= .2 and abs(p['h'] - 29) <= .2 for p in ph) and len({(p['top'], p['right']) for p in ph}) == 1, str(ph))
                kc = g['kartCols']
                check(T + '17 Kartoffelsalat: zwei ausgeglichene Zutatenspalten (Unterschied < 6 mm)', len(kc) == 2 and abs(kc[0] - kc[1]) < 6, str([round(x, 1) for x in kc]))
                check(T + '17 ruhige Gruppenraster bleiben (Sloppy Joe, Manti)', not g['sloppyStack'] and not g['mantiStack'], f"{g['sloppyStack']} {g['mantiStack']}")
                b = g['badge']
                check(T + '13 Marke «Fortsetzung · 2 / 2» als ganze Pille (Rundung = halbe Hoehe, kein Beschnitt)', b['text'] == 'Fortsetzung · 2 / 2' and abs(b['radius'] - b['h'] / 2) <= .15 and b['overflow'] == 'visible', str(b))

        # --- echtes Kochbuch-PDF (Prise Pop) ---
        ex = await s.book('hirnkost', 'prise-pop', 'compact', datei='hirnkost_prise-pop')
        check('PDF erzeugt', bool(ex.pdf), str(s.fehler[:2]))
        if ex.pdf:
            n = ex.seiten()
            imgs = [(round(im['w'], 1), round(im['h'], 1), round(im['x'], 1), round(im['y'], 1)) for sec in ex.dom for im in sec.get('images', []) if not im['cover'] and sec.get('kind') == 'recipe']
            check('15 PDF: alle Rezeptfotos gleich gross und an derselben Stelle', len(imgs) == 7 and len(set(imgs)) == 1, str(sorted(set(imgs))))
            eine = await s.page.evaluate("() => String(pdfAddPageNumbers).includes('pvPageNumberMarks')")
            doppelt = []
            for i in range(3, n + 1):
                lines = [l.strip() for l in ex.text(raw=False, first=i, last=i).splitlines() if l.strip()]
                foot = ' '.join(lines[-3:])
                if eine and re.search(r'(?<!· )\b\d+ / \d+\b', foot): doppelt.append(i)
                if eine and f'Seite {i}' not in foot: doppelt.append(f'{i}: Seite fehlt')
            if eine: check('14 PDF: Fusszeile nur «Seite X», keine zweite Zaehlung', not doppelt, str(doppelt))
            else: print('Info 14: pdf.js ruft pvPageNumberMarks (noch) nicht auf, Fusszeile im PDF unveraendert (Integration)')
            text = ex.text()
            check('13 PDF: Fortsetzungsseiten tragen «Fortsetzung · n / K»', bool(re.search(r'Fortsetzung · 2 / \d', text)), '')
            rand = [f for f in H.pruefe_raender(ex) if f['id'] in ('text_angeschnitten', 'rand_tinte', 'text_beschnitten')]
            shift = os.environ.get('SAVORA_PDF_TEXT_SHIFT_MM', '0')
            check(f'PDF: kein angeschnittener Text (Rasterpruefung, Textversatz {shift} mm)', not rand, str(rand[:4]))
        check('Keine Seitenfehler', not s.fehler, str(s.fehler[:3]))
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')

asyncio.run(main())
sys.exit(1 if FAIL else 0)
