# Savora Designsystem (Rebranding Phase 1)

Stand: Version 0.61.0. Diese Regeln gelten für alle Ansichten, Hell, Dunkel und AMOLED. Neue Oberflächen folgen ihnen, ohne neue Farben, Schriften oder Rundungen einzuführen.

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
| Einstellungen | Daten, Anzeige, Hilfe (sechs Zeilen) | je Zeile |

Regeln:
- Jede Ansicht hat genau eine erkennbare Hauptaktion (rot gefüllt oder die erste Zeile).
- Nach Aufgaben gruppieren, nicht nach Technik: Einstellungen in drei Gruppen mit sechs Zeilen: "Deine Daten" (Konto und Sicherung, Freunde & Rezepte senden), "Anzeige & Einheiten" (Anzeige, Masseinheiten-Rechner), "Hilfe & Infos" (Hilfe erhalten, Über Savora mit Rechtlichem). Verwandtes steht auf einer Seite mit Abschnittsüberschrift und einem Satz (Konto und Sicherung, Anzeige); Zeilen und Texte brechen um, nichts wird abgeschnitten.
- Selten benutzte Dinge (Sicherung, Synchronisation, PDF-Gestaltung) liegen in Einstellungen, nicht auf der Startseite. Die Startseite zeigt nur dann einen Hinweis, wenn eine Handlung nötig ist (z. B. noch keine Sicherung), und dieser Hinweis ist leise.
- Das Rezeptdetail führt zum Kochen: Titel, Zeit und Menge ("Ergibt"), danach "Kochen starten", danach vier ruhige Zweitaktionen, danach die Reiter Zutaten, Zubereitung, Nährwerte und (nur wenn vorhanden) Notizen. "Notiz hinzufügen" bleibt im Menü.

## 3. Farben (Variablen in `styles.css`, `styles-v2.css` ergänzt nur)

Warme Flächen, ruhiges Salbei, Tomatenrot nur für Handlung. Alle Werte stehen zentral in `styles.css` (`:root`, `[data-theme="dark"]`, `[data-theme="amoled"]`). "Wie dein Gerät" setzt automatisch Hell oder Dunkel.

| Rolle | Hell | Dunkel | Schwarz (AMOLED) |
| --- | --- | --- | --- |
| Seite `--bg` | #F7F4EE | #1B1A17 | #000000 |
| Fläche `--card-bg` | #FFFDF8 | #24231F | #121110 |
| Ruhige Salbeifläche `--surface-soft` | #E1E7DC | #2C2F28 | #1A1C17 |
| Gewählt `--surface-selected` | #D1D9CA | #3A3E35 | #2A2D25 |
| Tinte `--text` | #252720 | #F1EDE4 | #F1EDE4 |
| Zweittext `--text-soft` | #5B5E52 | #BDB9AC | #BDB9AC |
| Hauptknopf `--tomato` (Text `--on-tomato`) | #B93B2C (weiss) | #FF9B80 (#1B1A17) | #FF9B80 (#1B1A17) |
| Rot als Text/Symbol `--violet` | #A93324 | #FF9B80 | #FF9B80 |
| Aktiver Chip, aktive Fläche `--lime` (Text `--lime-ink`) | #F2D8CE (#252720) | #4D2C24 (#FFD9CC) | #43261F (#FFD9CC) |
| Haarlinie `--hairline` | 10 % Tinte | 12 % Tinte | 12 % Tinte |

(Die Variablennamen `--violet` und `--lime` sind historisch und bleiben aus Kompatibilitätsgründen; `--lime` ist jetzt die zarte Tomatenfläche.)

Gemessene Kontraste (Test `test_paket37_visual.py` misst sie in allen drei Darstellungen): Text auf Seite und Salbei mindestens 4.5:1 (Tinte auf Seite 13.8:1), Hauptknopf weiss auf #B93B2C 5.6:1 (Dunkel: #1B1A17 auf #FF9B80 8.5:1), grosse Schrift mindestens 3:1.

Regeln:
- **Ein Akzent.** Rot steht für Handlung (Hauptknopf "Kochen starten", Zähler, aktiver Reiter, Merken, Häkchen). Alles andere ist neutral.
- Text mindestens 4.5:1 Kontrast, grosse Schrift und Symbole 3:1, Hauptknopf mindestens 5.5:1.
- Kein reines Schwarz ausser dem Hintergrund im Schwarzmodus, kein reines Weiss.
- Gold bleibt dem Logo (Dampf) vorbehalten. Das rote Lesezeichen im Zeichen bleibt immer rot (#E64B35), das Zeichen selbst ist hell auf dunkel und dunkel auf hell, nie automatisch invertiert; das App-Symbol bleibt schwarz.
- PDF-Vorlagen haben eigene Farben und Schriften (`--font-pdf-display`, `--font-pdf-sans`) und sind bewusst getrennt.

## 4. Typografie

- **Public Sans** (variabel, 100 bis 900) für Navigation, Formulare, Zutaten, Einstellungen, Schaltflächen, Fliesstext sowie Seitentitel und Abschnitte (700). Variable `--font-sans` und `--font-display`.
- **Lilita One** (nur Normalgewicht 400) nur für Rezepttitel (Rezeptansicht, Karten, Listen, Titel im Kochmodus) und Buchtitel (Kochbücher-Liste, Kopf des Kochbuch-Editors). Variablen `--font-title` und `--font-serif`. Immer `font-synthesis: none` (kein künstliches Fett), Laufweite 0, Zeilenhöhe 1.1 bis 1.15, `overflow-wrap: anywhere` und `hyphens: auto`. Rezepttitel im Wochenplan, im Einkauf und in «Heute geplant» bleiben Public Sans (ruhiger, dort stehen sie neben Bedienelementen). Nie für Bedienung.
- Schriftzug "savora": Archivo (Logo), unverändert. Sofia Sans Extra Condensed und Roboto bleiben nur für PDF-Vorlagen geladen.
- Beide Schriften liegen lokal (`public-sans.woff2`, `lilita-one.woff2`, nur lateinische Zeichen), stehen in den Preloads von `index.html` und in `SHELL_ASSETS` von `sw.js`. Lizenz: SIL Open Font License 1.1 (Public Sans: Copyright The Public Sans Project Authors; Lilita One: Copyright The Lilita One Project Authors). Der Lizenzhinweis gehört auch in die Lizenzseite der App.
- Skala (rem, folgt der Systemschrift): Seitentitel 1.625 bis 2 (Startseite) bzw. 1.75 bis 2.25, Rezepttitel in der Ansicht 1.75 bis 3, Abschnitt 1.25, Zutatengruppe 1.125, Lesetext 1.0625 (17 px), Hilfstext und Meta 0.875 bis 0.9375, **nichts unter 0.875 (14 px)** ausser Zähler-Badges (12 px, fett). Kochmodus: Schritt `clamp(1.75rem, 1.4rem + 1.6vw, 2.25rem)`, Zutaten-Chips 1.125.
- Zeilenabstand Lesetext 1.55 bis 1.65, Messlänge höchstens 65 Zeichen. Lange Titel brechen um (`overflow-wrap: anywhere`), nichts läuft bei grosser Systemschrift über.
- Zahlen in Tabellen und Meta tabular. Keine Grossbuchstaben-Zeilen als Dekoration.

## 5. Layout und Abstände

- Abstandsskala 4 px (in rem), ausser 0, 1 und 2 px. Der Test `test_paket27.py` prüft das.
- Seitenrand 16 px, Inhalt höchstens 1180 px, Detail ab 900 px zweispaltig (Zutaten links, Zubereitung rechts).
- Rundungen (eine Regel): Karten und Fotos 20 px (`--r-card`), Eingaben 14 px (`--r-ctl`), Chips, Knöpfe und Umschalter Pille, runde Knöpfe und Häkchen rund, Fenster oben 28 px.
- Tiefe: `--lift-1` und `--lift-2` (leichter, getönter Schatten), dazu Haarlinie `--hairline`. Keine Leuchtränder, keine Block-Schatten.
- **Keine verschachtelten Karten.** Foto-Karten und Listen haben keinen Rahmen: Foto mit Titel darunter, Listen flach mit feinen Trennlinien. Eine Gruppe in den Einstellungen ist Überschrift plus eine Karte.
- Tippflächen mindestens 44 px.

## 6. Bildsprache

- Rezeptfotos sind der Hauptinhalt: nie verzerren (`object-fit: cover`), Karte 5:4, Ansicht 16:10.
- **Ohne Foto gibt es keinen Buchstaben-Platzhalter und keine leere Bildfläche.** Raster: kompakte typografische Karte (Salbeifläche, Titel in Lilita One, Meta darunter), gleich hoch wie eine Foto-Karte. Liste: Zeile ohne Vorschaubild. Rezeptansicht: typografischer Kopf (Titel gross in Fraunces, Zeit und Menge), kein Bildband. Während ein gespeichertes Foto lädt, steht kurz eine ruhige leere Salbeifläche.
- Symbole: eine Strichstärke, eine Familie (die vorhandenen Linien-Icons), Farbe Tinte oder Zweittext, Rot nur für aktive Zustände.
- App-Symbol: schwarz mit weissem Zeichen und rotem Detail (`assets/logo/`). Quellen in `assets/logo-src/`.

## 7. Komponenten

- **Hauptknopf:** `--tomato`, Pille, 52 bis 56 px hoch, ein Mal pro Ansicht (Rezeptansicht: "Kochen starten").
- **Nebenknopf (`outline-btn`):** Salbeifläche, Pille, ohne Rahmen, 44 px. **Zweitaktionen** der Rezeptansicht (Einkaufen, Planen, Bearbeiten, Teilen, `tool-action`) ohne Fläche, Symbol über Beschriftung, mindestens 56 px.
- **Chip:** Salbeifläche, aktiv `--lime` mit Tinte und rotem Innenring. Filterstreifen: Chips scrollen waagrecht mit Ausblendrand rechts, daneben Filterknopf und Raster/Liste.
- **Karte (`rcard`, `rrow`, `panel`):** Haarlinie plus `--lift-1`, 20 px.
- **Häkchen:** rund, bei "an" rot gefüllt.
- **Fenster (Sheet):** von unten, 28 px Ecken, Ziehleiste, ab 640 px mittig.
- **Navigation:** aktive Kapsel `--lime`, Zähler `--tomato`.
- **Zustände jeder Komponente:** Ruhe, Hover (nur mit Zeiger), Fokus (2 px Ring), Aktiv (scale 0.97, 100 ms), Deaktiviert (50 % und `not-allowed`).

## 8. Bewegung

- Häufige Aktionen sofort (Antippen: 100 bis 140 ms). Eingänge mit `--ease-out` (cubic-bezier(0.23, 1, 0.32, 1)), Fenster mit `--ease-drawer`.
- Nur transform und opacity. Bei "Bewegung reduzieren" keine Bewegungsanimationen.
- Toast: Eingang 220 ms, Ausgang 160 ms in dieselbe Richtung. Häkchen: Zustandswechsel 120 ms, kein Sprung. Fokus ohne Übergang.
- Seitenwechsel mit Richtung (vorwärts von rechts, zurück nach rechts).

## 9. Zustände

- **Leer:** jede Hauptansicht erklärt, was fehlt, und bietet die nächste Handlung als Knopf (Rezepte, Wochenplan, Einkauf).
- **Pflichtfelder:** Fehler direkt am Feld (Text mit `role=alert`, roter Rahmen, `aria-invalid`), Fokus springt zum Feld, nichts wird gespeichert. Beim Tippen verschwindet der Fehler.
- **Mehrfachaktionen:** Speichern ist gegen Mehrfachklick geschützt.
- **Erfolg:** kurze Meldung (Toast), Rückmeldung nie nur über Farbe.

## 10. Prüfung

`python tests/run_all.py` (inkl. `test_paket27.py` Abstände, `test_a11y.py` Kontrast und Tippflächen, `test_paket30.py` extreme Inhalte). Neue Ansichten müssen bei 320, 390 und 1280 px ohne seitliches Scrollen laufen.
