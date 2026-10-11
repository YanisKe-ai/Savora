# Savora: Marke und Kochbuch-Titelblätter

## Marke (verbindlich seit 0.64.0)
- App-Icon und Favicon: die «Prise» (Variante 02 Tinte). Dateien in `assets/logo/` (`savora-app-icon*.svg/png`, `savora-favicon*.svg/png`); `icon-512/192/180/96/32.png` und `icon-512/192-maskable.png` im Hauptordner sind daraus abgeleitet (gleiche Dateinamen für das Manifest). iOS: `AppIcon-512@2x.png` (1024, ohne Alpha) und die Startbilder (Creme mit roter Wortmarke, dunkel mit cremefarbener Wortmarke).
- In der App steht nur die Wortmarke «savora» (Teigschrift, Pfad-SVG 1200 x 400, kein Text und keine Schriftdatei): Kopfzeile, Seitenleiste, Startbild. Kein Handsymbol daneben. Einbettung als Inline-SVG über `wordmarkSvg()` in `cover.js`; die Farbe steuert CSS über `data-theme` (Hell `#B93B2C`, Dunkel `#F7F4EE`), kein Filter, kein Flackern. Quellen: `savora-wortmarke-light.svg` und `-dark.svg`.
- Die Symbol-SVGs (`savora-symbol-*.svg`) sind ergänzende Markenassets und werden in der App nicht angezeigt.
- Titelblatt und PDF: oben rechts die Wortmarke (dunkle Fläche Creme `#F7F4EE`, helle Fläche Tinte `#252720`), Breite 27 % der Seite, rechter Rand bei 92 %. Die Option «Savora-Wortmarke oben rechts auf dem Titelblatt» (`showLogo`) blendet sie aus.
- Lilita One und Public Sans sind die App-Schriften und von der Wortmarke unabhängig.
- Die Cover-PNGs enthalten kein eingebranntes Zeichen im Bereich oben rechts (geprüft an allen zehn).

## Titelblätter
- Hintergründe: `assets/covers/01-pop.png` bis `10-ofenglueck.png` (unverändert, ohne Text), Vorschaubilder in `assets/covers/thumbs/`.
- Vorlagen-IDs (stabil, nie nach Reihenfolge gespeichert): `pop`, `lieblingsbuch`, `tomate`, `salbei`, `nachtkueche`, `citrus`, `bistro`, `garten`, `sonnenkueche`, `ofenglueck`.
- Ebenen: Hintergrund, Wortmarke oben rechts, optionale Texte (Name des Kochbuchs, Untertitel/Slogan, Name), Datum unten rechts. Ohne Eingaben erscheinen nur Wortmarke und Datum.
- Konfiguration: `cfg.cover = { v: 1, templateId, date: 'YYYY-MM-DD', showDate }` in der Kochbuch-Konfiguration; die Texte stehen weiter in `cfg.title`, `cfg.subtitle` (Slogan) und `cfg.author` (Name). Das Datum wird beim ersten Öffnen einmalig mit dem lokalen heutigen Datum vorbelegt und bleibt danach stabil (Text, keine Zeitzonen-Umrechnung).
- Layout: `COVER_TEMPLATES` in `cover.js` (sichere Zonen relativ zur Seite, Textfarbe je Hintergrund). Die Lesbarkeit (>= 4,5:1) und freie Zonen werden in `tests/test_paket35.py` mit den echten Pixeln geprüft.
- Zeichnen: eine Funktion (`coverDraw`) für Vorschau und PDF. Die PDF-Seite ist ein gezeichnetes Bild in doppelter Seitenauflösung, der Text steckt zusätzlich unsichtbar im PDF (auswählbar und durchsuchbar).

## Grenzen
- Die Hintergründe haben 1055 x 1491 Pixel. Auf A4 sind das etwa 127 dpi, kein 300-dpi-Druck. Für hochwertigen Druck müssten die flachen Formen als SVG nachgezeichnet werden. Es wird keine höhere Qualität vorgetäuscht.
- Die Wortmarke im PDF ist Teil des gezeichneten Bildes (kein PDF-Vektorobjekt), die Textebene ist unsichtbar. Echter sichtbarer PDF-Text wird von der vorhandenen Export-Pipeline (html2canvas und jsPDF) nicht geliefert.
- Das Titelblatt-Bild aus einem Rezeptfoto (`coverRecipeId`) wird nicht mehr angeboten, der gespeicherte Wert bleibt erhalten.
