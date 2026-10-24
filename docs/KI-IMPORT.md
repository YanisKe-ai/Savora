# KI-Import: ein Rezept als JSON

Savora kann ein einzelnes Rezept aus strukturiertem JSON einlesen (Format `savora-recipe`, Version 1). Eine externe KI liest dazu den Rezeptlink und liefert das JSON, du fügst es in Savora ein. Savora erkennt das JSON auch, wenn es in einem Markdown-Codeblock steht oder Text davor und danach hat. Vor dem Übernehmen wird alles geprüft; Fehler nennen, was und wo falsch ist.

Regeln der Übernahme:

- Fehlende Angaben bleiben leer. Ausbeute `null` ergibt Portionen 0 (unbekannt), keine Gesamtzeit ergibt Zeit 0 (unbekannt).
- Mengenbereiche bleiben Bereiche (`200-300`), es wird nichts gemittelt oder gerundet.
- Hinweise zur Zutat kommen in Klammern an den Namen, optionale Zutaten bekommen den Zusatz „(optional)“.
- Varianten eines Schritts werden als zusätzliche Zeilen im Schritttext gespeichert.
- Aus dem JSON werden keine IDs, Zeitstempel, Favoriten, Sammlungen oder Bilder übernommen.
- Von der Quelle wird nur die URL gespeichert, `source.name` wird derzeit nicht übernommen.

## Beispiel (gültig)

```json
{
  "format": "savora-recipe",
  "version": 1,
  "title": "Knusprige Kartoffel-Parmesan-Schälchen",
  "yield": { "count": 9, "kind": "pieces", "label": "Schälchen" },
  "time": { "totalMinutes": null, "activeMinutes": null, "restMinutes": null, "cookMinutes": null },
  "difficulty": null,
  "source": { "url": "https://www.franzoesischkochen.de/knusprige-kartoffel-parmesan-schaelchen-essbare-koerbchen-fuer-vorspeisen-aperitif/", "name": "franzoesischkochen.de" },
  "ingredients": [
    { "group": null, "name": "Kartoffeln", "amount": { "type": "range", "min": 200, "max": 300 }, "unit": "g", "note": null, "optional": false },
    { "group": null, "name": "Parmesan", "amount": { "type": "range", "min": 50, "max": 70 }, "unit": "g", "note": "gerieben", "optional": false },
    { "group": null, "name": "Pfeffer", "amount": null, "unit": null, "note": null, "optional": false },
    { "group": null, "name": "Muskatnuss", "amount": null, "unit": null, "note": null, "optional": false }
  ],
  "steps": [
    { "text": "Die Kartoffeln schälen und reiben. (Achtung Finger!)" },
    { "text": "In einer Schüssel die geriebenen Kartoffeln mit dem Parmesan mischen. Mit Pfeffer und Muskatnuss würzen und alles gut umrühren." },
    { "text": "Die Masse in den Mulden verteilen und mit den Fingern gut hineindrücken, sodass kleine Schälchen entstehen. Die Kartoffelmasse sollte fest angedrückt sein." },
    {
      "text": "Backen:",
      "variants": [
        { "label": "Im Airfryer", "text": "25–30 Minuten bei 200 °C" },
        { "label": "Im Backofen", "text": "im vorgeheizten Backofen 30–35 Minuten bei 200 °C Umluft" }
      ]
    }
  ],
  "notes": ["Bitte immer kontrollieren, ob die Schälchen schön knusprig gebacken sind. Falls nötig, noch einmal 5–10 Minuten länger backen."]
}
```

## Prompt für die KI

Dieser Prompt steht in Savora unter «Rezept hinzufügen › Aus Text importieren» zum Kopieren (`SAVORA_KI_PROMPT` in `recipe-json.js`). Den Rezept-Link oder den Rezepttext ans Ende setzen. Getestet mit 12 Rezepten von Schweizer, deutschen und englischen Seiten sowie Social-Media-Texten (`tests/test_v90_ki_prompt.py`).

```
Öffne den Rezept-Link (oder lies den Rezepttext) unten und gib das Rezept für die App Savora als EINEN JSON-Codeblock zurück, ohne Text davor oder danach. Kannst du den Link nicht öffnen, antworte nur: LINK NICHT LESBAR. Erfinde nie ein Rezept.

Form:
{"format":"savora-recipe","version":1,"title":"…","yield":{"count":4,"kind":"portions","label":null},"time":{"totalMinutes":null,"activeMinutes":null,"restMinutes":null,"cookMinutes":null},"difficulty":null,"source":{"url":"…","name":"…"},"ingredients":[{"group":null,"name":"Mehl","amount":{"type":"exact","value":250},"unit":"g","note":null,"optional":false}],"steps":[{"text":"…","variants":[]}],"notes":[]}

Regeln:
- amount: {"type":"exact","value":0.5}, {"type":"range","min":2,"max":3}, {"type":"qualitative","text":"1 Prise"} oder null. Zahlen ohne Anführungszeichen, Brüche als Dezimalzahl.
- unit kurz (g, kg, ml, dl, l, EL, TL, Prise, Pck.). Stückzahlen ohne Einheit: 2 Eier = value 2, unit null. cup, oz, lb so lassen.
- yield: count ganze Zahl (bei Bereich die kleinere), ohne Angabe yield null. kind "pieces" bei Stückzahl (12 Muffins: label "Muffins"), sonst "portions". Bei mehreren Mengenvarianten nur die erste.
- time in ganzen Minuten: activeMinutes = Vorbereitung/Arbeitszeit, cookMinutes = Koch- oder Backzeit, restMinutes = Ruhe-, Geh- oder Kühlzeit, totalMinutes nur wenn genannt.
- Nur was im Rezept steht, Unbekanntes null. Mengen, Zeiten, Temperaturen nie ändern (°F: °C in Klammern dazu). difficulty nur "einfach", "mittel" oder "anspruchsvoll".
- Texte auf Deutsch (Schweiz, ss statt ß). group nur bei Zutatengruppen im Rezept (z. B. "Teig"). Zusätze wie "gehackt" in note.
- Utensilien sind keine Zutaten. variants nur für Alternativen (Backofen oder Airfryer): [{"label":"Airfryer","text":"…"}].

Link oder Text:
```

Savora korrigiert typische Ausrutscher der KI still: Zahlen als Text («250», «0,5», «½»), Mengen als Text («2 bis 3»), Zutaten oder Schritte als einfache Zeilen, Zeiten wie «PT1H30M» oder «20 Min.», Schwierigkeit «leicht», fehlendes `format`/`version`, ein Komma zu viel. Antwortet die KI «LINK NICHT LESBAR», zeigt Savora, wie man stattdessen den Rezepttext verwendet.
