# Bericht: Rezeptdarstellung, Nährwerte und PDF-Export (Stand 30.09.2026)

Grundlage: das Übergabepaket `Savora_Claude_Code_Paket`. Umgesetzt auf dem Zweig `paket-22-export` (Pull Request 22), **nichts veröffentlicht**. Alle Tests liefen in einer Chromium-Umgebung (Playwright), nicht auf einem echten iPhone oder Drucker.

## Architektur (im Code bestätigt)
Vanilla-JavaScript-PWA ohne Build-Schritt, Daten in IndexedDB (`savora-db`, Version unverändert 5), Synchronisation über Supabase (ganzer Rezept-JSON, unbekannte Felder bleiben erhalten), PDF per `html2canvas` und `jsPDF` (Seiten werden aus HTML gemessen, paginiert, gerastert, dazu eine unsichtbare Textebene). Die Vorschau zeigt genau das erzeugte PDF (Blob), der Download ist derselbe Blob.

**Engine-Entscheidung:** Beim Raster-Weg mit Textebene bleiben wir. Begründung: Der Browser setzt Schrift und Umbrüche zuverlässig und offline, die App braucht keinen zusätzlichen Layout-Motor, und ein reiner Text-Weg mit jsPDF hätte eigene Zeilenumbruch-, Schrift- und Sonderzeichenlogik erfordert (Risiko für Brüche und Umlaute). Nachteil, ehrlich benannt: PDF-Text ist nicht „echter" eingebetteter Text, die Dateien sind grösser (50 Rezepte, 53 Seiten: 20 MB, 11,5 s im Test), Text lässt sich nur über die Textebene suchen und kopieren.

## Diagnose: beobachteter Fehler, Ursache, Änderung
| ID | Befund | Ursache (belegt oder Hypothese) | Änderung |
|---|---|---|---|
| D01/D02/D03 | Zu viele Seiten, Komponenten getrennt, Zutaten über zwei Seiten | Einspaltiges Fortsetzungslayout mit grosser Schrift, Zutaten und Schritte nacheinander | Neue Seitenlogik: zwei Spalten, Zutaten und Zubereitung bleiben nebeneinander, kleine Komponenten zusammen, Fortsetzung mit Gruppenname (belegt durch Test) |
| D04 | Seite mit nur einem Einfriertipp | Hinweise wurden als nummerierte Schritte gesetzt und liefen auf eine eigene Seite | Hinweise als eigener Block; Nachpaginierung mit engeren Abständen, wenn sonst eine Seite nur Hinweise enthielte (Test) |
| D05 | Überschrift „Kombinieren" ohne Inhalt | Leerer Schritt im Rezept | Leere Blöcke werden nicht gedruckt; die Rezeptprüfung meldet es und bietet „Leere Schritte entfernen" an (nie automatisch) |
| D06 | 158 kcal pro Portion | **Belegt im Code:** Nicht erkannte oder unsichere Zutaten wurden aus der Summe weggelassen, die Teilsumme wurde trotzdem als Portionswert gezeigt. Ob genau das im damaligen PDF geschah, lässt sich ohne den damaligen Speicherstand nicht beweisen | Status „unvollständig": keine Portionssumme mehr; PDF nur bei vollständiger Berechnung |
| D07 | App: „Noch nicht berechnet", PDF hatte Werte | **Hypothese, im Code plausibel:** Nährwert-Ergebnisse liegen nur lokal im Gerät (nicht in der Synchronisation); das PDF stammte von einem Gerät mit altem Ergebnis | Gemeinsamer Status für App, Vorschau und PDF (nicht berechnet, berechnet, unvollständig, veraltet, fehlgeschlagen); Ergebnisse der alten Berechnung gelten als veraltet |
| D08 | Cookies: 4 Portionen, ca. 20 Stück | Ausbeute nur als Portionen erfasst | Rezeptprüfung schlägt „Ausbeute auf 20 Stück setzen" vor (einzeln übernehmbar); Stück-Modus im PDF „Ergibt 20 Stück" |
| D09/D10 | Manti 30 Min. trotz 30 Min. Ruhezeit; alle Rezepte „Mittel" | Zeit ist ein einzelnes Feld; die Standard-Schwierigkeit „Mittel" wurde bei neuen und beim Laden alter Rezepte eingesetzt | Optionale Felder aktiv/Ruhen/Garen; Prüfung meldet die Unstimmigkeit; neue Rezepte ohne erfundene Schwierigkeit; bereits gespeicherte Werte bleiben |
| D11 | Quelle/Tipps als Schritte | Importklassifizierung | Nur Darstellung: eindeutige Anfänge (Quelle, Tipp, Hinweis, Aufbewahrung, Haltbarkeit, Einfrieren) erscheinen als eigener Block und nicht im Kochmodus (Quellen); Vorschlag „Zu den Notizen / ins Quellenfeld verschieben" |
| D12/D13 | Kapitel „Desser", Schreibweise | Inhalt der Daten | nicht automatisch geändert (Originaltexte bleiben) |

## Nährwert-Erkennung (zusätzlich, auf Wunsch des Nutzers)
An 124 typischen Zutatenzeilen gemessen: vorher etwa 54 % berechenbar, jetzt über 95 %. Ursachen: Datenbanknamen weichen von Alltagsbegriffen ab, Löffel-/dl-Mengen ohne Dichte, fehlende Stückgewichte. Behoben durch geprüfte Alias-Tabelle, Richtdichten, Stück-/Packungsgewichte (als geschätzt gekennzeichnet). Was die Datenbank nicht kennt (z. B. Miso), bleibt ungeklärt.

## Vorlagen
A Warm Editorial (Standard für neue Kochbücher), B Bold Kitchen, C Küchenblatt. Schriften: Roboto (vorhanden), Sofia Sans Extra Condensed (B), Source Serif 4 (A, C; OFL, lokal in `vendor/fonts`, im Service Worker gecacht). Die allgemeine App-Schrift ist unverändert. Das Deckblatt zeigt Titel, Autor und optional das Rezeptfoto; das Savora-Logo ist klein und abschaltbar. Hinweis: Das App-Symbol wurde auf ausdrücklichen Wunsch in dieser Sitzung farblich überarbeitet (Aubergine, Gold, Creme), obwohl das Paket „Logo unverändert" nannte.

Beispiele: `beispiele/Kochbuch_Vorlage_A.pdf`, `_B.pdf`, `_C.pdf` (synthetische Rezepte, keine echten Daten), `Vergleich_Cookies_A/B/C.png`.

## Abnahme (Definition of Done)
**A. Datenintegrität**
- Rezept-IDs, Texte, Mengen, Bilder unverändert nach Export aller drei Vorlagen: **bestanden** (`test_export.py`, Vorher/Nachher-Vergleich von Titel, Zutaten, Schritten, Notizen, Bildlänge).
- Sammlungen, Reihenfolge, Favoriten: Export liest nur; **nicht separat getestet**, Datenbank-Version unverändert (`test_migration.py` bestanden).
- Neue optionale Felder (aktive/Ruhe-/Garzeit) gehen im Synchronisations-JSON mit: **im Code geprüft** (ganzes Rezeptobjekt), kein Test gegen echtes Konto (nur lokaler Mock existiert).
- Bestehende Rezepte ohne neue Felder darstellbar/exportierbar: **bestanden**.
- Keine Migration durchgeführt (nur additive optionale Felder): Migrations-Punkte **nicht anwendbar**.
- Vorschau, Export, Layoutwechsel ändern keine Originalrezepte: **bestanden**.

**B. Vier Beispielrezepte** (synthetische Nachbildungen der Problemfälle, nicht deine echten Rezepte): Carbonara (leerer Schritt, Hinweis) **bestanden**; Cookies kein isolierter Hinweis auf dritter Seite, Stückzahl, Hinweise getrennt **bestanden**; Manti lange Komponenten vollständig **bestanden**; Sloppy Joe zusammenhängende Komponenten **bestanden**; 158-kcal-Fall: Statuslogik **bestanden**, der damalige Speicherstand konnte nicht nachgestellt werden (nicht geprüft).

**C. Layout-Fälle:** ohne Bild, langer Titel, Hoch-/Querformat, 40 Zutaten, 15 kurze Schritte, sehr langer Einzelschritt, Brüche (½ Ei, ¼ TL), lange Quellen-URL, Notizen plus Zutaten, alle drei Vorlagen: **bestanden** (maschinelle Textprüfung und Sichtprüfung der Seiten). Nicht geprüft: Mehrere Bilder je Rezept (nur Hauptbild vorgesehen).

**D. PDF und Vorschau:** Einzelrezept und Gesamtexport **bestanden**; Download ist derselbe Blob wie die Vorschau **im Code bestätigt**; Inhaltsverzeichnis mit anklickbaren Seitenlinks und Lesezeichen **bestanden** (Links und Outline im PDF nachgewiesen); Seitenzahlen und Fusszeile **bestanden**; suchbarer Text **bestanden** (pdftotext); Offline-Export **nicht geprüft**; Fehler bei Generierung zeigen Meldung, Rezepte bleiben unverändert **bestanden**; 50 Rezepte: 53 Seiten, 20 MB, 11,5 s, kein Fehler (keine Prüfung des Speicherverbrauchs auf iPhone).

**E. UI und Browser:** Chromium-Tests inklusive Barrierefreiheit (axe) **bestanden**; 390 px und Desktop im Test; Tastatur/Fokus im Export-Dialog (Radiogruppe) im Rahmen der axe-Prüfung; **nicht geprüft:** Safari, echtes iPhone, echter Ausdruck, Vollflächen im Heimdruck.

## Grenzen
Die Aufteilung von Text auf mehrere Seiten geschieht Einheit für Einheit (Zutat oder Schritt), nicht mitten in einem Schritt. Sehr lange Einzelschritte werden nicht geteilt. Kein automatisches Umschreiben von Rezepten. Die Vorschau ist auf iOS die PDF.js-Ansicht mit Zoom, auf dem Desktop der Browser-Betrachter.

## Lokal ausführen / zurück zum alten Stand
```bash
python tests/run_all.py            # alle Tests
git checkout main                  # zurück zum veröffentlichten Stand
```
Der Zweig ändert keine Datenbank-Struktur; ein Zurückwechseln verliert keine Rezepte (zusätzliche optionale Felder werden von älteren Ständen ignoriert).
