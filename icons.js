/* =========================================================
   SAVORA — Digitales Kochbuch
   Vanilla JS, IndexedDB-Speicherung, offline-fähige PWA
   ========================================================= */
/* ---------- Icons (minimal inline SVG set) ---------- */
const ICONS = {
  book: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21V7"/><path d="M4 5c2.5-1.5 6-1.5 8 0 2-1.5 5.5-1.5 8 0v13c-2.5-1.5-6-1.5-8 0-2-1.5-5.5-1.5-8 0Z"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`,
  heartOutline: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>`,
  serving: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3v8a3 3 0 0 0 3 3v7"/><path d="M6 3v6M10 3v6"/><path d="M17 3c-1.7 0-3 2-3 5s1.3 5 3 5v8"/></svg>`,
  chef: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3c-2 0-3.5 1.8-3.2 3.7C7 6.9 5.5 8.5 5.5 10.5c0 1.6 1 3 2.5 3.5V20h8v-6c1.5-.5 2.5-1.9 2.5-3.5 0-2-1.5-3.6-3.3-3.8C15.5 4.8 14 3 12 3Z"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>`,
  pdf: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>`,
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`,
  x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`,
  play: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M8 5v14l11-7Z"/></svg>`,
  link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5"/></svg>`,
  timer: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>`,
  bulb: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 22h4"/><path d="M12 2a6 6 0 0 0-4 10.5c.6.6 1 1.4 1 2.5h6c0-1.1.4-1.9 1-2.5A6 6 0 0 0 12 2Z"/></svg>`,
  sun: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>`,
  auto: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18Z" fill="currentColor" stroke="none"/></svg>`,
  sparkle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/></svg>`,
  leaf: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A9 9 0 0 0 20 11 15 15 0 0 1 11 20Z"/><path d="M4 20c0-8 4-14 14-15 0 9-4 15-14 15Z"/></svg>`,
  wheatOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22v-5"/><path d="M9 8c1 1 3 1 4 0M8 12c1 1 4 1 5 0M7 16c1 1 5 1 6 0"/><path d="M9 4c1 1 3 1 4 0"/><path d="M12 17V2"/><path d="M3 3l18 18"/></svg>`,
  milkOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2h6v3.5l2 3V20a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V8.5l2-3Z"/><path d="M7 13h3M14 13h3"/><path d="M2 2l20 20"/></svg>`,
  nutOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M12 8v2M12 14v2M3 3l18 18"/></svg>`,
  cart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.5 3h2l2.6 12.4a2 2 0 0 0 2 1.6h8.8a2 2 0 0 0 2-1.6L21.5 7H6"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,
  download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 19h16"/></svg>`,
  upload: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21V9M7 14l5-5 5 5"/><path d="M4 19h16"/></svg>`,
  share: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v13"/><path d="M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>`,
  chevronLeft: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`,
  chevronRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`,
  volume: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9v6h4l5 4V5l-5 4H5Z"/><path d="M17 8.5c1 1 1 6 0 7"/></svg>`,
  volumeOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9v6h4l5 4V5l-5 4H5Z"/><path d="M2 2l20 20"/></svg>`,
  ruler: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m3 17 6.5-6.5"/><rect x="2.5" y="12.5" width="19" height="9" rx="1.5" transform="rotate(-45 12 17)"/><path d="M8 15l1.5 1.5M11 12l1.5 1.5M14 9l1.5 1.5"/></svg>`,
  swap: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3v14M7 17 3 13M7 17l4-4"/><path d="M17 21V7M17 7l4 4M17 7l-4 4"/></svg>`,
  apple: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8c-3 0-5.5 2.5-5.5 6.5S8.5 21 11 21c1 0 1.3-.5 2-.5s1 .5 2 .5c2.2 0 4.5-2.8 4.5-6.5 0-3-1.8-5.2-4-5.5.3-1.3 1.3-2.3 2.5-2.5"/><path d="M12 8c0-2 1-3.5 2.5-4"/></svg>`,
  scale: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M7 7h10M4 7l3-4 3 4-3 4Z"/><path d="M14 7l3-4 3 4-3 4Z"/><path d="M4 7c0 2 1.3 3.5 3 3.5S10 9 10 7"/><path d="M14 7c0 2 1.3 3.5 3 3.5S20 9 20 7"/><path d="M8 21h8"/></svg>`,
  fish: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12c3-4 8-6 13-6 3 0 5 2.5 5 6s-2 6-5 6c-5 0-10-2-13-6Z"/><path d="M21 8l2 4-2 4"/><circle cx="8" cy="11" r="0.8" fill="currentColor" stroke="none"/></svg>`,
  filter: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16M7 12h10M10 19h4"/></svg>`,
};

const DIET_OPTIONS = [
  { key: 'vegan', label: 'Vegan', icon: 'leaf', tone: 'diet' },
  { key: 'vegetarisch', label: 'Vegetarisch', icon: 'leaf', tone: 'diet' },
  { key: 'fleisch', label: 'Fleisch', icon: 'chef', tone: 'protein' },
  { key: 'fisch', label: 'Fisch & Meeresfrüchte', icon: 'fish', tone: 'protein' },
  { key: 'glutenfrei', label: 'Glutenfrei', icon: 'wheatOff', tone: 'free' },
  { key: 'laktosefrei', label: 'Laktosefrei', icon: 'milkOff', tone: 'free' },
  { key: 'nussfrei', label: 'Nussfrei', icon: 'nutOff', tone: 'free' },
];

/* ---------- Mahlzeit- & Gerichtstyp-Kategorien (Master-Prompt Teil I, Punkt 94, 117) ----------
   Stabile interne IDs (englisch, unabhaengig von der sichtbaren deutschen Beschriftung —
   Punkt 117), beide Dimensionen liegen technisch in einem gemeinsamen Feld (recipe.categoryTags),
   werden aber ueber diese getrennten Listen gruppiert angezeigt. */
const MEAL_TYPE_OPTIONS = [
  { id: 'breakfast', label: 'Frühstück' },
  { id: 'brunch', label: 'Brunch' },
  { id: 'lunch', label: 'Mittagessen' },
  { id: 'dinner', label: 'Abendessen' },
  { id: 'snack', label: 'Snack' },
  { id: 'dessert', label: 'Dessert' },
];
const DISH_TYPE_OPTIONS = [
  { id: 'pasta', label: 'Pasta' },
  { id: 'rice-dish', label: 'Reisgericht' },
  { id: 'soup', label: 'Suppe' },
  { id: 'salad', label: 'Salat' },
  { id: 'sandwich', label: 'Sandwich / Wrap' },
  { id: 'pizza', label: 'Pizza / Flammkuchen' },
  { id: 'gratin', label: 'Auflauf / Gratin' },
  { id: 'stew', label: 'Eintopf' },
  { id: 'curry', label: 'Curry' },
  { id: 'bowl', label: 'Bowl' },
  { id: 'burger', label: 'Burger' },
  { id: 'baking', label: 'Backen' },
  { id: 'bread', label: 'Brot / Gebäck' },
  { id: 'cake', label: 'Kuchen / Torte' },
  { id: 'sauce', label: 'Sauce / Dip' },
  { id: 'side', label: 'Beilage' },
  { id: 'drink', label: 'Getränk' },
];
const TIME_BUCKET_OPTIONS = [
  { id: 'under-15', label: '< 15 Min.', max: 15 },
  { id: 'under-30', label: '< 30 Min.', max: 30 },
  { id: 'under-60', label: '< 60 Min.', max: 60 },
];
