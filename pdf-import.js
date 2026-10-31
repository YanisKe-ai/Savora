/* ---------- Rezepte aus PDF importieren ----------
   Liest den Text einer PDF lokal mit PDF.js (loadPdfJs aus pdf-preview.js). Die Datei wird weder gespeichert noch übertragen.
   Der Text landet im Feld von «Aus Text importieren»; den Rest macht der bestehende Textimport.
   Gerüst: Helfer A füllt die Funktionen (siehe Plan). */
const PDF_IMPORT_MAX_BYTES = 25 * 1024 * 1024;
function pdfTextFromItems(items, pageWidth) { return ''; }
async function pdfImportRead(file, opts) { return { ok: false, error: 'load-failed', numPages: 0, pages: [], scanned: false, truncated: false }; }
function pdfJoinPages(pages, nums) { return ''; }
