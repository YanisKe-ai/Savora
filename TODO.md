# Savora: To-do-Liste

Stand: 30.09.2026. Reihenfolge nach Nutzen und Aufwand. Alles läuft auf `dev`, jedes Paket als eigener Pull Request mit grünen Tests. `main` wird nur von Yanis zusammengeführt.
Aufwand = geschätzte reine Arbeitszeit von Claude. Grundlage: Analyse vom 30.09.2026 (Artifact "Savora Analyse").

## Paket 1: Jetzt (ca. 1,5 bis 2 Std.)
- [ ] Rezeptseite kompakter: Foto flacher (16:9), Titel nur einmal, Reiter oben haften, "Kochmodus starten" als feste Leiste unten
- [ ] Startseite entdoppeln: "Zuletzt bearbeitet" als schmale Leiste, erst ab 4 Rezepten
- [ ] Platzhalter für Rezepte ohne Foto: Farbverlauf mit Anfangsbuchstaben statt grauer Kochmütze
- [ ] `import.js` löschen (toter Code, wird nirgends geladen)
- [ ] Zeile "Aus deinem eigenen Kochbuch" auf der Rezeptseite entfernen (nur bei geteilten Rezepten "Von …" zeigen)
- [ ] Tippflächen auf mindestens 44 px: Raster/Liste-Umschalter, Wochenplan-Haken, Plan- und Einkaufs-Menüpunkte

## Paket 2: Rechtliche und allgemeine Texte (ca. 2 bis 3 Std.)
Kein Rechtsrat. Vor einer öffentlichen Veröffentlichung von einer Fachperson prüfen lassen.
- [ ] **Datenschutz** überarbeiten: Verantwortliche Stelle und Kontakt, welche Daten wann verarbeitet werden (lokal, Konto, Synchronisation, Open Food Facts), Dienstleister (Supabase, Region Zürich; Hinweis auf Betreiber und Infrastruktur), Aufbewahrung und Löschung, Rechte (Auskunft, Berichtigung, Löschung), keine Tracker und keine Cookies, iOS-App (Mitteilungen für Timer). Klarstellen, dass die Übertragung verschlüsselt ist (TLS), die Daten aber nicht Ende-zu-Ende-verschlüsselt sind
- [ ] **Nutzungsbedingungen** schreiben (aktuell nur Platzhalter): Beta-Status, private Nutzung, Zugang nur auf Einladung, eigene Inhalte und Urheberrecht bei geteilten Rezepten, Haftungsausschluss, Verfügbarkeit, Kündigung und Kontolöschung
- [ ] **Nährwerte und Allergene:** deutlicher Hinweis, dass Berechnungen Schätzwerte sind und keine Grundlage für Allergiker- oder Diätentscheidungen
- [ ] **Datenquellen und Lizenzen:** Namensnennung und Lizenztexte prüfen (Schweizer Nährwertdatenbank BLV, Open Food Facts mit ODbL, USDA falls aktiv)
- [ ] **Open-Source-Hinweise** ergänzen: Schriften (Roboto, Sofia Sans Extra Condensed, Archivo, Baloo 2), jsPDF, html2canvas, Capacitor mit Lizenzen
- [ ] **Über Savora:** Version, Kontakt, Link zu Datenschutz, Bedingungen und Quellen
- [ ] **Hilfe und Feedback:** echter Kontakt statt "die Person, von der du die App erhalten hast"; kurze Antworten zu Sicherung, Synchronisation, Timer und PDF
- [ ] **Sprachliche Prüfung aller App-Texte:** einheitliche Schweizer Rechtschreibung (ss statt ß), einheitliche Du-Form, einheitliche Schreibweise für Gruppen ("Nutzer_innen" kommt vor), verständliche Fehlermeldungen
- [ ] Impressum nur nötig, wenn die App öffentlich oder gewerblich wird. Entscheidung mit Yanis

**Dafür braucht Claude von Yanis:** Name und Adresse (oder nur Kontakt-E-Mail) der verantwortlichen Person, ob die App privat bleibt oder öffentlich/gewerblich werden soll, gewünschter Kontakt für Hilfe. Bis dahin stehen Platzhalter in eckigen Klammern im Text.

## Paket 3: Masseinheiten-Rechner überarbeiten (ca. 3 bis 4 Std.)
Heute nur Gewicht und Volumen mit einfachem Eingabefeld. Vorschlag:
- [ ] Design: Reiter oben (Gewicht, Volumen, Temperatur, Zutaten), Eingabe im App-Stil, große Ergebnisse, Tippen kopiert das Ergebnis, Umschalt-Knopf zwischen den Einheiten, Schnellwerte (100, 250, 500)
- [ ] **Temperatur:** °C, °F, Gasstufe, Heissluft (etwa 20 °C weniger als Ober-/Unterhitze)
- [ ] **Zutaten:** Tasse, EL, TL in Gramm für gängige Zutaten (Mehl, Zucker, Butter, Milch, Wasser, Honig, Reis, Haferflocken, …), als Richtwerte gekennzeichnet
- [ ] **Definition wählbar:** EL 15 ml und TL 5 ml (metrisch, Schweiz) gegenüber US-Werten; Cup 250 ml oder 236,6 ml
- [ ] Tests für alle Umrechnungen, Komma und Punkt, Brüche, ungültige Eingaben, Hell- und Dunkelmodus

## Paket 4: Formular (ca. 2 bis 3 Std.)
- [ ] Zutatenzeile in einer Zeile: Menge, Einheit, Name
- [ ] "Mehrere Zutaten einfügen": ganzen Block einfügen, Parser trennt Menge, Einheit und Name
- [ ] Fortschrittsanzeige und Speichern jederzeit erreichbar

## Paket 5: Kleinigkeiten (ca. 3 bis 4 Std.)
- [ ] Sicherungs-Erinnerung (z. B. nach 14 Tagen ohne Sicherung)
- [ ] Nährwerte abschaltbar ("Nährwerte anzeigen")
- [ ] Kochmodus: Schriftgröße A−/A+, Timer-Leiste mit Pause und +1 Min., Wischen zum Weiterblättern
- [ ] Rezeptseite: Startseiten-Chips mit Symbolen für Kategorien

## Paket 6: iPad und Desktop (ca. 3 bis 4 Std.)
- [ ] Ab etwa 900 px Seitenleiste statt unterer Leiste
- [ ] Rezeptseite zweispaltig, Zutaten links (bleiben stehen), Zubereitung rechts

## Später
- [ ] Kamera und Foto-Scan (iOS-Texterkennung) in den Text-Import (braucht echtes iPhone zum Prüfen, ca. 4 bis 6 Std.)
- [ ] iOS-Feinschliff: Haptik, Systemschriftgröße (Dynamic Type), Wischen zum Löschen im Einkauf (ca. 2 bis 3 Std.)
- [ ] Alte Oberflächen-Schicht (`views.js`, `styles.css`, `ui.js`) in die neue überführen (ca. 4 bis 8 Std., riskant)
- [ ] Teilen-Menü-Eintrag "An Savora senden" und Live Activity für Timer (Machbarkeit mit Personal Team unklar)
- [ ] Onboarding beim ersten Start (3 Karten)

## Offen, entscheidet oder prüft Yanis
- [ ] Apple Developer Program: später
- [ ] Supabase-Projekt im Dashboard prüfen (Pausierung bei Inaktivität im kostenlosen Tarif)
- [ ] PDF-Vorschau, Wachhalter und Timer-Mitteilung bei gesperrtem Telefon auf dem echten iPhone prüfen (PDF-Vorschau wirkte im Simulator rechts abgeschnitten)
- [ ] Ordner auf dem Schreibtisch aufräumen (über 100 alte ZIPs und Ordner)
- [ ] Lizenzbedingungen der Nährwertdaten vor öffentlicher Veröffentlichung prüfen
