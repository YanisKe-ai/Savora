"""Cover-Modell v2 (Paket C2): Migration, Anordnungen, Umbruch, Warnungen, Bildausschnitt, v1-Regression, gemeinsame Layoutfunktion.
Funktionstests im Seitenkontext mit fester Messfunktion (plattformunabhaengig), dazu Pixelproben mit echtem Canvas."""
import asyncio, json, os, sys
os.environ.setdefault('SAVORA_TEST_PORT', '8982')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

PRE = r"""
window.MEAS = (t, f) => t.length * parseFloat(/(\d+(?:\.\d+)?)px/.exec(f)[1]) * 0.5;
window.V1CASES = [
 {title:'', name:'', slogan:'', date:'2026-10-09', showDate:true, logo:true},
 {title:'Mein Kochbuch', name:'Anna Muster', slogan:'Rezepte für jeden Tag', date:'2026-10-09', showDate:true, logo:true},
 {title:'Ein sehr langer Titel mit vielen Wörtern der mehrere Zeilen braucht und fast nicht mehr passt', name:'Anna-Maria von Muster-Beispiel', slogan:'Ein ebenfalls recht langer Untertitel über Äpfel, Öl und Übergrössen', date:'2024-02-29', showDate:true, logo:true},
 {title:'Donaudampfschifffahrtsgesellschaftskapitänsmützenhersteller', name:'', slogan:'', date:'', showDate:false, logo:false},
 {title:'Titel '.repeat(60), name:'N '.repeat(30), slogan:'S '.repeat(40), date:'2026-01-02', showDate:true, logo:true},
];
window.mk = (o) => coverModelSanitize(Object.assign({ v: 2, mode: 'custom' }, o));
window.IN = (o) => Object.assign({ templateId: 'pop', title: 'Mein Kochbuch', slogan: 'Rezepte für jeden Tag', name: 'Anna Muster', date: '2026-10-09', showDate: true, logo: true }, o || {});
"""

async def main():
    async with async_playwright() as p:
        b, ctx = await open_ctx(p, 390, 844, 'no-preference')
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(300)
        ev = page.evaluate
        await ev(PRE); await ev("() => coverEnsureFonts()")

        # ---- 1. v1-Regression: Layouts der zehn Vorlagen pixel-/zahlengleich zum Stand origin/main (0.76.0)
        snap = json.load(open(os.path.join(TESTS, 'data', 'cover_v1_layouts.json')))
        now = json.loads(await ev("() => JSON.stringify(COVER_TEMPLATES.filter(t => ['pop','lieblingsbuch','tomate','salbei','nachtkueche','citrus','bistro','garten','sonnenkueche','ofenglueck'].includes(t.id)).flatMap(t => V1CASES.map((c, i) => ({ id: t.id, case: i, layout: coverLayout(Object.assign({templateId: t.id}, c), MEAS) }))))"))
        check('v1: 50 Layouts (10 Vorlagen x 5 Eingaben) identisch zum Schnappschuss', len(snap) == 50 and snap == now)
        same = await ev("() => COVER_TEMPLATES.every(t => V1CASES.every(c => { const a = coverLayout(Object.assign({templateId: t.id}, c), MEAS); const b = coverLayout(Object.assign({templateId: t.id, v2: coverModelFromLegacy({ cover: { v: 1, templateId: t.id } })}, c), MEAS); return JSON.stringify(a) === JSON.stringify(b); }))")
        check('Schlichte Vorlage mit v2-Modell nimmt den v1-Pfad (identisch)', same)

        # ---- 2. Migration
        r = await ev("""() => {
          const legacy = { v: 1, templateId: 'tomate', date: '2025-12-24', showDate: false };
          const copy = JSON.stringify(legacy);
          const m = coverModelFromLegacy({ cover: legacy, title: 'X' });
          const m2 = coverModelSanitize(m), m3 = coverModelSanitize(m2);
          const s = coverSanitizeConfig(Object.assign({}, m, { fields: { title: { x: 0.2 } } }), false);
          return { copyOk: JSON.stringify(legacy) === copy, m, idem: JSON.stringify(m2) === JSON.stringify(m3) && JSON.stringify(m) === JSON.stringify(m2), keepV2: s.v === 2 && s.fields.title.x === 0.2,
                   plain: coverModelIsPlainTemplate(m), none: coverModelFromLegacy({}).templateId, undefCfg: coverModelFromLegacy(null).v };
        }""")
        check('Migration v1 -> v2: Vorlage, Datum, Datum-Schalter bleiben', r['m']['templateId'] == 'tomate' and r['m']['date'] == '2025-12-24' and r['m']['showDate'] is False and r['m']['mode'] == 'template' and r['m']['v'] == 2, json.dumps(r['m']))
        check('Migration schreibt nichts und ist idempotent', r['copyOk'] and r['idem'] and r['plain'])
        check('coverSanitizeConfig stuft v2 nie auf v1 zurück', r['keepV2'])
        check('Leere/fehlende Konfiguration ergibt gültige Standardansicht', r['none'] == 'pop' and r['undefCfg'] == 2)
        r = await ev("""() => { const m = coverModelSanitize({ v: 2, mode: 'custom', bg: { color: '#abc' }, junk: 1, readability: 'x', arrange: 'Quatsch',
             logo: { pos: 'mitte', variant: 'rot' }, image: { id: 'cover-a-1', fit: 'zoom', cx: 9, cy: -3, zoom: 99, w: 800.4, h: 600 },
             fields: { title: { x: 9, y: -9, w: 0, fontPt: 1000, color: 'red', align: 'x', font: 'Comic Sans', text: 'a'.repeat(900), hack: 1 }, evil: { x: 1 }, subtitle: { visible: false } } });
          return { m, again: JSON.stringify(coverModelSanitize(m)) === JSON.stringify(m) }; }""")
        m = r['m']; f = m['fields']['title']
        check('Sanitize: Werte begrenzt, unbekannte Schriften/Schlüssel verworfen',
              m['bg']['color'] == '#AABBCC' and m['readability'] == 'none' and m['arrange'] == '' and m['logo'] == {'pos': 'top-right', 'variant': 'auto'} and 'evil' not in m['fields'] and 'junk' not in m
              and m['image']['fit'] == 'cover' and m['image']['cx'] == 1 and m['image']['cy'] == 0 and m['image']['zoom'] == 8 and m['image']['w'] == 800
              and f['x'] == 1.5 and f['y'] == -0.5 and f['w'] == 0.05 and f['fontPt'] == 200 and 'color' not in f and 'align' not in f and 'font' not in f and len(f['text']) == 600 and m['fields']['subtitle'] == {'visible': False}, json.dumps(m))
        check('Sanitize idempotent', r['again'])
        r = await ev("() => ({ fonts: COVER_FONT_NAMES, ok: COVER_FONT_NAMES.every(n => coverModelSanitize({ fields: { title: { font: n } } }).fields.title.font === n) })")
        check('Erlaubte Schriften: Sofia Sans Extra Condensed plus drei weitere', 'Sofia Sans Extra Condensed' in r['fonts'] and len([x for x in r['fonts'] if x != 'Roboto']) == 4 and r['ok'], str(r['fonts']))
        r = await ev("""async () => { await coverEnsureFonts(); return COVER_FONT_NAMES.map(n => [n, document.fonts.check(`400 20px '${n}'`) && Array.from(document.fonts).some(f => f.family.replace(/['"]/g, '') === n && f.status === 'loaded')]); }""")
        check('coverEnsureFonts lädt alle erlaubten Schriften', all(x[1] for x in r), str(r))
        r = await ev("() => [coverContrast('#000000', '#FFFFFF'), coverContrast('#FFFFFF', '#FFFFFF'), coverContrast('#777', '#fff')]")
        check('WCAG-Kontrast', abs(r[0] - 21) < 0.01 and abs(r[1] - 1) < 0.001 and 4.4 < r[2] < 4.5, str(r))

        # ---- 3. Anordnungen
        res = await ev("""() => {
          const out = [];
          for (const mode of ['custom', 'template']) for (const name of COVER_ARRANGEMENTS) for (const logo of ['top-right', 'bottom-right']) {
            const base = mk({ mode, templateId: 'tomate', logo: { pos: logo, variant: 'auto' }, fields: { title: { color: '#B93B2C' }, name: { fontPt: 16 } } });
            const inp = IN({ title: 'Familienrezepte aus Grossmutters Küche', v2: base });
            const m = coverApplyArrangement(base, name, inp, MEAS);
            const L = coverLayout(Object.assign({}, inp, { v2: m }), MEAS);
            const inside = L.blocks.every(b => b.x >= 0 && b.x + b.w <= 1 + 1e-9 && b.y >= 0 && b.y + b.h <= 1 + 1e-9);
            let ov = false; for (let i = 0; i < L.blocks.length; i++) for (let j = i + 1; j < L.blocks.length; j++) { const a = L.blocks[i], c = L.blocks[j]; if (a.y < c.y + c.h - 1e-6 && c.y < a.y + a.h - 1e-6) ov = true; }
            out.push({ mode, name, logo, inside, ov, arr: m.arrange, warn: L.warnings.map(w => w.kind), color: m.fields.title.color, fp: m.fields.name.fontPt, n: L.blocks.length, ys: L.blocks.map(b => b.y), align: L.blocks[0].align });
          }
          return out; }""")
        check('Alle 6 Anordnungen (je custom/Vorlage, Logo oben/unten): Felder innerhalb 0..1', all(x['inside'] for x in res) and len(res) == 24)
        check('Anordnungen: Felder überlappen nicht, keine Warnungen', all(not x['ov'] and not x['warn'] for x in res), str([x for x in res if x['ov'] or x['warn']][:2]))
        check('Anordnungen: Farben und Schrift bleiben, Name der Anordnung gespeichert', all(x['color'] == '#B93B2C' and x['fp'] == 16 and x['arr'] == x['name'] and x['n'] == 3 for x in res))
        top = [x for x in res if x['mode'] == 'custom' and x['logo'] == 'top-right']
        ys = {x['name']: x['ys'][0] for x in top}
        check('Anordnungen: oben < mittig < unten', ys['Oben links'] < ys['Mittig'] < ys['Unten links'] and ys['Oben mittig'] == ys['Oben links'] and ys['Unten mittig'] == ys['Unten links'], str(ys))
        check('Ausrichtung: links bzw. mittig', next(x for x in top if x['name'] == 'Oben links')['align'] == 'left' and next(x for x in top if x['name'] == 'Unten mittig')['align'] == 'center')
        r = await ev("""() => { const base = mk({ fields: { title: { y: 0.3, x: 0.2 } } }); const inp = IN({ v2: base });
          const a = coverApplyArrangement(base, 'Mittig', inp, MEAS), z = coverApplyArrangement(a, 'Frei platzieren', IN({ v2: a }), MEAS);
          const La = coverLayout(Object.assign({}, inp, { v2: a }), MEAS), Lz = coverLayout(Object.assign({}, inp, { v2: z }), MEAS);
          return { same: JSON.stringify(La.blocks.map(b => [b.x, b.y, b.w])) === JSON.stringify(Lz.blocks.map(b => [b.x, b.y, b.w])), arr: z.arrange,
                   undo: JSON.stringify(base) === JSON.stringify(coverModelSanitize(base)), noText: IN().title }; }""")
        check('«Frei platzieren» friert die aktuelle Anordnung ein; Eingabemodell bleibt unverändert (rückgängig machbar)', r['same'] and r['arr'] == 'Frei platzieren' and r['undo'])

        # ---- 4. Umbruch, lange Texte
        r = await ev("""() => {
          const long = coverLayout(IN({ title: 'Familienrezepte aus Grossmutters Küche mit Äpfeln, Öl und Crème brûlée für alle Tage', v2: mk({ fields: { title: { fontPt: 60 } } }) }), MEAS);
          const b = long.blocks[0];
          const word = 'Donaudampfschifffahrtsgesellschaftskapitänsmützenhersteller';
          const lw = coverLayout(IN({ title: word, slogan: '', name: '', v2: mk({ fields: { title: { fontPt: 60 } } }) }), MEAS);
          const huge = coverLayout(IN({ title: 'Wort '.repeat(80), v2: mk({ fields: { title: { fontPt: 60 } } }) }), MEAS);
          const um = coverLayout(IN({ title: 'Äöü Éàè Ñandú Žižek Crème', slogan: '', name: '', v2: mk({ fields: { title: { fontPt: 40, w: 0.3 } } }) }), MEAS);
          return { lines: b.lines, h: b.h, ell: [long, lw, huge, um].some(L => L.blocks.some(x => x.lines.some(l => /…|\\.\\.\\./.test(l)))), lwLines: lw.blocks[0].lines, lwKinds: lw.warnings.map(w => w.kind + ':' + w.fieldId),
                   hugeKinds: huge.warnings.map(w => w.kind), hugeLines: huge.blocks[0].lines.length, umJoin: um.blocks[0].lines.join(' ').replace(/ /g, ''), lineH: b.lineHeightPx, size: b.sizePx,
                   maxW: Math.max(...b.lines.map(l => MEAS(l, '800 ' + b.sizePx + 'px X'))) / 794, w: b.w, huge1: huge.blocks[0].sizePx }; }""")
        check('Langer Titel bricht wortweise um (mehrere Zeilen, keine Zeile breiter als das Feld)', len(r['lines']) >= 2 and r['maxW'] <= r['w'] + 1e-9, str(r['lines']))
        check('Höhe aus Zeilenzahl und Schriftmetrik', abs(r['h'] - len(r['lines']) * r['lineH'] / 1123) < 1e-9 and abs(r['size'] - 80) < 1e-9)
        check('Sehr langes Wort: an Zeichengrenze geteilt, vollständig erhalten, cut-Warnung', ''.join(r['lwLines']) == 'Donaudampfschifffahrtsgesellschaftskapitänsmützenhersteller' and len(r['lwLines']) > 1 and 'cut:title' in r['lwKinds'], str(r['lwKinds']))
        check('Keine Auslassungspunkte, Schrift wird nie still verkleinert', not r['ell'] and r['huge1'] == 80)
        check('Text über die Seite hinaus: cut-Warnung', 'cut' in r['hugeKinds'] and r['hugeLines'] > 10, str(r['hugeKinds']))
        check('Umlaute und Akzente bleiben beim Umbruch erhalten', r['umJoin'] == 'ÄöüÉàèÑandúŽižekCrème', r['umJoin'])

        # ---- 5. Warnungen
        r = await ev("""() => {
          const k = (o, i) => coverLayout(IN(Object.assign({ v2: mk(o) }, i || {})), MEAS).warnings.map(w => w.kind + ':' + w.fieldId);
          return {
            outside: k({ fields: { title: { x: 0.5, w: 0.8 } } }), outsideTop: k({ fields: { title: { y: -0.1 } } }),
            overlap: k({ fields: { title: { y: 0.3 }, subtitle: { y: 0.3 } } }), overLogo: k({ fields: { title: { y: 0.06 } } }),
            overImg: k({ image: { id: 'cover-a-1', fit: 'cover', w: 3000, h: 4000 }, fields: { title: { y: 0.3 }, subtitle: { y: 0.3 } } }, {}).filter(x => x.startsWith('overlap')),
            unread: k({ fields: { title: { color: '#FFFFFF' } } }), unreadDark: k({ bg: { color: '#252720' }, fields: { title: { color: '#333333' } } }),
            unreadPanel: k({ readability: 'panel', fields: { title: { color: '#FFFFFF' } } }), fine: k({}), fineDark: k({ bg: { color: '#252720' } }),
            low: k({ image: { id: 'cover-a-1', fit: 'cover', w: 800, h: 1000 } }), lowOk: k({ image: { id: 'cover-a-1', fit: 'cover', w: 3000, h: 4000 } }),
            lowContain: k({ image: { id: 'cover-a-1', fit: 'contain', w: 1000, h: 800 } }),
            msg: coverLayout(IN({ v2: mk({ fields: { title: { color: '#FFFFFF' } } }) }), MEAS).warnings.find(w => w.kind === 'unreadable').message,
          }; }""")
        check('outside: Feld ausserhalb der Seite', 'outside:title' in r['outside'] and 'outside:title' in r['outsideTop'], str(r['outside']))
        check('overlap: Textfelder überlappen / Feld über dem Logo', any(x.startswith('overlap') for x in r['overlap']) and any(x.startswith('overlap') for x in r['overLogo']), str(r['overLogo']))
        check('overlap bleibt auch mit Hintergrundbild eine Warnung, Bild selbst nie (gestaltete Überlagerung mit Bild möglich)', all('image' not in x for x in r['overImg']))
        check('unreadable: helle Schrift auf Papier, dunkle auf dunkel; nicht bei Standard', 'unreadable:title' in r['unread'] and 'unreadable:title' in r['unreadDark'] and not any('unreadable' in x for x in r['fine'] + r['fineDark']), str(r['fine']) + str(r['fineDark']))
        check('unreadable mit Textfläche (Papier) weiter erkannt; Meldung wie im Auftrag', 'unreadable:title' in r['unreadPanel'] and r['msg'] == 'Der Text ist hier schwer lesbar. Wähle eine andere Farbe oder aktiviere eine Textfläche.')
        check('lowres: Bild unter 150 ppi, genügend Pixel ohne Warnung, Querbild contain', 'lowres:image' in r['low'] and 'lowres:image' not in r['lowOk'] and 'lowres:image' in r['lowContain'], str(r['low']) + str(r['lowContain']))
        check('Standard-Ansicht ohne Warnungen', r['fine'] == [] and r['fineDark'] == [], str(r['fine']))

        # ---- 6. Export-Sperre
        r = await ev("""() => {
          const mkL = (o, i) => coverLayout(IN(Object.assign({ v2: mk(o) }, i || {})), MEAS);
          return { cut: coverExportBlockers(mkL({ fields: { title: { fontPt: 60 } } }, { title: 'Wort '.repeat(80) })).map(w => w.kind), out: coverExportBlockers(mkL({ fields: { title: { x: 0.5, w: 0.8 } } })).map(w => w.kind),
                   soft: coverExportBlockers(mkL({ fields: { title: { y: 0.3, color: '#FFFFFF' }, subtitle: { y: 0.3 } } })).length, ok: coverExportBlockers(mkL({})).length,
                   v1: coverExportBlockers(coverLayout({ templateId: 'pop', title: 'Wort '.repeat(80) }, MEAS)).map(w => w.kind), v1ok: coverExportBlockers(coverLayout({ templateId: 'pop', title: 'Kurz' }, MEAS)).length }; }""")
        check('coverExportBlockers: nur cut/outside sperren', r['cut'] and set(r['cut']) <= {'cut', 'outside'} and 'outside' in r['out'] and r['soft'] == 0 and r['ok'] == 0, str(r))
        check('coverExportBlockers kennt auch v1-Layouts', r['v1'] == ['cut'] and r['v1ok'] == 0, str(r['v1']))

        # ---- 7. Bildausschnitt: nie gestreckt
        r = await ev("""() => { const bad = []; let n = 0;
          for (const [w, h] of [[4000, 3000], [3000, 4000], [3000, 3000], [3000, 1000], [1000, 3000], [2480, 3508], [794, 1123], [5, 3]]) for (const fit of ['cover', 'contain']) for (const zoom of (fit === 'cover' ? [1, 1.7, 8] : [0.3, 0.6, 1])) for (const [cx, cy] of [[0.5, 0.5], [0, 0], [1, 1], [0.2, 0.9]]) {
            const L = coverLayout(IN({ v2: mk({ image: { id: 'cover-x-1', fit, cx, cy, zoom, w, h } }) }), MEAS), im = L.image; n++;
            const sa = im.src.w / im.src.h, da = (im.dst.w * 794) / (im.dst.h * 1123);
            const inside = im.src.x >= -1e-6 && im.src.y >= -1e-6 && im.src.x + im.src.w <= w + 1e-6 && im.src.y + im.src.h <= h + 1e-6 && im.dst.x >= -1e-9 && im.dst.y >= -1e-9 && im.dst.x + im.dst.w <= 1 + 1e-9 && im.dst.y + im.dst.h <= 1 + 1e-9;
            if (Math.abs(sa - da) > 1e-6 * sa || !inside) bad.push([w, h, fit, zoom, cx, cy]);
            if (fit === 'contain' && zoom === 1 && Math.abs(Math.max(im.dst.w, im.dst.h) - 1) > 1e-9) bad.push(['fit', w, h]);
            if (fit === 'cover' && zoom === 1 && Math.abs(im.dst.w - 1) + Math.abs(im.dst.h - 1) > 1e-9) bad.push(['fill', w, h]);
          } return { n, bad }; }""")
        check('Bildrechtecke: Quell- und Zielverhältnis gleich (nie gestreckt), Ausschnitt im Bild, contain/cover', r['n'] > 150 and not r['bad'], str(r['bad'][:3]))
        r = await ev("""async () => {
          const c = document.createElement('canvas'); c.width = 200; c.height = 100; const g = c.getContext('2d'); g.fillStyle = '#FF0000'; g.fillRect(0, 0, 100, 100); g.fillStyle = '#0000FF'; g.fillRect(100, 0, 100, 100);
          const px = (cv, x, y) => Array.from(cv.getContext('2d').getImageData(Math.round(x * cv.width), Math.round(y * cv.height), 1, 1).data.slice(0, 3));
          const res = {};
          for (const fit of ['contain', 'cover']) {
            const L = coverLayout(IN({ title: '', slogan: '', name: '', showDate: false, logo: false, v2: mk({ bg: { color: '#00FF00' }, image: { id: 'cover-x-1', fit, w: 200, h: 100 } }) }), MEAS);
            const cv = document.createElement('canvas'); cv.width = 397; cv.height = 562; coverDraw(cv.getContext('2d'), L, null, 0.5, c);
            res[fit] = [px(cv, 0.25, 0.5), px(cv, 0.75, 0.5), px(cv, 0.5, 0.1), px(cv, 0.5, 0.95), px(cv, 0.25, 0.05), px(cv, 0.75, 0.95)];
          }
          const L2 = coverLayout(IN({ title: '', slogan: '', name: '', showDate: false, logo: false, v2: mk({ image: { id: 'cover-x-1', fit: 'cover' } }) }), MEAS);
          res.nosize = L2.image.src === null;
          const cv = document.createElement('canvas'); cv.width = 397; cv.height = 562; coverDraw(cv.getContext('2d'), L2, null, 0.5, c); res.nosizePx = [px(cv, 0.25, 0.5), px(cv, 0.75, 0.5)];
          return res; }""")
        check('coverDraw contain: ganzes Bild, Ränder in Hintergrundfarbe', r['contain'][0][0] > 200 and r['contain'][1][2] > 200 and r['contain'][2] == [0, 255, 0] and r['contain'][3] == [0, 255, 0], str(r['contain']))
        check('coverDraw cover: füllt die Seite proportional (links rot, rechts blau, keine Ränder)', r['cover'][0][0] > 200 and r['cover'][1][2] > 200 and r['cover'][2] != [0, 255, 0] and r['cover'][3] != [0, 255, 0] and r['cover'][4][0] > 200 and r['cover'][5][2] > 200, str(r['cover']))
        check('Ohne Pixelmasse im Modell berechnet coverDraw den Ausschnitt aus dem echten Bild', r['nosize'] and r['nosizePx'][0][0] > 200 and r['nosizePx'][1][2] > 200)

        # ---- 8. Lesbarkeit: Fläche, Verlauf, Logo
        r = await ev("""() => {
          const P = coverLayout(IN({ v2: mk({ readability: 'panel' }) }), MEAS), G = coverLayout(IN({ v2: mk({ readability: 'gradient', fields: { title: { y: 0.8 } } }) }), MEAS), N = coverLayout(IN({ v2: mk({}) }), MEAS);
          const lg = (pos, variant, o) => coverLayout(IN(Object.assign({ v2: mk({ logo: { pos, variant }, bg: { color: '#252720' } }) }, o || {})), MEAS).logo;
          return { P: P.panels, G: G.gradients, N: [N.panels.length, N.gradients.length], tr: lg('top-right', 'auto'), tl: lg('top-left', 'auto'), br: lg('bottom-right', 'dark'), none: lg('top-right', 'auto', { logo: false }) }; }""")
        check('Lesbarkeit «Textfläche»: ein abgerundetes Rechteck in Papierfarbe, 78 %, innerhalb der Seite', len(r['P']) == 1 and r['P'][0]['alpha'] == 0.78 and r['P'][0]['color'] == '#F7F4EE' and r['P'][0]['r'] > 0 and r['P'][0]['x'] >= 0 and r['P'][0]['x'] + r['P'][0]['w'] <= 1.0001, str(r['P']))
        check('Lesbarkeit «Verlauf» liegt am nahen Seitenrand; «ohne» hat keins', len(r['G']) == 1 and r['G'][0]['dir'] == 'up' and r['N'] == [0, 0], str(r['G']))
        check('Logo: Position und Variante (auto auf dunklem Grund = hell)', r['tr']['x'] == 0.65 and r['tl']['x'] < 0.1 and r['br']['y'] > 0.8 and r['tr']['variant'] == 'light' and r['tr']['ink'] == '#F7F4EE' and r['br']['ink'] == '#252720' and r['none'] is None, json.dumps(r['tr']))
        check('Logo-Proportion 3:1 in allen Positionen', abs(r['tl']['w'] * 794 / (r['tl']['h'] * 1123) - 3) < 1e-9 and abs(r['br']['w'] * 794 / (r['br']['h'] * 1123) - 3) < 1e-9)

        # ---- 9. Vorlage mit Textänderungen: Vorlagenzone als Standard
        r = await ev("""() => {
          const t = COVER_TEMPLATES.find(x => x.id === 'tomate'), base = coverLayout(IN({ templateId: 'tomate' }), MEAS);
          const L = coverLayout(IN({ templateId: 'tomate', v2: mk({ mode: 'template', templateId: 'tomate', fields: { name: { color: '#B93B2C' } } }) }), MEAS);
          const M = coverLayout(IN({ templateId: 'tomate', v2: mk({ mode: 'template', templateId: 'tomate', fields: { title: { y: 0.5, x: 0.2, align: 'center' } } }) }), MEAS);
          const T = coverLayout(IN({ templateId: 'tomate', title: 'Alt', v2: mk({ mode: 'template', templateId: 'tomate', fields: { title: { text: 'Neu' } } }) }), MEAS);
          const H = coverLayout(IN({ templateId: 'tomate', v2: mk({ mode: 'template', templateId: 'tomate', fields: { subtitle: { visible: false } } }) }), MEAS);
          return { sameGeo: JSON.stringify(base.blocks.map(b => [b.key, b.x, b.y, b.w, b.sizePx, b.lines])) === JSON.stringify(L.blocks.map(b => [b.key, b.x, b.y, b.w, b.sizePx, b.lines])), nameInk: L.blocks.find(b => b.key === 'name').ink, bg: L.background === base.background && L.bgColor === null,
                   m: M.blocks[0].y === 0.5 && M.blocks[0].x === 0.2 && M.blocks[0].lines.join() === base.blocks[0].lines.join() && M.blocks[0].sizePx === base.blocks[0].sizePx, txt: T.blocks[0].lines, hidden: H.blocks.map(b => b.key), zone: t.text.x }; }""")
        check('Vorlage + Abweichung: Standardgeometrie aus der Vorlagenzone, nur die Abweichung geändert, Hintergrund bleibt', r['sameGeo'] and r['nameInk'] == '#B93B2C' and r['bg'] and r['m'], str(r))
        check('Vorlage: eigener Text und ausgeblendetes Feld', r['txt'] == ['Neu'] and r['hidden'] == ['title', 'name'], str(r['hidden']))

        # ---- 10. Vorschau = PDF: dieselbe Layoutfunktion mit denselben Eingaben
        r = await ev("""() => {
          const cfg0 = cookbookGetRaw() || {};
          cookbookSetRaw(Object.assign({}, cfg0, { title: 'Testbuch', author: 'Tina Test', subtitle: 'Alles Gute', cover: Object.assign(coverModelSanitize({ v: 2, mode: 'custom', templateId: 'pop', date: '2026-10-09', bg: { color: '#252720' }, readability: 'panel', fields: { title: { y: 0.4 } } })) }));
          const cfg = getCookbookConfig(), html = coverPickerHtml(cfg), tmp = document.createElement('div'); tmp.innerHTML = html;
          const fromView = JSON.parse(JSON.stringify(ce.layout)), direct = coverLayout(coverInputFromConfig(cfg));
          const keep = cookbookGetRaw().cover.v;
          return { same: JSON.stringify(fromView) === JSON.stringify(JSON.parse(JSON.stringify(direct))), v: cfg.cover.v, mode: direct.mode, keep, y: direct.blocks[0].y, bg: direct.bgColor }; }""")
        check('Editor-Vorschau (coverPickerHtml) und Export nutzen dieselbe Layoutfunktion und liefern dasselbe Layout', r['same'] and r['v'] == 2 and r['mode'] == 'custom' and r['y'] == 0.4 and r['bg'] == '#252720', str(r))
        src_pdf = open(os.path.join(ROOT, 'pdf.js'), encoding='utf-8').read(); src_view = open(os.path.join(ROOT, 'views-v2.js'), encoding='utf-8').read(); src_rm = open(os.path.join(ROOT, 'recipe-model.js'), encoding='utf-8').read()
        check('pdf.js, views-v2.js und recipe-model.js bauen die Eingabe aus coverInputFromConfig; Export prüft coverExportBlockers',
              'coverLayout(coverInputFromConfig(cfgNow))' in src_pdf and 'coverExportBlockers(layout)' in src_pdf and src_view.count('coverLayout(coverInputFromConfig(cfg))') == 2 and 'coverInputFromConfig(cfg)' in src_rm)
        check('Cover-Text wird auf Canvas gezeichnet (kein html2canvas für sichtbaren Text): coverHtml legt Text nur unsichtbar ab', 'coverRenderCanvas(layout, 2, coverBg)' in src_pdf and 'cv-textlayer' in open(os.path.join(ROOT, 'cover.js'), encoding='utf-8').read())
        r = await ev("""async () => { const L = coverLayout(IN({ v2: mk({ readability: 'gradient' }) }), MEAS); const c = await coverRenderCanvas(L, 0.5); return [c.width, c.height]; }""")
        check('coverRenderCanvas ohne Vorlagenbild (eigener Hintergrund) liefert A4-Canvas', r == [397, 562], str(r))
        check('Keine Seitenfehler', not errs, str(errs))
        await b.close()
    print('\nFEHLER:' if FAIL else '\nALLE OK', FAIL if FAIL else '')
    sys.exit(1 if FAIL else 0)
asyncio.run(main())
