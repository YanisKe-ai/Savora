"""Regressionstests zum Pruefbericht vom 29.09.2026 (F01 bis F11). Laeuft in isolierten Profilen;
die mitgelieferte Pruef-Sicherung wird nur in ein frisches Testprofil importiert."""
import asyncio, sys, json, base64, subprocess, re
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)
async def new_page(p, tz='Europe/Zurich', w=390, h=844):
    browser = await p.chromium.launch()
    ctx = await browser.new_context(viewport={"width": w, "height": h}, reduced_motion='reduce', timezone_id=tz, accept_downloads=True)
    await ctx.add_init_script(NO_SW + " try{localStorage.setItem('savora-splash-seen','1')}catch(e){}")
    page = await ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    await goto(page)
    return browser, page, errs
async def click(page, sel):
    await page.evaluate("(s) => { const e = document.querySelector(s); if (!e) throw new Error('fehlt ' + s); e.click(); }", sel)
    await page.wait_for_timeout(200)
SEED_ONE = """async () => { const r = emptyRecipe(); r.id = 'r_plan'; r.title = 'Plan-Test'; r.servings = 2; r.ingredients=[{amount:'100',unit:'g',name:'Reis'}]; r.steps=[{text:'Kochen.'}]; await dbPut(r); await loadRecipes(); }"""

async def tz_tests(p):
    for tz in ['Europe/Zurich', 'UTC', 'America/New_York']:
        browser, page, errs = await new_page(p, tz)
        await page.evaluate(SEED_ONE)
        problems = []
        for monday in ['2026-09-28', '2026-10-19', '2026-12-28', '2027-03-22']:
            await show(page, f"() => {{ state.weekStart = parseDateKey('{monday}'); state.view = 'mealplan'; render(); }}", '.week-nav')
            cards = await page.evaluate("""() => Array.from(document.querySelectorAll('.day-card')).map(c => ({ key: c.querySelector('[data-action="open-day-picker"]').dataset.date, label: c.querySelector('.day-card-date').textContent.trim() }))""")
            for c in cards:
                d = await page.evaluate(f"(() => {{ const d = parseDateKey('{c['key']}'); return d.getDate() + '. ' + MONTH_LABELS[d.getMonth()]; }})()")
                if d != c['label']: problems.append(f"{tz} {c['key']} Karte={c['label']} Schluessel={d}")
            if cards[0]['key'] != monday: problems.append(f"{tz}: Montag-Schluessel {cards[0]['key']} statt {monday}")
            day = cards[6]  # Sonntag (enthaelt bei 19.-25.10. die Zeitumstellung)
            await click(page, f'[data-action="open-day-picker"][data-date="{day["key"]}"]')
            title = await page.evaluate("document.getElementById('picker-modal-title').textContent")
            num = day['label'].split('.')[0]
            if f" {num}. " not in title: problems.append(f"{tz} Dialog '{title}' passt nicht zu {day['label']}")
            await click(page, '.picker-item[data-id="r_plan"]'); await page.wait_for_timeout(250)
            rec = await page.evaluate(f"dbGetAllMealplan().then(l => l.find(d => d.date === '{day['key']}'))")
            if not rec or rec.get('keyVersion') != 2 or rec['entries'][-1]['recipeId'] != 'r_plan': problems.append(f"{tz} gespeichert: {rec}")
        # Neu laden: Eintrag erscheint auf derselben Karte
        await goto(page)
        await show(page, "() => { state.weekStart = parseDateKey('2026-12-28'); state.view = 'mealplan'; render(); }", '.week-nav')
        on_sunday = await page.evaluate("""!!document.querySelector('.day-card:nth-of-type(7) .plan-title, .day-card:last-of-type .plan-title')""")
        check(f'F01 Datum konsistent in {tz} (Karte, Dialog, Speicherung, Neuladen; Monat, Jahr, Sommerzeit)', not problems and on_sunday and not errs, '; '.join(problems[:3]))
        await browser.close()

async def migration_test(p):
    # Altbestand: Eintrag, der mit der alten UTC-Logik in Zuerich fuer Mittwoch 30.09. gespeichert wurde
    browser, page, errs = await new_page(p, 'Europe/Zurich')
    await page.evaluate(SEED_ONE)
    legacy_key = await page.evaluate("new Date(2026, 8, 30).toISOString().slice(0, 10)")
    await page.evaluate(f"dbPutMealplanDay({{ date: '{legacy_key}', recipeIds: ['r_plan'], entries: [{{ id: 'e1', recipeId: 'r_plan', meal: 'dinner', servings: 3 }}] }})")
    await goto(page)
    await show(page, "() => { state.weekStart = parseDateKey('2026-09-28'); state.view = 'mealplan'; render(); }", '.week-nav')
    where = await page.evaluate("""Array.from(document.querySelectorAll('.day-card')).findIndex(c => c.querySelector('.plan-title'))""")
    old = await page.evaluate(f"dbGetAllMealplan().then(l => l.find(d => d.date === '{legacy_key}'))")
    new = await page.evaluate("dbGetAllMealplan().then(l => l.find(d => d.date === '2026-09-30'))")
    snap = await page.evaluate("!!localStorage.getItem('savora-mealplan-backup-v1')")
    await goto(page)
    again = await page.evaluate("dbGetAllMealplan().then(l => l.find(d => d.date === '2026-09-30').entries.length)")
    check('F01 Migration: Altbestand bleibt am angezeigten Tag, Original gesichert, einmalig',
          legacy_key == '2026-09-29' and where == 2 and old.get('movedTo') == '2026-09-30' and old['beforeMigration']['entries'][0]['id'] == 'e1' and new['entries'][0]['servings'] == 3 and snap and again == 1,
          f"alter Schluessel={legacy_key} Karte={where}")
    await browser.close()
    browser, page, errs = await new_page(p, 'UTC')
    await page.evaluate(SEED_ONE)
    await page.evaluate("dbPutMealplanDay({ date: '2026-09-30', recipeIds: ['r_plan'] })")
    await goto(page)
    rec = await page.evaluate("dbGetAllMealplan().then(l => l.find(d => d.date === '2026-09-30'))")
    check('F01 Migration: in UTC keine Verschiebung', rec['recipeIds'] == ['r_plan'] and not rec.get('movedTo') and rec.get('keyVersion') == 2)
    await browser.close()

async def data_tests(p):
    browser, page, errs = await new_page(p, 'Europe/Zurich')
    await show(page, "() => { state.view = 'settings-backup'; render(); }", '#restoreFileInput')
    await page.set_input_files('#restoreFileInput', PRUEF_BACKUP)
    await page.wait_for_timeout(2500)
    data = json.load(open(PRUEF_BACKUP))
    before = {r['id']: r for r in data['recipes']}
    ids = sorted(await page.evaluate("state.recipes.map(r => r.id)"))
    stored = {r['id']: r for r in await page.evaluate("dbGetAll()")}
    same = all(json.dumps(before[i]['ingredients'], sort_keys=True) == json.dumps(stored[i]['ingredients'], sort_keys=True) and json.dumps(before[i]['steps'], sort_keys=True) == json.dumps(stored[i]['steps'], sort_keys=True) and before[i].get('servings') == stored[i].get('servings') and before[i].get('notes') == stored[i].get('notes') for i in before)
    imgs = await page.evaluate("state.recipes.filter(r => r.image || r.imageId).length")
    check('Isoliertes Testprofil: Pruef-Sicherung mit gleichen IDs, Zutaten, Schritten, Mengen, Notizen, Fotos', ids == sorted(before) and same and imgs >= 4, f"{len(ids)} Rezepte, Fotos={imgs}")
    buns, qa, carb = 'r_mumsdf7z_cdq7vi', 'r_mun6b5hp_lpbmjc', 'r_mtykmzdx_3kkhfw'

    # F03 im Kochmodus (echte Oberflaeche)
    async def cook_chips(rid, step):
        await page.evaluate(f"() => {{ state.modal = null; state.activeRecipeId = '{rid}'; state.cookStepIndex = {step}; state.cookFinished = false; state.cookShowAllIngredients = false; state.cookAllSteps = false; state.view = 'cookmode'; render(); }}")
        await page.wait_for_timeout(150)
        return await page.evaluate("Array.from(document.querySelectorAll('.cook-ing')).map(e => e.textContent.replace(/\\s+/g, ' ').trim())")
    s1 = await cook_chips(buns, 0); s2 = await cook_chips(buns, 1); q2 = await cook_chips(qa, 1)
    check('F03 Buns Schritt 1 mit Trockenhefe', any('Trockenhefe' in c for c in s1), str(s1))
    check('F03 Buns Schritt 2: Ei, Weissmehl, Teig-Salz (8 g), nicht Fuellungs-Salz (4 g)', any(c.startswith('1 Ei') for c in s2) and any('Weissmehl' in c for c in s2) and any(c.startswith('8 g Salz') for c in s2) and not any(c.startswith('4 g Salz') for c in s2), str(s2))
    check('F03 QA-Schritt "Ei hinzufuegen" erkennt Ei', any('Ei' in c for c in q2), str(q2))
    # Festgelegte Zuordnung
    before_ings = await page.evaluate(f"JSON.stringify(state.recipes.find(r => r.id === '{buns}').ingredients.map(i => [i.amount, i.unit, i.name]))")
    await cook_chips(buns, 1)
    await click(page, '[data-action="cook-edit-step-ings"]')
    await page.evaluate("document.querySelectorAll('[data-step-ing]:checked')[0].click()")
    await click(page, '[data-action="save-step-ings"]'); await page.wait_for_timeout(300)
    s2b = await cook_chips(buns, 1)
    after_ings = await page.evaluate(f"dbGetAll().then(l => JSON.stringify(l.find(r => r.id === '{buns}').ingredients.map(i => [i.amount, i.unit, i.name])))")
    note = await page.evaluate("document.querySelector('.cook-match-note') ? document.querySelector('.cook-match-note').textContent : ''")
    check('F03 Zuordnung festlegbar, Mengen und Text unveraendert', len(s2b) == len(s2) - 1 and after_ings == before_ings and 'festgelegt' in note, f"{len(s2)}->{len(s2b)} {note}")

    # F02 Carbonara
    await show(page, f"() => {{ state.modal = null; state.activeRecipeId = '{carb}'; state.view = 'detail'; render(); }}", '.detail-main')
    warn = await page.evaluate("document.querySelector('.diet-warning') ? document.querySelector('.diet-warning').textContent.replace(/\\s+/g,' ') : ''")
    chips = await page.evaluate("Array.from(document.querySelectorAll('.source-chip')).map(e => e.textContent)")
    veg = await page.evaluate("applyAllFilters((() => { state.activeCollection = 'veggie'; return state.recipes; })()).map(r => r.title)")
    await page.evaluate("state.activeCollection = 'all'")
    diet_before = await page.evaluate(f"dbGetAll().then(l => l.find(r => r.id === '{carb}').diet)")
    check('F02 Carbonara: Warnung statt "Vegan", nicht im Vegetarisch-Filter, Daten unveraendert', 'Kennzeichnung prüfen' in warn and 'Pancetta' in warn and 'Vegan' not in chips and 'Carbonara' not in veg and diet_before == ['vegan', 'vegetarisch'], f"chips={chips} filter={veg}")
    page.once('dialog', lambda d: asyncio.ensure_future(d.accept()))
    await click(page, '[data-action="fix-diet-conflict"]'); await page.wait_for_timeout(300)
    diet_after = await page.evaluate(f"dbGetAll().then(l => l.find(r => r.id === '{carb}').diet)")
    check('F02 Korrektur nur nach Bestaetigung', diet_after == ['fleisch'], str(diet_after))

    # F04 Rechner
    async def uc(val):
        await page.evaluate(f"() => {{ state.ucAmount = {json.dumps(val)}; state.ucUnit = 'kg'; state.view = 'unitconverter'; render(); }}")
        await page.wait_for_timeout(120)
        return await page.evaluate("document.getElementById('ucResults').textContent.replace(/\\s+/g,' ').trim()")
    a, b, c, e1, e2 = await uc('0,5'), await uc('0.5'), await uc('1/2'), await uc('abc'), await uc('')
    lab = await page.evaluate("[!!document.querySelector('label[for=ucAmount]'), !!document.querySelector('label[for=ucUnit]')]")
    check('F04 0,5 = 0.5 = 1/2 kg -> 500 g; Ungueltiges sichtbar abgelehnt; Felder beschriftet', a == b == c and '500 g' in a.replace('500g', '500 g') and 'gültige Zahl' in e1 and 'Menge' in e2 and lab == [True, True], a[:40])

    # Einkauf: 250+100 ml, 500 g + 0,5 kg, inkompatibel
    res = await page.evaluate("""async () => {
      for (const s of (await dbGetAllShopping())) await dbDeleteShopping(s.id); await loadShopping();
      await addSelectionToShopping([{name:'Milch',amount:250,unit:'ml',recipeId:'a',title:'A'},{name:'Milch',amount:100,unit:'ml',recipeId:'b',title:'B'},
        {name:'Mehl',amount:500,unit:'g',recipeId:'a',title:'A'},{name:'Mehl',amount:parseQuantityInput('0,5').value,unit:'kg',recipeId:'b',title:'B'},{name:'Mehl',amount:1,unit:'Päckchen',recipeId:'c',title:'C'}]);
      return state.shopping.map(s => [s.name, s.amount, s.unit, (s.sources||[]).length]); }""")
    check('Einkauf: 350 ml, 1000 g, inkompatible Einheit separat, Quellen erhalten', ['Milch', 350, 'ml', 2] in res and ['Mehl', 1000, 'g', 2] in res and ['Mehl', 1, 'Päckchen', 1] in res, str(res))

    # F07 Naehrwerte
    txt = await page.evaluate(f"""async () => {{ const r = state.recipes.find(x => x.id === '{qa}'); const res = await calculateRecipeNutrition(r);
       state.nutritionDetailMode = 'total'; return ['energy','macro','mineral','vitamin'].map(k => nutritionDetailGroup(NUTRITION_GROUP_ORDER.find(g => g.key === k), res)).join(' '); }}""")
    check('F07 Gesamtwerte ohne Gleitkomma-Reste', not re.search(r'\d+\.\d{3,}', re.sub('<[^>]+>', ' ', txt)), re.findall(r'\d+\.\d{3,}', txt)[:3])

    # F08 Import
    imp = await page.evaluate("""() => { const a = parseFreeTextRecipe('Testkuchen\\n20 Minuten\\nTeig:\\n500 g Mehl\\n1 Ei\\nSauce:\\n100 ml Milch\\n1 Prise Salz\\n2 EL Zucker\\n\\n1. Alles mischen.\\n2. 10 Minuten backen.');
       const b = parseFreeTextRecipe('Brot\\n500 g Mehl\\n1. Kneten und 45 Minuten gehen lassen.'); const c = parseFreeTextRecipe('Braten\\nZubereitungszeit: 1 Std. 30 Min.\\n1 kg Rind\\n1. Braten.');
       return [a.timeMinutes, a._importSummary.ingredientCount, a._importSummary.groupCount, b.timeMinutes, b._importSummary.timeFound, c.timeMinutes]; }""")
    check('F08 Import: eigene Zeitzeile, keine Timer-Summe, fehlende Zeit leer, Gruppen separat', imp == [20, 5, 2, 0, False, 90], str(imp))

    # F10 Backup-Text
    await show(page, "() => { state.view = 'settings-backup'; render(); }", '#restoreFileInput')
    bt = await page.evaluate("document.querySelector('.settings-page').textContent")
    check('F10 Backup-Text ohne Anmeldung korrekt', 'nur auf diesem Gerät' in bt and 'Synchronisation' in bt)

    # F11 Zwischentitel und Quelle
    await show(page, f"() => {{ state.activeRecipeId = '{carb}'; state.detailTab = 'steps'; state.view = 'detail'; render(); }}", '.detail-main')
    heads = await page.evaluate("Array.from(document.querySelectorAll('#panel-steps .step-heading')).map(e => e.textContent.trim())")
    await show(page, f"() => {{ state.activeRecipeId = '{buns}'; state.view = 'detail'; render(); }}", '.detail-main')
    src = await page.evaluate("document.querySelector('.source-line').textContent.trim()")
    fids = await page.evaluate("() => { state.modal = { type: 'filter-sheet' }; state.view = 'home'; render(); const ids = Array.from(document.querySelectorAll('.filter-group-title')).map(e => e.id); state.modal = null; render(); return ids; }")
    check('F11 Zwischentitel ohne Nummer, Quelle aus Text, eindeutige Filter-IDs', 'Speck vorbereiten' in heads and 'kookmutsjes' in src and len(fids) == len(set(fids)), f"{heads[:3]} {src}")

    check('Keine Seitenfehler im Testprofil', not errs, str(errs[:3]))
    await browser.close()

async def pdf_tests(p):
    browser, page, errs = await new_page(p, 'Europe/Zurich')
    have_backup = os.path.exists(PRUEF_BACKUP)
    if have_backup:
        await show(page, "() => { state.view = 'settings-backup'; render(); }", '#restoreFileInput')
        await page.set_input_files('#restoreFileInput', PRUEF_BACKUP)
        await page.wait_for_timeout(2500)
    # Testfotos mit Kreis: quadratisch, hoch, quer
    await page.evaluate("""async () => {
      const mk = async (id, w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
        x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.fillStyle = '#000'; x.beginPath(); const rad = Math.min(w, h) * 0.08; x.arc(w / 2, h / 2, rad, 0, 7); x.fill();
        const blob = await new Promise(r => c.toBlob(r, 'image/png')); await dbPutImage({ id, blob, thumbBlob: blob, mime: 'image/png' }); };
      for (const [id, w, h] of [['kreis_q', 1200, 1200], ['kreis_h', 900, 1400], ['kreis_b', 1600, 700]]) {
        await mk(id, w, h); const r = emptyRecipe(); r.id = 'r_' + id; r.title = 'Kreis ' + id; r.imageId = id; r.ingredients = [{amount:'1',unit:'',name:'Test'}]; r.steps = [{text:'Test.'}]; await dbPut(r); }
      await loadRecipes(); }""")
    ratios = []
    for rid in ['r_kreis_q', 'r_kreis_h', 'r_kreis_b']:
        b64 = await page.evaluate(f"""async () => {{ const r = await buildSinglePdf('{rid}', 'off'); const buf = new Uint8Array(await r.blob.arrayBuffer()); let s=''; for (let i=0;i<buf.length;i+=8192) s += String.fromCharCode.apply(null, buf.subarray(i,i+8192)); return btoa(s); }}""")
        open(OUT + f'/{rid}.pdf', 'wb').write(base64.b64decode(b64))
        from pdf2image import convert_from_path
        img = convert_from_path(OUT + f'/{rid}.pdf', dpi=100)[0].convert('L')
        px = img.load(); W, H = img.size
        dark = [(x, y) for y in range(H) for x in range(0, W) if px[x, y] < 20]
        if dark:
            minx = min(d[0] for d in dark); maxx = max(d[0] for d in dark); miny = min(d[1] for d in dark); maxy = max(d[1] for d in dark)
            ratios.append(round((maxx - minx + 1) / (maxy - miny + 1), 3))
        else: ratios.append(None)
    check('F05 Fotos im PDF unverzerrt (Kreis bleibt Kreis: quadratisch, hoch, quer)', all(r and 0.95 <= r <= 1.05 for r in ratios), str(ratios))
    if not have_backup:
        print('UEBERSPRUNGEN (nicht bestanden, nicht ausgefuehrt): Kochbuch-PDF-Pruefung mit Originalrezepten, denn die private Sicherung fehlt')
        check('Keine Seitenfehler beim PDF-Export', not errs, str(errs[:3]))
        await browser.close()
        return
    # Kochbuch mit Originalrezepten: Seitenzahlen, Text, keine einsamen Titel
    await page.evaluate("""() => { const ids = ['r_mumsdf7z_cdq7vi','r_mui6wg6i_zj6d9m','r_mtykmzdx_3kkhfw','r_mtyg22x3_8bxo6m'];
      saveCookbookConfig({ title: 'Prueftest', subtitle: '', coverRecipeId: '', chapters: [], items: ids.map(id => ({ recipeId: id, chapterId: '' })) }); }""")
    for mode in ['off', 'compact', 'full']:
        b64 = await page.evaluate(f"""async () => {{ const r = await buildCookbookPdf('{mode}'); const buf = new Uint8Array(await r.blob.arrayBuffer()); let s=''; for (let i=0;i<buf.length;i+=8192) s += String.fromCharCode.apply(null, buf.subarray(i,i+8192)); return btoa(s); }}""")
        open(OUT + f'/book_{mode}.pdf', 'wb').write(base64.b64decode(b64))
    out = subprocess.run(['pdftotext', '-layout', OUT + '/book_off.pdf', '-'], capture_output=True, text=True).stdout
    pages = out.split('\f')
    titles = {'Teig', 'Sloppy-Joe-Füllung', 'Zum Füllen und Bestreichen', 'Für den Teig', 'Für die Füllung', 'Für die rote Butter-Sauce', 'Für die Joghurtsauce', 'Cremig vollenden', 'Kombinieren', 'Teig & Schokolade zusammenfügen'}
    lonely = []
    numbered = 0
    for n, pg in enumerate(pages):
        lines = [l.strip() for l in pg.split('\n') if l.strip()]
        if not lines: continue
        content = [l for l in lines if not re.fullmatch(r'\d+', l) and 'Savora · Dein Kochbuch' not in l]
        if lines and re.fullmatch(r'\d+', lines[-1]): numbered += 1
        if content and content[-1] in titles: lonely.append((n + 1, content[-1]))
    npages = len([p for p in pages if p.strip()])
    check('F06 Kochbuch-PDF: echter Text, Seitenzahlen, keine Titel allein am Seitenende', 'Trockenhefe' in out and 'Carbonara' in out and numbered >= npages - 1 and not lonely, f"{npages} Seiten, nummeriert={numbered}, einsam={lonely}")
    check('F06 PDF in allen Naehrwert-Modi erstellt', all(len(open(OUT + f'/book_{m}.pdf', 'rb').read()) > 50000 for m in ['off', 'compact', 'full']))
    check('Keine Seitenfehler beim PDF-Export', not errs, str(errs[:3]))
    await browser.close()

async def main():
    async with async_playwright() as p:
        await tz_tests(p)
        await migration_test(p)
        if os.path.exists(PRUEF_BACKUP):
            await data_tests(p)
        else:
            print('UEBERSPRUNGEN (nicht bestanden, nicht ausgefuehrt): data_tests, denn tests/private/07_Sicherung_waehrend_Pruefung.json fehlt')
        await pdf_tests(p)
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
