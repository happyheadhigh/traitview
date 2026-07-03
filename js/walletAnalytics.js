const WALLET_ANALYTICS_CACHE = new Map();
let WALLET_ACTIVITY_PLOT_PENDING = null;

function walletAnalyticsAreaIsVisible(){
  const walletTab = document.getElementById('ttab-wallet');
  const mobileHolder = document.getElementById('mobileHolderDrawer');
  const mobileWallet = document.getElementById('mobileWalletDrawer');
  const mobileSheet = document.getElementById('mobileAnalyticsSheet');
  return !!(
    (walletTab && walletTab.classList.contains('active')) ||
    (mobileHolder && mobileHolder.classList.contains('open')) ||
    (mobileWallet && mobileWallet.classList.contains('open')) ||
    (mobileSheet && mobileSheet.classList.contains('open') && walletTab && walletTab.style.display !== 'none')
  );
}

function walletAnalyticsElementIsVisible(el){
  if(!el) return false;
  const rect = el.getBoundingClientRect?.();
  if(rect && (rect.width <= 0 || rect.height <= 0)) return false;
  return !!(el.offsetParent || el.getClientRects?.().length);
}

function flushWalletActivityPlot(){
  const pending = WALLET_ACTIVITY_PLOT_PENDING;
  if(!pending) return;
  const host = document.getElementById(pending.hostId);
  if(!walletAnalyticsElementIsVisible(host)) return;
  WALLET_ACTIVITY_PLOT_PENDING = null;
  pending.render();
}

function requestWalletAnalyticsLoad(address, opts={}){
  const addr = String(address || CONNECTED_WALLET?.address || '').trim();
  if(!addr || opts.force) return loadWalletAnalytics(addr, opts);
  const visible = walletAnalyticsAreaIsVisible();
  const key = addr.toLowerCase();
  if(!visible && !opts.allowHiddenFetch){
    return Promise.resolve(WALLET_ANALYTICS_CACHE.get(key) || null);
  }
  return loadWalletAnalytics(addr, opts).then(data => {
    setTimeout(flushWalletActivityPlot, 80);
    return data;
  });
}

function walletMetric(v, fallback='-'){
  if(v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  if(Number.isFinite(n)){
    if(Math.abs(n) >= 1000) return n.toLocaleString(undefined,{maximumFractionDigits:2});
    if(Math.abs(n) < 1 && n !== 0) return n.toFixed(4);
    return n.toLocaleString(undefined,{maximumFractionDigits:2});
  }
  return String(v);
}
function walletEth(v){
  const n = Number(v);
  return Number.isFinite(n) ? `Ξ ${n.toFixed(n >= 1 ? 3 : 4)}` : '-';
}
function walletPnl(v){
  const n = Number(v);
  if(!Number.isFinite(n)) return { text: '-', color: 'var(--sub)' };
  const sign = n > 0 ? '+' : (n < 0 ? '-' : '');
  const abs = Math.abs(n);
  return { text: `${sign}Ξ ${abs.toFixed(abs >= 1 ? 3 : 4)}`, color: n > 0 ? '#4ade80' : (n < 0 ? '#f87171' : 'var(--sub)') };
}
function walletDate(v){
  if(!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined,{month:'short',day:'numeric'});
}
function walletTokenId(t){
  return Number(t?.token_id ?? t?.id ?? t?.tokenId ?? t?.identifier ?? 0);
}
function walletTopTokenCard(t){
  const id = walletTokenId(t);
  if(!id) return '';
  const osRank = t.os_rank ?? t.rank ?? t.best_rank ?? getRankLabel(id, 'os');
  const tvRank = t.obs_rank ?? t.tv_rank ?? getRankLabel(id, 'tv');
  const price = t.price_eth ?? t.listed_price ?? t.listing_price ?? null;
  const src = (typeof VS !== 'undefined' && VS._imgSrc) ? VS._imgSrc(id) : imgForId(id);
  return `<div class="wallet-top-token" onclick="openModal(${id})">
    <div class="wallet-top-token-img"><img src="${comboEsc(src)}" alt="#${id}" loading="lazy"></div>
    <div class="wallet-top-token-body">
      <div class="wallet-token-id">#${id}</div>
      <div class="wallet-token-meta">${osRank ? `OS ${walletMetric(osRank)}` : 'OS -'}${tvRank ? ` · TV ${walletMetric(tvRank)}` : ''}</div>
      <div class="wallet-token-meta">${price != null ? walletEth(price) : 'Not listed'}</div>
    </div>
  </div>`;
}
function normalizeWalletTraits(data){
  const raw = data?.traits || data?.trait_exposure || data?.categories || data?.summary?.traits || [];
  if(Array.isArray(raw)){
    return raw.map(x => ({
      category:x.category || x.trait_type || x.trait_name || x.name || 'Trait',
      value:x.value || x.trait_value || x.top_value || x.label || '',
      count:Number(x.count || x.token_count || x.owned_count || x.total || 0)
    })).filter(x => x.category && x.count);
  }
  if(raw && typeof raw === 'object'){
    return Object.entries(raw).map(([category, val]) => {
      if(val && typeof val === 'object'){
        const entries = Object.entries(val).sort((a,b)=>Number(b[1])-Number(a[1]));
        const top = entries[0] || ['',0];
        return { category, value:top[0], count:Number(top[1] || val.count || 0) };
      }
      return { category, value:'', count:Number(val || 0) };
    }).filter(x => x.count);
  }
  return [];
}
function normalizeWalletHistory(data){
  return data?.history || data?.snapshots || data?.daily || data?.rows || [];
}
function normalizeWalletTransfers(data){
  return data?.transfers || data?.events || data?.rows || [];
}
async function loadWalletAnalytics(address, opts={}){
  const addr = String(address || CONNECTED_WALLET?.address || '').trim();
  const desktopHost = document.getElementById('walletAnalyticsHost');
  const mobileHost = document.getElementById('mobileWalletAnalyticsHost');
  const hosts = [desktopHost, mobileHost].filter(Boolean);
  if(!addr){
    hosts.forEach(h => h.innerHTML = '<div class="wallet-empty-state">Connect a wallet to load real wallet analytics from Railway.</div>');
    return null;
  }
  hosts.forEach(h => {
    if(!h.innerHTML.trim() || opts.force) h.innerHTML = '<div class="wallet-empty-state">Loading wallet analytics...</div>';
  });
  const key = addr.toLowerCase();
  if(WALLET_ANALYTICS_CACHE.has(key) && !opts.force){
    const cached = WALLET_ANALYTICS_CACHE.get(key);
    renderWalletAnalytics(cached);
    setTimeout(flushWalletActivityPlot, 80);
    return cached;
  }
  try{
    const enc = encodeURIComponent(addr);
    const [summary, traits, history, transfers] = await Promise.all([
      dbFetch(`/db/wallet/${enc}/summary`),
      dbFetch(`/db/wallet/${enc}/traits`).catch(e => ({ ok:false, error:e.message })),
      dbFetch(`/db/wallet/${enc}/history`).catch(e => ({ ok:false, error:e.message })),
      dbFetch(`/db/wallet/${enc}/transfers`, { limit: 500 }).catch(e => ({ ok:false, error:e.message }))
    ]);
    const data = { address:addr, summary, traits, history, transfers, loadedAt:Date.now() };
    WALLET_ANALYTICS_CACHE.set(key, data);
    renderWalletAnalytics(data);
    return data;
  }catch(e){
    hosts.forEach(h => h.innerHTML = `<div class="wallet-empty-state">Wallet analytics failed to load: ${comboEsc(e.message || 'API error')}</div>`);
    return null;
  }
}
const WALLET_ACTIVITY_FILTERS = new Set(['mint','sale','burn','transfer']); // 'listing' omitted — no wallet-scoped listings data source exists yet
let WALLET_ACTIVITY_RANGE = 'all'; // '1d' | '7d' | '30d' | 'all'
function toggleWalletActivityRange(range){
  WALLET_ACTIVITY_RANGE = range;
  const addr = CONNECTED_WALLET?.address?.toLowerCase();
  const data = addr ? WALLET_ANALYTICS_CACHE.get(addr) : null;
  if(data) renderWalletAnalytics(data);
}
function walletActivityKind(row, address){
  const raw = String(row?.event_type || row?.type || row?.direction || row?.kind || '').toLowerCase();
  if(raw.includes('mint')) return 'mint';
  if(raw.includes('sale') || raw.includes('sold') || raw.includes('buy') || raw.includes('bought')) return 'sale';
  if(raw.includes('list')) return 'listing';
  if(raw.includes('burn')) return 'burn';
  if(raw.includes('transfer') || raw.includes('sent') || raw.includes('receive')) return 'transfer';
  const from = String(row?.from_address || '').toLowerCase();
  const to = String(row?.to_address || '').toLowerCase();
  const addr = String(address || '').toLowerCase();
  if(/^0x0{40}$/.test(from)) return 'mint';
  if(/^0x0{40}$/.test(to)) return 'burn';
  if(addr && (from === addr || to === addr)) return 'transfer';
  return 'transfer';
}
function walletActivityPrice(row){
  const val = row?.sale_price ?? row?.price_eth ?? row?.eth_price ?? row?.price ?? row?.listing_price ?? row?.floor_eth ?? row?.estimated_floor_value ?? row?.value_eth;
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function walletActivityTimestamp(row){
  const raw = row?.block_ts || row?.timestamp || row?.created_at || row?.sale_ts || row?.snapshot_date || row?.date;
  const n = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(n) ? n : 0;
}
function walletActivityEvents(data){
  const address = data?.address || '';
  const transfers = normalizeWalletTransfers(data?.transfers).map(row => ({
    row,
    source:'transfer',
    id:walletTokenId(row),
    kind:walletActivityKind(row, address),
    ts:walletActivityTimestamp(row),
    price:walletActivityPrice(row)
  })).filter(e => e.ts);
  const history = normalizeWalletHistory(data?.history).map(row => ({
    row,
    source:'history',
    id:walletTokenId(row),
    kind:walletActivityKind(row, address),
    ts:walletActivityTimestamp(row),
    price:walletActivityPrice(row)
  })).filter(e => e.ts && (e.id || e.price));
  return [...transfers, ...history].sort((a,b)=>a.ts-b.ts).slice(-500);
}
function walletActivityColor(kind){
  return { mint:'#1CFFAF', sale:'#7dd3fc', listing:'#c084fc', burn:'#fb7185', transfer:'#94a3b8' }[kind] || '#94a3b8';
}
function toggleWalletActivityFilter(kind){
  if(WALLET_ACTIVITY_FILTERS.has(kind) && WALLET_ACTIVITY_FILTERS.size > 1) WALLET_ACTIVITY_FILTERS.delete(kind);
  else WALLET_ACTIVITY_FILTERS.add(kind);
  const addr = CONNECTED_WALLET?.address?.toLowerCase();
  const data = addr ? WALLET_ANALYTICS_CACHE.get(addr) : null;
  if(data) renderWalletAnalytics(data);
}
function showWalletActivityTooltip(ev, encoded){
  const tip = document.getElementById('walletActivityTooltip') || document.body.appendChild(Object.assign(document.createElement('div'), { id:'walletActivityTooltip', className:'wallet-activity-tooltip' }));
  let item = {};
  try{ item = JSON.parse(decodeURIComponent(encoded)); }catch(_){}
  const img = item.id ? `<img src="${comboEsc((typeof VS !== 'undefined' && VS._imgSrc) ? VS._imgSrc(item.id) : imgForId(item.id))}" alt="#${item.id}">` : '';
  tip.innerHTML = `${img}<b>${item.id ? `#${item.id}` : 'Wallet Event'}</b><span>${comboEsc(item.kind || 'transfer')}</span><span>${item.eth ? walletEth(item.eth) : 'No ETH price'}</span><span>${comboEsc(item.date || '')}</span>`;
  tip.style.display = 'block';
  const x = Math.min(window.innerWidth - 210, ev.clientX + 14);
  const y = Math.min(window.innerHeight - 120, ev.clientY + 14);
  tip.style.left = `${Math.max(8,x)}px`;
  tip.style.top = `${Math.max(8,y)}px`;
}
function hideWalletActivityTooltip(){
  const tip = document.getElementById('walletActivityTooltip');
  if(tip) tip.style.display = 'none';
}
function walletActivityDirection(row, kind, address){
  const from = String(row?.from_address || '').toLowerCase();
  const to   = String(row?.to_address || '').toLowerCase();
  const addr = String(address || '').toLowerCase();
  if(addr && to === addr) return 1;   // token entered this wallet
  if(addr && from === addr) return -1; // token left this wallet
  // No address info on the row — fall back to kind semantics
  if(kind === 'mint') return 1;
  if(kind === 'burn') return -1;
  if(kind === 'sale') return -1; // most wallet-scoped sale rows are this wallet selling
  return 0; // listings and undetermined transfers don't change holdings
}
function walletActivityChartHtml(data){
  const address = data?.address || '';
  const eventsAll = walletActivityEvents(data).map(e => ({
    ...e, dir: walletActivityDirection(e.row, e.kind, address)
  }));
  const kinds = ['mint','sale','burn','transfer'];
  const ranges = [['1d','Day'],['7d','Week'],['30d','Month'],['all','All Time']];
  const kindBtns = kinds.map(k => `<button class="wallet-activity-filter ${WALLET_ACTIVITY_FILTERS.has(k)?'active':''}" onclick="toggleWalletActivityFilter('${k}')">${k}</button>`).join('');
  const rangeBtns = ranges.map(([k,label]) => `<button class="wallet-activity-filter ${WALLET_ACTIVITY_RANGE===k?'active':''}" onclick="toggleWalletActivityRange('${k}')">${label}</button>`).join('');
  const filters = `<div class="wallet-activity-filters-row"><div class="wallet-activity-filters">${kindBtns}</div><div class="wallet-activity-filters">${rangeBtns}</div></div>`;
  const rangeFilters = ''; // merged into the single row above
  if(!eventsAll.length) return `${filters}${rangeFilters}<div class="wallet-empty-state">History sync is still building. Summary data is available now.</div>`;

  // Running "tokens held" total — computed over the FULL unfiltered history so
  // the count is always correct, even when a time range narrows what's shown.
  // Filtering by kind/range only changes what's *visible*, never re-derives
  // the running total from a truncated starting point (which would make the
  // "tokens held" figure wrong at the start of the visible window).
  let running = 0;
  const withHoldings = eventsAll.map(e => {
    running += e.dir;
    return { ...e, held: Math.max(0, running) };
  });

  const rangeMs = { '1d': 864e5, '7d': 7*864e5, '30d': 30*864e5, 'all': Infinity }[WALLET_ACTIVITY_RANGE] ?? Infinity;
  const cutoff = Date.now() - rangeMs;
  const inRange = withHoldings.filter(e => e.ts >= cutoff);
  console.log('[WalletActivity DEBUG]', {
    WALLET_ACTIVITY_RANGE, rangeMs, cutoff, cutoffDate: new Date(cutoff).toString(),
    eventsAllCount: eventsAll.length, withHoldingsCount: withHoldings.length, inRangeCount: inRange.length,
    firstEventTs: eventsAll[0]?.ts, firstEventDate: eventsAll[0] ? new Date(eventsAll[0].ts).toString() : null,
    lastEventTs: eventsAll[eventsAll.length-1]?.ts, lastEventDate: eventsAll.length ? new Date(eventsAll[eventsAll.length-1].ts).toString() : null,
  });
  if(!inRange.length) return `${filters}${rangeFilters}<div class="wallet-empty-state">No activity in this time range. Try a wider range.</div>`;

  const events = inRange.filter(e => WALLET_ACTIVITY_FILTERS.has(e.kind));
  if(!events.length) return `${filters}${rangeFilters}<div class="wallet-empty-state">No events match the selected activity filters in this range.</div>`;

  const hostId = 'walletActivityPlotly_' + Date.now();
  const kindColors = {mint:'#1CFFAF',sale:'#2dd4bf',listing:'#60a5fa',burn:'#f87171',transfer:'#a78bfa'};

  // Base area/line — always the full range-selected history (unaffected by
  // kind filters), so toggling a kind filter never breaks or shortens the
  // line; it only changes which markers glow.
  const lineTrace = {
    x: inRange.map(e => new Date(e.ts).toISOString()),
    y: inRange.map(e => e.held),
    mode: 'lines', type: 'scatter', name: 'Tokens Held',
    line: { color: '#1CFFAF', width: 2, shape: 'spline', smoothing: 0.35 },
    fill: 'tozeroy', fillcolor: 'rgba(28,255,175,0.10)',
    hoverinfo: 'skip', showlegend: false,
  };
  // One marker trace per kind, plotted at the SAME (time, holdings) coordinate
  // as the line — so every dot sits meaningfully on the story, not floating
  // in empty space tied only to price.
  const byKind = {};
  for(const e of events){
    if(!byKind[e.kind]) byKind[e.kind] = {x:[],y:[],ids:[],dates:[],prices:[]};
    byKind[e.kind].x.push(new Date(e.ts).toISOString());
    byKind[e.kind].y.push(e.held);
    byKind[e.kind].ids.push(e.id||0);
    byKind[e.kind].dates.push(new Date(e.ts).toLocaleDateString());
    byKind[e.kind].prices.push(e.price > 0 ? e.price : null);
  }
  const markerTraces = Object.entries(byKind).map(([kind,d])=>({
    x:d.x, y:d.y, mode:'markers', type:'scatter', name:kind,
    marker:{size:9,color:kindColors[kind]||'#9aa4b2',symbol:'circle',opacity:.95,
            line:{color:'rgba(0,0,0,.35)',width:1.5}},
    customdata:d.ids.map((id,i)=>({id, kind, date:d.dates[i], eth:d.prices[i]})),
    hoverinfo:'none', // custom image tooltip below replaces Plotly's plain-text hover
  }));
  const traces = [lineTrace, ...markerTraces];

  const cs = getComputedStyle(document.body);
  const textColor = cs.getPropertyValue('--text').trim()||'#e6edf7';
  const subColor  = cs.getPropertyValue('--sub').trim()||'#7a8fa8';
  const cardBg = cs.getPropertyValue('--card').trim() || '#111c2a';
  const borderCol = cs.getPropertyValue('--border').trim() || 'rgba(255,255,255,0.15)';
  const maxHeld = Math.max(1, ...inRange.map(e=>e.held));
  const dtick = maxHeld <= 10 ? 1 : Math.ceil(maxHeld/6);
  const layout = {
    height:260, margin:{l:44,r:12,t:6,b:36},
    paper_bgcolor:'rgba(0,0,0,0)', plot_bgcolor:'rgba(0,0,0,0)',
    font:{color:textColor,size:11},
    xaxis:{color:subColor,showgrid:false,zeroline:false,tickfont:{size:10}},
    yaxis:{title:'Tokens Held',color:subColor,gridcolor:'rgba(255,255,255,.06)',zeroline:false,rangemode:'tozero',dtick},
    showlegend:true,
    legend:{orientation:'h',y:1.14,x:0,font:{size:10},bgcolor:'rgba(0,0,0,0)'},
    hovermode:'closest',
    hoverlabel:{bgcolor:cardBg,bordercolor:borderCol,font:{color:textColor,size:12}},
    dragmode:'pan',
  };
  setTimeout(()=>{
    const host = document.getElementById(hostId);
    if(!host || typeof Plotly === 'undefined') return;
    const render = () => {
      const currentHost = document.getElementById(hostId);
      if(!currentHost || typeof Plotly === 'undefined') return;
      currentHost.style.touchAction = 'none'; // let Plotly own the gesture instead of competing with page scroll
      Plotly.newPlot(currentHost, traces, layout, {responsive:true,displayModeBar:false,scrollZoom:true});
      currentHost.on('plotly_click', function(eventData){
        const pt = eventData.points?.[0];
        if(!pt || pt.data.mode !== 'markers') return;
        const item = pt.customdata;
        if(item?.id) openModal(item.id);
      });
      currentHost.on('plotly_hover', function(eventData){
        const pt = eventData.points?.[0];
        if(!pt || pt.data.mode !== 'markers' || !eventData.event) return;
        showWalletActivityTooltip(eventData.event, encodeURIComponent(JSON.stringify(pt.customdata)));
      });
      currentHost.on('plotly_unhover', hideWalletActivityTooltip);
    };
    if(!walletAnalyticsElementIsVisible(host)){
      WALLET_ACTIVITY_PLOT_PENDING = { hostId, render };
      return;
    }
    render();
  }, 60);
  return `${filters}${rangeFilters}<div id="${hostId}" style="width:100%;min-height:260px"></div>`;
}
// ── Shared owned-token trait lookup ─────────────────────────────────────────
// Built once per wallet load, reused by both Rarity Improvement and the
// Trait Exposure hover feature — avoids fetching/looking up each owned
// token's traits twice for two different panels.
let _walletOwnedTraitsMap = null;
async function buildOwnedTokenTraitsMap(ownedTokens){
  const map = new Map();
  for(const t of (ownedTokens || [])){
    const id = walletTokenId(t);
    if(!id) continue;
    let row = (typeof ROW_CACHE !== 'undefined' && ROW_CACHE.get(id)) || null;
    if(!row && typeof ensureChunk === 'function' && typeof chunkIndexFor === 'function'){
      try{
        const ch = await ensureChunk(chunkIndexFor(id));
        row = ch && ch[String(id)] ? ch[String(id)] : null;
      }catch(_){}
    }
    if(!row) continue;
    const traits = typeof keepEntries === 'function' ? keepEntries(row.traits) : Object.entries(row.traits||{});
    map.set(id, traits);
  }
  return map;
}

// ── Rarity Improvement from Burns ───────────────────────────────────────────
// Every burn anywhere in the collection can make a held token's traits
// relatively rarer, whether or not the holder ever burned anything
// themselves. Reuses computeOriginalTraitFreq() (already built for the Burns
// tab's Trait Extinction Tracker, cached after first call) against the live
// TRAIT_FREQ — zero new API calls, just diffing data already in memory.
async function computeWalletRarityImprovement(ownedTokens){
  if(!Array.isArray(ownedTokens) || !ownedTokens.length) return null;
  if(typeof computeOriginalTraitFreq !== 'function') return null;
  const original = await computeOriginalTraitFreq();
  const current = (typeof TRAIT_FREQ === 'object' && TRAIT_FREQ) || {};
  const traitsMap = _walletOwnedTraitsMap || await buildOwnedTokenTraitsMap(ownedTokens);
  const perToken = [];
  for(const [id, traits] of traitsMap.entries()){
    let sumPct = 0, n = 0, best = null;
    for(const [cat, val] of traits){
      const orig = original?.[cat]?.[val];
      const curr = current?.[cat]?.[val];
      if(!orig || orig < 3 || curr == null) continue;
      const burned = orig - curr;
      if(burned <= 0) continue;
      const pct = (burned / orig) * 100;
      sumPct += pct; n++;
      if(!best || pct > best.pct) best = { cat, val, pct, orig, curr };
    }
    if(n === 0) continue;
    perToken.push({ id, avgPct: sumPct / n, best });
  }
  if(!perToken.length) return { overallPct: 0, perToken: [] };
  const overallPct = perToken.reduce((s, t) => s + t.avgPct, 0) / perToken.length;
  perToken.sort((a, b) => b.avgPct - a.avgPct);
  return { overallPct, perToken };
}
function renderRarityImprovement(result){
  if(!result || !result.perToken.length){
    return '<div class="wallet-empty-state">Not enough burn data yet to measure — check back as more burns happen.</div>';
  }
  const { overallPct, perToken } = result;
  const top = perToken.slice(0, 3);
  return `
    <div class="rarity-improve-hero">
      <div class="rarity-improve-big">+${overallPct.toFixed(1)}%</div>
      <div class="rarity-improve-label">Rarer On Average Since Mint</div>
      <div class="rarity-improve-sub">Other holders burning duplicates of your traits made your tokens scarcer — no action needed from you.</div>
    </div>
    <div class="rarity-improve-tokens">${top.map(t => {
      const src = (typeof VS !== 'undefined' && VS._imgSrc) ? VS._imgSrc(t.id) : imgForId(t.id);
      return `<div class="rarity-improve-token" onclick="openModal(${t.id})">
        <img src="${comboEsc(src)}" alt="#${t.id}" loading="lazy">
        <div class="rarity-improve-token-body">
          <b>#${t.id}</b>
          <span class="rarity-improve-token-pct">+${t.avgPct.toFixed(0)}% rarer</span>
          ${t.best ? `<span class="rarity-improve-token-trait">${comboEsc(t.best.cat)}: ${comboEsc(t.best.val)} — ${t.best.curr}/${t.best.orig} left</span>` : ''}
        </div>
      </div>`;
    }).join('')}</div>`;
}
async function loadWalletRarityImprovement(data){
  const hosts = ['rarityImproveHost', 'mobileRarityImproveHost']
    .map(id => document.getElementById(id)).filter(Boolean);
  const summary = data?.summary?.summary || data?.summary || {};
  const owned = Array.isArray(summary.top_tokens) ? summary.top_tokens : [];
  // Build the shared traits map regardless of whether the rarity hosts exist
  // on this render — Trait Exposure hover depends on it too.
  try{
    _walletOwnedTraitsMap = await buildOwnedTokenTraitsMap(owned);
  }catch(e){
    _walletOwnedTraitsMap = new Map();
  }
  if(!hosts.length) return;
  try{
    const result = await computeWalletRarityImprovement(owned);
    const html = renderRarityImprovement(result);
    hosts.forEach(h => h.innerHTML = html);
  }catch(e){
    hosts.forEach(h => h.innerHTML = '<div class="wallet-empty-state">Could not compute rarity data.</div>');
  }
}

// ── Your Burns (personal burn stats) ────────────────────────────────────────
// Reuses Burns tab's own card-rendering helpers (burnsTokenChip, burnsInputGallery,
// burnsTxLink, burnsMetric — all from burnsAnalytics.js, loaded sitewide) so this
// panel looks and behaves exactly like the Burns tab's own cards, no duplicated UI.
function renderWalletBurnStats(stats){
  if(!stats || !stats.burnCount){
    return '<div class="wallet-empty-state">No burns yet from this wallet. Burn a few tokens together and your personal stats will show up here.</div>';
  }
  const angelBanner = stats.angelCount > 0 ? `<div class="extinct-banner" style="background:linear-gradient(135deg,rgba(28,255,175,.14),rgba(28,255,175,.03));border-color:rgba(28,255,175,.28)">
    <div class="extinct-title" style="color:#1CFFAF">✨ ${stats.angelCount} Angel Result${stats.angelCount===1?'':'s'}</div>
    <div class="extinct-sub">A rare, best-case burn outcome — you've hit it ${stats.angelCount} time${stats.angelCount===1?'':'s'}</div>
  </div>` : '';
  const eventsHtml = (stats.events || []).slice(0, 10).map(ev => {
    const dateStr = ev.burnedAt ? new Date(ev.burnedAt).toLocaleDateString() : '';
    const ptsHtml = ev.pointsUsed != null ? `<span class="burn-best-pts">${burnsMetric(ev.pointsUsed)} pts</span>` : '';
    const angelTag = ev.isAngel ? `<span class="burn-best-tag" style="background:rgba(28,255,175,.15);border-color:rgba(28,255,175,.35);color:#1CFFAF">✨ Angel</span>` : '';
    return `<div class="burn-best-card">
      <div class="burn-best-survivor-row">
        <span class="burn-best-tag survivor">Survivor</span>
        ${burnsTokenChip(ev.survivorTokenId)}
        ${angelTag}
        ${ptsHtml}
        <span class="burn-best-tx">${burnsTxLink(ev.txHash)}</span>
        ${dateStr ? `<span style="font-size:10px;color:var(--sub);margin-left:auto">${dateStr}</span>` : ''}
      </div>
      <div class="burn-best-burned-row">
        <span class="burn-best-tag burned">Burned (${burnsMetric((ev.burnedTokenIds||[]).length)})</span>
        ${burnsInputGallery(ev.burnedTokenIds)}
      </div>
    </div>`;
  }).join('');
  return `
    <div class="wallet-stat-row" style="margin-bottom:12px">
      <div class="wallet-stat-cell"><span>Burns</span><b>${burnsMetric(stats.burnCount)}</b></div>
      <div class="wallet-stat-cell"><span>Tokens Consumed</span><b>${burnsMetric(stats.tokensConsumed)}</b></div>
      <div class="wallet-stat-cell"><span>Survivors Created</span><b>${burnsMetric(stats.survivorsCreated)}</b></div>
      <div class="wallet-stat-cell"><span>Points Earned</span><b>${burnsMetric(stats.totalPoints)}</b></div>
    </div>
    ${angelBanner}
    <div class="burn-best-list" style="max-height:320px">${eventsHtml}</div>
  `;
}
async function loadWalletBurnStats(address){
  const hosts = ['walletBurnStatsHost', 'mobileWalletBurnStatsHost']
    .map(id => document.getElementById(id)).filter(Boolean);
  if(!hosts.length || !address) return;
  try{
    const data = await dbFetch(`/db/wallet/${encodeURIComponent(address)}/burn-stats`);
    const html = renderWalletBurnStats(data);
    hosts.forEach(h => h.innerHTML = html);
  }catch(e){
    hosts.forEach(h => h.innerHTML = '<div class="wallet-empty-state">Could not load burn stats.</div>');
  }
}

// ── Trait Exposure hover ────────────────────────────────────────────────────
// Shows thumbnails of exactly which owned tokens carry a given trait value,
// using the shared _walletOwnedTraitsMap built above.
function showTraitExposureTooltip(ev, categoryEnc, valueEnc){
  const category = decodeURIComponent(categoryEnc || '');
  const value = decodeURIComponent(valueEnc || '');
  if(!_walletOwnedTraitsMap || !_walletOwnedTraitsMap.size) return;
  const matches = [];
  for(const [id, traits] of _walletOwnedTraitsMap.entries()){
    if(traits.some(([c, v]) => c === category && v === value)) matches.push(id);
  }
  if(!matches.length) return;
  const tip = document.getElementById('walletTraitTooltip') || document.body.appendChild(
    Object.assign(document.createElement('div'), { id:'walletTraitTooltip', className:'wallet-trait-tooltip' })
  );
  const shown = matches.slice(0, 8);
  tip.innerHTML = `<div class="wallet-trait-tooltip-label">${shown.length < matches.length ? `${matches.length} tokens` : `${matches.length} token${matches.length===1?'':'s'}`}</div>
    <div class="wallet-trait-tooltip-grid">${shown.map(id => {
      const src = (typeof VS !== 'undefined' && VS._imgSrc) ? VS._imgSrc(id) : imgForId(id);
      return `<div class="wallet-trait-tooltip-item" onclick="openModal(${id})"><img src="${comboEsc(src)}" alt="#${id}"><span>#${id}</span></div>`;
    }).join('')}${matches.length > shown.length ? `<div class="wallet-trait-tooltip-more">+${matches.length - shown.length}</div>` : ''}</div>`;
  tip.style.display = 'block';
  const x = Math.min(window.innerWidth - 296, ev.clientX + 14);
  const y = Math.min(window.innerHeight - 160, ev.clientY + 14);
  tip.style.left = `${Math.max(8, x)}px`;
  tip.style.top = `${Math.max(8, y)}px`;
}
function hideTraitExposureTooltip(){
  const tip = document.getElementById('walletTraitTooltip');
  if(tip) tip.style.display = 'none';
}

function walletMobileAnalyticsHtml(data){
  const summary = data?.summary?.summary || data?.summary || {};
  const synced = data?.summary?.synced;
  const topTokens = Array.isArray(summary.top_tokens) ? summary.top_tokens.slice(0, 8) : [];
  const traitRows = normalizeWalletTraits(data?.traits).sort((a,b)=>b.count-a.count).slice(0, 8);
  const historyRows = normalizeWalletHistory(data?.history);
  const transferRows = normalizeWalletTransfers(data?.transfers).slice(0, 12);
  const maxHist = Math.max(1, ...historyRows.map(x => Number(x.owned_count || x.count || 0)));
  const html = `
    <div class="wallet-analytics-card">
      <div class="wallet-analytics-head">
        <div><div class="wallet-analytics-title">Wallet Summary</div><div class="wallet-analytics-sub">${comboEsc(shortAddr(data.address))}${synced === false ? ' · sync pending' : ''}</div></div>
        <button class="btn ghost" style="font-size:11px;padding:4px 10px" onclick="loadWalletAnalytics('${comboEsc(data.address)}',{force:true})">Refresh</button>
      </div>
      <div class="wallet-stats-grid">
        <div class="wallet-stat-cell"><span>Total Owned</span><b>${walletMetric(summary.owned_count)}</b></div>
        <div class="wallet-stat-cell"><span>Best Rank</span><b>${walletMetric(summary.best_rank)}</b></div>
        <div class="wallet-stat-cell"><span>Listed</span><b>${walletMetric(summary.listed_count)}</b></div>
        <div class="wallet-stat-cell"><span>Est. Value</span><b>${walletEth(summary.estimated_floor_value)}</b></div>
        <div class="wallet-stat-cell"><span>Floor ETH</span><b>${walletEth(summary.floor_eth)}</b></div>
      </div>
    </div>
    <div class="wallet-analytics-card">
      <div class="wallet-analytics-head"><div class="wallet-analytics-title" style="color:#1CFFAF">Rarity Gained From Burns</div></div>
      <div id="mobileRarityImproveHost"><div class="wallet-empty-state">Calculating…</div></div>
    </div>
    <div class="wallet-analytics-card">
      <div class="wallet-analytics-head"><div class="wallet-analytics-title">🔥 Your Burns</div></div>
      <div id="mobileWalletBurnStatsHost"><div class="wallet-empty-state">Loading…</div></div>
    </div>
    <div class="wallet-analytics-card">
      <div class="wallet-analytics-head"><div class="wallet-analytics-title">Top Owned Tokens</div></div>
      ${topTokens.length ? `<div class="wallet-top-token-grid">${topTokens.map(walletTopTokenCard).join('')}</div>` : '<div class="wallet-empty-state">Top owned tokens will appear after wallet summary sync completes.</div>'}
    </div>
    <div class="wallet-analytics-card">
      <div class="wallet-analytics-head"><div class="wallet-analytics-title">Trait Exposure</div></div>
      ${traitRows.length ? `<div class="wallet-trait-bars">${traitRows.map(t => `<div class="wallet-trait-row" onmouseenter="showTraitExposureTooltip(event,'${encodeURIComponent(t.category)}','${encodeURIComponent(t.value||'')}')" onmouseleave="hideTraitExposureTooltip()"><div class="wallet-trait-label"><b>${comboEsc(t.category)}</b><span>${comboEsc(t.value || 'Mixed')}</span></div><div class="wallet-trait-count">${walletMetric(t.count)}</div></div>`).join('')}</div>` : '<div class="wallet-empty-state">Trait analytics will appear after sync/derive completes.</div>'}
    </div>
    <div class="wallet-analytics-card">
      <div class="wallet-analytics-head"><div class="wallet-analytics-title">Wallet History</div></div>
      ${historyRows.length ? `<div class="wallet-history-bars">${historyRows.slice(-32).map(x => `<div class="wallet-history-bar" title="${comboEsc(walletDate(x.snapshot_date || x.date || x.block_ts))}: ${walletMetric(x.owned_count || x.count || 0)}" style="height:${Math.max(8, Math.round((Number(x.owned_count || x.count || 0)/maxHist)*64))}px"></div>`).join('')}</div>` : '<div class="wallet-empty-state">History sync is still building. Summary data is available now.</div>'}
    </div>
    <div class="wallet-analytics-card">
      <div class="wallet-analytics-head"><div class="wallet-analytics-title">Recent Transfers</div></div>
      ${transferRows.length ? `<div class="wallet-transfer-list">${transferRows.map(t => {
        const id = walletTokenId(t);
        const tx = t.tx_hash || t.transaction_hash || '';
        const kind = walletActivityKind(t, data.address);
        const price = walletActivityPrice(t);
        const date = walletDate(t.block_ts || t.timestamp || t.created_at);
        const link = tx ? `https://etherscan.io/tx/${tx}` : '';
        const src = (typeof VS !== 'undefined' && VS._imgSrc) ? VS._imgSrc(id) : imgForId(id);
        const burnedBadge = kind === 'burn' ? `<span class="wallet-transfer-burned-badge">🔥</span>` : '';
        const thumb = src ? `<img src="${comboEsc(src)}" alt="#${id}">${burnedBadge}` : `<span>#${id}</span>${burnedBadge}`;
        return `<div class="wallet-transfer-row">
          <button type="button" class="wallet-transfer-thumb" onclick="openModal(${id})">${thumb}</button>
          <div class="wallet-transfer-mid">
            <div class="wallet-transfer-topline">
              <span class="wallet-transfer-kind" style="color:${walletActivityColor(kind)};border-color:${walletActivityColor(kind)}66;background:${walletActivityColor(kind)}1a">${comboEsc(kind)}</span>
              <span class="wallet-transfer-id">#${id || '-'}</span>
              ${price > 0 ? `<span class="wallet-transfer-price">Ξ${price.toFixed(4)}</span>` : ''}
            </div>
            <div class="wallet-transfer-date">${comboEsc(date)}${link ? ` · <a href="${comboEsc(link)}" target="_blank" rel="noopener">tx</a>` : ''}</div>
          </div>
        </div>`;
      }).join('')}</div>` : '<div class="wallet-empty-state">No transfer rows yet. Summary data is available now.</div>'}
    </div>`;
  return html;
}
function walletDesktopAnalyticsHtml(data){
  const summary = data?.summary?.summary || data?.summary || {};
  const synced = data?.summary?.synced;
  const topTokens = Array.isArray(summary.top_tokens) ? summary.top_tokens : [];
  const traitRows = normalizeWalletTraits(data?.traits).sort((a,b)=>b.count-a.count).slice(0, 6);
  return `<div class="wallet-analytics-compact">
    <div class="wallet-analytics-card" style="padding:8px 9px">
      <div class="wallet-analytics-head" style="margin-bottom:6px">
        <div><div class="wallet-analytics-title">Wallet Analytics</div><div class="wallet-analytics-sub">${comboEsc(shortAddr(data.address))}${synced === false ? ' · sync pending' : ''}</div></div>
        <button class="btn ghost" style="font-size:11px;padding:4px 10px" onclick="loadWalletAnalytics('${comboEsc(data.address)}',{force:true})">Refresh</button>
      </div>
      <div class="wallet-stat-row">
        <div class="wallet-stat-cell"><span>Owned</span><b>${walletMetric(summary.owned_count)}</b></div>
        <div class="wallet-stat-cell"><span>Best Rank</span><b>${walletMetric(summary.best_rank)}</b></div>
        <div class="wallet-stat-cell"><span>Listed</span><b>${walletMetric(summary.listed_count)}</b></div>
        <div class="wallet-stat-cell"><span>Floor ETH</span><b>${walletEth(summary.floor_eth)}</b></div>
        <div class="wallet-stat-cell"><span>Est Value</span><b>${walletEth(summary.estimated_floor_value)}</b></div>
        <div class="wallet-stat-cell"><span>Realized P&L</span><b style="color:${walletPnl(summary.realized_pnl).color}">${walletPnl(summary.realized_pnl).text}</b></div>
        <div class="wallet-stat-cell"><span>Unrealized P&L</span><b style="color:${walletPnl(summary.unrealized_pnl).color}">${walletPnl(summary.unrealized_pnl).text}</b></div>
      </div>
    </div>
    <div class="wallet-analytics-card">
      <div class="wallet-analytics-head"><div class="wallet-analytics-title">Wallet Activity Timeline</div><div class="wallet-analytics-sub">Real history + transfer rows</div></div>
      ${walletActivityChartHtml(data)}
    </div>
    <div class="wallet-analytics-card">
      <div class="wallet-analytics-head"><div class="wallet-analytics-title">🔥 Your Burns</div></div>
      <div id="walletBurnStatsHost"><div class="wallet-empty-state">Loading…</div></div>
    </div>
    <div style="display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,.75fr);gap:8px">
      <div class="wallet-analytics-card">
        <div class="wallet-analytics-head">
          <div class="wallet-analytics-title">Owned Tokens</div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center">
            <input id="walletTokenSearch" placeholder="Token ID…" style="width:72px;font-size:10px;padding:2px 6px;border-radius:6px;border:1px solid var(--border);background:var(--chip);color:var(--text)" oninput="filterWalletOwnedTokens()" />
            <select id="walletOwnedSort" onchange="filterWalletOwnedTokens()" style="font-size:10px;padding:2px 5px;border-radius:6px;border:1px solid var(--border);background:var(--chip);color:var(--text)">
              <option value="rank">Best Rank</option>
              <option value="id">Token ID</option>
              <option value="listed">Listed First</option>
              <option value="unlisted">Unlisted First</option>
              <option value="price-asc">Price ↑</option>
              <option value="price-desc">Price ↓</option>
            </select>
          </div>
        </div>
        ${topTokens.length ? `<div class="wallet-top-token-grid" id="walletOwnedGrid">${topTokens.map(walletTopTokenCard).join('')}</div>` : '<div class="wallet-empty-state">Owned tokens will appear after wallet summary sync completes.</div>'}
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <div class="wallet-analytics-card">
          <div class="wallet-analytics-head"><div class="wallet-analytics-title" style="color:#1CFFAF">Rarity Gained From Burns</div></div>
          <div id="rarityImproveHost"><div class="wallet-empty-state">Calculating…</div></div>
        </div>
        <div class="wallet-analytics-card">
          <div class="wallet-analytics-head"><div class="wallet-analytics-title">Trait Exposure</div></div>
          ${traitRows.length ? `<div class="wallet-trait-bars">${traitRows.map(t => `<div class="wallet-trait-row" onmouseenter="showTraitExposureTooltip(event,'${encodeURIComponent(t.category)}','${encodeURIComponent(t.value||'')}')" onmouseleave="hideTraitExposureTooltip()"><div class="wallet-trait-label"><b>${comboEsc(t.category)}</b><span>${comboEsc(t.value || 'Mixed')}</span></div><div class="wallet-trait-count">${walletMetric(t.count)}</div></div>`).join('')}</div>` : '<div class="wallet-empty-state">Trait analytics will appear after sync/derive completes.</div>'}
        </div>
        <div class="wallet-analytics-card">
          <div class="wallet-analytics-head"><div class="wallet-analytics-title" style="color:#1CFFAF">Wallet Edge</div></div>
          <div id="walletEdgeHost">${buildWalletEdgeHtml(summary, normalizeWalletTraits(data?.traits))}</div>
        </div>
      </div>
    </div>
  </div>`;
}
function buildWalletEdgeHtml(summary, traitRows){
  if(!summary || !summary.owned_count) return '<div class="wallet-empty-state" style="font-size:11px">Connect & load wallet to see insights.</div>';
  const rows = [];
  // Collector type
  const owned = summary.owned_count || 0;
  const listed = summary.listed_count || 0;
  const bestRank = summary.best_rank;
  const estVal = summary.estimated_floor_value;
  const floorEth = summary.floor_eth;
  // Trait concentration — find most repeated trait
  const sorted = (traitRows||[]).filter(t=>t.count>0).sort((a,b)=>b.count-a.count);
  const topTrait = sorted[0];
  // Rarest trait by lowest frequency
  const rarestTrait = sorted.slice().sort((a,b)=>{
    const aFreq = (TRAIT_FREQ[a.category]&&TRAIT_FREQ[a.category][a.value])||999999;
    const bFreq = (TRAIT_FREQ[b.category]&&TRAIT_FREQ[b.category][b.value])||999999;
    return aFreq - bFreq;
  })[0];
  // Determine collector label
  let label = null;
  if(topTrait && topTrait.count >= 3 && owned >= 5){
    label = 'Trait Specialist';
  } else if(bestRank && bestRank <= 500 && owned >= 3){
    label = 'Rank Hunter';
  } else if(listed >= 3 && listed/owned > 0.5){
    label = 'Floor Sweeper';
  } else if(owned >= 10 && listed === 0){
    label = 'Diamond Hands';
  } else if(owned >= 3){
    label = 'Combo Collector';
  }
  if(label) rows.push(`<div class="wallet-edge-row"><div class="wallet-edge-label">Type</div><div class="wallet-edge-value"><span class="wallet-edge-tag">${label}</span></div></div>`);
  if(bestRank){
    const topT = (summary.top_tokens||[]).find(t=>t.os_rank===bestRank||t.obs_rank===bestRank);
    const tokId = topT?.token_id||'?';
    rows.push(`<div class="wallet-edge-row"><div class="wallet-edge-label">Best Signal</div><div class="wallet-edge-value">#${tokId} OS Rank #${bestRank}</div></div>`);
  }
  if(topTrait && topTrait.count >= 2){
    rows.push(`<div class="wallet-edge-row"><div class="wallet-edge-label">Strongest</div><div class="wallet-edge-value">${comboEsc(topTrait.category)}: ${comboEsc(topTrait.value||'Mixed')} ×${topTrait.count}</div></div>`);
  }
  if(rarestTrait && rarestTrait.value){
    const freq = (TRAIT_FREQ[rarestTrait.category]&&TRAIT_FREQ[rarestTrait.category][rarestTrait.value])||0;
    const pct = freq ? (freq/(TOKEN_COUNT||10000)*100).toFixed(1)+'%' : '?';
    rows.push(`<div class="wallet-edge-row"><div class="wallet-edge-label">Rarest Trait</div><div class="wallet-edge-value">${comboEsc(rarestTrait.category)}: ${comboEsc(rarestTrait.value)} <span style="color:var(--sub);font-size:10px">(${pct})</span></div></div>`);
  }
  if(estVal && floorEth){
    rows.push(`<div class="wallet-edge-row"><div class="wallet-edge-label">Est. Value</div><div class="wallet-edge-value">Ξ${estVal.toFixed(3)} <span style="color:var(--sub);font-size:10px">(${owned} × Ξ${floorEth.toFixed(4)} floor)</span></div></div>`);
  }
  const listedRatio = owned > 0 ? Math.round(listed/owned*100) : 0;
  rows.push(`<div class="wallet-edge-row"><div class="wallet-edge-label">Listed</div><div class="wallet-edge-value">${listed} / ${owned} <span style="color:var(--sub);font-size:10px">(${listedRatio}%)</span></div></div>`);
  return rows.length ? rows.join('') : '<div class="wallet-empty-state" style="font-size:11px">Not enough data for insights yet.</div>';
}

// Wallet owned tokens sort/filter
let _walletOwnedAll = [];
function filterWalletOwnedTokens(){
  const grid = document.getElementById('walletOwnedGrid');
  if(!grid || !_walletOwnedAll.length) return;
  const search = (document.getElementById('walletTokenSearch')?.value||'').trim();
  const sort = document.getElementById('walletOwnedSort')?.value||'rank';
  let tokens = _walletOwnedAll.slice();
  if(search) tokens = tokens.filter(t=>String(t.token_id).includes(search));
  tokens.sort((a,b)=>{
    const aPrice = a.price_eth; const bPrice = b.price_eth;
    const aRank = a.os_rank||a.obs_rank||99999;
    const bRank = b.os_rank||b.obs_rank||99999;
    if(sort==='rank') return aRank-bRank;
    if(sort==='id') return a.token_id-b.token_id;
    if(sort==='listed') return (aPrice==null?1:0)-(bPrice==null?1:0);
    if(sort==='unlisted') return (aPrice!=null?1:0)-(bPrice!=null?1:0);
    if(sort==='price-asc') return (aPrice??Infinity)-(bPrice??Infinity);
    if(sort==='price-desc') return (bPrice??-Infinity)-(aPrice??-Infinity);
    return 0;
  });
  grid.innerHTML = tokens.map(walletTopTokenCard).join('');
}
function renderWalletAnalytics(data){
  const desktopHost = document.getElementById('walletAnalyticsHost');
  const mobileHost = document.getElementById('mobileWalletAnalyticsHost');
  // Store owned tokens for sort/filter
  const summary = data?.summary?.summary || data?.summary || {};
  _walletOwnedAll = Array.isArray(summary.top_tokens) ? summary.top_tokens : [];
  if(desktopHost) desktopHost.innerHTML = walletDesktopAnalyticsHtml(data);
  if(mobileHost) mobileHost.innerHTML = walletMobileAnalyticsHtml(data);
  setTimeout(flushWalletActivityPlot, 80);
  loadWalletRarityImprovement(data);
  loadWalletBurnStats(data?.address);
}
