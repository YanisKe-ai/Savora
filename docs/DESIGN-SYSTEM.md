# Savora Designsystem (Rebranding Phase 1)

Stand: Version 0.54.0. Diese Regeln gelten für alle Ansichten, Hell, Dunkel und AMOLED. Neue Oberflächen folgen ihnen, ohne neue Farben, Schriften oder Rundungen einzuführen.

## 1. Produkt und Richtung

Savora ist das persönliche, digitale Kochbuch einer Einzelperson (Rezepte sammeln, Woche planen, Einkaufen, Kochen). Es wird täglich, einhändig und oft mit nassen Händen am Handy benutzt. Daraus folgt: **Betriebsmodus (Operate)**, nicht Werbeseite. Lesbarkeit, grosse Tippflächen und Ruhe gehen vor Dekoration.

Markencharakter in drei Worten: **warm, klar, appetitlich.** Grundlage ist ein neutraler Raum (Hellgrau oder Anthrazit), in dem Fotos und ein einziger roter Akzent wirken. Das Zeichen (Buch mit Dampf) und der Schriftzug "savora" bleiben unverändert.

Begründung der Farbe: Warme Rottöne gelten als appetitanregend und sind bei Rezept-Apps üblich. Grün (gesund, kühl) und Violett (beliebig) wurden getestet und verworfen. Quellen sind überwiegend Marketingtexte, die Aussage ist eine Orientierung, kein Beweis.

## 2. Informationsarchitektur

Vier feste Hauptbereiche, auf dem Handy als untere Leiste, ab 900 px als Seitenleiste:

| Bereich | Zweck | Hauptaktion |
| --- | --- | --- |
| Rezepte | sammeln, finden, öffnen | Rezept hinzufügen (+) |
| Wochenplan | Tage mit Rezepten belegen | Rezept planen |
| Einkauf | Liste abarbeiten | Zutat hinzufügen |
| Einstellungen | Darstellung, Daten, Hilfe | je Zeile |

Regeln:
- Jede Ansicht hat genau eine erkennbare Hauptaktion (rot gefüllt oder die erste Zeile).
- Nach Aufgaben gruppieren, nicht nach Technik: Einstellungen in "Mein Kochbuch", "App", "Daten und Export", "Werkzeuge", "Hilfe".
- Selten benutzte Dinge (Sicherung, Synchronisation, PDF-Gestaltung) liegen in Einstellungen, nicht auf der Startseite. Die Startseite zeigt nur dann einen Hinweis, wenn eine Handlung nötig ist (z. B. noch keine Sicherung), und dieser Hinweis ist leise.
- Das Rezeptdetail führt zum Kochen: Titel, Zeit und Portionen, danach "Kochmodus starten", danach die Reiter Zutaten, Zubereitung, Nährwerte, Notizen.

## 3. Farben (Variablen in `styles.css` und `styles-v2.css`)

| Rolle | Hell | Dunkel |
| --- | --- | --- |
| Seite `--bg` | #FAFAF8 | #121214 |
| Fläche `--card-bg` | #FFFFFF | #1B1B1F |
| Weiche Fläche `--surface-soft` | #F1F0EE | #242429 |
| Tinte `--text` | #1C1C21 | helles Grau |
| Zweittext `--text-soft` | #6B6B73 | #B4B4BC |
| Akzent `--tomato` | #C93D26 (weisser Text) | #FF9B80 (dunkler Text) |
| Akzent als Text/Symbol `--violet` | #B93822 | #FF9B80 |
| Akzent-Fläche (aktiver Chip, Navigation) `--lime` | #FFDACE | #FFDACE mit Tinte |

(Die Variablennamen `--violet` und `--lime` sind historisch und bleiben aus Kompatibilitätsgründen.)

Regeln:
- **Ein Akzent.** Rot steht für Handlung (Hauptknopf, Zähler, aktiver Reiter, Merken). Alles andere ist neutral.
- Text mindestens 4.5:1 Kontrast, grosse Schrift und Symbole 3:1. Weisser Text nur auf `--tomato`.
- Kein reines Schwarz, kein reines Weiss als Fläche ausser Karten.
- Gold bleibt dem Logo (Dampf) vorbehalten.
- PDF-Vorlagen haben eigene Farben (Vorlage B violett/limette) und sind bewusst getrennt.

## 4. Typografie

- Titel: Sofia Sans Extra Condensed 800 (schmal, kräftig). Text: Roboto. Schriftzug: Archivo.
- Skala (rem, folgt der iOS-Textgrösse): Seitentitel 36 bis 60 px fluid, Abschnitt 1.5, Zutatengruppe 1.5, Unterabschnitt 1.25, Text 1, Meta 0.8.
- Zeilenabstand Lesetext 1.55, Messlänge höchstens 65 Zeichen.
- Zahlen in Tabellen und Meta tabular.
- Keine Grossbuchstaben-Zeilen als Dekoration. Gruppenüberschriften in Listen (kleine Kapitälchen) sind erlaubt, weil sie echte Gruppen benennen.

## 5. Layout und Abstände

- Abstandsskala 4 px (in rem), ausser 0, 1 und 2 px. Der Test `test_paket27.py` prüft das.
- Seitenrand 16 px, Inhalt höchstens 1180 px, Detail ab 900 px zweispaltig (Zutaten links, Zubereitung rechts).
- Rundungen (eine Regel): Karten 20 px (`--r-card`), Bedienelemente 14 px (`--r-ctl`), Chips und Hauptknöpfe Pille, runde Knöpfe und Häkchen rund, Fenster oben 28 px.
- Tiefe: `--lift-1` und `--lift-2` (leichter, getönter Schatten), dazu Haarlinie `--hairline`. Keine Leuchtränder, keine Block-Schatten.
- **Keine verschachtelten Karten.** Eine Gruppe ist Überschrift plus eine Karte.
- Tippflächen mindestens 44 px.

## 6. Bildsprache

- Rezeptfotos sind der Hauptinhalt: nie verzerren (zuschneiden), Seitenverhältnis je Kontext fest (Karte 4:3, Detail Band).
- Ohne Foto: Verlauf in neutralem Ton mit Anfangsbuchstaben, keine erfundenen Fotos, keine Illustrationen als Füllung.
- Symbole: eine Strichstärke, eine Familie (die vorhandenen Linien-Icons), Farbe Tinte oder Zweittext, Rot nur für aktive Zustände.
- App-Symbol: tomatenroter Verlauf, Buch weiss, Dampf hell. Quellen in `assets/logo-src/`.

## 7. Komponenten

- **Hauptknopf:** `--tomato`, Pille, 52 px hoch, ein Mal pro Ansicht.
- **Nebenknopf (`outline-btn`):** weiche Fläche, ohne Rahmen, 44 px.
- **Chip:** weiche Fläche, aktiv `--lime` mit Tinte.
- **Karte (`rcard`, `rrow`, `panel`):** Haarlinie plus `--lift-1`, 20 px.
- **Häkchen:** rund, bei "an" rot gefüllt.
- **Fenster (Sheet):** von unten, 28 px Ecken, Ziehleiste, ab 640 px mittig.
- **Navigation:** aktive Kapsel `--lime`, Zähler `--tomato`.
- **Zustände jeder Komponente:** Ruhe, Hover (nur mit Zeiger), Fokus (2 px Ring), Aktiv (scale 0.97, 100 ms), Deaktiviert (50 % und `not-allowed`).

## 8. Bewegung

- Häufige Aktionen sofort (Antippen: 100 bis 140 ms). Eingänge mit `--ease-out` (cubic-bezier(0.23, 1, 0.32, 1)), Fenster mit `--ease-drawer`.
- Nur transform und opacity. Bei "Bewegung reduzieren" keine Bewegungsanimationen.
- Seitenwechsel mit Richtung (vorwärts von rechts, zurück nach rechts).

## 9. Prüfung

`python tests/run_all.py` (inkl. `test_paket27.py` Abstände, `test_a11y.py` Kontrast und Tippflächen, `test_paket30.py` extreme Inhalte). Neue Ansichten müssen bei 320, 390 und 1280 px ohne seitliches Scrollen laufen.
