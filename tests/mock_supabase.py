"""Lokaler Nachbau der von Savora genutzten Supabase-Schnittstellen, nur fuer Tests.
Bildet nach: Anmeldung (Passwort, Refresh, Registrierung mit Bestaetigung), Datensatz-Tabelle mit
Zugriffstrennung pro Konto und der Konfliktregel des Datenbank-Triggers, privaten Bildspeicher,
Konto loeschen. Laeuft auf localhost:8796."""
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
            if not uid: return self.reply(401, {'message': 'JWT required'})
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
            if p == '/rest/v1/rpc/savora_delete_account' and method == 'POST':
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
    def do_GET(self): self.handle_any('GET')
    def do_POST(self): self.handle_any('POST')
    def do_PUT(self): self.handle_any('PUT')
    def do_DELETE(self): self.handle_any('DELETE')

def confirm(email): USERS[email.lower()]['confirmed'] = True

if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', 8796), H).serve_forever()
