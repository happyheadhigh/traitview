/* TraitView extracted app logic.
   Generated from index.html by tools/split-index.mjs.
   Classic script on purpose so existing inline onclick handlers still work. */

/* live settings */



// Standalone owner hydration for non-VS desktop list render path
const _OWNER_CACHE   = new Map();
const _OWNER_PENDING = new Set();
function hydrateListOwners(container){
  (container || document).querySelectorAll('[data-owner-id]').forEach(el => {
    const id = +el.dataset.ownerId;
    if(!id) return;
    if(_OWNER_CACHE.has(id)){ _applyOwnerEl(el, _OWNER_CACHE.get(id)); return; }
    if(_OWNER_PENDING.has(id)) return;
    _OWNER_PENDING.add(id);
    fetch(`${LIVE_ENDPOINT}/os/owner?contract=${LIVE_CONTRACT}&tokenId=${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const addr = data?.owner || data?.address || null;
        _OWNER_CACHE.set(id, addr);
        _OWNER_PENDING.delete(id);
        document.querySelectorAll(`[data-owner-id="${id}"]`).forEach(el2 => _applyOwnerEl(el2, addr));
      })
      .catch(() => _OWNER_PENDING.delete(id));
  });
}
function _applyOwnerEl(el, addr){
  if(!el) return;
  if(addr){
    el.textContent = addr.slice(0,6)+'…'+addr.slice(-4);
    el.style.color = '#7c9bbf';
    el.style.textDecoration = 'underline';
    el.style.cursor = 'pointer';
    el.onclick = e => {
      e.stopPropagation();
      openWalletView(addr);
    };
  } else {
    el.textContent = '—';
    el.classList.add('muted');
  }
}

/* utils */
const $=s=>document.querySelector(s);
const el=(t,c,h)=>{const x=document.createElement(t); if(c)x.className=c; if(h!=null)x.innerHTML=h; return x;};
const pad4=n=>String(n).padStart(4,'0');
const chunkIndexFor=id=>Math.floor((id-1)/CHUNK_SIZE);
function chunkUrlByIndex(idx){
  // Prefer the actual filename from traits_manifest.json instead of rebuilding it.
  // This prevents bad/generated paths when chunk sizing or filenames drift.
  const file = MANIFEST?.files?.[idx]?.file;
  if(file) return `${DATA_DIR}/${CHUNKS_DIR}/${file}`;
  return `${DATA_DIR}/${CHUNKS_DIR}/traits_${pad4(idx*CHUNK_SIZE+1)}_${pad4((idx+1)*CHUNK_SIZE)}.json`;
}


/* IO */
async function fetchJson(url){ const r=await fetch(url); if(!r.ok) throw new Error(url+' '+r.status); const ct=r.headers.get('content-type')||''; if(!ct.includes('json') && !ct.includes('javascript')) throw new Error(url+' non-JSON response'); return r.json(); }
function _applyFloorChange(el, current, reference){
  if(!el||current==null||reference==null||reference<=0){ if(el) el.style.display='none'; return; }
  const pct = ((current - reference) / reference) * 100;
  if(Math.abs(pct) < 0.5){ el.style.display='none'; return; }
  const up = pct >= 0;
  el.textContent = (up?'▲ ':'▼ ') + Math.abs(pct).toFixed(1)+'%';
  el.style.color  = up ? '#4ade80' : '#f87171';
  el.style.display = '';
}
async function loadManifest(){
  const j=await fetchJson(MANIFEST_URL);
  MANIFEST=j;
  CHUNK_SIZE=j.chunk_size||CHUNK_SIZE;
  CHUNKS_DIR=j.chunks_dir||CHUNKS_DIR;
  TOKEN_COUNT=Math.min((j.files?.at(-1)?.end)||0, 10000);
  window.CHUNK_SIZE = CHUNK_SIZE;
  window.TOKEN_COUNT = TOKEN_COUNT;
}
async function ensureChunk(idx){
  idx = Number(idx);
  if(!Number.isFinite(idx) || idx < 0) return {};
  const maxToken = TOKEN_COUNT > 0 ? TOKEN_COUNT : 10000;
  const maxIdx = Math.ceil(maxToken / CHUNK_SIZE) - 1;
  if(idx > maxIdx){
    // Ignore bogus chunk requests from stale listing keys or old preload code.
    const empty = {};
    CHUNK_CACHE.set(idx, empty);
    return empty;
  }
  if(CHUNK_CACHE.has(idx)) return CHUNK_CACHE.get(idx);
  const url=chunkUrlByIndex(idx);
  const j=await fetchJson(url);
  CHUNK_CACHE.set(idx,j);
  return j;
}
function indices(){
  // Cap to chunks that actually correspond to valid token IDs (1–10000).
  // If the manifest lists more files than exist on disk, those chunk fetches
  // return non-JSON (404 HTML) and spam the console with errors.
  const MAX_TOKEN = TOKEN_COUNT > 0 ? TOKEN_COUNT : 10000;
  const maxIdx = Math.ceil(MAX_TOKEN / CHUNK_SIZE) - 1;
  const fromManifest = MANIFEST?.files?.map((_,i)=>i) || [];
  if(fromManifest.length) return fromManifest.filter(i => i <= maxIdx);
  // Fallback: generate range directly
  return Array.from({length: maxIdx + 1}, (_,i) => i);
}


/* probabilities */

async function loadProbabilities(){ try{ const r=await fetch(PROB_URL,{cache:'no-store'}); if(r.ok){ PROB_DATA=await r.json(); $('#rarityStatus').textContent='Theoretical weights loaded'; } }catch{} }

/* stats + ranks */
async function buildStatsAndRanks(){
  // Build into temp objects so TRAIT_DOMAIN stays readable during loading
  const _freq={}, _domain={};
  let _max=0;
  for(const idx of indices()){
    const ch=await ensureChunk(idx);
    for(const [sid,row] of Object.entries(ch)){
      const n=getTraitCount(row); if(n>_max) _max=n;
      for(const [k,v] of keepEntries(row.traits)){ (_domain[k] ||= new Set()).add(v); (_freq[k] ||= {})[v]=(_freq[k][v]||0)+1; }
    }
  }
  // Swap atomically when complete — TRAIT_DOMAIN never goes empty mid-load
  TRAIT_FREQ=_freq; TRAIT_DOMAIN=_domain; MAX_TRAIT_COUNT=_max;
  const obs=[];
  for(const idx of indices()){
    const ch=await ensureChunk(idx);
    for(const [sid,row] of Object.entries(ch)){
      let s=0; for(const [k,v] of keepEntries(row.traits)){ const c=(TRAIT_FREQ[k]?.[v])||1; const p=c/(TOKEN_COUNT||1); s += -Math.log(Math.max(p,1e-12)); }
      obs.push([+sid,s]);
    }
  }
  obs.sort((a,b)=>b[1]-a[1]); RARITY_OBS_RANK=new Map(obs.map(([id,_],i)=>[id,i+1]));
  if(PROB_DATA){
    function pTheo(g,n){ const blk=PROB_DATA[g]; const w=blk?blk[n]:undefined; if(typeof w==='number'){ const scale=PROB_DATA._scale||10000; return Math.max(1e-12,w/scale);} const c=(TRAIT_FREQ[g]?.[n])||1; return Math.max(1e-12,c/(TOKEN_COUNT||1)); }
    const theo=[];
    for(const idx of indices()){
      const ch=await ensureChunk(idx);
      for(const [sid,row] of Object.entries(ch)){ let p=1; for(const [k,v] of keepEntries(row.traits)) p*=pTheo(k,v); theo.push([+sid,p]); }
    }
    theo.sort((a,b)=>a[1]-b[1]); RARITY_THEO_RANK=new Map(theo.map(([id,_],i)=>[id,i+1]));
  }
}

/* filters */
function passesRankFilter(id){ const map=(RARITY_MODE==='theoretical' && RARITY_THEO_RANK.size)?RARITY_THEO_RANK:RARITY_OBS_RANK; const r=map.get(id); if(!r) return false; if(rankMin!=null && r<rankMin) return false; if(rankMax!=null && r>rankMax) return false; return true; }
function rowMatchesActiveTraitsOnly(row){ for(const [name,set] of activeTraits){ const v=row.traits?.[name]; if(!set.has(String(v))) return false; } return true; }
function rowMatchesAll(row,id){ if(currentTraitCount!=null && getTraitCount(row)!==currentTraitCount) return false; if(!passesRankFilter(id)) return false; return rowMatchesActiveTraitsOnly(row); }
let tokenTraitSearchQuery = '';
function normalizeTokenTraitSearchText(value){
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function tokenTraitSearchTerms(){
  const q = normalizeTokenTraitSearchText(tokenTraitSearchQuery);
  return q ? q.split(/\s+/).filter(Boolean) : [];
}
function tokenTraitSearchTextForRow(row){
  const parts = [];
  for(const [k,v] of keepEntries(row?.traits || {})){
    const name = traitDisplayLabel(k);
    parts.push(k, name, v, `${k} ${v}`, `${name} ${v}`);
  }
  return normalizeTokenTraitSearchText(parts.join(' '));
}
function rowMatchesTokenTraitSearch(row){
  const terms = tokenTraitSearchTerms();
  if(!terms.length) return true;
  const haystack = tokenTraitSearchTextForRow(row);
  return terms.every(term => haystack.includes(term));
}
function updateTokenTraitSearchStatus(count){
  const input = document.getElementById('tokenTraitSearch');
  const status = document.getElementById('tokenTraitSearchStatus');
  const clearBtn = document.getElementById('tokenTraitSearchClear');
  const q = input ? input.value.trim() : tokenTraitSearchQuery.trim();
  if(clearBtn) clearBtn.style.display = q ? 'inline-flex' : 'none';
  if(!status) return;
  status.textContent = q ? (count == null ? `Search: ${q}` : `Search: ${q} · ${fmt(count)} matches`) : '';
}
async function applyTokenTraitSearchToIds(ids){
  if(!tokenTraitSearchTerms().length) return ids;
  const out = [];
  for(const id of ids){
    const row = await fetchRow(id);
    if(rowMatchesTokenTraitSearch(row)) out.push(id);
  }
  return out;
}
function clearTokenTraitSearch(){
  tokenTraitSearchQuery = '';
  const input = document.getElementById('tokenTraitSearch');
  if(input) input.value = '';
  updateTokenTraitSearchStatus(0);
  if(typeof renderTokenGridFromState === 'function') renderTokenGridFromState();
}
function tokenIdSearchValue(){
  const input = document.getElementById('jump');
  return String(input?.value || '').replace(/\D+/g, '');
}
function applyTokenIdSearchToIds(ids, opts){
  const q = tokenIdSearchValue();
  if(!q) return ids;
  const exact = !!window.__TOKEN_ID_EXACT_SEARCH__ || !!(opts && opts.exact) || q.length >= 4;
  if(exact){
    const n = Number(q);
    return Number.isFinite(n) ? ids.filter(id => Number(id) === n) : [];
  }
  const out = [];
  for(const id of ids){
    if(String(id).startsWith(q)){
      out.push(id);
      if(out.length >= 50) break;
    }
  }
  return out;
}
async function fetchRow(id){ if(ROW_CACHE.has(id)) return ROW_CACHE.get(id); const idx=chunkIndexFor(id); const ch=await ensureChunk(idx); const row=ch[String(id)]||{traits:{}}; ROW_CACHE.set(id,row); return row; }

/* recompute */
async function computeFilteredState(){ const buckets={}, idByCount={}, avail={}; for(const idx of indices()){ const ch=await ensureChunk(idx); for(const [sid,row] of Object.entries(ch)){ const id=+sid; if(!passesRankFilter(id)) continue; if(!rowMatchesActiveTraitsOnly(row)) continue; const n=getTraitCount(row); buckets[n]=(buckets[n]||0)+1; (idByCount[n] ||= []).push(id); for(const [k,v] of keepEntries(row.traits)){ (avail[k] ||= new Map()).set(v, ((avail[k].get(v)||0)+1)); } } } return {buckets, idByCount, avail}; }
function updateTraitFloor(){
  const bar = document.getElementById('traitFloorBar');
  if(!bar) return;
  // Only show when traits are active AND listings are loaded
  const hasTraits = activeTraits && activeTraits.size > 0;
  const hasListings = window.LISTINGS && Object.keys(window.LISTINGS).length > 0;
  if(!hasTraits || !hasListings){ bar.style.display = 'none'; return; }

  // Find all listed tokens that match current trait filter
  const listedMatching = [];
  for(const [idStr, data] of Object.entries(window.LISTINGS)){
    const id = +idStr;
    const price = data?.opensea?.price_eth;
    if(price == null) continue;
    // Check if token matches active traits
    const row = ROW_CACHE.get(id);
    if(!row) continue; // not loaded yet
    if(!rowMatchesActiveTraitsOnly(row)) continue;
    listedMatching.push({id, price});
  }

  if(!listedMatching.length){ bar.style.display = 'none'; return; }

  // Sort by price ascending — floor is cheapest
  listedMatching.sort((a,b) => a.price - b.price);
  const floor = listedMatching[0];
  const rank = RARITY_OBS_RANK.get(floor.id);

  // Build trait label from active traits
  const traitLabel = [...activeTraits.entries()].map(([g,s])=>[...s].map(v=>`${g}: ${v}`).join(', ')).join(' + ');
  const labelEl = document.getElementById('traitFloorLabel');
  if(labelEl) labelEl.textContent = traitLabel ? `[${traitLabel}]` : '';
  document.getElementById('traitFloorPrice').textContent = `Ξ ${floor.price.toFixed(4)} ETH`;
  document.getElementById('traitFloorToken').textContent = `#${floor.id}${rank ? ' · Rank '+rank.toLocaleString() : ''}`;
  document.getElementById('traitFloorCount').textContent = `${listedMatching.length} listed with this trait`;
  bar.style.display = 'flex';

  // Make it clickable to open that token
  bar.onclick = () => openModal(floor.id);
  bar.style.cursor = 'pointer';
}

function _applyHoldersTraitFilter(){
  const holdersPanel = document.getElementById('ttab-holders');
  if(!holdersPanel || !holdersPanel.classList.contains('active')) return;
  if(!window._holdersLoaded || !window._holdersData) return;
  const traits = typeof activeTraits !== 'undefined' ? activeTraits : new Map();
  if(traits.size > 0) renderHoldersByTrait();
  else {
    renderHolders(); // clears chips and shows unfiltered top 100
  }
}

async function updateChartAndList(){ const {buckets, idByCount, avail}=await computeFilteredState(); CHART_ID_MAP=idByCount; AVAILABLE_DOMAIN=avail; drawOrUpdateChart(buckets); renderTraitChips(buckets); await renderTokenGridFromState(); renderTraitAccordion($('#traitSearch').value); renderActiveChips(); if(typeof window.renderSalesForCurrentTraits==='function') window.renderSalesForCurrentTraits(); if(typeof updateTraitFloor==='function') updateTraitFloor(); _applyHoldersTraitFilter(); }

/* grid */
function gridThumbHtml(id,row){
  const mapVal=IMAGES_MAP && IMAGES_MAP.get(id);
  // row.image (live, from /db/all-traits) takes priority over the static
  // original-mint chunk image. Only burn survivors ever have row.image set,
  // so for the ~99% of tokens that never burned this falls through to mapVal
  // exactly as before. Previously mapVal was checked first, which meant a
  // survivor's current appearance wouldn't show until refreshLiveTokenData's
  // periodic pass (30s after load, then every 5min) caught up and overwrote
  // IMAGES_MAP — a real, if temporary, staleness window on every fresh load.
  const src=row.image || mapVal || imgForId(id);
  if(!src) return '<div class="thumb"></div>';
  const s=String(src).trim();

  // Inline SVG: render as an isolated image instead of injecting raw SVG into the DOM.
  // This preserves the token's own internal background/colors and avoids page CSS
  // accidentally overriding SVG presentation when inserted inline.
  if(s.startsWith('<svg')){
    try{
      const svgDataUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
      return `<div class="thumb"><img loading="lazy" src="${svgDataUri}" alt="#${id}" style="width:100%;height:100%;image-rendering:pixelated;display:block;object-fit:contain;"></div>`;
    }catch(e){
      return `<div class="thumb"><div class="svg-wrap">${s}</div></div>`;
    }
  }

  // SVG data URI: keep it isolated as an <img> so SVG internals render intact.
  if(/^data:image\/svg\+xml/i.test(s)){
    return `<div class="thumb"><img loading="lazy" src="${s}" alt="#${id}" style="width:100%;height:100%;image-rendering:pixelated;display:block;object-fit:contain;"></div>`;
  }

  if(/^data:image\//i.test(s)) return `<div class="thumb"><img loading="lazy" src="${s}" alt="#${id}"></div>`;
  return `<div class="thumb"><img src="${ipfsToHttp(s)}" loading="lazy" alt="#${id}"></div>`;
}
function traitsMiniHtml(row){ return ''; }
function priceBadgeHtml(id){ const ent=(window.LISTINGS&&window.LISTINGS[id]&&window.LISTINGS[id].opensea)||null; if(!ent || ent.price_eth==null) return ''; const txt = formatEth(ent.price_eth); if(!txt) return ''; const inner = `<span style="color:var(--muted);font-weight:500">OpenSea </span><span style="color:#2dd4bf;font-weight:700">${txt}</span><span style="color:var(--muted);opacity:.6"> • live</span>`; return ent.url ? `<a class="chip" href="${ent.url}" target="_blank" rel="noopener" style="border-color:#354;background:#0d261c;text-decoration:none">${inner}</a>` : `<span class="chip" style="border-color:#354;background:#0d261c">${inner}</span>`; }
function rankTier(rank){
  const r=parseInt(rank,10);
  if(r<=100) return 'gold';
  if(r<=1000) return 'blue';
  if(r<=5000) return 'purple';
  return '';
}
function rankColor(rank){
  const r = parseInt(rank, 10);
  if(!r) return '#e6edf7';
  if(r <= 100)  return '#FFD700'; // gold
  if(r <= 1000) return '#d8b4fe'; // purple
  if(r <= 5000) return '#60a5fa'; // blue
  return '#e6edf7';               // white
}
// Badge html for a token — uses active rank system
function _updateRankLabels(sys){
  sys = sys || getRankSystem();
  const label = document.getElementById('rankSystemLabel');
  if(label) label.textContent = sys === 'os' ? '◆ OS' : '▲ TV';
  const icon   = document.getElementById('rankSystemIconMobile');
  const labelM = document.getElementById('rankSystemLabelMobile');
  if(icon)   icon.textContent  = sys === 'os' ? '◆' : '▲';
  if(labelM) labelM.textContent = sys === 'os' ? 'OS' : 'TV';
}
function toggleRankSystem(){
  const next = getRankSystem() === 'os' ? 'tv' : 'os';
  setRankSystem(next);
  _updateRankLabels(next);
  if(typeof renderTokenGridFromState === 'function') renderTokenGridFromState();
  else if(window.LAST_IDS && window.LAST_IDS.length) renderTokenGrid(window.LAST_IDS);
}
document.addEventListener('DOMContentLoaded', () => { _updateRankLabels(); });

function rankBadgeHtml(id){
  const sys = getRankSystem();
  const rank = sys === 'tv' ? (RARITY_OBS_RANK.get(+id)||null) : (OS_RANK_MAP.get(+id)||null);
  if(!rank) return '';
  return rankDiamondHtml(rank, '', sys);
}
async function renderTokenGrid(ids, opts){
  // Filter out burned tokens if we have the burned ID set
  if (window._BURNED_IDS && window._BURNED_IDS.size > 0) {
    ids = ids.filter(id => !window._BURNED_IDS.has(id));
  }
  const preserveOrder = !!(opts && opts.preserveOrder);
  window.LAST_IDS = Array.isArray(ids) ? ids.slice() : [];
  const onlyListed = document.getElementById('onlyListed').checked;
  const tg=$('#tokenGrid'); tg.innerHTML='';
  const isMobile = window.innerWidth <= 900;
  const currentViewMode = tg.classList.contains('list') ? 'list' : (tg.classList.contains('compact') ? 'compact' : (tg.classList.contains('view-5x5') ? 'grid5' : 'grid'));
  /* progressive paint */
  const BATCH=180; let i=0; applyViewMode(localStorage.getItem(VIEW_KEY)||document.getElementById('viewMode')?.value||'standard');
  if(onlyListed){
    await fetchLiveForIds(ids);
    ids = ids.filter(id => window.LISTINGS[id] && window.LISTINGS[id].opensea && window.LISTINGS[id].opensea.price_eth != null);
    if(!LIVE_OK){ $('#listingsStatus').textContent='Live fetch failed; showing none.'; }
    // Keep the user's selected sort even when Live Listings is enabled
    if(!preserveOrder) sortTokenIds(ids);
    // Also build mispriced panel
    buildMispricedPanel(ids);
    // If mispriced tab is active, re-build immediately after listings load
    const activeTab = document.querySelector('.top-tab.active');
    if(activeTab && activeTab.dataset.ttab === 'mispriced'){
      buildMispricedPanel(ids);
    }
  } else {
    if(!preserveOrder) sortTokenIds(ids);
    // Restore sort dropdown if we had auto-switched it
    const sel = document.getElementById('sortMode');
    const stored = localStorage.getItem(SORT_KEY) || 'id-asc';
    if(sel && sel.value !== stored) sel.value = stored;
    // Clear mispriced panel when listings off
    const mp = document.getElementById('mispricedGrid');
    if(mp){ mp.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:10px 0">Toggle "Only show listed" to see mispriced listings.</div>'; }
    const mpb = document.getElementById('mispricedCountBadge');
    if(mpb) mpb.textContent = '–';
  }
  updateTokenTraitSearchStatus(ids.length);
  if(!ids.length){ tg.appendChild(el('div',null,'No matches.')); return;}

  // ── Virtual scroller: mobile + desktop ───────────────────────────────────
  {
    const mode = currentViewMode;
    const shouldVirtualize = isMobile;
    if(shouldVirtualize){
      await VS.init(ids, mode);
      return;
    }else{
      VS.enabled = false;
      tg.classList.remove('vs-active');
      tg.onscroll = null;
    }
  }

  const __GRID_BATCH = window.innerWidth > 900 ? 72 : 150;
  for(let i=0;i<ids.length;i+=__GRID_BATCH){
    const sliceIds = ids.slice(i, i+__GRID_BATCH);
    const rows = await Promise.all(sliceIds.map(id=>fetchRow(id)));
    const frag=document.createDocumentFragment();
    for(let k=0;k<sliceIds.length;k++){
      const id=sliceIds[k]; const row=rows[k];
    const d=document.createElement('div');
    d.className='token';
    if(connectedWalletOwns(id)) d.classList.add('owned-token');
    const obsRank=RARITY_OBS_RANK.get(id); const theoRank=RARITY_THEO_RANK.get(id);
    const theoVal = (RARITY_MODE==='theoretical' && RARITY_THEO_RANK.size) ? (theoRank||'') : (obsRank||'');
    const osRankVal = OS_RANK_MAP.get(id) || null;
    const rankVal = getRankSystem() === 'tv' ? theoVal : (osRankVal || theoVal);
    const rankSys = getRankSystem() === 'tv' ? 'tv' : (osRankVal ? 'os' : 'tv');
    const rankBadge = rankVal ? `<span class=\"chip\">${rankDiamondHtml(rankVal,'',rankSys)}</span>` : '';
    if (rankVal){ d.dataset.rank = String(rankVal); d.dataset.rankSys = rankSys; const t=rankTier(rankVal); if(t) d.dataset.rankTier=t; }
    if (osRankVal) d.dataset.osRank = String(osRankVal);
    d.dataset.id = String(id);
const osCardUrl=`https://opensea.io/assets/ethereum/${LIVE_CONTRACT}/${id}`;
d.innerHTML=`<div class="pinbar"><button type="button" class="favbtn ${isFavorite(id)?'active':''}" data-fav-id="${id}" title="${isFavorite(id)?'Remove favorite':'Add favorite'}" aria-pressed="${isFavorite(id)?'true':'false'}"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 17.3l-6.18 3.73 1.64-7.03L2 9.24l7.19-.61L12 2l2.81 6.63 7.19.61-5.46 4.76 1.64 7.03z"/></svg></button><button type="button" class="pinbtn" data-act="A" title="Pin to A">A</button><button type="button" class="pinbtn" data-act="B" title="Pin to B">B</button><button type="button" class="pinbtn" data-act="+" title="Add to pinned">＋</button></div>
      ${gridThumbHtml(id,row)}
      ${connectedWalletOwns(id) ? '<span class="owned-badge">Owned</span>' : ''}
      <div class="tmeta">
        <div class="idline">#${id} ${rankBadge} ${priceBadgeHtml(id)} <a href="${osCardUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="View on OpenSea" style="margin-left:auto;opacity:.6;line-height:1;display:inline-flex;align-items:center"><img src="https://opensea.io/static/images/logos/opensea-logo.svg" style="width:13px;height:13px;border-radius:3px"></a></div>
        ${tg.classList.contains('list') ? listStatsRowHtml(id, rankVal, getListingEth(id) != null ? (getListingEth(id) >= 1 ? getListingEth(id).toFixed(3) : getListingEth(id).toFixed(4)) : null) : traitsMiniHtml(row)}
      </div>`;
    d.addEventListener('click', async (e)=>{ if(e.target.closest('.pinbtn')) return; await openModal(id); });
    d.querySelector('.pinbar').addEventListener('click',(ev)=>{ const fav = ev.target.closest('[data-fav-id]'); if(fav){ ev.stopPropagation(); ev.preventDefault(); toggleFavorite(id); return; } const b=ev.target.closest('.pinbtn'); if(!b) return; ev.stopPropagation(); ev.preventDefault(); b.classList.add('flash'); setTimeout(()=>b.classList.remove('flash'), 220); const act=b.getAttribute('data-act'); if(act==='A') setCompare('A',id); else if(act==='B') setCompare('B',id); else pinAdd(id); });
    // Prevent stats row swipe from opening modal
    const statsRow = d.querySelector('.vs-datarow');
    if(statsRow){
      let _swipeStartX=0, _swipeStartY=0, _didSwipe=false;
      statsRow.addEventListener('touchstart',(e)=>{ _swipeStartX=e.touches[0].clientX; _swipeStartY=e.touches[0].clientY; _didSwipe=false; },{passive:true});
      statsRow.addEventListener('touchmove',(e)=>{ const dx=Math.abs(e.touches[0].clientX-_swipeStartX); const dy=Math.abs(e.touches[0].clientY-_swipeStartY); if(dx>dy&&dx>6) _didSwipe=true; },{passive:true});
      statsRow.addEventListener('click',(e)=>{ if(_didSwipe){ e.stopPropagation(); } });
    }
    frag.appendChild(d);
      }
    tg.appendChild(frag);
    // Don't stamp per-batch — too slow on mobile. Stamp once after all batches.
    await new Promise(requestAnimationFrame);
  }
  // Hydrate async list-row meta after render
  if(tg.classList.contains('list')){
    tg.querySelectorAll('[data-last-sale-id]').forEach(el => hydrateListMetaForId(+el.dataset.lastSaleId));
    if(typeof hydrateListOwners==='function') hydrateListOwners(tg);
  }
  attachPreviewHandlers();
  syncFavoriteButtons();
  // Queue image refresh for visible listed tokens
  if(typeof _queueImgRefresh === 'function' && window.LISTINGS){
    const visibleListed = [...document.querySelectorAll('#tokenGrid [data-id]')]
      .map(el => +el.dataset.id)
      .filter(id => window.LISTINGS[id]?.opensea?.price_eth != null)
      .slice(0, 20);
    if(visibleListed.length) _queueImgRefresh(visibleListed);
  }
  // Re-apply the active grid view AFTER cards are rendered.
  // Important: listing data can load before the first grid render. In grid/2x2/5x5
  // views the normal .tmeta line is hidden, so price badges must be stamped as
  // overlay badges after the token DOM exists. Otherwise prices only appear after
  // switching views.
  if(window.innerWidth > 900){
    const _vm = localStorage.getItem('viewMode') || document.getElementById('viewMode')?.value || 'standard';
    if(_vm !== 'list' && typeof applyViewMode === 'function') applyViewMode(_vm);
  }
  // Mobile rendering is handled by VS (virtual scroller) above
  // Desktop-only: overlay price badges are stamped by applyViewMode() above.
  // schedule chunks

}
async function renderTokenGridFromState(){
  if(currentTraitCount!=null && CHART_ID_MAP[currentTraitCount]){
    let ids = [...CHART_ID_MAP[currentTraitCount]];
    if(favoritesOnlyEnabled()) ids = ids.filter(id => isFavorite(id));
    ids = applyConnectedOwnedFilter(ids);
    ids = await applyTokenTraitSearchToIds(ids);
    ids = applyTokenIdSearchToIds(ids);
    await renderTokenGrid(ids);
    return;
  }

  // Mobile fast path: if no filters active and ranks loaded, build IDs from RARITY_OBS_RANK
  // This avoids waiting for chunks and renders the grid immediately
  const hasTraits = activeTraits && activeTraits.size > 0;
  const hasRank   = rankMin != null || rankMax != null;
  const isMobile  = window.innerWidth <= 900;
  if(isMobile && !hasTraits && !hasRank && RARITY_OBS_RANK.size > 0){
    const baseRankMap = getRankSystem() === 'os' && OS_RANK_MAP.size ? OS_RANK_MAP : getActiveRankMap();
    let ids = [...baseRankMap.keys()].map(Number).filter(Boolean);
    if(favoritesOnlyEnabled()) ids = ids.filter(id => isFavorite(id));
    ids = applyConnectedOwnedFilter(ids);
    ids = await applyTokenTraitSearchToIds(ids);
    ids = applyTokenIdSearchToIds(ids);
    await renderTokenGrid(ids);
    return;
  }

  const ids=[];
  for(const idx of indices()){
    const ch=await ensureChunk(idx);
    for(const [sid,row] of Object.entries(ch)){
      const id=+sid;
      if(rowMatchesAll(row,id)) ids.push(id);
    }
  }
  let finalIds = favoritesOnlyEnabled() ? ids.filter(id => isFavorite(id)) : ids;
  finalIds = applyConnectedOwnedFilter(finalIds);
  finalIds = await applyTokenTraitSearchToIds(finalIds);
  finalIds = applyTokenIdSearchToIds(finalIds);
  await renderTokenGrid(finalIds);
}

/* chart helpers moved to js/chart.js */

/* traits UI */
function renderActiveChips(){ const host=$('#activeChips'); host.innerHTML=''; const entries=[...activeTraits.entries()].flatMap(([g,s])=>[...s].map(v=>({group:g,value:String(v)}))); if(entries.length===0){ host.innerHTML='<span class="section" style="opacity:.8">No traits selected</span>'; return;} for(const {group,value} of entries){ const chip=el('div','chip',`<b>${group}</b>: ${value} &nbsp;×`); chip.title='Remove this filter'; chip.onclick=async()=>{ const s=activeTraits.get(group); if(!s) return; s.delete(value); if(s.size===0) activeTraits.delete(group); await updateChartAndList(); }; host.appendChild(chip);} }
function renderTraitChips(b){ const host=$('#traitChips'); host.innerHTML=''; const maxSeen=Math.max(16,...Object.keys(b).map(Number)); for(let c=1;c<=maxSeen;c++){ const count=b[c]||0; const chip=el('div','chip',`Traits: <b>${c}</b> <span style="color:var(--muted)">(${fmt(count)})</span>`); chip.dataset.count=String(c); chip.classList.toggle('active',currentTraitCount===c); chip.addEventListener('click', async ()=>{ currentTraitCount=(currentTraitCount===c?null:c); document.querySelectorAll('#traitChips .chip').forEach(n=>n.classList.toggle('active',Number(n.dataset.count)===currentTraitCount)); await renderTokenGridFromState(); const cols2=colorsFor(LAST_XS); Plotly.restyle('chartHost', {'marker.color':[cols2.fill], 'marker.line.color':[cols2.line]}, [0]); }); host.appendChild(chip);}}
function renderTraitAccordion(q=''){ q=(q||'').trim().toLowerCase(); const acc=$('#accTraits'); acc.innerHTML=''; const onlyPresent=$('#onlyPresent').checked; const names=Object.keys(TRAIT_DOMAIN).sort(); for(const name of names){ const groupMatch=!q||name.toLowerCase().includes(q); let values=[...TRAIT_DOMAIN[name]]; if(onlyPresent && AVAILABLE_DOMAIN && AVAILABLE_DOMAIN[name]){ const m=AVAILABLE_DOMAIN[name]; values=values.filter(v=>m.has(v)); } if(q && !groupMatch){ values=values.filter(v=>String(v).toLowerCase().includes(q)); } if(values.length===0 && !groupMatch) continue; values.sort((a,b)=>{ const an=String(a).toLowerCase()==='none'?1:0; const bn=String(b).toLowerCase()==='none'?1:0; if(an!==bn) return an-bn; return String(a).localeCompare(String(b),undefined,{numeric:true}); }); const item=document.createElement('div'); item.className='acc-item'; if(OPEN_GROUPS.has(name)) item.classList.add('open'); const head=document.createElement('div'); head.className='acc-head'; head.innerHTML=`<h4>${name}</h4><span class="section">${values.length} values</span>`; head.onclick=()=>{ item.classList.toggle('open'); if(item.classList.contains('open')) OPEN_GROUPS.add(name); else OPEN_GROUPS.delete(name); }; const body=document.createElement('div'); body.className='acc-body'; const list=document.createElement('div'); list.className='checklist'; for(const v of values){ const id=`ck_${name}_${String(v).replace(/[^a-z0-9]+/gi,'_')}`; const row=document.createElement('label'); row.className='check'; 
      let __count = null;
      if (AVAILABLE_DOMAIN && AVAILABLE_DOMAIN[name] instanceof Map && AVAILABLE_DOMAIN[name].has(v)) {
        __count = AVAILABLE_DOMAIN[name].get(v);
      } else if (typeof TRAIT_FREQ === 'object' && TRAIT_FREQ[name] && TRAIT_FREQ[name][v]) {
        __count = TRAIT_FREQ[name][v];
      }
      const __total = TOKEN_COUNT || (MANIFEST && (MANIFEST.tokenCount || (MANIFEST.files?.at(-1)?.end))) || 10000;
      const __pct = (__count && __total) ? ((__count/__total)*100) : null;
      const __pctTxt = __pct!=null ? `<i class="trait-pct" style="opacity:.75;font-style:normal;font-size:12px;flex-shrink:0;margin-left:auto;padding-left:8px">${__pct < 0.1 ? __pct.toFixed(3) : __pct.toFixed(2)}%</i>` : '';
      row.innerHTML=`<input type="checkbox" id="${id}"><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${v}</span>${__pctTxt}`; const cur=activeTraits.get(name); if(cur && cur.has(v)) row.querySelector('input').checked=true; row.querySelector('input').addEventListener('change', async (e)=>{ const set=activeTraits.get(name)||new Set(); if(e.target.checked) set.add(v); else set.delete(v); set.size?activeTraits.set(name,set):activeTraits.delete(name); OPEN_GROUPS.add(name); await updateChartAndList(); }); list.appendChild(row);} body.appendChild(list); item.appendChild(head); item.appendChild(body); acc.appendChild(item);}}

/* tooltip helpers moved to js/tooltip.js */

/* modal */
function survivorChipHtml(id){
  const n = Number(id);
  const count = SURVIVOR_COUNT_MAP.get(n);
  if(!count || count < 1) return '';
  const label = count > 1 ? `Survivor x${count}` : 'Survivor';
  return `<span class="chip survivor-chip">${label}</span>`;
}

// ── Burn history timeline (modal pre-burn toggle) ────────────────────────────
const _burnHistoryCache = new Map();
async function fetchTokenBurnHistory(id){
  const key = +id;
  if(_burnHistoryCache.has(key)) return _burnHistoryCache.get(key);
  try{
    const data = await dbFetch(`/db/token/${key}/burn-history`);
    _burnHistoryCache.set(key, data);
    return data;
  }catch(e){
    return null;
  }
}

function _applyBurnHistoryEntry(entry){
  const imgBox = document.getElementById('mImg');
  if(imgBox && entry.image){
    const s = String(entry.image).trim();
    if(s.startsWith('<svg')) imgBox.innerHTML = `<div class="svg-wrap" style="width:100%;height:100%">${s}</div>`;
    else if(/^data:image\//i.test(s)) imgBox.innerHTML = `<img src="${s}" alt="#${entry.token_id||''}">`;
    else imgBox.innerHTML = `<img src="${ipfsToHttp(s)}" alt="#${entry.token_id||''}">`;
  }
  if(entry.traits){
    const kv = keepEntries(entry.traits);
    const mTraits = document.getElementById('mTraits');
    if(mTraits) mTraits.innerHTML = kv.length ? kv.map(([k,v])=>`<div><span>${traitDisplayLabel(k)}</span><b>${v}</b></div>`).join('') : '<div style="color:var(--muted)">No traits</div>';
  }
}

function renderBurnHistoryToggle(container, entries, activePosition){
  if(!container) return;
  if(!Array.isArray(entries) || entries.length <= 1){
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }
  const idx = Math.max(0, entries.findIndex(e => e.position === activePosition));
  const entry = entries[idx];
  const isMint = entry.position === 0;
  const badge = isMint ? '' : `<span class="chip survivor-chip" style="padding:2px 8px;font-size:11px">Survivor</span>`;
  container.style.display = 'flex';
  container.innerHTML = `
    <button type="button" class="burn-hist-nav" ${idx<=0?'disabled':''} onclick="_navBurnHistory(-1)" aria-label="Earlier">‹</button>
    <span class="burn-hist-label">${burnsEsc(entry.label)}${badge}</span>
    <button type="button" class="burn-hist-nav" ${idx>=entries.length-1?'disabled':''} onclick="_navBurnHistory(1)" aria-label="Later">›</button>
  `;
}

function _navBurnHistory(delta){
  const h = window._modalBurnHistory;
  if(!h) return;
  const next = h.index + delta;
  if(next < 0 || next >= h.entries.length) return;
  h.index = next;
  _applyBurnHistoryEntry(h.entries[next]);
  renderBurnHistoryToggle(document.getElementById('mBurnHistoryToggle'), h.entries, h.entries[next].position);
}

if(!('documentPictureInPicture' in window)){
  document.querySelectorAll('.popout-btn').forEach(btn => btn.style.display = 'none');
}

// ── Pop Out Window (Document Picture-in-Picture) ────────────────────────────
// Desktop Chrome/Edge (and recent Firefox) only -- Safari (desktop and iOS)
// and all mobile browsers don't support this API at all. Opens a genuinely
// live, independent instance of the site (own JS, own refresh/polling --
// not a snapshot, not a portal into the main window's state) sized narrow
// enough that the site's own existing mobile-responsive layout kicks in,
// giving access to everything (Analytics, grid, wallet, holders) through
// its own bottom nav rather than needing any separate scoped view.
async function openPopOutWindow(){
  if(!('documentPictureInPicture' in window)){
    alert('Pop Out Window needs desktop Chrome, Edge, or Firefox — it isn\'t available in Safari or on mobile.');
    return;
  }
  try{
    const pipWindow = await documentPictureInPicture.requestWindow({
      width: 420,
      height: 760,
    });
    pipWindow.document.title = 'TraitView';
    const style = pipWindow.document.createElement('style');
    style.textContent = `
      html,body{margin:0;padding:0;height:100%;background:#0e1218;font-family:'Space Grotesk',system-ui,sans-serif;overflow:hidden}
      #pipBar{height:22px;display:flex;align-items:center;justify-content:flex-end;padding:0 6px;box-sizing:border-box;background:#0e1218;gap:6px}
      #pipBar:not(.minimized){border-bottom:1px solid rgba(255,255,255,.08)}
      #pipBar.minimized{cursor:pointer;justify-content:center;height:100%}
      #pipFloorValue{display:none;color:#1CFFAF;font-size:13px;font-weight:800;white-space:nowrap}
      #pipBar.minimized #pipFloorValue{display:inline}
      #pipMinIcon{width:16px;height:16px;border-radius:5px;border:1px solid rgba(255,255,255,.15);color:#5a6578;font-size:10px;line-height:14px;text-align:center;flex:0 0 auto}
      #pipBar:hover #pipMinIcon{color:#e6edf7;border-color:rgba(255,255,255,.32)}
      #pipBar.minimized #pipMinIcon{display:none}
      #pipContent{height:calc(100% - 22px);width:100%}
      #pipContent.hidden{display:none}
      #pipContent iframe{display:block;width:100%;height:100%;border:0}
    `;
    pipWindow.document.head.appendChild(style);

    // A dedicated top strip the loaded page can never overlap or sit under --
    // avoids fighting with wherever the site's own header controls happen to
    // be, rather than floating a button on top of page content and hoping
    // nothing collides with it. Only one click handler total (on the bar
    // itself, toggling based on current state) -- a previous version had a
    // separate listener on the minimize button too, and since it's a child
    // of the bar, a click on it fired both handlers in the same event via
    // bubbling: minimize, then immediately un-minimize because the bar's
    // handler saw the class the button's handler had just added. Only ever
    // having one handler make one decision removes that whole class of bug.
    const bar = pipWindow.document.createElement('div');
    bar.id = 'pipBar';
    bar.innerHTML = `<span id="pipFloorValue">—</span><span id="pipMinIcon" title="Minimize to a floor-price bar">—</span>`;
    pipWindow.document.body.appendChild(bar);

    const PAGE_URL = location.href;
    const content = pipWindow.document.createElement('div');
    content.id = 'pipContent';
    const iframe = pipWindow.document.createElement('iframe');
    iframe.src = PAGE_URL;
    content.appendChild(iframe);
    pipWindow.document.body.appendChild(content);

    const floorEl = pipWindow.document.getElementById('pipFloorValue');
    const FULL_W = 420, FULL_H = 760;
    const MINI_W = 130, MINI_H = 22;
    let floorInterval = null;
    const tick = () => {
      const v = window._lastFloorEth;
      floorEl.textContent = (typeof v === 'number' && !isNaN(v)) ? `${v} ETH` : '—';
    };
    // resizeTo/resizeBy on a Document Picture-in-Picture window require a
    // genuine user gesture originating INSIDE that window -- a click
    // handler attached here (in the main page's script) but firing on an
    // element that lives in pipWindow's own document still counts, since
    // the actual click event happens in that window's context.
    bar.addEventListener('click', () => {
      const minimizing = !bar.classList.contains('minimized');
      if(minimizing){
        // Actually blank the iframe's src rather than just hiding it with
        // CSS -- a previous version only did display:none on the wrapper,
        // and the site's own fixed-position mobile bottom bar somehow
        // still rendered through in a real test. Removing the src entirely
        // guarantees there's nothing left to possibly bleed through,
        // regardless of how any fixed-position element inside might
        // otherwise behave.
        iframe.src = 'about:blank';
        content.classList.add('hidden');
        bar.classList.add('minimized');
        try{ pipWindow.resizeTo(MINI_W, MINI_H); }catch(e){}
        tick();
        floorInterval = setInterval(tick, 5000);
      } else {
        clearInterval(floorInterval);
        bar.classList.remove('minimized');
        content.classList.remove('hidden');
        if(iframe.src === 'about:blank') iframe.src = PAGE_URL;
        try{ pipWindow.resizeTo(FULL_W, FULL_H); }catch(e){}
      }
    });

    const ro = new ResizeObserver(() => {
      clearTimeout(pipWindow.__resizeFwdTimer);
      pipWindow.__resizeFwdTimer = setTimeout(() => {
        try{ iframe.contentWindow?.dispatchEvent(new Event('resize')); }catch(e){}
      }, 120);
    });
    ro.observe(pipWindow.document.body);
    pipWindow.addEventListener('pagehide', () => { ro.disconnect(); clearInterval(floorInterval); });
  }catch(e){
    console.error('Pop Out Window failed:', e);
  }
}

// ── Header burn ticker ───────────────────────────────────────────────────────
function burnTickerItemHtml(id){
  const src = `${RAILWAY_API}/render/burned-snapshot/${id}?key=${encodeURIComponent(RAILWAY_KEY)}`;
  return `<span class="burn-ticker-item" onclick="if(typeof openModal==='function') openModal(${id})">
    <img src="${src}" alt="#${id}" loading="lazy">
    <span>#${id}</span>
  </span>`;
}
async function loadBurnTicker(){
  const host = document.getElementById('burnTicker');
  const track = document.getElementById('burnTickerTrack');
  if(!host || !track) return;
  try{
    const data = await dbFetch('/db/burned-ticker');
    const ids = Array.isArray(data?.token_ids) ? data.token_ids.filter(id => Number.isFinite(+id)) : [];
    if(!ids.length){ host.style.display = 'none'; return; }
    // Render the list twice back-to-back -- the CSS animation scrolls
    // exactly 50% of the track's width, so the second copy seamlessly
    // takes over right as the first copy scrolls out, with no visible
    // jump or gap in the loop. Every burned token, not a capped sample --
    // the browser's own loading="lazy" only actually fetches/decodes
    // images near the visible area, and each one is cached essentially
    // forever server-side, so this scales with total burn count without
    // getting proportionally heavier to load.
    const html = ids.map(burnTickerItemHtml).join('');
    track.innerHTML = html + html;
    host.style.display = 'block';
    // Fixed-duration animation was the actual bug here: at a flat 90s, the
    // real problem is that speed (px/second) scales directly with content
    // length -- going from the old 150-token cap to genuinely all 1,400+
    // meant ~9x more pixels to cover in the same time, i.e. ~9x faster.
    // That'll only get worse as more tokens get burned over time too.
    // Measuring the actual rendered width and deriving duration from a
    // fixed speed keeps the pace visually constant no matter how long the
    // list is, now or in the future.
    const PX_PER_SECOND = 28;
    requestAnimationFrame(() => {
      const halfWidth = track.scrollWidth / 2;
      const duration = Math.max(20, halfWidth / PX_PER_SECOND);
      track.style.animationDuration = `${duration}s`;
    });
  }catch(e){
    host.style.display = 'none';
  }
}
loadBurnTicker();
setInterval(loadBurnTicker, 3 * 60 * 1000);

async function openModal(id, opts={}){
  window._modalCurrentId = +id;
  const row = await fetchRow(id);
  const m   = $('#modal');

  // ── Header ──────────────────────────────────────────────────
  // Modal always shows both OS rank and TV rank
  const _osR = OS_RANK_MAP.get(+id);
  const _tvR = RARITY_OBS_RANK.get(+id);
  const _osChip  = _osR ? `<span class='chip'>${rankDiamondHtml(_osR,'','os')}</span>` : '';
  const _tvChip  = _tvR ? `<span class='chip'>${rankDiamondHtml(_tvR,'','tv')}</span>` : '';
  const _ownedChip = connectedWalletOwns(id) ? `<span class="chip" style="color:#1CFFAF;border-color:rgba(28,255,175,.35);background:rgba(28,255,175,.08)">Owned</span>` : '';
  const _burnedChip = (window._BURNED_IDS && window._BURNED_IDS.has(+id)) ? `<span class="chip" style="color:#f87171;border-color:rgba(248,113,113,.35);background:rgba(248,113,113,.08)">🔥 Burned</span>` : '';
  const _survivorChip = survivorChipHtml(id);
  $('#mTitle').innerHTML = `#${id} &nbsp; ${_osChip}${_tvChip}${_ownedChip}${_burnedChip}${_survivorChip}`;
  hydrateMarketPersonalityTags(id, row);
  const links = $('#mLinks'); links.innerHTML = '';
  const listing = (window.LISTINGS&&window.LISTINGS[id]&&window.LISTINGS[id].opensea)||null;
  const ethVal  = parseEthMaybeWei(listing?listing.price:null);
  // Always show OpenSea link (with price if listed, otherwise just "OpenSea")
  const osHref = listing?.url || `https://opensea.io/assets/ethereum/${LIVE_CONTRACT}/${id}`;
  const osText = (listing&&ethVal!=null) ? `OpenSea (${formatEth(ethVal)})` : 'OpenSea';
  const osA = document.createElement('a'); osA.className='linkpill'; osA.href=osHref; osA.target='_blank'; osA.rel='noopener';
  // Show OpenSea logo + price if listed, logo only if not
  // OpenSea logo from seadn CDN
  const osSvg = `<img src="https://static.seadn.io/logos/Logomark-Blue.png" width="16" height="16" style="vertical-align:middle;border-radius:3px;flex-shrink:0" alt="OpenSea">`;
  osA.innerHTML = osSvg + (listing && ethVal != null ? ` <span style="margin-left:4px">${formatEth(ethVal)}</span>` : '');
  links.appendChild(osA);

  // Etherscan link
  const ethHref = `https://etherscan.io/token/${LIVE_CONTRACT}?a=${id}`;
  const ethA = document.createElement('a');
  ethA.className = 'linkpill'; ethA.href = ethHref; ethA.target = '_blank'; ethA.rel = 'noopener';
  // Etherscan circle logo (base64, no text)
  ethA.innerHTML = `<svg width="16" height="16" viewBox="0 0 122 122" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M25.29 57.9139C25.2901 57.2347 25.4244 56.5623 25.6851 55.9352C25.9458 55.308 26.3278 54.7386 26.8092 54.2595C27.2907 53.7804 27.8619 53.4011 28.4903 53.1434C29.1187 52.8858 29.7918 52.7548 30.471 52.7579L39.061 52.7859C40.4305 52.7859 41.744 53.33 42.7124 54.2984C43.6809 55.2669 44.225 56.5803 44.225 57.9499V90.4299C45.192 90.1429 46.434 89.8369 47.793 89.5169C48.737 89.2952 49.5783 88.761 50.1805 88.0009C50.7826 87.2409 51.1102 86.2996 51.11 85.3299V45.0399C51.11 43.6702 51.654 42.3567 52.6224 41.3881C53.5908 40.4195 54.9043 39.8752 56.274 39.8749H64.881C66.2506 39.8752 67.5641 40.4195 68.5325 41.3881C69.5009 42.3567 70.045 43.6702 70.045 45.0399V82.4329C70.045 82.4329 72.2 81.5609 74.299 80.6749C75.0787 80.3452 75.7441 79.7931 76.2122 79.0877C76.6803 78.3822 76.9302 77.5545 76.931 76.7079V32.1299C76.931 30.7605 77.4749 29.4472 78.4431 28.4788C79.4113 27.5103 80.7245 26.9662 82.0939 26.9659H90.701C92.0706 26.9659 93.384 27.51 94.3525 28.4784C95.3209 29.4468 95.865 30.7603 95.865 32.1299V68.8389C103.327 63.4309 110.889 56.9269 116.89 49.1059C117.761 47.9707 118.337 46.6377 118.567 45.2257C118.797 43.8138 118.674 42.3668 118.209 41.0139C115.431 33.0217 111.016 25.6973 105.245 19.5096C99.474 13.3218 92.4749 8.40687 84.6955 5.07934C76.9161 1.75182 68.5277 0.0849617 60.0671 0.185439C51.6065 0.285917 43.2601 2.15152 35.562 5.66286C27.8638 9.17419 20.9834 14.2539 15.3611 20.577C9.73881 26.9001 5.49842 34.3272 2.91131 42.3832C0.324207 50.4391 -0.552649 58.9464 0.336851 67.3607C1.22635 75.775 3.86263 83.911 8.07696 91.2479C8.81111 92.5135 9.89118 93.5434 11.1903 94.2165C12.4894 94.8896 13.9536 95.178 15.411 95.0479C17.039 94.9049 19.066 94.7019 21.476 94.4189C22.5251 94.2998 23.4937 93.7989 24.1972 93.0116C24.9008 92.2244 25.2901 91.2058 25.291 90.1499L25.29 57.9139Z" fill="white"/><path d="M25.1021 110.009C34.1744 116.609 44.8959 120.571 56.0802 121.456C67.2646 122.34 78.4757 120.114 88.4731 115.022C98.4705 109.93 106.864 102.172 112.726 92.6059C118.587 83.0395 121.688 72.0381 121.685 60.8188C121.685 59.4188 121.62 58.0337 121.527 56.6567C99.308 89.7947 58.2831 105.287 25.104 110.004" fill="#8B8B8B"/></svg>`;  links.appendChild(ethA);

  // Wire download buttons
  const dlBtn = document.getElementById('mDownloadBtn');
  const dlSvgBtn = document.getElementById('mDownloadSvgBtn');
  const favBtn = document.getElementById('mFavoriteBtn');
  // Download dropdown toggle
  const dlWrap   = document.getElementById('mDownloadWrap');
  const dlMenu   = document.getElementById('mDownloadMenu');
  const dlBgBtn  = document.getElementById('mDownloadBgBtn');
  const dlNoBgBtn = document.getElementById('mDownloadNoBgBtn');
  const shareCardBtn = document.getElementById('mShareCardBtn');
  const customizeCardBtn = document.getElementById('mCustomizeCardBtn');
  if(dlBtn && dlMenu){
    dlBtn.onclick = (e) => {
      e.stopPropagation();
      const open = dlMenu.style.display !== 'none';
      dlMenu.style.display = open ? 'none' : 'block';
    };
    // Close when clicking outside
    document.addEventListener('click', function _closeDlMenu(e){
      if(dlWrap && !dlWrap.contains(e.target)){
        dlMenu.style.display = 'none';
        document.removeEventListener('click', _closeDlMenu);
      }
    });
  }
  if(dlBgBtn)  dlBgBtn.onclick  = () => { if(dlMenu) dlMenu.style.display='none'; downloadTokenPng(id, true);  };
  if(dlNoBgBtn) dlNoBgBtn.onclick = () => { if(dlMenu) dlMenu.style.display='none'; downloadTokenPng(id, false); };
  if(shareCardBtn) shareCardBtn.onclick = () => { if(dlMenu) dlMenu.style.display='none'; downloadShareCardPng(id); };
  if(customizeCardBtn) customizeCardBtn.onclick = () => {
    if(dlMenu) dlMenu.style.display='none';
    if(typeof ensureTraitViewDownloadsLoaded === 'function'){
      ensureTraitViewDownloadsLoaded().then(()=>openTraitViewStudio(id)).catch(()=>{});
    } else {
      openTraitViewStudio(id);
    }
  };
  if(favBtn){
    favBtn.setAttribute('data-fav-id', String(id));
    favBtn.classList.toggle('active', isFavorite(id));
    favBtn.setAttribute('aria-pressed', isFavorite(id) ? 'true' : 'false');
    favBtn.title = isFavorite(id) ? 'Remove favorite' : 'Add favorite';
    favBtn.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation(); toggleFavorite(id); favBtn.classList.toggle('active', isFavorite(id)); favBtn.setAttribute('aria-pressed', isFavorite(id) ? 'true' : 'false'); favBtn.title = isFavorite(id) ? 'Remove favorite' : 'Add favorite'; };
  }
  if(dlSvgBtn){
    const hasInlineSvg = typeof image === 'string' && image.trim().startsWith('<svg');
    const mapVal = IMAGES_MAP && IMAGES_MAP.get(id);
    const mapSvg = typeof mapVal === 'string' && mapVal.trim().startsWith('<svg');
    dlSvgBtn.style.display = (hasInlineSvg || mapSvg) ? 'inline-flex' : 'none';
    dlSvgBtn.onclick = () => downloadTokenSvg(id);
  }

  // ── Listing price (instant — from cached LISTINGS) ───────────────────────
  const priceEl = document.getElementById('mPrice');
  if(listing && ethVal != null){
    priceEl.textContent = 'Ξ ' + formatEth(ethVal) + ' ETH';
    priceEl.style.display = 'inline';
  } else {
    priceEl.style.display = 'none';
  }

  // ── Owner (async, cached) ────────────────────────────────────────────────
  const ownerEl  = document.getElementById('mOwner');
  const addrEl   = document.getElementById('mOwnerAddr');
  ownerEl.style.display = 'none';
  addrEl.textContent = '…';
  // Session cache
  if(!window.OWNER_CACHE) window.OWNER_CACHE = {};
  const fetchOwner = async () => {
    if(window.OWNER_CACHE[id]){
      const addr = window.OWNER_CACHE[id];
      addrEl.textContent = addr.slice(0,6) + '…' + addr.slice(-4);
      ownerEl.dataset.address = addr;
      ownerEl.style.display = 'inline-flex';
      return;
    }
    try{
      const WORKER = window.LIVE_ENDPOINT || 'https://nft-live-listings.jvweb3.workers.dev';
      const r = await fetch(`${LIVE_ENDPOINT}/os/owner?contract=${LIVE_CONTRACT}&tokenId=${id}`);
      if(!r.ok) return;
      const j = await r.json();
      if(!j.owner) return;
      window.OWNER_CACHE[id] = j.owner;
      addrEl.textContent = j.owner.slice(0,6) + '…' + j.owner.slice(-4);
      ownerEl.dataset.address = j.owner;
      ownerEl.style.display = 'inline-flex';
    } catch(e){ /* silent fail */ }
  };
  fetchOwner();
  // Click owner pill → open wallet view (drawer on mobile, panel on desktop)
  ownerEl.onclick = () => {
    const addr = ownerEl.dataset.address;
    openWalletView(addr);
  };

  // ── Image ────────────────────────────────────────────────────
  const imgBox = $('#mImg');
  const mapVal = IMAGES_MAP && IMAGES_MAP.get(id);
  // See gridThumbHtml's comment above — row.image (live) beats the static map.
  const src    = row.image || mapVal || imgForId(id);
  if(src){ const s=String(src).trim(); if(s.startsWith('<svg')) imgBox.innerHTML=`<div class="svg-wrap" style="width:100%;height:100%">${s}</div>`; else if(/^data:image\//i.test(s)) imgBox.innerHTML=`<img src="${s}" alt="#${id}">`; else imgBox.innerHTML=`<img src="${ipfsToHttp(s)}" alt="#${id}">`;} else imgBox.innerHTML='<div style="color:var(--muted)">No image</div>';
  // Fetch live image for this token (picks up background changes)
  // Uses shared TTL cache — hover and grid also benefit
  if(typeof _fetchFreshImg === 'function'){
    _fetchFreshImg(id).then(() => {
      const fresh = typeof _getFreshImg === 'function' ? _getFreshImg(id) : null;
      if(fresh){
        const currentModal = document.getElementById('modal');
        const titleEl = document.getElementById('mTitle');
        // Don't clobber a historical toggle position the user has navigated
        // to -- only apply the fresh "current" image if we're still parked
        // at the latest position (or the history toggle never loaded at all).
        const h = window._modalBurnHistory;
        const atLatest = !h || h.tokenId !== +id || h.index === h.entries.length - 1;
        if(atLatest && currentModal?.style.display !== 'none' && titleEl?.textContent?.includes(`#${id}`)){
          imgBox.innerHTML = `<img src="${fresh}" alt="#${id}" style="max-width:100%;max-height:100%;object-fit:contain">`;
        }
      }
    }).catch(()=>{});
  }

  // ── Pre-burn history toggle ───────────────────────────────────────────────
  // Reset immediately so a previous token's toggle state can't bleed into
  // this one while the fetch below is in flight.
  window._modalBurnHistory = null;
  const histContainer = document.getElementById('mBurnHistoryToggle');
  if(histContainer){ histContainer.style.display = 'none'; histContainer.innerHTML = ''; }
  fetchTokenBurnHistory(id).then(history => {
    // Bail if the modal moved on to a different token while this was loading.
    if(window._modalCurrentId !== +id) return;
    if(!history || !Array.isArray(history.timeline) || history.timeline.length <= 1) return;
    const entries = history.timeline;
    // If opened from a specific burn row (opts.burnEventId), jump straight to
    // that position and actually apply it -- otherwise leave the
    // already-rendered current/live image and traits alone, and just show
    // the toggle parked at the latest known position for reference.
    const targetEntry = opts.burnEventId != null
      ? entries.find(e => e.burn_event_id === opts.burnEventId)
      : null;
    const startIndex = targetEntry ? entries.indexOf(targetEntry) : entries.length - 1;
    window._modalBurnHistory = { entries, index: startIndex, tokenId: +id };
    if(targetEntry) _applyBurnHistoryEntry(targetEntry);
    renderBurnHistoryToggle(histContainer, entries, entries[startIndex].position);
  });

  // ── Tab: Traits ──────────────────────────────────────────────
  const kv = keepEntries(row.traits);
  $('#mTraits').innerHTML = kv.length ? kv.map(([k,v])=>`<div><span>${traitDisplayLabel(k)}</span><b>${v}</b></div>`).join('') : '<div style="color:var(--muted)">No traits</div>';

  // ── Tab: Rarity Breakdown ────────────────────────────────────
  buildRarityBreakdown(id, row);

  // ── Tab: Price History ───────────────────────────────────────
  buildPriceHistory(id, row);

  // Reset to first tab
  document.querySelectorAll('.modal-tab').forEach(t=>t.classList.toggle('active', t.dataset.tab==='traits'));
  document.querySelectorAll('.modal-tab-panel').forEach(p=>p.classList.toggle('active', p.id==='tab-traits'));

  m.style.display = 'flex';
}

/* combo insight helpers moved to js/comboInsights.js */

const MARKET_TAG_CACHE = new Map();
let MARKET_FLOOR_CACHE = null;
function marketTagFloor(){
  if(MARKET_FLOOR_CACHE && Date.now() - MARKET_FLOOR_CACHE.ts < 60000) return MARKET_FLOOR_CACHE.floor;
  const prices = Object.values(window.LISTINGS || {})
    .map(v => v?.opensea?.price_eth ?? v?.price_eth ?? null)
    .map(v => Number(v))
    .filter(v => Number.isFinite(v) && v > 0)
    .sort((a,b) => a - b);
  const floor = prices.length ? prices[0] : null;
  MARKET_FLOOR_CACHE = { floor, ts:Date.now() };
  return floor;
}
function marketTagAdd(list, tag){
  if(!tag || !tag.label) return;
  if(list.some(t => t.label === tag.label)) return;
  list.push(tag);
}
function marketTagText(entries){
  return entries.map(([k,v]) => `${k} ${v}`).join(' ').toLowerCase();
}
function marketTagHas(text, words){
  return words.some(w => text.includes(w));
}
function marketTagCount(text, words){
  return words.reduce((n,w) => n + (text.includes(w) ? 1 : 0), 0);
}
async function computeMarketPersonalityTags(id, row){
  id = +id;
  const listingKey = window.LISTINGS?.[id]?.opensea?.price_eth ?? '';
  const cacheKey = `${id}:${listingKey}:${OS_RANK_MAP?.get(id) || ''}:${RARITY_OBS_RANK?.get(id) || ''}`;
  if(MARKET_TAG_CACHE.has(cacheKey)) return MARKET_TAG_CACHE.get(cacheKey);

  const entries = keepEntries(row.traits);
  const text = marketTagText(entries);
  const total = TOKEN_COUNT || 10000;
  const osRank = Number(OS_RANK_MAP?.get(id) || OS_RANK_MAP?.get(String(id)) || 0);
  const tvRank = Number(RARITY_OBS_RANK?.get(id) || 0);
  const rank = osRank || tvRank || null;
  const traitCount = typeof getTraitCount === 'function' ? getTraitCount(row) : entries.length;
  const visual = comboVisualTraits(entries);
  const typeValue = String(visual.type?.value || '').toLowerCase();
  const traitStats = entries.map(([name,value]) => {
    const count = (TRAIT_FREQ[name]?.[value]) || total;
    return { name, value, count, pct: total ? (count / total * 100) : 100 };
  }).sort((a,b) => a.count - b.count);
  const rareTraits = traitStats.filter(t => t.count <= Math.max(35, total * 0.0035));
  const strongRareTraits = traitStats.filter(t => t.count <= Math.max(18, total * 0.0018));
  const extremeTraits = traitStats.filter(t => t.count <= Math.max(8, total * 0.0008));
  let comboData = null;
  try{ comboData = Object.keys(TRAIT_FREQ || {}).length ? await buildComboInsights(id, row) : null; }catch(_){ }
  const comboInsights = comboData?.insights || [];
  const comboOne = comboInsights.filter(i => i.count === 1).length;
  const comboNear = comboInsights.filter(i => i.count > 0 && i.count <= 3).length;
  const comboEvidence = comboInsights.filter(i => /\+|combo|face|type/i.test(`${i.label || ''} ${i.meta || ''}`));
  const bestCombo = comboEvidence
    .filter(i => Number.isFinite(+i.count) && +i.count > 0)
    .sort((a,b) => (+a.count - +b.count) || (String(b.label||'').length - String(a.label||'').length))[0] || null;
  const bestComboWhy = bestCombo ? `${bestCombo.text || bestCombo.label} ${bestCombo.meta ? '- ' + bestCombo.meta : ''}` : '';
  const hasRareCombo = !!(bestCombo && bestCombo.count <= 2);
  const hasExceptionalCombo = !!(bestCombo && bestCombo.count === 1);

  const listing = window.LISTINGS?.[id]?.opensea || null;
  const price = Number(listing?.price_eth);
  const floor = marketTagFloor();
  const nearFloor = Number.isFinite(price) && floor && price <= floor * 1.12;
  const styleWords = ['hat','cap','crown','helmet','shade','glasses','jacket','chain','earring','bracelet','watch','diamond','gold','golden','grill','suit','robe','hoodie'];
  const jewelryWords = ['chain','earring','bracelet','watch','diamond','gold','golden','grill','jewellery','jewelry'];
  const styleHits = marketTagCount(text, styleWords);
  const jewelryHits = marketTagCount(text, jewelryWords);
  const stylish = styleHits >= 2;
  const jewelry = jewelryHits >= 1;
  const weird = marketTagHas(text, ['weird','zombie','alien','skeleton','skull','demonic','radioactive','rainbow','laser','blood','bones','fang','cursed']);
  const clean = traitCount <= 7 && !weird && !marketTagHas(text, ['rainbow','laser','blood','bones']) && !strongRareTraits.length;
  const tags = [];

  if(rank && rank <= 100) marketTagAdd(tags, { label:'Grail', cls:'grail', score:140, why:`Top ${rank} rarity rank.` });
  if(hasExceptionalCombo && (extremeTraits.length >= 1 || strongRareTraits.length >= 2 || (rank && rank <= 1500))) marketTagAdd(tags, { label:'One-of-One Feel', cls:'combo', score:124, why:bestComboWhy || 'Unique combo plus meaningful rarity context.' });
  if(hasRareCombo) marketTagAdd(tags, { label:'Rare Combo', cls:'combo', score:112 + comboNear, why:bestComboWhy || `Best combo appears on ${bestCombo.count} tokens.` });
  if(extremeTraits.length >= 2 || strongRareTraits.length >= 3 || (traitCount >= 11 && rareTraits.length >= 2)) marketTagAdd(tags, { label:'Trait Monster', cls:'trait', score:104 + strongRareTraits.length, why:`${strongRareTraits.length} very rare traits across ${traitCount} total traits.` });
  if(rank && rank > 1200 && (hasRareCombo || strongRareTraits.length >= 2)) marketTagAdd(tags, { label:'Lowkey Rare', cls:'lowkey', score:98, why:`Rank ${rank}, but hidden rarity from ${hasRareCombo ? 'a low-count combo' : strongRareTraits.length + ' very rare traits'}.` });
  if(nearFloor && ((rank && rank <= 1200) || hasRareCombo || strongRareTraits.length >= 2)) marketTagAdd(tags, { label: rank && rank <= 1000 ? 'Floor Flex' : 'Floor Gem', cls:'drip', score:96, why:`Listed near floor at ${price.toFixed(4)} ETH with ${rank ? 'rank ' + rank : 'rare trait/combo signals'}.` });
  if(rank && rank > 1200 && nearFloor && (hasRareCombo || strongRareTraits.length >= 2)) marketTagAdd(tags, { label:'Sleeper', cls:'sleeper', score:94, why:`Near-floor listing with stronger rarity signals than rank suggests.` });
  if(stylish && jewelry && (styleHits >= 3 || rank && rank <= 2500 || rareTraits.length)) marketTagAdd(tags, { label:'Drip Check', cls:'drip', score:84 + styleHits, why:`${styleHits} style traits, including ${jewelryHits} jewelry/gold/diamond signal${jewelryHits===1?'':'s'}.` });
  if(clean && (rank && rank <= 3000 || hasRareCombo || traitCount <= 6)) marketTagAdd(tags, { label: traitCount <= 6 ? 'Minimalist' : 'Clean Build', cls:'clean', score:74, why:`Low visual clutter with ${traitCount} traits.` });
  if(weird && !clean && (hasRareCombo || strongRareTraits.length || /(zombie|alien|demonic|skeleton|radioactive)/i.test(typeValue))) marketTagAdd(tags, { label:'Weird Build', cls:'weird', score:72, why:`Unusual type/trait mix with objective rarity support.` });
  if((typeValue.includes('demonic') || text.includes('skeleton') || text.includes('skull')) && (hasRareCombo || strongRareTraits.length)) marketTagAdd(tags, { label:'Cursed', cls:'cursed', score:88, why:`Dark type/visual traits plus rare combo or trait evidence.` });
  if(!tags.length && (rank && rank <= 500 || strongRareTraits.length >= 2 || hasRareCombo)) marketTagAdd(tags, { label:'Collector Piece', cls:'combo', score:70, why:'Strong rank, trait, or combo signal without a louder personality tag.' });

  const sorted = tags.sort((a,b) => b.score - a.score);
  const limit = sorted.length >= 3 && ((rank && rank <= 100) || (hasExceptionalCombo && strongRareTraits.length >= 2)) ? 3 : 2;
  const result = sorted.slice(0, limit);
  MARKET_TAG_CACHE.set(cacheKey, result);
  return result;
}
function renderMarketPersonalityTags(tags){
  const visible = (tags || []).slice(0, 3);
  const more = visible.length > 2 ? `<span class="market-tag market-tag-more" title="${comboEsc(visible.slice(2).map(t => `${t.label}: ${t.why || ''}`).join(' | '))}">+${visible.length - 2}</span>` : '';
  return visible.map(t => `<span class="market-tag ${comboEsc(t.cls || '')}" title="${comboEsc(t.label + ' - ' + (t.why || 'Grounded in rank, traits, combos, and listing data.'))}">${comboEsc(t.label)}</span>`).join('') + more;
}
async function hydrateMarketPersonalityTags(id, row){
  const host = document.getElementById('mPersonalityTags');
  if(!host) return;
  const tokenId = +id;
  host.innerHTML = '';
  try{
    const tags = await computeMarketPersonalityTags(tokenId, row);
    if(window._modalCurrentId !== tokenId) return;
    host.innerHTML = renderMarketPersonalityTags(tags);
    host.style.display = tags.length ? 'flex' : 'none';
  }catch(e){
    console.warn('[MarketTags] failed:', e);
    if(window._modalCurrentId === tokenId) host.style.display = 'none';
  }
}

// Simple insertion-order eviction for caches keyed by something with no
// natural ceiling (wallet addresses looked up over a long session), unlike
// token-ID-keyed caches which are already bounded by the collection size.
function boundedMapSet(map, key, value, maxSize){
  if(!map.has(key) && map.size >= maxSize){
    const oldestKey = map.keys().next().value;
    map.delete(oldestKey);
  }
  map.set(key, value);
}
const HOLDER_TAG_CACHE = new Map();
function holderTagAdd(list, tag){
  if(!tag || !tag.label) return;
  if(list.some(t => t.label === tag.label)) return;
  list.push(tag);
}
async function computeHolderTags(addr, ids){
  const cleanIds = [...new Set((ids || []).map(Number).filter(id => id >= 1 && id <= (TOKEN_COUNT || 10000)))];
  const key = `${String(addr || '').toLowerCase()}:${cleanIds.slice().sort((a,b)=>a-b).join(',')}`;
  if(HOLDER_TAG_CACHE.has(key)) return HOLDER_TAG_CACHE.get(key);
  if(!cleanIds.length) return [];

  const typeCounts = new Map();
  const typeIds = new Map();
  const valueCounts = new Map();
  const traitNames = new Set();
  const diamondIds = [], blindIds = [], topRankIds = [], comboIds = [], rareIds = [];
  let diamondTraits = 0, blindEyes = 0, topRanks = 0, rareTraitHits = 0, comboish = 0;
  for(const id of cleanIds){
    let row = null;
    try{ row = (ROW_CACHE && ROW_CACHE.get(id)) || await fetchRow(id); }catch(_){ }
    const entries = keepEntries(row?.traits || {});
    const text = marketTagText(entries);
    const visual = comboVisualTraits(entries);
    let tokenRareHits = 0;
    if(visual.type?.value){
      typeCounts.set(visual.type.value, (typeCounts.get(visual.type.value) || 0) + 1);
      if(!typeIds.has(visual.type.value)) typeIds.set(visual.type.value, []);
      typeIds.get(visual.type.value).push(id);
    }
    for(const [k,v] of entries){
      traitNames.add(`${k}:${v}`);
      valueCounts.set(String(v), (valueCounts.get(String(v)) || 0) + 1);
      const count = (TRAIT_FREQ[k]?.[v]) || TOKEN_COUNT || 10000;
      if(count <= Math.max(60, (TOKEN_COUNT || 10000) * 0.006)){ rareTraitHits++; tokenRareHits++; rareIds.push(id); }
    }
    if(marketTagHas(text, ['diamond'])){ diamondTraits++; diamondIds.push(id); }
    if(marketTagHas(text, ['blind eyes'])){ blindEyes++; blindIds.push(id); }
    const rank = Number(OS_RANK_MAP?.get(id) || RARITY_OBS_RANK?.get(id) || 0);
    if(rank && rank <= 1000){ topRanks++; topRankIds.push(id); }
    if(tokenRareHits >= 2 || entries.length >= 10){ comboish++; comboIds.push(id); }
  }

  const tags = [];
  // Bespoke flavor for known types; anything else still gets tagged via the
  // generic fallback below instead of being silently skipped (the old code
  // only ever checked Zombie and Ape specifically, so Skeleton/Alien/Angel/
  // etc. holders never got a type tag at all, no matter how many they held).
  const TYPE_TAG_DEFS = [
    { pattern:/zombie/i,   label:'Zombie King',   cls:'cursed' },
    { pattern:/ape/i,      label:'Ape Lord',      cls:'grail' },
    { pattern:/skeleton/i, label:'Bone Collector',cls:'cursed' },
    { pattern:/alien/i,    label:'Alien Overlord',cls:'combo' },
    { pattern:/angel/i,    label:'Angel Keeper',  cls:'grail' },
  ];
  for(const [typeName, count] of typeCounts.entries()){
    if(count < 3) continue;
    if(/human/i.test(typeName)) continue; // baseline/common type — not a distinguishing flex
    const def = TYPE_TAG_DEFS.find(d => d.pattern.test(typeName));
    holderTagAdd(tags, {
      label: def ? def.label : `${typeName} Collector`,
      cls: def ? def.cls : 'trait',
      detail: `Holds ${count} ${typeName}`,
      ids: typeIds.get(typeName) || [],
      score: (def ? 88 : 80) + count,
    });
  }
  if(blindEyes >= 2) holderTagAdd(tags, { label:'Blind Eyes Whale', cls:'combo', detail:`Owns ${blindEyes} Blind Eyes`, ids:blindIds, score:82 + blindEyes });
  if(diamondTraits >= 3) holderTagAdd(tags, { label:'Diamond Baron', cls:'drip', detail:`Owns ${diamondTraits} Diamond traits`, ids:diamondIds, score:84 + diamondTraits });
  if(topRanks >= 2) holderTagAdd(tags, { label:'Grail Keeper', cls:'grail', detail:`Holds ${topRanks} top-ranked OCAS`, ids:topRankIds, score:86 + topRanks });
  if(traitNames.size >= Math.max(18, cleanIds.length * 5)) holderTagAdd(tags, { label:'Trait Hoarder', cls:'trait', detail:`${traitNames.size} unique trait values`, ids:cleanIds, score:74 + traitNames.size / 10 });
  if(comboish >= Math.max(2, Math.ceil(cleanIds.length * 0.18))) holderTagAdd(tags, { label:'Combo Collector', cls:'combo', detail:`${comboish} rare/combo-heavy tokens`, ids:comboIds, score:78 + comboish });
  if(cleanIds.length >= 8 && rareTraitHits >= cleanIds.length * 2) holderTagAdd(tags, { label:'One-of-One Hunter', cls:'combo', detail:`${rareTraitHits} rare trait hits`, ids:rareIds, score:76 + rareTraitHits / 3 });

  const result = tags.sort((a,b)=>b.score-a.score).slice(0, 5);
  boundedMapSet(HOLDER_TAG_CACHE, key, result, 50);
  return result;
}
function renderHolderTags(tags){
  return (tags || []).map(t => `<span class="holder-tag ${comboEsc(t.cls || '')}" data-holder-tag="${comboEsc(t.label)}" data-holder-ids="${comboEsc((t.ids || []).slice(0,16).join(','))}"><b>${comboEsc(t.label)}</b><span>${comboEsc(t.detail || '')}</span></span>`).join('');
}
async function hydrateHolderTags(addr, ids, hostId){
  const host = document.getElementById(hostId);
  if(!host) return;
  host.innerHTML = '';
  const tags = await computeHolderTags(addr, ids);
  host.innerHTML = renderHolderTags(tags);
  host.style.display = tags.length ? 'flex' : 'none';
}

function initHolderTagPreview(){
  const tip = document.getElementById('holderTagPreview');
  if(!tip || tip.dataset.bound) return;
  tip.dataset.bound = '1';
  const isTouch = () => window.matchMedia('(hover: none)').matches || window.innerWidth <= 900;
  const hide = () => { tip.style.display = 'none'; };
  const move = (x,y) => {
    const pad = 12;
    const rect = tip.getBoundingClientRect();
    let left = x + 14, top = y + 14;
    if(left + rect.width > window.innerWidth - pad) left = x - rect.width - 14;
    if(top + rect.height > window.innerHeight - pad) top = window.innerHeight - rect.height - pad;
    tip.style.left = Math.max(pad, left) + 'px';
    tip.style.top = Math.max(pad, top) + 'px';
  };
  document.addEventListener('pointerover', e => {
    if(isTouch()) return;
    const burnThumb = e.target.closest?.('.burn-token-thumb[data-burn-token-id]');
    if(burnThumb){
      const id = Number(burnThumb.dataset.burnTokenId);
      if(!id) return;
      // If this specific thumb is showing a frozen/historical image (e.g. a
      // burn row's pre-burn snapshot), preview THAT image, not the token's
      // current live one -- reading it straight off the actual rendered
      // <img> avoids re-deriving state that's already sitting right there.
      const frozenImg = burnThumb.dataset.burnFrozenImg ? burnThumb.querySelector('img') : null;
      const src = frozenImg ? frozenImg.src
        : (typeof _getTokenImgSrc === 'function' ? _getTokenImgSrc(id) : (typeof imgForId === 'function' ? imgForId(id) : ''));
      const osRank = typeof OS_RANK_MAP !== 'undefined' ? OS_RANK_MAP.get(id) : null;
      const tvRank = typeof RARITY_OBS_RANK !== 'undefined' ? RARITY_OBS_RANK.get(id) : null;
      const rank = osRank || tvRank;
      const row = typeof ROW_CACHE !== 'undefined' ? ROW_CACHE.get(id) : null;
      const traits = row && typeof getTraitCount === 'function' ? getTraitCount(row) : null;
      const historyNote = frozenImg ? '<span style="color:var(--sub)">Historical snapshot</span>' : '';
      tip.innerHTML = `<div class="holder-tag-preview-title">Token #${id}</div><div class="holder-tag-preview-token">${src ? `<img src="${comboEsc(src)}" alt="#${id}">` : ''}<div><b>#${id}</b>${rank ? `<span>Rank #${comboEsc(rank)}</span>` : ''}${traits != null ? `<span>${comboEsc(traits)} traits</span>` : ''}${historyNote}</div></div>`;
      tip.style.display = 'block';
      move(e.clientX, e.clientY);
      return;
    }
    const tag = e.target.closest?.('.holder-tag[data-holder-ids]');
    if(!tag) return;
    const rawIds = String(tag.dataset.holderIds || '').split(',').map(Number).filter(Boolean);
    const ids = rawIds.slice(0,8);
    if(!ids.length) return;
    tip.innerHTML = `<div class="holder-tag-preview-title">${comboEsc(tag.dataset.holderTag || 'Holder tag')}</div><div class="holder-tag-preview-grid">${ids.slice(0,8).map(id => {
      const src = typeof _getTokenImgSrc === 'function' ? _getTokenImgSrc(id) : (typeof imgForId === 'function' ? imgForId(id) : '');
      return src ? `<img src="${comboEsc(src)}" alt="#${id}" title="#${id}">` : '';
    }).join('')}</div>${rawIds.length > 8 ? `<div class="holder-tag-preview-more">+${rawIds.length - 8} more</div>` : ''}`;
    tip.style.display = 'block';
    move(e.clientX, e.clientY);
  }, { passive:true });
  document.addEventListener('pointermove', e => { if(tip.style.display === 'block') move(e.clientX, e.clientY); }, { passive:true });
  document.addEventListener('pointerout', e => { if(e.target.closest?.('.holder-tag[data-holder-ids], .burn-token-thumb[data-burn-token-id]')) hide(); }, { passive:true });
}
document.addEventListener('DOMContentLoaded', initHolderTagPreview);

function buildRarityBreakdown(id, row){
  const host = document.getElementById('mRarityBreakdown');
  if(!host) return;
  const kv = keepEntries(row.traits);
  if(!kv.length || !Object.keys(TRAIT_FREQ).length){
    host.innerHTML = '<div class="price-history-empty">Rarity data loading… try again in a moment.</div>';
    return;
  }
  const total = TOKEN_COUNT || 10000;

  // Calculate per-trait score contribution (same formula as buildStatsAndRanks)
  const traitScores = kv.map(([k,v])=>{
    const count = (TRAIT_FREQ[k]?.[v]) || 1;
    const p     = count / total;
    const score = -Math.log(Math.max(p, 1e-12));
    const pct   = (count / total) * 100;
    return { trait: k, value: v, count, pct, score };
  });

  const totalScore = traitScores.reduce((s,t)=>s+t.score, 0);
  traitScores.sort((a,b)=>b.score-a.score); // rarest trait first

  const obsRank = RARITY_OBS_RANK.get(id) || '—';

  let html = `<div class="rarity-breakdown-title">Rarity Score Breakdown — Rank ${obsRank}</div>`;
  html += `<div style="font-size:11px;color:var(--muted);margin-bottom:10px">Each trait's contribution to overall rarity score (rarer trait = higher % contribution)</div>`;

  for(const t of traitScores){
    const contrib  = totalScore > 0 ? (t.score / totalScore * 100) : 0;
    const barWidth = Math.round(contrib);
    const pctFmt   = t.pct < 0.1 ? t.pct.toFixed(3) : t.pct.toFixed(1);
    html += `
    <div class="rarity-row" title="${t.trait}: ${t.value} — ${t.count} tokens (${pctFmt}%)">
      <div class="rarity-trait-name"><b>${t.trait}:</b> ${t.value}</div>
      <div class="rarity-pct">${pctFmt}%</div>
      <div class="rarity-bar-wrap"><div class="rarity-bar-fill" style="width:${barWidth}%"></div></div>
      <div class="rarity-contrib">${contrib.toFixed(1)}%</div>
    </div>`;
  }

  html += `<div style="margin-top:10px;font-size:11px;color:var(--muted);border-top:1px solid var(--border);padding-top:8px">
    Total rarity score: <b>${totalScore.toFixed(2)}</b> &nbsp;•&nbsp;
    ${traitScores.length} traits &nbsp;•&nbsp;
    Bar width = % contribution to score
  </div>`;

  html += `
  <div id="comboInsightsPanel" class="combo-insights-panel">
    <div class="combo-insights-head">
      <div class="combo-insights-title">
        Combo Intelligence
        <div class="combo-insights-sub">Objective rarity relationships from loaded OCAS traits</div>
      </div>
      <button id="comboInsightsToggle" class="combo-insights-toggle" type="button" onclick="toggleComboInsights()">Hide</button>
    </div>
    <div id="comboInsightsBody"><div class="combo-insights-fallback">Analyzing local trait combos...</div></div>
  </div>`;

  host.innerHTML = html;
  hydrateComboInsights(id, row);
}

// Price history cache: tokenId → { sales, lastFetched }
const priceHistoryCache = new Map();
const tokenHistoryCache = new Map();

async function buildPriceHistory(id, row){
  const host = document.getElementById('mPriceHistory');
  if(!host) return;
  host.innerHTML = '<div class="price-history-empty">Loading price history…</div>';

  try{
    const cached = priceHistoryCache.get(id);
    if(cached && Date.now() - cached.lastFetched < 300000){
      renderPriceChart(id, cached.sales, host);
      appendTokenChainHistory(id, host).catch(e => console.warn('[TokenHistory] failed:', e.message));
      return;
    }

    let merged = [];

    // 1. Railway DB — full history (token_id, price_eth, currency, buyer, seller, tx_hash, sale_ts)
    try{
      const dbData = await dbFetch('/db/token-sales', { token_id: id, limit: 200 });
      if(dbData.ok && dbData.sales?.length){
        merged = dbData.sales.map(s => ({
          event_timestamp: new Date(s.sale_ts).getTime() / 1000,
          payment: { quantity: String(Math.round((s.price_eth||0) * 1e18)), decimals: 18, symbol: s.currency || 'ETH' },
          nft: { identifier: String(s.token_id) },
          transaction: s.tx_hash || null,
          seller: s.seller ? { address: s.seller } : null,
          buyer:  s.buyer  ? { address: s.buyer  } : null,
        })).filter(s => s.event_timestamp > 0);
      }
    } catch(e){ console.warn('[PriceHistory] DB failed:', e.message); }

    // 2. Fallback: OpenSea collection events
    if(!merged.length){
      const WORKER = window.LIVE_ENDPOINT || 'https://nft-live-listings.jvweb3.workers.dev';
      try{
        const r = await fetch(`${WORKER}/os/events?slug=${encodeURIComponent(window.LIVE_SLUG||'on-chain-all-stars')}&event_type=sale&limit=100`, { cache: 'no-store' });
        if(r.ok){
          const j = await r.json();
          merged = (j.events || []).filter(s => String(s.nft?.identifier) === String(id));
        }
      } catch(e){ console.warn('[PriceHistory] OS fallback failed:', e.message); }
    }

    // Deduplicate by timestamp
    const seen = new Set();
    merged = merged.filter(s => {
      const key = String(Math.round((s.event_timestamp||0) * 1000));
      if(seen.has(key)) return false;
      seen.add(key); return true;
    }).sort((a,b) => a.event_timestamp - b.event_timestamp);

    priceHistoryCache.set(id, { sales: merged, lastFetched: Date.now() });
    renderPriceChart(id, merged, host);
    appendTokenChainHistory(id, host).catch(e => console.warn('[TokenHistory] failed:', e.message));
  }catch(e){
    host.innerHTML = `<div class="price-history-empty">Could not load price history: ${e.message}</div>`;
  }
}

async function appendTokenChainHistory(id, host){
  if(!host) return;
  const section = document.createElement('div');
  section.className = 'token-history-section';
  section.innerHTML = '<div class="price-history-title">Token Movement</div><div class="wallet-empty-state">Loading token movement...</div>';
  host.appendChild(section);

  try{
    let rows;
    const cached = tokenHistoryCache.get(id);
    if(cached && Date.now() - cached.lastFetched < 300000){
      rows = cached.rows;
    }else{
      const data = await dbFetch(`/db/token/${encodeURIComponent(id)}/history`, { limit: 12 });
      rows = data?.history || data?.transfers || data?.events || data?.rows || [];
      tokenHistoryCache.set(id, { rows, lastFetched:Date.now() });
    }

    if(!rows.length){
      section.innerHTML = '<div class="price-history-title">Token Movement</div><div class="wallet-empty-state">Ownership history is still building. Sale history is available now.</div>';
      return;
    }

    section.innerHTML = `<div class="price-history-title">Token Movement</div><div class="wallet-transfer-list">${rows.slice(0,12).map(t => {
      const tx = t.tx_hash || t.transaction_hash || '';
      const link = tx ? `https://etherscan.io/tx/${tx}` : '';
      const kind = t.event_type || t.direction || 'transfer';
      const date = walletDate(t.block_ts || t.timestamp || t.created_at);
      const from = t.from_address ? shortAddr(t.from_address) : '';
      const to = t.to_address ? shortAddr(t.to_address) : '';
      const route = from || to ? `${from || 'mint'} -> ${to || 'burn'}` : `#${id}`;
      return `<div class="wallet-transfer-row"><div class="wallet-transfer-kind">${comboEsc(kind)}</div><div class="wallet-transfer-main">${comboEsc(route)}${link ? ` · <a href="${comboEsc(link)}" target="_blank" rel="noopener">tx</a>` : ''}</div><div class="wallet-transfer-date">${comboEsc(date)}</div></div>`;
    }).join('')}</div>`;
  }catch(e){
    section.innerHTML = '<div class="price-history-title">Token Movement</div><div class="wallet-empty-state">Token history is not available yet.</div>';
  }
}


function renderPriceChart(id, sales, host){
  if(!sales.length){
    host.innerHTML = '<div class="price-history-empty">No sale history found for this token.</div>';
    return;
  }

  // Parse sale values and preserve currency labels
  const points = sales.map(s=>{
    try{
      const qty = BigInt(s.payment?.quantity||'0');
      const dec = s.payment?.decimals??18;
      const eth = Number(qty)/Math.pow(10,dec);
      const addr = String(s.payment?.address || s.payment?.token_address || '').toLowerCase();
      const symRaw = String(s.payment?.symbol || '').toUpperCase();
      const symbol = (symRaw === 'WETH' || addr === '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2') ? 'WETH' : 'ETH';
      return { ts: s.event_timestamp * 1000, eth: isFinite(eth)&&eth>0?eth:null, symbol };
    }catch{ return null; }
  }).filter(p=>p&&p.eth);

  if(!points.length){
    host.innerHTML = '<div class="price-history-empty">No price data available for this token.</div>';
    return;
  }

  const maxEth = Math.max(...points.map(p=>p.eth));
  const minEth = Math.min(...points.map(p=>p.eth));

  let html = `<div class="price-history-title">Sale Price History — #${id} (${points.length} sale${points.length===1?'':'s'})</div>`;

  // Simple SVG line chart
  const W=500, H=130, PAD=40;
  const tMin=points[0].ts, tMax=points[points.length-1].ts||tMin+1;
  const eMin=minEth*0.9, eMax=maxEth*1.1;
  const tx = t => PAD + (W-PAD*2)*((t-tMin)/(tMax-tMin||1));
  const ty = e => H-PAD - (H-PAD*2)*((e-eMin)/(eMax-eMin||1));

  const pts = points.map(p=>`${tx(p.ts).toFixed(1)},${ty(p.eth).toFixed(1)}`).join(' ');
  const area = `M${tx(points[0].ts).toFixed(1)},${H-PAD} ` +
    points.map(p=>`L${tx(p.ts).toFixed(1)},${ty(p.eth).toFixed(1)}`).join(' ') +
    ` L${tx(points[points.length-1].ts).toFixed(1)},${H-PAD} Z`;

  html += `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:${H}px">
    <defs>
      <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2dd4bf" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="#2dd4bf" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${area}" fill="url(#priceGrad)"/>
    <polyline points="${pts}" fill="none" stroke="#2dd4bf" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <text x="${PAD}" y="${ty(maxEth).toFixed(1)-4}" fill="#9ab0c8" font-size="10">Ξ${maxEth.toFixed(4)}</text>
    <text x="${PAD}" y="${ty(minEth).toFixed(1)+12}" fill="#9ab0c8" font-size="10">Ξ${minEth.toFixed(4)}</text>
    ${points.map(p=>`<circle cx="${tx(p.ts).toFixed(1)}" cy="${ty(p.eth).toFixed(1)}" r="4" fill="${p.symbol === 'WETH' ? '#d8b4fe' : '#2dd4bf'}" stroke="var(--panel)" stroke-width="2">
      <title>${new Date(p.ts).toLocaleDateString()} — Ξ${p.eth.toFixed(4)} ${p.symbol}</title>
    </circle>`).join('')}
  </svg>`;

  // Sale list below chart
  html += '<div style="margin-top:8px;display:flex;flex-direction:column;gap:4px;max-height:120px;overflow:auto">';
  for(const p of [...points].reverse()){
    const date = new Date(p.ts).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
    const saleColor = p.symbol === 'WETH' ? '#c4b5fd' : '#7dd3fc';
    html += `<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;border-bottom:1px dashed var(--chip-b)">
      <span style="color:#e6f0ff;font-weight:700">${date}</span>
      <span style="color:${saleColor};font-weight:700">Ξ ${p.eth.toFixed(4)} ${p.symbol}</span>
    </div>`;
  }
  html += '</div>';
  host.innerHTML = html;
}

/* compare + pins */
async function setCompare(slot,id){
  if(!id) return;
  if(slot==='A') pinnedA=id; else pinnedB=id;
  const box = document.getElementById('cmp'+slot);
  const row = await fetchRow(id);
  box.innerHTML = `<div style="display:grid;grid-template-columns:96px 1fr;gap:8px;align-items:flex-start">
    ${gridThumbHtml(id,row)}
    <div>
      <div style="font-weight:800;margin-bottom:4px">#${id}</div>
      ${traitsMiniHtml(row)}
    </div>
  </div>`;
}
function pinAdd(id){ if(!pinnedSet.includes(id)){ if(pinnedSet.length>=6){ alert('Max 6 pinned.'); return;} pinnedSet.push(id);} renderPinned(); }
async function renderPinned(){
  const host=$('#pinnedGrid'); host.innerHTML='';
  for(const id of pinnedSet){
    const row = await fetchRow(id);
    const card = document.createElement('div');
    card.className='token';
    card.style.gridTemplateColumns='96px 1fr';
    card.innerHTML = `${gridThumbHtml(id,row)}<div class="tmeta"><div class="idline">#${id}</div>${traitsMiniHtml(row)}</div>`;
    card.addEventListener('click', ()=>openModal(id));
    host.appendChild(card);
  }
}
document.getElementById('btnClearPinned').onclick=()=>{ pinnedSet=[]; renderPinned(); };
document.getElementById('btnExportPinned').onclick=()=>{ if(pinnedSet.length===0) return alert('Nothing pinned'); navigator.clipboard.writeText(pinnedSet.join(',')); alert('Copied: '+pinnedSet.join(',')); };
document.getElementById('btnSwap').onclick=()=>{ const t=pinnedA; pinnedA=pinnedB; pinnedB=t; setCompare('A',pinnedA||''); setCompare('B',pinnedB||''); };
document.getElementById('btnClearCompare').onclick=()=>{ pinnedA=null; pinnedB=null; $('#cmpA').innerHTML=''; $('#cmpB').innerHTML=''; };

/* live listings — force LIVE only */
async function fetchLiveForIds(ids){
  const status = document.getElementById('listingsStatus');
  // If DB listings already loaded, skip the Worker fetch — use what we have
  if(window.__LISTINGS_READY__ && window.LISTINGS && Object.keys(window.LISTINGS).length > 0){
    const found = Object.values(window.LISTINGS).filter(x => x?.opensea?.price_eth != null).length;
    status.textContent = `${found} listings found.`;
    LIVE_OK = true;
    return;
  }
  try{
    status.textContent = 'Fetching listings…';
    // Preserve existing listings — only overlay new ones
    const url = `${LIVE_ENDPOINT}/os/collection-listings?slug=${encodeURIComponent(LIVE_SLUG)}&contract=${encodeURIComponent(LIVE_CONTRACT)}&chain=ethereum`;
    const r = await fetch(url, { cache: 'no-store' });
    LIVE_OK = r.ok;
    if(!r.ok) throw new Error('HTTP '+r.status);
    const j = await r.json();
    // Worker returns { ok, listings: { tokenId: { opensea: { price, price_eth, url } } } }
    const listingsData = j.listings || j;
    // Normalize: ensure price_eth is always a proper float for every entry
    for(const [k,v] of Object.entries(listingsData)){
      if(v && v.opensea){
        v.opensea.source = 'live';
        // price_eth may already be set by worker; if not, derive from price (wei string)
        if(v.opensea.price_eth == null || v.opensea.price_eth === 0){
          v.opensea.price_eth = parseEthMaybeWei(v.opensea.price);
        }
        v.opensea.price_eth = v.opensea.price_eth != null ? Number(v.opensea.price_eth) : null;
      }
    }
    window.LISTINGS = Object.assign({}, window.LISTINGS, listingsData);
    const found = Object.values(listingsData).filter(x => x && x.opensea && x.opensea.price_eth != null).length;
    status.textContent = `${found} listing${found===1?'':'s'} found.`;
  }catch(e){
    console.warn('Live listings fetch failed', e);
    status.textContent = 'Listings fetch failed';
  }
}
document.getElementById('btnFetch').addEventListener('click', async ()=>{
  const ids = Array.from(document.querySelectorAll('#tokenGrid [data-id]')).map(n=>+n.dataset.id);
  if(ids.length===0){ document.getElementById('listingsStatus').textContent='Nothing visible to fetch.'; return; }
  const b = document.getElementById('btnFetch'); b.classList.add('go');
  await fetchLiveForIds(ids);
  await renderTokenGridFromState();
  // Re-render holders if visible to show listing thumbnails
  const holdersPanel = document.getElementById('ttab-holders');
  if(holdersPanel && holdersPanel.classList.contains('active') && typeof renderHolders === 'function'){
    renderHolders();
  }
  setTimeout(()=>b.classList.remove('go'), 800);
});

/* controls */
document.addEventListener('change', async (e)=>{
  if(e.target && e.target.name==='rarityMode'){
    const val=e.target.value;
    if(val==='theoretical' && !PROB_DATA){ alert('Add data/ocas_probabilities.json to use Theoretical mode.'); document.getElementById('rarityObserved').checked=true; return;}
    RARITY_MODE=val; await updateChartAndList();
  }
});
function resetMatchingGridDefaults(){
  const sortSel = document.getElementById('sortMode');
  if(sortSel) sortSel.value = 'id-asc';
  try{ localStorage.setItem(SORT_KEY, 'id-asc'); }catch(e){}
  // Do NOT reset view mode — user's chosen view should persist
}

function toggleLiveListingsMode(forceValue){
  const cb = document.getElementById('onlyListed');
  if(!cb) return;
  const nextChecked = typeof forceValue === 'boolean' ? forceValue : !cb.checked;
  cb.checked = nextChecked;
  const pill = document.getElementById('onlyListedPill');
  if(pill) pill.classList.toggle('pill-on', nextChecked);
  if(typeof setLiveRefresh==='function') setLiveRefresh(nextChecked);

  const sortSel = document.getElementById('sortMode');
  if(nextChecked){
    if(sortSel) sortSel.value = 'price-asc';
    // Don't persist — transient sort only applies while listings mode is active
  } else {
    resetMatchingGridDefaults();
  }

  if(typeof renderTokenGridFromState==='function') renderTokenGridFromState();
}

function clearFilters(){
  currentTraitCount=null; activeTraits.clear(); rankMin=null; rankMax=null; OPEN_GROUPS.clear();
  tokenTraitSearchQuery = '';
  const tokenSearchInput = document.getElementById('tokenTraitSearch');
  if(tokenSearchInput) tokenSearchInput.value = '';
  const jumpInput = document.getElementById('jump');
  if(jumpInput) jumpInput.value = '';
  const drawerJumpInput = document.getElementById('drawerJumpInput');
  if(drawerJumpInput) drawerJumpInput.value = '';
  updateTokenTraitSearchStatus(0);
  document.querySelectorAll('#traitChips .chip').forEach(n=>n.classList.remove('active'));
  document.getElementById('rankMin').value='';
  document.getElementById('rankMax').value='';
  resetMatchingGridDefaults();
  // Reset Live Listings toggle
  const cb = document.getElementById('onlyListed');
  if(cb && cb.checked){
    cb.checked = false;
    const pill = document.getElementById('onlyListedPill');
    if(pill) pill.classList.remove('pill-on');
    if(typeof setLiveRefresh==='function') setLiveRefresh(false);
  }
  updateChartAndList();
}
document.getElementById('btnClear').onclick=()=>{ clearFilters(); };
document.getElementById('btnClearFilters').onclick=()=>{ clearFilters(); };
const __desktopFavBtn = document.getElementById('desktopFavoritesBtn');
if(__desktopFavBtn) __desktopFavBtn.onclick = ()=>toggleFavoritesView();
const __mobileFavBtn = document.getElementById('mobileFavoritesToggle');
if(__mobileFavBtn) __mobileFavBtn.onclick = ()=>toggleFavoritesView();
syncFavoritesUI();
// onlyListed change is handled by toggleLiveListingsMode() and clearFilters
document.getElementById('traitSearch').addEventListener('input',()=>renderTraitAccordion(document.getElementById('traitSearch').value));
const __tokenTraitSearchInput = document.getElementById('tokenTraitSearch');
const __tokenTraitSearchClear = document.getElementById('tokenTraitSearchClear');
if(__tokenTraitSearchInput){
  let tokenTraitSearchDebounce = null;
  __tokenTraitSearchInput.addEventListener('input', ()=>{
    tokenTraitSearchQuery = __tokenTraitSearchInput.value || '';
    updateTokenTraitSearchStatus(null);
    clearTimeout(tokenTraitSearchDebounce);
    tokenTraitSearchDebounce = setTimeout(()=>renderTokenGridFromState(), 120);
  });
  updateTokenTraitSearchStatus(0);
}
if(__tokenTraitSearchClear) __tokenTraitSearchClear.onclick = clearTokenTraitSearch;
document.getElementById('onlyPresent').addEventListener('change',()=>renderTraitAccordion(document.getElementById('traitSearch').value));
document.getElementById('rankApply').onclick=async()=>{ const min=document.getElementById('rankMin').value?Number(document.getElementById('rankMin').value):null; const max=document.getElementById('rankMax').value?Number(document.getElementById('rankMax').value):null; rankMin=(min&&min>=1)?min:null; rankMax=(max&&max>=1)?max:null; await updateChartAndList(); };
document.getElementById('rankClear').onclick=()=>{ document.getElementById('rankMin').value=''; document.getElementById('rankMax').value=''; rankMin=null; rankMax=null; updateChartAndList(); };

/* Jump — live prefix filter as-you-type + exact jump on Enter/button */
(function(){
  const jumpInput = document.getElementById('jump');
  const btnJump   = document.getElementById('btnJump');
  let jumpDebounce = null;

  // ── Prefix filter ──────────────────────────────────────────────────────────
  // Shows only tokens whose ID starts with the typed string.
  // Also respects active trait/rarity filters (rowMatchesAll).
  async function doPrefixFilter(prefix){
    prefix = String(prefix || '').replace(/\D+/g, '');
    jumpInput.value = prefix;
    const allIds = [];
    const exact = prefix.length >= 4;
    for(const idx of indices()){
      const ch = await ensureChunk(idx);
      for(const sid of Object.keys(ch)){
        if(exact ? String(sid) === prefix : String(sid).startsWith(prefix)){
          const id = +sid;
          const row = ch[sid];
          if(rowMatchesAll(row, id) && rowMatchesTokenTraitSearch(row)) allIds.push(id);
        }
      }
    }
    allIds.sort((a,b)=>a-b);
    let finalIds = favoritesOnlyEnabled() ? allIds.filter(id => isFavorite(id)) : allIds;
    finalIds = applyConnectedOwnedFilter(finalIds);
    if(!exact) finalIds = finalIds.slice(0, 50);
    await renderTokenGrid(finalIds);
  }

  // ── Exact jump ─────────────────────────────────────────────────────────────
  // Applies a specific token ID inside the current filters.
  // Updates the URL to ?jump=ID so the link is shareable.
  async function doExactJump(){
    const raw = tokenIdSearchValue();
    jumpInput.value = raw;
    if(!raw){
      // Clear URL param when box is emptied
      history.replaceState(null, '', window.location.pathname);
      await renderTokenGridFromState();
      return;
    }
    const v = Number(raw);
    if(!Number.isFinite(v) || v <= 0) return;
    // Update URL bar - makes this link shareable and works with Discord bot
    history.replaceState(null, '', `?jump=${v}`);
    window.__TOKEN_ID_EXACT_SEARCH__ = true;
    try{
      await renderTokenGridFromState();
    } finally {
      window.__TOKEN_ID_EXACT_SEARCH__ = false;
    }

    setTimeout(()=>{
      const el = document.querySelector(`[data-id="${v}"]`);
      if(el){
        el.scrollIntoView({behavior:'smooth', block:'center'});
        el.classList.add('jump-flash');
        setTimeout(()=>el.classList.remove('jump-flash'), 1400);
      }
    }, 300);
  }

  // ── Input event — always prefix-filter as user types ──────────────────────
  jumpInput.addEventListener('input', ()=>{
    clearTimeout(jumpDebounce);
    const raw = tokenIdSearchValue();
    if(jumpInput.value !== raw) jumpInput.value = raw;
    if(!raw){
      history.replaceState(null, '', window.location.pathname); // clear ?jump= from URL
      renderTokenGridFromState(); // box cleared → restore full grid
      return;
    }
    jumpDebounce = setTimeout(()=> doPrefixFilter(raw), 80);
  });

  // ── Enter / Jump button — exact jump ──────────────────────────────────────
  jumpInput.addEventListener('keydown',(e)=>{
    if(e.key === 'Enter'){ clearTimeout(jumpDebounce); doExactJump(); }
  });
  btnJump.addEventListener('click', ()=>{ clearTimeout(jumpDebounce); doExactJump(); });

  // ── URL param: ?jump=ID (used by Discord bot TraitView links) ────────────
  // Handled separately in the init().then() block below
})();

/* quick jump scroll without waiting for full render */
function quickScrollToId(id){
  const tg = document.getElementById('tokenGrid'); if(!tg) return;
  const ids = (window.LAST_IDS || []);
  const idx = ids.indexOf(id);
  if (idx === -1) return;
  const sample = tg.querySelector('.token');
  let cellW = 180, cellH = 200, gap = 10;
  if (sample){
    const r = sample.getBoundingClientRect();
    cellW = Math.max(1, Math.round(r.width));
    cellH = Math.max(1, Math.round(r.height));
  }
  let cols = Math.max(1, Math.floor((tg.clientWidth||cellW) / (cellW+gap/2)));
  if (tg.classList.contains('list')) cols = 1;
  const row = Math.floor(idx / cols);
  tg.scrollTo({ top: row * (cellH + gap), behavior: 'smooth' });
}
/* init */
// Flag: true while background chunk loading is in progress
// Prevents background updateChartAndList() from stomping on a user-initiated
// prefix filter or jump that was set after init started
window.__INIT_LOADING__ = false;

async function init(){
  try{

    // Shared background listings bootstrap so ?jump links and normal loads behave the same
    const startBackgroundListingsLoad = () => {
      if(window.__LISTINGS_BOOTSTRAP_STARTED__) return;
      window.__LISTINGS_BOOTSTRAP_STARTED__ = true;
      setTimeout(async () => {
        try{
          const statusEl = document.getElementById('listingsStatus');
          if(statusEl) statusEl.textContent = 'Loading listings…';

          // Try DB first — single fast query
          let loaded = false;
          let found = 0;
          try{
            const data = await dbFetch('/db/listings');
            if(data.ok && data.listings?.length > 0){
              const listingsData = {};
              for(const {token_id, price_eth, url} of data.listings){
                listingsData[token_id] = {
                  opensea: { price_eth: price_eth, url, source: 'db' }
                };
              }
              window.LISTINGS = Object.assign({}, window.LISTINGS, listingsData);
              found = data.listings.length;
              if(statusEl) statusEl.textContent = `${found} listings loaded.`;
              loaded = true;
            }
          } catch(e){
            console.warn('DB listings fetch failed, falling back to Worker:', e.message);
          }

          // Fallback: OpenSea via Cloudflare Worker
          if(!loaded){
            const url = `${LIVE_ENDPOINT}/os/collection-listings?slug=${encodeURIComponent(LIVE_SLUG)}&contract=${encodeURIComponent(LIVE_CONTRACT)}&chain=ethereum`;
            const r = await fetch(url);
            if(!r.ok) throw new Error('HTTP '+r.status);
            const j = await r.json();
            const listingsData = j.listings || {};
            for(const [k,v] of Object.entries(listingsData)){
              if(v && v.opensea){
                v.opensea.source = 'live';
                if(v.opensea.price_eth == null || v.opensea.price_eth === 0){
                  v.opensea.price_eth = parseEthMaybeWei(v.opensea.price);
                }
                v.opensea.price_eth = v.opensea.price_eth != null ? Number(v.opensea.price_eth) : null;
              }
            }
            window.LISTINGS = Object.assign({}, window.LISTINGS, listingsData);
            found = Object.values(listingsData).filter(x => x?.opensea?.price_eth != null).length;
            if(statusEl) statusEl.textContent = `${found} listings loaded.`;
          } // end if(!loaded) fallback
          LIVE_OK = true;
          window.__LISTINGS_READY__ = true;
          document.dispatchEvent(new CustomEvent('traitview:listings-ready'));
          // Hide the Fetch listings button — already loaded
          const _fetchBtn = document.getElementById('btnFetch');
          if(_fetchBtn) _fetchBtn.style.display = 'none';
          // Refresh VS prices on mobile
          if(window.innerWidth <= 900 && VS.enabled) VS.refreshPrices();
          // Update trait floor bar now that listings are available
          if(typeof updateTraitFloor === 'function') updateTraitFloor();
          // Pre-build scatter data so Price vs Rank tab is instant
          window._scatterReady = true;
          // Pre-load chunks for listed tokens so Similar Listed is fast
          const listedIds = Object.keys(window.LISTINGS || {})
            .map(Number)
            .filter(id => Number.isFinite(id) && id >= 1 && id <= (TOKEN_COUNT || 10000));
          const listedChunks = new Set(listedIds.map(id => chunkIndexFor(id)));
          // Fire and forget — don't await, just warm the cache
          listedChunks.forEach(idx => {
            if(!window._CHUNK_CACHE_REF?.has(idx)) ensureChunk && ensureChunk(idx);
          });
          // Update badge on Mispriced tab
          const badge = document.getElementById('mispricedCountBadge');
          if(badge) badge.textContent = found;
          // Re-stamp mobile badges with listing prices
          if(window.innerWidth <= 900 && typeof stampMobilePrices === 'function') stampMobilePrices();
          if(window.innerWidth <= 900 && document.getElementById('tokenGrid')?.classList.contains('list')) _stampMobileListRows();
          // Refresh images for top listed tokens in background
          if(typeof _refreshListedTokenImages === 'function') _refreshListedTokenImages();

          // Re-render grid and re-apply view mode so price badges appear on all views
          if(window.innerWidth > 900 && typeof renderTokenGridFromState === 'function'){
            const _tg = document.getElementById('tokenGrid');
            if(_tg && !_tg.classList.contains('list')){
              // Full rebuild so priceBadgeHtml runs with fresh listings data
              _tg.innerHTML = '';
              await renderTokenGridFromState();
              // Re-apply view mode AFTER render to stamp overlay badges (compact/grid5)
              const _vm = localStorage.getItem('viewMode') || 'standard';
              if(typeof applyViewMode === 'function') applyViewMode(_vm);
            }
          }
          if(window.innerWidth > 900){
            const tg = document.getElementById('tokenGrid');
            if(tg && tg.classList.contains('compact') && typeof applyViewMode === 'function') applyViewMode('compact');
            // Refresh list view price cells now that listings are loaded
            if(tg && tg.classList.contains('list')){
              tg.querySelectorAll('.token[data-id]').forEach(card => {
                const id = +card.dataset.id;
                const eth = typeof getListingEth==='function' ? getListingEth(id) : null;
                const priceStr = eth!=null ? (eth>=1?eth.toFixed(3):eth.toFixed(4)) : null;
                // Update listed price cell
                const pCell = card.querySelector('[data-price-id]');
                if(pCell){ pCell.textContent = priceStr ? 'Ξ '+priceStr : 'Not listed'; pCell.className = 'vs-val '+(priceStr?'green':'muted'); }
                // Update vs-floor cell
                const fCell = card.querySelector('[data-vsfloor-id]');
                if(fCell && priceStr && window._lastFloorEth){
                  const pct = ((eth - window._lastFloorEth) / window._lastFloorEth) * 100;
                  fCell.textContent = (pct>=0?'+':'')+pct.toFixed(1)+'%';
                  fCell.className = 'vs-val '+(pct<=0?'green':pct<=20?'':'red');
                }
                // If no vs-datarow yet (rendered before listings loaded), inject it now
                if(!card.querySelector('.vs-datarow') && card.querySelector('.tmeta')){
                  const rankVal = RARITY_OBS_RANK?.get(id)||null;
                  const tmeta = card.querySelector('.tmeta');
                  if(tmeta && typeof listStatsRowHtml==='function')
                    tmeta.insertAdjacentHTML('beforeend', listStatsRowHtml(id, rankVal, priceStr));
                  tg.querySelectorAll('[data-last-sale-id]').forEach(el => typeof hydrateListMetaForId==='function' && hydrateListMetaForId(+el.dataset.lastSaleId));
                  if(typeof hydrateListOwners==='function') hydrateListOwners(tg);
                }
              });
            }
          }
          // Re-render holders (whether tab visible or not) so listing data is ready
          // Also apply trait filter if active
          if(window._holdersLoaded && window._holdersData){
            const _traits = typeof activeTraits !== 'undefined' ? activeTraits : new Map();
            if(_traits.size > 0) { if(typeof renderHoldersByTrait==='function') renderHoldersByTrait(); }
            else { if(typeof renderHolders==='function') renderHolders(); }
          }
        }catch(e){
          console.warn('Background listings fetch failed:', e.message);
          const statusEl = document.getElementById('listingsStatus');
          if(statusEl) statusEl.textContent = '';
        }
      }, 0); // load immediately
    };
    window.__ensureListingsBootstrap = startBackgroundListingsLoad;

    // Detect ?jump= immediately
    const urlParams = new URLSearchParams(window.location.search);
    const jumpId  = urlParams.get('jump');
    const jumpNum = jumpId && Number.isFinite(+jumpId) && +jumpId > 0 ? +jumpId : null;

    // ── Phase 1: manifest + fast files in parallel ────────────────────────────
    const [_, fastBundle] = await Promise.all([
      loadManifest(),
      dbFetch('/db/traits-fast').then(j => j?.ok ? j : null).catch(() => null)
    ]);

    if(fastBundle){
      // Update TOKEN_COUNT to reflect post-burn survivor count
      if(fastBundle.survivorCount && fastBundle.survivorCount > 0){
        TOKEN_COUNT = fastBundle.survivorCount;
        window.TOKEN_COUNT = TOKEN_COUNT;
      }
      if(Array.isArray(fastBundle.rank)){
        RARITY_OBS_RANK = new Map(fastBundle.rank.map(([id,_s], i) => [id, i+1]));
        // Load OS rank from Railway DB (lean endpoint, cached 1hr at CDN)
        if(OS_RANK_MAP.size === 0){
          const loadOsRanks = () => dbFetch('/db/os-ranks')
            .then(j => {
              if(j?.ok && j.ranks?.length){
                OS_RANK_MAP = new Map(j.ranks.map(([id,rank]) => [id, rank]));
                window.OS_RANK_MAP = OS_RANK_MAP;
                console.log('[OS Rank] Loaded ' + OS_RANK_MAP.size + ' tokens');
                // If a wallet connected before this finished loading, its
                // "Best" rank stat was computed with an empty OS_RANK_MAP and
                // silently fell back to TV rank -- that fallback was correct
                // behavior for the data available at the time, it just never
                // got a chance to re-run once the real OS data showed up.
                // Recompute now so it self-corrects instead of staying wrong
                // until the next full reconnect.
                if(CONNECTED_WALLET?.address && typeof buildConnectedWalletStats === 'function'){
                  buildConnectedWalletStats(CONNECTED_WALLET.address, CONNECTED_WALLET.tokenIds).then(stats => {
                    CONNECTED_WALLET.stats = stats;
                    if(typeof renderConnectedHolderPanel === 'function'){
                      renderConnectedHolderPanel(document.getElementById('connectedHolderPanel'), stats);
                      renderConnectedHolderPanel(document.getElementById('mobileConnectedHolderPanel'), stats);
                    }
                  }).catch(()=>{});
                }
              }
            }).catch(()=>{});
          loadOsRanks();
          // Survivor counts for the "Survivor" / "Survivor x2" badge (modal +
          // grid). Same fire-and-forget, cached-on-server pattern as OS ranks.
          if(SURVIVOR_COUNT_MAP.size === 0){
            const loadSurvivorCounts = () => dbFetch('/db/survivor-counts')
              .then(j => {
                if(j?.ok && j.counts){
                  SURVIVOR_COUNT_MAP = new Map(Object.entries(j.counts).map(([id,c]) => [+id, +c]));
                  window.SURVIVOR_COUNT_MAP = SURVIVOR_COUNT_MAP;
                }
              }).catch(()=>{});
            loadSurvivorCounts();
            setInterval(loadSurvivorCounts, 10 * 60 * 1000);
          }
          // Ranks now update on a rolling ~1.8-day cycle server-side (see
          // rank-sync.js) — refresh periodically so a long-lived tab doesn't
          // get stuck showing whatever ranks were live at page load forever.
          setInterval(loadOsRanks, 10 * 60 * 1000);
        }
      }
      if(fastBundle.freq){
        // Load trait frequencies from DB — used for rarity score calculation
        TRAIT_FREQ = fastBundle.freq;
      }
      if(fastBundle.domain){
        for(const [k, vals] of Object.entries(fastBundle.domain)){
          TRAIT_DOMAIN[k] = new Set(vals);
        }
        AVAILABLE_DOMAIN = Object.fromEntries(
          Object.entries(fastBundle.domain).map(([k,vals]) => [k, new Map(vals.map(v=>[v,1]))])
        );
      }
      if(fastBundle.buckets){
        MAX_TRAIT_COUNT = Math.max(0, ...Object.keys(fastBundle.buckets).map(Number));
        CHART_ID_MAP = {};
      }
      window._fastBuckets = fastBundle.buckets || {};
      window._fastIdByCount = {};
      if(fastBundle.buckets){
        for(const [n, ids] of Object.entries(fastBundle.buckets)){
          window._fastIdByCount[n] = Array.isArray(ids) ? ids : [];
        }
      }
      drawOrUpdateChart(fastBundle.buckets || {});
      renderTraitChips(fastBundle.buckets || {});
      renderTraitAccordion('');
      renderActiveChips();
    }

    // Start images in parallel, load traits from DB (live, post-burn accurate)
    const imagesPromise = loadImagesMap();
    loadProbabilities();
    window.__INIT_LOADING__ = true;
    startBackgroundListingsLoad();

    // Fetch all surviving tokens' traits from DB — replaces static chunk files.
    // Server caches for 5 min so this is fast for all visitors after the first.
    // Falls back to static chunks if DB fetch fails.
    const allTraitsPromise = dbFetch('/db/all-traits')
      .then(data => {
        if (!data?.ok || !data.tokens) throw new Error('no data');
        // Pre-warm chunk cache with live DB data
        // Group tokens by chunk index so ensureChunk() returns immediately
        const byChunk = {};
        for (const [sid, row] of Object.entries(data.tokens)) {
          const id = +sid;
          const idx = chunkIndexFor(id);
          if (!byChunk[idx]) byChunk[idx] = {};
          byChunk[idx][sid] = row;
        }
        for (const [idx, chunkData] of Object.entries(byChunk)) {
          CHUNK_CACHE.set(+idx, chunkData);
        }
        // Store burned token IDs for grid filtering
        window._BURNED_IDS = new Set();
        for (let id = 1; id <= 10000; id++) {
          if (!data.tokens[String(id)]) window._BURNED_IDS.add(id);
        }
        console.log('[TraitView] Loaded ' + Object.keys(data.tokens).length + ' live tokens from DB');
        return data;
      })
      .catch(err => {
        console.warn('[TraitView] DB traits fetch failed, falling back to chunks:', err.message);
        // Fallback: load static chunk files as before
        indices().forEach(idx => ensureChunk(idx));
        return null;
      });

    await allTraitsPromise;

    // ── ?jump= fast path ──────────────────────────────────────────────────────
    if(jumpNum){
      document.getElementById('jump').value = String(jumpNum);

      // Only load the one chunk for this token + images
      await Promise.all([ensureChunk(chunkIndexFor(jumpNum)), imagesPromise]);

      // Show ONLY this token immediately
      await renderTokenGrid([jumpNum]);

      setTimeout(()=>{
        const el = document.querySelector(`[data-id="${jumpNum}"]`);
        if(el){
          el.scrollIntoView({behavior:'smooth', block:'center'});
          el.classList.add('jump-flash');
          setTimeout(()=>el.classList.remove('jump-flash'), 1400);
        }
      }, 150);

      // Background: finish loading all chunks + build ranks
      // BUT only re-render the grid if the user hasn't typed anything
      (async ()=>{
        window.__INIT_LOADING__ = false;
        window._chunksReady = true;
        if(RARITY_OBS_RANK.size === 0 || Object.keys(TRAIT_FREQ).length === 0){
          await buildStatsAndRanks();
        }
        // Only update grid if jump box still shows this token (user hasn't changed it)
        const currentVal = document.getElementById('jump').value.trim();
        if(currentVal === String(jumpNum)){
          // Keep showing just this token — don't blast the grid with all 10k
          await renderTokenGrid([jumpNum]);
          setTimeout(()=>{
            const el = document.querySelector(`[data-id="${jumpNum}"]`);
            if(el) el.scrollIntoView({behavior:'smooth', block:'center'});
          }, 200);
        }
      });

      return;
    }

    // ── Normal load (no ?jump=) ───────────────────────────────────────────────
    await imagesPromise;

    // If fast bundle loaded ranks, render grid immediately — don't wait for chunks
    if(RARITY_OBS_RANK.size > 0){
      await updateChartAndList();

      // Data already loaded via /db/all-traits — nothing more to fetch in the background
      window.__INIT_LOADING__ = false;
      window._chunksReady = true;

    } else {
      // No fast bundle — must wait for chunks before rendering
      await updateChartAndList();
      window.__INIT_LOADING__ = false;
      window._chunksReady = true;
      await buildStatsAndRanks();
      const jumpVal = document.getElementById('jump').value.trim();
      if(!jumpVal) await updateChartAndList();
    }

    // Background listings bootstrap is started near the top of init()

    // ── Pre-load floor trend data in background ───────────────────────────────
    // Staggered 4 seconds after init — after listings fetch has started.
    // Worker caches /os/events so if user clicks Floor Trend tab it's instant.
    setTimeout(async () => {
      if(window._floorLoaded) return; // already loaded, skip
      try{
        let all = [], cursor = null;
        for(let i = 0; i < 10; i++){
          const qs = new URLSearchParams({slug: LIVE_SLUG, event_type:'sale', limit:'100'});
          if(cursor) qs.set('cursor', cursor);
          const r = await fetch(`${LIVE_ENDPOINT}/os/events?${qs}`);
          if(!r.ok) break;
          const j = await r.json();
          all = all.concat(j.events || []);
          cursor = j.next_cursor;
          if(!cursor) break;
          await new Promise(r=>setTimeout(r,60)); // reduced from 120ms
        }
        if(all.length > 0){
          window._floorEvents = all;
          window._floorLoaded = true;
          const countEl = document.getElementById('floorTransferCount');
          if(countEl) countEl.textContent = `${all.length} sales loaded`;
          // Show ready dot on tab
          const dot = document.getElementById('floorReadyDot');
          if(dot) dot.style.display = 'inline-block';
          // If floor trend tab is already open, render immediately
          const floorPanel = document.getElementById('ttab-floor');
          if(floorPanel && floorPanel.classList.contains('active')){
            renderFloorTrend();
          }
        }
      }catch(e){
        console.warn('Background floor trend fetch failed:', e.message);
      }
    }, 4000); // 4 second delay — staggered after listings

    // ── Pre-load holders data in background ──────────────────────────────────
    setTimeout(async () => {
      if(window._holdersLoaded) return;
      try{
        if(typeof loadHolders === 'function') await loadHolders(false);
      }catch(e){ console.warn('Background holders fetch failed:', e.message); }
    }, 8000); // 8 second delay — after listings and floor start

    // ── Pre-load recent sales in background ───────────────────────────────────
    setTimeout(async () => {
      try{
        if(!window.ALL_SALES?.length && typeof fetchNewest === 'function') await fetchNewest(false);
      }catch(e){ console.warn('Background sales fetch failed:', e.message); }
    }, 6000); // 6 second delay

  }catch(err){
    alert('Load failed. Make sure ./data/traits_manifest.json and chunks exist.\n\nError: '+err.message);
    console.error('Init failed:', err);
  }
}

/* View & Sort controls */
const viewSel = document.getElementById('viewMode');
const sortSel = document.getElementById('sortMode');
if (viewSel){
  const savedV = localStorage.getItem(VIEW_KEY);
  if (savedV){ viewSel.value = savedV; applyViewMode(savedV); }
  viewSel.addEventListener('change', async () => { localStorage.setItem(VIEW_KEY, viewSel.value); applyViewMode(viewSel.value); /* no re-render on view change */ });
}
if (sortSel){
  const savedS = localStorage.getItem(SORT_KEY);
  if (savedS){ sortSel.value = savedS; }
  sortSel.addEventListener('change', async ()=>{
    localStorage.setItem(SORT_KEY, sortSel.value);
    await renderTokenGridFromState();
  });
}

// ── Auto-enable live listings on page load ────────────────────────────────────
// Check onlyListed checkbox and activate pill immediately,
// but only re-render (with price-asc sort) once DB listings are ready.
(function initLiveListingsDefault(){
  const cb   = document.getElementById('onlyListed');
  const pill = document.getElementById('onlyListedPill');
  if(!cb || cb.checked) return;
  cb.checked = true;
  if(pill) pill.classList.add('pill-on');
  // Wait for listings to be ready before re-rendering with price sort
  document.addEventListener('traitview:listings-ready', () => {
    const sort = document.getElementById('sortMode');
    if(sort) sort.value = 'price-asc';
    if(typeof renderTokenGridFromState === 'function') renderTokenGridFromState();
  }, { once: true });
})();

// ── Top tab switcher (Chart / Sales / Mispriced) ─────────────────────────────
function switchTopTab(name){
  document.querySelectorAll('.top-tab').forEach(t => t.classList.toggle('active', t.dataset.ttab === name));
  document.querySelectorAll('.top-tab-panel').forEach(p => p.classList.toggle('active', p.id === 'ttab-'+name));
  if(name === 'scatter'){
    const hasListings = window.LISTINGS && Object.keys(window.LISTINGS).length > 0;
    if(hasListings){
      renderScatter(); // instant — listings already loaded
    } else {
      // Listings not ready yet — render empty state then update when ready
      const host = document.getElementById('scatterHost');
      if(host) host.innerHTML = '<div style="color:var(--sub);font-size:12px;padding:20px 0">Loading listings…</div>';
      // Load from DB instantly instead of clicking the slow Worker fetch button
      dbFetch('/db/listings').then(data => {
        if(data.ok && data.listings?.length > 0){
          if(!window.LISTINGS) window.LISTINGS = {};
          for(const {token_id, price_eth, url} of data.listings){
            window.LISTINGS[token_id] = { opensea: { price_eth, url, source: 'db' } };
          }
          LIVE_OK = true;
          const _fb = document.getElementById('btnFetch');
          if(_fb) _fb.style.display = 'none';
          renderScatter();
        }
      }).catch(() => {
        const fetchBtn = document.getElementById('btnFetch');
        if(fetchBtn) fetchBtn.click();
        setTimeout(renderScatter, 3000);
      });
    }
  }
  if(name === 'floor'){
    if(window._floorLoaded && window._floorEvents?.length){
      setTimeout(renderFloorTrend, 80);
    } else {
      loadFloorTrend(false);
    }
  }
  if(name === 'holders'){
    if(!window._holdersLoaded) loadHolders(false);
    else _applyHoldersTraitFilter(); // apply current trait filter if already loaded
  }
  if(name === 'wallet') requestWalletAnalyticsLoad(CONNECTED_WALLET?.address).catch(()=>{});
  if(name === 'burns' && typeof loadBurnsAnalytics === 'function') loadBurnsAnalytics(false).catch(()=>{});
  if(name === 'sales' && typeof fetchNewest === 'function' && !window.ALL_SALES?.length) fetchNewest(false);
  // Show/hide view toggles
  const vt = document.getElementById('salesViewToggle');
  if(vt) vt.style.display = name === 'sales' ? 'flex' : 'none';
  const mvt = document.getElementById('mispricedViewToggle');
  if(mvt) mvt.style.display = name === 'mispriced' ? 'flex' : 'none';
  // Resize chart when switching to chart tab so it fills full width
  if(name === 'chart'){
    requestAnimationFrame(()=>{
      if(typeof Plotly !== 'undefined' && document.getElementById('chartHost')){
        try{ Plotly.Plots.resize('chartHost'); }catch(_){}
      }
    });
  }
  try{ localStorage.setItem('topTab', name); }catch{}
  // Auto-fetch + build mispriced when switching to Mispriced tab
  if(name === 'mispriced'){
    // Auto-enable "Only Listed" filter when viewing mispriced
    const onlyListedCb = document.getElementById('onlyListed');
    const onlyListedPill = document.getElementById('onlyListedPill');
    if(onlyListedCb && !onlyListedCb.checked){
      onlyListedCb.checked = true;
      if(onlyListedPill) onlyListedPill.classList.add('pill-on');
      const sortSel = document.getElementById('sortMode');
      if(sortSel) sortSel.value = 'price-asc';
      try{ localStorage.setItem(SORT_KEY, 'price-asc'); }catch(e){}
    }
    const alreadyListed = window.LISTINGS ? Object.keys(window.LISTINGS).map(Number).filter(id => {
      const l = window.LISTINGS[id]; return l && l.opensea && l.opensea.price_eth != null;
    }) : [];
    if(alreadyListed.length > 0){
      // Already have listings — build immediately
      if(typeof buildMispricedPanel === 'function') buildMispricedPanel(alreadyListed);
    } else {
      // Fetch all listings directly from the collection endpoint
      const grid = document.getElementById('mispricedGrid');
      if(grid) grid.innerHTML = '<div style="color:var(--sub);font-size:12px;padding:10px 0">Fetching listings…</div>';
      (async()=>{
        try{
          // Load from Railway DB first — instant
          let listingsData = {};
          try{
            const data = await dbFetch('/db/listings');
            if(data.ok && data.listings?.length > 0){
              for(const {token_id, price_eth, url} of data.listings){
                listingsData[token_id] = { opensea: { price_eth, url, source: 'db' } };
              }
              window.LISTINGS = Object.assign({}, window.LISTINGS, listingsData);
              LIVE_OK = true;
              const _fb = document.getElementById('btnFetch'); if(_fb) _fb.style.display='none';
            }
          } catch(dbErr){
            console.warn('DB listings failed for mispriced, falling back:', dbErr.message);
            const url = LIVE_ENDPOINT+'/os/collection-listings?slug='+encodeURIComponent(LIVE_SLUG)+'&contract='+encodeURIComponent(LIVE_CONTRACT)+'&chain=ethereum';
            const r = await fetch(url, {cache:'no-store'});
            if(!r.ok) throw new Error('HTTP '+r.status);
            const j = await r.json();
            listingsData = j.listings || j;
            for(const [k,v] of Object.entries(listingsData)){
              if(v && v.opensea){
                if(v.opensea.price_eth == null || v.opensea.price_eth === 0)
                  v.opensea.price_eth = parseEthMaybeWei(v.opensea.price);
                v.opensea.price_eth = v.opensea.price_eth != null ? Number(v.opensea.price_eth) : null;
              }
            }
            window.LISTINGS = Object.assign({}, window.LISTINGS, listingsData);
          }
          // Use merged LISTINGS for building panel
          listingsData = window.LISTINGS;
          const ids = Object.keys(window.LISTINGS).map(Number).filter(id => {
            const l = window.LISTINGS[id]; return l && l.opensea && l.opensea.price_eth != null;
          });
          const badge = document.getElementById('mispricedCountBadge');
          if(badge) badge.textContent = ids.length+' listings';
          document.getElementById('listingsStatus') && (document.getElementById('listingsStatus').textContent = ids.length+' listings found.');
          if(typeof buildMispricedPanel === 'function') buildMispricedPanel(ids);
        }catch(e){
          console.warn('Mispriced fetch failed',e);
          const grid2 = document.getElementById('mispricedGrid');
          if(grid2) grid2.innerHTML = '<div style="color:var(--sub);font-size:12px;padding:10px 0">Failed to load listings. Try clicking Fetch listings button.</div>';
        }
      })();
    }
  }
}
// Always start on Trait Distribution tab (clear any saved preference)
try{ localStorage.removeItem('topTab'); }catch{}

// ── Mobile Analytics Bottom Sheet ────────────────────────────────────────────
function openMobileAnalytics(){
  if(window.innerWidth > 900) return;
  document.body.style.overscrollBehavior = 'none';
  const sheet   = document.getElementById('mobileAnalyticsSheet');
  const overlay = document.getElementById('mobileAnalyticsOverlay');
  const inner   = document.getElementById('mobileAnalyticsInner');
  if(!sheet || !inner) return;

  // Build lightweight tab UI — no DOM moves, no large elements
  const isMob = window.innerWidth <= 900;
  const tabs = isMob
    ? ['chart','sales','burns','mispriced','floor','holders','wallet']
    : ['chart','sales','burns','mispriced','scatter','floor','holders','wallet'];
  const labels = {chart:'Traits',sales:'Sales',mispriced:'Mispriced',scatter:'Price vs Rank',floor:'Floor Trend',holders:'Holders',wallet:'Wallet',burns:'Burns'};
  const curActive = document.querySelector('.top-tab.active')?.dataset?.ttab || 'chart';

  // Reset inner to just the skeleton — no panel content yet
  inner.innerHTML =
    `<div style="display:flex;overflow-x:auto;gap:4px;padding:4px 0 8px;scrollbar-width:none;-webkit-overflow-scrolling:touch" id="analyticsSheetTabs">` +
    tabs.map(t =>
      `<button data-stab="${t}" onclick="switchAnalyticsSheetTab('${t}')" style="flex-shrink:0;padding:7px 12px;border-radius:8px;border:1px solid rgba(255,255,255,${t===curActive?'.3':'.1'});background:rgba(255,255,255,${t===curActive?'.1':'.04'});color:${t===curActive?'var(--text)':'var(--sub)'};font-size:12px;font-weight:600;cursor:pointer;font-family:'Space Grotesk',sans-serif;white-space:nowrap">${labels[t]}</button>`
    ).join('') +
    `</div>` +
    `<div id="analyticsSheetBody" style="flex:1;overflow:visible;min-height:0;padding:4px 0"></div>`;

  // Clear any inline transform from previous session, reset to hidden via class
  sheet.style.transform = '';
  sheet.style.transition = '';
  sheet.classList.remove('open');
  sheet.offsetHeight; // force reflow so browser registers the non-open state

  // Now animate in
  sheet.classList.add('open');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('mbbAnalytics')?.classList.add('active');

  // Load panel content after transition completes
  setTimeout(() => switchAnalyticsSheetTab(curActive), 310);
}

function switchAnalyticsSheetTab(name){
  // Update tab button styles
  document.querySelectorAll('#analyticsSheetTabs button').forEach(b => {
    const active = b.dataset.stab === name;
    b.style.background = active ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.04)';
    b.style.borderColor = active ? 'rgba(255,255,255,.3)' : 'rgba(255,255,255,.1)';
    b.style.color = active ? 'var(--text)' : 'var(--sub)';
  });

  const body = document.getElementById('analyticsSheetBody');
  if(!body) return;

  const tabs = ['chart','sales','burns','mispriced','scatter','floor','holders','wallet'];
  const topTabPanel = document.getElementById('topTabPanel');

  // First: return any currently shown panel back to topTabPanel
  tabs.forEach(t => {
    const p = document.getElementById('ttab-' + t);
    if(p && body.contains(p)){
      p.style.display = 'none';
      if(topTabPanel){
        const ci = topTabPanel.querySelector('.c-body-inner');
        if(ci) ci.appendChild(p);
      }
    }
  });

  // Now move the requested panel into the sheet
  const panel = document.getElementById('ttab-' + name);
  if(!panel) return;
  panel.style.display = 'block';
  body.appendChild(panel);

  // Trigger data load and constrain chart sizes for mobile sheet
  const sheetW = document.getElementById('mobileAnalyticsSheet')?.clientWidth || window.innerWidth;

  if(name === 'chart'){
    // Constrain chart host height for mobile
    const ch = document.getElementById('chartHost');
    if(ch) ch.style.height = '240px';
    setTimeout(()=>{ try{ Plotly.Plots.resize('chartHost'); }catch(e){} }, 100);
  }
  if(name === 'floor'){
    const fh = document.getElementById('floorTrendHost');
    if(fh) fh.style.height = '240px';
    if(!window._floorLoaded || !window._floorEvents?.length){
      loadFloorTrend(false);
    } else {
      setTimeout(renderFloorTrend, 80);
    }
  }
  if(name === 'scatter'){
    const sh = document.getElementById('scatterHost');
    if(sh) sh.style.height = '240px';
    const hasL = window.LISTINGS && Object.keys(window.LISTINGS).length > 0;
    if(hasL) setTimeout(renderScatter, 50);
    setTimeout(()=>{ try{ Plotly.Plots.resize('scatterHost'); }catch(e){} }, 300);
  }
  if(name === 'holders' && !window._holdersLoaded) loadHolders(false);
  else if(name === 'holders' && window._holdersLoaded) renderHolders();
  if(name === 'wallet') requestWalletAnalyticsLoad(CONNECTED_WALLET?.address).catch(()=>{});
  if(name === 'burns' && typeof loadBurnsAnalytics === 'function') loadBurnsAnalytics(false).catch(()=>{});
  if(name === 'sales' && typeof fetchNewest === 'function' && !window.ALL_SALES?.length) fetchNewest(false);
  if(name === 'mispriced'){
    // Auto-trigger listings fetch for mispriced tab
    const alreadyListed = window.LISTINGS ? Object.keys(window.LISTINGS).map(Number).filter(id => {
      const l = window.LISTINGS[id]; return l && l.opensea && l.opensea.price_eth != null;
    }) : [];
    if(alreadyListed.length > 0){
      if(typeof buildMispricedPanel === 'function') buildMispricedPanel(alreadyListed);
    } else {
      // Auto-fetch listings without requiring the pill click
      dbFetch('/db/listings').then(data => {
        if(data.ok && data.listings?.length > 0){
          if(!window.LISTINGS) window.LISTINGS = {};
          for(const {token_id, price_eth, url} of data.listings){
            window.LISTINGS[token_id] = { opensea: { price_eth, url, source: 'db' } };
          }
          LIVE_OK = true;
          const listed = Object.keys(window.LISTINGS).map(Number).filter(id => window.LISTINGS[id]?.opensea?.price_eth != null);
          if(typeof buildMispricedPanel === 'function') buildMispricedPanel(listed);
        }
      }).catch(()=>{});
    }
  }
}

function closeMobileAnalytics(){
  document.body.style.overscrollBehavior = '';
  // Restore any moved panels back to #topTabPanel
  const tabPanel = document.getElementById('topTabPanel');
  const body = document.getElementById('analyticsSheetBody');
  if(tabPanel){
    ['chart','sales','burns','mispriced','scatter','floor','holders','wallet'].forEach(name => {
      const p = document.getElementById('ttab-' + name);
      if(p && (!tabPanel.contains(p))){
        const inner = tabPanel.querySelector('.c-body-inner');
        if(inner) inner.appendChild(p);
        p.style.display = '';
      }
    });
  }
  document.getElementById('mobileAnalyticsSheet')?.classList.remove('open');
  document.getElementById('mobileAnalyticsOverlay')?.classList.remove('open');
  document.body.style.overflow = '';
  document.getElementById('mbbAnalytics')?.classList.remove('active');
}

// Switch tabs inside the bottom sheet — mirrors switchTopTab but targets sheet clones
function switchTopTabInSheet(name){
  const sheet = document.getElementById('mobileAnalyticsInner');
  if(!sheet) return;
  sheet.querySelectorAll('.top-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.ttab === name);
    btn.setAttribute('onclick', `switchTopTabInSheet('${btn.dataset.ttab}')`);
  });
  sheet.querySelectorAll('.top-tab-panel').forEach(p => {
    p.classList.toggle('active', p.id === 'ttab-' + name);
  });
  // Trigger data load for the active tab
  if(name === 'floor' && (!window._floorLoaded || !window._floorEvents?.length)) loadFloorTrend(false);
  if(name === 'holders' && !window._holdersLoaded) loadHolders(false);
  if(name === 'wallet') requestWalletAnalyticsLoad(CONNECTED_WALLET?.address).catch(()=>{});
  if(name === 'burns' && typeof loadBurnsAnalytics === 'function') loadBurnsAnalytics(false).catch(()=>{});
  if(name === 'scatter'){
    const hasListings = window.LISTINGS && Object.keys(window.LISTINGS).length > 0;
    if(hasListings) setTimeout(renderScatter, 100);
  }
  if(name === 'sales' && typeof fetchNewest === 'function' && !window.ALL_SALES?.length) fetchNewest(false);
}

// ── Mobile View Cycle ─────────────────────────────────────────────────────────
// Cycles: standard (2×2) → compact (3×3) → list → standard
const _mobileViews = ['standard', 'list'];
const _mobileViewLabels = { standard: '2×2', list: 'List' };
const _mobileViewIcons = {
  standard: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  list:     '<line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><rect x="3" y="4" width="4" height="4" rx="1"/><rect x="3" y="10" width="4" height="4" rx="1"/><rect x="3" y="16" width="4" height="4" rx="1"/>'
};

function mobileCycleView(){
  if(window.innerWidth > 900) return;
  const cur = localStorage.getItem('viewMode') || 'standard';
  const idx = _mobileViews.indexOf(cur);
  const next = _mobileViews[(idx + 1) % _mobileViews.length];
  applyViewMode(next);
  localStorage.setItem('viewMode', next);
  localStorage.setItem('mobileViewMode', next); // separate from desktop prefs
  _updateMobileViewBtn(next);
  // Re-init virtual scroller with new mode
  if(VS.enabled && VS.ids.length){
    VS.init(VS.ids, next === 'list' ? 'list' : 'grid');
  }
  if(window.innerWidth <= 900){
    // Only re-stamp if switching TO list (needs data rows) or FROM list (needs badges)
    const prev = _mobileViews[((_mobileViews.indexOf(next) - 1 + _mobileViews.length) % _mobileViews.length)];
    if(next === 'list' || prev === 'list'){
      requestAnimationFrame(()=>{
        stampMobileBadges();
        if(next === 'list') _stampMobileListRows();
      });
    }
  }
}

function _updateMobileViewBtn(mode){
  const lbl  = document.getElementById('mbbGridLabel');
  const icon = document.getElementById('mbbGridIcon');
  if(lbl)  lbl.textContent = _mobileViewLabels[mode] || mode;
  if(icon) icon.innerHTML  = _mobileViewIcons[mode] || icon.innerHTML;
}

// ── Mobile List View — horizontal scroll data row ─────────────────────────────
function _stampMobileListRows(){
  if(window.innerWidth > 900) return;
  const tg = document.getElementById('tokenGrid');
  if(!tg || !tg.classList.contains('list')) return;

  // Build last-sale lookup from floor events (if loaded) — O(n) once
  const lastSaleMap = new Map();
  if(window._floorEvents?.length){
    for(const ev of window._floorEvents){
      const eid = parseInt(ev.nft?.identifier || ev.token_id || 0);
      if(!eid || lastSaleMap.has(eid)) continue;
      const wei = ev.payment?.quantity;
      const eth = wei ? (Number(wei) / 1e18) : ev.price_eth;
      if(eth > 0) lastSaleMap.set(eid, eth >= 1 ? eth.toFixed(3) : eth.toFixed(4));
    }
  }

  tg.querySelectorAll('.token').forEach(card => {
    const id = +card.dataset.id;
    if(!id) return;
    card.querySelector('.mobile-list-datarow')?.remove();

    const rank    = RARITY_OBS_RANK.get(id);
    const listing = window.LISTINGS?.[id]?.opensea;
    const price   = listing?.price_eth;
    const priceStr = price != null ? (price >= 1 ? price.toFixed(3) : price.toFixed(4)) : null;
    const lastSale = lastSaleMap.get(id) || null;
    const row = ROW_CACHE.get(id);

    const cells = [
      { label: 'Rank',
        value: rank ? '#' + rank.toLocaleString() : '—',
        cls: rank && rank <= 1000 ? 'purple' : rank && rank <= 3000 ? 'green' : '' },
      { label: 'Price',
        value: priceStr ? 'Ξ ' + priceStr : 'Not listed',
        cls: priceStr ? 'green' : 'muted' },
      { label: 'Last Sale',
        value: lastSale ? 'Ξ ' + lastSale : '—',
        cls: lastSale ? '' : 'muted' },
    ];

    card.insertAdjacentHTML('beforeend',
      '<div class="mobile-list-datarow">' +
      cells.map(c =>
        '<div class="mobile-list-datacell">' +
        '<div class="dcLabel">' + c.label + '</div>' +
        '<div class="dcValue ' + c.cls + '">' + c.value + '</div>' +
        '</div>'
      ).join('') +
      '</div>'
    );
  });
}

// Init mobile view button state on load
if(window.innerWidth <= 900){
  // Only allow standard or list on mobile
  let mobileView = localStorage.getItem('mobileViewMode') || 'standard';
  if(!['standard','list'].includes(mobileView)) mobileView = 'standard';
  localStorage.setItem('viewMode', mobileView);
  localStorage.setItem('mobileViewMode', mobileView);
  _updateMobileViewBtn(mobileView);
}

// ── Mobile Wallet Drawer ─────────────────────────────────────────────────────
function openMobileWalletDrawer(addr){
  const drawer  = document.getElementById('mobileWalletDrawer');
  const overlay = document.getElementById('mobileWalletOverlay');
  if(!drawer) return;
  if(typeof closeMobileHolderDrawer === 'function') closeMobileHolderDrawer();
  drawer.classList.add('open');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('mbbWallet')?.classList.add('active');
  if(addr){
    const inp = document.getElementById('mobileWalletInput');
    if(inp) inp.value = addr;
    setTimeout(mobileWalletLookup, 100);
  }
  if(CONNECTED_WALLET?.address) requestWalletAnalyticsLoad(CONNECTED_WALLET.address, { allowHiddenFetch:true }).catch(()=>{});
}

function closeMobileWalletDrawer(){
  document.getElementById('mobileWalletDrawer')?.classList.remove('open');
  document.getElementById('mobileWalletOverlay')?.classList.remove('open');
  document.body.style.overflow = '';
  document.getElementById('mbbWallet')?.classList.remove('active');
}

function openMobileHolderDrawer(){
  const drawer  = document.getElementById('mobileHolderDrawer');
  const overlay = document.getElementById('mobileHolderOverlay');
  if(!drawer) return;
  closeMobileWalletDrawer();
  drawer.classList.add('open');
  overlay?.classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('mbbHolder')?.classList.add('active');
  const empty = document.getElementById('mobileHolderEmpty');
  if(empty) empty.style.display = CONNECTED_WALLET?.address ? 'none' : 'block';
  if(CONNECTED_WALLET?.stats){
    renderConnectedHolderPanel(document.getElementById('mobileConnectedHolderPanel'), CONNECTED_WALLET.stats);
  }
  if(CONNECTED_WALLET?.address) requestWalletAnalyticsLoad(CONNECTED_WALLET.address).catch(()=>{});
}

function closeMobileHolderDrawer(){
  document.getElementById('mobileHolderDrawer')?.classList.remove('open');
  document.getElementById('mobileHolderOverlay')?.classList.remove('open');
  document.body.style.overflow = '';
  document.getElementById('mbbHolder')?.classList.remove('active');
}

// Also wire openMobileWallet alias used by VS owner click
function openMobileWallet(addr){ openMobileWalletDrawer(addr); }

async function mobileWalletLookup(){
  const addr = (document.getElementById('mobileWalletInput')?.value || '').trim();
  if(!addr || addr.length < 10) return;
  const status = document.getElementById('mobileWalletStatus');
  const grid   = document.getElementById('mobileWalletGrid');
  const holderTags = document.getElementById('mobileWalletHolderTags');
  if(status) status.textContent = 'Loading…';
  if(grid)   grid.innerHTML = '';
  if(holderTags){ holderTags.innerHTML = ''; holderTags.style.display = 'none'; }

  try{
    const r = await fetch(`${LIVE_ENDPOINT}/nft/wallet?address=${encodeURIComponent(addr)}&contract=${encodeURIComponent(LIVE_CONTRACT)}`);
    const j = r.ok ? await r.json() : null;
    let ids = (j?.tokenIds || []).filter(id => id >= 1 && id <= 10000);
    ids = [...new Set(ids)];

    if(!ids.length){
      if(status) status.textContent = 'No OCAS tokens found.';
      return;
    }

    // Sort by rank
    ids.sort((a,b) => {
      const ra = RARITY_OBS_RANK.get(a) || 99999;
      const rb = RARITY_OBS_RANK.get(b) || 99999;
      return ra - rb;
    });

    const listed = ids.filter(id => window.LISTINGS?.[id]?.opensea?.price_eth != null);
    const lowestListed = listed.length ? listed.reduce((a,b) => {
      return (window.LISTINGS[a].opensea.price_eth < window.LISTINGS[b].opensea.price_eth) ? a : b;
    }) : null;
    const lowestPrice = lowestListed ? window.LISTINGS[lowestListed].opensea.price_eth : null;

    if(status) status.textContent =
      `${ids.length} tokens${listed.length ? ` • ${listed.length} listed` : ''}` +
      (lowestPrice ? ` • Floor Ξ ${lowestPrice.toFixed(4)}` : '');

    // Store ids for sort and render
    window._mobileWalletIds = ids;
    hydrateHolderTags(addr, ids, 'mobileWalletHolderTags');
    if(grid) _renderMobileWalletGrid(ids, grid);

  } catch(e){
    console.error('mobileWalletLookup error:', e);
    if(status) status.textContent = 'Error: ' + (e.message || 'failed');
  }
}

function _renderMobileWalletGrid(ids, grid){
  grid.innerHTML = '';
  const frag = document.createDocumentFragment();
  for(const id of ids){
    const price = window.LISTINGS?.[id]?.opensea?.price_eth;
    const priceStr = price != null ? (price >= 1 ? price.toFixed(3) : price.toFixed(4)) : null;
    const imgSrc = VS._imgSrc ? VS._imgSrc(id) : imgForId(id);
    const card = document.createElement('div');
    card.style.cssText = 'position:relative;border-radius:8px;overflow:hidden;cursor:pointer;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);aspect-ratio:1/1';
    card.innerHTML =
      (imgSrc ? `<img src="${imgSrc}" loading="eager" decoding="async" fetchpriority="high" style="width:100%;height:100%;object-fit:contain;image-rendering:auto;display:block;backface-visibility:hidden;-webkit-backface-visibility:hidden">` : '') +
      `<div style="position:absolute;top:3px;left:3px;background:rgba(0,0,0,.82);font-size:8px;font-weight:700;padding:2px 4px;border-radius:3px">${displayRankHtml(id)}</div>` +
      `<div style="position:absolute;bottom:3px;left:3px;background:rgba(0,0,0,.82);color:#e6edf7;font-size:8px;font-weight:700;padding:2px 4px;border-radius:3px">#${id}</div>` +
      (priceStr ? `<div style="position:absolute;top:3px;right:3px;background:rgba(0,0,0,.82);color:#2dd4bf;font-size:8px;font-weight:700;padding:2px 4px;border-radius:3px">Ξ${priceStr}</div>` : '');
    card.addEventListener('click', () => { closeMobileWalletDrawer(); openModal(id); });
    frag.appendChild(card);
  }
  grid.appendChild(frag);
}

function mobileWalletSort(mode){
  document.querySelectorAll('[data-mwsort]').forEach(b => b.classList.toggle('active', b.dataset.mwsort === mode));
  const grid = document.getElementById('mobileWalletGrid');
  if(!grid || !window._mobileWalletIds) return;
  let ids = [...window._mobileWalletIds];
  if(mode === 'rank'){
    ids.sort((a,b) => (RARITY_OBS_RANK.get(a)||99999) - (RARITY_OBS_RANK.get(b)||99999));
  } else if(mode === 'listed'){
    ids.sort((a,b) => {
      const al = window.LISTINGS?.[a]?.opensea?.price_eth != null ? 1 : 0;
      const bl = window.LISTINGS?.[b]?.opensea?.price_eth != null ? 1 : 0;
      if(al !== bl) return bl - al;
      return (RARITY_OBS_RANK.get(a)||99999) - (RARITY_OBS_RANK.get(b)||99999);
    });
  } else if(mode === 'price-asc'){
    ids.sort((a,b) => (window.LISTINGS?.[a]?.opensea?.price_eth ?? Infinity) - (window.LISTINGS?.[b]?.opensea?.price_eth ?? Infinity));
  } else {
    ids.sort((a,b) => a - b);
  }
  _renderMobileWalletGrid(ids, grid);
}

// ══════════════════════════════════════════════════════════════════════════
// Desktop Wallet Drawer — non-modal, right-side, stays open while browsing.
// Persists last address + open state in localStorage.
// ══════════════════════════════════════════════════════════════════════════

// Universal wallet-click handler — call this anywhere an address is clickable.
// Routes to the mobile drawer on small screens, desktop drawer otherwise.
function openWalletView(addr){
  if(!addr) return;
  const modal = document.getElementById('modal');
  if(modal) modal.style.display = 'none';
  if(window.innerWidth <= 1100 && typeof openMobileWalletDrawer === 'function'){
    openMobileWalletDrawer(addr);
    return;
  }
  toggleWalletDrawer(true);
  const input = document.getElementById('desktopWalletInput');
  if(input){ input.value = addr; }
  desktopWalletLookup();
}

function toggleWalletDrawer(forceState){
  const drawer = document.getElementById('desktopWalletDrawer');
  if(!drawer) return;
  const shouldOpen = forceState !== undefined ? forceState : !drawer.classList.contains('open');
  drawer.classList.toggle('open', shouldOpen);
  document.body.classList.toggle('wallet-drawer-open', shouldOpen);
  try{ localStorage.setItem('walletDrawerOpen', shouldOpen ? '1' : '0'); }catch{}

  if(shouldOpen){
    // Restore last-viewed address if the drawer is empty
    const input = document.getElementById('desktopWalletInput');
    if(input && !input.value){
      const saved = (function(){ try{ return localStorage.getItem('walletDrawerAddress') || ''; }catch{ return ''; } })();
      const fallback = saved || CONNECTED_WALLET?.address || '';
      if(fallback){ input.value = fallback; desktopWalletLookup(); }
    }
  }
}

async function desktopWalletLookup(){
  const addr = (document.getElementById('desktopWalletInput')?.value || '').trim();
  if(!addr || addr.length < 10) return;
  try{ localStorage.setItem('walletDrawerAddress', addr); }catch{}

  const status = document.getElementById('desktopWalletStatus');
  const grid   = document.getElementById('desktopWalletGrid');
  const holderTags = document.getElementById('desktopWalletHolderTags');
  if(status) status.textContent = 'Loading…';
  if(grid)   grid.innerHTML = '';
  if(holderTags){ holderTags.innerHTML = ''; holderTags.style.display = 'none'; }

  try{
    const r = await fetch(`${LIVE_ENDPOINT}/nft/wallet?address=${encodeURIComponent(addr)}&contract=${encodeURIComponent(LIVE_CONTRACT)}`);
    const j = r.ok ? await r.json() : null;
    let ids = (j?.tokenIds || []).filter(id => id >= 1 && id <= 10000);
    ids = [...new Set(ids)];

    if(!ids.length){
      if(status) status.textContent = 'No OCAS tokens found.';
      updateWalletIndicator(false);
      return;
    }

    ids.sort((a,b) => (RARITY_OBS_RANK.get(a)||99999) - (RARITY_OBS_RANK.get(b)||99999));

    const listed = ids.filter(id => window.LISTINGS?.[id]?.opensea?.price_eth != null);
    const lowestListed = listed.length ? listed.reduce((a,b) => {
      return (window.LISTINGS[a].opensea.price_eth < window.LISTINGS[b].opensea.price_eth) ? a : b;
    }) : null;
    const lowestPrice = lowestListed ? window.LISTINGS[lowestListed].opensea.price_eth : null;

    if(status) status.textContent =
      `${ids.length} tokens${listed.length ? ` • ${listed.length} listed` : ''}` +
      (lowestPrice ? ` • Floor Ξ ${lowestPrice.toFixed(4)}` : '');

    window._desktopWalletIds = ids;
    window._desktopWalletIdsFiltered = ids;
    hydrateHolderTags(addr, ids, 'desktopWalletHolderTags');
    _renderDesktopWalletGrid(ids, grid);
    updateWalletIndicator(true);

  } catch(e){
    console.error('desktopWalletLookup error:', e);
    if(status) status.textContent = 'Error: ' + (e.message || 'failed');
  }
}

function updateWalletIndicator(hasWallet){
  const btn = document.getElementById('viewWalletBtn');
  if(btn) btn.classList.toggle('has-wallet', !!hasWallet);
}

function clearDesktopWallet(){
  document.getElementById('desktopWalletInput').value = '';
  document.getElementById('desktopWalletTraitSearch').value = '';
  document.getElementById('desktopWalletStatus').textContent = '';
  document.getElementById('desktopWalletGrid').innerHTML = '';
  document.getElementById('desktopWalletHolderTags').innerHTML = '';
  window._desktopWalletIds = null;
  window._desktopWalletIdsFiltered = null;
  try{ localStorage.removeItem('walletDrawerAddress'); }catch{}
  updateWalletIndicator(false);
}

function _renderDesktopWalletGrid(ids, grid){
  grid = grid || document.getElementById('desktopWalletGrid');
  if(!grid) return;
  grid.innerHTML = '';
  const frag = document.createDocumentFragment();
  for(const id of ids){
    const price = window.LISTINGS?.[id]?.opensea?.price_eth;
    const priceStr = price != null ? (price >= 1 ? price.toFixed(3) : price.toFixed(4)) : null;
    const imgSrc = VS._imgSrc ? VS._imgSrc(id) : imgForId(id);
    const card = document.createElement('div');
    card.style.cssText = 'position:relative;border-radius:8px;overflow:hidden;cursor:pointer;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);aspect-ratio:1/1';
    card.innerHTML =
      (imgSrc ? `<img src="${imgSrc}" loading="eager" decoding="async" fetchpriority="high" style="width:100%;height:100%;object-fit:contain;image-rendering:auto;display:block;backface-visibility:hidden;-webkit-backface-visibility:hidden">` : '') +
      `<div style="position:absolute;top:3px;left:3px;background:rgba(0,0,0,.82);font-size:8px;font-weight:700;padding:2px 4px;border-radius:3px">${displayRankHtml(id)}</div>` +
      `<div style="position:absolute;bottom:3px;left:3px;background:rgba(0,0,0,.82);color:#e6edf7;font-size:8px;font-weight:700;padding:2px 4px;border-radius:3px">#${id}</div>` +
      (priceStr ? `<div style="position:absolute;top:3px;right:3px;background:rgba(0,0,0,.82);color:#2dd4bf;font-size:8px;font-weight:700;padding:2px 4px;border-radius:3px">Ξ${priceStr}</div>` : '');
    card.addEventListener('click', () => { openModal(id); });
    frag.appendChild(card);
  }
  grid.appendChild(frag);
}

function desktopWalletSort(mode){
  document.querySelectorAll('[data-dwsort]').forEach(b => b.classList.toggle('active', b.dataset.dwsort === mode));
  const grid = document.getElementById('desktopWalletGrid');
  const source = window._desktopWalletIdsFiltered || window._desktopWalletIds;
  if(!grid || !source) return;
  let ids = [...source];
  if(mode === 'rank'){
    ids.sort((a,b) => (RARITY_OBS_RANK.get(a)||99999) - (RARITY_OBS_RANK.get(b)||99999));
  } else if(mode === 'listed'){
    ids.sort((a,b) => {
      const al = window.LISTINGS?.[a]?.opensea?.price_eth != null ? 1 : 0;
      const bl = window.LISTINGS?.[b]?.opensea?.price_eth != null ? 1 : 0;
      if(al !== bl) return bl - al;
      return (RARITY_OBS_RANK.get(a)||99999) - (RARITY_OBS_RANK.get(b)||99999);
    });
  } else if(mode === 'price-asc'){
    ids.sort((a,b) => (window.LISTINGS?.[a]?.opensea?.price_eth ?? Infinity) - (window.LISTINGS?.[b]?.opensea?.price_eth ?? Infinity));
  } else {
    ids.sort((a,b) => a - b);
  }
  _renderDesktopWalletGrid(ids, grid);
}

// Simple comma/space-separated trait filter — matches token traits against
// typed terms, e.g. "zombie, gold chain" filters to tokens matching either.
function filterDesktopWalletByTrait(){
  const raw = (document.getElementById('desktopWalletTraitSearch')?.value || '').trim().toLowerCase();
  const source = window._desktopWalletIds;
  const grid = document.getElementById('desktopWalletGrid');
  if(!source || !grid) return;

  if(!raw){
    window._desktopWalletIdsFiltered = source;
    _renderDesktopWalletGrid(source, grid);
    return;
  }

  const terms = raw.split(',').map(t => t.trim()).filter(Boolean);
  const filtered = source.filter(id => {
    const ch = CHUNK_CACHE.get(chunkIndexFor(id));
    const row = ch?.[String(id)];
    const traits = row?.traits || {};
    const traitValues = Object.values(traits).map(v => String(v).toLowerCase());
    const traitKeys = Object.keys(traits).map(k => String(k).toLowerCase());
    return terms.some(term =>
      traitValues.some(v => v.includes(term)) || traitKeys.some(k => k.includes(term))
    );
  });

  window._desktopWalletIdsFiltered = filtered;
  _renderDesktopWalletGrid(filtered, grid);

  const status = document.getElementById('desktopWalletStatus');
  if(status) status.textContent = `${filtered.length} of ${source.length} tokens match`;
}

// Restore drawer open state on page load
(function(){
  try{
    const wasOpen = localStorage.getItem('walletDrawerOpen') === '1';
    const hadAddr = !!localStorage.getItem('walletDrawerAddress');
    if(hadAddr) updateWalletIndicator(true);
    if(wasOpen && window.innerWidth > 1100){
      setTimeout(() => toggleWalletDrawer(true), 300); // slight delay so RARITY_OBS_RANK is ready
    }
  }catch{}
})();

// ── Active filter pills (jump + traits) above grid ───────────────────────────
function updateActivePills(){
  const container = document.getElementById('activeMobilePills');
  if(!container) return;
  container.innerHTML = '';

  // Jump pill — check both real jump input and drawer jump input
  const jumpVal = (document.getElementById('jump')?.value || document.getElementById('drawerJumpInput')?.value || '').trim();
  if(jumpVal){
    const pill = document.createElement('span');
    pill.style.cssText = 'display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:999px;background:rgba(124,92,255,.2);border:1px solid rgba(124,92,255,.4);color:#d8b4fe;font-size:12px;font-weight:600';
    const xBtn = document.createElement('span');
    xBtn.textContent = '×';
    xBtn.style.cssText = 'font-size:15px;line-height:1;opacity:.7;cursor:pointer';
    xBtn.addEventListener('click', e => {
      e.stopPropagation();
      // Clear both jump inputs
      ['jump','drawerJumpInput'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = '';
      });
      // Re-render grid without jump filter
      if(typeof renderTokenGridFromState === 'function') renderTokenGridFromState();
      updateActivePills();
    });
    pill.appendChild(document.createTextNode('#' + jumpVal + ' '));
    pill.appendChild(xBtn);
    container.appendChild(pill);
  }

  // Active trait pills
  if(typeof activeTraits !== 'undefined'){
    for(const [name, vals] of activeTraits){
      for(const val of vals){
        const pill = document.createElement('span');
        pill.style.cssText = 'display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:999px;background:rgba(45,212,191,.15);border:1px solid rgba(45,212,191,.3);color:#2dd4bf;font-size:12px;font-weight:600';
        const xBtn = document.createElement('span');
        xBtn.textContent = '×';
        xBtn.style.cssText = 'font-size:15px;line-height:1;opacity:.7;cursor:pointer';
        xBtn.addEventListener('click', e => {
          e.stopPropagation();
          const s = activeTraits.get(name);
          if(s){ s.delete(val); if(!s.size) activeTraits.delete(name); }
          if(typeof updateChartAndList === 'function') updateChartAndList();
          updateActivePills();
        });
        pill.appendChild(document.createTextNode(name + ': ' + val + ' '));
        pill.appendChild(xBtn);
        container.appendChild(pill);
      }
    }
  }

  container.style.display = container.children.length ? 'flex' : 'none';
}

// Hook pills into jump + trait changes
(function(){
  // Watch both the real jump input and the drawer jump input
  ['jump', 'drawerJumpInput'].forEach(id => {
    const el = document.getElementById(id);
    if(el){
      el.addEventListener('input', updateActivePills);
      el.addEventListener('change', updateActivePills);
    }
  });
  // Also watch the drawerJumpBtn
  const drawerBtn = document.getElementById('drawerJumpBtn');
  if(drawerBtn) drawerBtn.addEventListener('click', () => setTimeout(updateActivePills, 100));

  const origRender = window.renderActiveChips;
  window.renderActiveChips = function(){
    if(origRender) origRender.apply(this, arguments);
    updateActivePills();
  };
  const clearBtn = document.getElementById('btnClear');
  if(clearBtn) clearBtn.addEventListener('click', ()=> setTimeout(updateActivePills, 50));
})();

// ── Drag-to-close gestures for all drawers ────────────────────────────────────
(function(){

  // ── Wallet drawer: RIGHT to close ──────────────────────────────────────────
  // Wallet has no child touch-action conflicts so element-level listeners work fine
  (function(){
    const el = document.getElementById('mobileWalletDrawer');
    if(!el) return;
    let sx = 0, sy = 0, delta = 0, active = false;
    el.addEventListener('touchstart', e => {
      sx = e.touches[0].clientX; sy = e.touches[0].clientY;
      delta = 0; active = false;
      el.style.transition = 'none';
    }, {passive:true});
    el.addEventListener('touchmove', e => {
      const dx = e.touches[0].clientX - sx;
      const dy = Math.abs(e.touches[0].clientY - sy);
      if(!active){
        if(Math.abs(dx) < 6 && dy < 6) return;
        if(dy > Math.abs(dx)) return;
        active = true;
      }
      if(dx > 0){
        delta = dx;
        el.style.transform = `translateX(${dx}px)`;
        e.preventDefault();
      }
    }, {passive:false});
    el.addEventListener('touchend', () => {
      el.style.transition = '';
      el.style.transform = '';
      if(delta > el.offsetWidth * 0.35) closeMobileWalletDrawer();
      delta = 0; active = false;
    }, {passive:true});
    el.addEventListener('touchcancel', () => {
      el.style.transition = ''; el.style.transform = '';
      delta = 0; active = false;
    }, {passive:true});
  })();

  // ── Filter drawer: LEFT to close ───────────────────────────────────────────
  // Child elements have touch-action:pan-y!important which blocks horizontal touch events
  // on the element itself. Use document-level listeners, only active when drawer is open.
  (function(){
    const el = document.querySelector('#filtersColumn');
    if(!el) return;
    let sx = 0, sy = 0, delta = 0, active = false, tracking = false;

    document.addEventListener('touchstart', e => {
      if(!el.classList.contains('drawer-open')) return;
      if(!el.contains(e.target)) return;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY;
      delta = 0; active = false; tracking = true;
      el.style.transition = 'none';
    }, {passive:true});

    document.addEventListener('touchmove', e => {
      if(!tracking) return;
      const dx = e.touches[0].clientX - sx;
      const dy = Math.abs(e.touches[0].clientY - sy);
      if(!active){
        if(Math.abs(dx) < 6 && dy < 6) return;
        if(dy > Math.abs(dx)){ tracking = false; el.style.transition = ''; return; }
        active = true;
      }
      // Filter closes by swiping left (dx < 0)
      if(dx < 0){
        delta = Math.abs(dx);
        el.style.transform = `translateX(${dx}px)`;
        e.preventDefault();
      }
    }, {passive:false});

    document.addEventListener('touchend', () => {
      if(!tracking) return;
      el.style.transition = '';
      el.style.transform = '';
      if(delta > el.offsetWidth * 0.35) closeMobileFilter();
      delta = 0; active = false; tracking = false;
    }, {passive:true});

    document.addEventListener('touchcancel', () => {
      if(!tracking) return;
      el.style.transition = ''; el.style.transform = '';
      delta = 0; active = false; tracking = false;
    }, {passive:true});
  })();

  // -- Analytics sheet: drag to close from the handle/top only --
  // Fixes mobile scroll lock: normal swipe-down scrolling inside analytics
  // content no longer gets mistaken for drag-to-close when a nested panel has
  // the real scroll position.
  (function(){
    const el     = document.getElementById('mobileAnalyticsSheet');
    const inner  = document.getElementById('mobileAnalyticsInner');
    const handle = document.getElementById('mobileAnalyticsDragHandle');
    if(!el) return;

    let startY = 0, lastY = 0, deltaY = 0, tracking = false, dragging = false;

    function closestHorizontalScroller(node){
      while(node && node !== el && node !== document.body){
        if(node.nodeType === 1){
          const cs = getComputedStyle(node);
          const canScrollX = /(auto|scroll)/.test(cs.overflowX || '') && node.scrollWidth > node.clientWidth + 2;
          if(canScrollX) return node;
        }
        node = node.parentNode;
      }
      return null;
    }
    function closestScrollable(node){
      while(node && node !== el && node !== document.body){
        if(node.nodeType === 1){
          const cs = getComputedStyle(node);
          const canScrollY = /(auto|scroll)/.test(cs.overflowY || '') && node.scrollHeight > node.clientHeight + 2;
          if(canScrollY) return node;
        }
        node = node.parentNode;
      }
      return inner || null;
    }

    function contentIsAtTop(target){
      const scroller = closestScrollable(target);
      if(scroller && scroller.scrollTop > 1) return false;
      if(inner && inner !== scroller && inner.scrollTop > 1) return false;
      const body = document.getElementById('analyticsSheetBody');
      if(body && body !== scroller && body.scrollTop > 1) return false;
      return true;
    }

    el.addEventListener('touchstart', e => {
      if(!el.classList.contains('open')) return;
      startY = lastY = e.touches[0].clientY;
      deltaY = 0;
      tracking = true;
      dragging = false;
      // If this touch starts inside a horizontally-scrollable gallery (burn
      // inputs, holder thumbnails, etc.), never treat it as a drag-to-close
      // candidate — the old atTop check only looked at vertical scroll
      // position and would misfire on any diagonal wobble during a
      // horizontal swipe, hijacking the gallery's own scroll.
      tracking = !closestHorizontalScroller(e.target);
    }, {passive:true});

    el.addEventListener('touchmove', e => {
      if(!tracking) return;
      const y = e.touches[0].clientY;
      const moveFromStart = y - startY;
      const movingDown = y > lastY;
      lastY = y;

      // Never hijack upward swipes; those are normal content scrolling.
      if(!movingDown || moveFromStart < 0){
        if(!dragging){ tracking = false; }
        return;
      }

      const fromHandle = !!(handle && handle.contains(e.target));
      const atTop = contentIsAtTop(e.target);

      // Only allow drag-close from the handle, or from content that is truly at top.
      if(moveFromStart > 10 && (fromHandle || atTop)){
        dragging = true;
        deltaY = Math.max(0, moveFromStart);
        el.style.transition = 'none';
        el.style.transform = `translateY(${deltaY}px)`;
        e.preventDefault();
      }
    }, {passive:false});

    el.addEventListener('touchend', () => {
      if(!tracking && !dragging) return;
      el.style.transition = '';
      if(dragging && deltaY > 90) closeMobileAnalytics();
      else el.style.transform = '';
      tracking = false; dragging = false; deltaY = 0;
    }, {passive:true});

    el.addEventListener('touchcancel', () => {
      el.style.transition = ''; el.style.transform = '';
      tracking = false; dragging = false; deltaY = 0;
    }, {passive:true});
  })();

  // PTR handled natively via touch-action:pan-y on #mobileAnalyticsInner

})();

// ── Collapsible panel toggle ─────────────────────────────────────────────────
function cToggle(id){
  const el = document.getElementById(id);
  if(!el) return;
  el.classList.toggle('open');
  try{
    const s = JSON.parse(localStorage.getItem('cPanels')||'{}');
    s[id] = el.classList.contains('open');
    localStorage.setItem('cPanels', JSON.stringify(s));
  }catch{}

}

// Restore panel states — defaults: all collapsed except nothing special
(function(){
  // On mobile: always force topTabPanel closed, ignore any saved state
  const isMobile = window.innerWidth <= 900;
  if(isMobile){
    try{
      const s=JSON.parse(localStorage.getItem('cPanels')||'{}');
      delete s.topTabPanel;
      localStorage.setItem('cPanels',JSON.stringify(s));
    }catch{}
  }
  const defaults = {
    topTabPanel:      false,        // collapsed by default everywhere — grid/traits are the priority on first load
    panelRarity:      false,
    panelCompare:     false,
    panelPinned:      false,
    walletPanel:      false,
    recentSalesPanel: false,
    mispricedPanel:   false,
  };
  try{
    const saved = JSON.parse(localStorage.getItem('cPanels')||'{}');
    for(const [id, def] of Object.entries(defaults)){
      // On mobile, topTabPanel is ALWAYS closed regardless of saved state
      const open = (id === 'topTabPanel' && isMobile) ? false : (id in saved ? saved[id] : def);
      const el = document.getElementById(id);
      if(el) el.classList.toggle('open', open);
    }
  }catch{}
})();

// ── Sales view toggle (grid / list) ──────────────────────────────────────────
window.SALES_VIEW = localStorage.getItem('salesView') || 'grid';
function setSalesView(view){
  window.SALES_VIEW = view;
  try{ localStorage.setItem('salesView', view); }catch{}
  document.querySelectorAll('.sales-view-btn').forEach(b => b.classList.toggle('active', b.dataset.sview === view));
  const grid = document.getElementById('salesGrid');
  if(grid) grid.classList.toggle('sales-list', view === 'list');
  // Re-render cards in new view
  if(typeof window.renderSalesForCurrentTraits === 'function') window.renderSalesForCurrentTraits();
}
// Apply saved view on load
(function(){
  const grid = document.getElementById('salesGrid');
  if(grid && window.SALES_VIEW === 'list') grid.classList.add('sales-list');
  document.querySelectorAll('.sales-view-btn').forEach(b => b.classList.toggle('active', b.dataset.sview === window.SALES_VIEW));
})();

// ── Mispriced view toggle ────────────────────────────────────────────────────
window.MISPRICED_VIEW = 'list'; try{ localStorage.setItem('mpView','list'); }catch{}
function setMispricedView(view){
  window.MISPRICED_VIEW = view;
  try{ localStorage.setItem('mpView', view); }catch{}
  document.querySelectorAll('.sales-view-btn[data-mpview]').forEach(b => b.classList.toggle('active', b.dataset.mpview === view));
  const grid = document.getElementById('mispricedGrid');
  if(grid) grid.classList.toggle('mp-grid', view === 'grid');
}
(function(){
  const grid = document.getElementById('mispricedGrid');
  if(grid && window.MISPRICED_VIEW === 'grid') grid.classList.add('mp-grid');
  document.querySelectorAll('.sales-view-btn[data-mpview]').forEach(b => b.classList.toggle('active', b.dataset.mpview === (window.MISPRICED_VIEW||'list')));
})();

// ── Mispriced scoring modes ───────────────────────────────────────────────────
window.MISPRICED_MODE = 'rarity';
const MISPRICED_DESCS = {};
function setMispricedMode(mode){
  window.MISPRICED_MODE = mode;
  document.querySelectorAll('.mispriced-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  // Re-run mispriced panel with new mode if listings are loaded
  if(window.LISTINGS && Object.keys(window.LISTINGS).length > 0){
    const ids = Object.keys(window.LISTINGS).map(Number).filter(id => {
      const l = window.LISTINGS[id];
      return l && l.opensea && l.opensea.price_eth != null;
    });
    if(typeof buildMispricedPanel === 'function') buildMispricedPanel(ids);
  }
}

// ── Mobile filter drawer ──────────────────────────────────────────────────────

function openMobileFilter(){
  document.getElementById('mobileMenu')?.classList.remove('open');
  const leftCol = document.querySelector('#filtersColumn');
  if(!leftCol) return;
  leftCol.classList.add('drawer-open');
  const overlay = document.getElementById('filterDrawerOverlay');
  if(overlay) overlay.classList.add('open');
  document.body.classList.add('drawer-active');
  document.querySelector('.topbar')?.classList.add('drawer-behind');
  const arr = document.getElementById('floatArrow');
  if(arr) arr.textContent = '‹';

  requestAnimationFrame(()=>{
    try{ leftCol.scrollTop = 0; }catch{}
    // Render traits, with retry if TRAIT_DOMAIN not yet loaded
    function tryRenderTraits(attemptsLeft){
      if(typeof renderTraitAccordion !== 'function') return;
      const acc = document.getElementById('accTraits');
      if(!acc) return;
      if(Object.keys(TRAIT_DOMAIN||{}).length > 0){
        renderTraitAccordion(document.getElementById('traitSearch')?.value || '');
      } else if(attemptsLeft > 0){
        setTimeout(()=>tryRenderTraits(attemptsLeft - 1), 300);
      }
    }
    tryRenderTraits(15);
  });
}

function closeMobileFilter(){
  const leftCol = document.querySelector('#filtersColumn');
  if(!leftCol) return;
  leftCol.classList.remove('drawer-open');
  const overlay = document.getElementById('filterDrawerOverlay');
  if(overlay) overlay.classList.remove('open');
  document.body.classList.remove('drawer-active');
  document.querySelector('.topbar')?.classList.remove('drawer-behind');
  const arr = document.getElementById('floatArrow');
  if(arr) arr.textContent = '›';

}

// Inject a real sticky close bar at top of drawer (mobile only).
// A ::before pseudo-element cannot receive JS click events and was
// also blocking all pointer events on trait checkboxes beneath it.
(function injectDrawerCloseBar(){
  if(window.innerWidth > 900) return;
  const leftCol = document.querySelector('#filtersColumn');
  if(!leftCol || document.getElementById('drawerCloseBar')) return;
  const bar = document.createElement('div');
  bar.id = 'drawerCloseBar';
  bar.textContent = '✕  Close';
  bar.addEventListener('click', closeMobileFilter);
  leftCol.insertBefore(bar, leftCol.firstChild);
})();

// Keep taps inside the drawer from closing it via the overlay only.
(function wireMobileDrawerGuards(){
  const overlay = document.getElementById('filterDrawerOverlay');
  if(overlay){
    overlay.addEventListener('click', e=>{
      if(e.target === overlay) closeMobileFilter();
    });
  }
  // DO NOT stopPropagation on leftCol touches — it breaks all tap targets inside
})();

// ── Float button: tap = toggle, drag = reposition ─────────────────────────────
// ── Float button: tap = toggle, drag = reposition ─────────────────────────────
(function(){
  const btn = document.getElementById('floatFilterBtn');
  if(!btn) return;
  let dragStartY = 0, dragStartTop = 0, didDrag = false;

  btn.addEventListener('touchstart', e=>{
    dragStartY = e.touches[0].clientY;
    dragStartTop = btn.getBoundingClientRect().top;
    didDrag = false;
  }, { passive: true });

  btn.addEventListener('touchmove', e=>{
    const dy = e.touches[0].clientY - dragStartY;
    if(Math.abs(dy) > 6){
      didDrag = true;
      let newTop = dragStartTop + dy;
      newTop = Math.max(60, Math.min(window.innerHeight - 80, newTop));
      btn.style.top = newTop + 'px';
      btn.style.transform = 'none';
    }
  }, { passive: true });

  btn.addEventListener('click', e=>{
    if(didDrag){ didDrag = false; return; }
    const leftCol = document.querySelector('#filtersColumn');
    const isOpen = leftCol && leftCol.classList.contains('drawer-open');
    isOpen ? closeMobileFilter() : openMobileFilter();
  });
})();

// ── Mobile menu ───────────────────────────────────────────────────────────────
function toggleMobileMenu(){
  closeMobileFilter();
  document.getElementById('mobileMenu')?.classList.toggle('open');
}
document.addEventListener('click', e => {
  if(!e.target.closest('#mobileMenu') && !e.target.closest('#mobileMenuBtn')){
    document.getElementById('mobileMenu')?.classList.remove('open');
  }
});
function updateMobileThemeLabel(theme){
  const label = document.getElementById('mobileThemeLabel');
  if(!label) return;
  const names = { slate:'Slate', midnight:'Midnight', cyber:'Cyber', ink:'Ink' };
  label.textContent = names[theme] || 'Slate';
}
function pulseMobileThemeButton(){
  const btn = document.getElementById('mobileThemeButton');
  if(!btn) return;
  btn.classList.remove('theme-pulse');
  void btn.offsetWidth;
  btn.classList.add('theme-pulse');
}
function updateMobileThemeButtonAppearance(theme){
  const btn = document.getElementById('mobileThemeButton');
  const icon = btn?.querySelector('.mobile-menu-icon');
  if(!btn) return;
  const palettes = {
    slate: {
      bg:'rgba(148,163,184,0.06)', border:'rgba(148,163,184,0.14)',
      shadow:'0 0 0 1px rgba(148,163,184,0.05) inset', icon:'#a0aec0'
    },
    midnight: {
      bg:'rgba(90,167,255,0.06)', border:'rgba(90,167,255,0.16)',
      shadow:'0 0 0 1px rgba(90,167,255,0.05) inset', icon:'#7ab0e0'
    },
    cyber: {
      bg:'rgba(45,212,191,0.06)', border:'rgba(45,212,191,0.18)',
      shadow:'0 0 0 1px rgba(45,212,191,0.06) inset', icon:'#4dcfbe'
    },
    ink: {
      bg:'rgba(157,125,255,0.07)', border:'rgba(157,125,255,0.17)',
      shadow:'0 0 0 1px rgba(157,125,255,0.06) inset', icon:'#a896d8'
    }
  };
  const palette = palettes[theme] || palettes.slate;
  btn.style.background = palette.bg;
  btn.style.borderColor = palette.border;
  btn.style.boxShadow = palette.shadow;
  if(icon) icon.style.color = palette.icon;
}
function applyThemeMobile(theme){
  const normalized = ['slate','midnight','cyber','ink'].includes(theme) ? theme : 'slate';
  document.documentElement.setAttribute('data-theme', normalized);
  localStorage.setItem('theme', normalized);
  document.querySelectorAll('#themePicker .tbtn').forEach(b=>{
    b.classList.toggle('active', b.dataset.theme === normalized);
  });
  updateMobileThemeLabel(normalized);
  updateMobileThemeButtonAppearance(normalized);
  updateDesktopThemeButtonAppearance(normalized);
  pulseMobileThemeButton();
}
function setThemeMobile(theme, closeMenu = true){
  applyThemeMobile(theme);
  if(closeMenu) document.getElementById('mobileMenu')?.classList.remove('open');
}
function cycleThemeMobile(evt){
  if(evt){
    evt.preventDefault();
    evt.stopPropagation();
  }
  const menu = document.getElementById('mobileMenu');
  const wasOpen = !!menu?.classList.contains('open');
  mountDesktopThemeButton();
  const order = ['slate','midnight','cyber','ink'];
  const current = (document.documentElement.getAttribute('data-theme') || localStorage.getItem('theme') || 'slate').toLowerCase();
  const idx = order.indexOf(current);
  const next = order[((idx >= 0 ? idx : 0) + 1) % order.length];
  applyThemeMobile(next);
  if(wasOpen) menu?.classList.add('open');
}
function updateDesktopThemeButtonAppearance(theme){
  const btn = document.getElementById('desktopThemeCycle');
  const label = document.getElementById('desktopThemeLabel');
  if(!btn || !label) return;
  const names = { slate:'Slate', midnight:'Midnight', cyber:'Cyber', ink:'Ink' };
  const palettes = {
    slate:    { bg:'rgba(148,163,184,0.06)', border:'rgba(148,163,184,0.14)', shadow:'0 0 0 1px rgba(148,163,184,0.05) inset', color:'#a0aec0' },
    midnight: { bg:'rgba(90,167,255,0.06)',  border:'rgba(90,167,255,0.16)',  shadow:'0 0 0 1px rgba(90,167,255,0.05) inset',  color:'#7ab0e0' },
    cyber:    { bg:'rgba(45,212,191,0.06)',  border:'rgba(45,212,191,0.18)',  shadow:'0 0 0 1px rgba(45,212,191,0.06) inset',  color:'#4dcfbe' },
    ink:      { bg:'rgba(157,125,255,0.07)', border:'rgba(157,125,255,0.17)', shadow:'0 0 0 1px rgba(157,125,255,0.06) inset', color:'#a896d8' }
  };
  const palette = palettes[theme] || palettes.slate;
  btn.style.background = palette.bg;
  btn.style.borderColor = palette.border;
  btn.style.boxShadow = palette.shadow;
  btn.style.color = palette.color;
  label.textContent = names[theme] || 'Slate';
}
function mountDesktopThemeButton(){ /* already in correct position in HTML */ }

function cycleThemeDesktop(evt){
  if(evt){
    evt.preventDefault();
    evt.stopPropagation();
  }
  const order = ['slate','midnight','cyber','ink'];
  const current = (document.documentElement.getAttribute('data-theme') || localStorage.getItem('theme') || 'slate').toLowerCase();
  const idx = order.indexOf(current);
  const next = order[((idx >= 0 ? idx : 0) + 1) % order.length];
  applyThemeMobile(next);
}

// ── Put the REAL jump controls inside the mobile menu on mobile ──────────────
(function(){
  if(window.innerWidth > 900) return;
  const slot = document.getElementById('mobileJumpSlot');
  const jump = document.getElementById('jump');
  const jumpBtn = document.getElementById('btnJump');
  if(!slot || !jump || !jumpBtn) return;
  slot.appendChild(jump);
  slot.appendChild(jumpBtn);
  jump.style.width = '100%';
  jump.placeholder = 'Token ID…';
  jump.addEventListener('keydown', e => { if(e.key === 'Enter') toggleMobileMenu(); });
  jumpBtn.addEventListener('click', ()=> document.getElementById('mobileMenu')?.classList.remove('open'));
})();

// ── Stamp listing prices on mobile grid cards ─────────────────────────────────
function stampMobilePrices(){
  if(!window.LISTINGS) return;
  document.querySelectorAll('#tokenGrid .token[data-id]').forEach(card => {
    const id = +card.dataset.id;
    const listing = window.LISTINGS[id]?.opensea;
    if(listing && listing.price_eth != null){
      let priceEl = card.querySelector('.mobile-price-badge');
      if(!priceEl){
        priceEl = document.createElement('div');
        priceEl.className = 'mobile-price-badge';
        priceEl.style.cssText = 'position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.75);color:#2dd4bf;font-size:9px;font-weight:700;padding:2px 5px;border-radius:5px;pointer-events:none;font-family:Space Grotesk,sans-serif;line-height:1.3';
        card.style.position = 'relative';
        card.appendChild(priceEl);
      }
      const eth = listing.price_eth >= 1 ? listing.price_eth.toFixed(3) : listing.price_eth.toFixed(4);
      priceEl.textContent = 'Ξ ' + eth;
    }
  });
}
// Stamp rank and ID badges as real DOM elements on mobile
function stampMobileBadges(){
  const grid = document.getElementById('tokenGrid');
  if(!grid) return;
  const isCompact = grid.classList.contains('compact');
  const isList    = grid.classList.contains('list');
  if(isList) return; // list view shows badges in tmeta already

  const BADGE = "position:absolute;pointer-events:none;font-family:Space Grotesk,sans-serif;font-weight:700;line-height:1.2;background:rgba(0,0,0,.80);color:#e6edf7;border-radius:4px;z-index:20;";

  grid.querySelectorAll('.token').forEach(card => {
    if(!card.dataset.id) return;
    // Remove previously stamped badges to avoid duplicates
    card.querySelectorAll('.mobile-rank-badge,.mobile-id-badge').forEach(el=>el.remove());

    // Rank badge: standard view only (compact is too small)
    if(!isCompact && card.dataset.rank){
      const r = document.createElement('div');
      r.className = 'mobile-rank-badge';
      r.innerHTML = rankDiamondHtml(card.dataset.rank, '', card.dataset.rankSys);
      r.style.cssText = BADGE + 'top:4px;left:4px;font-size:9px;padding:2px 5px;background:rgba(8,12,18,.72);';
      card.appendChild(r);
    }

    // ID badge: both views
    const idEl = document.createElement('div');
    idEl.className = 'mobile-id-badge';
    idEl.textContent = '#' + card.dataset.id;
    idEl.style.cssText = BADGE + (isCompact
      ? 'bottom:3px;left:3px;font-size:8px;padding:1px 4px;'
      : 'bottom:5px;left:5px;font-size:9px;padding:2px 6px;');
    card.appendChild(idEl);
  });
}

// Re-stamp after listings fetch completes
const _origFetchLive = window.fetchLiveForIds;
if(typeof fetchLiveForIds !== 'undefined'){
  const __origFetch = fetchLiveForIds;
  window.fetchLiveForIds = async function(...args){
    const result = await __origFetch(...args);
    if(window.innerWidth <= 900){
      stampMobilePrices();
      stampMobileBadges();
    } else {
      // Re-apply compact view to pick up newly loaded listing prices
      const tg = document.getElementById('tokenGrid');
      if(tg && tg.classList.contains('compact') && typeof applyViewMode === 'function'){
        applyViewMode('compact');
      }
    }
    return result;
  };
}

// ── Virtual Scroller (mobile only) ───────────────────────────────────────────
const VS = {
  ids: [], mode: 'grid', cols: 2, rowH: 180,
  bufferRows: 3, visStart: -1, visEnd: -1,
  _nodeCache: new Map(), _cacheLimit: 240,
  enabled: false, _raf: null, _paintToken: 0,

  get rowCount(){ return Math.ceil(this.ids.length / this.cols); },

  _computeCols(tg){
    const w = tg.clientWidth || window.innerWidth || 1200;
    if(this.mode === 'list') return 1;
    if(window.innerWidth <= 900) return 2;
    const minW = this.mode === 'compact' ? 120 : 220;
    const gap = 8;
    return Math.max(1, Math.floor((w + gap) / (minW + gap)));
  },

  async init(ids, mode){
    this.enabled = true;
    this.ids = ids.slice();
    this.mode = mode || 'grid';
    this.visStart = -1; this.visEnd = -1;
    this.bufferRows = window.innerWidth <= 900 ? 6 : 3;

    const tg = document.getElementById('tokenGrid');
    if(!tg) return false;

    const keepClasses = [];
    if(this.mode === 'list') keepClasses.push('list');
    if(this.mode === 'compact') keepClasses.push('compact');
    tg.className = ['vs-active', ...keepClasses].join(' ');
    this.cols = this._computeCols(tg);

    if(window.innerWidth <= 900){
      tg.style.cssText = 'display:block!important;overflow-y:auto!important;overflow-x:hidden!important;-webkit-overflow-scrolling:touch!important;overscroll-behavior:contain!important;box-sizing:border-box!important;width:100%!important;height:calc(100dvh - 106px)!important;padding:0!important;';
    }else{
      tg.style.cssText = 'display:block!important;overflow-y:auto!important;overflow-x:hidden!important;box-sizing:border-box!important;width:100%!important;max-height:520px!important;padding-right:4px!important;overscroll-behavior:none!important;scroll-behavior:auto!important;';
    }
    tg.innerHTML = '';

    if(!ids.length){
      tg.innerHTML = '<div style="color:var(--sub);padding:20px;text-align:center;font-size:14px">No matches.</div>';
      return true;
    }

    const vw = tg.clientWidth || window.innerWidth;
    if(this.mode === 'list') this.rowH = window.innerWidth <= 900 ? 88 : 112;
    else if(this.mode === 'compact') this.rowH = Math.round((vw / this.cols)) + 8;
    else this.rowH = window.innerWidth <= 900 ? Math.round(vw / 2) + 6 : 122;

    tg._vsTop  = document.createElement('div');
    tg._vsRows = document.createElement('div');
    tg._vsBot  = document.createElement('div');

    tg._vsTop.style.cssText  = 'height:0;width:100%;flex-shrink:0';
    tg._vsBot.style.cssText  = 'height:0;width:100%;flex-shrink:0';
    const gap = window.innerWidth <= 900 ? 6 : 8;
    tg._vsRows.style.cssText = this.mode === 'list'
      ? `display:flex;flex-direction:column;gap:${gap}px;width:100%;padding:${gap}px;box-sizing:border-box`
      : `display:grid;grid-template-columns:repeat(${this.cols}, minmax(0, 1fr));gap:${gap}px;width:100%;max-width:100%;min-width:0;padding:${gap}px;box-sizing:border-box;overflow-x:hidden`;

    tg.appendChild(tg._vsTop);
    tg.appendChild(tg._vsRows);
    tg.appendChild(tg._vsBot);

    tg.onscroll = () => {
      if(!this._raf) this._raf = requestAnimationFrame(()=>{ this._raf=null; this._paint(); });
    };
    tg.scrollTop = 0;
    this._paint();

    requestAnimationFrame(()=> requestAnimationFrame(()=>{
      const first = tg._vsRows.firstElementChild;
      if(first){
        const gapPx = window.innerWidth <= 900 ? 6 : 8;
        const h = first.getBoundingClientRect().height;
        if(h > 10 && Math.abs(h + gapPx - this.rowH) > 10){
          this.rowH = h + gapPx;
          this.visStart = -1; this.visEnd = -1;
    this.bufferRows = window.innerWidth <= 900 ? 6 : 3;
          this._paint();
        }
      }
    }));
    return true;
  },

  async _paint(){
    const tg = document.getElementById('tokenGrid');
    if(!tg || !tg._vsRows || !this.enabled || !this.ids.length) return;

    const scrollTop = tg.scrollTop;
    const viewH = tg.clientHeight || (window.innerHeight - 106);
    const firstRow = Math.max(0, Math.floor(scrollTop / this.rowH) - this.bufferRows);
    const lastRow  = Math.min(this.rowCount - 1, Math.ceil((scrollTop + viewH) / this.rowH) + this.bufferRows);

    if(firstRow === this.visStart && lastRow === this.visEnd) return;
    this.visStart = firstRow; this.visEnd = lastRow;

    tg._vsTop.style.height = (firstRow * this.rowH) + 'px';
    tg._vsBot.style.height = Math.max(0, (this.rowCount - lastRow - 1) * this.rowH) + 'px';

    const paintToken = ++this._paintToken;
    const visibleIds = [];
    if(this.mode === 'list'){
      for(let r = firstRow; r <= lastRow; r++){
        const id = this.ids[r];
        if(id != null) visibleIds.push(id);
      }
    } else {
      const i0 = firstRow * this.cols;
      const i1 = Math.min(this.ids.length - 1, (lastRow + 1) * this.cols - 1);
      for(let i = i0; i <= i1; i++) if(this.ids[i] != null) visibleIds.push(this.ids[i]);
    }

    const cards = await Promise.all(visibleIds.map(async id => {
      try{
        const key = `${this.mode}:${id}`;
        let card = this._nodeCache.get(key);
        if(card) return card;
        if(this.mode === 'list') card = this._listCard(id);
        else if(window.innerWidth <= 900) card = this._gridCard(id);
        else card = await this._standardCard(id);
        if(card){
          this._nodeCache.set(key, card);
          if(this._nodeCache.size > this._cacheLimit){
            const firstKey = this._nodeCache.keys().next().value;
            if(firstKey) this._nodeCache.delete(firstKey);
          }
        }
        return card;
      }catch(e){
        const fallback = (this.mode === 'list') ? this._listCard(id) : this._gridCard(id);
        return fallback;
      }
    }));
    if(paintToken !== this._paintToken) return;

    const frag = document.createDocumentFragment();
    cards.forEach(card => { if(card) frag.appendChild(card); });
    tg._vsRows.replaceChildren(frag);

    if(this.mode === 'list'){
      tg._vsRows.querySelectorAll('[data-owner-id]').forEach(el => {
        const id = +el.dataset.ownerId;
        this._loadOwner(id, el);
      });
      tg._vsRows.querySelectorAll('[data-last-sale-id]').forEach(el => {
        hydrateListMetaForId(+el.dataset.lastSaleId);
      });
    }
    if(window.innerWidth > 900){
      attachPreviewHandlers();
      syncFavoriteButtons();
      if(this.mode === 'compact' && typeof applyViewMode === 'function') applyViewMode('compact');
    }
  },

  _gridCard(id){
    const obsRank = RARITY_OBS_RANK.get(id);
    const theoRank = RARITY_THEO_RANK.get(id);
    const tvRank = (RARITY_MODE==='theoretical' && RARITY_THEO_RANK.size) ? (theoRank||null) : (obsRank||null);
    const osRank = OS_RANK_MAP.get(id) || null;
    const rank = getRankSystem() === 'tv' ? tvRank : (osRank || tvRank);
    const rankSys = getRankSystem() === 'tv' ? 'tv' : (osRank ? 'os' : 'tv');
    const price = window.LISTINGS?.[id]?.opensea?.price_eth;
    const priceStr = price != null ? (price >= 1 ? price.toFixed(3) : price.toFixed(4)) : null;
    const imgSrc = this._imgSrc(id);
    const d = document.createElement('div');
    d.dataset.id = id;
    d.style.cssText = 'position:relative;min-width:0;width:100%;max-width:100%;border-radius:10px;overflow:hidden;cursor:pointer;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);aspect-ratio:1/1;contain:layout paint style;box-sizing:border-box';
    if(connectedWalletOwns(id)){
      d.className = 'owned-token';
      d.style.borderColor = 'rgba(28,255,175,.36)';
      d.style.boxShadow = '0 0 0 1px rgba(28,255,175,.12) inset,0 0 18px rgba(28,255,175,.12)';
    }
    d.innerHTML =
      (imgSrc ? `<img src="${imgSrc}" loading="eager" decoding="async" fetchpriority="high" style="width:100%;height:100%;object-fit:contain;image-rendering:auto;display:block;backface-visibility:hidden;-webkit-backface-visibility:hidden">` : '<div style="width:100%;height:100%;background:rgba(255,255,255,.05)"></div>') +
      (rank ? `<div style="position:absolute;top:4px;left:4px;background:rgba(0,0,0,.82);font-size:9px;font-weight:700;padding:2px 5px;border-radius:4px;pointer-events:none;font-family:Space Grotesk,sans-serif">${rankDiamondHtml(rank,'',rankSys)}</div>` : '') +
      `<div style="position:absolute;bottom:4px;left:4px;background:rgba(0,0,0,.82);color:#e6edf7;font-size:9px;font-weight:700;padding:2px 5px;border-radius:4px;pointer-events:none;font-family:Space Grotesk,sans-serif">#${id}</div>` +
      (priceStr ? `<div style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,.82);color:#2dd4bf;font-size:9px;font-weight:700;padding:2px 5px;border-radius:4px;pointer-events:none;font-family:Space Grotesk,sans-serif">Ξ${priceStr}</div>` : '');
    if(connectedWalletOwns(id)) d.insertAdjacentHTML('beforeend', '<span class="vs-owned-badge">Owned</span>');
    d.addEventListener('click', () => openModal(id));
    return d;
  },


  async _standardCard(id){
    let row = ROW_CACHE.get(id) || null;
    if(!row){
      try{ row = await fetchRow(id); }
      catch(e){ row = { traits:{} }; }
    }
    const d = document.createElement('div');
    d.className = 'token';
    if(connectedWalletOwns(id)) d.classList.add('owned-token');
    const obsRank=RARITY_OBS_RANK.get(id); const theoRank=RARITY_THEO_RANK.get(id);
    const theoVal2 = (RARITY_MODE==='theoretical' && RARITY_THEO_RANK.size) ? (theoRank||'') : (obsRank||'');
    const osRankVal2 = OS_RANK_MAP.get(id) || null;
    const rankVal = getRankSystem() === 'tv' ? theoVal2 : (osRankVal2 || theoVal2);
    const rankSys2 = getRankSystem() === 'tv' ? 'tv' : (osRankVal2 ? 'os' : 'tv');
    const rankBadge = rankVal ? `<span class="chip">${rankDiamondHtml(rankVal,'',rankSys2)}</span>` : '';
    if (rankVal){ d.dataset.rank = String(rankVal); d.dataset.rankSys = rankSys2; const t=rankTier(rankVal); if(t) d.dataset.rankTier=t; }
    d.dataset.id = String(id);
    const osCardUrl=`https://opensea.io/assets/ethereum/${LIVE_CONTRACT}/${id}`;
    d.innerHTML=`<div class="pinbar"><button type="button" class="favbtn ${isFavorite(id)?'active':''}" data-fav-id="${id}" title="${isFavorite(id)?'Remove favorite':'Add favorite'}" aria-pressed="${isFavorite(id)?'true':'false'}"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 17.3l-6.18 3.73 1.64-7.03L2 9.24l7.19-.61L12 2l2.81 6.63 7.19.61-5.46 4.76 1.64 7.03z"/></svg></button><button type="button" class="pinbtn" data-act="A" title="Pin to A">A</button><button type="button" class="pinbtn" data-act="B" title="Pin to B">B</button><button type="button" class="pinbtn" data-act="+" title="Add to pinned">＋</button></div>
      ${gridThumbHtml(id,row)}
      ${connectedWalletOwns(id) ? '<span class="owned-badge">Owned</span>' : ''}
      <div class="tmeta">
        <div class="idline">#${id} ${rankBadge} ${priceBadgeHtml(id)} <a href="${osCardUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="View on OpenSea" style="margin-left:auto;opacity:.6;line-height:1;display:inline-flex;align-items:center"><img src="https://opensea.io/static/images/logos/opensea-logo.svg" style="width:13px;height:13px;border-radius:3px"></a></div>
        ${document.getElementById('tokenGrid')?.classList.contains('list') ? listStatsRowHtml(id, rankVal, getListingEth(id) != null ? (getListingEth(id) >= 1 ? getListingEth(id).toFixed(3) : getListingEth(id).toFixed(4)) : null) : traitsMiniHtml(row)}
      </div>`;
    d.addEventListener('click', async (e)=>{ if(e.target.closest('.pinbtn')) return; await openModal(id); });
    const pinbar = d.querySelector('.pinbar');
    if(pinbar){
      pinbar.addEventListener('click',(ev)=>{ const fav = ev.target.closest('[data-fav-id]'); if(fav){ ev.stopPropagation(); ev.preventDefault(); toggleFavorite(id); return; } const b=ev.target.closest('.pinbtn'); if(!b) return; ev.stopPropagation(); ev.preventDefault(); b.classList.add('flash'); setTimeout(()=>b.classList.remove('flash'), 220); const act=b.getAttribute('data-act'); if(act==='A') setCompare('A',id); else if(act==='B') setCompare('B',id); else pinAdd(id); });
    }
    return d;
  },

  _listCard(id){
    const rank = RARITY_OBS_RANK.get(id);
    const price = window.LISTINGS?.[id]?.opensea?.price_eth;
    const priceStr = price != null ? (price >= 1 ? price.toFixed(3) : price.toFixed(4)) : null;
    const imgSrc = this._imgSrc(id);
    const d = document.createElement('div');
    d.dataset.id = id;
    d.style.cssText = 'display:grid;grid-template-columns:60px 1fr;gap:8px 10px;padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.1);cursor:pointer;background:rgba(255,255,255,.03);flex-shrink:0;align-items:start;box-sizing:border-box';
    if(connectedWalletOwns(id)){
      d.className = 'owned-token';
      d.style.borderColor = 'rgba(28,255,175,.36)';
      d.style.boxShadow = '0 0 0 1px rgba(28,255,175,.10) inset,0 0 18px rgba(28,255,175,.10)';
    }
    d.innerHTML =
      `<div style="width:60px;height:60px;min-width:60px;border-radius:8px;overflow:hidden;background:rgba(255,255,255,.06);flex-shrink:0">` +
      (imgSrc ? `<img src="${imgSrc}" loading="eager" decoding="async" fetchpriority="high" style="width:100%;height:100%;object-fit:contain;image-rendering:auto;display:block;backface-visibility:hidden;-webkit-backface-visibility:hidden">` : '') +
      `</div>` +
      `<div style="min-width:0;overflow:visible;display:flex;flex-direction:column;gap:3px">` +
      `<div style="font-weight:700;font-size:13px;margin-bottom:2px;color:#e6edf7">#${id}</div>` +
      listStatsRowHtml(id, rank, priceStr) +
      `</div>` +
      (connectedWalletOwns(id) ? '<span class="vs-owned-badge" style="top:8px;right:8px;bottom:auto">Owned</span>' : '');
    // Apply scroll styles directly to the datarow so it stays within the meta column
    const statsRow = d.querySelector('.vs-datarow');
    if(statsRow){
      statsRow.style.cssText = 'display:flex;flex-direction:row;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;border-top:1px solid rgba(255,255,255,.07);padding-top:7px;margin-top:2px;gap:0;scroll-snap-type:x mandatory;overscroll-behavior-x:contain;touch-action:pan-x pan-y;-webkit-mask-image:linear-gradient(to right,#000 75%,transparent 100%);mask-image:linear-gradient(to right,#000 75%,transparent 100%);width:100%;max-width:100%';
      statsRow.querySelectorAll('.vs-cell').forEach(c => { c.style.cssText = 'flex-shrink:0;min-width:88px;padding-right:14px;scroll-snap-align:start;display:flex;flex-direction:column'; });
    }
    // Swipe isolation — suppress modal open if horizontal swipe detected
    let _sx=0, _sy=0, _sw=false;
    if(statsRow){
      statsRow.addEventListener('touchstart',e=>{ _sx=e.touches[0].clientX; _sy=e.touches[0].clientY; _sw=false; },{passive:true});
      statsRow.addEventListener('touchmove',e=>{ const dx=Math.abs(e.touches[0].clientX-_sx),dy=Math.abs(e.touches[0].clientY-_sy); if(dx>dy&&dx>6) _sw=true; },{passive:true});
    }
    d.addEventListener('click', e => {
      if(e.target.closest('.vs-datarow') && _sw) return;
      if(e.target.dataset.ownerId) return;
      openModal(id);
    });
    return d;
  },

  _imgSrc(id){
    const v = IMAGES_MAP?.get(id);
    const s = v ? String(v).trim() : null;
    if(s && s.startsWith('<svg')){ try{ return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(s); }catch(e){ return imgForId(id); } }
    if(s && s.startsWith('data:')) return s;
    if(s) return ipfsToHttp(s);
    return typeof imgForId==='function' ? imgForId(id) : null;
  },

  _ownerCache: new Map(),
  _ownerPending: new Set(),

  _loadOwner(id, el){
    if(this._ownerCache.has(id)){
      this._applyOwner(el, this._ownerCache.get(id));
      return;
    }
    if(this._ownerPending.has(id)) return;
    this._ownerPending.add(id);
    fetch(`${LIVE_ENDPOINT}/os/owner?contract=${LIVE_CONTRACT}&tokenId=${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const addr = data?.owner || data?.address || null;
        this._ownerCache.set(id, addr);
        this._ownerPending.delete(id);
        // Find the element in current DOM (may have scrolled away)
        const cur = document.querySelector(`[data-owner-id="${id}"]`);
        if(cur) this._applyOwner(cur, addr);
      })
      .catch(()=>{ this._ownerPending.delete(id); });
  },

  _applyOwner(el, addr){
    if(!el) return;
    if(addr){
      el.textContent = addr.slice(0,6)+'…'+addr.slice(-4);
      el.style.color = '#7c9bbf';
      el.style.textDecoration = 'underline';
      el.style.cursor = 'pointer';
      el.onclick = e => {
        e.stopPropagation();
        openWalletView(addr);
      };
    } else {
      el.textContent = '—';
    }
  },

  refreshPrices(){
    if(!this.enabled) return;
    this.visStart = -1; this.visEnd = -1;
    this.bufferRows = window.innerWidth <= 900 ? 6 : 3;
    this._paint();
  }
};

// CSS for virtual scroller list cells
(function(){
  const s = document.createElement('style');
  s.textContent = `
    .vs-datarow{display:flex!important;flex-direction:row!important;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;margin-top:4px;padding-bottom:2px;gap:0}
    .vs-datarow::-webkit-scrollbar{display:none}
    .vs-cell{flex-shrink:0;min-width:74px;padding-right:14px;display:flex;flex-direction:column;scroll-snap-align:start}
    @media (max-width:900px){
      .vs-datarow{scroll-snap-type:x mandatory;overscroll-behavior-x:contain;touch-action:pan-x pan-y}
      .vs-cell{min-width:90px;padding-right:16px}
    }
    .vs-label{font-size:9px;color:var(--sub);text-transform:uppercase;letter-spacing:.06em;font-weight:600;white-space:nowrap;margin-bottom:2px}
    .vs-val{font-size:12px;font-weight:700;color:var(--text);white-space:nowrap}
    .vs-val.green{color:#2dd4bf}
    .vs-val.purple{color:#d8b4fe}
    .vs-val.muted{color:var(--sub);font-weight:400}
  `;
  document.head.appendChild(s);
})();

// ── Token download helpers: high-res + original SVG when available ─────
/* download helpers moved to js/downloads.js */

let STUDIO_TOKEN_ID = null;
let STUDIO_PREVIEW_TIMER = null;
function studioDims(layout){
  if(layout === 'square') return { W:1080, H:1080 };
  if(layout === 'story') return { W:1080, H:1920 };
  return { W:1200, H:630 };
}
function studioOptions(){
  const toggles = {};
  document.querySelectorAll('[data-studio-toggle]').forEach(el => { toggles[el.dataset.studioToggle] = !!el.checked; });
  const color = id => document.getElementById(id)?.value || '';
  return {
    layout: document.getElementById('studioLayout')?.value || 'wide',
    palette: document.getElementById('studioPalette')?.value || 'default',
    background: document.getElementById('studioBackground')?.value || 'gradient',
    traitMode: document.getElementById('studioTraitMode')?.value || 'auto',
    toggles,
    colors: {
      bgA: color('studioColorBgA'),
      bgB: color('studioColorBgB'),
      solid: color('studioColorSolid'),
      accent: color('studioColorAccent'),
      panel: color('studioColorPanel'),
      textAccent: color('studioColorTextAccent')
    }
  };
}
function studioHolderContext(id, owner){
  const connected = window.CONNECTED_WALLET || CONNECTED_WALLET || {};
  const connectedAddr = String(connected.address || '').trim().toLowerCase();
  const ownerKey = String(owner || '').trim().toLowerCase();
  if(connectedAddr && Array.isArray(connected.tokenIds) && connected.tokenIds.length){
    const ownsToken = connected.tokenSet ? connected.tokenSet.has(+id) : connected.tokenIds.map(Number).includes(+id);
    if(ownsToken || (ownerKey && connectedAddr === ownerKey)){
      return { address:connected.address, ids:connected.tokenIds, ownsToken };
    }
  }
  const walletInput = (document.getElementById('walletInput')?.value || document.getElementById('mobileWalletInput')?.value || '').trim().toLowerCase();
  const walletIds = ownerKey && walletInput === ownerKey ? (window._walletTokenIds || window._mobileWalletIds || []) : [];
  return { address:owner || '', ids:walletIds, ownsToken:false };
}
function studioTraitSelection(row, opts){
  const rows = _shareCardTraitRows(row, opts.traitMode === 'top3' ? 3 : 6);
  if(opts.traitMode === 'top5') return rows.slice(0,5);
  if(opts.traitMode !== 'custom') return rows;
  const selected = new Set([...document.querySelectorAll('#studioTraitList input:checked')].map(i => i.value));
  const all = _shareCardTraitRows(row, 99);
  return all.filter(t => selected.has(`${t.trait}::${t.value}`)).slice(0,6);
}
function hexToRgb(hex){
  const s = String(hex || '').replace('#','');
  if(s.length !== 6) return {r:28,g:255,b:175};
  return { r:parseInt(s.slice(0,2),16), g:parseInt(s.slice(2,4),16), b:parseInt(s.slice(4,6),16) };
}
function rgbaFromHex(hex, a){
  const c = hexToRgb(hex);
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}
function contrastTextFor(hex){
  const c = hexToRgb(hex);
  const lum = (0.299*c.r + 0.587*c.g + 0.114*c.b) / 255;
  return lum > .55 ? '#07111a' : '#f8fafc';
}
function applyStudioColorsToPalette(pal, opts){
  const c = opts.colors || {};
  const next = {...pal};
  if(c.bgA && c.bgB) next.bg = [c.bgA, c.bgA, c.bgB, c.bgB];
  if(c.solid) next.solid = c.solid;
  if(c.accent){
    next.wash = rgbaFromHex(c.accent, .30);
    next.washMid = rgbaFromHex(c.accent, .075);
    next.glow = rgbaFromHex(c.accent, .28);
    next.statBg = rgbaFromHex(c.accent, .09);
    next.statBorder = rgbaFromHex(c.accent, .24);
  }
  if(c.panel){
    next.glass = rgbaFromHex(c.panel, .72);
    next.artFill = rgbaFromHex(c.panel, .18);
  }
  if(c.textAccent){
    next.traitAccent = c.textAccent;
  }
  return next;
}
function syncStudioColorDefaults(){
  const pal = _getShareCardPalette(document.getElementById('studioPalette')?.value || 'default');
  const set = (id, val) => { const el = document.getElementById(id); if(el) el.value = val; };
  set('studioColorBgA', pal.bg?.[0] || '#08111a');
  set('studioColorBgB', pal.bg?.[2] || '#10162a');
  set('studioColorSolid', pal.bg?.[3] || '#070b12');
  set('studioColorAccent', '#1CFFAF');
  set('studioColorPanel', pal.bg?.[0] || '#08111a');
  set('studioColorTextAccent', pal.traitAccent || '#67e8f9');
}
function fillStudioBackground(ctx, W, H, pal, mode){
  const bg = ctx.createLinearGradient(0, 0, W, H);
  if(mode === 'solid'){
    ctx.fillStyle = pal.solid || pal.bg[3];
    ctx.fillRect(0,0,W,H);
    return;
  }
  const colors = mode === 'glass' ? ['#03060a','#07101a','#090b12','#020304'] : pal.bg;
  bg.addColorStop(0, colors[0]); bg.addColorStop(.42, colors[1]); bg.addColorStop(.72, colors[2]); bg.addColorStop(1, colors[3]);
  ctx.fillStyle = bg;
  ctx.fillRect(0,0,W,H);
  const a = mode === 'frosted' ? .055 : 1;
  const wash = ctx.createRadialGradient(W*.18, H*.16, 20, W*.18, H*.16, Math.max(W,H)*.55);
  wash.addColorStop(0, mode === 'token' ? 'rgba(28,255,175,.34)' : pal.wash);
  wash.addColorStop(.58, mode === 'token' ? 'rgba(103,232,249,.075)' : pal.washMid);
  wash.addColorStop(1, `rgba(0,0,0,0)`);
  ctx.globalAlpha = a;
  ctx.fillStyle = wash;
  ctx.fillRect(0,0,W,H);
  ctx.globalAlpha = 1;
  if(mode !== 'frosted'){
    const violet = ctx.createRadialGradient(W*.84, H*.82, 30, W*.84, H*.82, Math.max(W,H)*.55);
    violet.addColorStop(0, pal.wash2);
    violet.addColorStop(.58, pal.wash2Mid);
    violet.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = violet;
    ctx.fillRect(0,0,W,H);
  }
}
function drawStudioCollection(ctx, x, y){
  ctx.font = '800 24px Space Grotesk, Segoe UI, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f8fafc';
  ctx.fillText('ON-CHAIN', x, y);
  ctx.fillStyle = '#1CFFAF';
  ctx.fillText('ALL-STARS', x + 140, y);
}
function studioTraitProfile(count, layout){
  if(layout === 'story'){
    if(count <= 2) return { rowH:108, gap:18, label:20, value:36, pct:32, pad:28 };
    if(count <= 5) return { rowH:84, gap:13, label:17, value:29, pct:26, pad:24 };
    if(count <= 8) return { rowH:66, gap:10, label:14, value:23, pct:22, pad:20 };
    return { rowH:54, gap:8, label:12, value:19, pct:18, pad:17 };
  }
  if(layout === 'square') return { rowH:58, gap:10, label:13, value:21, pct:20, pad:18 };
  return { rowH:43, gap:5, label:12, value:19, pct:18, pad:16 };
}
function drawStudioTraitRows(ctx, traits, x, y, w, bottom, pal, layout){
  const profile = studioTraitProfile(traits.length, layout);
  const maxRows = Math.max(0, Math.floor((bottom - y) / (profile.rowH + profile.gap)));
  const visible = traits.slice(0, maxRows || traits.length);
  if(!visible.length) return y;
  ctx.fillStyle = pal.traitLabel;
  ctx.font = `800 ${Math.max(16, profile.label + 2)}px Space Grotesk, Segoe UI, sans-serif`;
  ctx.fillText('TOP TRAITS', x, y);
  y += profile.rowH > 80 ? 48 : 36;
  for(const t of visible){
    if(y + profile.rowH > bottom) break;
    _roundRect(ctx, x, y, w, profile.rowH, 14);
    ctx.fillStyle = pal.traitRow;
    ctx.fill();
    ctx.strokeStyle = pal.traitBorder;
    ctx.stroke();
    const pct = t.pct == null ? '' : (t.pct < .1 ? t.pct.toFixed(3) : t.pct.toFixed(1)) + '%';
    const tx = x + profile.pad;
    const right = x + w - profile.pad;
    ctx.textAlign = 'left';
    ctx.font = `700 ${profile.label}px Space Grotesk, Segoe UI, sans-serif`;
    ctx.fillStyle = pal.traitLabel;
    ctx.fillText(_ellipsizeCanvasText(ctx, String(t.trait).toUpperCase(), w * .56), tx, y + profile.pad);
    ctx.font = `800 ${profile.value}px Space Grotesk, Segoe UI, sans-serif`;
    ctx.fillStyle = pal.traitValue;
    ctx.fillText(_ellipsizeCanvasText(ctx, String(t.value), w * .64), tx, y + profile.pad + profile.value + 5);
    ctx.textAlign = 'right';
    ctx.font = `900 ${profile.pct}px Space Grotesk, Segoe UI, sans-serif`;
    ctx.fillStyle = pal.traitAccent;
    ctx.fillText(pct, right, y + profile.rowH / 2 + profile.pct / 3);
    ctx.textAlign = 'left';
    y += profile.rowH + profile.gap;
  }
  return y;
}
async function renderStudioStoryCanvas(id, row, opts, canvas, ctx, W, H, pal){
  fillStudioBackground(ctx, W, H, pal, opts.background);
  const margin = 70;
  _roundRect(ctx, margin, margin, W - margin*2, H - margin*2, 42);
  ctx.fillStyle = opts.background === 'frosted' ? 'rgba(255,255,255,.035)' : pal.glass;
  ctx.shadowColor = pal.glow; ctx.shadowBlur = 34; ctx.fill(); ctx.shadowBlur = 0;
  ctx.strokeStyle = pal.border; ctx.lineWidth = 2; ctx.stroke();
  let y = 118;
  if(opts.toggles.collection){ drawStudioCollection(ctx, margin + 44, y); y += 82; }
  const osRank = OS_RANK_MAP?.get(id) || OS_RANK_MAP?.get(String(id)) || null;
  if(opts.toggles.tokenId){
    ctx.fillStyle = contrastTextFor(pal.bg?.[0] || '#08111a');
    ctx.font = '900 82px Space Grotesk, Segoe UI, sans-serif';
    const title = '#' + id;
    ctx.fillText(title, margin + 44, y);
    if(opts.toggles.rank && osRank) _drawShareCardRank(ctx, osRank, margin + 70 + ctx.measureText(title).width, y - 18);
  }
  const artSize = 790;
  const artX = Math.round((W - artSize) / 2);
  const artY = 278;
  const artCanvas = await _tokenCanvasWithBackground(id, 960);
  ctx.shadowColor = pal.glow; ctx.shadowBlur = 32;
  _roundRect(ctx, artX - 16, artY - 16, artSize + 32, artSize + 32, 32);
  ctx.fillStyle = pal.artFill; ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = pal.border; ctx.stroke();
  ctx.save(); _roundRect(ctx, artX, artY, artSize, artSize, 24); ctx.clip(); ctx.imageSmoothingEnabled = false; ctx.drawImage(artCanvas, artX, artY, artSize, artSize); ctx.restore(); ctx.imageSmoothingEnabled = true;

  const contentX = margin + 46;
  const contentW = W - margin*2 - 92;
  y = artY + artSize + 74;
  const owner = window.OWNER_CACHE?.[id] || document.getElementById('mOwner')?.dataset?.address || '';
  const traitCount = typeof getTraitCount === 'function' ? getTraitCount(row) : keepEntries(row.traits).length;
  const chips = [];
  if(opts.toggles.traitCount) chips.push('Traits: ' + traitCount);
  if(opts.toggles.owner && owner) chips.push('Owner ' + _shareCardShortAddr(owner));
  ctx.font = '800 28px Space Grotesk, Segoe UI, sans-serif';
  let cx = contentX;
  for(const chip of chips){
    const cw = Math.min(contentW, Math.ceil(ctx.measureText(chip).width) + 34);
    _roundRect(ctx, cx, y, cw, 48, 14); ctx.fillStyle = pal.statBg; ctx.fill(); ctx.strokeStyle = pal.statBorder; ctx.stroke();
    ctx.fillStyle = pal.stat; ctx.fillText(_ellipsizeCanvasText(ctx, chip, cw - 30), cx + 17, y + 33);
    cx += cw + 14;
  }
  if(chips.length) y += 76;
  if(opts.toggles.tokenTags){
    const tags = await computeMarketPersonalityTags(id, row);
    ctx.font = '900 23px Space Grotesk, Segoe UI, sans-serif';
    cx = contentX;
    for(const tag of tags.slice(0,4)){
      const label = tag.label;
      const tw = Math.ceil(ctx.measureText(label).width) + 30;
      if(cx + tw > contentX + contentW){ cx = contentX; y += 42; }
      _roundRect(ctx, cx, y - 31, tw, 38, 19); ctx.fillStyle = 'rgba(28,255,175,.09)'; ctx.fill(); ctx.strokeStyle = 'rgba(28,255,175,.24)'; ctx.stroke();
      ctx.fillStyle = '#d7f7ef'; ctx.fillText(label, cx + 15, y - 5);
      cx += tw + 10;
    }
    if(tags.length) y += 36;
  }
  if(opts.toggles.holderTags){
    const holderCtx = studioHolderContext(id, owner);
    if(holderCtx.ids.length){
      const htags = await computeHolderTags(holderCtx.address, holderCtx.ids);
      ctx.font = '800 21px Space Grotesk, Segoe UI, sans-serif';
      cx = contentX;
      if(holderCtx.ownsToken){
        const verified = 'Verified holder';
        const vw = Math.ceil(ctx.measureText(verified).width) + 30;
        _roundRect(ctx, cx, y - 28, vw, 34, 17); ctx.fillStyle = 'rgba(28,255,175,.095)'; ctx.fill(); ctx.strokeStyle = 'rgba(28,255,175,.28)'; ctx.stroke();
        ctx.fillStyle = '#d7f7ef'; ctx.fillText(verified, cx + 14, y - 5);
        cx += vw + 10;
      }
      for(const tag of htags.slice(0,3)){
        const tw = Math.ceil(ctx.measureText(tag.label).width) + 28;
        _roundRect(ctx, cx, y - 28, tw, 34, 17); ctx.fillStyle = 'rgba(255,255,255,.055)'; ctx.fill(); ctx.strokeStyle = pal.border; ctx.stroke();
        ctx.fillStyle = '#f8fafc'; ctx.fillText(tag.label, cx + 14, y - 5);
        cx += tw + 10;
      }
      if(htags.length || holderCtx.ownsToken) y += 34;
    }
  }
  if(opts.toggles.comboInsight){
    try{
      const combo = await buildComboInsights(id, row);
      const insight = combo?.insights?.[0]?.text;
      if(insight){
        ctx.font = '800 25px Space Grotesk, Segoe UI, sans-serif'; ctx.fillStyle = pal.traitAccent;
        ctx.fillText(_ellipsizeCanvasText(ctx, insight, contentW), contentX, y);
        y += 54;
      }
    }catch(_){}
  }
  if(opts.toggles.topTraits){
    const traits = studioTraitSelection(row, opts);
    drawStudioTraitRows(ctx, traits.slice(0, 10), contentX, y, contentW, H - margin - 40, pal, 'story');
  }
  return canvas;
}
async function renderStudioSquareCanvas(id, row, opts, canvas, ctx, W, H, pal){
  fillStudioBackground(ctx, W, H, pal, opts.background);
  const margin = 58;
  _roundRect(ctx, margin, margin, W - margin*2, H - margin*2, 38);
  ctx.fillStyle = opts.background === 'frosted' ? 'rgba(255,255,255,.035)' : pal.glass;
  ctx.shadowColor = pal.glow; ctx.shadowBlur = 24; ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = pal.border; ctx.stroke();
  const osRank = OS_RANK_MAP?.get(id) || OS_RANK_MAP?.get(String(id)) || null;
  if(opts.toggles.collection) drawStudioCollection(ctx, margin + 34, 116);
  const artSize = 610;
  const artX = Math.round((W - artSize) / 2);
  const artY = 158;
  const artCanvas = await _tokenCanvasWithBackground(id, 960);
  ctx.shadowColor = pal.glow; ctx.shadowBlur = 24; _roundRect(ctx, artX - 12, artY - 12, artSize + 24, artSize + 24, 28); ctx.fillStyle = pal.artFill; ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = pal.border; ctx.stroke();
  ctx.save(); _roundRect(ctx, artX, artY, artSize, artSize, 22); ctx.clip(); ctx.imageSmoothingEnabled = false; ctx.drawImage(artCanvas, artX, artY, artSize, artSize); ctx.restore(); ctx.imageSmoothingEnabled = true;
  let y = artY + artSize + 76;
  const x = margin + 44;
  const w = W - margin*2 - 88;
  if(opts.toggles.tokenId){
    ctx.font = '900 70px Space Grotesk, Segoe UI, sans-serif'; ctx.fillStyle = contrastTextFor(pal.bg?.[0] || '#08111a');
    const title = '#' + id; ctx.fillText(title, x, y);
    if(opts.toggles.rank && osRank) _drawShareCardRank(ctx, osRank, x + ctx.measureText(title).width + 22, y - 16);
    y += 58;
  }
  if(opts.toggles.tokenTags){
    const tags = await computeMarketPersonalityTags(id, row);
    ctx.font = '900 21px Space Grotesk, Segoe UI, sans-serif';
    let tx = x;
    for(const tag of tags.slice(0,2)){
      const tw = Math.ceil(ctx.measureText(tag.label).width) + 28;
      _roundRect(ctx, tx, y - 28, tw, 36, 18); ctx.fillStyle = 'rgba(28,255,175,.09)'; ctx.fill(); ctx.strokeStyle = 'rgba(28,255,175,.24)'; ctx.stroke();
      ctx.fillStyle = '#d7f7ef'; ctx.fillText(tag.label, tx + 14, y - 4);
      tx += tw + 10;
    }
    if(tags.length) y += 40;
  }
  if(opts.toggles.comboInsight){
    try{
      const combo = await buildComboInsights(id, row);
      const insight = combo?.insights?.[0]?.text;
      if(insight){
        ctx.font = '800 25px Space Grotesk, Segoe UI, sans-serif'; ctx.fillStyle = pal.traitAccent;
        ctx.fillText(_ellipsizeCanvasText(ctx, insight, w), x, y);
        return canvas;
      }
    }catch(_){}
  }
  if(opts.toggles.topTraits){
    const traits = studioTraitSelection(row, opts).slice(0,2);
    drawStudioTraitRows(ctx, traits, x, y, w, H - margin - 28, pal, 'square');
  }
  return canvas;
}
async function renderStudioCanvas(id, opts, targetCanvas){
  id = Number(id);
  const row = (ROW_CACHE && ROW_CACHE.get(id)) || await fetchRow(id);
  const { W, H } = studioDims(opts.layout);
  const canvas = targetCanvas || document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha:false });
  ctx.imageSmoothingEnabled = true;
  const pal = applyStudioColorsToPalette(_getShareCardPalette(opts.palette), opts);
  if(opts.layout === 'story') return await renderStudioStoryCanvas(id, row, opts, canvas, ctx, W, H, pal);
  if(opts.layout === 'square') return await renderStudioSquareCanvas(id, row, opts, canvas, ctx, W, H, pal);
  fillStudioBackground(ctx, W, H, pal, opts.background);

  const margin = Math.round(Math.min(W,H) * .055);
  ctx.shadowColor = pal.glow;
  ctx.shadowBlur = opts.background === 'frosted' ? 14 : 30;
  _roundRect(ctx, margin, margin, W - margin*2, H - margin*2, Math.max(24, margin*.65));
  ctx.fillStyle = opts.background === 'frosted' ? 'rgba(255,255,255,.035)' : pal.glass;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = pal.border;
  ctx.lineWidth = Math.max(1, W/700);
  ctx.stroke();

  const isWide = opts.layout === 'wide';
  const enabledSections = ['tokenTags','comboInsight','topTraits','owner','holderTags'].filter(k => opts.toggles[k]).length;
  const density = enabledSections + (opts.toggles.collection ? 1 : 0) + (opts.toggles.tokenId ? 1 : 0);
  const scale = opts.layout === 'story' ? .96 : opts.layout === 'square' ? .90 : (density > 5 ? .88 : .96);
  const artSize = isWide ? Math.min(430, H - margin*3) : Math.min(W - margin*4, opts.layout === 'story' ? 720 : 520);
  const artX = isWide ? margin + 34 : Math.round((W - artSize) / 2);
  const artY = isWide ? Math.round((H - artSize) / 2) : margin + 62;
  const artCanvas = await _tokenCanvasWithBackground(id, 960);
  ctx.shadowColor = pal.glow; ctx.shadowBlur = 22;
  _roundRect(ctx, artX - 12, artY - 12, artSize + 24, artSize + 24, 24);
  ctx.fillStyle = pal.artFill; ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = pal.border; ctx.stroke();
  ctx.save(); _roundRect(ctx, artX, artY, artSize, artSize, 18); ctx.clip(); ctx.imageSmoothingEnabled = false; ctx.drawImage(artCanvas, artX, artY, artSize, artSize); ctx.restore(); ctx.imageSmoothingEnabled = true;

  const contentX = isWide ? artX + artSize + 44 : margin + 36;
  const contentW = isWide ? W - contentX - margin - 36 : W - margin*2 - 72;
  let y = isWide ? artY + 2 : artY + artSize + 54;
  const osRank = OS_RANK_MAP?.get(id) || OS_RANK_MAP?.get(String(id)) || null;
  const traitCount = typeof getTraitCount === 'function' ? getTraitCount(row) : keepEntries(row.traits).length;
  const owner = window.OWNER_CACHE?.[id] || document.getElementById('mOwner')?.dataset?.address || '';

  if(opts.toggles.collection){ drawStudioCollection(ctx, contentX, y); y += Math.round(58 * scale); }
  if(opts.toggles.tokenId){
    ctx.fillStyle = contrastTextFor(pal.bg?.[0] || '#08111a'); ctx.font = `800 ${Math.round((isWide ? 60 : 70) * scale)}px Space Grotesk, Segoe UI, sans-serif`; ctx.textAlign = 'left';
    const title = '#' + id; ctx.fillText(title, contentX, y);
    if(opts.toggles.rank && osRank) _drawShareCardRank(ctx, osRank, contentX + ctx.measureText(title).width + 22, y - 14);
    y += Math.round((isWide ? 52 : 64) * scale);
  }
  const chips = [];
  if(opts.toggles.traitCount) chips.push('Traits: ' + traitCount);
  if(opts.toggles.owner && owner) chips.push('Owner ' + _shareCardShortAddr(owner));
  ctx.font = `700 ${Math.round(20 * scale)}px Space Grotesk, Segoe UI, sans-serif`;
  let chipX = contentX;
  for(const chip of chips){
    const w = Math.min(contentW, Math.ceil(ctx.measureText(chip).width) + 24);
    _roundRect(ctx, chipX, y, w, Math.round(34*scale), 10); ctx.fillStyle = pal.statBg; ctx.fill(); ctx.strokeStyle = pal.statBorder; ctx.stroke();
    ctx.fillStyle = pal.stat; ctx.fillText(_ellipsizeCanvasText(ctx, chip, w - 22), chipX + 12, y + Math.round(23*scale));
    chipX += w + 10;
    if(chipX > contentX + contentW - 110){ chipX = contentX; y += 42; }
  }
  if(chips.length) y += Math.round(54 * scale);

  if(opts.toggles.tokenTags){
    const tags = await computeMarketPersonalityTags(id, row);
    ctx.font = `800 ${Math.round(16 * scale)}px Space Grotesk, Segoe UI, sans-serif`;
    let tagX = contentX;
    for(const tag of tags.slice(0,3)){
      const label = tag.label;
      const w = Math.ceil(ctx.measureText(label).width) + 22;
      if(tagX + w > contentX + contentW){ tagX = contentX; y += 32; }
      _roundRect(ctx, tagX, y - 22, w, 28, 14); ctx.fillStyle = 'rgba(28,255,175,.08)'; ctx.fill(); ctx.strokeStyle = 'rgba(28,255,175,.22)'; ctx.stroke();
      ctx.fillStyle = '#d7f7ef'; ctx.fillText(label, tagX + 11, y - 3);
      tagX += w + 8;
    }
    if(tags.length) y += Math.round(30 * scale);
  }
  if(opts.toggles.holderTags){
    const holderCtx = studioHolderContext(id, owner);
    if(holderCtx.ids.length){
      const holderTags = await computeHolderTags(holderCtx.address, holderCtx.ids);
      ctx.font = `800 ${Math.round(15 * scale)}px Space Grotesk, Segoe UI, sans-serif`;
      let hx = contentX;
      if(holderCtx.ownsToken){
        const label = 'Verified holder';
        const w = Math.ceil(ctx.measureText(label).width) + 22;
        _roundRect(ctx, hx, y - 20, w, 27, 14); ctx.fillStyle = 'rgba(28,255,175,.085)'; ctx.fill(); ctx.strokeStyle = 'rgba(28,255,175,.26)'; ctx.stroke();
        ctx.fillStyle = '#d7f7ef'; ctx.fillText(label, hx + 11, y - 2);
        hx += w + 8;
      }
      for(const tag of holderTags.slice(0,3)){
        const label = tag.label;
        const w = Math.ceil(ctx.measureText(label).width) + 22;
        if(hx + w > contentX + contentW){ hx = contentX; y += 30; }
        _roundRect(ctx, hx, y - 20, w, 27, 14); ctx.fillStyle = 'rgba(255,255,255,.055)'; ctx.fill(); ctx.strokeStyle = pal.border; ctx.stroke();
        ctx.fillStyle = '#f8fafc'; ctx.fillText(label, hx + 11, y - 2);
        hx += w + 8;
      }
      if(holderTags.length || holderCtx.ownsToken) y += Math.round(30 * scale);
    }
  }

  if(opts.toggles.comboInsight){
    try{
      const combo = await buildComboInsights(id, row);
      const insight = combo?.insights?.[0]?.text;
      if(insight){
        ctx.font = `700 ${Math.round(17 * scale)}px Space Grotesk, Segoe UI, sans-serif`; ctx.fillStyle = pal.traitAccent;
        ctx.fillText(_ellipsizeCanvasText(ctx, insight, contentW), contentX, y);
        y += Math.round(38 * scale);
      }
    }catch(_){}
  }

  if(opts.toggles.topTraits){
    let traits = studioTraitSelection(row, opts);
    const available = H - margin - y - 18;
    const rowH = Math.round((isWide ? 43 : 54) * scale);
    const maxTraitRows = Math.max(2, Math.min(opts.layout === 'story' ? 8 : 6, Math.floor((available - 36) / (rowH + 5))));
    traits = traits.slice(0, maxTraitRows);
    ctx.fillStyle = pal.traitLabel; ctx.font = `800 ${Math.round(17 * scale)}px Space Grotesk, Segoe UI, sans-serif`; ctx.fillText('TOP TRAITS', contentX, y); y += Math.round(36 * scale);
    for(const t of traits){
      if(y + rowH > H - margin - 16) break;
      _roundRect(ctx, contentX, y - 25, contentW, rowH, 12); ctx.fillStyle = pal.traitRow; ctx.fill(); ctx.strokeStyle = pal.traitBorder; ctx.stroke();
      const pct = t.pct == null ? '' : (t.pct < .1 ? t.pct.toFixed(3) : t.pct.toFixed(1)) + '%';
      ctx.textAlign = 'left'; ctx.font = `700 ${Math.round(12 * scale)}px Space Grotesk, Segoe UI, sans-serif`; ctx.fillStyle = pal.traitLabel; ctx.fillText(_ellipsizeCanvasText(ctx, String(t.trait).toUpperCase(), contentW*.56), contentX + 16, y - 6);
      ctx.font = `700 ${Math.round(19 * scale)}px Space Grotesk, Segoe UI, sans-serif`; ctx.fillStyle = pal.traitValue; ctx.fillText(_ellipsizeCanvasText(ctx, String(t.value), contentW*.62), contentX + 16, y + 14);
      ctx.textAlign = 'right'; ctx.font = `800 ${Math.round(18 * scale)}px Space Grotesk, Segoe UI, sans-serif`; ctx.fillStyle = pal.traitAccent; ctx.fillText(pct, contentX + contentW - 16, y + 4); ctx.textAlign = 'left';
      y += rowH + 5;
    }
  }
  return canvas;
}
async function openTraitViewStudio(id){
  STUDIO_TOKEN_ID = Number(id || window._modalCurrentId || 0);
  if(!STUDIO_TOKEN_ID) return;
  document.getElementById('studioModal')?.classList.add('open');
  const pal = document.getElementById('mShareCardPalette')?.value;
  if(pal) document.getElementById('studioPalette').value = pal;
  syncStudioColorDefaults();
  const row = await fetchRow(STUDIO_TOKEN_ID);
  const list = document.getElementById('studioTraitList');
  if(list){
    list.innerHTML = _shareCardTraitRows(row, 99).map((t,idx)=>`<label class="studio-check"><input type="checkbox" value="${comboEsc(t.trait)}::${comboEsc(t.value)}" ${idx<5?'checked':''}>${comboEsc(t.trait)}: ${comboEsc(t.value)}</label>`).join('');
  }
  document.querySelectorAll('#studioModal select,#studioModal input').forEach(el => {
    el.oninput = () => scheduleTraitViewStudioPreview(el.id === 'studioPalette');
    el.onchange = () => scheduleTraitViewStudioPreview(el.id === 'studioPalette');
  });
  renderTraitViewStudioPreview();
}
function closeTraitViewStudio(){
  document.getElementById('studioModal')?.classList.remove('open');
}
async function renderTraitViewStudioPreview(){
  if(!STUDIO_TOKEN_ID) return;
  const canvas = document.getElementById('studioPreview');
  await renderStudioCanvas(STUDIO_TOKEN_ID, studioOptions(), canvas);
}
function scheduleTraitViewStudioPreview(resetColors){
  if(resetColors) syncStudioColorDefaults();
  clearTimeout(STUDIO_PREVIEW_TIMER);
  STUDIO_PREVIEW_TIMER = setTimeout(()=>renderTraitViewStudioPreview(), 120);
}
async function exportTraitViewStudioPng(){
  if(!STUDIO_TOKEN_ID) return;
  const btn = document.getElementById('studioExportBtn');
  try{
    if(typeof ensureTraitViewDownloadsLoaded === 'function') await ensureTraitViewDownloadsLoaded();
    _setDownloadBtnState(btn, 'Exporting...', true);
    const canvas = await renderStudioCanvas(STUDIO_TOKEN_ID, studioOptions());
    await _downloadCanvasAsPng(canvas, `ocas-${STUDIO_TOKEN_ID}-studio-card.png`);
  }catch(e){
    console.error('TraitView Studio export:', e);
    alert('Studio export error: ' + (e?.message || String(e)));
  }finally{
    if(typeof _setDownloadBtnState === 'function') _setDownloadBtnState(btn, 'Export PNG', false);
  }
}

/* SVG download helper moved to js/downloads.js */

window.addEventListener('resize', ()=>{
  if(window.VS && VS.enabled && Array.isArray(VS.ids) && VS.ids.length){
    clearTimeout(window.__vsResizeTimer);
    window.__vsResizeTimer = setTimeout(()=>{
      const v = localStorage.getItem('viewMode') || 'standard';
      VS.init(VS.ids, v === 'list' ? 'list' : (v === 'compact' ? 'compact' : 'grid'));
    }, 120);
  }
});

// init() handles ?jump= URL param internally after full data loads
init();

// ---- extracted script block ----

/* ---- View mode icons wiring ---- */
(function(){
  const icons = document.getElementById('viewSwitch');
  const sel = document.getElementById('viewMode');
  const KEY = 'viewMode';
  function syncActive(){
    if(!icons || !sel) return;
    icons.querySelectorAll('.viewbtn').forEach(b=>b.classList.toggle('active', b.dataset.view === sel.value));
  }
  function setView(v){
    if(!sel) return;
    const prev = sel.value;
    sel.value = v;
    localStorage.setItem(KEY, v);
    if (typeof applyViewMode === 'function') applyViewMode(v);
    syncActive();
    if(window.VS && VS.enabled && Array.isArray(VS.ids) && VS.ids.length){
      VS.init(VS.ids, v === 'list' ? 'list' : (v === 'compact' ? 'compact' : 'grid'));
    }
    // Inject data rows when switching TO list view (no full re-render needed)
    if(v === 'list' && prev !== 'list'){
      const tg = document.getElementById('tokenGrid');
      if(tg) tg.querySelectorAll('.token[data-id]').forEach(card => {
        if(card.querySelector('.vs-datarow')) return; // already has it
        const id = +card.dataset.id;
        const rankVal = (typeof RARITY_OBS_RANK !== 'undefined') ? RARITY_OBS_RANK.get(id) : null;
        const eth = (typeof getListingEth === 'function') ? getListingEth(id) : null;
        const priceStr = eth != null ? (eth >= 1 ? eth.toFixed(3) : eth.toFixed(4)) : null;
        const tmeta = card.querySelector('.tmeta');
        if(tmeta && typeof listStatsRowHtml === 'function'){
          tmeta.insertAdjacentHTML('beforeend', listStatsRowHtml(id, rankVal, priceStr));
        }
      });
    }
    // Remove data rows when leaving list view
    if(prev === 'list' && v !== 'list'){
      const tg = document.getElementById('tokenGrid');
      if(tg) tg.querySelectorAll('.vs-datarow').forEach(el => el.remove());
    }
  }
  if (icons && sel){
    icons.addEventListener('click', (e)=>{
      const b = e.target.closest('.viewbtn'); if(!b) return;
      withNoTransitions(document.getElementById('tokenGrid'), ()=> setView(b.dataset.view));
      // NOTE: do NOT re-render on view change; just toggle classes to avoid lag
    });
    // initial state
    const saved = localStorage.getItem(KEY);
    if (saved) setView(saved); else syncActive();
  }
})();

// ---- extracted script block ----

function withNoTransitions(el, fn){
  if(!el) return fn();
  const prev = el.style.transition;
  el.style.transition = 'none';
  el.querySelectorAll('*').forEach(n=>n.style.transition='none');
  try { fn(); } finally {
    requestAnimationFrame(()=>{
      el.style.transition = prev || '';
      el.querySelectorAll('*').forEach(n=>n.style.transition='');
    });
  }
}

async function quickPreviewOutside(id){
  try{
    const row = await fetchRow(id);
    const host = document.getElementById('jumpSpot');
    const body = document.getElementById('jumpSpotBody');
    if (!host || !body) return;
    // build a small card (reuse same HTML pieces)
    const d = document.createElement('div');
    d.className = 'token';
    d.style.width = '360px';
    d.style.display = 'grid';
    d.style.gridTemplateColumns = '112px 1fr';
    d.style.gap = '10px';
    d.innerHTML = `${gridThumbHtml(id,row)}<div class="tmeta"><div class="idline">#${id} ${priceBadgeHtml(id)}</div>${traitsMiniHtml(row)}</div>`;
    body.innerHTML = '';
    body.appendChild(d);
    host.style.display = 'block';
  }catch(err){ console.error('quickPreviewOutside failed', err); }
}

// ==== Theme picker ====
(function(){
  const root = document.documentElement;
  const saved = localStorage.getItem('theme') || 'slate';
  function pick(t){
    root.setAttribute('data-theme', t);
    localStorage.setItem('theme', t);
    document.querySelectorAll('#themePicker .tbtn').forEach(b=>b.classList.toggle('active', b.dataset.theme===t));
    if (typeof updateMobileThemeLabel === 'function') updateMobileThemeLabel(t);
    if (typeof updateMobileThemeButtonAppearance === 'function') updateMobileThemeButtonAppearance(t);
    if (typeof updateDesktopThemeButtonAppearance === 'function') updateDesktopThemeButtonAppearance(t);
  }
  document.addEventListener('click', (e)=>{
    const b = e.target.closest('#themePicker .tbtn');
    if (b){ pick(b.dataset.theme); }
  });
  pick(saved); setTimeout(()=>pick(saved),0);
})();
function osAssetUrl(id){
  const chain = (window.CHAIN || 'ethereum');
  const addr  = (window.CONTRACT || '<YOUR_CONTRACT_ADDRESS>');
  return `https://opensea.io/assets/${chain}/${addr}/${id}`;
}

// Live refresh while "Only show listed" is on
let liveTimer = null;
function setLiveRefresh(on){
  if(on && !liveTimer){
    liveTimer = setInterval(async ()=>{
      try{
        const tg = document.getElementById('tokenGrid');
        if(!tg) return;
        const ids = (window.LAST_IDS||[]).slice(0, 400);
        if(!ids.length || !window.LIVE_ENDPOINT) return;
        const u = new URL(window.LIVE_ENDPOINT + '/os/collection-listings', location.origin);
        u.searchParams.set('slug', LIVE_SLUG);
        u.searchParams.set('contract', LIVE_CONTRACT);
        u.searchParams.set('chain', 'ethereum');
        const resp = await fetch(u.toString());
        if(!resp.ok) return;
        const j = await resp.json();
        const listingsData2 = j.listings || j;
        // Normalize price_eth same as fetchLiveForIds
        for(const [k,v] of Object.entries(listingsData2)){
          if(v && v.opensea){
            if(v.opensea.price_eth == null || v.opensea.price_eth === 0){
              v.opensea.price_eth = parseEthMaybeWei(v.opensea.price);
            }
            v.opensea.price_eth = v.opensea.price_eth != null ? Number(v.opensea.price_eth) : null;
          }
        }
        window.LISTINGS = window.LISTINGS || {};
        Object.keys(listingsData2).forEach(k=> window.LISTINGS[k] = { ...(window.LISTINGS[k]||{}), ...listingsData2[k] });
        if(document.getElementById('onlyListed').checked){
          const keep = tg.scrollTop;
          await renderTokenGridFromState();
          tg.scrollTop = keep;
        }
      }catch(e){/* noop */}
    }, 25000);
  }else if(!on && liveTimer){
    clearInterval(liveTimer); liveTimer = null;
  }
}
const _only = document.getElementById('onlyListed');
  // Sync pill visual state whenever checkbox state changes
  _only.addEventListener('change', ()=>{
    const pill = document.getElementById('onlyListedPill');
    if(pill) pill.classList.toggle('pill-on', _only.checked);
  });
if(_only){
  _only.addEventListener('change', (e)=> setLiveRefresh(e.target.checked));
  setLiveRefresh(_only.checked);
}

// ---- extracted script block ----

// === Patch: Speed up initial interactivity ===
(function(){
  const idle = (cb)=> (window.requestIdleCallback ? requestIdleCallback(cb, {timeout:1200}) : setTimeout(cb,0));

  // 1) If drawOrUpdateChart exists, run it when idle so list/grid becomes interactive first
  const waitForDraw = () => {
    if (typeof window.drawOrUpdateChart === 'function') {
      const _draw = window.drawOrUpdateChart;
      window.drawOrUpdateChart = (...args) => idle(()=>_draw.apply(window,args));
    } else {
      // Retry a few times until the app script defines it
      let tries = 0;
      const t = setInterval(()=>{
        if (typeof window.drawOrUpdateChart === 'function') {
          clearInterval(t);
          const _draw = window.drawOrUpdateChart;
          window.drawOrUpdateChart = (...args) => idle(()=>_draw.apply(window,args));
        } else if (++tries > 50) clearInterval(t);
      }, 40);
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForDraw);
  } else {
    waitForDraw();
  }

  // 2) Pre-warm traits manifest fetch (non-blocking)
  idle(()=>{
    try { fetch('./data/traits_manifest.json', {cache:'force-cache'}).catch(()=>{}); } catch(e){}
  });
})();

// ---- extracted script block ----

/* Inline rank once: "#ID • Rank N" (avoid image thumbnails) */
(function(){
  function getRankFromGrid(id){
    const grid = document.querySelector('#tokenGrid, #grid, .grid');
    if (!grid) return null;
    const card = grid.querySelector('[data-id="'+id+'"], [data-token="'+id+'"], [data-key="'+id+'"]');
    if (!card) return null;
    const rankEl = card.querySelector('[data-rank], .badge-rank, .rank, .card-head');
    if (rankEl){
      const attr = rankEl.getAttribute && rankEl.getAttribute('data-rank');
      if (attr && !isNaN(parseInt(attr,10))) return parseInt(attr,10);
      const m = (rankEl.textContent||'').match(/Rank\s*(\d+)/i);
      if (m) return parseInt(m[1],10);
    }
    const m2 = (card.textContent||'').match(/Rank\s*(\d+)/i);
    return m2 ? parseInt(m2[1],10) : null;
  }

  function isThumb(el){
    if (!el) return false;
    const c = (el.className||'').toString().toLowerCase();
    if (c.includes('thumb') || c.includes('image') || c.includes('img') || c.includes('preview') || el.tagName==='IMG') return true;
    if (el.closest('figure, .thumb, .thumbnail, .image, .img, .preview')) return true;
    if (el.querySelector && el.querySelector('img')) return true;
    return false;
  }

  function findIdHeaderEl(card){
    const all = card.querySelectorAll('*');
    let candidate = null;
    for (const el of all){
      const txt = (el.textContent||'').trim();
      if (!/#\d{1,6}\b/.test(txt)) continue;
      if (isThumb(el)) continue;                    // skip image/thumbnail areas
      if (isThumb(el.parentElement)) continue;
      // Prefer bold/heading-like containers
      const tag = el.tagName;
      const weight = getComputedStyle(el).fontWeight;
      const isBoldish = parseInt(weight,10) >= 600 || /^(H\d|STRONG|B)$/.test(tag);
      candidate = el;
      if (isBoldish) break;
    }
    return candidate;
  }

  function enhanceContainer(card){
    const header = findIdHeaderEl(card);
    if (!header) return;
    if ((header.textContent||'').includes('• Rank')) return;
    const m = (header.textContent||'').match(/#(\d{1,6})\b/);
    if (!m) return;
    const tokenId = parseInt(m[1],10);
    const rk = getRankFromGrid(tokenId);
    if (!rk) return;

    let swapped = false;
    header.innerHTML = header.innerHTML.replace(/#(\d{1,6})\b/, function(full,num){
      if (swapped) return full;
      swapped = true;
      return '#' + num + ' &bull; <strong class="rank-inline">Rank ' + rk + '</strong>';
    });

    // Remove any stray bullets further down
    Array.from(card.querySelectorAll('*')).forEach(n => {
      const t = (n.textContent||'').trim();
      if (/^•\s*Rank\s*\d+\s*$/i.test(t)) n.remove();
    });
  }

  function run(){
    const targets = Array.from(document.querySelectorAll('.card')).filter(c => {
      const hd = c.querySelector('.head, h3, h4');
      const text = (hd && hd.textContent || '').toLowerCase();
      return text.includes('compare') || text.includes('pinned');
    });
    targets.forEach(enhanceContainer);
  }

  const mo = new MutationObserver(run);
  window.addEventListener('load', () => {
    run();
    mo.observe(document.body, { childList:true, subtree:true });
  });
})();

// ---- extracted script block ----

(function(){
  const IMG_BASE = 'data/';
  let manifest = null;
  const chunkCache = new Map();

  function _applyFloorChange(el, current, reference){
  if(!el||current==null||reference==null||reference<=0){ if(el) el.style.display='none'; return; }
  const pct = ((current - reference) / reference) * 100;
  if(Math.abs(pct) < 0.5){ el.style.display='none'; return; }
  const up = pct >= 0;
  el.textContent = (up?'▲ ':'▼ ') + Math.abs(pct).toFixed(1)+'%';
  el.style.color  = up ? '#4ade80' : '#f87171';
  el.style.display = '';
}
async function loadManifest(){
    if (manifest) return manifest;
    const r = await fetch(IMG_BASE + 'token_images_manifest.json');
    if (!r.ok) throw new Error('Missing token_images_manifest.json');
    manifest = (await r.json()).chunks;
    manifest.sort((a,b)=> parseInt(a.startId||'0',10)-parseInt(b.startId||'0',10));
    return manifest;
  }

  function findChunkFile(id){
    id = String(id);
    for (const c of manifest){
      const s = parseInt(c.startId||'0',10);
      const e = parseInt(c.endId||'0',10);
      const n = parseInt(id,10);
      if (!isNaN(s) && !isNaN(e) && !isNaN(n) && n>=s && n<=e) return c.file;
    }
    return manifest[manifest.length-1].file;
  }

  async function loadChunk(file){
    if (!chunkCache.has(file)){
      chunkCache.set(file, fetch(IMG_BASE + file).then(r=>r.json()));
    }
    return chunkCache.get(file);
  }

  window.getImageUrl = async function(tokenId){
    await loadManifest();
    const file = findChunkFile(tokenId);
    const data = await loadChunk(file);
    return data[String(tokenId)] || null;
  };

  window.prewarmImageChunkForId = async function(tokenId){
    await loadManifest();
    const file = findChunkFile(tokenId);
    await loadChunk(file);
  };
})();

// ---- extracted script block ----

/* ================================================================
   RECENT SALES — routes through your existing Cloudflare Worker
   Worker URL: https://nft-live-listings.jvweb3.workers.dev/os/events
   Your OpenSea API key is already stored securely in Cloudflare —
   no localStorage needed, no key exposed in the browser.

   HISTORY: OpenSea's cursor pagination lets you go back as far as
   the collection has sales (since mint). Each page = up to 100
   sales. "Load More" fetches the next page using the cursor.
   ================================================================ */
(function(){
  const WORKER_BASE = 'https://nft-live-listings.jvweb3.workers.dev';
  const OS_SLUG     = 'on-chain-all-stars';
  const PAGE_SIZE   = 100;   // max OpenSea allows per request
  const REFRESH_MS  = 60000; // auto-refresh interval for newest sales

  let ALL_SALES      = [];          // full accumulated sale list (grows with Load More)
  let nextCursor     = null;        // OpenSea pagination cursor for older sales
  let salesKnownIds  = new Set();   // for new-sale flash animation
  let isLoadingMore  = false;
  let autoRefreshTimer = null;

  // ── helpers ──────────────────────────────────────────────────────────────
  function timeSince(unixTs){
    const s = Math.floor(Date.now()/1000 - unixTs);
    if(s < 60)    return s + 's ago';
    if(s < 3600)  return Math.floor(s/60) + 'm ago';
    if(s < 86400) return Math.floor(s/3600) + 'h ago';
    const d = Math.floor(s/86400);
    return d === 1 ? '1 day ago' : d + ' days ago';
  }

  function formatDate(unixTs){
    return new Date(unixTs * 1000).toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'});
  }

  function getSaleCurrency(event){
    // Use address as primary signal — most reliable in Seaport
    const addr = (event.payment?.address || event.payment?.token_address || '').toLowerCase();
    if(addr === '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2') return 'WETH';
    if(addr && addr !== '0x0000000000000000000000000000000000000000') return 'WETH';
    // Fallback to symbol
    const sym = (event.payment?.symbol || '').toUpperCase();
    if(sym === 'WETH') return 'WETH';
    return 'ETH';
  }
  function getSaleCurrencyColor(event){
    return getSaleCurrency(event) === 'WETH' ? '#d8b4fe' : '#2dd4bf';
  }

  function formatSaleEth(event){
    try{
      const qty = BigInt(event.payment?.quantity || '0');
      const dec = event.payment?.decimals ?? 18;
      const eth = Number(qty) / Math.pow(10, dec);
      if(!isFinite(eth) || eth <= 0) return null;
      return eth >= 1 ? eth.toFixed(3) : eth.toFixed(4);
    }catch{ return null; }
  }

  function getActiveTraitMap(){
    if(typeof activeTraits !== 'undefined' && activeTraits instanceof Map) return activeTraits;
    return new Map();
  }

  function saleMatchesTraitFilter(sale){
    const traitMap = getActiveTraitMap();
    if(traitMap.size === 0) return true;
    const nftTraits = sale.nft?.traits || [];
    const lookup = {};
    for(const t of nftTraits) lookup[t.trait_type] = String(t.value);
    for(const [name, valueSet] of traitMap){
      if(!lookup[name] || !valueSet.has(lookup[name])) return false;
    }
    return true;
  }

  // ── fetch from Cloudflare Worker (your key lives there securely) ──────────
  async function fetchPage(cursor){
    const qs = new URLSearchParams({
      slug:       OS_SLUG,
      event_type: 'sale',
      limit:      String(PAGE_SIZE),
    });
    // Pass cursor for pagination (loading older history)
    // Worker supports occurred_before which maps to OpenSea's cursor via next param
    if(cursor) qs.set('cursor', cursor);

    const url = `${WORKER_BASE}/os/events?${qs.toString()}`;
    const r   = await fetch(url, { cache: 'no-store' });
    if(!r.ok) throw new Error('Worker error: HTTP ' + r.status);
    const j = await r.json();
    if(!j.ok) throw new Error(j.error || 'Worker returned ok:false');
    return j; // { ok, events[], count, next_cursor? }
  }

  // ── initial load (newest sales) ───────────────────────────────────────────
  async function fetchNewest(isAutoRefresh){
    setStatus('loading');
    try{
      const j = await fetchPage(null);
      const incoming = j.events || [];

      if(isAutoRefresh){
        // prepend new sales we haven't seen yet
        const existingIds = new Set(ALL_SALES.map(s => (s.transaction||s.event_timestamp)+'_'+(s.nft?.identifier||'')));
        const brandNew = incoming.filter(s => !existingIds.has((s.transaction||s.event_timestamp)+'_'+(s.nft?.identifier||'')));
        if(brandNew.length){
          ALL_SALES = [...brandNew, ...ALL_SALES];
          brandNew.forEach(s => { const k = s.nft?.identifier; if(k) salesKnownIds.delete(k); });
        }
      } else {
        ALL_SALES = incoming;
        salesKnownIds.clear();
      }

      nextCursor = j.next_cursor || null;
      await renderSales(isAutoRefresh);
      setStatus('idle');
    }catch(e){
      console.warn('[Sales] fetchNewest error:', e);
      setStatus('error', e.message);
    }
  }

  // ── load more (older history) ─────────────────────────────────────────────
  async function fetchMore(){
    if(isLoadingMore || !nextCursor) return;
    isLoadingMore = true;
    const btn = document.getElementById('salesLoadMoreBtn');
    if(btn){ btn.textContent = 'Loading…'; btn.disabled = true; }

    try{
      const j = await fetchPage(nextCursor);
      const incoming = j.events || [];
      const existingKeys = new Set(ALL_SALES.map(s => (s.transaction||s.event_timestamp)+'_'+(s.nft?.identifier||'')));
      const fresh = incoming.filter(s => !existingKeys.has((s.transaction||s.event_timestamp)+'_'+(s.nft?.identifier||'')));
      ALL_SALES = [...ALL_SALES, ...fresh];
      nextCursor = j.next_cursor || null;
      await renderSales(false);
    }catch(e){
      console.warn('[Sales] fetchMore error:', e);
    }finally{
      isLoadingMore = false;
      const btn2 = document.getElementById('salesLoadMoreBtn');
      if(btn2){
        btn2.textContent = nextCursor ? 'Load More Sales ↓' : 'No more history';
        btn2.disabled = !nextCursor;
      }
    }
  }

  // ── render ────────────────────────────────────────────────────────────────
  async function renderSales(isRefresh){
    const traitMap       = getActiveTraitMap();
    const hasTraitFilter = traitMap.size > 0;

    let toShow = ALL_SALES;
    if(hasTraitFilter) toShow = ALL_SALES.filter(saleMatchesTraitFilter);

    // filter note
    const note = document.getElementById('salesFilterNote');
    if(note) note.style.display = hasTraitFilter ? 'block' : 'none';

    // count badge
    const badge = document.getElementById('salesCountBadge');
    if(badge){
      const total = toShow.length;
      const loaded = ALL_SALES.length;
      badge.textContent = hasTraitFilter
        ? `${total} matching / ${loaded} loaded`
        : `${loaded} loaded`;
    }

    const grid = document.getElementById('salesGrid');
    if(!grid) return;

    if(!toShow.length){
      grid.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:10px 0">' +
        (hasTraitFilter ? 'No sales match the selected traits in the loaded history. Try loading more below.' : 'No sales found.') +
        '</div>';
      updateLoadMoreBtn();
      return;
    }

    const rankMap = (typeof RARITY_MODE !== 'undefined' && RARITY_MODE === 'theoretical' && typeof RARITY_THEO_RANK !== 'undefined' && RARITY_THEO_RANK.size)
      ? RARITY_THEO_RANK : (typeof RARITY_OBS_RANK !== 'undefined' ? RARITY_OBS_RANK : new Map());
    const floorEl = document.getElementById('floorPillValue');
    const floorPrice = floorEl ? parseFloat(floorEl.textContent.replace(/[^0-9.]/g,'')) || 0 : 0;
    const hasTFS = Object.keys(TRAIT_FREQ||{}).length > 0;

    const newIds = new Set(toShow.map(s => s.nft?.identifier));
    const cards = await Promise.all(toShow.map(async sale => {
      const id     = sale.nft?.identifier;
      const img    = sale.nft?.image_url || sale.nft?.display_image_url || '';
      const eth    = formatSaleEth(sale);
      const ts     = sale.event_timestamp;
      const ago    = ts ? timeSince(ts) : '';
      const date   = ts ? formatDate(ts) : '';
      const isNew  = isRefresh && id && !salesKnownIds.has(id);
      const imgHtml = img
        ? `<img src="${img.replace(/"/g,'&quot;')}" alt="#${id}" loading="lazy">`
        : `<div style="color:var(--muted);font-size:11px;padding:8px">No image</div>`;

      const isList = window.SALES_VIEW === 'list';
      const cardClass = `sale-card${isNew?' sale-new-flash':''}${isList?' sales-list-card':''}`;
      const rank = id ? rankMap.get(+id) : null;

      let traitsSection = '';
      if(id && hasTFS && typeof getTopRareTraits === 'function'){
        try{
          const rarest = await getTopRareTraits(+id, 2);
          if(rarest.length) traitsSection = `<div class="mp-traits">${rareTraitRowsHtml(rarest)}</div>`;
        }catch(_){}
      }
      const ethNum = parseFloat(eth) || 0;
      const vsFloor = (typeof vsFloorBadgeHtml === 'function') ? vsFloorBadgeHtml(ethNum, floorPrice) : '';

      return `<div class="${cardClass}" data-id="${id}" onclick="openModal(${+id})">
        <div class="sale-thumb">${imgHtml}</div>
        <div class="sale-body">
          <div class="sale-head">
            <span class="sale-id">#${id} ${id ? `<span style="font-size:10.5px;font-weight:500">${displayRankHtml(+id)}</span>` : ''}</span>
            ${eth ? `<span class="sale-price" style="color:${getSaleCurrencyColor(sale)}">Ξ ${eth} <span style="font-size:10px;opacity:.8">${getSaleCurrency(sale)}</span></span>` : ''}
          </div>
          ${vsFloor}
          ${traitsSection}
          <div class="sale-time" title="${date}">${ago}</div>
        </div>
      </div>`;
    }));

    grid.innerHTML = cards.join('');
    salesKnownIds = newIds;
    updateLoadMoreBtn();
  }

  function updateLoadMoreBtn(){
    const btn = document.getElementById('salesLoadMoreBtn');
    if(!btn) return;
    btn.style.display = 'block';
    btn.disabled = !nextCursor || isLoadingMore;
    btn.textContent = nextCursor ? 'Load More Sales ↓' : 'All sales loaded';
  }

  // ── status helper ─────────────────────────────────────────────────────────
  function setStatus(state, msg){
    const grid = document.getElementById('salesGrid');
    if(state === 'loading' && !ALL_SALES.length && grid){
      grid.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:10px 0">Loading sales…</div>';
    }
    if(state === 'error' && !ALL_SALES.length && grid){
      grid.innerHTML = `<div style="color:#f87171;font-size:12px;padding:10px 0">Could not load sales: ${msg || 'unknown error'}</div>`;
    }
  }

  // ── public hook: called when trait filters change ─────────────────────────
  window.renderSalesForCurrentTraits = function(){ renderSales(false); };

  // ── button wiring ─────────────────────────────────────────────────────────
  const refreshBtn = document.getElementById('salesRefreshBtn');
  if(refreshBtn){
    refreshBtn.onclick = async ()=>{
      refreshBtn.textContent = '↻ …';
      refreshBtn.disabled = true;
      await fetchNewest(false);
      refreshBtn.textContent = '↻ Refresh';
      refreshBtn.disabled = false;
    };
  }

  const loadMoreBtn = document.getElementById('salesLoadMoreBtn');
  if(loadMoreBtn) loadMoreBtn.onclick = fetchMore;

  // ── boot ──────────────────────────────────────────────────────────────────
  fetchNewest(false);
  autoRefreshTimer = setInterval(()=> fetchNewest(true), REFRESH_MS);

})();

// ---- extracted script block ----

/* === Floor Price — fetches via your Cloudflare Worker /os/stats === */
(function(){
  const WORKER    = 'https://nft-live-listings.jvweb3.workers.dev';
  const OS_SLUG   = 'on-chain-all-stars';
  const CONTRACT  = '0x078be86f3104a32313a47815792230a3808642cc';
  const REFRESH   = 120000; // refresh every 2 minutes

  const setText = (id, v) => {
    const el = document.getElementById(id);
    if(el) el.textContent = v;
    syncBottomStatusBar();
  };

  function syncBottomStatusBar(){
    const copy = (fromId, toId) => {
      const from = document.getElementById(fromId);
      const to = document.getElementById(toId);
      if(from && to) to.textContent = from.textContent || '-';
    };
    copy('floorPillValue', 'stickyFloorVal');
    copy('mstatTotVolVal', 'stickyVolVal');
    copy('mstatTotSalesVal', 'stickySalesVal');
    copy('mmetaOwnersVal', 'stickyOwnersVal');
    copy('listingsStatus', 'stickyListingsStatus');
    const stickyListings = document.getElementById('stickyListingsStatus');
    if(stickyListings && (!stickyListings.textContent || stickyListings.textContent === '-')) stickyListings.textContent = 'Live listings';

    const changeEl = document.getElementById('floorChange');
    const stickyChange = document.getElementById('stickyFloorChange');
    if(stickyChange){
      const visible = changeEl && changeEl.style.display !== 'none' && changeEl.textContent.trim();
      stickyChange.textContent = visible ? changeEl.textContent.trim() : '24h -';
      stickyChange.classList.toggle('is-down', !!(visible && stickyChange.textContent.indexOf('▼') >= 0));
      stickyChange.style.color = (visible && changeEl.style.color) ? changeEl.style.color : '';
    }
  }

  window.addEventListener('load', () => {
    const listingsStatus = document.getElementById('listingsStatus');
    if(listingsStatus){
      new MutationObserver(syncBottomStatusBar).observe(listingsStatus, { childList:true, characterData:true, subtree:true });
    }
    syncBottomStatusBar();
  });

  const fmtEth = v => {
    const n = parseFloat(v);
    if(!Number.isFinite(n) || n <= 0) return '—';
    if(n >= 1000) return (n/1000).toFixed(1) + 'k';
    if(n >= 1) return n.toFixed(1);
    if(n >= 0.1) return n.toFixed(2);
    return n.toFixed(4);
  };

  const fmtNum = v => {
    const n = Number(v);
    if(!Number.isFinite(n) || n <= 0) return '—';
    if(n >= 1000000) return (n/1000000).toFixed(1) + 'M';
    if(n >= 10000) return (n/1000).toFixed(0) + 'k';
    if(n >= 1000) return (n/1000).toFixed(1) + 'k';
    return String(Math.round(n));
  };

  function updateMetaRow({ owners, items }){
    setText('mmetaChainVal', 'ETH');
    if(items != null) setText('mmetaItemsVal', fmtNum(items));
    if(owners != null) setText('mmetaOwnersVal', fmtNum(owners));
  }

  async function fetchOwners(){
    try{
      const r = await fetch(`${WORKER}/nft/holders?contract=${CONTRACT}`, { cache: 'force-cache' });
      if(!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if(j?.ok){
        updateMetaRow({ owners: j.unique_wallets, items: j.total_supply || 10000 });
      }
    }catch(e){
      console.warn('[Header] owners fetch error:', e.message);
    }
  }

  async function fetchFloor(){
    try{
      const r = await fetch(`${WORKER}/os/stats?slug=${OS_SLUG}`, { cache: 'no-store' });
      if(!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const t = j?.total || j?.stats || j || {};

      const fp  = t.floor_price ?? j?.floor_price ?? null;
      const sym = t.floor_price_symbol ?? j?.floor_price_symbol ?? 'ETH';
      const floorPriceVal = fp;
      if(floorPriceVal != null) window._lastFloorEth = Number(floorPriceVal);

      const _ivs = j?.intervals || j?.stats?.intervals || [];
      const _day = _ivs.find(x => x.interval === 'one_day') || {};
      setText('mstat24VolVal',    fmtEth(_day.volume   ?? t.one_day_volume ?? t.day_volume   ?? t.volume_24h));
      setText('mstatTotVolVal',   fmtEth(t.total_volume ?? t.volume));
      setText('mstatTotSalesVal', fmtNum(t.total_sales  ?? t.sales));
      setText('mstat24SalesVal',  fmtNum(_day.sales     ?? t.one_day_sales  ?? t.day_sales   ?? t.sales_24h));

      const owners = t.num_owners ?? t.owners ?? t.owner_count ?? null;
      const items  = t.count ?? t.total_supply ?? 10000;
      updateMetaRow({ owners, items });

      const el = document.getElementById('floorPillValue');
      if(!el) return;

      if(fp == null || !Number.isFinite(Number(fp))){
        el.textContent = 'N/A';
        el.className = 'fp-loading';
        syncBottomStatusBar();
        return;
      }

      const val = parseFloat(fp);
      const formatted = val >= 1 ? val.toFixed(3) : val.toFixed(4);
      el.textContent = `Ξ ${formatted} ${sym}`;
      el.className = '';
      syncBottomStatusBar();

      const pill = document.getElementById('floorPill');
      if(pill){
        pill.style.transition = 'box-shadow .3s';
        pill.style.boxShadow = '0 0 0 2px rgba(45,212,191,.4)';
        setTimeout(()=>{ pill.style.boxShadow = 'none'; }, 700);
      }

      // 24h floor change — uses floor_history table (true floor timeline, not sale proxies)
      // floor_history is written by sync-listings.js every ~3 min whenever floor changes.
      // ref_24h = most recent floor snapshot at or before NOW()-24h from the DB.
      (function(){
        const changeEl = document.getElementById('floorChange');
        if(!changeEl || val == null) return;
        const currentFloor = val;
        const CACHE_KEY = '_floorHistory24hCache';
        const cached = (() => { try{ return JSON.parse(sessionStorage.getItem(CACHE_KEY)||'null'); }catch{ return null; } })();
        const now = Date.now();
        if(cached && (now - cached.ts) < 5 * 60 * 1000){
          _applyFloorChange(changeEl, currentFloor, cached.ref_24h);
          syncBottomStatusBar();
          return;
        }
        dbFetch('/db/floor-history', { hours: 48 })
          .then(j => {
            if(!j?.ok || j.ref_24h == null){ changeEl.style.display='none'; syncBottomStatusBar(); return; }
            try{ sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ref_24h: j.ref_24h, ts: now })); }catch{}
            _applyFloorChange(changeEl, currentFloor, j.ref_24h);
            syncBottomStatusBar();
          })
          .catch(() => { changeEl.style.display='none'; syncBottomStatusBar(); });
      })();
    }catch(e){
      console.warn('[Floor] fetch error:', e.message);
      const el = document.getElementById('floorPillValue');
      if(el){ el.textContent = '—'; el.className = 'fp-loading'; syncBottomStatusBar(); }
    }
  }

  fetchFloor();
  fetchOwners();
  setInterval(fetchFloor, REFRESH);
  setInterval(fetchOwners, 300000);
})();

// ---- extracted script block ----

/* ================================================================
   MISPRICED LISTINGS
   Score = price_eth / (1 / rank)  →  lower score = better value
   i.e. cheap price AND high rarity rank = lowest score = top of list
   ================================================================ */
async function buildMispricedPanel(listedIds){
  const grid  = document.getElementById('mispricedGrid');
  const badge = document.getElementById('mispricedCountBadge');
  if(!grid) return;

  if(!listedIds || listedIds.length === 0){
    grid.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:10px 0">No listed tokens found.</div>';
    if(badge) badge.textContent = '0';
    return;
  }

  // Score each listed token: price / rarity_score
  // rarity_score = 1/rank  (rank 1 = rarest = highest value)
  // value_score = price_eth * rank  →  low price * low rank number = best deal
  const rankMap = (typeof RARITY_MODE !== 'undefined' && RARITY_MODE === 'theoretical' && typeof RARITY_THEO_RANK !== 'undefined' && RARITY_THEO_RANK.size)
    ? RARITY_THEO_RANK : (typeof RARITY_OBS_RANK !== 'undefined' ? RARITY_OBS_RANK : new Map());

  const mode = window.MISPRICED_MODE || 'rarity';
  const floorEl = document.getElementById('floorPillValue');
  const floorText = floorEl ? floorEl.textContent.replace(/[^0-9.]/g,'') : '0';
  const floorPrice = parseFloat(floorText) || 0;

  // Pre-compute per-trait rarity scores for all modes
  // traitRarityScore[traitName][value] = -log(count/total) — higher = rarer
  const traitRarityScores = {};
  const total = TOKEN_COUNT || 10000;
  // Always build — needed for insights on all modes
  const freqSource = Object.keys(TRAIT_FREQ||{}).length > 0 ? TRAIT_FREQ : null;
  if(freqSource){
    for(const [traitName, vals] of Object.entries(freqSource)){
      traitRarityScores[traitName] = {};
      for(const [val, count] of Object.entries(vals)){
        const p = count / total;
        traitRarityScores[traitName][val] = -Math.log(Math.max(p, 1e-12));
      }
    }
  }
  const hasTFS = Object.keys(traitRarityScores).length > 0;
  console.log('[Mispriced] TRAIT_FREQ keys:', Object.keys(TRAIT_FREQ||{}).length, 'hasTFS:', hasTFS, 'mode:', mode);

  // For Rare Traits: top 5% rarest tokens
  const rarityThreshold = Math.ceil(total * 0.05);
  const rareTokenIds = new Set();
  if(mode === 'traits'){
    RARITY_OBS_RANK.forEach((rank, id) => {
      if(rank <= rarityThreshold) rareTokenIds.add(id);
    });
  }

  // Use Promise.all so we can await chunk fetches for trait data
  let scored = await Promise.all(listedIds.map(async id => {
    const listing   = window.LISTINGS?.[id]?.opensea;
    const price_eth = (typeof getListingEth === 'function') ? getListingEth(id) : (listing?.price_eth ?? parseEthMaybeWei(listing?.price));
    const rank      = rankMap.get(id) ?? 9999;
    let score;
    let traitInsight = null; // for card descriptions

    if(mode === 'undervalued'){
      // Undervalued by Traits: sum of individual trait rarity scores / price
      // Higher = more rare trait value per ETH — finds trait combos priced like commons
      // Fetch the token's traits from chunk cache
      // Try ROW_CACHE first, then chunk cache directly
      let row = (typeof ROW_CACHE !== 'undefined' && ROW_CACHE.get(id)) || null;
      if(!row && typeof ensureChunk === 'function' && typeof chunkIndexFor === 'function'){
        try{
          const ch = await ensureChunk(chunkIndexFor(id));
          row = ch && ch[String(id)] ? ch[String(id)] : null;
        }catch(e){}
      }
      const traits = row ? (typeof keepEntries === 'function' ? keepEntries(row.traits) : Object.entries(row.traits||{})) : [];
      let traitScore = 0;
      const rareTraitNames = [];
      for(const [traitName, val] of traits){
        const ts = traitRarityScores[traitName] && traitRarityScores[traitName][val];
        if(ts != null){
          traitScore += ts;
          // Flag traits that are in the rarest 10% for their category
          const allVals = Object.values(traitRarityScores[traitName]||{});
          const maxInCat = Math.max(...allVals);
          if(ts > maxInCat * 0.5) rareTraitNames.push(traitName + ': ' + val);
        }
      }
      traitInsight = rareTraitNames.slice(0,3).join(' · ') || null;
      // score = price / traitScore — lower = more trait value per ETH
      score = price_eth != null && traitScore > 0 ? price_eth / traitScore : Infinity;
    } else if(mode === 'traits'){
      // Rare Traits: top 5% rank tokens only, cheapest first
      if(!rareTokenIds.has(id)) return null;
      // Try ROW_CACHE first, then chunk cache directly
      let row = (typeof ROW_CACHE !== 'undefined' && ROW_CACHE.get(id)) || null;
      if(!row && typeof ensureChunk === 'function' && typeof chunkIndexFor === 'function'){
        try{
          const ch = await ensureChunk(chunkIndexFor(id));
          row = ch && ch[String(id)] ? ch[String(id)] : null;
        }catch(e){}
      }
      const traits = row ? (typeof keepEntries === 'function' ? keepEntries(row.traits) : Object.entries(row.traits||{})) : [];
      const rareTraitNames = [];
      for(const [traitName, val] of traits){
        const ts = traitRarityScores[traitName] && traitRarityScores[traitName][val];
        if(ts != null){
          const allVals = Object.values(traitRarityScores[traitName]||{});
          const maxInCat = Math.max(...allVals);
          if(ts > maxInCat * 0.5) rareTraitNames.push(traitName + ': ' + val);
        }
      }
      traitInsight = rareTraitNames.slice(0,3).join(' · ') || null;
      score = price_eth != null ? price_eth : Infinity;
    } else {
      // Best Value: price * (rank/10000)
      score = price_eth != null ? (price_eth * (rank / 10000)) : Infinity;
    }

    // ── Get trait insight for ALL modes ──────────────────────────────────────
    if(!traitInsight && hasTFS){
      let rowT = (typeof ROW_CACHE !== 'undefined' && ROW_CACHE.get(id)) || null;
      if(!rowT && typeof ensureChunk === 'function' && typeof chunkIndexFor === 'function'){
        try{
          const chT = await ensureChunk(chunkIndexFor(id));
          rowT = chT && chT[String(id)] ? chT[String(id)] : null;
        }catch(e){}
      }
      if(rowT){
        const traitsT = typeof keepEntries === 'function' ? keepEntries(rowT.traits) : Object.entries(rowT.traits||{});
        const rareT = [];
        for(const [tn, tv] of traitsT){
          const tScore = traitRarityScores[tn] && traitRarityScores[tn][tv];
          if(tScore != null){
            const maxScore = Math.max(...Object.values(traitRarityScores[tn]||{}));
            // Show trait if it's in the rarer 45% of its category
            if(tScore > maxScore * 0.45) rareT.push(tn + ': ' + tv);
          }
        }
        traitInsight = rareT.slice(0,3).join(' · ') || null;
      }
    }

    return { id, price_eth, rank, score, url: listing?.url, traitInsight };
  }));
  scored = scored.filter(x => x != null && x.price_eth != null && isFinite(x.score));

  // Sort by value score ascending (best deals first)
  scored.sort((a,b) => a.score - b.score);

  if(badge) badge.textContent = scored.length + ' listings';

  // Build cards (show top 50)
  const top = scored.slice(0, 50);
  const cards = await Promise.all(top.map(async ({id, price_eth, rank, score, url, traitInsight}) => {
    // get image
    let imgHtml = '<div style="color:var(--muted);font-size:10px">…</div>';
    try{
      const mapVal = (typeof IMAGES_MAP !== 'undefined' && IMAGES_MAP) ? IMAGES_MAP.get(id) : null;
      const src    = mapVal || (typeof imgForId === 'function' ? imgForId(id) : null);
      if(src){
        const s = String(src).trim();
        if(s.startsWith('<svg')) imgHtml = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center">${s}</div>`;
        else imgHtml = `<img src="${(typeof ipfsToHttp==='function'?ipfsToHttp(s):s)}" alt="#${id}" loading="lazy" style="width:100%;height:100%;object-fit:contain">`;
      }
    }catch(e){}

    const ethFmt   = price_eth >= 1 ? price_eth.toFixed(3) : price_eth.toFixed(4);
    // Score label: top 10% = "🔥 Hot Deal", rest = value score
    const topIdx   = Math.max(0, Math.floor(scored.length * 0.1) - 1);
    const hotThreshold = scored[topIdx]?.score ?? 0;
    const isHot    = score <= hotThreshold;
    const modeLabels = {
      rarity:     isHot ? 'Best Deal' : 'Good Value',
      undervalued: isHot ? 'Undervalued' : 'Trait Value',
      traits:     isHot ? 'Rare & Cheap' : 'Rare Trait',
    };
    const scoreTxt = isHot ? (modeLabels[mode]||'Best Deal') : (modeLabels[mode] || 'Value');
    const scoreClass = isHot ? 'mispriced-score score-hot' : 'mispriced-score';

    // Show only the rarest 3 traits that make this token stand out
    let traitsSection = '';
    try{
      if(typeof getTopRareTraits === 'function' && Object.keys(TRAIT_FREQ||{}).length > 0){
        const rarest = await getTopRareTraits(id, 3);
        if(rarest.length){
          traitsSection = `<div class="mp-traits">${rareTraitRowsHtml(rarest)}</div>`;
        }
      }
    }catch(e){ console.warn('traitSection err',e); }

    return `<div class="mispriced-card" data-id="${id}" onclick="openModal(${id})">
      <div class="mispriced-thumb">${imgHtml}</div>
      <div class="mispriced-body">
        <div class="mispriced-head">
          <span class="mispriced-id">#${id} <span style="font-size:10.5px;font-weight:500">${displayRankHtml(id)}</span></span>
          <span class="mispriced-price">Ξ ${ethFmt}</span>
        </div>
        <span class="${scoreClass}">${scoreTxt}</span>
        ${traitsSection}
        ${url ? `<a class="mp-opensea" href="${url}" target="_blank" rel="noopener" onclick="event.stopPropagation()">OpenSea ↗</a>` : ''}
      </div>
    </div>`;
  }));

  grid.innerHTML = cards.join('');
  // Store all scored for filter/sort re-use
  if(typeof _mispricedAllScored !== 'undefined') _mispricedAllScored = scored;
  // Populate summary row after render
  if(typeof applyMispricedFilters === 'function') applyMispricedFilters();
  if(typeof window._reattachHovers === 'function') window._reattachHovers();
}

// ---- extracted script block ----

/* ── Modal tab switching ─────────────────────────────────────────── */
document.addEventListener('click', function(e){
  const tab = e.target.closest('.modal-tab');
  if(!tab) return;
  const tabName = tab.dataset.tab;
  document.querySelectorAll('.modal-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  document.querySelectorAll('.modal-tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-'+tabName));
  if(tabName === 'similar' && window._modalCurrentId) loadSimilarListedTokens(window._modalCurrentId);
});

async function loadSimilarListedTokens(id){
  const el = document.getElementById('mSimilarTokens');
  if(!el) return;

  const hasListings = window.LISTINGS && Object.keys(window.LISTINGS).length > 0;
  if(!hasListings){
    el.innerHTML = '<div class="price-history-empty">Loading live listings…</div>';
    if(!window.__LISTINGS_BOOTSTRAP_STARTED__ && typeof window.__ensureListingsBootstrap === 'function'){
      window.__ensureListingsBootstrap();
    }
    await new Promise(resolve => {
      let done = false;
      const finish = () => { if(done) return; done = true; clearTimeout(timer); document.removeEventListener('traitview:listings-ready', onReady); resolve(); };
      const onReady = () => finish();
      const timer = setTimeout(finish, 3500);
      document.addEventListener('traitview:listings-ready', onReady, { once:true });
    });
  }

  const hasListingsAfterWait = window.LISTINGS && Object.keys(window.LISTINGS).length > 0;
  if(!hasListingsAfterWait){
    el.innerHTML = '<div class="price-history-empty">Listings are still loading — tap Similar again in a moment.</div>';
    return;
  }

  el.innerHTML = '<div class="price-history-empty">Finding similar listed tokens…</div>';

  const row = await fetchRow(id);
  const traits = keepEntries(row.traits);
  if(!traits.length){ el.innerHTML = '<div class="price-history-empty">No trait data.</div>'; return; }

  // Find rarest trait (lowest frequency) — still done client-side from TRAIT_FREQ
  let rarestTrait = null, rarestFreq = Infinity, rarestVal = null;
  for(const [k,v] of traits){
    const freq = (TRAIT_FREQ[k]?.[v]) || 1;
    if(freq < rarestFreq){ rarestFreq = freq; rarestTrait = k; rarestVal = v; }
  }

  // ── Single Worker DB call replaces chunk loading + in-memory scan ─────────
  let similar = [];
  try{
    const qs = new URLSearchParams({
      trait_name:  rarestTrait,
      trait_value: rarestVal,
      exclude_id:  String(id),
      limit:       '24',
    });
    const r = await fetch(`${LIVE_ENDPOINT}/db/similar-listed?${qs}`);
    if(r.ok){
      const j = await r.json();
      if(j.ok && j.tokens){
        similar = j.tokens.map(t => ({
          id:    t.id,
          price: t.price_eth,
          rank:  RARITY_OBS_RANK.get(t.id) || null,
        }));
      }
    }
  }catch(e){ console.warn('[Similar Listed]', e.message); }

  // Fallback: if Worker endpoint not available, fall back to chunk scan
  if(!similar.length && window.LISTINGS){
    const listedEntries = Object.entries(window.LISTINGS)
      .filter(([idStr, data]) => {
        const sid = Number(idStr);
        return Number.isFinite(sid) && sid >= 1 && sid <= (TOKEN_COUNT || 10000) && sid !== id && data?.opensea?.price_eth != null;
      });
    const neededChunks = new Set(listedEntries.map(([idStr]) => chunkIndexFor(+idStr)));
    await Promise.all([...neededChunks].map(idx => ensureChunk(idx)));
    for(const [idStr, data] of listedEntries){
      const sid = +idStr;
      const ch = CHUNK_CACHE.get(chunkIndexFor(sid));
      const srow = ch?.[String(sid)];
      if(!srow || String(srow.traits?.[rarestTrait]) !== String(rarestVal)) continue;
      similar.push({id: sid, price: data.opensea.price_eth, rank: RARITY_OBS_RANK.get(sid) || null});
    }
    similar.sort((a,b) => a.price - b.price);
  }

  if(!similar.length){
    el.innerHTML = `<div class="price-history-empty">No other listed tokens share <b>${rarestTrait}: ${rarestVal}</b> (${rarestFreq} total in collection).</div>`;
    return;
  }

  const rarity = ((rarestFreq / (TOKEN_COUNT||10000))*100).toFixed(1);
  el.innerHTML = `
    <div style="font-size:11px;color:var(--sub);margin-bottom:8px">
      Sharing rarest trait: <b style="color:var(--text)">${rarestTrait}: ${rarestVal}</b>
      <span style="opacity:.6">(${rarestFreq} tokens Ξ ${rarity}% of collection)</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:5px;max-height:260px;overflow-y:auto">
      ${similar.slice(0,24).map(t => {
        const imgSrc = _getTokenImgSrc(t.id);
        const imgTag = imgSrc ? `<img src="${imgSrc}" style="width:100%;height:100%;object-fit:contain;image-rendering:pixelated;position:absolute;inset:0">` : '';
        return `<div onclick="openModal(${t.id})" style="cursor:pointer;border-radius:7px;overflow:hidden;border:1px solid rgba(255,255,255,.1);background:var(--soft)">
          <div style="position:relative;padding-bottom:100%">${imgTag}</div>
          <div style="padding:3px 4px;font-size:9px">
            <div style="font-weight:700;color:var(--text)">#${t.id}</div>
            <div style="color:#2dd4bf;font-weight:700">Ξ ${t.price.toFixed(4)}</div>
            <div>${displayRankHtml(t.id, "font-size:9px;font-weight:700;")}</div>
          </div>
        </div>`;
      }).join('')}
      ${similar.length > 24 ? `<div style="display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--sub);padding:8px">+${similar.length-24} more</div>` : ''}
    </div>`;
}

const TWIN_CACHE = new Map();
function _twinTraitWeight(name){
  name = String(name || '').toLowerCase();
  if(/type|body|species|skin|base/.test(name)) return 14;
  if(/eyes?/.test(name)) return 8;
  if(/teeth|mouth/.test(name)) return 7;
  if(/hair/.test(name)) return 6;
  if(/facial|beard|mustache|moustache/.test(name)) return 5.5;
  if(/hat|headwear|head|cap|crown|helmet/.test(name)) return 5;
  if(/clothes|shirt|jacket|suit|hoodie|robe|outfit/.test(name)) return 4;
  if(/jewellery|jewelry|chain|earring|bracelet|necklace|ring|grill|watch/.test(name)) return 2;
  if(/background|tattoo/.test(name)) return 1;
  return 1;
}
function _twinTypeValue(row){
  for(const [k,v] of keepEntries(row?.traits || {})){
    if(/type|body|species|skin|base/i.test(k)) return String(v || '').toLowerCase();
  }
  return '';
}
function _twinLabel(baseRow, row, sharedCount){
  const text = Object.values(row?.traits || {}).join(' ').toLowerCase();
  const baseText = Object.values(baseRow?.traits || {}).join(' ').toLowerCase();
  const sameType = keepEntries(baseRow?.traits || {}).some(([k,v]) => /type|body|species/i.test(k) && String(row?.traits?.[k]) === String(v));
  if(sameType && /(zombie|demonic|skeleton|skull|radioactive|laser|red eye|toxic|cursed)/i.test(text) && !/(zombie|demonic|skeleton|skull|radioactive|laser|red eye|toxic|cursed)/i.test(baseText)) return 'Evil Twin';
  if(sharedCount >= 6) return 'Closest Twin';
  return 'Cousin';
}
function _scoreTwin(baseId, baseRow, otherId, otherRow){
  const baseTraits = baseRow?.traits || {};
  const otherTraits = otherRow?.traits || {};
  const baseEntries = keepEntries(baseTraits);
  const sameType = _twinTypeValue(baseRow) && _twinTypeValue(baseRow) === _twinTypeValue(otherRow);
  let maxScore = 0, score = 0;
  const shared = [];
  for(const [name,value] of baseEntries){
    const weight = _twinTraitWeight(name);
    maxScore += weight;
    if(Object.prototype.hasOwnProperty.call(otherTraits, name) && String(otherTraits[name]) === String(value)){
      score += weight;
      shared.push(`${name}: ${value}`);
    }
  }
  const baseCount = typeof getTraitCount === 'function' ? getTraitCount(baseRow) : baseEntries.length;
  const otherCount = typeof getTraitCount === 'function' ? getTraitCount(otherRow) : keepEntries(otherTraits).length;
  const countBonus = Math.max(0, 1 - Math.abs(baseCount - otherCount) / Math.max(baseCount, otherCount, 1)) * 0.75;
  const baseRank = RARITY_OBS_RANK.get(+baseId) || null;
  const otherRank = RARITY_OBS_RANK.get(+otherId) || null;
  const rankBonus = baseRank && otherRank ? Math.max(0, 1 - Math.abs(baseRank - otherRank) / 10000) * 0.35 : 0;
  const typePenalty = sameType ? 1 : 0.28;
  const total = (score * typePenalty) + countBonus + rankBonus + (sameType ? 3 : 0);
  const pct = maxScore ? Math.round(Math.min(99, (total / (maxScore + 1.1)) * 100)) : 0;
  return { id:+otherId, score:total, pct, sharedCount:shared.length, shared:shared.slice(0,4), rank:otherRank };
}
async function findTwinTokens(id){
  id = +id;
  if(TWIN_CACHE.has(id)) return TWIN_CACHE.get(id);
  const baseRow = await fetchRow(id);
  const baseTraits = keepEntries(baseRow?.traits || {});
  if(!baseTraits.length) return [];
  const results = [];
  for(const idx of indices()){
    const ch = await ensureChunk(idx);
    for(const [sid,row] of Object.entries(ch || {})){
      const otherId = +sid;
      if(otherId === id) continue;
      const scored = _scoreTwin(id, baseRow, otherId, row);
      if(scored.sharedCount > 0){
        scored.label = _twinLabel(baseRow, row, scored.sharedCount);
        results.push(scored);
      }
    }
  }
  results.sort((a,b) => (b.score - a.score) || (b.sharedCount - a.sharedCount) || (a.id - b.id));
  const top = results.slice(0, 36);
  TWIN_CACHE.set(id, top);
  return top;
}
function toggleTwinFinder(force){
  const panel = document.getElementById('twinFinderPanel');
  if(!panel) return;
  const open = typeof force === 'boolean' ? force : !panel.classList.contains('open');
  panel.classList.toggle('open', open);
  if(open){
    const input = document.getElementById('twinFinderInput');
    if(input && window._modalCurrentId && !input.value) input.value = window._modalCurrentId;
  }
}
async function runTwinFinderFromInput(id){
  const input = document.getElementById('twinFinderInput');
  const targetId = +(id || input?.value || window._modalCurrentId || 0);
  const host = document.getElementById('twinFinderResults');
  if(!host) return;
  if(!targetId){ host.innerHTML = '<div class="price-history-empty">Enter a token ID to find visual twins.</div>'; return; }
  if(input) input.value = String(targetId);
  toggleTwinFinder(true);
  host.innerHTML = '<div class="price-history-empty">Finding closest twins...</div>';
  try{
    const twins = await findTwinTokens(targetId);
    if(!twins.length){ host.innerHTML = '<div class="price-history-empty">No close trait matches found.</div>'; return; }
    host.innerHTML = twins.slice(0,24).map((t,idx)=>{
      const imgSrc = _getTokenImgSrc(t.id);
      const imgTag = imgSrc ? `<img src="${imgSrc}" style="width:100%;height:100%;object-fit:contain;image-rendering:auto;position:absolute;inset:0">` : '';
      const label = idx === 0 ? 'Closest Twin' : t.label;
      return `<div onclick="openModal(${t.id})" style="cursor:pointer;border-radius:9px;overflow:hidden;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04)">
        <div style="position:relative;padding-bottom:100%;background:var(--soft)">${imgTag}</div>
        <div style="padding:6px;font-size:10px;line-height:1.25">
          <div style="display:flex;justify-content:space-between;gap:6px;align-items:center"><b style="color:var(--text)">#${t.id}</b><span style="color:#2dd4bf;font-weight:800">${t.pct}%</span></div>
          <div style="color:var(--sub);margin-top:2px">${label} - ${t.sharedCount} shared</div>
          <div style="margin-top:2px">${displayRankHtml(t.id, "font-size:9px;font-weight:700;")}</div>
          <div style="color:#94a3b8;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${t.shared.join(', ')}">${t.shared.join(' - ')}</div>
        </div>
      </div>`;
    }).join('');
  }catch(e){
    console.error('[Twin Finder panel]', e);
    host.innerHTML = '<div class="price-history-empty">Could not load twins for this token.</div>';
  }
}

/* ── Wallet View ─────────────────────────────────────────────────── */
(function(){
  // Sidebar Wallet View panel was removed from index.html (moved to the
  // header wallet drawer). This whole IIFE is now dead without it — guard
  // instead of leaving null-reference errors on the elements below.
  if(!document.getElementById('walletLookupBtn')) return;
  const WORKER   = window.LIVE_ENDPOINT || 'https://nft-live-listings.jvweb3.workers.dev';
  const CONTRACT = '0x078be86f3104a32313a47815792230a3808642cc';
  const OS_SLUG  = 'on-chain-all-stars';

  async function lookupWallet(){
    const addr = document.getElementById('walletInput').value.trim();
    if(!addr || addr.length < 10){
      document.getElementById('walletStatus').textContent = 'Enter a valid wallet address.';
      return;
    }

    const grid   = document.getElementById('walletGrid');
    const status = document.getElementById('walletStatus');
    const badge  = document.getElementById('walletCountBadge');
    grid.innerHTML = '';
    const holderTagHost = document.getElementById('walletHolderTags');
    if(holderTagHost){ holderTagHost.innerHTML = ''; holderTagHost.style.display = 'none'; }
    status.textContent = 'Fetching wallet tokens…';
    badge.textContent  = '–';

    try{
      // Use Alchemy via worker to get ALL tokens (no 200 cap)
      // Falls back to OpenSea if Alchemy not configured
      const alchemyUrl = `${WORKER}/nft/wallet?address=${encodeURIComponent(addr)}&contract=${encodeURIComponent(CONTRACT)}`;
      const alchemyR = await fetch(alchemyUrl, { cache: 'no-store' });
      const alchemyJ = alchemyR.ok ? await alchemyR.json() : null;

      let tokenIds = [];
      if(alchemyJ?.ok && alchemyJ.tokenIds?.length){
        tokenIds = alchemyJ.tokenIds;
      } else {
        // Fallback: paginate OpenSea (up to 3 pages = 600 tokens)
        let allNfts = [], cursor = null;
        for(let page = 0; page < 3; page++){
          const qs = new URLSearchParams({ address: addr, slug: OS_SLUG, contract: CONTRACT });
          if(cursor) qs.set('cursor', cursor);
          const r = await fetch(`${WORKER}/os/wallet?${qs}`, { cache: 'no-store' });
          if(!r.ok) break;
          const j = await r.json();
          if(!j.ok) break;
          allNfts = allNfts.concat(j.nfts || []);
          cursor = j.next || null;
          if(!cursor) break;
          await new Promise(r=>setTimeout(r,100));
        }
        tokenIds = allNfts.map(n => +n.identifier);
      }

      if(!tokenIds.length){
        status.textContent = 'No OCAS tokens found in this wallet.';
        badge.textContent  = '0';
        return;
      }

      // Deduplicate and filter to valid OCAS token range
      tokenIds = [...new Set(tokenIds)].filter(id => id >= 1 && id <= 10000);

      badge.textContent = tokenIds.length + ' token' + (tokenIds.length===1?'':'s');
      status.textContent = '';
      window._walletTokenIds = tokenIds; // cache for re-sort
      hydrateHolderTags(addr, tokenIds, 'walletHolderTags');

      function sortWalletTokens(ids, mode){
        const items = ids.map(id => ({
          id,
          rank: RARITY_OBS_RANK.get(id) || null,
          price: window.LISTINGS?.[id]?.opensea?.price_eth ?? null,
        }));
        if(mode === 'rank'){
          items.sort((a,b)=>{ if(a.rank&&b.rank) return a.rank-b.rank; if(a.rank) return -1; if(b.rank) return 1; return a.id-b.id; });
        } else if(mode === 'listed'){
          items.sort((a,b)=>{ const al=a.price!=null?1:0, bl=b.price!=null?1:0; if(al!==bl) return bl-al; if(a.price!=null&&b.price!=null) return a.price-b.price; return (a.rank||9999)-(b.rank||9999); });
        } else if(mode === 'price-asc'){
          items.sort((a,b)=>{ if(a.price==null&&b.price==null) return a.id-b.id; if(a.price==null) return 1; if(b.price==null) return -1; return a.price-b.price; });
        } else {
          items.sort((a,b)=>a.id-b.id);
        }
        return items;
      }

      const activeSort = localStorage.getItem('walletSort') || 'rank';
      const ranked = sortWalletTokens(tokenIds, activeSort);

      // Ensure panel is visible before rendering so grid width is known
      const panel = document.getElementById('walletPanelBody');
      if(panel && panel.style.display === 'none') panel.style.display = 'block';

      // Render cards using local image data (same as grid)
      function _makeWalletCard(t){
        const mapVal = IMAGES_MAP && IMAGES_MAP.get(t.id);
        let imgHtml = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:10px">…</div>';
        if(mapVal){
          const s = String(mapVal).trim();
          if(s.startsWith('<svg')){
            try{ imgHtml = `<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}" alt="#${t.id}" loading="lazy" style="width:100%;height:100%;object-fit:contain;image-rendering:pixelated">`; }catch{}
          } else if(/^data:image\//i.test(s)){
            imgHtml = `<img src="${s}" alt="#${t.id}" loading="lazy" style="width:100%;height:100%;object-fit:contain;image-rendering:pixelated">`;
          }
        }
        const rankHtml = `<div class="wallet-rank">${displayRankHtml(t.id, "font-size:10px;font-weight:700;")}</div>`;
        const priceHtml = (window.LISTINGS && window.LISTINGS[t.id]?.opensea?.price_eth != null)
          ? `<div style="font-size:9px;color:#2dd4bf;font-weight:700">Ξ ${window.LISTINGS[t.id].opensea.price_eth.toFixed(4)}</div>` : '';
        return `<div class="wallet-card" onclick="openModal(${t.id})">
          <div class="wallet-thumb">${imgHtml}</div>
          <div class="wallet-id">#${t.id}</div>
          ${rankHtml}${priceHtml}
        </div>`;
      }

      window._renderWalletGrid = function(items){
        const g = document.getElementById('walletGrid');
        if(!g) return;
        // Render in batches of 60 to avoid blocking the browser
        g.innerHTML = '';
        const WBATCH = 60;
        let idx = 0;
        function paintBatch(){
          if(idx >= items.length) return;
          const slice = items.slice(idx, idx + WBATCH);
          const frag = document.createElement('div');
          frag.innerHTML = slice.map(_makeWalletCard).join('');
          while(frag.firstChild) g.appendChild(frag.firstChild);
          idx += WBATCH;
          if(idx < items.length) requestAnimationFrame(paintBatch);
        }
        paintBatch();
      };
      window._renderWalletGrid(ranked);

      // Status: listed count + lowest listing
      const listed = ranked.filter(t => window.LISTINGS?.[t.id]?.opensea?.price_eth != null);
      if(listed.length){
        const lowest = listed.reduce((a,b) =>
          window.LISTINGS[a.id].opensea.price_eth < window.LISTINGS[b.id].opensea.price_eth ? a : b);
        status.textContent = `${listed.length} listed • Lowest: Ξ ${window.LISTINGS[lowest.id].opensea.price_eth.toFixed(4)} ETH`;
      }

    }catch(e){
      status.textContent = 'Error: ' + e.message;
      badge.textContent  = '–';
    }
  }

  window.setWalletSort = function(mode){
    localStorage.setItem('walletSort', mode);
    document.querySelectorAll('[data-wsort]').forEach(b =>
      b.classList.toggle('active', b.dataset.wsort === mode));
    if(!window._walletTokenIds) return;
    const items = (function sortWalletTokens(ids){
      const its = ids.map(id => ({id, rank: RARITY_OBS_RANK.get(id)||null, price: window.LISTINGS?.[id]?.opensea?.price_eth??null}));
      if(mode==='rank') its.sort((a,b)=>{if(a.rank&&b.rank)return a.rank-b.rank;if(a.rank)return -1;if(b.rank)return 1;return a.id-b.id;});
      else if(mode==='listed') its.sort((a,b)=>{const al=a.price!=null?1:0,bl=b.price!=null?1:0;if(al!==bl)return bl-al;if(a.price!=null&&b.price!=null)return a.price-b.price;return(a.rank||9999)-(b.rank||9999);});
      else if(mode==='price-asc') its.sort((a,b)=>{if(a.price==null&&b.price==null)return a.id-b.id;if(a.price==null)return 1;if(b.price==null)return -1;return a.price-b.price;});
      else its.sort((a,b)=>a.id-b.id);
      return its;
    })(window._walletTokenIds);
    if(window._renderWalletGrid) window._renderWalletGrid(items);
  };

  // Sync sort button state on load
  const savedWSort = localStorage.getItem('walletSort') || 'rank';
  document.querySelectorAll('[data-wsort]').forEach(b =>
    b.classList.toggle('active', b.dataset.wsort === savedWSort));

  document.getElementById('walletLookupBtn').onclick = lookupWallet;
  document.getElementById('walletClearBtn').onclick  = ()=>{
    document.getElementById('walletInput').value = '';
    document.getElementById('walletGrid').innerHTML = '';
    document.getElementById('walletStatus').textContent = '';
    document.getElementById('walletCountBadge').textContent = '–';
  };
  document.getElementById('walletInput').addEventListener('keydown', e=>{
    if(e.key === 'Enter') lookupWallet();
  });
})();


// ════════════════════════════════════════════════════════════════════════════
// FEATURE: Price vs Rank Scatter Plot
// ════════════════════════════════════════════════════════════════════════════
function _getTokenImgSrc(id){
  // Check session-cached fresh image first (fetched from OpenSea, overrides stale chunk)
  const fresh = _getFreshImg(id);
  if(fresh) return fresh;
  const mapVal = IMAGES_MAP && IMAGES_MAP.get(id);
  const src = mapVal || imgForId(id);
  if(!src) return null;
  const s = String(src).trim();
  if(s.startsWith('<svg')){
    try{ return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s); }catch{ return null; }
  }
  if(/^data:image\//i.test(s)) return s;
  return src;
}

// ── Live image refresh system (TTL-based) ─────────────────────────────────────
// Fetches fresh token images from OpenSea and caches with 6hr TTL in sessionStorage.
// Updates IMAGES_MAP so hover, modal, and grid all get the fresh image.
const _IMG_TTL = 6 * 60 * 60 * 1000; // 6 hours
const _IMG_CACHE_KEY = '_tvImgCache';
const _imgRefreshSet = new Set(); // tokens currently being fetched (dedup)
const _imgRefreshQueue = []; // pending token IDs to refresh
let _imgRefreshRunning = false;

function _getFreshImg(id){
  try{
    const raw = sessionStorage.getItem(`${_IMG_CACHE_KEY}:${id}`);
    if(!raw) return null;
    const {url, ts} = JSON.parse(raw);
    if(Date.now() - ts > _IMG_TTL){ sessionStorage.removeItem(`${_IMG_CACHE_KEY}:${id}`); return null; }
    return url;
  }catch{ return null; }
}

function _storeFreshImg(id, url){
  try{ sessionStorage.setItem(`${_IMG_CACHE_KEY}:${id}`, JSON.stringify({url, ts: Date.now()})); }catch{}
}

async function _fetchFreshImg(id){
  if(_imgRefreshSet.has(id)) return;
  _imgRefreshSet.add(id);
  try{
    const CONTRACT = '0x078be86f3104a32313a47815792230a3808642cc';
    // Route through Worker — avoids CORS, uses server-side API key, no rate limit risk
    // nocache=1 bypasses the Worker's 6hr cache so we always get the latest image
    const wr = await fetch(`${LIVE_ENDPOINT}/os/nft?contract=${CONTRACT}&tokenId=${id}&nocache=1`);
    if(!wr.ok) return;
    const wj = await wr.json();
    const liveUrl = wj?.display_image_url || wj?.image_url;
    if(!liveUrl) return;
    const cached = String(IMAGES_MAP?.get(id) || '').trim();
    _storeFreshImg(id, liveUrl);
    if(liveUrl !== cached){
      // Update IMAGES_MAP — hover, grid, and modal all read from here
      IMAGES_MAP?.set(id, liveUrl);
      // Update any visible grid card immediately
      document.querySelectorAll(`[data-id="${id}"] img`).forEach(img => { img.src = liveUrl; });
    }
  }catch{}
  finally{ _imgRefreshSet.delete(id); }
}

// Process refresh queue with rate limiting (1 per 400ms to avoid hammering OS)
async function _processImgQueue(){
  if(_imgRefreshRunning) return;
  _imgRefreshRunning = true;
  while(_imgRefreshQueue.length > 0){
    const id = _imgRefreshQueue.shift();
    if(!_getFreshImg(id)){ // skip if already cached fresh
      await _fetchFreshImg(id);
      await new Promise(r => setTimeout(r, 400));
    }
  }
  _imgRefreshRunning = false;
}

// Queue tokens for background refresh — deduped, prioritized
function _queueImgRefresh(ids){
  for(const id of ids){
    if(!_imgRefreshSet.has(id) && !_imgRefreshQueue.includes(id) && !_getFreshImg(id)){
      _imgRefreshQueue.push(id);
    }
  }
  _processImgQueue();
}

// Called after listings load — refresh top 50 listed tokens by price
function _refreshListedTokenImages(){
  if(!window.LISTINGS) return;
  const listed = Object.entries(window.LISTINGS)
    .filter(([,v]) => v?.opensea?.price_eth != null)
    .sort((a,b) => a[1].opensea.price_eth - b[1].opensea.price_eth)
    .slice(0, 50)
    .map(([id]) => +id);
  _queueImgRefresh(listed);
}

// ── Periodic live data refresh (images + traits) ──────────────────────────────
// Piggybacks entirely on /db/all-traits, the same endpoint already loaded once
// at page init — this just re-fetches it periodically instead of never again.
// The bot's own DB is kept live by ongoing processes (burn finalization writes
// fresh traits + image immediately; see lib/burn-poller.js), so re-polling
// this one endpoint is enough to catch changes without any per-token OpenSea
// calls from the browser. Updates visible grid cards + open modal in place;
// does not trigger a full re-render.
const LIVE_REFRESH_MS = 5 * 60 * 1000; // matches the backend's own 5-min cache TTL
async function refreshLiveTokenData(){
  try{
    const j = await dbFetch('/db/all-traits');
    if(!j?.ok || !j.tokens) return;
    for(const [idStr, data] of Object.entries(j.tokens)){
      const id = parseInt(idStr);
      if(!Number.isFinite(id)) continue;

      // Image: only touch it if the DB actually has a fresher one on file
      // (most tokens will be null here until they go through a burn).
      if(data.image){
        const current = String(IMAGES_MAP?.get(id) || '').trim();
        if(data.image !== current){
          IMAGES_MAP?.set(id, data.image);
          document.querySelectorAll(`[data-id="${id}"] img, [data-burn-token-id="${id}"]:not([data-burn-frozen-img]) img`).forEach(img => { img.src = data.image; });
          const _h1 = window._modalBurnHistory;
          const _atLatest1 = !_h1 || _h1.tokenId !== id || _h1.index === _h1.entries.length - 1;
          if(window._modalCurrentId === id && _atLatest1){
            const imgBox = document.getElementById('mImg');
            if(imgBox){
              const s = String(data.image).trim();
              if(s.startsWith('<svg')) imgBox.innerHTML = `<div class="svg-wrap" style="width:100%;height:100%">${s}</div>`;
              else imgBox.innerHTML = `<img src="${s.startsWith('data:')?s:ipfsToHttp(s)}" alt="#${id}">`;
            }
          }
        }
      }

      // Traits: only touch cache if they've actually changed (burn survivors
      // get a completely different trait set once a burn finalizes).
      if(data.traits && Object.keys(data.traits).length){
        const cachedRow = ROW_CACHE.get(id);
        const changed = !cachedRow || JSON.stringify(cachedRow.traits) !== JSON.stringify(data.traits);
        if(changed){
          ROW_CACHE.set(id, { traits: data.traits });
          const _h2 = window._modalBurnHistory;
          const _atLatest2 = !_h2 || _h2.tokenId !== id || _h2.index === _h2.entries.length - 1;
          if(window._modalCurrentId === id && _atLatest2){
            const kv = keepEntries(data.traits);
            const mTraits = document.getElementById('mTraits');
            if(mTraits) mTraits.innerHTML = kv.length ? kv.map(([k,v])=>`<div><span>${traitDisplayLabel(k)}</span><b>${v}</b></div>`).join('') : '<div style="color:var(--muted)">No traits</div>';
          }
        }
      }
    }
  }catch(e){ console.warn('[LiveRefresh]', e.message); }
}
setTimeout(() => {
  refreshLiveTokenData();
  setInterval(refreshLiveTokenData, LIVE_REFRESH_MS);
}, 30_000); // wait 30s after script load so this never competes with initial page render

// Global data store for holder thumbnail tooltips
window._holderThumbs = {};

function _holderThumbEnter(id, clientX, clientY){
  const d = window._holderThumbs[id];
  if(!d) return;
  const imgH = d.img ? `<img src="${d.img}" style="width:56px;height:56px;object-fit:contain;image-rendering:pixelated;border-radius:5px;display:block;margin-bottom:6px">` : '';
  _showChartTooltip('_holderThumbTT', clientX, clientY,
    imgH +
    `<div style="font-weight:700;font-size:12px;margin-bottom:2px">#${id}</div>` +
    `<div style="font-size:10px;margin-bottom:4px">${rankDiamondHtml(d.rank || '', '', d.rankSys)}</div>` +
    (d.price != null ? `<div style="color:#2dd4bf;font-weight:700;font-size:13px">Ξ ${d.price} ETH</div>` : '') +
    `<div style="color:#7a8fa8;font-size:10px;margin-top:5px">Click to open token</div>`
  );
}

function _showChartTooltip(tooltipId, x, y, html){
  if(window.innerWidth <= 900) return; // No hover tooltips on mobile
  let tt = document.getElementById(tooltipId);
  if(!tt){ tt = document.createElement('div'); tt.id = tooltipId; document.body.appendChild(tt); }
  tt.style.cssText = 'position:fixed;z-index:9500;pointer-events:none;display:block;' +
    'background:rgba(10,15,22,.92);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);' +
    'border:1px solid rgba(255,255,255,.10);border-radius:12px;padding:10px 12px;' +
    'box-shadow:0 8px 28px rgba(0,0,0,.5);font-size:12px;color:#e6edf7;max-width:220px;min-width:160px;';
  tt.innerHTML = html;
  // Position near cursor but keep in viewport
  const vw = window.innerWidth, vh = window.innerHeight;
  const tw = 220, th = 180;
  let lx = x + 14, ly = y - 10;
  if(lx + tw > vw) lx = x - tw - 10;
  if(ly + th > vh) ly = vh - th - 10;
  tt.style.left = lx + 'px';
  tt.style.top  = ly + 'px';
}

function _hideChartTooltip(tooltipId){
  const tt = document.getElementById(tooltipId);
  if(tt) tt.style.display = 'none';
}

function renderScatter(){
  const host = document.getElementById('scatterHost');
  const countEl = document.getElementById('scatterCount');
  if(!host) return;

  const listings = window.LISTINGS;
  if(!listings || !Object.keys(listings).length){
    host.innerHTML = '<div style="color:var(--sub);font-size:12px;padding:20px 0">Fetch live listings first using the "Fetch listings" button.</div>';
    return;
  }

  const pts = [];
  for(const [idStr, data] of Object.entries(listings)){
    const id = +idStr;
    const rank = RARITY_OBS_RANK.get(id);
    const price = data?.opensea?.price_eth;
    const url   = data?.opensea?.url || '';
    if(!rank || price == null) continue;
    pts.push({id, rank, price: +price, url});
  }

  if(!pts.length){
    host.innerHTML = '<div style="color:var(--sub);font-size:12px;padding:20px 0">No ranked listings found.</div>';
    return;
  }

  pts.sort((a,b) => a.rank - b.rank);
  countEl.textContent = pts.length + ' listings';

  // Trend line
  const n = pts.length;
  const sumX = pts.reduce((s,p)=>s+p.rank,0);
  const sumY = pts.reduce((s,p)=>s+p.price,0);
  const sumXY = pts.reduce((s,p)=>s+p.rank*p.price,0);
  const sumX2 = pts.reduce((s,p)=>s+p.rank*p.rank,0);
  const slope = (n*sumXY - sumX*sumY) / (n*sumX2 - sumX*sumX);
  const intercept = (sumY - slope*sumX) / n;

  const minRank = pts[0].rank, maxRank = pts[pts.length-1].rank;
  const trendX = [minRank, maxRank];
  const trendY = trendX.map(x => Math.max(0, slope*x + intercept));

  // Jitter Y slightly to reduce overplotting on flat floor
  const jitter = pts.map(p => {
    const expected = slope * p.rank + intercept;
    return { ...p, isUnder: p.price < expected * 0.93 };
  });

  const colors = jitter.map(p => p.isUnder ? '#2dd4bf' : 'rgba(140,160,200,.55)');
  const sizes  = jitter.map(p => p.isUnder ? 9 : 7);

  const cs = getComputedStyle(document.body);
  const textColor = cs.getPropertyValue('--text').trim() || '#e6edf7';
  const subColor  = cs.getPropertyValue('--sub').trim()  || '#7a8fa8';

  const trace = {
    x: jitter.map(p=>p.rank), y: jitter.map(p=>p.price),
    mode: 'markers', type: 'scatter',
    marker: { color: colors, size: sizes, opacity: 0.9,
              line:{width:1, color:'rgba(255,255,255,.15)'} },
    hovertemplate: ' <extra></extra>',
    customdata: jitter.map(p=>({id:p.id, rank:p.rank, price:p.price, under:p.isUnder})),
    name: 'Listings'
  };

  const trend = {
    x: trendX, y: trendY,
    mode: 'lines', type: 'scatter',
    line: {color:'rgba(100,160,255,.45)', width:2, dash:'dot'},
    hoverinfo: 'skip', name: 'Trend'
  };

  const layout = {
    height: 320, margin: {l:60,r:16,t:24,b:56},
    paper_bgcolor:'rgba(0,0,0,0)', plot_bgcolor:'rgba(0,0,0,0)',
    font: {color:textColor, size:11},
    xaxis: {title:'Rank', color:subColor, gridcolor:'rgba(255,255,255,.06)', zeroline:false},
    yaxis: {title:'Price (ETH)', color:subColor, gridcolor:'rgba(255,255,255,.06)',
            zeroline:false, tickformat:'.4f',
            // Log scale helps spread out the congested bottom
            type:'log'},
    showlegend: false,
    hovermode: 'closest',
    annotations:[{
      x:0.01, y:1.06, xref:'paper', yref:'paper',
      text:'<b style="color:#2dd4bf">●</b> Undervalued  <b style="color:rgba(140,160,200,.8)">●</b> At/above trend',
      showarrow:false, font:{size:11,color:subColor}, align:'left'
    }]
  };

  layout.hoverlabel = {bgcolor:'rgba(0,0,0,0)', bordercolor:'rgba(0,0,0,0)', font:{color:'rgba(0,0,0,0)', size:1}};
  Plotly.newPlot(host, [trace, trend], layout, {responsive:true, displayModeBar:false});

  // Custom frosted-glass hover tooltip
  host.on('plotly_hover', data => {
    const pt  = data.points[0];
    const cd  = pt.customdata;
    if(!cd || !cd.id) return; // trend line has no customdata
    const ev  = data.event;
    const img = _getTokenImgSrc(cd.id);
    const imgHtml = img
      ? `<img src="${img}" style="width:64px;height:64px;object-fit:contain;border-radius:6px;image-rendering:pixelated;display:block;margin-bottom:8px">`
      : '';
    const label = cd.under
      ? '<span style="color:#2dd4bf;font-size:10px;font-weight:700">● UNDERVALUED</span>'
      : '<span style="color:rgba(140,160,200,.8);font-size:10px">● At trend</span>';
    const html = `${imgHtml}
      <div style="font-weight:700;font-size:13px;margin-bottom:2px">#${cd.id}</div>
      <div style="font-size:11px;margin-bottom:4px">${rankDiamondHtml(cd.rank, "font-weight:700;")}</div>
      <div style="font-size:14px;font-weight:700;color:#2dd4bf;margin-bottom:4px">Ξ ${cd.price.toFixed(4)} ETH</div>
      ${label}
      <div style="color:#7a8fa8;font-size:10px;margin-top:6px">Click to open token</div>`;
    _showChartTooltip('_scatterTT', ev.clientX, ev.clientY, html);
  });
  host.on('plotly_unhover', () => _hideChartTooltip('_scatterTT'));
  host.on('plotly_click', data => {
    const cd = data.points[0].customdata;
    if(cd?.id && typeof openModal === 'function') openModal(cd.id);
  });
}

// ════════════════════════════════════════════════════════════════════════════
// FEATURE: Floor Price Trend (from sales history)
// ════════════════════════════════════════════════════════════════════════════
window._floorLoaded = false;
window._floorDays = 30;
window._floorEvents = [];
// Floor trend loaded by 4s background fetch in init block

function setFloorRange(days){
  window._floorDays = days;
  document.querySelectorAll('[data-frange]').forEach(b =>
    b.classList.toggle('active', +b.dataset.frange === days));
  renderFloorTrend();
}

async function loadFloorTrend(force){
  if(window._floorLoaded && !force) return renderFloorTrend();
  const host = document.getElementById('floorTrendHost');
  if(host) host.innerHTML = '<div style="color:var(--sub);font-size:12px;padding:20px 0">Loading sales history...</div>';

  try{
    // Try Railway DB first — instant, no sequential OpenSea fetches needed
    let loaded = false;
    try{
      const [data, fhData] = await Promise.all([
        dbFetch('/db/floor-trend', { days: 90 }),
        dbFetch('/db/floor-history', { hours: 90*24 }).catch(()=>null)
      ]);
      if(data.ok && data.sales && data.sales.length > 0){
        window._floorEvents = data.sales.map(s => ({
          event_type: 'sale',
          payment: { quantity: String(Math.round(s.price_eth * 1e18)), symbol: s.currency || 'ETH' },
          nft: { identifier: String(s.token_id) },
          closing_date: new Date(s.sale_ts).getTime() / 1000,
          obs_rank: s.obs_rank
        }));
        // Store floor_history points for the true floor line
        window._floorHistory = (fhData?.ok && fhData.history?.length)
          ? fhData.history.slice().reverse() // oldest first
          : [];
        const countEl = document.getElementById('floorTransferCount');
        if(countEl) countEl.textContent = data.sales.length + ' sales loaded from DB';
        window._floorLoaded = true;
        populateFloorTraitFilter();
        renderFloorTrend();
        loaded = true;
      }
    } catch(e){
      console.warn('DB floor-trend failed, falling back to OpenSea:', e.message);
    }

    if(loaded) return;

    // Fallback: sequential OpenSea fetches
    let all = [];
    const qs0 = new URLSearchParams({slug: LIVE_SLUG, event_type:'sale', limit:'100'});
    const r0 = await fetch(`${LIVE_ENDPOINT}/os/events?${qs0}`);
    if(r0.ok){
      const j0 = await r0.json();
      all = j0.events || [];
      let cursor = j0.next_cursor;
      for(let i = 1; i < 10 && cursor; i++){
        const qs = new URLSearchParams({slug: LIVE_SLUG, event_type:'sale', limit:'100'});
        qs.set('cursor', cursor);
        const r = await fetch(`${LIVE_ENDPOINT}/os/events?${qs}`);
        if(!r.ok) break;
        const j = await r.json();
        all = all.concat(j.events || []);
        cursor = j.next_cursor;
        await new Promise(r=>setTimeout(r,60));
      }
    }
    window._floorEvents = all;
    window._floorLoaded = true;
    const countEl = document.getElementById('floorTransferCount');
    if(countEl) countEl.textContent = all.length + ' sales loaded via OpenSea';
    populateFloorTraitFilter();
    renderFloorTrend();
  }catch(e){
    if(host) host.innerHTML = '<div style="color:var(--sub);font-size:12px;padding:20px 0">Error: ' + e.message + '</div>';
  }
}
function populateFloorTraitFilter(){
  // Populate the trait filter dropdown for floor trend
  const sel = document.getElementById('floorTraitFilter');
  if(!sel) return;
  const prev = sel.value;
  sel.innerHTML = '<option value="">All tokens</option>';
  const traits = Object.keys(TRAIT_FREQ || {}).sort();
  for(const t of traits){
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    sel.appendChild(opt);
  }
  if(prev) sel.value = prev;
}
function renderFloorTrend(){
  const host = document.getElementById('floorTrendHost');
  if(!host) return;

  const events = window._floorEvents;
  if(!events.length){
    host.innerHTML = '<div style="color:var(--sub);font-size:12px;padding:20px 0">No sales data yet.</div>';
    return;
  }

  const days = window._floorDays;
  const cutoff = Date.now()/1000 - days*86400;

  // Trait filter
  const floorTraitSel = document.getElementById('floorTraitFilter');
  const floorTraitVal = floorTraitSel?.value || '';
  let filterTraitType = '', filterTraitValue = '';
  if(floorTraitVal){
    const parts = floorTraitVal.split('|||');
    filterTraitType = parts[0]; filterTraitValue = parts[1];
  }

  // Parse events into {ts, price, id, rank, seller, buyer}
  const sales = [];
  const allSalesDots = []; // all sales including WETH for the dots layer
  for(const ev of events){
    const ts = ev.closing_date || ev.event_timestamp;
    if(!ts || ts < cutoff) continue;
    try{
      const qty = BigInt(ev.payment?.quantity||'0');
      const dec = ev.payment?.decimals??18;
      const eth = Number(qty)/Math.pow(10,dec);
      if(!isFinite(eth)||eth<=0) continue;
      const id = +(ev.nft?.identifier||0);
      const rank = RARITY_OBS_RANK.get(id)||null;
      // Detect currency
      const sym = ev.payment?.symbol||'';
      if(sym === 'TRANSFER') continue; // skip pure transfers/gifts (value=0, no sale)
      const addr = (ev.payment?.address||ev.payment?.token_address||'').toLowerCase();
      const isWeth = sym.toUpperCase()==='WETH' || (addr === '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2');
      const currency = isWeth ? 'WETH' : 'ETH';
      // Apply trait filter if set
      if(filterTraitType){
        const row = ROW_CACHE.get(id);
        if(!row || String(row.traits?.[filterTraitType]) !== String(filterTraitValue)) continue;
      }
      const entry = { ts, eth, id, rank, currency, isWeth,
        seller: ev.seller||'', buyer: ev.buyer||'',
        date: new Date(ts*1000) };
      allSalesDots.push(entry);
      if(!isWeth) sales.push(entry); // floor = ETH only
    }catch{}
  }

  if(!sales.length){
    host.innerHTML = '<div style="color:var(--sub);font-size:12px;padding:20px 0">No sales in this time range.</div>';
    return;
  }

  sales.sort((a,b)=>a.ts-b.ts);

  // Compute daily floor (min sale price per day)
  const byDay = {};
  for(const s of sales){
    const key = s.date.toISOString().slice(0,10);
    if(!byDay[key] || s.eth < byDay[key].floor) byDay[key] = {floor:s.eth, sales:[]};
    byDay[key].sales.push(s);
  }
  const days_arr = Object.keys(byDay).sort();
  const floorY = days_arr.map(d=>byDay[d].floor);

  // 7-day moving average
  const maY = floorY.map((_,i)=>{
    const slice = floorY.slice(Math.max(0,i-3), i+4);
    return slice.reduce((s,v)=>s+v,0)/slice.length;
  });

  const cs = getComputedStyle(document.body);
  const textColor = cs.getPropertyValue('--text').trim()||'#e6edf7';
  const subColor  = cs.getPropertyValue('--sub').trim() ||'#7a8fa8';

  const floorTrace = {
    x: days_arr, y: floorY,
    mode: 'lines+markers', type:'scatter',
    name:'Daily Floor',
    line:{color:'#2dd4bf', width:2},
    marker:{size:5, color:'#2dd4bf'},
    hovertemplate:'%{x}<br>Floor: %{y:.4f} ETH<extra></extra>'
  };

  const maTrace = {
    x: days_arr, y: maY,
    mode:'lines', type:'scatter',
    name:'7d Avg',
    line:{color:'rgba(100,160,255,.5)', width:2, dash:'dot'},
    hoverinfo:'skip'
  };

  // Individual sale dots
  // ETH sales (for floor calculation)
  const ethSales = sales; // already filtered to ETH only
  // All sales for dots layer (ETH=teal, WETH=purple)
  const saleTrace = {
    x: allSalesDots.map(s=>s.date.toISOString().slice(0,10)),
    y: allSalesDots.map(s=>s.eth),
    mode:'markers', type:'scatter',
    name:'Sales',
    marker:{
      size: allSalesDots.map(s=>s.isWeth?4:5),
      color: allSalesDots.map(s=>s.isWeth?'rgba(167,139,250,.5)':'rgba(45,212,191,.4)'),
      symbol:'circle'
    },
    hovertemplate: ' <extra></extra>',
    customdata: allSalesDots.map(s=>s.id)
  };

  // ── True floor history line (from floor_history table) ─────────────────────
  const fhPoints = (window._floorHistory || []).filter(p => {
    const ts = new Date(p.recorded_at).getTime() / 1000;
    return ts >= cutoff;
  });
  const fhTrace = fhPoints.length >= 2 ? {
    x: fhPoints.map(p => new Date(p.recorded_at).toISOString().slice(0,10)),
    y: fhPoints.map(p => p.floor_eth),
    mode: 'lines', type: 'scatter',
    name: 'True Floor',
    line: { color: '#f59e0b', width: 2, shape: 'hv' }, // step-line = hv
    hovertemplate: '%{x}<br>Floor: %{y:.4f} ETH<extra></extra>'
  } : null;

  const traces = [saleTrace, floorTrace, maTrace];
  if(fhTrace) traces.push(fhTrace);

  const layout = {
    height:300, margin:{l:56,r:16,t:10,b:48},
    paper_bgcolor:'rgba(0,0,0,0)', plot_bgcolor:'rgba(0,0,0,0)',
    font:{color:textColor, size:11},
    xaxis:{color:subColor, gridcolor:'rgba(255,255,255,.06)', zeroline:false},
    yaxis:{title:'ETH', color:subColor, gridcolor:'rgba(255,255,255,.06)', zeroline:false, tickformat:'.4f'},
    showlegend:true,
    legend:{x:0,y:1,font:{size:10},bgcolor:'rgba(0,0,0,0)'},
    hovermode:'closest'
  };

  // Make Plotly's built-in tooltip invisible — we draw our own
  layout.hoverlabel = {bgcolor:'rgba(0,0,0,0)', bordercolor:'rgba(0,0,0,0)', font:{color:'rgba(0,0,0,0)', size:1}};
  Plotly.newPlot(host, traces, layout, {
    responsive:true,
    displayModeBar:true,
    displaylogo:false,
    modeBarButtonsToRemove:['select2d','lasso2d','autoScale2d','toggleSpikelines'],
    modeBarButtonsToKeep:['zoom2d','pan2d','zoomIn2d','zoomOut2d','resetScale2d'],
    scrollZoom:true
  });

  // Custom frosted hover + click
  host.on('plotly_hover', data=>{
    const pt  = data.points[0];
    const ev  = data.event;
    if(pt.data.name === 'Sales' && pt.customdata){
      const id   = pt.customdata;
      const sale = allSalesDots.find(s=>s.id===id) || {};
      const img  = _getTokenImgSrc(id);
      const imgH = img ? `<img src="${img}" style="width:60px;height:60px;object-fit:contain;border-radius:6px;image-rendering:pixelated;display:block;margin-bottom:8px">` : '';
      const rank = `<div style="font-size:11px;margin-bottom:3px">${displayRankHtml(id, 'font-weight:700;')}</div>`;
      const seller = sale.seller ? `<div style="font-size:10px;color:#7a8fa8;margin-top:4px">From: ${sale.seller.slice(0,6)}…${sale.seller.slice(-4)}</div>` : '';
      const buyer  = sale.buyer  ? `<div style="font-size:10px;color:#7a8fa8">To: ${sale.buyer.slice(0,6)}…${sale.buyer.slice(-4)}</div>` : '';
      const ts     = sale.ts ? `<div style="font-size:10px;color:#7a8fa8;margin-top:2px">${new Date(sale.ts*1000).toLocaleString()}</div>` : '';
      const html = `${imgH}
        <div style="font-weight:700;font-size:13px;margin-bottom:2px">#${id}</div>
        ${rank}
        <div style="font-size:14px;font-weight:700;color:${sale.isWeth?'#d8b4fe':'#2dd4bf'};margin-bottom:4px">Ξ ${sale.eth ? sale.eth.toFixed(4) : '?'} ${sale.currency||'ETH'}</div>
        ${seller}${buyer}${ts}
        <div style="color:#7a8fa8;font-size:10px;margin-top:6px">Click to open token</div>`;
      _showChartTooltip('_floorTT', ev.clientX, ev.clientY, html);
    } else if(pt.data.name === 'Daily Floor'){
      const html = `<div style="font-weight:600;margin-bottom:3px">${pt.x}</div>
        <div style="color:#2dd4bf;font-weight:700;font-size:14px">Floor: ${(+pt.y).toFixed(4)} ETH</div>`;
      _showChartTooltip('_floorTT', ev.clientX, ev.clientY, html);
    }
  });
  host.on('plotly_unhover', ()=> _hideChartTooltip('_floorTT'));
  host.on('plotly_click', data=>{
    const pt = data.points[0];
    if(pt.data.name==='Sales' && pt.customdata && typeof openModal==='function') openModal(pt.customdata);
  });
}

// ════════════════════════════════════════════════════════════════════════════
// FEATURE: Holders Analysis
// ════════════════════════════════════════════════════════════════════════════
window._holdersLoaded = false;
window._holdersData   = null;

async function loadHolders(force){
  if(window._holdersLoaded && !force && window._holdersData) return renderHolders();
  const gridEl = document.getElementById('holdersGrid');
  if(gridEl) gridEl.innerHTML = '<div style="color:var(--sub);font-size:12px;padding:10px 0">Loading real on-chain holder data…</div>';

  try{
    // Fetch true on-chain holders via Alchemy (through our Cloudflare Worker)
    const r = await fetch(`${LIVE_ENDPOINT}/nft/holders?contract=${LIVE_CONTRACT}`);
    const j = await r.json();

    if(!j.ok) throw new Error(j.error || 'Holder fetch failed');

    const holders = j.holders || []; // [{address, count, tokens:[]}]
    const totalSupply   = j.total_supply || 0;
    const uniqueWallets = j.unique_wallets || holders.length;

    const top10Count  = holders.slice(0,10).reduce((s,h)=>s+h.count,0);
    const top10Pct    = totalSupply ? ((top10Count/totalSupply)*100).toFixed(1) : '–';
    const top100Count = holders.slice(0,100).reduce((s,h)=>s+h.count,0);
    const top100Pct   = totalSupply ? ((top100Count/totalSupply)*100).toFixed(1) : '–';

    // Diamond hands: wallets holding ≥10 tokens (proxy for long-term holders)
    // Real diamond hands would need transfer history, but count ≥10 is a reasonable signal
    const diamonds = holders.filter(h => h.count >= 5).length;

    // Dedup wallets by address (in case cache returned duplicates)
    const seenWallets = new Set();
    const dedupedHolders = [];
    for(const h of holders){
      const addr = (h.address||'').toLowerCase();
      if(!addr || seenWallets.has(addr)) continue;
      seenWallets.add(addr);
      // Ensure token IDs are numbers and deduplicated
      const tokenSet = new Set((h.tokens||[]).map(id => {
        const n = typeof id === 'string' && id.startsWith('0x') ? parseInt(id,16) : parseInt(id,10);
        return isNaN(n) ? null : n;
      }).filter(n => n !== null && n > 0 && n <= 10000));
      dedupedHolders.push({...h, tokens: [...tokenSet], count: tokenSet.size});
    }
    // Re-sort after dedup (count may have changed)
    dedupedHolders.sort((a,b) => b.count - a.count);

    // Map to the shape renderHolders expects
    const sorted_wallets = dedupedHolders.map(h => ({wallet: h.address, count: h.count, ids: h.tokens}));

    window._holdersData = {sorted_wallets, totalTracked: totalSupply, uniqueWallets, top10Pct, top100Pct, diamonds, top10Count};
    window._holdersLoaded = true;
    // Apply current trait filter if any active
    const _traits = typeof activeTraits !== 'undefined' ? activeTraits : new Map();
    if(_traits.size > 0 && document.getElementById('ttab-holders')?.classList.contains('active')){
      renderHoldersByTrait();
    } else {
      renderHolders();
    }

  }catch(e){
    if(gridEl) gridEl.innerHTML = `<div style="color:var(--sub);font-size:12px">Error: ${e.message}. Make sure ALCHEMY_API_KEY is set in your Cloudflare Worker.</div>`;
  }
}

async function renderHoldersByTrait(){
  const d = window._holdersData;
  if(!d){ return; }

  const traits = typeof activeTraits !== 'undefined' ? activeTraits : new Map();
  if(traits.size === 0){
    // No active traits — just show normal
    renderHolders();
    return;
  }

  // Show active trait chips in holders header
  const chipsEl = document.getElementById('holdersTraitChips');
  if(chipsEl){
    chipsEl.innerHTML = [...traits.entries()].flatMap(([g,s])=>[...s].map(v=>
      `<span style="font-size:10px;padding:2px 7px 2px 9px;border-radius:999px;background:rgba(45,212,191,.15);border:1px solid rgba(45,212,191,.3);color:#2dd4bf;font-weight:600;display:inline-flex;align-items:center;gap:5px">
        ${g}: ${v}
        <span onclick="event.stopPropagation();_removeHolderTrait('${g.replace(/'/g,"\\'")}','${v.replace(/'/g,"\\'")}');return false"
          style="cursor:pointer;opacity:.7;font-size:11px;line-height:1;padding:0 1px;color:#2dd4bf"
          title="Remove this filter">×</span>
      </span>`
    )).join('');
  }
  const clearBtn = document.getElementById('holdersClearTraitFilter');
  if(clearBtn) clearBtn.style.display = 'inline-flex';

  const gridEl = document.getElementById('holdersGrid');
  if(gridEl) gridEl.innerHTML = '<div style="color:var(--sub);font-size:12px;padding:8px 0">Finding matching wallets…</div>';

  const walletMatches = [];
  const maxId = TOKEN_COUNT || 10000;

  // Use Railway DB API to get all token IDs with this trait — instant query
  let traitTokenSet = null;
  try{
    if(traits.size > 0){
      const traitObj = {};
      for(const [name, valSet] of traits) traitObj[name] = [...valSet];
      const data = await dbFetch('/db/tokens', { traits: JSON.stringify(traitObj) });
      if(data.ok){
        traitTokenSet = new Set(data.tokens.map(t => t.id));
        if(gridEl) gridEl.innerHTML = `<div style="color:var(--sub);font-size:12px;padding:4px 0">Found ${traitTokenSet.size} tokens — matching wallets…</div>`;
      }
    }
  } catch(e){
    console.warn('DB API holders trait lookup failed, falling back to chunks:', e.message);
  }

  // Match each wallet's token IDs against the trait set
  for(const w of d.sorted_wallets){
    const matchingIds = [];
    if(traitTokenSet){
      // Fast path: simple set intersection
      for(const id of (w.ids || [])){
        const n = +id;
        if(n >= 1 && n <= maxId && traitTokenSet.has(n)) matchingIds.push(n);
      }
    } else {
      // Fallback: chunk-based matching (if DB API failed)
      for(const id of (w.ids || [])){
        const n = +id;
        if(n < 1 || n > maxId) continue;
        const row = ROW_CACHE.get(n) || (() => {
          const idx = chunkIndexFor(n);
          const ch = CHUNK_CACHE.get(idx);
          const r = ch?.[String(n)] || null;
          if(r) ROW_CACHE.set(n, r);
          return r;
        })();
        if(!row) continue;
        let matches = true;
        for(const [traitName, valueSet] of traits){
          if(!valueSet.has(String(row.traits?.[traitName] ?? ''))){ matches = false; break; }
        }
        if(matches) matchingIds.push(n);
      }
    }
    if(matchingIds.length > 0){
      walletMatches.push({...w, matchingIds, matchCount: matchingIds.length});
    }
  }

  // Sort by most matching tokens
  walletMatches.sort((a,b) => b.matchCount - a.matchCount);

  if(!walletMatches.length){
    if(gridEl) gridEl.innerHTML = '<div style="color:var(--sub);font-size:12px;padding:8px 0">No holders found with these traits.</div>';
    return;
  }

  // Render filtered holders
  const maxCount = walletMatches[0].matchCount;
  if(gridEl) gridEl.innerHTML = walletMatches.slice(0,100).map((w,i) => {
    const addr = w.wallet;
    const short = addr.slice(0,6)+'…'+addr.slice(-4);
    const pct = d.totalTracked ? ((w.count/d.totalTracked)*100).toFixed(1) : '0';
    const barW = Math.round((w.matchCount/maxCount)*100);
    const osUrl = `https://opensea.io/${addr}`;
    const floor = window._lastFloorEth || null;
    const estVal = floor && w.matchingIds.length ? (w.matchingIds.reduce((s,id)=>{
      const lp = window.LISTINGS?.[id]?.opensea?.price_eth;
      return s + (lp != null ? lp : floor);
    },0)).toFixed(3) : null;
    const listedIds = window.LISTINGS
      ? w.matchingIds.filter(id => window.LISTINGS[id]?.opensea?.price_eth != null)
      : [];
    const listedCount = listedIds.length;

    // Thumbnails of matching listed tokens
    const thumbsHtml = listedIds.map(id => {
      const price = window.LISTINGS[id].opensea.price_eth;
      const priceStr = price >= 1 ? price.toFixed(3) : price.toFixed(4);
      const imgSrc = _getTokenImgSrc(id);
      const _dr = displayRankFor(id);
      window._holderThumbs[id] = {img: imgSrc, price: priceStr, rank: _dr.value||'?', rankSys: _dr.system};
      const imgTag = imgSrc
        ? `<img src="${imgSrc}" style="width:100%;height:100%;object-fit:contain;image-rendering:pixelated;display:block">`
        : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:9px">#${id}</div>`;
      return `<div
        style="width:38px;height:38px;border-radius:5px;overflow:hidden;border:1px solid rgba(255,255,255,.12);background:var(--soft);cursor:pointer;flex-shrink:0"
        onclick="event.stopPropagation();openModal(${id})"
        onmouseenter="_holderThumbEnter(${id},event.clientX,event.clientY)"
        onmouseleave="_hideChartTooltip('_holderThumbTT')"
      >${imgTag}</div>`;
    }).join('');

    // Also show non-listed matching tokens as smaller dots
    const unlisted = w.matchingIds.filter(id => !window.LISTINGS?.[id]?.opensea?.price_eth);
    const unlistedHtml = unlisted.map(id => {
      const imgSrc = _getTokenImgSrc(id);
      const _dr = displayRankFor(id);
      window._holderThumbs[id] = {img: imgSrc, price: null, rank: _dr.value||'?', rankSys: _dr.system};
      const imgTag = imgSrc
        ? `<img src="${imgSrc}" style="width:100%;height:100%;object-fit:contain;image-rendering:pixelated;display:block;opacity:.7">`
        : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:9px">#${id}</div>`;
      return `<div
        style="width:32px;height:32px;border-radius:4px;overflow:hidden;border:1px solid rgba(255,255,255,.08);background:var(--soft);cursor:pointer;flex-shrink:0"
        onclick="event.stopPropagation();openModal(${id})"
        onmouseenter="_holderThumbEnter(${id},event.clientX,event.clientY)"
        onmouseleave="_hideChartTooltip('_holderThumbTT')"
      >${imgTag}</div>`;
    }).join('');

    return `<div style="padding:6px 8px;border-radius:8px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05);margin-bottom:2px;cursor:pointer"
      onclick="openWalletView('${addr}')">
      <div style="display:grid;grid-template-columns:18px 1fr auto;gap:6px;align-items:center;margin-bottom:4px">
        <span style="font-size:10px;color:var(--muted);font-weight:600">${i+1}</span>
        <span style="font-family:monospace;font-size:11px;color:var(--text)">${short}
          <span style="font-size:10px;color:#2dd4bf;font-weight:700;margin-left:6px">${w.matchCount} matching</span>
          <span style="font-size:10px;color:var(--muted)">/ ${w.count} total</span>
        </span>
        <a href="${osUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="font-size:10px;color:var(--sub);opacity:.6">↗</a>
      </div>
      <div style="height:3px;border-radius:2px;background:rgba(255,255,255,.08);overflow:hidden;margin-bottom:5px">
        <div style="height:100%;width:${barW}%;background:linear-gradient(90deg,#2dd4bf,#7c5cff);border-radius:2px"></div>
      </div>
      <div style="display:flex;gap:10px;font-size:10px;color:var(--sub);flex-wrap:wrap;margin-bottom:${w.matchingIds.length>0?'6px':'0'}">
        <span><b style="color:var(--text)">${w.count}</b> total tokens (${pct}%)</span>
        ${estVal ? `<span>≈ <b style="color:#2dd4bf">${estVal} ETH</b></span>` : ''}
        ${listedCount > 0 ? `<span><b style="color:#f59e0b">${listedCount}</b> listed</span>` : ''}
      </div>
      ${w.matchingIds.length > 0 ? `<div class="holder-thumb-gallery" onclick="event.stopPropagation()">
        ${thumbsHtml}
        ${unlistedHtml ? `<div style="width:1px;height:24px;background:rgba(255,255,255,.1);margin:0 4px;flex-shrink:0"></div>${unlistedHtml}` : ''}
      </div>` : ''}
    </div>`;
  }).join('');
}

function _removeHolderTrait(traitName, traitValue){
  // Remove a single trait value from the active filter
  if(!activeTraits) return;
  const valSet = activeTraits.get(traitName);
  if(valSet){
    valSet.delete(traitValue);
    if(valSet.size === 0) activeTraits.delete(traitName);
  }
  // Uncheck the matching checkbox in the trait accordion
  document.querySelectorAll('#accTraits input[type=checkbox]').forEach(cb => {
    const label = cb.closest('label') || cb.parentElement;
    if(label && label.textContent.trim().startsWith(traitValue)){
      cb.checked = false;
    }
  });
  // If no traits left, clear everything and restore normal holders view
  if(activeTraits.size === 0){
    clearHolderTraitFilter();
  } else {
    // Re-run with remaining traits
    renderHoldersByTrait();
    // Update left panel chips too
    if(typeof renderActiveChips === 'function') renderActiveChips();
  }
}

function clearHolderTraitFilter(){
  // Clear the actual trait selection in the left panel
  activeTraits.clear();
  // Uncheck all checkboxes in the trait accordion
  document.querySelectorAll('#accTraits input[type=checkbox]').forEach(cb => cb.checked = false);
  // Clear the holders UI chips
  const chipsEl = document.getElementById('holdersTraitChips');
  if(chipsEl) chipsEl.innerHTML = '';
  const clearBtn = document.getElementById('holdersClearTraitFilter');
  if(clearBtn) clearBtn.style.display = 'none';
  // Just re-render holders — don't block on full page rebuild
  renderHolders();
  setTimeout(updateChartAndList, 0);
}

function renderHolders(){
  const d = window._holdersData;
  if(!d) return;

  // Clear trait filter chips since we're showing unfiltered view
  const chipsEl = document.getElementById('holdersTraitChips');
  if(chipsEl) chipsEl.innerHTML = '';
  const clearBtn = document.getElementById('holdersClearTraitFilter');
  if(clearBtn) clearBtn.style.display = 'none';

  // Stats bar
  const statsEl = document.getElementById('holdersStats');
  if(statsEl){
    statsEl.innerHTML = [
      `<div style="text-align:center;min-width:60px"><div style="font-size:16px;font-weight:800;color:var(--text)">${d.uniqueWallets.toLocaleString()}</div><div style="font-size:9px;color:var(--sub);white-space:nowrap">Unique Wallets</div></div>`,
      `<div style="text-align:center;min-width:60px"><div style="font-size:16px;font-weight:800;color:var(--text)">${d.totalTracked.toLocaleString()}</div><div style="font-size:9px;color:var(--sub);white-space:nowrap">Total Tokens</div></div>`,
      `<div style="text-align:center;min-width:52px"><div style="font-size:16px;font-weight:800;color:#2dd4bf">${d.top10Pct}%</div><div style="font-size:9px;color:var(--sub);white-space:nowrap">Top 10</div></div>`,
      `<div style="text-align:center;min-width:52px"><div style="font-size:16px;font-weight:800;color:#38bdf8">${d.top100Pct||'–'}%</div><div style="font-size:9px;color:var(--sub);white-space:nowrap">Top 100</div></div>`,
      `<div style="text-align:center;min-width:52px"><div style="font-size:16px;font-weight:800;color:#d8b4fe">${d.diamonds}</div><div style="font-size:9px;color:var(--sub);white-space:nowrap">Hold 5+</div></div>`,
    ].join('');
  }



  // Limit toggle bar
  const limitBar = document.getElementById('holderLimitBar');
  if(limitBar){
    const cur = window._holderLimit || 100;
    limitBar.innerHTML = [10, 100, 'all'].map(val => {
      const label = val === 'all' ? 'All' : `Top ${val}`;
      const active = String(cur) === String(val);
      return `<button onclick="window._holderLimit='${val}';renderHolders()" style="font-size:10px;padding:2px 8px;border-radius:999px;border:1px solid rgba(255,255,255,${active?'.3':'.08'});background:rgba(255,255,255,${active?'.12':'.03'});color:${active?'var(--text)':'var(--sub)'};cursor:pointer">${label}</button>`;
    }).join('');
  }

  // Top holders list
  const gridEl = document.getElementById('holdersGrid');
  if(gridEl){
    const holderLimit = window._holderLimit || 100;
    const top = d.sorted_wallets.slice(0, holderLimit === 'all' ? d.sorted_wallets.length : Number(holderLimit));
    const maxCount = top[0]?.count||1;
    gridEl.innerHTML = top.map((w,i)=>{
      const addr = w.wallet;
      const short = addr.slice(0,6)+'…'+addr.slice(-4);
      const pct = d.totalTracked ? ((w.count/d.totalTracked)*100).toFixed(1) : '0';
      const barW = Math.round((w.count/maxCount)*100);
      const osUrl = `https://opensea.io/${addr}`;
      const floor = window._lastFloorEth || null;
      // More accurate: sum listing prices for listed tokens, floor for unlisted
      let estVal = null;
      if(floor && window.LISTINGS){
        let total = 0;
        const ids = w.ids || [];
        for(const id of ids){
          const lp = window.LISTINGS[id]?.opensea?.price_eth;
          total += (lp != null) ? lp : floor;
        }
        estVal = total.toFixed(3);
      } else if(floor){
        estVal = (w.count * floor).toFixed(3);
      }
      const listedCount = window.LISTINGS
        ? (w.ids || []).filter(id => window.LISTINGS[id]?.opensea?.price_eth != null).length
        : null;
      // Build listed token thumbnails (max 8 shown)
      const listedIds = window.LISTINGS
        ? (w.ids || []).filter(id => window.LISTINGS[id]?.opensea?.price_eth != null)
        : [];
      const thumbsHtml = listedIds.map(id => {
        const price = window.LISTINGS[id].opensea.price_eth;
        const priceStr = price >= 1 ? price.toFixed(3) : price.toFixed(4);
        const imgSrc = _getTokenImgSrc(id);
        const _dr = displayRankFor(id);
        // Store data globally so the hover handler can access it cleanly
        window._holderThumbs[id] = {img: imgSrc, price: priceStr, rank: _dr.value||'?', rankSys: _dr.system};
        const imgTag = imgSrc
          ? `<img src="${imgSrc}" style="width:100%;height:100%;object-fit:contain;image-rendering:pixelated;display:block">`
          : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:9px">#${id}</div>`;
        return `<div
          style="width:38px;height:38px;border-radius:5px;overflow:hidden;border:1px solid rgba(255,255,255,.12);background:var(--soft);cursor:pointer;flex-shrink:0;position:relative"
          onclick="event.stopPropagation();openModal(${id})"
          onmouseenter="_holderThumbEnter(${id},event.clientX,event.clientY)"
          onmouseleave="_hideChartTooltip('_holderThumbTT')"
        >${imgTag}</div>`;
      }).join('');

      return `<div style="padding:6px 8px;border-radius:8px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05);margin-bottom:2px;cursor:pointer"
        onclick="openWalletView('${addr}')">
        <div style="display:grid;grid-template-columns:18px 1fr auto;gap:6px;align-items:center;margin-bottom:4px;cursor:pointer">
          <span style="font-size:10px;color:var(--muted);font-weight:600">${i+1}</span>
          <span style="font-family:monospace;font-size:11px;color:var(--text)">${short}</span>
          <a href="${osUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="font-size:10px;color:var(--sub);opacity:.6">↗</a>
        </div>
        <div style="height:3px;border-radius:2px;background:rgba(255,255,255,.08);overflow:hidden;margin-bottom:5px">
          <div style="height:100%;width:${barW}%;background:linear-gradient(90deg,#2dd4bf,#7c5cff);border-radius:2px"></div>
        </div>
        <div style="display:flex;gap:10px;font-size:10px;color:var(--sub);flex-wrap:wrap;margin-bottom:${listedIds.length>0?'6px':'0'}">
          <span><b style="color:var(--text)">${w.count}</b> tokens (${pct}%)</span>
          ${estVal ? `<span>≈ <b style="color:#2dd4bf">${estVal} ETH</b></span>` : ''}
          ${listedCount > 0 ? `<span><b style="color:#f59e0b">${listedCount}</b> listed</span>` : '<span style="opacity:.5">none listed</span>'}
        </div>
        ${listedIds.length > 0 ? `
        <div class="holder-thumbs-row" style="display:flex;gap:4px;align-items:center;flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;touch-action:pan-x;scrollbar-width:none;padding-bottom:2px" onclick="event.stopPropagation()">
          ${thumbsHtml}
        </div>` : ''}
      </div>`;
    }).join('');
  }

}

// ---- extracted script block ----

mountDesktopThemeButton();
