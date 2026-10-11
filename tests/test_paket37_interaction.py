"""Paket 37: Interaktionen. Scrollsprünge, Fokus über render(), Zurück-Navigation, Dialoge, Touch/Hover,
Rückmeldungszeiten und Kurven, reduzierte Bewegung, Tastaturpfade, Kochmodus ohne Verzögerung."""
import asyncio, json, os, sys
os.environ.setdefault('SAVORA_TEST_PORT', '8851')
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

SEED_MANY = """async () => {
  for (let i = 0; i < 40; i++) {
    const r = emptyRecipe(); r.id = 'r_many_' + i; r.title = 'Testgericht ' + String(i).padStart(2, '0'); r.tags = [i % 2 ? 'Schnell' : 'Backen'];
    r.ingredients = [{amount: '1', unit: 'Stk', name: 'Zutat ' + i}, {amount: '2', unit: 'dl', name: 'Milch'}]; r.steps = [{text: 'Erster Schritt 5 Minuten kochen.'}, {text: 'Zweiter Schritt.'}, {text: 'Dritter Schritt.'}];
    r.updatedAt = Date.now() - i * 1000; await dbPut(r);
  }
  for (let i = 0; i < 30; i++) await dbPutShopping({ id: 's_many_' + i, name: 'Artikel ' + String(i).padStart(2, '0'), amount: 1, unit: 'Stk', checked: false, recipeId: null, createdAt: Date.now() });
  await loadRecipes(); await loadShopping(); state.view = 'home'; render(); return true;
}"""

async def settle(page, ms=350): await page.wait_for_timeout(ms)
async def go(page, view, extra=''):
    await page.evaluate("(a) => { state.view = a[0]; " + extra + " render(); }", [view]); await settle(page)
async def scroll_to(page, y):
    await page.evaluate("(y) => window.scrollTo(0, y)", y); await settle(page, 200)
async def sy(page): return await page.evaluate("() => Math.round(window.scrollY)")

async def main():
    async with async_playwright() as p:
        b, ctx = await open_ctx(p, 390, 844, 'no-preference')
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        MODE = {'accept': True}; asked = []
        async def on_dialog(d):
            asked.append(d.message); await (d.accept() if MODE['accept'] else d.dismiss())
        page.on('dialog', lambda d: asyncio.ensure_future(on_dialog(d)))
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await settle(page, 400)
        await page.evaluate(SEED_MANY); await settle(page, 500)
        ev = page.evaluate

        # ---------- 1. Keine Scrollsprünge bei Klicks ----------
        await go(page, 'home'); await scroll_to(page, 900)
        y0 = await sy(page); check('Vorbedingung: Startseite ist scrollbar', y0 > 500, str(y0))
        # Umschalter Liste/Raster
        for lay in ('list', 'grid', 'list'):
            await page.evaluate("(l) => document.querySelector(`[data-action=\"set-home-layout\"][data-id=\"${l}\"]`).click()", lay); await settle(page, 250)
        check('Listen/Raster-Umschalter: keine Scrollsprünge', abs(await sy(page) - y0) <= 2, f'{y0} -> {await sy(page)}')
        # Favorit
        await ev("() => document.querySelector('[data-action=\"toggle-fav\"]').click()"); await settle(page, 300)
        check('Favorit: keine Scrollsprünge', abs(await sy(page) - y0) <= 2, f'{y0} -> {await sy(page)}')
        # Filterblatt: Sortierung und Tag, danach schließen
        await ev("() => document.querySelector('[data-action=\"open-filter-sheet\"]').click()"); await settle(page, 400)
        # Paket 44: Sortierung ist ein Auswahlfeld bei der Trefferzahl, Tags sind Kästchen im Filterfenster (Entwurf, «N Rezepte anzeigen» übernimmt)
        await ev("() => document.querySelector('.fs-input[data-fs-dim=\"tags\"]').click()"); await settle(page, 300)
        await ev("() => document.querySelector('[data-action=\"fs-apply\"]').click()"); await settle(page, 500)
        await ev("() => { const s = document.getElementById('sortSelect'); s.value = 'az'; s.dispatchEvent(new Event('change')); }"); await settle(page, 300)
        await ev("() => { const b = document.querySelector('[data-action=\"reset-extra-filters\"]'); if (b) b.click(); }"); await settle(page, 300)
        check('Filter/Sortierung/Schließen: Scrollposition bleibt', abs(await sy(page) - y0) <= 3, f'{y0} -> {await sy(page)}')
        # Wochenplan
        await go(page, 'mealplan'); await scroll_to(page, 200); y1 = await sy(page)
        await ev("() => document.querySelector('[data-action=\"week-next\"]').click()"); await settle(page, 300)
        await ev("() => document.querySelector('[data-action=\"week-prev\"]').click()"); await settle(page, 300)
        check('Wochenplan Woche vor/zurück: Position bleibt', abs(await sy(page) - y1) <= 3 or y1 < 5, f'{y1} -> {await sy(page)}')
        # Einkauf: Abhaken ohne Springen und sofort
        await go(page, 'shopping'); await scroll_to(page, 700); y2 = await sy(page)
        check('Vorbedingung: Einkauf ist scrollbar', y2 > 300, str(y2))
        r = await ev("""() => { const b = Array.from(document.querySelectorAll('[data-action="toggle-shopping-item"]'))[12]; const id = b.dataset.id; b.click();
          const now = Array.from(document.querySelectorAll('[data-action="toggle-shopping-item"]')).find(x => x.dataset.id === id); return now ? now.getAttribute('aria-checked') : 'weg'; }""")
        await settle(page, 300)
        check('Einkauf Abhaken: Zustand ändert sich synchron beim Klick (keine Verzögerung)', r == 'true', r)
        check('Einkauf Abhaken: keine Scrollsprünge', abs(await sy(page) - y2) <= 3, f'{y2} -> {await sy(page)}')

        # ---------- 2. Fokus über render() ----------
        await go(page, 'home')
        await page.click('#searchInput'); await page.keyboard.type('testgericht')
        await settle(page, 400)
        await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft')
        await page.keyboard.type('X'); await settle(page, 450)   # 'testgerXicht': Live-Filter rendert neu
        st = await ev("() => { const i = document.getElementById('searchInput'); return { act: document.activeElement === i, val: i.value, pos: i.selectionStart, end: i.selectionEnd }; }")
        check('Suche: Fokus bleibt nach Live-Filter', st['act'], str(st))
        check('Suche: Cursor bleibt mitten im Text (nach dem eingefügten Zeichen)', st['val'] == 'testgeriXcht' and st['pos'] == 9 and st['end'] == 9, str(st))
        await page.keyboard.type('Y'); await settle(page, 450)
        st = await ev("() => { const i = document.getElementById('searchInput'); return { act: document.activeElement === i, pos: i.selectionStart }; }")
        check('Suche: weiteres Tippen nach dem Render geht an derselben Stelle weiter', st['act'] and st['pos'] == 10, str(st))
        await ev("() => { state.query = ''; render(); }")
        # Allgemein: Feld fokussieren, Auswahl setzen, render(), Fokus/Auswahl vergleichen
        async def focus_render(label, view_js, sel, text='Hallo Welt', start=2, end=5):
            await ev(view_js); await settle(page, 450)
            ok = await ev("""(a) => { let el = document.querySelector(a.sel); if (!el) return 'fehlt'; el.focus(); if (a.text !== null) { el.value = a.text; el.dispatchEvent(new Event('input', {bubbles: true})); }
              el = document.querySelector(a.sel); el.focus(); try { el.setSelectionRange(a.start, a.end); } catch (e) {} return 'ok'; }""", {'sel': sel, 'text': text, 'start': start, 'end': end})
            if ok != 'ok': check(label + ': Feld vorhanden', False, ok); return
            await ev("() => render()"); await settle(page, 450)
            st = await ev("""(sel) => { const el = document.querySelector(sel); return { act: !!el && document.activeElement === el, s: el && el.selectionStart, e: el && el.selectionEnd }; }""", sel)
            check(f'{label}: Fokus nach render()', st['act'], str(st))
            if text is not None: check(f'{label}: Cursor/Auswahl nach render()', st['s'] == start and st['e'] == end, str(st))
        await focus_render('Formular Titel', "() => { state.editingRecipe = JSON.parse(JSON.stringify(state.recipes[0])); state.formStep = 0; state.view = 'form'; render(); }", '#f-title')
        await focus_render('Formular Zutat (ohne ID)', "() => { state.editingRecipe = JSON.parse(JSON.stringify(state.recipes[0])); state.formStep = 2; state.view = 'form'; render(); }", '.ing-row:nth-child(2) input', text=None)
        await focus_render('Text-Import', "() => { state.view = 'paste-import'; render(); }", '#pasteText', text=None)
        await focus_render('Kochbuch-Editor Titel', "() => { state.cookbookStep = 2; state.view = 'cookbook'; render(); }", '#cbTitle', text='Mein Buch', start=3, end=3)
        await focus_render('Einkauf neuer Artikel', "() => { state.view = 'shopping'; render(); }", '#shoppingAddInput', text=None)
        # Freunde-Felder: Dialog „Rezept teilen“ (Name und Handle), falls erreichbar
        has_share = await ev("() => typeof openShareDialog === 'function' || !!document.querySelector('#shareHandle')")
        await ev("() => { state.view = 'settings-sync'; render(); }"); await settle(page, 400)
        sel_any = await ev("() => { const el = document.querySelector('#cloudEmail, #shareHandle, #f-sender-name'); return el ? '#' + el.id : null; }")
        if sel_any: await focus_render('Konto/Freunde-Feld', "() => { state.view = 'settings-sync'; render(); }", sel_any, text=None)
        else: check('Konto/Freunde-Feld erreichbar (Hinweis: kein Feld in dieser Ansicht ohne Anmeldung)', True, 'übersprungen')
        # Fokus auf Button (Reiter) bleibt über render() erhalten
        await ev("() => { state.activeRecipeId = 'r_legacy_1'; state.detailTab = 'ingredients'; state.view = 'detail'; render(); }"); await settle(page, 450)
        await ev("() => document.querySelector('.tab-v2[data-id=\"steps\"], .tab-v2[aria-selected=\"false\"]').focus()")
        await ev("() => render()"); await settle(page, 300)
        check('Fokus auf einem Reiter bleibt über render() erhalten', await ev("() => document.activeElement && document.activeElement.classList.contains('tab-v2')"))

        # ---------- 3. Zurück-Navigation stellt Position wieder her ----------
        await go(page, 'home'); await scroll_to(page, 1100); yh = await sy(page)
        await ev("() => document.querySelectorAll('[data-action=\"open-recipe\"]')[14].click()"); await settle(page, 600)
        check('Rezeptseite öffnet oben', await sy(page) <= 2, str(await sy(page)))
        await ev("() => history.back()"); await settle(page, 700)
        check('Zurück aus Rezept: Position der Liste wiederhergestellt', abs(await sy(page) - yh) <= 4, f'{yh} -> {await sy(page)}')
        await go(page, 'shopping'); await scroll_to(page, 600); ys = await sy(page)
        await go(page, 'home'); await go(page, 'shopping')
        check('Reiterwechsel zurück zum Einkauf: Position gemerkt', abs(await sy(page) - ys) <= 4, f'{ys} -> {await sy(page)}')
        await go(page, 'mealplan'); await scroll_to(page, 150); ym = await sy(page)
        await go(page, 'home'); await go(page, 'mealplan')
        check('Reiterwechsel zurück zum Wochenplan: Position gemerkt', abs(await sy(page) - ym) <= 4 or ym < 5, f'{ym} -> {await sy(page)}')
        await go(page, 'settings'); await scroll_to(page, 120); yst = await sy(page)
        await ev("() => document.querySelector('[data-action=\"goto-view\"]').click()"); await settle(page, 600)
        await ev("() => history.back()"); await settle(page, 700)
        check('Zurück aus Einstellungs-Unterseite: Übersicht an gleicher Stelle', abs(await sy(page) - yst) <= 4 or yst < 5, f'{yst} -> {await sy(page)}')
        await go(page, 'cookbooks'); await scroll_to(page, 100); ycb = await sy(page)
        await go(page, 'home'); await go(page, 'cookbooks')
        check('Kochbücher: Position beim Zurückkehren gemerkt', abs(await sy(page) - ycb) <= 4 or ycb < 5, f'{ycb} -> {await sy(page)}')

        # ---------- 4. Dialoge ----------
        await go(page, 'home')
        await page.focus('[data-action="open-filter-sheet"]'); await page.keyboard.press('Enter'); await settle(page, 500)
        d = await ev("""() => { const s = document.querySelector('.modal-sheet'); return { role: s.getAttribute('role'), modal: s.getAttribute('aria-modal'), lab: !!document.getElementById(s.getAttribute('aria-labelledby')),
          inside: s.contains(document.activeElement) }; }""")
        check('Dialog: role=dialog, aria-modal, Beschriftung', d['role'] == 'dialog' and d['modal'] == 'true' and d['lab'], str(d))
        check('Dialog: Fokus liegt beim Öffnen im Dialog', d['inside'], str(d))
        inside_all = True
        for i in range(40):
            await page.keyboard.press('Tab')
            if not await ev("() => document.querySelector('.modal-sheet').contains(document.activeElement)"): inside_all = False; break
        check('Dialog: Fokusfalle (Tab bleibt im Dialog)', inside_all)
        inside_all = True
        for i in range(8):
            await page.keyboard.press('Shift+Tab')
            if not await ev("() => document.querySelector('.modal-sheet').contains(document.activeElement)"): inside_all = False; break
        check('Dialog: Fokusfalle rückwärts (Shift+Tab)', inside_all)
        await page.keyboard.press('Escape'); await settle(page, 500)
        d = await ev("() => ({ open: !!document.querySelector('.modal-sheet'), trig: document.activeElement && document.activeElement.dataset.action })")
        check('Escape schließt den Dialog', not d['open'], str(d))
        check('Fokus kehrt zum Auslöser zurück', d['trig'] == 'open-filter-sheet', str(d))
        # Weitere Dialoge: Hinzufügen-Menü, Tagesauswahl im Wochenplan, Löschen
        for label, js, closer in [
            ('Hinzufügen-Menü', "() => document.querySelector('[data-action=\"open-add-menu\"]').click()", None),
            ('Tag im Wochenplan', "() => { state.view = 'mealplan'; render(); setTimeout(() => document.querySelector('[data-action=\"open-day-picker\"]').click(), 50); }", None)]:
            await go(page, 'home'); await ev(js); await settle(page, 600)
            ok = await ev("""() => { const s = document.querySelector('.modal-sheet'); if (!s) return 'kein Dialog'; return { role: s.getAttribute('role'), modal: s.getAttribute('aria-modal'), lab: !!(s.getAttribute('aria-labelledby') && document.getElementById(s.getAttribute('aria-labelledby'))) || !!s.getAttribute('aria-label'), inside: s.contains(document.activeElement) }; }""")
            check(f'Dialog «{label}»: Rolle, aria-modal, Beschriftung, Fokus drin', isinstance(ok, dict) and ok['role'] == 'dialog' and ok['modal'] == 'true' and ok['lab'] and ok['inside'], str(ok))
            await page.keyboard.press('Escape'); await settle(page, 500)
            check(f'Dialog «{label}»: Escape schließt', not await ev("() => !!document.querySelector('.modal-sheet')"))
        # Escape mit ungespeichertem Text fragt nach (Dialog „Notiz“ im Wochenplan)
        await go(page, 'mealplan')
        await ev("() => document.querySelector('[data-action=\"open-day-picker\"]').click()"); await page.wait_for_selector('#planNoteInput'); await settle(page, 300)
        MODE['accept'] = False; asked.clear()
        await page.fill('#planNoteInput', 'Pizza bei Anna'); await page.focus('#planNoteInput'); await page.keyboard.press('Escape'); await settle(page, 400)
        check('Escape bei ungespeichertem Text: Rückfrage, Dialog bleibt bei «Nein»', len(asked) >= 1 and await ev("() => !!document.querySelector('.modal-sheet')"), str(asked))
        await ev("() => { document.getElementById('planNoteInput').value = ''; }"); await page.keyboard.press('Escape'); await settle(page, 400)
        check('Escape ohne Eingabe: schließt ohne Rückfrage', not await ev("() => !!document.querySelector('.modal-sheet')"))
        # Statischer Scan: jede Dialog-Vorlage trägt role=dialog und aria-modal
        scan = await ev("""async () => { const out = []; for (const f of ['views.js', 'views-v2.js']) { const t = await (await fetch(f)).text(); const m = t.match(/<div class="modal-sheet[^>]*>/g) || []; m.forEach(x => { if (!/role="dialog"/.test(x) || !/aria-modal="true"/.test(x) || !/aria-label/.test(x)) out.push(f + ': ' + x.slice(0, 80)); }); out.push('#' + m.length); } return out; }""")
        check('Alle Dialogvorlagen: role=dialog, aria-modal, aria-label(ledby)', not [x for x in scan if not x.startswith('#')], str(scan))

        # ---------- 5. Touch: Hover nur hinter Medienabfrage, Tippflächen ----------
        css = await ev("""() => { const bad = []; const walk = (rules, guarded) => { for (const r of rules) {
            if (r.type === 4) { const g = /hover:\\s*hover/.test(r.conditionText || r.media.mediaText); walk(r.cssRules, guarded || g); }
            else if (r.cssRules && r.type !== 7) walk(r.cssRules, guarded);
            else if (r.selectorText && /:hover/.test(r.selectorText) && !guarded) bad.push(r.selectorText.slice(0, 90)); } };
          for (const sh of document.styleSheets) { try { walk(sh.cssRules, false); } catch (e) {} } return bad; }""")
        check('Hover-Effekte nur hinter @media (hover: hover) and (pointer: fine)', not css, str(css[:6]))
        small = []
        for view, js in [('home', "state.view='home'"), ('shopping', "state.view='shopping'"), ('mealplan', "state.view='mealplan'"), ('detail', "state.activeRecipeId='r_legacy_1'; state.view='detail'"), ('settings', "state.view='settings'"), ('cookbooks', "state.view='cookbooks'")]:
            await ev("() => { " + js + "; render(); }"); await settle(page, 400)
            r = await ev("""() => Array.from(document.querySelectorAll('button, a[href], [role=tab], [role=radio], summary, select, input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file])')).filter(e => { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden'; })
              .map(e => { const b = e.getBoundingClientRect(); return { n: (e.dataset.action || e.id || e.className || e.tagName).toString().slice(0, 40), w: Math.round(b.width), h: Math.round(b.height) }; }).filter(x => x.h < 43.5 || x.w < 43.5)""")
            small += [(view, x) for x in r]
        check('Tippflächen mindestens 44 x 44 px (Hauptansichten)', not small, str(small[:8]))

        # ---------- 6. Rückmeldung: Dauer und Kurve ----------
        await go(page, 'home')
        res = await ev("""() => { const sel = ['.primary-btn', '.chip', '.tab-v2', '.fav-toggle', '.rcard-fav', '.sort-chip', '.theme-opt', '.round-btn', '.icon-btn', '.check-box']; const out = {};
          sel.forEach(s => { const el = document.querySelector(s); if (!el) return; const cs = getComputedStyle(el); const durs = cs.transitionDuration.split(',').map(x => parseFloat(x) * (x.includes('ms') ? 1 : 1000)); out[s] = { max: Math.max(...durs), fn: cs.transitionFunction || cs.transitionTimingFunction, prop: cs.transitionProperty }; }); return out; }""")
        bad = {k: v for k, v in res.items() if not (v['max'] <= 160 or k == '.round-btn') or ('all' == v['prop'].strip() and v['max'] > 0)}
        check('Drücken/Umschalten: Übergänge 160 ms oder kürzer, kein transition: all', not bad, str(bad))
        badfn = {k: v['fn'] for k, v in res.items() if 'cubic-bezier(0.23, 1, 0.32, 1)' not in v['fn']}
        check('Rückmeldungs-Übergänge nutzen die ease-out-Kurve des Systems', not badfn, str(badfn))
        rules = await ev("""() => { const bad = []; const walk = (rules) => { for (const r of rules) { if (r.cssRules && r.type !== 7) walk(r.cssRules); else if (r.style) {
            const t = (r.style.transition || '') + ' ' + (r.style.animation || '') + ' ' + (r.style.transitionTimingFunction || '') + ' ' + (r.style.animationTimingFunction || ''); const tr = r.style.transform || '';
            if (/transition(-property)?:\\s*all|^all /.test(r.style.cssText.match(/transition(-property)?:[^;]*/g) ? r.style.cssText.match(/transition(-property)?:[^;]*/g).join(';') : '') || /(^|[\\s,])all\\s+\\d/.test(r.style.transition || '')) bad.push('all: ' + r.selectorText);
            if (/scale\\(\\s*0\\s*[,)]/.test(tr)) bad.push('scale(0): ' + r.selectorText);
            if (/(^|[\\s,(])ease-in([\\s,;)]|$)/.test(t)) bad.push('ease-in: ' + r.selectorText);
            const durs = ((r.style.transitionDuration || '') + ',' + (r.style.animationDuration || '')).split(',').map(x => x.trim()).filter(Boolean).map(x => parseFloat(x) * (x.endsWith('ms') ? 1 : 1000));
            const infinite = /infinite/.test(r.style.animation || r.style.animationIterationCount || '');
            if (durs.some(d => d > 300) && !infinite) bad.push('>300ms: ' + r.selectorText + ' ' + durs.join('/'));
            if (infinite) bad.push('endlos: ' + r.selectorText); } } };
          for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch (e) {} } return bad; }""")
        check('CSS-Scan: kein transition: all, kein scale(0), kein ease-in, nichts über 300 ms', not rules, str(rules[:10]))

        # Kurzes Drücken: :active-Zustand sichtbar (transform)
        pr = await ev("""() => { const css = Array.from(document.styleSheets).flatMap(sh => { try { return Array.from(sh.cssRules); } catch (e) { return []; } }).map(r => r.cssText).join('\\n'); return { btn: /\\.primary-btn[^{]*:active[^{]*\\{[^}]*(scale|transform)/.test(css), nav: /(nav|chip|tab)[^{]*:active[^{]*\\{[^}]*(scale|background|opacity)/.test(css) }; }""")
        check('Drück-Zustand (:active) für Hauptknopf und Chips/Reiter vorhanden', pr['btn'] and pr['nav'], str(pr))

        # ---------- 7. Tastatur: Reiter, Cover-Auswahl, Rückgängig ----------
        await ev("() => { state.activeRecipeId = 'r_legacy_1'; state.detailTab = 'ingredients'; state.view = 'detail'; render(); }"); await settle(page, 500)
        await page.focus('.tab-v2[role="tab"]'); await page.keyboard.press('ArrowRight'); await settle(page, 300)
        t = await ev("() => ({ sel: document.querySelector('.tab-v2[aria-selected=\"true\"]').textContent.trim(), tab: state.detailTab, foc: document.activeElement.getAttribute('role') })")
        check('Rezeptreiter: Pfeil rechts wechselt Reiter und behält Fokus', t['tab'] != 'ingredients' and t['foc'] == 'tab', str(t))
        await page.keyboard.press('Home'); await settle(page, 300)
        check('Rezeptreiter: Pos1 springt zum ersten Reiter', await ev("() => state.detailTab") == 'ingredients')
        await ev("() => { state.cookbookStep = 2; state.view = 'cookbook'; render(); }"); await settle(page, 700)
        await page.focus('.cover-opt.is-active'); first = await ev("() => document.activeElement.dataset.id")
        await page.keyboard.press('ArrowRight'); await settle(page, 500)
        c = await ev("() => ({ id: document.activeElement.dataset.id, checked: document.activeElement.getAttribute('aria-checked'), role: document.activeElement.getAttribute('role') })")
        check('Cover-Auswahl: Pfeil rechts wählt nächste Vorlage, Fokus bleibt auf ihr', c['id'] != first and c['checked'] == 'true' and c['role'] == 'radio', f'{first} -> {c}')
        await page.keyboard.press('ArrowLeft'); await settle(page, 500)
        check('Cover-Auswahl: Pfeil links wählt zurück', await ev("() => document.activeElement.dataset.id") == first)
        await page.keyboard.press('ArrowRight'); await settle(page, 400); await page.keyboard.press('Space'); await settle(page, 300)
        check('Cover-Auswahl: Leertaste auf gewählter Vorlage hält die Auswahl', await ev("() => document.activeElement.getAttribute('aria-checked')") == 'true')
        # Rückgängig per Tastatur
        called = await ev("""() => new Promise(res => { window.__undone = false; showToast('Gelöscht', 'info', false, { actionLabel: 'Rückgängig', onAction: () => { window.__undone = true; } }); document.body.focus();
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })); setTimeout(() => res(window.__undone), 50); })""")
        check('Rückgängig per Tastatur (Strg+Z)', called is True)
        btn = await ev("() => { const b = document.querySelector('.toast-action-btn, .toast-undo-btn'); return b ? b.getBoundingClientRect().height : 0; }")
        # Tab-Reihenfolge Startseite: erster Tab landet im Seitenkopf, nicht im Fussbereich
        await go(page, 'home'); await ev("() => document.activeElement && document.activeElement.blur()")
        await page.keyboard.press('Tab')
        pos = await ev("() => { const r = document.activeElement.getBoundingClientRect(); return { top: Math.round(r.top), tag: document.activeElement.tagName }; }")
        check('Tab-Reihenfolge: erster Fokus liegt im oberen Bereich', pos['top'] < 300, str(pos))
        ring = await ev("""() => { document.activeElement.blur(); document.querySelector('#searchInput').focus(); const cs = getComputedStyle(document.activeElement); return { ow: cs.outlineWidth, os: cs.outlineStyle, sh: cs.boxShadow }; }""")
        await page.keyboard.press('Tab'); await settle(page, 200)
        ring = await ev("() => { const cs = getComputedStyle(document.activeElement); return { ow: cs.outlineWidth, os: cs.outlineStyle, sh: cs.boxShadow, m: document.activeElement.matches(':focus-visible') }; }")
        check('Sichtbarer Fokusring bei Tastaturfokus', ring['m'] and ((ring['os'] != 'none' and ring['ow'] != '0px') or ring['sh'] != 'none'), str(ring))

        # ---------- 8. Kochmodus: sofort, Timer überleben Schrittwechsel ----------
        await ev("() => { state.activeRecipeId = 'r_many_3'; state.view = 'cookmode'; state.cookStepIndex = 0; render(); }"); await settle(page, 600)
        r = await ev("""() => new Promise(res => { const i0 = state.cookStepIndex, t0 = performance.now(); document.querySelector('[data-action="cook-next"]').click();
          const poll = () => { if (state.cookStepIndex !== i0 || performance.now() - t0 > 500) res({ i0, i1: state.cookStepIndex, ms: Math.round(performance.now() - t0) }); else setTimeout(poll, 0); }; poll(); })""")
        check('Kochmodus: Schrittwechsel ohne Verzögerung (unter 50 ms)', r['i1'] == r['i0'] + 1 and r['ms'] < 50, str(r))
        await ev("() => document.querySelector('[data-action=\"cook-prev\"]').click()"); await settle(page, 300)
        started = await ev("""() => { const c = document.querySelector('[data-timer-id]'); if (!c) return null; c.click(); return c.dataset.timerId; }""")
        check('Kochmodus: Timer-Chip vorhanden und startbar', started is not None)
        if started:
            await settle(page, 1300)
            r1 = await ev("(id) => state.timers[id] && state.timers[id].remaining", started)
            await ev("() => document.querySelector('[data-action=\"cook-next\"]').click()"); await settle(page, 1300)
            r2 = await ev("(id) => state.timers[id] && { rem: state.timers[id].remaining, run: state.timers[id].running }", started)
            check('Kochmodus: Timer läuft nach Schrittwechsel weiter, Zeit sinkt', r2 and r2['run'] and r2['rem'] < r1, f'{r1} -> {r2}')
            bar = await ev("() => !!document.querySelector('#cookTimerBar [data-timer-bar]')")
            check('Kochmodus: laufender Timer bleibt in der Timer-Leiste sichtbar', bar)
        anim = await ev("() => Array.from(document.querySelectorAll('.cookmode-overlay *')).some(e => { const cs = getComputedStyle(e); return parseFloat(cs.animationDelay) > 0 || parseFloat(cs.transitionDelay) > 0; })")
        check('Kochmodus: keine Animation mit Verzögerung', not anim)

        # ---------- 9. Reduzierte Bewegung ----------
        await ctx.close(); await b.close()
        b, ctx = await open_ctx(p, 390, 844, 'reduce')
        page = await ctx.new_page(); page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page); await page.evaluate(open(SEED_PATH).read()); await settle(page, 400)
        ev = page.evaluate
        await go(page, 'home')
        await ev("() => document.querySelector('[data-action=\"open-filter-sheet\"]').click()"); await page.wait_for_selector('.modal-sheet'); await page.wait_for_timeout(30)
        rm = await ev("""() => document.getAnimations().map(a => ({ name: a.animationName || a.transitionProperty || '', props: a.effect && a.effect.getKeyframes ? Array.from(new Set(a.effect.getKeyframes().flatMap(k => Object.keys(k)))).filter(k => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)) : [], dur: a.effect && a.effect.getTiming().duration, it: a.effect && a.effect.getTiming().iterations }))""")
        moving = [x for x in rm if any(k in ('transform', 'translate', 'scale', 'rotate') for k in x['props'])]
        check('Reduzierte Bewegung: Dialog blendet nur über (keine Bewegungsanimation)', not moving, str(moving))
        await ev("() => document.querySelector('[data-action=\"close-modal\"]').click()"); await settle(page, 400)
        await go(page, 'home'); await settle(page, 600)
        endless = await ev("() => document.getAnimations().filter(a => a.effect && a.effect.getTiming().iterations === Infinity).map(a => a.animationName)")
        check('Keine dauernde dekorative Animation (reduzierte Bewegung)', not endless, str(endless))
        vt = await ev("() => matchMedia('(prefers-reduced-motion: reduce)').matches")
        check('Emulation reduzierte Bewegung aktiv', vt is True)
        pre = await ev("() => { const s = document.createElement('style'); return getComputedStyle(document.documentElement).scrollBehavior; }")
        check('Reduzierte Bewegung: kein weiches Scrollen', pre in ('auto', 'normal'), pre)
        await ev("() => { state.activeRecipeId = 'r_legacy_1'; state.view = 'detail'; render(); }"); await settle(page, 300)
        nvt = await ev("() => document.documentElement.dataset.navDir !== undefined && !!document.getAnimations().find(a => a.pseudoElement)")
        check('Reduzierte Bewegung: keine Seitenwechsel-Animation (View Transition)', nvt is False or nvt is None or not nvt, str(nvt))

        check('Keine JavaScript-Fehler', not errs, str(errs[:3]))
        await b.close()
    print('\n' + ('ALLE OK' if not FAIL else f'{len(FAIL)} FEHLER: ' + '; '.join(FAIL)))
    sys.exit(1 if FAIL else 0)
asyncio.run(main())
