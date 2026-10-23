/* Gemeinsame Rezeptauswahl (v83): Suche und Auswahl fuer den Wochenplan («Planen»), den Einkauf («Aus Rezepten»)
   und die Kochbuchauswahl. Zustand steht im offenen Dialog (state.modal):
     rpQuery  Suchtext
     rpSel    gewaehlte Rezept-IDs (bleiben beim Aendern der Suche erhalten)
     rpQty    { recipeId: Menge } nur fuer abweichende Mengen
     rpMulti  true = Mehrfachauswahl (Einkauf), sonst Einzelauswahl (Wochenplan)
   Tippen in der Suche baut nur die Liste neu auf (kein render()): Fokus, Cursor und Scrollposition bleiben.
   Es werden nur lokale Rezept-IDs gewaehlt (state.recipes); Bibliotheksrezepte laufen vorher ueber den
   zentralen Uebernahmeablauf (library.js) und kommen mit ihrer lokalen ID hierher. */

/* ---------- Suche: gleiche Normalisierung wie die Rezeptsuche (searchNorm), Titel und Kategorien ---------- */
const _rpTextCache = new Map();
function rpSearchText(r) {
  const key = r.id + '|' + (r.updatedAt || 0);
  let v = _rpTextCache.get(key);
  if (v === undefined) {
    const cats = (r.categoryTags || []).concat(r.category ? [r.category] : []);
    const labels = cats.map(c => (typeof categoryLabelFor === 'function' ? categoryLabelFor(c) : c));
    v = searchNorm([r.title || ''].concat(cats, labels).join(' '));
    if (_rpTextCache.size > 5000) _rpTextCache.clear();
    _rpTextCache.set(key, v);
  }
  return v;
}
function rpMatches(r, query) {
  const tokens = searchNorm(query).split(' ').filter(Boolean);
  if (!tokens.length) return true;
  const hay = rpSearchText(r);
  return tokens.every(t => hay.includes(t));
}
function rpFilter(list, query) { return (list || []).filter(r => rpMatches(r, query)); }

/* ---------- v84: Bereich «Anzeigen» (Alle Rezepte, Favoriten, eigene Sammlungen) ----------
   Daten nur ueber org.js; bis dahin Rueckfall auf den Bestand (savora-collections, recipe.collections). */
function rpCollections() {
  if (typeof orgCollections === 'function') { try { return orgCollections().map(c => ({ id: c.id, name: c.name })); } catch (e) { /* Rueckfall */ } }
  return (typeof getCollections === 'function' ? getCollections() : []).map(c => ({ id: c.id, name: c.name }));
}
function rpScopeIdSet(key) {
  if (!key || key === 'all') return null;
  if (key === 'favorites') return new Set(state.recipes.filter(r => r.favorite).map(r => r.id));
  if (typeof orgRecipeIdsIn === 'function') { try { return new Set(orgRecipeIdsIn(key)); } catch (e) { /* Rueckfall */ } }
  return new Set(state.recipes.filter(r => (r.collections || []).includes(key)).map(r => r.id));
}
// Gueltiger Bereich: eine geloeschte Sammlung faellt auf «Alle Rezepte» zurueck
function rpScopeKey(m) {
  const k = m && m.rpScope;
  if (!k || k === 'all' || k === 'favorites') return k || 'all';
  return rpCollections().some(c => c.id === k) ? k : 'all';
}
function rpScopeName(m) {
  const k = rpScopeKey(m);
  if (k === 'favorites') return 'Favoriten';
  const c = rpCollections().find(x => x.id === k);
  return c ? c.name : '';
}
function rpScopeList(m) {
  const set = rpScopeIdSet(rpScopeKey(m));
  return set ? state.recipes.filter(r => set.has(r.id)) : state.recipes;
}
function rpScopeHtml(m) {
  const cols = rpCollections();
  const favN = state.recipes.filter(r => r.favorite).length;
  if (!cols.length && !favN) return '';
  const cur = rpScopeKey(m);
  const opt = (v, label) => `<option value="${escapeAttr(v)}" ${cur === v ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  const colOpts = cols.map(c => opt(c.id, `${c.name} (${rpScopeIdSet(c.id).size})`)).join('');
  return `<div class="field rp-field rp-scope"><label for="rpScope">Anzeigen</label>
    <select id="rpScope">${opt('all', 'Alle Rezepte')}${opt('favorites', `Favoriten (${favN})`)}${colOpts ? `<optgroup label="Deine Sammlungen">${colOpts}</optgroup>` : ''}</select></div>`;
}

/* ---------- Anzeige-Helfer mit Rueckfall, bis die gemeinsamen Helfer (recipe-model.js) da sind ---------- */
function rpYieldShort(r, n) {
  if (typeof yieldShort === 'function') return yieldShort(r, n);
  if (!yieldKnown(r) && !(n > 0)) return '';
  return servingShort(r, n || r.servings);
}
function rpYieldText(r, n) {
  if (typeof yieldText === 'function') return yieldText(r, n);
  return servingLabel(r, n || r.servings || 0);
}
function rpTimeText(r) {
  if (typeof timeInfo === 'function') { try { return timeInfo(r).cardText || ''; } catch (e) { /* Rueckfall unten */ } }
  return r.timeMinutes > 0 ? `${r.timeMinutes} Min.` : '';
}
// Schrittweite der Mengenwahl: bei Gesamtertrag in ml/g ganze Ansaetze (500 ml -> 1000 ml), sonst 1
function rpStep(r) { const s = typeof yieldStep === 'function' ? Number(yieldStep(r)) : 1; return s > 0 ? s : 1; }
function rpQtyFor(m, r) {
  const q = m && m.rpQty ? Number(m.rpQty[r.id]) : 0;
  return q > 0 ? q : (yieldKnown(r) ? Number(r.servings) : 0);
}
function rpSelected(m) { return (m && Array.isArray(m.rpSel)) ? m.rpSel.filter(id => state.recipes.some(r => r.id === id)) : []; }

/* ---------- Bausteine ---------- */
function rpSearchHtml(m, placeholder) {
  return `<div class="rp-filters">${rpScopeHtml(m)}${rpSearchBoxHtml(m, placeholder)}</div>`;
}
function rpSearchBoxHtml(m, placeholder) {
  return `<div class="rp-search" role="search">
    <label for="rpSearch" class="sr-only">Rezepte durchsuchen</label>
    <span class="rp-search-icon" aria-hidden="true">${ICONS.search || ''}</span>
    <input type="search" id="rpSearch" class="rp-search-input" placeholder="${escapeAttr(placeholder || 'Rezept oder Kategorie suchen')}" value="${escapeAttr(m.rpQuery || '')}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" aria-controls="rpList" aria-describedby="rpCount">
  </div>`;
}
function rpStepperHtml(r, n, extraLabel) {
  const title = r.title || 'Rezept';
  return `<div class="stepper rp-stepper" role="group" aria-label="Menge für ${escapeAttr(title)}">
    <button type="button" data-rp-step="-1" data-id="${escapeAttr(r.id)}" aria-label="Weniger ${escapeAttr(extraLabel || title)}" ${n <= rpStep(r) ? 'disabled' : ''}>${ICONS.minus}</button>
    <span class="stepper-value rp-qty-val" aria-live="polite">${escapeHtml(rpYieldShort(r, n) || String(n))}</span>
    <button type="button" data-rp-step="1" data-id="${escapeAttr(r.id)}" aria-label="Mehr ${escapeAttr(extraLabel || title)}">${ICONS.plus}</button>
  </div>`;
}
function rpItemHtml(m, r) {
  const sel = rpSelected(m).includes(r.id);
  const type = m.rpMulti ? 'checkbox' : 'radio';
  const meta = [rpTimeText(r), yieldKnown(r) ? rpYieldShort(r, r.servings) : ''].filter(Boolean).join(' · ');
  const showQty = m.rpMulti && sel && yieldKnown(r);
  return `<li class="rp-row ${sel ? 'is-selected' : ''}">
    <label class="rp-item">
      <input type="${type}" class="rp-input" name="rpPick" value="${escapeAttr(r.id)}" data-rp-pick="${escapeAttr(r.id)}" ${sel ? 'checked' : ''}>
      ${recipeImageHtml(r, 'picker-thumb', 'thumb')}
      <span class="rp-item-text"><span class="rp-item-title">${escapeHtml(r.title || 'Ohne Titel')}</span>${meta ? `<span class="rp-item-meta">${escapeHtml(meta)}</span>` : ''}</span>
      <span class="rp-mark" aria-hidden="true">${ICONS.check}</span>
    </label>
    ${showQty ? `<div class="rp-row-qty"><span class="rp-row-qty-label">Menge</span>${rpStepperHtml(r, rpQtyFor(m, r))}</div>` : ''}
  </li>`;
}
function rpListInnerHtml(m) {
  if (!state.recipes.length) return `<li class="rp-empty"><p>Noch keine Rezepte vorhanden. Lege zuerst ein Rezept an.</p></li>`;
  const scoped = rpScopeKey(m) !== 'all';
  const base = rpScopeList(m);
  const list = rpFilter(base, m.rpQuery || '');
  const q = (m.rpQuery || '').trim();
  if (!list.length && scoped) {
    const nm = escapeHtml(rpScopeName(m));
    if (!q) return `<li class="rp-empty"><p>In «${nm}» ist noch kein Rezept.</p>
      <button type="button" class="outline-btn outline-btn--small" data-rp-allscope>Alle Rezepte zeigen</button></li>`;
    return `<li class="rp-empty"><p><strong>Kein Rezept in «${nm}» gefunden für «${escapeHtml(q)}».</strong></p>
      <button type="button" class="outline-btn outline-btn--small" data-rp-clear>Suche löschen</button>
      <button type="button" class="outline-btn outline-btn--small" data-rp-allscope>In allen Rezepten suchen</button></li>`;
  }
  if (!list.length) {
    return `<li class="rp-empty"><p><strong>Kein Rezept gefunden für «${escapeHtml(q)}».</strong> Prüfe die Schreibweise oder suche nach einer Kategorie.</p>
      <button type="button" class="outline-btn outline-btn--small" data-rp-clear>Suche löschen</button></li>`;
  }
  return list.map(r => rpItemHtml(m, r)).join('');
}
function rpListHtml(m, label) {
  return `<ul class="rp-list" id="rpList" aria-label="${escapeAttr(label || 'Rezepte')}">${rpListInnerHtml(m)}</ul>`;
}
// Statuszeile: Treffer und (bei Mehrfachauswahl) Anzahl gewaehlter Rezepte
function rpCountText(m) {
  const q = (m.rpQuery || '').trim();
  const base = rpScopeList(m);
  const hits = q ? rpFilter(base, q).length : base.length;
  const parts = [];
  if (q) parts.push(hits === 1 ? '1 Treffer' : `${hits} Treffer`);
  if (m.rpMulti) {
    const sel = rpSelected(m);
    const n = sel.length;
    parts.push(n ? `${n} ${n === 1 ? 'Rezept' : 'Rezepte'} ausgewählt` : 'Noch kein Rezept ausgewählt');
    if (rpScopeKey(m) !== 'all') {
      const inScope = new Set(base.map(r => r.id));
      const out = sel.filter(id => !inScope.has(id)).length;
      if (out) parts.push(`${out === 1 ? '1 ausgewähltes' : out + ' ausgewählte'} ausserhalb von «${rpScopeName(m)}»`);
    }
  } else {
    // Einzelauswahl: das gewaehlte Rezept steht in der Mengenzeile darunter; ohne Wahl ein kurzer Hinweis
    if (!rpSelected(m).length) parts.push('Tippe ein Rezept an');
  }
  return parts.join(' · ');
}

/* Dialoggeruest mit Kopf (Titel, Untertitel, Schliessen), scrollbarem Inhalt und festem Fuss. */
function rpSheetHtml({ id, title, sub, subId, body, foot, cls }) {
  return `<div class="modal-backdrop rp-backdrop" data-action="close-modal">
    <div class="modal-sheet rp-sheet ${cls || ''}" role="dialog" aria-modal="true" aria-labelledby="${escapeAttr(id)}"${subId ? ` aria-describedby="${escapeAttr(subId)}"` : ''} tabindex="-1" data-stop-click>
      <div class="sheet-handle" aria-hidden="true"></div>
      <div class="rp-head">
        <div class="rp-head-text"><h2 class="rp-title" id="${escapeAttr(id)}">${escapeHtml(title)}</h2>${sub ? `<p class="rp-sub"${subId ? ` id="${escapeAttr(subId)}"` : ''}>${escapeHtml(sub)}</p>` : ''}</div>
        <button type="button" class="rp-close" data-action="close-modal" aria-label="Schliessen">${ICONS.x}</button>
      </div>
      <div class="rp-body">${body}</div>
      <div class="rp-foot">${foot}</div>
    </div>
  </div>`;
}

/* ---------- Teilaktualisierung ohne Neuaufbau ---------- */
function rpRefresh(focusPickId) {
  const m = state.modal;
  const ul = document.getElementById('rpList');
  if (!m || !ul) return;
  ul.innerHTML = rpListInnerHtml(m);
  if (typeof hydrateLazyImages === 'function') hydrateLazyImages();
  rpRefreshStatus();
  if (focusPickId) {
    const inp = ul.querySelector(`[data-rp-pick="${cssEscapeRp(focusPickId)}"]`);
    if (inp) focusWithoutScroll(inp);
  }
}
function rpRefreshStatus() {
  const m = state.modal;
  if (!m) return;
  const c = document.getElementById('rpCount');
  if (c) c.textContent = rpCountText(m);
  const qty = document.getElementById('rpPlanQty');   // Einzelauswahl (Wochenplan): Menge im Fuss
  if (qty) qty.innerHTML = rpPlanQtyHtml(m);
  const go = document.querySelector('[data-rp-confirm]');
  if (go && m.rpMulti) {
    const n = rpSelected(m).length;
    go.textContent = n ? `Zur Vorschau (${n} ${n === 1 ? 'Rezept' : 'Rezepte'})` : 'Zur Vorschau';
  }
}
function cssEscapeRp(s) { return (window.CSS && CSS.escape) ? CSS.escape(String(s)) : String(s).replace(/["\\]/g, '\\$&'); }

/* Wochenplan: Mengenwahl fuer das gewaehlte Rezept (im Fuss, bleibt mit Tastatur erreichbar) */
function rpPlanQtyHtml(m) {
  const r = state.recipes.find(x => x.id === rpSelected(m)[0]);
  if (!r) return '';
  if (!yieldKnown(r)) return `<p class="rp-qty-hint">Bei «${escapeHtml(r.title || 'Ohne Titel')}» fehlt die Angabe, was das Rezept ergibt, darum gelten die Originalmengen.</p>`;
  const n = rpQtyFor(m, r);
  return `<div class="rp-qty-line"><span class="rp-qty-label"><span class="sr-only">Gewählt: </span>${escapeHtml(r.title || 'Ohne Titel')}</span>${rpStepperHtml(r, n)}</div>`;
}

/* ---------- Ereignisse (einmal, delegiert) ---------- */
function rpModalActive() { const m = state.modal; return !!(m && m.rpPicker); }
document.addEventListener('input', (e) => {
  const t = e.target;
  if (!t || t.id !== 'rpSearch' || !rpModalActive()) return;
  if (t.closest('.cb-rp-search')) return;   // Kochbuch: eigene Behandlung unten
  state.modal.rpQuery = t.value;
  if (e.isComposing) return;
  rpRefresh();
});
document.addEventListener('compositionend', (e) => {
  if (e.target && e.target.id === 'rpSearch' && rpModalActive()) { state.modal.rpQuery = e.target.value; rpRefresh(); }
});
document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (!t || !t.classList) return;
  // Enter in der Suche waehlt nichts aus und sendet nichts ab; die Bildschirmtastatur bleibt offen.
  if (e.key === 'Enter' && (t.id === 'rpSearch' || t.classList.contains('cb-rp-input'))) { e.preventDefault(); return; }
  // Enter auf einer Auswahlzeile schaltet sie nur um (wie Leertaste), nie die Abschlussaktion
  if (e.key === 'Enter' && t.classList.contains('rp-input')) { e.preventDefault(); t.click(); }
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (!t || t.id !== 'rpScope' || !rpModalActive()) return;
  state.modal.rpScope = t.value;   // Auswahl (rpSel) bleibt beim Wechsel erhalten
  rpRefresh();
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (!t || !t.classList || !t.classList.contains('rp-input') || !rpModalActive()) return;
  const m = state.modal;
  const id = t.dataset.rpPick;
  let sel = rpSelected(m);
  if (m.rpMulti) sel = t.checked ? Array.from(new Set(sel.concat(id))) : sel.filter(x => x !== id);
  else sel = [id];
  m.rpSel = sel;
  if (m.rpMulti) rpRefresh(id);   // Mengenwahler der Zeile ein- oder ausblenden
  else {
    document.querySelectorAll('#rpList .rp-row').forEach(li => { const inp = li.querySelector('.rp-input'); li.classList.toggle('is-selected', !!(inp && inp.checked)); });
    rpRefreshStatus();
  }
});
document.addEventListener('click', (e) => {
  const t = e.target && e.target.closest ? e.target : null;
  if (!t || !rpModalActive()) return;
  const step = t.closest('[data-rp-step]');
  if (step) {
    e.preventDefault();
    const m = state.modal;
    const r = state.recipes.find(x => x.id === step.dataset.id);
    if (!r || !yieldKnown(r)) return;
    const st = rpStep(r);
    const n = Math.max(st, Math.min(st * 999, rpQtyFor(m, r) + parseInt(step.dataset.rpStep, 10) * st));
    m.rpQty = Object.assign({}, m.rpQty || {}, { [r.id]: n });
    const group = step.closest('.rp-stepper');
    if (group) {
      group.querySelector('.rp-qty-val').textContent = rpYieldShort(r, n) || String(n);
      const minus = group.querySelector('[data-rp-step="-1"]');
      if (minus) { minus.disabled = n <= st; if (minus.disabled && document.activeElement === minus) focusWithoutScroll(group.querySelector('[data-rp-step="1"]')); }
    }
    return;
  }
  if (t.closest('[data-rp-allscope]')) {
    e.preventDefault();
    state.modal.rpScope = 'all';
    const sel = document.getElementById('rpScope');
    if (sel) sel.value = 'all';
    rpRefresh();
    return;
  }
  if (t.closest('[data-rp-clear]')) {
    e.preventDefault();
    state.modal.rpQuery = '';
    const s = document.getElementById('rpSearch');
    if (s) { s.value = ''; focusWithoutScroll(s); }
    rpRefresh();
  }
}, true);   // Erfassungsphase: das Dialogblatt stoppt Klicks (onclick stopPropagation) fuer den Hintergrund

/* Bildschirmtastatur: Dialoghoehe folgt dem sichtbaren Bereich, damit Fuss und Aktionen erreichbar bleiben. */
(function rpTrackViewport() {
  if (!window.visualViewport) return;
  const vv = window.visualViewport;
  const set = () => {
    const root = document.documentElement.style;
    root.setProperty('--rp-vvh', Math.round(vv.height) + 'px');
    root.setProperty('--rp-vvtop', Math.round(vv.offsetTop) + 'px');
  };
  vv.addEventListener('resize', set);
  vv.addEventListener('scroll', set);
  set();
})();

/* ---------- Kochbuch: Suche in «Nicht im Kochbuch» (Einhaengepunkt in cookbookStepSelect) ----------
   Filtert nur die vorhandenen Zeilen (kein Neuaufbau); erscheint erst bei groesseren Sammlungen. */
const RP_CB_MIN = 8;
function rpCookbookSearchHtml(missingCount) {
  if (!(missingCount >= RP_CB_MIN)) return '';
  return `<div class="rp-search cb-rp-search" role="search">
    <label for="cbRpSearch" class="sr-only">Rezepte ausserhalb des Kochbuchs durchsuchen</label>
    <span class="rp-search-icon" aria-hidden="true">${ICONS.search || ''}</span>
    <input type="search" id="cbRpSearch" class="rp-search-input cb-rp-input" placeholder="Rezept oder Kategorie suchen" autocomplete="off" enterkeyhint="search" value="${escapeAttr(state.cbRpQuery || '')}">
    <p class="rp-count" id="cbRpCount" role="status" aria-live="polite"></p>
  </div>`;
}
function rpCookbookApply() {
  const inp = document.getElementById('cbRpSearch');
  if (!inp) return;
  const q = inp.value;
  let shown = 0, total = 0;
  document.querySelectorAll('.cb-item--out').forEach(row => {
    const btn = row.querySelector('[data-action="cb-add-item"]');
    const r = btn ? state.recipes.find(x => x.id === btn.dataset.id) : null;
    const ok = !r || rpMatches(r, q);
    row.hidden = !ok; total++; if (ok) shown++;
  });
  const c = document.getElementById('cbRpCount');
  if (c) c.textContent = q.trim() ? (shown ? `${shown} von ${total} Rezepten` : `Kein Rezept gefunden für «${q.trim()}».`) : '';
}
document.addEventListener('input', (e) => {
  if (!e.target || e.target.id !== 'cbRpSearch') return;
  state.cbRpQuery = e.target.value;
  if (!e.isComposing) rpCookbookApply();
});
// Nach jedem Neuaufbau der Kochbuchseite den gemerkten Suchtext wieder anwenden
if (typeof MutationObserver === 'function') {
  document.addEventListener('DOMContentLoaded', () => {
    const app = document.getElementById('app');
    if (app) new MutationObserver(() => { if (document.getElementById('cbRpSearch') && state.cbRpQuery) rpCookbookApply(); }).observe(app, { childList: true });
  });
}

/* ---------- v84: Kochbuch «Aus Sammlung auswählen» ----------
   Modal { type:'cb-col', colId, sel[], chapter }. Das Kochbuch uebernimmt die Auswahl einmalig (Momentaufnahme):
   es werden nur Rezept-IDs ans Ende der Liste gehaengt, nie Sammlungsnamen als Titel oder Kapitel. */
function cbColSources() {
  const out = [];
  const fav = state.recipes.filter(r => r.favorite).length;
  if (fav) out.push({ id: 'favorites', name: 'Favoriten', n: fav });
  rpCollections().forEach(c => { const n = rpScopeIdSet(c.id).size; if (n) out.push({ id: c.id, name: c.name, n }); });
  return out;
}
function cbColAvailable() { return rpCollections().some(c => rpScopeIdSet(c.id).size > 0); }
function cbColInBook() { return new Set(getCookbookConfig().items.map(it => it.recipeId)); }
function cbColButtonHtml() {
  return cbColAvailable() ? `<button type="button" class="outline-btn outline-btn--small" data-action="cb-from-col">${ICONS.folder || ''} Aus Sammlung auswählen</button>` : '';
}
function cbColCountLabel(n) { return n ? `${n} ${n === 1 ? 'Rezept' : 'Rezepte'} hinzufügen` : 'Rezepte hinzufügen'; }
function cbColModalHtml() {
  const m = state.modal;
  if (!m || m.type !== 'cb-col') return '';
  if (!m.colId) {
    const rows = cbColSources().map(c => `<li><button type="button" class="menu-item cbc-col" data-action="cb-col-pick" data-id="${escapeAttr(c.id)}"><span>${escapeHtml(c.name)}</span><span class="cbc-n">${c.n}</span></button></li>`).join('');
    return rpSheetHtml({ id: 'cb-col-title', title: 'Aus Sammlung auswählen', sub: 'Wähle eine Sammlung. Danach prüfst du die Rezepte.',
      body: `<ul class="cbc-list" aria-label="Sammlungen">${rows || '<li class="rp-empty"><p>Keine Sammlung mit Rezepten.</p></li>'}</ul>`,
      foot: `<div class="rp-actions"><button type="button" class="ghost-btn" data-action="close-modal">Abbrechen</button></div>` });
  }
  const cfg = getCookbookConfig();
  const inBook = cbColInBook();
  const set = rpScopeIdSet(m.colId) || new Set();
  const list = state.recipes.filter(r => set.has(r.id));
  const name = m.colId === 'favorites' ? 'Favoriten' : ((rpCollections().find(c => c.id === m.colId) || {}).name || '');
  const sel = new Set(m.sel || []);
  const rows = list.map(r => {
    const has = inBook.has(r.id);
    const meta = has ? 'Schon im Kochbuch' : [rpTimeText(r), yieldKnown(r) ? rpYieldShort(r, r.servings) : ''].filter(Boolean).join(' · ');
    return `<li class="rp-row ${has || sel.has(r.id) ? 'is-selected' : ''}"><label class="rp-item">
      <input type="checkbox" class="rp-input" data-cbcol-pick="${escapeAttr(r.id)}" ${has || sel.has(r.id) ? 'checked' : ''} ${has ? 'disabled' : ''}>
      ${recipeImageHtml(r, 'picker-thumb', 'thumb')}
      <span class="rp-item-text"><span class="rp-item-title">${escapeHtml(r.title || 'Ohne Titel')}</span>${meta ? `<span class="rp-item-meta">${escapeHtml(meta)}</span>` : ''}</span>
      <span class="rp-mark" aria-hidden="true">${ICONS.check}</span></label></li>`;
  }).join('');
  const chapters = cfg.chapters.length ? `<div class="field rp-field"><label for="cbColChapter">Kapitel für neue Rezepte</label><select id="cbColChapter"><option value="">Ohne Kapitel</option>${cfg.chapters.map(c => `<option value="${escapeAttr(c.id)}" ${m.chapter === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}</select></div>` : '';
  return rpSheetHtml({ id: 'cb-col-title', title: 'Aus Sammlung auswählen', sub: name, subId: 'cb-col-sub',
    body: `<button type="button" class="text-btn shop-back-btn" data-action="cb-col-back">${ICONS.chevronLeft || ''} Zurück zur Sammlungsauswahl</button>
      ${chapters}
      <ul class="rp-list" id="cbColList" aria-label="Rezepte in ${escapeAttr(name)}">${rows}</ul>
      <p class="hint-line">Das Kochbuch übernimmt diese Auswahl einmalig. Spätere Änderungen an der Sammlung ändern das Kochbuch nicht.</p>`,
    foot: `<div class="rp-actions"><button type="button" class="ghost-btn" data-action="close-modal">Abbrechen</button><button type="button" class="primary-btn" data-action="cb-col-confirm" id="cbColGo" ${sel.size ? '' : 'disabled'}>${cbColCountLabel(sel.size)}</button></div>` });
}
function cbColOpen() {
  openModal({ type: 'cb-col', colId: '', sel: [], chapter: '' }, '[data-action="cb-from-col"]');
}
function cbColPick(colId) {
  const m = state.modal; if (!m || m.type !== 'cb-col') return;
  const set = rpScopeIdSet(colId) || new Set(), inBook = cbColInBook();
  state.modal = Object.assign({}, m, { colId, sel: state.recipes.filter(r => set.has(r.id) && !inBook.has(r.id)).map(r => r.id), chapter: '' });
  render();
}
function cbColBack() { const m = state.modal; if (!m || m.type !== 'cb-col') return; state.modal = Object.assign({}, m, { colId: '', sel: [] }); render(); }
function cbColConfirm() {
  const m = state.modal; if (!m || m.type !== 'cb-col' || !m.colId) return;
  const cfg = getCookbookConfig();
  const have = new Set(cfg.items.map(it => it.recipeId));
  const set = rpScopeIdSet(m.colId) || new Set();
  const chap = cfg.chapters.some(c => c.id === m.chapter) ? m.chapter : '';
  const add = state.recipes.filter(r => set.has(r.id) && (m.sel || []).includes(r.id) && !have.has(r.id));
  const skipped = state.recipes.filter(r => set.has(r.id) && have.has(r.id)).length;
  if (!add.length) return;
  add.forEach(r => cfg.items.push({ recipeId: r.id, chapterId: chap }));
  saveCookbookConfig(cfg);
  const n = add.length;
  showToast(`${n} ${n === 1 ? 'Rezept' : 'Rezepte'} im Kochbuch aufgenommen.${skipped ? (skipped === 1 ? ' 1 war schon enthalten.' : ` ${skipped} waren schon enthalten.`) : ''}`, 'success');
  closeModal();
}
document.addEventListener('change', (e) => {
  const t = e.target; const m = state.modal;
  if (!t || !m || m.type !== 'cb-col') return;
  if (t.id === 'cbColChapter') { m.chapter = t.value; return; }
  if (!t.dataset || t.dataset.cbcolPick == null) return;
  const id = t.dataset.cbcolPick;
  m.sel = t.checked ? Array.from(new Set((m.sel || []).concat(id))) : (m.sel || []).filter(x => x !== id);
  const li = t.closest('.rp-row'); if (li) li.classList.toggle('is-selected', t.checked);
  const go = document.getElementById('cbColGo');
  if (go) { go.disabled = !m.sel.length; go.textContent = cbColCountLabel(m.sel.length); }
});
