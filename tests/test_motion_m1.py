"""Bewegung M1: Rezeptkarten per FLIP bei Filter/Sortierung/Suche, gleitende Auswahlflaeche «Alle / Favoriten», «Erledigte nach unten».
Prueft im echten Browser (Bewegung erlaubt): verbleibende Karten gleiten (Position WAEHREND der Bewegung zwischen alt und neu), neue Karten
blenden ein, entfernte sind sofort weg (keine Overlays, nichts bedienbar), 10 schnelle Wechsel enden im letzten Zustand ohne Reste,
keine unhandledrejection, Suchfeld behaelt Fokus und Cursor und bewegt sich nicht, Reduced Motion beim Start und waehrend einer Bewegung,
200 Rezepte: nur sichtbare Karten plus Vorlauf, Auswahlflaeche liegt unter dem aktiven Knopf (768/1440, beim Start ohne Hereinfliegen,
nach Groessenwechsel), Handy 320/390 ohne Leiste (Sortierauswahl), Einkauf: Abhaken ohne Bewegung, «Erledigte nach unten» 220 ms, Fokus
bleibt sinnvoll, keine doppelten Zeilen; keine Konsolenfehler, kein horizontaler Ueberlauf."""
import asyncio, sys, os
os.environ.setdefault('SAVORA_TEST_PORT', '13108')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

# 12 Testrezepte ohne Foto, jedes zweite Favorit, unterschiedliche Zeiten (Sortierung «Kuerzeste Zeit» ordnet um)
SEED = """(n) => { const out = []; for (let i = 0; i < n; i++) { const r = emptyRecipe(); r.id = 'm1_' + String(i).padStart(3, '0'); r.title = 'TEST: Rezept ' + String.fromCharCode(65 + (i * 7) % 26) + String(i).padStart(3, '0');
  r.favorite = i % 2 === 1; r.timeMinutes = 5 + ((i * 37) % 90); r.updatedAt = 1000000 + i * 1000; r.ingredients = []; r.steps = []; out.push(r); }
  state.recipes = out; resetExtraFilters(); state.query = ''; state.searchOpen = false; state.favOnly = false; state.activeCollection = 'all'; state.sortBy = 'updated';
  state.homeLayout = 'grid'; state.homeLayoutChosen = true; state.modal = null; state.view = 'home'; render(); window.scrollTo(0, 0); return out.length; }"""
HOOKS = """() => { window.MINE = () => [...document.querySelectorAll('[data-flip-id], .seg-thumb, .shop-row, .shop-section-title')].flatMap(e => e.getAnimations()).filter(a => a.playState === 'running'); window.__rej = []; window.addEventListener('unhandledrejection', e => window.__rej.push(String(e.reason))); }"""
RECT = """(id) => { const e = document.querySelector('[data-flip-id="' + id + '"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top }; }"""
# Klick per Skript, kurze Pause, Mitte messen, Ende abwarten, Ende messen
MID = """async ([sel, id, ms]) => { const R = () => { const e = document.querySelector('[data-flip-id="' + id + '"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top }; };
  const sleep = (t) => new Promise(r => setTimeout(r, t)); const before = R(); document.querySelector(sel).click(); await sleep(ms);
  const mid = R(); const el = document.querySelector('[data-flip-id="' + id + '"]'); const anims = el ? el.getAnimations().length : -1;
  const over = document.documentElement.scrollWidth > document.documentElement.clientWidth;
  const ent = [...document.querySelectorAll('[data-flip-id]')].filter(e => e.getAnimations().some(a => { const k = a.effect.getKeyframes(); return k[0] && Number(k[0].opacity) === 0; })).map(e => e.getAttribute('data-flip-id'));
  await sleep(450); const end = R();
  const running = document.getAnimations().filter(a => a.playState === 'running').length;
  const inline = [...document.querySelectorAll('[data-flip-id]')].filter(e => e.style.transform || e.style.opacity).length;
  return { before, mid, end, anims, over, ent, running, inline }; }"""
THUMB = """() => { const s = document.querySelector('.filter-bar .seg'); if (!s) return null; const t = s.querySelector('.seg-thumb'); const b = s.querySelector('.seg-btn[aria-pressed="true"]');
  const tr = t.getBoundingClientRect(), br = b.getBoundingClientRect();
  return { hidden: t.hidden, aria: t.getAttribute('aria-hidden'), pe: getComputedStyle(t).pointerEvents, dx: Math.abs(tr.left - br.left), dy: Math.abs(tr.top - br.top), dw: Math.abs(tr.width - br.width), dh: Math.abs(tr.height - br.height),
    active: b.dataset.id, anims: t.getAnimations().length, pressed: [...s.querySelectorAll('.seg-btn')].map(x => x.getAttribute('aria-pressed')), over: document.documentElement.scrollWidth > document.documentElement.clientWidth }; }"""
def dist(a, b): return ((a['x'] - b['x']) ** 2 + (a['y'] - b['y']) ** 2) ** 0.5

async def new_page(p, w, h, motion='no-preference'):
    b, ctx = await open_ctx(p, w, h, motion); page = await ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    await page.add_init_script("document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = 'html { scrollbar-width: none } html::-webkit-scrollbar { display: none }'; document.head.appendChild(s); });")
    await goto(page)
    await page.evaluate("() => document.fonts.ready.then(() => 1)")
    await page.evaluate(HOOKS)
    return b, ctx, page, errs

async def desktop(p, w, h):
    tag = f'[{w}] '
    b, ctx, page, errs = await new_page(p, w, h); ev = page.evaluate
    await ev(SEED, 12); await page.wait_for_timeout(300)
    t = await ev(THUMB)
    check(tag + 'Auswahlflaeche liegt beim Start unter «Alle», ohne Hereinfliegen, aria-hidden, nicht klickbar', t and not t['hidden'] and t['active'] == 'all' and t['dx'] < 1 and t['dy'] < 1 and t['dw'] < 1 and t['anims'] == 0 and t['aria'] == 'true' and t['pe'] == 'none', str(t))
    # Alle -> Favoriten: Favoriten-Karte m1_011 (oben in «Zuletzt bearbeitet») bleibt, andere fallen weg
    r = await ev(MID, ['.seg-btn[data-id="fav"]', 'm1_009', 60])
    t2 = await ev(THUMB)
    check(tag + 'Favoriten: verbleibende Karte gleitet (Mitte liegt zwischen alt und neu)', r['anims'] >= 1 and r['mid'] and dist(r['mid'], r['end']) > 1 and dist(r['mid'], r['end']) < dist(r['before'], r['end']), str(r))
    n = await ev("() => ({ cards: document.querySelectorAll('.rcard').length, fav: state.recipes.filter(x => x.favorite).length, ghosts: document.querySelectorAll('[aria-hidden=\"true\"] .rcard, .rcard[inert]').length })")
    check(tag + 'Entfernte Karten sofort weg: keine Overlays, nichts Bedienbares, keine Doppelten', n['cards'] == n['fav'] and n['ghosts'] == 0, str(n))
    check(tag + 'Nach der Bewegung: Endlage, keine laufenden Animationen, keine Inline-Reste', r['running'] == 0 and r['inline'] == 0 and not r['over'], str(r))
    check(tag + 'Auswahlflaeche unter «Favoriten», aria-pressed folgt', t2['active'] == 'fav' and t2['dx'] < 1 and t2['dw'] < 1 and t2['pressed'] == ['false', 'true'], str(t2))
    # Gleiten der Auswahlflaeche mitten im Lauf (180 ms)
    mid = await ev("""async () => { const s = document.querySelector('.filter-bar .seg'), t = s.querySelector('.seg-thumb'); const a = s.querySelector('[data-id="all"]').getBoundingClientRect().left, f = s.querySelector('[data-id="fav"]').getBoundingClientRect().left;
      s.querySelector('[data-id="all"]').click(); await new Promise(r => setTimeout(r, 70)); const t2 = document.querySelector('.filter-bar .seg-thumb'); const x = t2.getBoundingClientRect().left; const an = t2.getAnimations(); return { a, f, x, n: an.length, dur: an[0] ? an[0].effect.getTiming().duration : 0 }; }""")
    check(tag + 'Auswahlflaeche gleitet 180 ms von «Favoriten» zu «Alle» (Mitte zwischen beiden)', mid['n'] == 1 and mid['dur'] == 180 and min(mid['a'], mid['f']) + 1 < mid['x'] < max(mid['a'], mid['f']) - 1, str(mid))
    await page.wait_for_timeout(400)
    # Favoriten -> Alle: neue Karten blenden ein
    await ev("() => { state.favOnly = true; render(); }"); await page.wait_for_timeout(50)
    r2 = await ev(MID, ['.seg-btn[data-id="all"]', 'm1_011', 40])
    check(tag + 'Zurueck zu «Alle»: neu erscheinende Karten blenden ein (Deckkraft 0 -> 1)', len(r2['ent']) >= 3 and all(int(x[-3:]) % 2 == 0 for x in r2['ent']), str(r2['ent']))
    await page.wait_for_timeout(300)
    # Sortierung: Karten gleiten
    s = await ev("""async () => { const id = 'm1_000'; const R = () => document.querySelector('[data-flip-id="' + id + '"]').getBoundingClientRect(); const b = R().top; const sel = document.getElementById('sortSelect'); sel.value = 'az'; sel.dispatchEvent(new Event('change'));
      await new Promise(r => setTimeout(r, 60)); const el = document.querySelector('[data-flip-id="' + id + '"]'); const n = el.getAnimations().length; const d = el.getAnimations()[0] ? el.getAnimations()[0].effect.getTiming().duration : 0; await new Promise(r => setTimeout(r, 400)); return { n, d, b, e: R().top, order: [...document.querySelectorAll('[data-flip-id]')].map(e => e.getAttribute('data-flip-id')).join(','), want: sortRecipes(state.recipes.slice(), 'az').map(r => r.id).join(',') }; }""")
    check(tag + 'Sortierwechsel: Karten gleiten 220 ms an die neue Stelle, Reihenfolge stimmt', s['order'] == s['want'] and (s['n'] == 0 if abs(s['b'] - s['e']) < 1 else (s['n'] == 1 and s['d'] == 220)), str({k: s[k] for k in ('n', 'd', 'b', 'e')}))
    # 10 schnelle Wechsel: letzter Zustand gewinnt, keine Reste
    q = await ev("""async () => { const sel = () => document.getElementById('sortSelect'); const seq = ['time', 'fav', 'az', 'all', 'updated', 'fav', 'time', 'all', 'az', 'fav'];
      for (const v of seq) { if (v === 'fav' || v === 'all') document.querySelector('.seg-btn[data-id="' + v + '"]').click(); else { const s = sel(); s.value = v; s.dispatchEvent(new Event('change')); } await new Promise(r => setTimeout(r, 25)); }
      await new Promise(r => setTimeout(r, 450));
      const want = sortRecipes(state.recipes.filter(r => r.favorite), 'az').map(r => r.id).join(',');
      return { order: [...document.querySelectorAll('[data-flip-id]')].map(e => e.getAttribute('data-flip-id')).join(','), want, running: document.getAnimations().filter(a => a.playState === 'running').length,
        inline: [...document.querySelectorAll('[data-flip-id]')].filter(e => e.style.transform || e.style.opacity).length, fav: state.favOnly, sort: state.sortBy }; }""")
    t3 = await ev(THUMB)
    check(tag + '10 schnelle Wechsel: nur der letzte Zustand, keine laufenden Animationen oder Reste', q['order'] == q['want'] and q['running'] == 0 and q['inline'] == 0 and q['fav'] and q['sort'] == 'az', str(q))
    check(tag + 'Nach schnellen Wechseln: Auswahlflaeche unter «Favoriten»', t3['active'] == 'fav' and t3['dx'] < 1 and t3['anims'] == 0, str(t3))
    # Suche: Fokus, Cursor, Suchfeld bewegt sich nicht
    await ev("() => { state.favOnly = false; state.sortBy = 'updated'; render(); }")
    await page.click('#searchInput'); await page.keyboard.type('TEST: Rezept', delay=20)
    await page.wait_for_timeout(80)
    await ev("() => { const i = document.getElementById('searchInput'); i.setSelectionRange(4, 4); }")
    await page.keyboard.type('X', delay=10)
    sr = await ev("""async () => { await new Promise(r => setTimeout(r, 40)); const i = document.getElementById('searchInput'); const own = (e) => e ? e.getAnimations().filter(x => !x.transitionProperty && !x.animationName).length : 0; const a = { anims: own(i) + own(i.closest('.search-field')) };
      await new Promise(r => setTimeout(r, 400)); const j = document.getElementById('searchInput'); return { ...a, focus: document.activeElement === j, pos: j.selectionStart, val: j.value, q: state.query }; }""")
    check(tag + 'Suche: Fokus und Cursor bleiben, Suchfeld wird nicht animiert', sr['focus'] and sr['pos'] == 5 and sr['val'] == 'TESTX: Rezept' and sr['anims'] == 0, str(sr))
    await ev("() => document.getElementById('searchInput').select()"); await page.keyboard.press('Backspace'); await page.keyboard.type('A0', delay=20)
    sr2 = await ev("""async () => { await new Promise(r => setTimeout(r, 450)); const j = document.getElementById('searchInput'); return { focus: document.activeElement === j, pos: j.selectionStart, n: document.querySelectorAll('[data-flip-id]').length, running: MINE().length }; }""")
    check(tag + 'Suche einschraenken: Treffer stimmen, Fokus bleibt, keine Restbewegung', sr2['focus'] and sr2['pos'] == 2 and sr2['n'] >= 1 and sr2['running'] == 0, str(sr2))
    await ev("() => { state.query = ''; render(); }")
    # Reduced Motion waehrend einer laufenden Bewegung einschalten -> sofort Endzustand
    rm = await ev("""async () => { document.querySelector('.seg-btn[data-id="fav"]').click(); await new Promise(r => setTimeout(r, 30)); return MINE().length; }""")
    await page.emulate_media(reduced_motion='reduce')
    rm2 = await ev("""async () => { await new Promise(r => setTimeout(r, 20)); return { running: MINE().length, what: MINE().map(a => a.effect.target.className + ':' + (a.transitionProperty || a.animationName || 'waapi') + ':' + a.currentTime), inline: [...document.querySelectorAll('[data-flip-id]')].filter(e => e.style.transform).length }; }""")
    check(tag + 'Reduced Motion zur Laufzeit: laufende Bewegung endet sofort im Endzustand', rm >= 1 and rm2['running'] == 0 and rm2['inline'] == 0, f'{rm} {rm2}')
    rm3 = await ev("""async () => { document.querySelector('.seg-btn[data-id="all"]').click(); await new Promise(r => setTimeout(r, 30)); const t = document.querySelector('.seg-thumb'), b = document.querySelector('.seg-btn[aria-pressed="true"]');
      return { running: MINE().length, mm: matchMedia('(prefers-reduced-motion: reduce)').matches, what: MINE().map(a => a.effect.target.className + ':' + (a.transitionProperty || a.animationName || 'waapi') + ':' + a.currentTime), tt: t.style.transform, n: document.querySelectorAll('[data-flip-id]').length, dx: Math.abs(t.getBoundingClientRect().left - b.getBoundingClientRect().left) }; }""")
    check(tag + 'Reduced Motion: Wechsel ohne jede Animation, Endzustand sofort (auch Auswahlflaeche)', rm3['running'] == 0 and rm3['n'] == 12 and rm3['dx'] < 1, str(rm3))
    await page.emulate_media(reduced_motion='no-preference')
    # Groessenwechsel: Auswahlflaeche neu gemessen
    await page.set_viewport_size({'width': 900, 'height': h}); await page.wait_for_timeout(300)
    t4 = await ev(THUMB)
    check(tag + 'Nach Groessenwechsel (900 px): Auswahlflaeche wieder genau unter dem aktiven Knopf', t4 and t4['dx'] < 1 and t4['dw'] < 1 and t4['dh'] < 1 and not t4['over'], str(t4))
    await page.set_viewport_size({'width': w, 'height': h}); await page.wait_for_timeout(200)
    # 200 Rezepte: nur Sichtbare plus Vorlauf bewegen
    await ev(SEED, 200); await page.wait_for_timeout(300)
    big = await ev("""async () => { const sel = document.getElementById('sortSelect'); sel.value = 'time'; sel.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 30));
      const els = [...document.querySelectorAll('[data-flip-id]')]; const n = els.filter(e => e.getAnimations().length).length; await new Promise(r => setTimeout(r, 400));
      return { n, total: els.length, running: document.getAnimations().filter(a => a.playState === 'running').length }; }""")
    check(tag + '200 Rezepte: nur sichtbare Karten plus Vorlauf werden animiert', big['total'] == 200 and 0 < big['n'] <= 60 and big['running'] == 0, str(big))
    # Ansicht waehrend der Bewegung verlassen: keine Fehler, keine Reste
    await ev("""async () => { document.querySelector('.seg-btn[data-id="fav"]').click(); await new Promise(r => setTimeout(r, 30)); state.view = 'shopping'; render(); await new Promise(r => setTimeout(r, 30)); history.back(); }""")
    await page.wait_for_timeout(500)
    rej = await ev("() => window.__rej")
    check(tag + 'Keine unhandledrejection, keine Konsolenfehler', not rej and not errs, str((rej, errs[:3])))
    await ctx.close(); await b.close()

async def phone(p, w, h):
    tag = f'[{w}] '
    b, ctx, page, errs = await new_page(p, w, h); ev = page.evaluate
    await ev(SEED, 12); await page.wait_for_timeout(300)
    check(tag + 'Handy: keine Alle/Favoriten-Leiste (Auswahl steht in der Sortierung), keine verwaiste Auswahlflaeche', await ev("() => !document.querySelector('.seg') && !document.querySelector('.seg-thumb')"))
    r = await ev("""async () => { const id = 'm1_009'; const R = () => document.querySelector('[data-flip-id="' + id + '"]').getBoundingClientRect().top; const b = R(); const sel = document.getElementById('sortSelect'); sel.value = '__fav'; sel.dispatchEvent(new Event('change'));
      await new Promise(r => setTimeout(r, 60)); const m = R(); const n = document.querySelector('[data-flip-id="' + id + '"]').getAnimations().length; const over = document.documentElement.scrollWidth > document.documentElement.clientWidth;
      await new Promise(r => setTimeout(r, 400)); return { b, m, e: R(), n, over, cards: document.querySelectorAll('[data-flip-id]').length, running: document.getAnimations().filter(a => a.playState === 'running').length }; }""")
    check(tag + '«Nur Favoriten»: Zeile gleitet nach oben (Mitte zwischen alt und neu), 6 Treffer', r['n'] == 1 and r['e'] < r['m'] < r['b'] and r['cards'] == 6 and r['running'] == 0, str(r))
    check(tag + 'Kein horizontaler Ueberlauf waehrend der Bewegung', not r['over'])
    rej = await ev("() => window.__rej")
    check(tag + 'Keine unhandledrejection, keine Konsolenfehler', not rej and not errs, str((rej, errs[:3])))
    await ctx.close(); await b.close()

SHOP = """async () => { const names = ['Milch', 'Äpfel', 'Brot', 'Reis', 'Tomaten', 'Butter', 'Salz', 'Karotten'];
  for (const it of state.shopping) await dbDeleteShopping(it.id);
  for (let i = 0; i < names.length; i++) await dbPutShopping({ id: 'm1s_' + i, name: names[i], amount: '', unit: '', checked: false, have: false, sources: [], createdAt: Date.now() + i });
  await loadShopping(); state.shopStay = new Set(); state.modal = null; state.view = 'shopping'; render(); window.scrollTo(0, 0); return state.shopping.length; }"""
ROWS = """() => Object.fromEntries([...document.querySelectorAll('.shop-row[data-id]')].map(e => [e.dataset.id, Math.round(e.getBoundingClientRect().top + window.scrollY)]))"""

async def shopping(p, w, h):
    tag = f'[{w} Einkauf] '
    b, ctx, page, errs = await new_page(p, w, h); ev = page.evaluate
    await ev(SHOP); await page.wait_for_timeout(300)
    before = await ev(ROWS)
    await page.click('.shop-row[data-id="m1s_1"] .shop-check'); await page.click('.shop-row[data-id="m1s_4"] .shop-check')
    await page.wait_for_timeout(40)
    mid = await ev(ROWS); anims = await ev("() => [...document.querySelectorAll('.shop-row')].filter(e => e.getAnimations().length).length")
    check(tag + 'Einzelnes Abhaken: sofort, keine Zeile verschiebt sich, keine Bewegung', mid == before and anims == 0, str(anims))
    check(tag + 'Rueckgaengig-Toast bleibt vorhanden', await ev("() => /Rückgängig/.test(document.body.innerText)"))
    await page.focus('[data-action="sort-checked-down"]')
    res = await ev("""async () => { const b0 = document.querySelector('.shop-row[data-id="m1s_1"]').getBoundingClientRect().top; document.activeElement.click(); await new Promise(r => setTimeout(r, 70));
      const row = document.querySelector('.shop-row[data-id="m1s_1"]'); const an = row.getAnimations(); const top = row.getBoundingClientRect().top; const done = document.querySelector('.shop-section--done .shop-section-title');
      const titleFade = done ? done.getAnimations().length : -1; const over = document.documentElement.scrollWidth > document.documentElement.clientWidth;
      await new Promise(r => setTimeout(r, 400)); const ae = document.activeElement;
      return { b0, n: an.length, dur: an[0] ? an[0].effect.getTiming().duration : 0, delay: an[0] ? an[0].effect.getTiming().delay : -1, top, end: row.getBoundingClientRect().top, titleFade, over,
        inDone: !!row.closest('.shop-section--done'), checked: row.querySelector('.shop-check').getAttribute('aria-checked'), rows: document.querySelectorAll('.shop-row').length,
        ids: new Set([...document.querySelectorAll('.shop-row')].map(e => e.dataset.id)).size, focus: ae && (ae.matches('[data-action="sort-checked-down"]') || (ae.matches('.shop-section-title') && !!ae.closest('.shop-section--done'))),
        focusTag: ae ? ae.className : '', running: document.getAnimations().filter(a => a.playState === 'running').length, btnDisabled: document.querySelector('[data-action="sort-checked-down"]').disabled }; }""")
    check(tag + '«Erledigte nach unten»: Zeilen gleiten 220 ms ohne Staffelung', res['n'] == 1 and res['dur'] == 220 and res['delay'] == 0 and abs(res['top'] - res['end']) > 1 and abs(res['top'] - res['end']) < abs(res['b0'] - res['end']), str(res))
    check(tag + 'Neuer Abschnitt «Erledigt» blendet kurz ein', res['titleFade'] == 1, str(res['titleFade']))
    check(tag + 'Danach: abgehakt im Abschnitt «Erledigt», Haken stimmt, keine doppelten Zeilen', res['inDone'] and res['checked'] == 'true' and res['rows'] == 8 and res['ids'] == 8 and res['running'] == 0, str(res))
    check(tag + 'Fokus bleibt sinnvoll (Knopf deaktiviert: Titel «Erledigt»), kein horizontaler Ueberlauf', res['btnDisabled'] and res['focus'] and not res['over'], res['focusTag'])
    after = await ev(ROWS)
    await page.click('.shop-row[data-id="m1s_6"] .shop-check'); await page.wait_for_timeout(40)
    check(tag + 'Danach erneut abhaken: wieder ohne Verschiebung', await ev(ROWS) == after)
    rej = await ev("() => window.__rej")
    check(tag + 'Keine unhandledrejection, keine Konsolenfehler', not rej and not errs, str((rej, errs[:3])))
    await ctx.close(); await b.close()

async def no_waapi(p):
    # Browser ohne Web Animations: sofort richtige Endansicht
    b, ctx = await open_ctx(p, 1440, 900, 'no-preference')
    await ctx.add_init_script("delete Element.prototype.animate; Element.prototype.animate = undefined;")
    page = await ctx.new_page(); errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
    await goto(page); ev = page.evaluate
    await ev(SEED, 12); await page.wait_for_timeout(200)
    await page.click('.seg-btn[data-id="fav"]'); await page.wait_for_timeout(50)
    t = await ev(THUMB)
    n = await ev("() => document.querySelectorAll('[data-flip-id]').length")
    check('[ohne Web Animations] Wechsel wirkt sofort, Auswahlflaeche unter «Favoriten», keine Fehler', n == 6 and t['active'] == 'fav' and t['dx'] < 1 and not errs, str((n, t, errs[:2])))
    await ctx.close(); await b.close()

async def main():
    async with async_playwright() as p:
        await desktop(p, 1440, 900)
        await desktop(p, 768, 1024)
        await phone(p, 390, 844)
        await phone(p, 320, 640)
        await shopping(p, 390, 844)
        await no_waapi(p)
    print('\nFEHLER:', FAIL if FAIL else 'keine')
    sys.exit(1 if FAIL else 0)

asyncio.run(main())
