# Changelog

Format: neueste Version oben. `VERSION` und `SW_VERSION` in `sw.js` werden bei jeder Änderung gemeinsam erhöht.

## Unveröffentlicht (Branch dev)
- 0.37.0 (SW v37-paket11): iOS-App: Kamera-Hinweistext (`NSCameraUsageDescription`, sonst kann die Barcode-Suche abstürzen), Foto-Hinweistext, Verschlüsselungs-Angabe (`ITSAppUsesNonExemptEncryption`), Link-Vorschau aus, kein Gummiband-Effekt im Dunkelmodus (verhindert hellen Blitz am Rand), Stil-Haken `is-native`.
- 0.36.0 (SW v36-paket10): Text-Import deutlich robuster: Kopfzeilen wie "Zutaten für 4 Portionen", "So geht's" und "Ingredients", Emoji-Nummern (1️⃣), Emoji im Titel, Portionen und Zeit aus "Für 8 Stück ⏱ 45 Min" und "Arbeitszeit/Gesamtzeit", Hashtags auch nach Tipps, Zubereitung ohne Überschrift wird als Schritte erkannt und in Sätze zerlegt, Brüche ("1 1/2 dl", "½ TL") und Bereiche in Zutaten. Timer: "1 Std. 30 Min." ist ein Timer (90 Min.), "eine halbe Stunde", "Viertelstunde". Neuer Test `test_import.py` (9 Textmuster, 12 Timer-Fälle).
- 0.35.0 (SW v35-paket9): Suche tolerant: Umlaute und Akzente egal ("gemuse", "Gemuese", "Gemüse"), Bindestriche zählen als Leerzeichen, mehrere Wörter müssen alle vorkommen (auch verteilt auf Titel, Zutaten, Tags). Neu: Sortierung (Zuletzt bearbeitet, A bis Z, Zuletzt gekocht, Kürzeste Zeit) im Filterdialog.
- 0.34.0 (SW v34-paket8): Feinschliff nach Bildkontrolle: Formular-Schrittleiste zeigt auf dem Handy alle 5 Schritte (nur der aktive mit Namen, wird in den sichtbaren Bereich gescrollt), Knöpfe "Rezept speichern" und "PDF erstellen" brechen nicht mehr um, Sicherungs-Erinnerung kompakter, Wortlaut bei Synchronisation.
- 0.33.0 (SW v33-paket7): Breite Bildschirme ab 900 px (iPad quer, Desktop): Seitenleiste statt unterer Leiste, Rezeptseite zweispaltig (Zutaten links, Zubereitung rechts), 4 Spalten im Rezeptraster ab 1240 px. Schmale Bildschirme unverändert.
- 0.32.0 (SW v32-paket6): Kochmodus: Schriftgrösse in drei Stufen ("Aa"), Timer-Leiste mit allen laufenden Timern (auch aus anderen Schritten, "+1 Min.", Tippen springt zum Schritt). Haptisches Feedback in der iOS-App (`@capacitor/haptics`). Sicherungs-Erinnerung auf der Startseite (ab 3 Rezepten, nach 14 Tagen ohne Sicherung, "Später" für 7 Tage). Nährwerte in "Mehr" ausblendbar (Reiter und PDF-Option). Einstiegsschritte im leeren Kochbuch.
- 0.31.0 (SW v31-paket5): Darstellung: Kontrast im Dunkelmodus behoben (feste Farbe durch Variable ersetzt), Systemelemente folgen dem Modus (`color-scheme`), Browserleiste (`theme-color`) und iOS-Statusleiste passen sich dem gewählten Modus an (`@capacitor/status-bar`). Barrierefreiheit: Kochmodus als Hauptbereich, Backofen-Tabelle ohne ungültige Rollen, Überschrift auf "Mehr". Neue Tests `test_a11y.py` (axe-core, 72 Kombinationen) und `test_theme.py`.
- 0.30.0 (SW v30-paket4): Formular: Zutatenzeile in der Reihenfolge Menge, Einheit, Name (breit in einer Zeile, schmal Menge/Einheit oben, Name darunter). Neu: "Mehrere einfügen" mit Vorschau (`ingredient-paste.js`): Zutatenliste einfügen, Menge, Einheit und Gruppen werden erkannt, bestehende Zutaten bleiben.
- 0.29.0 (SW v29-paket3): Masseinheiten-Rechner neu (`unit-converter.js`): vier Reiter (Gewicht, Volumen, Temperatur, Zutaten), dl als Einheit, Tasse/EL/TL in Gramm für 15 Zutaten (Richtwerte), Backofen-Umrechnung mit Gasstufe und Heissluft, Löffel und Tasse wählbar (Schweiz oder USA), Ergebnisse per Tippen kopieren, Schnellwerte. Die globalen Einheitentabellen (Import, Einkauf) bleiben unverändert.
- 0.28.0 (SW v28-paket2): Rechtliche und allgemeine Texte überarbeitet (neue Datei `legal.js`): Datenschutz, Nutzungsbedingungen, Datenquellen, neue Seite Lizenzen, Über Savora mit Version, Hilfe mit häufigen Fragen. Kontaktangaben stehen als markierte Platzhalter in `LEGAL`. Einheitlich "Sicherung" statt "Backup", typografisch korrekte Anführungszeichen, persönliche Beispiele im Profil ersetzt, Allergen-Hinweis bei Nährwerten.
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
