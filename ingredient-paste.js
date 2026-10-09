/* ---------- Mehrere Zutaten auf einmal einfuegen ----------
   Ein Block Text (eine Zutat pro Zeile) wird in Menge, Einheit und Name getrennt.
   Zeilen wie "Teig:" werden zu Gruppen. Nichts wird erfunden: was nicht erkannt wird, landet
   unveraendert als Name (mit leerer Menge). Uebernommen wird erst nach dem Tippen auf "Uebernehmen". */
const ING_PASTE_UNITS = ['kg', 'g', 'gr', 'mg', 'l', 'dl', 'cl', 'ml', 'tl', 'el', 'msp', 'prise', 'prisen', 'bund', 'dose', 'dosen', 'pk', 'pkg', 'packung', 'packungen',
  'stk', 'stück', 'stueck', 'zehe', 'zehen', 'scheibe', 'scheiben', 'tasse', 'tassen', 'cup', 'cups', 'tsp', 'tbsp', 'oz', 'lb', 'becher', 'handvoll', 'zweig', 'zweige',
  'kopf', 'stange', 'stangen', 'blatt', 'blätter', 'würfel', 'flasche', 'flaschen', 'glas', 'gläser', 'rispe', 'rispen', 'knolle', 'knollen',
  'pck', 'clove', 'cloves', 'can', 'cans', 'jar', 'jars', 'stick', 'sticks', 'pinch', 'dash', 'handful', 'bunch', 'slice', 'slices', 'piece', 'pieces', 'sprig', 'sprigs', 'stalk', 'stalks', 'head', 'package', 'packages', 'päckchen', 'päckli', 'paeckli', 'paeckchen', 'schuss', 'spritzer', 'tropfen', 'stängel', 'bd', 'bündel', 'ecke', 'ecken', 'kugel', 'kugeln', 'liter', 'gramm', 'kilo', 'milliliter', 'deziliter', 'zentiliter', 'pfund'];
const ING_PASTE_GLYPH = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
const ING_PASTE_AMOUNT_RE = new RegExp('^(?:ca\\.?\\s*|etwa\\s+|ungefähr\\s+)?(' +
  '\\d{1,3}(?:[.\'’]\\d{3})+(?!\\d)|\\d+\\s*[¼½¾⅓⅔⅛]|[¼½¾⅓⅔⅛]|\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:[.,]\\d+)?(?:\\s*[-–]\\s*\\d+(?:[.,]\\d+)?)?)\\s*(.*)$', 'i');

function ingPasteAmount(raw) {
  const s = raw.trim();
  let m;
  if (/^\d{1,3}(?:[.'’]\d{3})+$/.test(s)) return s.replace(/[.'’]/g, '');   // Tausendertrenner: 1.000 / 1'000 = 1000
  if ((m = /^(\d+)\s*([¼½¾⅓⅔⅛])$/.exec(s))) return String(Math.round((parseInt(m[1], 10) + ING_PASTE_GLYPH[m[2]]) * 1000) / 1000);
  if (ING_PASTE_GLYPH[s] !== undefined) return String(Math.round(ING_PASTE_GLYPH[s] * 1000) / 1000);
  return s.replace(/(\d),(\d)/g, '$1.$2').replace(/\s*[-–]\s*/, '-');
}
function ingPasteParseLine(line) {
  const s = stripBullet(line).replace(/\s+/g, ' ').trim();
  if (!s) return null;
  const p = qtyParseLine(s);   // gemeinsame Mengenlogik: Bereiche, Brueche, Tausender, qualitative Angaben
  if (!p) return null;
  const out = { amount: p.amount, unit: p.unit, name: p.name };
  if (p.flags && p.flags.length) Object.defineProperty(out, '_flags', { value: p.flags, enumerable: false });
  return out;
}
/* Liefert { items: [Zutat], groups: Anzahl Gruppen } aus einem Textblock */
function ingPasteParse(text) {
  const items = []; let group = ''; let groups = 0;
  String(text || '').split(/\r?\n/).forEach(line => {
    const raw = line.trim();
    if (!raw) return;
    if (isGroupHeadingLine(raw)) { group = stripBullet(raw).replace(/:\s*$/, '').trim(); groups++; return; }
    const it = ingPasteParseLine(raw);
    if (!it || !it.name) return;
    if (group) it.group = group;
    items.push(it);
  });
  return { items, groups };
}
function ingPastePreviewHtml(text) {
  const { items, groups } = ingPasteParse(text);
  if (!String(text || '').trim()) return `<p class="hint-line">Füge unten deine Zutatenliste ein, eine Zutat pro Zeile. Überschriften wie „Teig:“ werden zu Gruppen.</p>`;
  if (!items.length) return `<p class="hint-line">Keine Zutaten erkannt.</p>`;
  let last = null;
  const rows = items.map(i => {
    const head = i.group && i.group !== last ? `<li class="ingp-group">${escapeHtml(i.group)}</li>` : '';
    last = i.group || last;
    return `${head}<li class="ingp-row"><span class="ingp-amount">${escapeHtml([i.amount, i.unit].filter(Boolean).join(' ')) || '–'}</span><span class="ingp-name">${escapeHtml(i.name)}</span></li>`;
  }).join('');
  return `<p class="hint-line" role="status">${items.length} Zutat${items.length === 1 ? '' : 'en'}${groups ? `, ${groups} Gruppe${groups === 1 ? '' : 'n'}` : ''} erkannt. Prüfe kurz die Vorschau.</p><ul class="ingp-list">${rows}</ul>`;
}
function ingPasteModal() {
  const text = (state.modal && state.modal.text) || '';
  return sheet('ingp-title', 'Mehrere Zutaten einfügen', `
    <div class="field"><label for="ingPasteText">Zutatenliste</label>
      <textarea id="ingPasteText" rows="6" placeholder="z.B.&#10;Teig:&#10;250 g Mehl&#10;½ TL Salz&#10;1 Ei&#10;Füllung:&#10;2 EL Öl" autocapitalize="sentences">${escapeHtml(text)}</textarea></div>
    <div id="ingPastePreview" aria-live="polite">${ingPastePreviewHtml(text)}</div>
    <div class="form-actions"><button class="ghost-btn" data-action="close-modal">Abbrechen</button><button class="primary-btn" data-action="ing-paste-apply">Übernehmen</button></div>`);
}
function ingPasteBind() {
  const ta = document.getElementById('ingPasteText');
  if (!ta) return;
  ta.addEventListener('input', () => {
    if (state.modal) state.modal.text = ta.value;
    document.getElementById('ingPastePreview').innerHTML = ingPastePreviewHtml(ta.value);
  });
}
/* Haengt die erkannten Zutaten an das gerade bearbeitete Rezept an (bestehende Zutaten bleiben) */
function ingPasteApply() {
  const text = (state.modal && state.modal.text) || '';
  const { items } = ingPasteParse(text);
  if (!items.length) { showToast('Keine Zutaten erkannt'); return; }
  const r = collectFormData();
  const existing = (r.ingredients || []).filter(i => (i.name || '').trim() || (i.amount || '').toString().trim());   // leere Startzeile entfernen
  const lastGroup = existing.length ? (existing[existing.length - 1].group || '') : '';
  if (lastGroup) items.forEach(i => { if (!i.group) i.group = lastGroup; });   // der Editor kennt keine Zutat ohne Gruppe hinter einer Gruppe
  r.ingredients = existing.concat(items);   // bestehende Zutaten bleiben, neue kommen ans Ende
  state.editingRecipe = r;
  state.modal = null;
  render();
  showToast(`${items.length} Zutat${items.length === 1 ? '' : 'en'} eingefügt`);
}

/* ---------- Foto scannen (iOS-App): Text aus einem Foto in das Importfeld ---------- */
function bindPhotoScan() {
  const input = document.getElementById('ocrInput');
  if (!input || input.dataset.bound) return;
  input.dataset.bound = '1';
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const status = document.getElementById('ocrStatus');
    const say = (t) => { if (status) status.textContent = t; };
    say('Text wird erkannt …');
    try {
      const text = await SavoraNative.recognizeText(file);
      if (!text) { say('Es wurde kein Text erkannt. Versuche es mit mehr Licht und einem geraden Foto.'); return; }
      const ta = document.getElementById('pasteText');
      if (ta) { ta.value = (ta.value.trim() ? ta.value.trim() + '\n' : '') + text; ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 6, window.innerHeight * 0.5) + 'px'; }   // Feld waechst mit dem Text
      say('Text erkannt. Prüfe ihn kurz und tippe dann auf „Rezept-Entwurf erstellen“.');
    } catch (e) {
      say('Die Texterkennung hat nicht geklappt. Du kannst den Text auch von Hand einfügen.');
    } finally { input.value = ''; }
  });
}
