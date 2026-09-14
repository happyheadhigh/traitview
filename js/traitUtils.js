/* TraitView trait utility helpers.
   Loaded before app.js.
   Keep this as a classic script, not an ES module. */

function keepEntries(o){
  const out = [];
  for(const [k,v] of Object.entries(o || {})){
    // Internal fields (image data, raw attribute arrays) sometimes ride
    // along in a traits object depending on the data source -- they're
    // never meant for display, only real named traits are.
    if(k.startsWith('__')) continue;
    if(v !== undefined && v !== null && String(v).trim() !== ''){
      out.push([k, String(v)]);
    }
  }
  return out;
}

function traitDisplayLabel(k){
  return String(k || '').trim().toLowerCase() === 'kind' ? 'Type' : String(k || '');
}

// jv confirmed live on Argonauts: two special-category attributes, Fate
// ("Burned", added only to burned tokens) and Relic ("Gold", added
// alongside Fate for the same tokens -- both max out at exactly ONE
// possible value across the whole collection, unlike a real worn trait
// like Cloak/Crown/Sight/Artifact which each have several. Neither is a
// normal wearable trait; both were layered onto burned tokens' metadata
// after the fact by ACK, for the animated-burn art. Counting them toward
// "traits worn" pushed those tokens' trait count 2 higher than the
// official site's, and Bones/Palette/Print were already excluded as the
// three always-present base attributes every Argonaut has regardless of
// what's worn. COLLECTIONS[slug].nonWornTraitCategories (config.js) is the
// per-collection list of category names to leave out of this count
// entirely -- empty/undefined for every other collection, so this changes
// nothing for them.
function getTraitCount(row){
  const entries = Object.keys(row?.traits || {});
  const excluded = (typeof COLLECTIONS !== 'undefined' && typeof LIVE_SLUG !== 'undefined' && COLLECTIONS[LIVE_SLUG]?.nonWornTraitCategories) || [];
  if(!excluded.length) return entries.length;
  const excludedLower = new Set(excluded.map(c => c.toLowerCase()));
  return entries.filter(k => !excludedLower.has(String(k).toLowerCase())).length;
}