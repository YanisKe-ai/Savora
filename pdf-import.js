/* ---------- Rezepte aus PDF importieren ----------
   Liest den Text einer PDF lokal mit PDF.js (loadPdfJs aus pdf-preview.js). Die Datei wird weder gespeichert noch übertragen.
   Der Text landet im Feld von «Aus Text importieren»; den Rest macht der bestehende Textimport. */
const PDF_IMPORT_MAX_BYTES = 25 * 1024 * 1024;
const PDF_BULLET_RE = /^(?:[•·▪▫◦●○■□‣⁃∙]\s*|\*\s+)/;
const PDF_QTY_ONLY_RE = /^[\d½¼¾⅓⅔⅛][\d\s.,/½¼¾⅓⅔⅛-]*\s*(?:mg|g|kg|dl|cl|ml|l|el|tl|prise|prisen|stk\.?|stück|zehen?|zehe|bund|dose|dosen|pck\.?|päckchen|becher|scheiben?|blätter|etwas)?\.?$/i;   // nur Menge (und Einheit), ohne Zutatennamen
const PDF_EDGE_PATTERNS = [
  /(?:https?:\/\/|www\.)\S+/i,                                   // Adresse
  /\b[\w-]+(?:\.[\w-]+)*\.(?:ch|com|de|org|net|at|eu)\/\S*/i,    // Adresse ohne https
  /\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/,                           // Datum
  /\b\d{1,2}:\d{2}\b/,                                           // Uhrzeit
  /^\s*(?:Seite\s*)?\d+\s*(?:\/|von|of)\s*\d+\s*$/i,             // «1/3», «Seite 1 von 3»
  /\b\d+\s*\/\s*\d+\s*$/,                                        // Seitenzahl am Zeilenende
  /^\s*\d{1,3}\s*$/,                                             // nackte Seitenzahl
];

// Items zu Zeilen zusammenfassen (gleiche Grundlinie), je Zeile nach x sortiert.
function pdfBuildLines(items) {
  const arr = items.filter(it => it && typeof it.str === 'string' && it.str !== '')
    .map(it => ({ str: it.str, x: +it.x || 0, y: +it.y || 0, w: +it.w || 0, h: +it.h > 0 ? +it.h : 0 }));
  if (!arr.length) return [];
  const hs = arr.filter(i => i.h > 0 && i.str.trim()).map(i => i.h).sort((a, b) => a - b);
  const med = hs.length ? hs[hs.length >> 1] : 10;
  arr.forEach(i => { if (!i.h) i.h = med; });
  arr.sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  arr.forEach(it => {
    const real = !!it.str.trim();
    const last = lines[lines.length - 1];
    if (last && Math.abs(it.y - last.y) <= 0.5 * Math.max(it.h, last.h)) { last.items.push(it); if (real && it.h > last.h) { last.h = it.h; last.y = it.y; } return; }
    lines.push({ y: it.y, h: it.h, items: [it] });
  });
  lines.forEach(l => {
    l.items.sort((a, b) => a.x - b.x);
    let txt = '', prevEnd = null, prevStr = '';
    l.items.forEach(it => {
      if (prevEnd !== null && it.x - prevEnd > 0.2 * l.h && !/\s$/.test(prevStr) && !/^\s/.test(it.str)) txt += ' ';
      txt += it.str; prevEnd = it.x + it.w; prevStr = it.str;
    });
    l.text = txt.replace(/\s+/g, ' ').trim();
    const real = l.items.filter(i => i.str.trim());
    l.x0 = real.length ? real[0].x : l.items[0].x;
    l.x1 = real.length ? Math.max(...real.map(i => i.x + i.w)) : l.x0;
  });
  return lines.filter(l => l.text);
}

// Zwei Spalten erkennen: gibt { s, cut } zurück (ab Zeile s trennt ein leerer Streifen bei x = cut) oder null.
function pdfFindColumns(lines, pageWidth) {
  const n = lines.length;
  if (n < 4 || !(pageWidth > 0)) return null;
  const meds = lines.map(l => l.h).sort((a, b) => a - b), med = meds[meds.length >> 1];
  const minGap = Math.max(1.2 * med, pageWidth * 0.02);
  const lo = pageWidth * 0.2, hi = pageWidth * 0.8;
  for (let s = 0; s < n - 3; s++) {
    const L = lines.slice(s);
    // Besetzte Bereiche aller Elemente (ohne Leerzeichen-Elemente) sortieren und die breiteste Lücke in [lo, hi] suchen
    const iv = [];
    L.forEach(l => l.items.forEach(i => { if (i.str.trim()) iv.push([i.x, i.x + i.w]); }));
    iv.sort((a, b) => a[0] - b[0]);
    let best = null, reach = -Infinity;
    for (const [a, b] of iv) {
      if (a - reach >= minGap && (reach + a) / 2 >= lo && (reach + a) / 2 <= hi && (!best || a - reach > best.w)) best = { from: reach, to: a, w: a - reach };
      reach = Math.max(reach, b);
    }
    if (!best) continue;
    const cut = (best.from + best.to) / 2;
    let both = 0, leftChars = 0, rightChars = 0, qtyPairs = 0, rightDigits = 0, rightLetters = 0;
    L.forEach(l => {
      let le = false, ri = false, leftTxt = '';
      l.items.forEach(i => {
        if (!i.str.trim()) return;
        const c = i.str.replace(/\s/g, '').length;
        if (i.x + i.w / 2 < cut) { le = true; leftChars += c; leftTxt += i.str + ' '; }
        else { ri = true; rightChars += c; rightDigits += (i.str.match(/\d/g) || []).length; rightLetters += (i.str.match(/\p{L}/gu) || []).length; }
      });
      if (le && ri) { both++; if (PDF_QTY_ONLY_RE.test(leftTxt.trim())) qtyPairs++; }
    });
    if (both >= 2 && qtyPairs >= both * 0.6) return null;      // Tabelle «Menge | Zutat», keine zwei Spalten (auch nicht weiter unten)
    if (rightDigits >= 0.6 * (rightDigits + rightLetters)) continue;   // Zahlenkolonne rechts (Preise, Nährwerte)
    const rightX1 = Math.max(...L.map(l => l.x1));
    if (both >= 1 && leftChars >= 30 && rightChars >= 30 && rightX1 - cut >= pageWidth * 0.2 && cut - Math.min(...L.map(l => l.x0)) >= pageWidth * 0.15) return { s, cut };
  }
  return null;
}

// Zeilen mit Absatzabständen zu Textzeilen machen
function pdfLinesToRows(lines) {
  const rows = [];
  lines.forEach((l, i) => {
    if (i > 0) {
      const p = lines[i - 1], pitch = l.y - p.y;
      if (pitch > 1.6 * Math.max(l.h, p.h)) rows.push('');
    }
    rows.push(l.text);
  });
  return rows;
}

function pdfIsEdgeLine(text) { return PDF_EDGE_PATTERNS.some(re => re.test(text)); }

// Items: [{ str, x, y, w, h }] in PDF-Punkten, y = Abstand von oben. pageHeight ist optional (sonst A4-Verhältnis).
function pdfTextFromItems(items, pageWidth, pageHeight) {
  let lines = pdfBuildLines(items || []);
  if (!lines.length) return '';
  const H = pageHeight > 0 ? pageHeight : (pageWidth > 0 ? pageWidth * 1.414 : 842);
  // Kopf- und Fusszeilen des Browserdrucks (Datum, Adresse, Seitenzahl) im Randstreifen entfernen
  const inEdge = (l) => l.y < H * 0.06 || l.y > H * 0.94;
  const bodyH = lines.filter(l => !inEdge(l)).map(l => l.h).sort((a, b) => a - b);
  const bodyMed = bodyH.length >= 2 ? bodyH[bodyH.length >> 1] : 0;
  // Randstreifen: Adresse, Datum, Seitenzahl, nackte Zahl am Ende oder deutlich kleinere Schrift als der Text (nie, wenn es kein Textkörper gibt)
  lines = lines.filter(l => !(inEdge(l) && (pdfIsEdgeLine(l.text) || (bodyMed && (/\s\d{1,3}$/.test(l.text) || l.h < 0.85 * bodyMed)))));
  if (!lines.length) return '';
  let rows;
  const col = pdfFindColumns(lines, pageWidth);
  if (col) {
    const head = lines.slice(0, col.s), body = lines.slice(col.s);
    const side = (left) => pdfBuildLines([].concat(...body.map(l => l.items.filter(i => (i.x + i.w / 2 < col.cut) === left))));
    rows = pdfLinesToRows(head).concat(head.length ? [''] : [], pdfLinesToRows(side(true)), [''], pdfLinesToRows(side(false)));
  } else rows = pdfLinesToRows(lines);
  // Silbentrennung: Zeile endet mit Trennstrich, nächste beginnt klein => zusammenfügen
  const out = [];
  rows.forEach(r => {
    const prev = out.length ? out[out.length - 1] : '';
    const soft = /­$/.test(prev);
    const hard = /[\p{L}]-$/u.test(prev) && /^\p{Ll}/u.test(r) && !/^(?:und|oder|bzw|sowie|resp|beziehungsweise)\b/i.test(r);
    if (prev && r && (soft || hard) && /^\p{L}/u.test(r) && (soft || /^\p{Ll}/u.test(r))) out[out.length - 1] = prev.replace(/[­-]$/, '') + r;
    else out.push(r);
  });
  // Eigenstehende kurze Zeile vor einer Mengenzeile (z. B. «Teig», «Belag») ist eine Zutatengruppe: mit «:» wird sie vom Textimport als Gruppe gelesen
  const BEKANNT = /^(?:zutaten|zubereitung|zubereitungsschritte|tipp|tipps|hinweis|notiz|notizen|utensilien|für|ergibt|ingredients|method|directions|instructions|preparation|serves|notes)\b/i;
  const amountStart = (r) => /^[\d½¼¾⅓⅔⅛]/.test(r.replace(PDF_BULLET_RE, '')) && !/^\d+[.)]\s/.test(r);
  for (let i = 1; i < out.length - 1; i++) {
    const r = out[i];
    if (out[i - 1] === '' && r && r.length <= 40 && !/[\d:.,;!?)]$/.test(r) && !/\d/.test(r) && r.split(/\s+/).length <= 4 && /^\p{Lu}/u.test(r) && !BEKANNT.test(r)) {
      let j = i + 1; while (j < out.length && out[j] === '') j++;
      if (j < out.length && j - i <= 2 && amountStart(out[j])) out[i] = r + ':';
    }
  }
  const text = out.map(r => r.replace(/­/g, '').replace(PDF_BULLET_RE, m => '- ').replace(/^[–—]\s+/, '- ').trim())
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

// Liest die Datei mit PDF.js. Gibt nie eine Ausnahme nach aussen.
async function pdfImportRead(file, opts) {
  const maxPages = (opts && opts.maxPages) || 30;
  const res = { ok: false, error: null, numPages: 0, pages: [], scanned: false, truncated: false };
  let doc = null, task = null;
  try {
    const type = String((file && file.type) || ''), name = String((file && file.name) || '');
    let isPdf = type === 'application/pdf' || /\.pdf$/i.test(name);
    if (!isPdf && file && file.slice) {
      try { isPdf = (await file.slice(0, 5).text()).startsWith('%PDF'); } catch (e) { isPdf = false; }
    }
    if (!isPdf) { res.error = 'not-pdf'; return res; }
    if (file.size > PDF_IMPORT_MAX_BYTES) { res.error = 'too-large'; return res; }
    let pdfjs;
    try { pdfjs = await loadPdfJs(); } catch (e) { res.error = 'load-failed'; return res; }
    try {
      task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
      doc = await task.promise;
    } catch (e) {
      try { if (task) task.destroy(); } catch (e2) { /* egal */ }
      const nm = e && e.name;
      res.error = nm === 'PasswordException' ? 'password' : nm === 'InvalidPDFException' ? 'damaged' : 'load-failed';
      return res;
    }
    res.numPages = doc.numPages;
    res.truncated = doc.numPages > maxPages;
    const last = Math.min(doc.numPages, maxPages);
    let failed = 0;
    for (let n = 1; n <= last; n++) {
      let text = '';
      try {
        const page = await doc.getPage(n);
        const vp = page.getViewport({ scale: 1, rotation: 0 });
        const tc = await page.getTextContent();
        const items = [];
        tc.items.forEach(it => {
          if (typeof it.str !== 'string') return;
          const t = it.transform || [1, 0, 0, 1, 0, 0];
          const pt = vp.convertToViewportPoint ? vp.convertToViewportPoint(t[4], t[5]) : [t[4], vp.height - t[5]];
          items.push({ str: it.str, x: pt[0], y: pt[1], w: it.width || 0, h: it.height || Math.hypot(t[2], t[3]) || 0 });
        });
        text = pdfTextFromItems(items, vp.width, vp.height);
        page.cleanup();
      } catch (e) { text = ''; failed++; }
      res.pages.push({ n, text, chars: text.replace(/\s/g, '').length });
    }
    if (last > 0 && failed === last) { res.pages = []; res.error = 'damaged'; return res; }
    res.scanned = res.pages.reduce((a, p) => a + p.chars, 0) < 40;
    res.ok = true;
    return res;
  } catch (e) {
    res.error = 'load-failed'; res.ok = false;
    return res;
  } finally {
    try { if (doc) doc.destroy(); } catch (e) { /* egal */ }
  }
}

// Gewählte Seiten (Nummern ab 1) in Seitenreihenfolge, getrennt durch eine Leerzeile
function pdfJoinPages(pages, nums) {
  const want = new Set((nums || []).map(Number));
  return (pages || []).filter(p => want.has(p.n) && p.text).map(p => p.text).join('\n\n');
}
