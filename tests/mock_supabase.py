"""Lokaler Nachbau der von Savora genutzten Supabase-Schnittstellen, nur fuer Tests.
Bildet nach: Anmeldung (Passwort, Refresh, Registrierung mit Bestaetigung), Datensatz-Tabelle mit
Zugriffstrennung pro Konto und der Konfliktregel des Datenbank-Triggers, privaten Bildspeicher,
Konto loeschen, oeffentliche Rezeptbibliothek (Vertrag §4, siehe Abschnitt unten). Laeuft auf localhost:8796."""
import json, time, uuid, threading
from datetime import datetime, timezone, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote

USERS = {}      # email -> {id, password, confirmed}
TOKENS = {}     # access_token -> user_id
REFRESH = {}    # refresh_token -> user_id
RECORDS = {}    # (user_id, kind, id) -> row
OBJECTS = {}    # path -> (bytes, content_type)
LOG = []
PROFILES = {}   # user_id -> {handle, display_name, invite_code}
CONNS = {}      # (requester, addressee) -> status
SHARES = {}     # id -> row
SIGNUP_DISABLED = [False]
LOCK = threading.Lock()
CLOCK = [datetime(2026, 1, 1, tzinfo=timezone.utc)]

def now_ts():
    CLOCK[0] = max(CLOCK[0] + timedelta(milliseconds=1), datetime.now(timezone.utc))
    return CLOCK[0].isoformat().replace('+00:00', 'Z')

def issue(uid):
    at, rt = 'at-' + uuid.uuid4().hex, 'rt-' + uuid.uuid4().hex
    TOKENS[at] = uid; REFRESH[rt] = uid
    email = next(e for e, u in USERS.items() if u['id'] == uid)
    return {'access_token': at, 'refresh_token': rt, 'expires_in': 3600, 'expires_at': int(time.time()) + 3600, 'token_type': 'bearer', 'user': {'id': uid, 'email': email}}

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
    def reply(self, code, obj=None, raw=None, ctype='application/json'):
        self.send_response(code); self.cors()
        body = raw if raw is not None else (json.dumps(obj).encode() if obj is not None else b'')
        if body: self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body))); self.end_headers()
        if body: self.wfile.write(body)
    def do_OPTIONS(self): self.reply(204)
    def body(self):
        n = int(self.headers.get('Content-Length') or 0)
        return self.rfile.read(n) if n else b''
    def uid(self):
        a = self.headers.get('Authorization', '')
        return TOKENS.get(a[7:]) if a.startswith('Bearer ') else None
    def handle_any(self, method):
        if method == 'GET' and self.path.startswith('/storage/v1/object/sign/' + PUB_BUCKET + '/'):
            with LOCK:   # signierte URL: wie bei Supabase ohne apikey-Header lesbar
                LOG.append((method, urlparse(self.path).path))
                return self.lib_signed_get()
        if self.headers.get('apikey') != 'test-key':
            return self.reply(401, {'message': 'Invalid API key'})
        u = urlparse(self.path); q = parse_qs(u.query); p = u.path
        with LOCK:
            LOG.append((method, p))
            if p == '/auth/v1/signup' and method == 'POST':
                b = json.loads(self.body()); e = b['email'].lower()
                if SIGNUP_DISABLED[0]: return self.reply(422, {'error_code': 'signup_disabled', 'msg': 'Signups not allowed for this instance'})
                if e in USERS: return self.reply(422, {'error_code': 'user_already_exists', 'msg': 'User already registered'})
                USERS[e] = {'id': str(uuid.uuid4()), 'password': b['password'], 'confirmed': False}
                return self.reply(200, {'id': USERS[e]['id'], 'email': e, 'confirmation_sent_at': now_ts()})
            if p == '/auth/v1/token' and method == 'POST':
                b = json.loads(self.body())
                if q.get('grant_type') == ['password']:
                    usr = USERS.get(b['email'].lower())
                    if not usr or usr['password'] != b['password']: return self.reply(400, {'error_code': 'invalid_credentials', 'msg': 'Invalid login credentials'})
                    if not usr['confirmed']: return self.reply(400, {'error_code': 'email_not_confirmed', 'msg': 'Email not confirmed'})
                    return self.reply(200, issue(usr['id']))
                uid = REFRESH.pop(b.get('refresh_token'), None)
                if not uid or uid not in [x['id'] for x in USERS.values()]: return self.reply(400, {'error_code': 'refresh_token_not_found', 'msg': 'Invalid Refresh Token'})
                return self.reply(200, issue(uid))
            if p == '/auth/v1/user' and method == 'GET':
                uid = self.uid()
                if not uid: return self.reply(401, {'msg': 'invalid token'})
                email = next(e for e, x in USERS.items() if x['id'] == uid)
                return self.reply(200, {'id': uid, 'email': email})
            if p == '/auth/v1/user' and method == 'PUT':
                uid = self.uid()
                if not uid: return self.reply(401, {'msg': 'invalid token'})
                b = json.loads(self.body())
                for e, x in USERS.items():
                    if x['id'] == uid: x['password'] = b['password']
                return self.reply(200, {'id': uid})
            if p == '/auth/v1/logout': return self.reply(204)
            if p == '/auth/v1/recover': return self.reply(200, {})
            uid = self.uid()
            if not uid and self.headers.get('Authorization', '').startswith('Bearer '):
                if p.startswith('/rest/v1/rpc/savora_lib_') or p.startswith('/storage/v1/object/sign/' + PUB_BUCKET):
                    return self.reply(401, {'code': 'PGRST301', 'message': 'JWT expired'})
            if method == 'POST' and p in ANON_RPCS:   # oeffentliche Bibliothek: auch ohne Anmeldung (nur apikey)
                return self.lib_rpc(p.rsplit('/', 1)[1], uid, json.loads(self.body() or b'{}'))
            if method == 'POST' and p == '/storage/v1/object/sign/' + PUB_BUCKET:   # Batch-Signieren: anon und angemeldet
                return self.lib_sign_batch(uid, json.loads(self.body() or b'{}'))
            if not uid: return self.reply(401, {'message': 'JWT required'})
            if p.startswith('/storage/v1/object/' + PUB_BUCKET):
                return self.lib_storage(method, p, uid)
            if p == '/rest/v1/savora_records' and method == 'POST':
                rows = json.loads(self.body())
                for r in rows:
                    if r.get('user_id', uid) != uid: return self.reply(403, {'message': 'new row violates row-level security policy'})
                    key = (uid, r['kind'], r['id'])
                    old = RECORDS.get(key)
                    if old and r['client_updated_at'] < old['client_updated_at']: continue  # Trigger: aelterer Stand wird verworfen
                    RECORDS[key] = {'kind': r['kind'], 'id': r['id'], 'data': r['data'], 'deleted': r['deleted'], 'client_updated_at': r['client_updated_at'], 'server_updated_at': now_ts()}
                return self.reply(201)
            if p == '/rest/v1/savora_records' and method == 'GET':
                rows = [v for (o, k, i), v in RECORDS.items() if o == uid]
                gt = q.get('server_updated_at', [None])[0]
                if gt and gt.startswith('gt.'):
                    t = gt[3:]; rows = [r for r in rows if r['server_updated_at'] > t]
                rows.sort(key=lambda r: r['server_updated_at'])
                lim = int(q.get('limit', ['1000'])[0])
                return self.reply(200, rows[:lim])
            if p.startswith('/rest/v1/rpc/savora_') and method == 'POST' and p != '/rest/v1/rpc/savora_delete_account':
                return self.rpc(p.rsplit('/', 1)[1], uid, json.loads(self.body() or b'{}'))
            if p == '/rest/v1/rpc/savora_delete_account' and method == 'POST':
                PROFILES.pop(uid, None)
                lib_delete_user(uid)
                for k in [k for k in CONNS if uid in k]: del CONNS[k]
                for k in [k for k, v in SHARES.items() if uid in (v['sender'], v['recipient'])]: del SHARES[k]
                for k in [k for k in RECORDS if k[0] == uid]: del RECORDS[k]
                for e in [e for e, x in USERS.items() if x['id'] == uid]: del USERS[e]
                return self.reply(204)
            if p.startswith('/storage/v1/object/list/savora-images') and method == 'POST':
                b = json.loads(self.body()); pre = b['prefix'].rstrip('/') + '/'
                if not pre.startswith(uid + '/'): return self.reply(200, [])
                return self.reply(200, [{'name': k[len(pre):], 'id': k} for k in OBJECTS if k.startswith(pre)])
            if p == '/storage/v1/object/savora-images' and method == 'DELETE':
                b = json.loads(self.body())
                for path in b['prefixes']:
                    if path.startswith(uid + '/'): OBJECTS.pop(unquote(path), None)
                return self.reply(200, [])
            if p.startswith('/storage/v1/object/authenticated/savora-images/') and method == 'GET':
                path = unquote(p[len('/storage/v1/object/authenticated/savora-images/'):])
                if not path.startswith(uid + '/') or path not in OBJECTS: return self.reply(404, {'message': 'Object not found'})
                data, ct = OBJECTS[path]; return self.reply(200, raw=data, ctype=ct)
            if p.startswith('/storage/v1/object/savora-images/') and method == 'POST':
                path = unquote(p[len('/storage/v1/object/savora-images/'):])
                if not path.startswith(uid + '/'): return self.reply(403, {'message': 'row-level security'})
                OBJECTS[path] = (self.body(), self.headers.get('Content-Type', 'application/octet-stream'))
                return self.reply(200, {'Key': 'savora-images/' + path})
            return self.reply(404, {'message': 'not found ' + p})
    def rpc(self, name, me, a):
        """Nachbau der SQL-Funktionen aus supabase/paket36-teilen.sql (gleiche Regeln, gleiche Meldungen)."""
        import re, random
        def err(msg): return self.reply(400, {'code': 'P0001', 'message': msg})
        if name.startswith(('savora_lib_', 'savora_pub_', 'savora_mod_')): return self.lib_rpc(name, me, a)
        by_handle = lambda h: next((u for u, p in PROFILES.items() if p['handle'] == str(h or '').strip().strip('@').lower()), None)
        connected = lambda x, y: CONNS.get((x, y)) == 'accepted' or CONNS.get((y, x)) == 'accepted'
        if name == 'savora_profile_get':
            p = PROFILES.get(me); return self.reply(200, p if p else None)
        if name == 'savora_profile_set':
            h = str(a.get('p_handle') or '').strip().strip('@').lower(); n = str(a.get('p_name') or '').strip()
            if not re.fullmatch(r'[a-z0-9_]{3,24}', h): return err('Der Profilname braucht 3 bis 24 Zeichen: Kleinbuchstaben, Zahlen oder _.')
            if len(n) > 40: return err('Der Anzeigename ist zu lang (höchstens 40 Zeichen).')
            if any(u != me and p['handle'] == h for u, p in PROFILES.items()): return err('Dieser Profilname ist schon vergeben.')
            old = PROFILES.get(me)
            code = old['invite_code'] if old else 'SAV-%s-%s' % tuple(''.join(random.choice('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') for _ in range(4)) for _ in range(2))
            PROFILES[me] = {'handle': h, 'display_name': n, 'invite_code': code}
            return self.reply(200, PROFILES[me])
        if name == 'savora_invite_reset':
            if me not in PROFILES: return err('Lege zuerst dein Profil an.')
            PROFILES[me]['invite_code'] = 'SAV-%s-%s' % tuple(''.join(random.choice('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') for _ in range(4)) for _ in range(2))
            return self.reply(200, PROFILES[me])
        if name == 'savora_connect':
            if me not in PROFILES: return err('Lege zuerst dein Profil an.')
            t = str(a.get('p_target') or '').strip().strip('@')
            if not t: return err('Bitte einen Profilnamen oder Einladungscode eingeben.')
            other = next((u for u, p in PROFILES.items() if p['invite_code'] == t.upper()), None) if t.upper().startswith('SAV-') else by_handle(t)
            if not other: return err('Profil nicht gefunden.')
            if other == me: return err('Das bist du selbst.')
            r_in, r_out = CONNS.get((other, me)), CONNS.get((me, other))
            if r_in == 'blocked': return err('Profil nicht gefunden.')
            if 'accepted' in (r_in, r_out): st = 'connected'
            elif r_in == 'pending': CONNS[(other, me)] = 'accepted'; st = 'connected'
            elif r_out == 'pending': st = 'outgoing'
            else:
                CONNS.pop((me, other), None)
                if sum(1 for (x, y), v in CONNS.items() if x == me and v == 'pending') >= 30: return err('Du hast schon viele offene Anfragen. Bitte warte, bis einige beantwortet sind.')
                CONNS[(me, other)] = 'pending'; st = 'outgoing'
            return self.reply(200, {'state': st, 'handle': PROFILES[other]['handle'], 'display_name': PROFILES[other]['display_name']})
        if name == 'savora_connections_list':
            out = []
            for (x, y), st in CONNS.items():
                if me not in (x, y) or (st == 'blocked' and y == me): continue
                o = y if x == me else x
                state = 'connected' if st == 'accepted' else ('incoming' if st == 'pending' and y == me else 'outgoing' if st == 'pending' else 'blocked')
                out.append({'handle': PROFILES[o]['handle'], 'display_name': PROFILES[o]['display_name'], 'state': state})
            return self.reply(200, sorted(out, key=lambda r: r['handle']))
        if name == 'savora_respond':
            o = by_handle(a.get('p_handle'))
            if not o: return err('Profil nicht gefunden.')
            act = a.get('p_action')
            if act == 'accept':
                if CONNS.get((o, me)) != 'pending': return err('Die Anfrage gibt es nicht mehr.')
                CONNS[(o, me)] = 'accepted'
            elif act == 'decline':
                if CONNS.get((o, me)) == 'pending': del CONNS[(o, me)]
            elif act == 'block':
                CONNS.pop((o, me), None); CONNS.pop((me, o), None); CONNS[(me, o)] = 'blocked'
                for k in [k for k, v in SHARES.items() if {v['sender'], v['recipient']} == {me, o}]: del SHARES[k]
            else: return err('Unbekannte Aktion.')
            return self.reply(200)
        if name == 'savora_remove':
            o = by_handle(a.get('p_handle'))
            if o:
                CONNS.pop((me, o), None)
                if CONNS.get((o, me)) != 'blocked': CONNS.pop((o, me), None)
                for k in [k for k, v in SHARES.items() if {v['sender'], v['recipient']} == {me, o}]: del SHARES[k]
            return self.reply(200)
        if name == 'savora_send':
            o = by_handle(a.get('p_handle'))
            if not o or not connected(me, o): return err('Du bist mit diesem Profil nicht verbunden.')
            rec = a.get('p_recipe')
            if not isinstance(rec, dict): return err('Ungültiges Rezept.')
            if not str(rec.get('title') or '').strip(): return err('Das Rezept braucht einen Titel.')
            msg = (a.get('p_message') or '').strip() or None
            if msg and len(msg) > 200: return err('Die Nachricht ist zu lang (höchstens 200 Zeichen).')
            img = a.get('p_image')
            if img is not None and not re.fullmatch(r'data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+', img): return err('Ungültiges Bild.')
            if sum(1 for v in SHARES.values() if v['sender'] == me and v['recipient'] == o) >= 20: return err('Es liegen schon 20 ungeöffnete Rezepte bei diesem Profil. Bitte warte, bis sie angesehen wurden.')
            sid = str(uuid.uuid4())
            SHARES[sid] = {'id': sid, 'sender': me, 'recipient': o, 'title': str(rec['title']).strip()[:200], 'recipe': rec, 'image': img, 'message': msg, 'created_at': now_ts()}
            return self.reply(200, sid)
        if name == 'savora_inbox':
            out = [{'id': v['id'], 'from_handle': PROFILES[v['sender']]['handle'], 'from_name': PROFILES[v['sender']]['display_name'], 'title': v['title'], 'message': v['message'], 'created_at': v['created_at'], 'has_image': v['image'] is not None, 'recipe': v['recipe']}
                   for v in SHARES.values() if v['recipient'] == me and connected(me, v['sender'])]
            return self.reply(200, sorted(out, key=lambda r: r['created_at']))
        if name == 'savora_inbox_count':
            n = sum(1 for v in SHARES.values() if v['recipient'] == me and connected(me, v['sender'])) + sum(1 for (x, y), st in CONNS.items() if y == me and st == 'pending')
            return self.reply(200, n)
        if name == 'savora_share_image':
            v = SHARES.get(a.get('p_id')); return self.reply(200, v['image'] if v and v['recipient'] == me else None)
        if name == 'savora_share_done':
            v = SHARES.get(a.get('p_id'))
            if v and v['recipient'] == me: del SHARES[a.get('p_id')]
            return self.reply(200)
        return self.reply(404, {'message': 'unbekannte Funktion ' + name})
    def do_GET(self): self.handle_any('GET')
    def do_POST(self): self.handle_any('POST')
    def do_PUT(self): self.handle_any('PUT')
    def do_DELETE(self): self.handle_any('DELETE')

# =====================================================================================================
# Nachbau der oeffentlichen Rezeptbibliothek (Vertrag §4, supabase/paket45-bibliothek.sql), nur fuer Tests.
# Gleiche Regeln und deutsche Fehlermeldungen wie die SQL-Funktionen. Ersetzt NICHT die SQL-Pruefung.
# =====================================================================================================
import re as _re, unicodedata as _ud, secrets as _secrets
PUB_BUCKET = 'savora-public'
ANON_RPCS = {'/rest/v1/rpc/savora_lib_search', '/rest/v1/rpc/savora_lib_get', '/rest/v1/rpc/savora_lib_profile'}
PUB_PROFILES = {}   # user_id -> {public_id, display_name, bio, avatar_path, created_at, updated_at}
PUBS = {}           # publication_id -> Zeile wie savora_publications
PUB_VERSIONS = {}   # (publication_id, version) -> {recipe, image_path, thumb_path, request_id, created_at}
PUB_REQUESTS = {}   # (owner, request_id) -> Antwort (Idempotenz)
PUB_OBJECTS = {}    # pfad -> (bytes, content_type, owner, created_ts)
SIGNED = {}         # token -> (pfad, ablauf_epoch)
REPORTS = {}        # report_id -> Zeile
MODERATORS = set()  # user_ids (nur per SQL durch Betreiber)
BANS = {}           # user_id -> {reason, created_at, created_by}
MOD_LOG = []        # [{moderator, action, publication_id, target_user, note, created_at}]
LIMITS = {'publish_per_day': 30, 'reports_per_day': 20, 'uploads_per_day': 80, 'page_max': 48}
TERMS = {'bibliothek-2026-10-15'}
TERMS_ACCEPT = []   # [{user_id, version, publication_id, accepted_at}]
LIB_EVENTS = []     # [(user_id, art, epoch)] fuer Tageslimits (publish, report, upload)
LIB_FAIL = {}       # Test-Schalter: rpc-name -> {'status':..., 'message':...} (einmalig) oder 'always'
MEAL_IDS = {'breakfast', 'brunch', 'lunch', 'dinner', 'snack', 'dessert'}
PUBLIC_DIETS = ['vegan', 'vegetarisch', 'fleisch', 'fisch']
UUID_RE = _re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
MAX_UPLOAD = 3 * 1024 * 1024

def lib_norm(s):
    """Suchnormalisierung: klein, Umlaute/Akzente gleichwertig (ä = a, é = e), ß = ss, Satzzeichen ignoriert."""
    s = str(s or '').replace('ß', 'ss').replace('ẞ', 'ss')
    s = ''.join(c for c in _ud.normalize('NFKD', s) if not _ud.combining(c)).lower()
    return ' '.join(_re.sub(r'[^0-9a-z]+', ' ', s).split())

def _ts_us(iso):
    return int(datetime.fromisoformat(str(iso).replace('Z', '+00:00')).timestamp() * 1_000_000)

class LibError(Exception):
    pass

def lib_clean(r):
    """Nachbau von savora_lib_clean: baut das oeffentliche Rezept strikt neu auf (Vertrag §2), unbekannte Felder fallen weg."""
    if not isinstance(r, dict): raise LibError('Ungültiges Rezept.')
    def s(v, n):
        return v.strip() if isinstance(v, str) else ''
    def int_or_none(v, lo, hi):
        if isinstance(v, bool) or not isinstance(v, (int, float)): return None
        if v != int(v): v = round(v)
        v = int(v)
        return v if lo <= v <= hi else None
    title = s(r.get('title'), 200)
    if not title: raise LibError('Das Rezept braucht einen Titel.')
    if len(title) > 200: raise LibError('Der Titel ist zu lang (höchstens 200 Zeichen).')
    sv = r.get('servings')
    servings = sv if (not isinstance(sv, bool) and isinstance(sv, (int, float)) and 1 <= sv <= 10000) else None
    mode = r.get('servingMode') if r.get('servingMode') in ('portions', 'pieces') else 'portions'
    tm = int_or_none(r.get('timeMinutes'), 0, 100000)
    if tm == 0: tm = None   # 0 ist unbekannt, nie «0 Minuten»
    ings = r.get('ingredients')
    if not isinstance(ings, list) or not ings: raise LibError('Das Rezept braucht mindestens eine Zutat.')
    if len(ings) > 300: raise LibError('Zu viele Zutaten (höchstens 300).')
    out_ing = []
    for i in ings:
        if not isinstance(i, dict): continue
        amt = i.get('amount')
        if isinstance(amt, bool) or not isinstance(amt, (int, float, str)) or amt is None: amt = ''
        if isinstance(amt, str): amt = amt.strip()
        if isinstance(amt, str) and len(amt) > 40: raise LibError('Eine Mengenangabe ist zu lang (höchstens 40 Zeichen).')
        name = s(i.get('name'), 300)
        if len(name) > 300: raise LibError('Ein Zutatentext ist zu lang (höchstens 300 Zeichen).')
        unit, group = s(i.get('unit'), 40), s(i.get('group'), 100)
        if len(unit) > 40 or len(group) > 100: raise LibError('Eine Einheit oder ein Abschnittsname ist zu lang.')
        if not name and not i.get('isGroupHeader'): continue
        out_ing.append({'amount': amt, 'unit': unit, 'name': name, 'group': group, 'isGroupHeader': i.get('isGroupHeader') is True})
    if not any(not x['isGroupHeader'] for x in out_ing): raise LibError('Das Rezept braucht mindestens eine Zutat.')
    steps = r.get('steps')
    if not isinstance(steps, list): steps = []
    if len(steps) > 200: raise LibError('Zu viele Schritte (höchstens 200).')
    out_steps = []
    for st in steps:
        t = s(st.get('text') if isinstance(st, dict) else st, 4000)
        if len(t) > 4000: raise LibError('Ein Zubereitungsschritt ist zu lang (höchstens 4000 Zeichen).')
        if t: out_steps.append({'text': t})
    if not out_steps: raise LibError('Das Rezept braucht mindestens einen Zubereitungsschritt.')
    tips = s(r.get('tips'), 2000)
    if len(tips) > 2000: raise LibError('Die Kochtipps sind zu lang (höchstens 2000 Zeichen).')
    src = r.get('source') if isinstance(r.get('source'), dict) else {}
    url = s(src.get('url'), 500)
    if not (url.startswith('https://') and len(url) <= 500): url = ''
    diet = r.get('diet') if isinstance(r.get('diet'), list) else []
    cats = r.get('categories') if isinstance(r.get('categories'), list) else []
    return {
        'v': 1, 'title': title, 'servings': servings, 'servingMode': mode,
        'yieldLabel': s(r.get('yieldLabel'), 40)[:40], 'timeMinutes': tm,
        'prepMinutes': int_or_none(r.get('prepMinutes'), 1, 100000),
        'cookMinutes': int_or_none(r.get('cookMinutes'), 1, 100000),
        'restMinutes': int_or_none(r.get('restMinutes'), 1, 100000),
        'difficulty': s(r.get('difficulty'), 30)[:30],
        'diet': [d for d in PUBLIC_DIETS if d in diet],
        'categories': list(dict.fromkeys(c for c in cats if isinstance(c, str) and _re.fullmatch(r'[a-z0-9-]{1,30}', c)))[:12],
        'ingredients': out_ing, 'steps': out_steps, 'tips': tips,
        'source': {'url': url, 'text': s(src.get('text'), 200)[:200]},
    }

def _author_ok(owner):
    return owner in PUB_PROFILES and owner not in BANS

def _visible(p):
    return p is not None and p['status'] == 'published' and _author_ok(p['owner'])

def _card(p):
    pr = PUB_PROFILES[p['owner']]
    return {'id': p['id'], 'title': p['title'], 'total_minutes': p['total_minutes'],
            'author': {'public_id': pr['public_id'], 'display_name': pr['display_name']},
            'thumb_path': p['thumb_path'], 'image_path': p['image_path'], 'published_at': p['published_at'], 'version': p['version']}

def _sort_key(sort, tm, published_at, pid):
    k = (-_ts_us(published_at), -uuid.UUID(pid).int)
    if sort == 'quickest': return (0 if tm is not None else 1, tm if tm is not None else 0) + k
    return k

def _page(items, sort, cursor, limit):
    """Keyset-Seite: Cursor ist JSON {t, p, id} des letzten Eintrags der vorigen Seite."""
    items = sorted(items, key=lambda p: _sort_key(sort, p['total_minutes'], p['published_at'], p['id']))
    if isinstance(cursor, dict) and cursor.get('id') and cursor.get('p'):
        try:
            ck = _sort_key(sort, cursor.get('t'), cursor['p'], cursor['id'])
            items = [p for p in items if _sort_key(sort, p['total_minutes'], p['published_at'], p['id']) > ck]
        except (ValueError, TypeError):
            raise LibError('Ungültige Seitenangabe.')
    page = items[:limit]
    nxt = None
    if len(items) > limit:
        last = page[-1]; nxt = {'t': last['total_minutes'], 'p': last['published_at'], 'id': last['id']}
    return page, nxt

def _matches(p, q_tokens, f):
    if q_tokens and not all(t in p['search_text'] for t in q_tokens): return False
    tm = p['total_minutes']
    if f.get('quick') is True and (tm is None or tm > 30): return False
    mx = f.get('max_minutes')
    if mx is not None and not isinstance(mx, bool) and isinstance(mx, (int, float)) and (tm is None or tm > mx): return False
    if f.get('veg') is True and not ({'vegetarisch', 'vegan'} & set(p['diet'])): return False
    diet = [d for d in (f.get('diet') or []) if isinstance(d, str)]
    if diet and not (set(diet) & set(p['diet'])): return False
    cats = [c for c in (f.get('categories') or []) if isinstance(c, str)]
    meal, dish = {c for c in cats if c in MEAL_IDS}, {c for c in cats if c not in MEAL_IDS}
    pc = set(p['categories'])
    if meal and not (meal & pc): return False
    if dish and not (dish & pc): return False
    return True

def _count_today(uid, kind):
    t = time.time() - 86400
    return sum(1 for u, k, ts in LIB_EVENTS if u == uid and k == kind and ts > t)

def _new_public_id():
    while True:
        pid = ''.join(_secrets.choice('abcdefghijklmnopqrstuvwxyz0123456789') for _ in range(12))
        if all(p['public_id'] != pid for p in PUB_PROFILES.values()): return pid

def _pub_path_ok(uid, pid, path):
    return isinstance(path, str) and path.startswith(f'{uid}/{pid}/') and bool(_re.fullmatch(r'[^/]+/[^/]+/(full|thumb)-[0-9a-f]{8,}\.(jpg|webp)', path))

def _referenced(path, include_blocked):
    for p in PUBS.values():
        if path in (p['image_path'], p['thumb_path']):
            if p['status'] == 'published' or (include_blocked and p['status'] == 'blocked'): return True
    return False

def _readable(uid, path):
    """Leserecht wie Storage-Policy (Vertrag §4): eigenes Objekt, oder referenziert von veroeffentlichter (nicht gesperrter) Publikation eines nicht gesperrten Autors, oder oeffentliches Profilbild."""
    if path not in PUB_OBJECTS: return False
    if uid and path.startswith(uid + '/'): return True
    for p in PUBS.values():
        if _visible(p) and path in (p['image_path'], p['thumb_path']): return True
    return any(pr.get('avatar_path') == path and u not in BANS for u, pr in PUB_PROFILES.items())

def lib_delete_user(uid):
    """Konto loeschen: oeffentliches Profil, Publikationen (mit Versionen und Meldungen), Bilder, Sperre entfernen (cascade)."""
    PUB_PROFILES.pop(uid, None)
    gone = [k for k, p in PUBS.items() if p['owner'] == uid]
    for k in gone: del PUBS[k]
    for k in [k for k in PUB_VERSIONS if k[0] in gone]: del PUB_VERSIONS[k]
    for k in [k for k, r in REPORTS.items() if r['publication_id'] in gone or r['reporter'] == uid]: del REPORTS[k]
    for k in [k for k in PUB_REQUESTS if k[0] == uid]: del PUB_REQUESTS[k]
    for k in [k for k in PUB_OBJECTS if k.startswith(uid + '/')]: del PUB_OBJECTS[k]
    BANS.pop(uid, None); MODERATORS.discard(uid)

def _lib_rpc(self, name, me, a):
    def ok(obj): return self.reply(200, obj) if obj is not None else self.reply(200, raw=b'null')   # PostgREST: null als JSON
    def err(msg, status=400): return self.reply(status, {'code': 'P0001', 'message': msg})
    if not isinstance(a, dict): a = {}
    fail = LIB_FAIL.get(name)
    if fail:
        if not fail.get('always'): LIB_FAIL.pop(name, None)
        return self.reply(fail.get('status', 500), {'code': fail.get('code', 'XX000'), 'message': fail.get('message', 'Serverfehler')})
    try:
        # ---------- oeffentlich (anon und angemeldet) ----------
        if name == 'savora_lib_search':
            f = a.get('p_filters') if isinstance(a.get('p_filters'), dict) else {}
            sort = a.get('p_sort') if a.get('p_sort') in ('newest', 'quickest') else 'newest'
            lim = a.get('p_limit')
            lim = 24 if (lim is None or isinstance(lim, bool) or not isinstance(lim, int)) else max(1, min(lim, LIMITS['page_max']))
            toks = lib_norm(a.get('p_query') or '').split()
            hits = [p for p in PUBS.values() if _visible(p) and _matches(p, toks, f)]
            page, nxt = _page(hits, sort, a.get('p_cursor'), lim)
            return ok({'items': [_card(p) for p in page], 'next_cursor': nxt, 'total': min(len(hits), 1000), 'total_capped': len(hits) > 1000})
        if name == 'savora_lib_get':
            p = PUBS.get(str(a.get('p_id') or ''))
            if not _visible(p): return ok(None)
            pr = PUB_PROFILES[p['owner']]
            return ok({'id': p['id'], 'version': p['version'], 'recipe': p['recipe'],
                       'author': {'public_id': pr['public_id'], 'display_name': pr['display_name'], 'bio': pr['bio'], 'avatar_path': pr['avatar_path']},
                       'image_path': p['image_path'], 'thumb_path': p['thumb_path'], 'published_at': p['published_at'], 'updated_at': p['updated_at']})
        if name == 'savora_lib_profile':
            owner = next((u for u, pr in PUB_PROFILES.items() if pr['public_id'] == str(a.get('p_public_id') or '')), None)
            if not owner or owner in BANS: return ok(None)
            pr = PUB_PROFILES[owner]
            page, nxt = _page([p for p in PUBS.values() if p['owner'] == owner and _visible(p)], 'newest', a.get('p_cursor'), 24)
            return ok({'profile': {'public_id': pr['public_id'], 'display_name': pr['display_name'], 'bio': pr['bio'], 'avatar_path': pr['avatar_path']},
                       'items': [_card(p) for p in page], 'next_cursor': nxt})
        if not me: return self.reply(401, {'message': 'JWT required'})
        # ---------- angemeldet ----------
        if name == 'savora_lib_report':
            p = PUBS.get(str(a.get('p_id') or ''))
            if not _visible(p): raise LibError('Dieses Rezept ist nicht mehr öffentlich verfügbar.')
            reason = a.get('p_reason')
            if reason not in ('spam', 'foreign', 'problematic', 'other'): raise LibError('Bitte wähle einen Grund.')
            comment = str(a.get('p_comment') or '').strip()
            if len(comment) > 500: raise LibError('Der Kommentar ist zu lang (höchstens 500 Zeichen).')
            if any(r['publication_id'] == p['id'] and r['reporter'] == me and r['status'] == 'open' for r in REPORTS.values()): return ok({'ok': True})
            if _count_today(me, 'report') >= LIMITS['reports_per_day']: raise LibError('Du hast heute schon viele Meldungen gesendet. Bitte versuche es morgen wieder.')
            rid = str(uuid.uuid4())
            REPORTS[rid] = {'id': rid, 'publication_id': p['id'], 'reporter': me, 'reason': reason, 'comment': comment, 'status': 'open', 'created_at': now_ts(), 'closed_at': None, 'closed_by': None}
            LIB_EVENTS.append((me, 'report', time.time()))
            return ok({'ok': True})
        if name == 'savora_pub_profile_get':
            pr = PUB_PROFILES.get(me)
            return ok(dict(public_id=pr['public_id'], display_name=pr['display_name'], bio=pr['bio'], avatar_path=pr['avatar_path'], publishing_blocked=me in BANS) if pr else None)
        if name == 'savora_pub_profile_set':
            n = str(a.get('p_name') or '').strip(); bio = str(a.get('p_bio') or '').strip(); av = a.get('p_avatar_path') or None
            if not n: raise LibError('Bitte gib einen Namen ein.')
            if len(n) > 40: raise LibError('Der Name ist zu lang (höchstens 40 Zeichen).')
            if len(bio) > 160: raise LibError('Die Beschreibung ist zu lang (höchstens 160 Zeichen).')
            if av is not None and not (isinstance(av, str) and _re.fullmatch(_re.escape(me) + r'/avatar-[0-9a-f]{8,}\.(jpg|webp)', av) and av in PUB_OBJECTS):
                raise LibError('Ungültiges Profilbild.')
            old = PUB_PROFILES.get(me); t = now_ts()
            PUB_PROFILES[me] = {'public_id': old['public_id'] if old else _new_public_id(), 'display_name': n, 'bio': bio, 'avatar_path': av,
                                'created_at': old['created_at'] if old else t, 'updated_at': t}
            pr = PUB_PROFILES[me]
            return ok(dict(public_id=pr['public_id'], display_name=pr['display_name'], bio=pr['bio'], avatar_path=pr['avatar_path'], publishing_blocked=me in BANS))
        if name == 'savora_pub_profile_delete':
            if any(p['owner'] == me and p['status'] == 'published' for p in PUBS.values()): raise LibError('Ziehe zuerst deine Veröffentlichungen zurück.')
            PUB_PROFILES.pop(me, None)
            return self.reply(204)
        if name == 'savora_pub_publish':
            rq = str(a.get('p_request_id') or '').lower()
            if not UUID_RE.match(rq): raise LibError('Ungültige Anfrage.')
            if (me, rq) in PUB_REQUESTS: return ok(PUB_REQUESTS[(me, rq)])   # Wiederholung: gleiche Antwort, keine Dublette
            if me in BANS: raise LibError('Du kannst derzeit keine Rezepte veröffentlichen.')
            if me not in PUB_PROFILES: raise LibError('Lege zuerst ein öffentliches Profil an.')
            if a.get('p_terms_accepted') is not True or a.get('p_terms_version') not in TERMS: raise LibError('Bitte bestätige, dass du die Rechte am Rezept und an den Bildern hast.')
            rec = lib_clean(a.get('p_recipe'))
            pid = a.get('p_publication_id')
            src_local = str(a.get('p_source_local_id') or '')[:100]
            if pid is not None:
                pid = str(pid).lower()
                if not UUID_RE.match(pid): raise LibError('Ungültige Veröffentlichung.')
            existing = PUBS.get(pid) if pid else None
            if existing and existing['owner'] != me: raise LibError('Diese Veröffentlichung gibt es nicht.')
            if existing and existing['status'] == 'blocked': raise LibError('Diese Veröffentlichung wurde gesperrt und kann nicht erneut veröffentlicht werden.')
            if existing and a.get('p_expected_version') != existing['version']:
                raise LibError('KONFLIKT: Diese Veröffentlichung wurde inzwischen geändert. Lade sie neu und prüfe die Änderungen.')
            if not existing and src_local and any(p['owner'] == me and p['source_local_id'] == src_local and p['status'] == 'blocked' for p in PUBS.values()):
                raise LibError('Diese Veröffentlichung wurde gesperrt und kann nicht erneut veröffentlicht werden.')
            pid = pid or str(uuid.uuid4())
            img, th = a.get('p_image_path') or None, a.get('p_thumb_path') or None
            for path in (img, th):
                if path is not None and not (_pub_path_ok(me, pid, path) and path in PUB_OBJECTS): raise LibError('Das Bild wurde nicht gefunden. Bitte versuche es nochmals.')
            if _count_today(me, 'publish') >= LIMITS['publish_per_day']: raise LibError('Du hast heute schon viele Rezepte veröffentlicht. Bitte versuche es morgen wieder.')
            t = now_ts()
            row = existing or {'id': pid, 'owner': me, 'version': 0, 'created_at': t, 'withdrawn_at': None, 'blocked_at': None, 'source_local_id': src_local, 'request_id': rq}
            row.update({'status': 'published', 'version': row['version'] + 1, 'recipe': rec, 'title': rec['title'],
                        'search_text': lib_norm(rec['title'] + ' ' + ' '.join(i['name'] for i in rec['ingredients'] if not i['isGroupHeader'])),
                        'total_minutes': rec['timeMinutes'], 'diet': rec['diet'], 'categories': rec['categories'],
                        'image_path': img, 'thumb_path': th, 'terms_version': a.get('p_terms_version'), 'terms_accepted_at': t,
                        'updated_at': t, 'published_at': row.get('published_at') or t, 'withdrawn_at': None})
            if src_local: row['source_local_id'] = src_local
            PUBS[pid] = row
            PUB_VERSIONS[(pid, row['version'])] = {'recipe': rec, 'image_path': img, 'thumb_path': th, 'request_id': rq, 'created_at': t}
            TERMS_ACCEPT.append({'user_id': me, 'version': a.get('p_terms_version'), 'publication_id': pid, 'accepted_at': t})
            LIB_EVENTS.append((me, 'publish', time.time()))
            res = {'id': pid, 'version': row['version'], 'status': 'published'}
            PUB_REQUESTS[(me, rq)] = res
            return ok(res)
        if name == 'savora_pub_withdraw':
            p = PUBS.get(str(a.get('p_id') or ''))
            if not p or p['owner'] != me: raise LibError('Diese Veröffentlichung gibt es nicht.')
            if p['status'] == 'blocked': raise LibError('Diese Veröffentlichung wurde gesperrt.')
            if p['status'] != 'withdrawn':
                t = now_ts(); p.update(status='withdrawn', withdrawn_at=t, updated_at=t)
            return ok({'id': p['id'], 'status': 'withdrawn'})
        if name == 'savora_pub_mine':
            rows = [{'id': p['id'], 'status': p['status'], 'version': p['version'], 'title': p['title'], 'thumb_path': p['thumb_path'],
                     'source_local_id': p['source_local_id'], 'published_at': p['published_at'], 'updated_at': p['updated_at'],
                     'withdrawn_at': p['withdrawn_at'], 'blocked': p['status'] == 'blocked'} for p in PUBS.values() if p['owner'] == me]
            return ok(sorted(rows, key=lambda r: r['updated_at'], reverse=True))
        if name == 'savora_mod_is':
            return ok(me in MODERATORS)
        if name.startswith('savora_mod_'):
            if me not in MODERATORS: raise LibError('Keine Berechtigung.')
            note = str(a.get('p_note') or '').strip()[:500]
            if name == 'savora_mod_get':   # wie savora_lib_get, auch fuer gesperrte/zurueckgezogene, plus status
                p = PUBS.get(str(a.get('p_id') or ''))
                if not p: return ok(None)
                pr = PUB_PROFILES.get(p['owner']) or {'public_id': None, 'display_name': '', 'bio': '', 'avatar_path': None}
                return ok({'id': p['id'], 'version': p['version'], 'recipe': p['recipe'], 'status': p['status'],
                           'author': {'public_id': pr['public_id'], 'display_name': pr['display_name'], 'bio': pr['bio'], 'avatar_path': pr['avatar_path']},
                           'image_path': p['image_path'], 'thumb_path': p['thumb_path'], 'published_at': p['published_at'], 'updated_at': p['updated_at']})
            if name == 'savora_mod_reports':
                stt = a.get('p_status') if a.get('p_status') in ('open', 'closed') else 'open'
                out = []
                for r in sorted(REPORTS.values(), key=lambda r: r['created_at'], reverse=True):
                    if r['status'] != stt: continue
                    p = PUBS.get(r['publication_id']); pr = PUB_PROFILES.get(p['owner']) if p else None
                    out.append({'report_id': r['id'], 'publication_id': r['publication_id'], 'reason': r['reason'], 'comment': r['comment'], 'created_at': r['created_at'],
                                'status': r['status'], 'pub_title': p['title'] if p else None, 'pub_status': p['status'] if p else None,
                                'author_public_id': pr['public_id'] if pr else None, 'author_name': pr['display_name'] if pr else None,
                                'open_reports': sum(1 for x in REPORTS.values() if x['publication_id'] == r['publication_id'] and x['status'] == 'open')})
                return ok(out)
            if name == 'savora_mod_action':
                p = PUBS.get(str(a.get('p_publication_id') or ''))
                if not p: raise LibError('Diese Veröffentlichung gibt es nicht.')
                act = a.get('p_action'); t = now_ts()
                if act == 'hide': p.update(status='blocked', blocked_at=t, updated_at=t)
                elif act == 'restore':
                    if p['status'] == 'blocked': p.update(status='published', blocked_at=None, updated_at=t)
                else: raise LibError('Unbekannte Aktion.')
                MOD_LOG.append({'moderator': me, 'action': act, 'publication_id': p['id'], 'target_user': p['owner'], 'note': note, 'created_at': t})
                return ok({'status': p['status']})
            if name == 'savora_mod_close_report':
                r = REPORTS.get(str(a.get('p_report_id') or ''))
                if not r: raise LibError('Diese Meldung gibt es nicht.')
                t = now_ts(); r.update(status='closed', closed_at=t, closed_by=me)
                MOD_LOG.append({'moderator': me, 'action': 'close_report', 'publication_id': r['publication_id'], 'target_user': None, 'note': note, 'created_at': t})
                return ok({'ok': True})
            if name == 'savora_mod_ban':
                p = PUBS.get(str(a.get('p_publication_id') or ''))
                if not p: raise LibError('Diese Veröffentlichung gibt es nicht.')
                t = now_ts()
                if a.get('p_banned') is True: BANS[p['owner']] = {'reason': note, 'created_at': t, 'created_by': me}
                else: BANS.pop(p['owner'], None)
                MOD_LOG.append({'moderator': me, 'action': 'ban' if a.get('p_banned') is True else 'unban', 'publication_id': p['id'], 'target_user': p['owner'], 'note': note, 'created_at': t})
                return ok({'banned': p['owner'] in BANS})
        return self.reply(404, {'message': 'unbekannte Funktion ' + name})
    except LibError as e:
        return err(str(e))

def _lib_sign_batch(self, uid, b):
    paths = b.get('paths') if isinstance(b, dict) else None
    if not isinstance(paths, list): return self.reply(400, {'statusCode': '400', 'error': 'Bad Request', 'message': 'paths fehlt'})
    exp = b.get('expiresIn') if isinstance(b.get('expiresIn'), int) else 3600
    out = []
    for path in paths:
        path = str(path)
        if _readable(uid, path):
            tok = _secrets.token_hex(16); SIGNED[tok] = (path, time.time() + exp)
            out.append({'path': path, 'signedURL': f'/object/sign/{PUB_BUCKET}/{path}?token={tok}', 'error': None})
        else:
            out.append({'path': path, 'signedURL': None, 'error': 'Either the object does not exist or you do not have access to it'})
    return self.reply(200, out)

def _lib_signed_get(self):
    u = urlparse(self.path)
    path = unquote(u.path[len('/storage/v1/object/sign/' + PUB_BUCKET + '/'):])
    tok = parse_qs(u.query).get('token', [''])[0]
    rec = SIGNED.get(tok)
    if not rec or rec[0] != path or rec[1] < time.time(): return self.reply(400, {'statusCode': '400', 'error': 'InvalidJWT', 'message': 'invalid signature'})
    if path not in PUB_OBJECTS: return self.reply(404, {'statusCode': '404', 'error': 'not_found', 'message': 'Object not found'})
    data, ct = PUB_OBJECTS[path][:2]
    return self.reply(200, raw=data, ctype=ct)

def _lib_storage(self, method, p, uid):
    base = '/storage/v1/object/' + PUB_BUCKET
    if method == 'POST' and p.startswith(base + '/'):
        path = unquote(p[len(base) + 1:])
        ok_path = path.startswith(uid + '/') and (_re.fullmatch(r'[^/]+/[0-9a-f-]{36}/(full|thumb)-[0-9a-f]{8,}\.(jpg|webp)', path) or _re.fullmatch(r'[^/]+/avatar-[0-9a-f]{8,}\.(jpg|webp)', path))
        if not ok_path: return self.reply(403, {'statusCode': '403', 'error': 'Unauthorized', 'message': 'new row violates row-level security policy'})
        ct = (self.headers.get('Content-Type') or '').split(';')[0].strip().lower()
        if ct not in ('image/jpeg', 'image/webp'): return self.reply(415, {'statusCode': '415', 'error': 'invalid_mime_type', 'message': f'mime type {ct} is not supported'})
        data = self.body()
        if len(data) > MAX_UPLOAD: return self.reply(413, {'statusCode': '413', 'error': 'Payload too large', 'message': 'The object exceeded the maximum allowed size'})
        if path in PUB_OBJECTS and (self.headers.get('x-upsert') or '').lower() != 'true':
            return self.reply(409, {'statusCode': '409', 'error': 'Duplicate', 'message': 'The resource already exists'})
        if _count_today(uid, 'upload') >= LIMITS['uploads_per_day']: return self.reply(400, {'code': 'P0001', 'message': 'Du hast heute schon viele Bilder hochgeladen. Bitte versuche es morgen wieder.'})
        PUB_OBJECTS[path] = (data, ct, uid, time.time())
        LIB_EVENTS.append((uid, 'upload', time.time()))
        return self.reply(200, {'Key': PUB_BUCKET + '/' + path, 'Id': str(uuid.uuid4())})
    if method == 'DELETE':
        if p == base:
            b = json.loads(self.body() or b'{}'); paths = b.get('prefixes') or []
        else:
            paths = [unquote(p[len(base) + 1:])]
        gone = []
        for path in paths:
            if path.startswith(uid + '/') and path in PUB_OBJECTS and not _referenced(path, True) \
               and not any(pr.get('avatar_path') == path for pr in PUB_PROFILES.values()):
                del PUB_OBJECTS[path]; gone.append({'name': path})
        return self.reply(200, gone)
    if method == 'GET' and p.startswith(base + '/'):   # direkter Abruf nur fuer Eigentuemer (authenticated)
        path = unquote(p[len(base) + 1:])
        if not path.startswith(uid + '/') or path not in PUB_OBJECTS: return self.reply(404, {'message': 'Object not found'})
        return self.reply(200, raw=PUB_OBJECTS[path][0], ctype=PUB_OBJECTS[path][1])
    return self.reply(404, {'message': 'not found ' + p})

H.lib_rpc = _lib_rpc
H.lib_sign_batch = _lib_sign_batch
H.lib_signed_get = _lib_signed_get
H.lib_storage = _lib_storage

# ---------- Hilfen fuer Tests ----------
TINY_JPEG = bytes.fromhex('ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffda0008010100003f00fbd3ffd9')

def make_user(email, password='geheim-123'):
    """Legt ein bestaetigtes Nachbau-Konto an und gibt die user_id zurueck (bestehendes Konto: dieselbe id)."""
    e = email.lower()
    if e not in USERS: USERS[e] = {'id': str(uuid.uuid4()), 'password': password, 'confirmed': True}
    return USERS[e]['id']

def token_for(uid):
    """Access-Token fuer direkte HTTP-Tests."""
    return issue(uid)['access_token']

def ensure_pub_profile(uid, display_name='Autorin', bio='', public_id=None):
    if uid not in PUB_PROFILES:
        t = now_ts()
        PUB_PROFILES[uid] = {'public_id': public_id or _new_public_id(), 'display_name': display_name, 'bio': bio, 'avatar_path': None, 'created_at': t, 'updated_at': t}
    return PUB_PROFILES[uid]

def put_public_object(path, data=None, ct='image/jpeg', owner=None):
    PUB_OBJECTS[path] = (data if data is not None else TINY_JPEG, ct, owner or path.split('/')[0], time.time())
    return path

def seed_publication(owner_uid, recipe, status='published', image=None, published_at=None, pub_id=None, display_name=None,
                     source_local_id='', version=1, clean=True):
    """Legt eine Publikation direkt im Nachbau an (ohne RPC, ohne Limits). image: True (Testbild) oder bytes.
    published_at: ISO-Zeit oder None (jetzt). Gibt die Publikations-ID zurueck."""
    with LOCK:
        ensure_pub_profile(owner_uid, display_name or 'Autorin')
        if display_name: PUB_PROFILES[owner_uid]['display_name'] = display_name
        rec = lib_clean(recipe) if clean else dict(recipe)
        pid = pub_id or str(uuid.uuid4())
        img = th = None
        if image:
            data = image if isinstance(image, (bytes, bytearray)) else TINY_JPEG
            hx = uuid.uuid4().hex[:12]
            img = put_public_object(f'{owner_uid}/{pid}/full-{hx}.jpg', bytes(data))
            th = put_public_object(f'{owner_uid}/{pid}/thumb-{hx}.jpg', bytes(data))
        t = published_at or now_ts()
        PUBS[pid] = {'id': pid, 'owner': owner_uid, 'status': status, 'version': version, 'recipe': rec, 'title': rec['title'],
                     'search_text': lib_norm(rec['title'] + ' ' + ' '.join(i.get('name', '') for i in rec['ingredients'] if not i.get('isGroupHeader'))),
                     'total_minutes': rec.get('timeMinutes'), 'diet': rec.get('diet') or [], 'categories': rec.get('categories') or [],
                     'image_path': img, 'thumb_path': th, 'source_local_id': source_local_id, 'request_id': str(uuid.uuid4()),
                     'terms_version': 'bibliothek-2026-10-15', 'terms_accepted_at': t, 'created_at': t, 'updated_at': t, 'published_at': t,
                     'withdrawn_at': t if status == 'withdrawn' else None, 'blocked_at': t if status == 'blocked' else None}
        PUB_VERSIONS[(pid, version)] = {'recipe': rec, 'image_path': img, 'thumb_path': th, 'request_id': PUBS[pid]['request_id'], 'created_at': t}
        return pid

def bump_publication(pid, patch):
    """Neue Version einer Publikation (wie Autor aktualisiert): patch wird ins Rezept gemischt, version +1."""
    with LOCK:
        p = PUBS[pid]; rec = lib_clean(dict(p['recipe'], **patch)); t = now_ts()
        p.update(recipe=rec, title=rec['title'], version=p['version'] + 1, updated_at=t, total_minutes=rec['timeMinutes'], diet=rec['diet'], categories=rec['categories'],
                 search_text=lib_norm(rec['title'] + ' ' + ' '.join(i['name'] for i in rec['ingredients'] if not i['isGroupHeader'])))
        PUB_VERSIONS[(pid, p['version'])] = {'recipe': rec, 'image_path': p['image_path'], 'thumb_path': p['thumb_path'], 'request_id': str(uuid.uuid4()), 'created_at': t}
        return p['version']

def make_moderator(uid):
    MODERATORS.add(uid)

def lib_reset():
    """Leert alle Bibliothek-Tabellen (zwischen Testabschnitten)."""
    with LOCK:
        for d in (PUB_PROFILES, PUBS, PUB_VERSIONS, PUB_REQUESTS, PUB_OBJECTS, SIGNED, REPORTS, BANS, LIB_FAIL): d.clear()
        MODERATORS.clear(); MOD_LOG.clear(); TERMS_ACCEPT.clear(); LIB_EVENTS.clear()
        LIMITS.update({'publish_per_day': 30, 'reports_per_day': 20, 'uploads_per_day': 80, 'page_max': 48})

def simple_recipe(title='Testrezept', minutes=20, diet=None, categories=None, ingredients=None, steps=None, **extra):
    """Kleines gueltiges oeffentliches Rezept (Vertrag §2) fuer Seeds."""
    r = {'v': 1, 'title': title, 'servings': 2, 'servingMode': 'portions', 'yieldLabel': '', 'timeMinutes': minutes,
         'prepMinutes': None, 'cookMinutes': None, 'restMinutes': None, 'difficulty': '', 'diet': diet or [], 'categories': categories or [],
         'ingredients': ingredients or [{'amount': '200', 'unit': 'g', 'name': 'Mehl', 'group': '', 'isGroupHeader': False}],
         'steps': steps or [{'text': 'Alles mischen.'}], 'tips': '', 'source': {'url': '', 'text': ''}}
    r.update(extra)
    return r


def confirm(email): USERS[email.lower()]['confirmed'] = True

if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', 8796), H).serve_forever()
