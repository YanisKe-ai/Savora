# Nachtprotokoll (30.09.2026)

Arbeit ohne Rückfragen, alles auf Zweigen, nichts auf `main`. Die Zweige bauen aufeinander auf: Wer den Pull Request eines späteren Pakets zusammenführt, bekommt die früheren Pakete mit. Zuerst den offenen Pull Request #2 (iOS-App) zusammenführen.

| Paket | Zweig | Status | Tests |
|---|---|---|---|
| 1 Jetzt | `paket-1-jetzt` | fertig | alle 8 Testdateien grün (lokal) |
| 2 Texte | `paket-2-texte` | fertig, Platzhalter offen (siehe unten) | alle 9 Testdateien grün (lokal) |
| 3 Rechner | `paket-3-rechner` | fertig | alle 10 Testdateien grün (lokal) |
| 4 Formular | `paket-4-formular` | fertig | alle 11 Testdateien grün (lokal) |
| 5 Darstellung und Barrierefreiheit | `paket-5-darstellung` | fertig | alle 13 Testdateien grün (lokal) |
| 6 Kochmodus und Kleinigkeiten | `paket-6-kleinigkeiten` | fertig | alle 14 Testdateien grün (lokal) |
| 7 Breites Layout (iPad, Desktop) | `paket-7-breit` | fertig | alle 15 Testdateien grün (lokal) |
| 8 Feinschliff | `paket-8-feinschliff` | fertig | alle 16 Testdateien grün (lokal) |
| 9 Suche und Sortierung | `paket-9-suche` | fertig | alle 17 Testdateien grün (lokal) |
| 10 Text-Import | `paket-10-import` | fertig | alle 18 Testdateien grün (lokal) |
| 11 iOS-Feinschliff | `paket-11-ios` | fertig | alle 18 Testdateien grün (lokal) |
| 12 PDF-Vorschau für iOS, Zufallstest, Dokumentation | `paket-13-pdfvorschau` | fertig, PDF-Vorschau im Simulator bestätigt | alle 21 Testdateien grün (lokal) |
| 13 Dauerhafter Speicher | `paket-14-speicher` | fertig | Tests grün (lokal) |
| 14 Einheit dl und cl | `paket-15-dl` | fertig | Tests grün (lokal) |
| 15 Mitteilungs-Hinweis, Service-Worker-Prüfung | `paket-16-mitteilungen` | fertig | Tests grün (lokal) |
| 16 Foto scannen (Texterkennung) | `paket-17-fotoscan` | fertig, im Simulator mit Testfoto bestätigt | Tests grün (lokal) |
| 17 Sicherung ohne Verdopplung | `paket-18-wiederherstellung` | fertig | Tests grün (lokal) |

## Paket 2: was du entscheiden oder eintragen musst
- In `legal.js` steht oben `LEGAL` mit `[Name der verantwortlichen Person]`, `[Kontakt-E-Mail]` und `[Ort]`. Bitte ausfüllen. Solange die Werte mit `[` beginnen, erscheinen sie in der App grün markiert.
- Die Datenschutz- und Nutzungstexte sind ein Entwurf, kein Rechtsrat. Vor einer öffentlichen Veröffentlichung von einer Fachperson prüfen lassen.
- Zu prüfen: Betreiber und Hosting von Supabase (Text sagt: Supabase, Inc. (USA), Infrastruktur Amazon Web Services, Region Zürich), Auftragsbearbeitung, Lizenztexte der Schriften (Herkunft der Schriftdateien nicht dokumentiert).
