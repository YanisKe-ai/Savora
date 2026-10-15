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
function rpQtyFor(m, r) {
  const q = m && m.rpQty ? Number(m.rpQty[r.id]) : 0;
  return q > 0 ? q : (yieldKnown(r) ? Number(r.servings) : 0);
}
function rpSelected(m) { return (m && Array.isArray(m.rpSel)) ? m.rpSel.filter(id => state.recipes.some(r => r.id === id)) : []; }

/* ---------- Bausteine ---------- */
function rpSearchHtml(m, placeholder) {
  return `<div class="rp-search" role="search">
    <label for="rpSearch" class="sr-only">Rezepte durchsuchen</label>
    <span class="rp-search-icon" aria-hidden="true">${ICONS.search || ''}</span>
    <input type="search" id="rpSearch" class="rp-search-input" placeholder="${escapeAttr(placeholder || 'Rezept oder Kategorie suchen')}" value="${escapeAttr(m.rpQuery || '')}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" aria-controls="rpList" aria-describedby="rpCount">
  </div>`;
}
function rpStepperHtml(r, n, extraLabel) {
  const title = r.title || 'Rezept';
  return `<div class="stepper rp-stepper" role="group" aria-label="Menge für ${escapeAttr(title)}">
    <button type="button" data-rp-step="-1" data-id="${escapeAttr(r.id)}" aria-label="Weniger ${escapeAttr(extraLabel || title)}" ${n <= 1 ? 'disabled' : ''}>${ICONS.minus}</button>
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
  const list = rpFilter(state.recipes, m.rpQuery || '');
  if (!list.length) {
    return `<li class="rp-empty"><p><strong>Kein Rezept gefunden für «${escapeHtml((m.rpQuery || '').trim())}».</strong> Prüfe die Schreibweise oder suche nach einer Kategorie.</p>
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
  const hits = q ? rpFilter(state.recipes, q).length : state.recipes.length;
  const parts = [];
  if (q) parts.push(hits === 1 ? '1 Treffer' : `${hits} Treffer`);
  if (m.rpMulti) {
    const n = rpSelected(m).length;
    parts.push(n ? `${n} ${n === 1 ? 'Rezept' : 'Rezepte'} ausgewählt` : 'Noch kein Rezept ausgewählt');
  } else {
    // Einzelauswahl: das gewaehlte Rezept steht in der Mengenzeile darunter; ohne Wahl ein kurzer Hinweis
    if (!rpSelected(m).length) parts.push('Tippe ein Rezept an');
  }
  return parts.join(' · ');
}

/* Dialoggeruest mit Kopf (Titel, Untertitel, Schliessen), scrollbarem Inhalt und festem Fuss. */
function rpSheetHtml({ id, title, sub, body, foot, cls }) {
  return `<div class="modal-backdrop rp-backdrop" data-action="close-modal">
    <div class="modal-sheet rp-sheet ${cls || ''}" role="dialog" aria-modal="true" aria-labelledby="${escapeAttr(id)}" tabindex="-1" onclick="event.stopPropagation()">
      <div class="sheet-handle" aria-hidden="true"></div>
      <div class="rp-head">
        <div class="rp-head-text"><h2 class="rp-title" id="${escapeAttr(id)}">${escapeHtml(title)}</h2>${sub ? `<p class="rp-sub">${escapeHtml(sub)}</p>` : ''}</div>
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
    go.textContent = n ? `Weiter mit ${n} ${n === 1 ? 'Rezept' : 'Rezepten'}` : 'Weiter zur Vorschau';
  }
}
function cssEscapeRp(s) { return (window.CSS && CSS.escape) ? CSS.escape(String(s)) : String(s).replace(/["\\]/g, '\\$&'); }

/* Wochenplan: Mengenwahl fuer das gewaehlte Rezept (im Fuss, bleibt mit Tastatur erreichbar) */
function rpPlanQtyHtml(m) {
  const r = state.recipes.find(x => x.id === rpSelected(m)[0]);
  if (!r) return '';
  if (!yieldKnown(r)) return `<p class="rp-qty-hint">Für «${escapeHtml(r.title || 'Ohne Titel')}» fehlt der Ertrag. Es gelten die Originalmengen.</p>`;
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
    const n = Math.max(1, Math.min(999, rpQtyFor(m, r) + parseInt(step.dataset.rpStep, 10)));
    m.rpQty = Object.assign({}, m.rpQty || {}, { [r.id]: n });
    const group = step.closest('.rp-stepper');
    if (group) {
      group.querySelector('.rp-qty-val').textContent = rpYieldShort(r, n) || String(n);
      const minus = group.querySelector('[data-rp-step="-1"]');
      if (minus) { minus.disabled = n <= 1; if (minus.disabled && document.activeElement === minus) focusWithoutScroll(group.querySelector('[data-rp-step="1"]')); }
    }
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
