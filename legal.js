/* ---------- Rechtliche und allgemeine Texte ----------
   Alle Angaben, die nur die verantwortliche Person kennt, stehen zentral in LEGAL. Solange ein Wert
   mit "[" beginnt, ist er ein Platzhalter und wird in der App farbig markiert angezeigt.
   Kein Rechtsrat: Vor einer oeffentlichen Veroeffentlichung von einer Fachperson pruefen lassen. */
const APP_VERSION = '0.47.2';   // muss mit der Datei VERSION uebereinstimmen (Test: tests/test_paket2.py)
const LEGAL = {
  name: '[Name der verantwortlichen Person]',
  email: '[Kontakt-E-Mail]',
  place: '[Ort]',
  updated: '30. September 2026',
};
function legalValue(v) {
  const s = String(v || '');
  return s.charAt(0) === '[' ? `<span class="legal-placeholder">${escapeHtml(s)}</span>` : escapeHtml(s);
}
function legalHasPlaceholders() {
  return Object.values(LEGAL).some(v => String(v).charAt(0) === '[');
}
function legalSection(title, inner) {
  return `<div class="settings-group">
    <div class="settings-group-title">${title}</div>
    <div class="settings-group-card settings-group-card--padded legal-card">${inner}</div>
  </div>`;
}
function legalList(items) {
  return `<ul class="legal-list">${items.map(i => `<li>${i}</li>`).join('')}</ul>`;
}

function legalPrivacyHtml() {
  return `
    <p class="legal-stand">Stand: ${escapeHtml(LEGAL.updated)}. Savora ist eine private Beta-Version.</p>
    ${legalSection('Kurz gesagt', legalList([
      'Ohne Anmeldung bleiben alle deine Daten auf diesem Gerät.',
      'Nur wenn du dich unter „Synchronisation“ anmeldest, werden deine Inhalte mit deinen anderen Geräten abgeglichen.',
      'Savora enthält keine Werbung, keine Tracker und keine Analyse-Dienste.',
    ]))}
    ${legalSection('Wer verantwortlich ist', `
      <p>${legalValue(LEGAL.name)}</p>
      <p>Kontakt für alle Fragen zum Datenschutz: ${legalValue(LEGAL.email)}</p>`)}
    ${legalSection('Welche Daten wo liegen', `
      <p><b>Auf deinem Gerät.</b> Rezepte mit Fotos, Notizen, Wochenplan, Einkaufsliste, Sammlungen, Kochfortschritt, Timer und Einstellungen liegen im Speicher des Browsers oder der App. Sie verlassen das Gerät nicht, solange du nicht angemeldet bist und keine Datei teilst.</p>
      <p><b>Mit Konto (Synchronisation).</b> Für die Anmeldung wird deine E-Mail-Adresse gespeichert, das Passwort nur in geschützter Form. Dazu kommen Rezepte, Fotos, Wochenplan, Einkaufsliste, Sammlungen, die Kochbuch-Auswahl und der Zeitpunkt der letzten Änderung. Nur dein Konto kann diese Daten lesen.</p>
      <p><b>Barcode-Suche.</b> Suchst du ein Produkt per Barcode und die Schweizer Nährwertdatenbank hat keinen Treffer, wird die Nummer des Barcodes an Open Food Facts gesendet. Andere Rezeptdaten werden nicht übertragen. Der Dienst sieht dabei technisch bedingt deine IP-Adresse.</p>
      <p><b>Kamera und Fotos.</b> Die Kamera wird nur zum Scannen eines Barcodes und für „Foto scannen“ genutzt. Bei „Foto scannen“ liest die Texterkennung von iOS den Text aus dem Bild. Das läuft auf deinem Gerät, Bilder werden weder gespeichert noch übertragen. Es entsteht nur der erkannte Text, den du prüfst.</p>
      <p><b>Mitteilungen (iOS-App).</b> Die Timer-Meldungen werden auf deinem Gerät geplant. Es gibt keinen Push-Server.</p>
      <p><b>Teilen und Sicherung.</b> Erstellst du ein PDF oder eine Sicherungsdatei und gibst sie weiter, verlässt genau diese Datei dein Gerät.</p>`)}
    ${legalSection('Wo der Dienst betrieben wird', `
      <p>Für die Synchronisation nutzt Savora den Dienst Supabase. Die Daten liegen in der Region Zürich in der Schweiz. Anbieter ist Supabase, Inc. (USA), die Infrastruktur stammt von Amazon Web Services. Ein Zugriff des Anbieters aus dem Ausland lässt sich deshalb nicht völlig ausschliessen.</p>`)}
    ${legalSection('Wozu die Daten dienen', `
      <p>Deine Daten werden nur bearbeitet, um dir Savora bereitzustellen: Speichern, Abgleichen und Anmelden. Die Synchronisation nutzt du freiwillig. Mit der Anmeldung stimmst du dieser Bearbeitung zu, du kannst dich jederzeit abmelden. Deine Daten werden nicht verkauft und nicht für Werbung verwendet. Empfänger sind ausschliesslich der Betreiber des Synchronisationsdienstes (siehe oben) und, nur für Barcodes, Open Food Facts.</p>`)}
    ${legalSection('Aufbewahrung und Löschung', `
      <p>Daten in der Cloud bleiben, bis du sie löschst. Unter „Mehr“, „Synchronisation“, „Konto und Cloud-Daten löschen“ entfernst du dein Konto und alle Cloud-Daten endgültig. Rezepte auf deinem Gerät bleiben dabei erhalten. Sie verschwinden erst, wenn du sie selbst löschst, die Browserdaten leerst oder die App deinstallierst.</p>`)}
    ${legalSection('Deine Rechte', `
      <p>Du kannst Auskunft über deine Daten verlangen sowie deren Berichtigung und Löschung. Eine vollständige Kopie deiner Rezepte erstellst du selbst unter „Sicherung &amp; Wiederherstellung“. Schreib für alles Weitere an ${legalValue(LEGAL.email)}. Du kannst dich zusätzlich beim Eidgenössischen Datenschutz- und Öffentlichkeitsbeauftragten (EDÖB) beschweren.</p>`)}
    ${legalSection('Sicherheit', `
      <p>Die Übertragung zum Synchronisationsdienst ist verschlüsselt, und jedes Konto sieht nur seine eigenen Daten. Die Inhalte sind auf dem Server nicht zusätzlich Ende-zu-Ende verschlüsselt. Wähle deshalb ein Passwort, das du nirgends sonst verwendest.</p>`)}
    ${legalSection('Änderungen', `<p>Ändert sich etwas, passen wir diese Seite und das Datum oben an.</p>`)}`;
}

function legalTermsHtml() {
  return `
    <p class="legal-stand">Stand: ${escapeHtml(LEGAL.updated)}.</p>
    ${legalSection('Beta-Version', `
      <p>Savora befindet sich in einer geschlossenen Testphase. Der Zugang erfolgt auf Einladung. Funktionen können sich ändern, die App kann jederzeit angepasst oder eingestellt werden.</p>`)}
    ${legalSection('Nutzung', `
      <p>Savora ist für die private Nutzung gedacht. Bewahre deine Zugangsdaten sicher auf und gib sie nicht weiter.</p>`)}
    ${legalSection('Deine Inhalte', `
      <p>Deine Rezepte, Fotos und Notizen gehören dir. Du bist dafür verantwortlich, dass du sie speichern und weitergeben darfst. Das gilt vor allem für fremde Rezepttexte und Fotos, die urheberrechtlich geschützt sein können. Savora nutzt deine Inhalte nur, um die App zu betreiben.</p>`)}
    ${legalSection('Sicherung', `
      <p>Erstelle regelmässig eine Sicherungsdatei. In einer Beta-Version kann es zu Fehlern kommen, und die Synchronisation ersetzt keine Sicherung.</p>`)}
    ${legalSection('Nährwerte und Allergene', `
      <p>Alle Nährwerte sind berechnete Schätzwerte ohne Gewähr. Sie sind keine Ernährungs- oder medizinische Beratung. Verlasse dich bei Allergien, Unverträglichkeiten oder Diäten nie auf die Angaben in Savora. Prüfe immer die Verpackung und frage im Zweifel nach.</p>`)}
    ${legalSection('Verfügbarkeit und Haftung', `
      <p>Savora wird ohne Gewähr für ständige Verfügbarkeit oder Fehlerfreiheit zur Verfügung gestellt. Soweit gesetzlich zulässig, wird die Haftung für Datenverlust, Ausfälle und Folgeschäden ausgeschlossen. Die Haftung für Absicht und grobe Fahrlässigkeit bleibt unberührt.</p>`)}
    ${legalSection('Beenden', `
      <p>Du kannst die Nutzung jederzeit beenden und dein Konto samt Cloud-Daten selbst löschen. Bei Missbrauch kann ein Zugang gesperrt werden.</p>`)}
    ${legalSection('Recht und Kontakt', `
      <p>Es gilt Schweizer Recht. Gerichtsstand ist ${legalValue(LEGAL.place)}. Kontakt: ${legalValue(LEGAL.email)}.</p>`)}
    ${legalSection('Änderungen', `<p>Diese Bedingungen können angepasst werden. Das aktuelle Datum steht oben.</p>`)}`;
}

function legalSourcesHtml() {
  return `
    ${legalSection('Schweizer Nährwertdatenbank', `
      <p>Primärquelle für die meisten Zutaten. Herausgeber ist das Bundesamt für Lebensmittelsicherheit und Veterinärwesen (BLV), Quelle naehrwertdaten.ch, Version 7.1 mit 1216 Lebensmitteln. Die Daten sind technisch aufbereitet in Savora eingebettet und funktionieren offline.</p>`)}
    ${legalSection('Open Food Facts', `
      <p>Wird nur genutzt, wenn du ein Produkt per Barcode scannst und es in der Schweizer Datenbank nicht vorkommt. Angaben von Open Food Facts stammen von Herstellern und Mitwirkenden und können lückenhaft oder ungenau sein. Benötigt eine Internetverbindung.</p>
      <p>© Open Food Facts und Mitwirkende, openfoodfacts.org. Die Datenbank steht unter der Open Database License (ODbL) 1.0, die einzelnen Inhalte unter der Database Contents License.</p>`)}
    ${legalSection('USDA FoodData Central', `
      <p>Als weitere Quelle vorbereitet, aber deaktiviert. Eine sichere Anbindung braucht einen eigenen Server, der den Zugangsschlüssel schützt. Sie wird erst aktiviert, wenn ein solcher Server existiert.</p>`)}
    ${legalSection('Eigene Angaben', `
      <p>Von dir erfasste eigene Lebensmittel und von dir bestätigte Zuordnungen haben Vorrang vor automatischen Treffern aus den Datenbanken.</p>`)}
    ${legalSection('Wichtig', `
      <p>Alle Werte sind Schätzungen ohne Gewähr und keine Grundlage für Entscheidungen bei Allergien oder Krankheiten. Ein fehlender Wert steht als „–“ und bedeutet „keine Daten“, nicht „null“.</p>`)}`;
}

function legalLicensesHtml() {
  const row = (name, lic, use) => `<li><b>${name}</b>, ${lic}. ${use}</li>`;
  return `
    <p class="legal-stand">Savora nutzt frei lizenzierte Schriften und Bibliotheken. Vielen Dank an die Entwicklerinnen und Entwickler.</p>
    ${legalSection('Schriften', `<ul class="legal-list">
      ${row('Roboto', 'Apache License 2.0', 'Fliesstext.')}
      ${row('Sofia Sans Extra Condensed', 'SIL Open Font License 1.1', 'Titel.')}
      ${row('Archivo', 'SIL Open Font License 1.1', 'Schriftzug.')}
      ${row('Source Serif 4', 'SIL Open Font License 1.1', 'Titel in den PDF-Vorlagen.')}
      ${row('Baloo 2', 'SIL Open Font License 1.1', 'Ältere Ansichten.')}
    </ul>`)}
    ${legalSection('Bibliotheken', `<ul class="legal-list">
      ${row('jsPDF 2.5.1', 'MIT-Lizenz', 'Erzeugt die PDF-Dateien.')}
      ${row('html2canvas 1.4.1', 'MIT-Lizenz, © Niklas von Hertzen', 'Hilft bei der PDF-Vorschau.')}
      ${row('PDF.js', 'Apache License 2.0, Mozilla', 'Zeichnet die PDF-Vorschau auf iPhone und iPad.')}
      ${row('Capacitor', 'MIT-Lizenz', 'Bindet die Web-App in die iOS-App ein (nur iOS-App).')}
    </ul>`)}
    <p class="legal-stand">Die vollständigen Lizenztexte findest du bei den jeweiligen Projekten.</p>`;
}

function legalHelpHtml() {
  const q = (title, body) => `<details class="faq"><summary>${title}</summary><p>${body}</p></details>`;
  return `
    ${legalSection('Kontakt', `<p>Fragen oder Rückmeldungen zu Savora schickst du an ${legalValue(LEGAL.email)}. Bei Fehlern hilft es, kurz zu beschreiben, was du getan hast und was du stattdessen erwartet hast.</p>`)}
    ${legalSection('Häufige Fragen', [
      q('Wo liegen meine Rezepte?', 'Auf diesem Gerät, im Speicher des Browsers oder der App. Ohne Anmeldung verlassen sie das Gerät nie.'),
      q('Wie sichere ich meine Rezepte?', 'Unter „Mehr“, „Sicherung &amp; Wiederherstellung“ erstellst du eine Sicherungsdatei. Bewahre sie an einem zweiten Ort auf, zum Beispiel in der Dateien-App oder per E-Mail an dich selbst.'),
      q('Was macht die Synchronisation?', 'Sie gleicht deine Rezepte, Fotos, den Wochenplan und die Einkaufsliste zwischen deinen Geräten ab. Sie ist keine Sicherung: Was du löschst, verschwindet auf allen Geräten.'),
      q('Warum kommt eine Timer-Meldung nur in der iOS-App?', 'Der Browser kann bei gesperrtem Telefon keine Meldung senden. Die iOS-App plant die Meldung auf dem Gerät und fragt beim ersten Timer nach der Erlaubnis.'),
      q('Bleibt der Bildschirm im Kochmodus an?', 'Ja. Oben im Kochmodus steht „Bildschirm bleibt an“. Wenn dort „Bildschirm kann ausgehen“ steht, unterstützt dein Browser das nicht.'),
      q('Warum ändern sich Mengen, wenn ich Portionen ändere?', 'Savora rechnet immer vom Originalrezept aus. Die gespeicherten Mengen bleiben unverändert, nur die Anzeige wird umgerechnet.'),
      q('Wie genau sind die Nährwerte?', 'Es sind Schätzwerte auf Basis der erkannten Zutaten. Fehlende oder unklare Mengen fliessen nicht als exakte Werte ein. Mehr dazu unter „Datenquellen“.'),
    ].join(''))}`;
}

function legalAboutHtml() {
  return `
    <div class="settings-group"><div class="settings-group-card settings-group-card--padded legal-card">
      <p class="legal-about-name">Savora</p>
      <p>Dein persönliches digitales Kochbuch.</p>
      <p class="legal-stand">Version ${escapeHtml(APP_VERSION)}${typeof SavoraNative !== 'undefined' && SavoraNative.isNative ? ' (iOS-App)' : ''}</p>
      <p>Kontakt: ${legalValue(LEGAL.email)}</p>
    </div></div>
    ${settingsGroup('Rechtliches', [
      settingsRow({ icon: ICONS.shield, title: 'Datenschutz', view: 'settings-privacy' }),
      settingsRow({ icon: ICONS.fileText, title: 'Nutzungsbedingungen', view: 'settings-terms' }),
      settingsRow({ icon: ICONS.database, title: 'Datenquellen', view: 'settings-sources' }),
      settingsRow({ icon: ICONS.info, title: 'Lizenzen', view: 'settings-licenses' }),
    ].join(''))}`;
}
