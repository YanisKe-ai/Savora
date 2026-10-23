"""v0.85 Kochbuch-Assistent (Rahmen, Schritt 1 «Im Kochbuch», Schritt 3 «Vorschau & PDF").
Prueft: Stepper 44 px, klebende Fussleiste ueber der unteren Navigation (Weiter ohne Scrollen), Liste nach Kapiteln in
PDF-Reihenfolge (Nummern = cookbookOrderedSections, Befund B1), eine Zeile pro Rezept (<= 60 px, Name/Pfeile/Menue auf einer
Hoehe), Pfeile tauschen nur innerhalb der Gruppe und sind am Gruppenrand gesperrt, Ansagen (Verschieben, Aufnehmen, Kapitel
verschieben), Zeilenmenue (Kapitel wechseln schliesst und gibt den Fokus zurueck, Ganz nach oben), Entfernen / Alle entfernen /
Kapitel loeschen mit «Rückgängig» (Platz, Kapitel, items exakt), Kapitel per Enter, Fehler am Feld bei leerem Namen, Schritt 3:
ein Eintrag pro Rezept, keine Grossbuchstaben, PDF-Knopf beim Scrollen im Bild, «ß», Umlaute und lange Namen bei 320 px.
Datenmodell unveraendert (items[{recipeId, chapterId}], chapters[{id, name}]). Nur Testdaten."""
import asyncio, json, os, sys
os.environ.setdefault('SAVORA_TEST_PORT', '57410')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info if not cond else '')
    if not cond: FAIL.append(name)

SETUP = """async () => {
  const mk = async (id, title, opts) => { const r = emptyRecipe(); r.id = id; r.title = title; r.servings = 4;
    r.ingredients = opts.noIng ? [] : [{amount:'200', unit:'g', name:'Mehl'},{amount:'2', unit:'', name:'Eier'}];
    r.steps = opts.noSteps ? [] : [{text:'Alles mischen und 20 Minuten backen.'}]; if (opts.img) r.imageId = 'img_legacy_1'; await dbPut(r); };
  await mk('r_manti', 'Türkische Manti', {img:1});
  await mk('r_cookies', 'Cookies', {});
  await mk('r_bulgogi', 'Bulgogi', {img:1});
  await mk('r_karamell', 'Karamellsauce', {noSteps:1, noIng:1});
  await mk('r_kartoffel', 'Kartoffelsalat nach Grossmutters Art mit Speck und Schnittlauch', {});
  await loadRecipes();
  const cfg = getCookbookConfig();
  cfg.chapters = ['Hauptgänge','Dessert','Vorspeisen','Snacks','Gewürze','Saucen'].map((n, i) => ({ id: 'c' + i, name: n }));
  cfg.items = [['r_legacy_1','c0'],['r_manti','c0'],['r_legacy_2','c0'],['r_cookies','c1'],['r_bulgogi',''],['r_karamell',''],['r_legacy_3','c5']].map(([a,b]) => ({ recipeId: a, chapterId: b }));
  cfg.title = 'Mein Kochbuch'; saveCookbookConfig(cfg);
  state.view = 'cookbook'; state.cookbookStep = 1; render();
}"""
ITEMS = "() => getCookbookConfig().items.map(i => i.recipeId + ':' + i.chapterId)"
LIVE = "() => document.getElementById('liveRegion').textContent"

async def main():
    async with async_playwright() as p:
        b, ctx = await open_ctx(p, 390, 844)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        ev = page.evaluate
        await goto(page); await ev(open(SEED_PATH).read()); await ev(SETUP)
        await page.wait_for_selector('.cb-book .cb-item'); await page.wait_for_timeout(300)

        # ---------- Rahmen ----------
        h = await ev("() => document.querySelector('.cb-steps ol').getBoundingClientRect().height")
        check('Stepper höchstens 48 px hoch (eine Zeile)', h <= 48, str(h))
        labels = await ev("() => Array.from(document.querySelectorAll('.cb-steps .cb-step-label')).map(l => [l.textContent, getComputedStyle(l).display])")
        check('Stepper: nur der aktuelle Schritt beschriftet, Texte bleiben im DOM', [l[0] for l in labels] == ['Rezepte auswählen', 'Gestalten', 'Vorschau & PDF'] and labels[0][1] != 'none' and labels[1][1] == 'none', str(labels))
        foot = await ev("""() => { const f = document.querySelector('.cb-step-footer'), n = document.querySelector('.bottom-nav'), w = f.querySelector('.primary-btn');
          const fr = f.getBoundingClientRect(), nr = n.getBoundingClientRect(), wr = w.getBoundingClientRect();
          const hit = document.elementFromPoint(wr.left + wr.width / 2, wr.top + wr.height / 2);
          return { inView: fr.top >= 0 && fr.bottom <= innerHeight, aboveNav: Math.abs(fr.bottom - innerHeight) <= 1 && getComputedStyle(n).display === 'none' && nr.height === 0, hit: !!hit && w.contains(hit), status: f.querySelector('.cb-footer-status').textContent, scroll: scrollY }; }""")
        # v89: im Kochbuch-Assistenten keine untere Navigation (wie im Editor); die Fussleiste steht allein am unteren Rand
        check('Fussleiste beim Laden im Bild, allein am unteren Rand (untere Navigation ausgeblendet)', foot['inView'] and foot['aboveNav'] and foot['scroll'] == 0, str(foot))
        check('«Weiter» ohne Scrollen antippbar, Status «7 Rezepte im Kochbuch»', foot['hit'] and foot['status'] == '7 Rezepte im Kochbuch', str(foot))
        first_footer_btn = await ev("() => document.querySelector('.cb-step-footer [data-action=\"cb-step\"]').textContent.trim()")
        check('Erster Schrittknopf der Fussleiste ist «Weiter»', first_footer_btn.startswith('Weiter'), first_footer_btn)

        # ---------- Gruppierung = PDF-Reihenfolge (B1) ----------
        order = await ev("""() => ({ rows: Array.from(document.querySelectorAll('.cb-book .cb-item')).map(li => [li.querySelector('.cb-item-no').textContent, li.dataset.cbRow]),
          pdf: cookbookOrderedSections(getCookbookConfig()).flatMap(s => s.recipes.map(r => r.id)),
          groups: Array.from(document.querySelectorAll('.cb-book .cb-group-title')).map(g => g.textContent.replace(/\\s+/g, ' ').trim()) })""")
        check('Nummern 1 bis n in PDF-Reihenfolge', [r[1] for r in order['rows']] == order['pdf'] and [r[0] for r in order['rows']] == [str(i + 1) for i in range(len(order['pdf']))], json.dumps(order))
        check('Gruppentitel nur für Kapitel mit Rezepten, «Ohne Kapitel» am Schluss', order['groups'] == ['Hauptgänge · 3', 'Dessert · 1', 'Saucen · 1', 'Ohne Kapitel · 2'], str(order['groups']))
        check('Kein Satz «Die Reihenfolge hier ist die Reihenfolge im Buch»', 'So erscheinen sie im PDF.' in await ev("() => document.getElementById('cbSelCount').textContent"))

        # ---------- Zeile ----------
        row = await ev("""() => { const li = document.querySelector('.cb-book .cb-item'); const c = e => { const r = e.getBoundingClientRect(); return r.top + r.height / 2; };
          const parts = [li.querySelector('.cb-item-title'), ...li.querySelectorAll('.cb-item-actions .icon-btn')];
          return { h: li.getBoundingClientRect().height, centers: parts.map(c), sizes: Array.from(li.querySelectorAll('.icon-btn')).map(b => [b.offsetWidth, b.offsetHeight]) }; }""")
        check('Rezeptzeile mit kurzem Namen höchstens 60 px hoch', row['h'] <= 60, str(row['h']))
        check('Name, Pfeile und Menü auf einer Höhe (± 4 px)', max(row['centers']) - min(row['centers']) <= 4, str(row['centers']))
        check('Drei Knöpfe je 44 × 44 px', len(row['sizes']) == 3 and all(w >= 44 and h >= 44 for w, h in row['sizes']), str(row['sizes']))
        dis = await ev("""() => { const st = id => ['-1', '1'].map(d => document.querySelector(`[data-action="cb-move-item"][data-id="${id}"][data-delta="${d}"]`).disabled);
          return { first: st('r_legacy_1'), last: st('r_legacy_2'), alone: st('r_cookies'), bulgogi: st('r_bulgogi') }; }""")
        check('Pfeile am Gruppenrand gesperrt (erstes/letztes Rezept der Gruppe, Einzelrezept)', dis == {'first': [True, False], 'last': [False, True], 'alone': [True, True], 'bulgogi': [True, False]}, str(dis))

        # Pfeil: Tausch nur in der Gruppe
        before = await ev(ITEMS)
        await page.click('[data-action="cb-move-item"][data-id="r_bulgogi"][data-delta="1"]')
        await page.wait_for_function("() => getCookbookConfig().items.findIndex(i => i.recipeId === 'r_karamell') < getCookbookConfig().items.findIndex(i => i.recipeId === 'r_bulgogi')")
        after = await ev(ITEMS)
        check('Pfeil tauscht mit dem nächsten Rezept derselben Gruppe', after == ['r_legacy_1:c0', 'r_manti:c0', 'r_legacy_2:c0', 'r_cookies:c1', 'r_karamell:', 'r_bulgogi:', 'r_legacy_3:c5'], str((before, after)))
        await page.wait_for_function("() => /Platz 2 von 2/.test(document.getElementById('liveRegion').textContent)")
        live = await ev(LIVE)
        check('Ansage nach dem Verschieben', live == '«Bulgogi» ist jetzt auf Platz 2 von 2 in «Ohne Kapitel».', live)
        foc = await ev("() => [document.activeElement.dataset.action, document.activeElement.dataset.id, document.activeElement.dataset.delta]")
        check('Fokus bleibt beim Rezept (gesperrter Pfeil: anderer Pfeil)', foc == ['cb-move-item', 'r_bulgogi', '-1'], str(foc))
        await page.click('[data-action="cb-move-item"][data-id="r_legacy_1"][data-delta="1"]')
        await page.wait_for_function("() => getCookbookConfig().items[0].recipeId === 'r_manti'")
        await page.wait_for_function("() => /Sloppy/.test(document.getElementById('liveRegion').textContent)")
        live = await ev(LIVE)
        check('Ansage mit Kapitel: «… auf Platz 2 von 3 in «Hauptgänge».»', 'Platz 2 von 3 in «Hauptgänge»' in live, live)

        # ---------- Zeilenmenü: Kapitel wechseln ----------
        await page.click('[data-action="cb-item-menu"][data-id="r_bulgogi"]'); await page.wait_for_selector('.modal-sheet input[name="cbItemChapter"]')
        sheet = await ev("() => ({ title: document.querySelector('.modal-sheet .modal-title').textContent, sub: document.querySelector('.modal-sheet .cb-menu-sub').textContent, radios: document.querySelectorAll('.modal-sheet [role=radiogroup] input[type=radio]').length, checked: document.querySelector('.modal-sheet input[name=cbItemChapter]:checked').value })")
        check('Zeilenmenü: Titel, Platz, Radiogruppe mit allen Kapiteln plus «Ohne Kapitel»', sheet == {'title': 'Bulgogi', 'sub': 'Platz 2 von 2 in «Ohne Kapitel»', 'radios': 7, 'checked': ''}, str(sheet))
        await page.click('.modal-sheet input[name="cbItemChapter"][value="c1"]')
        await page.wait_for_function("() => !state.modal && document.activeElement && document.activeElement.dataset.action === 'cb-item-menu'")
        st = await ev("() => ({ items: getCookbookConfig().items.map(i => i.recipeId + ':' + i.chapterId), focus: document.activeElement.dataset.id })")
        check('Kapitel wechseln: Sheet zu, Fokus zurück auf «…», Rezept am Ende der neuen Gruppe', st['focus'] == 'r_bulgogi' and st['items'][-1] == 'r_bulgogi:c1', str(st))
        await page.wait_for_function("() => /im Kapitel «Dessert»/.test(document.getElementById('liveRegion').textContent)")
        check('Ansage nach Kapitelwechsel', True)
        # Ganz nach oben
        await page.click('[data-action="cb-item-menu"][data-id="r_bulgogi"]'); await page.wait_for_selector('.modal-sheet [data-to="first"]')
        await page.click('.modal-sheet [data-to="first"]')
        await page.wait_for_function("() => !state.modal && cookbookItemPlace(getCookbookConfig(), 'r_bulgogi').k === 0")
        check('«Ganz nach oben» setzt das Rezept an den Anfang seiner Gruppe', await ev("() => cookbookOrderedSections(getCookbookConfig()).find(s => s.chapter && s.chapter.id === 'c1').recipes[0].id") == 'r_bulgogi')

        # ---------- Entfernen mit Rückgängig ----------
        snap = await ev(ITEMS)
        await page.click('[data-action="cb-item-menu"][data-id="r_manti"]'); await page.wait_for_selector('.modal-sheet [data-action="cb-remove-item"]')
        await page.click('.modal-sheet [data-action="cb-remove-item"]')
        await page.wait_for_function("() => !state.modal && !getCookbookConfig().items.some(i => i.recipeId === 'r_manti') && !!document.querySelector('.toast .toast-action-btn')")
        check('«Aus dem Kochbuch nehmen»: Meldung mit «Rückgängig», Rezept selbst bleibt', 'aus dem Kochbuch genommen' in await ev("() => document.querySelector('.toast').textContent") and await ev("async () => !!(await dbGetAll()).find(r => r.id === 'r_manti')"))
        await page.click('.toast .toast-action-btn')
        await page.wait_for_function("() => getCookbookConfig().items.some(i => i.recipeId === 'r_manti')")
        check('Rückgängig stellt Platz und Kapitel wieder her', await ev(ITEMS) == snap, str(await ev(ITEMS)))
        # Alle entfernen
        await page.click('[data-action="cb-clear-all"]')
        await page.wait_for_function("() => getCookbookConfig().items.length === 0 && !!document.querySelector('.toast .toast-action-btn')")
        empty_ui = await ev("() => ({ txt: document.querySelector('.cb-book').innerText, addAll: document.querySelectorAll('[data-action=\"cb-add-all\"]').length, status: document.querySelector('.cb-footer-status').textContent, weiter: !document.querySelector('.cb-step-footer .primary-btn').disabled })")
        check('Leeres Kochbuch: Hinweis, «Alle aufnehmen» genau einmal, «Weiter» bleibt bedienbar', 'Noch kein Rezept im Kochbuch' in empty_ui['txt'] and empty_ui['addAll'] == 1 and empty_ui['status'] == 'Noch kein Rezept im Kochbuch' and empty_ui['weiter'], str(empty_ui))
        await page.click('.toast .toast-action-btn')
        await page.wait_for_function("() => getCookbookConfig().items.length === 7")
        check('«Alle entfernen» + Rückgängig stellt items exakt wieder her', await ev(ITEMS) == snap)

        # ---------- Aufnehmen ----------
        await page.click('[data-action="cb-add-item"][data-id="r_kartoffel"]')
        await page.wait_for_function("() => /aufgenommen\\. 8 Rezepte im Kochbuch\\./.test(document.getElementById('liveRegion').textContent)")
        check('Aufnehmen: Ansage und Fokus auf «Im Kochbuch» (kein weiterer Knopf)', await ev("() => document.activeElement.id") == 'cbStepTitle')

        # ---------- Kapitel ----------
        await page.click('[data-action="cb-add-chapter"]'); await page.wait_for_selector('#cbNewChapterError')
        err = await ev("() => ({ t: document.getElementById('cbNewChapterError').textContent, inv: document.getElementById('cbNewChapter').getAttribute('aria-invalid'), n: getCookbookConfig().chapters.length, f: document.activeElement.id })")
        check('Leerer Kapitelname: Fehler am Feld, nichts gespeichert, Fokus im Feld', err == {'t': 'Bitte einen Namen eingeben.', 'inv': 'true', 'n': 6, 'f': 'cbNewChapter'}, str(err))
        await page.type('#cbNewChapter', 'Süßspeisen')
        check('Tippen entfernt den Fehler', await ev("() => !document.getElementById('cbNewChapterError')"))
        await page.keyboard.press('Enter')
        await page.wait_for_function("() => getCookbookConfig().chapters.length === 7")
        st = await ev("() => ({ name: getCookbookConfig().chapters[6].name, val: document.getElementById('cbNewChapter').value, f: document.activeElement.id, live: document.getElementById('liveRegion').textContent })")
        check('Enter fügt Kapitel hinzu, Feld leer, Fokus bleibt im Feld', st['name'] == 'Süßspeisen' and st['val'] == '' and st['f'] == 'cbNewChapter', str(st))
        check('Kapitelzeile: alle Namen als Feld, Anzahl sichtbar', await ev("() => Array.from(document.querySelectorAll('.cb-chapter')).map(c => c.querySelector('.cb-chapter-n').textContent).slice(0, 3).join('|')") == '3 Rezepte|2 Rezepte|leer')
        # Kapitel verschieben über das Menü
        await page.click('[data-action="cb-chapter-menu"][data-id="c1"]'); await page.wait_for_selector('.modal-sheet [data-action="cb-move-chapter"][data-delta="-1"]')
        await page.click('.modal-sheet [data-action="cb-move-chapter"][data-delta="-1"]')
        await page.wait_for_function("() => getCookbookConfig().chapters[0].id === 'c1'")
        await page.wait_for_function("() => /Kapitel «Dessert» ist jetzt an Stelle 1 von 7\\./.test(document.getElementById('liveRegion').textContent)")
        check('Kapitel verschieben: Ansage «… an Stelle 1 von 7.»', True)
        await page.keyboard.press('Escape'); await page.wait_for_function("() => !state.modal")
        # Kapitel löschen + Rückgängig
        csnap = await ev("() => JSON.stringify({ c: getCookbookConfig().chapters, i: getCookbookConfig().items })")
        await page.click('[data-action="cb-chapter-menu"][data-id="c0"]'); await page.wait_for_selector('.modal-sheet [data-action="cb-delete-chapter"]')
        hint = await ev("() => document.querySelector('.modal-sheet [data-action=\"cb-delete-chapter\"]').textContent")
        check('Kapitel löschen nennt die Folge', 'Die 3 Rezepte bleiben im Kochbuch, dann ohne Kapitel.' in hint, hint)
        await page.click('.modal-sheet [data-action="cb-delete-chapter"]')
        await page.wait_for_function("() => !state.modal && !getCookbookConfig().chapters.some(c => c.id === 'c0') && !!document.querySelector('.toast .toast-action-btn')")
        await page.click('.toast .toast-action-btn')
        await page.wait_for_function("() => getCookbookConfig().chapters.some(c => c.id === 'c0')")
        check('Kapitel löschen + Rückgängig stellt Kapitel, Stelle und Zuordnungen wieder her', await ev("() => JSON.stringify({ c: getCookbookConfig().chapters, i: getCookbookConfig().items })") == csnap)
        # Umbenennen über das Menü: Fokus im Namensfeld
        await page.click('[data-action="cb-chapter-menu"][data-id="c5"]'); await page.click('.modal-sheet [data-action="cb-chapter-rename"]')
        await page.wait_for_function("() => !state.modal && document.activeElement && document.activeElement.dataset.cbChapter === 'c5'")
        check('«Umbenennen» setzt den Fokus ins Namensfeld des Kapitels', True)

        # ---------- Schritt 3 ----------
        await ev("() => { state.cookbookStep = 3; render(); window.scrollTo(0, 0); }"); await page.wait_for_selector('.cb-final')
        hints = await ev("""() => Array.from(document.querySelectorAll('.cb-warnings > li')).map(li => ({ level: li.dataset.level, text: li.querySelector('.cb-hint-text').textContent, btns: li.querySelectorAll('.cb-hint-go').length, tt: getComputedStyle(li.querySelector('.cb-hint-level')).textTransform }))""")
        kara = [h for h in hints if 'Karamellsauce' in h['text'] and h['level'] == 'check']
        check('Ein Eintrag pro Rezept mit zusammengefassten Gründen', len(kara) == 1 and 'Keine Zutaten, Keine Zubereitung' in kara[0]['text'] and kara[0]['btns'] == 1, str(hints))
        check('Keine Grossbuchstaben in der Prüfung', all(h['tt'] == 'none' for h in hints) and await ev("() => Array.from(document.querySelectorAll('.cb-warnings, .cb-warnings *')).every(e => getComputedStyle(e).textTransform === 'none')"))
        heads = await ev("() => Array.from(document.querySelectorAll('.cb-hints-title')).map(h => h.textContent.replace(/\\s+/g, ' ').trim())")
        check('Prüfung gruppiert: «Bitte ansehen · n», «Gut zu wissen»', heads[:1] == ['Bitte ansehen · 1'] and 'Gut zu wissen' in heads, str(heads))
        check('Name leer: «nicht eingetragen»', 'nicht eingetragen' in await ev("() => document.querySelector('.cb-summary').innerText"))
        await ev("() => window.scrollTo(0, 300)"); await page.wait_for_timeout(100)
        pdfb = await ev("""() => { const b = document.querySelector('.cb-final [data-action="export-cookbook"]'); const r = b.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { top: r.top, bottom: r.bottom, nav: innerHeight, hit: !!hit && b.contains(hit) }; }""")
        check('PDF-Knopf bleibt beim Scrollen im Bild (über dem unteren Rand, antippbar)', pdfb['bottom'] <= pdfb['nav'] and pdfb['top'] > 0 and pdfb['hit'], str(pdfb))

        # ---------- Extreme Inhalte, 320 px, hell/dunkel ----------
        await ev("""async () => { const r = emptyRecipe(); r.id = 'r_lang'; r.title = 'Großmutters außergewöhnlich ausführlicher Süßkartoffel-Kürbis-Eintopf mit Crème fraîche und Röstzwiebeln'; r.ingredients = [{amount:'1', unit:'', name:'Kürbis'}]; r.steps = [{text:'Kochen.'}]; await dbPut(r); await loadRecipes();
          const c = getCookbookConfig(); c.items.push({ recipeId: 'r_lang', chapterId: 'c0' }); c.chapters[1].name = 'Süßes und Gebäck aus Großmutters Küche'; saveCookbookConfig(c); state.cookbookStep = 1; render(); }""")
        for theme in ('light', 'dark'):
            await page.set_viewport_size({'width': 320, 'height': 700})
            await ev("(t) => { document.documentElement.dataset.theme = t; window.scrollTo(0, 0); }", theme); await page.wait_for_timeout(200)
            ovf = await ev("""() => ({ x: document.documentElement.scrollWidth - innerWidth,
              cut: Array.from(document.querySelectorAll('.cookbook-main *')).filter(e => { const s = getComputedStyle(e); return e.offsetParent && (s.textOverflow === 'ellipsis' || (s.overflow === 'hidden' && e.scrollWidth > e.clientWidth + 1)) && e.textContent.trim() && e.tagName !== 'SELECT' && !e.classList.contains('sr-only'); }).map(e => e.className).slice(0, 3),
              title: (() => { const t = document.querySelector('[data-cb-row="r_lang"] .cb-item-title'); return t.scrollWidth <= t.clientWidth + 1 && t.getBoundingClientRect().height > 30; })(),
              foot: (() => { const f = document.querySelector('.cb-step-footer .primary-btn'); return f.getBoundingClientRect().right <= innerWidth; })() })""")
            check(f'320 px {theme}: kein seitlicher Überlauf, nichts abgeschnitten, langer Name bricht um, Weiter im Bild', ovf['x'] <= 0 and not ovf['cut'] and ovf['title'] and ovf['foot'], str(ovf))
        for step in (3,):
            await ev(f"() => {{ state.cookbookStep = {step}; render(); }}"); await page.wait_for_timeout(200)
            x = await ev("() => document.documentElement.scrollWidth - innerWidth")
            check(f'320 px Schritt {step}: kein seitlicher Überlauf', x <= 0, str(x))
        await page.screenshot(path=os.path.join(OUT, 'v85_320_dark_schritt3.png'), full_page=True)

        # ---------- Desktop: Kapitelauswahl in der Zeile, Spalten ----------
        await page.set_viewport_size({'width': 1280, 'height': 800})
        await ev("() => { document.documentElement.dataset.theme = 'light'; const c = getCookbookConfig(); c.items = c.items.filter(i => i.recipeId !== 'r_kartoffel'); saveCookbookConfig(c); state.cookbookStep = 1; render(); window.scrollTo(0, 0); }"); await page.wait_for_timeout(300)
        d = await ev("""() => { const R = s => document.querySelector(s).getBoundingClientRect(); const sel = document.querySelector('.cb-book .cb-item select[data-cb-item-chapter]');
          return { sel: !!sel && getComputedStyle(sel).display !== 'none' && sel.offsetHeight >= 44, bookLeft: R('.cb-book').left < R('.cb-more').left, moreAbove: R('.cb-more').bottom <= R('.cb-chapters').top + 1,
                   footer: R('.cb-step-footer').bottom <= innerHeight + 1, jump: getComputedStyle(document.querySelector('.cb-jump') || document.body).display }; }""")
        check('Desktop: Kapitelauswahl in der Zeile, Buch links, rechts «Weitere Rezepte» über «Kapitel», Fussleiste im Bild', d['sel'] and d['bookLeft'] and d['moreAbove'] and d['footer'], str(d))
        await page.select_option('.cb-book select[data-cb-item-chapter="r_cookies"]', 'c3')
        await page.wait_for_function("() => getCookbookConfig().items.find(i => i.recipeId === 'r_cookies').chapterId === 'c3'")
        check('Desktop: Kapitel in der Zeile wechseln speichert, Datenformat unverändert', await ev("() => Object.keys(getCookbookConfig().items[0]).sort().join(',')") == 'chapterId,recipeId')

        check('Keine JS-Fehler', not errs, str(errs[:3]))
        await b.close()
    print('\n' + ('ALLE OK' if not FAIL else f'{len(FAIL)} FEHLER: ' + '; '.join(FAIL)))
    sys.exit(1 if FAIL else 0)

asyncio.run(main())
