"""Aufteilung der Testreihe auf mehrere GitHub-Rechner (gleiche Tests, nur parallel).
  python tests/ci_shards.py cmd <teil>   gibt die Befehle fuer einen Teil aus (wird von .github/workflows/tests.yml ausgefuehrt)
  python tests/ci_shards.py check        prueft, dass JEDER Test aus run_all.ALL in genau einem Teil laeuft (kein Test geht verloren)
Die grossen Einzeltests paket42 (Handy-Bildvergleich, Breite) und paket37_adapt sind selbst aufgeteilt (Umgebungsvariablen
SAVORA_P42_ONLY / SAVORA_P42_THEMES / SAVORA_ADAPT_PART). Die uebrigen Tests sind nach ihrer bisherigen Laufzeit (Sekunden) auf drei Gruppen verteilt."""
import ast, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
SPECIAL = {'paket42', 'paket37_adapt'}
# Laufzeit in Sekunden (Messung auf GitHub); unbekannte Tests zaehlen 10 s
DAUER = {'paket37_plan': 93, 'paket37_visual': 80, 'paket44': 75, 'laptop_platz': 73, 'a11y': 61, 'monkey': 56, 'paket35': 52, 'startseite_liste': 49,
         'paket39': 46, 'paket37_interaction': 45, 'paket43': 44, 'paket36': 44, 'feinschliff': 39, 'audit_b': 39, 'sync': 30, 'paket37_books': 30,
         'flows': 28, 'pruefung': 27, 'visual': 26, 'titel_suche': 26, 'teilen_ui': 24, 'paket37_data': 22, 'audit_c': 22, 'rezepte_zeile': 21,
         'paket37_settings': 17, 'export': 15, 'pdfpreview': 14, 'ansicht_umschalter': 14, 'paket3': 13, 'paket33': 12, 'paket27': 12, 'audit_a': 12}
def alle():
    src = open(os.path.join(HERE, 'run_all.py'), encoding='utf-8').read()
    return ast.literal_eval(re.search(r"^ALL = (\[.*?\])", src, re.M | re.S).group(1))
def gruppen(n=3):
    namen = [t for t in alle() if t not in SPECIAL]
    # zusammengehoerig: die zwei Tests mit dem gemeinsamen Datenbank-Nachbau (Port 8796) bleiben zusammen, flows braucht migration (laeuft in jedem Teil zuerst)
    ketten = [['sync', 'paket36']]
    einzeln = [t for t in namen if t not in ('sync', 'paket36', 'migration')]
    einheiten = [(sum(DAUER.get(t, 10) for t in k), k) for k in ketten] + [(DAUER.get(t, 10), [t]) for t in einzeln]
    einheiten.sort(key=lambda e: -e[0])
    gr = [[0, []] for _ in range(n)]
    for d, k in einheiten:
        g = min(gr, key=lambda x: x[0]); g[0] += d; g[1] += k
    return [g[1] for g in gr]
def teile():
    g = gruppen()
    py = 'python tests/run_all.py'
    return {
        'handy-hell': f"SAVORA_P42_ONLY=phones SAVORA_P42_THEMES=light {py} paket42",
        'handy-dunkel': f"SAVORA_P42_ONLY=phones SAVORA_P42_THEMES=dark {py} paket42",
        'breite-1': f"SAVORA_ADAPT_PART=1 {py} paket37_adapt",
        'breite-2': f"SAVORA_ADAPT_PART=2 {py} paket37_adapt",
        'layout': f"SAVORA_P42_ONLY=layout {py} paket42",
        'allgemein-1': f"{py} migration {' '.join(g[0])} --parallel 2",
        'allgemein-2': f"{py} migration {' '.join(g[1])} --parallel 2",
        'allgemein-3': f"{py} migration {' '.join(g[2])} --parallel 2",
    }
def pruefen():
    g = gruppen(); ziel = [t for t in alle() if t != 'migration']
    gesehen = [t for grp in g for t in grp] + list(SPECIAL)
    fehlt = [t for t in ziel if t not in gesehen]; doppelt = sorted({t for t in gesehen if gesehen.count(t) > 1})
    unbekannt = [t for t in gesehen if t not in ziel and t != 'migration']
    print('Tests insgesamt:', len(ziel), '| fehlen:', fehlt, '| doppelt:', doppelt, '| unbekannt:', unbekannt)
    for i, grp in enumerate(g, 1): print(f'  allgemein-{i}: {len(grp)} Tests, ca. {sum(DAUER.get(t, 10) for t in grp)} s')
    return not fehlt and not doppelt and not unbekannt
if __name__ == '__main__':
    if len(sys.argv) >= 3 and sys.argv[1] == 'cmd': print(teile()[sys.argv[2]])
    elif len(sys.argv) >= 2 and sys.argv[1] == 'check': sys.exit(0 if pruefen() else 1)
    else: print(__doc__); sys.exit(2)
