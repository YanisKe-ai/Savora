"""Paket 37 (Anpassung): Smartphone, Tablet und Desktop.
Misst ueber alle geaenderten Ansichten x Breiten (360, 390, 768, 1024, 1280) x Darstellungen (Hell, Dunkel, Schwarz, «Wie dein Gerät» hell/dunkel)
und mit grosser Systemschrift (24 px): seitlicher Ueberlauf, Tippflaechen >= 44 px, Text-Kontrast >= 4.5:1 (gross 3:1), kleinste Schrift >= 14 px,
abgeschnittene Texte. Dazu: genau ein Einstellungsweg je Breite, Cover-Auswahl (zehn Cover), sehr langer Titel/lange Zutatenliste, «Heute geplant».
Testdaten: tests/seed.js, erweitert per page.evaluate (nichts davon steht im Repo)."""
import asyncio, sys, os, json
os.environ.setdefault('SAVORA_TEST_PORT', '8852')
QUICK = bool(os.environ.get('SAVORA_ADAPT_QUICK'))
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

EXTRA = r"""async () => {
  const long = emptyRecipe(); long.id = 'r_long'; long.title = 'Überbackene Kartoffel-Zucchini-Gratin-Spezialität mit Rosmarin, Ziegenkäse und karamellisierten Zwiebeln nach Grossmutters Hausrezept Superlangeswortohneleerzeichenumdenumbruchzutesten';
  long.servings = 4; long.timeMinutes = 95; long.tags = ['Hauptgericht','Langzeitgaren','Familienessen','Sonntagsbraten-Variante'];
  long.ingredients = [{amount:'',unit:'',name:'Für die Kartoffelschicht:'}];
  for (let i = 1; i <= 38; i++) long.ingredients.push({amount:String(i*25), unit:'g', name:'Zutat Nummer ' + i + ' sehr lange Beschreibung mit Zusatz, fein gehackt und zimmerwarm'});
  long.steps = []; for (let i = 1; i <= 12; i++) long.steps.push({text:'Schritt ' + i + ': Alles gut vermengen und bei 180 Grad Ober-/Unterhitze etwa 20 Minuten backen, bis die Oberfläche goldbraun ist. Zwischendurch mit dem Fond übergiessen und Superlangeswortohneleerzeichenumdenumbruchzutesten beachten.'});
  long.notes = 'Lange Notiz '.repeat(30);
  await dbPut(long);
  await loadRecipes();
  const today = fmtDateKey(new Date());
  await savePlanEntries(today, [{id:'e1', recipeId:'r_legacy_2', meal:'', servings:null}, {id:'e2', type:'note', text:'Reste vom Sonntag essen', meal:''}, {id:'e3', recipeId:'r_long', meal:'', servings:null}]);
  await dbPutShopping({ id:'s_l1', name:'Zutat Nummer 7 sehr lange Beschreibung mit Zusatz, fein gehackt und zimmerwarm', amount:175, unit:'g', checked:false, recipeId:'r_long', createdAt:Date.now() });
  await dbPutShopping({ id:'s_l2', name:'Superlangeswortohneleerzeichenumdenumbruchzutesten', amount:2, unit:'', checked:false, recipeId:null, createdAt:Date.now() });
  await dbPutShopping({ id:'s_l3', name:'Butter', amount:1, unit:'Stk', checked:true, recipeId:null, createdAt:Date.now() });
  await loadShopping(); await loadMealplan();
  cookbookCreate('Mein allerliebstes Familienkochbuch mit sehr vielen Lieblingsrezepten aus drei Generationen');
  const s = cookbookStoreRead(); state.cookbookStep = 1;
  render(); return true;
}"""
VIEWS = [
 ('home',"state.view='home';state.homeLayout='grid'"),
 ('homelist',"state.view='home';state.homeLayout='list'"),
 ('detail',"state.view='detail';state.activeRecipeId='r_legacy_1';state.detailTab='ingredients'"),
 ('detailnophoto',"state.view='detail';state.activeRecipeId='r_legacy_3';state.detailTab='ingredients'"),
 ('detaillong',"state.view='detail';state.activeRecipeId='r_long';state.detailTab='ingredients'"),
 ('cook',"state.view='cookmode';state.activeRecipeId='r_legacy_1';state.cookStepIndex=0;state.cookFinished=false;state.cookAllSteps=false"),
 ('cooklong',"state.view='cookmode';state.activeRecipeId='r_long';state.cookStepIndex=0;state.cookFinished=false;state.cookAllSteps=false"),
 ('mealplan',"state.view='mealplan'"),
 ('shopping',"state.view='shopping'"),
 ('cookbooks',"state.view='cookbooks'"),
 ('cb1',"state.view='cookbook';state.cookbookStep=1"),
 ('cb2',"state.view='cookbook';state.cookbookStep=2"),
 ('cb3',"state.view='cookbook';state.cookbookStep=3"),
 ('settings',"state.view='settings'"),
 ('sdisplay',"state.view='settings-display'"),
 ('sshare',"state.view='settings-share'"),
 ('sbackup',"state.view='settings-backup'"),
 ('paste',"state.view='paste-import'"),
]
PASTE = "Gemüsesuppe\n\nZutaten:\n200 g Karotten\n1 Zwiebel\nSalz\n\nZubereitung:\n1. Gemüse schneiden.\n2. 20 Minuten kochen.\n\nFür 4 Personen, 30 Minuten"
THEMES = {'light':('light','light'), 'dark':('dark','dark'), 'amoled':('amoled','dark'), 'auto-light':('auto','light'), 'auto-dark':('auto','dark')}
async def setup(browser, w, h, theme, big=False):
    t, scheme = THEMES[theme]
    ctx = await browser.new_context(viewport={'width':w,'height':h}, reduced_motion='reduce', timezone_id='UTC', color_scheme=scheme)
    await ctx.add_init_script(NO_SW+" try{localStorage.setItem('savora-splash-seen','1')}catch(e){}")
    page = await ctx.new_page(); errs=[]
    page.on('pageerror', lambda e: errs.append(str(e)))
    await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(300)
    await page.evaluate(EXTRA); await page.wait_for_timeout(200)
    await page.evaluate(f"() => {{ state.theme='{t}'; applyTheme(); }}")
    if big: await page.evaluate("document.documentElement.style.fontSize='24px'")
    return ctx, page, errs
async def show(page, js, wait=400):
    await page.evaluate("() => { "+js+"; render(); }"); await page.wait_for_timeout(wait)
async def show_import(page):
    await show(page, "state.view='paste-import'")
    await page.fill('#pasteText', PASTE)
    await page.evaluate("document.querySelector('[data-action=do-paste-import]').click()"); await page.wait_for_timeout(600)
JS_ALL = r"""() => {
  const out = {overflow:null, taps:[], minfont:null, contrast:[], clipped:[], navs:null};
  out.overflow = [document.documentElement.scrollWidth, window.innerWidth];
  const sel = 'button, a[href], [role=button], [role=tab], [role=radio], [role=checkbox], summary, select, input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea';
  for (const el of document.querySelectorAll('#app *')) {
    if (el.matches(sel)) {
      if (el.closest('.sr-only') || el.matches('.sr-only,.timer-chip,.sheet-handle') || (el.tagName==='A' && el.closest('.source-line,.legal-card,p'))) {} else {
      const cs = getComputedStyle(el); if (cs.visibility!=='hidden' && cs.display!=='none') { const r = el.getBoundingClientRect(); if ((r.width||r.height) && (r.width<43.5||r.height<43.5)) out.taps.push((el.className||el.tagName)+' '+Math.round(r.width)+'x'+Math.round(r.height)+' '+(el.getAttribute('aria-label')||el.textContent.trim().slice(0,18))); } }
    }
  }
  const parse=(s)=>{let m=s.match(/rgba?\(([^)]+)\)/); if(m){const v=m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return {r:v[0],g:v[1],b:v[2],a:v[3]===undefined?1:v[3]};} m=s.match(/color\(srgb ([^)]+)\)/); if(m){const v=m[1].split(/[ \/]+/).filter(Boolean).map(Number); return {r:v[0]*255,g:v[1]*255,b:v[2]*255,a:v[3]===undefined?1:v[3]};} return null;};
  const lum=(c)=>{const f=(x)=>{x/=255;return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4)};return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b)};
  const blend=(t,b)=>({r:t.r*t.a+b.r*(1-t.a),g:t.g*t.a+b.g*(1-t.a),b:t.b*t.a+b.b*(1-t.a),a:1});
  const bgOf=(el)=>{let stack=[],img=false;for(let e=el;e;e=e.parentElement){const cs=getComputedStyle(e);if(cs.backgroundImage&&cs.backgroundImage!=='none')img=true;const c=parse(cs.backgroundColor);if(c&&c.a>0){stack.push(c);if(c.a>=1)break;}}let base={r:255,g:255,b:255,a:1};for(let i=stack.length-1;i>=0;i--)base=blend(stack[i],base);base.img=img;return base;};
  let min=999,who='';
  for (const el of document.querySelectorAll('#app *')) {
    const own = Array.from(el.childNodes).some(n=>n.nodeType===3&&n.textContent.trim()); if(!own||el.closest('.sr-only')) continue;
    const r=el.getBoundingClientRect(); if(!r.width||!r.height) continue;
    const cs=getComputedStyle(el); if(cs.visibility==='hidden'||cs.display==='none') continue;
    const fs=parseFloat(cs.fontSize);
    if(!el.closest('.chip-count,.nav-badge,.filter-count-badge') && fs<min){min=fs;who=(el.className||el.tagName)+':'+el.textContent.trim().slice(0,24);}
    if (el.disabled || el.closest('[disabled]') || cs.opacity < 1 || el.closest('[aria-disabled=true]')) continue;
    const bg=bgOf(el); if(bg.img) continue;
    const fg=parse(cs.color); if(!fg) continue;
    const l1=lum(blend(fg,bg)),l2=lum(bg),cr=(Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
    const large = fs>=24 || (fs>=18.66 && parseInt(cs.fontWeight)>=700);
    if (cr < (large?3:4.5)) out.contrast.push((el.className||el.tagName)+' '+(Math.round(cr*100)/100)+' "'+el.textContent.trim().slice(0,20)+'"');
    if (el.scrollWidth>el.clientWidth+2 && ['hidden','clip'].includes(cs.overflowX) && cs.textOverflow!=='ellipsis') out.clipped.push((el.className||el.tagName)+' '+el.scrollWidth+'>'+el.clientWidth);
    if (cs.textOverflow==='ellipsis' && el.scrollWidth>el.clientWidth+2) out.clipped.push('ELLIPSIS '+(el.className||el.tagName)+' '+el.textContent.trim().slice(0,20));
  }
  out.minfont=[min,who];
  out.navs = {gear: Array.from(document.querySelectorAll('[aria-label=Einstellungen], .nav-settings')).filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'}).map(e=>e.className)};
  out.nav = {bottom: (()=>{const n=document.querySelector('.bottom-nav');if(!n)return null;const r=n.getBoundingClientRect();return [Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)]})()};
  return out;
}"""

HEIGHTS = {360: 740, 390: 844, 768: 1024, 1024: 768, 1280: 800}
# Absichtlich unsichtbare oder einzeilig abgekuerzte Kopfzeilentitel (voller Titel steht darunter bzw. in der Liste)
IGNORE_CLIP = ('topbar-title', 'form-step-label', 'plan-day-long', 'plan-add-label')   # plan-add-label: absichtlich nur fuer Screenreader sichtbar
TABS = ('home', 'mealplan', 'shopping', 'cookbooks')

async def scan(page, key):
    r = await page.evaluate(JS_ALL)
    check(f'{key}: kein seitlicher Ueberlauf', r['overflow'][0] <= r['overflow'][1] + 1, str(r['overflow']))
    check(f'{key}: Tippflaechen mindestens 44 px', not r['taps'], str(r['taps'][:4]))
    check(f'{key}: kleinste Schrift mindestens 14 px (ausser Zaehler)', r['minfont'][0] >= 13.99, str(r['minfont']))
    check(f'{key}: Text-Kontrast mindestens 4.5:1 (gross 3:1)', not r['contrast'], str(r['contrast'][:4]))
    clip = [c for c in r['clipped'] if not any(i in c for i in IGNORE_CLIP)]
    check(f'{key}: nichts abgeschnitten', not clip, str(clip[:4]))
    return r

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for (w, h) in HEIGHTS.items():
            if QUICK and w not in (360, 390, 1280): continue   # schnelle Variante fuer die Entwicklung (SAVORA_ADAPT_QUICK=1); GitHub prueft immer alles
            for theme in (('light', 'dark') if QUICK else ('light', 'dark', 'amoled', 'auto-light', 'auto-dark')):
                ctx, page, errs = await setup(b, w, h, theme)
                expect = {'auto-light': 'light', 'auto-dark': 'dark'}.get(theme, theme)
                check(f'[{w} {theme}] «Wie dein Gerät»/Darstellung ergibt data-theme={expect}', await page.evaluate("document.documentElement.getAttribute('data-theme')") == expect)
                for name, js in VIEWS + [('import', None)]:
                    if name == 'import': await show_import(page)
                    else: await show(page, js)
                    r = await scan(page, f'[{w} {theme}] {name}')
                    if name in TABS:
                        gear = [g for g in r['navs']['gear'] if 'icon-btn--settings' in g]; side = [g for g in r['navs']['gear'] if 'nav-settings' in g]
                        want = (1, 0) if w < 900 else (0, 1)
                        check(f'[{w} {theme}] {name}: genau ein Einstellungsweg ({"Zahnrad" if w < 900 else "Seitenleiste"})', (len(gear), len(side)) == want, str(r['navs']))
                    if name == 'cb2':
                        cv = await page.evaluate("""() => { const o = Array.from(document.querySelectorAll('.cover-opt')); const on = o.filter(x => x.getAttribute('aria-checked') === 'true');
                            return { n: o.length, on: on.length, check: on.every(x => !!x.querySelector('.cover-opt-check')), minw: Math.min(...o.map(x => x.getBoundingClientRect().width)), minh: Math.min(...o.map(x => x.getBoundingClientRect().height)),
                              names: o.every(x => x.querySelector('.cover-opt-name').textContent.trim().length > 0), cols: new Set(o.map(x => Math.round(x.getBoundingClientRect().left))).size,
                              sameSize: new Set(o.map(x => Math.round(x.getBoundingClientRect().width))).size } }""")
                        check(f'[{w} {theme}] Cover-Auswahl: zehn Cover, eines klar markiert (Haken), gleich gross, mindestens 44 px', cv['n'] == 10 and cv['on'] == 1 and cv['check'] and cv['names'] and cv['minw'] >= 44 and cv['minh'] >= 44 and cv['sameSize'] == 1, str(cv))
                        check(f'[{w} {theme}] Cover-Auswahl: {"zwei" if w < 640 else "fuenf"} Spalten', cv['cols'] == (2 if w < 640 else 5), str(cv))
                    if name == 'home':
                        td = await page.evaluate("""() => { const s = document.querySelector('.today-planned'); if (!s) return null; const r = s.getBoundingClientRect(); return { links: s.querySelectorAll('.today-link').length, note: !!s.querySelector('.today-note'), right: Math.round(r.right), vw: innerWidth, label: s.querySelector('.today-label').textContent.trim() }; }""")
                        check(f'[{w} {theme}] «Heute geplant»: Rezepte als Tippflaeche, Notiz als Text, bleibt im Bild', td is not None and td['links'] == 2 and td['note'] and td['right'] <= td['vw'] and td['label'] == 'Heute geplant', str(td))
                        await page.evaluate("async () => { await savePlanEntries(fmtDateKey(new Date()), []); await loadMealplan(); render(); }"); await page.wait_for_timeout(300)
                        check(f'[{w} {theme}] «Heute geplant»: ohne Eintrag fuer heute keine Zeile', await page.evaluate("() => !document.querySelector('.today-planned')"))
                        await page.evaluate("async () => { await savePlanEntries(fmtDateKey(new Date()), [{id:'e1', recipeId:'r_legacy_2', meal:'', servings:null}, {id:'e2', type:'note', text:'Reste vom Sonntag essen', meal:''}, {id:'e3', recipeId:'r_long', meal:'', servings:null}]); await loadMealplan(); render(); }"); await page.wait_for_timeout(300)
                    if name == 'detaillong':
                        d = await page.evaluate("() => ({ rows: document.querySelectorAll('.ing-check').length, title: document.querySelector('.detail-title-v2').getBoundingClientRect().right <= innerWidth })")
                        check(f'[{w} {theme}] Lange Zutatenliste (39 Zeilen) und langer Titel bleiben im Bild', d['rows'] >= 38 and d['title'], str(d))
                check(f'[{w} {theme}] Keine Seitenfehler', not errs, str(errs[:3]))
                await ctx.close()
            # grosse Systemschrift (24 px) in Hell und Schwarz
            for theme in (('light',) if QUICK else ('light', 'amoled')):
                ctx, page, errs = await setup(b, w, h, theme, big=True)
                for name, js in VIEWS + [('import', None)]:
                    if name == 'import': await show_import(page)
                    else: await show(page, js)
                    await scan(page, f'[{w} {theme} Systemschrift 24 px] {name}')
                await ctx.close()
        await b.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')
asyncio.run(main())
sys.exit(1 if FAIL else 0)
