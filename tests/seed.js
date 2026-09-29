
async () => {
  const c = document.createElement('canvas'); c.width = 1200; c.height = 800;
  const x = c.getContext('2d'); x.fillStyle = '#c9832f'; x.fillRect(0,0,1200,800); x.fillStyle='#2c4534'; x.fillRect(0,0,600,800);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
  const dataUrl = c.toDataURL('image/jpeg', 0.6);
  const imgId = 'img_legacy_1';
  await dbPutImage({ id: imgId, blob, thumbBlob: blob, mime: 'image/jpeg' });
  const recipes = [];
  const r1 = emptyRecipe(); r1.id = 'r_legacy_1'; r1.title = 'Sloppy Joe Buns'; r1.servings = 9; r1.imageId = imgId; r1.favorite = true;
  r1.ingredients = [ {amount:'', unit:'', name:'Teig:'}, {amount:'250', unit:'ml', name:'Milch, lauwarm'}, {amount:'15', unit:'g', name:'Honig'},
    {amount:'', unit:'', name:'Füllung:'}, {amount:'500', unit:'g', name:'Hackfleisch'}, {amount:'2', unit:'', name:'Zwiebeln'} ];
  r1.steps = [{text:'Milch und Honig verrühren.'},{text:'Hackfleisch mit den Zwiebeln 10 Minuten anbraten.'},{text:'Backen.'}];
  r1.notes = 'Mit Sesam bestreuen.'; r1.tags = ['Backen']; r1.diet = []; r1.legacyCustomField = {keep: 'me'};
  const r2 = emptyRecipe(); r2.id = 'r_legacy_2'; r2.title = 'Carbonara'; r2.image = dataUrl; r2.timeMinutes = 10;
  r2.ingredients = [{amount:'200', unit:'g', name:'Spaghetti'},{amount:'1', unit:'', name:'Zwiebel'}]; r2.steps = [{text:'Kochen.'}]; r2.tags=['Schnell'];
  const r3 = emptyRecipe(); r3.id = 'r_legacy_3'; r3.title = 'Gemüse-Curry'; r3.diet = ['vegan']; r3.ingredients=[{amount:'1', unit:'Stk', name:'Zwiebel'}]; r3.steps=[{text:'Alles köcheln.'}];
  for (const r of [r1, r2, r3]) { await dbPut(r); }
  await dbPutMealplanDay({ date: fmtDateKey(getMonday(new Date())), recipeIds: ['r_legacy_1','r_legacy_2'], legacyDayField: 7 });
  await dbPutShopping({ id: 's_legacy_1', name: 'Milch', amount: 1, unit: 'l', checked: false, recipeId: null, createdAt: Date.now() });
  localStorage.setItem('savora-theme', 'light'); localStorage.setItem('savora-cookbook-title', 'Yanis Kochbuch'); localStorage.setItem('savora-unit-system', 'metric');
  await loadRecipes(); await loadShopping(); await loadMealplan(); render();
  return true;
}
