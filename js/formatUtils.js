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

// jv confirmed live on nekoadz (Robinhood Chain, USDG): grid/tile price
// badges showed the ETH glyph regardless of the token's actual listing
// currency -- same bug class as the floor pill's own fix (fetchFloor's
// `${['ETH','WETH'].includes(sym) ? 'Ξ ' : ''}` pattern in app.js), just
// never applied to these per-token badges, which instead hardcoded "Ξ"
// for anything that wasn't WETH. Returns the glyph/suffix pieces so each
// call site can still style them (WETH's red vs everything else's teal,
// etc.) however it already does, rather than duplicating the same
// currency check with a different one-off answer at each of the four
// places this was wrong.
function priceGlyphAndSuffix(currency){
  const sym = (currency || 'ETH').toUpperCase();
  if(sym === 'ETH') return { glyph: 'Ξ', suffix: '' };
  if(sym === 'WETH') return { glyph: '', suffix: ' WETH' };
  return { glyph: '', suffix: ' ' + sym };
}

function comboEsc(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}