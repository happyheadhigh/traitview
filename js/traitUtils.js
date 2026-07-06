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

function getTraitCount(row){
  return Object.keys(row?.traits || {}).length;
}