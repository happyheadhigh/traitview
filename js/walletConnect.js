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
function _ensureWalletMenu() {
  let menu = document.getElementById('walletConnectMenu');
  if(!menu) {
    // Create menu as direct body child to escape topbar stacking context
    menu = document.createElement('div');
    menu.id = 'walletConnectMenu';
    menu.innerHTML = `
      <div id="walletConnectMenuConnect" style="display:none">
        <button type="button" onclick="connectTraitViewWallet();closeWalletConnectMenu()">Connect Wallet</button>
        <button type="button" onclick="tvShowDiscordVerifyModal();closeWalletConnectMenu()">Discord Verify</button>
      </div>
      <div id="walletConnectMenuConnected" style="display:none">
        <button type="button" onclick="openConnectedWalletView();closeWalletConnectMenu()">Wallet View</button>
        <button type="button" onclick="tvShowDiscordVerifyModal();closeWalletConnectMenu()">Discord Verify</button>
        <button type="button" onclick="disconnectTraitViewWallet();closeWalletConnectMenu()">Disconnect</button>
      </div>`;
    document.body.appendChild(menu);
    // Close on outside click
    document.addEventListener('click', e => {
      if(menu.classList.contains('open') && !menu.contains(e.target) && e.target.id !== 'walletConnectBtn') {
        closeWalletConnectMenu();
      }
    });
  }
  return menu;
}

function handleWalletConnectButton(event){
  event?.stopPropagation?.();
  const menu = _ensureWalletMenu();
  const btn = document.getElementById('walletConnectBtn');
  const connectDiv = document.getElementById('walletConnectMenuConnect');
  const connectedDiv = document.getElementById('walletConnectMenuConnected');
  const isConnected = !!CONNECTED_WALLET?.address;
  if(connectDiv) connectDiv.style.display = isConnected ? 'none' : 'block';
  if(connectedDiv) connectedDiv.style.display = isConnected ? 'block' : 'none';

  // Position relative to button — fixed so it escapes all stacking contexts
  if(btn) {
    const rect = btn.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = (rect.bottom + 6) + 'px';
    menu.style.left = 'auto';
    menu.style.right = Math.max(8, window.innerWidth - rect.right) + 'px';
    menu.style.zIndex = '99999';
  }
  menu.classList.toggle('open');
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
  if(typeof tvCheckLinkStatus === 'function') tvCheckLinkStatus(addr).catch(()=>{});
  if(typeof syncFavoritesWithWallet === 'function') syncFavoritesWithWallet(addr).catch(()=>{});
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
// ── Mobile wallet action sheet ──────────────────────────────────────────────
// Desktop's #walletConnectMenu is a dropdown anchored to a topbar button that
// doesn't exist in the mobile layout (that button lives inside the mobile
// menu instead, and just calls connectTraitViewWallet() directly with no
// menu at all once already connected — meaning Discord Verify was
// unreachable from "Connect Wallet" on mobile). This reuses the same
// wallet-launch-modal visual pattern already proven mobile-friendly.
function handleMobileWalletConnectButton(){
  if(!CONNECTED_WALLET?.address){
    connectTraitViewWallet();
    return;
  }
  document.getElementById('mobileWalletActionModal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'mobileWalletActionModal';
  modal.className = 'wallet-launch-modal open';
  modal.addEventListener('click', e => { if(e.target === modal) modal.remove(); });
  const addr = CONNECTED_WALLET.address;
  modal.innerHTML = `
    <div class="wallet-launch-box">
      <div class="wallet-launch-head">
        <div class="wallet-launch-title">${comboEsc(shortAddr(addr))}</div>
        <button type="button" onclick="document.getElementById('mobileWalletActionModal').remove()" style="background:none;border:none;color:var(--sub);font-size:22px;cursor:pointer;padding:0;line-height:1">×</button>
      </div>
      <div class="wallet-launch-actions">
        <button type="button" onclick="document.getElementById('mobileWalletActionModal').remove();if(typeof openMobileWalletDrawer==='function') openMobileWalletDrawer('${comboEsc(addr)}')">Wallet View</button>
        <button type="button" onclick="document.getElementById('mobileWalletActionModal').remove();if(typeof tvShowDiscordVerifyModal==='function') tvShowDiscordVerifyModal()">🔗 Discord Verify</button>
        <button type="button" onclick="document.getElementById('mobileWalletActionModal').remove();disconnectTraitViewWallet()">Disconnect</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
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
      if(cached){
        setConnectedWallet(saved.address, saved.chainId || null, cached);
      } else {
        // Cache is cold (expired after 10min, or first visit this session) —
        // still fetch fresh and properly reconnect, rather than just showing
        // the address in the button with CONNECTED_WALLET left unset. Leaving
        // it unset here meant tvCheckLinkStatus never ran, so "Discord Verify"
        // always looked unlinked even for an already-linked wallet.
        updateWalletConnectButtons(shortAddr(saved.address));
        fetchWalletTokenIdsForAddress(saved.address, false).then(ids => {
          setConnectedWallet(saved.address, saved.chainId || null, ids);
        }).catch(()=>{});
      }
    }
  }catch(_){}
}
document.addEventListener('DOMContentLoaded', initTraitViewWallet);


// ── Discord↔TraitView verification ───────────────────────────────────────────
// TV_DISCORD_LINK reflects the live server-side link status for the
// currently connected wallet - checked fresh on every connection via
// /tv/link-status-by-wallet rather than cached client-side. This means
// verification persists correctly across browser sessions and even
// different computers, since it's a straight lookup by wallet address
// against the server's traitview_links table, not anything stored locally.
let TV_DISCORD_LINK = null;

async function tvCheckLinkStatus(wallet){
  if(!wallet) { TV_DISCORD_LINK = null; return null; }
  try{
    const url = `${RAILWAY_API}/tv/link-status-by-wallet?wallet=${encodeURIComponent(wallet)}&key=${RAILWAY_KEY}`;
    const r = await fetch(url);
    const data = await r.json();
    if(data?.linked){
      TV_DISCORD_LINK = { discord_id: data.discord_id, wallet, guild_id: data.guild_id };
    } else {
      TV_DISCORD_LINK = null;
    }
  }catch(e){
    console.warn('[TVLinkStatus]', e.message);
  }
  return TV_DISCORD_LINK;
}

async function tvDiscordClaimCode(code) {
  const clean = (code || '').trim().toUpperCase();
  if(clean.length !== 6) throw new Error('Code must be 6 characters');
  const url = `${RAILWAY_API}/tv/claim-code?key=${RAILWAY_KEY}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: clean }),
  });
  const data = await r.json();
  if(!r.ok) throw new Error(data.error || 'Claim failed');
  TV_DISCORD_LINK = { discord_id: data.discord_id, wallet: data.wallet, guild_id: data.guild_id };
  return TV_DISCORD_LINK;
}

async function tvShowDiscordVerifyModal(opts={}) {
  // Remove any existing modal
  document.getElementById('tv-discord-modal')?.remove();

  const addr = CONNECTED_WALLET?.address;
  if(addr && typeof tvCheckLinkStatus === 'function'){
    try{ await tvCheckLinkStatus(addr); }catch(_){}
  }
  const alreadyLinked = !opts.force && addr && TV_DISCORD_LINK && String(TV_DISCORD_LINK.wallet||'').toLowerCase() === String(addr).toLowerCase();

  const modal = document.createElement('div');
  modal.id = 'tv-discord-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;z-index:9999';

  if(alreadyLinked){
    modal.innerHTML = `
      <div style="background:var(--surface,#1a1d23);border:1px solid rgba(28,255,175,.25);border-radius:12px;padding:28px;max-width:400px;width:calc(100% - 32px);box-shadow:0 16px 48px rgba(0,0,0,.55);text-align:center">
        <div style="font-size:32px;margin-bottom:8px">✅</div>
        <div style="font:700 15px/1 'Space Grotesk',system-ui,sans-serif;color:var(--text,#e6e8eb);margin-bottom:8px">Already Linked</div>
        <p style="color:var(--sub,#8b8fa8);font-size:13px;margin:0 0 20px;line-height:1.5">This wallet is already linked to your Discord account.</p>
        <div style="display:flex;gap:8px">
          <button id="tv-dc-relink" style="flex:1;padding:9px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:transparent;color:var(--sub,#8b8fa8);font:600 13px/1 'Space Grotesk',system-ui,sans-serif;cursor:pointer">Link a different code</button>
          <button id="tv-dc-close" style="padding:9px 14px;border-radius:8px;border:none;background:#1CFFAF;color:#0a0f16;font:700 13px/1 'Space Grotesk',system-ui,sans-serif;cursor:pointer">Done</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#tv-dc-close').addEventListener('click', () => modal.remove());
    modal.querySelector('#tv-dc-relink').addEventListener('click', () => { modal.remove(); tvShowDiscordVerifyModal({ force:true }); });
    modal.addEventListener('click', e => { if(e.target === modal) modal.remove(); });
    return;
  }

  modal.innerHTML = `
    <div style="background:var(--surface,#1a1d23);border:1px solid rgba(255,255,255,.10);border-radius:12px;padding:28px 28px 24px;max-width:400px;width:calc(100% - 32px);box-shadow:0 16px 48px rgba(0,0,0,.55)">
      <div style="font:700 15px/1 'Space Grotesk',system-ui,sans-serif;color:var(--text,#e6e8eb);margin-bottom:8px">Discord Verify</div>
      <p style="color:var(--sub,#8b8fa8);font-size:13px;margin:0 0 20px;line-height:1.5">
        In Discord, open <b style="color:var(--text,#e6e8eb)">/me → TraitView → Generate Code</b>, then enter the 6-character code below.
      </p>
      <input id="tv-dc-input" maxlength="6" placeholder="Enter code"
        style="width:100%;box-sizing:border-box;padding:11px 14px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:var(--text,#e6e8eb);font:700 20px/1 'Space Grotesk',monospace;letter-spacing:8px;text-align:center;text-transform:uppercase;outline:none;margin-bottom:10px;transition:border-color .15s">
      <div id="tv-dc-err" style="color:#ed4245;font-size:12px;min-height:18px;margin-bottom:10px"></div>
      <div style="display:flex;gap:8px">
        <button id="tv-dc-submit" style="flex:1;padding:9px;border-radius:8px;border:none;background:#1CFFAF;color:#0a0f16;font:700 13px/1 'Space Grotesk',system-ui,sans-serif;cursor:pointer">Verify</button>
        <button id="tv-dc-cancel" style="padding:9px 14px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:transparent;color:var(--sub,#8b8fa8);font:600 13px/1 'Space Grotesk',system-ui,sans-serif;cursor:pointer">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const input = modal.querySelector('#tv-dc-input');
  const errEl = modal.querySelector('#tv-dc-err');
  const submitBtn = modal.querySelector('#tv-dc-submit');

  input.focus();
  input.addEventListener('input', () => { input.value = input.value.toUpperCase(); errEl.textContent = ''; });
  modal.querySelector('#tv-dc-cancel').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if(e.target === modal) modal.remove(); });

  submitBtn.addEventListener('click', async () => {
    const code = input.value.trim();
    if(code.length < 6) { errEl.textContent = 'Enter the full 6-character code.'; return; }
    errEl.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Verifying...';
    try {
      const link = await tvDiscordClaimCode(code);
      modal.remove();
      // Clean up URL param if present
      const url = new URL(window.location.href);
      if(url.searchParams.has('verify')) { url.searchParams.delete('verify'); window.history.replaceState({}, '', url); }
      tvShowLinkedBanner(link.wallet);
      // Auto-load wallet analytics with the verified wallet
      if(link.wallet) {
        try {
          const ids = await fetchWalletTokenIdsForAddress(link.wallet);
          await setConnectedWallet(link.wallet, null, ids, { allowHiddenAnalyticsFetch: true });
        } catch(e) {
          console.warn('[TVVerify] auto-load wallet failed:', e.message);
        }
      }
    } catch(e) {
      const msgs = {
        invalid_code: 'Invalid code. Check Discord and try again.',
        code_expired: 'Code expired. Generate a new one in Discord.',
        code_already_used: 'Code already used. Generate a new one in Discord.',
      };
      errEl.textContent = msgs[e.message] || e.message;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Verify';
    }
  });
}

// Auto-open verify modal if ?verify=true in URL
(function() {
  const params = new URLSearchParams(window.location.search);
  if(params.get('verify') === 'true') {
    // Wait for page to load before showing modal
    window.addEventListener('load', () => setTimeout(tvShowDiscordVerifyModal, 500));
  }
})();

function tvShowLinkedBanner(wallet) {
  const short = wallet ? wallet.slice(0,6)+'...'+wallet.slice(-4) : '';
  const banner = document.createElement('div');
  banner.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#23a55a;color:#fff;padding:12px 24px;border-radius:10px;font-weight:600;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.3)';
  banner.textContent = `✅ Discord linked! Wallet: ${short}`;
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 5000);
}


