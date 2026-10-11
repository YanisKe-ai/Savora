"""Paket 43: neue Marke. Wortmarke (Pfad-SVG) statt Buch-Löffel-Zeichen in Kopfzeile, Seitenleiste, Startbild, Titelblatt und PDF;
Prise als App-Icon/Favicon. Prüft Theme-Wahl gegen die Systemeinstellung, keine Hand neben der Wortmarke, Proportionen, Dateien unter
einem Unterpfad (/Savora/), Manifest, Icon-Pixelmasse, Favicon-Links, PDF-Export und Layout bei 320/375/430 px mit grosser Schrift."""
import asyncio, base64, json, os, re, struct, subprocess, sys, tempfile, threading
os.environ.setdefault('SAVORA_TEST_PORT', '8894')
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from PIL import Image
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

# Zweiter Server: die App liegt unter /Savora/ wie auf GitHub Pages
SUB_PORT = PORT + 100
class _Sub(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(self, *a): pass
    def translate_path(self, path):
        if path.startswith('/Savora/'): path = path[len('/Savora'):]
        elif path != '/Savora': path = '/__nicht_vorhanden__'
        return super().translate_path(path)
ThreadingHTTPServer.allow_reuse_address = True
_srv = ThreadingHTTPServer(('127.0.0.1', SUB_PORT), _Sub); threading.Thread(target=_srv.serve_forever, daemon=True).start()
SUB = f'http://localhost:{SUB_PORT}/Savora/'

def png_info(path):
    d = open(path, 'rb').read(33)
    assert d[:8] == b'\x89PNG\r\n\x1a\n', path
    w, h, depth, ctype = struct.unpack('>IIBB', d[16:26])
    return w, h, ctype   # 2 = RGB, 6 = RGBA
RED, CREAM = 'rgb(185, 59, 44)', 'rgb(247, 244, 238)'
LOGO = _os.path.join(ROOT, 'assets', 'logo')

async def new_page(p, w, h, scheme, theme, url=None, motion='reduce', seed=True):
    browser = await p.chromium.launch()
    ctx = await browser.new_context(viewport={'width': w, 'height': h}, color_scheme=scheme, reduced_motion=motion, timezone_id='UTC')
    await ctx.add_init_script(NO_SW + " try{localStorage.setItem('savora-splash-seen','1');localStorage.setItem('savora-theme','%s')}catch(e){}" % theme)
    page = await ctx.new_page()
    await page.goto(url or URL)
    await page.wait_for_function("typeof state !== 'undefined' && document.getElementById('app').children.length > 0", timeout=30000)
    await page.wait_for_timeout(700)
    if seed:
        await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(400)
    return browser, page

async def main():
    # ---------- 1. Dateien, Manifest, Favicon-Links (statisch) ----------
    html = open(_os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    man = json.load(open(_os.path.join(ROOT, 'manifest.json'), encoding='utf-8'))
    ic = man['icons']
    anys = [i for i in ic if i['purpose'] == 'any']; mask = [i for i in ic if i['purpose'] == 'maskable']
    check('Manifest: icons getrennt für any und maskable, je 192 und 512, MIME image/png, Pfade relativ',
          sorted(i['sizes'] for i in anys) == ['192x192', '512x512'] and sorted(i['sizes'] for i in mask) == ['192x192', '512x512']
          and all(i['type'] == 'image/png' and not i['src'].startswith('/') for i in ic), str(ic))
    check('Manifest: start_url und scope unverändert', man['start_url'] == './index.html' and man['scope'] == './')
    dims_ok = True; info = []
    for i in ic:
        w, h, ct = png_info(_os.path.join(ROOT, i['src'])); exp = int(i['sizes'].split('x')[0])
        info.append((i['src'], w, h, ct)); dims_ok &= (w == h == exp and ct == 2)
    check('Manifest-Icons: Pixelmasse stimmen mit "sizes" überein, undurchsichtig (RGB)', dims_ok, str(info))
    p1024 = png_info(_os.path.join(LOGO, 'savora-app-icon-1024.png')); p180 = png_info(_os.path.join(LOGO, 'savora-app-icon-180.png'))
    check('App-Icon 1024 und Touch-Icon 180: Masse und ohne Alpha', p1024 == (1024, 1024, 2) and p180 == (180, 180, 2), f'{p1024} {p180}')
    ios_icon = png_info(_os.path.join(ROOT, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'))
    check('iOS-AppIcon 1024 x 1024 ohne Alpha', ios_icon == (1024, 1024, 2), str(ios_icon))
    m = re.search(r'<link rel="apple-touch-icon" href="([^"]+)"', html)
    check('apple-touch-icon verweist auf eine 180-px-Datei', bool(m) and png_info(_os.path.join(ROOT, m.group(1)))[:2] == (180, 180), m.group(1) if m else '')
    fav_l = re.search(r'<link rel="icon"[^>]*href="([^"]*favicon\.svg)"[^>]*media="\(prefers-color-scheme: light\)"', html) or re.search(r'<link rel="icon"[^>]*media="\(prefers-color-scheme: light\)"[^>]*href="([^"]*favicon\.svg)"', html)
    fav_d = re.search(r'<link rel="icon"[^>]*href="([^"]*favicon-dark\.svg)"[^>]*media="\(prefers-color-scheme: dark\)"', html)
    check('Favicon: SVG mit Farbschema-Medienattribut hell und dunkel, dazu PNG 16 und 32', bool(fav_l) and bool(fav_d) and 'savora-favicon-16.png' in html and 'savora-favicon-32.png' in html)
    sw = open(_os.path.join(ROOT, 'sw.js'), encoding='utf-8').read()
    need = ['savora-wortmarke-light.svg', 'savora-wortmarke-dark.svg', 'savora-favicon.svg', 'savora-favicon-dark.svg', 'savora-favicon-16.png', 'savora-favicon-32.png', 'savora-app-icon-180.png', 'icon-512.png', 'icon-192.png', 'icon-512-maskable.png', 'icon-192-maskable.png', 'icon-180.png']
    check('Service-Worker-Shell enthält alle verwendeten Marken-Dateien', all(n in sw for n in need), str([n for n in need if n not in sw]))
    check('Version: SW v65-paket43, VERSION und APP_VERSION 0.64.0', "'v65-paket43'" in sw and open(_os.path.join(ROOT, 'VERSION')).read().strip() == '0.64.0' and "'0.64.0'" in open(_os.path.join(ROOT, 'legal.js'), encoding='utf-8').read())
    spl = re.search(r'<div id="splash">(.*?)</div>\s*<div id="app">', html, re.S).group(1)
    check('Startbild: nur die Wortmarke (Pfad-SVG, 1200 x 400), kein Bild, kein Symbol', 'viewBox="0 0 1200 400"' in spl and '<img' not in spl and spl.count('<svg') == 1, spl[:80])
    for f in ('savora-wortmarke-light.svg', 'savora-wortmarke-dark.svg'):
        t = open(_os.path.join(LOGO, f), encoding='utf-8').read()
        check(f'{f}: nur Pfade, kein Text, keine Schrift', '<text' not in t and 'font' not in t and '<image' not in t)

    async with async_playwright() as p:
        # ---------- 2. Alle Marken-Dateien unter dem Unterpfad /Savora/ ----------
        browser, page = await new_page(p, 390, 844, 'light', 'light', url=SUB + 'index.html', seed=False)
        bad = await page.evaluate("""async (files) => { const out = []; for (const f of files) { const r = await fetch(f, { cache: 'no-store' }); await r.blob(); if (!r.ok) out.push(f + ' ' + r.status); } return out; }""",
            sorted(['assets/logo/' + f for f in os.listdir(LOGO)]) + ['manifest.json'] + [i['src'] for i in ic])
        check('Alle Marken-Dateien und Manifest-Icons laden unter /Savora/ mit HTTP 200', not bad, str(bad))
        fails = []
        page.on('requestfailed', lambda r: fails.append(r.url)); page.on('response', lambda r: fails.append(f'{r.status} {r.url}') if r.status >= 400 else None)
        await page.goto(SUB + 'index.html'); await page.wait_for_timeout(1500)
        check('Seite unter /Savora/ lädt ohne fehlgeschlagene Anfragen', not fails, str(fails[:3]))
        await browser.close()

        # ---------- 3. Wortmarke je App-Theme, auch gegen die Systemeinstellung ----------
        want = {('light', 'light'): RED, ('light', 'dark'): RED, ('dark', 'light'): CREAM, ('dark', 'dark'): CREAM,
                ('amoled', 'light'): CREAM, ('amoled', 'dark'): CREAM, ('auto', 'light'): RED, ('auto', 'dark'): CREAM}
        for (theme, scheme), col in want.items():
            browser, page = await new_page(p, 390, 844, scheme, theme)
            r = await page.evaluate("""() => { const w = document.querySelector('.topbar .top-wordmark'); const cs = getComputedStyle(w); return { color: cs.color, dt: document.documentElement.dataset.theme, label: w.getAttribute('aria-label'), role: w.getAttribute('role') }; }""")
            check(f'App {theme}, System {scheme}: Wortmarke {"rot" if col == RED else "creme"}', r['color'] == col, str(r))
            check(f'App {theme}, System {scheme}: zugänglicher Name "Savora"', r['label'] == 'Savora' and r['role'] == 'img')
            await browser.close()
        # Umschalten in der laufenden App, ohne Layoutsprung
        browser, page = await new_page(p, 390, 844, 'light', 'light')
        before = await page.evaluate("() => { const t = document.querySelector('.topbar').getBoundingClientRect(); const w = document.querySelector('.top-wordmark').getBoundingClientRect(); return [t.height, w.width, w.height, w.x, w.y]; }")
        await page.evaluate("() => { state.theme = 'dark'; applyTheme(); }"); await page.wait_for_timeout(100)
        after = await page.evaluate("() => { const t = document.querySelector('.topbar').getBoundingClientRect(); const w = document.querySelector('.top-wordmark').getBoundingClientRect(); return [t.height, w.width, w.height, w.x, w.y, getComputedStyle(document.querySelector('.top-wordmark')).color]; }")
        check('Theme-Wechsel in der App: Wortmarke wechselt auf creme, Position und Grösse bleiben gleich', after[:5] == before and after[5] == CREAM, f'{before} {after}')
        await browser.close()

        # ---------- 4. Keine Hand/kein Symbol, Proportionen, reservierter Platz ----------
        for w, h, label in ((390, 844, 'Telefon'), (1280, 800, 'Desktop')):
            browser, page = await new_page(p, w, h, 'light', 'light')
            r = await page.evaluate("""() => {
              const out = { symbols: document.querySelectorAll('.brand-symbol, .savora-symbol, .brand-mark2, .brand-icon, .brand-mark').length, imgs: [], marks: [] };
              document.querySelectorAll('.topbar img, .nav-brand img, .brand-v2 img').forEach(i => out.imgs.push(i.getAttribute('src')));
              const sel = window.innerWidth >= 900 ? '.nav-brand .wordmark' : '.topbar .top-wordmark';
              const nb = document.querySelector('.nav-brand');
              out.navChildren = nb ? Array.from(nb.children).map(c => c.tagName + '.' + (c.getAttribute('class') || '')) : [];
              document.querySelectorAll('.wordmark').forEach(wm => { const r = wm.getBoundingClientRect(); const cs = getComputedStyle(wm); if (!r.width) return; out.marks.push({ cls: wm.getAttribute('class'), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, ratio: r.width / r.height, fit: cs.objectFit, par: wm.getAttribute('preserveAspectRatio'), tr: cs.transform, attrs: wm.getAttribute('width') + 'x' + wm.getAttribute('height'), vb: wm.getAttribute('viewBox'), ar: cs.aspectRatio }); });
              return out; }""")
            marks = r['marks']
            check(f'{label}: keine Symbole, Handbilder oder App-Icons neben der Wortmarke', r['symbols'] == 0 and r['imgs'] == [], str(r))
            check(f'{label}: genau eine sichtbare Wortmarke im Kopf bzw. in der Seitenleiste', len(marks) == 1, str(marks))
            if label == 'Desktop': check('Desktop: Seitenleistenmarke besteht nur aus der Wortmarke', r['navChildren'] == ['svg.wordmark nav-wordmark'], str(r['navChildren']))
            mk = marks[0]
            lo, hi = (112, 144) if label == 'Telefon' else (140, 168)
            check(f'{label}: Wortmarke unverzerrt (3:1), kein object-fit cover, keine Neigung, Breite {lo} bis {hi} px', abs(mk['ratio'] - 3) < 0.03 and mk['fit'] != 'cover' and mk['tr'] == 'none' and mk['vb'] == '0 0 1200 400' and mk['par'] != 'none' and lo <= mk['w'] <= hi, str(mk))
            await browser.close()

        # ---------- 5. Layout 320/375/430 und grosse Systemschrift ----------
        for w in (320, 375, 430):
            for fs in (None, '24px'):
                browser, page = await new_page(p, w, 800, 'light', 'light')
                if fs: await page.evaluate("(f) => { document.documentElement.style.fontSize = f; }", fs); await page.wait_for_timeout(300)
                r = await page.evaluate("""() => { const t = document.querySelector('.topbar'); const wm = document.querySelector('.top-wordmark').getBoundingClientRect(); const acts = Array.from(document.querySelectorAll('.topbar-actions > *')).map(e => e.getBoundingClientRect());
                  return { over: document.documentElement.scrollWidth - document.documentElement.clientWidth, wmRight: wm.right, actLeft: Math.min.apply(null, acts.map(a => a.left)), actRight: Math.max.apply(null, acts.map(a => a.right)), W: window.innerWidth, wmW: wm.width }; }""")
                check(f'{w} px{" mit 24 px Systemschrift" if fs else ""}: kein Überlauf, Wortmarke überlappt die Aktionen nicht, Aktionen im Fenster', r['over'] <= 1 and r['wmRight'] <= r['actLeft'] + 0.5 and r['actRight'] <= r['W'] + 0.5, str(r))
                await browser.close()

        # ---------- 6. Titelblatt und echter PDF-Export ----------
        browser, page = await new_page(p, 390, 844, 'light', 'light')
        ev = page.evaluate
        lay = await ev("() => { const out = {}; COVER_TEMPLATES.forEach(t => { const L = coverLayout({ templateId: t.id, title: 'Titel', date: '2026-10-09' }); out[t.id] = L.logo; }); return { out, hidden: coverLayout({ templateId: 'pop', logo: false }).logo, page: COVER_PAGE }; }")
        zone_ok = all(0.5 <= l['x'] and l['x'] + l['w'] <= 0.93 + 1e-9 and l['y'] >= 0.03 and l['y'] + l['h'] <= 0.13 and 0.24 <= l['w'] <= 0.30 for l in lay['out'].values())
        check('Cover-Layout: Wortmarke 24 bis 30 % der Seitenbreite, innerhalb der sicheren Zone, über dem Textbereich', zone_ok, str(lay['out']['pop']))
        check('Option "Wortmarke anzeigen" aus: keine Marke im Layout', lay['hidden'] is None)
        tmp = tempfile.mkdtemp(prefix='savora-paket43-')
        bb = await ev("() => { const s = document.createElement('svg'); const d = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', WORDMARK_PATH); d.appendChild(p); document.body.appendChild(d); const b = p.getBBox(); d.remove(); return [b.x, b.y, b.width, b.height]; }")
        await ev("""async () => { const r = state.recipes[0]; localStorage.removeItem(COOKBOOK_PROJECTS_KEY); localStorage.setItem(COOKBOOK_CONFIG_KEY, JSON.stringify({ title: '', subtitle: '', author: '', items: [{ recipeId: r.id, chapterId: '' }], chapters: [], cover: { v: 1, templateId: 'pop', date: '2026-10-09', showDate: true } })); }""")
        for tid, inkhex, name in (('nachtkueche', '#F7F4EE', 'dunkles Titelblatt'), ('pop', '#252720', 'helles Titelblatt')):
            await ev("(t) => { const c = getCookbookConfig(); c.cover.templateId = t; c.showLogo = true; saveCookbookConfig(c); }", tid)
            res = await ev("""async () => { const r = await buildCookbookPdf('off'); if (!r) return null; const u = new Uint8Array(await r.blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); }""")
            if not res: check(f'PDF {tid} erzeugt', False); continue
            path = f'{tmp}/{tid}.pdf'; open(path, 'wb').write(base64.b64decode(res))
            png = f'{tmp}/{tid}'
            subprocess.run(['pdftoppm', '-f', '1', '-l', '1', '-r', '150', '-png', '-singlefile', path, png], check=True)
            im = Image.open(png + '.png').convert('RGB'); W, H = im.size; px = im.load()
            try: im.save(_os.path.join(os.environ.get('SAVORA_SHOTS43', OUT), f'pdf-titelblatt-{tid}.png'))
            except Exception: pass
            bgc = px[int(W * .5), 4]; ink = tuple(int(inkhex[i:i + 2], 16) for i in (1, 3, 5))
            def near(c, t, tol=40): return all(abs(c[i] - t[i]) <= tol for i in range(3))
            xs = []; ys = []
            for y in range(0, int(H * .12)):
                for x in range(int(W * .45), W):
                    if near(px[x, y], ink): xs.append(x); ys.append(y)
            if not xs: check(f'PDF {name}: Wortmarke gefunden', False); continue
            bx0, bx1, by0, by1 = min(xs) / W, max(xs) / W, min(ys) / H, max(ys) / H
            ratio = (max(xs) - min(xs)) / max(1, (max(ys) - min(ys)))
            exp_ratio = bb[2] / bb[3]
            check(f'PDF {name}: Wortmarke in Tinte/Creme, unverzerrt (Seitenverhältnis wie der Pfad)', abs(ratio / exp_ratio - 1) < 0.04, f'{ratio:.3f} vs {exp_ratio:.3f}')
            check(f'PDF {name}: Wortmarke innerhalb der sicheren Zone (x 0,65 bis 0,93, y 0,04 bis 0,13)', bx0 >= 0.64 and bx1 <= 0.93 and by0 >= 0.04 and by1 <= 0.13, f'{bx0:.3f} {bx1:.3f} {by0:.3f} {by1:.3f}')
            left_ink = sum(1 for y in range(0, int(H * .12), 3) for x in range(int(W * .05), int(W * .6), 3) if near(px[x, y], ink))
            check(f'PDF {name}: kein zweites Logo oder Symbol (nichts in der Tinte-Farbe links der Marke)', left_ink == 0, str(left_ink))
            cs = sorted([px[x, y] for y in range(int(H * .03), int(H * .13), 4) for x in range(int(W * .65), int(W * .93), 4) if not near(px[x, y], ink, 60)])
            cs = [cs[len(cs) // 2]]   # Hintergrundfarbe (Median der Nicht-Tinte-Pixel)
            def lum(c):
                f = lambda v: (v / 255 / 12.92) if v / 255 <= .03928 else ((v / 255 + .055) / 1.055) ** 2.4
                return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2])
            worst = min((max(lum(c), lum(ink)) + .05) / (min(lum(c), lum(ink)) + .05) for c in cs)
            check(f'PDF {name}: Kontrast der Wortmarke zum Hintergrund mindestens 4,5:1', worst >= 4.5, f'{worst:.1f}')
        # Ausgeblendet: keine Marke im PDF
        await ev("() => { const c = getCookbookConfig(); c.showLogo = false; saveCookbookConfig(c); }")
        res = await ev("""async () => { const r = await buildCookbookPdf('off'); const u = new Uint8Array(await r.blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); }""")
        path = f'{tmp}/off.pdf'; open(path, 'wb').write(base64.b64decode(res)); subprocess.run(['pdftoppm', '-f', '1', '-l', '1', '-r', '150', '-png', '-singlefile', path, f'{tmp}/off'], check=True)
        im = Image.open(f'{tmp}/off.png').convert('RGB'); W, H = im.size; px = im.load()
        cnt = sum(1 for y in range(0, int(H * .12), 2) for x in range(int(W * .6), W, 2) if all(abs(px[x, y][i] - (0x25, 0x27, 0x20)[i]) <= 40 for i in range(3)))
        check('Option aus: im PDF keine Wortmarke oben rechts', cnt == 0, str(cnt))
        await browser.close()

        # ---------- 7. Datenerhalt ----------
        browser, page = await new_page(p, 390, 844, 'light', 'light')
        n0 = await page.evaluate("() => state.recipes.length")
        await page.evaluate("() => { state.theme = 'dark'; applyTheme(); render(); }"); await page.wait_for_timeout(300)
        n1 = await page.evaluate("() => state.recipes.length")
        check('Rezepte bleiben beim Markenwechsel und Theme-Wechsel erhalten (Detailprüfung: test_paket37_data)', n0 == n1 and n0 > 0, f'{n0} {n1}')
        await browser.close()
    print('\nFEHLGESCHLAGEN:', ', '.join(FAIL) if FAIL else 'keine'); sys.exit(1 if FAIL else 0)
asyncio.run(main())
