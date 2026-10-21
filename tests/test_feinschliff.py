"""Feinschliff: fuenf ruhige Effekte (Progressive Blur, Number Ticker, Text Highlighter, Theme-Wisch, Avatar Circles).
Prueft: jeder Effekt funktioniert, Reduced Motion ohne Animation, Endwert der Zahlen sofort lesbar (auch fuer Bildschirmleser), Nährwert null bleibt «–»,
Kontrast der Markierung und der Avatar-Initialen mindestens 4,5 zu 1 (hell, dunkel, schwarz), kein Überlauf bei 320/390/1440,
Suchtext mit <, &, \" wird nie als HTML gelesen, Umlaute und Gross/Klein bei der Markierung, Theme-Wechsel mit und ohne View-Transitions-API.
Bildschirmfotos nach SAVORA_SHOTS (Standard: Testausgabe)."""
import asyncio, sys, os
os.environ.setdefault('SAVORA_TEST_PORT', '11800')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

SHOTS = os.environ.get('SAVORA_SHOTS') or OUT
os.makedirs(SHOTS, exist_ok=True)

MANY = """async () => {
  const mk = (i) => { const r = emptyRecipe(); r.id = 'fs_' + i; r.title = 'Rezept ' + i; r.servings = 2;
    r.ingredients = [{amount:'1', unit:'', name:'Zutat'}]; r.steps = [{text:'Kochen.'}]; if (i % 3) r.timeMinutes = 10 + i; return r; };
  for (let i = 1; i <= 60; i++) await dbPut(mk(i));
  const t = (id, title, ings) => { const r = emptyRecipe(); r.id = id; r.title = title; r.servings = 2; r.timeMinutes = 20; r.ingredients = ings.map(n => ({amount:'1', unit:'', name:n})); r.steps = [{text:'Kochen.'}]; return r; };
  await dbPut(t('fs_a', 'Gemüsesuppe mit Zucchini', ['Zucchini', 'Rosmarin', 'Salz']));
  await dbPut(t('fs_b', 'Tom<script>alert(1)</script>&Co "Mix"', ['Pfeffer']));
  await dbPut(t('fs_c', 'Pasta', ['Rosmarin, frisch', 'Nudeln']));
  await loadRecipes(); state.view = 'home'; state.query = ''; state.favOnly = false; resetExtraFilters(); render(); return state.recipes.length;
}"""
RGB = """(css) => { const c = document.createElement('canvas'); c.width = c.height = 1; const x = c.getContext('2d', { willReadFrequently: true });
  x.fillStyle = '#000'; x.fillStyle = css; x.fillRect(0, 0, 1, 1); return Array.from(x.getImageData(0, 0, 1, 1).data).slice(0, 3); }"""
def lum(c):
    v = [x / 255 for x in c]; v = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in v]
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]
def contrast(a, b):
    la, lb = lum(a), lum(b)
    if la < lb: la, lb = lb, la
    return (la + 0.05) / (lb + 0.05)

async def new_page(p, w, h, motion='reduce', seed=True, no_vt=False):
    b, ctx = await open_ctx(p, w, h, motion); page = await ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    await page.add_init_script("document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = 'html { scrollbar-width: none } html::-webkit-scrollbar { display: none }'; document.head.appendChild(s); });")
    if no_vt: await page.add_init_script("try { Object.defineProperty(document, 'startViewTransition', { value: undefined }); } catch (e) {}")
    await goto(page)
    await page.evaluate("() => document.fonts.ready.then(() => 1)")
    if seed: await page.evaluate(MANY); await page.wait_for_timeout(300)
    return b, ctx, page, errs

async def set_theme(page, t):
    await page.evaluate("(t) => { state.theme = t; applyTheme(); }", t); await page.wait_for_timeout(120)

async def search(page, q):
    await page.evaluate("(q) => { state.view = 'home'; state.query = q; render(); }", q)

async def main():
    async with async_playwright() as p:
        # ---------- A. Text Highlighter ----------
        b, ctx, page, errs = await new_page(p, 390, 844, 'reduce'); ev = page.evaluate
        await search(page, 'gemuse'); await page.wait_for_timeout(100)
        r = await ev("() => Array.from(document.querySelectorAll('.rrow-title mark.hl')).map(m => m.textContent)")
        check('Highlighter: «gemuse» markiert «Gemüse» im Titel (Umlaut, ohne Umlaut getippt)', r == ['Gemüse'], str(r))
        await search(page, 'GEMÜSE'); r = await ev("() => Array.from(document.querySelectorAll('.rrow-title mark.hl')).map(m => m.textContent)")
        check('Highlighter: Grossbuchstaben und Umlaut getippt finden dasselbe', r == ['Gemüse'], str(r))
        await search(page, 'gemuese'); r = await ev("() => Array.from(document.querySelectorAll('.rrow-title mark.hl')).map(m => m.textContent)")
        check('Highlighter: «gemuese» (ue statt ü) markiert «Gemüse»', r == ['Gemüse'], str(r))
        await search(page, 'rosmarin'); await page.wait_for_timeout(50)
        r = await ev("() => Array.from(document.querySelectorAll('.search-hit mark.hl')).map(m => m.textContent)")
        n = await ev("() => document.querySelectorAll('.rrow--phone').length")
        check('Highlighter: Treffer in Zutaten werden unter dem Titel gezeigt und markiert', n == 2 and r == ['Rosmarin', 'Rosmarin'], f'{n} {r}')
        await search(page, 'zucchini'); r = await ev("() => ({ t: Array.from(document.querySelectorAll('.rrow-title mark.hl')).map(m => m.textContent), hit: document.querySelectorAll('.search-hit').length })")
        check('Highlighter: Wort im Titel markiert, keine doppelte Zutatenzeile', r['t'] == ['Zucchini'] and r['hit'] == 0, str(r))
        # Sicherheit
        await search(page, 'script'); await page.wait_for_timeout(50)
        r = await ev("() => { const row = Array.from(document.querySelectorAll('.rrow-title')).find(e => e.textContent.includes('Tom')); return { text: row.textContent, scripts: document.querySelectorAll('.rrow-title script, .rrow-title b, .rrow-title img').length, marks: Array.from(row.querySelectorAll('mark')).map(m => m.textContent) }; }")
        check('Sicherheit: Titel mit <script> bleibt Text (kein Element), «script» wird markiert', r['text'] == 'Tom<script>alert(1)</script>&Co "Mix"' and r['scripts'] == 0 and r['marks'] == ['script', 'script'], str(r))
        for q in ['<script>', '&amp;', '"Mix"', '<img src=x onerror=alert(1)>', "' or 1=1 --"]:
            await search(page, q); await page.wait_for_timeout(30)
            r = await ev("() => ({ imgs: document.querySelectorAll('main img[onerror], main script').length, errs: 0 })")
            check(f'Sicherheit: Suchtext {q!r} erzeugt kein HTML', r['imgs'] == 0 and not errs, str(errs[:1]))
        h = await ev("""() => ({ a: highlightHtml('A & Bo "co" <d>', 'bo co'), b: highlightHtml('<b>x</b>', '<b>'), c: highlightHtml('Straße', 'strasse'), d: highlightHtml('Äpfel', 'apfel'), e: highlightHtml('Rösti', 'rosti'), f: highlightHtml('abc', ''), g: highlightHtml(null, 'a') })""")
        check('highlightHtml: Sonderzeichen werden maskiert, Treffer markiert', h['a'] == 'A &amp; <mark class="hl">Bo</mark> &quot;<mark class="hl">co</mark>&quot; &lt;d&gt;', h['a'])
        check('highlightHtml: «<b>» wird nie als Tag ausgegeben', '<b>' not in h['b'] and h['b'].startswith('&lt;'), h['b'])
        check('highlightHtml: ß/ss, Ä/a, ö/o', '<mark class="hl">Straße</mark>' == h['c'] and '<mark class="hl">Äpfel</mark>' == h['d'] and '<mark class="hl">Rösti</mark>' == h['e'], str(h))
        check('highlightHtml: leere Suche und null ohne Markierung', h['f'] == 'abc' and h['g'] == '', str(h))
        # Kontrast der Markierung
        await search(page, 'zucchini')
        for th in ['light', 'dark']:  # seit 0.70.2 ohne Schwarz
            await set_theme(page, th)
            c = await ev("""(rgbfn) => { const m = document.querySelector('mark.hl'); const f = eval(rgbfn); const cs = getComputedStyle(m); const bgimg = cs.backgroundImage; return { fg: f(cs.color), bg: f(getComputedStyle(document.documentElement).getPropertyValue('--lime').trim()), page: f(getComputedStyle(document.body).backgroundColor) }; }""", RGB)
            check(f'Kontrast Markierung ({th}): Text auf Marker mindestens 4,5 zu 1', contrast(c['fg'], c['bg']) >= 4.5, f"{contrast(c['fg'], c['bg']):.2f}")
            check(f'Kontrast Markierung ({th}): Marker hebt sich vom Grund ab (sichtbar)', contrast(c['bg'], c['page']) >= 1.05, f"{contrast(c['bg'], c['page']):.2f}")
        await set_theme(page, 'light')
        # Reduced Motion: kein Wisch
        await search(page, 'zucchini')
        r = await ev("() => ({ cls: !!document.querySelector('mark.hl.hl-wipe'), anim: getComputedStyle(document.querySelector('mark.hl')).animationName })")
        check('Highlighter: bei Reduced Motion kein Wisch', not r['cls'] and r['anim'] == 'none', str(r))
        await ctx.close(); await b.close()

        b, ctx, page, errs = await new_page(p, 390, 844, 'no-preference'); ev = page.evaluate
        await search(page, 'zucchini')
        r = await ev("() => ({ cls: !!document.querySelector('mark.hl.hl-wipe'), anim: getComputedStyle(document.querySelector('mark.hl')).animationName })")
        check('Highlighter: beim Beginn der Suche läuft der Wisch', r['cls'] and r['anim'] == 'fsHlWipe', str(r))
        await search(page, 'zucchin')
        r = await ev("() => !!document.querySelector('mark.hl.hl-wipe')")
        check('Highlighter: beim Weitertippen kein erneuter Wisch (häufige Aktion)', not r)
        await search(page, ''); await search(page, 'gemuse')
        r = await ev("() => !!document.querySelector('mark.hl.hl-wipe')")
        check('Highlighter: nach geleerter Suche läuft der Wisch wieder', r)

        # ---------- B. Number Ticker ----------
        await ev("() => { state.query = ''; state.view = 'mealplan'; render(); }"); await page.wait_for_timeout(500)
        await ev("() => { state.view = 'home'; render(); }"); await page.wait_for_timeout(120)
        r = await ev("() => { const t = document.querySelector('.result-line .tick'); return t ? { text: document.querySelector('.result-line').textContent.trim(), ticking: t.classList.contains('is-ticking'), live: !!t.dataset.live, liveAlt: getComputedStyle(t, '::after').content, tab: getComputedStyle(t).fontVariantNumeric } : null; }")
        check('Ticker: Trefferzahl zählt beim Öffnen der Ansicht hoch, Endwert bleibt im Text', r and r['ticking'] and r['live'] and r['text'] == '63 Rezepte' and 'tabular-nums' in r['tab'], str(r))
        await page.wait_for_timeout(700)
        r = await ev("() => { const t = document.querySelector('.result-line .tick'); return { ticking: t.classList.contains('is-ticking'), live: !!t.dataset.live, text: t.textContent }; }")
        check('Ticker: nach 0,6 s fertig, Schicht entfernt, Endwert', not r['ticking'] and not r['live'] and r['text'] == '63', str(r))
        await ev("() => { state.query = 'rezept 1'; render(); }")
        r = await ev("() => { const t = document.querySelector('.result-line .tick'); return { ticking: t.classList.contains('is-ticking'), text: t.textContent }; }")
        check('Ticker: beim Neuzeichnen (Suche) zählt nicht erneut', not r['ticking'], str(r))
        w = await ev("""async () => { state.query = ''; render(); await new Promise(r => setTimeout(r, 700)); const t = document.querySelector('.result-line .tick'); const a = t.getBoundingClientRect().width; state.view = 'mealplan'; render(); await new Promise(r => setTimeout(r, 450)); state.view = 'home'; render(); await new Promise(r => setTimeout(r, 120));
          const t2 = document.querySelector('.result-line .tick'); const b = t2.getBoundingClientRect().width; return { a, b, ticking: t2.classList.contains('is-ticking') }; }""")
        check('Ticker: nach Ansichtswechsel zählt wieder, Breite ändert sich nie (kein Layoutsprung)', w['ticking'] and abs(w['a'] - w['b']) < 0.5, str(w))
        # Nährwerte: null bleibt unbekannt
        h = await ev("""() => { const rec = emptyRecipe(); rec.id = 'x'; rec.servings = 2; const per = {}; NUTRITION_COMPACT_KEYS.forEach((k, i) => { per[k] = i === 0 ? 250 : (i === 1 ? 5.5 : null); });
          const html = nutritionCompactInner(rec, { nutrientsPerPortion: per, confidence: 'high', unresolvedCount: 0, needsServings: false, rangeUsed: false, ingredientStatus: [] });
          const d = document.createElement('div'); d.innerHTML = html; const td = (lab) => { const th = Array.from(d.querySelectorAll('.nut-table th')).find(t => t.textContent.trim() === lab); return th ? th.nextElementSibling.textContent.trim() : null; };
          return { vals: [td('Energie'), td('Eiweiss'), td('Kohlenhydrate'), td('Fett'), td('Nahrungsfasern')], ticks: d.querySelectorAll('.tick').length }; }""")
        check('Nährwerte (v86 Tabelle, ohne Zähler): Zahl mit Komma, unbekannte Werte bleiben «–», nie 0 erfunden', h['vals'][0].startswith('250') and h['vals'][1].startswith('5,5') and all(v == '–' for v in h['vals'][2:]) and h['ticks'] == 0, str(h))
        t = await ev("() => [tickerHtml('120–170', 'k'), tickerHtml('abc<', 'k'), tickerHtml('', 'k'), tickerHtml('7', ''), tickerHtml(0, 'k').includes('data-tick=\"0\"')]")
        check('Ticker: Spannen, Text, leer und fehlender Schlüssel bleiben ohne Zähler', t[0] == '120–170' and t[1] == 'abc&lt;' and t[2] == '' and t[3] == '7' and t[4] is True, str(t))
        # Einkauf-Zähler
        await ev("""async () => { for (let i = 0; i < 3; i++) await dbPutShopping({ id: 'fsh_' + i, name: 'Artikel ' + i, amount: '', unit: '', checked: false, recipeId: null, createdAt: Date.now() }); await loadShopping(); state.view = 'home'; render(); }""")
        r = await ev("() => { const t = document.querySelector('.nav-badge .tick'); return t ? { text: t.textContent, ticking: t.classList.contains('is-ticking') } : null; }")
        check('Ticker: Einkauf-Zähler zeigt den Endwert', r and r['text'] == '3', str(r))
        await ctx.close(); await b.close()

        # Reduced Motion: Zähler bleibt still
        b, ctx, page, errs = await new_page(p, 390, 844, 'reduce'); ev = page.evaluate
        await ev("() => { state.view = 'home'; render(); }")
        r = await ev("() => { const t = document.querySelector('.result-line .tick'); return { ticking: t.classList.contains('is-ticking'), live: !!t.dataset.live, text: t.textContent }; }")
        check('Ticker: bei Reduced Motion sofort Endwert, keine Animation', not r['ticking'] and not r['live'] and r['text'] == '63', str(r))
        await ctx.close(); await b.close()

        # ---------- C. Theme-Wisch ----------
        async def theme_page(w, h, motion, no_vt=False):
            b, ctx, page, errs = await new_page(p, w, h, motion, no_vt=no_vt)
            await page.evaluate("() => { state.theme = 'light'; applyTheme(); state.view = 'settings-display'; render(); }"); await page.wait_for_timeout(250)
            return b, ctx, page, errs
        b, ctx, page, errs = await theme_page(390, 844, 'no-preference'); ev = page.evaluate
        await page.click('[data-action="set-theme"][data-theme="dark"]')
        r = await ev("() => document.documentElement.classList.contains('theme-transitioning')")
        check('Theme-Wisch: während des Wechsels läuft die View Transition (Kreis ab dem Knopf)', r is True)
        await page.wait_for_timeout(800)
        r = await ev("""() => ({ th: document.documentElement.getAttribute('data-theme'), saved: localStorage.getItem('savora-theme'), cls: document.documentElement.classList.contains('theme-transitioning'),
          checked: Array.from(document.querySelectorAll('[data-action=set-theme]')).filter(b => b.getAttribute('aria-checked') === 'true').map(b => b.dataset.theme), active: Array.from(document.querySelectorAll('[data-action=set-theme].active')).map(b => b.dataset.theme) })""")
        check('Theme-Wisch: Dunkel gesetzt, gespeichert, Klasse entfernt, Haken nur bei Dunkel', r['th'] == 'dark' and r['saved'] == 'dark' and not r['cls'] and r['checked'] == ['dark'] and r['active'] == ['dark'], str(r))
        await page.focus('[data-action="set-theme"][data-theme="light"]'); await page.keyboard.press('Enter'); await page.wait_for_timeout(800)
        r = await ev("() => [document.documentElement.getAttribute('data-theme'), localStorage.getItem('savora-theme')]")
        check('Theme-Wisch: per Tastatur (Enter) ebenfalls, Hell gespeichert (seit 0.70.2 statt Schwarz)', r == ['light', 'light'], str(r))
        await page.click('[data-action="set-theme"][data-theme="auto"]'); await page.wait_for_timeout(800)
        r = await ev("() => [localStorage.getItem('savora-theme'), state.theme, document.querySelector('[data-action=set-theme].active').dataset.theme]")
        check('Theme-Wisch: «Wie dein Gerät» gespeichert, Haken bleibt', r == ['auto', 'auto', 'auto'], str(r))
        await page.click('[data-action="set-theme"][data-theme="light"]'); await page.click('[data-action="set-theme"][data-theme="dark"]'); await page.wait_for_timeout(900)
        r = await ev("() => [document.documentElement.getAttribute('data-theme'), document.documentElement.classList.contains('theme-transitioning'), state._themeTransitionActive]")
        check('Theme-Wisch: schnelles Doppeltippen endet beim zuletzt gewählten Modus ohne hängende Animation', r == ['dark', False, False], str(r))
        check('Theme-Wisch: keine Skriptfehler', not errs, str(errs[:2]))
        await ctx.close(); await b.close()
        b, ctx, page, errs = await theme_page(390, 844, 'reduce'); ev = page.evaluate
        await page.click('[data-action="set-theme"][data-theme="dark"]')
        r = await ev("() => [document.documentElement.getAttribute('data-theme'), document.documentElement.classList.contains('theme-transitioning')]")
        check('Theme-Wisch: Reduced Motion wechselt sofort, ohne Animation', r == ['dark', False], str(r))
        await ctx.close(); await b.close()
        b, ctx, page, errs = await theme_page(390, 844, 'no-preference', no_vt=True); ev = page.evaluate
        has = await ev("() => typeof document.startViewTransition")
        await page.click('[data-action="set-theme"][data-theme="light"]')
        r = await ev("() => [document.documentElement.getAttribute('data-theme'), localStorage.getItem('savora-theme'), document.documentElement.classList.contains('theme-transitioning')]")
        check('Theme-Wisch: ohne View-Transitions-API sofortiger Wechsel', has == 'undefined' and r == ['light', 'light', False], f'{has} {r}')
        await ctx.close(); await b.close()

        # ---------- D. Progressive Blur ----------
        PSEUDO = """(sel) => { const g = (pe) => { const c = getComputedStyle(document.querySelector(sel), pe); return { op: c.opacity, bf: c.backdropFilter || c.webkitBackdropFilter, pe: c.pointerEvents, h: c.height, pos: c.position }; }; return { b: g('::before'), a: g('::after') }; }"""
        for (w, h, nm) in [(390, 844, 'Handy'), (1440, 900, 'Laptop')]:
            b, ctx, page, errs = await new_page(p, w, h, 'no-preference'); ev = page.evaluate
            await ev("() => { state.view = 'home'; render(); window.scrollTo(0, 0); }"); await page.wait_for_timeout(250)
            top = await ev(PSEUDO, '.home-head')
            check(f'Blur {nm}: oben (nicht gescrollt) unsichtbar', top['b']['op'] == '0' and top['a']['op'] == '0', str(top))
            await ev("() => window.scrollTo(0, 500)"); await page.wait_for_timeout(450)
            sc = await ev(PSEUDO, '.home-head')
            check(f'Blur {nm}: beim Scrollen weicher Verlauf mit Unschärfe unter dem Kopf', sc['b']['op'] == '1' and 'blur' in sc['b']['bf'] and 'blur' in sc['a']['bf'] and sc['b']['pe'] == 'none' and sc['a']['pe'] == 'none', str(sc))
            if w < 768:
                bt = await ev("""() => ({ more: document.documentElement.classList.contains('fs-more-below'), add: getComputedStyle(document.querySelector('.home-add-bar'), '::before').opacity, bf: getComputedStyle(document.querySelector('.home-add-bar'), '::before').backdropFilter })""")
                check('Blur Handy: unten über dem Knopf eingeblendet, solange noch Inhalt folgt', bt['more'] and bt['add'] == '1' and 'blur' in bt['bf'], str(bt))
                await ev("() => window.scrollTo(0, document.documentElement.scrollHeight)"); await page.wait_for_timeout(450)
                bt = await ev("() => [document.documentElement.classList.contains('fs-more-below'), getComputedStyle(document.querySelector('.home-add-bar'), '::before').opacity]")
                check('Blur Handy: am Listenende unten wieder aus', bt == [False, '0'], str(bt))
                await ev("() => { state.view = 'mealplan'; render(); window.scrollTo(0, 200); }"); await page.wait_for_timeout(500)
                nv = await ev("""() => { const c = getComputedStyle(document.querySelector('.bottom-nav'), '::before'); return [c.content, c.pointerEvents, c.position]; }""")
                check('Blur Handy: Verlauf über der Leiste fängt keine Berührungen ab', nv[1] == 'none' and nv[2] == 'absolute', str(nv))
            await ev("() => { state.view = 'home'; render(); window.scrollTo(0, 500); }"); await page.wait_for_timeout(500)
            # Lesbarkeit: Kopf selbst unverändert deckend, keine Unschärfe über Inhalt des Kopfes
            hd = await ev("() => { const h = document.querySelector('.home-head'); const r = h.getBoundingClientRect(); const el = document.elementFromPoint(r.left + 20, r.bottom + 4); return [getComputedStyle(h).backgroundColor, el && el.closest('.home-head') ? 'kopf' : 'inhalt']; }")
            check(f'Blur {nm}: Kopf bleibt deckend, Verlauf liegt nur darunter und blockiert keine Klicks', hd[1] == 'inhalt' and hd[0] not in ('rgba(0, 0, 0, 0)', 'transparent'), str(hd))
            await set_theme(page, 'dark'); await ev("() => window.scrollTo(0, 400)"); await page.wait_for_timeout(300)
            sc = await ev(PSEUDO, '.home-head')
            check(f'Blur {nm}: dunkel ebenfalls aktiv', sc['b']['op'] == '1', str(sc))
            await ctx.close(); await b.close()
        # Rückfall ohne backdrop-filter: Verlauf bleibt als Farbe
        b, ctx, page, errs = await new_page(p, 390, 844, 'no-preference'); ev = page.evaluate
        bg = await ev("() => getComputedStyle(document.querySelector('.home-head'), '::before').backgroundImage")
        check('Blur Rückfall: ohne Unschärfe bleibt ein Farbverlauf aus dem Hintergrundton', 'linear-gradient' in bg, bg[:80])
        await ctx.close(); await b.close()

        # ---------- E. Avatar Circles ----------
        b, ctx, page, errs = await new_page(p, 390, 844, 'reduce'); ev = page.evaluate
        r = await ev("""() => { const d = document.createElement('div'); d.innerHTML = avatarCirclesHtml(['Anna', 'Ben', 'Chris'], 4) + avatarCirclesHtml(['A', 'B', 'C', 'D', 'E', 'F'], 4) + avatarCirclesHtml(['Zoë Müller']) + avatarCirclesHtml([]) + avatarCirclesHtml(['<img src=x onerror=alert(1)>', 'Ben "B" & Co'], 3);
          const a = d.querySelectorAll('.avc'); return { n: a.length, l0: a[0].getAttribute('aria-label'), i0: Array.from(a[0].querySelectorAll('.avc-item')).map(e => e.textContent), l1: a[1].getAttribute('aria-label'), i1: Array.from(a[1].querySelectorAll('.avc-item')).map(e => e.textContent), l2: a[2].getAttribute('aria-label'), t2: a[2].textContent,
            imgs: d.querySelectorAll('img').length, l3: a[3].getAttribute('aria-label'), role: a[0].getAttribute('role'), hidden: Array.from(a[0].querySelectorAll('.avc-item')).every(e => e.getAttribute('aria-hidden') === 'true'),
            c1: avatarColorIndex('Anna'), c2: avatarColorIndex(' anna '), empty: avatarCirclesHtml([]), none: avatarCirclesHtml(null) }; }""")
        check('Avatar: aria-label «3 Freunde: Anna, Ben, Chris», Initialen A B C', r['l0'] == '3 Freunde: Anna, Ben, Chris' and r['i0'] == ['A', 'B', 'C'] and r['role'] == 'img' and r['hidden'], str(r))
        check('Avatar: Überlauf zeigt vier Kreise und «+2»', r['i1'] == ['A', 'B', 'C', 'D', '+2'] and r['l1'].startswith('6 Freunde: A, B'), str(r['i1']))
        check('Avatar: eine Person heisst «Freund», Initialen aus Vor- und Nachname', r['l2'] == '1 Freund: Zoë Müller' and r['t2'] == 'ZM', str(r['l2']) + r['t2'])
        check('Avatar: leere Liste ergibt nichts, Namen mit HTML werden maskiert', r['empty'] == '' and r['none'] == '' and r['imgs'] == 0 and r['n'] == 4, str(r))
        check('Avatar: Farbe aus dem Namen ist stabil (Gross/Klein und Leerzeichen egal)', r['c1'] == r['c2'], str((r['c1'], r['c2'])))
        for th in ['light', 'dark']:  # seit 0.70.2 ohne Schwarz
            await set_theme(page, th)
            c = await ev("""(rgbfn) => { const f = eval(rgbfn); const host = document.createElement('div'); host.innerHTML = avatarCirclesHtml(['Anna','Ben','Chris','Dora','Emil','Fritz','Gina','Hugo','Ida','Jan','Kai','Lea'], 12); document.body.appendChild(host);
              const out = Array.from(host.querySelectorAll('.avc-item')).map(e => { const cs = getComputedStyle(e); return [e.className, f(cs.color), f(cs.backgroundColor)]; }); host.remove(); return out; }""", RGB)
            classes = {x[0].split(' ')[1] for x in c}
            worst = min(contrast(x[1], x[2]) for x in c)
            check(f'Avatar Kontrast ({th}): Initialen mindestens 4,5 zu 1 in allen Farbtönen', worst >= 4.5 and len(classes) >= 4, f'{worst:.2f} {sorted(classes)}')
        await ctx.close(); await b.close()

        # ---------- F. Überlauf und Bildschirmfotos ----------
        for (w, h) in [(320, 640), (390, 844), (1440, 900)]:
            b, ctx, page, errs = await new_page(p, w, h, 'reduce'); ev = page.evaluate
            await search(page, 'rosmarin')
            await ev("""() => { const host = document.createElement('div'); host.id = 'avcDemo'; host.style.cssText = 'padding:12px 16px;background:var(--card-bg)'; host.innerHTML = avatarCirclesHtml(['Anna','Ben','Chris','Dora','Emil','Fritz'], 4); document.querySelector('main').prepend(host); }""")
            sw = await ev("() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]")
            check(f'Überlauf [{w}]: Suche mit Markierung, Trefferzeile und Avatar-Kreisen ohne horizontalen Überlauf', sw[0] <= sw[1], str(sw))
            await ev("() => state.query = ''"); await ev("() => { state.view = 'home'; render(); }")
            sw = await ev("() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]")
            check(f'Überlauf [{w}]: Startseite mit Zähler ohne horizontalen Überlauf', sw[0] <= sw[1], str(sw))
            check(f'Keine Skriptfehler [{w}]', not errs, str(errs[:2]))
            if w in (390, 1440):
                for th in ['light', 'dark']:
                    await set_theme(page, th)
                    await search(page, 'zucchini')
                    await ev("""() => { document.getElementById('avcDemo') || (() => { const host = document.createElement('div'); host.id = 'avcDemo'; host.style.cssText = 'padding:12px 16px'; host.innerHTML = avatarCirclesHtml(['Anna','Ben','Chris','Dora','Emil','Fritz'], 4); document.querySelector('.home-section').prepend(host); })(); }""")
                    await page.wait_for_timeout(500)
                    await page.screenshot(path=os.path.join(SHOTS, f'{w}-{th}-suche-markierung-avatare.png'))
                    await ev("() => { document.getElementById('avcDemo') && document.getElementById('avcDemo').remove(); state.query = ''; state.view = 'home'; render(); window.scrollTo(0, 500); }")
                    await page.wait_for_timeout(500)
                    await page.screenshot(path=os.path.join(SHOTS, f'{w}-{th}-gescrollt-blur.png'))
                    await ev("() => { window.scrollTo(0, 0); state.view = 'settings-display'; render(); }"); await page.wait_for_timeout(300)
                    await page.screenshot(path=os.path.join(SHOTS, f'{w}-{th}-darstellung.png'))
            await ctx.close(); await b.close()

    print('\nFEHLER:', FAIL if FAIL else 'keine')
    sys.exit(1 if FAIL else 0)

asyncio.run(main())
