# Arbeitsablauf: Änderung prüfen und live stellen

Grundregel: `main` ist der Live-Stand (https://yaniske-ai.github.io/Savora/). Gearbeitet wird nur auf `dev`.

## Eine Änderung prüfen und live stellen
1. Änderungen entstehen auf dem Branch `dev` (macht Claude, sonst niemand).
2. Beim Hochladen von `dev` starten bei GitHub automatisch alle Tests.
   Ergebnis ansehen: https://github.com/YanisKe-ai/Savora/actions
   - Grüner Haken: alle Tests bestanden.
   - Rotes Kreuz: mindestens ein Test ist fehlgeschlagen. Nicht live stellen, Claude die Meldung geben.
3. Bei grünem Haken: https://github.com/YanisKe-ai/Savora/pulls, "New pull request", base `main`, compare `dev`, "Create pull request".
4. Warten, bis der Check `tests` grün ist, dann "Merge pull request" und "Confirm merge".
5. Nach ca. 1 bis 2 Minuten ist die Änderung live. Danach die Seite neu laden (bei der PWA ggf. einmal schliessen und neu öffnen).

## Tests lokal ausführen
    cd savora-repo
    . .venv/bin/activate
    python tests/run_all.py

## Regeln
- Bei jeder Änderung `VERSION` und `SW_VERSION` in `sw.js` erhöhen, Eintrag in `CHANGELOG.md`.
- Neue Dateien in die Shell-Liste von `sw.js` aufnehmen.
- Nicht ausgeführte Tests (Meldung "UEBERSPRUNGEN") gelten nicht als bestanden.
- Die private Sicherung für die Prüfbericht-Tests gehört nach `tests/private/` und wird nie eingecheckt.

## iOS-App auf dem iPhone aktualisieren (alle 7 Tage oder nach Änderungen)
1. iPhone per Kabel anschliessen und entsperren.
2. Im Ordner savora-repo im Terminal: `bash scripts/ios-deploy.sh`
3. Danach Savora auf dem iPhone öffnen. Die Daten in der App bleiben beim Neuaufspielen erhalten, solange die App nicht vorher gelöscht wurde.
Hinweis: Mit dem kostenlosen Personal Team läuft die App 7 Tage. Ist sie abgelaufen, startet sie nicht mehr, dann einfach neu aufspielen.
Beim ersten Start nach Neuaufspielen ggf. unter Einstellungen, Allgemein, VPN & Geräteverwaltung erneut vertrauen.
