"""Keine Merge-Reste (<<<<<<<, =======, >>>>>>>) in Quelldateien. Ein einziger solcher Rest in einer CSS-Datei lässt den Browser die folgenden Regeln stillschweigend ignorieren."""
import os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXT = ('.css', '.js', '.html', '.json', '.py', '.webmanifest')
SKIP = {'node_modules', '.git', 'ios', '.venv', 'www', 'build', 'vendor'}
bad = []
for d, dirs, files in os.walk(ROOT):
    dirs[:] = [x for x in dirs if x not in SKIP]
    for f in files:
        if not f.endswith(EXT) or f.endswith('.min.js'): continue
        p = os.path.join(d, f)
        try: lines = open(p, encoding='utf-8').read().split('\n')
        except Exception: continue
        for i, l in enumerate(lines, 1):
            if re.match(r'^(<<<<<<< |>>>>>>> |=======$)', l) and 'test_markers' not in p: bad.append(f'{os.path.relpath(p, ROOT)}:{i}')
print(('OK   ' if not bad else 'FEHL ') + 'Keine Merge-Reste in Quelldateien', bad[:10])
sys.exit(1 if bad else 0)
