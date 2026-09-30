"""Affentest: festes Zufallsmuster klickt und tippt wahllos durch die App. Es darf kein Seiten- oder Konsolenfehler auftreten und die Rezepte muessen erhalten bleiben."""
import sys, asyncio, random, time, collections
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
WORDS = ['Test', '250 g Mehl', '½ TL Salz', 'Ä<b>ö</b>', 'x'*200, '', '   ', '0', '-5', '1/0', 'Kuchen', '🍋 Zitrone', 'a&b', '"quote"']
async def monkey(width, height, seed, steps):
    rnd = random.Random(seed)
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={'width': width, 'height': height}, has_touch=(width < 500), reduced_motion='reduce', timezone_id='UTC')
        await ctx.add_init_script(NO_SW + " try{localStorage.setItem('savora-splash-seen','1')}catch(e){}")
        page = await ctx.new_page(); errs = collections.Counter(); samples = {}
        def note(kind, msg):
            key = kind + ': ' + msg[:140]; errs[key] += 1; samples.setdefault(key, (kind, msg[:300]))
        page.on('pageerror', lambda e: note('pageerror', str(e)))
        page.on('console', lambda m: note('console', m.text) if m.type == 'error' else None)
        page.on('dialog', lambda d: asyncio.ensure_future(d.accept() if rnd.random() < 0.5 else d.dismiss()))
        page.on('filechooser', lambda fc: None)
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(500)
        actions = 0
        for i in range(steps):
            try:
                els = await page.query_selector_all('[data-action], button, input:not([type=file]), textarea, select, summary, [role=tab]')
                els = [e for e in els if await e.is_visible()]
                if not els:
                    await page.evaluate("() => { state.modal = null; state.view = 'home'; render(); }"); continue
                el = rnd.choice(els)
                tag = await el.evaluate("e => e.tagName")
                if tag in ('INPUT', 'TEXTAREA'):
                    t = await el.get_attribute('type')
                    if t in ('checkbox', 'radio'): await el.click(timeout=1500)
                    else: await el.fill(rnd.choice(WORDS) if t not in ('number',) else str(rnd.choice([0, 1, 5, 99, -3])), timeout=1500)
                elif tag == 'SELECT':
                    opts = await el.evaluate("e => Array.from(e.options).map(o => o.value)")
                    if opts: await el.select_option(rnd.choice(opts), timeout=1500)
                else:
                    await el.click(timeout=1500, force=True)
                actions += 1
                await page.wait_for_timeout(rnd.choice([30, 60, 120]))
                if rnd.random() < 0.06: await page.keyboard.press('Escape')
                if not page.url.startswith(f'http://localhost:{PORT}'):   # aus der App herausnavigiert (z.B. History-Ende): zurueckkehren und merken
                    note('left-app', page.url[:80] + ' nach Aktion ' + str(i)); await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(300)
            except Exception as e:
                msg = str(e).split('\n')[0]
                if 'Timeout' not in msg and 'detached' not in msg and 'Target' not in msg and 'navigat' not in msg.lower():
                    note('harness', msg)
        alive = await page.evaluate("document.getElementById('app').children.length > 0")
        rec = await page.evaluate("dbGetAll().then(l => l.length)")
        await browser.close()
        return actions, errs, samples, alive, rec
async def main():
    bad = []
    for width, height, seed in [(390, 844, 11), (1280, 800, 12), (320, 640, 13)]:
        actions, errs, samples, alive, rec = await monkey(width, height, seed, 120)
        app_errs = {k: v for k, v in samples.items() if v[0] in ('pageerror', 'console') and not v[1].startswith('Failed to load resource')}   # reine Netzwerkmeldungen beim Laden zaehlen nicht
        ok = alive and not app_errs and rec >= 1
        print(('OK   ' if ok else 'FEHL ') + f'Affentest {width} px (Muster {seed}): {actions} Aktionen, App lebt: {alive}, Rezepte: {rec}', [v[1][:120] for v in app_errs.values()][:2])
        if not ok: bad.append((width, seed))
    print('\nFEHLGESCHLAGEN:', bad or 'keine')
    sys.exit(1 if bad else 0)
asyncio.run(main())
