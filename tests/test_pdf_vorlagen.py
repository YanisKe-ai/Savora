"""PDF-Vorlagen (Inhalt der Rezeptseite): Zutatenspalte, Gruppentitel, Zusatzbloecke, Naehrwerte, Quellen, Typografie.
Rendert pvRecipePage mit Testmodellen in allen Stilen (TEMPLATE_IDS, Standard pur und prise-pop) und misst im DOM (Schriften sind geladen).
Aelteres Zutatenmodell (Menge samt Einheit) UND neues Modell (amount/name/note/raw/uncertain) werden geprueft."""
import asyncio, sys, os, json
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)
SHOTS = os.environ.get('SAVORA_PDF_SHOTS', '')
if SHOTS: os.makedirs(SHOTS, exist_ok=True)

# Testmodelle (JS). 'alt' = bisheriges Modell, 'neu' = Modell der Gruppe «Daten».
SETUP = r"""() => {
  const g = (title) => ({ type: 'group', title, show: true });
  const I = (amount, name, extra) => Object.assign({ type: 'ing', amount, name }, extra || {});
  const nutri = (full, missing) => ({ nutrientsPerPortion: { energyKcal: 412, protein: 18.5, carbohydrates: 40, fat: missing ? null : 17, fiber: 3.2, sugars: 6, saturatedFat: 5.1, salt: 1.3 }, sourceDataVersions: {}, confidence: 'medium', unresolvedCount: 0 });
  const base = (id, title, ingredients, extra) => Object.assign({ id, title, category: 'Hauptgericht', facts: [{ label: 'Portionen', value: '4' }, { label: 'Zeit', value: '30 Min.' }], ingredients, steps: [{ type: 'heading', text: 'Teig zubereiten' }, { type: 'step', no: 1, text: 'Mehl, Wasser und Salz gründlich zu einem festen Teig verkneten und 30 Minuten ruhen lassen.' }, { type: 'step', no: 2, text: 'Füllung vermengen, Quadrate schneiden und die Ecken zusammendrücken.' }], tips: [], source: '', notes: '', log: [], nutrition: null, pieces: false }, extra || {});
  const mantiAlt = [g('Für den Teig'), I('200 g', 'Mehl (+ etwas Mehl zum Ausrollen)'), I('75 ml', 'Wasser'), I('½ Ei', '(Ei verquirlen und die Hälfte nehmen)'), I('¼ EL', '(ca. 1 gestrichener TL) Salz'),
    g('Für die Füllung'), I('150 g', 'Hackfleisch (Rind)'), I('½ Zwiebel', '(fein geraspelt)'), I('½ Knoblauchzehe', '(fein gerieben)'), I('½ Handvoll', 'glatte Petersilie (sehr fein gehackt)'), I('½ EL', 'Olivenöl'), I('½ TL', 'Paprikapulver'), I('', 'Pfeffer aus der Mühle'),
    g('Für die Joghurtsauce'), I('250 g', 'türkischer oder griechischer Joghurt (10 % Fett)'), I('1 Prise', 'Salz')];
  const mantiNeu = [g('Für den Teig'), I('200 g', 'Mehl', { note: '+ etwas Mehl zum Ausrollen' }), I('75 ml', 'Wasser'), I('½', 'Ei', { note: 'verquirlen, die Hälfte nehmen' }), I('¼ EL', 'Salz', { note: 'ca. 1 gestrichener TL' }),
    g('Für die Füllung'), I('150 g', 'Hackfleisch', { note: '(Rind)' }), I('½', 'Zwiebel', { note: 'fein geraspelt' }), I('½', 'Knoblauchzehe', { note: 'fein gerieben' }), I('½ Handvoll', 'glatte Petersilie', { note: 'sehr fein gehackt' }), I('½ EL', 'Olivenöl'), I('½ TL', 'Paprikapulver'), I('', 'Pfeffer aus der Mühle'),
    g('Für die Joghurtsauce'), I('250 g', 'türkischer oder griechischer Joghurt', { note: '10 % Fett' }), I('1 Prise', 'Salz'),
    g('Unsicher'), I('', '', { raw: 'Salz & Pfeffer nach Belieben, ca. 3–4 Kardamomkapseln (zerstossen)', uncertain: true })];
  const cookies = [g('Zutaten'), I('150 g', 'Butter'), I('1 Päckli', 'Vanillezucker'), I('2', 'Eier'), I('2 Prisen', 'Salz'), I('', '½ TL Backpulver'), I('300 g', 'dunkle Schokolade oder Schokoladewürfeli'), I('3 gehäufte Esslöffel', 'Rohzucker, braun'), I('½ Tasse', 'Haferflocken, zart')];
  const longUrl = 'https://www.example-rezepte.ch/kochbuch/rezepte/schweizer-spezialitaeten/traditionelle-gerichte-aus-der-zentralschweiz/chocolate-chip-cookies-betty-bossi-original-rezept-mit-extra-langer-adresse.html?utm_source=savora&utm_medium=pdf&utm_campaign=sehr-lange-adresse-ohne-leerzeichen';
  // viele Gruppen: Gruppentitel duerfen nie als letztes Element einer Spalte stehen
  const many = []; for (let k = 1; k <= 6; k++) { many.push(g('Gruppe ' + k)); for (let j = 1; j <= 11; j++) many.push(I(j + ' g', 'Zutat ' + k + '.' + j)); }
  const models = {
    mantiAlt: base('t1', 'Türkische Manti', mantiAlt, { tips: ['  '], notes: '   ', log: [], source: '' }),
    mantiNeu: base('t2', 'Türkische Manti', mantiNeu, { tips: ['Die Manti lassen sich gut einfrieren.'], nutrition: nutri(), nutritionBasis: 'pro Portion', sourceUrl: '' }),
    cookies: base('t3', 'Chocolate Chip Cookies (Betty Bossi)', cookies, { tips: ['Teig vor dem Backen kalt stellen.', 'Zweiter Hinweis mit etwas mehr Text, damit der Block aus mehreren Absätzen besteht.'], notes: 'Mit weniger Zucker probiert: gut.', nutrition: nutri(), nutritionBasis: 'pro Stück', pieces: true, source: 'Betty Bossi ' + longUrl, sourceUrl: '' }),
    viele: base('t4', 'Viele Gruppen', many, {}),
    leer: base('t5', 'Leere Blöcke', [g('Zutaten'), I('1', 'Ei')], { tips: ['', '  '], notes: '', log: [{ date: 1, text: '  ' }], nutrition: nutri(), source: '   ' }),
    voll: base('t6', 'Alles erweitert', mantiNeu, { tips: ['Hinweis.'], notes: 'Notiz.', nutrition: nutri(true, true), nutritionBasis: 'pro 100 g', nutritionNote: 'Gerechnet aus dem Gesamtgewicht.', source: 'Quelle: Oma', sourceUrl: longUrl }),
  };
  window.__models = models;
  window.__render = (key, tplId, detail) => {
    pdfSetContext(tplId, 'Testbuch', 'Tester', true);
    const m = models[key];
    document.getElementById('pvTest') && document.getElementById('pvTest').remove();
    const host = document.createElement('div'); host.id = 'pvTest'; host.style.cssText = 'position:absolute;left:0;top:0;width:210mm;z-index:99999;background:#fff';
    host.innerHTML = pvRecipePage(m, { id: m.id }, null, { photo: 'none' }, detail);
    document.body.appendChild(host);
    return host.firstElementChild;
  };
  return Object.keys(models);
}"""

MEASURE = r"""(sel) => {
  const page = document.querySelector('#pvTest .pv-page');
  const out = { broken: [], aligned: [], ambig: [], fonts: [], overflow: [], amtWrap: [] };
  // 1) Wort bricht mitten im Wort? (ohne URLs, Trennung nur an Leerzeichen, Bindestrich, Schraegstrich)
  const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const el = n.parentElement; if (!el || el.closest('.pv-url') || el.closest('.pv-foot')) continue;
    const txt = n.nodeValue; const re = /[^\s\-–\/]+/g; let m;
    while ((m = re.exec(txt))) {
      const r = document.createRange(); r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length);
      const rects = Array.from(r.getClientRects()).filter((q) => q.width > 0.5);
      const tops = new Set(rects.map((q) => Math.round(q.top / 3)));
      if (tops.size > 1) out.broken.push(m[0]);
    }
  }
  // 2) Schriftgroessen in pt
  page.querySelectorAll('*').forEach((el) => {
    if (el.closest('.pv-foot')) return;
    const own = Array.from(el.childNodes).some((c) => c.nodeType === 3 && c.nodeValue.trim());
    if (!own) return;
    out.fonts.push({ cls: el.className || el.tagName, pt: parseFloat(getComputedStyle(el).fontSize) * 0.75 });
  });
  // 3) Mengen einzeilig, Namen je Liste buendig
  page.querySelectorAll('.pv-ing-col').forEach((col) => {
    const xs = new Set();
    col.querySelectorAll('.pv-ing').forEach((row) => {
      const amt = row.querySelector('.pv-ing-amt'), name = row.querySelector('.pv-ing-name');
      if (amt && !row.hasAttribute('data-stack')) { const rg = document.createRange(); rg.selectNodeContents(amt); if (new Set(Array.from(rg.getClientRects()).map((q) => Math.round(q.top / 3))).size > 1) out.amtWrap.push(amt.textContent); }
      if (!row.hasAttribute('data-stack') && !row.hasAttribute('data-uncertain')) xs.add(Math.round(name.getBoundingClientRect().left));
      const cr = col.getBoundingClientRect(), nr = name.getBoundingClientRect();
      if (nr.right > cr.right + 1 || nr.left < cr.left - 1) out.overflow.push('name ' + name.textContent.slice(0, 20));
    });
    out.aligned.push(xs.size);
  });
  // 4) Gruppentitel: nachfolgendes Element ist eine Zutat
  out.groupLast = Array.from(page.querySelectorAll('.pv-ing-group')).filter((g) => !g.nextElementSibling || !g.nextElementSibling.classList.contains('pv-ing')).map((g) => g.textContent);
  // 5) Ueberschriften ohne Inhalt
  out.emptyHeads = Array.from(page.querySelectorAll('.pv-extra')).filter((x) => !x.textContent.replace(/\s+/g, ' ').replace(x.querySelector('.pv-label') ? x.querySelector('.pv-label').textContent : '', '').trim()).length;
  out.labels = Array.from(page.querySelectorAll('.pv-extra .pv-label')).map((l) => l.textContent.trim());
  // 6) Naehrwerte-Raster
  const grid = page.querySelector('.pv-nut-grid');
  if (grid) {
    const cells = Array.from(grid.querySelectorAll('.pv-nut-cell'));
    out.nut = { n: cells.length, rows: new Set(cells.map((c) => Math.round(c.getBoundingClientRect().top))).size, cols: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
      ok: cells.every((c) => c.querySelector('b') && c.querySelector('em') && c.querySelector('i') && /\S/.test(c.querySelector('b').textContent) && c.getBoundingClientRect().right <= grid.getBoundingClientRect().right + 1),
      zero: cells.filter((c) => /^0([,.]0+)?$/.test(c.querySelector('b').textContent.trim())).length, labels: cells.map((c) => c.querySelector('i').textContent),
      basis: (page.querySelector('.pv-nut-basis') || {}).textContent, hasTitle: !!page.querySelector('.pv-nutri .pv-label') };
  }
  // 7) URL
  const url = page.querySelector('.pv-url');
  if (url) { const src = page.querySelector('.pv-source'); const sr = src.getBoundingClientRect(); out.url = { rects: Array.from(url.getClientRects()).length, within: Array.from(url.getClientRects()).every((q) => q.right <= sr.right + 1 && q.left >= sr.left - 1), pdf: url.getAttribute('data-pdf-href'), href: url.getAttribute('href'), sw: src.scrollWidth <= src.clientWidth + 1 }; }
  out.pageOverflow = page.scrollWidth > page.clientWidth + 1;
  out.uncertain = Array.from(page.querySelectorAll('[data-uncertain] .pv-ing-name')).map((e) => e.textContent);
  return out;
}"""

async def main():
    async with async_playwright() as p:
        b, c = await open_ctx(p, 1000, 900); page = await c.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page)
        await page.add_style_tag(content='html,body{overflow:hidden !important} ::-webkit-scrollbar{display:none}')
        # Druckstile (pdf-print.css) laden: der App-Bildschirm bindet sie nicht ein
        await page.evaluate("""async () => { if (!document.querySelector('link[data-pv-test]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'pdf-print.css'; l.setAttribute('data-pv-test', '1'); document.head.appendChild(l); await new Promise((r) => { l.onload = r; l.onerror = r; }); } }""")
        keys = await page.evaluate(SETUP)
        await page.evaluate("document.fonts.ready")
        await page.evaluate("Promise.all(['400 10px Roboto', '600 10px Roboto', '700 10px Roboto', '400 20px \"Source Serif 4\"', '800 20px \"Sofia Sans Extra Condensed\"'].map((f) => document.fonts.load(f, '½¼¾Aä')))")
        # Brueche in der Schrift vorhanden (Breite mit Ersatzschrift serif vs. monospace gleich = Glyph kommt aus Roboto)
        gl = await page.evaluate("""() => { const c = document.createElement('canvas').getContext('2d'); const w = (f, t) => { c.font = f; return c.measureText(t).width; };
          return ['½', '¼', '¾'].map((t) => [w('600 20px Roboto, serif', t), w('600 20px Roboto, monospace', t)]); }""")
        check('Brüche ½ ¼ ¾ sind in Roboto vorhanden', all(abs(a - b_) < .01 and a > 0 for a, b_ in gl), str(gl))
        for tpl in TEMPLATE_IDS:
            for key, detail in [('mantiAlt', 'off'), ('mantiNeu', 'compact'), ('cookies', 'compact'), ('voll', 'full'), ('leer', 'compact')]:
                await page.evaluate("([k, t, d]) => { __render(k, t, d); }", [key, tpl, detail])
                await page.evaluate("document.fonts.ready"); await page.wait_for_timeout(60)
                r = await page.evaluate(MEASURE, '')
                tag = f'[{tpl}/{key}] '
                check(tag + 'kein Wort bricht mitten im Wort', not r['broken'], str(r['broken'][:5]))
                check(tag + 'Mengen stehen einzeilig (ausser bewusst gestapelt)', not r['amtWrap'], str(r['amtWrap']))
                check(tag + 'Zutatennamen je Liste bündig', all(a <= 1 for a in r['aligned']), str(r['aligned']))
                check(tag + 'Zutaten ragen nicht aus der Spalte', not r['overflow'], str(r['overflow'][:3]))
                check(tag + 'Gruppentitel steht nie ohne folgende Zutat', not r['groupLast'], str(r['groupLast']))
                check(tag + 'keine Überschrift ohne Inhalt', r['emptyHeads'] == 0, str(r['labels']))
                check(tag + 'keine doppelten Überschriften', len(r['labels']) == len(set(r['labels'])), str(r['labels']))
                low = [f for f in r['fonts'] if f['pt'] < 8.5 - .05]
                check(tag + 'Mindestschrift 8,5 pt (Sekundärtexte)', not low, str(low[:3]))
                body = [f for f in r['fonts'] if any(k in str(f['cls']) for k in ('pv-ing-amt', 'pv-ing-name', 'pv-step-text', 'pv-ing ')) or str(f['cls']) == 'pv-ing']
                check(tag + 'Zutaten und Zubereitung mindestens 10 pt', body and all(f['pt'] >= 10 - .05 for f in body), str([f['pt'] for f in body][:3]))
                check(tag + 'Seite ohne waagrechten Überlauf', not r['pageOverflow'])
                if key == 'leer':
                    check(tag + 'leere Hinweise, Notizen und Quelle erscheinen nicht', r['labels'] == ['Nährwerte'] or r['labels'] == [], str(r['labels']))
                if key == 'mantiAlt':
                    check(tag + 'leerer Hinweisblock wird nicht gezeichnet', not r['labels'], str(r['labels']))
                if key in ('mantiNeu', 'voll'):
                    check(tag + 'unsichere Zutat zeigt den Originaltext vollständig', r['uncertain'] == ['Salz & Pfeffer nach Belieben, ca. 3–4 Kardamomkapseln (zerstossen)'], str(r['uncertain']))
                if key in ('mantiNeu', 'cookies', 'voll'):
                    nu = r.get('nut')
                    check(tag + 'Nährwert-Raster: Wert, Einheit, Bezeichnung je Zelle, Zeilen und Spalten fest', bool(nu) and nu['ok'] and nu['zero'] == 0 and nu['hasTitle'], str(nu))
                    if key == 'voll':
                        # fehlender Wert (Fett = null) wird weggelassen, nie als 0 gezeichnet; erweitert = 7 Zeilen (untereinander) oder Zellen
                        check(tag + 'fehlender Wert (Fett) wird weggelassen', 'Fett' not in nu['labels'] and nu['n'] == 7, str(nu))
                        check(tag + 'Bezugsgrösse «pro 100 g» als Zeile', nu['basis'].startswith('pro 100 g'), nu['basis'])
                    elif key == 'cookies':
                        check(tag + 'Bezugsgrösse «pro Stück» als Zeile', nu['basis'].startswith('pro Stück'), nu['basis'])
                        check(tag + 'kompakt: 5 Werte (Energie, Protein, Kohlenhydrate, Fett, Ballaststoffe)', nu['n'] == 5, str(nu))
                if key in ('cookies', 'voll'):
                    u = r.get('url')
                    check(tag + 'lange URL bricht innerhalb der Spalte, ist Link mit data-pdf-href', bool(u) and u['within'] and u['sw'] and u['pdf'] == u['href'] and u['pdf'].startswith('http'), str(u))
                if SHOTS and key in ('mantiAlt', 'mantiNeu', 'cookies', 'voll'):
                    el = await page.query_selector('#pvTest .pv-page'); await el.screenshot(path=f'{SHOTS}/{tpl}_{key}.png')
        # Einheiten: Gruppentitel samt erster Zutat, keine Gruppe ohne Zutat am Ende
        un = await page.evaluate("""() => { const m = __models.viele; const u = pvIngredientUnits(m.ingredients);
          return { n: u.length, bad: u.filter((x) => /pv-ing-group/.test(x.html) && !/pv-ing"/.test(x.html.slice(x.html.lastIndexOf('pv-ing-group')))).length,
                   endsGroup: u.filter((x) => /<div class="pv-ing-group">[^<]*<\\/div>$/.test(x.html)).length, total: u.reduce((a, x) => a + (x.html.match(/pv-ing"/g) || []).length, 0) }; }""")
        check('Einheiten: Gruppentitel immer mit mindestens einer Zutat, nichts geht verloren', un['bad'] == 0 and un['endsGroup'] == 0 and un['total'] == 66, str(un))
        ex = await page.evaluate("""() => { pdfSetContext(__T0, '', '', true); const m = __models.cookies; const units = pvExtrasUnits(m, 'compact'); const all = pvExtrasHtml(m, 'compact');
          return { n: units.length, first: units[0].html.includes('pv-label') && units[0].html.includes('<p>'), more: units.filter((x) => x.more).every((x) => !x.html.includes('pv-label') && x.contHtml.includes('Fortsetzung')),
                   hints: (all.match(/>Hinweise</g) || []).length, empty: pvExtrasHtml(__models.leer, 'off') }; }""")
        check('Zusatzeinheiten: Überschrift mit erstem Absatz, Folgeabsatz mit «· Fortsetzung»', ex['first'] and ex['more'] and ex['hints'] == 1, str(ex))
        check('Leeres Modell erzeugt keinen Zusatzblock', ex['empty'] == '', ex['empty'][:80])
        ch = await page.evaluate("() => [pvContinuationHead('Titel', 2, 3), pvContinuationHead('Titel')]")
        check('Fortsetzungskopf: «Fortsetzung · 2 von 3», ohne Zahlen nur «Fortsetzung»', 'Fortsetzung · 2 von 3' in ch[0] and '>Fortsetzung<' in ch[1], '')
        check('keine JavaScript-Fehler', not errs, str(errs[:2]))
        await b.close()
    print('\nFEHLGESCHLAGEN:' if FAIL else '\nAlle Pruefungen bestanden.', FAIL or '')
    sys.exit(1 if FAIL else 0)
asyncio.run(main())
