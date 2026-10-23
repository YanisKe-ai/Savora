/* ---------- Konto und Daten: vier eigene Detailseiten ----------
   Ersetzt die frühere Sammelseite «Konto und Sicherung» (settingsDataView in views.js):
     settingsAccountView()  Mein Konto                         (Route settings-account)
     settingsSyncView()     Geräteabgleich                     (Route settings-sync)
     settingsBackupView()   Sicherung & Wiederherstellung      (Route settings-backup)
     settingsOfflineView()  Ohne Internet                      (Route settings-offline)
   Alles Fachliche bleibt in cloud.js (Anmeldung, Abgleich), backup.js (Export, Import) und sw.js
   (Offline-Stand). Diese Datei zeigt nur an und ruft die vorhandenen Funktionen auf.
   Muss NACH cloud.js, share.js und app.js geladen werden: settingsSyncView() ersetzt die Einzeiler-
   Fassung aus cloud.js, und die Aktionen hängen sich an handleCloudAction (wie cloud.js selbst). */

const kd = {
  offline: { phase: 'idle', missing: [], done: 0, total: 0, photos: null, storage: null, note: '' },   // idle | checking | ready | partial | preparing | error | unsupported | notready
  imp: null,          // geprüfte Sicherungsdatei, die auf Bestätigung wartet: { file, summary } oder { error }
  impBusy: false,
  busy: {},           // laufende Aktionen (Doppelklick-Schutz)
};

/* ---------- Kleine Helfer ---------- */
function kdSignedIn() { return typeof cloudSignedIn === 'function' && cloudSignedIn(); }
function kdEmail() { const s = typeof cloudSession === 'function' ? cloudSession() : null; return s && s.user && s.user.email ? s.user.email : ''; }
function kdOnline() { return navigator.onLine !== false; }
/* «heute, 16:58», «gestern, 16:58», «14. Okt., 16:58» (mit Jahr, wenn nicht das laufende) */
function kdWhen(ts) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const time = d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
  const dayStart = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((dayStart(now) - dayStart(d)) / 86400000);
  if (diff === 0) return `heute, ${time}`;
  if (diff === 1) return `gestern, ${time}`;
  const date = d.toLocaleDateString('de-CH', d.getFullYear() === now.getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
  return `${date}, ${time}`;
}
/* Teilbereiche werden ohne render() aktualisiert (Fokus und Scrollposition bleiben): neue Knöpfe bekommen den Klick-Handler der App wie in bindEvents() */
function kdSetHtml(el, html) {
  el.innerHTML = html;
  if (typeof onAction === 'function') el.querySelectorAll('[data-action]').forEach(b => b.addEventListener('click', onAction));
}
function kdLeadHtml(text) { return `<p class="kd-lead">${escapeHtml(text)}</p>`; }
function kdSection(id, title, bodyHtml, cls) {
  return `<section class="kd-sec${cls ? ' ' + cls : ''}" aria-labelledby="${id}"><h2 class="kd-sec-h" id="${id}">${escapeHtml(title)}</h2><div class="kd-card">${bodyHtml}</div></section>`;
}
function kdPage(title, bodyHtml) {
  return settingsDetailShell(title, bodyHtml, 'kd-page');
}
function kdLinkRow(view, title, sub) {
  return `<button type="button" class="kd-link" data-action="goto-view" data-view="${view}"><span class="kd-link-text"><span class="kd-link-title">${escapeHtml(title)}</span>${sub ? `<span class="kd-sub">${escapeHtml(sub)}</span>` : ''}</span><span class="kd-link-chev" aria-hidden="true">${ICONS.chevronRight}</span></button>`;
}
function kdModals() {
  const t = state.modal && state.modal.type;
  if (t === 'konto-password') return kdPasswordModal();
  if (t === 'konto-delete') return kdDeleteModal();
  if (t === 'cloud-new-password' && typeof cloudNewPasswordModal === 'function') return cloudNewPasswordModal();   // Weg über den Link in der E-Mail «Passwort zurücksetzen»
  return '';
}

/* ======================================================================
   1. Mein Konto
   ====================================================================== */
function kdSignedOutForm() {
  const mode = state.cloudMode === 'reset' ? 'reset' : (state.cloudMode === 'signup' && CLOUD_SIGNUP_OPEN ? 'signup' : 'signin');
  const action = mode === 'signup' ? 'cloud-sign-up' : mode === 'reset' ? 'cloud-reset' : 'cloud-sign-in';
  const label = mode === 'signup' ? 'Konto erstellen' : mode === 'reset' ? 'Link zum Zurücksetzen senden' : 'Anmelden';
  return `<form class="kd-form" onsubmit="return false" novalidate>
    <div class="field"><label for="cloudEmail">E-Mail</label><input type="email" id="cloudEmail" autocomplete="username" inputmode="email" autocapitalize="off" spellcheck="false" value="${escapeAttr(state.cloudEmail || '')}"></div>
    ${mode !== 'reset' ? `<div class="field"><label for="cloudPassword">Passwort</label><input type="password" id="cloudPassword" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" minlength="8"></div>` : '<p class="kd-sub">Wir senden dir einen Link, mit dem du ein neues Passwort festlegst.</p>'}
    <p class="cloud-error" id="cloudError" role="alert"></p>
    <button type="button" class="primary-btn kd-btn" data-kd-primary data-action="${action}">${label}</button>
    <div class="kd-links">
      ${mode !== 'signin' ? `<button type="button" class="text-btn" data-action="cloud-mode" data-id="signin">Zurück zur Anmeldung</button>` : `${CLOUD_SIGNUP_OPEN ? `<button type="button" class="text-btn" data-action="cloud-mode" data-id="signup">Konto erstellen</button>` : ''}<button type="button" class="text-btn" data-action="cloud-mode" data-id="reset">Passwort vergessen?</button>`}
    </div>
  </form>`;
}
function settingsAccountView() {
  let body;
  if (kdSignedIn()) {
    const hasProfile = typeof friendsProfileView === 'function';   // Route friends-profile gehört zu «Freunde & Rezepte»
    const hasPubProfile = typeof libPubProfileView === 'function';   // Route lib-pubprofile gehört zur Rezeptbibliothek (einzige Stelle für öffentliche Sichtbarkeit)
    body = kdLeadHtml('Mit deinem Konto bleiben deine Rezepte auf allen Geräten aktuell. Du brauchst es auch für Freunde und zum Veröffentlichen in der Bibliothek.')
      + kdSection('kdAccStatus', 'Status', `
        <p class="kd-status"><span class="sync-dot" aria-hidden="true"></span><strong class="kd-status-title">Angemeldet</strong></p>
        <p class="kd-sub">E-Mail: <strong class="kd-email">${escapeHtml(kdEmail())}</strong></p>
        ${hasPubProfile || hasProfile ? `<p class="kd-sub kd-sub--strong kd-profiles-title">Deine Profile</p>` : ''}
        ${hasPubProfile ? kdLinkRow('lib-pubprofile', 'Öffentliches Profil', 'Sichtbar für alle: Anzeigename, Bild und Kurztext stehen bei deinen veröffentlichten Rezepten in der Bibliothek.') : ''}
        ${hasProfile ? kdLinkRow('friends-profile', 'Profil für Freunde', 'Sichtbar für deine Freunde: dein Benutzername, über den sie dich finden. Dein Einladungscode bleibt privat.') : ''}`)
      + kdSection('kdAccPw', 'Passwort', `
        <p class="kd-sub">Lege ein neues Passwort für die Anmeldung fest.</p>
        <button type="button" class="ghost-btn kd-btn" data-action="konto-pw-open">Passwort ändern</button>`)
      + kdSection('kdAccOut', 'Abmelden', `
        <p class="kd-sub">Deine Rezepte und Daten bleiben auf diesem Gerät. Der Geräteabgleich endet, und beim nächsten Anmelden werden die Daten dieses Geräts mit deinem Konto zusammengeführt.</p>
        <button type="button" class="ghost-btn kd-btn" data-action="cloud-sign-out">Abmelden</button>`)
      + kdSection('kdAccDel', 'Konto löschen', `
        <p class="kd-sub">Löscht dein Konto und die Daten in der Cloud endgültig. Die Rezepte auf diesem Gerät bleiben erhalten. Vor dem Löschen siehst du alle Folgen.</p>
        <button type="button" class="ghost-btn danger-btn kd-btn" data-action="konto-delete-open">Konto löschen …</button>`, 'kd-sec--danger');
  } else {
    body = kdLeadHtml('Mit einem Konto werden deine Rezepte auf deinen Geräten übernommen. Ohne Konto bleibt alles auf diesem Gerät, und Savora funktioniert wie gewohnt.')
      + kdSection('kdAccStatus', 'Nicht angemeldet', kdSignedOutForm())
      + (CLOUD_SIGNUP_OPEN ? '' : `<p class="kd-note">${ICONS.info}<span>Noch kein Zugang? ${escapeHtml(CLOUD_CLOSED_BETA_TEXT)}</span></p>`)
      + `<p class="kd-sub kd-sub--outside">Deine Daten liegen auf einem Server in Zürich. Deine privaten Rezepte siehst nur du.</p>`;
  }
  return kdPage('Mein Konto', body) + kdModals();
}

function kdPasswordModal() {
  return sheet('kdPwTitle', 'Passwort ändern', `
    <form class="kd-form" onsubmit="return false" novalidate>
      <div class="field"><label for="kontoPw1">Neues Passwort</label><input type="password" id="kontoPw1" autocomplete="new-password" minlength="8" aria-describedby="kontoPwHint"></div>
      <div class="field"><label for="kontoPw2">Neues Passwort wiederholen</label><input type="password" id="kontoPw2" autocomplete="new-password" minlength="8"></div>
      <p class="kd-sub" id="kontoPwHint">Mindestens 8 Zeichen.</p>
      <p class="cloud-error" id="kontoPwError" role="alert"></p>
      <div class="form-actions"><button type="button" class="ghost-btn" data-action="close-modal">Abbrechen</button><button type="button" class="primary-btn" data-kd-primary data-action="konto-pw-save">Passwort speichern</button></div>
    </form>`);
}
function kdDeleteModal() {
  return sheet('kdDelTitle', 'Konto löschen?', `
    <p class="kd-sub kd-sub--strong">Das lässt sich nicht rückgängig machen.</p>
    <ul class="kd-consequences">
      <li>Dein Konto und alle Daten in der Cloud werden endgültig gelöscht: Rezepte, Fotos, Wochenplan, Einkaufsliste, Sammlungen, Kochbücher und die abgeglichenen Einstellungen.</li>
      <li>Dein Profil für Freunde & Rezepte und die Verbindungen dazu werden gelöscht.</li>
      <li>Die Rezepte und Daten auf diesem Gerät bleiben erhalten. Auf deinen anderen Geräten bleiben sie ebenfalls, sie werden aber nicht mehr abgeglichen.</li>
    </ul>
    <form class="kd-form" onsubmit="return false" novalidate>
      <div class="field"><label for="kontoDelConfirm">Zur Bestätigung LÖSCHEN eintippen</label><input type="text" id="kontoDelConfirm" autocomplete="off" autocapitalize="characters" spellcheck="false"></div>
      <p class="cloud-error" id="kontoDelError" role="alert"></p>
      <div class="form-actions"><button type="button" class="ghost-btn" data-action="close-modal">Abbrechen</button><button type="button" class="primary-btn kd-danger-btn" data-kd-primary id="kontoDelBtn" data-action="konto-delete-confirm" disabled>Konto endgültig löschen</button></div>
    </form>`);
}
function kdSetError(id, msg) { const el = document.getElementById(id); if (el) el.textContent = msg; else showToast(msg, 'error'); }

/* ======================================================================
   2. Geräteabgleich
   ====================================================================== */
/* Zustand aus dem, was cloud.js wirklich weiss: laufender Abgleich, letzter Fehler, Zeitstempel der letzten erfolgreichen
   Runde und die Zahl der noch nicht übertragenen Änderungen. Die Anmeldung allein sagt nichts über «aktuell». */
function kdSyncState() {
  if (!kdSignedIn()) return { kind: 'signed-out' };
  const pending = Object.keys(cloudQueue()).length;
  const last = readJsonKey(CLOUD_LAST_KEY, null);
  if (cloud.syncing) return { kind: 'syncing', pending, last };
  if (cloud.lastError) {
    const offline = !kdOnline() || /^Offline|Keine Verbindung/i.test(cloud.lastError);
    return { kind: offline ? 'offline' : 'error', msg: cloud.lastError, pending, last };
  }
  if (!kdOnline()) return { kind: 'offline', pending, last };
  if (!last) return { kind: 'never', pending, last };
  return { kind: 'ok', pending, last };
}
function kdPendingText(n) { return n ? `${n} Änderung${n === 1 ? '' : 'en'} warten auf die Übertragung.` : ''; }
function kdSyncStatusHtml(st) {
  const dot = (cls) => `<span class="sync-dot ${cls}" aria-hidden="true"></span>`;
  const lastLine = st.last ? `<p class="kd-sub">Zuletzt abgeglichen: ${escapeHtml(kdWhen(st.last))}</p>` : '';
  const pend = kdPendingText(st.pending) ? `<p class="kd-sub">${kdPendingText(st.pending)}</p>` : '';
  switch (st.kind) {
    case 'syncing': return `<p class="kd-status">${dot('sync-dot--busy')}<strong class="kd-status-title">Wird abgeglichen …</strong></p>${lastLine}`;
    case 'error': return `<p class="kd-status">${dot('sync-dot--warn')}<strong class="kd-status-title">Abgleich fehlgeschlagen</strong></p><p class="kd-sub">${escapeHtml(st.msg)}</p>${lastLine}${pend}`;
    case 'offline': return `<p class="kd-status">${dot('sync-dot--warn')}<strong class="kd-status-title">Offline</strong></p><p class="kd-sub">Keine Internetverbindung. Deine Änderungen bleiben auf diesem Gerät und werden übertragen, sobald wieder eine Verbindung besteht und Savora geöffnet ist.</p>${lastLine}${pend}`;
    case 'never': return `<p class="kd-status">${dot('sync-dot--warn')}<strong class="kd-status-title">Noch nicht abgeglichen</strong></p><p class="kd-sub">Du bist angemeldet, aber auf diesem Gerät hat noch kein Abgleich geklappt.</p>${pend}`;
    case 'ok': return `<p class="kd-status">${dot('')}<strong class="kd-status-title">Zuletzt abgeglichen: ${escapeHtml(kdWhen(st.last))}</strong></p>${pend}`;
    default: return '';
  }
}
function kdSyncActionsHtml(st) {
  if (st.kind === 'signed-out') return '';
  const busy = st.kind === 'syncing';
  const retry = st.kind === 'error' || st.kind === 'never';
  return `<button type="button" class="${retry ? 'primary-btn' : 'ghost-btn'} kd-btn" data-action="cloud-sync-now" ${busy || st.kind === 'offline' ? 'disabled' : ''} ${busy ? 'aria-busy="true"' : ''}>${retry && st.kind === 'error' ? 'Erneut versuchen' : 'Jetzt abgleichen'}</button>`;
}
function kdRefreshSync() {
  const live = document.getElementById('kontoSyncLive');
  if (!live) return;
  const st = kdSyncState();
  kdSetHtml(live, kdSyncStatusHtml(st));
  const act = document.getElementById('kontoSyncActions');
  if (act) kdSetHtml(act, kdSyncActionsHtml(st));
}
function settingsSyncView() {
  const st = kdSyncState();
  let status;
  if (st.kind === 'signed-out') {
    status = kdSection('kdSyncStatus', 'Nicht angemeldet', `
      <p class="kd-sub">Melde dich an, damit deine Änderungen auf deinen anderen Geräten ankommen. Ohne Anmeldung bleiben deine Daten nur auf diesem Gerät.</p>
      <button type="button" class="primary-btn kd-btn" data-action="konto-sign-in-for-sync">Zum Abgleichen anmelden</button>`);
  } else {
    status = kdSection('kdSyncStatus', 'Status', `
      <div id="kontoSyncLive" role="status" aria-live="polite">${kdSyncStatusHtml(st)}</div>
      <div id="kontoSyncActions">${kdSyncActionsHtml(st)}</div>`);
  }
  const what = `<details class="kd-details"><summary>Was wird abgeglichen?</summary><div class="kd-details-body">
      <p class="kd-sub kd-sub--strong">Wird abgeglichen</p>
      <ul class="kd-bullets"><li>Rezepte mit ihren Fotos</li><li>Wochenplan</li><li>Einkaufsliste</li><li>Sammlungen und Kochbücher</li><li>dein Name im PDF (privat, nicht Teil deines öffentlichen Profils)</li></ul>
      <p class="kd-sub kd-sub--strong">Gilt nur auf diesem Gerät</p>
      <ul class="kd-bullets"><li>Darstellung und Farbschema</li><li>Einheiten und Nährwert-Anzeige</li><li>eigene Lebensmittel und gelernte Nährwert-Zuordnungen</li><li>Offline-Inhalte und Sicherungsdateien</li></ul>
      <p class="kd-sub">Wenn zwei Geräte denselben Eintrag ändern, gilt der neuere Stand. Löschst du ein Rezept, verschwindet es auf allen angemeldeten Geräten. Der Abgleich läuft automatisch, solange Savora geöffnet ist.</p>
    </div></details>`;
  const note = `<p class="kd-note">${ICONS.info}<span>Der Abgleich ist keine Sicherung: Er hält deine Geräte gleich, bewahrt aber keinen älteren Stand. Eine Kopie als Datei erstellst du unter «Sicherung &amp; Wiederherstellung».</span></p>
    <button type="button" class="ghost-btn kd-note-link" data-action="goto-view" data-view="settings-backup">${ICONS.download} Zu Sicherung &amp; Wiederherstellung</button>`;
  return kdPage('Geräteabgleich', kdLeadHtml('Hält deine Rezepte und unterstützten Daten auf deinen Geräten aktuell.') + `<ul class="kd-bullets kd-bullets--lead" aria-label="Unterstützte Daten"><li>Rezepte mit ihren Fotos</li><li>Wochenplan</li><li>Einkaufsliste</li><li>Sammlungen und Kochbücher</li></ul>` + status + what + note) + kdModals();
}
/* Kurztext für die Übersicht «Einstellungen» (echter Zustand statt «An») */
function settingsSyncSummary() {
  const st = kdSyncState();
  switch (st.kind) {
    case 'signed-out': return 'Nicht angemeldet';
    case 'syncing': return 'Wird abgeglichen …';
    case 'error': return 'Abgleich fehlgeschlagen';
    case 'offline': return 'Offline';
    case 'never': return 'Noch nicht abgeglichen';
    default: return `Zuletzt: ${kdWhen(st.last)}`;
  }
}
function settingsAccountSummary() { return kdSignedIn() ? (kdEmail() || 'Angemeldet') : 'Nicht angemeldet'; }
function settingsBackupSummary() { return state.lastBackupAt ? `Zuletzt: ${kdWhen(state.lastBackupAt)}` : 'Noch keine Sicherung heruntergeladen'; }
function settingsOfflineSummary() {
  switch (kd.offline.phase) {
    case 'ready': return 'Offline bereit';
    case 'partial': return 'Teilweise verfügbar';
    case 'preparing': return 'Inhalte werden geladen …';
    case 'error': case 'notready': return 'Nicht geprüft';
    default: return '';
  }
}
// Die alte Übersicht zeigte bei Anmeldung nur «An»: gleiche Funktion, ehrlicher Text
function cloudSettingsSummary() { return settingsSyncSummary(); }

/* ======================================================================
   3. Sicherung & Wiederherstellung
   ====================================================================== */
function kdBackupStatusText() {
  return state.lastBackupAt && !isNaN(new Date(state.lastBackupAt).getTime())
    ? `Letzte heruntergeladene Sicherung: ${kdWhen(state.lastBackupAt)}`
    : 'Noch keine Sicherung heruntergeladen';
}
function kdImportPanelHtml() {
  const imp = kd.imp;
  if (!imp) return '';
  if (imp.error) {
    return `<div class="kd-panel kd-panel--err" role="alert"><p class="kd-panel-title">Diese Datei kann nicht importiert werden.</p><p class="kd-sub">${escapeHtml(imp.error)}</p><p class="kd-sub">Es wurde nichts verändert.</p>
      <div class="kd-actions"><button type="button" class="primary-btn kd-btn" data-action="konto-import-pick">Andere Datei wählen</button><button type="button" class="ghost-btn kd-btn" data-action="konto-import-cancel">Schliessen</button></div></div>`;
  }
  const s = imp.summary;
  const rows = s.rows.map(r => `<li><span>${escapeHtml(r.label)}</span><strong>${escapeHtml(String(r.value))}</strong></li>`).join('');
  const warns = s.warnings.map(w => `<p class="kd-sub kd-sub--warn">${escapeHtml(w)}</p>`).join('');
  return `<div class="kd-panel" role="group" aria-labelledby="kdImpTitle">
    <p class="kd-panel-title" id="kdImpTitle">Datei prüfen</p>
    <p class="kd-sub kd-file">${escapeHtml(imp.file.name)}${s.exportedAt ? ` · gesichert ${escapeHtml(kdWhen(s.exportedAt))}` : ''}</p>
    <ul class="kd-facts">${rows}</ul>
    ${warns}
    <p class="kd-sub">Wie viele Rezepte schon vorhanden sind, zeigt das Ergebnis nach dem Import. Schon vorhandene Rezepte werden nicht doppelt angelegt. Bis du bestätigst, wird nichts verändert.</p>
    <div class="kd-actions"><button type="button" class="primary-btn kd-btn" data-action="konto-import-go" ${kd.impBusy ? 'disabled aria-busy="true"' : ''}>${kd.impBusy ? 'Wird importiert …' : 'Jetzt importieren'}</button><button type="button" class="ghost-btn kd-btn" data-action="konto-import-cancel" ${kd.impBusy ? 'disabled' : ''}>Abbrechen</button></div>
  </div>`;
}
function kdRefreshImport() {
  const el = document.getElementById('kontoImportPanel');
  if (el) kdSetHtml(el, kdImportPanelHtml());
}
function settingsBackupView() {
  const signed = kdSignedIn();
  const persistWarn = (!SavoraNative.isNative && state.storagePersisted === false && !signed)
    ? '<p class="kd-sub kd-sub--warn">Dein Browser hat den Speicher nicht als dauerhaft freigegeben und kann ihn bei Platzmangel räumen. Lade deshalb regelmässig eine Sicherung herunter.</p>' : '';
  const download = kdSection('kdBkDown', 'Sicherung herunterladen', `
      <p class="kd-sub">Enthält deine Rezepte mit Fotos, die Einkaufsliste, den Wochenplan, Sammlungen, Kochbücher sowie eigene Lebensmittel und gelernte Nährwert-Zuordnungen. Nicht enthalten sind Konto, Darstellung und Einheiten.</p>
      ${SavoraNative.isNative ? '<p class="kd-sub">Auf dem iPhone speicherst du die Datei über das Teilen-Fenster, zum Beispiel in «Dateien».</p>' : ''}
      ${persistWarn}
      <button type="button" class="primary-btn kd-btn" data-action="export-backup">${ICONS.download} Sicherung herunterladen</button>
      <p class="kd-sub kd-sub--status" id="kontoBackupStatus" role="status" aria-live="polite">${escapeHtml(kdBackupStatusText())}</p>`);
  const diff = `<p class="kd-note">${ICONS.info}<span><strong>Abgleich oder Sicherung?</strong> Der Geräteabgleich übernimmt deine laufenden Änderungen auf deine angemeldeten Geräte, auch Löschungen. Eine Sicherungsdatei bewahrt einen bestimmten Stand, den du später wieder einspielen kannst.${signed ? '' : ' Ohne Konto liegen deine Daten nur auf diesem Gerät: Eine Sicherung schützt dich bei gelöschten Browserdaten oder einem Gerätewechsel.'}</span></p>`;
  const imp = kdSection('kdBkImp', 'Sicherung importieren', `
      <p class="kd-sub">Wähle eine Datei «savora-sicherung-….json». Du siehst zuerst, was darin enthalten ist. Erst nach deiner Bestätigung wird etwas übernommen.</p>
      <p class="kd-sub">Rezepte, Einkaufsliste, Wochenplan, Sammlungen und Kochbücher aus der Datei werden ergänzt. Vorhandene Einträge werden nicht überschrieben, und inhaltlich gleiche Rezepte nicht doppelt angelegt. Eigene Lebensmittel und gelernte Zuordnungen mit derselben Kennung ersetzen die vorhandenen.</p>
      <p class="kd-sub">PDF-Dateien sind zum Lesen und Drucken gedacht und lassen sich nicht importieren.</p>
      <button type="button" class="ghost-btn kd-btn" data-action="konto-import-pick">${ICONS.upload} Sicherung importieren</button>
      <input type="file" id="kontoRestoreInput" accept="application/json,.json" class="kd-file-input" tabindex="-1" aria-label="Sicherungsdatei wählen">
      <div id="kontoImportPanel">${kdImportPanelHtml()}</div>
      <div id="backupStatus" role="status" aria-live="polite"></div>`);
  return kdPage('Sicherung & Wiederherstellung', kdLeadHtml('Erstellt eine Datei, mit der du deine Daten später wiederherstellen kannst.') + download + diff + imp) + kdModals();
}

/* Datei lesen und prüfen, ohne etwas zu schreiben. Liefert { summary } oder { error }. */
async function kdInspectBackup(file) {
  let text, data;
  try { text = await file.text(); } catch (e) { return { error: 'Die Datei konnte nicht gelesen werden.' }; }
  try { data = JSON.parse(text); } catch (e) { return { error: 'Die Datei ist beschädigt oder keine Sicherung (kein gültiges JSON).' }; }
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  if (data && data.type === 'recipe-share' && data.recipe) {
    const v = validateRecipe(data.recipe);
    if (!v.ok) return { error: `Das geteilte Rezept ist nicht lesbar (${v.errors.slice(0, 2).join('; ')}).` };
    return { summary: { exportedAt: null, rows: [{ label: 'Einzelnes Rezept', value: `«${(v.recipe.title || 'Ohne Titel').slice(0, 60)}»` }], warnings: v.warnings.slice(0, 3).map(w => `Hinweis: ${w}`) } };
  }
  const vb = validateBackup(data);
  if (vb.fatal) return { error: vb.fatal + '.' };
  const rows = [];
  const okRecipes = vb.recipes.filter(r => r.ok).length;
  const badRecipes = vb.recipes.length - okRecipes;
  rows.push({ label: 'Rezepte', value: okRecipes });
  const okShop = vb.shopping.filter(x => x.ok).length;
  if (okShop) rows.push({ label: 'Einkaufsliste', value: plural(okShop, 'Eintrag', 'Einträge') });
  const days = (Array.isArray(data.mealplan) ? data.mealplan : []).filter(d => d && typeof d === 'object' && typeof d.date === 'string' && !d.movedTo).length;
  if (days) rows.push({ label: 'Wochenplan', value: plural(days, 'Tag', 'Tage') });
  const books = data.settings && data.settings.cookbooks && typeof cookbookSanitizeStore === 'function' ? cookbookSanitizeStore(data.settings.cookbooks) : null;
  if (books && books.books && books.books.length) rows.push({ label: 'Kochbücher', value: books.books.length });
  const od = vb.organization && vb.organization.data;   // ab schemaVersion 6, sonst Rueckfall auf die alte Liste
  const cols = od ? od.collections.length : data.settings && Array.isArray(data.settings.collections) ? data.settings.collections.length : 0;
  if (cols) rows.push({ label: 'Sammlungen', value: cols });
  if (od && od.links.length) rows.push({ label: 'Passt dazu', value: plural(od.links.length, 'Verknüpfung', 'Verknüpfungen') });
  const foods = vb.sections.filter(x => x.key === 'customFoods' && x.ok).length;
  if (foods) rows.push({ label: 'Eigene Lebensmittel', value: foods });
  const matches = vb.sections.filter(x => x.key === 'nutritionMatches' && x.ok).length;
  if (matches) rows.push({ label: 'Gelernte Zuordnungen', value: matches });
  const warnings = [];
  const unreadable = badRecipes + vb.shopping.filter(x => !x.ok).length + vb.sections.filter(x => !x.ok).length;
  if (unreadable) warnings.push(`${plural(unreadable, 'Eintrag ist', 'Einträge sind')} nicht lesbar und ${unreadable === 1 ? 'wird' : 'werden'} übersprungen. Alles andere wird übernommen.`);
  if (typeof data.schemaVersion === 'number' && data.schemaVersion > 6) warnings.push('Die Sicherung stammt aus einer neueren Savora-Version. Unbekannte Teile werden nicht übernommen.');
  const hasAnything = okRecipes || okShop || days || (books && books.books && books.books.length) || cols || foods || matches;
  if (!hasAnything) return { error: 'Die Datei enthält keine Daten, die übernommen werden könnten.' };
  const exportedAt = typeof data.exportedAt === 'string' && !isNaN(new Date(data.exportedAt).getTime()) ? data.exportedAt : null;
  return { summary: { exportedAt, rows, warnings } };
}
async function kdHandleImportFile(file) {
  kd.impBusy = false;
  kd.imp = null;
  const panel = document.getElementById('kontoImportPanel');
  if (panel) kdSetHtml(panel, '<p class="kd-sub" role="status">Datei wird geprüft …</p>');
  const r = await kdInspectBackup(file);
  kd.imp = r.error ? { error: r.error, file } : { file, summary: r.summary };
  kdRefreshImport();
  const target = document.querySelector('#kontoImportPanel .kd-panel');
  if (target) { target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: false }); }
}

// Sicherung herunterladen: Zeitstempel setzt backup.js nur nach erfolgreichem Export. Hier wird nur die Anzeige nachgezogen und ein Fehler sichtbar gemacht.
(function kdWrapDownload() {
  const orig = window.downloadBackup;
  if (typeof orig !== 'function' || orig.__kd) return;
  const wrapped = async function (...args) {
    if (kd.busy.download) return;
    kd.busy.download = true;
    try { await orig.apply(this, args); }
    catch (e) { showToast('Sicherung konnte nicht erstellt werden', 'error'); }
    finally { kd.busy.download = false; }
    try { state.lastBackupAt = localStorage.getItem(LAST_BACKUP_KEY) || null; } catch (e) { /* Speicher gesperrt */ }
    const el = document.getElementById('kontoBackupStatus');
    if (el) el.textContent = kdBackupStatusText();
  };
  wrapped.__kd = true;
  window.downloadBackup = wrapped;
})();

/* ======================================================================
   4. Ohne Internet
   ====================================================================== */
/* Zuordnung der vom Service Worker gemeldeten fehlenden Dateien zu Gruppen (nur Pfade, keine Cache-Namen) */
const KD_OFFLINE_GROUPS = [
  { id: 'app', name: 'App', test: (p) => !/\.woff2$/.test(p) && !/\/covers\//.test(p) && !/pdfjs/.test(p) && !/swiss-fcd/.test(p) },
  { id: 'fonts', name: 'Schriften für App und PDF', test: (p) => /\.woff2$/.test(p) },
  { id: 'covers', name: 'Cover', test: (p) => /\/covers\//.test(p) },
  { id: 'pdf', name: 'PDF-Vorschau', test: (p) => /pdfjs/.test(p) },
  { id: 'nutrition', name: 'Nährwertdaten', test: (p) => /swiss-fcd/.test(p) },
];
function kdOfflineStatusInfo() {
  const o = kd.offline;
  switch (o.phase) {
    case 'checking': return { title: 'Wird geprüft …', text: '', dot: 'sync-dot--busy' };
    case 'preparing': return { title: 'Inhalte werden geladen …', text: '', dot: 'sync-dot--busy' };
    case 'ready': return { title: 'Offline bereit', text: 'Alle geprüften Inhalte sind auf diesem Gerät gespeichert.', dot: '' };
    case 'partial': return { title: 'Teilweise verfügbar', text: o.note || 'Ein Teil der Inhalte fehlt noch. Mit «Offline-Inhalte laden» holst du ihn auf dieses Gerät.', dot: 'sync-dot--warn' };
    case 'error': return { title: 'Offline-Inhalte konnten nicht geladen werden', text: o.note || 'Prüfe deine Verbindung und versuche es erneut.', dot: 'sync-dot--warn' };
    case 'notready': return { title: 'Noch nicht geprüft', text: 'Savora richtet sich beim ersten Start ein. Lade die Seite einmal neu und prüfe dann erneut.', dot: 'sync-dot--warn' };
    case 'unsupported': return { title: 'Nicht nötig', text: SavoraNative.isNative ? 'In der App sind die Inhalte schon auf dem Gerät.' : 'Dieser Browser unterstützt die Offline-Nutzung nicht.', dot: '' };
    default: return { title: 'Noch nicht geprüft', text: '', dot: 'sync-dot--warn' };
  }
}
function kdOfflineRows() {
  const o = kd.offline;
  if (!['ready', 'partial', 'preparing', 'error'].includes(o.phase)) return [];
  const rows = KD_OFFLINE_GROUPS.map(g => {
    const n = o.missing.filter(g.test).length;
    return { name: g.name, ok: n === 0, text: n === 0 ? 'Bereit' : (g.id === 'app' || g.id === 'fonts' ? `${n} ${n === 1 ? 'Datei fehlt' : 'Dateien fehlen'}. Öffne Savora mit Internetverbindung.` : `${n} ${n === 1 ? 'Datei fehlt' : 'Dateien fehlen'} noch`) };
  });
  const ph = o.photos;
  if (ph && ph.total) {
    const missing = ph.missing;
    rows.splice(1, 0, { name: 'Rezeptfotos', ok: missing === 0, text: missing === 0 ? `Alle ${ph.total} auf diesem Gerät` : `${missing} von ${ph.total} fehlen noch auf diesem Gerät${kdSignedIn() ? '. Sie kommen beim Geräteabgleich.' : '.'}` });
  }
  return rows;
}
function kdOfflineBodyHtml() {
  const o = kd.offline;
  const info = kdOfflineStatusInfo();
  const busy = o.phase === 'preparing' || o.phase === 'checking';
  const pct = o.total ? Math.round(100 * o.done / o.total) : 0;
  const progress = o.phase === 'preparing' ? `<div class="kd-progress"><progress max="${o.total || 1}" value="${o.done}" aria-label="Fortschritt beim Laden"></progress><span class="kd-sub">${o.total ? `${o.done} von ${o.total}` : 'Wird gestartet …'}</span></div>` : '';
  const rows = kdOfflineRows().map(r => `<li class="kd-item ${r.ok ? 'kd-item--ok' : 'kd-item--miss'}"><span class="kd-item-mark" aria-hidden="true">${r.ok ? ICONS.check : '!'}</span><span class="kd-item-text"><span class="kd-item-name">${escapeHtml(r.name)}</span><span class="kd-sub">${escapeHtml(r.text)}</span></span></li>`).join('');
  const incomplete = o.phase === 'partial' || o.phase === 'error' || o.phase === 'notready' || o.phase === 'idle';
  const noNet = !kdOnline();
  const storage = (incomplete && o.storage !== null && o.storage < 40) ? `<p class="kd-sub kd-sub--warn">Auf diesem Gerät sind nur noch rund ${Math.max(0, Math.round(o.storage))} MB Speicher frei. Die Offline-Inhalte brauchen mehr als 10 MB.</p>` : '';
  const action = o.phase === 'unsupported' ? '' : (incomplete
    ? `<button type="button" class="primary-btn kd-btn" data-action="konto-offline-prepare" ${noNet || busy ? 'disabled' : ''}>Offline-Inhalte laden</button>${noNet ? '<p class="kd-sub">Keine Internetverbindung. Zum Laden brauchst du eine Verbindung.</p>' : ''}`
    : `<button type="button" class="ghost-btn kd-btn" data-action="konto-offline-check" ${busy ? 'disabled' : ''}>Erneut prüfen</button>`);
  return `<div id="kontoOfflineLive" role="status" aria-live="polite"><p class="kd-status"><span class="sync-dot ${info.dot}" aria-hidden="true"></span><strong class="kd-status-title">${escapeHtml(info.title)}</strong></p>${info.text ? `<p class="kd-sub">${escapeHtml(info.text)}</p>` : ''}${progress}</div>
    ${rows ? `<ul class="kd-list" aria-label="Verfügbare Inhalte">${rows}</ul>` : ''}${storage}${action}`;
}
function kdRefreshOffline() {
  const el = document.getElementById('kontoOfflineBox');
  if (!el) return;
  const focusAction = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.action : null;
  kdSetHtml(el, kdOfflineBodyHtml());
  if (focusAction) { const b = el.querySelector(`[data-action="${focusAction}"]`); if (b && !b.disabled && document.activeElement !== b) b.focus({ preventScroll: true }); }
}
function settingsOfflineView() {
  if (kd.offline.phase === 'idle' || Date.now() - (kd.offline.at || 0) > 30000) setTimeout(kdOfflineCheck, 0);   // beim Öffnen frisch prüfen (nicht bei jedem Neuzeichnen)
  const body = kdLeadHtml('Prüfe, welche Inhalte ohne Internet auf diesem Gerät verfügbar sind.')
    + kdSection('kdOffStatus', 'Status', `<div id="kontoOfflineBox">${kdOfflineBodyHtml()}</div>`)
    + `<p class="kd-note">${ICONS.info}<span>Deine eigenen Rezepte und Fotos liegen auf diesem Gerät und sind auch ohne Internet da. Der Geräteabgleich, Freunde &amp; Rezepte und der Abruf neuer Produktdaten brauchen eine Verbindung.</span></p>`;
  return kdPage('Ohne Internet', body) + kdModals();
}
async function kdOfflinePhotos() {
  const withId = (state.recipes || []).filter(r => r && r.imageId);
  let missing = 0;
  for (const r of withId) { try { if (!(await dbGetImage(r.imageId))) missing++; } catch (e) { missing++; } }
  return { total: withId.length, missing };
}
async function kdOfflineStorage() {
  try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); if (e && e.quota) return (e.quota - (e.usage || 0)) / 1048576; } } catch (e) { /* nicht verfügbar */ }
  return null;
}
function kdApplyStatus(d) {
  kd.offline.missing = Array.isArray(d.missing) ? d.missing : [];
  kd.offline.phase = d.ready ? 'ready' : 'partial';
  kd.offline.note = '';
}
async function kdOfflineCheck() {
  const o = kd.offline;
  if (o.phase === 'checking' || o.phase === 'preparing') return;
  if (!('serviceWorker' in navigator) || SavoraNative.isNative) { o.phase = 'unsupported'; kdRefreshOffline(); return; }
  o.phase = 'checking'; o.at = Date.now(); kdRefreshOffline();
  try {
    const d = await offlineAsk('OFFLINE_STATUS');
    kdApplyStatus(d);
    o.photos = await kdOfflinePhotos();
    o.storage = await kdOfflineStorage();
    o.at = Date.now();
  } catch (e) {
    o.phase = (e && e.message === 'no-controller') ? 'notready' : 'error';
    o.note = o.phase === 'error' ? 'Der Stand konnte nicht geprüft werden. Versuche es erneut.' : '';
  }
  kdRefreshOffline();
}
async function kdOfflinePrepare() {
  const o = kd.offline;
  if (o.phase === 'preparing') return;
  if (!kdOnline()) { o.note = 'Keine Internetverbindung. Zum Laden brauchst du eine Verbindung.'; kdRefreshOffline(); return; }
  o.phase = 'preparing'; o.done = 0; o.total = 0; kdRefreshOffline();
  try {
    const d = await offlineAsk('PREPARE_OFFLINE', (p) => { o.done = p.done; o.total = p.total; kdRefreshOffline(); });
    kdApplyStatus(d);
    if (o.phase === 'partial') o.note = 'Einige Inhalte konnten nicht geladen werden. Prüfe deine Verbindung und versuche es erneut.';
    o.photos = await kdOfflinePhotos();
    o.storage = await kdOfflineStorage();
  } catch (e) {
    o.phase = (e && e.message === 'no-controller') ? 'notready' : 'error';
    o.note = o.phase === 'error' ? 'Das Laden hat nicht geklappt. Prüfe deine Verbindung und versuche es erneut.' : '';
  }
  kdRefreshOffline();
}

/* ======================================================================
   Aktionen: hängen sich wie cloud.js an handleCloudAction (actions-v2.js ruft es im default-Zweig auf)
   ====================================================================== */
async function kdHandleAction(action, id, el) {
  switch (action) {
    case 'konto-pw-open':
      openModal({ type: 'konto-password' }, '[data-action="konto-pw-open"]');
      setTimeout(() => { const f = document.getElementById('kontoPw1'); if (f) f.focus(); }, 60);
      return true;
    case 'konto-pw-save': {
      if (kd.busy.pw) return true;
      const pw = (document.getElementById('kontoPw1') || {}).value || '';
      const pw2 = (document.getElementById('kontoPw2') || {}).value || '';
      if (pw.length < 8) { kdSetError('kontoPwError', 'Das Passwort braucht mindestens 8 Zeichen.'); return true; }
      if (pw !== pw2) { kdSetError('kontoPwError', 'Die beiden Passwörter stimmen nicht überein.'); return true; }
      kd.busy.pw = true; el.disabled = true; el.setAttribute('aria-busy', 'true');
      try {
        await cloudAuthUpdatePassword(pw);
        closeModal();
        showToast('Passwort geändert. Beim nächsten Anmelden das neue verwenden.');
      } catch (e) { kdSetError('kontoPwError', e.message || 'Das Passwort konnte nicht geändert werden.'); }
      finally { kd.busy.pw = false; if (document.contains(el)) { el.disabled = false; el.removeAttribute('aria-busy'); } }
      return true;
    }
    case 'konto-delete-open':
      openModal({ type: 'konto-delete' }, '[data-action="konto-delete-open"]');
      setTimeout(() => { const f = document.getElementById('kontoDelConfirm'); if (f) f.focus(); }, 60);
      return true;
    case 'konto-delete-confirm': {
      if (kd.busy.del) return true;
      const typed = ((document.getElementById('kontoDelConfirm') || {}).value || '').trim().toUpperCase();
      if (typed !== 'LÖSCHEN') { kdSetError('kontoDelError', 'Bitte LÖSCHEN eintippen, um zu bestätigen.'); return true; }
      kd.busy.del = true; el.disabled = true; el.setAttribute('aria-busy', 'true');
      try {
        await cloudDeleteAccount();
        state.cloudMode = 'signin';
        closeModal();
        showToast('Konto gelöscht. Die Rezepte auf diesem Gerät bleiben erhalten.');
      } catch (e) { kdSetError('kontoDelError', e.message || 'Das Konto konnte nicht gelöscht werden. Es wurde nichts verändert.'); if (document.contains(el)) { el.disabled = false; el.removeAttribute('aria-busy'); } }
      finally { kd.busy.del = false; }
      return true;
    }
    case 'konto-sign-in-for-sync':
      state.kontoReturn = { view: 'settings-sync', at: Date.now() };
      state.modal = null; state.view = 'settings-account'; render();
      return true;
    case 'konto-import-pick': {
      const input = document.getElementById('kontoRestoreInput');
      if (input) input.click();
      return true;
    }
    case 'konto-import-cancel':
      kd.imp = null; kd.impBusy = false; kdRefreshImport();
      return true;
    case 'konto-import-go': {
      if (kd.impBusy || !kd.imp || !kd.imp.file || kd.imp.error) return true;
      kd.impBusy = true; kdRefreshImport();
      const file = kd.imp.file;
      try { await restoreBackupFromFile(file); }   // backup.js: schreibt, rendert neu und meldet das Ergebnis in #backupStatus
      finally { kd.imp = null; kd.impBusy = false; kdRefreshImport(); }
      return true;
    }
    case 'konto-offline-prepare': kdOfflinePrepare(); return true;
    case 'konto-offline-check': kdOfflineCheck(); return true;
    default: return null;
  }
}
(function kdWrapActions() {
  const orig = window.handleCloudAction;
  if (typeof orig !== 'function' || orig.__kd) return;
  const wrapped = async function (action, id, el, e) {
    if (typeof action === 'string' && action.indexOf('konto-') === 0) {
      const r = await kdHandleAction(action, id, el);
      if (r !== null) return r;
    }
    const result = await orig.call(this, action, id, el, e);
    // Nach der Anmeldung von «Geräteabgleich» aus zurück dorthin
    if (action === 'cloud-sign-in' && state.kontoReturn && cloudSignedIn()) {
      const back = state.kontoReturn; state.kontoReturn = null;
      if (state.view === 'settings-account' && Date.now() - back.at < 10 * 60 * 1000) { state.view = back.view; render(); }
    }
    return result;
  };
  wrapped.__kd = true;
  window.handleCloudAction = wrapped;
})();

// Statusanzeige des Abgleichs live nachziehen (cloud.js ruft cloudRefreshStatus bei jedem Zustandswechsel)
(function kdWrapRefresh() {
  const orig = window.cloudRefreshStatus;
  if (typeof orig !== 'function' || orig.__kd) return;
  const wrapped = function () { orig.apply(this, arguments); kdRefreshSync(); };
  wrapped.__kd = true;
  window.cloudRefreshStatus = wrapped;
})();
window.addEventListener('online', () => { kdRefreshSync(); kdRefreshOffline(); });
window.addEventListener('offline', () => { kdRefreshSync(); kdRefreshOffline(); });

// Dateiauswahl der Sicherung, Eingabe im Lösch-Dialog (delegiert: die Seite wird bei jedem render() neu gebaut)
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t && t.id === 'kontoRestoreInput') {
    const file = t.files && t.files[0];
    t.value = '';
    if (file) kdHandleImportFile(file);
  }
});
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t && t.id === 'kontoDelConfirm') {
    const b = document.getElementById('kontoDelBtn');
    if (b) b.disabled = t.value.trim().toUpperCase() !== 'LÖSCHEN';
  }
});
// Enter in einem Formularfeld löst die Hauptaktion des Formulars aus (die Formulare selbst werden nie abgeschickt)
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.isComposing) return;
  const t = e.target;
  if (!t || t.tagName !== 'INPUT') return;
  const f = t.closest && t.closest('.kd-form');
  if (!f) return;
  const b = f.querySelector('[data-kd-primary]:not([disabled])');
  if (b) { e.preventDefault(); b.click(); }
});
