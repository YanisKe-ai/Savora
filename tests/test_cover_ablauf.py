"""Cover-Editor, Ablaeufe ohne Stubs (Paket C5, ergaenzt test_cover_editor.py): nur Tastatur (Tab/Enter/Pfeile/Strg+Z, keine Maus),
echtes Bild ueber die Dateiauswahl (Paket C4) am Handy mit Touch, «Ganzes Bild anzeigen»/«Cover ausfuellen», Neuladen mit Bild,
Offline: Farbe, Bild und PDF-Export ohne Netz. Neutrale Testdaten. Port per SAVORA_TEST_PORT."""
import asyncio, base64, io, os, re, subprocess, sys, tempfile
os.environ.setdefault('SAVORA_TEST_PORT', '8996')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
from PIL import Image, ImageDraw

FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

TMP = tempfile.mkdtemp(prefix='savora-cover-ablauf-')
def testbild(path, w, h, bg):
    im = Image.new('RGB', (w, h), bg); d = ImageDraw.Draw(im); r = 0.3 * min(w, h)
    d.ellipse((w / 2 - r, h / 2 - r, w / 2 + r, h / 2 + r), fill=(230, 0, 200)); im.save(path, 'JPEG', quality=90); return path
HOCH = testbild(os.path.join(TMP, 'hoch.jpg'), 1200, 1800, (20, 40, 90))
QUER = testbild(os.path.join(TMP, 'quer.jpg'), 1800, 1200, (240, 220, 120))

async def new_page(p, w, h, touch=False):
    browser = await p.chromium.launch()
    ctx = await browser.new_context(viewport={'width': w, 'height': h}, has_touch=touch, reduced_motion='reduce', timezone_id='UTC', accept_downloads=True)
    await ctx.add_init_script(NO_SW + " try{localStorage.setItem('savora-splash-seen','1')}catch(e){}")
    page = await ctx.new_page()
    await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(300)
    await page.add_style_tag(content='::-webkit-scrollbar{display:none}html{scrollbar-width:none}')
    return browser, ctx, page

async def open_design(page):
    await page.evaluate("""() => { localStorage.removeItem('savora-cookbook-projects'); const c = getCookbookConfig(); c.items = [{ recipeId: state.recipes[0].id, chapterId: '' }];
        c.title = 'Sonntagsküche'; c.subtitle = 'Rezepte für jeden Tag'; c.author = 'Alex Muster'; saveCookbookConfig(c); state.cookbookStep = 2; state.view = 'cookbook'; render(); }""")
    await page.wait_for_selector('.ce-canvas'); await page.wait_for_timeout(600)

async def tab_to(page, js_pred, limit=250, key='Tab'):
    """Drueckt Tab (oder Shift+Tab), bis das fokussierte Element js_pred erfuellt (nur Tastatur)."""
    for i in range(limit):
        await page.keyboard.press(key)
        if await page.evaluate("(p) => { const a = document.activeElement; return !!a && (new Function('a', 'return ' + p))(a); }", js_pred): return i + 1
    return 0

CANVAS_PX = """(xy) => { const c = document.querySelector('.ce-canvas'); const x = c.getContext('2d'); const d = x.getImageData(Math.round(xy[0] * c.width), Math.round(xy[1] * c.height), 1, 1).data; return [d[0], d[1], d[2]]; }"""
def is_magenta(px): return px[0] > 180 and px[1] < 70 and px[2] > 150

async def main():
    async with async_playwright() as p:
        # ---------- 1. Nur Tastatur (Desktop 1440) ----------
        browser, ctx, page = await new_page(p, 1440, 900)
        ev = page.evaluate; errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await open_design(page)
        await ev("() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); }")
        n = await tab_to(page, "a.matches('.ce-modebtn[data-v=custom]')")
        await page.keyboard.press('Enter'); await page.wait_for_timeout(400)
        check('Tastatur: «Eigenes Cover» per Tab erreichbar und mit Enter gewaehlt', n > 0 and await ev("() => ce.model.mode") == 'custom', f'{n} Tabs')
        n = await tab_to(page, "a.matches('.ce-tab[aria-selected=true]')")
        for _ in range(3):
            if await ev("() => document.activeElement.dataset.v === 'text'"): break
            await page.keyboard.press('ArrowRight'); await page.wait_for_timeout(150)
        check('Tastatur: Reiter «Texte» per Tab und Pfeiltaste', n > 0 and await ev("() => ce.tab") == 'text', f'{n} Tabs')
        n = await tab_to(page, "a.matches('[data-ce=select][data-f=title]')")
        await page.keyboard.press('Enter'); await page.wait_for_timeout(300)
        check('Tastatur: «Gestalten» beim Kochbuchtitel per Tab/Enter waehlt den Titel aus (Rahmen erscheint)', n > 0 and await ev("() => ce.sel") == 'title' and await ev("() => !!document.querySelector('.ce-frame[data-fr=title]')"), f'{n} Tabs')
        n = await tab_to(page, "a.matches('.ce-frame[data-fr=title]')", key='Shift+Tab')
        foc = await ev("() => document.activeElement.className + '|' + (document.activeElement.dataset.fr || '')")
        check('Tastatur: Auswahlrahmen des Titels per Tastatur fokussierbar', n > 0 and 'ce-frame' in foc and foc.endswith('|title'), f'{foc} {n}')
        b0 = await ev("() => ceEff('title')"); u0 = await ev("() => ce.undo.length")
        for k in ('ArrowRight', 'ArrowRight', 'Shift+ArrowDown'): await page.keyboard.press(k)
        await page.wait_for_timeout(700)
        b1 = await ev("() => ceEff('title')")
        check('Tastatur: Pfeile verschieben (2 x 1 %, Shift 5 %)', abs(b1['x'] - b0['x'] - 0.02) < 0.002 and abs(b1['y'] - b0['y'] - 0.05) < 0.002, f'{b0} {b1}')
        await page.keyboard.press('Escape'); await page.wait_for_timeout(150)
        await page.keyboard.press('Control+z'); await page.wait_for_timeout(200)
        b2 = await ev("() => ceEff('title')")
        check('Tastatur: Strg+Z nimmt die Verschiebung zurueck (ein Schritt)', abs(b2['x'] - b0['x']) < 0.002 and abs(b2['y'] - b0['y']) < 0.002, f'{b2}')
        await page.keyboard.press('Control+Shift+z'); await page.wait_for_timeout(200)
        b3 = await ev("() => ceEff('title')")
        check('Tastatur: Strg+Shift+Z stellt sie wieder her', abs(b3['x'] - b1['x']) < 0.002 and abs(b3['y'] - b1['y']) < 0.002, f'{b3}')
        n = await tab_to(page, "a.matches('.ce-arrbtn') && a.textContent.trim() === 'Unten mittig'")
        if not n:   # Anordnungen liegen im Reiter «Anordnung»: Reiter per Tastatur oeffnen
            n0 = await tab_to(page, "a.matches('.ce-tab') ")
            for _ in range(3):
                if await ev("() => /Anordnung/.test(document.activeElement.textContent)"): break
                await page.keyboard.press('ArrowRight'); await page.wait_for_timeout(150)
            await page.keyboard.press('Enter'); await page.wait_for_timeout(300)
            n = await tab_to(page, "a.matches('.ce-arrbtn') && a.textContent.trim() === 'Unten mittig'")
        await page.keyboard.press('Enter'); await page.wait_for_timeout(400)
        check('Tastatur: Anordnung «Unten mittig» per Tab/Enter', n > 0 and await ev("() => ce.model.arrange") == 'Unten mittig', f'{n}')
        vis = await ev("() => { const a = document.activeElement; const cs = getComputedStyle(a); return [cs.outlineStyle, cs.outlineWidth, a.tagName]; }")
        check('Tastatur: sichtbarer Fokusring auf dem bedienten Knopf', vis[0] not in ('none', '') and float(vis[1].replace('px', '') or 0) >= 2, str(vis))
        check('Tastatur-Ablauf ohne Skriptfehler', not errs, str(errs[:2]))
        await browser.close()

        # ---------- 2. Echtes Bild am Handy (390, Touch), Darstellung, Neuladen ----------
        browser, ctx, page = await new_page(p, 390, 844, touch=True)
        ev = page.evaluate; errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await open_design(page)
        await page.click('.ce-modebtn[data-v=custom]'); await page.wait_for_timeout(300)
        await page.click('[data-ce="tab"][data-v="bg"]'); await page.wait_for_timeout(200)
        async with page.expect_file_chooser() as fc:
            await page.click('[data-ce="pick"]')
        await (await fc.value).set_files(HOCH)
        await page.wait_for_function("ce.model.image && ce.model.image.id", timeout=20000); await page.wait_for_timeout(800)
        im = await ev("() => ce.model.image")
        rec = await ev("(id) => dbGetImage(id).then(r => r ? { kind: r.kind, w: r.w, h: r.h, mime: r.mime } : null)", im['id'])
        check('Handy: Bild ueber die Dateiauswahl importiert (echter Import), Referenz im Modell, Bild im Store', im['id'].startswith('cover-') and im['w'] == 1200 and im['h'] == 1800 and rec and rec['kind'] == 'cover', f'{im} {rec}')
        check('Handy: Vorschau zeigt das Bild (Kreis in der Mitte)', is_magenta(await ev(CANVAS_PX, [0.5, 0.5])), str(await ev(CANVAS_PX, [0.5, 0.5])))
        await page.click('[data-ce="fit"][data-v="contain"]'); await page.wait_for_timeout(500)
        lay = await ev("() => ce.layout.image")
        r = (lay['dst']['w'] * 794) / (lay['dst']['h'] * 1123)
        check('Handy: «Ganzes Bild anzeigen»: ganzes Bild, Seitenverhaeltnis 2:3, Raender in Hintergrundfarbe', lay['fit'] == 'contain' and abs(r - 2 / 3) < 0.005 and lay['src']['w'] == 1200 and lay['src']['h'] == 1800 and not is_magenta(await ev(CANVAS_PX, [0.01, 0.5])), f'{r:.4f} {lay["src"]}')
        await page.click('[data-ce="fit"][data-v="cover"]'); await page.wait_for_timeout(500)
        lay = await ev("() => ce.layout.image")
        check('Handy: «Cover ausfuellen»: fuellt die Seite, Ausschnitt mit Bildverhaeltnis der Seite (nie gestreckt)', lay['fit'] == 'cover' and abs(lay['src']['w'] / lay['src']['h'] - 794 / 1123) < 0.003 and lay['dst'] == {'x': 0, 'y': 0, 'w': 1, 'h': 1}, str(lay))
        # Bild ersetzen: Texte und Gestaltung bleiben
        await ev("() => ceChange((m) => { m.fields.title = { ...(m.fields.title || {}), color: '#B93B2C' }; }, { now: true })"); await page.wait_for_timeout(300)
        async with page.expect_file_chooser() as fc:
            await page.click('[data-ce="pick"]')
        await (await fc.value).set_files(QUER)
        await page.wait_for_function("(id) => ce.model.image && ce.model.image.id !== id", arg=im['id'], timeout=20000); await page.wait_for_timeout(1200)
        im2 = await ev("() => ce.model.image")
        check('Handy: Bild ersetzen (echt): neues Querbild, eigene Titelfarbe und Texte bleiben', im2['w'] == 1800 and im2['h'] == 1200 and (await ev("() => ce.model.fields.title.color")) == '#B93B2C' and await ev("() => ce.texts.title") == 'Sonntagsküche', str(im2))
        await page.wait_for_function("document.querySelector('.ce-status-text') && document.querySelector('.ce-status-text').textContent === 'Gespeichert'", timeout=10000)
        saved = await ev("() => cookbookGetRaw().cover")
        check('Gespeichert: nur Referenz (keine Bilddaten) in der Kochbuch-Konfiguration', saved['image']['id'] == im2['id'] and 'data:' not in str(saved), str(saved['image']))
        await page.reload(); await page.wait_for_function("typeof state !== 'undefined' && document.getElementById('app').children.length > 0")
        await ev("() => { state.cookbookStep = 2; state.view = 'cookbook'; render(); }")
        await page.wait_for_selector('.ce-canvas'); await page.wait_for_timeout(1500)
        check('Neuladen: Entwurf mit echtem Bild wieder da (Modell, Vorschau zeigt Bild)', await ev("() => ce.model.mode") == 'custom' and await ev("() => ce.model.image && ce.model.image.id") == im2['id'] and is_magenta(await ev(CANVAS_PX, [0.5, 0.5])), str(await ev(CANVAS_PX, [0.5, 0.5])))
        # Seitenscroll auf dem Handy: horizontales Ueberlaufen trotz Bild
        over = await ev("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check('Handy 390: kein horizontales Scrollen mit Bild', over <= 1, str(over))
        check('Bild-Ablauf ohne Skriptfehler', not errs, str(errs[:2]))

        # ---------- 3. Offline: Farbe, Bild, PDF ----------
        await ev("async () => { if (typeof ensurePdfLibs === 'function') await ensurePdfLibs(); await coverEnsureFonts(); }")   # in der App haelt der Service Worker diese Dateien bereit
        await ctx.set_offline(True)
        await ev("() => window.dispatchEvent(new Event('offline'))"); await page.wait_for_timeout(300)
        await page.click('[data-ce="tab"][data-v="bg"]'); await page.wait_for_timeout(200)
        await page.click('[data-ce="img-remove"]'); await page.wait_for_timeout(400)
        sw = await page.query_selector_all('.ce-swatches[aria-label=Hintergrundfarbe] button.ce-swatch')
        if sw: await sw[min(3, len(sw) - 1)].click(); await page.wait_for_timeout(400)
        col = await ev("() => ce.model.bg.color")
        async with page.expect_file_chooser() as fc:
            await page.click('[data-ce="pick"]')
        await (await fc.value).set_files(HOCH)
        await page.wait_for_function("ce.model.image && ce.model.image.w === 1200", timeout=20000); await page.wait_for_timeout(800)
        check('Offline: Hintergrundfarbe waehlbar und Bild importierbar', bool(sw) and col != '#F7F4EE' and await ev("() => ce.model.image.h") == 1800, f'{col}')
        await page.wait_for_function("document.querySelector('.ce-status-text') && document.querySelector('.ce-status-text').textContent === 'Gespeichert'", timeout=10000)
        await ev("() => { state.cookbookStep = 3; render(); }")
        await page.wait_for_selector('[data-action="export-cookbook"]'); await page.click('[data-action="export-cookbook"]')
        await page.wait_for_selector('[data-action="pdf-export-build"]'); await page.wait_for_timeout(200)
        await page.click('[data-action="pdf-export-build"]')
        await page.wait_for_function("state.modal && (state.modal.stage === 'preview' || state.modal.stage === 'error')", timeout=90000)
        st = await ev("() => [state.modal.stage, state.modal.errorText || '']")
        ok_pdf = False
        if st[0] == 'preview':
            b64 = await ev("""async () => { const u = new Uint8Array(await state.modal.previewBlob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); }""")
            pth = os.path.join(TMP, 'offline.pdf'); open(pth, 'wb').write(base64.b64decode(b64))
            subprocess.run(['pdftoppm', '-f', '1', '-l', '1', '-r', '36', '-png', '-singlefile', pth, pth[:-4]], check=True)
            pim = Image.open(pth[:-4] + '.png').convert('RGB'); px = pim.getpixel((pim.size[0] // 2, pim.size[1] // 2))
            txt = subprocess.run(['pdftotext', '-f', '1', '-l', '1', pth, '-'], capture_output=True, text=True).stdout
            ok_pdf = is_magenta(px) and 'Sonntagsküche' in txt
        check('Offline: Kochbuch-PDF mit eigenem Bild ueber die Oberflaeche erstellt (Bild und Titel auf der Titelseite)', ok_pdf, str(st))
        await ctx.set_offline(False)
        check('Offline-Ablauf ohne Skriptfehler', not errs, str(errs[:2]))
        await browser.close()
    print('\nFEHLER:', FAIL if FAIL else 'keine')
    sys.exit(1 if FAIL else 0)

asyncio.run(main())
