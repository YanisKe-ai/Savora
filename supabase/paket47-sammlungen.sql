-- Paket 47 (Savora 0.84): eigene Sammlungen, Zuordnungen und «Passt dazu» im Abgleich.
-- Rein additiv: erweitert nur die erlaubten Werte der Spalte kind in public.savora_records um
--   'collection' (Sammlung, id = Sammlungs-ID), 'membership' (Zuordnung, id = 'colId|recipeId'),
--   'pairing' (Verknuepfung «Passt dazu», id = 'idA~idB', kanonisch idA < idB).
-- Bestehende Zeilen, Policies (RLS: nur user_id = auth.uid()), der Trigger savora_touch_server_time
-- (aelterer client_updated_at wird verworfen) und savora_delete_account (loescht alle kinds) bleiben unveraendert.
-- Drop und Add in EINER Transaktion: kurze Sperre, kein Zeitpunkt ohne Pruefung.
-- Reihenfolge: VOR dem Client-Release 0.84 einspielen (sonst lehnt der Server die neuen kinds ab; der Client
-- haelt sie dann in der Warteschlange, der uebrige Abgleich laeuft weiter).
begin;
alter table public.savora_records drop constraint if exists savora_records_kind_check;
alter table public.savora_records add constraint savora_records_kind_check
  check (kind = any (array['recipe', 'mealplan', 'shopping', 'setting', 'collection', 'membership', 'pairing']));
commit;
