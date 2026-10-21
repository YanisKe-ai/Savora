"""v88 MESS: Seitenplanung auf dem iPhone (Mobile Safari) brach jedes Rezept zu frueh um (Hirnkost: 16 statt 11 Seiten, Seiten halb leer).
Ursache (belegt im iOS-Simulator, siehe Bericht 0.88): pdfOverflowByRecipe (pdf.js) misst die Rezeptseiten im Druckbereich #printRoot nach,
BEVOR renderSectionsToPdf dort text-size-adjust: 100% setzt. Safari vergroessert in dieser 210 mm breiten Flaeche den Fliesstext
(Text-Autosizing, 14,67 px -> 22 bis 24 px), die Nachmessung meldete bis 170 mm Ueberhang, und jedes Rezept wurde mit grosser Reserve neu
geplant. Chromium kennt dieses Autosizing nicht. Der Test bildet es nach: eine CSS-Regel vergroessert den Text im Druckbereich nur, solange
dort KEIN text-size-adjust gesetzt ist (genau wie Safari).
Prueft:
  - normaler Export (Hirnkost, Prise Pop, Naehrwerte kompakt): Seitenzahl je Rezept
  - nachgebildetes Safari-Autosizing: gleiche Seiten je Rezept, gleiche Gesamtseiten, kein Rezept nachgeplant (alter Code: 16 Seiten)
  - Nachmessung pdfOverflowByRecipe schaltet die Textvergroesserung im Druckbereich selbst ab
  - gleicher Kontext: Hoehe jeder Rezeptseite in der Messflaeche = Hoehe im Druckbereich (hoechstens 0,3 mm Abweichung)"""
import asyncio, os, sys
os.environ.setdefault('SAVORA_TEST_PORT', '48110')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *   # noqa: F401,E402
from pdf_harness import PdfSession   # noqa: E402
from pdf_hirnkost_fixture import hirnkost_session_setup, HIRNKOST_IDS   # noqa: E402

FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info if not cond else '')
    if not cond: FAIL.append(name)

# Safari-Autosizing nachbilden: nur wirksam, solange der Druckbereich kein text-size-adjust traegt
AUTOSIZE_CSS = ('#printRoot:not([style*="text-size-adjust"]) .pv-step-text, #printRoot:not([style*="text-size-adjust"]) .pv-extra-body, '
                '#printRoot:not([style*="text-size-adjust"]) .pv-extra { font-size: 24px !important; line-height: 34px !important; }')
RESET_JS = "() => { const r = document.getElementById('printRoot'); r.style.removeProperty('-webkit-text-size-adjust'); r.style.removeProperty('text-size-adjust'); }"

def per_recipe(plan): return {r['id']: r['pages'] for r in plan['recipes']}

async def main():
    out = os.path.join(OUT, 'v88_mess'); os.makedirs(out, exist_ok=True)
    async with PdfSession(out) as s:
        await hirnkost_session_setup(s)
        await s.page.evaluate("async () => { await ensurePdfLibs(); }")
        # 1) normaler Export
        await s.page.evaluate(RESET_JS)
        ex1 = await s.book('hirnkost', 'prise-pop', 'compact', datei='hirnkost_normal', cover='pop')
        plan1 = await s.page.evaluate("() => window.pdfLastPlan")
        n1 = ex1.seiten(); p1 = per_recipe(plan1)
        print('normal:', n1, 'Seiten', p1)
        check('normal: Hirnkost hoechstens 13 Seiten', 10 <= n1 <= 13, str(n1))

        # 2) Druckbereich mit nachgebildetem Safari-Autosizing
        await s.page.add_style_tag(content=AUTOSIZE_CSS)
        await s.page.evaluate(RESET_JS)
        probe = await s.page.evaluate("""() => { const r = document.getElementById('printRoot');
          r.innerHTML = '<section class="pv-page" data-page-kind="recipe" data-recipe-id="x"><span class="pv-step-text">Text</span></section>';
          const before = getComputedStyle(r.querySelector('.pv-step-text')).fontSize;
          pdfOverflowByRecipe(r);
          r.innerHTML = r.innerHTML;   // Chromium wertet [style*=...] nach einer CSSOM-Aenderung erst fuer neue Knoten neu aus (Nachbildung, nicht App)
          const after = getComputedStyle(r.querySelector('.pv-step-text')).fontSize;
          const tsa = r.style.getPropertyValue('-webkit-text-size-adjust') || r.style.getPropertyValue('text-size-adjust');
          r.innerHTML = ''; r.style.removeProperty('-webkit-text-size-adjust'); r.style.removeProperty('text-size-adjust');
          return { before, after, tsa }; }""")
        print('Nachbildung:', probe)
        check('Nachbildung wirkt (Druckbereich ohne text-size-adjust: 24 px)', probe['before'] == '24px', str(probe))
        check('pdfOverflowByRecipe schaltet die Textvergroesserung im Druckbereich ab, bevor gemessen wird', probe['tsa'] == '100%' and probe['after'] != '24px', str(probe))
        ex2 = await s.book('hirnkost', 'prise-pop', 'compact', datei='hirnkost_autosize', cover='pop')
        plan2 = await s.page.evaluate("() => window.pdfLastPlan")
        n2 = ex2.seiten(); p2 = per_recipe(plan2)
        print('Safari-Nachbildung:', n2, 'Seiten', p2)
        check('Safari-Nachbildung: gleiche Gesamtseitenzahl wie normal (alter Code: 16 statt 11)', n2 == n1, f'{n2} / {n1}')
        check('Safari-Nachbildung: jedes Rezept gleich viele Seiten wie normal', p2 == p1, f'{p2} / {p1}')

        # 3) gleicher Kontext: Messflaeche = Druckbereich (mit abgeschalteter Textvergroesserung)
        diff = await s.page.evaluate("""async (ids) => {
          pdfSetContext('prise-pop', 'HIRNKOST', '', true, true); await ensureFontsReadyForPdf();
          const root = document.getElementById('printRoot'); const out = [];
          for (const id of ids) {
            const r = state.recipes.find((x) => x.id === id);
            const res = await buildRecipePdfPage(r, null, 'compact', '');
            for (const h of res.htmlPages) {
              const html = pdfStripImg(h);
              const a = measureSectionHeightMm(html);
              root.innerHTML = html; pdfNoAutosize(root); const sec = root.firstElementChild; sec.style.minHeight = '0'; pdfClampFrameText(sec);
              const b = sec.getBoundingClientRect().height / MM_PX; root.innerHTML = '';
              out.push([id, Math.round(a * 100) / 100, Math.round(b * 100) / 100]);
            }
          }
          cleanupPdfMeasureProbe();
          return out; }""", HIRNKOST_IDS)
        bad = [d for d in diff if abs(d[1] - d[2]) > 0.3]
        print('Messflaeche / Druckbereich (mm):', diff)
        check('Messflaeche und Druckbereich messen jede Rezeptseite gleich hoch (<= 0,3 mm)', diff and not bad, str(bad))
        check('Keine JS-Fehler', not s.fehler, str(s.fehler[:3]))
    print('\n' + ('ALLE OK' if not FAIL else f'{len(FAIL)} FEHLER: ' + '; '.join(FAIL)))
    print('Ausgabe:', out)
    sys.exit(1 if FAIL else 0)

asyncio.run(main())
