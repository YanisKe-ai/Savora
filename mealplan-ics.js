/* v90: Wochenplan als Kalenderdatei (.ics, RFC 5545). Reine Logik plus Teilen/Herunterladen.
   Kein Abo (bewusst): es wird nur eine Datei erzeugt, die der Nutzer in seinen Kalender legt.

   icsBuild(days, recipes, opts)
     days     Liste von Tagen. Jeder Tag: { key: 'JJJJ-MM-TT', entries: [Wochenplan-Eintraege] }
              oder nur der Datumsschluessel (dann werden die Eintraege mit planEntriesFor gelesen).
     recipes  Liste der Rezepte (state.recipes), fuer Titel und Portionen.
     opts     { now: Date (fuer DTSTAMP, Tests), siteUrl: string }
   Mahlzeit mit Zeitfenster: Fruehstueck 8:00, Mittagessen 12:00, Abendessen 18:30, je 1 Stunde (Europe/Zurich).
   Alles andere (ohne oder eigene Mahlzeit): Ganztagstermin. Notizen sind eigene Termine. */

const ICS_MEAL_TIMES = {
  breakfast: { h: 8, m: 0 },
  lunch: { h: 12, m: 0 },
  dinner: { h: 18, m: 30 },
};
const ICS_TZ = 'Europe/Zurich';

function icsEscape(text) {
  return String(text == null ? '' : text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

function icsUtf8Len(ch) {
  const c = ch.codePointAt(0);
  return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
}

/* Faltung nach RFC 5545: Zeilen hoechstens 75 Oktette; Fortsetzung beginnt mit einem Leerzeichen.
   Zeichen (auch Umlaute, Emojis) werden nie in der Mitte getrennt. */
function icsFold(line) {
  const out = [];
  let cur = '';
  let len = 0;
  let limit = 75;
  for (const ch of line) {
    const n = icsUtf8Len(ch);
    if (len + n > limit) {
      out.push(cur);
      cur = ' ';
      len = 1;
      limit = 75;
    }
    cur += ch;
    len += n;
  }
  out.push(cur);
  return out.join('\r\n');
}

function icsPad(n, w) { return String(n).padStart(w || 2, '0'); }

function icsUtcStamp(d) {
  return d.getUTCFullYear() + icsPad(d.getUTCMonth() + 1) + icsPad(d.getUTCDate()) + 'T'
    + icsPad(d.getUTCHours()) + icsPad(d.getUTCMinutes()) + icsPad(d.getUTCSeconds()) + 'Z';
}

function icsDateOnly(key) { return String(key).replace(/-/g, ''); }

function icsNextDay(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  const nd = new Date(Date.UTC(y, m - 1, d + 1));
  return nd.getUTCFullYear() + icsPad(nd.getUTCMonth() + 1) + icsPad(nd.getUTCDate());
}

function icsLocal(key, h, m) { return icsDateOnly(key) + 'T' + icsPad(h) + icsPad(m) + '00'; }

const ICS_VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:' + ICS_TZ,
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

function icsBuild(days, recipes, opts) {
  opts = opts || {};
  const stamp = icsUtcStamp(opts.now instanceof Date ? opts.now : new Date());
  const site = opts.siteUrl || (typeof CLOUD_SITE_URL === 'string' ? CLOUD_SITE_URL : 'https://yaniske-ai.github.io/Savora/');
  const byId = new Map((recipes || []).map(r => [r.id, r]));
  const events = [];
  let usesTz = false;
  const seenUid = new Map();
  const uidFor = (entry, key, n) => {
    let base = String(entry.id || `${key}-${n}`).replace(/[^A-Za-z0-9._-]/g, '-');
    const c = seenUid.get(base) || 0;
    seenUid.set(base, c + 1);
    if (c) base += '-' + c;   // doppelte IDs bleiben trotzdem eindeutig
    return base + '@savora';
  };
  (days || []).forEach(day => {
    const key = typeof day === 'string' ? day : day && day.key;
    if (!key) return;
    const entries = typeof day === 'string'
      ? (typeof planEntriesFor === 'function' ? planEntriesFor(key) : [])
      : (Array.isArray(day.entries) ? day.entries : []);
    entries.forEach((e, n) => {
      if (!e) return;
      const isNote = e.type === 'note';
      let summary, desc = [];
      if (isNote) {
        summary = String(e.text || '').trim();
        if (!summary) return;
      } else {
        const r = byId.get(e.recipeId);
        if (!r) return;
        summary = String(r.title || 'Ohne Titel');
        const sv = Number(e.servings) > 0 ? Number(e.servings) : Number(r.servings) > 0 ? Number(r.servings) : 0;
        if (sv) desc.push('Portionen: ' + String(sv).replace('.', ','));
        desc.push(site);
      }
      const t = ICS_MEAL_TIMES[e.meal];
      const lines = ['BEGIN:VEVENT', 'UID:' + uidFor(e, key, n), 'DTSTAMP:' + stamp];
      if (t) {
        usesTz = true;
        const endH = t.h + 1;
        lines.push(`DTSTART;TZID=${ICS_TZ}:${icsLocal(key, t.h, t.m)}`);
        lines.push(`DTEND;TZID=${ICS_TZ}:${icsLocal(key, endH, t.m)}`);
      } else {
        lines.push('DTSTART;VALUE=DATE:' + icsDateOnly(key));
        lines.push('DTEND;VALUE=DATE:' + icsNextDay(key));
      }
      lines.push('SUMMARY:' + icsEscape(summary));
      if (desc.length) lines.push('DESCRIPTION:' + icsEscape(desc.join('\n')));
      lines.push('END:VEVENT');
      events.push(...lines);
    });
  });
  const head = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Savora//Wochenplan//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Savora Wochenplan'];
  const all = head.concat(usesTz ? ICS_VTIMEZONE : [], events, ['END:VCALENDAR']);
  return all.map(icsFold).join('\r\n') + '\r\n';
}

/* ISO-Kalenderwoche eines Datumsschluessels */
function icsWeekNumber(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dow);
  const y0 = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return Math.ceil(((dt - y0) / 86400000 + 1) / 7);
}
function icsFileName(firstKey) { return 'savora-wochenplan-' + icsWeekNumber(firstKey) + '.ics'; }

function icsWeekDays() {
  const start = state.weekStart;
  return Array.from({ length: 7 }, (_, i) => {
    const key = fmtDateKey(addDays(start, i));
    return { key, entries: typeof plannedItemsFor === 'function' ? plannedItemsFor(key) : [] };
  });
}

/* Teilen (wenn der Browser Dateien teilen kann), sonst Download. */
async function icsDeliver(text, name) {
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  if (typeof SavoraNative !== 'undefined' && SavoraNative.isNative) {
    try { await SavoraNative.shareFile(blob, name, 'Savora Wochenplan'); }
    catch (err) { if (!(SavoraNative.isCancel && SavoraNative.isCancel(err))) showToast('Kalenderdatei konnte nicht geteilt werden', 'error'); }
    return 'native';
  }
  try {
    const file = new File([blob], name, { type: 'text/calendar' });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
      await navigator.share({ files: [file], title: 'Savora Wochenplan' });
      return 'share';
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return 'cancel';   // Nutzer hat das Teilen-Fenster geschlossen
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  showToast('Kalenderdatei wird heruntergeladen');
  return 'download';
}

async function icsExportWeek() {
  const days = icsWeekDays();
  const count = days.reduce((n, d) => n + d.entries.length, 0);
  if (!count) { showToast('Diese Woche ist nichts geplant', 'error'); return 'empty'; }
  return icsDeliver(icsBuild(days, state.recipes), icsFileName(days[0].key));
}

/* Aktionskette (actions-v2.js, durch H2 eingehaengt): data-action="mealplan-ics" */
async function handleIcsAction(action) {
  if (action !== 'mealplan-ics') return false;
  await icsExportWeek();
  return true;
}
