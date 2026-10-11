# Tests

Alle Tests laufen mit Playwright (Python) gegen die echte App in einem Testbrowser und starten ihren Webserver selbst.

| Datei | Prüft |
|---|---|
| `test_migration.py` | Datenerhalt: alter Stand (Git-Commit v20) zu neu, IDs, Rohdaten, Bilder, Wochenplan |
| `test_flows.py` | Kernabläufe: Bearbeiten, Gruppen, Skalierung, Suche, Kochmodus, Plan, Einkauf, Backup, PDF |
| `test_sync.py` | Synchronisation mit zwei Geräten gegen einen lokalen Nachbau (`mock_supabase.py`) |
| `test_pruefung.py` | Prüfbericht F01 bis F11 (Zeitzonen, Import, PDF). Teile brauchen eine private Sicherung in `tests/private/`, sonst als "UEBERSPRUNGEN" gemeldet |
| `test_visual.py` | 320, 390, 768, 1280 px, Dunkelmodus, kein Seitwärts-Scrollen |
| `test_offline.py` | Service Worker, Offline-Start, Navigation |
| `test_audit_b.py` | Audit B: Cache-Eigentum, optionale Dateien, Offline-Anzeige, PDF-Bibliotheken bei Bedarf, Fehlerseiten nicht gecacht, Update ohne Entwurfsverlust, Lazy-Bilder |
| `test_native.py` | iOS-App mit Plugin-Attrappen: Teilen, Bildschirm, Timer, Statusleiste, Haptik |
| `test_paket1.py` bis `test_paket9.py` | Rezeptseite, Texte, Rechner, Formular, Kochmodus, breites Layout, Feinschliff, Suche |
| `test_a11y.py` | Barrierefreiheit mit axe-core in Hell und Dunkel, 390 und 1280 px |
| `test_theme.py` | Darstellung: Browserleiste, Systemelemente, System-Wechsel |
| `test_import.py` | Text-Import mit realistischen Rezepttexten, Timer-Erkennung |
| `test_paket37_visual.py` | Neue visuelle Sprache: Schriftfamilien, kleinste Schrift, Tippflächen, Kontraste, Rezept ohne Foto, Startseite, Kochmodus, grosse Systemschrift, reduzierte Bewegung (Hell, Dunkel, Schwarz, 390 und 1280 px) |
| `test_startseite_liste.py` | Handy-Startseite als Liste (unter 768 px) und Navigation mit fünf Punkten: Wortmarke zentriert, Zeilen, Favoriten, Aktionsknopf, Leerzustände, Filterdialog, 100 Rezepte, 320 bis 1440 px, Hell und Dunkel |
| `test_monkey.py` | Zufallstest: klickt wahllos durch die App, es darf kein Fehler auftreten |

Regeln: Nicht ausgeführte Tests gelten nie als bestanden. Die Tests laufen mit fester Zeitzone (UTC), damit sie überall gleich sind.

## Tests schneller ausfuehren

- `python3 tests/run_all.py --parallel` startet bis zu 3 Tests gleichzeitig (jeder mit eigenem Port und eigenem Ausgabeordner). Abhaengige Tests (migration, flows) laufen zuerst, Messungen in Millisekunden (monkey, interaction) zuletzt und allein. Dauer: etwa 11 statt 22 Minuten.
- `python3 tests/run_all.py --schnell` ist zusaetzlich parallel und prueft den grossen Anpassungstest nur mit den wichtigsten Breiten und Darstellungen. Fuer die Entwicklung gedacht.
- Auf GitHub laeuft immer die volle Reihe (`--parallel 3`).
- Bei einzelnen Aenderungen reichen meist die dazu passenden Tests, zum Beispiel `python3 tests/run_all.py paket37_settings paket6`.
