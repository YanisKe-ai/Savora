"""v84 Übersicht «Meine Rezepte»: Sammlungsauswahl, Zähler, Favoriten, Ohne Sammlung, Neue Sammlung, Verwalten, Auswahlmodus, Sortierungen.
Prüft: Auswahl im Titel (Handy) bzw. als Knopf (Desktop) statt «Alle / Favoriten», Inhalt der Auswahl (Systembereiche, eigene Sammlungen
mit Anzahl, Suche ab 8), Ergebniszeile «12 Rezepte» / «High Protein · 12 Rezepte» / «5 von 12 Rezepten», Live-Region, Sammlungen nicht mehr
im Filterfenster, «Ohne Sammlung» ignoriert die Systemmarke 'friends', Neue Sammlung (leer, Dublette mit «Bestehende Sammlung verwenden»,
60 Zeichen, HTML im Namen), Leerzustand mit «Rezepte hinzufügen» (Auswahlmodus), Verwalten (Umbenennen behält ID und Bereich,
Hoch/Runter mit Tastatur und Ansage, Löschen der aktiven Sammlung), Auswahlmodus (gemischte Zuordnungen bleiben, nur ergänzen, Rückgängig,
«Alle N auswählen» = nur Treffer, ausgeblendete Auswahl wird benannt, Entfernen nur aus der aktiven Sammlung, Escape und Zurück beenden),
Sortierungen «Zuletzt hinzugefügt» und «Kürzeste Gesamtzeit» (unbekannt am Ende), Breiten 320/390/430/768/1280 hell/dunkel ohne
horizontale Scrollleiste, Touchflächen, grosse Schrift (24 px), Fokusrückgabe."""
import asyncio, sys, os
os.environ.setdefault('SAVORA_TEST_PORT', '48100')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

SHOTS = os.environ.get('SAVORA_V84_SHOTS') or os.path.join(OUT, 'v84-uebersicht')
os.makedirs(SHOTS, exist_ok=True)

# 14 eigene Rezepte (5 davon «Bowl»), 1 Rezept von Freunden. Zeiten teils unbekannt, createdAt teils fehlend (Zeit aus der ID).
DATA = """async () => {
  const day = 86400000, base = Date.UTC(2026, 0, 1);
  const mk = (i, title, extra) => { const r = emptyRecipe(); r.id = 'v84_' + String(i).padStart(2, '0'); r.title = title; r.servings = 2;
    r.ingredients = [{ amount: '1', unit: '', name: 'Zutat' }]; r.steps = [{ text: 'Kochen.' }]; r.timeMinutes = 0; r.createdAt = base + i * day; r.updatedAt = base + i * day; return Object.assign(r, extra || {}); };
  const list = [];
  for (let i = 1; i <= 5; i++) list.push(mk(i, 'Bowl ' + i, { timeMinutes: 10 + i, favorite: i <= 2 }));
  for (let i = 6; i <= 14; i++) list.push(mk(i, 'Gericht ' + i, i % 2 ? { timeMinutes: 60 - i } : {}));
  const noCreated = mk(15, 'Ohne Datum'); delete noCreated.createdAt; noCreated.id = 'legacy_ohne_zeit';
  const fromId = mk(16, 'Alt mit ID-Zeit'); delete fromId.createdAt; fromId.id = 'r_' + (base + 30 * day).toString(36) + '_abc123';
  const friend = mk(17, 'Von Anna', { collections: ['friends'], timeMinutes: 25 });
  list.push(noCreated, fromId, friend);
  for (const r of list) await dbPut(r);
  await loadRecipes();
  resetExtraFilters(); state.query = ''; state.searchOpen = false; state.favOnly = false; state.activeCollection = 'all'; state.selectMode = null; state.sortBy = 'updated';
  state.view = 'home'; state.modal = null; render(); return state.recipes.length;
}"""
RESET = "() => { resetExtraFilters(); state.query = ''; state.searchOpen = false; state.favOnly = false; state.activeCollection = 'all'; state.selectMode = null; state.sortBy = 'updated'; state.modal = null; state.view = 'home'; render(); window.scrollTo(0, 0); }"
MK_COLS = """() => {
  const a = orgCreateCollection({ name: 'High Protein', color: 'sage', icon: 'leaf' });
  const b = orgCreateCollection({ name: 'Meal Prep', color: 'lake' });
  const ids = state.recipes.filter(r => /^v84_/.test(r.id) && !/^Von /.test(r.title)).map(r => r.id).sort().slice(0, 12);
  orgApply(ids, a.id, 'add'); orgApply(['v84_01'], b.id, 'add');
  render(); return [a.id, b.id, ids.length];
}"""
COUNT = "() => document.getElementById('all-h') ? document.getElementById('all-h').textContent.replace(/\\s+/g, ' ').trim() : null"
VISIBLE_COUNT = """() => { const h = document.getElementById('all-h'); if (!h) return null; const c = h.cloneNode(true); c.querySelectorAll('.sr-only').forEach(x => x.remove()); return c.textContent.replace(/\\s+/g, ' ').trim(); }"""
NO_HSCROLL = "() => document.documentElement.scrollWidth <= document.documentElement.clientWidth"
SMALL_TARGETS = """(sel) => [...document.querySelectorAll(sel)].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.width < 43.5 || r.height < 43.5); }).map(e => (e.className || e.tagName) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height))"""
# Ersatz-Farbwerte nur, solange styles-v2.css (Helfer DATEN) noch keine --org-c-* liefert; mit echten Werten wirkungslos.
COLOR_SHIM = """() => { if (getComputedStyle(document.documentElement).getPropertyValue('--org-c-sage').trim()) return; const s = document.createElement('style');
  s.textContent = ':root{--org-c-tomato:#B93B2C;--org-c-sage:#5F7A4E;--org-c-mustard:#8A6A12;--org-c-plum:#7A4A7E;--org-c-lake:#3D6683;--org-c-earth:#7A5A43} :root[data-theme=dark]{--org-c-tomato:#FF9B80;--org-c-sage:#A9C49A;--org-c-mustard:#E2BE5C;--org-c-plum:#D3A6D6;--org-c-lake:#9CC0DA;--org-c-earth:#CFAE92}';
  document.head.appendChild(s); }"""
LIVE = "() => document.getElementById('liveRegion').textContent"

async def theme(page, t):
    await page.evaluate("(t) => { state.theme = t; applyTheme(); }", t); await page.wait_for_timeout(120)

async def new_page(p, w, h, motion='reduce'):
    b, ctx = await open_ctx(p, w, h, motion); page = await ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    await page.add_init_script("document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = 'html { scrollbar-width: none } html::-webkit-scrollbar { display: none }'; document.head.appendChild(s); });")
    await goto(page)
    await page.evaluate("() => document.fonts.ready.then(() => 1)")
    await page.evaluate(COLOR_SHIM)
    n = await page.evaluate(DATA); await page.wait_for_timeout(250)
    return b, ctx, page, errs, n

async def open_pick(page):
    await page.click('#colPickBtn'); await page.wait_for_selector('.rp-sheet--colpick', timeout=5000); await page.wait_for_timeout(150)

async def phone_suite(p):
    b, ctx, page, errs, n = await new_page(p, 390, 844); ev = page.evaluate
    check('Daten: 17 Rezepte', n == 17, str(n))
    # ---------- Aufbau ----------
    st = await ev("""() => ({ btn: !!document.getElementById('colPickBtn'), tag: document.getElementById('colPickBtn').tagName, text: document.querySelector('#colPickBtn .inline-pick-text').textContent.trim(),
      pop: document.getElementById('colPickBtn').getAttribute('aria-haspopup'), seg: !!document.querySelector('.seg, .seg-btn'),
      opts: [...document.querySelectorAll('#sortSelect option')].map(o => o.textContent.trim()), fav: !!document.querySelector('#sortSelect option[value="__fav"]'),
      sel: !!document.querySelector('.sel-mode-btn'), h1: !!document.querySelector('h1.sr-only') })""")
    check('Handy: Titel ist Knopf «Alle Rezepte ▾» (aria-haspopup=dialog), Seitentitel bleibt für Screenreader', st['btn'] and st['tag'] == 'BUTTON' and st['text'] == 'Alle Rezepte' and st['pop'] == 'dialog' and st['h1'], str(st))
    check('Favoriten nicht doppelt: keine .seg, keine Option «Nur Favoriten»', not st['seg'] and not st['fav'], str(st))
    check('Sortierungen in der Reihenfolge des Auftrags', st['opts'] == ['Zuletzt bearbeitet', 'Zuletzt hinzugefügt', 'A bis Z', 'Kürzeste Gesamtzeit', 'Zuletzt gekocht', 'Beste Bewertung'], str(st['opts']))   # v90: Bewertung
    check('Sichtbarer Einstieg «Auswählen»', st['sel'])
    check('Alle Rezepte: «17 Rezepte»', await ev(COUNT) == '17 Rezepte', await ev(COUNT))

    # ---------- Auswahl ohne eigene Sammlung ----------
    await open_pick(page)
    p0 = await ev("""() => ({ rows: [...document.querySelectorAll('.col-pick-item .col-pick-label')].map(e => e.textContent.trim()), empty: !!document.querySelector('.col-pick-empty'),
      manage: !!document.querySelector('[data-action="col-manage"]'), cur: document.querySelector('.col-pick-item[aria-current="true"] .col-pick-label').textContent, search: !!document.getElementById('colPickSearch'), title: document.getElementById('colPickTitle').textContent })""")
    check('Auswahl ohne Sammlungen: Alle, Favoriten, Freunde; Hinweis statt Liste; kein «Verwalten»; aktiv = Alle', p0['rows'] == ['Alle Rezepte', 'Favoriten', 'Rezepte von Freunden'] and p0['empty'] and not p0['manage'] and p0['cur'] == 'Alle Rezepte' and p0['title'] == 'Sammlung wählen', str(p0))
    await page.keyboard.press('Escape'); await page.wait_for_timeout(300)
    check('Escape schliesst, Fokus zurück auf den Auslöser', await ev("() => !state.modal && document.activeElement && document.activeElement.id === 'colPickBtn'"))

    cols = await ev(MK_COLS); hp, mp = cols[0], cols[1]
    check('Gerüst org.js: zwei Sammlungen, 12 Zuordnungen', cols[2] == 12 and hp.startswith('col_'), str(cols))

    # ---------- Auswahl mit Sammlungen ----------
    await open_pick(page)
    p1 = await ev("""() => ({ rows: [...document.querySelectorAll('.col-pick-item')].map(e => e.querySelector('.col-pick-label').textContent.trim() + ':' + e.querySelector('.col-count').textContent.trim()),
      head: (document.querySelector('.menu-group-title') || {}).textContent, manage: !!document.querySelector('[data-action="col-manage"]'), neu: !!document.querySelector('.rp-foot [data-action="col-new"]'),
      sr: document.querySelector('.col-pick-item[data-id="%s"] .sr-only').textContent })""" % hp)
    check('Auswahl: Systembereiche mit Anzahl, «Deine Sammlungen» mit Anzahl', p1['rows'] == ['Alle Rezepte:17', 'Favoriten:2', 'Ohne Sammlung:5', 'Rezepte von Freunden:1', 'High Protein:12', 'Meal Prep:1'] and p1['head'] == 'Deine Sammlungen', str(p1))
    check('Fuss: «Neue Sammlung» und «Sammlungen verwalten»; Anzahl für Screenreader', p1['manage'] and p1['neu'] and p1['sr'] == ', 12 Rezepte', str(p1))
    small = await ev(SMALL_TARGETS, '.col-pick-item, .rp-close, .rp-foot button')
    check('Auswahl: Touchflächen mindestens 44 px', not small, str(small))
    await page.screenshot(path=os.path.join(SHOTS, 'pick_390_hell.png'))
    await page.click(f'.col-pick-item[data-id="{hp}"]'); await page.wait_for_timeout(400)
    s1 = await ev("""() => ({ title: document.querySelector('#colPickBtn .inline-pick-text').textContent.trim(), label: document.getElementById('colPickBtn').getAttribute('aria-label'), modal: !!state.modal, focus: document.activeElement && document.activeElement.id })""")
    check('Sammlung gewählt: Titel «High Protein», Fenster zu, Fokus auf dem Auslöser', s1['title'] == 'High Protein' and not s1['modal'] and s1['focus'] == 'colPickBtn' and 'High Protein' in s1['label'], str(s1))
    check('Handy: «12 Rezepte» sichtbar, Name nur für Screenreader', await ev(VISIBLE_COUNT) == '12 Rezepte' and await ev(COUNT) == 'High Protein · 12 Rezepte', await ev(COUNT))
    await page.wait_for_timeout(150)
    check('Live-Region nennt den neuen Stand', 'High Protein · 12 Rezepte' in (await ev(LIVE)), await ev(LIVE))
    # Suche in der Sammlung: 5 Bowls
    await ev("() => { state.query = 'Bowl'; render(); }"); await page.wait_for_timeout(150)
    check('Mit Suche: «5 von 12 Rezepten»', await ev(VISIBLE_COUNT) == '5 von 12 Rezepten', await ev(VISIBLE_COUNT))
    await ev("() => { state.query = 'Bowl 3'; render(); }"); await page.wait_for_timeout(150)
    check('Einzahl: «1 von 12 Rezepten»', await ev(VISIBLE_COUNT) == '1 von 12 Rezepten', await ev(VISIBLE_COUNT))
    await ev("() => { state.query = 'xyzq'; render(); }"); await page.wait_for_timeout(150)
    e1 = await ev("() => ({ h: (document.querySelector('.hv-empty h2') || {}).textContent, all: !!document.querySelector('.hv-empty [data-action=\"set-col-scope\"][data-id=\"all\"]') })")
    check('Suche ohne Treffer in der Sammlung: «In allen Rezepten suchen»', e1['all'] and 'xyzq' in (e1['h'] or ''), str(e1))
    await ev("() => { state.query = ''; state.activeFilters.time.add('under-30'); render(); }"); await page.wait_for_timeout(150)
    fc = await ev(VISIBLE_COUNT)
    check('Mit Filter: «N von 12 Rezepten», Sammlung nicht in der Filterzusammenfassung', fc.endswith('von 12 Rezepten') and 'High Protein' not in (await ev("() => (document.querySelector('.filter-summary-text') || {}).textContent || ''")), fc)
    await page.click('[data-action="reset-extra-filters"]'); await page.wait_for_timeout(250)
    check('«Zurücksetzen» lässt die Sammlung stehen', await ev('state.activeCollection') == hp and await ev(VISIBLE_COUNT) == '12 Rezepte', await ev(VISIBLE_COUNT))
    # Filterfenster ohne Sammlungen
    await page.click('[data-action="open-filter-sheet"]'); await page.wait_for_timeout(300)
    more = await ev("() => [...document.querySelectorAll('[data-fs-group=\"more\"] .fs-text')].map(e => e.textContent)")
    check('Filterfenster: «Weitere Merkmale» ohne Sammlungen und ohne Freunde', 'High Protein' not in more and 'Meal Prep' not in more and 'Rezepte von Freunden' not in more and 'Noch nicht gekocht' in more, str(more))
    await page.keyboard.press('Escape'); await page.wait_for_timeout(300)

    # ---------- Favoriten, Ohne Sammlung, Freunde ----------
    await open_pick(page); await page.click('.col-pick-item[data-id="favorites"]'); await page.wait_for_timeout(300)
    check('Favoriten: nur Favoriten, Titel «Favoriten»', await ev("document.querySelectorAll('.rrow--phone').length") == 2 and await ev("document.querySelector('#colPickBtn .inline-pick-text').textContent") == 'Favoriten')
    await open_pick(page); await page.click('.col-pick-item[data-id="none"]'); await page.wait_for_timeout(300)
    none_titles = await ev("() => [...document.querySelectorAll('.rrow-title')].map(e => e.textContent).sort()")
    check('Ohne Sammlung: Systemmarke «friends» zählt nicht als Sammlung', 'Von Anna' in none_titles and len(none_titles) == 5, str(none_titles))
    await open_pick(page); await page.click('.col-pick-item[data-id="friends"]'); await page.wait_for_timeout(300)
    check('Rezepte von Freunden als Systembereich', await ev("() => [...document.querySelectorAll('.rrow-title')].map(e => e.textContent)") == ['Von Anna'])

    # ---------- Neue Sammlung ----------
    await open_pick(page); await page.click('.rp-foot [data-action="col-new"]'); await page.wait_for_timeout(300)
    check('Neue Sammlung: Titel, Fokus im Namensfeld, maxlength 60', await ev("() => document.getElementById('colEditTitle').textContent === 'Neue Sammlung' && document.activeElement.id === 'colName' && document.getElementById('colName').maxLength === 60"))
    small = await ev(SMALL_TARGETS, '.col-swatch, .col-icon-opt, .rp-foot button')
    check('Farb- und Symbolwahl: 44 × 44', not small, str(small))
    await page.click('[data-action="col-save"]'); await page.wait_for_timeout(250)
    er = await ev("() => ({ t: (document.querySelector('#colNameErr .field-error') || {}).textContent, inv: document.getElementById('colName').getAttribute('aria-invalid'), role: (document.getElementById('colNameErr') || {}).getAttribute && document.getElementById('colNameErr').getAttribute('role'), f: document.activeElement.id })")
    check('Leerer Name: «Gib der Sammlung einen Namen.», aria-invalid, Fokus im Feld', er['t'] == 'Gib der Sammlung einen Namen.' and er['inv'] == 'true' and er['role'] == 'alert' and er['f'] == 'colName', str(er))
    await page.fill('#colName', '  HIGH   protein '); await page.click('[data-action="col-save"]'); await page.wait_for_timeout(250)
    dup = await ev("() => ({ t: (document.querySelector('#colNameErr .field-error') || {}).textContent, use: !!document.querySelector('[data-action=\"col-use-existing\"]') })")
    check('Dublette in anderer Schreibweise: «Diese Sammlung gibt es bereits.» mit «Bestehende Sammlung verwenden»', dup['t'] == 'Diese Sammlung gibt es bereits.' and dup['use'], str(dup))
    await page.click('[data-action="col-use-existing"]'); await page.wait_for_timeout(350)
    check('«Bestehende Sammlung verwenden» wählt sie als Bereich', await ev('state.activeCollection') == hp and not await ev('!!state.modal') and len(await ev('orgCollections()')) == 2)
    longname = 'Sonntagsbrunchfürdiegrossefamilieunddiefreundevomquartierbasel'[:60]
    await open_pick(page); await page.click('.rp-foot [data-action="col-new"]'); await page.wait_for_timeout(250)
    await page.fill('#colName', longname + 'XYZ')
    cnt = await ev("() => [document.getElementById('colName').value.length, document.getElementById('colNameCount').textContent]")
    check('Name höchstens 60 Zeichen, Zähler ab 50', cnt[0] == 60 and cnt[1] == '60 von 60 Zeichen', str(cnt))
    await page.click('.col-swatch input[value="plum"]', force=True); await page.click('.col-icon-opt input[value="heart"]', force=True)
    await page.click('[data-action="col-save"]'); await page.wait_for_timeout(400)
    lc = await ev("() => { const c = orgCollections().find(x => x.name.length === 60); return c ? { id: c.id, color: c.color, icon: c.icon, active: state.activeCollection === c.id } : null; }")
    check('Neue Sammlung mit Farbe und Symbol wird sofort aktiver Bereich', lc and lc['color'] == 'plum' and lc['icon'] == 'heart' and lc['active'], str(lc))
    le = await ev("() => ({ h: (document.querySelector('.hv-empty h2') || {}).textContent, add: !!document.querySelector('.hv-empty [data-action=\"sel-start-add\"]'), lines: Math.round(document.querySelector('#colPickBtn .inline-pick-text').getBoundingClientRect().height / parseFloat(getComputedStyle(document.querySelector('#colPickBtn .inline-pick-text')).lineHeight)), sw: document.documentElement.scrollWidth <= document.documentElement.clientWidth, sel: !!document.querySelector('.sel-mode-btn') })")
    check('Leere Sammlung: «Noch keine Rezepte in dieser Sammlung.» mit «Rezepte hinzufügen», kein «Auswählen»', le['h'] == 'Noch keine Rezepte in dieser Sammlung.' and le['add'] and not le['sel'], str(le))
    check('Langer Name: Titel höchstens 2 Zeilen, keine horizontale Scrollleiste', le['lines'] <= 2 and le['sw'], str(le))
    await page.screenshot(path=os.path.join(SHOTS, 'leer_390_langer_name.png'))
    # «Rezepte hinzufügen» öffnet den Auswahlmodus
    await page.click('.hv-empty [data-action="sel-start-add"]'); await page.wait_for_timeout(350)
    sm = await ev("() => ({ on: !!state.selectMode, target: state.selectMode && state.selectMode.target, scope: state.activeCollection, btn: (document.querySelector('[data-action=\"sel-add-target\"]') || {}).textContent, dis: (document.querySelector('[data-action=\"sel-add-target\"]') || {}).disabled, fertig: document.getElementById('selModeBtn').textContent.trim() })")
    check('«Rezepte hinzufügen»: Auswahlmodus über allen Rezepten, Ziel ist die leere Sammlung', sm['on'] and sm['target'] == lc['id'] and sm['scope'] == 'all' and sm['dis'] and sm['fertig'] == 'Fertig' and 'hinzufügen' in (sm['btn'] or ''), str(sm))
    await page.click('[data-action="sel-toggle"][data-id="v84_06"]'); await page.click('[data-action="sel-toggle"][data-id="v84_07"]'); await page.wait_for_timeout(150)
    await page.click('[data-action="sel-add-target"]'); await page.wait_for_timeout(500)
    tg = await ev("() => ({ scope: state.activeCollection, sel: !!state.selectMode, n: document.querySelectorAll('.rrow--phone').length, toast: ([...document.querySelectorAll('.toast')].pop() || {}).textContent || '' })")
    check('Hinzufügen: zurück in der Sammlung mit 2 Rezepten, Modus beendet, Meldung mit Rückgängig', tg['scope'] == lc['id'] and not tg['sel'] and tg['n'] == 2 and '2 Rezepte zu' in tg['toast'] and 'Rückgängig' in tg['toast'], str(tg))
    # HTML im Namen wird als Text gezeigt
    await ev("() => { orgCreateCollection({ name: '<b>Fett</b> 🍝' }); render(); }")
    await open_pick(page)
    hx = await ev("() => ({ b: !!document.querySelector('.rp-sheet--colpick b'), t: [...document.querySelectorAll('.col-pick-label')].map(e => e.textContent).includes('<b>Fett</b> 🍝') })")
    check('HTML im Namen wird nicht ausgeführt', not hx['b'] and hx['t'], str(hx))

    # ---------- Verwalten ----------
    await page.click('[data-action="col-manage"]'); await page.wait_for_timeout(300)
    names = await ev("() => [...document.querySelectorAll('.col-manage-name')].map(e => e.textContent)")
    check('Verwalten: alle eigenen Sammlungen, Freunde nicht', names[:2] == ['High Protein', 'Meal Prep'] and len(names) == 4 and 'Rezepte von Freunden' not in names, str(names))
    small = await ev(SMALL_TARGETS, '.col-manage-move .icon-btn, .col-manage-main')
    check('Hoch/Runter 44 × 44', not small, str(small))
    await ev(f"() => document.querySelector('[data-action=\"col-move\"][data-id=\"{hp}\"][data-dir=\"1\"]').focus()")
    await page.keyboard.press('Enter'); await page.wait_for_timeout(300)
    mv = await ev(f"() => ({{ names: [...document.querySelectorAll('.col-manage-name')].map(e => e.textContent).slice(0, 2), f: document.activeElement.dataset.action + '|' + document.activeElement.dataset.id + '|' + document.activeElement.dataset.dir, live: document.getElementById('liveRegion').textContent }})")
    check('Runter mit Tastatur: Reihenfolge, Fokus bleibt auf dem Knopf, Ansage «Platz 2 von 4»', mv['names'] == ['Meal Prep', 'High Protein'] and mv['f'] == f'col-move|{hp}|1' and mv['live'] == 'High Protein ist jetzt auf Platz 2 von 4.', str(mv))
    await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await page.wait_for_timeout(300)
    mv2 = await ev(f"() => document.activeElement.dataset.dir + '|' + document.activeElement.dataset.id")
    check('Am Ende: Fokus wechselt auf den Gegenknopf (Runter ist deaktiviert)', mv2 == f'-1|{hp}', mv2)
    # Umbenennen der aktiven Sammlung
    await ev(f"() => {{ state.activeCollection = '{hp}'; }}")
    await page.click(f'[data-action="col-edit"][data-id="{hp}"]'); await page.wait_for_timeout(300)
    check('Bearbeiten: vorausgefüllt, Fokus im Feld', await ev("() => document.getElementById('colEditTitle').textContent === 'Sammlung bearbeiten' && document.getElementById('colName').value === 'High Protein' && document.activeElement.id === 'colName'"))
    await page.fill('#colName', 'Proteinreich'); await page.click('[data-action="col-save"]'); await page.wait_for_timeout(350)
    rn = await ev(f"() => ({{ name: orgCollection('{hp}').name, toast: ([...document.querySelectorAll('.toast')].pop() || {{}}).textContent, back: !!document.querySelector('.rp-sheet--colmanage'), n: orgRecipeIdsIn('{hp}').size }})")
    check('Umbenennen: ID und Zuordnungen bleiben, «Sammlung umbenannt.», zurück zur Liste', rn['name'] == 'Proteinreich' and rn['toast'] == 'Sammlung umbenannt.' and rn['back'] and rn['n'] == 12, str(rn))
    await page.keyboard.press('Escape'); await page.wait_for_timeout(300)
    check('Aktiver Bereich zeigt sofort den neuen Namen', await ev("document.querySelector('#colPickBtn .inline-pick-text').textContent") == 'Proteinreich')
    # Löschen der aktiven Sammlung
    await open_pick(page); await page.click('[data-action="col-manage"]'); await page.wait_for_timeout(250)
    await page.click(f'[data-action="col-edit"][data-id="{hp}"]'); await page.wait_for_timeout(250)
    await page.click('[data-action="col-delete"]'); await page.wait_for_timeout(300)
    dl = await ev("() => ({ t: document.getElementById('colDelTitle').textContent, p: document.getElementById('colDelText').textContent, hint: document.querySelector('.col-delete-sheet .hint-line').textContent, f: document.activeElement.dataset.action })")
    check('Löschen: «Sammlung löschen?» «Deine Rezepte bleiben erhalten.», Anfangsfokus «Abbrechen»', dl['t'] == 'Sammlung löschen?' and dl['p'] == 'Deine Rezepte bleiben erhalten.' and '12 Rezepten' in dl['hint'] and dl['f'] == 'col-delete-cancel', str(dl))
    await page.click('[data-action="col-delete-confirm"]'); await page.wait_for_timeout(350)
    dd = await ev("() => ({ scope: state.activeCollection, toast: ([...document.querySelectorAll('.toast')].pop() || {}).textContent || '', modal: state.modal && state.modal.type, recipes: state.recipes.length, focus: document.activeElement.dataset.action })")
    check('Aktive Sammlung gelöscht: Bereich «Alle Rezepte», Meldung, Rezepte bleiben, zurück in «Verwalten»', dd['scope'] == 'all' and 'Sammlung gelöscht. Du siehst jetzt alle Rezepte.' in dd['toast'] and dd['modal'] == 'col-manage' and dd['recipes'] == 17 and dd['focus'] == 'col-edit', str(dd))
    await page.click('.toast-undo-btn'); await page.wait_for_timeout(300)
    check('Rückgängig bringt Sammlung und Zuordnungen zurück', await ev(f"() => !!orgCollection('{hp}') && orgRecipeIdsIn('{hp}').size === 12"))
    await page.keyboard.press('Escape'); await page.wait_for_timeout(300)
    check('Zuordnungen beim Löschen nie still verloren, Fenster geschlossen', not await ev('!!state.modal'))
    await b.close()
    check('Handy: keine Seitenfehler', not errs, str(errs))

async def select_suite(p):
    b, ctx, page, errs, n = await new_page(p, 1280, 860); ev = page.evaluate
    hp, mp, _ = await ev(MK_COLS)
    st = await ev("() => ({ seg: !!document.querySelector('.seg'), btn: document.querySelector('.col-pick-btn .col-pick-btn-text').textContent, fav: !!document.querySelector('#sortSelect option[value=\"__fav\"]') })")
    check('Desktop: Knopf «Alle Rezepte» statt «Alle / Favoriten»', not st['seg'] and st['btn'] == 'Alle Rezepte' and not st['fav'], str(st))
    await page.click('#colPickBtn'); await page.wait_for_timeout(300)
    an = await ev("() => { const s = document.querySelector('.rp-sheet--colpick'), r = s.getBoundingClientRect(), k = document.getElementById('colPickBtn').getBoundingClientRect(); return { anchored: s.classList.contains('rp-sheet--anchored'), w: Math.round(r.width), below: r.top >= k.bottom, near: Math.abs(r.top - k.bottom) < 16 }; }")
    check('Desktop: kompakte Auswahl direkt unter dem Knopf (360 px), kein Vollbild', an['anchored'] and an['w'] == 360 and an['below'] and an['near'], str(an))
    await page.screenshot(path=os.path.join(SHOTS, 'pick_1280_hell.png'))
    await page.click(f'.col-pick-item[data-id="{hp}"]'); await page.wait_for_timeout(350)
    check('Desktop: «High Protein · 12 Rezepte»', await ev(VISIBLE_COUNT) == 'High Protein · 12 Rezepte', await ev(VISIBLE_COUNT))
    await ev("() => { state.query = 'Bowl'; render(); }"); await page.wait_for_timeout(150)
    check('Desktop mit Suche: «High Protein · 5 von 12 Rezepten»', await ev(VISIBLE_COUNT) == 'High Protein · 5 von 12 Rezepten', await ev(VISIBLE_COUNT))
    await ev(RESET)

    # ---------- Auswahlmodus: «Alle N auswählen» = nur Treffer ----------
    hist0 = await ev('history.length')
    await page.click('#selModeBtn'); await page.wait_for_timeout(250)
    s0 = await ev("() => ({ on: !!state.selectMode, txt: document.getElementById('selModeBtn').textContent.trim(), cls: document.querySelector('.home-main').classList.contains('is-selecting'), bar: !!document.querySelector('.select-bar[role=\"region\"]'), st: document.getElementById('selStatus').textContent, add: document.querySelector('[data-action=\"sel-add\"]').disabled, rm: !!document.querySelector('[data-action=\"sel-remove\"]'), fav: [...document.querySelectorAll('.rcard-fav, .rrow-fav')].filter(e => e.offsetParent).length, cb: document.querySelector('.rcard-main').getAttribute('role'), f: document.activeElement.id })")
    check('Auswählen: «Fertig» an gleicher Stelle, Leiste, Favoritenknöpfe ausgeblendet, Karten sind Checkboxen', s0['on'] and s0['txt'] == 'Fertig' and s0['cls'] and s0['bar'] and s0['st'] == 'Keine Rezepte ausgewählt' and s0['add'] and not s0['rm'] and s0['fav'] == 0 and s0['cb'] == 'checkbox' and s0['f'] == 'selModeBtn', str(s0))
    await ev("() => { state.query = 'Bowl'; render(); }"); await page.wait_for_timeout(150)
    allb = await ev("() => document.querySelector('[data-action=\"sel-all\"]').textContent")
    check('«Alle 5 auswählen» nennt die aktuellen Treffer', allb == 'Alle 5 auswählen', allb)
    await page.click('[data-action="sel-all"]'); await page.wait_for_timeout(150)
    sa = await ev("() => ({ ids: [...state.selectMode.ids].sort(), st: document.getElementById('selStatus').textContent, btn: document.querySelector('[data-action=\"sel-all\"]').textContent })")
    check('«Alle auswählen» wählt nur die 5 Treffer, nie die ganze Datenbank', sa['ids'] == ['v84_01', 'v84_02', 'v84_03', 'v84_04', 'v84_05'] and sa['st'] == '5 Rezepte ausgewählt' and sa['btn'] == 'Auswahl aufheben', str(sa))
    await ev("() => { state.query = 'Bowl 1'; render(); }"); await page.wait_for_timeout(150)
    check('Ausgeblendete Auswahl wird benannt', await ev("document.getElementById('selStatus').textContent") == '5 ausgewählt, 4 davon ausgeblendet', await ev("document.getElementById('selStatus').textContent"))
    # N2: «Auswahl aufheben» wählt nur die sichtbaren Treffer ab, ausgeblendete bleiben gewählt
    vis = await ev("() => applyAllFilters(state.recipes).map(r => r.id)")
    ub = await ev("() => document.querySelector('[data-action=\"sel-all\"]').textContent")
    check('N2: bei allen sichtbaren Treffern gewählt heisst der Knopf «Auswahl aufheben»', len(vis) == 1 and ub == 'Auswahl aufheben', f'{vis} {ub}')
    await page.click('[data-action="sel-all"]'); await page.wait_for_timeout(150)
    un = await ev("() => ({ ids: [...state.selectMode.ids].sort(), st: document.getElementById('selStatus').textContent, btn: document.querySelector('[data-action=\"sel-all\"]').textContent })")
    rest = sorted(set(['v84_01', 'v84_02', 'v84_03', 'v84_04', 'v84_05']) - set(vis))
    check('N2: Auswahl aufheben lässt ausgeblendete Auswahl stehen und benennt sie', un['ids'] == rest and un['st'] == '4 ausgewählt, 4 davon ausgeblendet' and un['btn'] == 'Alle 1 auswählen', str(un))
    await page.click('[data-action="sel-all"]'); await page.wait_for_timeout(150)
    again = await ev("() => ({ n: state.selectMode.ids.size, btn: document.querySelector('[data-action=\"sel-all\"]').textContent })")
    check('N2: erneut «Alle 1 auswählen» ergänzt den Treffer wieder (5 gewählt)', again['n'] == 5 and again['btn'] == 'Auswahl aufheben', str(again))
    await ev("() => { state.query = ''; state.selectMode.ids = new Set(['v84_01', 'v84_13', 'v84_14']); render(); }"); await page.wait_for_timeout(150)
    # Gemischte Zuordnung: v84_01 ist schon in Meal Prep, v84_13/14 nicht; High Protein enthält v84_01 und nicht v84_13/14 (sort().slice(0,12) → v84_01..v84_12)
    before_hp = await ev(f"() => [...orgRecipeIdsIn('{hp}')].sort()")
    await page.click('[data-action="sel-add"]'); await page.wait_for_timeout(300)
    bm = await ev(f"""() => ({{ sub: document.querySelector('.rp-sheet--colbatch .rp-sub').textContent, checked: [...document.querySelectorAll('.col-batch-input')].filter(i => i.checked).length,
      metaMp: (document.querySelector('.col-batch-input[data-col="{mp}"]').closest('.rp-item').querySelector('.rp-item-meta') || {{}}).textContent,
      metaHp: (document.querySelector('.col-batch-input[data-col="{hp}"]').closest('.rp-item').querySelector('.rp-item-meta') || {{}}).textContent, go: document.querySelector('[data-action="col-batch-apply"]').disabled }})""")
    check('Batch: alle Haken starten leer, Hinweis «1 von 3 schon enthalten», Hinzufügen erst nach Haken', bm['sub'] == '3 Rezepte ausgewählt' and bm['checked'] == 0 and bm['metaMp'] == '1 von 3 schon enthalten' and bm['metaHp'] == '1 von 3 schon enthalten' and bm['go'], str(bm))
    await page.click(f'.col-batch-input[data-col="{mp}"]', force=True); await page.wait_for_timeout(100)
    await page.click('[data-action="col-batch-apply"]'); await page.wait_for_timeout(450)
    ap = await ev(f"() => ({{ mp: [...orgRecipeIdsIn('{mp}')].sort(), hp: [...orgRecipeIdsIn('{hp}')].sort(), sel: state.selectMode && state.selectMode.ids.size, toast: ([...document.querySelectorAll('.toast')].pop() || {{}}).textContent || '' }})")
    check('Nur ergänzt: Meal Prep hat alle 3, High Protein unverändert, Auswahl bleibt', ap['mp'] == ['v84_01', 'v84_13', 'v84_14'] and ap['hp'] == before_hp and ap['sel'] == 3 and '2 Rezepte zu «Meal Prep» hinzugefügt.' in ap['toast'], str(ap))
    await page.click('.toast-undo-btn'); await page.wait_for_timeout(300)
    check('Rückgängig entfernt nur die neu angelegten Paare', await ev(f"() => [...orgRecipeIdsIn('{mp}')].sort()") == ['v84_01'])
    await page.click('[data-action="sel-add"]'); await page.wait_for_timeout(300)
    await ev(f"() => {{ orgApply(['v84_13', 'v84_14'], '{mp}', 'add'); }}")
    await page.keyboard.press('Escape'); await page.wait_for_timeout(250)
    await page.click('[data-action="sel-add"]'); await page.wait_for_timeout(300)
    al = await ev(f"() => {{ const i = document.querySelector('.col-batch-input[data-col=\"{mp}\"]'); return {{ dis: i.disabled, chk: i.checked, meta: i.closest('.rp-item').querySelector('.rp-item-meta').textContent }}; }}")
    check('«Alle 3 schon enthalten»: deaktiviert und angehakt', al['dis'] and al['chk'] and al['meta'] == 'Alle 3 schon enthalten', str(al))
    await page.keyboard.press('Escape'); await page.wait_for_timeout(250)
    # Entfernen nur aus der aktiven Sammlung
    await ev(f"() => {{ state.activeCollection = '{hp}'; state.selectMode.ids = new Set(['v84_02', 'v84_03']); render(); }}"); await page.wait_for_timeout(200)
    rmv = await ev("() => !!document.querySelector('[data-action=\"sel-remove\"]')")
    check('«Aus Sammlung entfernen» nur bei aktiver eigener Sammlung', rmv)
    await page.click('[data-action="sel-remove"]'); await page.wait_for_timeout(450)
    rr = await ev(f"() => ({{ n: orgRecipeIdsIn('{hp}').size, recipes: state.recipes.length, sel: state.selectMode && state.selectMode.ids.size, toast: ([...document.querySelectorAll('.toast')].pop() || {{}}).textContent || '', mp: orgRecipeIdsIn('{mp}').size }})")
    check('Entfernen: nur die Beziehung, Rezepte bleiben, Meldung, Auswahl geleert', rr['n'] == 10 and rr['recipes'] == 17 and rr['sel'] == 0 and '2 Rezepte aus «High Protein» entfernt. Die Rezepte bleiben erhalten.' in rr['toast'] and rr['mp'] == 3, str(rr))
    await page.click('.toast-undo-btn'); await page.wait_for_timeout(300)
    check('Rückgängig nach Entfernen', await ev(f"() => orgRecipeIdsIn('{hp}').size") == 12)
    await page.screenshot(path=os.path.join(SHOTS, 'auswahl_1280_hell.png'))
    # Escape beendet, Geräte-Zurück beendet
    await page.keyboard.press('Escape'); await page.wait_for_timeout(350)
    check('Escape beendet den Auswahlmodus, Fokus auf «Auswählen»', await ev("() => !state.selectMode && document.activeElement.id === 'selModeBtn' && document.activeElement.textContent.trim() === 'Auswählen'"))
    await page.click('#selModeBtn'); await page.wait_for_timeout(250)
    await page.go_back(); await page.wait_for_timeout(400)
    check('Zurück beendet den Auswahlmodus (kein Verlassen der Ansicht)', await ev("() => !state.selectMode && state.view === 'home'"))
    check('Kein wachsender Verlauf', await ev('history.length') <= hist0 + 2, str(await ev('history.length')))
    # Tastatur: Karte per Leertaste wählen
    await page.click('#selModeBtn'); await page.wait_for_timeout(250)
    await ev("() => document.querySelector('[data-action=\"sel-toggle\"]').focus()"); await page.keyboard.press('Space'); await page.wait_for_timeout(150)
    kb = await ev("() => ({ n: state.selectMode.ids.size, ac: document.activeElement.getAttribute('aria-checked') })")
    check('Tastatur: Leertaste wählt, aria-checked, Fokus bleibt', kb['n'] == 1 and kb['ac'] == 'true', str(kb))
    await page.click('#selModeBtn'); await page.wait_for_timeout(250)

    # ---------- Sortierungen ----------
    await ev(RESET)
    await page.select_option('#sortSelect', 'added'); await page.wait_for_timeout(250)
    order = await ev("() => [...document.querySelectorAll('.rcard-title, .rrow-title')].map(e => e.textContent)")
    check('«Zuletzt hinzugefügt»: neueste zuerst, Zeit aus der ID, ohne Datum am Ende', order[0] == 'Alt mit ID-Zeit' and order[1] == 'Von Anna' and order[-1] == 'Ohne Datum', str(order[:3] + order[-2:]))
    check('Gewählte Sortierung wird gespeichert', await ev("localStorage.getItem('savora-sort')") == 'added')
    await page.select_option('#sortSelect', 'time'); await page.wait_for_timeout(250)
    tor = await ev("() => [...document.querySelectorAll('.rcard-title, .rrow-title')].map(e => e.textContent)")
    hint = await ev("() => (document.querySelector('.hv-sort-hint') || {}).textContent")
    check('«Kürzeste Gesamtzeit»: kürzeste zuerst, unbekannte Zeit am Ende, Hinweis', tor[0] == 'Bowl 1' and tor[-1] in ('Ohne Datum', 'Alt mit ID-Zeit', 'Gericht 14', 'Gericht 12', 'Gericht 10', 'Gericht 8', 'Gericht 6') and hint == 'Rezepte ohne Zeitangabe stehen am Ende.', str(tor[:2] + tor[-2:]) + str(hint))
    await b.close()
    # Gespeicherter Wert 'time' bleibt gültig (neuer Start)
    b, ctx = await open_ctx(p, 1280, 860); page = await ctx.new_page()
    await ctx.add_init_script("try { localStorage.setItem('savora-sort', 'time'); } catch (e) {}")
    await goto(page)
    check('Gespeicherte Wahl «time» gilt weiter als «Kürzeste Gesamtzeit»', await page.evaluate("() => state.sortBy === 'time'"))
    await b.close()
    check('Desktop: keine Seitenfehler', not errs, str(errs))

async def layout_suite(p):
    widths = [(320, 640), (390, 844), (430, 932), (768, 1024), (1280, 860)]
    for (w, h) in widths:
        b, ctx, page, errs, n = await new_page(p, w, h); ev = page.evaluate
        hp, mp, _ = await ev(MK_COLS)
        await ev("() => { const c = orgCreateCollection({ name: 'Sonntagsküche für die ganze Familie und alle Freunde aus Basel', color: 'mustard', icon: 'sun' }); orgApply(['v84_01','v84_02'], c.id, 'add'); state.activeCollection = c.id; render(); }")
        for t in ['light', 'dark']:
            await theme(page, t); tag = f'[{w} {t}] '
            await ev("() => window.scrollTo(0, 0)")
            check(tag + 'Übersicht mit langer Sammlung: keine horizontale Scrollleiste', await ev(NO_HSCROLL), str(await overflow_info(page)))
            await page.screenshot(path=os.path.join(SHOTS, f'home_{w}_{t}.png'))
            await page.click('#colPickBtn'); await page.wait_for_timeout(300)
            check(tag + 'Auswahl offen: keine horizontale Scrollleiste', await ev(NO_HSCROLL))
            await page.screenshot(path=os.path.join(SHOTS, f'pick_{w}_{t}.png'))
            await page.click('[data-action="col-manage"]'); await page.wait_for_timeout(250)
            mv = await ev("() => { const s = document.querySelector('.rp-sheet--colmanage').getBoundingClientRect(); return [...document.querySelectorAll('.col-manage-row')].every(r => r.getBoundingClientRect().right <= s.right + 0.5) && [...document.querySelectorAll('.col-manage-main')].every(n => n.getBoundingClientRect().width > 150); }")
            check(tag + 'Verwalten: Zeilen passen, Namen nicht auf wenige Zeichen gequetscht', mv)
            await page.screenshot(path=os.path.join(SHOTS, f'verwalten_{w}_{t}.png'))
            await page.click('[data-action="col-new"]'); await page.wait_for_timeout(250)
            check(tag + 'Neue Sammlung: Fuss sichtbar, keine horizontale Scrollleiste', await ev("() => { const f = document.querySelector('.rp-foot').getBoundingClientRect(); return f.bottom <= innerHeight + 0.5 && document.documentElement.scrollWidth <= document.documentElement.clientWidth; }"))
            await page.screenshot(path=os.path.join(SHOTS, f'neu_{w}_{t}.png'))
            await page.keyboard.press('Escape'); await page.wait_for_timeout(300)
            await ev("() => { if (state.modal) { state.modal = null; render(); } state.activeCollection = 'all'; render(); }"); await page.wait_for_timeout(150)
            await page.click('#selModeBtn'); await page.wait_for_timeout(250)
            await ev("() => { [...document.querySelectorAll('[data-action=\"sel-toggle\"]')].slice(0, 3).forEach(b => b.click()); }"); await page.wait_for_timeout(200)
            sb = await ev("""() => { const bar = document.querySelector('.select-bar').getBoundingClientRect(); const btns = [...document.querySelectorAll('.select-bar button')];
              return { sw: document.documentElement.scrollWidth <= document.documentElement.clientWidth, inView: bar.bottom <= innerHeight + 0.5 && bar.top >= 0,
                small: btns.filter(x => { const r = x.getBoundingClientRect(); return r.height < 43.5; }).length, st: document.getElementById('selStatus').textContent }; }""")
            check(tag + 'Auswahlleiste: sichtbar, Knöpfe 44 px, keine horizontale Scrollleiste', sb['sw'] and sb['inView'] and sb['small'] == 0 and sb['st'] == '3 Rezepte ausgewählt', str(sb))
            await page.screenshot(path=os.path.join(SHOTS, f'auswahl_{w}_{t}.png'))
            await page.click('#selModeBtn'); await page.wait_for_timeout(250)
            await ev(f"() => {{ state.activeCollection = '{hp}'; render(); }}")
        check(f'[{w}] keine Seitenfehler', not errs, str(errs))
        await b.close()
    # Grosse Schrift (24 px Grundschrift) auf dem Handy
    b, ctx, page, errs, n = await new_page(p, 390, 844); ev = page.evaluate
    hp, mp, _ = await ev(MK_COLS)
    await ev(f"() => {{ document.documentElement.style.fontSize = '24px'; state.activeCollection = '{hp}'; render(); }}"); await page.wait_for_timeout(250)
    check('Grosse Schrift: Übersicht ohne horizontale Scrollleiste', await ev(NO_HSCROLL), str(await overflow_info(page)))
    await page.screenshot(path=os.path.join(SHOTS, 'gross_390_home.png'))
    await page.click('#colPickBtn'); await page.wait_for_timeout(300)
    gp = await ev("() => { const s = document.querySelector('.rp-sheet--colpick').getBoundingClientRect(); return { sw: document.documentElement.scrollWidth <= document.documentElement.clientWidth, fits: [...document.querySelectorAll('.col-pick-item')].every(i => i.getBoundingClientRect().right <= s.right + 0.5), foot: document.querySelector('.rp-foot').getBoundingClientRect().bottom <= innerHeight + 0.5 }; }")
    check('Grosse Schrift: Auswahl passt, Fuss erreichbar', gp['sw'] and gp['fits'] and gp['foot'], str(gp))
    await page.screenshot(path=os.path.join(SHOTS, 'gross_390_pick.png'))
    await page.keyboard.press('Escape'); await page.wait_for_timeout(300)
    await page.click('#selModeBtn'); await page.wait_for_timeout(250)
    await ev("() => { [...document.querySelectorAll('[data-action=\"sel-toggle\"]')].slice(0, 2).forEach(b => b.click()); }"); await page.wait_for_timeout(200)
    gb = await ev("() => { const r = document.querySelector('.select-bar').getBoundingClientRect(); return { sw: document.documentElement.scrollWidth <= document.documentElement.clientWidth, top: r.top >= 0, maxh: r.height <= innerHeight * 0.42 }; }")
    check('Grosse Schrift: Auswahlleiste wächst mit, bleibt im Bild', gb['sw'] and gb['top'] and gb['maxh'], str(gb))
    await page.screenshot(path=os.path.join(SHOTS, 'gross_390_auswahl.png'))
    rm = await ev("() => getComputedStyle(document.querySelector('.select-bar')).animationName")
    check('Reduced Motion: Leiste nur mit Überblendung', rm == 'hvFadeIn', rm)
    await b.close()
    # Suche in der Auswahl ab 8 Sammlungen
    b, ctx, page, errs, n = await new_page(p, 390, 844); ev = page.evaluate
    await ev("() => { for (let i = 1; i <= 8; i++) orgCreateCollection({ name: 'Thema ' + i }); render(); }")
    await page.click('#colPickBtn'); await page.wait_for_timeout(300)
    s8 = await ev("() => ({ s: !!document.getElementById('colPickSearch'), f: document.activeElement.id })")
    check('Ab 8 Sammlungen: Suchfeld, aber kein Autofokus (Tastatur springt nicht auf)', s8['s'] and s8['f'] != 'colPickSearch', str(s8))
    await page.fill('#colPickSearch', 'Thema 7'); await page.wait_for_timeout(150)
    hits = await ev("() => [...document.querySelectorAll('.col-pick-item .col-pick-label')].map(e => e.textContent)")
    check('Suche filtert nur die Liste (ohne Systembereiche), Fokus bleibt im Feld', hits == ['Thema 7'] and await ev("document.activeElement.id") == 'colPickSearch', str(hits))
    await page.fill('#colPickSearch', 'Sonntagsküche'); await page.wait_for_timeout(150)
    nh = await ev("() => ({ t: (document.querySelector('.col-pick-nohit strong') || {}).textContent, b: (document.querySelector('.col-pick-nohit [data-action=\"col-new\"]') || {}).textContent })")
    check('Keine Treffer: «Sammlung «…» erstellen»', 'Keine Sammlung gefunden für «Sonntagsküche».' == nh['t'] and 'Sammlung «Sonntagsküche» erstellen' in (nh['b'] or ''), str(nh))
    await page.click('.col-pick-nohit [data-action="col-new"]'); await page.wait_for_timeout(250)
    check('… öffnet «Neue Sammlung» mit vorausgefülltem Namen', await ev("document.getElementById('colName').value") == 'Sonntagsküche')
    await b.close()

async def main():
    async with async_playwright() as p:
        await phone_suite(p)
        await select_suite(p)
        await layout_suite(p)
    print('\nFEHLGESCHLAGEN:', FAIL if FAIL else 'keine')
    sys.exit(1 if FAIL else 0)

asyncio.run(main())
