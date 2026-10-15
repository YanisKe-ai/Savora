/* ---------- Herkunftszeile im Rezeptdetail (Quelle, Rezeptbibliothek, Freunde) ----------
   Drei getrennte Rollen, nie in ein Feld gequetscht:
   - Urspruengliche Quelle (r.source: Adresse oder freier Text; sonst ein als Schritt gespeicherter Quellenhinweis)
   - Oeffentlich veroeffentlichende Person (r.publicOrigin, Rezeptbibliothek) mit Knopf «Original ansehen» (data-action="lib-open")
   - Privater Absender (r.sharedBy, Freunde-Versand)
   Alles kommt aus dem lokalen Rezept: kein Netz noetig, offline keine kaputte Darstellung. Ob die Veroeffentlichung noch
   verfuegbar ist, zeigt erst die Bibliotheksansicht nach dem Tippen (mit verstaendlichem Hinweis, falls zurueckgezogen).
   Die Herkunft wird bei jeder Anzeige nochmals geprueft (valPublicOrigin aus validate.js), Texte gehen immer durch escapeHtml.

   recipeOriginHtml(r)  -> '' oder <p class="source-line">…</p> (fuer .source-row im Rezeptdetail)
   recipeOriginPlain(r) -> Klartext aller Rollen, mit « · » getrennt (z. B. fuer Text- oder PDF-Ausgaben) */

function recipeOriginLib(r) {
  if (!r || !r.publicOrigin || typeof valPublicOrigin !== 'function') return null;
  return valPublicOrigin(r.publicOrigin, 'store').origin;
}
function recipeOriginLibText(po) {
  return po && po.authorName ? 'Aus der Rezeptbibliothek, von ' + po.authorName : 'Aus der Savora-Rezeptbibliothek';
}
function recipeOriginSourceHint(r) {
  return typeof textSourceHint === 'function' ? (textSourceHint(r) || '') : '';
}
function recipeOriginHtml(r) {
  if (!r) return '';
  const parts = [];
  const src = typeof r.source === 'string' ? r.source.trim() : '';
  const isUrl = /^https?:\/\/\S+$/i.test(src);
  if (src && isUrl) parts.push(`Quelle: <a href="${escapeHtml(src)}" target="_blank" rel="noopener">${escapeHtml(typeof domainFromUrl === 'function' ? domainFromUrl(src) : src)}</a>`);
  else if (src) parts.push(`Quelle: ${escapeHtml(src)}`);
  else { const hint = recipeOriginSourceHint(r); if (hint) parts.push(`Quelle: ${escapeHtml(hint)}`); }
  const po = recipeOriginLib(r);
  if (po) parts.push(`<span class="source-origin">${escapeHtml(recipeOriginLibText(po))} <button type="button" class="text-btn source-origin-btn" data-action="lib-open" data-id="${escapeHtml(po.publicationId)}">Original ansehen</button></span>`);
  const by = typeof r.sharedBy === 'string' ? r.sharedBy.trim() : '';
  if (by) parts.push(`Geteilt von ${escapeHtml(by)}`);
  if (!parts.length) return '';
  const icon = (typeof ICONS === 'object' && ICONS) ? ((src || recipeOriginSourceHint(r)) ? ICONS.link : po ? ICONS.book : ICONS.sparkle) || '' : '';
  return `<p class="source-line source-line--origin">${icon}<span>${parts.join('<br>')}</span></p>`;
}
function recipeOriginPlain(r) {
  if (!r) return '';
  const parts = [];
  const src = typeof r.source === 'string' ? r.source.trim() : '';
  if (src) parts.push('Quelle: ' + src);
  const po = recipeOriginLib(r);
  if (po) parts.push(recipeOriginLibText(po));
  const by = typeof r.sharedBy === 'string' ? r.sharedBy.trim() : '';
  if (by) parts.push('Geteilt von ' + by);
  return parts.join(' · ');
}
