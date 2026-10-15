-- Pruefung der Zugriffsregeln der Rezeptbibliothek (Paket 45) mit isolierten Testdaten.
-- Laeuft vollstaendig in EINER Transaktion und endet IMMER mit einem Fehler «ERGEBNIS …»: dadurch wird alles
-- zurueckgerollt (Testkonten, Testrezepte, Testbilder). In der Datenbank bleibt nichts zurueck.
-- Ausfuehren: im Supabase SQL-Editor NACH dem Einspielen von paket45-bibliothek.sql (oder direkt dahinter in derselben
-- Transaktion). Erwartet: «ERGEBNIS: n OK, 0 FEHL».
-- Rollen: anonymer Besucher (anon), Autor A, Nutzer B, Moderator M (alle nur in dieser Transaktion).
begin;
do $test$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); m uuid := gen_random_uuid();
  ok int := 0; bad int := 0; log text := '';
  res jsonb; msg text; n int; pid uuid := gen_random_uuid(); pid2 uuid := gen_random_uuid(); pidb uuid := gen_random_uuid();
  req1 uuid := gen_random_uuid(); rec jsonb; img text; thumb text; flag boolean;
begin
  -- Hilfen als lokale Bloecke: chk(name, bedingung)
  insert into auth.users (id, email, email_confirmed_at, aud, role) values
    (a, 'a-' || a || '@test.invalid', now(), 'authenticated', 'authenticated'),
    (b, 'b-' || b || '@test.invalid', now(), 'authenticated', 'authenticated'),
    (m, 'm-' || m || '@test.invalid', now(), 'authenticated', 'authenticated');
  insert into public.savora_moderators (user_id) values (m);
  insert into public.savora_profiles (user_id, handle, display_name, invite_code) values (a, 'test_a_' || substr(md5(a::text), 1, 8), 'Freund A', 'SAV-TEST-' || upper(substr(md5(a::text), 1, 4)));

  rec := jsonb_build_object('title', 'Test Rösti mit Speck', 'servings', 4, 'timeMinutes', 25, 'notes', 'PRIVATE NOTIZ', 'favorite', true, 'cookLog', '[1]'::jsonb,
    'diet', '["vegetarisch","glutenfrei"]'::jsonb, 'categories', '["dinner","side"]'::jsonb, 'unknownField', 'x',
    'ingredients', jsonb_build_array(jsonb_build_object('amount', '', 'unit', '', 'name', 'Teig:', 'isGroupHeader', true),
       jsonb_build_object('amount', '1-2', 'unit', 'EL', 'name', 'Butter', 'group', 'Teig'),
       jsonb_build_object('amount', '', 'unit', '', 'name', 'Salz nach Geschmack', 'secret', 'x'),
       jsonb_build_object('amount', 600, 'unit', 'g', 'name', 'Kartoffeln')),
    'steps', jsonb_build_array(jsonb_build_object('text', 'Vorbereiten:'), jsonb_build_object('text', 'Kartoffeln reiben.', 'ingredientRefs', '[1]'::jsonb)),
    'source', jsonb_build_object('url', 'javascript:alert(1)', 'text', 'Grossmutter'), 'tips', 'Heiss servieren.');

  -- ---------- 1 Ohne oeffentliches Profil kein Veroeffentlichen; anon darf nicht veroeffentlichen ----------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.savora_pub_publish(req1, pid, null, rec, null, null, 'r_local_1', 'bibliothek-2026-10-15', true);
    bad := bad + 1; log := log || E'\nFEHL 1a ohne Profil veroeffentlicht';
  exception when others then
    if sqlerrm like 'Richte zuerst%' then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 1a ' || sqlerrm; end if;
  end;
  res := public.savora_pub_profile_set('Anna Autorin', 'Kocht gern.', null);
  if res ? 'public_id' and not (res ? 'invite_code') and not (res ? 'handle') and res->>'public_id' ~ '^[a-z0-9]{12}$' then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 1b Profilantwort ' || res::text; end if;
  -- Rechte nicht bestaetigt
  begin
    perform public.savora_pub_publish(req1, pid, null, rec, null, null, 'r_local_1', 'bibliothek-2026-10-15', false);
    bad := bad + 1; log := log || E'\nFEHL 1c ohne Rechtebestaetigung';
  exception when others then ok := ok + 1; end;
  -- Gueltig
  res := public.savora_pub_publish(req1, pid, null, rec, null, null, 'r_local_1', 'bibliothek-2026-10-15', true);
  if (res->>'version')::int = 1 and res->>'status' = 'published' then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 1d ' || res::text; end if;
  -- Wiederholung (gleiche Request-ID) erzeugt nichts Neues
  res := public.savora_pub_publish(req1, pid, null, rec, null, null, 'r_local_1', 'bibliothek-2026-10-15', true);
  if res->>'repeated' = 'true' then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 1e Wiederholung ' || res::text; end if;
  -- Gleiches Ursprungsrezept mit neuer ID: keine Dublette
  begin
    perform public.savora_pub_publish(gen_random_uuid(), pid2, null, rec, null, null, 'r_local_1', 'bibliothek-2026-10-15', true);
    bad := bad + 1; log := log || E'\nFEHL 1f Dublette';
  exception when others then if sqlerrm like 'KONFLIKT:%' then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 1f ' || sqlerrm; end if; end;
  -- Versionskonflikt
  begin
    perform public.savora_pub_publish(gen_random_uuid(), pid, 5, rec, null, null, 'r_local_1', 'bibliothek-2026-10-15', true);
    bad := bad + 1; log := log || E'\nFEHL 1g Version';
  exception when others then if sqlerrm like 'KONFLIKT:%' then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 1g ' || sqlerrm; end if; end;
  -- Direkter Tabellenzugriff gesperrt (Eigentuemer/Version nicht manipulierbar)
  begin
    execute format('update public.savora_publications set version = 99, owner = %L where id = %L', b, pid);
    bad := bad + 1; log := log || E'\nFEHL 1h direkte Aenderung erlaubt';
  exception when others then ok := ok + 1; end;
  begin
    execute format('insert into public.savora_moderators (user_id) values (%L)', a);
    bad := bad + 1; log := log || E'\nFEHL 1i Moderator selbst gesetzt';
  exception when others then ok := ok + 1; end;
  begin
    perform public.savora_mod_reports('open');
    bad := bad + 1; log := log || E'\nFEHL 1j Moderation ohne Rolle';
  exception when others then ok := ok + 1; end;
  if public.savora_mod_is() = false then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 1k mod_is'; end if;
  execute 'reset role';

  -- ---------- 2 Bereinigung der oeffentlichen Daten ----------
  select recipe into res from public.savora_publications where id = pid;
  if not (res ? 'notes') and not (res ? 'favorite') and not (res ? 'cookLog') and not (res ? 'unknownField') then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 2a private Felder ' || res::text; end if;
  if res->'diet' = '["vegetarisch"]'::jsonb then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 2b diet ' || (res->'diet')::text; end if;
  if res->'source'->>'url' = '' and res->'source'->>'text' = 'Grossmutter' then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 2c Quelle ' || (res->'source')::text; end if;
  if jsonb_array_length(res->'ingredients') = 4 and res->'ingredients'->0->>'isGroupHeader' = 'true' and res->'ingredients'->1->>'amount' = '1-2'
     and res->'ingredients'->2->>'amount' = '' and not (res->'ingredients'->2 ? 'secret') and (res->'ingredients'->3->'amount') = '600'::jsonb then ok := ok + 1;
  else bad := bad + 1; log := log || E'\nFEHL 2d Zutaten ' || (res->'ingredients')::text; end if;
  if jsonb_array_length(res->'steps') = 2 and not (res->'steps'->1 ? 'ingredientRefs') then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 2e Schritte'; end if;
  begin perform public.savora_lib_clean(rec - 'servings'); bad := bad + 1; log := log || E'\nFEHL 2f ohne Ergibt';
  exception when others then ok := ok + 1; end;
  if public.savora_lib_clean(rec || '{"timeMinutes": 0}'::jsonb)->'timeMinutes' = 'null'::jsonb then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 2g Zeit 0 wurde nicht unbekannt'; end if;
  if (select search_text from public.savora_publications where id = pid) like '%rosti%kartoffeln%' then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 2h Suchtext'; end if;

  -- ---------- 3 Anonymer Besucher ----------
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  res := public.savora_lib_search('rosti', '{}'::jsonb, 'newest', null, 24);
  if (res->>'total')::int = 1 and res->'items'->0->>'id' = pid::text then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 3a Suche ' || res::text; end if;
  if (select array_agg(k order by k) from jsonb_object_keys(res->'items'->0->'author') k) = array['display_name', 'public_id'] then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 3b Karte Autor'; end if;
  res := public.savora_lib_search('', '{"quick": true}'::jsonb, 'newest', null, 24);
  if (res->>'total')::int = 1 then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 3c quick'; end if;
  res := public.savora_lib_search('', '{"veg": true, "categories": ["dinner", "side"]}'::jsonb, 'quickest', null, 24);
  if (res->>'total')::int = 1 then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 3d veg+kat'; end if;
  res := public.savora_lib_search('', '{"categories": ["breakfast", "side"]}'::jsonb, 'newest', null, 24);
  if (res->>'total')::int = 0 then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 3e Mahlzeit UND Gericht'; end if;
  res := public.savora_lib_get(pid);
  if res->>'id' = pid::text and (select array_agg(k order by k) from jsonb_object_keys(res->'author') k) = array['avatar_path', 'bio', 'display_name', 'public_id'] then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 3f Detail ' || coalesce(res::text, 'null'); end if;
  if res::text not like '%SAV-%' and res::text not like '%test_a_%' and res::text not like '%@test.invalid%' and res::text not like '%' || a::text || '%' then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 3g private Angaben in Antwort'; end if;
  res := public.savora_lib_profile(res->'author'->>'public_id', null);
  if jsonb_array_length(res->'items') = 1 and not (res->'profile' ? 'invite_code') and not (res->'profile' ? 'handle') then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 3h Profil'; end if;
  begin execute 'select count(*) from public.savora_publications'; bad := bad + 1; log := log || E'\nFEHL 3i Tabelle lesbar';
  exception when others then ok := ok + 1; end;
  begin execute 'select count(*) from public.savora_public_profiles'; bad := bad + 1; log := log || E'\nFEHL 3j Profiltabelle lesbar';
  exception when others then ok := ok + 1; end;
  begin
    execute 'select count(*) from public.savora_records' into n;
    if n = 0 then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 3k private Datensaetze sichtbar'; end if;
  exception when others then ok := ok + 1; end;
  begin perform public.savora_pub_mine(); bad := bad + 1; log := log || E'\nFEHL 3l anon mine';
  exception when others then ok := ok + 1; end;
  begin perform public.savora_lib_report(pid, 'spam', null); bad := bad + 1; log := log || E'\nFEHL 3m anon meldet';
  exception when others then ok := ok + 1; end;
  execute 'reset role';

  -- ---------- 4 Nutzer B ----------
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.savora_pub_profile_set('Ben', '', null);
  begin perform public.savora_pub_publish(gen_random_uuid(), pid, 1, rec, null, null, 'x', 'bibliothek-2026-10-15', true); bad := bad + 1; log := log || E'\nFEHL 4a B aendert A';
  exception when others then if sqlerrm like '%gehört nicht dir%' then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 4a ' || sqlerrm; end if; end;
  begin perform public.savora_pub_withdraw(pid); bad := bad + 1; log := log || E'\nFEHL 4b B zieht A zurueck';
  exception when others then ok := ok + 1; end;
  if jsonb_array_length(public.savora_pub_mine()) = 0 then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 4c B sieht fremde'; end if;
  res := public.savora_lib_report(pid, 'spam', 'Werbung');
  res := public.savora_lib_report(pid, 'spam', 'Werbung');
  if res->>'repeated' = 'true' then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 4d Doppelmeldung'; end if;
  begin perform public.savora_lib_report(pid, 'frech', null); bad := bad + 1; log := log || E'\nFEHL 4e Grund';
  exception when others then ok := ok + 1; end;
  -- Bild-Upload in fremden Ordner verboten
  if public.savora_lib_can_upload(a::text || '/' || pid::text || '/full-abcdef12.webp') = false and public.savora_lib_can_upload(b::text || '/' || pid::text || '/full-abcdef12.webp') = false
     and public.savora_lib_can_upload(b::text || '/' || pidb::text || '/full-abcdef12.webp') = true and public.savora_lib_can_upload(b::text || '/x.svg') = false then ok := ok + 1;
  else bad := bad + 1; log := log || E'\nFEHL 4f Upload-Regel'; end if;
  execute 'reset role';

  -- ---------- 5 Bilder: lesbar nur solange veroeffentlicht ----------
  img := a::text || '/' || pid::text || '/full-0123abcd.webp'; thumb := a::text || '/' || pid::text || '/thumb-0123abcd.webp';
  insert into storage.objects (bucket_id, name, owner_id, metadata) values ('savora-public', img, a::text, '{"mimetype":"image/webp","size":1000}'),
    ('savora-public', thumb, a::text, '{"mimetype":"image/webp","size":500}'),
    ('savora-public', a::text || '/' || pid::text || '/full-ffffeeee.webp', a::text, '{"mimetype":"image/webp","size":1000}');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res := public.savora_pub_publish(gen_random_uuid(), pid, 1, rec, img, thumb, 'r_local_1', 'bibliothek-2026-10-15', true);
  if (res->>'version')::int = 2 then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 5a Aktualisierung ' || res::text; end if;
  begin perform public.savora_pub_publish(gen_random_uuid(), pid, 2, rec, a::text || '/' || pid::text || '/full-99999999.webp', a::text || '/' || pid::text || '/thumb-99999999.webp', 'r_local_1', 'bibliothek-2026-10-15', true);
    bad := bad + 1; log := log || E'\nFEHL 5b fehlendes Bild akzeptiert';
  exception when others then ok := ok + 1; end;
  execute 'reset role';   -- Tabellenkontrolle als Betreiber (authenticated darf die Tabelle nicht lesen)
  if (select version from public.savora_publications where id = pid) = 2 then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 5c Fehler hat Fassung veraendert'; end if;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  execute format('select count(*) from storage.objects where bucket_id = %L and name in (%L, %L)', 'savora-public', img, thumb) into n;
  if n = 2 then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 5d anon liest veroeffentlichtes Bild nicht: ' || n; end if;
  execute format('select count(*) from storage.objects where bucket_id = %L and name = %L', 'savora-public', a::text || '/' || pid::text || '/full-ffffeeee.webp') into n;
  if n = 0 then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 5e unbenutztes Bild oeffentlich'; end if;
  execute 'select count(*) from storage.objects where bucket_id = ''savora-images''' into n;
  if n = 0 then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 5f private Bilder lesbar'; end if;
  execute 'reset role';

  -- ---------- 6 Zurueckziehen ----------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.savora_pub_withdraw(pid);
  begin perform public.savora_pub_profile_delete(); ok := ok + 1;
  exception when others then bad := bad + 1; log := log || E'\nFEHL 6a Profil loeschen ohne Veroeffentlichung: ' || sqlerrm; end;
  perform public.savora_pub_profile_set('Anna Autorin', '', null);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  if public.savora_lib_get(pid) is null and (public.savora_lib_search('', '{}'::jsonb, 'newest', null, 24)->>'total')::int = 0 then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 6b zurueckgezogen sichtbar'; end if;
  execute format('select count(*) from storage.objects where bucket_id = %L and name = %L', 'savora-public', img) into n;
  if n = 0 then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 6c Bild nach Rueckzug lesbar'; end if;
  execute 'reset role';

  -- ---------- 7 Moderation ----------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res := public.savora_pub_publish(gen_random_uuid(), pid, 2, rec, img, thumb, 'r_local_1', 'bibliothek-2026-10-15', true);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.savora_mod_is() and jsonb_array_length(public.savora_mod_reports('open')) = 1 then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 7a Meldungen'; end if;
  if (public.savora_mod_reports('open')->0) ? 'reporter' = false and public.savora_mod_reports('open')::text not like '%' || b::text || '%' then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 7b Melder sichtbar'; end if;
  perform public.savora_mod_action(pid, 'hide', 'Spam');
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.savora_pub_publish(gen_random_uuid(), pid, 3, rec, null, null, 'r_local_1', 'bibliothek-2026-10-15', true); bad := bad + 1; log := log || E'\nFEHL 7c gesperrt erneut veroeffentlicht';
  exception when others then ok := ok + 1; end;
  begin perform public.savora_pub_publish(gen_random_uuid(), gen_random_uuid(), null, rec, null, null, 'r_local_1', 'bibliothek-2026-10-15', true); bad := bad + 1; log := log || E'\nFEHL 7d Umgehung mit neuer ID';
  exception when others then ok := ok + 1; end;
  begin perform public.savora_pub_withdraw(pid); bad := bad + 1; log := log || E'\nFEHL 7e Autor hebt Sperre auf';
  exception when others then ok := ok + 1; end;
  if (public.savora_pub_mine()->0->>'blocked')::boolean and public.savora_pub_mine()::text not like '%Spam%' then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 7f mine gesperrt'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  if public.savora_lib_get(pid) is null then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 7g gesperrt sichtbar'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.savora_mod_ban(pid, true, 'Wiederholt');
  perform public.savora_mod_action(pid, 'restore', null);
  perform public.savora_mod_close_report((public.savora_mod_reports('open')->0->>'report_id')::uuid, 'erledigt');
  if jsonb_array_length(public.savora_mod_reports('open')) = 0 then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 7h Meldung abschliessen'; end if;
  execute 'reset role';
  if (select count(*) from public.savora_lib_mod_log where moderator = m) = 4 then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 7i Protokoll'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.savora_pub_publish(gen_random_uuid(), pid, 3, rec, null, null, 'r_local_1', 'bibliothek-2026-10-15', true); bad := bad + 1; log := log || E'\nFEHL 7j gesperrter Autor veroeffentlicht';
  exception when others then ok := ok + 1; end;
  if (public.savora_pub_profile_get()->>'publishing_blocked')::boolean then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 7k Sperre nicht angezeigt'; end if;
  execute 'reset role';
  delete from public.savora_lib_bans where user_id = a;

  -- ---------- 8 Limits ----------
  update public.savora_lib_limits set value = 0 where key = 'publish_per_day';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.savora_pub_publish(gen_random_uuid(), pidb, null, rec, null, null, 'r_b', 'bibliothek-2026-10-15', true); bad := bad + 1; log := log || E'\nFEHL 8a Limit';
  exception when others then if sqlerrm like '%morgen%' then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 8a ' || sqlerrm; end if; end;
  execute 'reset role';
  update public.savora_lib_limits set value = 30 where key = 'publish_per_day';

  -- ---------- 9 Pagination stabil, keine Dubletten ----------
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  for n in 1..30 loop
    perform public.savora_pub_publish(gen_random_uuid(), gen_random_uuid(), null, rec || jsonb_build_object('title', 'Seite ' || n, 'timeMinutes', case when n % 3 = 0 then null else n end), null, null, 'r_page_' || n, 'bibliothek-2026-10-15', true);
  end loop;
  execute 'reset role';
  update public.savora_publications set published_at = '2026-01-01T00:00:00Z' where owner = b;   -- gleiche Zeit: Zweitsortierung muss greifen
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  flag := true;
  for msg in select unnest(array['newest', 'quickest']) loop
    declare seen text[] := '{}'; cur jsonb := null; pages int := 0; ids text[];
    begin
      loop
        res := public.savora_lib_search('seite', '{}'::jsonb, msg, cur, 7);
        ids := array(select x->>'id' from jsonb_array_elements(res->'items') x);
        if ids && seen then flag := false; end if;
        seen := seen || ids; pages := pages + 1;
        cur := res->'next_cursor';
        exit when cur is null or cur = 'null'::jsonb or pages > 10;
      end loop;
      if cardinality(seen) <> 30 then flag := false; log := log || E'\n  ' || msg || ': ' || cardinality(seen); end if;
    end;
  end loop;
  if flag then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 9a Pagination'; end if;
  res := public.savora_lib_search('seite', '{}'::jsonb, 'quickest', null, 48);
  if (res->'items'->0->>'total_minutes')::int = 1 and res->'items'->29->'total_minutes' = 'null'::jsonb then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 9b unbekannte Zeit zuletzt'; end if;
  res := public.savora_lib_search('seite', '{"quick": true}'::jsonb, 'newest', null, 48);
  if (res->>'total')::int = 20 then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 9c quick ohne unbekannte Zeit: ' || (res->>'total'); end if;
  execute 'reset role';

  -- ---------- 10 Konto loeschen entfernt Profil und Veroeffentlichungen ----------
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.savora_pub_withdraw_all();
  perform public.savora_delete_account();
  execute 'reset role';
  if not exists (select 1 from public.savora_publications where owner = b) and not exists (select 1 from public.savora_public_profiles where user_id = b) then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 10a Kontoloeschung'; end if;

  -- ---------- 11 Suche: Sonderzeichen, lange Begriffe, Cursor, Seitengroesse ----------
  -- % und _ ueberleben die Normalisierung nie, koennen also in LIKE keine Platzhalter werden
  if public.savora_lib_norm('Crème Brûlée Jalapeño Façon Smørrebrød Straße') = 'creme brulee jalapeno facon smorrebrod strasse'
     and public.savora_lib_norm('a%b_c\d*e') = 'a b c d e' then ok := ok + 1;
  else bad := bad + 1; log := log || E'\nFEHL 11a Normalisierung ' || public.savora_lib_norm('Crème Brûlée Jalapeño Façon Smørrebrød Straße'); end if;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  begin
    n := (public.savora_lib_search('', '{}'::jsonb, 'newest', null, 24)->>'total')::int;
    if (public.savora_lib_search('%%%', '{}'::jsonb, 'newest', null, 24)->>'total')::int = n
       and (public.savora_lib_search('___', '{}'::jsonb, 'newest', null, 24)->>'total')::int = n
       and (public.savora_lib_search('zzq%_', '{}'::jsonb, 'newest', null, 24)->>'total')::int = 0 then ok := ok + 1;
    else bad := bad + 1; log := log || E'\nFEHL 11b Platzhalter wirken in der Suche'; end if;
  exception when others then bad := bad + 1; log := log || E'\nFEHL 11b ' || sqlerrm; end;
  begin
    res := public.savora_lib_search(repeat('kartoffel ', 20000), '{"categories": ["x"], "diet": "kein-array", "max_minutes": "abc"}'::jsonb, 'unbekannt', null, 24);
    if res ? 'items' then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 11c langer Begriff ' || res::text; end if;
  exception when others then bad := bad + 1; log := log || E'\nFEHL 11c ' || sqlerrm; end;
  begin perform public.savora_lib_search('', '{}'::jsonb, 'newest', '{"t": "kein-datum", "id": "x"}'::jsonb, 24); bad := bad + 1; log := log || E'\nFEHL 11d ungueltiger Cursor angenommen';
  exception when others then if sqlerrm = 'Ungültige Seitenangabe.' then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 11d ' || sqlerrm; end if; end;
  begin perform public.savora_lib_search('', '{}'::jsonb, 'newest', '{}'::jsonb, 24); bad := bad + 1; log := log || E'\nFEHL 11e leerer Cursor angenommen';
  exception when others then if sqlerrm = 'Ungültige Seitenangabe.' then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 11e ' || sqlerrm; end if; end;
  begin perform public.savora_lib_profile((select 'x'), '{"t": "2026-01-01", "id": "kaputt"}'::jsonb); ok := ok + 1;   -- unbekanntes Profil: null vor Cursorpruefung
  exception when others then bad := bad + 1; log := log || E'\nFEHL 11f ' || sqlerrm; end;
  if public.savora_lib_profile('gibtesnicht1', null) is null and public.savora_lib_get(gen_random_uuid()) is null then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 11g unbekannt nicht null'; end if;
  begin
    if jsonb_array_length(public.savora_lib_search('', '{}'::jsonb, 'newest', '"text"'::jsonb, -5)->'items') <= 1
       and jsonb_array_length(public.savora_lib_search('', '{}'::jsonb, 'newest', null, 100000)->'items') <= 48 then ok := ok + 1;
    else bad := bad + 1; log := log || E'\nFEHL 11h Seitengroesse'; end if;
  exception when others then bad := bad + 1; log := log || E'\nFEHL 11h ' || sqlerrm; end;
  -- ---------- 12 anon: keine internen oder angemeldeten Funktionen ----------
  begin perform public.savora_pub_publish(gen_random_uuid(), gen_random_uuid(), null, rec, null, null, 'anon', 'bibliothek-2026-10-15', true); bad := bad + 1; log := log || E'\nFEHL 12a anon veroeffentlicht';
  exception when others then ok := ok + 1; end;
  begin perform public.savora_lib_clean(rec); bad := bad + 1; log := log || E'\nFEHL 12b interne Funktion fuer anon';
  exception when others then ok := ok + 1; end;
  begin perform public.savora_mod_action(pid, 'hide', null); bad := bad + 1; log := log || E'\nFEHL 12c anon moderiert';
  exception when others then ok := ok + 1; end;
  begin execute 'insert into storage.objects (bucket_id, name) values (''savora-public'', ''x/avatar-12345678.webp'')'; bad := bad + 1; log := log || E'\nFEHL 12d anon laedt hoch';
  exception when others then ok := ok + 1; end;
  execute 'reset role';

  -- ---------- 13 Profilbild, Hochladen und Loeschen im Speicher ----------
  insert into storage.objects (bucket_id, name, owner_id, metadata) values
    ('savora-public', a::text || '/avatar-aaaa1111.webp', a::text, '{"mimetype":"image/webp","size":100}'),
    ('savora-public', m::text || '/avatar-bbbb2222.webp', m::text, '{"mimetype":"image/webp","size":100}');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.savora_pub_profile_set('Anna Autorin', '', m::text || '/avatar-bbbb2222.webp'); bad := bad + 1; log := log || E'\nFEHL 13a fremdes Profilbild';
  exception when others then if sqlerrm = 'Ungültiges Profilbild.' then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 13a ' || sqlerrm; end if; end;
  begin perform public.savora_pub_profile_set('Anna Autorin', '', a::text || '/../' || m::text || '/avatar-bbbb2222.webp'); bad := bad + 1; log := log || E'\nFEHL 13b Pfad mit ..';
  exception when others then ok := ok + 1; end;
  begin perform public.savora_pub_profile_set('Anna Autorin', '', a::text || '/avatar-cccc3333.webp'); bad := bad + 1; log := log || E'\nFEHL 13c nicht hochgeladenes Profilbild';
  exception when others then ok := ok + 1; end;
  res := public.savora_pub_profile_set('Anna Autorin', '', a::text || '/avatar-aaaa1111.webp');
  if res->>'avatar_path' = a::text || '/avatar-aaaa1111.webp' then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 13d eigenes Profilbild ' || res::text; end if;
  -- Hochladen (Speicherregel direkt): eigener Ordner ja, fremder Ordner, falsche Endung und fremde Publikation nein
  begin execute format('insert into storage.objects (bucket_id, name, owner_id) values (%L, %L, %L)', 'savora-public', a::text || '/' || gen_random_uuid() || '/full-abcdef12.webp', a::text); ok := ok + 1;
  exception when others then bad := bad + 1; log := log || E'\nFEHL 13e eigener Upload abgelehnt: ' || sqlerrm; end;
  begin execute format('insert into storage.objects (bucket_id, name, owner_id) values (%L, %L, %L)', 'savora-public', m::text || '/avatar-dddd4444.webp', a::text); bad := bad + 1; log := log || E'\nFEHL 13f Upload in fremden Ordner';
  exception when others then ok := ok + 1; end;
  begin execute format('insert into storage.objects (bucket_id, name, owner_id) values (%L, %L, %L)', 'savora-public', a::text || '/avatar-dddd4444.svg', a::text); bad := bad + 1; log := log || E'\nFEHL 13g falsche Endung';
  exception when others then ok := ok + 1; end;
  -- Ueberschreiben ist nicht erlaubt (keine Aenderungsregel)
  execute format('update storage.objects set metadata = %L where bucket_id = %L and name = %L', '{"x":1}', 'savora-public', img);
  get diagnostics n = row_count;
  if n = 0 then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 13h Bild ueberschreibbar'; end if;
  -- Loeschen (wie die Speicher-API): veroeffentlichtes Bild und Profilbild nein, unbenutztes eigenes Bild ja
  perform set_config('storage.allow_delete_query', 'true', true);
  execute format('delete from storage.objects where bucket_id = %L and name in (%L, %L)', 'savora-public', img, a::text || '/avatar-aaaa1111.webp');
  get diagnostics n = row_count;
  if n = 0 and public.savora_lib_object_in_use(img) then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 13i verwendetes Bild loeschbar: ' || n; end if;
  execute format('delete from storage.objects where bucket_id = %L and name = %L', 'savora-public', a::text || '/' || pid::text || '/full-ffffeeee.webp');
  get diagnostics n = row_count;
  if n = 1 then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 13j unbenutztes eigenes Bild nicht loeschbar: ' || n; end if;
  -- Wiederverwendung der Request-ID durch ein anderes Konto, Melden des eigenen Rezepts
  begin perform public.savora_lib_report(pid, 'spam', null); bad := bad + 1; log := log || E'\nFEHL 13k eigenes Rezept gemeldet';
  exception when others then ok := ok + 1; end;
  -- Ohne Publikations-ID legt der Server eine neue an (Vertrag §4)
  begin
    res := public.savora_pub_publish(gen_random_uuid(), null, null, rec || '{"title": "Ohne ID"}'::jsonb, null, null, 'r_local_ohne_id', 'bibliothek-2026-10-15', true);
    if (res->>'version')::int = 1 and (res->>'id')::uuid is not null then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 13l ohne ID ' || res::text; end if;
  exception when others then bad := bad + 1; log := log || E'\nFEHL 13l ' || sqlerrm; end;
  begin perform public.savora_pub_publish(gen_random_uuid(), gen_random_uuid(), null, rec, img, thumb, 'r_local_fremdbild', 'bibliothek-2026-10-15', true); bad := bad + 1; log := log || E'\nFEHL 13m Bild einer anderen Publikation';
  exception when others then if sqlerrm = 'Ungültiges Bild.' then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 13m ' || sqlerrm; end if; end;
  begin execute 'update public.savora_lib_limits set value = 100000'; bad := bad + 1; log := log || E'\nFEHL 13n Limits aenderbar';
  exception when others then ok := ok + 1; end;
  execute 'reset role';
  -- M: liest weder unbenutzte Bilder von A noch loescht er sie; benutzt A's Request-ID nicht
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute format('select count(*) from storage.objects where bucket_id = %L and name like %L', 'savora-public', a::text || '/%') into n;
  -- sichtbar nur: veroeffentlichtes Bild + Vorschau + Profilbild (das eigene, unbenutzte Testbild aus 13e nicht)
  if n = 3 then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 13o M sieht fremde Bilder: ' || n; end if;
  execute format('delete from storage.objects where bucket_id = %L and name like %L', 'savora-public', a::text || '/%');
  get diagnostics n = row_count;
  if n = 0 then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 13p M loescht fremde Bilder: ' || n; end if;
  perform public.savora_pub_profile_set('Mo', '', null);
  begin perform public.savora_pub_publish(req1, gen_random_uuid(), null, rec, null, null, 'r_m', 'bibliothek-2026-10-15', true); bad := bad + 1; log := log || E'\nFEHL 13q fremde Request-ID';
  exception when others then if sqlerrm = 'Ungültige Anfrage.' then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 13q ' || sqlerrm; end if; end;
  execute 'reset role';
  update public.savora_lib_limits set value = 0 where key = 'reports_per_day';
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.savora_lib_report(pid, 'other', null); bad := bad + 1; log := log || E'\nFEHL 13r Meldelimit';
  exception when others then if sqlerrm like '%morgen%' then ok := ok + 1; else bad := bad + 1; log := log || E'\nFEHL 13r ' || sqlerrm; end if; end;
  execute 'reset role';
  perform set_config('storage.allow_delete_query', 'false', true);

  raise exception 'ERGEBNIS: % OK, % FEHL%', ok, bad, log;
end
$test$;
commit;
