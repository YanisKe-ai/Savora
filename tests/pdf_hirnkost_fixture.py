"""Testrezepte «Hirnkost» (Savora 0.87.0): die 7 Rezepte aus dem Kochbuch-PDF des Nutzers vom 21.10.2026 (18 Seiten, Stil «Prise Pop»),
aus den Seitenbildern abgeschrieben. Formen, die Fehler ausloesten, sind bewusst nachgebildet:
  - Karamellsauce: Schrittueberschrift auf eigener Zeile ohne Doppelpunkt, lange Notizen mit Zeilenumbruechen und importierten Angaben
  - Bulgogi: lange Notizen mit «Titel:»-Zeilen, Gedankenstrich ohne Abstand («–bitte»), Quelle als Markdown-Link
  - Kartoffelsalat: Quellen-URL, Gruppe «Zutaten» unter dem Kastentitel, vier Zeitangaben (Gesamt, Vorbereitung, Ruhen)
  - Sloppy Joe: «Quelle: kookmutsjes.com» am Ende des letzten Schritts (ohne Quellenfeld)
  - Carbonara: zwei Abschnittsueberschriften direkt hintereinander («Kombinieren», «Cremig vollenden»), Tipps als Schritte
Format wie tests/fixtures/pdf_rezepte.json (App-Rezept plus _img = Schluessel aus pdf_harness.testbilder(), _nutri = Naehrwerte rechnen).
HIRNKOST_BOOK hat dasselbe Format wie fixtures['books'][...] (items: [rezeptId, kapitelId], '' = ohne Kapitel -> «Weitere Rezepte»).
Benutzung mit tests/pdf_harness.py:
    from pdf_hirnkost_fixture import HIRNKOST_RECIPES, HIRNKOST_BOOK, hirnkost_session_setup
    async with PdfSession(out) as s:
        await hirnkost_session_setup(s)
        ex = await s.book('hirnkost', 'prise-pop', 'compact', datei='hirnkost')
"""

HIRNKOST_RECIPES = [{'id': 'hk_sloppy',
  'title': 'Sloppy Joe Buns',
  'servings': 9,
  'timeMinutes': 120,
  'tags': ['Hauptgang'],
  'categoryTags': ['burger'],
  'diet': [],
  'difficulty': '',
  'notes': '',
  'ingredients': [{'amount': '', 'unit': '', 'name': 'Teig:'},
                  {'amount': '250', 'unit': 'ml', 'name': 'Milch, lauwarm'},
                  {'amount': '15', 'unit': 'g', 'name': 'Honig'},
                  {'amount': '7', 'unit': 'g', 'name': 'Trockenhefe'},
                  {'amount': '1', 'unit': '', 'name': 'Ei (gross)'},
                  {'amount': '45', 'unit': 'g', 'name': 'Butter, ungesalzen'},
                  {'amount': '500', 'unit': 'g', 'name': 'Weissmehl'},
                  {'amount': '8', 'unit': 'g', 'name': 'Salz'},
                  {'amount': '', 'unit': '', 'name': 'Sloppy-Joe-Füllung:'},
                  {'amount': '25', 'unit': 'ml', 'name': 'Olivenöl'},
                  {'amount': '600', 'unit': 'g', 'name': 'Rinderhackfleisch'},
                  {'amount': '4', 'unit': 'g', 'name': 'Salz'},
                  {'amount': '3', 'unit': 'g', 'name': 'Paprikapulver'},
                  {'amount': '2', 'unit': 'g', 'name': 'Knoblauchpulver'},
                  {'amount': '3', 'unit': 'g', 'name': 'Zwiebelpulver'},
                  {'amount': '3', 'unit': 'g', 'name': 'Cayennepfeffer'},
                  {'amount': '1 1/2', 'unit': 'g', 'name': 'schwarzer Pfeffer'},
                  {'amount': '100', 'unit': 'g', 'name': 'Ketchup'},
                  {'amount': '', 'unit': '', 'name': 'Zum Füllen und Bestreichen:'},
                  {'amount': '', 'unit': '', 'name': 'Käsescheiben (Cheddar oder Schmelzkäse)'},
                  {'amount': '', 'unit': '', 'name': 'Big-Mac-Sauce'},
                  {'amount': '1', 'unit': '', 'name': 'Ei (gross), verquirlt'},
                  {'amount': '', 'unit': '', 'name': 'Sesam'}],
  'steps': [{'text': 'Lauwarme Milch, Honig und Hefe in einer grossen Schüssel verrühren und 5 Minuten stehen lassen.'},
            {'text': 'Ei und Butter dazugeben und gut vermischen. Mehl und Salz hinzufügen und den Teig 10 bis 12 Minuten glatt kneten.'},
            {'text': 'Schüssel abdecken und den Teig an einem warmen Ort 1 Stunde gehen lassen, bis er sich verdoppelt hat.'},
            {'text': 'Olivenöl in einer Pfanne bei mittlerer bis hoher Hitze erwärmen. Hackfleisch mit Salz, Paprika, Knoblauchpulver, Zwiebelpulver, '
                     'Cayennepfeffer und schwarzem Pfeffer 7 bis 8 Minuten anbraten, bis es durchgegart und gebräunt ist.'},
            {'text': 'Ketchup unterrühren, bis alles gut vermischt ist. Füllung vollständig auskühlen lassen.'},
            {'text': 'Aufgegangenen Teig zusammendrücken, in 9 gleich grosse Stücke teilen und zu Kugeln formen.'},
            {'text': 'Jede Kugel zu einem runden Fladen ausrollen.'},
            {'text': 'In die Mitte jedes Fladens eine Käsescheibe legen, dann etwas Füllung und einen Löffel Burgersauce daraufgeben. Nach Wunsch noch mehr '
                     'Käse.'},
            {'text': 'Teig nach innen einschlagen und gut zusammendrücken, damit die Brötchen dicht sind.'},
            {'text': 'Brötchen mit der Naht nach unten auf ein Blech mit Backpapier legen, mit verquirltem Ei bestreichen und mit Sesam bestreuen. 30 Minuten '
                     'gehen lassen.'},
            {'text': 'Im vorgeheizten Ofen bei 200 °C 12 bis 18 Minuten goldbraun backen.'},
            {'text': 'Quelle: kookmutsjes.com Quelle: kookmutsjes.com'}],
  '_img': 'landscape',
  '_nutri': False,
  'source': None},
 {'id': 'hk_manti',
  'title': 'Türkische Manti',
  'servings': 4,
  'timeMinutes': 30,
  'tags': ['Hauptgang'],
  'categoryTags': ['dinner'],
  'diet': [],
  'difficulty': '',
  'notes': '',
  'ingredients': [{'amount': '', 'unit': '', 'name': 'Für den Teig:'},
                  {'amount': '200', 'unit': 'g', 'name': 'Mehl (+ etwas Mehl zum Ausrollen)'},
                  {'amount': '75', 'unit': 'ml', 'name': 'Wasser'},
                  {'amount': '1/2', 'unit': 'Ei', 'name': '(Ei verquirlen und die Hälfte nehmen)'},
                  {'amount': '1/4', 'unit': 'EL', 'name': '(ca. 1 gestrichener TL) Salz'},
                  {'amount': '', 'unit': '', 'name': 'Für die Füllung:'},
                  {'amount': '150', 'unit': 'g', 'name': 'Hackfleisch (Rind)'},
                  {'amount': '1/2', 'unit': 'Zwiebel', 'name': '(fein geraspelt)'},
                  {'amount': '1/2', 'unit': 'Knoblauchzehe', 'name': '(fein geraspelt)'},
                  {'amount': '1/2', 'unit': 'Handvoll', 'name': 'glatte Petersilie (sehr fein gehackt)'},
                  {'amount': '1/2', 'unit': 'EL', 'name': 'Olivenöl'},
                  {'amount': '1/2', 'unit': 'TL', 'name': 'Paprikapulver'},
                  {'amount': '1/2', 'unit': 'TL', 'name': 'Salz'},
                  {'amount': '', 'unit': '', 'name': 'Pfeffer aus der Mühle'},
                  {'amount': '', 'unit': '', 'name': 'Für die Joghurtsauce:'},
                  {'amount': '250', 'unit': 'g', 'name': 'türkischer oder griechischer Joghurt (10 % Fett)'},
                  {'amount': '1/2', 'unit': 'Knoblauchzehe', 'name': '(fein gerieben)'},
                  {'amount': '1', 'unit': 'Prise', 'name': 'Salz'},
                  {'amount': '', 'unit': '', 'name': 'Für die rote Butter-Sauce:'},
                  {'amount': '100', 'unit': 'g', 'name': 'Butter'},
                  {'amount': '1', 'unit': 'EL', 'name': 'Paprikapulver edelsüß'},
                  {'amount': '1/2', 'unit': 'TL', 'name': 'Paprikaflocken / Pul Biber'},
                  {'amount': '1/4', 'unit': 'TL', 'name': 'Salz'},
                  {'amount': '', 'unit': '', 'name': 'Optional: 1–2 frische Minzblätter (fein gehackt)'}],
  'steps': [{'text': 'Teig zubereiten:'},
            {'text': 'Mehl, Wasser, ein halbes verquirltes Ei und Salz gründlich zu einem festen, elastischen Nudelteig verkneten. Abgedeckt mit einem '
                     'sauberen Küchentuch für 30 Minuten ruhen lassen.'},
            {'text': 'Füllung zubereiten:'},
            {'text': 'Hackfleisch, Olivenöl, geraspelte Zwiebel, geraspelten Knoblauch, fein gehackte Petersilie sowie Paprikapulver, Salz und Pfeffer in eine '
                     'Schüssel geben und gut vermengen.'},
            {'text': 'Manti formen:'},
            {'text': 'Den Teig auf einer bemehlten Arbeitsfläche so dünn wie möglich ausrollen. Mit einem Pizzaschneider oder Messer in ca. 3 × 3 cm große '
                     'Quadrate schneiden. Auf jedes Quadrat jeweils eine kleine Portion (ca. 1/4 TL) der Hackfleisch-Füllung setzen. Die vier Ecken in der '
                     'Mitte zusammenführen und fest zusammendrücken, sodass kleine Päckchen entstehen.'},
            {'text': 'Joghurtsauce:'},
            {'text': 'Joghurt, geriebenen Knoblauch und eine Prise Salz verrühren und beiseitestellen.'},
            {'text': 'Manti kochen:'},
            {'text': 'Einen großen Topf mit Wasser zum Kochen bringen und ca. 1 EL Salz dazugeben. Die Manti hineingeben und für ca. 4–5 Minuten sprudelnd '
                     'kochen lassen, bis sie an der Oberfläche schwimmen. Mit einem Schaumlöffel vorsichtig herausnehmen.'},
            {'text': 'Rote Sauce zubereiten:'},
            {'text': 'Die Butter in einer kleinen Pfanne schmelzen. Paprikapulver, Paprikaflocken und Salz einrühren, bis die Sauce leicht aufschäumt, dann '
                     'sofort vom Herd nehmen. (Wer mag, kann einen Teil mit fein gehackter Minze verfeinern).'},
            {'text': 'Anrichten:'},
            {'text': 'Joghurt auf tiefe Teller geben, die heißen Manti darauf verteilen und reichlich mit der roten Butter-Sauce beträufeln.'}],
  '_img': 'landscape',
  '_nutri': True,
  'source': None},
 {'id': 'hk_carbonara',
  'title': 'Carbonara',
  'servings': 2,
  'timeMinutes': 10,
  'tags': ['Hauptgang'],
  'categoryTags': ['pasta'],
  'diet': [],
  'difficulty': '',
  'notes': 'Tipps für das perfekte Ergebnis',
  'ingredients': [{'amount': '240', 'unit': 'g', 'name': 'Spaghetti (oder dünne lange Pasta)'},
                  {'amount': '100', 'unit': 'g', 'name': 'Pancetta oder Guanciale am Stück (alternativ Bauchspeck oder Bacon)'},
                  {'amount': '2', 'unit': '', 'name': 'Eier (Größe M)'},
                  {'amount': '40', 'unit': 'g', 'name': 'Parmesan oder Grana Padano (frisch gerieben)'},
                  {'amount': '40', 'unit': 'g', 'name': 'Pecorino Romano (frisch gerieben)'},
                  {'amount': '', 'unit': '', 'name': 'Salz (für das Nudelwasser)'},
                  {'amount': '', 'unit': '', 'name': 'Schwarzer Pfeffer aus der Mühle'}],
  'steps': [{'text': 'Speck vorbereiten:'},
            {'text': 'Den Speck in ca. 0,5–1 cm große Würfel schneiden. In einer Pfanne ohne zusätzliches Fett bei mittlerer Hitze sanft ausbraten, bis er '
                     'knusprig ist. Anschließend beiseitestellen.'},
            {'text': 'Pasta kochen:'},
            {'text': 'Die Spaghetti in reichlich kochendem Salzwasser nach Packungsangabe al dente (bissfest) kochen.'},
            {'text': 'Ei-Käse-Mischung anrühren:'},
            {'text': 'Während die Pasta kocht, die Eier in einer Schüssel mit dem geriebenen Parmesan und Pecorino verquirlen. Nach Geschmack mit schwarzem '
                     'Pfeffer aus der Mühle und eventuell einer kleinen Prise Salz würzen.'},
            {'text': 'Kombinieren:'},
            {'text': 'Cremig vollenden:'},
            {'text': 'Den Herd ausschalten und auf der noch warmen Herdplatte weiterarbeiten. Die Ei-Käse-Mischung zusammen mit etwas restlichem Nudelwasser '
                     'zur Pasta in die Pfanne geben. Alles stetig schwenken und verrühren, bis sich das Ei nicht verfestigt (nicht stockt), sondern zusammen '
                     'mit dem Käse und Nudelwasser eine samtige, cremige Sauce bildet. Bei Bedarf noch tröpfchenweise Kochwasser hinzufügen.'},
            {'text': 'Richtige Temperatur: Der Herd muss ausgeschaltet sein, wenn das Ei hinzugefügt wird. Bei zu großer Hitze gerinnt das Ei und wird zu '
                     'Rührei.'},
            {'text': 'Nudelwasser ist Gold wert: Die Stärke im Kochwasser ist der Schlüssel für die Bindung und Cremigkeit der Sauce.'}],
  '_img': 'square',
  '_nutri': True,
  'source': None},
 {'id': 'hk_cookies',
  'title': 'Cookies',
  'servings': 4,
  'timeMinutes': 15,
  'tags': ['Dessert'],
  'categoryTags': ['dessert', 'baking'],
  'diet': [],
  'difficulty': '',
  'notes': '',
  'ingredients': [{'amount': '150', 'unit': 'g', 'name': 'Butter'},
                  {'amount': '150', 'unit': 'g', 'name': 'Rohzucker'},
                  {'amount': '100', 'unit': 'g', 'name': 'Zucker'},
                  {'amount': '1', 'unit': 'Päckli', 'name': 'Vanillezucker'},
                  {'amount': '2', 'unit': '', 'name': 'Eier'},
                  {'amount': '150', 'unit': 'g', 'name': 'Mehl'},
                  {'amount': '150', 'unit': 'g', 'name': 'Halbweissmehl'},
                  {'amount': '2', 'unit': 'Prisen', 'name': 'Salz'},
                  {'amount': '1/2', 'unit': 'TL', 'name': 'Backpulver'},
                  {'amount': '1/2', 'unit': 'TL', 'name': 'Natron'},
                  {'amount': '300', 'unit': 'g', 'name': 'dunkle Schokolade oder Schokoladewürfeli'}],
  'steps': [{'text': 'Butter bräunen & Ofen vorheizen:'},
            {'text': 'Den Ofen auf 180 °C Heissluft vorheizen. Die Butter in einer Pfanne warm werden lassen und köcheln, bis sie haselnussbraun ist. '
                     'Anschliessend etwas abkühlen lassen.'},
            {'text': 'Feuchte Zutaten schaumig rühren:'},
            {'text': 'Rohzucker, Zucker, Vanillezucker und Eier in einer Schüssel mischen. Die abgekühlte Butter dazugiessen und mit den Schwingbesen des '
                     'Handrührgeräts rühren, bis die Masse heller ist.'},
            {'text': 'Teig & Schokolade zusammenfügen:'},
            {'text': 'Mehl, Halbweissmehl, Salz, Backpulver und Natron mischen, unter die Eimasse rühren und rasch zu einem weichen Teig zusammenfügen (nicht '
                     'kneten). Schokolade in kleine Würfeli schneiden und unter den Teig mischen.'},
            {'text': 'Formen & Backen:'},
            {'text': 'Den Teig mithilfe eines Glacelöffels oder 2 Esslöffeln zu ca. 20 Kugeln formen. Mit genügend Abstand auf zwei mit Backpapier belegte '
                     'Bleche verteilen.'},
            {'text': 'Auskühlen:'},
            {'text': 'Im Ofen für ca. 15 Minuten backen. Herausnehmen und die Cookies auf einem Gitter auskühlen lassen.'},
            {'text': 'Haltbarkeit: Gut verschlossen in einer Dose ca. 2 Wochen haltbar.'},
            {'text': 'Vorbereiten / Einfrieren: Die ungebackenen Teigkugeln lassen sich in einem Gefrierbeutel ca. 1 Monat tiefkühlen. Die Cookies können noch '
                     'tiefgekühlt gebacken werden – die Backzeit verlängert sich dadurch um ca. 5 Minuten.'}],
  '_img': 'portrait',
  '_nutri': True,
  'source': None},
 {'id': 'hk_bulgogi',
  'title': 'Bulgogi',
  'servings': 4,
  'timeMinutes': 30,
  'tags': [],
  'categoryTags': ['dinner'],
  'diet': [],
  'difficulty': '',
  'ingredients': [{'amount': '500', 'unit': 'g', 'name': 'dünn geschnittenes Rindfleisch, z. B. Hüfte oder Lende'},
                  {'amount': '5', 'unit': 'EL', 'name': 'Sojasauce'},
                  {'amount': '2', 'unit': 'EL', 'name': 'Zucker'},
                  {'amount': '1', 'unit': 'EL', 'name': 'Sesamöl'},
                  {'amount': '3', 'unit': '', 'name': 'Knoblauchzehen, fein gehackt'},
                  {'amount': '1', 'unit': '', 'name': 'kleine Zwiebel, fein gerieben'},
                  {'amount': '2', 'unit': '', 'name': 'Frühlingszwiebeln, in feine Ringe geschnitten'},
                  {'amount': '1', 'unit': 'TL', 'name': 'schwarzer Pfeffer'},
                  {'amount': '1', 'unit': 'EL', 'name': 'geröstete Sesamsamen, zum Servieren'}],
  'steps': [{'text': 'Sojasauce, Zucker, Sesamöl, Knoblauch, geriebene Zwiebel, Frühlingszwiebeln und Pfeffer in einer Schüssel gut vermengen.'},
            {'text': 'Das dünn geschnittene Rindfleisch in die Marinade geben und gut durchmischen.'},
            {'text': 'Abgedeckt mindestens 3 Stunden, idealerweise über Nacht, im Kühlschrank marinieren lassen.'},
            {'text': 'Das Fleisch portionsweise in einer heißen Grillpfanne oder direkt auf dem Grill bei hoher Hitze scharf anbraten –ca. 1–2 Minuten pro '
                     'Seite.'},
            {'text': 'Mit geröstetem Sesam bestreuen und mit Beilagen servieren.'}],
  'notes': 'Hinweise\n'
           'Fleisch zu dick schneiden: Bulgogi lebt vom dünnen Zuschnitt –bitte maximal 3 mm, damit es schnell und zart gart.\n'
           'Fleisch nicht lange genug mariniert: Weniger als 2–3 Stunden reichen kaum aus, um den Geschmack vollständig aufzunehmen.\n'
           'Zu viel Fleisch auf einmal anbraten: In kleinen Portionen braten –sonst kühlt die Pfanne ab und das Fleisch wird gekocht statt gebraten.\n'
           'Zucker oder Sesamöl weglassen: Diese Zutaten sorgen für karamellige Röstnoten und das typische Aroma.\n'
           'Direkt aus dem Kühlschrank grillen: Lass das marinierte Fleisch vor dem Grillen ca. 15 Minuten bei Zimmertemperatur ruhen –so gart es '
           'gleichmäßiger.',
  'source': '[https://doncarne.de/de/blog/bulgogi-sweet-flame/](https://doncarne.de/de/blog/bulgogi-sweet-flame/)',
  '_img': 'square',
  '_nutri': False},
 {'id': 'hk_karamell',
  'title': 'Karamellsauce',
  'servings': 1,
  'timeMinutes': 30,
  'tags': [],
  'categoryTags': ['sauce'],
  'diet': ['vegetarian'],
  'difficulty': '',
  'ingredients': [{'amount': '70', 'unit': 'g', 'name': 'weisser Zucker'},
                  {'amount': '130', 'unit': 'g', 'name': 'brauner Zucker'},
                  {'amount': '60', 'unit': 'g', 'name': 'Butter'},
                  {'amount': '60', 'unit': 'ml', 'name': 'Vollmilch'},
                  {'amount': '60', 'unit': 'ml', 'name': 'Vollrahm'},
                  {'amount': '1', 'unit': 'Prise', 'name': 'Salz'}],
  'steps': [{'text': 'Weissen Zucker karamellisieren\n'
                     'Den weissen Zucker gleichmässig in einer Edelstahlpfanne verteilen. Bei mittlerer Hitze etwa 8 Minuten erhitzen, bis er vollständig '
                     'geschmolzen und bernsteinfarben ist. Nicht rühren, sondern die Pfanne gelegentlich vorsichtig schwenken. Die Farbe ist entscheidend: Den '
                     'Zucker nicht dunkelbraun werden lassen.'},
            {'text': 'Butter einarbeiten\n'
                     'Die Pfanne vom Herd nehmen. Die Butter vorsichtig dazugeben. Achtung: Die Mischung kann stark aufschäumen und spritzen. Mit einem '
                     'Schwingbesen rühren, bis die Butter vollständig eingearbeitet ist.'},
            {'text': 'Milch und Vollrahm hinzufügen\n'
                     'Die Vollmilch und den Vollrahm langsam und portionsweise unter ständigem Rühren dazugeben. Vorsicht: Die Mischung kann erneut stark '
                     'aufschäumen. Rühren, bis eine möglichst glatte Sauce entsteht.'},
            {'text': 'Braunen Zucker auflösen\n'
                     'Die Pfanne zurück auf den Herd stellen und den braunen Zucker hinzufügen. Bei niedriger Hitze unter ständigem Rühren etwa 10 Minuten '
                     'sanft köcheln lassen, bis sich der Zucker vollständig aufgelöst hat und die Sauce cremig ist. Sollten sich beim Hinzufügen der Milch '
                     'Karamellklumpen gebildet haben, diese unter vorsichtigem Erwärmen auflösen.'},
            {'text': 'Mit Salz abschmecken\nEine Prise Salz hinzufügen und gründlich unterrühren.'},
            {'text': 'Abfüllen und abkühlen lassen\n'
                     'Die Sauce vorsichtig in ein sauberes, hitzebeständiges Glas füllen. Nicht in der heissen Pfanne stehen lassen, da sie durch die '
                     'Restwärme weiterkochen kann. Etwa 1 Stunde bei Raumtemperatur abkühlen lassen, anschliessend verschliessen und in den Kühlschrank '
                     'stellen.'}],
  'notes': 'Hinweise:\n'
           'Die Sauce ist im warmen Zustand flüssiger und wird beim Abkühlen deutlich dicker.\n'
           'Die Zeitangaben sind Richtwerte und hängen von Pfanne und Herd ab.\n'
           'Heisser Karamell kann schwere Verbrennungen verursachen. Nicht mit den Fingern berühren oder heiss probieren.\n'
           'Allergene:\n'
           'Milch und Milchprodukte, einschliesslich Laktose.\n'
           '\n'
           'Beschreibung:\n'
           'Cremige Karamellsauce mit Butter, Vollmilch und Vollrahm. Die Sauce wird beim Abkühlen dickflüssiger.\n'
           'Kategorie: Saucen\n'
           'Ernährungsform: Vegetarisch\n'
           'Abkühlzeit: 60 Minuten',
  'source': None,
  '_img': 'landscape',
  '_nutri': False},
 {'id': 'hk_kartoffelsalat',
  'title': 'Kartoffelsalat',
  'servings': 4,
  'timeMinutes': 80,
  'prepMinutes': 30,
  'restMinutes': 30,
  'tags': [],
  'categoryTags': ['salad', 'side'],
  'diet': ['vegetarian'],
  'difficulty': '',
  'ingredients': [{'amount': '', 'unit': '', 'name': 'Zutaten:'},
                  {'amount': '1', 'unit': 'kg', 'name': 'festkochende Kartoffeln'},
                  {'amount': '1 1/2', 'unit': 'dl', 'name': 'Bouillon'},
                  {'amount': '1', 'unit': '', 'name': 'Zwiebel, fein gehackt'},
                  {'amount': '4', 'unit': 'EL', 'name': 'Weissweinessig'},
                  {'amount': '1', 'unit': 'EL', 'name': 'Senf'},
                  {'amount': '2', 'unit': 'EL', 'name': 'Mayonnaise'},
                  {'amount': '3', 'unit': 'EL', 'name': 'Joghurt'},
                  {'amount': '2', 'unit': 'EL', 'name': 'Rapsöl'},
                  {'amount': '', 'unit': '', 'name': 'Salz, nach Geschmack'},
                  {'amount': '', 'unit': '', 'name': 'Pfeffer aus der Mühle, nach Geschmack'},
                  {'amount': '', 'unit': '', 'name': 'Garnitur:'},
                  {'amount': '3', 'unit': 'EL', 'name': 'Schnittlauch, fein geschnitten'}],
  'steps': [{'text': 'Die Kartoffeln mit der Schale in Wasser während 20–30 Minuten gar kochen. Anschliessend kurz mit kaltem Wasser abschrecken. Die noch '
                     'warmen Kartoffeln schälen, in gleichmässige Scheiben schneiden und in eine grosse Schüssel geben.'},
            {'text': 'Die Bouillon zusammen mit der fein gehackten Zwiebel in einer Pfanne aufkochen. Den Weissweinessig hinzufügen und die heisse Mischung '
                     'gleichmässig über die Kartoffelscheiben giessen. Die Kartoffeln ungefähr 30 Minuten ziehen lassen. Während dieser Zeit die Schüssel '
                     'gelegentlich vorsichtig schwenken, damit sich die Flüssigkeit gut verteilt.'},
            {'text': 'Für die Sauce Senf, Mayonnaise, Joghurt und Rapsöl miteinander verrühren. Mit Salz und frisch gemahlenem Pfeffer würzen.'},
            {'text': 'Die vorbereitete Sauce zu den Kartoffeln geben und alles sorgfältig miteinander vermischen. Den Kartoffelsalat abschmecken und bei '
                     'Bedarf nachwürzen.'},
            {'text': 'Den fertigen Kartoffelsalat in einer Servierschüssel anrichten und mit dem fein geschnittenen Schnittlauch garnieren.'},
            {'text': 'Der Kartoffelsalat lässt sich gut bereits am Vortag zubereiten.\n'
                     'Abweichende Zeitangaben: Swissmilk gibt eine Kochzeit von 20 Minuten an, während im ersten Zubereitungsschritt 20–30 Minuten genannt '
                     'werden.'}],
  'notes': 'Hinweise\n'
           'Alternative zur Sauce: Anstelle von Joghurt kann Sauermilch oder Crème fraîche verwendet werden.\n'
           'Varianten: Fein geschnittene Radieschen, Salatgurken, Essiggurken oder hartgekochte Eier können unter den Kartoffelsalat gemischt oder separat '
           'dazu serviert werden.',
  'source': 'https://www.swissmilk.ch/de/rezepte-kochideen/rezepte/LM_div_1013_01/kartoffelsalat/',
  '_img': 'landscape',
  '_nutri': True}]

HIRNKOST_BOOK = {'title': 'HIRNKOST',
 'subtitle': 'Essen ohne Leistung',
 'author': '',
 'chapters': [{'id': 'hk1', 'name': 'Hauptgänge'}, {'id': 'hk2', 'name': 'Dessert'}],
 'items': [['hk_sloppy', 'hk1'],
           ['hk_manti', 'hk1'],
           ['hk_carbonara', 'hk1'],
           ['hk_cookies', 'hk2'],
           ['hk_bulgogi', ''],
           ['hk_karamell', ''],
           ['hk_kartoffelsalat', '']]}


HIRNKOST_IDS = [r['id'] for r in HIRNKOST_RECIPES]


async def hirnkost_session_setup(session):
    """Hirnkost-Rezepte und -Buch in eine laufende PdfSession laden (zusaetzlich zu den Standard-Fixtures)."""
    import copy
    session.fx = copy.deepcopy(session.fx)
    session.fx['recipes'] = [r for r in session.fx['recipes'] if not r['id'].startswith('hk_')] + copy.deepcopy(HIRNKOST_RECIPES)
    session.fx['books']['hirnkost'] = copy.deepcopy(HIRNKOST_BOOK)
    return await session.seed(nur=set(HIRNKOST_IDS))
