/* ---------- Konservativer Namensabgleich fuer die Einkaufsliste (Singular/Plural) ---------- */
function isSimpleGermanPluralPair(a, b) {
  // Deckt genau die haeufigen Faelle ab (Tomate/Tomaten, Zwiebel/Zwiebeln) ohne
  // generisches Wortstamm-Raten, das faelschlich unterschiedliche Zutaten verschmelzen koennte.
  return a + 'n' === b || a + 'en' === b || b + 'n' === a || b + 'en' === a;
}

function ingredientNamesMatch(nameA, nameB) {
  const a = (nameA || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const b = (nameB || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!a || !b) return false;
  if (a === b) return true;
  return isSimpleGermanPluralPair(a, b);
}

/* Gemeinsamer Kern: nimmt eine Menge (exakt oder Bereich) in die Einkaufsliste auf. Bereiche werden mit
   beiden Grenzen gefuehrt und beim Zusammenfuehren Grenze fuer Grenze addiert. */
function shoppingFindMatch(name, unit) {
  const canonical = normalizeUnit(unit);
  return state.shopping.find(x => {
    if (x.checked || x.have || !qtyIsNumeric(shopQty(x))) return false;
    if (!ingredientNamesMatch(x.name, name)) return false;
    const xc = normalizeUnit(x.unit);
    if (canonical && xc) return unitDimension(canonical) === unitDimension(xc);
    if (!canonical && !xc) return (x.unit || '').trim().toLowerCase() === (unit || '').trim().toLowerCase();
    return false;
  }) || null;
}
// Menge in die Einheit des Zielartikels bringen (beide Grenzen); null = nicht umrechenbar
function shoppingConvertQty(q, fromUnit, toUnit) {
  const fc = normalizeUnit(fromUnit), tc = normalizeUnit(toUnit);
  if (!fc || !tc || fc === tc) return q;
  const lo = convertAmountExplicit(q.min, fc, tc), hi = convertAmountExplicit(q.max, fc, tc);
  return (lo === null || hi === null) ? null : { kind: lo === hi ? 'exact' : 'range', min: lo, max: hi };
}
function shoppingApplyQty(item, q) {
  const f = shopFieldsFromQty(q);
  item.amount = f.amount;
  if (f.amountMax !== undefined) item.amountMax = f.amountMax; else delete item.amountMax;
}

async function addRecipeIngredientsToShopping(r, servings) {
  const factor = servingsFactor(r, servings);
  for (const ing of (r.ingredients || [])) {
    if (!ing.name) continue;
    const q0 = qtyFromIngredient(ing);
    const q = qtyIsNumeric(q0) ? qtyScale(q0, factor) : null;
    const newItem = () => { const it = { id: uid(), name: ing.name, amount: '', unit: ing.unit || '', checked: false, recipeId: r.id, createdAt: Date.now() }; if (q) shoppingApplyQty(it, q); return it; };
    const match = q ? shoppingFindMatch(ing.name, ing.unit) : null;
    if (match) {
      const conv = shoppingConvertQty(q, ing.unit, match.unit);
      if (!conv) { const item = newItem(); await dbPutShopping(item); state.shopping.push(item); continue; }
      shoppingApplyQty(match, qtyAdd(shopQty(match), conv));
      await dbPutShopping(match);
    } else {
      const item = newItem();
      await dbPutShopping(item);
      state.shopping.push(item);
    }
  }
}

/* ---------- Einkaufsliste: Kategorisierung nach Supermarkt-Bereich ---------- */
const CATEGORY_ORDER = ['Obst & Gemüse', 'Fleisch & Fisch', 'Milchprodukte & Eier', 'Getreide & Backwaren', 'Konserven & Trockenware', 'Gewürze & Öle', 'Tiefkühl', 'Getränke', 'Sonstiges'];

const CATEGORY_KEYWORDS = {
  'Obst & Gemüse': ['zwiebel', 'knoblauch', 'tomate', 'kartoffel', 'karotte', 'rüebli', 'paprika', 'salat', 'gurke', 'apfel', 'banane', 'zitrone', 'limette', 'spinat', 'pilz', 'champignon', 'avocado', 'sellerie', 'lauch', 'brokkoli', 'ingwer', 'chili', 'petersilie', 'basilikum', 'koriander', 'kräuter', 'beere', 'orange', 'birne', 'kürbis', 'zucchini', 'aubergine', 'peperoni'],
  'Fleisch & Fisch': ['huhn', 'poulet', 'rind', 'schwein', 'hackfleisch', 'faschiert', 'lachs', 'fisch', 'speck', 'bacon', 'wurst', 'pute', 'garnelen', 'crevetten', 'thunfisch'],
  'Milchprodukte & Eier': ['milch', 'butter', 'käse', 'joghurt', 'sahne', 'rahm', 'quark', 'ei', 'eier', 'frischkäse', 'mozzarella', 'parmesan', 'feta', 'crème fraîche'],
  'Getreide & Backwaren': ['mehl', 'reis', 'nudel', 'pasta', 'spaghetti', 'brot', 'haferflocken', 'couscous', 'quinoa', 'backpulver', 'hefe', 'zucker', 'toast', 'brötchen'],
  'Konserven & Trockenware': ['kichererbsen', 'linsen', 'bohnen', 'kokosmilch', 'tomatenmark', 'passata', 'brühe', 'bouillon', 'dose', 'nüsse', 'mandeln'],
  'Gewürze & Öle': ['salz', 'pfeffer', 'öl', 'olivenöl', 'essig', 'curry', 'paprikapulver', 'zimt', 'muskat', 'senf', 'sojasauce', 'honig', 'gewürz'],
  'Tiefkühl': ['tiefkühl', 'tiefgekühlt', 'tk-'],
  'Getränke': ['wasser', 'wein', 'saft', 'bier', 'limonade'],
};

function categorizeIngredient(name) {
  const s = (name || '').toLowerCase();
  for (const cat of CATEGORY_ORDER) {
    const keywords = CATEGORY_KEYWORDS[cat];
    if (keywords && keywords.some(k => s.includes(k))) return cat;
  }
  return 'Sonstiges';
}
