/* ---------- Nutrition-Quelle: USDA FoodData Central (Implementierungsauftrag Punkt 4) ----------
   Nur Fallback, niedrigste Prioritaet — UND: die USDA-API benoetigt einen API-Key. Ein API-Key
   darf NIEMALS in einer clientseitigen, oeffentlich auf GitHub Pages gehosteten Datei stehen
   (jede Zeile hier ist fuer jeden Besucher der Seite einsehbar). Savora hat keinen eigenen
   Backend-/Edge-Service, der einen Key sicher verstecken koennte — deshalb bleibt dieser Adapter
   bewusst ein Geruest ohne Netzwerkaufruf, bis es einen solchen sicheren Service gibt.

   Wird trotzdem versucht, ihn zu benutzen, gibt er einen klaren, erklaerenden Fehler zurueck
   statt eines stillen Fehlschlags oder eines unsicheren direkten API-Aufrufs mit eingebettetem
   Key. */

const USDA_ENABLED = false;
const USDA_DISABLED_REASON = 'USDA FoodData Central benötigt einen API-Key, der niemals in einer öffentlich gehosteten Datei (GitHub Pages) stehen darf. Dieser Adapter wird erst aktiviert, wenn Savora einen sicheren Backend-/Edge-Service hat, der den Key serverseitig hält.';

/* Absichtlich gleiche Signatur wie fetchOffProductByBarcode/searchOffProducts, damit ein
   spaeterer sicherer Aufruf (ueber einen eigenen Proxy-Endpunkt statt direkt gegen die USDA-API)
   ohne Anpassungen an nutrition-matcher.js eingebaut werden kann. */
async function searchUsdaFoods(query, limit = 10) {
  if (!USDA_ENABLED) {
    console.info('Nutrition: USDA-Quelle ist deaktiviert —', USDA_DISABLED_REASON);
    return { status: 'disabled', results: [], reason: USDA_DISABLED_REASON };
  }
  // Absichtlich kein Code hier: siehe Kommentar oben. Sobald ein sicherer Proxy existiert,
  // ersetzt ein fetch() gegen die EIGENE Backend-Route (nicht direkt api.nal.usda.gov) diesen Block.
  return { status: 'disabled', results: [], reason: USDA_DISABLED_REASON };
}
