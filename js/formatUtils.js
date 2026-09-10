/* TraitView formatting and URL helpers.
   Loaded before app.js.
   Keep this as a classic script, not an ES module. */

function imgForId(id){
  // Confirmed live: this builds a path into OCAS's own static image files,
  // keyed purely by numeric token ID with zero collection awareness at all
  // -- there's no equivalent static file for any other collection. Used as
  // a fallback at 12+ call sites throughout app.js; without this guard,
  // every one of them would silently show OCAS's own token image for
  // whatever numeric ID happened to coincide with the token actually being
  // viewed in a different collection (confirmed exactly this happening for
  // Argonauts). Returning null here is a blunt, centralized safety net --
  // it stops the wrong image from ever showing, even though the handful of
  // call sites that don't already check CHUNK_CACHE's live DB-sourced
  // image first (unlike _getTokenImgSrc, which does) will show no image at
  // all for a non-OCAS collection rather than the actual correct one.
  if(typeof LIVE_SLUG !== 'undefined' && LIVE_SLUG !== 'on-chain-all-stars') return null;
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

function comboEsc(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}