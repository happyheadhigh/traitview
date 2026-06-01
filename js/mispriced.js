/* TraitView mispriced listing helpers.
   Loaded before app.js.
   Keep this as a classic script, not an ES module. */

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
      <div class="mp-summary-pill"><span>Showing</span><b>${filtered.length}</b></div>
      <div class="mp-summary-pill"><span>Best Rank</span><b>#${bestRank}</b></div>
      <div class="mp-summary-pill"><span>Lowest Price</span><b>Ξ${(Math.min(...filtered.map(x=>x.price_eth||Infinity))).toFixed(4)}</b></div>
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