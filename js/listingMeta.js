function formatRelativeAgeFromTs(ts){
  const num = Number(ts);
  if(!isFinite(num) || num <= 0) return '—';
  const ms = num > 1e12 ? num : num * 1000;
  const delta = Math.max(0, Date.now() - ms);
  const min = 60 * 1000, hour = 60 * min, day = 24 * hour;
  if(delta < hour) return Math.max(1, Math.floor(delta / min)) + 'm';
  if(delta < day) return Math.floor(delta / hour) + 'h';
  const days = Math.floor(delta / day);
  if(days < 30) return days + 'd';
  const months = Math.floor(days / 30);
  if(months < 12) return months + 'mo';
  return Math.floor(days / 365) + 'y';
}
function extractListedTs(id){
  const ent = window.LISTINGS?.[id]?.opensea || window.LISTINGS?.[id] || null;
  if(!ent) return null;
  const candidates = [
    ent.listed_at, ent.listedAt, ent.time_listed, ent.timeListed,
    ent.created_at, ent.createdAt, ent.posted_at, ent.postedAt,
    ent.event_timestamp, ent.timestamp, ent.ts
  ];
  for(const c of candidates){
    if(c == null || c === '') continue;
    if(typeof c === 'string'){
      const parsed = Date.parse(c);
      if(Number.isFinite(parsed)) return parsed;
      const asNum = Number(c);
      if(Number.isFinite(asNum) && asNum > 0) return asNum > 1e12 ? asNum : asNum * 1000;
    }else if(typeof c === 'number' && c > 0){
      return c > 1e12 ? c : c * 1000;
    }
  }
  return null;
}
function getTimeListedText(id){
  const ts = extractListedTs(id);
  return ts ? formatRelativeAgeFromTs(ts) : '—';
}
function getLastSaleText(id){
  const cached = LAST_SALE_CACHE.get(id);
  if(cached && cached.price_eth != null){
    const n = Number(cached.price_eth);
    if(Number.isFinite(n) && n > 0){
      const sym = String(cached.currency || 'ETH').toUpperCase() === 'WETH' ? 'WETH' : 'ETH';
      return 'Ξ ' + (n >= 1 ? n.toFixed(3) : n.toFixed(4)) + ' ' + sym;
    }
  }
  return '—';
}
function hydrateListMetaForId(id){
  if(LAST_SALE_CACHE.has(id) || LAST_SALE_PENDING.has(id)) return;
  LAST_SALE_PENDING.add(id);
  dbFetch('/db/token-sales', { token_id: id, limit: 1 }).then(data => {
    const sale = data?.sales?.[0] || null;
    if(sale && sale.price_eth != null){
      LAST_SALE_CACHE.set(id, {
        price_eth: Number(sale.price_eth),
        sale_ts: sale.sale_ts || null,
        currency: String(sale.currency || 'ETH').toUpperCase() === 'WETH' ? 'WETH' : 'ETH'
      });
    } else {
      LAST_SALE_CACHE.set(id, { price_eth: null, sale_ts: null, currency: null });
    }
    document.querySelectorAll(`[data-last-sale-id="${id}"]`).forEach(el => {
      el.textContent = getLastSaleText(id);
      el.classList.toggle('muted', el.textContent === '—');
      if(el.textContent !== '—') el.classList.add('green');
    });
    // Update Sold Ago now that we have sale_ts
    const saleCache = LAST_SALE_CACHE.get(id);
    const saleAge = saleCache?.sale_ts ? formatRelativeAgeFromTs(saleCache.sale_ts) : '—';
    document.querySelectorAll(`[data-sold-ago-id="${id}"]`).forEach(el => {
      el.textContent = saleAge;
      el.classList.toggle('muted', saleAge === '—');
    });
    // Update Listed Ago now that LISTINGS may be populated
    const listedAge = getTimeListedText(id);
    document.querySelectorAll(`[data-time-listed-id="${id}"]`).forEach(el => {
      el.textContent = listedAge;
      el.classList.toggle('muted', listedAge === '—');
    });
  }).catch(() => {
    LAST_SALE_CACHE.set(id, { price_eth: null, sale_ts: null, currency: null });
    document.querySelectorAll(`[data-last-sale-id="${id}"]`).forEach(el => {
      el.textContent = '—';
      el.classList.add('muted');
    });
    document.querySelectorAll(`[data-sold-ago-id="${id}"]`).forEach(el => {
      el.textContent = '—';
      el.classList.add('muted');
    });
  }).finally(() => LAST_SALE_PENDING.delete(id));
}