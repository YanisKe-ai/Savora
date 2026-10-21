# Kochbuch-Projekte (Paket 37)

Savora kennt mehrere gestaltete Kochbücher. Jedes ist ein eigenes Exportprojekt mit Auswahl, Reihenfolge, Kapiteln, Titelblatt, Texten, Datum und Seitenstil. Rezepte gehören nie einem Kochbuch: Ein Projekt verweist nur auf Rezepte, und kein Vorgang hier löscht ein Rezept.

## Format

localStorage-Schlüssel `savora-cookbook-projects`:

```json
{
  "v": 1,
  "activeId": "cb_xxx",
  "books": [
    {
      "id": "cb_xxx", "name": "Familienrezepte", "createdAt": 1760000000000, "updatedAt": 1760000000000,
      "config": { "title": "", "subtitle": "", "author": "", "items": [{ "recipeId": "…", "chapterId": "" }],
                  "chapters": [{ "id": "ch_…", "name": "Hauptgänge" }], "chapterPages": false, "showLogo": true,
                  "pdfTemplate": "A", "cover": { "v": 1, "templateId": "pop", "date": "2026-10-11", "showDate": true } },
      "migration": { "v": 1, "at": "ISO-Zeit", "source": "savora-cookbook-config", "titleSource": "savora-cookbook-title", "hadConfig": true }
    }
  ]
}
```

- `config` ist die bisherige Einzelkonfiguration unverändert. `getCookbookConfig()` und `saveCookbookConfig()` arbeiten auf dem aktiven Projekt, alle bisherigen Aufrufer funktionieren weiter. Eine Konfiguration ohne `items` bedeutet «alle Rezepte» und wird erst beim ersten Speichern der Auswahl festgeschrieben.
- Seitenstil-IDs `A`, `B`, `C` bleiben im Datenmodell. In der Bedienung heissen sie «Klassisch», «Kräftig» und «Schlicht (zum Drucken)».
- Neue Bücher starten mit leerem Titel, Untertitel und Namen, leerer Auswahl und dem heutigen Datum (einmalig gespeichert, danach nie mehr automatisch geändert).
- Code: `cookbooks.js` (Speicher, Migration, Anlegen, Umbenennen, Duplizieren, Löschen, Ansicht «Kochbücher»).

## Reihenfolge im Editor (0.85)

Schritt 1 «Im Kochbuch» zeigt die Rezepte nach Kapiteln gruppiert, genau in der Reihenfolge des PDFs (`cookbookItemGroups` in `cookbooks.js`, gleiche Regel wie `cookbookOrderedSections`): Kapitel in ihrer Reihenfolge, Rezepte ohne oder mit unbekanntem Kapitel am Schluss. Die Pfeile tauschen nur innerhalb einer Gruppe, ein Kapitelwechsel setzt das Rezept ans Ende der neuen Gruppe. Das Datenformat (`items`, `chapters`, `chapterPages`) bleibt unverändert.

## Migration

Fehlt `savora-cookbook-projects`, entsteht beim ersten Zugriff das erste Projekt aus der alten Einzelkonfiguration `savora-cookbook-config` (sonst aus einer leeren Konfiguration). Name: `savora-cookbook-title`, sonst «Mein Kochbuch». Zeitpunkt und Quelle stehen im Feld `migration`.

- Wiederholbar: Ist ein gültiges Projekt-Objekt vorhanden, wird nichts neu erzeugt oder überschrieben.
- Ein vorhandener, aber unlesbarer Wert wird vor dem Neuaufbau unter `savora-cookbook-projects-defekt` gesichert.
- Die Migration schreibt ohne Abgleich-Markierung, damit sie keinen neueren Stand aus der Cloud überholt.

## Zurück zum alten Stand

`savora-cookbook-config` und `savora-cookbook-title` werden von Projekten nie verändert oder gelöscht. Zurück zum Stand vor Paket 37: Schlüssel `savora-cookbook-projects` entfernen, dann entsteht beim nächsten Öffnen wieder ein Projekt aus der alten Konfiguration. Änderungen, die nach der Migration an Büchern gemacht wurden, stehen nur in den Projekten (die alte Konfiguration bleibt auf dem Stand der Migration). Ältere App-Versionen lesen weiter die alte Konfiguration.

## Abgleich und Sicherung

- Abgleich: neuer Einstellungsschlüssel `cookbooks` (ganzes Projekt-Objekt, der jüngste Stand gewinnt wie bei den anderen Einstellungen; ein unlesbarer Wert aus der Cloud wird nicht übernommen). `cookbookConfig` und `cookbookTitle` werden wie bisher abgeglichen.
- Sicherung (`schemaVersion` 5): `settings.cookbooks` enthält alle Projekte, `settings.cookbookConfig` weiterhin die alte Einzelkonfiguration. Beim Wiederherstellen werden die Rezept-IDs auf die neuen IDs abgebildet; vorhandene Bücher (gleiche ID oder gleicher Inhalt) werden nie ersetzt oder verdoppelt. Ältere Sicherungen ohne Projekte werden wie bei der Migration übernommen (ein noch unberührtes Startkochbuch nimmt die Konfiguration auf, sonst entsteht «Wiederhergestelltes Kochbuch»).

## Wiederherstellung und Prüfung (Datenerhalt)

- Rezepte, Bilder, Favoriten, Notizen, Wochenplan, Einkaufsliste, Sammlungen und die alte Kochbuch-Einzelkonfiguration (`savora-cookbook-config`, `savora-cookbook-title`) werden beim Wechsel von Version 0.58.0 auf Paket 37 nicht angefasst. Es gibt keine Schemaänderung an IndexedDB (Version bleibt 5); neu ist nur der localStorage-Schlüssel `savora-cookbook-projects`.
- Eine Sicherung aus 0.58.0 (`schemaVersion` 4, ohne `settings.cookbooks`) lässt sich in der neuen Version wiederherstellen: Die Einzelkonfiguration wird zu einem Buchprojekt (Titel, Seitenstil, Titelblatt, Datum, Auswahl und Reihenfolge auf die neuen Rezept-IDs abgebildet). Zweimal Einspielen verdoppelt nichts.
- Defekte Datei (kein gültiges JSON), fremde Datei oder Sicherung aus einer neueren Version: Es wird nichts verändert oder nur das Lesbare übernommen; die Meldung nennt den nächsten Schritt. Unlesbare Einträge werden übersprungen und gemeldet. Ist der Speicher voll, bleiben schon übernommene Rezepte erhalten, dieselbe Datei kann nach dem Platzschaffen erneut eingespielt werden.
- Service Worker: Nach dem Wechsel der `SW_VERSION` erscheint «Neue Version verfügbar»; erst mit «Aktualisieren» übernimmt der neue Worker, danach sind alle Caches der alten Version ersetzt. Nutzerdaten (IndexedDB, localStorage) liegen nicht in diesen Caches und bleiben.
- Test: `tests/test_paket37_data.py` (alter Stand per Git-Commit 14e7887 mit aktivem Service Worker, Wechsel im selben Browserprofil, Offline-Start, Wiederherstellen, Speicherfehler, Mengen).
