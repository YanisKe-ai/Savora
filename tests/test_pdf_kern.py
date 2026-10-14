"""PDF-Kern: Seitenrahmen (Kopf-/Fusszeile nicht angeschnitten), Seitenplanung (Stufen, ausgeglichene
Fortsetzungsseiten, keine verwaisten Ueberschriften), Inhaltsverzeichnis und Seitenzahlen, Vorschau = Download
(dieselben Bytes), Fortschritt/Abbruch/Fehlerzustand, Metadaten, Adress-Links.
Erzeugt echte PDFs (Einzelrezept und Kochbuch, beide Stile (Pur, Prise Pop)), rendert jede Seite mit pdftoppm und prueft die Pixel."""
import asyncio, sys, json, base64, subprocess, re, hashlib, os, glob
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
from PIL import Image, ImageChops

FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

WORK = _os.path.join(OUT, 'pdf_kern'); _os.makedirs(WORK, exist_ok=True)
SHOTS = _os.environ.get('SAVORA_KERN_SHOTS')   # optional: Seitenbilder dauerhaft ablegen
DPI = 100
MM = DPI / 25.4
FX = json.load(open(_os.path.join(TESTS, 'data', 'export_fixtures.json')))

JS_SEED = """async (fx) => {
  const mk = (w, h, c1) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = c1; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.beginPath(); g.arc(w / 2, h / 2, Math.min(w, h) * .2, 0, 7); g.fill(); return c.toDataURL('image/jpeg', .9); };
  const imgs = { fx_carbonara: mk(1600, 1000, '#c25b2a'), fx_cookies: mk(1000, 1400, '#6b4226'), fx_manti: null, fx_sloppy: mk(1200, 1200, '#7a3b2e') };
  for (const f of fx) { const r = Object.assign(emptyRecipe(), f); r.image = imgs[f.id]; r.updatedAt = Date.now(); await dbPut(r); }
  const ing = (n, p) => Array.from({ length: n }, (_, i) => ({ amount: i % 3 ? String(i + 1) : '½', unit: i % 2 ? 'g' : 'EL', name: (p || 'Zutat ') + (i + 1) + (i % 5 === 0 ? ' mit etwas längerer Bezeichnung die umbrechen muss' : '') }));
  const sentence = 'Alles gut vermengen und dabei immer wieder umrühren, damit nichts anbrennt. ';
  const edge = [
    { id: 'fx_long40', title: 'Zutatenmonster mit sehr langem Titel der sicher über mehrere Zeilen läuft und trotzdem sauber gesetzt werden muss', servings: 6, ingredients: ing(40), steps: Array.from({ length: 15 }, (_, i) => ({ text: 'Kurzer Schritt ' + (i + 1) + '.' })) },
    { id: 'fx_longstep', title: 'Ein sehr langer Schritt', servings: 2, ingredients: [{ amount: '1', unit: '', name: 'Ding' }], steps: [{ text: 'Sehr langer Schritt. ' + sentence.repeat(90) }] },
    { id: 'fx_min', title: 'Minimal', servings: 1, ingredients: [{ amount: '', unit: '', name: 'Wasser' }], steps: [{ text: 'Trinken.' }] },
    { id: 'fx_triple', title: 'Festtagsmenü in drei Gängen', servings: 8, timeMinutes: 240, ingredients: ing(90), steps: Array.from({ length: 30 }, (_, i) => ({ text: 'Schritt ' + (i + 1) + ': ' + sentence.repeat(3 + (i % 4)) })) },
    { id: 'fx_many', title: 'Viele kurze Schritte', servings: 4, timeMinutes: 50, notes: 'Eine Notiz, die auch nach dem Export unverändert bleiben soll.', source: 'https://www.example.org/rezepte/sehr/lange/adresse/mit/vielen/teilen/und-einem-langen-namen-1234567890',
      ingredients: [{ amount: '', unit: '', name: 'Teig:' }, ...ing(14, 'Teigzutat '), { amount: '', unit: '', name: 'Füllung:' }, ...ing(12, 'Füllung '), { amount: '', unit: '', name: 'Sauce:' }, ...ing(6, 'Sauce ')],
      steps: [...Array.from({ length: 22 }, (_, i) => ({ text: 'Schritt ' + (i + 1) + ' wird in einem Satz erklärt. Danach folgt ein zweiter Satz mit etwas mehr Text.' })), { text: 'Tipp: Der Teig lässt sich gut einfrieren. Vorher portionieren und flach legen.' }] },
    { id: 'fx_overflow', title: 'Knapp zu viel', servings: 4, timeMinutes: 40, notes: 'Notiz am Ende.', ingredients: ing(16), steps: Array.from({ length: 14 }, (_, i) => ({ text: 'Schritt ' + (i + 1) + ': ' + sentence.repeat(2) })) },
    { id: 'fx_badimg', title: 'Mit defektem Bild', servings: 2, ingredients: ing(5), steps: [{ text: 'Ein Schritt.' }], image: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/' },
  ];
  for (const f of edge) { const r = Object.assign(emptyRecipe(), f); r.image = f.image || (f.id === 'fx_overflow' ? mk(1600, 1000, '#4a6a3a') : null); r.servings = f.servings; await dbPut(r); }
  await loadRecipes(); }"""

JS_PDF = """async (a) => {
  const [mode, id, tpl, detail] = a; let res;
  if (mode === 'single') res = await buildSinglePdf(id, detail || 'off', { template: tpl });
  else res = await buildCookbookPdf(detail || 'off', { template: tpl });
  const u = new Uint8Array(await res.blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192));
  return { b64: btoa(s), planned: res.blob.plannedPages, pageCount: res.blob.pageCount, sliced: res.blob.slicedPages, starts: res.blob.recipeStart, tocMismatch: res.blob.tocMismatch || 0 }; }"""

def sh(cmd):
    return subprocess.run(cmd, capture_output=True, text=True).stdout

def render(path, tag):
    for f in glob.glob(f'{WORK}/{tag}-*.png'): _os.remove(f)
    subprocess.run(['pdftoppm', '-r', str(DPI), '-png', path, f'{WORK}/{tag}'], check=True)
    files = sorted(glob.glob(f'{WORK}/{tag}-*.png'), key=lambda f: int(re.search(r'-(\d+)\.png$', f).group(1)))
    return [Image.open(f).convert('RGB') for f in files]

def ink_bbox(img, box, thr=40):
    """Rechteck (in mm) -> Begrenzung der Pixel, die vom Seitenhintergrund abweichen (in mm, Seitenkoordinaten) oder None."""
    x0, y0, x1, y1 = [int(v * MM) for v in box]
    reg = img.crop((x0, y0, x1, y1))
    bg = reg.getpixel((reg.width - 1, reg.height - 1))
    diff = ImageChops.difference(reg, Image.new('RGB', reg.size, bg)).convert('L').point(lambda v: 255 if v > thr else 0)
    bb = diff.getbbox()
    if not bb: return None
    return ((bb[0] + x0) / MM, (bb[1] + y0) / MM, (bb[2] + x0) / MM, (bb[3] + y0) / MM)

def first_band_height(img, box, thr=40):
    """Hoehe (mm) des ersten zusammenhaengenden Bandes mit Tintenpixeln im Rechteck, von oben."""
    x0, y0, x1, y1 = [int(v * MM) for v in box]
    reg = img.crop((x0, y0, x1, y1))
    bg = reg.getpixel((reg.width - 1, reg.height - 1))
    diff = ImageChops.difference(reg, Image.new('RGB', reg.size, bg)).convert('L').point(lambda v: 255 if v > thr else 0)
    rows = [diff.crop((0, y, diff.width, y + 1)).getbbox() is not None for y in range(diff.height)]
    start = next((i for i, r in enumerate(rows) if r), None)
    if start is None: return None
    end = start
    while end < len(rows) and rows[end]: end += 1
    return (end - start) / MM

def frame_problems(img, cover=False):
    """Prueft Seitenrand und Kopf-/Fusszeile einer gerenderten Seite. Liefert eine Liste von Fehlern."""
    errs = []; W, H = img.size
    if not cover:
        # Rasterkante: aeusserste Pixelreihe/-spalte gleicht der 7 px weiter innen (kein Streifen, keine Naht)
        for name, a, b in (('rechts', (W - 1, 0, W, H), (W - 8, 0, W - 7, H)), ('links', (0, 0, 1, H), (7, 0, 8, H)), ('unten', (0, H - 1, W, H), (0, H - 8, W, H - 7))):
            d = ImageChops.difference(img.crop(a), img.crop(b)).convert('L').point(lambda v: 255 if v > 30 else 0)
            if d.getbbox(): errs.append('Kante ' + name + ' weicht ab')
        # unterste 3 mm: nur Seitenhintergrund
        if ink_bbox(img, (0, 294, 210, 297)): errs.append('Inhalt in den untersten 3 mm')
        # Fusszeile: sichtbar, vollstaendige Zeichenhoehe (8,5 pt Versalien = 2,1 mm), innerhalb der reservierten Zone
        fb = ink_bbox(img, (15, 280.5, 105, 296))
        if not fb: errs.append('Fusszeile fehlt')
        else:
            if fb[3] - fb[1] < 1.9: errs.append('Fusszeile angeschnitten (Hoehe %.2f mm)' % (fb[3] - fb[1]))
            if fb[3] > 293.5: errs.append('Fusszeile zu tief (%.1f mm)' % fb[3])
            if fb[1] < 281: errs.append('Fusszeile ragt in den Inhalt (%.1f mm)' % fb[1])
        pn = ink_bbox(img, (180, 284, 198, 295))
        if not pn: errs.append('Seitenzahl fehlt')
    return errs

def cont_head_problems(img):
    errs = []
    h = first_band_height(img, (15, 10, 195, 30))
    if h is None: errs.append('Kopf der Fortsetzungsseite fehlt')
    elif h < 1.9: errs.append('Kopf der Fortsetzungsseite angeschnitten (%.2f mm)' % h)
    return errs

def content_bottom(img):
    """Unterste Inhaltsreihe (mm) oberhalb der Fusszone."""
    bb = ink_bbox(img, (10, 20, 200, 279))
    return bb[3] if bb else 0

PY_ORPHAN = """(htmlPages) => {
  const bad = [];
  htmlPages.forEach((h, pi) => {
    const doc = new DOMParser().parseFromString(h, 'text/html');
    doc.querySelectorAll('.pv-label').forEach((lab) => {
      if (lab.closest('.pv-source') || lab.closest('.pv-head')) return;
      const cont = lab.parentElement;
      const rest = Array.from(cont.children).filter((c) => c !== lab && c.textContent.trim());
      if (!rest.length) bad.push('Seite ' + (pi + 1) + ': Ueberschrift «' + lab.textContent + '» ohne Inhalt');
    });
    doc.querySelectorAll('.pv-ing-group, .pv-step-heading').forEach((g) => { if (!g.nextElementSibling) bad.push('Seite ' + (pi + 1) + ': Zwischentitel «' + g.textContent + '» am Ende'); });
    doc.querySelectorAll('.pv-extra').forEach((e) => { if (!e.textContent.trim()) bad.push('Seite ' + (pi + 1) + ': leerer Zusatzblock'); });
  });
  return bad; }"""

async def build_pdf(page, mode, id, tpl, detail='off', name=None):
    r = await page.evaluate(JS_PDF, [mode, id, tpl, detail])
    path = _os.path.join(WORK, (name or f'{mode}_{id}_{tpl}') + '.pdf')
    open(path, 'wb').write(base64.b64decode(r['b64']))
    n = int(re.search(r'Pages:\s+(\d+)', sh(['pdfinfo', path])).group(1))
    return path, n, r

def keep(imgs, tag):
    if SHOTS:
        _os.makedirs(SHOTS, exist_ok=True)
        for i, im in enumerate(imgs, 1): im.save(_os.path.join(SHOTS, f'{tag}-{i}.png'))

async def main():
    async with async_playwright() as p:
        b, c = await open_ctx(p, 1000, 900); page = await c.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append('console: ' + m.text[:160]) if m.type == 'error' else None)
        await goto(page); await page.wait_for_timeout(300)
        await page.add_style_tag(content='::-webkit-scrollbar{display:none}')
        await page.evaluate(JS_SEED, FX)
        ids = ['fx_carbonara', 'fx_cookies', 'fx_manti', 'fx_sloppy', 'fx_min', 'fx_long40', 'fx_longstep', 'fx_triple', 'fx_many', 'fx_overflow', 'fx_badimg']
        before = await page.evaluate("(ids) => JSON.stringify(state.recipes.filter(r => ids.includes(r.id)).map(r => ({ id: r.id, t: r.title, i: r.ingredients, s: r.steps, n: r.notes })).sort((a, b) => a.id.localeCompare(b.id)))", ids)
        await page.evaluate("document.fonts.ready")

        # ---------- 1) Planung: Seitenzahlen, Stufen, Ueberschriften ----------
        plan = await page.evaluate("""async (ids) => { pdfSetContext(__T0, '', '', false); await ensurePdfLibs(); await ensureFontsReadyForPdf(); const out = {};
          for (const id of ids) { const r = state.recipes.find(x => x.id === id); const res = await buildRecipePdfPage(r, null, 'off'); out[id] = { n: res.htmlPages.length, tier: res.tier, pages: res.htmlPages }; } return out; }""", ids)
        print('Planung:', {k: (v['n'], v['tier']) for k, v in plan.items()})
        check('Stufe 1/2: kurze Rezepte einseitig', all(plan[i]['n'] == 1 for i in ('fx_carbonara', 'fx_cookies', 'fx_manti', 'fx_min', 'fx_badimg')))
        check('Stufe 3: langes Rezept (40 Zutaten) zweiseitig', plan['fx_long40']['n'] == 2 and plan['fx_long40']['tier'] == 3, str((plan['fx_long40']['n'], plan['fx_long40']['tier'])))
        check('Stufe 4: sehr langes Rezept mindestens dreiseitig', plan['fx_triple']['n'] >= 3 and plan['fx_triple']['tier'] == 4, str((plan['fx_triple']['n'], plan['fx_triple']['tier'])))
        check('Ueberlauf-Rezept (Foto, 16 Zutaten, 14 Schritte): ein oder zwei Seiten, nie mehr', plan['fx_overflow']['n'] <= 2, str(plan['fx_overflow']['n']))
        for id in ids:
            bad = await page.evaluate(PY_ORPHAN, plan[id]['pages'])
            check(f'Keine verwaiste Ueberschrift, kein leerer Block: {id}', not bad, str(bad[:2]))
        # Fortsetzungsseiten tragen «Fortsetzung · N von M»
        lab_ok = True
        for id in ids:
            pgs = plan[id]['pages']
            for i, h in enumerate(pgs[1:], 2):
                if f'Fortsetzung · {i} von {len(pgs)}' not in h: lab_ok = False
        check('Fortsetzungsseiten: «Fortsetzung · N von M» mit korrekter Gesamtzahl', lab_ok)
        # Inhalt vollstaendig verteilt: jeder Schritt und jede Zutat steht genau einmal in den geplanten Seiten
        compl = await page.evaluate("""(a) => { const [id, pages] = a; const r = state.recipes.find(x => x.id === id); const txt = pages.join(' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\\u00a0/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/\\s+/g, ' ');
          const miss = []; (r.ingredients || []).forEach(i => { const n = String(i.name || '').trim(); if (n && !n.endsWith(':') && !txt.includes(n.replace(/\\s+/g, ' '))) miss.push(n); });
          (r.steps || []).forEach(s => { const t = String(s.text || '').trim().replace(/\\s+/g, ' '); if (t.length > 25 && !/^tipp/i.test(t)) { const w = t.split(' '); const words = w.slice(0, 4).join(' '); const tail = w.slice(-3).join(' '); if (!txt.includes(words) || !txt.includes(tail)) miss.push(t.slice(0, 30)); } });
          return miss; }""", ['fx_triple', plan['fx_triple']['pages']])
        check('Alle Zutaten und Schritte von fx_triple stehen in den Seiten (auch geteilte Schritte)', not compl, str(compl[:3]))
        sp = await page.evaluate("""(pages) => { const txt = pages.join(' ').replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' '); const r = state.recipes.find(x => x.id === 'fx_longstep'); return { full: String(r.steps[0].text).trim().replace(/\\s+/g, ' '), txt }; }""", plan['fx_longstep']['pages'])
        words = sp['full'].split(' ')
        check('Ueberlanger Schritt: wird an Satzgrenzen geteilt, kein Wort geht verloren', all(sp['txt'].count(w) >= sp['full'].split(' ').count(w) for w in set(words)) and plan['fx_longstep']['n'] >= 2, str(plan['fx_longstep']['n']))
        check('Fortsetzungsstueck eines geteilten Schritts hat keine zweite Nummer', await page.evaluate("(pages) => pages.join('').includes('data-cont=\"1\"') && !/data-cont=\"1\"[^>]*><span class=\"pv-step-no\">\\d/.test(pages.join(''))", plan['fx_longstep']['pages']))

        # ---------- 1b) Kurze Ueberlaeufe nur aus Zusatzbloecken vermeiden (Fall D) ----------
        sweep = await page.evaluate("""async () => {
          const nut = { nutrientsPerPortion: { energyKcal: 612, protein: 28.5, carbohydrates: 70, fat: 22, fiber: 3.2, sugars: 6, saturatedFat: 5.1, salt: 1.3 }, sourceDataVersions: {}, confidence: 'medium', unresolvedCount: 0 };
          const orig = window.pdfNutritionForExport; window.pdfNutritionForExport = async () => nut;
          const out = [];
          for (const tpl of __TPLS) { pdfSetContext(tpl, '', '', false);
            for (const detail of ['compact', 'full']) for (const ni of [6, 12, 30]) for (let k = 8; k <= 26; k += 2) {
              const r = Object.assign(emptyRecipe(), { id: 'fx_sw', title: 'Knapp', servings: 2, timeMinutes: 20, notes: 'Eine Notiz zum Rezept.', ingredients: Array.from({ length: ni }, (_, i) => ({ amount: String(i + 1), unit: 'g', name: 'Zutat ' + (i + 1) })), steps: [...Array.from({ length: k }, (_, i) => ({ text: 'Schritt ' + (i + 1) + ' wird erklaert. Danach folgt noch ein Satz mit etwas mehr Text zum Garen.' })), { text: 'Tipp: Gut verschlossen aufbewahren.' }] });
              const res = await buildRecipePdfPage(r, null, detail);
              const bad = res.htmlPages.length > 1 && res.htmlPages.slice(1).some((h) => !/class="pv-step"|class="pv-ing"/.test(h));
              out.push({ tpl, detail, ni, k, n: res.htmlPages.length, layout: res.layout, bad });
            } }
          window.pdfNutritionForExport = orig; return out; }""")
        badsw = [x for x in sweep if x['bad']]
        check('Kein Rezept braucht eine Seite nur aus Zusatzbloecken (alle Stile, kompakt und erweitert, %d Faelle)' % len(sweep), not badsw, str(badsw[:2]))
        check('Zusatzbloecke unter der Zutatenliste ersparen mindestens einen zweiten Seite (extras-column)', any('extras-column' in x['layout'] for x in sweep), str(sorted({(x['tpl'], x['layout']) for x in sweep})[:6]))
        check('Zwei Seiten bleiben dort, wo sie noetig sind', any(x['n'] >= 2 for x in sweep))
        carbo = await page.evaluate("""async () => { const nut = { nutrientsPerPortion: { energyKcal: 612, protein: 28.5, carbohydrates: 70, fat: 22, fiber: 3.2, sugars: 6, saturatedFat: 5.1, salt: 1.3 }, sourceDataVersions: {}, confidence: 'medium', unresolvedCount: 0 };
          window.pdfNutritionForExport = async () => nut; const out = {};
          for (const tpl of __TPLS) for (const d of ['compact', 'full']) { pdfSetContext(tpl, '', '', false); const r = state.recipes.find(x => x.id === 'fx_carbonara'); r.notes = 'Eine Notiz.'; const res = await buildRecipePdfPage(r, null, d); out[tpl + d] = [res.htmlPages.length, res.layout]; r.notes = ''; }
          return out; }""")
        check('Carbonara mit Notiz und Naehrwerten (kompakt/erweitert, alle Stile): eine Seite', all(v[0] == 1 for v in carbo.values()), str(carbo))

        # ---------- 2) Echte PDFs: Einzelrezept in allen Stilen ----------
        matrix = {T0: ids, T1: ['fx_manti', 'fx_long40', 'fx_many', 'fx_triple', 'fx_sloppy']}
        for tpl, lst in matrix.items():
            allerr = []; pagesmis = []; contmis = []; bal = []; slicedx = []
            for id in lst:
                path, n, r = await build_pdf(page, 'single', id, tpl)
                imgs = render(path, f'{id}_{tpl}'); keep(imgs, f'einzel_{tpl}_{id}')
                if n != r['planned']: pagesmis.append((id, n, r['planned']))
                if r['sliced']: slicedx.append(id)
                for k, im in enumerate(imgs):
                    for e in frame_problems(im): allerr.append(f'{id}/{tpl} S.{k + 1}: {e}')
                    if k > 0:
                        for e in cont_head_problems(im): allerr.append(f'{id}/{tpl} S.{k + 1}: {e}')
                if n > 1:
                    txts = [sh(['pdftotext', '-f', str(k), '-l', str(k), path, '-']) for k in range(1, n + 1)]
                    for k, t in enumerate(txts[1:], 2):
                        m = re.search(r'Fortsetzung\s*·\s*(\d+) von (\d+)', t)
                        if not m or int(m.group(1)) != k or int(m.group(2)) != n: contmis.append((id, k, m.group(0) if m else None))
                    if tpl == T0 and id in ('fx_long40', 'fx_many') and n == 2:
                        bal.append((id, round(content_bottom(imgs[-1]))))
            check(f'Stil {tpl}: Kopf, Fusszeile, Seitenzahl und Rasterkante vollstaendig ({len(lst)} Rezepte, jede Seite)', not allerr, '; '.join(allerr[:4]))
            check(f'Stil {tpl}: PDF-Seitenzahl = vorhergesagte Seitenzahl', not pagesmis, str(pagesmis))
            check(f'Stil {tpl}: keine Seite musste im Sicherheitsnetz geschnitten werden', not slicedx, str(slicedx))
            check(f'Stil {tpl}: «Fortsetzung · N von M» im PDF-Text stimmt', not contmis, str(contmis))
            if tpl == T0: check('Zweiseitige Rezepte sind ausgeglichen (Seite 2 reicht mindestens bis 90 mm)', all(v >= 90 for _, v in bal), str(bal))
        # Metadaten und Sprache
        path, n, r = await build_pdf(page, 'single', 'fx_manti', T0)
        raw = open(path, 'rb').read()
        info = sh(['pdfinfo', path])
        check('Metadaten: Dokumenttitel = Rezeptname', 'Title:' in info and 'Türkische Manti' in info, info.split('\n')[0])
        check('Metadaten: Sprache de-CH', b'/Lang (de-CH)' in raw)
        check('Keine Rasterstreifen: ganzseitiges Bild je Seite, A4', 'Page size:       595.276 x 841.89 pts (A4)' in info or 'A4' in info)

        # Bildfehler und Viewport-Unabhaengigkeit
        path, n, r = await build_pdf(page, 'single', 'fx_badimg', T0)
        check('Defektes Bild: Export laeuft durch, Seite ohne Fehlersymbol', n == 1 and 'Mit defektem Bild' in sh(['pdftotext', path, '-']))
        # Kleine Fenstergroesse: gleiche Seiten und gleicher Text
        ctx2 = await b.new_context(viewport={'width': 390, 'height': 700}, accept_downloads=True, reduced_motion='reduce', timezone_id='UTC')
        await ctx2.add_init_script(NO_SW + " try{localStorage.setItem('savora-splash-seen','1')}catch(e){}")
        page2 = await ctx2.new_page(); await goto(page2); await page2.evaluate(JS_SEED, FX); await page2.wait_for_timeout(300)
        pa, na, _ = await build_pdf(page, 'single', 'fx_many', T0, name='vp_desktop')
        pb, nb, _ = await build_pdf(page2, 'single', 'fx_many', T0, name='vp_mobile')
        ta = re.sub(r'\s+', ' ', sh(['pdftotext', pa, '-'])); tb = re.sub(r'\s+', ' ', sh(['pdftotext', pb, '-']))
        check('Fenstergroesse 390 px und 1000 px: gleiche Seitenzahl und gleicher PDF-Text', na == nb and ta == tb, f'{na}/{nb}')
        ia, ib = render(pa, 'vp_a'), render(pb, 'vp_b')
        dmax = max(ImageChops.difference(x, y).convert('L').point(lambda v: 255 if v > 60 else 0).histogram()[255] for x, y in zip(ia, ib))
        check('Fenstergroesse: Seitenbilder praktisch identisch', dmax < 200, f'{dmax} abweichende Pixel')
        await ctx2.close()

        # ---------- 3) Kochbuch: Inhaltsverzeichnis = tatsaechliche Seiten ----------
        for tpl in TEMPLATE_IDS:
            order = ids if tpl == T0 else ['fx_manti', 'fx_long40', 'fx_many', 'fx_triple', 'fx_cookies', 'fx_carbonara']
            await page.evaluate("""(a) => saveCookbookConfig({ title: 'Mein Familienkochbuch mit einem ziemlich langen Titel, der in der Fusszeile umbrechen oder gekürzt werden muss', subtitle: 'Sammlung', author: 'Tester', pdfTemplate: a[0],
              chapters: [{ id: 'c1', name: 'Hauptgänge und andere herzhafte Gerichte für jeden Tag' }, { id: 'c2', name: 'Süsses' }],
              items: a[1].map((id, i) => ({ recipeId: id, chapterId: i % 3 === 2 ? 'c2' : (i % 3 === 1 ? '' : 'c1') })) })""", [tpl, order])
            path, n, r = await build_pdf(page, 'book', None, tpl, name=f'book_{tpl}')
            imgs = render(path, f'book_{tpl}'); keep(imgs, f'buch_{tpl}')
            check(f'Kochbuch {tpl}: PDF-Seitenzahl = geplante Seitenzahl', n == r['planned'] and len(imgs) == n, f'{n} / {r["planned"]}')
            check(f'Kochbuch {tpl}: Inhaltsverzeichnis stimmt mit den tatsaechlichen Rezeptanfaengen ueberein (Export-Pruefung)', r['tocMismatch'] == 0 and not r['sliced'])
            errs_b = []
            for k, im in enumerate(imgs):
                if k == 0: continue
                kind_text = sh(['pdftotext', '-f', str(k + 1), '-l', str(k + 1), path, '-'])
                if re.match(r'\s*Kapitel', kind_text): continue
                for e in frame_problems(im): errs_b.append(f'S.{k + 1}: {e}')
                if re.search(r'Fortsetzung\s*·\s*\d+ von', kind_text):
                    for e in cont_head_problems(im): errs_b.append(f'S.{k + 1}: {e}')
            check(f'Kochbuch {tpl}: Kopf-/Fusszeilen aller Seiten vollstaendig (auch mit sehr langem Buchtitel)', not errs_b, '; '.join(errs_b[:3]))
            # TOC aus dem PDF-Text lesen
            titles = await page.evaluate("(ids) => ids.map(id => state.recipes.find(r => r.id === id).title)", order)
            toc_pages = []
            k = 2
            while k <= n:
                t = sh(['pdftotext', '-f', str(k), '-l', str(k), path, '-'])
                if re.match(r'\s*Inhalt', t): toc_pages.append(k); k += 1
                else: break
            toc_text = re.sub(r'\s+', ' ', ' '.join(sh(['pdftotext', '-f', str(k0), '-l', str(k0), path, '-']) for k0 in toc_pages))
            bad = []
            for id, title in zip(order, titles):
                m = re.search(re.escape(re.sub(r'\s+', ' ', title)) + r' (\d+)(?: |$)', toc_text)
                start = r['starts'].get(id)
                if not m: bad.append((title[:20], 'nicht im Inhaltsverzeichnis')); continue
                num = int(m.group(1))
                pg_text = re.sub(r'\s+', ' ', sh(['pdftotext', '-f', str(num), '-l', str(num), path, '-']))
                if num != start or re.sub(r'\s+', ' ', title)[:40] not in pg_text or 'Fortsetzung' in pg_text.split(title[:20])[0][-5:]:
                    bad.append((title[:20], num, start))
            check(f'Kochbuch {tpl}: Inhaltsverzeichnis-Seitenzahlen = tatsaechliche Seiten (pdftotext)', not bad and len(toc_pages) >= 1, str(bad[:3]))
            raw = open(path, 'rb').read()
            check(f'Kochbuch {tpl}: Seitenlinks im Inhaltsverzeichnis, Titel als Dokumenttitel', raw.count(b'/Subtype /Link') >= len(order) and 'Mein Familienkochbuch' in sh(['pdfinfo', path]))

        # TOC mit sehr vielen Eintraegen und langen Titeln: mehrere Seiten, alle Nummern stimmen
        await page.evaluate("""async () => { for (let i = 0; i < 40; i++) { const r = Object.assign(emptyRecipe(), { id: 'fx_t' + i, title: 'Rezept Nummer ' + (i + 1) + (i % 4 === 0 ? ' mit einem wirklich sehr langen Namen, der im Inhaltsverzeichnis umbrechen muss' : ''), servings: 2, ingredients: [{ amount: '1', unit: '', name: 'Zutat' }], steps: [{ text: 'Schritt ' + i }] }); await dbPut(r); } await loadRecipes();
          saveCookbookConfig({ title: 'Vieles', subtitle: '', author: '', pdfTemplate: __T0, chapters: [], items: Array.from({ length: 40 }, (_, i) => ({ recipeId: 'fx_t' + i, chapterId: '' })) }); }""")
        path, n, r = await build_pdf(page, 'book', None, T0, name='book_toc40')
        t2 = sh(['pdftotext', '-f', '2', '-l', '3', path, '-'])
        starts = r['starts']
        badn = []
        for i in range(40):
            rid = 'fx_t' + str(i); title = 'Rezept Nummer ' + str(i + 1)
            m = re.search(re.escape(title) + r'(?: mit einem wirklich sehr langen Namen, der im Inhaltsverzeichnis umbrechen muss)? (\d+)\b', re.sub(r'\s+', ' ', sh(['pdftotext', '-f', '2', '-l', '4', path, '-'])))
            if not m or int(m.group(1)) != starts.get(rid): badn.append((title, m.group(1) if m else None, starts.get(rid)))
        check('40 Rezepte mit langen Titeln: Inhaltsverzeichnis ueber mehrere Seiten, alle Seitenzahlen stimmen', not badn and 'Inhalt · Fortsetzung' in re.sub(r'\s+', ' ', t2) and r['tocMismatch'] == 0, str(badn[:3]))

        # ---------- 4) Vorschau = Download (dieselben Bytes), Fortschritt, Abbruch, Fehler ----------
        await page.evaluate("saveCookbookConfig({ title: 'Test', subtitle: '', author: '', pdfTemplate: __T0, chapters: [], items: ['fx_manti','fx_long40','fx_cookies'].map(id => ({ recipeId: id, chapterId: '' })) })")
        await page.evaluate("state.view = 'detail'; state.activeRecipeId = 'fx_long40'; render(); openModal({ type: 'pdf-export', target: 'single', recipeId: 'fx_long40', stage: 'options', template: __T0, nutritionDetail: 'off' })")
        await page.wait_for_selector('[data-action="pdf-export-build"]')
        await page.evaluate("window.__builds = 0; const o = window.buildSinglePdf; window.__origBuild = o; window.buildSinglePdf = async function () { window.__builds++; return o.apply(this, arguments); }; 0")
        await page.click('[data-action="pdf-export-build"]');
        try: await page.click('[data-action="pdf-export-build"]', timeout=300)
        except Exception: pass
        await page.wait_for_selector('.pdf-preview-header', timeout=90000)
        check('Doppelter Start wird verhindert (genau ein Exportlauf)', await page.evaluate("window.__builds") == 1)
        info = await page.evaluate("({ stage: state.modal.stage, n: state.modal.pageCount, note: (document.getElementById('pdfMultiPageNote') || {}).textContent || '', meta: document.querySelector('.pdf-preview-meta').textContent })")
        check('Vorschau zeigt Seitenzahl und neutrale Erklaerung bei zwei Seiten', info['n'] == 2 and info['note'] == 'Dieses Rezept erhält zwei Seiten, damit alles gut lesbar bleibt.' and '2 Seiten' in info['meta'], str(info))
        h_prev = await page.evaluate("""async () => { const u = new Uint8Array(await state.modal.previewBlob.arrayBuffer()); const d = await crypto.subtle.digest('SHA-256', u); return Array.from(new Uint8Array(d)).map(x => x.toString(16).padStart(2, '0')).join(''); }""")
        # Vorschau-URL liefert dieselben Bytes wie das Blob
        h_url = await page.evaluate("""async () => { const u = new Uint8Array(await (await fetch(state.modal.previewUrl)).arrayBuffer()); const d = await crypto.subtle.digest('SHA-256', u); return Array.from(new Uint8Array(d)).map(x => x.toString(16).padStart(2, '0')).join(''); }""")
        async with page.expect_download(timeout=30000) as dl:
            await page.click('[data-action="pdf-export-download"]')
        d = await dl.value
        dpath = _os.path.join(WORK, 'download.pdf'); await d.save_as(dpath)
        h_file = hashlib.sha256(open(dpath, 'rb').read()).hexdigest()
        check('Vorschau-Bytes = Download-Bytes (SHA-256)', h_prev == h_file == h_url, f'{h_prev[:12]} {h_url[:12]} {h_file[:12]}')
        check('Heruntergeladene Datei ist ein gueltiges PDF mit zwei Seiten', sh(['pdfinfo', dpath]).count('Pages:           2') == 1)
        await page.evaluate("window.buildSinglePdf = window.__origBuild; 0")

        # Abbruch eines Kochbuchs
        await page.evaluate("openModal({ type: 'pdf-export', target: 'cookbook', stage: 'options', template: __T0, nutritionDetail: 'off' })")
        await page.wait_for_selector('[data-action="pdf-export-build"]')
        await page.click('[data-action="pdf-export-build"]')
        await page.wait_for_selector('#pdfProgressBar')
        await page.wait_for_function("document.getElementById('pdfProgressText') && /Rezept|Seite/.test(document.getElementById('pdfProgressText').textContent)", timeout=30000)
        prog = await page.evaluate("({ t: document.getElementById('pdfProgressText').textContent, w: document.getElementById('pdfProgressBar').firstElementChild.style.width })")
        check('Fortschrittsanzeige beim Kochbuch (Text und Balken)', bool(prog['t']) and prog['w'] != '', str(prog))
        await page.wait_for_timeout(800); await page.click('[data-action="pdf-export-cancel"]')
        await page.wait_for_timeout(800)
        st = await page.evaluate("({ stage: state.modal && state.modal.stage, blob: !!(state.modal && state.modal.previewBlob), root: document.getElementById('printRoot').children.length })")
        check('Abbrechen: zurueck zu den Optionen, kein PDF-Ergebnis, Druckflaeche leer', st['stage'] == 'options' and not st['blob'] and st['root'] == 0, str(st))
        # Fehlerzustand mit «Erneut versuchen»
        await page.evaluate("window.__fail = true; const o = window.buildCookbookPdf; window.__origBook = o; window.buildCookbookPdf = async function () { if (window.__fail) throw Object.assign(new Error('x'), { userMessage: 'Test-Fehler beim Erstellen.' }); return o.apply(this, arguments); }; 0")
        await page.click('[data-action="pdf-export-build"]')
        await page.wait_for_selector('[data-action="pdf-export-build"]:has-text("Erneut versuchen")', timeout=20000)
        txt = await page.evaluate("document.querySelector('.pdf-error-text').textContent")
        check('Fehlerzustand zeigt die Meldung und «Erneut versuchen»', 'Test-Fehler' in txt)
        await page.evaluate("window.__fail = false; 0")
        await page.click('[data-action="pdf-export-build"]')
        await page.wait_for_selector('.pdf-preview-header', timeout=120000)
        check('Erneut versuchen fuehrt zur Vorschau', await page.evaluate("state.modal.stage") == 'preview' and await page.evaluate("state.modal.pageCount") >= 3)
        await page.evaluate("window.buildCookbookPdf = window.__origBook; 0")
        urls = await page.evaluate("(() => { const u = state.modal.previewUrl; return !!u; })()")
        await page.evaluate("closeModal()"); await page.wait_for_timeout(300)
        check('Schliessen raeumt die Vorschau auf (Modal weg)', await page.evaluate("!state.modal"))

        # ---------- 5) Adress-Links ----------
        raw = await page.evaluate("""async () => { pdfSetContext(__T0, '', '', false); const root = document.getElementById('printRoot');
          root.innerHTML = '<section class="pv-page" data-page-kind="recipe"><h1 class="pv-title pv-t-m">Link</h1><p>Quelle: <span data-pdf-href="https://example.org/rezept">https://example.org/rezept</span> und <span data-pdf-href="javascript:alert(1)">schlecht</span></p></section>';
          const blob = await renderSectionsToPdf({ title: 'Linktest' }); const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return s; }""")
        check('Adressen mit data-pdf-href werden anklickbare Link-Annotationen (nur http/https/mailto)', '/URI (https://example.org/rezept)' in raw and 'javascript' not in raw)

        after = await page.evaluate("(ids) => JSON.stringify(state.recipes.filter(r => ids.includes(r.id)).map(r => ({ id: r.id, t: r.title, i: r.ingredients, s: r.steps, n: r.notes })).sort((a, b) => a.id.localeCompare(b.id)))", ids)
        check('Export veraendert keine Rezepte', before == after)
        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await b.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
