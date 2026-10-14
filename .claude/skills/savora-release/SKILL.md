---
name: savora-release
description: Arbeitsregeln für Änderungen an Savora (PWA): Tests, GitHub-CI-Besonderheiten (Linux), Zusammenführen paralleler Branches, Ports, Release-Schritte. Beim Ändern von Code, PDF-Layout, Einstellungen oder beim Zusammenführen und Veröffentlichen verwenden.
---

# Savora: Release- und Testregeln

Diese Regeln stammen aus realen Fehlern (14.10.2026). Sie gelten für alle Helfer und für den Integrator.

## Sprache und Daten
- App-Texte Deutsch mit Schweizer Schreibweise (ss statt ß), keine Gedankenstriche mitten im Satz, kurze klare Sätze.
- Nutzerdaten, IDs, Bilder, Cover, Original-Schriftzug nie verlieren. Änderungen additiv und versioniert, nie localStorage/IndexedDB leeren. Nährwert `null` ist nicht 0.
- Keine API-Schlüssel im Frontend.

## Versionen (nur der Integrator)
Pro Veröffentlichung gemeinsam erhöhen: `VERSION`, `legal.js APP_VERSION`, `sw.js SW_VERSION`, Eintrag oben in `CHANGELOG.md`. Neue Dateien, die offline gebraucht werden, in `sw.js SHELL_ASSETS` eintragen (ein Eintrag auf eine nicht vorhandene Datei bricht den Service-Worker-Install; `tests/test_shell.py` prüft das). Neue Testdateien in `tests/run_all.py` (ALL) und `tests/ci_shards.py` (DAUER); danach `python tests/ci_shards.py check`.

## Tests lokal
- Python: `/Users/yanis/Desktop/Savora/savora-repo/.venv/bin/python`. Bei «Connection closed» fehlen iCloud-Dateien: `brctl download .../.venv`.
- Aufruf: `SAVORA_BASE_PORT=<Port> .venv/bin/python tests/run_all.py <name> ...`. `run_all` vergibt `BASE_PORT + Index`: Basisports mindestens 1000 auseinander wählen, sonst «Address already in use». Einzelne Tests mit `SAVORA_TEST_PORT=<Port> python tests/test_x.py`.
- Nie mehr als zwei Testbrowser gleichzeitig (der Mac wird sonst überlastet, Zeitüberschreitungen sind keine echten Fehler).
- Vor jedem Push, immer: `markers` (Klammern, Konfliktmarker), `paket27` (4px-Abstandsskala), `paket2` (Versionen), `shell`, `ci_shards.py check`. Bei CSS-Änderungen zusätzlich `{` gegen `}` zählen.
- Wer eine Struktur umbaut (Routen, Seiten, Namen), sucht ALLE Tests, die die alte Struktur voraussetzen (`grep -rln "<alter Name>" tests/`), und passt sie an, bevor er fertig meldet. Läufe unter Last nicht als Beweis werten, einzeln wiederholen.

## GitHub-CI ist Linux (Unterschiede zum Mac)
- Klassische Scrollbars: in Tests ausblenden, Reserve von mindestens 16 px einplanen.
- Schriften sind breiter: auf `document.fonts.ready` warten, nicht an knappe Breiten bauen (320 px Navigation, Tabellenspalten).
- PDF: `html2canvas` setzt Text tiefer als die Textbox, auf Linux stärker. Jeder neue PDF-Text bekommt von Anfang an Reserve nach unten (Pur: Schrift «Carlito Pur» mit `descent-override`, `position: relative`, Abstand unten). Das gilt auch für Titel, Quelle, kleine Texte und Mengenspalten. Testen: `tests/test_pdf_ausgabe.py` K01a und `tests/test_pdf_stile.py`.
- Zeitabhängige Tests (paket39, paket37_plan, monkey, paket37_interaction) laufen in `run_all` zuletzt. Keine festen Reihenfolgen annehmen (gleiche Zeitstempel).
- Lokal grün heisst nicht CI grün: Zwischenstände früh als Entwurfs-PR hochladen, damit die Linux-Rückmeldung parallel zur Arbeit kommt.

## Zusammenführen paralleler Branches
- Nie rebase, nie force-push. Basis in den Branch mergen.
- Konflikte in angehängten CSS-Blöcken: `Basis + Anhang A + Anhang B` zusammensetzen, nicht beide Konfliktseiten blind behalten. Danach Klammern zählen.
- Ein stehengebliebenes `=======` oder eine fehlende/überzählige `}` verwirft still alle folgenden CSS-Regeln.
- Direkt nach dem Merge-Commit die Schnelltests (oben) laufen lassen, erst dann pushen.

## Veröffentlichen
- PR mit `gh pr merge --merge --auto` (GitHub mergt bei grüner Prüfung). Nie bei roter oder laufender Prüfung, nie Administratorrechte zum Umgehen. GitHub-Zugriff: `GH_TOKEN="$(gh auth token --user YanisKe-ai)"`.
- Fehler zuerst im Log lesen (`gh api repos/YanisKe-ai/Savora/actions/jobs/<id>/logs --allow-escape-sequences`), dann beheben. Meldungen des Auto-Fix zu einem alten Stand erkennt man am Head-Commit: nichts tun, auf den neuen Lauf warten.
- Danach live prüfen: `curl -s https://yaniske-ai.github.io/Savora/VERSION`.
- Zeiten gegenüber dem Nutzer immer in Basel-Zeit (`TZ=Europe/Zurich date`).
