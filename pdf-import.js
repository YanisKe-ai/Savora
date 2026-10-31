/* ---------- Rezepte aus PDF importieren ----------
   Liest den Text einer PDF lokal mit PDF.js (loadPdfJs aus pdf-preview.js). Die Datei wird weder gespeichert noch übertragen.
   Der Text landet im Feld von «Aus Text importieren»; den Rest macht der bestehende Textimport. */
const PDF_IMPORT_MAX_BYTES = 25 * 1024 * 1024;
const PDF_BULLET_RE = /^[•·▪▫◦●○■□‣⁃∙*]\s*/;
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
    if (last && Math.abs(it.y - last.y) <= 0.5 * Math.min(it.h, last.h)) { last.items.push(it); if (real) { last.h = Math.max(last.h, it.h); } return; }
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
    let both = 0, leftChars = 0, rightChars = 0;
    L.forEach(l => {
      let le = false, ri = false;
      l.items.forEach(i => { if (!i.str.trim()) return; const c = i.str.replace(/\s/g, '').length; if (i.x + i.w / 2 < cut) { le = true; leftChars += c; } else { ri = true; rightChars += c; } });
      if (le && ri) both++;
    });
    const total = leftChars + rightChars;
    const rightX1 = Math.max(...L.map(l => l.x1));
    if (both >= 1 && leftChars >= total * 0.2 && rightChars >= total * 0.2 && rightX1 - cut >= pageWidth * 0.2 && cut - Math.min(...L.map(l => l.x0)) >= pageWidth * 0.15) return { s, cut };
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
  lines = lines.filter(l => !((l.y < H * 0.06 || l.y > H * 0.94) && pdfIsEdgeLine(l.text)));
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
  const BEKANNT = /^(?:zutaten|zubereitung|zubereitungsschritte|tipp|tipps|hinweis|notiz|notizen|utensilien|für|ergibt)\b/i;
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
  let doc = null;
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
      doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    } catch (e) {
      const nm = e && e.name;
      res.error = nm === 'PasswordException' ? 'password' : nm === 'InvalidPDFException' ? 'damaged' : 'load-failed';
      return res;
    }
    res.numPages = doc.numPages;
    res.truncated = doc.numPages > maxPages;
    const last = Math.min(doc.numPages, maxPages);
    for (let n = 1; n <= last; n++) {
      let text = '';
      try {
        const page = await doc.getPage(n);
        const vp = page.getViewport({ scale: 1 });
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
      } catch (e) { text = ''; }
      res.pages.push({ n, text, chars: text.replace(/\s/g, '').length });
    }
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
