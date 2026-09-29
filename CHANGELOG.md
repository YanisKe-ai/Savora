# Changelog

Format: neueste Version oben. `VERSION` und `SW_VERSION` in `sw.js` werden bei jeder Änderung gemeinsam erhöht.

## Unveröffentlicht (Branch dev)
- 0.27.0 (SW v27-paket1): Rezeptseite kompakter (Foto 2:1, Titel nur einmal, Zutaten ohne Scrollen sichtbar, feste Kochmodus-Leiste). Startseite: "Zuletzt bearbeitet" erst ab 4 Rezepten. Rezepte ohne Foto: Anfangsbuchstabe auf Farbverlauf. Tippflächen mindestens 44 px. `import.js` entfernt. Zeile "Aus deinem eigenen Kochbuch" entfernt.
- 0.26.0 (SW v26-ios-native): iOS-App mit Capacitor vorbereitet (`ios/`, `capacitor.config.json`, `scripts/build-www.js`, `assets/`).
- Neue Datei `native.js`: PDF, Sicherung und Einkaufsliste über das iOS-Teilen-Fenster, Bildschirm bleibt im Kochmodus an, Timer-Benachrichtigung. Im Browser unverändert (Rückfall auf Web-Version).
- Service Worker wird in der nativen App nicht registriert.
- Neuer Test `tests/test_native.py` (simuliert die nativen Plugins).
- Tests ins Repo übernommen (`tests/`), laufen lokal und bei jedem Push über GitHub Actions.
- Datenerhalt-Test vergleicht gegen einen früheren Git-Commit (v20).
- `VERSION` und `CHANGELOG.md` eingeführt.

## 0.25.0 (SW v25-pruefbericht, 30.09.2026)
- Korrekturen aus dem Prüfbericht F01 bis F11: Wochenplan-Daten zeitzonenfest, Kochschritt-Zutaten, Komma-Zahlen, PDF-Bilder unverzerrt, Text und Seitenzahlen im Kochbuch-PDF.

## 0.24.0 (SW v24-design-vorlage, 29.09.2026)
- Neue Design-Vorlage eingebaut.

## 0.23.0 (SW v23-closed-beta, 29.09.2026)
- Geschlossene Testphase: Registrierung gesperrt, Konten nur auf Einladung.

## 0.22.0 (SW v22-cloud-sync, 29.09.2026)
- Synchronisation über Supabase (Anmeldung, Abgleich, Fotos, Konto löschen).

## 0.21.0 (SW v21-feast-bloom, 29.09.2026)
- Redesign "Feast × Bloom" (Kochmodus, Zutatengruppen, Einkauf, Kochbuch).

## 0.20.0 (SW v20-quality-update, 12.09.2026)
- Qualitätsupdate; bis hier ältere Stände siehe Git-Historie.
