/* TraitView mispriced listing helpers.
   Loaded before app.js.
   Keep this as a classic script, not an ES module. */

// ── Shared rarity helpers (used by both Mispriced and Recent Sales) ────────────
function getTraitRarityScores(){
  const scores = {};
  const total = (typeof TOKEN_COUNT !== 'undefined' && TOKEN_COUNT) || 10000;
  const freqSource = (typeof TRAIT_FREQ !== 'undefined' && Object.keys(TRAIT_FREQ||{}).length > 0) ? TRAIT_FREQ : null;
  if(freqSource){
    for(const [traitName, vals] of Object.entries(freqSource)){
      scores[traitName] = {};
      for(const [val, count] of Object.entries(vals)){
        const p = count / total;
        scores[traitName][val] = -Math.log(Math.max(p, 1e-12));
      }
    }
  }
  return scores;
}
async function getRowTraitsFor(id){
  let row = (typeof ROW_CACHE !== 'undefined' && ROW_CACHE.get(id)) || null;
  if(!row && typeof ensureChunk === 'function' && typeof chunkIndexFor === 'function'){
    try{
      const ch = await ensureChunk(chunkIndexFor(id));
      row = ch && ch[String(id)] ? ch[String(id)] : null;
    }catch(_){}
  }
  return row ? (typeof keepEntries === 'function' ? keepEntries(row.traits) : Object.entries(row.traits||{})) : [];
}
// Returns the `count` rarest traits this token has, each as {tn, tv, pct}.
async function getTopRareTraits(id, count){
  const traits = await getRowTraitsFor(id);
  const tot = (typeof TOKEN_COUNT !== 'undefined' && TOKEN_COUNT) || 10000;
  const freq = (typeof TRAIT_FREQ !== 'undefined' && TRAIT_FREQ) || {};
  return traits.map(([tn, tv]) => {
    const cnt = (freq[tn] && freq[tn][tv]) || tot;
    return { tn, tv, pct: cnt / tot * 100 };
  }).sort((a, b) => a.pct - b.pct).slice(0, count || 3);
}
function rareTraitRowsHtml(rarest){
  return rarest.map(r => {
    const pctStr = r.pct < 1 ? r.pct.toFixed(2) + '%' : r.pct.toFixed(1) + '%';
    const col = r.pct < 5 ? '#2dd4bf' : '#a8b3c9';
    const fw = r.pct < 5 ? '700' : '400';
    return `<div class="mp-trait-row"><span style="color:#6b7a99">${r.tn}: </span><span style="color:${col};font-weight:${fw}">${r.tv}</span> <span style="color:#6b7a99;font-size:9.5px">${pctStr}</span></div>`;
  }).join('');
}
function vsFloorBadgeHtml(saleEth, floorEth){
  if(!(saleEth > 0) || !(floorEth > 0)) return '';
  const diffPct = ((saleEth - floorEth) / floorEth) * 100;
  const isAbove = diffPct >= 0;
  const label = isAbove ? `+${diffPct.toFixed(0)}% vs floor` : `${diffPct.toFixed(0)}% vs floor`;
  const cls = isAbove ? 'vs-floor-badge above' : 'vs-floor-badge below';
  return `<span class="${cls}">${label}</span>`;
}

// Mispriced filters
let _mispricedAllScored = [];

function applyMispricedFilters(){
  const grid = document.getElementById('mispricedGrid');
  const summaryRow = document.getElementById('mispricedSummaryRow');
  if(!grid || !_mispricedAllScored.length) return;

  const maxPrice = parseFloat(document.getElementById('mpMaxPrice')?.value)||Infinity;
  const maxRank = parseInt(document.getElementById('mpMaxRank')?.value)||Infinity;
  const sort = document.getElementById('mpSort')?.value||'score';

  const rankMap =
    (typeof RARITY_MODE !== 'undefined' &&
     RARITY_MODE === 'theoretical' &&
     typeof RARITY_THEO_RANK !== 'undefined' &&
     RARITY_THEO_RANK.size)
      ? RARITY_THEO_RANK
      : (typeof RARITY_OBS_RANK !== 'undefined' ? RARITY_OBS_RANK : new Map());

  let filtered = _mispricedAllScored.filter(x=>{
    const rank = rankMap.get(x.id)||99999;
    return (x.price_eth||0) <= maxPrice && rank <= maxRank;
  });

  if(sort==='price-asc') filtered.sort((a,b)=>(a.price_eth||0)-(b.price_eth||0));
  else if(sort==='rank-asc') filtered.sort((a,b)=>(rankMap.get(a.id)||99999)-(rankMap.get(b.id)||99999));
  else filtered.sort((a,b)=>a.score-b.score);

  if(summaryRow && filtered.length){
    summaryRow.style.display='flex';
    const totalDiscount = filtered.reduce((s,x)=>{
      const floor=parseFloat(document.getElementById('floorPillValue')?.textContent?.replace(/[^0-9.]/g,'')||'0')||0;
      return s + Math.max(0, floor - (x.price_eth||0));
    },0);
    const best = filtered[0];
    const bestRank = rankMap.get(best?.id)||'?';
    summaryRow.innerHTML = `
      <div class="mp-summary-cell"><span>Showing</span><b>${filtered.length}</b></div>
      <div class="mp-summary-cell"><span>Best Rank</span><b>#${bestRank}</b></div>
      <div class="mp-summary-cell"><span>Lowest Price</span><b>Ξ${(Math.min(...filtered.map(x=>x.price_eth||Infinity))).toFixed(4)}</b></div>
    `;
  } else if(summaryRow){
    summaryRow.style.display='none';
  }

  const allCards = grid.querySelectorAll('.mispriced-card');
  const cardMap = {};
  allCards.forEach(c=>{ cardMap[c.dataset.id]=c; });

  grid.innerHTML='';
  const frag = document.createDocumentFragment();

  filtered.slice(0,50).forEach(x=>{
    const c = cardMap[x.id];
    if(c) frag.appendChild(c);
  });

  grid.appendChild(frag);
}