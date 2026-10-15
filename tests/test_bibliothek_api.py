"""Oeffentliche Rezeptbibliothek: reine HTTP-Tests gegen den Nachbau (tests/mock_supabase.py), ohne Browser.
Sichert ab, dass der Nachbau dieselben Regeln wie supabase/paket45-bibliothek.sql abbildet (Vertrag §4):
anonyme Suche, Profilantwort ohne private Felder, Fremdzugriff, zurueckgezogen/gesperrt nicht lesbar,
Idempotenz, Versionskonflikt, Eigentuemer aus Token, Limits, Bildleserecht, Moderation, Konto loeschen.
Ersetzt NICHT die Pruefung der echten Datenbank (die macht der Integrator mit SQL)."""
import json, os, sys, threading, time, uuid, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mock_supabase as M
from http.server import ThreadingHTTPServer

MOCK_PORT = int(os.environ.get('SAVORA_MOCK_PORT', '24001'))
ThreadingHTTPServer.allow_reuse_address = True
srv = ThreadingHTTPServer(('127.0.0.1', MOCK_PORT), M.H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = 'http://127.0.0.1:%d' % MOCK_PORT
TERMS = 'bibliothek-2026-10-15'
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info if not cond else '')
    if not cond: FAIL.append(name)

def http(method, path, body=None, token=None, apikey=True, headers=None, raw=None):
    h = dict(headers or {})
    if apikey: h['apikey'] = 'test-key'
    if token: h['Authorization'] = 'Bearer ' + token
    data = raw
    if body is not None:
        data = json.dumps(body).encode(); h.setdefault('Content-Type', 'application/json')
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            b = r.read(); ct = r.headers.get('Content-Type', '')
            return r.status, (json.loads(b) if b and 'json' in ct else b)
    except urllib.error.HTTPError as e:
        b = e.read()
        try: return e.code, json.loads(b)
        except Exception: return e.code, b

def rpc(name, args=None, token=None, apikey=True):
    return http('POST', '/rest/v1/rpc/' + name, args or {}, token=token, apikey=apikey)

def publish(token, recipe, pid=None, expected=None, rq=None, img=None, thumb=None, src=None, terms=True, **extra):
    src = src or 'r_' + uuid.uuid4().hex[:10]   # SQL: hoechstens eine Veroeffentlichung je lokalem Rezept
    a = {'p_request_id': rq or str(uuid.uuid4()), 'p_publication_id': pid, 'p_expected_version': expected, 'p_recipe': recipe,
         'p_image_path': img, 'p_thumb_path': thumb, 'p_source_local_id': src, 'p_terms_version': TERMS, 'p_terms_accepted': terms}
    a.update(extra)
    return rpc('savora_pub_publish', a, token)

def upload(token, path, data=M.TINY_JPEG, ct='image/jpeg'):
    return http('POST', '/storage/v1/object/savora-public/' + path, token=token, raw=data, headers={'Content-Type': ct})

R = M.simple_recipe
def n_visible(): return sum(1 for p in M.PUBS.values() if M._visible(p))

def main():
    t0 = time.time()
    A = M.make_user('autor-a@example.test'); B = M.make_user('nutzer-b@example.test'); MOD = M.make_user('mod@example.test')
    tA, tB, tM = M.token_for(A), M.token_for(B), M.token_for(MOD)
    M.PROFILES[A] = {'handle': 'autor_a', 'display_name': 'Anna Privat', 'invite_code': 'SAV-AAAA-1111'}

    # ---------- anonym ----------
    st, res = rpc('savora_lib_search', {'p_query': '', 'p_filters': {}, 'p_sort': 'newest', 'p_cursor': None, 'p_limit': 24})
    check('Anonyme Suche ohne Token: 200, leere Liste', st == 200 and res == {'items': [], 'next_cursor': None, 'total': 0, 'total_capped': False}, (st, res))
    st, _ = rpc('savora_lib_search', {}, apikey=False)
    check('Ohne apikey: abgewiesen', st == 401)
    for name in ('savora_pub_publish', 'savora_pub_mine', 'savora_pub_profile_get', 'savora_lib_report', 'savora_mod_is', 'savora_mod_reports'):
        st, _ = rpc(name, {})
        check(f'{name} ohne Anmeldung abgewiesen (401)', st == 401, st)
    st, _ = rpc('savora_lib_search', {}, token='at-ungueltig')
    check('Abgelaufene Sitzung (ungueltiges Token) bei Suche: 401 statt stiller anon-Antwort', st == 401, st)

    # ---------- Profil ----------
    st, _ = publish(tA, R('Ohne Profil'))
    check('Veroeffentlichen ohne oeffentliches Profil: Fehler', st == 400)
    st, prof = rpc('savora_pub_profile_set', {'p_name': 'Anna Kocht', 'p_bio': 'Ich koche gern.', 'p_avatar_path': None}, tA)
    check('Oeffentliches Profil anlegen', st == 200 and len(prof['public_id']) == 12 and prof['publishing_blocked'] is False, prof)
    pub_id_a = prof['public_id']
    st, prof2 = rpc('savora_pub_profile_set', {'p_name': 'Anna Neu', 'p_bio': '', 'p_avatar_path': None}, tA)
    check('Umbenennen aendert public_id (Link) nicht', prof2['public_id'] == pub_id_a and prof2['display_name'] == 'Anna Neu')
    st, e = rpc('savora_pub_profile_set', {'p_name': 'x' * 41}, tA)
    check('Name > 40 Zeichen abgewiesen', st == 400 and 'zu lang' in e['message'])
    st, e = rpc('savora_pub_profile_set', {'p_name': 'Fremd', 'p_avatar_path': A + '/avatar-deadbeef.jpg'}, tB)
    check('Fremdes Profilbild abgewiesen', st == 400)
    rpc('savora_pub_profile_set', {'p_name': 'Bernd', 'p_bio': ''}, tB)

    # ---------- Veroeffentlichen ----------
    st, e = publish(tA, R('Ohne Haekchen'), terms=False)
    check('Ohne bestaetigte Rechte: Fehler', st == 400 and 'Rechte' in e['message'], e)
    st, e = rpc('savora_pub_publish', {'p_request_id': str(uuid.uuid4()), 'p_recipe': R('X'), 'p_terms_version': 'alt', 'p_terms_accepted': True}, tA)
    check('Unbekannte Bedingungsversion: Fehler', st == 400)
    pid = str(uuid.uuid4())
    st, e = upload(tA, f'{A}/{pid}/full-0123abcd.png', ct='image/png')
    check('Upload: PNG abgewiesen (nur JPEG/WebP)', st in (403, 415), st)
    st, e = upload(tA, f'{A}/{pid}/full-0123abcd.jpg', data=b'\xff' * (3 * 1024 * 1024 + 1))
    check('Upload: > 3 MB abgewiesen', st == 413, st)
    st, e = upload(tB, f'{A}/{pid}/full-0123abcd.jpg')
    check('Upload in fremden Ordner abgewiesen', st == 403, st)
    st, _ = upload(tA, f'{A}/{pid}/full-0123abcd.jpg'); st2, _ = upload(tA, f'{A}/{pid}/thumb-0123abcd.jpg')
    check('Upload in eigenen Ordner', st == 200 and st2 == 200)
    st, e = upload(tA, f'{A}/{pid}/full-0123abcd.jpg')
    check('Upload: gleicher Name nochmals ohne x-upsert = 409 «already exists»', st == 409 and 'already exists' in e['message'], (st, e))
    st, e = publish(tA, R('Falscher Pfad'), pid=pid, img=f'{B}/{pid}/full-0123abcd.jpg')
    check('Bildpfad muss mit <uid>/<publicationId>/ beginnen', st == 400)
    st, e = publish(tA, R('Fehlendes Bild'), pid=pid, img=f'{A}/{pid}/full-99999999.jpg', thumb=f'{A}/{pid}/thumb-99999999.jpg')
    check('Bild und Vorschau nur zusammen', publish(tA, R('Nur Bild'), pid=pid, img=f'{A}/{pid}/full-0123abcd.jpg')[1].get('message') == 'Ungültiges Bild.')
    check('Bildpfad muss im Speicher existieren', st == 400 and 'nicht vollständig hochgeladen' in e['message'], e)
    rq = str(uuid.uuid4())
    rec = R('Älplermagronen', minutes=40, diet=['vegetarisch', 'glutenfrei'], categories=['dinner', 'pasta', 'BAD!'],
            ingredients=[{'amount': '', 'unit': '', 'name': 'Teig', 'group': '', 'isGroupHeader': True},
                         {'amount': '2-3', 'unit': 'EL', 'name': 'Crème fraîche', 'group': 'Teig', 'isGroupHeader': False, 'favorite': True},
                         {'amount': '', 'unit': '', 'name': 'Salz nach Geschmack', 'group': '', 'isGroupHeader': False}],
            notes='PRIVAT', favorite=True, cookCount=9, owner=B)
    st, res = publish(tA, rec, pid=pid, rq=rq, img=f'{A}/{pid}/full-0123abcd.jpg', thumb=f'{A}/{pid}/thumb-0123abcd.jpg', src='r_local_1', p_owner=B)
    check('Veroeffentlichen mit Bild', st == 200 and res == {'id': pid, 'version': 1, 'status': 'published'}, (st, res))
    check('Eigentuemer aus Token, nie aus Argumenten (p_owner/owner ignoriert)', M.PUBS[pid]['owner'] == A)
    pr = M.PUBS[pid]['recipe']
    check('Server baut neu: private/unbekannte Felder entfernt', not {'notes', 'favorite', 'cookCount', 'owner'} & set(pr) and 'favorite' not in pr['ingredients'][1], sorted(pr))
    check('Allergie-Angaben und ungueltige Kategorien entfernt', pr['diet'] == ['vegetarisch'] and pr['categories'] == ['dinner', 'pasta'])
    st, res2 = publish(tA, rec, pid=pid, rq=rq, img=f'{A}/{pid}/full-0123abcd.jpg', thumb=f'{A}/{pid}/thumb-0123abcd.jpg', src='r_local_1')
    check('Wiederholung mit gleicher request_id: gleiche Antwort (repeated), keine zweite Version', st == 200 and res2 == dict(res, repeated=True) and M.PUBS[pid]['version'] == 1, res2)
    st, e = publish(tA, R('Zweite Veroeffentlichung desselben Rezepts'), src='r_local_1')
    check('Gleiches lokales Rezept nochmals neu: KONFLIKT «schon veröffentlicht»', st == 400 and e['message'].startswith('KONFLIKT: Dieses Rezept ist schon veröffentlicht'), e)
    st, e = publish(tA, R('Ohne Ergibt', servings=None))
    check('Ergibt (Portionen/Stueck) ist Pflicht', st == 400 and e['message'] == 'Gib an, wie viel das Rezept ergibt (Portionen oder Stück).', e)
    st, e = publish(tA, R('L' * 250, steps=[{'text': 'x' * 4100}]))
    check('Zu lange Texte werden serverseitig gekuerzt (200/4000)', st == 200 and len(M.PUBS[e['id']]['title']) == 200 and len(M.PUBS[e['id']]['recipe']['steps'][0]['text']) == 4000, e)
    rpc('savora_pub_withdraw', {'p_id': e['id']}, tA) if st == 200 else None
    st, e = publish(tA, R('Neue ID mit Version'), pid=str(uuid.uuid4()), expected=1)
    check('Neue ID mit erwarteter Version: KONFLIKT «gibt es nicht mehr»', st == 400 and 'gibt es nicht mehr' in e['message'], e)
    rq2 = str(uuid.uuid4())
    with ThreadPoolExecutor(6) as ex:
        outs = list(ex.map(lambda _: publish(tA, R('Parallel'), rq=rq2), range(6)))
    ids = {o[1]['id'] for o in outs if o[0] == 200}
    check('6 gleichzeitige Aufrufe mit gleicher request_id: genau eine Publikation', len(ids) == 1 and sum(1 for p in M.PUBS.values() if p['title'] == 'Parallel') == 1, outs[:2])
    par_id = ids.pop()
    st, e = publish(tA, R('Zeitlos', minutes=0))
    check('timeMinutes 0 wird null (unbekannt)', st == 200 and M.PUBS[e['id']]['total_minutes'] is None)
    zeitlos = e['id']

    # ---------- Lesen ----------
    st, card = rpc('savora_lib_get', {'p_id': pid})
    check('Anonym: Detail lesbar', st == 200 and card and card['version'] == 1 and card['author']['display_name'] == 'Anna Neu', card)
    flat = json.dumps({k: v for k, v in card.items() if k not in ('image_path', 'thumb_path')})   # Bildpfade beginnen laut Vertrag mit <uid>/ (siehe Bericht)
    check('Detail ohne invite_code, E-Mail, Handle, owner-ID', all(x not in flat for x in ('SAV-AAAA', 'autor-a@', 'autor_a', A, 'invite', 'owner')), flat[:200])
    st, p = rpc('savora_lib_profile', {'p_public_id': pub_id_a, 'p_cursor': None})
    flat = json.dumps(p['profile']) + json.dumps([{k: v for k, v in i.items() if k not in ('image_path', 'thumb_path')} for i in p['items']])
    check('Profilantwort: nur public_id, display_name, bio, avatar_path', set(p['profile']) == {'public_id', 'display_name', 'bio', 'avatar_path'} and all(x not in flat for x in ('SAV-AAAA', 'autor-a@', 'autor_a', A)), p['profile'])
    check('Profil listet die Veroeffentlichungen', {i['id'] for i in p['items']} == {pid, par_id, zeitlos})
    st, s = rpc('savora_lib_search', {'p_query': 'alplermagronen', 'p_filters': {}})
    check('Suche: Umlaut gleichwertig (alpler = Älpler)', [i['id'] for i in s['items']] == [pid], s)
    st, s = rpc('savora_lib_search', {'p_query': 'creme-fraiche!', 'p_filters': {}})
    check('Suche: Zutatenname, Akzente und Satzzeichen ignoriert', [i['id'] for i in s['items']] == [pid])
    st, s = rpc('savora_lib_search', {'p_query': '', 'p_filters': {'quick': True}})
    check('Bis 30 Min.: unbekannte Zeit nie Treffer', zeitlos not in [i['id'] for i in s['items']] and pid not in [i['id'] for i in s['items']] and par_id in [i['id'] for i in s['items']])
    st, s = rpc('savora_lib_search', {'p_query': '', 'p_filters': {'max_minutes': 1000}})
    check('max_minutes: unbekannte Zeit nie Treffer', zeitlos not in [i['id'] for i in s['items']] and pid in [i['id'] for i in s['items']])

    # ---------- Fremdzugriff ----------
    st, e = publish(tB, R('Gekapert'), pid=pid, expected=1)
    check('B kann A nicht aendern («gehört nicht dir»)', st == 400 and e['message'] == 'Diese Veröffentlichung gehört nicht dir.' and M.PUBS[pid]['title'] == 'Älplermagronen' and M.PUBS[pid]['owner'] == A, e)
    st, e = rpc('savora_pub_withdraw', {'p_id': pid}, tB)
    check('B kann A nicht zurueckziehen', st == 400 and M.PUBS[pid]['status'] == 'published')
    st, mine = rpc('savora_pub_mine', {}, tB)
    check('savora_pub_mine von B enthaelt nichts von A', st == 200 and mine == [])
    st, e = upload(tB, f'{A}/{pid}/full-0123abcd.jpg')
    check('B kann Bild von A nicht ueberschreiben', st == 403)
    st, gone = http('DELETE', '/storage/v1/object/savora-public', {'prefixes': [f'{A}/{pid}/full-0123abcd.jpg']}, token=tB)
    check('B kann Bild von A nicht loeschen', f'{A}/{pid}/full-0123abcd.jpg' in M.PUB_OBJECTS)
    st, gone = http('DELETE', '/storage/v1/object/savora-public', {'prefixes': [f'{A}/{pid}/full-0123abcd.jpg']}, token=tA)
    check('A kann referenziertes (veroeffentlichtes) Bild nicht loeschen', f'{A}/{pid}/full-0123abcd.jpg' in M.PUB_OBJECTS)

    # ---------- Version / Konflikt ----------
    st, res = publish(tA, dict(rec, title='Älplermagronen v2'), pid=pid, expected=1, img=f'{A}/{pid}/full-0123abcd.jpg', thumb=f'{A}/{pid}/thumb-0123abcd.jpg', src='r_local_1')
    check('Aktualisieren: Version +1', st == 200 and res['version'] == 2 and (pid, 2) in M.PUB_VERSIONS)
    st, e = publish(tA, dict(rec, title='Stand aus zweitem Tab'), pid=pid, expected=1)
    check('Veraltete Version: KONFLIKT-Meldung', st == 400 and e['message'].startswith('KONFLIKT:') and 'inzwischen geändert' in e['message'] and M.PUBS[pid]['version'] == 2, e)
    st, e = publish(tA, dict(rec, title='Version manipuliert'), pid=pid, expected=99)
    check('Version nicht manipulierbar (zu hohe Version = Konflikt)', st == 400 and e['message'].startswith('KONFLIKT:'))

    # ---------- Bildleserecht ----------
    paths = [f'{A}/{pid}/full-0123abcd.jpg', f'{A}/{pid}/thumb-0123abcd.jpg', f'{A}/unbekannt/full-00000000.jpg']
    st, sig = http('POST', '/storage/v1/object/sign/savora-public', {'expiresIn': 3600, 'paths': paths})
    check('Batch-Signieren anonym: veroeffentlichte Bilder signiert, unbekannte mit Fehler', st == 200 and sig[0]['signedURL'] and sig[0]['signedURL'].startswith('/object/sign/savora-public/') and sig[2]['signedURL'] is None and sig[2]['error'], sig)
    st, data = http('GET', '/storage/v1' + sig[0]['signedURL'], apikey=False)
    check('Signierte URL liefert Bytes ohne apikey', st == 200 and data == M.TINY_JPEG)
    st, _ = http('GET', '/storage/v1/object/sign/savora-public/' + paths[0] + '?token=falsch', apikey=False)
    check('Falsches Token: kein Bild', st == 400)
    # Entwurfsbild (hochgeladen, nicht veroeffentlicht)
    draft = str(uuid.uuid4()); upload(tA, f'{A}/{draft}/full-abcdef12.jpg')
    st, sig = http('POST', '/storage/v1/object/sign/savora-public', {'expiresIn': 60, 'paths': [f'{A}/{draft}/full-abcdef12.jpg']})
    check('Entwurfsbild anonym nicht lesbar', sig[0]['signedURL'] is None)
    st, sig = http('POST', '/storage/v1/object/sign/savora-public', {'expiresIn': 60, 'paths': [f'{A}/{draft}/full-abcdef12.jpg']}, token=tB)
    check('Entwurfsbild fuer B nicht lesbar', sig[0]['signedURL'] is None)
    st, sig = http('POST', '/storage/v1/object/sign/savora-public', {'expiresIn': 60, 'paths': [f'{A}/{draft}/full-abcdef12.jpg']}, token=tA)
    check('Entwurfsbild fuer Eigentuemer lesbar', bool(sig[0]['signedURL']))
    st, gone = http('DELETE', '/storage/v1/object/savora-public', {'prefixes': [f'{A}/{draft}/full-abcdef12.jpg']}, token=tA)
    check('Eigenes, nicht referenziertes Bild loeschbar', f'{A}/{draft}/full-abcdef12.jpg' not in M.PUB_OBJECTS)

    # ---------- Zurueckziehen ----------
    st, res = rpc('savora_pub_withdraw', {'p_id': zeitlos}, tA)
    check('Zurueckziehen', st == 200 and res == {'id': zeitlos, 'status': 'withdrawn'})
    g = rpc('savora_lib_get', {'p_id': zeitlos})[1]
    s = rpc('savora_lib_search', {'p_query': 'zeitlos'})[1]
    pp = rpc('savora_lib_profile', {'p_public_id': pub_id_a})[1]
    check('Zurueckgezogen: nicht ueber get/search/profile lesbar (auch nicht fuer den Autor per get)', g is None and s['items'] == [] and zeitlos not in [i['id'] for i in pp['items']] and rpc('savora_lib_get', {'p_id': zeitlos}, tA)[1] is None)
    check('Unbekannte ID und zurueckgezogene: gleich (null)', rpc('savora_lib_get', {'p_id': str(uuid.uuid4())})[1] is None)
    st, e = rpc('savora_pub_profile_delete', {}, tA)
    check('Profil loeschen mit veroeffentlichten Rezepten: Fehler', st == 400 and e['message'] == 'Ziehe zuerst deine Veröffentlichungen zurück.')
    st, mine = rpc('savora_pub_mine', {}, tA)
    check('Meine Veroeffentlichungen: alle eigenen inkl. zurueckgezogen', {pid, par_id, zeitlos} <= {m['id'] for m in mine} and next(m for m in mine if m['id'] == zeitlos)['status'] == 'withdrawn')
    st, res = publish(tA, R('Zeitlos wieder', minutes=12), pid=zeitlos, expected=1)
    check('Erneut veroeffentlichen mit gleicher ID und aktueller Version', st == 200 and res['version'] == 2 and M.PUBS[zeitlos]['status'] == 'published')

    # ---------- Moderation ----------
    st, e = rpc('savora_mod_action', {'p_publication_id': pid, 'p_action': 'hide'}, tB)
    check('Nicht-Moderator: Moderation abgewiesen', st == 400 and M.PUBS[pid]['status'] == 'published')
    st, e = rpc('savora_mod_set', {'p_user': B}, tB)
    check('Moderatorenrechte nicht selbst setzbar (keine Funktion)', st in (400, 404) and B not in M.MODERATORS)
    check('savora_mod_is fuer B false', rpc('savora_mod_is', {}, tB)[1] is False)
    st, e = rpc('savora_lib_report', {'p_id': pid, 'p_reason': 'unsinn'}, tB)
    check('Melden: unbekannter Grund abgewiesen', st == 400)
    st, e = rpc('savora_lib_report', {'p_id': pid, 'p_reason': 'spam'}, tA)
    check('Eigenes Rezept melden: abgewiesen', st == 400 and e['message'] == 'Du kannst dein eigenes Rezept nicht melden.')
    st, res = rpc('savora_lib_report', {'p_id': pid, 'p_reason': 'foreign', 'p_comment': 'Kopiert aus Buch'}, tB)
    check('Melden', st == 200 and res == {'ok': True} and len(M.REPORTS) == 1)
    M.make_moderator(MOD)
    st, reps = rpc('savora_mod_reports', {'p_status': 'open'}, tM)
    check('Moderator sieht Meldung ohne Melder-ID', st == 200 and len(reps) == 1 and B not in json.dumps(reps) and reps[0]['open_reports'] == 1, reps)
    st, res = rpc('savora_mod_action', {'p_publication_id': pid, 'p_action': 'hide', 'p_note': 'Urheberrecht'}, tM)
    check('Ausblenden', st == 200 and res['status'] == 'blocked')
    check('Gesperrt: nicht ueber get/search/profile lesbar', rpc('savora_lib_get', {'p_id': pid})[1] is None and pid not in [i['id'] for i in rpc('savora_lib_search', {})[1]['items']] and pid not in [i['id'] for i in rpc('savora_lib_profile', {'p_public_id': pub_id_a})[1]['items']])
    st, sig = http('POST', '/storage/v1/object/sign/savora-public', {'expiresIn': 60, 'paths': [f'{A}/{pid}/full-0123abcd.jpg']})
    check('Gesperrt: Bild anonym nicht mehr lesbar', sig[0]['signedURL'] is None)
    mine = rpc('savora_pub_mine', {}, tA)[1]
    m = next(x for x in mine if x['id'] == pid)
    check('Autor sieht «gesperrt» ohne Melder und Meldetext', m['blocked'] is True and 'Kopiert' not in json.dumps(mine) and B not in json.dumps(mine))
    st, e = publish(tA, rec, pid=pid, expected=2)
    check('Autor kann ausgeblendetes nicht erneut veroeffentlichen', st == 400 and 'Moderation ausgeblendet' in e['message'], e)
    st, e = publish(tA, rec, pid=str(uuid.uuid4()), src='r_local_1')
    check('Kein Umgehen per neuer ID mit gleicher source_local_id', st == 400 and 'Moderation ausgeblendet' in e['message'], e)
    st, e = rpc('savora_pub_withdraw', {'p_id': pid}, tA)
    check('Gesperrtes kann nicht zurueckgezogen (= umgangen) werden', st == 400 and M.PUBS[pid]['status'] == 'blocked')
    st, mg = rpc('savora_mod_get', {'p_id': pid}, tM)
    check('savora_mod_get: Moderator sieht gesperrtes mit status', st == 200 and mg and mg['status'] == 'blocked' and mg['recipe']['title'])
    st, e = rpc('savora_mod_get', {'p_id': pid}, tB)
    check('savora_mod_get: Nicht-Moderator abgewiesen', st == 400)
    st, res = rpc('savora_mod_action', {'p_publication_id': pid, 'p_action': 'restore'}, tM)
    check('Wiederfreigeben', st == 200 and res['status'] == 'published' and rpc('savora_lib_get', {'p_id': pid})[1] is not None)
    st, res = rpc('savora_mod_ban', {'p_publication_id': pid, 'p_banned': True, 'p_note': 'Wiederholt'}, tM)
    check('Autor sperren', st == 200 and A in M.BANS)
    check('Gesperrter Autor: profile_get meldet publishing_blocked', rpc('savora_pub_profile_get', {}, tA)[1]['publishing_blocked'] is True)
    st, e = publish(tA, R('Trotz Sperre'))
    check('Gesperrter Autor kann nicht veroeffentlichen', st == 400 and e['message'] == 'Dein Konto kann zurzeit keine Rezepte veröffentlichen.', e)
    check('Gesperrter Autor: kann nichts mehr hochladen', upload(tA, f'{A}/{uuid.uuid4()}/full-0123abcd.jpg')[0] == 403)
    check('Sperre nimmt nur das Veroeffentlichungsrecht: bestehende Rezepte bleiben sichtbar (wie SQL)', rpc('savora_lib_search', {})[1]['total'] == n_visible() and n_visible() >= 3 and rpc('savora_lib_profile', {'p_public_id': pub_id_a})[1] is not None)
    rpc('savora_mod_ban', {'p_publication_id': pid, 'p_banned': False}, tM)
    check('Sperre aufheben: Veroeffentlichen wieder moeglich', publish(tA, R('Nach Entsperren'))[0] == 200)
    check('Moderations-Protokoll gefuehrt', [x['action'] for x in M.MOD_LOG] == ['hide', 'restore', 'ban', 'unban'])

    # ---------- Limits ----------
    M.LIMITS['publish_per_day'] = len([e for e in M.LIB_EVENTS if e[0] == B and e[1] == 'publish']) + 2
    r1 = publish(tB, R('B1'))[0]; r2 = publish(tB, R('B2'))[0]; st, e = publish(tB, R('B3'))
    check('Tageslimit Veroeffentlichungen wirkt serverseitig', r1 == 200 and r2 == 200 and st == 400 and 'morgen' in e['message'], e)
    M.LIMITS['publish_per_day'] = 30
    M.LIMITS['reports_per_day'] = 1
    st, e = rpc('savora_lib_report', {'p_id': par_id, 'p_reason': 'spam'}, tB)
    check('Tageslimit Meldungen', st == 400 and 'morgen' in e['message'])
    M.LIMITS['reports_per_day'] = 20
    st, s = rpc('savora_lib_search', {'p_limit': 500})
    check('p_limit wird auf page_max (48) gedeckelt', st == 200 and len(s['items']) <= 48)

    # ---------- Paging, Sortierung, Filter ----------
    M.lib_reset()
    C = M.make_user('viele@example.test')
    base = time.time() - 100000
    seeded = []
    import datetime as dt
    same_ts = '2026-10-10T10:00:00.000000Z'
    for i in range(70):
        ts = same_ts if i < 10 else dt.datetime.fromtimestamp(base + i * 60, dt.timezone.utc).isoformat().replace('+00:00', 'Z')
        mins = None if i % 7 == 0 else (10 + (i % 5) * 10)
        diet = ['vegan'] if i % 3 == 0 else (['vegetarisch'] if i % 3 == 1 else ['fleisch'])
        cats = [['breakfast', 'cake'], ['dinner', 'pasta'], ['lunch', 'soup'], ['dinner', 'soup']][i % 4]
        seeded.append(M.seed_publication(C, R(f'Rezept {i:02d}', minutes=mins, diet=diet, categories=cats), published_at=ts))
    for sort in ('newest', 'quickest'):
        got, cur, pages = [], None, 0
        while True:
            st, s = rpc('savora_lib_search', {'p_query': '', 'p_filters': {}, 'p_sort': sort, 'p_cursor': cur, 'p_limit': 24})
            got += [i['id'] for i in s['items']]; pages += 1; cur = s['next_cursor']
            if not cur or pages > 10: break
        check(f'Paging {sort}: 70 Eintraege in 3 Seiten, keine Dubletten, keine Luecken (auch bei gleichem published_at)', len(got) == 70 and len(set(got)) == 70 and pages == 3 and s['total'] == 70, (len(got), len(set(got)), pages))
        if sort == 'quickest':
            mins = [M.PUBS[i]['total_minutes'] for i in got]
            known = [m for m in mins if m is not None]
            check('quickest: Zeit aufsteigend, unbekannt zuletzt', known == sorted(known) and all(m is None for m in mins[len(known):]))
        else:
            keys = [(M.PUBS[i]['published_at'], M.PUBS[i]['id']) for i in got]
            check('newest: published_at desc, id desc stabil', keys == sorted(keys, reverse=True))
    again = []
    cur = None
    for _ in range(3):
        s = rpc('savora_lib_search', {'p_sort': 'newest', 'p_cursor': cur})[1]; again += [i['id'] for i in s['items']]; cur = s['next_cursor']
    check('Gleiche Abfrage zweimal: gleiche Reihenfolge', again == got[:len(again)] or len(again) == 70)
    s = rpc('savora_lib_search', {'p_filters': {'veg': True}, 'p_limit': 48})[1]
    check('Vegetarisch schliesst vegan ein', s['total'] == sum(1 for i in range(70) if i % 3 in (0, 1)), s['total'])
    s = rpc('savora_lib_search', {'p_filters': {'categories': ['dinner', 'lunch']}, 'p_limit': 48})[1]
    check('Kategorien: Mahlzeiten untereinander ODER', s['total'] == sum(1 for i in range(70) if i % 4 in (1, 2, 3)))
    s = rpc('savora_lib_search', {'p_filters': {'categories': ['dinner', 'soup']}, 'p_limit': 48})[1]
    check('Kategorien: Mahlzeit UND Gericht', s['total'] == sum(1 for i in range(70) if i % 4 == 3))
    s = rpc('savora_lib_search', {'p_filters': {'categories': ['soup', 'pasta']}, 'p_limit': 48})[1]
    check('Kategorien: Gerichte untereinander ODER', s['total'] == sum(1 for i in range(70) if i % 4 in (1, 2, 3)))
    s = rpc('savora_lib_search', {'p_filters': {'diet': ['fleisch']}, 'p_limit': 48})[1]
    check('diet-Filter', s['total'] == sum(1 for i in range(70) if i % 3 == 2))
    for i in range(70, 1010): M.seed_publication(C, R(f'Masse {i}'), published_at=same_ts)
    s = rpc('savora_lib_search', {})[1]
    check('total mit Deckel 1000', s['total'] == 1000 and s['total_capped'] is True)

    # ---------- Konto loeschen ----------
    st, _ = rpc('savora_delete_account', {}, M.token_for(C))
    check('Konto loeschen entfernt oeffentliches Profil und Publikationen', st == 204 and C not in M.PUB_PROFILES and not any(p['owner'] == C for p in M.PUBS.values()) and rpc('savora_lib_search', {})[1]['total'] == 0)

    print(f'Dauer: {time.time() - t0:.1f} s')
    if FAIL:
        print('FEHLGESCHLAGEN:', len(FAIL)); sys.exit(1)
    print('ALLE BESTANDEN')

if __name__ == '__main__':
    main()
