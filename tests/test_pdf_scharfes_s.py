"""PDF-Export mit «ß» und anderen Zeichen, die bei Grossschreibung laenger werden (Fehler vom 14.10.2026:
html2canvas brach beim Kochbuch mit «Grüße aus Zürich» ab, weil text-transform: uppercase «ß» zu «SS» verlaengert).
Prueft Einzelrezept und Kochbuch in beiden Stilen: Export laeuft durch, Text bleibt im PDF erhalten."""
import asyncio, sys, json, base64, subprocess, re
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)
OUT = '/tmp/savora-scharfes-s'; _os.makedirs(OUT, exist_ok=True)
SEED = """async () => {
  const r = Object.assign(emptyRecipe(), { id: 'ss_1', title: 'Grüße aus der Straße', servings: 2, categoryTags: ['hauptgericht'], category: 'Süße Grüße',
    ingredients: [{ amount: '200', unit: 'g', name: 'Weißkohl' }, { amount: '1', unit: 'EL', name: 'Öl' }],
    steps: [{ text: 'Weißkohl in Streifen schneiden. Mit Öl in der Pfanne anbraten, bis er süßlich duftet.' }], notes: 'Maße nach Gefühl.' });
  r.image = null; r.updatedAt = Date.now(); await dbPut(r); await loadRecipes(); }"""
TOB64 = "const u = new Uint8Array(await res.blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s);"
async def main():
    async with async_playwright() as p:
        b, c = await open_ctx(p, 1000, 900); page = await c.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.wait_for_timeout(300)
        await page.evaluate(SEED)
        for tpl in TEMPLATE_IDS:
            try:
                b64 = await page.evaluate("async (t) => { const res = await buildSinglePdf('ss_1', 'compact', { template: t }); " + TOB64 + " }", tpl)
                path = f'{OUT}/einzel_{tpl}.pdf'; open(path, 'wb').write(base64.b64decode(b64)); ok = True
            except Exception as e:
                ok = False; path = None; print('  Fehler', str(e)[:200])
            check(f'[{tpl}] Einzelrezept mit «ß» wird exportiert', ok)
            await page.evaluate("(t) => saveCookbookConfig({ title: 'Grüße aus Zürich', subtitle: 'Maßvoll genießen', author: 'Weiß', pdfTemplate: t, chapters: [{ id: 'k1', name: 'Süße Grüße aus der Straße' }], items: [{ recipeId: 'ss_1', chapterId: 'k1' }] })", tpl)
            try:
                b64 = await page.evaluate("async () => { const res = await buildCookbookPdf('compact'); " + TOB64 + " }")
                bpath = f'{OUT}/buch_{tpl}.pdf'; open(bpath, 'wb').write(base64.b64decode(b64)); okb = True
            except Exception as e:
                okb = False; bpath = None; print('  Fehler', str(e)[:200])
            check(f'[{tpl}] Kochbuch «Grüße aus Zürich» wird exportiert', okb)
            if okb:
                txt = re.sub(r'\s+', ' ', subprocess.run(['pdftotext', bpath, '-'], capture_output=True, text=True).stdout)
                check(f'[{tpl}] Rezepttitel mit «ß» steht im PDF-Text', 'Straße' in txt or 'STRASSE' in txt.upper(), txt[:200])
        check('Keine Seitenfehler', not errs, '; '.join(errs[:3]))
        await b.close()
    print('\nFEHLER:' if FAIL else '\nALLE OK', FAIL if FAIL else '')
    sys.exit(1 if FAIL else 0)
asyncio.run(main())
