/* TraitView list/card rendering helpers.
   Loaded before app.js.
   Keep this as a classic script, not an ES module. */

 function listStatsRowHtml(id, rank, priceStr){
  const timeListed = getTimeListedText(id);
  const lastSale   = getLastSaleText(id);
  const row        = ROW_CACHE.get(id);
  const traitCount = row ? getTraitCount(row) : null;

  // Rank tier color
  const rankCls = !rank ? '' : rank<=100 ? 'gold' : rank<=1000 ? 'purple' : rank<=5000 ? 'green' : '';

  // Price vs floor
  let vsFloorHtml = '—';
  let vsFloorCls  = 'muted';
  if(priceStr && window._lastFloorEth){
    const priceEth = getListingEth(id);
    if(priceEth != null){
      const pct = ((priceEth - window._lastFloorEth) / window._lastFloorEth) * 100;
      const sign = pct >= 0 ? '+' : '';
      vsFloorHtml = sign + pct.toFixed(1) + '%';
      vsFloorCls  = pct <= 0 ? 'green' : pct <= 20 ? '' : 'red';
    }
  }

  // Last sale age
  const saleCache = LAST_SALE_CACHE.get(id);
  const saleAge   = saleCache?.sale_ts ? formatRelativeAgeFromTs(saleCache.sale_ts) : '—';

  // Rarity score (compute inline from TRAIT_FREQ if available)
  let scoreHtml = '—', scoreCls = 'muted';
  if(row && Object.keys(TRAIT_FREQ||{}).length){
    let s = 0;
    for(const [k,v] of keepEntries(row.traits)){
      const cnt = (TRAIT_FREQ[k]?.[v]) || 1;
      s += -Math.log(Math.max(cnt/(TOKEN_COUNT||10000), 1e-12));
    }
    scoreHtml = s.toFixed(2);
    scoreCls  = s > 30 ? 'gold' : s > 20 ? 'purple' : s > 10 ? 'green' : '';
  }

  return `<div class="vs-datarow">` +
    `<div class="vs-cell"><div class="vs-label">Rank</div><div class="vs-val ${rankCls}">${rank ? '★'+rank.toLocaleString() : '—'}</div></div>` +
    `<div class="vs-cell"><div class="vs-label">Listed</div><div class="vs-val ${priceStr?'green':'muted'}">${priceStr ? 'Ξ '+priceStr : '—'}</div></div>` +
    `<div class="vs-cell"><div class="vs-label">vs Floor</div><div class="vs-val ${vsFloorCls}">${vsFloorHtml}</div></div>` +
    `<div class="vs-cell"><div class="vs-label">Last Sale</div><div class="vs-val ${lastSale==='—'?'muted':'green'}" data-last-sale-id="${id}">${lastSale}</div></div>` +
    `<div class="vs-cell"><div class="vs-label">Sold Ago</div><div class="vs-val muted" data-sold-ago-id="${id}">${saleAge}</div></div>` +
    `<div class="vs-cell"><div class="vs-label">Listed Ago</div><div class="vs-val ${timeListed==='—'?'muted':''}" data-time-listed-id="${id}">${timeListed}</div></div>` +
    `<div class="vs-cell"><div class="vs-label">Score</div><div class="vs-val ${scoreCls}">${scoreHtml}</div></div>` +
    `<div class="vs-cell"><div class="vs-label">Traits</div><div class="vs-val">${traitCount != null ? traitCount : '—'}</div></div>` +
    `<div class="vs-cell"><div class="vs-label">Owner</div><div class="vs-val muted" data-owner-id="${id}">…</div></div>` +
    `</div>`;
}