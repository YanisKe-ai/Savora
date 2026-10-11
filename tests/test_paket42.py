"""Paket 42: Breite Bildschirme (iPad, Laptop) und Handy unveraendert.
1. Handy-Bildvergleich: alle wichtigen Ansichten (Rezeptliste, Detail, Editor in fuenf Schritten, Import, Einstellungen, Leerzustaende,
   Wochenplan, Einkauf, Kochbuecher, Kochmodus) bei 375x812, 390x844 und 430x932 in Hell und Dunkel, vorher (BASIS_COMMIT) gegen nachher
   (Arbeitsstand). Erlaubt sind 0 abweichende Pixel.
2. Breite: bei 768, 820, 1024, 1180, 1280, 1440 und 1920 px nutzen Editor, Import, Detail und Einstellungen die Breite (kein schmaler Streifen),
   kein seitlicher Ueberlauf, Schritt-Reiter vollstaendig, Hintergrund deckt die ganze Hoehe, Vorschau im Editor aktualisiert sich beim Tippen ohne Fokusverlust.
Hinweis: BASIS_COMMIT ist der Stand direkt vor Paket 42. Wenn spaetere Pakete das Handy bewusst veraendern (z. B. neue Schriften, fester Kopf der Startseite),
den Basis-Commit auf den Stand vor Paket 42 plus diese Pakete anheben.
Startseite als Liste (Handy): Die Startseite und die untere Navigation (fuenf Punkte statt vier, «Mehr», Wortmarke zentriert, kein Zahnrad) haben sich auf dem Handy bewusst
geaendert. Fuer Ansichten, die diese Startseite oder die untere Navigation zeigen, wird der Pixelvergleich deshalb nicht verlangt (Allowlist PHONE_CHANGED_VIEWS, unten
dokumentiert); ihr neues Verhalten prueft test_startseite_liste.py. Alle uebrigen Ansichten (Editor, Import, Kochmodus, Leerzustand Import) bleiben Pixel fuer Pixel
unveraendert. BASIS_COMMIT zeigt auf den Audit-Stand 0.68.0 (Begruendung oben am Wert), damit nur die Aenderungen dieses Pakets sichtbar werden."""
import asyncio, hashlib, os, shutil, sys, tempfile
os.environ.setdefault('SAVORA_TEST_PORT', '8892')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
import paket42_shots as P
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

# Begruendung der Anhebung: Der Audit-Stand 0.68.0 hat das Handy gegenueber 0.67.0 bewusst veraendert (Seitentitel in der Kopfzeile duerfen auf zwei Zeilen umbrechen statt mit «...» abzuschneiden,
# Auswahlhaken, Punkt am aktiven Umschalter). Der Vergleich gegen 0.67.0 schlug deshalb schon vor der Startseite als Liste in Editor und Import an. Neue Basis ist der Stand direkt vor der
# Startseite als Liste (Audit-Stand 0.68.0); so zeigt der Vergleich genau die Aenderungen dieses Pakets (siehe PHONE_CHANGED_VIEWS).
BASIS_COMMIT = '9a083fe11ec9c13fb43e42382098df63788cee11'   # Stand 0.68.0 (Audit-Stand), direkt vor der Startseite als Liste
PHONES = [(375, 812), (390, 844), (430, 932)]
QUICK = bool(os.environ.get('SAVORA_P42_QUICK'))
# Ansichten, die auf dem Handy bewusst anders aussehen (Startseite als Liste, untere Navigation mit fuenf Punkten statt vier, zentrierte Wortmarke, kein Zahnrad).
# Das sind genau die Ansichten, in denen die untere Navigation oder die Startseite sichtbar ist (geprueft: .bottom-nav vorhanden). Editor, Import und Kochmodus nicht.
PHONE_CHANGED_VIEWS = {'home', 'home-list', 'empty-home', 'detail-long', 'detail-photo', 'detail-short', 'settings', 'settings-data', 'settings-display', 'settings-share', 'settings-help',
                       'settings-about', 'mealplan', 'shopping', 'cookbooks', 'cookbook1', 'cookbook2', 'cookbook3', 'empty-shopping', 'empty-mealplan', 'empty-cookbooks'}
def view_of(fname): return fname[:-4].split('-', 2)[2]

def same_pixels(a, b):
    ba, bb = open(a, 'rb').read(), open(b, 'rb').read()
    if hashlib.sha256(ba).digest() == hashlib.sha256(bb).digest(): return 0
    try:
        from PIL import Image, ImageChops
        ia, ib = Image.open(a).convert('RGB'), Image.open(b).convert('RGB')
        if ia.size != ib.size: return -1
        diff = ImageChops.difference(ia, ib).convert('L').point(lambda v: 255 if v else 0)
        return sum(1 for v in diff.getdata() if v)
    except ImportError:
        return -1

async def phone_compare():
    old = old_checkout(BASIS_COMMIT)
    out_old, out_new = os.path.join(OUT, 'p42-vorher'), os.path.join(OUT, 'p42-nachher')
    for d in (out_old, out_new): shutil.rmtree(d, ignore_errors=True)
    sizes = PHONES[:2] if QUICK else PHONES
    await P.capture(old, out_old, sizes, ['light', 'dark'], full=True)
    await P.capture(ROOT, out_new, sizes, ['light', 'dark'], full=True)
    await P.capture(old, out_old, [(390, 844)], ['amoled'], full=True)
    await P.capture(ROOT, out_new, [(390, 844)], ['amoled'], full=True)
    files = sorted(os.listdir(out_old))
    check('Handy: Vorher/Nachher-Bilder vollstaendig', files == sorted(os.listdir(out_new)) and len(files) >= 60, f'{len(files)} Bilder')
    bad = []
    for f in files:
        d = same_pixels(os.path.join(out_old, f), os.path.join(out_new, f))
        if d != 0: bad.append((f, d))
    # Rendering-Flackern (einzelne Pixel in seltenen Aufnahmen, auch zwischen zwei Laeufen desselben Stands): Abweichende Bilder werden bis zu dreimal
    # neu aufgenommen. Ein echter Unterschied zwischen den Staenden bleibt bei jeder Wiederholung bestehen und faellt weiter durch.
    # Allowlist zuerst abtrennen: nur die unveraenderten Ansichten muessen identisch sein (und werden bei Flackern wiederholt)
    changed = [(f, d) for f, d in bad if view_of(f) in PHONE_CHANGED_VIEWS]
    bad = [(f, d) for f, d in bad if view_of(f) not in PHONE_CHANGED_VIEWS]
    for attempt in range(3):
        if not bad: break
        again = []
        for f, d in bad:
            base = f[:-4]; wh, theme, name = base.split('-', 2); w, h = map(int, wh.split('x'))
            await P.capture(old, out_old, [(w, h)], [theme], full=True, only=[name])
            await P.capture(ROOT, out_new, [(w, h)], [theme], full=True, only=[name])
            d2 = same_pixels(os.path.join(out_old, f), os.path.join(out_new, f))
            if d2 != 0: again.append((f, d2))
        bad = again
    check('Handy: 0 abweichende Pixel in allen unveraenderten Ansichten (Editor, Import, Kochmodus, Leerzustand Import), alle Groessen und Darstellungen', not bad, f'{len(files)} Bilder verglichen, Abweichungen: {bad[:8]}')
    check('Handy: Startseite/Navigation weichen bewusst ab (Allowlist), mindestens Startseite und Einstellungen unterscheiden sich', any(view_of(f) == 'home' for f, d in changed) and any(view_of(f) == 'settings' for f, d in changed), f'{len(changed)} Bilder weichen bewusst ab')
    shutil.rmtree(old, ignore_errors=True)

JS_METRICS = """() => {
  const W = document.documentElement.clientWidth, H = innerHeight;
  const main = document.querySelector('main'); if (!main) return null;
  const nav = document.querySelector('.bottom-nav'); const navR = nav ? nav.getBoundingClientRect() : null;
  const sidebar = navR && navR.width < 400 && navR.height > H * 0.5 ? navR.width : 0;
  let l = 1e9, r = 0;
  for (const el of main.querySelectorAll('*')) { const b = el.getBoundingClientRect(); if (!b.width || !b.height) continue; if (getComputedStyle(el).position === 'fixed' || getComputedStyle(el).display === 'none') continue; l = Math.min(l, b.left); r = Math.max(r, b.right); }
  const stepper = document.querySelector('.form-stepper'); let stepClip = null;
  if (stepper) { const sr = stepper.getBoundingClientRect(); stepClip = Array.from(stepper.querySelectorAll('button')).filter(b => { const x = b.getBoundingClientRect(); return x.right > sr.right + 1 || x.left < sr.left - 1; }).length + (stepper.scrollWidth > stepper.clientWidth + 1 ? 1 : 0); }
  const hb = getComputedStyle(document.documentElement).backgroundColor, bb = getComputedStyle(document.body).backgroundColor;
  const hbi = getComputedStyle(document.documentElement).backgroundImage;
  const drop = document.querySelector('.image-drop'); const aside = document.querySelector('.form-aside');
  return { W, H, sidebar, avail: W - sidebar, content: r - l, scrollW: document.documentElement.scrollWidth, stepClip, hb, bb, hbi,
    drop: drop ? Math.round(drop.getBoundingClientRect().height) : null, asideShown: aside ? getComputedStyle(aside).display !== 'none' : null,
    helpShown: (document.querySelector('.import-help') ? getComputedStyle(document.querySelector('.import-help')).display !== 'none' : null),
    bodyH: document.documentElement.scrollHeight };
}"""
LAYOUT_VIEWS = ['edit-0', 'edit-1', 'edit-2', 'edit-3', 'edit-4', 'import', 'detail-photo', 'detail-long', 'settings', 'settings-data', 'settings-display', 'settings-share', 'empty-home', 'empty-shopping', 'home']
WIDE = [(768, 1024), (820, 1180), (1024, 768), (1180, 820), (1280, 800), (1440, 900), (1920, 1080)]

async def layout_checks():
    SITE.set_dir(ROOT)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        widths = [(768, 1024), (1024, 768), (1440, 900)] if QUICK else WIDE
        for (w, h) in widths:
            for theme in (['light'] if QUICK else ['light', 'dark']):
                ctx, page, errs, long_id = await P.new_page(b, w, h, theme, True)
                vs = dict(P.views(long_id)); vs.update(dict(P.EMPTY_VIEWS))
                for name in LAYOUT_VIEWS:
                    if name.startswith('empty-'):
                        # Leerzustaende: eigene Seite ohne Testdaten
                        ctx2, page2, _, _ = await P.new_page(b, w, h, theme, False)
                        await page2.evaluate("() => { " + vs[name] + "; render(); }"); await page2.wait_for_timeout(400)
                        m = await page2.evaluate(JS_METRICS); await ctx2.close()
                    else:
                        await page.evaluate("() => { " + vs[name] + "; render(); }"); await page.wait_for_timeout(400)
                        m = await page.evaluate(JS_METRICS)
                    key = f'[{w} {theme}] {name}'
                    if not m: check(key + ': Hauptbereich vorhanden', False); continue
                    check(key + ': kein seitlicher Ueberlauf', m['scrollW'] <= m['W'] + 1, f"{m['scrollW']} > {m['W']}")
                    narrow_ok = name.startswith('empty-') or name in ('home',)
                    if not narrow_ok:
                        check(key + ': Inhalt nutzt die Breite (mind. 60 %)', m['content'] >= 0.6 * m['avail'] or (w < 1024 and m['content'] >= 0.6 * min(m['avail'], 900)), f"{round(m['content'])} von {round(m['avail'])}")
                    check(key + ': Hintergrund gesetzt (html = body oder Seitenleisten-Verlauf)', (m['hb'] == m['bb'] and m['hb'] != 'rgba(0, 0, 0, 0)') or 'linear-gradient' in m['hbi'], f"{m['hb']} / {m['bb']}")
                    if name.startswith('edit-'):
                        check(key + ': Schritt-Reiter vollstaendig sichtbar', m['stepClip'] == 0, str(m['stepClip']))
                        check(key + ': Vorschau-Spalte ab 1024 sichtbar, darunter nicht', m['asideShown'] == (w >= 1024), str(m['asideShown']))
                    if name == 'edit-0': check(key + ': Fotofeld ist keine riesige Flaeche (hoechstens 200 px hoch)', m['drop'] is not None and m['drop'] <= 200 if w >= 768 else True, str(m['drop']))
                    if name == 'import': check(key + ': Hilfespalte ab 1024 sichtbar', m['helpShown'] == (w >= 1024), str(m['helpShown']))
                    if w >= 900 and name not in ('import',) and not name.startswith('edit-'):
                        check(key + ': Seitenleisten-Spalte deckt die ganze Hoehe (Seitenhintergrund)', 'linear-gradient' in m['hbi'], m['hbi'][:60])
                await ctx.close()
        # Vorschau im Editor aktualisiert sich beim Tippen, Fokus bleibt
        ctx, page, errs, long_id = await P.new_page(b, 1440, 900, 'light', True)
        await page.evaluate(f"() => {{ openForm(JSON.parse(JSON.stringify(state.recipes.find(r => r.id === '{long_id}')))); }}"); await page.wait_for_timeout(400)
        await page.click('#f-title'); await page.keyboard.press('End'); await page.keyboard.type(' Probe42', delay=20); await page.wait_for_timeout(200)
        t = await page.inner_text('.form-aside-title'); foc = await page.evaluate("document.activeElement && document.activeElement.id")
        check('Editor: Vorschau zeigt den getippten Titel', 'Probe42' in t, t[-30:]); check('Editor: Fokus bleibt im Titelfeld', foc == 'f-title', str(foc))
        await page.fill('#f-servings', '6'); await page.wait_for_timeout(200)
        check('Editor: Vorschau zeigt die neue Menge', '6 Portionen' in await page.inner_text('#formAsideBody'))
        check('Editor: keine Skriptfehler', not errs, str(errs[:2]))
        await ctx.close(); await b.close()

async def main():
    await layout_checks()
    await phone_compare()
    print('\n' + ('ALLE OK' if not FAIL else f'{len(FAIL)} FEHLER: ' + '; '.join(FAIL[:10])))
    sys.exit(1 if FAIL else 0)
asyncio.run(main())
