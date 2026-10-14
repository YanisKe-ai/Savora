"""Pruefwerkzeug fuer den PDF-Export (wiederverwendbar, nur Tests, kein App-Code).

Was es kann
  - isolierte Testrezepte (tests/fixtures/pdf_rezepte.json) in die App laden (nie produktive Daten: jeder Lauf nutzt ein frisches Browserprofil)
  - Einzelrezept-PDF (buildSinglePdf) und Kochbuch-PDF (buildCookbookPdf) ueber die ECHTE Pipeline erzeugen und die erzeugten PDF-Bytes speichern
  - waehrend des Exports den DOM jeder Druckseite (#printRoot) vermessen (Schriftgroessen, Woerter, Ueberschriften, Bilder, Fusszeile)
  - Seiten als PNG rendern (pdftoppm), Text extrahieren (pdftotext), pdfinfo lesen, Kontaktbogen bauen (Pillow)
  - automatische Pruefungen (Funktionen pruefe_*), jeweils Liste von Befunden {id, seite, text}

Umgebungsvariablen: SAVORA_TEST_PORT (Standard 16500), SAVORA_TEST_OUT (Ausgabeordner).
  SAVORA_PDF_IDS=A,B            Stil-Liste (alter Code vor 0.75)
  SAVORA_PDF_TEXT_SHIFT_MM=0.15 Linux-Simulation (gemessen auf 85798bb: 0.15 reproduziert «Quelle: sichtbare Tinte 5 px, erwartet 10 px» wie die CI, 0.3 ca. 130 Befunde, 2 extrem): der Text jeder Druckseite wird im Klon fuer html2canvas um diesen Betrag nach unten versetzt (position:relative; top),
                                Layout und DOM-Messung bleiben unveraendert. Zeigt lokal die K01a-Befunde der CI (Text sitzt dort tiefer, Unterlaengen werden abgeschnitten).
                                Beispiel: SAVORA_PDF_TEXT_SHIFT_MM=0.15 SAVORA_TEST_PORT=25900 python tests/test_pdf_ausgabe.py
Benutzung als Programm:  python tests/pdf_harness.py <ausgabeordner> [stil ...]   (erzeugt die Baseline-Exporte samt Bildern und Befunden)
Die Messung der Seiten passiert unmittelbar vor html2canvas (jede Seite einmal, im fertig geladenen Zustand mit Schriften und Bildern).
Sollte eine spaetere Version die Rastermaschine austauschen, muss nur HOOK_JS angepasst werden."""
import asyncio, base64, hashlib, io, json, os, re, shutil, subprocess, sys, time
os.environ.setdefault('SAVORA_TEST_PORT', '16500')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *   # noqa: E402,F401  (startet den lokalen Webserver, liefert TESTS, ROOT, OUT, open_ctx, goto)
from PIL import Image, ImageDraw   # noqa: E402

FIXTURE_PFAD = os.path.join(TESTS, 'fixtures', 'pdf_rezepte.json')
# Zentrale Liste der PDF-Stile: TEMPLATE_IDS, T0 (erster/Standard), T1 (zweiter) kommen aus tests/common.py (dort wegen der Browser-Globals __T0/__T1) und stehen hier per Stern-Import bereit.
# SAVORA_PDF_IDS=A,B erlaubt Laeufe gegen alten Code (vor 0.75).
STILE = tuple(TEMPLATE_IDS)
NAEHRWERT_STUFEN = ('off', 'compact', 'full')
COVER_VORLAGEN = ['pop', 'lieblingsbuch', 'tomate', 'salbei', 'nachtkueche', 'citrus', 'bistro', 'garten', 'sonnenkueche', 'ofenglueck', 'savora-01-pasta-band', 'savora-02-geschmacksschichten', 'savora-03-scherenschnitt-tafel', 'savora-04-eine-prise', 'savora-05-tischrunde']
# Mindestgroessen (pt) auf A4 nach Auftrag: Haupttext 10, Sekundaertext 8,5
MIN_HAUPT_PT, MIN_SEKUNDAER_PT = 10.0, 8.5
RESTSEITE_MIN_MM = 60          # letzte Seite eines mehrseitigen Rezepts: mindestens so viel Inhaltshoehe (Heuristik, siehe README unten)
CSS_AUS = "::-webkit-scrollbar{display:none!important} html{scrollbar-width:none!important}"


def lade_fixtures():
    return json.load(open(FIXTURE_PFAD, encoding='utf-8'))


# ---------- Testbilder (Pillow, deterministisch, mit Pfeil und Kreis, damit Verzerrung sichtbar ist) ----------
def _bild(w, h, farbe):
    im = Image.new('RGB', (w, h), farbe)
    d = ImageDraw.Draw(im)
    for i in range(0, w, max(w // 12, 20)): d.line([(i, 0), (i, h)], fill=(255, 255, 255), width=max(w // 300, 1))
    r = min(w, h) // 4
    d.ellipse([w // 2 - r, h // 2 - r, w // 2 + r, h // 2 + r], outline=(255, 255, 255), width=max(w // 100, 2))
    d.polygon([(w // 2, h // 2 - r // 2), (w // 2 + r // 2, h // 2 + r // 2), (w // 2 - r // 2, h // 2 + r // 2)], fill=(255, 220, 90))
    d.rectangle([0, 0, w // 8, h // 8], fill=(20, 20, 20))
    buf = io.BytesIO(); im.save(buf, 'JPEG', quality=88)
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()

def testbilder():
    return {
        'landscape': _bild(1800, 1200, (190, 90, 45)), 'portrait': _bild(1200, 1800, (70, 110, 150)), 'square': _bild(1400, 1400, (110, 150, 80)),
        'wide': _bild(2400, 800, (150, 90, 140)),
        'broken': 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB',   # gueltiger Anfang, danach abgeschnitten
    }


SEED_JS = """async (arg) => {
  const [recipes, imgs, nutriIds] = arg;
  for (const f of recipes) {
    const r = Object.assign(emptyRecipe(), f);
    Object.keys(r).filter(k => k.startsWith('_')).forEach(k => delete r[k]);
    r.image = f._img ? imgs[f._img] : null; r.updatedAt = Date.now();
    await dbPut(r);
  }
  await loadRecipes();
  const status = {};
  for (const id of nutriIds) {
    const r = state.recipes.find(x => x.id === id);
    try {
      await recalculateAndStoreNutrition(r); let st = (await nutritionStatusFor(r)).status;
      if (st !== 'calculated') {   // nur Testdaten: Ergebnis als vollstaendig und aktuell markieren, damit der PDF-Export die Naehrwerte-Box zeichnet
        const res = await dbGetNutritionResult(r.id);
        if (res && res.nutrientsPerPortion && res.nutrientsPerPortion.energyKcal) { res.ingredientHash = hashIngredientsForNutrition(r.ingredients, Number(r.servings) > 0 ? Number(r.servings) : 1); res.unresolvedCount = 0; res.relevantCount = Math.max(1, res.relevantCount || 0); await dbPutNutritionResult(res); st = (await nutritionStatusFor(r)).status + '*'; }
      }
      status[id] = st;
    } catch (e) { status[id] = 'fehler: ' + e.message; }
  }
  return status;
}"""

# Wird beim Aufruf von html2canvas (je Seite genau einmal) ausgefuehrt: misst die Seite im DOM, ohne sie zu veraendern.
HOOK_JS = r"""() => {
  if (window.__pdfCap) return true;
  const cap = window.__pdfCap = { on: false, sections: [] };
  const MM = 96 / 25.4;
  const q = (v) => Math.round(v * 100) / 100;
  const HEAD = 'h2,h3,h4,h5,.pv-label,.pv-step-heading,.pv-ing-group,[class*="heading"]';
  const analyze = (sec) => {
    const sr = sec.getBoundingClientRect();
    const rel = (r) => ({ x: q((r.left - sr.left) / MM), y: q((r.top - sr.top) / MM), r: q((r.right - sr.left) / MM), b: q((r.bottom - sr.top) / MM) });
    const isFoot = (e) => !!e.closest('footer,[class*="foot"]');
    const isHead = (e) => e.matches(HEAD);
    let inkCv = null;
    const els = [], blocks = [], words = [], clipped = [], images = [], headings = [], emptyBlocks = [], sig = {};
    let lineCount = 0, chars = 0, cTop = 1e9, cBot = 0;
    const all = Array.from(sec.querySelectorAll('*'));
    all.forEach((e) => {
      const own = Array.from(e.childNodes).filter(n => n.nodeType === 3 && n.textContent.trim()).map(n => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      if (!own) return;
      const rc = e.getBoundingClientRect();
      if (!rc.width || !rc.height) return;
      const fsPx = parseFloat(cs.fontSize), fsPt = q(fsPx * 0.75);
      const lh = cs.lineHeight === 'normal' ? 1.2 : q(parseFloat(cs.lineHeight) / fsPx);
      const foot = isFoot(e);
      const lr = []; const rg = document.createRange();
      Array.from(e.childNodes).filter(n => n.nodeType === 3 && n.textContent.trim()).forEach(n => { rg.selectNodeContents(n); Array.from(rg.getClientRects()).forEach(r => { if (r.width > 0.5 && r.height > 0.5 && lr.length < 12) lr.push([q((r.left - sr.left) / MM), q((r.top - sr.top) / MM), q((r.right - sr.left) / MM), q((r.bottom - sr.top) / MM)]); }); });
      let inkMm = 0;
      if (lr.length === 1) { try { const cv = inkCv || (inkCv = document.createElement('canvas').getContext('2d')); cv.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + fsPx + 'px ' + cs.fontFamily; const tx = cs.textTransform === 'uppercase' ? own.toUpperCase() : own; const mt = cv.measureText(tx); inkMm = q((mt.actualBoundingBoxAscent + mt.actualBoundingBoxDescent) / MM); } catch (e) { inkMm = 0; } }
      let clipBox = 0; { let a = e; while (a && a !== sec.parentElement) { const ac = getComputedStyle(a); if (/(hidden|clip)/.test(ac.overflowX + ac.overflowY)) { clipBox = q(a.clientHeight / fsPx); break; } a = a.parentElement; } }
      const b = Object.assign({ i: blocks.length, inkMm, clipBox, tt: cs.textTransform, lr, tag: e.tagName.toLowerCase(), cls: String(e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className), text: own.slice(0, 70), n: own.length, fsPt, fw: cs.fontWeight, ff: cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(), lh, foot, head: isHead(e), ov: cs.overflow }, rel(rc));
      blocks.push(b); els.push(e);
      // Beschnitten? (eigene Box ragt ueber Seite oder ueber einen Vorfahren mit overflow:hidden hinaus)
      let a = e.parentElement;
      while (a && a !== sec.parentElement) {
        const ac = getComputedStyle(a);
        if (/(hidden|clip)/.test(ac.overflow + ac.overflowY)) { const ar = a.getBoundingClientRect(); if (rc.bottom > ar.bottom + 1 || rc.top < ar.top - 1) { clipped.push({ text: own.slice(0, 40), by: String(a.className).slice(0, 30) }); break; } }
        a = a.parentElement;
      }
      if (rc.bottom > sr.bottom + 0.5 || rc.top < sr.top - 0.5) clipped.push({ text: own.slice(0, 40), by: 'seite' });
      if (e.scrollHeight > e.clientHeight + 1 && /(hidden|clip)/.test(cs.overflow + cs.overflowY) && e.clientHeight > 0) clipped.push({ text: own.slice(0, 40), by: 'eigene-hoehe' });
      if (!foot) { lineCount += Math.max(1, Math.round(rc.height / (fsPx * lh))); chars += own.length; cTop = Math.min(cTop, b.y); cBot = Math.max(cBot, b.b); }
      const key = b.tag + '.' + b.cls;
      if (!sig[key]) sig[key] = { fs: fsPt, fw: cs.fontWeight, ff: b.ff, lh, color: cs.color, ls: cs.letterSpacing, tt: cs.textTransform, ta: cs.textAlign, mt: cs.marginTop, mb: cs.marginBottom };
    });
    blocks.forEach((b, k) => { b.anc = []; let a = els[k].parentElement; while (a && a !== sec) { const j = els.indexOf(a); if (j >= 0) b.anc.push(j); a = a.parentElement; } });
    // Woerter, die mitten im Wort umbrechen
    const range = document.createRange();
    const walker = document.createTreeWalker(sec, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const el = node.parentElement; const cs = el && getComputedStyle(el);
      if (!cs || cs.display === 'none' || !node.textContent.trim()) continue;
      const fsPx = parseFloat(cs.fontSize); const re = /[^\s ]+/g; let m;
      while ((m = re.exec(node.textContent))) {
        if (m[0].length < 3) continue;
        range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
        const rects = Array.from(range.getClientRects()).filter(r => r.width > 0);
        if (rects.length < 2) continue;
        const tops = rects.map(r => r.top); const lines = tops.filter((t, i) => tops.findIndex(u => Math.abs(u - t) < fsPx * 0.5) === i).length;
        if (lines > 1) words.push({ w: m[0].slice(0, 60), art: /[-–‑\/­]/.test(m[0]) ? 'trennzeichen' : (/:\/\/|www\.|\.[a-z]{2,}\//i.test(m[0]) ? 'url' : 'mitten'), cls: String(el.className).slice(0, 30), foot: isFoot(el) });
      }
    }
    // Ueberschriften: allein am Ende? leere Rubrik?
    const hasText = (n) => { if (n.nodeType === 3) return !!n.textContent.trim(); if (n.nodeType !== 1 || isFoot(n) || isHead(n)) return false;
      return Array.from(n.querySelectorAll('*')).concat([n]).some(x => !isHead(x) && Array.from(x.childNodes).some(c => c.nodeType === 3 && c.textContent.trim())); };
    sec.querySelectorAll(HEAD).forEach((h) => {
      if (isFoot(h) || !h.textContent.trim()) return;
      const hr = h.getBoundingClientRect(); const hb = rel(hr);
      let following = false; let n = h.nextSibling;
      while (n) { if (hasText(n)) { following = true; break; } n = n.nextSibling; }
      // Geometrie: Text unterhalb, der sich waagrecht mit der Ueberschrift ueberlappt
      let below = following;
      if (!following) {
        blocks.forEach((b) => { if (!b.foot && !b.head && b.y >= hb.y - 0.5 && b.b > hb.b - 0.2 && Math.min(b.r, hb.r) - Math.max(b.x, hb.x) > Math.min(b.r - b.x, hb.r - hb.x) * 0.3) below = true; });
      }
      headings.push({ text: h.textContent.trim().slice(0, 50), cls: String(h.className).slice(0, 30), y: hb.y, b: hb.b, following, below });
    });
    sec.querySelectorAll('[class*="extra"],[class*="tips"],[class*="notes"],[class*="nutri"],[class*="source"]').forEach((e) => { if (!e.textContent.trim() && !e.querySelector('img,svg')) emptyBlocks.push(String(e.className).slice(0, 40)); });
    sec.querySelectorAll('img').forEach((im) => {
      const rc = im.getBoundingClientRect(); const cs = getComputedStyle(im);
      images.push({ x: q((rc.left - sr.left) / MM), y: q((rc.top - sr.top) / MM), cls: String(im.className).slice(0, 30), nw: im.naturalWidth, nh: im.naturalHeight, w: q(rc.width / MM), h: q(rc.height / MM), fit: cs.objectFit, ok: im.complete && im.naturalWidth > 0, ppi: rc.width ? Math.round(im.naturalWidth / (rc.width / 96)) : 0, src: (im.getAttribute('src') || '').slice(0, 20), cover: !!im.closest('[data-page-kind="cover"]') });
    });
    const foot = Array.from(sec.querySelectorAll('footer,[class*="foot"]')).map(f => Object.assign({ text: f.textContent.trim().slice(0, 80), scrollH: f.scrollHeight, clientH: f.clientHeight, ov: getComputedStyle(f).overflow }, rel(f.getBoundingClientRect())));
    const tocRows = Array.from(sec.querySelectorAll('[data-toc-id]')).map(r => ({ id: r.dataset.tocId, text: r.textContent.trim().replace(/\s+/g, ' '), page: (r.lastElementChild && /^\d+$/.test(r.lastElementChild.textContent.trim())) ? r.lastElementChild.textContent.trim() : ((r.textContent.match(/(\d+)\s*$/) || [])[1] || '') }));
    return { kind: sec.dataset.pageKind || '', recipeId: sec.dataset.recipeId || '', title: sec.dataset.title || '', cls: String(sec.className), w: q(sr.width / MM), h: q(sr.height / MM), scrollH: q(sec.scrollHeight / MM),
      blocks, words, clipped, images, headings, emptyBlocks, foot, tocRows, sig, lineCount, chars, cTop: cTop === 1e9 ? 0 : cTop, cBot, text: sec.innerText.replace(/\s+/g, ' ').trim() };
  };
  window.__pdfAnalyze = analyze;
  const install = () => {
    const orig = window.html2canvas;
    if (typeof orig !== 'function' || orig.__wrapped) return false;
    const w = function (el, o) { if (cap.on) { try { cap.sections.push(analyze(el)); } catch (e) { cap.sections.push({ fehler: String(e), kind: 'fehler', blocks: [], words: [], clipped: [], images: [], headings: [], emptyBlocks: [], foot: [], tocRows: [], sig: {} }); } }
      // Simulation von Linux-Textmetriken (SAVORA_PDF_TEXT_SHIFT_MM): erst im Klon fuer html2canvas, also verschiebt sich nur das Rastern, nicht Layout und Messung
      const shift = window.__pdfShiftMm || 0; let args = arguments;
      if (shift && o) {
        const own = o.onclone; const px = shift * MM;
        args = [el, Object.assign({}, o, { onclone: function (d) {
          if (own) own.apply(this, arguments);
          d.querySelectorAll('*').forEach((e) => {
            if (!Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim())) return;
            const cs = d.defaultView.getComputedStyle(e);
            if (cs.position === 'static') { e.style.position = 'relative'; e.style.top = px + 'px'; }
            else if (cs.top !== 'auto') e.style.top = ((parseFloat(cs.top) || 0) + px) + 'px';
          });
        } })];
      }
      return orig.apply(this, args); };
    w.__wrapped = true; window.html2canvas = w; return true;
  };
  cap.install = install;
  return true;
}"""

BYTES_JS = """async (res) => { const u = new Uint8Array(await res.blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return [btoa(s), res.filename]; }"""


class Export:
    """Ergebnis eines Exports: PDF-Pfad, gemessene Seiten (DOM) und Metadaten."""
    def __init__(self, name, pdf, dom, sekunden, optionen):
        self.name, self.pdf, self.dom, self.sekunden, self.optionen = name, pdf, dom, sekunden, optionen
        self._bilder = None
    # --- poppler ---
    def info(self): return pdfinfo(self.pdf)
    def seiten(self): return self.info()['seiten']
    def text(self, raw=True, first=None, last=None): return pdftext(self.pdf, raw, first, last)
    def render(self, dpi=100):
        if self._bilder is None: self._bilder = {}
        if dpi not in self._bilder: self._bilder[dpi] = rendere_seiten(self.pdf, dpi, '' if dpi == 100 else f'_h{dpi}')
        return self._bilder[dpi]
    def kontaktbogen(self, pfad=None, seiten=None, proSeite=5, breite=330):
        return kontaktbogen(self.render(), pfad or self.pdf[:-4] + '_bogen.png', seiten, proSeite, breite)


class PdfSession:
    """async with PdfSession(out) as s: await s.single('pdf_manti', T0, 'compact') ..."""
    def __init__(self, out=None, breite=1000, hoehe=900):
        self.out = out or os.path.join(OUT, 'pdf'); os.makedirs(self.out, exist_ok=True); self.w, self.h = breite, hoehe
        self.fx = lade_fixtures(); self.naehrwerte_status = {}; self.fehler = []
    async def __aenter__(self):
        self._pw = await async_playwright().start()
        self.browser, self.ctx = await open_ctx(self._pw, self.w, self.h)
        self.page = await self.ctx.new_page()
        self.page.on('pageerror', lambda e: self.fehler.append(str(e)))
        await goto(self.page)
        await self.page.add_style_tag(content=CSS_AUS)
        await self.page.evaluate("() => document.fonts.ready")
        await self.seed()
        return self
    async def __aexit__(self, *a):
        await self.browser.close(); await self._pw.stop()
    async def seed(self, nur=None):
        verschiebung = float(os.environ.get('SAVORA_PDF_TEXT_SHIFT_MM', '0') or 0)
        rez = [r for r in self.fx['recipes'] if not nur or r['id'] in nur]
        nutri = [r['id'] for r in rez if r.get('_nutri')]
        self.naehrwerte_status = await self.page.evaluate(SEED_JS, [rez, testbilder(), nutri])
        await self.page.evaluate(HOOK_JS)
        await self.page.evaluate('(mm) => { window.__pdfShiftMm = mm; }', verschiebung)
        return self.naehrwerte_status
    async def zustand(self):
        """Fingerabdruck der Rezeptdaten (fuer die Datenerhalt-Pruefung)."""
        return await self.page.evaluate("() => JSON.stringify(state.recipes.map(r => ({ id: r.id, title: r.title, ing: r.ingredients, steps: r.steps, notes: r.notes, tags: r.tags, cat: r.categoryTags, serv: r.servings, mode: r.servingMode || '', src: r.source || null, img: (r.image || '').length + ':' + (r.imageId || '') })).sort((a, b) => a.id.localeCompare(b.id)))")
    async def _erfasse(self, js, arg, name, optionen):
        await self.page.evaluate("async () => { if (typeof ensurePdfLibs === 'function') await ensurePdfLibs(); window.__pdfCap.install(); window.__pdfCap.sections = []; window.__pdfCap.on = true; }")
        t = time.time()
        try:
            b64, fn = await self.page.evaluate("async (a) => { const res = await (" + js + "); if (!res) return [null, null]; return await (" + BYTES_JS + ")(res); }", arg)
        finally:
            dom = await self.page.evaluate("() => { window.__pdfCap.on = false; return window.__pdfCap.sections; }")
        if b64 is None: return Export(name, None, dom, time.time() - t, optionen)
        pfad = os.path.join(self.out, name + '.pdf'); open(pfad, 'wb').write(base64.b64decode(b64))
        ex = Export(name, pfad, dom, time.time() - t, optionen); ex.dateiname = fn
        return ex
    async def single(self, rezept_id, stil=None, naehrwerte='off', name=None):
        stil = stil or T0
        name = name or f'einzel_{rezept_id.replace("pdf_", "")}_{stil}_{naehrwerte}'
        return await self._erfasse("buildSinglePdf(a[0], a[1], { template: a[2] })", [rezept_id, naehrwerte, stil], name, dict(art='einzel', rezept=rezept_id, stil=stil, naehrwerte=naehrwerte))
    async def konfiguriere_buch(self, buch='ref', stil=None, titel=None, name=None, slogan=None, logo=True, cover='pop', datum_zeigen=True, datum='2026-10-14', ids=None):
        stil = stil or T0
        b = self.fx['books'][buch]
        items = [{'recipeId': i, 'chapterId': c} for i, c in b['items']] if ids is None else [{'recipeId': i, 'chapterId': ''} for i in ids]
        cfg = dict(title=b['title'] if titel is None else titel, subtitle=b['subtitle'] if slogan is None else slogan, author=b['author'] if name is None else name,
                   pdfTemplate=stil, chapters=b['chapters'] if ids is None else [], items=items, showLogo=logo, chapterPages=False, cover=dict(v=1, templateId=cover, date=datum, showDate=datum_zeigen))
        await self.page.evaluate("(c) => saveCookbookConfig(c)", cfg)
    async def book(self, buch='ref', stil=None, naehrwerte='off', datei=None, **kw):
        """kw: titel, name (Autor), slogan, logo, cover, datum_zeigen, datum, ids (nur diese Rezepte, ohne Kapitel). datei = Dateiname des PDFs."""
        stil = stil or T0
        await self.konfiguriere_buch(buch, stil, **kw)
        name = datei or f'buch_{buch}_{stil}_{naehrwerte}'
        return await self._erfasse("buildCookbookPdf(a[0], { template: a[1] })", [naehrwerte, stil], name, dict(art='buch', buch=buch, stil=stil, naehrwerte=naehrwerte, **{k: v for k, v in kw.items()}))


# ---------- poppler / Pillow ----------
def pdfinfo(pfad):
    t = subprocess.run(['pdfinfo', pfad], capture_output=True, text=True).stdout
    g = lambda k: (re.search(k + r':\s*(.*)', t) or [None, ''])[1].strip()
    return {'seiten': int(g('Pages') or 0), 'titel': g('Title'), 'groesse': g('Page size'), 'roh': t}

def pdftext(pfad, raw=True, first=None, last=None):
    cmd = ['pdftotext', '-raw' if raw else '-layout']
    if first: cmd += ['-f', str(first), '-l', str(last or first)]
    return subprocess.run(cmd + [pfad, '-'], capture_output=True, text=True).stdout

def rendere_seiten(pfad, dpi=100, zusatz=''):
    stamm = pfad[:-4] + (zusatz or '_s')
    for f in os.listdir(os.path.dirname(pfad)):
        if f.startswith(os.path.basename(stamm)) and f.endswith('.png'): os.remove(os.path.join(os.path.dirname(pfad), f))
    subprocess.run(['pdftoppm', '-r', str(dpi), '-png', pfad, stamm], check=True)
    dat = sorted(f for f in os.listdir(os.path.dirname(pfad)) if f.startswith(os.path.basename(stamm)) and f.endswith('.png'))
    return [os.path.join(os.path.dirname(pfad), f) for f in dat]

def kontaktbogen(bilder, ziel, seiten=None, pro_zeile=5, breite=330):
    """Mehrere Seiten nebeneinander als ein PNG (Seitenzahl unter jeder Seite). seiten: 1-basierte Liste oder None = alle."""
    sel = [(i + 1, b) for i, b in enumerate(bilder) if not seiten or (i + 1) in seiten]
    if not sel: return None
    ims = []
    for n, b in sel:
        im = Image.open(b).convert('RGB'); h = int(im.height * breite / im.width); ims.append((n, im.resize((breite, h), Image.LANCZOS)))
    zeilen = (len(ims) + pro_zeile - 1) // pro_zeile; hh = max(i.height for _, i in ims) + 22
    bogen = Image.new('RGB', (pro_zeile * (breite + 8) + 8, zeilen * hh + 8), (110, 110, 110))
    d = ImageDraw.Draw(bogen)
    for k, (n, im) in enumerate(ims):
        x = 8 + (k % pro_zeile) * (breite + 8); y = 8 + (k // pro_zeile) * hh
        bogen.paste(im, (x, y)); d.text((x + 4, y + im.height + 4), f'Seite {n}', fill=(255, 255, 255))
    bogen.save(ziel); return ziel


# ---------- Befunde ----------
def F(id, seite, text, **kw): return dict(id=id, seite=seite, text=text, **kw)

def _kinds(ex): return [s.get('kind', '') for s in ex.dom]

def pruefe_seitenzahl_gleich_dom(ex):
    """Jede Druckseite = genau eine PDF-Seite (sonst wurde geschnitten)."""
    n, d = ex.seiten(), len(ex.dom)
    return [] if n == d else [F('seiten_geschnitten', 0, f'PDF hat {n} Seiten, gemessen wurden {d} Druckseiten')]

def _streifen(im, lage):
    """Aeusserste Bildzeile/-spalte gegen die 4 Pixel weiter innen: einheitlich abweichend = Streifen am Rand (z. B. nicht ueberdeckte Rasterzeile)."""
    W, H = im.size; n = 0; tot = 0
    if lage in ('oben', 'unten'):
        y0, y1 = (0, 4) if lage == 'oben' else (H - 1, H - 5)
        for x in range(0, W, 2):
            a, b = im.getpixel((x, y0)), im.getpixel((x, y1)); tot += 1
            if sum(abs(a[k] - b[k]) for k in range(3)) > 45: n += 1
    else:
        x0, x1 = (0, 4) if lage == 'links' else (W - 1, W - 5)
        for y in range(0, H, 2):
            a, b = im.getpixel((x0, y)), im.getpixel((x1, y)); tot += 1
            if sum(abs(a[k] - b[k]) for k in range(3)) > 45: n += 1
    return n / max(tot, 1)

def _tinte_hoehe(im, r, dpi, schwelle=90):
    """Hoehe der sichtbaren Tinte (Pixel) in der Zeilenbox r = [x, y, rechts, unten] (mm) und etwas Luft darum."""
    from PIL import ImageChops
    mm = dpi / 25.4; x0, x1 = max(int(r[0] * mm) - 1, 0), min(int(r[2] * mm) + 1, im.width - 1)
    y0, y1 = max(int((r[1] - 1.2) * mm), 0), min(int((r[3] + 1.2) * mm), im.height - 2)
    if x1 <= x0 or y1 <= y0: return None
    reg = im.crop((x0, y0, x1, y1))
    diff = ImageChops.difference(reg, Image.new('RGB', reg.size, reg.getpixel((0, 0)))).convert('L').point(lambda v: 255 if v * 3 > schwelle else 0)
    bb = diff.getbbox()
    return 0 if not bb else bb[3] - bb[1]

def pruefe_raender(ex, dpi=100):
    """Kopf-/Fusszeile und Seitenraender, Pixelanalyse am gerenderten Raster plus DOM:
       - Streifen am Rand (oberste/unterste Bildzeile, aeusserste Spalte weicht einheitlich vom Inneren ab, z. B. dunkle Rasterzeile)
       - Tinte in den aeussersten 2 Bildzeilen (Text am Rand angeschnitten)
       - einzeilige Textblocks (Kopf-/Fusszeile, Kleintext), deren sichtbare Tinte kleiner als 80 % der im Browser (canvas measureText) gemessenen Tintenhoehe ist ist: oben/unten abgeschnitten
       - DOM: Fusszeile ragt aus der Seite, Box kleiner als der Text, Text vom Seitenrand oder einem overflow-Rahmen beschnitten"""
    out = []
    for i, b in enumerate(ex.render(dpi)):
        s = ex.dom[i] if i < len(ex.dom) else {}
        kind = s.get('kind', ''); im = Image.open(b).convert('RGB'); H = im.height
        for lage in ('oben', 'unten', 'links', 'rechts'):
            anteil = _streifen(im, lage)
            if anteil >= 0.9: out.append(F('rand_streifen', i + 1, f'einheitlicher Streifen am {lage}en Seitenrand ({anteil:.0%} der Randpixel weichen vom Inneren ab)', lage=lage))
        if kind in ('cover', 'chapter'): continue
        for lage, z in (('unten', H - 1), ('oben', 0)):
            bg = im.getpixel((4, 8 if lage == 'oben' else H - 9)); zeile = [im.getpixel((x, z)) for x in range(im.width)]
            n = sum(1 for p in zeile if sum(abs(p[k] - bg[k]) for k in range(3)) > 60)
            if 2 <= n < im.width * 0.9: out.append(F('rand_tinte', i + 1, f'Tinte in der {lage}sten Bildzeile ({n} Pixel): Text vermutlich angeschnitten', lage=lage))
        gemeldet = set()
        for bl in s.get('blocks', []):
            if len(bl.get('lr', [])) != 1 or bl['n'] < 3 or bl['text'] in gemeldet: continue
            # (1) Ursache im Referenz-PDF: einzeilige Kopf-/Fusszeile in einer overflow:hidden-Box mit knapper Hoehe (< 1,6 Schriftgroessen);
            #     die Rastermaschine (html2canvas) schneidet dort die Buchstaben unten an, obwohl der Browser sie vollstaendig zeigt.
            if 0 < bl.get('clipBox', 0) < 1.6:
                gemeldet.add(bl['text']); out.append(F('text_in_enger_box', i + 1, f'«{bl["text"][:35]}» ({"Fusszeile" if bl["foot"] else bl["tag"] + "." + bl["cls"]}) steht in einer overflow:hidden-Box von nur {bl["clipBox"]} Schriftgroessen Hoehe: Buchstaben werden angeschnitten', fuss=bl['foot'])); continue
            # (2) Wirkung am Raster: deutlich weniger Tinte als im Browser gemessen (grober Schnitt, ab ca. 45 % Verlust)
            if bl.get('inkMm', 0) > 0.6:
                h = _tinte_hoehe(im, bl['lr'][0], dpi, 40); soll = bl['inkMm'] / 25.4 * dpi
                if h is not None and h < 0.55 * soll:
                    gemeldet.add(bl['text']); out.append(F('text_angeschnitten', i + 1, f'«{bl["text"][:35]}»: sichtbare Tinte {h} px, erwartet {soll:.0f} px', fuss=bl['foot']))
    for i, s in enumerate(ex.dom):
        if s.get('kind') in ('cover',): continue
        for f in s.get('foot', []):
            if f['b'] > s['h'] + 0.3 or f['y'] < -0.3: out.append(F('fuss_ausserhalb', i + 1, f'Fusszeile ragt aus der Seite (unten {f["b"]} mm von {s["h"]} mm)'))
            if f['scrollH'] > f['clientH'] + 1 and re.search('hidden|clip', f['ov']): out.append(F('fuss_beschnitten', i + 1, f'Fusszeilen-Box zu niedrig: Inhalt {f["scrollH"]} px, Box {f["clientH"]} px'))
        for c in s.get('clipped', []): out.append(F('text_beschnitten', i + 1, f'Text beschnitten durch {c["by"]}: «{c["text"]}»'))
        if s.get('h', 297) > 297.8 or s.get('scrollH', 0) > 297.8: out.append(F('seite_zu_hoch', i + 1, f'Seitenhoehe {s.get("h")} mm, Inhaltshoehe {s.get("scrollH")} mm (A4 = 297 mm)'))
    return out

def pruefe_ueberlappung(ex):
    """Texte, die sich ueberlappen (Zeilenboxen der Textknoten in mm, ohne Vorfahren/Nachfahren), und Text, der ein Foto ueberdeckt."""
    out = []
    for i, s in enumerate(ex.dom):
        if s.get('kind') == 'cover': continue
        bl = s.get('blocks', []); gemeldet = 0
        for a in range(len(bl)):
            for c in range(a + 1, len(bl)):
                p, q = bl[a], bl[c]
                if c in p.get('anc', []) or a in q.get('anc', []): continue
                hit = None
                for r1 in p.get('lr', []):
                    for r2 in q.get('lr', []):
                        ox = min(r1[2], r2[2]) - max(r1[0], r2[0]); oy = min(r1[3], r2[3]) - max(r1[1], r2[1])
                        if ox > 1.0 and oy > 1.2: hit = (ox, oy); break
                    if hit: break
                if hit and gemeldet < 5:
                    gemeldet += 1; out.append(F('text_ueberlappt', i + 1, f'«{p["text"][:25]}» ueberlappt «{q["text"][:25]}» ({hit[0]:.1f} x {hit[1]:.1f} mm)'))
        for im in s.get('images', []):
            if 'x' not in im: continue
            for p in bl:
                for r1 in p.get('lr', []):
                    ox = min(r1[2], im['x'] + im['w']) - max(r1[0], im['x']); oy = min(r1[3], im['y'] + im['h']) - max(r1[1], im['y'])
                    if ox > 1.0 and oy > 1.2: out.append(F('text_auf_bild', i + 1, f'«{p["text"][:25]}» liegt auf dem Foto')); break
        for f in s.get('foot', []):
            # Planer V2: Seitenzahl «n / K» steht mittig (ab ca. 96 mm), im Kochbuch zusaetzlich «Seite X» rechts
            if f['r'] > 92 and f['b'] > 284: out.append(F('fuss_trifft_seitenzahl', i + 1, f'Fusszeilentext reicht bis {f["r"]} mm und stoesst an die Seitenzahl in der Mitte'))
    return out

def pruefe_schriftgroessen(ex, haupt_rx=r'ing|step|tip|note|para|text|body|lead|desc|toc-name', sekundaer_ausnahme_rx=r'^$'):
    """Schriftgroessen im DOM der gerenderten Seiten (Raster-PDF: nicht aus dem PDF messbar).
       Haupttext (Klassen passend zu haupt_rx, Absaetze) >= 10 pt, alles andere sichtbare >= 8,5 pt. Nicht beachtet: Deckblatt (eigene Typografie)."""
    out = []; gesehen = set()
    for i, s in enumerate(ex.dom):
        if s.get('kind') == 'cover': continue
        for b in s.get('blocks', []):
            haupt = bool(re.search(haupt_rx, b['cls'], re.I)) and not re.search(r'label|small|hint|cont\b|group|no\b|source|foot|cat\b|fact|head', b['cls'], re.I)
            grenze = MIN_HAUPT_PT if haupt else MIN_SEKUNDAER_PT
            if b['fsPt'] < grenze - 0.05:
                k = (b['cls'], b['fsPt'])
                if k in gesehen: continue
                gesehen.add(k); out.append(F('schrift_zu_klein', i + 1, f'{b["fsPt"]} pt < {grenze} pt ({"Haupttext" if haupt else "Sekundaertext"}) in «{b["cls"] or b["tag"]}»: «{b["text"][:30]}»'))
    return out

def pruefe_wortbrueche(ex):
    out = []
    for i, s in enumerate(ex.dom):
        for w in s.get('words', []):
            if w['art'] == 'mitten': out.append(F('wort_gebrochen', i + 1, f'Wort mitten getrennt: «{w["w"]}» in «{w["cls"]}»'))
            elif w['art'] == 'trennzeichen' and 'amt' in w['cls']: out.append(F('menge_getrennt', i + 1, f'Menge an Bindestrich/Bereichsstrich getrennt: «{w["w"]}» in «{w["cls"]}»'))
    return out

def pruefe_ueberschriften(ex):
    """Verwaiste Ueberschrift: nichts Passendes darunter, obwohl sie ganz unten steht; leere Rubrik: Ueberschrift ohne Inhalt weiter oben."""
    out = []
    for i, s in enumerate(ex.dom):
        if s.get('kind') in ('cover', 'toc', 'chapter'): continue
        fusstop = min([f['y'] for f in s.get('foot', [])] or [285])
        for h in s.get('headings', []):
            if h['following'] or h['below']: continue
            if h['b'] > fusstop - 40: out.append(F('ueberschrift_verwaist', i + 1, f'Ueberschrift «{h["text"]}» steht am Seitenende ohne Inhalt ({h["b"]} mm, Fusszeile ab {fusstop} mm)'))
            else: out.append(F('rubrik_leer', i + 1, f'Ueberschrift «{h["text"]}» ohne Inhalt'))
        for c in s.get('emptyBlocks', []): out.append(F('leerer_kasten', i + 1, f'leerer Block «{c}»'))
    return out

SPARPLATZ_MM = 12   # Gewinn des engen Layouts (pv-tight) allein durch Abstaende, gemessen an Carbonara: Band 50 mm normal 374 mm, eng 362 mm
BLOCKABSTAND_MM = 6   # Abstand, den ein weiterer Block auf der Seite davor zusaetzlich braucht (pv-extras margin)

def pruefe_restseiten(ex, mm=RESTSEITE_MIN_MM, spar=SPARPLATZ_MM):
    """Unnoetige Restseite: Die letzte Seite eines mehrseitigen Rezepts waere vermeidbar, wenn ihr Inhalt (ohne Kopfzeile) in den freien Platz
       der vorletzten Seite plus Sparplatz (spar mm) passt (kein Sparplatz, wenn die Seite davor schon im engen Layout steht), oder sie hat nur sehr wenig Inhalt (<= 8 Zeilen oder < 25 mm).
       Eine Restseite mit einem ganzen Block (z. B. Naehrwerte und Quelle, 57 mm), der auch nach engeren Abstaenden nicht auf die Seite davor passt, ist bewusst und wird nicht beanstandet.
       mm bleibt als Obergrenze fuer «wenig Inhalt» (Standard 60 mm) nur zusammen mit der Bedingung, dass der Platz davor nicht reicht, nicht allein."""
    out = []; per = {}
    for i, s in enumerate(ex.dom):
        if s.get('recipeId'): per.setdefault(s['recipeId'], []).append(i)
    for rid, idx in per.items():
        if len(idx) < 2: continue
        last, prev = ex.dom[idx[-1]], ex.dom[idx[-2]]
        starts = [b['y'] for b in last.get('blocks', []) if not b.get('foot') and b['y'] > 22]
        hoehe = last.get('cBot', 0) - (min(starts) if starts else last.get('cTop', 0))
        fuss = min([f['y'] for f in prev.get('foot', [])] or [285])
        frei = fuss - 6 - prev.get('cBot', 0)
        wenig = last.get('lineCount', 99) <= 8 or hoehe < 25
        sp = 0 if 'pv-tight' in prev.get('cls', '') else spar   # ist die Seite davor schon im engen Layout (Stufe 2), gibt es keinen weiteren Sparplatz
        vermeidbar = hoehe < mm and hoehe + BLOCKABSTAND_MM <= frei + sp
        if wenig or vermeidbar:
            out.append(F('restseite', idx[-1] + 1, f'{rid}: letzte von {len(idx)} Seiten hat {last.get("lineCount")} Zeilen / {hoehe:.0f} mm Inhalt, Platz davor {frei:.0f} mm (+{sp} mm sparbar, +{BLOCKABSTAND_MM} mm Blockabstand)', rezept=rid))
    return out

def pruefe_bilder(ex, rezepte=None):
    """Bildproportionen: html2canvas ignoriert object-fit, also darf Rahmen-Seitenverhaeltnis nur dann von dem der Bilddatei abweichen, wenn das Bild vorher zugeschnitten wurde."""
    out = []
    for i, s in enumerate(ex.dom):
        for im in s.get('images', []):
            if im['cover'] or not im['w'] or not im['h']: continue
            if not im['ok']: out.append(F('bild_defekt', i + 1, 'Bild konnte nicht geladen werden (defektes Symbol)')); continue
            ar_f, ar_b = im['nw'] / im['nh'], im['w'] / im['h']
            if abs(ar_f / ar_b - 1) > 0.02 and im['fit'] in ('fill', 'none', ''):
                out.append(F('bild_verzerrt', i + 1, f'Bild {im["nw"]}x{im["nh"]} (Verhaeltnis {ar_f:.2f}) im Rahmen {im["w"]:.0f}x{im["h"]:.0f} mm ({ar_b:.2f}), object-fit {im["fit"]}'))
            elif abs(ar_f / ar_b - 1) > 0.02 and im['fit'] in ('cover', 'contain') and 'pdf-img-cover' not in im['cls']:
                out.append(F('bild_ungeprueft', i + 1, f'object-fit {im["fit"]} wird von html2canvas ignoriert und das Bild nicht vorab zugeschnitten ({ar_f:.2f} gegen {ar_b:.2f})'))
            if im['ppi'] and im['ppi'] < 100: out.append(F('bild_aufloesung', i + 1, f'nur {im["ppi"]} ppi'))
    return out

_NORM = [(' ', ' '), ('­', ''), ('‑', '-'), ('’', "'"), ('‘', "'"), ('“', '"'), ('”', '"'), ('„', '"'), ('«', '"'), ('»', '"')]
def _cp(t):
    """Die unsichtbare Textebene der Raster-PDFs ist WinAnsi (cp1252): Zeichen wie ğ ı ş Ł stehen sichtbar korrekt im Bild, aber nicht im Textlayer.
       Fuer den Textabgleich werden sie auf beiden Seiten entfernt (Bekannte Grenze, siehe Bericht); sichtbar geprueft wird per Bild."""
    return t.encode('cp1252', 'ignore').decode('cp1252')

def _tok(t):
    for a, b in _NORM: t = t.replace(a, b)
    t = _cp(t)
    t = t.replace('1/2', '½').replace('1/4', '¼').replace('3/4', '¾').replace('1 ½', '1½')
    return [w for w in re.findall(r"[\wÀ-ÿ½¼¾]+", t.lower())]

def flach(t):
    """Nur Buchstaben und Ziffern, klein: die Textebene setzt in grossen Schriften die Woerter ohne Leerzeichen («SloppyJoeBuns»)."""
    for a, b in _NORM: t = t.replace(a, b)
    return re.sub(r'\W+', '', _cp(t).lower())

def erwartete_texte(rez):
    """Zutaten- und Schritt-Texte eines Testrezepts als Wortlisten (Menge, Einheit und Name zusammen, Reihenfolge der Felder egal)."""
    ings = []
    for i in rez['ingredients']:
        n = (i.get('name') or '').strip()
        if not n: continue
        if n.endswith(':') and not i.get('amount') and not i.get('unit'): continue   # Gruppentitel
        ings.append([w for w in _tok(f"{i.get('unit','')} {n}") if len(w) >= 3 and not w.isdigit()])   # Zahlen werden ggf. umformatiert (0.75 -> ¾, 1000 g -> 1 kg), daher nur Woerter
    steps = [(s['text'].strip(), _tok(s['text'])) for s in rez['steps'] if s['text'].strip()]
    return ings, steps

def _seitenende(seite, n):
    """Index des letzten Wortes der Seite n (oder des Dokuments)."""
    import bisect
    return bisect.bisect_right(seite, n) - 1

def _enthaelt(tokens, bag, fenster=60, seite=None):
    """Alle Woerter in Reihenfolge (mit Luecken bis fenster Woerter, z. B. Fusszeile/Seitenwechsel dazwischen) im Dokument?
       Startpunkt ist das erste Vorkommen der ersten vier Woerter (die Zutatenspalte kann dieselben Woerter enthalten)."""
    starts = [0]
    if len(tokens) >= 4:
        k = tokens[:4]; starts = [i for i in range(len(bag) - 3) if bag[i:i + 4] == k] or [0]
    beste = None
    for st in starts:
        pos = st; fehlt = []
        for t in tokens:
            j = pos; lim = min(len(bag), pos + fenster + 1)
            if seite and pos < len(bag):   # ein kontrolliert geteilter Schritt darf auf der naechsten Seite weitergehen (dazwischen Kopfzeile und Zutatenspalte)
                lim = max(lim, _seitenende(seite, seite[pos] + 1) + 1)
            while j < lim and bag[j] != t: j += 1
            if j < lim: pos = j + 1
            else: fehlt.append(t)
        if beste is None or len(fehlt) < len(beste): beste = fehlt
        if not beste: break
    return beste or []

def pruefe_text(ex, rezepte):
    """Textabgleich: alle Zutaten- und Schritt-Woerter des Rezepts stehen im extrahierten PDF-Text (pdftotext -raw), Schritte nicht doppelt, keine Platzhalter wie undefined/NaN."""
    out = []; roh = ex.text(raw=True)
    flat_doc = flach(roh)
    bag = []; seite = []
    for n, pg in enumerate(roh.split('\f')):
        t = _tok(pg); bag += t; seite += [n] * len(t)
    for m in re.finditer(r'\bundefined\b|\bNaN\b|\bnull\b|\[object|\bInfinity\b', roh):
        out.append(F('platzhalter_im_text', 0, f'Platzhalter «{m.group(0)}» im PDF-Text'))
    for rez in rezepte:
        ings, steps = erwartete_texte(rez)
        fehl_i = []
        for t in ings:
            # Zutaten stehen mehrspaltig; Reihenfolge innerhalb der Zeile egal: jedes Wort muss irgendwo vorkommen
            miss = [w for w in t if w not in set(bag)]
            if miss: fehl_i.append(' '.join(t)[:50] + ' -> ' + ','.join(miss[:3]))
        if fehl_i: out.append(F('text_fehlt_zutat', 0, f'{rez["id"]}: Zutaten-Woerter fehlen: {fehl_i[:3]}', rezept=rez['id']))
        for roh_s, t in steps:
            if not t: continue
            if len(t) >= 6:
                miss = _enthaelt(t, bag, seite=seite)
                if miss:   # Textebene ohne Leerzeichen zwischen den Woertern (pdftotext liefert «LauwarmeMilch,Honig...»): Vergleich ueber die Buchstabenfolge, Anfang und Ende des Schritts
                    fs = flach(roh_s)
                    if len(fs) >= 20 and fs[:30] in flat_doc and fs[-30:] in flat_doc: miss = []
                if len(miss) > 0: out.append(F('text_fehlt_schritt', 0, f'{rez["id"]}: Schritt «{roh_s[:40]}» unvollstaendig im PDF (fehlt: {miss[:3]})', rezept=rez['id']))
                kopf = ' '.join(t[:8]); anz = ' '.join(bag).count(kopf)
                if anz > 1: out.append(F('text_doppelt', 0, f'{rez["id"]}: Schritt «{roh_s[:40]}» {anz}-mal im PDF', rezept=rez['id']))
        notiz = rez.get('notes', '').strip()
        if notiz:
            nt = _tok(notiz)[:25]; miss = _enthaelt(nt, bag, fenster=60 if len(nt) >= 4 else len(bag))   # kurze Notiz (unter 4 Woerter): kein Startanker, daher im ganzen Dokument suchen
            fn = flach(notiz)
            if miss and fn and fn[:30] in flat_doc: miss = []
            if miss: out.append(F('text_fehlt_notiz', 0, f'{rez["id"]}: Notiz unvollstaendig (fehlt: {miss[:3]})', rezept=rez['id']))
    return out

def _ascii(t): return re.sub(r'[^a-z]+', '', t.lower())

def pruefe_inhaltsverzeichnis(ex):
    """Seitenzahlen im Inhaltsverzeichnis gegen die tatsaechlichen Rezeptanfaenge (DOM-Reihenfolge = PDF-Seiten) und gegen den PDF-Text der Seite."""
    out = []
    if not any(s.get('kind') == 'toc' for s in ex.dom): return out
    start = {}
    for i, s in enumerate(ex.dom):
        if s.get('kind') == 'recipe' and s.get('recipeId') and s['recipeId'] not in start: start[s['recipeId']] = (i + 1, s.get('title', ''))
    n_rows = 0
    for i, s in enumerate(ex.dom):
        for r in s.get('tocRows', []):
            n_rows += 1
            if r['id'] not in start: out.append(F('toc_ziel_fehlt', i + 1, f'Eintrag «{r["text"][:40]}» zeigt auf kein Rezept')); continue
            if str(start[r['id']][0]) != r['page']: out.append(F('toc_seitenzahl', i + 1, f'Eintrag «{r["text"][:40]}»: Verzeichnis sagt Seite {r["page"]}, tatsaechlich Seite {start[r["id"]][0]}'))
    if n_rows < len(start): out.append(F('toc_unvollstaendig', 0, f'{n_rows} Verzeichniseintraege fuer {len(start)} Rezepte'))
    for rid, (seite, titel) in start.items():
        t = flach(ex.text(raw=True, first=seite))
        if titel and flach(titel)[:20] not in t and _ascii(titel)[:12] not in _ascii(ex.text(raw=True, first=seite)): out.append(F('toc_titel_nicht_auf_seite', seite, f'Titel «{titel[:30]}» steht nicht im Text von PDF-Seite {seite}'))
    return out

def pruefe_fortsetzung(ex):
    """Fortsetzungsseiten (zweite und weitere Seite eines Rezepts): Rezeptname, Kennzeichnung «Fortsetzung» und «n von m» vorhanden."""
    out = []; per = {}
    for i, s in enumerate(ex.dom):
        if s.get('recipeId'): per.setdefault(s['recipeId'], []).append(i)
    for rid, idx in per.items():
        titel = ex.dom[idx[0]].get('title') or ''
        for i in idx[1:]:
            t = ex.dom[i].get('text', '')
            if 'fortsetzung' not in t.lower(): out.append(F('fortsetzung_ohne_kennzeichnung', i + 1, f'{rid}: Seite ohne «Fortsetzung»', rezept=rid))
            elif not re.search(r'\b\d+\s*(?:von|/)\s*\d+\b', t, re.I): out.append(F('fortsetzung_ohne_n_von_m', i + 1, f'{rid}: «Fortsetzung» ohne «n von m» (Auftrag: «Fortsetzung · 2 von 2»)', rezept=rid))
            if titel and flach(titel)[:20] not in flach(t): out.append(F('fortsetzung_ohne_name', i + 1, f'{rid}: Rezeptname fehlt auf der Fortsetzungsseite', rezept=rid))
    return out

# Typografie-Vergleich Einzelrezept gegen Kochbuch (gleicher Stil = gleiche Rezeptseite)
def _sig_rezept(ex, rid):
    sig = {}
    for s in ex.dom:
        if s.get('recipeId') == rid and s.get('kind') in ('recipe', 'continuation'):
            for k, v in s.get('sig', {}).items():
                if re.search(r'foot|pageno', k, re.I): continue
                sig.setdefault(k, v)
    return sig

def pruefe_einzel_gegen_buch(einzel, buch, rid):
    out = []; a, b = _sig_rezept(einzel, rid), _sig_rezept(buch, rid)
    for k in sorted(set(a) & set(b)):
        diff = {f: (a[k][f], b[k][f]) for f in a[k] if a[k][f] != b[k][f]}
        if diff: out.append(F('typo_einzel_vs_buch', 0, f'{rid}: «{k}» unterscheidet sich: {diff}', rezept=rid))
    nur = (set(a) ^ set(b))
    if nur: out.append(F('typo_klassen_abweichung', 0, f'{rid}: nur in einer Variante: {sorted(nur)[:5]}', rezept=rid))
    na = sum(1 for s in einzel.dom if s.get('recipeId') == rid); nb = sum(1 for s in buch.dom if s.get('recipeId') == rid)
    if na != nb: out.append(F('seitenzahl_einzel_vs_buch', 0, f'{rid}: Einzelrezept {na} Seiten, Kochbuch {nb} Seiten', rezept=rid))
    return out

def seiten_pro_rezept(ex):
    d = {}
    for s in ex.dom:
        if s.get('recipeId'): d[s['recipeId']] = d.get(s['recipeId'], 0) + 1
    return d

def alle_pruefungen(ex, rezepte=None):
    """Alle automatischen Pruefungen auf einem Export; gibt {pruefung: [Befunde]} zurueck."""
    r = {'seitenzahl': pruefe_seitenzahl_gleich_dom(ex), 'raender': pruefe_raender(ex), 'ueberlappung': pruefe_ueberlappung(ex), 'schrift': pruefe_schriftgroessen(ex),
         'wortbruch': pruefe_wortbrueche(ex), 'ueberschriften': pruefe_ueberschriften(ex), 'restseiten': pruefe_restseiten(ex), 'bilder': pruefe_bilder(ex),
         'inhaltsverzeichnis': pruefe_inhaltsverzeichnis(ex), 'fortsetzung': pruefe_fortsetzung(ex)}
    if rezepte: r['text'] = pruefe_text(ex, rezepte)
    return r


async def vorschau_gleich_download(s, stil=None, rezept='pdf_carbonara', stufe='full', erwarte_text='Zucker'):
    """Echte Bedienung: Exportfenster oeffnen, Stil und Naehrwerte waehlen, PDF erstellen, in der Vorschau «Herunterladen» klicken.
       Vergleicht die Bytes (SHA-256) von Vorschau und Download, Seitenzahl und gewaehlten Stil. Die Bedienelemente heissen
       pdf-export-set-template (data-id = Stil), pdf-export-set-detail (data-level), pdf-export-build, pdf-export-download."""
    stil = stil or T1; page = s.page
    await page.evaluate("(id) => { state.activeRecipeId = id; state.view = 'detail'; render(); openModal({ type: 'pdf-export', target: 'single', recipeId: id, stage: 'options', template: window.__T0, nutritionDetail: 'off' }); }", rezept)
    await page.wait_for_selector('[data-action="pdf-export-build"]', timeout=10000)
    await page.click('[data-action="pdf-export-set-template"][data-id="' + stil + '"]')
    if await page.query_selector('[data-action="pdf-export-set-detail"][data-level="' + stufe + '"]'): await page.click('[data-action="pdf-export-set-detail"][data-level="' + stufe + '"]')
    await page.click('[data-action="pdf-export-build"]')
    await page.wait_for_selector('[data-action="pdf-export-download"]', timeout=60000)
    await page.wait_for_timeout(500)
    h_vorschau = await page.evaluate("async () => { const b = state.modal.previewBlob; const u = new Uint8Array(await b.arrayBuffer()); const d = await crypto.subtle.digest('SHA-256', u); return [Array.from(new Uint8Array(d)).map(x => x.toString(16).padStart(2, '0')).join(''), b.pageCount || 0, state.modal.template, state.modal.nutritionDetail]; }")
    async with page.expect_download(timeout=30000) as d:
        await page.click('[data-action="pdf-export-download"]')
    dl = await d.value; pfad = os.path.join(s.out, f'ui_download_{stil}_{stufe}.pdf'); await dl.save_as(pfad)
    h_dl = hashlib.sha256(open(pfad, 'rb').read()).hexdigest()
    n = pdfinfo(pfad)['seiten']; t = ' '.join(pdftext(pfad).split())
    info = f'Vorschau {h_vorschau[0][:10]} Download {h_dl[:10]}, Stil {h_vorschau[2]}, Detail {h_vorschau[3]}, Seiten (Vorschau/Datei) {h_vorschau[1]}/{n}, «{erwarte_text}» im PDF: {erwarte_text in t}'
    await page.evaluate("() => { state.modal = null; render(); }")
    return {'gleich': h_vorschau[0] == h_dl and h_vorschau[2] == stil and h_vorschau[3] == stufe and (not erwarte_text or erwarte_text in t), 'seiten_ok': h_vorschau[1] == n, 'info': info, 'pdf': pfad}

# ---------- Programm: Baseline-Exporte ----------
async def _baseline(out, stile, buch_stile):
    os.makedirs(out, exist_ok=True)
    bericht = {}
    async with PdfSession(out) as s:
        rez = {r['id']: r for r in s.fx['recipes']}
        print('Naehrwerte-Status:', s.naehrwerte_status)
        wichtig = ['pdf_sloppy', 'pdf_manti', 'pdf_carbonara', 'pdf_cookies', 'pdf_kurz', 'pdf_langtitel', 'pdf_vielezutaten', 'pdf_langeeinheiten', 'pdf_ohnemenge', 'pdf_zahlen',
                   'pdf_langerschritt', 'pdf_vieleschritte', 'pdf_notizen', 'pdf_bildkaputt', 'pdf_hochformat', 'pdf_quadrat', 'pdf_querformat', 'pdf_zweiseiten', 'pdf_dreiseiten']
        jobs = []
        for stil in stile:
            for rid in wichtig:
                for nw in (['off', 'compact', 'full'] if rid in ('pdf_manti', 'pdf_carbonara', 'pdf_cookies') else ['compact' if rez[rid].get('_nutri') else 'off']):
                    jobs.append(('einzel', rid, stil, nw))
        for stil in buch_stile:
            jobs.append(('buch', 'ref', stil, 'compact'))
            if stil == T0: jobs.append(('buch', 'gross', stil, 'compact'))
        for art, rid, stil, nw in jobs:
            try:
                ex = await (s.single(rid, stil, nw) if art == 'einzel' else s.book(rid, stil, nw))
                if not ex.pdf: bericht[ex.name] = {'fehler': 'kein PDF'}; continue
                ex.render(); ex.kontaktbogen()
                ids = [rid] if art == 'einzel' else ([r['id'] for r in s.fx['recipes'] if r['id'] in [i for i, _ in s.fx['books'][rid]['items']]])
                res = alle_pruefungen(ex, [rez[i] for i in ids])
                bericht[ex.name] = {'seiten': ex.seiten(), 'sek': round(ex.sekunden, 1), 'befunde': res, 'opt': ex.optionen, 'pro_rezept': seiten_pro_rezept(ex)}
                json.dump({'dom': ex.dom}, open(ex.pdf[:-4] + '_dom.json', 'w'), ensure_ascii=False)
                print(f'{ex.name}: {ex.seiten()} Seiten, {ex.sekunden:.1f}s, Befunde: { {k: len(v) for k, v in res.items() if v} }', flush=True)
            except Exception as e:
                bericht[f'{art}_{rid}_{stil}_{nw}'] = {'fehler': str(e)[:300]}; print('FEHLER', art, rid, stil, nw, str(e)[:200], flush=True)
        bericht['_naehrwerte_status'] = s.naehrwerte_status; bericht['_seitenfehler'] = s.fehler
    json.dump(bericht, open(os.path.join(out, 'befunde.json'), 'w'), ensure_ascii=False, indent=1)
    return bericht

if __name__ == '__main__':
    ziel = sys.argv[1] if len(sys.argv) > 1 else os.path.join(OUT, 'pdf_baseline')
    stile = sys.argv[2:] or list(STILE)
    asyncio.run(_baseline(ziel, stile, stile))
