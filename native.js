/* Savora: Brücke zur nativen iOS-App (Capacitor).
   Im Browser/als PWA ist isNative false und nichts hier greift ein (Rückfall auf die Web-Version).
   Plugins werden über window.Capacitor.Plugins angesprochen (kein Build-Schritt nötig). */
const SavoraNative = (() => {
  const cap = (typeof window !== 'undefined') ? window.Capacitor : null;
  const isNative = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  const plugin = (name) => (isNative && cap.Plugins && cap.Plugins[name]) || null;

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
      fr.onerror = () => reject(fr.error || new Error('blob-read-failed'));
      fr.readAsDataURL(blob);
    });
  }
  // Nutzer hat das Teilen-Fenster selbst geschlossen (kein Fehler).
  function isCancel(err) { return !!err && /cancel/i.test(String(err.message || err.name || err)); }

  /* Datei (PDF, Sicherung) über das iOS-Teilen-Fenster anbieten ("In Dateien sichern", AirDrop, Mail ...).
     Schreibt zuerst in den Cache-Ordner der App, ohne bestehende Nutzerdaten anzufassen. */
  async function shareFile(blob, filename, title) {
    const Filesystem = plugin('Filesystem'), Share = plugin('Share');
    if (!Filesystem || !Share) throw new Error('native-plugin-missing');
    const safeName = String(filename || 'savora.dat').replace(/[^\w.\- äöüÄÖÜ]/g, '_');
    const written = await Filesystem.writeFile({ path: safeName, data: await blobToBase64(blob), directory: 'CACHE' });
    await Share.share({ title: title || safeName, url: written.uri, dialogTitle: title || safeName });
  }
  async function shareText(title, text) {
    const Share = plugin('Share');
    if (!Share) throw new Error('native-plugin-missing');
    await Share.share({ title, text, dialogTitle: title });
  }

  /* Bildschirm im Kochmodus anlassen. Liefert ein Objekt mit release(), passend zum Web-WakeLock. */
  async function keepAwake() {
    const KeepAwake = plugin('KeepAwake');
    if (!KeepAwake) return null;
    try {
      await KeepAwake.keepAwake();
      return { release: () => KeepAwake.allowSleep() };
    } catch (e) { return null; }
  }

  /* Timer-Benachrichtigung bei gesperrtem Telefon. */
  function notifId(id) {
    let h = 0; const s = String(id);
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return (Math.abs(h) % 2000000000) + 1;
  }
  const scheduled = new Set();
  async function scheduleTimer(id, endTimeMs, recipeTitle) {
    const LN = plugin('LocalNotifications');
    if (!LN || !(endTimeMs > Date.now())) return;
    try {
      let perm = await LN.checkPermissions();
      if (perm.display === 'prompt' || perm.display === 'prompt-with-rationale') perm = await LN.requestPermissions();
      if (perm.display !== 'granted') return;
      const nid = notifId(id);
      await LN.schedule({ notifications: [{
        id: nid, title: 'Timer fertig', body: recipeTitle ? `${recipeTitle}: Der Timer ist abgelaufen.` : 'Der Timer ist abgelaufen.',
        schedule: { at: new Date(endTimeMs), allowWhileIdle: true },
      }] });
      scheduled.add(nid);
    } catch (e) { /* Benachrichtigung ist ein Zusatz, der Timer selbst läuft weiter */ }
  }
  async function cancelTimer(id) {
    const LN = plugin('LocalNotifications');
    if (!LN) return;
    const nid = notifId(id);
    scheduled.delete(nid);
    try { await LN.cancel({ notifications: [{ id: nid }] }); } catch (e) {}
  }
  async function cancelAllTimers() {
    const LN = plugin('LocalNotifications');
    if (!LN || !scheduled.size) return;
    const list = Array.from(scheduled).map((id) => ({ id }));
    scheduled.clear();
    try { await LN.cancel({ notifications: list }); } catch (e) {}
  }

  /* iOS-Statusleiste: heller Text auf dunklem Grund (dark = true), sonst dunkler Text */
  async function setStatusBarDark(dark) {
    const SB = plugin('StatusBar');
    if (!SB) return;
    try { await SB.setStyle({ style: dark ? 'DARK' : 'LIGHT' }); } catch (e) {}
  }

  /* Haptisches Feedback: kind = 'light' | 'medium' | 'success' */
  function haptic(kind) {
    const H = plugin('Haptics');
    if (!H) return;
    try {
      if (kind === 'success') H.notification({ type: 'SUCCESS' });
      else H.impact({ style: kind === 'medium' ? 'MEDIUM' : 'LIGHT' });
    } catch (e) {}
  }

  return { isNative, isCancel, shareFile, shareText, keepAwake, scheduleTimer, cancelTimer, cancelAllTimers, setStatusBarDark, haptic };
})();
