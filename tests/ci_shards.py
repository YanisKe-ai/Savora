"""Aufteilung der Testreihe auf mehrere GitHub-Rechner (gleiche Tests, nur parallel).
  python tests/ci_shards.py cmd <teil>   gibt die Befehle fuer einen Teil aus (wird von .github/workflows/tests.yml ausgefuehrt)
  python tests/ci_shards.py check        prueft, dass JEDER Test aus run_all.ALL in genau einem Teil laeuft (kein Test geht verloren)
Die grossen Einzeltests paket42 (Handy-Bildvergleich, Breite) und paket37_adapt sind selbst aufgeteilt (Umgebungsvariablen
SAVORA_P42_ONLY / SAVORA_P42_THEMES / SAVORA_ADAPT_PART). Die uebrigen Tests sind nach ihrer bisherigen Laufzeit (Sekunden) auf sechs Gruppen verteilt (v89: vorher drei, laengster Teil 16 Min.)."""
import ast, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
SPECIAL = {'paket42', 'paket37_adapt'}
# Laufzeit in Sekunden (Messung auf GitHub); unbekannte Tests zaehlen 10 s
DAUER = {'v89_rezept_editor': 40, 'v89_kochmodus': 40, 'v89_technik': 40, 'v89_profilbilder': 15, 'v89_kochbuch_pdf_handy': 40, 'v88_seite': 80, 'v88_mess': 40, 'v87_layout': 90, 'v87_design': 40, 'v87_text': 10, 'v861_kopf': 15, 'v86_sync': 30, 'v86_anzeige': 40, 'v86_rechnung': 30, 'v85_kochbuch_ablauf': 60, 'v84_daten': 60, 'v84_uebersicht': 60, 'v84_rezept': 40, 'v84_integration': 20, 'pdf_stile': 270, 'bibliothek_herkunft': 90, 'bibliothek_api': 5, 'bibliothek_ablauf': 40, 'bibliothek_veroeffentlichen': 40, 'bibliothek_ansicht': 90, 'v83_kochbuch': 60, 'v83_ertrag': 40, 'v83_schritte_texte': 60, 'v83_cover_pdf': 150, 'v83_planung': 60, 'v831_helfer': 30, 'v831_plan': 60, 'v831_entdecken': 90, 'v831_name': 60, 'mehr_konto': 240, 'pdf_ausgabe': 240, 'cover_pdf': 170, 'pdf_planer_v2': 150, 'pdf_cover': 120, 'pdf_kern': 100, 'paket37_plan': 93,
         'paket37_visual': 80, 'paket44': 75, 'laptop_platz': 73, 'mehr_nav': 65, 'a11y': 61, 'cover_editor': 60, 'monkey': 56, 'paket35': 52,
         'startseite_liste': 49, 'paket39': 46, 'paket37_interaction': 45, 'cover_ablauf': 45, 'paket43': 44, 'paket36': 44, 'freunde': 40, 'feinschliff': 39,
         'audit_b': 39, 'sync': 30, 'paket37_books': 30, 'motion_m1': 30, 'motion_m2': 30, 'flows': 28, 'pruefung': 27, 'visual': 26,
         'titel_suche': 26, 'cover_neu': 25, 'pdf_scharfes_s': 25, 'pdf_gestaltung_v2': 25, 'pdf_dialog': 25, 'pdf_migration': 25, 'teilen_ui': 24, 'paket37_data': 22,
         'audit_c': 22, 'rezepte_zeile': 21, 'aufraeumen': 20, 'cover_bild': 20, 'paket37_settings': 17, 'export': 15, 'pdfpreview': 14, 'ansicht_umschalter': 14,
         'paket3': 13, 'paket33': 12, 'paket27': 12, 'audit_a': 12, 'pdf_vorlagen': 12, 'cover_modell': 12, 'pdf_daten': 9}
def alle():
    src = open(os.path.join(HERE, 'run_all.py'), encoding='utf-8').read()
    return ast.literal_eval(re.search(r"^ALL = (\[.*?\])", src, re.M | re.S).group(1))
def gruppen(n=6):
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
        'allgemein-4': f"{py} migration {' '.join(g[3])} --parallel 2",
        'allgemein-5': f"{py} migration {' '.join(g[4])} --parallel 2",
        'allgemein-6': f"{py} migration {' '.join(g[5])} --parallel 2",
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
