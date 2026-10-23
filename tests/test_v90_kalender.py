"""v90 Punkt 6: Wochenplan als Kalenderdatei (mealplan-ics.js). Pruefung nach RFC 5545: CRLF, Faltung auf 75 Oktette,
Escaping (, ; \\ Zeilenumbruch), UID entry.id@savora, DTSTAMP in UTC, Zeitfenster mit TZID=Europe/Zurich + VTIMEZONE
(8:00, 12:00, 18:30, je 1 Stunde), sonst Ganztag VALUE=DATE, Notizen als eigener Termin, Portionen + Link, Dateiname mit KW,
Download (kein Teilen im Testbrowser) und leere Woche."""
import asyncio, os, re, sys
os.environ.setdefault('SAVORA_TEST_PORT', '49062')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
FAIL = []
def check(name, cond, info=''):
    print(('OK   ' if cond else 'FEHL ') + name, info)
    if not cond: FAIL.append(name)

BUILD = """() => {
  const long = 'Käsespätzle mit Röstzwiebeln, Lauch; und \\\\ Rahm ' + 'ä'.repeat(60) + ' Ende';
  const recipes = [{ id: 'r1', title: long, servings: 4 }, { id: 'r2', title: 'Müesli', servings: 1 }];
  const days = [
    { key: '2026-10-26', entries: [
      { id: 'e1', recipeId: 'r2', meal: 'breakfast', servings: 2 },
      { id: 'e2', recipeId: 'r1', meal: 'lunch' },
      { id: 'e3', recipeId: 'r1', meal: 'dinner', servings: 3 },
      { id: 'n1', type: 'note', text: 'Reste, Auswärts; Pizza\\nmit Freunden', meal: 'dinner' },
      { id: 'e5', recipeId: 'r2' },
      { id: 'e6', recipeId: 'fehlt', meal: 'lunch' } ] },
    { key: '2026-12-31', entries: [{ id: 'n2', type: 'note', text: 'Silvester' }] } ];
  return icsBuild(days, recipes, { now: new Date(Date.UTC(2026, 9, 23, 8, 5, 9)), siteUrl: 'https://example.test/Savora/' });
}"""

def unfold(txt): return re.sub(r'\r\n[ \t]', '', txt)

async def main():
    async with async_playwright() as p:
        browser, ctx = await open_ctx(p)
        page = await ctx.new_page()
        errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
        await goto(page)
        ics = await page.evaluate(BUILD)
        raw_lines = ics.split('\r\n')
        check('Zeilenende CRLF, nie ein einzelnes LF', '\n' not in ics.replace('\r\n', '') and ics.endswith('\r\n'))
        check('Beginnt mit BEGIN:VCALENDAR, endet mit END:VCALENDAR', raw_lines[0] == 'BEGIN:VCALENDAR' and raw_lines[-2] == 'END:VCALENDAR')
        check('VERSION:2.0 und PRODID', 'VERSION:2.0' in raw_lines and any(l.startswith('PRODID:') for l in raw_lines))
        too_long = [l for l in raw_lines if len(l.encode('utf-8')) > 75]
        check('Keine Zeile laenger als 75 Oktette (mit Umlauten)', not too_long, str([len(l.encode()) for l in too_long]))
        check('Gefaltete Zeilen beginnen mit Leerzeichen', any(l.startswith(' ') for l in raw_lines))
        check('Keine UTF-8-Zeichen in der Mitte getrennt', ics.encode('utf-8').decode('utf-8') == ics and '�' not in ics)
        u = unfold(ics)
        check('Escaping: Komma, Semikolon, Backslash im Titel', 'Käsespätzle mit Röstzwiebeln\\, Lauch\; und \\\\ Rahm' in u)
        check('Escaping: Zeilenumbruch in Notiz wird \\n', 'SUMMARY:Reste\\, Auswärts\; Pizza\\nmit Freunden' in u)
        check('Zeitfenster Fruehstueck 8:00-9:00 Europe/Zurich', 'DTSTART;TZID=Europe/Zurich:20261026T080000' in u and 'DTEND;TZID=Europe/Zurich:20261026T090000' in u)
        check('Zeitfenster Mittag 12:00-13:00', 'DTSTART;TZID=Europe/Zurich:20261026T120000' in u and 'DTEND;TZID=Europe/Zurich:20261026T130000' in u)
        check('Zeitfenster Abend 18:30-19:30', 'DTSTART;TZID=Europe/Zurich:20261026T183000' in u and 'DTEND;TZID=Europe/Zurich:20261026T193000' in u)
        check('Ohne Mahlzeit: Ganztag VALUE=DATE, Ende am Folgetag', 'DTSTART;VALUE=DATE:20261026' in u and 'DTEND;VALUE=DATE:20261027' in u)
        check('Jahreswechsel: Ganztag 31.12. endet am 1.1.', 'DTSTART;VALUE=DATE:20261231' in u and 'DTEND;VALUE=DATE:20270101' in u)
        check('VTIMEZONE Europe/Zurich mit Sommer- und Winterzeit', 'BEGIN:VTIMEZONE' in u and 'TZID:Europe/Zurich' in u and 'BEGIN:DAYLIGHT' in u and 'BEGIN:STANDARD' in u and 'BYDAY=-1SU' in u)
        check('DTSTAMP in UTC (Z)', set(re.findall(r'DTSTAMP:(\S+)', u)) == {'20261023T080509Z'})
        uids = re.findall(r'UID:(\S+)', u)
        check('UID entry.id@savora, alle verschieden', 'e1@savora' in uids and 'n1@savora' in uids and len(uids) == len(set(uids)), str(uids))
        check('Rezept mit unbekannter ID wird uebersprungen', 'e6@savora' not in uids)
        check('Notiz mit Mahlzeit hat Zeitfenster, ohne Mahlzeit Ganztag', 'SUMMARY:Silvester' in u and u.index('UID:n1@savora') < u.index('DTSTART;TZID=Europe/Zurich:20261026T183000', u.index('UID:n1@savora')) < u.index('UID:e5@savora'))
        check('DESCRIPTION: Portionen (Eintrag vor Rezept) und Link', 'DESCRIPTION:Portionen: 2\\nhttps://example.test/Savora/' in u and 'DESCRIPTION:Portionen: 4\\nhttps://example.test/Savora/' in u and 'Portionen: 3' in u)
        check('Anzahl Termine = Anzahl Eintraege (ohne uebersprungene)', u.count('BEGIN:VEVENT') == 6 == u.count('END:VEVENT'))
        check('Ohne Termine keine VTIMEZONE noetig, aber gueltiger Kalender', await page.evaluate("""() => { const s = icsBuild([{ key: '2026-10-26', entries: [{ id: 'x', type: 'note', text: 'Nur Notiz' }] }], []); return s.includes('BEGIN:VEVENT') && !s.includes('VTIMEZONE') && s.endsWith('END:VCALENDAR\\r\\n'); }"""))
        check('Datumsschluessel allein: Eintraege kommen aus planEntriesFor', await page.evaluate("""async () => { await savePlanEntries('2026-11-02', [{ id: 'q1', type: 'note', text: 'Aus Plan' }]); return icsBuild(['2026-11-02'], []).includes('SUMMARY:Aus Plan'); }"""))
        check('Kalenderwoche: 26.10.2026 = KW 44, 4.1.2027 = KW 1, 1.1.2027 = KW 53', await page.evaluate("icsWeekNumber('2026-10-26') === 44 && icsWeekNumber('2027-01-04') === 1 && icsWeekNumber('2027-01-01') === 53"))
        check('Dateiname savora-wochenplan-<KW>.ics', await page.evaluate("icsFileName('2026-10-26') === 'savora-wochenplan-44.ics'"))

        # Ganzer Weg: Wochenplan mit Seed-Daten, Aktion -> Download
        await page.evaluate(open(SEED_PATH).read()); await page.wait_for_timeout(500)
        check('handleIcsAction ignoriert fremde Aktionen', await page.evaluate("handleIcsAction('anderes').then(r => r === false)"))
        async with page.expect_download(timeout=10000) as dl:
            r = await page.evaluate("handleIcsAction('mealplan-ics')")
        d = await dl.value
        path = await d.path()
        txt = open(path, encoding='utf-8').read()
        wk = await page.evaluate("icsWeekNumber(fmtDateKey(state.weekStart))")
        check('Aktion liefert true und laedt eine .ics-Datei', r is True and re.fullmatch(r'savora-wochenplan-%d\.ics' % wk, d.suggested_filename) is not None, d.suggested_filename)
        check('Datei enthaelt die geplanten Seed-Rezepte', 'SUMMARY:Sloppy Joe Buns' in unfold(txt) and 'SUMMARY:Carbonara' in unfold(txt))
        # Leere Woche
        await page.evaluate("state.weekStart = addDays(state.weekStart, 70)")
        got = []
        page.on('download', lambda x: got.append(x))
        r2 = await page.evaluate("icsExportWeek()")
        await page.wait_for_timeout(400)
        check('Leere Woche: kein Download, Hinweis', r2 == 'empty' and not got)
        # Teilen: kann der Browser Dateien teilen, wird geteilt statt heruntergeladen
        await page.evaluate("() => { state.weekStart = addDays(state.weekStart, -70); window.__shared = null; navigator.canShare = () => true; navigator.share = async (d) => { window.__shared = { name: d.files[0].name, type: d.files[0].type, size: d.files[0].size }; }; }")
        res = await page.evaluate("icsExportWeek()")
        sh = await page.evaluate("window.__shared")
        check('Teilen-Weg: navigator.share mit .ics-Datei', res == 'share' and sh and sh['name'].endswith('.ics') and sh['type'] == 'text/calendar' and sh['size'] > 100, str(sh))
        await page.evaluate("() => { navigator.share = async () => { const e = new Error('x'); e.name = 'AbortError'; throw e; }; }")
        check('Teilen abgebrochen: kein Download danach', await page.evaluate("icsExportWeek()") == 'cancel')
        check('Keine Seitenfehler', not errs, str(errs[:3]))
        await browser.close()
    print('\n%d Fehler' % len(FAIL) if FAIL else '\nAlles gruen')
    sys.exit(1 if FAIL else 0)

asyncio.run(main())
