/* TraitView trait utility helpers.
   Loaded before app.js.
   Keep this as a classic script, not an ES module. */

function keepEntries(o){
  const out = [];
  for(const [k,v] of Object.entries(o || {})){
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