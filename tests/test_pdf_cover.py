"""PDF-Export, Gruppe Cover: alle fuenfzehn Titelblaetter x kurze, lange und leere optionale Texte (Titel, Name, Slogan),
Datum an/aus, Wortmarke an/aus. Prueft im Layout (Boxen ueberlappen nicht, liegen mit Rand in der Seite, Schutzraum um die Wortmarke),
an den echten Pixeln (Text liegt innerhalb seiner Box, nichts abgeschnitten, Wortmarke vorhanden) und an echten PDF-Seiten
(A4, Text auswaehlbar, leere Felder = kein Text, Seite gleicht der Vorschau). Die Wortmarke bleibt das Original (Pfad unveraendert, 3:1).
Kontaktboegen: Ordner SAVORA_COVER_SHOTS (Standard: Testausgabe)."""
import asyncio, base64, hashlib, json, os, re, subprocess, sys, tempfile
os.environ.setdefault('SAVORA_TEST_PORT', '8975')
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
from PIL import Image, ImageChops, ImageStat
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)
IDS = ['pop', 'lieblingsbuch', 'tomate', 'salbei', 'nachtkueche', 'citrus', 'bistro', 'garten', 'sonnenkueche', 'ofenglueck', 'savora-01-pasta-band', 'savora-02-geschmacksschichten', 'savora-03-scherenschnitt-tafel', 'savora-04-eine-prise', 'savora-05-tischrunde']
SHOTS = os.environ.get('SAVORA_COVER_SHOTS') or _os.path.join(OUT, 'cover-shots')
os.makedirs(SHOTS, exist_ok=True)
VARIANTS = {
    'kurz': {'title': 'Fein', 'name': 'Ana', 'slogan': 'Echt gut'},
    'lang': {'title': 'Die allerbesten Familienrezepte aus drei Generationen und vielen Ländern', 'name': 'Familie Müller-Lüdenscheidt aus dem Emmental', 'slogan': 'Gesammelt über viele Jahre, mit Liebe weitergegeben und ergänzt'},
    'leer': {'title': '', 'name': '', 'slogan': ''},
}
EXTRA = {   # einzelne Felder, Datum und Logo
    'nur-titel': {'title': 'Sonntagsküche', 'name': '', 'slogan': ''},
    'nur-slogan-lang': {'title': '', 'name': '', 'slogan': 'Gesammelt über viele Jahre, mit Liebe weitergegeben und von Hand ergänzt, Seite für Seite'},
    'nur-name-lang': {'title': '', 'name': 'Familie Müller-Lüdenscheidt aus dem schönen Emmental', 'slogan': ''},
    'langer-name-kurzer-titel': {'title': 'Brot', 'name': 'Familie Müller-Lüdenscheidt aus dem schönen Emmental im Kanton Bern', 'slogan': ''},
}
PAGE_W, PAGE_H = 794, 1123
MARGIN = 0.05   # Text und Wortmarke bleiben mindestens 5 % von der Seitenkante weg

def overlap(a, b, gap=0):
    return not (a['x1'] + gap <= b['x0'] or b['x1'] + gap <= a['x0'] or a['y1'] + gap <= b['y0'] or b['y1'] + gap <= a['y0'])

BOXES_JS = """async (inp) => {
  await coverEnsureFonts();
  const L = coverLayout(inp);
  const out = { warnings: L.warnings, boxes: [], sizes: {} };
  L.blocks.forEach((b) => {
    const font = `${b.weight} ${b.sizePx}px ${b.family}`;
    const w = Math.max(0, ...b.lines.map(l => coverMeasureDefault(l, font)));
    out.boxes.push({ key: b.key, x0: b.x * 794, y0: b.y * 1123, x1: b.x * 794 + w, y1: b.y * 1123 + b.lines.length * b.lineHeightPx, zoneW: b.w * 794, lines: b.lines.length, size: b.sizePx, fits: b.fits, text: b.lines.join(' ') });
    out.sizes[b.key] = b.sizePx;
  });
  if (L.date) { const font = `${L.date.weight} ${L.date.sizePx}px ${L.date.family}`; const w = coverMeasureDefault(L.date.text, font); out.boxes.push({ key: 'date', x0: L.date.align === 'left' ? L.date.x0 * 794 : L.date.x1 * 794 - w, x1: L.date.align === 'left' ? L.date.x0 * 794 + w : L.date.x1 * 794, y0: (L.date.y + L.date.h / 2) * 1123 - L.date.sizePx * 0.6, y1: (L.date.y + L.date.h / 2) * 1123 + L.date.sizePx * 0.6, size: L.date.sizePx, text: L.date.text }); }
  if (L.logo) out.boxes.push({ key: 'logo', x0: L.logo.x * 794, x1: (L.logo.x + L.logo.w) * 794, y0: L.logo.y * 1123, y1: L.logo.y * 1123 + L.logo.h * 1123, variant: L.logo.variant });
  return out; }"""

PDF_JS = """async () => { const r = await buildCookbookPdf('off'); if (!r) return null; const u = new Uint8Array(await r.blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); }"""

def ink_bbox(a, b, thr=40):
    """Bereich, in dem sich zwei gleich grosse RGB-Bilder unterscheiden (Text/Wortmarke gegenueber dem leeren Hintergrund)."""
    d = ImageChops.difference(a, b).convert('L').point(lambda v: 255 if v > thr else 0)
    return d.getbbox()

async def main():
    async with async_playwright() as p:
        b, ctx = await open_ctx(p, 1280, 900, 'no-preference')
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(300)
        await page.add_style_tag(content='::-webkit-scrollbar{display:none}html{scrollbar-width:none}')
        ev = page.evaluate
        await ev("() => document.fonts.ready"); await ev("() => coverEnsureFonts()")

        # ---------- 1. Wortmarke: Original, unveraendert, 3:1 ----------
        svg = open(_os.path.join(ROOT, 'assets', 'logo', 'savora-wortmarke-light.svg'), encoding='utf-8').read()
        svg_d = ' '.join(re.findall(r'\sd="([^"]+)"', svg))
        js_d = await ev("() => WORDMARK_PATH")
        norm = lambda s: re.sub(r'\s+', ' ', s).strip()
        check('Wortmarke: Pfad in cover.js ist der Pfad der Originaldatei savora-wortmarke-light.svg', norm(svg_d) == norm(js_d), f'{len(svg_d)} / {len(js_d)} Zeichen')
        svg_dark = open(_os.path.join(ROOT, 'assets', 'logo', 'savora-wortmarke-dark.svg'), encoding='utf-8').read()
        check('Wortmarke: dunkle Variante hat denselben Pfad', norm(' '.join(re.findall(r'\sd="([^"]+)"', svg_dark))) == norm(svg_d))
        box = await ev("() => WORDMARK_BOX")
        check('Wortmarke: Zeichenflaeche 1200 x 400 (3:1)', box['w'] == 1200 and box['h'] == 400)
        vb = re.search(r'viewBox="([^"]+)"', svg)
        check('Wortmarke: Original-viewBox 0 0 1200 400', vb and vb.group(1).split() == ['0', '0', '1200', '400'], vb.group(1) if vb else '')
        check('Wortmarke wird nur ueber coverDrawWordmark gezeichnet (gleichmaessig skaliert)', 'ctx.scale(k, k)' in open(_os.path.join(ROOT, 'cover.js'), encoding='utf-8').read())

        # ---------- 2. Layout-Geometrie fuer alle Cover x Varianten ----------
        probs = []; warn_all = []; ok_n = 0
        for tid in IDS:
            for vname, v in {**VARIANTS, **EXTRA}.items():
                for showDate, logo in ((True, True), (False, True), (True, False), (False, False)) if vname in ('kurz', 'leer') else ((True, True),):
                    inp = {'templateId': tid, 'title': v['title'], 'name': v['name'], 'slogan': v['slogan'], 'date': '2026-10-09', 'showDate': showDate, 'logo': logo}
                    r = await ev(BOXES_JS, inp)
                    tag = f'{tid}/{vname}/d{int(showDate)}l{int(logo)}'
                    if r['warnings']: warn_all.append((tag, [w['key'] for w in r['warnings']]))
                    keys = [x['key'] for x in r['boxes']]
                    # leere Felder = kein Element, gefuellte Felder = Element
                    for k, f in (('title', 'title'), ('name', 'name'), ('slogan', 'slogan')):
                        if bool(v[f].strip()) != (k in keys): probs.append((tag, 'Feld', k))
                    if showDate != ('date' in keys): probs.append((tag, 'Datum'))
                    if logo != ('logo' in keys): probs.append((tag, 'Logo'))
                    bs = r['boxes']
                    for x in bs:
                        mx = 30 if x['key'] == 'date' else MARGIN * PAGE_W   # Datum: mindestens 8 mm vom Rand, alles andere 5 % der Breite
                        my = 30 if x['key'] == 'date' else MARGIN * PAGE_H
                        if x['x0'] < mx - 0.5 or x['x1'] > PAGE_W - mx + 0.5 or x['y0'] < my - 0.5 or x['y1'] > PAGE_H - my + 0.5:
                            probs.append((tag, 'Rand', x['key'], [round(x['x0']), round(x['x1']), round(x['y0']), round(x['y1'])]))
                        if x['key'] in ('title', 'name', 'slogan') and x['x1'] - x['x0'] > x['zoneW'] + 0.5: probs.append((tag, 'breiter als Zone', x['key']))
                    for i in range(len(bs)):
                        for j in range(i + 1, len(bs)):
                            gap = 0
                            if 'logo' in (bs[i]['key'], bs[j]['key']):
                                gap = 14   # Schutzraum: mindestens ein Viertel der Buchstabenhoehe (Wortmarke etwa 56 px hoch)
                            if overlap(bs[i], bs[j], gap) and not r['warnings']: probs.append((tag, 'Ueberlappung/Schutzraum', bs[i]['key'], bs[j]['key']))
                    for x in bs:   # Mindestgroessen (Referenz 794 px = 210 mm; 1 px = 0,75 pt * 210 mm / 794 px -> 0,2645 mm)
                        if x['key'] == 'date' and x['size'] * 0.2646 / 0.3528 < 8.5: probs.append((tag, 'Datum unter 8,5 pt', x['size']))
                        if x['key'] in ('name', 'slogan') and x['size'] * 0.2646 / 0.3528 < 9.5: probs.append((tag, 'Text unter 9,5 pt', x['key'], x['size']))
                    ok_n += 1
        check(f'Layout aller Cover x Varianten ({ok_n} Faelle): Felder leer = kein Element, Datum/Logo gemaess Option, Rand, keine Ueberlappung, Schutzraum Wortmarke, Mindestgroessen', not probs, str(probs[:8]))
        # Warnungen nur bei absurd langem Text erlaubt, nie bei den Varianten kurz/lang
        check('Kurze und lange Texte erzeugen keine Warnung (Schrift verkleinert sich innerhalb der Mindestgroessen)', not warn_all, str(warn_all[:6]))

        # ---------- 3. Pixel: Text innerhalb seiner Box, Wortmarke vorhanden ----------
        pix = []; sheet_items = []
        for tid in IDS:
            for vname in ('kurz', 'lang', 'leer'):
                v = VARIANTS[vname]
                inp = {'templateId': tid, 'title': v['title'], 'name': v['name'], 'slogan': v['slogan'], 'date': '2026-10-09', 'showDate': True, 'logo': True}
                async def render(i):
                    d = await ev("async (i) => { const L = coverLayout(i); const c = await coverRenderCanvas(L, 1); return c.toDataURL('image/png'); }", i)
                    pth = f'{SHOTS}/_tmp.png'; open(pth, 'wb').write(base64.b64decode(d.split(',')[1])); return Image.open(pth).convert('RGB').copy()
                full = await render(inp)
                r = await ev(BOXES_JS, inp)
                # Wortmarke: Pixelunterschied nur im Logo-Bereich
                nologo = await render({**inp, 'logo': False})
                lb = ink_bbox(full, nologo)
                lg = next((x for x in r['boxes'] if x['key'] == 'logo'), None)
                if not lb: pix.append((tid, vname, 'Wortmarke nicht sichtbar'))
                else:
                    gw, gh = lb[2] - lb[0], lb[3] - lb[1]
                    if not (lg['x0'] - 1 <= lb[0] and lb[2] <= lg['x1'] + 1 and lg['y0'] - 1 <= lb[1] and lb[3] <= lg['y1'] + 1): pix.append((tid, vname, 'Wortmarke ausserhalb Box', lb))
                    if not (0.28 < gh / gw < 0.38): pix.append((tid, vname, 'Wortmarke Seitenverhaeltnis', round(gw / gh, 2)))
                # Text: Unterschied ohne Wortmarke und Datum muss in den Boxen liegen
                nl_notext = await render({**inp, 'logo': False, 'showDate': False, 'title': '', 'name': '', 'slogan': ''})
                nl_text = await render({**inp, 'logo': False, 'showDate': False})
                tb = ink_bbox(nl_text, nl_notext)
                tbox = [x for x in r['boxes'] if x['key'] in ('title', 'name', 'slogan')]
                if vname == 'leer':
                    if tb: pix.append((tid, vname, 'Text sichtbar trotz leerer Felder', tb))
                else:
                    if not tb: pix.append((tid, vname, 'kein Text sichtbar'))
                    else:
                        x0 = min(x['x0'] for x in tbox); x1 = max(x['x1'] for x in tbox); y0 = min(x['y0'] for x in tbox); y1 = max(x['y1'] for x in tbox)
                        if tb[0] < x0 - 2 or tb[2] > x1 + 2 or tb[1] < y0 - 2 or tb[3] > y1 + 2: pix.append((tid, vname, 'Text ausserhalb der Boxen', tb, [round(x0), round(y0), round(x1), round(y1)]))
                        if tb[0] < MARGIN * PAGE_W or tb[2] > (1 - MARGIN) * PAGE_W: pix.append((tid, vname, 'Text beruehrt Rand', tb))
                sheet_items.append((tid, vname, full))
        check('Pixel: Wortmarke sichtbar, in ihrer Box, 3:1; Text innerhalb der Layoutboxen und mit Randabstand; leere Felder = kein Text', not pix, str(pix[:6]))
        for vname in ('kurz', 'lang', 'leer'):
            sh = Image.new('RGB', (5 * 300 + 30, 3 * 424 + 30), (236, 233, 226))
            for k, (tid, vn, im) in enumerate([s for s in sheet_items if s[1] == vname]):
                sh.paste(im.resize((290, int(290 * PAGE_H / PAGE_W))), (10 + (k % 5) * 300, 10 + (k // 5) * 414))
            sh.save(f'{SHOTS}/kontaktbogen-vorschau-{vname}.jpg', quality=88)
        try: os.remove(f'{SHOTS}/_tmp.png')
        except OSError: pass

        # ---------- 4. Datum: Schweizer Format, Option ----------
        d = await ev("() => [coverFormatDate('2026-10-09'), coverFormatDate('2026-02-30')]")
        check('Datum TT.MM.JJJJ (de-CH), ungueltiges Datum leer', d == ['09.10.2026', ''], str(d))

        # ---------- 5. Keine festen Namen ----------
        src = open(_os.path.join(ROOT, 'cover.js'), encoding='utf-8').read()
        check('cover.js enthaelt keine festen persoenlichen Namen', not re.search(r'Yanis|Keusch|Müller(?!-)', src.replace('Müller-Lüdenscheidt', '')))

        # ---------- 6. Echte PDF-Seiten ----------
        tmp = tempfile.mkdtemp(prefix='savora-cover-pdf-')
        await ev("""async () => { const r = state.recipes[0]; localStorage.removeItem(COOKBOOK_PROJECTS_KEY); localStorage.setItem(COOKBOOK_CONFIG_KEY, JSON.stringify({ title: '', subtitle: '', author: '', items: [{ recipeId: r.id, chapterId: '' }], chapters: [], cover: { v: 1, templateId: 'pop', date: '2026-10-09', showDate: true } })); }""")
        pdfprob = []; pdf_sheets = {}
        full = bool(os.environ.get('SAVORA_COVER_FULL'))   # alle 30 PDFs (dauert einige Minuten); sonst alle Cover mit langen Texten, kurz/leer an drei Covern
        for tid in IDS:
            for vname in ('kurz', 'lang', 'leer'):
                if not full and vname != 'lang' and tid not in ('lieblingsbuch', 'tomate', 'salbei'): continue
                v = VARIANTS[vname]
                await ev("(a) => { const c = getCookbookConfig(); c.cover.templateId = a[0]; c.title = a[1].title; c.author = a[1].name; c.subtitle = a[1].slogan; saveCookbookConfig(c); }", [tid, v])
                res = await ev(PDF_JS)
                if not res: pdfprob.append((tid, vname, 'kein PDF')); continue
                path = f'{tmp}/{tid}-{vname}.pdf'; open(path, 'wb').write(base64.b64decode(res))
                info = subprocess.run(['pdfinfo', '-f', '1', '-l', '1', path], capture_output=True, text=True).stdout
                m = re.search(r'Page    1 size:\s+([\d.]+) x ([\d.]+)', info)
                if not m or abs(float(m.group(1)) - 595.28) > 1.5 or abs(float(m.group(2)) - 841.89) > 1.5: pdfprob.append((tid, vname, 'Seitengroesse', m.group(0) if m else info[:80]))
                text = subprocess.run(['pdftotext', '-f', '1', '-l', '1', '-layout', path, '-'], capture_output=True, text=True).stdout
                words = text.split()
                if vname == 'leer':
                    if words != ['09.10.2026']: pdfprob.append((tid, vname, 'Text bei leeren Feldern', words[:6]))
                else:
                    for w in (v['title'].split()[0], v['name'].split()[0], v['slogan'].split()[0], '09.10.2026'):
                        if w not in text: pdfprob.append((tid, vname, 'Text fehlt', w))
                png = f'{tmp}/{tid}-{vname}'
                subprocess.run(['pdftoppm', '-f', '1', '-l', '1', '-r', '100', '-png', '-singlefile', path, png], check=True)
                pim = Image.open(png + '.png').convert('RGB')
                if abs(pim.size[0] / pim.size[1] - 210 / 297) > 0.004: pdfprob.append((tid, vname, 'Seitenverhaeltnis', pim.size))
                # Vorschau derselben Konfiguration
                shot = await ev("""async () => { const c = getCookbookConfig(); const L = coverLayout({ templateId: c.cover.templateId, title: c.title, name: c.author, slogan: c.subtitle, date: c.cover.date, showDate: true, logo: true }); const cv = await coverRenderCanvas(L, 1); return cv.toDataURL('image/png'); }""")
                open(f'{tmp}/prev.png', 'wb').write(base64.b64decode(shot.split(',')[1]))
                pre = Image.open(f'{tmp}/prev.png').convert('RGB')
                dl = ImageChops.difference(pre, pim.resize(pre.size)).convert('L'); hist = dl.histogram(); npx = sum(hist)
                mean = ImageStat.Stat(dl).mean[0]; strong = sum(hist[81:]) / npx * 100
                if mean > (12 if tid.endswith('scherenschnitt-tafel') else 8) or strong > 2.5:   # Scherenschnitt: feine Schraffur, Raster-Unterschiede (pdftoppm gegen Canvas) treiben den Mittelwert, besonders auf Linux (8,16 gemessen)
                     pdfprob.append((tid, vname, 'weicht von Vorschau ab', round(mean, 2), round(strong, 2)))
                pdf_sheets[(tid, vname)] = pim
                # keine Druckmarken: Randstreifen (3 mm) hat dieselbe Farbe wie das Hintergrundbild in der Vorschau
                edge = ImageChops.difference(pre, pim.resize(pre.size)).convert('L').crop((0, 0, pre.size[0], 12))
                if ImageStat.Stat(edge).mean[0] > 12: pdfprob.append((tid, vname, 'Randstreifen weicht ab (Marken/Beschnitt?)'))
        check(f'{len(pdf_sheets)} echte PDF-Seiten (A4): Text auswaehlbar, leere Felder = kein Text, Seite gleicht der Vorschau, keine Druckmarken', not pdfprob, str(pdfprob[:6]))
        for vname in ('kurz', 'lang', 'leer'):
            sh = Image.new('RGB', (5 * 300 + 30, 3 * 424 + 30), (236, 233, 226))
            for k, tid in enumerate(IDS):
                im = pdf_sheets.get((tid, vname))
                if im: sh.paste(im.resize((290, int(290 * PAGE_H / PAGE_W))), (10 + (k % 5) * 300, 10 + (k // 5) * 414))
            sh.save(f'{SHOTS}/kontaktbogen-pdf-{vname}.jpg', quality=88)
        for (tid, vname), im in pdf_sheets.items():
            if vname == 'lang': im.save(f'{SHOTS}/pdf-{tid}-lang.png')

        # ---------- 7. Seitenverhaeltnis der Hintergruende (kein Verzerren) ----------
        bg = await ev("() => COVER_TEMPLATES.map(t => { const r = coverBgRect(t.id, 794, 1123); return { id: t.id, r }; })")
        sizes = await ev("() => COVER_TEMPLATES.map(t => ({ id: t.id, s: COVER_IMAGE_SIZE[t.id] || COVER_IMAGE_SIZE.default }))")
        files = await ev("() => COVER_TEMPLATES.map(t => ({ id: t.id, u: coverBackgroundUrl(t.id) }))")
        asp = []
        for f, s, g in zip(files, sizes, bg):
            real = Image.open(_os.path.join(ROOT, f['u'])).size
            if list(real) != list(s['s']): asp.append((f['id'], 'COVER_IMAGE_SIZE falsch', real, s['s']))
            if abs(g['r']['w'] / g['r']['h'] - real[0] / real[1]) > 0.002: asp.append((f['id'], 'Hintergrund verzerrt', g['r']))
        check('Hintergruende: gespeicherte Pixelmasse stimmen mit den Dateien ueberein, Zeichnen behaelt das Seitenverhaeltnis', not asp, str(asp))
        ppi = [(f['id'], round(Image.open(_os.path.join(ROOT, f['u'])).size[0] / 8.268)) for f in files]
        print('INFO Aufloesung der Hintergruende auf A4 (ppi, Breite / 8,27 Zoll):', ppi)
        check('Kein JavaScript-Fehler', not errs, str(errs[:3]))
        await b.close()
    print('\nFEHLER:', FAIL if FAIL else 'keine')
    sys.exit(1 if FAIL else 0)
asyncio.run(main())
