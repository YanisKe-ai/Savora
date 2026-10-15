# Öffentliche Rezeptbibliothek (ab 0.82.0)

## Was es ist
- **Entdecken** (unter «Rezepte», neben «Meine Rezepte»): öffentliche Rezepte suchen, filtern, sortieren, ansehen und als **persönliche Kopie** speichern. Lesen geht ohne Konto.
- **Veröffentlichen** (Rezept → Menü «In der Rezeptbibliothek veröffentlichen»): Prüfen → Vorschau → Rechte bestätigen → Veröffentlichen. Nur angemeldet, mit eingerichtetem öffentlichem Profil.
- **Mehr → Meine Veröffentlichungen**: ansehen, aktualisieren, zurückziehen, erneut veröffentlichen.
- **Mehr → Öffentliches Profil**: Anzeigename, optionales Profilbild, optionaler Kurztext. Einzige Stelle für öffentliche Sichtbarkeit.
- **Mehr → Moderation**: nur für Konten in `savora_moderators`.

## Was öffentlich ist und was privat bleibt
| Öffentlich (nur nach bewusstem Veröffentlichen) | Privat (nie öffentlich) |
| --- | --- |
| Titel, Ergibt, Zeiten (unbekannt bleibt unbekannt), Schwierigkeit, Zutaten mit Abschnitten und Mengen, Zubereitung, Kategorie, Ernährungsweise (vegan, vegetarisch, Fleisch, Fisch), bewusst geschriebene Kochtipps, ursprüngliche Quelle, optionales Foto | Notizen, Kochverlauf, Favoriten, Sammlungen, Schlagwörter, Nährwert-Zuordnungen, Allergie-Angaben (glutenfrei usw.), E-Mail, Benutzername für Freunde, Einladungscode, Freunde, Posteingang, alle anderen Rezepte und Bilder |
| Öffentlicher Anzeigename, Profilbild, Kurztext, stabile Profil-ID (12 Zeichen) | |

## Datenflüsse
- Öffentliche Daten liegen in eigenen Tabellen (`savora_publications`, `savora_public_profiles`, …), nie in der privaten Tabelle `savora_records`.
- Bilder: eigener, nicht öffentlicher Speicherbereich `savora-public`. Ein Bild ist nur lesbar, solange eine veröffentlichte Publikation oder ein öffentliches Profil es verwendet; gelesen wird über signierte Adressen (1 Stunde gültig). Beim Veröffentlichen wird das Foto neu kodiert (1600 px und 480 px, WebP oder JPEG): dabei fallen Metadaten wie Ort und Kamera weg. Private Bilder werden nie umgeschaltet.
- Persönliche Kopie: neues Rezept mit eigener ID und eigenem Bild im privaten Speicher (offline verfügbar, unabhängig vom Original). Herkunft steht in `recipe.publicOrigin` und reist mit Abgleich, Sicherung und Wiederherstellung mit; sie gibt keine Rechte an der Veröffentlichung.
- Nach dem Zurückziehen: aus Suche, Profil und Detail entfernt, Bilder nicht mehr lesbar. Bereits gespeicherte Kopien anderer bleiben bei ihnen (bereits heruntergeladene Bilder lassen sich nicht zurückholen).
- Konto löschen: alle Veröffentlichungen werden zurückgezogen, öffentliche Bilder gelöscht, danach entfernt die Datenbank Profil, Veröffentlichungen, Versionen und Meldungen per Kaskade. Bricht das Löschen ab, sind die Inhalte trotzdem nicht mehr öffentlich.

## Einrichtung (Betreiber)
1. Supabase → SQL-Editor → Inhalt von `supabase/paket45-bibliothek.sql` ausführen (additiv, mehrfach ausführbar).
2. Prüfen: Inhalt von `supabase/tests/paket45-test.sql` ausführen. Erwartet: Fehlermeldung «ERGEBNIS: n OK, 0 FEHL». Das Skript rollt alles zurück, es bleiben keine Testdaten.
3. Moderator festlegen (nur per SQL): `insert into public.savora_moderators (user_id) select id from auth.users where email = '<deine E-Mail>';`
4. Limits anpassen (optional): `update public.savora_lib_limits set value = 50 where key = 'publish_per_day';` Schlüssel: `publish_per_day`, `reports_per_day`, `uploads_per_day`, `page_max`.
5. Registrierung bleibt geschlossen (`CLOUD_SIGNUP_OPEN = false` in `cloud.js`). Besucher ohne Konto können lesen und als persönliche Kopie auf ihrem Gerät speichern; Veröffentlichen und Melden brauchen ein Konto.

## Moderation
- Meldungen: Spam, fremde Inhalte, problematische Inhalte, anderer Grund (optional Kommentar bis 500 Zeichen). Nur angemeldet; Besucher ohne Konto melden per E-Mail an die Kontaktadresse aus `legal.js`. Autoren erfahren nie, wer gemeldet hat.
- Aktionen: Ausblenden (Status «gesperrt», sofort nicht mehr öffentlich), Wieder freigeben, Meldung abschliessen, Veröffentlichungsrechte sperren/entsperren. Alles wird in `savora_lib_mod_log` protokolliert.
- Eine gesperrte Veröffentlichung kann der Autor weder erneut veröffentlichen noch über eine neue Veröffentlichung desselben Rezepts umgehen.

## Verwaiste Bilder bereinigen
Bilder alter Versionen oder abgebrochener Uploads sind nicht lesbar (keine aktive Verwendung). Eigentümer können sie löschen; der Betreiber findet sie mit:
```sql
select o.name, o.created_at from storage.objects o
where o.bucket_id = 'savora-public' and o.created_at < now() - interval '7 days'
  and not public.savora_lib_object_in_use(o.name);
```
Löschen nur über die Storage-Oberfläche oder API (Supabase verhindert direktes Löschen per SQL). Noch verwendete Bilder werden von der Abfrage nie geliefert.

## Rechtliche Texte (Entwurf, prüfbedürftig, keine juristische Freigabe)
- Bestätigung beim Veröffentlichen: «Ich habe die Rechte an Text und Fotos dieses Rezepts oder darf sie veröffentlichen.» Eine Quellenangabe allein ist keine Erlaubnis.
- Nutzung durch andere: «Andere können dein Rezept in ihre persönliche Sammlung übernehmen, dort bearbeiten und privat verwenden, auch im eigenen Kochbuch-PDF. Eine kommerzielle Nutzung wird damit nicht erlaubt.»
- Gespeichert werden Version und Zeitpunkt der Bestätigung (`savora_lib_terms_accept`, Version `bibliothek-2026-10-15`).
- Keine Garantie für Moderation, Richtigkeit oder Allergiefreiheit; Ernährungsangaben stammen von den Autorinnen und Autoren.
- Datenschutz: Abschnitt zur Rezeptbibliothek in `legal.js` (öffentliche Daten, Speicherort Zürich, Löschung, Meldungen).

## Nicht umgesetzt (bewusst)
Kommentare, Nachrichten, Follower, Likes, Ranglisten. Dynamische Vorschaubilder für soziale Netzwerke (Open Graph) sind nicht eingerichtet: GitHub Pages liefert nur statische Seiten; geteilte Links zeigen die allgemeine Savora-Vorschau.
