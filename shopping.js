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

async function addRecipeIngredientsToShopping(r, servings) {
  const factor = servings / (r.servings || 1);
  for (const ing of (r.ingredients || [])) {
    if (!ing.name) continue;
    const parsedAmt = parseAmount(ing.amount);
    const scaledAmount = parsedAmt !== null ? Math.round(parsedAmt * factor * 100) / 100 : '';
    const match = state.shopping.find(s => !s.checked && ingredientNamesMatch(s.name, ing.name) && (s.unit || '') === (ing.unit || ''));
    if (match && typeof scaledAmount === 'number' && typeof match.amount === 'number') {
      match.amount = Math.round((match.amount + scaledAmount) * 100) / 100;
      await dbPutShopping(match);
    } else {
      const item = { id: uid(), name: ing.name, amount: scaledAmount, unit: ing.unit || '', checked: false, recipeId: r.id, createdAt: Date.now() };
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
