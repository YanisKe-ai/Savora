"""Erzeugt die Testfotos fuer den Foto-Import (einmalig, Ergebnis ist eingecheckt).
Aufruf: .venv/bin/python tests/fixtures/bild/erzeuge.py
Ein Rezept (HTML) wird als Bildschirmfoto gerendert, daraus entstehen Varianten wie bei Handyfotos."""
import asyncio, io, os, random
from playwright.async_api import async_playwright
from PIL import Image, ImageFilter
HIER = os.path.dirname(os.path.abspath(__file__))
HTML = """<html><head><meta charset="utf-8"><style>body{margin:0;padding:36px 44px;width:720px;background:#fff;color:#111;font-family:Helvetica,Arial,sans-serif;font-size:22px;line-height:1.45}
h1{font-size:34px;margin:0 0 8px} h2{font-size:25px;margin:18px 0 6px} ul,ol{margin:0;padding-left:26px} p{margin:0 0 4px}</style></head><body>
<h1>Zürcher Geschnetzeltes</h1><p>Für 4 Personen</p>
<h2>Zutaten</h2><ul><li>600 g Kalbfleisch</li><li>1 Zwiebel</li><li>250 g Champignons</li><li>2 dl Weisswein</li><li>½ TL Salz</li><li>1 EL Butter</li></ul>
<h2>Zubereitung</h2><ol><li>Fleisch in Butter kurz anbraten, herausnehmen.</li><li>Zwiebel und Champignons andünsten, mit Weisswein ablöschen.</li><li>Rahm dazugiessen, 5 Minuten köcheln. Grüsse aus der Straße.</li></ol></body></html>"""
def jpeg(im, q, name, exif=None):
    im.convert('RGB').save(os.path.join(HIER, name), 'JPEG', quality=q, **({'exif': exif} if exif else {}))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); page = await b.new_page(viewport={'width': 810, 'height': 700}, device_scale_factor=1.5)
        await page.set_content(HTML)
        png = await page.screenshot(full_page=True)
        await b.close()
    base = Image.open(io.BytesIO(png)).convert('RGB')
    base.save(os.path.join(HIER, 'bildschirmfoto.png'), optimize=True)
    random.seed(7)
    # Handyfoto: 3 Grad gedreht, graue Ecken, Rauschen, leichte Unschaerfe, JPEG-Qualitaet 50
    g = base.convert('L').rotate(3, expand=True, fillcolor=205, resample=Image.BICUBIC).filter(ImageFilter.GaussianBlur(0.6))
    noise = Image.effect_noise(g.size, 14); g = Image.blend(g, noise, 0.12)
    jpeg(g, 50, 'handyfoto.jpg')
    # EXIF-Drehung 6: gespeichert um 90 Grad gegen den Uhrzeigersinn gedreht, Orientation=6 verlangt Drehung im Uhrzeigersinn
    ex = Image.Exif(); ex[274] = 6
    jpeg(base.rotate(90, expand=True), 70, 'exif6.jpg', exif=ex.tobytes())
    # ohne EXIF 90 Grad gedreht (Text liegt quer)
    jpeg(base.rotate(90, expand=True), 70, 'quer.jpg')
    # PNG mit Transparenz: weisse Schrift-Flaeche wird durchsichtig, Text bleibt schwarz
    rgba = base.convert('RGBA'); px = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, gg, bb, a = px[x, y]
            if r > 200: px[x, y] = (0, 0, 0, 0)
    rgba.save(os.path.join(HIER, 'transparent.png'), optimize=True)
    # sehr kleines Bild und leeres Foto
    base.resize((90, int(90 * base.height / base.width))).save(os.path.join(HIER, 'winzig.png'), optimize=True)
    Image.new('RGB', (800, 600), (235, 230, 220)).filter(ImageFilter.GaussianBlur(1)).save(os.path.join(HIER, 'leer.jpg'), quality=60)
    open(os.path.join(HIER, 'kein-bild.txt'), 'w').write('Das ist ein Text und kein Bild.\n')
asyncio.run(main())
