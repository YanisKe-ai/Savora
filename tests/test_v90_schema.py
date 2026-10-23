"""v90 Punkt 5: supabase/paket00-grundschema.sql statisch pruefen (kein Datenbankzugriff).
Nur idempotente Befehle, kind-Liste gleich der des Nachbau-Servers (Stand nach Paket 47), RLS an, Policy-Namen und Trigger wie live."""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

raw = open(os.path.join(ROOT, 'supabase', 'paket00-grundschema.sql'), encoding='utf-8').read()
sql = re.sub(r'--[^\n]*', '', raw)
sql = re.sub(r'\$\$.*?\$\$', '$$body$$', sql, flags=re.S)   # Funktionsrumpf zaehlt nicht als eigener Befehl
stmts = [s.strip() for s in sql.split(';') if s.strip()]

IDEMPOTENT = (r'create table if not exists', r'create index if not exists', r'alter table public\.savora_records drop constraint if exists',
              r'alter table public\.savora_records add constraint savora_records_kind_check', r'alter table public\.savora_records enable row level security',
              r'drop policy if exists', r'create policy', r'create or replace function', r'drop trigger if exists', r'create trigger',
              r'revoke all on function', r'grant execute on function')
bad = [s[:60] for s in stmts if not any(re.match(p, s, re.I) for p in IDEMPOTENT)]
check('Nur bekannte, wiederholbare Befehle', not bad, '; '.join(bad))
check('Kein delete/truncate/drop table/drop column ausser Policy, Trigger, Regel', not re.search(r'\b(truncate|drop table|drop column|delete from public\.savora_records\s*;)', sql, re.I))
check('Jede Policy wird vorher mit drop policy if exists entfernt', len(re.findall(r'drop policy if exists', sql, re.I)) == len(re.findall(r'create policy', sql, re.I)) == 4)
check('Regel wird mit drop constraint if exists erneuert (add constraint nur danach)', sql.lower().index('drop constraint if exists') < sql.lower().index('add constraint'))

for col, typ in [('user_id', 'uuid'), ('kind', 'text'), ('id', 'text'), ('data', 'jsonb'), ('deleted', 'boolean'), ('client_updated_at', 'bigint'), ('server_updated_at', 'timestamptz')]:
    check(f'Spalte {col} {typ}', re.search(rf'\b{col}\s+{typ}\b', sql) is not None)
check('Primaerschluessel (user_id, kind, id)', re.search(r'primary key \(user_id, kind, id\)', sql) is not None)
check('Index savora_records_pull_idx (user_id, server_updated_at)', re.search(r'savora_records_pull_idx\s+on public\.savora_records \(user_id, server_updated_at\)', sql) is not None)
check('Zeilenschutz (RLS) eingeschaltet', 'enable row level security' in sql.lower())
for name, cmd in [('savora lesen', 'select'), ('savora anlegen', 'insert'), ('savora aendern', 'update'), ('savora loeschen', 'delete')]:
    m = re.search(rf'create policy "{name}" on public\.savora_records\s+for {cmd}(.*?)(?=drop policy|create or replace|$)', sql, re.I | re.S)
    check(f'Policy «{name}» fuer {cmd} mit user_id = (select auth.uid())', bool(m) and '(select auth.uid())' in m.group(1))
check('Aendern prueft using UND with check', re.search(r'for update using \(user_id = \(select auth\.uid\(\)\)\) with check \(user_id = \(select auth\.uid\(\)\)\)', sql) is not None)
check('Trigger savora_touch before insert or update, je Zeile', re.search(r'create trigger savora_touch\s+before insert or update on public\.savora_records\s+for each row execute function public\.savora_touch_server_time\(\)', sql) is not None)
body = re.search(r'savora_touch_server_time\(\).*?\$\$(.*?)\$\$', raw, re.S).group(1)
check('Trigger: aelterer client_updated_at bei UPDATE -> return old', re.search(r"tg_op = 'UPDATE' and new\.client_updated_at < old\.client_updated_at then\s+return old", body) is not None)
check('Trigger: sonst server_updated_at := clock_timestamp()', 'new.server_updated_at := clock_timestamp()' in body)
check('Funktionen mit festem search_path', raw.count("set search_path = ''") >= 2)
check('savora_delete_account: security definer, loescht Zeilen und Konto', re.search(r'savora_delete_account\(\)\s+returns void\s+language plpgsql\s+security definer', raw) is not None and 'delete from auth.users' in raw and 'delete from public.savora_records' in raw)

kinds = re.search(r"kind = any \(array\[([^\]]*)\]\)", sql).group(1)
kinds = set(re.findall(r"'([a-z]+)'", kinds))
import mock_supabase as M
live = set(getattr(M, 'KINDS_47', M.ALLOWED_KINDS))
check('kind-Liste gleich KINDS_47 im Nachbau-Server', kinds == live, f'{sorted(kinds)} vs {sorted(live)}')
check('kind-Liste hat genau die 7 Live-Werte', kinds == {'recipe', 'mealplan', 'shopping', 'setting', 'collection', 'membership', 'pairing'})
print('\n%d Fehler' % len(FAIL) if FAIL else '\nAlles gruen')
sys.exit(1 if FAIL else 0)
