"""Service-Worker-Liste: jede Datei, die index.html laedt, muss in SHELL_ASSETS stehen (sonst fehlt sie offline nach einem Update).
Ausserdem: keine Eintraege in der Liste, die es nicht gibt (ein fehlender Eintrag laesst die Installation des Service Workers scheitern)."""
import os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
sw = open(os.path.join(ROOT, 'sw.js'), encoding='utf-8').read()
shell = re.search(r'const SHELL_ASSETS = \[(.*?)\];', sw, re.S).group(1)
listed = set(re.findall(r"'\./([^']*)'", shell))
optional = set(re.findall(r"'\./([^']*)'", re.search(r'const OPTIONAL_ASSETS = \[(.*?)\];', sw, re.S).group(1)))
listed |= optional
used = set(re.findall(r'<script[^>]+src="([^"]+)"', html)) | set(re.findall(r'<link[^>]+href="([^"]+)"', html)) | set(re.findall(r'<img[^>]+src="([^"]+)"', html))
used = {u for u in used if not u.startswith(('http', '//', 'data:'))}
missing = sorted(u for u in used if u not in listed)
ghost = sorted(f for f in listed if f and not os.path.exists(os.path.join(ROOT, f)))
fail = []
def check(name, ok, info=''):
    print(('OK   ' if ok else 'FEHL ') + name, info)
    if not ok: fail.append(name)
check('Alle von index.html geladenen Dateien stehen in der Service-Worker-Liste', not missing, str(missing))
check('Die Liste enthält nur vorhandene Dateien', not ghost, str(ghost))
# Seit Audit B (P01/P02): grosse Dateien sind optional, PDF-Bibliotheken werden bei Bedarf nachgeladen, bleiben aber offline im Shell-Cache
check('Optionale grosse Dateien stehen NICHT in der Installationsliste', not (optional & set(re.findall(r"'\./([^']*)'", shell))), str(sorted(optional & set(re.findall(r"'\./([^']*)'", shell)))))
check('Cover in Vollaufloesung und Naehrwertdatei sind optional', 'swiss-fcd-data.json' in optional and sum(1 for o in optional if o.startswith('assets/covers/') and '/thumbs/' not in o) == 10)
check('Kleine Cover-Vorschaubilder bleiben in der Shell', sum(1 for u in re.findall(r"'\./(assets/covers/thumbs/[^']*)'", shell)) == 10)
check('jsPDF und html2canvas stehen nicht mehr als Script-Tag in index.html', not any(('jspdf' in u or 'html2canvas' in u) for u in used), str(sorted(used)))
check('jsPDF und html2canvas bleiben im Shell-Cache (Export offline)', 'jspdf.umd.min.js' in listed and 'html2canvas.min.js' in listed and 'jspdf.umd.min.js' in shell and 'html2canvas.min.js' in shell)
check('pdf.js laedt die Bibliotheken ueber ensurePdfLibs', 'ensurePdfLibs' in open(os.path.join(ROOT, 'pdf.js'), encoding='utf-8').read())
check('Version in sw.js ist gesetzt', re.search(r"const SW_VERSION = 'v\d+-[a-z0-9-]+'", sw) is not None)
print('\nFEHLGESCHLAGEN:', fail or 'keine')
sys.exit(1 if fail else 0)
