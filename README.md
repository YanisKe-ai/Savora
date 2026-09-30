# Savora

Savora ist ein persönliches, digitales Kochbuch. Es läuft als Web-App (PWA) und als iOS-App. Rezepte, Fotos, Wochenplan und Einkaufsliste bleiben auf dem eigenen Gerät. Eine Synchronisation mit Konto ist optional.

Live: https://yaniske-ai.github.io/Savora/

## Funktionen
- Rezepte anlegen (Formular, Zutatenblock einfügen, Text aus WhatsApp, Instagram oder Webseiten importieren)
- Suche über Titel, Zutaten und Tags (Umlaute egal), Filter, Sortierung, Sammlungen, Favoriten
- Kochmodus: ein Schritt pro Bildschirm, Zutaten je Schritt, Timer (auch bei gesperrtem Telefon in der iOS-App), Bildschirm bleibt an
- Wochenplan und Einkaufsliste (Zutaten aus Rezepten zusammenführen)
- Kochbuch als PDF mit Vorschau, PDF und Sicherung teilen
- Masseinheiten-Rechner (Gewicht, Volumen, Temperatur, Zutaten)
- Nährwert-Schätzung mit der Schweizer Nährwertdatenbank (abschaltbar)
- Hell, Dunkel, Schwarz, System; Handy, iPad und Desktop

## Technik
- Vanilla JavaScript, kein Framework, kein Build-Schritt. Alle Web-Dateien liegen im Hauptordner.
- Daten: IndexedDB `savora-db` (Version 5), offline-first, Service Worker `sw.js`
- Synchronisation: Supabase (Region Zürich), Anmeldung nur auf Einladung
- iOS-App: Capacitor (Ordner `ios/`), Web-Dateien werden nach `www/` kopiert (`npm run build:www`)

## Ausprobieren
```bash
python3 -m http.server 8000
```
Dann http://localhost:8000 öffnen.

## Tests
Einmalig einrichten (Python 3, Node, Homebrew):
```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r tests/requirements.txt && playwright install chromium
npm ci
brew install poppler
```
Alle Tests ausführen:
```bash
python tests/run_all.py
```
Ein einzelner Test: `python tests/run_all.py flows`. Übersicht über alle Tests: siehe `tests/README.md` und `.github/workflows/tests.yml` (läuft bei jedem Push).

## iOS-App
```bash
npm ci
bash scripts/ios-deploy.sh    # baut und installiert auf das verbundene iPhone
```
Mit einem kostenlosen Apple-Personal-Team läuft die App 7 Tage und muss danach neu aufgespielt werden.

## Arbeitsablauf
Siehe [ARBEITSABLAUF.md](ARBEITSABLAUF.md). Änderungen entstehen auf Zweigen, werden per Pull Request geprüft und erst nach grünen Tests in `main` zusammengeführt.

## Rechtliches
Die Texte zu Datenschutz und Nutzungsbedingungen in `legal.js` sind ein Entwurf und kein Rechtsrat. Die Kontaktangaben in `LEGAL` müssen vor einer Veröffentlichung ausgefüllt werden. Eine Lizenz für den Quellcode ist noch nicht festgelegt (alle Rechte vorbehalten).
