"""Cover-Editor (Paket C3): Umschalter Vorlagen/Eigenes Cover, Auswahl, Ziehen (Maus, Touch), Pfeiltasten, 3x3-Raster, Anordnungen,
Undo/Redo, Autospeichern, Neuladen, Speicherfehler, Bild-Bereich (mit Stubs der Bild-Funktionen), Warnungen, Breiten 390/768/1440, Fokus und Aria.
Neutrale Testdaten. Port per SAVORA_TEST_PORT."""
import asyncio, base64, json, os, sys
os.environ.setdefault('SAVORA_TEST_PORT', '8985')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
os.makedirs('/tmp/c3_shots2', exist_ok=True)
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')
STUBS = """() => {
  window.__imp = 0; window.__rm = [];
  window.coverImageImport = async (file, key) => { window.__imp++; if (file.name === 'kaputt.png') { const e = new Error('x'); e.userMessage = 'Diese Datei ist kein gültiges Bild.'; throw e; } return { id: 'cover-test-' + window.__imp, w: 1600, h: 1000 }; };
  window.coverImageLoad = async (id) => { const c = document.createElement('canvas'); c.width = 160; c.height = 100; const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 160, 100); g.addColorStop(0, '#d33'); g.addColorStop(1, '#36c'); x.fillStyle = g; x.fillRect(0, 0, 160, 100); return c; };
  window.coverImageRemove = async (id) => { window.__rm.push(id); };
}"""

async def new_page(p, w=390, h=844, touch=False, dark=False):
    browser = await p.chromium.launch()
    ctx = await browser.new_context(viewport={'width': w, 'height': h}, has_touch=touch, reduced_motion='reduce', timezone_id='UTC', color_scheme='dark' if dark else 'light', accept_downloads=True)
    await ctx.add_init_script(NO_SW + " try{localStorage.setItem('savora-splash-seen','1')}catch(e){}")
    page = await ctx.new_page()
    await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(300)
    await page.evaluate(STUBS)
    return browser, ctx, page

async def open_design(page, title='Testbuch', sub='Ein Untertitel', name='Alex Muster'):
    await page.evaluate("() => { localStorage.removeItem('savora-cookbook-projects'); state.cookbookStep = 2; state.view = 'cookbook'; render(); }")
    await page.wait_for_selector('.ce-canvas'); await page.wait_for_timeout(700)
    for sel, v in (('#cbTitle', title), ('#cbSubtitle', sub), ('#cbAuthor', name)):
        await page.fill(sel, v)
    await page.wait_for_timeout(300)

async def stored(page): return await page.evaluate("() => cookbookGetRaw()")
async def fld(page, id): return await page.evaluate("(i) => (ce.model.fields[i] || {})", id)
async def box(page, sel):
    return await page.evaluate("(s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }", sel)

import math, struct, zlib
def make_png(w, h, rgb):
    """Echtes Testbild (RGB, ohne Bibliothek) fuer den richtigen Import ueber coverImageImport."""
    raw = b''.join(b'\x00' + bytes(rgb) * w for _ in range(h))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')

async def new_page_real(p, w=1440, h=900, touch=False):
    """Wie new_page, aber mit den echten Bild-Funktionen (cover-image.js, IndexedDB)."""
    browser = await p.chromium.launch()
    ctx = await browser.new_context(viewport={'width': w, 'height': h}, has_touch=touch, reduced_motion='reduce', timezone_id='UTC')
    await ctx.add_init_script(NO_SW + " try{localStorage.setItem('savora-splash-seen','1')}catch(e){}")
    page = await ctx.new_page()
    await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(300)
    return browser, ctx, page

async def center(page, sel):
    b = await box(page, sel); return b['x'] + b['w'] / 2, b['y'] + b['h'] / 2

async def rot_and_images(p):
    """Paket Drehen und Zusatzbilder: Drehgriff, Einrasten, Tastatur, Schieber, Undo, gedrehtes Verschieben, Reiter Bilder, Neuladen."""
    browser, ctx, page = await new_page_real(p, 1440, 900)
    ev = page.evaluate; errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    await open_design(page, 'Sonntagsküche', 'Rezepte aus dem Garten', 'Alex Muster')
    await page.click('[data-ce="mode"][data-v="custom"]'); await page.click('[data-ce="tab"][data-v="text"]')
    await page.click('[data-ce="select"][data-f="title"]'); await page.wait_for_timeout(300)
    # ---------- Drehgriff mit der Maus ----------
    cx, cy = await center(page, '.ce-frame[data-fr="title"]'); gx, gy = await center(page, '.ce-grip--rot')
    r = math.hypot(gx - cx, gy - cy); a0 = math.atan2(gy - cy, gx - cx)
    u0 = await ev("() => ce.undo.length")
    await page.mouse.move(gx, gy); await page.mouse.down()
    for i in range(1, 9):
        a = a0 + math.radians(16.5) * i / 8; await page.mouse.move(cx + r * math.cos(a), cy + r * math.sin(a))
    await page.mouse.up(); await page.wait_for_timeout(250)
    rot = (await fld(page, 'title')).get('rot'); u1 = await ev("() => ce.undo.length")
    check('Drehgriff (Maus) dreht den Titel im Uhrzeigersinn und rastet bei 15° ein', rot == 15, str(rot))
    check('Eine Drehbewegung = genau ein Undo-Schritt', u1 - u0 == 1, f'{u0} {u1}')
    tf = await ev("() => document.querySelector('.ce-frame[data-fr=\"title\"]').style.transform")
    check('Rahmen und Griffe drehen mit dem Feld (transform: rotate)', tf == 'rotate(15deg)', tf)
    await ev("() => ceUndo()"); await page.wait_for_timeout(100)
    check('Rückgängig hebt die ganze Drehung auf', not (await fld(page, 'title')).get('rot'))
    # Shift = ohne Einrasten
    cx, cy = await center(page, '.ce-frame[data-fr="title"]'); gx, gy = await center(page, '.ce-grip--rot')
    r = math.hypot(gx - cx, gy - cy); a0 = math.atan2(gy - cy, gx - cx)
    await page.mouse.move(gx, gy); await page.mouse.down(); await page.keyboard.down('Shift')
    for i in range(1, 9):
        a = a0 - math.radians(16.5) * i / 8; await page.mouse.move(cx + r * math.cos(a), cy + r * math.sin(a))
    await page.mouse.up(); await page.keyboard.up('Shift'); await page.wait_for_timeout(250)
    rot = (await fld(page, 'title')).get('rot')
    check('Mit Umschalt frei drehen (kein Einrasten): etwa −16.5°', rot is not None and abs(rot + 16.5) <= 0.75 and rot != -15, str(rot))
    # ---------- Tastatur R / Shift+R ----------
    await page.click('[data-ce="rot-step"][data-f="title"][data-d="0"]'); await page.wait_for_timeout(100)
    check('Knopf «0°» setzt die Drehung zurück', not (await fld(page, 'title')).get('rot'))
    await ev("() => document.querySelector('.ce-frame[data-fr=\"title\"]').focus()")
    lab = await ev("() => document.activeElement.getAttribute('aria-label')")
    await page.keyboard.press('r'); r1 = (await fld(page, 'title')).get('rot')
    await page.keyboard.press('Shift+R'); r2 = (await fld(page, 'title')).get('rot')
    await page.keyboard.press('Alt+r'); r3 = (await fld(page, 'title')).get('rot')
    check('Tastatur: R dreht um 1°, Umschalt+R um 15°, Alt+R zurück', (r1, r2, r3) == (1, 16, 15), str((r1, r2, r3)))
    check('Rahmen nennt die Drehtasten in der aria-Beschriftung, Fokus bleibt', 'R dreht um 1 Grad' in (lab or '') and await ev("() => document.activeElement.classList.contains('ce-frame')"), lab)
    # ---------- Schieber, Zahl, Knöpfe ----------
    await ev("() => { const r = document.querySelector('#ce-rot-title'); r.value = 30; r.dispatchEvent(new Event('input', { bubbles: true })); }")
    a = (await fld(page, 'title')).get('rot'); num = await page.input_value('[data-ce-input="rotnum"][data-f="title"]')
    check('Schieber «Drehung» setzt 30°, Zahl folgt', a == 30 and num == '30', f'{a} {num}')
    await page.fill('[data-ce-input="rotnum"][data-f="title"]', '-45'); await page.dispatch_event('[data-ce-input="rotnum"][data-f="title"]', 'change')
    a = (await fld(page, 'title')).get('rot')
    await page.click('[data-ce="rot-step"][data-f="title"][data-d="15"]'); b = (await fld(page, 'title')).get('rot')
    await page.click('[data-ce="rot-step"][data-f="title"][data-d="-15"]'); await page.click('[data-ce="rot-step"][data-f="title"][data-d="-15"]'); c = (await fld(page, 'title')).get('rot')
    check('Zahl in Grad (−45), Knöpfe «+15°» und «−15°»', (a, b, c) == (-45, -30, -60), str((a, b, c)))
    vt = await ev("() => document.querySelector('#ce-rot-title').getAttribute('aria-valuetext')")
    check('Schieber hat aria-valuetext in Grad', vt == '-60°', vt)
    # ---------- Gedrehtes Feld verschieben und Breite ändern ----------
    await ev("() => ceSetRot('title', 90)"); await page.wait_for_timeout(150)
    pv = await box(page, '.ce-preview'); b0 = await ev("() => ceBoxes().title")
    cx, cy = await center(page, '.ce-frame[data-fr="title"]')
    await page.mouse.move(cx, cy); await page.mouse.down()
    for i in range(1, 7): await page.mouse.move(cx + 8 * i, cy)
    await page.mouse.up(); await page.wait_for_timeout(200)
    b1 = await ev("() => ceBoxes().title")
    check('Gedrehtes Feld (90°) nach rechts ziehen bewegt es nach rechts (nicht nach unten)', abs((b1['x'] - b0['x']) - 48 / pv['w']) < 0.01 and abs(b1['y'] - b0['y']) < 0.01, f'{b0} {b1}')
    w0 = b1['w']; gx, gy = await center(page, '.ce-grip--w')
    await page.mouse.move(gx, gy); await page.mouse.down()
    for i in range(1, 7): await page.mouse.move(gx, gy - 6 * i)
    await page.mouse.up(); await page.wait_for_timeout(200)
    w1 = (await ev("() => ceBoxes().title"))['w']
    check('Breitengriff bei 90°: Ziehen entlang der gedrehten Feldachse (nach oben) ändert die Breite', abs((w0 - w1) - 36 / pv['w']) < 0.012, f'{w0} {w1}')
    # ---------- Reiter Bilder ----------
    await ev("() => { window.__rm = []; const o = window.coverImageRemove; window.coverImageRemove = async (id, x) => { window.__rm.push(id); return o && o(id, x); }; }")
    await page.click('[data-ce="tab"][data-v="img"]'); await page.wait_for_timeout(200)
    tabs = await ev("() => Array.from(document.querySelectorAll('.ce-tab')).map(t => t.textContent)")
    check('Reiter in der Reihenfolge Hintergrund · Texte · Bilder · Anordnung', tabs == ['Hintergrund', 'Texte', 'Bilder', 'Anordnung'], str(tabs))
    await page.set_input_files('[data-ce-xfile]', files=[{'name': 'kaputt.png', 'mimeType': 'image/png', 'buffer': b'kein bild'}])
    await page.wait_for_function("() => { const e = document.querySelector('#cepanel .ce-error'); return e && !e.hidden; }")
    err = await ev("() => document.querySelector('#cepanel .ce-error').textContent")
    check('Kaputte Datei: Fehlermeldung (userMessage) unter dem Knopf, kein Bild', len(err) > 10 and await ev("() => (ce.model.images || []).length") == 0, err)
    await page.set_input_files('[data-ce-xfile]', files=[{'name': 'quer.png', 'mimeType': 'image/png', 'buffer': make_png(400, 300, (200, 80, 60))}])
    await page.wait_for_function("() => (ce.model.images || []).length === 1")
    im = await ev("() => ce.model.images[0]")
    check('Bild hinzufügen: Eintrag mit imgId, iw/ih, Mitte, hinter dem Text, ausgewählt', im['imgId'].startswith('cover-') and im['iw'] == 400 and im['ih'] == 300 and im['z'] == 'below' and await ev("() => ce.sel") == 'img-' + im['id'], str(im))
    await page.wait_for_function("() => { const c = document.querySelector('canvas.ce-thumb'); return c && c.dataset.done; }")
    check('Liste zeigt ein Vorschaubild', await ev("() => document.querySelectorAll('.ce-imgitem').length") == 1)
    sid = 'img-' + im['id']
    # Grösse (Seitenverhältnis bleibt), Drehung, Ebene
    h0 = await ev("(s) => { const b = ceBoxOf(s); return b.h / b.w; }", sid)
    await ev("(s) => { const r = document.getElementById('ce-iw-' + s); r.value = 60; r.dispatchEvent(new Event('input', { bubbles: true })); }", sid)
    h1 = await ev("(s) => { const b = ceBoxOf(s); return b.h / b.w; }", sid); im = await ev("() => ce.model.images[0]")
    check('Grösse: Schieber setzt die Breite, Seitenverhältnis und Mitte bleiben', im['w'] == 0.6 and abs(h0 - h1) < 1e-6 and im['x'] == 0.5, f'{im} {h0} {h1}')
    await page.click(f'[data-ce="rot-step"][data-f="{sid}"][data-d="15"]'); await page.click(f'[data-ce="ximg-z"][data-v="above"]'); await page.wait_for_timeout(150)
    im = await ev("() => ce.model.images[0]")
    check('Drehung (+15°) und «Vor den Text» für das Bild', im['rot'] == 15 and im['z'] == 'above', str(im))
    zi = await ev("(s) => document.querySelector(`[data-fr='${s}']`).style.transform", sid)
    check('Bildrahmen dreht mit', zi == 'rotate(15deg)', zi)
    # Position per Raster und Richtungstasten
    await page.click(f'[data-ce="place"][data-f="{sid}"][data-c="0"][data-r="0"]'); await page.wait_for_timeout(100)
    bb = await ev("(s) => ceBoxOf(s)", sid)
    check('3×3-Raster «oben links» setzt das Bild oben links', abs(bb['x'] - 0.09) < 0.005 and abs(bb['y'] - 0.10) < 0.005, str(bb))
    await page.click(f'[data-ce="nudge"][data-f="{sid}"][data-dx="1"]'); bb2 = await ev("(s) => ceBoxOf(s)", sid)
    check('Richtungsknopf verschiebt das Bild um 1 %', abs(bb2['x'] - bb['x'] - 0.01) < 0.002, f'{bb} {bb2}')
    # Eckgriff: Grösse in der Vorschau
    await page.click('[data-ce="place"][data-f="%s"][data-c="1"][data-r="1"]' % sid); await page.wait_for_timeout(100)
    w0 = (await ev("() => ce.model.images[0]"))['w']; gx, gy = await center(page, '.ce-grip--size')
    await page.mouse.move(gx, gy); await page.mouse.down()
    for i in range(1, 7): await page.mouse.move(gx + 5 * i, gy + 5 * i)
    await page.mouse.up(); await page.wait_for_timeout(200)
    w1 = (await ev("() => ce.model.images[0]"))['w']
    check('Eckgriff vergrössert das Bild (Seitenverhältnis bleibt)', w1 > w0 + 0.02, f'{w0} {w1}')
    # zweites Bild, Auswahl bei Überlagerung: oberstes zuerst
    await page.set_input_files('[data-ce-xfile]', files=[{'name': 'hoch.png', 'mimeType': 'image/png', 'buffer': make_png(200, 400, (60, 110, 200))}])
    await page.wait_for_function("() => (ce.model.images || []).length === 2")
    im2 = await ev("() => ce.model.images[1]")
    check('Zweites Bild: hinter dem Text, ausgewählt', im2['z'] == 'below' and await ev("() => ce.sel") == 'img-' + im2['id'])
    await ev("() => ceSelect(null)"); await page.wait_for_timeout(100)
    # Bild 2 genau unter Bild 1 schieben: Tippen in die Mitte waehlt das obere (Bild 1, vor dem Text)
    await ev("() => ceChange((m) => { m.images[1] = { ...m.images[1], x: m.images[0].x, y: m.images[0].y }; })"); await ev("() => window.scrollTo(0, 0)"); await page.wait_for_timeout(250)
    hx, hy = await center(page, f'[data-hit="{sid}"]')
    top = await ev("([x, y]) => { const e = document.elementFromPoint(x, y); return e ? (e.dataset.hit || e.dataset.fr || e.className) : null; }", [hx, hy])
    await page.mouse.click(hx, hy); await page.wait_for_timeout(200)
    check('Tippen in der Vorschau wählt bei Überlagerung das oberste Bild', top == sid and await ev("() => ce.sel") == sid and await ev("() => ce.tab") == 'img', f'{top} {await ev("() => ce.sel")}')
    # bis 4, dann gesperrt
    for k in (3, 4):
        await page.set_input_files('[data-ce-xfile]', files=[{'name': f'b{k}.png', 'mimeType': 'image/png', 'buffer': make_png(120, 120, (40 * k, 160, 90))}])
        await page.wait_for_function(f"() => (ce.model.images || []).length === {k}")
    await page.wait_for_function("() => !ce.imgBusy")
    dis = await ev("() => document.querySelector('[data-ce=\"ximg-add\"]').disabled"); note = await page.inner_text('#ce-ximg-note')
    check('Höchstens 4 Bilder: Knopf deaktiviert, Hinweis', dis and 'Höchstens 4' in note, note)
    # Entfernen: nur Referenz
    await ev("() => ceSelect('img-' + ce.model.images[3].id)"); await page.wait_for_timeout(100)
    await page.click('[data-ce="ximg-remove"]'); await page.wait_for_timeout(200)
    check('Bild entfernen: nur die Referenz, coverImageRemove wird nicht aufgerufen, Knopf wieder aktiv', await ev("() => ce.model.images.length") == 3 and await ev("() => window.__rm.length") == 0 and not await ev("() => document.querySelector('[data-ce=\"ximg-add\"]').disabled"))
    # ---------- Neuladen ----------
    await ev("() => ceFlush()"); await page.wait_for_timeout(200)
    before = await ev("() => JSON.stringify({ i: ce.model.images, r: ce.model.fields.title.rot })")
    await page.reload(); await page.wait_for_function("typeof state !== 'undefined' && document.getElementById('app').children.length > 0"); await page.wait_for_timeout(500)
    await ev("() => { state.cookbookStep = 2; state.view = 'cookbook'; render(); }"); await page.wait_for_selector('.ce-canvas'); await page.wait_for_timeout(800)
    after = await ev("() => JSON.stringify({ i: ce.model.images, r: ce.model.fields.title.rot })")
    check('Neuladen stellt Drehung und alle Bilder (Lage, Grösse, Ebene) wieder her', before == after and await ev("() => ce.model.images.length") == 3, after[:160])
    await page.click('[data-ce="tab"][data-v="img"]'); await page.wait_for_timeout(200)
    await page.wait_for_function("() => document.querySelectorAll('canvas.ce-thumb[data-done]').length === 3")
    check('Nach dem Neuladen: Vorschaubilder aus dem Speicher geladen', True)
    painted = await ev("() => new Promise(r => setTimeout(() => r(!!document.querySelector('canvas.ce-canvas').dataset.painted && !ce.paintError), 600))")
    check('Vorschau zeichnet ohne Fehler (Zusatzbilder geladen)', painted)
    # ---------- Zurücksetzen ----------
    await page.click('[data-ce="tab"][data-v="arr"]'); await page.click('[data-ce="arr-reset"]'); await page.wait_for_timeout(200)
    check('«Anordnung zurücksetzen»: Textdrehung 0, Bilder bleiben', not (await fld(page, 'title')).get('rot') and await ev("() => ce.model.images.length") == 3)
    await page.click('[data-ce="cover-reset"]'); await page.wait_for_selector('.modal-sheet')
    dlg = await page.inner_text('.modal-sheet')
    await page.click('[data-action="ce-reset-confirm"]'); await page.wait_for_timeout(500)
    check('«Cover zurücksetzen» nennt und entfernt auch die zusätzlichen Bilder', 'zusätzlichen Bilder' in dlg and not await ev("() => (ce.model.images || []).length"), dlg[:120])
    await ev("() => ceUndo()"); await page.wait_for_timeout(300)
    check('Cover zurücksetzen ist rückgängig machbar (Bilder wieder da)', await ev("() => (ce.model.images || []).length") == 3)
    check('Keine Skriptfehler (Drehen und Bilder)', not errs, str(errs[:2]))
    await browser.close()

    # ---------- Breiten, Tippflächen, Fokus, Screenshots ----------
    for w, h in ((390, 844), (768, 1024), (1440, 900)):
        browser, ctx, page = await new_page_real(p, w, h)
        ev = page.evaluate
        await open_design(page, 'Sonntagsküche', 'Rezepte aus dem Garten', 'Alex Muster')
        await page.click('[data-ce="mode"][data-v="custom"]'); await page.click('[data-ce="color"][data-v="#F2D98A"]')
        await page.click('[data-ce="tab"][data-v="img"]'); await page.wait_for_timeout(150)
        await page.set_input_files('[data-ce-xfile]', files=[{'name': 'a.png', 'mimeType': 'image/png', 'buffer': make_png(300, 300, (156, 181, 154))}])
        await page.wait_for_function("() => (ce.model.images || []).length === 1 && !ce.imgBusy")
        await page.set_input_files('[data-ce-xfile]', files=[{'name': 'b.png', 'mimeType': 'image/png', 'buffer': make_png(400, 240, (185, 59, 44))}])
        await page.wait_for_function("() => (ce.model.images || []).length === 2 && !ce.imgBusy")
        await ev("() => ceChange((m) => { m.images[0] = { ...m.images[0], x: 0.7, y: 0.72, w: 0.38, rot: -12 }; m.images[1] = { ...m.images[1], x: 0.3, y: 0.8, w: 0.36, rot: 8, z: 'above' }; m.fields.title = { ...(m.fields.title || {}), rot: -8, x: 0.1, y: 0.2 }; }, { panels: true })")
        await page.wait_for_timeout(300)
        over = await ev("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check(f'{w} px (Bilder): kein horizontales Scrollen', over <= 1, str(over))
        if w == 390:
            small = await ev("() => Array.from(document.querySelectorAll('.ce-imgitem, .ce-rotnum input, [data-ce=rot-step], [data-ce=ximg-z], [data-ce=ximg-add], [data-ce=ximg-replace], [data-ce=ximg-remove], #cepanel input[type=range]')).filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.width < 43.5 || r.height < 43.5); }).map(e => e.className + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height))")
            check('Bilder und Drehung: Tippflächen mindestens 44 px', not small, str(small[:4]))
            g = await ev("() => { const r = document.querySelector('.ce-grip--rot'); return r ? r.getBoundingClientRect().width + 20 : 0; }")
            check('Drehgriff: Tippfläche mindestens 44 px', g >= 43.5, str(g))
            ta = await ev("() => [getComputedStyle(document.querySelector('.ce-grip--rot')).touchAction, getComputedStyle(document.querySelector('.ce-frame')).touchAction, getComputedStyle(document.querySelector('.ce-hit')).touchAction]")
            check('touch-action: none nur auf den Griffen (Rahmen und Trefferflächen scrollen)', ta[0] == 'none' and ta[1] != 'none' and ta[2] != 'none', str(ta))
            await ev("() => document.querySelector('.ce-imgitem').focus()"); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab')
            fo = await ev("() => { const s = getComputedStyle(document.activeElement); return [document.activeElement.className, s.outlineStyle, s.outlineWidth]; }")
            check('Fokus sichtbar auf den Bildkarten (3 px)', fo[1] == 'solid' and fo[2] == '3px', str(fo))
            await ev("() => ceSelect('img-' + ce.model.images[0].id)"); await page.wait_for_timeout(150)
            await ev("() => document.querySelector('[data-ce-input=rotnum]').focus()")
            fo = await ev("() => { const s = getComputedStyle(document.activeElement); return [s.outlineStyle, s.outlineWidth]; }")
            check('Fokus sichtbar im Gradfeld', fo == ['solid', '3px'], str(fo))
        if w in (390, 1440):
            await ev("() => ceSelect('title')"); await page.wait_for_timeout(300)
            await ev("() => { document.activeElement.blur(); window.scrollTo(0, 0); }"); await page.wait_for_timeout(500)
            await page.screenshot(path=f'/tmp/r2_shots/drehen_{w}.png')
            await ev("() => ceSelect('img-' + ce.model.images[0].id)"); await page.wait_for_timeout(300)
            await ev("() => { document.activeElement.blur(); window.scrollTo(0, 0); }"); await page.wait_for_timeout(400)
            await page.screenshot(path=f'/tmp/r2_shots/bilder_{w}.png', full_page=(w == 1440))
        await browser.close()

async def main():
    async with async_playwright() as p:
        browser, ctx, page = await new_page(p)
        ev = page.evaluate; errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await open_design(page)

        # ---------- 1. Umschalter ----------
        st = await ev("() => Array.from(document.querySelectorAll('.ce-modebtn')).map(b => [b.textContent.trim(), b.getAttribute('aria-pressed')])")
        check('Umschalter «Vorlagen | Eigenes Cover» mit aria-pressed, Vorlagen aktiv', st == [['Vorlagen', 'true'], ['Eigenes Cover', 'false']], str(st))
        check('Vorlagen: Raster mit allen Motiven, Texte-Reiter zeigt die Eingabefelder', await ev("() => document.querySelectorAll('.cover-opt').length === COVER_TEMPLATES.length") and await page.is_visible('#cbTitle'))
        await page.click('.cover-opt[aria-label="Citrus"]'); await page.wait_for_timeout(200)
        await page.click('[data-ce="mode"][data-v="custom"]'); await page.wait_for_timeout(300)
        check('Eigenes Cover: Reiter Hintergrund · Texte · Bilder · Anordnung, kein Motivraster', await ev("() => Array.from(document.querySelectorAll('.ce-tab')).map(t => t.textContent)") == ['Hintergrund', 'Texte', 'Bilder', 'Anordnung'] and await ev("() => document.querySelectorAll('.cover-opt').length") == 0)
        await page.click('[data-ce="color"][data-v="#22382F"]'); await page.wait_for_timeout(300)
        await page.click('[data-ce="mode"][data-v="template"]'); await page.wait_for_timeout(300)
        raw = (await stored(page))['cover']
        check('Wechsel zurück verwirft nichts: Vorlage Citrus, Farbe und Texte bleiben gespeichert', raw['mode'] == 'template' and raw['templateId'] == 'citrus' and raw['bg']['color'] == '#22382F' and await ev("() => document.querySelector('.cover-opt.is-active').dataset.id") == 'citrus' and await page.input_value('#cbTitle') == 'Testbuch', str(raw)[:160])
        await page.click('[data-ce="mode"][data-v="custom"]'); await page.wait_for_timeout(300)
        check('Zurück zu Eigenes Cover: Farbe noch da', await ev("() => ce.model.bg.color") == '#22382F' and await ev("() => ce.model.mode") == 'custom')

        # ---------- 2. Auswahl: Antippen wählt nur aus ----------
        await page.click('[data-ce="tab"][data-v="text"]'); await page.wait_for_timeout(200)
        await page.click('.ce-hit[data-hit="title"]'); await page.wait_for_timeout(300)
        act = await ev("() => document.activeElement && document.activeElement.tagName")
        fr = await ev("() => { const f = document.querySelector('.ce-frame[data-fr=\"title\"]'); return f ? f.getAttribute('aria-label') : null; }")
        check('Antippen wählt das Feld aus (Rahmen, Beschriftung), Tastatur öffnet nicht', fr and 'Kochbuchtitel' in fr and await ev("() => !!document.querySelector('.ce-field[data-f=title] .ce-badge') && !document.querySelector('.ce-field[data-f=title] [data-ce=select]')") and act not in ('INPUT', 'TEXTAREA'), f'{act} {fr}')
        await page.click('[data-ce="edit"][data-f="title"]')
        check('«Text bearbeiten» setzt den Fokus ins Eingabefeld', await ev("() => document.activeElement.id") == 'cbTitle')
        check('Einmaliger Rahmen und Griffe (Verschieben, Breite, Drehen) nur beim ausgewählten Feld', await ev("() => document.querySelectorAll('.ce-frame').length") == 1 and await ev("() => Array.from(document.querySelectorAll('.ce-grip')).map(g => g.dataset.grip).sort().join()") == 'move,rot,width')
        ts = await ev("() => ({ frame: getComputedStyle(document.querySelector('.ce-frame')).touchAction, grip: getComputedStyle(document.querySelector('.ce-grip')).touchAction, prev: getComputedStyle(document.querySelector('.ce-preview')).touchAction, canvas: getComputedStyle(document.querySelector('.ce-canvas')).touchAction, hit: getComputedStyle(document.querySelector('.ce-hit')).touchAction })")
        check('touch-action: none nur auf den Griffen, nicht auf Rahmen, Vorschau oder Seite', ts['grip'] == 'none' and ts['frame'] != 'none' and ts['prev'] != 'none' and ts['canvas'] != 'none' and ts['hit'] != 'none', str(ts))

        # ---------- 3. Ziehen mit der Maus (eine Bewegung = ein Undo-Schritt) ----------
        await page.click('.ce-frame[data-fr="title"]', position={'x': 5, 'y': 5}) if False else None
        before = await ev("() => ceBoxes().title"); u0 = await ev("() => ce.undo.length")
        fb = await box(page, '.ce-frame[data-fr="title"]')
        cx, cy = fb['x'] + fb['w'] / 2, fb['y'] + fb['h'] / 2
        await page.mouse.move(cx, cy); await page.mouse.down()
        for i in range(1, 9): await page.mouse.move(cx + 6 * i, cy + 12 * i)
        guides = await ev("() => getComputedStyle(document.querySelector('.ce-guides')).opacity")
        await page.mouse.up(); await page.wait_for_timeout(300)
        after = await ev("() => ceBoxes().title"); u1 = await ev("() => ce.undo.length")
        pv = await box(page, '.ce-preview')
        check('Hilfslinien erscheinen nur beim Ziehen', guides == '1' and await ev("() => getComputedStyle(document.querySelector('.ce-guides')).opacity") == '0', guides)
        check('Ziehen mit der Maus verschiebt das Feld um die gezogene Strecke (in Seitenanteilen)', abs((after['x'] - before['x']) - 48 / pv['w']) < 0.02 and abs((after['y'] - before['y']) - 96 / pv['h']) < 0.02, f'{before} {after}')
        check('Eine abgeschlossene Ziehbewegung = genau ein Undo-Schritt', u1 - u0 == 1, f'{u0} {u1}')
        await ev("() => ceUndo()"); await page.wait_for_timeout(100)
        un = await ev("() => ceBoxes().title")
        check('Rückgängig stellt die Position vor dem Ziehen wieder her', abs(un['x'] - before['x']) < 0.003 and abs(un['y'] - before['y']) < 0.003, str(un))
        await page.keyboard.press('Control+z') if False else None
        await ev("() => ceRedo()"); await page.wait_for_timeout(100)
        rd = await ev("() => ceBoxes().title")
        check('Wiederholen setzt sie erneut', abs(rd['x'] - after['x']) < 0.003 and abs(rd['y'] - after['y']) < 0.003)
        # Undo per Tastatur (Fokus nicht im Textfeld)
        await ev("() => document.activeElement.blur()")
        await page.keyboard.press('Control+z'); await page.wait_for_timeout(100)
        k1 = await ev("() => ceBoxes().title")
        await page.keyboard.press('Control+Shift+z'); await page.wait_for_timeout(100)
        k2 = await ev("() => ceBoxes().title")
        check('Strg+Z und Strg+Shift+Z gehen vor und zurück', abs(k1['y'] - before['y']) < 0.003 and abs(k2['y'] - after['y']) < 0.003, f'{k1} {k2}')

        # ---------- 4. Pfeiltasten ----------
        await ev("() => document.querySelector('.ce-frame[data-fr=\"title\"]').focus()")
        e0 = await ev("() => ceEff('title')"); u0 = await ev("() => ce.undo.length")
        await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Shift+ArrowDown')
        e1 = await ev("() => ceEff('title')"); u1 = await ev("() => ce.undo.length")
        check('Pfeiltasten: 1 % pro Druck, Shift 5 %', abs(e1['x'] - e0['x'] - 0.02) < 0.002 and abs(e1['y'] - e0['y'] - 0.05) < 0.002, f'{e0["x"]} {e1["x"]} {e0["y"]} {e1["y"]}')
        check('Schnell wiederholte Pfeiltasten werden zu einem Undo-Schritt zusammengefasst', u1 - u0 == 1, f'{u0} {u1}')
        check('Fokus bleibt auf dem Rahmen (kein Neuzeichnen mit Fokusverlust)', await ev("() => document.activeElement.classList.contains('ce-frame')"))
        await page.keyboard.press('Escape'); await page.wait_for_timeout(100)
        check('Escape hebt die Auswahl auf', await ev("() => document.querySelectorAll('.ce-frame').length") == 0)

        # ---------- 5. Positionsraster und Richtungsknöpfe ----------
        await page.click('[data-ce="select"][data-f="title"]'); await page.wait_for_timeout(200)
        await page.click('[data-ce="place"][data-f="title"][data-c="2"][data-r="2"]'); await page.wait_for_timeout(300)
        bx = await ev("() => ceBoxes().title"); f = await fld(page, 'title')
        check('3×3-Raster: unten rechts setzt Position und Ausrichtung', f.get('align') == 'right' and abs(bx['x'] + bx['w'] - 0.91) < 0.02 and bx['y'] + bx['h'] > 0.85, str((bx, f)))
        y0 = (await ev("() => ceEff('title')"))['y']
        await page.click('[data-ce="nudge"][data-f="title"][data-dy="-1"]', modifiers=['Shift']); await page.wait_for_timeout(100)
        y1 = (await ev("() => ceEff('title')"))['y']
        check('Richtungsknopf nach oben: 5 % mit Umschalt', abs(y0 - y1 - 0.05) < 0.003, f'{y0} {y1}')
        await page.click('.ce-exact summary'); await page.fill('[data-ce-input="x"][data-f="title"]', '12.5'); await page.dispatch_event('[data-ce-input="x"][data-f="title"]', 'change')
        check('«Genau einstellen»: x in Prozent', abs((await fld(page, 'title'))['x'] - 0.125) < 0.001)

        # ---------- 6. Texte: Grösse, Farbe, Ausrichtung, Breite, Schrift ----------
        pt0 = (await ev("() => ceEff('title')"))['fontPt']
        await page.click('[data-ce="step"][data-f="title"][data-d="1"]')
        check('A+ vergrössert die Schrift', (await fld(page, 'title'))['fontPt'] > pt0)
        await ev("() => { const r = document.querySelector('#ce-fontPt-title'); r.value = 40; r.dispatchEvent(new Event('input', { bubbles: true })); }")
        check('Schieber setzt die Schriftgrösse in Punkt', (await fld(page, 'title'))['fontPt'] == 40)
        await page.click('.ce-field[data-f="title"] [data-ce="color"][data-v="#B93B2C"]')
        await page.click('.ce-field[data-f="title"] [data-ce="align"][data-v="center"]')
        await page.click('[data-ce="font"][data-v="Lilita One"]')
        f = await fld(page, 'title')
        check('Farbe (Savora-Palette), Ausrichtung und Titelschrift werden gespeichert', f.get('color') == '#B93B2C' and f.get('align') == 'center' and f.get('font') == 'Lilita One', str(f))
        check('Titelschriften: genau die erlaubten vier', await ev("() => Array.from(document.querySelectorAll('.ce-font')).map(b => b.dataset.v)") == ['Sofia Sans Extra Condensed', 'Lilita One', 'Archivo', 'Baloo 2'])
        check('Kein Duplikat: Text bleibt in cfg.title, fields.title hat keinen text', 'text' not in f and (await stored(page))['title'] == 'Testbuch')
        # Weitere Textzeile
        await page.fill('#cbExtra1', 'Für alle Gäste'); await page.wait_for_timeout(300)
        check('«Weitere Textzeile» liegt in fields.extra1.text und erscheint im Layout', (await fld(page, 'extra1')).get('text') == 'Für alle Gäste' and await ev("() => ce.layout.blocks.some(b => (b.id || b.key) === 'extra1')"))
        # Datum ein-/ausblenden
        await page.uncheck('[data-cb-cover-flag="showDate"]'); await page.wait_for_timeout(300)
        check('Datum ausblenden: nicht mehr im Layout, gespeichert', await ev("() => !ce.layout.date") and (await stored(page))['cover']['showDate'] is False)
        await page.check('[data-cb-cover-flag="showDate"]')

        # ---------- 7. Anordnungen ----------
        await page.click('[data-ce="tab"][data-v="arr"]'); await page.wait_for_timeout(200)
        arrs = await ev("() => Array.from(document.querySelectorAll('.ce-arrbtn')).map(b => b.textContent.trim())")
        check('Sechs Anordnungen', arrs == ['Oben links', 'Oben mittig', 'Mittig', 'Unten links', 'Unten mittig', 'Frei platzieren'], str(arrs))
        ys = {}
        for a in ('Oben links', 'Mittig', 'Unten mittig'):
            await page.click(f'[data-ce="arrange"][data-v="{a}"]'); await page.wait_for_timeout(250)
            ys[a] = (await ev("() => ceBoxes().title"))['y']
            check(f'Anordnung «{a}» gesetzt (aria-pressed, Modell)', await ev("() => ce.model.arrange") == a and await ev("(a) => document.querySelector('.ce-arrbtn[aria-pressed=true]').textContent.trim() === a", a))
        check('Anordnungen platzieren den Block oben, mittig, unten', ys['Oben links'] < ys['Mittig'] < ys['Unten mittig'], str(ys))
        cur = (await fld(page, 'title')).get('color')
        check('Anordnung erhält die eigene Textfarbe', cur == '#B93B2C', str(cur))
        await ev("() => ceUndo()"); await page.wait_for_timeout(150)
        check('Anordnung ist rückgängig machbar', abs((await ev("() => ceBoxes().title"))['y'] - ys['Mittig']) < 0.01)
        await page.click('[data-ce="arr-reset"]'); await page.wait_for_timeout(250)
        f = await fld(page, 'title')
        check('«Anordnung zurücksetzen»: Positionen weg, Farbe und Text bleiben', 'x' not in f and 'y' not in f and f.get('color') == '#B93B2C' and await ev("() => ce.model.bg.color") == '#22382F' and await ev("() => ce.texts.title") == 'Testbuch', str(f))
        # Logo und Lesbarkeit
        await page.click('[data-ce="logo-pos"][data-v="bottom-right"]'); await page.click('[data-ce="logo-var"][data-v="dark"]'); await page.click('[data-ce="readability"][data-v="panel"]'); await page.wait_for_timeout(250)
        m = await ev("() => ce.model")
        check('Logo-Position, Logo-Farbe und Lesbarkeit gesetzt', m['logo'] == {'pos': 'bottom-right', 'variant': 'dark'} and m['readability'] == 'panel' and await ev("() => ce.layout.logo && ce.layout.logo.pos") == 'bottom-right', str(m['logo']))
        check('Lesbarkeit: drei Knöpfe mit den geforderten Namen', await ev("() => Array.from(document.querySelectorAll('[data-ce=readability]')).map(b => b.textContent.trim())") == ['Ohne Hintergrund', 'Dezente Textfläche', 'Verlauf hinter dem Text'])
        await page.click('[data-ce="readability"][data-v="none"]'); await page.click('[data-ce="logo-pos"][data-v="top-right"]'); await page.click('[data-ce="logo-var"][data-v="auto"]')

        # ---------- 8. Autospeichern, Neuladen ----------
        await ev("() => { const r = document.querySelector('[data-ce-input=fontPt]'); }")
        await page.click('[data-ce="tab"][data-v="text"]'); await page.wait_for_timeout(100)
        await ev("() => { const r = document.querySelector('#ce-fontPt-title'); r.value = 52; r.dispatchEvent(new Event('input', { bubbles: true })); }")
        s0 = await ev("() => document.querySelector('.ce-status-text').textContent"); fp0 = ((await stored(page))['cover'].get('fields', {}).get('title') or {}).get('fontPt')
        await page.wait_for_timeout(900)
        fp1 = ((await stored(page))['cover']['fields']['title']).get('fontPt'); s1 = await ev("() => document.querySelector('.ce-status-text').textContent")
        check('Autospeichern: «Wird gespeichert …», erst nach der Eingabepause geschrieben, dann «Gespeichert»', s0 == 'Wird gespeichert …' and fp0 != 52 and fp1 == 52 and s1 == 'Gespeichert', f'{s0} {fp0} {fp1} {s1}')
        sv = await ev("() => cookbookGetRaw().cover.v")
        check('Gespeichert wird v 2 mit Modus, Farbe und Feldern', sv == 2 and (await stored(page))['cover']['mode'] == 'custom')
        await page.reload(); await page.wait_for_function("typeof state !== 'undefined' && document.getElementById('app').children.length > 0"); await page.wait_for_timeout(600)
        await ev(STUBS)
        await ev("() => { state.cookbookStep = 2; state.view = 'cookbook'; render(); }"); await page.wait_for_selector('.ce-canvas'); await page.wait_for_timeout(700)
        check('Neuladen: Entwurf (Modus, Farbe, Schriftgrösse, Texte) ist wieder da', await ev("() => ce.model.mode") == 'custom' and await ev("() => ce.model.bg.color") == '#22382F' and (await fld(page, 'title')).get('fontPt') == 52 and await ev("() => ce.texts.title") == 'Testbuch')
        check('Nach dem Neuladen ist der Undo-Stapel leer (bewusst nicht gespeichert)', await ev("() => ce.undo.length") == 0)

        # ---------- 9. Speicherfehler ----------
        await ev("() => { window.__orig = cookbookSetRaw; window.cookbookSetRaw = () => { throw new Error('voll'); }; }")
        await page.click('[data-ce="tab"][data-v="text"]'); await page.click('[data-ce="step"][data-f="title"][data-d="1"]') if await page.is_visible('[data-ce="step"][data-f="title"]') else None
        await page.click('[data-ce="select"][data-f="title"]') if not await page.is_visible('[data-ce="step"][data-f="title"]') else None
        await page.click('[data-ce="step"][data-f="title"][data-d="1"]'); await page.wait_for_timeout(900)
        txt = await ev("() => document.querySelector('.ce-status-text').textContent")
        check('Speicherfehler: Statuszeile «Speichern nicht möglich – erneut versuchen», Knopf sichtbar', txt == 'Speichern nicht möglich – erneut versuchen' and await page.is_visible('[data-ce="retry"]'), txt)
        pt = (await fld(page, 'title'))['fontPt']
        await ev("() => render()"); await page.wait_for_timeout(800)
        check('Bei Fehler bleibt der Entwurf in der Oberfläche (auch nach Neuzeichnen)', (await fld(page, 'title')).get('fontPt') == pt and pt > 52, str(pt))
        await ev("() => { window.cookbookSetRaw = window.__orig; }")
        await page.click('[data-ce="retry"]'); await page.wait_for_timeout(300)
        check('Erneut versuchen speichert den Entwurf', await ev("() => document.querySelector('.ce-status-text').textContent") == 'Gespeichert' and ((await stored(page))['cover']['fields']['title']['fontPt']) == pt)

        # ---------- 10. Warnungen mit Lösungsknöpfen ----------
        await page.fill('#cbSubtitle', 'Donaudampfschifffahrtsgesellschaftskapitänsmützenverzeichnis' * 2); await page.wait_for_timeout(300)
        await page.click('[data-ce="select"][data-f="subtitle"]'); await page.wait_for_timeout(200)
        ws = await ev("() => ce.layout.warnings.filter(w => w.fieldId === 'subtitle').map(w => w.kind)")
        btns = await ev("() => Array.from(document.querySelectorAll('.ce-field[data-f=subtitle] .ce-warn-btns .ce-chip')).map(b => b.textContent.trim())")
        check('Zu langes Wort: Warnung am Feld mit Knöpfen «Text kürzen», «Schrift verkleinern», «Textfeld verbreitern»', 'cut' in ws and btns == ['Text kürzen', 'Schrift verkleinern', 'Textfeld verbreitern'], f'{ws} {btns}')
        check('Auswahlrahmen des betroffenen Felds ist als Warnung markiert', await ev("() => document.querySelector('.ce-frame[data-fr=subtitle]').classList.contains('is-warn')"))
        pt0 = (await ev("() => ceEff('subtitle')"))['fontPt']
        await page.click('.ce-field[data-f=subtitle] [data-ce="w-shrink"]'); await page.wait_for_timeout(200)
        w0 = (await ev("() => ceEff('subtitle')"))['w']
        check('«Schrift verkleinern» wendet die Änderung direkt an', (await fld(page, 'subtitle'))['fontPt'] < pt0)
        if await page.is_visible('.ce-field[data-f=subtitle] [data-ce="w-widen"]'):
            await page.click('.ce-field[data-f=subtitle] [data-ce="w-widen"]'); await page.wait_for_timeout(200)
            check('«Textfeld verbreitern» wendet die Änderung direkt an', (await fld(page, 'subtitle')).get('w', 0) >= w0)
        await page.fill('#cbSubtitle', 'Kurz')

        # ---------- 11. Bild-Bereich (Stubs der Bild-Funktionen) ----------
        await page.click('[data-ce="tab"][data-v="bg"]'); await page.wait_for_timeout(200)
        await page.set_input_files('[data-ce-file]', files=[{'name': 'kaputt.png', 'mimeType': 'image/png', 'buffer': PNG}]); await page.wait_for_timeout(400)
        err = await ev("() => { const e = document.querySelector('.ce-error'); return e && !e.hidden ? e.textContent : null; }")
        check('Fehlermeldung des Imports steht unter dem Knopf', err == 'Diese Datei ist kein gültiges Bild.', str(err))
        check('Hinweis zu HEIC ist sichtbar', 'HEIC' in await page.inner_text('#cepanel'))
        await page.set_input_files('[data-ce-file]', files=[{'name': 'bild.png', 'mimeType': 'image/png', 'buffer': PNG}]); await page.wait_for_timeout(600)
        im = await ev("() => ce.model.image")
        check('Bild gewählt: Referenz mit Grösse im Modell, nie Bilddaten', im and im['id'] == 'cover-test-2' and im['w'] == 1600 and im['fit'] == 'cover' and 'data:' not in json.dumps(await stored(page)), str(im))
        labels = await ev("() => Array.from(document.querySelectorAll('#cepanel .ce-chip, #cepanel .ce-segbtn')).map(b => b.textContent.trim())")
        check('Knöpfe: Bild ersetzen, Bild entfernen, Ganzes Bild anzeigen, Cover ausfüllen, Ausschnitt zurücksetzen', all(x in labels for x in ('Bild ersetzen', 'Bild entfernen', 'Ganzes Bild anzeigen', 'Cover ausfüllen', 'Ausschnitt zurücksetzen')), str(labels))
        await page.click('[data-ce="fit"][data-v="contain"]'); await page.wait_for_timeout(200)
        check('Ganzes Bild anzeigen: Anpassung wechselt (Layout meldet contain)', await ev("() => ce.model.image.fit") == 'contain' and await ev("() => ce.layout.image && ce.layout.image.fit") == 'contain')
        await page.click('[data-ce="fit"][data-v="cover"]')
        await ev("() => { const r = document.getElementById('ce-zoom'); r.value = 2; r.dispatchEvent(new Event('input', { bubbles: true })); }")
        check('Zoom-Schieber', await ev("() => ce.model.image.zoom") == 2)
        await page.click('[data-ce="img-move"]'); await page.wait_for_timeout(200)
        pb = await box(page, '.ce-imgpad'); c0 = await ev("() => [ce.model.image.cx, ce.model.image.cy]")
        await page.mouse.move(pb['x'] + pb['w'] / 2, pb['y'] + pb['h'] / 2); await page.mouse.down(); await page.mouse.move(pb['x'] + pb['w'] / 2 - 30, pb['y'] + pb['h'] / 2 + 20, steps=4); await page.mouse.up(); await page.wait_for_timeout(200)
        c1 = await ev("() => [ce.model.image.cx, ce.model.image.cy]")
        check('Im Bild verschieben (Cover ausfüllen): Ausschnitt wandert', c1[0] > c0[0] and c1[1] < c0[1], f'{c0} {c1}')
        await page.click('[data-ce="img-reset"]'); await page.wait_for_timeout(100)
        check('Ausschnitt zurücksetzen', await ev("() => [ce.model.image.cx, ce.model.image.cy, ce.model.image.zoom]") == [0.5, 0.5, 1])
        await page.click('[data-ce="img-move"]')
        await page.set_input_files('[data-ce-file]', files=[{'name': 'zwei.png', 'mimeType': 'image/png', 'buffer': PNG}]); await page.wait_for_timeout(500)
        check('Bild ersetzen: neue ID, Texte und Gestaltung bleiben', await ev("() => ce.model.image.id") == 'cover-test-3' and (await fld(page, 'title')).get('fontPt') > 40 and await ev("() => ce.texts.title") == 'Testbuch')
        await page.click('[data-ce="img-remove"]'); await page.wait_for_timeout(300)
        check('Bild entfernen: Modell ohne Bild, Texte bleiben', await ev("() => ce.model.image") is None and await ev("() => ce.texts.title") == 'Testbuch')
        await ev("() => ceUndo()"); await page.wait_for_timeout(200)
        check('Bild entfernen ist rückgängig machbar (Datei wird erst später gelöscht)', await ev("() => !!ce.model.image") and await ev("() => window.__rm.length") == 0)
        await page.click('[data-ce="img-remove"]')

        # ---------- 12. Cover zurücksetzen (Bestätigung) ----------
        n_rec = await ev("() => state.recipes.length")
        await page.click('[data-ce="tab"][data-v="arr"]'); await page.click('[data-ce="cover-reset"]'); await page.wait_for_selector('.modal-sheet')
        dlg = await page.inner_text('.modal-sheet')
        check('Bestätigungsdialog erklärt, was entfernt wird und dass Rezepte bleiben', 'entfernt' in dlg and 'Rezepte' in dlg and 'Abbrechen' in dlg, dlg[:80])
        await page.click('.modal-sheet [data-action="close-modal"]'); await page.wait_for_selector('.modal-sheet', state='detached'); await page.wait_for_timeout(300)
        check('Abbrechen ändert nichts', await ev("() => ce.model.mode") == 'custom')
        await page.click('[data-ce="cover-reset"]'); await page.wait_for_selector('.modal-sheet'); await page.click('[data-action="ce-reset-confirm"]'); await page.wait_for_timeout(700)
        m = await ev("() => ce.model")
        check('Cover zurücksetzen: Vorlage ohne Anpassungen, Texte und Datum bleiben, Rezepte bleiben', m['mode'] == 'template' and not m['fields'] and m['image'] is None and await ev("() => ce.texts.title") == 'Testbuch' and await ev("() => state.recipes.length") == n_rec, str(m)[:200])

        # ---------- 12b. Leere optionale Felder: keine Platzhalter in Vorschau oder Export ----------
        await page.click('[data-ce="mode"][data-v="custom"]'); await page.click('[data-ce="tab"][data-v="text"]')
        await page.fill('#cbSubtitle', ''); await page.fill('#cbAuthor', ''); await page.fill('#cbExtra1', ''); await page.dispatch_event('#cbAuthor', 'change'); await page.wait_for_timeout(300)
        ph = await ev("""() => { const L = ce.layout, cfg = getCookbookConfig(), E = coverLayout(coverInputFromConfig(cfg)), h = coverHtml(E, '');
          const txt = (l) => l.blocks.map(b => b.lines.join(' ')).join('|');
          return { ids: E.blocks.map(b => b.id || b.key), view: txt(L), exp: txt(E), html: /Untertitel|Name|Weitere Textzeile|Textzeile|z\. B\./.test(h.replace(/class=\"[^\"]*\"/g, '')) }; }""")
        check('Leere Felder: weder Vorschau noch Export (Layout und PDF-Textebene) enthalten Platzhaltertexte', ph['ids'] == ['title'] and ph['view'] == 'Testbuch' and ph['exp'] == 'Testbuch' and not ph['html'], str(ph))
        await page.fill('#cbSubtitle', 'Kurz'); await page.dispatch_event('#cbSubtitle', 'change')

        # ---------- 13. Export ohne Editor-Elemente ----------
        await ev("() => { state.cookbookStep = 3; render(); }"); await page.wait_for_timeout(800)
        check('Vorschau und PDF-Schritt enthalten keine Bedienebene', await ev("() => document.querySelectorAll('.ce-overlay, .ce-frame, .ce-guides').length") == 0)
        check('Keine Skriptfehler im Ablauf', not errs, str(errs[:2]))
        await browser.close()

        # ---------- 14. Touch: Scrollen verschiebt nichts, Griff zieht ----------
        browser, ctx, page = await new_page(p, 390, 844, touch=True)
        ev = page.evaluate
        await open_design(page, 'Touch', 'Unter', 'Ich')
        await page.click('[data-ce="mode"][data-v="custom"]'); await page.click('[data-ce="tab"][data-v="text"]'); await page.wait_for_timeout(200)
        await page.click('[data-ce="select"][data-f="title"]'); await page.wait_for_timeout(300)
        cdp = await ctx.new_cdp_session(page)
        pv = await box(page, '.ce-preview'); f0 = await fld(page, 'title'); sy0 = await ev("() => window.scrollY")
        fb = await box(page, '.ce-frame[data-fr="title"]')
        mid = (pv['x'] + pv['w'] / 2, pv['y'] + pv['h'] * 0.7)
        fmid = (fb['x'] + fb['w'] / 2, fb['y'] + fb['h'] / 2)   # Rahmen selbst (ausserhalb der Griffe)
        # Was das Scrollen auf dem iPhone tatsaechlich verhindern koennte: touch-action ohne pan-y unter dem Finger (inkl. Vorfahren)
        # oder ein abgebrochenes touchstart/touchmove. Beides wird direkt gemessen (plattformunabhaengig).
        ta = await ev("""(pts) => pts.map(([x, y]) => { const bad = []; let e = document.elementFromPoint(x, y); const hit = e ? e.className : null;
            while (e) { const t = getComputedStyle(e).touchAction; if (t === 'none' || (t !== 'auto' && t !== 'manipulation' && !/pan-y/.test(t))) bad.push(e.className + ':' + t); e = e.parentElement; } return { hit, bad }; })""", [mid, fmid])
        check('Touch: unter Vorschau und Rahmen erlaubt touch-action das senkrechte Scrollen (kein none, kein pan-x allein)', all(not t['bad'] for t in ta) and all('ce-grip' not in str(t['hit']) for t in ta), str(ta))
        await ev("""() => { window.__tp = []; for (const k of ['touchstart', 'touchmove']) window.addEventListener(k, (e) => { if (e.defaultPrevented) window.__tp.push(k); }, { passive: false }); }""")
        async def swipe_synth(x, y, dist):
            await cdp.send('Input.synthesizeScrollGesture', {'x': x, 'y': y, 'yDistance': dist, 'gestureSourceType': 'touch', 'speed': 800}); await page.wait_for_timeout(300)
        async def swipe_touch(x, y, dist):   # Finger-Wisch aus einzelnen Touch-Ereignissen (wie beim Griff-Test unten, der auf Linux funktioniert)
            await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]})
            for i in range(1, 11): await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x, 'y': y + dist / 10 * i}]})
            await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); await page.wait_for_timeout(400)
        # Auf dem Mac scrollt Input.synthesizeScrollGesture (touch); in der Linux-CI blieb die Seite damit stehen (179 -> 179), obwohl die App
        # nichts blockiert. Daher zusaetzlich ein Finger-Wisch aus Touch-Ereignissen; je Methode zweite Messung: kein Feld verschoben.
        moved = {}
        for meth, fn in (('synthesizeScrollGesture', swipe_synth), ('dispatchTouchEvent', swipe_touch)):
            await ev("() => window.scrollTo(0, 120)"); await page.wait_for_timeout(250)
            pv = await box(page, '.ce-preview'); fb = await box(page, '.ce-frame[data-fr="title"]'); sa = await ev("() => window.scrollY")
            await fn(pv['x'] + pv['w'] / 2, pv['y'] + pv['h'] * 0.7, -200)
            sb = await ev("() => window.scrollY"); fb2 = await box(page, '.ce-frame[data-fr="title"]')
            if fb2['y'] < 0 or fb2['y'] + fb2['h'] > 844: fb2 = fb   # Rahmen nicht mehr im Bild: an alter Stelle wischen (Seite zurueckgesetzt)
            await fn(fb2['x'] + fb2['w'] / 2, fb2['y'] + fb2['h'] / 2, -150)
            sc = await ev("() => window.scrollY"); fx = await fld(page, 'title')
            moved[meth] = {'scroll': [sa, sb, sc], 'feld_unveraendert': fx == f0}
            if sb == sa and sc == sb: print(f'INFO Touch: {meth} scrollt in diesem Browser nicht', [sa, sb, sc])
        f1 = await fld(page, 'title'); tp = await ev("() => window.__tp")
        scrolled = any(m['scroll'][1] > m['scroll'][0] or m['scroll'][2] > m['scroll'][1] for m in moved.values())
        check('Touch: Wischen über Vorschau und Rahmen scrollt die Seite und verschiebt kein Feld', scrolled and f1 == f0 and all(m['feld_unveraendert'] for m in moved.values()) and not tp, f'{f0} {f1} {moved} abgebrochen={tp}')
        await ev("() => window.scrollTo(0, 0)"); await page.wait_for_timeout(300)
        g = await box(page, '.ce-grip--move'); pv = await box(page, '.ce-preview'); b0 = await ev("() => ceBoxes().title")
        gx, gy = g['x'] + g['w'] / 2, g['y'] + g['h'] / 2
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': gx, 'y': gy}]})
        for i in range(1, 7): await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': gx + 4 * i, 'y': gy + 10 * i}]})
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); await page.wait_for_timeout(300)
        b1 = await ev("() => ceBoxes().title")
        check('Touch: Ziehen am Verschiebegriff bewegt das Feld', abs((b1['x'] - b0['x']) - 24 / pv['w']) < 0.03 and abs((b1['y'] - b0['y']) - 60 / pv['h']) < 0.03, f'{b0} {b1}')
        # Griff für die Breite
        w0 = (await ev("() => ceBoxes().title"))['w']; g = await box(page, '.ce-grip--w'); gx, gy = g['x'] + g['w'] / 2, g['y'] + g['h'] / 2
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': gx, 'y': gy}]})
        for i in range(1, 6): await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': gx - 8 * i, 'y': gy}]})
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); await page.wait_for_timeout(300)
        w1 = (await ev("() => ceBoxes().title"))['w']
        check('Touch: Breitengriff macht das Textfeld schmaler', w1 < w0 - 0.05, f'{w0} {w1}')
        await browser.close()

        # ---------- 15. Breiten, Fokus, Aria ----------
        for w, h in ((390, 844), (768, 1024), (1440, 900)):
            browser, ctx, page = await new_page(p, w, h)
            ev = page.evaluate
            await open_design(page, 'Sonntagsküche', 'Rezepte aus dem Garten', 'Alex Muster')
            await page.click('[data-ce="mode"][data-v="custom"]'); await page.click('[data-ce="tab"][data-v="text"]'); await page.click('[data-ce="select"][data-f="title"]'); await page.wait_for_timeout(500)
            over = await ev("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
            check(f'{w} px: kein horizontales Scrollen', over <= 1, str(over))
            st, sd, pvb = await box(page, '.ce-stage'), await box(page, '.ce-side'), await box(page, '.ce-preview')
            if w >= 1100:
                check(f'{w} px: Vorschau links (höchstens 460 px), Bedienfelder rechts', sd['x'] > st['x'] + st['w'] - 2 and pvb['w'] <= 461, f'{st} {sd} {pvb}')
                y0 = (await box(page, '.ce-stage'))['y']
                await ev("() => window.scrollBy(0, 300)"); await page.wait_for_timeout(200)
                check(f'{w} px: Vorschau bleibt beim Scrollen sichtbar (angeheftet)', (await box(page, '.ce-stage'))['y'] < y0 and (await box(page, '.ce-stage'))['y'] > 0)
            else:
                check(f'{w} px: Vorschau oben, Bedienfelder darunter', sd['y'] >= st['y'] + st['h'] - 2 and abs(sd['x'] - st['x']) < 80, f'{st} {sd}')
                await ev("() => window.scrollBy(0, 400)"); await page.wait_for_timeout(250)
                s2 = await box(page, '.ce-stage')
                check(f'{w} px: Vorschau bleibt oben angeheftet und verdeckt die Bedienung nicht (Fokus-Rand)', s2['y'] >= 0 and s2['y'] < 140 and await ev("() => parseInt(document.documentElement.style.scrollPaddingTop) > 0"), str(s2))
                await ev("() => window.scrollTo(0, 0)")
            if w == 390:
                names = await ev("() => Array.from(document.querySelectorAll('.ce button, .ce input:not([type=hidden]), .ce [role=group][tabindex]')).filter(e => e.getBoundingClientRect().width > 0).filter(e => !(e.getAttribute('aria-label') || (e.labels && e.labels.length) || e.textContent.trim() || e.getAttribute('aria-labelledby'))).map(e => e.outerHTML.slice(0, 80))")
                check('Alle Knöpfe und Felder haben einen Namen (aria-label, Beschriftung oder Text)', not names, str(names[:3]))
                small = await ev("() => Array.from(document.querySelectorAll('.ce-chip, .ce-segbtn, .ce-nudge, .ce-cell, .ce-swatch, .ce-step, .ce-icon, .ce-tab, .ce-modebtn')).filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.width < 43.5 || r.height < 43.5); }).map(e => e.className + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height))")
                check('Tippflächen mindestens 44 px', not small, str(small[:4]))
                g = await ev("() => { const r = document.querySelector('.ce-grip--move'); return r ? Math.min(r.getBoundingClientRect().width + 20, r.getBoundingClientRect().height + 20) : 0; }")
                check('Griff hat eine Tippfläche von mindestens 44 px (24 px + Randzone)', g >= 43.5, str(g))
                await page.focus('.ce-chip[data-ce="edit"]'); await ev("() => document.querySelector('.ce-chip[data-ce=\"edit\"]').focus()")
                await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab')
                fo = await ev("() => { const s = getComputedStyle(document.activeElement); return [s.outlineStyle, s.outlineWidth]; }")
                check('Fokusring: 3 px', fo == ['solid', '3px'], str(fo))
                tabs = await ev("() => document.querySelector('.ce-tabs').getAttribute('role') + document.querySelector('.ce-tab.is-on').getAttribute('aria-selected')")
                check('Reiter: tablist und aria-selected', tabs == 'tablisttrue')
            await ev("() => { document.activeElement.blur(); window.scrollTo(0, 0); }"); await page.wait_for_timeout(300)
            await page.screenshot(path=f'/tmp/c3_shots2/editor_{w}_hell.png')
            await ev("() => window.scrollTo(0, 900)"); await page.wait_for_timeout(200)
            await page.click('[data-ce="tab"][data-v="arr"]'); await page.wait_for_timeout(300)
            tb = await box(page, '.ce-tabswrap'); pad = await ev("() => parseInt(document.documentElement.style.scrollPaddingTop) || 0")
            check(f'{w} px: nach dem Reiterwechsel stehen die Reiter sichtbar unter Kopfleiste und Vorschau', tb['y'] >= pad - 2, f'{tb} {pad}')
            await page.screenshot(path=f'/tmp/c3_shots2/editor_{w}_anordnung.png')
            await browser.close()
        for w, h, tag in ((390, 844, '390'), (1440, 900, '1440')):
            browser, ctx, page = await new_page(p, w, h, dark=True)
            await page.evaluate("() => { state.theme = 'dark'; applyTheme(); }")
            await open_design(page, 'Sonntagsküche', 'Rezepte aus dem Garten', 'Alex Muster')
            await page.click('[data-ce="mode"][data-v="custom"]'); await page.click('[data-ce="color"][data-v="#252720"]'); await page.click('[data-ce="tab"][data-v="text"]'); await page.click('[data-ce="select"][data-f="title"]'); await page.wait_for_timeout(500)
            await page.evaluate("() => { document.activeElement.blur(); window.scrollTo(0, 0); }"); await page.wait_for_timeout(300)
            await page.screenshot(path=f'/tmp/c3_shots2/editor_{tag}_dunkel.png')
            await browser.close()
        os.makedirs('/tmp/r2_shots', exist_ok=True)
        await rot_and_images(p)
        print('\nFEHLER:', FAIL) if FAIL else print('\nAlle Prüfungen bestanden')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
