"""Paket 37: Datenerhalt und Migration vom Stand 0.58.0 (Git-Commit 14e7887) auf den neuen Code, mit aktivem Service Worker.
Prüft: Rezepte (IDs, Rohdaten, Favoriten, Notizen, Bilder), Wochenplan, Einkauf, Sammlungen, alte Kochbuchkonfiguration bleibt unverändert,
erstes Buchprojekt entsteht daraus (und nur einmal), Sicherung aus dem alten Stand lässt sich im neuen wiederherstellen,
Service Worker ersetzt alte Caches, Offline-Start mit allen SHELL_ASSETS, keine Nutzerdaten gelöscht.
Dazu Stichproben zu Härtung (Speicherfehler, defekte Sicherung, Importprüfung) und Mengen (Rezept, Einkauf, PDF mit denselben Zahlen)."""
import asyncio, json, os, re, sys
os.environ.setdefault('SAVORA_TEST_PORT', '8972')
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

OLD = '14e7887'   # Version 0.58.0
SW_TEXT = open(os.path.join(ROOT, 'sw.js'), encoding='utf-8').read()
NEW_VERSION = re.search(r"SW_VERSION = '([^']+)'", SW_TEXT).group(1)
SHELL = re.findall(r"'(\./[^']*)'", SW_TEXT.split('const SHELL_ASSETS = [')[1].split('];')[0])
DATA_ASSETS = []   # seit 0.68.0 (Audit P01) sind die grossen Dateien optional und werden erst beim ersten Gebrauch geladen (test_audit_b prueft das)

OLD_EXTRA = r"""
async () => {
  // Sammlungen, Notizen, Favoriten (r_legacy_1 hat Favorit, Notiz und Bild), Kochbuch-Einzelkonfiguration mit Titelblatt
  saveCollections([{ id: 'col_1', name: 'Sonntag', recipeIds: ['r_legacy_1', 'r_legacy_3'] }]);
  const r2 = state.recipes.find(r => r.id === 'r_legacy_2'); r2.notes = 'Notiz mit Emoji 🍝 und «Zeichen»'; r2.favorite = true; await dbPut(r2);
  saveCookbookConfig({ title: 'Familienbuch', subtitle: 'Alt', author: 'Yanis', pdfTemplate: 'B', chapters: [], showLogo: true,
    items: [{ recipeId: 'r_legacy_2', chapterId: '' }, { recipeId: 'r_legacy_1', chapterId: '' }],
    cover: { v: 1, templateId: 'salbei', date: '2026-05-17', showDate: true } });
  localStorage.setItem('savora-cookbook-title', 'Yanis Kochbuch');
  await loadRecipes();
  return true;
}"""
SNAP = r"""
async () => {
  const recipes = (await dbGetAll()).sort((a, b) => a.id.localeCompare(b.id));
  const imgs = {}; for (const r of recipes) if (r.imageId) { const i = await dbGetImage(r.imageId); imgs[r.imageId] = i ? (i.blob.size + ':' + i.mime) : null; }
  const ls = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('savora-') && k !== 'savora-cookbook-projects') ls[k] = localStorage.getItem(k); }
  return { raw: recipes.map(r => JSON.stringify(r)), imgs, shopping: JSON.stringify((await dbGetAllShopping()).sort((a, b) => a.id.localeCompare(b.id))),
           plan: JSON.stringify((await dbGetAllMealplan()).sort((a, b) => a.date.localeCompare(b.date))), ls, dbVersion: (await openDB()).version };
}"""

async def main():
    SITE.set_dir(old_checkout(OLD))
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={'width': 390, 'height': 844}, accept_downloads=True, reduced_motion='reduce', timezone_id='UTC')
        await ctx.add_init_script("try{localStorage.setItem('savora-splash-seen','1')}catch(e){}")
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        ev = page.evaluate
        # ---------- 1. Alter Stand mit aktivem Service Worker ----------
        await page.goto(URL); await page.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller !== undefined", timeout=15000)
        await page.wait_for_function("typeof state !== 'undefined' && document.getElementById('app').children.length > 0", timeout=30000)
        await ev(open(SEED_PATH).read()); await ev(OLD_EXTRA)
        await page.reload(); await page.wait_for_timeout(2500)
        old_ver = await ev("() => fetch('sw.js').then(r => r.text()).then(t => (t.match(/SW_VERSION = '([^']+)'/) || [])[1])")
        old_caches = await ev("() => caches.keys()")
        check('Alter Stand läuft mit eigenem Service Worker und eigenen Caches', old_ver and old_ver != NEW_VERSION and any(old_ver in k for k in old_caches), f'{old_ver} {old_caches}')
        before = await ev(SNAP)
        cfg_old = await ev("() => localStorage.getItem('savora-cookbook-config')")
        check('Alter Stand: Einzelkonfiguration mit Titelblatt gespeichert, noch keine Projekte', cfg_old and 'salbei' in cfg_old and 'savora-cookbook-projects' not in str(await ev("() => Object.keys(localStorage)")))
        async with page.expect_download() as dl: await ev("() => downloadBackup()")
        d = await dl.value; bpath = OUT + '/paket37-old-backup.json'; await d.save_as(bpath)
        old_backup = json.load(open(bpath))
        check('Alte Sicherung (Schema ohne Projekte) erstellt', old_backup.get('schemaVersion', 0) < 6 and not (old_backup.get('settings') or {}).get('cookbooks'), f"schema {old_backup.get('schemaVersion')}")

        # ---------- 2. Wechsel auf den neuen Code, gleicher Browser, gleiche Daten ----------
        SITE.set_dir(ROOT)
        await page.reload(); await page.wait_for_timeout(1500)
        await page.wait_for_selector('#updateBanner', state='attached', timeout=30000)   # echter Update-Ablauf der App: «Neue Version verfügbar»
        both = await ev("async () => (await caches.keys()).sort()")
        check('Neuer Worker wartet, alte Caches sind noch da (kontrolliertes Update)', any(old_ver in k for k in both) and any(NEW_VERSION in k for k in both), str(both))
        await page.click('#updateBanner .toast-undo-btn')
        keys = []
        for _ in range(40):   # die Seite lädt nach dem Wechsel des Workers selbst neu
            await page.wait_for_timeout(750)
            try: keys = await ev("() => caches.keys()")
            except Exception: continue
            if keys and all(NEW_VERSION in k for k in keys): break
        check('Nach dem Update sind alle alten Caches ersetzt', all(NEW_VERSION in k for k in keys) and len(keys) >= 1, str(keys))   # seit 0.68.0 entstehen Daten- und Laufzeit-Cache erst bei Gebrauch
        await page.reload(); await page.wait_for_function("typeof cookbookStoreRead === 'function' && document.getElementById('app').children.length > 0", timeout=30000)
        await page.wait_for_timeout(1500)
        after = await ev(SNAP)
        check('Rezepte: IDs und Rohdaten unverändert (Favoriten, Notizen, Zusatzfelder)', after['raw'] == before['raw'])
        check('Bilder (Blob-Store und Data-URL) unverändert', after['imgs'] == before['imgs'] and len(after['imgs']) >= 1, str(after['imgs']))
        check('Einkaufsliste unverändert', after['shopping'] == before['shopping'])
        norm = lambda s: [{k: v for k, v in x.items() if k != 'keyVersion'} for x in json.loads(s)]
        check('Wochenplan: Einträge gleich (nur keyVersion ergänzt)', norm(after['plan']) == norm(before['plan']))
        check('Datenbank-Version unverändert (keine Schemaänderung)', after['dbVersion'] == before['dbVersion'], str(after['dbVersion']))
        keep = {k: v for k, v in before['ls'].items() if k != 'savora-last-seen-version'}
        changed = [k for k, v in keep.items() if after['ls'].get(k) != v]
        check('Alle alten localStorage-Schlüssel unverändert (Einzelkonfiguration, Titel, Sammlungen, Einstellungen)', not changed, str(changed))
        check('Sammlungen erhalten', await ev("() => JSON.stringify(getCollections())") == '[{"id":"col_1","name":"Sonntag","recipeIds":["r_legacy_1","r_legacy_3"]}]')

        # ---------- 3. Erstes Buchprojekt aus der alten Konfiguration ----------
        proj = await ev("""() => { const s = cookbookStoreRead(); const cfg = JSON.parse(localStorage.getItem('savora-cookbook-config'));
          return { n: s.books.length, name: s.books[0].name, cfg: JSON.stringify(s.books[0].config) === JSON.stringify(cfg), t: s.books[0].config.title, tpl: s.books[0].config.pdfTemplate, cover: s.books[0].config.cover,
                   items: s.books[0].config.items.map(i => i.recipeId), mig: s.books[0].migration }; }""")
        check('Genau ein Projekt, Name aus dem alten Titel, Konfiguration deckungsgleich', proj['n'] == 1 and proj['name'] == 'Yanis Kochbuch' and proj['cfg'], str(proj))
        check('Auswahl, Reihenfolge, Seitenstil, Titelblatt und Datum übernommen', proj['items'] == ['r_legacy_2', 'r_legacy_1'] and proj['tpl'] == 'B' and proj['cover']['templateId'] == 'salbei' and proj['cover']['date'] == '2026-05-17' and proj['t'] == 'Familienbuch', str(proj['cover']))
        check('Migration vermerkt Quelle', proj['mig'] and proj['mig']['source'] == 'savora-cookbook-config' and proj['mig']['hadConfig'] is True)
        raw1 = await ev("() => localStorage.getItem('savora-cookbook-projects')")
        await page.reload(); await page.wait_for_function("typeof cookbookStoreRead === 'function' && document.getElementById('app').children.length > 0", timeout=30000); await page.wait_for_timeout(1200)
        await ev("() => { cookbookStoreRead(); getCookbookConfig(); coverEnsureConfig(); }")
        raw2 = await ev("() => localStorage.getItem('savora-cookbook-projects')")
        after2 = await ev(SNAP)
        check('Zweites Laden verändert nichts (Projekte idempotent)', raw1 == raw2)
        check('Rezepte und alte Schlüssel auch nach zweitem Laden unverändert', after2['raw'] == before['raw'] and not [k for k, v in keep.items() if after2['ls'].get(k) != v])

        # ---------- 4. Offline-Start der neuen App, alle SHELL_ASSETS ----------
        miss = await ev("""async (a) => { const out = []; for (const u of a) { if (!(await caches.match(u))) out.push(u); } return out; }""", SHELL + DATA_ASSETS)
        check(f'Alle {len(SHELL)} SHELL_ASSETS und {len(DATA_ASSETS)} Datei-Assets (Schriften, cookbooks.js, share.js, Titelblätter) im Cache', not miss, str(miss[:5]))
        check('Schriften public-sans, lilita-one und Skripte cookbooks.js, share.js im Cache', all(x in SHELL for x in ['./public-sans.woff2', './lilita-one.woff2', './cookbooks.js', './share.js']))
        await ctx.set_offline(True)
        await page.reload(); await page.wait_for_function("typeof state !== 'undefined' && document.getElementById('app').children.length > 0", timeout=30000); await page.wait_for_timeout(1500)
        n = await ev("() => state.recipes.length")
        check('Offline-Start: Rezepte da, Seite ohne Fehler', n >= 3 and not errs, f'{n} {errs[:2]}')
        pdf_off = await ev("""async () => { try { saveCookbookConfig(Object.assign(getCookbookConfig(), { cover: Object.assign({}, getCookbookConfig().cover, { templateId: 'ofenglueck' }) })); const res = await buildCookbookPdf('off'); return res && res.blob ? res.blob.size : 0; } catch (e) { return 'FEHLER ' + e.message; } }""")
        check('Offline: Kochbuch-PDF mit Titelblatt wird erzeugt', isinstance(pdf_off, int) and pdf_off > 20000, str(pdf_off))
        await ctx.set_offline(False)
        # ---------- 5. Sicherung aus dem alten Stand im neuen Stand wiederherstellen ----------
        b2 = await p.chromium.launch(); c2 = await b2.new_context(viewport={'width': 390, 'height': 844}, timezone_id='UTC')
        await c2.add_init_script(NO_SW + " try{localStorage.setItem('savora-splash-seen','1')}catch(e){}")
        pg = await c2.new_page(); errs2 = []; pg.on('pageerror', lambda e: errs2.append(str(e)))
        await goto(pg)
        text = open(bpath, encoding='utf-8').read()
        await pg.evaluate("async (t) => { await restoreBackupFromFile(new File([t], 'b.json')); }", text)
        res = await pg.evaluate("""() => { const s = cookbookStoreRead(); const ids = state.recipes.map(r => r.id).sort();
          return { n: state.recipes.length, titles: state.recipes.map(r => r.title).sort(), fav: state.recipes.filter(r => r.favorite).map(r => r.title).sort(), note: (state.recipes.find(r => r.title === 'Carbonara') || {}).notes,
                   shop: state.shopping.length, plan: state.mealplan ? Object.keys(state.mealplan).length : -1, cols: getCollections().map(c => [c.name, c.recipeIds.length]),
                   books: s.books.map(b => [b.config.title, b.config.pdfTemplate, b.config.cover && b.config.cover.templateId, (b.config.items || []).map(i => state.recipes.find(r => r.id === i.recipeId).title)]) }; }""")
        check('Wiederherstellung (alte Sicherung, neuer Stand): drei Rezepte, Favoriten, Notiz, Einkauf, Sammlung', res['n'] == 3 and res['titles'] == ['Carbonara', 'Gemüse-Curry', 'Sloppy Joe Buns'] and 'Carbonara' in res['fav'] and 'Sloppy Joe Buns' in res['fav'] and res['note'] == 'Notiz mit Emoji 🍝 und «Zeichen»' and res['shop'] >= 1 and res['cols'] == [['Sonntag', 2]], str(res))
        check('Wiederherstellung: Kochbuch (Titel, Seitenstil, Titelblatt, Reihenfolge) kommt als Projekt zurück', res['books'] and res['books'][0][0] == 'Familienbuch' and res['books'][0][1] == 'B' and res['books'][0][3] == ['Carbonara', 'Sloppy Joe Buns'], str(res['books']))
        await pg.evaluate("async (t) => { await restoreBackupFromFile(new File([t], 'b.json')); }", text)
        res2 = await pg.evaluate("() => [state.recipes.length, cookbookStoreRead().books.length, getCollections().length]")
        check('Zweimal Wiederherstellen verdoppelt nichts', res2 == [3, len(res['books']), 1], str(res2))

        # ---------- 6. Härtung: defekte Sicherung, falsche Datei, Speicherfehler ----------
        bad = await pg.evaluate("""async () => { const out = []; const status = () => (document.getElementById('backupStatus') || {}).innerText || '';
          state.view = 'settings-backup'; render(); await new Promise(r => setTimeout(r, 300));
          const n0 = state.recipes.length;
          for (const t of ['{kaputt', '[]', '{"app":"savora"}', '']) { await restoreBackupFromFile(new File([t], 'x.json')); out.push([t, state.recipes.length === n0, status().slice(0, 140)]); }
          await restoreBackupFromFile(new File([JSON.stringify({ app: 'savora', schemaVersion: 99, recipes: [null, 5, { id: 'zz1', title: 'Aus der Zukunft', ingredients: [{ amount: '1', unit: 'g', name: 'X' }], steps: [{ text: 'Y' }], servings: 2 }] })], 'f.json'));
          out.push(['future', state.recipes.some(r => r.title === 'Aus der Zukunft'), status().slice(0, 300)]);
          return out; }""")
        check('Defekte oder falsche Sicherung: nichts verändert, deutsche Meldung mit nächstem Schritt', all(x[1] for x in bad[:4]) and 'beschädigt' in bad[0][2] and 'Savora-Sicherung' in bad[1][2], str([x[2][:70] for x in bad[:4]]))
        check('Sicherung aus neuerer Version: gültige Rezepte übernommen, unlesbare Einträge gemeldet', bad[4][1] and 'unlesbar' in bad[4][2] and 'neueren' in bad[4][2], bad[4][2])

        await pg.evaluate("() => { state.editingRecipe = emptyRecipe(); state.editingRecipeSnapshot = null; state.view = 'form'; state.formStep = 0; render(); }"); await pg.wait_for_selector('#f-title')
        await pg.fill('#f-title', 'Fehlschlag-Test 🍝 «Ä»'); await pg.fill('#f-servings', '6')
        await pg.evaluate("() => { saveRecipeDraft(collectFormData(), true); window.__realPut = dbPut; window.dbPut = async () => { throw new DOMException('full', 'QuotaExceededError'); }; }")
        n_before = await pg.evaluate("() => state.recipes.length")
        await pg.click('[data-action="save-recipe"]'); await pg.wait_for_timeout(700)
        st = await pg.evaluate("() => ({ view: state.view, title: (document.getElementById('f-title') || {}).value, serv: (document.getElementById('f-servings') || {}).value, draft: !!localStorage.getItem(RECIPE_DRAFT_KEY), n: state.recipes.length, saving: !!state.savingRecipe, toast: (document.querySelector('.toast') || {}).innerText || '' })")
        check('Speicher voll: Formular bleibt, Eingaben und Entwurf bleiben, verständliche Meldung', st['view'] == 'form' and st['title'] == 'Fehlschlag-Test 🍝 «Ä»' and st['serv'] == '6' and st['draft'] and st['n'] == n_before and not st['saving'] and 'Speicher' in st['toast'] and 'Eingaben bleiben' in st['toast'], str(st))
        await pg.evaluate("() => { window.dbPut = window.__realPut; }")
        await pg.click('[data-action="save-recipe"]'); await pg.wait_for_timeout(900)
        st2 = await pg.evaluate("() => ({ view: state.view, n: state.recipes.filter(r => r.title === 'Fehlschlag-Test 🍝 «Ä»').length, draft: !!localStorage.getItem(RECIPE_DRAFT_KEY) })")
        check('Erneut Speichern funktioniert, genau ein Rezept, Entwurf danach gelöscht', st2['view'] == 'detail' and st2['n'] == 1 and not st2['draft'], str(st2))

        # Foto eines gespeicherten Rezepts: Abbruch des Bearbeitens darf das alte Foto nicht löschen
        img_ok = await pg.evaluate("""async () => { const c0 = document.createElement('canvas'); c0.width = 300; c0.height = 200; c0.getContext('2d').fillRect(0, 0, 300, 200); const b0 = await new Promise(res => c0.toBlob(res, 'image/jpeg', 0.8));
          await dbPutImage({ id: 'img_t1', blob: b0, thumbBlob: b0, mime: 'image/jpeg' }); const r = state.recipes.find(x => x.title === 'Sloppy Joe Buns'); r.imageId = 'img_t1'; await dbPut(r); await loadRecipes(); const id = 'img_t1';
          const c = document.createElement('canvas'); c.width = 400; c.height = 300; c.getContext('2d').fillRect(0, 0, 400, 300);
          const blob = await new Promise(res => c.toBlob(res, 'image/png'));
          state.editingRecipe = JSON.parse(JSON.stringify(r)); state.view = 'form'; state.formStep = 0; render(); await new Promise(res => setTimeout(res, 300));
          const dt = new DataTransfer(); dt.items.add(new File([blob], 'neu.png', { type: 'image/png' })); const inp = document.getElementById('f-image'); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
          await new Promise(res => setTimeout(res, 900));
          const stillThere = !!(await dbGetImage(id)); const newId = state.editingRecipe.imageId;
          return { stillThere, replaced: newId !== id, savedRef: state.recipes.find(x => x.id === r.id).imageId === id }; }""")
        check('Foto ersetzt, aber nicht gespeichert: das bisherige Foto bleibt erhalten', isinstance(img_ok, dict) and img_ok['stillThere'] and img_ok['replaced'] and img_ok['savedRef'], str(img_ok))
        wrong = await pg.evaluate("""async () => { state.view = 'form'; render(); await new Promise(res => setTimeout(res, 300)); const dt = new DataTransfer(); dt.items.add(new File(['kein Bild'], 'x.png', { type: 'image/png' }));
          const inp = document.getElementById('f-image'); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true })); await new Promise(res => setTimeout(res, 700));
          return (document.querySelector('.toast') || {}).innerText || ''; }""")
        check('Falsches Bildformat: Meldung nennt gültige Formate', 'JPEG' in wrong and 'PNG' in wrong, wrong)

        # ---------- 7. Importprüfung (Logik) ----------
        imp = await pg.evaluate("""() => { const f = (t) => { const r = parseFreeTextRecipe(t); return { time: r.timeMinutes, prep: r.prepMinutes || 0, serv: r.servings, ids: r._importSummary.issues.map(x => x.id) }; };
          return { bare: f('Pasta\\n15 Minuten\\nZutaten\\n200 g Spaghetti\\nZubereitung\\n1. Kochen.'), tzub: f('Pasta\\nZubereitungszeit: 15 Minuten\\nZutaten\\n200 g Spaghetti\\nZubereitung\\n1. Kochen.'),
                   clear: f('Pasta\\nGesamtzeit: 15 Minuten\\nPortionen: 2\\nZutaten\\n200 g Spaghetti\\nZubereitung\\n1. Kochen.'), parts: f('T\\nErgibt: 9 Stück\\nVorbereitung: 15 Minuten\\nBackzeit: 25 Minuten\\nZutaten\\n1 g X\\nZubereitung\\n1. Y.'),
                   prose: f('Mein Rezept\\n200 g Mehl\\n100 ml Milch\\nAlles verrühren und backen.') }; }""")
        check('Unklare Zeit wird erfragt: «Ist 15 Minuten die Vorbereitungszeit?» (nur bei unbezeichneter oder doppeldeutiger Angabe)', 'time-unclear' in imp['bare']['ids'] and 'time-unclear' in imp['tzub']['ids'], str(imp['bare']))
        check('Eindeutige Zeiten lösen keine Rückfrage aus', 'time-unclear' not in imp['clear']['ids'] and 'time-unclear' not in imp['parts']['ids'], str([imp['clear']['ids'], imp['parts']['ids']]))
        check('Fehlt die Ausbeute, bleibt sie unbekannt (keine erfundene 4)', imp['prose']['serv'] == 0 and imp['bare']['serv'] == 0, str(imp['prose']))
        await pg.evaluate("() => { state.view = 'paste-import'; render(); }"); await pg.wait_for_selector('#pasteText')
        await pg.fill('#pasteText', '   '); await pg.click('[data-action="do-paste-import"]'); await pg.wait_for_timeout(300)
        err = await pg.evaluate("() => (document.getElementById('pasteError') || {}).innerText || ''")
        check('Leerer Importtext: Hinweis mit nächster Handlung, Ansicht bleibt', 'Rezepttext' in err and await pg.evaluate("() => state.view") == 'paste-import', err)
        await pg.fill('#pasteText', 'Pasta\n15 Minuten\nZutaten\n200 g Spaghetti\nZubereitung\n1. Kochen.\nQuelle: Oma'); await pg.click('[data-action="do-paste-import"]'); await pg.wait_for_timeout(500)
        ban = await pg.evaluate("() => { const b = document.querySelector('.import-summary'); return b ? { t: b.innerText, raw: !!b.querySelector('details.import-raw') } : null; }")
        check('Prüfansicht: Quelle, Zeitfrage, Originaltext aufklappbar, Speichern nicht blockiert', ban and 'Quelle' in ban['t'] and 'Oma' in ban['t'] and 'Vorbereitungszeit?' in ban['t'] and ban['raw'] and 'Gespeichert wird erst' in ban['t'], str(ban)[:300])
        await pg.click('[data-action="save-recipe"]'); await pg.wait_for_timeout(800)
        check('Importiertes Rezept ohne Ausbeute lässt sich speichern', await pg.evaluate("() => state.view") == 'detail' and await pg.evaluate("() => state.recipes.some(r => r.title === 'Pasta' && !r.servings)"))

        # ---------- 8. Mengen: Rezeptansicht, Einkauf und PDF mit denselben Zahlen ----------
        q = await pg.evaluate("""async () => { const r = emptyRecipe(); r.id = 'q1'; r.title = 'Mengen'; r.servings = 4;
          const amts = [['0,5', 'l'], ['1.5', 'kg'], ['1/2', 'TL'], ['½', 'EL'], ['1 1/2', 'EL'], ['2-3', 'EL'], ['0.125', 'kg'], ['1,25', 'dl'], ['3', 'Stk'], ['250', 'g']];
          r.ingredients = amts.map((a, i) => ({ amount: a[0], unit: a[1], name: 'Zutat' + i })); r.steps = [{ text: 'x' }]; await dbPut(r); await loadRecipes();
          const rec = state.recipes.find(x => x.id === 'q1'); const nb = /[\\u00a0\\u202f]/g;
          const out = [];
          for (const [factor, serv] of [[1, 4], [2, 8], [0.5, 2]]) {
            state.shopping = []; await addSelectionToShopping(shoppingSelectionFor(rec, serv));
            const view = realIngredients(rec).map(i => scaledAmountLine(i, factor).replace(nb, ' '));
            const shop = realIngredients(rec).map((i, k) => { const it = state.shopping.find(s => s.name === 'Zutat' + k); return it ? shopAmountLine(it).replace(nb, ' ') : null; });
            out.push({ factor, view, shop });
          }
          const m = pdfBuildModel(rec, null); const pdf = m.ingredients.filter(i => i.type === 'ing').map(i => String(i.amount).replace(nb, ' '));
          return { out, pdf }; }""")
        v1 = q['out'][0]
        check('Mengen: Rezeptansicht, Einkauf und PDF zeigen bei Faktor 1 dieselben Zahlen', v1['view'] == v1['shop'] == q['pdf'] or all(a == b == c for a, b, c in zip(v1['view'], v1['shop'], q['pdf'])), str((v1['view'], v1['shop'], q['pdf'])))
        for o in q['out']: check(f'Mengen: Rezeptansicht und Einkauf gleich bei Faktor {o["factor"]}', o['view'] == o['shop'], str((o['view'], o['shop'])))
        check('Mengen: Dezimalkomma, Punkt, Brüche, Bereiche korrekt (Faktor 1)', v1['view'] == ['500 ml', '1 ½ kg', '½ TL', '½ EL', '1 ½ EL', '2–3 EL', '125 g', '1 ¼ dl', '3 Stk', '250 g'] or v1['view'][:8] == ['500 ml', '1 ½ kg', '½ TL', '½ EL', '1 ½ EL', '2–3 EL', '125 g', '125 ml'], str(v1['view']))
        check('Mengen: Faktor 2 verdoppelt Bereiche und Brüche (1 kg + ½ → 3 kg, 4–6 EL, 1 TL)', q['out'][1]['view'][1] == '3 kg' and q['out'][1]['view'][5] == '4–6 EL' and q['out'][1]['view'][2] == '1 TL', str(q['out'][1]['view']))
        check('Keine Seitenfehler', not errs and not errs2, str((errs + errs2)[:3]))
        await b2.close(); await browser.close()
    print('\nFEHLGESCHLAGEN:', ', '.join(FAIL) if FAIL else 'keine'); sys.exit(1 if FAIL else 0)
asyncio.run(main())
