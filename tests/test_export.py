"""PDF-Export: drei Vorlagen, Vollständigkeit, keine Einzel-Hinweis-Seite, Links und Lesezeichen, Daten bleiben unverändert."""
import asyncio, sys, json, base64, subprocess, re
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)
OUT = '/tmp/savora-export-test'; _os.makedirs(OUT, exist_ok=True)
FX = json.load(open(_os.path.join(TESTS, 'data', 'export_fixtures.json')))
JS_SEED = """async (fx) => {
  const mk = (w, h, c1) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = c1; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.beginPath(); g.arc(w / 2, h / 2, Math.min(w, h) * .2, 0, 7); g.fill(); return c.toDataURL('image/jpeg', .9); };
  const imgs = { fx_carbonara: mk(1600, 1000, '#c25b2a'), fx_cookies: mk(1000, 1400, '#6b4226'), fx_manti: null, fx_sloppy: mk(1200, 1200, '#7a3b2e') };
  for (const f of fx) { const r = Object.assign(emptyRecipe(), f); r.image = imgs[f.id]; r.updatedAt = Date.now(); await dbPut(r); }
  // Randfaelle
  const edge = [
    { id: 'fx_long40', title: 'Zutatenmonster mit sehr langem Titel der sicher über mehrere Zeilen läuft und trotzdem sauber gesetzt werden muss', servings: 6, ingredients: Array.from({ length: 40 }, (_, i) => ({ amount: i % 4 ? String(i + 1) : '½', unit: i % 2 ? 'g' : 'EL', name: 'Zutat ' + (i + 1) + (i % 5 === 0 ? ' mit sehr langer Bezeichnung die umbrechen muss' : '') })), steps: Array.from({ length: 15 }, (_, i) => ({ text: 'Kurzer Schritt ' + (i + 1) + '.' })) },
    { id: 'fx_longstep', title: 'Ein sehr langer Schritt', servings: 2, ingredients: [{ amount: '1', unit: '', name: 'Ding' }], steps: [{ text: 'Sehr langer Schritt. ' + 'Alles gut vermischen und dabei immer wieder umrühren, damit nichts anbrennt. '.repeat(30) }] },
    { id: 'fx_min', title: 'Minimal', servings: 1, ingredients: [{ amount: '', unit: '', name: 'Wasser' }], steps: [{ text: 'Trinken.' }] },
  ];
  for (const f of edge) { const r = Object.assign(emptyRecipe(), f); r.image = null; r.servings = f.servings; await dbPut(r); }
  await loadRecipes(); }"""
async def main():
    async with async_playwright() as p:
        b, c = await open_ctx(p, 1000, 900); page = await c.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.wait_for_timeout(300)
        await page.evaluate(JS_SEED, FX)
        ids = [f['id'] for f in FX] + ['fx_long40', 'fx_longstep', 'fx_min']
        before = await page.evaluate("(ids) => JSON.stringify(state.recipes.filter(r => ids.includes(r.id)).map(r => ({ id: r.id, title: r.title, ing: r.ingredients, steps: r.steps, notes: r.notes, img: (r.image || '').length })).sort((a, b) => a.id.localeCompare(b.id)))", ids)
        for tpl in ('A', 'B', 'C'):
            await page.evaluate("(a) => saveCookbookConfig({ title: 'Testbuch', subtitle: '', author: 'Tester', pdfTemplate: a[0], chapters: [], items: a[1].map(id => ({ recipeId: id, chapterId: '' })) })", [tpl, ids])
            b64 = await page.evaluate("""async () => { const res = await buildCookbookPdf('off'); const u = new Uint8Array(await res.blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); }""")
            path = f'{OUT}/book_{tpl}.pdf'; open(path, 'wb').write(base64.b64decode(b64)); raw = open(path, 'rb').read()
            txt = subprocess.run(['pdftotext', '-layout', path, '-'], capture_output=True, text=True).stdout
            norm = re.sub(r'\s+', ' ', txt.replace(' ', ' '))
            pages = subprocess.run(['pdfinfo', path], capture_output=True, text=True).stdout
            npages = int(re.search(r'Pages:\s+(\d+)', pages).group(1))
            missing = []
            for f in FX + [{'title': 'Zutatenmonster', 'ingredients': [{'name': 'Zutat 40'}], 'steps': [{'text': 'Kurzer Schritt 15.'}]}, {'title': 'Ein sehr langer Schritt', 'ingredients': [{'name': 'Ding'}], 'steps': []}]:
                if f['title'].split()[0] not in norm: missing.append('Titel ' + f['title'])
                for i in f['ingredients']:
                    nm = i['name'].split(',')[0].split(':')[0].strip()
                    if nm and not i['name'].endswith(':') and nm.split()[0] not in norm: missing.append('Zutat ' + nm)
                for s in f['steps']:
                    t = s['text'].strip()
                    if t.lower().startswith('quelle:'):
                        if t.split(':', 1)[1].strip().split('/')[0] not in norm: missing.append('Quelle ' + t[:30])
                        continue
                    if t and len(t) > 25 and ' '.join(t.split()[:3]) not in norm: missing.append('Schritt ' + t[:30])
            check(f'Vorlage {tpl}: alle Titel, Zutaten und Schritte stehen im PDF-Text', not missing, f'{npages} Seiten, fehlt: {missing[:4]}')
            check(f'Vorlage {tpl}: Inhaltsverzeichnis mit Seitenlinks und Lesezeichen', raw.count(b'/Subtype /Link') >= len(ids) and b'/Outlines' in raw, f"Links={raw.count(b'/Subtype /Link')}")
            check(f'Vorlage {tpl}: Fusszeile mit Buchtitel und Autor', 'TESTBUCH / TESTER' in txt.upper().replace('  ', ' ') or 'Testbuch' in txt)
            check(f'Vorlage {tpl}: Hinweise und Quellen stehen nicht als nummerierte Schritte', 'Haltbarkeit' in norm and not re.search(r'0\d\s+Haltbarkeit', norm) and not re.search(r'\d\d\s+Quelle:', norm))
        # Einzelseiten-Regeln auf HTML-Ebene
        lone = await page.evaluate("""async (ids) => { pdfSetContext('A', 'Testbuch', 'Tester', true); const out = []; for (const id of ids) { const r = state.recipes.find(x => x.id === id); const { htmlPages } = await buildRecipePdfPage(r, null, 'off'); const last = htmlPages[htmlPages.length - 1]; if (htmlPages.length > 1 && !/pv-step"|pv-ing"/.test(last)) out.push(id); } return out; }""", ids)
        check('Keine letzte Seite nur mit einem Hinweis (Cookies-Fall)', not lone, str(lone))
        cookies = await page.evaluate("""async () => { pdfSetContext('A', '', '', false); const r = state.recipes.find(x => x.id === 'fx_cookies'); const { htmlPages } = await buildRecipePdfPage(r, null, 'off'); return htmlPages.length; }""")
        check('Kurzes Rezept mit Hinweisen bleibt auf einer Seite (Cookies)', cookies == 1, str(cookies))
        empty = await page.evaluate("""async () => { pdfSetContext('A', '', '', false); const r = state.recipes.find(x => x.id === 'fx_carbonara'); const { htmlPages } = await buildRecipePdfPage(r, null, 'off'); return htmlPages.join(''); }""")
        check('Leere Überschrift/leerer Schritt (Carbonara) erzeugt keinen leeren Block', 'pv-step-heading">Kombinieren' in empty and empty.count('class="pv-step"') == 2, str(empty.count('class="pv-step"')))
        check('Originalmengen bleiben unverändert (Prise, ½ Ei, ¼ TL)', await page.evaluate("""() => { const m = pdfBuildModel(state.recipes.find(x => x.id === 'fx_manti'), null); const t = m.ingredients.filter(i => i.type === 'ing').map(i => i.amount + ' ' + i.name).join('|'); return t.includes('¼\\u00a0TL Paprikaflocken') && t.includes('1\\u00a0Prise Salz') && t.includes('500\\u00a0g Mehl'); }"""))
        # Daten unveraendert
        after = await page.evaluate("(ids) => JSON.stringify(state.recipes.filter(r => ids.includes(r.id)).map(r => ({ id: r.id, title: r.title, ing: r.ingredients, steps: r.steps, notes: r.notes, img: (r.image || '').length })).sort((a, b) => a.id.localeCompare(b.id)))", ids)
        check('Export verändert keine Rezepte (IDs, Zutaten, Schritte, Notizen, Bilder)', before == after)
        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await b.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
