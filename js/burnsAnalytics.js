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
   - tokens_burned = distinct burn_event_inputs rows for finalized burn_events
   - tokens_created = finalized burn_events count
   - supply_reduced_by = tokens_burned - tokens_created
   - estimated_supply = 10000 - supply_reduced_by
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
function burnsRankTag(id){
  const n = Number(id);
  if(!Number.isFinite(n) || n <= 0) return '';
  const os = typeof OS_RANK_MAP !== 'undefined' ? OS_RANK_MAP.get(n) : null;
  const tv = typeof RARITY_OBS_RANK !== 'undefined' ? RARITY_OBS_RANK.get(n) : null;
  const rank = os || tv;
  if(!rank) return '';
  const cls = rank <= 100 ? 'gold' : (rank <= 1000 ? 'purple' : 'teal');
  return `<span class="burn-rank ${cls}">#${burnsMetric(rank)}</span>`;
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
  const items = [
    ['Tokens Burned', s.tokens_burned],
    ['New Burn Tokens', s.tokens_created],
    ['Supply Reduced By', s.supply_reduced_by],
    ['Estimated Supply', s.estimated_supply]
  ];
  return `<div class="burn-stat-row">${items.map(([label,val]) => `
    <div class="wallet-stat-pill"><span>${burnsEsc(label)}</span><b>${burnsMetric(val)}</b></div>
  `).join('')}</div>`;
}
function renderLatestBurns(rows){
  if(!rows.length) return '<div class="wallet-empty-state">No finalized burn rows returned yet.</div>';
  return `<div class="burn-table">${rows.slice(0,25).map(row => {
    const ids = burnsInputIds(row).filter(Boolean);
    const idHtml = ids.slice(0,8).map(burnsTokenLink).join(' ');
    const more = ids.length > 8 ? ` <span class="burn-muted">+${ids.length-8}</span>` : '';
    return `<div class="burn-row">
      <div class="burn-main">
        <b>${burnsTxLink(row.tx_hash)}</b>
        <span>${burnsEsc(burnsDate(row.burn_ts || row.burned_at || row.timestamp))}</span>
        <span>${burnsEsc(burnsShortAddr(row.wallet || row.burner_wallet))}</span>
      </div>
      <div class="burn-detail">
        <span>Inputs ${burnsMetric(row.input_count ?? ids.length)}</span>
        <span>${idHtml || '-' }${more}</span>
        <span>Created ${burnsTokenLink(row.created_token_id || row.survivor_token_id)} ${burnsRankTag(row.created_token_id || row.survivor_token_id)}</span>
      </div>
    </div>`;
  }).join('')}</div>`;
}
function renderBurnLeaderboard(rows){
  if(!rows.length) return '<div class="wallet-empty-state">No burner leaderboard rows returned yet.</div>';
  return `<div class="burn-table compact">${rows.slice(0,25).map((row,i) => `
    <div class="burn-row leaderboard">
      <div class="burn-main"><b>${i+1}. ${burnsEsc(burnsShortAddr(row.wallet || row.burner_wallet))}</b><span>${burnsMetric(row.burn_events || row.total_burns)} burns</span></div>
      <div class="burn-detail"><span>${burnsMetric(row.tokens_burned || row.total_burned)} tokens burned</span><span>Biggest ${burnsMetric(row.biggest_burn)}</span><span>${row.rarest_burn ? `Best ${burnsEsc(row.rarest_burn)}` : ''}</span></div>
    </div>
  `).join('')}</div>`;
}
function renderBestBurns(best){
  const groups = [
    ['Biggest Burns', best?.biggest || best?.biggest_burns || []],
    ['Rarest Inputs', best?.rarest_inputs || best?.rarest || []],
    ['Best Survivors', best?.best_survivors || best?.survivors || []]
  ];
  const html = groups.map(([title, rows]) => {
    if(!Array.isArray(rows) || !rows.length) return `<div class="burn-best-group"><h4>${burnsEsc(title)}</h4><div class="wallet-empty-state">No rows yet.</div></div>`;
    return `<div class="burn-best-group"><h4>${burnsEsc(title)}</h4>${rows.slice(0,8).map(row => {
      const survivor = row.created_token_id || row.survivor_token_id || row.token_id;
      const ids = burnsInputIds(row).filter(Boolean);
      return `<div class="burn-mini-row">
        <span>${burnsTokenLink(survivor)} ${burnsRankTag(survivor)}</span>
        <span>${burnsMetric(row.input_count ?? ids.length)} inputs</span>
        <span>${burnsTxLink(row.tx_hash)}</span>
      </div>`;
    }).join('')}</div>`;
  }).join('');
  return `<div class="burn-best-grid">${html}</div>`;
}
function renderBurnActivity(rows){
  if(!rows.length) return '<div class="wallet-empty-state">Burn activity endpoint is empty or still building.</div>';
  const max = Math.max(1, ...rows.map(r => Number(r.count || r.burns || r.tokens_burned || 0)));
  return `<div class="burn-activity-bars">${rows.slice(-48).map(r => {
    const val = Number(r.count || r.burns || r.tokens_burned || 0);
    const h = Math.max(8, Math.round((val / max) * 72));
    const label = r.day || r.date || r.bucket || r.month || '';
    return `<div class="burn-activity-bar" style="height:${h}px" title="${burnsEsc(label)}: ${burnsMetric(val)}"></div>`;
  }).join('')}</div>`;
}
function renderBurnsAnalytics(data){
  const host = document.getElementById('burnsAnalyticsHost');
  if(!host) return;
  const stats = data?.stats?.stats || data?.stats || {};
  const latestRows = burnsRows(data, 'latest', 'burns');
  const leaderRows = burnsRows(data, 'leaderboard', 'leaders');
  const activityRows = burnsRows(data, 'activity', 'activity');
  host.innerHTML = `<div class="burns-analytics-inner">
    <div class="burn-toolbar"><button type="button" class="btn ghost" onclick="loadBurnsAnalytics(true)">Refresh</button><span>${data?.loadedAt ? `Loaded ${burnsEsc(burnsDate(data.loadedAt))}` : ''}</span></div>
    ${renderBurnStats(stats)}
    ${burnsSection('Latest Burns', renderLatestBurns(latestRows), 'Finalized burn events from Railway')}
    <div class="burn-two-col">
      ${burnsSection('Burn Leaderboard', renderBurnLeaderboard(leaderRows), 'Ranked by tokens burned')}
      ${burnsSection('Burn Activity', renderBurnActivity(activityRows), 'Compact timeline')}
    </div>
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
