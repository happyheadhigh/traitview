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

// Excludes a per-collection list of category names from the trait-count.
// See COLLECTIONS[slug].nonWornTraitCategories (config.js) for the actual
// list and reasoning per collection -- empty/undefined here means nothing
// changes for that collection.
function getTraitCount(row){
  const entries = Object.keys(row?.traits || {});
  const excluded = (typeof COLLECTIONS !== 'undefined' && typeof LIVE_SLUG !== 'undefined' && COLLECTIONS[LIVE_SLUG]?.nonWornTraitCategories) || [];
  if(!excluded.length) return entries.length;
  const excludedLower = new Set(excluded.map(c => c.toLowerCase()));
  return entries.filter(k => !excludedLower.has(String(k).toLowerCase())).length;
}