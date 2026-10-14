"""Test-Hilfe fuer die PDF-Dialog- und Migrationstests: Solange die neuen Stile (pdf-templates.js mit
PDF_TEMPLATES = { 'pur', 'prise-pop' } und pdfNormalizeTemplateId) noch nicht im Repo stehen, laufen die Tests gegen eine
temporaere Kopie, in der ein Mindest-Nachbau davon steht (pur -> Layout A, prise-pop -> Layout B). Sobald die echte Vorlagen-Tabelle
im Repo steht, tut diese Funktion nichts und die Tests laufen gegen den echten Stand."""
import os, re, shutil, tempfile
from common import ROOT, SITE

STUB_NORMALIZE = """
/* TESTNACHBAU (tests/p1_stub.py): in der echten Umsetzung steht diese Funktion in pdf-templates.js */
function pdfNormalizeTemplateId(id) { return id === 'prise-pop' || id === 'B' ? 'prise-pop' : 'pur'; }
"""

def ensure_new_styles():
    """Gibt True zurueck, wenn der Nachbau aktiv ist."""
    src = open(os.path.join(ROOT, 'pdf-templates.js'), encoding='utf-8').read()
    if 'function pdfNormalizeTemplateId' in src:
        return False
    dest = tempfile.mkdtemp(prefix='savora-p1stub-')
    shutil.copytree(ROOT, dest, dirs_exist_ok=True, ignore=shutil.ignore_patterns('.git', '.venv', 'tests', 'ios', 'node_modules', 'docs', 'native-plugins', 'supabase', 'assets'))
    if os.path.isdir(os.path.join(ROOT, 'assets')):
        shutil.copytree(os.path.join(ROOT, 'assets'), os.path.join(dest, 'assets'), dirs_exist_ok=True)
    p = os.path.join(dest, 'pdf-templates.js')
    s = open(p, encoding='utf-8').read()
    s = re.sub(r"const PDF_TEMPLATES = \{.*?\n\};", """const PDF_TEMPLATES = {
  'pur': { id: 'pur', name: 'Pur', hint: 'Ruhig und gut lesbar. Standard.', cls: 'pv-tpl-a', pageNo: [36, 69, 54] },
  'prise-pop': { id: 'prise-pop', name: 'Prise Pop', hint: 'Freundlich, kräftig, mit Tomatenrot.', cls: 'pv-tpl-b', pageNo: [64, 32, 95] },
};""", s, count=1, flags=re.S)
    s = s.replace('PDF_TEMPLATES.A', 'PDF_TEMPLATES.pur')
    s = s.replace("return PDF_TEMPLATES[v] ? v : 'A';", "return pdfNormalizeTemplateId(v);")
    s = s.replace("function pdfTemplateById(id) { return PDF_TEMPLATES[id] || PDF_TEMPLATES.pur; }", "function pdfTemplateById(id) { return PDF_TEMPLATES[pdfNormalizeTemplateId(id)]; }")
    s += STUB_NORMALIZE
    open(p, 'w', encoding='utf-8').write(s)
    SITE.set_dir(dest)
    return True
