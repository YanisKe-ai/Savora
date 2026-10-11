"""Paket 37: Wochenplan (Tagesliste, Wochenuebersicht, Notizeintraege) und Einkauf (Doppeluebernahme,
manuelle Mengen, Abhaken ohne Springen, Rueckgaengig, Rueckmeldungen mit Zahl, Tastatur, reduzierte Bewegung)."""
import asyncio, json, os, sys
os.environ.setdefault('SAVORA_TEST_PORT', '8825')
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

OVERFLOW = "() => document.documentElement.scrollWidth <= window.innerWidth + 1"
DB_SHOP = "() => dbGetAllShopping().then(l => JSON.stringify(l.sort((a, b) => a.id.localeCompare(b.id))))"

async def click(page, sel):
    await page.evaluate("(s) => document.querySelector(s).click()", sel)
    await page.wait_for_timeout(250)

async def fresh(p, w=390, h=844, motion='reduce'):
    b, ctx = await open_ctx(p, w, h, motion)
    page = await ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    await goto(page); await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(400)
    return b, ctx, page, errs

async def main():
    async with async_playwright() as p:
        # ---------- Wochenplan mobil (390 px) ----------
        b, ctx, page, errs = await fresh(p)
        ev = page.evaluate
        await ev("() => { state.view = 'mealplan'; render(); }"); await page.wait_for_timeout(300)
        d = await ev("""() => ({ days: document.querySelectorAll('.plan-day').length, nested: document.querySelectorAll('.day-card, .day-card .day-card').length,
          heute: Array.from(document.querySelectorAll('.plan-today')).map(e => e.textContent),
          dateSize: Math.min(...Array.from(document.querySelectorAll('.plan-day-date')).map(e => parseFloat(getComputedStyle(e).fontSize))),
          nameWeight: getComputedStyle(document.querySelector('.plan-day-title')).fontWeight, titles: Array.from(document.querySelectorAll('.plan-title')).map(e => e.textContent),
          adds: Array.from(document.querySelectorAll('.plan-add')).map(e => e.textContent.trim()), addBorder: getComputedStyle(document.querySelector('.plan-add')).borderStyle,
          cols: getComputedStyle(document.querySelector('.plan-week')).display })""")
        check('Mobil: sieben Tage als Tagesliste, keine Karte-in-Karte', d['days'] == 7 and d['nested'] == 0 and d['cols'] == 'flex', str(d))
        check('Mobil: Datum mindestens 14 px, Wochentag 600', d['dateSize'] >= 14 and d['nameWeight'] == '600', f"{d['dateSize']} {d['nameWeight']}")
        check('Mobil: heutiger Tag mit Text «Heute»', d['heute'] == ['Heute'], str(d['heute']))
        check('Mobil: alter Wochenplan (Seed) zeigt beide Rezepte', d['titles'] == ['Sloppy Joe Buns', 'Carbonara'], str(d['titles']))
        check('Mobil: «Rezept planen» als Textzeile statt gestrichelter Karte', all('Rezept planen' in a for a in d['adds']) and 'dashed' not in d['addBorder'])
        check('Mobil: kein seitlicher Überlauf', await ev(OVERFLOW))
        check('Leere Tage erlaubt: Woche mit nur 2 Rezepten, Einkauf-Knopf aktiv, Plan ohne Pflichtfelder', await ev("() => document.querySelectorAll('.plan-day.is-empty').length >= 5 && !document.querySelector('[data-action=\"mealplan-to-shopping\"]').disabled"))

        # Notizeintraege anlegen
        week = await ev("() => currentWeekDays()")
        day = week[2]
        async def open_picker(dk):
            await click(page, f'[data-action="open-day-picker"][data-date="{dk}"]')
            await page.wait_for_selector('#planNoteInput')
        await open_picker(day)
        await click(page, '[data-action="add-plan-note"][data-note="Reste"]'); await page.wait_for_timeout(300)
        await open_picker(day)
        await click(page, '[data-action="add-plan-note"][data-note="Auswärts"]'); await page.wait_for_timeout(300)
        await open_picker(day)
        await page.fill('#planNoteInput', 'x' * 70)
        check('Eigene Notiz: Eingabefeld begrenzt auf 60 Zeichen', await ev("() => document.getElementById('planNoteInput').maxLength") == 60)
        await page.fill('#planNoteInput', 'Pizza bei Anna')
        await click(page, '[data-action="add-plan-note"]:not([data-note])'); await page.wait_for_timeout(300)
        rec = await ev(f"dbGetAllMealplan().then(l => l.find(d => d.date === '{day}'))")
        notes = [e for e in rec['entries'] if e.get('type') == 'note']
        check('Notizen gespeichert (Reste, Auswärts, eigene) ohne recipeId, recipeIds unverändert', [n['text'] for n in notes] == ['Reste', 'Auswärts', 'Pizza bei Anna'] and all('recipeId' not in n for n in notes) and rec['recipeIds'] == [], json.dumps(rec)[:300])
        shown = await ev("() => Array.from(document.querySelectorAll('.plan-entry--note .plan-title')).map(e => e.textContent)")
        check('Notizen werden angezeigt', shown == ['Reste', 'Auswärts', 'Pizza bei Anna'], str(shown))
        check('Notizen brechen die Ansicht nicht (Rezepte bleiben, kein Überlauf, keine Fehler)', await ev(OVERFLOW) and not errs, str(errs[:2]))
        # Startseiten-Hilfsfunktion: Notizen zaehlen, nichts geplant = leer
        pf = await ev(f"() => [plannedItemsFor('{day}').length, plannedItemsFor('2099-01-01').length, plannedItemsFor(fmtDateKey(getMonday(new Date()))).length]")
        check('plannedItemsFor: Notizen zählen, leerer Tag liefert nichts', pf == [3, 0, 2], str(pf))
        # Einkauf aus Wochenplan mit Notizen
        await click(page, '[data-action="mealplan-to-shopping"]'); await page.wait_for_selector('.shop-select-list')
        rows1 = await ev("() => document.querySelectorAll('.shop-select-row').length")
        check('Einkauf aus Wochenplan: Notizen ignoriert, Zutaten der Rezepte da', rows1 >= 5, str(rows1))
        await ev("() => { state.shopping = []; }")
        await ev("async () => { for (const i of await dbGetAllShopping()) await dbDeleteShopping(i.id); await loadShopping(); }")
        before_n = await ev("() => state.shopping.length")
        await click(page, '[data-action="confirm-shop-select"]'); await page.wait_for_timeout(400)
        toast = await ev("() => (document.querySelector('.toast .toast-text') || {}).textContent")
        n1 = await ev("() => state.shopping.length")
        import re
        check('Rückmeldung mit Zahl: «N Zutaten hinzugefügt»', bool(re.match(r'^\d+ Zutaten? hinzugefügt', toast or '')), str(toast))
        # zweites Mal: keine stille Verdoppelung
        shop_before = await ev("() => JSON.stringify(state.shopping.map(i => [i.name, i.amount, i.unit]))")
        await ev("() => { state.view = 'mealplan'; render(); }"); await page.wait_for_timeout(200)
        await click(page, '[data-action="mealplan-to-shopping"]'); await page.wait_for_selector('.shop-select-list')
        dup = await ev("() => ({ hint: (document.querySelector('.shop-dup-hint') || {}).textContent, checked: document.querySelectorAll('.shop-select-row input:checked').length, total: document.querySelectorAll('.shop-select-row').length })")
        check('Zweite Übernahme desselben Wochenplans: Hinweis «Schon auf der Einkaufsliste: N Zutaten», alle abgewählt', 'Schon auf der Einkaufsliste' in (dup['hint'] or '') and dup['checked'] == 0 and dup['total'] > 0, str(dup))
        await click(page, '[data-action="confirm-shop-select"]'); await page.wait_for_timeout(400)
        toast2 = await ev("() => (document.querySelector('.toast .toast-text, .toast') || {}).textContent")
        shop_after = await ev("() => JSON.stringify(state.shopping.map(i => [i.name, i.amount, i.unit]))")
        check('Zweite Übernahme: «Nichts Neues hinzugefügt», Liste unverändert', 'Nichts Neues hinzugefügt' in (toast2 or '') and shop_after == shop_before, str(toast2))
        # bewusst nochmals: Haken setzen
        await ev("() => { state.view = 'mealplan'; render(); }"); await page.wait_for_timeout(200)
        await click(page, '[data-action="mealplan-to-shopping"]'); await page.wait_for_selector('.shop-select-list')
        await ev("() => document.querySelector('.shop-select-row input').click()")
        await click(page, '[data-action="confirm-shop-select"]'); await page.wait_for_timeout(400)
        toast3 = await ev("() => (document.querySelector('.toast .toast-text') || {}).textContent")
        check('Bewusstes Nochmals-Hinzufügen einer Zutat: «1 Zutat hinzugefügt»', (toast3 or '').startswith('1 Zutat hinzugefügt'), str(toast3))
        # Rueckgaengig stellt exakt wieder her
        await ev("() => document.querySelector('.toast-action-btn').click()"); await page.wait_for_timeout(500)
        after_undo = await ev("() => JSON.stringify(state.shopping.map(i => [i.name, i.amount, i.unit]))")
        check('Rückgängig nach «Hinzufügen» stellt die Liste exakt wieder her', after_undo == shop_before)

        # Notiz bearbeiten/verschieben/loeschen mit Rueckgaengig
        await ev("() => { state.view = 'mealplan'; render(); }"); await page.wait_for_timeout(200)
        nid = notes[0]['id']
        await click(page, f'[data-action="open-plan-entry"][data-id="{nid}"]')
        check('Notiz-Dialog: Textfeld, Mahlzeit, Verschieben, Entfernen', await ev("() => !!document.getElementById('planNoteEdit') && !!document.getElementById('planMoveDay') && !!document.querySelector('[data-action=\"remove-plan-entry\"]')"))
        await click(page, '[data-action="remove-plan-entry"]'); await page.wait_for_timeout(300)
        left = await ev(f"dbGetAllMealplan().then(l => l.find(d => d.date === '{day}').entries.map(e => e.text))")
        check('Notiz gelöscht', left == ['Auswärts', 'Pizza bei Anna'], str(left))
        await ev("() => document.querySelector('.toast-action-btn').click()"); await page.wait_for_timeout(400)
        back = await ev(f"dbGetAllMealplan().then(l => l.find(d => d.date === '{day}').entries.map(e => e.text))")
        check('Rückgängig stellt die gelöschte Notiz wieder her', back == ['Reste', 'Auswärts', 'Pizza bei Anna'], str(back))
        await click(page, f'[data-action="open-plan-entry"][data-id="{nid}"]')
        await ev(f"() => {{ document.getElementById('planMoveDay').value = '{week[4]}'; }}")
        await click(page, '[data-action="save-plan-entry"]'); await page.wait_for_timeout(300)
        moved = await ev(f"dbGetAllMealplan().then(l => l.find(d => d.date === '{week[4]}').entries.map(e => e.text))")
        check('Notiz verschoben', moved == ['Reste'], str(moved))
        # Notizen im Backup/Sync-Record erhalten (Record unveraendert gespeichert)
        check('Plan-Eintrag Notiz hat Form {id, type, text}', await ev(f"dbGetAllMealplan().then(l => {{ const e = l.find(d => d.date === '{week[4]}').entries[0]; return Object.keys(e).sort().join() === 'id,text,type'; }})"))
        check('Wochenplan ohne Seitenfehler', not errs, str(errs[:2]))
        # 24 px
        await ev("() => { document.documentElement.style.fontSize = '24px'; }"); await page.wait_for_timeout(300)
        check('Wochenplan bei Schriftgrösse 24 px ohne Überlauf', await ev(OVERFLOW))
        await ev("() => { document.documentElement.style.fontSize = ''; }")
        await b.close()

        # ---------- Wochenuebersicht breit (1280 px) ----------
        b, ctx, page, errs = await fresh(p, 1280, 900)
        ev = page.evaluate
        await ev("() => { state.view = 'mealplan'; render(); }"); await page.wait_for_timeout(400)
        w = await ev("""() => { const days = Array.from(document.querySelectorAll('.plan-day')); const lefts = new Set(days.map(d => Math.round(d.getBoundingClientRect().left)));
          return { n: days.length, cols: lefts.size, tracks: getComputedStyle(document.querySelector('.plan-week')).gridTemplateColumns.split(' ').length,
            minW: Math.min(...days.map(d => d.getBoundingClientRect().width)), nav: !!document.querySelector('[data-action="week-prev"]') && !!document.querySelector('[data-action="week-next"]'),
            short: Array.from(document.querySelectorAll('.plan-day-short')).map(e => e.textContent).join(), shortShown: getComputedStyle(document.querySelector('.plan-day-short')).display,
            titleSize: parseFloat(getComputedStyle(document.querySelector('.plan-title')).fontSize) } }""")
        # Aenderung Paket 37 (Anpassung): sieben Spalten erst ab 1400 px; bei 900 bis 1399 px vier plus drei (sonst brachen lange Titel in ~128-px-Spalten Buchstabe fuer Buchstabe)
        check('Breit (1280): sieben Tage in vier Spalten (4 + 3), Kurznamen Mo bis So', w['n'] == 7 and w['cols'] == 4 and w['tracks'] == 4 and w['short'] == 'Mo,Di,Mi,Do,Fr,Sa,So', str(w))
        await page.set_viewport_size({'width': 1440, 'height': 900}); await page.wait_for_timeout(300)
        w2 = await ev("() => ({ cols: new Set(Array.from(document.querySelectorAll('.plan-day')).map(d => Math.round(d.getBoundingClientRect().left))).size, tracks: getComputedStyle(document.querySelector('.plan-week')).gridTemplateColumns.split(' ').length })")
        check('Sehr breit (1440): sieben Spalten Mo bis So nebeneinander', w2['cols'] == 7 and w2['tracks'] == 7, str(w2))
        await page.set_viewport_size({'width': 1280, 'height': 900}); await page.wait_for_timeout(300)
        check('Breit: Spalten gut lesbar (Breite, Schrift) und Navigation Vor-/Folgewoche', w['minW'] >= 110 and w['titleSize'] >= 15 and w['nav'], str(w))
        check('Breit: kein seitlicher Überlauf', await ev(OVERFLOW))
        await click(page, '[data-action="week-next"]')
        check('Breit: Folgewoche leer, Tage bleiben', await ev("() => document.querySelectorAll('.plan-day').length === 7 && document.querySelectorAll('.plan-entry').length === 0"))
        await b.close()

        # ---------- Einkauf ----------
        b, ctx, page, errs = await fresh(p)
        ev = page.evaluate
        # kompatible Einheiten zusammenfuehren, inkompatible nicht, manuelle Mengen bleiben
        res = await ev("""async () => {
          for (const i of await dbGetAllShopping()) await dbDeleteShopping(i.id); await loadShopping();
          await addSelectionToShopping([{ name: 'Mehl', amount: 0.5, unit: 'kg', recipeId: 'a', title: 'A' }]);
          await addSelectionToShopping([{ name: 'Mehl', amount: 250, unit: 'g', recipeId: 'b', title: 'B' }]);
          await addSelectionToShopping([{ name: 'Milch', amount: 200, unit: 'g', recipeId: 'a', title: 'A' }]);
          await addSelectionToShopping([{ name: 'Milch', amount: 200, unit: 'ml', recipeId: 'b', title: 'B' }]);
          await addSelectionToShopping([{ name: 'Zwiebel', amount: 2, unit: '', recipeId: 'a', title: 'A' }]);
          await addSelectionToShopping([{ name: 'Zwiebeln', amount: 3, unit: '', recipeId: 'b', title: 'B' }]);
          await addSelectionToShopping([{ name: 'Öl', amount: 2, unit: 'EL', recipeId: 'a', title: 'A' }, { name: 'Öl', amount: 3, unit: 'TL', recipeId: 'b', title: 'B' }]);
          return state.shopping.map(i => [i.name, shopAmountLine(i)]); }""")
        d = dict((k, v) for k, v in res if k in ('Mehl', 'Zwiebel'))
        names = [k for k, v in res]
        check('Kompatible Einheiten werden zusammengeführt (0,5 kg + 250 g = 750 g; Zwiebel/Zwiebeln = 5)', d.get('Mehl') == '750 g' and names.count('Mehl') == 1 and (d.get('Zwiebel') or '').startswith('5'), str(res))
        check('Inkompatible bleiben getrennt (Milch g und ml)', names.count('Milch') == 2, str(res))
        man = await ev("""async () => {
          for (const i of await dbGetAllShopping()) await dbDeleteShopping(i.id); await loadShopping(); state.view = 'shopping'; render();
          document.getElementById('shoppingAddInput').value = '500 g Mehl'; document.querySelector('[data-action="add-shopping-item-manual"]').click();
          await new Promise(r => setTimeout(r, 300));
          await addSelectionToShopping([{ name: 'Mehl', amount: 200, unit: 'g', recipeId: 'a', title: 'A' }]);
          const manual = state.shopping.filter(i => i.name === 'Mehl').map(i => [shopAmountLine(i), !!i.manual]);
          const e = state.shopping.find(i => i.name === 'Mehl' && !i.manual); e.edited = true; await dbPutShopping(e);
          await addSelectionToShopping([{ name: 'Mehl', amount: 100, unit: 'g', recipeId: 'c', title: 'C' }]);
          return [manual, state.shopping.filter(i => i.name === 'Mehl').map(i => shopAmountLine(i)).sort()]; }""")
        check('Manuell eingetragene Menge bleibt: Rezept-Zutat bekommt eine eigene Zeile', man[0] == [['500 g', True], ['200 g', False]] or sorted(man[0]) == sorted([['500 g', True], ['200 g', False]]), str(man[0]))
        check('Von Hand geänderte Zeile (edited) wird nicht überschrieben', man[1] == ['100 g', '200 g', '500 g'], str(man[1]))
        # UI: Speichern im Dialog setzt edited
        edited = await ev("""async () => { const it = state.shopping.find(i => i.name === 'Mehl' && !i.manual && !i.edited); return it ? it.id : null; }""")
        # Abhaken ohne Springen
        await ev("""async () => { for (const i of await dbGetAllShopping()) await dbDeleteShopping(i.id); await loadShopping();
          await addSelectionToShopping([{ name: 'Äpfel', amount: 3, unit: '', recipeId: 'a', title: 'Apfelkuchen' }, { name: 'Zwiebel', amount: 2, unit: '', recipeId: 'a', title: 'Apfelkuchen' }, { name: 'Salat', amount: 1, unit: '', recipeId: 'b', title: 'Salat pur' }, { name: 'Karotten', amount: 4, unit: '', recipeId: 'b', title: 'Salat pur' }]);
          state.shopStay = new Set(); state.view = 'shopping'; render(); }""")
        await page.wait_for_timeout(300)
        pos = "() => Array.from(document.querySelectorAll('.shop-row')).map(r => [r.dataset.id, Math.round(r.getBoundingClientRect().top)])"
        p0 = await ev(pos)
        first = p0[1][0]
        t = await ev(f"""() => {{ const row = document.querySelector('.shop-row[data-id="{first}"]'); const btn = row.querySelector('.shop-check');
          btn.click(); return {{ checked: btn.getAttribute('aria-checked'), cls: row.classList.contains('is-checked') }}; }}""")
        check('Abhaken wirkt im selben Takt (Zustand sofort gesetzt, kein Warten auf Datenbank oder Animation)', t['checked'] == 'true' and t['cls'], str(t))
        await page.wait_for_timeout(300)
        p1 = await ev(pos)
        check('Abhaken: Zeilen springen nicht (Position vor und nach gleich, Reihenfolge gleich)', p0 == p1, f'{p0} / {p1}')
        tr = await ev(f"""() => {{ const row = document.querySelector('.shop-row[data-id="{first}"]'); return [getComputedStyle(row).transitionDuration, parseFloat(getComputedStyle(row.querySelector('.check-box')).transitionDuration) * 1000]; }}""")
        check('Abhaken: keine Verzögerung (Zeile ohne Übergang, Haken-Übergang höchstens 120 ms)', tr[0] == '0s' and tr[1] <= 120, str(tr))
        check('Abgehakte Zeile bleibt gedämpft/durchgestrichen an ihrer Stelle', await ev(f"""() => getComputedStyle(document.querySelector('.shop-row[data-id="{first}"] .shop-name')).textDecorationLine.includes('line-through')"""))
        check('«Erledigte nach unten» wird angeboten', await ev("() => !document.querySelector('[data-action=\"sort-checked-down\"]').disabled"))
        # Toast: aria-live, Mindestdauer, Tastatur
        live = await ev("() => document.getElementById('liveRegion').textContent")
        check('Toast mit «Rückgängig» wird per aria-live angesagt', 'Rückgängig' in live, live)
        check('Toast-Schaltfläche «Rückgängig» ist ein Button, mindestens 44 px', await ev("() => { const b = document.querySelector('.toast-action-btn'); const r = b.getBoundingClientRect(); return b.tagName === 'BUTTON' && b.textContent === 'Rückgängig' && r.height >= 44 && r.width >= 44; }"))
        await page.wait_for_timeout(5800)
        check('Toast bleibt mindestens 6 Sekunden sichtbar', await ev("() => !!document.querySelector('.toast-action-btn')"))
        # Tastatur: Fokus auf Schaltflaeche, Enter
        await page.focus('.toast-action-btn'); await page.keyboard.press('Enter'); await page.wait_for_timeout(400)
        check('Tastatur: Enter auf «Rückgängig» macht Abhaken rückgängig', await ev(f"() => !state.shopping.find(i => i.id === '{first}').checked && !document.querySelector('.toast-action-btn')"))
        # Strg+Z
        await ev(f"() => document.querySelector('.shop-row[data-id=\"{first}\"] .shop-check').click()"); await page.wait_for_timeout(200)
        await page.keyboard.press('Control+z'); await page.wait_for_timeout(400)
        check('Tastatur: Strg+Z löst «Rückgängig» aus', await ev(f"() => !state.shopping.find(i => i.id === '{first}').checked"))
        # Erledigte nach unten
        await ev(f"() => document.querySelector('.shop-row[data-id=\"{first}\"] .shop-check').click()"); await page.wait_for_timeout(150)
        await click(page, '[data-action="sort-checked-down"]')
        check('«Erledigte nach unten» verschiebt Abgehaktes in «Erledigt»', await ev(f"() => !!document.querySelector('.shop-section--done .shop-row[data-id=\"{first}\"]')"))
        # Ansicht neu betreten
        await ev(f"() => document.querySelector('.shop-row[data-id=\"{p0[2][0]}\"] .shop-check').click()"); await page.wait_for_timeout(150)
        await ev("() => { document.querySelector('.bottom-nav [data-view=\"mealplan\"]').click(); }"); await page.wait_for_timeout(300)
        await ev("() => { document.querySelector('.bottom-nav [data-view=\"shopping\"]').click(); }"); await page.wait_for_timeout(400)
        check('Ansicht neu betreten: Abgehaktes steht unter «Erledigt»', await ev(f"() => !!document.querySelector('.shop-section--done .shop-row[data-id=\"{p0[2][0]}\"]')"))
        # Rueckgaengig: Erledigte entfernen, Position loeschen, Liste leeren
        s0 = await ev(DB_SHOP)
        await click(page, '[data-action="clear-checked-shopping"]')
        t1 = await ev("() => document.querySelector('.toast .toast-text').textContent")
        check('Rückmeldung «N erledigte Zutaten entfernt» mit Zahl', bool(re.match(r'^\d+ erledigte Zutaten? entfernt', t1)), t1)
        await ev("() => document.querySelector('.toast-action-btn').click()"); await page.wait_for_timeout(500)
        check('Rückgängig nach «Erledigte entfernen» stellt exakt wieder her', await ev(DB_SHOP) == s0)
        some = await ev("() => state.shopping[0].id")
        await click(page, f'[data-action="open-shop-item"][data-id="{some}"]')
        await click(page, f'[data-action="delete-shopping-item"][data-id="{some}"]'); await page.wait_for_timeout(300)
        check('Position löschen entfernt sie', await ev(f"() => !state.shopping.some(i => i.id === '{some}')"))
        await ev("() => document.querySelector('.toast-action-btn').click()"); await page.wait_for_timeout(500)
        check('Rückgängig nach «Position löschen» stellt exakt wieder her', await ev(DB_SHOP) == s0)
        await click(page, '[data-action="clear-all-shopping"]'); await page.wait_for_timeout(300)
        t2 = await ev("() => document.querySelector('.toast .toast-text').textContent")
        check('«Liste geleert» mit Rückgängig, Liste leer', t2 == 'Liste geleert' and await ev("() => state.shopping.length === 0"), t2)
        await ev("() => document.querySelector('.toast-action-btn').click()"); await page.wait_for_timeout(500)
        check('Rückgängig nach «Ganze Liste leeren» stellt exakt wieder her', await ev(DB_SHOP) == s0)
        # Quellenangabe
        src = await ev("() => Array.from(document.querySelectorAll('.shop-source')).map(e => e.textContent)")
        check('Herkunft je Position sichtbar («aus: Rezeptname»)', any(s.startswith('aus: ') for s in src), str(src))
        # Menge ueber gemeinsame Funktion: 0.125 kg als 125 g
        am = await ev("() => shopAmountLine({ amount: 0.125, unit: 'kg' })")
        check('Menge über gemeinsame Anzeige (0,125 kg als 125 g)', am == '125 g', am)
        check('Einkauf ohne Seitenfehler', not errs, str(errs[:2]))
        await ev("() => { document.documentElement.style.fontSize = '24px'; state.view = 'shopping'; render(); }"); await page.wait_for_timeout(300)
        check('Einkauf bei Schriftgrösse 24 px ohne Überlauf', await ev(OVERFLOW))
        await b.close()

        # ---------- Bewegung: mit und ohne Reduktion ----------
        for motion in ('reduce', 'no-preference'):
            b, ctx, page, errs = await fresh(p, 390, 844, motion)
            ev = page.evaluate
            await ev("() => { state.view = 'shopping'; render(); showToast('Test', 'success', false, { actionLabel: 'Rückgängig', onAction: () => {} }); }"); await page.wait_for_timeout(150)
            an = await ev("() => getComputedStyle(document.querySelector('.toast')).animationName")
            check(f'[{motion}] Toast mit Aktion: Eingang ' + ('ohne Bewegung' if motion == 'reduce' else 'animiert'), (an == 'none') == (motion == 'reduce'), an)
            plain = await ev("() => { showToast('Alt'); return document.querySelector('.toast').className; }")
            check(f'[{motion}] Bestehender showToast-Aufruf unverändert (kein Aktionsknopf)', 'toast-action' not in plain and await ev("() => !document.querySelector('.toast-action-btn')"), plain)
            await b.close()

    print('\nFEHLGESCHLAGEN:', ', '.join(FAIL) if FAIL else 'keine'); sys.exit(1 if FAIL else 0)
asyncio.run(main())
