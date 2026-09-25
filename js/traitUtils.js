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

// Counts a sale event's own nft.traits array the same way getTraitCount()
// counts a row's traits object -- same per-collection exclusion list, just
// adapted for the array shape OpenSea's sale payloads use instead of the
// object shape row.traits uses. See getTraitCount() above for the full
// reasoning; kept as its own small function rather than merging the two
// since the input shapes genuinely differ (array of {trait_type,value} vs.
// a plain object), not worth forcing into one signature.
function countSaleTraits(nftTraits){
  const list = nftTraits || [];
  const excluded = (typeof COLLECTIONS !== 'undefined' && typeof LIVE_SLUG !== 'undefined' && COLLECTIONS[LIVE_SLUG]?.nonWornTraitCategories) || [];
  if(!excluded.length) return list.length;
  const excludedLower = new Set(excluded.map(c => c.toLowerCase()));
  return list.filter(t => !excludedLower.has(String(t.trait_type || '').toLowerCase())).length;
}