"""PDF-Feinschliff V2: Seitenplaner mit Einseiten-Prioritaet fuer BEIDE Stile (Pur, Prise Pop), gemessen an echten PDFs.

Reihenfolge je Rezept: (1) eine Seite normal, (2) eine Seite compact, (3) eine Seite compact-columns (nur ab drei Gruppen und nur,
wenn die tatsaechlichen Breiten passen), (4) erst dann zwei oder mehr Seiten. Geprueft wird mit dem Entwicklungsprotokoll
(blob.planLog) UND den erzeugten PDFs (pdfinfo, pdftotext):
  Sloppy Joe (Testrezept aus dem Auftrag, nur hier im Test geladen) in beiden Stilen: KEINE Seitenzahl vorab versprochen,
    der Plan muss sich aus dem Protokoll begruenden lassen (1 Seite nur mit passendem Kandidaten, 2 Seiten nur, wenn alle drei scheitern)
  kurzes Rezept -> 1 Seite normal; knapp zu langes -> 1 Seite compact; drei Gruppen -> compact-columns erst nach 1 und 2
  lange Mengen verhindern den Dreispalter; langes Rezept mehrseitig ohne isolierten Anfangsschritt
  Quelle/Hinweis als letzter ueberlaufender Block: alle Kandidaten zuerst, nichts weggelassen
  ueberlange Gruppe und ueberlanger Schritt: verlustfrei segmentiert («Fortsetzung», Schrittnummer bleibt)
  Quelle genau einmal (auch wenn sie woertlich im letzten Schritt steht; Originaldaten unveraendert)
  gleiches Ergebnis bei 390 und 1440 px Fensterbreite; Fusszeile «n / K»; Kochbuch: rezeptlokale Zaehlung getrennt von «Seite X»
Ausgabe: /tmp/savora-tests/planer_v2/*.pdf (+ PNG bei SAVORA_PLANER_PNG=1)."""
import asyncio, base64, json, os, re, subprocess, sys
os.environ.setdefault('SAVORA_TEST_PORT', '16620')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *   # noqa: F401,F403

OUTDIR = os.path.join(OUT, 'planer_v2'); os.makedirs(OUTDIR, exist_ok=True)
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, (info if (info and (not cond or len(str(info)) < 140)) else ''))
    if not cond: FAIL.append(name)

STILE = list(TEMPLATE_IDS)
FOTO = os.path.join(TESTS, 'fixtures', 'sloppy-joe.jpeg')
FOTO_URL = [None]

# Sloppy-Joe-Testrezept aus dem Auftrag (fixture.js), in das Savora-Rezeptschema uebertragen. Fehlende Mengen bleiben leer.
SLOPPY = {
    'id': 'v2_sloppy', 'title': 'Sloppy Joe Buns', 'servings': 9, 'timeMinutes': 120, 'source': 'kookmutsjes.com',
    'ingredients': [{'amount': '', 'unit': '', 'name': 'Teig:'}]
    + [dict(amount=a, unit=u, name=n) for a, u, n in [('250', 'ml', 'Milch, lauwarm'), ('15', 'g', 'Honig'), ('7', 'g', 'Trockenhefe'), ('1', '', 'Ei, gross'), ('45', 'g', 'Butter, ungesalzen'), ('500', 'g', 'Weissmehl'), ('8', 'g', 'Salz')]]
    + [{'amount': '', 'unit': '', 'name': 'Sloppy-Joe-Füllung:'}]
    + [dict(amount=a, unit=u, name=n) for a, u, n in [('25', 'ml', 'Olivenöl'), ('600', 'g', 'Rinderhackfleisch'), ('4', 'g', 'Salz'), ('3', 'g', 'Paprikapulver'), ('2', 'g', 'Knoblauchpulver'), ('3', 'g', 'Zwiebelpulver'), ('3', 'g', 'Cayennepfeffer'), ('1 1/2', 'g', 'schwarzer Pfeffer'), ('100', 'g', 'Ketchup')]]
    + [{'amount': '', 'unit': '', 'name': 'Zum Füllen und Bestreichen:'}]
    + [dict(amount='', unit='', name=n) for n in ['Käsescheiben, Cheddar oder Schmelzkäse', 'Big-Mac-Sauce', '1 Ei (gross), verquirlt', 'Sesam']],
    'steps': [{'text': t} for t in [
        'Lauwarme Milch, Honig und Hefe in einer grossen Schüssel verrühren und 5 Minuten stehen lassen.',
        'Ei und Butter dazugeben und gut vermischen. Mehl und Salz hinzufügen und den Teig 10 bis 12 Minuten glatt kneten.',
        'Schüssel abdecken und den Teig an einem warmen Ort 1 Stunde gehen lassen, bis er sich verdoppelt hat.',
        'Olivenöl in einer Pfanne bei mittlerer bis hoher Hitze erwärmen. Hackfleisch mit Salz, Paprika, Knoblauchpulver, Zwiebelpulver, Cayennepfeffer und schwarzem Pfeffer 7 bis 8 Minuten anbraten, bis es durchgegart und gebräunt ist.',
        'Ketchup unterrühren, bis alles gut vermischt ist. Füllung vollständig auskühlen lassen.',
        'Aufgegangenen Teig zusammendrücken, in 9 gleich grosse Stücke teilen und zu Kugeln formen.',
        'Jede Kugel zu einem runden Fladen ausrollen.',
        'In die Mitte jedes Fladens eine Käsescheibe legen, dann etwas Füllung und einen Löffel Burgersauce daraufgeben. Nach Wunsch noch mehr Käse.',
        'Teig nach innen einschlagen und gut zusammendrücken, damit die Brötchen dicht sind.',
        'Brötchen mit der Naht nach unten auf ein Blech mit Backpapier legen, mit verquirltem Ei bestreichen und mit Sesam bestreuen. 30 Minuten gehen lassen.',
        'Im vorgeheizten Ofen bei 200 °C 12 bis 18 Minuten goldbraun backen.']],
}

SATZ = 'Die Zutaten gleichmässig verteilen und bei mittlerer Hitze unter gelegentlichem Rühren garen, bis alles weich ist.'
def rezept(rid, title, steps, groups=None, tips='', source='', image=False, amount=None):
    """groups: Liste (Titel, Anzahl Zutaten). amount: feste Mengenangabe (lange Mengen)."""
    ing = []
    for gi, (gt, n) in enumerate(groups or [('', 5)]):
        if gt: ing.append({'amount': '', 'unit': '', 'name': gt + ':'})
        for k in range(n): ing.append({'amount': amount[0] if amount else str(10 * (k + 1)), 'unit': amount[1] if amount else 'g', 'name': f'Zutat {gi + 1}.{k + 1}'})
    return {'id': rid, 'title': title, 'servings': 4, 'timeMinutes': 40, 'ingredients': ing, 'steps': [{'text': s} for s in steps], 'notes': tips, 'source': source, '_image': image}

SEED = """async ([list, foto]) => {
  for (const f of list) {
    const r = Object.assign(emptyRecipe(), f); delete r._image;
    r.image = f._image ? foto : null; r.updatedAt = Date.now(); await dbPut(r);
  }
  await loadRecipes(); return state.recipes.length; }"""
PLAN = """async ([id, tpl]) => { pdfSetContext(tpl, '', '', false); await ensureFontsReadyForPdf(); const r = state.recipes.find(x => x.id === id);
  try { const res = await buildRecipePdfPage(r, null, 'off'); cleanupPdfMeasureProbe();
    return { n: res.htmlPages.length, density: res.density, log: res.planLog, firstSteps: (res.htmlPages[0].match(/class="pv-step"/g) || []).length,
             dens: res.htmlPages.map(h => (h.match(/data-density="([^"]+)"/) || [])[1]) }; }
  catch (e) { cleanupPdfMeasureProbe(); return { error: e.userMessage || String(e) }; } }"""
EXPORT = """async ([id, tpl]) => { const res = await buildSinglePdf(id, 'off', { template: tpl }); const u = new Uint8Array(await res.blob.arrayBuffer());
  let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192));
  return { b64: btoa(s), log: res.blob.planLog, pages: res.blob.pageCount }; }"""

def pdftext(path, first=None):
    cmd = ['pdftotext', '-raw'] + (['-f', str(first), '-l', str(first)] if first else []) + [path, '-']
    return subprocess.run(cmd, capture_output=True, text=True).stdout
def flat(t): return re.sub(r'\s+', ' ', t.replace('­', '').replace('-\n', '')).strip()
def zusammen(t): return re.sub(r'[^0-9a-zäöüéèà]', '', t.lower())

def logtext(log):
    c = ' | '.join(f"{x['density']}: " + (f"übersprungen ({x['skipped']})" if x.get('skipped') else f"{x['heightMm']} mm" + (' passt' if x['fits'] else f" abgelehnt ({x['reject']})" if x.get('reject') else f" Überlauf {x['overflowMm']} mm")) for x in log['candidates'])
    return f"{c} -> {log['plan']}"

def plan_konsistent(log, n):
    """Ein Plan ist begruendet: 1 Seite nur mit passendem Kandidaten (alle davor gescheitert), mehrere Seiten nur, wenn alle scheitern."""
    cands = [c for c in log['candidates'] if not c.get('skipped')]
    fits = [c['fits'] for c in cands]
    if n == 1: return fits and fits[-1] and not any(fits[:-1])
    return cands and not any(fits)

async def export(page, rid, tpl, name):
    r = await page.evaluate(EXPORT, [rid, tpl])
    path = os.path.join(OUTDIR, name + '.pdf'); open(path, 'wb').write(base64.b64decode(r['b64']))
    if os.environ.get('SAVORA_PLANER_PNG'): subprocess.run(['pdftoppm', '-r', '70', '-png', path, path[:-4]], check=False)
    return path, r

def seiten(path):
    return int(re.search(r'Pages:\s*(\d+)', subprocess.run(['pdfinfo', path], capture_output=True, text=True).stdout).group(1))

async def adaptiv(page, tpl, make, start, stop, ziel):
    """Kleinste Schrittzahl n in [start, stop), bei der der Kandidat «ziel» gewaehlt wird (vorherige Kandidaten scheitern)."""
    for n in range(start, stop):
        rec = make(n); await page.evaluate(SEED, [[rec], FOTO_URL[0]])
        p = await page.evaluate(PLAN, [rec['id'], tpl])
        if p.get('n') == 1 and p['density'] == ziel: return n, p
        if p.get('n', 1) > 1: return n, p
    return None, None

async def main():
    foto = 'data:image/jpeg;base64,' + base64.b64encode(open(FOTO, 'rb').read()).decode() if os.path.exists(FOTO) else None
    FOTO_URL[0] = foto
    async with async_playwright() as pw:
        b, c = await open_ctx(pw, 1000, 900); page = await c.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.add_style_tag(content='::-webkit-scrollbar{display:none!important} html{scrollbar-width:none!important}')
        await page.evaluate('() => document.fonts.ready')
        sloppy = dict(SLOPPY, _image=bool(foto))
        lang = rezept('v2_lang', 'Langes Schmorgericht', [f'Schritt {i + 1}: ' + SATZ + ' ' + SATZ for i in range(26)], [('Basis', 6), ('Sauce', 5)], source='Familienrezept')
        kurz = rezept('v2_kurz', 'Kurze Pasta', ['Pasta kochen.', 'Sauce erwärmen und mischen.', 'Servieren.'], [('', 4)], source='Eigenes Rezept')
        quelle_im_schritt = rezept('v2_qschritt', 'Quelle im Schritt', ['Teig kneten.', 'Im Ofen backen. Quelle: kookmutsjes.com'], [('', 3)], source='kookmutsjes.com')
        riesen_gruppe = rezept('v2_riesengruppe', 'Riesige Zutatengruppe', ['Alles mischen.', 'Backen.'], [('Grosse Gruppe', 95)])
        riesen_text = ' '.join(f'Satz {i + 1} beschreibt einen Arbeitsgang ausführlich mit genug Wörtern für eine ganze Zeile im Schritt.' for i in range(120))
        riesen_schritt = rezept('v2_riesenschritt', 'Riesiger Schritt', ['Vorbereiten.', riesen_text, 'Anrichten.'], [('', 4)])
        n = await page.evaluate(SEED, [[sloppy, lang, kurz, quelle_im_schritt, riesen_gruppe, riesen_schritt], foto])
        check('Testrezepte geladen', n >= 6, str(n))

        for tpl in STILE:
            print(f'\n===== Stil {tpl} =====')
            # --- Sloppy Joe: keine Seitenzahl vorab, Plan aus dem Protokoll begruenden ---
            path, r = await export(page, 'v2_sloppy', tpl, f'sloppy_{tpl}')
            k = seiten(path); log = r['log']
            print(f'  Sloppy Joe [{tpl}] {k} Seite(n): ' + logtext(log))
            check(f'[{tpl}] Sloppy: Plan begruendet (Kandidaten in fester Reihenfolge, 1 Seite nur wenn passend)', plan_konsistent(log, k), logtext(log))
            check(f'[{tpl}] Sloppy: Reihenfolge normal, compact, compact-columns', [x['density'] for x in log['candidates']][:3] == ['normal', 'compact', 'compact-columns'][:len(log['candidates'])], logtext(log))
            check(f'[{tpl}] Sloppy: PDF-Seitenzahl = geplante Seiten', k == r['pages'] and k <= 2, f'{k} / {r["pages"]}')
            t = flat(pdftext(path)); z = zusammen(t)
            fehlt = [i['name'] for i in SLOPPY['ingredients'] if not i['name'].endswith(':') and zusammen(i['name']) not in z]
            check(f'[{tpl}] Sloppy: alle Zutaten im PDF', not fehlt, str(fehlt))
            fehlt = [s['text'][:40] for s in SLOPPY['steps'] if zusammen(s['text']) not in z]
            check(f'[{tpl}] Sloppy: alle 11 Schritte vollstaendig im PDF', not fehlt, str(fehlt))
            check(f'[{tpl}] Sloppy: Quelle genau einmal', t.count('kookmutsjes.com') == 1, str(t.count('kookmutsjes.com')))
            for p in range(1, k + 1):
                check(f'[{tpl}] Sloppy: Fusszeile «{p} / {k}» auf Seite {p}', f'{p} / {k}' in flat(pdftext(path, p)))

            # --- kurzes Rezept: eine Seite normal ---
            p = await page.evaluate(PLAN, ['v2_kurz', tpl])
            check(f'[{tpl}] kurz: 1 Seite normal', p.get('n') == 1 and p.get('density') == 'normal', json.dumps(p.get('log', p))[:200])

            # --- knapp zu lang: eine Seite kompakt ---
            mk = lambda n: rezept('v2_knapp', 'Knapp zu lang', [SATZ + ' ' + SATZ] * n, [('', 8)], tips='Kurzer Hinweis zum Servieren.', source='Testquelle', image=bool(foto))
            nn, p = await adaptiv(page, tpl, mk, 4, 30, 'compact')
            check(f'[{tpl}] knapp: Kandidat compact passt bei n={nn}, normal scheiterte', bool(p) and p.get('n') == 1 and p['density'] == 'compact' and not p['log']['candidates'][0]['fits'], logtext(p['log']) if p and p.get('log') else str(p))
            if p and p.get('n') == 1:
                path, r = await export(page, 'v2_knapp', tpl, f'knapp_{tpl}')
                check(f'[{tpl}] knapp: echtes PDF 1 Seite, data-density compact', seiten(path) == 1 and r['log']['plan'].startswith('1 Seite (compact)'), r['log']['plan'])
                check(f'[{tpl}] knapp: Hinweis und Quelle im PDF', 'Kurzer Hinweis' in flat(pdftext(path)) and 'Testquelle' in flat(pdftext(path)))

            # --- drei geeignete Gruppen: compact-columns nur, wenn 1 und 2 scheitern ---
            mk3 = lambda n: rezept('v2_drei', 'Drei Gruppen', [SATZ + ' ' + SATZ] * n, [('Teig', 7), ('Füllung', 7), ('Garnitur', 7)], image=bool(foto))
            nn, p = await adaptiv(page, tpl, mk3, 3, 30, 'compact-columns')
            ok3 = bool(p) and p.get('n') == 1 and p['density'] == 'compact-columns'
            check(f'[{tpl}] drei Gruppen: compact-columns gewaehlt bei n={nn}', ok3, logtext(p['log']) if p and p.get('log') else str(p))
            if ok3:
                cd = p['log']['candidates']
                check(f'[{tpl}] drei Gruppen: normal und compact vorher gemessen und gescheitert', [x['density'] for x in cd] == ['normal', 'compact', 'compact-columns'] and not cd[0]['fits'] and not cd[1]['fits'], logtext(p['log']))
                path, r = await export(page, 'v2_drei', tpl, f'dreigruppen_{tpl}')
                check(f'[{tpl}] drei Gruppen: echtes PDF 1 Seite', seiten(path) == 1, logtext(r['log']))
                dreigr_n = nn
                # --- gleiche Schrittzahl mit langen Mengen: Dreispalter abgelehnt ---
                lm = rezept('v2_langmenge', 'Lange Mengen', [SATZ + ' ' + SATZ] * nn, [('Teig', 7), ('Füllung', 7), ('Garnitur', 7)], image=bool(foto), amount=('1 1/2 bis 2 1/2', 'Tassen'))
                await page.evaluate(SEED, [[lm], foto])
                q = await page.evaluate(PLAN, ['v2_langmenge', tpl])
                c3 = [x for x in q['log']['candidates'] if x['density'] == 'compact-columns']
                check(f'[{tpl}] lange Mengen: Dreispalter gemessen abgelehnt', q.get('n', 0) >= 1 and c3 and not c3[0]['fits'] and 'Menge' in (c3[0].get('reject') or ''), logtext(q['log']))
                # --- Fensterbreite egal (390 / 1440 px) ---
                res = {}
                for w in (390, 1440):
                    await page.set_viewport_size({'width': w, 'height': 900}); await page.wait_for_timeout(200)
                    res[w] = [await page.evaluate(PLAN, [rid, tpl]) for rid in ('v2_sloppy', 'v2_drei')]
                await page.set_viewport_size({'width': 1000, 'height': 900})
                sig = lambda L: [(x['n'], x['density'], [(c.get('density'), c.get('heightMm'), c.get('fits')) for c in x['log']['candidates']]) for x in L]
                check(f'[{tpl}] Ergebnis bei 390 px und 1440 px Fensterbreite gleich', sig(res[390]) == sig(res[1440]), str(sig(res[390]))[:300] + ' vs ' + str(sig(res[1440]))[:300])

            # --- langes Rezept: mehrseitig, lesbar, kein isolierter Anfangsschritt ---
            path, r = await export(page, 'v2_lang', tpl, f'lang_{tpl}')
            k = seiten(path); t = flat(pdftext(path))
            print('  lang: ' + logtext(r['log']))
            check(f'[{tpl}] lang: mehrseitig erst nach allen Einseiten-Kandidaten', k >= 2 and plan_konsistent(r['log'], k), logtext(r['log']))
            check(f'[{tpl}] lang: alle 26 Schritte vollstaendig', all(zusammen(f'Schritt {i + 1}: ' + SATZ) in zusammen(t) for i in range(26)))
            p = await page.evaluate(PLAN, ['v2_lang', tpl])
            check(f'[{tpl}] lang: nicht genau ein isolierter Schritt auf Seite 1', p['firstSteps'] != 1, str(p['firstSteps']))
            check(f'[{tpl}] lang: alle Seiten mit gleicher Dichte und data-density', len(set(p['dens'])) == 1 and p['dens'][0] in ('normal', 'compact'), str(p['dens']))
            for q in range(1, k + 1):
                check(f'[{tpl}] lang: Fusszeile «{q} / {k}»', f'{q} / {k}' in flat(pdftext(path, q)))

            # --- Quelle/Hinweis als letzter ueberlaufender Block: erst alle Kandidaten, nichts weggelassen ---
            def mkq(n, tip):
                return rezept('v2_hinweis', 'Hinweis am Ende', [SATZ + ' ' + SATZ] * n, [('', 8)], tips=tip, source='Quelle mit langer Angabe https://www.example.org/rezepte/hinweis-am-ende-sehr-lange-adresse', image=bool(foto))
            # Schrittzahl, bei der normal ohne Hinweis noch passt
            base_n = None
            for n in range(3, 30):
                await page.evaluate(SEED, [[mkq(n, '')], foto]); pq = await page.evaluate(PLAN, ['v2_hinweis', tpl])
                if pq.get('n') != 1 or pq['density'] != 'normal': base_n = n - 1; break
            tip = 'Dieser Hinweis ist der letzte Block. ' + ' '.join(['Er darf nie weggelassen werden.'] * 14)
            await page.evaluate(SEED, [[mkq(base_n, tip)], foto])
            path, r = await export(page, 'v2_hinweis', tpl, f'hinweis_{tpl}')
            k = seiten(path); t = flat(pdftext(path))
            print('  Hinweis/Quelle zuletzt: ' + logtext(r['log']))
            check(f'[{tpl}] Hinweis/Quelle zuletzt: normal scheitert, compact vor Mehrseitigkeit geprueft', not r['log']['candidates'][0]['fits'] and r['log']['candidates'][1]['density'] == 'compact' and plan_konsistent(r['log'], k), logtext(r['log']))
            check(f'[{tpl}] Hinweis/Quelle zuletzt: Hinweis und Quelle vollstaendig, Quelle einmal', 'Dieser Hinweis ist der letzte Block' in t and t.count('Quelle mit langer Angabe') == 1, t[-300:])

            # --- Quelle woertlich im letzten Schritt: genau einmal, Daten unveraendert ---
            path, r = await export(page, 'v2_qschritt', tpl, f'quelle_im_schritt_{tpl}')
            t = flat(pdftext(path))
            check(f'[{tpl}] Quelle im letzten Schritt: im PDF genau einmal', t.count('kookmutsjes.com') == 1 and 'Im Ofen backen.' in t, t[:300])
            orig = await page.evaluate("() => state.recipes.find(x => x.id === 'v2_qschritt').steps.map(s => s.text)")
            check(f'[{tpl}] Quelle im letzten Schritt: Originaldaten unveraendert', orig[-1] == 'Im Ofen backen. Quelle: kookmutsjes.com', str(orig))

            # --- ueberlange Gruppe und ueberlanger Schritt: verlustfrei segmentiert ---
            path, r = await export(page, 'v2_riesengruppe', tpl, f'riesengruppe_{tpl}')
            t = flat(pdftext(path)); k = seiten(path)
            namen = [f'Zutat 1.{i + 1}' for i in range(95)]
            fehlt = [x for x in namen if not re.search(re.escape(x) + r'(?!\d)', t)]
            doppelt = [x for x in namen if len(re.findall(re.escape(x) + r'(?!\d)', t)) > 1]
            check(f'[{tpl}] Riesengruppe: {k} Seiten, alle 95 Zutaten genau einmal', k >= 2 and not fehlt and not doppelt, f'fehlt {fehlt[:5]} doppelt {doppelt[:5]}')
            check(f'[{tpl}] Riesengruppe: Gruppentitel mit «Fortsetzung»', 'Fortsetzung' in t)
            path, r = await export(page, 'v2_riesenschritt', tpl, f'riesenschritt_{tpl}')
            t = flat(pdftext(path)); k = seiten(path)
            folge = [int(x) for x in re.findall(r'Satz (\d+) beschreibt einen Arbeitsgang ausführlich mit genug Wörtern für eine ganze Zeile im Schritt\.', t)]
            check(f'[{tpl}] Riesenschritt: {k} Seiten, alle 120 Saetze vollstaendig und in Reihenfolge', k >= 2 and folge == list(range(1, 121)), str(folge[:5]) + '... ' + str(len(folge)))
            p = await page.evaluate(PLAN, ['v2_riesenschritt', tpl])
            html_cont = await page.evaluate("""async ([id, tpl]) => { pdfSetContext(tpl, '', '', false); const r = state.recipes.find(x => x.id === id); const res = await buildRecipePdfPage(r, null, 'off'); cleanupPdfMeasureProbe();
                return res.htmlPages.map(h => { const d = document.createElement('div'); d.innerHTML = h; return Array.from(d.querySelectorAll('.pv-step[data-cont="1"] .pv-step-no')).map(e => e.textContent); }); }""", ['v2_riesenschritt', tpl])
            check(f'[{tpl}] Riesenschritt: Folgeteile mit Schrittnummer 2 und «Fortsetzung»', any(x == ['2'] for x in html_cont[1:]), str(html_cont))

            # --- nicht teilbarer Block laenger als eine Seite: Export stoppt mit verstaendlicher Meldung (nie abschneiden oder skalieren) ---
            riesen_notiz = rezept('v2_riesennotiz', 'Riesige Notiz', ['Kochen.'], [('', 3)], tips=' '.join(['Diese Notiz ist ein einziger sehr langer Absatz ohne Umbruch'] * 260))
            await page.evaluate(SEED, [[riesen_notiz], None])
            p = await page.evaluate(PLAN, ['v2_riesennotiz', tpl])
            check(f'[{tpl}] Ueberlanger Notizabsatz: Export stoppt mit Meldung', 'passt nicht ins PDF' in (p.get('error') or ''), str(p)[:200])

            # --- Kochbuch: rezeptlokale Zaehlung getrennt von der Buchseite ---
            await page.evaluate("(t) => saveCookbookConfig({ title: 'Planer V2', subtitle: '', author: '', pdfTemplate: t, chapters: [], items: [{ recipeId: 'v2_kurz', chapterId: '' }, { recipeId: 'v2_lang', chapterId: '' }], showLogo: false, chapterPages: false, cover: { v: 1, templateId: 'pop', date: '2026-10-14', showDate: false } })", tpl)
            r = await page.evaluate("""async () => { const res = await buildCookbookPdf('off'); const u = new Uint8Array(await res.blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return { b64: btoa(s), start: res.blob.recipeStart, log: res.blob.planLog }; }""")
            path = os.path.join(OUTDIR, f'kochbuch_{tpl}.pdf'); open(path, 'wb').write(base64.b64decode(r['b64']))
            k = seiten(path); st = r['start']['v2_lang']; nl = len([1 for x in r['log'] if x]) and int(re.match(r'(\d+)', r['log'][1]['plan']).group(1))
            ok = True; info = []
            for i in range(nl):
                pt = flat(pdftext(path, st + i)); info.append(pt[-60:])
                ok = ok and f'Seite {st + i}' in pt and f'{i + 1} / {nl}' in pt
            kt = flat(pdftext(path, r['start']['v2_kurz']))
            check(f'[{tpl}] Kochbuch: Buchseite «Seite X» und rezeptlokal «n / {nl}» getrennt', ok and nl >= 2, ' || '.join(info))
            check(f'[{tpl}] Kochbuch: einseitiges Rezept ohne «1 / 1», mit Buchseite', '1 / 1' not in kt and f'Seite {r["start"]["v2_kurz"]}' in kt, kt[-80:])
        check('Keine Seitenfehler', not errs, '; '.join(errs[:3]))
        await b.close()
    print('\nFEHLER:' if FAIL else '\nALLE OK', FAIL if FAIL else '')
    sys.exit(1 if FAIL else 0)

asyncio.run(main())
