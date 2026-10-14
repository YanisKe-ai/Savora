# Savora: Anweisungen für Claude

Savora ist eine Vanilla-JS-PWA (persönliches Kochbuch), live über GitHub Pages: https://yaniske-ai.github.io/Savora/ (öffentliches Repo, Tests über GitHub Actions). Der Nutzer ist kein Entwickler und lebt in Basel.

## Kommunikation
- Deutsch mit Schweizer Schreibweise (ss statt ß), keine Gedankenstriche mitten im Satz, kurze klare Sätze. Fachbegriffe kurz erklären.
- Uhrzeiten immer in Basel-Zeit (`TZ=Europe/Zurich date`), nie UTC. Bei langen Arbeiten regelmässig die Restzeit melden.
- Wenn der Nutzer handeln muss: Schritt für Schritt, Klick für Klick.
- Ehrlich berichten: nie ungetestete Tests als bestanden melden; Nicht-Getestetes (iPhone/Safari, Druck) ausdrücklich nennen.

## Arbeitsweise (Pflicht, siehe Skill `.claude/skills/savora-release/SKILL.md`)
- Daten nie verlieren: Rezepte, IDs, Bilder, Bücher, Einstellungen bleiben; Änderungen additiv und versioniert; nie localStorage/IndexedDB leeren; Nährwert `null` ist nicht 0. Keine API-Schlüssel im Frontend.
- Release: `VERSION`, `legal.js APP_VERSION`, `sw.js SW_VERSION`, `CHANGELOG.md` gemeinsam erhöhen; neue Dateien in `sw.js` (SHELL_ASSETS bzw. OPTIONAL_ASSETS); neue Tests in `tests/run_all.py` und `tests/ci_shards.py` (`python tests/ci_shards.py check`).
- Mergen: PRs mit Auto-Merge (`gh pr merge --merge --auto`), nur bei grüner Prüfung, nie Schutzregeln umgehen, nie force-push/rebase. Der Nutzer will keine Rückfrage vor dem Merge, wenn alles grün ist.

## Fehler, die schon passiert sind (nicht wiederholen)
1. **Mac grün, Linux rot (PDF):** html2canvas setzt Text auf Linux tiefer. Jeder PDF-Text braucht von Anfang an Reserve (Aliasschriften mit `descent-override`, Abstand unten). Abnahme immer auch mit `SAVORA_PDF_TEXT_SHIFT_MM=0.3` (`tests/pdf_harness.py`).
2. **Verirrte Klammer nach Merge:** Eine überzählige `}` in `styles-v2.css` verwarf still die 320-px-Regel. Nach JEDEM Zusammenführen: `markers`, `paket27`, `paket2`, `shell`, `ci_shards check`, Klammern zählen, erst dann pushen. CSS-Konflikte als `Basis + Anhang A + Anhang B` lösen.
3. **Alte Tests nach Umbau:** Beim Umbau von Seiten/Routen alle Tests per `grep` finden, die die alte Struktur erwarten, und vor der Fertigmeldung anpassen.
4. **Überlastung:** Zu viele Helfer und Browser gleichzeitig (Last 70 bis 90) erzeugen falsche Fehler. Höchstens 5 Helfer, höchstens 2 Testbrowser, Basisports 1000 auseinander; Läufe unter Last einzeln wiederholen.
5. **Plattformabhängige Schnappschüsse:** Layout-Vergleiche mit fester Messfunktion, nicht mit echter Schriftmessung (Linux misst anders).
6. **CSS-Grossschreibung im PDF:** `text-transform: uppercase` verlängert «ß» und bricht html2canvas; im Raster-Klon wird der Text per `toLocaleUpperCase('de-CH')` gesetzt (`pdfApplyTextTransform`). Testfälle mit «ß», Umlauten und Akzenten immer mitnehmen.
7. **Gemeinsamer Arbeitsbaum:** Parallele Helfer im selben Worktree committen nur ihre eigenen Dateien (`git add <dateien>`, nie `-A`).
8. **Auto-Fix-Meldungen zu altem Stand:** Head-Commit prüfen, bevor man «behebt»; bei altem Stand auf den neuen Lauf warten.
9. **Fehler zuerst im Log lesen** (`gh api repos/YanisKe-ai/Savora/actions/jobs/<id>/logs --allow-escape-sequences`), dann beheben, nicht raten.
10. **Visuelle Treue:** Wenn der Nutzer Referenzbilder oder Code-Vorlagen liefert, diese 1:1 umsetzen und mit Vergleichsbild prüfen, bevor «fertig» gemeldet wird.

## Tests
- Python: `/Users/yanis/Desktop/Savora/savora-repo/.venv/bin/python` (bei «Connection closed»: `brctl download .venv`).
- `SAVORA_BASE_PORT=<port> .venv/bin/python tests/run_all.py <name>`; einzelne Datei mit `SAVORA_TEST_PORT=<port>`.
- PDF-Abnahme: echte PDFs erzeugen, mit `pdftoppm` rendern und ansehen, `pdftotext` vergleichen.
