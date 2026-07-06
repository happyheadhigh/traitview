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
  return `<div class="wallet-top-token" data-id="${id}" onclick="openModal(${id})">
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
    boundedMapSet(WALLET_ANALYTICS_CACHE, key, data, 50);
    renderWalletAnalytics(data);
    return data;
  }catch(e){
    hosts.forEach(h => h.innerHTML = `<div class="wallet-empty-state">Wallet analytics failed to load: ${comboEsc(e.message || 'API error')}</div>`);
    return null;
  }
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
function showWalletActivityTooltip(ev, encoded){
  const tip = document.getElementById('walletActivityTooltip') || document.body.appendChild(Object.assign(document.createElement('div'), { id:'walletActivityTooltip', className:'wallet-activity-tooltip' }));
  let item = {};
  try{ item = JSON.parse(decodeURIComponent(encoded)); }catch(_){}
  const img = item.id ? `<img src="${comboEsc((typeof VS !== 'undefined' && VS._imgSrc) ? VS._imgSrc(item.id) : imgForId(item.id))}" alt="#${item.id}">` : '';
  const more = item.count > 1 ? ` <span style="opacity:.7">(+${item.count-1} more that day)</span>` : '';
  tip.innerHTML = `${img}<b>${item.id ? `#${item.id}` : 'Wallet Event'}${more}</b><span>${comboEsc(item.kind || '')}</span><span>${item.eth ? walletEth(item.eth) : 'No ETH price'}</span><span>${comboEsc(item.date || '')}</span>`;
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
const WALLET_TIMELINE_RANGES = [['1d','Day'],['7d','Week'],['30d','Month'],['all','All Time']];
let WALLET_TIMELINE_RANGE = 'all';
let WALLET_TIMELINE_MONTH = ''; // '' = not using a specific month (defaults to All Time via WALLET_TIMELINE_RANGE)
function toggleWalletTimelineRange(range){
  WALLET_TIMELINE_RANGE = range;
  WALLET_TIMELINE_MONTH = '';
  const addr = CONNECTED_WALLET?.address?.toLowerCase();
  const data = addr ? WALLET_ANALYTICS_CACHE.get(addr) : null;
  if(data) renderWalletAnalytics(data);
}
function setWalletTimelineMonth(month){
  WALLET_TIMELINE_MONTH = month || '';
  const addr = CONNECTED_WALLET?.address?.toLowerCase();
  const data = addr ? WALLET_ANALYTICS_CACHE.get(addr) : null;
  if(data) renderWalletAnalytics(data);
}
// Buckets a wallet's events into daily counts per kind (for the smooth line),
// filling every day in range with 0 so the line correctly sits flat at zero
// during quiet periods instead of interpolating across gaps. Also keeps the
// individual events for each day/kind so hoverable dots can show the real
// token that occurred that day.
function walletDailyBuckets(events, kinds){
  if(!events.length) return { days: [], series: {}, eventsByDayKind: {} };
  const dayKey = ts => new Date(ts).toISOString().slice(0,10);
  const counts = {};
  const eventsByDayKind = {};
  for(const kind of kinds){ counts[kind] = {}; eventsByDayKind[kind] = {}; }
  for(const e of events){
    if(!counts[e.kind]) continue;
    const day = dayKey(e.ts);
    counts[e.kind][day] = (counts[e.kind][day] || 0) + 1;
    (eventsByDayKind[e.kind][day] ||= []).push(e);
  }
  const startDay = new Date(dayKey(events[0].ts));
  const endDay = new Date(dayKey(Date.now()));
  const days = [];
  for(let d = new Date(startDay); d <= endDay; d.setDate(d.getDate()+1)){
    days.push(d.toISOString().slice(0,10));
  }
  const series = {};
  for(const kind of kinds) series[kind] = days.map(d => counts[kind][d] || 0);
  return { days, series, eventsByDayKind };
}
// Same smooth filled-spline visual style as Burn Timeline, plus a marker
// trace overlaid on each line — one dot per calendar day that had a real
// event, sitting at that day's actual line height, hoverable with the same
// image-thumbnail tooltip used elsewhere on the site.
function walletTimelineTraceHtml(hostId, days, seriesDefs, comparison){
  const lineTraces = seriesDefs.map(({name, color, series}) => ({
    x: days, y: series, name, type:'scatter', mode:'lines',
    line:{ color, width:2, shape:'spline', smoothing:0.4 },
    fill:'tozeroy', fillcolor: color.startsWith('#')
      ? `rgba(${parseInt(color.slice(1,3),16)},${parseInt(color.slice(3,5),16)},${parseInt(color.slice(5,7),16)},0.12)`
      : 'rgba(255,255,255,0.08)',
    hoverinfo:'skip', showlegend:true,
  }));
  const markerTraces = seriesDefs.map(({name, color, series, eventsByDay}) => {
    const mx = [], my = [], customdata = [];
    days.forEach((day, i) => {
      const dayEvents = eventsByDay?.[day];
      if(dayEvents && dayEvents.length){
        mx.push(day);
        my.push(series[i]);
        const first = dayEvents[0];
        customdata.push({ id:first.id, kind:first.kind, date:new Date(first.ts).toLocaleDateString(), eth:first.price>0?first.price:null, count:dayEvents.length });
      }
    });
    return {
      x:mx, y:my, mode:'markers', type:'scatter', name, showlegend:false,
      marker:{ size:8, color, symbol:'circle', opacity:.95, line:{color:'rgba(0,0,0,.35)',width:1.5} },
      customdata, hoverinfo:'none',
    };
  });
  const traces = [...lineTraces, ...markerTraces];
  if(comparison && comparison.x?.length){
    traces.push({
      x: comparison.x, y: comparison.y, name: comparison.name, type:'scatter', mode:'lines',
      yaxis:'y2', line:{ color: comparison.color, width:2, shape: comparison.shape || 'spline', smoothing: 0.4 },
      hoverinfo:'skip',
    });
  }
  setTimeout(() => {
    const render = () => {
      const el = document.getElementById(hostId);
      if(!el || typeof Plotly === 'undefined') return;
      const cs = getComputedStyle(document.body);
      const textCol = cs.getPropertyValue('--text').trim() || '#e6edf7';
      const cardBg = cs.getPropertyValue('--card').trim() || '#111c2a';
      const borderCol = cs.getPropertyValue('--border').trim() || 'rgba(255,255,255,0.15)';
      const layout = {
        height:260, showlegend:true,
        legend:{ orientation:'h', y:1.15, x:0, font:{size:11} },
        margin:{ l:44, r: comparison ? 44 : 12, t:6, b:36 },
        paper_bgcolor:'rgba(0,0,0,0)', plot_bgcolor:'rgba(0,0,0,0)',
        font:{ color:textCol },
        xaxis:{ title:'', showgrid:false, fixedrange:true, tickfont:{size:10} },
        yaxis:{ title:'Count', rangemode:'tozero', gridcolor:'rgba(255,255,255,0.06)', fixedrange:true },
        hovermode:'closest', autosize:true,
        hoverlabel:{ bgcolor:cardBg, bordercolor:borderCol, font:{color:textCol, size:12} },
      };
      if(comparison && comparison.x?.length){
        layout.yaxis2 = { title:comparison.axisTitle||'', overlaying:'y', side:'right', showgrid:false, rangemode:'tozero', fixedrange:true, tickfont:{size:10} };
      }
      Plotly.newPlot(el, traces, layout, { displayModeBar:false, responsive:true, scrollZoom:false });
      el.on('plotly_click', function(eventData){
        const pt = eventData.points?.[0];
        if(pt?.customdata?.id) openModal(pt.customdata.id);
      });
      el.on('plotly_hover', function(eventData){
        const pt = eventData.points?.[0];
        if(!pt?.customdata?.id || !eventData.event) return;
        showWalletActivityTooltip(eventData.event, encodeURIComponent(JSON.stringify(pt.customdata)));
      });
      el.on('plotly_unhover', hideWalletActivityTooltip);
    };
    if(!walletAnalyticsElementIsVisible(document.getElementById(hostId))){
      WALLET_ACTIVITY_PLOT_PENDING = { hostId, render };
      return;
    }
    render();
  }, 60);
}
// Collection floor price history, for a comparison line on the Sales chart —
// same "True Floor" line style used on the Floor Trend tab (color, step
// shape) so it reads as the same concept wherever it appears.
async function walletFloorComparisonTrace(days){
  try{
    const fh = await dbFetch('/db/floor-history', { hours: 24 * 400 });
    const rows = fh?.history || [];
    if(!rows.length) return null;
    const dayKey = ts => new Date(ts).toISOString().slice(0,10);
    const byDay = {};
    for(const p of rows) byDay[dayKey(p.recorded_at)] = p.floor_eth;
    let last = null;
    const y = days.map(d => { if(byDay[d] != null) last = byDay[d]; return last; });
    // Back-fill any leading nulls (before the first real snapshot) with the
    // earliest known value, so the line spans the full chart instead of only
    // appearing partway through once real data starts.
    const firstKnown = y.find(v => v != null);
    if(firstKnown != null){
      for(let i = 0; i < y.length && y[i] == null; i++) y[i] = firstKnown;
    }
    if(!y.some(v => v != null)) return null;
    return { name:'Collection Floor', color:'#f59e0b', x:days, y, shape:'spline', axisTitle:'Floor (ETH)', hoverSuffix:' ETH' };
  }catch(_){ return null; }
}
// Collection-wide daily burn count, for a comparison line on the Burns chart
// — reuses the exact same endpoint and flexible field-name fallback that
// Burn Timeline itself uses (drawBurnActivityChart), just re-bucketed to the
// wallet chart's own day range.
async function walletCollectionBurnsComparisonTrace(days){
  try{
    const ba = await dbFetch('/db/burn-activity');
    const rows = ba?.activity || ba?.rows || (Array.isArray(ba) ? ba : []);
    if(!rows.length) return null;
    const dayKey = ts => new Date(ts).toISOString().slice(0,10);
    const byDay = {};
    for(const r of rows){
      const raw = r.day || r.date || r.bucket || r.month;
      if(!raw) continue;
      byDay[dayKey(raw)] = Number(r.burn_events || r.count || r.burns || 0);
    }
    const y = days.map(d => byDay[d] || 0);
    if(!y.some(v => v > 0)) return null;
    return { name:'Collection Burns', color:'#FFD700', x:days, y, shape:'spline', axisTitle:'Collection Burns', hoverSuffix:' burns' };
  }catch(_){ return null; }
}
// Sales chart: unlike Burns/Transfers (where "how many happened" is the
// meaningful question), Sales needs to show actual ETH price so it can be
// compared directly against Collection Floor on the same axis -- a count of
// sale events tells you nothing about whether you sold above or below floor.
function renderWalletSalesPriceChart(hostId, salesEvents, mintEvents, floorComparison){
  const x = salesEvents.map(e => new Date(e.ts).toISOString());
  const y = salesEvents.map(e => e.price);
  const customdata = salesEvents.map(e => ({ id:e.id, kind:'sale', date:new Date(e.ts).toLocaleDateString(), eth:e.price, count:1 }));
  const priceTrace = {
    x, y, name:'Sale price', type:'scatter', mode:'lines+markers',
    line:{ color:'#2dd4bf', width:2, shape:'spline', smoothing:0.4 },
    marker:{ size:8, color:'#2dd4bf', symbol:'circle', opacity:.95, line:{color:'rgba(0,0,0,.35)',width:1.5} },
    fill:'tozeroy', fillcolor:'rgba(45,212,191,0.12)',
    customdata, hoverinfo:'none',
  };
  const traces = [priceTrace];
  if(mintEvents && mintEvents.length){
    traces.push({
      x: mintEvents.map(e => new Date(e.ts).toISOString()),
      y: mintEvents.map(e => e.price),
      name:'Mint cost', type:'scatter', mode:'markers',
      marker:{ size:9, color:'#1CFFAF', symbol:'diamond', opacity:.95, line:{color:'rgba(0,0,0,.35)',width:1.5} },
      customdata: mintEvents.map(e => ({ id:e.id, kind:'mint', date:new Date(e.ts).toLocaleDateString(), eth:e.price, count:1 })),
      hoverinfo:'none',
    });
  }
  if(floorComparison && floorComparison.x?.length){
    traces.push({
      x: floorComparison.x, y: floorComparison.y, name: floorComparison.name, type:'scatter', mode:'lines',
      line:{ color: floorComparison.color, width:2, shape: floorComparison.shape || 'spline', smoothing:0.4 },
      hoverinfo:'skip',
    });
  }
  setTimeout(() => {
    const render = () => {
      const el = document.getElementById(hostId);
      if(!el || typeof Plotly === 'undefined') return;
      const cs = getComputedStyle(document.body);
      const textCol = cs.getPropertyValue('--text').trim() || '#e6edf7';
      const cardBg = cs.getPropertyValue('--card').trim() || '#111c2a';
      const borderCol = cs.getPropertyValue('--border').trim() || 'rgba(255,255,255,0.15)';
      const layout = {
        height:260, showlegend:true,
        legend:{ orientation:'h', y:1.15, x:0, font:{size:11} },
        margin:{ l:44, r:12, t:6, b:36 },
        paper_bgcolor:'rgba(0,0,0,0)', plot_bgcolor:'rgba(0,0,0,0)',
        font:{ color:textCol },
        xaxis:{ title:'', showgrid:false, fixedrange:true, tickfont:{size:10} },
        yaxis:{ title:'ETH', rangemode:'tozero', gridcolor:'rgba(255,255,255,0.06)', fixedrange:true },
        hovermode:'closest', autosize:true,
        hoverlabel:{ bgcolor:cardBg, bordercolor:borderCol, font:{color:textCol, size:12} },
      };
      Plotly.newPlot(el, traces, layout, { displayModeBar:false, responsive:true, scrollZoom:false });
      el.on('plotly_click', function(eventData){
        const pt = eventData.points?.[0];
        if(pt?.customdata?.id) openModal(pt.customdata.id);
      });
      el.on('plotly_hover', function(eventData){
        const pt = eventData.points?.[0];
        if(!pt?.customdata?.id || !eventData.event) return;
        showWalletActivityTooltip(eventData.event, encodeURIComponent(JSON.stringify(pt.customdata)));
      });
      el.on('plotly_unhover', hideWalletActivityTooltip);
    };
    if(!walletAnalyticsElementIsVisible(document.getElementById(hostId))){
      WALLET_ACTIVITY_PLOT_PENDING = { hostId, render };
      return;
    }
    render();
  }, 60);
}
function walletActivityChartHtml(data){
  const eventsAll = walletActivityEvents(data);
  if(!eventsAll.length) return '<div class="wallet-empty-state">History sync is still building. Summary data is available now.</div>';

  // Continuous month list from the wallet's first-ever activity through the
  // current real-world month -- no gaps, even for months with zero activity,
  // so the dropdown reads as a complete calendar instead of a confusing
  // jump between unrelated months.
  const nowMonthStr = new Date().toISOString().slice(0,7);
  const firstMonthStr = new Date(Math.min(...eventsAll.map(e => e.ts))).toISOString().slice(0,7);
  const monthOptions = [];
  const cursor = new Date(firstMonthStr + '-01T00:00:00Z');
  const endCursor = new Date(nowMonthStr + '-01T00:00:00Z');
  while(cursor <= endCursor){
    monthOptions.push(cursor.toISOString().slice(0,7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  monthOptions.reverse(); // most recent first
  const monthLabel = m => new Date(m + '-02').toLocaleDateString(undefined, { month:'long', year:'numeric' });
  const monthPicker = monthOptions.length > 1 ? `
    <select class="wallet-timeline-month-picker" onchange="setWalletTimelineMonth(this.value)">
      <option value="">Pick a month…</option>
      ${monthOptions.map(m => `<option value="${m}" ${WALLET_TIMELINE_MONTH===m?'selected':''}>${monthLabel(m)}</option>`).join('')}
    </select>` : '';
  const rangeBtns = `<div class="wallet-timeline-ranges">${WALLET_TIMELINE_RANGES.map(([k,label]) => `<button class="wallet-timeline-range-btn ${(!WALLET_TIMELINE_MONTH && WALLET_TIMELINE_RANGE===k)?'active':''}" onclick="toggleWalletTimelineRange('${k}')">${label}</button>`).join('')}${monthPicker}</div>`;

  let inRange;
  if(WALLET_TIMELINE_MONTH){
    inRange = eventsAll.filter(e => new Date(e.ts).toISOString().slice(0,7) === WALLET_TIMELINE_MONTH);
  } else {
    const rangeMs = { '1d': 864e5, '7d': 7*864e5, '30d': 30*864e5, 'all': Infinity }[WALLET_TIMELINE_RANGE] ?? Infinity;
    const cutoff = Date.now() - rangeMs;
    inRange = eventsAll.filter(e => e.ts >= cutoff);
  }
  if(!inRange.length) return `${rangeBtns}<div class="wallet-empty-state">No activity in this time range. Try a wider range.</div>`;

  const summary = data?.summary?.summary || data?.summary || {};
  const ownedTokens = Array.isArray(summary.top_tokens) ? summary.top_tokens : [];
  const costByTokenId = new Map(ownedTokens.filter(t => t.cost_eth > 0).map(t => [t.token_id, t.cost_eth]));

  const salesHostId = 'walletSalesPlotly_' + Date.now();
  const burnsHostId = 'walletBurnsPlotly_' + Date.now();

  const { days: salesDays } = walletDailyBuckets(inRange, ['sale', 'mint']);
  const { days: burnDays, series: burnSeries, eventsByDayKind: burnEBDK } = walletDailyBuckets(inRange, ['burn','transfer']);

  const salesEvents = inRange.filter(e => e.kind === 'sale' && e.price > 0).sort((a,b) => a.ts - b.ts);
  // Mint events don't carry a price in the raw transfer stream (only sales
  // get joined against the sales table for price) -- cross-reference against
  // the wallet's own per-token cost basis, which IS reliably resolved
  // (including a mint-transaction-value fallback) for the wallet summary.
  const mintEvents = inRange
    .filter(e => e.kind === 'mint' && e.id && costByTokenId.has(e.id))
    .map(e => ({ ...e, price: costByTokenId.get(e.id) }))
    .sort((a,b) => a.ts - b.ts);
  const salesHtml = (salesEvents.length || mintEvents.length)
    ? `<div id="${salesHostId}" style="width:100%;min-height:260px"></div>`
    : '<div class="wallet-empty-state">No sales or mints with known cost basis in this range.</div>';
  const burnsHtml = burnDays.length
    ? `<div id="${burnsHostId}" style="width:100%;min-height:260px"></div>`
    : '<div class="wallet-empty-state">No burns or transfers in this range.</div>';
  const traitsHostId = 'walletTraitsPlotly_' + Date.now();
  const floorVsPaidHostId = 'walletFloorVsPaidHost_' + Date.now();

  if(salesEvents.length || mintEvents.length){
    walletFloorComparisonTrace(salesDays).then(comparison => {
      renderWalletSalesPriceChart(salesHostId, salesEvents, mintEvents, comparison);
    });
  }
  if(burnDays.length){
    walletCollectionBurnsComparisonTrace(burnDays).then(comparison => {
      walletTimelineTraceHtml(burnsHostId, burnDays, [
        { key:'burn', name:'Burn events', color:'#f87171', series:burnSeries.burn, eventsByDay:burnEBDK.burn },
        { key:'transfer', name:'Transfer events', color:'#a78bfa', series:burnSeries.transfer, eventsByDay:burnEBDK.transfer },
      ], comparison);
    });
  }
  if(ownedTokens.length){
    loadWalletRarestTraitsChart(traitsHostId, ownedTokens.map(t => t.token_id));
    loadWalletTraitFloorVsPaid(floorVsPaidHostId, ownedTokens);
  }

  return `
    ${rangeBtns}
    <div class="wallet-timeline-grid">
      <div class="wallet-timeline-sub">
        <div class="wallet-timeline-sub-title">Sales</div>
        ${salesHtml}
      </div>
      <div class="wallet-timeline-sub">
        <div class="wallet-timeline-sub-title">Burns &amp; Transfers</div>
        ${burnsHtml}
      </div>
      <div class="wallet-timeline-sub">
        <div class="wallet-timeline-sub-title">Your Rarest Traits</div>
        ${ownedTokens.length ? `<div id="${traitsHostId}" style="width:100%;min-height:260px"></div>` : '<div class="wallet-empty-state">No owned tokens yet.</div>'}
      </div>
      <div class="wallet-timeline-sub">
        <div class="wallet-timeline-sub-title">Trait Floor vs. What You Paid</div>
        <div id="${floorVsPaidHostId}">${ownedTokens.length ? '<div class="wallet-empty-state">Calculating…</div>' : '<div class="wallet-empty-state">No owned tokens yet.</div>'}</div>
      </div>
    </div>
  `;
}

// ── Your Rarest Traits ───────────────────────────────────────────────────────
async function loadWalletRarestTraitsChart(hostId, ownedIds){
  const seen = new Map();
  for(const id of ownedIds){
    if(!id) continue;
    try{
      const entries = await getRowTraitsFor(id);
      const tot = (typeof TOKEN_COUNT !== 'undefined' && TOKEN_COUNT) || 10000;
      const freq = (typeof TRAIT_FREQ !== 'undefined' && TRAIT_FREQ) || {};
      for(const [cat, val] of entries){
        const key = cat + '|' + val;
        if(seen.has(key)) continue;
        const cnt = (freq[cat] && freq[cat][val]) || tot;
        seen.set(key, { category:cat, value:val, pct: cnt / tot * 100, tokenId:id });
      }
    }catch(_){}
  }
  const top = [...seen.values()].sort((a,b) => a.pct - b.pct).slice(0, 10).reverse();
  if(!top.length) return;
  setTimeout(() => {
    const render = () => {
      const el = document.getElementById(hostId);
      if(!el || typeof Plotly === 'undefined') return;
      const cs = getComputedStyle(document.body);
      const textCol = cs.getPropertyValue('--text').trim() || '#e6edf7';
      const cardBg = cs.getPropertyValue('--card').trim() || '#111c2a';
      const borderCol = cs.getPropertyValue('--border').trim() || 'rgba(255,255,255,0.15)';
      const trace = {
        x: top.map(t => t.pct), y: top.map(t => `${t.category}: ${t.value}`),
        type:'bar', orientation:'h', width: 0.35,
        marker:{ color: top.map(t => t.pct < 1 ? '#1f9d90' : t.pct < 5 ? '#159b6e' : '#7c8ba0'), cornerradius: 6 },
        text: top.map(t => `${t.pct < 1 ? t.pct.toFixed(2) : t.pct.toFixed(1)}%`),
        textposition:'outside', textfont:{color:textCol, size:22},
        hovertemplate: '%{y}<br>%{x:.2f}% of collection<extra></extra>',
      };
      const layout = {
        height:260, margin:{ l:150, r:64, t:6, b:30 },
        paper_bgcolor:'rgba(0,0,0,0)', plot_bgcolor:'rgba(0,0,0,0)',
        font:{ color:textCol, size:10.5 },
        xaxis:{ title:'% of collection', showgrid:true, gridcolor:'rgba(255,255,255,0.06)', fixedrange:true, tickfont:{size:10} },
        yaxis:{ automargin:true, fixedrange:true },
        hoverlabel:{ bgcolor:cardBg, bordercolor:borderCol, font:{color:textCol, size:12} },
      };
      Plotly.newPlot(el, [trace], layout, { displayModeBar:false, responsive:true });
      const barsLayer = el.querySelector('.barlayer');
      if(barsLayer) barsLayer.style.filter = 'drop-shadow(0 0 3px rgba(45,212,191,0.2))';
      el.on('plotly_click', ev => { const id = top[ev.points?.[0]?.pointNumber]?.tokenId; if(id) openModal(id); });
    };
    if(!walletAnalyticsElementIsVisible(document.getElementById(hostId))){
      WALLET_ACTIVITY_PLOT_PENDING = { hostId, render };
      return;
    }
    render();
  }, 60);
}

// ── Trait Floor vs. What You Paid (Dumbbell rows) ───────────────────────────
// Builds a single reverse index (trait "category|value" -> cheapest listed
// token with it) by scanning the listings ONCE, instead of re-scanning all
// listings separately for every owned token. The old approach was
// O(ownedTokens x listings) -- for ~20 owned tokens against ~400 listings,
// that's up to 8,000 sequential lookups. This is O(listings + ownedTokens).
let _traitFloorIndexCache = null;
let _traitFloorIndexBuiltAt = 0;
async function buildTraitFloorIndex(){
  const now = Date.now();
  if(_traitFloorIndexCache && (now - _traitFloorIndexBuiltAt) < 60000) return _traitFloorIndexCache;
  const index = new Map(); // "category|value" -> { price, tokenId }
  const listings = (typeof window !== 'undefined' && window.LISTINGS) || {};
  for(const [lid, l] of Object.entries(listings)){
    const price = l?.opensea?.price_eth;
    if(price == null) continue;
    try{
      const entries = await getRowTraitsFor(+lid);
      for(const [k,v] of entries){
        const key = k + '|' + v;
        const existing = index.get(key);
        if(!existing || price < existing.price) index.set(key, { price, tokenId:+lid });
      }
    }catch(_){}
  }
  _traitFloorIndexCache = index;
  _traitFloorIndexBuiltAt = now;
  return index;
}
async function findTraitFloorForToken(id, index){
  const rarest = await getTopRareTraits(id, 1);
  if(!rarest.length) return null;
  const { tn, tv } = rarest[0];
  const hit = index.get(tn + '|' + tv);
  if(!hit) return null;
  return { traitCat: tn, traitVal: tv, floorNow: hit.price, floorTokenId: hit.tokenId };
}
async function loadWalletTraitFloorVsPaid(hostId, ownedTokens){
  const withCost = ownedTokens.filter(t => t.cost_eth > 0);
  if(!withCost.length){
    const el = document.getElementById(hostId);
    if(el) el.innerHTML = '<div class="wallet-empty-state">No cost-basis data available for your owned tokens yet.</div>';
    return;
  }
  const rows = [];
  const traitFloorIndex = await buildTraitFloorIndex();
  for(const t of withCost){
    const floor = await findTraitFloorForToken(t.token_id, traitFloorIndex);
    if(!floor) continue;
    rows.push({ id:t.token_id, paid:t.cost_eth, floorNow:floor.floorNow, floorTokenId:floor.floorTokenId, traitCat:floor.traitCat, trait:floor.traitVal });
  }
  const el = document.getElementById(hostId);
  if(!el) return;
  if(!rows.length){
    el.innerHTML = '<div class="wallet-empty-state">Could not match trait floors for your owned tokens right now.</div>';
    return;
  }
  const maxVal = Math.max(...rows.map(r => Math.max(r.paid, r.floorNow))) * 1.08;
  el.innerHTML = `
    <div class="wallet-dumbbell-legend">
      <span><i style="background:#f59e0b"></i>Paid</span>
      <span><i style="background:#2dd4bf"></i>Trait floor now</span>
    </div>
    <div class="wallet-dumbbell-list">
      ${rows.map(r => walletDumbbellRowHtml(r, maxVal)).join('')}
    </div>
  `;
}
function walletDumbbellRowHtml(r, maxVal){
  const good = r.floorNow >= r.paid;
  const pct = (((r.floorNow - r.paid) / r.paid) * 100).toFixed(0);
  const leftPct = (Math.min(r.paid, r.floorNow) / maxVal) * 100;
  const widthPct = (Math.abs(r.floorNow - r.paid) / maxVal) * 100;
  const paidX = (r.paid / maxVal) * 100;
  const floorX = (r.floorNow / maxVal) * 100;
  const paidData = encodeURIComponent(JSON.stringify({ id:r.id, kind:'Your token', date:'', eth:r.paid, count:1 }));
  const floorData = r.floorTokenId ? encodeURIComponent(JSON.stringify({ id:r.floorTokenId, kind:'Cheapest with this trait', date:'', eth:r.floorNow, count:1 })) : null;
  return `<div class="wallet-dumbbell-row" onclick="openModal(${r.id})">
    <div class="wallet-dumbbell-head">
      <span><b>#${r.id}</b> <span class="wallet-dumbbell-trait">· ${comboEsc(r.traitCat)}: ${comboEsc(r.trait)}</span></span>
      <span class="wallet-dumbbell-badge ${good?'good':'bad'}">${good?'+':''}${pct}%</span>
    </div>
    <div class="wallet-dumbbell-track">
      <div class="wallet-dumbbell-bar ${good?'good':'bad'}" style="left:${leftPct}%;width:${widthPct}%"></div>
      <div class="wallet-dumbbell-dot paid" style="left:${paidX}%"
           onmouseenter="event.stopPropagation();showWalletActivityTooltip(event,'${paidData}')"
           onmouseleave="hideWalletActivityTooltip()"></div>
      <div class="wallet-dumbbell-label paid" style="left:${paidX}%">Ξ${r.paid.toFixed(3)}</div>
      ${r.floorTokenId ? `<div class="wallet-dumbbell-dot floor" style="left:${floorX}%"
           onclick="event.stopPropagation();openModal(${r.floorTokenId})"
           onmouseenter="event.stopPropagation();showWalletActivityTooltip(event,'${floorData}')"
           onmouseleave="hideWalletActivityTooltip()"></div>` : `<div class="wallet-dumbbell-dot floor" style="left:${floorX}%"></div>`}
      <div class="wallet-dumbbell-label floor" style="left:${floorX}%">Ξ${r.floorNow.toFixed(3)}</div>
    </div>
  </div>`;
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
      return `<div class="rarity-improve-token" data-id="${t.id}" onclick="openModal(${t.id})">
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
  const inputSnapshots = stats.input_snapshots || {};
  const eventsHtml = (stats.events || []).slice(0, 10).map(ev => {
    const dateStr = ev.burnedAt ? new Date(ev.burnedAt).toLocaleDateString() : '';
    const ptsHtml = ev.pointsUsed != null ? `<span class="burn-best-pts">${burnsMetric(ev.pointsUsed)} pts</span>` : '';
    const angelTag = ev.isAngel ? `<span class="burn-best-tag" style="background:rgba(28,255,175,.15);border-color:rgba(28,255,175,.35);color:#1CFFAF">✨ Angel</span>` : '';
    return `<div class="burn-best-card">
      <div class="burn-best-survivor-row">
        <span class="burn-best-tag survivor">Survivor</span>
        ${burnsTokenChip(ev.survivorTokenId, null, ev.survivorSnapshotImage || null, ev.burnEventId)}
        ${angelTag}
        ${ptsHtml}
        <span class="burn-best-tx">${burnsTxLink(ev.txHash)}</span>
        ${dateStr ? `<span style="font-size:10px;color:var(--sub);margin-left:auto">${dateStr}</span>` : ''}
      </div>
      <div class="burn-best-burned-row">
        <span class="burn-best-tag burned">Burned (${burnsMetric((ev.burnedTokenIds||[]).length)})</span>
        ${burnsInputGallery(ev.burnedTokenIds, inputSnapshots, ev.burnEventId)}
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
    <div class="wallet-owned-edge-grid">
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
