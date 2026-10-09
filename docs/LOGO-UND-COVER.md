# Savora: Symbol und Kochbuch-Titelblätter

## Symbol
- Quellen: `assets/logo/savora-symbol-light.svg` (dunkel, für helle Flächen), `savora-symbol-dark.svg` (weiss, für dunkle Flächen), `savora-symbol-adaptive.svg`, `savora-app-icon.svg` und `savora-app-icon-maskable.svg` (schwarzer Grund).
- In der App wird das Symbol als Vektor eingebettet (`coverSymbolSvg` in `cover.js`) und folgt über `currentColor` dem gewählten Theme (kein Umschalt-Flackern). Das Lesezeichen bleibt immer `#E64B35`.
- Im PDF richtet sich die Symbolfarbe nach der Coverfläche (dunkel oder weiss), nie nach dem App-Theme.
- App-Symbole: `icon-512/192/180/96/32.png` aus dem App-Icon, `icon-512/192-maskable.png` aus der Maskable-Variante (Sicherheitsrand 10 %). iOS: `AppIcon-512@2x.png` und die Startbilder.
- Das Wort "savora" wird mit der vorhandenen App-Schrift gesetzt, nicht aus der Referenztafel übernommen.

## Titelblätter
- Hintergründe: `assets/covers/01-pop.png` bis `10-ofenglueck.png` (unverändert, ohne Text), Vorschaubilder in `assets/covers/thumbs/`.
- Vorlagen-IDs (stabil, nie nach Reihenfolge gespeichert): `pop`, `lieblingsbuch`, `tomate`, `salbei`, `nachtkueche`, `citrus`, `bistro`, `garten`, `sonnenkueche`, `ofenglueck`.
- Ebenen: Hintergrund, Symbol oben rechts, optionale Texte (Name des Kochbuchs, Untertitel/Slogan, Name), Datum unten rechts. Ohne Eingaben erscheinen nur Symbol und Datum.
- Konfiguration: `cfg.cover = { v: 1, templateId, date: 'YYYY-MM-DD', showDate }` in der Kochbuch-Konfiguration; die Texte stehen weiter in `cfg.title`, `cfg.subtitle` (Slogan) und `cfg.author` (Name). Das Datum wird beim ersten Öffnen einmalig mit dem lokalen heutigen Datum vorbelegt und bleibt danach stabil (Text, keine Zeitzonen-Umrechnung).
- Layout: `COVER_TEMPLATES` in `cover.js` (sichere Zonen relativ zur Seite, Textfarbe je Hintergrund). Die Lesbarkeit (>= 4,5:1) und freie Zonen werden in `tests/test_paket35.py` mit den echten Pixeln geprüft.
- Zeichnen: eine Funktion (`coverDraw`) für Vorschau und PDF. Die PDF-Seite ist ein gezeichnetes Bild in doppelter Seitenauflösung, der Text steckt zusätzlich unsichtbar im PDF (auswählbar und durchsuchbar).

## Grenzen
- Die Hintergründe haben 1055 x 1491 Pixel. Auf A4 sind das etwa 127 dpi, kein 300-dpi-Druck. Für hochwertigen Druck müssten die flachen Formen als SVG nachgezeichnet werden. Es wird keine höhere Qualität vorgetäuscht.
- Das Symbol im PDF ist Teil des gezeichneten Bildes (kein PDF-Vektorobjekt), die Textebene ist unsichtbar. Echter sichtbarer PDF-Text wird von der vorhandenen Export-Pipeline (html2canvas und jsPDF) nicht geliefert.
- Das Titelblatt-Bild aus einem Rezeptfoto (`coverRecipeId`) wird nicht mehr angeboten, der gespeicherte Wert bleibt erhalten.
