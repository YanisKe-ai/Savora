"""Service-Worker-Liste: jede Datei, die index.html laedt, muss in SHELL_ASSETS stehen (sonst fehlt sie offline nach einem Update).
Ausserdem: keine Eintraege in der Liste, die es nicht gibt (ein fehlender Eintrag laesst die Installation des Service Workers scheitern)."""
import os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
sw = open(os.path.join(ROOT, 'sw.js'), encoding='utf-8').read()
shell = re.search(r'const SHELL_ASSETS = \[(.*?)\];', sw, re.S).group(1)
listed = set(re.findall(r"'\./([^']*)'", shell))
listed |= set(re.findall(r"'\./([^']*)'", re.search(r'const STATIC_DATA_ASSETS = \[(.*?)\];', sw, re.S).group(1)))
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
check('Version in sw.js ist gesetzt', re.search(r"const SW_VERSION = 'v\d+-[a-z0-9-]+'", sw) is not None)
print('\nFEHLGESCHLAGEN:', fail or 'keine')
sys.exit(1 if fail else 0)
