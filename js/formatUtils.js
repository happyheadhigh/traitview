/* TraitView formatting and URL helpers.
   Loaded before app.js.
   Keep this as a classic script, not an ES module. */

function imgForId(id){
  return IMAGE_PATTERN.replace('{id}', id);
}

const ipfsToHttp = u =>
  (typeof u === 'string' && u.startsWith('ipfs://'))
    ? ('https://ipfs.io/ipfs/' + u.slice(7))
    : u;

function parseEthMaybeWei(v){
  if(v == null || v === '') return null;
  if(typeof v === 'string' && /^\d+$/.test(v) && v.length > 12) return Number(v) / 1e18;
  const n = Number(v);
  if(!Number.isFinite(n)) return null;
  return n > 1000000 ? n / 1e18 : n;
}

function formatEth(v){
  if(v == null) return '';
  const n = Math.max(0, Number(v));
  if(!isFinite(n)) return '';
  const x = (n >= 1) ? n.toFixed(3) : n.toFixed(4);
  return 'Ξ' + x.replace(/0+$/,'').replace(/\.$/,'');
}

function fmt(n){ return n.toLocaleString();
}