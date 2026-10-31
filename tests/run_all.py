"""Fuehrt die Savora-Tests aus und meldet am Ende eine Gesamtbilanz.
Aufruf:  python3 tests/run_all.py                     (alle, nacheinander, wie bisher)
         python3 tests/run_all.py flows sync          (nur bestimmte)
         python3 tests/run_all.py --parallel          (alle, bis zu 3 gleichzeitig, deutlich schneller)
         python3 tests/run_all.py --parallel 4        (4 gleichzeitig)
         python3 tests/run_all.py --schnell           (parallel, und der grosse Anpassungstest nur mit den wichtigsten Breiten und Darstellungen)
Die volle Reihe (ohne --schnell) laeuft weiterhin automatisch auf GitHub bei jedem Push.
Reihenfolge: zuerst die Tests, die voneinander abhaengen (migration -> flows), dann die unabhaengigen parallel, zuletzt die
zeitempfindlichen (Messungen in Millisekunden) allein, damit gleichzeitige Last sie nicht verfaelscht."""
import concurrent.futures, os, subprocess, sys, tempfile, time
HERE = os.path.dirname(os.path.abspath(__file__))
# Reihenfolge ist wichtig: test_migration erzeugt old-backup.json, das test_flows importiert.
ALL = ['freunde', 'mehr_konto', 'mehr_nav', 'migration', 'flows', 'sync', 'pruefung', 'native', 'paket1', 'paket2', 'paket3', 'paket4', 'a11y', 'paket6', 'paket7', 'paket8', 'paket9', 'import', 'monkey', 'pdfpreview', 'units', 'shell', 'photoscan', 'restore', 'paket19', 'paket20', 'nutrition', 'recipecheck', 'paket24', 'paket27', 'paket30', 'paket31', 'paket33', 'nutrition_range', 'recipe_json', 'paket34', 'paket35', 'paket36', 'paket37_data', 'paket37_import', 'paket37_settings', 'paket37_plan', 'paket37_books', 'paket37_visual', 'paket37_adapt', 'paket37_interaction', 'paket39', 'paket43', 'paket44', 'startseite_liste', 'paket42', 'audit_b', 'audit_a', 'audit_c', 'audit_nachtrag', 'naehrwerte_klammern', 'teilen_ui', 'titel_suche', 'feinschliff', 'laptop_platz', 'ansicht_umschalter', 'rezepte_zeile', 'heute_schalter', 'ohne_schwarz', 'pdf_daten', 'pdf_vorlagen', 'pdf_cover', 'pdf_kern', 'pdf_dialog', 'pdf_migration', 'pdf_stile', 'cover_neu', 'cover_modell', 'cover_bild', 'cover_editor', 'cover_pdf', 'cover_ablauf', 'motion_m2', 'motion_m1', 'aufraeumen', 'pdf_planer_v2', 'pdf_gestaltung_v2', 'bibliothek_herkunft', 'bibliothek_api', 'bibliothek_ablauf', 'bibliothek_veroeffentlichen', 'bibliothek_ansicht', 'v83_kochbuch', 'v83_ertrag', 'v83_schritte_texte', 'v83_cover_pdf', 'v83_planung', 'v831_helfer', 'v831_plan', 'v831_entdecken', 'v831_name', 'v84_daten', 'v84_uebersicht', 'v84_rezept', 'v84_integration', 'v85_kochbuch_ablauf', 'v86_rechnung', 'v86_anzeige', 'v86_sync', 'v861_kopf', 'v87_text', 'v87_design', 'v88_seite', 'v89_kochbuch_pdf_handy', 'v89_profilbilder', 'v89_technik', 'v89_kochmodus', 'v89_rezept_editor', 'v89_start_einkauf', 'v90_konflikt', 'v90_speicher', 'v90_haushalt', 'v90_csp', 'v90_kalender', 'v90_schema', 'v90_vorrat', 'v90_papierkorb', 'v90_bewertung', 'v90_ki_prompt', 'v91_modus', 'v91_scroll_ende', 'v92_pdf_import', 'v92_pdf_ui', 'v92_zeit', 'v93_bild_import', 'v93_bild_ui', 'v93_toast', 'markers']
FIRST = ['migration', 'flows']                      # abhaengig: teilen sich den Ausgabeordner
MOCK_CHAIN = ['sync', 'paket36']                    # beide nutzen den Test-Datenbank-Nachbau auf Port 8796: nie gleichzeitig
LAST = ['monkey', 'paket37_interaction', 'paket39', 'paket37_plan']            # zeitempfindlich (Millisekunden-Messungen): allein laufen lassen
QUICK_ENV = {'paket37_adapt': {'SAVORA_ADAPT_QUICK': '1'}}
# Immer gesetzte Umgebung je Test (zurzeit keine).
EXTRA_ENV = {}
BASE_PORT = int(os.environ.get("SAVORA_BASE_PORT", "8900"))

args = sys.argv[1:]
skip = set()
parallel = 1; quick = False; names = []
i = 0
while i < len(args):
    a = args[i]
    if a == '--schnell': quick = True; parallel = max(parallel, 3)
    elif a == '--ohne' and i + 1 < len(args): skip.update(args[i + 1].split(',')); i += 1   # Tests auslassen (fuer die Aufteilung auf mehrere GitHub-Rechner)
    elif a == '--parallel':
        parallel = 3
        if i + 1 < len(args) and args[i + 1].isdigit(): parallel = int(args[i + 1]); i += 1
    else: names.append(a)
    i += 1
wanted = [n for n in (names or ALL) if n not in skip]
RUN_ID = f'{os.getpid()}-{int(time.time())}'
OUT_BASE = os.path.join(tempfile.gettempdir(), f'savora-tests-run-{RUN_ID}')

def run_one(name, idx, shared_out=False):
    env = dict(os.environ)
    env['SAVORA_TEST_PORT'] = str(BASE_PORT + idx)
    env['SAVORA_TEST_OUT'] = os.path.join(OUT_BASE, 'shared' if shared_out else name)
    os.makedirs(env['SAVORA_TEST_OUT'], exist_ok=True)
    env.update(EXTRA_ENV.get(name, {}))
    if quick: env.update(QUICK_ENV.get(name, {}))
    t = time.time()
    p = subprocess.run([sys.executable, os.path.join(HERE, f'test_{name}.py')], env=env, capture_output=True, text=True, timeout=1500)
    return name, p.returncode, time.time() - t, p.stdout + p.stderr

results = {}
def show(res):
    name, rc, sec, out = res
    print(f'\n===== test_{name}.py =====', flush=True); print(out, flush=True)
    results[name] = (rc, sec)

if parallel <= 1 and not quick:
    # wie bisher: nacheinander, Ausgabe laufend
    for n, name in enumerate(wanted):
        print(f'\n===== test_{name}.py =====', flush=True)
        t = time.time()
        env = dict(os.environ)
        env.update(EXTRA_ENV.get(name, {}))
        if name in QUICK_ENV and quick: env.update(QUICK_ENV[name])
        rc = subprocess.run([sys.executable, os.path.join(HERE, f'test_{name}.py')], env=env, timeout=1500).returncode
        results[name] = (rc, time.time() - t)
else:
    first = [n for n in FIRST if n in wanted]
    chain = [n for n in MOCK_CHAIN if n in wanted]
    last = [n for n in LAST if n in wanted]
    middle = [n for n in wanted if n not in first + chain + last]
    idx = {n: k for k, n in enumerate(ALL + [x for x in wanted if x not in ALL])}
    for n in first: show(run_one(n, idx[n], shared_out=True))
    def run_chain(c):
        out = []
        for n in c: out.append(run_one(n, idx[n]))
        return out
    tasks = [[n] for n in middle] + ([chain] if chain else [])
    with concurrent.futures.ThreadPoolExecutor(max_workers=parallel) as ex:
        futs = [ex.submit(run_chain, t) for t in tasks]
        for f in concurrent.futures.as_completed(futs):
            for res in f.result(): show(res)
    for n in last: show(run_one(n, idx[n]))

print('\n===== Bilanz =====')
for name in wanted:
    rc, sec = results.get(name, (1, 0))
    print(f"{'BESTANDEN' if rc == 0 else 'FEHLGESCHLAGEN'}  test_{name}.py  ({sec:.0f}s)")
sys.exit(1 if any(results.get(n, (1, 0))[0] for n in wanted) else 0)
