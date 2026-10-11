"""Hilfsmodul fuer test_paket42: richtet eine Savora-Seite mit Testdaten ein und fotografiert alle wichtigen Ansichten.
Wird auch fuer die Vorher/Nachher-Bilder genutzt. Alle Testdaten bleiben lokal im Testbrowser (Titel beginnen mit TEST:)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *

PASTE_LONG = """TEST: Überbackene Kartoffel-Zucchini-Gratin-Spezialität mit Rosmarin, Ziegenkäse und karamellisierten Zwiebeln

Zutaten:
800 g Kartoffeln
2 Zucchini
200 g Ziegenkäse
2 Zwiebeln
3 EL Olivenöl
2 Zweige Rosmarin
2 dl Rahm
1 TL Salz
Pfeffer

Zubereitung:
1. Kartoffeln und Zucchini in dünne Scheiben schneiden.
2. Zwiebeln im Olivenöl langsam goldbraun und weich dünsten.
3. Alles schichtweise in eine Gratinform geben, mit Rahm übergiessen und mit Rosmarin würzen.
4. Den Ziegenkäse darüber bröckeln und 45 Minuten bei 180 Grad backen.

Für 4 Personen, 70 Minuten"""

EXTRA = r"""async () => {
  const s = emptyRecipe(); s.id = 'r_test_short'; s.title = 'TEST: Kurzes Rezept'; s.servings = 2;
  s.ingredients = [{amount:'1', unit:'', name:'Ei'}]; s.steps = [{text:'Braten.'}];
  await dbPut(s);
  await loadRecipes();
  const today = fmtDateKey(new Date());
  await savePlanEntries(today, [{id:'e1', recipeId:'r_legacy_2', meal:'', servings:null}, {id:'e2', type:'note', text:'TEST: Reste vom Sonntag', meal:''}]);
  await dbPutShopping({ id:'s_t1', name:'TEST: Butter', amount:1, unit:'Stk', checked:false, recipeId:null, createdAt:1700000000000 });
  await dbPutShopping({ id:'s_t2', name:'TEST: Mehl', amount:500, unit:'g', checked:true, recipeId:null, createdAt:1700000000001 });
  await loadShopping(); await loadMealplan();
  return true;
}"""
THEMES = {'light': ('light', 'light'), 'dark': ('dark', 'dark')}  # seit 0.70.2 ohne 'amoled'

# (Name, JS, Wartezeit)  – JS laeuft in page.evaluate; danach render()
def views(long_id):
    ed = lambda rid, step: f"openForm(JSON.parse(JSON.stringify(state.recipes.find(r=>r.id==='{rid}')))); state.formStep={step}"
    v = [
        ('home', "state.view='home';state.homeLayout='grid'"),
        ('home-list', "state.view='home';state.homeLayout='list'"),
        ('detail-long', f"state.view='detail';state.activeRecipeId='{long_id}';state.detailTab='ingredients'"),
        ('detail-photo', "state.view='detail';state.activeRecipeId='r_legacy_1';state.detailTab='ingredients'"),
        ('detail-short', "state.view='detail';state.activeRecipeId='r_test_short';state.detailTab='ingredients'"),
    ]
    for n in range(5):
        v.append((f'edit-{n}', ed(long_id, n)))
    v.append(('edit-short-0', ed('r_test_short', 0)))
    v += [
        ('import', "state.view='paste-import'"),
        ('settings', "state.view='settings'"), ('settings-data', "state.view='settings-data'"),
        ('settings-display', "state.view='settings-display'"), ('settings-share', "state.view='settings-share'"),
        ('settings-help', "state.view='settings-help'"), ('settings-about', "state.view='settings-about'"),
        ('mealplan', "state.view='mealplan'"), ('shopping', "state.view='shopping'"),
        ('cookbooks', "state.view='cookbooks'"),
        ('cookbook1', "state.view='cookbook';state.cookbookStep=1"), ('cookbook2', "state.view='cookbook';state.cookbookStep=2"),
        ('cookbook3', "state.view='cookbook';state.cookbookStep=3"),
        ('cook', f"state.view='cookmode';state.activeRecipeId='{long_id}';state.cookStepIndex=0;state.cookFinished=false;state.cookAllSteps=false"),
    ]
    return v

EMPTY_VIEWS = [('empty-home', "state.view='home'"), ('empty-shopping', "state.view='shopping'"), ('empty-mealplan', "state.view='mealplan'"),
               ('empty-cookbooks', "state.view='cookbooks'"), ('empty-import', "state.view='paste-import'")]

FREEZE = """.legal-stand, .toast { visibility: hidden !important; } * { caret-color: transparent !important; animation: none !important; transition: none !important; scroll-behavior: auto !important; }"""

async def new_page(browser, w, h, theme, seeded=True):
    t, scheme = THEMES[theme]
    ctx = await browser.new_context(viewport={'width': w, 'height': h}, reduced_motion='reduce', timezone_id='UTC', color_scheme=scheme, locale='de-CH')
    await ctx.add_init_script(NO_SW + " try{localStorage.setItem('savora-splash-seen','1')}catch(e){}")
    # Zufall fest (der Kochbuch-Entwurf waehlt sonst ein zufaelliges Titelbild): beide Staende sehen dasselbe
    await ctx.add_init_script("(() => { let a = 12345; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();")
    import datetime
    await ctx.clock.set_fixed_time(datetime.datetime(2026, 10, 12, 10, 0, 0))   # feste Uhrzeit: Ids, Datumsangaben und «Heute» sind in beiden Staenden gleich
    page = await ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    await goto(page)
    long_id = None
    if seeded:
        await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(300)
        await page.evaluate(EXTRA); await page.wait_for_timeout(200)
        # Import ueber die Oberflaeche
        await page.evaluate("() => { state.view='paste-import'; render(); }"); await page.wait_for_timeout(300)
        await page.fill('#pasteText', PASTE_LONG)
        await page.evaluate("document.querySelector('[data-action=do-paste-import]').click()"); await page.wait_for_timeout(700)
        await page.evaluate("document.querySelector('[data-action=save-recipe]').click()"); await page.wait_for_timeout(700)
        long_id = await page.evaluate("() => (state.recipes.find(r => r.title.startsWith('TEST: Überbackene')) || {}).id")
        await page.evaluate("() => { cookbookCreate('TEST: Familienkochbuch'); state.cookbookStep = 1; render(); }")
    await page.evaluate(f"() => {{ state.theme='{t}'; applyTheme(); }}")
    await page.add_style_tag(content=FREEZE)
    return ctx, page, errs, long_id

async def shot(page, js, path, full=True):
    await page.evaluate("() => { " + js + "; render(); }")
    await page.wait_for_timeout(450)
    await page.evaluate("() => { const a = document.activeElement; if (a && a !== document.body) a.blur(); window.scrollTo(0,0); }")
    # Erst fotografieren, wenn zwei Aufnahmen hintereinander gleich sind (Bilder fertig dekodiert, nichts mehr in Bewegung)
    await page.evaluate("() => { document.querySelectorAll('img[loading=lazy]').forEach(i => { i.loading = 'eager'; }); }")
    for _ in range(40):   # bis alle Bilder geladen sind (hoechstens 4 s)
        if await page.evaluate("() => Array.from(document.images).every(i => i.complete)"): break
        await page.wait_for_timeout(100)
    await page.evaluate("() => Promise.all(Array.from(document.images).map(i => i.decode ? i.decode().catch(() => {}) : null))")
    prev = None
    for _ in range(6):
        cur = await page.screenshot(full_page=full, animations='disabled', caret='hide')
        if cur == prev: break
        prev = cur; await page.wait_for_timeout(150)
    open(path, 'wb').write(cur)

async def capture(site_dir, outdir, sizes, themes, full=True, only=None):
    """Fotografiert alle Ansichten fuer die Groessen und Darstellungen. Gibt die Liste der Dateipfade zurueck."""
    SITE.set_dir(site_dir)
    os.makedirs(outdir, exist_ok=True)
    paths = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for (w, h) in sizes:
            for theme in themes:
                ctx, page, errs, long_id = await new_page(b, w, h, theme, True)
                for name, js in views(long_id):
                    if only and name not in only: continue
                    f = os.path.join(outdir, f'{w}x{h}-{theme}-{name}.png'); await shot(page, js, f, full and name != 'cook'); paths.append(f)
                await ctx.close()
                ctx, page, errs, _ = await new_page(b, w, h, theme, False)
                for name, js in EMPTY_VIEWS:
                    if only and name not in only: continue
                    f = os.path.join(outdir, f'{w}x{h}-{theme}-{name}.png'); await shot(page, js, f, full); paths.append(f)
                await ctx.close()
        await b.close()
    return paths
