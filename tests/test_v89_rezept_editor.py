"""v0.89 Teil A: Rezeptdetail und Editor auf dem Handy.
- iPhone SE (375x667): erste Zutat ohne Scrollen sichtbar (mit Foto und langem Titel), Aktionen als eine Symbolzeile mit Kurzbeschriftung, voller Name per aria-label.
- Quelle und Kategorien stehen auf dem Handy unter dem Reiterinhalt; vier Reiter passen auf 375 px ohne Abschneiden.
- Editor: Mengenfeld ohne Dezimaltastatur, Schnellknöpfe ½ ¼ «bis», Zutat als Karte mit Name zuerst, «Schritt 2 von 5: Kategorien», Schlagwort per Knopf.
- Neue Rezepte ohne erfundene Zeit (timeMinutes null), Rezepte ohne Foto zeigen den Anfangsbuchstaben."""
import asyncio, sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

SETUP = """async () => {
  const c = document.createElement('canvas'); c.width = 400; c.height = 300; const g = c.getContext('2d'); g.fillStyle = '#2f4a3a'; g.fillRect(0, 0, 400, 300);
  const photo = c.toDataURL('image/jpeg', 0.8);
  const mk = (id, title, img) => Object.assign(emptyRecipe(), { id, title, image: img, servings: 4, timeMinutes: 30, categoryTags: ['pasta'], diet: ['vegetarisch'],
    ingredients: [['250','ml','Milch'],['15','g','Honig'],['2','','Zwiebeln']].map(a => ({ amount: a[0], unit: a[1], name: a[2] })),
    steps: [{ text: 'Mischen.' }], notes: 'Notiz', source: 'https://www.example.com/rezept', createdAt: Date.now(), updatedAt: Date.now() });
  const rs = [mk('v89_foto', 'Ofengemüse mit Feta und Kräutern', photo), mk('v89_ohne', 'Überbackene Kartoffel-Zucchini-Gratin mit Rosmarin', null)];
  for (const r of rs) await dbPut(r);
  state.recipes = state.recipes.filter(x => !rs.some(y => y.id === x.id)).concat(rs); state.showNutrition = true; }"""
OPEN = "(id) => { state.activeRecipeId = id; state.view = 'detail'; state.detailTab = 'ingredients'; render(); window.scrollTo(0, 0); }"
GEOM = """() => { const q = s => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
  const ing = q('#panel-ingredients .ing-check'), nav = q('.bottom-nav'); const tools = Array.from(document.querySelectorAll('.detail-tools .tool-action'));
  const tops = new Set(tools.map(b => Math.round(b.getBoundingClientRect().top)));
  const bar = document.querySelector('.tabbar-v2'); const below = document.querySelector('.detail-meta-below'); const last = Array.from(document.querySelectorAll('.tab-panel:not([hidden])')).pop();
  return { ingBottom: ing && ing.bottom, navTop: nav.top, toolRows: tops.size, toolNames: tools.map(b => b.getAttribute('aria-label')), toolShort: tools.map(b => getComputedStyle(b.querySelector('.tool-label-short')).display !== 'none' ? b.querySelector('.tool-label-short').textContent : ''),
    toolMinH: Math.min(...tools.map(b => b.getBoundingClientRect().height)), clipped: tools.filter(b => b.scrollWidth > b.clientWidth + 1).length,
    tabsFit: bar.scrollWidth <= bar.clientWidth + 1, tabCount: bar.querySelectorAll('.tab-v2').length,
    belowAfterPanel: !!below && !!last && (last.compareDocumentPosition(below) & Node.DOCUMENT_POSITION_FOLLOWING) > 0, headSource: !!document.querySelector('.detail-col--info .source-row'),
    ov: document.documentElement.scrollWidth - innerWidth }; }"""

async def main():
    async with async_playwright() as p:
        b, c = await open_ctx(p, 375, 667); page = await c.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.evaluate(SETUP)
        for rid in ('v89_foto', 'v89_ohne'):
            await page.evaluate(OPEN, rid); await page.wait_for_function("document.querySelector('#panel-ingredients .ing-check')")
            g = await page.evaluate(GEOM)
            check(f'375x667 {rid}: erste Zutat ohne Scrollen sichtbar', g['ingBottom'] is not None and g['ingBottom'] <= g['navTop'], str(g))
            check(f'375x667 {rid}: Aktionen in einer Zeile, Kurzbeschriftung sichtbar, voller Name per aria-label, mind. 44 px, nichts abgeschnitten',
                  g['toolRows'] == 1 and g['toolShort'] == ['Einkauf', 'Planen', 'Bearbeiten', 'Teilen'] and g['toolNames'] == ['Auf die Einkaufsliste', 'Zum Wochenplan', 'Bearbeiten', 'Teilen'] and g['toolMinH'] >= 44 and g['clipped'] == 0 and g['ov'] <= 0, str(g))
            check(f'375x667 {rid}: Quelle/Kategorien unter dem Reiterinhalt, nicht im Kopf', g['belowAfterPanel'] and not g['headSource'], str(g))
            check(f'375x667 {rid}: vier Reiter passen ohne Abschneiden', g['tabCount'] == 4 and g['tabsFit'], str(g))
        # 390x844 (iPhone 12-15, App ohne Adressleiste): volle Beschriftung bleibt, erste Zutat auch mit Foto sichtbar
        await page.set_viewport_size({'width': 390, 'height': 844}); await page.evaluate(OPEN, 'v89_foto'); await page.wait_for_function("document.querySelector('#panel-ingredients .ing-check')")
        g = await page.evaluate(GEOM)
        check('390x844 mit Foto: erste Zutat sichtbar, Aktionen mit voller Beschriftung', g['ingBottom'] <= g['navTop'] and g['toolShort'] == ['', '', '', ''], str(g))
        # Platzhalter ohne Foto: Anfangsbuchstabe
        await page.evaluate("() => { state.view = 'home'; state.homeLayout = 'list'; state.homeLayoutChosen = true; render(); }"); await page.wait_for_selector('.rrow--phone')
        ph = await page.evaluate("""() => { const row = Array.from(document.querySelectorAll('.rrow--phone')).find(r => r.textContent.includes('Überbackene')); const t = row && row.querySelector('.rrow-img.ph-initial');
          return t ? { letter: t.textContent.trim(), font: getComputedStyle(t.querySelector('.ph-initial-letter')).fontFamily, hidden: t.getAttribute('aria-hidden'), bookIcon: !!t.querySelector('svg') } : null; }""")
        check('Liste: Rezept ohne Foto zeigt «Ü» in Lilita One statt Buchsymbol', ph is not None and ph['letter'] == 'Ü' and 'Lilita' in ph['font'] and ph['hidden'] == 'true' and not ph['bookIcon'], str(ph))
        check('Anfangsbuchstabe überspringt Zeichen ohne Buchstaben («TEST: x» → T, «12 Brote» → 1, leer → Buchsymbol)', await page.evaluate("[recipeInitialLetter({ title: '«TEST»: x' }), recipeInitialLetter({ title: '12 Brote' }), recipeInitialLetter({ title: '' })]") == ['T', '1', ''])

        # Neues Rezept: keine erfundene Zeit
        nr = await page.evaluate("() => { const r = emptyRecipe(); return { t: r.timeMinutes, meta: recipeMetaLine(Object.assign(r, { title: 'X' })) }; }")
        check('Neues Rezept: Zeit unbekannt (null), keine Zeit in der Kartenzeile', nr['t'] is None and nr['meta'] == '', str(nr))
        await page.evaluate("() => { state.editingRecipe = emptyRecipe(); state.formStep = 0; state.view = 'form'; render(); }"); await page.wait_for_selector('#f-time')
        ft = await page.evaluate("() => [document.getElementById('f-time').value, document.getElementById('f-time').placeholder]")
        check('Editor neues Rezept: Gesamtzeit leer mit Hinweis «unbekannt»', ft == ['', 'unbekannt'], str(ft))

        # Editor: Schritt-Anzeige, Schlagwort, Zutatenkarten
        await page.set_viewport_size({'width': 375, 'height': 667})
        await page.evaluate("() => { state.editingRecipe = JSON.parse(JSON.stringify(state.recipes.find(r => r.id === 'v89_ohne'))); state.formStep = 1; state.view = 'form'; render(); }"); await page.wait_for_selector('.form-step-caption')
        cap = await page.evaluate("() => { const e = document.querySelector('.form-step-caption'); return [e.textContent.replace(/\\s+/g, ' ').trim(), getComputedStyle(e).display]; }")
        check('Editor: «Schritt 2 von 5: Kategorien» sichtbar', cap == ['Schritt 2 von 5: Kategorien', 'block'], str(cap))
        await page.fill('#f-tag-new', 'Für Gäste'); await page.click('[data-action="add-tag"]')
        await page.wait_for_function("state.editingRecipe.tags.includes('Für Gäste')")
        tg = await page.evaluate("() => ({ pills: Array.from(document.querySelectorAll('.tag-pill')).map(p => p.textContent.trim()), val: document.getElementById('f-tag-new').value, h: document.querySelector('.tag-add-btn').getBoundingClientRect().height })")
        check('Schlagwort per Knopf «Hinzufügen»: Pille erscheint, Feld leer, Knopf mind. 44 px', 'Für Gäste' in tg['pills'] and tg['val'] == '' and tg['h'] >= 44, str(tg))
        await page.click('[data-action="add-tag"]')   # leer: nichts passiert
        check('Leeres Schlagwort wird nicht hinzugefügt', await page.evaluate("state.editingRecipe.tags.filter(t => !t.trim()).length") == 0)

        await page.evaluate("() => { state.editingRecipe = collectFormData(); state.formStep = 2; render(); }"); await page.wait_for_selector('#ingRows .ing-row')
        row = await page.evaluate("""() => { const r = document.querySelector('#ingRows .ing-row'); const n = r.querySelector('.ing-name-input').getBoundingClientRect(), a = r.querySelector('.ing-amount-input').getBoundingClientRect();
          const inputs = Array.from(r.querySelectorAll('input')).map(i => i.className); const cs = getComputedStyle(r);
          return { inputmode: r.querySelector('.ing-amount-input').getAttribute('inputmode'), nameFirst: inputs[0] === 'ing-name-input', nameAbove: n.bottom <= a.top + 1, nameWide: n.width > a.width * 2, card: cs.borderTopWidth !== '0px' && parseFloat(cs.borderTopLeftRadius) >= 8,
            quickHidden: getComputedStyle(r.querySelector('.ing-quick')).display === 'none', font: parseFloat(getComputedStyle(r.querySelector('.ing-amount-input')).fontSize) }; }""")
        check('Zutatenkarte: Name zuerst und breit über Menge/Einheit, eigene Karte', row['nameFirst'] and row['nameAbove'] and row['nameWide'] and row['card'], str(row))
        check('Mengenfeld: keine Dezimaltastatur (½, 2-3 tippbar), Schrift mind. 16 px, Schnellknöpfe erst beim Bearbeiten', row['inputmode'] is None and row['font'] >= 16 and row['quickHidden'], str(row))
        await page.fill('#ingRows .ing-row >> nth=0 >> .ing-amount-input', '1')
        await page.focus('#ingRows .ing-row >> nth=0 >> .ing-amount-input')
        await page.wait_for_function("getComputedStyle(document.querySelector('#ingRows .ing-row .ing-quick')).display !== 'none'")
        await page.click('#ingRows .ing-row >> nth=0 >> [data-val="-"]'); await page.keyboard.type('2')
        await page.click('#ingRows .ing-row >> nth=0 >> [data-val="½"]')
        v = await page.evaluate("() => [document.querySelector('#ingRows .ing-row .ing-amount-input').value, document.activeElement && document.activeElement.className]")
        check('Schnellknöpfe fügen an der Schreibmarke ein, Fokus bleibt im Mengenfeld («1-2½»)', v == ['1-2½', 'ing-amount-input'], str(v))
        await page.fill('#ingRows .ing-row >> nth=0 >> .ing-amount-input', '2-3')
        kept = await page.evaluate("() => collectFormData().ingredients.find(i => i.name === 'Milch').amount")
        check('Bereich «2-3» wird unverändert übernommen', kept == '2-3', str(kept))
        sb = await page.evaluate("() => Array.from(document.querySelectorAll('.ing-quick-btn')).slice(0, 3).map(b => Math.round(b.getBoundingClientRect().height))")
        check('Schnellknöpfe mind. 44 px hoch', all(h >= 44 for h in sb), str(sb))
        check('Kein seitlicher Überlauf im Editor', await page.evaluate("document.documentElement.scrollWidth - innerWidth") <= 0)
        check('Keine JS-Fehler', not errs, str(errs))
        await b.close()
    print('\nFEHLGESCHLAGEN:', FAIL if FAIL else 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
