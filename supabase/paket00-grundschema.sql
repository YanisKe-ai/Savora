-- Paket 00 (Savora 0.90): Grundschema des Abgleichs als Datei.
-- NUR DOKUMENTATION: So sieht der Abgleich-Kern live aus (gelesen am 23.10.2026). Die Tabelle wurde damals
-- von Hand im Supabase-Editor angelegt und nie als Datei gesichert. Diese Datei haelt den Stand fest, damit ein
-- neues Projekt (Test, Wiederherstellung) mit denselben Regeln aufgebaut werden kann.
-- Alle Befehle sind idempotent (if not exists / create or replace / drop ... if exists) und aendern ein
-- bestehendes Live-Projekt nicht: es muss NICHT eingespielt werden. Spaetere Pakete (36, 45, 47 ...) erweitern
-- diesen Kern; die kind-Liste unten ist der Stand NACH Paket 47.
-- Hinweis: Spaltenvorgaben (default) sind die sinnvolle Annahme; massgebend sind Spalten, Schluessel, Regeln, Policies, Trigger.

-- 1. Tabelle
create table if not exists public.savora_records (
  user_id           uuid        not null,
  kind              text        not null,
  id                text        not null,
  data              jsonb,
  deleted           boolean     not null default false,
  client_updated_at bigint      not null default 0,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, kind, id)
);

-- 2. Index fuer den Abzug (Aenderungen seit ...)
create index if not exists savora_records_pull_idx
  on public.savora_records (user_id, server_updated_at);

-- 3. Erlaubte Datenarten
alter table public.savora_records drop constraint if exists savora_records_kind_check;
alter table public.savora_records add constraint savora_records_kind_check
  check (kind = any (array['recipe', 'mealplan', 'shopping', 'setting', 'collection', 'membership', 'pairing']));

-- 4. Zeilenschutz (RLS): jeder sieht und aendert nur die eigenen Zeilen
alter table public.savora_records enable row level security;

drop policy if exists "savora lesen" on public.savora_records;
create policy "savora lesen" on public.savora_records
  for select using (user_id = (select auth.uid()));

drop policy if exists "savora anlegen" on public.savora_records;
create policy "savora anlegen" on public.savora_records
  for insert with check (user_id = (select auth.uid()));

drop policy if exists "savora aendern" on public.savora_records;
create policy "savora aendern" on public.savora_records
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "savora loeschen" on public.savora_records;
create policy "savora loeschen" on public.savora_records
  for delete using (user_id = (select auth.uid()));

-- 5. Serverzeit setzen; ein aelterer Stand vom Geraet ueberschreibt nie einen neueren (bei UPDATE: Zeile bleibt, wie sie war)
create or replace function public.savora_touch_server_time()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.client_updated_at < old.client_updated_at then
    return old;
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists savora_touch on public.savora_records;
create trigger savora_touch
  before insert or update on public.savora_records
  for each row execute function public.savora_touch_server_time();

-- 6. Konto loeschen: eigene Zeilen und das Konto selbst
create or replace function public.savora_delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.savora_records where user_id = (select auth.uid());
  delete from auth.users where id = (select auth.uid());
end;
$$;

revoke all on function public.savora_delete_account() from public, anon;
grant execute on function public.savora_delete_account() to authenticated;
