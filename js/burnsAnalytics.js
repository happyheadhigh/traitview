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
  const diamond = (typeof rankDiamondHtml === 'function') ? rankDiamondHtml(n) : `#${burnsMetric(n)}`;
  return `<span class="burn-rank ${cls}">${diamond}</span>`;
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
function burnsNormalizeImgSrc(raw){
  const s = raw ? String(raw).trim() : '';
  if(!s) return '';
  if(s.startsWith('<svg')){
    try{ return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s); }catch(_){ return ''; }
  }
  if(s.startsWith('data:')) return s;
  return typeof ipfsToHttp === 'function' ? ipfsToHttp(s) : s;
}
function burnsTokenThumb(id, extraClass='', overrideSrc=null, burnEventId=null){
  const n = Number(id);
  if(!Number.isFinite(n) || n <= 0) return '';
  const src = overrideSrc ? burnsNormalizeImgSrc(overrideSrc) : burnsTokenImgSrc(n);
  const img = src ? `<img src="${burnsEsc(src)}" alt="#${n}" loading="lazy" decoding="async">` : `<span>#${n}</span>`;
  // Historical/frozen thumbnails (showing a specific past burn's appearance,
  // not the token's current one) are marked so the live-refresh system
  // (refreshLiveTokenData in app.js) knows to leave them alone — otherwise
  // it would overwrite this intentional historical image with the token's
  // current one on its next periodic pass.
  const frozenAttr = overrideSrc ? ' data-burn-frozen-img="1"' : '';
  // burnEventId, when known, opens the modal parked at THIS specific burn's
  // position in the token's history toggle rather than its current state --
  // e.g. clicking a survivor's thumbnail in its "Burn 2" row shows the
  // token as it looked right after burn 2, tagged Survivor, not today's form.
  const openCall = burnEventId ? `openModal(${n}, {burnEventId:${Number(burnEventId)}})` : `openModal(${n})`;
  return `<button type="button" class="burn-token-thumb ${burnsEsc(extraClass)}" data-burn-token-id="${n}"${frozenAttr} title="Open token #${n}" aria-label="Open token #${n}" onclick="event.stopPropagation(); if(typeof openModal==='function') ${openCall};">${img}</button>`;
}
function burnsTokenChip(id, row, overrideSrc=null, burnEventId=null){
  const n = Number(id);
  if(!Number.isFinite(n) || n <= 0) return '';
  const rankHtml = row ? burnsRowRankTag(row, n) : burnsRankTag(n);
  // Tried overlaying the rank on the thumbnail corner, then as a bottom
  // gradient bar -- both either covered real artwork (faces/hats sit right
  // in that zone) or had to be shrunk so small the rank became unreadable.
  // Simplest fix wins: leave the thumbnail completely clean, ID and rank as
  // two stacked plain-text lines underneath.
  return `<span class="burn-token-chip">
    ${burnsTokenThumb(n, '', overrideSrc, burnEventId)}
    <span class="burn-token-id">${burnsTokenLink(n)}</span>
    ${rankHtml || ''}
  </span>`;
}
function burnsTokenChipList(ids){
  const clean = (Array.isArray(ids) ? ids : []).map(Number).filter(n => Number.isFinite(n) && n > 0);
  const chips = clean.map(id => burnsTokenChip(id)).join('');
  return `<span class="burn-chip-list">${chips || '-'}</span>`;
}
function burnsInputGallery(ids, snapshotMap=null, burnEventId=null){
  const clean = (Array.isArray(ids) ? ids : []).map(Number).filter(n => Number.isFinite(n) && n > 0);
  // These IDs were destroyed by burning — they no longer represent their
  // original selves, so a "current" image lookup is meaningless/wrong for
  // them. Use the pre-burn snapshot when we have one; burnsTokenChip falls
  // back to the normal live lookup if no snapshot exists for a given id
  // (e.g. an older burn from before snapshotting was in place).
  const chips = clean.map(id => burnsTokenChip(id, null, snapshotMap?.[String(id)] || null, burnEventId)).join('');
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
  // Pre-burn snapshot images for destroyed input tokens, merged from both
  // endpoints that can return them. Keyed by token_id (string) -> image src.
  const inputSnapshots = { ...(latest?.input_snapshots || {}), ...(best?.input_snapshots || {}) };
  const data = { stats, latest, leaderboard, best, activity, inputSnapshots, loadedAt:Date.now() };
  BURNS_ANALYTICS_CACHE.data = data;
  BURNS_ANALYTICS_CACHE.loadedAt = Date.now();
  return data;
}

function burnScarcityGaugeHtml(remain, total){
  const burned = Math.max(0, total - remain);
  const pct = total > 0 ? Math.min(100, (burned / total) * 100) : 0;
  const r = 22, c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return `<div class="burn-scarcity-cell">
    <div class="burn-scarcity-gauge-wrap">
      <svg viewBox="0 0 56 56" class="burn-scarcity-gauge">
        <circle cx="28" cy="28" r="${r}" class="burn-scarcity-gauge-track"/>
        <circle cx="28" cy="28" r="${r}" class="burn-scarcity-gauge-fill" style="stroke-dasharray:${dash.toFixed(1)} ${c.toFixed(1)}"/>
      </svg>
      <div class="burn-scarcity-gauge-center">${pct.toFixed(1)}%</div>
    </div>
    <div class="burn-scarcity-text">
      <span>Collection Scarcity</span>
      <b>${burnsMetric(burned)} burned</b>
      <b class="burn-scarcity-sub">${burnsMetric(remain)} / ${burnsMetric(total)} remain</b>
    </div>
  </div>`;
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
    ['Total Burns', totalBurns],
    ['Tokens Used', tokensUsed],
    ['24H Burned', s.burned_24h],
    ['24H Burns', s.burns_24h]
  ];
  const gauge = (Number.isFinite(Number(estimatedSupply)) && Number.isFinite(Number(ocasBurned)))
    ? burnScarcityGaugeHtml(Number(estimatedSupply), Number(estimatedSupply) + Number(ocasBurned))
    : '';
  return `<div class="burn-stat-row">
    ${gauge ? `<div class="burn-stat-cell burn-stat-cell-gauge">${gauge}</div>` : ''}
    ${items.map(([label,val]) => `
    <div class="burn-stat-cell"><span>${burnsEsc(label)}</span><b>${burnsMetric(val)}</b></div>
  `).join('')}</div>`;
}
function renderLatestBurns(rows, snapshotMap=null){
  if(!rows.length) return '<div class="wallet-empty-state">No finalized burn rows returned yet.</div>';
  return `<div class="burn-table burn-latest-table">
    <div class="burn-table-head"><span>Tx</span><span>Inputs</span><span>Created</span><span>Count</span><span>Pts</span><span>Time</span><span>Wallet</span></div>
    ${rows.slice(0,25).map(row => {
    const ids = burnsInputIds(row).filter(Boolean);
    const created = row.created_token_id || row.survivor_token_id;
    return `<div class="burn-row burn-latest-row">
      <div class="burn-cell burn-tx"><b>${burnsTxLink(row.tx_hash)}</b></div>
      <div class="burn-cell burn-inputs">${burnsInputGallery(ids, snapshotMap, row.burn_event_id)}</div>
      <div class="burn-cell burn-created">${burnsTokenChip(created, row, row.snapshot_image || null, row.burn_event_id)}</div>
      <div class="burn-cell burn-count">${burnsMetric(row.input_count ?? ids.length)}</div>
      <div class="burn-cell burn-points">${row.points_used != null ? burnsMetric(row.points_used) : '-'}</div>
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
      <div class="burn-cell"><span class="burn-cell-label">OCAS Burned</span>${burnsMetric(row.tokens_burned || row.total_burned)}</div>
      <div class="burn-cell"><span class="burn-cell-label">Biggest</span>${burnsMetric(row.biggest_burn)}</div>
      <div class="burn-cell"><span class="burn-cell-label">Burns</span>${burnsMetric(row.burn_events || row.total_burns)}</div>
    </div>
  `).join('')}</div>`;
}
function renderBestBurns(best, snapshotMap=null){
  const groups = [
    ['Biggest Burns', best?.biggest || best?.biggest_burns || [], 'biggest'],
    ['Rarest Inputs', best?.rarest_inputs || best?.rarest_burned_inputs || best?.rarest || [], 'input'],
    ['Best Survivors', best?.best_survivors || best?.best_created_tokens || best?.survivors || [], 'survivor']
  ];
  const html = groups.map(([title, rows, kind]) => {
    if(!Array.isArray(rows) || !rows.length) return `<div class="burn-best-group"><h4>${burnsEsc(title)}</h4><div class="wallet-empty-state">No rows yet.</div></div>`;
    const items = rows.slice(0, 8).map(row => {
      if(kind === 'biggest'){
        const survivor = row.created_token_id || row.survivor_token_id;
        const ids = burnsInputIds(row).filter(Boolean);
        const ptsHtml = row.points_used != null ? `<span class="burn-best-pts">${burnsMetric(row.points_used)} pts</span>` : '';
        return `<div class="burn-best-card">
          <div class="burn-best-survivor-row">
            <span class="burn-best-tag survivor">Survivor</span>
            ${burnsTokenChip(survivor, row, row.snapshot_image || null, row.burn_event_id)}
            ${ptsHtml}
            <span class="burn-best-tx">${burnsTxLink(row.tx_hash)}</span>
          </div>
          <div class="burn-best-burned-row">
            <span class="burn-best-tag burned">Burned (${burnsMetric(row.input_count ?? ids.length)})</span>
            ${burnsInputGallery(ids, snapshotMap, row.burn_event_id)}
          </div>
        </div>`;
      }
      const primaryId = kind === 'input' ? (row.burned_token_id || row.token_id) : (row.created_token_id || row.survivor_token_id || row.token_id);
      // Rarest Inputs are destroyed tokens too — same reasoning as the input
      // gallery above, use the pre-burn snapshot (backend-attached directly
      // on the row for this endpoint) rather than a live/current lookup.
      // Best Survivors are still-alive tokens, so no override — they use
      // the normal live image path via burnsTokenChip's default behavior.
      const overrideSrc = kind === 'input' ? (row.snapshot_image || null) : null;
      const burnEventId = kind === 'input' ? (row.burn_event_id || null) : null;
      const typeTag = row.type_trait ? `<span class="burn-best-tag" style="background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.12);color:var(--sub)">${burnsEsc(row.type_trait)}</span>` : '';
      return `<div class="burn-mini-row">
        <span class="burn-mini-primary">${burnsTokenChip(primaryId, row, overrideSrc, burnEventId)}</span>
        ${typeTag}
        <span class="burn-best-tx">${burnsTxLink(row.tx_hash)}</span>
      </div>`;
    }).join('');
    return `<div class="burn-best-group"><h4>${burnsEsc(title)}</h4><div class="burn-best-list">${items}</div></div>`;
  }).join('');
  return `<div class="burn-best-grid">${html}</div>`;
}
function renderBurnActivity(rows){
  if(!rows.length) return '<div class="wallet-empty-state">Burn timeline is empty or still building.</div>';
  return `<div id="burnActivityChart" style="width:100%;height:320px"></div>`;
}
function drawBurnActivityChart(rows){
  const el = document.getElementById('burnActivityChart');
  if(!el || !Array.isArray(rows) || !rows.length) return;
  if(typeof Plotly === 'undefined'){ setTimeout(() => drawBurnActivityChart(rows), 80); return; }
  const recent = rows.slice(-90);
  const xs = recent.map(r => r.day || r.date || r.bucket || r.month || '');
  const events = recent.map(r => Number(r.burn_events || r.count || r.burns || 0));
  const used = recent.map(r => Number(r.tokens_used ?? (Number(r.tokens_burned || 0) + Number(r.tokens_created || 0))));
  const data = [
    {
      x: xs, y: events, name: 'Burn events', type: 'scatter', mode: 'lines',
      line: { color: '#FFD700', width: 2, shape: 'spline', smoothing: 0.4 },
      fill: 'tozeroy', fillcolor: 'rgba(255,215,0,0.12)',
      hovertemplate: '%{y} burn events<extra></extra>',
    },
    {
      x: xs, y: used, name: 'Tokens used', type: 'scatter', mode: 'lines',
      line: { color: '#2dd4bf', width: 2, shape: 'spline', smoothing: 0.4 },
      fill: 'tozeroy', fillcolor: 'rgba(45,212,191,0.12)',
      hovertemplate: '%{y} tokens used<extra></extra>',
    },
  ];
  const chartW = Math.min((el.parentElement||el).offsetWidth - 16, window.innerWidth - 32);
  const cardBg = getComputedStyle(document.body).getPropertyValue('--card').trim() || '#111c2a';
  const borderCol = getComputedStyle(document.body).getPropertyValue('--border').trim() || 'rgba(255,255,255,0.15)';
  const textCol = getComputedStyle(document.body).getPropertyValue('--text').trim() || '#e6edf7';
  const layout = {
    height: 320, showlegend: true,
    legend: { orientation: 'h', y: 1.15, x: 0, font: { size: 11 } },
    margin: { l: 44, r: 12, t: 6, b: 36 },
    paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
    font: { color: textCol },
    xaxis: { title: '', showgrid: false, fixedrange: true, tickfont: { size: 10 } },
    yaxis: { title: 'Count', rangemode: 'tozero', gridcolor: 'rgba(255,255,255,0.06)', fixedrange: true },
    hovermode: 'x unified', autosize: true, width: chartW || undefined,
    hoverlabel: { bgcolor: cardBg, bordercolor: borderCol, font: { color: textCol, size: 12 } },
  };
  const config = { displayModeBar: false, responsive: true, scrollZoom: false };
  Plotly.newPlot('burnActivityChart', data, layout, config);
}
// ── Trait Extinction Tracker ────────────────────────────────────────────────
// Compares each trait value's ORIGINAL mint count (all ~10,000 tokens, from
// the local static chunk files that ship with the site) against its CURRENT
// surviving count (already loaded into the global TRAIT_FREQ by app.js from
// the live /db/traits-fast endpoint). Zero new API calls — both halves of
// this comparison are data the site already has sitting in memory or on
// disk; this just diffs them instead of discarding the original count.
let _originalTraitFreqCache = null;
async function computeOriginalTraitFreq(){
  if(_originalTraitFreqCache) return _originalTraitFreqCache;
  if(typeof chunkUrlByIndex !== 'function' || typeof fetchJson !== 'function') return {};
  // Deliberately NOT using ensureChunk/indices() here — both are gated by
  // TOKEN_COUNT (current surviving supply, ~8,599), designed for loading
  // only what's needed to render the current grid. ensureChunk specifically
  // rejects (and permanently negative-caches in the shared CHUNK_CACHE) any
  // chunk index beyond that gate. We need the FULL original ~10,000-token
  // mint regardless of how many have since been burned, so this fetches
  // chunk files directly, bypassing that gate and using its own isolated
  // cache untouched by survivor-count logic.
  const allIdx = (typeof MANIFEST !== 'undefined' && MANIFEST?.files?.length)
    ? MANIFEST.files.map((_, i) => i)
    : Array.from({ length: 10 }, (_, i) => i); // fallback: 10 chunks of 1000 = 10,000 tokens
  const freq = {};
  for(const idx of allIdx){
    let ch = {};
    try{ ch = await fetchJson(chunkUrlByIndex(idx)); }catch(_){ continue; }
    for(const row of Object.values(ch)){
      for(const [k, v] of keepEntries(row.traits)){
        (freq[k] ||= {})[v] = (freq[k][v] || 0) + 1;
      }
    }
  }
  _originalTraitFreqCache = freq;
  return freq;
}
function computeTraitExtinction(originalFreq, currentFreq){
  const rows = [];
  for(const [traitName, values] of Object.entries(originalFreq || {})){
    for(const [value, original] of Object.entries(values)){
      if(original < 3) continue; // skip naturally 1-2-of-a-kind traits — too noisy to be meaningful
      const remaining = (currentFreq?.[traitName]?.[value]) || 0;
      const burned = original - remaining;
      if(burned <= 0) continue;
      rows.push({ traitName, value, original, remaining, burned, pct: (burned / original) * 100 });
    }
  }
  rows.sort((a, b) => b.pct - a.pct || b.burned - a.burned);
  return rows;
}
// Mirror of computeTraitExtinction — captures the opposite case, where a
// trait value's current count exceeds its original mint count. Burn
// survivors get a freshly recombined trait set, so this genuinely happens:
// a value can gain new holders even while total token count only shrinks.
function computeTraitGains(originalFreq, currentFreq){
  const rows = [];
  for(const [traitName, values] of Object.entries(currentFreq || {})){
    for(const [value, remaining] of Object.entries(values)){
      const original = (originalFreq?.[traitName]?.[value]) || 0;
      if(original < 3) continue; // same noise filter as extinction, for consistency
      const gained = remaining - original;
      if(gained <= 0) continue;
      rows.push({ traitName, value, original, remaining, gained, pct: (gained / original) * 100 });
    }
  }
  rows.sort((a, b) => b.pct - a.pct || b.gained - a.gained);
  return rows;
}
function extinctionBarColor(pct){
  if(pct >= 75) return '#f87171';
  if(pct >= 50) return '#fb923c';
  if(pct >= 25) return '#facc15';
  return '#4ade80';
}
function renderTraitExtinction(rows, gainRows){
  const hasExtinction = rows.length > 0;
  const hasGains = gainRows && gainRows.length > 0;
  if(!hasExtinction && !hasGains) return '<div class="wallet-empty-state">Not enough burn data yet to compute trait extinction.</div>';
  const extinct = rows.filter(r => r.remaining === 0);
  const depleted = rows.filter(r => r.remaining > 0); // no cap — the original>=3 && burned>0 filter already excludes noise
  let html = '';
  if(extinct.length){
    html += `<div class="extinct-banner">
      <div class="extinct-title">🔥 ${extinct.length} Trait${extinct.length===1?'':'s'} Gone Extinct</div>
      <div class="extinct-sub">No surviving tokens have these anymore</div>
      <div class="extinct-chips">${extinct.map(r =>
        `<span class="extinct-chip">${burnsEsc(r.traitName)}: ${burnsEsc(r.value)}</span>`
      ).join('')}</div>
    </div>`;
  }
  if(depleted.length){
    html += `<div class="extinction-grid">${depleted.map(r => {
      const pctRemain = Math.max(2, 100 - r.pct);
      return `<div class="extinction-card">
        <div class="extinction-label"><b>${burnsEsc(r.traitName)}</b><span>${burnsEsc(r.value)}</span></div>
        <div class="extinction-bar-track"><div class="extinction-bar-fill" style="width:${pctRemain}%;background:${extinctionBarColor(r.pct)}"></div></div>
        <div class="extinction-stat">${r.remaining} / ${r.original} left <span class="extinction-pct">-${Math.round(r.pct)}%</span></div>
      </div>`;
    }).join('')}</div>`;
  }
  if(hasGains){
    html += `<div class="gains-section">
      <div class="gains-title">📈 ${gainRows.length} Trait${gainRows.length===1?'':'s'} On The Rise</div>
      <div class="gains-sub">Burn survivors rolled these values more than they were lost to burns</div>
      <div class="extinction-grid">${gainRows.map(r => `<div class="extinction-card gains-card">
        <div class="extinction-label"><b>${burnsEsc(r.traitName)}</b><span>${burnsEsc(r.value)}</span></div>
        <div class="extinction-bar-track"><div class="extinction-bar-fill" style="width:${Math.min(100, r.pct)}%;background:#4ade80"></div></div>
        <div class="extinction-stat">${r.remaining} / ${r.original} original <span class="extinction-pct gains-pct">+${Math.round(r.pct)}%</span></div>
      </div>`).join('')}</div>
    </div>`;
  }
  return html || '<div class="wallet-empty-state">Not enough burn data yet to compute trait extinction.</div>';
}
async function loadTraitExtinction(){
  const host = document.getElementById('traitExtinctionHost');
  if(!host) return;
  try{
    const original = await computeOriginalTraitFreq();
    const current = (typeof TRAIT_FREQ === 'object' && TRAIT_FREQ) || {};
    const rows = computeTraitExtinction(original, current);
    const gainRows = computeTraitGains(original, current);
    host.innerHTML = renderTraitExtinction(rows, gainRows);
  }catch(e){
    host.innerHTML = '<div class="wallet-empty-state">Could not compute trait extinction data.</div>';
  }
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
const BURN_THUMB_SIZES = ['sm', 'md', 'lg'];
const BURN_THUMB_ICONS = { sm: '🔍', md: '🔎', lg: '🔬' };
const BURN_THUMB_LABELS = { sm: 'Small', md: 'Medium', lg: 'Large' };
function getBurnThumbSize(){
  try{
    const v = localStorage.getItem('traitview_burn_thumb_size');
    return BURN_THUMB_SIZES.includes(v) ? v : 'sm';
  }catch(_){ return 'sm'; }
}
function applyBurnThumbSizeClass(host, size){
  host.classList.remove('burn-thumbs-md', 'burn-thumbs-lg');
  if(size === 'md') host.classList.add('burn-thumbs-md');
  if(size === 'lg') host.classList.add('burn-thumbs-lg');
}
function applyBurnThumbSizeToAllHosts(size){
  ['burnsAnalyticsHost', 'walletBurnStatsHost', 'mobileWalletBurnStatsHost'].forEach(id => {
    const el = document.getElementById(id);
    if(el) applyBurnThumbSizeClass(el, size);
  });
}
function toggleBurnThumbSize(){
  const cur = getBurnThumbSize();
  const next = BURN_THUMB_SIZES[(BURN_THUMB_SIZES.indexOf(cur) + 1) % BURN_THUMB_SIZES.length];
  try{ localStorage.setItem('traitview_burn_thumb_size', next); }catch(_){}
  applyBurnThumbSizeToAllHosts(next);
  // One shared preference, but it can appear on two different tabs (Burns +
  // Wallet) at once if both have rendered -- update every instance of the
  // button, not just whichever one was clicked.
  document.querySelectorAll('.burn-thumb-size-toggle-btn').forEach(btn => {
    btn.textContent = BURN_THUMB_ICONS[next];
    btn.title = `Thumbnail size: ${BURN_THUMB_LABELS[next]} (click to cycle)`;
  });
}
function renderBurnsAnalytics(data){
  const host = document.getElementById('burnsAnalyticsHost');
  if(!host) return;
  const thumbSize = getBurnThumbSize();
  applyBurnThumbSizeClass(host, thumbSize);
  const stats = data?.stats?.stats || data?.stats || {};
  const latestRows = burnsRows(data, 'latest', 'burns');
  const leaderRows = burnsRows(data, 'leaderboard', 'leaders');
  const activityRows = burnsRows(data, 'activity', 'activity');
  host.innerHTML = `<div class="burns-analytics-inner">
    <div class="burn-toolbar"><button type="button" class="btn ghost" onclick="loadBurnsAnalytics(true)">Refresh</button><button type="button" class="btn ghost burn-icon-btn burn-thumb-size-toggle-btn" onclick="toggleBurnThumbSize()" title="Thumbnail size: ${BURN_THUMB_LABELS[thumbSize]} (click to cycle)">${BURN_THUMB_ICONS[thumbSize]}</button><span>${data?.loadedAt ? `Loaded ${burnsEsc(burnsDate(data.loadedAt))}` : ''}</span></div>
    ${renderBurnStats(stats)}
    ${burnsSection('Latest Burns', renderLatestBurns(latestRows, data?.inputSnapshots), 'Finalized burn events from Railway')}
    <div class="burn-two-col">
      ${burnsSection('Burn Leaderboard', renderBurnLeaderboard(leaderRows), 'Ranked by OCAS burned')}
      ${burnsSection('Burn Timeline', renderBurnActivity(activityRows), 'Daily burn events and tokens used')}
    </div>
    ${burnsSection('Trait Extinction Tracker', '<div id="traitExtinctionHost"><div class="wallet-empty-state">Loading original trait data…</div></div>', 'Trait values disappearing from the living supply due to burns')}
    ${burnsSection('Best Burns', renderBestBurns(data?.best || {}, data?.inputSnapshots), 'Largest burns and rank-aware highlights when available')}
  </div>`;
  drawBurnActivityChart(activityRows);
  loadTraitExtinction();
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
