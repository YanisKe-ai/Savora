"""Cover: fuenf neue Vorlagen (Pasta-Band, Geschmacksschichten, Scherenschnitt-Tafel, Eine Prise, Tischrunde) neben den zehn alten.
Prueft: 15 Vorlagen mit stabilen IDs, Originalbilder (SHA256), Titelblatt fuer alle 15, Geometrie der neuen fuenf (Textblock endet vor 39,5 %,
Titel hoechstens drei Zeilen, Wortmarke sichtbar und 3:1, Hell/Dunkel, lange Texte = Warnung statt Abschneiden, leere Felder, Datum links unten),
die alten zehn Cover erzeugen unveraenderte Layouts (Schnappschuss tests/data/cover_alt_layouts.json aus dem Stand vor den neuen Covern),
Auswahl per Tastatur und ohne Ueberlaufen bei 320 px.
Schnappschuss neu erzeugen (nur bewusst, auf einem Stand mit den alten Covern): python tests/test_cover_neu.py --snapshot"""
import asyncio, base64, hashlib, json, os, sys
os.environ.setdefault('SAVORA_TEST_PORT', '8985')
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
from PIL import Image, ImageChops
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

OLD = ['pop', 'lieblingsbuch', 'tomate', 'salbei', 'nachtkueche', 'citrus', 'bistro', 'garten', 'sonnenkueche', 'ofenglueck']
NEW = ['savora-01-pasta-band', 'savora-02-geschmacksschichten', 'savora-03-scherenschnitt-tafel', 'savora-04-eine-prise', 'savora-05-tischrunde']
NEW_NAMES = ['Pasta-Band', 'Geschmacksschichten', 'Scherenschnitt-Tafel', 'Eine Prise', 'Tischrunde']
NEW_FILES = ['11-pasta-band', '12-geschmacksschichten', '13-scherenschnitt-tafel', '14-eine-prise', '15-tischrunde']
NEW_SHA = ['7d4656c673dd2555a2ec2fc069cb9e36d78e6ee173900c4ab8c4eb39d13b15a2', '5f7a637c5573ae1b9f4a8e1c9596a8210cc6e4b37335fc41363dc563252a4267',
           'b1e4947a9ec75fce54ca63651b78a5ef426bd134dcdb0164e3a001d42907da40', '05b1c690db82c46508a39db6dbcd214bd64a82baee54355059615475b8ea0593',
           'ab1a26411ea2471cba9ee0b97b8ae183c40102eb51ab0696035f6e3b2898ec03']
NEW_DARK = [False, True, False, True, False]   # dunkles Cover -> helle Wortmarke
NEW_INK = ['#252720', '#F7F4EE', '#252720', '#F7F4EE', '#252720']
SNAP = _os.path.join(TESTS, 'data', 'cover_alt_layouts.json')
MM = 794 / 210   # CSS-Pixel je mm
PT = 96 / 72     # CSS-Pixel je pt

VARIANTS = {
    'kurz': {'title': 'Fein', 'name': 'Ana', 'slogan': 'Echt gut'},
    'lang': {'title': 'Die allerbesten Familienrezepte aus drei Generationen und vielen Ländern', 'name': 'Familie Müller-Lüdenscheidt aus dem Emmental', 'slogan': 'Gesammelt über viele Jahre, mit Liebe weitergegeben und ergänzt'},
    'leer': {'title': '', 'name': '', 'slogan': ''},
    'nur-titel': {'title': 'Sonntagsküche', 'name': '', 'slogan': ''},
    'nur-slogan-lang': {'title': '', 'name': '', 'slogan': 'Gesammelt über viele Jahre, mit Liebe weitergegeben und von Hand ergänzt, Seite für Seite'},
    'nur-name-lang': {'title': '', 'name': 'Familie Müller-Lüdenscheidt aus dem schönen Emmental', 'slogan': ''},
    'zu-lang': {'title': 'Lorem ipsum ' * 40, 'name': 'N' * 300, 'slogan': ''},
    'langes-wort': {'title': 'Donaudampfschifffahrtsgesellschaftskapitänsmützenfabrikantenverband', 'name': '', 'slogan': ''},
}
def inputs(tid):
    out = {}
    for vn, v in VARIANTS.items():
        out[vn] = {'templateId': tid, 'title': v['title'], 'name': v['name'], 'slogan': v['slogan'], 'date': '2026-10-09', 'showDate': True, 'logo': True}
    out['kurz-ohne-datum'] = {**out['kurz'], 'showDate': False}
    out['kurz-ohne-logo'] = {**out['kurz'], 'logo': False}
    return out

# Feste, plattformunabhaengige Textmessung (Breite aus Zeichenzahl, Schriftgroesse und Gewicht): Linux und Mac messen echte Schriften verschieden
SNAP_JS = """async (all) => { await coverEnsureFonts(); const out = {};
  const fixed = (text, font) => { const m = /(\\d+)\\s+([\\d.]+)px/.exec(font); const w = +m[1], sz = +m[2]; return Array.from(text).length * sz * (w >= 800 ? 0.36 : w >= 700 ? 0.52 : 0.47); };
  for (const [key, inp] of Object.entries(all)) out[key] = { layout: coverLayout(inp, fixed) };
  return out; }"""

def round_json(o):
    if isinstance(o, float): return round(o, 4)
    if isinstance(o, list): return [round_json(x) for x in o]
    if isinstance(o, dict): return {k: round_json(v) for k, v in o.items()}
    return o

BOXES_JS = """async (inp) => {
  await coverEnsureFonts();
  const L = coverLayout(inp);
  const out = { L, boxes: [] };
  L.blocks.forEach((b) => { out.boxes.push({ key: b.key, y0: b.y, y1: b.y + b.lines.length * b.lineHeightPx / 1123, lines: b.lines.length, size: b.sizePx, x: b.x, w: b.w, text: b.lines.join(' ') }); });
  return out; }"""

async def main():
    async with async_playwright() as p:
        b, ctx = await open_ctx(p, 390, 844, 'no-preference')
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        if '--snapshot' in sys.argv: SITE.set_dir(old_checkout('1a9cf82'))   # Stand vor den neuen Covern (origin/main 0.76.0)
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(300)
        ev = page.evaluate
        await ev("() => document.fonts.ready"); await ev("() => coverEnsureFonts()")

        if '--snapshot' in sys.argv:
            allin = {}
            for tid in OLD:
                for k, v in inputs(tid).items(): allin[f'{tid}/{k}'] = v
            res = await ev(SNAP_JS, allin)
            os.makedirs(_os.path.dirname(SNAP), exist_ok=True)
            json.dump(round_json(res), open(SNAP, 'w', encoding='utf-8'), ensure_ascii=False, indent=0, sort_keys=True)
            print('Schnappschuss geschrieben:', SNAP, len(res), 'Faelle'); await b.close(); return

        # ---------- 1. Vorlagen und Originalbilder ----------
        tpl = await ev("() => COVER_TEMPLATES.map(t => ({ id: t.id, name: t.name, ink: t.ink, logoVariant: t.logoVariant, text: t.text, bg: coverBackgroundUrl(t.id), th: coverThumbUrl(t.id) }))")
        ids = [t['id'] for t in tpl]
        check('15 Vorlagen: die alten zehn zuerst in alter Reihenfolge, dann die neuen fuenf mit stabilen IDs, keine Doppelten', ids == OLD + NEW and len(set(ids)) == 15, str(ids))
        check('Namen der neuen fuenf', [t['name'] for t in tpl[10:]] == NEW_NAMES)
        for i, t in enumerate(tpl[10:]):
            f = NEW_FILES[i]; png = _os.path.join(ROOT, 'assets', 'covers', f + '.png'); th = _os.path.join(ROOT, 'assets', 'covers', 'thumbs', f + '.jpg')
            check(f'{t["id"]}: Pfade assets/covers/{f}.png und thumbs/{f}.jpg', t['bg'] == f'assets/covers/{f}.png' and t['th'] == f'assets/covers/thumbs/{f}.jpg', t['bg'])
            check(f'{t["id"]}: Originalbild unveraendert (SHA256)', hashlib.sha256(open(png, 'rb').read()).hexdigest() == NEW_SHA[i])
            im = Image.open(th); check(f'{t["id"]}: Vorschaubild 260 px breit, JPEG', im.format == 'JPEG' and im.size[0] == 260 and abs(im.size[1] / 260 - 1.4142) < 0.01, str(im.size))
            check(f'{t["id"]}: Textzone x 9 %, y 15 %, Breite 82 %, Ende 39,5 %', tpl[10 + i]['text'] == {'x': 0.09, 'y': 0.15, 'w': 0.82, 'h': 0.245}, str(t['text']))
            check(f'{t["id"]}: Textfarbe und Wortmarken-Variante', t['ink'].upper() == NEW_INK[i] and t['logoVariant'] == ('dark' if NEW_DARK[i] else 'light'), f"{t['ink']} {t['logoVariant']}")

        # ---------- 2. Titelblatt fuer alle 15 ohne Fehler ----------
        bad = []
        for tid in OLD + NEW:
            try:
                r = await ev("async (i) => { const L = coverLayout(i); const c = await coverRenderCanvas(L, 1); const h = coverHtml(L, 'x.png'); return [c.width, c.height, L.warnings.length, h.includes('data-cover=')]; }", {'templateId': tid, 'title': 'Mein Kochbuch', 'name': 'Anna', 'slogan': 'Rezepte', 'date': '2026-10-09', 'showDate': True, 'logo': True})
                if r[0] != 794 or r[1] != 1123 or r[2] or not r[3]: bad.append((tid, r))
            except Exception as e: bad.append((tid, str(e)[:80]))
        check('Alle 15 Cover erzeugen ein Titelblatt (A4-Canvas, keine Warnung, HTML)', not bad, str(bad))

        # ---------- 3. Geometrie der neuen fuenf ----------
        probs = []; warnings_seen = {}
        for i, tid in enumerate(NEW):
            for vn, inp in inputs(tid).items():
                r = await ev(BOXES_JS, inp); L = r['L']; bx = {x['key']: x for x in r['boxes']}
                tag = f'{tid}/{vn}'
                if vn in ('zu-lang', 'langes-wort'): warnings_seen[tag] = [w['key'] for w in L['warnings']]
                for k, f in (('title', 'title'), ('name', 'name'), ('slogan', 'slogan')):
                    if bool(VARIANTS.get(vn, VARIANTS['kurz'])[f].strip()) != (k in bx): probs.append((tag, 'Feld', k))
                if L['warnings']:
                    if vn not in ('zu-lang', 'langes-wort'): probs.append((tag, 'unerwartete Warnung', L['warnings']))
                    continue
                for x in r['boxes']:
                    if x['y1'] > 0.395 + 1e-6: probs.append((tag, 'Text endet nach 39,5 %', x['key'], round(x['y1'], 4)))
                    if x['x'] < 0.09 - 1e-6 or x['x'] + x['w'] > 0.91 + 1e-6: probs.append((tag, 'Breite', x['key']))
                if 'title' in bx and bx['title']['lines'] > 3: probs.append((tag, 'Titel > 3 Zeilen'))
                if 'slogan' in bx and bx['slogan']['lines'] > 2: probs.append((tag, 'Untertitel > 2 Zeilen'))
                if 'name' in bx and bx['name']['lines'] > 2: probs.append((tag, 'Name > 2 Zeilen'))
                if 'title' in bx and not (24 * PT - 0.01 <= bx['title']['size'] <= 34 * PT + 0.01): probs.append((tag, 'Titelgroesse', bx['title']['size']))
                if 'slogan' in bx and not (11 * PT - 0.01 <= bx['slogan']['size'] <= 13 * PT + 0.01): probs.append((tag, 'Untertitelgroesse', bx['slogan']['size']))
                if 'name' in bx and abs(bx['name']['size'] - 10 * PT) > 0.01: probs.append((tag, 'Namengroesse', bx['name']['size']))
                ks = [k for k in ('title', 'slogan', 'name') if k in bx]
                if ks and abs(bx[ks[0]]['y0'] - 0.15) > 1e-6: probs.append((tag, 'Block beginnt nicht bei 15 %', bx[ks[0]]['y0']))   # leere Felder: kein Leerraum davor
                gaps = {('title', 'slogan'): 5, ('slogan', 'name'): 3, ('title', 'name'): 3}
                for a, c in zip(ks, ks[1:]):
                    want = gaps[(a, c)] * MM / 1123; got = bx[c]['y0'] - bx[a]['y1']
                    if abs(got - want) > 1e-3: probs.append((tag, 'Abstand', a, c, round(got * 1123 / MM, 2)))
                if L['date'] is None and inp['showDate']: probs.append((tag, 'Datum fehlt'))
                if L['date']:
                    d = L['date']
                    if abs(d['y'] - 0.96) > 1e-6 or abs(d.get('x0', -1) - 0.09) > 1e-6 or d.get('align') != 'left' or abs(d['sizePx'] - 9 * PT) > 0.01: probs.append((tag, 'Datum', d))
                    if d['y'] + d['h'] > 0.985: probs.append((tag, 'Datum Unterkante', d['y'] + d['h']))
                if L['logo']:
                    lg = L['logo']
                    if abs(lg['x'] - 0.66) > 1e-6 or abs(lg['y'] - 0.055) > 1e-6 or lg['w'] > 0.25 + 1e-6 or lg['h'] > 0.055 + 1e-6 or lg['variant'] != ('dark' if NEW_DARK[i] else 'light') or lg['ink'].upper() != ('#F7F4EE' if NEW_DARK[i] else '#252720'):
                        probs.append((tag, 'Logo', lg))
        check('Neue fuenf, alle Eingaben: Text endet vor 39,5 %, Titel <= 3 / Untertitel <= 2 / Name <= 2 Zeilen, Schriftgroessen, Abstaende 5 / 3 mm, kein Leerraum bei leeren Feldern, Datum links unten, Logo 66 % / 5,5 %', not probs, str(probs[:6]))
        zl = [k for k, v in warnings_seen.items() if k.endswith('zu-lang')]
        check('Absurd lange Texte erzeugen bei allen fuenf eine Warnung mit Feldschluessel und der festen Meldung', all(warnings_seen[k] for k in zl), str(warnings_seen))
        msg = await ev("() => coverLayout({ templateId: 'savora-01-pasta-band', title: 'Lorem ipsum '.repeat(40), date: '2026-10-09' }).warnings.map(w => w.message)")
        check('Meldung: «Der Text ist zu lang für dieses Cover. Bitte kürze Titel, Untertitel oder Name.»', msg and msg[0] == 'Der Text ist zu lang für dieses Cover. Bitte kürze Titel, Untertitel oder Name.', str(msg))
        # Titel mit drei Zeilen, Untertitel zwei, Name zwei (Auftrag: Titel + zwei Untertitelzeilen + zwei Namenszeilen)
        worst = await ev("""async () => { await coverEnsureFonts(); const out = []; for (const id of %s) { const L = coverLayout({ templateId: id, title: 'Wochenend Rezepte aus unserer grossen Familienküche mit vielen Gästen und Freunden am langen Tisch im Garten', slogan: 'Gesammelt über viele Jahre, mit Liebe weitergegeben und immer wieder neu ergänzt, Seite für Seite, Gericht für Gericht', name: 'Familie Müller-Lüdenscheidt aus dem schönen Emmental im Kanton Bern, gesammelt von Grossmutter Anna und ihren Enkeln', date: '2026-10-09' }); out.push([id, L.warnings.length, L.blocks.map(b => [b.key, b.lines.length, Math.round(b.sizePx * 100) / 100, Math.round((b.y + b.lines.length * b.lineHeightPx / 1123) * 1000) / 1000])]); } return out; }""" % json.dumps(NEW))
        okw = all(w[1] == 1 or all(bl[3] <= 0.395 for bl in w[2]) for w in worst)
        check('Titel + zwei Untertitelzeilen + zwei Namenszeilen: passt innerhalb 39,5 % oder verstaendliche Warnung', okw, str(worst[:2]))

        # ---------- 4. Pixel: Wortmarke sichtbar, proportional, richtige Farbe ----------
        pix = []
        for i, tid in enumerate(NEW):
            inp = {'templateId': tid, 'title': 'Mein Kochbuch', 'name': 'Anna', 'slogan': 'Rezepte', 'date': '2026-10-09', 'showDate': True, 'logo': True}
            async def render(x):
                d = await ev("async (i) => { const L = coverLayout(i); const c = await coverRenderCanvas(L, 1); return c.toDataURL('image/png'); }", x)
                pth = f'{OUT}/_cover_neu.png'; open(pth, 'wb').write(base64.b64decode(d.split(',')[1])); return Image.open(pth).convert('RGB').copy()
            full = await render(inp); nologo = await render({**inp, 'logo': False})
            bb = ImageChops.difference(full, nologo).convert('L').point(lambda v: 255 if v > 40 else 0).getbbox()
            L = (await ev(BOXES_JS, inp))['L']
            if not bb: pix.append((tid, 'Wortmarke nicht sichtbar')); continue
            gw, gh = bb[2] - bb[0], bb[3] - bb[1]
            if not (0.28 < gh / gw < 0.38): pix.append((tid, 'Seitenverhaeltnis', round(gw / gh, 2)))
            lx0, lx1, ly0, ly1 = L['logo']['x'] * 794, (L['logo']['x'] + L['logo']['w']) * 794, L['logo']['y'] * 1123, (L['logo']['y'] + L['logo']['h']) * 1123
            if not (lx0 - 1 <= bb[0] and bb[2] <= lx1 + 1 and ly0 - 1 <= bb[1] and bb[3] <= ly1 + 1): pix.append((tid, 'ausserhalb Box', bb))
            if bb[1] < 0.055 * 1123 - 1 or bb[3] > 0.11 * 1123 + 1: pix.append((tid, 'Hoehe ueber 5,5 %', bb))
            # Tintenfarbe der Wortmarke: dunkelstes/hellstes Pixel im Bereich
            px = full.crop(bb).getcolors(10 ** 6); top = max(px)[1]
            want = (0xF7, 0xF4, 0xEE) if NEW_DARK[i] else (0x25, 0x27, 0x20)
            if max(abs(a - c) for a, c in zip(top, want)) > 6: pix.append((tid, 'Wortmarkenfarbe', top))
            # Text liegt nicht auf dem Motiv: unter 39,5 % unveraendert gegenueber dem Hintergrund ohne Text
            bare = await render({**inp, 'title': '', 'name': '', 'slogan': '', 'showDate': False, 'logo': False})
            tb = ImageChops.difference(full, bare).convert('L').point(lambda v: 255 if v > 40 else 0).crop((0, 0, 794, int(0.90 * 1123)))   # ohne Datumszeile
            tb.paste(0, (int(0.60 * 794), 0, 794, int(0.12 * 1123)))   # Wortmarke
            bb2 = tb.getbbox()
            if not bb2 or bb2[3] > 0.395 * 1123 + 1 or bb2[1] < 0.15 * 1123 - 2: pix.append((tid, 'Text ausserhalb 15 % bis 39,5 %', bb2))
        check('Neue fuenf, echte Pixel: Wortmarke sichtbar, 3:1, richtige Farbe, nicht hoeher als 5,5 %; Text nicht auf dem Motiv', not pix, str(pix))

        # ---------- 5. Alte zehn Cover unveraendert ----------
        if _os.path.exists(SNAP):
            snap = json.load(open(SNAP, encoding='utf-8'))
            allin = {}
            for tid in OLD:
                for k, v in inputs(tid).items(): allin[f'{tid}/{k}'] = v
            cur = round_json(await ev(SNAP_JS, allin))
            diff = [k for k in snap if json.dumps(snap[k]['layout'], sort_keys=True, ensure_ascii=False) != json.dumps(cur.get(k, {}).get('layout'), sort_keys=True, ensure_ascii=False)]
            check(f'Alte zehn Cover: {len(snap)} Layout-Beschreibungen (feste Messfunktion: Texte, Groessen, Positionen, Logo, Datum) gleich wie vor den neuen Covern', not diff and len(snap) >= 100, str(diff[:5]))
        else:
            check('Schnappschuss tests/data/cover_alt_layouts.json vorhanden', False)

        # ---------- 6. Auswahl: 15 Eintraege, Tastatur, Ueberlaufen ----------
        await ev("() => { localStorage.removeItem(COOKBOOK_CONFIG_KEY); localStorage.removeItem(COOKBOOK_PROJECTS_KEY); state.cookbookStep = 2; state.view = 'cookbook'; render(); }"); await page.wait_for_timeout(1000)
        opts = await ev("() => Array.from(document.querySelectorAll('.cover-opt')).map(e => ({ id: e.dataset.id, role: e.getAttribute('role'), on: e.getAttribute('aria-checked'), label: e.getAttribute('aria-label'), name: e.querySelector('.cover-opt-name').textContent }))")
        check('Auswahl: 15 Radio-Eintraege mit Namen und aria-label, genau einer aktiv', [o['id'] for o in opts] == OLD + NEW and all(o['role'] == 'radio' and o['label'] == o['name'] for o in opts) and sum(1 for o in opts if o['on'] == 'true') == 1, str([o['name'] for o in opts]))
        await page.fill('#cbTitle', 'Mein Buch ä'); await page.fill('#cbSubtitle', 'Untertitel'); await page.fill('#cbAuthor', 'Anna'); await page.wait_for_timeout(300)
        await ev("() => document.querySelector('.cover-opt[data-id=\"savora-03-scherenschnitt-tafel\"]').scrollIntoView()")
        await page.focus('.cover-opt[data-id="savora-03-scherenschnitt-tafel"]'); await page.wait_for_timeout(200)
        await page.keyboard.press('Enter'); await page.wait_for_timeout(400)
        a = await ev("() => ({ id: document.activeElement.dataset.id, active: document.querySelector('.cover-opt.is-active').dataset.id, tpl: getCookbookConfig().cover.templateId, t: document.getElementById('cbTitle').value, s: document.getElementById('cbSubtitle').value, n: document.getElementById('cbAuthor').value, lay: document.querySelector('canvas.cv-canvas').dataset.layout })")
        check('Neues Cover per Tastatur gewaehlt: gespeichert, Fokus bleibt, Texte bleiben, Vorschau zeigt Titel', a['active'] == a['tpl'] == a['id'] == 'savora-03-scherenschnitt-tafel' and a['t'] == 'Mein Buch ä' and a['s'] == 'Untertitel' and a['n'] == 'Anna' and 'Mein Buch ä' in a['lay'], str(a)[:200])
        await page.keyboard.press('Tab'); await page.keyboard.press('Space'); await page.wait_for_timeout(400)
        a2 = await ev("() => ({ active: document.querySelector('.cover-opt.is-active').dataset.id, chk: document.querySelector('.cover-opt.is-active').getAttribute('aria-checked') })")
        check('Tab + Leertaste waehlt das naechste Cover (Eine Prise), aria-checked gesetzt', a2['active'] == 'savora-04-eine-prise' and a2['chk'] == 'true', str(a2))
        await ev("() => { state.cookbookStep = 2; render(); }"); await page.wait_for_timeout(600)
        a3 = await ev("() => document.querySelector('.cover-opt.is-active').dataset.id")
        check('Auswahl bleibt nach neu Zeichnen erhalten', a3 == 'savora-04-eine-prise', a3)
        for w in (320, 390, 768, 1280):
            await page.set_viewport_size({'width': w, 'height': 800}); await page.wait_for_timeout(500)
            r = await ev("() => ({ over: document.documentElement.scrollWidth - document.documentElement.clientWidth, minw: Math.min(...Array.from(document.querySelectorAll('.cover-opt')).map(e => e.getBoundingClientRect().width)), minh: Math.min(...Array.from(document.querySelectorAll('.cover-opt')).map(e => e.getBoundingClientRect().height)), n: document.querySelectorAll('.cover-opt').length })")
            check(f'{w} px: 15 Cover, kein seitliches Ueberlaufen, Klickflaechen mindestens 44 px', r['over'] <= 1 and r['n'] == 15 and r['minw'] >= 44 and r['minh'] >= 44, str(r))
        check('Keine JavaScript-Fehler', not errs, str(errs[:2]))
        await b.close()

asyncio.run(main())
print('\nFEHLER:' if FAIL else '\nALLES OK', len(FAIL), FAIL if FAIL else '')
sys.exit(1 if FAIL else 0)
