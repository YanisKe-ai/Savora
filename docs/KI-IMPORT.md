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

```
Lies das Rezept unter diesem Link: <LINK>
Gib das Rezept ausschliesslich als EIN JSON-Codeblock im Format "savora-recipe", Version 1, zurück. Kein Text davor oder danach.
Felder: format ("savora-recipe"), version (1), title, yield {count, kind ("pieces" oder "portions"), label} oder null, time {totalMinutes, activeMinutes, restMinutes, cookMinutes}, difficulty ("einfach", "mittel", "anspruchsvoll" oder null), source {url, name}, ingredients, steps, notes.
Zutat: {group, name, amount, unit, note, optional}. amount ist {"type":"exact","value":250}, {"type":"range","min":200,"max":300}, {"type":"qualitative","text":"nach Geschmack"} oder null.
Schritt: {text, variants:[{label, text}]}. notes ist eine Liste von Texten.
Alle Zahlen sind echte Zahlen (200, nicht "200"), Minuten sind ganze Zahlen.
Fehlende oder nicht genannte Werte sind null. Erfinde nichts: keine Gesamtzeit, keine Schwierigkeit, keine Menge, die nicht im Rezept steht.
Utensilien (Förmchen, Backblech, Schüssel) sind keine Zutaten.
Alternative Garmethoden (Airfryer, Backofen) gehören als variants in den passenden Schritt, nicht als eigene Schritte.
Bereiche wie "200 bis 300 g" bleiben ein range, nicht mitteln. Zubereitungshinweise wie "gerieben" gehören in note, nicht in den Namen.
Übernimm Text sinngemäss auf Deutsch, aber ändere keine Mengen, Zeiten oder Temperaturen.
```
