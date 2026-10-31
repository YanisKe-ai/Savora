/* ---------- Rezepte aus Fotos importieren ----------
   Liest Text aus Fotos lokal: in der iOS-App mit der Texterkennung von iOS, sonst mit Tesseract (vendor/tesseract,
   erst beim ersten Bedarf geladen). Das Foto wird weder gespeichert noch übertragen.
   Gerüst: Helfer A füllt die Funktionen (siehe Plan). */
const IMAGE_IMPORT_MAX_BYTES = 30 * 1024 * 1024;
async function imageImportRead(files, opts) { return { ok: false, error: 'load-failed', results: [], text: '', weak: false }; }
