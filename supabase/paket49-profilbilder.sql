-- Savora Paket 49 (0.89.0): Profilbild-Vorlagen fuer das oeffentliche Profil.
-- Additiv und wiederholbar (create or replace). Keine Tabellen- oder Datenaenderung.
--
-- Neu: savora_public_profiles.avatar_path darf zusaetzlich «preset:01» bis «preset:12» sein. Das Bild liegt in der App
-- (assets/profilbilder/), es gibt dafuer keine Datei im Speicher und keine Pruefung in storage.objects.
-- Die Funktion ist exakt die aus paket45-bibliothek.sql (einzige Definition bis Paket 48), nur die Pruefung des
-- Profilbilds ist um den Vorlagen-Fall ergaenzt.
--
-- Speicher-Funktionen (savora_lib_object_public, savora_lib_object_in_use, savora_lib_can_upload) bleiben unveraendert:
-- sie vergleichen avatar_path nur exakt mit einem Objektnamen. Objektnamen muessen mit dem eigenen Benutzerordner
-- (uuid/) beginnen, «preset:NN» kann also nie einer Datei entsprechen und wird nie als Datei gelesen oder geloescht.
-- Wechselt jemand von einem hochgeladenen Bild auf eine Vorlage, gilt die alte Datei wie beim «Bild entfernen» als
-- nicht mehr verwendet (sie ist nicht mehr oeffentlich lesbar und darf vom Eigentuemer geloescht werden).

create or replace function public.savora_pub_profile_set(p_name text, p_bio text, p_avatar_path text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare me uuid := public.savora_need_user(); n text := btrim(coalesce(p_name, '')); b text := btrim(coalesce(p_bio, '')); a text := nullif(btrim(coalesce(p_avatar_path, '')), ''); pid text; tries int := 0;
begin
  if n = '' then raise exception 'Gib einen Anzeigenamen ein.'; end if;
  if char_length(n) > 40 then raise exception 'Der Anzeigename ist zu lang (höchstens 40 Zeichen).'; end if;
  if char_length(b) > 160 then raise exception 'Der Kurztext ist zu lang (höchstens 160 Zeichen).'; end if;
  if a is not null and a !~ '^preset:(0[1-9]|1[0-2])$' then
    if a !~ ('^' || me::text || '/avatar-[0-9a-f]{8,32}\.(jpg|webp)$') then raise exception 'Ungültiges Profilbild.'; end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'savora-public' and o.name = a) then raise exception 'Das Profilbild wurde nicht vollständig hochgeladen. Bitte nochmals versuchen.'; end if;
  end if;
  if exists (select 1 from public.savora_public_profiles where user_id = me) then
    update public.savora_public_profiles set display_name = n, bio = b, avatar_path = a, updated_at = now() where user_id = me;
  else
    loop
      pid := (select string_agg(substr('abcdefghijkmnpqrstuvwxyz23456789', 1 + floor(random() * 32)::int, 1), '') from generate_series(1, 12));
      exit when not exists (select 1 from public.savora_public_profiles where public_id = pid);
      tries := tries + 1; if tries > 20 then raise exception 'Bitte nochmals versuchen.'; end if;
    end loop;
    insert into public.savora_public_profiles (user_id, public_id, display_name, bio, avatar_path) values (me, pid, n, b, a);
  end if;
  return public.savora_pub_profile_get();
end $$;

-- Rechte wie in Paket 45 (create or replace behaelt sie, hier zur Sicherheit wiederholt)
revoke all on function public.savora_pub_profile_set(text, text, text) from public, anon;
grant execute on function public.savora_pub_profile_set(text, text, text) to authenticated;
