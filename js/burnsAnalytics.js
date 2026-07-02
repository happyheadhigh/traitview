/* TraitView Burns analytics.
   Loaded as a classic script. Do not convert to modules.

   Backend endpoints expected on the existing Railway API service:
   - GET /db/burn-stats
   - GET /db/burn-latest?limit=25
   - GET /db/burn-leaderboard?limit=25
   - GET /db/burn-best
   - GET /db/burn-activity

   The Railway route layer lives in happyheadhigh/ocas-sales-bot, not this
   static TraitView repo. Until those routes are deployed there, this tab must
   show an empty state instead of invented burn numbers.

   Bot DB context inspected in happyheadhigh/ocas-sales-bot:
   - burn_events has tx_hash, block_number, log_index, burner_wallet,
     survivor_token_id, points_used, burned_at
   - burn_event_inputs links burn_event_id to burned_token_id
   - ocas_burned = distinct non-survivor burn_event_inputs rows
   - total_burns = finalized burn_events count
   - tokens_used = ocas_burned + total_burns
   - estimated_supply = 10000 - ocas_burned
*/

const BURNS_ANALYTICS_CACHE = { data:null, loadedAt:0 };

function burnsEsc(v){
  if(typeof comboEsc === 'function') return comboEsc(v);
  return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function burnsMetric(v, fallback='-'){
  if(typeof walletMetric === 'function') return walletMetric(v, fallback);
  if(v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString() : String(v);
}
function burnsDate(v){
  if(!v) return '';
  const raw = typeof v === 'number' && v < 20000000000 ? v * 1000 : v;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
}
function burnsShortAddr(addr){
  const s = String(addr || '');
  return /^0x[a-f0-9]{40}$/i.test(s) ? `${s.slice(0,6)}...${s.slice(-4)}` : (s || '-');
}
function burnsTxLink(tx){
  const h = String(tx || '').trim();
  if(!h) return '-';
  return `<a href="https://etherscan.io/tx/${burnsEsc(h)}" target="_blank" rel="noopener">${burnsEsc(h.slice(0,8))}...</a>`;
}
function burnsTokenLink(id){
  const n = Number(id);
  if(!Number.isFinite(n) || n <= 0) return '-';
  return `<a href="https://opensea.io/assets/ethereum/${LIVE_CONTRACT}/${n}" target="_blank" rel="noopener">#${n}</a>`;
}
function burnsRankBadge(rank){
  const n = Number(rank);
  if(!Number.isFinite(n) || n <= 0) return '';
  const cls = n <= 100 ? 'gold' : (n <= 1000 ? 'purple' : 'teal');
  return `<span class="burn-rank ${cls}">#${burnsMetric(n)}</span>`;
}
function burnsRankTag(id){
  const n = Number(id);
  if(!Number.isFinite(n) || n <= 0) return '';
  const os = typeof OS_RANK_MAP !== 'undefined' ? OS_RANK_MAP.get(n) : null;
  const tv = typeof RARITY_OBS_RANK !== 'undefined' ? RARITY_OBS_RANK.get(n) : null;
  return burnsRankBadge(os || tv);
}
function burnsRowRankTag(row, id){
  return burnsRankBadge(row?.rank || row?.os_rank || row?.obs_rank) || burnsRankTag(id);
}
function burnsTokenImgSrc(id){
  const n = Number(id);
  if(!Number.isFinite(n) || n <= 0) return '';
  if(typeof VS !== 'undefined' && VS && typeof VS._imgSrc === 'function') return VS._imgSrc(n) || '';
  const mapVal = (typeof IMAGES_MAP !== 'undefined' && IMAGES_MAP) ? IMAGES_MAP.get(n) : null;
  const s = mapVal ? String(mapVal).trim() : '';
  if(s && s.startsWith('<svg')){
    try{ return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s); }catch(_){ return ''; }
  }
  if(s && s.startsWith('data:')) return s;
  if(s) return typeof ipfsToHttp === 'function' ? ipfsToHttp(s) : s;
  return typeof imgForId === 'function' ? imgForId(n) : '';
}
function burnsTokenThumb(id, extraClass=''){
  const n = Number(id);
  if(!Number.isFinite(n) || n <= 0) return '';
  const src = burnsTokenImgSrc(n);
  const img = src ? `<img src="${burnsEsc(src)}" alt="#${n}" loading="lazy" decoding="async">` : `<span>#${n}</span>`;
  return `<button type="button" class="burn-token-thumb ${burnsEsc(extraClass)}" data-burn-token-id="${n}" title="Open token #${n}" aria-label="Open token #${n}" onclick="event.stopPropagation(); if(typeof openModal==='function') openModal(${n});">${img}</button>`;
}
function burnsTokenChip(id, row){
  const n = Number(id);
  if(!Number.isFinite(n) || n <= 0) return '';
  return `<span class="burn-token-chip">${burnsTokenThumb(n)}<span class="burn-token-id">${burnsTokenLink(n)}</span>${row ? burnsRowRankTag(row, n) : burnsRankTag(n)}</span>`;
}
function burnsTokenChipList(ids, limit=8){
  const clean = (Array.isArray(ids) ? ids : []).map(Number).filter(n => Number.isFinite(n) && n > 0);
  const more = clean.length > limit ? `<span class="burn-muted">+${clean.length - limit}</span>` : '';
  const chips = clean.slice(0, limit).map(id => burnsTokenChip(id)).join('');
  return `<span class="burn-chip-list">${chips || '-'}${more}</span>`;
}
function burnsInputGallery(ids){
  const clean = (Array.isArray(ids) ? ids : []).map(Number).filter(n => Number.isFinite(n) && n > 0);
  const chips = clean.map(id => burnsTokenChip(id)).join('');
  return `<div class="burn-input-gallery">${chips || '-'}</div>`;
}
function burnsInputIds(row){
  return row?.input_token_ids || row?.burned_ids || row?.burned_token_ids || row?.tokens || [];
}
function burnsInputCount(row){
  const ids = burnsInputIds(row);
  return Number(row?.input_count ?? row?.tokens_burned ?? row?.total_burned ?? (Array.isArray(ids) ? ids.length : 0));
}
function burnsRows(data, key, alt){
  const raw = data?.[key]?.[key] || data?.[key]?.[alt] || data?.[key]?.rows || data?.[key] || [];
  return Array.isArray(raw) ? raw : [];
}
function burnsSection(title, body, sub=''){
  return `<div class="burn-card">
    <div class="wallet-analytics-head">
      <div><div class="wallet-analytics-title">${burnsEsc(title)}</div>${sub ? `<div class="wallet-analytics-sub">${burnsEsc(sub)}</div>` : ''}</div>
    </div>
    ${body}
  </div>`;
}

async function fetchBurnsAnalytics(force=false){
  if(BURNS_ANALYTICS_CACHE.data && !force) return BURNS_ANALYTICS_CACHE.data;
  const [stats, latest, leaderboard, best, activity] = await Promise.all([
    dbFetch('/db/burn-stats'),
    dbFetch('/db/burn-latest', { limit:25 }),
    dbFetch('/db/burn-leaderboard', { limit:25 }),
    dbFetch('/db/burn-best'),
    dbFetch('/db/burn-activity')
  ]);
  const data = { stats, latest, leaderboard, best, activity, loadedAt:Date.now() };
  BURNS_ANALYTICS_CACHE.data = data;
  BURNS_ANALYTICS_CACHE.loadedAt = Date.now();
  return data;
}

function renderBurnStats(stats){
  const s = stats || {};
  const ocasBurned = s.ocas_burned ?? s.tokens_burned;
  const totalBurns = s.total_burns ?? s.tokens_created;
  const tokensUsed = s.tokens_used ?? (
    Number.isFinite(Number(ocasBurned)) && Number.isFinite(Number(totalBurns))
      ? Number(ocasBurned) + Number(totalBurns)
      : null
  );
  const estimatedSupply = s.estimated_supply ?? (
    Number.isFinite(Number(ocasBurned)) ? 10000 - Number(ocasBurned) : null
  );
  const items = [
    ['OCAS Burned', ocasBurned],
    ['Total Burns', totalBurns],
    ['Tokens Used', tokensUsed],
    ['Est. Supply', estimatedSupply],
    ['24H Burned', s.burned_24h],
    ['24H Burns', s.burns_24h]
  ];
  return `<div class="burn-stat-row">${items.map(([label,val]) => `
    <div class="burn-stat-cell"><span>${burnsEsc(label)}</span><b>${burnsMetric(val)}</b></div>
  `).join('')}</div>`;
}
function renderLatestBurns(rows){
  if(!rows.length) return '<div class="wallet-empty-state">No finalized burn rows returned yet.</div>';
  return `<div class="burn-table burn-latest-table">
    <div class="burn-table-head"><span>Tx</span><span>Inputs</span><span>Created</span><span>Count</span><span>Time</span><span>Wallet</span></div>
    ${rows.slice(0,25).map(row => {
    const ids = burnsInputIds(row).filter(Boolean);
    const created = row.created_token_id || row.survivor_token_id;
    return `<div class="burn-row burn-latest-row">
      <div class="burn-cell burn-tx"><b>${burnsTxLink(row.tx_hash)}</b></div>
      <div class="burn-cell burn-inputs">${burnsInputGallery(ids)}</div>
      <div class="burn-cell burn-created">${burnsTokenChip(created, row)}</div>
      <div class="burn-cell burn-count">${burnsMetric(row.input_count ?? ids.length)}</div>
      <div class="burn-cell burn-time">${burnsEsc(burnsDate(row.burn_ts || row.burned_at || row.timestamp))}</div>
      <div class="burn-cell burn-wallet">${burnsEsc(burnsShortAddr(row.wallet || row.burner_wallet))}</div>
    </div>`;
  }).join('')}</div>`;
}
function renderBurnLeaderboard(rows){
  if(!rows.length) return '<div class="wallet-empty-state">No burner leaderboard rows returned yet.</div>';
  return `<div class="burn-table compact burn-leader-table">
    <div class="burn-table-head"><span>#</span><span>Wallet</span><span>OCAS Burned</span><span>Biggest</span><span>Burns</span></div>
    ${rows.slice(0,25).map((row,i) => `
    <div class="burn-row leaderboard burn-leader-row">
      <div class="burn-cell burn-rank-num">${i+1}</div>
      <div class="burn-cell burn-wallet"><b>${burnsEsc(burnsShortAddr(row.wallet || row.burner_wallet))}</b></div>
      <div class="burn-cell">${burnsMetric(row.tokens_burned || row.total_burned)}</div>
      <div class="burn-cell">${burnsMetric(row.biggest_burn)}</div>
      <div class="burn-cell">${burnsMetric(row.burn_events || row.total_burns)}</div>
    </div>
  `).join('')}</div>`;
}
function renderBestBurns(best){
  const groups = [
    ['Biggest Burns', best?.biggest || best?.biggest_burns || [], 'biggest'],
    ['Rarest Inputs', best?.rarest_inputs || best?.rarest_burned_inputs || best?.rarest || [], 'input'],
    ['Best Survivors', best?.best_survivors || best?.best_created_tokens || best?.survivors || [], 'survivor']
  ];
  const html = groups.map(([title, rows, kind]) => {
    if(!Array.isArray(rows) || !rows.length) return `<div class="burn-best-group"><h4>${burnsEsc(title)}</h4><div class="wallet-empty-state">No rows yet.</div></div>`;
    return `<div class="burn-best-group"><h4>${burnsEsc(title)}</h4>${rows.slice(0,8).map(row => {
      const survivor = row.created_token_id || row.survivor_token_id || row.token_id;
      const ids = burnsInputIds(row).filter(Boolean);
      const primaryId = kind === 'input' ? (row.burned_token_id || row.token_id) : survivor;
      const inputSummary = ids.length ? `<span class="burn-best-inputs">${burnsTokenChipList(ids, 5)}</span>` : '';
      return `<div class="burn-mini-row">
        <span class="burn-mini-primary">${burnsTokenChip(primaryId, row)}</span>
        <span>${kind === 'input' ? 'Input' : burnsMetric(row.input_count ?? ids.length) + ' inputs'}</span>
        <span>${burnsTxLink(row.tx_hash)}</span>
        ${inputSummary}
      </div>`;
    }).join('')}</div>`;
  }).join('');
  return `<div class="burn-best-grid">${html}</div>`;
}
function renderBurnActivity(rows){
  if(!rows.length) return '<div class="wallet-empty-state">Burn timeline is empty or still building.</div>';
  const recent = rows.slice(-48);
  const max = Math.max(1, ...recent.flatMap(r => {
    const events = Number(r.burn_events || r.count || r.burns || 0);
    const used = Number(r.tokens_used ?? (Number(r.tokens_burned || 0) + Number(r.tokens_created || 0)));
    return [events, used];
  }));
  return `<div class="burn-activity-legend"><span><i class="events"></i>Burn events</span><span><i class="used"></i>Tokens used</span></div><div class="burn-axis-label burn-y-label">Count</div><div class="burn-activity-bars">${recent.map(r => {
    const events = Number(r.burn_events || r.count || r.burns || 0);
    const used = Number(r.tokens_used ?? (Number(r.tokens_burned || 0) + Number(r.tokens_created || 0)));
    const h1 = Math.max(8, Math.round((events / max) * 72));
    const h2 = Math.max(8, Math.round((used / max) * 72));
    const label = r.day || r.date || r.bucket || r.month || '';
    return `<div class="burn-activity-day" title="${burnsEsc(label)}: ${burnsMetric(events)} burn events, ${burnsMetric(used)} tokens used"><span class="burn-activity-bar events" style="height:${h1}px"></span><span class="burn-activity-bar used" style="height:${h2}px"></span></div>`;
  }).join('')}</div><div class="burn-axis-label burn-x-label">Date / day</div>`;
}
function renderBurnSizeDistribution(activity){
  const rows = activity?.burn_size_distribution || activity?.distribution || [];
  if(!Array.isArray(rows) || !rows.length) return '<div class="wallet-empty-state">Burn size distribution is not available yet.</div>';
  const max = Math.max(1, ...rows.map(r => Number(r.burn_events || r.count || 0)));
  return `<div class="burn-size-dist">${rows.map(r => {
    const val = Number(r.burn_events || r.count || 0);
    const pct = Math.max(3, Math.round((val / max) * 100));
    return `<div class="burn-size-row"><span>${burnsEsc(r.bucket || r.label || '-')}</span><div><i style="width:${pct}%"></i></div><b>${burnsMetric(val)}</b></div>`;
  }).join('')}</div>`;
}
function toggleBurnThumbSize(){
  const host = document.getElementById('burnsAnalyticsHost');
  if(!host) return;
  const isLg = host.classList.toggle('burn-thumbs-lg');
  try{ localStorage.setItem('traitview_burn_thumbs_lg', isLg ? '1' : '0'); }catch(_){}
  const btn = document.getElementById('burnThumbSizeToggle');
  if(btn) btn.textContent = isLg ? '🔎 Smaller Thumbnails' : '🔍 Bigger Thumbnails';
}
function renderBurnsAnalytics(data){
  const host = document.getElementById('burnsAnalyticsHost');
  if(!host) return;
  let thumbsLg = false;
  try{ thumbsLg = localStorage.getItem('traitview_burn_thumbs_lg') === '1'; }catch(_){}
  host.classList.toggle('burn-thumbs-lg', thumbsLg);
  const stats = data?.stats?.stats || data?.stats || {};
  const latestRows = burnsRows(data, 'latest', 'burns');
  const leaderRows = burnsRows(data, 'leaderboard', 'leaders');
  const activityRows = burnsRows(data, 'activity', 'activity');
  host.innerHTML = `<div class="burns-analytics-inner">
    <div class="burn-toolbar"><button type="button" class="btn ghost" onclick="loadBurnsAnalytics(true)">Refresh</button><button type="button" class="btn ghost" id="burnThumbSizeToggle" onclick="toggleBurnThumbSize()">${thumbsLg ? '🔎 Smaller Thumbnails' : '🔍 Bigger Thumbnails'}</button><span>${data?.loadedAt ? `Loaded ${burnsEsc(burnsDate(data.loadedAt))}` : ''}</span></div>
    ${renderBurnStats(stats)}
    ${burnsSection('Latest Burns', renderLatestBurns(latestRows), 'Finalized burn events from Railway')}
    <div class="burn-two-col">
      ${burnsSection('Burn Leaderboard', renderBurnLeaderboard(leaderRows), 'Ranked by OCAS burned')}
      ${burnsSection('Burn Timeline', renderBurnActivity(activityRows), 'Daily burn events and tokens used')}
    </div>
    ${burnsSection('Burn Size Distribution', renderBurnSizeDistribution(data?.activity || {}), 'How many input tokens each burn used')}
    ${burnsSection('Best Burns', renderBestBurns(data?.best || {}), 'Largest burns and rank-aware highlights when available')}
  </div>`;
}
function renderBurnsEndpointEmpty(error){
  const host = document.getElementById('burnsAnalyticsHost');
  if(!host) return;
  host.innerHTML = `<div class="burns-analytics-inner">
    <div class="burn-toolbar"><button type="button" class="btn ghost" onclick="loadBurnsAnalytics(true)">Refresh</button></div>
    <div class="wallet-empty-state">
      <b>Burn analytics endpoint not connected yet.</b><br>
      Expected Railway routes: /db/burn-stats, /db/burn-latest, /db/burn-leaderboard, /db/burn-best, /db/burn-activity.
      ${error ? `<br><span class="burn-muted">${burnsEsc(error)}</span>` : ''}
    </div>
  </div>`;
}
async function loadBurnsAnalytics(force=false){
  const host = document.getElementById('burnsAnalyticsHost');
  if(!host) return null;
  if(BURNS_ANALYTICS_CACHE.data && !force){
    renderBurnsAnalytics(BURNS_ANALYTICS_CACHE.data);
    return BURNS_ANALYTICS_CACHE.data;
  }
  host.innerHTML = '<div class="wallet-empty-state">Loading burn analytics...</div>';
  try{
    const data = await fetchBurnsAnalytics(force);
    renderBurnsAnalytics(data);
    return data;
  }catch(e){
    renderBurnsEndpointEmpty(e?.message || 'Railway API endpoint unavailable');
    return null;
  }
}
