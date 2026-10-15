"""Cover-Editor, Export-Abnahme (Paket C5): echte Kochbuch-PDFs ueber die echte Oberflaeche (Schritt «Vorschau & PDF» ->
«PDF-Vorschau erstellen» -> «PDF erstellen») mit bisherigem Cover (v1), eigenen Farben, eigenen Bildern (Hoch/Quer/Quadrat,
«Ganzes Bild anzeigen»/«Cover ausfuellen», transparente PNG), Textvarianten, allen sechs Anordnungen, Textflaeche/Verlauf,
Logo-Positionen und -Varianten, Vorlage mit Abweichungen und (sobald vorhanden) den neuen Vorlagen.
Je Fall: Titelseite mit pdftoppm -r 72 gerendert und mit dem Vorschau-Canvas (coverRenderCanvas, gleiches Layout) verglichen,
keine leere Seite, kein Rasterbeschnitt an den Seitenkanten, keine Editor-Elemente im PDF, Textlayer (pdftotext) enthaelt alle Texte,
Bildseitenverhaeltnis im PDF gemessen. Export-Sperre bei cut/outside und fehlendem Bild: Fehlermeldung, kein PDF.
v1-Cover: pixelgleich zum Stand vor dem Editor, live im selben Browser gegen Commit REF_COMMIT gerendert (braucht die Git-Historie);
auf dem Mac zusaetzlich gegen die dort erzeugten Referenzbilder tests/data/cover_v1_*.png (Linux rastert Schrift anders).
Neu erzeugen: SAVORA_COVER_REF_REGEN=1. Beispiel-PDFs: SAVORA_COVER_BEISPIELE=<Ordner>. Neutrale Testdaten."""
import asyncio, base64, io, json, os, re, shutil, subprocess, sys, tempfile
os.environ.setdefault('SAVORA_TEST_PORT', '8995')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageStat

FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

REF_COMMIT = '1a9cf82'   # letzter Stand auf main vor dem Cover-Editor
DATA = os.path.join(TESTS, 'data')
V1_CASES = [('tomate', 'Sonntagsküche', 'Rezepte für jeden Tag', 'Alex Muster'), ('pop', 'Familienrezepte aus drei Generationen', 'Gesammelt und weitergegeben', 'Familie Beispiel-Muster')]
BEISPIELE = os.environ.get('SAVORA_COVER_BEISPIELE')
W72, H72 = 595, 842
TMP = os.environ.get('SAVORA_COVER_TMP') or tempfile.mkdtemp(prefix='savora-cover-pdf5-')
LOG = []

# ---------- Testbilder (selbst erzeugt, neutral): Flaeche + magenta Kreis in der Bildmitte ----------
MAGENTA = (230, 0, 200)
def bild(w, h, bg, mode='RGB'):
    im = Image.new(mode, (w, h), bg)
    d = ImageDraw.Draw(im); r = 0.3 * min(w, h)
    d.ellipse((w / 2 - r, h / 2 - r, w / 2 + r, h / 2 + r), fill=MAGENTA + ((255,) if mode == 'RGBA' else ()))
    b = io.BytesIO(); im.save(b, 'PNG' if mode == 'RGBA' else 'JPEG', **({} if mode == 'RGBA' else {'quality': 92})); return b.getvalue()
BILDER = {   # name: (bytes, dateiname, typ, bildfarbe)
    'hoch': (bild(1200, 1800, (20, 40, 90)), 'hoch.jpg', 'image/jpeg', (20, 40, 90)),          # dunkel (helle Schrift)
    'quer': (bild(1800, 1200, (240, 220, 120)), 'quer.jpg', 'image/jpeg', (240, 220, 120)),    # hell (dunkle Schrift)
    'quadrat': (bild(1500, 1500, (0, 140, 150)), 'quadrat.jpg', 'image/jpeg', (0, 140, 150)),
    'transparent': (bild(1000, 1400, (0, 0, 0, 0), 'RGBA'), 'transparent.png', 'image/png', None),
}
MK = """(a) => { const bin = atob(a.b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new File([u], a.name, { type: a.type }); }"""

HOOK = """() => { if (window.__c5hook) return; window.__c5hook = true; const orig = renderSectionsToPdf;
  window.renderSectionsToPdf = async function (o) { const sec = document.querySelector('#printRoot .pv-cover');
    window.__c5cover = sec ? { html: sec.outerHTML.length, editor: sec.querySelectorAll('[class*="ce-"]').length + (/ce-(frame|guides|overlay|grip)/.test(sec.outerHTML) ? 1 : 0),
      textColor: sec.querySelector('.cv-textlayer') ? getComputedStyle(sec.querySelector('.cv-textlayer')).color : 'none',
      blockColors: Array.from(sec.querySelectorAll('.cv-block, .cv-date')).map(e => getComputedStyle(e).color) } : null;
    return orig.apply(this, arguments); }; }"""

async def setup_book(ev, title, subtitle, author, cover):
    await ev("""(a) => { const c = getCookbookConfig(); c.items = [{ recipeId: state.recipes[0].id, chapterId: '' }]; c.chapters = [];
        c.title = a.title; c.subtitle = a.subtitle; c.author = a.author; c.showLogo = true; c.cover = a.cover; saveCookbookConfig(c); }""",
             {'title': title, 'subtitle': subtitle, 'author': author, 'cover': cover})

async def ui_export(page):
    """Echte Oberflaeche: Schritt 3 -> «PDF-Vorschau erstellen» (v83: erstellt direkt, ohne zweiten Optionsdialog). Liefert (pdf-bytes|None, fehlertext)."""
    ev = page.evaluate
    await ev("() => { state.modal = null; state.view = 'cookbook'; state.cookbookStep = 3; render(); window.__c5cover = null; }")
    await page.wait_for_selector('[data-action="export-cookbook"]:not([disabled])', timeout=15000)
    await page.click('[data-action="export-cookbook"]')
    await page.wait_for_function("state.modal && (state.modal.stage === 'preview' || state.modal.stage === 'error')", timeout=90000)
    r = await ev("""async () => { const m = state.modal; if (m.stage === 'error') return { err: m.errorText || '', shown: (document.querySelector('.pdf-error-text') || {}).textContent || '' };
        const u = new Uint8Array(await m.previewBlob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return { b64: btoa(s) }; }""")
    await ev("() => { if (typeof pdfExportAbort === 'function') pdfExportAbort(); state.modal = null; render(); }")
    if 'err' in r: return None, r
    return base64.b64decode(r['b64']), None

PREVIEW_JS = """async () => { await coverEnsureFonts(); const cfg = getCookbookConfig(); const L = coverLayout(coverInputFromConfig(cfg));
  const bg = L.background ? await coverBackgroundDataUrl(L.templateId) : null; const c = await coverRenderCanvas(L, 2, bg);   // gleiche Aufloesung wie der Export (feine Motive: sonst nur Abtastunterschiede)
  const B = coverExportBlockers(L);
  return { png: c.toDataURL('image/png'), blockers: B, warnings: L.warnings.map(w => w.kind + ':' + w.fieldId), image: L.image, mode: L.mode || 'v1',
    texts: L.blocks.map(b => b.lines.join(' ')).concat(L.date ? [L.date.text] : []),
    boxes: L.blocks.map(b => ({ id: b.id || b.key, x: b.x, y: b.y, w: b.w, h: b.h, lines: b.lines.length })), logo: L.logo, date: L.date ? { y: L.date.y, h: L.date.h } : null }; }"""

def png_from_dataurl(d):
    return Image.open(io.BytesIO(base64.b64decode(d.split(',')[1]))).convert('RGB')
def render_page1(pdf_path, out_png, dpi=72):
    subprocess.run(['pdftoppm', '-f', '1', '-l', '1', '-r', str(dpi), '-png', '-singlefile', pdf_path, out_png], check=True)
    im = Image.open(out_png + '.png').convert('RGB')
    return im if im.size == (W72, H72) or dpi != 72 else im.resize((W72, H72), Image.LANCZOS)   # pdftoppm rundet 595.28 pt auf 596 px
def diff_stats(a, b):
    d = ImageChops.difference(a, b).convert('L'); h = d.histogram(); n = sum(h)
    return ImageStat.Stat(d).mean[0], sum(h[61:]) / n * 100
TILE, TILE_MAX = 24, 14   # gemessen: normale Faelle hoechstens etwa 9, fehlendes Datum 26, Titel 2 px verschoben 29
def tile_max(a, b):
    """Groesste mittlere Abweichung einer 24-px-Kachel (nach leichter Unschaerfe), je Kachel mit dem besten Versatz von hoechstens 1 px
    (PDF und Vorschau weichen oben um etwa 1 px bei 72 dpi ab, auch beim alten v1-Stand: Rundung, kein Fehler). Liefert (Wert, Lage)."""
    ga, gb = a.filter(ImageFilter.GaussianBlur(1.2)).convert('L'), b.filter(ImageFilter.GaussianBlur(1.2)).convert('L')
    shifted = {(dx, dy): ImageChops.difference(ga, ImageChops.offset(gb, -dx, -dy)) for dx in (-1, 0, 1) for dy in (-1, 0, 1)}
    best = (0, None)
    for y in range(2, ga.size[1] - TILE - 1, TILE // 2):
        for x in range(2, ga.size[0] - TILE - 1, TILE // 2):
            m = min(ImageStat.Stat(d.crop((x, y, x + TILE, y + TILE))).mean[0] for d in shifted.values())
            if m > best[0]: best = (round(m, 1), (x, y))
    return best
def best_shift(a, b):
    ga, gb = a.convert('L'), b.convert('L'); best = None
    for dx in (-2, -1, 0, 1, 2):
        for dy in (-2, -1, 0, 1, 2):
            m = ImageStat.Stat(ImageChops.difference(ga.crop((4, 4, W72 - 4, H72 - 4)), gb.crop((4 + dx, 4 + dy, W72 - 4 + dx, H72 - 4 + dy)))).mean[0]
            if best is None or m < best[0] - 1e-6: best = (m, dx, dy)
    return (best[1], best[2])
def color_bbox(im, rgb, tol=60):
    r, g, b = rgb
    px = im.load(); W, H = im.size; xs = []; ys = []
    mask = Image.new('L', im.size, 0); mp = mask.load()
    for y in range(0, H):
        for x in range(0, W):
            p = px[x, y]
            if abs(p[0] - r) + abs(p[1] - g) + abs(p[2] - b) < tol: mp[x, y] = 255
    return mask.getbbox()

async def export_case(page, name, title, subtitle, author, cover, expect_block=False):
    ev = page.evaluate
    await setup_book(ev, title, subtitle, author, cover)
    try: pre = await ev(PREVIEW_JS)
    except Exception as e: pre = {'error': str(e)[:200], 'blockers': [], 'texts': []}
    data, err = await ui_export(page)
    res = {'name': name, 'pre': pre, 'err': err, 'probs': []}
    if expect_block:
        return res, data
    P = res['probs']
    if not data:
        why = await ev("async () => { try { await buildCookbookPdf('off'); return 'ok'; } catch (e) { return String(e && e.stack || e).slice(0, 400); } }")
        P.append(('kein PDF', err, why)); return res, None
    path = os.path.join(TMP, name + '.pdf'); open(path, 'wb').write(data); res['path'] = path
    info = subprocess.run(['pdfinfo', path], capture_output=True, text=True).stdout
    pages = int(re.search(r'Pages:\s+(\d+)', info).group(1))
    sz = re.search(r'Page size:\s+([\d.]+) x ([\d.]+)', info)
    if pages < 3: P.append(('zu wenige Seiten', pages))
    if not sz or abs(float(sz.group(1)) - 595.28) > 1.5 or abs(float(sz.group(2)) - 841.89) > 1.5: P.append(('nicht A4', sz.group(0) if sz else ''))
    # Textlayer der Titelseite: jedes Wort jedes sichtbaren Textes
    txt = subprocess.run(['pdftotext', '-f', '1', '-l', '1', path, '-'], capture_output=True, text=True).stdout
    flat = re.sub(r'\s+', '', txt)
    for t in [x for x in (title, subtitle, author) if x and x.strip()] + [x for x in pre['texts'] if re.fullmatch(r'\d\d\.\d\d\.\d{4}', x)]:
        if re.sub(r'\s+', '', t) not in flat: P.append(('Text fehlt im PDF-Textlayer', t[:40]))
    # Titelseite gerendert vs. Vorschau-Canvas
    pdf_im = render_page1(path, os.path.join(TMP, name + '-p1'))
    res['png'] = os.path.join(TMP, name + '-p1.png')
    prev = png_from_dataurl(pre['png']).resize((W72, H72), Image.LANCZOS)
    prev.save(os.path.join(TMP, name + '-vorschau.png'))
    if abs(pdf_im.size[0] - W72) > 1 or abs(pdf_im.size[1] - H72) > 1: P.append(('Groesse Titelseite', pdf_im.size))
    if pdf_im.size != (W72, H72): pdf_im = pdf_im.resize((W72, H72), Image.LANCZOS)   # pdftoppm rundet 595.28 pt auf 596 px
    mean, strong = diff_stats(prev, pdf_im)
    # Die Seite geht als JPEG ins PDF (PDF_JPEG_QUALITY): feine Strichmotive (z. B. Scherenschnitt) rauschen. Mittelwert daher zusaetzlich
    # nach leichter Unschaerfe (Rauschen weg, Verschiebungen, fehlende oder zusaetzliche Elemente bleiben sichtbar); starke Abweichungen roh.
    mean_b, _ = diff_stats(prev.filter(ImageFilter.GaussianBlur(1.2)), pdf_im.filter(ImageFilter.GaussianBlur(1.2)))
    shift = best_shift(prev, pdf_im)   # Gesamtversatz PDF gegen Vorschau (bekannt: etwa 1 px bei 72 dpi nach oben, auch beim alten v1-Stand)
    if max(abs(shift[0]), abs(shift[1])) > 1: P.append(('Titelseite gegen Vorschau verschoben (px bei 72 dpi)', shift))
    tile = tile_max(prev, pdf_im)   # ortlich: ein fehlendes Wort, Logo oder Datum faellt im Seitenmittel kaum auf, in seiner Kachel schon
    res['mean'], res['strong'], res['mean_b'], res['tile'] = round(mean, 2), round(strong, 2), round(mean_b, 2), (tile, shift)
    if mean_b > 3 or mean > 6 or strong > 1.5 or tile[0] > TILE_MAX: P.append(('weicht von der Vorschau ab', round(mean, 2), round(mean_b, 2), round(strong, 2), tile))
    if ImageStat.Stat(pdf_im.convert('L')).stddev[0] < 4: P.append(('leere Titelseite',))
    # Seitenkanten: Rasterbeschnitt/Versatz (Linux-Absicherung) - Randstreifen gleich der Vorschau
    for nm, box in (('oben', (0, 0, W72, 8)), ('unten', (0, H72 - 8, W72, H72)), ('links', (0, 0, 8, H72)), ('rechts', (W72 - 8, 0, W72, H72))):
        m, _ = diff_stats(prev.crop(box), pdf_im.crop(box))
        if m > 6: P.append(('Randstreifen weicht ab', nm, round(m, 1)))
    # Layout: keine Sperre, alle Felder in der Seite
    if pre['blockers']: P.append(('Export-Sperre im Layout', pre['blockers']))
    for b in pre['boxes']:
        if b['x'] < -0.001 or b['y'] < -0.001 or b['x'] + b['w'] > 1.001 or b['y'] + b['h'] > 1.001: P.append(('Feld ausserhalb', b['id']))
    # keine Editor-Elemente, sichtbarer Text nur im Canvas (Textlayer unsichtbar)
    cv = await ev("() => window.__c5cover")
    if not cv: P.append(('Titelseite nicht erfasst',))
    else:
        if cv['editor']: P.append(('Editor-Elemente im PDF', cv['editor']))
        if any(not re.search(r'rgba\(\d+, \d+, \d+, 0\)|transparent', c) for c in [cv['textColor']] + cv['blockColors']): P.append(('Textlayer sichtbar', cv['textColor'], cv['blockColors'][:2]))
    if BEISPIELE: shutil.copy(path, os.path.join(BEISPIELE, name + '.pdf')); pdf_im.save(os.path.join(BEISPIELE, name + '-titelseite.png'))
    return res, pdf_im

def measure_image(res, pdf_im, bgcol):
    """Bild im PDF gemessen: Kreis bleibt rund, Groesse/Lage wie im Layout; bei 'contain' Bildrechteck mit Originalverhaeltnis."""
    P = res['probs']; L = res['pre']['image']
    if not L: P.append(('kein Bild im Layout',)); return
    src, dst = L['src'], L['dst']
    sx, sy = dst['w'] * W72 / src['w'], dst['h'] * H72 / src['h']
    if abs(sx / sy - 1) > 0.005: P.append(('Layout streckt das Bild', round(sx / sy, 4)))
    w, h = res['imgwh']
    cb = color_bbox(pdf_im, MAGENTA, 90)
    if not cb: P.append(('Kreis nicht gefunden',)); return
    cw, ch = cb[2] - cb[0], cb[3] - cb[1]
    exp_d = 0.6 * min(w, h) * sx
    ex = dst['x'] * W72 + (w / 2 - src['x']) * sx; ey = dst['y'] * H72 + (h / 2 - src['y']) * sy
    res['circle'] = (cw, ch, round(exp_d, 1))
    if abs(cw / ch - 1) > 0.03: P.append(('Kreis verzerrt (Bild gestreckt)', cw, ch))
    if abs(cw - exp_d) > max(3, 0.03 * exp_d): P.append(('Kreisgroesse', cw, round(exp_d, 1)))
    if abs((cb[0] + cb[2]) / 2 - ex) > 3 or abs((cb[1] + cb[3]) / 2 - ey) > 3: P.append(('Bildausschnitt verschoben', ((cb[0] + cb[2]) / 2, (cb[1] + cb[3]) / 2), (round(ex, 1), round(ey, 1))))
    if L['fit'] == 'contain' and bgcol:
        rb = color_bbox(pdf_im, bgcol, 40)
        if not rb: P.append(('Bildflaeche nicht gefunden',)); return
        rw, rh = rb[2] - rb[0], rb[3] - rb[1]
        res['rect'] = (rw, rh)
        if abs(rw / rh - w / h) > 0.02 * (w / h): P.append(('Bildrechteck mit falschem Seitenverhaeltnis', rw, rh, round(w / h, 3)))
        if abs(rw - dst['w'] * W72) > 3 or abs(rh - dst['h'] * H72) > 3: P.append(('Bildrechteck weicht vom Layout ab', (rw, rh), (round(dst['w'] * W72), round(dst['h'] * H72))))

def custom(bg='#F7F4EE', image=None, fields=None, logo=None, readability='none', arrange=''):
    return {'v': 2, 'mode': 'custom', 'templateId': 'pop', 'date': '2026-10-09', 'showDate': True, 'bg': {'color': bg}, 'image': image,
            'fields': fields or {}, 'logo': logo or {'pos': 'top-right', 'variant': 'auto'}, 'readability': readability, 'arrange': arrange}

async def arranged(ev, cover, name, title, subtitle, author):
    """Anordnung wie im Editor anwenden (coverApplyArrangement mit denselben Texten)"""
    return await ev("""(a) => coverApplyArrangement(a.cover, a.name, { templateId: a.cover.templateId, title: a.title, slogan: a.subtitle, name: a.author, date: a.cover.date, showDate: a.cover.showDate, logo: true })""",
                    {'cover': cover, 'name': name, 'title': title, 'subtitle': subtitle, 'author': author})

async def v1_refs(p, site_dir):
    """Rendert die v1-Titelseiten mit dem Code in site_dir (alter Stand) als PDF -> PNG (72 dpi)."""
    SITE.set_dir(site_dir)
    try:
        b, ctx = await open_ctx(p, 1280, 900, 'no-preference')
        page = await ctx.new_page()
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(300)
        await page.evaluate("() => document.fonts.ready")
        out = {}
        for tid, t, s, a in V1_CASES:
            await setup_book(page.evaluate, t, s, a, {'v': 1, 'templateId': tid, 'date': '2026-10-09', 'showDate': True})
            r = await page.evaluate("""async () => { const r = await buildCookbookPdf('off'); const u = new Uint8Array(await r.blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); }""")
            pth = os.path.join(TMP, f'old-{tid}.pdf'); open(pth, 'wb').write(base64.b64decode(r))
            out[tid] = render_page1(pth, os.path.join(TMP, f'old-{tid}'))
        await b.close()
        return out
    finally:
        SITE.set_dir(ROOT)

async def main():
    if BEISPIELE: os.makedirs(BEISPIELE, exist_ok=True)
    async with async_playwright() as p:
        # ---------- 0. Referenz alter Stand ----------
        old = None
        try:
            subprocess.run(['git', 'cat-file', '-e', REF_COMMIT], cwd=ROOT, check=True, capture_output=True)
            old = await v1_refs(p, old_checkout(REF_COMMIT))
        except subprocess.CalledProcessError:
            print('INFO Git-Historie ohne', REF_COMMIT, ': nur Vergleich mit den gespeicherten Referenzbildern')
        if os.environ.get('SAVORA_COVER_REF_REGEN') and old:
            for tid, im in old.items(): im.save(os.path.join(DATA, f'cover_v1_{tid}.png'), optimize=True)
            print('INFO Referenzbilder neu geschrieben')

        b, ctx = await open_ctx(p, 1280, 900, 'no-preference')
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: LOG.append(m.text[:300]) if m.type in ('warning', 'error') else None)
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(300)
        await page.add_style_tag(content='::-webkit-scrollbar{display:none}html{scrollbar-width:none}')
        ev = page.evaluate
        await ev("() => document.fonts.ready"); await ev("() => coverEnsureFonts()"); await ev(HOOK)
        before_recipes = await ev("() => JSON.stringify(state.recipes.map(r => [r.id, r.title, r.ingredients]))")

        # ---------- 1. Bestehendes Buch mit bisherigem Cover (v1): pixelgleich zum Stand vor dem Editor ----------
        for tid, t, s, a in V1_CASES:
            res, im = await export_case(page, f'v1-{tid}', t, s, a, {'v': 1, 'templateId': tid, 'date': '2026-10-09', 'showDate': True})
            check(f'v1 «{tid}»: PDF ueber die Oberflaeche, Titelseite gleicht der Vorschau, Texte im Textlayer', not res['probs'], str(res['probs'][:4]) + f" mean={res.get('mean')}/{res.get('mean_b')} kachel={res.get('tile')}")
            if im is None: continue
            # Hauptnachweis «altes Cover unveraendert»: derselbe Browser auf derselben Plattform rendert den Stand vor dem Editor
            # (REF_COMMIT per git archive) und den heutigen Stand; beide PDFs muessen pixelgleich sein. Plattformunabhaengig,
            # weil Schriftrasterung (Mac gegen Linux) auf beiden Seiten gleich ist. Dazu kommt der v1-Layout-Schnappschuss
            # (test_cover_modell, cover_v1_layouts.json) und oben der Vergleich PDF gegen Vorschau-Canvas.
            if old:
                m2, st2 = diff_stats(old[tid], im)
                check(f'v1 «{tid}»: pixelgleich zum live gerenderten Stand {REF_COMMIT}', m2 < 0.2 and st2 < 0.02, f'mean={m2:.4f} stark={st2:.4f}%')
            # Die gespeicherten Referenzbilder stammen vom Mac (Schriftrasterung macOS). Linux rastert Schrift anders
            # (CI: mean 1.8, 0.8 % stark abweichende Pixel bei pixelgleichem Live-Vergleich), daher nur auf dem Mac vergleichen.
            if sys.platform == 'darwin':
                stored = Image.open(os.path.join(DATA, f'cover_v1_{tid}.png')).convert('RGB')
                m, st = diff_stats(stored, im)
                check(f'v1 «{tid}»: Titelseite gleicht dem gespeicherten Referenzbild (vor dem Editor, Mac)', m < 1.5 and st < 0.3, f'mean={m:.3f} stark={st:.3f}%')
            elif not old:
                check(f'v1 «{tid}»: Nachweis gegen den Stand vor dem Editor moeglich (volle Git-Historie noetig, fetch-depth 0)', False, REF_COMMIT)
            raw = await ev("() => cookbookGetRaw().cover")
            check(f'v1 «{tid}»: Export stuft die gespeicherte Konfiguration nicht auf v2 hoch', raw.get('v') == 1 and raw.get('templateId') == tid, str(raw))

        # ---------- 1b. v83: Name kommt aus der Kochbuch-Konfiguration (Feld «Name» des Titelblatts); leer = kein Name ----------
        for label, author, want, absent in (('Name eingetragen', 'Alex Muster', 'AlexMuster', None), ('Name leer', '', None, 'AlexMuster')):
            await setup_book(ev, 'Sonntagsküche', 'Rezepte für jeden Tag', author, {'v': 1, 'templateId': 'tomate', 'date': '2026-10-09', 'showDate': True})
            data, err = await ui_export(page)
            flat = ''
            if data:
                pth = os.path.join(TMP, f'name-{bool(author)}.pdf'); open(pth, 'wb').write(data)
                flat = re.sub(r'\s+', '', subprocess.run(['pdftotext', '-f', '1', '-l', '1', pth, '-'], capture_output=True, text=True).stdout)
            ok = bool(data) and (want is None or want in flat) and (absent is None or absent not in flat) and 'Sonntagsküche' in flat
            check(f'Cover: Name des Kochbuchs ({label}) steht auf der Titelseite bzw. fehlt', ok, str(err) if err else flat[:120])
        raw = await ev("() => cookbookGetRaw().author")
        check('Cover: Export aendert den gespeicherten Kochbuch-Namen nicht', raw == '', str(raw))

        # ---------- 2. Eigene Bilder importieren (echter Import, Paket C4) ----------
        imgs = {}
        for k, (data, fn, typ, col) in BILDER.items():
            r = await ev("""async (a) => { const f = (%s)(a); const r = await coverImageImport(f, 'c5test'); return r; }""" % MK, {'b64': base64.b64encode(data).decode(), 'name': fn, 'type': typ})
            imgs[k] = r
        check('Testbilder importiert (Hoch, Quer, Quadrat, transparente PNG) in Originalmassen', [(imgs[k]['w'], imgs[k]['h']) for k in BILDER] == [(1200, 1800), (1800, 1200), (1500, 1500), (1000, 1400)], str(imgs))

        T, S, A = 'Sonntagsküche', 'Rezepte für jeden Tag', 'Alex Muster'
        LIGHT = '#F7F4EE'
        light_fields = {k: {'color': LIGHT} for k in ('title', 'subtitle', 'name', 'date')}
        def img(k, fit, **kw): return dict({'id': imgs[k]['id'], 'fit': fit, 'cx': 0.5, 'cy': 0.5, 'zoom': 1, 'w': imgs[k]['w'], 'h': imgs[k]['h']}, **kw)

        # ---------- 3. Bilder: Hoch/Quer/Quadrat x contain/cover, transparente PNG; hell auf dunkel und umgekehrt ----------
        img_cases = []
        for k in ('hoch', 'quer', 'quadrat'):
            for fit in ('contain', 'cover'):
                dark = k == 'hoch'
                cov = custom(bg='#252720' if dark else '#F7F4EE', image=img(k, fit), fields=light_fields if dark else None,
                             logo={'pos': 'top-right', 'variant': 'light' if dark else 'dark'})
                cov = await arranged(ev, cov, 'Unten links', T, S, A)
                img_cases.append((f'bild-{k}-{fit}', cov, k))
        cov = custom(bg='#22382F', image=img('transparent', 'contain'), fields=light_fields, logo={'pos': 'top-right', 'variant': 'light'})
        img_cases.append(('bild-transparent-contain', await arranged(ev, cov, 'Unten links', T, S, A), 'transparent'))
        cov = custom(bg='#252720', image=img('hoch', 'cover', cx=0.45, cy=0.55, zoom=1.3), fields=light_fields, logo={'pos': 'top-right', 'variant': 'light'})
        img_cases.append(('bild-hoch-cover-ausschnitt-zoom', await arranged(ev, cov, 'Unten links', T, S, A), 'hoch'))
        for name, cov, k in img_cases:
            res, im = await export_case(page, name, T, S, A, cov)
            if im is not None:
                res['imgwh'] = (imgs[k]['w'], imgs[k]['h'])
                measure_image(res, im, BILDER[k][3])
            if k == 'transparent' and im is not None:
                # transparente Stellen zeigen die Hintergrundfarbe (#22382F), nicht schwarz
                L = res['pre']['image']['dst']; px = im.getpixel((int(L['x'] * W72) + 6, int(L['y'] * H72) + 6))
                if abs(px[0] - 0x22) + abs(px[1] - 0x38) + abs(px[2] - 0x2F) > 20: res['probs'].append(('transparente Stelle nicht in Hintergrundfarbe', px))
            check(f'{name}: PDF gleicht der Vorschau, Bild nie gestreckt, Ausschnitt wie im Layout, Texte vollstaendig', not res['probs'], str(res['probs'][:4]) + f" mean={res.get('mean')} kreis={res.get('circle')} rect={res.get('rect')}")

        # ---------- 4. Eigene Farbe, Lesbarkeit, Textvarianten ----------
        LONG_T = 'Die allerbesten Familienrezepte aus drei Generationen und vielen Ländern'
        LONG_S = 'Gesammelt über viele Jahre, mit Liebe weitergegeben, von Hand ergänzt und immer wieder neu ausprobiert'
        LONG_N = 'Familie Beispiel-Muster-Lüdenscheidt aus dem schönen Emmental im Kanton Bern'
        text_cases = [
            ('farbe-dunkel-hell', T, S, A, custom(bg='#22382F', fields=light_fields, logo={'pos': 'top-right', 'variant': 'light'})),
            ('farbe-tomate-textflaeche', T, S, A, custom(bg='#B93B2C', readability='panel')),
            ('farbe-eigene-verlauf', T, S, A, custom(bg='#5A3E8C', fields=light_fields, readability='gradient', logo={'pos': 'top-right', 'variant': 'light'})),
            ('bild-hoch-cover-textflaeche', T, S, A, custom(image=img('hoch', 'cover'), readability='panel', logo={'pos': 'top-right', 'variant': 'light'})),
            ('bild-quer-cover-verlauf', T, S, A, custom(image=img('quer', 'cover'), readability='gradient')),
            ('text-kurz-leere-felder', 'Brot', '', '', custom()),
            ('text-mehrzeilig', LONG_T, S, A, custom()),
            ('text-langes-wort', 'Donaudampfschifffahrt', S, A, custom(fields={'title': {'fontPt': 44}})),
            ('text-langer-name-untertitel', T, LONG_S, LONG_N, custom()),
            ('text-umlaute-weitere-zeile', 'Grüsse aus Zürich', 'Crème brûlée, Käsespätzle & Röstì', 'Zoë Ñúñez', custom(fields={'extra1': {'text': 'Für alle Gäste am Tisch'}})),
            ('vorlage-mit-abweichung', T, S, A, {'v': 2, 'mode': 'template', 'templateId': 'salbei', 'date': '2026-10-09', 'showDate': True, 'fields': {'title': {'color': '#B93B2C', 'y': 0.3}}, 'logo': {'pos': 'top-right', 'variant': 'auto'}, 'readability': 'none', 'arrange': ''}),
        ]
        if await ev("() => typeof pdfApplyTextTransform === 'function'"):   # Hotfix 0.77.1 (CSS-Grossschreibung von «ß» brach html2canvas): erst danach pruefbar
            text_cases.append(('text-scharfes-s', 'Großmutters Strauß', 'Süßes und Gießen', 'Familie Weiß', custom()))
        else: print('INFO Fall «ß» uebersprungen: pdfApplyTextTransform (Hotfix 0.77.1) noch nicht im Stand')
        for name, t, s, a, cov in text_cases:
            res, im = await export_case(page, name, t, s, a, cov)
            extra = ''
            if name == 'text-mehrzeilig':
                n = next((x['lines'] for x in res['pre']['boxes'] if x['id'] == 'title'), 0)
                if n < 2: res['probs'].append(('Titel nicht mehrzeilig', n))
            if name in ('farbe-tomate-textflaeche', 'farbe-dunkel-hell', 'farbe-eigene-verlauf', 'text-kurz-leere-felder'):
                ur = [w for w in res['pre'].get('warnings', []) if w.startswith('unreadable')]
                if ur: res['probs'].append(('Standardgestaltung ist schwer lesbar (automatische Schriftfarbe passt nicht zur Lesbarkeitsflaeche)', ur))
            if name == 'text-kurz-leere-felder':
                ids = [x['id'] for x in res['pre']['boxes']]
                if ids != ['title']: res['probs'].append(('leere optionale Felder erzeugen Elemente', ids))
            check(f'{name}: PDF gleicht der Vorschau, keine Sperre, Texte vollstaendig im Textlayer, keine leere Seite', not res['probs'], str(res['probs'][:4]) + f" mean={res.get('mean')}/{res.get('mean_b')} kachel={res.get('tile')}")

        # ---------- 5. Alle sechs Anordnungen mit Logo-Positionen und -Varianten ----------
        combos = [('Oben links', 'bottom-right', 'dark', '#F7F4EE', None), ('Oben mittig', 'top-left', 'light', '#22382F', light_fields),
                  ('Mittig', 'top-right', 'dark', '#E9D8A6', None), ('Unten links', 'top-left', 'dark', '#F7F4EE', None),
                  ('Unten mittig', 'top-right', 'light', '#252720', light_fields), ('Frei platzieren', 'bottom-right', 'light', '#B93B2C', light_fields)]
        for arr, lpos, lvar, bg, flds in combos:
            cov = custom(bg=bg, fields=flds, logo={'pos': lpos, 'variant': lvar})
            cov = await arranged(ev, cov, arr, T, S, A)
            name = 'anordnung-' + arr.lower().replace(' ', '-') + f'-logo-{lpos}-{lvar}'
            res, im = await export_case(page, name, T, S, A, cov)
            lg = res['pre']['logo']
            if not lg or lg.get('pos') != lpos or lg.get('variant') != lvar: res['probs'].append(('Logo', lg))
            elif im is not None:   # Wortmarke im PDF an ihrer Stelle sichtbar (Unterschied zur Seitenfarbe im Logo-Rechteck)
                box = (int(lg['x'] * W72), int(lg['y'] * H72), int((lg['x'] + lg['w']) * W72), int((lg['y'] + lg['h']) * H72))
                if ImageStat.Stat(im.crop(box).convert('L')).stddev[0] < 20: res['probs'].append(('Wortmarke nicht sichtbar', box))
            if res['pre']['warnings']: res['probs'].append(('Warnungen', res['pre']['warnings']))
            check(f'Anordnung «{arr}», Logo {lpos}/{lvar}: PDF gleicht der Vorschau, Wortmarke an ihrer Stelle, keine Warnung', not res['probs'], str(res['probs'][:4]) + f" mean={res.get('mean')}/{res.get('mean_b')} kachel={res.get('tile')}")

        # ---------- 5b. Gedrehte Texte und Zusatzbilder (unter und über dem Text, gedreht) ----------
        def extra(k, x, y, w, rot, z):
            return {'id': f'e-{k}-{z}', 'imgId': imgs[k]['id'], 'x': x, 'y': y, 'w': w, 'rot': rot, 'z': z, 'iw': imgs[k]['w'], 'ih': imgs[k]['h']}
        rot_cases = []
        for tr in (15, -30):
            cov = custom(fields={'title': {'y': 0.24, 'rot': tr}, 'subtitle': {'y': 0.46, 'rot': -12}, 'name': {'y': 0.56}},
                         )
            cov['images'] = [extra('quer', 0.3, 0.78, 0.36, -10, 'below'), extra('quadrat', 0.74, 0.76, 0.26, 20, 'above')]
            rot_cases.append((f'gedreht-titel{tr}-zwei-zusatzbilder', cov, tr))
        for name, cov, tr in rot_cases:
            res, im = await export_case(page, name, T, S, A, cov)
            lay = await ev("() => { const L = coverLayout(coverInputFromConfig(getCookbookConfig())); return { rots: L.blocks.map(b => [b.id, b.rot, b.bbox]), imgs: L.images.map(i => [i.cx, i.cy, i.z, i.rot]), warn: L.warnings.map(w => w.kind + ':' + w.fieldId) }; }")
            if im is not None:
                # Zusatzbilder sichtbar: Bildmitte magenta (Kreis), unter dem Text liegendes Bild wird vom Text nicht ganz verdeckt
                for cx, cy, z, rot in lay['imgs']:
                    px = im.getpixel((int(cx * W72), int(cy * H72)))
                    if abs(px[0] - MAGENTA[0]) + abs(px[1] - MAGENTA[1]) + abs(px[2] - MAGENTA[2]) > 90: res['probs'].append(('Zusatzbild fehlt im PDF', z, px))
                # gedrehter Titel nicht abgeschnitten: gedrehte Huelle ganz in der Seite
                for bid, rot, bb in lay['rots']:
                    if rot and (bb['x'] < 0 or bb['y'] < 0 or bb['x'] + bb['w'] > 1 or bb['y'] + bb['h'] > 1): res['probs'].append(('gedrehtes Feld ragt hinaus', bid, bb))
                # Textlayer: gedrehter Titel als gedrehte Zeile (pdftotext -bbox: Woerter des Untertitels in Leserichtung)
                bbox = subprocess.run(['pdftotext', '-f', '1', '-l', '1', '-bbox', res['path'], '-'], capture_output=True, text=True).stdout
                words = re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="[\d.]+" yMax="[\d.]+">([^<]+)</word>', bbox)
                if not any(w[2] == T for w in words): res['probs'].append(('Titel fehlt im Textlayer', [w[2] for w in words][:10]))
            if [r[1] for r in lay['rots']][:2] != [tr, -12]: res['probs'].append(('Drehung nicht im Layout', lay['rots']))
            if any(not w.startswith('overlap') for w in lay['warn']): res['probs'].append(('Warnungen', lay['warn']))
            check(f'{name}: PDF gleicht der Vorschau, gedrehte Texte vollständig und auswählbar, Zusatzbilder sichtbar, nichts abgeschnitten', not res['probs'], str(res['probs'][:4]) + f" mean={res.get('mean')}/{res.get('mean_b')} kachel={res.get('tile')}")
        miss = custom(fields={})
        miss['images'] = [{'id': 'fehlt', 'imgId': 'cover-c5-zusatz-gibtsnicht', 'x': 0.5, 'y': 0.7, 'w': 0.3, 'iw': 100, 'ih': 100}]
        res, data = await export_case(page, 'sperre-zusatzbild-fehlt', T, S, A, miss, expect_block=True)
        err = res['err'] or {}
        check('sperre-zusatzbild-fehlt: Export gesperrt mit verständlicher Meldung, kein PDF', data is None and 'zusätzliches Bild' in (err.get('err') or ''), str(err)[:200])

        # ---------- 6. Neue Vorlagen (Paket K1), sobald vorhanden ----------
        new_ids = await ev("() => COVER_TEMPLATES.map(t => t.id).slice(10)")
        if not new_ids: print('INFO Neue Vorlagen noch nicht vorhanden')
        for tid in new_ids:
            res, im = await export_case(page, f'vorlage-{tid}', T, S, A, {'v': 1, 'templateId': tid, 'date': '2026-10-09', 'showDate': True})
            check(f'Neue Vorlage «{tid}»: PDF gleicht der Vorschau, Texte vollstaendig', not res['probs'], str(res['probs'][:4]) + f" mean={res.get('mean')}/{res.get('mean_b')} kachel={res.get('tile')}")
            cov = custom(fields={'title': {'color': '#B93B2C'}})
            cov.update({'mode': 'template', 'templateId': tid})
            res, im = await export_case(page, f'vorlage-{tid}-mittig', T, S, A, await arranged(ev, cov, 'Mittig', T, S, A))
            check(f'Neue Vorlage «{tid}» mit Anordnung «Mittig» und eigener Titelfarbe', not res['probs'], str(res['probs'][:4]) + f" mean={res.get('mean')}/{res.get('mean_b')} kachel={res.get('tile')}")

        # ---------- 7. Export-Sperre: cut, outside, fehlendes Bild -> Meldung, kein PDF ----------
        blocks = [('sperre-wort', 'Donaudampfschifffahrtsgesellschaftskapitänsmützenhersteller', S, A, custom(fields={'title': {'fontPt': 90}}), 'Wort'),
                  ('sperre-ausserhalb', T, S, A, custom(fields={'title': {'x': 0.6, 'y': 0.3, 'w': 0.8}}), 'ausserhalb'),
                  ('sperre-unten', LONG_T + ' ' + LONG_T, S, A, custom(fields={'title': {'y': 0.8}}), 'Seite'),
                  ('sperre-bild-fehlt', T, S, A, custom(image={'id': 'cover-c5-gibtsnicht', 'fit': 'cover', 'cx': 0.5, 'cy': 0.5, 'zoom': 1, 'w': 1000, 'h': 1000}), 'Bild')]
        for name, t, s, a, cov, word in blocks:
            res, data = await export_case(page, name, t, s, a, cov, expect_block=True)
            err = res['err'] or {}
            check(f'{name}: Export gesperrt, verstaendliche Meldung im Dialog, kein PDF', data is None and word in (err.get('err') or '') and (err.get('err') or '')[:30] in (err.get('shown') or ''), str(err)[:200])
            if name != 'sperre-bild-fehlt':
                check(f'{name}: dieselbe Sperre steht vorher im Layout (coverExportBlockers)', bool(res['pre']['blockers']), str(res['pre']['blockers'])[:120])

        # ---------- 8. Daten bleiben ----------
        check('Rezepte unveraendert nach allen Exporten', await ev("() => JSON.stringify(state.recipes.map(r => [r.id, r.title, r.ingredients]))") == before_recipes)
        check('Cover-Bilder nach den Exporten weiter im Store', await ev("(ids) => Promise.all(ids.map(i => dbGetImage(i))).then(l => l.every(x => x && x.blob))", [v['id'] for v in imgs.values()]))
        check('Kein Seitenfehler', not errs, str(errs[:3]))
        await b.close()
    print('\nFEHLER:', FAIL if FAIL else 'keine')
    sys.exit(1 if FAIL else 0)

asyncio.run(main())
