"""Audit-Nachtrag: (1) Attribut-Maskierung fuer IDs aus Altdaten, (2) Bilder: EXIF-Drehung, WebP mit Feature-Erkennung, Grenzen.
Standalone-Port 10600, ueber run_all.py der dort vergebene Port."""
import asyncio, base64, io, json, sys
import os as _os
_os.environ.setdefault('SAVORA_TEST_PORT', '10600')
sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
from PIL import Image
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

def jpeg(w, h, orientation=1, left=(255, 0, 0), right=(0, 0, 255)):
    im = Image.new('RGB', (w, h), left)
    im.paste(Image.new('RGB', (w - w // 2, h), right), (w // 2, 0))
    ex = Image.Exif()
    if orientation != 1: ex[0x0112] = orientation
    b = io.BytesIO(); im.save(b, 'JPEG', quality=95, exif=ex.tobytes()); return b.getvalue()
def png(w, h, rgba=(0, 0, 0, 0)):
    b = io.BytesIO(); Image.new('RGBA', (w, h), rgba).save(b, 'PNG'); return b.getvalue()
B = lambda d: base64.b64encode(d).decode()

EVIL_ID = 'r_x" data-savora-audit="marker" onfocus="window.__pwn=1" x=\'<>&'
EVIL_TITLE = 'Tarte "Evil" <b>&</b> \'x\' <script>window.__pwn=2</script>'

async def main():
    async with async_playwright() as p:
        browser, ctx = await open_ctx(p, 390, 844)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(500)
        ev = page.evaluate

        # ---------- Teil 1: Attribut-Maskierung ----------
        r = await ev("() => [escapeAttr('r_abc-123'), escapeAttr('a\"b'), escapeAttr(null), escapeAttr(\"x'y<z>&\"), cssAttr('a\"b\\\\c')]")
        check('escapeAttr: normale ID unveraendert, Sonderzeichen maskiert', r[0] == 'r_abc-123' and '"' not in r[1] and r[2] == '' and all(c not in r[3] for c in '\'<>') and r[3].count('&amp;') == 1, str(r))
        await ev("""async ([id, title]) => { const r = emptyRecipe(); r.id = id; r.title = title; r.ingredients = [{ amount: '2', unit: 'EL', name: 'Oel' }]; r.steps = [{ text: 'Mischen' }]; r.servings = 2;
            await dbPut(r); await loadRecipes(); state.view = 'home'; render(); }""", [EVIL_ID, EVIL_TITLE])
        await page.wait_for_timeout(400)
        async def bad():
            return await ev("() => ({ marker: document.querySelectorAll('[data-savora-audit]').length, onfocus: document.querySelectorAll('[onfocus]').length, scripts: document.querySelectorAll('script:not([src])').length - (window.__inlineScripts || 0), pwn: window.__pwn || 0 })")
        await ev("() => { window.__inlineScripts = document.querySelectorAll('script:not([src])').length; }")
        b = await bad()
        check('Startseite (Karten): kein Zusatzattribut, kein Skript', b['marker'] == 0 and b['onfocus'] == 0 and b['scripts'] == 0 and b['pwn'] == 0, str(b))
        for lay in ('list', 'grid'):
            await ev("(l) => { state.homeLayout = l; render(); }", lay); await page.wait_for_timeout(250)
            b = await bad()
            check(f'Startseite ({lay}): sauber', b['marker'] == 0 and b['onfocus'] == 0 and b['pwn'] == 0, str(b))
        # Rezept ueber die Karte oeffnen
        await ev("() => { state.homeLayout = 'grid'; render(); }"); await page.wait_for_timeout(250)
        n = await ev("() => document.querySelectorAll('[data-action=\"open-recipe\"]').length")
        opened = await ev("""() => { const el = [...document.querySelectorAll('[data-action="open-recipe"]')].find(e => e.dataset.id === arguments[0]); return !!el; }""") if False else None
        found = await ev("(id) => [...document.querySelectorAll('[data-action=\"open-recipe\"]')].some(e => e.dataset.id === id)", EVID_ID if False else EVIL_ID)
        check('Karte traegt die unveraenderte ID als Wert (dataset)', found, f'{n} Karten')
        await ev("(id) => { [...document.querySelectorAll('[data-action=\"open-recipe\"]')].find(e => e.dataset.id === id).click(); }", EVIL_ID)
        await page.wait_for_timeout(500)
        view = await ev("() => ({ v: state.view, a: state.activeRecipeId, t: document.body.innerText.includes('Tarte \"Evil\"') })")
        check('Rezept laesst sich oeffnen', view['v'] == 'detail' and view['a'] == EVIL_ID and view['t'], str(view))
        b = await bad(); check('Detail: sauber', b['marker'] == 0 and b['onfocus'] == 0 and b['pwn'] == 0, str(b))
        # Favorisieren
        await ev("""() => { const el = [...document.querySelectorAll('[data-action="toggle-fav"]')].find(e => e.dataset.id === state.activeRecipeId); if (el) el.click(); }""")
        await page.wait_for_timeout(400)
        fav = await ev("(id) => (state.recipes.find(r => r.id === id) || {}).favorite", EVIL_ID)
        check('Favorisieren funktioniert', fav is True, str(fav))
        # Bearbeiten
        await ev("() => { const el = document.querySelector('[data-action=\"edit-recipe\"]'); if (el) el.click(); }"); await page.wait_for_timeout(500)
        ed = await ev("() => ({ v: state.view, id: state.editingRecipe && state.editingRecipe.id })")
        check('Bearbeiten funktioniert', ed['v'] == 'form' and ed['id'] == EVIL_ID, str(ed))
        b = await bad(); check('Editor: sauber', b['marker'] == 0 and b['onfocus'] == 0 and b['pwn'] == 0, str(b))
        await ev("() => { state.view = 'detail'; render(); }"); await page.wait_for_timeout(300)
        # Planen: aus dem Detail den Planer oeffnen und einen Tag waehlen
        await ev("() => { state.view = 'detail'; state.activeRecipeId = arguments[0]; render(); }") if False else None
        await ev("(id) => { state.activeRecipeId = id; state.view = 'detail'; render(); }", EVIL_ID); await page.wait_for_timeout(400)
        await ev("(id) => { [...document.querySelectorAll('[data-action=\"open-plan-recipe\"]')].find(e => e.dataset.id === id).click(); }", EVIL_ID); await page.wait_for_timeout(500)
        b = await bad(); check('Planer-Dialog: sauber', b['marker'] == 0 and b['onfocus'] == 0 and b['pwn'] == 0, str(b))
        date = await ev("(id) => { const el = [...document.querySelectorAll('[data-action=\"assign-mealplan-recipe\"]')].find(e => e.dataset.id === id); if (!el) return null; const d = el.dataset.date; el.click(); return d; }", EVIL_ID)
        await page.wait_for_timeout(600)
        planned = await ev("(a) => planEntriesFor(a[0]).some(e => e.recipeId === a[1])", [date, EVIL_ID]) if date else False
        check('Planen: Rezept wird eingeplant', planned, str(date))
        await ev("() => { state.view = 'plan'; render(); }"); await page.wait_for_timeout(400)
        b = await bad(); check('Wochenplan mit Eintrag: sauber', b['marker'] == 0 and b['onfocus'] == 0 and b['pwn'] == 0, str(b))
        # Einkaufsliste und Kochbuch
        await ev("() => { state.view = 'shopping'; render(); }"); await page.wait_for_timeout(300)
        b = await bad(); check('Einkaufsliste: sauber', b['marker'] == 0 and b['pwn'] == 0, str(b))
        await ev("() => { state.view = 'cookbooks'; render(); }"); await page.wait_for_timeout(300)
        b = await bad(); check('Kochbuecher: sauber', b['marker'] == 0 and b['pwn'] == 0, str(b))

        # ---------- Teil 2: Bilder ----------
        async def proc(data, mime, name='t'):
            return await ev("""async ([b64, mime]) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
                const f = new File([u], 'x', { type: mime });
                try { const p = await processImageFile(f); const bm = await createImageBitmap(p.fullBlob); const tb = await createImageBitmap(p.thumbBlob);
                  const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; const x = c.getContext('2d'); x.drawImage(bm, 0, 0);
                  const px = (fx, fy) => Array.from(x.getImageData(Math.floor(fx * (bm.width - 1)), Math.floor(fy * (bm.height - 1)), 1, 1).data).slice(0, 3);
                  return { ok: true, w: bm.width, h: bm.height, tw: tb.width, th: tb.height, type: p.fullBlob.type, mime: p.mime, ttype: p.thumbBlob.type, top: px(0.5, 0.1), bottom: px(0.5, 0.9), left: px(0.1, 0.5), right: px(0.9, 0.5), mid: px(0.1, 0.1) };
                } catch (e) { return { ok: false, msg: e.userMessage || String(e) }; } }""", [B(data), mime])
        near = lambda a, t, tol=60: all(abs(x - y) <= tol for x, y in zip(a, t))
        RED, BLUE = (255, 0, 0), (0, 0, 255)
        s = await proc(jpeg(200, 200), 'image/jpeg'); check('Bild quadratisch', s['ok'] and s['w'] == s['h'] == 200, str(s))
        s = await proc(jpeg(200, 400), 'image/jpeg'); check('Bild hochkant (ohne EXIF)', s['ok'] and s['h'] == 400 and s['w'] == 200 and near(s['left'], RED) and near(s['right'], BLUE), str(s))
        s = await proc(jpeg(400, 200), 'image/jpeg'); check('Bild quer', s['ok'] and s['w'] == 400 and s['h'] == 200 and near(s['left'], RED) and near(s['right'], BLUE), str(s))
        # EXIF 6: Rohdaten quer (links rot, rechts blau), 90 Grad im Uhrzeigersinn: oben rot, unten blau, hochkant
        s = await proc(jpeg(400, 200, 6), 'image/jpeg'); check('EXIF 6: hochkant, oben rot, unten blau', s['ok'] and s['w'] == 200 and s['h'] == 400 and near(s['top'], RED) and near(s['bottom'], BLUE), str(s))
        s = await proc(jpeg(400, 200, 8), 'image/jpeg'); check('EXIF 8: hochkant, oben blau, unten rot', s['ok'] and s['w'] == 200 and s['h'] == 400 and near(s['top'], BLUE) and near(s['bottom'], RED), str(s))
        s = await proc(jpeg(400, 200, 3), 'image/jpeg'); check('EXIF 3: 180 Grad (links blau, rechts rot)', s['ok'] and s['w'] == 400 and near(s['left'], BLUE) and near(s['right'], RED), str(s))
        # Handarbeit-Fallback: Rohdaten ohne Browser-Drehung selbst drehen, fuer 5 bis 8
        fb = await ev("""async ([b64, o]) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
            const raw = await createImageBitmap(new Blob([u], { type: 'image/jpeg' }));
            const sw = raw.width, sh = raw.height; const c = document.createElement('canvas'); c.width = sh; c.height = sw; const x = c.getContext('2d');
            drawOriented(x, raw, sw, sh, o, 1);
            const g = (fx, fy) => Array.from(x.getImageData(Math.floor(fx * (c.width - 1)), Math.floor(fy * (c.height - 1)), 1, 1).data).slice(0, 3);
            return { w: c.width, h: c.height, top: g(0.5, 0.1), bottom: g(0.5, 0.9) }; }""", [B(jpeg(400, 200, 1)), 6])
        check('Handdrehung EXIF 6 (Fallback ohne Browser-Drehung)', fb['w'] == 200 and fb['h'] == 400 and near(fb['top'], RED) and near(fb['bottom'], BLUE), str(fb))
        fb = await ev("""async ([b64, o]) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
            const raw = await createImageBitmap(new Blob([u], { type: 'image/jpeg' }));
            const sw = raw.width, sh = raw.height; const c = document.createElement('canvas'); c.width = sh; c.height = sw; const x = c.getContext('2d');
            drawOriented(x, raw, sw, sh, o, 1);
            const g = (fx, fy) => Array.from(x.getImageData(Math.floor(fx * (c.width - 1)), Math.floor(fy * (c.height - 1)), 1, 1).data).slice(0, 3);
            return { w: c.width, h: c.height, top: g(0.5, 0.1), bottom: g(0.5, 0.9) }; }""", [B(jpeg(400, 200, 1)), 8])
        check('Handdrehung EXIF 8 (Fallback ohne Browser-Drehung)', fb['w'] == 200 and fb['h'] == 400 and near(fb['top'], BLUE) and near(fb['bottom'], RED), str(fb))
        for o, top, bottom in ((6, RED, BLUE), (8, BLUE, RED)):
            s = await ev("""async ([exifB64, rawB64]) => { const orig = window.createImageBitmap; const rawU = Uint8Array.from(atob(rawB64), c => c.charCodeAt(0)); const rawBlob = new Blob([rawU], { type: 'image/jpeg' });
                window.createImageBitmap = (f, opt) => orig.call(window, rawBlob);   // Browser, der EXIF nicht anwendet
                try { const u = Uint8Array.from(atob(exifB64), c => c.charCodeAt(0)); const p = await processImageFile(new File([u], 'x.jpg', { type: 'image/jpeg' }));
                  const bm = await orig(p.fullBlob); const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; const x = c.getContext('2d'); x.drawImage(bm, 0, 0);
                  const g = (fy) => Array.from(x.getImageData(Math.floor(bm.width / 2), Math.floor(fy * (bm.height - 1)), 1, 1).data).slice(0, 3);
                  return { w: bm.width, h: bm.height, top: g(0.1), bottom: g(0.9) }; } finally { window.createImageBitmap = orig; } }""", [B(jpeg(400, 200, o)), B(jpeg(400, 200, 1))])
            check(f'EXIF {o} ohne Browser-Drehung: ganzer Ablauf dreht selbst', s['w'] == 200 and s['h'] == 400 and near(s['top'], top) and near(s['bottom'], bottom), str(s))
        ex = await ev("""async (b64) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
            return [await readExifOrientation(new Blob([u])), await readExifOrientation(new Blob([new Uint8Array([1, 2, 3])]))]; }""", B(jpeg(40, 20, 8)))
        check('readExifOrientation liest 8 und toleriert Muell', ex == [8, 1], str(ex))
        # transparent
        s = await proc(png(60, 60), 'image/png'); check('Transparentes PNG flach auf Creme', s['ok'] and near(s['mid'], (0xF7, 0xF4, 0xEE), 8), str(s))
        # Ausgabeformat passt zum Mime
        webp = await ev("() => webpEncodingSupported()")
        s = await proc(jpeg(100, 100), 'image/jpeg')
        check('Ausgabeformat: WebP nur bei sicherer Unterstuetzung, sonst JPEG', s['type'] == s['mime'] == s['ttype'] and s['type'] == ('image/webp' if webp else 'image/jpeg'), f'webp={webp} {s["type"]}')
        # Browser ohne WebP-Kodierung: Erkennung scheitert, JPEG-Fallback
        s2 = await ev("""async (b64) => { const orig = HTMLCanvasElement.prototype.toBlob; imgWebpSupport = null;
            HTMLCanvasElement.prototype.toBlob = function (cb, type, q) { return orig.call(this, cb, type === 'image/webp' ? 'image/png' : type, q); };
            try { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
              const p = await processImageFile(new File([u], 'x.jpg', { type: 'image/jpeg' })); return [p.fullBlob.type, p.mime, p.thumbBlob.type]; }
            finally { HTMLCanvasElement.prototype.toBlob = orig; imgWebpSupport = null; } }""", B(jpeg(100, 100)))
        check('Ohne WebP-Kodierung (Safari-Verhalten simuliert): JPEG', s2 == ['image/jpeg'] * 3, str(s2))
        # beschaedigt
        s = await proc(b'\xff\xd8\xff\xe0 kaputt kaputt', 'image/jpeg'); check('Beschaedigte Datei: verstaendliche Meldung', not s['ok'] and 'kann nicht gelesen werden' in s['msg'], str(s))
        s = await proc(b'GIF nicht', 'text/plain'); check('Keine Bilddatei: Meldung', not s['ok'] and 'keine Bilddatei' in s['msg'], str(s))
        # uebergross: Kantenlimit
        s = await proc(jpeg(300, 6000), 'image/jpeg'); check('Uebergrosses Bild (300x6000): Kantenlimit', s['ok'] and s['h'] <= 1600 and s['th'] <= 640 and s['h'] > 0, str(s))
        s = await proc(jpeg(6000, 400, 6), 'image/jpeg'); check('Uebergross + EXIF 6: gedreht und begrenzt', s['ok'] and s['h'] <= 1600 and s['w'] < s['h'], str(s))

        # Formular: beschaedigtes Foto behaelt Eingaben
        await ev("() => { state.editingRecipe = emptyRecipe(); state.editingRecipe.title = 'Behalte mich'; state.view = 'form'; state.formStep = 0; render(); }"); await page.wait_for_timeout(400)
        inp = page.locator('#f-image')
        if await inp.count():
            await inp.set_input_files(files=[{'name': 'x.jpg', 'mimeType': 'image/jpeg', 'buffer': b'\xff\xd8 kaputt'}]); await page.wait_for_timeout(700)
            t = await ev("() => ({ v: state.view, title: (document.getElementById('f-title') || {}).value, toast: document.body.innerText.includes('kann nicht gelesen werden') })")
            check('Formular: beschaedigtes Foto, Titel bleibt, Meldung sichtbar', t['title'] == 'Behalte mich' and t['toast'], str(t))
            await inp.set_input_files(files=[{'name': 'ok.jpg', 'mimeType': 'image/jpeg', 'buffer': jpeg(400, 200, 6)}]); await page.wait_for_timeout(900)
            t = await ev("() => ({ title: (document.getElementById('f-title') || {}).value, img: !!state.editingRecipe.imageId })")
            check('Formular: gueltiges Foto (EXIF 6) wird uebernommen, Titel bleibt', t['title'] == 'Behalte mich' and t['img'], str(t))
        else:
            check('Formular hat Bildfeld #f-image', False)

        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await browser.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
