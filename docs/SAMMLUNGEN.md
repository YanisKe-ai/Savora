# Sammlungen und «Passt dazu» (ab 0.84.0)

Technische Beschreibung für Entwickler. Code: `org.js` (Modell), `cloud.js` (Abgleich), `backup.js` und `validate.js` (Sicherung), `supabase/paket47-sammlungen.sql` (Datenbank).

## 1. Überblick
- **Sammlungen:** Nutzer legen eigene Sammlungen an (Name, Farbe, Symbol, Reihenfolge) und ordnen Rezepte zu. Ein Rezept kann in mehreren Sammlungen liegen.
- **«Passt dazu»:** Verknüpfung zweier Rezepte (Typ `pairing`) mit optionaler Notiz (höchstens 200 Zeichen). Die Verknüpfung gilt in beide Richtungen.
- **Systembereich der Sammlungsauswahl:** «Alle», «Favoriten» und «Ohne Sammlung». Das sind keine gespeicherten Sammlungen. «Ohne Sammlung» gilt für Rezepte ohne aktive Nutzersammlung (`orgInNoCollection`).
- **Systemmarke `'friends'`** (Rezepte von Freunden) bleibt im Rezept-Array `recipe.collections`. Sie ist keine Sammlung: `org.js` und die Prüfung der Sicherung lehnen die ID `friends` ab, sie zählt nicht für «Ohne Sammlung».
- Sammlungen, Zuordnungen und Verknüpfungen liegen nicht im Rezeptobjekt.

## 2. Datenstruktur (localStorage)
Kein IndexedDB-Upgrade. Jeder Eintrag hat `updatedAt` (Wert der logischen Uhr) und `deleted` (Grabstein).

| Schlüssel | Inhalt | Felder je Eintrag |
| --- | --- | --- |
| `savora-org-collections` | Objekt `{ [colId]: Sammlung }` | `id`, `name`, `color`, `icon`, `order`, `createdAt`, `updatedAt`, `deleted` |
| `savora-org-memberships` | Objekt `{ ['colId\|recipeId']: Zuordnung }` | `c`, `r`, `updatedAt`, `deleted` |
| `savora-org-links` | Objekt `{ ['idA~idB']: Verknüpfung }` | `a`, `b`, `type` (`'pairing'`), `note`, `createdAt`, `updatedAt`, `deleted` |
| `savora-org-meta` | Objekt | `v`, `clock`, `legacyAt`, `catchUpDone` |

Weitere Festlegungen aus `org.js`:
- Name: höchstens 60 Zeichen, Leerraum wird zusammengezogen. `color` aus `ORG_COLORS` (`tomato`, `sage`, `mustard`, `plum`, `lake`, `earth`), `icon` aus `ORG_ICONS` (14 Schlüssel), sonst `null`. Die CSS-Variablen der Farben heissen laut Vertrag `--org-c-<id>`.
- IDs müssen `^[A-Za-z0-9_.:@-]{1,120}$` erfüllen. `~` und `|` kommen darin nicht vor, die Aufteilung ist eindeutig.
- **Sammlungs-ID:** `col_` plus normalisierter Name (klein, `ß` zu `ss`, ohne Akzente, nur `a-z0-9-`, höchstens 48 Zeichen, leer ergibt `sammlung`). Ist die ID belegt (auch durch einen Grabstein mit anderem Namen), folgt das Suffix `-2`, `-3` und so weiter. Ein Grabstein mit gleichem Namen wird wiederverwendet, damit zwei Geräte, die offline denselben Namen anlegen, dieselbe ID erhalten. Wird dabei eine gelöschte Sammlung neu angelegt, werden ihre alten aktiven Zuordnungen mit Grabstein versehen (keine Wiederbelebung). Umbenennen ändert die ID nie.
- **Dublettenprüfung:** gleicher Name (Gross-/Kleinschreibung egal, getrimmt) unter den aktiven Sammlungen ergibt `duplicate` mit `existingId`.
- **Verknüpfungsschlüssel:** `idA~idB`, kanonisch mit reinem Stringvergleich `idA < idB` (kein `localeCompare`).
- **Zuordnungsschlüssel:** `colId|recipeId`.
- Zuordnungen und Verknüpfungen werden gegen vorhandene Rezepte erst beim Lesen geprüft (siehe Abschnitt 5).

## 3. Übernahme des Bestands
- Bis 0.83 gab es `savora-collections` (`[{id,name}]`) und `recipe.collections`. Beide werden weiter gelesen, nichts wird gelöscht, `recipe.collections` wird nie verändert.
- `orgEnsureLegacy()` übernimmt idempotent:
  1. Unbekannte IDs aus `savora-collections` als Sammlungen mit `updatedAt` 1 (Uhr 1). Reihenfolge: Listenposition beim ersten Lauf, danach angehängt. `createdAt` kommt aus der Zeit in der ID, falls erkennbar.
  2. Paare aus `recipe.collections` als Zuordnungen mit Uhr 1, nur wenn für das Paar noch gar kein Datensatz besteht (weder aktiv noch Grabstein) und die Sammlung aktiv ist.
- Jeder echte Stand (Uhr grösser als 1) gewinnt gegen eine Übernahme. Übernahmen mit Uhr 1 oder weniger werden nicht ins Konto hochgeladen (`orgSyncAll`).
- **Projektion für alte Geräte:** `savora-collections` wird weiter geschrieben (aktive Sammlungen in Nutzerreihenfolge, mit `id`, `name`, `color`, `icon`, `order`), aber nur wenn sich der Inhalt ändert, sonst entstünde ein Abgleich-Pingpong.

## 4. Abgleich (cloud.js, Tabelle `savora_records`)
- **Datenarten (`kind`):** `collection` (id = Sammlungs-ID), `membership` (id = `colId|recipeId`), `pairing` (id = `idA~idB`).
- **Migration:** `supabase/paket47-sammlungen.sql` erweitert den CHECK `savora_records_kind_check` additiv um diese drei Werte (Drop und Add in einer Transaktion). RLS, Trigger `savora_touch_server_time` und `savora_delete_account` bleiben unverändert. Eingespielt am 15.10.2026, vor dem Client-Release.
- **Uhr:** `orgClock()` ist eine hybride logische Uhr (HLC) = `max(Date.now(), letzter bekannter Wert + 1)`, gespeichert in `savora-org-meta.clock`. `orgSeeClock` hebt sie bei Fremdständen an.
- **Konfliktwert:** `client_updated_at = updatedAt * 2 + (aktiv ? 1 : 0)` (`orgEnc`). Der spätere Stand gewinnt. Bei exakt gleicher Uhr gewinnt «Hinzufügen», weil aktiv eins mehr ergibt. Der Server-Trigger verwirft ältere Werte.
- **Konfliktregeln:**
  - Jede Beziehung ist ein eigener Datensatz. Zuordnungen zweier Geräte zu verschiedenen Sammlungen bleiben beide erhalten.
  - Grabsteine bleiben dauerhaft. Ein Grabstein wird nur durch ein neues bewusstes Hinzufügen überholt (neue Uhr), nie automatisch.
  - `orgSyncApply` gibt `{ applied }`, `{ applied:false, localNewer:true, localAt }` oder `{ applied:false, invalid:true }` zurück. Ungültige Fremdsätze (`orgSyncValidate`) werden nicht übernommen.
  - Ein Grabstein ohne Daten behält lokal Namen, Farbe, Symbol, Reihenfolge, damit die ID-Regel weiter greift.
- **Warteschlange:** Org-Datensätze gehen in eigenen Blöcken zu 200 hoch. Lehnt der Server einen Block ab (zum Beispiel weil die Migration fehlt), bleiben diese Einträge in der Warteschlange und der übrige Abgleich (Rezepte, Plan, Einkauf) läuft weiter. Bei Offline oder 401 bricht der Abgleich ab wie bisher.
- **Eingehend:** `cloudApplyOrgRows` übernimmt eine Seite in einem Schreibvorgang (`orgBatch`). Ist lokal etwas neuer und nicht vorgemerkt, wird es erneut zum Hochladen vorgemerkt.
- **Nachholen:** `cloudOrgCatchUp` holt einmalig alle Org-Zeilen ohne Cursor nach (`kind=in.(collection,membership,pairing)`, Seiten zu 1000). Grund: ein Gerät mit älterer Version hat solche Zeilen schon gezogen, aber nicht verstanden. Das Flag `catchUpDone` in `savora-org-meta` verhindert Wiederholung. Bei vollem Abzug ohne Cursor wird es direkt gesetzt.
- **Erster Abgleich:** `orgSyncAll()` liefert alle lokalen Datensätze (auch Grabsteine) mit Konfliktwert.
- **Kontowechsel:** Der Generationszähler `cloud.gen` (erhöht bei Anmelden, Abmelden, Konto löschen) und `cloudSyncCtx`/`cloudCheckCtx` sorgen dafür, dass ein laufender Abgleich nach dem Wechsel nichts mehr schreibt (Daten, Meta, Cursor, Warteschlange). Lokale Daten bleiben beim Abmelden erhalten, das nächste Konto erhält sie beim ersten Abgleich.

## 5. Keine Kaskaden
- Rezept löschen löscht keine Zuordnungen und Verknüpfungen. Zuordnungen zu fehlenden Rezepten zählen nicht (`orgRecipeIdsIn`, `orgCounts` prüfen gegen `state.recipes`).
- Eine gelöschte Sammlung bekommt einen Grabstein, ihre Zuordnungen bleiben gespeichert und werden beim Lesen ausgeblendet. Rückgängig bringt alles zurück.
- **Status eines Verknüpfungsziels** (`orgLinksOf`): `ok` (Rezept vorhanden), `pending` (angemeldet, Rezept hier noch nicht bekannt, Abgleich steht aus), `gone` (nicht vorhanden oder zum Löschen vorgemerkt). Sortierung: `ok`, `pending`, `gone`, dann nach Erstellzeit.
- Rückgängig/Wiederherstellen eines Rezepts bringt Beziehungen automatisch zurück.

## 6. Sicherung und Wiederherstellen
- **Export:** `schemaVersion` 6, Abschnitt `organization` aus `orgExport()`: `{ v:1, collections, memberships, links }`, nur aktive Daten, keine Grabsteine, Zuordnungen nur zu aktiven Sammlungen. `settings.collections` und `recipe.collections` bleiben drin, damit ältere App-Stände die Sicherung lesen.
- **Prüfung:** `validateBackupOrganization` (validate.js) gibt `{ present, data, problems }` zurück. Fehlt der Abschnitt, ist `data` `null` (alte Sicherung). Grenzen: 2000 Sammlungen, 200000 Zuordnungen, 50000 Verknüpfungen, Name 60, Notiz 200 Zeichen. Ungültige Einträge werden einzeln gemeldet und übersprungen.
- **Wiederherstellen:** `orgImport(data, recipeIdMap, colIdMap)` direkt nach den Rezepten.
  - Rezept-IDs werden über `recipeIdMap` abgebildet. Alte IDs, die in der Sicherung mehrfach vorkommen, werden nicht abgebildet und nicht verbunden.
  - Sammlungen: gleiche ID und gleicher Name, oder gleicher Name unter den aktiven, werden zusammengeführt (`mapped`). Sonst neu angelegt, bei belegter ID mit freier neuer ID.
  - **Alte Sicherungen** (ohne `organization`): Sammlungen aus `settings.collections`, Zuordnungen aus `recipe.collections` (`legacy`). Bei neuen Sicherungen werden die `legacy`-Paare nur als «schon entschieden» vermerkt (lokaler Grabstein mit Uhr 0, nie abgeglichen), damit die Bestandsübernahme veraltete Paare nicht wiederbelebt.
  - **Grabsteine:** Wurde eine Zuordnung oder Verknüpfung auf diesem Gerät bewusst entfernt (Uhr grösser als 0), wird sie nicht wiederbelebt (`removed`). Wiederholtes Einspielen erzeugt keine Dubletten (`existed`).
  - Bei bestehender Verknüpfung ohne Notiz wird die Notiz aus der Sicherung ergänzt.
- **Bericht** von `orgImport`: `collections {added, mapped, invalid}`, `memberships {added, existed, missing, removed}`, `links {added, existed, missing, self, removed}`, `colIdMap`. `backup.js` meldet daraus fehlende Ziele, Verknüpfungen zwischen zwei gleichen Rezepten, bewusst entfernte Einträge und den Hinweis auf mehrfach vorkommende IDs.

## 7. Datenschutz
Sammlungen, Zuordnungen und Verknüpfungen sind privat:
- **Bibliothek:** nicht in der Allowlist der veröffentlichten Felder (siehe `docs/BIBLIOTHEK.md`).
- **Freunde-Versand und Einzelrezept-Export:** `SHARE_DROP_KEYS` in `share.js` entfernt `collections` und `collectionIds`. Die Org-Daten liegen ohnehin nicht im Rezeptobjekt.
- Vertrag verlangt dafür einen Test.
- Der Cloud-Abgleich überträgt sie nur in die private Tabelle `savora_records` (RLS auf das eigene Konto).

## 8. Öffentliche Funktionen von `org.js`
Konstanten: `ORG_COLORS`, `ORG_ICONS`. Fehlercodes: `empty`, `too_long`, `duplicate`, `not_found`, `storage`, `self`, `exists`, `missing`.

| Funktion | Zweck | Rückgabe |
| --- | --- | --- |
| `orgCollections()` | aktive Sammlungen, nach `order` sortiert | Liste von Kopien |
| `orgCollection(id)` | eine aktive Sammlung | Kopie oder `null` |
| `orgCreateCollection({name, color, icon})` | Sammlung anlegen | `{ok:true, id}` oder `{ok:false, error, existingId?}` |
| `orgUpdateCollection(id, {name?, color?, icon?})` | ändern | `{ok:true}`, `{ok:true, unchanged:true}` oder `{ok:false, error}` |
| `orgMoveCollection(id, dir)` | um eine Position verschieben (`-1`/`+1`) | `true` oder `false` |
| `orgDeleteCollection(id)` | Grabstein setzen | Undo-Token oder `null` |
| `orgCollectionIdsOf(recipeId)` | aktive Sammlungs-IDs eines Rezepts | Liste |
| `orgRecipeIdsIn(colId)` | vorhandene Rezept-IDs einer Sammlung | `Set` |
| `orgCounts()` | Anzahl vorhandener Rezepte je Sammlung | `Map` colId zu Anzahl |
| `orgInNoCollection(recipeOrId)` | Rezept in keiner Nutzersammlung | `boolean` |
| `orgSetMembership(recipeId, colId, on)` | eine Zuordnung setzen oder entfernen | Undo-Token oder `null` (keine Änderung) |
| `orgApply(recipeIds, colId, 'add'\|'remove')` | Zuordnung für mehrere Rezepte, nur diese Beziehung | Undo-Token oder `null` |
| `orgUndo(token)` | Stand vor der Aktion wiederherstellen (als neue Änderung mit frischer Uhr) | `true` oder `false` |
| `orgUndoCount(token)` | Anzahl geänderter Datensätze | Zahl |
| `orgLinksOf(recipeId)` | Verknüpfungen eines Rezepts | Liste `{key, otherId, note, status, createdAt}` |
| `orgLinkCreate(idA, idB, note)` | Verknüpfung anlegen | `{ok:true, key, undoToken}` oder `{ok:false, error}` |
| `orgLinkNote(key, note)` | Notiz ändern (höchstens 200 Zeichen) | `{ok:true}`, `{ok:true, unchanged:true}` oder `{ok:false, error}` |
| `orgLinkRemove(key)` | Verknüpfung entfernen (Grabstein) | Undo-Token oder `null` |
| `orgExport()` | Sicherung der aktiven Daten | `{v:1, collections, memberships, links}` |
| `orgImport(data, recipeIdMap, colIdMap?)` | Wiederherstellen mit ID-Abbildung | Bericht (siehe Abschnitt 6) |
| `orgOnChange(fn)` | Änderungen abonnieren | Funktion zum Abmelden |
| `orgBatch(fn)` | mehrere Änderungen mit einem Schreibvorgang je Schlüssel | Rückgabewert von `fn` |
| `orgBatchBegin()` / `orgBatchEnd()` | Sammelschreiben ohne Funktion klammern | nichts |
| `orgReload()` | Zwischenspeicher verwerfen, neu lesen, Abonnenten benachrichtigen | nichts |
| `orgEnsureLegacy()` | Bestandsübernahme und Projektion (idempotent) | nichts |
| `orgMetaGet(name)` / `orgMetaSet(name, value)` | Werte in `savora-org-meta` | Wert / nichts |
| `orgClock()` / `orgSeeClock(c)` | logische Uhr lesen und erhöhen / Fremdwert vermerken | Zahl / nichts |
| `orgSyncKinds()` | Liste der Datenarten | `['collection','membership','pairing']` |
| `orgSyncRead(kind, id)` | lokaler Datensatz für den Upload | Kopie oder `null` |
| `orgSyncLocalAt(kind, id)` | lokaler Konfliktwert | Zahl (`-1` unbekannt) |
| `orgSyncAll()` | alle lokalen Datensätze für den ersten Abgleich | `[{kind, id, deleted, at}]` |
| `orgSyncValidate(kind, id, data, deleted)` | Fremdsatz prüfen und bereinigen | Datensatz oder `null` |
| `orgSyncApply(kind, id, data, deleted, at)` | Fremdstand übernehmen | `{applied, localNewer?, invalid?}` |

## 9. Bekannte Einschränkungen
- Ein altes Gerät (Stand vor 0.84), das nur `recipe.collections` ändert: Hinzufügungen werden übernommen, sofern kein Grabstein besteht. Das Entfernen einer Sammlung aus `recipe.collections` geht in der Übergangszeit verloren. Die PWA aktualisiert sich über den Service Worker zügig.
- Doppelte Rezept-IDs in einer Sicherung: Beziehungen auf diese IDs werden nicht wiederhergestellt und im Bericht gemeldet, weil die Abbildung mehrdeutig wäre. Es gibt kein Zuordnen über den Titel.
- Mehrere Tabs: Es gibt keine Sperre. Änderungen in einem anderen Tab kommen nur über das `storage`-Ereignis an (`orgReload`). Gleichzeitiges Bearbeiten in zwei Tabs kann einen Stand überschreiben.
- Eine Sammlung zur Zeit in der Auswahl (keine Mehrfachauswahl in Version 1).
