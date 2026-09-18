function shortAddr(addr){
  const s = String(addr || '');
  return s.length > 12 ? `${s.slice(0,6)}…${s.slice(-4)}` : s;
}
function getTraitViewProvider(){
  if(TV_WALLET_PROVIDERS.length) return TV_WALLET_PROVIDERS[0];
  if(window.ethereum?.providers?.length) return window.ethereum.providers[0];
  return window.ethereum || null;
}
function isMobileWalletContext(){
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '') || window.innerWidth <= 900;
}
function walletLaunchLinks(){
  const url = location.href;
  const noProto = url.replace(/^https?:\/\//i, '');
  const encoded = encodeURIComponent(url);
  return [
    { label:'Open in MetaMask', href:`https://metamask.app.link/dapp/${noProto}` },
    { label:'Open in Coinbase Wallet', href:`https://go.cb-w.com/dapp?cb_url=${encoded}` },
    { label:'Open in Rainbow', href:`https://rnbwapp.com/wc?uri=${encoded}` },
    { label:'Open in Trust Wallet', href:`trust://browser_enable?url=${encoded}` }
  ];
}
function openWalletLaunchModal(){
  const modal = document.getElementById('walletLaunchModal');
  const actions = document.getElementById('walletLaunchActions');
  if(!modal || !actions) return;
  actions.innerHTML = walletLaunchLinks().map(link => `<a href="${comboEsc(link.href)}" rel="noreferrer">${comboEsc(link.label)} <span>↗</span></a>`).join('');
  modal.classList.add('open');
}
function closeWalletLaunchModal(){
  document.getElementById('walletLaunchModal')?.classList.remove('open');
}
function connectedWalletAddress(){
  return CONNECTED_WALLET?.address || '';
}
function connectedWalletOwns(id){
  return !!(CONNECTED_WALLET?.tokenSet && CONNECTED_WALLET.tokenSet.has(+id));
}
function applyConnectedOwnedFilter(ids){
  if(!CONNECTED_WALLET_OWNED_ONLY || !CONNECTED_WALLET?.tokenSet?.size) return ids;
  return ids.filter(id => CONNECTED_WALLET.tokenSet.has(+id));
}
function connectedWalletCacheKey(addr){
  // jv confirmed live: this had zero collection-awareness at all -- same
  // collision-bug class already fixed multiple times elsewhere in this app
  // (the sessionStorage image cache, VS._nodeCache, etc.). A wallet's owned
  // token IDs for one collection were being served back as if they were
  // valid for a completely different collection after switching, with no
  // way to tell the two apart.
  return `traitview_wallet_tokens:${typeof LIVE_SLUG !== 'undefined' && LIVE_SLUG ? LIVE_SLUG : 'unknown'}:${String(addr || '').toLowerCase()}`;
}
function walletChainLabel(chainId){
  const n = typeof chainId === 'string' ? parseInt(chainId, 16) : Number(chainId || 0);
  if(n === 1) return 'Ethereum';
  if(n === 8453) return 'Base';
  if(n === 137) return 'Polygon';
  if(n === 42161) return 'Arbitrum';
  return chainId ? `Chain ${n || chainId}` : '—';
}
function readConnectedWalletTokenCache(addr){
  try{
    const raw = localStorage.getItem(connectedWalletCacheKey(addr));
    const data = raw ? JSON.parse(raw) : null;
    if(!data || !Array.isArray(data.ids) || Date.now() - Number(data.ts || 0) > CONNECTED_WALLET_CACHE_TTL) return null;
    return data.ids.map(Number).filter(Boolean);
  }catch(_){ return null; }
}
function writeConnectedWalletTokenCache(addr, ids){
  try{
    localStorage.setItem(connectedWalletCacheKey(addr), JSON.stringify({ ts:Date.now(), ids:[...new Set(ids || [])] }));
  }catch(_){}
}
async function fetchWalletTokenIdsForAddress(addr, useCache=true){
  if(useCache){
    const cached = readConnectedWalletTokenCache(addr);
    if(cached) return cached;
  }
  const worker = typeof LIVE_ENDPOINT !== 'undefined' ? LIVE_ENDPOINT : 'https://nft-live-listings.jvweb3.workers.dev';
  const contract = typeof LIVE_CONTRACT !== 'undefined' ? LIVE_CONTRACT : '0x078be86f3104a32313a47815792230a3808642cc';
  const slug = typeof LIVE_SLUG !== 'undefined' ? LIVE_SLUG : 'on-chain-all-stars';
  const chain = typeof LIVE_CHAIN !== 'undefined' ? LIVE_CHAIN : 'ethereum';
  let tokenIds = [];
  // jv: "Nekoadz collection page isn't reading that my wallet is already
  // connected" -- shown as "Connect Wallet" outright, not just missing a
  // verified badge, meaning the whole restore chain was aborting. Neither
  // lookup below had a try/catch: an uncaught exception from either one
  // (this chain's own lookup failing in whatever way -- Alchemy likely
  // doesn't index Robinhood Chain at all, being a standard-EVM indexing
  // service) rejected this function's entire promise, which the restore
  // code in walletConnect.js catches with a silent .catch(()=>{}) --
  // aborting before setConnectedWallet() ever runs, leaving the button
  // stuck on "Connect Wallet" instead of the actual address. Wrapping
  // each lookup so a failure on either one degrades to an empty token
  // list instead of aborting the restore.
  try{
    const alchemyUrl = `${worker}/nft/wallet?address=${encodeURIComponent(addr)}&contract=${encodeURIComponent(contract)}&chain=${encodeURIComponent(chain)}`;
    const r = await fetch(alchemyUrl, { cache:'no-store' });
    const j = r.ok ? await r.json() : null;
    if(j?.ok && Array.isArray(j.tokenIds)) tokenIds = j.tokenIds;
  }catch(e){
    console.warn('[wallet] Alchemy-based token lookup failed, falling back to OpenSea:', e.message);
  }
  if(!tokenIds.length){
    try{
      let allNfts = [], cursor = null;
      for(let page = 0; page < 3; page++){
        const qs = new URLSearchParams({ address:addr, slug, contract, chain });
        if(cursor) qs.set('cursor', cursor);
        const rr = await fetch(`${worker}/os/wallet?${qs}`, { cache:'no-store' });
        if(!rr.ok) break;
        const jj = await rr.json();
        if(!jj.ok) break;
        allNfts = allNfts.concat(jj.nfts || []);
        cursor = jj.next || null;
        if(!cursor) break;
        await new Promise(resolve => setTimeout(resolve, 80));
      }
      tokenIds = allNfts.map(n => +n.identifier);
    }catch(e){
      console.warn('[wallet] OpenSea-based token lookup fallback also failed:', e.message);
    }
  }
  // Generous, collection-agnostic sanity bound (was hardcoded to 10000 --
  // an OCAS/CryptoPunks-coincidental number, not a real business rule,
  // and would silently drop legitimate token ids for any collection with
  // a larger supply or different id numbering).
  tokenIds = [...new Set(tokenIds.map(Number).filter(id => id >= 1 && id <= 10_000_000))];
  writeConnectedWalletTokenCache(addr, tokenIds);
  return tokenIds;
}