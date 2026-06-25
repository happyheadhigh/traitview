/* TraitView connected wallet controller.
   Loaded after wallet.js and before app.js.
   Keep this as a classic script, not an ES module. */

   /* live settings */
window.addEventListener?.('eip6963:announceProvider', (event) => {
  const provider = event?.detail?.provider;
  if(provider && !TV_WALLET_PROVIDERS.includes(provider)) TV_WALLET_PROVIDERS.push(provider);
});
try{ window.dispatchEvent(new Event('eip6963:requestProvider')); }catch(_){}
async function buildConnectedWalletStats(addr, ids){
  const cleanIds = [...new Set((ids || []).map(Number).filter(Boolean))];
  const ranks = cleanIds.map(id => Number(OS_RANK_MAP?.get(id) || RARITY_OBS_RANK?.get(id) || 0)).filter(Boolean);
  const bestRank = ranks.length ? Math.min(...ranks) : null;
  const typeCounts = new Map();
  const categoryRareHits = new Map();
  let rarestOwned = null;
  for(const id of cleanIds.slice(0, 240)){
    let row = null;
    try{ row = (ROW_CACHE && ROW_CACHE.get(id)) || await fetchRow(id); }catch(_){}
    const entries = keepEntries(row?.traits || {});
    const visual = comboVisualTraits(entries);
    if(visual.type?.value) typeCounts.set(visual.type.value, (typeCounts.get(visual.type.value) || 0) + 1);
    for(const [name,value] of entries){
      const count = (TRAIT_FREQ[name]?.[value]) || TOKEN_COUNT || 10000;
      if(count <= Math.max(80, (TOKEN_COUNT || 10000) * 0.008)){
        categoryRareHits.set(name, (categoryRareHits.get(name) || 0) + 1);
        if(!rarestOwned || count < rarestOwned.count) rarestOwned = { id, name, value, count };
      }
    }
  }
  const dominantType = [...typeCounts.entries()].sort((a,b)=>b[1]-a[1])[0] || null;
  const strongestCategory = [...categoryRareHits.entries()].sort((a,b)=>b[1]-a[1])[0] || null;
  const tags = await computeHolderTags(addr, cleanIds);
  const personality = tags[0]?.label || (dominantType ? `${dominantType[0]} Collector` : (cleanIds.length ? 'OCAS Holder' : 'Visitor'));
  return { total:cleanIds.length, bestRank, dominantType, strongestCategory, rarestOwned, tags, personality };
}
function renderConnectedHolderPanel(host, stats){
  if(!host || !stats) return;
  const rank = stats.bestRank ? rankDiamondHtml(stats.bestRank, 'font-size:13px;font-weight:900;') : '—';
  const type = stats.dominantType ? `${stats.dominantType[0]} (${stats.dominantType[1]})` : '—';
  host.innerHTML = `
    <div class="connected-holder-inner">
      <div class="connected-holder-top">
        <div class="connected-holder-title">Connected holder</div>
        <div class="connected-holder-addr">${shortAddr(CONNECTED_WALLET.address)}</div>
      </div>
      <div class="connected-holder-stats">
        <div class="connected-holder-stat"><span>Owned</span><b>${stats.total}</b></div>
        <div class="connected-holder-stat"><span>Best</span><b>${rank}</b></div>
        <div class="connected-holder-stat"><span>Type</span><b>${comboEsc(type)}</b></div>
      </div>
      <div class="holder-tags">${renderHolderTags(stats.tags)}</div>
      <div class="connected-holder-actions">
        <button type="button" class="mispriced-mode-btn ${CONNECTED_WALLET_OWNED_ONLY ? 'active' : ''}" onclick="toggleConnectedOwnedOnly()">Owned only</button>
        <button type="button" class="mispriced-mode-btn" onclick="disconnectTraitViewWallet()">Disconnect</button>
      </div>
    </div>`;
  host.classList.add('is-visible');
  const empty = document.getElementById('mobileHolderEmpty');
  if(empty && host.id === 'mobileConnectedHolderPanel') empty.style.display = stats.total ? 'none' : 'block';
}
function updateWalletConnectButtons(status){
  const connected = !!CONNECTED_WALLET?.address;
  const label = connected ? shortAddr(CONNECTED_WALLET.address) : (status || 'Connect');
  ['walletConnectBtn','mobileWalletConnectBtn'].forEach(id => {
    const btn = document.getElementById(id);
    if(!btn) return;
    btn.classList.toggle('connected', connected);
    if(id === 'mobileWalletConnectBtn'){
      const text = btn.querySelector('.mobile-menu-label');
      const arrow = btn.querySelector('.mobile-menu-arrow');
      if(text) text.textContent = connected ? `Wallet ${label}` : 'Connect Wallet';
      if(arrow) arrow.textContent = connected ? 'connected' : 'read only';
    } else {
      btn.innerHTML = `<span>${connected ? label : label}</span>`;
    }
  });
}
function closeWalletConnectMenu(){
  document.getElementById('walletConnectMenu')?.classList.remove('open');
}
function handleWalletConnectButton(event){
  if(!CONNECTED_WALLET?.address){
    closeWalletConnectMenu();
    connectTraitViewWallet();
    return;
  }
  event?.stopPropagation?.();
  document.getElementById('walletConnectMenu')?.classList.toggle('open');
}
document.addEventListener('click', e => {
  const menu = document.getElementById('walletConnectMenu');
  const wrap = document.getElementById('desktopJumpWallet');
  if(menu?.classList.contains('open') && wrap && !wrap.contains(e.target)) closeWalletConnectMenu();
});
async function setConnectedWallet(addr, chainId, tokenIds, opts={}){
  const ids = [...new Set((tokenIds || []).map(Number).filter(Boolean))];
  CONNECTED_WALLET = { address:addr, chainId, tokenIds:ids, tokenSet:new Set(ids), stats:null };
  window.CONNECTED_WALLET = CONNECTED_WALLET;
  window._walletTokenIds = ids;
  window._mobileWalletIds = ids;
  try{ localStorage.setItem(CONNECTED_WALLET_KEY, JSON.stringify({ address:addr, chainId })); }catch(_){}
  updateWalletConnectButtons();
  const desktopInput = document.getElementById('walletInput');
  const mobileInput = document.getElementById('mobileWalletInput');
  if(desktopInput) desktopInput.value = addr;
  if(mobileInput) mobileInput.value = addr;
  const stats = await buildConnectedWalletStats(addr, ids);
  CONNECTED_WALLET.stats = stats;
  renderConnectedHolderPanel(document.getElementById('connectedHolderPanel'), stats);
  renderConnectedHolderPanel(document.getElementById('mobileConnectedHolderPanel'), stats);
  if(typeof requestWalletAnalyticsLoad === 'function'){
    requestWalletAnalyticsLoad(addr, { allowHiddenFetch: !!opts.allowHiddenAnalyticsFetch }).catch(e => console.warn('[WalletAnalytics]', e.message));
  }
  if(VS?._nodeCache) VS._nodeCache.clear();
  if(typeof renderTokenGridFromState === 'function') renderTokenGridFromState();
}
async function connectTraitViewWallet(){
  const provider = getTraitViewProvider();
  if(!provider){
    if(isMobileWalletContext()){
      openWalletLaunchModal();
      return;
    }
    alert('No wallet found. Install MetaMask, Coinbase Wallet, Rainbow, or open TraitView in a wallet browser.');
    return;
  }
  updateWalletConnectButtons('Connecting...');
  try{
    const accounts = await provider.request({ method:'eth_requestAccounts' });
    const address = accounts?.[0];
    if(!address) throw new Error('No wallet address returned.');
    const chainId = await provider.request({ method:'eth_chainId' }).catch(()=>null);
    updateWalletConnectButtons('Loading...');
    const tokenIds = await fetchWalletTokenIdsForAddress(address, true);
    await setConnectedWallet(address, chainId, tokenIds, { allowHiddenAnalyticsFetch:true });
  }catch(e){
    console.warn('[WalletConnect]', e);
    updateWalletConnectButtons();
    if(e?.code !== 4001) alert(e?.message || 'Wallet connection failed.');
  }
}
function disconnectTraitViewWallet(){
  CONNECTED_WALLET = { address:null, chainId:null, tokenIds:[], tokenSet:new Set(), stats:null };
  window.CONNECTED_WALLET = CONNECTED_WALLET;
  CONNECTED_WALLET_OWNED_ONLY = false;
  try{ localStorage.removeItem(CONNECTED_WALLET_KEY); }catch(_){}
  ['connectedHolderPanel','mobileConnectedHolderPanel'].forEach(id => {
    const host = document.getElementById(id);
    if(host){ host.innerHTML = ''; host.classList.remove('is-visible'); }
  });
  const empty = document.getElementById('mobileHolderEmpty');
  if(empty) empty.style.display = 'block';
  WALLET_ANALYTICS_CACHE.clear();
  ['walletAnalyticsHost','mobileWalletAnalyticsHost'].forEach(id => {
    const h = document.getElementById(id);
    if(h) h.innerHTML = '<div class="wallet-empty-state">Connect a wallet to load real wallet analytics from Railway.</div>';
  });
  updateWalletConnectButtons();
  if(VS?._nodeCache) VS._nodeCache.clear();
  if(typeof renderTokenGridFromState === 'function') renderTokenGridFromState();
}
function toggleConnectedOwnedOnly(){
  CONNECTED_WALLET_OWNED_ONLY = !CONNECTED_WALLET_OWNED_ONLY;
  if(CONNECTED_WALLET.stats){
    renderConnectedHolderPanel(document.getElementById('connectedHolderPanel'), CONNECTED_WALLET.stats);
    renderConnectedHolderPanel(document.getElementById('mobileConnectedHolderPanel'), CONNECTED_WALLET.stats);
  }
  if(typeof renderTokenGridFromState === 'function') renderTokenGridFromState();
}
function openConnectedWalletView(){
  const addr = CONNECTED_WALLET?.address;
  if(!addr) return;
  if(window.innerWidth <= 900 && typeof openMobileWalletDrawer === 'function'){
    openMobileWalletDrawer(addr);
    return;
  }
  const walletInput = document.getElementById('walletInput');
  const walletBody = document.getElementById('walletPanelBody');
  const walletPanel = document.getElementById('walletPanel');
  if(walletInput) walletInput.value = addr;
  if(walletBody) walletBody.style.display = 'block';
  if(walletPanel) walletPanel.classList.add('open');
  document.getElementById('walletLookupBtn')?.click();
}
function initTraitViewWallet(){
  updateWalletConnectButtons();
  const provider = getTraitViewProvider();
  if(provider && !provider._traitViewBound){
    provider._traitViewBound = true;
    provider.on?.('accountsChanged', async accounts => {
      if(!accounts?.length) disconnectTraitViewWallet();
      else {
        const chainId = await provider.request({ method:'eth_chainId' }).catch(()=>null);
        const ids = await fetchWalletTokenIdsForAddress(accounts[0], true).catch(()=>[]);
        await setConnectedWallet(accounts[0], chainId, ids, { allowHiddenAnalyticsFetch:true });
      }
    });
    provider.on?.('chainChanged', chainId => {
      if(CONNECTED_WALLET?.address){ CONNECTED_WALLET.chainId = chainId; window.CONNECTED_WALLET = CONNECTED_WALLET; }
    });
  }
  try{
    const saved = JSON.parse(localStorage.getItem(CONNECTED_WALLET_KEY) || 'null');
    if(saved?.address){
      const cached = readConnectedWalletTokenCache(saved.address);
      if(cached) setConnectedWallet(saved.address, saved.chainId || null, cached);
      else updateWalletConnectButtons(shortAddr(saved.address));
    }
  }catch(_){}
}
document.addEventListener('DOMContentLoaded', initTraitViewWallet);


// ── Discord↔TraitView verification ───────────────────────────────────────────
// TV_DISCORD_LINK is set after a successful claim, persisted in sessionStorage
let TV_DISCORD_LINK = null;
try {
  const stored = sessionStorage.getItem('tv_discord_link');
  if(stored) TV_DISCORD_LINK = JSON.parse(stored);
} catch(_) {}

async function tvDiscordClaimCode(code) {
  const clean = (code || '').trim().toUpperCase();
  if(clean.length !== 6) throw new Error('Code must be 6 characters');
  const data = await dbFetch('/tv/claim-code', {}, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: clean }),
  });
  if(!data.ok) throw new Error(data.error || 'Claim failed');
  TV_DISCORD_LINK = { discord_id: data.discord_id, wallet: data.wallet, guild_id: data.guild_id };
  try { sessionStorage.setItem('tv_discord_link', JSON.stringify(TV_DISCORD_LINK)); } catch(_) {}
  return TV_DISCORD_LINK;
}

async function tvDiscordGenerateCodeAndShow() {
  // Show modal asking user to enter code from Discord bot
  const modal = document.createElement('div');
  modal.id = 'tv-discord-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:9999';
  modal.innerHTML = `
    <div style="background:#1e1f22;border-radius:12px;padding:28px 32px;max-width:420px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.5)">
      <h3 style="margin:0 0 8px;color:#fff;font-size:18px">🔗 Connect Discord</h3>
      <p style="color:#b5bac1;font-size:14px;margin:0 0 20px">
        Open <b style="color:#fff">Discord</b>, go to <b style="color:#fff">/me → TraitView</b>,
        tap <b style="color:#fff">Generate Code</b>, then enter the 6-character code below.
      </p>
      <input id="tv-discord-code-input" maxlength="6" placeholder="ABC123"
        style="width:100%;box-sizing:border-box;padding:12px 16px;border-radius:8px;border:1px solid #3f4147;background:#2b2d31;color:#fff;font-size:22px;letter-spacing:6px;text-align:center;text-transform:uppercase;outline:none;margin-bottom:16px">
      <div id="tv-discord-error" style="color:#ed4245;font-size:13px;margin-bottom:12px;display:none"></div>
      <div style="display:flex;gap:10px">
        <button id="tv-discord-submit" style="flex:1;padding:10px;border-radius:8px;border:none;background:#5865f2;color:#fff;font-weight:600;cursor:pointer;font-size:15px">Link Account</button>
        <button id="tv-discord-cancel" style="padding:10px 16px;border-radius:8px;border:none;background:#2b2d31;color:#b5bac1;cursor:pointer;font-size:15px">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const input = modal.querySelector('#tv-discord-code-input');
  const errEl = modal.querySelector('#tv-discord-error');
  const submitBtn = modal.querySelector('#tv-discord-submit');
  const cancelBtn = modal.querySelector('#tv-discord-cancel');

  input.focus();
  input.addEventListener('input', () => { input.value = input.value.toUpperCase(); });

  cancelBtn.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if(e.target === modal) modal.remove(); });

  submitBtn.addEventListener('click', async () => {
    const code = input.value.trim();
    errEl.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Linking...';
    try {
      const link = await tvDiscordClaimCode(code);
      modal.remove();
      tvShowLinkedBanner(link.wallet);
    } catch(e) {
      const msgs = {
        invalid_code: 'Invalid code. Check Discord and try again.',
        code_expired: 'Code expired. Generate a new one in Discord.',
        code_already_used: 'Code already used. Generate a new one.',
      };
      errEl.textContent = msgs[e.message] || e.message;
      errEl.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Link Account';
    }
  });
}

function tvShowLinkedBanner(wallet) {
  const short = wallet ? wallet.slice(0,6)+'...'+wallet.slice(-4) : '';
  const banner = document.createElement('div');
  banner.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#23a55a;color:#fff;padding:12px 24px;border-radius:10px;font-weight:600;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.3)';
  banner.textContent = `✅ Discord linked! Wallet: ${short}`;
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 5000);
}

// Override dbFetch to support POST for TV endpoints
const _origDbFetch = typeof dbFetch !== 'undefined' ? dbFetch : null;
async function dbFetch(path, params = {}, fetchOpts = {}) {
  const qs = new URLSearchParams({ ...params, key: RAILWAY_KEY });
  const url = `${RAILWAY_API}${path}?${qs}`;
  const r = await fetch(url, fetchOpts);
  if(!r.ok) {
    const err = await r.json().catch(()=>({}));
    throw new Error(err.error || `DB ${path} HTTP ${r.status}`);
  }
  const ct = r.headers.get('content-type') || '';
  if(!ct.includes('application/json')) throw new Error(`DB ${path} returned non-JSON`);
  return r.json();
}
