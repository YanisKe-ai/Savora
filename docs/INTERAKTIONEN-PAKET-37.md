# Interaktionen (Paket 37): UI-Codeprüfung

Prüfung nach dem Skill «emil-design-eng». Geprüft wurden Fokus, Tastatur, Touch, Dialoge, Scrollposition, Rückmeldungen und reduzierte Bewegung. Automatisch abgesichert durch `tests/test_paket37_interaction.py`.

| Vorher | Nachher | Warum |
| --- | --- | --- |
| `render()` baut `#app` neu auf; nur das Suchfeld behielt den Fokus (`renderKeepFocus`), alle anderen Felder (Formular, Kochbuch-Editor, Text-Import, Konto/Freunde) und alle Buttons verloren Fokus und Cursor | `render()` merkt sich das fokussierte Element (id, data-Attribute oder Klasse plus Index) samt Auswahl und stellt es nach dem Neuzeichnen wieder her (`focusFingerprint` und `restoreFocusFingerprint` in `state.js`) | Tastaturnutzer und Tippende dürfen nie «herausfallen»; gilt zentral für alle Ansichten, nicht nur für eine |
| `focusin`-Handler in `app.js` scrollte jedes fokussierte Feld nach 300 ms weich in die Mitte, auch nach dem Wiederherstellen des Fokus | Kein Scrollen beim Wiederherstellen, kein Scrollen wenn das Feld schon sichtbar ist, bei reduzierter Bewegung `behavior: auto` | Sonst Scrollsprung bei jedem Live-Filter oder Neuzeichnen |
| Auswahlgruppen (`role="radiogroup"`: Titelblatt-Vorlagen, Sortierung, Mahlzeit, Design, Seitenstil) ohne Pfeiltasten | Pfeiltasten und Pos1/Ende bewegen den Fokus und wählen (`actions-v2.js`), Enter/Leertaste wählen per nativem Button; Fokus bleibt auf dem neuen Element | WAI-ARIA-Radiogruppen-Muster; Cover per Tastatur wählbar |
| Escape schloss jeden Dialog sofort, auch mit eingetipptem, nicht übernommenem Text | Escape fragt bei ungespeichertem Text nach («Eingaben verwerfen?»), ohne Eingabe schliesst es sofort; nicht während IME-Eingabe | Kein stiller Datenverlust; Dialoge bleiben mit Escape schliessbar |
| `.fav-toggle` und `.icon-btn` ohne eigene Übergänge (Standard `ease`, kein Drück-Zustand beim Favoriten), `.icon-btn` mit `ease` | Übergänge nur für `transform`, Hintergrund, Farbe, Rand (100 bis 140 ms) mit `--ease-out`; `:active` mit `scale(0.9)` bzw. `0.96` | Drücken sofort sichtbar, einheitliche Kurve, kein `transition: all` |
| Fokusring bei Auswahlelementen (`cover-opt`, `theme-opt`, `sort-chip`, `pdf-tpl-opt`) je nach Hintergrund schwach | Eigener `:focus-visible`-Ring, 3 px | Pfeiltasten-Navigation braucht eindeutig sichtbare Position |
| Reduzierte Bewegung: Drück-Skalierung blieb, `scroll-behavior` nicht ausdrücklich gesetzt | Bei `prefers-reduced-motion: reduce` keine Skalierung bei den neuen Regeln, `scroll-behavior: auto` | Nur Überblenden, keine Bewegung |

## Geprüft und bereits in Ordnung (unverändert)

| Bereich | Befund |
| --- | --- |
| Scrollsprünge | Chips, Sortierung, Filterblatt, Liste/Raster, Favorit, Wochenplan, Einkauf-Abhaken: Position bleibt (gemessen, Toleranz 2 bis 3 px) |
| Zurück-Navigation | Liste nach Rezept und zurück, Einkauf, Wochenplan und Einstellungen/Kochbücher beim Reiterwechsel: Position wiederhergestellt |
| Dialoge | `role="dialog"`, `aria-modal="true"`, Beschriftung in allen fünf Vorlagen; Fokus beim Öffnen im Dialog; Fokusfalle vor und zurück; Fokus kehrt zum Auslöser zurück |
| Hover | Alle `:hover`-Regeln stehen hinter `@media (hover: hover) and (pointer: fine)` (CSS-Regelscan) |
| Tippflächen | Alle Buttons, Links, Reiter, Radios, Felder der Hauptansichten mindestens 44 x 44 px |
| Animation | Kein `transition: all`, kein `scale(0)`, kein `ease-in`, keine UI-Animation über 300 ms, keine endlosen Animationen (Regelscan und `getAnimations()`) |
| Kochmodus | Schrittwechsel unter 50 ms ohne Verzögerung; laufender Timer überlebt den Schrittwechsel und bleibt in der Leiste |
| Tastatur | Rezeptreiter mit Pfeiltasten und Pos1; Strg+Z für Rückgängig im Hinweis mit Aktion; sichtbarer Fokusring |

## Bekannte Grenze

Eingetippter Text in Feldern, deren Wert nicht aus dem Zustand gerendert wird (z. B. Text-Import, Artikelfeld im Einkauf), geht bei einem erzwungenen `render()` weiterhin verloren; Fokus bleibt erhalten. Ein Wert-Wiederherstellen wurde bewusst nicht eingebaut, weil Aktionen wie «Artikel hinzufügen» das Feld absichtlich leeren.
