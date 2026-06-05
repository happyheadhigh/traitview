/* TraitView rank, view, and sort helpers.
   Loaded before app.js.
   Keep this as a classic script, not an ES module. */

const RANK_PREF_KEY = '_rankSystem'; // 'os' (default) or 'tv'

function getRankSystem(){ return localStorage.getItem(RANK_PREF_KEY) || 'os'; }
function setRankSystem(v){ localStorage.setItem(RANK_PREF_KEY, v); }
function getActiveRankMap(){ return getRankSystem() === 'tv' ? RARITY_OBS_RANK : OS_RANK_MAP; }
function getActiveRank(id){ const m = getActiveRankMap(); return m.get(+id) || m.get(String(id)) || null; }

function getRankLabel(id, system){
  const sys = system || getRankSystem();
  const map = sys === 'tv' ? RARITY_OBS_RANK : OS_RANK_MAP;
  return map.get(+id) || map.get(String(id)) || null;
}

/* --- View & Sort state (remembered) --- */
const VIEW_KEY = 'viewMode';
const SORT_KEY = 'sortMode';

function applyViewMode(val){
  const tg = document.getElementById('tokenGrid');
  tg.classList.toggle('compact', val === 'compact');
  tg.classList.toggle('list', val === 'list');
  tg.classList.toggle('view-2x2', val === 'standard');
  tg.classList.toggle('view-5x5', val === 'grid5');

  if(val === 'compact' || val === 'standard' || val === 'grid5'){
    const mobileGrid = window.innerWidth <= 900;
    tg.querySelectorAll('.token').forEach(card => {
      card.style.cssText = mobileGrid
        ? 'display:block!important;position:relative!important;padding:0 0 100% 0!important;height:0!important;min-height:0!important;overflow:visible!important'
        : 'display:block!important;padding:0!important;min-height:0!important;position:relative!important';

      const pb = card.querySelector('.pinbar');
      if(pb) pb.style.display = 'none';

      const tm = card.querySelector('.tmeta');
      if(tm) tm.style.display = 'none';

      const th = card.querySelector('.thumb');
      if(th) th.style.cssText = mobileGrid
        ? 'position:absolute!important;inset:0!important;width:100%!important;height:100%!important;display:flex!important;align-items:center!important;justify-content:center!important;overflow:hidden!important;border-radius:10px!important'
        : 'width:100%!important;height:auto!important;aspect-ratio:1/1!important;position:relative!important;display:flex!important;align-items:center!important;justify-content:center!important;overflow:hidden!important;border-radius:10px!important';

      const id = +card.dataset.id;
      const listing = window.LISTINGS?.[id]?.opensea;
      if(listing && listing.price_eth != null){
        let badge = card.querySelector('.compact-price-badge');
        if(!badge){
          badge = document.createElement('div');
          badge.className = 'compact-price-badge';
          badge.style.cssText = 'position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,.80);color:#2dd4bf;font-size:9px;font-weight:700;padding:2px 5px;border-radius:4px;pointer-events:none;font-family:Space Grotesk,sans-serif;line-height:1.3;z-index:10';
          card.appendChild(badge);
        }
        const eth = listing.price_eth >= 1 ? listing.price_eth.toFixed(3) : listing.price_eth.toFixed(4);
        badge.textContent = 'Ξ ' + eth;
      }
    });
  } else if(val === 'list'){
    tg.querySelectorAll('.token').forEach(card => {
      card.style.cssText = '';
      const pb = card.querySelector('.pinbar');
      if(pb) pb.style.display = 'none';
      const tm = card.querySelector('.tmeta');
      if(tm) tm.style.cssText = '';
      const th = card.querySelector('.thumb');
      if(th) th.style.cssText = '';
      card.querySelectorAll('.compact-price-badge').forEach(b => b.remove());
    });
  } else {
    tg.querySelectorAll('.token').forEach(card => {
      card.style.cssText = '';
      const pb = card.querySelector('.pinbar');
      if(pb) pb.style.display = '';
      const tm = card.querySelector('.tmeta');
      if(tm) tm.style.display = '';
      const th = card.querySelector('.thumb');
      if(th) th.style.cssText = '';
      card.querySelectorAll('.compact-price-badge').forEach(b => b.remove());
    });
  }
}

function getRankMapForSort(){ 
  if (RARITY_MODE === 'theoretical' && RARITY_THEO_RANK && RARITY_THEO_RANK.size) return RARITY_THEO_RANK;
  return RARITY_OBS_RANK;
}

function getListingEth(id){
  const ent = window.LISTINGS?.[id]?.opensea;
  if(!ent) return null;
  if(ent.price_eth != null) return Number(ent.price_eth);
  return parseEthMaybeWei(ent.price);
}

function getPriceSorted(ids, asc){
  return ids.slice().sort((a,b)=>{
    const pa = getListingEth(a);
    const pb = getListingEth(b);
    if(pa === null && pb === null) return a - b;
    if(pa === null) return 1;
    if(pb === null) return -1;
    return asc ? pa - pb : pb - pa;
  });
}

function sortTokenIds(ids, forceMode){
  const mode = forceMode || document.getElementById('sortMode')?.value || (localStorage.getItem(SORT_KEY) || 'id-asc');

  if (mode === 'id-asc'){
    ids.sort((a,b)=>a-b);
  } else if (mode === 'rare-first'){
    const map = getRankMapForSort();
    ids.sort((a,b)=>{
      const ra = map.get(a) ?? 1e9, rb = map.get(b) ?? 1e9;
      if (ra !== rb) return ra - rb;
      return a - b;
    });
  } else if (mode === 'rare-last'){
    const map = getRankMapForSort();
    ids.sort((a,b)=>{
      const ra = map.get(a) ?? -1, rb = map.get(b) ?? -1;
      if (ra !== rb) return rb - ra;
      return a - b;
    });
  } else if (mode === 'price-asc'){
    const sorted = getPriceSorted(ids, true);
    ids.splice(0, ids.length, ...sorted);
  } else if (mode === 'price-desc'){
    const sorted = getPriceSorted(ids, false);
    ids.splice(0, ids.length, ...sorted);
  }
}