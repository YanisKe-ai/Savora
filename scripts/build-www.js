// Kopiert die Web-App aus dem Repo-Root nach www/ (webDir fuer Capacitor).
// Die Dateien im Root bleiben unveraendert, damit GitHub Pages weiter funktioniert.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const out = path.join(root, 'www');
const EXT = new Set(['.html', '.js', '.css', '.json', '.png', '.woff2']);
// Nicht in die native App: Service Worker (dort nicht registriert) und Projekt-/Werkzeugdateien.
const SKIP = new Set(['sw.js', 'package.json', 'package-lock.json', 'capacitor.config.json']);
fs.rmSync(out, { recursive: true, force: true });   // nur den generierten Ordner www/, nie Nutzerdaten
fs.mkdirSync(out);
let n = 0;
for (const f of fs.readdirSync(root)) {
  const full = path.join(root, f);
  if (!fs.statSync(full).isFile() || SKIP.has(f) || !EXT.has(path.extname(f))) continue;
  fs.copyFileSync(full, path.join(out, f));
  n++;
}
// Ordner mit gebuendelten Fremdbibliotheken (PDF.js fuer die PDF-Vorschau) mitnehmen
if (fs.existsSync(path.join(root, 'vendor'))) { fs.cpSync(path.join(root, 'vendor'), path.join(out, 'vendor'), { recursive: true }); n++; }
console.log(`www/ gefuellt: ${n} Eintraege`);
