"""Cover-Bilder (Paket C4): Import-Pruefungen, Speicherung, Laden, Loeschen, Sicherung, Wiederherstellen, Abgleich, Offline.
Testbilder werden selbst erzeugt (neutrale Flaechen, kein fremdes Material)."""
import asyncio, base64, io, json, os, re, sys, threading
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
from PIL import Image
import mock_supabase as M
from http.server import ThreadingHTTPServer

FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

def jpeg(w, h, color=(200, 120, 60), exif=None, marker=None, noise=False):
    im = Image.new('RGB', (w, h), color)
    if noise:
        im = Image.frombytes('RGB', (100, 75), os.urandom(100 * 75 * 3)).resize((w, h))
    if marker:
        for x in range(marker[0]):
            for y in range(marker[0]): im.putpixel((x, y), (255, 0, 0))
    b = io.BytesIO()
    kw = {}
    if exif is not None:
        e = Image.Exif(); e[0x0112] = exif; kw['exif'] = e
    im.save(b, 'JPEG', quality=85, **kw)
    return b.getvalue()
def png(w, h, mode='RGB', color=(30, 90, 200)):
    b = io.BytesIO(); Image.new(mode, (w, h), color).save(b, 'PNG'); return b.getvalue()
def webp(w, h):
    b = io.BytesIO(); Image.new('RGB', (w, h), (40, 160, 90)).save(b, 'WEBP'); return b.getvalue()
b64 = lambda data: base64.b64encode(data).decode()

MK = """(a) => { const bin = atob(a.b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new File([u], a.name, { type: a.type }); }"""
async def imp(page, data, name, type_, key='cb_test'):
    """Importiert eine Datei; liefert {ok, id, w, h} oder {ok: False, msg}"""
    return await page.evaluate("""async (a) => { const mk = %s; const f = mk(a);
        try { const r = await coverImageImport(f, a.key); return { ok: true, ...r }; } catch (e) { return { ok: false, msg: e.userMessage || ('KEIN userMessage: ' + e.message) }; } }""" % MK,
        {'b64': b64(data), 'name': name, 'type': type_, 'key': key})

async def main():
    async with async_playwright() as p:
        browser, ctx = await open_ctx(p, 390, 844)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(500)
        ev = page.evaluate
        nimg = lambda: ev("coverImageStoredIds().then(l => l.length)")
        cfg_before = await ev("localStorage.getItem('savora-cookbook-projects')")

        # --- gueltige Bilder ---
        r = await imp(page, jpeg(1200, 1800), 'hoch.jpg', 'image/jpeg')
        check('Hochformat 1200x1800: Ergebnis mit ID, Originalmasse bleiben (nie vergroessert)', r.get('ok') and r['w'] == 1200 and r['h'] == 1800 and re.fullmatch(r'cover-cb_test-[a-z0-9]+', r['id']), str(r))
        hoch = r
        rec = await ev("(id) => dbGetImage(id).then(i => ({ kind: i.kind, mime: i.mime, w: i.w, h: i.h, blob: i.blob.size > 100, bt: i.blob.type, th: i.thumbBlob && i.thumbBlob.size > 50 }))", hoch['id'])
        check('Im Store images gespeichert (kind cover, JPEG, Vorschau)', rec['kind'] == 'cover' and rec['mime'] == 'image/jpeg' and rec['bt'] == 'image/jpeg' and rec['w'] == 1200 and rec['h'] == 1800 and rec['blob'] and rec['th'], str(rec))
        thumb = await ev("(id) => dbGetImage(id).then(i => createImageBitmap(i.thumbBlob)).then(b => [b.width, b.height])", hoch['id'])
        check('Vorschaubild hat Seitenverhaeltnis 2:3 und lange Kante 320', thumb == [213, 320] or thumb == [214, 320], str(thumb))
        r = await imp(page, jpeg(1800, 1200), 'quer.jpg', 'image/jpeg')
        check('Querformat 1800x1200 bleibt 1800x1200', r.get('ok') and (r['w'], r['h']) == (1800, 1200), str(r))
        quer = r
        r = await imp(page, webp(1500, 1500), 'quadrat.webp', 'image/webp')
        check('Quadrat 1500x1500 (WebP) bleibt Quadrat', r.get('ok') and (r['w'], r['h']) == (1500, 1500), str(r))
        quad = r
        # Transparenz
        r = await imp(page, png(800, 600, 'RGBA', (0, 0, 0, 0)), 'trans.png', 'image/png')
        mime = await ev("(id) => dbGetImage(id).then(i => i.blob.type)", r['id'])
        alpha = await ev("""async (id) => { const b = await coverImageLoad(id); const c = document.createElement('canvas'); c.width = b.width; c.height = b.height; const x = c.getContext('2d'); x.drawImage(b, 0, 0); return x.getImageData(5, 5, 1, 1).data[3]; }""", r['id'])
        check('Transparente PNG bleibt PNG mit Transparenz', r.get('ok') and mime == 'image/png' and alpha == 0, f'{mime} alpha={alpha}')
        # EXIF-Ausrichtung 6: Rohdaten 1200x800, Anzeige hochkant 800x1200, roter Marker (Rohbild links oben) wandert nach rechts oben
        r = await imp(page, jpeg(1200, 800, exif=6, marker=(200,)), 'gedreht.jpg', 'image/jpeg')
        px = await ev("""async (id) => { const b = await coverImageLoad(id); const c = document.createElement('canvas'); c.width = b.width; c.height = b.height; const x = c.getContext('2d'); x.drawImage(b, 0, 0);
            const at = (X, Y) => Array.from(x.getImageData(X, Y, 1, 1).data); return { w: b.width, h: b.height, tr: at(b.width - 60, 60), tl: at(60, 60) }; }""", r['id'])
        check('EXIF-gedrehtes JPEG wird aufrecht gespeichert (800x1200, Marker rechts oben)', r.get('ok') and (r['w'], r['h']) == (800, 1200) and px['tr'][0] > 200 and px['tr'][1] < 80 and px['tl'][1] > 80, str(px))
        # 12 MP
        r = await imp(page, jpeg(4000, 3000, noise=True), 'foto12mp.jpg', 'image/jpeg')
        check('12-MP-Foto wird auf 2480 px lange Kante verkleinert, Seitenverhaeltnis erhalten', r.get('ok') and r['w'] == 2480 and abs(r['h'] - 1860) <= 1, str(r))
        before = await nimg()

        # --- abgelehnte Dateien ---
        r = await imp(page, png(7500, 6000, 'L', 128), 'gross45mp.png', 'image/png')
        check('45-MP-Bild wird vor der Decodierung abgelehnt (Megapixel-Meldung)', not r['ok'] and 'Megapixel' in r['msg'], str(r))
        data = jpeg(300, 200)
        r = await imp(page, data[:len(data) // 2], 'kaputt.jpg', 'image/jpeg')
        check('Beschaedigte Datei: verstaendliche Meldung', not r['ok'] and 'beschädigt' in r['msg'], str(r))
        r = await imp(page, b'\x00\x00\x00\x18ftypheic\x00\x00\x00\x00mif1heic' + b'\x00' * 200, 'foto.heic', 'image/heic')
        check('HEIC wird abgelehnt mit Format-Meldung', not r['ok'] and r['msg'] == 'Dieses Format wird nicht unterstützt. Speichere das Bild als JPEG oder PNG.', str(r))
        r = await imp(page, b'\x00\x00\x00\x18ftypheic\x00\x00\x00\x00mif1heic' + b'\x00' * 200, 'foto.jpg', 'image/jpeg')
        check('HEIC mit falscher Endung .jpg wird am Inhalt erkannt', not r['ok'] and 'nicht unterstützt' in r['msg'], str(r))
        r = await imp(page, b'Das ist keine Bilddatei, nur Text.\n' * 20, 'text.jpg', 'image/jpeg')
        check('Textdatei als .jpg: Meldung, kein Absturz', not r['ok'] and 'beschädigt' in r['msg'], str(r))
        r = await imp(page, b'Hallo', 'notiz.txt', 'text/plain')
        check('Textdatei (text/plain) wird als nicht unterstuetzt abgelehnt', not r['ok'] and 'nicht unterstützt' in r['msg'], str(r))
        r = await imp(page, b'', 'leer.jpg', 'image/jpeg')
        check('Leere Datei: Meldung', not r['ok'] and 'leer' in r['msg'], str(r))
        r = await ev("""async () => { const head = new Uint8Array(await new File([new Uint8Array([0xFF,0xD8,0xFF,0xE0,0,16,74,70,73,70,0,1,1,0,0,1,0,1,0,0])], 'x').arrayBuffer());
            const f = new File([head, new Uint8Array(26 * 1048576)], 'riesig.jpg', { type: 'image/jpeg' });
            try { await coverImageImport(f, 'cb_test'); return { ok: true }; } catch (e) { return { ok: false, msg: e.userMessage }; } }""")
        check('Datei ueber 25 MB wird abgelehnt', not r['ok'] and '25 MB' in r['msg'], str(r))
        after = await nimg()
        check('Abgelehnte Dateien hinterlassen nichts im Store', after == before, f'{before} -> {after}')
        cfg_after = await ev("localStorage.getItem('savora-cookbook-projects')")
        check('Import schreibt nichts in die Kochbuch-Konfiguration', cfg_before == cfg_after)

        # --- Laden / Cache ---
        a = await ev("""async (id) => { const b1 = await coverImageLoad(id); const b2 = await coverImageLoad(id); return { w: b1.width, h: b1.height, same: b1 === b2, t: b1 && b1.constructor.name }; }""", hoch['id'])
        check('coverImageLoad liefert Bild in Originalmassen, zweiter Aufruf aus dem Cache', a['w'] == 1200 and a['h'] == 1800 and a['same'], str(a))
        check('coverImageLoad: unbekannte ID und Rezeptbild-ID geben null', await ev("Promise.all([coverImageLoad('cover-gibtsnicht'), coverImageLoad('img_legacy_1'), coverImageLoad(null)]).then(l => l.every(x => x === null))"))
        c = await ev("""async (ids) => { const a = await coverImageLoad(ids[0]); await coverImageLoad(ids[1]); await coverImageLoad(ids[2]); const a2 = await coverImageLoad(ids[0]); return a !== a2; }""", [hoch['id'], quer['id'], quad['id']])
        check('Cache haelt hoechstens 2 Bilder (aeltestes wird neu geladen)', c is True)

        # --- Verweise, Loeschen ---
        ref = {'id': hoch['id'], 'fit': 'cover', 'cx': .5, 'cy': .5, 'zoom': 1, 'w': hoch['w'], 'h': hoch['h']}
        await ev("""(ref) => { const c = cookbookGetRaw(); c.cover = Object.assign({}, c.cover || {}, { v: 2, mode: 'custom', image: ref }); cookbookSetRaw(c); }""", ref)
        used = await ev("coverImageIdsInUse()")
        check('coverImageIdsInUse nennt die Bilder aller Kochbuecher', used == [hoch['id']], str(used))
        # Zweites Kochbuch ohne Bild; Rezeptbild und Cover nebeneinander
        await ev("coverImageRemove('img_legacy_1')")
        check('coverImageRemove loescht kein Rezeptbild', await ev("dbGetImage('img_legacy_1').then(i => !!i)"))
        await ev("(id) => coverImageRemove(id)", hoch['id'])
        check('coverImageRemove laesst ein noch verwendetes Cover-Bild stehen', await ev("(id) => dbGetImage(id).then(i => !!i)", hoch['id']))
        await ev("""async () => { const r = state.recipes.find(x => x.imageId === 'img_legacy_1'); if (r) { await dbDeleteImage(r.imageId); } }""")
        check('Rezeptbild loeschen (wie ui.js) laesst das Cover-Bild unberuehrt', await ev("(id) => dbGetImage(id).then(i => !!(i && i.blob))", hoch['id']))
        src = ''.join(open(os.path.join(ROOT, f), encoding='utf-8').read() for f in ('ui.js', 'actions-v2.js', 'share.js', 'settings-konto.js', 'views.js', 'views-v2.js', 'app.js'))
        calls = re.findall(r'dbDeleteImage\(([^)]*)\)', src)
        check('Alle Loeschaufrufe fuer Bilder in der App gelten Rezept-Bild-IDs, keiner nennt Cover', calls and all(('imageId' in c or 'oldImageId' in c or 'imgId' in c) for c in calls) and not any('cover' in c.lower() for c in calls), str(calls))
        await ev("(ids) => Promise.all(ids.map(i => coverImageRemove(i, { force: true })))", [quer['id']])
        check('coverImageRemove mit force loescht ein Cover-Bild', not await ev("(id) => dbGetImage(id).then(i => !!i)", quer['id']))
        # Aufraeumen nur manuell
        n_before = await nimg()
        await page.wait_for_timeout(1500)
        check('Nichts wird automatisch aufgeraeumt', await nimg() == n_before)
        removed = await ev("coverImageGc()")
        stored = await ev("coverImageStoredIds()")
        check('coverImageGc loescht nur ungenutzte Cover-Bilder und behaelt das verwendete', hoch['id'] in stored and [i for i in stored if str(i).startswith('cover-')] == [hoch['id']] and removed >= 3, f'{removed} entfernt, uebrig {stored}')
        check('coverImageSyncNote ohne Konto: ehrlicher Hinweis', 'Sicherungsdatei' in await ev("coverImageSyncNote()"))

        # --- Sicherung exportieren ---
        # Rezeptbild neu anlegen, damit der Test unabhaengig vom Loeschen oben ist; ein verwaistes Cover-Bild gehoert NICHT in die Sicherung
        orphan = await imp(page, jpeg(400, 300), 'waise.jpg', 'image/jpeg')
        await ev("""async () => { let blob = null; const orig = URL.createObjectURL; URL.createObjectURL = (b) => { blob = b; return orig.call(URL, b); }; await downloadBackup(); URL.createObjectURL = orig; window.__bk = blob; }""")
        txt = await ev("window.__bk.text()")
        bk = json.loads(txt)
        cis = bk.get('coverImages')
        check('Sicherung enthaelt das verwendete Cover-Bild als Data-URL, nicht das verwaiste', isinstance(cis, list) and len(cis) == 1 and cis[0]['id'] == hoch['id'] and cis[0]['data'].startswith('data:image/jpeg;base64,') and cis[0]['w'] == 1200, str([(c['id'], c['w']) for c in cis or []]))
        check('Sicherung nennt die Referenz im Kochbuch', hoch['id'] in json.dumps(bk['settings']['cookbooks']))

        # --- Wiederherstellen auf frischem Geraet ---
        b2, c2 = await open_ctx(p, 390, 844); p2 = await c2.new_page(); e2 = []
        p2.on('pageerror', lambda e: e2.append(str(e)))
        await goto(p2)
        await p2.evaluate("(t) => { window.__txt = t }", txt)
        restore = "async () => { state.view = 'settings-backup'; render(); await restoreBackupFromFile(new File([window.__txt], 'b.json', { type: 'application/json' })); await new Promise(r => setTimeout(r, 400)); return (document.getElementById('backupStatus') || {}).textContent || ''; }"
        msg = await p2.evaluate(restore)
        ids2 = await p2.evaluate("coverImageIdsInUse()")
        info = await p2.evaluate("""async () => { const id = coverImageIdsInUse()[0]; const b = id && await coverImageLoad(id); const book = cookbookBooks().find(x => x.config.cover && x.config.cover.image); return { w: b && b.width, h: b && b.height, rec: id && await dbGetImage(id).then(i => i && i.kind) , refId: book && book.config.cover.image.id, ref: book && book.config.cover.image }; }""")
        check('Frisches Geraet: Cover-Bild und Referenz kommen zurueck, Bild laedt in Originalmassen', ids2 == [hoch['id']] and info['w'] == 1200 and info['h'] == 1800 and info['rec'] == 'cover' and info['refId'] == hoch['id'], f'{ids2} {info} {msg[:150]}')
        check('Referenz behaelt Ausschnitt (fit, zoom, w, h)', info['ref'] and info['ref']['fit'] == 'cover' and info['ref']['zoom'] == 1 and info['ref']['w'] == 1200, str(info['ref']))
        check('Meldung nennt das Titelbild', 'Titelbild' in msg, msg[:200])
        n1 = await p2.evaluate("coverImageStoredIds().then(l => l.length)")
        books1 = await p2.evaluate("cookbookBooks().length")
        await p2.evaluate(restore)
        n2 = await p2.evaluate("coverImageStoredIds().then(l => l.length)")
        books2 = await p2.evaluate("cookbookBooks().length")
        check('Zweites Einspielen derselben Sicherung verdoppelt weder Bild noch Kochbuch', n1 == n2 and books1 == books2, f'{n1}/{n2} {books1}/{books2}')
        await b2.close()

        # --- ID-Kollision: anderes Bild unter derselben ID -> neue ID, Referenz wird nachgefuehrt, vorhandenes Bild bleibt ---
        b3, c3 = await open_ctx(p, 390, 844); p3 = await c3.new_page(); await goto(p3)
        await p3.evaluate("(t) => { window.__txt = t }", txt)
        await p3.evaluate("""async (id) => { const c = document.createElement('canvas'); c.width = 50; c.height = 50; const blob = await new Promise(r => c.toBlob(r, 'image/png')); await dbPutImage({ id, blob, thumbBlob: blob, mime: 'image/png', kind: 'cover', w: 50, h: 50 }); }""", hoch['id'])
        await p3.evaluate(restore)
        k = await p3.evaluate("""async (oldId) => { const old = await dbGetImage(oldId); const used = coverImageIdsInUse(); const nid = used.find(i => i !== oldId); const n = nid && await dbGetImage(nid); return { oldW: old.w, used, newW: n && n.w, nid }; }""", hoch['id'])
        check('ID-Kollision: vorhandenes Bild bleibt, Sicherungsbild bekommt neue ID, Kochbuch zeigt darauf', k['oldW'] == 50 and k['newW'] == 1200 and k['nid'] and k['nid'] != hoch['id'], str(k))
        await b3.close()

        # --- Alte Sicherung ohne Cover-Bilder ---
        old = dict(bk); old.pop('coverImages', None); old['schemaVersion'] = 4
        old['settings'] = {k2: v for k2, v in bk['settings'].items() if k2 != 'cookbooks'}
        b4, c4 = await open_ctx(p, 390, 844); p4 = await c4.new_page(); e4 = []
        p4.on('pageerror', lambda e: e4.append(str(e)))
        await goto(p4)
        await p4.evaluate("(t) => { window.__txt = t }", json.dumps(old))
        msg4 = await p4.evaluate(restore)
        n_rec = await p4.evaluate("dbGetAll().then(l => l.length)")
        check('Alte Sicherung ohne Cover-Bilder (Format 4) laesst sich weiter einspielen', n_rec == len(bk['recipes']) and 'wiederhergestellt' in msg4 and not e4, f'{n_rec} {msg4[:120]} {e4[:2]}')
        # kaputtes coverImages-Feld: Rezepte kommen trotzdem, Meldung nennt das Problem
        bad = dict(bk); bad['coverImages'] = [{'id': 'cover-x', 'data': 'data:image/jpeg;base64,AAAA'}, 'quatsch', {'id': '../evil', 'data': 'x'}]
        b5, c5 = await open_ctx(p, 390, 844); p5 = await c5.new_page(); await goto(p5)
        await p5.evaluate("(t) => { window.__txt = t }", json.dumps(bad))
        msg5 = await p5.evaluate(restore)
        n5 = await p5.evaluate("Promise.all([dbGetAll().then(l => l.length), coverImageStoredIds().then(l => l.length)])")
        check('Kaputte Cover-Eintraege in der Sicherung: Rezepte kommen, nichts Ungueltiges im Store, Meldung nennt es', n5[0] == len(bk['recipes']) and n5[1] == 0 and 'Titelbild' in msg5, f'{n5} {msg5[:300]}')
        await b4.close(); await b5.close()

        # --- Zusatzbilder (cover.images[].imgId): Verweise, Aufraeumen, Abgleich, Sicherung, Wiederherstellen mit ID-Kollision ---
        x1 = await imp(page, jpeg(600, 300, (10, 200, 10)), 'zusatz1.jpg', 'image/jpeg')
        x2 = await imp(page, png(300, 600), 'zusatz2.png', 'image/png')
        bg_id = (await ev("coverImageIdsInUse()"))[0]
        await ev("""(a) => { const c = cookbookGetRaw(); c.cover = Object.assign({}, c.cover || {}, { v: 2, mode: 'custom', images: [
            { id: 'e1', imgId: a.x1.id, x: 0.3, y: 0.3, w: 0.3, rot: 15, z: 'below', iw: a.x1.w, ih: a.x1.h },
            { id: 'e2', imgId: a.x2.id, x: 0.7, y: 0.7, w: 0.2, rot: -30, z: 'above', iw: a.x2.w, ih: a.x2.h } ] }); cookbookSetRaw(c); }""", {'x1': x1, 'x2': x2})
        used = await ev("coverImageIdsInUse()")
        check('coverImageIdsInUse zählt Zusatzbilder mit (Hintergrund + 2 Zusatzbilder)', sorted(used) == sorted([bg_id, x1['id'], x2['id']]), str(used))
        await ev("(id) => coverImageRemove(id)", x1['id'])
        check('coverImageRemove lässt ein verwendetes Zusatzbild stehen', await ev("(id) => dbGetImage(id).then(i => !!i)", x1['id']))
        waise2 = await imp(page, jpeg(200, 200), 'waise2.jpg', 'image/jpeg')
        gone = await ev("coverImageGc()")
        stored = [i for i in await ev("coverImageStoredIds()") if str(i).startswith('cover-')]
        check('coverImageGc löscht Zusatzbilder nicht (nur das verwaiste Bild)', sorted(stored) == sorted([bg_id, x1['id'], x2['id']]) and waise2['id'] not in stored and gone >= 1, f'{gone} {stored}')
        q = await ev("""async () => { const cur = localStorage.getItem(CLOUD_CURSOR_KEY); localStorage.removeItem(CLOUD_CURSOR_KEY); const q0 = JSON.stringify(cloudQueue()), m0 = JSON.stringify(cloudMeta());
            await cloudPrepareFirstSync(); const keys = Object.keys(cloudQueue()); localStorage.setItem(CLOUD_QUEUE_KEY, q0); localStorage.setItem(CLOUD_META_KEY, m0); if (cur !== null) localStorage.setItem(CLOUD_CURSOR_KEY, cur); return keys; }""")
        check('Abgleich: erstes Anmelden merkt Zusatzbilder über den Bildweg vor', all(f'image|{i}' in q for i in (bg_id, x1['id'], x2['id'])), str([k for k in q if k.startswith('image|cover')]))
        await ev("""async () => { let blob = null; const orig = URL.createObjectURL; URL.createObjectURL = (b) => { blob = b; return orig.call(URL, b); }; await downloadBackup(); URL.createObjectURL = orig; window.__bk2 = blob; }""")
        txt2 = await ev("window.__bk2.text()")
        bk2 = json.loads(txt2)
        check('Sicherung enthält Zusatzbilder als Data-URL', sorted(c['id'] for c in bk2.get('coverImages', [])) == sorted([bg_id, x1['id'], x2['id']]), str([c['id'] for c in bk2.get('coverImages', [])]))
        b6, c6 = await open_ctx(p, 390, 844); p6 = await c6.new_page(); e6 = []
        p6.on('pageerror', lambda e: e6.append(str(e)))
        await goto(p6); await p6.evaluate("(t) => { window.__txt = t }", txt2)
        await p6.evaluate(restore)
        g6 = await p6.evaluate("""async () => { const book = cookbookBooks().find(x => x.config.cover && Array.isArray(x.config.cover.images) && x.config.cover.images.length); if (!book) return null; const ims = book.config.cover.images;
            const sizes = []; for (const e of ims) { const b = await coverImageLoad(e.imgId); sizes.push(b && [b.width, b.height]); } return { ims, sizes, used: coverImageIdsInUse() }; }""")
        check('Frisches Gerät: Zusatzbilder kommen zurück (gleiche IDs, Drehung, Ebene, iw/ih), laden in Originalmassen',
              g6 and [e['imgId'] for e in g6['ims']] == [x1['id'], x2['id']] and g6['sizes'] == [[600, 300], [300, 600]] and g6['ims'][0]['rot'] == 15 and g6['ims'][1]['z'] == 'above' and g6['ims'][1]['iw'] == 300 and not e6, f'{g6} {e6[:2]}')
        await b6.close()
        b7, c7 = await open_ctx(p, 390, 844); p7 = await c7.new_page(); await goto(p7)
        await p7.evaluate("(t) => { window.__txt = t }", txt2)
        await p7.evaluate("""async (id) => { const c = document.createElement('canvas'); c.width = 40; c.height = 40; const blob = await new Promise(r => c.toBlob(r, 'image/png')); await dbPutImage({ id, blob, thumbBlob: blob, mime: 'image/png', kind: 'cover', w: 40, h: 40 }); }""", x1['id'])
        await p7.evaluate(restore)
        g7 = await p7.evaluate("""async (old) => { const book = cookbookBooks().find(x => x.config.cover && Array.isArray(x.config.cover.images) && x.config.cover.images.length); const ims = book.config.cover.images;
            const o = await dbGetImage(old); const n = await dbGetImage(ims[0].imgId); return { ids: ims.map(e => e.imgId), oldW: o && o.w, newW: n && n.w }; }""", x1['id'])
        check('ID-Kollision beim Zusatzbild: vorhandenes Bild bleibt, Kochbuch zeigt auf die neue ID, zweites Zusatzbild unverändert',
              g7['ids'][0] != x1['id'] and g7['ids'][0].startswith('cover-') and g7['oldW'] == 40 and g7['newW'] == 600 and g7['ids'][1] == x2['id'], str(g7))
        await b7.close()

        # --- Offline ---
        await ctx.set_offline(True)
        r = await imp(page, jpeg(900, 600), 'offline.jpg', 'image/jpeg')
        ok_load = await ev("(id) => coverImageLoad(id).then(b => !!b && b.width === 900)", r.get('id'))
        check('Offline: Import und Laden funktionieren ohne Netz', r.get('ok') and ok_load, str(r))
        await ctx.set_offline(False)

        # --- Abgleich ueber den bestehenden Bildweg (Mock-Cloud) ---
        CPORT = PORT + 500
        srv = ThreadingHTTPServer(('127.0.0.1', CPORT), M.H)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        CLOUD = f"window.SAVORA_CLOUD_URL_OVERRIDE = 'http://127.0.0.1:{CPORT}'; window.SAVORA_CLOUD_KEY_OVERRIDE = 'test-key';"
        import uuid
        M.USERS['cover@example.test'] = {'id': str(uuid.uuid4()), 'password': 'geheim-123', 'confirmed': True}
        async def dev(name):
            br, cx = await open_ctx(p, 390, 844)
            await cx.add_init_script(CLOUD)
            pg = await cx.new_page(); pg.on('pageerror', lambda e: errs.append(f'{name}: {e}'))
            await goto(pg); return br, cx, pg
        bA, cA, pa = await dev('A'); bB, cB, pb = await dev('B')
        await pa.evaluate("cloudAuthSignIn('cover@example.test', 'geheim-123')")
        # Bild NACH der Anmeldung anlegen (normaler Weg), dann Kochbuch mit Referenz speichern
        ra = await imp(pa, jpeg(1000, 1400), 'sync.jpg', 'image/jpeg')
        await pa.evaluate("""(ref) => { const c = cookbookGetRaw(); c.cover = { v: 2, mode: 'custom', templateId: 'a', date: '2026-01-01', showDate: true, image: ref }; cookbookSetRaw(c); }""",
                          {'id': ra['id'], 'fit': 'cover', 'cx': .5, 'cy': .5, 'zoom': 1, 'w': ra['w'], 'h': ra['h']})
        await pa.evaluate("cloudSyncNow()")
        uid = await pa.evaluate("cloudUserId()")
        check('Cloud: Cover-Bild liegt im privaten Speicher (voll + Vorschau)', f'{uid}/{ra["id"]}' in M.OBJECTS and f'{uid}/{ra["id"]}-thumb' in M.OBJECTS, str([k for k in M.OBJECTS][:4]))
        await pb.evaluate("cloudAuthSignIn('cover@example.test', 'geheim-123')")
        await pb.evaluate("cloudSyncNow()")
        got = await pb.evaluate("""async () => { const ids = coverImageIdsInUse(); const id = ids[0]; const rec = id && await dbGetImage(id); const b = id && await coverImageLoad(id); return { ids, kind: rec && rec.kind, w: b && b.width }; }""")
        check('Cloud: zweites Geraet erhaelt Kochbuch-Referenz UND das Bild (laedt in Originalmassen)', got['ids'] == [ra['id']] and got['kind'] == 'cover' and got['w'] == 1000, str(got))
        await pb.evaluate("""async () => { await cloudOrig.dbDeleteImage(coverImageIdsInUse()[0]); }""")   # nur lokal weg (z. B. Speicher geleert), ohne Loeschmarke fuer die Cloud
        await pb.evaluate("cloudSyncNow()")
        again = await pb.evaluate("dbGetImage(coverImageIdsInUse()[0]).then(i => !!i)")
        check('Cloud: fehlendes Bild eines gespeicherten Kochbuchs wird beim Abgleich nachgeladen', again)
        check('Cloud: ohne Cover-Hinweis wenn angemeldet', await pa.evaluate("coverImageSyncNote()") == '')
        await bA.close(); await bB.close()
        srv.shutdown()

        check('Keine Seitenfehler', not errs and not e2, str((errs + e2)[:3]))
        await browser.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
