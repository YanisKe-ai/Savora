"""v89 F: Profilbild-Vorlagen im oeffentlichen Profil (Browser gegen den Nachbau tests/mock_supabase.py).
Prueft: Galerie mit 12 Vorlagen (Namen, Bildattribute, 4 je Zeile auf dem Handy, Tippflaechen), Tastatur in der Radiogruppe,
Speichern als «preset:NN» ohne Speicher-Anfrage, Anzeige auf der Profilseite mit lokalem Bild, Hochladen eines eigenen Bildes
weiterhin moeglich, Wechsel eigenes Bild -> Vorlage, Entfernen, unbekannte Vorlage -> Buchstabe, ungueltige Vorlage abgelehnt
(Nachbau und SQL-Regex in supabase/paket49-profilbilder.sql statisch).
Optional: SAVORA_V89F_SHOTS=<ordner> legt Screenshots 375x667 und 390x844 hell/dunkel ab."""
import io, os, re
os.environ.setdefault('SAVORA_TEST_PORT', '48500')
os.environ.setdefault('SAVORA_MOCK_PORT', '48501')
from bibliothek_helfer import *   # noqa: F401,F403

NAMES = ['Pasta-Pose', 'Monsieur Croissant', 'Espresso', 'Nase für Geschmack', 'Olivenkennerin', 'Hände fürs Handwerk',
         'Küchenkritik', 'Pfeffermühle', 'Das letzte Wort', 'Geschmacksexplosion', 'Oktopus-Dirigent', 'Pilz-Punk']
FILES = ['01-pasta-pose', '02-monsieur-croissant', '03-espresso', '04-nase-fuer-geschmack', '05-olivenkennerin', '06-haende-fuers-handwerk',
         '07-kuechenkritik', '08-pfeffermuehle', '09-das-letzte-wort', '10-geschmacksexplosion', '11-oktopus-dirigent', '12-pilz-punk']
SHOT_DIR = os.environ.get('SAVORA_V89F_SHOTS', '')


def sql_checks():
    sql = open(os.path.join(ROOT, 'supabase', 'paket49-profilbilder.sql'), encoding='utf-8').read()
    old = open(os.path.join(ROOT, 'supabase', 'paket45-bibliothek.sql'), encoding='utf-8').read()
    m = re.search(r"a !~ '(\^preset:[^']+)'", sql)
    check('SQL: Vorlagen-Pruefung vorhanden', bool(m), sql[:200])
    if m:
        rx = re.compile(m.group(1))
        good = [f'preset:{i:02d}' for i in range(1, 13)]
        bad = ['preset:00', 'preset:13', 'preset:99', 'preset:1', 'preset:01x', 'preset:01/../x', ' preset:01', 'PRESET:01', 'preset:']
        check('SQL-Regex: preset:01 bis preset:12 erlaubt', all(rx.search(x) for x in good))
        check('SQL-Regex: preset:99 und Varianten abgelehnt', not any(rx.search(x) for x in bad), [x for x in bad if rx.search(x)])
    # Bestehende Logik unveraendert: Funktionskoerper aus Paket 45 bis auf die eine Pruefzeile gleich
    def body(s):
        i = s.index('create or replace function public.savora_pub_profile_set'); return s[i:s.index('end $$;', i)]
    a, b = body(old).splitlines(), body(sql).splitlines()
    diff = [(x, y) for x, y in zip(a, b) if x != y]
    check('SQL: Funktion wie Paket 45, nur die Profilbild-Bedingung ergaenzt', len(a) == len(b) and len(diff) == 1 and 'preset:' in diff[0][1], diff)
    check('SQL: Datei-Pruefungen (eigener Ordner, storage.objects) bleiben', "'/avatar-[0-9a-f]{8,32}\\.(jpg|webp)$'" in sql and 'storage.objects' in sql)
    check('SQL: nur additiv (kein drop/delete/alter)', not re.search(r'\b(drop|delete|alter|truncate)\b', re.sub(r'--.*', '', sql), re.I))


def jpeg_bytes():
    try:
        from PIL import Image
        buf = io.BytesIO(); Image.new('RGB', (300, 300), (200, 120, 60)).save(buf, 'JPEG'); return buf.getvalue()
    except Exception:
        return None


async def open_form(page):
    await goto_view(page, 'lib-pubprofile')
    await page.wait_for_selector('#lpProfName', timeout=ui_wait(8000))


async def wait_saved(page, n0):
    await wait_js(page, "(n) => typeof libPub !== 'undefined' && (!libPub.form || !libPub.form.saving) && document.querySelector('#lpProfName') && true", 8000, arg=n0)
    for _ in range(80):
        if len(rpc_calls('savora_pub_profile_set')) > n0 and not await ev(page, "!!(libPub.form && libPub.form.saving)"): return
        await asyncio.sleep(0.05)


async def save(page):
    n0 = len(rpc_calls('savora_pub_profile_set'))
    await page.locator('[data-action="lib-prof-save"]').click()
    await wait_saved(page, n0)


async def shots(p, A):
    if not SHOT_DIR: return
    os.makedirs(SHOT_DIR, exist_ok=True)
    M.PUB_PROFILES[A]['avatar_path'] = 'preset:08'
    for (w, h) in ((375, 667), (390, 844)):
        for scheme in ('light', 'dark'):
            browser, ctx, page = await open_app(p, w, h, scheme=scheme)
            await login(page, 'galerie@example.test')
            await open_form(page)
            await page.wait_for_selector('.lp-preset-input', timeout=6000)
            await ev(page, "() => { const g = document.querySelector('.lp-presets') || document.querySelector('.lp-avatar-row'); g.scrollIntoView({ block: 'center' }); }")
            await ev(page, "() => Promise.all([...document.querySelectorAll('.lp-preset-img')].map(i => i.decode().catch(() => 0)))")
            await clear_toasts(page)
            await page.screenshot(path=os.path.join(SHOT_DIR, f'galerie-{w}x{h}-{scheme}.png'))
            pid = M.PUB_PROFILES[A]['public_id']
            await ev(page, "(id) => libOpenProfile(id)", pid); await wait_js(page, "lib.profile.status === 'ready'")
            await page.wait_for_function("() => { const i = document.querySelector('.lib-avatar img'); return !i || i.complete; }", timeout=5000)
            await page.screenshot(path=os.path.join(SHOT_DIR, f'profilseite-{w}x{h}-{scheme}.png'))
            await browser.close()


async def main():
    t0 = time.time()
    sql_checks()
    A = M.make_user('galerie@example.test')
    async with async_playwright() as p:
        browser, ctx, page = await open_app(p, 375, 667)
        storage_reqs = []
        ctx.on('request', lambda r: storage_reqs.append(r.url) if '/storage/v1/' in r.url else None)
        await login(page, 'galerie@example.test')

        async with section('Galerie: 12 Vorlagen, sofort sichtbar ohne Bild'):
            await open_form(page)
            await page.wait_for_selector('.lp-preset-input', timeout=ui_wait(6000))
            info = await ev(page, """() => [...document.querySelectorAll('.lp-preset')].map(l => { const i = l.querySelector('input'), im = l.querySelector('img'), r = l.getBoundingClientRect();
                return { v: i.value, type: i.type, name: i.name, aria: i.getAttribute('aria-label'), title: l.title, checked: i.checked, src: im.getAttribute('src'),
                         w: im.getAttribute('width'), h: im.getAttribute('height'), lazy: im.getAttribute('loading'), dec: im.getAttribute('decoding'), alt: im.getAttribute('alt'),
                         top: Math.round(r.top + scrollY), bw: r.width, bh: r.height }; })""")
            check('Galerie zeigt 12 Vorlagen', len(info) == 12, len(info))
            check('Namen als aria-label und Tooltip', [x['aria'] for x in info] == NAMES and [x['title'] for x in info] == NAMES, [x['aria'] for x in info])
            check('Lokale Bilder assets/profilbilder/*.webp', [x['src'] for x in info] == [f'assets/profilbilder/{f}.webp' for f in FILES], [x['src'] for x in info][:3])
            check('Bilder mit width/height, lazy, async, alt leer', all(x['w'] and x['h'] and x['lazy'] == 'lazy' and x['dec'] == 'async' and x['alt'] == '' for x in info))
            check('Radiogruppe (native Radios, ein Name, Legende)', all(x['type'] == 'radio' and x['name'] == 'lpPreset' for x in info)
                  and await ev(page, "document.querySelector('.lp-presets legend').textContent.trim()") == 'Vorlage wählen')
            check('Ohne Bild: keine Vorlage vorausgewaehlt', not any(x['checked'] for x in info))
            tops = [x['top'] for x in info]
            check('Handy 375 px: 4 Vorlagen je Zeile', len(set(tops[:4])) == 1 and tops[4] > tops[0] and len(set(tops)) == 3, tops)
            check('Tippflaechen mindestens 44 px', all(x['bw'] >= 44 and x['bh'] >= 44 for x in info), [round(x['bw']) for x in info][:4])
            check('Eigenes Bild hochladen bleibt', await has_text(page, 'Eigenes Bild hochladen'))
            ok = await ev(page, "() => Promise.all([...document.querySelectorAll('.lp-preset-img')].map(i => { i.loading = 'eager'; return i.decode().then(() => i.naturalWidth, () => 0); }))")
            check('Alle 12 Bilder laden (384 px)', ok == [384] * 12, ok)
            check('Keine Speicher-Anfrage fuer Vorlagen', not [u for u in storage_reqs if 'preset' in u], storage_reqs[:3])

        async with section('Tastatur und Auswahl'):
            await page.locator('.lp-preset-input').first.focus()
            await page.keyboard.press('ArrowRight')
            await wait_js(page, "document.activeElement && document.activeElement.value === '02' && document.activeElement.checked", 4000)
            check('Pfeiltaste waehlt naechste Vorlage, Fokus bleibt in der Gruppe', True)
            await page.locator('.lp-preset[title="Pfeffermühle"]').click()
            await wait_js(page, "libPub.form && libPub.form.preset === '08'", 4000)
            st = await ev(page, """() => ({ checked: [...document.querySelectorAll('.lp-preset-input:checked')].map(i => i.value),
                prev: (document.querySelector('#lpProfPreview img') || {}).src || '', hint: document.querySelector('.lp-preset-hint').textContent,
                ring: getComputedStyle(document.querySelector('.lp-preset-input:checked').closest('.lp-preset').querySelector('.lp-preset-img')).boxShadow,
                tick: getComputedStyle(document.querySelector('.lp-preset-input:checked').closest('.lp-preset').querySelector('.lp-preset-check')).display })""")
            check('Genau eine Vorlage gewaehlt (08)', st['checked'] == ['08'], st)
            check('Vorschau oben zeigt die Vorlage sofort', st['prev'].endswith('assets/profilbilder/08-pfeffermuehle.webp'), st['prev'])
            check('Auswahl deutlich: Ring und Haekchen', st['ring'] != 'none' and st['tick'] != 'none', st)
            check('Gewaehlter Name sichtbar', 'Pfeffermühle' in st['hint'], st['hint'])

        async with section('Speichern als preset:NN'):
            await page.fill('#lpProfName', 'Gala Galerie')
            n_up = len([u for u in storage_reqs if '/object/savora-public/' in u])
            await save(page)
            check('Server speichert avatar_path = preset:08', M.PUB_PROFILES.get(A, {}).get('avatar_path') == 'preset:08', M.PUB_PROFILES.get(A))
            check('Kein Hochladen fuer eine Vorlage', len([u for u in storage_reqs if '/object/savora-public/' in u]) == n_up)
            await page.wait_for_selector('.lp-preset-input:checked', timeout=4000)
            check('Nach dem Speichern bleibt die Vorlage gewaehlt', await ev(page, "document.querySelector('.lp-preset-input:checked').value") == '08')

        async with section('Profilseite zeigt das lokale Bild'):
            pid = M.PUB_PROFILES[A]['public_id']
            M.seed_publication(A, M.simple_recipe('Galerie-Suppe'))
            await ev(page, "(id) => libOpenProfile(id)", pid); await wait_js(page, "lib.profile.status === 'ready'")
            await page.wait_for_selector('.lib-avatar img', timeout=5000)
            src = await ev(page, "document.querySelector('.lib-avatar img').getAttribute('src')")
            check('Profilseite: lokales Vorlagenbild', src == 'assets/profilbilder/08-pfeffermuehle.webp', src)
            nw = await ev(page, "() => { const i = document.querySelector('.lib-avatar img'); return i.decode().then(() => i.naturalWidth, () => 0); }")
            check('Profilseite: Bild geladen', nw == 384, nw)
            check('Profilseite: kein Signieren fuer preset', not [u for u in storage_reqs if 'preset' in u], storage_reqs[-3:])

        async with section('Eigenes Bild hochladen funktioniert weiter, dann Wechsel auf Vorlage'):
            data = jpeg_bytes()
            await open_form(page)
            if data:
                await page.locator('[data-lp-avatar]').set_input_files(files=[{'name': 'ich.jpg', 'mimeType': 'image/jpeg', 'buffer': data}])
                await wait_js(page, "libPub.form && !!libPub.form.avatarUrl", 8000)
                check('Eigenes Bild: Vorlagen-Auswahl aufgehoben', await ev(page, "!document.querySelector('.lp-preset-input:checked') && !libPub.form.preset"))
                await save(page)
                av = M.PUB_PROFILES[A]['avatar_path'] or ''
                check('Eigenes Bild gespeichert (Datei im Speicher)', re.fullmatch(re.escape(A) + r'/avatar-[0-9a-f]{8,32}\.(jpg|webp)', av) is not None and av in M.PUB_OBJECTS, av)
                await page.wait_for_selector('[data-action="lib-prof-presets"]', timeout=4000)
                check('Mit eigenem Bild: Galerie hinter «Stattdessen eine Vorlage wählen»', await ev(page, "!document.querySelector('.lp-preset-input')"))
                await page.locator('[data-action="lib-prof-presets"]').click()
                await page.wait_for_selector('.lp-preset-input', timeout=4000)
                await page.locator('.lp-preset[title="Espresso"]').click()
                await wait_js(page, "libPub.form && libPub.form.preset === '03'", 4000)
                await save(page)
                check('Wechsel eigenes Bild -> Vorlage: preset:03 gespeichert', M.PUB_PROFILES[A]['avatar_path'] == 'preset:03', M.PUB_PROFILES[A]['avatar_path'])
                check('Alte Datei wird nicht mehr verwendet (wie beim Entfernen)', not M._in_use(av) if hasattr(M, '_in_use') else not any(pr.get('avatar_path') == av for pr in M.PUB_PROFILES.values()))
            else:
                check('PIL fuer Testbild vorhanden', False, 'kein PIL')

        async with section('Bild entfernen'):
            await open_form(page)
            await page.locator('[data-action="lib-prof-avatar-remove"]').click()
            await wait_js(page, "libPub.form && libPub.form.removeAvatar && !libPub.form.preset", 4000)
            check('Nach Entfernen: keine Vorlage gewaehlt', await ev(page, "!document.querySelector('.lp-preset-input:checked')"))
            await save(page)
            check('Entfernen speichert null', M.PUB_PROFILES[A]['avatar_path'] is None, M.PUB_PROFILES[A]['avatar_path'])

        async with section('Unbekannte und ungueltige Vorlage'):
            M.PUB_PROFILES[A]['avatar_path'] = 'preset:99'
            n_sign = len([u for u in storage_reqs if '/sign/' in u])
            await ev(page, "(id) => libOpenProfile(id)", M.PUB_PROFILES[A]['public_id']); await wait_js(page, "lib.profile.status === 'ready'")
            await page.wait_for_selector('.lib-avatar-initial', timeout=4000)
            check('Unbekannte Vorlage: Buchstaben-Platzhalter, kein Bild', await ev(page, "!document.querySelector('.lib-avatar img') && document.querySelector('.lib-avatar-initial').textContent.trim() === 'G'"))
            check('Unbekannte Vorlage: keine Signier-Anfrage', len([u for u in storage_reqs if '/sign/' in u]) == n_sign)
            check('libImgSrc: preset:99 leer, preset:12 lokal', await ev(page, "[libImgSrc('preset:99'), libImgSrc('preset:12')]") == ['', 'assets/profilbilder/12-pilz-punk.webp'])
            r = await ev(page, "() => libApi('savora_pub_profile_set', { p_name: 'Gala', p_bio: '', p_avatar_path: 'preset:99' }).then(() => 'ok', e => e.message)")
            check('Server lehnt preset:99 ab', r != 'ok' and 'Profilbild' in r, r)
            r = await ev(page, "() => libSavePubProfile({ name: 'Gala', bio: '', avatarPreset: '99' }).then(p => p.avatar_path, e => e.message)")
            check('libSavePubProfile ignoriert unbekannte Vorlage (behaelt bisherigen Wert)', r == 'preset:99' or r is None or 'Profilbild' in str(r), r)
            M.PUB_PROFILES[A]['avatar_path'] = None

        check('Keine Seitenfehler', not page.errs, page.errs[:3])
        await browser.close()
        await shots(p, A)
    report(t0)

asyncio.run(main())
