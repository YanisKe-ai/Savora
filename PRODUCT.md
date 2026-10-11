# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Menschen mit sehr unterschiedlichen technischen Kenntnissen, die zuhause kochen. Sie sammeln Rezepte aus Links, Texten und Fotos, kochen mit dem Smartphone in der Küche (nasse Hände, Sicht aus einem Meter Abstand), planen die Woche und kaufen ein. Die Bedienung muss ohne Erklärung verständlich sein. Hauptnutzer heute: eine Einzelperson (Yanis) und deren Freunde, die sich Rezepte senden.

## Product Purpose
Savora ist ein persönliches digitales Kochbuch: Rezepte sammeln, einfach kochen, Mahlzeiten planen, einkaufen und eigene Kochbücher gestalten und als PDF exportieren. Erfolg heisst: ein Rezept ist in wenigen Sekunden gespeichert, beim Kochen sofort lesbar, und aus der Sammlung entsteht ein schönes, druckbares Kochbuch.

## Positioning
Ein privates Kochbuch statt einer Rezeptplattform: eigene Sammlung, offline nutzbar, kein Konto zwingend, Rezepte lassen sich ohne Verlust importieren, skalieren und zu gestalteten Büchern machen. Teilen geschieht nur aktiv und nur zwischen bestätigten Verbindungen.

## Operating Context
- Web-App (PWA, Vanilla-JS ohne Build-Schritt), Daten lokal in IndexedDB, optionale Cloud (Supabase, Zürich) für Mehrgeräte-Abgleich und Senden an Freunde.
- iOS-Hülle (Capacitor) ist vorhanden, aber ruhend: genutzt wird nur die Web-App (iPhone, Laptop, Tablet).
- Kochen: Bildschirm bleibt wach, Timer, Vorlesen.
- Export: Kochbuch als PDF mit zehn Titelblättern und mehreren Seitenstilen.

## Capabilities and Constraints
- Sprache: natürliches Deutsch in Schweizer Schreibweise (kein ß), kurze klare Beschriftungen, keine internen Schlüssel, keine unnötigen Anglizismen.
- Datenerhalt ist unverhandelbar: Rezepte, Bilder, Kategorien, Favoriten, Notizen, Wochenpläne, Einkaufslisten, Buchkonfigurationen und Kontodaten bleiben erhalten; keine Datenbank-Zurücksetzung; Migrationen versioniert und wiederholbar.
- Kein Wechsel des Technikstapels (kein React, Next.js, Tailwind).
- Mengen: gemeinsame Mengenlogik (`quantity.js`) für Rezept, Einkauf, PDF und Nährwerte; Bereiche bleiben Bereiche; fehlende Angaben werden nicht erfunden; Nährwert null ist nicht 0.
- Kein URL-Scraper, kein Proxy und kein externer KI-Dienst im Import; API-Schlüssel gehören nie ins Frontend.
- Offen / nicht geprüft: echtes iPhone, mobile Hintergrundtimer.

## Brand Commitments
- Name «Savora», Symbol (Buch mit Löffel, rotes Lesezeichen) und die zehn Titelblätter Pop, Lieblingsbuch, Tomate, Salbei, Nachtküche, Citrus, Bistro, Garten, Sonnenküche, Ofenglück sind freigegeben: Originaldateien verwenden (`assets/logo`, `assets/covers`), keine neuen Cover erfinden.
- Dunkles Symbol auf heller Fläche, helles auf dunkler; App-Symbol schwarz mit weissem Symbol und rotem Detail; rotes Detail immer erhalten; keine automatische Invertierung der Grafik.
- Tomatenrot als einziger Akzent.

## Evidence on Hand
- Bestehende Rezepte und Testdaten (`tests/seed.js`), Referenzrezept `tests/data/ref_kartoffel_original.txt`.
- Designsystem-Dokumentation `docs/DESIGN-SYSTEM.md`, Logo/Cover-Dokumentation `docs/LOGO-UND-COVER.md`.
- Keine echten Nutzerzahlen, keine Bewertungen: nichts davon darf erfunden werden.

## Product Principles
1. Kochen zuerst: Lesbarkeit und Ruhe im Kochmodus gehen vor Dekoration.
2. Nichts geht verloren: Daten erst bewahren, dann verbessern.
3. Ehrliche Zustände: Sicherung, Abgleich und Erkennung zeigen nur, was wirklich stimmt, keine erfundene Sicherheit oder Prozentwerte.
4. Einfach vor vollständig: wenige Hauptbereiche (Rezepte, Wochenplan, Einkauf, Kochbücher), klare Hauptaktion pro Ansicht.
5. Teilen nur mit Absicht: nichts wird automatisch öffentlich oder ungefragt übernommen.

## Accessibility & Inclusion
Touchflächen 44 bis 48 px, ausreichender Kontrast (mindestens WCAG AA), grosse Systemschrift und lange Texte unterstützen, Tastaturbedienung, reduzierte Bewegung respektieren, keine Bedienung nur per Hover.
