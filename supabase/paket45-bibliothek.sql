-- Savora Paket 45: Oeffentliche Rezeptbibliothek.
-- Rein additiv: neue Tabellen, Funktionen, ein neuer Speicherbereich und neue Speicherregeln. Bestehende Daten
-- (savora_records, savora-images, Profile, Freunde, Sendungen) bleiben unberuehrt; nichts wird automatisch veroeffentlicht.
-- Zugriff:
--   - Alle neuen Tabellen sind per RLS fuer anon und authenticated gesperrt (keine Policies). Gelesen und geschrieben
--     wird nur ueber die Funktionen unten (SECURITY DEFINER, fester leerer search_path, eigene Pruefung von auth.uid()).
--   - Oeffentlich lesbar (auch ohne Konto) sind nur: Suche, Detail und Profil veroeffentlichter, nicht gesperrter Rezepte.
--     Antworten enthalten nur ausdruecklich erlaubte Felder (nie E-Mail, Einladungscode, Benutzername, Freunde).
--   - Moderation: Rolle steht in savora_moderators und wird nur vom Betreiber per SQL gesetzt (kein Client-Zugriff).
--   - Bilder: eigener, nicht oeffentlicher Speicherbereich savora-public. Lesen nur, solange das Bild von einer
--     veroeffentlichten Publikation oder einem oeffentlichen Profil verwendet wird (signierte Adressen, 1 Stunde).

create extension if not exists pg_trgm with schema extensions;

-- ---------- Tabellen ----------
create table if not exists public.savora_public_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  public_id text not null unique check (public_id ~ '^[a-z0-9]{12}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  bio text not null default '' check (char_length(bio) <= 160),
  avatar_path text check (avatar_path is null or char_length(avatar_path) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.savora_publications (
  id uuid primary key,
  owner uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('published', 'withdrawn', 'blocked')),
  version int not null default 1 check (version >= 1),
  recipe jsonb not null check (octet_length(recipe::text) <= 200000),
  title text not null check (char_length(title) between 1 and 200),
  search_text text not null default '' check (char_length(search_text) <= 8000),
  total_minutes int check (total_minutes is null or total_minutes between 1 and 100000),
  diet text[] not null default '{}',
  categories text[] not null default '{}',
  image_path text check (image_path is null or char_length(image_path) <= 200),
  thumb_path text check (thumb_path is null or char_length(thumb_path) <= 200),
  source_local_id text not null default '' check (char_length(source_local_id) <= 120),
  terms_version text not null,
  terms_accepted_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  blocked_at timestamptz
);
create index if not exists savora_pub_newest_idx on public.savora_publications (published_at desc, id desc) where status = 'published';
create index if not exists savora_pub_quick_idx on public.savora_publications (total_minutes, published_at desc, id desc) where status = 'published';
create index if not exists savora_pub_search_idx on public.savora_publications using gin (search_text extensions.gin_trgm_ops) where status = 'published';
create index if not exists savora_pub_diet_idx on public.savora_publications using gin (diet) where status = 'published';
create index if not exists savora_pub_cat_idx on public.savora_publications using gin (categories) where status = 'published';
create index if not exists savora_pub_owner_idx on public.savora_publications (owner, published_at desc);
create index if not exists savora_pub_image_idx on public.savora_publications (image_path) where image_path is not null;
create index if not exists savora_pub_thumb_idx on public.savora_publications (thumb_path) where thumb_path is not null;
-- Ein eigenes Rezept kann nur einmal veroeffentlicht sein (gleichzeitige Anfragen erzeugen keine Dublette)
create unique index if not exists savora_pub_source_uidx on public.savora_publications (owner, source_local_id) where source_local_id <> '';

create table if not exists public.savora_publication_versions (
  publication_id uuid not null references public.savora_publications(id) on delete cascade,
  version int not null,
  owner uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null unique,
  recipe jsonb not null,
  image_path text,
  thumb_path text,
  created_at timestamptz not null default now(),
  primary key (publication_id, version)
);
create index if not exists savora_pubver_owner_idx on public.savora_publication_versions (owner, created_at);

create table if not exists public.savora_lib_reports (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.savora_publications(id) on delete cascade,
  reporter uuid references auth.users(id) on delete set null,
  reason text not null check (reason in ('spam', 'foreign', 'problematic', 'other')),
  comment text check (comment is null or char_length(comment) <= 500),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null
);
create index if not exists savora_rep_pub_idx on public.savora_lib_reports (publication_id, status);
create index if not exists savora_rep_reporter_idx on public.savora_lib_reports (reporter, created_at);

create table if not exists public.savora_moderators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.savora_lib_bans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create table if not exists public.savora_lib_mod_log (
  id bigint generated always as identity primary key,
  moderator uuid references auth.users(id) on delete set null,
  action text not null,
  publication_id uuid,
  report_id uuid,
  target_user uuid,
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create table if not exists public.savora_lib_limits (
  key text primary key,
  value int not null check (value >= 0)
);
insert into public.savora_lib_limits (key, value) values
  ('publish_per_day', 30), ('reports_per_day', 20), ('uploads_per_day', 80), ('page_max', 48)
on conflict (key) do nothing;
create table if not exists public.savora_lib_terms (
  version text primary key,
  created_at timestamptz not null default now()
);
insert into public.savora_lib_terms (version) values ('bibliothek-2026-10-15') on conflict (version) do nothing;
create table if not exists public.savora_lib_terms_accept (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  version text not null references public.savora_lib_terms(version),
  publication_id uuid,
  publication_version int,
  accepted_at timestamptz not null default now()
);
create index if not exists savora_terms_user_idx on public.savora_lib_terms_accept (user_id);

alter table public.savora_public_profiles enable row level security;
alter table public.savora_publications enable row level security;
alter table public.savora_publication_versions enable row level security;
alter table public.savora_lib_reports enable row level security;
alter table public.savora_moderators enable row level security;
alter table public.savora_lib_bans enable row level security;
alter table public.savora_lib_mod_log enable row level security;
alter table public.savora_lib_limits enable row level security;
alter table public.savora_lib_terms enable row level security;
alter table public.savora_lib_terms_accept enable row level security;
revoke all on public.savora_public_profiles, public.savora_publications, public.savora_publication_versions,
  public.savora_lib_reports, public.savora_moderators, public.savora_lib_bans, public.savora_lib_mod_log,
  public.savora_lib_limits, public.savora_lib_terms, public.savora_lib_terms_accept from anon, authenticated;

-- ---------- Interne Hilfsfunktionen ----------
create or replace function public.savora_lib_limit(p_key text) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce((select value from public.savora_lib_limits where key = p_key),
    case p_key when 'publish_per_day' then 30 when 'reports_per_day' then 20 when 'uploads_per_day' then 80 when 'page_max' then 48 else 0 end);
$$;

-- Suchtext: klein, Akzente und Umlaute auf Grundbuchstaben, ss fuer scharfes s, nur Buchstaben und Ziffern (gleich wie libNorm im Client)
create or replace function public.savora_lib_norm(t text) returns text
language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(translate(replace(lower(coalesce(t, '')), 'ß', 'ss'),
    'äöüàáâãåāèéêëēìíîïòóôõøōùúûūñçÿ', 'aouaaaaaaeeeeeiiiioooooouuuuncy'), '[^a-z0-9]+', ' ', 'g'));
$$;

create or replace function public.savora_lib_txt(v jsonb, n int) returns text
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(v) = 'string' then left(btrim(v #>> '{}'), n) else '' end;
$$;
create or replace function public.savora_lib_int(v jsonb, lo int, hi int) returns int
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric between lo and hi then round((v #>> '{}')::numeric)::int end;
$$;

-- Oeffentliche Rezeptdaten strikt neu aufbauen. Unbekannte Felder fallen weg, Laengen und Listen sind begrenzt.
create or replace function public.savora_lib_clean(j jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  ttl text; e jsonb; ings jsonb := '[]'::jsonb; steps jsonb := '[]'::jsonb; nm text; amt jsonb; grp text; txt text;
  n_ing int := 0; n_real int := 0; n_step int := 0; srv int; url text; src jsonb;
begin
  if j is null or jsonb_typeof(j) <> 'object' then raise exception 'Ungültiges Rezept.'; end if;
  if octet_length(j::text) > 200000 then raise exception 'Das Rezept ist zu gross.'; end if;
  ttl := public.savora_lib_txt(j->'title', 200);
  if ttl = '' then raise exception 'Das Rezept braucht einen Titel.'; end if;
  srv := public.savora_lib_int(j->'servings', 1, 10000);
  if srv is null then raise exception 'Gib an, wie viel das Rezept ergibt (Portionen oder Stück).'; end if;
  if jsonb_typeof(j->'ingredients') = 'array' then
    if jsonb_array_length(j->'ingredients') > 300 then raise exception 'Zu viele Zutaten (höchstens 300).'; end if;
    for e in select x from jsonb_array_elements(j->'ingredients') x loop
      if jsonb_typeof(e) <> 'object' then continue; end if;
      nm := public.savora_lib_txt(e->'name', 300);
      if nm = '' then continue; end if;
      if jsonb_typeof(e->'amount') = 'number' and (e->>'amount')::numeric between 0 and 1000000 then amt := e->'amount';
      else amt := to_jsonb(public.savora_lib_txt(e->'amount', 40)); end if;
      grp := public.savora_lib_txt(e->'group', 100);
      ings := ings || jsonb_build_array(jsonb_build_object('amount', amt, 'unit', public.savora_lib_txt(e->'unit', 40), 'name', nm)
        || case when grp <> '' then jsonb_build_object('group', grp) else '{}'::jsonb end
        || case when e->'isGroupHeader' = 'true'::jsonb then '{"isGroupHeader": true}'::jsonb else '{}'::jsonb end);
      n_ing := n_ing + 1;
      if e->'isGroupHeader' is distinct from 'true'::jsonb then n_real := n_real + 1; end if;   -- fehlendes Feld = echte Zutat (nicht NULL-Logik)
    end loop;
  end if;
  if n_real = 0 then raise exception 'Füge mindestens eine Zutat hinzu.'; end if;
  if jsonb_typeof(j->'steps') = 'array' then
    if jsonb_array_length(j->'steps') > 200 then raise exception 'Zu viele Schritte (höchstens 200).'; end if;
    for e in select x from jsonb_array_elements(j->'steps') x loop
      txt := case when jsonb_typeof(e) = 'object' then public.savora_lib_txt(e->'text', 4000) else public.savora_lib_txt(e, 4000) end;
      if txt = '' then continue; end if;
      steps := steps || jsonb_build_array(jsonb_build_object('text', txt));
      n_step := n_step + 1;
    end loop;
  end if;
  if n_step = 0 then raise exception 'Füge mindestens einen Zubereitungsschritt hinzu.'; end if;
  src := case when jsonb_typeof(j->'source') = 'object' then j->'source' else '{}'::jsonb end;
  url := public.savora_lib_txt(src->'url', 500);
  if url !~ '^https?://[^[:space:]"''<>\\`]+$' then url := ''; end if;
  return jsonb_build_object(
    'v', 1,
    'title', ttl,
    'servings', srv,
    'servingMode', case when j->>'servingMode' = 'pieces' then 'pieces' else 'portions' end,
    'yieldLabel', case when j->>'servingMode' = 'pieces' then public.savora_lib_txt(j->'yieldLabel', 40) else '' end,
    'timeMinutes', public.savora_lib_int(j->'timeMinutes', 1, 100000),
    'prepMinutes', public.savora_lib_int(j->'prepMinutes', 1, 100000),
    'cookMinutes', public.savora_lib_int(j->'cookMinutes', 1, 100000),
    'restMinutes', public.savora_lib_int(j->'restMinutes', 1, 100000),
    'difficulty', public.savora_lib_txt(j->'difficulty', 30),
    'diet', coalesce((select jsonb_agg(distinct x) from jsonb_array_elements_text(case when jsonb_typeof(j->'diet') = 'array' then j->'diet' else '[]'::jsonb end) x
                      where x in ('vegan', 'vegetarisch', 'fleisch', 'fisch')), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(x) from (select distinct x from jsonb_array_elements_text(case when jsonb_typeof(j->'categories') = 'array' then j->'categories' else '[]'::jsonb end) x
                      where x ~ '^[a-z0-9-]{1,30}$' limit 12) s), '[]'::jsonb),
    'ingredients', ings,
    'steps', steps,
    'tips', public.savora_lib_txt(j->'tips', 2000),
    'source', jsonb_build_object('url', url, 'text', case when url = '' then public.savora_lib_txt(src->'text', 200) else '' end)
  );
end $$;

create or replace function public.savora_lib_card(p public.savora_publications, pr public.savora_public_profiles) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', p.id, 'title', p.title, 'total_minutes', p.total_minutes, 'version', p.version,
    'image_path', p.image_path, 'thumb_path', p.thumb_path, 'published_at', p.published_at,
    'author', jsonb_build_object('public_id', pr.public_id, 'display_name', pr.display_name));
$$;

-- ---------- Oeffentlich lesen (anon und angemeldet) ----------
create or replace function public.savora_lib_search(p_query text default '', p_filters jsonb default '{}'::jsonb, p_sort text default 'newest', p_cursor jsonb default null, p_limit int default 24)
returns jsonb language plpgsql stable security definer set search_path = '' set statement_timeout = '5s' as $$
declare
  f jsonb := case when jsonb_typeof(p_filters) = 'object' then p_filters else '{}'::jsonb end;
  lim int := least(greatest(coalesce(p_limit, 24), 1), public.savora_lib_limit('page_max'));
  pats text[]; quick boolean := coalesce(f->'quick' = 'true'::jsonb, false); veg boolean := coalesce(f->'veg' = 'true'::jsonb, false);
  maxm int := public.savora_lib_int(f->'max_minutes', 1, 100000);
  diets text[]; meals text[]; dishes text[];
  sort text := case when p_sort = 'quickest' then 'quickest' else 'newest' end;
  c jsonb := case when jsonb_typeof(p_cursor) = 'object' then p_cursor else null end;
  cur_t timestamptz; cur_id uuid; cur_m int; has_m boolean := false;
  items jsonb; total int; last jsonb; n int;
begin
  pats := array(select '%' || w || '%' from regexp_split_to_table(public.savora_lib_norm(left(coalesce(p_query, ''), 100)), ' ') w where length(w) > 0 limit 6);
  diets := array(select distinct x from jsonb_array_elements_text(case when jsonb_typeof(f->'diet') = 'array' then f->'diet' else '[]'::jsonb end) x where x in ('vegan', 'vegetarisch', 'fleisch', 'fisch'));
  meals := array(select distinct x from jsonb_array_elements_text(case when jsonb_typeof(f->'categories') = 'array' then f->'categories' else '[]'::jsonb end) x
                 where x in ('breakfast', 'brunch', 'lunch', 'dinner', 'snack', 'dessert') limit 30);
  dishes := array(select distinct x from jsonb_array_elements_text(case when jsonb_typeof(f->'categories') = 'array' then f->'categories' else '[]'::jsonb end) x
                 where x ~ '^[a-z0-9-]{1,30}$' and x not in ('breakfast', 'brunch', 'lunch', 'dinner', 'snack', 'dessert') limit 30);
  if c is not null then
    begin
      cur_t := (c->>'t')::timestamptz; cur_id := (c->>'id')::uuid;
      has_m := c ? 'm' and jsonb_typeof(c->'m') = 'number'; cur_m := case when has_m then (c->>'m')::int end;
    exception when others then raise exception 'Ungültige Seitenangabe.';
    end;
    if cur_t is null or cur_id is null then raise exception 'Ungültige Seitenangabe.'; end if;
  end if;

  with base as (
    select p, pr from public.savora_publications p join public.savora_public_profiles pr on pr.user_id = p.owner
    where p.status = 'published'
      and (cardinality(pats) = 0 or p.search_text like all (pats))
      and (not quick or (p.total_minutes is not null and p.total_minutes <= 30))
      and (maxm is null or (p.total_minutes is not null and p.total_minutes <= maxm))
      and (not veg or p.diet && array['vegetarisch', 'vegan'])
      and (cardinality(diets) = 0 or p.diet && diets)
      and (cardinality(meals) = 0 or p.categories && meals)
      and (cardinality(dishes) = 0 or p.categories && dishes)
  ), page as (
    select b.p, b.pr from base b
    where c is null
       or (sort = 'newest' and ((b.p).published_at, (b.p).id) < (cur_t, cur_id))
       or (sort = 'quickest' and (
            (has_m and ((b.p).total_minutes > cur_m or (b.p).total_minutes is null or ((b.p).total_minutes = cur_m and ((b.p).published_at, (b.p).id) < (cur_t, cur_id))))
         or (not has_m and (b.p).total_minutes is null and ((b.p).published_at, (b.p).id) < (cur_t, cur_id))))
    order by case when sort = 'quickest' then (b.p).total_minutes end asc nulls last, (b.p).published_at desc, (b.p).id desc
    limit lim + 1
  )
  select coalesce(jsonb_agg(public.savora_lib_card(pg.p, pg.pr) || jsonb_build_object('_m', (pg.p).total_minutes)
           order by case when sort = 'quickest' then (pg.p).total_minutes end asc nulls last, (pg.p).published_at desc, (pg.p).id desc), '[]'::jsonb)
    into items from page pg;

  select count(*) into total from (
    select 1 from public.savora_publications p join public.savora_public_profiles pr on pr.user_id = p.owner
    where p.status = 'published'
      and (cardinality(pats) = 0 or p.search_text like all (pats))
      and (not quick or (p.total_minutes is not null and p.total_minutes <= 30))
      and (maxm is null or (p.total_minutes is not null and p.total_minutes <= maxm))
      and (not veg or p.diet && array['vegetarisch', 'vegan'])
      and (cardinality(diets) = 0 or p.diet && diets)
      and (cardinality(meals) = 0 or p.categories && meals)
      and (cardinality(dishes) = 0 or p.categories && dishes)
    limit 1001) s;

  n := jsonb_array_length(items);
  if n > lim then
    items := items - lim;   -- das zusaetzliche Element zeigt nur an, dass es weitergeht
    last := items -> (lim - 1);
    return jsonb_build_object('items', (select coalesce(jsonb_agg(x - '_m' order by o), '[]'::jsonb) from jsonb_array_elements(items) with ordinality t(x, o)),
      'next_cursor', jsonb_build_object('t', last->'published_at', 'id', last->'id', 'm', last->'_m'),
      'total', least(total, 1000), 'total_capped', total > 1000);
  end if;
  return jsonb_build_object('items', (select coalesce(jsonb_agg(x - '_m' order by o), '[]'::jsonb) from jsonb_array_elements(items) with ordinality t(x, o)),
    'next_cursor', null, 'total', least(total, 1000), 'total_capped', total > 1000);
end $$;

create or replace function public.savora_lib_get(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', p.id, 'version', p.version, 'recipe', p.recipe,
    'image_path', p.image_path, 'thumb_path', p.thumb_path, 'published_at', p.published_at, 'updated_at', p.updated_at,
    'author', jsonb_build_object('public_id', pr.public_id, 'display_name', pr.display_name, 'bio', pr.bio, 'avatar_path', pr.avatar_path))
  from public.savora_publications p join public.savora_public_profiles pr on pr.user_id = p.owner
  where p.id = p_id and p.status = 'published';
$$;

create or replace function public.savora_lib_profile(p_public_id text, p_cursor jsonb default null) returns jsonb
language plpgsql stable security definer set search_path = '' set statement_timeout = '5s' as $$
declare pr public.savora_public_profiles; items jsonb; n int; lim int := 24; cur_t timestamptz; cur_id uuid; last jsonb;
begin
  select * into pr from public.savora_public_profiles where public_id = lower(coalesce(p_public_id, ''));
  if not found then return null; end if;
  if jsonb_typeof(p_cursor) = 'object' then
    begin cur_t := (p_cursor->>'t')::timestamptz; cur_id := (p_cursor->>'id')::uuid;
    exception when others then raise exception 'Ungültige Seitenangabe.'; end;
  end if;
  select coalesce(jsonb_agg(public.savora_lib_card(s.p, pr) order by (s.p).published_at desc, (s.p).id desc), '[]'::jsonb) into items from (
    select p from public.savora_publications p
    where p.owner = pr.user_id and p.status = 'published' and (cur_t is null or (p.published_at, p.id) < (cur_t, cur_id))
    order by p.published_at desc, p.id desc limit lim + 1) s;
  n := jsonb_array_length(items);
  if n > lim then items := items - lim; last := items -> (lim - 1); end if;
  return jsonb_build_object('profile', jsonb_build_object('public_id', pr.public_id, 'display_name', pr.display_name, 'bio', pr.bio, 'avatar_path', pr.avatar_path),
    'items', items, 'next_cursor', case when n > lim then jsonb_build_object('t', last->'published_at', 'id', last->'id') end);
end $$;

-- ---------- Oeffentliches Profil (angemeldet) ----------
create or replace function public.savora_pub_profile_get() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := public.savora_need_user(); pr public.savora_public_profiles;
begin
  select * into pr from public.savora_public_profiles where user_id = me;
  if not found then return null; end if;
  return jsonb_build_object('public_id', pr.public_id, 'display_name', pr.display_name, 'bio', pr.bio, 'avatar_path', pr.avatar_path,
    'publishing_blocked', exists (select 1 from public.savora_lib_bans b where b.user_id = me));
end $$;

create or replace function public.savora_pub_profile_set(p_name text, p_bio text, p_avatar_path text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare me uuid := public.savora_need_user(); n text := btrim(coalesce(p_name, '')); b text := btrim(coalesce(p_bio, '')); a text := nullif(btrim(coalesce(p_avatar_path, '')), ''); pid text; tries int := 0;
begin
  if n = '' then raise exception 'Gib einen Anzeigenamen ein.'; end if;
  if char_length(n) > 40 then raise exception 'Der Anzeigename ist zu lang (höchstens 40 Zeichen).'; end if;
  if char_length(b) > 160 then raise exception 'Der Kurztext ist zu lang (höchstens 160 Zeichen).'; end if;
  if a is not null then
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

create or replace function public.savora_pub_profile_delete() returns void
language plpgsql volatile security definer set search_path = '' as $$
declare me uuid := public.savora_need_user();
begin
  if exists (select 1 from public.savora_publications where owner = me and status = 'published') then
    raise exception 'Ziehe zuerst deine Veröffentlichungen zurück.';
  end if;
  delete from public.savora_public_profiles where user_id = me;
end $$;

-- ---------- Veroeffentlichen und verwalten (angemeldet) ----------
create or replace function public.savora_pub_publish(p_request_id uuid, p_publication_id uuid, p_expected_version int, p_recipe jsonb,
  p_image_path text, p_thumb_path text, p_source_local_id text, p_terms_version text, p_terms_accepted boolean) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := public.savora_need_user(); r jsonb; prev public.savora_publications; v public.savora_publication_versions;
  pubid uuid := coalesce(p_publication_id, gen_random_uuid()); prefix text; srcid text := left(btrim(coalesce(p_source_local_id, '')), 120); new_version int; stext text;
begin
  -- Ohne ID (Vertrag: p_publication_id darf null sein) legt der Server eine neue an; Bilder brauchen dann eine ID im Pfad
  if p_request_id is null then raise exception 'Ungültige Anfrage.'; end if;
  -- Wiederholte Anfrage (Doppeltippen, Netzunterbruch): gleiche Antwort, nichts doppelt
  select * into v from public.savora_publication_versions where request_id = p_request_id;
  if found then
    if v.owner <> me then raise exception 'Ungültige Anfrage.'; end if;
    return jsonb_build_object('id', v.publication_id, 'version', v.version, 'status', (select status from public.savora_publications where id = v.publication_id), 'repeated', true);
  end if;
  if not exists (select 1 from auth.users u where u.id = me and u.email_confirmed_at is not null) then raise exception 'Bitte bestätige zuerst deine E-Mail-Adresse.'; end if;
  if exists (select 1 from public.savora_lib_bans b where b.user_id = me) then raise exception 'Dein Konto kann zurzeit keine Rezepte veröffentlichen.'; end if;
  if not exists (select 1 from public.savora_public_profiles where user_id = me) then raise exception 'Richte zuerst dein öffentliches Profil ein.'; end if;
  if p_terms_accepted is distinct from true then raise exception 'Bitte bestätige, dass du die Rechte an Text und Fotos hast.'; end if;
  if not exists (select 1 from public.savora_lib_terms where version = p_terms_version) then raise exception 'Die Bedingungen wurden aktualisiert. Bitte lade die Seite neu.'; end if;
  if (select count(*) from public.savora_publication_versions where owner = me and created_at > now() - interval '1 day') >= public.savora_lib_limit('publish_per_day') then
    raise exception 'Du hast heute schon viele Veröffentlichungen gemacht. Bitte versuche es morgen wieder.';
  end if;
  r := public.savora_lib_clean(p_recipe);
  prefix := me::text || '/' || pubid::text || '/';
  if (p_image_path is null) <> (p_thumb_path is null) then raise exception 'Ungültiges Bild.'; end if;
  if p_image_path is not null then
    if p_image_path !~ ('^' || prefix || 'full-[0-9a-f]{8,32}\.(jpg|webp)$') or p_thumb_path !~ ('^' || prefix || 'thumb-[0-9a-f]{8,32}\.(jpg|webp)$') then raise exception 'Ungültiges Bild.'; end if;
    if (select count(*) from storage.objects o where o.bucket_id = 'savora-public' and o.name in (p_image_path, p_thumb_path)) <> 2 then
      raise exception 'Das Foto wurde nicht vollständig hochgeladen. Bitte nochmals versuchen.';
    end if;
  end if;
  stext := left(public.savora_lib_norm(r->>'title' || ' ' || coalesce((select string_agg(x->>'name', ' ') from jsonb_array_elements(r->'ingredients') x), '')), 8000);

  begin
    select * into prev from public.savora_publications where id = pubid for update;
    if found then
      if prev.owner <> me then raise exception 'Diese Veröffentlichung gehört nicht dir.'; end if;
      if prev.status = 'blocked' then raise exception 'Diese Veröffentlichung wurde von der Moderation ausgeblendet und kann nicht erneut veröffentlicht werden.'; end if;
      if p_expected_version is distinct from prev.version then
        raise exception 'KONFLIKT: Diese Veröffentlichung wurde inzwischen geändert. Lade sie neu und prüfe die Änderungen.';
      end if;
      new_version := prev.version + 1;
      update public.savora_publications set status = 'published', version = new_version, recipe = r, title = r->>'title', search_text = stext,
        total_minutes = (r->>'timeMinutes')::int, diet = array(select jsonb_array_elements_text(r->'diet')), categories = array(select jsonb_array_elements_text(r->'categories')),
        image_path = p_image_path, thumb_path = p_thumb_path, source_local_id = case when srcid <> '' then srcid else source_local_id end,
        terms_version = p_terms_version, terms_accepted_at = now(), updated_at = now(), withdrawn_at = null
      where id = pubid;
    else
      if p_expected_version is not null then raise exception 'KONFLIKT: Diese Veröffentlichung gibt es nicht mehr. Lade die Seite neu.'; end if;
      if srcid <> '' and exists (select 1 from public.savora_publications where owner = me and source_local_id = srcid and status = 'blocked') then
        raise exception 'Dieses Rezept wurde von der Moderation ausgeblendet und kann nicht erneut veröffentlicht werden.';
      end if;
      if srcid <> '' and exists (select 1 from public.savora_publications where owner = me and source_local_id = srcid) then
        raise exception 'KONFLIKT: Dieses Rezept ist schon veröffentlicht. Aktualisiere die bestehende Veröffentlichung.';
      end if;
      new_version := 1;
      insert into public.savora_publications (id, owner, status, version, recipe, title, search_text, total_minutes, diet, categories, image_path, thumb_path, source_local_id, terms_version, terms_accepted_at)
      values (pubid, me, 'published', 1, r, r->>'title', stext, (r->>'timeMinutes')::int,
        array(select jsonb_array_elements_text(r->'diet')), array(select jsonb_array_elements_text(r->'categories')), p_image_path, p_thumb_path, srcid, p_terms_version, now());
    end if;
    insert into public.savora_publication_versions (publication_id, version, owner, request_id, recipe, image_path, thumb_path)
    values (pubid, new_version, me, p_request_id, r, p_image_path, p_thumb_path);
  exception when unique_violation then
    -- Gleichzeitige Anfrage: dieselbe Request-ID gilt als Wiederholung, sonst Konflikt
    select * into v from public.savora_publication_versions where request_id = p_request_id;
    if found and v.owner = me then
      return jsonb_build_object('id', v.publication_id, 'version', v.version, 'status', 'published', 'repeated', true);
    end if;
    raise exception 'KONFLIKT: Dieses Rezept wird gerade an anderer Stelle veröffentlicht. Lade die Seite neu.';
  end;
  insert into public.savora_lib_terms_accept (user_id, version, publication_id, publication_version) values (me, p_terms_version, pubid, new_version);
  return jsonb_build_object('id', pubid, 'version', new_version, 'status', 'published');
end $$;

create or replace function public.savora_pub_withdraw(p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare me uuid := public.savora_need_user(); p public.savora_publications;
begin
  select * into p from public.savora_publications where id = p_id and owner = me for update;
  if not found then raise exception 'Diese Veröffentlichung wurde nicht gefunden.'; end if;
  if p.status = 'blocked' then raise exception 'Diese Veröffentlichung ist von der Moderation ausgeblendet.'; end if;
  if p.status = 'published' then
    update public.savora_publications set status = 'withdrawn', withdrawn_at = now(), updated_at = now() where id = p_id;
  end if;
  return jsonb_build_object('id', p_id, 'status', 'withdrawn');
end $$;

-- Konto loeschen, Schritt 1: alle eigenen Veroeffentlichungen zurueckziehen und das Profilbild freigeben (Bilder sind danach
-- nicht mehr lesbar und koennen vom Eigentuemer geloescht werden). savora_delete_account entfernt danach alles per Kaskade.
create or replace function public.savora_pub_withdraw_all() returns void
language plpgsql volatile security definer set search_path = '' as $$
declare me uuid := public.savora_need_user();
begin
  update public.savora_publications set status = 'withdrawn', withdrawn_at = now(), updated_at = now() where owner = me and status = 'published';
  update public.savora_public_profiles set avatar_path = null, updated_at = now() where user_id = me;
end $$;

create or replace function public.savora_pub_mine() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'status', p.status, 'version', p.version, 'title', p.title,
    'thumb_path', p.thumb_path, 'source_local_id', p.source_local_id, 'published_at', p.published_at, 'updated_at', p.updated_at,
    'withdrawn_at', p.withdrawn_at, 'blocked', p.status = 'blocked') order by p.updated_at desc), '[]'::jsonb)
  from public.savora_publications p where p.owner = public.savora_need_user();
$$;

-- ---------- Melden (angemeldet; der Autor erfaehrt nie, wer gemeldet hat) ----------
create or replace function public.savora_lib_report(p_id uuid, p_reason text, p_comment text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare me uuid := public.savora_need_user(); c text := nullif(btrim(coalesce(p_comment, '')), ''); own uuid;
begin
  if p_reason is null or p_reason not in ('spam', 'foreign', 'problematic', 'other') then raise exception 'Bitte wähle einen Grund.'; end if;
  if c is not null and char_length(c) > 500 then raise exception 'Der Kommentar ist zu lang (höchstens 500 Zeichen).'; end if;
  select owner into own from public.savora_publications where id = p_id and status = 'published';
  if own is null then raise exception 'Dieses Rezept ist nicht mehr öffentlich verfügbar.'; end if;
  if own = me then raise exception 'Du kannst dein eigenes Rezept nicht melden.'; end if;
  if exists (select 1 from public.savora_lib_reports where publication_id = p_id and reporter = me and status = 'open') then
    return jsonb_build_object('ok', true, 'repeated', true);
  end if;
  if (select count(*) from public.savora_lib_reports where reporter = me and created_at > now() - interval '1 day') >= public.savora_lib_limit('reports_per_day') then
    raise exception 'Du hast heute schon viele Meldungen gesendet. Bitte versuche es morgen wieder.';
  end if;
  insert into public.savora_lib_reports (publication_id, reporter, reason, comment) values (p_id, me, p_reason, c);
  return jsonb_build_object('ok', true);
end $$;

-- ---------- Moderation (Rolle nur per SQL durch den Betreiber) ----------
create or replace function public.savora_mod_need() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := public.savora_need_user();
begin
  if not exists (select 1 from public.savora_moderators where user_id = me) then raise exception 'Keine Berechtigung.'; end if;
  return me;
end $$;

create or replace function public.savora_mod_is() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.savora_moderators where user_id = auth.uid());
$$;

create or replace function public.savora_mod_reports(p_status text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := public.savora_mod_need();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('report_id', r.id, 'publication_id', r.publication_id, 'reason', r.reason, 'comment', r.comment,
      'created_at', r.created_at, 'status', r.status, 'pub_title', p.title, 'pub_status', p.status, 'author_public_id', pr.public_id,
      'author_name', pr.display_name, 'author_banned', exists (select 1 from public.savora_lib_bans b where b.user_id = p.owner),
      'open_reports', (select count(*) from public.savora_lib_reports x where x.publication_id = r.publication_id and x.status = 'open'))
      order by r.created_at desc)
    from (select * from public.savora_lib_reports x where (p_status = 'all' or x.status = coalesce(p_status, 'open'))
          order by x.created_at desc limit 500) r   -- hoechstens 500 Meldungen pro Abruf
    join public.savora_publications p on p.id = r.publication_id
    left join public.savora_public_profiles pr on pr.user_id = p.owner), '[]'::jsonb);
end $$;

create or replace function public.savora_mod_get(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := public.savora_mod_need();
begin
  return (select jsonb_build_object('id', p.id, 'version', p.version, 'status', p.status, 'recipe', p.recipe,
      'image_path', p.image_path, 'thumb_path', p.thumb_path, 'published_at', p.published_at, 'updated_at', p.updated_at,
      'author', jsonb_build_object('public_id', pr.public_id, 'display_name', pr.display_name, 'bio', pr.bio, 'avatar_path', pr.avatar_path))
    from public.savora_publications p left join public.savora_public_profiles pr on pr.user_id = p.owner where p.id = p_id);
end $$;

create or replace function public.savora_mod_action(p_publication_id uuid, p_action text, p_note text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare me uuid := public.savora_mod_need(); p public.savora_publications; nst text;
begin
  select * into p from public.savora_publications where id = p_publication_id for update;
  if not found then raise exception 'Diese Veröffentlichung wurde nicht gefunden.'; end if;
  if p_action = 'hide' then
    update public.savora_publications set status = 'blocked', blocked_at = now(), updated_at = now() where id = p.id; nst := 'blocked';
  elsif p_action = 'restore' then
    if p.status <> 'blocked' then raise exception 'Diese Veröffentlichung ist nicht ausgeblendet.'; end if;
    update public.savora_publications set status = 'published', blocked_at = null, updated_at = now() where id = p.id; nst := 'published';
  else raise exception 'Unbekannte Aktion.'; end if;
  insert into public.savora_lib_mod_log (moderator, action, publication_id, target_user, note) values (me, p_action, p.id, p.owner, left(nullif(btrim(coalesce(p_note, '')), ''), 500));
  return jsonb_build_object('status', nst);
end $$;

create or replace function public.savora_mod_close_report(p_report_id uuid, p_note text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare me uuid := public.savora_mod_need(); pid uuid;
begin
  update public.savora_lib_reports set status = 'closed', closed_at = now(), closed_by = me where id = p_report_id and status = 'open' returning publication_id into pid;
  if pid is null then raise exception 'Diese Meldung ist schon abgeschlossen.'; end if;
  insert into public.savora_lib_mod_log (moderator, action, publication_id, report_id, note) values (me, 'close_report', pid, p_report_id, left(nullif(btrim(coalesce(p_note, '')), ''), 500));
end $$;

create or replace function public.savora_mod_ban(p_publication_id uuid, p_banned boolean, p_note text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare me uuid := public.savora_mod_need(); target uuid;
begin
  select owner into target from public.savora_publications where id = p_publication_id;
  if target is null then raise exception 'Diese Veröffentlichung wurde nicht gefunden.'; end if;
  if p_banned then
    insert into public.savora_lib_bans (user_id, reason, created_by) values (target, left(nullif(btrim(coalesce(p_note, '')), ''), 500), me) on conflict (user_id) do nothing;
  else
    delete from public.savora_lib_bans where user_id = target;
  end if;
  insert into public.savora_lib_mod_log (moderator, action, publication_id, target_user, note) values (me, case when p_banned then 'ban' else 'unban' end, p_publication_id, target, left(nullif(btrim(coalesce(p_note, '')), ''), 500));
end $$;

-- ---------- Speicher: Bereich savora-public und Regeln ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('savora-public', 'savora-public', false, 3145728, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Ein Objekt ist oeffentlich lesbar, solange eine veroeffentlichte Publikation oder ein oeffentliches Profil es verwendet.
create or replace function public.savora_lib_object_public(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.savora_publications p where p.status = 'published' and (p.image_path = p_name or p.thumb_path = p_name))
      or exists (select 1 from public.savora_public_profiles pr where pr.avatar_path = p_name);
$$;
-- Wird das Objekt noch gebraucht (veroeffentlicht, gesperrt zur Pruefung, Profilbild)? Dann darf es nicht geloescht werden.
create or replace function public.savora_lib_object_in_use(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.savora_publications p where p.status in ('published', 'blocked') and (p.image_path = p_name or p.thumb_path = p_name))
      or exists (select 1 from public.savora_public_profiles pr where pr.avatar_path = p_name);
$$;
-- Hochladen: eigener Ordner, feste Namensform, nicht gesperrt, Tageslimit, Publikation (falls vorhanden) gehoert einem selbst.
create or replace function public.savora_lib_can_upload(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := auth.uid(); pid uuid; m text[];
begin
  if me is null then return false; end if;
  if exists (select 1 from public.savora_lib_bans b where b.user_id = me) then return false; end if;
  if (select count(*) from storage.objects o where o.bucket_id = 'savora-public' and o.owner_id = me::text and o.created_at > now() - interval '1 day') >= public.savora_lib_limit('uploads_per_day') then return false; end if;
  if p_name ~ ('^' || me::text || '/avatar-[0-9a-f]{8,32}\.(jpg|webp)$') then return true; end if;
  m := regexp_match(p_name, '^' || me::text || '/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/(full|thumb)-[0-9a-f]{8,32}\.(jpg|webp)$');
  if m is null then return false; end if;
  pid := m[1]::uuid;
  return not exists (select 1 from public.savora_publications p where p.id = pid and (p.owner <> me or p.status = 'blocked'));
end $$;

drop policy if exists "savora public lesen" on storage.objects;
create policy "savora public lesen" on storage.objects for select to anon, authenticated
  using (bucket_id = 'savora-public' and (
    ((select auth.uid()) is not null and (storage.foldername(name))[1] = (select auth.uid())::text)
    or public.savora_lib_object_public(name)));
drop policy if exists "savora public anlegen" on storage.objects;
create policy "savora public anlegen" on storage.objects for insert to authenticated
  with check (bucket_id = 'savora-public' and (storage.foldername(name))[1] = (select auth.uid())::text and public.savora_lib_can_upload(name));
drop policy if exists "savora public loeschen" on storage.objects;
create policy "savora public loeschen" on storage.objects for delete to authenticated
  using (bucket_id = 'savora-public' and (storage.foldername(name))[1] = (select auth.uid())::text and not public.savora_lib_object_in_use(name));
-- Kein Aendern (kein Ueberschreiben): neue Fassungen bekommen neue Dateinamen, die alte bleibt bis zum Umschalten gueltig.

-- ---------- Rechte ----------
revoke all on function
  public.savora_lib_limit(text), public.savora_lib_norm(text), public.savora_lib_txt(jsonb, int), public.savora_lib_int(jsonb, int, int),
  public.savora_lib_clean(jsonb), public.savora_lib_card(public.savora_publications, public.savora_public_profiles), public.savora_mod_need()
  from public, anon, authenticated;
revoke all on function
  public.savora_lib_search(text, jsonb, text, jsonb, int), public.savora_lib_get(uuid), public.savora_lib_profile(text, jsonb),
  public.savora_pub_profile_get(), public.savora_pub_profile_set(text, text, text), public.savora_pub_profile_delete(),
  public.savora_pub_publish(uuid, uuid, int, jsonb, text, text, text, text, boolean), public.savora_pub_withdraw(uuid), public.savora_pub_withdraw_all(),
  public.savora_pub_mine(), public.savora_lib_report(uuid, text, text),
  public.savora_mod_is(), public.savora_mod_reports(text), public.savora_mod_get(uuid), public.savora_mod_action(uuid, text, text),
  public.savora_mod_close_report(uuid, text), public.savora_mod_ban(uuid, boolean, text),
  public.savora_lib_object_public(text), public.savora_lib_object_in_use(text), public.savora_lib_can_upload(text)
  from public, anon;
grant execute on function public.savora_lib_search(text, jsonb, text, jsonb, int), public.savora_lib_get(uuid), public.savora_lib_profile(text, jsonb),
  public.savora_lib_object_public(text) to anon, authenticated;
grant execute on function
  public.savora_pub_profile_get(), public.savora_pub_profile_set(text, text, text), public.savora_pub_profile_delete(),
  public.savora_pub_publish(uuid, uuid, int, jsonb, text, text, text, text, boolean), public.savora_pub_withdraw(uuid), public.savora_pub_withdraw_all(),
  public.savora_pub_mine(), public.savora_lib_report(uuid, text, text),
  public.savora_mod_is(), public.savora_mod_reports(text), public.savora_mod_get(uuid), public.savora_mod_action(uuid, text, text),
  public.savora_mod_close_report(uuid, text), public.savora_mod_ban(uuid, boolean, text),
  public.savora_lib_object_in_use(text), public.savora_lib_can_upload(text) to authenticated;
