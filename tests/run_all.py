"""Fuehrt alle Savora-Tests nacheinander aus und meldet am Ende eine Gesamtbilanz.
Aufruf:  python3 tests/run_all.py            (alle)
         python3 tests/run_all.py flows sync (nur bestimmte)"""
import os, subprocess, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
# Reihenfolge ist wichtig: test_migration erzeugt old-backup.json, das test_flows importiert.
ALL = ['migration', 'flows', 'sync', 'pruefung', 'visual', 'offline', 'native', 'paket1', 'paket2', 'paket3', 'paket4', 'a11y', 'theme', 'paket6', 'paket7', 'paket8', 'paket9', 'import', 'monkey', 'pdfpreview', 'units', 'shell', 'photoscan', 'restore', 'paket19', 'paket20', 'nutrition', 'export', 'recipecheck']
wanted = sys.argv[1:] or ALL
results = []
for name in wanted:
    print(f'\n===== test_{name}.py =====', flush=True)
    t = time.time()
    rc = subprocess.run([sys.executable, os.path.join(HERE, f'test_{name}.py')], timeout=600).returncode
    results.append((name, rc, time.time() - t))
print('\n===== Bilanz =====')
for name, rc, sec in results:
    print(f"{'BESTANDEN' if rc == 0 else 'FEHLGESCHLAGEN'}  test_{name}.py  ({sec:.0f}s)")
sys.exit(1 if any(rc for _, rc, _ in results) else 0)
