-- Savora Paket 36: Rezepte an verbundene Profile senden.
-- Rein additiv: neue Tabellen und Funktionen, bestehende Daten (savora_records, Bilder) bleiben unberuehrt.
-- Zugriff: Die Tabellen sind per RLS fuer alle gesperrt (keine Policies). Alles laeuft ueber die
-- Funktionen unten (SECURITY DEFINER, pruefen auth.uid()). So sieht niemand fremde Daten.

create table if not exists public.savora_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null default '' check (char_length(display_name) <= 40),
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.savora_connections (
  requester uuid not null references auth.users(id) on delete cascade,
  addressee uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);
create index if not exists savora_connections_addressee_idx on public.savora_connections (addressee);

create table if not exists public.savora_shares (
  id uuid primary key default gen_random_uuid(),
  sender uuid not null references auth.users(id) on delete cascade,
  recipient uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  recipe jsonb not null check (octet_length(recipe::text) <= 300000),
  image text check (image is null or octet_length(image) <= 1800000),
  message text check (message is null or char_length(message) <= 200),
  created_at timestamptz not null default now(),
  check (sender <> recipient)
);
create index if not exists savora_shares_recipient_idx on public.savora_shares (recipient, created_at);
create index if not exists savora_shares_sender_idx on public.savora_shares (sender);

alter table public.savora_profiles enable row level security;
alter table public.savora_connections enable row level security;
alter table public.savora_shares enable row level security;
revoke all on public.savora_profiles, public.savora_connections, public.savora_shares from anon, authenticated;

-- ---------- Hilfsfunktionen (nicht oeffentlich) ----------
create or replace function public.savora_is_connected(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.savora_connections c
    where c.status = 'accepted' and ((c.requester = a and c.addressee = b) or (c.requester = b and c.addressee = a)));
$$;

create or replace function public.savora_new_invite_code() returns text
language plpgsql volatile set search_path = '' as $$
declare alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; code text; i int;
begin
  loop
    code := 'SAV-';
    for i in 1..8 loop
      code := code || substr(alphabet, 1 + floor(random() * 32)::int, 1);
      if i = 4 then code := code || '-'; end if;
    end loop;
    exit when not exists (select 1 from public.savora_profiles where invite_code = code);
  end loop;
  return code;
end $$;

create or replace function public.savora_need_user() returns uuid
language plpgsql stable set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  return auth.uid();
end $$;

-- ---------- Profil ----------
create or replace function public.savora_profile_get() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := public.savora_need_user(); p public.savora_profiles;
begin
  select * into p from public.savora_profiles where user_id = me;
  if not found then return null; end if;
  return jsonb_build_object('handle', p.handle, 'display_name', p.display_name, 'invite_code', p.invite_code);
end $$;

create or replace function public.savora_profile_set(p_handle text, p_name text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare me uuid := public.savora_need_user(); h text := lower(trim(both '@' from trim(coalesce(p_handle, '')))); n text := trim(coalesce(p_name, ''));
begin
  if h !~ '^[a-z0-9_]{3,24}$' then raise exception 'Der Profilname braucht 3 bis 24 Zeichen: Kleinbuchstaben, Zahlen oder _.'; end if;
  if char_length(n) > 40 then raise exception 'Der Anzeigename ist zu lang (höchstens 40 Zeichen).'; end if;
  begin
    insert into public.savora_profiles (user_id, handle, display_name, invite_code)
    values (me, h, n, public.savora_new_invite_code())
    on conflict (user_id) do update set handle = excluded.handle, display_name = excluded.display_name;
  exception when unique_violation then
    raise exception 'Dieser Profilname ist schon vergeben.';
  end;
  return public.savora_profile_get();
end $$;

create or replace function public.savora_invite_reset() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare me uuid := public.savora_need_user();
begin
  update public.savora_profiles set invite_code = public.savora_new_invite_code() where user_id = me;
  if not found then raise exception 'Lege zuerst dein Profil an.'; end if;
  return public.savora_profile_get();
end $$;

-- ---------- Verbindungen ----------
create or replace function public.savora_connect(p_target text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := public.savora_need_user();
  t text := trim(both '@' from trim(coalesce(p_target, '')));
  other public.savora_profiles; r_out public.savora_connections; r_in public.savora_connections; result text;
begin
  if not exists (select 1 from public.savora_profiles where user_id = me) then raise exception 'Lege zuerst dein Profil an.'; end if;
  if t = '' then raise exception 'Bitte einen Profilnamen oder Einladungscode eingeben.'; end if;
  if upper(t) like 'SAV-%' then
    select * into other from public.savora_profiles where invite_code = upper(t);
  else
    select * into other from public.savora_profiles where handle = lower(t);
  end if;
  if not found then raise exception 'Profil nicht gefunden.'; end if;
  if other.user_id = me then raise exception 'Das bist du selbst.'; end if;
  select * into r_in from public.savora_connections where requester = other.user_id and addressee = me;
  select * into r_out from public.savora_connections where requester = me and addressee = other.user_id;
  if r_in.status = 'blocked' then raise exception 'Profil nicht gefunden.'; end if;
  if r_in.status = 'accepted' or r_out.status = 'accepted' then
    result := 'connected';
  elsif r_in.status = 'pending' then
    update public.savora_connections set status = 'accepted' where requester = other.user_id and addressee = me;
    result := 'connected';
  elsif r_out.status = 'pending' then
    result := 'outgoing';
  else
    if r_out.status = 'blocked' then delete from public.savora_connections where requester = me and addressee = other.user_id; end if;
    if (select count(*) from public.savora_connections where requester = me and status = 'pending') >= 30 then
      raise exception 'Du hast schon viele offene Anfragen. Bitte warte, bis einige beantwortet sind.';
    end if;
    insert into public.savora_connections (requester, addressee, status) values (me, other.user_id, 'pending');
    result := 'outgoing';
  end if;
  return jsonb_build_object('state', result, 'handle', other.handle, 'display_name', other.display_name);
end $$;

create or replace function public.savora_connections_list() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := public.savora_need_user();
begin
  return coalesce((
    select jsonb_agg(x order by x->>'handle') from (
      select jsonb_build_object('handle', p.handle, 'display_name', p.display_name,
        'state', case
          when c.status = 'accepted' then 'connected'
          when c.status = 'pending' and c.addressee = me then 'incoming'
          when c.status = 'pending' then 'outgoing'
          else 'blocked' end) as x
      from public.savora_connections c
      join public.savora_profiles p on p.user_id = case when c.requester = me then c.addressee else c.requester end
      where (c.requester = me or c.addressee = me)
        and not (c.status = 'blocked' and c.addressee = me)
    ) s), '[]'::jsonb);
end $$;

create or replace function public.savora_respond(p_handle text, p_action text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare me uuid := public.savora_need_user(); other uuid;
begin
  select user_id into other from public.savora_profiles where handle = lower(trim(coalesce(p_handle, '')));
  if other is null then raise exception 'Profil nicht gefunden.'; end if;
  if p_action = 'accept' then
    update public.savora_connections set status = 'accepted' where requester = other and addressee = me and status = 'pending';
    if not found then raise exception 'Die Anfrage gibt es nicht mehr.'; end if;
  elsif p_action = 'decline' then
    delete from public.savora_connections where requester = other and addressee = me and status = 'pending';
  elsif p_action = 'block' then
    delete from public.savora_connections where (requester = other and addressee = me) or (requester = me and addressee = other);
    insert into public.savora_connections (requester, addressee, status) values (me, other, 'blocked');
    delete from public.savora_shares where (sender = other and recipient = me) or (sender = me and recipient = other);
  else
    raise exception 'Unbekannte Aktion.';
  end if;
end $$;

-- Verbindung beenden, eigene Anfrage zurueckziehen oder Sperre aufheben.
create or replace function public.savora_remove(p_handle text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare me uuid := public.savora_need_user(); other uuid;
begin
  select user_id into other from public.savora_profiles where handle = lower(trim(coalesce(p_handle, '')));
  if other is null then return; end if;
  delete from public.savora_connections
    where (requester = me and addressee = other)
       or (requester = other and addressee = me and status <> 'blocked');
  delete from public.savora_shares where (sender = other and recipient = me) or (sender = me and recipient = other);
end $$;

-- ---------- Rezepte senden ----------
create or replace function public.savora_send(p_handle text, p_recipe jsonb, p_image text, p_message text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := public.savora_need_user(); other uuid; new_id uuid; ttl text; msg text := nullif(trim(coalesce(p_message, '')), '');
begin
  select user_id into other from public.savora_profiles where handle = lower(trim(coalesce(p_handle, '')));
  if other is null or not public.savora_is_connected(me, other) then raise exception 'Du bist mit diesem Profil nicht verbunden.'; end if;
  if jsonb_typeof(p_recipe) <> 'object' then raise exception 'Ungültiges Rezept.'; end if;
  ttl := trim(coalesce(p_recipe->>'title', ''));
  if ttl = '' then raise exception 'Das Rezept braucht einen Titel.'; end if;
  if msg is not null and char_length(msg) > 200 then raise exception 'Die Nachricht ist zu lang (höchstens 200 Zeichen).'; end if;
  if p_image is not null and p_image !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' then raise exception 'Ungültiges Bild.'; end if;
  if (select count(*) from public.savora_shares where sender = me and recipient = other) >= 20 then
    raise exception 'Es liegen schon 20 ungeöffnete Rezepte bei diesem Profil. Bitte warte, bis sie angesehen wurden.';
  end if;
  if (select count(*) from public.savora_shares where sender = me and created_at > now() - interval '1 hour') >= 40 then
    raise exception 'Zu viele Rezepte in kurzer Zeit. Bitte in einer Stunde nochmals.';
  end if;
  insert into public.savora_shares (sender, recipient, title, recipe, image, message)
  values (me, other, left(ttl, 200), p_recipe, p_image, msg) returning id into new_id;
  return new_id;
end $$;

create or replace function public.savora_inbox() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare me uuid := public.savora_need_user();
begin
  delete from public.savora_shares where recipient = me and created_at < now() - interval '60 days';
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'from_handle', p.handle, 'from_name', p.display_name, 'title', s.title,
      'message', s.message, 'created_at', s.created_at, 'has_image', s.image is not null, 'recipe', s.recipe) order by s.created_at)
    from public.savora_shares s
    join public.savora_profiles p on p.user_id = s.sender
    where s.recipient = me and public.savora_is_connected(me, s.sender)), '[]'::jsonb);
end $$;

create or replace function public.savora_inbox_count() returns int
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := public.savora_need_user();
begin
  return (select count(*) from public.savora_shares s where s.recipient = me and public.savora_is_connected(me, s.sender))
       + (select count(*) from public.savora_connections c where c.addressee = me and c.status = 'pending');
end $$;

create or replace function public.savora_share_image(p_id uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := public.savora_need_user();
begin
  return (select s.image from public.savora_shares s where s.id = p_id and s.recipient = me);
end $$;

create or replace function public.savora_share_done(p_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare me uuid := public.savora_need_user();
begin
  delete from public.savora_shares where id = p_id and recipient = me;
end $$;

-- Nur angemeldete Konten duerfen die Funktionen aufrufen (die Hilfsfunktionen sind intern).
revoke all on function public.savora_is_connected(uuid, uuid), public.savora_new_invite_code(), public.savora_need_user() from public, anon, authenticated;
revoke all on function
  public.savora_profile_get(), public.savora_profile_set(text, text), public.savora_invite_reset(),
  public.savora_connect(text), public.savora_connections_list(), public.savora_respond(text, text), public.savora_remove(text),
  public.savora_send(text, jsonb, text, text), public.savora_inbox(), public.savora_inbox_count(),
  public.savora_share_image(uuid), public.savora_share_done(uuid)
  from public, anon;
grant execute on function
  public.savora_profile_get(), public.savora_profile_set(text, text), public.savora_invite_reset(),
  public.savora_connect(text), public.savora_connections_list(), public.savora_respond(text, text), public.savora_remove(text),
  public.savora_send(text, jsonb, text, text), public.savora_inbox(), public.savora_inbox_count(),
  public.savora_share_image(uuid), public.savora_share_done(uuid)
  to authenticated;
