"""Erzeugt die Test-PDFs fuer den PDF-Import (einmalig, Ergebnis ist eingecheckt).
Aufruf: .venv/bin/python tests/fixtures/pdf/erzeuge.py
Chromium druckt HTML als PDF, wie «Drucken > Als PDF sichern» auf dem Handy oder Laptop."""
import asyncio, os
from playwright.async_api import async_playwright
HIER = os.path.dirname(os.path.abspath(__file__))
CSS = """body{font-family:Helvetica,Arial,sans-serif;font-size:11pt;line-height:1.35;margin:0}
h1{font-size:20pt;margin:0 0 6pt} h2{font-size:13pt;margin:12pt 0 4pt} ul,ol{margin:0;padding-left:16pt}
.meta{color:#555;margin:0 0 8pt} .cols{display:flex;gap:28pt} .cols .l{width:34%} .cols .r{flex:1}
.page{break-after:page} .page:last-child{break-after:auto} p.lang{text-align:justify;hyphens:manual}"""
EINFACH = """<h1>Zürcher Geschnetzeltes</h1><p class="meta">Für 4 Personen · Zubereitung: 25 Minuten</p>
<h2>Zutaten</h2><ul><li>600 g Kalbfleisch, in Streifen</li><li>1 Zwiebel, fein gehackt</li><li>250 g Champignons</li>
<li>2 dl Weisswein</li><li>2,5 dl Rahm</li><li>½ TL Salz</li><li>1 Prise Pfeffer</li><li>1 EL Butter</li></ul>
<h2>Zubereitung</h2><ol><li>Fleisch portionenweise in Butter kurz anbraten, herausnehmen.</li>
<li>Zwiebel und Champignons andünsten, mit Weisswein ablöschen und auf die Hälfte einkochen.</li>
<li>Rahm dazugiessen, 5 Minuten köcheln. Fleisch beigeben, nur noch erhitzen und würzen.</li></ol>
<h2>Tipp</h2><p>Dazu passt Rösti. Grüsse aus der Küche, ß-Test: Strasse/Straße.</p>"""
ZWEISPALTIG = """<h1>Aprikosenwähe</h1><p class="meta">Ergibt 1 Blech (12 Stück) · Backen: 35 Minuten</p>
<div class="cols"><div class="l"><h2>Zutaten</h2><p><b>Teig</b></p><ul><li>250 g Mehl</li><li>125 g Butter, kalt</li><li>½ TL Salz</li><li>1 dl Wasser</li></ul>
<p><b>Belag</b></p><ul><li>3 EL gemahlene Haselnüsse</li><li>1 kg Aprikosen, halbiert</li><li>2 Eier</li><li>2 dl Milch</li><li>3 EL Zucker</li></ul></div>
<div class="r"><h2>Zubereitung</h2><ol><li>Mehl, Salz und Butter zu einer krümeligen Masse verreiben. Wasser dazugeben, rasch zu einem Teig zusammenfügen und 30 Minuten kühl stellen.</li>
<li>Teig auswallen und in das vorbereitete Blech legen. Boden mit einer Gabel einstechen und mit den Haselnüssen bestreuen.</li>
<li>Aprikosen mit der Schnittfläche nach oben dicht auf den Teig legen.</li>
<li>Eier, Milch und Zucker verrühren, darübergiessen. Im auf 220 °C vorgeheizten Ofen 35 Minuten backen.</li></ol></div></div>"""
MEHRSEITIG = """<div class="page"><h1>Linsensuppe</h1><p class="meta">Für 4 Personen</p><h2>Zutaten</h2><ul><li>200 g rote Linsen</li><li>1 Karotte</li><li>1 l Gemüsebouillon</li></ul>
<h2>Zubereitung</h2><ol><li>Karotte würfeln und andünsten.</li><li>Linsen und Bouillon beigeben, 20 Minuten kochen.</li></ol></div>
<div class="page"><h1>Birchermüesli</h1><p class="meta">Für 2 Personen</p><h2>Zutaten</h2><ul><li>80 g Haferflocken</li><li>1 Apfel</li><li>1,8 dl Milch</li><li>1 EL Honig</li></ul>
<h2>Zubereitung</h2><ol><li>Haferflocken mit Milch über Nacht einweichen.</li><li>Apfel reiben, mit Honig untermischen.</li></ol></div>
<div class="page"><h1>Älplermagronen</h1><p class="meta">Für 4 Personen</p><h2>Zutaten</h2><ul><li>300 g Hörnli</li><li>300 g Kartoffeln</li><li>2 dl Rahm</li><li>150 g Bergkäse, gerieben</li><li>2 Zwiebeln</li></ul>
<h2>Zubereitung</h2><ol><li>Kartoffeln würfeln und mit den Hörnli in Salzwasser weich kochen.</li><li>Abgiessen, Rahm und Käse untermischen.</li>
<li>Zwiebeln in Ringe schneiden, goldbraun rösten und darüber verteilen. Mit Apfelmus servieren.</li></ol></div>"""
LANG = """<h1>Brot mit Sauerteig</h1><p class="meta">Ergibt 1 Brot · Ruhezeit: 12 Stunden</p><h2>Zutaten</h2><ul><li>500 g Ruchmehl</li><li>100 g Sauerteig</li><li>3,5 dl Wasser</li><li>10 g Salz</li></ul>
<h2>Zubereitung</h2>""" + ''.join(f"""<p class="lang">{i}. Den Teig sorg&shy;fältig falten und an&shy;schliessend zuge&shy;deckt bei Raum&shy;temperatur ruhen lassen, bis er sich deutlich ver&shy;grössert hat und kleine Blasen an der Ober&shy;fläche zeigt. Danach weiter&shy;arbeiten.</p>""" for i in range(1, 15))

async def pdf(page, name, body, header=False):
    await page.set_content(f'<html lang="de-CH"><head><meta charset="utf-8"><title>{name}</title><style>{CSS}</style></head><body>{body}</body></html>')
    opts = dict(path=os.path.join(HIER, name), format='A4', margin={'top': '18mm', 'bottom': '18mm', 'left': '16mm', 'right': '16mm'})
    if header:   # wie «Drucken > Als PDF» im Browser: Datum, Titel, Adresse und Seitenzahl am Rand
        opts.update(display_header_footer=True,
            header_template='<div style="font-size:8px;width:100%;padding:0 10mm;display:flex;justify-content:space-between"><span>31.10.26, 11:30</span><span>Brot mit Sauerteig | Rezept</span></div>',
            footer_template='<div style="font-size:8px;width:100%;padding:0 10mm;display:flex;justify-content:space-between"><span>https://www.example.ch/rezepte/brot-mit-sauerteig</span><span><span class="pageNumber"></span>/<span class="totalPages"></span></span></div>')
    await page.pdf(**opts)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); page = await b.new_page()
        await pdf(page, 'einfach.pdf', EINFACH)
        await pdf(page, 'zweispaltig.pdf', ZWEISPALTIG)
        await pdf(page, 'mehrseitig.pdf', MEHRSEITIG)
        await pdf(page, 'browserdruck.pdf', LANG, header=True)
        # «Eingescannt»: nur ein Bild der Seite, kein Text
        await page.set_viewport_size({'width': 794, 'height': 1123})
        await page.set_content(f'<html><head><meta charset="utf-8"><style>{CSS} body{{padding:40px;background:#fff}}</style></head><body>{EINFACH}</body></html>')
        png = await page.screenshot(type='jpeg', quality=70)
        import base64
        await page.set_content(f'<html><body style="margin:0"><img style="width:100%" src="data:image/jpeg;base64,{base64.b64encode(png).decode()}"></body></html>')
        await page.pdf(path=os.path.join(HIER, 'gescannt.pdf'), format='A4', print_background=True, margin={'top': '0', 'bottom': '0', 'left': '0', 'right': '0'})
        await b.close()
asyncio.run(main())
