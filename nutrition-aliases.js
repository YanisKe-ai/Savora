/* ---------- Nutrition: Alltagsbegriffe -> Eintrag der Schweizer Naehrwertdatenbank ----------
   Die BLV-Datenbank benennt Lebensmittel fachlich ("Zucker, weiss", "Vollmilch, pasteurisiert",
   "Hühnerei, ganz, roh"). Rezepte schreiben "Zucker", "Milch", "Eier", "Rüebli". Diese kuratierte
   Tabelle verbindet beides direkt, damit die haeufigsten Zutaten sicher erkannt werden, statt
   ueber eine unsichere Textsuche zu raten. Es werden KEINE Naehrwerte erfunden: jeder Eintrag
   zeigt auf einen echten Datensatz der Datenbank (Test: tests/test_nutrition.py prueft, dass jedes
   Ziel existiert). Zutaten ohne Naehrwert-Bedeutung (Wasser) und Gewuerze in Kleinstmengen
   (Pfeffer, Backpulver) werden bewusst nicht mitgerechnet, ohne dass sie als Fehler zaehlen. */

const NUTRITION_ALIAS_TABLE = [
  [['salz', 'kochsalz', 'meersalz', 'jodsalz', 'tafelsalz', 'speisesalz', 'fleur de sel', 'himalayasalz', 'salz fein'], 'Kochsalz mit Jod'],
  [['zucker', 'haushaltszucker', 'kristallzucker', 'feinkristallzucker', 'rohrzucker', 'puderzucker', 'staubzucker', 'vanillezucker', 'vanille zucker', 'brauner zucker', 'braunzucker', 'rohzucker', 'streuzucker', 'hagelzucker', 'zucker weiss'], 'Zucker, weiss'],
  [['mehl', 'weissmehl', 'weizenmehl', 'backmehl', 'universalmehl', 'zopfmehl', 'weizenmehl weiss', 'mehl weiss', 'mehl hell'], 'Weizenmehl (Backmehl), Typ 550'],
  [['halbweissmehl', 'halbweisses mehl'], 'Weizenmehl, halbweiss, Typ 720'],
  [['ruchmehl'], 'Weizenmehl, Ruch, Typ 1100'],
  [['vollkornmehl', 'weizenvollkornmehl', 'vollkorn mehl'], 'Weizenmehl, Vollkorn, Typ 1700'],
  [['dinkelmehl', 'dinkelmehl weiss'], 'Dinkelmehl, weiss, Typ 550'],
  [['roggenmehl'], 'Roggenmehl, halbweiss, Typ 815'],
  [['maisstärke', 'speisestärke', 'stärke', 'maizena', 'maisstaerke'], 'Maisstärke'],
  [['kartoffelstärke'], 'Kartoffelstärke'],
  [['öl', 'speiseöl', 'pflanzenöl', 'rapsöl', 'bratöl', 'öl zum braten', 'öl zum anbraten'], 'Rapsöl'],
  [['sonnenblumenöl'], 'Sonnenblumenöl'],
  [['olivenöl', 'olivenöl extra vergine', 'olivenöl extra', 'öl olive', 'natives olivenöl'], 'Olivenöl'],
  [['butter', 'streichbutter', 'tafelbutter', 'vorzugsbutter', 'butter weich', 'butter kalt', 'butter flüssig', 'flüssige butter', 'geschmolzene butter', 'ungesalzene butter'], 'Vorzugsbutter'],
  [['milch', 'vollmilch', 'frischmilch', 'kuhmilch', 'milch 3.5'], 'Vollmilch, pasteurisiert'],
  [['teilentrahmte milch', 'halbfettmilch', 'milch teilentrahmt', 'drinkmilch'], 'Teilentrahmte Milch, pasteurisiert'],
  [['rahm', 'vollrahm', 'kochsahne', 'kochrahm', 'cremefine', 'sahne', 'schlagsahne', 'schlagrahm', 'rahm sahne', 'flüssiger rahm', 'rahm flüssig', 'kochrahm', 'schlagobers', 'rahm 35'], 'Vollrahm, pasteurisiert'],
  [['halbrahm', 'kaffeerahm', 'halbrahm 25'], 'Halbrahm, pasteurisiert'],
  [['sauerrahm', 'saurer rahm', 'saurer halbrahm'], 'Sauerrahm'],
  [['crème fraîche', 'creme fraiche', 'crème fraiche', 'schmand', 'saure sahne'], 'Sauerrahm', 'ca'],
  [['joghurt', 'jogurt', 'joghurt nature', 'naturjoghurt', 'naturejoghurt', 'natur joghurt', 'joghurt natur', 'griechischer joghurt'], 'Joghurt, nature'],
  [['quark', 'speisequark', 'quark halbfett'], 'Quark, nature, halbfett'],
  [['magerquark', 'quark mager'], 'Quark, nature, mager'],
  [['hüttenkäse', 'körniger frischkäse'], 'Hüttenkäse, nature'],
  [['ei', 'eier', 'vollei', 'vollei roh', 'hühnerei', 'hühnereier', 'freilandeier', 'eier gross', 'eier mittelgross', 'ei gross'], 'Hühnerei, ganz, roh'],
  [['eigelb', 'eidotter', 'eigelbe', 'eidotter roh'], 'Hühnereigelb, roh (Eidotter)'],
  [['eiweiss', 'eiklar', 'eiweisse', 'eiweiß'], 'Hühnereiweiss, roh (Eiklar)'],
  [['hackfleisch gemischt', 'gemischtes hackfleisch', 'hackfleisch', 'gehacktes', 'gehacktes gemischt', 'hack'], 'Gehacktes (Durchschnitt aus Rind, Kalb, Schwein, Poulet), roh'],
  [['rindshackfleisch', 'rinderhackfleisch', 'rindergehacktes', 'rindsgehacktes', 'rinderhack', 'hackfleisch rind', 'hackfleisch vom rind', 'rindfleisch gehackt', 'rind gehackt', 'gehacktes rind'], 'Rind, Gehacktes, roh'],
  [['schweinshackfleisch', 'schweinehackfleisch', 'schweinegehacktes', 'hackfleisch schwein'], 'Schwein, Gehacktes, roh'],
  [['pouletbrust', 'pouletbrüste', 'pouletbrustfilet', 'poulet brust', 'hähnchenbrust', 'hähnchenbrustfilet', 'hühnerbrust', 'hühnerbrustfilet', 'chicken breast', 'pouletschnitzel', 'poulet geschnetzeltes'], 'Poulet, Brust, ohne Haut, roh'],
  [['schweinefilet', 'schweinsfilet', 'schweinsfilets'], 'Schwein, Filet, roh'],
  [['rindsfilet', 'rinderfilet', 'rindfilet'], 'Rind, Filet, roh'],
  [['rindfleisch', 'rindsfleisch', 'rindsragout', 'rindsgeschnetzeltes', 'rindsgulasch', 'rindsschulter'], 'Rindfleisch (Durchschnitt exkl. Innereien, Rippensteak), roh'],
  [['speck', 'bratspeck', 'speckwürfel', 'speckwürfeli', 'speckstreifen', 'frühstücksspeck', 'bacon', 'rohessspeck'], 'Rohessspeck'],
  [['kochspeck'], 'Kochspeck'],
  [['schinken', 'kochschinken', 'hinterschinken', 'vorderschinken', 'schinkenwürfel'], 'Hinterschinken'],
  [['rohschinken', 'schinken roh', 'prosciutto'], 'Rohschinken'],
  [['lachs', 'lachsfilet', 'zuchtlachs'], 'Lachs, Zucht, roh'],
  [['räucherlachs', 'geräucherter lachs', 'lachs geräuchert'], 'Lachs, geräuchert'],
  [['thon', 'thunfisch', 'thon im öl', 'thunfisch im öl', 'thon in öl', 'thunfisch in öl', 'thon dose', 'thunfisch dose'], 'Thon im Öl, abgetropft'],
  [['thon im wasser', 'thunfisch im wasser', 'thunfisch natur'], 'Thon im Wasser, abgetropft'],
  [['tomate', 'tomaten', 'kirschtomate', 'kirschtomaten', 'kirsch tomaten', 'datteltomaten', 'strauchtomaten', 'roma tomaten', 'fleischtomate', 'fleischtomaten', 'cherrytomate', 'cherrytomaten', 'cocktailtomaten', 'rispentomaten', 'peperoncini tomate'], 'Tomate, roh'],
  [['gehackte tomaten', 'passata', 'passierte tomaten', 'geschälte tomaten', 'pelati', 'tomaten gehackt', 'tomaten dose', 'tomaten aus der dose', 'stückige tomaten', 'tomatenstücke', 'tomaten passiert', 'tomaten geschält'], 'Tomate, geschält (Konserve)'],
  [['tomatenmark', 'tomatenpüree', 'tomatenkonzentrat', 'tomatenpurée', 'doppelt konzentriertes tomatenmark'], 'Tomatenpüree'],
  [['tomatensauce', 'tomatensosse', 'tomatensugo', 'sugo'], 'Tomatensauce'],
  [['zwiebel', 'zwiebeln', 'küchenzwiebel', 'gemüsezwiebel', 'rote zwiebel', 'rote zwiebeln', 'weisse zwiebel', 'speisezwiebel', 'zwiebel rot', 'zwiebel gross', 'schalotte', 'schalotten', 'frühlingszwiebel', 'frühlingszwiebeln', 'lauchzwiebel', 'lauchzwiebeln', 'zwiebeln rot'], 'Zwiebel, roh'],
  [['knoblauch', 'knoblauchzehe', 'knoblauchzehen', 'knoblauchknolle', 'zehe knoblauch', 'zehen knoblauch'], 'Knoblauch, roh'],
  [['karotte', 'karotten', 'rüebli', 'möhre', 'möhren', 'rübli', 'karotten gerieben'], 'Karotte, roh'],
  [['peperoni', 'peperoni rot', 'rote peperoni', 'rote peperoni', 'rote paprika', 'paprika rot', 'rote paprikaschote', 'paprikaschote', 'paprikaschoten', 'gelbe peperoni', 'gelbe paprika', 'peperoni gelb', 'peperoni orange', 'paprika', 'peperoni rot gross', 'rote peperoni gross'], 'Peperoni, rot, roh'],
  [['grüne peperoni', 'peperoni grün', 'grüne paprika', 'grüne paprikaschote'], 'Peperoni, grün, roh'],
  [['zucchetti', 'zucchini', 'zucchetto', 'zucchetti klein'], 'Zucchetti, roh'],
  [['aubergine', 'auberginen', 'melanzane'], 'Aubergine, roh'],
  [['gurke', 'gurken', 'salatgurke', 'salatgurken', 'schlangengurke', 'cornichons'], 'Gurke, roh'],
  [['champignon', 'champignons', 'egerlinge', 'braune champignons', 'weisse champignons', 'zuchtchampignons'], 'Champignon, roh'],
  [['pilz', 'pilze', 'waldpilze', 'gemischte pilze', 'pilzmischung', 'shiitake', 'austernpilze', 'eierschwämme', 'pfifferlinge', 'steinpilze'], 'Pilz (Durchschnitt), roh'],
  [['spinat', 'blattspinat', 'babyspinat', 'frischer spinat'], 'Spinat, roh'],
  [['broccoli', 'brokkoli', 'broccoliröschen'], 'Broccoli, roh'],
  [['blumenkohl', 'blumenkohlröschen'], 'Blumenkohl, roh'],
  [['lauch', 'porree', 'lauchstange', 'lauchstangen'], 'Lauch, roh'],
  [['sellerie', 'knollensellerie', 'sellerieknolle', 'selleriewurzel'], 'Knollensellerie, roh'],
  [['stangensellerie', 'bleichsellerie', 'staudensellerie', 'selleriestangen', 'sellerie stangen'], 'Stangensellerie, roh'],
  [['kartoffel', 'kartoffeln', 'erdäpfel', 'erdapfel', 'mehlig kochende kartoffeln', 'festkochende kartoffeln', 'grumbeeren', 'salzkartoffeln', 'gschwellti'], 'Kartoffel, geschält, roh'],
  [['süsskartoffel', 'süsskartoffeln', 'batate', 'bataten'], 'Süsskartoffel, roh'],
  [['kürbis', 'butternusskürbis', 'butternuss', 'hokkaido', 'hokkaidokürbis', 'kürbisfleisch'], 'Kürbis, roh'],
  [['fenchel', 'fenchelknolle'], 'Fenchel, roh'],
  [['rande', 'randen', 'rote bete', 'rote beete', 'rote rüben'], 'Rande, roh'],
  [['kohlrabi'], 'Kohlrabi, roh'],
  [['blattsalat', 'salat', 'kopfsalat', 'lattich', 'rucola', 'nüsslisalat', 'feldsalat', 'lollo', 'batavia', 'blattsalate', 'salatmischung'], 'Blattsalat (Durchschnitt), roh'],
  [['eisbergsalat', 'eisberg'], 'Eisbergsalat, roh'],
  [['apfel', 'äpfel', 'apfelstück', 'apfelstücke'], 'Apfel, roh'],
  [['banane', 'bananen', 'reife banane', 'reife bananen'], 'Banane, roh'],
  [['birne', 'birnen'], 'Birne, roh'],
  [['orange', 'orangen'], 'Orange, roh'],
  [['zitrone', 'zitronen', 'bio zitrone', 'bio zitronen'], 'Zitrone, roh'],
  [['zitronensaft', 'saft zitrone', 'saft einer zitrone', 'zitronensaft frisch'], 'Zitronensaft'],
  [['erdbeere', 'erdbeeren'], 'Erdbeere, roh'],
  [['himbeere', 'himbeeren'], 'Himbeere, roh'],
  [['heidelbeere', 'heidelbeeren', 'blaubeeren', 'blaubeere'], 'Heidelbeere, roh'],
  [['mango', 'mangos'], 'Mango, roh'],
  [['avocado', 'avocados'], 'Avocado, roh'],
  [['rosinen', 'rosine', 'sultaninen', 'sultanine'], 'Rosine, getrocknet'],
  [['spaghetti', 'penne', 'fusilli', 'tagliatelle', 'nudeln', 'pasta', 'macaroni', 'makkaroni', 'rigatoni', 'farfalle', 'linguine', 'teigwaren', 'hörnli', 'spaghettini', 'trockene teigwaren', 'lasagneblätter', 'lasagneplatten', 'cannelloni', 'orecchiette', 'bandnudeln', 'suppennudeln', 'gabelspaghetti', 'penne rigate', 'spiralen', 'spirelli', 'fettuccine', 'pappardelle', 'tortiglioni', 'pasta trocken'], 'Teigwaren ohne Ei, trocken'],
  [['eiernudeln', 'eierteigwaren', 'nudeln mit ei', 'teigwaren mit ei', 'spätzli', 'spätzle'], 'Teigwaren mit Ei, trocken'],
  [['reis', 'basmatireis', 'jasminreis', 'langkornreis', 'rundkornreis', 'risottoreis', 'arborio', 'arborioreis', 'naturreis', 'weisser reis', 'reis trocken', 'duftreis', 'sushireis', 'carnaroli'], 'Reis poliert, trocken'],
  [['parmesan', 'parmigiano', 'parmigiano reggiano', 'grana padano', 'grana'], 'Parmesan'],
  [['mozzarella', 'büffelmozzarella'], 'Mozzarella'],
  [['emmentaler', 'emmentaler käse', 'emmental'], 'Emmentaler, vollfett'],
  [['gruyère', 'gruyere', 'greyerzer', 'gruyère käse'], 'Greyerzer, vollfett'],
  [['appenzeller'], 'Appenzeller, vollfett'],
  [['feta', 'fetakäse', 'feta käse', 'schafskäse', 'hirtenkäse', 'salakis'], 'Käse in Salzlake (Schaf- und Ziegenmilch)'],
  [['geriebener käse', 'reibkäse', 'käse gerieben', 'geriebenen käse', 'käse'], 'Reibkäse'],
  [['raclettekäse', 'raclette käse'], 'Raclettekäse'],
  [['sbrinz'], 'Sbrinz'],
  [['mascarpone'], 'Mascarpone'],
  [['mandeln', 'mandel', 'gemahlene mandeln', 'mandeln gemahlen', 'mandelstifte', 'mandelblätter', 'geschälte mandeln', 'mandeln gehackt', 'ganze mandeln'], 'Mandel'],
  [['haselnüsse', 'haselnuss', 'gemahlene haselnüsse', 'haselnüsse gemahlen', 'haselnusskerne'], 'Haselnuss'],
  [['baumnüsse', 'baumnuss', 'walnüsse', 'walnuss', 'walnusskerne', 'baumnusskerne'], 'Baumnuss'],
  [['erdnüsse', 'erdnuss', 'erdnusskerne'], 'Erdnuss'],
  [['cashewnüsse', 'cashewnuss', 'cashews', 'cashewkerne'], 'Cashewnuss'],
  [['pinienkerne', 'pinienkern'], 'Pinienkerne'],
  [['sonnenblumenkerne'], 'Sonnenblumenkerne'],
  [['kürbiskerne'], 'Kürbiskerne'],
  [['sesam', 'sesamsamen', 'sesamkörner'], 'Sesamsamen ungeschält'],
  [['leinsamen'], 'Leinsamen'],
  [['chiasamen', 'chia samen', 'chia'], 'Chia-Samen'],
  [['haferflocken', 'haferflocken zart', 'kernige haferflocken', 'zarte haferflocken', 'köllnflocken'], 'Haferflocken'],
  [['paniermehl', 'semmelbrösel', 'semmelmehl', 'brösel', 'panade', 'weggli brösel'], 'Paniermehl'],
  [['brötchen', 'semmel', 'semmeli', 'weggli', 'brötli', 'brot brötchen', 'kaiserbrötchen'], 'Semmeli'],
  [['brot', 'weissbrot', 'toastbrot', 'toast', 'baguette', 'ruchbrot', 'halbweissbrot', 'zopf', 'brotwürfel', 'brotscheibe', 'brotscheiben', 'altes brot', 'hartes brot', 'ciabatta', 'fladenbrot'], 'Brot (Durchschnitt)'],
  [['honig', 'blütenhonig', 'akazienhonig', 'waldhonig'], 'Honig (Blütenhonig)'],
  [['ahornsirup'], 'Ahornsirup'],
  [['agavendicksaft', 'agavensirup'], 'Agavensirup'],
  [['senf', 'dijonsenf', 'mittelscharfer senf', 'körniger senf'], 'Senf'],
  [['ketchup', 'tomatenketchup'], 'Ketchup'],
  [['mayonnaise', 'mayo'], 'Mayonnaise'],
  [['sojasauce', 'sojasosse', 'soja sauce', 'soyasauce', 'shoyu'], 'Sojasauce'],
  [['worcestersauce', 'worcester sauce', 'worcestershire sauce'], 'Worcester Sauce'],
  [['essig', 'weissweinessig', 'apfelessig', 'rotweinessig', 'branntweinessig', 'kräuteressig', 'weissweinessig mild'], 'Essig'],
  [['balsamico', 'balsamicoessig', 'aceto balsamico', 'balsamessig'], 'Balsamicoessig'],
  [['schokolade', 'zartbitterschokolade', 'kochschokolade', 'dunkle schokolade', 'bitterschokolade', 'schokolade dunkel', 'kuvertüre', 'kuvertüre dunkel', 'zartbitter kuvertüre'], 'Schokolade, dunkel (bitter)'],
  [['milchschokolade', 'vollmilchschokolade', 'milchkuvertüre'], 'Milchschokolade'],
  [['weisse schokolade', 'schokolade weiss'], 'Schokolade, weiss'],
  [['kakao', 'kakaopulver', 'backkakao', 'kakao ungezuckert', 'kakaopulver ungezuckert', 'backkakaopulver', 'kakao pulver'], 'Kakaopulver, ohne Zucker'],
  [['wein', 'weisswein', 'weisser wein', 'trockener weisswein', 'kochwein'], 'Wein weiss, 12.5 vol%'],
  [['rotwein', 'roter wein', 'trockener rotwein'], 'Wein rot, 12 vol%'],
  [['bouillon', 'gemüsebouillon', 'gemüsebrühe', 'gemüsefond', 'brühe', 'gemüsebouillon zubereitet', 'bouillon gemüse'], 'Bouillon, Gemüse, zubereitet'],
  [['fleischbouillon', 'rinderbouillon', 'fleischbrühe', 'rindsbouillon', 'rinderbrühe', 'fond', 'kalbsfond'], 'Bouillon, Fleisch, zubereitet'],
  [['hühnerbouillon', 'geflügelbouillon', 'hühnerbrühe', 'pouletbouillon', 'geflügelbrühe', 'hühnerfond'], 'Bouillon, Geflügel, zubereitet'],
  [['kokosmilch', 'kokosnussmilch', 'kokosmilch dose'], 'Kokosnussmilch'],
  [['bohnen', 'kidneybohnen', 'weisse bohnen', 'schwarze bohnen', 'rote bohnen', 'bohnen dose', 'kidney bohnen', 'cannellinibohnen', 'borlottibohnen', 'gekochte bohnen'], 'Bohne (alle Arten), gekocht (ohne Zugabe von Fett und Salz)'],
  [['grüne bohnen', 'gartenbohnen', 'buschbohnen', 'stangenbohnen', 'fadenbohnen', 'bohnen grün'], 'Bohne, grün, roh'],
  [['kichererbsen', 'kichererbse', 'kichererbsen dose', 'gekochte kichererbsen'], 'Kichererbse, gekocht (ohne Zugabe von Fett und Salz)'],
  [['linsen', 'linse', 'rote linsen', 'braune linsen', 'tellerlinsen', 'belugalinsen', 'berglinsen'], 'Linse, ganz, getrocknet'],
  [['erbsen', 'erbse', 'grüne erbsen', 'tiefkühlerbsen', 'zuckererbsen', 'gartenerbsen'], 'Erbse, grün, tiefgekühlt'],
  [['mais', 'maiskörner', 'zuckermais', 'mais dose', 'maiskörner dose'], 'Mais, roh'],
  [['tofu', 'naturtofu', 'tofu natur', 'festen tofu'], 'Tofu, fest, nature (Durchschnitt)'],
  [['ingwer', 'frischer ingwer', 'ingwerwurzel', 'ingwerstück'], 'Ingwer, roh'],
  [['petersilie', 'glatte petersilie', 'krause petersilie', 'peterli'], 'Petersilie, roh'],
  [['schnittlauch'], 'Schnittlauch, roh'],
  [['basilikum', 'frisches basilikum', 'basilikumblätter'], 'Basilikum, roh'],
  [['paprikapulver', 'paprika edelsüss', 'paprika pulver', 'edelsüsses paprikapulver', 'paprika scharf', 'paprikapulver edelsüss', 'geräuchertes paprikapulver', 'paprika geräuchert'], 'Paprika (Gewürz)'],
  [['zimt', 'zimtpulver', 'gemahlener zimt', 'zimt gemahlen'], 'Zimt'],
  [['erdnussbutter', 'erdnussmus', 'peanutbutter'], 'Erdnussbutter'],
  [['konfitüre', 'marmelade', 'konfi', 'aprikosenkonfitüre', 'erdbeerkonfitüre', 'himbeerkonfitüre', 'gelee'], 'Konfitüre'],
  [['margarine'], 'Margarine, ohne Butter, 70 - 80 % Fett'],
  [['schweineschmalz', 'schmalz', 'schweinefett'], 'Schweineschmalz'],
  [['hafermilch', 'haferdrink', 'hafergetränk', 'haferdrink nature'], 'Hafergetränk, nature'],
  [['sojamilch', 'sojadrink', 'sojagetränk'], 'Sojagetränk, nature'],
  [['mandelmilch', 'mandeldrink', 'mandelgetränk'], 'Mandelgetränk, nature'],
  [['pouletschenkel', 'poulet schenkel', 'hähnchenschenkel', 'hühnerschenkel', 'pouletunterschenkel', 'pouletkeule'], 'Poulet, Schenkel, ohne Haut, roh'],
  [['kabis', 'weisskohl', 'weisser kabis', 'weisskabis', 'weisskraut', 'kraut'], 'Weisskohl, roh'],
  [['rotkohl', 'rotkabis', 'rotkraut', 'blaukraut'], 'Rotkohl, roh'],
  [['wirz', 'wirsing'], 'Wirz, roh'],
  [['lammfilet', 'lamm filet'], 'Lamm, Filet, roh'],
  [['kokosraspel', 'kokosflocken', 'raspelkokos', 'kokos geraspelt', 'kokosraspeln'], 'Kokosnuss, getrocknet (Kokosrapseln, Kokosflocken)'],
  [['oliven', 'olive', 'grüne oliven'], 'Olive, grün, in Salzlake, abgetropft'],
  [['schwarze oliven', 'olive schwarz'], 'Olive, schwarz'],
  [['ziegenkäse', 'ziegenweichkäse', 'chèvre', 'chevre'], 'Weichkäse aus Ziegenmilch'],
  [['ziegenfrischkäse'], 'Ziegenfrischkäse, zum Streichen'],
  [['crevetten', 'garnelen', 'shrimps', 'scampi', 'riesencrevetten', 'crevette'], 'Garnele, geschält, roh (frisch oder tiefgekuhlt)'],
  [['datteln', 'dattel', 'medjool datteln', 'medjool'], 'Dattel, getrocknet'],
  [['apfelmus', 'apfelmark'], 'Apfelmus, ungezuckert (Konserve)'],
  [['kalbsgeschnetzeltes', 'kalbsgeschnetzelt', 'geschnetzeltes vom kalb', 'kalbsgeschnetzeltes roh'], 'Kalb, Geschnetzeltes, roh'],
  [['pouletgeschnetzeltes', 'pouletgeschnetzelt', 'hähnchengeschnetzeltes', 'poulet geschnetzeltes', 'pouletstreifen', 'hähnchenstreifen', 'pouletbrustschnitzel', 'pouletschnitzel'], 'Poulet, Brust, ohne Haut, roh'],
  [['trutenbrust', 'truthahnbrust', 'putenbrust', 'putenschnitzel', 'trutenschnitzel', 'truthahnschnitzel', 'putengeschnetzeltes'], 'Truthahn, Brust, Schnitzel oder Geschnetzeltes, roh'],
  [['tortilla chips', 'nachos', 'maischips', 'tortillachips', 'nacho chips'], 'Mais-Chips (Apérogebäck)'],
  [['kartoffelchips', 'chips', 'pommes chips', 'paprikachips'], 'Pommes Chips'],
  [['tortilla', 'tortillas', 'wrap', 'wraps', 'weizentortilla', 'fladenbrot', 'pita', 'pitabrot', 'taco shells', 'maistortilla'], 'Brot (Durchschnitt)', 'ca'],
  [['schweinsgeschnetzeltes', 'schweinegeschnetzeltes', 'schweinsgeschnetzelt', 'schweinegeschnetzelt', 'geschnetzeltes', 'geschnetzeltes vom schwein'], 'Geschnetzeltes (Durchschnitt aus Rind, Kalb, Schwein, Geflügel), roh', 'ca'],
  [['schweinskotelett', 'schweinskoteletts', 'schweinekotelett', 'schweinekoteletts', 'schweinsplätzli', 'schweineschnitzel', 'schweinsschnitzel', 'schweinssteak', 'schweinesteak', 'nierstück schwein'], 'Schwein, Kotelett, roh'],
  [['kalbsschnitzel', 'kalbsplätzli', 'kalbsplätzchen', 'kalbsfleisch', 'kalbsragout', 'kalbsbraten', 'kalbskotelett'], 'Kalbfleisch (Durchschnitt exkl. Innereien, Kotelett), roh'],
  [['lammgigot', 'gigot', 'lammkeule'], 'Lamm, Gigot, roh (Schweiz, Neuseeland)'],
  [['lammkotelett', 'lammkoteletts', 'lammkarree', 'lammracks'], 'Lamm, Kotelett, roh (Schweiz)'],
  [['lammfleisch', 'lammragout', 'lammschulter', 'lamm'], 'Lamm/Schaf (Durchschnitt exkl. Innereien, Kotelett), roh'],
  [['ente', 'entenbrust', 'entenbrüste', 'entenschenkel', 'gans'], 'Poulet, Brust, mit Haut, roh', 'ca'],
  [['ganzes poulet', 'poulet ganz', 'poulet', 'ganzes hähnchen', 'brathähnchen', 'grillpoulet', 'ganzes huhn', 'suppenhuhn'], 'Poulet, ganz, mit Haut, roh'],
  [['forelle', 'forellenfilet', 'forellenfilets', 'lachsforelle'], 'Forelle, roh'],
  [['sardellen', 'sardellenfilet', 'sardellenfilets', 'anchovis', 'sardelle'], 'Sardelle im Öl, abgetropft'],
  [['muscheln', 'miesmuscheln', 'miesmuschel', 'muschel'], 'Miesmuschel, roh'],
  [['tintenfisch', 'kalmar', 'calamari', 'kalmare', 'tintenfischringe', 'sepia'], 'Kalmar, roh', 'ca'],
  [['halloumi', 'grillkäse', 'bratkäse'], 'Hart- und Halbhartkäse, vollfett (Durchschnitt)', 'ca'],
  [['ricotta', 'ricotta salata'], 'Quark, nature, Rahm', 'ca'],
  [['kokosöl', 'kokosfett', 'palmin', 'kokosnussöl'], 'Kokosfett'],
  [['nutella', 'haselnusscreme', 'nussnougatcreme', 'schokoladenaufstrich', 'schokocreme', 'nusspli'], 'Haselnuss-Schokolade-Brotaufstrich'],
  [['rum', 'brauner rum', 'weisser rum'], 'Branntwein aus Zuckerrohr (z.B. Rum)'],
  [['cognac', 'weinbrand', 'brandy', 'armagnac', 'grappa', 'obstbrand'], 'Branntwein aus Wein (z.B.Cognac, Brandy)'],
  [['whisky', 'wodka', 'vodka', 'gin', 'likör', 'amaretto', 'schnaps'], 'Branntwein aus Getreide, 40 vol% (z.B. Whisky)', 'ca'],
  [['bier', 'lagerbier', 'helles bier', 'dunkles bier'], 'Bier, Lager'],
  [['limette', 'limetten', 'limettensaft'], 'Zitrone, roh', 'ca'],
  [['feige', 'feigen', 'frische feigen'], 'Feige, roh'],
  [['getrocknete feigen', 'dörrfeigen'], 'Feige, getrocknet'],
  [['mandarine', 'mandarinen', 'clementine', 'clementinen', 'satsuma'], 'Mandarine, roh'],
  [['aprikose', 'aprikosen', 'marille', 'marillen'], 'Aprikose, roh'],
  [['zwetschge', 'zwetschgen', 'pflaume', 'pflaumen', 'zwetschke'], 'Pflaume, roh'],
  [['melone', 'zuckermelone', 'honigmelone', 'cantaloupe'], 'Zuckermelone (Honigmelone), roh'],
  [['wassermelone'], 'Wassermelone, roh'],
  [['pfirsich', 'pfirsiche', 'nektarine', 'nektarinen'], 'Pfirsich, gelb, roh'],
  [['kirsche', 'kirschen'], 'Kirsche, roh'],
  [['trauben', 'traube', 'weintrauben'], 'Traube, weiss, roh'],
  [['ananas', 'frische ananas'], 'Ananas, roh'],
  [['kiwi', 'kiwis'], 'Kiwi, roh'],
  [['maiskolben', 'maiskolben gekocht'], 'Mais, roh'],
  [['kopfsalat', 'kopfsalate', 'lollo rosso', 'eichblattsalat', 'romanasalat', 'endivie', 'endiviensalat', 'chicorée', 'zuckerhut', 'radicchio'], 'Blattsalat (Durchschnitt), roh'],
  [['bulgur', 'bulgur gekocht'], 'Hartweizengriess, trocken', 'ca'],
  [['puddingpulver', 'vanillepuddingpulver', 'saucenbinder', 'tortenguss', 'kartoffelmehl'], 'Maisstärke', 'ca'],
  [['pancetta', 'guanciale', 'bauchspeck', 'bacon', 'schweinebauch geräuchert', 'pancetta am stück', 'speckwürfeli'], 'Rohessspeck'],
  [['pecorino', 'pecorino romano', 'pecorino käse', 'romano'], 'Sbrinz'],
  [['schokoladewürfeli', 'schokoladenwürfeli', 'schokoladenstückchen', 'schokotropfen', 'schokoladentropfen', 'schokostückchen', 'chocolate chips', 'zartbitterschokolade gehackt'], 'Schokolade, dunkel (bitter)'],
  [['trockenhefe', 'trockenhefe päckchen', 'backhefe', 'hefe trocken', 'instanthefe'], 'Bierhefe, getrocknet'],
  [['käsescheiben', 'käsescheibe', 'cheddar', 'cheddar käse', 'schmelzkäse', 'toastkäse', 'burgerkäse', 'hartkäse', 'halbhartkäse', 'bergkäse', 'tilsiter', 'raclette'], 'Hart- und Halbhartkäse, vollfett (Durchschnitt)'],
  [['würstchen', 'wienerli', 'wienerlis', 'wiener würstchen', 'wiener'], 'Wienerli'],
  [['bratwurst', 'schweinsbratwurst', 'bratwürste'], 'Schweinsbratwurst'],
  [['cervelat', 'servelat'], 'Cervelat'],
  [['hefe', 'frischhefe', 'bäckerhefe', 'hefewürfel', 'hefe frisch', 'würfel hefe', 'hefe würfel'], 'Bäckerhefe, gepresst'],
  [['blätterteig', 'blätterteig ausgewallt', 'ausgewallter blätterteig', 'rechteckiger blätterteig', 'runder blätterteig', 'butterblätterteig'], 'Blätterteig, hausgemacht (Butter), ungebacken'],
  [['pizzateig', 'fertiger pizzateig', 'pizzateig ausgewallt'], 'Pizzateig (mit Olivenöl), ungebacken'],
  [['griess', 'hartweizengriess', 'weizengriess', 'griess trocken'], 'Hartweizengriess, trocken'],
  [['polenta', 'maisgriess', 'polenta trocken', 'maisgriess trocken'], 'Maisgriess, trocken'],
  [['couscous', 'couscous trocken'], 'Couscous-Körner (vorgekochtes Hartweizengriess), gekocht (ohne Zugabe von Fett und Salz)'],
  [['quinoa'], 'Quinoa, roh'],
  [['hirse', 'hirsekörner'], 'Hirse, Korn geschält'],
];

/* Zutaten ohne Naehrwert-Beitrag: werden nicht mitgerechnet und zaehlen nicht als Fehler. */
const NUTRITION_NON_CALORIC_TERMS = ['kaffee', 'espresso', 'schwarzer kaffee', 'tee', 'teebeutel', 'beutel tee', 'grüner tee', 'schwarzer tee', 'kräutertee', 'tasse kaffee', 'wasser', 'leitungswasser', 'mineralwasser', 'kaltes wasser', 'warmes wasser', 'heisses wasser', 'lauwarmes wasser', 'eiswürfel', 'eis', 'kochwasser', 'nudelwasser', 'sprudelwasser', 'wasser lauwarm', 'wasser kalt', 'wasser warm', 'wasser heiss', 'salzwasser', 'tafelwasser', 'eiswasser'];

/* Gewuerze/Triebmittel: bei Kleinstmengen (Prise, Msp, TL, bis 10 g) vernachlaessigbar. */
const NUTRITION_NEGLIGIBLE_TERMS = ['tabasco', 'chilischote', 'chilischoten', 'peperoncino', 'peperoncini', 'chilis', 'rote chili', 'grüne chili', 'gelatine', 'gelatineblatt', 'gelatineblätter', 'bouillonwürfel', 'brühwürfel', 'gemüsebrühwürfel', 'gemüsebouillonwürfel', 'fleischbouillonwürfel', 'hühnerbouillonwürfel', 'fondor', 'aromat', 'streuwürze', 'maggi', 'sojasosse würze', 'knoblauchpulver', 'zwiebelpulver', 'paprikaflocken', 'pul biber', 'pulbiber', 'chili flocken', 'sumach', 'kurkumapulver', 'ingwerpulver', 'zimtstange', 'zitronengras', 'currypaste', 'harissa', 'sambal oelek', 'senfkörner', 'koriandersamen', 'gewürzmischung', 'rauchsalz', 'kräutersalz', 'selleriesalz', 'pfeffer', 'schwarzer pfeffer', 'pfeffer aus der mühle', 'gemahlener pfeffer', 'weisser pfeffer', 'pfefferkörner', 'backpulver', 'natron', 'backnatron', 'weinsteinbackpulver', 'muskat', 'muskatnuss', 'muskatnuss gerieben', 'curry', 'currypulver', 'kurkuma', 'gelbwurz', 'oregano', 'thymian', 'rosmarin', 'majoran', 'lorbeer', 'lorbeerblatt', 'lorbeerblätter', 'chili', 'chilipulver', 'chiliflocken', 'cayenne', 'cayennepfeffer', 'kreuzkümmel', 'kümmel', 'kardamom', 'gewürznelken', 'nelken', 'vanille', 'vanilleschote', 'vanilleextrakt', 'vanillearoma', 'vanillepaste', 'gewürz', 'gewürze', 'gewürzmischung', 'kräuter', 'kräuter der provence', 'italienische kräuter', 'salbei', 'estragon', 'koriander gemahlen', 'safran', 'zitronenschale', 'orangenschale', 'zitronenabrieb', 'zitronenzeste', 'garam masala', 'ras el hanout', 'paprika edelsüss ', 'salz und pfeffer', 'pfeffer und salz', 'sternanis', 'anis', 'fenchelsamen', 'sumach', 'wacholderbeeren', 'liebstöckel', 'bohnenkraut', 'dill', 'kerbel', 'minze', 'pfefferminze', 'zitronenmelisse', 'weinstein', 'aroma', 'lebensmittelfarbe', 'backaroma', 'bittermandelaroma', 'rumaroma', 'zitronenaroma'];

const NUTRITION_NEGLIGIBLE_MAX_GRAMS = 10;

/* Bereinigt einen Zutatennamen fuer den Alias-Abgleich: Kleinbuchstaben, ohne Klammern und
   Zusaetze nach dem Komma, ohne Groessen-/Zustandswoerter. Liefert mehrere Varianten
   (von genau bis grob), die der Reihe nach geprueft werden. */
const NUTRITION_ALIAS_DROP_WORDS = new Set(['frische', 'frischer', 'frisches', 'frischen', 'frisch', 'grosse', 'grosser', 'grosses', 'grossen', 'kleine', 'kleiner', 'kleines', 'kleinen', 'mittelgrosse', 'mittelgrosser', 'mittelgrosses', 'mittlere', 'reife', 'reifer', 'reifes', 'reifen', 'junge', 'junger', 'weiche', 'weicher', 'weiches', 'weichen', 'geriebene', 'geriebener', 'geriebenes', 'geriebenen', 'gehackte', 'gehackter', 'gehacktes', 'gehackten', 'gewürfelte', 'gewürfelter', 'gewürfelten', 'geschnittene', 'geschnittener', 'geschnittenen', 'gemahlene', 'gemahlener', 'gemahlenes', 'gemahlenen', 'feine', 'feiner', 'feines', 'feinen', 'grobe', 'grober', 'groben', 'ganze', 'ganzer', 'ganzes', 'ganzen', 'halbe', 'halber', 'halbes', 'halben', 'bio', 'lauwarme', 'lauwarmer', 'lauwarmes', 'lauwarmen', 'kalte', 'kalter', 'kaltes', 'kalten', 'warme', 'warmer', 'warmes', 'warmen', 'flüssige', 'flüssiger', 'flüssiges', 'flüssigen', 'geschmolzene', 'geschmolzener', 'geschmolzenes', 'zimmerwarme', 'zimmerwarmer', 'zimmerwarmes', 'gute', 'guter', 'gutes', 'guten', 'qualität', 'nach', 'belieben', 'geschmack', 'etwas', 'ca', 'circa', 'etwa', 'evtl', 'eventuell', 'optional', 'zum', 'zur', 'für', 'fuer', 'und', 'oder', 'aus', 'der', 'dem', 'die', 'das', 'mühle', 'muehle', 'stück', 'am', 'streifen', 'würfeli', 'röschen', 'spalten', 'ringe', 'schuss', 'spritzer', 'einer', 'einem', 'einen', 'eines', 'einige', 'paar', 'wenig', 'garnieren', 'bestäuben', 'bestreichen', 'servieren', 'braten', 'dose', 'glas', 'becher', 'packung', 'tk', 'tiefgekühlt', 'tiefgekühlte', 'aus', 'gehäutet', 'halbiert', 'geviertelt', 'in', 'scheiben', 'stücken', 'stängeln', 'diced', 'chopped', 'sliced', 'minced', 'fresh', 'large', 'small', 'medium', 'melted', 'softened', 'grated', 'shredded', 'boneless', 'skinless', 'den', 'vom', 'von', 'mit', 'ohne', 'in', 'im', 'ein', 'eine', 'einen', 'einer', 'eines', 'gross', 'klein', 'mittelgross', 'reif', 'jung', 'weich', 'fein', 'grob', 'ganz', 'halb', 'gestrichen', 'gestrichene', 'gehäuft', 'gehäufte', 'gehäufter', 'gestrichener', 'gestrichenes', 'stück', 'stücke', 'stk', 'scheibe', 'scheiben', 'würfel', 'würfeli', 'streifen', 'stängel', 'stiel', 'stiele', 'zweig', 'zweige', 'blätter', 'blatt', 'zerdrückt', 'zerdrückte', 'zerdrückter', 'gepresst', 'gepresste', 'geschält', 'geschälte', 'geschälter', 'geschälten', 'entkernt', 'entkernte', 'entkernten', 'gewaschen', 'gewaschene', 'gewaschenen', 'gerüstet', 'gerüstete', 'gerüsteten', 'geraspelt', 'geraspelte', 'geraspelter', 'gerieben', 'gehackt', 'gewürfelt', 'geschnitten', 'gemahlen', 'zerkleinert', 'zerkleinerte', 'abgetropft', 'abgetropfte', 'abgetropften', 'gekocht', 'gekochte', 'gekochten', 'roh', 'rohe', 'rohen', 'natur', 'naturell', 'weiss', 'weisse', 'weisser', 'weissen', 'hell', 'helle', 'heller', 'hellen', 'gelb', 'gelbe', 'gelber', 'gelben', 'orangen', 'gross', 'kleingehackt', 'kleingehackte', 'fein gehackt', 'fein gehackte']);

function nutAliasKeys(rawName) {
  let s = String(rawName || '').toLowerCase().normalize('NFC');
  const keys = [];
  const push = (k) => { k = (k || '').trim(); if (k && !keys.includes(k)) keys.push(k); };
  const clean = (t) => t.replace(/-/g, ' ').replace(/[*!?"':;]/g, ' ').replace(/[.\/]/g, ' ').replace(/\d+([.,]\d+)?\s*(%|g|kg|ml|dl|l)?\b/g, ' ').replace(/\s+/g, ' ').trim();
  const forParts = (text) => {
    // Alternativen ("Pancetta oder Guanciale") einzeln pruefen, die erste zuerst
    const parts = text.split(/\s+(?:oder|bzw\.?|beziehungsweise|sowie|und\/oder)\s+|\s+\/\s+/);
    parts.forEach((p) => {
      const flat = clean(p);
      push(flat);
      const tokens = flat.split(' ').filter(Boolean);
      const kept = tokens.filter((t) => !NUTRITION_ALIAS_DROP_WORDS.has(t));
      push(kept.join(' '));
      push(kept.filter((t) => !/^(rot|rote|roter|rotes|roten|grün|grüne|grüner|grünes|grünen)$/.test(t)).join(' '));
      if (kept.length > 1) { push(kept[kept.length - 1]); push(kept[0]); }
    });
  };
  // 1) Inhalt der Klammer als Zusatz zum Hauptwort: "Hackfleisch (Rind)" -> "hackfleisch rind"
  const paren = /\(([^)]*)\)/.exec(s);
  const noParen = s.replace(/\([^)]*\)/g, ' ');
  if (paren) {
    const inner = clean(paren[1]);
    const head = clean(noParen.split(',')[0]);
    if (inner && inner.split(' ').length <= 2 && head) push((head + ' ' + inner).trim());
  }
  // Englische Zeile: uebersetzt zuerst pruefen
  const en = (typeof nutTranslateEn === 'function') ? nutTranslateEn(noParen.split(',')[0]) : null;
  if (en) { const before = keys.length; forParts(en); const added = keys.splice(before); keys.unshift(...added); }
  forParts(noParen.split(',')[0]);
  return keys;
}
function nutSingularVariants(k) {
  const out = [k];
  for (const suf of ['en', 'n', 'e', 's']) if (k.length > 4 && k.endsWith(suf)) out.push(k.slice(0, -suf.length));
  if (k.endsWith('ü' + 'en')) out.push(k.slice(0, -3) + 'u');
  return out;
}

let _nutAliasIndex = null;
function nutAliasIndex() {
  if (_nutAliasIndex) return _nutAliasIndex;
  const idx = { food: new Map(), nonCaloric: new Set(NUTRITION_NON_CALORIC_TERMS), negligible: new Set(NUTRITION_NEGLIGIBLE_TERMS.map((t) => t.trim())) };
  for (const [terms, target, approx] of NUTRITION_ALIAS_TABLE) for (const t of terms) if (!idx.food.has(t)) idx.food.set(t, { target, approx: approx === 'ca' });
  _nutAliasIndex = idx;
  return idx;
}

/* Sucht den Namen im Alias-Index. Liefert { kind: 'food', target } | { kind: 'nonCaloric' } | { kind: 'negligible' } | null.
   Reihenfolge: genaue Varianten zuerst (z.B. "rote peperoni"), dann gekuerzte. */
function lookupNutritionAlias(rawName) {
  const idx = nutAliasIndex();
  const keys = nutAliasKeys(rawName);
  for (const key of keys) {
    for (const v of nutSingularVariants(key)) {
      if (idx.food.has(v)) { const e = idx.food.get(v); return { kind: 'food', target: e.target, approx: e.approx, key: v }; }
      if (idx.nonCaloric.has(v)) return { kind: 'nonCaloric', key: v };
      if (idx.negligible.has(v)) return { kind: 'negligible', key: v };
    }
  }
  return null;
}

/* Liefert den Datensatz zum Alias-Ziel (genauer Name, sonst erster Name, der so beginnt). */
async function findSwissFoodByExactName(target) {
  const foods = await getSwissFoodsCached();
  const t = target.toLowerCase();
  return foods.find((f) => f.name.toLowerCase() === t) || foods.find((f) => f.name.toLowerCase().startsWith(t)) || null;
}

async function resolveNutritionAlias(rawName) {
  const hit = lookupNutritionAlias(rawName);
  if (!hit) return null;
  // Salz im Koch-/Nudelwasser gelangt praktisch nicht ins Essen: nicht mitrechnen
  if (hit.kind === 'food' && /\bsalz\b/.test(hit.key || '') && /(nudel|koch|salz)wasser|zum kochen/i.test(rawName)) return { kind: 'nonCaloric', key: hit.key };
  if (hit.kind !== 'food') return hit;
  const food = await findSwissFoodByExactName(hit.target);
  return food ? { kind: 'food', food, key: hit.key, approx: !!hit.approx } : null;
}


/* ---------- Englische Rezepte (z. B. Instagram): Begriffe ins Deutsche uebersetzen ---------- */
const NUTRITION_EN_DE = [
  ['all-purpose flour', 'weissmehl'], ['all purpose flour', 'weissmehl'], ['plain flour', 'weissmehl'], ['whole wheat flour', 'vollkornmehl'], ['flour', 'mehl'],
  ['olive oil', 'olivenöl'], ['vegetable oil', 'rapsöl'], ['canola oil', 'rapsöl'], ['sunflower oil', 'sonnenblumenöl'], ['coconut oil', 'kokosöl'], ['sesame oil', 'sesamöl'], ['cooking oil', 'öl'], ['oil', 'öl'],
  ['ground beef', 'rinderhackfleisch'], ['minced beef', 'rinderhackfleisch'], ['ground pork', 'hackfleisch schwein'], ['ground turkey', 'hackfleisch'], ['ground meat', 'hackfleisch'], ['minced meat', 'hackfleisch'],
  ['chicken breast', 'pouletbrust'], ['chicken breasts', 'pouletbrust'], ['chicken thighs', 'pouletschenkel'], ['chicken thigh', 'pouletschenkel'], ['chicken', 'poulet'],
  ['beef steak', 'rindfleisch'], ['steak', 'rindsfilet'], ['beef', 'rindfleisch'], ['pork chops', 'schweinskoteletts'], ['pork', 'schweinefleisch'], ['bacon', 'bacon'], ['ham', 'schinken'], ['sausages', 'bratwurst'], ['sausage', 'bratwurst'],
  ['salmon fillet', 'lachsfilet'], ['salmon', 'lachs'], ['shrimp', 'crevetten'], ['prawns', 'crevetten'], ['tuna', 'thon'],
  ['cream cheese', 'frischkäse'], ['heavy cream', 'rahm'], ['whipping cream', 'rahm'], ['double cream', 'rahm'], ['sour cream', 'sauerrahm'], ['cream', 'rahm'], ['greek yogurt', 'joghurt'], ['yogurt', 'joghurt'], ['yoghurt', 'joghurt'],
  ['parmesan cheese', 'parmesan'], ['cheddar cheese', 'cheddar'], ['mozzarella cheese', 'mozzarella'], ['feta cheese', 'feta'], ['goat cheese', 'ziegenkäse'], ['cheese', 'käse'], ['butter', 'butter'], ['milk', 'milch'], ['buttermilk', 'buttermilch'],
  ['eggs', 'eier'], ['egg yolks', 'eigelb'], ['egg yolk', 'eigelb'], ['egg whites', 'eiweiss'], ['egg white', 'eiweiss'], ['egg', 'ei'],
  ['granulated sugar', 'zucker'], ['brown sugar', 'brauner zucker'], ['powdered sugar', 'puderzucker'], ['icing sugar', 'puderzucker'], ['confectioners sugar', 'puderzucker'], ['sugar', 'zucker'], ['honey', 'honig'], ['maple syrup', 'ahornsirup'],
  ['baking powder', 'backpulver'], ['baking soda', 'natron'], ['vanilla extract', 'vanilleextrakt'], ['yeast', 'hefe'], ['cornstarch', 'maisstärke'], ['corn starch', 'maisstärke'], ['breadcrumbs', 'paniermehl'], ['bread crumbs', 'paniermehl'],
  ['salt', 'salz'], ['black pepper', 'pfeffer'], ['pepper', 'pfeffer'], ['cinnamon', 'zimt'], ['cumin', 'kreuzkümmel'], ['oregano', 'oregano'], ['thyme', 'thymian'], ['rosemary', 'rosmarin'], ['bay leaf', 'lorbeerblatt'], ['chili flakes', 'chiliflocken'], ['cayenne pepper', 'cayennepfeffer'], ['nutmeg', 'muskat'],
  ['turmeric', 'kurkuma'], ['curry powder', 'currypulver'], ['chili powder', 'chilipulver'], ['garlic powder', 'knoblauchpulver'], ['onion powder', 'zwiebelpulver'], ['smoked paprika', 'paprikapulver'], ['paprika powder', 'paprikapulver'], ['ground cumin', 'kreuzkümmel'], ['ground ginger', 'ingwerpulver'], ['baby spinach', 'spinat'], ['coconut cream', 'kokosmilch'],
  ['garlic cloves', 'knoblauchzehe'], ['cloves garlic', 'knoblauchzehe'], ['garlic', 'knoblauch'], ['onions', 'zwiebeln'], ['onion', 'zwiebel'], ['red onion', 'rote zwiebel'], ['green onions', 'frühlingszwiebeln'], ['spring onions', 'frühlingszwiebeln'], ['scallions', 'frühlingszwiebeln'], ['shallots', 'schalotten'],
  ['chopped tomatoes', 'gehackte tomaten'], ['canned tomatoes', 'gehackte tomaten'], ['diced tomatoes', 'gehackte tomaten'], ['crushed tomatoes', 'passierte tomaten'], ['tomato paste', 'tomatenmark'], ['tomato sauce', 'tomatensauce'], ['cherry tomatoes', 'cherrytomaten'], ['tomatoes', 'tomaten'], ['tomato', 'tomate'],
  ['potatoes', 'kartoffeln'], ['potato', 'kartoffel'], ['sweet potatoes', 'süsskartoffeln'], ['sweet potato', 'süsskartoffel'], ['carrots', 'karotten'], ['carrot', 'karotte'], ['celery', 'stangensellerie'], ['bell pepper', 'peperoni'], ['bell peppers', 'peperoni'], ['red pepper', 'rote peperoni'], ['green pepper', 'grüne peperoni'], ['zucchini', 'zucchetti'], ['courgette', 'zucchetti'], ['eggplant', 'aubergine'], ['aubergine', 'aubergine'],
  ['mushrooms', 'champignons'], ['mushroom', 'champignon'], ['spinach', 'spinat'], ['broccoli', 'broccoli'], ['cauliflower', 'blumenkohl'], ['cabbage', 'weisskohl'], ['lettuce', 'kopfsalat'], ['cucumber', 'gurke'], ['corn', 'mais'], ['peas', 'erbsen'], ['green beans', 'grüne bohnen'], ['pumpkin', 'kürbis'], ['avocado', 'avocado'], ['lemon juice', 'zitronensaft'], ['lime juice', 'zitronensaft'], ['lemon', 'zitrone'], ['lime', 'limette'], ['orange', 'orange'], ['apples', 'äpfel'], ['apple', 'apfel'], ['bananas', 'bananen'], ['banana', 'banane'], ['strawberries', 'erdbeeren'], ['blueberries', 'heidelbeeren'], ['raspberries', 'himbeeren'],
  ['parsley', 'petersilie'], ['basil', 'basilikum'], ['cilantro', 'koriander'], ['coriander', 'koriander'], ['ginger', 'ingwer'], ['chives', 'schnittlauch'],
  ['rice', 'reis'], ['pasta', 'pasta'], ['spaghetti', 'spaghetti'], ['noodles', 'nudeln'], ['oats', 'haferflocken'], ['rolled oats', 'haferflocken'], ['quinoa', 'quinoa'], ['couscous', 'couscous'], ['bread', 'brot'], ['tortillas', 'tortillas'],
  ['chickpeas', 'kichererbsen'], ['kidney beans', 'kidneybohnen'], ['black beans', 'bohnen'], ['white beans', 'weisse bohnen'], ['lentils', 'linsen'], ['tofu', 'tofu'],
  ['almonds', 'mandeln'], ['walnuts', 'baumnüsse'], ['hazelnuts', 'haselnüsse'], ['peanuts', 'erdnüsse'], ['peanut butter', 'erdnussbutter'], ['cashews', 'cashewnüsse'], ['pine nuts', 'pinienkerne'], ['sesame seeds', 'sesam'], ['sunflower seeds', 'sonnenblumenkerne'], ['chia seeds', 'chiasamen'], ['flaxseed', 'leinsamen'],
  ['dark chocolate', 'dunkle schokolade'], ['chocolate chips', 'schokoladentropfen'], ['chocolate', 'schokolade'], ['cocoa powder', 'kakaopulver'], ['cocoa', 'kakao'], ['jam', 'konfitüre'],
  ['soy sauce', 'sojasauce'], ['worcestershire sauce', 'worcestersauce'], ['ketchup', 'ketchup'], ['mustard', 'senf'], ['mayonnaise', 'mayonnaise'], ['vinegar', 'essig'], ['balsamic vinegar', 'balsamico'], ['white wine', 'weisswein'], ['red wine', 'rotwein'], ['wine', 'wein'], ['beer', 'bier'], ['vegetable broth', 'gemüsebouillon'], ['chicken broth', 'hühnerbouillon'], ['chicken stock', 'hühnerbouillon'], ['beef broth', 'fleischbouillon'], ['stock', 'gemüsebouillon'], ['broth', 'gemüsebouillon'], ['water', 'wasser'], ['coconut milk', 'kokosmilch'],
];
const NUTRITION_EN_SET = (() => { const m = new Map(); NUTRITION_EN_DE.forEach(([en, de]) => m.set(en, de)); return m; })();
const NUTRITION_EN_MARKERS = /\b(cup|cups|tbsp|tsp|of|the|and|with|fresh|chopped|diced|minced|sliced|ground|large|small|medium|cloves?|can|cans|to taste|melted|softened|grated|shredded|boneless|skinless|extra virgin)\b/i;

/* Uebersetzt eine englische Zutatenzeile in deutsche Stichwoerter (laengste Wendung zuerst).
   Nur wenn ein englisches Signalwort oder ein bekanntes englisches Zutatenwort vorkommt. */
function nutTranslateEn(text) {
  const low = String(text || '').toLowerCase();
  if (/[äöüß]/.test(low)) return null;
  const words = low.replace(/[(),]/g, ' ').replace(/\s+/g, ' ').trim();
  let hit = false; const out = [];
  const toks = words.split(' ');
  for (let i = 0; i < toks.length; ) {
    let done = false;
    for (let n = Math.min(3, toks.length - i); n >= 1; n--) {
      const ph = toks.slice(i, i + n).join(' ');
      if (NUTRITION_EN_SET.has(ph) && (n > 1 || ph.length > 3 || NUTRITION_EN_MARKERS.test(words))) { out.push(NUTRITION_EN_SET.get(ph)); i += n; done = true; hit = true; break; }
    }
    if (!done) { i++; }
  }
  return hit ? out.join(' ') : null;
}

/* ---------- Zutatenzeile fuer die Naehrwertberechnung vorbereiten ----------
   Fasst typische Import-Formen zusammen: "Saft von 1/2 Zitrone", "Abrieb einer Zitrone",
   "1 Becher Sahne (200 ml)", "ein Schuss Weisswein", "Pouletbrustfilets (ca. 600 g)". Das Rezept selbst
   bleibt unveraendert; nur die Berechnung nutzt die zusammengefasste Form. */
function nutParseFraction(t) {
  t = String(t || '').trim().toLowerCase();
  if (!t) return null;
  if (/^(einer?|eine|ein|eines)$/.test(t)) return 1;
  if (/^halb/.test(t)) return 0.5;
  const fr = /^(\d+)\s*\/\s*(\d+)$/.exec(t); if (fr) return fr[2] > 0 ? fr[1] / fr[2] : null;
  const n = parseFloat(t.replace(',', '.')); return isNaN(n) ? null : n;
}
function nutPrepareIngredient(ing) {
  let amount = ing.amount, unit = String(ing.unit || '').trim(), name = String(ing.name || '').trim();
  const noAmount = () => (amount === '' || amount === null || amount === undefined);
  let m;
  // Saft von N Zitrone/Limette/Orange
  if ((m = /^saft\s+(?:von|einer?|eines?|einem)\s*([\d.,\/]+|halben?|einer?|eine)?\s*(zitrone|limette|orange)n?\b/i.exec(name)) || (m = /^saft\s+(?:von\s+)?([\d.,\/]+)\s*(zitrone|limette|orange)n?\b/i.exec(name))) {
    const count = nutParseFraction(m[1]) || 1;
    const fruit = m[2].toLowerCase();
    if (noAmount()) { amount = count * (fruit === 'orange' ? 80 : 40); unit = 'ml'; }
    name = fruit === 'orange' ? 'Orangensaft' : 'Zitronensaft';
    return { amount, unit, name };
  }
  if (/^sellerie$/i.test(name) && /^(stängel|stangen?|stiel|stiele|stalks?)$/i.test(unit)) name = 'Stangensellerie';
  if (/^(abrieb|schale|zeste|zesten|abgeriebene\s+schale)\b/i.test(name)) return { amount: '', unit: '', name: 'Zitronenschale' };
  // ein Schuss / eine Prise / eine Handvoll / ein Bund
  if ((m = /^(?:ein(?:en|e|er)?|einige|etwas)\s+(schuss|spritzer|prise|handvoll|bund|stück|scheibe|zweig|stängel)\s+(.*)$/i.exec(name)) && noAmount()) { amount = 1; unit = m[1]; name = m[2]; }
  // Mengenangabe in Klammern: "(200 ml)", "(ca. 600 g)"
  const sz = /\((?:ca\.?\s*|etwa\s*)?(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l|dl|cl)\.?\)/i.exec(name);
  if (sz) {
    const v = parseFloat(sz[1].replace(',', '.')), u = sz[2].toLowerCase();
    const containerish = /^(dose|dosen|glas|gläser|becher|packung|packungen|pack|pck|pkg|päckchen|päckli|beutel|flasche|flaschen|tube|can|cans|jar|jars|package|tetra|karton)$/i.test(unit);
    const amt = typeof amount === 'number' ? amount : parseAmount(amount);
    if (noAmount() && !unit) { amount = v; unit = u; }
    else if (containerish && amt !== null && !isNaN(amt)) { amount = amt * v; unit = u; }
    name = name.replace(sz[0], ' ').replace(/\s+/g, ' ').trim();
  }
  { const en = nutTranslateEn(name.split(',')[0]); if (en) name = en; }   // englische Zeile: Berechnung arbeitet mit dem deutschen Begriff
  return { amount, unit, name };
}
