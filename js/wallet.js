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
  return `traitview_wallet_tokens:${String(addr || '').toLowerCase()}`;
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
  let tokenIds = [];
  const alchemyUrl = `${worker}/nft/wallet?address=${encodeURIComponent(addr)}&contract=${encodeURIComponent(contract)}`;
  const r = await fetch(alchemyUrl, { cache:'no-store' });
  const j = r.ok ? await r.json() : null;
  if(j?.ok && Array.isArray(j.tokenIds)) tokenIds = j.tokenIds;
  if(!tokenIds.length){
    let allNfts = [], cursor = null;
    for(let page = 0; page < 3; page++){
      const qs = new URLSearchParams({ address:addr, slug, contract });
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
  }
  tokenIds = [...new Set(tokenIds.map(Number).filter(id => id >= 1 && id <= 10000))];
  writeConnectedWalletTokenCache(addr, tokenIds);
  return tokenIds;
}