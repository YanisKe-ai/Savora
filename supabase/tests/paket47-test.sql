-- Pruefung von Paket 47 (Sammlungen, Zuordnungen, «Passt dazu» in savora_records) mit isolierten Testdaten.
-- Laeuft in EINER Transaktion und endet IMMER mit dem Fehler «ERGEBNIS …»: dadurch wird alles zurueckgerollt
-- (Testkonten, Testzeilen). In der Datenbank bleibt nichts zurueck. Liest keine Nutzerdaten (nur eigene Testzeilen).
-- Ausfuehren: NACH paket47-sammlungen.sql oder direkt dahinter in derselben Transaktion (dann deren begin/commit weglassen).
-- Erwartet: «ERGEBNIS: n OK, 0 FEHL».
begin;
do $test$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  ok int := 0; bad int := 0; log text := '';
  n int; def text; rec record; st text;
begin
  insert into auth.users (id, email, email_confirmed_at, aud, role) values
    (a, 'a-' || a || '@test.invalid', now(), 'authenticated', 'authenticated'),
    (b, 'b-' || b || '@test.invalid', now(), 'authenticated', 'authenticated');

  -- ---------- 1 Constraint enthaelt alte und neue kinds ----------
  select pg_get_constraintdef(c.oid) into def from pg_constraint c
    where c.conrelid = 'public.savora_records'::regclass and c.conname = 'savora_records_kind_check';
  if def like '%recipe%' and def like '%mealplan%' and def like '%shopping%' and def like '%setting%'
     and def like '%collection%' and def like '%membership%' and def like '%pairing%' then ok := ok + 1;
  else bad := bad + 1; log := log || E'\nFEHL 1 Constraint: ' || coalesce(def, 'fehlt'); end if;

  -- ---------- 2 Konto A: neue kinds einfuegbar (wie der Client: Upsert) ----------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.savora_records (user_id, kind, id, data, deleted, client_updated_at) values
    (a, 'collection', 'col_test-47', '{"id":"col_test-47","name":"High Protein","color":"sage","icon":"leaf","order":0}', false, 2000001),
    (a, 'membership', 'col_test-47|r_test_1', '{"c":"col_test-47","r":"r_test_1"}', false, 2000001),
    (a, 'pairing', 'r_test_1~r_test_2', '{"a":"r_test_1","b":"r_test_2","type":"pairing","note":"Sauce"}', false, 2000001),
    (a, 'recipe', 'r_test_1', '{"id":"r_test_1","title":"Test"}', false, 1000)
  on conflict (user_id, kind, id) do update set data = excluded.data, deleted = excluded.deleted, client_updated_at = excluded.client_updated_at;
  select count(*) into n from public.savora_records where user_id = a;
  if n = 4 then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 2a eingefuegt: ' || n; end if;
  -- Grabstein ohne Daten (so sendet der Client geloeschte Datensaetze)
  insert into public.savora_records (user_id, kind, id, data, deleted, client_updated_at) values (a, 'membership', 'col_test-47|r_test_9', null, true, 2000002)
  on conflict (user_id, kind, id) do update set data = excluded.data, deleted = excluded.deleted, client_updated_at = excluded.client_updated_at;
  ok := ok + 1;

  -- ---------- 3 Unbekannter kind abgelehnt, ganzer Block ----------
  begin
    insert into public.savora_records (user_id, kind, id, data, deleted, client_updated_at) values (a, 'collection-link', 'x|y', '{}', false, 1);
    bad := bad + 1; log := log || E'\nFEHL 3a unbekannter kind angenommen';
  exception when check_violation then ok := ok + 1; end;
  begin
    insert into public.savora_records (user_id, kind, id, data, deleted, client_updated_at) values
      (a, 'collection', 'col_block_ok', '{"name":"Block"}', false, 1),
      (a, 'bogus', 'x', '{}', false, 1);
    bad := bad + 1; log := log || E'\nFEHL 3b Block mit unbekanntem kind angenommen';
  exception when check_violation then ok := ok + 1; end;
  select count(*) into n from public.savora_records where user_id = a and id = 'col_block_ok';
  if n = 0 then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 3c Teil des abgelehnten Blocks gespeichert'; end if;

  -- ---------- 4 Trigger: aelterer Stand wird verworfen, neuerer gewinnt ----------
  insert into public.savora_records (user_id, kind, id, data, deleted, client_updated_at) values (a, 'membership', 'col_test-47|r_test_1', null, true, 2000000)
  on conflict (user_id, kind, id) do update set data = excluded.data, deleted = excluded.deleted, client_updated_at = excluded.client_updated_at;
  select deleted, client_updated_at into rec from public.savora_records where user_id = a and kind = 'membership' and id = 'col_test-47|r_test_1';
  if rec.deleted = false and rec.client_updated_at = 2000001 then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 4a aelteres Entfernen ueberschrieb: ' || rec::text; end if;
  insert into public.savora_records (user_id, kind, id, data, deleted, client_updated_at) values (a, 'membership', 'col_test-47|r_test_1', null, true, 2000004)
  on conflict (user_id, kind, id) do update set data = excluded.data, deleted = excluded.deleted, client_updated_at = excluded.client_updated_at;
  select deleted, client_updated_at into rec from public.savora_records where user_id = a and kind = 'membership' and id = 'col_test-47|r_test_1';
  if rec.deleted = true and rec.client_updated_at = 2000004 then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 4b neueres Entfernen nicht uebernommen: ' || rec::text; end if;
  -- Paritaetsregel: gleiche Uhr (2000002), Hinzufuegen (ungerade 2000005) schlaegt Entfernen (gerade 2000004)
  insert into public.savora_records (user_id, kind, id, data, deleted, client_updated_at) values (a, 'membership', 'col_test-47|r_test_1', '{"c":"col_test-47","r":"r_test_1"}', false, 2000005)
  on conflict (user_id, kind, id) do update set data = excluded.data, deleted = excluded.deleted, client_updated_at = excluded.client_updated_at;
  insert into public.savora_records (user_id, kind, id, data, deleted, client_updated_at) values (a, 'membership', 'col_test-47|r_test_1', null, true, 2000004)
  on conflict (user_id, kind, id) do update set data = excluded.data, deleted = excluded.deleted, client_updated_at = excluded.client_updated_at;
  select deleted into rec from public.savora_records where user_id = a and kind = 'membership' and id = 'col_test-47|r_test_1';
  if rec.deleted = false then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 4c Gleichstand: Entfernen gewann'; end if;
  execute 'reset role';

  -- ---------- 5 RLS: Konto B sieht und aendert nichts von A ----------
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.savora_records where user_id = a;
  if n = 0 then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 5a B sieht A: ' || n; end if;
  update public.savora_records set data = '{"name":"gekapert"}', client_updated_at = 9999999999 where user_id = a and kind = 'collection';
  get diagnostics n = row_count;
  if n = 0 then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 5b B aendert A: ' || n; end if;
  delete from public.savora_records where user_id = a;
  get diagnostics n = row_count;
  if n = 0 then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 5c B loescht A: ' || n; end if;
  begin
    insert into public.savora_records (user_id, kind, id, data, deleted, client_updated_at) values (a, 'pairing', 'r_x~r_y', '{}', false, 1);
    bad := bad + 1; log := log || E'\nFEHL 5d B schreibt in Konto A';
  exception when insufficient_privilege then ok := ok + 1;
    when others then if sqlerrm like '%row-level security%' then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 5d ' || sqlerrm; end if;
  end;
  -- Upsert mit gleicher ID im eigenen Konto: eigener Namensraum, beruehrt A nicht
  insert into public.savora_records (user_id, kind, id, data, deleted, client_updated_at) values (b, 'collection', 'col_test-47', '{"name":"B eigene"}', false, 3000001)
  on conflict (user_id, kind, id) do update set data = excluded.data, deleted = excluded.deleted, client_updated_at = excluded.client_updated_at;
  ok := ok + 1;
  execute 'reset role';
  select data->>'name' into st from public.savora_records where user_id = a and kind = 'collection' and id = 'col_test-47';
  if st = 'High Protein' then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 5e A-Sammlung veraendert: ' || coalesce(st, 'null'); end if;

  -- ---------- 6 anon liest nichts ----------
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  begin
    select count(*) into n from public.savora_records where kind in ('collection', 'membership', 'pairing');
    if n = 0 then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 6 anon sieht ' || n; end if;
  exception when insufficient_privilege then ok := ok + 1; end;
  execute 'reset role';

  raise exception 'ERGEBNIS: % OK, % FEHL%', ok, bad, log;
end
$test$;
commit;
