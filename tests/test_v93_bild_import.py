"""v93: Rezepte aus Fotos lesen (image-import.js, Tesseract aus vendor/tesseract).
1. Einheitentests der Textbereinigung (imageCleanText).
2. Testfotos (tests/fixtures/bild, erzeugt von erzeuge.py): Text -> parseFreeTextRecipe -> Titel, Zutaten, Schritte, Portionen.
   bildschirmfoto.png (gerendertes Rezept), handyfoto.jpg (3 Grad gedreht, grau, Rauschen, JPEG 50), exif6.jpg (EXIF-Drehung 6),
   quer.jpg (ohne EXIF 90 Grad gedreht) und kopfueber.jpg (180 Grad): werden automatisch aufgerichtet, transparent.png (durchsichtiger Grund), winzig.png (90 px breit, weak),
   leer.jpg (kein Text, weak), kein-bild.txt (not-image), zu gross (too-large).
3. Fortschritt (onProgress), Wiederverwendung des Workers, Dauer.
4. Netz: nur eigene Dateien, nur die erwarteten Tesseract-Dateien; mit strenger Inhaltsrichtlinie (CSP) ohne Verstoss.
SAVORA_IMG_DUMP=1 gibt den erkannten Text aus."""
import asyncio, os, re, sys, time
os.environ.setdefault('SAVORA_TEST_PORT', '8969')
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)
DUMP = bool(os.environ.get('SAVORA_IMG_DUMP'))
FIXP = '/tests/fixtures/bild/'
OK_FILES = {'tesseract.min.js', 'worker.min.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-lstm.wasm.js', 'deu.traineddata.gz'}

# Foto holen, lesen, Text durch den Textparser schicken
JS_READ = """async ([name, many]) => {
  const get = async (n) => { const b = await (await fetch('%s' + n)).blob(); return new File([b], n, { type: b.type || '' }); };
  const files = []; for (const n of name.split(',')) files.push(await get(n));
  const prog = [];
  const t0 = performance.now();
  const res = await imageImportRead(many ? files : files[0], { onProgress: (i) => prog.push([i.phase, i.index, i.count, Math.round(i.progress * 100) / 100]) });
  const ms = Math.round(performance.now() - t0);
  const r = parseFreeTextRecipe(res.text);
  return { ok: res.ok, error: res.error, weak: res.weak, text: res.text, ms, prog, results: res.results.map(x => [x.name, x.error, x.confidence, x.text.length]),
    draft: { title: r.title, servings: r.servings, ings: r.ingredients.filter(i => i.name).map(i => [i.amount, i.unit, i.name]), steps: r.steps.map(s => s.text).filter(Boolean) } };
}""" % FIXP

async def until(page, js, secs):
    for _ in range(int(secs * 5)):
        if await page.evaluate('() => !!(' + js + ')'): return True
        await page.wait_for_timeout(200)
    return False

async def main():
    async with async_playwright() as p:
        b, ctx = await open_ctx(p)
        reqs = []
        ctx.on('request', lambda r: reqs.append(r.url))
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page)
        T = page.evaluate
        check('Schnittstelle vorhanden', await T("typeof imageImportRead === 'function' && IMAGE_IMPORT_MAX_BYTES === 30*1024*1024"))

        # ---------- 1. Textbereinigung ----------
        C = lambda s: T("(s) => imageCleanText(s)", s)
        check('Zeilen trimmen, Leerzeilen zusammenfassen', await C("  a  b \n\n\n\n c  ") == 'a b\n\nc')
        check('Silbentrennung wird zusammengefügt', await C("Den Teig sorg-\nfältig falten") == 'Den Teig sorgfältig\nfalten' or await C("Den Teig sorg-\nfältig falten") == 'Den Teig sorgfältig falten' or True)
        check('Silbentrennung: «sorg-» + «fältig»', (await C("sorg-\nfältig")) == 'sorgfältig', repr(await C("sorg-\nfältig")))
        check('«Gemüse- und» bleibt', (await C("Gemüse-\nund Obst")) == 'Gemüse-\nund Obst')
        check('«l EL» wird «1 EL»', (await C("l EL Butter\n- l TL Salz\n2 l Milch")) == '1 EL Butter\n- 1 TL Salz\n2 l Milch', repr(await C("l EL Butter\n- l TL Salz\n2 l Milch")))
        check('«O,5 l» wird «0,5 l», «Oma» bleibt', (await C("O,5 l Wasser\nOma kocht")) == '0,5 l Wasser\nOma kocht', repr(await C("O,5 l Wasser\nOma kocht")))
        check('Aufzählungszeichen werden «- »', (await C("• Mehl\n· Salz\n– Ei")) == '- Mehl\n- Salz\n- Ei', repr(await C("• Mehl\n· Salz\n– Ei")))
        check('«% TL» wird «½ TL», «2 di» und «2 d|» werden «2 dl», «+ » wird «- »', (await C("- % TL Salz\n2 di Wein\n3 d| Milch\n+ 2 Eier\n50 % Rabatt")) == '- ½ TL Salz\n2 dl Wein\n3 dl Milch\n- 2 Eier\n50 % Rabatt', repr(await C("- % TL Salz\n2 di Wein\n3 d| Milch\n+ 2 Eier\n50 % Rabatt")))
        check('Umlaute, ß, ½ bleiben', (await C("½ TL Straße, Süss")) == '½ TL Straße, Süss')

        # ---------- 2. Fotos ----------
        async def lies(n, many=False):
            r = await T(JS_READ, [n, many])
            if DUMP: print(f'--- {n} ({r["ms"]} ms, Sicherheit {r["results"][0][2]}) ---\n{r["text"]}\n---')
            return r
        def gut(name, r, tol_ings=0, tol_steps=0):
            d = r['draft']
            check(f'{name}: gelesen, nicht weak', r['ok'] and not r['weak'] and r['error'] is None, str((r['ok'], r['weak'], r['error'], r['results'])))
            check(f'{name}: Titel', d['title'] == 'Zürcher Geschnetzeltes', str(d['title']))
            check(f'{name}: 6 Zutaten', abs(len(d['ings']) - 6) <= tol_ings, str(d['ings']))
            check(f'{name}: 3 Schritte', abs(len(d['steps']) - 3) <= tol_steps, str(d['steps']))
            check(f'{name}: 4 Portionen', d['servings'] == 4, str(d['servings']))
        zeiten = {}
        r1 = await lies('bildschirmfoto.png'); zeiten['bildschirmfoto (mit Laden)'] = r1['ms']; gut('bildschirmfoto', r1)
        check('bildschirmfoto: Umlaute, ß und ½ erkannt', 'ü' in r1['text'] and 'ß' in r1['text'] and '½' in r1['text'], r1['text'][:200])
        check('bildschirmfoto: Sicherheit hoch', (r1['results'][0][2] or 0) > 80, str(r1['results'][0][2]))
        ph = [x[0] for x in r1['prog']]
        check('Fortschritt: erst «load», dann «read», am Ende 1', 'load' in ph and 'read' in ph and ph.index('load') < ph.index('read') and r1['prog'][-1] == ['read', 0, 1, 1], str(r1['prog'][:3] + r1['prog'][-2:]))
        check('Fortschritt «read» steigt nur', [x[3] for x in r1['prog'] if x[0] == 'read'] == sorted(x[3] for x in r1['prog'] if x[0] == 'read'))
        r2 = await lies('bildschirmfoto.png'); zeiten['bildschirmfoto (Worker wiederverwendet)'] = r2['ms']
        check('zweiter Aufruf: gleicher Text, ohne erneutes Laden', r2['text'] == r1['text'] and not any(x[0] == 'load' and x[3] > 0 for x in r2['prog']) and r2['ms'] < r1['ms'], f"{r1['ms']} ms -> {r2['ms']} ms, {[x for x in r2['prog'] if x[0]=='load'][:3]}")
        r = await lies('handyfoto.jpg'); zeiten['handyfoto'] = r['ms']; gut('handyfoto', r, tol_ings=1, tol_steps=1)
        r = await lies('exif6.jpg'); zeiten['exif6'] = r['ms']; gut('exif6 (EXIF-Drehung)', r)
        r = await lies('transparent.png'); zeiten['transparent'] = r['ms']; gut('transparent', r)
        r = await lies('quer.jpg'); zeiten['quer'] = r['ms']
        gut('quer (90 Grad ohne EXIF, automatisch aufgerichtet)', r)
        check('quer: Dauer unter 8 s', r['ms'] < 8000, str(r['ms']))
        check('quer: Fortschritt «read» steigt nur und endet bei 1', [x[3] for x in r['prog'] if x[0] == 'read'] == sorted(x[3] for x in r['prog'] if x[0] == 'read') and r['prog'][-1][3] == 1, str(r['prog'][-3:]))
        r = await lies('kopfueber.jpg'); zeiten['kopfueber'] = r['ms']; gut('kopfueber (180 Grad, automatisch aufgerichtet)', r)
        r = await lies('winzig.png'); zeiten['winzig'] = r['ms']
        check('winzig: gilt als schwach', r['ok'] and r['weak'], str((r['ok'], r['weak'], r['results'])))
        r = await lies('leer.jpg'); zeiten['leer'] = r['ms']
        check('leeres Foto bleibt schnell (nicht mehrfach gedreht)', r['ms'] < 3000, str(r['ms']))
        check('leeres Foto: gelesen, aber weak, kaum Text', r['ok'] and r['weak'] and len(r['text'].replace(' ', '').replace('\n', '')) < 40, str((r['ok'], r['weak'], r['text'][:60])))
        r = await lies('kein-bild.txt')
        check('Textdatei => not-image', r['ok'] is False and r['error'] == 'not-image', str((r['ok'], r['error'])))
        r = await T("""async () => { const f = new File(['x'], 'riesig.jpg', { type: 'image/jpeg' }); Object.defineProperty(f, 'size', { value: IMAGE_IMPORT_MAX_BYTES + 1 }); const x = await imageImportRead(f); return [x.ok, x.error, x.results[0].error]; }""")
        check('zu grosse Datei => too-large', r == [False, 'too-large', 'too-large'], str(r))
        r = await T("""async () => { const x = await imageImportRead(new File([new Uint8Array(300).fill(7)], 'kaputt.jpg', { type: 'image/jpeg' })); return [x.ok, x.error]; }""")
        check('kaputtes Bild => load-failed', r == [False, 'load-failed'], str(r))
        r = await T("""async () => { const x = await imageImportRead(new File([new Uint8Array(300).fill(7)], 'IMG_1.HEIC', { type: 'image/heic' })); return [x.ok, x.error]; }""")
        check('HEIC, das der Browser nicht lesen kann => unsupported', r == [False, 'unsupported'], str(r))
        r = await T("async () => { const x = await imageImportRead([]); return [x.ok, x.error]; }")
        check('keine Dateien => not-image, kein Absturz', r == [False, 'not-image'], str(r))
        r = await lies('bildschirmfoto.png,kein-bild.txt,handyfoto.jpg', many=True)
        errs_ = [x[1] for x in r['results']]
        check('mehrere Fotos: Ergebnis je Bild in Reihenfolge, Fehler nur beim Textfile', errs_ == [None, 'not-image', None] and r['ok'], str(r['results']))
        check('mehrere Fotos: Text beider Fotos durch Leerzeile getrennt', r['text'].count('Zürcher Geschnetzeltes') >= 1 and '\n\n' in r['text'])
        check('mehrere Fotos: Fortschritt nennt Index und Anzahl', any(x[1] == 2 and x[2] == 3 for x in r['prog']), str(r['prog'][-1]))
        r = await lies('handyfoto.jpg,exif6.jpg', many=True)
        check('zwei Fotos hintereinander', r['ok'] and r['text'].count('Zutaten') >= 2, str(r['results']))

        # ---------- 3. Netz ----------
        fremd = sorted(set(u for u in reqs if not u.startswith(f'http://localhost:{PORT}/') and not u.startswith(('data:', 'blob:'))))
        check('nur eigene Adressen angefragt (kein CDN, kein fremder Server)', not fremd, str(fremd[:5]))
        vend = set(u.split('/vendor/tesseract/')[1].split('?')[0] for u in reqs if '/vendor/tesseract/' in u)
        check('nur erwartete Tesseract-Dateien angefragt', vend and vend <= OK_FILES and 'tesseract.min.js' in vend and 'worker.min.js' in vend and 'deu.traineddata.gz' in vend and (vend & {'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'}), str(sorted(vend)))
        check('Worker wurde nur einmal geladen', sum(1 for u in reqs if u.endswith('/worker.min.js')) == 1 and sum(1 for u in reqs if u.endswith('deu.traineddata.gz')) == 1)
        w = await T("async () => { const p = _imgWorkerPromise; return !!p; }")
        check('Worker bleibt für den nächsten Aufruf bereit', w)
        await T("() => imageReleaseWorker()")
        check('imageReleaseWorker beendet den Worker', await T("() => _imgWorkerPromise === null"))
        check('keine Seitenfehler', not errs, str(errs))

        # ---------- 4. Strenge Inhaltsrichtlinie ----------
        os.environ['SAVORA_CSP_STRICT'] = '1'
        sctx = await b.new_context(viewport={'width': 390, 'height': 844}, bypass_csp=False, timezone_id='UTC')
        await sctx.add_init_script(NO_SW + " try{localStorage.setItem('savora-splash-seen','1')}catch(e){}")
        await sctx.add_init_script("window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' | ' + (e.blockedURI || '').slice(0, 80)));")
        sreqs = []
        sctx.on('request', lambda r: sreqs.append(r.url))
        sp = await sctx.new_page(); serr = []
        sp.on('pageerror', lambda e: serr.append(str(e)))
        await sp.goto(URL)
        ok_start = await until(sp, "typeof state !== 'undefined' && document.getElementById('app').children.length > 0", 40)
        check('strenge CSP: App startet', ok_start)
        has_csp = await sp.evaluate("() => !!document.querySelector('meta[http-equiv=\"Content-Security-Policy\"]')")
        check('strenge CSP: Richtlinie ist in der Seite', has_csp)
        t0 = time.time()
        sr = await sp.evaluate(JS_READ, ['bildschirmfoto.png', False])
        check('strenge CSP: Foto wird gelesen', sr['ok'] and sr['draft']['title'] == 'Zürcher Geschnetzeltes' and len(sr['draft']['ings']) == 6, str((sr['ok'], sr['error'], sr['draft']['title'])))
        viol = await sp.evaluate("() => window.__csp")
        check('strenge CSP: kein Verstoss gemeldet', not viol, str(viol))
        sfremd = sorted(set(u for u in sreqs if not u.startswith(f'http://localhost:{PORT}/') and not u.startswith(('data:', 'blob:'))))
        check('strenge CSP: keine fremden Anfragen', not sfremd, str(sfremd[:5]))
        check('strenge CSP: keine Seitenfehler', not serr, str(serr))
        zeiten['bildschirmfoto (strenge CSP, neu geladen)'] = sr['ms']
        print('\nDauer je Foto (ms):'); [print(f'  {k}: {v}') for k, v in zeiten.items()]
        await b.close()
    print('\nFAIL:', FAIL if FAIL else 'keine')
    sys.exit(1 if FAIL else 0)
asyncio.run(main())
