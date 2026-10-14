"""Bewegung M2: Cover-Wechsel ohne Flackern (Punkt 2) und ruhiger Wechsel der Kochbuch-Schritte (Punkt 5).
Cover: A -> B -> C schnell (B laedt am laengsten): nur A und dann C sind je sichtbar (Pixelprobe pro Frame), das alte Cover bleibt,
bis das neue fertig ist, Ueberblendung kurz, B wird nie gezeichnet; Texteingabe und Regler ohne Ueberblendung; Bildfehler: altes
bleibt, Meldung mit «Erneut versuchen», Export verweigert das Cover statt das alte zu nehmen; gespeicherter Entwurf sofort aktuell.
Schritte: vorwaerts/rueckwaerts mit Positionsmessung (max. 12 px, Richtung), Gesamtdauer, Kopie stumm (aria-hidden, inert, keine IDs),
Fokus auf #cbStepTitle, Doppelklick, Browser-Zurueck waehrend des Wechsels, Bewegung reduzieren (Start und zur Laufzeit),
ohne Web Animations API, keine Konsolenfehler und keine unhandledrejection. Neutrale Testdaten. Port per SAVORA_TEST_PORT."""
import asyncio, base64, os, sys
os.environ.setdefault('SAVORA_TEST_PORT', '9980')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')
GUARD = """() => { window.__rej = []; window.addEventListener('unhandledrejection', (e) => window.__rej.push(String(e.reason))); }"""
STUBS = """() => {
  window.__imp = 0; window.__imgFail = false;
  window.coverImageImport = async (file, key) => { window.__imp++; return { id: 'cover-test-' + window.__imp, w: 1600, h: 1000 }; };
  window.coverImageLoad = async (id) => { if (window.__imgFail) return null; const n = Number(String(id).split('-').pop()) || 1; const c = document.createElement('canvas'); c.width = 1600; c.height = 1000; const x = c.getContext('2d'); x.fillStyle = n % 2 ? '#d33' : '#36c'; x.fillRect(0, 0, 1600, 1000); return c; };
  window.coverImageRemove = async () => {};
}"""
# Pixelprobe: 8 x 10 Punkte der sichtbaren Vorschau
SIG = """(c) => { const x = c.getContext('2d'), d = x.getImageData(0, 0, c.width, c.height).data, out = [];
  for (let j = 1; j <= 10; j++) for (let i = 1; i <= 8; i++) { const px = Math.floor(c.width * i / 9), py = Math.floor(c.height * j / 11), k = (py * c.width + px) * 4; out.push(d[k], d[k + 1], d[k + 2]); }
  return out; }"""

async def new_page(p, w=390, h=844, motion='no-preference'):
    browser = await p.chromium.launch()
    ctx = await browser.new_context(viewport={'width': w, 'height': h}, reduced_motion=motion, timezone_id='UTC')
    await ctx.add_init_script(NO_SW + " try{localStorage.setItem('savora-splash-seen','1')}catch(e){}")
    page = await ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(300)
    await page.evaluate(GUARD); await page.evaluate(STUBS)
    await page.add_style_tag(content='::-webkit-scrollbar{display:none}html{scrollbar-width:none}')
    return browser, page, errs

async def open_step(page, step):
    await page.evaluate("""(s) => { localStorage.removeItem('savora-cookbook-projects'); const c = getCookbookConfig(); c.items = state.recipes.slice(0, 3).map(r => ({ recipeId: r.id, chapterId: '' }));
        c.title = 'Sonntagsküche'; c.subtitle = 'Rezepte für jeden Tag'; c.author = 'Alex Muster'; saveCookbookConfig(c); state.cookbookStep = s; state.view = 'cookbook'; render(); }""", step)
    await page.wait_for_selector('#cbStepTitle'); await page.wait_for_timeout(700)

async def cover_tests(p):
    browser, page, errs = await new_page(p)
    ev = page.evaluate
    await open_step(page, 2)
    await page.click('.cover-opt[data-id="salbei"]'); await page.wait_for_timeout(900)
    # B (lieblingsbuch) laedt 900 ms, C (nachtkueche) 300 ms
    async def slow(route, ms):
        await asyncio.sleep(ms / 1000); await route.continue_()
    await page.route('**/assets/covers/02-lieblingsbuch.png', lambda r: slow(r, 900))
    await page.route('**/assets/covers/05-nachtkueche.png', lambda r: slow(r, 300))
    res = await ev("""async (SIG) => {
      const sig = new Function('return ' + SIG)(), cv = () => document.querySelector('canvas.ce-canvas');
      const draws = []; const orig = coverDraw;
      coverDraw = function (ctx, L) { draws.push({ tpl: L.templateId, cls: ctx.canvas.className || '(neu)' }); return orig.apply(this, arguments); };
      const A = sig(cv()); const frames = []; const t0 = performance.now();
      document.querySelector('.cover-opt[data-id="lieblingsbuch"]').click();
      await new Promise(r => setTimeout(r, 40));
      document.querySelector('.cover-opt[data-id="nachtkueche"]').click();
      const savedNow = getCookbookConfig().cover.templateId, focusOk = document.activeElement === document.body || !!document.activeElement;
      await new Promise((done) => { const loop = () => { const n = document.querySelector('.ce-canvas-next');
        frames.push({ t: performance.now() - t0, s: sig(cv()), next: !!n, op: n ? Number(getComputedStyle(n).opacity) : null, aria: n ? n.getAttribute('aria-hidden') : null, pe: n ? getComputedStyle(n).pointerEvents : null });
        if (performance.now() - t0 < 1500) requestAnimationFrame(loop); else done(); }; requestAnimationFrame(loop); });
      // Referenz C mit derselben Zeichenfunktion und derselben Groesse
      const c = cv(), L = ce.layout, scale = c.width / L.page.w; const ref = await coverRenderCanvas(L, scale); const C = sig(ref);
      coverDraw = orig;
      const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
      return { AC: diff(A, C), frames: frames.map(f => ({ t: Math.round(f.t), next: f.next, op: f.op, aria: f.aria, pe: f.pe, dA: diff(f.s, A), dC: diff(f.s, C) })), draws, savedNow, tpl: ce.model.templateId, nexts: document.querySelectorAll('.ce-canvas-next').length };
    }""", SIG)
    fr = res['frames']
    check('Vorlagen A und C unterscheiden sich sichtbar (Probe aussagekraeftig)', res['AC'] > 8, f"{res['AC']:.1f}")
    check('Gespeicherter Entwurf sofort C (Export nimmt nie den alten Stand)', res['savedNow'] == 'nachtkueche' and res['tpl'] == 'nachtkueche', res['savedNow'])
    bad = [f for f in fr if not (f['dA'] < 1 or f['dC'] < 1 or f['next'])]
    check('Jeder Frame zeigt A oder C (nie B, nie ein halbes Cover)', not bad, str(bad[:3]))
    check('B wurde nie gezeichnet (langsames B ueberschreibt C nicht)', not [d for d in res['draws'] if d['tpl'] == 'lieblingsbuch'], str(res['draws']))
    first_next = next((i for i, f in enumerate(fr) if f['next']), None)
    check('Ueberblendung findet statt (zweite Ebene)', first_next is not None)
    if first_next is not None:
        before = fr[:first_next]
        check('Altes Cover A bleibt sichtbar, bis C fertig geladen ist (> 250 ms)', all(f['dA'] < 1 for f in before) and fr[first_next]['t'] >= 250, f"erste Ebene bei {fr[first_next]['t']} ms")
        layer = [f for f in fr if f['next']]
        dur = layer[-1]['t'] - layer[0]['t']
        check('Ueberblendung kurz (etwa 180 ms, hoechstens 260 ms) und steigend', dur <= 260 and layer[0]['op'] <= layer[-1]['op'], f'{dur} ms, {layer[0]["op"]}->{layer[-1]["op"]}')
        check('Zweite Ebene stumm: aria-hidden, keine Zeigerereignisse', all(f['aria'] == 'true' and f['pe'] == 'none' for f in layer))
        after = [f for f in fr if f['t'] > layer[-1]['t']]
        check('Nach der Ueberblendung zeigt die Hauptebene C, auch nachdem B fertig ist (1500 ms)', after and all(f['dC'] < 1 for f in after), f"{after[-1] if after else ''}")
    check('Zusatzebene aufgeraeumt', res['nexts'] == 0)
    # Texteingabe und Regler: keine Ueberblendung
    await ev("() => { window.__nx = 0; new MutationObserver((ms) => ms.forEach(m => m.addedNodes.forEach(n => { if (n.classList && n.classList.contains('ce-canvas-next')) window.__nx++; }))).observe(document.querySelector('.ce-preview'), { childList: true }); }")
    await page.click('#cbTitle'); await page.keyboard.type(' neu', delay=40); await page.wait_for_timeout(300)
    await ev("() => { ceSelect('title'); }"); await page.wait_for_timeout(200)
    rng = await ev("() => { const r = document.querySelector('input[type=range][data-ce-input]'); if (!r) return false; for (let i = 0; i < 5; i++) { r.value = String(Number(r.min) + (i + 2) * (Number(r.max) - Number(r.min)) / 10); r.dispatchEvent(new Event('input', { bubbles: true })); } return true; }")
    await page.wait_for_timeout(300)
    check('Texteingabe und Regler zeichnen direkt, ohne Ueberblendung', rng and await ev('() => window.__nx') == 0, f'Regler gefunden: {rng}')
    check('Fokus bleibt im Titelfeld waehrend des Tippens', await ev("() => document.activeElement && document.activeElement.id") == 'cbTitle')
    # Bildfehler: altes bleibt, Meldung, Export verweigert
    await page.click('[data-ce="mode"][data-v="custom"]'); await page.wait_for_timeout(500)
    await page.set_input_files('[data-ce-file]', files=[{'name': 'eins.png', 'mimeType': 'image/png', 'buffer': PNG}]); await page.wait_for_timeout(900)
    before = await ev(f"() => ({SIG})(document.querySelector('canvas.ce-canvas'))")
    await ev("() => { window.__imgFail = true; }")
    await page.set_input_files('[data-ce-file]', files=[{'name': 'zwei.png', 'mimeType': 'image/png', 'buffer': PNG}]); await page.wait_for_timeout(900)
    st = await ev(f"""async () => {{ const s = ({SIG})(document.querySelector('canvas.ce-canvas')); const e = document.querySelector('.ce-painterr');
        let exp = 'ok'; try {{ await coverRenderCanvas(coverLayout(coverInputFromConfig(getCookbookConfig())), 0.5); }} catch (x) {{ exp = x.userMessage || String(x); }}
        return {{ s, msg: e ? e.textContent : '', role: e ? e.getAttribute('role') : '', retry: !!document.querySelector('[data-ce="paint-retry"]'), flag: ceRoot().dataset.paint || '', exp, img: ce.model.image && ce.model.image.id, next: document.querySelectorAll('.ce-canvas-next').length }}; }}""")
    same = sum(abs(a - b) for a, b in zip(before, st['s'])) / len(before)
    check('Bildfehler: vorheriges Cover bleibt unveraendert sichtbar', same < 1 and st['next'] == 0, f'{same:.2f}')
    check('Bildfehler: verstaendliche Meldung (role=alert) mit «Erneut versuchen»', 'nicht geladen' in st['msg'] and st['role'] == 'alert' and st['retry'] and st['flag'] == 'error', st['msg'][:90])
    check('Bildfehler: Export nimmt nicht das alte Cover, sondern meldet den Fehler', st['exp'] != 'ok' and 'Bild' in st['exp'], st['exp'][:80])
    await ev("() => { window.__imgFail = false; }")
    await page.click('[data-ce="paint-retry"]'); await page.wait_for_timeout(700)
    after = await ev(f"() => ({{ s: ({SIG})(document.querySelector('canvas.ce-canvas')), err: !!document.querySelector('.ce-painterr'), flag: ceRoot().dataset.paint || '' }})")
    moved = sum(abs(a - b) for a, b in zip(before, after['s'])) / len(before)
    check('Erneut versuchen: neues Bild erscheint, Meldung verschwindet', moved > 3 and not after['err'] and not after['flag'], f'{moved:.1f}')
    rej = await ev('() => window.__rej')
    check('Cover: keine Konsolenfehler, keine unhandledrejection', not errs and not rej, str(errs[:3] + rej[:3]))
    await browser.close()

STEP_PROBE = """async (sel) => {
  const t0 = performance.now(), out = [];
  const content = () => Array.from(document.querySelector('main.cookbook-main').children).find(n => !n.matches('.cb-steps, .cb-step-footer, [data-motion-ghost]'));
  document.querySelector(sel).click();
  const imm = { step: state.cookbookStep, focus: document.activeElement && document.activeElement.id, ghost: !!document.querySelector('.cb-step-ghost') };
  const g = document.querySelector('.cb-step-ghost');
  if (g) { imm.gAria = g.getAttribute('aria-hidden'); imm.gInert = g.inert; imm.gIds = g.querySelectorAll('[id]').length; imm.gLive = g.querySelectorAll('[aria-live], [role=status], [role=alert]').length; imm.titles = document.querySelectorAll('#cbStepTitle').length; }
  await new Promise((done) => { const loop = () => { const c = content(), m = new DOMMatrixReadOnly(getComputedStyle(c).transform === 'none' ? undefined : getComputedStyle(c).transform);
    out.push({ t: performance.now() - t0, x: m.m41, op: Number(getComputedStyle(c).opacity), ghost: !!document.querySelector('.cb-step-ghost'), anims: document.getAnimations().filter(a => a.playState === 'running').length, ov: document.documentElement.scrollWidth > document.documentElement.clientWidth });
    if (performance.now() - t0 < 450) requestAnimationFrame(loop); else done(); }; requestAnimationFrame(loop); });
  return { imm, out, cur: document.querySelector('.cb-steps [aria-current=step]').closest('button').dataset.id, anim: !!document.querySelector('.cb-anim') };
}"""

def step_checks(label, r, want, sign):
    imm, out = r['imm'], r['out']
    check(f'{label}: Schritt und Fortschritt sofort {want}, Fokus am Schritttitel', imm['step'] == want and r['cur'] == str(want) and imm['focus'] == 'cbStepTitle', str(imm))
    check(f'{label}: ausgehender Inhalt stumm (aria-hidden, inert, keine IDs, keine Live-Regionen, ein Titel)', imm.get('ghost') and imm.get('gAria') == 'true' and imm.get('gInert') and imm.get('gIds') == 0 and imm.get('gLive') == 0 and imm.get('titles') == 1, str(imm))
    xs = [o['x'] for o in out if abs(o['x']) > 0.01]
    check(f'{label}: neuer Inhalt kommt von {"rechts" if sign > 0 else "links"}, hoechstens 12 px', xs and all(0 < x * sign <= 12.01 for x in xs), str([round(x, 1) for x in xs[:6]]))
    # gemessen ab dem ersten Frame nach dem (synchronen) Neuzeichnen: die Animation selbst, nicht die Renderzeit der Seite
    end = next((o['t'] for o in out if not o['ghost'] and o['anims'] == 0 and abs(o['x']) < 0.01 and o['op'] > 0.999), None)
    dur = end - out[0]['t'] if end is not None else None
    check(f'{label}: Bewegung fertig nach hoechstens 220 ms (+ Frames), Kopie und Hilfsklasse entfernt', dur is not None and dur <= 260 and not r['anim'], f'{dur and round(dur)} ms (Render {round(out[0]["t"])} ms)')
    check(f'{label}: kein horizontaler Ueberlauf waehrend des Wechsels', not any(o['ov'] for o in out))

async def step_tests(p):
    browser, page, errs = await new_page(p, 390, 844)
    ev = page.evaluate
    await open_step(page, 1)
    r = await ev(STEP_PROBE, '.cb-step-footer .primary-btn')
    step_checks('Vorwaerts 1->2', r, 2, 1)
    await page.fill('#cbTitle', 'Mein Buch'); await page.wait_for_timeout(700)
    r = await ev(STEP_PROBE, '.cb-step-footer .primary-btn')
    step_checks('Vorwaerts 2->3', r, 3, 1)
    r = await ev(STEP_PROBE, '.cb-step-footer .ghost-btn')
    step_checks('Rueckwaerts 3->2', r, 2, -1)
    check('Zurueck erhaelt die Eingabe', await page.input_value('#cbTitle') == 'Mein Buch')
    # Doppelklick auf Weiter: genau ein Schritt
    await open_step(page, 1)
    await page.dblclick('.cb-step-footer .primary-btn'); await page.wait_for_timeout(400)
    check('Doppelklick auf Weiter springt nur einen Schritt', await ev('() => state.cookbookStep') == 2 and await ev("() => document.querySelector('.cb-steps [aria-current=step]').closest('button').dataset.id") == '2')
    # Browser-Zurueck waehrend des Wechsels
    await ev("() => { state.view = 'cookbooks'; render(); }"); await page.wait_for_timeout(300)
    await open_step(page, 1)
    await ev("() => { document.querySelector('.cb-step-footer .primary-btn').click(); history.back(); }")
    await page.wait_for_timeout(500)
    st = await ev("() => ({ view: state.view, step: state.cookbookStep, cur: (document.querySelector('.cb-steps [aria-current=step]') || { closest: () => ({ dataset: {} }) }).closest('button').dataset.id || null, ghost: document.querySelectorAll('.cb-step-ghost').length, anim: document.querySelectorAll('.cb-anim').length })")
    check('Browser-Zurueck waehrend des Wechsels: keine Reste, kein falscher Schritt', st['ghost'] == 0 and st['anim'] == 0 and (st['view'] != 'cookbook' or st['cur'] == str(st['step'])), str(st))
    # Bewegung reduzieren waehrend eines laufenden Wechsels
    await open_step(page, 1)
    mid = await ev("""async () => { document.querySelector('.cb-step-footer .primary-btn').click(); const had = !!document.querySelector('.cb-step-ghost'); return had; }""")
    await page.emulate_media(reduced_motion='reduce'); await page.wait_for_timeout(60)
    st = await ev("() => ({ ghost: document.querySelectorAll('.cb-step-ghost').length, anims: document.getAnimations().filter(a => a.playState === 'running').length, step: state.cookbookStep })")
    check('Bewegung reduzieren zur Laufzeit: laufender Wechsel endet sofort', mid and st['ghost'] == 0 and st['anims'] == 0 and st['step'] == 2, str(st))
    r = await ev(STEP_PROBE, '.cb-step-footer .primary-btn')
    check('Bewegung reduzieren: Wechsel ohne Kopie und ohne Versatz, Fokus am Titel', not r['imm']['ghost'] and all(abs(o['x']) < 0.01 and o['op'] > 0.999 for o in r['out']) and r['imm']['focus'] == 'cbStepTitle' and r['imm']['step'] == 3)
    await page.emulate_media(reduced_motion='no-preference')
    # Ohne Web Animations API: sofort Endzustand
    await open_step(page, 1)
    await ev("() => { window.__anim = Element.prototype.animate; Element.prototype.animate = undefined; }")
    r = await ev(STEP_PROBE, '.cb-step-footer .primary-btn')
    check('Ohne Web Animations API: Schritt sofort richtig, keine Kopie', r['imm']['step'] == 2 and not r['imm']['ghost'] and r['cur'] == '2')
    await page.click('.cover-opt[data-id="tomate"]'); await page.wait_for_timeout(900)
    check('Ohne Web Animations API: Coverwechsel sofort, keine Zusatzebene', await ev("() => document.querySelectorAll('.ce-canvas-next').length") == 0 and await ev("() => ce.model.templateId") == 'tomate')
    await ev("() => { Element.prototype.animate = window.__anim; }")
    rej = await ev('() => window.__rej')
    check('Schritte: keine Konsolenfehler, keine unhandledrejection', not errs and not rej, str(errs[:3] + rej[:3]))
    await browser.close()
    # Grosse Ansicht: Vorwaerts mit Messung
    browser, page, errs = await new_page(p, 1440, 900)
    await open_step(page, 1)
    r = await page.evaluate(STEP_PROBE, '.cb-step-footer .primary-btn')
    step_checks('1440 px vorwaerts 1->2', r, 2, 1)
    check('1440 px: keine Konsolenfehler', not errs, str(errs[:3]))
    await browser.close()

async def main():
    async with async_playwright() as p:
        await cover_tests(p)
        await step_tests(p)
    print('\nERGEBNIS:', 'ALLES OK' if not FAIL else f'{len(FAIL)} FEHLER: {FAIL}')
    sys.exit(1 if FAIL else 0)

asyncio.run(main())
