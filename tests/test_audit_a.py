"""Audit A (Sicherheit und Datenintegritaet): B01 Bildquelle/Attribut-Marker, B04 Mengenstatus, B05 Import-Validierung,
B06 Zeitfelder im Editor, B07 Bildverarbeitung. Standalone-Port 9500, ueber run_all.py der dort vergebene Port."""
import asyncio, json, sys
import os as _os
_os.environ.setdefault('SAVORA_TEST_PORT', '9500')
sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

MARKER = 'example.png" data-savora-audit="marker'
PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

async def main():
    async with async_playwright() as p:
        browser, ctx = await open_ctx(p, 390, 844)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(500)
        ev = page.evaluate
        status = lambda: ev("() => (document.getElementById('backupStatus') || {}).innerText || ''")
        restore = lambda obj: ev("""async (o) => { state.view = 'settings-backup'; render(); await new Promise(r => setTimeout(r, 150));
            await restoreBackupFromFile(new File([typeof o === 'string' ? o : JSON.stringify(o)], 'b.json', { type: 'application/json' })); await new Promise(r => setTimeout(r, 300));
            return (document.getElementById('backupStatus') || {}).innerText || ''; }""", obj)
        count = lambda: ev("() => dbGetAll().then(l => l.length)")

        # ---------- B01: Bildquelle und Attribut-Marker ----------
        html = await ev("(m) => recipeImageHtml({ image: m }, 'rcard-img', 'thumb')", MARKER)
        check('B01 Marker-Bildquelle: kein Zusatzattribut und kein Bild', 'data-savora-audit' not in html and '<img' not in html, html)
        bad_srcs = ['javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zy8+', 'data:text/html;base64,PGI+', 'blob:nicht-gueltig', 'ftp://x/y.png', '//evil.example/x.png', 'x.png" onerror="1']
        res = await ev("(l) => l.map(s => recipeImageHtml({ image: s }, 'rcard-img', 'thumb'))", bad_srcs)
        check('B01 gefaehrliche Quellen erzeugen weder Bild noch Attribut', all('<img' not in h and 'onerror' not in h for h in res), str(res))
        good = await ev("(d) => [d, 'https://example.org/a.png', 'assets/covers/thumbs/01-pop.jpg', './x/y.webp'].map(s => recipeImageHtml({ image: s }, 'rcard-img', 'thumb'))", PNG)
        check('B01 gueltige Bilder bleiben erhalten (Data-PNG, https, lokaler Pfad)', all('<img' in h for h in good), str([h[:60] for h in good]))
        id_html = await ev("(m) => recipeImageHtml({ imageId: m }, 'rcard-img', 'thumb')", 'x" data-savora-audit="marker')
        check('B01 Bild-ID mit Anfuehrungszeichen erzeugt nichts', 'data-savora-audit' not in id_html and 'data-image-id' not in id_html, id_html)
        # Altbestand mit Marker direkt in der Datenbank: Listen, Detail und Editor ohne Zusatzattribut
        await ev("""async (m) => { const r = emptyRecipe(); r.id = 'r_marker'; r.title = 'Markertest'; r.image = m; r.ingredients = [{ amount: '1', unit: 'g', name: 'X' }]; r.steps = [{ text: 'Y' }];
            await dbPut(r); await loadRecipes(); state.view = 'home'; render(); }""", MARKER)
        await page.wait_for_timeout(300)
        n_home = await ev("() => document.querySelectorAll('[data-savora-audit]').length")
        await ev("() => { state.activeRecipeId = 'r_marker'; state.view = 'detail'; render(); }"); await page.wait_for_timeout(300)
        n_detail = await ev("() => document.querySelectorAll('[data-savora-audit]').length")
        await ev("() => { state.editingRecipe = JSON.parse(JSON.stringify(state.recipes.find(r => r.id === 'r_marker'))); state.view = 'form'; state.formStep = 0; render(); }"); await page.wait_for_timeout(300)
        n_form = await ev("() => document.querySelectorAll('[data-savora-audit]').length + (formAsideHtml(state.editingRecipe).includes('data-savora-audit') ? 1 : 0)")
        check('B01 Altbestand mit Marker: Liste, Detail, Editor ohne Zusatzattribut', n_home == 0 and n_detail == 0 and n_form == 0, f'{n_home},{n_detail},{n_form}')
        await ev("async () => { await dbDelete('r_marker'); await loadRecipes(); state.view = 'home'; render(); }")
        # Import mit Marker: Bild wird nicht uebernommen und gemeldet
        n0 = await count()
        msg = await restore({ 'app': 'savora', 'version': 3, 'schemaVersion': 5, 'recipes': [{ 'id': 'a_marker', 'title': 'Mit Marker', 'image': MARKER, 'ingredients': [{ 'amount': '1', 'unit': 'g', 'name': 'X' }], 'steps': [{ 'text': 'Y' }], 'servings': 2 }] })
        stored = await ev("() => dbGetAll().then(l => l.find(r => r.id === 'a_marker'))")
        check('B01 Import: Rezept da, ungueltige Bildquelle entfernt und gemeldet', stored and not stored.get('image') and 'Hinweis' in msg and 'Bildquelle' in msg and await count() == n0 + 1, msg)

        # ---------- B05: ungueltiger Typ, Fehlerbericht statt Absturz ----------
        n0 = await count()
        msg = await restore({ 'app': 'savora', 'version': 3, 'recipes': [{ 'id': 'num_title', 'title': 12345, 'ingredients': [], 'steps': [] }, { 'id': 'ok_one', 'title': 'Gueltig eins', 'ingredients': [{ 'amount': '2', 'unit': 'EL', 'name': 'Oel' }], 'steps': [{ 'text': 'Mischen' }], 'servings': 2 }, { 'id': 'arr', 'title': 'Falsche Zutaten', 'ingredients': 'Mehl', 'steps': [] }] })
        titles = await ev("() => dbGetAll().then(l => l.map(r => r.id))")
        check('B05 numerischer Titel: Fehlermeldung statt Absturz, gueltiges Rezept wird uebernommen', 'num_title' not in titles and 'arr' not in titles and 'ok_one' in titles and not errs, f'{msg} | {errs[:2]}')
        check('B05 Bericht nennt je Datensatz den Grund', 'Titel' in msg and 'Zutaten' in msg and 'Nicht übernommen' in msg, msg)
        check('B05 Teilimport-Bericht behauptet nicht, es sei nichts veraendert worden', 'nichts verändert' not in msg, msg)
        n0 = await count()
        msg = await restore({ 'app': 'savora', 'recipes': 'kaputt' })
        check('B05 grundsaetzlich ungueltige Sicherung: nichts geschrieben, Meldung sagt es', await count() == n0 and 'nichts verändert' in msg, msg)
        msg = await restore({ 'app': 'savora', 'recipes': [{ 'id': 'x', 'title': 'X', 'steps': [] }], 'shopping': 5 })
        check('B05 falscher Teiltyp (Einkauf): gesamte Sicherung vor dem Schreiben abgelehnt', await count() == n0 and 'nichts verändert' in msg and 'x' not in [t for t in await ev("() => dbGetAll().then(l => l.map(r => r.id))") if t == 'x'], msg)
        msg = await restore({ 'type': 'recipe-share', 'recipe': { 'title': 99, 'ingredients': [] } })
        check('B05 geteiltes Rezept mit numerischem Titel: Meldung statt Absturz', 'nicht lesbar' in msg and 'nichts verändert' in msg and not errs, msg)
        msg = await restore({ 'app': 'savora', 'recipes': [{ 'id': 'bad id"><b>', 'title': 'Boese ID', 'ingredients': [], 'steps': [] }] })
        check('B05 ID mit Sonderzeichen wird abgelehnt', 'ID' in msg and 'bad id' not in ''.join(await ev("() => dbGetAll().then(l => l.map(r => r.id))")), msg)

        # ---------- Alte Sicherung importierbar, Wiederholung ohne Duplikate ----------
        old = { 'app': 'savora', 'version': 1, 'exportedAt': '2024-01-01T00:00:00.000Z', 'recipes': [
            { 'id': 'r_old_1', 'title': 'Altes Rezept', 'servings': 4, 'timeMinutes': 20, 'image': PNG, 'ingredients': [{ 'amount': '1/2', 'unit': 'TL', 'name': 'Salz' }, { 'amount': 200, 'unit': 'g', 'name': 'Mehl' }], 'steps': [{ 'text': 'Mischen.' }], 'notes': 'Notiz', 'tags': ['Backen'], 'favorite': True, 'extraAltesFeld': { 'behalten': 1 }, 'createdAt': 1600000000000, 'updatedAt': 1600000000000 },
            { 'id': 'r_old_2', 'title': 'Ohne alles', 'ingredients': [], 'steps': [] }], 'shopping': [{ 'id': 's1', 'name': 'Milch', 'amount': 1, 'unit': 'l', 'checked': False }] }
        n0 = await count()
        msg = await restore(old)
        r_old = await ev("() => dbGetAll().then(l => l.find(r => r.id === 'r_old_1'))")
        check('Alte Sicherung (Version 1, ohne schemaVersion) importierbar, Zusatzfelder und Bild bleiben', await count() == n0 + 2 and r_old and r_old.get('extraAltesFeld') == {'behalten': 1} and r_old.get('image') == PNG and 'wiederhergestellt' in msg, msg)
        n1 = await count(); sh1 = await ev("() => dbGetAllShopping().then(l => l.length)")
        msg2 = await restore(old)
        check('Wiederholung erzeugt keine Duplikate (Rezepte, Einkauf)', await count() == n1 and await ev("() => dbGetAllShopping().then(l => l.length)") == sh1 and 'nicht doppelt' in msg2, msg2)
        share = { 'type': 'recipe-share', 'sharedBy': 'Anna', 'recipe': { 'title': 'Geteilt', 'servings': 2, 'ingredients': [{ 'amount': '1', 'unit': 'g', 'name': 'A' }], 'steps': [{ 'text': 'B' }] } }
        await restore(share); n2 = await count(); msg3 = await restore(share)
        check('Geteiltes Rezept zweimal einspielen: nur eine Kopie', await count() == n2 and 'nicht doppelt' in msg3, msg3)

        # ---------- Teilimport bei Speicherfehler: ehrliche Meldung, Bearbeitungsdaten bleiben ----------
        await ev("() => { state.editingRecipe = emptyRecipe(); state.editingRecipe.title = 'Mein Entwurf'; window.__realPut = dbPut; }")
        three = { 'app': 'savora', 'recipes': [{ 'id': 'q1', 'title': 'Quota eins', 'ingredients': [], 'steps': [] }, { 'id': 'q2', 'title': 'Quota zwei', 'ingredients': [], 'steps': [] }, { 'id': 'q3', 'title': 'Quota drei', 'ingredients': [], 'steps': [] }] }
        await ev("() => { let n = 0; window.dbPut = async (r) => { if (++n === 2) throw new DOMException('full', 'QuotaExceededError'); return window.__realPut(r); }; }")
        msg = await restore(three)
        have = await ev("() => dbGetAll().then(l => l.map(r => r.id).filter(i => /^q\\d$/.test(i)))")
        keep = await ev("() => state.editingRecipe.title")
        check('Speicher voll mitten im Import: Meldung nennt Schon-Uebernommenes, behauptet nicht "nichts veraendert"', have == ['q1'] and 'nichts verändert' not in msg and 'Schon übernommen' in msg and 'voll' in msg, f'{have} {msg}')
        check('Speicher voll: Bearbeitungsdaten bleiben erhalten', keep == 'Mein Entwurf', keep)
        await ev("() => { window.dbPut = window.__realPut; }")
        msg = await restore(three)
        have = await ev("() => dbGetAll().then(l => l.map(r => r.id).filter(i => /^q\\d$/.test(i)).sort())")
        check('Erneutes Einspielen ergaenzt den Rest ohne Duplikate', have == ['q1', 'q2', 'q3'], f'{have} {msg}')
        await ev("() => { window.dbPut = async () => { throw new DOMException('full', 'QuotaExceededError'); }; }")
        msg = await restore({ 'app': 'savora', 'recipes': [{ 'id': 'q9', 'title': 'Neun', 'ingredients': [], 'steps': [] }] })
        check('Speicher voll vor dem ersten Schreiben: ehrlich "nichts uebernommen"', 'nichts übernommen' in msg and 'Schon übernommen' not in msg, msg)
        await ev("() => { window.dbPut = window.__realPut; }")

        # ---------- B04: Mengenstatus ----------
        q = await ev("""() => ({
            range: qtyIngredientStatus({ amount: '1-2', unit: 'EL', name: 'Oel' }), rangeDash: qtyIngredientStatus({ amount: '1–2', unit: 'EL', name: 'Oel' }),
            qual: qtyIngredientStatus({ amount: '', unit: '', name: 'Salz nach Geschmack' }), qual2: qtyIngredientStatus({ amount: '', unit: '', name: 'etwas Pfeffer' }),
            miss: qtyIngredientStatus({ amount: '', unit: '', name: 'Zucker' }), amb: qtyIngredientStatus({ amount: '1.000', unit: '', name: 'Mehl' }), inv: qtyIngredientStatus({ amount: 'abc', unit: '', name: 'Mehl' }),
            exact: qtyIngredientStatus({ amount: '0.125', unit: 'kg', name: 'Mehl' }), line: qtyDisplayLine(parseQuantity('0.125', 'kg'), 'kg') })""")
        check('B04 Klassifikation: Bereich, qualitativ, fehlend, mehrdeutig, ungueltig, exakt', q['range'] == 'range' and q['rangeDash'] == 'range' and q['qual'] == 'qualitative' and q['qual2'] == 'qualitative' and q['miss'] == 'missing' and q['amb'] == 'ambiguous' and q['inv'] == 'invalid' and q['exact'] == 'exact', str(q))
        check('B04 0.125 kg bleibt exakt, Anzeige 125 g', q['line'] == '125 g', q['line'])
        await ev("""() => { const r = emptyRecipe(); r.title = 'Mengen'; r.ingredients = [{ amount: '1-2', unit: 'EL', name: 'Oel' }, { amount: '', unit: '', name: 'Salz nach Geschmack' }, { amount: '', unit: '', name: 'Zucker' }, { amount: '0.125', unit: 'kg', name: 'Mehl' }];
            state.editingRecipe = r; state.view = 'form'; state.formStep = 0; render(); }""")
        await page.wait_for_timeout(300)
        fv = await ev("() => formView()")
        aside = await ev("() => formAsideBodyHtml(state.editingRecipe)")
        check('B04 Editor-Kontrolle: nur "Zucker" fehlt, "1-2 EL" und "Salz nach Geschmack" zaehlen nicht', 'davon 1 ohne Mengenangabe' in fv and '4 Zutaten' in fv, [m for m in fv.split('<li') if 'Zutat' in m][:1].__str__())
        check('B04 Editor-Seitenvorschau: "4 Zutaten, davon 1 ohne Menge"', '4 Zutaten, davon 1 ohne Menge' in aside, aside)
        imp = await ev("""() => { const r = emptyRecipe(); r.ingredients = [{ amount: '1-2', unit: 'EL', name: 'Oel' }, { amount: '', unit: '', name: 'Salz nach Geschmack' }, { amount: '', unit: '', name: 'Zucker' }];
            const d = importFinalizeDraft(r, { source: 'text' }); return d._importSummary.noAmount; }""")
        check('B04 Importbericht: nur "Zucker" ohne Menge', imp == ['Zucker'], str(imp))

        # ---------- B06: Zeitfelder im Editor ----------
        await ev("""() => { const r = emptyRecipe(); r.title = 'Zeitfelder'; r.servings = 0; r.timeMinutes = 0; r.ingredients = [{ amount: '1', unit: 'g', name: 'A' }]; r.steps = [{ text: 'B' }]; state.editingRecipe = r; state.editingRecipeSnapshot = null; state.view = 'form'; state.formStep = 0; render(); }""")
        await page.wait_for_selector('#f-time'); n0 = await count()
        async def save_and_state():
            await page.evaluate("() => document.querySelector('[data-action=\"save-recipe\"]').click()"); await page.wait_for_timeout(500)
            return await ev("""() => { const e = document.activeElement; return { view: state.view, focus: e && e.id, inv: ['f-time','f-servings','f-prep'].map(i => (document.getElementById(i) || {}).getAttribute && document.getElementById(i).getAttribute('aria-invalid')),
                err: (document.getElementById('f-time-err') || {}).innerText || '', errServ: (document.getElementById('f-servings-err') || {}).innerText || '', errPrep: (document.getElementById('f-prep-err') || {}).innerText || '',
                desc: (document.getElementById('f-time') || {}).getAttribute && document.getElementById('f-time').getAttribute('aria-describedby') }; }""")
        await page.fill('#f-time', '-5')
        s1 = await save_and_state()
        check('B06 negative Zeit: nicht gespeichert, am Feld erklaert, Fokus, aria-invalid, aria-describedby', s1['view'] == 'form' and await count() == n0 and 'Negative' in s1['err'] and s1['focus'] == 'f-time' and s1['inv'][0] == 'true' and s1['desc'] == 'f-time-err', str(s1))
        await page.fill('#f-time', '30'); await page.fill('#f-servings', '2.5')
        s2 = await save_and_state()
        check('B06 Dezimale Menge wird nicht still gerundet, sondern erklaert', s2['view'] == 'form' and 'ganze Zahlen' in s2['errServ'] and s2['focus'] == 'f-servings' and await count() == n0, str(s2))
        await page.fill('#f-servings', '0')
        s3 = await save_and_state()
        check('B06 Menge 0 wird nicht auf 1 korrigiert, sondern erklaert', s3['view'] == 'form' and 'mindestens 1' in s3['errServ'], str(s3))
        await page.fill('#f-servings', ''); await page.fill('#f-time', '')
        await page.evaluate("() => document.querySelector('[data-action=\"form-goto-step\"][data-idx=\"0\"]').click()")
        # Teilzeit im Basis-Schritt, Hauptzeit und Menge leer = unbekannt: speichern geht, Werte bleiben 0 (unbekannt)
        s4 = await save_and_state()
        saved = await ev("() => state.recipes.find(r => r.title === 'Zeitfelder')")
        check('B06 leere Felder = unbekannt: Speichern gelingt, nichts erfunden', s4['view'] == 'detail' and saved and saved['servings'] == 0 and saved['timeMinutes'] == 0, str(s4))
        await ev("() => { state.editingRecipe = JSON.parse(JSON.stringify(state.recipes.find(r => r.title === 'Zeitfelder'))); state.view = 'form'; state.formStep = 0; render(); }")
        await page.wait_for_selector('#f-time')
        await ev("() => { document.querySelector('.field-more').open = true; }")
        await page.fill('#f-prep', '-3'); await page.fill('#f-time', '45'); await page.fill('#f-servings', '4')
        s5 = await save_and_state()
        check('B06 negative Teilzeit: am Feld erklaert, Fokus auf das erste fehlerhafte Feld', s5['view'] == 'form' and 'Negative' in s5['errPrep'] and s5['focus'] == 'f-prep', str(s5))
        await page.fill('#f-prep', '10')
        s6 = await save_and_state()
        saved = await ev("() => state.recipes.find(r => r.title === 'Zeitfelder')")
        check('B06 gueltige Werte werden unveraendert gespeichert', s6['view'] == 'detail' and saved['timeMinutes'] == 45 and saved['servings'] == 4 and saved['prepMinutes'] == 10, str(saved))
        pure = await ev("""() => { const f = FORM_NUMBER_FIELDS[1]; return ['', '0', '15', '-1', '1.5', '1e3', '99999999', 'abc'].map(v => [v, formNumberProblem(f, v, false) === null]); }""")
        check('B06 formNumberProblem: leer/0/ganze Zahlen ok, Rest abgelehnt', [x[1] for x in pure] == [True, True, True, False, False, True, False, False], str(pure))

        # ---------- B07: Bildverarbeitung ----------
        r7 = await ev("""async () => {
            const out = {};
            // Object-URL-Freigabe im Fehlerfall
            let created = 0, revoked = 0; const oc = URL.createObjectURL, orv = URL.revokeObjectURL;
            URL.createObjectURL = (b) => { created++; return oc.call(URL, b); }; URL.revokeObjectURL = (u) => { revoked++; return orv.call(URL, u); };
            try { await processImageFile(new File(['kein bild'], 'x.png', { type: 'image/png' })); out.errName = 'kein Fehler'; } catch (e) { out.errName = e.userMessage || String(e); }
            URL.createObjectURL = oc; URL.revokeObjectURL = orv; out.created = created; out.revoked = revoked;
            // toBlob liefert null
            const mk = (w, h, fill) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); if (fill) { x.fillStyle = fill; x.fillRect(0, 0, w, h); } return c; };
            const toFile = async (c, type) => new File([await new Promise(r => c.toBlob(r, type))], 'a.png', { type });
            const tall = await toFile(mk(100, 4000, '#c33'), 'image/png');
            const real = HTMLCanvasElement.prototype.toBlob;
            HTMLCanvasElement.prototype.toBlob = function (cb) { cb(null); };
            try { await processImageFile(tall); out.nullBlob = 'kein Fehler'; } catch (e) { out.nullBlob = e.userMessage || String(e); }
            HTMLCanvasElement.prototype.toBlob = real;
            // laengste Kante
            const p = await processImageFile(tall); const bm = await createImageBitmap(p.fullBlob); const tb = await createImageBitmap(p.thumbBlob);
            out.dims = [bm.width, bm.height, tb.width, tb.height];
            // Transparenz flach auf Creme
            const tr = await toFile(mk(40, 40, null), 'image/png'); const q = await processImageFile(tr); const b2 = await createImageBitmap(q.fullBlob);
            const c2 = mk(b2.width, b2.height, null); c2.getContext('2d').drawImage(b2, 0, 0); out.px = Array.from(c2.getContext('2d').getImageData(5, 5, 1, 1).data).slice(0, 3);
            return out; }""")
        check('B07 Ladefehler: verstaendliche Meldung und Object-URL freigegeben', 'kann nicht gelesen werden' in r7['errName'] and r7['created'] >= 1 and r7['created'] == r7['revoked'], str(r7))
        check('B07 toBlob(null) wird abgefangen', 'konnte nicht verkleinert werden' in r7['nullBlob'], r7['nullBlob'])
        check('B07 laengste Kante begrenzt (hohes Bild 100x4000)', r7['dims'][1] <= 1600 and r7['dims'][3] <= 640 and r7['dims'][1] > 0, str(r7['dims']))
        check('B07 Transparenz wird flach auf Creme abgeflacht, nicht schwarz', all(abs(a - b) <= 6 for a, b in zip(r7['px'], [0xF7, 0xF4, 0xEE])), str(r7['px']))

        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await browser.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
