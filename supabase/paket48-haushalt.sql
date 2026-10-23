-- Paket 48 (Savora 0.90): gemeinsame Haushaltsliste (Einkauf) und Datenart «pantry» (Vorrat) im Abgleich.
-- Rein additiv: neue Tabellen und Funktionen, bestehende Tabellen, Policies und Daten bleiben unveraendert.
-- Voraussetzung: supabase/paket36-teilen.sql (savora_profiles, savora_connections, savora_is_connected, savora_need_user).
-- Reihenfolge: VOR dem Client-Release 0.90 einspielen. Fehlt das Paket, blendet die App die Haushaltsliste aus
-- (RPC antwortet 404) und haelt Vorrat-Datensaetze in der Warteschlange, der uebrige Abgleich laeuft weiter.
--
-- Regeln:
-- - Ein Konto ist hoechstens in EINEM Haushalt aktiv (eindeutiger Teilindex). Einladungen duerfen mehrere offen sein.
-- - Einladen kann nur, wer mit der eingeladenen Person verbunden ist (Freunde, paket36).
-- - Zugriff auf die Liste nur fuer aktive Mitglieder, die mit ALLEN anderen aktiven Mitgliedern verbunden sind
--   (savora_hh_is_member). Wird eine Freundschaft beendet, ist die Liste fuer die Betroffenen pausiert.
-- - Pro Eintrag gewinnt der neuere client_updated_at (gekappt auf jetzt + 60 s, damit eine vorgehende Uhr nicht alles
--   sperrt). Gleichstand: Loeschen gewinnt. Hoechstens 1000 Eintraege (ohne Grabsteine), 200 pro Aufruf,
--   data hoechstens 4000 Byte. Grabsteine aelter als 60 Tage werden beim Schreiben entfernt.
-- - Verlassen: Erbe der Besitzerrolle ist das am laengsten aktive Mitglied; wer zuletzt geht, loescht den Haushalt
--   samt Eintraegen und offenen Einladungen. Dasselbe gilt beim Loeschen eines Kontos (Fremdschluessel + Ausloeser).
-- - Tabellen sind fuer anon/authenticated gesperrt, alles laeuft ueber die Funktionen (security definer,
--   search_path = '', Pruefung von auth.uid() in jeder Funktion).

begin;

-- ---------- Datenart pantry (Vorrat) im persoenlichen Abgleich ----------
alter table public.savora_records drop constraint if exists savora_records_kind_check;
alter table public.savora_records add constraint savora_records_kind_check
  check (kind = any (array['recipe', 'mealplan', 'shopping', 'setting', 'collection', 'membership', 'pairing', 'pantry']));

-- ---------- Tabellen ----------
create table if not exists public.savora_households (
  id uuid primary key default gen_random_uuid(),
  owner uuid references auth.users(id) on delete set null,
  name text not null default '' check (char_length(name) <= 40),
  created_at timestamptz not null default now()
);

create table if not exists public.savora_household_members (
  household_id uuid not null references public.savora_households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('invited', 'active')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  joined_at timestamptz,
  primary key (household_id, user_id)
);
-- Hoechstens eine aktive Mitgliedschaft pro Konto; dient zugleich als Index fuer «mein Haushalt».
create unique index if not exists savora_household_members_one_active
  on public.savora_household_members (user_id) where status = 'active';
-- Fremdschluessel-Index fuer Einladungen eines Kontos und fuer das Loeschen von Konten.
create index if not exists savora_household_members_user_idx on public.savora_household_members (user_id);

create table if not exists public.savora_household_items (
  household_id uuid not null references public.savora_households(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 100),
  data jsonb check (data is null or (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 4000)),
  deleted boolean not null default false,
  client_updated_at bigint not null,
  server_updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (household_id, id)
);
create index if not exists savora_household_items_pull_idx on public.savora_household_items (household_id, server_updated_at);

alter table public.savora_households enable row level security;
alter table public.savora_household_members enable row level security;
alter table public.savora_household_items enable row level security;
revoke all on public.savora_households, public.savora_household_members, public.savora_household_items from anon, authenticated;

-- ---------- Hilfsfunktionen (intern, nicht aufrufbar fuer Clients) ----------
create or replace function public.savora_hh_is_member(p_household uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.savora_household_members m
                 where m.household_id = p_household and m.user_id = p_user and m.status = 'active')
     and not exists (select 1 from public.savora_household_members o
                     where o.household_id = p_household and o.status = 'active' and o.user_id <> p_user
                       and not public.savora_is_connected(p_user, o.user_id));
$$;

create or replace function public.savora_hh_now_ms() returns bigint
language sql volatile set search_path = '' as $$
  select (extract(epoch from clock_timestamp()) * 1000)::bigint;
$$;

-- Nach dem Entfernen einer aktiven Mitgliedschaft (Verlassen, Konto geloescht): Besitz weitergeben oder Haushalt loeschen.
create or replace function public.savora_hh_member_gone() returns trigger
language plpgsql security definer set search_path = '' as $$
declare heir uuid;
begin
  if old.status <> 'active' then return null; end if;
  if not exists (select 1 from public.savora_households h where h.id = old.household_id) then return null; end if;   -- Haushalt wird gerade selbst geloescht
  select m.user_id into heir from public.savora_household_members m
    where m.household_id = old.household_id and m.status = 'active'
    order by m.joined_at nulls last, m.created_at limit 1;
  if heir is null then
    delete from public.savora_households where id = old.household_id;   -- letzte Person: Eintraege und Einladungen gehen mit
  else
    update public.savora_households set owner = heir
      where id = old.household_id and (owner is null or owner = old.user_id);
  end if;
  return null;
end $$;

drop trigger if exists savora_hh_member_gone on public.savora_household_members;
create trigger savora_hh_member_gone after delete on public.savora_household_members
  for each row execute function public.savora_hh_member_gone();

-- ---------- Zustand ----------
-- {household: {id, name, is_owner, active (Zugriff erlaubt), members: [...]} | null, invites: [...]}
create or replace function public.savora_hh_state() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := public.savora_need_user(); hid uuid; h public.savora_households; hh jsonb := null; inv jsonb;
begin
  select m.household_id into hid from public.savora_household_members m where m.user_id = me and m.status = 'active';
  if hid is not null then
    select * into h from public.savora_households where id = hid;
    hh := jsonb_build_object(
      'id', h.id, 'name', h.name, 'is_owner', h.owner = me,
      'active', public.savora_hh_is_member(hid, me),
      'members', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'handle', p.handle, 'display_name', p.display_name, 'status', m.status,
                 'is_me', m.user_id = me, 'is_owner', m.user_id = h.owner,
                 'connected', m.user_id = me or public.savora_is_connected(me, m.user_id))
               order by m.status, m.joined_at nulls last, p.handle)
        from public.savora_household_members m join public.savora_profiles p on p.user_id = m.user_id
        where m.household_id = hid), '[]'::jsonb));
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'household_id', m.household_id, 'from_handle', p.handle, 'from_name', p.display_name, 'created_at', m.created_at,
           'members', (select count(*) from public.savora_household_members x where x.household_id = m.household_id and x.status = 'active'))
         order by m.created_at), '[]'::jsonb) into inv
    from public.savora_household_members m
    left join public.savora_profiles p on p.user_id = m.invited_by
    where m.user_id = me and m.status = 'invited'
      and (m.invited_by is null or public.savora_is_connected(me, m.invited_by));
  return jsonb_build_object('household', hh, 'invites', inv);
end $$;

-- ---------- Einladen (legt den Haushalt beim ersten Mal an) ----------
create or replace function public.savora_hh_invite(p_handle text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare me uuid := public.savora_need_user(); other uuid; hid uuid;
begin
  if not exists (select 1 from public.savora_profiles where user_id = me) then raise exception 'Lege zuerst dein Profil an.'; end if;
  select user_id into other from public.savora_profiles where handle = lower(trim(both '@' from trim(coalesce(p_handle, ''))));
  if other is null or other = me or not public.savora_is_connected(me, other) then raise exception 'Du bist mit diesem Profil nicht verbunden.'; end if;
  select m.household_id into hid from public.savora_household_members m where m.user_id = me and m.status = 'active';
  if hid is null then
    insert into public.savora_households (owner) values (me) returning id into hid;
    insert into public.savora_household_members (household_id, user_id, status, joined_at) values (hid, me, 'active', now());
  else
    perform 1 from public.savora_households where id = hid for update;   -- Einladungen pro Haushalt nacheinander (Grenze zaehlen)
    if not public.savora_hh_is_member(hid, me) then raise exception 'Die gemeinsame Liste ist pausiert, weil nicht mehr alle verbunden sind.'; end if;
  end if;
  if exists (select 1 from public.savora_household_members where household_id = hid and user_id = other) then
    return public.savora_hh_state();   -- schon eingeladen oder schon Mitglied: nichts tun
  end if;
  if (select count(*) from public.savora_household_members where household_id = hid) >= 8 then
    raise exception 'Ein Haushalt hat hoechstens 8 Personen (mit offenen Einladungen).';
  end if;
  insert into public.savora_household_members (household_id, user_id, status, invited_by) values (hid, other, 'invited', me);
  return public.savora_hh_state();
end $$;

create or replace function public.savora_hh_accept(p_household uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare me uuid := public.savora_need_user(); o record;
begin
  perform 1 from public.savora_households where id = p_household for update;
  if not exists (select 1 from public.savora_household_members where household_id = p_household and user_id = me and status = 'invited') then
    raise exception 'Diese Einladung gibt es nicht mehr.';
  end if;
  if exists (select 1 from public.savora_household_members where user_id = me and status = 'active') then
    raise exception 'Du bist schon in einer gemeinsamen Liste. Verlasse sie zuerst.';
  end if;
  for o in select user_id from public.savora_household_members where household_id = p_household and status = 'active' loop
    if not public.savora_is_connected(me, o.user_id) then
      raise exception 'Du bist nicht mit allen Personen dieser Liste verbunden. Verbinde dich zuerst mit allen.';
    end if;
  end loop;
  update public.savora_household_members set status = 'active', joined_at = now()
    where household_id = p_household and user_id = me;
  return public.savora_hh_state();
end $$;

create or replace function public.savora_hh_decline(p_household uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare me uuid := public.savora_need_user();
begin
  delete from public.savora_household_members where household_id = p_household and user_id = me and status = 'invited';
  return public.savora_hh_state();
end $$;

create or replace function public.savora_hh_leave() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare me uuid := public.savora_need_user(); hid uuid;
begin
  select household_id into hid from public.savora_household_members where user_id = me and status = 'active';
  if hid is not null then
    perform 1 from public.savora_households where id = hid for update;
    delete from public.savora_household_members where household_id = hid and user_id = me;   -- Ausloeser: Erbe oder Haushalt loeschen
  end if;
  return public.savora_hh_state();
end $$;

-- ---------- Eintraege schreiben ----------
-- p_rows: [{id, data, deleted, client_updated_at}], hoechstens 200. Antwort: {applied, server_time}.
create or replace function public.savora_hh_push(p_household uuid, p_rows jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare me uuid := public.savora_need_user(); cap bigint := public.savora_hh_now_ms() + 60000; r jsonb; n int := 0; rid text; del boolean; cu bigint; d jsonb;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'Ungueltige Daten.'; end if;
  if jsonb_array_length(p_rows) > 200 then raise exception 'Zu viele Eintraege auf einmal (hoechstens 200).'; end if;
  perform 1 from public.savora_households where id = p_household for update;   -- Schreiben pro Haushalt nacheinander
  if not public.savora_hh_is_member(p_household, me) then raise exception 'Kein Zugriff auf diese Liste.'; end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    rid := r->>'id';
    if rid is null or char_length(rid) not between 1 and 100 then raise exception 'Ungueltige Eintrags-ID.'; end if;
    del := coalesce((r->>'deleted')::boolean, false);
    cu := least(coalesce((r->>'client_updated_at')::bigint, 0), cap);
    d := case when del then null else r->'data' end;
    if not del and (d is null or jsonb_typeof(d) <> 'object') then raise exception 'Ungueltiger Eintrag.'; end if;
    if d is not null and octet_length(d::text) > 4000 then raise exception 'Ein Eintrag ist zu gross.'; end if;
    insert into public.savora_household_items as t (household_id, id, data, deleted, client_updated_at, server_updated_at, updated_by)
      values (p_household, rid, d, del, cu, clock_timestamp(), me)
      on conflict (household_id, id) do update
        set data = excluded.data, deleted = excluded.deleted, client_updated_at = excluded.client_updated_at,
            server_updated_at = clock_timestamp(), updated_by = me
        where excluded.client_updated_at > t.client_updated_at
           or (excluded.client_updated_at = t.client_updated_at and excluded.deleted and not t.deleted);
    if found then n := n + 1; end if;
  end loop;
  if (select count(*) from public.savora_household_items where household_id = p_household and not deleted) > 1000 then
    raise exception 'Die gemeinsame Liste ist voll (hoechstens 1000 Eintraege). Entferne zuerst erledigte Eintraege.';
  end if;
  delete from public.savora_household_items
    where household_id = p_household and deleted and server_updated_at < now() - interval '60 days';
  return jsonb_build_object('applied', n, 'server_time', clock_timestamp());
end $$;

-- ---------- Eintraege lesen ----------
-- p_since null: alle lebenden Eintraege; sonst alle Aenderungen (inkl. Grabsteine) mit server_updated_at > p_since.
-- Der Client fragt mit 5 s Ueberlappung ab (gleichzeitige Transaktionen). Antwort: {rows, server_time}.
create or replace function public.savora_hh_pull(p_household uuid, p_since timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := public.savora_need_user();
begin
  if not public.savora_hh_is_member(p_household, me) then raise exception 'Kein Zugriff auf diese Liste.'; end if;
  return jsonb_build_object(
    'server_time', clock_timestamp(),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'data', i.data, 'deleted', i.deleted,
                                          'client_updated_at', i.client_updated_at, 'server_updated_at', i.server_updated_at)
                       order by i.server_updated_at)
      from public.savora_household_items i
      where i.household_id = p_household
        and (case when p_since is null then not i.deleted else i.server_updated_at > p_since end)), '[]'::jsonb));
end $$;

-- ---------- Rechte ----------
revoke all on function public.savora_hh_is_member(uuid, uuid), public.savora_hh_now_ms(), public.savora_hh_member_gone()
  from public, anon, authenticated;
revoke all on function
  public.savora_hh_state(), public.savora_hh_invite(text), public.savora_hh_accept(uuid), public.savora_hh_decline(uuid),
  public.savora_hh_leave(), public.savora_hh_push(uuid, jsonb), public.savora_hh_pull(uuid, timestamptz)
  from public, anon;
grant execute on function
  public.savora_hh_state(), public.savora_hh_invite(text), public.savora_hh_accept(uuid), public.savora_hh_decline(uuid),
  public.savora_hh_leave(), public.savora_hh_push(uuid, jsonb), public.savora_hh_pull(uuid, timestamptz)
  to authenticated;

commit;

-- ---------- Spaeter (bewusst nicht aktiv): Realtime statt Abfragen alle 8 s ----------
-- Realtime braucht SELECT-Recht und eine Policy. Erst einschalten, wenn der Client Realtime nutzt:
-- grant execute on function public.savora_hh_is_member(uuid, uuid) to authenticated;
-- grant select on public.savora_household_items to authenticated;
-- create policy "haushalt lesen" on public.savora_household_items for select to authenticated
--   using ((select public.savora_hh_is_member(household_id, (select auth.uid()))));
-- alter publication supabase_realtime add table public.savora_household_items;
