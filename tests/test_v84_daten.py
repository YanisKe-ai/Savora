"""v84 Daten: Sammlungen, Zuordnungen, «Passt dazu» (org.js), Abgleich (cloud.js + Nachbau), Sicherung (backup.js).
Ein Browser, mehrere Kontexte (= Geraete). Der Supabase-Nachbau laeuft auf einem freien Port."""
import asyncio, json, sys, threading, uuid
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from common import *
import mock_supabase as M
from http.server import ThreadingHTTPServer

srv = ThreadingHTTPServer(('127.0.0.1', 0), M.H)
MOCK_PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
CLOUD = f"window.SAVORA_CLOUD_URL_OVERRIDE = 'http://127.0.0.1:{MOCK_PORT}'; window.SAVORA_CLOUD_KEY_OVERRIDE = 'test-key';"
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info if not cond or len(str(info)) < 160 else str(info)[:160])
    if not cond: FAIL.append(name)

MK = """async (list) => { for (const [id, title, cols] of list) { const r = emptyRecipe(); r.id = id; r.title = title;
  r.ingredients = [{ amount: '1', unit: 'g', name: 'Salz ' + id }]; r.steps = [{ text: 'Kochen ' + id }]; r.servings = 2;
  if (cols) r.collections = cols; r.createdAt = r.updatedAt = Date.now(); await dbPut(r); } await loadRecipes(); return state.recipes.length; }"""

def add_user(email):
    M.USERS[email] = {'id': str(uuid.uuid4()), 'password': 'geheim-123', 'confirmed': True}
    return M.USERS[email]['id']
def rows(uid, kind=None): return {k[2]: v for k, v in M.RECORDS.items() if k[0] == uid and (kind is None or k[1] == kind)}

async def device(browser, name, errs, cloud=True):
    ctx = await browser.new_context(viewport={"width": 390, "height": 844}, accept_downloads=True, reduced_motion="reduce", timezone_id="UTC")
    await ctx.add_init_script(NO_SW + " try{localStorage.setItem('savora-splash-seen','1')}catch(e){}")
    if cloud: await ctx.add_init_script(CLOUD)
    page = await ctx.new_page()
    page.on("pageerror", lambda e: errs.append(f'{name}: {e}'))
    page.on("console", lambda m: errs.append(f'{name} console: {m.text}') if m.type == 'error' else None)
    await goto(page)
    return ctx, page

async def sign_in(page, email):
    await page.evaluate("(e) => cloudAuthSignIn(e, 'geheim-123')", email)
    return await page.evaluate("cloudSyncNow()")

async def main():
    errs = []
    async with async_playwright() as p:
        browser = await p.chromium.launch()

        # ================= 1 Modell (lokal, ohne Konto) =================
        cA, pa = await device(browser, 'A', errs, cloud=False)
        e = await pa.evaluate("({ cols: orgCollections().length, none: orgInNoCollection({ id: 'x' }), exp: orgExport() })")
        check('1a Leer: keine Sammlung, Rezept ohne Sammlung, Export leer', e['cols'] == 0 and e['none'] and not e['exp']['collections'] and not e['exp']['links'], e)
        # Bestand: alte Liste + recipe.collections (inkl. Systemmarke friends)
        await pa.evaluate("localStorage.setItem('savora-collections', JSON.stringify([{ id: 'col_alt1', name: 'Alt Eins' }, { id: 'col_alt2', name: '  Alt   Zwei ' }]))")
        await pa.evaluate(MK, [['r1', 'Bulgogi', ['col_alt1', 'friends']], ['r2', 'Burger', None], ['r3', 'Burgersauce', ['friends']], ['r4', 'Coleslaw', ['col_unbekannt']]])
        await goto(pa)
        st1 = await pa.evaluate("""() => ({ cols: orgCollections().map(c => c.id + ':' + c.name + ':' + c.updatedAt), r1: orgCollectionIdsOf('r1'),
            noneR3: orgInNoCollection(state.recipes.find(r => r.id === 'r3')), noneR4: orgInNoCollection('r4'), noneR1: orgInNoCollection('r1'),
            raw: [localStorage.getItem('savora-org-collections'), localStorage.getItem('savora-org-memberships')] })""")
        check('1b Bestand uebernommen (Liste + recipe.collections), Uhr 1', st1['cols'] == ['col_alt1:Alt Eins:1', 'col_alt2:Alt Zwei:1'] and st1['r1'] == ['col_alt1'], st1)
        check('1c friends ist keine Sammlung, zaehlt nicht fuer «Ohne Sammlung»; unbekannte ID ignoriert', st1['noneR3'] and st1['noneR4'] and not st1['noneR1'], st1)
        await goto(pa)
        raw2 = await pa.evaluate("[localStorage.getItem('savora-org-collections'), localStorage.getItem('savora-org-memberships')]")
        dbcols = await pa.evaluate("dbGetAll().then(l => l.find(r => r.id === 'r1').collections)")
        check('1d Uebernahme idempotent, recipe.collections unveraendert', raw2 == st1['raw'] and dbcols == ['col_alt1', 'friends'], dbcols)
        r = await pa.evaluate("""() => { const out = {};
            out.ok = orgCreateCollection({ name: ' High   Protein ', color: 'sage', icon: 'leaf' });
            out.dup = orgCreateCollection({ name: 'high protein' });
            out.empty = orgCreateCollection({ name: '   ' });
            out.long60 = orgCreateCollection({ name: 'L'.repeat(60) });
            out.long61 = orgCreateCollection({ name: 'M'.repeat(61) });
            out.umlaut = orgCreateCollection({ name: 'Für Gäste' });
            out.xss = orgCreateCollection({ name: '<b>Fett</b>' });
            out.badColor = orgCreateCollection({ name: 'Farbe', color: '#f00', icon: 'trash' });
            out.col = orgCollection(out.badColor.id);
            out.proj = JSON.parse(localStorage.getItem('savora-collections')).map(c => c.id);
            return out; }""")
        check('1e Anlegen mit Namens-ID, Leerzeichen bereinigt', r['ok'] == {'ok': True, 'id': 'col_high-protein'} and r['umlaut']['id'] == 'col_fur-gaste' and r['xss']['ok'], r)
        check('1f Dublette (Gross/Klein, Leerzeichen) mit existingId', r['dup'] == {'ok': False, 'error': 'duplicate', 'existingId': 'col_high-protein'}, r['dup'])
        check('1g Leer verhindert, 60 Zeichen erlaubt, 61 zu lang', r['empty']['error'] == 'empty' and r['long60']['ok'] and r['long61']['error'] == 'too_long', r)
        check('1h Unbekannte Farbe/Symbol werden «keine»', r['col']['color'] is None and r['col']['icon'] is None, r['col'])
        check('1i Projektion savora-collections fuer alte Geraete', 'col_high-protein' in r['proj'] and 'col_alt1' in r['proj'], r['proj'])
        many = await pa.evaluate("() => { for (let i = 0; i < 30; i++) orgCreateCollection({ name: 'Sammlung ' + i }); return orgCollections().length; }")
        check('1j Viele Sammlungen', many == 37, many)
        ren = await pa.evaluate("""() => { const a = orgUpdateCollection('col_high-protein', { name: 'Proteinreich' }); const b = orgUpdateCollection('col_high-protein', { name: 'alt eins' });
            const c = orgUpdateCollection('col_high-protein', { name: 'PROTEINREICH' }); return { a, b, c, col: orgCollection('col_high-protein') }; }""")
        check('1k Umbenennen: ID bleibt, Dublette abgelehnt, nur Gross/Klein erlaubt', ren['a']['ok'] and ren['b']['error'] == 'duplicate' and ren['c']['ok'] and ren['col']['name'] == 'PROTEINREICH', ren)
        mv = await pa.evaluate("""() => { const ids = () => orgCollections().map(c => c.id); const before = ids().slice(0, 3);
            orgMoveCollection(before[2], -1); const after = ids().slice(0, 3); const edge = orgMoveCollection(ids()[0], -1);
            for (let i = 0; i < 60; i++) orgMoveCollection(after[1], i % 2 ? 1 : -1);   // viele Verschiebungen: Ordnung bleibt eindeutig
            return { before, after, edge, uniq: new Set(orgCollections().map(c => c.order)).size === orgCollections().length }; }""")
        check('1l Reihenfolge: hoch/runter, Rand, eindeutig', mv['after'] == [mv['before'][0], mv['before'][2], mv['before'][1]] and mv['edge'] is False and mv['uniq'], mv)
        dl = await pa.evaluate("""() => { orgSetMembership('r2', 'col_alt2', true); const t = orgDeleteCollection('col_alt2');
            const gone = { col: orgCollection('col_alt2'), r2: orgCollectionIdsOf('r2'), none: orgInNoCollection('r2'), proj: localStorage.getItem('savora-collections').includes('col_alt2') };
            orgUndo(t); return { gone, back: orgCollectionIdsOf('r2'), recipes: state.recipes.length }; }""")
        check('1m Loeschen: Rezepte bleiben, Zuordnung ausgeblendet; Rueckgaengig bringt alles zurueck', dl['gone']['col'] is None and dl['gone']['r2'] == [] and dl['gone']['none'] and not dl['gone']['proj'] and dl['back'] == ['col_alt2'] and dl['recipes'] == 4, dl)
        rv = await pa.evaluate("""() => { const t = orgDeleteCollection('col_fur-gaste'); orgSetMembership('r2', 'col_fur-gaste', true);
            const n = orgCreateCollection({ name: 'für gäste' }); const n2 = orgCreateCollection({ name: 'Anders' });
            orgDeleteCollection(n2.id); const n3 = orgCreateCollection({ name: 'Anders 2' });
            return { n, r2: orgCollectionIdsOf('r2'), n3 }; }""")
        check('1n Gleichnamig neu nach Loeschen: gleiche ID, alte Zuordnungen nicht wiederbelebt', rv['n'] == {'ok': True, 'id': 'col_fur-gaste'} and 'col_fur-gaste' not in rv['r2'], rv)

        # ================= 2 Zuordnungen =================
        z = await pa.evaluate("""() => { const out = {};
            ['col_high-protein', 'col_alt1', 'col_sammlung-0'].forEach(c => orgSetMembership('r1', c, true));
            out.three = orgCollectionIdsOf('r1').slice().sort(); out.recipes = state.recipes.length;
            orgSetMembership('r3', 'col_alt1', true);
            const t = orgApply(['r1', 'r2', 'r3', 'r2'], 'col_sammlung-1', 'add'); out.addCount = orgUndoCount(t);
            out.afterAdd = ['r1', 'r2', 'r3'].map(id => orgCollectionIdsOf(id).slice().sort());
            out.noop = orgApply(['r1', 'r2'], 'col_sammlung-1', 'add');
            const t2 = orgApply(['r1', 'r3', 'r4'], 'col_alt1', 'remove'); out.remCount = orgUndoCount(t2);
            out.afterRem = ['r1', 'r3'].map(id => orgCollectionIdsOf(id).slice().sort());
            orgUndo(t2); out.undoRem = ['r1', 'r3'].map(id => orgCollectionIdsOf(id).includes('col_alt1'));
            orgUndo(t); out.undoAdd = ['r1', 'r2', 'r3'].map(id => orgCollectionIdsOf(id).includes('col_sammlung-1'));
            out.counts = Object.fromEntries([...orgCounts()].filter(([k]) => ['col_alt1', 'col_high-protein'].includes(k)));
            out.inAlt1 = [...orgRecipeIdsIn('col_alt1')].sort();
            return out; }""")
        check('2a Rezept in drei Sammlungen, keine Rezeptkopie', z['three'] == ['col_alt1', 'col_high-protein', 'col_sammlung-0'] and z['recipes'] == 4, z)
        check('2b Batch hinzufuegen ergaenzt nur (gemischte Zuordnungen bleiben)', z['addCount'] == 3 and z['afterAdd'][0] == ['col_alt1', 'col_high-protein', 'col_sammlung-0', 'col_sammlung-1'] and z['noop'] is None, z)
        check('2c Batch entfernen nur genannte Beziehung', z['remCount'] == 2 and z['afterRem'][0] == ['col_high-protein', 'col_sammlung-0', 'col_sammlung-1'] and z['afterRem'][1] == ['col_sammlung-1'], z)
        check('2d Rueckgaengig (Entfernen und Hinzufuegen)', z['undoRem'] == [True, True] and z['undoAdd'] == [False, False, False], z)
        check('2e Zaehler und Mitglieder nur existierende Rezepte', z['counts'] == {'col_alt1': 2, 'col_high-protein': 1} and z['inAlt1'] == ['r1', 'r3'], z)

        # ================= 3 Verknuepfungen =================
        v = await pa.evaluate("""() => { const out = {};
            out.ab = orgLinkCreate('r2', 'r3', '  Sauce   kurz vor dem Servieren ');
            out.ba = orgLinkCreate('r3', 'r2', 'anders'); out.self = orgLinkCreate('r2', 'r2'); out.missing = orgLinkCreate('r2', 'r_fehlt');
            out.aSide = orgLinksOf('r2'); out.bSide = orgLinksOf('r3');
            orgLinkCreate('r3', 'r4'); orgLinkCreate('r4', 'r2');   // A-B-C-A
            out.cycle = ['r2', 'r3', 'r4'].map(id => orgLinksOf(id).map(l => l.otherId).sort());
            out.note = orgLinkNote(out.ab.key, 'x'.repeat(250)); out.noteLen = orgLinksOf('r2').find(l => l.otherId === 'r3').note.length;
            const r4 = state.recipes.find(r => r.id === 'r4'); state.recipes = state.recipes.filter(r => r.id !== 'r4');
            state.pendingDeletes = new Set(['r4']); out.gone = orgLinksOf('r2').map(l => l.otherId + ':' + l.status);
            state.pendingDeletes.delete('r4'); state.recipes.push(r4); out.back = orgLinksOf('r2').map(l => l.otherId + ':' + l.status);
            const t = orgLinkRemove(out.ab.key); out.removed = orgLinksOf('r3').map(l => l.otherId); orgUndo(t); out.undo = orgLinksOf('r3').map(l => l.otherId).sort();
            out.recipeHasNoLinks = !('links' in state.recipes.find(r => r.id === 'r2')) && !('pairings' in state.recipes.find(r => r.id === 'r2'));
            return out; }""")
        check('3a A-B einmalig, B-A erkannt, kanonischer Schluessel', v['ab']['ok'] and v['ab']['key'] == 'r2~r3' and v['ba']['error'] == 'exists', v)
        check('3b Selbstverknuepfung und fehlendes Ziel abgelehnt', v['self']['error'] == 'self' and v['missing']['error'] == 'missing', v)
        check('3c Symmetrisch: A zeigt B, B zeigt A, gleiche Notiz', v['aSide'][0]['otherId'] == 'r3' and v['bSide'][0]['otherId'] == 'r2' and v['aSide'][0]['note'] == v['bSide'][0]['note'] == 'Sauce kurz vor dem Servieren', v)
        check('3d A-B-C-A: nur direkte Nachbarn, keine Rekursion', v['cycle'] == [['r3', 'r4'], ['r2', 'r4'], ['r2', 'r3']], v['cycle'])
        check('3e Notiz hoechstens 200 Zeichen', v['noteLen'] == 200, v['noteLen'])
        check('3f Ziel geloescht (vorgemerkt) = gone, Rueckgaengig = ok, ohne Konto nie pending', 'r4:gone' in v['gone'] and 'r4:ok' in v['back'], v)
        check('3g Verknuepfung entfernen + Rueckgaengig; nichts im Rezeptobjekt', v['removed'] == ['r4'] and v['undo'] == ['r2', 'r4'] and v['recipeHasNoLinks'], v)

        # ================= 4 Freunde-Versand, Bibliotheks-Entwurf, Sicherung enthaelt Daten =================
        fx = await pa.evaluate("""() => { const r = state.recipes.find(x => x.id === 'r1');
            const pay = JSON.stringify(shareBuildPayload(r)); const draft = JSON.stringify(libDraftFromRecipe(r));
            const bad = (s) => /col_|PROTEINREICH|Alt Eins|Sauce kurz|r2~r3|"collections"|"links"|"pairings"/.test(s);
            return { pay: bad(pay), draft: bad(draft) }; }""")
        check('4a Freunde-Versand und Bibliotheks-Entwurf ohne Sammlungen/Verknuepfungen', fx == {'pay': False, 'draft': False}, fx)
        async with pa.expect_download() as dl_info:
            await pa.evaluate("downloadBackup()")
        bpath = await (await dl_info.value).path()
        backup = json.load(open(bpath))
        org = backup.get('organization') or {}
        check('4b Sicherung: schemaVersion 6, organization mit Sammlungen/Zuordnungen/Verknuepfungen, alte Felder bleiben', backup['schemaVersion'] == 6 and len(org.get('collections', [])) >= 30 and {'c': 'col_alt1', 'r': 'r1'} in org.get('memberships', []) and any(l['a'] == 'r2' and l['b'] == 'r3' for l in org.get('links', [])) and isinstance(backup['settings']['collections'], list),
              f"schema={backup.get('schemaVersion')} cols={len(org.get('collections', []))}")
        # Veraltete recipe.collections in der Sicherung: r1 traegt col_sammlung-0 nicht mehr laut Modell
        await pa.evaluate("orgSetMembership('r1', 'col_sammlung-0', false)")
        async with pa.expect_download() as dl_info:
            await pa.evaluate("""() => { const r = state.recipes.find(x => x.id === 'r1'); r.collections = ['col_alt1', 'col_sammlung-0', 'friends']; return downloadBackup(); }""")
        backup2 = json.load(open(await (await dl_info.value).path()))
        await cA.close()

        # ================= 5 Wiederherstellen =================
        cE, pe = await device(browser, 'E', errs, cloud=False)
        RESTORE = "async (d) => { await restoreBackupFromFile(new File([JSON.stringify(d)], 'b.json')); await loadRecipes(); return (document.getElementById('backupStatus') || {}).textContent || ''; }"
        # Vorbelegung: r2 mit anderem Inhalt (ID-Kollision), Sammlung «Alt Eins» mit anderer ID
        await pe.evaluate(MK, [['r2', 'Ganz anderes Rezept', None]])
        await pe.evaluate("orgCreateCollection({ name: 'alt eins' })")
        await pe.evaluate(RESTORE, backup2)
        res = await pe.evaluate("""() => { const byTitle = (t) => state.recipes.filter(r => r.title === t).map(r => r.id);
            const burger = byTitle('Burger')[0], sauce = byTitle('Burgersauce')[0], cole = byTitle('Coleslaw')[0];
            return { burger, sauce, cole, n: state.recipes.length, cols: orgCollections().length, alt: orgCollections().filter(c => c.name.toLowerCase() === 'alt eins').map(c => c.id),
              r1: orgCollectionIdsOf('r1').slice().sort(), burgerLinks: orgLinksOf(burger).map(l => l.otherId).sort(), sauceLinks: orgLinksOf(sauce).map(l => l.otherId).sort(),
              keys: Object.keys(JSON.parse(localStorage.getItem('savora-org-links'))).sort() }; }""")
        check('5a Neue ID bei Kollision, Verknuepfungen auf neue IDs abgebildet', res['burger'] != 'r2' and res['burgerLinks'] == sorted([res['sauce'], res['cole']]) and res['sauceLinks'] == sorted([res['burger'], res['cole']]), res)
        check('5b Gleichnamige Sammlung wiederverwendet (keine zweite «Alt Eins»)', len(res['alt']) == 1 and 'col_alt-eins' in res['alt'] and 'col_alt-eins' in res['r1'], res)
        check('5c Veraltete recipe.collections nicht wiederbelebt, friends unberuehrt', 'col_sammlung-0' not in res['r1'] and 'col_alt1' not in res['r1'], res['r1'])
        before = await pe.evaluate("[state.recipes.length, localStorage.getItem('savora-org-collections').length, Object.keys(JSON.parse(localStorage.getItem('savora-org-memberships'))).filter(k => JSON.parse(localStorage.getItem('savora-org-memberships'))[k].updatedAt > 0).length, localStorage.getItem('savora-org-links')]")
        await pe.evaluate(RESTORE, backup2)
        after = await pe.evaluate("[state.recipes.length, localStorage.getItem('savora-org-collections').length, Object.keys(JSON.parse(localStorage.getItem('savora-org-memberships'))).filter(k => JSON.parse(localStorage.getItem('savora-org-memberships'))[k].updatedAt > 0).length, localStorage.getItem('savora-org-links')]")
        check('5d Wiederholtes Einspielen erzeugt keine Dubletten', before[0] == after[0] and before[1] == after[1] and before[2] == after[2] and before[3] == after[3], f"{before[:3]} {after[:3]}")
        # Alte Sicherung (schemaVersion 5, nur recipe.collections + settings.collections); eines der Rezepte ist schon identisch da
        same = await pe.evaluate("(() => { const r = JSON.parse(JSON.stringify(state.recipes.find(x => x.id === 'r1'))); delete r.imageId; return r; })()")
        same.update({'id': 'o2', 'collections': ['col_old']})
        old = {'app': 'savora', 'version': 3, 'schemaVersion': 5, 'recipes': [
            {'id': 'o1', 'title': 'Alt Rezept', 'ingredients': [{'amount': '1', 'unit': 'g', 'name': 'X'}], 'steps': [{'text': 'Y'}], 'servings': 2, 'collections': ['col_old', 'friends']},
            same],
            'settings': {'collections': [{'id': 'col_old', 'name': 'Meal Prep'}]}}
        msg = await pe.evaluate(RESTORE, old)
        o = await pe.evaluate("""() => { const o1 = state.recipes.find(r => r.title === 'Alt Rezept'); return { o1: orgCollectionIdsOf(o1.id), r1: orgCollectionIdsOf('r1'), friends: o1.collections.includes('friends'),
            col: orgCollection('col_old') }; }""")
        check('5e Alte Sicherung: Sammlung und Zuordnungen uebernommen (auch fuer uebersprungene Dublette)', o['col'] and o['col']['name'] == 'Meal Prep' and o['o1'] == ['col_old'] and 'col_old' in o['r1'] and o['friends'], f"{o} {msg[:120]}")
        n0 = await pe.evaluate("[state.recipes.length, orgCollections().length]")
        await pe.evaluate(RESTORE, old)
        n1 = await pe.evaluate("[state.recipes.length, orgCollections().length]")
        check('5f Alte Sicherung zweimal: keine Dubletten', n0 == n1, f"{n0} {n1}")
        broken = dict(backup2); broken['organization'] = {'collections': [{'id': 'bad id', 'name': 'x'}, {'id': 'col_ok9', 'name': 'Neu Neun'}], 'memberships': 'kaputt', 'links': [{'a': 'r1', 'b': 'r1'}, 5]}
        probs = await pe.evaluate("(d) => validateBackup(d).problems.map(p => p.label + ': ' + p.errors.join(', '))", broken)
        await pe.evaluate(RESTORE, broken)
        okc = await pe.evaluate("!!orgCollection('col_ok9')")
        check('5g Fehlerhafte organization-Eintraege einzeln gemeldet, Rest uebernommen', okc and any(x.startswith('Sammlung 1') for x in probs) and any(x.startswith('Zuordnungen') for x in probs) and any(x.startswith('Verknüpfungen') for x in probs), probs)
        await cE.close()

        # ================= 6 Abgleich zweier Geraete =================
        uid = add_user('org@example.test')
        cA, pa = await device(browser, 'A', errs)
        cB, pb = await device(browser, 'B', errs)
        await pa.evaluate(MK, [['x1', 'Bulgogi', ['col_legacy']], ['x2', 'Naan', None], ['x3', 'Curry', None]])
        await pa.evaluate("localStorage.setItem('savora-collections', JSON.stringify([{ id: 'col_legacy', name: 'Legacy' }]))")
        await goto(pa)
        await pa.evaluate("orgCreateCollection({ name: 'Sammlung 1' }); orgCreateCollection({ name: 'Sammlung 2' }); orgLinkCreate('x3', 'x2', 'Dazu')")
        r_a = await sign_in(pa, 'org@example.test')
        await sign_in(pb, 'org@example.test')
        srv_rows = rows(uid)
        check('6a Erstabgleich: Sammlungen und Verknuepfung hochgeladen, Uebernahmen (Uhr 1) bleiben lokal', 'col_sammlung-1' in rows(uid, 'collection') and 'x2~x3' in rows(uid, 'pairing') and 'col_legacy|x1' not in rows(uid, 'membership'), f"{r_a} {sorted(srv_rows)[:12]}")
        b0 = await pb.evaluate("({ cols: orgCollections().map(c => c.id).sort(), x1: orgCollectionIdsOf('x1'), links: orgLinksOf('x2').map(l => l.otherId + ':' + l.note) })")
        check('6b Geraet B erhaelt Sammlungen, Bestand aus recipe.collections und Verknuepfung', b0['cols'] == ['col_legacy', 'col_sammlung-1', 'col_sammlung-2'] and b0['x1'] == ['col_legacy'] and b0['links'] == ['x3:Dazu'], b0)
        # Unabhaengige Zuordnungen (A: Sammlung 1, B: Sammlung 2), beide offline gemacht
        await pa.evaluate("clearTimeout(cloud.timer); orgSetMembership('x2', 'col_sammlung-1', true); clearTimeout(cloud.timer)")
        await pb.evaluate("clearTimeout(cloud.timer); orgSetMembership('x2', 'col_sammlung-2', true); clearTimeout(cloud.timer)")
        await pa.evaluate("cloudSyncNow()"); await pb.evaluate("cloudSyncNow()"); await pa.evaluate("cloudSyncNow()")
        both = await asyncio.gather(*[pg.evaluate("orgCollectionIdsOf('x2').slice().sort()") for pg in (pa, pb)])
        check('6c Geraet A Sammlung 1, Geraet B Sammlung 2: beide Zuordnungen auf beiden Geraeten', both[0] == both[1] == ['col_sammlung-1', 'col_sammlung-2'], both)
        # Konflikt Entfernen gegen Hinzufuegen: spaetere Aenderung gewinnt, auf beiden gleich
        await pa.evaluate("clearTimeout(cloud.timer); orgSetMembership('x3', 'col_sammlung-1', true); orgSetMembership('x3', 'col_sammlung-1', false); clearTimeout(cloud.timer)")
        await pb.wait_for_timeout(20)
        await pb.evaluate("clearTimeout(cloud.timer); orgSetMembership('x3', 'col_sammlung-1', true); clearTimeout(cloud.timer)")
        await pb.evaluate("cloudSyncNow()"); await pa.evaluate("cloudSyncNow()"); await pb.evaluate("cloudSyncNow()")
        k1 = await asyncio.gather(*[pg.evaluate("orgCollectionIdsOf('x3').includes('col_sammlung-1')") for pg in (pa, pb)])
        await pb.evaluate("clearTimeout(cloud.timer); orgSetMembership('x3', 'col_sammlung-1', false); clearTimeout(cloud.timer)")
        await pa.wait_for_timeout(20)
        # A hat den Grabstein noch nicht gesehen und fuegt danach (spaeter) hinzu? Hier: A sieht ihn zuerst nicht, entfernt nicht, B ist spaeter
        await pa.evaluate("cloudSyncNow()"); await pb.evaluate("cloudSyncNow()"); await pa.evaluate("cloudSyncNow()")
        k2 = await asyncio.gather(*[pg.evaluate("orgCollectionIdsOf('x3').includes('col_sammlung-1')") for pg in (pa, pb)])
        check('6d Hinzufuegen nach Entfernen (spaeter) gewinnt; danach Entfernen (spaeter) gewinnt; beide Geraete gleich', k1 == [True, True] and k2 == [False, False], f"{k1} {k2}")
        # Gleichstand: gleiche Uhr -> Hinzufuegen gewinnt (Paritaet), unabhaengig von der Reihenfolge
        par = await pa.evaluate("""() => { const T = orgClock() + 100000; const out = [];
            orgSyncApply('membership', 'col_sammlung-2|x3', null, true, T * 2); out.push(orgCollectionIdsOf('x3').includes('col_sammlung-2'));
            orgSyncApply('membership', 'col_sammlung-2|x3', { c: 'col_sammlung-2', r: 'x3' }, false, T * 2 + 1); out.push(orgCollectionIdsOf('x3').includes('col_sammlung-2'));
            out.push(orgSyncApply('membership', 'col_sammlung-2|x3', null, true, T * 2).applied); out.push(orgCollectionIdsOf('x3').includes('col_sammlung-2'));
            out.push(orgClock() > T); return out; }""")
        check('6e Gleiche Uhr: Hinzufuegen gewinnt in jeder Reihenfolge; Uhr springt nach vorne (HLC)', par == [False, True, False, True, True], par)
        # Grabstein nicht wiederbelebt: x1 aus col_legacy entfernt; neues Geraet mit recipe.collections sieht es nicht
        await pa.evaluate("orgSetMembership('x1', 'col_legacy', false)"); await pa.evaluate("cloudSyncNow()")
        cC, pc = await device(browser, 'C', errs)
        await sign_in(pc, 'org@example.test')
        tomb = await pc.evaluate("({ x1: orgCollectionIdsOf('x1'), raw: state.recipes.find(r => r.id === 'x1').collections, late: orgSyncApply('membership', 'col_legacy|x1', { c: 'col_legacy', r: 'x1' }, false, 3).applied })")
        await pa.evaluate("cloudSyncNow()")
        tombA = await pa.evaluate("orgCollectionIdsOf('x1')")
        check('6f Grabstein nicht wiederbelebt (Bestand recipe.collections, aelterer Fernstand)', tomb['x1'] == [] and tomb['raw'] == ['col_legacy'] and tomb['late'] is False and tombA == [], tomb)
        # Nachholen: Geraet C hatte eine alte Version (Zeilen gezogen, nicht verstanden, Meta gesetzt)
        await pc.evaluate("""() => { ['savora-org-collections', 'savora-org-memberships', 'savora-org-links'].forEach(k => localStorage.removeItem(k));
            const m = JSON.parse(localStorage.getItem('savora-org-meta') || '{}'); m.catchUpDone = false; localStorage.setItem('savora-org-meta', JSON.stringify(m)); orgReload(); }""")
        lost = await pc.evaluate("orgCollectionIdsOf('x2').length")
        await pc.evaluate("cloudSyncNow()")
        caught = await pc.evaluate("({ x2: orgCollectionIdsOf('x2').slice().sort(), links: orgLinksOf('x3').length, done: orgMetaGet('catchUpDone') })")
        check('6g Einmaliges Nachholen ohne Cursor nach Update', lost == 0 and caught['x2'] == ['col_sammlung-1', 'col_sammlung-2'] and caught['links'] == 1 and caught['done'] is True, caught)
        # Server ohne Migration: Organisation bleibt in der Warteschlange, Rezepte laufen weiter
        M.ALLOWED_KINDS.clear(); M.ALLOWED_KINDS.update(M.KINDS_BEFORE_47)
        await pa.evaluate("""async () => { clearTimeout(cloud.timer); orgCreateCollection({ name: 'Ohne Migration' }); const r = state.recipes.find(x => x.id === 'x2'); r.title = 'Naan neu'; r.updatedAt = Date.now(); await dbPut(r); clearTimeout(cloud.timer); }""")
        r1 = await pa.evaluate("cloudSyncNow()")
        q1 = await pa.evaluate("Object.keys(cloudQueue())")
        rec_ok = rows(uid, 'recipe')['x2']['data']['title'] == 'Naan neu'
        M.ALLOWED_KINDS.clear(); M.ALLOWED_KINDS.update(M.KINDS_47)
        r2 = await pa.evaluate("cloudSyncNow()")
        q2 = await pa.evaluate("Object.keys(cloudQueue())")
        check('6h Fehlende Migration blockiert den uebrigen Abgleich nicht; spaeter nachgeliefert', rec_ok and 'collection|col_ohne-migration' in q1 and r1['ok'] and r2['ok'] and not q2 and 'col_ohne-migration' in rows(uid, 'collection'), f"{r1} {q1} {q2}")
        bad = await pa.evaluate("fetch(CLOUD_URL + '/rest/v1/savora_records?on_conflict=user_id,kind,id', { method: 'POST', headers: { apikey: CLOUD_KEY, Authorization: 'Bearer ' + cloudSession().access_token, 'Content-Type': 'application/json' }, body: JSON.stringify([{ kind: 'collection', id: 'col_x', data: {}, deleted: false, client_updated_at: 1 }, { kind: 'collection-link', id: 'a|b', data: {}, deleted: false, client_updated_at: 1 }]) }).then(r => r.status)")
        check('6i Nachbau: unbekannter kind lehnt den ganzen Block ab', bad == 400 and 'col_x' not in rows(uid, 'collection'), bad)
        # Kontowechsel: spaete Antwort des alten Kontos wird verworfen
        uid2 = add_user('zwei@example.test')
        M.RECORDS[(uid, 'collection', 'col_konto1-geheim')] = {'kind': 'collection', 'id': 'col_konto1-geheim', 'data': {'id': 'col_konto1-geheim', 'name': 'Konto1 Geheim', 'order': 9}, 'deleted': False, 'client_updated_at': 2 * 4102444800000 + 1, 'server_updated_at': M.now_ts()}
        import re
        PULL = re.compile(r'/rest/v1/savora_records\?select=')
        await cB.route(PULL, _delayed)
        await pb.evaluate("() => { window.__late = cloudSyncNow(); return 1; }")
        await pb.wait_for_timeout(300)
        await pb.evaluate("() => { window.__sw = cloudAuthSignOut().then(() => cloudAuthSignIn('zwei@example.test', 'geheim-123')); return 1; }"); await pb.evaluate("window.__sw")
        late = await pb.evaluate("window.__late")
        await pb.wait_for_timeout(2500)
        await cB.unroute(PULL)
        await pb.evaluate("cloudSyncNow()")
        sw = await pb.evaluate("({ col: orgCollection('col_konto1-geheim'), user: cloudUserId(), cursor: localStorage.getItem('savora-sync-cursor') })")
        check('6j Kontowechsel: spaete Antwort des alten Kontos verworfen, nichts ins neue Konto', sw['col'] is None and sw['user'] == uid2 and 'col_konto1-geheim' not in rows(uid2, 'collection') and late.get('reason') == 'stale', f"{sw} {late}")
        await asyncio.gather(cA.close(), cB.close(), cC.close())

        # ================= 7 Befunde der Pruefung (H1, M1, M2, N1, N3, N4, N5) =================
        # H1: zwei Geraete mit verschobener Bestandssammlung, Setting collections bleibt nach 5 Runden stabil
        uid3 = add_user('pingpong@example.test')
        cA, pa = await device(browser, 'A', errs)
        await pa.evaluate("localStorage.setItem('savora-collections', JSON.stringify([{id:'col_x',name:'X'},{id:'col_y',name:'Y'},{id:'col_z',name:'Z'}]))")
        await pa.evaluate(MK, [['p1', 'Eins', ['col_x']]])
        await goto(pa)
        await sign_in(pa, 'pingpong@example.test')
        await pa.evaluate("orgMoveCollection('col_z', -1)"); await pa.evaluate("cloudSyncNow()")
        cB, pb = await device(browser, 'B', errs)
        await sign_in(pb, 'pingpong@example.test')
        await pb.evaluate("cloudSyncNow()"); await pa.evaluate("cloudSyncNow()")
        at0 = rows(uid3, 'setting').get('collections', {}).get('client_updated_at')
        ats = []
        for _ in range(5):
            await pb.evaluate("cloudSyncNow()"); await pa.evaluate("cloudSyncNow()")
            ats.append(rows(uid3, 'setting').get('collections', {}).get('client_updated_at'))
        projs = await asyncio.gather(*[pg.evaluate("localStorage.getItem('savora-collections')") for pg in (pa, pb)])
        seqs = await asyncio.gather(*[pg.evaluate("orgCollections().map(c => c.id)") for pg in (pa, pb)])
        check('7a H1 Setting collections nach 5 Runden stabil, Projektion ohne order, gleiche Reihenfolge', at0 and all(a == at0 for a in ats) and '"order"' not in projs[0] and seqs[0] == seqs[1] == ['col_x', 'col_z', 'col_y'], f"{at0} {ats} {seqs}")
        # N1: Grabstein mit Namen; neues Geraet trifft beim gleichnamigen Neuanlegen dieselbe ID
        await pa.evaluate("() => { const c = orgCreateCollection({ name: 'Pasta' }).id; orgSetMembership('p1', c, true); }"); await pa.evaluate("cloudSyncNow()")
        await pa.evaluate("orgDeleteCollection('col_pasta')"); await pa.evaluate("cloudSyncNow()")
        srow = rows(uid3, 'collection').get('col_pasta') or {}
        cC, pc = await device(browser, 'C', errs)
        await sign_in(pc, 'pingpong@example.test')
        tombC = await pc.evaluate("JSON.parse(localStorage.getItem('savora-org-collections'))['col_pasta']")
        mkC = await pc.evaluate("orgCreateCollection({ name: 'Pasta' })")
        await pc.evaluate("cloudSyncNow()"); await pa.evaluate("cloudSyncNow()")
        colsA = await pa.evaluate("orgCollections().filter(c => c.name === 'Pasta').map(c => c.id)")
        check('7b N1 Grabstein mit Daten hochgeladen, Name auf neuem Geraet, gleichnamig neu = gleiche ID', srow.get('deleted') and (srow.get('data') or {}).get('name') == 'Pasta' and tombC and tombC['name'] == 'Pasta' and tombC['deleted'] and mkC == {'ok': True, 'id': 'col_pasta'} and colsA == ['col_pasta'], f"{srow} {tombC} {mkC} {colsA}")
        await asyncio.gather(cB.close(), cC.close())
        # M2: 1500 Rezepte angemeldet hinzufuegen/entfernen (grosszuegige Grenze fuer Linux-CI)
        await pa.evaluate("""async () => { for (let i = 0; i < 1500; i++) { const r = emptyRecipe(); r.id = 'm' + i; r.title = 'Menge ' + i; r.createdAt = r.updatedAt = Date.now(); await cloudOrig.dbPut(r); } await loadRecipes(); }""")
        perf = await pa.evaluate("""() => { clearTimeout(cloud.timer); const c = orgCreateCollection({ name: 'Gross' }).id; const ids = state.recipes.filter(r => r.id.startsWith('m')).map(r => r.id);
            let t0 = performance.now(); const t = orgApply(ids, c, 'add'); const add = performance.now() - t0;
            const q = Object.keys(cloudQueue()).filter(k => k.startsWith('membership|' + c + '|')).length;
            t0 = performance.now(); orgApply(ids, c, 'remove'); const rem = performance.now() - t0; clearTimeout(cloud.timer);
            return { add, rem, q, n: orgUndoCount(t) }; }""")
        check('7c M2 1500 Zuordnungen angemeldet hinzufuegen/entfernen < 1500 ms, alle vorgemerkt', perf['add'] < 1500 and perf['rem'] < 1500 and perf['q'] == 1500 and perf['n'] == 1500, perf)
        await cA.close()

        # M1, N3, N4, N5 lokal
        cL, pl = await device(browser, 'L', errs, cloud=False)
        await pl.evaluate("localStorage.setItem('savora-collections', JSON.stringify([{ id: 'col_alt', name: 'Alt', order: 5 }, { id: 'col_b', name: 'Bee', order: 2 }]))")
        await pl.evaluate(MK, [['d1', 'Bulgogi', ['col_alt', 'friends']], ['d2', 'Burger', None], ['d3', 'Sauce', None]])
        await goto(pl)
        lo = await pl.evaluate("orgCollections().map(c => c.id + ':' + c.order)")
        check('7d H1 Bestandsuebernahme uebernimmt endliche order aus der Liste', lo == ['col_b:2', 'col_alt:5'], lo)
        dup = await pl.evaluate("""async () => { orgSetMembership('d1', 'col_alt', false);
            await handleActionV2('duplicate-recipe', 'd1', document.body, null);
            const k1 = state.recipes.find(r => r.title === 'Bulgogi (Kopie)');
            const n = orgCreateCollection({ name: 'Neu' }).id; orgSetMembership('d2', n, true); orgSetMembership('d2', 'col_b', true);
            await handleActionV2('duplicate-recipe', 'd2', document.body, null);
            const k2 = state.recipes.find(r => r.title === 'Burger (Kopie)');
            return { k1: orgCollectionIdsOf(k1.id), raw1: k1.collections, k2: orgCollectionIdsOf(k2.id).slice().sort(), orig: orgCollectionIdsOf('d1') }; }""")
        check('7e M1 Duplizieren: keine veraltete Bestandszuordnung, keine Systemmarke, aktuelle Sammlungen uebernommen', dup['k1'] == [] and dup['raw1'] == [] and dup['k2'] == ['col_b', 'col_neu'] and dup['orig'] == [], dup)
        # N3: Speicher voll (setItem wirft fuer Org-Schluessel)
        n3 = await pl.evaluate("""async () => { const orig = Storage.prototype.setItem; const out = {};
            Storage.prototype.setItem = function (k, v) { if (String(k).startsWith('savora-org-') && k !== 'savora-org-meta') throw new DOMException('voll', 'QuotaExceededError'); return orig.call(this, k, v); };
            try {
              out.apply = orgApply(['d1', 'd3'], 'col_b', 'add'); out.applyMem = orgCollectionIdsOf('d3');
              out.set = orgSetMembership('d3', 'col_b', true); out.setMem = orgCollectionIdsOf('d3');
              out.create = orgCreateCollection({ name: 'Voll' }); out.createCol = !!orgCollection('col_voll');
              out.link = orgLinkCreate('d1', 'd3', 'x'); out.links = orgLinksOf('d1').length;
              state.modal = { type: 'rcol', recipeId: 'd3', draft: ['col_b'] }; state.toastMsg = '';
              await handleActionV2('rcol-save', 'd3', document.body, null); out.rcolToast = state.toastMsg; out.rcolMem = orgCollectionIdsOf('d3');
              state.selectMode = { ids: new Set(['d1', 'd3']), target: null }; state.modal = { type: 'col-batch', checked: new Set(['col_b', 'col_neu']), query: '', newOpen: false }; state.toastMsg = '';
              await handleActionV2('col-batch-apply', null, document.body, null); out.batchToast = state.toastMsg; out.batchMem = [orgCollectionIdsOf('d1'), orgCollectionIdsOf('d3')];
            } finally { Storage.prototype.setItem = orig; state.modal = null; state.selectMode = null; }
            out.after = orgSetMembership('d3', 'col_b', true) !== null && orgCollectionIdsOf('d3').includes('col_b');
            out.disk = JSON.parse(localStorage.getItem('savora-org-memberships'))['col_b|d3'];
            return out; }""")
        st_err = {'ok': False, 'error': 'storage'}
        check('7f N3 Speicherfehler: org-Funktionen melden storage, nichts Halbes im Speicher', n3['apply'] == st_err and n3['applyMem'] == [] and n3['set'] == st_err and n3['setMem'] == [] and n3['create'] == st_err and not n3['createCol'] and n3['link'] == st_err and n3['links'] == 0, n3)
        check('7g N3 rcol-save und col-batch-apply zeigen den Speicherfehler, danach funktioniert es wieder', 'Gerätespeicher' in (n3['rcolToast'] or '') and n3['rcolMem'] == [] and 'Gerätespeicher' in (n3['batchToast'] or '') and n3['batchMem'] == [[], []] and n3['after'] and n3['disk'] and not n3['disk']['deleted'], n3)
        # closeModal kann in der Verlaufsliste zurueckgehen (history.back): abwarten, dann frisch laden; eine laufende Navigation unterbricht sonst goto
        await pl.wait_for_timeout(600)
        try: await goto(pl)
        except Exception: await pl.wait_for_timeout(600); await goto(pl)
        # N4 + N5: Sicherung ohne verwaiste Beziehungen; umbenannte Sammlung mit gleicher ID wird beim Wiederherstellen zugeordnet
        await pl.evaluate("""async () => { orgSetMembership('d3', 'col_neu', true); orgLinkCreate('d1', 'd3', 'weg'); orgLinkCreate('d1', 'd2', 'bleibt');
            await dbDelete('d3'); await loadRecipes(); }""")
        async with pl.expect_download() as dl_info:
            await pl.evaluate("downloadBackup()")
        b4 = json.load(open(await (await dl_info.value).path()))
        o4 = b4.get('organization') or {}
        check('7h N4 Export ohne Zuordnungen/Verknuepfungen geloeschter Rezepte', not any(m['r'] == 'd3' for m in o4.get('memberships', [])) and not any('d3' in (l['a'], l['b']) for l in o4.get('links', [])) and any(l['note'] == 'bleibt' for l in o4.get('links', [])), o4)
        await pl.evaluate("orgUpdateCollection('col_neu', { name: 'Umbenannt' })")
        n0 = await pl.evaluate("orgCollections().length")
        await pl.evaluate(RESTORE, b4)
        n5 = await pl.evaluate("({ n: orgCollections().length, names: orgCollections().map(c => c.id + ':' + c.name), d2: orgCollectionIdsOf('d2').slice().sort() })")
        check('7i N5 Wiederherstellen: gleiche aktive ID trotz anderem Namen = dieselbe Sammlung', n5['n'] == n0 and 'col_neu:Umbenannt' in n5['names'] and not any(x.endswith(':Neu') or x.startswith('col_voll') for x in n5['names']) and n5['d2'] == ['col_b', 'col_neu'], n5)
        await cL.close()
        # Altes Format: Zuordnung in der Sammlung (recipeIds) wird uebernommen, die Projektion verliert recipeIds nicht
        cO, po = await device(browser, 'O', errs, cloud=False)
        OLDF = '[{"id":"col_1","name":"Sonntag","recipeIds":["o1","o_fehlt"]}]'
        await po.evaluate("(t) => localStorage.setItem('savora-collections', t)", OLDF)
        await po.evaluate(MK, [['o1', 'Eins', None], ['o2', 'Zwei', None]])
        await goto(po)
        of = await po.evaluate("({ o1: orgCollectionIdsOf('o1'), n: orgRecipeIdsIn('col_1').size, raw: localStorage.getItem('savora-collections') })")
        await po.evaluate("orgCreateCollection({ name: 'Neu' })")
        of2 = await po.evaluate("JSON.parse(localStorage.getItem('savora-collections'))")
        check('7j Altes Format recipeIds: Zuordnung uebernommen, Projektion unveraendert bzw. recipeIds erhalten', of['o1'] == ['col_1'] and of['n'] == 1 and of['raw'] == OLDF and of2[0].get('recipeIds') == ['o1', 'o_fehlt'] and 'order' not in of2[0] and of2[1]['id'] == 'col_neu', f"{of} {of2}")
        await cO.close()

        errs2 = [e for e in errs if 'Failed to load resource' not in e and 'Schweizer' not in e]
        check('Keine Konsolenfehler', not errs2, str(errs2[:4]))
        await browser.close()
    print('\nFEHLGESCHLAGEN:', FAIL or 'keine')

async def _delayed(route):
    await asyncio.sleep(1.5)
    try: await route.continue_()
    except Exception: pass

asyncio.run(main())
sys.exit(1 if FAIL else 0)
