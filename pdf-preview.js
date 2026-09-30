/* ---------- PDF-Vorschau mit PDF.js ----------
   Auf iOS zeigt ein PDF im eingebetteten Fenster (iframe) nur die erste Seite, teils abgeschnitten.
   Dort (und in der iOS-App) werden die Seiten deshalb selbst gezeichnet: PDF.js wird erst beim ersten
   Bedarf geladen (vendor/pdfjs, Apache License 2.0), die Seiten erscheinen nacheinander und nur die
   sichtbaren bleiben im Speicher. Auf dem Desktop bleibt der eingebaute PDF-Betrachter des Browsers. */
function pdfPreviewUsesCanvas() {
  if (typeof state !== 'undefined' && typeof state.forcePdfCanvas === 'boolean') return state.forcePdfCanvas;
  if (typeof SavoraNative !== 'undefined' && SavoraNative.isNative) return true;
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}
let _pdfjsPromise = null;
function loadPdfJs() {
  if (!_pdfjsPromise) {
    _pdfjsPromise = import('./vendor/pdfjs/pdf.min.js').then((m) => {
      m.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.js', document.baseURI).href;
      return m;
    }).catch((e) => { _pdfjsPromise = null; throw e; });
  }
  return _pdfjsPromise;
}
let _pdfPreviewRun = 0;
async function renderPdfPreview(blob, box) {
  const run = ++_pdfPreviewRun;
  box.innerHTML = '<p class="pdf-pages-status" role="status">Vorschau wird vorbereitet …</p>';
  try {
    const pdfjs = await loadPdfJs();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    if (run !== _pdfPreviewRun || !document.body.contains(box)) { doc.destroy(); return; }
    const first = await doc.getPage(1);
    const v1 = first.getViewport({ scale: 1 });
    box.innerHTML = '';
    box.dataset.pages = String(doc.numPages);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const drawn = new Map();   // Seitennummer -> Zeichenauftrag
    const slots = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const slot = document.createElement('div');
      slot.className = 'pdf-page-slot';
      slot.style.aspectRatio = `${v1.width} / ${v1.height}`;
      slot.dataset.page = String(n);
      slot.setAttribute('role', 'img');
      slot.setAttribute('aria-label', `Seite ${n} von ${doc.numPages}`);
      box.appendChild(slot); slots.push(slot);
    }
    const draw = async (slot) => {
      const n = parseInt(slot.dataset.page, 10);
      if (slot.querySelector('canvas') || drawn.has(n)) return;
      drawn.set(n, true);
      try {
        const page = n === 1 ? first : await doc.getPage(n);
        const width = slot.clientWidth || box.clientWidth || 360;
        const vp = page.getViewport({ scale: (width / v1.width) * dpr });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
        canvas.style.width = '100%'; canvas.style.height = '100%'; canvas.setAttribute('aria-hidden', 'true');
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        if (run === _pdfPreviewRun && document.body.contains(slot)) slot.appendChild(canvas);
      } catch (e) { /* einzelne Seite fehlgeschlagen: leere Seite bleibt */ }
      drawn.delete(n);
    };
    const free = (slot) => { const c = slot.querySelector('canvas'); if (c) { c.width = 0; c.height = 0; c.remove(); } };   // weit entfernte Seiten geben Speicher frei
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(en => { if (en.isIntersecting) draw(en.target); else free(en.target); });
      }, { root: box, rootMargin: '150% 0px' });
      slots.forEach(s => io.observe(s));
      box._pdfObserver = io;
    } else {
      for (const s of slots) await draw(s);
    }
  } catch (e) {
    console.warn('PDF-Vorschau nicht moeglich:', e && (e.message || e));
    if (run === _pdfPreviewRun) box.innerHTML = '<p class="pdf-pages-status" role="alert">Die Vorschau lässt sich hier nicht anzeigen. Das PDF ist trotzdem fertig: Du kannst es teilen oder sichern.</p>';
  }
}
function bindPdfPreview() {
  // Beim Oeffnen des Export-Dialogs die Bibliothek schon laden: so liegt sie im Cache und die Vorschau klappt auch offline
  if (state.modal && state.modal.type === 'pdf-export' && pdfPreviewUsesCanvas()) loadPdfJs().catch(() => {});
  const box = document.getElementById('pdfPages');
  if (!box || !state.modal || !state.modal.previewBlob) return;
  renderPdfPreview(state.modal.previewBlob, box);
}
