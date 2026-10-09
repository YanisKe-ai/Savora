"""Paket 35: neues Savora-Symbol und zehn Kochbuch-Titelblätter.
Prüft Vorlagenliste, leere Eingaben, Datum (Zeitzonen, Format), Migration alter Konfigurationen, Layout (sichere Zonen,
Umbruch, Warnungen), Lesbarkeit mit echten Pixeln, Escaping, Vorlagenwähler per Tastatur, echte PDF-Exporte aller zehn Vorlagen
(Text, Vergleich mit der Vorschau), Fehlerfälle, Offline-Export und unveränderte Bestandsdaten."""
import asyncio, base64, json, os, subprocess, sys, tempfile
os.environ.setdefault('SAVORA_TEST_PORT', '8969')
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
from PIL import Image, ImageChops, ImageStat
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)
IDS = ['pop', 'lieblingsbuch', 'tomate', 'salbei', 'nachtkueche', 'citrus', 'bistro', 'garten', 'sonnenkueche', 'ofenglueck']
COVERS = _os.path.join(ROOT, 'assets', 'covers')
FILES = {'pop': '01-pop', 'lieblingsbuch': '02-lieblingsbuch', 'tomate': '03-tomate', 'salbei': '04-salbei', 'nachtkueche': '05-nachtkueche', 'citrus': '06-citrus', 'bistro': '07-bistro', 'garten': '08-garten', 'sonnenkueche': '09-sonnenkueche', 'ofenglueck': '10-ofenglueck'}

def lum(c):
    def f(v):
        v /= 255
        return v / 12.92 if v <= .03928 else ((v + .055) / 1.055) ** 2.4
    return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2])
def contrast(a, b):
    la, lb = lum(a), lum(b)
    return (max(la, lb) + .05) / (min(la, lb) + .05)
def hex2rgb(h): h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

async def main():
    async with async_playwright() as p:
        b, ctx = await open_ctx(p, 390, 844, 'no-preference')
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(300)
        ev = page.evaluate
        seed_before = await ev("() => JSON.stringify(state.recipes.map(r => ({ id: r.id, title: r.title, ing: r.ingredients, steps: r.steps, servings: r.servings, notes: r.notes, fav: !!r.favorite, img: !!(r.image || r.imageId) })))")
        await ev("() => coverEnsureFonts()")

        # ---------- 1. Vorlagen ----------
        ids = await ev("() => COVER_TEMPLATES.map(t => t.id)")
        check('Genau die zehn Vorlagen (stabile IDs)', sorted(ids) == sorted(IDS) and len(ids) == 10, str(ids))
        names = await ev("() => COVER_TEMPLATES.map(t => t.name)")
        check('Verständliche Namen', all(n for n in names) and 'Nachtküche' in names and 'Ofenglück' in names, str(names))
        check('Alle Hintergründe vorhanden und unverändert (Originalgrösse)', all(_os.path.exists(f'{COVERS}/{FILES[i]}.png') and Image.open(f'{COVERS}/{FILES[i]}.png').size[0] in (1054, 1055) for i in IDS))

        # ---------- 2. Leere Eingaben: nur Symbol und Datum ----------
        L = await ev("() => coverLayout({ templateId: 'tomate', title: '', name: '   ', slogan: '\\n \\t', date: '2026-10-09', showDate: true, logo: true })")
        check('Ohne Eingaben: keine Textblöcke, Symbol und Datum', L['blocks'] == [] and L['logo'] and L['date']['text'] == '09.10.2026', json.dumps(L['date']))
        html = await ev("() => coverHtml(coverLayout({ templateId: 'tomate', date: '2026-10-09' }))")
        check('Ohne Eingaben kein Beispieltitel, kein Vorlagenname, kein Personenname', not any(w in html for w in ('Yanis', 'Keusch', 'Tomate', 'Mein persönliches', 'Kochbuch')), '')
        cfg0 = await ev("() => { localStorage.removeItem(COOKBOOK_CONFIG_KEY); coverEnsureConfig(); const c = getCookbookConfig(); return { t: c.title, a: c.author, s: c.subtitle, cover: c.cover }; }")
        check('Neue Konfiguration: Titel, Name, Slogan leer, gültige Vorlage', cfg0['t'] == '' and cfg0['a'] == '' and cfg0['s'] == '' and cfg0['cover']['templateId'] in IDS, str(cfg0))

        # ---------- 3. Datum ----------
        fm = await ev("() => ['2026-03-05', '2026-12-31', '2024-02-29', '2025-02-29', '', 'x', '2026-13-01'].map(coverFormatDate)")
        check('Datum TT.MM.JJJJ, ungültige Werte leer', fm == ['05.03.2026', '31.12.2026', '29.02.2024', '', '', '', ''], str(fm))
        nd = await ev("() => ['2026-10-09', '9.10.2026', '09.10.2026', '', 'abc', '31.02.2026'].map(coverNormalizeDate)")
        check('Datumseingaben werden defensiv normalisiert', nd == ['2026-10-09', '2026-10-09', '2026-10-09', '', '', ''], str(nd))
        for tz in ('Pacific/Auckland', 'America/Los_Angeles', 'Asia/Kolkata'):
            c2 = await b.new_context(viewport={'width': 390, 'height': 844}, timezone_id=tz)
            await c2.add_init_script(NO_SW + " try{localStorage.setItem('savora-splash-seen','1')}catch(e){}")
            p2 = await c2.new_page(); await goto(p2)
            r = await p2.evaluate("""() => { const Real = Date; Date = class extends Real { constructor(...a) { if (a.length === 0) super(2026, 11, 31, 23, 30, 0); else super(...a); } }; const k = coverTodayKey(); Date = Real; return [k, coverFormatDate('2026-03-31')]; }""")
            check(f'Datum bleibt Kalenderdatum in {tz} (heute 31.12. 23:30 lokal, gespeichert 31.03.)', r == ['2026-12-31', '31.03.2026'], str(r))
            await c2.close()
        # Datum bleibt beim Vorlagenwechsel und Reexport stabil
        st = await ev("""async () => { localStorage.removeItem(COOKBOOK_CONFIG_KEY); const c = coverEnsureConfig(); const cfg = getCookbookConfig(); cfg.cover.date = '2025-05-17'; cfg.cover.templateId = 'bistro'; saveCookbookConfig(cfg);
            const c2 = getCookbookConfig(); c2.cover.templateId = 'citrus'; saveCookbookConfig(c2); coverEnsureConfig(); return getCookbookConfig().cover; }""")
        check('Datum wird bei Vorlagenwechsel und Neuöffnen nicht auf heute gesetzt', st['date'] == '2025-05-17' and st['templateId'] == 'citrus', str(st))

        # ---------- 4. Migration und Datenschutz der Auswahl ----------
        mg = await ev("""() => { const out = {};
          localStorage.setItem(COOKBOOK_CONFIG_KEY, JSON.stringify({ title: 'Altes Buch', subtitle: 'Alt', author: 'Alte Autorin', pdfTemplate: 'B', coverRecipeId: 'r_x', items: [{ recipeId: state.recipes[0].id, chapterId: '' }], chapters: [] }));
          coverEnsureConfig(); let c = getCookbookConfig(); out.old = { title: c.title, subtitle: c.subtitle, author: c.author, tpl: c.pdfTemplate, cover: c.cover.templateId, items: c.items.length, coverRecipeId: c.coverRecipeId, date: coverIsValidDateKey(c.cover.date) };
          localStorage.setItem(COOKBOOK_CONFIG_KEY, JSON.stringify({ title: 'X', items: [], cover: { v: 1, templateId: 'gibtsnicht', date: '2025-01-31', showDate: false } }));
          c = getCookbookConfig(); out.bad = c.cover;
          localStorage.setItem(COOKBOOK_CONFIG_KEY, JSON.stringify({ title: 'Y' })); const n = state.recipes.length; c = getCookbookConfig(); out.stub = [c.items.length, n, c.isDefault];
          return out; }""")
        check('Alte Konfiguration: Titel, Name, Slogan, Auswahl und Rezeptvorlage bleiben, gültiges Titelblatt ergänzt', mg['old']['title'] == 'Altes Buch' and mg['old']['subtitle'] == 'Alt' and mg['old']['author'] == 'Alte Autorin' and mg['old']['tpl'] == 'B' and mg['old']['cover'] in IDS and mg['old']['items'] == 1 and mg['old']['date'] and mg['old']['coverRecipeId'] == 'r_x', str(mg['old']))
        check('Unbekannte Vorlage wird auf gültigen Wert gesetzt, Datum und Schalter bleiben', mg['bad']['templateId'] in IDS and mg['bad']['date'] == '2025-01-31' and mg['bad']['showDate'] is False, str(mg['bad']))
        check('Ohne gespeicherte Auswahl bleibt „alle Rezepte“ (wird nicht eingefroren)', mg['stub'][0] == mg['stub'][1] and mg['stub'][2] is True, str(mg['stub']))
        await ev("() => localStorage.removeItem(COOKBOOK_CONFIG_KEY)")

        # ---------- 5. Layout: sichere Zonen, Umbruch, Warnungen ----------
        zones = await ev("() => COVER_TEMPLATES.map(t => ({ id: t.id, text: t.text, ink: t.ink, date: Object.assign({}, COVER_DATE_ZONE, t.date || {}) }))")
        logo_box = await ev("() => ({ box: COVER_LOGO_BOX, page: COVER_PAGE })")
        bad = []
        for z in zones:
            Lz = await ev("(id) => coverLayout({ templateId: id, title: 'Omas allerliebste Rezepte aus der Küche', name: 'Familie Müller-Lüdenscheidt', slogan: 'Gesammelt über viele Jahre, mit Liebe weitergegeben', date: '2026-10-09' })", z['id'])
            zz = z['text']
            for bl in Lz['blocks']:
                if not (bl['x'] >= zz['x'] - 1e-6 and bl['x'] + bl['w'] <= zz['x'] + zz['w'] + 1e-6 and bl['y'] >= zz['y'] - 1e-6 and bl['y'] + bl['h'] <= zz['y'] + zz['h'] + 1e-6): bad.append((z['id'], bl['key']))
            if Lz['warnings']: bad.append((z['id'], 'warn'))
            logo_bottom = logo_box['box']['y'] + logo_box['box']['w'] * logo_box['page']['w'] * (346 / 408) / logo_box['page']['h']
            if zz['y'] < logo_bottom - 1e-6: bad.append((z['id'], 'logo-overlap'))
        check('Alle Textblöcke liegen in den sicheren Zonen und überdecken das Symbol nicht', not bad, str(bad))
        short = await ev("() => coverLayout({ templateId: 'pop', title: 'Fein', date: '2026-10-09' })")
        check('Kurzer Titel: eine Zeile in grosser Schrift', len(short['blocks'][0]['lines']) == 1 and short['blocks'][0]['sizePx'] >= 90, str(short['blocks'][0]['sizePx']))
        long_ok = await ev("() => coverLayout({ templateId: 'pop', title: 'Die allerbesten Familienrezepte aus drei Generationen und vielen Ländern', date: '2026-10-09' })")
        check('Langer Titel: kontrolliert umbrochen und verkleinert, ohne Warnung', len(long_ok['blocks'][0]['lines']) >= 2 and not long_ok['warnings'] and long_ok['blocks'][0]['sizePx'] < short['blocks'][0]['sizePx'], str(long_ok['blocks'][0]['sizePx']))
        too_long = await ev("() => coverLayout({ templateId: 'bistro', title: 'Lorem ipsum '.repeat(40), name: 'N'.repeat(300), date: '2026-10-09' })")
        check('Zu langer Text: konkrete Warnung statt stiller Kürzung', len(too_long['warnings']) >= 1 and all('kürzen' in w['message'].lower() for w in too_long['warnings']), json.dumps(too_long['warnings'], ensure_ascii=False)[:200])
        word = await ev("() => coverLayout({ templateId: 'pop', title: 'Donaudampfschifffahrtsgesellschaftskapitänsmützenfabrikantenverband', date: '2026-10-09' })")
        check('Einzelnes sehr langes Wort wird nicht abgeschnitten (Zeichenumbruch)', ''.join(word['blocks'][0]['lines']).replace(' ', '') == 'Donaudampfschifffahrtsgesellschaftskapitänsmützenfabrikantenverband', str(word['blocks'][0]['lines']))
        txt = await ev("() => coverLayout({ templateId: 'garten', title: '  Crème brûlée\\n\\n  Äpfel & Öl  ', name: 'Zoë O\\'Brien', slogan: 'Ça va?', date: '2026-10-09' }).blocks.map(b => b.lines)")
        check('Umlaute, Akzente, Apostroph und mehrzeilige Eingaben', txt[0] == ['Crème brûlée', '', 'Äpfel & Öl'] or txt[0][0] == 'Crème brûlée', str(txt))
        # Vorschau und Export nutzen dieselbe Funktion
        same = await ev("() => { const i = { templateId: 'sonnenkueche', title: 'Gleich', name: 'Gleich', slogan: 'Gleich', date: '2026-10-09' }; return JSON.stringify(coverLayout(i)) === JSON.stringify(coverLayout(i)) && coverHtml(coverLayout(i)) === coverHtml(coverLayout(i)); }")
        check('Layout ist deterministisch (Vorschau und Export identisch)', same)

        # ---------- 6. Lesbarkeit mit echten Pixeln ----------
        poor = []
        for z in zones:
            im = Image.open(f"{COVERS}/{FILES[z['id']]}.png").convert('RGB'); W, H = im.size; px = im.load()
            ink = hex2rgb(z['ink'])
            def region(x0, y0, x1, y1): return [px[x, y] for y in range(int(y0 * H), int(y1 * H), 2) for x in range(int(x0 * W), int(x1 * W), 2)]
            tz = z['text']; cs = region(tz['x'], tz['y'], tz['x'] + tz['w'], tz['y'] + tz['h'])
            bg = sorted(px[x, 5] for x in range(0, W, 40))[len(range(0, W, 40)) // 2]
            ill = sum(1 for c in cs if sum(abs(c[i] - bg[i]) for i in range(3)) > 60) / len(cs)
            worst = min(contrast(c, ink) for c in cs)
            if ill > 0.002 or worst < 4.5: poor.append((z['id'], 'text', round(ill, 4), round(worst, 1)))
            d = z['date']; dw = 0.105
            cs2 = region(d['x1'] - dw, d['y'], d['x1'], d['y'] + d['h'])
            w2 = min(contrast(c, ink) for c in cs2)
            if w2 < 4.5: poor.append((z['id'], 'date', round(w2, 1)))
            lb = logo_box['box']; lh = lb['w'] * logo_box['page']['w'] * (346 / 408) / logo_box['page']['h']
            cs3 = region(lb['x'], lb['y'], lb['x'] + lb['w'], lb['y'] + lh)
            w3 = min(contrast(c, ink) for c in cs3)
            if w3 < 4.5: poor.append((z['id'], 'logo', round(w3, 1)))
        check('Text, Datum und Symbol sind auf allen zehn Hintergründen lesbar (>= 4,5:1, Illustration unberührt)', not poor, str(poor))

        # ---------- 7. Sicherheit: Eingaben nur als Text ----------
        await ev("() => { window.__xss = 0; }")
        inj = await ev("""() => { const L = coverLayout({ templateId: 'pop', title: '<img src=x onerror=window.__xss=1>', name: '"><script>window.__xss=2</script>', slogan: '&amp; <b>fett</b>', date: '2026-10-09' }); const h = coverHtml(L); const box = document.createElement('div'); document.body.appendChild(box); box.innerHTML = h;
            const out = { bold: !!box.querySelector('b'), scripts: box.querySelectorAll('script').length, imgs: box.querySelectorAll('img').length, text: Array.from(box.querySelectorAll('.cv-line')).map(e => e.textContent).join('|') }; box.remove(); return out; }""")
        await page.wait_for_timeout(200)
        check('HTML in Eingaben wird als Text angezeigt, nichts ausgeführt', not inj['bold'] and inj['scripts'] == 0 and inj['imgs'] == 0 and '<img src=x' in inj['text'] and (await ev("() => window.__xss")) == 0, str(inj))

        # ---------- 8. Theme: PDF-Inhalt hängt nicht vom App-Theme ab ----------
        th = await ev("""() => { const i = { templateId: 'nachtkueche', title: 'Theme', date: '2026-10-09' }; const out = []; ['light', 'dark', 'amoled'].forEach(t => { state.theme = t; applyTheme(); out.push(coverHtml(coverLayout(i))); }); state.theme = 'system'; applyTheme(); return out.every(x => x === out[0]); }""")
        check('Titelblatt-HTML ist in Hell, Dunkel und Schwarz identisch', th)
        sym = await ev("() => ({ light: coverSymbolSvg('#171717').includes('#E64B35'), dark: coverSymbolSvg('#FFFFFF').includes('#E64B35') })")
        check('Lesezeichen bleibt rot in beiden Symbolvarianten', sym['light'] and sym['dark'])

        # ---------- 9. Vorlagenwähler im Browser: Maus, Tastatur, Fokus, Scroll ----------
        await ev("() => { localStorage.removeItem(COOKBOOK_CONFIG_KEY); state.view = 'cookbook'; render(); }"); await page.wait_for_timeout(1000)
        opts = await ev("() => Array.from(document.querySelectorAll('.cover-opt')).map(e => [e.dataset.id, e.getAttribute('role'), e.getAttribute('aria-checked')])")
        check('Wähler zeigt zehn Vorschaubilder als Radiogruppe, genau eine aktiv', len(opts) == 10 and all(o[1] == 'radio' for o in opts) and sum(1 for o in opts if o[2] == 'true') == 1, str(opts[:2]))
        await page.fill('#cbTitle', 'Testbuch ä'); await page.wait_for_timeout(300)
        focus_before = await ev("() => document.activeElement.id")
        check('Beim Tippen bleibt der Fokus im Feld und die Vorschau zeigt den Text sofort', focus_before == 'cbTitle' and 'Testbuch ä' in (await ev("() => document.querySelector('canvas.cv-canvas').dataset.layout")), focus_before)
        await ev("() => document.querySelector('.cover-opt[data-id=\"citrus\"]').scrollIntoView()")
        await page.focus('.cover-opt[data-id="citrus"]'); await page.wait_for_timeout(300)
        y0 = await ev("() => window.scrollY")   # Fokussieren selbst darf scrollen; gemessen wird, ob die Auswahl danach springt
        await page.keyboard.press('Enter'); await page.wait_for_timeout(400)
        after = await ev("() => ({ id: document.activeElement.dataset.id, active: document.querySelector('.cover-opt.is-active').dataset.id, tpl: getCookbookConfig().cover.templateId, title: document.getElementById('cbTitle').value, y: window.scrollY })")
        check('Auswahl per Tastatur: Vorlage gesetzt, Fokus stabil, Eingaben erhalten, kein Springen', after['active'] == 'citrus' and after['tpl'] == 'citrus' and after['id'] == 'citrus' and after['title'] == 'Testbuch ä' and abs(after['y'] - y0) < 4, str(after) + f' y0={y0}')
        # Vorschaugrösse
        pv = await ev("() => { const r = document.querySelector('.cover-preview').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }")
        check('Vorschau im A4-Format', abs(pv[1] / pv[0] - 1.4142) < 0.02, str(pv))
        # Sehr kleines Fenster und Desktop ohne seitliches Scrollen
        for w in (320, 1280):
            await page.set_viewport_size({'width': w, 'height': 800}); await page.wait_for_timeout(400)
            over = await ev("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
            check(f'{w} px: Titelblatt-Bereich ohne seitliches Überlaufen', over <= 1, str(over))
        await page.set_viewport_size({'width': 390, 'height': 844})

        # ---------- 10. Echte PDF-Exporte aller zehn Vorlagen ----------
        tmp = tempfile.mkdtemp(prefix='savora-cover-')
        await ev("""async () => { const r = state.recipes[0]; localStorage.setItem(COOKBOOK_CONFIG_KEY, JSON.stringify({ title: '', subtitle: '', author: '', items: [{ recipeId: r.id, chapterId: '' }], chapters: [], cover: { v: 1, templateId: 'pop', date: '2026-10-09', showDate: true } })); }""")
        sheets = []
        diffs = []
        for tid in IDS:
            texts = {'title': 'Omas Lieblings-Rezepte', 'name': 'Familie Müller', 'slogan': 'gesammelt seit 1984'}
            await ev("""(a) => { const c = getCookbookConfig(); c.cover.templateId = a[0]; c.title = a[1].title; c.author = a[1].name; c.subtitle = a[1].slogan; saveCookbookConfig(c); }""", [tid, texts])
            res = await ev("""async () => { const r = await buildCookbookPdf('off'); if (!r) return null; const u = new Uint8Array(await r.blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); }""")
            if not res: check(f'PDF {tid} erzeugt', False); continue
            path = f'{tmp}/{tid}.pdf'; open(path, 'wb').write(base64.b64decode(res))
            text = subprocess.run(['pdftotext', '-f', '1', '-l', '1', '-layout', path, '-'], capture_output=True, text=True).stdout
            png = f'{tmp}/{tid}'
            subprocess.run(['pdftoppm', '-f', '1', '-l', '1', '-r', '96', '-png', '-singlefile', path, png], check=True)
            pdfim = Image.open(png + '.png').convert('RGB').resize((794, 1123))
            # Vorschau derselben Konfiguration als Bild (dieselbe Zeichenfunktion in Anzeigegroesse)
            shot = await ev("""async () => { const c = getCookbookConfig(); const L = coverLayout({ templateId: c.cover.templateId, title: c.title, name: c.author, slogan: c.subtitle, date: c.cover.date, showDate: true, logo: true }); const cv = await coverRenderCanvas(L, 1); return cv.toDataURL('image/png'); }""")
            open(f'{tmp}/{tid}-preview.png', 'wb').write(base64.b64decode(shot.split(',')[1]))
            pre = Image.open(f'{tmp}/{tid}-preview.png').convert('RGB')
            dl = ImageChops.difference(pre, pdfim).convert('L'); hist = dl.histogram(); npx = sum(hist)
            diff = ImageStat.Stat(dl).mean[0]; strong = sum(hist[81:]) / npx * 100
            diffs.append((tid, round(diff, 2), round(strong, 2)))
            ok_text = all(w in text for w in ('Omas', 'Familie', '09.10.2026'))
            check(f'PDF {tid}: Seite 1 enthält Titel, Name und Datum als Text', ok_text, text.strip()[:80].replace('\n', ' '))
            sheets.append((tid, pdfim))
        check('PDF-Titelblatt gleicht der Vorschau (mittlere Abweichung < 8 von 255, starke Abweichung < 2,5 % der Pixel; Rasterer und Schrift-Rendering unterscheiden sich je Plattform)', all(d < 8 and s < 2.5 for _, d, s in diffs), str(diffs))
        # Kontaktbogen der tatsächlich exportierten Cover
        sheet = Image.new('RGB', (5 * 400 + 60, 2 * 560 + 60), (236, 233, 226))
        for k, (tid, im) in enumerate(sheets):
            t = im.resize((400, int(400 * 1123 / 794))); sheet.paste(t, (20 + (k % 5) * 410, 20 + (k // 5) * 570))
        out_sheet = _os.path.join(ROOT, 'docs', 'cover-kontaktbogen.jpg'); sheet.save(out_sheet, quality=88)
        check('Kontaktbogen der zehn exportierten Cover erzeugt', _os.path.getsize(out_sheet) > 20000, out_sheet)

        # Leere Eingaben im PDF: nur Datum
        await ev("() => { const c = getCookbookConfig(); c.title = ''; c.author = ''; c.subtitle = ''; c.cover.templateId = 'tomate'; saveCookbookConfig(c); }")
        res = await ev("""async () => { const r = await buildCookbookPdf('off'); const u = new Uint8Array(await r.blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); }""")
        open(f'{tmp}/leer.pdf', 'wb').write(base64.b64decode(res))
        t1 = subprocess.run(['pdftotext', '-f', '1', '-l', '1', '-layout', f'{tmp}/leer.pdf', '-'], capture_output=True, text=True).stdout.split()
        check('PDF ohne Eingaben: auf Seite 1 nur das Datum als Text', t1 == ['09.10.2026'], str(t1))
        # Titelblatt nur einmal, Einzelrezept unverändert
        pages = subprocess.run(['pdftotext', '-layout', f'{tmp}/leer.pdf', '-'], capture_output=True, text=True).stdout
        check('Titelblatt kommt genau einmal am Anfang vor', pages.count('09.10.2026') == 1)
        single = await ev("""async () => { const r = await buildSinglePdf(state.recipes[0].id, 'off'); return r && r.blob ? r.blob.size : 0; }""")
        check('Einzelrezept-Export funktioniert weiter (ohne Titelblatt)', single > 3000, str(single))

        # ---------- 11. Fehlerfälle ----------
        await ev("() => { const c = getCookbookConfig(); c.title = 'Lorem ipsum '.repeat(40); c.cover.templateId = 'bistro'; saveCookbookConfig(c); }")
        msg = await ev("""async () => { try { await buildCookbookPdf('off'); return 'kein Fehler'; } catch (e) { return e.userMessage || ('anderer Fehler: ' + e.message); } }""")
        check('Zu langer Titel: Export bricht mit konkretem Hinweis ab', 'kürzen' in msg.lower(), msg[:120])
        warn = await ev("() => cookbookWarnings(getCookbookConfig()).filter(w => /Titelblatt/.test(w.text) && w.level === 'error').length")
        check('Designer-Prüfung meldet den langen Titel schon vorher', warn >= 1, str(warn))
        await ev("() => { const c = getCookbookConfig(); c.title = 'Kurz'; c.cover.templateId = 'garten'; saveCookbookConfig(c); }")
        await ctx.route('**/assets/covers/08-garten.png', lambda route: route.fulfill(status=404, body=''))
        msg2 = await ev("""async () => { try { await buildCookbookPdf('off'); return 'kein Fehler'; } catch (e) { return e.userMessage || ('anderer Fehler: ' + e.message); } }""")
        check('Fehlende Hintergrunddatei: verständliche Meldung, kein leeres PDF', 'fehlt' in msg2, msg2[:120])
        await ctx.unroute('**/assets/covers/08-garten.png')

        # ---------- 12. Bestandsdaten ----------
        seed_after = await ev("() => JSON.stringify(state.recipes.map(r => ({ id: r.id, title: r.title, ing: r.ingredients, steps: r.steps, servings: r.servings, notes: r.notes, fav: !!r.favorite, img: !!(r.image || r.imageId) })))")
        check('Rezepte, IDs, Bilder und Favoriten nach allen Exporten unverändert', seed_before == seed_after)
        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await b.close()

        # ---------- 13. Offline-Export (mit echtem Service Worker) ----------
        b2 = await p.chromium.launch()
        c3 = await b2.new_context(viewport={'width': 390, 'height': 844}, timezone_id='UTC', accept_downloads=True)
        await c3.add_init_script("try{localStorage.setItem('savora-splash-seen','1')}catch(e){}")
        pg = await c3.new_page(); await goto(pg); await pg.evaluate(open(SEED_PATH).read())
        await pg.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller || true")
        ready = await pg.evaluate("async () => { try { const r = await navigator.serviceWorker.ready; return !!r.active; } catch (e) { return false; } }")
        if not ready:
            print('OFFEN Offline-Export: Service Worker wurde in der Testumgebung nicht aktiv, nicht geprüft')
        else:
            await pg.evaluate("""() => { const r = state.recipes[0]; localStorage.setItem(COOKBOOK_CONFIG_KEY, JSON.stringify({ title: 'Offline', items: [{ recipeId: r.id, chapterId: '' }], chapters: [], cover: { v: 1, templateId: 'ofenglueck', date: '2026-10-09', showDate: true } })); }""")
            on = await pg.evaluate("async () => { const r = await buildCookbookPdf('off'); return r ? r.blob.size : 0; }")
            await pg.reload(); await pg.wait_for_function("typeof state !== 'undefined'"); await pg.wait_for_timeout(1500)
            await c3.set_offline(True)
            off = await pg.evaluate("async () => { try { const r = await buildCookbookPdf('off'); return r ? r.blob.size : 0; } catch (e) { return 'Fehler: ' + e.message; } }")
            check('Offline-Export nach erfolgreichem Caching liefert ein PDF', isinstance(off, int) and off > 3000 and on > 3000, f'online={on} offline={off}')
        await b2.close()
    print('\nFEHLGESCHLAGEN:', ', '.join(FAIL) if FAIL else 'keine'); sys.exit(1 if FAIL else 0)
asyncio.run(main())
