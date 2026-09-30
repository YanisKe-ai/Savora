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
| `test_native.py` | iOS-App mit Plugin-Attrappen: Teilen, Bildschirm, Timer, Statusleiste, Haptik |
| `test_paket1.py` bis `test_paket9.py` | Rezeptseite, Texte, Rechner, Formular, Kochmodus, breites Layout, Feinschliff, Suche |
| `test_a11y.py` | Barrierefreiheit mit axe-core in Hell, Dunkel und Schwarz, 390 und 1280 px |
| `test_theme.py` | Darstellung: Browserleiste, Systemelemente, System-Wechsel |
| `test_import.py` | Text-Import mit realistischen Rezepttexten, Timer-Erkennung |
| `test_monkey.py` | Zufallstest: klickt wahllos durch die App, es darf kein Fehler auftreten |

Regeln: Nicht ausgeführte Tests gelten nie als bestanden. Die Tests laufen mit fester Zeitzone (UTC), damit sie überall gleich sind.
