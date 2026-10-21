"""v83 Cover-Geometrie und PDF-Layout (Auftrag §9, §11, §20 E).

Teil A, Cover (sichtbare Geometrie statt Containerrechtecke):
  - Wortmarke: WORDMARK_INK stimmt mit der gerasterten Pfadflaeche ueberein (viewBox hat transparente Raender)
  - Tinte der Textzeilen (inkBox) umschliesst die tatsaechlich gezeichneten Pixel (coverDraw, gleiche Funktion wie Vorschau und PDF)
  - kein Fehlalarm: Titel knapp unter der Wortmarke (Container ueberlappen, sichtbare Inhalte nicht)
  - echte Kollisionen bleiben: Titel/Logo, Titel/Untertitel, Name/weitere Zeile, zu knapper Abstand, Rand (Druckbereich), ausserhalb (sperrt)
  - Font-Ladeverzoegerung: solange die Schrift laedt, keine Ueberlappungshinweise; danach korrekt
  - coverAutoAlign: kleinste Verschiebung, Sicherheitsabstand, keine Text-/Groessenaenderung, Erklaerung ohne Loesung
  - Editor: Warnung aktualisiert sich nach Verschieben, «Automatisch ausrichten» nur auf Klick, Rueckgaengig ueber den Undo-Stapel,
    «Im Cover bearbeiten» (data-cover-edit) springt zum Feld
Teil B, PDF (echte PDFs, pdftoppm/pdftotext ueber tests/pdf_harness.py), beide Stile:
  - kurzes Rezept 1 Seite; Sloppy Joe (knapp zu lang) 1 Seite dicht, Schrift nicht kleiner als 10 / 8,5 pt
  - lange Rezepte mehrseitig mit Fortsetzung (Rezeptname, «Fortsetzung»), keine fast leere Restseite
  - ohne Bild, Hoch-/Querformat, lange Quelle, lange Ueberschrift, sehr langer Schritt, sehr lange Zutatenliste
  - pdfLastPageCounts / pdfLastPlan nach dem Rendern = tatsaechliche Seiten (Einzelrezept und Kochbuch), vorher null
  - beide Stile gleicher Text
Linux-Simulation: SAVORA_PDF_TEXT_SHIFT_MM=0.3 (pdf_harness). Ausgabe: <OUT>/v83_cover_pdf/."""
import asyncio, json, os, re, sys
os.environ.setdefault('SAVORA_TEST_PORT', '24300')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pdf_harness import *   # noqa: F401,F403

OUTDIR = os.path.join(OUT, 'v83_cover_pdf'); os.makedirs(OUTDIR, exist_ok=True)
FAIL = []
def _ascii(t): return re.sub(r'[^a-z]+', '', t.lower())
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, (str(info)[:300] if (info and (not cond or len(str(info)) < 160)) else ''))
    if not cond: FAIL.append(name)

COVER_JS = r"""async () => {
  const W = COVER_PAGE.w, H = COVER_PAGE.h, R = {};
  // Wortmarke rastern
  { const k = 4, c = document.createElement('canvas'); c.width = 1200 * k; c.height = 400 * k; const g = c.getContext('2d'); g.scale(k, k); g.fill(new Path2D(WORDMARK_PATH), 'evenodd');
    const d = g.getImageData(0, 0, c.width, c.height).data; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y += 1) for (let x = 0; x < c.width; x += 1) if (d[(y * c.width + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    R.wm = { x0: x0 / k, y0: y0 / k, x1: (x1 + 1) / k, y1: (y1 + 1) / k, def: WORDMARK_INK }; }
  await coverEnsureFonts();
  const inp = (fields, extra, texts) => coverInputFromConfig(Object.assign({ title: 'Meine Rezepte', subtitle: 'Familienküche aus Basel', author: 'Yanis Keusch', showLogo: true }, texts || {}, { cover: Object.assign({ v: 2, mode: 'template', templateId: 'pop', date: '2026-10-15', showDate: true, fields: fields || {} }, extra || {}) }));
  const ws = (L) => L.warnings.map(w => w.kind + ':' + w.fieldId + (w.otherId ? '/' + w.otherId : '') + (w.near ? '~' : ''));
  // Tinte gegen gezeichnete Pixel (nur Text, ohne Hintergrund/Logo/Datum)
  const pix = (L, id) => {
    const b = L.blocks.find(x => (x.id || x.key) === id); const only = Object.assign({}, L, { blocks: [Object.assign({}, b, { ink: '#000000' })], logo: null, date: null, panels: [], gradients: [], images: [], image: null, bgColor: null });
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.clearRect(0, 0, W, H);
    coverDraw(g, only, null, 1, null, {}); g.clearRect(0, 0, 0, 0);
    const d = g.getImageData(0, 0, W, H).data; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (d[i + 3] > 40 && d[i] < 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    const ib = b.inkBox; return { drawn: [x0, y0, x1 + 1, y1 + 1], ink: [ib.x * W, ib.y * H, (ib.x + ib.w) * W, (ib.y + ib.h) * H].map(v => Math.round(v * 10) / 10) };
  };
  R.pix = {};
  for (const [n, f] of Object.entries({ left: { title: { color: '#252720' } }, center: { title: { align: 'center' } }, right: { title: { align: 'right' } }, lilita: { title: { font: 'Lilita One', y: 0.3 } }, zweizeilig: { title: { w: 0.4 } } })) {
    const L = coverLayout(inp(f, null, n === 'zweizeilig' ? { title: 'Unsere liebsten Familienrezepte' } : null)); R.pix[n] = pix(L, 'title');
  }
  // Fehlalarm vorher: Titel unter der Wortmarke
  const near = inp({ title: { y: 0.105 } });
  const Lb = coverLayout(near, coverMeasureDefault.bind(null));   // alte Containergeometrie (eigene Messfunktion)
  const Li = coverLayout(near);
  const tb = Li.blocks.find(b => b.id === 'title'), lg = coverLogoInkBox(Li.logo);
  R.near = { box: ws(Lb), ink: ws(Li), gapMm: Math.round((tb.inkBox.y - (lg.y + lg.h)) * H / (W / 210) * 10) / 10, containerOverlapPx: Math.round(((Li.logo.y + Li.logo.h) - tb.y) * H * 10) / 10 };
  // echte Kollisionen
  R.real = {
    titleLogo: ws(coverLayout(inp({ title: { y: 0.06 } }))),
    titleSub: ws(coverLayout(inp({ title: { y: 0.3 }, subtitle: { y: 0.31 } }))),
    nameExtra: ws(coverLayout(inp({ name: { y: 0.6 }, extra1: { text: 'Zweite Auflage', y: 0.6 } }))),
    nearPair: (() => { const L0 = coverLayout(inp({ subtitle: { y: 0.4 } })); const s = L0.blocks.find(b => b.id === 'subtitle'); const nm = L0.blocks.find(b => b.id === 'name');
      // Name so setzen, dass seine Tinte 0,5 mm unter der Tinte des Untertitels beginnt
      const off = nm.inkBox.y - nm.y; const y = s.inkBox.y + s.inkBox.h + 0.5 * (W / 210) / H - off; return ws(coverLayout(inp({ subtitle: { y: 0.4 }, name: { y } }))); })(),
    margin: ws(coverLayout(inp({ name: { x: 0.004, y: 0.6 } }))),
    outside: ws(coverLayout(inp({ name: { x: -0.05, y: 0.6 } }))),
    blockersOutside: coverExportBlockers(coverLayout(inp({ name: { x: -0.05, y: 0.6 } }))).map(w => w.kind + ':' + w.fieldId),
    widebox: ws(coverLayout(inp({ name: { x: 0.09, w: 1.2, y: 0.6 } }))),   // Textfeld ragt rechts aus der Seite, Text selbst nicht
    defaults: Object.fromEntries(COVER_TEMPLATES.map(t => [t.id, ws(coverLayout(coverInputFromConfig({ title: 'Unsere liebsten Familienrezepte', subtitle: 'Gesammelt in Basel seit 1998', author: 'Yanis Keusch', cover: { v: 2, mode: 'template', templateId: t.id, date: '2026-10-15', showDate: true, fields: { title: { color: '#252720' } } } })))])),
  };
  // Automatisch ausrichten
  const al = (fields, texts) => { const i = inp(fields, null, texts); const r = coverAutoAlign(i.v2, i); const after = coverLayout(Object.assign({}, i, { v2: r.model }));
    return { moves: r.moves, unresolved: r.unresolved, after: ws(after), fields: r.model.fields }; };
  R.align = {
    titleLogo: al({ title: { y: 0.06 } }),
    titleSub: al({ title: { y: 0.3 }, subtitle: { y: 0.31 } }),
    rotated: al({ title: { y: 0.3 }, subtitle: { y: 0.31, rot: 12 } }),
    none: al({}),
  };
  return R;
}"""

FONT_DELAY_JS = r"""async () => {
  // frische Seite, Lilita noch nicht geladen: Hinweise ohne belastbare Messung zurueckhalten
  const i = coverInputFromConfig({ title: 'Meine Rezepte', subtitle: 'Familienküche', author: 'Yanis', showLogo: true, cover: { v: 2, mode: 'template', templateId: 'pop', date: '2026-10-15', showDate: true, fields: { title: { font: 'Archivo', y: 0.3 }, subtitle: { y: 0.31 } } } });
  const loaded0 = document.fonts.check("900 40px 'Archivo'");
  const L0 = coverLayout(i);
  await coverEnsureFonts();
  const L1 = coverLayout(i);
  return { loaded0, pending0: L0.fontsPending, w0: L0.warnings.filter(w => w.kind === 'overlap').length, pending1: L1.fontsPending, w1: L1.warnings.filter(w => w.kind === 'overlap').map(w => w.fieldId) };
}"""


async def teil_cover(pw):
    print('\n===== Teil A: Cover =====')
    b, c = await open_ctx(pw, 1200, 900); page = await c.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    # Font-Ladeverzoegerung: Archivo kommt erst nach 2,5 s an
    async def langsam(route):
        await asyncio.sleep(8); await route.continue_()
    await page.route('**/archivo.woff2', langsam)
    await page.goto(URL, wait_until='commit')
    await page.wait_for_function("typeof coverLayout === 'function' && typeof coverAutoAlign === 'function'")
    fd = await page.evaluate(FONT_DELAY_JS)
    if not fd['loaded0']:
        check('Font-Ladeverzoegerung: waehrend die Schrift laedt, keine Ueberlappungshinweise (fontsPending)', fd['pending0'] and fd['w0'] == 0, fd)
    else:
        check('Font-Ladeverzoegerung simuliert (Archivo beim ersten Layout noch nicht geladen)', False, fd)
    check('Font-Ladeverzoegerung: nach dem Laden echte Ueberlappung erkannt', not fd['pending1'] and 'subtitle' in fd['w1'], fd)
    r = await page.evaluate(COVER_JS)
    wm = r['wm']
    check('Wortmarke: WORDMARK_INK = gerasterte Pfadflaeche (±0,5 Einheiten)', all(abs(wm[k] - wm['def'][k]) <= 0.5 for k in ('x0', 'y0', 'x1', 'y1')), wm)
    for n, p in r['pix'].items():
        d, i = p['drawn'], p['ink']
        check(f'Tinte = gezeichnete Pixel ({n}, ±2 px)', all(abs(a - b2) <= 2 for a, b2 in zip(d, i)), p)
    nr = r['near']
    check('Fehlalarm behoben: Titel unter der Wortmarke, Container ueberlappen, Tinte hat Abstand -> keine Warnung',
          nr['containerOverlapPx'] > 0 and nr['gapMm'] >= 1 and not any(x.startswith('overlap') for x in nr['ink']) and any(x.startswith('overlap:logo') for x in nr['box']), nr)
    re_ = r['real']
    check('echt: Titel ueber der Wortmarke -> overlap Logo/Titel', 'overlap:logo/title' in re_['titleLogo'], re_['titleLogo'])
    check('echt: Titel und Untertitel uebereinander -> overlap', any(x.startswith('overlap:subtitle/title') for x in re_['titleSub']), re_['titleSub'])
    check('echt: Name und weitere Zeile -> overlap', any(x.startswith('overlap:extra1/name') for x in re_['nameExtra']), re_['nameExtra'])
    check('echt: 0,5 mm sichtbarer Abstand -> «berührt fast»', 'overlap:name/subtitle~' in re_['nearPair'], re_['nearPair'])
    check('Druckbereich: Text 0,8 mm vom Rand -> margin (sperrt nicht)', 'margin:name' in re_['margin'] and not any(x.startswith('outside') for x in re_['margin']), re_['margin'])
    check('ausserhalb: Text ueber den Rand -> outside und sperrt den Export', 'outside:name' in re_['outside'] and 'outside:name' in re_['blockersOutside'], re_['outside'])
    check('breites Textfeld ueber den Rand, Text innen -> keine Warnung', not re_['widebox'], re_['widebox'])
    bad = {k: v for k, v in re_['defaults'].items() if v}
    check('alle 15 Vorlagen mit langen Texten: keine Hinweise', not bad, bad)
    a = r['align']
    t = a['titleLogo']
    check('Ausrichten Titel/Logo: geloest, nur der Titel bewegt, eine Achse, unter 30 mm',
          not t['after'] and [m['id'] for m in t['moves']] == ['title'] and (abs(t['moves'][0]['dxMm']) < 0.05 or abs(t['moves'][0]['dyMm']) < 0.05) and max(abs(t['moves'][0]['dxMm']), abs(t['moves'][0]['dyMm'])) < 30, t)
    check('Ausrichten: keine Text-, Schrift- oder Breitenaenderung', all(set(f.keys()) <= {'x', 'y', 'w', 'text'} and 'fontPt' not in f for f in t['fields'].values()) and 'w' not in t['fields'].get('title', {}), t['fields'])
    t = a['titleSub']
    check('Ausrichten Titel/Untertitel: Untertitel nach unten (Reihenfolge bleibt), danach ohne Hinweis', not t['after'] and t['moves'] and t['moves'][0]['id'] == 'subtitle' and t['moves'][0]['dyMm'] > 0 and 'title' not in [m['id'] for m in t['moves']], t)
    yy = {k: v.get('y') for k, v in t['fields'].items()}
    check('Ausrichten: Untertitel bleibt unter dem Titel, Name bleibt ueber dem Titel (wie vorher sichtbar)', yy.get('title', 0) < yy.get('subtitle', 1) and yy.get('name', 0) < yy.get('title', 1), yy)
    t = a['rotated']
    check('Ausrichten gedreht: gedrehtes Feld nicht bewegt, Erklaerung «gedreht»', 'subtitle' not in [m['id'] for m in t['moves']] and any(u['reason'] == 'gedreht' and u['id'] == 'subtitle' for u in t['unresolved']), t)
    check('Ausrichten ohne Konflikt: nichts verschoben', not a['none']['moves'] and not a['none']['unresolved'], a['none'])
    check('Teil A: keine Seitenfehler', not errs, errs[:3])
    await b.close()


EDITOR_SETUP = """() => { saveCookbookConfig({ title: 'Meine Rezepte', subtitle: 'Familienküche aus Basel', author: 'Yanis', chapters: [], items: state.recipes.slice(0, 1).map(r => ({ recipeId: r.id, chapterId: '' })), showLogo: true,
  cover: { v: 2, mode: 'template', templateId: 'pop', date: '2026-10-15', showDate: true, fields: { title: { y: 0.3 }, subtitle: { y: 0.31 }, name: { y: 0.6 } } } });
  state.view = 'cookbook'; state.cookbookStep = 2; render(); }"""


async def teil_editor(pw):
    print('\n===== Teil A2: Cover-Editor =====')
    for w, h in ((1200, 900), (390, 844)):
        b, c = await open_ctx(pw, w, h); page = await c.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page)
        await page.evaluate(open(SEED_PATH).read())
        await page.evaluate(EDITOR_SETUP)
        await page.wait_for_selector('.ce-warnbar', timeout=10000)
        await page.evaluate('() => coverEnsureFonts()')
        await page.evaluate("() => { coverRefresh(); }")
        await page.wait_for_function("document.querySelector('.ce-warnbar') && /überlappt/.test(document.querySelector('.ce-warnbar').textContent)")
        check(f'[{w}px] Editor: echte Ueberlappung angezeigt mit «Automatisch ausrichten»', await page.locator('.ce-align-btn').count() == 1)
        m0 = await page.evaluate("() => JSON.stringify(ce.model.fields)")
        await page.evaluate("() => document.querySelector('.ce-stage').scrollIntoView({ block: 'start' })")
        await page.screenshot(path=os.path.join(OUTDIR, f'editor_{w}_vorher.png'))
        await page.click('.ce-align-btn')
        await page.wait_for_selector('.ce-align-msg')
        msg = await page.inner_text('.ce-align-msg')
        st = await page.evaluate("() => ({ warns: ce.layout.warnings.map(x => x.kind + ':' + x.fieldId), undo: ce.undo.length, f: ce.model.fields, saved: JSON.stringify(cookbookGetRaw().cover.fields) })")
        check(f'[{w}px] Ausrichten: Hinweis verschwindet, Meldung nennt Feld, Richtung und Rueckgaengig', not st['warns'] and 'Untertitel' in msg and 'nach unten' in msg and 'Rückgängig' in msg, msg + ' ' + str(st['warns']))
        check(f'[{w}px] Ausrichten: Name (weit unten, kein Konflikt) bleibt stehen', abs(st['f'].get('name', {}).get('y', 0) - 0.6) < 1e-6, st['f'])
        check(f'[{w}px] Ausrichten: gespeichert, Undo-Stapel gefuellt', st['undo'] >= 1 and st['saved'] == json.dumps(st['f'], separators=(',', ':'), ensure_ascii=False), st)
        await page.screenshot(path=os.path.join(OUTDIR, f'editor_{w}_nachher.png'))
        await page.click('[data-ce="undo"]')
        await page.wait_for_function("() => ce.layout.warnings.some(x => x.kind === 'overlap')")
        m1 = await page.evaluate("() => JSON.stringify(ce.model.fields)")
        check(f'[{w}px] Rueckgaengig stellt die Positionen wieder her (Warnung wieder da)', json.loads(m1) == json.loads(m0), m1)
        # Verschieben per Tastatur-/Knopf-Aenderung: Warnung aktualisiert sich
        await page.evaluate("() => ceMoveBy('subtitle', 0, 0.15)")
        await page.wait_for_function("() => !ce.layout.warnings.some(x => x.kind === 'overlap')")
        bar = await page.locator('.ce-warnbar').count()
        check(f'[{w}px] Nach Verschieben: Warnung verschwindet sofort', bar == 0, bar)
        await page.evaluate("() => ceMoveBy('subtitle', 0, -0.15)")
        await page.wait_for_function("() => ce.layout.warnings.some(x => x.kind === 'overlap') && document.querySelector('.ce-warnbar')")
        check(f'[{w}px] Zurueckschieben: Warnung kommt zurueck', True)
        # «Im Cover bearbeiten» aus der Pruefung
        await page.evaluate("() => { state.cookbookStep = 3; render(); const d = document.createElement('button'); d.type = 'button'; d.dataset.coverEdit = 'subtitle'; d.id = 'h4edit'; d.style.cssText = 'position:fixed;top:0;left:0;z-index:99999'; d.textContent = 'Im Cover bearbeiten'; document.body.appendChild(d); }")
        await page.click('#h4edit')
        await page.wait_for_function("() => state.cookbookStep === 2 && typeof ce !== 'undefined' && ce.sel === 'subtitle' && document.querySelector('.ce-root, .cover-picker.ce')")
        check(f'[{w}px] «Im Cover bearbeiten» oeffnet Gestalten mit ausgewaehltem Feld', True)
        check(f'[{w}px] Editor: keine Seitenfehler', not errs, errs[:3])
        await b.close()


async def teil_pdf():
    print('\n===== Teil B: PDF =====')
    shift = os.environ.get('SAVORA_PDF_TEXT_SHIFT_MM', '0')
    print('     Linux-Simulation SAVORA_PDF_TEXT_SHIFT_MM =', shift)
    async with PdfSession(OUTDIR) as s:
        fx = {r['id']: r for r in s.fx['recipes']}
        pre = await s.page.evaluate("() => [pdfLastPageCounts, pdfLastPlan]")
        check('vor dem ersten Rendern: keine Seitenzahl (null)', pre == [None, None], pre)
        faelle = {'pdf_kurz': 'kurz, ohne Bild', 'pdf_sloppy': 'knapp zu lang (Sloppy Joe)', 'pdf_vielezutaten': 'sehr lange Zutatenliste', 'pdf_zweiseiten': 'lange Zubereitung',
                  'pdf_langerschritt': 'sehr langer Schritt', 'pdf_hochformat': 'Hochformatbild', 'pdf_querformat': 'Querformatbild', 'pdf_notizen': 'lange Quelle/Notizen',
                  'pdf_langtitel': 'lange Ueberschrift', 'pdf_dreiseiten': 'mehr als drei Seiten'}
        texte = {}
        for stil in TEMPLATE_IDS:
            for rid, was in faelle.items():
                ex = await s.single(rid, stil, 'off', name=f'einzel_{rid[4:]}_{stil}_s{shift}')
                k = ex.seiten(); pc = await s.page.evaluate("() => ({ c: Array.from(pdfLastPageCounts || []), p: pdfLastPlan })")
                befunde = alle_pruefungen(ex, [fx[rid]])
                relevant = {kk: v for kk, v in befunde.items() if v and kk in ('raender', 'ueberlappung', 'schrift', 'wortbruch', 'ueberschriften', 'restseiten', 'bilder', 'text', 'fortsetzung', 'seitenzahl')}
                print(f'  [{stil}] {rid} ({was}): {k} Seite(n), Plan: {pc["p"]["recipes"][0]["plan"] if pc["p"] else "-"}')
                check(f'[{stil}] {was}: pdfLastPageCounts = PDF-Seiten', pc['c'] == [[rid, k]] and pc['p']['totalPages'] == k and pc['p']['recipes'][0]['pages'] == k, pc['c'])
                check(f'[{stil}] {was}: keine Befunde (Raender, Ueberlappung, Schrift >= 10/8,5 pt, Wortbruch, Ueberschriften, Restseite, Bilder, Text, Fortsetzung)', not relevant, json.dumps({kk: v[:2] for kk, v in relevant.items()}, ensure_ascii=False)[:500])
                if rid == 'pdf_kurz': check(f'[{stil}] kurzes Rezept: 1 Seite', k == 1, k)
                if rid == 'pdf_sloppy': check(f'[{stil}] Sloppy Joe: 1 Seite (vorher 2)', k == 1, pc['p']['recipes'][0]['plan'])
                if k > 1:
                    t2 = flach(ex.text(first=2))
                    title = fx[rid]['title']
                    check(f'[{stil}] {was}: Folgeseite nennt Rezeptname und «Fortsetzung»', 'fortsetzung' in t2.lower() and _ascii(title)[:25] in _ascii(t2), t2[:120])
                texte[(stil, rid)] = _ascii(flach(ex.text()).replace('Fortsetzung', '')).replace('fortsetzung', '')   # v87: Fortsetzungs-Titel (Gruppen ueber zwei Seiten) zaehlen nicht als Inhalt; Prise Pop verteilt lange Zutatenlisten auf zwei Spalten statt zwei Seiten
                if rid in ('pdf_sloppy', 'pdf_zweiseiten', 'pdf_hochformat', 'pdf_langtitel') or k >= 3:
                    ex.render(80)
        for rid, was in faelle.items():
            a, bb = texte.get((TEMPLATE_IDS[0], rid), ''), texte.get((TEMPLATE_IDS[-1], rid), '')
            # gleicher Inhalt: Woerter des einen Stils im anderen (Fusszeile/Seitenzahl ignoriert)
            check(f'beide Stile gleicher Inhalt: {was}', abs(len(a) - len(bb)) <= max(40, len(a) * 0.03), f'{len(a)} vs {len(bb)}')
        # Kochbuch
        for stil in TEMPLATE_IDS:
            ex = await s.book('ref', stil, 'off', datei=f'buch_ref_{stil}_s{shift}')
            pc = await s.page.evaluate("() => ({ c: Object.fromEntries(pdfLastPageCounts || []), p: pdfLastPlan })")
            dom = seiten_pro_rezept(ex)
            print(f'  [{stil}] Kochbuch: {ex.seiten()} Seiten, je Rezept {pc["c"]}')
            check(f'[{stil}] Kochbuch: pdfLastPageCounts = Seiten je Rezept im PDF', pc['c'] == dom and pc['p']['kind'] == 'cookbook' and pc['p']['totalPages'] == ex.seiten(), f'{pc["c"]} vs {dom}')
            befunde = alle_pruefungen(ex)
            relevant = {kk: v for kk, v in befunde.items() if v and kk in ('raender', 'ueberlappung', 'schrift', 'restseiten', 'inhaltsverzeichnis', 'fortsetzung')}
            check(f'[{stil}] Kochbuch: keine Befunde', not relevant, json.dumps({kk: v[:2] for kk, v in relevant.items()}, ensure_ascii=False)[:500])
            ex.render(60)
        check('PDF: keine Seitenfehler', not s.fehler, s.fehler[:3])


async def main():
    async with async_playwright() as pw:
        await teil_cover(pw)
        await teil_editor(pw)
    await teil_pdf()
    print('\nFEHLER:' if FAIL else '\nALLE OK', FAIL if FAIL else '')
    sys.exit(1 if FAIL else 0)

asyncio.run(main())
